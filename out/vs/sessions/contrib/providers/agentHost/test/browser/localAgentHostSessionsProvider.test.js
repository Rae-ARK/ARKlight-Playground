import assert from "assert";
import { DeferredPromise, raceTimeout, timeout } from "../../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore, ImmortalReference, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentHostCodexAgentEnabledSettingId, AgentSession, ClaudePreferAgentHostAgentsSettingId, ClaudePreferAgentHostEditorSettingId, IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageKind, SessionLifecycle } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChangesetStatus, SessionStatus as ProtocolSessionStatus, withSessionGitState, withSessionWorkspaceless } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ActionType, NotificationType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService, IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatWidgetService } from "../../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService, isIChatSessionFileChange2 } from "../../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatModeKind } from "../../../../../../workbench/contrib/chat/common/constants.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { ChatInteractivity, ChatOriginKind, getChatCapabilities, SessionStatus } from "../../../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../../../services/sessions/browser/sessionsService.js";
import { IAgentHostActiveClientService } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { LocalAgentHostSessionsProvider } from "../../browser/localAgentHostSessionsProvider.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IGitHubService } from "../../../../github/browser/githubService.js";
import { IPullRequestIconCache, PullRequestIconCache } from "../../../../github/browser/pullRequestIconCache.js";
import { computePullRequestIcon, GitHubPullRequestState } from "../../../../github/common/types.js";
import { IWorkbenchEnvironmentService } from "../../../../../../workbench/services/environment/common/environmentService.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = "sessions.agentHost.sessionConfigPicker.selectedValues";
class MockAgentHostService extends mock() {
  constructor() {
    super();
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this._rootStateListenerCount = 0;
    this._onDidRootStateChange = new Emitter({
      onDidAddListener: () => this._rootStateListenerCount++,
      onWillRemoveListener: () => this._rootStateListenerCount--
    });
    this._onDidRootStateError = new Emitter();
    this._rootStateValue = { agents: [{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }] };
    this.clientId = "test-local-client";
    this._sessions = /* @__PURE__ */ new Map();
    this.disposedSessions = [];
    this.dispatchedActions = [];
    this.failResolveSessionConfig = false;
    this.resolveSessionConfigResult = { schema: { type: "object", properties: {} }, values: { isolation: "worktree" } };
    this.resolveSessionConfigRequests = [];
    this._authenticationPending = observableValue("authenticationPending", false);
    this.authenticationPending = this._authenticationPending;
    this._nextSeq = 0;
    /**
     * Number of upcoming `listSessions()` calls that should reject, used to
     * simulate the agent throwing `AHP_AUTH_REQUIRED` (or a transient offline
     * error) before its token is effective server-side. Decremented per call.
     */
    this.failListSessionsCount = 0;
    this.listSessionsCallCount = 0;
    this.disposedChats = [];
    this.createdChats = [];
    this.createdSessionUris = [];
    this.createSessionConfigs = [];
    /**
     * Ordered log of wire-level operations: useful for asserting that
     * `createSession` strictly precedes `subscribe` for a given session URI.
     * Each entry is `${op}:${uri}`.
     */
    this.wireOps = [];
    // ---- Session-state subscriptions ---------------------------------------
    this._sessionStateEmitters = /* @__PURE__ */ new Map();
    this._sessionStateValues = /* @__PURE__ */ new Map();
    this.sessionSubscribeCounts = /* @__PURE__ */ new Map();
    this.sessionUnsubscribeCounts = /* @__PURE__ */ new Map();
    const self = this;
    this.rootState = {
      get value() {
        return self._rootStateValue;
      },
      get verifiedValue() {
        return self._rootStateValue instanceof Error ? void 0 : self._rootStateValue;
      },
      onDidChange: self._onDidRootStateChange.event,
      onDidError: self._onDidRootStateError.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
  }
  get rootStateListenerCount() {
    return this._rootStateListenerCount;
  }
  setAuthenticationPending(pending) {
    this._authenticationPending.set(pending, void 0);
  }
  nextClientSeq() {
    return this._nextSeq++;
  }
  async listSessions() {
    this.listSessionsCallCount++;
    if (this.failListSessionsCount > 0) {
      this.failListSessionsCount--;
      throw new Error("AHP_AUTH_REQUIRED");
    }
    return [...this._sessions.values()];
  }
  async disposeSession(session) {
    this.disposedSessions.push(session);
    const rawId = AgentSession.id(session);
    this._sessions.delete(rawId);
  }
  async disposeChat(chat) {
    this.disposedChats.push(chat);
  }
  async createChat(session, chat, options) {
    this.createdChats.push({ session, chat, options });
    const key = session.toString();
    const existing = this._sessionStateValues.get(key);
    if (existing && Array.isArray(existing.chats)) {
      const newChat = {
        resource: chat.toString(),
        title: options?.title ?? "",
        status: ProtocolSessionStatus.Idle,
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString()
      };
      this.setSessionState(AgentSession.id(session), AgentSession.provider(session), {
        ...existing,
        chats: [...existing.chats, newChat]
      });
    }
  }
  async createSession(config) {
    const uri = config?.session ?? URI.parse("copilotcli:///auto-" + this._nextSeq);
    this.createSessionConfigs.push({ config: config?.config, workingDirectory: config?.workingDirectories?.[0] });
    this.wireOps.push(`createSession:${uri.toString()}`);
    this.createdSessionUris.push(uri);
    const hook = this.onCreateSession;
    this.onCreateSession = void 0;
    if (hook) {
      await hook(uri);
    }
    return uri;
  }
  async resolveSessionConfig(request) {
    this.resolveSessionConfigRequests.push(request);
    await this.resolveSessionConfigBarrier?.p;
    await Promise.resolve();
    if (this.failResolveSessionConfig) {
      throw new Error("resolveSessionConfig unavailable");
    }
    return this.resolveSessionConfigResult;
  }
  dispatchAction(channel, action, clientId, clientSeq) {
    this.dispatchedActions.push({ channel, action, clientId, clientSeq });
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action, clientId: this.clientId, clientSeq: this._nextSeq++ });
  }
  // Test helpers
  addSession(meta) {
    this._sessions.set(AgentSession.id(meta.session), meta);
  }
  /**
   * Drop a session from what `listSessions()` reports, without going through
   * `disposeSession`. Simulates an agent that cannot enumerate its sessions
   * yet (auth token or SDK still loading) and so contributes nothing to the
   * host's aggregated listing.
   */
  stopListingSessions(...ids) {
    for (const id of ids) {
      this._sessions.delete(id);
    }
  }
  getSubscription(_kind, resource) {
    const key = resource.toString();
    this.wireOps.push(`subscribe:${key}`);
    this.sessionSubscribeCounts.set(key, (this.sessionSubscribeCounts.get(key) ?? 0) + 1);
    let emitter = this._sessionStateEmitters.get(key);
    if (!emitter) {
      emitter = new Emitter();
      this._sessionStateEmitters.set(key, emitter);
    }
    const self = this;
    const sub = {
      get value() {
        return self._sessionStateValues.get(key);
      },
      get verifiedValue() {
        return self._sessionStateValues.get(key);
      },
      onDidChange: emitter.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    return {
      object: sub,
      dispose: () => {
        this.sessionUnsubscribeCounts.set(key, (this.sessionUnsubscribeCounts.get(key) ?? 0) + 1);
      }
    };
  }
  setSessionState(rawId, provider, state) {
    const key = AgentSession.uri(provider, rawId).toString();
    this._sessionStateValues.set(key, state);
    this._sessionStateEmitters.get(key)?.fire(state);
  }
  setChangesetState(changesetUri, state) {
    this._sessionStateValues.set(changesetUri, state);
    this._sessionStateEmitters.get(changesetUri)?.fire(state);
  }
  setChatState(chatUri, state) {
    this._sessionStateValues.set(chatUri, state);
    this._sessionStateEmitters.get(chatUri)?.fire(state);
  }
  setAgents(agents) {
    this._rootStateValue = { agents };
    this._onDidRootStateChange.fire(this._rootStateValue);
  }
  /**
   * Fires a root state change that preserves the current `agents` reference,
   * simulating non-agent root deltas (e.g. `RootActiveSessionsChanged` on
   * every turn start/complete) that the real reducer emits without
   * replacing the `agents` slice.
   */
  fireNonAgentRootStateChange() {
    if (!this._rootStateValue || this._rootStateValue instanceof Error) {
      throw new Error("rootState not initialized; call setAgents first");
    }
    this._rootStateValue = { ...this._rootStateValue };
    this._onDidRootStateChange.fire(this._rootStateValue);
  }
  clearRootState() {
    this._rootStateValue = void 0;
  }
  setRootStateError() {
    const error = new Error("root state failed");
    this._rootStateValue = error;
    this._onDidRootStateError.fire(error);
  }
  fireNotification(n) {
    this._onDidNotification.fire(n);
  }
  fireAction(envelope) {
    this._onDidAction.fire(envelope);
  }
  dispose() {
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
    this._onDidRootStateChange.dispose();
    for (const emitter of this._sessionStateEmitters.values()) {
      emitter.dispose();
    }
    this._sessionStateEmitters.clear();
  }
}
function createSession(id, opts) {
  return {
    session: AgentSession.uri(opts?.provider ?? "copilotcli", id),
    startTime: opts?.startTime ?? 1e3,
    modifiedTime: opts?.modifiedTime ?? 2e3,
    summary: opts?.summary,
    project: opts?.project,
    workingDirectories: opts?.workingDirectory ? [opts?.workingDirectory] : void 0,
    _meta: opts?.quickChat ? withSessionWorkspaceless(void 0, true) : void 0
  };
}
function createPolicyRestrictedConfigurationService() {
  return new class extends TestConfigurationService {
    inspect(key) {
      const base = super.inspect(key);
      if (key === "chat.tools.global.autoApprove") {
        return { ...base, policyValue: false };
      }
      return base;
    }
  }();
}
function createSchemaDefaultConfigurationService() {
  return new class extends TestConfigurationService {
    inspect(key) {
      const base = super.inspect(key);
      if (key === "chat.defaultConfiguration" && base.userValue === void 0) {
        const schemaDefault = { mode: "interactive", approvals: "default" };
        return { ...base, value: schemaDefault, defaultValue: schemaDefault };
      }
      return base;
    }
  }();
}
function createProvider(disposables, agentHostService, contributions = [
  { type: "agent-host-copilotcli", name: "copilot", displayName: "Copilot", description: "test", icon: void 0 }
], options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IAgentHostService, agentHostService);
  const configurationService = options?.configurationService ?? new TestConfigurationService();
  instantiationService.stub(IConfigurationService, configurationService);
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(options?.agentHostEnabled ?? true) });
  instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock() {
    isWorkspaceTrusted() {
      return options?.workspaceTrusted ?? true;
    }
    async getUriTrustInfo(uri) {
      return { uri, trusted: options?.workspaceTrusted ?? true };
    }
  }());
  instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: options?.isSessionsWindow ?? true });
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: options?.confirmDelete ?? true }) });
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: (chatSessionType) => contributions.find((c) => c.type === chatSessionType),
    getAllChatSessionContributions: () => contributions,
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } })
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: options?.acquireOrLoadSession ?? (async () => void 0),
    sendRequest: options?.sendRequest ?? (async () => ({ kind: "sent", data: {} }))
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => options?.openSession ? new class extends mock() {
    }() : void 0
  });
  instantiationService.stub(ILanguageModelsService, {
    getLanguageModelIds: () => options?.languageModelIds ?? [],
    lookupLanguageModel: options?.lookupLanguageModel ?? (() => void 0),
    hasResolvedVendor: () => true
  });
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IStorageService, options?.storageService ?? disposables.add(new InMemoryStorageService()));
  instantiationService.stub(IProgressService, {});
  instantiationService.stub(IGitHubService, options?.gitHubService ?? new class extends mock() {
    constructor() {
      super(...arguments);
      this.findPullRequestNumberByHeadBranch = async () => void 0;
    }
  }());
  instantiationService.stub(IPullRequestIconCache, instantiationService.createInstance(PullRequestIconCache));
  const activeSessionObs = options?.activeSession ?? constObservable(void 0);
  const visibleSessionsObs = options?.visibleSessions ?? constObservable([]);
  instantiationService.stub(ISessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = activeSessionObs;
      this.visibleSessions = visibleSessionsObs;
    }
  }());
  instantiationService.stub(IAgentHostActiveClientService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.getActiveClient = (_sessionType, clientId) => ({ clientId, ...options?.activeClient ?? { tools: [], customizations: [] } });
    }
  }());
  return disposables.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
}
function createTestLanguageModel(id) {
  return {
    extension: new ExtensionIdentifier("test.agentHost"),
    id,
    vendor: "agent-host-copilotcli",
    name: id,
    version: "1.0",
    family: id,
    maxInputTokens: 1,
    maxOutputTokens: 1,
    isDefaultForLocation: {}
  };
}
async function waitForSessionConfig(provider, sessionId, predicate) {
  if (predicate(provider.getSessionConfig(sessionId))) {
    return;
  }
  await new Promise((resolve) => {
    const disposable = provider.onDidChangeSessionConfig((changedSessionId) => {
      if (changedSessionId === sessionId && predicate(provider.getSessionConfig(sessionId))) {
        disposable.dispose();
        resolve();
      }
    });
  });
}
function fireSessionAdded(agentHost, rawId, opts) {
  const provider = opts?.provider ?? "copilotcli";
  const sessionUri = AgentSession.uri(provider, rawId);
  agentHost.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionAdded,
    summary: {
      resource: sessionUri.toString(),
      provider,
      title: opts?.title ?? `Session ${rawId}`,
      status: ProtocolSessionStatus.Idle,
      createdAt: opts?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: opts?.modifiedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      project: opts?.project,
      workingDirectories: opts?.workingDirectory ? [opts.workingDirectory] : void 0,
      changes: opts?.changes,
      ...opts?.workspaceless ? { _meta: withSessionWorkspaceless(void 0, true) } : {}
    }
  });
}
function fireSessionMetaChanged(agentHost, rawId, meta, provider = "copilotcli") {
  agentHost.fireAction({
    channel: AgentSession.uri(provider, rawId).toString(),
    action: {
      type: ActionType.SessionMetaChanged,
      _meta: meta
    },
    serverSeq: 1,
    origin: void 0
  });
}
function fireSessionRemoved(agentHost, rawId, provider = "copilotcli") {
  const sessionUri = AgentSession.uri(provider, rawId);
  agentHost.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionRemoved,
    session: sessionUri.toString()
  });
}
function fireSessionSummaryChanged(agentHost, rawId, changes, provider = "copilotcli") {
  const sessionUri = AgentSession.uri(provider, rawId);
  agentHost.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionSummaryChanged,
    session: sessionUri.toString(),
    changes
  });
}
async function persistCachedSessions(disposables, storageService, sessions) {
  const host = new MockAgentHostService();
  disposables.add(toDisposable(() => host.dispose()));
  for (const session of sessions) {
    host.addSession(session);
  }
  createProvider(disposables, host, void 0, { storageService });
  await timeout(0);
  await storageService.flush();
}
suite("LocalAgentHostSessionsProvider", () => {
  const disposables = new DisposableStore();
  let agentHost;
  setup(() => {
    agentHost = new MockAgentHostService();
    disposables.add(toDisposable(() => agentHost.dispose()));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("has correct id, label, and sessionType from rootState agents", () => {
    const provider = createProvider(disposables, agentHost);
    assert.strictEqual(provider.id, "local-agent-host");
    assert.ok(provider.label.length > 0);
    assert.strictEqual(provider.sessionTypes.length, 1);
    assert.strictEqual(provider.sessionTypes[0].id, "copilotcli");
    assert.strictEqual(provider.sessionTypes[0].label, "Copilot");
  });
  test("session types update when the local host advertises additional agents", () => {
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => ({ id: t.id, label: t.label })), [
      { id: "copilotcli", label: "Copilot" }
    ]);
    let changes = 0;
    disposables.add(provider.onDidChangeSessionTypes(() => changes++));
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] }
    ]);
    assert.strictEqual(changes, 1);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => ({ id: t.id, label: t.label })), [
      { id: "copilotcli", label: "Copilot" },
      { id: "openai", label: "OpenAI" }
    ]);
  });
  test("shares the root-state listener across session adapters", () => {
    agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: {} }]);
    const provider = createProvider(disposables, agentHost);
    const listenerCountBeforeSessions = agentHost.rootStateListenerCount;
    for (let i = 0; i < 200; i++) {
      fireSessionAdded(agentHost, `listener-${i}`);
    }
    const listenerCountAfterSessions = agentHost.rootStateListenerCount;
    agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }]);
    const supportsMultipleChatsAfterHydration = provider.getSessions()[0].capabilities.get().supportsMultipleChats;
    agentHost.setRootStateError();
    assert.deepStrictEqual({
      listenerCountBeforeSessions,
      listenerCountAfterSessions,
      sessionCount: provider.getSessions().length,
      supportsMultipleChatsAfterHydration,
      supportsMultipleChatsAfterError: provider.getSessions()[0].capabilities.get().supportsMultipleChats
    }, {
      listenerCountBeforeSessions: 1,
      listenerCountAfterSessions: 1,
      sessionCount: 200,
      supportsMultipleChatsAfterHydration: true,
      supportsMultipleChatsAfterError: false
    });
  });
  test("reports no session types before rootState hydrates", () => {
    agentHost.clearRootState();
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes, []);
  });
  test("reports no session types when rootState advertises no agents", () => {
    agentHost.setAgents([]);
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes, []);
  });
  test("reports no session types after rootState resolves to an error", () => {
    agentHost.clearRootState();
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes, []);
    agentHost.setRootStateError();
    assert.deepStrictEqual(provider.sessionTypes, []);
  });
  test("session type icons use per-agent codicons", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude-code", displayName: "Claude", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] },
      { provider: "unknown-agent", displayName: "Unknown", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(
      provider.sessionTypes.map((t) => ({ id: t.id, icon: t.icon.id })),
      [
        { id: "copilotcli", icon: "copilot" },
        { id: "claude-code", icon: "claude" },
        { id: "openai", icon: "openai" },
        { id: "unknown-agent", icon: "vm" }
      ]
    );
  });
  function fireConfigChange(configService, settingId) {
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([settingId]),
      change: { keys: [settingId], overrides: [] },
      affectsConfiguration: (key) => key === settingId
    });
  }
  test("hides agent-host Claude when the Agents window prefers extension-host Claude", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli"]);
  });
  test("shows agent-host Claude when the Agents window prefers agent-host Claude", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli", "claude"]);
  });
  test("gates agent-host Codex in the Agents window on the provider enablement setting", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "codex", displayName: "Codex", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, false);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli"]);
    let sessionTypesChanged = false;
    disposables.add(provider.onDidChangeSessionTypes(() => {
      sessionTypesChanged = true;
    }));
    configService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
    fireConfigChange(configService, AgentHostCodexAgentEnabledSettingId);
    assert.deepStrictEqual({
      sessionTypesChanged,
      sessionTypes: provider.sessionTypes.map((t) => t.id)
    }, {
      sessionTypesChanged: true,
      sessionTypes: ["copilotcli", "codex"]
    });
  });
  test("gates agent-host Claude on the editor-window setting outside the Agents window", () => {
    agentHost.setAgents([
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostEditorSettingId, true);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: false });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["claude"]);
  });
  test("adds agent-host Claude live when preferAgentHost flips on", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli"]);
    let fired = false;
    disposables.add(provider.onDidChangeSessionTypes(() => {
      fired = true;
    }));
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
    fireConfigChange(configService, ClaudePreferAgentHostAgentsSettingId);
    assert.ok(fired, "onDidChangeSessionTypes should fire when the gate flips");
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli", "claude"]);
  });
  test("getSessions hides agent-host Claude sessions when extension-host Claude is preferred", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    fireSessionAdded(agentHost, "cli-sess", { title: "CLI", provider: "copilotcli" });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude" });
    assert.deepStrictEqual(provider.getSessions().map((s) => s.sessionType), ["copilotcli"]);
  });
  test("getSessions shows agent-host Claude sessions when agent-host Claude is preferred", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    fireSessionAdded(agentHost, "cli-sess", { title: "CLI", provider: "copilotcli" });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude" });
    assert.deepStrictEqual(
      provider.getSessions().map((s) => s.sessionType).sort(),
      ["claude", "copilotcli"]
    );
  });
  test("flipping preferAgentHost reveals agent-host Claude sessions and fires a refresh", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    fireSessionAdded(agentHost, "cli-sess", { title: "CLI", provider: "copilotcli" });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude" });
    assert.deepStrictEqual(provider.getSessions().map((s) => s.sessionType), ["copilotcli"]);
    let fired = false;
    disposables.add(provider.onDidChangeSessions(() => {
      fired = true;
    }));
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
    fireConfigChange(configService, ClaudePreferAgentHostAgentsSettingId);
    assert.ok(fired, "onDidChangeSessions should fire so the open list re-queries");
    assert.deepStrictEqual(
      provider.getSessions().map((s) => s.sessionType).sort(),
      ["claude", "copilotcli"]
    );
  });
  test("flipping preferAgentHost off does not announce hidden sessions as removed", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude" });
    assert.deepStrictEqual(provider.getSessions().map((s) => s.sessionType), ["claude"]);
    const removed = [];
    disposables.add(provider.onDidChangeSessions((e) => removed.push(...e.removed.map((s) => s.sessionType))));
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, false);
    fireConfigChange(configService, ClaudePreferAgentHostAgentsSettingId);
    assert.deepStrictEqual(removed, [], "hidden sessions must not be reported as removed");
    assert.deepStrictEqual(provider.getSessions().map((s) => s.sessionType), []);
  });
  test("session icons match the session type icon", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude-code", displayName: "Claude", description: "", models: [] },
      { provider: "unknown-agent", displayName: "Unknown", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "cli-sess", { title: "CLI", provider: "copilotcli" });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude-code" });
    fireSessionAdded(agentHost, "unknown-sess", { title: "Unknown", provider: "unknown-agent" });
    assert.deepStrictEqual(
      provider.getSessions().map((s) => ({ sessionType: s.sessionType, icon: s.icon.id })).sort((a, b) => a.sessionType.localeCompare(b.sessionType)),
      [
        { sessionType: "claude-code", icon: "claude" },
        { sessionType: "copilotcli", icon: "copilot" },
        { sessionType: "unknown-agent", icon: "vm" }
      ]
    );
  });
  test("resolveWorkspace builds workspace from URI", () => {
    const provider = createProvider(disposables, agentHost);
    const uri = URI.parse("file:///home/user/project");
    const ws = provider.resolveWorkspace(uri);
    assert.ok(ws, "resolveWorkspace should resolve file:// URIs");
    assert.strictEqual(ws.label, "project");
    assert.strictEqual(ws.folders.length, 1);
    assert.strictEqual(ws.folders[0].root.toString(), uri.toString());
    assert.strictEqual(ws.requiresWorkspaceTrust, true);
  });
  test("has no browse actions", () => {
    const provider = createProvider(disposables, agentHost);
    assert.strictEqual(provider.browseActions.length, 0);
  });
  test("onDidChangeSessions fires when session added notification arrives", () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionAdded(agentHost, "notif-1", { title: "Notif Session" });
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].added.length, 1);
    assert.strictEqual(changes[0].added[0].title.get(), "Notif Session");
  });
  test("session removed notification removes from cache", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "to-remove", { title: "Removed" });
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionRemoved(agentHost, "to-remove");
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].removed.length, 1);
  });
  test("identical session added notification is ignored", () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const timestamp = (/* @__PURE__ */ new Date(0)).toISOString();
    fireSessionAdded(agentHost, "dup-sess", { title: "Dup", createdAt: timestamp, modifiedAt: timestamp });
    fireSessionAdded(agentHost, "dup-sess", { title: "Dup", createdAt: timestamp, modifiedAt: timestamp });
    assert.strictEqual(changes.length, 1);
  });
  test("removing non-existent session is no-op", () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionRemoved(agentHost, "does-not-exist");
    assert.strictEqual(changes.length, 0);
  });
  test("session added authoritatively updates a listed session in place", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const originalProject = URI.parse("file:///Users/me/project");
    const originalWorkingDirectory = URI.parse("file:///Users/me/project");
    agentHost.addSession(createSession("worktree-upsert", {
      summary: "Worktree Session",
      project: { uri: originalProject, displayName: "project" },
      workingDirectory: originalWorkingDirectory,
      modifiedTime: 1e3
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const originalWorkspace = session.workspace.get();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const worktreeProject = "file:///Users/me/project.worktrees/session";
    const worktreeWorkingDirectory = "file:///Users/me/project.worktrees/session/src";
    fireSessionAdded(agentHost, "worktree-upsert", {
      title: "Worktree Session",
      project: { uri: worktreeProject, displayName: "project-worktree" },
      workingDirectory: worktreeWorkingDirectory,
      createdAt: (/* @__PURE__ */ new Date(1e3)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(2e3)).toISOString()
    });
    fireSessionSummaryChanged(agentHost, "worktree-upsert", {
      _meta: { git: { branchName: "agents/worktree-session", baseBranchName: "main" } }
    });
    const current = provider.getSessions()[0];
    const currentWorkspace = current.workspace.get();
    assert.deepStrictEqual({
      sameAdapter: current === session,
      originalWorkingDirectory: originalWorkspace.folders[0].workingDirectory.toString(),
      workingDirectory: currentWorkspace.folders[0].workingDirectory.toString(),
      branchName: currentWorkspace.folders[0].gitRepository?.branchName,
      changedEvents: changes.map((change) => change.changed.map((changed) => changed === session))
    }, {
      sameAdapter: true,
      originalWorkingDirectory: originalWorkingDirectory.toString(),
      workingDirectory: worktreeWorkingDirectory,
      branchName: "agents/worktree-session",
      changedEvents: [[true], [true]]
    });
  }));
  test("session metadata changes notify when observable git fields change", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("git-meta", {
      summary: "Git Session",
      project: { uri: URI.parse("file:///Users/me/project"), displayName: "project" }
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const meta = {
      git: {
        branchName: "feature/worktree",
        baseBranchName: "main",
        hasGitHubRemote: true,
        upstreamBranchName: "origin/feature/worktree",
        incomingChanges: 2,
        outgoingChanges: 3,
        uncommittedChanges: 4
      }
    };
    fireSessionMetaChanged(agentHost, "git-meta", meta);
    fireSessionMetaChanged(agentHost, "git-meta", meta);
    const gitRepository = session.workspace.get().folders[0].gitRepository;
    assert.deepStrictEqual({
      branchName: gitRepository.branchName,
      uncommittedChanges: gitRepository.uncommittedChanges,
      changedEvents: changes.map((change) => change.changed.map((changed) => changed === session))
    }, {
      branchName: "feature/worktree",
      uncommittedChanges: 4,
      changedEvents: [[true]]
    });
  }));
  test("getSessions populates from listSessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("list-1", { summary: "First" }));
    agentHost.addSession(createSession("list-2", { summary: "Second" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    provider.getSessions();
    await timeout(0);
    assert.ok(changes.length > 0);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  }));
  test("eagerly populates and fires onDidChangeSessions after construction without a getSessions() call", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("eager-1", { summary: "First" }));
    agentHost.addSession(createSession("eager-2", { summary: "Second" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.deepStrictEqual({
      eventCount: changes.length,
      added: changes[0]?.added.map((s) => s.title.get()).sort(),
      removed: changes[0]?.removed.length,
      changed: changes[0]?.changed.length,
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      added: ["First", "Second"],
      removed: 0,
      changed: 0,
      cachedTitles: ["First", "Second"]
    });
  }));
  test("defers eager session list fetch until authentication settles", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.strictEqual(changes.length, 0, "no event should fire while authentication is pending");
    assert.strictEqual(provider.getSessions().length, 0, "no sessions should be cached while authentication is pending");
    agentHost.addSession(createSession("after-auth-1", { summary: "First" }));
    agentHost.addSession(createSession("after-auth-2", { summary: "Second" }));
    agentHost.setAuthenticationPending(false);
    await timeout(0);
    assert.deepStrictEqual({
      eventCount: changes.length,
      added: changes[0]?.added.map((s) => s.title.get()).sort(),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      added: ["First", "Second"],
      cachedTitles: ["First", "Second"]
    });
  }));
  test("recovers an empty list when the initial listSessions fails, without needing a new session", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.failListSessionsCount = 1;
    agentHost.addSession(createSession("heal-1", { summary: "First" }));
    agentHost.addSession(createSession("heal-2", { summary: "Second" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.strictEqual(changes.length, 0, "no event should fire after a failed initial refresh");
    assert.strictEqual(provider.getSessions().length, 0, "cache stays empty after a failed initial refresh");
    await timeout(1100);
    assert.deepStrictEqual({
      eventCount: changes.length,
      added: changes[0]?.added.map((s) => s.title.get()).sort(),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      added: ["First", "Second"],
      cachedTitles: ["First", "Second"]
    });
  }));
  test("a session whose agent reports nothing survives the refresh", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "codex", displayName: "Codex", description: "", models: [] }
    ]);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
    agentHost.addSession(createSession("codex-1", { provider: "codex", summary: "Codex One" }));
    agentHost.addSession(createSession("cli-1", { provider: "copilotcli", summary: "CLI One" }));
    const provider = createProvider(disposables, agentHost, void 0, { configurationService });
    await timeout(0);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.stopListingSessions("codex-1");
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "cli-1").toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.deepStrictEqual({
      removed: changes.flatMap((c) => c.removed.map((s) => s.title.get())),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      removed: [],
      cachedTitles: ["CLI One", "Codex One"]
    });
  }));
  test("a session missing while its agent still reports others is evicted", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("cli-gone", { provider: "copilotcli", summary: "Gone" }));
    agentHost.addSession(createSession("cli-kept", { provider: "copilotcli", summary: "Kept" }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.stopListingSessions("cli-gone");
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "cli-kept").toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.deepStrictEqual({
      removed: changes.flatMap((c) => c.removed.map((s) => s.title.get())),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      removed: ["Gone"],
      cachedTitles: ["Kept"]
    });
  }));
  test("a successful empty listSessions arms no retry", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    const callsAfterEagerLoad = agentHost.listSessionsCallCount;
    assert.strictEqual(callsAfterEagerLoad, 1, "exactly one eager listSessions call");
    await timeout(6e4);
    assert.strictEqual(agentHost.listSessionsCallCount, callsAfterEagerLoad, "no retry should be scheduled after a successful empty list");
    assert.strictEqual(changes.length, 0, "no change event for an empty list");
    assert.strictEqual(provider.getSessions().length, 0);
  }));
  test("retries with backoff until listSessions succeeds", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.failListSessionsCount = 2;
    agentHost.addSession(createSession("backoff-1", { summary: "Only" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.strictEqual(provider.getSessions().length, 0, "empty after first failure");
    await timeout(1100);
    assert.strictEqual(provider.getSessions().length, 0, "empty after second failure");
    await timeout(2200);
    assert.deepStrictEqual({
      eventCount: changes.length,
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      cachedTitles: ["Only"]
    });
  }));
  test("hydrates persisted sessions on startup before the live list is available", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("cached-1", { summary: "Cached One" })]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    assert.deepStrictEqual({
      listSessionsCalls: nextHost.listSessionsCallCount,
      cachedTitles: provider.getSessions().map((s) => s.title.get())
    }, {
      listSessionsCalls: 0,
      cachedTitles: ["Cached One"]
    });
  }));
  test("discards a legacy cache entry so read state is rebuilt from the host", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const LEGACY_KEY = "localAgentHost.cachedSessions";
    const CURRENT_KEY = "localAgentHost.cachedSessions.v2";
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("legacy-1", { summary: "Legacy One" })]);
    const snapshot = storageService.get(CURRENT_KEY, StorageScope.APPLICATION);
    assert.ok(snapshot, "precondition: current-key snapshot should exist");
    storageService.store(LEGACY_KEY, snapshot, StorageScope.APPLICATION, StorageTarget.USER);
    storageService.remove(CURRENT_KEY, StorageScope.APPLICATION);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    assert.deepStrictEqual({
      cachedSessions: provider.getSessions().length,
      legacyKeyPresent: storageService.get(LEGACY_KEY, StorageScope.APPLICATION) !== void 0
    }, {
      cachedSessions: 0,
      legacyKeyPresent: false
    });
  }));
  test("caches session-scoped flags but never transient activity bits", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [{
      ...createSession("busy-1", { summary: "Busy One" }),
      status: ProtocolSessionStatus.InProgress | ProtocolSessionStatus.IsArchived
    }]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const restored = provider.getSessions()[0];
    assert.deepStrictEqual({
      status: restored.status.get(),
      isArchived: restored.isArchived.get(),
      isRead: restored.isRead.get()
    }, {
      status: SessionStatus.Completed,
      isArchived: true,
      isRead: false
    });
  }));
  test("hydrated quick chat stays workspace-less after reload despite a scratch working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [
      createSession("quick-cached", {
        summary: "Quick Chat",
        workingDirectory: URI.file("/tmp/copilot-scratch/quick-cached"),
        quickChat: true
      })
    ]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "quick-cached");
    assert.deepStrictEqual({
      workspace: session?.workspace.get(),
      isQuickChat: session?.isQuickChat?.get()
    }, {
      workspace: void 0,
      isQuickChat: true
    });
  }));
  test("a refresh publishes _meta and summary fields as one atomic update", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("atomic-1", { summary: "One", workingDirectory: URI.file("/repo") }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const session = provider.getSessions()[0];
    const observed = [];
    disposables.add(autorun((reader) => {
      observed.push({
        branch: session.workspace.read(reader)?.folders[0]?.gitRepository?.branchName,
        isArchived: session.isArchived.read(reader)
      });
    }));
    agentHost.addSession({
      ...createSession("atomic-1", { summary: "One", workingDirectory: URI.file("/repo") }),
      status: ProtocolSessionStatus.Idle | ProtocolSessionStatus.IsArchived,
      _meta: withSessionGitState(void 0, { branchName: "feature" })
    });
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "atomic-1").toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.deepStrictEqual(observed, [
      { branch: void 0, isArchived: false },
      { branch: "feature", isArchived: true }
    ]);
  }));
  test("a summaryChanged notification publishes the change chip and _meta as one atomic update", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("atomic-2", { summary: "Two", workingDirectory: URI.file("/repo") }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const session = provider.getSessions()[0];
    const observed = [];
    disposables.add(autorun((reader) => {
      observed.push({
        branch: session.workspace.read(reader)?.folders[0]?.gitRepository?.branchName,
        files: session.changesSummary?.read(reader)?.files
      });
    }));
    fireSessionSummaryChanged(agentHost, "atomic-2", {
      changes: { additions: 3, deletions: 1, files: 2 },
      _meta: withSessionGitState(void 0, { branchName: "feature" })
    });
    await timeout(0);
    assert.deepStrictEqual(observed, [
      { branch: void 0, files: void 0 },
      { branch: "feature", files: 2 }
    ]);
  }));
  test("reconciles hydrated sessions against the authoritative list, pruning stale entries", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("stale-1", { summary: "Stale" })]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const beforeRefresh = provider.getSessions().map((s) => s.title.get());
    await timeout(0);
    const afterRefresh = provider.getSessions().map((s) => s.title.get());
    assert.deepStrictEqual({ beforeRefresh, afterRefresh }, { beforeRefresh: ["Stale"], afterRefresh: [] });
  }));
  test("hydrated sessions survive a failed initial listSessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("resilient-1", { summary: "Resilient" })]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.failListSessionsCount = 1;
    nextHost.addSession(createSession("resilient-1", { summary: "Resilient" }));
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    await timeout(0);
    const afterFailedList = provider.getSessions().map((s) => s.title.get());
    await timeout(1100);
    const afterRetry = provider.getSessions().map((s) => s.title.get());
    assert.deepStrictEqual({ afterFailedList, afterRetry }, { afterFailedList: ["Resilient"], afterRetry: ["Resilient"] });
  }));
  test("uses project metadata as workspace group source", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const projectUri = URI.file("/home/user/vscode");
    const workingDirectory = URI.file("/tmp/copilot-worktrees/vscode-feature");
    agentHost.addSession(createSession("project-1", {
      summary: "Project Session",
      project: { uri: projectUri, displayName: "vscode" },
      workingDirectory
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const workspace = provider.getSessions()[0].workspace.get();
    assert.deepStrictEqual({
      label: workspace?.label,
      repository: workspace?.folders[0]?.root.toString(),
      workingDirectory: workspace?.folders[0]?.workingDirectory?.toString()
    }, {
      label: "vscode",
      repository: projectUri.toString(),
      workingDirectory: workingDirectory.toString()
    });
  }));
  test("listed session with only workingDirectory (no project) shows folder name", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const workingDirectory = URI.file("/home/user/standalone-folder");
    agentHost.addSession(createSession("wd-only-1", {
      summary: "WD-only Session",
      workingDirectory
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const workspace = provider.getSessions()[0].workspace.get();
    assert.strictEqual(workspace?.label, "standalone-folder");
  }));
  test("session added notification does not carry model metadata", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "notif-model", { title: "Notif Model Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Notif Model Session");
    assert.strictEqual(session?.modelId.get(), void 0);
  });
  test("getModels returns only models targeting the session resource scheme", () => {
    const matchingModel = { ...createTestLanguageModel("matching"), targetChatSessionType: "agent-host-copilotcli" };
    const otherModel = { ...createTestLanguageModel("other"), targetChatSessionType: "agent-host-other" };
    const provider = createProvider(disposables, agentHost, void 0, {
      languageModelIds: ["matching", "other", "missing"],
      lookupLanguageModel: (id) => id === "matching" ? matchingModel : id === "other" ? otherModel : void 0
    });
    fireSessionAdded(agentHost, "model-catalog", { title: "Model Catalog Session" });
    const session = provider.getSessions().find((session2) => session2.title.get() === "Model Catalog Session");
    assert.ok(session);
    const snapshot = provider.getModelsSnapshot(session.sessionId);
    assert.deepStrictEqual({
      models: snapshot.models.map((model) => model.identifier),
      modelTarget: snapshot.modelTarget
    }, {
      models: ["matching"],
      modelTarget: "agent-host-copilotcli"
    });
  });
  test("getModelsSnapshot canonicalizes a matching logical-session model identifier", () => {
    const modelId = "gpt-5.6-sol";
    const logicalIdentifier = `copilotcli/${modelId}`;
    const unrelatedIdentifier = `other/${modelId}`;
    const targetIdentifier = `agent-host-copilotcli:${modelId}`;
    const languageModelIds = [logicalIdentifier, unrelatedIdentifier];
    const languageModels = /* @__PURE__ */ new Map([
      [logicalIdentifier, { ...createTestLanguageModel(modelId), vendor: "copilotcli", targetChatSessionType: "copilotcli" }],
      [unrelatedIdentifier, { ...createTestLanguageModel(modelId), vendor: "other", targetChatSessionType: "other" }],
      [targetIdentifier, { ...createTestLanguageModel(modelId), targetChatSessionType: "agent-host-copilotcli" }]
    ]);
    const provider = createProvider(disposables, agentHost, void 0, {
      languageModelIds,
      lookupLanguageModel: (id) => languageModels.get(id)
    });
    fireSessionAdded(agentHost, "model-alias", { title: "Model Alias Session" });
    const session = provider.getSessions().find((session2) => session2.title.get() === "Model Alias Session");
    assert.ok(session);
    const pending = provider.getModelsSnapshot(session.sessionId, logicalIdentifier).desiredModelResolution;
    const unrelated = provider.getModelsSnapshot(session.sessionId, unrelatedIdentifier).desiredModelResolution;
    languageModelIds.push(targetIdentifier);
    const available = provider.getModelsSnapshot(session.sessionId, logicalIdentifier).desiredModelResolution;
    assert.deepStrictEqual({
      pending,
      unrelated,
      available: available.kind === "available" ? { kind: available.kind, identifier: available.model.identifier } : available
    }, {
      pending: { kind: "pending", identifier: targetIdentifier },
      unrelated: { kind: "unavailable", identifier: unrelatedIdentifier },
      available: { kind: "available", identifier: targetIdentifier }
    });
  });
  test("setModel updates existing session model and lets draft debounce persist it", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "set-model", { title: "Set Model Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Model Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "agent-host-copilotcli:new-model");
    assert.strictEqual(session.modelId.get(), "agent-host-copilotcli:new-model");
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("setModel updates cached selection for later message-level selection", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "set-model-config", { title: "Set Model Config Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Model Config Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "agent-host-copilotcli:configured-model");
    assert.strictEqual(session.modelId.get(), "agent-host-copilotcli:configured-model");
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("setAgent updates existing session agent and lets draft debounce persist it", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "set-agent", { title: "Set Agent Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Agent Session");
    assert.ok(session);
    provider.setAgent?.(session.sessionId, { uri: "agent://review", name: "review" });
    assert.deepStrictEqual(session.mode.get(), { id: "agent://review", kind: "agent" });
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("setAgent with undefined clears the cached agent selection", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "clear-agent", { title: "Clear Agent Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Clear Agent Session");
    assert.ok(session);
    provider.setAgent?.(session.sessionId, { uri: "agent://review", name: "review" });
    provider.setAgent?.(session.sessionId, void 0);
    assert.strictEqual(session.mode.get(), void 0);
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("restores the selected agent from the default chat draft on resume", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "resume-agent", { title: "Resume Agent Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Resume Agent Session");
    assert.ok(session);
    assert.strictEqual(session.mode.get(), void 0);
    provider.getSessionConfig(session.sessionId);
    const defaultChatUri = buildDefaultChatUri(AgentSession.uri("copilotcli", "resume-agent"));
    agentHost.setChatState(defaultChatUri, {
      resource: defaultChatUri,
      title: "Resume Agent Session",
      status: ProtocolSessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      turns: [],
      draft: { text: "", origin: { kind: MessageKind.User }, agent: { uri: "agent://resumed" } }
    });
    assert.deepStrictEqual(session.mode.get(), { id: "agent://resumed", kind: "agent" });
  });
  test("does not override a live agent selection with the persisted draft agent", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "resume-nooverride", { title: "Resume No Override" });
    const session = provider.getSessions().find((s) => s.title.get() === "Resume No Override");
    assert.ok(session);
    provider.setAgent?.(session.sessionId, { uri: "agent://live", name: "live" });
    provider.getSessionConfig(session.sessionId);
    const defaultChatUri = buildDefaultChatUri(AgentSession.uri("copilotcli", "resume-nooverride"));
    agentHost.setChatState(defaultChatUri, {
      resource: defaultChatUri,
      title: "Resume No Override",
      status: ProtocolSessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      turns: [],
      draft: { text: "", origin: { kind: MessageKind.User }, agent: { uri: "agent://resumed" } }
    });
    assert.deepStrictEqual(session.mode.get(), { id: "agent://live", kind: "agent" });
  });
  test("rebases the selected agent to its worktree twin from the agent list before the working directory flips", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rebase-worktree", { title: "Rebase Worktree", workingDirectory: "file:///Users/me/vscode" });
    const session = provider.getSessions().find((s) => s.title.get() === "Rebase Worktree");
    assert.ok(session);
    const folderAgent = "file:///Users/me/vscode/.github/agents/sessions.md";
    const worktreeAgent = "file:///Users/me/vscode.worktrees/rebase-worktree/.github/agents/sessions.md";
    provider.setAgent?.(session.sessionId, { uri: folderAgent, name: "sessions" });
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("rebase-worktree", "copilotcli", {
      provider: "copilotcli",
      title: "Rebase Worktree",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://worktree",
        uri: "plugin://worktree",
        name: "worktree plugin",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: worktreeAgent, uri: worktreeAgent, name: "sessions" }]
      }]
    });
    assert.deepStrictEqual(session.mode.get(), { id: worktreeAgent, kind: "agent" });
  });
  test("leaves the selected agent untouched when the agent list has no relocated twin", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rebase-none", { title: "Rebase None", workingDirectory: "file:///Users/me/vscode" });
    const session = provider.getSessions().find((s) => s.title.get() === "Rebase None");
    assert.ok(session);
    const folderAgent = "file:///Users/me/vscode/.github/agents/sessions.md";
    provider.setAgent?.(session.sessionId, { uri: folderAgent, name: "sessions" });
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("rebase-none", "copilotcli", {
      provider: "copilotcli",
      title: "Rebase None",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://other",
        uri: "plugin://other",
        name: "other plugin",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "file:///Users/me/vscode.worktrees/rebase-none/.github/agents/other.md", uri: "file:///Users/me/vscode.worktrees/rebase-none/.github/agents/other.md", name: "other" }]
      }]
    });
    assert.deepStrictEqual(session.mode.get(), { id: folderAgent, kind: "agent" });
  });
  test("carries the picked custom agent onto the committed session when a new session graduates", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => {
        agentHost.addSession(createSession("graduated", { summary: "Graduated Session" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    provider.setAgent?.(session.sessionId, { uri: "agent://picked", name: "picked" });
    const chat = await provider.createNewChat(session.sessionId);
    const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.deepStrictEqual(committed.mode.get(), { id: "agent://picked", kind: "agent" });
  });
  test("getCustomAgents collects agents from session customizations, coalesced by URI and sorted by name", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "agents-merge", { title: "Merge Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Merge Session");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "Merge Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://session-1",
        uri: "plugin://session-1",
        name: "session plugin",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [
          { type: CustomizationType.Agent, id: "agent://shared", uri: "agent://shared", name: "shared", description: "from session" },
          { type: CustomizationType.Agent, id: "agent://session-only", uri: "agent://session-only", name: "session-only" }
        ]
      }, {
        type: CustomizationType.Plugin,
        id: "plugin://session-2",
        uri: "plugin://session-2",
        name: "second session plugin",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [
          { type: CustomizationType.Agent, id: "agent://another", uri: "agent://another", name: "another" },
          // Duplicate URI — must NOT replace the first-seen entry.
          { type: CustomizationType.Agent, id: "agent://shared-dup", uri: "agent://shared", name: "shared (duplicate)" }
        ]
      }, {
        // Disabled customizations are skipped entirely.
        type: CustomizationType.Plugin,
        id: "plugin://disabled",
        uri: "plugin://disabled",
        name: "disabled plugin",
        enabled: false,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "agent://disabled", uri: "agent://disabled", name: "disabled" }]
      }, {
        // Customizations with `children === undefined` are treated as
        // "unknown" (host not yet finished parsing) and skipped.
        type: CustomizationType.Plugin,
        id: "plugin://unparsed",
        uri: "plugin://unparsed",
        name: "unparsed plugin",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loading }
      }]
    };
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("agents-merge", "copilotcli", fakeState);
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
      { type: CustomizationType.Agent, id: "agent://another", uri: "agent://another", name: "another" },
      { type: CustomizationType.Agent, id: "agent://session-only", uri: "agent://session-only", name: "session-only" },
      // First-seen wins for the duplicate `agent://shared` URI.
      { type: CustomizationType.Agent, id: "agent://shared", uri: "agent://shared", name: "shared", description: "from session" }
    ]);
  });
  test("getMcpServers dispatches MCP lifecycle requests", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "mcp-lifecycle", { title: "MCP Lifecycle" });
    const session = provider.getSessions().find((s) => s.title.get() === "MCP Lifecycle");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "MCP Lifecycle",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.McpServer,
        id: "mcp://docs",
        uri: "mcp://docs",
        name: "Docs",
        enabled: true,
        state: { kind: McpServerStatus.Stopped }
      }]
    };
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("mcp-lifecycle", "copilotcli", fakeState);
    const servers = provider.getMcpServers(session.sessionId);
    assert.strictEqual(servers.length, 1);
    await servers[0].start();
    await servers[0].stop();
    const actions = agentHost.dispatchedActions.slice(-2);
    assert.deepStrictEqual(actions.map(({ action }) => action.type), [
      ActionType.SessionMcpServerStartRequested,
      ActionType.SessionMcpServerStopRequested
    ]);
    assert.deepStrictEqual(actions.map(({ action }) => action.id), ["mcp://docs", "mcp://docs"]);
  });
  test("getBackendChatResource looks up the host-supplied backend chat URI", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "chat-lookup", { title: "Chat Lookup" });
    fireSessionAdded(agentHost, "no-state", { title: "No State" });
    const session = provider.getSessions().find((s) => s.title.get() === "Chat Lookup");
    const unhydrated = provider.getSessions().find((s) => s.title.get() === "No State");
    assert.ok(session);
    assert.ok(unhydrated);
    const backendSession = AgentSession.uri("copilotcli", "backend-abc").toString();
    const defaultBackend = buildDefaultChatUri(backendSession);
    const peerBackend = buildChatUri(backendSession, "peer-1");
    const fakeState = {
      provider: "copilotcli",
      title: "Chat Lookup",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [
        { resource: defaultBackend, title: "Default", status: ProtocolSessionStatus.Idle, modifiedAt: "2025-01-01T00:00:00.000Z" },
        { resource: peerBackend, title: "Peer", status: ProtocolSessionStatus.Idle, modifiedAt: "2025-01-01T00:00:00.000Z" }
      ],
      defaultChat: defaultBackend
    };
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("chat-lookup", "copilotcli", fakeState);
    assert.deepStrictEqual({
      // Default chat (client resource has no fragment) resolves via `defaultChat`.
      defaultChat: provider.getBackendChatResource(session.resource)?.toString(),
      // Peer chat (client fragment) resolves via its `ChatSummary.resource`.
      peerChat: provider.getBackendChatResource(session.resource.with({ fragment: "peer-1" }))?.toString(),
      // A peer chat absent from hydrated state has no backend URI.
      missingPeer: provider.getBackendChatResource(session.resource.with({ fragment: "ghost" }))?.toString(),
      // A session whose state has not hydrated yields nothing.
      notHydrated: provider.getBackendChatResource(unhydrated.resource)
    }, {
      defaultChat: URI.parse(defaultBackend).toString(),
      peerChat: URI.parse(peerBackend).toString(),
      missingPeer: void 0,
      notHydrated: void 0
    });
  });
  test("getCustomAgents returns no agents when the session has no SessionState", () => {
    const provider = createProvider(disposables, agentHost);
    agentHost.setAgents([
      {
        provider: "copilotcli",
        displayName: "Copilot",
        description: "",
        models: [],
        customizations: [{
          type: CustomizationType.Plugin,
          id: "plugin://root",
          uri: "plugin://root",
          name: "root plugin",
          enabled: true
        }]
      }
    ]);
    fireSessionAdded(agentHost, "root-only", { title: "Root Only" });
    const session = provider.getSessions().find((s) => s.title.get() === "Root Only");
    assert.ok(session);
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), []);
  });
  test("onDidChangeCustomAgents fires on root state and session state changes", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "cust-events", { title: "Cust Events" });
    const session = provider.getSessions().find((s) => s.title.get() === "Cust Events");
    assert.ok(session);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => {
      fired++;
    }));
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] }
    ]);
    const afterRoot = fired;
    assert.ok(afterRoot > 0, "expected event to fire when the agents reference is replaced");
    agentHost.fireNonAgentRootStateChange();
    assert.strictEqual(fired, afterRoot, "expected event NOT to fire on non-agent root deltas (preserved agents reference)");
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("cust-events", "copilotcli", {
      provider: "copilotcli",
      title: "Cust Events",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://s",
        uri: "plugin://s",
        name: "session plugin",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "agent://s", uri: "agent://s", name: "s" }]
      }]
    });
    assert.ok(fired > afterRoot, "expected event to fire on session state customization change");
    const afterFirstCustomization = fired;
    agentHost.setSessionState("cust-events", "copilotcli", {
      provider: "copilotcli",
      title: "Cust Events Updated",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      // Same identity as before:
      customizations: provider._lastSessionStates.get(session.sessionId)?.customizations
    });
    assert.strictEqual(fired, afterFirstCustomization, "expected event NOT to fire when customizations are unchanged");
  });
  test("NewSession forwards SessionState into _lastSessionStates so the picker sees customizations before first message", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), sessionTypeId);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => {
      fired++;
    }));
    const customizations = [{
      type: CustomizationType.Plugin,
      id: "plugin://new-session",
      uri: "plugin://new-session",
      name: "p",
      enabled: true,
      load: { kind: CustomizationLoadStatus.Loaded },
      children: [
        { type: CustomizationType.Agent, id: "agent://reviewer", uri: "agent://reviewer", name: "reviewer" },
        { type: CustomizationType.Agent, id: "agent://triage", uri: "agent://triage", name: "triage" }
      ]
    }];
    const state = {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations
    };
    agentHost.setSessionState(rawId, sessionTypeId, state);
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
      { type: CustomizationType.Agent, id: "agent://reviewer", uri: "agent://reviewer", name: "reviewer" },
      { type: CustomizationType.Agent, id: "agent://triage", uri: "agent://triage", name: "triage" }
    ]);
    assert.ok(fired > 0, "expected onDidChangeCustomAgents to fire when SessionState arrives");
    const after = fired;
    agentHost.setSessionState(rawId, sessionTypeId, {
      ...state,
      customizations: [{
        ...customizations[0],
        children: [{ type: CustomizationType.Agent, id: "agent://only", uri: "agent://only", name: "only" }]
      }]
    });
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
      { type: CustomizationType.Agent, id: "agent://only", uri: "agent://only", name: "only" }
    ]);
    assert.ok(fired > after, "expected onDidChangeCustomAgents to fire again on a second update");
  });
  test("NewSession releases observed changeset subscriptions when inactive", async () => {
    const activeSession = observableValue("test.activeSession", void 0);
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const sessionTypeId = provider.sessionTypes[0].id;
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), sessionTypeId);
    await timeout(0);
    activeSession.set(new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = session.resource;
      }
    }(), void 0);
    disposables.add(autorun((reader) => {
      for (const changeset of session.changesets?.read(reader) ?? []) {
        changeset.changes.read(reader);
      }
    }));
    const backendUri = agentHost.createdSessionUris.at(-1);
    const changesetUri = `${backendUri}/changeset/uncommitted`;
    agentHost.setSessionState(AgentSession.id(backendUri), sessionTypeId, {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      changesets: [
        { label: "Uncommitted Changes", uriTemplate: changesetUri, changeKind: "uncommitted" }
      ]
    });
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(changesetUri), 1);
    activeSession.set(void 0, void 0);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(changesetUri), 1);
  });
  test("NewSession dispose clears _lastSessionStates entry and fires onDidChangeCustomAgents", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    await timeout(0);
    const rawId = first.resource.path.substring(1);
    agentHost.setSessionState(rawId, sessionTypeId, {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://x",
        uri: "plugin://x",
        name: "p",
        enabled: true,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "agent://x", uri: "agent://x", name: "x" }]
      }]
    });
    assert.strictEqual(provider.getCustomAgents(first.sessionId).length, 1);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => {
      fired++;
    }));
    provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    provider.deleteNewSession(first.sessionId);
    await timeout(0);
    assert.deepStrictEqual(provider.getCustomAgents(first.sessionId), []);
    assert.ok(fired > 0, "expected onDidChangeCustomAgents to fire on NewSession dispose");
  });
  test("createNewSession returns session with correct fields", () => {
    const provider = createProvider(disposables, agentHost);
    const workspaceUri = URI.parse("file:///home/user/my-project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    assert.strictEqual(session.providerId, provider.id);
    assert.strictEqual(session.status.get(), SessionStatus.Untitled);
    assert.ok(session.workspace.get());
    assert.strictEqual(session.workspace.get()?.label, "my-project");
    assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
    assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), { schema: { type: "object", properties: {} }, values: {} });
  });
  test("declares quick chat support from the initial agent host setting", () => {
    const provider = createProvider(disposables, agentHost, void 0, { agentHostEnabled: true });
    assert.strictEqual(provider.supportsQuickChats, true);
  });
  test("does not declare quick chat support when the agent host is disabled", () => {
    const provider = createProvider(disposables, agentHost, void 0, { agentHostEnabled: false });
    assert.strictEqual(provider.supportsQuickChats, false);
  });
  test("createQuickChat returns a workspace-less untitled session", () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createQuickChat(provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      providerId: session.providerId,
      status: session.status.get(),
      workspace: session.workspace.get(),
      sessionType: session.sessionType,
      isQuickChat: session.isQuickChat?.get()
    }, {
      providerId: provider.id,
      status: SessionStatus.Untitled,
      workspace: void 0,
      sessionType: provider.sessionTypes[0].id,
      isQuickChat: true
    });
  });
  test("createQuickChat eagerly creates the backend session with no working directory (inferred workspace-less)", async () => {
    const provider = createProvider(disposables, agentHost);
    provider.createQuickChat(provider.sessionTypes[0].id);
    await timeout(0);
    const created = agentHost.createSessionConfigs.at(-1);
    assert.strictEqual(created?.workingDirectory, void 0);
  });
  test("createQuickChat throws when no agents are advertised", () => {
    agentHost.setAgents([]);
    const provider = createProvider(disposables, agentHost);
    assert.throws(() => provider.createQuickChat("copilotcli"));
  });
  test("restores a quick chat from listSessions as workspace-less despite a scratch working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-1", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-1"),
      quickChat: true
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    assert.deepStrictEqual({
      title: session?.title.get(),
      workspace: session?.workspace.get()
    }, {
      title: "Quick Chat",
      workspace: void 0
    });
  }));
  test("restored quick chat reports supportsMultipleChats === false", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-1", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-1"),
      quickChat: true
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    assert.deepStrictEqual(session?.capabilities.get(), { supportsMultipleChats: false, supportsFork: true, supportsSideChat: false, supportsRename: true, supportsDelete: true });
  }));
  test("restored quick chat collapses to a single chat even when state advertises peer chats", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-multi", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-multi"),
      quickChat: true
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    provider.getSessionConfig(session.sessionId);
    const sessionUri = AgentSession.uri("copilotcli", "quick-multi").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    agentHost.setSessionState("quick-multi", "copilotcli", {
      provider: "copilotcli",
      title: "Quick Chat",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      _meta: withSessionWorkspaceless(void 0, true),
      chats: [
        { resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() },
        { resource: buildChatUri(sessionUri, "peer-1"), title: "Peer One", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() },
        { resource: buildChatUri(sessionUri, "peer-2"), title: "Peer Two", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() }
      ]
    });
    assert.deepStrictEqual({
      workspace: session.workspace.get(),
      supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
      chatFragments: session.chats.get().map((c) => c.resource.fragment),
      chatTitles: session.chats.get().map((c) => c.title.get())
    }, {
      workspace: void 0,
      supportsMultipleChats: false,
      chatFragments: [""],
      chatTitles: ["Quick Chat"]
    });
  }));
  test("promotes an untagged session to a quick chat once state reports it workspace-less, and persists the promotion", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    agentHost.addSession(createSession("quick-untagged", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/home/user/.copilot/chats/quick-untagged")
    }));
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const beforePromotion = { hasWorkspace: session.workspace.get() !== void 0, isQuickChat: session.isQuickChat?.get() };
    provider.getSessionConfig(session.sessionId);
    const sessionUri = AgentSession.uri("copilotcli", "quick-untagged").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    agentHost.setSessionState("quick-untagged", "copilotcli", {
      provider: "copilotcli",
      title: "Quick Chat",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      _meta: withSessionWorkspaceless(void 0, true),
      chats: [{ resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() }]
    });
    await storageService.flush();
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const hydrated = createProvider(disposables, nextHost, void 0, { storageService }).getSessions()[0];
    assert.deepStrictEqual({
      beforePromotion,
      afterPromotion: { workspace: session.workspace.get(), isQuickChat: session.isQuickChat?.get() },
      afterReload: { workspace: hydrated?.workspace.get(), isQuickChat: hydrated?.isQuickChat?.get() }
    }, {
      beforePromotion: { hasWorkspace: true, isQuickChat: false },
      afterPromotion: { workspace: void 0, isQuickChat: true },
      afterReload: { workspace: void 0, isQuickChat: true }
    });
  }));
  test("reports a kind-only promotion so the list regroups a session that never had a workspace", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-no-cwd", { summary: "Quick Chat" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    provider.getSessionConfig(session.sessionId);
    const changed = [];
    disposables.add(provider.onDidChangeSessions((e) => changed.push(...e.changed.map((s) => s.sessionId))));
    const sessionUri = AgentSession.uri("copilotcli", "quick-no-cwd").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    agentHost.setSessionState("quick-no-cwd", "copilotcli", {
      provider: "copilotcli",
      title: "Quick Chat",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      _meta: withSessionWorkspaceless(void 0, true),
      chats: [{ resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() }]
    });
    assert.deepStrictEqual({
      isQuickChat: session.isQuickChat?.get(),
      announced: changed.includes(session.sessionId)
    }, {
      isQuickChat: true,
      announced: true
    });
  }));
  test("listing reconcile promotes a cached adapter in place and announces the regroup", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const scratchDir = URI.file("/home/user/.copilot/chats/quick-poisoned");
    await persistCachedSessions(disposables, storageService, [
      createSession("quick-poisoned", { summary: "Quick Chat", workingDirectory: scratchDir })
    ]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.addSession(createSession("quick-poisoned", { summary: "Quick Chat", workingDirectory: scratchDir, quickChat: true }));
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const hydrated = provider.getSessions()[0];
    const fromCache = { hasWorkspace: hydrated.workspace.get() !== void 0, isQuickChat: hydrated.isQuickChat?.get() };
    const changed = [];
    disposables.add(provider.onDidChangeSessions((e) => changed.push(...e.changed.map((s) => s.sessionId))));
    await timeout(0);
    assert.deepStrictEqual({
      fromCache,
      afterListing: { workspace: hydrated.workspace.get(), isQuickChat: hydrated.isQuickChat?.get() },
      announced: changed.includes(hydrated.sessionId),
      healedInPlace: provider.getSessions()[0] === hydrated
    }, {
      fromCache: { hasWorkspace: true, isQuickChat: false },
      afterListing: { workspace: void 0, isQuickChat: true },
      announced: true,
      healedInPlace: true
    });
  }));
  test("committed quick chat announced via sessionAdded stays workspace-less despite a scratch working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    fireSessionAdded(agentHost, "quick-committed", {
      title: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-committed").toString(),
      workspaceless: true
    });
    const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "quick-committed");
    assert.deepStrictEqual({
      workspace: session?.workspace.get(),
      isQuickChat: session?.isQuickChat?.get()
    }, {
      workspace: void 0,
      isQuickChat: true
    });
  }));
  test("createNewSession clears session config when resolving config is unavailable", async () => {
    agentHost.failResolveSessionConfig = true;
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config === void 0);
    assert.strictEqual(provider.getSessionConfig(session.sessionId), void 0);
  });
  test("createNewSession maps allowAll from chat.defaultConfiguration to autoApprove", async () => {
    const config = new TestConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: { autoApprove: { type: "string", enum: ["default", "autoApprove"], title: "Auto-approve" } } },
      values: { autoApprove: "autoApprove" }
    };
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "autoApprove");
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      seededImmediately: "autoApprove",
      forwardedToAgentHost: "autoApprove"
    });
  });
  test("createNewSession seeds mode from chat.defaultConfiguration and forwards it to resolveSessionConfig", async () => {
    const config = new TestConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { mode: "autopilot" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.mode === "autopilot");
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values.mode,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.mode
    }, {
      seededImmediately: "autopilot",
      forwardedToAgentHost: "autopilot"
    });
  });
  test("createNewSession forwards seeded config to eager createSession", async () => {
    const config = new TestConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.createSessionConfigs[0]?.config, { autoApprove: "autoApprove" });
  });
  test("createNewSession does not seed autoApprove when chat.defaultConfiguration approvals is the default value", () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      initialValues: provider.getSessionConfig(session.sessionId)?.values,
      forwardedAutoApprove: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      initialValues: {},
      forwardedAutoApprove: void 0
    });
  });
  test("createNewSession clamps seeded autoApprove to default when policy disables global auto-approve", async () => {
    const config = createPolicyRestrictedConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      seededImmediately: "default",
      forwardedToAgentHost: "default"
    });
  });
  test("setSessionConfigValue remembers portable string picks and drops non-remembered keys", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Branch]: "legacy-branch"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, () => !provider.isSessionConfigResolving(session.sessionId).get());
    await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, "folder");
    await provider.setSessionConfigValue(session.sessionId, "__proto__", "polluted");
    assert.deepStrictEqual(
      storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
      { [SessionConfigKey.Isolation]: "folder" }
    );
  });
  test("maps the existing isolation setter to agent-host config without remembering it", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder", branch: "main" }
    };
    await provider.setIsolationMode(session.sessionId, "workspace");
    assert.deepStrictEqual({
      supportsWorktreeConfiguration: provider.sessionTypes[0].supportsWorktreeConfiguration,
      requests: agentHost.resolveSessionConfigRequests.slice(firstAutomationRequest).map((request) => request.config),
      remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {})
    }, {
      supportsWorktreeConfiguration: true,
      requests: [
        { isolation: "folder" }
      ],
      remembered: {}
    });
  });
  test("maps the programmatic branch tracking setter to hidden agent-host config without remembering it", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { [SessionConfigKey.WorktreeBranchTrack]: false }
    };
    await provider.setWorktreeBranchTrack(session.sessionId, false);
    assert.deepStrictEqual({
      requests: agentHost.resolveSessionConfigRequests.slice(firstAutomationRequest).map((request) => request.config),
      createSessionConfig: provider.getCreateSessionConfig(session.sessionId),
      remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {})
    }, {
      requests: [
        {
          [SessionConfigKey.Isolation]: "worktree",
          [SessionConfigKey.WorktreeBranchTrack]: false
        }
      ],
      createSessionConfig: { [SessionConfigKey.WorktreeBranchTrack]: false },
      remembered: {}
    });
  });
  test("rejects branch configuration when agent-host resolution fails", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    agentHost.failResolveSessionConfig = true;
    await assert.rejects(() => provider.setBranch(session.sessionId, "feature/automation"), /resolveSessionConfig unavailable/);
    assert.strictEqual(provider.getCreateSessionConfig(session.sessionId), void 0);
  });
  test("rejects isolation configuration when the final resolve changes the requested value", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder", branch: "feature/automation" }
    };
    await assert.rejects(() => provider.setIsolationMode(session.sessionId, "worktree"), /did not apply session config 'isolation'/);
  });
  test("cancels repository configuration when the draft is disposed during initial resolve", async () => {
    const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise();
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const setting = provider.setIsolationMode(session.sessionId, "worktree");
    await Promise.resolve();
    provider.deleteNewSession(session.sessionId);
    try {
      await assert.rejects(raceTimeout(setting, 100), /Canceled/);
    } finally {
      await barrier.complete();
    }
  });
  test("waits for authentication and startup config resolution before repository configuration", async () => {
    agentHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "worktree", branch: "feature/automation" }
    };
    const setting = provider.setBranch(session.sessionId, "feature/automation");
    await Promise.resolve();
    assert.strictEqual(agentHost.resolveSessionConfigRequests.length, 0);
    agentHost.setAuthenticationPending(false);
    await setting;
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.map((request) => request.config), [
      {},
      { isolation: "worktree", branch: "feature/automation" }
    ]);
  });
  test("setSessionConfigValue clamps autoApprove to default when policy disables global auto-approve", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const config = createPolicyRestrictedConfigurationService();
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config, storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, "autopilot");
    assert.deepStrictEqual({
      remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      remembered: { [SessionConfigKey.AutoApprove]: "default" },
      forwardedToAgentHost: "default"
    });
  });
  test("branch selection stays on the current workspace and the next workspace resolves its own branch", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "worktree", branch: "main-a" }
    };
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const sessionA = provider.createNewSession(URI.parse("file:///workspace-a"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, sessionA.sessionId, (config) => config?.values.branch === "main-a");
    await provider.setSessionConfigValue(sessionA.sessionId, SessionConfigKey.Branch, "feature-a");
    const branchSelectionRequest = agentHost.resolveSessionConfigRequests.at(-1)?.config;
    await provider.setSessionConfigValue(sessionA.sessionId, SessionConfigKey.Isolation, "folder");
    provider.deleteNewSession(sessionA.sessionId);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder", branch: "current-b" }
    };
    const requestCountBeforeWorkspaceB = agentHost.resolveSessionConfigRequests.length;
    const sessionB = provider.createNewSession(URI.parse("file:///workspace-b"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, sessionB.sessionId, (config) => config?.values.branch === "current-b");
    assert.deepStrictEqual({
      branchSelectionRequest,
      rememberedValues: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
      workspaceBRequest: agentHost.resolveSessionConfigRequests[requestCountBeforeWorkspaceB]?.config,
      workspaceBResolved: provider.getSessionConfig(sessionB.sessionId)?.values
    }, {
      branchSelectionRequest: { isolation: "worktree", branch: "feature-a" },
      rememberedValues: { isolation: "folder" },
      workspaceBRequest: { isolation: "folder" },
      workspaceBResolved: { isolation: "folder", branch: "current-b" }
    });
  });
  test("caches resolved isolation/branch schema and seeds it into the next draft", async () => {
    agentHost.resolveSessionConfigResult = {
      schema: {
        type: "object",
        properties: {
          [SessionConfigKey.Isolation]: { title: "Isolation", type: "string", enum: ["folder", "worktree"], default: "worktree" },
          [SessionConfigKey.Branch]: { title: "Base Branch", type: "string", enum: ["main"] }
        }
      },
      values: { [SessionConfigKey.Isolation]: "worktree" }
    };
    const provider = createProvider(disposables, agentHost);
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.ok(first);
    agentHost.resolveSessionConfigResult = { schema: { type: "object", properties: {} }, values: {} };
    const second = provider.createNewSession(URI.parse("file:///home/user/b"), provider.sessionTypes[0].id);
    const seededKeys = Object.keys(provider.getSessionConfig(second.sessionId)?.schema.properties ?? {}).sort();
    await timeout(0);
    const afterResolveKeys = Object.keys(provider.getSessionConfig(second.sessionId)?.schema.properties ?? {});
    const third = provider.createNewSession(URI.parse("file:///home/user/c"), provider.sessionTypes[0].id);
    const thirdSeededKeys = Object.keys(provider.getSessionConfig(third.sessionId)?.schema.properties ?? {});
    assert.deepStrictEqual({ seededKeys, afterResolveKeys, thirdSeededKeys }, {
      seededKeys: [SessionConfigKey.Branch, SessionConfigKey.Isolation],
      afterResolveKeys: [],
      thirdSeededKeys: []
    });
  });
  test("createNewSession forwards git.worktreeIncludeFiles as derived session config", () => {
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("git.worktreeIncludeFiles", ["product.overrides.json", "**/node_modules/**"]);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config
    }, {
      seededImmediately: { worktreeIncludeFiles: ["product.overrides.json", "**/node_modules/**"] },
      forwardedToAgentHost: { worktreeIncludeFiles: ["product.overrides.json", "**/node_modules/**"] }
    });
  });
  test("createNewSession gives remembered autoApprove precedence over a configured setting while policy still clamps", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const policyRestrictedConfig = createPolicyRestrictedConfigurationService();
    await policyRestrictedConfig.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    const policyRestrictedProvider = createProvider(disposables, agentHost, void 0, { configurationService: policyRestrictedConfig, storageService });
    policyRestrictedProvider.createNewSession(URI.parse("file:///home/user/project"), policyRestrictedProvider.sessionTypes[0].id);
    const configuredDefaultConfig = new TestConfigurationService();
    await configuredDefaultConfig.setUserConfiguration("chat.defaultConfiguration", { approvals: "default" });
    const configuredDefaultProvider = createProvider(disposables, agentHost, void 0, { configurationService: configuredDefaultConfig, storageService });
    configuredDefaultProvider.createNewSession(URI.parse("file:///home/user/project"), configuredDefaultProvider.sessionTypes[0].id);
    assert.deepStrictEqual({
      policyRestricted: agentHost.resolveSessionConfigRequests.at(-2)?.config?.autoApprove,
      configuredDefault: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      policyRestricted: "default",
      configuredDefault: "autoApprove"
    });
  });
  test("createNewSession migrates a remembered legacy autoApprove=autopilot to mode=autopilot", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.AutoApprove]: "autopilot"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "autopilot",
      autoApprove: "default"
    });
  });
  test("createNewSession drops an invalid remembered mode instead of forwarding it", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "bogus"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.strictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config?.mode, void 0);
  });
  test("createNewSession seeds remembered mode/approvals when chat.defaultConfiguration is at its schema default", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "plan",
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, {
      configurationService: createSchemaDefaultConfigurationService(),
      storageService
    });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "plan",
      autoApprove: "autoApprove"
    });
  });
  test("createNewSession keeps remembered picks over an ordinary configured chat.defaultConfiguration setting", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "plan",
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const config = createSchemaDefaultConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { mode: "autopilot" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config, storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "plan",
      autoApprove: "autoApprove"
    });
  });
  test("createNewSession uses configured chat.defaultConfiguration when there is no remembered pick", async () => {
    const config = createSchemaDefaultConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { mode: "autopilot", approvals: "allowAll" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "autopilot",
      autoApprove: "autoApprove"
    });
  });
  test("createNewSession lets an enterprise policy chat.defaultConfiguration override remembered picks", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "plan",
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const config = new class extends TestConfigurationService {
      inspect(key) {
        const base = super.inspect(key);
        if (key === "chat.defaultConfiguration") {
          return { ...base, policyValue: { mode: "autopilot", approvals: "default" } };
        }
        return base;
      }
    }();
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config, storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "autopilot",
      autoApprove: "default"
    });
  });
  test("getSessionByResource resolves current new session without listing it", () => {
    const provider = createProvider(disposables, agentHost);
    const workspaceUri = URI.parse("file:///home/user/my-project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    const resolved = provider.getSessionByResource(session.resource);
    assert.deepStrictEqual({
      listedSessions: provider.getSessions().length,
      resolvedResource: resolved?.resource.toString(),
      resolvedWorkspaceLabel: resolved?.workspace.get()?.label
    }, {
      listedSessions: 0,
      resolvedResource: session.resource.toString(),
      resolvedWorkspaceLabel: "my-project"
    });
  });
  test("joins the active client with customizations when opening an existing session", () => {
    const activeSession = observableValue("activeSession", void 0);
    const activeClient = {
      tools: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "file:///customizations/test",
        uri: "file:///customizations/test",
        name: "Test Customization",
        enabled: true
      }]
    };
    const provider = createProvider(disposables, agentHost, void 0, { activeSession, activeClient });
    const resource = URI.from({ scheme: "agent-host-copilotcli", path: "/active-client" });
    activeSession.set({
      providerId: provider.id,
      sessionId: `${provider.id}:${resource.toString()}`,
      resource
    }, void 0);
    fireSessionAdded(agentHost, "active-client");
    assert.deepStrictEqual(agentHost.dispatchedActions.filter((dispatch) => dispatch.action.type === ActionType.SessionActiveClientSet), [{
      channel: AgentSession.uri("copilotcli", "active-client").toString(),
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: { clientId: "test-local-client", ...activeClient }
      },
      clientId: "test-local-client",
      clientSeq: 0
    }]);
  });
  test("createNewSession eagerly creates the backend session with the client-allocated URI", async () => {
    const provider = createProvider(disposables, agentHost);
    const workspaceUri = URI.parse("file:///home/user/my-project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const expectedBackendUri = AgentSession.uri(provider.sessionTypes[0].id, rawId);
    assert.deepStrictEqual(
      agentHost.createdSessionUris.map((u) => u.toString()),
      [expectedBackendUri.toString()],
      "eager createSession should be invoked with the client-allocated URI"
    );
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(expectedBackendUri.toString()),
      1,
      "a state subscription should be held while the new session view is active"
    );
  });
  test("createNewSession does not eagerly create the backend session in an untrusted folder", async () => {
    const provider = createProvider(disposables, agentHost, void 0, { workspaceTrusted: false });
    const workspaceUri = URI.parse("file:///home/user/untrusted-project");
    provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(
      agentHost.createdSessionUris.map((u) => u.toString()),
      [],
      "no eager createSession should be invoked for an untrusted folder"
    );
  });
  test("createNewSession disposes the previous eager backend session on workspace switch", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    await timeout(0);
    const firstRawId = first.resource.path.substring(1);
    const firstBackendUri = AgentSession.uri(sessionTypeId, firstRawId);
    const second = provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    provider.deleteNewSession(first.sessionId);
    await timeout(0);
    const secondRawId = second.resource.path.substring(1);
    const secondBackendUri = AgentSession.uri(sessionTypeId, secondRawId);
    assert.deepStrictEqual(
      agentHost.disposedSessions.map((u) => u.toString()),
      [firstBackendUri.toString()],
      "first backend session should be disposed when the workspace switches"
    );
    assert.deepStrictEqual(
      agentHost.createdSessionUris.map((u) => u.toString()),
      [firstBackendUri.toString(), secondBackendUri.toString()],
      "a fresh backend session should be created for the new workspace"
    );
  });
  test("eager createSession completes on the wire before getSubscription opens", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), provider.sessionTypes[0].id);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const backendKey = AgentSession.uri(provider.sessionTypes[0].id, rawId).toString();
    const ops = agentHost.wireOps.filter((op) => op.endsWith(backendKey));
    assert.deepStrictEqual(
      ops,
      [`createSession:${backendKey}`, `subscribe:${backendKey}`],
      "createSession must complete before subscribe is issued"
    );
  });
  test("no subscription is opened if eager createSession fails", async () => {
    const provider = createProvider(disposables, agentHost);
    agentHost.onCreateSession = async () => {
      throw new Error("auth required");
    };
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), provider.sessionTypes[0].id);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const backendKey = AgentSession.uri(provider.sessionTypes[0].id, rawId).toString();
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(backendKey),
      void 0,
      "no subscription should be opened when createSession rejects"
    );
  });
  test("workspace switch mid-createSession does not open a stale subscription", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const firstCreateGate = new DeferredPromise();
    agentHost.onCreateSession = () => firstCreateGate.p;
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    await timeout(0);
    const second = provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    provider.deleteNewSession(first.sessionId);
    await timeout(0);
    firstCreateGate.complete();
    await timeout(0);
    const firstBackendKey = AgentSession.uri(sessionTypeId, first.resource.path.substring(1)).toString();
    const secondBackendKey = AgentSession.uri(sessionTypeId, second.resource.path.substring(1)).toString();
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(firstBackendKey),
      void 0,
      "no subscription should be opened for the abandoned first session"
    );
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(secondBackendKey),
      1,
      "second session should still get its eager subscription"
    );
  });
  test("deleteSession calls disposeSession and removes from cache", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "del-sess", { title: "To Delete" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "To Delete");
    assert.ok(target);
    await provider.deleteSession(target.sessionId);
    assert.strictEqual(agentHost.disposedSessions.length, 1);
    const disposedUri = agentHost.disposedSessions[0];
    assert.strictEqual(AgentSession.provider(disposedUri), "copilotcli");
    assert.strictEqual(AgentSession.id(disposedUri), "del-sess");
    assert.strictEqual(provider.getSessions().find((s) => s.title.get() === "To Delete"), void 0);
  });
  test("deleteSessions disposes all sessions and removes them from cache", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "del-1", { title: "First" });
    fireSessionAdded(agentHost, "del-2", { title: "Second" });
    const first = provider.getSessions().find((s) => s.title.get() === "First");
    const second = provider.getSessions().find((s) => s.title.get() === "Second");
    assert.ok(first);
    assert.ok(second);
    await provider.deleteSessions([first.sessionId, second.sessionId]);
    assert.strictEqual(agentHost.disposedSessions.length, 2);
    assert.deepStrictEqual(agentHost.disposedSessions.map((uri) => AgentSession.id(uri)).sort(), ["del-1", "del-2"]);
    assert.strictEqual(provider.getSessions().find((s) => s.title.get() === "First"), void 0);
    assert.strictEqual(provider.getSessions().find((s) => s.title.get() === "Second"), void 0);
  });
  test("renameSession dispatches SessionTitleChanged on the session channel", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rename-sess", { title: "Old Title" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Old Title");
    assert.ok(target);
    await provider.renameSession(target.sessionId, "New Title");
    assert.strictEqual(agentHost.dispatchedActions.length, 1);
    const dispatched = agentHost.dispatchedActions[0];
    assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
    assert.strictEqual(dispatched.action.title, "New Title");
    const actionSession = dispatched.channel.toString();
    assert.strictEqual(AgentSession.provider(actionSession), "copilotcli");
    assert.strictEqual(AgentSession.id(actionSession), "rename-sess");
    assert.strictEqual(dispatched.clientId, "test-local-client");
  });
  test("renameSession updates the session title optimistically", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rename-opt", { title: "Before" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Before");
    assert.ok(target);
    await provider.renameSession(target.sessionId, "After");
    assert.strictEqual(target.title.get(), "After");
  });
  test("renameChat on the default chat renames the chat tab, not the session", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rename-default-chat", { title: "Session Title" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Session Title");
    assert.ok(target);
    await provider.renameChat(target.sessionId, target.mainChat.get().resource, "Chat Title");
    assert.strictEqual(target.title.get(), "Session Title");
    assert.strictEqual(target.mainChat.get().title.get(), "Chat Title");
    assert.strictEqual(agentHost.dispatchedActions.length, 1);
    const dispatched = agentHost.dispatchedActions[0];
    assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
    assert.strictEqual(dispatched.channel.toString(), buildDefaultChatUri(AgentSession.uri("copilotcli", "rename-default-chat").toString()));
  });
  test("renameChat is no-op for unknown session", async () => {
    const provider = createProvider(disposables, agentHost);
    await provider.renameChat("nonexistent-id", URI.parse("test://nonexistent"), "Ignored");
    assert.strictEqual(agentHost.dispatchedActions.length, 0);
  });
  suite("multi-chat catalog", () => {
    function makeChatSummary(resource, title, status = ProtocolSessionStatus.Idle) {
      return { resource, title, status, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
    }
    function makeState(chats, opts) {
      return {
        provider: "copilotcli",
        title: opts?.sessionTitle ?? "Session",
        status: ProtocolSessionStatus.Idle,
        lifecycle: SessionLifecycle.Ready,
        activeClients: [],
        chats,
        ...opts?.defaultChat ? { defaultChat: opts.defaultChat } : {}
      };
    }
    function setupMultiChatSession(provider, rawId) {
      fireSessionAdded(agentHost, rawId, { title: "Session" });
      const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === rawId);
      assert.ok(session);
      provider.getSessionConfig(session.sessionId);
      return session;
    }
    test("default + peer catalog surfaces both chats with the default as mainChat", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-1");
      const sessionUri = AgentSession.uri("copilotcli", "multi-1").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-1", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      assert.deepStrictEqual({
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        chatFragments: session.chats.get().map((c) => c.resource.fragment),
        mainIsDefault: session.mainChat.get() === session.chats.get()[0],
        peerTitle: session.chats.get()[1].title.get()
      }, {
        supportsMultipleChats: true,
        chatFragments: ["", "peer-1"],
        mainIsDefault: true,
        peerTitle: "Peer"
      });
    });
    test("peer chats map protocol interactivity to the provider-agnostic tri-state", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-ro");
      const sessionUri = AgentSession.uri("copilotcli", "multi-ro").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const readOnlyPeer = buildChatUri(sessionUri, "peer-ro");
      const hiddenPeer = buildChatUri(sessionUri, "peer-hidden");
      agentHost.setSessionState("multi-ro", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(readOnlyPeer, "Worker"), interactivity: ProtocolChatInteractivity.ReadOnly },
        { ...makeChatSummary(hiddenPeer, "Hidden Worker"), interactivity: ProtocolChatInteractivity.Hidden }
      ], { defaultChat }));
      const chats = session.chats.get();
      assert.deepStrictEqual(chats.map((c) => c.interactivity.get()), [
        ChatInteractivity.Full,
        ChatInteractivity.ReadOnly,
        ChatInteractivity.Hidden
      ]);
    });
    test("subagent (tool-origin) chats surface as read-only peers", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-sub");
      const sessionUri = AgentSession.uri("copilotcli", "multi-sub").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const subagentChat = buildSubagentChatUri(sessionUri, "tc-1");
      agentHost.setSessionState("multi-sub", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(subagentChat, "Code Reviewer"), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: "tc-1" }, interactivity: ProtocolChatInteractivity.ReadOnly }
      ], { defaultChat }));
      const chats = session.chats.get();
      assert.deepStrictEqual({
        titles: chats.map((c) => c.title.get()),
        interactivity: chats.map((c) => c.interactivity.get()),
        subagentOrigin: chats[1]?.origin?.kind,
        // The subagent records its parent chat (the default chat) so the
        // "Agents" row can list it under the chat that spawned it.
        subagentParentIsMain: !!chats[1]?.origin?.parentChat && isEqual(chats[1].origin.parentChat, chats[0].resource),
        // A subagent worker chat is neither renameable nor deletable.
        subagentCapabilities: getChatCapabilities(chats[1], session, void 0)
      }, {
        titles: ["Session", "Code Reviewer"],
        interactivity: [ChatInteractivity.Full, ChatInteractivity.ReadOnly],
        subagentOrigin: ChatOriginKind.Tool,
        subagentParentIsMain: true,
        subagentCapabilities: { canRename: false, canDelete: false }
      });
    });
    test("the main chat is renameable but never deletable via capabilities", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "main-caps");
      const sessionUri = AgentSession.uri("copilotcli", "main-caps").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("main-caps", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(peerChat, "Peer"), origin: { kind: ProtocolChatOriginKind.User } }
      ], { defaultChat }));
      const chats = session.chats.get();
      assert.deepStrictEqual({
        // The main (default) chat: renameable, never deletable.
        main: getChatCapabilities(chats[0], session, void 0),
        // A regular user peer chat: fully manageable.
        peer: getChatCapabilities(chats[1], session, void 0)
      }, {
        main: { canRename: true, canDelete: false },
        peer: { canRename: true, canDelete: true }
      });
    });
    test("subagent chats surface as read-only peers even without multi-chat support, but user peers do not", () => {
      agentHost.setAgents([
        { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
        { provider: "claude", displayName: "Claude", description: "", models: [] }
      ]);
      const configService = new TestConfigurationService();
      configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
      const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
      fireSessionAdded(agentHost, "claude-sub", { title: "Claude", provider: "claude" });
      const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "claude-sub");
      assert.ok(session);
      provider.getSessionConfig(session.sessionId);
      const sessionUri = AgentSession.uri("claude", "claude-sub").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const subagentChat = buildSubagentChatUri(sessionUri, "tc-1");
      const userPeer = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("claude-sub", "claude", {
        provider: "claude",
        title: "Claude",
        status: ProtocolSessionStatus.Idle,
        lifecycle: SessionLifecycle.Ready,
        activeClients: [],
        defaultChat,
        chats: [
          makeChatSummary(defaultChat, ""),
          { ...makeChatSummary(subagentChat, "Code Reviewer"), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: "tc-1" }, interactivity: ProtocolChatInteractivity.ReadOnly },
          { ...makeChatSummary(userPeer, "User Peer"), origin: { kind: ProtocolChatOriginKind.User } }
        ]
      });
      const chats = session.chats.get();
      assert.deepStrictEqual({
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        titles: chats.map((c) => c.title.get()),
        interactivity: chats.map((c) => c.interactivity.get())
      }, {
        supportsMultipleChats: false,
        // The user peer is not surfaced (no multi-chat support); the subagent is.
        titles: ["Claude", "Code Reviewer"],
        interactivity: [ChatInteractivity.Full, ChatInteractivity.ReadOnly]
      });
    });
    test("a new peer chat is presented as Untitled until its first request is sent", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-new");
      const sessionUri = AgentSession.uri("copilotcli", "multi-new").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      session.markChatAsNew("peer-1");
      agentHost.setSessionState("multi-new", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = () => session.chats.get().find((c) => c.resource.fragment === "peer-1");
      const whileNew = peer().status.get();
      session.markChatAsSent("peer-1");
      const afterSent = peer().status.get();
      assert.deepStrictEqual({ whileNew, afterSent }, {
        whileNew: SessionStatus.Untitled,
        afterSent: SessionStatus.Completed
      });
    });
    test("a peer catalog collapsed while capabilities were absent re-expands when they hydrate", () => {
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: {} }]);
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-late-caps");
      const sessionUri = AgentSession.uri("copilotcli", "multi-late-caps").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-late-caps", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const collapsed = {
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        chatFragments: session.chats.get().map((c) => c.resource.fragment)
      };
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }]);
      const hydrated = {
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        chatFragments: session.chats.get().map((c) => c.resource.fragment)
      };
      assert.deepStrictEqual({ collapsed, hydrated }, {
        collapsed: { supportsMultipleChats: false, chatFragments: [""] },
        hydrated: { supportsMultipleChats: true, chatFragments: ["", "peer-1"] }
      });
    });
    test("forkChat forwards the source chat and turn to the host and surfaces a new peer chat", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-fork");
      const sessionUri = AgentSession.uri("copilotcli", "multi-fork").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-fork", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      const forked = await provider.forkChat(session.sessionId, session.resource, "turn-1");
      const call = agentHost.createdChats.at(-1);
      assert.deepStrictEqual({
        forkSource: call?.options?.fork?.source.toString(),
        forkTurnId: call?.options?.fork?.turnId,
        forkedIsPeer: !!forked.resource.fragment,
        forkedInCatalog: session.chats.get().some((c) => c.resource.toString() === forked.resource.toString())
      }, {
        forkSource: defaultChat,
        forkTurnId: "turn-1",
        forkedIsPeer: true,
        forkedInCatalog: true
      });
    }));
    test("createSideChat forwards the source chat and turn to the host and surfaces a new peer chat", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } }]);
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-side-chat");
      const sessionUri = AgentSession.uri("copilotcli", "multi-side-chat").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-side-chat", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      assert.strictEqual(session.capabilities.get().supportsSideChat, true);
      const selection = { text: "  selected text  " };
      const sideChat = await provider.createSideChat(session.sessionId, session.resource, "turn-1", selection);
      const call = agentHost.createdChats.at(-1);
      assert.deepStrictEqual({
        sideChatSource: call?.options?.sideChat?.source.toString(),
        sideChatTurnId: call?.options?.sideChat?.turnId,
        sideChatSelection: call?.options?.sideChat?.selection,
        sideChatIsPeer: !!sideChat.resource.fragment,
        sideChatInCatalog: session.chats.get().some((c) => c.resource.toString() === sideChat.resource.toString())
      }, {
        sideChatSource: defaultChat,
        sideChatTurnId: "turn-1",
        sideChatSelection: selection,
        sideChatIsPeer: true,
        sideChatInCatalog: true
      });
    }));
    test("createSideChat inherits model and agent selection from the source peer chat", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } }]);
      const activeSession = observableValue("test.activeSession", void 0);
      const inputStates = [];
      const provider = createProvider(disposables, agentHost, void 0, {
        activeSession,
        lookupLanguageModel: createTestLanguageModel,
        acquireOrLoadSession: async (resource) => {
          const inputModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.state = constObservable(void 0);
            }
            setState(state) {
              inputStates.push({ resource: resource.toString(), state });
            }
            clearState() {
            }
            toJSON() {
              return void 0;
            }
          }();
          const chatModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.inputModel = inputModel;
            }
          }();
          return {
            object: chatModel,
            dispose() {
            }
          };
        }
      });
      const session = setupMultiChatSession(provider, "multi-side-chat-peer-selection");
      const sessionUri = AgentSession.uri("copilotcli", "multi-side-chat-peer-selection").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-side-chat-peer-selection", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer) }, void 0);
      provider.setModel(session.sessionId, "agent-host-copilotcli:peer-model");
      provider.setAgent?.(session.sessionId, { uri: "agent://peer", name: "peer" });
      const sideChat = await provider.createSideChat(session.sessionId, peer.resource, "turn-1");
      const call = agentHost.createdChats.at(-1);
      assert.deepStrictEqual({
        sideChatSource: call?.options?.sideChat?.source.toString(),
        createdModel: call?.options?.model,
        peerInputSelectedModels: inputStates.filter((entry) => entry.resource === sideChat.resource.toString()).map((entry) => entry.state.selectedModel?.identifier).filter((id) => id !== void 0),
        peerInputModes: inputStates.filter((entry) => entry.resource === sideChat.resource.toString()).map((entry) => entry.state.mode?.id).filter((id) => id !== void 0)
      }, {
        sideChatSource: peerChat,
        createdModel: { id: "peer-model" },
        peerInputSelectedModels: ["agent-host-copilotcli:peer-model"],
        peerInputModes: ["agent://peer"]
      });
    }));
    test("createSideChat rejects when the session capability is not advertised", async () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-side-chat-unsupported");
      await assert.rejects(() => provider.createSideChat(session.sessionId, session.resource, "turn-1"), /does not support side chats/);
    });
    test("createNewChat forwards the selected model to the host and seeds the chat input state", async () => {
      const inputStates = [];
      const provider = createProvider(disposables, agentHost, void 0, {
        lookupLanguageModel: createTestLanguageModel,
        acquireOrLoadSession: async (resource) => {
          const inputModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.state = constObservable(void 0);
            }
            setState(state) {
              inputStates.push({ resource: resource.toString(), state });
            }
            clearState() {
            }
            toJSON() {
              return void 0;
            }
          }();
          const chatModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.inputModel = inputModel;
            }
          }();
          return {
            object: chatModel,
            dispose() {
            }
          };
        }
      });
      const session = setupMultiChatSession(provider, "multi-model");
      const sessionUri = AgentSession.uri("copilotcli", "multi-model").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-model", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      provider.setModel(session.sessionId, "agent-host-copilotcli:selected-model");
      const chat = await provider.createNewChat(session.sessionId);
      assert.deepStrictEqual({
        createdModel: agentHost.createdChats.at(-1)?.options?.model,
        peerInputSelectedModels: inputStates.filter((entry) => entry.resource === chat.resource.toString()).map((entry) => entry.state.selectedModel?.identifier).filter((id) => id !== void 0)
      }, {
        createdModel: { id: "selected-model" },
        peerInputSelectedModels: ["agent-host-copilotcli:selected-model"]
      });
    });
    test("sendRequest keeps a peer chat model loaded while dispatching", async () => {
      const loadedResources = /* @__PURE__ */ new Set();
      const disposedResources = [];
      const sendSawLoaded = [];
      const provider = createProvider(disposables, agentHost, void 0, {
        acquireOrLoadSession: async (resource) => {
          const resourceKey = resource.toString();
          loadedResources.add(resourceKey);
          const inputModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.state = constObservable(void 0);
            }
            setState(_state) {
            }
            clearState() {
            }
            toJSON() {
              return void 0;
            }
          }();
          const chatModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.inputModel = inputModel;
            }
          }();
          return {
            object: chatModel,
            dispose() {
              loadedResources.delete(resourceKey);
              disposedResources.push(resourceKey);
            }
          };
        },
        sendRequest: async (resource) => {
          sendSawLoaded.push(loadedResources.has(resource.toString()));
          return { kind: "sent", data: {} };
        }
      });
      const session = setupMultiChatSession(provider, "multi-send-peer");
      const sessionUri = AgentSession.uri("copilotcli", "multi-send-peer").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-send-peer", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      await provider.sendRequest(session.sessionId, peer.resource, { query: "hello" });
      assert.deepStrictEqual({
        sendSawLoaded,
        loadedResources: [...loadedResources],
        disposedResources
      }, {
        sendSawLoaded: [true],
        loadedResources: [],
        disposedResources: [peer.resource.toString()]
      });
    });
    test("setModel updates the active peer chat model without changing the default chat model", () => {
      const activeSession = observableValue("test.activeSession", void 0);
      const provider = createProvider(disposables, agentHost, void 0, { activeSession });
      const session = setupMultiChatSession(provider, "multi-active-model");
      const sessionUri = AgentSession.uri("copilotcli", "multi-active-model").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-active-model", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer) }, void 0);
      provider.setModel(session.sessionId, "agent-host-copilotcli:peer-model");
      assert.deepStrictEqual({
        defaultModelId: session.mainChat.get().modelId.get(),
        peerModelId: peer.modelId.get()
      }, {
        defaultModelId: void 0,
        peerModelId: "agent-host-copilotcli:peer-model"
      });
    });
    test("deleteChat prompts for confirmation and disposes the peer chat when confirmed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const provider = createProvider(disposables, agentHost, void 0, { confirmDelete: true });
      const session = setupMultiChatSession(provider, "multi-del");
      const sessionUri = AgentSession.uri("copilotcli", "multi-del").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-del", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      await provider.deleteChat(session.sessionId, peer.resource);
      assert.deepStrictEqual(agentHost.disposedChats.map((u) => u.toString()), [peerChat]);
    }));
    test("deleteChat does not dispose the peer chat when the confirmation is cancelled", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const provider = createProvider(disposables, agentHost, void 0, { confirmDelete: false });
      const session = setupMultiChatSession(provider, "multi-del-cancel");
      const sessionUri = AgentSession.uri("copilotcli", "multi-del-cancel").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-del-cancel", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      await provider.deleteChat(session.sessionId, peer.resource);
      assert.deepStrictEqual(agentHost.disposedChats, []);
    }));
    test("single-chat catalog degrades to the default chat only", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-single");
      const sessionUri = AgentSession.uri("copilotcli", "multi-single").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-single", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      assert.deepStrictEqual({
        chatCount: session.chats.get().length,
        mainIsOnlyChat: session.mainChat.get() === session.chats.get()[0]
      }, {
        chatCount: 1,
        mainIsOnlyChat: true
      });
    });
    test("removing a peer from the catalog drops it back to the default chat", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-remove");
      const sessionUri = AgentSession.uri("copilotcli", "multi-remove").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-remove", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const afterAdd = session.chats.get().length;
      agentHost.setSessionState("multi-remove", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      assert.deepStrictEqual({
        afterAdd,
        afterRemove: session.chats.get().map((c) => c.resource.fragment)
      }, {
        afterAdd: 2,
        afterRemove: [""]
      });
    });
    test("default chat title diverges from the session title when renamed in the catalog", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-title");
      const sessionUri = AgentSession.uri("copilotcli", "multi-title").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-title", "copilotcli", makeState([
        makeChatSummary(defaultChat, "Renamed Default"),
        makeChatSummary(peerChat, "Peer")
      ], { sessionTitle: "Session", defaultChat }));
      assert.deepStrictEqual({
        sessionTitle: session.title.get(),
        defaultChatTitle: session.mainChat.get().title.get()
      }, {
        sessionTitle: "Session",
        defaultChatTitle: "Renamed Default"
      });
    });
  });
  test("server-echoed SessionTitleChanged updates cached title", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "echo-sess", { title: "Original" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Original");
    assert.ok(target);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "echo-sess").toString(),
      action: {
        type: ActionType.SessionTitleChanged,
        title: "Server Title"
      },
      serverSeq: 1,
      origin: void 0
    });
    assert.strictEqual(target.title.get(), "Server Title");
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].changed.length, 1);
  });
  test("server-echoed ChatTurnStarted model does not update cached session model", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "model-change", { title: "Model Change" });
    const target = provider.getSessions().find((s) => s.title.get() === "Model Change");
    assert.ok(target);
    provider.setModel(target.sessionId, "agent-host-copilotcli:old-model");
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "model-change").toString(),
      action: {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "new-model" } }
      },
      serverSeq: 1,
      origin: void 0
    });
    assert.strictEqual(target.modelId.get(), "agent-host-copilotcli:old-model");
    assert.strictEqual(changes.length, 0);
  });
  test("turnComplete action triggers session refresh", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("turn-sess", { summary: "Before", modifiedTime: 1e3 }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    agentHost.addSession(createSession("turn-sess", { summary: "After", modifiedTime: 5e3 }));
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "turn-sess").toString()),
      action: {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.ok(changes.length > 0);
    const updatedSession = provider.getSessions().find((s) => s.title.get() === "After");
    assert.ok(updatedSession);
  }));
  test("session adapter has correct workspace from working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("ws-sess", { summary: "WS Test", workingDirectory: URI.parse("file:///home/user/myrepo") }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const wsSession = sessions.find((s) => s.title.get() === "WS Test");
    assert.ok(wsSession);
    const workspace = wsSession.workspace.get();
    assert.ok(workspace);
    assert.strictEqual(workspace.label, "myrepo");
  }));
  test("session adapter without working directory has no workspace", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("no-ws-sess", { summary: "No WS" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const session = sessions.find((s) => s.title.get() === "No WS");
    assert.ok(session);
    assert.strictEqual(session.workspace.get(), void 0);
  }));
  test("session adapter uses raw ID as fallback title", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("abcdef1234567890"));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const session = sessions[0];
    assert.ok(session);
    assert.strictEqual(session.title.get(), "Session abcdef12");
  }));
  test("new session stays loading when required config is missing", async () => {
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
      values: {}
    };
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.schema.required?.includes("branch") === true);
    assert.strictEqual(session.loading.get(), true);
  });
  test("cached session loading reflects authenticationPending", async () => {
    agentHost.setAuthenticationPending(true);
    agentHost.addSession(createSession("cached-auth-loading", { summary: "Cached" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Cached");
    assert.ok(session);
    assert.strictEqual(session.loading.get(), true);
    agentHost.setAuthenticationPending(false);
    assert.strictEqual(session.loading.get(), false);
  });
  test("new session defers backend startup until authentication settles", async () => {
    agentHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: true,
      createdSessions: 0,
      resolveRequests: 0,
      config: { schema: { type: "object", properties: {} }, values: {} }
    });
    agentHost.setAuthenticationPending(false);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: false,
      createdSessions: 1,
      resolveRequests: 1,
      config: { schema: { type: "object", properties: {} }, values: { isolation: "worktree" } }
    });
  });
  test("new session stays loading after authentication settles when required config is missing", async () => {
    agentHost.setAuthenticationPending(true);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
      values: {}
    };
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: true,
      createdSessions: 0,
      resolveRequests: 0,
      config: { schema: { type: "object", properties: {} }, values: {} }
    });
    agentHost.setAuthenticationPending(false);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.schema.required?.includes("branch") === true);
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: true,
      createdSessions: 1,
      resolveRequests: 1,
      config: {
        schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
        values: {}
      }
    });
  });
  test("sendRequest throws for unknown session", async () => {
    const provider = createProvider(disposables, agentHost);
    await assert.rejects(
      () => provider.sendRequest("nonexistent", URI.parse("untitled:chat"), { query: "test" }),
      /not found/
    );
  });
  test("sendRequest only commits a session of the same type, ignoring a foreign-type session that appears mid-send", async () => {
    const codexAndClaude = [
      { type: "agent-host-codex", name: "codex", displayName: "Codex", description: "test", icon: void 0 },
      { type: "agent-host-claude", name: "claude", displayName: "Claude", description: "test", icon: void 0 }
    ];
    agentHost.setAgents([
      { provider: "codex", displayName: "Codex", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
    const provider = createProvider(disposables, agentHost, codexAndClaude, {
      openSession: true,
      configurationService,
      sendRequest: async () => {
        agentHost.addSession(createSession("foreign-claude", { provider: "claude", summary: "Foreign Claude" }));
        agentHost.addSession(createSession("real-codex", { provider: "codex", summary: "Real Codex" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), "codex");
    const chat = await provider.createNewChat(session.sessionId);
    const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.strictEqual(committed.resource.scheme, "agent-host-codex", `expected the committed session to be the codex session, got ${committed.resource.toString()}`);
  });
  test("sendRequest waits beyond 30 seconds for the backend session to commit", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const chat = await provider.createNewChat(session.sessionId);
    const request = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    await timeout(0);
    await timeout(30001);
    agentHost.addSession(createSession(session.sessionId, { summary: "Committed Late" }));
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", session.sessionId).toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    const committed = await request;
    assert.strictEqual(committed.title.get(), "Committed Late");
  }));
  test("sendRequest rejects when the provisional session is abandoned before commit", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const chat = await provider.createNewChat(session.sessionId);
    const rejection = assert.rejects(
      provider.sendRequest(session.sessionId, chat.resource, { query: "hello" }),
      /session was not committed/
    );
    await timeout(0);
    provider.deleteNewSession(session.sessionId);
    await rejection;
    assert.deepStrictEqual(changes.map((change) => ({
      added: change.added.map((session2) => session2.resource.toString()),
      removed: change.removed.map((session2) => session2.resource.toString())
    })), [
      { added: [session.resource.toString()], removed: [] },
      { added: [], removed: [session.resource.toString()] }
    ]);
  });
  test("two concurrent same-type new-session sends each commit to their own session (no swap during a shared download window)", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    const sessionTypeId = provider.sessionTypes[0].id;
    const sessionA = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    const chatA = await provider.createNewChat(sessionA.sessionId);
    const ownA = AgentSession.id(chatA.resource.toString());
    const sessionB = provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    const chatB = await provider.createNewChat(sessionB.sessionId);
    const ownB = AgentSession.id(chatB.resource.toString());
    const sendA = provider.sendRequest(sessionA.sessionId, chatA.resource, { query: "A" });
    const sendB = provider.sendRequest(sessionB.sessionId, chatB.resource, { query: "B" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireSessionAdded(agentHost, ownB, { title: "B" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireSessionAdded(agentHost, ownA, { title: "A" });
    const [committedA, committedB] = await Promise.all([sendA, sendB]);
    assert.deepStrictEqual(
      { a: AgentSession.id(committedA.resource.toString()), b: AgentSession.id(committedB.resource.toString()) },
      { a: ownA, b: ownB }
    );
  });
  test("sendRequest forwards resolved session config to chat service", async () => {
    const sendOptions = [];
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async (_resource, _message, options) => {
        if (options) {
          sendOptions.push(options);
        }
        agentHost.addSession(createSession("created-from-send", { summary: "Created From Send" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.deepStrictEqual(sendOptions.map((options) => options.agentHostSessionConfig), [{ isolation: "worktree" }]);
  });
  test("sendRequest clears chat input draft while preserving selected model and agent", async () => {
    const inputStates = [];
    const languageModel = createTestLanguageModel("selected-model");
    const provider = createProvider(disposables, agentHost, void 0, {
      lookupLanguageModel: (modelId) => modelId === "agent-host-copilotcli:selected-model" ? languageModel : void 0,
      acquireOrLoadSession: async () => {
        const inputModel = new class extends mock() {
          constructor() {
            super(...arguments);
            this.state = constObservable(void 0);
          }
          setState(state) {
            inputStates.push(state);
          }
          clearState() {
          }
          toJSON() {
            return void 0;
          }
        }();
        const chatModel = new class extends mock() {
          constructor() {
            super(...arguments);
            this.inputModel = inputModel;
          }
        }();
        return {
          object: chatModel,
          dispose() {
          }
        };
      }
    });
    fireSessionAdded(agentHost, "send-draft", { title: "Send Draft Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Send Draft Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "agent-host-copilotcli:selected-model");
    provider.setAgent?.(session.sessionId, { uri: "agent://review", name: "review" });
    agentHost.dispatchedActions.length = 0;
    inputStates.length = 0;
    await provider.sendRequest(session.sessionId, session.resource, { query: "hello" });
    assert.deepStrictEqual({
      protocolDraftActions: agentHost.dispatchedActions.filter((d) => d.action.type === ActionType.ChatDraftChanged).length,
      hasSelectedModelUpdate: inputStates.some((state) => state.selectedModel?.identifier === "agent-host-copilotcli:selected-model"),
      lastInputState: inputStates.at(-1)
    }, {
      protocolDraftActions: 0,
      hasSelectedModelUpdate: true,
      lastInputState: {
        mode: { id: "agent://review", kind: ChatModeKind.Agent },
        inputText: "",
        attachments: [],
        selections: []
      }
    });
  });
  test("getSessionConfig seeds running config from session state subscription with full schema", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("seed-1", { summary: "Seeded Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Seeded Session");
    assert.ok(session);
    assert.strictEqual(provider.getSessionConfig(session.sessionId), void 0);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"], readOnly: true }
        }
      },
      values: { autoApprove: "default", isolation: "worktree" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Seeded Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("seed-1", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    const seeded = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual({
      properties: Object.keys(seeded?.schema.properties ?? {}).sort(),
      values: seeded?.values
    }, {
      properties: ["autoApprove", "isolation"],
      values: { autoApprove: "default", isolation: "worktree" }
    });
  }));
  test("running config state seeding preserves already-resolved schema properties", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("seed-schema", { summary: "Schema Preserve Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Schema Preserve Session");
    assert.ok(session);
    const fullState = {
      provider: "copilotcli",
      title: "Schema Preserve Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config: {
        schema: {
          type: "object",
          properties: {
            "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true },
            "codex.networkAccessEnabled": { type: "boolean", title: "Network", default: false, sessionMutable: true }
          }
        },
        values: { "codex.sandboxMode": "workspace-write", "codex.networkAccessEnabled": false }
      }
    };
    agentHost.setSessionState("seed-schema", "copilotcli", fullState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.schema.properties["codex.networkAccessEnabled"] !== void 0);
    agentHost.setSessionState("seed-schema", "copilotcli", {
      ...fullState,
      config: {
        schema: {
          type: "object",
          properties: {
            "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true }
          }
        },
        values: { "codex.sandboxMode": "workspace-write" }
      }
    });
    assert.deepStrictEqual({
      properties: Object.keys(provider.getSessionConfig(session.sessionId)?.schema.properties ?? {}).sort(),
      values: provider.getSessionConfig(session.sessionId)?.values
    }, {
      properties: ["codex.networkAccessEnabled", "codex.sandboxMode"],
      values: { "codex.sandboxMode": "workspace-write", "codex.networkAccessEnabled": false }
    });
  }));
  test("removing a session disposes its session-state subscription", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("seed-2", { summary: "Sub Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Sub Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    const sessionUriStr = AgentSession.uri("copilotcli", "seed-2").toString();
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);
    fireSessionRemoved(agentHost, "seed-2");
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr), 1);
  }));
  test("session-state subscription auto-releases after the idle window", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("idle-1", { summary: "Idle Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Idle Session");
    assert.ok(session);
    const sessionUriStr = AgentSession.uri("copilotcli", "idle-1").toString();
    provider.getSessionConfig(session.sessionId);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);
    await timeout(2e4);
    provider.getSessionConfig(session.sessionId);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1, "still one wire subscribe");
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0, "no unsubscribe yet (timer reset)");
    await timeout(31e3);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr), 1, "wire unsubscribe after idle window");
    provider.getSessionConfig(session.sessionId);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 2, "fresh subscribe after release");
  }));
  test.skip("keeps a resolved PR number sticky across gitHubInfo recomputes (no re-lookup / icon flap)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.lookupCalls = 0;
        this._model = { pullRequest: constObservable(void 0) };
        this.findPullRequestNumberByHeadBranch = async () => {
          this.lookupCalls++;
          return 42;
        };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("pr-sticky", { summary: "PR Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "PR Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("pr-sticky", "copilotcli", {
      provider: "copilotcli",
      title: "PR Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: { git: { hasGitHubRemote: true, githubOwner: "owner", githubRepo: "repo", branchName: "feature" } }
    });
    const gitHubInfoObs = session.workspace.get().folders[0].gitRepository.gitHubInfo;
    const sub1 = autorun((reader) => {
      gitHubInfoObs.read(reader);
    });
    await timeout(0);
    assert.strictEqual(gitHubInfoObs.get()?.pullRequest?.number, 42, "PR number resolves while observed");
    assert.strictEqual(gitHubService.lookupCalls, 1, "one PR-number lookup after first resolution");
    sub1.dispose();
    let firstReObservedNumber;
    let captured = false;
    const sub2 = autorun((reader) => {
      const number = gitHubInfoObs.read(reader)?.pullRequest?.number;
      if (!captured) {
        firstReObservedNumber = number;
        captured = true;
      }
    });
    assert.strictEqual(firstReObservedNumber, 42, "PR number stays sticky across unobserve/reobserve");
    assert.strictEqual(gitHubService.lookupCalls, 1, "no extra PR-number lookup on recompute");
    sub2.dispose();
  }));
  test("surfaces a default open-PR icon immediately when a PR is detected before the live model loads", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this._model = { pullRequest: constObservable(void 0) };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("pr-default-icon", { summary: "PR Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "PR Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("pr-default-icon", "copilotcli", {
      provider: "copilotcli",
      title: "PR Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: { github: { owner: "owner", repo: "repo", pullRequestUrl: "https://github.com/owner/repo/pull/42" } }
    });
    const gitHubInfoObs = session.workspace.get().folders[0].gitRepository.gitHubInfo;
    const sub = autorun((reader) => {
      gitHubInfoObs.read(reader);
    });
    await timeout(0);
    const pullRequest = gitHubInfoObs.get()?.pullRequest;
    assert.strictEqual(pullRequest?.number, 42, "PR is detected from the GitHub state URL");
    assert.deepStrictEqual(pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open), "a default open-PR icon is shown immediately while the live model is empty");
    sub.dispose();
  }));
  test("replaceSessionConfig only replaces sessionMutable, non-readOnly values and preserves everything else", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("rep-1", { summary: "Replace Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Replace Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] },
          // non-mutable
          branch: { type: "string", title: "Branch", enum: ["main"], sessionMutable: true, readOnly: true }
          // readOnly
        }
      },
      values: { autoApprove: "default", isolation: "worktree", branch: "main" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Replace Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("rep-1", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    await provider.replaceSessionConfig(session.sessionId, {
      autoApprove: "autoApprove",
      isolation: "folder",
      branch: "other",
      rogue: "ignored"
    });
    const sessionUri = AgentSession.uri("copilotcli", "rep-1").toString();
    const configChanged = agentHost.dispatchedActions.find((d) => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
    assert.ok(configChanged, "a SessionConfigChanged action should be dispatched");
    assert.deepStrictEqual(configChanged.action, {
      type: ActionType.SessionConfigChanged,
      config: { autoApprove: "autoApprove", isolation: "worktree", branch: "main" },
      replace: true
    });
    const latest = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual(latest?.values, { autoApprove: "autoApprove", isolation: "worktree", branch: "main" });
  }));
  test("running session config writes clamp autoApprove to default when policy disables global auto-approve", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("policy-write", { summary: "Policy Write Session" }));
    const configService = createPolicyRestrictedConfigurationService();
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Policy Write Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove", "autopilot"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"], sessionMutable: true }
        }
      },
      values: { autoApprove: "default", isolation: "worktree" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Policy Write Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("policy-write", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, "autopilot");
    const sessionUri = AgentSession.uri("copilotcli", "policy-write").toString();
    const setConfigChanged = agentHost.dispatchedActions.find((d) => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
    agentHost.dispatchedActions.length = 0;
    await provider.replaceSessionConfig(session.sessionId, {
      autoApprove: "autoApprove",
      isolation: "folder"
    });
    const replaceConfigChanged = agentHost.dispatchedActions.find((d) => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
    assert.deepStrictEqual({
      setAction: setConfigChanged?.action,
      replaceAction: replaceConfigChanged?.action,
      latestValues: provider.getSessionConfig(session.sessionId)?.values
    }, {
      setAction: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "default" }
      },
      replaceAction: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "default", isolation: "folder" },
        replace: true
      },
      latestValues: { autoApprove: "default", isolation: "folder" }
    });
  }));
  test("running session config write re-resolves schema-dependent properties", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("schema-write", { summary: "Schema Write Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Schema Write Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true },
          "codex.networkAccessEnabled": { type: "boolean", title: "Network", default: false, sessionMutable: true }
        }
      },
      values: { "codex.sandboxMode": "workspace-write", "codex.networkAccessEnabled": false }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Schema Write Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("schema-write", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values["codex.sandboxMode"] === "workspace-write");
    agentHost.resolveSessionConfigResult = {
      schema: {
        type: "object",
        properties: {
          "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true }
        }
      },
      values: { "codex.sandboxMode": "read-only" }
    };
    await provider.setSessionConfigValue(session.sessionId, "codex.sandboxMode", "read-only");
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.schema.properties["codex.networkAccessEnabled"] === void 0);
    assert.deepStrictEqual({
      resolveConfig: agentHost.resolveSessionConfigRequests.at(-1)?.config,
      properties: Object.keys(provider.getSessionConfig(session.sessionId)?.schema.properties ?? {}).sort(),
      values: provider.getSessionConfig(session.sessionId)?.values
    }, {
      resolveConfig: { "codex.sandboxMode": "read-only", "codex.networkAccessEnabled": false },
      properties: ["codex.sandboxMode"],
      values: { "codex.sandboxMode": "read-only" }
    });
    agentHost.setSessionState("schema-write", "copilotcli", {
      ...fakeState,
      config: {
        ...config,
        values: { "codex.sandboxMode": "read-only", "codex.networkAccessEnabled": true }
      }
    });
    assert.deepStrictEqual({
      properties: Object.keys(provider.getSessionConfig(session.sessionId)?.schema.properties ?? {}).sort(),
      values: provider.getSessionConfig(session.sessionId)?.values
    }, {
      properties: ["codex.sandboxMode"],
      values: { "codex.sandboxMode": "read-only" }
    });
  }));
  test("replaceSessionConfig is a no-op when nothing editable actually changes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("rep-2", { summary: "No-op Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "No-op Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] }
        }
      },
      values: { autoApprove: "default", isolation: "worktree" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "No-op Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("rep-2", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    const before = agentHost.dispatchedActions.length;
    await provider.replaceSessionConfig(session.sessionId, { autoApprove: "default" });
    assert.strictEqual(agentHost.dispatchedActions.length, before, "no action should be dispatched");
  }));
  test("server-echoed SessionConfigChanged merges config values into the running cache by default", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("cfg-merge", { summary: "Merge Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Merge Session");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "Merge Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config: {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
            isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] }
          }
        },
        values: { autoApprove: "default", isolation: "worktree" }
      }
    };
    agentHost.setSessionState("cfg-merge", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "cfg-merge").toString(),
      action: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      },
      serverSeq: 1,
      origin: void 0
    });
    const updated = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual(updated?.values, { autoApprove: "autoApprove", isolation: "worktree" });
  }));
  test("server-echoed SessionConfigChanged with replace:true overwrites the running cache", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("cfg-replace", { summary: "Replace Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Replace Session");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "Replace Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config: {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
            mode: { type: "string", title: "Mode", enum: ["a", "b"], sessionMutable: true },
            isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] }
          }
        },
        values: { autoApprove: "default", mode: "a", isolation: "worktree" }
      }
    };
    agentHost.setSessionState("cfg-replace", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "cfg-replace").toString(),
      action: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove", isolation: "worktree" },
        replace: true
      },
      serverSeq: 1,
      origin: void 0
    });
    const updated = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual(updated?.values, { autoApprove: "autoApprove", isolation: "worktree" });
  }));
  test("keeps a visible session subscribed so host-spawned subagent chats keep reaching the catalog", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("subagent-live", { summary: "Lead" }));
    const visibleSessions = observableValue("visible", []);
    const provider = createProvider(disposables, agentHost, void 0, { visibleSessions });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    visibleSessions.set([new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = session.resource;
      }
    }()], void 0);
    const sessionUri = AgentSession.uri("copilotcli", "subagent-live").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    const subagentOne = buildSubagentChatUri(sessionUri, "tc-1");
    const subagentTwo = buildSubagentChatUri(sessionUri, "tc-2");
    const toolChat = (resource, toolCallId, title) => ({
      resource,
      title,
      status: ProtocolSessionStatus.InProgress,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId }
    });
    const stateWith = (chats) => ({
      provider: "copilotcli",
      title: "Lead",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      chats
    });
    const defaultSummary = { resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
    agentHost.setSessionState("subagent-live", "copilotcli", stateWith([defaultSummary, toolChat(subagentOne, "tc-1", "Add name to README")]));
    assert.ok(session.chats.get().some((c) => c.resource.fragment === "subagent/tc-1"), "first subagent should reach the catalog while visible");
    await timeout(12e4);
    agentHost.setSessionState("subagent-live", "copilotcli", stateWith([
      defaultSummary,
      toolChat(subagentOne, "tc-1", "Add name to README"),
      toolChat(subagentTwo, "tc-2", "Add description to package.json")
    ]));
    assert.deepStrictEqual(
      session.chats.get().map((c) => c.resource.fragment).filter((f) => f.startsWith("subagent/")).sort(),
      ["subagent/tc-1", "subagent/tc-2"],
      "both subagents should reach the catalog after the idle window while the session stays visible"
    );
  }));
});
suite.skip("LocalAgentHostSessionsProvider - active-session branch changeset subscription", () => {
  const disposables = new DisposableStore();
  let agentHost;
  let activeSession;
  setup(() => {
    agentHost = disposables.add(new MockAgentHostService());
    activeSession = observableValue("test.activeSession", void 0);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeActive(rawId, sessionType = "copilotcli", status = SessionStatus.Completed) {
    return {
      // providerId: 'unused',
      sessionType,
      resource: URI.from({ scheme: `agent-host-${sessionType}`, path: `/${rawId}` }),
      status: constObservable(status)
    };
  }
  function branchChangesKeyFor(rawId, sessionType = "copilotcli") {
    return `${AgentSession.uri(sessionType, rawId).toString()}/changeset/branch`;
  }
  function observeSession(session) {
    disposables.add(autorun((reader) => {
      session.changes.read(reader);
      session.changesSummary?.read(reader);
    }));
  }
  function addAndObserve(provider, rawId, opts) {
    fireSessionAdded(agentHost, rawId, { title: `Session ${rawId}`, changes: opts?.changes });
    const session = provider.getSessions().find((s) => s.title.get() === `Session ${rawId}`);
    assert.ok(session, `expected session ${rawId}`);
    observeSession(session);
    return session;
  }
  test("subscribes to the branch changeset when the session becomes active", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    const key = branchChangesKeyFor("sess-A");
    assert.ok(
      agentHost.wireOps.includes(`subscribe:${key}`),
      `expected a subscribe for ${key}, got wireOps=${JSON.stringify(agentHost.wireOps)}`
    );
  });
  test("rotates the subscription when the active session changes", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    addAndObserve(provider, "sess-B");
    activeSession.set(makeActive("sess-A"), void 0);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0, 1, "A should be subscribed once on activation");
    activeSession.set(makeActive("sess-B"), void 0);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-B")) ?? 0, 1, "B should be subscribed once on activation");
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0, 1, "A should be unsubscribed when no longer active");
  });
  test("switching back to a previously-active session re-subscribes", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    addAndObserve(provider, "sess-B");
    activeSession.set(makeActive("sess-A"), void 0);
    activeSession.set(makeActive("sess-B"), void 0);
    activeSession.set(makeActive("sess-A"), void 0);
    const subsForA = agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0;
    assert.strictEqual(subsForA, 2, "switching back to A must open a fresh subscription");
  });
  test("does NOT subscribe when a different session is active", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-other"), void 0);
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0,
      0,
      "no branch changeset subscription should open while a different session is active"
    );
  });
  test("does NOT subscribe to uncommitted changes for an untitled active session", () => {
    createProvider(disposables, agentHost, void 0, { activeSession });
    activeSession.set(makeActive("sess-new", "copilotcli", SessionStatus.Untitled), void 0);
    const subKeys = [...agentHost.sessionSubscribeCounts.keys()].filter((k) => k.endsWith("/changeset/uncommitted"));
    assert.deepStrictEqual(subKeys, [], "new-session composer should not restore the backend session just to refresh changes");
  });
  test("releases the subscription when no session is active", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    activeSession.set(void 0, void 0);
    const unsubsForA = agentHost.sessionUnsubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0;
    assert.strictEqual(unsubsForA, 1, "leaving the agents window (no active session) must release the subscription");
  });
  test("active branch changeset uses before content URI as the diff original", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    agentHost.setChangesetState(branchChangesKeyFor("sess-A"), {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///repo/file.ts",
        edit: {
          before: { uri: "file:///repo/file.ts", content: { uri: "session-db:///before/file.ts" } },
          after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } },
          diff: { added: 2, removed: 1 }
        }
      }]
    });
    const changes = session.changes.get();
    assert.deepStrictEqual(changes.map((change) => {
      assert.ok(isIChatSessionFileChange2(change));
      return {
        uri: change.uri.toString(),
        originalUri: change.originalUri?.toString(),
        modifiedUri: change.modifiedUri?.toString(),
        insertions: change.insertions,
        deletions: change.deletions
      };
    }), [{
      uri: "file:///repo/file.ts",
      originalUri: "vscode-agent-host://local/before/file.ts?_ah%3DeyJzY2hlbWUiOiJzZXNzaW9uLWRiIn0",
      modifiedUri: "file:///repo/file.ts",
      insertions: 2,
      deletions: 1
    }]);
  }));
  test("changes summary tracks the live branch changeset while active and the catalogue once inactive", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    agentHost.setChangesetState(branchChangesKeyFor("sess-A"), {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///repo/file.ts",
        edit: {
          before: { uri: "file:///repo/file.ts", content: { uri: "session-db:///before/file.ts" } },
          after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } },
          diff: { added: 2, removed: 1 }
        }
      }]
    });
    activeSession.set(makeActive("sess-A"), void 0);
    assert.deepStrictEqual(session.changesSummary?.get(), { additions: 2, deletions: 1, files: 1 });
    activeSession.set(makeActive("sess-B"), void 0);
    fireSessionSummaryChanged(agentHost, "sess-A", { changes: { additions: 5, deletions: 3, files: 1 } });
    assert.deepStrictEqual(session.changesSummary?.get(), { additions: 5, deletions: 3, files: 1 });
  });
  function makeChangesetFile(index, version) {
    const path = `file:///repo/src/file-${index}.ts`;
    return {
      id: path,
      edit: {
        before: { uri: path, content: { uri: `session-db:///before/file-${index}.ts` } },
        after: { uri: path, content: { uri: path } },
        diff: { added: version, removed: 0 }
      }
    };
  }
  test("rebuilds only the changed file across many changeset updates (O(changed), not O(all))", () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e3 }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    const FILE_COUNT = 200;
    const UPDATE_COUNT = 100;
    const key = branchChangesKeyFor("sess-A");
    const files = [];
    for (let i = 0; i < FILE_COUNT; i++) {
      files.push(makeChangesetFile(i, 0));
    }
    agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
    let previous = session.changes.get();
    assert.strictEqual(previous.length, FILE_COUNT, "every file should surface as a change");
    for (let update = 0; update < UPDATE_COUNT; update++) {
      const changedIndex = update % FILE_COUNT;
      files[changedIndex] = makeChangesetFile(changedIndex, update + 1);
      agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
      const next = session.changes.get();
      let rebuilt = 0;
      for (let i = 0; i < FILE_COUNT; i++) {
        if (next[i] !== previous[i]) {
          rebuilt++;
        }
      }
      assert.strictEqual(rebuilt, 1, `update ${update}: exactly one change object should be rebuilt, but ${rebuilt} of ${FILE_COUNT} were`);
      previous = next;
    }
  }));
  test("an untouched file keeps its change-object identity while another file streams updates", () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e3 }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    const FILE_COUNT = 50;
    const UPDATE_COUNT = 100;
    const key = branchChangesKeyFor("sess-A");
    const files = [];
    for (let i = 0; i < FILE_COUNT; i++) {
      files.push(makeChangesetFile(i, 0));
    }
    agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
    const untouchedChangeBefore = session.changes.get()[0];
    assert.ok(untouchedChangeBefore, "the untouched file should have a change object to begin with");
    const lastIndex = FILE_COUNT - 1;
    for (let update = 0; update < UPDATE_COUNT; update++) {
      files[lastIndex] = makeChangesetFile(lastIndex, update + 1);
      agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
      session.changes.get();
    }
    const untouchedChangeAfter = session.changes.get()[0];
    assert.strictEqual(untouchedChangeAfter, untouchedChangeBefore, "an unchanged file must reuse its change object across all updates");
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvbG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIEltbW9ydGFsUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUsIHR5cGUgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHlwZSBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRTZXNzaW9uLCBDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsIENsYXVkZVByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZCwgSUFnZW50SG9zdFNlcnZpY2UsIHR5cGUgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIHR5cGUgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZywgdHlwZSBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHkgYXMgUHJvdG9jb2xDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQgYXMgUHJvdG9jb2xDaGF0T3JpZ2luS2luZCwgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIE1lc3NhZ2VLaW5kLCBTZXNzaW9uTGlmZWN5Y2xlLCB0eXBlIEFnZW50SW5mbywgdHlwZSBDaGFuZ2VzU3VtbWFyeSwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIFJvb3RTdGF0ZSwgdHlwZSBTZXNzaW9uQWN0aXZlQ2xpZW50LCB0eXBlIFNlc3Npb25Db25maWdTdGF0ZSwgdHlwZSBTZXNzaW9uU3RhdGUsIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgYnVpbGRTdWJhZ2VudENoYXRVcmksIENoYW5nZXNldFN0YXR1cywgU2Vzc2lvblN0YXR1cyBhcyBQcm90b2NvbFNlc3Npb25TdGF0dXMsIFN0YXRlQ29tcG9uZW50cywgd2l0aFNlc3Npb25HaXRTdGF0ZSwgd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB0eXBlIENoYW5nZXNldFN0YXRlLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBDaGF0U3VtbWFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIE5vdGlmaWNhdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUsIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIENoYXRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFjdGlvbiwgdHlwZSBUZXJtaW5hbEFjdGlvbiwgdHlwZSBJTm90aWZpY2F0aW9uLCB0eXBlIENsaWVudEFubm90YXRpb25zQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCB0eXBlIENoYXRTZW5kUmVzdWx0LCB0eXBlIElDaGF0TW9kZWxSZWZlcmVuY2UsIHR5cGUgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHR5cGUgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0TW9kZWwsIElDaGF0TW9kZWxJbnB1dFN0YXRlLCBJSW5wdXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kLCBnZXRDaGF0Q2FwYWJpbGl0aWVzLCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBMb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2xvY2FsQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdE1vZGVsLmpzJztcbmltcG9ydCB7IElQdWxsUmVxdWVzdEljb25DYWNoZSwgUHVsbFJlcXVlc3RJY29uQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9naXRodWIvYnJvd3Nlci9wdWxsUmVxdWVzdEljb25DYWNoZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUHVsbFJlcXVlc3RJY29uLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5cbi8vIC0tLS0gTW9jayBJQWdlbnRIb3N0U2VydmljZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTID0gJ3Nlc3Npb25zLmFnZW50SG9zdC5zZXNzaW9uQ29uZmlnUGlja2VyLnNlbGVjdGVkVmFsdWVzJztcblxudHlwZSBTdWJzY3JpcHRpb25TdGF0ZSA9IFNlc3Npb25TdGF0ZSB8IENoYW5nZXNldFN0YXRlIHwgQ2hhdFN0YXRlO1xuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5vdGlmaWNhdGlvbiA9IG5ldyBFbWl0dGVyPElOb3RpZmljYXRpb24+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgX3Jvb3RTdGF0ZUxpc3RlbmVyQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJvb3RTdGF0ZUNoYW5nZSA9IG5ldyBFbWl0dGVyPFJvb3RTdGF0ZT4oe1xuXHRcdG9uRGlkQWRkTGlzdGVuZXI6ICgpID0+IHRoaXMuX3Jvb3RTdGF0ZUxpc3RlbmVyQ291bnQrKyxcblx0XHRvbldpbGxSZW1vdmVMaXN0ZW5lcjogKCkgPT4gdGhpcy5fcm9vdFN0YXRlTGlzdGVuZXJDb3VudC0tLFxuXHR9KTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSb290U3RhdGVFcnJvciA9IG5ldyBFbWl0dGVyPEVycm9yPigpO1xuXHRwcml2YXRlIF9yb290U3RhdGVWYWx1ZTogUm9vdFN0YXRlIHwgRXJyb3IgfCB1bmRlZmluZWQgPSB7IGFnZW50czogW3sgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdLCBjYXBhYmlsaXRpZXM6IHsgbXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlIH0gfSB9IGFzIEFnZW50SW5mb10gfTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgcm9vdFN0YXRlOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPjtcblxuXHRvdmVycmlkZSByZWFkb25seSBjbGllbnRJZCA9ICd0ZXN0LWxvY2FsLWNsaWVudCc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudFNlc3Npb25NZXRhZGF0YT4oKTtcblx0cHVibGljIGRpc3Bvc2VkU2Vzc2lvbnM6IFVSSVtdID0gW107XG5cdHB1YmxpYyBkaXNwYXRjaGVkQWN0aW9uczogeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uOyBjbGllbnRJZDogc3RyaW5nOyBjbGllbnRTZXE6IG51bWJlciB9W10gPSBbXTtcblx0cHVibGljIGZhaWxSZXNvbHZlU2Vzc2lvbkNvbmZpZyA9IGZhbHNlO1xuXHRwdWJsaWMgcmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9O1xuXHRwdWJsaWMgcmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0czogeyBjb25maWc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblx0cHVibGljIHJlc29sdmVTZXNzaW9uQ29uZmlnQmFycmllcjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRnZXQgcm9vdFN0YXRlTGlzdGVuZXJDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fcm9vdFN0YXRlTGlzdGVuZXJDb3VudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uUGVuZGluZzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSgnYXV0aGVudGljYXRpb25QZW5kaW5nJywgZmFsc2UpO1xuXHRvdmVycmlkZSByZWFkb25seSBhdXRoZW50aWNhdGlvblBlbmRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fYXV0aGVudGljYXRpb25QZW5kaW5nO1xuXHRvdmVycmlkZSBzZXRBdXRoZW50aWNhdGlvblBlbmRpbmcocGVuZGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUGVuZGluZy5zZXQocGVuZGluZywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX25leHRTZXEgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5yb290U3RhdGUgPSB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl9yb290U3RhdGVWYWx1ZTsgfSxcblx0XHRcdGdldCB2ZXJpZmllZFZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IHVuZGVmaW5lZCA6IHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHNlbGYuX29uRGlkUm9vdFN0YXRlQ2hhbmdlLmV2ZW50LFxuXHRcdFx0b25EaWRFcnJvcjogc2VsZi5fb25EaWRSb290U3RhdGVFcnJvci5ldmVudCxcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHR9XG5cblx0bmV4dENsaWVudFNlcSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9uZXh0U2VxKys7XG5cdH1cblxuXHQvKipcblx0ICogTnVtYmVyIG9mIHVwY29taW5nIGBsaXN0U2Vzc2lvbnMoKWAgY2FsbHMgdGhhdCBzaG91bGQgcmVqZWN0LCB1c2VkIHRvXG5cdCAqIHNpbXVsYXRlIHRoZSBhZ2VudCB0aHJvd2luZyBgQUhQX0FVVEhfUkVRVUlSRURgIChvciBhIHRyYW5zaWVudCBvZmZsaW5lXG5cdCAqIGVycm9yKSBiZWZvcmUgaXRzIHRva2VuIGlzIGVmZmVjdGl2ZSBzZXJ2ZXItc2lkZS4gRGVjcmVtZW50ZWQgcGVyIGNhbGwuXG5cdCAqL1xuXHRwdWJsaWMgZmFpbExpc3RTZXNzaW9uc0NvdW50ID0gMDtcblx0cHVibGljIGxpc3RTZXNzaW9uc0NhbGxDb3VudCA9IDA7XG5cdG92ZXJyaWRlIGFzeW5jIGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YVtdPiB7XG5cdFx0dGhpcy5saXN0U2Vzc2lvbnNDYWxsQ291bnQrKztcblx0XHRpZiAodGhpcy5mYWlsTGlzdFNlc3Npb25zQ291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLmZhaWxMaXN0U2Vzc2lvbnNDb3VudC0tO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBSFBfQVVUSF9SRVFVSVJFRCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZWRTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShyYXdJZCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZWRDaGF0czogVVJJW10gPSBbXTtcblx0b3ZlcnJpZGUgYXN5bmMgZGlzcG9zZUNoYXQoY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlZENoYXRzLnB1c2goY2hhdCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlZENoYXRzOiB7IHNlc3Npb246IFVSSTsgY2hhdDogVVJJOyBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMgfVtdID0gW107XG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY3JlYXRlZENoYXRzLnB1c2goeyBzZXNzaW9uLCBjaGF0LCBvcHRpb25zIH0pO1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25TdGF0ZVZhbHVlcy5nZXQoa2V5KSBhcyBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGV4aXN0aW5nICYmIEFycmF5LmlzQXJyYXkoZXhpc3RpbmcuY2hhdHMpKSB7XG5cdFx0XHRjb25zdCBuZXdDaGF0OiBDaGF0U3VtbWFyeSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6IGNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0dGl0bGU6IG9wdGlvbnM/LnRpdGxlID8/ICcnLFxuXHRcdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuc2V0U2Vzc2lvblN0YXRlKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSwgQWdlbnRTZXNzaW9uLnByb3ZpZGVyKHNlc3Npb24pISwge1xuXHRcdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdFx0Y2hhdHM6IFsuLi5leGlzdGluZy5jaGF0cywgbmV3Q2hhdF0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlZFNlc3Npb25VcmlzOiBVUklbXSA9IFtdO1xuXHRwdWJsaWMgY3JlYXRlU2Vzc2lvbkNvbmZpZ3M6IHsgY29uZmlnPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47IHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkkgfVtdID0gW107XG5cdC8qKlxuXHQgKiBQZXItY2FsbCBob29rIHVzZWQgYnkgdGVzdHMgdG8gaW50ZXJsZWF2ZSBvcGVyYXRpb25zIGFjcm9zcyB0aGVcblx0ICogYGNyZWF0ZVNlc3Npb25gIGF3YWl0IFx1MjAxNCBlLmcuIHRvIHZlcmlmeSB0aGF0IG5vIHN1YnNjcmlwdGlvbiBpcyBvcGVuZWRcblx0ICogYmVmb3JlIHRoZSBjcmVhdGUgY29tcGxldGVzLCBvciB0byBzaW11bGF0ZSBhIHdvcmtzcGFjZSBzd2l0Y2ggbGFuZGluZ1xuXHQgKiBtaWQtY2FsbC4gQ2xlYXJlZCBhZnRlciB0aGUgbmV4dCBjcmVhdGVTZXNzaW9uIGNhbGwgaW52b2tlcyBpdC5cblx0ICovXG5cdHB1YmxpYyBvbkNyZWF0ZVNlc3Npb246ICgodXJpOiBVUkkpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIE9yZGVyZWQgbG9nIG9mIHdpcmUtbGV2ZWwgb3BlcmF0aW9uczogdXNlZnVsIGZvciBhc3NlcnRpbmcgdGhhdFxuXHQgKiBgY3JlYXRlU2Vzc2lvbmAgc3RyaWN0bHkgcHJlY2VkZXMgYHN1YnNjcmliZWAgZm9yIGEgZ2l2ZW4gc2Vzc2lvbiBVUkkuXG5cdCAqIEVhY2ggZW50cnkgaXMgYCR7b3B9OiR7dXJpfWAuXG5cdCAqL1xuXHRwdWJsaWMgd2lyZU9wczogc3RyaW5nW10gPSBbXTtcblx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB1cmkgPSBjb25maWc/LnNlc3Npb24gPz8gVVJJLnBhcnNlKCdjb3BpbG90Y2xpOi8vL2F1dG8tJyArIHRoaXMuX25leHRTZXEpO1xuXHRcdHRoaXMuY3JlYXRlU2Vzc2lvbkNvbmZpZ3MucHVzaCh7IGNvbmZpZzogY29uZmlnPy5jb25maWcsIHdvcmtpbmdEaXJlY3Rvcnk6IGNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0gfSk7XG5cdFx0dGhpcy53aXJlT3BzLnB1c2goYGNyZWF0ZVNlc3Npb246JHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR0aGlzLmNyZWF0ZWRTZXNzaW9uVXJpcy5wdXNoKHVyaSk7XG5cdFx0Y29uc3QgaG9vayA9IHRoaXMub25DcmVhdGVTZXNzaW9uO1xuXHRcdHRoaXMub25DcmVhdGVTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdGlmIChob29rKSB7XG5cdFx0XHRhd2FpdCBob29rKHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhyZXF1ZXN0OiB7IGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0pOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0dGhpcy5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0YXdhaXQgdGhpcy5yZXNvbHZlU2Vzc2lvbkNvbmZpZ0JhcnJpZXI/LnA7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0aWYgKHRoaXMuZmFpbFJlc29sdmVTZXNzaW9uQ29uZmlnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Jlc29sdmVTZXNzaW9uQ29uZmlnIHVuYXZhaWxhYmxlJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xuXHR9XG5cblx0ZGlzcGF0Y2hBY3Rpb24oY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgY2xpZW50SWQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWRBY3Rpb25zLnB1c2goeyBjaGFubmVsLCBhY3Rpb24sIGNsaWVudElkLCBjbGllbnRTZXEgfSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uLCBjbGllbnRJZDogdGhpcy5jbGllbnRJZCwgY2xpZW50U2VxOiB0aGlzLl9uZXh0U2VxKysgfSk7XG5cdH1cblxuXHQvLyBUZXN0IGhlbHBlcnNcblx0YWRkU2Vzc2lvbihtZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoQWdlbnRTZXNzaW9uLmlkKG1ldGEuc2Vzc2lvbiksIG1ldGEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3AgYSBzZXNzaW9uIGZyb20gd2hhdCBgbGlzdFNlc3Npb25zKClgIHJlcG9ydHMsIHdpdGhvdXQgZ29pbmcgdGhyb3VnaFxuXHQgKiBgZGlzcG9zZVNlc3Npb25gLiBTaW11bGF0ZXMgYW4gYWdlbnQgdGhhdCBjYW5ub3QgZW51bWVyYXRlIGl0cyBzZXNzaW9uc1xuXHQgKiB5ZXQgKGF1dGggdG9rZW4gb3IgU0RLIHN0aWxsIGxvYWRpbmcpIGFuZCBzbyBjb250cmlidXRlcyBub3RoaW5nIHRvIHRoZVxuXHQgKiBob3N0J3MgYWdncmVnYXRlZCBsaXN0aW5nLlxuXHQgKi9cblx0c3RvcExpc3RpbmdTZXNzaW9ucyguLi5pZHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBpZHMpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0YXRlRW1pdHRlcnMgPSBuZXcgTWFwPHN0cmluZywgRW1pdHRlcjxTdWJzY3JpcHRpb25TdGF0ZT4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZVZhbHVlcyA9IG5ldyBNYXA8c3RyaW5nLCBTdWJzY3JpcHRpb25TdGF0ZT4oKTtcblx0cHVibGljIHNlc3Npb25TdWJzY3JpYmVDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwdWJsaWMgc2Vzc2lvblVuc3Vic2NyaWJlQ291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRvdmVycmlkZSBnZXRTdWJzY3JpcHRpb248VD4oX2tpbmQ6IFN0YXRlQ29tcG9uZW50cywgcmVzb3VyY2U6IFVSSSk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLndpcmVPcHMucHVzaChgc3Vic2NyaWJlOiR7a2V5fWApO1xuXHRcdHRoaXMuc2Vzc2lvblN1YnNjcmliZUNvdW50cy5zZXQoa2V5LCAodGhpcy5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChrZXkpID8/IDApICsgMSk7XG5cdFx0bGV0IGVtaXR0ZXIgPSB0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5nZXQoa2V5KTtcblx0XHRpZiAoIWVtaXR0ZXIpIHtcblx0XHRcdGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxTdWJzY3JpcHRpb25TdGF0ZT4oKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUVtaXR0ZXJzLnNldChrZXksIGVtaXR0ZXIpO1xuXHRcdH1cblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRjb25zdCBzdWI6IElBZ2VudFN1YnNjcmlwdGlvbjxUPiA9IHtcblx0XHRcdGdldCB2YWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Nlc3Npb25TdGF0ZVZhbHVlcy5nZXQoa2V5KSBhcyB1bmtub3duIGFzIFQgfCB1bmRlZmluZWQ7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Nlc3Npb25TdGF0ZVZhbHVlcy5nZXQoa2V5KSBhcyB1bmtub3duIGFzIFQgfCB1bmRlZmluZWQ7IH0sXG5cdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCBhcyB1bmtub3duIGFzIEV2ZW50PFQ+LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogc3ViLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5zZXQoa2V5LCAodGhpcy5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KGtleSkgPz8gMCkgKyAxKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHNldFNlc3Npb25TdGF0ZShyYXdJZDogc3RyaW5nLCBwcm92aWRlcjogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlVmFsdWVzLnNldChrZXksIHN0YXRlKTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5nZXQoa2V5KT8uZmlyZShzdGF0ZSk7XG5cdH1cblxuXHRzZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmk6IHN0cmluZywgc3RhdGU6IENoYW5nZXNldFN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlVmFsdWVzLnNldChjaGFuZ2VzZXRVcmksIHN0YXRlKTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5nZXQoY2hhbmdlc2V0VXJpKT8uZmlyZShzdGF0ZSk7XG5cdH1cblxuXHRzZXRDaGF0U3RhdGUoY2hhdFVyaTogc3RyaW5nLCBzdGF0ZTogQ2hhdFN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlVmFsdWVzLnNldChjaGF0VXJpLCBzdGF0ZSk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuZ2V0KGNoYXRVcmkpPy5maXJlKHN0YXRlKTtcblx0fVxuXG5cdHNldEFnZW50cyhhZ2VudHM6IEFnZW50SW5mb1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdFN0YXRlVmFsdWUgPSB7IGFnZW50cyB9O1xuXHRcdHRoaXMuX29uRGlkUm9vdFN0YXRlQ2hhbmdlLmZpcmUodGhpcy5fcm9vdFN0YXRlVmFsdWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpcmVzIGEgcm9vdCBzdGF0ZSBjaGFuZ2UgdGhhdCBwcmVzZXJ2ZXMgdGhlIGN1cnJlbnQgYGFnZW50c2AgcmVmZXJlbmNlLFxuXHQgKiBzaW11bGF0aW5nIG5vbi1hZ2VudCByb290IGRlbHRhcyAoZS5nLiBgUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZGAgb25cblx0ICogZXZlcnkgdHVybiBzdGFydC9jb21wbGV0ZSkgdGhhdCB0aGUgcmVhbCByZWR1Y2VyIGVtaXRzIHdpdGhvdXRcblx0ICogcmVwbGFjaW5nIHRoZSBgYWdlbnRzYCBzbGljZS5cblx0ICovXG5cdGZpcmVOb25BZ2VudFJvb3RTdGF0ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Jvb3RTdGF0ZVZhbHVlIHx8IHRoaXMuX3Jvb3RTdGF0ZVZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigncm9vdFN0YXRlIG5vdCBpbml0aWFsaXplZDsgY2FsbCBzZXRBZ2VudHMgZmlyc3QnKTtcblx0XHR9XG5cdFx0dGhpcy5fcm9vdFN0YXRlVmFsdWUgPSB7IC4uLnRoaXMuX3Jvb3RTdGF0ZVZhbHVlIH07XG5cdFx0dGhpcy5fb25EaWRSb290U3RhdGVDaGFuZ2UuZmlyZSh0aGlzLl9yb290U3RhdGVWYWx1ZSk7XG5cdH1cblxuXHRjbGVhclJvb3RTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290U3RhdGVWYWx1ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFJvb3RTdGF0ZUVycm9yKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdyb290IHN0YXRlIGZhaWxlZCcpO1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0gZXJyb3I7XG5cdFx0dGhpcy5fb25EaWRSb290U3RhdGVFcnJvci5maXJlKGVycm9yKTtcblx0fVxuXG5cdGZpcmVOb3RpZmljYXRpb24objogSU5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmZpcmUobik7XG5cdH1cblxuXHRmaXJlQWN0aW9uKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWROb3RpZmljYXRpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUm9vdFN0YXRlQ2hhbmdlLmRpc3Bvc2UoKTtcblx0XHRmb3IgKGNvbnN0IGVtaXR0ZXIgb2YgdGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMudmFsdWVzKCkpIHtcblx0XHRcdGVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5jbGVhcigpO1xuXHR9XG59XG5cbi8vIC0tLS0gVGVzdCBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24oaWQ6IHN0cmluZywgb3B0cz86IHsgcHJvdmlkZXI/OiBzdHJpbmc7IHN1bW1hcnk/OiBzdHJpbmc7IHByb2plY3Q/OiB7IHVyaTogVVJJOyBkaXNwbGF5TmFtZTogc3RyaW5nIH07IHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkk7IHN0YXJ0VGltZT86IG51bWJlcjsgbW9kaWZpZWRUaW1lPzogbnVtYmVyOyBxdWlja0NoYXQ/OiBib29sZWFuIH0pOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEge1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkob3B0cz8ucHJvdmlkZXIgPz8gJ2NvcGlsb3RjbGknLCBpZCksXG5cdFx0c3RhcnRUaW1lOiBvcHRzPy5zdGFydFRpbWUgPz8gMTAwMCxcblx0XHRtb2RpZmllZFRpbWU6IG9wdHM/Lm1vZGlmaWVkVGltZSA/PyAyMDAwLFxuXHRcdHN1bW1hcnk6IG9wdHM/LnN1bW1hcnksXG5cdFx0cHJvamVjdDogb3B0cz8ucHJvamVjdCxcblx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IG9wdHM/LndvcmtpbmdEaXJlY3RvcnkgPyBbb3B0cz8ud29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQsXG5cdFx0X21ldGE6IG9wdHM/LnF1aWNrQ2hhdCA/IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQb2xpY3lSZXN0cmljdGVkQ29uZmlndXJhdGlvblNlcnZpY2UoKTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHN1cGVyLmluc3BlY3Q8VD4oa2V5KTtcblx0XHRcdGlmIChrZXkgPT09ICdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgcG9saWN5VmFsdWU6IGZhbHNlIGFzIHVua25vd24gYXMgVCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJhc2U7XG5cdFx0fVxuXHR9KCk7XG59XG5cbi8qKlxuICogTWltaWNzIHByb2R1Y3Rpb24sIHdoZXJlIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYCBzaGlwcyB3aXRoIGEgc2NoZW1hXG4gKiBkZWZhdWx0IChgeyBtb2RlOiAnaW50ZXJhY3RpdmUnLCBhcHByb3ZhbHM6ICdkZWZhdWx0JyB9YCksIHNvIGFuIHVudG91Y2hlZFxuICogc2V0dGluZyBpcyByZXBvcnRlZCBieSBgaW5zcGVjdGAgb25seSBhcyBgZGVmYXVsdFZhbHVlYCAobm8gdXNlciBsYXllcikuXG4gKiBUaGUgcGxhaW4ge0BsaW5rIFRlc3RDb25maWd1cmF0aW9uU2VydmljZX0gZG9lcyBub3QgcmVnaXN0ZXIgc2NoZW1hIGRlZmF1bHRzLFxuICogc28gaXQgY2Fubm90IHJlcHJvZHVjZSB0aGUgXCJjb25maWd1cmVkIGRlZmF1bHQgbWFza3MgcmVtZW1iZXJlZCBwaWNrXCIgYnVnLlxuICovXG5mdW5jdGlvbiBjcmVhdGVTY2hlbWFEZWZhdWx0Q29uZmlndXJhdGlvblNlcnZpY2UoKTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHN1cGVyLmluc3BlY3Q8VD4oa2V5KTtcblx0XHRcdGlmIChrZXkgPT09ICdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJyAmJiBiYXNlLnVzZXJWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHNjaGVtYURlZmF1bHQgPSB7IG1vZGU6ICdpbnRlcmFjdGl2ZScsIGFwcHJvdmFsczogJ2RlZmF1bHQnIH0gYXMgdW5rbm93biBhcyBUO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCB2YWx1ZTogc2NoZW1hRGVmYXVsdCwgZGVmYXVsdFZhbHVlOiBzY2hlbWFEZWZhdWx0IH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmFzZTtcblx0XHR9XG5cdH0oKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgYWdlbnRIb3N0U2VydmljZTogTW9ja0FnZW50SG9zdFNlcnZpY2UsIGNvbnRyaWJ1dGlvbnMgPSBbXG5cdHsgdHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIG5hbWU6ICdjb3BpbG90JywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICd0ZXN0JywgaWNvbjogdW5kZWZpbmVkIH0sXG5dLCBvcHRpb25zPzogeyBzZW5kUmVxdWVzdD86IChyZXNvdXJjZTogVVJJLCBtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM/OiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucykgPT4gUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD47IGFjcXVpcmVPckxvYWRTZXNzaW9uPzogKHJlc291cmNlOiBVUkkpID0+IFByb21pc2U8SUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD47IGxhbmd1YWdlTW9kZWxJZHM/OiBzdHJpbmdbXTsgbG9va3VwTGFuZ3VhZ2VNb2RlbD86IChtb2RlbElkOiBzdHJpbmcpID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkOyBvcGVuU2Vzc2lvbj86IGJvb2xlYW47IGNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlOyBhY3RpdmVTZXNzaW9uPzogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+OyB2aXNpYmxlU2Vzc2lvbnM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+OyBhY3RpdmVDbGllbnQ/OiBPbWl0PFNlc3Npb25BY3RpdmVDbGllbnQsICdjbGllbnRJZCc+OyBzdG9yYWdlU2VydmljZT86IElTdG9yYWdlU2VydmljZTsgaXNTZXNzaW9uc1dpbmRvdz86IGJvb2xlYW47IGNvbmZpcm1EZWxldGU/OiBib29sZWFuOyB3b3Jrc3BhY2VUcnVzdGVkPzogYm9vbGVhbjsgZ2l0SHViU2VydmljZT86IElHaXRIdWJTZXJ2aWNlOyBhZ2VudEhvc3RFbmFibGVkPzogYm9vbGVhbiB9KTogTG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RTZXJ2aWNlLCBhZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBvcHRpb25zPy5jb25maWd1cmF0aW9uU2VydmljZSA/PyBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgZW5hYmxlZDogY29uc3RPYnNlcnZhYmxlKG9wdGlvbnM/LmFnZW50SG9zdEVuYWJsZWQgPz8gdHJ1ZSkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGlzV29ya3NwYWNlVHJ1c3RlZCgpOiBib29sZWFuIHsgcmV0dXJuIG9wdGlvbnM/LndvcmtzcGFjZVRydXN0ZWQgPz8gdHJ1ZTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSkgeyByZXR1cm4geyB1cmksIHRydXN0ZWQ6IG9wdGlvbnM/LndvcmtzcGFjZVRydXN0ZWQgPz8gdHJ1ZSB9OyB9XG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHsgaXNTZXNzaW9uc1dpbmRvdzogb3B0aW9ucz8uaXNTZXNzaW9uc1dpbmRvdyA/PyB0cnVlIH0gYXMgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIHsgY29uZmlybTogYXN5bmMgKCkgPT4gKHsgY29uZmlybWVkOiBvcHRpb25zPy5jb25maXJtRGVsZXRlID8/IHRydWUgfSkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKSA9PiBjb250cmlidXRpb25zLmZpbmQoYyA9PiBjLnR5cGUgPT09IGNoYXRTZXNzaW9uVHlwZSksXG5cdFx0Z2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zOiAoKSA9PiBjb250cmlidXRpb25zLFxuXHRcdGdldE9yQ3JlYXRlQ2hhdFNlc3Npb246IGFzeW5jICgpID0+ICh7IG9uV2lsbERpc3Bvc2U6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksIHNlc3Npb25SZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JyB9KSwgaGlzdG9yeTogW10sIGRpc3Bvc2UoKSB7IH0gfSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdGFjcXVpcmVPckxvYWRTZXNzaW9uOiBvcHRpb25zPy5hY3F1aXJlT3JMb2FkU2Vzc2lvbiA/PyAoYXN5bmMgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRzZW5kUmVxdWVzdDogb3B0aW9ucz8uc2VuZFJlcXVlc3QgPz8gKGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9KSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiBvcHRpb25zPy5vcGVuU2Vzc2lvbiA/IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXQ+KCkgeyB9KCkgOiB1bmRlZmluZWQsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHtcblx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzOiAoKSA9PiBvcHRpb25zPy5sYW5ndWFnZU1vZGVsSWRzID8/IFtdLFxuXHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IG9wdGlvbnM/Lmxvb2t1cExhbmd1YWdlTW9kZWwgPz8gKCgpID0+IHVuZGVmaW5lZCksXG5cdFx0aGFzUmVzb2x2ZWRWZW5kb3I6ICgpID0+IHRydWUsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIHtcblx0XHRnZXRVcmlMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aCxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIG9wdGlvbnM/LnN0b3JhZ2VTZXJ2aWNlID8/IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElHaXRIdWJTZXJ2aWNlLCBvcHRpb25zPy5naXRIdWJTZXJ2aWNlID8/IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGZpbmRQdWxsUmVxdWVzdE51bWJlckJ5SGVhZEJyYW5jaCA9IGFzeW5jICgpID0+IHVuZGVmaW5lZDtcblx0fSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHVsbFJlcXVlc3RJY29uQ2FjaGUsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFB1bGxSZXF1ZXN0SWNvbkNhY2hlKSk7XG5cdGNvbnN0IGFjdGl2ZVNlc3Npb25PYnMgPSBvcHRpb25zPy5hY3RpdmVTZXNzaW9uID8/IGNvbnN0T2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0Y29uc3QgdmlzaWJsZVNlc3Npb25zT2JzID0gb3B0aW9ucz8udmlzaWJsZVNlc3Npb25zID8/IGNvbnN0T2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+KFtdKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb246IElPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPiA9IGFjdGl2ZVNlc3Npb25PYnM7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+ID0gdmlzaWJsZVNlc3Npb25zT2JzO1xuXHR9KCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRBY3RpdmVDbGllbnQgPSAoX3Nlc3Npb25UeXBlOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpID0+ICh7IGNsaWVudElkLCAuLi4ob3B0aW9ucz8uYWN0aXZlQ2xpZW50ID8/IHsgdG9vbHM6IFtdLCBjdXN0b21pemF0aW9uczogW10gfSkgfSk7XG5cdH0oKSk7XG5cblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIpKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwoaWQ6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmFnZW50SG9zdCcpLFxuXHRcdGlkLFxuXHRcdHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0bmFtZTogaWQsXG5cdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0ZmFtaWx5OiBpZCxcblx0XHRtYXhJbnB1dFRva2VuczogMSxcblx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlcjogTG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgcHJlZGljYXRlOiAoY29uZmlnOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCkgPT4gYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAocHJlZGljYXRlKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbklkKSkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gcHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnKGNoYW5nZWRTZXNzaW9uSWQgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZWRTZXNzaW9uSWQgPT09IHNlc3Npb25JZCAmJiBwcmVkaWNhdGUocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQpKSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCByYXdJZDogc3RyaW5nLCBvcHRzPzogeyBwcm92aWRlcj86IHN0cmluZzsgdGl0bGU/OiBzdHJpbmc7IHByb2plY3Q/OiB7IHVyaTogc3RyaW5nOyBkaXNwbGF5TmFtZTogc3RyaW5nIH07IHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmc7IGNoYW5nZXM/OiBDaGFuZ2VzU3VtbWFyeTsgd29ya3NwYWNlbGVzcz86IGJvb2xlYW47IGNyZWF0ZWRBdD86IHN0cmluZzsgbW9kaWZpZWRBdD86IHN0cmluZyB9KTogdm9pZCB7XG5cdGNvbnN0IHByb3ZpZGVyID0gb3B0cz8ucHJvdmlkZXIgPz8gJ2NvcGlsb3RjbGknO1xuXHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpO1xuXHRhZ2VudEhvc3QuZmlyZU5vdGlmaWNhdGlvbih7XG5cdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHR0eXBlOiBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25BZGRlZCxcblx0XHRzdW1tYXJ5OiB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHR0aXRsZTogb3B0cz8udGl0bGUgPz8gYFNlc3Npb24gJHtyYXdJZH1gLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogb3B0cz8uY3JlYXRlZEF0ID8/IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG9wdHM/Lm1vZGlmaWVkQXQgPz8gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogb3B0cz8ucHJvamVjdCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogb3B0cz8ud29ya2luZ0RpcmVjdG9yeSA/IFtvcHRzLndvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhbmdlczogb3B0cz8uY2hhbmdlcyxcblx0XHRcdC4uLihvcHRzPy53b3Jrc3BhY2VsZXNzID8geyBfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSkgfSA6IHt9KSxcblx0XHR9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gZmlyZVNlc3Npb25NZXRhQ2hhbmdlZChhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCByYXdJZDogc3RyaW5nLCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCwgcHJvdmlkZXIgPSAnY29waWxvdGNsaScpOiB2b2lkIHtcblx0YWdlbnRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdGNoYW5uZWw6IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIHJhd0lkKS50b1N0cmluZygpLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWV0YUNoYW5nZWQsXG5cdFx0XHRfbWV0YTogbWV0YSxcblx0XHR9LFxuXHRcdHNlcnZlclNlcTogMSxcblx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGZpcmVTZXNzaW9uUmVtb3ZlZChhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCByYXdJZDogc3RyaW5nLCBwcm92aWRlciA9ICdjb3BpbG90Y2xpJyk6IHZvaWQge1xuXHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpO1xuXHRhZ2VudEhvc3QuZmlyZU5vdGlmaWNhdGlvbih7XG5cdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHR0eXBlOiBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkLFxuXHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGZpcmVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoYWdlbnRIb3N0OiBNb2NrQWdlbnRIb3N0U2VydmljZSwgcmF3SWQ6IHN0cmluZywgY2hhbmdlczogUGFydGlhbDxTZXNzaW9uU3VtbWFyeT4sIHByb3ZpZGVyID0gJ2NvcGlsb3RjbGknKTogdm9pZCB7XG5cdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHByb3ZpZGVyLCByYXdJZCk7XG5cdGFnZW50SG9zdC5maXJlTm90aWZpY2F0aW9uKHtcblx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdHR5cGU6IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkLFxuXHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRjaGFuZ2VzLFxuXHR9KTtcbn1cblxuLyoqXG4gKiBTZWVkIGBzdG9yYWdlU2VydmljZWAgd2l0aCBwZXJzaXN0ZWQgc2Vzc2lvbiBzdW1tYXJpZXMgYnkgcnVubmluZyBhIHRocm93YXdheVxuICogcHJvdmlkZXIgb3ZlciBhIGZyZXNoIGFnZW50IGhvc3QgdGhhdCBsaXN0cyBgc2Vzc2lvbnNgLCB0aGVuIGZsdXNoaW5nIHNvIHRoZVxuICogYmFzZSBwcm92aWRlcidzIGBvbldpbGxTYXZlU3RhdGVgIHdyaXRlcyB0aGUgY2FjaGUgdG8gc3RvcmFnZS4gVXNlZCB0b1xuICogc2ltdWxhdGUgd2hhdCBhIHByZXZpb3VzIHdpbmRvdyBsZWZ0IGJlaGluZCBmb3IgdGhlIG5leHQgbGF1bmNoIHRvIGh5ZHJhdGUuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHBlcnNpc3RDYWNoZWRTZXNzaW9ucyhkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLCBzZXNzaW9uczogSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgaG9zdCA9IG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGhvc3QuZGlzcG9zZSgpKSk7XG5cdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdGhvc3QuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxuXHRjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgaG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHQvLyBMZXQgdGhlIGVhZ2VyIHJlZnJlc2ggcGljayB1cCB0aGUgc2Vzc2lvbnMgKG1hcmtpbmcgdGhlIGNhY2hlIGRpcnR5KSB0aGVuXG5cdC8vIGZsdXNoIHNvIHRoZSBjYWNoZSBpcyBwZXJzaXN0ZWQuXG5cdGF3YWl0IHRpbWVvdXQoMCk7XG5cdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLmZsdXNoKCk7XG59XG5cbnN1aXRlKCdMb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgYWdlbnRIb3N0OiBNb2NrQWdlbnRIb3N0U2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0YWdlbnRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudEhvc3QuZGlzcG9zZSgpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIFByb3ZpZGVyIGlkZW50aXR5IC0tLS0tLS1cblxuXHR0ZXN0KCdoYXMgY29ycmVjdCBpZCwgbGFiZWwsIGFuZCBzZXNzaW9uVHlwZSBmcm9tIHJvb3RTdGF0ZSBhZ2VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5pZCwgJ2xvY2FsLWFnZW50LWhvc3QnKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIubGFiZWwubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDEpO1xuXHRcdC8vIFRoZSBsb2dpY2FsIHNlc3Npb25UeXBlIGlkIGlzIHRoZSBhZ2VudCBwcm92aWRlciBuYW1lIGl0c2VsZiwgc29cblx0XHQvLyB0aGUgc2FtZSBhZ2VudCAoZS5nLiBgY29waWxvdGNsaWApIHNoYXJlcyBvbmUgc2Vzc2lvbiB0eXBlIGFjcm9zc1xuXHRcdC8vIGxvY2FsIGFuZCByZW1vdGUgaG9zdHMgYW5kIHRoZSBzdGFuZGFsb25lIENvcGlsb3QgQ0xJIHByb3ZpZGVyLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsICdjb3BpbG90Y2xpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5sYWJlbCwgJ0NvcGlsb3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiB0eXBlcyB1cGRhdGUgd2hlbiB0aGUgbG9jYWwgaG9zdCBhZHZlcnRpc2VzIGFkZGl0aW9uYWwgYWdlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGxhYmVsOiB0LmxhYmVsIH0pKSwgW1xuXHRcdFx0eyBpZDogJ2NvcGlsb3RjbGknLCBsYWJlbDogJ0NvcGlsb3QnIH0sXG5cdFx0XSk7XG5cblx0XHRsZXQgY2hhbmdlcyA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzISgoKSA9PiBjaGFuZ2VzKyspKTtcblxuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnb3BlbmFpJywgZGlzcGxheU5hbWU6ICdPcGVuQUknLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcywgMSk7XG5cdFx0Ly8gVGhlIGxvZ2ljYWwgc2Vzc2lvblR5cGUgaWQgaXMgdGhlIGFnZW50IHByb3ZpZGVyIG5hbWUgaXRzZWxmLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLm1hcCh0ID0+ICh7IGlkOiB0LmlkLCBsYWJlbDogdC5sYWJlbCB9KSksIFtcblx0XHRcdHsgaWQ6ICdjb3BpbG90Y2xpJywgbGFiZWw6ICdDb3BpbG90JyB9LFxuXHRcdFx0eyBpZDogJ29wZW5haScsIGxhYmVsOiAnT3BlbkFJJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGFyZXMgdGhlIHJvb3Qtc3RhdGUgbGlzdGVuZXIgYWNyb3NzIHNlc3Npb24gYWRhcHRlcnMnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10sIGNhcGFiaWxpdGllczoge30gfSBhcyBBZ2VudEluZm9dKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGxpc3RlbmVyQ291bnRCZWZvcmVTZXNzaW9ucyA9IGFnZW50SG9zdC5yb290U3RhdGVMaXN0ZW5lckNvdW50O1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMDA7IGkrKykge1xuXHRcdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIGBsaXN0ZW5lci0ke2l9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdGVuZXJDb3VudEFmdGVyU2Vzc2lvbnMgPSBhZ2VudEhvc3Qucm9vdFN0YXRlTGlzdGVuZXJDb3VudDtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFt7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSwgY2FwYWJpbGl0aWVzOiB7IG11bHRpcGxlQ2hhdHM6IHsgZm9yazogdHJ1ZSB9IH0gfSBhcyBBZ2VudEluZm9dKTtcblx0XHRjb25zdCBzdXBwb3J0c011bHRpcGxlQ2hhdHNBZnRlckh5ZHJhdGlvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cztcblx0XHRhZ2VudEhvc3Quc2V0Um9vdFN0YXRlRXJyb3IoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlzdGVuZXJDb3VudEJlZm9yZVNlc3Npb25zLFxuXHRcdFx0bGlzdGVuZXJDb3VudEFmdGVyU2Vzc2lvbnMsXG5cdFx0XHRzZXNzaW9uQ291bnQ6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzQWZ0ZXJIeWRyYXRpb24sXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHNBZnRlckVycm9yOiBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMsXG5cdFx0fSwge1xuXHRcdFx0bGlzdGVuZXJDb3VudEJlZm9yZVNlc3Npb25zOiAxLFxuXHRcdFx0bGlzdGVuZXJDb3VudEFmdGVyU2Vzc2lvbnM6IDEsXG5cdFx0XHRzZXNzaW9uQ291bnQ6IDIwMCxcblx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0c0FmdGVySHlkcmF0aW9uOiB0cnVlLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzQWZ0ZXJFcnJvcjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgbm8gc2Vzc2lvbiB0eXBlcyBiZWZvcmUgcm9vdFN0YXRlIGh5ZHJhdGVzJywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5jbGVhclJvb3RTdGF0ZSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIG5vIHNlc3Npb24gdHlwZXMgd2hlbiByb290U3RhdGUgYWR2ZXJ0aXNlcyBubyBhZ2VudHMnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgbm8gc2Vzc2lvbiB0eXBlcyBhZnRlciByb290U3RhdGUgcmVzb2x2ZXMgdG8gYW4gZXJyb3InLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmNsZWFyUm9vdFN0YXRlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcywgW10pO1xuXG5cdFx0YWdlbnRIb3N0LnNldFJvb3RTdGF0ZUVycm9yKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIHR5cGUgaWNvbnMgdXNlIHBlci1hZ2VudCBjb2RpY29ucycsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZS1jb2RlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnb3BlbmFpJywgZGlzcGxheU5hbWU6ICdPcGVuQUknLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAndW5rbm93bi1hZ2VudCcsIGRpc3BsYXlOYW1lOiAnVW5rbm93bicsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGljb246IHQuaWNvbi5pZCB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgaWQ6ICdjb3BpbG90Y2xpJywgaWNvbjogJ2NvcGlsb3QnIH0sXG5cdFx0XHRcdHsgaWQ6ICdjbGF1ZGUtY29kZScsIGljb246ICdjbGF1ZGUnIH0sXG5cdFx0XHRcdHsgaWQ6ICdvcGVuYWknLCBpY29uOiAnb3BlbmFpJyB9LFxuXHRcdFx0XHR7IGlkOiAndW5rbm93bi1hZ2VudCcsIGljb246ICd2bScgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBBSC9FSCBnYXRlIChwcmVmZXJBZ2VudEhvc3QpIC0tLS0tLS1cblxuXHQvLyBUaGUgYWdlbnQgaG9zdCdzIENsYXVkZSBwcm92aWRlciBpZCBpcyBgY2xhdWRlYC4gSW4gYSB3aW5kb3cgdGhhdCBwcmVmZXJzXG5cdC8vIHRoZSBleHRlbnNpb24taG9zdCBDbGF1ZGUgKHRoZSBHaXRIdWIgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzKSwgdGhlIGxvY2FsXG5cdC8vIHByb3ZpZGVyIG11c3QgTk9UIGFkdmVydGlzZSBpdHMgb3duIGBjbGF1ZGVgIHNlc3Npb24gdHlwZSwgb3RoZXJ3aXNlIHRoZVxuXHQvLyB3ZWxjb21lIHBpY2tlciBsaXN0cyBDbGF1ZGUgdHdpY2UuIE1pcnJvcnMgdGhlIEVILXNpZGUgZ2F0ZSBpblxuXHQvLyBgY29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyYC5cblxuXHRmdW5jdGlvbiBmaXJlQ29uZmlnQ2hhbmdlKGNvbmZpZ1NlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSwgc2V0dGluZ0lkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25maWdTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbc2V0dGluZ0lkXSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW3NldHRpbmdJZF0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gc2V0dGluZ0lkLFxuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnaGlkZXMgYWdlbnQtaG9zdCBDbGF1ZGUgd2hlbiB0aGUgQWdlbnRzIHdpbmRvdyBwcmVmZXJzIGV4dGVuc2lvbi1ob3N0IENsYXVkZScsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSwgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLm1hcCh0ID0+IHQuaWQpLCBbJ2NvcGlsb3RjbGknXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIGFnZW50LWhvc3QgQ2xhdWRlIHdoZW4gdGhlIEFnZW50cyB3aW5kb3cgcHJlZmVycyBhZ2VudC1ob3N0IENsYXVkZScsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsIHRydWUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gdC5pZCksIFsnY29waWxvdGNsaScsICdjbGF1ZGUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGVzIGFnZW50LWhvc3QgQ29kZXggaW4gdGhlIEFnZW50cyB3aW5kb3cgb24gdGhlIHByb3ZpZGVyIGVuYWJsZW1lbnQgc2V0dGluZycsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NvZGV4JywgZGlzcGxheU5hbWU6ICdDb2RleCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSwgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLm1hcCh0ID0+IHQuaWQpLCBbJ2NvcGlsb3RjbGknXSk7XG5cblx0XHRsZXQgc2Vzc2lvblR5cGVzQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB7IHNlc3Npb25UeXBlc0NoYW5nZWQgPSB0cnVlOyB9KSk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgdHJ1ZSk7XG5cdFx0ZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlLCBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25UeXBlc0NoYW5nZWQsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHByb3ZpZGVyLnNlc3Npb25UeXBlcy5tYXAodCA9PiB0LmlkKSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uVHlwZXNDaGFuZ2VkOiB0cnVlLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbJ2NvcGlsb3RjbGknLCAnY29kZXgnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2F0ZXMgYWdlbnQtaG9zdCBDbGF1ZGUgb24gdGhlIGVkaXRvci13aW5kb3cgc2V0dGluZyBvdXRzaWRlIHRoZSBBZ2VudHMgd2luZG93JywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Ly8gRWRpdG9yLXdpbmRvdyBzZXR0aW5nIG9uOyBBZ2VudHMtd2luZG93IHNldHRpbmcgZGVsaWJlcmF0ZWx5IGxlZnQgb2ZmIHRvXG5cdFx0Ly8gcHJvdmUgdGhlIG5vbi1zZXNzaW9ucy13aW5kb3cgcHJvdmlkZXIgcmVhZHMgdGhlIGVkaXRvci13aW5kb3cgc2V0dGluZy5cblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENsYXVkZVByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ1NlcnZpY2UsIGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gdC5pZCksIFsnY2xhdWRlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRzIGFnZW50LWhvc3QgQ2xhdWRlIGxpdmUgd2hlbiBwcmVmZXJBZ2VudEhvc3QgZmxpcHMgb24nLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdHsgcHJvdmlkZXI6ICdjbGF1ZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkLCBmYWxzZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ1NlcnZpY2UsIGlzU2Vzc2lvbnNXaW5kb3c6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gdC5pZCksIFsnY29waWxvdGNsaSddKTtcblxuXHRcdGxldCBmaXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB7IGZpcmVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsIHRydWUpO1xuXHRcdGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZSwgQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkKTtcblxuXHRcdGFzc2VydC5vayhmaXJlZCwgJ29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzIHNob3VsZCBmaXJlIHdoZW4gdGhlIGdhdGUgZmxpcHMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5tYXAodCA9PiB0LmlkKSwgWydjb3BpbG90Y2xpJywgJ2NsYXVkZSddKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbnMgaGlkZXMgYWdlbnQtaG9zdCBDbGF1ZGUgc2Vzc2lvbnMgd2hlbiBleHRlbnNpb24taG9zdCBDbGF1ZGUgaXMgcHJlZmVycmVkJywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY2xhdWRlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENsYXVkZVByZWZlckFnZW50SG9zdEFnZW50c1NldHRpbmdJZCwgZmFsc2UpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xpLXNlc3MnLCB7IHRpdGxlOiAnQ0xJJywgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zZXNzJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnNlc3Npb25UeXBlKSwgWydjb3BpbG90Y2xpJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBzaG93cyBhZ2VudC1ob3N0IENsYXVkZSBzZXNzaW9ucyB3aGVuIGFnZW50LWhvc3QgQ2xhdWRlIGlzIHByZWZlcnJlZCcsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsIHRydWUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xpLXNlc3MnLCB7IHRpdGxlOiAnQ0xJJywgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zZXNzJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpLm1hcChzID0+IHMuc2Vzc2lvblR5cGUpLnNvcnQoKSxcblx0XHRcdFsnY2xhdWRlJywgJ2NvcGlsb3RjbGknXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmbGlwcGluZyBwcmVmZXJBZ2VudEhvc3QgcmV2ZWFscyBhZ2VudC1ob3N0IENsYXVkZSBzZXNzaW9ucyBhbmQgZmlyZXMgYSByZWZyZXNoJywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY2xhdWRlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENsYXVkZVByZWZlckFnZW50SG9zdEFnZW50c1NldHRpbmdJZCwgZmFsc2UpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xpLXNlc3MnLCB7IHRpdGxlOiAnQ0xJJywgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zZXNzJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy5zZXNzaW9uVHlwZSksIFsnY29waWxvdGNsaSddKTtcblxuXHRcdGxldCBmaXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHsgZmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENsYXVkZVByZWZlckFnZW50SG9zdEFnZW50c1NldHRpbmdJZCwgdHJ1ZSk7XG5cdFx0ZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlLCBDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZpcmVkLCAnb25EaWRDaGFuZ2VTZXNzaW9ucyBzaG91bGQgZmlyZSBzbyB0aGUgb3BlbiBsaXN0IHJlLXF1ZXJpZXMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnNlc3Npb25UeXBlKS5zb3J0KCksXG5cdFx0XHRbJ2NsYXVkZScsICdjb3BpbG90Y2xpJ10sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmxpcHBpbmcgcHJlZmVyQWdlbnRIb3N0IG9mZiBkb2VzIG5vdCBhbm5vdW5jZSBoaWRkZW4gc2Vzc2lvbnMgYXMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHQvLyBUaGUgbGlzdCByZWZyZXNoIGZpcmVzIGFuIGVtcHR5LXBheWxvYWQgY2hhbmdlOiBoaWRkZW4gQ2xhdWRlIHNlc3Npb25zXG5cdFx0Ly8gYXJlIGZpbHRlcmVkIG91dCBhdCByZWFkIHRpbWUsIG5vdCByZXBvcnRlZCBhcyBgcmVtb3ZlZGAgKHdoaWNoIHRoZVxuXHRcdC8vIHNlc3Npb25zIHRlbGVtZXRyeSBjb250cmlidXRpb24gd291bGQgbWlzcmVhZCBhcyBhIHJlbW90ZSBkZWxldGlvbikuXG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdHsgcHJvdmlkZXI6ICdjbGF1ZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkLCB0cnVlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSwgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zZXNzJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy5zZXNzaW9uVHlwZSksIFsnY2xhdWRlJ10pO1xuXG5cdFx0Y29uc3QgcmVtb3ZlZDogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHJlbW92ZWQucHVzaCguLi5lLnJlbW92ZWQubWFwKHMgPT4gcy5zZXNzaW9uVHlwZSkpKSk7XG5cblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENsYXVkZVByZWZlckFnZW50SG9zdEFnZW50c1NldHRpbmdJZCwgZmFsc2UpO1xuXHRcdGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZSwgQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlZCwgW10sICdoaWRkZW4gc2Vzc2lvbnMgbXVzdCBub3QgYmUgcmVwb3J0ZWQgYXMgcmVtb3ZlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnNlc3Npb25UeXBlKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIGljb25zIG1hdGNoIHRoZSBzZXNzaW9uIHR5cGUgaWNvbicsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZS1jb2RlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAndW5rbm93bi1hZ2VudCcsIGRpc3BsYXlOYW1lOiAnVW5rbm93bicsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xpLXNlc3MnLCB7IHRpdGxlOiAnQ0xJJywgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zZXNzJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlLWNvZGUnIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAndW5rbm93bi1zZXNzJywgeyB0aXRsZTogJ1Vua25vd24nLCBwcm92aWRlcjogJ3Vua25vd24tYWdlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gKHsgc2Vzc2lvblR5cGU6IHMuc2Vzc2lvblR5cGUsIGljb246IHMuaWNvbi5pZCB9KSkuc29ydCgoYSwgYikgPT4gYS5zZXNzaW9uVHlwZS5sb2NhbGVDb21wYXJlKGIuc2Vzc2lvblR5cGUpKSxcblx0XHRcdFtcblx0XHRcdFx0eyBzZXNzaW9uVHlwZTogJ2NsYXVkZS1jb2RlJywgaWNvbjogJ2NsYXVkZScgfSxcblx0XHRcdFx0eyBzZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknLCBpY29uOiAnY29waWxvdCcgfSxcblx0XHRcdFx0eyBzZXNzaW9uVHlwZTogJ3Vua25vd24tYWdlbnQnLCBpY29uOiAndm0nIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gV29ya3NwYWNlIHJlc29sdXRpb24gLS0tLS0tLVxuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UgYnVpbGRzIHdvcmtzcGFjZSBmcm9tIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHdzID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZSh1cmkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdzLCAncmVzb2x2ZVdvcmtzcGFjZSBzaG91bGQgcmVzb2x2ZSBmaWxlOi8vIFVSSXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MubGFiZWwsICdwcm9qZWN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZm9sZGVyc1swXS5yb290LnRvU3RyaW5nKCksIHVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gQnJvd3NlIGFjdGlvbnMgLS0tLS0tLVxuXG5cdHRlc3QoJ2hhcyBubyBicm93c2UgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmJyb3dzZUFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpc3RpbmcgdmlhIG5vdGlmaWNhdGlvbnMgLS0tLS0tLVxuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlU2Vzc2lvbnMgZmlyZXMgd2hlbiBzZXNzaW9uIGFkZGVkIG5vdGlmaWNhdGlvbiBhcnJpdmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbm90aWYtMScsIHsgdGl0bGU6ICdOb3RpZiBTZXNzaW9uJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNbMF0uYWRkZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXS5hZGRlZFswXS50aXRsZS5nZXQoKSwgJ05vdGlmIFNlc3Npb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiByZW1vdmVkIG5vdGlmaWNhdGlvbiByZW1vdmVzIGZyb20gY2FjaGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3RvLXJlbW92ZScsIHsgdGl0bGU6ICdSZW1vdmVkJyB9KTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRmaXJlU2Vzc2lvblJlbW92ZWQoYWdlbnRIb3N0LCAndG8tcmVtb3ZlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzBdLnJlbW92ZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaWRlbnRpY2FsIHNlc3Npb24gYWRkZWQgbm90aWZpY2F0aW9uIGlzIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Y29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2R1cC1zZXNzJywgeyB0aXRsZTogJ0R1cCcsIGNyZWF0ZWRBdDogdGltZXN0YW1wLCBtb2RpZmllZEF0OiB0aW1lc3RhbXAgfSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdkdXAtc2VzcycsIHsgdGl0bGU6ICdEdXAnLCBjcmVhdGVkQXQ6IHRpbWVzdGFtcCwgbW9kaWZpZWRBdDogdGltZXN0YW1wIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3Zpbmcgbm9uLWV4aXN0ZW50IHNlc3Npb24gaXMgbm8tb3AnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0ZmlyZVNlc3Npb25SZW1vdmVkKGFnZW50SG9zdCwgJ2RvZXMtbm90LWV4aXN0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gbGlzdGluZyB2aWEgcmVmcmVzaCAtLS0tLS0tXG5cblx0dGVzdCgnc2Vzc2lvbiBhZGRlZCBhdXRob3JpdGF0aXZlbHkgdXBkYXRlcyBhIGxpc3RlZCBzZXNzaW9uIGluIHBsYWNlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxQcm9qZWN0ID0gVVJJLnBhcnNlKCdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3QnKTtcblx0XHRjb25zdCBvcmlnaW5hbFdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vVXNlcnMvbWUvcHJvamVjdCcpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3dvcmt0cmVlLXVwc2VydCcsIHtcblx0XHRcdHN1bW1hcnk6ICdXb3JrdHJlZSBTZXNzaW9uJyxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiBvcmlnaW5hbFByb2plY3QsIGRpc3BsYXlOYW1lOiAncHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IG9yaWdpbmFsV29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdG1vZGlmaWVkVGltZTogMTAwMCxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXSE7XG5cdFx0Y29uc3Qgb3JpZ2luYWxXb3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSE7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlUHJvamVjdCA9ICdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3Qud29ya3RyZWVzL3Nlc3Npb24nO1xuXHRcdGNvbnN0IHdvcmt0cmVlV29ya2luZ0RpcmVjdG9yeSA9ICdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3Qud29ya3RyZWVzL3Nlc3Npb24vc3JjJztcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3dvcmt0cmVlLXVwc2VydCcsIHtcblx0XHRcdHRpdGxlOiAnV29ya3RyZWUgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogd29ya3RyZWVQcm9qZWN0LCBkaXNwbGF5TmFtZTogJ3Byb2plY3Qtd29ya3RyZWUnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrdHJlZVdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDEwMDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgyMDAwKS50b0lTT1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoYWdlbnRIb3N0LCAnd29ya3RyZWUtdXBzZXJ0Jywge1xuXHRcdFx0X21ldGE6IHsgZ2l0OiB7IGJyYW5jaE5hbWU6ICdhZ2VudHMvd29ya3RyZWUtc2Vzc2lvbicsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY3VycmVudCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0hO1xuXHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2UgPSBjdXJyZW50LndvcmtzcGFjZS5nZXQoKSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYW1lQWRhcHRlcjogY3VycmVudCA9PT0gc2Vzc2lvbixcblx0XHRcdG9yaWdpbmFsV29ya2luZ0RpcmVjdG9yeTogb3JpZ2luYWxXb3Jrc3BhY2UuZm9sZGVyc1swXS53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjdXJyZW50V29ya3NwYWNlLmZvbGRlcnNbMF0ud29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpLFxuXHRcdFx0YnJhbmNoTmFtZTogY3VycmVudFdvcmtzcGFjZS5mb2xkZXJzWzBdLmdpdFJlcG9zaXRvcnk/LmJyYW5jaE5hbWUsXG5cdFx0XHRjaGFuZ2VkRXZlbnRzOiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gY2hhbmdlLmNoYW5nZWQubWFwKGNoYW5nZWQgPT4gY2hhbmdlZCA9PT0gc2Vzc2lvbikpLFxuXHRcdH0sIHtcblx0XHRcdHNhbWVBZGFwdGVyOiB0cnVlLFxuXHRcdFx0b3JpZ2luYWxXb3JraW5nRGlyZWN0b3J5OiBvcmlnaW5hbFdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmt0cmVlV29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdGJyYW5jaE5hbWU6ICdhZ2VudHMvd29ya3RyZWUtc2Vzc2lvbicsXG5cdFx0XHRjaGFuZ2VkRXZlbnRzOiBbW3RydWVdLCBbdHJ1ZV1dLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBtZXRhZGF0YSBjaGFuZ2VzIG5vdGlmeSB3aGVuIG9ic2VydmFibGUgZ2l0IGZpZWxkcyBjaGFuZ2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdnaXQtbWV0YScsIHtcblx0XHRcdHN1bW1hcnk6ICdHaXQgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3QnKSwgZGlzcGxheU5hbWU6ICdwcm9qZWN0JyB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdITtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXHRcdGNvbnN0IG1ldGEgPSB7XG5cdFx0XHRnaXQ6IHtcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvd29ya3RyZWUnLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRoYXNHaXRIdWJSZW1vdGU6IHRydWUsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogJ29yaWdpbi9mZWF0dXJlL3dvcmt0cmVlJyxcblx0XHRcdFx0aW5jb21pbmdDaGFuZ2VzOiAyLFxuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDMsXG5cdFx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogNCxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGZpcmVTZXNzaW9uTWV0YUNoYW5nZWQoYWdlbnRIb3N0LCAnZ2l0LW1ldGEnLCBtZXRhKTtcblx0XHRmaXJlU2Vzc2lvbk1ldGFDaGFuZ2VkKGFnZW50SG9zdCwgJ2dpdC1tZXRhJywgbWV0YSk7XG5cblx0XHRjb25zdCBnaXRSZXBvc2l0b3J5ID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0uZ2l0UmVwb3NpdG9yeSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2hOYW1lOiBnaXRSZXBvc2l0b3J5LmJyYW5jaE5hbWUsXG5cdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IGdpdFJlcG9zaXRvcnkudW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0Y2hhbmdlZEV2ZW50czogY2hhbmdlcy5tYXAoY2hhbmdlID0+IGNoYW5nZS5jaGFuZ2VkLm1hcChjaGFuZ2VkID0+IGNoYW5nZWQgPT09IHNlc3Npb24pKSxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS93b3JrdHJlZScsXG5cdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDQsXG5cdFx0XHRjaGFuZ2VkRXZlbnRzOiBbW3RydWVdXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25zIHBvcHVsYXRlcyBmcm9tIGxpc3RTZXNzaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2xpc3QtMScsIHsgc3VtbWFyeTogJ0ZpcnN0JyB9KSk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignbGlzdC0yJywgeyBzdW1tYXJ5OiAnU2Vjb25kJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQub2soY2hhbmdlcy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cdH0pKTtcblxuXHR0ZXN0KCdlYWdlcmx5IHBvcHVsYXRlcyBhbmQgZmlyZXMgb25EaWRDaGFuZ2VTZXNzaW9ucyBhZnRlciBjb25zdHJ1Y3Rpb24gd2l0aG91dCBhIGdldFNlc3Npb25zKCkgY2FsbCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2VhZ2VyLTEnLCB7IHN1bW1hcnk6ICdGaXJzdCcgfSkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2VhZ2VyLTInLCB7IHN1bW1hcnk6ICdTZWNvbmQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBlYWdlciBsaXN0U2Vzc2lvbnMoKSB0cmlnZ2VyZWQgYnkgdGhlIGNvbnN0cnVjdG9yLlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50Q291bnQ6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IGNoYW5nZXNbMF0/LmFkZGVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLnNvcnQoKSxcblx0XHRcdHJlbW92ZWQ6IGNoYW5nZXNbMF0/LnJlbW92ZWQubGVuZ3RoLFxuXHRcdFx0Y2hhbmdlZDogY2hhbmdlc1swXT8uY2hhbmdlZC5sZW5ndGgsXG5cdFx0XHRjYWNoZWRUaXRsZXM6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSkuc29ydCgpLFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50Q291bnQ6IDEsXG5cdFx0XHRhZGRlZDogWydGaXJzdCcsICdTZWNvbmQnXSxcblx0XHRcdHJlbW92ZWQ6IDAsXG5cdFx0XHRjaGFuZ2VkOiAwLFxuXHRcdFx0Y2FjaGVkVGl0bGVzOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnZGVmZXJzIGVhZ2VyIHNlc3Npb24gbGlzdCBmZXRjaCB1bnRpbCBhdXRoZW50aWNhdGlvbiBzZXR0bGVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgZnJlc2ggbGF1bmNoOiBhdXRoIGlzIHBlbmRpbmcgYW5kIHRoZSBhZ2VudCBob3N0IGhhcyBub1xuXHRcdC8vIHNlc3Npb25zIHlldCAocmV0dXJucyBbXSksIHRoZW4gYXV0aCBjb21wbGV0ZXMgYW5kIHRoZSByZWFsIHNlc3Npb25cblx0XHQvLyBsaXN0IGJlY29tZXMgYXZhaWxhYmxlLlxuXHRcdGFnZW50SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwLCAnbm8gZXZlbnQgc2hvdWxkIGZpcmUgd2hpbGUgYXV0aGVudGljYXRpb24gaXMgcGVuZGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ25vIHNlc3Npb25zIHNob3VsZCBiZSBjYWNoZWQgd2hpbGUgYXV0aGVudGljYXRpb24gaXMgcGVuZGluZycpO1xuXG5cdFx0Ly8gQXV0aCBjb21wbGV0ZXM7IHNlc3Npb25zIGJlY29tZSBhdmFpbGFibGUgb24gdGhlIGFnZW50IGhvc3QuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignYWZ0ZXItYXV0aC0xJywgeyBzdW1tYXJ5OiAnRmlyc3QnIH0pKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdhZnRlci1hdXRoLTInLCB7IHN1bW1hcnk6ICdTZWNvbmQnIH0pKTtcblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50Q291bnQ6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IGNoYW5nZXNbMF0/LmFkZGVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLnNvcnQoKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHRcdGFkZGVkOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdFx0Y2FjaGVkVGl0bGVzOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVjb3ZlcnMgYW4gZW1wdHkgbGlzdCB3aGVuIHRoZSBpbml0aWFsIGxpc3RTZXNzaW9ucyBmYWlscywgd2l0aG91dCBuZWVkaW5nIGEgbmV3IHNlc3Npb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBGcmVzaCBsYXVuY2g6IHRoZSBhZ2VudCB0aHJvd3Mgb24gdGhlIGZpcnN0IGxpc3RTZXNzaW9ucygpIChlLmcuXG5cdFx0Ly8gQUhQX0FVVEhfUkVRVUlSRUQgYmVmb3JlIGl0cyB0b2tlbiBpcyBlZmZlY3RpdmUsIG9yIGEgdHJhbnNpZW50XG5cdFx0Ly8gb2ZmbGluZSBlcnJvcikuIFRoZSBzZXNzaW9ucyByZWFsbHkgZXhpc3Qgb24gdGhlIGhvc3QuXG5cdFx0YWdlbnRIb3N0LmZhaWxMaXN0U2Vzc2lvbnNDb3VudCA9IDE7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignaGVhbC0xJywgeyBzdW1tYXJ5OiAnRmlyc3QnIH0pKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdoZWFsLTInLCB7IHN1bW1hcnk6ICdTZWNvbmQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdC8vIFRoZSBlYWdlciByZWZyZXNoIGZpcmVzIGFuZCBmYWlsczsgbm90aGluZyBpcyBjYWNoZWQgeWV0LlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwLCAnbm8gZXZlbnQgc2hvdWxkIGZpcmUgYWZ0ZXIgYSBmYWlsZWQgaW5pdGlhbCByZWZyZXNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwLCAnY2FjaGUgc3RheXMgZW1wdHkgYWZ0ZXIgYSBmYWlsZWQgaW5pdGlhbCByZWZyZXNoJyk7XG5cblx0XHQvLyBUaGUgYmFja29mZiByZXRyeSAobWluIDFzKSBmaXJlcyBvbiBpdHMgb3duIFx1MjAxNCBubyBDaGF0VHVybkNvbXBsZXRlXG5cdFx0Ly8gb3Igc2Vzc2lvbkFkZGVkIG5lZWRlZCBcdTIwMTQgYW5kIHRoZSBsaXN0IHNlbGYtaGVhbHMuXG5cdFx0YXdhaXQgdGltZW91dCgxXzEwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50Q291bnQ6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IGNoYW5nZXNbMF0/LmFkZGVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLnNvcnQoKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHRcdGFkZGVkOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdFx0Y2FjaGVkVGl0bGVzOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYSBzZXNzaW9uIHdob3NlIGFnZW50IHJlcG9ydHMgbm90aGluZyBzdXJ2aXZlcyB0aGUgcmVmcmVzaCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBob3N0IGFnZ3JlZ2F0ZXMgb25lIGxpc3RpbmcgYWNyb3NzIGFsbCBvZiBpdHMgYWdlbnRzLCBhbmQgYW5cblx0XHQvLyBhZ2VudCB0aGF0IGNhbm5vdCBlbnVtZXJhdGUgeWV0IChTREsgbm90IGRvd25sb2FkZWQpIGNvbnRyaWJ1dGVzIGFuXG5cdFx0Ly8gZW1wdHkgbGlzdCBpbnN0ZWFkIG9mIGZhaWxpbmcuIENvZGV4IGdvaW5nIHF1aWV0IG11c3Qgbm90IGV2aWN0IGl0c1xuXHRcdC8vIHNlc3Npb25zOiBgcmVtb3ZlZGAgaXMgdHJlYXRlZCBhcyBhIGRlZmluaXRpdmUgZGVsZXRpb24gZG93bnN0cmVhbVxuXHRcdC8vIGFuZCB3b3VsZCBkaXNjYXJkIHRoZSB1c2VyJ3MgcGlucyBhbmQgZ3JvdXBzLlxuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29kZXgnLCBkaXNwbGF5TmFtZTogJ0NvZGV4JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkU2V0dGluZ0lkLCB0cnVlKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdjb2RleC0xJywgeyBwcm92aWRlcjogJ2NvZGV4Jywgc3VtbWFyeTogJ0NvZGV4IE9uZScgfSkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NsaS0xJywgeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBzdW1tYXJ5OiAnQ0xJIE9uZScgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2UgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhZ2VudEhvc3Quc3RvcExpc3RpbmdTZXNzaW9ucygnY29kZXgtMScpO1xuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjbGktMScpLnRvU3RyaW5nKCkpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSB9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlZDogY2hhbmdlcy5mbGF0TWFwKGMgPT4gYy5yZW1vdmVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVtb3ZlZDogW10sXG5cdFx0XHRjYWNoZWRUaXRsZXM6IFsnQ0xJIE9uZScsICdDb2RleCBPbmUnXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Egc2Vzc2lvbiBtaXNzaW5nIHdoaWxlIGl0cyBhZ2VudCBzdGlsbCByZXBvcnRzIG90aGVycyBpcyBldmljdGVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIGFnZW50IGFuc3dlcmVkIGFuZCBsaXN0ZWQgYSBzaWJsaW5nIHNlc3Npb24sIHNvIGl0cyBuYW1lc3BhY2UgaXNcblx0XHQvLyBrbm93bjogdGhlIG1pc3Npbmcgc2Vzc2lvbiByZWFsbHkgaXMgZ29uZSBhbmQgbXVzdCBiZSBldmljdGVkLlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NsaS1nb25lJywgeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBzdW1tYXJ5OiAnR29uZScgfSkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NsaS1rZXB0JywgeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBzdW1tYXJ5OiAnS2VwdCcgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGFnZW50SG9zdC5zdG9wTGlzdGluZ1Nlc3Npb25zKCdjbGktZ29uZScpO1xuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjbGkta2VwdCcpLnRvU3RyaW5nKCkpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSB9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlZDogY2hhbmdlcy5mbGF0TWFwKGMgPT4gYy5yZW1vdmVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVtb3ZlZDogWydHb25lJ10sXG5cdFx0XHRjYWNoZWRUaXRsZXM6IFsnS2VwdCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYSBzdWNjZXNzZnVsIGVtcHR5IGxpc3RTZXNzaW9ucyBhcm1zIG5vIHJldHJ5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTm8gc2Vzc2lvbnMgb24gdGhlIGhvc3Q6IGxpc3RTZXNzaW9ucygpIHN1Y2NlZWRzIHdpdGggW10uIFRoaXMgaXMgYVxuXHRcdC8vIHZhbGlkIHJlc3VsdCwgbm90IGEgZmFpbHVyZSBcdTIwMTQgdGhlIGNhY2hlIHNob3VsZCBiZSBtYXJrZWQgaW5pdGlhbGl6ZWRcblx0XHQvLyBhbmQgbm8gYmFja2dyb3VuZCByZXRyeSBzaG91bGQgYmUgc2NoZWR1bGVkLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgY2FsbHNBZnRlckVhZ2VyTG9hZCA9IGFnZW50SG9zdC5saXN0U2Vzc2lvbnNDYWxsQ291bnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzQWZ0ZXJFYWdlckxvYWQsIDEsICdleGFjdGx5IG9uZSBlYWdlciBsaXN0U2Vzc2lvbnMgY2FsbCcpO1xuXG5cdFx0Ly8gQWR2YW5jZSB3ZWxsIHBhc3QgdGhlIG1heCBiYWNrb2ZmIHdpbmRvdzsgbm8gcmV0cnkgc2hvdWxkIGZpcmUuXG5cdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5saXN0U2Vzc2lvbnNDYWxsQ291bnQsIGNhbGxzQWZ0ZXJFYWdlckxvYWQsICdubyByZXRyeSBzaG91bGQgYmUgc2NoZWR1bGVkIGFmdGVyIGEgc3VjY2Vzc2Z1bCBlbXB0eSBsaXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwLCAnbm8gY2hhbmdlIGV2ZW50IGZvciBhbiBlbXB0eSBsaXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JldHJpZXMgd2l0aCBiYWNrb2ZmIHVudGlsIGxpc3RTZXNzaW9ucyBzdWNjZWVkcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEZpcnN0IHR3byBhdHRlbXB0cyBmYWlsLCB0aGlyZCBzdWNjZWVkcy4gVmVyaWZpZXMgdGhlIHJldHJ5IGtlZXBzXG5cdFx0Ly8gcmUtYXJtaW5nIHJhdGhlciB0aGFuIGdpdmluZyB1cCBhZnRlciBhIHNpbmdsZSBmYWlsZWQgYXR0ZW1wdC5cblx0XHRhZ2VudEhvc3QuZmFpbExpc3RTZXNzaW9uc0NvdW50ID0gMjtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdiYWNrb2ZmLTEnLCB7IHN1bW1hcnk6ICdPbmx5JyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ2VtcHR5IGFmdGVyIGZpcnN0IGZhaWx1cmUnKTtcblxuXHRcdC8vIEZpcnN0IHJldHJ5ICh+MXMpIFx1MjAxNCBzdGlsbCBmYWlsaW5nLlxuXHRcdGF3YWl0IHRpbWVvdXQoMV8xMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ2VtcHR5IGFmdGVyIHNlY29uZCBmYWlsdXJlJyk7XG5cblx0XHQvLyBTZWNvbmQgcmV0cnkgKH4ycyBiYWNrb2ZmKSBcdTIwMTQgbm93IHN1Y2NlZWRzLlxuXHRcdGF3YWl0IHRpbWVvdXQoMl8yMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudENvdW50OiBjaGFuZ2VzLmxlbmd0aCxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHRcdGNhY2hlZFRpdGxlczogWydPbmx5J10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHQvLyAtLS0tIFN0YXJ0dXAgc2Vzc2lvbiBjYWNoZSAocGVyc2lzdGVuY2UpIC0tLS0tLS1cblxuXHR0ZXN0KCdoeWRyYXRlcyBwZXJzaXN0ZWQgc2Vzc2lvbnMgb24gc3RhcnR1cCBiZWZvcmUgdGhlIGxpdmUgbGlzdCBpcyBhdmFpbGFibGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbY3JlYXRlU2Vzc2lvbignY2FjaGVkLTEnLCB7IHN1bW1hcnk6ICdDYWNoZWQgT25lJyB9KV0pO1xuXG5cdFx0Ly8gRnJlc2ggbGF1bmNoOiBhdXRoZW50aWNhdGlvbiBpcyBzdGlsbCBwZW5kaW5nIHNvIHRoZSBlYWdlciByZWZyZXNoIGlzXG5cdFx0Ly8gZGVmZXJyZWQsIHlldCB0aGUgcGVyc2lzdGVkIHNlc3Npb24gbXVzdCBzdXJmYWNlIGltbWVkaWF0ZWx5LlxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlzdFNlc3Npb25zQ2FsbHM6IG5leHRIb3N0Lmxpc3RTZXNzaW9uc0NhbGxDb3VudCxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKSxcblx0XHR9LCB7XG5cdFx0XHRsaXN0U2Vzc2lvbnNDYWxsczogMCxcblx0XHRcdGNhY2hlZFRpdGxlczogWydDYWNoZWQgT25lJ10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkaXNjYXJkcyBhIGxlZ2FjeSBjYWNoZSBlbnRyeSBzbyByZWFkIHN0YXRlIGlzIHJlYnVpbHQgZnJvbSB0aGUgaG9zdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFN0b3JhZ2Uta2V5IGxpdGVyYWxzIG9mIHRoZSBwcmUtYC52MmAgY2FjaGUgc2NoZW1hLCB3aG9zZSBlbnRyaWVzXG5cdFx0Ly8gY2FycmllZCBhIHN0YWxlIGBpc1JlYWQ6IHRydWVgIHdyaXR0ZW4gYnkgdGhlIG9sZCBhbHdheXMtcmVhZCBhZGFwdGVyLlxuXHRcdGNvbnN0IExFR0FDWV9LRVkgPSAnbG9jYWxBZ2VudEhvc3QuY2FjaGVkU2Vzc2lvbnMnO1xuXHRcdGNvbnN0IENVUlJFTlRfS0VZID0gJ2xvY2FsQWdlbnRIb3N0LmNhY2hlZFNlc3Npb25zLnYyJztcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgcHJldmlvdXMgKG9sZC1zY2hlbWEpIHdpbmRvdzogcGVyc2lzdCBhIHNlc3Npb24sIHRoZW4gbW92ZVxuXHRcdC8vIHRoZSBzbmFwc2hvdCB0byB0aGUgbGVnYWN5IGtleSBhcyB0aGUgb2xkIGJ1aWxkIHdvdWxkIGhhdmUgd3JpdHRlbiBpdC5cblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbY3JlYXRlU2Vzc2lvbignbGVnYWN5LTEnLCB7IHN1bW1hcnk6ICdMZWdhY3kgT25lJyB9KV0pO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KENVUlJFTlRfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGFzc2VydC5vayhzbmFwc2hvdCwgJ3ByZWNvbmRpdGlvbjogY3VycmVudC1rZXkgc25hcHNob3Qgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoTEVHQUNZX0tFWSwgc25hcHNob3QsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoQ1VSUkVOVF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cblx0XHQvLyBGcmVzaCBsYXVuY2ggd2l0aCBhdXRoZW50aWNhdGlvbiBwZW5kaW5nIHNvIG5vIGxpdmUgcmVmcmVzaCBydW5zOiB0aGVcblx0XHQvLyBsZWdhY3kgZW50cnkgbXVzdCBiZSBkaXNjYXJkZWQgcmF0aGVyIHRoYW4gaHlkcmF0ZWQsIGFuZCBpdHMga2V5IHJlbW92ZWQuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBuZXh0SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYWNoZWRTZXNzaW9uczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsXG5cdFx0XHRsZWdhY3lLZXlQcmVzZW50OiBzdG9yYWdlU2VydmljZS5nZXQoTEVHQUNZX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSAhPT0gdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGNhY2hlZFNlc3Npb25zOiAwLFxuXHRcdFx0bGVnYWN5S2V5UHJlc2VudDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjYWNoZXMgc2Vzc2lvbi1zY29wZWQgZmxhZ3MgYnV0IG5ldmVyIHRyYW5zaWVudCBhY3Rpdml0eSBiaXRzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Ly8gQSBzZXNzaW9uIHRoYXQgd2FzIG1pZC10dXJuIChhbmQgdW5yZWFkKSB3aGVuIHRoZSBjYWNoZSB3YXMgZmx1c2hlZC5cblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbe1xuXHRcdFx0Li4uY3JlYXRlU2Vzc2lvbignYnVzeS0xJywgeyBzdW1tYXJ5OiAnQnVzeSBPbmUnIH0pLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB8IFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLFxuXHRcdH1dKTtcblxuXHRcdC8vIEF1dGhlbnRpY2F0aW9uIHBlbmRpbmcsIHNvIG5vdGhpbmcgY29ycmVjdHMgdGhlIGh5ZHJhdGVkIHN0YXRlIFx1MjAxNCBhIHN0YWxlXG5cdFx0Ly8gc3Bpbm5lciBoZXJlIHdvdWxkIHN0aWNrIGFyb3VuZCBpbmRlZmluaXRlbHkgZm9yIGFuIHVucmVhY2hhYmxlIHJlbW90ZSBob3N0LlxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogcmVzdG9yZWQuc3RhdHVzLmdldCgpLFxuXHRcdFx0aXNBcmNoaXZlZDogcmVzdG9yZWQuaXNBcmNoaXZlZC5nZXQoKSxcblx0XHRcdGlzUmVhZDogcmVzdG9yZWQuaXNSZWFkLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRpc0FyY2hpdmVkOiB0cnVlLFxuXHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2h5ZHJhdGVkIHF1aWNrIGNoYXQgc3RheXMgd29ya3NwYWNlLWxlc3MgYWZ0ZXIgcmVsb2FkIGRlc3BpdGUgYSBzY3JhdGNoIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiAjMzI0NTgxOiBhIGNvbW1pdHRlZCBxdWljayBjaGF0IHBlcnNpc3RlZCBpbnRvIHRoZSBzdGFydHVwXG5cdFx0Ly8gY2FjaGUgY2FycmllcyBhIHNjcmF0Y2ggY3dkLiBUaGUgYWRhcHRlciBzZWVkcyBpdHMgc2Vzc2lvbi1raW5kIGF0XG5cdFx0Ly8gY29uc3RydWN0aW9uIGZyb20gYF9tZXRhLndvcmtzcGFjZWxlc3NgLCBzbyB0aGUgdGFnIG11c3Qgc3Vydml2ZSB0aGVcblx0XHQvLyBzZXJpYWxpemUvZGVzZXJpYWxpemUgcm91bmQtdHJpcCBcdTIwMTQgb3RoZXJ3aXNlIHRoZSByZXN0b3JlZCBzZXNzaW9uXG5cdFx0Ly8gbGVha3MgdGhlIHNjcmF0Y2ggZGlyIGFzIGEgd29ya3NwYWNlIGZvbGRlci5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbXG5cdFx0XHRjcmVhdGVTZXNzaW9uKCdxdWljay1jYWNoZWQnLCB7XG5cdFx0XHRcdHN1bW1hcnk6ICdRdWljayBDaGF0Jyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy90bXAvY29waWxvdC1zY3JhdGNoL3F1aWNrLWNhY2hlZCcpLFxuXHRcdFx0XHRxdWlja0NoYXQ6IHRydWUsXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBBZ2VudFNlc3Npb24uaWQocy5yZXNvdXJjZS50b1N0cmluZygpKSA9PT0gJ3F1aWNrLWNhY2hlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d29ya3NwYWNlOiBzZXNzaW9uPy53b3Jrc3BhY2UuZ2V0KCksXG5cdFx0XHRpc1F1aWNrQ2hhdDogc2Vzc2lvbj8uaXNRdWlja0NoYXQ/LmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhIHJlZnJlc2ggcHVibGlzaGVzIF9tZXRhIGFuZCBzdW1tYXJ5IGZpZWxkcyBhcyBvbmUgYXRvbWljIHVwZGF0ZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlci51cGRhdGVgIGFwcGxpZXMgYF9tZXRhYCB0aHJvdWdoIGBzZXRNZXRhYCxcblx0XHQvLyB3aGljaCBtdXN0IGpvaW4gdGhlIGNhbGxlcidzIHRyYW5zYWN0aW9uLiBBIHBsYWluIGB0cmFuc2FjdGlvbigpYFxuXHRcdC8vIGZpbmlzaGVzIFx1MjAxNCBhbmQgdGhlcmVmb3JlIG5vdGlmaWVzIFx1MjAxNCBiZWZvcmUgYHVwZGF0ZWAgaGFzIGFwcGxpZWQgdGhlXG5cdFx0Ly8gcmVzdCBvZiB0aGUgc25hcHNob3QsIHNvIG9ic2VydmVycyB3b3VsZCBzZWUgYSB0b3JuIHN0YXRlOiB0aGUgbmV3XG5cdFx0Ly8gd29ya3NwYWNlIChvciBhIGZyZXNoIHF1aWNrLWNoYXQgcHJvbW90aW9uKSBhbG9uZ3NpZGUgdGhlIHByZXZpb3VzXG5cdFx0Ly8gYXJjaGl2ZWQvcmVhZCBmbGFncy5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdhdG9taWMtMScsIHsgc3VtbWFyeTogJ09uZScsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvcmVwbycpIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRjb25zdCBvYnNlcnZlZDogeyBicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDsgaXNBcmNoaXZlZDogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0b2JzZXJ2ZWQucHVzaCh7XG5cdFx0XHRcdGJyYW5jaDogc2Vzc2lvbi53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5icmFuY2hOYW1lLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiBzZXNzaW9uLmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT25lIHJlZnJlc2ggdGhhdCBtb3ZlcyBib3RoIHRoZSBgX21ldGFgLWRlcml2ZWQgd29ya3NwYWNlIGFuZCBhXG5cdFx0Ly8gcGxhaW4gc3VtbWFyeSBmaWVsZC5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbih7XG5cdFx0XHQuLi5jcmVhdGVTZXNzaW9uKCdhdG9taWMtMScsIHsgc3VtbWFyeTogJ09uZScsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvcmVwbycpIH0pLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSB8IFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uR2l0U3RhdGUodW5kZWZpbmVkLCB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9KSxcblx0XHR9KTtcblx0XHRhZ2VudEhvc3QuZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnYXRvbWljLTEnKS50b1N0cmluZygpKSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUgfSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9ic2VydmVkLCBbXG5cdFx0XHR7IGJyYW5jaDogdW5kZWZpbmVkLCBpc0FyY2hpdmVkOiBmYWxzZSB9LFxuXHRcdFx0eyBicmFuY2g6ICdmZWF0dXJlJywgaXNBcmNoaXZlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYSBzdW1tYXJ5Q2hhbmdlZCBub3RpZmljYXRpb24gcHVibGlzaGVzIHRoZSBjaGFuZ2UgY2hpcCBhbmQgX21ldGEgYXMgb25lIGF0b21pYyB1cGRhdGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBgX2hhbmRsZVNlc3Npb25TdW1tYXJ5Q2hhbmdlZGAgYmF0Y2hlcyBpbnRvIGEgdHJhbnNhY3Rpb24sIGJ1dCBhXG5cdFx0Ly8gc2V0dGVyIHRoYXQgd3JpdGVzIGl0cyBvYnNlcnZhYmxlIHdpdGhvdXQgb25lIGJ1aWxkcyBhbmQgZmluaXNoZXMgYVxuXHRcdC8vIHRyYW5zYWN0aW9uIG9mIGl0cyBvd24sIG5vdGlmeWluZyBpbW1lZGlhdGVseS4gYGNoYW5nZXNgIGlzIGFwcGxpZWRcblx0XHQvLyBiZWZvcmUgYF9tZXRhYCwgc28gYW4gb2JzZXJ2ZXIgb2YgYm90aCB3b3VsZCBvdGhlcndpc2UgcnVuIG9uY2Ugb25cblx0XHQvLyB0aGUgbmV3IGNoaXAgd2l0aCB0aGUgc3RhbGUgd29ya3NwYWNlLCB0aGVuIGFnYWluIGF0IHRoZSBvdXRlclxuXHRcdC8vIGZpbmlzaC5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdhdG9taWMtMicsIHsgc3VtbWFyeTogJ1R3bycsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvcmVwbycpIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRjb25zdCBvYnNlcnZlZDogeyBicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDsgZmlsZXM6IG51bWJlciB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0b2JzZXJ2ZWQucHVzaCh7XG5cdFx0XHRcdGJyYW5jaDogc2Vzc2lvbi53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5icmFuY2hOYW1lLFxuXHRcdFx0XHRmaWxlczogc2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeT8ucmVhZChyZWFkZXIpPy5maWxlcyxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGZpcmVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoYWdlbnRIb3N0LCAnYXRvbWljLTInLCB7XG5cdFx0XHRjaGFuZ2VzOiB7IGFkZGl0aW9uczogMywgZGVsZXRpb25zOiAxLCBmaWxlczogMiB9LFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uR2l0U3RhdGUodW5kZWZpbmVkLCB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9KSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvYnNlcnZlZCwgW1xuXHRcdFx0eyBicmFuY2g6IHVuZGVmaW5lZCwgZmlsZXM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBicmFuY2g6ICdmZWF0dXJlJywgZmlsZXM6IDIgfSxcblx0XHRdKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlY29uY2lsZXMgaHlkcmF0ZWQgc2Vzc2lvbnMgYWdhaW5zdCB0aGUgYXV0aG9yaXRhdGl2ZSBsaXN0LCBwcnVuaW5nIHN0YWxlIGVudHJpZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbY3JlYXRlU2Vzc2lvbignc3RhbGUtMScsIHsgc3VtbWFyeTogJ1N0YWxlJyB9KV0pO1xuXG5cdFx0Ly8gRnJlc2ggbGF1bmNoIHdpdGggYW4gYXV0aG9yaXRhdGl2ZSAoZW1wdHkpIGxpc3Q6IHRoZSBoeWRyYXRlZCBzZXNzaW9uXG5cdFx0Ly8gc2hvd3MgaW1tZWRpYXRlbHksIHRoZW4gaXMgcHJ1bmVkIG9uY2UgdGhlIGZpcnN0IHJlZnJlc2ggc3VjY2VlZHMuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG5leHRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cblx0XHRjb25zdCBiZWZvcmVSZWZyZXNoID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGFmdGVyUmVmcmVzaCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmVmb3JlUmVmcmVzaCwgYWZ0ZXJSZWZyZXNoIH0sIHsgYmVmb3JlUmVmcmVzaDogWydTdGFsZSddLCBhZnRlclJlZnJlc2g6IFtdIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnaHlkcmF0ZWQgc2Vzc2lvbnMgc3Vydml2ZSBhIGZhaWxlZCBpbml0aWFsIGxpc3RTZXNzaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGF3YWl0IHBlcnNpc3RDYWNoZWRTZXNzaW9ucyhkaXNwb3NhYmxlcywgc3RvcmFnZVNlcnZpY2UsIFtjcmVhdGVTZXNzaW9uKCdyZXNpbGllbnQtMScsIHsgc3VtbWFyeTogJ1Jlc2lsaWVudCcgfSldKTtcblxuXHRcdC8vIEZyZXNoIGxhdW5jaCB3aGVyZSB0aGUgZmlyc3QgbGlzdFNlc3Npb25zKCkgdGhyb3dzIChlLmcuXG5cdFx0Ly8gQUhQX0FVVEhfUkVRVUlSRUQgYmVmb3JlIHRoZSB0b2tlbiBpcyBlZmZlY3RpdmUpLiBXaXRob3V0IGNhY2hpbmcgdGhlXG5cdFx0Ly8gbGlzdCB3b3VsZCBiZSBlbXB0eSB1bnRpbCB0aGUgcmV0cnkgaGVhbHM7IHRoZSBwZXJzaXN0ZWQgc2Vzc2lvbiBtdXN0XG5cdFx0Ly8gc3RheSB2aXNpYmxlIHRocm91Z2hvdXQuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LmZhaWxMaXN0U2Vzc2lvbnNDb3VudCA9IDE7XG5cdFx0bmV4dEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdyZXNpbGllbnQtMScsIHsgc3VtbWFyeTogJ1Jlc2lsaWVudCcgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG5leHRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGFmdGVyRmFpbGVkTGlzdCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSk7XG5cblx0XHQvLyBUaGUgYmFja29mZiByZXRyeSAobWluIDFzKSBoZWFsczsgdGhlIHNlc3Npb24gcmVtYWlucyBsaXN0ZWQuXG5cdFx0YXdhaXQgdGltZW91dCgxXzEwMCk7XG5cdFx0Y29uc3QgYWZ0ZXJSZXRyeSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWZ0ZXJGYWlsZWRMaXN0LCBhZnRlclJldHJ5IH0sIHsgYWZ0ZXJGYWlsZWRMaXN0OiBbJ1Jlc2lsaWVudCddLCBhZnRlclJldHJ5OiBbJ1Jlc2lsaWVudCddIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgndXNlcyBwcm9qZWN0IG1ldGFkYXRhIGFzIHdvcmtzcGFjZSBncm91cCBzb3VyY2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9qZWN0VXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvdnNjb2RlJyk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvdG1wL2NvcGlsb3Qtd29ya3RyZWVzL3ZzY29kZS1mZWF0dXJlJyk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncHJvamVjdC0xJywge1xuXHRcdFx0c3VtbWFyeTogJ1Byb2plY3QgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogcHJvamVjdFVyaSwgZGlzcGxheU5hbWU6ICd2c2NvZGUnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogd29ya3NwYWNlPy5sYWJlbCxcblx0XHRcdHJlcG9zaXRvcnk6IHdvcmtzcGFjZT8uZm9sZGVyc1swXT8ucm9vdC50b1N0cmluZygpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya3NwYWNlPy5mb2xkZXJzWzBdPy53b3JraW5nRGlyZWN0b3J5Py50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAndnNjb2RlJyxcblx0XHRcdHJlcG9zaXRvcnk6IHByb2plY3RVcmkudG9TdHJpbmcoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2xpc3RlZCBzZXNzaW9uIHdpdGggb25seSB3b3JraW5nRGlyZWN0b3J5IChubyBwcm9qZWN0KSBzaG93cyBmb2xkZXIgbmFtZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9zdGFuZGFsb25lLWZvbGRlcicpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3dkLW9ubHktMScsIHtcblx0XHRcdHN1bW1hcnk6ICdXRC1vbmx5IFNlc3Npb24nLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0ud29ya3NwYWNlLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2U/LmxhYmVsLCAnc3RhbmRhbG9uZS1mb2xkZXInKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Nlc3Npb24gYWRkZWQgbm90aWZpY2F0aW9uIGRvZXMgbm90IGNhcnJ5IG1vZGVsIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdub3RpZi1tb2RlbCcsIHsgdGl0bGU6ICdOb3RpZiBNb2RlbCBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnTm90aWYgTW9kZWwgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5tb2RlbElkLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNb2RlbHMgcmV0dXJucyBvbmx5IG1vZGVscyB0YXJnZXRpbmcgdGhlIHNlc3Npb24gcmVzb3VyY2Ugc2NoZW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoaW5nTW9kZWwgPSB7IC4uLmNyZWF0ZVRlc3RMYW5ndWFnZU1vZGVsKCdtYXRjaGluZycpLCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH07XG5cdFx0Y29uc3Qgb3RoZXJNb2RlbCA9IHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwoJ290aGVyJyksIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3Qtb3RoZXInIH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdGxhbmd1YWdlTW9kZWxJZHM6IFsnbWF0Y2hpbmcnLCAnb3RoZXInLCAnbWlzc2luZyddLFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogaWQgPT4gaWQgPT09ICdtYXRjaGluZycgPyBtYXRjaGluZ01vZGVsIDogaWQgPT09ICdvdGhlcicgPyBvdGhlck1vZGVsIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbW9kZWwtY2F0YWxvZycsIHsgdGl0bGU6ICdNb2RlbCBDYXRhbG9nIFNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLnRpdGxlLmdldCgpID09PSAnTW9kZWwgQ2F0YWxvZyBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbHM6IHNuYXBzaG90Lm1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciksXG5cdFx0XHRtb2RlbFRhcmdldDogc25hcHNob3QubW9kZWxUYXJnZXQsXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxzOiBbJ21hdGNoaW5nJ10sXG5cdFx0XHRtb2RlbFRhcmdldDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE1vZGVsc1NuYXBzaG90IGNhbm9uaWNhbGl6ZXMgYSBtYXRjaGluZyBsb2dpY2FsLXNlc3Npb24gbW9kZWwgaWRlbnRpZmllcicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbElkID0gJ2dwdC01LjYtc29sJztcblx0XHRjb25zdCBsb2dpY2FsSWRlbnRpZmllciA9IGBjb3BpbG90Y2xpLyR7bW9kZWxJZH1gO1xuXHRcdGNvbnN0IHVucmVsYXRlZElkZW50aWZpZXIgPSBgb3RoZXIvJHttb2RlbElkfWA7XG5cdFx0Y29uc3QgdGFyZ2V0SWRlbnRpZmllciA9IGBhZ2VudC1ob3N0LWNvcGlsb3RjbGk6JHttb2RlbElkfWA7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbElkcyA9IFtsb2dpY2FsSWRlbnRpZmllciwgdW5yZWxhdGVkSWRlbnRpZmllcl07XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFtsb2dpY2FsSWRlbnRpZmllciwgeyAuLi5jcmVhdGVUZXN0TGFuZ3VhZ2VNb2RlbChtb2RlbElkKSwgdmVuZG9yOiAnY29waWxvdGNsaScsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknIH1dLFxuXHRcdFx0W3VucmVsYXRlZElkZW50aWZpZXIsIHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwobW9kZWxJZCksIHZlbmRvcjogJ290aGVyJywgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnb3RoZXInIH1dLFxuXHRcdFx0W3RhcmdldElkZW50aWZpZXIsIHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwobW9kZWxJZCksIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfV0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdGxhbmd1YWdlTW9kZWxJZHMsXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBpZCA9PiBsYW5ndWFnZU1vZGVscy5nZXQoaWQpLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbW9kZWwtYWxpYXMnLCB7IHRpdGxlOiAnTW9kZWwgQWxpYXMgU2Vzc2lvbicgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzZXNzaW9uID0+IHNlc3Npb24udGl0bGUuZ2V0KCkgPT09ICdNb2RlbCBBbGlhcyBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCBsb2dpY2FsSWRlbnRpZmllcikuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjtcblx0XHRjb25zdCB1bnJlbGF0ZWQgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgdW5yZWxhdGVkSWRlbnRpZmllcikuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjtcblx0XHRsYW5ndWFnZU1vZGVsSWRzLnB1c2godGFyZ2V0SWRlbnRpZmllcik7XG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGxvZ2ljYWxJZGVudGlmaWVyKS5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nLFxuXHRcdFx0dW5yZWxhdGVkLFxuXHRcdFx0YXZhaWxhYmxlOiBhdmFpbGFibGUua2luZCA9PT0gJ2F2YWlsYWJsZScgPyB7IGtpbmQ6IGF2YWlsYWJsZS5raW5kLCBpZGVudGlmaWVyOiBhdmFpbGFibGUubW9kZWwuaWRlbnRpZmllciB9IDogYXZhaWxhYmxlLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmc6IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiB0YXJnZXRJZGVudGlmaWVyIH0sXG5cdFx0XHR1bnJlbGF0ZWQ6IHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWRlbnRpZmllcjogdW5yZWxhdGVkSWRlbnRpZmllciB9LFxuXHRcdFx0YXZhaWxhYmxlOiB7IGtpbmQ6ICdhdmFpbGFibGUnLCBpZGVudGlmaWVyOiB0YXJnZXRJZGVudGlmaWVyIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldE1vZGVsIHVwZGF0ZXMgZXhpc3Rpbmcgc2Vzc2lvbiBtb2RlbCBhbmQgbGV0cyBkcmFmdCBkZWJvdW5jZSBwZXJzaXN0IGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdzZXQtbW9kZWwnLCB7IHRpdGxlOiAnU2V0IE1vZGVsIFNlc3Npb24nIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTZXQgTW9kZWwgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24hLnNlc3Npb25JZCwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpuZXctbW9kZWwnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlbElkLmdldCgpLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOm5ldy1tb2RlbCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldE1vZGVsIHVwZGF0ZXMgY2FjaGVkIHNlbGVjdGlvbiBmb3IgbGF0ZXIgbWVzc2FnZS1sZXZlbCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3NldC1tb2RlbC1jb25maWcnLCB7IHRpdGxlOiAnU2V0IE1vZGVsIENvbmZpZyBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2V0IE1vZGVsIENvbmZpZyBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbiEuc2Vzc2lvbklkLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmNvbmZpZ3VyZWQtbW9kZWwnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlbElkLmdldCgpLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmNvbmZpZ3VyZWQtbW9kZWwnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRBZ2VudCB1cGRhdGVzIGV4aXN0aW5nIHNlc3Npb24gYWdlbnQgYW5kIGxldHMgZHJhZnQgZGVib3VuY2UgcGVyc2lzdCBpdCcsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnc2V0LWFnZW50JywgeyB0aXRsZTogJ1NldCBBZ2VudCBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2V0IEFnZW50IFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3JldmlldycsIG5hbWU6ICdyZXZpZXcnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlLmdldCgpLCB7IGlkOiAnYWdlbnQ6Ly9yZXZpZXcnLCBraW5kOiAnYWdlbnQnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldEFnZW50IHdpdGggdW5kZWZpbmVkIGNsZWFycyB0aGUgY2FjaGVkIGFnZW50IHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xlYXItYWdlbnQnLCB7IHRpdGxlOiAnQ2xlYXIgQWdlbnQgU2Vzc2lvbicgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0NsZWFyIEFnZW50IFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3JldmlldycsIG5hbWU6ICdyZXZpZXcnIH0pO1xuXHRcdHByb3ZpZGVyLnNldEFnZW50Py4oc2Vzc2lvbiEuc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24hLm1vZGUuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdGhlIHNlbGVjdGVkIGFnZW50IGZyb20gdGhlIGRlZmF1bHQgY2hhdCBkcmFmdCBvbiByZXN1bWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3Jlc3VtZS1hZ2VudCcsIHsgdGl0bGU6ICdSZXN1bWUgQWdlbnQgU2Vzc2lvbicgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1Jlc3VtZSBBZ2VudCBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlLmdldCgpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gYGdldFNlc3Npb25Db25maWdgIG9wZW5zIHRoZSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiwgd2hpY2ggYWxzbyBvcGVuc1xuXHRcdC8vIHRoZSBkZWZhdWx0IGNoYXQgc3Vic2NyaXB0aW9uIHVzZWQgdG8gcmVhZCB0aGUgcGVyc2lzdGVkIGRyYWZ0IGFnZW50LlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Jlc3VtZS1hZ2VudCcpKTtcblx0XHRhZ2VudEhvc3Quc2V0Q2hhdFN0YXRlKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRyZXNvdXJjZTogZGVmYXVsdENoYXRVcmksXG5cdFx0XHR0aXRsZTogJ1Jlc3VtZSBBZ2VudCBTZXNzaW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0dHVybnM6IFtdLFxuXHRcdFx0ZHJhZnQ6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGFnZW50OiB7IHVyaTogJ2FnZW50Oi8vcmVzdW1lZCcgfSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlLmdldCgpLCB7IGlkOiAnYWdlbnQ6Ly9yZXN1bWVkJywga2luZDogJ2FnZW50JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgb3ZlcnJpZGUgYSBsaXZlIGFnZW50IHNlbGVjdGlvbiB3aXRoIHRoZSBwZXJzaXN0ZWQgZHJhZnQgYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3Jlc3VtZS1ub292ZXJyaWRlJywgeyB0aXRsZTogJ1Jlc3VtZSBObyBPdmVycmlkZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1Jlc3VtZSBObyBPdmVycmlkZScpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdC8vIEEgbGl2ZSBwaWNrIHdpbnM7IGEgbGF0ZXIgZHJhZnQgc25hcHNob3QgbXVzdCBub3QgY2xvYmJlciBpdC5cblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL2xpdmUnLCBuYW1lOiAnbGl2ZScgfSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncmVzdW1lLW5vb3ZlcnJpZGUnKSk7XG5cdFx0YWdlbnRIb3N0LnNldENoYXRTdGF0ZShkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0cmVzb3VyY2U6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0dGl0bGU6ICdSZXN1bWUgTm8gT3ZlcnJpZGUnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR0dXJuczogW10sXG5cdFx0XHRkcmFmdDogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgYWdlbnQ6IHsgdXJpOiAnYWdlbnQ6Ly9yZXN1bWVkJyB9IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24hLm1vZGUuZ2V0KCksIHsgaWQ6ICdhZ2VudDovL2xpdmUnLCBraW5kOiAnYWdlbnQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWJhc2VzIHRoZSBzZWxlY3RlZCBhZ2VudCB0byBpdHMgd29ya3RyZWUgdHdpbiBmcm9tIHRoZSBhZ2VudCBsaXN0IGJlZm9yZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgZmxpcHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3JlYmFzZS13b3JrdHJlZScsIHsgdGl0bGU6ICdSZWJhc2UgV29ya3RyZWUnLCB3b3JraW5nRGlyZWN0b3J5OiAnZmlsZTovLy9Vc2Vycy9tZS92c2NvZGUnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZWJhc2UgV29ya3RyZWUnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBBIGZvbGRlciBhZ2VudCBpcyBwaWNrZWQgd2hpbGUgdGhlIHNlc3Npb24gc3RpbGwgcnVucyBpbiB0aGUgcmVwby5cblx0XHRjb25zdCBmb2xkZXJBZ2VudCA9ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS8uZ2l0aHViL2FnZW50cy9zZXNzaW9ucy5tZCc7XG5cdFx0Y29uc3Qgd29ya3RyZWVBZ2VudCA9ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS53b3JrdHJlZXMvcmViYXNlLXdvcmt0cmVlLy5naXRodWIvYWdlbnRzL3Nlc3Npb25zLm1kJztcblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6IGZvbGRlckFnZW50LCBuYW1lOiAnc2Vzc2lvbnMnIH0pO1xuXG5cdFx0Ly8gVGhlIGhvc3QgcmVwb3J0cyB0aGUgd29ya3RyZWUtcGF0aGVkIGFnZW50cyAodGhlIGZvbGRlciB0d2luIGlzIGdvbmUpXG5cdFx0Ly8gd2VsbCBiZWZvcmUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGZsaXBzIHRvIHRoZSB3b3JrdHJlZS4gVGhlIHJlYmFzZVxuXHRcdC8vIG11c3QgZGVyaXZlIHRoZSB3b3JrdHJlZSByb290IGZyb20gdGhlIGFnZW50IGxpc3QsIG5vdCB0aGUgKHN0aWxsXG5cdFx0Ly8gZm9sZGVyKSB3b3JraW5nIGRpcmVjdG9yeSwgc28gdGhlIHNlbGVjdGlvbiBpcyByZS1wb2ludGVkIGluIHRpbWUuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3JlYmFzZS13b3JrdHJlZScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnUmViYXNlIFdvcmt0cmVlJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8vd29ya3RyZWUnLFxuXHRcdFx0XHR1cmk6ICdwbHVnaW46Ly93b3JrdHJlZScsXG5cdFx0XHRcdG5hbWU6ICd3b3JrdHJlZSBwbHVnaW4nLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiB3b3JrdHJlZUFnZW50LCB1cmk6IHdvcmt0cmVlQWdlbnQsIG5hbWU6ICdzZXNzaW9ucycgfV0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbiEubW9kZS5nZXQoKSwgeyBpZDogd29ya3RyZWVBZ2VudCwga2luZDogJ2FnZW50JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHRoZSBzZWxlY3RlZCBhZ2VudCB1bnRvdWNoZWQgd2hlbiB0aGUgYWdlbnQgbGlzdCBoYXMgbm8gcmVsb2NhdGVkIHR3aW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3JlYmFzZS1ub25lJywgeyB0aXRsZTogJ1JlYmFzZSBOb25lJywgd29ya2luZ0RpcmVjdG9yeTogJ2ZpbGU6Ly8vVXNlcnMvbWUvdnNjb2RlJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUmViYXNlIE5vbmUnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBmb2xkZXJBZ2VudCA9ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS8uZ2l0aHViL2FnZW50cy9zZXNzaW9ucy5tZCc7XG5cdFx0cHJvdmlkZXIuc2V0QWdlbnQ/LihzZXNzaW9uIS5zZXNzaW9uSWQsIHsgdXJpOiBmb2xkZXJBZ2VudCwgbmFtZTogJ3Nlc3Npb25zJyB9KTtcblxuXHRcdC8vIEFuIHVucmVsYXRlZCBhZ2VudCAoZGlmZmVyZW50IHJlcG8tcmVsYXRpdmUgZmlsZSkgbXVzdCBub3QgYmUgdHJlYXRlZFxuXHRcdC8vIGFzIGEgcmVsb2NhdGlvbiBvZiB0aGUgc2VsZWN0aW9uLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdyZWJhc2Utbm9uZScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnUmViYXNlIE5vbmUnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly9vdGhlcicsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL290aGVyJyxcblx0XHRcdFx0bmFtZTogJ290aGVyIHBsdWdpbicsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS53b3JrdHJlZXMvcmViYXNlLW5vbmUvLmdpdGh1Yi9hZ2VudHMvb3RoZXIubWQnLCB1cmk6ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS53b3JrdHJlZXMvcmViYXNlLW5vbmUvLmdpdGh1Yi9hZ2VudHMvb3RoZXIubWQnLCBuYW1lOiAnb3RoZXInIH1dLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24hLm1vZGUuZ2V0KCksIHsgaWQ6IGZvbGRlckFnZW50LCBraW5kOiAnYWdlbnQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIHRoZSBwaWNrZWQgY3VzdG9tIGFnZW50IG9udG8gdGhlIGNvbW1pdHRlZCBzZXNzaW9uIHdoZW4gYSBuZXcgc2Vzc2lvbiBncmFkdWF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUGFydCAxIHJlZ3Jlc3Npb246IHdoZW4gYSBuZXcgKHVudGl0bGVkKSBzZXNzaW9uIGdyYWR1YXRlcyBpbnRvIGEgcmVhbFxuXHRcdC8vIHJ1bm5pbmcgc2Vzc2lvbiBvbiBmaXJzdCBzZW5kLCB0aGUgcGlja2VkIGFnZW50IG11c3QgdHJhdmVsIG9udG8gdGhlXG5cdFx0Ly8gY29tbWl0dGVkIHNlc3Npb24ncyBgbW9kZWAuIE90aGVyd2lzZSB0aGUgcGlja2VyIFx1MjAxNCB3aGljaCBtaXJyb3JzXG5cdFx0Ly8gYHNlc3Npb24ubW9kZWAgXHUyMDE0IHJlc2V0cyB0byB0aGUgZGVmYXVsdCB0aGUgbW9tZW50IHRoZSBhY3RpdmUgc2Vzc2lvbiBpc1xuXHRcdC8vIHN3YXBwZWQgZm9yIHRoZSBmcmVzaGx5IGNvbW1pdHRlZCBvbmUuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiB7XG5cdFx0XHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2dyYWR1YXRlZCcsIHsgc3VtbWFyeTogJ0dyYWR1YXRlZCBTZXNzaW9uJyB9KSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0cHJvdmlkZXIuc2V0QWdlbnQ/LihzZXNzaW9uLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3BpY2tlZCcsIG5hbWU6ICdwaWNrZWQnIH0pO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnaGVsbG8nIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21taXR0ZWQubW9kZS5nZXQoKSwgeyBpZDogJ2FnZW50Oi8vcGlja2VkJywga2luZDogJ2FnZW50JyB9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBnZXRDdXN0b21BZ2VudHMgLyBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyAtLS0tLS0tXG5cblx0dGVzdCgnZ2V0Q3VzdG9tQWdlbnRzIGNvbGxlY3RzIGFnZW50cyBmcm9tIHNlc3Npb24gY3VzdG9taXphdGlvbnMsIGNvYWxlc2NlZCBieSBVUkkgYW5kIHNvcnRlZCBieSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2FnZW50cy1tZXJnZScsIHsgdGl0bGU6ICdNZXJnZSBTZXNzaW9uJyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ01lcmdlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBDdXN0b20gYWdlbnRzIGxpdmUgZXhjbHVzaXZlbHkgb24gYFNlc3Npb25DdXN0b21pemF0aW9uLmFnZW50c2Bcblx0XHQvLyAocG9wdWxhdGVkIGJ5IHRoZSBob3N0IGFmdGVyIHBhcnNpbmcgZWFjaCBjdXN0b21pemF0aW9uKS4gVGhlIGhvc3Rcblx0XHQvLyBtZXJnZXMgaG9zdC0vY2xpZW50LS9zZXNzaW9uLWxldmVsIGN1c3RvbWl6YXRpb25zIGludG9cblx0XHQvLyBgc3RhdGUuY3VzdG9taXphdGlvbnNgIGZvciB1cywgc28gdGhlIHBpY2tlciBvbmx5IG5lZWRzIHRvIHJlYWRcblx0XHQvLyBmcm9tIHRoZXJlLiBBIGR1cGxpY2F0ZSBgdXJpYCBhY3Jvc3MgY3VzdG9taXphdGlvbnMgaXMgY29hbGVzY2VkXG5cdFx0Ly8gKGZpcnN0IHNlZW4gd2lucykuXG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdNZXJnZSBTZXNzaW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8vc2Vzc2lvbi0xJyxcblx0XHRcdFx0dXJpOiAncGx1Z2luOi8vc2Vzc2lvbi0xJyxcblx0XHRcdFx0bmFtZTogJ3Nlc3Npb24gcGx1Z2luJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vc2hhcmVkJywgdXJpOiAnYWdlbnQ6Ly9zaGFyZWQnLCBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIHNlc3Npb24nIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3Nlc3Npb24tb25seScsIHVyaTogJ2FnZW50Oi8vc2Vzc2lvbi1vbmx5JywgbmFtZTogJ3Nlc3Npb24tb25seScgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRpZDogJ3BsdWdpbjovL3Nlc3Npb24tMicsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL3Nlc3Npb24tMicsXG5cdFx0XHRcdG5hbWU6ICdzZWNvbmQgc2Vzc2lvbiBwbHVnaW4nLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9hbm90aGVyJywgdXJpOiAnYWdlbnQ6Ly9hbm90aGVyJywgbmFtZTogJ2Fub3RoZXInIH0sXG5cdFx0XHRcdFx0Ly8gRHVwbGljYXRlIFVSSSBcdTIwMTQgbXVzdCBOT1QgcmVwbGFjZSB0aGUgZmlyc3Qtc2VlbiBlbnRyeS5cblx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vc2hhcmVkLWR1cCcsIHVyaTogJ2FnZW50Oi8vc2hhcmVkJywgbmFtZTogJ3NoYXJlZCAoZHVwbGljYXRlKScgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Ly8gRGlzYWJsZWQgY3VzdG9taXphdGlvbnMgYXJlIHNraXBwZWQgZW50aXJlbHkuXG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly9kaXNhYmxlZCcsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL2Rpc2FibGVkJyxcblx0XHRcdFx0bmFtZTogJ2Rpc2FibGVkIHBsdWdpbicsXG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9kaXNhYmxlZCcsIHVyaTogJ2FnZW50Oi8vZGlzYWJsZWQnLCBuYW1lOiAnZGlzYWJsZWQnIH1dLFxuXHRcdFx0fSwge1xuXHRcdFx0XHQvLyBDdXN0b21pemF0aW9ucyB3aXRoIGBjaGlsZHJlbiA9PT0gdW5kZWZpbmVkYCBhcmUgdHJlYXRlZCBhc1xuXHRcdFx0XHQvLyBcInVua25vd25cIiAoaG9zdCBub3QgeWV0IGZpbmlzaGVkIHBhcnNpbmcpIGFuZCBza2lwcGVkLlxuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8vdW5wYXJzZWQnLFxuXHRcdFx0XHR1cmk6ICdwbHVnaW46Ly91bnBhcnNlZCcsXG5cdFx0XHRcdG5hbWU6ICd1bnBhcnNlZCBwbHVnaW4nLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRpbmcgfSxcblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0Ly8gRm9yY2UgYSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBzbyBgX2xhc3RTZXNzaW9uU3RhdGVzYCBnZXRzXG5cdFx0Ly8gcG9wdWxhdGVkIHdoZW4gd2UgcHVzaCB0aGUgZmFrZSBzdGF0ZSBiZWxvdy4gYGdldFNlc3Npb25Db25maWdgXG5cdFx0Ly8gaXMgdGhlIHB1YmxpYyBob29rIHRoYXQgY2FsbHMgYF9rZWVwU2Vzc2lvblN0YXRlQWxpdmVgLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdhZ2VudHMtbWVyZ2UnLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEN1c3RvbUFnZW50cyhzZXNzaW9uIS5zZXNzaW9uSWQpLCBbXG5cdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vYW5vdGhlcicsIHVyaTogJ2FnZW50Oi8vYW5vdGhlcicsIG5hbWU6ICdhbm90aGVyJyB9LFxuXHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3Nlc3Npb24tb25seScsIHVyaTogJ2FnZW50Oi8vc2Vzc2lvbi1vbmx5JywgbmFtZTogJ3Nlc3Npb24tb25seScgfSxcblx0XHRcdC8vIEZpcnN0LXNlZW4gd2lucyBmb3IgdGhlIGR1cGxpY2F0ZSBgYWdlbnQ6Ly9zaGFyZWRgIFVSSS5cblx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9zaGFyZWQnLCB1cmk6ICdhZ2VudDovL3NoYXJlZCcsIG5hbWU6ICdzaGFyZWQnLCBkZXNjcmlwdGlvbjogJ2Zyb20gc2Vzc2lvbicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TWNwU2VydmVycyBkaXNwYXRjaGVzIE1DUCBsaWZlY3ljbGUgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbWNwLWxpZmVjeWNsZScsIHsgdGl0bGU6ICdNQ1AgTGlmZWN5Y2xlJyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ01DUCBMaWZlY3ljbGUnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ01DUCBMaWZlY3ljbGUnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQ6ICdtY3A6Ly9kb2NzJyxcblx0XHRcdFx0dXJpOiAnbWNwOi8vZG9jcycsXG5cdFx0XHRcdG5hbWU6ICdEb2NzJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQgfSxcblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ21jcC1saWZlY3ljbGUnLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cblx0XHRjb25zdCBzZXJ2ZXJzID0gcHJvdmlkZXIuZ2V0TWNwU2VydmVycyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgc2VydmVyc1swXS5zdGFydCgpO1xuXHRcdGF3YWl0IHNlcnZlcnNbMF0uc3RvcCgpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5zbGljZSgtMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcCgoeyBhY3Rpb24gfSkgPT4gYWN0aW9uLnR5cGUpLCBbXG5cdFx0XHRBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGFydFJlcXVlc3RlZCxcblx0XHRcdEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0b3BSZXF1ZXN0ZWQsXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcCgoeyBhY3Rpb24gfSkgPT4gKGFjdGlvbiBhcyB7IGlkOiBzdHJpbmcgfSkuaWQpLCBbJ21jcDovL2RvY3MnLCAnbWNwOi8vZG9jcyddKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QmFja2VuZENoYXRSZXNvdXJjZSBsb29rcyB1cCB0aGUgaG9zdC1zdXBwbGllZCBiYWNrZW5kIGNoYXQgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NoYXQtbG9va3VwJywgeyB0aXRsZTogJ0NoYXQgTG9va3VwJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ25vLXN0YXRlJywgeyB0aXRsZTogJ05vIFN0YXRlJyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0NoYXQgTG9va3VwJyk7XG5cdFx0Y29uc3QgdW5oeWRyYXRlZCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdObyBTdGF0ZScpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQub2sodW5oeWRyYXRlZCk7XG5cblx0XHQvLyBUaGUgYmFja2VuZCBjaGF0IFVSSXMgYXJlIGhvc3Qtc3VwcGxpZWQgYW5kIGluZGVwZW5kZW50IG9mIHRoZSBjbGllbnRcblx0XHQvLyByZXNvdXJjZXM7IHRoZSBsb29rdXAgcmV0dXJucyB0aGVtIHZlcmJhdGltIHJhdGhlciB0aGFuIGNvbnN0cnVjdGluZyB0aGVtLlxuXHRcdC8vIE9uIHRoZSB3aXJlIHRoZXkgYXJlIHN0cmluZ3MuXG5cdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2JhY2tlbmQtYWJjJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBkZWZhdWx0QmFja2VuZCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pO1xuXHRcdGNvbnN0IHBlZXJCYWNrZW5kID0gYnVpbGRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLCAncGVlci0xJyk7XG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdDaGF0IExvb2t1cCcsXG5cdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW1xuXHRcdFx0XHR7IHJlc291cmNlOiBkZWZhdWx0QmFja2VuZCwgdGl0bGU6ICdEZWZhdWx0Jywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSwgbW9kaWZpZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicgfSBzYXRpc2ZpZXMgQ2hhdFN1bW1hcnksXG5cdFx0XHRcdHsgcmVzb3VyY2U6IHBlZXJCYWNrZW5kLCB0aXRsZTogJ1BlZXInLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyB9IHNhdGlzZmllcyBDaGF0U3VtbWFyeSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0Q2hhdDogZGVmYXVsdEJhY2tlbmQsXG5cdFx0fTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdjaGF0LWxvb2t1cCcsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Ly8gRGVmYXVsdCBjaGF0IChjbGllbnQgcmVzb3VyY2UgaGFzIG5vIGZyYWdtZW50KSByZXNvbHZlcyB2aWEgYGRlZmF1bHRDaGF0YC5cblx0XHRcdGRlZmF1bHRDaGF0OiBwcm92aWRlci5nZXRCYWNrZW5kQ2hhdFJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpPy50b1N0cmluZygpLFxuXHRcdFx0Ly8gUGVlciBjaGF0IChjbGllbnQgZnJhZ21lbnQpIHJlc29sdmVzIHZpYSBpdHMgYENoYXRTdW1tYXJ5LnJlc291cmNlYC5cblx0XHRcdHBlZXJDaGF0OiBwcm92aWRlci5nZXRCYWNrZW5kQ2hhdFJlc291cmNlKHNlc3Npb24ucmVzb3VyY2Uud2l0aCh7IGZyYWdtZW50OiAncGVlci0xJyB9KSk/LnRvU3RyaW5nKCksXG5cdFx0XHQvLyBBIHBlZXIgY2hhdCBhYnNlbnQgZnJvbSBoeWRyYXRlZCBzdGF0ZSBoYXMgbm8gYmFja2VuZCBVUkkuXG5cdFx0XHRtaXNzaW5nUGVlcjogcHJvdmlkZXIuZ2V0QmFja2VuZENoYXRSZXNvdXJjZShzZXNzaW9uLnJlc291cmNlLndpdGgoeyBmcmFnbWVudDogJ2dob3N0JyB9KSk/LnRvU3RyaW5nKCksXG5cdFx0XHQvLyBBIHNlc3Npb24gd2hvc2Ugc3RhdGUgaGFzIG5vdCBoeWRyYXRlZCB5aWVsZHMgbm90aGluZy5cblx0XHRcdG5vdEh5ZHJhdGVkOiBwcm92aWRlci5nZXRCYWNrZW5kQ2hhdFJlc291cmNlKHVuaHlkcmF0ZWQucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdGRlZmF1bHRDaGF0OiBVUkkucGFyc2UoZGVmYXVsdEJhY2tlbmQpLnRvU3RyaW5nKCksXG5cdFx0XHRwZWVyQ2hhdDogVVJJLnBhcnNlKHBlZXJCYWNrZW5kKS50b1N0cmluZygpLFxuXHRcdFx0bWlzc2luZ1BlZXI6IHVuZGVmaW5lZCxcblx0XHRcdG5vdEh5ZHJhdGVkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEN1c3RvbUFnZW50cyByZXR1cm5zIG5vIGFnZW50cyB3aGVuIHRoZSBzZXNzaW9uIGhhcyBubyBTZXNzaW9uU3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblxuXHRcdC8vIFJvb3QtbGV2ZWwgY3VzdG9taXphdGlvbnMgb24gYEFnZW50SW5mb2Agbm8gbG9uZ2VyIGNvbnRyaWJ1dGVcblx0XHQvLyBhZ2VudHMgZGlyZWN0bHkgdG8gdGhlIHBpY2tlciBcdTIwMTQgb25seSBgU2Vzc2lvbkN1c3RvbWl6YXRpb24uYWdlbnRzYFxuXHRcdC8vIGRvZXMgXHUyMDE0IHNvIGEgc2Vzc2lvbiB3aXRob3V0IGEgYFNlc3Npb25TdGF0ZWAgcmVzb2x2ZXMgdG8gZW1wdHkuXG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHR7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0bW9kZWxzOiBbXSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRcdGlkOiAncGx1Z2luOi8vcm9vdCcsXG5cdFx0XHRcdFx0dXJpOiAncGx1Z2luOi8vcm9vdCcsXG5cdFx0XHRcdFx0bmFtZTogJ3Jvb3QgcGx1Z2luJyxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdyb290LW9ubHknLCB7IHRpdGxlOiAnUm9vdCBPbmx5JyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1Jvb3QgT25seScpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3VzdG9tQWdlbnRzKHNlc3Npb24hLnNlc3Npb25JZCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgZmlyZXMgb24gcm9vdCBzdGF0ZSBhbmQgc2Vzc2lvbiBzdGF0ZSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdjdXN0LWV2ZW50cycsIHsgdGl0bGU6ICdDdXN0IEV2ZW50cycgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdDdXN0IEV2ZW50cycpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKCgpID0+IHsgZmlyZWQrKzsgfSkpO1xuXG5cdFx0Ly8gQSByb290IHN0YXRlIGNoYW5nZSB0aGF0IHJlcGxhY2VzIHRoZSBhZ2VudHMgcmVmZXJlbmNlIHNob3VsZFxuXHRcdC8vIGZpcmUgdGhlIGV2ZW50LiBUaGlzIGlzIHRoZSBvbmx5IHBhdGggdGhhdCBtdXRhdGVzIGFnZW50cyBpbiB0aGVcblx0XHQvLyByZWFsIHJlZHVjZXIgKGBSb290QWdlbnRzQ2hhbmdlZGApLlxuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWZ0ZXJSb290ID0gZmlyZWQ7XG5cdFx0YXNzZXJ0Lm9rKGFmdGVyUm9vdCA+IDAsICdleHBlY3RlZCBldmVudCB0byBmaXJlIHdoZW4gdGhlIGFnZW50cyByZWZlcmVuY2UgaXMgcmVwbGFjZWQnKTtcblxuXHRcdC8vIEEgc3Vic2VxdWVudCByb290IHN0YXRlIGNoYW5nZSB0aGF0IHByZXNlcnZlcyB0aGUgYWdlbnRzIHJlZmVyZW5jZVxuXHRcdC8vIChlLmcuIGBhY3RpdmVTZXNzaW9uc0NoYW5nZWRgIG9uIGV2ZXJ5IHR1cm4gc3RhcnQvY29tcGxldGUpIG11c3Rcblx0XHQvLyBOT1QgZmlyZSBcdTIwMTQgZmlyaW5nIG9uIHRob3NlIGNhdXNlZCBjaGF0IHNlc3Npb24gYnViYmxlcyB0byBiZVxuXHRcdC8vIHJlLWh5ZHJhdGVkIG1pZC10dXJuLCBkcm9wcGluZyBzdHJlYW1lZCByZXNwb25zZXMuXG5cdFx0YWdlbnRIb3N0LmZpcmVOb25BZ2VudFJvb3RTdGF0ZUNoYW5nZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgYWZ0ZXJSb290LCAnZXhwZWN0ZWQgZXZlbnQgTk9UIHRvIGZpcmUgb24gbm9uLWFnZW50IHJvb3QgZGVsdGFzIChwcmVzZXJ2ZWQgYWdlbnRzIHJlZmVyZW5jZSknKTtcblxuXHRcdC8vIFNlc3Npb24tc3RhdGUgdXBkYXRlIHdpdGggbmV3IGN1c3RvbWl6YXRpb25zIHNob3VsZCBmaXJlIGl0IGFnYWluLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdjdXN0LWV2ZW50cycsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnQ3VzdCBFdmVudHMnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly9zJyxcblx0XHRcdFx0dXJpOiAncGx1Z2luOi8vcycsXG5cdFx0XHRcdG5hbWU6ICdzZXNzaW9uIHBsdWdpbicsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3MnLCB1cmk6ICdhZ2VudDovL3MnLCBuYW1lOiAncycgfV0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRhc3NlcnQub2soZmlyZWQgPiBhZnRlclJvb3QsICdleHBlY3RlZCBldmVudCB0byBmaXJlIG9uIHNlc3Npb24gc3RhdGUgY3VzdG9taXphdGlvbiBjaGFuZ2UnKTtcblxuXHRcdC8vIEEgc2Vjb25kIHN0YXRlIHVwZGF0ZSB3aXRoIHRoZSBTQU1FIGN1c3RvbWl6YXRpb25zIHJlZmVyZW5jZSBtdXN0XG5cdFx0Ly8gTk9UIGZpcmUgXHUyMDE0IG9ubHkgY2h1cm4gaW4gYGN1c3RvbWl6YXRpb25zYCAvIGBhY3RpdmVDbGllbnRzW10uY3VzdG9taXphdGlvbnNgXG5cdFx0Ly8gY291bnRzLlxuXHRcdGNvbnN0IGFmdGVyRmlyc3RDdXN0b21pemF0aW9uID0gZmlyZWQ7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnY3VzdC1ldmVudHMnLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ0N1c3QgRXZlbnRzIFVwZGF0ZWQnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Ly8gU2FtZSBpZGVudGl0eSBhcyBiZWZvcmU6XG5cdFx0XHRjdXN0b21pemF0aW9uczogKHByb3ZpZGVyIGFzIHVua25vd24gYXMgeyBfbGFzdFNlc3Npb25TdGF0ZXM6IE1hcDxzdHJpbmcsIFNlc3Npb25TdGF0ZT4gfSkuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uIS5zZXNzaW9uSWQpPy5jdXN0b21pemF0aW9ucyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIGFmdGVyRmlyc3RDdXN0b21pemF0aW9uLCAnZXhwZWN0ZWQgZXZlbnQgTk9UIHRvIGZpcmUgd2hlbiBjdXN0b21pemF0aW9ucyBhcmUgdW5jaGFuZ2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ05ld1Nlc3Npb24gZm9yd2FyZHMgU2Vzc2lvblN0YXRlIGludG8gX2xhc3RTZXNzaW9uU3RhdGVzIHNvIHRoZSBwaWNrZXIgc2VlcyBjdXN0b21pemF0aW9ucyBiZWZvcmUgZmlyc3QgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGxldCBlYWdlckNyZWF0ZSBjb21wbGV0ZSBhbmQgdGhlIHN1YnNjcmlwdGlvbiBzZWVkXG5cblx0XHRjb25zdCByYXdJZCA9IHNlc3Npb24ucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSk7XG5cblx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUN1c3RvbUFnZW50cygoKSA9PiB7IGZpcmVkKys7IH0pKTtcblxuXHRcdC8vIFB1c2ggYSBTZXNzaW9uU3RhdGUgY2FycnlpbmcgY3VzdG9taXphdGlvbnMgYXMgaWYgdGhlIGhvc3QgaGFkXG5cdFx0Ly8gcmVzb2x2ZWQgdGhlbSBhbmQgZGlzcGF0Y2hlZCBhIFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnM6IEN1c3RvbWl6YXRpb25bXSA9IFt7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRpZDogJ3BsdWdpbjovL25ldy1zZXNzaW9uJyxcblx0XHRcdHVyaTogJ3BsdWdpbjovL25ldy1zZXNzaW9uJyxcblx0XHRcdG5hbWU6ICdwJyxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3Jldmlld2VyJywgdXJpOiAnYWdlbnQ6Ly9yZXZpZXdlcicsIG5hbWU6ICdyZXZpZXdlcicgfSxcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3RyaWFnZScsIHVyaTogJ2FnZW50Oi8vdHJpYWdlJywgbmFtZTogJ3RyaWFnZScgfSxcblx0XHRcdF0sXG5cdFx0fV07XG5cdFx0Y29uc3Qgc3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiBzZXNzaW9uVHlwZUlkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnMsXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKHJhd0lkLCBzZXNzaW9uVHlwZUlkLCBzdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEN1c3RvbUFnZW50cyhzZXNzaW9uLnNlc3Npb25JZCksIFtcblx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9yZXZpZXdlcicsIHVyaTogJ2FnZW50Oi8vcmV2aWV3ZXInLCBuYW1lOiAncmV2aWV3ZXInIH0sXG5cdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vdHJpYWdlJywgdXJpOiAnYWdlbnQ6Ly90cmlhZ2UnLCBuYW1lOiAndHJpYWdlJyB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhmaXJlZCA+IDAsICdleHBlY3RlZCBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyB0byBmaXJlIHdoZW4gU2Vzc2lvblN0YXRlIGFycml2ZXMnKTtcblxuXHRcdC8vIEEgc2Vjb25kIHVwZGF0ZSB3aXRoIGEgZGlmZmVyZW50IGN1c3RvbWl6YXRpb25zIGlkZW50aXR5IHNob3VsZFxuXHRcdC8vIHJlLWZpcmUgYW5kIHVwZGF0ZSB0aGUgcGlja2VyLlxuXHRcdGNvbnN0IGFmdGVyID0gZmlyZWQ7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZShyYXdJZCwgc2Vzc2lvblR5cGVJZCwge1xuXHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRjdXN0b21pemF0aW9uczogW3tcblx0XHRcdFx0Li4uKGN1c3RvbWl6YXRpb25zWzBdIGFzIEV4dHJhY3Q8Q3VzdG9taXphdGlvbiwgeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4gfT4pLFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9vbmx5JywgdXJpOiAnYWdlbnQ6Ly9vbmx5JywgbmFtZTogJ29ubHknIH1dLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRDdXN0b21BZ2VudHMoc2Vzc2lvbi5zZXNzaW9uSWQpLCBbXG5cdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vb25seScsIHVyaTogJ2FnZW50Oi8vb25seScsIG5hbWU6ICdvbmx5JyB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhmaXJlZCA+IGFmdGVyLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgdG8gZmlyZSBhZ2FpbiBvbiBhIHNlY29uZCB1cGRhdGUnKTtcblx0fSk7XG5cblx0dGVzdCgnTmV3U2Vzc2lvbiByZWxlYXNlcyBvYnNlcnZlZCBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9ucyB3aGVuIGluYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCd0ZXN0LmFjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVJZCA9IHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZDtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2onKSwgc2Vzc2lvblR5cGVJZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBzZXNzaW9uLnJlc291cmNlO1xuXHRcdH0oKSwgdW5kZWZpbmVkKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2VzZXQgb2Ygc2Vzc2lvbi5jaGFuZ2VzZXRzPy5yZWFkKHJlYWRlcikgPz8gW10pIHtcblx0XHRcdFx0Y2hhbmdlc2V0LmNoYW5nZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJhY2tlbmRVcmkgPSBhZ2VudEhvc3QuY3JlYXRlZFNlc3Npb25VcmlzLmF0KC0xKSE7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7YmFja2VuZFVyaX0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKEFnZW50U2Vzc2lvbi5pZChiYWNrZW5kVXJpKSwgc2Vzc2lvblR5cGVJZCwge1xuXHRcdFx0cHJvdmlkZXI6IHNlc3Npb25UeXBlSWQsXG5cdFx0XHR0aXRsZTogJycsXG5cdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRjaGFuZ2VzZXRzOiBbXG5cdFx0XHRcdHsgbGFiZWw6ICdVbmNvbW1pdHRlZCBDaGFuZ2VzJywgdXJpVGVtcGxhdGU6IGNoYW5nZXNldFVyaSwgY2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KGNoYW5nZXNldFVyaSksIDEpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3Quc2Vzc2lvblVuc3Vic2NyaWJlQ291bnRzLmdldChjaGFuZ2VzZXRVcmkpLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnTmV3U2Vzc2lvbiBkaXNwb3NlIGNsZWFycyBfbGFzdFNlc3Npb25TdGF0ZXMgZW50cnkgYW5kIGZpcmVzIG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVJZCA9IHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZDtcblx0XHRjb25zdCBmaXJzdCA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9hJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCByYXdJZCA9IGZpcnN0LnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUocmF3SWQsIHNlc3Npb25UeXBlSWQsIHtcblx0XHRcdHByb3ZpZGVyOiBzZXNzaW9uVHlwZUlkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly94Jyxcblx0XHRcdFx0dXJpOiAncGx1Z2luOi8veCcsXG5cdFx0XHRcdG5hbWU6ICdwJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdFx0Y2hpbGRyZW46IFt7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8veCcsIHVyaTogJ2FnZW50Oi8veCcsIG5hbWU6ICd4JyB9XSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRDdXN0b21BZ2VudHMoZmlyc3Quc2Vzc2lvbklkKS5sZW5ndGgsIDEpO1xuXG5cdFx0bGV0IGZpcmVkID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoKCkgPT4geyBmaXJlZCsrOyB9KSk7XG5cblx0XHQvLyBUcmlnZ2VyIGRpc3Bvc2FsIG9mIHRoZSBmaXJzdCBOZXdTZXNzaW9uIGV4cGxpY2l0bHkuIFByb3ZpZGVycyBub1xuXHRcdC8vIGxvbmdlciBkaXNwb3NlIGRyYWZ0cyBpbXBsaWNpdGx5IHdoZW4gYSBuZXcgb25lIGlzIGNyZWF0ZWQsIHNvIHRoZVxuXHRcdC8vIG1hbmFnZW1lbnQgbGF5ZXIgKG1vZGVsZWQgaGVyZSkgZGlzcG9zZXMgdGhlIGFiYW5kb25lZCBkcmFmdC5cblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYicpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRwcm92aWRlci5kZWxldGVOZXdTZXNzaW9uKGZpcnN0LnNlc3Npb25JZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3VzdG9tQWdlbnRzKGZpcnN0LnNlc3Npb25JZCksIFtdKTtcblx0XHRhc3NlcnQub2soZmlyZWQgPiAwLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgdG8gZmlyZSBvbiBOZXdTZXNzaW9uIGRpc3Bvc2UnKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpZmVjeWNsZSAtLS0tLS0tXG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiByZXR1cm5zIHNlc3Npb24gd2l0aCBjb3JyZWN0IGZpZWxkcycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvbXktcHJvamVjdCcpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZVVyaSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnByb3ZpZGVySWQsIHByb3ZpZGVyLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5zdGF0dXMuZ2V0KCksIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5sYWJlbCwgJ215LXByb2plY3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5zZXNzaW9uVHlwZSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLCB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiB7fSB9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBRdWljayBjaGF0cyAod29ya3NwYWNlLWxlc3Mgc2Vzc2lvbnMpIC0tLS0tLS1cblxuXHR0ZXN0KCdkZWNsYXJlcyBxdWljayBjaGF0IHN1cHBvcnQgZnJvbSB0aGUgaW5pdGlhbCBhZ2VudCBob3N0IHNldHRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWdlbnRIb3N0RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuc3VwcG9ydHNRdWlja0NoYXRzLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZGVjbGFyZSBxdWljayBjaGF0IHN1cHBvcnQgd2hlbiB0aGUgYWdlbnQgaG9zdCBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhZ2VudEhvc3RFbmFibGVkOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuc3VwcG9ydHNRdWlja0NoYXRzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVF1aWNrQ2hhdCByZXR1cm5zIGEgd29ya3NwYWNlLWxlc3MgdW50aXRsZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVRdWlja0NoYXQocHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJJZDogc2Vzc2lvbi5wcm92aWRlcklkLFxuXHRcdFx0c3RhdHVzOiBzZXNzaW9uLnN0YXR1cy5nZXQoKSxcblx0XHRcdHdvcmtzcGFjZTogc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCksXG5cdFx0XHRzZXNzaW9uVHlwZTogc2Vzc2lvbi5zZXNzaW9uVHlwZSxcblx0XHRcdGlzUXVpY2tDaGF0OiBzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRwcm92aWRlcklkOiBwcm92aWRlci5pZCxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCxcblx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCxcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVRdWlja0NoYXQgZWFnZXJseSBjcmVhdGVzIHRoZSBiYWNrZW5kIHNlc3Npb24gd2l0aCBubyB3b3JraW5nIGRpcmVjdG9yeSAoaW5mZXJyZWQgd29ya3NwYWNlLWxlc3MpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlUXVpY2tDaGF0KHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IGVhZ2VyQ3JlYXRlIGNvbXBsZXRlXG5cblx0XHQvLyBUaGUgcHJvdmlkZXIgbm8gbG9uZ2VyIHBhc3NlcyBhbiBleHBsaWNpdCBxdWljay1jaGF0IGZsYWc7IHRoZSBob3N0XG5cdFx0Ly8gaW5mZXJzIHdvcmtzcGFjZS1sZXNzIGZyb20gdGhlIGFic2VudCBgd29ya2luZ0RpcmVjdG9yeWAuXG5cdFx0Y29uc3QgY3JlYXRlZCA9IGFnZW50SG9zdC5jcmVhdGVTZXNzaW9uQ29uZmlncy5hdCgtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQ/LndvcmtpbmdEaXJlY3RvcnksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVF1aWNrQ2hhdCB0aHJvd3Mgd2hlbiBubyBhZ2VudHMgYXJlIGFkdmVydGlzZWQnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHByb3ZpZGVyLmNyZWF0ZVF1aWNrQ2hhdCgnY29waWxvdGNsaScpKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYSBxdWljayBjaGF0IGZyb20gbGlzdFNlc3Npb25zIGFzIHdvcmtzcGFjZS1sZXNzIGRlc3BpdGUgYSBzY3JhdGNoIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gT24gcmVsb2FkIHRoZSBob3N0IHJlLWFkdmVydGlzZXMgdGhlIHF1aWNrIGNoYXQgdGFnZ2VkIHZpYVxuXHRcdC8vIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCwgYnV0IHdpdGggdGhlIHRocm93YXdheSBzY3JhdGNoIGN3ZCBpdCBhc3NpZ25lZC5cblx0XHQvLyBUaGUgcmVzdG9yZWQgc2Vzc2lvbiBtdXN0IHN0YXkgd29ya3NwYWNlLWxlc3Mgc28gaXQgZ3JvdXBzIHVuZGVyXG5cdFx0Ly8gXCJRdWljayBDaGF0c1wiIGFuZCBza2lwcyB3b3Jrc3BhY2UgdHJ1c3QuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncXVpY2stMScsIHtcblx0XHRcdHN1bW1hcnk6ICdRdWljayBDaGF0Jyxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvdG1wL2NvcGlsb3Qtc2NyYXRjaC9xdWljay0xJyksXG5cdFx0XHRxdWlja0NoYXQ6IHRydWUsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiBzZXNzaW9uPy50aXRsZS5nZXQoKSxcblx0XHRcdHdvcmtzcGFjZTogc2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlOiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHR3b3Jrc3BhY2U6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Jlc3RvcmVkIHF1aWNrIGNoYXQgcmVwb3J0cyBzdXBwb3J0c011bHRpcGxlQ2hhdHMgPT09IGZhbHNlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBxdWljayBjaGF0IGlzIGEgc2luZ2xlLWNoYXQgc2Vzc2lvbiByZWdhcmRsZXNzIG9mIHNlc3Npb24gdHlwZTpcblx0XHQvLyB0aGUgYF9tZXRhLndvcmtzcGFjZWxlc3NgIHRhZyBmb3JjZXMgYHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2VgLlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3F1aWNrLTEnLCB7XG5cdFx0XHRzdW1tYXJ5OiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3RtcC9jb3BpbG90LXNjcmF0Y2gvcXVpY2stMScpLFxuXHRcdFx0cXVpY2tDaGF0OiB0cnVlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uPy5jYXBhYmlsaXRpZXMuZ2V0KCksIHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgc3VwcG9ydHNGb3JrOiB0cnVlLCBzdXBwb3J0c1NpZGVDaGF0OiBmYWxzZSwgc3VwcG9ydHNSZW5hbWU6IHRydWUsIHN1cHBvcnRzRGVsZXRlOiB0cnVlIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVzdG9yZWQgcXVpY2sgY2hhdCBjb2xsYXBzZXMgdG8gYSBzaW5nbGUgY2hhdCBldmVuIHdoZW4gc3RhdGUgYWR2ZXJ0aXNlcyBwZWVyIGNoYXRzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBxdWljayBjaGF0IGlzIHNpbmdsZS1jaGF0OiBldmVuIGlmIGEgcmVzdG9yZWQgYFNlc3Npb25TdGF0ZWBcblx0XHQvLyBhZHZlcnRpc2VzIHBlZXIgY2hhdHMsIGBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlYCBjb2xsYXBzZXMgdGhlXG5cdFx0Ly8gY2F0YWxvZyB0byB0aGUgZGVmYXVsdCBjaGF0LiBUaGUgc3RhdGUgc3Vic2NyaXB0aW9uJ3MgYF9tZXRhYCAod2hpY2hcblx0XHQvLyB0aGUgaG9zdCBjb3BpZXMgZnJvbSB0aGUgc3VtbWFyeSkgbXVzdCBrZWVwIHRoZSB3b3Jrc3BhY2UtbGVzcyB0YWcuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncXVpY2stbXVsdGknLCB7XG5cdFx0XHRzdW1tYXJ5OiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3RtcC9jb3BpbG90LXNjcmF0Y2gvcXVpY2stbXVsdGknKSxcblx0XHRcdHF1aWNrQ2hhdDogdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdC8vIFN1YnNjcmliZSB0byBzZXNzaW9uIHN0YXRlIHNvIHRoZSByZXN0b3JlZCBzbmFwc2hvdCByZWFjaGVzIHRoZSBhZGFwdGVyLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncXVpY2stbXVsdGknKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdxdWljay1tdWx0aScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRkZWZhdWx0Q2hhdCxcblx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3ModW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdGNoYXRzOiBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlZmF1bHRDaGF0LCB0aXRsZTogJycsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCkgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKSwgdGl0bGU6ICdQZWVyIE9uZScsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCkgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTInKSwgdGl0bGU6ICdQZWVyIFR3bycsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCkgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmtzcGFjZTogc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCksXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyxcblx0XHRcdGNoYXRGcmFnbWVudHM6IHNlc3Npb24uY2hhdHMuZ2V0KCkubWFwKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCksXG5cdFx0XHRjaGF0VGl0bGVzOiBzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdH0sIHtcblx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSxcblx0XHRcdGNoYXRGcmFnbWVudHM6IFsnJ10sXG5cdFx0XHRjaGF0VGl0bGVzOiBbJ1F1aWNrIENoYXQnXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Byb21vdGVzIGFuIHVudGFnZ2VkIHNlc3Npb24gdG8gYSBxdWljayBjaGF0IG9uY2Ugc3RhdGUgcmVwb3J0cyBpdCB3b3Jrc3BhY2UtbGVzcywgYW5kIHBlcnNpc3RzIHRoZSBwcm9tb3Rpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiBhIHNlc3Npb24gd2hvc2UgZmlyc3Qgc2lnaHRpbmcgY2FycmllZCBubyBgX21ldGFgIChhXG5cdFx0Ly8gcGVyc2lzdGVkIGNhY2hlIGVudHJ5IHdyaXR0ZW4gYmVmb3JlIHRoZSB0YWcgd2FzIHBsdW1iZWQgdGhyb3VnaCwgb3IgYVxuXHRcdC8vIGhvc3QgdGhhdCBkcm9wcGVkIGBfbWV0YWAgZnJvbSBpdHMgbGlzdGluZykgaXMgYm9ybiB3b3Jrc3BhY2UtYm91bmQsXG5cdFx0Ly8gc28gdGhlIGhvc3QncyB0aHJvd2F3YXkgc2NyYXRjaCBjd2Qgc3VyZmFjZXMgYXMgYSB3b3Jrc3BhY2UgZm9sZGVyXG5cdFx0Ly8gbmFtZWQgYWZ0ZXIgdGhlIHNlc3Npb24gaWQuIFRoZSBraW5kIG11c3QgaGVhbCBpdHNlbGYgYXMgc29vbiBhcyBhblxuXHRcdC8vIGF1dGhvcml0YXRpdmUgYF9tZXRhLndvcmtzcGFjZWxlc3NgIGFycml2ZXMgXHUyMDE0IGFuZCB0aGUgaGVhbGVkIGtpbmQgbXVzdFxuXHRcdC8vIHJlYWNoIHRoZSBwZXJzaXN0ZWQgY2FjaGUsIG90aGVyd2lzZSB0aGUgbmV4dCBsYXVuY2ggcmVzdXJyZWN0cyB0aGVcblx0XHQvLyBtaXMtY2xhc3NpZmljYXRpb24gZnJvbSB0aGUgc3RhbGUgc25hcHNob3QuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncXVpY2stdW50YWdnZWQnLCB7XG5cdFx0XHRzdW1tYXJ5OiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9jaGF0cy9xdWljay11bnRhZ2dlZCcpLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdGNvbnN0IGJlZm9yZVByb21vdGlvbiA9IHsgaGFzV29ya3NwYWNlOiBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSAhPT0gdW5kZWZpbmVkLCBpc1F1aWNrQ2hhdDogc2Vzc2lvbi5pc1F1aWNrQ2hhdD8uZ2V0KCkgfTtcblxuXHRcdC8vIFN1YnNjcmliZSB0byBzZXNzaW9uIHN0YXRlIHNvIHRoZSBob3N0J3Mgc25hcHNob3QgcmVhY2hlcyB0aGUgYWRhcHRlci5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3F1aWNrLXVudGFnZ2VkJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgncXVpY2stdW50YWdnZWQnLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0ZGVmYXVsdENoYXQsXG5cdFx0XHRfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRjaGF0czogW3sgcmVzb3VyY2U6IGRlZmF1bHRDaGF0LCB0aXRsZTogJycsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCkgfV0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblxuXHRcdC8vIE5leHQgbGF1bmNoIGh5ZHJhdGVzIGZyb20gdGhlIHBlcnNpc3RlZCBjYWNoZSAoYXV0aGVudGljYXRpb24gcGVuZGluZyxcblx0XHQvLyBzbyBubyBsaXN0aW5nIGNhbiByZS1zdXBwbHkgdGhlIHRhZykuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblx0XHRjb25zdCBoeWRyYXRlZCA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBuZXh0SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pLmdldFNlc3Npb25zKClbMF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZVByb21vdGlvbixcblx0XHRcdGFmdGVyUHJvbW90aW9uOiB7IHdvcmtzcGFjZTogc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCksIGlzUXVpY2tDaGF0OiBzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSB9LFxuXHRcdFx0YWZ0ZXJSZWxvYWQ6IHsgd29ya3NwYWNlOiBoeWRyYXRlZD8ud29ya3NwYWNlLmdldCgpLCBpc1F1aWNrQ2hhdDogaHlkcmF0ZWQ/LmlzUXVpY2tDaGF0Py5nZXQoKSB9LFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZVByb21vdGlvbjogeyBoYXNXb3Jrc3BhY2U6IHRydWUsIGlzUXVpY2tDaGF0OiBmYWxzZSB9LFxuXHRcdFx0YWZ0ZXJQcm9tb3Rpb246IHsgd29ya3NwYWNlOiB1bmRlZmluZWQsIGlzUXVpY2tDaGF0OiB0cnVlIH0sXG5cdFx0XHRhZnRlclJlbG9hZDogeyB3b3Jrc3BhY2U6IHVuZGVmaW5lZCwgaXNRdWlja0NoYXQ6IHRydWUgfSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYSBraW5kLW9ubHkgcHJvbW90aW9uIHNvIHRoZSBsaXN0IHJlZ3JvdXBzIGEgc2Vzc2lvbiB0aGF0IG5ldmVyIGhhZCBhIHdvcmtzcGFjZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IHByb21vdGlvbiBtdXN0IGJlIGFubm91bmNlZCBldmVuIHdoZW4gdGhlIHdvcmtzcGFjZSBkb2VzXG5cdFx0Ly8gbm90IGNoYW5nZS4gQW4gdW50YWdnZWQgc2Vzc2lvbiB3aXRoIG5vIHdvcmtpbmcgZGlyZWN0b3J5IGFscmVhZHkgaGFzXG5cdFx0Ly8gYHdvcmtzcGFjZSA9PT0gdW5kZWZpbmVkYCwgc28ga2V5aW5nIHRoZSBjaGFuZ2UgZXZlbnQgb2ZmIHRoZVxuXHRcdC8vIHdvcmtzcGFjZSBhbG9uZSB3b3VsZCBzaWxlbnRseSBwcm9tb3RlIGl0IGFuZCBsZWF2ZSB0aGUgc2lkZWJhclxuXHRcdC8vIHNob3dpbmcgaXQgb3V0c2lkZSB0aGUgXCJDaGF0c1wiIHNlY3Rpb24gdW50aWwgc29tZSB1bnJlbGF0ZWQgZXZlbnRcblx0XHQvLyBmb3JjZWQgYSByZWdyb3VwLlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3F1aWNrLW5vLWN3ZCcsIHsgc3VtbWFyeTogJ1F1aWNrIENoYXQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRjb25zdCBjaGFuZ2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlZC5wdXNoKC4uLmUuY2hhbmdlZC5tYXAocyA9PiBzLnNlc3Npb25JZCkpKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdxdWljay1uby1jd2QnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdxdWljay1uby1jd2QnLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0ZGVmYXVsdENoYXQsXG5cdFx0XHRfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRjaGF0czogW3sgcmVzb3VyY2U6IGRlZmF1bHRDaGF0LCB0aXRsZTogJycsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCkgfV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzUXVpY2tDaGF0OiBzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSxcblx0XHRcdGFubm91bmNlZDogY2hhbmdlZC5pbmNsdWRlcyhzZXNzaW9uLnNlc3Npb25JZCksXG5cdFx0fSwge1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRhbm5vdW5jZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdsaXN0aW5nIHJlY29uY2lsZSBwcm9tb3RlcyBhIGNhY2hlZCBhZGFwdGVyIGluIHBsYWNlIGFuZCBhbm5vdW5jZXMgdGhlIHJlZ3JvdXAnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiBhIHN0YXJ0dXAtY2FjaGUgZW50cnkgd3JpdHRlbiB3aGlsZSB0aGUgYGxpc3RTZXNzaW9uc2Bcblx0XHQvLyB3aXJlIGRyb3BwZWQgYF9tZXRhYCBpcyBoeWRyYXRlZCBhcyB3b3Jrc3BhY2UtYm91bmQuIFRoZSBmaXJzdFxuXHRcdC8vIGF1dGhvcml0YXRpdmUgbGlzdGluZyBtdXN0IHByb21vdGUgdGhhdCAqc2FtZSogYWRhcHRlciBpbiBwbGFjZSBhbmRcblx0XHQvLyByZXBvcnQgaXQgaW4gYGNoYW5nZWRgLCBzaW5jZSB0aGUgbGlzdCByZWdyb3VwcyBpbXBlcmF0aXZlbHkuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2NyYXRjaERpciA9IFVSSS5maWxlKCcvaG9tZS91c2VyLy5jb3BpbG90L2NoYXRzL3F1aWNrLXBvaXNvbmVkJyk7XG5cdFx0YXdhaXQgcGVyc2lzdENhY2hlZFNlc3Npb25zKGRpc3Bvc2FibGVzLCBzdG9yYWdlU2VydmljZSwgW1xuXHRcdFx0Y3JlYXRlU2Vzc2lvbigncXVpY2stcG9pc29uZWQnLCB7IHN1bW1hcnk6ICdRdWljayBDaGF0Jywgd29ya2luZ0RpcmVjdG9yeTogc2NyYXRjaERpciB9KSxcblx0XHRdKTtcblxuXHRcdC8vIE5leHQgbGF1bmNoOiB0aGUgaG9zdCBub3cgcmVwb3J0cyB0aGUgc2Vzc2lvbiBhcyB3b3Jrc3BhY2UtbGVzcy5cblx0XHRjb25zdCBuZXh0SG9zdCA9IG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbmV4dEhvc3QuZGlzcG9zZSgpKSk7XG5cdFx0bmV4dEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdxdWljay1wb2lzb25lZCcsIHsgc3VtbWFyeTogJ1F1aWNrIENoYXQnLCB3b3JraW5nRGlyZWN0b3J5OiBzY3JhdGNoRGlyLCBxdWlja0NoYXQ6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRjb25zdCBoeWRyYXRlZCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0Y29uc3QgZnJvbUNhY2hlID0geyBoYXNXb3Jrc3BhY2U6IGh5ZHJhdGVkLndvcmtzcGFjZS5nZXQoKSAhPT0gdW5kZWZpbmVkLCBpc1F1aWNrQ2hhdDogaHlkcmF0ZWQuaXNRdWlja0NoYXQ/LmdldCgpIH07XG5cblx0XHRjb25zdCBjaGFuZ2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlZC5wdXNoKC4uLmUuY2hhbmdlZC5tYXAocyA9PiBzLnNlc3Npb25JZCkpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZnJvbUNhY2hlLFxuXHRcdFx0YWZ0ZXJMaXN0aW5nOiB7IHdvcmtzcGFjZTogaHlkcmF0ZWQud29ya3NwYWNlLmdldCgpLCBpc1F1aWNrQ2hhdDogaHlkcmF0ZWQuaXNRdWlja0NoYXQ/LmdldCgpIH0sXG5cdFx0XHRhbm5vdW5jZWQ6IGNoYW5nZWQuaW5jbHVkZXMoaHlkcmF0ZWQuc2Vzc2lvbklkKSxcblx0XHRcdGhlYWxlZEluUGxhY2U6IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0gPT09IGh5ZHJhdGVkLFxuXHRcdH0sIHtcblx0XHRcdGZyb21DYWNoZTogeyBoYXNXb3Jrc3BhY2U6IHRydWUsIGlzUXVpY2tDaGF0OiBmYWxzZSB9LFxuXHRcdFx0YWZ0ZXJMaXN0aW5nOiB7IHdvcmtzcGFjZTogdW5kZWZpbmVkLCBpc1F1aWNrQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0YW5ub3VuY2VkOiB0cnVlLFxuXHRcdFx0aGVhbGVkSW5QbGFjZTogdHJ1ZSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2NvbW1pdHRlZCBxdWljayBjaGF0IGFubm91bmNlZCB2aWEgc2Vzc2lvbkFkZGVkIHN0YXlzIHdvcmtzcGFjZS1sZXNzIGRlc3BpdGUgYSBzY3JhdGNoIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogd2hlbiBhIHF1aWNrLWNoYXQgZHJhZnQgZ3JhZHVhdGVzLCB0aGUgaG9zdCBhbm5vdW5jZXMgdGhlXG5cdFx0Ly8gY29tbWl0dGVkIHNlc3Npb24gdmlhIGEgYHNlc3Npb25BZGRlZGAgbm90aWZpY2F0aW9uIHdob3NlIHN1bW1hcnlcblx0XHQvLyBjYXJyaWVzIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCBcdTIwMTQgYnV0IGFsc28gdGhlIHNjcmF0Y2ggY3dkIHRoZSBob3N0XG5cdFx0Ly8gYXNzaWduZWQuIFRoZSBhZGFwdGVyIHNlZWRzIGl0cyBzZXNzaW9uLWtpbmQgYXQgY29uc3RydWN0aW9uLCBzbyB0aGVcblx0XHQvLyB0YWcgc2hvdWxkIHJlYWNoIGl0IGhlcmUgKG5vdCBqdXN0IHZpYSB0aGUgbGF0ZXIgbGlzdFNlc3Npb25zL3N0YXRlXG5cdFx0Ly8gY2hhbm5lbHMpLCBvdGhlcndpc2UgYHdvcmtzcGFjZWAgbGVha3MgdGhlIHNjcmF0Y2ggZm9sZGVyIHVudGlsIGFcblx0XHQvLyBsYXRlciBgX21ldGFgIGhlYWxzIGl0IGFuZCB0aGUgYXJjaGl2ZS1vbi1kZWxldGUgZmFsbGJhY2sgcHJlLWZpbGxzIGFcblx0XHQvLyBuZXcgc2Vzc2lvbiB3aXRoIGl0LlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAncXVpY2stY29tbWl0dGVkJywge1xuXHRcdFx0dGl0bGU6ICdRdWljayBDaGF0Jyxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvdG1wL2NvcGlsb3Qtc2NyYXRjaC9xdWljay1jb21taXR0ZWQnKS50b1N0cmluZygpLFxuXHRcdFx0d29ya3NwYWNlbGVzczogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBBZ2VudFNlc3Npb24uaWQocy5yZXNvdXJjZS50b1N0cmluZygpKSA9PT0gJ3F1aWNrLWNvbW1pdHRlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d29ya3NwYWNlOiBzZXNzaW9uPy53b3Jrc3BhY2UuZ2V0KCksXG5cdFx0XHRpc1F1aWNrQ2hhdDogc2Vzc2lvbj8uaXNRdWlja0NoYXQ/LmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGNsZWFycyBzZXNzaW9uIGNvbmZpZyB3aGVuIHJlc29sdmluZyBjb25maWcgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmZhaWxSZXNvbHZlU2Vzc2lvbkNvbmZpZyA9IHRydWU7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWcgPT09IHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gbWFwcyBhbGxvd0FsbCBmcm9tIGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24gdG8gYXV0b0FwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGF3YWl0IGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicsIHsgYXBwcm92YWxzOiAnYWxsb3dBbGwnIH0pO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10sIHRpdGxlOiAnQXV0by1hcHByb3ZlJyB9IH0gfSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnYXV0b0FwcHJvdmUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VlZGVkSW1tZWRpYXRlbHk6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpPy52YWx1ZXMuYXV0b0FwcHJvdmUsXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWc/LmF1dG9BcHByb3ZlLFxuXHRcdH0sIHtcblx0XHRcdHNlZWRlZEltbWVkaWF0ZWx5OiAnYXV0b0FwcHJvdmUnLFxuXHRcdFx0Zm9yd2FyZGVkVG9BZ2VudEhvc3Q6ICdhdXRvQXBwcm92ZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gc2VlZHMgbW9kZSBmcm9tIGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24gYW5kIGZvcndhcmRzIGl0IHRvIHJlc29sdmVTZXNzaW9uQ29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nLCB7IG1vZGU6ICdhdXRvcGlsb3QnIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWcgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjID0+IGM/LnZhbHVlcy5tb2RlID09PSAnYXV0b3BpbG90Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlZWRlZEltbWVkaWF0ZWx5OiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKT8udmFsdWVzLm1vZGUsXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWc/Lm1vZGUsXG5cdFx0fSwge1xuXHRcdFx0c2VlZGVkSW1tZWRpYXRlbHk6ICdhdXRvcGlsb3QnLFxuXHRcdFx0Zm9yd2FyZGVkVG9BZ2VudEhvc3Q6ICdhdXRvcGlsb3QnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGZvcndhcmRzIHNlZWRlZCBjb25maWcgdG8gZWFnZXIgY3JlYXRlU2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBhcHByb3ZhbHM6ICdhbGxvd0FsbCcgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZyB9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVTZXNzaW9uQ29uZmlnc1swXT8uY29uZmlnLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGRvZXMgbm90IHNlZWQgYXV0b0FwcHJvdmUgd2hlbiBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uIGFwcHJvdmFscyBpcyB0aGUgZGVmYXVsdCB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbml0aWFsVmFsdWVzOiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKT8udmFsdWVzLFxuXHRcdFx0Zm9yd2FyZGVkQXV0b0FwcHJvdmU6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnPy5hdXRvQXBwcm92ZSxcblx0XHR9LCB7XG5cdFx0XHRpbml0aWFsVmFsdWVzOiB7fSxcblx0XHRcdGZvcndhcmRlZEF1dG9BcHByb3ZlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gY2xhbXBzIHNlZWRlZCBhdXRvQXBwcm92ZSB0byBkZWZhdWx0IHdoZW4gcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gY3JlYXRlUG9saWN5UmVzdHJpY3RlZENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBhcHByb3ZhbHM6ICdhbGxvd0FsbCcgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VlZGVkSW1tZWRpYXRlbHk6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpPy52YWx1ZXMuYXV0b0FwcHJvdmUsXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWc/LmF1dG9BcHByb3ZlLFxuXHRcdH0sIHtcblx0XHRcdHNlZWRlZEltbWVkaWF0ZWx5OiAnZGVmYXVsdCcsXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogJ2RlZmF1bHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRTZXNzaW9uQ29uZmlnVmFsdWUgcmVtZW1iZXJzIHBvcnRhYmxlIHN0cmluZyBwaWNrcyBhbmQgZHJvcHMgbm9uLXJlbWVtYmVyZWQga2V5cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ2xlZ2FjeS1icmFuY2gnLFxuXHRcdH0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsICgpID0+ICFwcm92aWRlci5pc1Nlc3Npb25Db25maWdSZXNvbHZpbmcoc2Vzc2lvbi5zZXNzaW9uSWQpLmdldCgpKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uLnNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sICdmb2xkZXInKTtcblx0XHRhd2FpdCBwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbi5zZXNzaW9uSWQsICdfX3Byb3RvX18nLCAncG9sbHV0ZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzdG9yYWdlU2VydmljZS5nZXRPYmplY3QoU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB7fSksXG5cdFx0XHR7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyB0aGUgZXhpc3RpbmcgaXNvbGF0aW9uIHNldHRlciB0byBhZ2VudC1ob3N0IGNvbmZpZyB3aXRob3V0IHJlbWVtYmVyaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgZmlyc3RBdXRvbWF0aW9uUmVxdWVzdCA9IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmxlbmd0aDtcblxuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH07XG5cdFx0YXdhaXQgcHJvdmlkZXIuc2V0SXNvbGF0aW9uTW9kZShzZXNzaW9uLnNlc3Npb25JZCwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLnN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uLFxuXHRcdFx0cmVxdWVzdHM6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLnNsaWNlKGZpcnN0QXV0b21hdGlvblJlcXVlc3QpLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QuY29uZmlnKSxcblx0XHRcdHJlbWVtYmVyZWQ6IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KSxcblx0XHR9LCB7XG5cdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogdHJ1ZSxcblx0XHRcdHJlcXVlc3RzOiBbXG5cdFx0XHRcdHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdFx0XSxcblx0XHRcdHJlbWVtYmVyZWQ6IHt9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHRoZSBwcm9ncmFtbWF0aWMgYnJhbmNoIHRyYWNraW5nIHNldHRlciB0byBoaWRkZW4gYWdlbnQtaG9zdCBjb25maWcgd2l0aG91dCByZW1lbWJlcmluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGZpcnN0QXV0b21hdGlvblJlcXVlc3QgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGg7XG5cblx0XHRhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgPSB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHR2YWx1ZXM6IHsgW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja106IGZhbHNlIH0sXG5cdFx0fTtcblx0XHRhd2FpdCBwcm92aWRlci5zZXRXb3JrdHJlZUJyYW5jaFRyYWNrKHNlc3Npb24uc2Vzc2lvbklkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3RzOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5zbGljZShmaXJzdEF1dG9tYXRpb25SZXF1ZXN0KS5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmNvbmZpZyksXG5cdFx0XHRjcmVhdGVTZXNzaW9uQ29uZmlnOiBwcm92aWRlci5nZXRDcmVhdGVTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdHJlbWVtYmVyZWQ6IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KSxcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJyxcblx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0Y3JlYXRlU2Vzc2lvbkNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTogZmFsc2UgfSxcblx0XHRcdHJlbWVtYmVyZWQ6IHt9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGJyYW5jaCBjb25maWd1cmF0aW9uIHdoZW4gYWdlbnQtaG9zdCByZXNvbHV0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhZ2VudEhvc3QuZmFpbFJlc29sdmVTZXNzaW9uQ29uZmlnID0gdHJ1ZTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb3ZpZGVyLnNldEJyYW5jaChzZXNzaW9uLnNlc3Npb25JZCwgJ2ZlYXR1cmUvYXV0b21hdGlvbicpLCAvcmVzb2x2ZVNlc3Npb25Db25maWcgdW5hdmFpbGFibGUvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3JlYXRlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgaXNvbGF0aW9uIGNvbmZpZ3VyYXRpb24gd2hlbiB0aGUgZmluYWwgcmVzb2x2ZSBjaGFuZ2VzIHRoZSByZXF1ZXN0ZWQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdmZWF0dXJlL2F1dG9tYXRpb24nIH0sXG5cdFx0fTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb3ZpZGVyLnNldElzb2xhdGlvbk1vZGUoc2Vzc2lvbi5zZXNzaW9uSWQsICd3b3JrdHJlZScpLCAvZGlkIG5vdCBhcHBseSBzZXNzaW9uIGNvbmZpZyAnaXNvbGF0aW9uJy8pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbiB3aGVuIHRoZSBkcmFmdCBpcyBkaXNwb3NlZCBkdXJpbmcgaW5pdGlhbCByZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhcnJpZXIgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0Y29uc3Qgc2V0dGluZyA9IHByb3ZpZGVyLnNldElzb2xhdGlvbk1vZGUoc2Vzc2lvbi5zZXNzaW9uSWQsICd3b3JrdHJlZScpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJhY2VUaW1lb3V0KHNldHRpbmcsIDEwMCksIC9DYW5jZWxlZC8pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBiYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYXV0aGVudGljYXRpb24gYW5kIHN0YXJ0dXAgY29uZmlnIHJlc29sdXRpb24gYmVmb3JlIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9hdXRvbWF0aW9uJyB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBzZXR0aW5nID0gcHJvdmlkZXIuc2V0QnJhbmNoKHNlc3Npb24uc2Vzc2lvbklkLCAnZmVhdHVyZS9hdXRvbWF0aW9uJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmxlbmd0aCwgMCk7XG5cblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblx0XHRhd2FpdCBzZXR0aW5nO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmNvbmZpZyksIFtcblx0XHRcdHt9LFxuXHRcdFx0eyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ2ZlYXR1cmUvYXV0b21hdGlvbicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlIGNsYW1wcyBhdXRvQXBwcm92ZSB0byBkZWZhdWx0IHdoZW4gcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlnID0gY3JlYXRlUG9saWN5UmVzdHJpY3RlZENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZywgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uLnNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSwgJ2F1dG9waWxvdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW1lbWJlcmVkOiBzdG9yYWdlU2VydmljZS5nZXRPYmplY3QoU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB7fSksXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWc/LmF1dG9BcHByb3ZlLFxuXHRcdH0sIHtcblx0XHRcdHJlbWVtYmVyZWQ6IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnZGVmYXVsdCcgfSxcblx0XHRcdGZvcndhcmRlZFRvQWdlbnRIb3N0OiAnZGVmYXVsdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYW5jaCBzZWxlY3Rpb24gc3RheXMgb24gdGhlIGN1cnJlbnQgd29ya3NwYWNlIGFuZCB0aGUgbmV4dCB3b3Jrc3BhY2UgcmVzb2x2ZXMgaXRzIG93biBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbi1hJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UtYScpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uQS5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5icmFuY2ggPT09ICdtYWluLWEnKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uQS5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCAnZmVhdHVyZS1hJyk7XG5cdFx0Y29uc3QgYnJhbmNoU2VsZWN0aW9uUmVxdWVzdCA9IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uQS5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCAnZm9sZGVyJyk7XG5cdFx0cHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uQS5zZXNzaW9uSWQpO1xuXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicsIGJyYW5jaDogJ2N1cnJlbnQtYicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcXVlc3RDb3VudEJlZm9yZVdvcmtzcGFjZUIgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGg7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UtYicpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uQi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5icmFuY2ggPT09ICdjdXJyZW50LWInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YnJhbmNoU2VsZWN0aW9uUmVxdWVzdCxcblx0XHRcdHJlbWVtYmVyZWRWYWx1ZXM6IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KSxcblx0XHRcdHdvcmtzcGFjZUJSZXF1ZXN0OiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0c1tyZXF1ZXN0Q291bnRCZWZvcmVXb3Jrc3BhY2VCXT8uY29uZmlnLFxuXHRcdFx0d29ya3NwYWNlQlJlc29sdmVkOiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25CLnNlc3Npb25JZCk/LnZhbHVlcyxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2hTZWxlY3Rpb25SZXF1ZXN0OiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS1hJyB9LFxuXHRcdFx0cmVtZW1iZXJlZFZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0XHR3b3Jrc3BhY2VCUmVxdWVzdDogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0XHR3b3Jrc3BhY2VCUmVzb2x2ZWQ6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJywgYnJhbmNoOiAnY3VycmVudC1iJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYWNoZXMgcmVzb2x2ZWQgaXNvbGF0aW9uL2JyYW5jaCBzY2hlbWEgYW5kIHNlZWRzIGl0IGludG8gdGhlIG5leHQgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogeyB0aXRsZTogJ0lzb2xhdGlvbicsIHR5cGU6ICdzdHJpbmcnLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLCBkZWZhdWx0OiAnd29ya3RyZWUnIH0sXG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogeyB0aXRsZTogJ0Jhc2UgQnJhbmNoJywgdHlwZTogJ3N0cmluZycsIGVudW06IFsnbWFpbiddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScgfSxcblx0XHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRjb25zdCBmaXJzdCA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9hJyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IHRoZSBmaXJzdCBkcmFmdCByZXNvbHZlIHNvIHRoZSBwcm92aWRlciBjYWNoZXMgdGhlIGNoaXBzXG5cdFx0YXNzZXJ0Lm9rKGZpcnN0KTtcblxuXHRcdC8vIFRoZSBuZXh0IGRyYWZ0IG1vbWVudGFyaWx5IHJlcG9ydHMgYW4gZW1wdHkgc2NoZW1hIHdoaWxlIGl0IHJlLXJlc29sdmVzLi4uXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczoge30gfSBhcyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdDtcblx0XHRjb25zdCBzZWNvbmQgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYicpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0Ly8gLi4uYnV0IGlzIHNlZWRlZCB3aXRoIHRoZSBjYWNoZWQgY2hpcHMgc28gdGhleSBzdGF5IHZpc2libGUgaW5zdGVhZCBvZiBibGFua2luZy5cblx0XHRjb25zdCBzZWVkZWRLZXlzID0gT2JqZWN0LmtleXMocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZWNvbmQuc2Vzc2lvbklkKT8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGxldCB0aGUgZW1wdHkgcmVzb2x2ZSBsYW5kLCByZXBsYWNpbmcgdGhlIHNlZWQgYW5kIHBydW5pbmcgdGhlIGNhY2hlXG5cdFx0Y29uc3QgYWZ0ZXJSZXNvbHZlS2V5cyA9IE9iamVjdC5rZXlzKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vjb25kLnNlc3Npb25JZCk/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KTtcblxuXHRcdC8vIEEgc3Vic2VxdWVudCBkcmFmdCBpcyBubyBsb25nZXIgc2VlZGVkIFx1MjAxNCB0aGUgZW1wdHkgcmVzb2x2ZSBwcnVuZWQgdGhlIGNhY2hlLlxuXHRcdGNvbnN0IHRoaXJkID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL2MnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRjb25zdCB0aGlyZFNlZWRlZEtleXMgPSBPYmplY3Qua2V5cyhwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHRoaXJkLnNlc3Npb25JZCk/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWVkZWRLZXlzLCBhZnRlclJlc29sdmVLZXlzLCB0aGlyZFNlZWRlZEtleXMgfSwge1xuXHRcdFx0c2VlZGVkS2V5czogW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoLCBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0sXG5cdFx0XHRhZnRlclJlc29sdmVLZXlzOiBbXSxcblx0XHRcdHRoaXJkU2VlZGVkS2V5czogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZm9yd2FyZHMgZ2l0Lndvcmt0cmVlSW5jbHVkZUZpbGVzIGFzIGRlcml2ZWQgc2Vzc2lvbiBjb25maWcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdnaXQud29ya3RyZWVJbmNsdWRlRmlsZXMnLCBbJ3Byb2R1Y3Qub3ZlcnJpZGVzLmpzb24nLCAnKiovbm9kZV9tb2R1bGVzLyoqJ10pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk/LnZhbHVlcyxcblx0XHRcdGZvcndhcmRlZFRvQWdlbnRIb3N0OiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZyxcblx0XHR9LCB7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogeyB3b3JrdHJlZUluY2x1ZGVGaWxlczogWydwcm9kdWN0Lm92ZXJyaWRlcy5qc29uJywgJyoqL25vZGVfbW9kdWxlcy8qKiddIH0sXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogeyB3b3JrdHJlZUluY2x1ZGVGaWxlczogWydwcm9kdWN0Lm92ZXJyaWRlcy5qc29uJywgJyoqL25vZGVfbW9kdWxlcy8qKiddIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZ2l2ZXMgcmVtZW1iZXJlZCBhdXRvQXBwcm92ZSBwcmVjZWRlbmNlIG92ZXIgYSBjb25maWd1cmVkIHNldHRpbmcgd2hpbGUgcG9saWN5IHN0aWxsIGNsYW1wcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdC8vIENhc2UgMTogcG9saWN5IHJlc3RyaWN0cyBhdXRvLWFwcHJvdmUgXHUyMDE0IHJlbWVtYmVyZWQgJ2F1dG9BcHByb3ZlJyBpcyBjbGFtcGVkIHRvICdkZWZhdWx0J1xuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWRDb25maWcgPSBjcmVhdGVQb2xpY3lSZXN0cmljdGVkQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBwb2xpY3lSZXN0cmljdGVkQ29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBhcHByb3ZhbHM6ICdhbGxvd0FsbCcgfSk7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZFByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBwb2xpY3lSZXN0cmljdGVkQ29uZmlnLCBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRwb2xpY3lSZXN0cmljdGVkUHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcG9saWN5UmVzdHJpY3RlZFByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHQvLyBDYXNlIDI6IGFuIG9yZGluYXJ5IGNvbmZpZ3VyZWQgc2V0dGluZyBpcyBhIHBsYWluIGRlZmF1bHQgXHUyMDE0IHRoZSByZW1lbWJlcmVkIHBpY2sgd2lucyBvdmVyIGl0XG5cdFx0Y29uc3QgY29uZmlndXJlZERlZmF1bHRDb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29uZmlndXJlZERlZmF1bHRDb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nLCB7IGFwcHJvdmFsczogJ2RlZmF1bHQnIH0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWREZWZhdWx0UHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ3VyZWREZWZhdWx0Q29uZmlnLCBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRjb25maWd1cmVkRGVmYXVsdFByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIGNvbmZpZ3VyZWREZWZhdWx0UHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cG9saWN5UmVzdHJpY3RlZDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTIpPy5jb25maWc/LmF1dG9BcHByb3ZlLFxuXHRcdFx0Y29uZmlndXJlZERlZmF1bHQ6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnPy5hdXRvQXBwcm92ZSxcblx0XHR9LCB7XG5cdFx0XHRwb2xpY3lSZXN0cmljdGVkOiAnZGVmYXVsdCcsXG5cdFx0XHRjb25maWd1cmVkRGVmYXVsdDogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBtaWdyYXRlcyBhIHJlbWVtYmVyZWQgbGVnYWN5IGF1dG9BcHByb3ZlPWF1dG9waWxvdCB0byBtb2RlPWF1dG9waWxvdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b3BpbG90Jyxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZywge1xuXHRcdFx0bW9kZTogJ2F1dG9waWxvdCcsXG5cdFx0XHRhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGRyb3BzIGFuIGludmFsaWQgcmVtZW1iZXJlZCBtb2RlIGluc3RlYWQgb2YgZm9yd2FyZGluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdib2d1cycsXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZz8ubW9kZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBzZWVkcyByZW1lbWJlcmVkIG1vZGUvYXBwcm92YWxzIHdoZW4gY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbiBpcyBhdCBpdHMgc2NoZW1hIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiAncGxhbicsXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhdXRvQXBwcm92ZScsXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogY3JlYXRlU2NoZW1hRGVmYXVsdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHR9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnLCB7XG5cdFx0XHRtb2RlOiAncGxhbicsXG5cdFx0XHRhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBrZWVwcyByZW1lbWJlcmVkIHBpY2tzIG92ZXIgYW4gb3JkaW5hcnkgY29uZmlndXJlZCBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uIHNldHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiAncGxhbicsXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhdXRvQXBwcm92ZScsXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGNyZWF0ZVNjaGVtYURlZmF1bHRDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdC8vIEFuIG9yZGluYXJ5IGNvbmZpZ3VyZWQgc2V0dGluZyBhY3RzIGFzIGEgZGVmYXVsdCB0aGF0IHRoZSByZW1lbWJlcmVkIHBpY2sgb3ZlcnJpZGVzLlxuXHRcdGF3YWl0IGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicsIHsgbW9kZTogJ2F1dG9waWxvdCcgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZywgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZywge1xuXHRcdFx0bW9kZTogJ3BsYW4nLFxuXHRcdFx0YXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gdXNlcyBjb25maWd1cmVkIGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24gd2hlbiB0aGVyZSBpcyBubyByZW1lbWJlcmVkIHBpY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gY3JlYXRlU2NoZW1hRGVmYXVsdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBtb2RlOiAnYXV0b3BpbG90JywgYXBwcm92YWxzOiAnYWxsb3dBbGwnIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWcgfSk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZywge1xuXHRcdFx0bW9kZTogJ2F1dG9waWxvdCcsXG5cdFx0XHRhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBsZXRzIGFuIGVudGVycHJpc2UgcG9saWN5IGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24gb3ZlcnJpZGUgcmVtZW1iZXJlZCBwaWNrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdwbGFuJyxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGluc3BlY3Q8VD4oa2V5OiBzdHJpbmcpIHtcblx0XHRcdFx0Y29uc3QgYmFzZSA9IHN1cGVyLmluc3BlY3Q8VD4oa2V5KTtcblx0XHRcdFx0aWYgKGtleSA9PT0gJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgcG9saWN5VmFsdWU6IHsgbW9kZTogJ2F1dG9waWxvdCcsIGFwcHJvdmFsczogJ2RlZmF1bHQnIH0gYXMgdW5rbm93biBhcyBUIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGJhc2U7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWcsIHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWcsIHtcblx0XHRcdG1vZGU6ICdhdXRvcGlsb3QnLFxuXHRcdFx0YXV0b0FwcHJvdmU6ICdkZWZhdWx0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbkJ5UmVzb3VyY2UgcmVzb2x2ZXMgY3VycmVudCBuZXcgc2Vzc2lvbiB3aXRob3V0IGxpc3RpbmcgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL215LXByb2plY3QnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2VVcmksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBwcm92aWRlci5nZXRTZXNzaW9uQnlSZXNvdXJjZShzZXNzaW9uLnJlc291cmNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlzdGVkU2Vzc2lvbnM6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLFxuXHRcdFx0cmVzb2x2ZWRSZXNvdXJjZTogcmVzb2x2ZWQ/LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvbHZlZFdvcmtzcGFjZUxhYmVsOiByZXNvbHZlZD8ud29ya3NwYWNlLmdldCgpPy5sYWJlbCxcblx0XHR9LCB7XG5cdFx0XHRsaXN0ZWRTZXNzaW9uczogMCxcblx0XHRcdHJlc29sdmVkUmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdHJlc29sdmVkV29ya3NwYWNlTGFiZWw6ICdteS1wcm9qZWN0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnam9pbnMgdGhlIGFjdGl2ZSBjbGllbnQgd2l0aCBjdXN0b21pemF0aW9ucyB3aGVuIG9wZW5pbmcgYW4gZXhpc3Rpbmcgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0ge1xuXHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL2N1c3RvbWl6YXRpb25zL3Rlc3QnLFxuXHRcdFx0XHR1cmk6ICdmaWxlOi8vL2N1c3RvbWl6YXRpb25zL3Rlc3QnLFxuXHRcdFx0XHRuYW1lOiAnVGVzdCBDdXN0b21pemF0aW9uJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdH1dLFxuXHRcdH0gc2F0aXNmaWVzIE9taXQ8U2Vzc2lvbkFjdGl2ZUNsaWVudCwgJ2NsaWVudElkJz47XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiwgYWN0aXZlQ2xpZW50IH0pO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCBwYXRoOiAnL2FjdGl2ZS1jbGllbnQnIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KHtcblx0XHRcdHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLFxuXHRcdFx0c2Vzc2lvbklkOiBgJHtwcm92aWRlci5pZH06JHtyZXNvdXJjZS50b1N0cmluZygpfWAsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHR9IGFzIElBY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnYWN0aXZlLWNsaWVudCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGRpc3BhdGNoID0+IGRpc3BhdGNoLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQpLCBbe1xuXHRcdFx0Y2hhbm5lbDogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdhY3RpdmUtY2xpZW50JykudG9TdHJpbmcoKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZDogJ3Rlc3QtbG9jYWwtY2xpZW50JywgLi4uYWN0aXZlQ2xpZW50IH0sXG5cdFx0XHR9LFxuXHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWxvY2FsLWNsaWVudCcsXG5cdFx0XHRjbGllbnRTZXE6IDAsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGVhZ2VybHkgY3JlYXRlcyB0aGUgYmFja2VuZCBzZXNzaW9uIHdpdGggdGhlIGNsaWVudC1hbGxvY2F0ZWQgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9teS1wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlVXJpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGxldCB0aGUgZWFnZXIgY3JlYXRlU2Vzc2lvbiBwcm9taXNlIHJlc29sdmVcblxuXHRcdGNvbnN0IHJhd0lkID0gc2Vzc2lvbi5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRjb25zdCBleHBlY3RlZEJhY2tlbmRVcmkgPSBBZ2VudFNlc3Npb24udXJpKHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCwgcmF3SWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3QuY3JlYXRlZFNlc3Npb25VcmlzLm1hcCh1ID0+IHUudG9TdHJpbmcoKSksXG5cdFx0XHRbZXhwZWN0ZWRCYWNrZW5kVXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0J2VhZ2VyIGNyZWF0ZVNlc3Npb24gc2hvdWxkIGJlIGludm9rZWQgd2l0aCB0aGUgY2xpZW50LWFsbG9jYXRlZCBVUkknLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KGV4cGVjdGVkQmFja2VuZFVyaS50b1N0cmluZygpKSxcblx0XHRcdDEsXG5cdFx0XHQnYSBzdGF0ZSBzdWJzY3JpcHRpb24gc2hvdWxkIGJlIGhlbGQgd2hpbGUgdGhlIG5ldyBzZXNzaW9uIHZpZXcgaXMgYWN0aXZlJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGRvZXMgbm90IGVhZ2VybHkgY3JlYXRlIHRoZSBiYWNrZW5kIHNlc3Npb24gaW4gYW4gdW50cnVzdGVkIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyB3b3Jrc3BhY2VUcnVzdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3VudHJ1c3RlZC1wcm9qZWN0Jyk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2VVcmksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IHRoZSAoc3VwcHJlc3NlZCkgZWFnZXIgY3JlYXRlU2Vzc2lvbiBwYXRoIHNldHRsZVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5jcmVhdGVkU2Vzc2lvblVyaXMubWFwKHUgPT4gdS50b1N0cmluZygpKSxcblx0XHRcdFtdLFxuXHRcdFx0J25vIGVhZ2VyIGNyZWF0ZVNlc3Npb24gc2hvdWxkIGJlIGludm9rZWQgZm9yIGFuIHVudHJ1c3RlZCBmb2xkZXInLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZGlzcG9zZXMgdGhlIHByZXZpb3VzIGVhZ2VyIGJhY2tlbmQgc2Vzc2lvbiBvbiB3b3Jrc3BhY2Ugc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVJZCA9IHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZDtcblxuXHRcdGNvbnN0IGZpcnN0ID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL2EnKSwgc2Vzc2lvblR5cGVJZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBmaXJzdFJhd0lkID0gZmlyc3QucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0Y29uc3QgZmlyc3RCYWNrZW5kVXJpID0gQWdlbnRTZXNzaW9uLnVyaShzZXNzaW9uVHlwZUlkLCBmaXJzdFJhd0lkKTtcblxuXHRcdC8vIFN3aXRjaCB3b3Jrc3BhY2U6IHRoZSBtYW5hZ2VtZW50IGxheWVyIGRpc3Bvc2VzIHRoZSBhYmFuZG9uZWQgZHJhZnRcblx0XHQvLyAocHJvdmlkZXJzIG5vIGxvbmdlciBkbyBzbyBpbXBsaWNpdGx5KSwgd2hpY2ggZGlzcG9zZXMgdGhlIGZpcnN0XG5cdFx0Ly8gYmFja2VuZCBzZXNzaW9uIGFuZCByZWxlYXNlcyBpdHMgc3Vic2NyaXB0aW9uLlxuXHRcdGNvbnN0IHNlY29uZCA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9iJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oZmlyc3Quc2Vzc2lvbklkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlY29uZFJhd0lkID0gc2Vjb25kLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdGNvbnN0IHNlY29uZEJhY2tlbmRVcmkgPSBBZ2VudFNlc3Npb24udXJpKHNlc3Npb25UeXBlSWQsIHNlY29uZFJhd0lkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3QuZGlzcG9zZWRTZXNzaW9ucy5tYXAodSA9PiB1LnRvU3RyaW5nKCkpLFxuXHRcdFx0W2ZpcnN0QmFja2VuZFVyaS50b1N0cmluZygpXSxcblx0XHRcdCdmaXJzdCBiYWNrZW5kIHNlc3Npb24gc2hvdWxkIGJlIGRpc3Bvc2VkIHdoZW4gdGhlIHdvcmtzcGFjZSBzd2l0Y2hlcycsXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWdlbnRIb3N0LmNyZWF0ZWRTZXNzaW9uVXJpcy5tYXAodSA9PiB1LnRvU3RyaW5nKCkpLFxuXHRcdFx0W2ZpcnN0QmFja2VuZFVyaS50b1N0cmluZygpLCBzZWNvbmRCYWNrZW5kVXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0J2EgZnJlc2ggYmFja2VuZCBzZXNzaW9uIHNob3VsZCBiZSBjcmVhdGVkIGZvciB0aGUgbmV3IHdvcmtzcGFjZScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZWFnZXIgY3JlYXRlU2Vzc2lvbiBjb21wbGV0ZXMgb24gdGhlIHdpcmUgYmVmb3JlIGdldFN1YnNjcmlwdGlvbiBvcGVucycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGlzIGd1YXJkcyBhZ2FpbnN0IGEgcmVncmVzc2lvbiB3aGVyZSB0aGUgb3JkZXIgd2FzIGZsaXBwZWQ6XG5cdFx0Ly8gYGdldFN1YnNjcmlwdGlvbmAgZmlyc3QgXHUyMTkyIHNlcnZlciBzYXcgYHN1YnNjcmliZWAgZm9yIGFuIHVua25vd25cblx0XHQvLyBzZXNzaW9uIFx1MjE5MiByZXR1cm5lZCBgQUhQX1NFU1NJT05fTk9UX0ZPVU5EYCBcdTIxOTIgdGhlIGNsaWVudCBzdWJzY3JpcHRpb25cblx0XHQvLyBlbnRlcmVkIGFuIGVycm9yIHN0YXRlIFx1MjE5MiB0aGUgY2hhdCBoYW5kbGVyIGxhdGVyIHRyZWF0ZWQgdGhlIHNlc3Npb25cblx0XHQvLyBhcyBtaXNzaW5nIGFuZCByZS1pc3N1ZWQgYGNyZWF0ZVNlc3Npb25gLCBwcm9kdWNpbmcgYSBkdXBsaWNhdGUuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2onKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgcmF3SWQgPSBzZXNzaW9uLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdGNvbnN0IGJhY2tlbmRLZXkgPSBBZ2VudFNlc3Npb24udXJpKHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCwgcmF3SWQpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgb3BzID0gYWdlbnRIb3N0LndpcmVPcHMuZmlsdGVyKG9wID0+IG9wLmVuZHNXaXRoKGJhY2tlbmRLZXkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0b3BzLFxuXHRcdFx0W2BjcmVhdGVTZXNzaW9uOiR7YmFja2VuZEtleX1gLCBgc3Vic2NyaWJlOiR7YmFja2VuZEtleX1gXSxcblx0XHRcdCdjcmVhdGVTZXNzaW9uIG11c3QgY29tcGxldGUgYmVmb3JlIHN1YnNjcmliZSBpcyBpc3N1ZWQnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHN1YnNjcmlwdGlvbiBpcyBvcGVuZWQgaWYgZWFnZXIgY3JlYXRlU2Vzc2lvbiBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdC8vIFJlcGxhY2UgdGhlIG5leHQgY3JlYXRlU2Vzc2lvbiBjYWxsIHdpdGggYSByZWplY3Rpbmcgb25lLiBUaGUgbW9jaydzXG5cdFx0Ly8gb25DcmVhdGVTZXNzaW9uIGhvb2sgcnVucyBhZnRlciB0aGUgVVJJIGlzIGxvZ2dlZCwgc28gd2UgdGhyb3cgZnJvbVxuXHRcdC8vIHRoZSBob29rIHRvIG1vZGVsIGFuIGF1dGgtcmVxdWlyZWQgLyBuZXR3b3JrIGVycm9yIHJlc3BvbnNlLlxuXHRcdGFnZW50SG9zdC5vbkNyZWF0ZVNlc3Npb24gPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignYXV0aCByZXF1aXJlZCcpOyB9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qJyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHJhd0lkID0gc2Vzc2lvbi5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRjb25zdCBiYWNrZW5kS2V5ID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsIHJhd0lkKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChiYWNrZW5kS2V5KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCdubyBzdWJzY3JpcHRpb24gc2hvdWxkIGJlIG9wZW5lZCB3aGVuIGNyZWF0ZVNlc3Npb24gcmVqZWN0cycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlIHN3aXRjaCBtaWQtY3JlYXRlU2Vzc2lvbiBkb2VzIG5vdCBvcGVuIGEgc3RhbGUgc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1vZGVscyB0aGUgcmFjZSB3aGVyZSB0aGUgdXNlciBzd2l0Y2hlcyB3b3Jrc3BhY2VzIHdoaWxlIHRoZSBlYWdlclxuXHRcdC8vIGBjcmVhdGVTZXNzaW9uYCBmb3IgdGhlIHByZXZpb3VzIHdvcmtzcGFjZSBpcyBzdGlsbCBpbiBmbGlnaHQgb25cblx0XHQvLyB0aGUgd2lyZS4gUHJvdmlkZXJzIG5vdyB0cmFjayBtdWx0aXBsZSBuZXcgc2Vzc2lvbnMsIHNvIGFiYW5kb25pbmdcblx0XHQvLyB0aGUgcHJldmlvdXMgZHJhZnQgaXMgZXhwbGljaXQ6IHRoZSBtYW5hZ2VtZW50IGxheWVyIGNhbGxzXG5cdFx0Ly8gYGRlbGV0ZU5ld1Nlc3Npb25gIG9uIHdvcmtzcGFjZSBzd2l0Y2guIE9uY2UgdGhlIHBhcmtlZCBjcmVhdGVcblx0XHQvLyBldmVudHVhbGx5IHJlc29sdmVzLCB3ZSBtdXN0IG5vdCBvcGVuIGEgc3Vic2NyaXB0aW9uIGZvciBpdCBcdTIwMTQgaXQgaGFzXG5cdFx0Ly8gYWxyZWFkeSBiZWVuIGRpc3Bvc2VkLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVJZCA9IHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZDtcblxuXHRcdGNvbnN0IGZpcnN0Q3JlYXRlR2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRhZ2VudEhvc3Qub25DcmVhdGVTZXNzaW9uID0gKCkgPT4gZmlyc3RDcmVhdGVHYXRlLnA7XG5cblx0XHRjb25zdCBmaXJzdCA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9hJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdC8vIFlpZWxkIG9uY2Ugc28gdGhlIGVhZ2VyIGNyZWF0ZVNlc3Npb24gcHJvbWlzZSBzdGFydHMgYW5kIHBhcmtzIGF0XG5cdFx0Ly8gdGhlIGdhdGU7IG5vdGhpbmcgZWxzZSBoYXMgaGFwcGVuZWQgeWV0LlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBTd2l0Y2ggd29ya3NwYWNlIHdoaWxlIHRoZSBmaXJzdCBjcmVhdGVTZXNzaW9uIGlzIHN0aWxsIHBhcmtlZC5cblx0XHRjb25zdCBzZWNvbmQgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYicpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHQvLyBBYmFuZG9uIHRoZSBmaXJzdCBkcmFmdCAod2hhdCB0aGUgbWFuYWdlbWVudCBsYXllciBkb2VzIG9uIGFcblx0XHQvLyB3b3Jrc3BhY2Ugc3dpdGNoKS4gRGlzcG9zaW5nIHRoZSBmaXJzdCBOZXdTZXNzaW9uIGNsZWFycyBpdHMgYmFja2VuZFxuXHRcdC8vIFVSSSBiZWZvcmUgdGhlIHNlY29uZCBlYWdlci1jcmVhdGUgcnVucy5cblx0XHRwcm92aWRlci5kZWxldGVOZXdTZXNzaW9uKGZpcnN0LnNlc3Npb25JZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIE5vdyByZWxlYXNlIHRoZSBmaXJzdCBjcmVhdGVTZXNzaW9uLiBUaGUgYXN5bmMgSUlGRSBpblxuXHRcdC8vIGBOZXdTZXNzaW9uLmVhZ2VyQ3JlYXRlYCBzaG91bGQgb2JzZXJ2ZSB0aGF0IHRoZSBiYWNrZW5kIFVSSSBub1xuXHRcdC8vIGxvbmdlciBtYXRjaGVzIGFuZCBiYWlsIHdpdGhvdXQgc3Vic2NyaWJpbmcuXG5cdFx0Zmlyc3RDcmVhdGVHYXRlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGZpcnN0QmFja2VuZEtleSA9IEFnZW50U2Vzc2lvbi51cmkoc2Vzc2lvblR5cGVJZCwgZmlyc3QucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSkpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc2Vjb25kQmFja2VuZEtleSA9IEFnZW50U2Vzc2lvbi51cmkoc2Vzc2lvblR5cGVJZCwgc2Vjb25kLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChmaXJzdEJhY2tlbmRLZXkpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J25vIHN1YnNjcmlwdGlvbiBzaG91bGQgYmUgb3BlbmVkIGZvciB0aGUgYWJhbmRvbmVkIGZpcnN0IHNlc3Npb24nLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlY29uZEJhY2tlbmRLZXkpLFxuXHRcdFx0MSxcblx0XHRcdCdzZWNvbmQgc2Vzc2lvbiBzaG91bGQgc3RpbGwgZ2V0IGl0cyBlYWdlciBzdWJzY3JpcHRpb24nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBhY3Rpb25zIC0tLS0tLS1cblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIGNhbGxzIGRpc3Bvc2VTZXNzaW9uIGFuZCByZW1vdmVzIGZyb20gY2FjaGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2RlbC1zZXNzJywgeyB0aXRsZTogJ1RvIERlbGV0ZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdUbyBEZWxldGUnKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0KTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24odGFyZ2V0IS5zZXNzaW9uSWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwb3NlZFNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgZGlzcG9zZWRVcmkgPSBhZ2VudEhvc3QuZGlzcG9zZWRTZXNzaW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLnByb3ZpZGVyKGRpc3Bvc2VkVXJpKSwgJ2NvcGlsb3RjbGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLmlkKGRpc3Bvc2VkVXJpKSwgJ2RlbC1zZXNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdUbyBEZWxldGUnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlU2Vzc2lvbnMgZGlzcG9zZXMgYWxsIHNlc3Npb25zIGFuZCByZW1vdmVzIHRoZW0gZnJvbSBjYWNoZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnZGVsLTEnLCB7IHRpdGxlOiAnRmlyc3QnIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnZGVsLTInLCB7IHRpdGxlOiAnU2Vjb25kJyB9KTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NlY29uZCcpO1xuXHRcdGFzc2VydC5vayhmaXJzdCk7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVTZXNzaW9ucyhbZmlyc3QhLnNlc3Npb25JZCwgc2Vjb25kIS5zZXNzaW9uSWRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcG9zZWRTZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3Bvc2VkU2Vzc2lvbnMubWFwKHVyaSA9PiBBZ2VudFNlc3Npb24uaWQodXJpKSkuc29ydCgpLCBbJ2RlbC0xJywgJ2RlbC0yJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnRmlyc3QnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NlY29uZCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJlbmFtZSAtLS0tLS0tXG5cblx0dGVzdCgncmVuYW1lU2Vzc2lvbiBkaXNwYXRjaGVzIFNlc3Npb25UaXRsZUNoYW5nZWQgb24gdGhlIHNlc3Npb24gY2hhbm5lbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAncmVuYW1lLXNlc3MnLCB7IHRpdGxlOiAnT2xkIFRpdGxlJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBzZXNzaW9ucy5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ09sZCBUaXRsZScpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIucmVuYW1lU2Vzc2lvbih0YXJnZXQhLnNlc3Npb25JZCwgJ05ldyBUaXRsZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGRpc3BhdGNoZWQgPSBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BhdGNoZWQuYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaXNwYXRjaGVkLmFjdGlvbiBhcyB7IHRpdGxlOiBzdHJpbmcgfSkudGl0bGUsICdOZXcgVGl0bGUnKTtcblx0XHRjb25zdCBhY3Rpb25TZXNzaW9uID0gZGlzcGF0Y2hlZC5jaGFubmVsLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFnZW50U2Vzc2lvbi5wcm92aWRlcihhY3Rpb25TZXNzaW9uKSwgJ2NvcGlsb3RjbGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLmlkKGFjdGlvblNlc3Npb24pLCAncmVuYW1lLXNlc3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5jbGllbnRJZCwgJ3Rlc3QtbG9jYWwtY2xpZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZVNlc3Npb24gdXBkYXRlcyB0aGUgc2Vzc2lvbiB0aXRsZSBvcHRpbWlzdGljYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAncmVuYW1lLW9wdCcsIHsgdGl0bGU6ICdCZWZvcmUnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnQmVmb3JlJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5yZW5hbWVTZXNzaW9uKHRhcmdldCEuc2Vzc2lvbklkLCAnQWZ0ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0IS50aXRsZS5nZXQoKSwgJ0FmdGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZUNoYXQgb24gdGhlIGRlZmF1bHQgY2hhdCByZW5hbWVzIHRoZSBjaGF0IHRhYiwgbm90IHRoZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdyZW5hbWUtZGVmYXVsdC1jaGF0JywgeyB0aXRsZTogJ1Nlc3Npb24gVGl0bGUnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2Vzc2lvbiBUaXRsZScpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIucmVuYW1lQ2hhdCh0YXJnZXQhLnNlc3Npb25JZCwgdGFyZ2V0IS5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSwgJ0NoYXQgVGl0bGUnKTtcblxuXHRcdC8vIFNlc3Npb24gdGl0bGUgaXMgdW50b3VjaGVkOyB0aGUgZGVmYXVsdCBjaGF0IHRhYiB0aXRsZSBjaGFuZ2VzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQhLnRpdGxlLmdldCgpLCAnU2Vzc2lvbiBUaXRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQhLm1haW5DaGF0LmdldCgpLnRpdGxlLmdldCgpLCAnQ2hhdCBUaXRsZScpO1xuXHRcdC8vIERpc3BhdGNoZWQgb24gdGhlIGRlZmF1bHQgY2hhdCBjaGFubmVsLCBub3QgdGhlIHNlc3Npb24gY2hhbm5lbC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgZGlzcGF0Y2hlZCA9IGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5hY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5jaGFubmVsLnRvU3RyaW5nKCksIGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdyZW5hbWUtZGVmYXVsdC1jaGF0JykudG9TdHJpbmcoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWVDaGF0IGlzIG5vLW9wIGZvciB1bmtub3duIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCBwcm92aWRlci5yZW5hbWVDaGF0KCdub25leGlzdGVudC1pZCcsIFVSSS5wYXJzZSgndGVzdDovL25vbmV4aXN0ZW50JyksICdJZ25vcmVkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gTXVsdGktY2hhdCBjYXRhbG9nIChhcHBseUNoYXRDYXRhbG9nIHJlY29uY2lsaWF0aW9uKSAtLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ211bHRpLWNoYXQgY2F0YWxvZycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBtYWtlQ2hhdFN1bW1hcnkocmVzb3VyY2U6IHN0cmluZywgdGl0bGU6IHN0cmluZywgc3RhdHVzID0gUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUpOiBDaGF0U3VtbWFyeSB7XG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZSwgdGl0bGUsIHN0YXR1cywgbW9kaWZpZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG1ha2VTdGF0ZShjaGF0czogQ2hhdFN1bW1hcnlbXSwgb3B0cz86IHsgc2Vzc2lvblRpdGxlPzogc3RyaW5nOyBkZWZhdWx0Q2hhdD86IHN0cmluZyB9KTogU2Vzc2lvblN0YXRlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHRcdHRpdGxlOiBvcHRzPy5zZXNzaW9uVGl0bGUgPz8gJ1Nlc3Npb24nLFxuXHRcdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0XHRjaGF0cyxcblx0XHRcdFx0Li4uKG9wdHM/LmRlZmF1bHRDaGF0ID8geyBkZWZhdWx0Q2hhdDogb3B0cy5kZWZhdWx0Q2hhdCB9IDoge30pLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXI6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVByb3ZpZGVyPiwgcmF3SWQ6IHN0cmluZyk6IElTZXNzaW9uIHtcblx0XHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCByYXdJZCwgeyB0aXRsZTogJ1Nlc3Npb24nIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IEFnZW50U2Vzc2lvbi5pZChzLnJlc291cmNlLnRvU3RyaW5nKCkpID09PSByYXdJZCk7XG5cdFx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0XHQvLyBGb3JjZSBhIHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIHNvIHB1c2hlZCBzdGF0ZXMgcmVhY2ggdGhlIGFkYXB0ZXIuXG5cdFx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbiE7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZGVmYXVsdCArIHBlZXIgY2F0YWxvZyBzdXJmYWNlcyBib3RoIGNoYXRzIHdpdGggdGhlIGRlZmF1bHQgYXMgbWFpbkNoYXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLTEnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS0xJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KHBlZXJDaGF0LCAnUGVlcicpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyxcblx0XHRcdFx0Y2hhdEZyYWdtZW50czogc2Vzc2lvbi5jaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50KSxcblx0XHRcdFx0bWFpbklzRGVmYXVsdDogc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKSA9PT0gc2Vzc2lvbi5jaGF0cy5nZXQoKVswXSxcblx0XHRcdFx0cGVlclRpdGxlOiBzZXNzaW9uLmNoYXRzLmdldCgpWzFdLnRpdGxlLmdldCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUsXG5cdFx0XHRcdGNoYXRGcmFnbWVudHM6IFsnJywgJ3BlZXItMSddLFxuXHRcdFx0XHRtYWluSXNEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRwZWVyVGl0bGU6ICdQZWVyJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVlciBjaGF0cyBtYXAgcHJvdG9jb2wgaW50ZXJhY3Rpdml0eSB0byB0aGUgcHJvdmlkZXItYWdub3N0aWMgdHJpLXN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1ybycpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktcm8nKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcmVhZE9ubHlQZWVyID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLXJvJyk7XG5cdFx0XHRjb25zdCBoaWRkZW5QZWVyID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLWhpZGRlbicpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1ybycsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdHsgLi4ubWFrZUNoYXRTdW1tYXJ5KHJlYWRPbmx5UGVlciwgJ1dvcmtlcicpLCBpbnRlcmFjdGl2aXR5OiBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5IH0sXG5cdFx0XHRcdHsgLi4ubWFrZUNoYXRTdW1tYXJ5KGhpZGRlblBlZXIsICdIaWRkZW4gV29ya2VyJyksIGludGVyYWN0aXZpdHk6IFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHkuSGlkZGVuIH0sXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLmNoYXRzLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0cy5tYXAoYyA9PiBjLmludGVyYWN0aXZpdHkuZ2V0KCkpLCBbXG5cdFx0XHRcdENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwsXG5cdFx0XHRcdENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5LFxuXHRcdFx0XHRDaGF0SW50ZXJhY3Rpdml0eS5IaWRkZW4sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YmFnZW50ICh0b29sLW9yaWdpbikgY2hhdHMgc3VyZmFjZSBhcyByZWFkLW9ubHkgcGVlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXN1YicpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktc3ViJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdCA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmksICd0Yy0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXN1YicsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdHsgLi4ubWFrZUNoYXRTdW1tYXJ5KHN1YmFnZW50Q2hhdCwgJ0NvZGUgUmV2aWV3ZXInKSwgb3JpZ2luOiB7IGtpbmQ6IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuVG9vbCwgY2hhdDogZGVmYXVsdENoYXQsIHRvb2xDYWxsSWQ6ICd0Yy0xJyB9LCBpbnRlcmFjdGl2aXR5OiBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5IH0sXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLmNoYXRzLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRpdGxlczogY2hhdHMubWFwKGMgPT4gYy50aXRsZS5nZXQoKSksXG5cdFx0XHRcdGludGVyYWN0aXZpdHk6IGNoYXRzLm1hcChjID0+IGMuaW50ZXJhY3Rpdml0eS5nZXQoKSksXG5cdFx0XHRcdHN1YmFnZW50T3JpZ2luOiBjaGF0c1sxXT8ub3JpZ2luPy5raW5kLFxuXHRcdFx0XHQvLyBUaGUgc3ViYWdlbnQgcmVjb3JkcyBpdHMgcGFyZW50IGNoYXQgKHRoZSBkZWZhdWx0IGNoYXQpIHNvIHRoZVxuXHRcdFx0XHQvLyBcIkFnZW50c1wiIHJvdyBjYW4gbGlzdCBpdCB1bmRlciB0aGUgY2hhdCB0aGF0IHNwYXduZWQgaXQuXG5cdFx0XHRcdHN1YmFnZW50UGFyZW50SXNNYWluOiAhIWNoYXRzWzFdPy5vcmlnaW4/LnBhcmVudENoYXQgJiYgaXNFcXVhbChjaGF0c1sxXS5vcmlnaW4ucGFyZW50Q2hhdCwgY2hhdHNbMF0ucmVzb3VyY2UpLFxuXHRcdFx0XHQvLyBBIHN1YmFnZW50IHdvcmtlciBjaGF0IGlzIG5laXRoZXIgcmVuYW1lYWJsZSBub3IgZGVsZXRhYmxlLlxuXHRcdFx0XHRzdWJhZ2VudENhcGFiaWxpdGllczogZ2V0Q2hhdENhcGFiaWxpdGllcyhjaGF0c1sxXSwgc2Vzc2lvbiwgdW5kZWZpbmVkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGl0bGVzOiBbJ1Nlc3Npb24nLCAnQ29kZSBSZXZpZXdlciddLFxuXHRcdFx0XHRpbnRlcmFjdGl2aXR5OiBbQ2hhdEludGVyYWN0aXZpdHkuRnVsbCwgQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHldLFxuXHRcdFx0XHRzdWJhZ2VudE9yaWdpbjogQ2hhdE9yaWdpbktpbmQuVG9vbCxcblx0XHRcdFx0c3ViYWdlbnRQYXJlbnRJc01haW46IHRydWUsXG5cdFx0XHRcdHN1YmFnZW50Q2FwYWJpbGl0aWVzOiB7IGNhblJlbmFtZTogZmFsc2UsIGNhbkRlbGV0ZTogZmFsc2UgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhlIG1haW4gY2hhdCBpcyByZW5hbWVhYmxlIGJ1dCBuZXZlciBkZWxldGFibGUgdmlhIGNhcGFiaWxpdGllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbWFpbi1jYXBzJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtYWluLWNhcHMnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtYWluLWNhcHMnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHR7IC4uLm1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSwgb3JpZ2luOiB7IGtpbmQ6IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuVXNlciB9IH0sXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLmNoYXRzLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdC8vIFRoZSBtYWluIChkZWZhdWx0KSBjaGF0OiByZW5hbWVhYmxlLCBuZXZlciBkZWxldGFibGUuXG5cdFx0XHRcdG1haW46IGdldENoYXRDYXBhYmlsaXRpZXMoY2hhdHNbMF0sIHNlc3Npb24sIHVuZGVmaW5lZCksXG5cdFx0XHRcdC8vIEEgcmVndWxhciB1c2VyIHBlZXIgY2hhdDogZnVsbHkgbWFuYWdlYWJsZS5cblx0XHRcdFx0cGVlcjogZ2V0Q2hhdENhcGFiaWxpdGllcyhjaGF0c1sxXSwgc2Vzc2lvbiwgdW5kZWZpbmVkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWFpbjogeyBjYW5SZW5hbWU6IHRydWUsIGNhbkRlbGV0ZTogZmFsc2UgfSxcblx0XHRcdFx0cGVlcjogeyBjYW5SZW5hbWU6IHRydWUsIGNhbkRlbGV0ZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJhZ2VudCBjaGF0cyBzdXJmYWNlIGFzIHJlYWQtb25seSBwZWVycyBldmVuIHdpdGhvdXQgbXVsdGktY2hhdCBzdXBwb3J0LCBidXQgdXNlciBwZWVycyBkbyBub3QnLCAoKSA9PiB7XG5cdFx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHRcdHsgcHJvdmlkZXI6ICdjbGF1ZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkLCB0cnVlKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlIH0pO1xuXHRcdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdjbGF1ZGUtc3ViJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlJyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBBZ2VudFNlc3Npb24uaWQocy5yZXNvdXJjZS50b1N0cmluZygpKSA9PT0gJ2NsYXVkZS1zdWInKTtcblx0XHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NsYXVkZScsICdjbGF1ZGUtc3ViJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdCA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmksICd0Yy0xJyk7XG5cdFx0XHRjb25zdCB1c2VyUGVlciA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2NsYXVkZS1zdWInLCAnY2xhdWRlJywge1xuXHRcdFx0XHRwcm92aWRlcjogJ2NsYXVkZScsXG5cdFx0XHRcdHRpdGxlOiAnQ2xhdWRlJyxcblx0XHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdFx0ZGVmYXVsdENoYXQsXG5cdFx0XHRcdGNoYXRzOiBbXG5cdFx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdFx0eyAuLi5tYWtlQ2hhdFN1bW1hcnkoc3ViYWdlbnRDaGF0LCAnQ29kZSBSZXZpZXdlcicpLCBvcmlnaW46IHsga2luZDogUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBkZWZhdWx0Q2hhdCwgdG9vbENhbGxJZDogJ3RjLTEnIH0sIGludGVyYWN0aXZpdHk6IFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHkgfSxcblx0XHRcdFx0XHR7IC4uLm1ha2VDaGF0U3VtbWFyeSh1c2VyUGVlciwgJ1VzZXIgUGVlcicpLCBvcmlnaW46IHsga2luZDogUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjaGF0cyA9IHNlc3Npb24hLmNoYXRzLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogc2Vzc2lvbiEuY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyxcblx0XHRcdFx0dGl0bGVzOiBjaGF0cy5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdFx0aW50ZXJhY3Rpdml0eTogY2hhdHMubWFwKGMgPT4gYy5pbnRlcmFjdGl2aXR5LmdldCgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSxcblx0XHRcdFx0Ly8gVGhlIHVzZXIgcGVlciBpcyBub3Qgc3VyZmFjZWQgKG5vIG11bHRpLWNoYXQgc3VwcG9ydCk7IHRoZSBzdWJhZ2VudCBpcy5cblx0XHRcdFx0dGl0bGVzOiBbJ0NsYXVkZScsICdDb2RlIFJldmlld2VyJ10sXG5cdFx0XHRcdGludGVyYWN0aXZpdHk6IFtDaGF0SW50ZXJhY3Rpdml0eS5GdWxsLCBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgbmV3IHBlZXIgY2hhdCBpcyBwcmVzZW50ZWQgYXMgVW50aXRsZWQgdW50aWwgaXRzIGZpcnN0IHJlcXVlc3QgaXMgc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktbmV3Jyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1uZXcnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHQoc2Vzc2lvbiBhcyBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlcikubWFya0NoYXRBc05ldygncGVlci0xJyk7XG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1uZXcnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgcGVlciA9ICgpID0+IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09ICdwZWVyLTEnKTtcblx0XHRcdGNvbnN0IHdoaWxlTmV3ID0gcGVlcigpIS5zdGF0dXMuZ2V0KCk7XG5cblx0XHRcdChzZXNzaW9uIGFzIEFnZW50SG9zdFNlc3Npb25BZGFwdGVyKS5tYXJrQ2hhdEFzU2VudCgncGVlci0xJyk7XG5cdFx0XHRjb25zdCBhZnRlclNlbnQgPSBwZWVyKCkhLnN0YXR1cy5nZXQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHdoaWxlTmV3LCBhZnRlclNlbnQgfSwge1xuXHRcdFx0XHR3aGlsZU5ldzogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCxcblx0XHRcdFx0YWZ0ZXJTZW50OiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBwZWVyIGNhdGFsb2cgY29sbGFwc2VkIHdoaWxlIGNhcGFiaWxpdGllcyB3ZXJlIGFic2VudCByZS1leHBhbmRzIHdoZW4gdGhleSBoeWRyYXRlJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGUgdGhlIHJhY2Ugd2hlcmUgYSBtdWx0aS1jaGF0IFNlc3Npb25TdGF0ZSBpcyBwcm9jZXNzZWQgYmVmb3JlXG5cdFx0XHQvLyB0aGUgYWdlbnQgaG9zdCdzIHJvb3Qgc3RhdGUgYWR2ZXJ0aXNlcyBgc3VwcG9ydHNNdWx0aXBsZUNoYXRzYC5cblx0XHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW3sgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdLCBjYXBhYmlsaXRpZXM6IHt9IH0gYXMgQWdlbnRJbmZvXSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktbGF0ZS1jYXBzJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1sYXRlLWNhcHMnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1sYXRlLWNhcHMnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0ge1xuXHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyxcblx0XHRcdFx0Y2hhdEZyYWdtZW50czogc2Vzc2lvbi5jaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50KSxcblx0XHRcdH07XG5cblx0XHRcdC8vIENhcGFiaWxpdGllcyBoeWRyYXRlIGxhdGU7IHRoZSBjYXRhbG9nIG11c3QgcmUtZXhwYW5kIHdpdGhvdXQgYW5vdGhlclxuXHRcdFx0Ly8gc2Vzc2lvbi1zdGF0ZSB1cGRhdGUuXG5cdFx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFt7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSwgY2FwYWJpbGl0aWVzOiB7IG11bHRpcGxlQ2hhdHM6IHsgZm9yazogdHJ1ZSB9IH0gfSBhcyBBZ2VudEluZm9dKTtcblxuXHRcdFx0Y29uc3QgaHlkcmF0ZWQgPSB7XG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLFxuXHRcdFx0XHRjaGF0RnJhZ21lbnRzOiBzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQpLFxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbGxhcHNlZCwgaHlkcmF0ZWQgfSwge1xuXHRcdFx0XHRjb2xsYXBzZWQ6IHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgY2hhdEZyYWdtZW50czogWycnXSB9LFxuXHRcdFx0XHRoeWRyYXRlZDogeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUsIGNoYXRGcmFnbWVudHM6IFsnJywgJ3BlZXItMSddIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcmtDaGF0IGZvcndhcmRzIHRoZSBzb3VyY2UgY2hhdCBhbmQgdHVybiB0byB0aGUgaG9zdCBhbmQgc3VyZmFjZXMgYSBuZXcgcGVlciBjaGF0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLWZvcmsnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLWZvcmsnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1mb3JrJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBmb3JrZWQgPSBhd2FpdCBwcm92aWRlci5mb3JrQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvbi5yZXNvdXJjZSwgJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBjYWxsID0gYWdlbnRIb3N0LmNyZWF0ZWRDaGF0cy5hdCgtMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zm9ya1NvdXJjZTogY2FsbD8ub3B0aW9ucz8uZm9yaz8uc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGZvcmtUdXJuSWQ6IGNhbGw/Lm9wdGlvbnM/LmZvcms/LnR1cm5JZCxcblx0XHRcdFx0Zm9ya2VkSXNQZWVyOiAhIWZvcmtlZC5yZXNvdXJjZS5mcmFnbWVudCxcblx0XHRcdFx0Zm9ya2VkSW5DYXRhbG9nOiBzZXNzaW9uLmNoYXRzLmdldCgpLnNvbWUoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGZvcmtlZC5yZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zm9ya1NvdXJjZTogZGVmYXVsdENoYXQsXG5cdFx0XHRcdGZvcmtUdXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRmb3JrZWRJc1BlZXI6IHRydWUsXG5cdFx0XHRcdGZvcmtlZEluQ2F0YWxvZzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2NyZWF0ZVNpZGVDaGF0IGZvcndhcmRzIHRoZSBzb3VyY2UgY2hhdCBhbmQgdHVybiB0byB0aGUgaG9zdCBhbmQgc3VyZmFjZXMgYSBuZXcgcGVlciBjaGF0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFt7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSwgY2FwYWJpbGl0aWVzOiB7IG11bHRpcGxlQ2hhdHM6IHsgZm9yazogdHJ1ZSwgc2lkZUNoYXQ6IHRydWUgfSB9IH0gYXMgQWdlbnRJbmZvXSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXNpZGUtY2hhdCcpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktc2lkZS1jaGF0JykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktc2lkZS1jaGF0JywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNTaWRlQ2hhdCwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHsgdGV4dDogJyAgc2VsZWN0ZWQgdGV4dCAgJyB9O1xuXHRcdFx0Y29uc3Qgc2lkZUNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVTaWRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvbi5yZXNvdXJjZSwgJ3R1cm4tMScsIHNlbGVjdGlvbik7XG5cblx0XHRcdGNvbnN0IGNhbGwgPSBhZ2VudEhvc3QuY3JlYXRlZENoYXRzLmF0KC0xKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzaWRlQ2hhdFNvdXJjZTogY2FsbD8ub3B0aW9ucz8uc2lkZUNoYXQ/LnNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRzaWRlQ2hhdFR1cm5JZDogY2FsbD8ub3B0aW9ucz8uc2lkZUNoYXQ/LnR1cm5JZCxcblx0XHRcdFx0c2lkZUNoYXRTZWxlY3Rpb246IGNhbGw/Lm9wdGlvbnM/LnNpZGVDaGF0Py5zZWxlY3Rpb24sXG5cdFx0XHRcdHNpZGVDaGF0SXNQZWVyOiAhIXNpZGVDaGF0LnJlc291cmNlLmZyYWdtZW50LFxuXHRcdFx0XHRzaWRlQ2hhdEluQ2F0YWxvZzogc2Vzc2lvbi5jaGF0cy5nZXQoKS5zb21lKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSBzaWRlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2lkZUNoYXRTb3VyY2U6IGRlZmF1bHRDaGF0LFxuXHRcdFx0XHRzaWRlQ2hhdFR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHNpZGVDaGF0U2VsZWN0aW9uOiBzZWxlY3Rpb24sXG5cdFx0XHRcdHNpZGVDaGF0SXNQZWVyOiB0cnVlLFxuXHRcdFx0XHRzaWRlQ2hhdEluQ2F0YWxvZzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2NyZWF0ZVNpZGVDaGF0IGluaGVyaXRzIG1vZGVsIGFuZCBhZ2VudCBzZWxlY3Rpb24gZnJvbSB0aGUgc291cmNlIHBlZXIgY2hhdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10sIGNhcGFiaWxpdGllczogeyBtdWx0aXBsZUNoYXRzOiB7IGZvcms6IHRydWUsIHNpZGVDaGF0OiB0cnVlIH0gfSB9IGFzIEFnZW50SW5mb10pO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Rlc3QuYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBpbnB1dFN0YXRlczogeyByZXNvdXJjZTogc3RyaW5nOyBzdGF0ZTogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT4gfVtdID0gW107XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBjcmVhdGVUZXN0TGFuZ3VhZ2VNb2RlbCxcblx0XHRcdFx0YWNxdWlyZU9yTG9hZFNlc3Npb246IGFzeW5jIHJlc291cmNlID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbnB1dE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5wdXRNb2RlbD4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IGNvbnN0T2JzZXJ2YWJsZTxJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHNldFN0YXRlKHN0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPik6IHZvaWQge1xuXHRcdFx0XHRcdFx0XHRpbnB1dFN0YXRlcy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgY2xlYXJTdGF0ZSgpOiB2b2lkIHsgfVxuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgdG9KU09OKCk6IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlucHV0TW9kZWwgPSBpbnB1dE1vZGVsO1xuXHRcdFx0XHRcdH0oKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0b2JqZWN0OiBjaGF0TW9kZWwsXG5cdFx0XHRcdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0TW9kZWxSZWZlcmVuY2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1zaWRlLWNoYXQtcGVlci1zZWxlY3Rpb24nKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLXNpZGUtY2hhdC1wZWVyLXNlbGVjdGlvbicpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1zaWRlLWNoYXQtcGVlci1zZWxlY3Rpb24nLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgcGVlciA9IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09ICdwZWVyLTEnKTtcblx0XHRcdGFzc2VydC5vayhwZWVyKTtcblx0XHRcdGFjdGl2ZVNlc3Npb24uc2V0KHsgc2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCwgYWN0aXZlQ2hhdDogY29uc3RPYnNlcnZhYmxlKHBlZXIhKSB9IGFzIElBY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbi5zZXNzaW9uSWQsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6cGVlci1tb2RlbCcpO1xuXHRcdFx0cHJvdmlkZXIuc2V0QWdlbnQ/LihzZXNzaW9uLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3BlZXInLCBuYW1lOiAncGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IHNpZGVDaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlU2lkZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHBlZXIhLnJlc291cmNlLCAndHVybi0xJyk7XG5cdFx0XHRjb25zdCBjYWxsID0gYWdlbnRIb3N0LmNyZWF0ZWRDaGF0cy5hdCgtMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzaWRlQ2hhdFNvdXJjZTogY2FsbD8ub3B0aW9ucz8uc2lkZUNoYXQ/LnNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjcmVhdGVkTW9kZWw6IGNhbGw/Lm9wdGlvbnM/Lm1vZGVsLFxuXHRcdFx0XHRwZWVySW5wdXRTZWxlY3RlZE1vZGVsczogaW5wdXRTdGF0ZXNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnJlc291cmNlID09PSBzaWRlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpKVxuXHRcdFx0XHRcdC5tYXAoZW50cnkgPT4gZW50cnkuc3RhdGUuc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcilcblx0XHRcdFx0XHQuZmlsdGVyKChpZCk6IGlkIGlzIHN0cmluZyA9PiBpZCAhPT0gdW5kZWZpbmVkKSxcblx0XHRcdFx0cGVlcklucHV0TW9kZXM6IGlucHV0U3RhdGVzXG5cdFx0XHRcdFx0LmZpbHRlcihlbnRyeSA9PiBlbnRyeS5yZXNvdXJjZSA9PT0gc2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSlcblx0XHRcdFx0XHQubWFwKGVudHJ5ID0+IGVudHJ5LnN0YXRlLm1vZGU/LmlkKVxuXHRcdFx0XHRcdC5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IGlkICE9PSB1bmRlZmluZWQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzaWRlQ2hhdFNvdXJjZTogcGVlckNoYXQsXG5cdFx0XHRcdGNyZWF0ZWRNb2RlbDogeyBpZDogJ3BlZXItbW9kZWwnIH0sXG5cdFx0XHRcdHBlZXJJbnB1dFNlbGVjdGVkTW9kZWxzOiBbJ2FnZW50LWhvc3QtY29waWxvdGNsaTpwZWVyLW1vZGVsJ10sXG5cdFx0XHRcdHBlZXJJbnB1dE1vZGVzOiBbJ2FnZW50Oi8vcGVlciddLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2lkZUNoYXQgcmVqZWN0cyB3aGVuIHRoZSBzZXNzaW9uIGNhcGFiaWxpdHkgaXMgbm90IGFkdmVydGlzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXNpZGUtY2hhdC11bnN1cHBvcnRlZCcpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBwcm92aWRlci5jcmVhdGVTaWRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvbi5yZXNvdXJjZSwgJ3R1cm4tMScpLCAvZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVOZXdDaGF0IGZvcndhcmRzIHRoZSBzZWxlY3RlZCBtb2RlbCB0byB0aGUgaG9zdCBhbmQgc2VlZHMgdGhlIGNoYXQgaW5wdXQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dFN0YXRlczogeyByZXNvdXJjZTogc3RyaW5nOyBzdGF0ZTogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT4gfVtdID0gW107XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBjcmVhdGVUZXN0TGFuZ3VhZ2VNb2RlbCxcblx0XHRcdFx0YWNxdWlyZU9yTG9hZFNlc3Npb246IGFzeW5jIHJlc291cmNlID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbnB1dE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5wdXRNb2RlbD4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IGNvbnN0T2JzZXJ2YWJsZTxJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHNldFN0YXRlKHN0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPik6IHZvaWQge1xuXHRcdFx0XHRcdFx0XHRpbnB1dFN0YXRlcy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgY2xlYXJTdGF0ZSgpOiB2b2lkIHsgfVxuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgdG9KU09OKCk6IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlucHV0TW9kZWwgPSBpbnB1dE1vZGVsO1xuXHRcdFx0XHRcdH0oKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0b2JqZWN0OiBjaGF0TW9kZWwsXG5cdFx0XHRcdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0TW9kZWxSZWZlcmVuY2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1tb2RlbCcpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktbW9kZWwnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktbW9kZWwnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24uc2Vzc2lvbklkLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnNlbGVjdGVkLW1vZGVsJyk7XG5cblx0XHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNyZWF0ZWRNb2RlbDogYWdlbnRIb3N0LmNyZWF0ZWRDaGF0cy5hdCgtMSk/Lm9wdGlvbnM/Lm1vZGVsLFxuXHRcdFx0XHRwZWVySW5wdXRTZWxlY3RlZE1vZGVsczogaW5wdXRTdGF0ZXNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnJlc291cmNlID09PSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpXG5cdFx0XHRcdFx0Lm1hcChlbnRyeSA9PiBlbnRyeS5zdGF0ZS5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyKVxuXHRcdFx0XHRcdC5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IGlkICE9PSB1bmRlZmluZWQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjcmVhdGVkTW9kZWw6IHsgaWQ6ICdzZWxlY3RlZC1tb2RlbCcgfSxcblx0XHRcdFx0cGVlcklucHV0U2VsZWN0ZWRNb2RlbHM6IFsnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnNlbGVjdGVkLW1vZGVsJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRSZXF1ZXN0IGtlZXBzIGEgcGVlciBjaGF0IG1vZGVsIGxvYWRlZCB3aGlsZSBkaXNwYXRjaGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxvYWRlZFJlc291cmNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgZGlzcG9zZWRSZXNvdXJjZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZW5kU2F3TG9hZGVkOiBib29sZWFuW10gPSBbXTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGFjcXVpcmVPckxvYWRTZXNzaW9uOiBhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2VLZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdGxvYWRlZFJlc291cmNlcy5hZGQocmVzb3VyY2VLZXkpO1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElJbnB1dE1vZGVsPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gY29uc3RPYnNlcnZhYmxlPElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgc2V0U3RhdGUoX3N0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPik6IHZvaWQgeyB9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBjbGVhclN0YXRlKCk6IHZvaWQgeyB9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSB0b0pTT04oKTogdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRcdH0oKTtcblx0XHRcdFx0XHRjb25zdCBjaGF0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0TW9kZWw+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5wdXRNb2RlbCA9IGlucHV0TW9kZWw7XG5cdFx0XHRcdFx0fSgpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRvYmplY3Q6IGNoYXRNb2RlbCxcblx0XHRcdFx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdFx0XHRcdGxvYWRlZFJlc291cmNlcy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NlZFJlc291cmNlcy5wdXNoKHJlc291cmNlS2V5KTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRNb2RlbFJlZmVyZW5jZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChyZXNvdXJjZSk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+IHtcblx0XHRcdFx0XHRzZW5kU2F3TG9hZGVkLnB1c2gobG9hZGVkUmVzb3VyY2VzLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBDaGF0U2VuZFJlc3VsdCBleHRlbmRzIHsga2luZDogJ3NlbnQnOyBkYXRhOiBpbmZlciBEIH0gPyBEIDogbmV2ZXIgfTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXNlbmQtcGVlcicpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktc2VuZC1wZWVyJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXNlbmQtcGVlcicsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXHRcdFx0Y29uc3QgcGVlciA9IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09ICdwZWVyLTEnKTtcblx0XHRcdGFzc2VydC5vayhwZWVyKTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIHBlZXIucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZW5kU2F3TG9hZGVkLFxuXHRcdFx0XHRsb2FkZWRSZXNvdXJjZXM6IFsuLi5sb2FkZWRSZXNvdXJjZXNdLFxuXHRcdFx0XHRkaXNwb3NlZFJlc291cmNlcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VuZFNhd0xvYWRlZDogW3RydWVdLFxuXHRcdFx0XHRsb2FkZWRSZXNvdXJjZXM6IFtdLFxuXHRcdFx0XHRkaXNwb3NlZFJlc291cmNlczogW3BlZXIucmVzb3VyY2UudG9TdHJpbmcoKV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldE1vZGVsIHVwZGF0ZXMgdGhlIGFjdGl2ZSBwZWVyIGNoYXQgbW9kZWwgd2l0aG91dCBjaGFuZ2luZyB0aGUgZGVmYXVsdCBjaGF0IG1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Rlc3QuYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLWFjdGl2ZS1tb2RlbCcpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktYWN0aXZlLW1vZGVsJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLWFjdGl2ZS1tb2RlbCcsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBwZWVyID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCA9PT0gJ3BlZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlZXIpO1xuXHRcdFx0YWN0aXZlU2Vzc2lvbi5zZXQoeyBzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLCBhY3RpdmVDaGF0OiBjb25zdE9ic2VydmFibGUocGVlciEpIH0gYXMgSUFjdGl2ZVNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24uc2Vzc2lvbklkLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnBlZXItbW9kZWwnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGRlZmF1bHRNb2RlbElkOiBzZXNzaW9uLm1haW5DaGF0LmdldCgpLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHRcdHBlZXJNb2RlbElkOiBwZWVyIS5tb2RlbElkLmdldCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRkZWZhdWx0TW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZWVyTW9kZWxJZDogJ2FnZW50LWhvc3QtY29waWxvdGNsaTpwZWVyLW1vZGVsJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlQ2hhdCBwcm9tcHRzIGZvciBjb25maXJtYXRpb24gYW5kIGRpc3Bvc2VzIHRoZSBwZWVyIGNoYXQgd2hlbiBjb25maXJtZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpcm1EZWxldGU6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktZGVsJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1kZWwnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1kZWwnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0Y29uc3QgcGVlciA9IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09ICdwZWVyLTEnKTtcblx0XHRcdGFzc2VydC5vayhwZWVyKTtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHBlZXIhLnJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcG9zZWRDaGF0cy5tYXAodSA9PiB1LnRvU3RyaW5nKCkpLCBbcGVlckNoYXRdKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdkZWxldGVDaGF0IGRvZXMgbm90IGRpc3Bvc2UgdGhlIHBlZXIgY2hhdCB3aGVuIHRoZSBjb25maXJtYXRpb24gaXMgY2FuY2VsbGVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maXJtRGVsZXRlOiBmYWxzZSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1kZWwtY2FuY2VsJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1kZWwtY2FuY2VsJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktZGVsLWNhbmNlbCcsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBwZWVyID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCA9PT0gJ3BlZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlZXIpO1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgcGVlciEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwb3NlZENoYXRzLCBbXSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnc2luZ2xlLWNoYXQgY2F0YWxvZyBkZWdyYWRlcyB0byB0aGUgZGVmYXVsdCBjaGF0IG9ubHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXNpbmdsZScpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktc2luZ2xlJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktc2luZ2xlJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdENvdW50OiBzZXNzaW9uLmNoYXRzLmdldCgpLmxlbmd0aCxcblx0XHRcdFx0bWFpbklzT25seUNoYXQ6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkgPT09IHNlc3Npb24uY2hhdHMuZ2V0KClbMF0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNoYXRDb3VudDogMSxcblx0XHRcdFx0bWFpbklzT25seUNoYXQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92aW5nIGEgcGVlciBmcm9tIHRoZSBjYXRhbG9nIGRyb3BzIGl0IGJhY2sgdG8gdGhlIGRlZmF1bHQgY2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktcmVtb3ZlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1yZW1vdmUnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1yZW1vdmUnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblx0XHRcdGNvbnN0IGFmdGVyQWRkID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5sZW5ndGg7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXJlbW92ZScsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFmdGVyQWRkLFxuXHRcdFx0XHRhZnRlclJlbW92ZTogc2Vzc2lvbi5jaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWZ0ZXJBZGQ6IDIsXG5cdFx0XHRcdGFmdGVyUmVtb3ZlOiBbJyddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IGNoYXQgdGl0bGUgZGl2ZXJnZXMgZnJvbSB0aGUgc2Vzc2lvbiB0aXRsZSB3aGVuIHJlbmFtZWQgaW4gdGhlIGNhdGFsb2cnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXRpdGxlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS10aXRsZScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXRpdGxlJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICdSZW5hbWVkIERlZmF1bHQnKSxcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KHBlZXJDaGF0LCAnUGVlcicpLFxuXHRcdFx0XSwgeyBzZXNzaW9uVGl0bGU6ICdTZXNzaW9uJywgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2Vzc2lvblRpdGxlOiBzZXNzaW9uLnRpdGxlLmdldCgpLFxuXHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiBzZXNzaW9uLm1haW5DaGF0LmdldCgpLnRpdGxlLmdldCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXNzaW9uVGl0bGU6ICdTZXNzaW9uJyxcblx0XHRcdFx0ZGVmYXVsdENoYXRUaXRsZTogJ1JlbmFtZWQgRGVmYXVsdCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBUaXRsZSBjaGFuZ2UgZnJvbSBzZXJ2ZXIgLS0tLS0tLVxuXG5cdHRlc3QoJ3NlcnZlci1lY2hvZWQgU2Vzc2lvblRpdGxlQ2hhbmdlZCB1cGRhdGVzIGNhY2hlZCB0aXRsZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnZWNoby1zZXNzJywgeyB0aXRsZTogJ09yaWdpbmFsJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBzZXNzaW9ucy5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ09yaWdpbmFsJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0YWdlbnRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdlY2hvLXNlc3MnKS50b1N0cmluZygpLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0dGl0bGU6ICdTZXJ2ZXIgVGl0bGUnLFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCEudGl0bGUuZ2V0KCksICdTZXJ2ZXIgVGl0bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzBdLmNoYW5nZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmVyLWVjaG9lZCBDaGF0VHVyblN0YXJ0ZWQgbW9kZWwgZG9lcyBub3QgdXBkYXRlIGNhY2hlZCBzZXNzaW9uIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdtb2RlbC1jaGFuZ2UnLCB7IHRpdGxlOiAnTW9kZWwgQ2hhbmdlJyB9KTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdNb2RlbCBDaGFuZ2UnKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0KTtcblx0XHRwcm92aWRlci5zZXRNb2RlbCh0YXJnZXQhLnNlc3Npb25JZCwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvbGQtbW9kZWwnKTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhZ2VudEhvc3QuZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ21vZGVsLWNoYW5nZScpLnRvU3RyaW5nKCksXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgbW9kZWw6IHsgaWQ6ICduZXctbW9kZWwnIH0gfSxcblx0XHRcdH0sXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHR9IGFzIEFjdGlvbkVudmVsb3BlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQhLm1vZGVsSWQuZ2V0KCksICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6b2xkLW1vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBSZWZyZXNoIG9uIHR1cm5Db21wbGV0ZSAtLS0tLS0tXG5cblx0dGVzdCgndHVybkNvbXBsZXRlIGFjdGlvbiB0cmlnZ2VycyBzZXNzaW9uIHJlZnJlc2gnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCd0dXJuLXNlc3MnLCB7IHN1bW1hcnk6ICdCZWZvcmUnLCBtb2RpZmllZFRpbWU6IDEwMDAgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBVcGRhdGUgb24gY29ubmVjdGlvbiBzaWRlXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigndHVybi1zZXNzJywgeyBzdW1tYXJ5OiAnQWZ0ZXInLCBtb2RpZmllZFRpbWU6IDUwMDAgfSkpO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICd0dXJuLXNlc3MnKS50b1N0cmluZygpKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhjaGFuZ2VzLmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IHVwZGF0ZWRTZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0FmdGVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHVwZGF0ZWRTZXNzaW9uKTtcblx0fSkpO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBkYXRhIGFkYXB0ZXIgLS0tLS0tLVxuXG5cdHRlc3QoJ3Nlc3Npb24gYWRhcHRlciBoYXMgY29ycmVjdCB3b3Jrc3BhY2UgZnJvbSB3b3JraW5nIGRpcmVjdG9yeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3dzLXNlc3MnLCB7IHN1bW1hcnk6ICdXUyBUZXN0Jywgd29ya2luZ0RpcmVjdG9yeTogVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9teXJlcG8nKSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCB3c1Nlc3Npb24gPSBzZXNzaW9ucy5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1dTIFRlc3QnKTtcblx0XHRhc3NlcnQub2sod3NTZXNzaW9uKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHdzU2Vzc2lvbiEud29ya3NwYWNlLmdldCgpO1xuXHRcdGFzc2VydC5vayh3b3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2UhLmxhYmVsLCAnbXlyZXBvJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXNzaW9uIGFkYXB0ZXIgd2l0aG91dCB3b3JraW5nIGRpcmVjdG9yeSBoYXMgbm8gd29ya3NwYWNlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignbm8td3Mtc2VzcycsIHsgc3VtbWFyeTogJ05vIFdTJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdObyBXUycpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbiEud29ya3NwYWNlLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBhZGFwdGVyIHVzZXMgcmF3IElEIGFzIGZhbGxiYWNrIHRpdGxlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignYWJjZGVmMTIzNDU2Nzg5MCcpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1swXTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udGl0bGUuZ2V0KCksICdTZXNzaW9uIGFiY2RlZjEyJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCduZXcgc2Vzc2lvbiBzdGF5cyBsb2FkaW5nIHdoZW4gcmVxdWlyZWQgY29uZmlnIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCByZXF1aXJlZDogWydicmFuY2gnXSwgcHJvcGVydGllczogeyBicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgZW51bTogWydtYWluJ10gfSB9IH0sXG5cdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnNjaGVtYS5yZXF1aXJlZD8uaW5jbHVkZXMoJ2JyYW5jaCcpID09PSB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmxvYWRpbmcuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYWNoZWQgc2Vzc2lvbiBsb2FkaW5nIHJlZmxlY3RzIGF1dGhlbnRpY2F0aW9uUGVuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NhY2hlZC1hdXRoLWxvYWRpbmcnLCB7IHN1bW1hcnk6ICdDYWNoZWQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdDYWNoZWQnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24hLmxvYWRpbmcuZ2V0KCksIHRydWUpO1xuXG5cdFx0YWdlbnRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24hLmxvYWRpbmcuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbmV3IHNlc3Npb24gZGVmZXJzIGJhY2tlbmQgc3RhcnR1cCB1bnRpbCBhdXRoZW50aWNhdGlvbiBzZXR0bGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBXaGlsZSBhdXRoIGlzIHBlbmRpbmcsIGNvbmZpZy9iYWNrZW5kIHdvcmsgaXMgaW50ZW50aW9uYWxseSBkZWZlcnJlZC5cblx0XHQvLyBQcm92aWRlcnMgc3VjaCBhcyBDb2RleCByZWplY3QgdGhvc2UgY2FsbHMgd2l0aCBBdXRoUmVxdWlyZWQgYmVmb3JlIHRoZVxuXHRcdC8vIGZpcnN0IGF1dGggcGFzcyBzZXR0bGVzLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZGluZzogc2Vzc2lvbi5sb2FkaW5nLmdldCgpLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiBhZ2VudEhvc3QuY3JlYXRlZFNlc3Npb25VcmlzLmxlbmd0aCxcblx0XHRcdHJlc29sdmVSZXF1ZXN0czogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0Y29uZmlnOiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHR9LCB7XG5cdFx0XHRsb2FkaW5nOiB0cnVlLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiAwLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiAwLFxuXHRcdFx0Y29uZmlnOiB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiB7fSB9LFxuXHRcdH0pO1xuXG5cdFx0YWdlbnRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjb25maWcgPT4gY29uZmlnPy52YWx1ZXMuaXNvbGF0aW9uID09PSAnd29ya3RyZWUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZGluZzogc2Vzc2lvbi5sb2FkaW5nLmdldCgpLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiBhZ2VudEhvc3QuY3JlYXRlZFNlc3Npb25VcmlzLmxlbmd0aCxcblx0XHRcdHJlc29sdmVSZXF1ZXN0czogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0Y29uZmlnOiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHR9LCB7XG5cdFx0XHRsb2FkaW5nOiBmYWxzZSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogMSxcblx0XHRcdHJlc29sdmVSZXF1ZXN0czogMSxcblx0XHRcdGNvbmZpZzogeyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgc2Vzc2lvbiBzdGF5cyBsb2FkaW5nIGFmdGVyIGF1dGhlbnRpY2F0aW9uIHNldHRsZXMgd2hlbiByZXF1aXJlZCBjb25maWcgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcmVxdWlyZWQ6IFsnYnJhbmNoJ10sIHByb3BlcnRpZXM6IHsgYnJhbmNoOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0JyYW5jaCcsIGVudW06IFsnbWFpbiddIH0gfSB9LFxuXHRcdFx0dmFsdWVzOiB7fSxcblx0XHR9O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb2FkaW5nOiBzZXNzaW9uLmxvYWRpbmcuZ2V0KCksXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IGFnZW50SG9zdC5jcmVhdGVkU2Vzc2lvblVyaXMubGVuZ3RoLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdGxvYWRpbmc6IHRydWUsXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IDAsXG5cdFx0XHRyZXNvbHZlUmVxdWVzdHM6IDAsXG5cdFx0XHRjb25maWc6IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH0sXG5cdFx0fSk7XG5cblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnNjaGVtYS5yZXF1aXJlZD8uaW5jbHVkZXMoJ2JyYW5jaCcpID09PSB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZGluZzogc2Vzc2lvbi5sb2FkaW5nLmdldCgpLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiBhZ2VudEhvc3QuY3JlYXRlZFNlc3Npb25VcmlzLmxlbmd0aCxcblx0XHRcdHJlc29sdmVSZXF1ZXN0czogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0Y29uZmlnOiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHR9LCB7XG5cdFx0XHRsb2FkaW5nOiB0cnVlLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiAxLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiAxLFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcmVxdWlyZWQ6IFsnYnJhbmNoJ10sIHByb3BlcnRpZXM6IHsgYnJhbmNoOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0JyYW5jaCcsIGVudW06IFsnbWFpbiddIH0gfSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBzZW5kUmVxdWVzdCAtLS0tLS0tXG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgdGhyb3dzIGZvciB1bmtub3duIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KCdub25leGlzdGVudCcsIFVSSS5wYXJzZSgndW50aXRsZWQ6Y2hhdCcpLCB7IHF1ZXJ5OiAndGVzdCcgfSksXG5cdFx0XHQvbm90IGZvdW5kLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCBvbmx5IGNvbW1pdHMgYSBzZXNzaW9uIG9mIHRoZSBzYW1lIHR5cGUsIGlnbm9yaW5nIGEgZm9yZWlnbi10eXBlIHNlc3Npb24gdGhhdCBhcHBlYXJzIG1pZC1zZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gdGVzdDogdGhlIGxvY2FsIGFnZW50IGhvc3QgcnVucyBhIHNpbmdsZSBwcm92aWRlciB3aG9zZVxuXHRcdC8vIHNlc3Npb24gY2FjaGUgaG9sZHMgZXZlcnkgYWdlbnQtaG9zdCBzZXNzaW9uIHR5cGUgKGNvZGV4LCBjbGF1ZGUsXG5cdFx0Ly8gY29waWxvdCkuIFdoZW4gYSBzbG93IHNlc3Npb24gKGUuZy4gY29kZXggY29sZCBzdGFydCkgaXMgc2VudCB3aGlsZSBhXG5cdFx0Ly8gc2Vzc2lvbiBvZiBhIERJRkZFUkVOVCB0eXBlIGFwcGVhcnMgaW4gdGhlIGNhY2hlLCBgX3dhaXRGb3JOZXdTZXNzaW9uYFxuXHRcdC8vIG11c3Qgbm90IGxhdGNoIG9udG8gdGhhdCBmb3JlaWduIHNlc3Npb24gYW5kIHJldHVybiBpdCBhcyB0aGUgY29kZXhcblx0XHQvLyBjb21taXQgXHUyMDE0IG90aGVyd2lzZSB0aGUgYWN0aXZlIHNlc3Npb24gaXMgc3dhcHBlZCB0byB0aGUgd3JvbmcgdHlwZS5cblx0XHRjb25zdCBjb2RleEFuZENsYXVkZSA9IFtcblx0XHRcdHsgdHlwZTogJ2FnZW50LWhvc3QtY29kZXgnLCBuYW1lOiAnY29kZXgnLCBkaXNwbGF5TmFtZTogJ0NvZGV4JywgZGVzY3JpcHRpb246ICd0ZXN0JywgaWNvbjogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHR5cGU6ICdhZ2VudC1ob3N0LWNsYXVkZScsIG5hbWU6ICdjbGF1ZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAndGVzdCcsIGljb246IHVuZGVmaW5lZCB9LFxuXHRcdF07XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29kZXgnLCBkaXNwbGF5TmFtZTogJ0NvZGV4JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkU2V0dGluZ0lkLCB0cnVlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIGNvZGV4QW5kQ2xhdWRlLCB7XG5cdFx0XHRvcGVuU2Vzc2lvbjogdHJ1ZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiB7XG5cdFx0XHRcdC8vIFdoaWxlIHRoZSBjb2RleCBzZW5kIGlzIGluIGZsaWdodCwgYSBmb3JlaWduLXR5cGUgKGNsYXVkZSlcblx0XHRcdFx0Ly8gc2Vzc2lvbiBzaG93cyB1cCBpbiB0aGUgaG9zdCdzIGxpc3QgKGUuZy4gcmVzdG9yZWQgZnJvbSBhblxuXHRcdFx0XHQvLyBlYXJsaWVyIHJ1biksIGFuZCB0aGUgcmVhbCBjb2RleCBzZXNzaW9uIGFsc28gY29tbWl0cy5cblx0XHRcdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignZm9yZWlnbi1jbGF1ZGUnLCB7IHByb3ZpZGVyOiAnY2xhdWRlJywgc3VtbWFyeTogJ0ZvcmVpZ24gQ2xhdWRlJyB9KSk7XG5cdFx0XHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3JlYWwtY29kZXgnLCB7IHByb3ZpZGVyOiAnY29kZXgnLCBzdW1tYXJ5OiAnUmVhbCBDb2RleCcgfSkpO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCAnY29kZXgnKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY29tbWl0dGVkID0gYXdhaXQgcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWl0dGVkLnJlc291cmNlLnNjaGVtZSwgJ2FnZW50LWhvc3QtY29kZXgnLCBgZXhwZWN0ZWQgdGhlIGNvbW1pdHRlZCBzZXNzaW9uIHRvIGJlIHRoZSBjb2RleCBzZXNzaW9uLCBnb3QgJHtjb21taXR0ZWQucmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3Qgd2FpdHMgYmV5b25kIDMwIHNlY29uZHMgZm9yIHRoZSBiYWNrZW5kIHNlc3Npb24gdG8gY29tbWl0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDMwXzAwMSk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCwgeyBzdW1tYXJ5OiAnQ29tbWl0dGVkIExhdGUnIH0pKTtcblx0XHRhZ2VudEhvc3QuZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCBzZXNzaW9uLnNlc3Npb25JZCkudG9TdHJpbmcoKSksXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlIH0sXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHR9IGFzIEFjdGlvbkVudmVsb3BlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgY29tbWl0dGVkID0gYXdhaXQgcmVxdWVzdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWl0dGVkLnRpdGxlLmdldCgpLCAnQ29tbWl0dGVkIExhdGUnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IHJlamVjdHMgd2hlbiB0aGUgcHJvdmlzaW9uYWwgc2Vzc2lvbiBpcyBhYmFuZG9uZWQgYmVmb3JlIGNvbW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0b3BlblNlc3Npb246IHRydWUsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHJlamVjdGlvbiA9IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0cHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSksXG5cdFx0XHQvc2Vzc2lvbiB3YXMgbm90IGNvbW1pdHRlZC8sXG5cdFx0KTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0cHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXdhaXQgcmVqZWN0aW9uO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRhZGRlZDogY2hhbmdlLmFkZGVkLm1hcChzZXNzaW9uID0+IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRyZW1vdmVkOiBjaGFuZ2UucmVtb3ZlZC5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBhZGRlZDogW3Nlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKV0sIHJlbW92ZWQ6IFtdIH0sXG5cdFx0XHR7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKV0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGNvbmN1cnJlbnQgc2FtZS10eXBlIG5ldy1zZXNzaW9uIHNlbmRzIGVhY2ggY29tbWl0IHRvIHRoZWlyIG93biBzZXNzaW9uIChubyBzd2FwIGR1cmluZyBhIHNoYXJlZCBkb3dubG9hZCB3aW5kb3cpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IHdoZW4gdGhlIGZpcnN0IHNlbmQgb2YgYSBzZXNzaW9uIHR5cGUgdHJpZ2dlcnMgYSBsZW5ndGh5XG5cdFx0Ly8gYnJpbmctdXAgKGUuZy4gdGhlIENsYXVkZSBTREsgZG93bmxvYWQpIGFuZCBhIFNFQ09ORCBzZXNzaW9uIG9mIHRoZVxuXHRcdC8vIHNhbWUgdHlwZSBpcyBzdGFydGVkIGFuZCBzZW50IGJlZm9yZSBpdCBmaW5pc2hlcywgYm90aCBzZW5kcyBwYXJrIGluXG5cdFx0Ly8gYF93YWl0Rm9yTmV3U2Vzc2lvbmAuIEEgY29tbWl0dGVkIGJhY2tlbmQgc2Vzc2lvbiBrZWVwcyB0aGUgZWFnZXIgaWRcblx0XHQvLyBpdHMgc2VuZCBjcmVhdGVkIGl0IHdpdGgsIHNvIGVhY2ggc2VuZCBtdXN0IGdyYWR1YXRlIG9udG8gaXRzIE9XTiBpZC5cblx0XHQvLyBNYXRjaGluZyBwdXJlbHkgYnkgbm92ZWx0eSArIHNjaGVtZSB3b3VsZCBsZXQgdGhlIHR3byB3YWl0ZXJzIFNXQVBcblx0XHQvLyBzZXNzaW9ucyBcdTIwMTQgd2hpY2hldmVyIG1hdGVyaWFsaXplcyBmaXJzdCBpcyBncmFiYmVkIGJ5IHRoZSBzZW5kIHRoYXRcblx0XHQvLyBwYXJrZWQgZmlyc3QsIHJlZ2FyZGxlc3Mgb2Ygb3duZXJzaGlwIFx1MjAxNCBsZWF2aW5nIHRoZSB1c2VyIG9uIHRoZSB3cm9uZ1xuXHRcdC8vIHNlc3Npb24uIEhlcmUgdGhlIFNFQ09ORCBzZXNzaW9uIChCKSBtYXRlcmlhbGl6ZXMgQkVGT1JFIHRoZSBmaXJzdFxuXHRcdC8vIChBKSwgd2hpY2ggaXMgZXhhY3RseSB0aGUgb3JkZXJpbmcgdGhhdCB0cmlnZ2VyZWQgdGhlIHN3YXAuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZUlkID0gcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYScpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRjb25zdCBjaGF0QSA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbkEuc2Vzc2lvbklkKTtcblx0XHRjb25zdCBvd25BID0gQWdlbnRTZXNzaW9uLmlkKGNoYXRBLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL2InKSwgc2Vzc2lvblR5cGVJZCk7XG5cdFx0Y29uc3QgY2hhdEIgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb25CLnNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgb3duQiA9IEFnZW50U2Vzc2lvbi5pZChjaGF0Qi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIFN0YXJ0IGJvdGggc2VuZHM7IGVhY2ggcGFya3MgaW4gYF93YWl0Rm9yTmV3U2Vzc2lvbmAgKGxpc3RTZXNzaW9ucyBpc1xuXHRcdC8vIGVtcHR5IGJlY2F1c2UgbmVpdGhlciBzZXNzaW9uIGhhcyBtYXRlcmlhbGl6ZWQgeWV0KS5cblx0XHRjb25zdCBzZW5kQSA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb25BLnNlc3Npb25JZCwgY2hhdEEucmVzb3VyY2UsIHsgcXVlcnk6ICdBJyB9KTtcblx0XHRjb25zdCBzZW5kQiA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb25CLnNlc3Npb25JZCwgY2hhdEIucmVzb3VyY2UsIHsgcXVlcnk6ICdCJyB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdC8vIFRoZSBjb21taXR0ZWQgc2Vzc2lvbiBrZWVwcyBlYWNoIHNlbmQncyBvd24gKGVhZ2VyKSBpZC4gTWF0ZXJpYWxpemUgQlxuXHRcdC8vIEZJUlNULCB0aGVuIEEgXHUyMDE0IHRoZSBvcmRlcmluZyB0aGF0IG1hZGUgQSBncmFiIEIncyBzZXNzaW9uLlxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCBvd25CLCB7IHRpdGxlOiAnQicgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIG93bkEsIHsgdGl0bGU6ICdBJyB9KTtcblxuXHRcdGNvbnN0IFtjb21taXR0ZWRBLCBjb21taXR0ZWRCXSA9IGF3YWl0IFByb21pc2UuYWxsKFtzZW5kQSwgc2VuZEJdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGE6IEFnZW50U2Vzc2lvbi5pZChjb21taXR0ZWRBLnJlc291cmNlLnRvU3RyaW5nKCkpLCBiOiBBZ2VudFNlc3Npb24uaWQoY29tbWl0dGVkQi5yZXNvdXJjZS50b1N0cmluZygpKSB9LFxuXHRcdFx0eyBhOiBvd25BLCBiOiBvd25CIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgZm9yd2FyZHMgcmVzb2x2ZWQgc2Vzc2lvbiBjb25maWcgdG8gY2hhdCBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9uc1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChfcmVzb3VyY2UsIF9tZXNzYWdlLCBvcHRpb25zKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4gPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0XHRcdHNlbmRPcHRpb25zLnB1c2gob3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignY3JlYXRlZC1mcm9tLXNlbmQnLCB7IHN1bW1hcnk6ICdDcmVhdGVkIEZyb20gU2VuZCcgfSkpO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5pc29sYXRpb24gPT09ICd3b3JrdHJlZScpO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnaGVsbG8nIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW5kT3B0aW9ucy5tYXAob3B0aW9ucyA9PiBvcHRpb25zLmFnZW50SG9zdFNlc3Npb25Db25maWcpLCBbeyBpc29sYXRpb246ICd3b3JrdHJlZScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCBjbGVhcnMgY2hhdCBpbnB1dCBkcmFmdCB3aGlsZSBwcmVzZXJ2aW5nIHNlbGVjdGVkIG1vZGVsIGFuZCBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnB1dFN0YXRlczogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT5bXSA9IFtdO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWwgPSBjcmVhdGVUZXN0TGFuZ3VhZ2VNb2RlbCgnc2VsZWN0ZWQtbW9kZWwnKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogbW9kZWxJZCA9PiBtb2RlbElkID09PSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnNlbGVjdGVkLW1vZGVsJyA/IGxhbmd1YWdlTW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0XHRhY3F1aXJlT3JMb2FkU2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnB1dE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5wdXRNb2RlbD4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBjb25zdE9ic2VydmFibGU8SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgc2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRpbnB1dFN0YXRlcy5wdXNoKHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgY2xlYXJTdGF0ZSgpOiB2b2lkIHsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIHRvSlNPTigpOiB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdH0oKTtcblx0XHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnB1dE1vZGVsID0gaW5wdXRNb2RlbDtcblx0XHRcdFx0fSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9iamVjdDogY2hhdE1vZGVsLFxuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0TW9kZWxSZWZlcmVuY2U7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnc2VuZC1kcmFmdCcsIHsgdGl0bGU6ICdTZW5kIERyYWZ0IFNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2VuZCBEcmFmdCBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24hLnNlc3Npb25JZCwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpzZWxlY3RlZC1tb2RlbCcpO1xuXHRcdHByb3ZpZGVyLnNldEFnZW50Py4oc2Vzc2lvbiEuc2Vzc2lvbklkLCB7IHVyaTogJ2FnZW50Oi8vcmV2aWV3JywgbmFtZTogJ3JldmlldycgfSk7XG5cdFx0YWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0aW5wdXRTdGF0ZXMubGVuZ3RoID0gMDtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24hLnNlc3Npb25JZCwgc2Vzc2lvbiEucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3RvY29sRHJhZnRBY3Rpb25zOiBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGQgPT4gZC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkKS5sZW5ndGgsXG5cdFx0XHRoYXNTZWxlY3RlZE1vZGVsVXBkYXRlOiBpbnB1dFN0YXRlcy5zb21lKHN0YXRlID0+IHN0YXRlLnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIgPT09ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6c2VsZWN0ZWQtbW9kZWwnKSxcblx0XHRcdGxhc3RJbnB1dFN0YXRlOiBpbnB1dFN0YXRlcy5hdCgtMSksXG5cdFx0fSwge1xuXHRcdFx0cHJvdG9jb2xEcmFmdEFjdGlvbnM6IDAsXG5cdFx0XHRoYXNTZWxlY3RlZE1vZGVsVXBkYXRlOiB0cnVlLFxuXHRcdFx0bGFzdElucHV0U3RhdGU6IHtcblx0XHRcdFx0bW9kZTogeyBpZDogJ2FnZW50Oi8vcmV2aWV3Jywga2luZDogQ2hhdE1vZGVLaW5kLkFnZW50IH0sXG5cdFx0XHRcdGlucHV0VGV4dDogJycsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0c2VsZWN0aW9uczogW10sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJ1bm5pbmcgc2Vzc2lvbiBjb25maWcgc2VlZGluZyAoZnJvbSBTZXNzaW9uU3RhdGUuY29uZmlnKSAtLS0tLS0tXG5cblx0dGVzdCgnZ2V0U2Vzc2lvbkNvbmZpZyBzZWVkcyBydW5uaW5nIGNvbmZpZyBmcm9tIHNlc3Npb24gc3RhdGUgc3Vic2NyaXB0aW9uIHdpdGggZnVsbCBzY2hlbWEnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdzZWVkLTEnLCB7IHN1bW1hcnk6ICdTZWVkZWQgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2VlZGVkIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBJbml0aWFsbHkgdGhlIGNhY2hlIGhhcyBub3RoaW5nIGZvciB0aGlzIHNlc3Npb24gXHUyMDE0IHRoZSBwaWNrZXIgcmVhZHNcblx0XHQvLyBgdW5kZWZpbmVkYCB3aGlsZSB0aGUgc3Vic2NyaXB0aW9uIGtpY2tzIG9mZiAoYW5kIHN0YXJ0cyBzdWJzY3JpYmluZykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vdyBoYXZlIHRoZSBmYWtlIGhvc3QgaHlkcmF0ZSB0aGUgc2Vzc2lvbi1zdGF0ZSBzbmFwc2hvdCB3aXRoIGFcblx0XHQvLyBjb25maWcgY29udGFpbmluZyBvbmUgbXV0YWJsZSBhbmQgb25lIHJlYWQtb25seSBwcm9wZXJ0eS5cblx0XHRjb25zdCBjb25maWc6IFNlc3Npb25Db25maWdTdGF0ZSA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLCByZWFkT25seTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdTZWVkZWQgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZyxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3NlZWQtMScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uIS5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnZGVmYXVsdCcpO1xuXG5cdFx0Ly8gVGhlIGZ1bGwgc2NoZW1hICsgdmFsdWVzIGFyZSByZXRhaW5lZCAobm9uLW11dGFibGUgdmFsdWVzIGFyZVxuXHRcdC8vIHJlcXVpcmVkIGJ5IHRoZSBKU09OQyBzZXR0aW5ncyBlZGl0b3IgdG8gcm91bmQtdHJpcCB2aWEgcmVwbGFjZVxuXHRcdC8vIHNlbWFudGljcyB3aXRob3V0IGRyb3BwaW5nIHNlcnZlci1zaWRlIGNvbmZpZykuXG5cdFx0Y29uc3Qgc2VlZGVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmtleXMoc2VlZGVkPy5zY2hlbWEucHJvcGVydGllcyA/PyB7fSkuc29ydCgpLFxuXHRcdFx0dmFsdWVzOiBzZWVkZWQ/LnZhbHVlcyxcblx0XHR9LCB7XG5cdFx0XHRwcm9wZXJ0aWVzOiBbJ2F1dG9BcHByb3ZlJywgJ2lzb2xhdGlvbiddLFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncnVubmluZyBjb25maWcgc3RhdGUgc2VlZGluZyBwcmVzZXJ2ZXMgYWxyZWFkeS1yZXNvbHZlZCBzY2hlbWEgcHJvcGVydGllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3NlZWQtc2NoZW1hJywgeyBzdW1tYXJ5OiAnU2NoZW1hIFByZXNlcnZlIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NjaGVtYSBQcmVzZXJ2ZSBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgZnVsbFN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1NjaGVtYSBQcmVzZXJ2ZSBTZXNzaW9uJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCdjb2RleC5zYW5kYm94TW9kZSc6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2FuZGJveCcsIGVudW06IFsncmVhZC1vbmx5JywgJ3dvcmtzcGFjZS13cml0ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0J2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogeyB0eXBlOiAnYm9vbGVhbicsIHRpdGxlOiAnTmV0d29yaycsIGRlZmF1bHQ6IGZhbHNlLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyAnY29kZXguc2FuZGJveE1vZGUnOiAnd29ya3NwYWNlLXdyaXRlJywgJ2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogZmFsc2UgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdzZWVkLXNjaGVtYScsICdjb3BpbG90Y2xpJywgZnVsbFN0YXRlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnNjaGVtYS5wcm9wZXJ0aWVzWydjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCddICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnc2VlZC1zY2hlbWEnLCAnY29waWxvdGNsaScsIHtcblx0XHRcdC4uLmZ1bGxTdGF0ZSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQnY29kZXguc2FuZGJveE1vZGUnOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ1NhbmRib3gnLCBlbnVtOiBbJ3JlYWQtb25seScsICd3b3Jrc3BhY2Utd3JpdGUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3dvcmtzcGFjZS13cml0ZScgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5rZXlzKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKSxcblx0XHRcdHZhbHVlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpPy52YWx1ZXMsXG5cdFx0fSwge1xuXHRcdFx0cHJvcGVydGllczogWydjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCcsICdjb2RleC5zYW5kYm94TW9kZSddLFxuXHRcdFx0dmFsdWVzOiB7ICdjb2RleC5zYW5kYm94TW9kZSc6ICd3b3Jrc3BhY2Utd3JpdGUnLCAnY29kZXgubmV0d29ya0FjY2Vzc0VuYWJsZWQnOiBmYWxzZSB9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgYSBzZXNzaW9uIGRpc3Bvc2VzIGl0cyBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3NlZWQtMicsIHsgc3VtbWFyeTogJ1N1YiBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTdWIgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdC8vIFRyaWdnZXIgbGF6eSBzdWJzY3JpcHRpb25cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaVN0ciA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2VlZC0yJykudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0cikgPz8gMCwgMCk7XG5cblx0XHRmaXJlU2Vzc2lvblJlbW92ZWQoYWdlbnRIb3N0LCAnc2VlZC0yJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0ciksIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgnc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYXV0by1yZWxlYXNlcyBhZnRlciB0aGUgaWRsZSB3aW5kb3cnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdpZGxlLTEnLCB7IHN1bW1hcnk6ICdJZGxlIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0lkbGUgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmlTdHIgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2lkbGUtMScpLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBJbml0aWFsIGFjY2VzcyBzdWJzY3JpYmVzLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0cikgPz8gMCwgMCk7XG5cblx0XHQvLyBSZXBlYXRlZCBhY2Nlc3Mgd2l0aGluIHRoZSBpZGxlIHdpbmRvdyBkb2VzIG5vdCByZS1zdWJzY3JpYmUuXG5cdFx0YXdhaXQgdGltZW91dCgyMF8wMDApO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxLCAnc3RpbGwgb25lIHdpcmUgc3Vic2NyaWJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpID8/IDAsIDAsICdubyB1bnN1YnNjcmliZSB5ZXQgKHRpbWVyIHJlc2V0KScpO1xuXG5cdFx0Ly8gSWRsZSBwYXN0IHRoZSAzMCBzIHdpbmRvdyBcdTIwMTQgd2lyZSB1bnN1YnNjcmliZSBmaXJlcy5cblx0XHRhd2FpdCB0aW1lb3V0KDMxXzAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxLCAnd2lyZSB1bnN1YnNjcmliZSBhZnRlciBpZGxlIHdpbmRvdycpO1xuXG5cdFx0Ly8gUmUtYWNjZXNzIGFmdGVyIHJlbGVhc2UgcmUtc3Vic2NyaWJlcy5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChzZXNzaW9uVXJpU3RyKSwgMiwgJ2ZyZXNoIHN1YnNjcmliZSBhZnRlciByZWxlYXNlJyk7XG5cdH0pKTtcblxuXHQvLyAtLS0tIGdpdEh1YkluZm8gLyBQUiBpY29uIC0tLS0tLS1cblxuXHR0ZXN0LnNraXAoJ2tlZXBzIGEgcmVzb2x2ZWQgUFIgbnVtYmVyIHN0aWNreSBhY3Jvc3MgZ2l0SHViSW5mbyByZWNvbXB1dGVzIChubyByZS1sb29rdXAgLyBpY29uIGZsYXApJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBHaXRIdWIgc2VydmljZSB0aGF0IHJlc29sdmVzIGEgUFIgbnVtYmVyIGFzeW5jaHJvbm91c2x5IChtaXJyb3JpbmcgdGhlXG5cdFx0Ly8gcmVhbCBgZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoYCBSRVNUIGxvb2t1cCkgYW5kIGhhbmRzIG91dCBhXG5cdFx0Ly8gbGl2ZSBQUiBtb2RlbC4gV2UgY291bnQgbG9va3VwcyBzbyB3ZSBjYW4gYXNzZXJ0IHRoZSBudW1iZXIgaXMgcmVzb2x2ZWRcblx0XHQvLyBleGFjdGx5IG9uY2UgYW5kIHRoZW4gcmV1c2VkLCByYXRoZXIgdGhhbiByZS1xdWVyaWVkIChhbmQgcmVzZXQgdG9cblx0XHQvLyBgdW5kZWZpbmVkYCkgZXZlcnkgdGltZSBgZ2l0SHViSW5mb2AgcmVjb21wdXRlcy5cblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0XHRsb29rdXBDYWxscyA9IDA7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbCA9IHsgcHVsbFJlcXVlc3Q6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0gYXMgdW5rbm93biBhcyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsO1xuXHRcdFx0b3ZlcnJpZGUgZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvb2t1cENhbGxzKys7XG5cdFx0XHRcdHJldHVybiA0Mjtcblx0XHRcdH07XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlID0gKCkgPT4gbmV3IEltbW9ydGFsUmVmZXJlbmNlKHRoaXMuX21vZGVsKTtcblx0XHR9KCk7XG5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdwci1zdGlja3knLCB7IHN1bW1hcnk6ICdQUiBTZXNzaW9uJywgcHJvamVjdDogeyB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9yZXBvJyksIGRpc3BsYXlOYW1lOiAncmVwbycgfSB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgZ2l0SHViU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdQUiBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Ly8gRm9yY2UgYSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBhbmQgcHVzaCBnaXQgY29vcmRzIHNvIHRoZSBzZXNzaW9uXG5cdFx0Ly8gcmVzb2x2ZXMgb3duZXIvcmVwby9icmFuY2ggYW5kIGxvb2tzIHVwIGl0cyBQUiBudW1iZXIuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3ByLXN0aWNreScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdQUiBTZXNzaW9uJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0X21ldGE6IHsgZ2l0OiB7IGhhc0dpdEh1YlJlbW90ZTogdHJ1ZSwgZ2l0aHViT3duZXI6ICdvd25lcicsIGdpdGh1YlJlcG86ICdyZXBvJywgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGdpdEh1YkluZm9PYnMgPSBzZXNzaW9uIS53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0hLmdpdFJlcG9zaXRvcnkhLmdpdEh1YkluZm87XG5cblx0XHQvLyBPYnNlcnZlIHVudGlsIHRoZSBhc3luYyBQUi1udW1iZXIgbG9va3VwIHJlc29sdmVzLlxuXHRcdGNvbnN0IHN1YjEgPSBhdXRvcnVuKHJlYWRlciA9PiB7IGdpdEh1YkluZm9PYnMucmVhZChyZWFkZXIpOyB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRIdWJJbmZvT2JzLmdldCgpPy5wdWxsUmVxdWVzdD8ubnVtYmVyLCA0MiwgJ1BSIG51bWJlciByZXNvbHZlcyB3aGlsZSBvYnNlcnZlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLmxvb2t1cENhbGxzLCAxLCAnb25lIFBSLW51bWJlciBsb29rdXAgYWZ0ZXIgZmlyc3QgcmVzb2x1dGlvbicpO1xuXHRcdHN1YjEuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gVW5vYnNlcnZlIHRoZW4gcmUtb2JzZXJ2ZSBcdTIwMTQgdGhpcyBtaXJyb3JzIGEgc2Vzc2lvbiBzd2l0Y2ggLyBzZXNzaW9ucy1saXN0XG5cdFx0Ly8gcmUtcmVuZGVyLCB3aGljaCBwcmV2aW91c2x5IHJlY3JlYXRlZCBhIGZyZXNoICh1bnJlc29sdmVkKSBwcm9taXNlXG5cdFx0Ly8gb2JzZXJ2YWJsZSBhbmQgZmxhcHBlZCB0aGUgUFIgbnVtYmVyIGJhY2sgdG8gYHVuZGVmaW5lZGAsIGRpc3Bvc2luZyB0aGVcblx0XHQvLyBzaGFyZWQgbGl2ZSBtb2RlbCBhbmQgYmxhbmtpbmcgdGhlIGljb24uIFRoZSBudW1iZXIgbXVzdCBzdGF5IHJlc29sdmVkXG5cdFx0Ly8gb24gdGhlIHZlcnkgZmlyc3Qgc3luY2hyb25vdXMgcmUtcmVhZCwgYW5kIG5vIG5ldyBsb29rdXAgbWF5IGJlIGlzc3VlZC5cblx0XHRsZXQgZmlyc3RSZU9ic2VydmVkTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhcHR1cmVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgc3ViMiA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG51bWJlciA9IGdpdEh1YkluZm9PYnMucmVhZChyZWFkZXIpPy5wdWxsUmVxdWVzdD8ubnVtYmVyO1xuXHRcdFx0aWYgKCFjYXB0dXJlZCkge1xuXHRcdFx0XHRmaXJzdFJlT2JzZXJ2ZWROdW1iZXIgPSBudW1iZXI7XG5cdFx0XHRcdGNhcHR1cmVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RSZU9ic2VydmVkTnVtYmVyLCA0MiwgJ1BSIG51bWJlciBzdGF5cyBzdGlja3kgYWNyb3NzIHVub2JzZXJ2ZS9yZW9ic2VydmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5sb29rdXBDYWxscywgMSwgJ25vIGV4dHJhIFBSLW51bWJlciBsb29rdXAgb24gcmVjb21wdXRlJyk7XG5cdFx0c3ViMi5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBhIGRlZmF1bHQgb3Blbi1QUiBpY29uIGltbWVkaWF0ZWx5IHdoZW4gYSBQUiBpcyBkZXRlY3RlZCBiZWZvcmUgdGhlIGxpdmUgbW9kZWwgbG9hZHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBBIEdpdEh1YiBzZXJ2aWNlIHdob3NlIGxpdmUgUFIgbW9kZWwgaXMgbmV2ZXIgcG9wdWxhdGVkIChgcHVsbFJlcXVlc3RgIHN0YXlzXG5cdFx0Ly8gdW5kZWZpbmVkKSwgbWlycm9yaW5nIHRoZSB3aW5kb3cgcmlnaHQgYWZ0ZXIgYSBQUiBpcyBmaXJzdCBkZXRlY3RlZCBidXQgYmVmb3JlXG5cdFx0Ly8gdGhlIGZpcnN0IGxpdmUgZmV0Y2ggY29tcGxldGVzLiBXaXRob3V0IGEgZmFsbGJhY2sgdGhlIHNlc3Npb24gbGlzdCByb3cgd291bGRcblx0XHQvLyBrZWVwIHRoZSByZWFkL3VucmVhZCBkb3QgaW5zdGVhZCBvZiBhIFBSIGljb24gdW50aWwgdGhhdCBmZXRjaCBsYW5kcy5cblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbCA9IHsgcHVsbFJlcXVlc3Q6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0gYXMgdW5rbm93biBhcyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsO1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZSA9ICgpID0+IG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh0aGlzLl9tb2RlbCk7XG5cdFx0fSgpO1xuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncHItZGVmYXVsdC1pY29uJywgeyBzdW1tYXJ5OiAnUFIgU2Vzc2lvbicsIHByb2plY3Q6IHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVwbycpLCBkaXNwbGF5TmFtZTogJ3JlcG8nIH0gfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGdpdEh1YlNlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUFIgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdC8vIEZvcmNlIGEgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYW5kIHB1c2ggR2l0SHViIHN0YXRlIGNhcnJ5aW5nIGEgUFIgVVJMIHNvXG5cdFx0Ly8gdGhlIHNlc3Npb24gZGV0ZWN0cyB0aGUgcHVsbCByZXF1ZXN0IHdoaWxlIGl0cyBsaXZlIG1vZGVsIGlzIHN0aWxsIGVtcHR5LlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdwci1kZWZhdWx0LWljb24nLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnUFIgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdF9tZXRhOiB7IGdpdGh1YjogeyBvd25lcjogJ293bmVyJywgcmVwbzogJ3JlcG8nLCBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGdpdEh1YkluZm9PYnMgPSBzZXNzaW9uIS53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0hLmdpdFJlcG9zaXRvcnkhLmdpdEh1YkluZm87XG5cdFx0Y29uc3Qgc3ViID0gYXV0b3J1bihyZWFkZXIgPT4geyBnaXRIdWJJbmZvT2JzLnJlYWQocmVhZGVyKTsgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0ID0gZ2l0SHViSW5mb09icy5nZXQoKT8ucHVsbFJlcXVlc3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB1bGxSZXF1ZXN0Py5udW1iZXIsIDQyLCAnUFIgaXMgZGV0ZWN0ZWQgZnJvbSB0aGUgR2l0SHViIHN0YXRlIFVSTCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHVsbFJlcXVlc3Q/Lmljb24sIGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuKSwgJ2EgZGVmYXVsdCBvcGVuLVBSIGljb24gaXMgc2hvd24gaW1tZWRpYXRlbHkgd2hpbGUgdGhlIGxpdmUgbW9kZWwgaXMgZW1wdHknKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0Ly8gLS0tLSByZXBsYWNlU2Vzc2lvbkNvbmZpZyAtLS0tLS0tXG5cblx0dGVzdCgncmVwbGFjZVNlc3Npb25Db25maWcgb25seSByZXBsYWNlcyBzZXNzaW9uTXV0YWJsZSwgbm9uLXJlYWRPbmx5IHZhbHVlcyBhbmQgcHJlc2VydmVzIGV2ZXJ5dGhpbmcgZWxzZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3JlcC0xJywgeyBzdW1tYXJ5OiAnUmVwbGFjZSBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZXBsYWNlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBjb25maWc6IFNlc3Npb25Db25maWdTdGF0ZSA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddIH0sIC8vIG5vbi1tdXRhYmxlXG5cdFx0XHRcdFx0YnJhbmNoOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0JyYW5jaCcsIGVudW06IFsnbWFpbiddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgcmVhZE9ubHk6IHRydWUgfSwgLy8gcmVhZE9ubHlcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1JlcGxhY2UgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZyxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3JlcC0xJywgJ2NvcGlsb3RjbGknLCBmYWtlU3RhdGUpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uIS5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnZGVmYXVsdCcpO1xuXG5cdFx0Ly8gQ2FsbGVyIGF0dGVtcHRzIHRvIGNoYW5nZSBldmVyeXRoaW5nIFx1MjAxNCBpbmNsdWRpbmcgbm9uLW11dGFibGVcblx0XHQvLyBgaXNvbGF0aW9uYCwgcmVhZE9ubHkgYGJyYW5jaGAsIGFuZCBhbiB1bmtub3duIGByb2d1ZWAga2V5LiBPbmx5XG5cdFx0Ly8gYGF1dG9BcHByb3ZlYCBzaG91bGQgYWN0dWFsbHkgY2hhbmdlOyBhbGwgb3RoZXIgdmFsdWVzIG11c3QgYmVcblx0XHQvLyBjYXJyaWVkIHRocm91Z2ggdW5jaGFuZ2VkIGFuZCBgcm9ndWVgIG11c3QgYmUgZHJvcHBlZC5cblx0XHRhd2FpdCBwcm92aWRlci5yZXBsYWNlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQsIHtcblx0XHRcdGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLFxuXHRcdFx0aXNvbGF0aW9uOiAnZm9sZGVyJyxcblx0XHRcdGJyYW5jaDogJ290aGVyJyxcblx0XHRcdHJvZ3VlOiAnaWdub3JlZCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdyZXAtMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY29uZmlnQ2hhbmdlZCA9IGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGQgPT4gZC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCAmJiBkLmNoYW5uZWwgPT09IHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5vayhjb25maWdDaGFuZ2VkLCAnYSBTZXNzaW9uQ29uZmlnQ2hhbmdlZCBhY3Rpb24gc2hvdWxkIGJlIGRpc3BhdGNoZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ0NoYW5nZWQuYWN0aW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0sXG5cdFx0XHRyZXBsYWNlOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGF0ZXN0ID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF0ZXN0Py52YWx1ZXMsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdydW5uaW5nIHNlc3Npb24gY29uZmlnIHdyaXRlcyBjbGFtcCBhdXRvQXBwcm92ZSB0byBkZWZhdWx0IHdoZW4gcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdwb2xpY3ktd3JpdGUnLCB7IHN1bW1hcnk6ICdQb2xpY3kgV3JpdGUgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVQb2xpY3lSZXN0cmljdGVkQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdQb2xpY3kgV3JpdGUgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGNvbmZpZzogU2Vzc2lvbkNvbmZpZ1N0YXRlID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJywgJ2F1dG9waWxvdCddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdQb2xpY3kgV3JpdGUgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZyxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3BvbGljeS13cml0ZScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnZhbHVlcy5hdXRvQXBwcm92ZSA9PT0gJ2RlZmF1bHQnKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uIS5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUsICdhdXRvcGlsb3QnKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdwb2xpY3ktd3JpdGUnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNldENvbmZpZ0NoYW5nZWQgPSBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmluZChkID0+IGQuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgJiYgZC5jaGFubmVsID09PSBzZXNzaW9uVXJpKTtcblxuXHRcdGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnJlcGxhY2VTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCwge1xuXHRcdFx0YXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsXG5cdFx0XHRpc29sYXRpb246ICdmb2xkZXInLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlcGxhY2VDb25maWdDaGFuZ2VkID0gYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZCA9PiBkLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkICYmIGQuY2hhbm5lbCA9PT0gc2Vzc2lvblVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNldEFjdGlvbjogc2V0Q29uZmlnQ2hhbmdlZD8uYWN0aW9uLFxuXHRcdFx0cmVwbGFjZUFjdGlvbjogcmVwbGFjZUNvbmZpZ0NoYW5nZWQ/LmFjdGlvbixcblx0XHRcdGxhdGVzdFZhbHVlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpPy52YWx1ZXMsXG5cdFx0fSwge1xuXHRcdFx0c2V0QWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVwbGFjZUFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdFx0XHRyZXBsYWNlOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGxhdGVzdFZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdydW5uaW5nIHNlc3Npb24gY29uZmlnIHdyaXRlIHJlLXJlc29sdmVzIHNjaGVtYS1kZXBlbmRlbnQgcHJvcGVydGllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3NjaGVtYS13cml0ZScsIHsgc3VtbWFyeTogJ1NjaGVtYSBXcml0ZSBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTY2hlbWEgV3JpdGUgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGNvbmZpZzogU2Vzc2lvbkNvbmZpZ1N0YXRlID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0J2NvZGV4LnNhbmRib3hNb2RlJzogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdTYW5kYm94JywgZW51bTogWydyZWFkLW9ubHknLCAnd29ya3NwYWNlLXdyaXRlJ10sIHNlc3Npb25NdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0J2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogeyB0eXBlOiAnYm9vbGVhbicsIHRpdGxlOiAnTmV0d29yaycsIGRlZmF1bHQ6IGZhbHNlLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyAnY29kZXguc2FuZGJveE1vZGUnOiAnd29ya3NwYWNlLXdyaXRlJywgJ2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogZmFsc2UgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdTY2hlbWEgV3JpdGUgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZyxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3NjaGVtYS13cml0ZScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnZhbHVlc1snY29kZXguc2FuZGJveE1vZGUnXSA9PT0gJ3dvcmtzcGFjZS13cml0ZScpO1xuXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0J2NvZGV4LnNhbmRib3hNb2RlJzogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdTYW5kYm94JywgZW51bTogWydyZWFkLW9ubHknLCAnd29ya3NwYWNlLXdyaXRlJ10sIHNlc3Npb25NdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7ICdjb2RleC5zYW5kYm94TW9kZSc6ICdyZWFkLW9ubHknIH0sXG5cdFx0fTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uIS5zZXNzaW9uSWQsICdjb2RleC5zYW5kYm94TW9kZScsICdyZWFkLW9ubHknKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnNjaGVtYS5wcm9wZXJ0aWVzWydjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCddID09PSB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlQ29uZmlnOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZyxcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5rZXlzKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKSxcblx0XHRcdHZhbHVlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpPy52YWx1ZXMsXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x2ZUNvbmZpZzogeyAnY29kZXguc2FuZGJveE1vZGUnOiAncmVhZC1vbmx5JywgJ2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogZmFsc2UgfSxcblx0XHRcdHByb3BlcnRpZXM6IFsnY29kZXguc2FuZGJveE1vZGUnXSxcblx0XHRcdHZhbHVlczogeyAnY29kZXguc2FuZGJveE1vZGUnOiAncmVhZC1vbmx5JyB9LFxuXHRcdH0pO1xuXG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnc2NoZW1hLXdyaXRlJywgJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHQuLi5mYWtlU3RhdGUsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0Li4uY29uZmlnLFxuXHRcdFx0XHR2YWx1ZXM6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3JlYWQtb25seScsICdjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCc6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5rZXlzKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKSxcblx0XHRcdHZhbHVlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpPy52YWx1ZXMsXG5cdFx0fSwge1xuXHRcdFx0cHJvcGVydGllczogWydjb2RleC5zYW5kYm94TW9kZSddLFxuXHRcdFx0dmFsdWVzOiB7ICdjb2RleC5zYW5kYm94TW9kZSc6ICdyZWFkLW9ubHknIH0sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXBsYWNlU2Vzc2lvbkNvbmZpZyBpcyBhIG5vLW9wIHdoZW4gbm90aGluZyBlZGl0YWJsZSBhY3R1YWxseSBjaGFuZ2VzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncmVwLTInLCB7IHN1bW1hcnk6ICdOby1vcCBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdOby1vcCBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgY29uZmlnOiBTZXNzaW9uQ29uZmlnU3RhdGUgPSB7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdOby1vcCBTZXNzaW9uJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y29uZmlnLFxuXHRcdH07XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgncmVwLTInLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24hLnNlc3Npb25JZCwgYyA9PiBjPy52YWx1ZXMuYXV0b0FwcHJvdmUgPT09ICdkZWZhdWx0Jyk7XG5cblx0XHRjb25zdCBiZWZvcmUgPSBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoO1xuXHRcdC8vIENhbGxlciByZS1hc3NlcnRzIHRoZSBzYW1lIGVkaXRhYmxlIHZhbHVlOyBldmVyeXRoaW5nIGVsc2UgZWl0aGVyXG5cdFx0Ly8gbWF0Y2hlcyBvciBpcyBub24tZWRpdGFibGUuXG5cdFx0YXdhaXQgcHJvdmlkZXIucmVwbGFjZVNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkLCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIGJlZm9yZSwgJ25vIGFjdGlvbiBzaG91bGQgYmUgZGlzcGF0Y2hlZCcpO1xuXHR9KSk7XG5cblx0Ly8gLS0tLSBTZXJ2ZXItZWNob2VkIFNlc3Npb25Db25maWdDaGFuZ2VkIC0tLS0tLS1cblxuXHR0ZXN0KCdzZXJ2ZXItZWNob2VkIFNlc3Npb25Db25maWdDaGFuZ2VkIG1lcmdlcyBjb25maWcgdmFsdWVzIGludG8gdGhlIHJ1bm5pbmcgY2FjaGUgYnkgZGVmYXVsdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NmZy1tZXJnZScsIHsgc3VtbWFyeTogJ01lcmdlIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ01lcmdlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnTWVyZ2UgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2NmZy1tZXJnZScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnZhbHVlcy5hdXRvQXBwcm92ZSA9PT0gJ2RlZmF1bHQnKTtcblxuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnY2ZnLW1lcmdlJykudG9TdHJpbmcoKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSxcblx0XHRcdH0sXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHR9IGFzIEFjdGlvbkVudmVsb3BlKTtcblxuXHRcdGNvbnN0IHVwZGF0ZWQgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVkPy52YWx1ZXMsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3NlcnZlci1lY2hvZWQgU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgd2l0aCByZXBsYWNlOnRydWUgb3ZlcndyaXRlcyB0aGUgcnVubmluZyBjYWNoZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NmZy1yZXBsYWNlJywgeyBzdW1tYXJ5OiAnUmVwbGFjZSBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZXBsYWNlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnUmVwbGFjZSBTZXNzaW9uJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgZW51bTogWydhJywgJ2InXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIG1vZGU6ICdhJywgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnY2ZnLXJlcGxhY2UnLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24hLnNlc3Npb25JZCwgYyA9PiBjPy52YWx1ZXMuYXV0b0FwcHJvdmUgPT09ICdkZWZhdWx0Jyk7XG5cblx0XHRhZ2VudEhvc3QuZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NmZy1yZXBsYWNlJykudG9TdHJpbmcoKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdFx0XHRyZXBsYWNlOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0Ly8gYG1vZGVgIGlzIGRyb3BwZWQgYmVjYXVzZSBpdCB3YXNuJ3QgcmUtYXNzZXJ0ZWQgaW4gdGhlIHJlcGxhY2UgcGF5bG9hZC5cblx0XHRjb25zdCB1cGRhdGVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlZD8udmFsdWVzLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdrZWVwcyBhIHZpc2libGUgc2Vzc2lvbiBzdWJzY3JpYmVkIHNvIGhvc3Qtc3Bhd25lZCBzdWJhZ2VudCBjaGF0cyBrZWVwIHJlYWNoaW5nIHRoZSBjYXRhbG9nJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBmb3IgdGhlIFwiT3BlbiBTdWJhZ2VudFwiIHBpbGw6IGEgcGFzc2l2ZWx5LXdhdGNoZWQgc2Vzc2lvblxuXHRcdC8vIG11c3Qgc3RheSBzdWJzY3JpYmVkIHNvIGEgaG9zdC1zcGF3bmVkIHN1YmFnZW50J3MgYGNoYXRBZGRlZGAga2VlcHNcblx0XHQvLyByZWFjaGluZyB0aGUgY2F0YWxvZyBwYXN0IHRoZSBpZGxlLXJlbGVhc2Ugd2luZG93LlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3N1YmFnZW50LWxpdmUnLCB7IHN1bW1hcnk6ICdMZWFkJyB9KSk7XG5cdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4oJ3Zpc2libGUnLCBbXSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgdmlzaWJsZVNlc3Npb25zIH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblxuXHRcdC8vIFRoZSBzZXNzaW9uJ3MgdmlldyBpcyBvbiBzY3JlZW46IGl0cyBzdGF0ZSBzdWJzY3JpcHRpb24gbXVzdCBiZSBwaW5uZWQuXG5cdFx0dmlzaWJsZVNlc3Npb25zLnNldChbbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aXZlU2Vzc2lvbj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2U7XG5cdFx0fSgpXSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3N1YmFnZW50LWxpdmUnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBzdWJhZ2VudE9uZSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmksICd0Yy0xJyk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRUd28gPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLCAndGMtMicpO1xuXHRcdGNvbnN0IHRvb2xDaGF0ID0gKHJlc291cmNlOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IENoYXRTdW1tYXJ5ID0+ICh7XG5cdFx0XHRyZXNvdXJjZSwgdGl0bGUsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRvcmlnaW46IHsga2luZDogUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBkZWZhdWx0Q2hhdCwgdG9vbENhbGxJZCB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0YXRlV2l0aCA9IChjaGF0czogQ2hhdFN1bW1hcnlbXSk6IFNlc3Npb25TdGF0ZSA9PiAoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdMZWFkJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSwgYWN0aXZlQ2xpZW50czogW10sIGRlZmF1bHRDaGF0LCBjaGF0cyxcblx0XHR9KTtcblx0XHRjb25zdCBkZWZhdWx0U3VtbWFyeTogQ2hhdFN1bW1hcnkgPSB7IHJlc291cmNlOiBkZWZhdWx0Q2hhdCwgdGl0bGU6ICcnLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH07XG5cblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdzdWJhZ2VudC1saXZlJywgJ2NvcGlsb3RjbGknLCBzdGF0ZVdpdGgoW2RlZmF1bHRTdW1tYXJ5LCB0b29sQ2hhdChzdWJhZ2VudE9uZSwgJ3RjLTEnLCAnQWRkIG5hbWUgdG8gUkVBRE1FJyldKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24uY2hhdHMuZ2V0KCkuc29tZShjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09ICdzdWJhZ2VudC90Yy0xJyksICdmaXJzdCBzdWJhZ2VudCBzaG91bGQgcmVhY2ggdGhlIGNhdGFsb2cgd2hpbGUgdmlzaWJsZScpO1xuXG5cdFx0Ly8gQWR2YW5jZSB3ZWxsIHBhc3QgdGhlIGlkbGUtcmVsZWFzZSB3aW5kb3c7IGEgcGFzc2l2ZWx5LXdhdGNoZWQgc2Vzc2lvblxuXHRcdC8vIHVzZWQgdG8gZHJvcCBpdHMgc3RhdGUgbGlzdGVuZXIgaGVyZS5cblx0XHRhd2FpdCB0aW1lb3V0KDEyMF8wMDApO1xuXG5cdFx0Ly8gQSBzZWNvbmQgc3ViYWdlbnQgc3Bhd25zIGxhdGVyIGluIHRoZSBzYW1lIHJ1bjsgaXQgbXVzdCBzdGlsbCByZWFjaCB0aGVcblx0XHQvLyBjYXRhbG9nIGJlY2F1c2UgdGhlIHZpc2libGUgc2Vzc2lvbiBzdGF5ZWQgc3Vic2NyaWJlZC5cblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdzdWJhZ2VudC1saXZlJywgJ2NvcGlsb3RjbGknLCBzdGF0ZVdpdGgoW1xuXHRcdFx0ZGVmYXVsdFN1bW1hcnksXG5cdFx0XHR0b29sQ2hhdChzdWJhZ2VudE9uZSwgJ3RjLTEnLCAnQWRkIG5hbWUgdG8gUkVBRE1FJyksXG5cdFx0XHR0b29sQ2hhdChzdWJhZ2VudFR3bywgJ3RjLTInLCAnQWRkIGRlc2NyaXB0aW9uIHRvIHBhY2thZ2UuanNvbicpLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQpLmZpbHRlcihmID0+IGYuc3RhcnRzV2l0aCgnc3ViYWdlbnQvJykpLnNvcnQoKSxcblx0XHRcdFsnc3ViYWdlbnQvdGMtMScsICdzdWJhZ2VudC90Yy0yJ10sXG5cdFx0XHQnYm90aCBzdWJhZ2VudHMgc2hvdWxkIHJlYWNoIHRoZSBjYXRhbG9nIGFmdGVyIHRoZSBpZGxlIHdpbmRvdyB3aGlsZSB0aGUgc2Vzc2lvbiBzdGF5cyB2aXNpYmxlJyxcblx0XHQpO1xuXHR9KSk7XG59KTtcblxuc3VpdGUuc2tpcCgnTG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIC0gYWN0aXZlLXNlc3Npb24gYnJhbmNoIGNoYW5nZXNldCBzdWJzY3JpcHRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgYWdlbnRIb3N0OiBNb2NrQWdlbnRIb3N0U2VydmljZTtcblx0bGV0IGFjdGl2ZVNlc3Npb246IElTZXR0YWJsZU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRhZ2VudEhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCkpO1xuXHRcdGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCd0ZXN0LmFjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gbWFrZUFjdGl2ZShyYXdJZDogc3RyaW5nLCBzZXNzaW9uVHlwZTogc3RyaW5nID0gJ2NvcGlsb3RjbGknLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMgPSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk6IElBY3RpdmVTZXNzaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Ly8gcHJvdmlkZXJJZDogJ3VudXNlZCcsXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogYGFnZW50LWhvc3QtJHtzZXNzaW9uVHlwZX1gLCBwYXRoOiBgLyR7cmF3SWR9YCB9KSxcblx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKHN0YXR1cyksXG5cdFx0fSBhcyB1bmtub3duIGFzIElBY3RpdmVTZXNzaW9uO1xuXHR9XG5cblx0ZnVuY3Rpb24gYnJhbmNoQ2hhbmdlc0tleUZvcihyYXdJZDogc3RyaW5nLCBzZXNzaW9uVHlwZTogc3RyaW5nID0gJ2NvcGlsb3RjbGknKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7QWdlbnRTZXNzaW9uLnVyaShzZXNzaW9uVHlwZSwgcmF3SWQpLnRvU3RyaW5nKCl9L2NoYW5nZXNldC9icmFuY2hgO1xuXHR9XG5cblx0Ly8gVGhlIGFkYXB0ZXIgc3Vic2NyaWJlcyB0byBpdHMgYnJhbmNoIGNoYW5nZXNldCBsYXppbHkgXHUyMDE0IG9ubHkgd2hpbGUgdGhlXG5cdC8vIHNlc3Npb24gaXMgYWN0aXZlIEFORCBpdHMgYGNoYW5nZXNgIC8gYGNoYW5nZXNTdW1tYXJ5YCBvYnNlcnZhYmxlIGlzIGJlaW5nXG5cdC8vIG9ic2VydmVkLiBLZWVwIGFuIGF1dG9ydW4gYWxpdmUgc28gdGhhdCB0aGUgc3Vic2NyaXB0aW9uIGlzIGVzdGFibGlzaGVkLlxuXHRmdW5jdGlvbiBvYnNlcnZlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRzZXNzaW9uLmNoYW5nZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0c2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeT8ucmVhZChyZWFkZXIpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFkZEFuZE9ic2VydmUocHJvdmlkZXI6IExvY2FsQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgcmF3SWQ6IHN0cmluZywgb3B0cz86IHsgY2hhbmdlcz86IENoYW5nZXNTdW1tYXJ5IH0pOiBJU2Vzc2lvbiB7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIHJhd0lkLCB7IHRpdGxlOiBgU2Vzc2lvbiAke3Jhd0lkfWAsIGNoYW5nZXM6IG9wdHM/LmNoYW5nZXMgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09IGBTZXNzaW9uICR7cmF3SWR9YCk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24sIGBleHBlY3RlZCBzZXNzaW9uICR7cmF3SWR9YCk7XG5cdFx0b2JzZXJ2ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHR0ZXN0KCdzdWJzY3JpYmVzIHRvIHRoZSBicmFuY2ggY2hhbmdlc2V0IHdoZW4gdGhlIHNlc3Npb24gYmVjb21lcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUEnKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGtleSA9IGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQScpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdGFnZW50SG9zdC53aXJlT3BzLmluY2x1ZGVzKGBzdWJzY3JpYmU6JHtrZXl9YCksXG5cdFx0XHRgZXhwZWN0ZWQgYSBzdWJzY3JpYmUgZm9yICR7a2V5fSwgZ290IHdpcmVPcHM9JHtKU09OLnN0cmluZ2lmeShhZ2VudEhvc3Qud2lyZU9wcyl9YCxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3RhdGVzIHRoZSBzdWJzY3JpcHRpb24gd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGFkZEFuZE9ic2VydmUocHJvdmlkZXIsICdzZXNzLUEnKTtcblx0XHRhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1CJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUEnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQScpKSA/PyAwLCAxLCAnQSBzaG91bGQgYmUgc3Vic2NyaWJlZCBvbmNlIG9uIGFjdGl2YXRpb24nKTtcblxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3Quc2Vzc2lvblN1YnNjcmliZUNvdW50cy5nZXQoYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1CJykpID8/IDAsIDEsICdCIHNob3VsZCBiZSBzdWJzY3JpYmVkIG9uY2Ugb24gYWN0aXZhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3Quc2Vzc2lvblVuc3Vic2NyaWJlQ291bnRzLmdldChicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKSkgPz8gMCwgMSwgJ0Egc2hvdWxkIGJlIHVuc3Vic2NyaWJlZCB3aGVuIG5vIGxvbmdlciBhY3RpdmUnKTtcblx0fSk7XG5cblx0dGVzdCgnc3dpdGNoaW5nIGJhY2sgdG8gYSBwcmV2aW91c2x5LWFjdGl2ZSBzZXNzaW9uIHJlLXN1YnNjcmliZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cdFx0YWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQicpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1CJyksIHVuZGVmaW5lZCk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzdWJzRm9yQSA9IGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKSkgPz8gMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic0ZvckEsIDIsICdzd2l0Y2hpbmcgYmFjayB0byBBIG11c3Qgb3BlbiBhIGZyZXNoIHN1YnNjcmlwdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIE5PVCBzdWJzY3JpYmUgd2hlbiBhIGRpZmZlcmVudCBzZXNzaW9uIGlzIGFjdGl2ZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGFkZEFuZE9ic2VydmUocHJvdmlkZXIsICdzZXNzLUEnKTtcblxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3Mtb3RoZXInKSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKSkgPz8gMCxcblx0XHRcdDAsXG5cdFx0XHQnbm8gYnJhbmNoIGNoYW5nZXNldCBzdWJzY3JpcHRpb24gc2hvdWxkIG9wZW4gd2hpbGUgYSBkaWZmZXJlbnQgc2Vzc2lvbiBpcyBhY3RpdmUnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgTk9UIHN1YnNjcmliZSB0byB1bmNvbW1pdHRlZCBjaGFuZ2VzIGZvciBhbiB1bnRpdGxlZCBhY3RpdmUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtbmV3JywgJ2NvcGlsb3RjbGknLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHN1YktleXMgPSBbLi4uYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMua2V5cygpXS5maWx0ZXIoayA9PiBrLmVuZHNXaXRoKCcvY2hhbmdlc2V0L3VuY29tbWl0dGVkJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViS2V5cywgW10sICduZXctc2Vzc2lvbiBjb21wb3NlciBzaG91bGQgbm90IHJlc3RvcmUgdGhlIGJhY2tlbmQgc2Vzc2lvbiBqdXN0IHRvIHJlZnJlc2ggY2hhbmdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxlYXNlcyB0aGUgc3Vic2NyaXB0aW9uIHdoZW4gbm8gc2Vzc2lvbiBpcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUEnKSwgdW5kZWZpbmVkKTtcblx0XHRhY3RpdmVTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB1bnN1YnNGb3JBID0gYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJykpID8/IDA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3Vic0ZvckEsIDEsICdsZWF2aW5nIHRoZSBhZ2VudHMgd2luZG93IChubyBhY3RpdmUgc2Vzc2lvbikgbXVzdCByZWxlYXNlIHRoZSBzdWJzY3JpcHRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlIGJyYW5jaCBjaGFuZ2VzZXQgdXNlcyBiZWZvcmUgY29udGVudCBVUkkgYXMgdGhlIGRpZmYgb3JpZ2luYWwnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUEnKSwgdW5kZWZpbmVkKTtcblx0XHRhZ2VudEhvc3Quc2V0Q2hhbmdlc2V0U3RhdGUoYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJyksIHtcblx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LFxuXHRcdFx0ZmlsZXM6IFt7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLFxuXHRcdFx0XHRlZGl0OiB7XG5cdFx0XHRcdFx0YmVmb3JlOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJywgY29udGVudDogeyB1cmk6ICdzZXNzaW9uLWRiOi8vL2JlZm9yZS9maWxlLnRzJyB9IH0sXG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyB9IH0sXG5cdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMiwgcmVtb3ZlZDogMSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzID0gc2Vzc2lvbi5jaGFuZ2VzLmdldCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcy5tYXAoY2hhbmdlID0+IHtcblx0XHRcdGFzc2VydC5vayhpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGNoYW5nZSkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBjaGFuZ2UudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG9yaWdpbmFsVXJpOiBjaGFuZ2Uub3JpZ2luYWxVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkVXJpOiBjaGFuZ2UubW9kaWZpZWRVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdGluc2VydGlvbnM6IGNoYW5nZS5pbnNlcnRpb25zLFxuXHRcdFx0XHRkZWxldGlvbnM6IGNoYW5nZS5kZWxldGlvbnMsXG5cdFx0XHR9O1xuXHRcdH0pLCBbe1xuXHRcdFx0dXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLFxuXHRcdFx0b3JpZ2luYWxVcmk6ICd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsL2JlZm9yZS9maWxlLnRzP19haCUzRGV5SnpZMmhsYldVaU9pSnpaWE56YVc5dUxXUmlJbjAnLFxuXHRcdFx0bW9kaWZpZWRVcmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycsXG5cdFx0XHRpbnNlcnRpb25zOiAyLFxuXHRcdFx0ZGVsZXRpb25zOiAxLFxuXHRcdH1dKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2NoYW5nZXMgc3VtbWFyeSB0cmFja3MgdGhlIGxpdmUgYnJhbmNoIGNoYW5nZXNldCB3aGlsZSBhY3RpdmUgYW5kIHRoZSBjYXRhbG9ndWUgb25jZSBpbmFjdGl2ZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cblx0XHQvLyBTZWVkIHRoZSBsaXZlIGNoYW5nZXNldCBiZWZvcmUgYWN0aXZhdGluZyB0aGUgc2Vzc2lvbi4gV2hlbiB0aGVcblx0XHQvLyBzdWJzY3JpcHRpb24gaXMgZmlyc3Qgb2JzZXJ2ZWQsIHRoaXMgaXMgdGhlIGluaXRpYWwgdmFsdWUgb2YgdGhlXG5cdFx0Ly8gdGhyb3R0bGVkIG9ic2VydmFibGUsIHNvIG5vIHRocm90dGxlIHRpbWVyIGhhcyB0byBlbGFwc2UuXG5cdFx0YWdlbnRIb3N0LnNldENoYW5nZXNldFN0YXRlKGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQScpLCB7XG5cdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdGZpbGVzOiBbe1xuXHRcdFx0XHRpZDogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyxcblx0XHRcdFx0ZWRpdDoge1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9iZWZvcmUvZmlsZS50cycgfSB9LFxuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDIsIHJlbW92ZWQ6IDEgfSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQScpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gV2hpbGUgYWN0aXZlLCB0aGUgc3VtbWFyeSByZWZsZWN0cyB0aGUgbGl2ZSBicmFuY2ggY2hhbmdlc2V0LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeT8uZ2V0KCksIHsgYWRkaXRpb25zOiAyLCBkZWxldGlvbnM6IDEsIGZpbGVzOiAxIH0pO1xuXG5cdFx0Ly8gT25jZSBhbm90aGVyIHNlc3Npb24gYmVjb21lcyBhY3RpdmUsIHRoZSBjYXRhbG9ndWUtc2VlZGVkIHN1bW1hcnlcblx0XHQvLyB0YWtlcyBvdmVyIGFnYWluLlxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQicpLCB1bmRlZmluZWQpO1xuXHRcdGZpcmVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoYWdlbnRIb3N0LCAnc2Vzcy1BJywgeyBjaGFuZ2VzOiB7IGFkZGl0aW9uczogNSwgZGVsZXRpb25zOiAzLCBmaWxlczogMSB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uLmNoYW5nZXNTdW1tYXJ5Py5nZXQoKSwgeyBhZGRpdGlvbnM6IDUsIGRlbGV0aW9uczogMywgZmlsZXM6IDEgfSk7XG5cdH0pO1xuXG5cdC8vIEJ1aWxkcyBvbmUgY2hhbmdlc2V0IGZpbGUuIGB2ZXJzaW9uYCBkcml2ZXMgdGhlIGRpZmYgc28gdGhhdCBcImNoYW5naW5nXCIgYVxuXHQvLyBmaWxlIChidW1waW5nIGl0cyB2ZXJzaW9uKSBwcm9kdWNlcyBhIGdlbnVpbmVseSBkaWZmZXJlbnQgZmlsZSBvYmplY3QsXG5cdC8vIG1pcnJvcmluZyB3aGF0IHRoZSBzZXJ2ZXIgcmVkdWNlciBlbWl0cyB2aWEgYSBgQ2hhbmdlc2V0RmlsZVNldGAgYWN0aW9uLlxuXHRmdW5jdGlvbiBtYWtlQ2hhbmdlc2V0RmlsZShpbmRleDogbnVtYmVyLCB2ZXJzaW9uOiBudW1iZXIpOiBDaGFuZ2VzZXRTdGF0ZVsnZmlsZXMnXVtudW1iZXJdIHtcblx0XHRjb25zdCBwYXRoID0gYGZpbGU6Ly8vcmVwby9zcmMvZmlsZS0ke2luZGV4fS50c2A7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBwYXRoLFxuXHRcdFx0ZWRpdDoge1xuXHRcdFx0XHRiZWZvcmU6IHsgdXJpOiBwYXRoLCBjb250ZW50OiB7IHVyaTogYHNlc3Npb24tZGI6Ly8vYmVmb3JlL2ZpbGUtJHtpbmRleH0udHNgIH0gfSxcblx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiBwYXRoLCBjb250ZW50OiB7IHVyaTogcGF0aCB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IHZlcnNpb24sIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdC8vIFBlcmZvcm1hbmNlLXJlZ3Jlc3Npb24gZ3VhcmQgZm9yIHRoZSBwZXItZmlsZSBjaGFuZ2UgY2FjaGUuXG5cdC8vXG5cdC8vIFRoZSBzZXJ2ZXIgcmVkdWNlciBwcmVzZXJ2ZXMgdGhlIHJlZmVyZW5jZSBvZiBldmVyeSBgQ2hhbmdlc2V0RmlsZWAgdGhhdFxuXHQvLyBkaWRuJ3QgY2hhbmdlIGFjcm9zcyBhbiB1cGRhdGU7IHRoZSBwcm92aWRlciBtdXN0IGV4cGxvaXQgdGhhdCBhbmQgb25seVxuXHQvLyByZWJ1aWxkIHRoZSBjaGFuZ2Ugb2JqZWN0IGZvciB0aGUgZmlsZShzKSB0aGF0IGFjdHVhbGx5IGNoYW5nZWQuIEhlcmUgd2Vcblx0Ly8gc3RyZWFtIG1hbnkgc2luZ2xlLWZpbGUgdXBkYXRlcyBvdmVyIGEgbGFyZ2UgZmlsZSBzZXQgYW5kIGFzc2VydCB0aGF0IGVhY2hcblx0Ly8gdXBkYXRlIHJlYnVpbGRzIGV4YWN0bHkgT05FIGNoYW5nZSBvYmplY3QgKGlkZW50aXR5LXdpc2UpLCBub3QgYWxsIG9mIHRoZW0uXG5cdC8vXG5cdC8vIFJldmVydGluZyB0aGUgcGVyLWZpbGUgY2FjaGluZyAoaS5lLiByZWJ1aWxkaW5nL2AuLi5zcHJlYWRgLWluZyBldmVyeSBmaWxlXG5cdC8vIG9uIGV2ZXJ5IHVwZGF0ZSkgbWFrZXMgdGhpcyBmYWlsIGltbWVkaWF0ZWx5OiBhbGwgRklMRV9DT1VOVCBvYmplY3RzIGFyZVxuXHQvLyBmcmVzaGx5IGJ1aWx0IG9uIHRoZSBmaXJzdCB1cGRhdGUuXG5cdHRlc3QoJ3JlYnVpbGRzIG9ubHkgdGhlIGNoYW5nZWQgZmlsZSBhY3Jvc3MgbWFueSBjaGFuZ2VzZXQgdXBkYXRlcyAoTyhjaGFuZ2VkKSwgbm90IE8oYWxsKSknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDFfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBGSUxFX0NPVU5UID0gMjAwO1xuXHRcdGNvbnN0IFVQREFURV9DT1VOVCA9IDEwMDtcblx0XHRjb25zdCBrZXkgPSBicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKTtcblxuXHRcdC8vIEEgc3RhYmxlIHBvb2wgb2YgZmlsZSBvYmplY3RzLiBFYWNoIHVwZGF0ZSBiZWxvdyByZXBsYWNlcyBleGFjdGx5IG9uZVxuXHRcdC8vIGVudHJ5IGFuZCBrZWVwcyBldmVyeSBvdGhlciByZWZlcmVuY2UsIGV4YWN0bHkgYXMgdGhlIHJlZHVjZXIgZG9lcy5cblx0XHRjb25zdCBmaWxlczogQ2hhbmdlc2V0U3RhdGVbJ2ZpbGVzJ10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IEZJTEVfQ09VTlQ7IGkrKykge1xuXHRcdFx0ZmlsZXMucHVzaChtYWtlQ2hhbmdlc2V0RmlsZShpLCAwKSk7XG5cdFx0fVxuXHRcdGFnZW50SG9zdC5zZXRDaGFuZ2VzZXRTdGF0ZShrZXksIHsgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksIGZpbGVzOiBbLi4uZmlsZXNdIH0pO1xuXG5cdFx0bGV0IHByZXZpb3VzID0gc2Vzc2lvbi5jaGFuZ2VzLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmV2aW91cy5sZW5ndGgsIEZJTEVfQ09VTlQsICdldmVyeSBmaWxlIHNob3VsZCBzdXJmYWNlIGFzIGEgY2hhbmdlJyk7XG5cblx0XHRmb3IgKGxldCB1cGRhdGUgPSAwOyB1cGRhdGUgPCBVUERBVEVfQ09VTlQ7IHVwZGF0ZSsrKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkSW5kZXggPSB1cGRhdGUgJSBGSUxFX0NPVU5UO1xuXHRcdFx0ZmlsZXNbY2hhbmdlZEluZGV4XSA9IG1ha2VDaGFuZ2VzZXRGaWxlKGNoYW5nZWRJbmRleCwgdXBkYXRlICsgMSk7XG5cdFx0XHRhZ2VudEhvc3Quc2V0Q2hhbmdlc2V0U3RhdGUoa2V5LCB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCBmaWxlczogWy4uLmZpbGVzXSB9KTtcblxuXHRcdFx0Y29uc3QgbmV4dCA9IHNlc3Npb24uY2hhbmdlcy5nZXQoKTtcblxuXHRcdFx0bGV0IHJlYnVpbHQgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBGSUxFX0NPVU5UOyBpKyspIHtcblx0XHRcdFx0aWYgKG5leHRbaV0gIT09IHByZXZpb3VzW2ldKSB7XG5cdFx0XHRcdFx0cmVidWlsdCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWJ1aWx0LCAxLCBgdXBkYXRlICR7dXBkYXRlfTogZXhhY3RseSBvbmUgY2hhbmdlIG9iamVjdCBzaG91bGQgYmUgcmVidWlsdCwgYnV0ICR7cmVidWlsdH0gb2YgJHtGSUxFX0NPVU5UfSB3ZXJlYCk7XG5cdFx0XHRwcmV2aW91cyA9IG5leHQ7XG5cdFx0fVxuXHR9KSk7XG5cblx0Ly8gQ29tcGFuaW9uIHRvIHRoZSB0ZXN0IGFib3ZlLCBzdGF0ZWQgYXMgYSBzaW1wbGUgaWRlbnRpdHkgaW52YXJpYW50OiBhIGZpbGVcblx0Ly8gdGhhdCBpcyBuZXZlciB0b3VjaGVkIG11c3Qga2VlcCB0aGUgKnNhbWUqIGNoYW5nZSBvYmplY3QgaW5zdGFuY2Ugbm8gbWF0dGVyXG5cdC8vIGhvdyBtYW55IHVwZGF0ZXMgc3RyZWFtIGluIGZvciBvdGhlciBmaWxlcy4gUmV2ZXJ0aW5nIHRoZSBjYWNoZSByZWJ1aWxkc1xuXHQvLyBldmVyeSBjaGFuZ2Ugb2JqZWN0IG9uIGV2ZXJ5IHVwZGF0ZSwgc28gdGhpcyBpZGVudGl0eSBjaGVjayBmYWlscy5cblx0dGVzdCgnYW4gdW50b3VjaGVkIGZpbGUga2VlcHMgaXRzIGNoYW5nZS1vYmplY3QgaWRlbnRpdHkgd2hpbGUgYW5vdGhlciBmaWxlIHN0cmVhbXMgdXBkYXRlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMV8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGFkZEFuZE9ic2VydmUocHJvdmlkZXIsICdzZXNzLUEnKTtcblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUEnKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IEZJTEVfQ09VTlQgPSA1MDtcblx0XHRjb25zdCBVUERBVEVfQ09VTlQgPSAxMDA7XG5cdFx0Y29uc3Qga2V5ID0gYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJyk7XG5cblx0XHRjb25zdCBmaWxlczogQ2hhbmdlc2V0U3RhdGVbJ2ZpbGVzJ10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IEZJTEVfQ09VTlQ7IGkrKykge1xuXHRcdFx0ZmlsZXMucHVzaChtYWtlQ2hhbmdlc2V0RmlsZShpLCAwKSk7XG5cdFx0fVxuXHRcdGFnZW50SG9zdC5zZXRDaGFuZ2VzZXRTdGF0ZShrZXksIHsgc3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksIGZpbGVzOiBbLi4uZmlsZXNdIH0pO1xuXG5cdFx0Ly8gSW5kZXggMCBpcyBuZXZlciB0b3VjaGVkOyBvbmx5IHRoZSBsYXN0IGZpbGUgXCJzdHJlYW1zXCIgdXBkYXRlcy5cblx0XHRjb25zdCB1bnRvdWNoZWRDaGFuZ2VCZWZvcmUgPSBzZXNzaW9uLmNoYW5nZXMuZ2V0KClbMF07XG5cdFx0YXNzZXJ0Lm9rKHVudG91Y2hlZENoYW5nZUJlZm9yZSwgJ3RoZSB1bnRvdWNoZWQgZmlsZSBzaG91bGQgaGF2ZSBhIGNoYW5nZSBvYmplY3QgdG8gYmVnaW4gd2l0aCcpO1xuXG5cdFx0Y29uc3QgbGFzdEluZGV4ID0gRklMRV9DT1VOVCAtIDE7XG5cdFx0Zm9yIChsZXQgdXBkYXRlID0gMDsgdXBkYXRlIDwgVVBEQVRFX0NPVU5UOyB1cGRhdGUrKykge1xuXHRcdFx0ZmlsZXNbbGFzdEluZGV4XSA9IG1ha2VDaGFuZ2VzZXRGaWxlKGxhc3RJbmRleCwgdXBkYXRlICsgMSk7XG5cdFx0XHRhZ2VudEhvc3Quc2V0Q2hhbmdlc2V0U3RhdGUoa2V5LCB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCBmaWxlczogWy4uLmZpbGVzXSB9KTtcblx0XHRcdHNlc3Npb24uY2hhbmdlcy5nZXQoKTsgLy8gZm9yY2UgdGhlIGRlcml2ZWQgY2hhaW4gdG8gcmVjb21wdXRlXG5cdFx0fVxuXG5cdFx0Y29uc3QgdW50b3VjaGVkQ2hhbmdlQWZ0ZXIgPSBzZXNzaW9uLmNoYW5nZXMuZ2V0KClbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVudG91Y2hlZENoYW5nZUFmdGVyLCB1bnRvdWNoZWRDaGFuZ2VCZWZvcmUsICdhbiB1bmNoYW5nZWQgZmlsZSBtdXN0IHJldXNlIGl0cyBjaGFuZ2Ugb2JqZWN0IGFj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
