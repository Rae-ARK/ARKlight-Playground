import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSession } from "../../../../../../platform/agentHost/common/agentService.js";
import { MessageKind, SessionLifecycle } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType, NotificationType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildDefaultChatUri, SessionStatus as ProtocolSessionStatus } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService, IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { InMemoryStorageService, IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatWidgetService } from "../../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { SessionStatus } from "../../../../../services/sessions/common/session.js";
import { RemoteAgentHostSessionsProvider } from "../../browser/remoteAgentHostSessionsProvider.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IGitHubService } from "../../../../github/browser/githubService.js";
import { IPullRequestIconCache, PullRequestIconCache } from "../../../../github/browser/pullRequestIconCache.js";
import { IAgentHostActiveClientService } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { CopilotCLISessionType } from "../../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { constObservable } from "../../../../../../base/common/observable.js";
import { ISessionsService } from "../../../../../services/sessions/browser/sessionsService.js";
class MockAgentConnection extends mock() {
  constructor() {
    super();
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this._onDidRootStateChange = new Emitter();
    this._rootStateValue = { agents: [{ provider: "copilotcli", displayName: "Copilot", description: "", models: [] }] };
    this.clientId = "test-client-1";
    this._sessions = /* @__PURE__ */ new Map();
    this.disposedSessions = [];
    this.dispatchedActions = [];
    this.failResolveSessionConfig = false;
    this.resolveSessionConfigResult = { schema: { type: "object", properties: {} }, values: { isolation: "worktree" } };
    this._nextSeq = 0;
    this.createdSessionUris = [];
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
        return self._rootStateValue;
      },
      onDidChange: self._onDidRootStateChange.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
  }
  nextClientSeq() {
    return this._nextSeq++;
  }
  async listSessions() {
    return [...this._sessions.values()];
  }
  async disposeSession(session) {
    this.disposedSessions.push(session);
    const rawId = AgentSession.id(session);
    this._sessions.delete(rawId);
  }
  async createSession(config) {
    const uri = config?.session ?? URI.parse("copilotcli:///auto");
    this.createdSessionUris.push(uri);
    return uri;
  }
  async resolveSessionConfig() {
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
  getSubscription(_kind, resource) {
    const key = resource.toString();
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
  setAgents(agents) {
    this._rootStateValue = { agents };
    this._onDidRootStateChange.fire(this._rootStateValue);
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
    workingDirectories: opts?.workingDirectory ? [opts?.workingDirectory] : void 0
  };
}
function createProvider(disposables, connection, overrides) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
  instantiationService.stub(IConfigurationService, new TestConfigurationService());
  instantiationService.stub(INotificationService, { error: () => {
  } });
  instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock() {
    isWorkspaceTrusted() {
      return overrides?.workspaceTrusted ?? true;
    }
    async getUriTrustInfo(uri) {
      return { uri, trusted: overrides?.workspaceTrusted ?? true };
    }
  }());
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: () => ({ type: "remote-test-copilot", name: "test", displayName: "Test", description: "test", icon: void 0 }),
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } })
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: async () => void 0,
    sendRequest: overrides?.sendRequest ?? (async () => ({ kind: "sent", data: {} }))
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => overrides?.openSession ? new class extends mock() {
    }() : void 0
  });
  instantiationService.stub(ILanguageModelsService, {
    lookupLanguageModel: () => void 0
  });
  instantiationService.stub(IStorageService, overrides?.storageService ?? disposables.add(new InMemoryStorageService()));
  instantiationService.stub(IProgressService, {});
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IGitHubService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.findPullRequestNumberByHeadBranch = async () => void 0;
    }
  }());
  instantiationService.stub(IPullRequestIconCache, instantiationService.createInstance(PullRequestIconCache));
  instantiationService.stub(ISessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = constObservable(void 0);
      this.visibleSessions = constObservable([]);
    }
  }());
  instantiationService.stub(IAgentHostActiveClientService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.getActiveClient = (_sessionType, clientId) => ({ clientId, tools: [], customizations: [] });
    }
  }());
  const config = {
    address: overrides?.address ?? "localhost:4321",
    name: overrides !== void 0 && Object.prototype.hasOwnProperty.call(overrides, "connectionName") ? overrides.connectionName ?? "" : "Test Host"
  };
  const providerCtor = overrides?.isWebPlatform !== void 0 ? class extends RemoteAgentHostSessionsProvider {
    get isWebPlatform() {
      return overrides.isWebPlatform;
    }
  } : RemoteAgentHostSessionsProvider;
  const provider = disposables.add(instantiationService.createInstance(providerCtor, config));
  if (!overrides?.noConnection) {
    provider.setConnection(connection);
  }
  return provider;
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
function fireSessionAdded(connection, rawId, opts) {
  const provider = opts?.provider ?? "copilotcli";
  const sessionUri = AgentSession.uri(provider, rawId);
  connection.fireNotification({
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
      workingDirectories: opts?.workingDirectory ? [opts.workingDirectory] : void 0
    }
  });
}
function fireSessionRemoved(connection, rawId, provider = "copilotcli") {
  const sessionUri = AgentSession.uri(provider, rawId);
  connection.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionRemoved,
    session: sessionUri.toString()
  });
}
suite("RemoteAgentHostSessionsProvider", () => {
  const disposables = new DisposableStore();
  let connection;
  setup(() => {
    connection = new MockAgentConnection();
    disposables.add(toDisposable(() => connection.dispose()));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("derives id and label from config, and session types from rootState agents", () => {
    const provider = createProvider(disposables, connection, { address: "10.0.0.1:8080", connectionName: "My Host", isWebPlatform: false });
    assert.strictEqual(provider.id, "agenthost-10.0.0.1__8080");
    assert.strictEqual(provider.label, "My Host");
    assert.strictEqual(provider.sessionTypes.length, 1);
    assert.strictEqual(provider.sessionTypes[0].id, CopilotCLISessionType.id);
    assert.strictEqual(provider.sessionTypes[0].label, "Copilot [My Host]");
  });
  test("session types update when the host advertises additional agents", () => {
    const provider = createProvider(disposables, connection, { address: "10.0.0.1:8080", connectionName: "My Host", isWebPlatform: false });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), [
      CopilotCLISessionType.id
    ]);
    let changes = 0;
    disposables.add(provider.onDidChangeSessionTypes(() => changes++));
    connection.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] }
    ]);
    assert.strictEqual(changes, 1);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => ({ id: t.id, label: t.label })), [
      { id: CopilotCLISessionType.id, label: "Copilot [My Host]" },
      { id: "openai", label: "OpenAI [My Host]" }
    ]);
  });
  test("session-type labels omit host suffix on web", () => {
    const provider = createProvider(disposables, connection, { address: "10.0.0.1:8080", connectionName: "My Host", isWebPlatform: true });
    connection.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] }
    ]);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => ({ id: t.id, label: t.label })), [
      { id: CopilotCLISessionType.id, label: "Copilot" },
      { id: "openai", label: "OpenAI" }
    ]);
  });
  test("falls back to address-based label when no name given", () => {
    const provider = createProvider(disposables, connection, { connectionName: void 0, address: "myhost:9999" });
    assert.strictEqual(provider.label, "myhost:9999");
  });
  test("session type icons use per-agent codicons", () => {
    connection.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude-code", displayName: "Claude", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] },
      { provider: "unknown-agent", displayName: "Unknown", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, connection, { address: "10.0.0.1:8080", connectionName: "My Host" });
    assert.deepStrictEqual(
      provider.sessionTypes.map((t) => ({ id: t.id, icon: t.icon.id })),
      [
        { id: CopilotCLISessionType.id, icon: "copilot" },
        { id: "claude-code", icon: "claude" },
        { id: "openai", icon: "openai" },
        { id: "unknown-agent", icon: "remote" }
      ]
    );
  });
  test("resolveWorkspace builds workspace from URI", () => {
    const provider = createProvider(disposables, connection, { isWebPlatform: true });
    const uri = URI.parse("vscode-agent-host://localhost__4321/home/user/project");
    const ws = provider.resolveWorkspace(uri);
    assert.ok(ws, "resolveWorkspace should resolve vscode-agent-host:// URIs");
    assert.strictEqual(ws.label, "project");
    assert.strictEqual(ws.folders.length, 1);
    assert.strictEqual(ws.folders[0].root.toString(), uri.toString());
  });
  test("createNewSession eagerly creates the backend session in a trusted folder", async () => {
    const provider = createProvider(disposables, connection);
    const session = provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/trusted-project"), provider.sessionTypes[0].id);
    provider.setAuthenticationPending(false);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const expectedBackendUri = AgentSession.uri(provider.sessionTypes[0].id, rawId);
    assert.deepStrictEqual(
      connection.createdSessionUris.map((u) => u.toString()),
      [expectedBackendUri.toString()],
      "eager createSession should be invoked with the client-allocated URI"
    );
  });
  test("createNewSession does not eagerly create the backend session in an untrusted folder", async () => {
    const provider = createProvider(disposables, connection, { workspaceTrusted: false });
    provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/untrusted-project"), provider.sessionTypes[0].id);
    provider.setAuthenticationPending(false);
    await timeout(0);
    assert.deepStrictEqual(
      connection.createdSessionUris.map((u) => u.toString()),
      [],
      "no eager createSession should be invoked for an untrusted folder"
    );
  });
  test("has one browse action for remote folders", () => {
    const provider = createProvider(disposables, connection);
    assert.strictEqual(provider.browseActions.length, 1);
    assert.ok(provider.browseActions[0].label.includes("Folders"));
    assert.strictEqual(provider.browseActions[0].providerId, provider.id);
  });
  test("onDidChangeSessions fires when session added notification arrives", () => {
    const provider = createProvider(disposables, connection);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionAdded(connection, "notif-1", { title: "Notif Session" });
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].added.length, 1);
    assert.strictEqual(changes[0].added[0].title.get(), "Notif Session");
  });
  test("session added notifications ingest any advertised agent provider", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "cop-1", { provider: "copilotcli", title: "Copilot Session" });
    fireSessionAdded(connection, "oai-1", { provider: "openai", title: "OpenAI Session" });
    const sessions = provider.getSessions();
    assert.deepStrictEqual(
      sessions.map((s) => ({ title: s.title.get(), sessionType: s.sessionType })).sort((a, b) => a.title.localeCompare(b.title)),
      [
        { title: "Copilot Session", sessionType: CopilotCLISessionType.id },
        { title: "OpenAI Session", sessionType: "openai" }
      ]
    );
  }));
  test("session removed notification removes from cache", () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "to-remove", { title: "Removed" });
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionRemoved(connection, "to-remove");
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].removed.length, 1);
  });
  test("duplicate session added notification is ignored", () => {
    const provider = createProvider(disposables, connection);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const timestamp = (/* @__PURE__ */ new Date(0)).toISOString();
    fireSessionAdded(connection, "dup-sess", { title: "Dup", createdAt: timestamp, modifiedAt: timestamp });
    fireSessionAdded(connection, "dup-sess", { title: "Dup", createdAt: timestamp, modifiedAt: timestamp });
    assert.strictEqual(changes.length, 1);
  });
  test("uses project metadata as workspace group source", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const projectUri = URI.parse("vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0");
    const workingDirectory = URI.parse("vscode-agent-host://localhost__4321/tmp/copilot-worktrees/vscode-feature?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0");
    connection.addSession(createSession("project-1", {
      summary: "Project Session",
      project: { uri: projectUri, displayName: "vscode" },
      workingDirectory
    }));
    const provider = createProvider(disposables, connection, { isWebPlatform: true });
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
  test("session added converts file project URIs and preserves repository URLs", () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "file-project", {
      title: "File Project",
      project: { uri: "file:///home/user/vscode", displayName: "vscode" },
      workingDirectory: "file:///tmp/copilot-worktrees/vscode-feature"
    });
    fireSessionAdded(connection, "url-project", {
      title: "URL Project",
      project: { uri: "https://github.com/microsoft/vscode", displayName: "vscode" }
    });
    const workspaces = provider.getSessions().map((session) => session.workspace.get());
    assert.deepStrictEqual(workspaces.map((workspace) => workspace?.folders[0]?.root.toString()), [
      "vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0",
      "https://github.com/microsoft/vscode"
    ]);
  });
  test("removing non-existent session is no-op", () => {
    const provider = createProvider(disposables, connection);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionRemoved(connection, "does-not-exist");
    assert.strictEqual(changes.length, 0);
  });
  test("getSessions populates from connection.listSessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("list-1", { summary: "First" }));
    connection.addSession(createSession("list-2", { summary: "Second" }));
    const provider = createProvider(disposables, connection);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    provider.getSessions();
    await timeout(0);
    assert.ok(changes.length > 0);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  }));
  test("session added notification does not carry model metadata", () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "notif-model", { title: "Notif Model Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Notif Model Session");
    assert.strictEqual(session?.modelId.get(), void 0);
  });
  test("setModel updates existing session model without dispatching session-level model change", () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "set-model", { title: "Set Model Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Model Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "remote-localhost__4321-copilotcli:new-model");
    assert.strictEqual(session.modelId.get(), "remote-localhost__4321-copilotcli:new-model");
    assert.strictEqual(connection.dispatchedActions.length, 0);
  });
  test("setModel leaves dispatch log untouched for later message-level selection", () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "set-model-config", { title: "Set Model Config Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Model Config Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "remote-localhost__4321-copilotcli:configured-model");
    assert.strictEqual(session.modelId.get(), "remote-localhost__4321-copilotcli:configured-model");
    assert.strictEqual(connection.dispatchedActions.length, 0);
  });
  test("createNewSession returns session with correct fields", () => {
    const provider = createProvider(disposables, connection, { isWebPlatform: true });
    const session = provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/project"), provider.sessionTypes[0].id);
    assert.strictEqual(session.providerId, provider.id);
    assert.strictEqual(session.status.get(), SessionStatus.Untitled);
    assert.ok(session.workspace.get());
    assert.strictEqual(session.workspace.get()?.label, "project");
    assert.strictEqual(session.sessionType, provider.sessionTypes[0].id);
    assert.deepStrictEqual(provider.getSessionConfig(session.sessionId), { schema: { type: "object", properties: {} }, values: {} });
  });
  test("createNewSession clears session config when resolving config is unavailable", async () => {
    connection.failResolveSessionConfig = true;
    const provider = createProvider(disposables, connection, { isWebPlatform: true });
    const workspaceUri = URI.parse("vscode-agent-host://localhost__4321/home/user/project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    const resolved = provider.getSessionByResource(session.resource);
    assert.deepStrictEqual({
      listedSessions: provider.getSessions().length,
      resolvedResource: resolved?.resource.toString(),
      resolvedWorkspaceLabel: resolved?.workspace.get()?.label
    }, {
      listedSessions: 0,
      resolvedResource: session.resource.toString(),
      resolvedWorkspaceLabel: "project"
    });
  });
  test("clearConnection clears pending new session config and capabilities", () => {
    connection.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }]);
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "running-session", { title: "Running Session" });
    const runningSession = provider.getSessions()[0];
    const session = provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/project"), provider.sessionTypes[0].id);
    const supportsMultipleChatsBeforeDisconnect = runningSession.capabilities.get().supportsMultipleChats;
    provider.clearConnection();
    assert.deepStrictEqual({
      resolved: provider.getSessionByResource(session.resource),
      config: provider.getSessionConfig(session.sessionId),
      sessionTypes: provider.sessionTypes,
      supportsMultipleChatsBeforeDisconnect,
      supportsMultipleChatsAfterDisconnect: runningSession.capabilities.get().supportsMultipleChats
    }, {
      resolved: void 0,
      config: void 0,
      sessionTypes: [],
      supportsMultipleChatsBeforeDisconnect: true,
      supportsMultipleChatsAfterDisconnect: false
    });
  });
  test("deleteSession calls disposeSession with backend agent URI and removes from cache", async () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "del-sess", { title: "To Delete" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "To Delete");
    assert.ok(target, "Session should exist");
    await provider.deleteSession(target.sessionId);
    assert.strictEqual(connection.disposedSessions.length, 1);
    const disposedUri = connection.disposedSessions[0];
    assert.strictEqual(AgentSession.provider(disposedUri), "copilotcli");
    assert.strictEqual(AgentSession.id(disposedUri), "del-sess");
    const remaining = provider.getSessions();
    assert.strictEqual(remaining.find((s) => s.title.get() === "To Delete"), void 0);
  });
  test("renameSession dispatches SessionTitleChanged action with correct session URI", async () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "rename-sess", { title: "Old Title" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Old Title");
    assert.ok(target, "Session should exist");
    await provider.renameSession(target.sessionId, "New Title");
    assert.strictEqual(connection.dispatchedActions.length, 1);
    const dispatched = connection.dispatchedActions[0];
    assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
    assert.strictEqual(dispatched.action.title, "New Title");
    const actionSession = dispatched.channel.toString();
    assert.strictEqual(AgentSession.provider(actionSession), "copilotcli");
    assert.strictEqual(AgentSession.id(actionSession), "rename-sess");
    assert.strictEqual(dispatched.clientId, "test-client-1");
  });
  test("renameSession updates local title optimistically", async () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "rename-opt", { title: "Before" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Before");
    assert.ok(target);
    await provider.renameSession(target.sessionId, "After");
    assert.strictEqual(target.title.get(), "After");
  });
  test("renameSession is no-op for unknown chatId", async () => {
    const provider = createProvider(disposables, connection);
    await provider.renameSession("nonexistent-id", "Ignored");
    assert.strictEqual(connection.dispatchedActions.length, 0);
  });
  test("renameSession increments clientSeq on successive calls", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("seq-sess", { summary: "Seq Test" }));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Seq Test");
    assert.ok(target);
    await provider.renameSession(target.sessionId, "Title 1");
    await provider.renameSession(target.sessionId, "Title 2");
    assert.strictEqual(connection.dispatchedActions.length, 2);
    assert.strictEqual(connection.dispatchedActions[0].clientSeq, 0);
    assert.strictEqual(connection.dispatchedActions[1].clientSeq, 1);
  }));
  test("server-echoed SessionTitleChanged updates cached title", () => {
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "echo-sess", { title: "Original" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Original");
    assert.ok(target);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    connection.fireAction({
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
    const provider = createProvider(disposables, connection);
    fireSessionAdded(connection, "model-change", { title: "Model Change" });
    const target = provider.getSessions().find((s) => s.title.get() === "Model Change");
    assert.ok(target);
    provider.setModel(target.sessionId, "remote-localhost__4321-copilotcli:old-model");
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    connection.fireAction({
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
    assert.strictEqual(target.modelId.get(), "remote-localhost__4321-copilotcli:old-model");
    assert.strictEqual(changes.length, 0);
  });
  test("renamed title survives session refresh from listSessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("persist-sess", { summary: "Original Title" }));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    let sessions = provider.getSessions();
    let target = sessions.find((s) => s.title.get() === "Original Title");
    assert.ok(target, "Session should exist with original title");
    connection.addSession(createSession("persist-sess", { summary: "Renamed Title", modifiedTime: 5e3 }));
    connection.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "persist-sess").toString()),
      action: {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    sessions = provider.getSessions();
    target = sessions.find((s) => s.title.get() === "Renamed Title");
    assert.ok(target, "Session should have renamed title after refresh");
  }));
  test("new session stays loading when required config is missing", async () => {
    connection.resolveSessionConfigResult = {
      schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
      values: {}
    };
    const provider = createProvider(disposables, connection);
    const session = provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/project"), provider.sessionTypes[0].id);
    provider.setAuthenticationPending(false);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.schema.required?.includes("branch") === true);
    assert.strictEqual(session.loading.get(), true);
  });
  test("cached session loading reflects authenticationPending", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("cached-auth", { summary: "Cached" }));
    const provider = createProvider(disposables, connection);
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Cached");
    assert.ok(session);
    assert.strictEqual(session.loading.get(), true);
    provider.setAuthenticationPending(false);
    assert.strictEqual(session.loading.get(), false);
    provider.setAuthenticationPending(true);
    assert.strictEqual(session.loading.get(), false);
  }));
  test("unpublishCachedSessions hides sessions but retains persisted cache", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    connection.addSession(createSession("keep-me", { summary: "Keep Me" }));
    const provider = createProvider(disposables, connection, { storageService });
    await timeout(0);
    assert.strictEqual(provider.getSessions().length, 1);
    const events = [];
    disposables.add(provider.onDidChangeSessions((e) => events.push(e)));
    provider.unpublishCachedSessions();
    assert.deepStrictEqual(
      {
        sessionCount: provider.getSessions().length,
        eventCount: events.length,
        eventRemovedTitles: events.flatMap((e) => e.removed.map((s) => s.title.get()))
      },
      { sessionCount: 0, eventCount: 1, eventRemovedTitles: [] }
    );
    await storageService.flush();
    const provider2 = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true });
    assert.deepStrictEqual(
      provider2.getSessions().map((s) => s.title.get()),
      ["Keep Me"]
    );
  }));
  test("authoritative session update persists materialized workspace metadata", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const provider = createProvider(disposables, connection, { storageService });
    const timestamp = (/* @__PURE__ */ new Date(0)).toISOString();
    fireSessionAdded(connection, "persist-upsert", {
      title: "Worktree Session",
      project: { uri: "file:///Users/me/project", displayName: "project" },
      workingDirectory: "file:///Users/me/project",
      createdAt: timestamp,
      modifiedAt: timestamp
    });
    fireSessionAdded(connection, "persist-upsert", {
      title: "Worktree Session",
      project: { uri: "file:///Users/me/project", displayName: "project" },
      workingDirectory: "file:///Users/me/project.worktrees/session",
      createdAt: timestamp,
      modifiedAt: (/* @__PURE__ */ new Date(1e3)).toISOString()
    });
    const currentWorkspace = provider.getSessions()[0].workspace.get();
    await storageService.flush();
    const restoredProvider = createProvider(disposables, new MockAgentConnection(), { storageService, noConnection: true });
    const restoredWorkspace = restoredProvider.getSessions()[0].workspace.get();
    assert.deepStrictEqual({
      current: {
        root: currentWorkspace.folders[0].root.path,
        workingDirectory: currentWorkspace.folders[0].workingDirectory.path
      },
      restored: {
        root: restoredWorkspace.folders[0].root.path,
        workingDirectory: restoredWorkspace.folders[0].workingDirectory.path
      }
    }, {
      current: {
        root: "/Users/me/project",
        workingDirectory: "/Users/me/project.worktrees/session"
      },
      restored: {
        root: "/Users/me/project",
        workingDirectory: "/Users/me/project.worktrees/session"
      }
    });
  }));
  test("setConnection after unpublishCachedSessions restores cached sessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("restore-me", { summary: "Restore Me" }));
    const provider = createProvider(disposables, connection);
    await timeout(0);
    assert.strictEqual(provider.getSessions().length, 1);
    provider.unpublishCachedSessions();
    assert.strictEqual(provider.getSessions().length, 0);
    const events = [];
    disposables.add(provider.onDidChangeSessions((e) => events.push(e)));
    const reconnected = new MockAgentConnection();
    disposables.add(toDisposable(() => reconnected.dispose()));
    reconnected.addSession(createSession("restore-me", { summary: "Restored" }));
    provider.setConnection(reconnected);
    await timeout(0);
    assert.deepStrictEqual(
      {
        sessions: provider.getSessions().map((s) => s.title.get()),
        added: events.flatMap((e) => e.added.map((s) => s.title.get())),
        changed: events.flatMap((e) => e.changed.map((s) => s.title.get())),
        removed: events.flatMap((e) => e.removed.map((s) => s.title.get()))
      },
      {
        sessions: ["Restored"],
        added: ["Restored"],
        changed: ["Restored"],
        removed: []
      }
    );
  }));
  test("sendRequest throws for unknown session", async () => {
    const provider = createProvider(disposables, connection);
    await assert.rejects(
      () => provider.sendRequest("nonexistent", URI.parse("untitled:chat"), { query: "test" }),
      /not found/
    );
  });
  test("sendRequest forwards resolved session config to chat service", async () => {
    const sendOptions = [];
    const provider = createProvider(disposables, connection, {
      openSession: true,
      sendRequest: async (_resource, _message, options) => {
        if (options) {
          sendOptions.push(options);
        }
        connection.addSession(createSession("created-from-send", { summary: "Created From Send" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/project"), provider.sessionTypes[0].id);
    provider.setAuthenticationPending(false);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.deepStrictEqual(sendOptions.map((options) => options.agentHostSessionConfig), [{ isolation: "worktree" }]);
  });
  test("session adapter has correct workspace from working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("ws-sess", { summary: "WS Test", workingDirectory: URI.parse("vscode-agent-host://localhost__4321/home/user/myrepo?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0") }));
    const provider = createProvider(disposables, connection, { isWebPlatform: true });
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const wsSession = sessions.find((s) => s.title.get() === "WS Test");
    assert.ok(wsSession, "Session with working directory should exist");
    const workspace = wsSession.workspace.get();
    assert.ok(workspace, "Workspace should be populated");
    assert.strictEqual(workspace.label, "myrepo");
    assert.strictEqual(workspace.requiresWorkspaceTrust, true, "remote session folders require workspace trust");
  }));
  test("session adapter without working directory has no workspace", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("no-ws-sess", { summary: "No WS" }));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const session = sessions.find((s) => s.title.get() === "No WS");
    assert.ok(session, "Session should exist");
    assert.strictEqual(session.workspace.get(), void 0);
  }));
  test("session adapter uses raw ID as fallback title", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("abcdef1234567890"));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const session = sessions[0];
    assert.ok(session);
    assert.strictEqual(session.title.get(), "Session abcdef12");
  }));
  test("turnComplete action triggers session refresh for matching provider", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("turn-sess", { summary: "Before", modifiedTime: 1e3 }));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    connection.addSession(createSession("turn-sess", { summary: "After", modifiedTime: 5e3 }));
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    connection.fireAction({
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
    assert.ok(updatedSession, "Session should have updated title");
  }));
  test("getSessionConfig seeds running config from session state subscription with full schema", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("seed-1", { summary: "Seeded Session" }));
    const provider = createProvider(disposables, connection);
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
    connection.setSessionState("seed-1", "copilotcli", fakeState);
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
  test("removing a session disposes its session-state subscription", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("seed-2", { summary: "Sub Session" }));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Sub Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    const sessionUriStr = AgentSession.uri("copilotcli", "seed-2").toString();
    assert.strictEqual(connection.sessionSubscribeCounts.get(sessionUriStr), 1);
    assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);
    fireSessionRemoved(connection, "seed-2");
    assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr), 1);
  }));
  test("replacing the connection disposes all session-state subscriptions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("seed-3", { summary: "Reconnect Session" }));
    const provider = createProvider(disposables, connection);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Reconnect Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    const sessionUriStr = AgentSession.uri("copilotcli", "seed-3").toString();
    assert.strictEqual(connection.sessionSubscribeCounts.get(sessionUriStr), 1);
    assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);
    const newConnection = new MockAgentConnection();
    disposables.add(toDisposable(() => newConnection.dispose()));
    provider.setConnection(newConnection);
    assert.strictEqual(connection.sessionUnsubscribeCounts.get(sessionUriStr), 1);
  }));
  test("non-web: resolveWorkspace includes [host] suffix in label", () => {
    const provider = createProvider(disposables, connection, { isWebPlatform: false });
    const uri = URI.parse("vscode-agent-host://localhost__4321/home/user/project");
    const ws = provider.resolveWorkspace(uri);
    assert.ok(ws);
    assert.strictEqual(ws.label, "project [Test Host]");
  });
  test("non-web: session workspace from project metadata includes [host] suffix", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const projectUri = URI.parse("vscode-agent-host://localhost__4321/home/user/vscode?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0");
    connection.addSession(createSession("project-1", {
      summary: "Project Session",
      project: { uri: projectUri, displayName: "vscode" }
    }));
    const provider = createProvider(disposables, connection, { isWebPlatform: false });
    provider.getSessions();
    await timeout(0);
    assert.strictEqual(provider.getSessions()[0].workspace.get()?.label, "vscode [Test Host]");
  }));
  test("non-web: session workspace from working directory includes [host] suffix", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("ws-sess", {
      summary: "WS Test",
      workingDirectory: URI.parse("vscode-agent-host://localhost__4321/home/user/myrepo?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0")
    }));
    const provider = createProvider(disposables, connection, { isWebPlatform: false });
    provider.getSessions();
    await timeout(0);
    const wsSession = provider.getSessions().find((s) => s.title.get() === "WS Test");
    assert.strictEqual(wsSession?.workspace.get()?.label, "myrepo [Test Host]");
  }));
  test("non-web: createNewSession workspace label includes [host] suffix", () => {
    const provider = createProvider(disposables, connection, { isWebPlatform: false });
    const session = provider.createNewSession(URI.parse("vscode-agent-host://localhost__4321/home/user/project"), provider.sessionTypes[0].id);
    assert.strictEqual(session.workspace.get()?.label, "project [Test Host]");
  });
  test("non-web: idle session description is undefined", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("desc-sess", { summary: "Desc Test" }));
    const provider = createProvider(disposables, connection, { isWebPlatform: false });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Desc Test");
    assert.strictEqual(session?.description.get(), void 0);
  }));
  test("web: session description is undefined (host filter dropdown replaces it)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    connection.addSession(createSession("desc-sess-web", { summary: "Desc Web" }));
    const provider = createProvider(disposables, connection, { isWebPlatform: true });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Desc Web");
    assert.strictEqual(session?.description.get(), void 0);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC90ZXN0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUsIHR5cGUgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgSUFnZW50Q29ubmVjdGlvbiwgdHlwZSBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgU2Vzc2lvbkxpZmVjeWNsZSwgdHlwZSBBZ2VudEluZm8sIHR5cGUgUm9vdFN0YXRlLCB0eXBlIFNlc3Npb25Db25maWdTdGF0ZSwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIE5vdGlmaWNhdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUsIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgVGVybWluYWxBY3Rpb24sIHR5cGUgSU5vdGlmaWNhdGlvbiwgdHlwZSBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgU2Vzc2lvblN0YXR1cyBhcyBQcm90b2NvbFNlc3Npb25TdGF0dXMsIFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCB0eXBlIENoYXRTZW5kUmVzdWx0LCB0eXBlIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHR5cGUgSVJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJDb25maWcgfSBmcm9tICcuLi8uLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVB1bGxSZXF1ZXN0SWNvbkNhY2hlLCBQdWxsUmVxdWVzdEljb25DYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL3B1bGxSZXF1ZXN0SWNvbkNhY2hlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29waWxvdENMSVNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5cbi8vIC0tLS0gTW9jayBjb25uZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIE1vY2tBZ2VudENvbm5lY3Rpb24gZXh0ZW5kcyBtb2NrPElBZ2VudENvbm5lY3Rpb24+KCkge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5vdGlmaWNhdGlvbiA9IG5ldyBFbWl0dGVyPElOb3RpZmljYXRpb24+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSb290U3RhdGVDaGFuZ2UgPSBuZXcgRW1pdHRlcjxSb290U3RhdGU+KCk7XG5cdHByaXZhdGUgX3Jvb3RTdGF0ZVZhbHVlOiBSb290U3RhdGUgPSB7IGFnZW50czogW3sgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvXSB9O1xuXHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+O1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3QtY2xpZW50LTEnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGE+KCk7XG5cdHB1YmxpYyBkaXNwb3NlZFNlc3Npb25zOiBVUklbXSA9IFtdO1xuXHRwdWJsaWMgZGlzcGF0Y2hlZEFjdGlvbnM6IHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uOyBjbGllbnRJZDogc3RyaW5nOyBjbGllbnRTZXE6IG51bWJlciB9W10gPSBbXTtcblx0cHVibGljIGZhaWxSZXNvbHZlU2Vzc2lvbkNvbmZpZyA9IGZhbHNlO1xuXHRwdWJsaWMgcmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9O1xuXG5cdHByaXZhdGUgX25leHRTZXEgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5yb290U3RhdGUgPSB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl9yb290U3RhdGVWYWx1ZTsgfSxcblx0XHRcdGdldCB2ZXJpZmllZFZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRvbkRpZENoYW5nZTogc2VsZi5fb25EaWRSb290U3RhdGVDaGFuZ2UuZXZlbnQsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0fVxuXG5cdG5leHRDbGllbnRTZXEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbmV4dFNlcSsrO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+IHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZWRTZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShyYXdJZCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlZFNlc3Npb25VcmlzOiBVUklbXSA9IFtdO1xuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVTZXNzaW9uKGNvbmZpZz86IHsgc2Vzc2lvbj86IFVSSSB9KTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB1cmkgPSBjb25maWc/LnNlc3Npb24gPz8gVVJJLnBhcnNlKCdjb3BpbG90Y2xpOi8vL2F1dG8nKTtcblx0XHR0aGlzLmNyZWF0ZWRTZXNzaW9uVXJpcy5wdXNoKHVyaSk7XG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVTZXNzaW9uQ29uZmlnKCk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRpZiAodGhpcy5mYWlsUmVzb2x2ZVNlc3Npb25Db25maWcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigncmVzb2x2ZVNlc3Npb25Db25maWcgdW5hdmFpbGFibGUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG5cdH1cblxuXHRkaXNwYXRjaEFjdGlvbihjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIGNsaWVudElkOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uLCBjbGllbnRJZCwgY2xpZW50U2VxIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uLCBjbGllbnRJZDogdGhpcy5jbGllbnRJZCwgY2xpZW50U2VxOiB0aGlzLl9uZXh0U2VxKysgfSk7XG5cdH1cblxuXHQvLyBUZXN0IGhlbHBlcnNcblx0YWRkU2Vzc2lvbihtZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoQWdlbnRTZXNzaW9uLmlkKG1ldGEuc2Vzc2lvbiksIG1ldGEpO1xuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0YXRlRW1pdHRlcnMgPSBuZXcgTWFwPHN0cmluZywgRW1pdHRlcjxTZXNzaW9uU3RhdGU+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU3RhdGVWYWx1ZXMgPSBuZXcgTWFwPHN0cmluZywgU2Vzc2lvblN0YXRlPigpO1xuXHRwdWJsaWMgc2Vzc2lvblN1YnNjcmliZUNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHB1YmxpYyBzZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdG92ZXJyaWRlIGdldFN1YnNjcmlwdGlvbjxUPihfa2luZDogU3RhdGVDb21wb25lbnRzLCByZXNvdXJjZTogVVJJKTogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248VD4+IHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuc2Vzc2lvblN1YnNjcmliZUNvdW50cy5zZXQoa2V5LCAodGhpcy5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChrZXkpID8/IDApICsgMSk7XG5cdFx0bGV0IGVtaXR0ZXIgPSB0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5nZXQoa2V5KTtcblx0XHRpZiAoIWVtaXR0ZXIpIHtcblx0XHRcdGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxTZXNzaW9uU3RhdGU+KCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5zZXQoa2V5LCBlbWl0dGVyKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3Qgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248VD4gPSB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl9zZXNzaW9uU3RhdGVWYWx1ZXMuZ2V0KGtleSkgYXMgdW5rbm93biBhcyBUIHwgdW5kZWZpbmVkOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl9zZXNzaW9uU3RhdGVWYWx1ZXMuZ2V0KGtleSkgYXMgdW5rbm93biBhcyBUIHwgdW5kZWZpbmVkOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQgYXMgdW5rbm93biBhcyBFdmVudDxUPixcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IHN1Yixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuc2V0KGtleSwgKHRoaXMuc2Vzc2lvblVuc3Vic2NyaWJlQ291bnRzLmdldChrZXkpID8/IDApICsgMSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRzZXRTZXNzaW9uU3RhdGUocmF3SWQ6IHN0cmluZywgcHJvdmlkZXI6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIHJhd0lkKS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVZhbHVlcy5zZXQoa2V5LCBzdGF0ZSk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuZ2V0KGtleSk/LmZpcmUoc3RhdGUpO1xuXHR9XG5cblx0c2V0QWdlbnRzKGFnZW50czogQWdlbnRJbmZvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yb290U3RhdGVWYWx1ZSA9IHsgYWdlbnRzIH07XG5cdFx0dGhpcy5fb25EaWRSb290U3RhdGVDaGFuZ2UuZmlyZSh0aGlzLl9yb290U3RhdGVWYWx1ZSk7XG5cdH1cblxuXHRmaXJlTm90aWZpY2F0aW9uKG46IElOb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5maXJlKG4pO1xuXHR9XG5cblx0ZmlyZUFjdGlvbihlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBY3Rpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJvb3RTdGF0ZUNoYW5nZS5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBlbWl0dGVyIG9mIHRoaXMuX3Nlc3Npb25TdGF0ZUVtaXR0ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuY2xlYXIoKTtcblx0fVxufVxuXG4vLyAtLS0tIFRlc3QgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKGlkOiBzdHJpbmcsIG9wdHM/OiB7IHByb3ZpZGVyPzogc3RyaW5nOyBzdW1tYXJ5Pzogc3RyaW5nOyBwcm9qZWN0PzogeyB1cmk6IFVSSTsgZGlzcGxheU5hbWU6IHN0cmluZyB9OyB3b3JraW5nRGlyZWN0b3J5PzogVVJJOyBzdGFydFRpbWU/OiBudW1iZXI7IG1vZGlmaWVkVGltZT86IG51bWJlciB9KTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKG9wdHM/LnByb3ZpZGVyID8/ICdjb3BpbG90Y2xpJywgaWQpLFxuXHRcdHN0YXJ0VGltZTogb3B0cz8uc3RhcnRUaW1lID8/IDEwMDAsXG5cdFx0bW9kaWZpZWRUaW1lOiBvcHRzPy5tb2RpZmllZFRpbWUgPz8gMjAwMCxcblx0XHRzdW1tYXJ5OiBvcHRzPy5zdW1tYXJ5LFxuXHRcdHByb2plY3Q6IG9wdHM/LnByb2plY3QsXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBvcHRzPy53b3JraW5nRGlyZWN0b3J5ID8gW29wdHM/LndvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBjb25uZWN0aW9uOiBNb2NrQWdlbnRDb25uZWN0aW9uLCBvdmVycmlkZXM/OiB7IGFkZHJlc3M/OiBzdHJpbmc7IGNvbm5lY3Rpb25OYW1lPzogc3RyaW5nIHwgdW5kZWZpbmVkOyBzZW5kUmVxdWVzdD86IChyZXNvdXJjZTogVVJJLCBtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM/OiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucykgPT4gUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD47IG9wZW5TZXNzaW9uPzogYm9vbGVhbjsgc3RvcmFnZVNlcnZpY2U/OiBJU3RvcmFnZVNlcnZpY2U7IG5vQ29ubmVjdGlvbj86IGJvb2xlYW47IGlzV2ViUGxhdGZvcm0/OiBib29sZWFuOyB3b3Jrc3BhY2VUcnVzdGVkPzogYm9vbGVhbiB9KTogUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZURpYWxvZ1NlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwgeyBjb25maXJtOiBhc3luYyAoKSA9PiAoeyBjb25maXJtZWQ6IHRydWUgfSkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IGVycm9yOiAoKSA9PiB7IH0gfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGlzV29ya3NwYWNlVHJ1c3RlZCgpOiBib29sZWFuIHsgcmV0dXJuIG92ZXJyaWRlcz8ud29ya3NwYWNlVHJ1c3RlZCA/PyB0cnVlOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0VXJpVHJ1c3RJbmZvKHVyaTogVVJJKSB7IHJldHVybiB7IHVyaSwgdHJ1c3RlZDogb3ZlcnJpZGVzPy53b3Jrc3BhY2VUcnVzdGVkID8/IHRydWUgfTsgfVxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwge1xuXHRcdGdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uOiAoKSA9PiAoeyB0eXBlOiAncmVtb3RlLXRlc3QtY29waWxvdCcsIG5hbWU6ICd0ZXN0JywgZGlzcGxheU5hbWU6ICdUZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0JywgaWNvbjogdW5kZWZpbmVkIH0pLFxuXHRcdGdldE9yQ3JlYXRlQ2hhdFNlc3Npb246IGFzeW5jICgpID0+ICh7IG9uV2lsbERpc3Bvc2U6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksIHNlc3Npb25SZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JyB9KSwgaGlzdG9yeTogW10sIGRpc3Bvc2UoKSB7IH0gfSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdGFjcXVpcmVPckxvYWRTZXNzaW9uOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0c2VuZFJlcXVlc3Q6IG92ZXJyaWRlcz8uc2VuZFJlcXVlc3QgPz8gKGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9KSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiBvdmVycmlkZXM/Lm9wZW5TZXNzaW9uID8gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldD4oKSB7IH0oKSA6IHVuZGVmaW5lZCxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6ICgpID0+IHVuZGVmaW5lZCxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBvdmVycmlkZXM/LnN0b3JhZ2VTZXJ2aWNlID8/IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIHtcblx0XHRnZXRVcmlMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aCxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJR2l0SHViU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoID0gYXN5bmMgKCkgPT4gdW5kZWZpbmVkO1xuXHR9KCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQdWxsUmVxdWVzdEljb25DYWNoZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHVsbFJlcXVlc3RJY29uQ2FjaGUpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb246IElPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB2aXNpYmxlU2Vzc2lvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4gPSBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPihbXSk7XG5cdH0oKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldEFjdGl2ZUNsaWVudCA9IChfc2Vzc2lvblR5cGU6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZykgPT4gKHsgY2xpZW50SWQsIHRvb2xzOiBbXSwgY3VzdG9taXphdGlvbnM6IFtdIH0pO1xuXHR9KCkpO1xuXG5cdGNvbnN0IGNvbmZpZzogSVJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJDb25maWcgPSB7XG5cdFx0YWRkcmVzczogb3ZlcnJpZGVzPy5hZGRyZXNzID8/ICdsb2NhbGhvc3Q6NDMyMScsXG5cdFx0bmFtZTogb3ZlcnJpZGVzICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG92ZXJyaWRlcywgJ2Nvbm5lY3Rpb25OYW1lJykgPyBvdmVycmlkZXMuY29ubmVjdGlvbk5hbWUgPz8gJycgOiAnVGVzdCBIb3N0Jyxcblx0fTtcblxuXHRjb25zdCBwcm92aWRlckN0b3IgPSBvdmVycmlkZXM/LmlzV2ViUGxhdGZvcm0gIT09IHVuZGVmaW5lZFxuXHRcdD8gY2xhc3MgZXh0ZW5kcyBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBnZXQgaXNXZWJQbGF0Zm9ybSgpOiBib29sZWFuIHsgcmV0dXJuIG92ZXJyaWRlcy5pc1dlYlBsYXRmb3JtITsgfVxuXHRcdH1cblx0XHQ6IFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7XG5cdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHByb3ZpZGVyQ3RvciwgY29uZmlnKSk7XG5cdGlmICghb3ZlcnJpZGVzPy5ub0Nvbm5lY3Rpb24pIHtcblx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uKGNvbm5lY3Rpb24pO1xuXHR9XG5cdHJldHVybiBwcm92aWRlcjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXI6IFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb25JZDogc3RyaW5nLCBwcmVkaWNhdGU6IChjb25maWc6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHwgdW5kZWZpbmVkKSA9PiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmIChwcmVkaWNhdGUocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQpKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25Db25maWcoY2hhbmdlZFNlc3Npb25JZCA9PiB7XG5cdFx0XHRpZiAoY2hhbmdlZFNlc3Npb25JZCA9PT0gc2Vzc2lvbklkICYmIHByZWRpY2F0ZShwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCkpKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb246IE1vY2tBZ2VudENvbm5lY3Rpb24sIHJhd0lkOiBzdHJpbmcsIG9wdHM/OiB7IHByb3ZpZGVyPzogc3RyaW5nOyB0aXRsZT86IHN0cmluZzsgcHJvamVjdD86IHsgdXJpOiBzdHJpbmc7IGRpc3BsYXlOYW1lOiBzdHJpbmcgfTsgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZzsgY3JlYXRlZEF0Pzogc3RyaW5nOyBtb2RpZmllZEF0Pzogc3RyaW5nIH0pOiB2b2lkIHtcblx0Y29uc3QgcHJvdmlkZXIgPSBvcHRzPy5wcm92aWRlciA/PyAnY29waWxvdGNsaSc7XG5cdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHByb3ZpZGVyLCByYXdJZCk7XG5cdGNvbm5lY3Rpb24uZmlyZU5vdGlmaWNhdGlvbih7XG5cdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHR0eXBlOiBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25BZGRlZCxcblx0XHRzdW1tYXJ5OiB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHR0aXRsZTogb3B0cz8udGl0bGUgPz8gYFNlc3Npb24gJHtyYXdJZH1gLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogb3B0cz8uY3JlYXRlZEF0ID8/IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG9wdHM/Lm1vZGlmaWVkQXQgPz8gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogb3B0cz8ucHJvamVjdCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogb3B0cz8ud29ya2luZ0RpcmVjdG9yeSA/IFtvcHRzLndvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdH0sXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBmaXJlU2Vzc2lvblJlbW92ZWQoY29ubmVjdGlvbjogTW9ja0FnZW50Q29ubmVjdGlvbiwgcmF3SWQ6IHN0cmluZywgcHJvdmlkZXIgPSAnY29waWxvdGNsaScpOiB2b2lkIHtcblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIHJhd0lkKTtcblx0Y29ubmVjdGlvbi5maXJlTm90aWZpY2F0aW9uKHtcblx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdHR5cGU6IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblJlbW92ZWQsXG5cdFx0c2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHR9KTtcbn1cblxuc3VpdGUoJ1JlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgY29ubmVjdGlvbjogTW9ja0FnZW50Q29ubmVjdGlvbjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb25uZWN0aW9uLmRpc3Bvc2UoKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBQcm92aWRlciBpZGVudGl0eSAtLS0tLS0tXG5cblx0dGVzdCgnZGVyaXZlcyBpZCBhbmQgbGFiZWwgZnJvbSBjb25maWcsIGFuZCBzZXNzaW9uIHR5cGVzIGZyb20gcm9vdFN0YXRlIGFnZW50cycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IGFkZHJlc3M6ICcxMC4wLjAuMTo4MDgwJywgY29ubmVjdGlvbk5hbWU6ICdNeSBIb3N0JywgaXNXZWJQbGF0Zm9ybTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuaWQsICdhZ2VudGhvc3QtMTAuMC4wLjFfXzgwODAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIubGFiZWwsICdNeSBIb3N0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5sYWJlbCwgJ0NvcGlsb3QgW015IEhvc3RdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gdHlwZXMgdXBkYXRlIHdoZW4gdGhlIGhvc3QgYWR2ZXJ0aXNlcyBhZGRpdGlvbmFsIGFnZW50cycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IGFkZHJlc3M6ICcxMC4wLjAuMTo4MDgwJywgY29ubmVjdGlvbk5hbWU6ICdNeSBIb3N0JywgaXNXZWJQbGF0Zm9ybTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gdC5pZCksIFtcblx0XHRcdENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCxcblx0XHRdKTtcblxuXHRcdGxldCBjaGFuZ2VzID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMhKCgpID0+IGNoYW5nZXMrKykpO1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnb3BlbmFpJywgZGlzcGxheU5hbWU6ICdPcGVuQUknLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcywgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGxhYmVsOiB0LmxhYmVsIH0pKSwgW1xuXHRcdFx0eyBpZDogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkLCBsYWJlbDogJ0NvcGlsb3QgW015IEhvc3RdJyB9LFxuXHRcdFx0eyBpZDogJ29wZW5haScsIGxhYmVsOiAnT3BlbkFJIFtNeSBIb3N0XScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbi10eXBlIGxhYmVscyBvbWl0IGhvc3Qgc3VmZml4IG9uIHdlYicsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IGFkZHJlc3M6ICcxMC4wLjAuMTo4MDgwJywgY29ubmVjdGlvbk5hbWU6ICdNeSBIb3N0JywgaXNXZWJQbGF0Zm9ybTogdHJ1ZSB9KTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ29wZW5haScsIGRpc3BsYXlOYW1lOiAnT3BlbkFJJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGxhYmVsOiB0LmxhYmVsIH0pKSwgW1xuXHRcdFx0eyBpZDogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkLCBsYWJlbDogJ0NvcGlsb3QnIH0sXG5cdFx0XHR7IGlkOiAnb3BlbmFpJywgbGFiZWw6ICdPcGVuQUknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYWRkcmVzcy1iYXNlZCBsYWJlbCB3aGVuIG5vIG5hbWUgZ2l2ZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbiwgeyBjb25uZWN0aW9uTmFtZTogdW5kZWZpbmVkLCBhZGRyZXNzOiAnbXlob3N0Ojk5OTknIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmxhYmVsLCAnbXlob3N0Ojk5OTknKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiB0eXBlIGljb25zIHVzZSBwZXItYWdlbnQgY29kaWNvbnMnLCAoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbi5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY2xhdWRlLWNvZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdHsgcHJvdmlkZXI6ICdvcGVuYWknLCBkaXNwbGF5TmFtZTogJ09wZW5BSScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdHsgcHJvdmlkZXI6ICd1bmtub3duLWFnZW50JywgZGlzcGxheU5hbWU6ICdVbmtub3duJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgYWRkcmVzczogJzEwLjAuMC4xOjgwODAnLCBjb25uZWN0aW9uTmFtZTogJ015IEhvc3QnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGljb246IHQuaWNvbi5pZCB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgaWQ6IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCwgaWNvbjogJ2NvcGlsb3QnIH0sXG5cdFx0XHRcdHsgaWQ6ICdjbGF1ZGUtY29kZScsIGljb246ICdjbGF1ZGUnIH0sXG5cdFx0XHRcdHsgaWQ6ICdvcGVuYWknLCBpY29uOiAnb3BlbmFpJyB9LFxuXHRcdFx0XHR7IGlkOiAndW5rbm93bi1hZ2VudCcsIGljb246ICdyZW1vdGUnIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gV29ya3NwYWNlIHJlc29sdXRpb24gLS0tLS0tLVxuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UgYnVpbGRzIHdvcmtzcGFjZSBmcm9tIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IGlzV2ViUGxhdGZvcm06IHRydWUgfSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHdzID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZSh1cmkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdzLCAncmVzb2x2ZVdvcmtzcGFjZSBzaG91bGQgcmVzb2x2ZSB2c2NvZGUtYWdlbnQtaG9zdDovLyBVUklzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmxhYmVsLCAncHJvamVjdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5mb2xkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnNbMF0ucm9vdC50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZWFnZXJseSBjcmVhdGVzIHRoZSBiYWNrZW5kIHNlc3Npb24gaW4gYSB0cnVzdGVkIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbG9jYWxob3N0X180MzIxL2hvbWUvdXNlci90cnVzdGVkLXByb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRwcm92aWRlci5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpOyAvLyBlYWdlciBjcmVhdGUgb25seSBydW5zIG9uY2UgYXV0aCBzZXR0bGVzXG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IHRoZSBlYWdlciBjcmVhdGVTZXNzaW9uIHByb21pc2UgcmVzb2x2ZVxuXG5cdFx0Y29uc3QgcmF3SWQgPSBzZXNzaW9uLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdGNvbnN0IGV4cGVjdGVkQmFja2VuZFVyaSA9IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkLCByYXdJZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvbm5lY3Rpb24uY3JlYXRlZFNlc3Npb25VcmlzLm1hcCh1ID0+IHUudG9TdHJpbmcoKSksXG5cdFx0XHRbZXhwZWN0ZWRCYWNrZW5kVXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0J2VhZ2VyIGNyZWF0ZVNlc3Npb24gc2hvdWxkIGJlIGludm9rZWQgd2l0aCB0aGUgY2xpZW50LWFsbG9jYXRlZCBVUkknLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZG9lcyBub3QgZWFnZXJseSBjcmVhdGUgdGhlIGJhY2tlbmQgc2Vzc2lvbiBpbiBhbiB1bnRydXN0ZWQgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgd29ya3NwYWNlVHJ1c3RlZDogZmFsc2UgfSk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbG9jYWxob3N0X180MzIxL2hvbWUvdXNlci91bnRydXN0ZWQtcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdHByb3ZpZGVyLnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7IC8vIHNldHRsZSBhdXRoIHNvIG9ubHkgdHJ1c3QgY2FuIGdhdGUgdGhlIGVhZ2VyIGNyZWF0ZVxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGxldCB0aGUgKHN1cHByZXNzZWQpIGVhZ2VyIGNyZWF0ZVNlc3Npb24gcGF0aCBzZXR0bGVcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb25uZWN0aW9uLmNyZWF0ZWRTZXNzaW9uVXJpcy5tYXAodSA9PiB1LnRvU3RyaW5nKCkpLFxuXHRcdFx0W10sXG5cdFx0XHQnbm8gZWFnZXIgY3JlYXRlU2Vzc2lvbiBzaG91bGQgYmUgaW52b2tlZCBmb3IgYW4gdW50cnVzdGVkIGZvbGRlcicsXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBCcm93c2UgYWN0aW9ucyAtLS0tLS0tXG5cblx0dGVzdCgnaGFzIG9uZSBicm93c2UgYWN0aW9uIGZvciByZW1vdGUgZm9sZGVycycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5icm93c2VBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyLmJyb3dzZUFjdGlvbnNbMF0ubGFiZWwuaW5jbHVkZXMoJ0ZvbGRlcnMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmJyb3dzZUFjdGlvbnNbMF0ucHJvdmlkZXJJZCwgcHJvdmlkZXIuaWQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gbGlzdGluZyB2aWEgbm90aWZpY2F0aW9ucyAtLS0tLS0tXG5cblx0dGVzdCgnb25EaWRDaGFuZ2VTZXNzaW9ucyBmaXJlcyB3aGVuIHNlc3Npb24gYWRkZWQgbm90aWZpY2F0aW9uIGFycml2ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKGU6IElTZXNzaW9uQ2hhbmdlRXZlbnQpID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0ZmlyZVNlc3Npb25BZGRlZChjb25uZWN0aW9uLCAnbm90aWYtMScsIHsgdGl0bGU6ICdOb3RpZiBTZXNzaW9uJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNbMF0uYWRkZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXS5hZGRlZFswXS50aXRsZS5nZXQoKSwgJ05vdGlmIFNlc3Npb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBhZGRlZCBub3RpZmljYXRpb25zIGluZ2VzdCBhbnkgYWR2ZXJ0aXNlZCBhZ2VudCBwcm92aWRlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbm5lY3Rpb24uc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ29wZW5haScsIGRpc3BsYXlOYW1lOiAnT3BlbkFJJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXG5cdFx0ZmlyZVNlc3Npb25BZGRlZChjb25uZWN0aW9uLCAnY29wLTEnLCB7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnQ29waWxvdCBTZXNzaW9uJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdvYWktMScsIHsgcHJvdmlkZXI6ICdvcGVuYWknLCB0aXRsZTogJ09wZW5BSSBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2Vzc2lvbnMubWFwKHMgPT4gKHsgdGl0bGU6IHMudGl0bGUuZ2V0KCksIHNlc3Npb25UeXBlOiBzLnNlc3Npb25UeXBlIH0pKS5zb3J0KChhLCBiKSA9PiBhLnRpdGxlLmxvY2FsZUNvbXBhcmUoYi50aXRsZSkpLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHRpdGxlOiAnQ29waWxvdCBTZXNzaW9uJywgc2Vzc2lvblR5cGU6IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCB9LFxuXHRcdFx0XHR7IHRpdGxlOiAnT3BlbkFJIFNlc3Npb24nLCBzZXNzaW9uVHlwZTogJ29wZW5haScgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Nlc3Npb24gcmVtb3ZlZCBub3RpZmljYXRpb24gcmVtb3ZlcyBmcm9tIGNhY2hlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ3RvLXJlbW92ZScsIHsgdGl0bGU6ICdSZW1vdmVkJyB9KTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKChlOiBJU2Vzc2lvbkNoYW5nZUV2ZW50KSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGZpcmVTZXNzaW9uUmVtb3ZlZChjb25uZWN0aW9uLCAndG8tcmVtb3ZlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzBdLnJlbW92ZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZHVwbGljYXRlIHNlc3Npb24gYWRkZWQgbm90aWZpY2F0aW9uIGlzIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKGU6IElTZXNzaW9uQ2hhbmdlRXZlbnQpID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Y29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdkdXAtc2VzcycsIHsgdGl0bGU6ICdEdXAnLCBjcmVhdGVkQXQ6IHRpbWVzdGFtcCwgbW9kaWZpZWRBdDogdGltZXN0YW1wIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ2R1cC1zZXNzJywgeyB0aXRsZTogJ0R1cCcsIGNyZWF0ZWRBdDogdGltZXN0YW1wLCBtb2RpZmllZEF0OiB0aW1lc3RhbXAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHByb2plY3QgbWV0YWRhdGEgYXMgd29ya3NwYWNlIGdyb3VwIHNvdXJjZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb2plY3RVcmkgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbG9jYWxob3N0X180MzIxL2hvbWUvdXNlci92c2NvZGU/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjAnKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS90bXAvY29waWxvdC13b3JrdHJlZXMvdnNjb2RlLWZlYXR1cmU/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjAnKTtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncHJvamVjdC0xJywge1xuXHRcdFx0c3VtbWFyeTogJ1Byb2plY3QgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogcHJvamVjdFVyaSwgZGlzcGxheU5hbWU6ICd2c2NvZGUnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgaXNXZWJQbGF0Zm9ybTogdHJ1ZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiB3b3Jrc3BhY2U/LmxhYmVsLFxuXHRcdFx0cmVwb3NpdG9yeTogd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5yb290LnRvU3RyaW5nKCksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LndvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICd2c2NvZGUnLFxuXHRcdFx0cmVwb3NpdG9yeTogcHJvamVjdFVyaS50b1N0cmluZygpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBhZGRlZCBjb252ZXJ0cyBmaWxlIHByb2plY3QgVVJJcyBhbmQgcHJlc2VydmVzIHJlcG9zaXRvcnkgVVJMcycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ2ZpbGUtcHJvamVjdCcsIHtcblx0XHRcdHRpdGxlOiAnRmlsZSBQcm9qZWN0Jyxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9ob21lL3VzZXIvdnNjb2RlJywgZGlzcGxheU5hbWU6ICd2c2NvZGUnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiAnZmlsZTovLy90bXAvY29waWxvdC13b3JrdHJlZXMvdnNjb2RlLWZlYXR1cmUnLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ3VybC1wcm9qZWN0Jywge1xuXHRcdFx0dGl0bGU6ICdVUkwgUHJvamVjdCcsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJywgZGlzcGxheU5hbWU6ICd2c2NvZGUnIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VzID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3b3Jrc3BhY2VzLm1hcCh3b3Jrc3BhY2UgPT4gd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5yb290LnRvU3RyaW5nKCkpLCBbXG5cdFx0XHQndnNjb2RlLWFnZW50LWhvc3Q6Ly9sb2NhbGhvc3RfXzQzMjEvaG9tZS91c2VyL3ZzY29kZT9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCcsXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmluZyBub24tZXhpc3RlbnQgc2Vzc2lvbiBpcyBuby1vcCcsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucygoZTogSVNlc3Npb25DaGFuZ2VFdmVudCkgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRmaXJlU2Vzc2lvblJlbW92ZWQoY29ubmVjdGlvbiwgJ2RvZXMtbm90LWV4aXN0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gbGlzdGluZyB2aWEgcmVmcmVzaCAtLS0tLS0tXG5cblx0dGVzdCgnZ2V0U2Vzc2lvbnMgcG9wdWxhdGVzIGZyb20gY29ubmVjdGlvbi5saXN0U2Vzc2lvbnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignbGlzdC0xJywgeyBzdW1tYXJ5OiAnRmlyc3QnIH0pKTtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignbGlzdC0yJywgeyBzdW1tYXJ5OiAnU2Vjb25kJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucygoZTogSVNlc3Npb25DaGFuZ2VFdmVudCkgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQub2soY2hhbmdlcy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXNzaW9uIGFkZGVkIG5vdGlmaWNhdGlvbiBkb2VzIG5vdCBjYXJyeSBtb2RlbCBtZXRhZGF0YScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdub3RpZi1tb2RlbCcsIHsgdGl0bGU6ICdOb3RpZiBNb2RlbCBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnTm90aWYgTW9kZWwgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5tb2RlbElkLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRNb2RlbCB1cGRhdGVzIGV4aXN0aW5nIHNlc3Npb24gbW9kZWwgd2l0aG91dCBkaXNwYXRjaGluZyBzZXNzaW9uLWxldmVsIG1vZGVsIGNoYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdzZXQtbW9kZWwnLCB7IHRpdGxlOiAnU2V0IE1vZGVsIFNlc3Npb24nIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTZXQgTW9kZWwgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24hLnNlc3Npb25JZCwgJ3JlbW90ZS1sb2NhbGhvc3RfXzQzMjEtY29waWxvdGNsaTpuZXctbW9kZWwnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlbElkLmdldCgpLCAncmVtb3RlLWxvY2FsaG9zdF9fNDMyMS1jb3BpbG90Y2xpOm5ldy1tb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldE1vZGVsIGxlYXZlcyBkaXNwYXRjaCBsb2cgdW50b3VjaGVkIGZvciBsYXRlciBtZXNzYWdlLWxldmVsIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdzZXQtbW9kZWwtY29uZmlnJywgeyB0aXRsZTogJ1NldCBNb2RlbCBDb25maWcgU2Vzc2lvbicgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NldCBNb2RlbCBDb25maWcgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24hLnNlc3Npb25JZCwgJ3JlbW90ZS1sb2NhbGhvc3RfXzQzMjEtY29waWxvdGNsaTpjb25maWd1cmVkLW1vZGVsJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbiEubW9kZWxJZC5nZXQoKSwgJ3JlbW90ZS1sb2NhbGhvc3RfXzQzMjEtY29waWxvdGNsaTpjb25maWd1cmVkLW1vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpZmVjeWNsZSAtLS0tLS0tXG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiByZXR1cm5zIHNlc3Npb24gd2l0aCBjb3JyZWN0IGZpZWxkcycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IGlzV2ViUGxhdGZvcm06IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvdmlkZXJJZCwgcHJvdmlkZXIuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnN0YXR1cy5nZXQoKSwgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24ud29ya3NwYWNlLmdldCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmxhYmVsLCAncHJvamVjdCcpO1xuXHRcdC8vIHNlc3Npb25UeXBlIHNob3VsZCBiZSB0aGUgbG9naWNhbCB0eXBlLCBub3QgdGhlIHJlc291cmNlIHNjaGVtZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnNlc3Npb25UeXBlLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCksIHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGNsZWFycyBzZXNzaW9uIGNvbmZpZyB3aGVuIHJlc29sdmluZyBjb25maWcgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbi5mYWlsUmVzb2x2ZVNlc3Npb25Db25maWcgPSB0cnVlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgaXNXZWJQbGF0Zm9ybTogdHJ1ZSB9KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbG9jYWxob3N0X180MzIxL2hvbWUvdXNlci9wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlVXJpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkJ5UmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxpc3RlZFNlc3Npb25zOiBwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCxcblx0XHRcdHJlc29sdmVkUmVzb3VyY2U6IHJlc29sdmVkPy5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0cmVzb2x2ZWRXb3Jrc3BhY2VMYWJlbDogcmVzb2x2ZWQ/LndvcmtzcGFjZS5nZXQoKT8ubGFiZWwsXG5cdFx0fSwge1xuXHRcdFx0bGlzdGVkU2Vzc2lvbnM6IDAsXG5cdFx0XHRyZXNvbHZlZFJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvbHZlZFdvcmtzcGFjZUxhYmVsOiAncHJvamVjdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyQ29ubmVjdGlvbiBjbGVhcnMgcGVuZGluZyBuZXcgc2Vzc2lvbiBjb25maWcgYW5kIGNhcGFiaWxpdGllcycsICgpID0+IHtcblx0XHRjb25uZWN0aW9uLnNldEFnZW50cyhbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10sIGNhcGFiaWxpdGllczogeyBtdWx0aXBsZUNoYXRzOiB7IGZvcms6IHRydWUgfSB9IH0gYXMgQWdlbnRJbmZvXSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChjb25uZWN0aW9uLCAncnVubmluZy1zZXNzaW9uJywgeyB0aXRsZTogJ1J1bm5pbmcgU2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgcnVubmluZ1Nlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGNvbnN0IHN1cHBvcnRzTXVsdGlwbGVDaGF0c0JlZm9yZURpc2Nvbm5lY3QgPSBydW5uaW5nU2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzO1xuXHRcdHByb3ZpZGVyLmNsZWFyQ29ubmVjdGlvbigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlZDogcHJvdmlkZXIuZ2V0U2Vzc2lvbkJ5UmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSksXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBwcm92aWRlci5zZXNzaW9uVHlwZXMsXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHNCZWZvcmVEaXNjb25uZWN0LFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzQWZ0ZXJEaXNjb25uZWN0OiBydW5uaW5nU2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdmVkOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWc6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25UeXBlczogW10sXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHNCZWZvcmVEaXNjb25uZWN0OiB0cnVlLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzQWZ0ZXJEaXNjb25uZWN0OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGFjdGlvbnMgLS0tLS0tLVxuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gY2FsbHMgZGlzcG9zZVNlc3Npb24gd2l0aCBiYWNrZW5kIGFnZW50IFVSSSBhbmQgcmVtb3ZlcyBmcm9tIGNhY2hlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ2RlbC1zZXNzJywgeyB0aXRsZTogJ1RvIERlbGV0ZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZCgocykgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1RvIERlbGV0ZScpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQsICdTZXNzaW9uIHNob3VsZCBleGlzdCcpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbih0YXJnZXQhLnNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwb3NlZFNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0Ly8gVGhlIGRpc3Bvc2VkIFVSSSBtdXN0IGJlIGEgYmFja2VuZCBhZ2VudCBzZXNzaW9uIFVSSSAoY29waWxvdDovL2RlbC1zZXNzKSxcblx0XHQvLyBub3QgdGhlIFVJIHJlc291cmNlIChyZW1vdGUtbG9jYWxob3N0XzQzMjEtY29waWxvdDovLy9kZWwtc2Vzcylcblx0XHRjb25zdCBkaXNwb3NlZFVyaSA9IGNvbm5lY3Rpb24uZGlzcG9zZWRTZXNzaW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLnByb3ZpZGVyKGRpc3Bvc2VkVXJpKSwgJ2NvcGlsb3RjbGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLmlkKGRpc3Bvc2VkVXJpKSwgJ2RlbC1zZXNzJyk7XG5cdFx0Ly8gU2Vzc2lvbiBzaG91bGQgbm8gbG9uZ2VyIGFwcGVhciBpbiBnZXRTZXNzaW9uc1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbWFpbmluZy5maW5kKChzKSA9PiBzLnRpdGxlLmdldCgpID09PSAnVG8gRGVsZXRlJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gUmVuYW1lIC0tLS0tLS1cblxuXHR0ZXN0KCdyZW5hbWVTZXNzaW9uIGRpc3BhdGNoZXMgU2Vzc2lvblRpdGxlQ2hhbmdlZCBhY3Rpb24gd2l0aCBjb3JyZWN0IHNlc3Npb24gVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ3JlbmFtZS1zZXNzJywgeyB0aXRsZTogJ09sZCBUaXRsZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZCgocykgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ09sZCBUaXRsZScpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQsICdTZXNzaW9uIHNob3VsZCBleGlzdCcpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIucmVuYW1lU2Vzc2lvbih0YXJnZXQhLnNlc3Npb25JZCwgJ05ldyBUaXRsZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBkaXNwYXRjaGVkID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5hY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpc3BhdGNoZWQuYWN0aW9uIGFzIHsgdGl0bGU6IHN0cmluZyB9KS50aXRsZSwgJ05ldyBUaXRsZScpO1xuXHRcdC8vIFRoZSBzZXNzaW9uIFVSSSBpbiB0aGUgYWN0aW9uIG11c3QgYmUgdGhlIGJhY2tlbmQgYWdlbnQgc2Vzc2lvbiBVUklcblx0XHRjb25zdCBhY3Rpb25TZXNzaW9uID0gZGlzcGF0Y2hlZC5jaGFubmVsLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFnZW50U2Vzc2lvbi5wcm92aWRlcihhY3Rpb25TZXNzaW9uKSwgJ2NvcGlsb3RjbGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLmlkKGFjdGlvblNlc3Npb24pLCAncmVuYW1lLXNlc3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5jbGllbnRJZCwgJ3Rlc3QtY2xpZW50LTEnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lU2Vzc2lvbiB1cGRhdGVzIGxvY2FsIHRpdGxlIG9wdGltaXN0aWNhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ3JlbmFtZS1vcHQnLCB7IHRpdGxlOiAnQmVmb3JlJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBzZXNzaW9ucy5maW5kKChzKSA9PiBzLnRpdGxlLmdldCgpID09PSAnQmVmb3JlJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5yZW5hbWVTZXNzaW9uKHRhcmdldCEuc2Vzc2lvbklkLCAnQWZ0ZXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQhLnRpdGxlLmdldCgpLCAnQWZ0ZXInKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lU2Vzc2lvbiBpcyBuby1vcCBmb3IgdW5rbm93biBjaGF0SWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0YXdhaXQgcHJvdmlkZXIucmVuYW1lU2Vzc2lvbignbm9uZXhpc3RlbnQtaWQnLCAnSWdub3JlZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lU2Vzc2lvbiBpbmNyZW1lbnRzIGNsaWVudFNlcSBvbiBzdWNjZXNzaXZlIGNhbGxzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbi5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3NlcS1zZXNzJywgeyBzdW1tYXJ5OiAnU2VxIFRlc3QnIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZCgocykgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NlcSBUZXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5yZW5hbWVTZXNzaW9uKHRhcmdldCEuc2Vzc2lvbklkLCAnVGl0bGUgMScpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnJlbmFtZVNlc3Npb24odGFyZ2V0IS5zZXNzaW9uSWQsICdUaXRsZSAyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmNsaWVudFNlcSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnNbMV0uY2xpZW50U2VxLCAxKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3NlcnZlci1lY2hvZWQgU2Vzc2lvblRpdGxlQ2hhbmdlZCB1cGRhdGVzIGNhY2hlZCB0aXRsZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdlY2hvLXNlc3MnLCB7IHRpdGxlOiAnT3JpZ2luYWwnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHNlc3Npb25zLmZpbmQoKHMpID0+IHMudGl0bGUuZ2V0KCkgPT09ICdPcmlnaW5hbCcpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQpO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKGU6IElTZXNzaW9uQ2hhbmdlRXZlbnQpID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIHNlcnZlciBlY2hvaW5nIGEgdGl0bGUgY2hhbmdlIChmcm9tIGF1dG8tZ2VuZXJhdGlvbiBvciBhbm90aGVyIGNsaWVudClcblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdlY2hvLXNlc3MnKS50b1N0cmluZygpLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0dGl0bGU6ICdTZXJ2ZXIgVGl0bGUnLFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCEudGl0bGUuZ2V0KCksICdTZXJ2ZXIgVGl0bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzBdLmNoYW5nZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmVyLWVjaG9lZCBDaGF0VHVyblN0YXJ0ZWQgbW9kZWwgZG9lcyBub3QgdXBkYXRlIGNhY2hlZCBzZXNzaW9uIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoY29ubmVjdGlvbiwgJ21vZGVsLWNoYW5nZScsIHsgdGl0bGU6ICdNb2RlbCBDaGFuZ2UnIH0pO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ01vZGVsIENoYW5nZScpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQpO1xuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHRhcmdldCEuc2Vzc2lvbklkLCAncmVtb3RlLWxvY2FsaG9zdF9fNDMyMS1jb3BpbG90Y2xpOm9sZC1tb2RlbCcpO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKGU6IElTZXNzaW9uQ2hhbmdlRXZlbnQpID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbW9kZWwtY2hhbmdlJykudG9TdHJpbmcoKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogeyBpZDogJ25ldy1tb2RlbCcgfSB9LFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCEubW9kZWxJZC5nZXQoKSwgJ3JlbW90ZS1sb2NhbGhvc3RfXzQzMjEtY29waWxvdGNsaTpvbGQtbW9kZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWVkIHRpdGxlIHN1cnZpdmVzIHNlc3Npb24gcmVmcmVzaCBmcm9tIGxpc3RTZXNzaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlIHNlcnZlciBwZXJzaXN0aW5nIHRoZSByZW5hbWVkIHRpdGxlOiBhZnRlciByZW5hbWUsIGxpc3RTZXNzaW9uc1xuXHRcdC8vIHJldHVybnMgdGhlIHVwZGF0ZWQgc3VtbWFyeVxuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdwZXJzaXN0LXNlc3MnLCB7IHN1bW1hcnk6ICdPcmlnaW5hbCBUaXRsZScgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFZlcmlmeSBpbml0aWFsIHRpdGxlXG5cdFx0bGV0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRsZXQgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZCgocykgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ09yaWdpbmFsIFRpdGxlJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCwgJ1Nlc3Npb24gc2hvdWxkIGV4aXN0IHdpdGggb3JpZ2luYWwgdGl0bGUnKTtcblxuXHRcdC8vIFNpbXVsYXRlIHNlcnZlciB1cGRhdGluZyB0aGUgc3VtbWFyeSAoYXMgd291bGQgaGFwcGVuIGFmdGVyIHBlcnNpc3QgKyByZWxvYWQpXG5cdFx0Y29ubmVjdGlvbi5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3BlcnNpc3Qtc2VzcycsIHsgc3VtbWFyeTogJ1JlbmFtZWQgVGl0bGUnLCBtb2RpZmllZFRpbWU6IDUwMDAgfSkpO1xuXG5cdFx0Ly8gVHJpZ2dlciByZWZyZXNoIHZpYSB0dXJuQ29tcGxldGUgYWN0aW9uIChzaW11bGF0ZXMgd2hhdCBoYXBwZW5zIG9uIHJlbG9hZClcblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3BlcnNpc3Qtc2VzcycpLnRvU3RyaW5nKCkpLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0c2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdHRhcmdldCA9IHNlc3Npb25zLmZpbmQoKHMpID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZW5hbWVkIFRpdGxlJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCwgJ1Nlc3Npb24gc2hvdWxkIGhhdmUgcmVuYW1lZCB0aXRsZSBhZnRlciByZWZyZXNoJyk7XG5cdH0pKTtcblxuXHQvLyAtLS0tIFNlbmQgLS0tLS0tLVxuXG5cdHRlc3QoJ25ldyBzZXNzaW9uIHN0YXlzIGxvYWRpbmcgd2hlbiByZXF1aXJlZCBjb25maWcgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25uZWN0aW9uLnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCByZXF1aXJlZDogWydicmFuY2gnXSwgcHJvcGVydGllczogeyBicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgZW51bTogWydtYWluJ10gfSB9IH0sXG5cdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdHByb3ZpZGVyLnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjb25maWcgPT4gY29uZmlnPy5zY2hlbWEucmVxdWlyZWQ/LmluY2x1ZGVzKCdicmFuY2gnKSA9PT0gdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5sb2FkaW5nLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2FjaGVkIHNlc3Npb24gbG9hZGluZyByZWZsZWN0cyBhdXRoZW50aWNhdGlvblBlbmRpbmcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignY2FjaGVkLWF1dGgnLCB7IHN1bW1hcnk6ICdDYWNoZWQnIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdDYWNoZWQnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0Ly8gRGVmYXVsdCBhdCBjb25zdHJ1Y3Rpb24gaXMgYHRydWVgOyBjbGVhciBpdCBhbmQgdmVyaWZ5LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5sb2FkaW5nLmdldCgpLCB0cnVlKTtcblxuXHRcdHByb3ZpZGVyLnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24hLmxvYWRpbmcuZ2V0KCksIGZhbHNlKTtcblxuXHRcdC8vIFN0aWNreTogYSBzdWJzZXF1ZW50IHJlLWF1dGggcGFzcyBtdXN0IG5vdCBmbGlja2VyIHRoZSBVSSBiYWNrIHRvIGxvYWRpbmcuXG5cdFx0cHJvdmlkZXIuc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5sb2FkaW5nLmdldCgpLCBmYWxzZSk7XG5cdH0pKTtcblxuXHR0ZXN0KCd1bnB1Ymxpc2hDYWNoZWRTZXNzaW9ucyBoaWRlcyBzZXNzaW9ucyBidXQgcmV0YWlucyBwZXJzaXN0ZWQgY2FjaGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigna2VlcC1tZScsIHsgc3VtbWFyeTogJ0tlZXAgTWUnIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBldmVudHMucHVzaChlKSkpO1xuXG5cdFx0cHJvdmlkZXIudW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTtcblxuXHRcdC8vIFNlc3Npb25zIGFyZSBoaWRkZW4gZnJvbSB0aGUgbGlzdGluZyBpbW1lZGlhdGVseS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzZXNzaW9uQ291bnQ6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLFxuXHRcdFx0XHRldmVudENvdW50OiBldmVudHMubGVuZ3RoLFxuXHRcdFx0XHRldmVudFJlbW92ZWRUaXRsZXM6IGV2ZW50cy5mbGF0TWFwKGUgPT4gZS5yZW1vdmVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpKSxcblx0XHRcdH0sXG5cdFx0XHR7IHNlc3Npb25Db3VudDogMCwgZXZlbnRDb3VudDogMSwgZXZlbnRSZW1vdmVkVGl0bGVzOiBbXSB9LFxuXHRcdCk7XG5cblx0XHQvLyBGbHVzaCB0cmlnZ2VycyBvbldpbGxTYXZlU3RhdGU7IHRoZSBtZXRhZGF0YSBtdXN0IHN1cnZpdmUgc28gdGhlXG5cdFx0Ly8gc2Vzc2lvbiByZS1zZXJpYWxpemVzIGluc3RlYWQgb2YgYmVpbmcgZHJvcHBlZCBmcm9tIHN0b3JhZ2UuXG5cdFx0YXdhaXQgc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyMiA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpLCB7IHN0b3JhZ2VTZXJ2aWNlLCBub0Nvbm5lY3Rpb246IHRydWUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHByb3ZpZGVyMi5nZXRTZXNzaW9ucygpLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLFxuXHRcdFx0WydLZWVwIE1lJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2F1dGhvcml0YXRpdmUgc2Vzc2lvbiB1cGRhdGUgcGVyc2lzdHMgbWF0ZXJpYWxpemVkIHdvcmtzcGFjZSBtZXRhZGF0YScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGNvbm5lY3Rpb24sICdwZXJzaXN0LXVwc2VydCcsIHtcblx0XHRcdHRpdGxlOiAnV29ya3RyZWUgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vVXNlcnMvbWUvcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAncHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6ICdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3QnLFxuXHRcdFx0Y3JlYXRlZEF0OiB0aW1lc3RhbXAsXG5cdFx0XHRtb2RpZmllZEF0OiB0aW1lc3RhbXAsXG5cdFx0fSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChjb25uZWN0aW9uLCAncGVyc2lzdC11cHNlcnQnLCB7XG5cdFx0XHR0aXRsZTogJ1dvcmt0cmVlIFNlc3Npb24nLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3QnLCBkaXNwbGF5TmFtZTogJ3Byb2plY3QnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiAnZmlsZTovLy9Vc2Vycy9tZS9wcm9qZWN0Lndvcmt0cmVlcy9zZXNzaW9uJyxcblx0XHRcdGNyZWF0ZWRBdDogdGltZXN0YW1wLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMTAwMCkudG9JU09TdHJpbmcoKSxcblx0XHR9KTtcblx0XHRjb25zdCBjdXJyZW50V29ya3NwYWNlID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCkhO1xuXG5cdFx0YXdhaXQgc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkUHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSwgeyBzdG9yYWdlU2VydmljZSwgbm9Db25uZWN0aW9uOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlc3RvcmVkV29ya3NwYWNlID0gcmVzdG9yZWRQcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiB7XG5cdFx0XHRcdHJvb3Q6IGN1cnJlbnRXb3Jrc3BhY2UuZm9sZGVyc1swXS5yb290LnBhdGgsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IGN1cnJlbnRXb3Jrc3BhY2UuZm9sZGVyc1swXS53b3JraW5nRGlyZWN0b3J5LnBhdGgsXG5cdFx0XHR9LFxuXHRcdFx0cmVzdG9yZWQ6IHtcblx0XHRcdFx0cm9vdDogcmVzdG9yZWRXb3Jrc3BhY2UuZm9sZGVyc1swXS5yb290LnBhdGgsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlc3RvcmVkV29ya3NwYWNlLmZvbGRlcnNbMF0ud29ya2luZ0RpcmVjdG9yeS5wYXRoLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiB7XG5cdFx0XHRcdHJvb3Q6ICcvVXNlcnMvbWUvcHJvamVjdCcsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6ICcvVXNlcnMvbWUvcHJvamVjdC53b3JrdHJlZXMvc2Vzc2lvbicsXG5cdFx0XHR9LFxuXHRcdFx0cmVzdG9yZWQ6IHtcblx0XHRcdFx0cm9vdDogJy9Vc2Vycy9tZS9wcm9qZWN0Jyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogJy9Vc2Vycy9tZS9wcm9qZWN0Lndvcmt0cmVlcy9zZXNzaW9uJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXRDb25uZWN0aW9uIGFmdGVyIHVucHVibGlzaENhY2hlZFNlc3Npb25zIHJlc3RvcmVzIGNhY2hlZCBzZXNzaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdyZXN0b3JlLW1lJywgeyBzdW1tYXJ5OiAnUmVzdG9yZSBNZScgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxKTtcblxuXHRcdHByb3ZpZGVyLnVucHVibGlzaENhY2hlZFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwKTtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBob3N0IGNvbWluZyBiYWNrIG9ubGluZSB3aXRoIGEgZnJlc2ggY29ubmVjdGlvbiB0aGF0XG5cdFx0Ly8gc3RpbGwgcmVwb3J0cyB0aGUgc2FtZSBzZXNzaW9uIHdpdGggdXBkYXRlZCBtZXRhZGF0YS5cblx0XHRjb25zdCByZWNvbm5lY3RlZCA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZWNvbm5lY3RlZC5kaXNwb3NlKCkpKTtcblx0XHRyZWNvbm5lY3RlZC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3Jlc3RvcmUtbWUnLCB7IHN1bW1hcnk6ICdSZXN0b3JlZCcgfSkpO1xuXHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb24ocmVjb25uZWN0ZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzZXNzaW9uczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKSxcblx0XHRcdFx0YWRkZWQ6IGV2ZW50cy5mbGF0TWFwKGUgPT4gZS5hZGRlZC5tYXAocyA9PiBzLnRpdGxlLmdldCgpKSksXG5cdFx0XHRcdGNoYW5nZWQ6IGV2ZW50cy5mbGF0TWFwKGUgPT4gZS5jaGFuZ2VkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpKSxcblx0XHRcdFx0cmVtb3ZlZDogZXZlbnRzLmZsYXRNYXAoZSA9PiBlLnJlbW92ZWQubWFwKHMgPT4gcy50aXRsZS5nZXQoKSkpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2Vzc2lvbnM6IFsnUmVzdG9yZWQnXSxcblx0XHRcdFx0YWRkZWQ6IFsnUmVzdG9yZWQnXSxcblx0XHRcdFx0Y2hhbmdlZDogWydSZXN0b3JlZCddLFxuXHRcdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IHRocm93cyBmb3IgdW5rbm93biBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gcHJvdmlkZXIuc2VuZFJlcXVlc3QoJ25vbmV4aXN0ZW50JywgVVJJLnBhcnNlKCd1bnRpdGxlZDpjaGF0JyksIHsgcXVlcnk6ICd0ZXN0JyB9KSxcblx0XHRcdC9ub3QgZm91bmQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IGZvcndhcmRzIHJlc29sdmVkIHNlc3Npb24gY29uZmlnIHRvIGNoYXQgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnNbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChfcmVzb3VyY2UsIF9tZXNzYWdlLCBvcHRpb25zKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4gPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0XHRcdHNlbmRPcHRpb25zLnB1c2gob3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29ubmVjdGlvbi5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NyZWF0ZWQtZnJvbS1zZW5kJywgeyBzdW1tYXJ5OiAnQ3JlYXRlZCBGcm9tIFNlbmQnIH0pKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBDaGF0U2VuZFJlc3VsdCBleHRlbmRzIHsga2luZDogJ3NlbnQnOyBkYXRhOiBpbmZlciBEIH0gPyBEIDogbmV2ZXIgfTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdHByb3ZpZGVyLnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjb25maWcgPT4gY29uZmlnPy52YWx1ZXMuaXNvbGF0aW9uID09PSAnd29ya3RyZWUnKTtcblxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VuZE9wdGlvbnMubWFwKG9wdGlvbnMgPT4gb3B0aW9ucy5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnKSwgW3sgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH1dKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGRhdGEgYWRhcHRlciAtLS0tLS0tXG5cblx0dGVzdCgnc2Vzc2lvbiBhZGFwdGVyIGhhcyBjb3JyZWN0IHdvcmtzcGFjZSBmcm9tIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbi5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3dzLXNlc3MnLCB7IHN1bW1hcnk6ICdXUyBUZXN0Jywgd29ya2luZ0RpcmVjdG9yeTogVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvbXlyZXBvP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wJykgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbiwgeyBpc1dlYlBsYXRmb3JtOiB0cnVlIH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCB3c1Nlc3Npb24gPSBzZXNzaW9ucy5maW5kKChzKSA9PiBzLnRpdGxlLmdldCgpID09PSAnV1MgVGVzdCcpO1xuXHRcdGFzc2VydC5vayh3c1Nlc3Npb24sICdTZXNzaW9uIHdpdGggd29ya2luZyBkaXJlY3Rvcnkgc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB3c1Nlc3Npb24hLndvcmtzcGFjZS5nZXQoKTtcblx0XHRhc3NlcnQub2sod29ya3NwYWNlLCAnV29ya3NwYWNlIHNob3VsZCBiZSBwb3B1bGF0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlIS5sYWJlbCwgJ215cmVwbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2UhLnJlcXVpcmVzV29ya3NwYWNlVHJ1c3QsIHRydWUsICdyZW1vdGUgc2Vzc2lvbiBmb2xkZXJzIHJlcXVpcmUgd29ya3NwYWNlIHRydXN0Jyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXNzaW9uIGFkYXB0ZXIgd2l0aG91dCB3b3JraW5nIGRpcmVjdG9yeSBoYXMgbm8gd29ya3NwYWNlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbi5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ25vLXdzLXNlc3MnLCB7IHN1bW1hcnk6ICdObyBXUycgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9ucy5maW5kKChzKSA9PiBzLnRpdGxlLmdldCgpID09PSAnTm8gV1MnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbiwgJ1Nlc3Npb24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24hLndvcmtzcGFjZS5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Nlc3Npb24gYWRhcHRlciB1c2VzIHJhdyBJRCBhcyBmYWxsYmFjayB0aXRsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdhYmNkZWYxMjM0NTY3ODkwJykpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbik7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1swXTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udGl0bGUuZ2V0KCksICdTZXNzaW9uIGFiY2RlZjEyJyk7XG5cdH0pKTtcblxuXHQvLyAtLS0tIFJlZnJlc2ggb24gdHVybkNvbXBsZXRlIC0tLS0tLS1cblxuXHR0ZXN0KCd0dXJuQ29tcGxldGUgYWN0aW9uIHRyaWdnZXJzIHNlc3Npb24gcmVmcmVzaCBmb3IgbWF0Y2hpbmcgcHJvdmlkZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigndHVybi1zZXNzJywgeyBzdW1tYXJ5OiAnQmVmb3JlJywgbW9kaWZpZWRUaW1lOiAxMDAwIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFVwZGF0ZSBvbiBjb25uZWN0aW9uIHNpZGVcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigndHVybi1zZXNzJywgeyBzdW1tYXJ5OiAnQWZ0ZXInLCBtb2RpZmllZFRpbWU6IDUwMDAgfSkpO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKGU6IElTZXNzaW9uQ2hhbmdlRXZlbnQpID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICd0dXJuLXNlc3MnKS50b1N0cmluZygpKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhjaGFuZ2VzLmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IHVwZGF0ZWRTZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKChzKSA9PiBzLnRpdGxlLmdldCgpID09PSAnQWZ0ZXInKTtcblx0XHRhc3NlcnQub2sodXBkYXRlZFNlc3Npb24sICdTZXNzaW9uIHNob3VsZCBoYXZlIHVwZGF0ZWQgdGl0bGUnKTtcblx0fSkpO1xuXG5cdC8vIC0tLS0gUnVubmluZyBzZXNzaW9uIGNvbmZpZyBzZWVkaW5nIChmcm9tIFNlc3Npb25TdGF0ZS5jb25maWcpIC0tLS0tLS1cblxuXHR0ZXN0KCdnZXRTZXNzaW9uQ29uZmlnIHNlZWRzIHJ1bm5pbmcgY29uZmlnIGZyb20gc2Vzc2lvbiBzdGF0ZSBzdWJzY3JpcHRpb24gd2l0aCBmdWxsIHNjaGVtYScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdzZWVkLTEnLCB7IHN1bW1hcnk6ICdTZWVkZWQgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NlZWRlZCBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNvbmZpZzogU2Vzc2lvbkNvbmZpZ1N0YXRlID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10sIHNlc3Npb25NdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0aXNvbGF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0lzb2xhdGlvbicsIGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sIHJlYWRPbmx5OiB0cnVlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1NlZWRlZCBTZXNzaW9uJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y29uZmlnLFxuXHRcdH07XG5cdFx0Y29ubmVjdGlvbi5zZXRTZXNzaW9uU3RhdGUoJ3NlZWQtMScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uIS5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnZGVmYXVsdCcpO1xuXG5cdFx0Ly8gRnVsbCBzY2hlbWEgKyB2YWx1ZXMgYXJlIHJldGFpbmVkOyB0aGUgSlNPTkMgc2V0dGluZ3MgZWRpdG9yIHJlbGllc1xuXHRcdC8vIG9uIHRoaXMgdG8gcHJlc2VydmUgbm9uLW11dGFibGUgdmFsdWVzIHRocm91Z2ggcmVwbGFjZSBkaXNwYXRjaGVzLlxuXHRcdGNvbnN0IHNlZWRlZCA9IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5rZXlzKHNlZWRlZD8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKSxcblx0XHRcdHZhbHVlczogc2VlZGVkPy52YWx1ZXMsXG5cdFx0fSwge1xuXHRcdFx0cHJvcGVydGllczogWydhdXRvQXBwcm92ZScsICdpc29sYXRpb24nXSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlbW92aW5nIGEgc2Vzc2lvbiBkaXNwb3NlcyBpdHMgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignc2VlZC0yJywgeyBzdW1tYXJ5OiAnU3ViIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTdWIgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpU3RyID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZWVkLTInKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpID8/IDAsIDApO1xuXG5cdFx0ZmlyZVNlc3Npb25SZW1vdmVkKGNvbm5lY3Rpb24sICdzZWVkLTInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0ciksIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVwbGFjaW5nIHRoZSBjb25uZWN0aW9uIGRpc3Bvc2VzIGFsbCBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25uZWN0aW9uLmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignc2VlZC0zJywgeyBzdW1tYXJ5OiAnUmVjb25uZWN0IFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZWNvbm5lY3QgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpU3RyID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZWVkLTMnKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpID8/IDAsIDApO1xuXG5cdFx0Y29uc3QgbmV3Q29ubmVjdGlvbiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXdDb25uZWN0aW9uLmRpc3Bvc2UoKSkpO1xuXHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb24obmV3Q29ubmVjdGlvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0fSkpO1xuXG5cdC8vIC0tLS0gTm9uLXdlYiBsYWJlbCBmb3JtYXR0aW5nIChuYXRpdmUgZGVza3RvcCkgLS0tLS0tLVxuXHQvL1xuXHQvLyBJbiB0aGUgYnJvd3NlciB0ZXN0IHJ1bm5lciBgaXNXZWJgIGlzIGFsd2F5cyBgdHJ1ZWAsIHNvIGJ5IGRlZmF1bHRcblx0Ly8gZXZlcnkgdGVzdCBhYm92ZSBleGVyY2lzZXMgdGhlIHdlYiBicmFuY2ggKHdoaWNoIGRyb3BzIHRoZVxuXHQvLyBgWzxob3N0bmFtZT5dYCBzdWZmaXggYmVjYXVzZSB0aGUgdGl0bGViYXIgaG9zdCBmaWx0ZXIgcmVuZGVycyBpdFxuXHQvLyByZWR1bmRhbnRseSkuIFRoZXNlIHRlc3RzIHBpbiB0aGUgbm9uLXdlYiAoZGVza3RvcCkgYmVoYXZpb3VyIHdoZXJlXG5cdC8vIHRoZSBob3N0IHN1ZmZpeCAvIGhvc3QgZGVzY3JpcHRpb24gbXVzdCBzdGlsbCBhcHBlYXIuXG5cblx0dGVzdCgnbm9uLXdlYjogcmVzb2x2ZVdvcmtzcGFjZSBpbmNsdWRlcyBbaG9zdF0gc3VmZml4IGluIGxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgaXNXZWJQbGF0Zm9ybTogZmFsc2UgfSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHdzID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZSh1cmkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MubGFiZWwsICdwcm9qZWN0IFtUZXN0IEhvc3RdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi13ZWI6IHNlc3Npb24gd29ya3NwYWNlIGZyb20gcHJvamVjdCBtZXRhZGF0YSBpbmNsdWRlcyBbaG9zdF0gc3VmZml4JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvamVjdFVyaSA9IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LWhvc3Q6Ly9sb2NhbGhvc3RfXzQzMjEvaG9tZS91c2VyL3ZzY29kZT9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCcpO1xuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdwcm9qZWN0LTEnLCB7XG5cdFx0XHRzdW1tYXJ5OiAnUHJvamVjdCBTZXNzaW9uJyxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiBwcm9qZWN0VXJpLCBkaXNwbGF5TmFtZTogJ3ZzY29kZScgfSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBjb25uZWN0aW9uLCB7IGlzV2ViUGxhdGZvcm06IGZhbHNlIH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKT8ubGFiZWwsICd2c2NvZGUgW1Rlc3QgSG9zdF0nKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25vbi13ZWI6IHNlc3Npb24gd29ya3NwYWNlIGZyb20gd29ya2luZyBkaXJlY3RvcnkgaW5jbHVkZXMgW2hvc3RdIHN1ZmZpeCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCd3cy1zZXNzJywge1xuXHRcdFx0c3VtbWFyeTogJ1dTIFRlc3QnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtaG9zdDovL2xvY2FsaG9zdF9fNDMyMS9ob21lL3VzZXIvbXlyZXBvP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wJyksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbiwgeyBpc1dlYlBsYXRmb3JtOiBmYWxzZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCB3c1Nlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnV1MgVGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3c1Nlc3Npb24/LndvcmtzcGFjZS5nZXQoKT8ubGFiZWwsICdteXJlcG8gW1Rlc3QgSG9zdF0nKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25vbi13ZWI6IGNyZWF0ZU5ld1Nlc3Npb24gd29ya3NwYWNlIGxhYmVsIGluY2x1ZGVzIFtob3N0XSBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbiwgeyBpc1dlYlBsYXRmb3JtOiBmYWxzZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbG9jYWxob3N0X180MzIxL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmxhYmVsLCAncHJvamVjdCBbVGVzdCBIb3N0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdub24td2ViOiBpZGxlIHNlc3Npb24gZGVzY3JpcHRpb24gaXMgdW5kZWZpbmVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29ubmVjdGlvbi5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2Rlc2Mtc2VzcycsIHsgc3VtbWFyeTogJ0Rlc2MgVGVzdCcgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgY29ubmVjdGlvbiwgeyBpc1dlYlBsYXRmb3JtOiBmYWxzZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0Rlc2MgVGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5kZXNjcmlwdGlvbi5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3dlYjogc2Vzc2lvbiBkZXNjcmlwdGlvbiBpcyB1bmRlZmluZWQgKGhvc3QgZmlsdGVyIGRyb3Bkb3duIHJlcGxhY2VzIGl0KScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbm5lY3Rpb24uYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdkZXNjLXNlc3Mtd2ViJywgeyBzdW1tYXJ5OiAnRGVzYyBXZWInIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGNvbm5lY3Rpb24sIHsgaXNXZWJQbGF0Zm9ybTogdHJ1ZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0Rlc2MgV2ViJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmRlc2NyaXB0aW9uLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQixvQkFBcUM7QUFDL0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUF1RTtBQUVoRixTQUFTLGFB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
