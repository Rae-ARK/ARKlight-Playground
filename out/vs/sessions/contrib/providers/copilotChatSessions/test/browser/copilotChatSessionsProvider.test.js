import assert from "assert";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { timeout } from "../../../../../../base/common/async.js";
import { DisposableStore, ImmortalReference, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { autorun, constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService, IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { TestStorageService } from "../../../../../../workbench/test/common/workbenchTestServices.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IAgentSessionsService } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionProviders } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js";
import { IChatService } from "../../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatSessionStatus, IChatSessionsService } from "../../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { IChatWidgetService } from "../../../../../../workbench/contrib/chat/browser/chat.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { IGitService } from "../../../../../../workbench/contrib/git/common/gitService.js";
import { GITHUB_REMOTE_FILE_SCHEME, SessionStatus } from "../../../../../services/sessions/common/session.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../../../../workbench/contrib/chat/common/constants.js";
import { CLAUDE_CODE_ENABLED_SETTING, CopilotChatSessionsProvider, COPILOT_PROVIDER_ID, ClaudeCodeSessionType, CopilotCloudSessionType } from "../../browser/copilotChatSessionsProvider.js";
import { ClaudePreferAgentHostAgentsSettingId } from "../../../../../../platform/agentHost/common/agentService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IUriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { extUri } from "../../../../../../base/common/resources.js";
import { CopilotCLISessionType } from "../../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IGitHubService } from "../../../../github/browser/githubService.js";
import { IPullRequestIconCache } from "../../../../github/browser/pullRequestIconCache.js";
import { computePullRequestIcon, GitHubPullRequestState } from "../../../../github/common/types.js";
function createMockAgentSession(resource, opts) {
  const providerType = opts?.providerType ?? AgentSessionProviders.Background;
  let archived = opts?.archived ?? false;
  let read = opts?.read ?? true;
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = resource;
      this.providerType = providerType;
      this.providerLabel = "Copilot";
      this.label = opts?.title ?? "Test Session";
      this.status = opts?.status ?? ChatSessionStatus.Completed;
      this.icon = Codicon.copilot;
      this.timing = { created: opts?.createdAt ?? Date.now(), lastRequestStarted: void 0, lastRequestEnded: void 0 };
      this.metadata = opts?.metadata ?? { repositoryPath: "/test/repo" };
    }
    isArchived() {
      return archived;
    }
    setArchived(value) {
      archived = value;
    }
    isPinned() {
      return false;
    }
    setPinned() {
    }
    isRead() {
      return read;
    }
    isMarkedUnread() {
      return false;
    }
    setRead(value) {
      read = value;
      opts?.onSetRead?.();
    }
  }();
}
class MockAgentSessionsModel {
  constructor() {
    this._sessions = [];
    this._onDidChangeSessions = new Emitter();
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this.onWillResolve = Event.None;
    this.onDidResolve = Event.None;
    this.onDidChangeSessionArchivedState = Event.None;
    this.resolved = true;
  }
  get sessions() {
    return [...this._sessions];
  }
  getSession(resource) {
    return this._sessions.find((s) => s.resource.toString() === resource.toString());
  }
  addSession(session) {
    this._sessions.push(session);
    this._onDidChangeSessions.fire();
  }
  removeSession(resource) {
    const idx = this._sessions.findIndex((s) => s.resource.toString() === resource.toString());
    if (idx !== -1) {
      this._sessions.splice(idx, 1);
      this._onDidChangeSessions.fire();
    }
  }
  replaceSession(session) {
    const idx = this._sessions.findIndex((s) => s.resource.toString() === session.resource.toString());
    assert.ok(idx >= 0, "session should exist before replacing");
    this._sessions.splice(idx, 1, session);
    this._onDidChangeSessions.fire();
  }
  fireDidChangeSessions() {
    this._onDidChangeSessions.fire();
  }
  async resolve() {
  }
  dispose() {
    this._onDidChangeSessions.dispose();
  }
}
function isCommandSessionItem(item) {
  return typeof item === "object" && item !== null && "resource" in item && URI.isUri(item.resource);
}
class TestPullRequestIconCache {
  constructor() {
    this._icons = /* @__PURE__ */ new Map();
  }
  get(prLink) {
    return this._icons.get(prLink);
  }
  set(prLink, icon) {
    this._icons.set(prLink, icon);
  }
}
class TestGitHubService extends mock() {
  constructor(_pullRequestNumber) {
    super();
    this._pullRequestNumber = _pullRequestNumber;
    this._pullRequest = observableValue(this, void 0);
    this.lookupCalls = 0;
    this.pullRequestModelReferenceCalls = 0;
    this.findPullRequestNumberByHeadBranch = async () => {
      this.lookupCalls++;
      return this._pullRequestNumber;
    };
    this.createPullRequestModelReference = () => {
      this.pullRequestModelReferenceCalls++;
      return new ImmortalReference(this._pullRequestModel);
    };
    const pullRequest = this._pullRequest;
    this._pullRequestModel = new class extends mock() {
      constructor() {
        super(...arguments);
        this.pullRequest = pullRequest;
      }
    }();
  }
  setPullRequest(pullRequest) {
    this._pullRequest.set(pullRequest, void 0);
  }
}
function createPullRequest(state, isDraft = false) {
  return {
    number: 42,
    title: "Cloud PR",
    body: "",
    state,
    author: { login: "owner", avatarUrl: "" },
    headRef: "feature",
    headSha: "head",
    baseRef: "main",
    isDraft,
    createdAt: "",
    updatedAt: "",
    mergedAt: state === GitHubPullRequestState.Merged ? "" : void 0,
    mergeable: void 0,
    mergeableState: ""
  };
}
function createProvider(disposables, model, opts) {
  return createProviderWithConfig(disposables, model, opts).provider;
}
function createProviderWithConfig(disposables, model, opts) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const configService = new TestConfigurationService();
  configService.setUserConfiguration("sessions.github.copilot.multiChatSessions", opts?.multiChatEnabled ?? true);
  configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, opts?.claudeEnabled ?? true);
  configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, opts?.preferAgentHost ?? false);
  configService.setUserConfiguration(ChatConfiguration.CopilotCliHideExtensionHostAgents, opts?.hideCopilotCli ?? false);
  instantiationService.stub(IConfigurationService, configService);
  instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(opts?.agentHostEnabled ?? true) });
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, {
    confirm: async () => ({ confirmed: true })
  });
  instantiationService.stub(ICommandService, {
    executeCommand: async (id, ...args) => {
      opts?.commandExecutions?.push({ id, args });
      const items = args[0];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (isCommandSessionItem(item)) {
            model.removeSession(item.resource);
          }
        }
      } else if (isCommandSessionItem(items)) {
        model.removeSession(items.resource);
      }
      return void 0;
    }
  });
  instantiationService.stub(IAgentSessionsService, {
    model,
    onDidChangeSessionArchivedState: Event.None,
    getSession: (resource) => model.getSession(resource)
  });
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: () => ({ type: "test-copilot", name: "test", displayName: "Test", description: "test", icon: void 0 }),
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } }),
    onDidCommitSession: Event.None,
    updateSessionOptions: () => true,
    setSessionOption: () => true,
    getSessionOption: () => void 0,
    getOptionGroupsForSessionType: () => opts?.getOptionGroups?.(),
    onDidChangeOptionGroups: Event.None
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: async () => void 0,
    sendRequest: async () => ({ kind: "sent", data: {} }),
    removeHistoryEntry: async (resource) => {
      model.removeSession(resource);
    },
    setChatSessionTitle: () => {
    }
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => void 0,
    lastFocusedWidget: void 0,
    onDidChangeFocusedSession: Event.None
  });
  instantiationService.stub(ILanguageModelsService, opts?.languageModelsService ?? { lookupLanguageModel: () => void 0 });
  instantiationService.stub(ILanguageModelToolsService, {
    toToolReferences: () => []
  });
  instantiationService.stub(IInstantiationService, instantiationService);
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(opts?.agentHostEnabled ?? true) });
  instantiationService.stub(IGitHubService, opts?.gitHubService ?? new TestGitHubService());
  instantiationService.stub(IPullRequestIconCache, opts?.pullRequestIconCache ?? new TestPullRequestIconCache());
  const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
  return { provider, configService };
}
function createProviderForSendTests(disposables, model, sendRequest, opts) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const configService = opts?.configurationService ?? new TestConfigurationService();
  configService.setUserConfiguration("sessions.github.copilot.multiChatSessions", true);
  configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, opts?.claudeEnabled ?? true);
  instantiationService.stub(ILogService, NullLogService);
  instantiationService.stub(IConfigurationService, configService);
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, {
    confirm: async () => ({ confirmed: true })
  });
  instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
  instantiationService.stub(IAgentSessionsService, {
    model,
    onDidChangeSessionArchivedState: Event.None,
    getSession: (resource) => model.getSession(resource)
  });
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: () => ({ type: "test-copilot", name: "test", displayName: "Test", description: "test", icon: void 0 }),
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } }),
    onDidCommitSession: opts?.onDidCommitSession ?? Event.None,
    getOptionGroupsForSessionType: () => void 0,
    updateSessionOptions: () => true,
    setSessionOption: () => true,
    getSessionOption: () => void 0,
    onDidChangeOptionGroups: Event.None,
    createNewChatSessionItem: opts?.createNewChatSessionItem ?? (async () => void 0)
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: async () => void 0,
    sendRequest,
    removeHistoryEntry: async (resource) => {
      model.removeSession(resource);
    },
    setChatSessionTitle: () => {
    }
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => new class extends mock() {
      constructor() {
        super(...arguments);
        this.input = new class extends mock() {
          constructor() {
            super(...arguments);
            this.setPermissionLevel = () => {
            };
          }
        }();
      }
    }(),
    lastFocusedWidget: void 0,
    onDidChangeFocusedSession: Event.None
  });
  instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => void 0 });
  instantiationService.stub(ILanguageModelToolsService, { toToolReferences: () => [] });
  instantiationService.stub(IGitService, { openRepository: async () => void 0 });
  instantiationService.stub(IInstantiationService, instantiationService);
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(opts?.agentHostEnabled ?? true) });
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  instantiationService.stub(IGitHubService, new TestGitHubService());
  instantiationService.stub(IPullRequestIconCache, new TestPullRequestIconCache());
  return disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
}
suite("CopilotChatSessionsProvider", () => {
  const disposables = new DisposableStore();
  let model;
  setup(() => {
    model = new MockAgentSessionsModel();
    disposables.add(toDisposable(() => model.dispose()));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("has correct id and label", () => {
    const provider = createProvider(disposables, model);
    assert.strictEqual(provider.id, COPILOT_PROVIDER_ID);
    assert.strictEqual(provider.sessionTypes.length, 3);
  });
  test("sessionTypes excludes Claude when setting is disabled", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: false });
    assert.strictEqual(provider.sessionTypes.length, 2);
    assert.ok(!provider.sessionTypes.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("sessionTypes excludes Claude when preferAgentHost is true", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: true, preferAgentHost: true });
    assert.strictEqual(provider.sessionTypes.length, 2);
    assert.ok(!provider.sessionTypes.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("sessionTypes includes Claude when claudeEnabled and preferAgentHost is false", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: true, preferAgentHost: false });
    assert.strictEqual(provider.sessionTypes.length, 3);
    assert.ok(provider.sessionTypes.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("preferAgentHost is not respected when chat.agentHost.enabled is false", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: true, preferAgentHost: true, agentHostEnabled: false });
    assert.strictEqual(provider.sessionTypes.length, 3);
    assert.ok(provider.sessionTypes.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("onDidChangeSessionTypes fires when claude setting changes", () => {
    const { provider, configService } = createProviderWithConfig(disposables, model);
    assert.strictEqual(provider.sessionTypes.length, 3);
    let fired = false;
    disposables.add(provider.onDidChangeSessionTypes(() => {
      fired = true;
    }));
    configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, false);
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([CLAUDE_CODE_ENABLED_SETTING]),
      change: { keys: [CLAUDE_CODE_ENABLED_SETTING], overrides: [] },
      affectsConfiguration: (key) => key === CLAUDE_CODE_ENABLED_SETTING
    });
    assert.ok(fired, "onDidChangeSessionTypes should have fired");
    assert.strictEqual(provider.sessionTypes.length, 2);
  });
  test("onDidChangeSessionTypes fires when preferAgentHost setting changes", () => {
    const { provider, configService } = createProviderWithConfig(disposables, model);
    assert.strictEqual(provider.sessionTypes.length, 3);
    let fired = false;
    disposables.add(provider.onDidChangeSessionTypes(() => {
      fired = true;
    }));
    configService.setUserConfiguration(ClaudePreferAgentHostAgentsSettingId, true);
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([ClaudePreferAgentHostAgentsSettingId]),
      change: { keys: [ClaudePreferAgentHostAgentsSettingId], overrides: [] },
      affectsConfiguration: (key) => key === ClaudePreferAgentHostAgentsSettingId
    });
    assert.ok(fired, "onDidChangeSessionTypes should have fired");
    assert.strictEqual(provider.sessionTypes.length, 2);
    assert.ok(!provider.sessionTypes.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("sessionTypes excludes Copilot CLI when hideExtensionHost is true", () => {
    const provider = createProvider(disposables, model, { hideCopilotCli: true });
    assert.ok(!provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
  });
  test("onDidChangeSessionTypes fires when hideExtensionHost setting changes", () => {
    const { provider, configService } = createProviderWithConfig(disposables, model);
    assert.ok(provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
    let fired = false;
    disposables.add(provider.onDidChangeSessionTypes(() => {
      fired = true;
    }));
    configService.setUserConfiguration(ChatConfiguration.CopilotCliHideExtensionHostAgents, true);
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([ChatConfiguration.CopilotCliHideExtensionHostAgents]),
      change: { keys: [ChatConfiguration.CopilotCliHideExtensionHostAgents], overrides: [] },
      affectsConfiguration: (key) => key === ChatConfiguration.CopilotCliHideExtensionHostAgents
    });
    assert.ok(fired, "onDidChangeSessionTypes should have fired");
    assert.ok(!provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
  });
  test("hideExtensionHost is not respected when chat.agentHost.enabled is false", () => {
    const provider = createProvider(disposables, model, { hideCopilotCli: true, agentHostEnabled: false });
    assert.ok(provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
  });
  test("chat.agentHost.enabled is read once when the provider is created", () => {
    const { provider } = createProviderWithConfig(disposables, model, { hideCopilotCli: true, agentHostEnabled: false });
    assert.ok(provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
  });
  test("toggling claude setting refreshes sessions list", () => {
    const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: "/claude-session" });
    model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));
    const { provider, configService } = createProviderWithConfig(disposables, model);
    assert.strictEqual(provider.getSessions().length, 1, "Claude sessions should appear when enabled by default");
    configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, false);
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([CLAUDE_CODE_ENABLED_SETTING]),
      change: { keys: [CLAUDE_CODE_ENABLED_SETTING], overrides: [] },
      affectsConfiguration: (key) => key === CLAUDE_CODE_ENABLED_SETTING
    });
    assert.strictEqual(provider.getSessions().length, 0, "Claude sessions should disappear after disabling");
    configService.setUserConfiguration(CLAUDE_CODE_ENABLED_SETTING, true);
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([CLAUDE_CODE_ENABLED_SETTING]),
      change: { keys: [CLAUDE_CODE_ENABLED_SETTING], overrides: [] },
      affectsConfiguration: (key) => key === CLAUDE_CODE_ENABLED_SETTING
    });
    assert.strictEqual(provider.getSessions().length, 1, "Claude sessions should reappear after re-enabling");
  });
  test("getSessionTypes returns Claude for local workspace when enabled", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: true });
    const types = provider.getSessionTypes(URI.file("/test/project"));
    assert.ok(types.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("getSessionTypes does not return Claude for local workspace when disabled", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: false });
    const types = provider.getSessionTypes(URI.file("/test/project"));
    assert.ok(!types.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("getSessionTypes returns only Cloud for remote workspace regardless of claude setting", () => {
    const provider = createProvider(disposables, model, { claudeEnabled: true });
    const types = provider.getSessionTypes(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: "/owner/repo" }));
    assert.strictEqual(types.length, 1);
    assert.ok(!types.some((t) => t.id === ClaudeCodeSessionType.id));
  });
  test("getSessions returns empty array initially", () => {
    const provider = createProvider(disposables, model);
    assert.strictEqual(provider.getSessions().length, 0);
  });
  test("getSessions returns adapted sessions from agent model", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  });
  test("getSessions excludes Local sessions (now owned by LocalChatSessionsProvider)", () => {
    const bgResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/bg-session" });
    const localResource = URI.from({ scheme: AgentSessionProviders.Local, path: "/local-session" });
    model.addSession(createMockAgentSession(bgResource));
    model.addSession(createMockAgentSession(localResource, { providerType: AgentSessionProviders.Local }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
  });
  test("getSessions includes Claude agent sessions when enabled", () => {
    const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: "/claude-session" });
    model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));
    const provider = createProvider(disposables, model, { claudeEnabled: true });
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
  });
  test("getSessions excludes Claude agent sessions when disabled", () => {
    const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: "/claude-session" });
    model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));
    const provider = createProvider(disposables, model, { claudeEnabled: false });
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 0);
  });
  test("onDidChangeSessions fires when agent model changes", () => {
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/new-session" });
    model.addSession(createMockAgentSession(resource, { title: "New Session" }));
    assert.ok(changes.length > 0);
    assert.strictEqual(changes[0].added.length, 1);
  });
  test("onDidChangeSessions does not fire when cached agent session is unchanged", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/existing-session" });
    model.addSession(createMockAgentSession(resource, { title: "Existing Session", createdAt: 1 }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.fireDidChangeSessions();
    assert.deepStrictEqual(changes, []);
  });
  test("onDidChangeSessions fires changed session when cached agent session changes", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/existing-session" });
    model.addSession(createMockAgentSession(resource, { title: "Existing Session", createdAt: 1 }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.replaceSession(createMockAgentSession(resource, { title: "Updated Session", createdAt: 1 }));
    assert.deepStrictEqual(changes.map((e) => ({
      added: e.added.length,
      removed: e.removed.length,
      changed: e.changed.map((session) => session.title.get())
    })), [{
      added: 0,
      removed: 0,
      changed: ["Updated Session"]
    }]);
  });
  test("marks a session unread when its turn completes (InProgress \u2192 terminal)", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/turn-session" });
    model.addSession(createMockAgentSession(resource, { title: "Turn Session", createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    model.replaceSession(createMockAgentSession(resource, { title: "Turn Session", createdAt: 1, status: ChatSessionStatus.Completed, read: true, onSetRead: () => model.fireDidChangeSessions() }));
    assert.strictEqual(provider.getSessions()[0].isRead.get(), false);
  });
  test("does not mark unread when status stays in progress", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/still-running" });
    model.addSession(createMockAgentSession(resource, { title: "Running", createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    model.replaceSession(createMockAgentSession(resource, { title: "Running (updated)", createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));
    assert.strictEqual(provider.getSessions()[0].isRead.get(), true);
  });
  test("setSessionReadState clears unread across every chat in the group", async () => {
    const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-session" });
    const childResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/child-session" });
    model.addSession(createMockAgentSession(rootResource, { title: "Root", createdAt: 1, read: true, onSetRead: () => model.fireDidChangeSessions() }));
    model.addSession(createMockAgentSession(childResource, {
      title: "Child",
      createdAt: 2,
      read: false,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" },
      onSetRead: () => model.fireDidChangeSessions()
    }));
    const provider = createProvider(disposables, model);
    const session = provider.getSessions()[0];
    const readBefore = session.isRead.get();
    await provider.setSessionReadState(session.sessionId, true);
    assert.deepStrictEqual({
      readBefore,
      readAfter: provider.getSessions()[0].isRead.get()
    }, {
      readBefore: false,
      readAfter: true
    });
  });
  test("cloud models resolve arbitrary restored ids with option groups", () => {
    const modelsState = { optionGroups: void 0 };
    const provider = createProvider(disposables, model, { getOptionGroups: () => modelsState.optionGroups });
    const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: "/owner/repository" });
    const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
    const beforeResolve = provider.getModelsSnapshot(session.sessionId, "removed-cloud-model");
    modelsState.optionGroups = [{
      id: "models",
      name: "Models",
      items: [{ id: "synthetic-cloud-model", name: "Synthetic Cloud Model" }]
    }];
    const afterResolve = provider.getModelsSnapshot(session.sessionId, "removed-cloud-model");
    assert.deepStrictEqual({
      beforeResolve: { models: beforeResolve.models.map((model2) => model2.identifier), desiredModelResolution: beforeResolve.desiredModelResolution, modelTarget: beforeResolve.modelTarget },
      afterResolve: { models: afterResolve.models.map((model2) => model2.identifier), desiredModelResolution: afterResolve.desiredModelResolution, modelTarget: afterResolve.modelTarget }
    }, {
      beforeResolve: { models: [], desiredModelResolution: { kind: "pending", identifier: "removed-cloud-model" }, modelTarget: AgentSessionProviders.Cloud },
      afterResolve: { models: ["synthetic-cloud-model"], desiredModelResolution: { kind: "unavailable", identifier: "removed-cloud-model" }, modelTarget: AgentSessionProviders.Cloud }
    });
  });
  test("Copilot CLI keeps an empty Copilot catalog pending until live models arrive", () => {
    const models = /* @__PURE__ */ new Map();
    const provider = createProvider(disposables, model, {
      languageModelsService: {
        getLanguageModelIds: () => [...models.keys()],
        lookupLanguageModel: (identifier) => models.get(identifier),
        hasResolvedVendor: () => true
      }
    });
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const empty = provider.getModelsSnapshot(session.sessionId, "copilot/remembered");
    models.set("copilot/other", {
      extension: new ExtensionIdentifier("test.extension"),
      id: "other",
      name: "Other",
      vendor: "copilot",
      version: "1.0",
      family: "other",
      maxInputTokens: 1,
      maxOutputTokens: 1,
      isUserSelectable: true,
      isDefaultForLocation: {},
      targetChatSessionType: CopilotCLISessionType.id
    });
    const live = provider.getModelsSnapshot(session.sessionId, "copilot/remembered");
    assert.deepStrictEqual({
      empty: { resolution: empty.desiredModelResolution, modelTarget: empty.modelTarget },
      live: { resolution: live.desiredModelResolution, modelTarget: live.modelTarget }
    }, {
      empty: { resolution: { kind: "pending", identifier: "copilot/remembered" }, modelTarget: CopilotCLISessionType.id },
      live: { resolution: { kind: "unavailable", identifier: "copilot/remembered" }, modelTarget: CopilotCLISessionType.id }
    });
  });
  test("Copilot CLI session maps workspace selection to Agent Host folder config", async () => {
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }));
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("workspace");
    assert.strictEqual(providerSession.isolationMode.get(), "workspace");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: "folder" });
    providerSession.dispose();
  });
  test("Copilot CLI session maps worktree selection to Agent Host config", async () => {
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }));
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("worktree");
    providerSession.setBranch("main");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: "worktree", branch: "main" });
    providerSession.dispose();
  });
  test("Copilot CLI session forwards git.branchPrefix as worktreeBranchPrefix for worktree isolation", async () => {
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("git.branchPrefix", "users/alice/");
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }), { configurationService: configService });
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("worktree");
    providerSession.setBranch("main");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: "worktree", branch: "main", worktreeBranchPrefix: "users/alice/" });
    providerSession.dispose();
  });
  test("Copilot CLI session forwards git.worktreeIncludeFiles for worktree isolation", async () => {
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("git.worktreeIncludeFiles", ["product.overrides.json", "**/node_modules/**"]);
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }), { configurationService: configService });
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("worktree");
    providerSession.setBranch("main");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), {
      isolation: "worktree",
      branch: "main",
      worktreeIncludeFiles: ["product.overrides.json", "**/node_modules/**"]
    });
    providerSession.dispose();
  });
  test("archiveSession sets archived state", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const agentSession = createMockAgentSession(resource);
    model.addSession(agentSession);
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const session = provider.getSessions()[0];
    provider.archiveSession(session.sessionId);
    assert.strictEqual(agentSession.isArchived(), true);
  });
  test("unarchiveSession clears archived state", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const agentSession = createMockAgentSession(resource, { archived: true });
    model.addSession(agentSession);
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const session = provider.getSessions()[0];
    provider.unarchiveSession(session.sessionId);
    assert.strictEqual(agentSession.isArchived(), false);
  });
  test("copilot CLI sessions have supportsMultipleChats capability", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, true);
  });
  test("copilot cloud sessions do not have supportsMultipleChats capability", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
  });
  test("cloud session reports the provider pull request and uses the cached icon while live data loads", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService(7);
    const iconCache = new TestPullRequestIconCache();
    const prUri = URI.parse("https://github.com/owner/repo/pull/42");
    const cachedIcon = computePullRequestIcon(GitHubPullRequestState.Merged);
    iconCache.set(prUri.toString(), cachedIcon);
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        owner: "wrong-owner",
        name: "wrong-repo",
        branch: "feature",
        pullRequestNumber: 7,
        pullRequestUrl: prUri.toString(),
        pullRequestState: GitHubPullRequestState.Open
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService, pullRequestIconCache: iconCache });
    const gitHubInfo = provider.getSessions()[0].workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
    assert.deepStrictEqual({
      owner: gitHubInfo?.owner,
      repo: gitHubInfo?.repo,
      pullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri.toString(),
        icon: gitHubInfo.pullRequest.icon
      },
      lookupCalls: gitHubService.lookupCalls,
      pullRequestModelReferenceCalls: gitHubService.pullRequestModelReferenceCalls
    }, {
      owner: "owner",
      repo: "repo",
      pullRequest: {
        number: 42,
        uri: prUri.toString(),
        icon: cachedIcon
      },
      lookupCalls: 0,
      pullRequestModelReferenceCalls: 1
    });
  });
  test("cloud session accepts pull request URL-only metadata without creating an invalid workspace URI", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService();
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        pullRequestUrl: "https://github.com/owner/repo/pull/42",
        pullRequestState: GitHubPullRequestState.Open
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService });
    const workspace = provider.getSessions()[0].workspace.get();
    const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.get();
    assert.deepStrictEqual({
      workspaceRoot: workspace?.folders[0]?.root.toString(),
      owner: gitHubInfo?.owner,
      repo: gitHubInfo?.repo,
      pullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri.toString()
      }
    }, {
      workspaceRoot: URI.parse("unknown:///").toString(),
      owner: "owner",
      repo: "repo",
      pullRequest: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42"
      }
    });
  });
  test("cloud session keeps provider-reported enterprise PR identity without public GitHub polling", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService(7);
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        owner: "wrong-owner",
        name: "wrong-repo",
        host: "github.example.com",
        branch: "feature",
        pullRequestNumber: 7,
        pullRequestUrl: "https://github.example.com/owner/repo/pull/42",
        pullRequestState: GitHubPullRequestState.Open
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService });
    const gitHubInfo = provider.getSessions()[0].workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
    assert.deepStrictEqual({
      owner: gitHubInfo?.owner,
      repo: gitHubInfo?.repo,
      pullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri.toString(),
        icon: gitHubInfo.pullRequest.icon
      },
      lookupCalls: gitHubService.lookupCalls,
      pullRequestModelReferenceCalls: gitHubService.pullRequestModelReferenceCalls
    }, {
      owner: "owner",
      repo: "repo",
      pullRequest: {
        number: 42,
        uri: "https://github.example.com/owner/repo/pull/42",
        icon: computePullRequestIcon(GitHubPullRequestState.Open)
      },
      lookupCalls: 0,
      pullRequestModelReferenceCalls: 0
    });
  });
  test("cloud session infers a provider-omitted pull request from its branch and updates the live icon", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService(42);
    const iconCache = new TestPullRequestIconCache();
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        owner: "owner",
        name: "repo",
        branch: "feature"
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService, pullRequestIconCache: iconCache });
    const gitHubInfoObs = provider.getSessions()[0].workspace.get().folders[0].gitRepository.gitHubInfo;
    const firstObservation = disposables.add(autorun((reader) => gitHubInfoObs.read(reader)));
    await timeout(0);
    const beforeLiveUpdate = gitHubInfoObs.get()?.pullRequest;
    gitHubService.setPullRequest(createPullRequest(GitHubPullRequestState.Merged));
    const afterLiveUpdate = gitHubInfoObs.get()?.pullRequest;
    firstObservation.dispose();
    let firstReobservedNumber;
    let captured = false;
    const secondObservation = autorun((reader) => {
      const pullRequestNumber = gitHubInfoObs.read(reader)?.pullRequest?.number;
      if (!captured) {
        firstReobservedNumber = pullRequestNumber;
        captured = true;
      }
    });
    disposables.add(secondObservation);
    model.replaceSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      title: "Updated Cloud Session",
      metadata: {
        owner: "owner",
        name: "repo",
        branch: "feature"
      }
    }));
    assert.deepStrictEqual({
      beforeLiveUpdate: beforeLiveUpdate && {
        number: beforeLiveUpdate.number,
        uri: beforeLiveUpdate.uri.toString(),
        icon: beforeLiveUpdate.icon
      },
      afterLiveUpdate: afterLiveUpdate && {
        number: afterLiveUpdate.number,
        uri: afterLiveUpdate.uri.toString(),
        icon: afterLiveUpdate.icon
      },
      lookupCalls: gitHubService.lookupCalls,
      cachedIcon: iconCache.get("https://github.com/owner/repo/pull/42"),
      firstReobservedNumber,
      numberAfterUpdate: gitHubInfoObs.get()?.pullRequest?.number
    }, {
      beforeLiveUpdate: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42",
        icon: computePullRequestIcon(GitHubPullRequestState.Open)
      },
      afterLiveUpdate: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42",
        icon: computePullRequestIcon(GitHubPullRequestState.Merged)
      },
      lookupCalls: 1,
      cachedIcon: computePullRequestIcon(GitHubPullRequestState.Merged),
      firstReobservedNumber: 42,
      numberAfterUpdate: 42
    });
  });
  test("cloud session waits for provider PR metadata after an unsuccessful branch lookup without polling on unrelated updates", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService();
    const metadata = {
      owner: "owner",
      name: "repo",
      branch: "feature"
    };
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, metadata }));
    const provider = createProvider(disposables, model, { gitHubService });
    const gitHubInfoObs = provider.getSessions()[0].workspace.get().folders[0].gitRepository.gitHubInfo;
    disposables.add(autorun((reader) => gitHubInfoObs.read(reader)));
    await timeout(0);
    model.replaceSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      title: "Updated Cloud Session",
      metadata
    }));
    await timeout(0);
    model.replaceSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        ...metadata,
        pullRequestUrl: "https://github.com/owner/repo/pull/42"
      }
    }));
    assert.deepStrictEqual({
      lookupCalls: gitHubService.lookupCalls,
      pullRequest: gitHubInfoObs.get()?.pullRequest && {
        number: gitHubInfoObs.get().pullRequest.number,
        uri: gitHubInfoObs.get().pullRequest.uri.toString()
      }
    }, {
      lookupCalls: 1,
      pullRequest: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42"
      }
    });
  });
  test("non-cloud sessions do not infer pull requests from branch metadata", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const gitHubService = new TestGitHubService(42);
    model.addSession(createMockAgentSession(resource, {
      metadata: {
        owner: "owner",
        name: "repo",
        branch: "feature"
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService });
    const gitHubInfoObs = provider.getSessions()[0].workspace.get().folders[0].gitRepository.gitHubInfo;
    disposables.add(autorun((reader) => gitHubInfoObs.read(reader)));
    await timeout(0);
    assert.deepStrictEqual({
      lookupCalls: gitHubService.lookupCalls,
      pullRequest: gitHubInfoObs.get()?.pullRequest
    }, {
      lookupCalls: 0,
      pullRequest: void 0
    });
  });
  test("copilot CLI sessions do not have supportsMultipleChats when setting is disabled", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model, { multiChatEnabled: false });
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
  });
  test("claude sessions do not have supportsMultipleChats capability", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Claude, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Claude }));
    const provider = createProvider(disposables, model, { claudeEnabled: true });
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
  });
  test("each session has exactly one chat initially", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].chats.get().length, 1);
    assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
  });
  test("setModel applies to existing sessions and their new chats", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const session = provider.getSessions()[0];
    provider.setModel(session.sessionId, "copilot/gpt-4o");
    assert.strictEqual(session.modelId.get(), "copilot/gpt-4o");
    const chat = await provider.createNewChat(session.sessionId);
    try {
      assert.strictEqual(chat.modelId.get(), "copilot/gpt-4o");
    } finally {
      await provider.deleteChat(session.sessionId, chat.resource);
    }
  });
  test("sendRequest throws for unknown session", async () => {
    const provider = createProvider(disposables, model);
    await assert.rejects(
      () => provider.sendRequest("nonexistent", URI.parse("untitled:chat"), { query: "test" }),
      /not found/
    );
  });
  test("getSessions groups chats by session group", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Chat 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Chat 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  });
  test("groups committed chats using metadata.sessionParentId", () => {
    const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-session" });
    const child1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/child-session-1" });
    const child2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/child-session-2" });
    model.addSession(createMockAgentSession(rootResource, { title: "Root", createdAt: 1 }));
    model.addSession(createMockAgentSession(child1Resource, {
      title: "Child 1",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    model.addSession(createMockAgentSession(child2Resource, {
      title: "Child 2",
      createdAt: 3,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].chats.get().length, 3);
    assert.strictEqual(sessions[0].mainChat.get().resource.toString(), rootResource.toString());
  });
  test("orders chats within a grouped session by createdAt", () => {
    const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-session" });
    const olderChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/older-child" });
    const newerChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/newer-child" });
    model.addSession(createMockAgentSession(newerChildResource, {
      title: "Newer Child",
      createdAt: 30,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    model.addSession(createMockAgentSession(rootResource, { title: "Root", createdAt: 10 }));
    model.addSession(createMockAgentSession(olderChildResource, {
      title: "Older Child",
      createdAt: 20,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.deepStrictEqual(
      sessions[0].chats.get().map((chat) => chat.resource.toString()),
      [rootResource.toString(), olderChildResource.toString(), newerChildResource.toString()]
    );
  });
  test("groups child sessions even when the parent/root session is missing", () => {
    const orphan1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/orphan-child-1" });
    const orphan2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/orphan-child-2" });
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.addSession(createMockAgentSession(orphan1Resource, {
      title: "Orphan Child 1",
      createdAt: 1,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "missing-root" }
    }));
    model.addSession(createMockAgentSession(orphan2Resource, {
      title: "Orphan Child 2",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "missing-root" }
    }));
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.deepStrictEqual(
      sessions[0].chats.get().map((chat) => chat.resource.toString()),
      [orphan1Resource.toString(), orphan2Resource.toString()]
    );
    assert.deepStrictEqual(changes.map((e) => ({ added: e.added.length, changed: e.changed.length })), [
      { added: 1, changed: 0 },
      { added: 0, changed: 1 }
    ]);
  });
  test("groups nested parent chains under the ultimate root", () => {
    const middleResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/middle-session" });
    const leafResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/leaf-session" });
    model.addSession(createMockAgentSession(middleResource, {
      title: "Middle Session",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "missing-root" }
    }));
    model.addSession(createMockAgentSession(leafResource, {
      title: "Leaf Session",
      createdAt: 3,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "middle-session" }
    }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.deepStrictEqual(
      sessions[0].chats.get().map((chat) => chat.resource.toString()),
      [middleResource.toString(), leafResource.toString()]
    );
  });
  test("session title comes from primary (first) chat", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { title: "Primary Title" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].title.get(), "Primary Title");
  });
  test("session has mainChat set to the first chat", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.ok(sessions[0].mainChat);
    assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
  });
  test("deleteSession removes session from model and list", async () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    await provider.deleteSession(sessions[0].sessionId);
    const remainingSessions = provider.getSessions();
    assert.strictEqual(remainingSessions.length, 1);
    assert.strictEqual(remainingSessions[0].title.get(), "Session 2");
  });
  test("deleteSession passes Copilot CLI session label to delete command", async () => {
    const resource = URI.from({ scheme: CopilotCLISessionType.id, path: "/session-1" });
    const commandExecutions = [];
    model.addSession(createMockAgentSession(resource, { providerType: CopilotCLISessionType.id, title: "Fix Build" }));
    const provider = createProvider(disposables, model, { commandExecutions });
    const sessions = provider.getSessions();
    await provider.deleteSession(sessions[0].sessionId);
    assert.deepStrictEqual(commandExecutions.map((command) => ({
      id: command.id,
      items: Array.isArray(command.args[0]) ? command.args[0].map((item) => isCommandSessionItem(item) ? { resource: item.resource.toString(), label: item.label } : void 0) : void 0,
      options: command.args[1]
    })), [{
      id: "agents.github.copilot.cli.deleteSessions",
      items: [{ resource: resource.toString(), label: "Fix Build" }],
      options: { skipConfirmation: true }
    }]);
  });
  test("deleteChat with single chat delegates to deleteSession", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    const session = sessions[0];
    await provider.deleteChat(session.sessionId, resource);
    assert.strictEqual(model.sessions.length, 0);
  });
  test("deleteChat throws when session does not support multi-chat", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    const session = sessions[0];
    await assert.rejects(
      () => provider.deleteChat(session.sessionId, resource),
      /not supported when multi-chat is disabled/
    );
  });
  test("session group cache is invalidated on session removal", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    let sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    model.removeSession(resource1);
    sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].title.get(), "Session 2");
  });
  test("chats observable updates when group model changes", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Chat 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Chat 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    const session1 = sessions[0];
    assert.strictEqual(session1.chats.get().length, 1);
  });
  test("session status aggregates across chats", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.ok(sessions[0].status.get() !== void 0);
  });
  test("session isRead aggregates across all chats", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { read: true }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].isRead.get(), true);
  });
  test("session isRead is false when any chat is unread", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { read: false }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].isRead.get(), false);
  });
  test("removing a chat from a group fires changed (not removed) with correct sessionId", async () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Chat 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Chat 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    const chat2Id = sessions[1].sessionId;
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.removeSession(resource2);
    assert.ok(changes.length > 0);
    const lastChange = changes[changes.length - 1];
    assert.strictEqual(lastChange.removed.length, 1);
    assert.strictEqual(lastChange.removed[0].sessionId, chat2Id);
  });
  test("observing many grouped sessions keeps one membership listener and recomputes only the affected group", () => {
    const sessionCount = 8;
    for (let i = 0; i < sessionCount; i++) {
      const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/root-${i}` });
      model.addSession(createMockAgentSession(resource, { title: `Root ${i}`, createdAt: 1 }));
    }
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, sessionCount);
    const chatCounts = sessions.map(() => 0);
    sessions.forEach((session, i) => {
      disposables.add(autorun((reader) => {
        session.chats.read(reader);
        chatCounts[i]++;
      }));
    });
    const membershipEmitter = provider._onDidGroupMembershipChange;
    assert.strictEqual(membershipEmitter._size, 1);
    assert.deepStrictEqual(chatCounts, sessions.map(() => 1));
    const child = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-0-child" });
    model.addSession(createMockAgentSession(child, {
      title: "Child",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-0" }
    }));
    assert.strictEqual(membershipEmitter._size, 1);
    assert.strictEqual(sessions[0].chats.get().length, 2);
    assert.deepStrictEqual(chatCounts, [2, ...sessions.slice(1).map(() => 1)]);
  });
  test("getSessions does not create duplicate groups on repeated calls", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions1 = provider.getSessions();
    const sessions2 = provider.getSessions();
    assert.strictEqual(sessions1.length, 1);
    assert.strictEqual(sessions2.length, 1);
    assert.strictEqual(sessions1[0], sessions2[0]);
  });
  test("changed events are not duplicated when multiple chats update", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.addSession(createMockAgentSession(
      URI.from({ scheme: AgentSessionProviders.Background, path: "/session-3" }),
      { title: "Session 3" }
    ));
    for (const change of changes) {
      const changedIds = change.changed.map((s) => s.sessionId);
      const uniqueIds = new Set(changedIds);
      assert.strictEqual(changedIds.length, uniqueIds.size, "Changed events should not have duplicates");
    }
  });
  test("resolveWorkspace creates proper workspace structure", () => {
    const provider = createProvider(disposables, model);
    const uri = URI.file("/test/project");
    const workspace = provider.resolveWorkspace(uri);
    assert.ok(workspace, "resolveWorkspace should resolve file:// URIs");
    assert.strictEqual(workspace.label, "project");
    assert.strictEqual(workspace.folders.length, 1);
    assert.strictEqual(workspace.folders[0].root.toString(), uri.toString());
    assert.strictEqual(workspace.requiresWorkspaceTrust, true);
  });
  test("builds an unknown workspace fallback when repository metadata is missing", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/unknown-workspace-session" });
    model.addSession(createMockAgentSession(resource, { metadata: {} }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    const workspace = sessions[0].workspace.get();
    assert.ok(workspace);
    assert.strictEqual(workspace.folders.length, 1);
    assert.strictEqual(workspace.folders[0].root.toString(), URI.parse("unknown:///").toString());
    assert.strictEqual(workspace.requiresWorkspaceTrust, true);
    assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, ".vscode", "settings.json"));
    assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, ".vscode/extensions.json"));
  });
  function makeClaudeInFlightProvider() {
    let resolveComplete;
    let resolveCreated;
    const responseCompletePromise = new Promise((r) => {
      resolveComplete = r;
    });
    const responseCreatedPromise = new Promise((r) => {
      resolveCreated = r;
    });
    const realResource = URI.from({ scheme: AgentSessionProviders.Claude, path: `/claude-session-${Date.now()}` });
    const provider = createProviderForSendTests(disposables, model, async () => ({
      kind: "sent",
      data: {
        responseCompletePromise,
        responseCreatedPromise,
        agent: new class extends mock() {
        }()
      }
    }), {
      claudeEnabled: true,
      createNewChatSessionItem: async (_type, request) => ({
        resource: realResource,
        label: request.prompt,
        timing: { created: Date.now(), lastRequestStarted: void 0, lastRequestEnded: void 0 }
      })
    });
    return {
      provider,
      realResource,
      cancelRequest: () => {
        resolveCreated({ isCanceled: true });
        resolveComplete();
      },
      commitSession: () => {
        model.addSession(createMockAgentSession(realResource, { providerType: AgentSessionProviders.Claude }));
      }
    };
  }
  function waitForSessionAdded(provider) {
    return new Promise((resolve) => {
      const d = provider.onDidChangeSessions((e) => {
        if (e.added.length > 0) {
          d.dispose();
          resolve();
        }
      });
    });
  }
  test("createNewSession with Claude type creates a session", async () => {
    const { provider, commitSession } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    assert.ok(session);
    assert.strictEqual(session.sessionType, ClaudeCodeSessionType.id);
    assert.strictEqual(session.status.get(), SessionStatus.Untitled);
    const added = waitForSessionAdded(provider);
    const chat = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: "test" });
    await added;
    commitSession();
    await assert.doesNotReject(sendPromise);
  });
  test("archiveSession archives a Claude temp session", async () => {
    const { provider, cancelRequest } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    const added = waitForSessionAdded(provider);
    const chat1 = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat1.resource, { query: "test" });
    await added;
    await provider.archiveSession(session.sessionId);
    assert.strictEqual(provider.getSessions()[0].isArchived.get(), true);
    cancelRequest();
    await assert.doesNotReject(sendPromise);
    await provider.deleteSession(session.sessionId);
  });
  test("unarchiveSession unarchives a Claude temp session", async () => {
    const { provider, cancelRequest } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    const added = waitForSessionAdded(provider);
    const chat2 = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat2.resource, { query: "test" });
    await added;
    await provider.archiveSession(session.sessionId);
    assert.strictEqual(provider.getSessions()[0].isArchived.get(), true);
    await provider.unarchiveSession(session.sessionId);
    assert.strictEqual(provider.getSessions()[0].isArchived.get(), false);
    cancelRequest();
    await assert.doesNotReject(sendPromise);
    await provider.deleteSession(session.sessionId);
  });
  test("sendRequest replaces temp session with committed session on success", async () => {
    const { provider, commitSession } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    const replacements = [];
    disposables.add(provider.onDidReplaceSession((e) => replacements.push(e)));
    const added = waitForSessionAdded(provider);
    const chat3 = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat3.resource, { query: "hello world" });
    await added;
    assert.strictEqual(provider.getSessions().length, 1, "temp session should appear while in-flight");
    commitSession();
    await sendPromise;
    assert.ok(replacements.length > 0, "onDidReplaceSessions should have fired");
  });
  test("sendRequest uses the query as the temp session title", async () => {
    const { provider, cancelRequest } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    const added = waitForSessionAdded(provider);
    const chat4 = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat4.resource, { query: "fix the login bug" });
    await added;
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].title.get(), "fix the login bug");
    cancelRequest();
    await assert.doesNotReject(sendPromise);
    await provider.deleteSession(session.sessionId);
  });
  test("sendRequest keeps temp session on cancellation", async () => {
    const { provider, cancelRequest } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    const added = waitForSessionAdded(provider);
    const chat5 = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat5.resource, { query: "test" });
    await added;
    cancelRequest();
    await sendPromise;
    assert.strictEqual(provider.getSessions().length, 1, "session should remain after cancellation");
    assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, "should be marked completed");
    await provider.deleteSession(session.sessionId);
  });
  test("renameChat delegates to claude rename command", async () => {
    const claudeResource = URI.from({ scheme: AgentSessionProviders.Claude, path: "/claude-session" });
    model.addSession(createMockAgentSession(claudeResource, { providerType: AgentSessionProviders.Claude }));
    const provider = createProvider(disposables, model, { claudeEnabled: true });
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    await provider.renameChat(sessions[0].sessionId, claudeResource, "New Title");
  });
  test("renameChat throws for unsupported session type", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/cloud-session" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    await assert.rejects(
      () => provider.renameChat(sessions[0].sessionId, resource, "New Title"),
      /not supported/
    );
  });
  suite("uncommitted temp session cleanup", () => {
    const workspace = URI.file("/test/repo");
    function makeInFlightProvider() {
      let resolveComplete;
      let resolveCreated;
      const responseCompletePromise = new Promise((r) => {
        resolveComplete = r;
      });
      const responseCreatedPromise = new Promise((r) => {
        resolveCreated = r;
      });
      const provider = createProviderForSendTests(disposables, model, async () => ({
        kind: "sent",
        data: {
          responseCompletePromise,
          responseCreatedPromise,
          agent: new class extends mock() {
          }()
        }
      }));
      return {
        provider,
        cancelRequest: () => {
          resolveCreated({ isCanceled: true });
          resolveComplete();
        }
      };
    }
    function waitForSessionAdded2(provider) {
      return new Promise((resolve) => {
        const d = provider.onDidChangeSessions((e) => {
          if (e.added.length > 0) {
            d.dispose();
            resolve();
          }
        });
      });
    }
    test("deleteSession removes a temp session that is awaiting commit", async () => {
      const { provider, cancelRequest } = makeInFlightProvider();
      const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const sessionId = newSession.sessionId;
      const added = waitForSessionAdded2(provider);
      const chat = await provider.createNewChat(sessionId);
      const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: "test" });
      await added;
      assert.strictEqual(provider.getSessions().length, 1, "session should appear while in-flight");
      await provider.deleteSession(sessionId);
      assert.strictEqual(provider.getSessions().length, 0, "session should be removed after deleteSession");
      cancelRequest();
      await assert.doesNotReject(sendPromise);
    });
    test("archiveSession archives a temp session that is awaiting commit", async () => {
      const { provider, cancelRequest } = makeInFlightProvider();
      const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const sessionId = newSession.sessionId;
      const added = waitForSessionAdded2(provider);
      const chat = await provider.createNewChat(sessionId);
      const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: "test" });
      await added;
      assert.strictEqual(provider.getSessions().length, 1, "session should appear while in-flight");
      await provider.archiveSession(sessionId);
      assert.strictEqual(provider.getSessions().length, 1, "session should still be in the list after archiveSession");
      assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, "session should be archived");
      cancelRequest();
      await assert.doesNotReject(sendPromise);
      await provider.deleteSession(sessionId);
    });
    test("archiveSession archives a stopped session that was never committed", async () => {
      const { provider, cancelRequest } = makeInFlightProvider();
      const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const sessionId = newSession.sessionId;
      const added = waitForSessionAdded2(provider);
      const chat = await provider.createNewChat(sessionId);
      const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: "test" });
      await added;
      cancelRequest();
      await sendPromise;
      assert.strictEqual(provider.getSessions().length, 1, "stopped session should remain in the list");
      assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, "session should be completed");
      await provider.archiveSession(sessionId);
      assert.strictEqual(provider.getSessions().length, 1, "session should still be in the list after archiving");
      assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, "session should be archived");
      await provider.unarchiveSession(sessionId);
      assert.strictEqual(provider.getSessions()[0].isArchived.get(), false, "session should be unarchived");
      await provider.deleteSession(sessionId);
    });
  });
  suite("new session default permission level", () => {
    const workspace = URI.file("/test/repo");
    function makeConfig(opts) {
      const config = new class extends TestConfigurationService {
        inspect(key) {
          const base = super.inspect(key);
          if (opts.policyRestricted && key === ChatConfiguration.GlobalAutoApprove) {
            return { ...base, policyValue: false };
          }
          return base;
        }
      }();
      if (opts.defaultLevel) {
        config.setUserConfiguration(ChatConfiguration.DefaultPermissionLevel, opts.defaultLevel);
      }
      return config;
    }
    test("CLI session seeds permission level from chat.permissions.default", () => {
      const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot });
      const provider = createProviderForSendTests(disposables, model, () => new Promise(() => {
      }), { configurationService });
      const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const session = provider.getSession(sessionInfo.sessionId);
      assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Autopilot);
    });
    test("clamps to Default when chat.tools.global.autoApprove policy is false", () => {
      const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot, policyRestricted: true });
      const provider = createProviderForSendTests(disposables, model, () => new Promise(() => {
      }), { configurationService });
      const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const session = provider.getSession(sessionInfo.sessionId);
      assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
    });
    test("falls back to Default when chat.permissions.default is unset", () => {
      const configurationService = makeConfig({});
      const provider = createProviderForSendTests(disposables, model, () => new Promise(() => {
      }), { configurationService });
      const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const session = provider.getSession(sessionInfo.sessionId);
      assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
    });
  });
  test("concurrent model re-resolve does not spuriously remove an in-flight committed session", async () => {
    const { provider, commitSession, realResource } = makeClaudeInFlightProvider();
    const workspace = URI.file("/test/project");
    const session = provider.createNewSession(workspace, ClaudeCodeSessionType.id);
    const removals = [];
    disposables.add(provider.onDidChangeSessions((e) => {
      for (const r of e.removed) {
        removals.push(r.resource.toString());
      }
    }));
    const added = waitForSessionAdded(provider);
    const chat = await provider.createNewChat(session.sessionId);
    const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: "test" });
    await added;
    commitSession();
    model.removeSession(realResource);
    assert.ok(
      !removals.includes(realResource.toString()),
      `In-flight committed session ${realResource.toString()} should not be spuriously removed. Removals seen: [${removals.join(", ")}]`
    );
    model.addSession(createMockAgentSession(realResource, { providerType: AgentSessionProviders.Claude }));
    await sendPromise;
  });
  test("cloud session that commits a new resource resolves without timing out", async () => {
    const committedResource = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/task/${generateUuid()}` });
    const onDidCommit = disposables.add(new Emitter());
    let resolveComplete;
    const responseCompletePromise = new Promise((r) => {
      resolveComplete = r;
    });
    const responseCreatedPromise = new Promise(() => {
    });
    const provider = createProviderForSendTests(disposables, model, async () => ({
      kind: "sent",
      data: {
        responseCompletePromise,
        responseCreatedPromise,
        agent: new class extends mock() {
        }()
      }
    }), { onDidCommitSession: onDidCommit.event });
    const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: "/owner/repo/HEAD" });
    const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
    const removals = [];
    disposables.add(provider.onDidChangeSessions((e) => {
      for (const r of e.removed) {
        removals.push(r.resource.toString());
      }
    }));
    const added = waitForSessionAdded(provider);
    const chat = await provider.createNewChat(session.sessionId);
    const untitledResource = chat.resource;
    const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: "hi" });
    await added;
    resolveComplete();
    model.addSession(createMockAgentSession(committedResource, { providerType: AgentSessionProviders.Cloud }));
    let sendSettled = false;
    const fireCommitUntilSettled = async () => {
      while (!sendSettled) {
        onDidCommit.fire({ original: untitledResource, committed: committedResource });
        await timeout(5);
      }
    };
    const commitLoop = fireCommitUntilSettled();
    try {
      await assert.doesNotReject(sendPromise);
    } finally {
      sendSettled = true;
      await commitLoop;
    }
    assert.ok(
      !removals.includes(untitledResource.toString()),
      `Cloud session should not be removed after committing. Removals seen: [${removals.join(", ")}]`
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2NvcGlsb3RDaGF0U2Vzc2lvbnMvdGVzdC9icm93c2VyL2NvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIEltbW9ydGFsUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb24sIElBZ2VudFNlc3Npb25zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UsIENoYXRTZW5kUmVzdWx0LCBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cywgSUNoYXRTZXNzaW9uSXRlbSwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCwgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJR2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2dpdC9jb21tb24vZ2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENMQVVERV9DT0RFX0VOQUJMRURfU0VUVElORywgQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyLCBDT1BJTE9UX1BST1ZJREVSX0lELCBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUsIENvcGlsb3RDbG91ZFNlc3Npb25UeXBlLCBJQ29waWxvdENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q0xJU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9hZ2VudEhvc3QvYnJvd3Nlci9iYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0TW9kZWwuanMnO1xuaW1wb3J0IHsgSVB1bGxSZXF1ZXN0SWNvbkNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvcHVsbFJlcXVlc3RJY29uQ2FjaGUuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbiwgR2l0SHViUHVsbFJlcXVlc3RTdGF0ZSwgSUdpdEh1YlB1bGxSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG5cbi8vIC0tLS0gSGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2U6IFVSSSwgb3B0cz86IHtcblx0cHJvdmlkZXJUeXBlPzogc3RyaW5nO1xuXHR0aXRsZT86IHN0cmluZztcblx0YXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRyZWFkPzogYm9vbGVhbjtcblx0Y3JlYXRlZEF0PzogbnVtYmVyO1xuXHRzdGF0dXM/OiBDaGF0U2Vzc2lvblN0YXR1cztcblx0bWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0b25TZXRSZWFkPzogKCkgPT4gdm9pZDtcbn0pOiBJQWdlbnRTZXNzaW9uIHtcblx0Y29uc3QgcHJvdmlkZXJUeXBlID0gb3B0cz8ucHJvdmlkZXJUeXBlID8/IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kO1xuXHRsZXQgYXJjaGl2ZWQgPSBvcHRzPy5hcmNoaXZlZCA/PyBmYWxzZTtcblx0bGV0IHJlYWQgPSBvcHRzPy5yZWFkID8/IHRydWU7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvdmlkZXJUeXBlID0gcHJvdmlkZXJUeXBlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVyTGFiZWwgPSAnQ29waWxvdCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFiZWwgPSBvcHRzPy50aXRsZSA/PyAnVGVzdCBTZXNzaW9uJztcblx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0dXMgPSBvcHRzPy5zdGF0dXMgPz8gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmNvcGlsb3Q7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGltaW5nID0geyBjcmVhdGVkOiBvcHRzPy5jcmVhdGVkQXQgPz8gRGF0ZS5ub3coKSwgbGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsIGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCB9O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1ldGFkYXRhID0gb3B0cz8ubWV0YWRhdGEgPz8geyByZXBvc2l0b3J5UGF0aDogJy90ZXN0L3JlcG8nIH07XG5cdFx0b3ZlcnJpZGUgaXNBcmNoaXZlZCgpOiBib29sZWFuIHsgcmV0dXJuIGFyY2hpdmVkOyB9XG5cdFx0b3ZlcnJpZGUgc2V0QXJjaGl2ZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHsgYXJjaGl2ZWQgPSB2YWx1ZTsgfVxuXHRcdG92ZXJyaWRlIGlzUGlubmVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRvdmVycmlkZSBzZXRQaW5uZWQoKTogdm9pZCB7IH1cblx0XHRvdmVycmlkZSBpc1JlYWQoKTogYm9vbGVhbiB7IHJldHVybiByZWFkOyB9XG5cdFx0b3ZlcnJpZGUgaXNNYXJrZWRVbnJlYWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIHNldFJlYWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdHJlYWQgPSB2YWx1ZTtcblx0XHRcdC8vIFRoZSByZWFsIG1vZGVsIGZpcmVzIGl0cyBjaGFuZ2UgZXZlbnQgZnJvbSBgc2V0UmVhZGAsIHdoaWNoIGlzIGhvd1xuXHRcdFx0Ly8gdGhlIHByb3ZpZGVyIG1pcnJvcnMgdGhlIG5ldyByZWFkIHN0YXRlIGJhY2sgb250byB0aGUgYWRhcHRlci5cblx0XHRcdG9wdHM/Lm9uU2V0UmVhZD8uKCk7XG5cdFx0fVxuXHR9KCk7XG59XG5cbi8vIC0tLS0gTW9jayBBZ2VudCBTZXNzaW9ucyBTZXJ2aWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIE1vY2tBZ2VudFNlc3Npb25zTW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uczogSUFnZW50U2Vzc2lvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0cmVhZG9ubHkgb25XaWxsUmVzb2x2ZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSByZXNvbHZlZCA9IHRydWU7XG5cblx0Z2V0IHNlc3Npb25zKCk6IElBZ2VudFNlc3Npb25bXSB7IHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnNdOyB9XG5cblx0Z2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zLmZpbmQocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0YWRkU2Vzc2lvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMucHVzaChzZXNzaW9uKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoKTtcblx0fVxuXG5cdHJlbW92ZVNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX3Nlc3Npb25zLmZpbmRJbmRleChzID0+IHMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVwbGFjZVNlc3Npb24oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX3Nlc3Npb25zLmZpbmRJbmRleChzID0+IHMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQub2soaWR4ID49IDAsICdzZXNzaW9uIHNob3VsZCBleGlzdCBiZWZvcmUgcmVwbGFjaW5nJyk7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc3BsaWNlKGlkeCwgMSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdH1cblxuXHRmaXJlRGlkQ2hhbmdlU2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUV4ZWN1dGVkQ29tbWFuZCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFyZ3M6IHJlYWRvbmx5IHVua25vd25bXTtcbn1cblxuaW50ZXJmYWNlIElDcmVhdGVQcm92aWRlck9wdGlvbnMge1xuXHRyZWFkb25seSBtdWx0aUNoYXRFbmFibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2xhdWRlRW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByZWZlckFnZW50SG9zdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhpZGVDb3BpbG90Q2xpPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWdlbnRIb3N0RW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbW1hbmRFeGVjdXRpb25zPzogSUV4ZWN1dGVkQ29tbWFuZFtdO1xuXHRyZWFkb25seSBnZXRPcHRpb25Hcm91cHM/OiAoKSA9PiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZT86IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxzU2VydmljZT47XG5cdHJlYWRvbmx5IGdpdEh1YlNlcnZpY2U/OiBJR2l0SHViU2VydmljZTtcblx0cmVhZG9ubHkgcHVsbFJlcXVlc3RJY29uQ2FjaGU/OiBJUHVsbFJlcXVlc3RJY29uQ2FjaGU7XG59XG5cbmZ1bmN0aW9uIGlzQ29tbWFuZFNlc3Npb25JdGVtKGl0ZW06IHVua25vd24pOiBpdGVtIGlzIHsgcmVhZG9ubHkgcmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbGFiZWw/OiBzdHJpbmcgfSB7XG5cdHJldHVybiB0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgaXRlbSAhPT0gbnVsbCAmJiAncmVzb3VyY2UnIGluIGl0ZW0gJiYgVVJJLmlzVXJpKGl0ZW0ucmVzb3VyY2UpO1xufVxuXG5jbGFzcyBUZXN0UHVsbFJlcXVlc3RJY29uQ2FjaGUgaW1wbGVtZW50cyBJUHVsbFJlcXVlc3RJY29uQ2FjaGUge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ljb25zID0gbmV3IE1hcDxzdHJpbmcsIFJldHVyblR5cGU8dHlwZW9mIGNvbXB1dGVQdWxsUmVxdWVzdEljb24+PigpO1xuXG5cdGdldChwckxpbms6IHN0cmluZyk6IFJldHVyblR5cGU8dHlwZW9mIGNvbXB1dGVQdWxsUmVxdWVzdEljb24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faWNvbnMuZ2V0KHByTGluayk7XG5cdH1cblxuXHRzZXQocHJMaW5rOiBzdHJpbmcsIGljb246IFJldHVyblR5cGU8dHlwZW9mIGNvbXB1dGVQdWxsUmVxdWVzdEljb24+KTogdm9pZCB7XG5cdFx0dGhpcy5faWNvbnMuc2V0KHByTGluaywgaWNvbik7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEdpdEh1YlNlcnZpY2UgZXh0ZW5kcyBtb2NrPElHaXRIdWJTZXJ2aWNlPigpIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdCA9IG9ic2VydmFibGVWYWx1ZTxJR2l0SHViUHVsbFJlcXVlc3QgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0TW9kZWw6IEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWw7XG5cblx0bG9va3VwQ2FsbHMgPSAwO1xuXHRwdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlQ2FsbHMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0TnVtYmVyPzogbnVtYmVyKSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBwdWxsUmVxdWVzdCA9IHRoaXMuX3B1bGxSZXF1ZXN0O1xuXHRcdHRoaXMuX3B1bGxSZXF1ZXN0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHVsbFJlcXVlc3QgPSBwdWxsUmVxdWVzdDtcblx0XHR9KCk7XG5cdH1cblxuXHRvdmVycmlkZSBmaW5kUHVsbFJlcXVlc3ROdW1iZXJCeUhlYWRCcmFuY2ggPSBhc3luYyAoKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHR0aGlzLmxvb2t1cENhbGxzKys7XG5cdFx0cmV0dXJuIHRoaXMuX3B1bGxSZXF1ZXN0TnVtYmVyO1xuXHR9O1xuXG5cdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2UgPSAoKSA9PiB7XG5cdFx0dGhpcy5wdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlQ2FsbHMrKztcblx0XHRyZXR1cm4gbmV3IEltbW9ydGFsUmVmZXJlbmNlKHRoaXMuX3B1bGxSZXF1ZXN0TW9kZWwpO1xuXHR9O1xuXG5cdHNldFB1bGxSZXF1ZXN0KHB1bGxSZXF1ZXN0OiBJR2l0SHViUHVsbFJlcXVlc3QpOiB2b2lkIHtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdC5zZXQocHVsbFJlcXVlc3QsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlUHVsbFJlcXVlc3Qoc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUsIGlzRHJhZnQgPSBmYWxzZSk6IElHaXRIdWJQdWxsUmVxdWVzdCB7XG5cdHJldHVybiB7XG5cdFx0bnVtYmVyOiA0Mixcblx0XHR0aXRsZTogJ0Nsb3VkIFBSJyxcblx0XHRib2R5OiAnJyxcblx0XHRzdGF0ZSxcblx0XHRhdXRob3I6IHsgbG9naW46ICdvd25lcicsIGF2YXRhclVybDogJycgfSxcblx0XHRoZWFkUmVmOiAnZmVhdHVyZScsXG5cdFx0aGVhZFNoYTogJ2hlYWQnLFxuXHRcdGJhc2VSZWY6ICdtYWluJyxcblx0XHRpc0RyYWZ0LFxuXHRcdGNyZWF0ZWRBdDogJycsXG5cdFx0dXBkYXRlZEF0OiAnJyxcblx0XHRtZXJnZWRBdDogc3RhdGUgPT09IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuTWVyZ2VkID8gJycgOiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VhYmxlOiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VhYmxlU3RhdGU6ICcnLFxuXHR9O1xufVxuXG4vLyAtLS0tIFByb3ZpZGVyIGZhY3RvcnkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVQcm92aWRlcihcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0bW9kZWw6IE1vY2tBZ2VudFNlc3Npb25zTW9kZWwsXG5cdG9wdHM/OiBJQ3JlYXRlUHJvdmlkZXJPcHRpb25zLFxuKTogQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyIHtcblx0cmV0dXJuIGNyZWF0ZVByb3ZpZGVyV2l0aENvbmZpZyhkaXNwb3NhYmxlcywgbW9kZWwsIG9wdHMpLnByb3ZpZGVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQcm92aWRlcldpdGhDb25maWcoXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdG1vZGVsOiBNb2NrQWdlbnRTZXNzaW9uc01vZGVsLFxuXHRvcHRzPzogSUNyZWF0ZVByb3ZpZGVyT3B0aW9ucyxcbik6IHsgcHJvdmlkZXI6IENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcjsgY29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0ge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Nlc3Npb25zLmdpdGh1Yi5jb3BpbG90Lm11bHRpQ2hhdFNlc3Npb25zJywgb3B0cz8ubXVsdGlDaGF0RW5hYmxlZCA/PyB0cnVlKTtcblx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDTEFVREVfQ09ERV9FTkFCTEVEX1NFVFRJTkcsIG9wdHM/LmNsYXVkZUVuYWJsZWQgPz8gdHJ1ZSk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkLCBvcHRzPy5wcmVmZXJBZ2VudEhvc3QgPz8gZmFsc2UpO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkNvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEFnZW50cywgb3B0cz8uaGlkZUNvcGlsb3RDbGkgPz8gZmFsc2UpO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBlbmFibGVkOiBjb25zdE9ic2VydmFibGUob3B0cz8uYWdlbnRIb3N0RW5hYmxlZCA/PyB0cnVlKSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZURpYWxvZ1NlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge1xuXHRcdGNvbmZpcm06IGFzeW5jICgpID0+ICh7IGNvbmZpcm1lZDogdHJ1ZSB9KSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7XG5cdFx0ZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jIChpZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdG9wdHM/LmNvbW1hbmRFeGVjdXRpb25zPy5wdXNoKHsgaWQsIGFyZ3MgfSk7XG5cdFx0XHQvLyBTaW11bGF0ZSAnYWdlbnRzLmdpdGh1Yi5jb3BpbG90LmNsaS5kZWxldGVTZXNzaW9ucycgcmVtb3Zpbmcgc2Vzc2lvbnNcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXJnc1swXTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0XHRpZiAoaXNDb21tYW5kU2Vzc2lvbkl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0XHRcdG1vZGVsLnJlbW92ZVNlc3Npb24oaXRlbS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzQ29tbWFuZFNlc3Npb25JdGVtKGl0ZW1zKSkge1xuXHRcdFx0XHRtb2RlbC5yZW1vdmVTZXNzaW9uKGl0ZW1zLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0bW9kZWw6IG1vZGVsIGFzIHVua25vd24gYXMgSUFnZW50U2Vzc2lvbnNNb2RlbCxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlOiBFdmVudC5Ob25lLFxuXHRcdGdldFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiBtb2RlbC5nZXRTZXNzaW9uKHJlc291cmNlKSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKCkgPT4gKHsgdHlwZTogJ3Rlc3QtY29waWxvdCcsIG5hbWU6ICd0ZXN0JywgZGlzcGxheU5hbWU6ICdUZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0JywgaWNvbjogdW5kZWZpbmVkIH0pLFxuXHRcdGdldE9yQ3JlYXRlQ2hhdFNlc3Npb246IGFzeW5jICgpID0+ICh7IG9uV2lsbERpc3Bvc2U6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksIHNlc3Npb25SZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JyB9KSwgaGlzdG9yeTogW10sIGRpc3Bvc2UoKSB7IH0gfSksXG5cdFx0b25EaWRDb21taXRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHRcdHVwZGF0ZVNlc3Npb25PcHRpb25zOiAoKSA9PiB0cnVlLFxuXHRcdHNldFNlc3Npb25PcHRpb246ICgpID0+IHRydWUsXG5cdFx0Z2V0U2Vzc2lvbk9wdGlvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlOiAoKSA9PiBvcHRzPy5nZXRPcHRpb25Hcm91cHM/LigpLFxuXHRcdG9uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzOiBFdmVudC5Ob25lLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRhY3F1aXJlT3JMb2FkU2Vzc2lvbjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNlbmRSZXF1ZXN0OiBhc3luYyAoKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4gPT4gKHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSB9KSxcblx0XHRyZW1vdmVIaXN0b3J5RW50cnk6IGFzeW5jIChyZXNvdXJjZTogVVJJKSA9PiB7IG1vZGVsLnJlbW92ZVNlc3Npb24ocmVzb3VyY2UpOyB9LFxuXHRcdHNldENoYXRTZXNzaW9uVGl0bGU6ICgpID0+IHsgfSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0b3BlblNlc3Npb246IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG9wdHM/Lmxhbmd1YWdlTW9kZWxzU2VydmljZSA/PyB7IGxvb2t1cExhbmd1YWdlTW9kZWw6ICgpID0+IHVuZGVmaW5lZCB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwge1xuXHRcdHRvVG9vbFJlZmVyZW5jZXM6ICgpID0+IFtdLFxuXHR9KTtcblx0Ly8gU3R1YiBJSW5zdGFudGlhdGlvblNlcnZpY2Ugc28gcHJvdmlkZXIgY2FuIHVzZSBjcmVhdGVJbnN0YW5jZSBmb3IgQ29waWxvdENMSVNlc3Npb25cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCB7XG5cdFx0Z2V0VXJpTGFiZWw6ICh1cmk6IFVSSSkgPT4gdXJpLnBhdGgsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGVuYWJsZWQ6IGNvbnN0T2JzZXJ2YWJsZShvcHRzPy5hZ2VudEhvc3RFbmFibGVkID8/IHRydWUpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElHaXRIdWJTZXJ2aWNlLCBvcHRzPy5naXRIdWJTZXJ2aWNlID8/IG5ldyBUZXN0R2l0SHViU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHVsbFJlcXVlc3RJY29uQ2FjaGUsIG9wdHM/LnB1bGxSZXF1ZXN0SWNvbkNhY2hlID8/IG5ldyBUZXN0UHVsbFJlcXVlc3RJY29uQ2FjaGUoKSk7XG5cblx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdHJldHVybiB7IHByb3ZpZGVyLCBjb25maWdTZXJ2aWNlIH07XG59XG5cbi8vIC0tLS0gUHJvdmlkZXIgZmFjdG9yeSBmb3Igc2VuZC9jYW5jZWwgdGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQ3JlYXRlcyBhIHByb3ZpZGVyIHN1aXRhYmxlIGZvciB0ZXN0aW5nIHNlbmRDaGF0IGZsb3dzLiBTdHVicyBhbGwgc2VydmljZXNcbiAqIG5lZWRlZCBieSBDb3BpbG90Q0xJU2Vzc2lvbiBhbmQgX3NlbmRGaXJzdENoYXQsIGluY2x1ZGluZyBJR2l0U2VydmljZSBhbmQgYVxuICogbm9uLW51bGwgSUNoYXRXaWRnZXQgbW9jay5cbiAqXG4gKiBUaGUgY2FsbGVyIGNhbiBwYXNzIGEgY3VzdG9tIGBzZW5kUmVxdWVzdGAgaW1wbGVtZW50YXRpb24gdG8gY29udHJvbCB0aGVcbiAqIGxpZmVjeWNsZSBvZiB0aGUgaW4tZmxpZ2h0IHJlcXVlc3QuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKFxuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRtb2RlbDogTW9ja0FnZW50U2Vzc2lvbnNNb2RlbCxcblx0c2VuZFJlcXVlc3Q6IChyZXNvdXJjZTogVVJJLCBtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM/OiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucykgPT4gUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4sXG5cdG9wdHM/OiB7IG9uRGlkQ29tbWl0U2Vzc2lvbj86IEV2ZW50PHsgb3JpZ2luYWw6IFVSSTsgY29tbWl0dGVkOiBVUkkgfT47IGNsYXVkZUVuYWJsZWQ/OiBib29sZWFuOyBjcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW0/OiBJQ2hhdFNlc3Npb25zU2VydmljZVsnY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtJ107IGNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlOyBhZ2VudEhvc3RFbmFibGVkPzogYm9vbGVhbiB9LFxuKTogQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gb3B0cz8uY29uZmlndXJhdGlvblNlcnZpY2UgPz8gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdzZXNzaW9ucy5naXRodWIuY29waWxvdC5tdWx0aUNoYXRTZXNzaW9ucycsIHRydWUpO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENMQVVERV9DT0RFX0VOQUJMRURfU0VUVElORywgb3B0cz8uY2xhdWRlRW5hYmxlZCA/PyB0cnVlKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZURpYWxvZ1NlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge1xuXHRcdGNvbmZpcm06IGFzeW5jICgpID0+ICh7IGNvbmZpcm1lZDogdHJ1ZSB9KSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0bW9kZWw6IG1vZGVsIGFzIHVua25vd24gYXMgSUFnZW50U2Vzc2lvbnNNb2RlbCxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlOiBFdmVudC5Ob25lLFxuXHRcdGdldFNlc3Npb246IChyZXNvdXJjZTogVVJJKSA9PiBtb2RlbC5nZXRTZXNzaW9uKHJlc291cmNlKSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKCkgPT4gKHsgdHlwZTogJ3Rlc3QtY29waWxvdCcsIG5hbWU6ICd0ZXN0JywgZGlzcGxheU5hbWU6ICdUZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0JywgaWNvbjogdW5kZWZpbmVkIH0pLFxuXHRcdGdldE9yQ3JlYXRlQ2hhdFNlc3Npb246IGFzeW5jICgpID0+ICh7IG9uV2lsbERpc3Bvc2U6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksIHNlc3Npb25SZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JyB9KSwgaGlzdG9yeTogW10sIGRpc3Bvc2UoKSB7IH0gfSksXG5cdFx0b25EaWRDb21taXRTZXNzaW9uOiBvcHRzPy5vbkRpZENvbW1pdFNlc3Npb24gPz8gRXZlbnQuTm9uZSxcblx0XHRnZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHVwZGF0ZVNlc3Npb25PcHRpb25zOiAoKSA9PiB0cnVlLFxuXHRcdHNldFNlc3Npb25PcHRpb246ICgpID0+IHRydWUsXG5cdFx0Z2V0U2Vzc2lvbk9wdGlvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzOiBFdmVudC5Ob25lLFxuXHRcdGNyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbTogb3B0cz8uY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtID8/IChhc3luYyAoKSA9PiB1bmRlZmluZWQpLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRhY3F1aXJlT3JMb2FkU2Vzc2lvbjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNlbmRSZXF1ZXN0OiBzZW5kUmVxdWVzdCxcblx0XHRyZW1vdmVIaXN0b3J5RW50cnk6IGFzeW5jIChyZXNvdXJjZTogVVJJKSA9PiB7IG1vZGVsLnJlbW92ZVNlc3Npb24ocmVzb3VyY2UpOyB9LFxuXHRcdHNldENoYXRTZXNzaW9uVGl0bGU6ICgpID0+IHsgfSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0b3BlblNlc3Npb246IGFzeW5jICgpID0+IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXQ+KCkge1xuXHRcdFx0b3ZlcnJpZGUgaW5wdXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0WydpbnB1dCddPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgc2V0UGVybWlzc2lvbkxldmVsID0gKCkgPT4geyB9O1xuXHRcdFx0fSgpO1xuXHRcdH0oKSxcblx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHsgbG9va3VwTGFuZ3VhZ2VNb2RlbDogKCkgPT4gdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB7IHRvVG9vbFJlZmVyZW5jZXM6ICgpID0+IFtdIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElHaXRTZXJ2aWNlLCB7IG9wZW5SZXBvc2l0b3J5OiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwge1xuXHRcdGdldFVyaUxhYmVsOiAodXJpOiBVUkkpID0+IHVyaS5wYXRoLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBlbmFibGVkOiBjb25zdE9ic2VydmFibGUob3B0cz8uYWdlbnRIb3N0RW5hYmxlZCA/PyB0cnVlKSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUdpdEh1YlNlcnZpY2UsIG5ldyBUZXN0R2l0SHViU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHVsbFJlcXVlc3RJY29uQ2FjaGUsIG5ldyBUZXN0UHVsbFJlcXVlc3RJY29uQ2FjaGUoKSk7XG5cblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcbn1cblxuc3VpdGUoJ0NvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBtb2RlbDogTW9ja0FnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9kZWwgPSBuZXcgTW9ja0FnZW50U2Vzc2lvbnNNb2RlbCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbW9kZWwuZGlzcG9zZSgpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIFByb3ZpZGVyIGlkZW50aXR5IC0tLS0tLS1cblxuXHR0ZXN0KCdoYXMgY29ycmVjdCBpZCBhbmQgbGFiZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5pZCwgQ09QSUxPVF9QUk9WSURFUl9JRCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uVHlwZXMgZXhjbHVkZXMgQ2xhdWRlIHdoZW4gc2V0dGluZyBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBjbGF1ZGVFbmFibGVkOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKCFwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENsYXVkZUNvZGVTZXNzaW9uVHlwZS5pZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uVHlwZXMgZXhjbHVkZXMgQ2xhdWRlIHdoZW4gcHJlZmVyQWdlbnRIb3N0IGlzIHRydWUnLCAoKSA9PiB7XG5cdFx0Ly8gV2hlbiB0aGUgdXNlciBoYXMgb3B0ZWQgaW50byB0aGUgYWdlbnQgaG9zdCBpbXBsZW1lbnRhdGlvbiBvZlxuXHRcdC8vIENsYXVkZSwgdGhpcyBwcm92aWRlciBtdXN0IHlpZWxkIHNvIHRoZSBwaWNrZXIgc2hvd3MgYSBzaW5nbGVcblx0XHQvLyBDbGF1ZGUgZW50cnkgKHRoZSBhZ2VudCBob3N0J3MpLiBPdGhlcndpc2UgYm90aCByZWdpc3RlciBhbmQgdGhlXG5cdFx0Ly8gdXNlciBzZWVzIENsYXVkZSB0d2ljZS5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBjbGF1ZGVFbmFibGVkOiB0cnVlLCBwcmVmZXJBZ2VudEhvc3Q6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayghcHJvdmlkZXIuc2Vzc2lvblR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUuaWQpKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvblR5cGVzIGluY2x1ZGVzIENsYXVkZSB3aGVuIGNsYXVkZUVuYWJsZWQgYW5kIHByZWZlckFnZW50SG9zdCBpcyBmYWxzZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBjbGF1ZGVFbmFibGVkOiB0cnVlLCBwcmVmZXJBZ2VudEhvc3Q6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIuc2Vzc2lvblR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUuaWQpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVyQWdlbnRIb3N0IGlzIG5vdCByZXNwZWN0ZWQgd2hlbiBjaGF0LmFnZW50SG9zdC5lbmFibGVkIGlzIGZhbHNlJywgKCkgPT4ge1xuXHRcdC8vIFlpZWxkaW5nIHRvIHRoZSBhZ2VudCBob3N0J3MgQ2xhdWRlIG9ubHkgbWFrZXMgc2Vuc2Ugd2hlbiB0aGUgYWdlbnRcblx0XHQvLyBob3N0IGlzIGVuYWJsZWQgdG8gcmVnaXN0ZXIgaXQuIFdpdGggdGhlIGFnZW50IGhvc3QgZGlzYWJsZWQgdGhlXG5cdFx0Ly8gcHJlZmVyZW5jZSBtdXN0IGJlIGlnbm9yZWQgc28gdGhpcyBwcm92aWRlciBrZWVwcyBzdXJmYWNpbmcgQ2xhdWRlO1xuXHRcdC8vIG90aGVyd2lzZSBDbGF1ZGUgd291bGQgZGlzYXBwZWFyIGVudGlyZWx5LlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGNsYXVkZUVuYWJsZWQ6IHRydWUsIHByZWZlckFnZW50SG9zdDogdHJ1ZSwgYWdlbnRIb3N0RW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENsYXVkZUNvZGVTZXNzaW9uVHlwZS5pZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25UeXBlcyBmaXJlcyB3aGVuIGNsYXVkZSBzZXR0aW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29uZmlnU2VydmljZSB9ID0gY3JlYXRlUHJvdmlkZXJXaXRoQ29uZmlnKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDMpO1xuXG5cdFx0bGV0IGZpcmVkID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHsgZmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHQvLyBEaXNhYmxlIGNsYXVkZSB2aWEgY29uZmlnIGNoYW5nZVxuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ0xBVURFX0NPREVfRU5BQkxFRF9TRVRUSU5HLCBmYWxzZSk7XG5cdFx0Y29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW0NMQVVERV9DT0RFX0VOQUJMRURfU0VUVElOR10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtDTEFVREVfQ09ERV9FTkFCTEVEX1NFVFRJTkddLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IENMQVVERV9DT0RFX0VOQUJMRURfU0VUVElORyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayhmaXJlZCwgJ29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzIHNob3VsZCBoYXZlIGZpcmVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25UeXBlcyBmaXJlcyB3aGVuIHByZWZlckFnZW50SG9zdCBzZXR0aW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Ly8gU3ltbWV0cmljIHdpdGggdGhlIGNsYXVkZS1lbmFibGVkIGNhc2UgYWJvdmUuIE11c3QgcmVzcG9uZCBsaXZlIHNvXG5cdFx0Ly8gZmxpcHBpbmcgdGhlIEVYUC1iYWNrZWQgcHJlZmVyZW5jZSB1bnJlZ2lzdGVycyB0aGlzIHByb3ZpZGVyJ3Ncblx0XHQvLyBDbGF1ZGUgZW50cnkgd2l0aG91dCByZXF1aXJpbmcgYSB3aW5kb3cgcmVsb2FkLlxuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbmZpZ1NlcnZpY2UgfSA9IGNyZWF0ZVByb3ZpZGVyV2l0aENvbmZpZyhkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubGVuZ3RoLCAzKTtcblxuXHRcdGxldCBmaXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB7IGZpcmVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsIHRydWUpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWRdKSxcblx0XHRcdGNoYW5nZTogeyBrZXlzOiBbQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2soZmlyZWQsICdvbkRpZENoYW5nZVNlc3Npb25UeXBlcyBzaG91bGQgaGF2ZSBmaXJlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soIXByb3ZpZGVyLnNlc3Npb25UeXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb25UeXBlcyBleGNsdWRlcyBDb3BpbG90IENMSSB3aGVuIGhpZGVFeHRlbnNpb25Ib3N0IGlzIHRydWUnLCAoKSA9PiB7XG5cdFx0Ly8gV2hlbiB0aGUgdXNlciBoaWRlcyB0aGUgRXh0ZW5zaW9uIEhvc3QgQ29waWxvdCBDTEksIHRoaXMgcHJvdmlkZXJcblx0XHQvLyBtdXN0IGRyb3AgdGhlIGVudHJ5IHNvIHRoZSBBZ2VudHMgd2luZG93IHBpY2tlciBvbmx5IHN1cmZhY2VzIHRoZVxuXHRcdC8vIEFnZW50IEhvc3QgQ29waWxvdCBDTEkuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgaGlkZUNvcGlsb3RDbGk6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKCFwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25UeXBlcyBmaXJlcyB3aGVuIGhpZGVFeHRlbnNpb25Ib3N0IHNldHRpbmcgY2hhbmdlcycsICgpID0+IHtcblx0XHQvLyBTeW1tZXRyaWMgd2l0aCB0aGUgY2xhdWRlIGNhc2VzIGFib3ZlLiBNdXN0IHJlc3BvbmQgbGl2ZSBzbyBmbGlwcGluZ1xuXHRcdC8vIHRoZSBFWFAtYmFja2VkIHByZWZlcmVuY2UgdW5yZWdpc3RlcnMgdGhpcyBwcm92aWRlcidzIENvcGlsb3QgQ0xJXG5cdFx0Ly8gZW50cnkgd2l0aG91dCByZXF1aXJpbmcgYSB3aW5kb3cgcmVsb2FkLlxuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbmZpZ1NlcnZpY2UgfSA9IGNyZWF0ZVByb3ZpZGVyV2l0aENvbmZpZyhkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCkpO1xuXG5cdFx0bGV0IGZpcmVkID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHsgZmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkNvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEFnZW50cywgdHJ1ZSk7XG5cdFx0Y29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW0NoYXRDb25maWd1cmF0aW9uLkNvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEFnZW50c10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtDaGF0Q29uZmlndXJhdGlvbi5Db3BpbG90Q2xpSGlkZUV4dGVuc2lvbkhvc3RBZ2VudHNdLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLkNvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEFnZW50cyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayhmaXJlZCwgJ29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzIHNob3VsZCBoYXZlIGZpcmVkJyk7XG5cdFx0YXNzZXJ0Lm9rKCFwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlRXh0ZW5zaW9uSG9zdCBpcyBub3QgcmVzcGVjdGVkIHdoZW4gY2hhdC5hZ2VudEhvc3QuZW5hYmxlZCBpcyBmYWxzZScsICgpID0+IHtcblx0XHQvLyBIaWRpbmcgdGhlIEV4dGVuc2lvbiBIb3N0IENvcGlsb3QgQ0xJIG9ubHkgbWFrZXMgc2Vuc2Ugd2hlbiB0aGUgYWdlbnRcblx0XHQvLyBob3N0IGlzIGVuYWJsZWQgdG8gc3VyZmFjZSB0aGUgQWdlbnQgSG9zdCBDb3BpbG90IENMSSBpbiBpdHMgcGxhY2UuIFdpdGhcblx0XHQvLyB0aGUgYWdlbnQgaG9zdCBkaXNhYmxlZCB0aGUgaGlkZSBzZXR0aW5nIG11c3QgYmUgaWdub3JlZCBzbyB0aGUgZW50cnlcblx0XHQvLyBzdGF5cyB2aXNpYmxlLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGhpZGVDb3BpbG90Q2xpOiB0cnVlLCBhZ2VudEhvc3RFbmFibGVkOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIuc2Vzc2lvblR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhdC5hZ2VudEhvc3QuZW5hYmxlZCBpcyByZWFkIG9uY2Ugd2hlbiB0aGUgcHJvdmlkZXIgaXMgY3JlYXRlZCcsICgpID0+IHtcblx0XHQvLyBXaXRoIHRoZSBoaWRlIHNldHRpbmcgb24gYnV0IHRoZSBhZ2VudCBob3N0IGluaXRpYWxseSBkaXNhYmxlZCwgdGhlXG5cdFx0Ly8gQ29waWxvdCBDTEkgZW50cnkgaXMgdmlzaWJsZS4gU2luY2UgZW5hYmxlbWVudCBpcyBmaXhlZCBhdCBzdGFydHVwLFxuXHRcdC8vIHRoZSBwcm92aWRlciBhbHdheXMgcmVmbGVjdHMgdGhlIGluaXRpYWwgdmFsdWUuXG5cdFx0Y29uc3QgeyBwcm92aWRlciB9ID0gY3JlYXRlUHJvdmlkZXJXaXRoQ29uZmlnKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBoaWRlQ29waWxvdENsaTogdHJ1ZSwgYWdlbnRIb3N0RW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvZ2dsaW5nIGNsYXVkZSBzZXR0aW5nIHJlZnJlc2hlcyBzZXNzaW9ucyBsaXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNsYXVkZVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUsIHBhdGg6ICcvY2xhdWRlLXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihjbGF1ZGVSZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUgfSkpO1xuXG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29uZmlnU2VydmljZSB9ID0gY3JlYXRlUHJvdmlkZXJXaXRoQ29uZmlnKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxLCAnQ2xhdWRlIHNlc3Npb25zIHNob3VsZCBhcHBlYXIgd2hlbiBlbmFibGVkIGJ5IGRlZmF1bHQnKTtcblxuXHRcdC8vIERpc2FibGUgQ2xhdWRlXG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDTEFVREVfQ09ERV9FTkFCTEVEX1NFVFRJTkcsIGZhbHNlKTtcblx0XHRjb25maWdTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQ0xBVURFX0NPREVfRU5BQkxFRF9TRVRUSU5HXSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW0NMQVVERV9DT0RFX0VOQUJMRURfU0VUVElOR10sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQ0xBVURFX0NPREVfRU5BQkxFRF9TRVRUSU5HLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwLCAnQ2xhdWRlIHNlc3Npb25zIHNob3VsZCBkaXNhcHBlYXIgYWZ0ZXIgZGlzYWJsaW5nJyk7XG5cblx0XHQvLyBSZS1lbmFibGUgQ2xhdWRlXG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDTEFVREVfQ09ERV9FTkFCTEVEX1NFVFRJTkcsIHRydWUpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtDTEFVREVfQ09ERV9FTkFCTEVEX1NFVFRJTkddKSxcblx0XHRcdGNoYW5nZTogeyBrZXlzOiBbQ0xBVURFX0NPREVfRU5BQkxFRF9TRVRUSU5HXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBDTEFVREVfQ09ERV9FTkFCTEVEX1NFVFRJTkcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDEsICdDbGF1ZGUgc2Vzc2lvbnMgc2hvdWxkIHJlYXBwZWFyIGFmdGVyIHJlLWVuYWJsaW5nJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gZ2V0U2Vzc2lvblR5cGVzIC0tLS0tLS1cblxuXHR0ZXN0KCdnZXRTZXNzaW9uVHlwZXMgcmV0dXJucyBDbGF1ZGUgZm9yIGxvY2FsIHdvcmtzcGFjZSB3aGVuIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgY2xhdWRlRW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRjb25zdCB0eXBlcyA9IHByb3ZpZGVyLmdldFNlc3Npb25UeXBlcyhVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpKTtcblx0XHRhc3NlcnQub2sodHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENsYXVkZUNvZGVTZXNzaW9uVHlwZS5pZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9uVHlwZXMgZG9lcyBub3QgcmV0dXJuIENsYXVkZSBmb3IgbG9jYWwgd29ya3NwYWNlIHdoZW4gZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgY2xhdWRlRW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgdHlwZXMgPSBwcm92aWRlci5nZXRTZXNzaW9uVHlwZXMoVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKSk7XG5cdFx0YXNzZXJ0Lm9rKCF0eXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25UeXBlcyByZXR1cm5zIG9ubHkgQ2xvdWQgZm9yIHJlbW90ZSB3b3Jrc3BhY2UgcmVnYXJkbGVzcyBvZiBjbGF1ZGUgc2V0dGluZycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBjbGF1ZGVFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHR5cGVzID0gcHJvdmlkZXIuZ2V0U2Vzc2lvblR5cGVzKFVSSS5mcm9tKHsgc2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBwYXRoOiAnL293bmVyL3JlcG8nIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2soIXR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUuaWQpKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpc3RpbmcgLS0tLS0tLVxuXG5cdHRlc3QoJ2dldFNlc3Npb25zIHJldHVybnMgZW1wdHkgYXJyYXkgaW5pdGlhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyByZXR1cm5zIGFkYXB0ZWQgc2Vzc2lvbnMgZnJvbSBhZ2VudCBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0yJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UxLCB7IHRpdGxlOiAnU2Vzc2lvbiAxJyB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMiwgeyB0aXRsZTogJ1Nlc3Npb24gMicgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBleGNsdWRlcyBMb2NhbCBzZXNzaW9ucyAobm93IG93bmVkIGJ5IExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJnUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvYmctc2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgbG9jYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsIHBhdGg6ICcvbG9jYWwtc2Vzc2lvbicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGJnUmVzb3VyY2UpKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24obG9jYWxSZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25zIGluY2x1ZGVzIENsYXVkZSBhZ2VudCBzZXNzaW9ucyB3aGVuIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xhdWRlUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSwgcGF0aDogJy9jbGF1ZGUtc2Vzc2lvbicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGNsYXVkZVJlc291cmNlLCB7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBjbGF1ZGVFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBleGNsdWRlcyBDbGF1ZGUgYWdlbnQgc2Vzc2lvbnMgd2hlbiBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjbGF1ZGVSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlLCBwYXRoOiAnL2NsYXVkZS1zZXNzaW9uJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24oY2xhdWRlUmVzb3VyY2UsIHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGNsYXVkZUVuYWJsZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25zIGZpcmVzIHdoZW4gYWdlbnQgbW9kZWwgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTsgLy8gSW5pdGlhbGl6ZSBjYWNoZVxuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL25ldy1zZXNzaW9uJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdOZXcgU2Vzc2lvbicgfSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGNoYW5nZXMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNbMF0uYWRkZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VTZXNzaW9ucyBkb2VzIG5vdCBmaXJlIHdoZW4gY2FjaGVkIGFnZW50IHNlc3Npb24gaXMgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL2V4aXN0aW5nLXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyB0aXRsZTogJ0V4aXN0aW5nIFNlc3Npb24nLCBjcmVhdGVkQXQ6IDEgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7IC8vIEluaXRpYWxpemUgY2FjaGVcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRtb2RlbC5maXJlRGlkQ2hhbmdlU2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25zIGZpcmVzIGNoYW5nZWQgc2Vzc2lvbiB3aGVuIGNhY2hlZCBhZ2VudCBzZXNzaW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvZXhpc3Rpbmctc2Vzc2lvbicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHRpdGxlOiAnRXhpc3RpbmcgU2Vzc2lvbicsIGNyZWF0ZWRBdDogMSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTsgLy8gSW5pdGlhbGl6ZSBjYWNoZVxuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdG1vZGVsLnJlcGxhY2VTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdVcGRhdGVkIFNlc3Npb24nLCBjcmVhdGVkQXQ6IDEgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLm1hcChlID0+ICh7XG5cdFx0XHRhZGRlZDogZS5hZGRlZC5sZW5ndGgsXG5cdFx0XHRyZW1vdmVkOiBlLnJlbW92ZWQubGVuZ3RoLFxuXHRcdFx0Y2hhbmdlZDogZS5jaGFuZ2VkLm1hcChzZXNzaW9uID0+IHNlc3Npb24udGl0bGUuZ2V0KCkpLFxuXHRcdH0pKSwgW3tcblx0XHRcdGFkZGVkOiAwLFxuXHRcdFx0cmVtb3ZlZDogMCxcblx0XHRcdGNoYW5nZWQ6IFsnVXBkYXRlZCBTZXNzaW9uJ10sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyBhIHNlc3Npb24gdW5yZWFkIHdoZW4gaXRzIHR1cm4gY29tcGxldGVzIChJblByb2dyZXNzIFx1MjE5MiB0ZXJtaW5hbCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvdHVybi1zZXNzaW9uJyB9KTtcblx0XHQvLyBTZXNzaW9uIHN0YXJ0cyBhIHR1cm4gKGluIHByb2dyZXNzKSBhbmQgaXMgY3VycmVudGx5IHJlYWQuXG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHRpdGxlOiAnVHVybiBTZXNzaW9uJywgY3JlYXRlZEF0OiAxLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHJlYWQ6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7IC8vIEluaXRpYWxpemUgY2FjaGUgd2l0aCB0aGUgaW4tcHJvZ3Jlc3Mgc2Vzc2lvblxuXG5cdFx0Ly8gVGhlIHR1cm4gY29tcGxldGVzOiB0aGUgdW5kZXJseWluZyBzZXNzaW9uIGZsaXBzIHRvIGEgdGVybWluYWwgc3RhdHVzLlxuXHRcdG1vZGVsLnJlcGxhY2VTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdUdXJuIFNlc3Npb24nLCBjcmVhdGVkQXQ6IDEsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCByZWFkOiB0cnVlLCBvblNldFJlYWQ6ICgpID0+IG1vZGVsLmZpcmVEaWRDaGFuZ2VTZXNzaW9ucygpIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzUmVhZC5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBtYXJrIHVucmVhZCB3aGVuIHN0YXR1cyBzdGF5cyBpbiBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zdGlsbC1ydW5uaW5nJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdSdW5uaW5nJywgY3JlYXRlZEF0OiAxLCBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHJlYWQ6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHQvLyBBIHJlZnJlc2ggdGhhdCBkb2VzIG5vdCBjb21wbGV0ZSB0aGUgdHVybiBtdXN0IG5vdCBtYXJrIGl0IHVucmVhZC5cblx0XHRtb2RlbC5yZXBsYWNlU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHRpdGxlOiAnUnVubmluZyAodXBkYXRlZCknLCBjcmVhdGVkQXQ6IDEsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgcmVhZDogdHJ1ZSB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc1JlYWQuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRTZXNzaW9uUmVhZFN0YXRlIGNsZWFycyB1bnJlYWQgYWNyb3NzIGV2ZXJ5IGNoYXQgaW4gdGhlIGdyb3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9yb290LXNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IGNoaWxkUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvY2hpbGQtc2Vzc2lvbicgfSk7XG5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocm9vdFJlc291cmNlLCB7IHRpdGxlOiAnUm9vdCcsIGNyZWF0ZWRBdDogMSwgcmVhZDogdHJ1ZSwgb25TZXRSZWFkOiAoKSA9PiBtb2RlbC5maXJlRGlkQ2hhbmdlU2Vzc2lvbnMoKSB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGNoaWxkUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnQ2hpbGQnLCBjcmVhdGVkQXQ6IDIsIHJlYWQ6IGZhbHNlLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAncm9vdC1zZXNzaW9uJyB9LFxuXHRcdFx0b25TZXRSZWFkOiAoKSA9PiBtb2RlbC5maXJlRGlkQ2hhbmdlU2Vzc2lvbnMoKSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0Y29uc3QgcmVhZEJlZm9yZSA9IHNlc3Npb24uaXNSZWFkLmdldCgpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uLnNlc3Npb25JZCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlYWRCZWZvcmUsXG5cdFx0XHRyZWFkQWZ0ZXI6IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNSZWFkLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHJlYWRCZWZvcmU6IGZhbHNlLFxuXHRcdFx0cmVhZEFmdGVyOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdC8vIC0tLS0gU2Vzc2lvbiBjcmVhdGlvbiAtLS0tLS0tXG5cblx0Ly8gTm90ZTogY3JlYXRlTmV3U2Vzc2lvbiB0ZXN0cyBhcmUgbGltaXRlZCBiZWNhdXNlIENvcGlsb3RDTElTZXNzaW9uXG5cdC8vIHJlcXVpcmVzIElHaXRTZXJ2aWNlIGFuZCBjcmVhdGVzIGRpc3Bvc2FibGVzIHRoYXQgYXJlIGhhcmQgdG8gY2xlYW5cblx0Ly8gdXAgaW4gaXNvbGF0aW9uLiBGdWxsIGludGVncmF0aW9uIHRlc3RzIHNob3VsZCBjb3ZlciBzZXNzaW9uIGNyZWF0aW9uLlxuXHR0ZXN0KCdjbG91ZCBtb2RlbHMgcmVzb2x2ZSBhcmJpdHJhcnkgcmVzdG9yZWQgaWRzIHdpdGggb3B0aW9uIGdyb3VwcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbHNTdGF0ZTogeyBvcHRpb25Hcm91cHM6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB8IHVuZGVmaW5lZCB9ID0geyBvcHRpb25Hcm91cHM6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGdldE9wdGlvbkdyb3VwczogKCkgPT4gbW9kZWxzU3RhdGUub3B0aW9uR3JvdXBzIH0pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBwYXRoOiAnL293bmVyL3JlcG9zaXRvcnknIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ29waWxvdENsb3VkU2Vzc2lvblR5cGUuaWQpO1xuXHRcdGNvbnN0IGJlZm9yZVJlc29sdmUgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgJ3JlbW92ZWQtY2xvdWQtbW9kZWwnKTtcblxuXHRcdG1vZGVsc1N0YXRlLm9wdGlvbkdyb3VwcyA9IFt7XG5cdFx0XHRpZDogJ21vZGVscycsXG5cdFx0XHRuYW1lOiAnTW9kZWxzJyxcblx0XHRcdGl0ZW1zOiBbeyBpZDogJ3N5bnRoZXRpYy1jbG91ZC1tb2RlbCcsIG5hbWU6ICdTeW50aGV0aWMgQ2xvdWQgTW9kZWwnIH1dLFxuXHRcdH1dO1xuXHRcdGNvbnN0IGFmdGVyUmVzb2x2ZSA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCAncmVtb3ZlZC1jbG91ZC1tb2RlbCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVSZXNvbHZlOiB7IG1vZGVsczogYmVmb3JlUmVzb2x2ZS5tb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiBiZWZvcmVSZXNvbHZlLmRlc2lyZWRNb2RlbFJlc29sdXRpb24sIG1vZGVsVGFyZ2V0OiBiZWZvcmVSZXNvbHZlLm1vZGVsVGFyZ2V0IH0sXG5cdFx0XHRhZnRlclJlc29sdmU6IHsgbW9kZWxzOiBhZnRlclJlc29sdmUubW9kZWxzLm1hcChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyKSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogYWZ0ZXJSZXNvbHZlLmRlc2lyZWRNb2RlbFJlc29sdXRpb24sIG1vZGVsVGFyZ2V0OiBhZnRlclJlc29sdmUubW9kZWxUYXJnZXQgfSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVSZXNvbHZlOiB7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAncmVtb3ZlZC1jbG91ZC1tb2RlbCcgfSwgbW9kZWxUYXJnZXQ6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9LFxuXHRcdFx0YWZ0ZXJSZXNvbHZlOiB7IG1vZGVsczogWydzeW50aGV0aWMtY2xvdWQtbW9kZWwnXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiAncmVtb3ZlZC1jbG91ZC1tb2RlbCcgfSwgbW9kZWxUYXJnZXQ6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3BpbG90IENMSSBrZWVwcyBhbiBlbXB0eSBDb3BpbG90IGNhdGFsb2cgcGVuZGluZyB1bnRpbCBsaXZlIG1vZGVscyBhcnJpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7XG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IHtcblx0XHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkczogKCkgPT4gWy4uLm1vZGVscy5rZXlzKCldLFxuXHRcdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBpZGVudGlmaWVyID0+IG1vZGVscy5nZXQoaWRlbnRpZmllciksXG5cdFx0XHRcdGhhc1Jlc29sdmVkVmVuZG9yOiAoKSA9PiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdGNvbnN0IGVtcHR5ID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQsICdjb3BpbG90L3JlbWVtYmVyZWQnKTtcblxuXHRcdG1vZGVscy5zZXQoJ2NvcGlsb3Qvb3RoZXInLCB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0aWQ6ICdvdGhlcicsXG5cdFx0XHRuYW1lOiAnT3RoZXInLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdGZhbWlseTogJ290aGVyJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdHRhcmdldENoYXRTZXNzaW9uVHlwZTogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGxpdmUgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgJ2NvcGlsb3QvcmVtZW1iZXJlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbXB0eTogeyByZXNvbHV0aW9uOiBlbXB0eS5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uLCBtb2RlbFRhcmdldDogZW1wdHkubW9kZWxUYXJnZXQgfSxcblx0XHRcdGxpdmU6IHsgcmVzb2x1dGlvbjogbGl2ZS5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uLCBtb2RlbFRhcmdldDogbGl2ZS5tb2RlbFRhcmdldCB9LFxuXHRcdH0sIHtcblx0XHRcdGVtcHR5OiB7IHJlc29sdXRpb246IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAnY29waWxvdC9yZW1lbWJlcmVkJyB9LCBtb2RlbFRhcmdldDogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkIH0sXG5cdFx0XHRsaXZlOiB7IHJlc29sdXRpb246IHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWRlbnRpZmllcjogJ2NvcGlsb3QvcmVtZW1iZXJlZCcgfSwgbW9kZWxUYXJnZXQ6IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3BpbG90IENMSSBzZXNzaW9uIG1hcHMgd29ya3NwYWNlIHNlbGVjdGlvbiB0byBBZ2VudCBIb3N0IGZvbGRlciBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsIGFzeW5jICgpID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEgfSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5maWxlKCcvdGVzdC9wcm9qZWN0JyksIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJTZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCkgYXMgSUNvcGlsb3RDaGF0U2Vzc2lvbiAmIElEaXNwb3NhYmxlICYgeyBnZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldElzb2xhdGlvbk1vZGUoJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyU2Vzc2lvbi5pc29sYXRpb25Nb2RlLmdldCgpLCAnd29ya3NwYWNlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlclNlc3Npb24uZ2V0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZygpLCB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSk7XG5cdFx0cHJvdmlkZXJTZXNzaW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnQ29waWxvdCBDTEkgc2Vzc2lvbiBtYXBzIHdvcmt0cmVlIHNlbGVjdGlvbiB0byBBZ2VudCBIb3N0IGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgYXN5bmMgKCkgPT4gKHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSB9KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRjb25zdCBwcm92aWRlclNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKSEgYXMgSUNvcGlsb3RDaGF0U2Vzc2lvbiAmIElEaXNwb3NhYmxlICYgeyBnZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldElzb2xhdGlvbk1vZGUoJ3dvcmt0cmVlJyk7XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldEJyYW5jaCgnbWFpbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlclNlc3Npb24uZ2V0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZygpLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSk7XG5cdFx0cHJvdmlkZXJTZXNzaW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnQ29waWxvdCBDTEkgc2Vzc2lvbiBmb3J3YXJkcyBnaXQuYnJhbmNoUHJlZml4IGFzIHdvcmt0cmVlQnJhbmNoUHJlZml4IGZvciB3b3JrdHJlZSBpc29sYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdnaXQuYnJhbmNoUHJlZml4JywgJ3VzZXJzL2FsaWNlLycpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXJGb3JTZW5kVGVzdHMoZGlzcG9zYWJsZXMsIG1vZGVsLCBhc3luYyAoKSA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIElDaGF0U2VuZFJlcXVlc3REYXRhIH0pLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5maWxlKCcvdGVzdC9wcm9qZWN0JyksIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJTZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCkhIGFzIElDb3BpbG90Q2hhdFNlc3Npb24gJiBJRGlzcG9zYWJsZSAmIHsgZ2V0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZygpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9O1xuXHRcdHByb3ZpZGVyU2Vzc2lvbi5zZXRJc29sYXRpb25Nb2RlKCd3b3JrdHJlZScpO1xuXHRcdHByb3ZpZGVyU2Vzc2lvbi5zZXRCcmFuY2goJ21haW4nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJTZXNzaW9uLmdldEFnZW50SG9zdFNlc3Npb25Db25maWcoKSwgeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nLCB3b3JrdHJlZUJyYW5jaFByZWZpeDogJ3VzZXJzL2FsaWNlLycgfSk7XG5cdFx0cHJvdmlkZXJTZXNzaW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnQ29waWxvdCBDTEkgc2Vzc2lvbiBmb3J3YXJkcyBnaXQud29ya3RyZWVJbmNsdWRlRmlsZXMgZm9yIHdvcmt0cmVlIGlzb2xhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2dpdC53b3JrdHJlZUluY2x1ZGVGaWxlcycsIFsncHJvZHVjdC5vdmVycmlkZXMuanNvbicsICcqKi9ub2RlX21vZHVsZXMvKionXSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsIGFzeW5jICgpID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEgfSksIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ1NlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRjb25zdCBwcm92aWRlclNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKSEgYXMgSUNvcGlsb3RDaGF0U2Vzc2lvbiAmIElEaXNwb3NhYmxlICYgeyBnZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldElzb2xhdGlvbk1vZGUoJ3dvcmt0cmVlJyk7XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldEJyYW5jaCgnbWFpbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlclNlc3Npb24uZ2V0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZygpLCB7XG5cdFx0XHRpc29sYXRpb246ICd3b3JrdHJlZScsXG5cdFx0XHRicmFuY2g6ICdtYWluJyxcblx0XHRcdHdvcmt0cmVlSW5jbHVkZUZpbGVzOiBbJ3Byb2R1Y3Qub3ZlcnJpZGVzLmpzb24nLCAnKiovbm9kZV9tb2R1bGVzLyoqJ11cblx0XHR9KTtcblx0XHRwcm92aWRlclNlc3Npb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gYWN0aW9ucyAtLS0tLS0tXG5cblx0dGVzdCgnYXJjaGl2ZVNlc3Npb24gc2V0cyBhcmNoaXZlZCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oYWdlbnRTZXNzaW9uKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpOyAvLyBJbml0aWFsaXplIGNhY2hlXG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRwcm92aWRlci5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRTZXNzaW9uLmlzQXJjaGl2ZWQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuYXJjaGl2ZVNlc3Npb24gY2xlYXJzIGFyY2hpdmVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBhcmNoaXZlZDogdHJ1ZSB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGFnZW50U2Vzc2lvbik7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdHByb3ZpZGVyLnVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50U2Vzc2lvbi5pc0FyY2hpdmVkKCksIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGNhcGFiaWxpdGllcyAtLS0tLS0tXG5cblx0dGVzdCgnY29waWxvdCBDTEkgc2Vzc2lvbnMgaGF2ZSBzdXBwb3J0c011bHRpcGxlQ2hhdHMgY2FwYWJpbGl0eScsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY29waWxvdCBjbG91ZCBzZXNzaW9ucyBkbyBub3QgaGF2ZSBzdXBwb3J0c011bHRpcGxlQ2hhdHMgY2FwYWJpbGl0eScsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3VkIHNlc3Npb24gcmVwb3J0cyB0aGUgcHJvdmlkZXIgcHVsbCByZXF1ZXN0IGFuZCB1c2VzIHRoZSBjYWNoZWQgaWNvbiB3aGlsZSBsaXZlIGRhdGEgbG9hZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBUZXN0R2l0SHViU2VydmljZSg3KTtcblx0XHRjb25zdCBpY29uQ2FjaGUgPSBuZXcgVGVzdFB1bGxSZXF1ZXN0SWNvbkNhY2hlKCk7XG5cdFx0Y29uc3QgcHJVcmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInKTtcblx0XHRjb25zdCBjYWNoZWRJY29uID0gY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCk7XG5cdFx0aWNvbkNhY2hlLnNldChwclVyaS50b1N0cmluZygpLCBjYWNoZWRJY29uKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0b3duZXI6ICd3cm9uZy1vd25lcicsXG5cdFx0XHRcdG5hbWU6ICd3cm9uZy1yZXBvJyxcblx0XHRcdFx0YnJhbmNoOiAnZmVhdHVyZScsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0TnVtYmVyOiA3LFxuXHRcdFx0XHRwdWxsUmVxdWVzdFVybDogcHJVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHVsbFJlcXVlc3RTdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBnaXRIdWJTZXJ2aWNlLCBwdWxsUmVxdWVzdEljb25DYWNoZTogaWNvbkNhY2hlIH0pO1xuXHRcdGNvbnN0IGdpdEh1YkluZm8gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3duZXI6IGdpdEh1YkluZm8/Lm93bmVyLFxuXHRcdFx0cmVwbzogZ2l0SHViSW5mbz8ucmVwbyxcblx0XHRcdHB1bGxSZXF1ZXN0OiBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdCAmJiB7XG5cdFx0XHRcdG51bWJlcjogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC5udW1iZXIsXG5cdFx0XHRcdHVyaTogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0aWNvbjogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC5pY29uLFxuXHRcdFx0fSxcblx0XHRcdGxvb2t1cENhbGxzOiBnaXRIdWJTZXJ2aWNlLmxvb2t1cENhbGxzLFxuXHRcdFx0cHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZUNhbGxzOiBnaXRIdWJTZXJ2aWNlLnB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2VDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdHJlcG86ICdyZXBvJyxcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdHVyaTogcHJVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0aWNvbjogY2FjaGVkSWNvbixcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBDYWxsczogMCxcblx0XHRcdHB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2VDYWxsczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xvdWQgc2Vzc2lvbiBhY2NlcHRzIHB1bGwgcmVxdWVzdCBVUkwtb25seSBtZXRhZGF0YSB3aXRob3V0IGNyZWF0aW5nIGFuIGludmFsaWQgd29ya3NwYWNlIFVSSScsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKCk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7XG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0VXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0U3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3Blbixcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgZ2l0SHViU2VydmljZSB9KTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKTtcblx0XHRjb25zdCBnaXRIdWJJbmZvID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLmdldCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3Jrc3BhY2VSb290OiB3b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LnJvb3QudG9TdHJpbmcoKSxcblx0XHRcdG93bmVyOiBnaXRIdWJJbmZvPy5vd25lcixcblx0XHRcdHJlcG86IGdpdEh1YkluZm8/LnJlcG8sXG5cdFx0XHRwdWxsUmVxdWVzdDogZ2l0SHViSW5mbz8ucHVsbFJlcXVlc3QgJiYge1xuXHRcdFx0XHRudW1iZXI6IGdpdEh1YkluZm8ucHVsbFJlcXVlc3QubnVtYmVyLFxuXHRcdFx0XHR1cmk6IGdpdEh1YkluZm8ucHVsbFJlcXVlc3QudXJpLnRvU3RyaW5nKCksXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdHdvcmtzcGFjZVJvb3Q6IFVSSS5wYXJzZSgndW5rbm93bjovLy8nKS50b1N0cmluZygpLFxuXHRcdFx0b3duZXI6ICdvd25lcicsXG5cdFx0XHRyZXBvOiAncmVwbycsXG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3VkIHNlc3Npb24ga2VlcHMgcHJvdmlkZXItcmVwb3J0ZWQgZW50ZXJwcmlzZSBQUiBpZGVudGl0eSB3aXRob3V0IHB1YmxpYyBHaXRIdWIgcG9sbGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKDcpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRvd25lcjogJ3dyb25nLW93bmVyJyxcblx0XHRcdFx0bmFtZTogJ3dyb25nLXJlcG8nLFxuXHRcdFx0XHRob3N0OiAnZ2l0aHViLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0YnJhbmNoOiAnZmVhdHVyZScsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0TnVtYmVyOiA3LFxuXHRcdFx0XHRwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmV4YW1wbGUuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0U3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3Blbixcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgZ2l0SHViU2VydmljZSB9KTtcblx0XHRjb25zdCBnaXRIdWJJbmZvID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmdpdEh1YkluZm8uZ2V0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG93bmVyOiBnaXRIdWJJbmZvPy5vd25lcixcblx0XHRcdHJlcG86IGdpdEh1YkluZm8/LnJlcG8sXG5cdFx0XHRwdWxsUmVxdWVzdDogZ2l0SHViSW5mbz8ucHVsbFJlcXVlc3QgJiYge1xuXHRcdFx0XHRudW1iZXI6IGdpdEh1YkluZm8ucHVsbFJlcXVlc3QubnVtYmVyLFxuXHRcdFx0XHR1cmk6IGdpdEh1YkluZm8ucHVsbFJlcXVlc3QudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGljb246IGdpdEh1YkluZm8ucHVsbFJlcXVlc3QuaWNvbixcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBDYWxsczogZ2l0SHViU2VydmljZS5sb29rdXBDYWxscyxcblx0XHRcdHB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2VDYWxsczogZ2l0SHViU2VydmljZS5wdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0b3duZXI6ICdvd25lcicsXG5cdFx0XHRyZXBvOiAncmVwbycsXG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5leGFtcGxlLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0XHRpY29uOiBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbiksXG5cdFx0XHR9LFxuXHRcdFx0bG9va3VwQ2FsbHM6IDAsXG5cdFx0XHRwdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3VkIHNlc3Npb24gaW5mZXJzIGEgcHJvdmlkZXItb21pdHRlZCBwdWxsIHJlcXVlc3QgZnJvbSBpdHMgYnJhbmNoIGFuZCB1cGRhdGVzIHRoZSBsaXZlIGljb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBUZXN0R2l0SHViU2VydmljZSg0Mik7XG5cdFx0Y29uc3QgaWNvbkNhY2hlID0gbmV3IFRlc3RQdWxsUmVxdWVzdEljb25DYWNoZSgpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdFx0bmFtZTogJ3JlcG8nLFxuXHRcdFx0XHRicmFuY2g6ICdmZWF0dXJlJyxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgZ2l0SHViU2VydmljZSwgcHVsbFJlcXVlc3RJY29uQ2FjaGU6IGljb25DYWNoZSB9KTtcblx0XHRjb25zdCBnaXRIdWJJbmZvT2JzID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0uZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mbztcblx0XHRjb25zdCBmaXJzdE9ic2VydmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IGdpdEh1YkluZm9PYnMucmVhZChyZWFkZXIpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBiZWZvcmVMaXZlVXBkYXRlID0gZ2l0SHViSW5mb09icy5nZXQoKT8ucHVsbFJlcXVlc3Q7XG5cblx0XHRnaXRIdWJTZXJ2aWNlLnNldFB1bGxSZXF1ZXN0KGNyZWF0ZVB1bGxSZXF1ZXN0KEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuTWVyZ2VkKSk7XG5cdFx0Y29uc3QgYWZ0ZXJMaXZlVXBkYXRlID0gZ2l0SHViSW5mb09icy5nZXQoKT8ucHVsbFJlcXVlc3Q7XG5cdFx0Zmlyc3RPYnNlcnZhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRsZXQgZmlyc3RSZW9ic2VydmVkTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhcHR1cmVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgc2Vjb25kT2JzZXJ2YXRpb24gPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdE51bWJlciA9IGdpdEh1YkluZm9PYnMucmVhZChyZWFkZXIpPy5wdWxsUmVxdWVzdD8ubnVtYmVyO1xuXHRcdFx0aWYgKCFjYXB0dXJlZCkge1xuXHRcdFx0XHRmaXJzdFJlb2JzZXJ2ZWROdW1iZXIgPSBwdWxsUmVxdWVzdE51bWJlcjtcblx0XHRcdFx0Y2FwdHVyZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZWNvbmRPYnNlcnZhdGlvbik7XG5cdFx0bW9kZWwucmVwbGFjZVNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHR0aXRsZTogJ1VwZGF0ZWQgQ2xvdWQgU2Vzc2lvbicsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdFx0bmFtZTogJ3JlcG8nLFxuXHRcdFx0XHRicmFuY2g6ICdmZWF0dXJlJyxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVMaXZlVXBkYXRlOiBiZWZvcmVMaXZlVXBkYXRlICYmIHtcblx0XHRcdFx0bnVtYmVyOiBiZWZvcmVMaXZlVXBkYXRlLm51bWJlcixcblx0XHRcdFx0dXJpOiBiZWZvcmVMaXZlVXBkYXRlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRpY29uOiBiZWZvcmVMaXZlVXBkYXRlLmljb24sXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJMaXZlVXBkYXRlOiBhZnRlckxpdmVVcGRhdGUgJiYge1xuXHRcdFx0XHRudW1iZXI6IGFmdGVyTGl2ZVVwZGF0ZS5udW1iZXIsXG5cdFx0XHRcdHVyaTogYWZ0ZXJMaXZlVXBkYXRlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRpY29uOiBhZnRlckxpdmVVcGRhdGUuaWNvbixcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBDYWxsczogZ2l0SHViU2VydmljZS5sb29rdXBDYWxscyxcblx0XHRcdGNhY2hlZEljb246IGljb25DYWNoZS5nZXQoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInKSxcblx0XHRcdGZpcnN0UmVvYnNlcnZlZE51bWJlcixcblx0XHRcdG51bWJlckFmdGVyVXBkYXRlOiBnaXRIdWJJbmZvT2JzLmdldCgpPy5wdWxsUmVxdWVzdD8ubnVtYmVyLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZUxpdmVVcGRhdGU6IHtcblx0XHRcdFx0bnVtYmVyOiA0Mixcblx0XHRcdFx0dXJpOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdGljb246IGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuKSxcblx0XHRcdH0sXG5cdFx0XHRhZnRlckxpdmVVcGRhdGU6IHtcblx0XHRcdFx0bnVtYmVyOiA0Mixcblx0XHRcdFx0dXJpOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdGljb246IGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5NZXJnZWQpLFxuXHRcdFx0fSxcblx0XHRcdGxvb2t1cENhbGxzOiAxLFxuXHRcdFx0Y2FjaGVkSWNvbjogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCksXG5cdFx0XHRmaXJzdFJlb2JzZXJ2ZWROdW1iZXI6IDQyLFxuXHRcdFx0bnVtYmVyQWZ0ZXJVcGRhdGU6IDQyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG91ZCBzZXNzaW9uIHdhaXRzIGZvciBwcm92aWRlciBQUiBtZXRhZGF0YSBhZnRlciBhbiB1bnN1Y2Nlc3NmdWwgYnJhbmNoIGxvb2t1cCB3aXRob3V0IHBvbGxpbmcgb24gdW5yZWxhdGVkIHVwZGF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBUZXN0R2l0SHViU2VydmljZSgpO1xuXHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0b3duZXI6ICdvd25lcicsXG5cdFx0XHRuYW1lOiAncmVwbycsXG5cdFx0XHRicmFuY2g6ICdmZWF0dXJlJyxcblx0XHR9O1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgbWV0YWRhdGEgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgZ2l0SHViU2VydmljZSB9KTtcblx0XHRjb25zdCBnaXRIdWJJbmZvT2JzID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0uZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mbztcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4gZ2l0SHViSW5mb09icy5yZWFkKHJlYWRlcikpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdG1vZGVsLnJlcGxhY2VTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0dGl0bGU6ICdVcGRhdGVkIENsb3VkIFNlc3Npb24nLFxuXHRcdFx0bWV0YWRhdGEsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRtb2RlbC5yZXBsYWNlU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7XG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLm1ldGFkYXRhLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvb2t1cENhbGxzOiBnaXRIdWJTZXJ2aWNlLmxvb2t1cENhbGxzLFxuXHRcdFx0cHVsbFJlcXVlc3Q6IGdpdEh1YkluZm9PYnMuZ2V0KCk/LnB1bGxSZXF1ZXN0ICYmIHtcblx0XHRcdFx0bnVtYmVyOiBnaXRIdWJJbmZvT2JzLmdldCgpIS5wdWxsUmVxdWVzdCEubnVtYmVyLFxuXHRcdFx0XHR1cmk6IGdpdEh1YkluZm9PYnMuZ2V0KCkhLnB1bGxSZXF1ZXN0IS51cmkudG9TdHJpbmcoKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0bG9va3VwQ2FsbHM6IDEsXG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1jbG91ZCBzZXNzaW9ucyBkbyBub3QgaW5mZXIgcHVsbCByZXF1ZXN0cyBmcm9tIGJyYW5jaCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoNDIpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwge1xuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0b3duZXI6ICdvd25lcicsXG5cdFx0XHRcdG5hbWU6ICdyZXBvJyxcblx0XHRcdFx0YnJhbmNoOiAnZmVhdHVyZScsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGdpdEh1YlNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgZ2l0SHViSW5mb09icyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0ud29ya3NwYWNlLmdldCgpIS5mb2xkZXJzWzBdLmdpdFJlcG9zaXRvcnkhLmdpdEh1YkluZm87XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IGdpdEh1YkluZm9PYnMucmVhZChyZWFkZXIpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9va3VwQ2FsbHM6IGdpdEh1YlNlcnZpY2UubG9va3VwQ2FsbHMsXG5cdFx0XHRwdWxsUmVxdWVzdDogZ2l0SHViSW5mb09icy5nZXQoKT8ucHVsbFJlcXVlc3QsXG5cdFx0fSwge1xuXHRcdFx0bG9va3VwQ2FsbHM6IDAsXG5cdFx0XHRwdWxsUmVxdWVzdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3BpbG90IENMSSBzZXNzaW9ucyBkbyBub3QgaGF2ZSBzdXBwb3J0c011bHRpcGxlQ2hhdHMgd2hlbiBzZXR0aW5nIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBtdWx0aUNoYXRFbmFibGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGF1ZGUgc2Vzc2lvbnMgZG8gbm90IGhhdmUgc3VwcG9ydHNNdWx0aXBsZUNoYXRzIGNhcGFiaWxpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgY2xhdWRlRW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cywgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gbGlzdGluZyAmIGdyb3VwaW5nIC0tLS0tLS1cblxuXHR0ZXN0KCdlYWNoIHNlc3Npb24gaGFzIGV4YWN0bHkgb25lIGNoYXQgaW5pdGlhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmNoYXRzLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLm1haW5DaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRNb2RlbCBhcHBsaWVzIHRvIGV4aXN0aW5nIHNlc3Npb25zIGFuZCB0aGVpciBuZXcgY2hhdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRwcm92aWRlci5zZXRNb2RlbChzZXNzaW9uLnNlc3Npb25JZCwgJ2NvcGlsb3QvZ3B0LTRvJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5tb2RlbElkLmdldCgpLCAnY29waWxvdC9ncHQtNG8nKTtcblxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXQubW9kZWxJZC5nZXQoKSwgJ2NvcGlsb3QvZ3B0LTRvJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgdGhyb3dzIGZvciB1bmtub3duIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gcHJvdmlkZXIuc2VuZFJlcXVlc3QoJ25vbmV4aXN0ZW50JywgVVJJLnBhcnNlKCd1bnRpdGxlZDpjaGF0JyksIHsgcXVlcnk6ICd0ZXN0JyB9KSxcblx0XHRcdC9ub3QgZm91bmQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25zIGdyb3VwcyBjaGF0cyBieSBzZXNzaW9uIGdyb3VwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTInIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTEsIHsgdGl0bGU6ICdDaGF0IDEnIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UyLCB7IHRpdGxlOiAnQ2hhdCAyJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0Ly8gV2l0aG91dCBleHBsaWNpdCBncm91cGluZywgZWFjaCBjaGF0IGlzIGl0cyBvd24gc2Vzc2lvblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgY29tbWl0dGVkIGNoYXRzIHVzaW5nIG1ldGFkYXRhLnNlc3Npb25QYXJlbnRJZCcsICgpID0+IHtcblx0XHRjb25zdCByb290UmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvcm9vdC1zZXNzaW9uJyB9KTtcblx0XHRjb25zdCBjaGlsZDFSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9jaGlsZC1zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IGNoaWxkMlJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL2NoaWxkLXNlc3Npb24tMicgfSk7XG5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocm9vdFJlc291cmNlLCB7IHRpdGxlOiAnUm9vdCcsIGNyZWF0ZWRBdDogMSB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGNoaWxkMVJlc291cmNlLCB7XG5cdFx0XHR0aXRsZTogJ0NoaWxkIDEnLFxuXHRcdFx0Y3JlYXRlZEF0OiAyLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAncm9vdC1zZXNzaW9uJyB9XG5cdFx0fSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihjaGlsZDJSZXNvdXJjZSwge1xuXHRcdFx0dGl0bGU6ICdDaGlsZCAyJyxcblx0XHRcdGNyZWF0ZWRBdDogMyxcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ3Jvb3Qtc2Vzc2lvbicgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSwgcm9vdFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcmRlcnMgY2hhdHMgd2l0aGluIGEgZ3JvdXBlZCBzZXNzaW9uIGJ5IGNyZWF0ZWRBdCcsICgpID0+IHtcblx0XHRjb25zdCByb290UmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvcm9vdC1zZXNzaW9uJyB9KTtcblx0XHRjb25zdCBvbGRlckNoaWxkUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvb2xkZXItY2hpbGQnIH0pO1xuXHRcdGNvbnN0IG5ld2VyQ2hpbGRSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9uZXdlci1jaGlsZCcgfSk7XG5cblx0XHQvLyBBZGQgb3V0IG9mIG9yZGVyIHRvIGVuc3VyZSBncm91cGluZyBvcmRlciBpcyBkcml2ZW4gYnkgY3JlYXRlZEF0IHJhdGhlciB0aGFuIGluc2VydGlvbiBvcmRlci5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24obmV3ZXJDaGlsZFJlc291cmNlLCB7XG5cdFx0XHR0aXRsZTogJ05ld2VyIENoaWxkJyxcblx0XHRcdGNyZWF0ZWRBdDogMzAsXG5cdFx0XHRtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy90ZXN0L3JlcG8nLCBzZXNzaW9uUGFyZW50SWQ6ICdyb290LXNlc3Npb24nIH1cblx0XHR9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJvb3RSZXNvdXJjZSwgeyB0aXRsZTogJ1Jvb3QnLCBjcmVhdGVkQXQ6IDEwIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ob2xkZXJDaGlsZFJlc291cmNlLCB7XG5cdFx0XHR0aXRsZTogJ09sZGVyIENoaWxkJyxcblx0XHRcdGNyZWF0ZWRBdDogMjAsXG5cdFx0XHRtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy90ZXN0L3JlcG8nLCBzZXNzaW9uUGFyZW50SWQ6ICdyb290LXNlc3Npb24nIH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNlc3Npb25zWzBdLmNoYXRzLmdldCgpLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRbcm9vdFJlc291cmNlLnRvU3RyaW5nKCksIG9sZGVyQ2hpbGRSZXNvdXJjZS50b1N0cmluZygpLCBuZXdlckNoaWxkUmVzb3VyY2UudG9TdHJpbmcoKV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgY2hpbGQgc2Vzc2lvbnMgZXZlbiB3aGVuIHRoZSBwYXJlbnQvcm9vdCBzZXNzaW9uIGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JwaGFuMVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL29ycGhhbi1jaGlsZC0xJyB9KTtcblx0XHRjb25zdCBvcnBoYW4yUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvb3JwaGFuLWNoaWxkLTInIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7IC8vIGluaXRpYWxpemUgY2FjaGVcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ob3JwaGFuMVJlc291cmNlLCB7XG5cdFx0XHR0aXRsZTogJ09ycGhhbiBDaGlsZCAxJyxcblx0XHRcdGNyZWF0ZWRBdDogMSxcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ21pc3Npbmctcm9vdCcgfVxuXHRcdH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ob3JwaGFuMlJlc291cmNlLCB7XG5cdFx0XHR0aXRsZTogJ09ycGhhbiBDaGlsZCAyJyxcblx0XHRcdGNyZWF0ZWRBdDogMixcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ21pc3Npbmctcm9vdCcgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXNzaW9uc1swXS5jaGF0cy5nZXQoKS5tYXAoY2hhdCA9PiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0W29ycGhhbjFSZXNvdXJjZS50b1N0cmluZygpLCBvcnBoYW4yUmVzb3VyY2UudG9TdHJpbmcoKV1cblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcy5tYXAoZSA9PiAoeyBhZGRlZDogZS5hZGRlZC5sZW5ndGgsIGNoYW5nZWQ6IGUuY2hhbmdlZC5sZW5ndGggfSkpLCBbXG5cdFx0XHR7IGFkZGVkOiAxLCBjaGFuZ2VkOiAwIH0sXG5cdFx0XHR7IGFkZGVkOiAwLCBjaGFuZ2VkOiAxIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwcyBuZXN0ZWQgcGFyZW50IGNoYWlucyB1bmRlciB0aGUgdWx0aW1hdGUgcm9vdCcsICgpID0+IHtcblx0XHRjb25zdCBtaWRkbGVSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9taWRkbGUtc2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgbGVhZlJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL2xlYWYtc2Vzc2lvbicgfSk7XG5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24obWlkZGxlUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnTWlkZGxlIFNlc3Npb24nLFxuXHRcdFx0Y3JlYXRlZEF0OiAyLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAnbWlzc2luZy1yb290JyB9XG5cdFx0fSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihsZWFmUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnTGVhZiBTZXNzaW9uJyxcblx0XHRcdGNyZWF0ZWRBdDogMyxcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ21pZGRsZS1zZXNzaW9uJyB9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXNzaW9uc1swXS5jaGF0cy5nZXQoKS5tYXAoY2hhdCA9PiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0W21pZGRsZVJlc291cmNlLnRvU3RyaW5nKCksIGxlYWZSZXNvdXJjZS50b1N0cmluZygpXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gdGl0bGUgY29tZXMgZnJvbSBwcmltYXJ5IChmaXJzdCkgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyB0aXRsZTogJ1ByaW1hcnkgVGl0bGUnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0udGl0bGUuZ2V0KCksICdQcmltYXJ5IFRpdGxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gaGFzIG1haW5DaGF0IHNldCB0byB0aGUgZmlyc3QgY2hhdCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uc1swXS5tYWluQ2hhdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLm1haW5DaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIHJlbW92ZXMgc2Vzc2lvbiBmcm9tIG1vZGVsIGFuZCBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTInIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTEsIHsgdGl0bGU6ICdTZXNzaW9uIDEnIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UyLCB7IHRpdGxlOiAnU2Vzc2lvbiAyJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uc1swXS5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgcmVtYWluaW5nU2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1haW5pbmdTZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1haW5pbmdTZXNzaW9uc1swXS50aXRsZS5nZXQoKSwgJ1Nlc3Npb24gMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIHBhc3NlcyBDb3BpbG90IENMSSBzZXNzaW9uIGxhYmVsIHRvIGRlbGV0ZSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IGNvbW1hbmRFeGVjdXRpb25zOiBJRXhlY3V0ZWRDb21tYW5kW10gPSBbXTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgcHJvdmlkZXJUeXBlOiBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQsIHRpdGxlOiAnRml4IEJ1aWxkJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBjb21tYW5kRXhlY3V0aW9ucyB9KTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVTZXNzaW9uKHNlc3Npb25zWzBdLnNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRFeGVjdXRpb25zLm1hcChjb21tYW5kID0+ICh7XG5cdFx0XHRpZDogY29tbWFuZC5pZCxcblx0XHRcdGl0ZW1zOiBBcnJheS5pc0FycmF5KGNvbW1hbmQuYXJnc1swXSlcblx0XHRcdFx0PyBjb21tYW5kLmFyZ3NbMF0ubWFwKGl0ZW0gPT4gaXNDb21tYW5kU2Vzc2lvbkl0ZW0oaXRlbSkgPyB7IHJlc291cmNlOiBpdGVtLnJlc291cmNlLnRvU3RyaW5nKCksIGxhYmVsOiBpdGVtLmxhYmVsIH0gOiB1bmRlZmluZWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9uczogY29tbWFuZC5hcmdzWzFdLFxuXHRcdH0pKSwgW3tcblx0XHRcdGlkOiAnYWdlbnRzLmdpdGh1Yi5jb3BpbG90LmNsaS5kZWxldGVTZXNzaW9ucycsXG5cdFx0XHRpdGVtczogW3sgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGxhYmVsOiAnRml4IEJ1aWxkJyB9XSxcblx0XHRcdG9wdGlvbnM6IHsgc2tpcENvbmZpcm1hdGlvbjogdHJ1ZSB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQ2hhdCB3aXRoIHNpbmdsZSBjaGF0IGRlbGVnYXRlcyB0byBkZWxldGVTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1swXTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHJlc291cmNlKTtcblxuXHRcdC8vIE1vZGVsIHNob3VsZCBubyBsb25nZXIgaGF2ZSB0aGUgc2Vzc2lvblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVDaGF0IHRocm93cyB3aGVuIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBtdWx0aS1jaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1swXTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgcmVzb3VyY2UpLFxuXHRcdFx0L25vdCBzdXBwb3J0ZWQgd2hlbiBtdWx0aS1jaGF0IGlzIGRpc2FibGVkLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIGdyb3VwIGNhY2hlIGlzIGludmFsaWRhdGVkIG9uIHNlc3Npb24gcmVtb3ZhbCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0yJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UxLCB7IHRpdGxlOiAnU2Vzc2lvbiAxJyB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMiwgeyB0aXRsZTogJ1Nlc3Npb24gMicgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBzZXNzaW9uc1xuXHRcdGxldCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHQvLyBSZW1vdmUgb25lIGZyb20gdGhlIG1vZGVsXG5cdFx0bW9kZWwucmVtb3ZlU2Vzc2lvbihyZXNvdXJjZTEpO1xuXG5cdFx0Ly8gUmUtZmV0Y2hcblx0XHRzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnRpdGxlLmdldCgpLCAnU2Vzc2lvbiAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYXRzIG9ic2VydmFibGUgdXBkYXRlcyB3aGVuIGdyb3VwIG1vZGVsIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMSwgeyB0aXRsZTogJ0NoYXQgMScgfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTIsIHsgdGl0bGU6ICdDaGF0IDInIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHQvLyBCb3RoIGFyZSBzZXBhcmF0ZSBzZXNzaW9ucyBpbml0aWFsbHlcblx0XHRjb25zdCBzZXNzaW9uMSA9IHNlc3Npb25zWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMS5jaGF0cy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIHN0YXR1cyBhZ2dyZWdhdGVzIGFjcm9zcyBjaGF0cycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdC8vIFdpdGggYSBzaW5nbGUgY2hhdCwgc2Vzc2lvbiBzdGF0dXMgc2hvdWxkIG1hdGNoIHRoZSBjaGF0IHN0YXR1c1xuXHRcdGFzc2VydC5vayhzZXNzaW9uc1swXS5zdGF0dXMuZ2V0KCkgIT09IHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gaXNSZWFkIGFnZ3JlZ2F0ZXMgYWNyb3NzIGFsbCBjaGF0cycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyByZWFkOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uaXNSZWFkLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBpc1JlYWQgaXMgZmFsc2Ugd2hlbiBhbnkgY2hhdCBpcyB1bnJlYWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgcmVhZDogZmFsc2UgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5pc1JlYWQuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgYSBjaGF0IGZyb20gYSBncm91cCBmaXJlcyBjaGFuZ2VkIChub3QgcmVtb3ZlZCkgd2l0aCBjb3JyZWN0IHNlc3Npb25JZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0yJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UxLCB7IHRpdGxlOiAnQ2hhdCAxJyB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMiwgeyB0aXRsZTogJ0NoYXQgMicgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIE1hbnVhbGx5IGdyb3VwIGJvdGggY2hhdHMgdW5kZXIgdGhlIGZpcnN0IHNlc3Npb25cblx0XHRjb25zdCBjaGF0MklkID0gc2Vzc2lvbnNbMV0uc2Vzc2lvbklkO1xuXHRcdC8vIEFjY2VzcyB0aGUgZ3JvdXAgbW9kZWwgaW5kaXJlY3RseSBieSBkZWxldGluZyB0aGUgc2Vjb25kIHNlc3Npb24ncyBncm91cFxuXHRcdC8vIGFuZCByZS1hZGRpbmcgaXRzIGNoYXQgdG8gdGhlIGZpcnN0IGdyb3VwIHZpYSBkZWxldGVDaGF0IGZsb3dcblx0XHQvLyBJbnN0ZWFkLCBzaW11bGF0ZSBieSByZW1vdmluZyB0aGUgc2Vjb25kIGNoYXQgZnJvbSB0aGUgbW9kZWxcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0bW9kZWwucmVtb3ZlU2Vzc2lvbihyZXNvdXJjZTIpO1xuXG5cdFx0Ly8gVGhlIHJlbW92ZWQgY2hhdCB3YXMgc3RhbmRhbG9uZSwgc28gaXQgc2hvdWxkIGZpcmUgYSByZW1vdmVkIGV2ZW50XG5cdFx0YXNzZXJ0Lm9rKGNoYW5nZXMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgbGFzdENoYW5nZSA9IGNoYW5nZXNbY2hhbmdlcy5sZW5ndGggLSAxXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENoYW5nZS5yZW1vdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RDaGFuZ2UucmVtb3ZlZFswXS5zZXNzaW9uSWQsIGNoYXQySWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZpbmcgbWFueSBncm91cGVkIHNlc3Npb25zIGtlZXBzIG9uZSBtZW1iZXJzaGlwIGxpc3RlbmVyIGFuZCByZWNvbXB1dGVzIG9ubHkgdGhlIGFmZmVjdGVkIGdyb3VwJywgKCkgPT4ge1xuXHRcdC8vIFNldmVyYWwgaW5kZXBlbmRlbnQgcm9vdCBncm91cHMsIGVhY2ggb2JzZXJ2ZWQgZm9yIGl0cyBjaGF0IGxpc3QuXG5cdFx0Y29uc3Qgc2Vzc2lvbkNvdW50ID0gODtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlc3Npb25Db3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogYC9yb290LSR7aX1gIH0pO1xuXHRcdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHRpdGxlOiBgUm9vdCAke2l9YCwgY3JlYXRlZEF0OiAxIH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIHNlc3Npb25Db3VudCk7XG5cblx0XHQvLyBPYnNlcnZlIGV2ZXJ5IHNlc3Npb24ncyBjaGF0IGxpc3QuIEJlZm9yZSB0aGUgZml4IGVhY2ggb2JzZXJ2ZWQgc2Vzc2lvbiBhZGRlZFxuXHRcdC8vIGl0cyBvd24gZmlsdGVyZWQgbGlzdGVuZXIgdG8gdGhlIHNoYXJlZCBtZW1iZXJzaGlwIGVtaXR0ZXIsIHNvIGxpc3RlbmVycyBncmV3XG5cdFx0Ly8gd2l0aCB0aGUgc2Vzc2lvbiBjb3VudDsgbm93IGEgc2luZ2xlIHByb3ZpZGVyLXdpZGUgZmFuLW91dCBzZXJ2ZXMgYWxsIG9mIHRoZW0uXG5cdFx0Y29uc3QgY2hhdENvdW50cyA9IHNlc3Npb25zLm1hcCgoKSA9PiAwKTtcblx0XHRzZXNzaW9ucy5mb3JFYWNoKChzZXNzaW9uLCBpKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y2hhdENvdW50c1tpXSsrO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRXhhY3RseSBvbmUgbGlzdGVuZXIgb24gdGhlIG1lbWJlcnNoaXAgZW1pdHRlciByZWdhcmRsZXNzIG9mIGhvdyBtYW55IHNlc3Npb25zXG5cdFx0Ly8gYXJlIG9ic2VydmVkICh0aGUgcHJvdmlkZXItd2lkZSBmYW4tb3V0KSwgYW5kIGVhY2ggYXV0b3J1biByYW4gb25jZSBpbml0aWFsbHkuXG5cdFx0Y29uc3QgbWVtYmVyc2hpcEVtaXR0ZXIgPSAocHJvdmlkZXIgYXMgdW5rbm93biBhcyB7IF9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZTogeyBfc2l6ZTogbnVtYmVyIH0gfSkuX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZW1iZXJzaGlwRW1pdHRlci5fc2l6ZSwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0Q291bnRzLCBzZXNzaW9ucy5tYXAoKCkgPT4gMSkpO1xuXG5cdFx0Ly8gQWRkIGEgY2hpbGQgY2hhdCBpbnRvIHRoZSBGSVJTVCBncm91cCBvbmx5LCBjaGFuZ2luZyBqdXN0IHRoYXQgZ3JvdXAncyBtZW1iZXJzaGlwLlxuXHRcdGNvbnN0IGNoaWxkID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Jvb3QtMC1jaGlsZCcgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGNoaWxkLCB7XG5cdFx0XHR0aXRsZTogJ0NoaWxkJyxcblx0XHRcdGNyZWF0ZWRBdDogMixcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ3Jvb3QtMCcgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW5lciBjb3VudCBpcyBzdGlsbCBvbmUsIG9ubHkgdGhlIGZpcnN0IGdyb3VwIHJlY29tcHV0ZWQgKGl0cyBjaGF0IGxpc3QgZ3Jld1xuXHRcdC8vIHRvIHR3byksIGFuZCBubyBvdGhlciBzZXNzaW9uJ3MgY2hhdHMgb2JzZXJ2YWJsZSBwdWJsaXNoZWQgYSBjaGFuZ2UuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lbWJlcnNoaXBFbWl0dGVyLl9zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYXRDb3VudHMsIFsyLCAuLi5zZXNzaW9ucy5zbGljZSgxKS5tYXAoKCkgPT4gMSldKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbnMgZG9lcyBub3QgY3JlYXRlIGR1cGxpY2F0ZSBncm91cHMgb24gcmVwZWF0ZWQgY2FsbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblxuXHRcdC8vIENhbGwgZ2V0U2Vzc2lvbnMgbXVsdGlwbGUgdGltZXNcblx0XHRjb25zdCBzZXNzaW9uczEgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb25zMiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMxLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zMi5sZW5ndGgsIDEpO1xuXHRcdC8vIFNob3VsZCByZXR1cm4gdGhlIHNhbWUgY2FjaGVkIHNlc3Npb24gb2JqZWN0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zMVswXSwgc2Vzc2lvbnMyWzBdKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlZCBldmVudHMgYXJlIG5vdCBkdXBsaWNhdGVkIHdoZW4gbXVsdGlwbGUgY2hhdHMgdXBkYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTInIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTEsIHsgdGl0bGU6ICdTZXNzaW9uIDEnIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UyLCB7IHRpdGxlOiAnU2Vzc2lvbiAyJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTsgLy8gSW5pdGlhbGl6ZVxuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdC8vIFRyaWdnZXIgYSByZWZyZXNoIHRoYXQgdXBkYXRlcyBib3RoIHNlc3Npb25zXG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKFxuXHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMycgfSksXG5cdFx0XHR7IHRpdGxlOiAnU2Vzc2lvbiAzJyB9XG5cdFx0KSk7XG5cblx0XHQvLyBFYWNoIGV2ZW50IHNob3VsZCBub3QgaGF2ZSBkdXBsaWNhdGVzIGluIHRoZSBjaGFuZ2VkIGFycmF5XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdFx0Y29uc3QgY2hhbmdlZElkcyA9IGNoYW5nZS5jaGFuZ2VkLm1hcChzID0+IHMuc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHVuaXF1ZUlkcyA9IG5ldyBTZXQoY2hhbmdlZElkcyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZElkcy5sZW5ndGgsIHVuaXF1ZUlkcy5zaXplLCAnQ2hhbmdlZCBldmVudHMgc2hvdWxkIG5vdCBoYXZlIGR1cGxpY2F0ZXMnKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIC0tLS0gQnJvd3NlIGFjdGlvbnMgLS0tLS0tLVxuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UgY3JlYXRlcyBwcm9wZXIgd29ya3NwYWNlIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UodXJpKTtcblxuXHRcdGFzc2VydC5vayh3b3Jrc3BhY2UsICdyZXNvbHZlV29ya3NwYWNlIHNob3VsZCByZXNvbHZlIGZpbGU6Ly8gVVJJcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2UubGFiZWwsICdwcm9qZWN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5mb2xkZXJzWzBdLnJvb3QudG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2UucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyBhbiB1bmtub3duIHdvcmtzcGFjZSBmYWxsYmFjayB3aGVuIHJlcG9zaXRvcnkgbWV0YWRhdGEgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy91bmtub3duLXdvcmtzcGFjZS1zZXNzaW9uJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgbWV0YWRhdGE6IHt9IH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gc2Vzc2lvbnNbMF0ud29ya3NwYWNlLmdldCgpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5mb2xkZXJzWzBdLnJvb3QudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCd1bmtub3duOi8vLycpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2UucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCwgdHJ1ZSk7XG5cblx0XHQvLyBUaGUgY29yZSBzeW1wdG9tIG9mICMzMTA3Nzc6IGFueSBvZiB0aGVzZSBjYWxscyBtdXN0IG5vdCB0aHJvdy5cblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UuZm9sZGVyc1swXS5yb290LCAnLnZzY29kZScsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZS5mb2xkZXJzWzBdLnJvb3QsICcudnNjb2RlL2V4dGVuc2lvbnMuanNvbicpKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBDbGF1ZGUgc2Vzc2lvbiBjcmVhdGlvbiAtLS0tLS0tXG5cblx0ZnVuY3Rpb24gbWFrZUNsYXVkZUluRmxpZ2h0UHJvdmlkZXIoKTogeyBwcm92aWRlcjogQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyOyBjYW5jZWxSZXF1ZXN0OiAoKSA9PiB2b2lkOyByZWFsUmVzb3VyY2U6IFVSSTsgY29tbWl0U2Vzc2lvbjogKCkgPT4gdm9pZCB9IHtcblx0XHRsZXQgcmVzb2x2ZUNvbXBsZXRlITogKCkgPT4gdm9pZDtcblx0XHRsZXQgcmVzb2x2ZUNyZWF0ZWQhOiAocjogSUNoYXRSZXNwb25zZU1vZGVsKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7IHJlc29sdmVDb21wbGV0ZSA9IHI7IH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlQ3JlYXRlZFByb21pc2UgPSBuZXcgUHJvbWlzZTxJQ2hhdFJlc3BvbnNlTW9kZWw+KHIgPT4geyByZXNvbHZlQ3JlYXRlZCA9IHI7IH0pO1xuXG5cdFx0Ly8gVGhlIHJlYWwgcmVzb3VyY2UgdGhhdCBjcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW0gcmV0dXJuc1xuXHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlLCBwYXRoOiBgL2NsYXVkZS1zZXNzaW9uLSR7RGF0ZS5ub3coKX1gIH0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsIGFzeW5jICgpID0+ICh7XG5cdFx0XHRraW5kOiAnc2VudCcgYXMgY29uc3QsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlLFxuXHRcdFx0XHRyZXNwb25zZUNyZWF0ZWRQcm9taXNlLFxuXHRcdFx0XHRhZ2VudDogbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFnZW50RGF0YT4oKSB7IH0oKSxcblx0XHRcdH0gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEsXG5cdFx0fSksIHtcblx0XHRcdGNsYXVkZUVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW06IGFzeW5jIChfdHlwZSwgcmVxdWVzdCk6IFByb21pc2U8SUNoYXRTZXNzaW9uSXRlbT4gPT4gKHtcblx0XHRcdFx0cmVzb3VyY2U6IHJlYWxSZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6IHJlcXVlc3QucHJvbXB0LFxuXHRcdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogRGF0ZS5ub3coKSwgbGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsIGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRyZWFsUmVzb3VyY2UsXG5cdFx0XHRjYW5jZWxSZXF1ZXN0OiAoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmVDcmVhdGVkKHsgaXNDYW5jZWxlZDogdHJ1ZSB9IGFzIHVua25vd24gYXMgSUNoYXRSZXNwb25zZU1vZGVsKTtcblx0XHRcdFx0cmVzb2x2ZUNvbXBsZXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Y29tbWl0U2Vzc2lvbjogKCkgPT4ge1xuXHRcdFx0XHQvLyBBZGQgdGhlIGFnZW50IHNlc3Npb24gdG8gdGhlIG1vZGVsIHNvIF93YWl0Rm9yU2Vzc2lvbkluQ2FjaGUgcmVzb2x2ZXNcblx0XHRcdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlYWxSZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUgfSkpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcjogQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFkZGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiB3aXRoIENsYXVkZSB0eXBlIGNyZWF0ZXMgYSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbW1pdFNlc3Npb24gfSA9IG1ha2VDbGF1ZGVJbkZsaWdodFByb3ZpZGVyKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5zZXNzaW9uVHlwZSwgQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5zdGF0dXMuZ2V0KCksIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXG5cdFx0Ly8gU2VuZCBhbmQgY29tbWl0IHNvIHRoZSBzZXNzaW9uIGVudGVycyB0aGUgY2FjaGUgYW5kIGNhbiBiZSBkaXNwb3NlZFxuXHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICd0ZXN0JyB9KTtcblx0XHRhd2FpdCBhZGRlZDtcblx0XHRjb21taXRTZXNzaW9uKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3Qoc2VuZFByb21pc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcmNoaXZlU2Vzc2lvbiBhcmNoaXZlcyBhIENsYXVkZSB0ZW1wIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY2FuY2VsUmVxdWVzdCB9ID0gbWFrZUNsYXVkZUluRmxpZ2h0UHJvdmlkZXIoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKTtcblxuXHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hhdDEgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZW5kUHJvbWlzZSA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0MS5yZXNvdXJjZSwgeyBxdWVyeTogJ3Rlc3QnIH0pO1xuXHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzQXJjaGl2ZWQuZ2V0KCksIHRydWUpO1xuXG5cdFx0Y2FuY2VsUmVxdWVzdCgpO1xuXHRcdGF3YWl0IGFzc2VydC5kb2VzTm90UmVqZWN0KHNlbmRQcm9taXNlKTtcblxuXHRcdC8vIENsZWFuIHVwXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuYXJjaGl2ZVNlc3Npb24gdW5hcmNoaXZlcyBhIENsYXVkZSB0ZW1wIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY2FuY2VsUmVxdWVzdCB9ID0gbWFrZUNsYXVkZUluRmxpZ2h0UHJvdmlkZXIoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKTtcblxuXHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hhdDIgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZW5kUHJvbWlzZSA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0Mi5yZXNvdXJjZSwgeyBxdWVyeTogJ3Rlc3QnIH0pO1xuXHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzQXJjaGl2ZWQuZ2V0KCksIHRydWUpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIudW5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNBcmNoaXZlZC5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0Y2FuY2VsUmVxdWVzdCgpO1xuXHRcdGF3YWl0IGFzc2VydC5kb2VzTm90UmVqZWN0KHNlbmRQcm9taXNlKTtcblxuXHRcdC8vIENsZWFuIHVwXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gQ2xhdWRlIGNvbnRyb2xsZXItYmFzZWQgc2VuZCBmbG93IC0tLS0tLS1cblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCByZXBsYWNlcyB0ZW1wIHNlc3Npb24gd2l0aCBjb21taXR0ZWQgc2Vzc2lvbiBvbiBzdWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbW1pdFNlc3Npb24gfSA9IG1ha2VDbGF1ZGVJbkZsaWdodFByb3ZpZGVyKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENsYXVkZUNvZGVTZXNzaW9uVHlwZS5pZCk7XG5cblx0XHRjb25zdCByZXBsYWNlbWVudHM6IHsgZnJvbTogdW5rbm93bjsgdG86IHVua25vd24gfVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkUmVwbGFjZVNlc3Npb24oZSA9PiByZXBsYWNlbWVudHMucHVzaChlKSkpO1xuXG5cdFx0Y29uc3QgYWRkZWQgPSB3YWl0Rm9yU2Vzc2lvbkFkZGVkKHByb3ZpZGVyKTtcblx0XHRjb25zdCBjaGF0MyA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQzLnJlc291cmNlLCB7IHF1ZXJ5OiAnaGVsbG8gd29ybGQnIH0pO1xuXHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxLCAndGVtcCBzZXNzaW9uIHNob3VsZCBhcHBlYXIgd2hpbGUgaW4tZmxpZ2h0Jyk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgYWdlbnQgc2Vzc2lvbiBhcHBlYXJpbmcgaW4gdGhlIG1vZGVsXG5cdFx0Y29tbWl0U2Vzc2lvbigpO1xuXHRcdGF3YWl0IHNlbmRQcm9taXNlO1xuXG5cdFx0Ly8gVGhlIHRlbXAgc2Vzc2lvbiBzaG91bGQgaGF2ZSBiZWVuIHJlcGxhY2VkIGJ5IHRoZSBjb21taXR0ZWQgb25lXG5cdFx0YXNzZXJ0Lm9rKHJlcGxhY2VtZW50cy5sZW5ndGggPiAwLCAnb25EaWRSZXBsYWNlU2Vzc2lvbnMgc2hvdWxkIGhhdmUgZmlyZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgdXNlcyB0aGUgcXVlcnkgYXMgdGhlIHRlbXAgc2Vzc2lvbiB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjYW5jZWxSZXF1ZXN0IH0gPSBtYWtlQ2xhdWRlSW5GbGlnaHRQcm92aWRlcigpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5maWxlKCcvdGVzdC9wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUuaWQpO1xuXG5cdFx0Y29uc3QgYWRkZWQgPSB3YWl0Rm9yU2Vzc2lvbkFkZGVkKHByb3ZpZGVyKTtcblx0XHRjb25zdCBjaGF0NCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQ0LnJlc291cmNlLCB7IHF1ZXJ5OiAnZml4IHRoZSBsb2dpbiBidWcnIH0pO1xuXHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS50aXRsZS5nZXQoKSwgJ2ZpeCB0aGUgbG9naW4gYnVnJyk7XG5cblx0XHRjYW5jZWxSZXF1ZXN0KCk7XG5cdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3Qoc2VuZFByb21pc2UpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCBrZWVwcyB0ZW1wIHNlc3Npb24gb24gY2FuY2VsbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNhbmNlbFJlcXVlc3QgfSA9IG1ha2VDbGF1ZGVJbkZsaWdodFByb3ZpZGVyKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENsYXVkZUNvZGVTZXNzaW9uVHlwZS5pZCk7XG5cblx0XHRjb25zdCBhZGRlZCA9IHdhaXRGb3JTZXNzaW9uQWRkZWQocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGNoYXQ1ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdDUucmVzb3VyY2UsIHsgcXVlcnk6ICd0ZXN0JyB9KTtcblx0XHRhd2FpdCBhZGRlZDtcblxuXHRcdC8vIENhbmNlbCBiZWZvcmUgdGhlIGFnZW50IHNlc3Npb24gYXBwZWFyc1xuXHRcdGNhbmNlbFJlcXVlc3QoKTtcblx0XHRhd2FpdCBzZW5kUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSwgJ3Nlc3Npb24gc2hvdWxkIHJlbWFpbiBhZnRlciBjYW5jZWxsYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5zdGF0dXMuZ2V0KCksIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCAnc2hvdWxkIGJlIG1hcmtlZCBjb21wbGV0ZWQnKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJlbmFtZSAtLS0tLS0tXG5cblx0dGVzdCgncmVuYW1lQ2hhdCBkZWxlZ2F0ZXMgdG8gY2xhdWRlIHJlbmFtZSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsYXVkZVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUsIHBhdGg6ICcvY2xhdWRlLXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihjbGF1ZGVSZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgY2xhdWRlRW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBTaG91bGQgbm90IHRocm93IFx1MjAxNCBkZWxlZ2F0ZXMgdG8gSUNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kXG5cdFx0YXdhaXQgcHJvdmlkZXIucmVuYW1lQ2hhdChzZXNzaW9uc1swXS5zZXNzaW9uSWQsIGNsYXVkZVJlc291cmNlLCAnTmV3IFRpdGxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZUNoYXQgdGhyb3dzIGZvciB1bnN1cHBvcnRlZCBzZXNzaW9uIHR5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiAnL2Nsb3VkLXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBwcm92aWRlci5yZW5hbWVDaGF0KHNlc3Npb25zWzBdLnNlc3Npb25JZCwgcmVzb3VyY2UsICdOZXcgVGl0bGUnKSxcblx0XHRcdC9ub3Qgc3VwcG9ydGVkLyxcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFVuY29tbWl0dGVkIHRlbXAgc2Vzc2lvbiBjbGVhbnVwIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd1bmNvbW1pdHRlZCB0ZW1wIHNlc3Npb24gY2xlYW51cCcsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkuZmlsZSgnL3Rlc3QvcmVwbycpO1xuXG5cdFx0LyoqXG5cdFx0ICogUmV0dXJucyBhIHByb3ZpZGVyIHdpcmVkIHVwIHNvIHRoYXQgc2VuZFJlcXVlc3Qga2VlcHMgdGhlIHJlcXVlc3Rcblx0XHQgKiBpbi1mbGlnaHQgaW5kZWZpbml0ZWx5LiBBbHNvIHJldHVybnMgaGVscGVycyB0byByZXNvbHZlIHRoZSByZXF1ZXN0XG5cdFx0ICogYXMgYSBjYW5jZWxsYXRpb24gKHNvIHRoZSBwcm92aWRlciBjbGVhbnMgdXAgcHJvbXB0bHkgaW4gdGVzdHMpLlxuXHRcdCAqL1xuXHRcdGZ1bmN0aW9uIG1ha2VJbkZsaWdodFByb3ZpZGVyKCk6IHtcblx0XHRcdHByb3ZpZGVyOiBDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXI7XG5cdFx0XHRjYW5jZWxSZXF1ZXN0OiAoKSA9PiB2b2lkO1xuXHRcdH0ge1xuXHRcdFx0bGV0IHJlc29sdmVDb21wbGV0ZSE6ICgpID0+IHZvaWQ7XG5cdFx0XHRsZXQgcmVzb2x2ZUNyZWF0ZWQhOiAocjogSUNoYXRSZXNwb25zZU1vZGVsKSA9PiB2b2lkO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VDb21wbGV0ZVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHsgcmVzb2x2ZUNvbXBsZXRlID0gcjsgfSk7XG5cdFx0XHRjb25zdCByZXNwb25zZUNyZWF0ZWRQcm9taXNlID0gbmV3IFByb21pc2U8SUNoYXRSZXNwb25zZU1vZGVsPihyID0+IHsgcmVzb2x2ZUNyZWF0ZWQgPSByOyB9KTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsIGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdGtpbmQ6ICdzZW50JyBhcyBjb25zdCxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlLFxuXHRcdFx0XHRcdHJlc3BvbnNlQ3JlYXRlZFByb21pc2UsXG5cdFx0XHRcdFx0YWdlbnQ6IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBZ2VudERhdGE+KCkgeyB9KCksXG5cdFx0XHRcdH0gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEsXG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRjYW5jZWxSZXF1ZXN0OiAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZUNyZWF0ZWQoeyBpc0NhbmNlbGVkOiB0cnVlIH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlc3BvbnNlTW9kZWwpO1xuXHRcdFx0XHRcdHJlc29sdmVDb21wbGV0ZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiogV2FpdCBmb3IgdGhlIHByb3ZpZGVyIHRvIGZpcmUgYW4gXCJhZGRlZFwiIHNlc3Npb24gY2hhbmdlIGV2ZW50LiAqL1xuXHRcdGZ1bmN0aW9uIHdhaXRGb3JTZXNzaW9uQWRkZWQocHJvdmlkZXI6IENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBkID0gcHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5hZGRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZGVsZXRlU2Vzc2lvbiByZW1vdmVzIGEgdGVtcCBzZXNzaW9uIHRoYXQgaXMgYXdhaXRpbmcgY29tbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwcm92aWRlciwgY2FuY2VsUmVxdWVzdCB9ID0gbWFrZUluRmxpZ2h0UHJvdmlkZXIoKTtcblxuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gbmV3U2Vzc2lvbi5zZXNzaW9uSWQ7XG5cblx0XHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICd0ZXN0JyB9KTtcblx0XHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDEsICdzZXNzaW9uIHNob3VsZCBhcHBlYXIgd2hpbGUgaW4tZmxpZ2h0Jyk7XG5cblx0XHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ3Nlc3Npb24gc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZGVsZXRlU2Vzc2lvbicpO1xuXG5cdFx0XHQvLyBDYW5jZWxsYXRpb24gYWZ0ZXIgZGVsZXRlIHNob3VsZCByZXNvbHZlIGNsZWFubHlcblx0XHRcdGNhbmNlbFJlcXVlc3QoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5kb2VzTm90UmVqZWN0KHNlbmRQcm9taXNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FyY2hpdmVTZXNzaW9uIGFyY2hpdmVzIGEgdGVtcCBzZXNzaW9uIHRoYXQgaXMgYXdhaXRpbmcgY29tbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwcm92aWRlciwgY2FuY2VsUmVxdWVzdCB9ID0gbWFrZUluRmxpZ2h0UHJvdmlkZXIoKTtcblxuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gbmV3U2Vzc2lvbi5zZXNzaW9uSWQ7XG5cblx0XHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICd0ZXN0JyB9KTtcblx0XHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDEsICdzZXNzaW9uIHNob3VsZCBhcHBlYXIgd2hpbGUgaW4tZmxpZ2h0Jyk7XG5cblx0XHRcdGF3YWl0IHByb3ZpZGVyLmFyY2hpdmVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDEsICdzZXNzaW9uIHNob3VsZCBzdGlsbCBiZSBpbiB0aGUgbGlzdCBhZnRlciBhcmNoaXZlU2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNBcmNoaXZlZC5nZXQoKSwgdHJ1ZSwgJ3Nlc3Npb24gc2hvdWxkIGJlIGFyY2hpdmVkJyk7XG5cblx0XHRcdC8vIENhbmNlbGxhdGlvbiBhZnRlciBhcmNoaXZlIHNob3VsZCByZXNvbHZlIGNsZWFubHlcblx0XHRcdGNhbmNlbFJlcXVlc3QoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5kb2VzTm90UmVqZWN0KHNlbmRQcm9taXNlKTtcblxuXHRcdFx0Ly8gQ2xlYW4gdXAgdG8gYXZvaWQgbGVha2VkIGRpc3Bvc2FibGVcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FyY2hpdmVTZXNzaW9uIGFyY2hpdmVzIGEgc3RvcHBlZCBzZXNzaW9uIHRoYXQgd2FzIG5ldmVyIGNvbW1pdHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNhbmNlbFJlcXVlc3QgfSA9IG1ha2VJbkZsaWdodFByb3ZpZGVyKCk7XG5cblx0XHRcdGNvbnN0IG5ld1Nlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IG5ld1Nlc3Npb24uc2Vzc2lvbklkO1xuXG5cdFx0XHRjb25zdCBhZGRlZCA9IHdhaXRGb3JTZXNzaW9uQWRkZWQocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHNlbmRQcm9taXNlID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAndGVzdCcgfSk7XG5cdFx0XHRhd2FpdCBhZGRlZDtcblxuXHRcdFx0Ly8gU3RvcCBiZWZvcmUgY29tbWl0IGFycml2ZXMgXHUyMDE0IHNlc3Npb24gc2hvdWxkIHN0YXkgYXMgY29tcGxldGVkXG5cdFx0XHRjYW5jZWxSZXF1ZXN0KCk7XG5cdFx0XHRhd2FpdCBzZW5kUHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxLCAnc3RvcHBlZCBzZXNzaW9uIHNob3VsZCByZW1haW4gaW4gdGhlIGxpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLnN0YXR1cy5nZXQoKSwgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsICdzZXNzaW9uIHNob3VsZCBiZSBjb21wbGV0ZWQnKTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZXIuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSwgJ3Nlc3Npb24gc2hvdWxkIHN0aWxsIGJlIGluIHRoZSBsaXN0IGFmdGVyIGFyY2hpdmluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNBcmNoaXZlZC5nZXQoKSwgdHJ1ZSwgJ3Nlc3Npb24gc2hvdWxkIGJlIGFyY2hpdmVkJyk7XG5cblx0XHRcdC8vIFVuYXJjaGl2ZSBzaG91bGQgYWxzbyB3b3JrXG5cdFx0XHRhd2FpdCBwcm92aWRlci51bmFyY2hpdmVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc0FyY2hpdmVkLmdldCgpLCBmYWxzZSwgJ3Nlc3Npb24gc2hvdWxkIGJlIHVuYXJjaGl2ZWQnKTtcblxuXHRcdFx0Ly8gQ2xlYW4gdXAgdG8gYXZvaWQgbGVha2VkIGRpc3Bvc2FibGVcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBOZXcgc2Vzc2lvbiBkZWZhdWx0IHBlcm1pc3Npb24gbGV2ZWwgc2VlZGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCduZXcgc2Vzc2lvbiBkZWZhdWx0IHBlcm1pc3Npb24gbGV2ZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZpbGUoJy90ZXN0L3JlcG8nKTtcblxuXHRcdGZ1bmN0aW9uIG1ha2VDb25maWcob3B0czogeyBkZWZhdWx0TGV2ZWw/OiBDaGF0UGVybWlzc2lvbkxldmVsOyBwb2xpY3lSZXN0cmljdGVkPzogYm9vbGVhbiB9KTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0XHRcdG92ZXJyaWRlIGluc3BlY3Q8VD4oa2V5OiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+IHtcblx0XHRcdFx0XHRjb25zdCBiYXNlID0gc3VwZXIuaW5zcGVjdDxUPihrZXkpO1xuXHRcdFx0XHRcdGlmIChvcHRzLnBvbGljeVJlc3RyaWN0ZWQgJiYga2V5ID09PSBDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgcG9saWN5VmFsdWU6IGZhbHNlIGFzIHVua25vd24gYXMgVCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYmFzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpO1xuXHRcdFx0aWYgKG9wdHMuZGVmYXVsdExldmVsKSB7XG5cdFx0XHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsLCBvcHRzLmRlZmF1bHRMZXZlbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdH1cblxuXHRcdHRlc3QoJ0NMSSBzZXNzaW9uIHNlZWRzIHBlcm1pc3Npb24gbGV2ZWwgZnJvbSBjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG1ha2VDb25maWcoeyBkZWZhdWx0TGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90IH0pO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsICgpID0+IG5ldyBQcm9taXNlKCgpID0+IHsgfSksIHsgY29uZmlndXJhdGlvblNlcnZpY2UgfSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25JbmZvID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSW5mby5zZXNzaW9uSWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8ucGVybWlzc2lvbkxldmVsLmdldCgpLCBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGFtcHMgdG8gRGVmYXVsdCB3aGVuIGNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlIHBvbGljeSBpcyBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbWFrZUNvbmZpZyh7IGRlZmF1bHRMZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QsIHBvbGljeVJlc3RyaWN0ZWQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgKCkgPT4gbmV3IFByb21pc2UoKCkgPT4geyB9KSwgeyBjb25maWd1cmF0aW9uU2VydmljZSB9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb25JbmZvLnNlc3Npb25JZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5wZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIERlZmF1bHQgd2hlbiBjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQgaXMgdW5zZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG1ha2VDb25maWcoe30pO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsICgpID0+IG5ldyBQcm9taXNlKCgpID0+IHsgfSksIHsgY29uZmlndXJhdGlvblNlcnZpY2UgfSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25JbmZvID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSW5mby5zZXNzaW9uSWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8ucGVybWlzc2lvbkxldmVsLmdldCgpLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIEluLWZsaWdodCBjb21taXQgcHJvdGVjdGlvbiAtLS0tLS0tXG5cblx0dGVzdCgnY29uY3VycmVudCBtb2RlbCByZS1yZXNvbHZlIGRvZXMgbm90IHNwdXJpb3VzbHkgcmVtb3ZlIGFuIGluLWZsaWdodCBjb21taXR0ZWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGlzIHJlcHJvZHVjZXMgdGhlIHJhY2UgY29uZGl0aW9uIGZyb20gdGhlIHNtb2tlIHRlc3QgZmFpbHVyZTpcblx0XHQvLyAxLiBDbGF1ZGUgc2Vzc2lvbiBpcyBjcmVhdGVkIGFuZCBjb21taXR0ZWQgKGFkZGVkIHRvIG1vZGVsKVxuXHRcdC8vIDIuIF9zZW5kRmlyc3RDaGF0IGlzIHdhaXRpbmcgZm9yIHRoZSBjb21taXR0ZWQgYWRhcHRlciBpbiB0aGUgY2FjaGVcblx0XHQvLyAzLiBBIGNvbmN1cnJlbnQgbW9kZWwgcmUtcmVzb2x2ZSB0cmFuc2llbnRseSByZW1vdmVzIHRoZSBzZXNzaW9uXG5cdFx0Ly8gICAgZnJvbSBhZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9uc1xuXHRcdC8vIDQuIF9yZWZyZXNoU2Vzc2lvbkNhY2hlIHNob3VsZCBOT1QgZmlyZSBgcmVtb3ZlZGAgZm9yIHRoZSBpbi1mbGlnaHRcblx0XHQvLyAgICBzZXNzaW9uIGJlY2F1c2UgaXQgaXMgcHJvdGVjdGVkIGJ5IF9pbkZsaWdodENvbW1pdHNcblxuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbW1pdFNlc3Npb24sIHJlYWxSZXNvdXJjZSB9ID0gbWFrZUNsYXVkZUluRmxpZ2h0UHJvdmlkZXIoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ2xhdWRlQ29kZVNlc3Npb25UeXBlLmlkKTtcblxuXHRcdGNvbnN0IHJlbW92YWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHRyZW1vdmFscy5wdXNoKHIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWRkZWQgPSB3YWl0Rm9yU2Vzc2lvbkFkZGVkKHByb3ZpZGVyKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ3Rlc3QnIH0pO1xuXHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0Ly8gQ29tbWl0OiBhZGRzIHRoZSByZWFsIHNlc3Npb24gdG8gdGhlIG1vZGVsLCB0cmlnZ2VyaW5nXG5cdFx0Ly8gX3JlZnJlc2hTZXNzaW9uQ2FjaGUgd2hpY2ggcG9wdWxhdGVzIHRoZSBBZ2VudFNlc3Npb25BZGFwdGVyLlxuXHRcdGNvbW1pdFNlc3Npb24oKTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgY29uY3VycmVudCBtb2RlbCByZS1yZXNvbHZlIHRyYW5zaWVudGx5IGRyb3BwaW5nIHRoZVxuXHRcdC8vIHNlc3Npb246IHJlbW92ZSBpdCBmcm9tIHRoZSBtb2RlbCAoZmlyZXMgb25EaWRDaGFuZ2VTZXNzaW9ucyBcdTIxOTJcblx0XHQvLyBfcmVmcmVzaFNlc3Npb25DYWNoZSkuIEJlY2F1c2UgX3NlbmRGaXJzdENoYXQgaG9sZHMgdGhlIHJlc291cmNlXG5cdFx0Ly8gaW4gX2luRmxpZ2h0Q29tbWl0cywgX3JlZnJlc2hTZXNzaW9uQ2FjaGUgbXVzdCBOT1QgZmlyZSBgcmVtb3ZlZGAuXG5cdFx0bW9kZWwucmVtb3ZlU2Vzc2lvbihyZWFsUmVzb3VyY2UpO1xuXG5cdFx0Ly8gVGhlIGNvbW1pdHRlZCBzZXNzaW9uIHJlc291cmNlIG11c3QgTk9UIGFwcGVhciBpbiByZW1vdmFsc1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFyZW1vdmFscy5pbmNsdWRlcyhyZWFsUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRgSW4tZmxpZ2h0IGNvbW1pdHRlZCBzZXNzaW9uICR7cmVhbFJlc291cmNlLnRvU3RyaW5nKCl9IHNob3VsZCBub3QgYmUgc3B1cmlvdXNseSByZW1vdmVkLiBgICtcblx0XHRcdGBSZW1vdmFscyBzZWVuOiBbJHtyZW1vdmFscy5qb2luKCcsICcpfV1gLFxuXHRcdCk7XG5cblx0XHQvLyBSZS1hZGQgdGhlIHNlc3Npb24gc28gX3dhaXRGb3JTZXNzaW9uSW5DYWNoZSBjYW4gcmVzb2x2ZVxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZWFsUmVzb3VyY2UsIHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlIH0pKTtcblxuXHRcdGF3YWl0IHNlbmRQcm9taXNlO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG91ZCBzZXNzaW9uIHRoYXQgY29tbWl0cyBhIG5ldyByZXNvdXJjZSByZXNvbHZlcyB3aXRob3V0IHRpbWluZyBvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogYSBjbG91ZCBzZXNzaW9uIGNvbW1pdHMgYSBkaWZmZXJlbnQgcmVzb3VyY2UgbWlkLXJlcXVlc3Rcblx0XHQvLyAodW50aXRsZWQgXHUyMTkyIC90YXNrLzxpZD4pLCBzbyBfc2VuZEZpcnN0Q2hhdCBtdXN0IHdhaXQgZm9yIHRoZSBjb21taXR0ZWRcblx0XHQvLyByZXNvdXJjZSwgbm90IHRoZSB1bnRpdGxlZCBvbmUsIG90aGVyd2lzZSBpdCB0aW1lcyBvdXQgYW5kIHJlbW92ZXMgdGhlIHNlc3Npb24uXG5cdFx0Y29uc3QgY29tbWl0dGVkUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiBgL3Rhc2svJHtnZW5lcmF0ZVV1aWQoKX1gIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ29tbWl0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgb3JpZ2luYWw6IFVSSTsgY29tbWl0dGVkOiBVUkkgfT4oKSk7XG5cblx0XHRsZXQgcmVzb2x2ZUNvbXBsZXRlITogKCkgPT4gdm9pZDtcblx0XHRjb25zdCByZXNwb25zZUNvbXBsZXRlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4geyByZXNvbHZlQ29tcGxldGUgPSByOyB9KTtcblx0XHRjb25zdCByZXNwb25zZUNyZWF0ZWRQcm9taXNlID0gbmV3IFByb21pc2U8SUNoYXRSZXNwb25zZU1vZGVsPigoKSA9PiB7IC8qIG5ldmVyIHJlc29sdmVzICovIH0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsIGFzeW5jICgpID0+ICh7XG5cdFx0XHRraW5kOiAnc2VudCcgYXMgY29uc3QsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlLFxuXHRcdFx0XHRyZXNwb25zZUNyZWF0ZWRQcm9taXNlLFxuXHRcdFx0XHRhZ2VudDogbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFnZW50RGF0YT4oKSB7IH0oKSxcblx0XHRcdH0gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEsXG5cdFx0fSksIHsgb25EaWRDb21taXRTZXNzaW9uOiBvbkRpZENvbW1pdC5ldmVudCB9KTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBwYXRoOiAnL293bmVyL3JlcG8vSEVBRCcgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pZCk7XG5cblx0XHRjb25zdCByZW1vdmFsczogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHtcblx0XHRcdGZvciAoY29uc3QgciBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdFx0cmVtb3ZhbHMucHVzaChyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHVudGl0bGVkUmVzb3VyY2UgPSBjaGF0LnJlc291cmNlO1xuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoaScgfSk7XG5cdFx0YXdhaXQgYWRkZWQ7XG5cblx0XHQvLyBUaGUgcmVzcG9uc2UgY29tcGxldGVzIGVhcmx5IChjbG91ZCByZXR1cm5zIGEgY29uZmlybWF0aW9uKSBiZWZvcmUgdGhlXG5cdFx0Ly8gY29tbWl0IGxhbmRzIFx1MjAxNCB0aGlzIG11c3Qgbm90IGNhdXNlIHRoZSB3YWl0IHRvIGdpdmUgdXAuXG5cdFx0cmVzb2x2ZUNvbXBsZXRlKCk7XG5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24oY29tbWl0dGVkUmVzb3VyY2UsIHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQgfSkpO1xuXG5cdFx0Ly8gX3dhaXRGb3JDb21taXR0ZWRTZXNzaW9uIHN1YnNjcmliZXMgdG8gb25EaWRDb21taXRTZXNzaW9uIG9ubHkgYWZ0ZXJcblx0XHQvLyBzZW5kUmVxdWVzdCByZXNvbHZlcywgc28gcmUtZmlyZSB1bnRpbCB0aGUgc2VuZCBzZXR0bGVzIHRvIGF2b2lkIHRoZSByYWNlLlxuXHRcdGxldCBzZW5kU2V0dGxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpcmVDb21taXRVbnRpbFNldHRsZWQgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR3aGlsZSAoIXNlbmRTZXR0bGVkKSB7XG5cdFx0XHRcdG9uRGlkQ29tbWl0LmZpcmUoeyBvcmlnaW5hbDogdW50aXRsZWRSZXNvdXJjZSwgY29tbWl0dGVkOiBjb21taXR0ZWRSZXNvdXJjZSB9KTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbW1pdExvb3AgPSBmaXJlQ29tbWl0VW50aWxTZXR0bGVkKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3Qoc2VuZFByb21pc2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZW5kU2V0dGxlZCA9IHRydWU7XG5cdFx0XHRhd2FpdCBjb21taXRMb29wO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFyZW1vdmFscy5pbmNsdWRlcyh1bnRpdGxlZFJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0YENsb3VkIHNlc3Npb24gc2hvdWxkIG5vdCBiZSByZW1vdmVkIGFmdGVyIGNvbW1pdHRpbmcuIFJlbW92YWxzIHNlZW46IFske3JlbW92YWxzLmpvaW4oJywgJyl9XWAsXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDOUUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUMxRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQiw2QkFBa0Q7QUFDaEYsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW1GO0FBQzVGLFNBQVMsbUJBQXNFLDRCQUE0QjtBQUMzRyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBcUMsOEJBQThCO0FBQ25FLFNBQVMsa0NBQWtDO0FBRzNDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsMkJBQTJCLHFCQUFxQjtBQUN6RCxTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyw2QkFBNkIsNkJBQTZCLHFCQUFxQix1QkFBdUIsK0JBQW9EO0FBQ25LLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCLDhCQUFrRDtBQUluRixTQUFTLHVCQUF1QixVQUFlLE1BUzdCO0FBQ2pCLFFBQU0sZUFBZSxNQUFNLGdCQUFnQixzQkFBc0I7QUFDakUsTUFBSSxXQUFXLE1BQU0sWUFBWTtBQUNqQyxNQUFJLE9BQU8sTUFBTSxRQUFRO0FBQ3pCLFNBQU8sSUFBSSxjQUFjLEtBQW9CLEVBQUU7QUFBQSxJQUFwQztBQUFBO0FBQ1YsV0FBa0IsV0FBVztBQUM3QixXQUFrQixlQUFlO0FBQ2pDLFdBQWtCLGdCQUFnQjtBQUNsQyxXQUFrQixRQUFRLE1BQU0sU0FBUztBQUN6QyxXQUFrQixTQUFTLE1BQU0sVUFBVSxrQkFBa0I7QUFDN0QsV0FBa0IsT0FBTyxRQUFRO0FBQ2pDLFdBQWtCLFNBQVMsRUFBRSxTQUFTLE1BQU0sYUFBYSxLQUFLLElBQUksR0FBRyxvQkFBb0IsUUFBVyxrQkFBa0IsT0FBVTtBQUNoSSxXQUFrQixXQUFXLE1BQU0sWUFBWSxFQUFFLGdCQUFnQixhQUFhO0FBQUE7QUFBQSxJQUNyRSxhQUFzQjtBQUFFLGFBQU87QUFBQSxJQUFVO0FBQUEsSUFDekMsWUFBWSxPQUFzQjtBQUFFLGlCQUFXO0FBQUEsSUFBTztBQUFBLElBQ3RELFdBQW9CO0FBQUUsYUFBTztBQUFBLElBQU87QUFBQSxJQUNwQyxZQUFrQjtBQUFBLElBQUU7QUFBQSxJQUNwQixTQUFrQjtBQUFFLGFBQU87QUFBQSxJQUFNO0FBQUEsSUFDakMsaUJBQTBCO0FBQUUsYUFBTztBQUFBLElBQU87QUFBQSxJQUMxQyxRQUFRLE9BQXNCO0FBQ3RDLGFBQU87QUFHUCxZQUFNLFlBQVk7QUFBQSxJQUNuQjtBQUFBLEVBQ0QsRUFBRTtBQUNIO0FBSUEsTUFBTSx1QkFBdUI7QUFBQSxFQUE3QjtBQUNDLFNBQWlCLFlBQTZCLENBQUM7QUFDL0MsU0FBaUIsdUJBQXVCLElBQUksUUFBYztBQUMxRCxTQUFTLHNCQUFzQixLQUFLLHFCQUFxQjtBQUN6RCxTQUFTLGdCQUFnQixNQUFNO0FBQy9CLFNBQVMsZUFBZSxNQUFNO0FBQzlCLFNBQVMsa0NBQWtDLE1BQU07QUFDakQsU0FBUyxXQUFXO0FBQUE7QUFBQSxFQUVwQixJQUFJLFdBQTRCO0FBQUUsV0FBTyxDQUFDLEdBQUcsS0FBSyxTQUFTO0FBQUEsRUFBRztBQUFBLEVBRTlELFdBQVcsVUFBMEM7QUFDcEQsV0FBTyxLQUFLLFVBQVUsS0FBSyxPQUFLLEVBQUUsU0FBUyxTQUFTLE1BQU0sU0FBUyxTQUFTLENBQUM7QUFBQSxFQUM5RTtBQUFBLEVBRUEsV0FBVyxTQUE4QjtBQUN4QyxTQUFLLFVBQVUsS0FBSyxPQUFPO0FBQzNCLFNBQUsscUJBQXFCLEtBQUs7QUFBQSxFQUNoQztBQUFBLEVBRUEsY0FBYyxVQUFxQjtBQUNsQyxVQUFNLE1BQU0sS0FBSyxVQUFVLFVBQVUsT0FBSyxFQUFFLFNBQVMsU0FBUyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQ3ZGLFFBQUksUUFBUSxJQUFJO0FBQ2YsV0FBSyxVQUFVLE9BQU8sS0FBSyxDQUFDO0FBQzVCLFdBQUsscUJBQXFCLEtBQUs7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGVBQWUsU0FBOEI7QUFDNUMsVUFBTSxNQUFNLEtBQUssVUFBVSxVQUFVLE9BQUssRUFBRSxTQUFTLFNBQVMsTUFBTSxRQUFRLFNBQVMsU0FBUyxDQUFDO0FBQy9GLFdBQU8sR0FBRyxPQUFPLEdBQUcsdUNBQXVDO0FBQzNELFNBQUssVUFBVSxPQUFPLEtBQUssR0FBRyxPQUFPO0FBQ3JDLFNBQUsscUJBQXFCLEtBQUs7QUFBQSxFQUNoQztBQUFBLEVBRUEsd0JBQThCO0FBQzdCLFNBQUsscUJBQXFCLEtBQUs7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSxVQUF5QjtBQUFBLEVBQUU7QUFBQSxFQUVqQyxVQUFnQjtBQUNmLFNBQUsscUJBQXFCLFFBQVE7QUFBQSxFQUNuQztBQUNEO0FBb0JBLFNBQVMscUJBQXFCLE1BQTRFO0FBQ3pHLFNBQU8sT0FBTyxTQUFTLFlBQVksU0FBUyxRQUFRLGNBQWMsUUFBUSxJQUFJLE1BQU0sS0FBSyxRQUFRO0FBQ2xHO0FBRUEsTUFBTSx5QkFBMEQ7QUFBQSxFQUFoRTtBQUlDLFNBQWlCLFNBQVMsb0JBQUksSUFBdUQ7QUFBQTtBQUFBLEVBRXJGLElBQUksUUFBdUU7QUFDMUUsV0FBTyxLQUFLLE9BQU8sSUFBSSxNQUFNO0FBQUEsRUFDOUI7QUFBQSxFQUVBLElBQUksUUFBZ0IsTUFBdUQ7QUFDMUUsU0FBSyxPQUFPLElBQUksUUFBUSxJQUFJO0FBQUEsRUFDN0I7QUFDRDtBQUVBLE1BQU0sMEJBQTBCLEtBQXFCLEVBQUU7QUFBQSxFQVF0RCxZQUE2QixvQkFBNkI7QUFDekQsVUFBTTtBQURzQjtBQU43QixTQUFpQixlQUFlLGdCQUFnRCxNQUFNLE1BQVM7QUFHL0YsdUJBQWM7QUFDZCwwQ0FBaUM7QUFVakMsU0FBUyxvQ0FBb0MsWUFBeUM7QUFDckYsV0FBSztBQUNMLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxTQUFTLGtDQUFrQyxNQUFNO0FBQ2hELFdBQUs7QUFDTCxhQUFPLElBQUksa0JBQWtCLEtBQUssaUJBQWlCO0FBQUEsSUFDcEQ7QUFkQyxVQUFNLGNBQWMsS0FBSztBQUN6QixTQUFLLG9CQUFvQixJQUFJLGNBQWMsS0FBNkIsRUFBRTtBQUFBLE1BQTdDO0FBQUE7QUFDNUIsYUFBa0IsY0FBYztBQUFBO0FBQUEsSUFDakMsRUFBRTtBQUFBLEVBQ0g7QUFBQSxFQVlBLGVBQWUsYUFBdUM7QUFDckQsU0FBSyxhQUFhLElBQUksYUFBYSxNQUFTO0FBQUEsRUFDN0M7QUFDRDtBQUVBLFNBQVMsa0JBQWtCLE9BQStCLFVBQVUsT0FBMkI7QUFDOUYsU0FBTztBQUFBLElBQ04sUUFBUTtBQUFBLElBQ1IsT0FBTztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ047QUFBQSxJQUNBLFFBQVEsRUFBRSxPQUFPLFNBQVMsV0FBVyxHQUFHO0FBQUEsSUFDeEMsU0FBUztBQUFBLElBQ1QsU0FBUztBQUFBLElBQ1QsU0FBUztBQUFBLElBQ1Q7QUFBQSxJQUNBLFdBQVc7QUFBQSxJQUNYLFdBQVc7QUFBQSxJQUNYLFVBQVUsVUFBVSx1QkFBdUIsU0FBUyxLQUFLO0FBQUEsSUFDekQsV0FBVztBQUFBLElBQ1gsZ0JBQWdCO0FBQUEsRUFDakI7QUFDRDtBQUlBLFNBQVMsZUFDUixhQUNBLE9BQ0EsTUFDOEI7QUFDOUIsU0FBTyx5QkFBeUIsYUFBYSxPQUFPLElBQUksRUFBRTtBQUMzRDtBQUVBLFNBQVMseUJBQ1IsYUFDQSxPQUNBLE1BQ3FGO0FBQ3JGLFFBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBRTNFLFFBQU0sZ0JBQWdCLElBQUkseUJBQXlCO0FBQ25ELGdCQUFjLHFCQUFxQiw2Q0FBNkMsTUFBTSxvQkFBb0IsSUFBSTtBQUM5RyxnQkFBYyxxQkFBcUIsNkJBQTZCLE1BQU0saUJBQWlCLElBQUk7QUFDM0YsZ0JBQWMscUJBQXFCLHNDQUFzQyxNQUFNLG1CQUFtQixLQUFLO0FBQ3ZHLGdCQUFjLHFCQUFxQixrQkFBa0IsbUNBQW1DLE1BQU0sa0JBQWtCLEtBQUs7QUFFckgsdUJBQXFCLEtBQUssdUJBQXVCLGFBQWE7QUFDOUQsdUJBQXFCLEtBQUssb0JBQW9CLFlBQVksSUFBSSxJQUFJLHNCQUFzQixDQUFDLENBQUM7QUFDMUYsdUJBQXFCLEtBQUssNkJBQTZCLEVBQUUsZUFBZSxRQUFXLFNBQVMsZ0JBQWdCLE1BQU0sb0JBQW9CLElBQUksRUFBRSxDQUFDO0FBQzdJLHVCQUFxQixLQUFLLGlCQUFpQixZQUFZLElBQUksSUFBSSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3BGLHVCQUFxQixLQUFLLG9CQUFvQixDQUFDLENBQUM7QUFDaEQsdUJBQXFCLEtBQUssZ0JBQWdCO0FBQUEsSUFDekMsU0FBUyxhQUFhLEVBQUUsV0FBVyxLQUFLO0FBQUEsRUFDekMsQ0FBQztBQUNELHVCQUFxQixLQUFLLGlCQUFpQjtBQUFBLElBQzFDLGdCQUFnQixPQUFPLE9BQWUsU0FBb0I7QUFDekQsWUFBTSxtQkFBbUIsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDO0FBRTFDLFlBQU0sUUFBUSxLQUFLLENBQUM7QUFDcEIsVUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3pCLG1CQUFXLFFBQVEsT0FBTztBQUN6QixjQUFJLHFCQUFxQixJQUFJLEdBQUc7QUFDL0Isa0JBQU0sY0FBYyxLQUFLLFFBQVE7QUFBQSxVQUNsQztBQUFBLFFBQ0Q7QUFBQSxNQUNELFdBQVcscUJBQXFCLEtBQUssR0FBRztBQUN2QyxjQUFNLGNBQWMsTUFBTSxRQUFRO0FBQUEsTUFDbkM7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0QsQ0FBQztBQUNELHVCQUFxQixLQUFLLHVCQUF1QjtBQUFBLElBQ2hEO0FBQUEsSUFDQSxpQ0FBaUMsTUFBTTtBQUFBLElBQ3ZDLFlBQVksQ0FBQyxhQUFrQixNQUFNLFdBQVcsUUFBUTtBQUFBLEVBQ3pELENBQUM7QUFDRCx1QkFBcUIsS0FBSyxzQkFBc0I7QUFBQSxJQUMvQyw0QkFBNEIsT0FBTyxFQUFFLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxhQUFhLFFBQVEsYUFBYSxRQUFRLE1BQU0sT0FBVTtBQUFBLElBQ25JLHdCQUF3QixhQUFhLEVBQUUsZUFBZSxPQUFPLEVBQUUsVUFBVTtBQUFBLElBQUUsRUFBRSxJQUFJLGlCQUFpQixJQUFJLEtBQUssRUFBRSxRQUFRLE9BQU8sQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFVBQVU7QUFBQSxJQUFFLEVBQUU7QUFBQSxJQUMzSixvQkFBb0IsTUFBTTtBQUFBLElBQzFCLHNCQUFzQixNQUFNO0FBQUEsSUFDNUIsa0JBQWtCLE1BQU07QUFBQSxJQUN4QixrQkFBa0IsTUFBTTtBQUFBLElBQ3hCLCtCQUErQixNQUFNLE1BQU0sa0JBQWtCO0FBQUEsSUFDN0QseUJBQXlCLE1BQU07QUFBQSxFQUNoQyxDQUFDO0FBQ0QsdUJBQXFCLEtBQUssY0FBYztBQUFBLElBQ3ZDLHNCQUFzQixZQUFZO0FBQUEsSUFDbEMsYUFBYSxhQUFzQyxFQUFFLE1BQU0sUUFBaUIsTUFBTSxDQUFDLEVBQTBCO0FBQUEsSUFDN0csb0JBQW9CLE9BQU8sYUFBa0I7QUFBRSxZQUFNLGNBQWMsUUFBUTtBQUFBLElBQUc7QUFBQSxJQUM5RSxxQkFBcUIsTUFBTTtBQUFBLElBQUU7QUFBQSxFQUM5QixDQUFDO0FBQ0QsdUJBQXFCLEtBQUssb0JBQW9CO0FBQUEsSUFDN0MsYUFBYSxZQUFZO0FBQUEsSUFDekIsbUJBQW1CO0FBQUEsSUFDbkIsMkJBQTJCLE1BQU07QUFBQSxFQUNsQyxDQUFDO0FBQ0QsdUJBQXFCLEtBQUssd0JBQXdCLE1BQU0seUJBQXlCLEVBQUUscUJBQXFCLE1BQU0sT0FBVSxDQUFDO0FBQ3pILHVCQUFxQixLQUFLLDRCQUE0QjtBQUFBLElBQ3JELGtCQUFrQixNQUFNLENBQUM7QUFBQSxFQUMxQixDQUFDO0FBRUQsdUJBQXFCLEtBQUssdUJBQXVCLG9CQUFvQjtBQUNyRSx1QkFBcUIsS0FBSyxlQUFlO0FBQUEsSUFDeEMsYUFBYSxDQUFDLFFBQWEsSUFBSTtBQUFBLEVBQ2hDLENBQUM7QUFDRCx1QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxPQUFPLENBQUM7QUFDekQsdUJBQXFCLEtBQUssNkJBQTZCLEVBQUUsZUFBZSxRQUFXLFNBQVMsZ0JBQWdCLE1BQU0sb0JBQW9CLElBQUksRUFBRSxDQUFDO0FBQzdJLHVCQUFxQixLQUFLLGdCQUFnQixNQUFNLGlCQUFpQixJQUFJLGtCQUFrQixDQUFDO0FBQ3hGLHVCQUFxQixLQUFLLHVCQUF1QixNQUFNLHdCQUF3QixJQUFJLHlCQUF5QixDQUFDO0FBRTdHLFFBQU0sV0FBVyxZQUFZLElBQUkscUJBQXFCLGVBQWUsMkJBQTJCLENBQUM7QUFDakcsU0FBTyxFQUFFLFVBQVUsY0FBYztBQUNsQztBQVlBLFNBQVMsMkJBQ1IsYUFDQSxPQUNBLGFBQ0EsTUFDOEI7QUFDOUIsUUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFFM0UsUUFBTSxnQkFBZ0IsTUFBTSx3QkFBd0IsSUFBSSx5QkFBeUI7QUFDakYsZ0JBQWMscUJBQXFCLDZDQUE2QyxJQUFJO0FBQ3BGLGdCQUFjLHFCQUFxQiw2QkFBNkIsTUFBTSxpQkFBaUIsSUFBSTtBQUUzRix1QkFBcUIsS0FBSyxhQUFhLGNBQWM7QUFDckQsdUJBQXFCLEtBQUssdUJBQXVCLGFBQWE7QUFDOUQsdUJBQXFCLEtBQUssaUJBQWlCLFlBQVksSUFBSSxJQUFJLG1CQUFtQixDQUFDLENBQUM7QUFDcEYsdUJBQXFCLEtBQUssb0JBQW9CLENBQUMsQ0FBQztBQUNoRCx1QkFBcUIsS0FBSyxnQkFBZ0I7QUFBQSxJQUN6QyxTQUFTLGFBQWEsRUFBRSxXQUFXLEtBQUs7QUFBQSxFQUN6QyxDQUFDO0FBQ0QsdUJBQXFCLEtBQUssaUJBQWlCLEVBQUUsZ0JBQWdCLFlBQVksT0FBVSxDQUFDO0FBQ3BGLHVCQUFxQixLQUFLLHVCQUF1QjtBQUFBLElBQ2hEO0FBQUEsSUFDQSxpQ0FBaUMsTUFBTTtBQUFBLElBQ3ZDLFlBQVksQ0FBQyxhQUFrQixNQUFNLFdBQVcsUUFBUTtBQUFBLEVBQ3pELENBQUM7QUFDRCx1QkFBcUIsS0FBSyxzQkFBc0I7QUFBQSxJQUMvQyw0QkFBNEIsT0FBTyxFQUFFLE1BQU0sZ0JBQWdCLE1BQU0sUUFBUSxhQUFhLFFBQVEsYUFBYSxRQUFRLE1BQU0sT0FBVTtBQUFBLElBQ25JLHdCQUF3QixhQUFhLEVBQUUsZUFBZSxPQUFPLEVBQUUsVUFBVTtBQUFBLElBQUUsRUFBRSxJQUFJLGlCQUFpQixJQUFJLEtBQUssRUFBRSxRQUFRLE9BQU8sQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFVBQVU7QUFBQSxJQUFFLEVBQUU7QUFBQSxJQUMzSixvQkFBb0IsTUFBTSxzQkFBc0IsTUFBTTtBQUFBLElBQ3RELCtCQUErQixNQUFNO0FBQUEsSUFDckMsc0JBQXNCLE1BQU07QUFBQSxJQUM1QixrQkFBa0IsTUFBTTtBQUFBLElBQ3hCLGtCQUFrQixNQUFNO0FBQUEsSUFDeEIseUJBQXlCLE1BQU07QUFBQSxJQUMvQiwwQkFBMEIsTUFBTSw2QkFBNkIsWUFBWTtBQUFBLEVBQzFFLENBQUM7QUFDRCx1QkFBcUIsS0FBSyxjQUFjO0FBQUEsSUFDdkMsc0JBQXNCLFlBQVk7QUFBQSxJQUNsQztBQUFBLElBQ0Esb0JBQW9CLE9BQU8sYUFBa0I7QUFBRSxZQUFNLGNBQWMsUUFBUTtBQUFBLElBQUc7QUFBQSxJQUM5RSxxQkFBcUIsTUFBTTtBQUFBLElBQUU7QUFBQSxFQUM5QixDQUFDO0FBQ0QsdUJBQXFCLEtBQUssb0JBQW9CO0FBQUEsSUFDN0MsYUFBYSxZQUFZLElBQUksY0FBYyxLQUFrQixFQUFFO0FBQUEsTUFBbEM7QUFBQTtBQUM1QixhQUFTLFFBQVEsSUFBSSxjQUFjLEtBQTJCLEVBQUU7QUFBQSxVQUEzQztBQUFBO0FBQ3BCLGlCQUFTLHFCQUFxQixNQUFNO0FBQUEsWUFBRTtBQUFBO0FBQUEsUUFDdkMsRUFBRTtBQUFBO0FBQUEsSUFDSCxFQUFFO0FBQUEsSUFDRixtQkFBbUI7QUFBQSxJQUNuQiwyQkFBMkIsTUFBTTtBQUFBLEVBQ2xDLENBQUM7QUFDRCx1QkFBcUIsS0FBSyx3QkFBd0IsRUFBRSxxQkFBcUIsTUFBTSxPQUFVLENBQUM7QUFDMUYsdUJBQXFCLEtBQUssNEJBQTRCLEVBQUUsa0JBQWtCLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDcEYsdUJBQXFCLEtBQUssYUFBYSxFQUFFLGdCQUFnQixZQUFZLE9BQVUsQ0FBQztBQUNoRix1QkFBcUIsS0FBSyx1QkFBdUIsb0JBQW9CO0FBQ3JFLHVCQUFxQixLQUFLLGVBQWU7QUFBQSxJQUN4QyxhQUFhLENBQUMsUUFBYSxJQUFJO0FBQUEsRUFDaEMsQ0FBQztBQUNELHVCQUFxQixLQUFLLHFCQUFxQixFQUFFLE9BQU8sQ0FBQztBQUN6RCx1QkFBcUIsS0FBSyw2QkFBNkIsRUFBRSxlQUFlLFFBQVcsU0FBUyxnQkFBZ0IsTUFBTSxvQkFBb0IsSUFBSSxFQUFFLENBQUM7QUFDN0ksdUJBQXFCLEtBQUssb0JBQW9CLElBQUksc0JBQXNCLENBQUM7QUFDekUsdUJBQXFCLEtBQUssZ0JBQWdCLElBQUksa0JBQWtCLENBQUM7QUFDakUsdUJBQXFCLEtBQUssdUJBQXVCLElBQUkseUJBQXlCLENBQUM7QUFFL0UsU0FBTyxZQUFZLElBQUkscUJBQXFCLGVBQWUsMkJBQTJCLENBQUM7QUFDeEY7QUFFQSxNQUFNLCtCQUErQixNQUFNO0FBQzFDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsWUFBUSxJQUFJLHVCQUF1QjtBQUNuQyxnQkFBWSxJQUFJLGFBQWEsTUFBTSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDcEQsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLE1BQU07QUFBQSxFQUNuQixDQUFDO0FBRUQsMENBQXdDO0FBSXhDLE9BQUssNEJBQTRCLE1BQU07QUFDdEMsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELFdBQU8sWUFBWSxTQUFTLElBQUksbUJBQW1CO0FBQ25ELFdBQU8sWUFBWSxTQUFTLGFBQWEsUUFBUSxDQUFDO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxXQUFXLGVBQWUsYUFBYSxPQUFPLEVBQUUsZUFBZSxNQUFNLENBQUM7QUFDNUUsV0FBTyxZQUFZLFNBQVMsYUFBYSxRQUFRLENBQUM7QUFDbEQsV0FBTyxHQUFHLENBQUMsU0FBUyxhQUFhLEtBQUssT0FBSyxFQUFFLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUFBLEVBQzlFLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBS3ZFLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGVBQWUsTUFBTSxpQkFBaUIsS0FBSyxDQUFDO0FBQ2xHLFdBQU8sWUFBWSxTQUFTLGFBQWEsUUFBUSxDQUFDO0FBQ2xELFdBQU8sR0FBRyxDQUFDLFNBQVMsYUFBYSxLQUFLLE9BQUssRUFBRSxPQUFPLHNCQUFzQixFQUFFLENBQUM7QUFBQSxFQUM5RSxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsTUFBTTtBQUMxRixVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxlQUFlLE1BQU0saUJBQWlCLE1BQU0sQ0FBQztBQUNuRyxXQUFPLFlBQVksU0FBUyxhQUFhLFFBQVEsQ0FBQztBQUNsRCxXQUFPLEdBQUcsU0FBUyxhQUFhLEtBQUssT0FBSyxFQUFFLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUFBLEVBQzdFLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBS25GLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGVBQWUsTUFBTSxpQkFBaUIsTUFBTSxrQkFBa0IsTUFBTSxDQUFDO0FBQzNILFdBQU8sWUFBWSxTQUFTLGFBQWEsUUFBUSxDQUFDO0FBQ2xELFdBQU8sR0FBRyxTQUFTLGFBQWEsS0FBSyxPQUFLLEVBQUUsT0FBTyxzQkFBc0IsRUFBRSxDQUFDO0FBQUEsRUFDN0UsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsVUFBTSxFQUFFLFVBQVUsY0FBYyxJQUFJLHlCQUF5QixhQUFhLEtBQUs7QUFDL0UsV0FBTyxZQUFZLFNBQVMsYUFBYSxRQUFRLENBQUM7QUFFbEQsUUFBSSxRQUFRO0FBQ1osZ0JBQVksSUFBSSxTQUFTLHdCQUF3QixNQUFNO0FBQUUsY0FBUTtBQUFBLElBQU0sQ0FBQyxDQUFDO0FBR3pFLGtCQUFjLHFCQUFxQiw2QkFBNkIsS0FBSztBQUNyRSxrQkFBYyxnQ0FBZ0MsS0FBSztBQUFBLE1BQ2xELFFBQVEsb0JBQW9CO0FBQUEsTUFDNUIsY0FBYyxvQkFBSSxJQUFJLENBQUMsMkJBQTJCLENBQUM7QUFBQSxNQUNuRCxRQUFRLEVBQUUsTUFBTSxDQUFDLDJCQUEyQixHQUFHLFdBQVcsQ0FBQyxFQUFFO0FBQUEsTUFDN0Qsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUTtBQUFBLElBQ2hELENBQUM7QUFFRCxXQUFPLEdBQUcsT0FBTywyQ0FBMkM7QUFDNUQsV0FBTyxZQUFZLFNBQVMsYUFBYSxRQUFRLENBQUM7QUFBQSxFQUNuRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUloRixVQUFNLEVBQUUsVUFBVSxjQUFjLElBQUkseUJBQXlCLGFBQWEsS0FBSztBQUMvRSxXQUFPLFlBQVksU0FBUyxhQUFhLFFBQVEsQ0FBQztBQUVsRCxRQUFJLFFBQVE7QUFDWixnQkFBWSxJQUFJLFNBQVMsd0JBQXdCLE1BQU07QUFBRSxjQUFRO0FBQUEsSUFBTSxDQUFDLENBQUM7QUFFekUsa0JBQWMscUJBQXFCLHNDQUFzQyxJQUFJO0FBQzdFLGtCQUFjLGdDQUFnQyxLQUFLO0FBQUEsTUFDbEQsUUFBUSxvQkFBb0I7QUFBQSxNQUM1QixjQUFjLG9CQUFJLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQztBQUFBLE1BQzVELFFBQVEsRUFBRSxNQUFNLENBQUMsb0NBQW9DLEdBQUcsV0FBVyxDQUFDLEVBQUU7QUFBQSxNQUN0RSxzQkFBc0IsQ0FBQyxRQUFnQixRQUFRO0FBQUEsSUFDaEQsQ0FBQztBQUVELFdBQU8sR0FBRyxPQUFPLDJDQUEyQztBQUM1RCxXQUFPLFlBQVksU0FBUyxhQUFhLFFBQVEsQ0FBQztBQUNsRCxXQUFPLEdBQUcsQ0FBQyxTQUFTLGFBQWEsS0FBSyxPQUFLLEVBQUUsT0FBTyxzQkFBc0IsRUFBRSxDQUFDO0FBQUEsRUFDOUUsQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFJOUUsVUFBTSxXQUFXLGVBQWUsYUFBYSxPQUFPLEVBQUUsZ0JBQWdCLEtBQUssQ0FBQztBQUM1RSxXQUFPLEdBQUcsQ0FBQyxTQUFTLGFBQWEsS0FBSyxPQUFLLEVBQUUsT0FBTyxzQkFBc0IsRUFBRSxDQUFDO0FBQUEsRUFDOUUsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFJbEYsVUFBTSxFQUFFLFVBQVUsY0FBYyxJQUFJLHlCQUF5QixhQUFhLEtBQUs7QUFDL0UsV0FBTyxHQUFHLFNBQVMsYUFBYSxLQUFLLE9BQUssRUFBRSxPQUFPLHNCQUFzQixFQUFFLENBQUM7QUFFNUUsUUFBSSxRQUFRO0FBQ1osZ0JBQVksSUFBSSxTQUFTLHdCQUF3QixNQUFNO0FBQUUsY0FBUTtBQUFBLElBQU0sQ0FBQyxDQUFDO0FBRXpFLGtCQUFjLHFCQUFxQixrQkFBa0IsbUNBQW1DLElBQUk7QUFDNUYsa0JBQWMsZ0NBQWdDLEtBQUs7QUFBQSxNQUNsRCxRQUFRLG9CQUFvQjtBQUFBLE1BQzVCLGNBQWMsb0JBQUksSUFBSSxDQUFDLGtCQUFrQixpQ0FBaUMsQ0FBQztBQUFBLE1BQzNFLFFBQVEsRUFBRSxNQUFNLENBQUMsa0JBQWtCLGlDQUFpQyxHQUFHLFdBQVcsQ0FBQyxFQUFFO0FBQUEsTUFDckYsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUSxrQkFBa0I7QUFBQSxJQUNsRSxDQUFDO0FBRUQsV0FBTyxHQUFHLE9BQU8sMkNBQTJDO0FBQzVELFdBQU8sR0FBRyxDQUFDLFNBQVMsYUFBYSxLQUFLLE9BQUssRUFBRSxPQUFPLHNCQUFzQixFQUFFLENBQUM7QUFBQSxFQUM5RSxDQUFDO0FBRUQsT0FBSywyRUFBMkUsTUFBTTtBQUtyRixVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxnQkFBZ0IsTUFBTSxrQkFBa0IsTUFBTSxDQUFDO0FBQ3JHLFdBQU8sR0FBRyxTQUFTLGFBQWEsS0FBSyxPQUFLLEVBQUUsT0FBTyxzQkFBc0IsRUFBRSxDQUFDO0FBQUEsRUFDN0UsQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFJOUUsVUFBTSxFQUFFLFNBQVMsSUFBSSx5QkFBeUIsYUFBYSxPQUFPLEVBQUUsZ0JBQWdCLE1BQU0sa0JBQWtCLE1BQU0sQ0FBQztBQUNuSCxXQUFPLEdBQUcsU0FBUyxhQUFhLEtBQUssT0FBSyxFQUFFLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUFBLEVBQzdFLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELFVBQU0saUJBQWlCLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFFBQVEsTUFBTSxrQkFBa0IsQ0FBQztBQUNqRyxVQUFNLFdBQVcsdUJBQXVCLGdCQUFnQixFQUFFLGNBQWMsc0JBQXNCLE9BQU8sQ0FBQyxDQUFDO0FBRXZHLFVBQU0sRUFBRSxVQUFVLGNBQWMsSUFBSSx5QkFBeUIsYUFBYSxLQUFLO0FBQy9FLFdBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxRQUFRLEdBQUcsdURBQXVEO0FBRzVHLGtCQUFjLHFCQUFxQiw2QkFBNkIsS0FBSztBQUNyRSxrQkFBYyxnQ0FBZ0MsS0FBSztBQUFBLE1BQ2xELFFBQVEsb0JBQW9CO0FBQUEsTUFDNUIsY0FBYyxvQkFBSSxJQUFJLENBQUMsMkJBQTJCLENBQUM7QUFBQSxNQUNuRCxRQUFRLEVBQUUsTUFBTSxDQUFDLDJCQUEyQixHQUFHLFdBQVcsQ0FBQyxFQUFFO0FBQUEsTUFDN0Qsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUTtBQUFBLElBQ2hELENBQUM7QUFFRCxXQUFPLFlBQVksU0FBUyxZQUFZLEVBQUUsUUFBUSxHQUFHLGtEQUFrRDtBQUd2RyxrQkFBYyxxQkFBcUIsNkJBQTZCLElBQUk7QUFDcEUsa0JBQWMsZ0NBQWdDLEtBQUs7QUFBQSxNQUNsRCxRQUFRLG9CQUFvQjtBQUFBLE1BQzVCLGNBQWMsb0JBQUksSUFBSSxDQUFDLDJCQUEyQixDQUFDO0FBQUEsTUFDbkQsUUFBUSxFQUFFLE1BQU0sQ0FBQywyQkFBMkIsR0FBRyxXQUFXLENBQUMsRUFBRTtBQUFBLE1BQzdELHNCQUFzQixDQUFDLFFBQWdCLFFBQVE7QUFBQSxJQUNoRCxDQUFDO0FBRUQsV0FBTyxZQUFZLFNBQVMsWUFBWSxFQUFFLFFBQVEsR0FBRyxtREFBbUQ7QUFBQSxFQUN6RyxDQUFDO0FBSUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxlQUFlLEtBQUssQ0FBQztBQUMzRSxVQUFNLFFBQVEsU0FBUyxnQkFBZ0IsSUFBSSxLQUFLLGVBQWUsQ0FBQztBQUNoRSxXQUFPLEdBQUcsTUFBTSxLQUFLLE9BQUssRUFBRSxPQUFPLHNCQUFzQixFQUFFLENBQUM7QUFBQSxFQUM3RCxDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUN0RixVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxlQUFlLE1BQU0sQ0FBQztBQUM1RSxVQUFNLFFBQVEsU0FBUyxnQkFBZ0IsSUFBSSxLQUFLLGVBQWUsQ0FBQztBQUNoRSxXQUFPLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBSyxFQUFFLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLHdGQUF3RixNQUFNO0FBQ2xHLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQzNFLFVBQU0sUUFBUSxTQUFTLGdCQUFnQixJQUFJLEtBQUssRUFBRSxRQUFRLDJCQUEyQixNQUFNLGNBQWMsQ0FBQyxDQUFDO0FBQzNHLFdBQU8sWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUNsQyxXQUFPLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBSyxFQUFFLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUFBLEVBQzlELENBQUM7QUFJRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxXQUFPLFlBQVksU0FBUyxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDM0YsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDM0YsVUFBTSxXQUFXLHVCQUF1QixXQUFXLEVBQUUsT0FBTyxZQUFZLENBQUMsQ0FBQztBQUMxRSxVQUFNLFdBQVcsdUJBQXVCLFdBQVcsRUFBRSxPQUFPLFlBQVksQ0FBQyxDQUFDO0FBRTFFLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBRXRDLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLGdGQUFnRixNQUFNO0FBQzFGLFVBQU0sYUFBYSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sY0FBYyxDQUFDO0FBQzdGLFVBQU0sZ0JBQWdCLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLE9BQU8sTUFBTSxpQkFBaUIsQ0FBQztBQUM5RixVQUFNLFdBQVcsdUJBQXVCLFVBQVUsQ0FBQztBQUNuRCxVQUFNLFdBQVcsdUJBQXVCLGVBQWUsRUFBRSxjQUFjLHNCQUFzQixNQUFNLENBQUMsQ0FBQztBQUVyRyxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLGlCQUFpQixJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixRQUFRLE1BQU0sa0JBQWtCLENBQUM7QUFDakcsVUFBTSxXQUFXLHVCQUF1QixnQkFBZ0IsRUFBRSxjQUFjLHNCQUFzQixPQUFPLENBQUMsQ0FBQztBQUV2RyxVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxlQUFlLEtBQUssQ0FBQztBQUMzRSxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBRXRDLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0saUJBQWlCLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFFBQVEsTUFBTSxrQkFBa0IsQ0FBQztBQUNqRyxVQUFNLFdBQVcsdUJBQXVCLGdCQUFnQixFQUFFLGNBQWMsc0JBQXNCLE9BQU8sQ0FBQyxDQUFDO0FBRXZHLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGVBQWUsTUFBTSxDQUFDO0FBQzVFLFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdEMsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELGFBQVMsWUFBWTtBQUVyQixVQUFNLFVBQWlDLENBQUM7QUFDeEMsZ0JBQVksSUFBSSxTQUFTLG9CQUFvQixPQUFLLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUVsRSxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGVBQWUsQ0FBQztBQUM1RixVQUFNLFdBQVcsdUJBQXVCLFVBQVUsRUFBRSxPQUFPLGNBQWMsQ0FBQyxDQUFDO0FBRTNFLFdBQU8sR0FBRyxRQUFRLFNBQVMsQ0FBQztBQUM1QixXQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFBQSxFQUM5QyxDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUN0RixVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLG9CQUFvQixDQUFDO0FBQ2pHLFVBQU0sV0FBVyx1QkFBdUIsVUFBVSxFQUFFLE9BQU8sb0JBQW9CLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFOUYsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELGFBQVMsWUFBWTtBQUVyQixVQUFNLFVBQWlDLENBQUM7QUFDeEMsZ0JBQVksSUFBSSxTQUFTLG9CQUFvQixPQUFLLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUVsRSxVQUFNLHNCQUFzQjtBQUU1QixXQUFPLGdCQUFnQixTQUFTLENBQUMsQ0FBQztBQUFBLEVBQ25DLENBQUM7QUFFRCxPQUFLLCtFQUErRSxNQUFNO0FBQ3pGLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sb0JBQW9CLENBQUM7QUFDakcsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsT0FBTyxvQkFBb0IsV0FBVyxFQUFFLENBQUMsQ0FBQztBQUU5RixVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsYUFBUyxZQUFZO0FBRXJCLFVBQU0sVUFBaUMsQ0FBQztBQUN4QyxnQkFBWSxJQUFJLFNBQVMsb0JBQW9CLE9BQUssUUFBUSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRWxFLFVBQU0sZUFBZSx1QkFBdUIsVUFBVSxFQUFFLE9BQU8sbUJBQW1CLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFakcsV0FBTyxnQkFBZ0IsUUFBUSxJQUFJLFFBQU07QUFBQSxNQUN4QyxPQUFPLEVBQUUsTUFBTTtBQUFBLE1BQ2YsU0FBUyxFQUFFLFFBQVE7QUFBQSxNQUNuQixTQUFTLEVBQUUsUUFBUSxJQUFJLGFBQVcsUUFBUSxNQUFNLElBQUksQ0FBQztBQUFBLElBQ3RELEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDTCxPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsTUFDVCxTQUFTLENBQUMsaUJBQWlCO0FBQUEsSUFDNUIsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSywrRUFBMEUsTUFBTTtBQUNwRixVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGdCQUFnQixDQUFDO0FBRTdGLFVBQU0sV0FBVyx1QkFBdUIsVUFBVSxFQUFFLE9BQU8sZ0JBQWdCLFdBQVcsR0FBRyxRQUFRLGtCQUFrQixZQUFZLE1BQU0sS0FBSyxDQUFDLENBQUM7QUFFNUksVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELGFBQVMsWUFBWTtBQUdyQixVQUFNLGVBQWUsdUJBQXVCLFVBQVUsRUFBRSxPQUFPLGdCQUFnQixXQUFXLEdBQUcsUUFBUSxrQkFBa0IsV0FBVyxNQUFNLE1BQU0sV0FBVyxNQUFNLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO0FBRS9MLFdBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsT0FBTyxJQUFJLEdBQUcsS0FBSztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0saUJBQWlCLENBQUM7QUFDOUYsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsT0FBTyxXQUFXLFdBQVcsR0FBRyxRQUFRLGtCQUFrQixZQUFZLE1BQU0sS0FBSyxDQUFDLENBQUM7QUFFdkksVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELGFBQVMsWUFBWTtBQUdyQixVQUFNLGVBQWUsdUJBQXVCLFVBQVUsRUFBRSxPQUFPLHFCQUFxQixXQUFXLEdBQUcsUUFBUSxrQkFBa0IsWUFBWSxNQUFNLEtBQUssQ0FBQyxDQUFDO0FBRXJKLFdBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsT0FBTyxJQUFJLEdBQUcsSUFBSTtBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFVBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sZ0JBQWdCLENBQUM7QUFDakcsVUFBTSxnQkFBZ0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGlCQUFpQixDQUFDO0FBRW5HLFVBQU0sV0FBVyx1QkFBdUIsY0FBYyxFQUFFLE9BQU8sUUFBUSxXQUFXLEdBQUcsTUFBTSxNQUFNLFdBQVcsTUFBTSxNQUFNLHNCQUFzQixFQUFFLENBQUMsQ0FBQztBQUNsSixVQUFNLFdBQVcsdUJBQXVCLGVBQWU7QUFBQSxNQUN0RCxPQUFPO0FBQUEsTUFBUyxXQUFXO0FBQUEsTUFBRyxNQUFNO0FBQUEsTUFDcEMsVUFBVSxFQUFFLGdCQUFnQixjQUFjLGlCQUFpQixlQUFlO0FBQUEsTUFDMUUsV0FBVyxNQUFNLE1BQU0sc0JBQXNCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBRUYsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELFVBQU0sVUFBVSxTQUFTLFlBQVksRUFBRSxDQUFDO0FBQ3hDLFVBQU0sYUFBYSxRQUFRLE9BQU8sSUFBSTtBQUV0QyxVQUFNLFNBQVMsb0JBQW9CLFFBQVEsV0FBVyxJQUFJO0FBRTFELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLFdBQVcsU0FBUyxZQUFZLEVBQUUsQ0FBQyxFQUFFLE9BQU8sSUFBSTtBQUFBLElBQ2pELEdBQUc7QUFBQSxNQUNGLFlBQVk7QUFBQSxNQUNaLFdBQVc7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGLENBQUM7QUFRRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sY0FBK0UsRUFBRSxjQUFjLE9BQVU7QUFDL0csVUFBTSxXQUFXLGVBQWUsYUFBYSxPQUFPLEVBQUUsaUJBQWlCLE1BQU0sWUFBWSxhQUFhLENBQUM7QUFDdkcsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsMkJBQTJCLE1BQU0sb0JBQW9CLENBQUM7QUFDM0YsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLFdBQVcsd0JBQXdCLEVBQUU7QUFDL0UsVUFBTSxnQkFBZ0IsU0FBUyxrQkFBa0IsUUFBUSxXQUFXLHFCQUFxQjtBQUV6RixnQkFBWSxlQUFlLENBQUM7QUFBQSxNQUMzQixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixPQUFPLENBQUMsRUFBRSxJQUFJLHlCQUF5QixNQUFNLHdCQUF3QixDQUFDO0FBQUEsSUFDdkUsQ0FBQztBQUNELFVBQU0sZUFBZSxTQUFTLGtCQUFrQixRQUFRLFdBQVcscUJBQXFCO0FBRXhGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsZUFBZSxFQUFFLFFBQVEsY0FBYyxPQUFPLElBQUksQ0FBQUEsV0FBU0EsT0FBTSxVQUFVLEdBQUcsd0JBQXdCLGNBQWMsd0JBQXdCLGFBQWEsY0FBYyxZQUFZO0FBQUEsTUFDbkwsY0FBYyxFQUFFLFFBQVEsYUFBYSxPQUFPLElBQUksQ0FBQUEsV0FBU0EsT0FBTSxVQUFVLEdBQUcsd0JBQXdCLGFBQWEsd0JBQXdCLGFBQWEsYUFBYSxZQUFZO0FBQUEsSUFDaEwsR0FBRztBQUFBLE1BQ0YsZUFBZSxFQUFFLFFBQVEsQ0FBQyxHQUFHLHdCQUF3QixFQUFFLE1BQU0sV0FBVyxZQUFZLHNCQUFzQixHQUFHLGFBQWEsc0JBQXNCLE1BQU07QUFBQSxNQUN0SixjQUFjLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixHQUFHLHdCQUF3QixFQUFFLE1BQU0sZUFBZSxZQUFZLHNCQUFzQixHQUFHLGFBQWEsc0JBQXNCLE1BQU07QUFBQSxJQUNqTCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrRUFBK0UsTUFBTTtBQUN6RixVQUFNLFNBQVMsb0JBQUksSUFBd0M7QUFDM0QsVUFBTSxXQUFXLGVBQWUsYUFBYSxPQUFPO0FBQUEsTUFDbkQsdUJBQXVCO0FBQUEsUUFDdEIscUJBQXFCLE1BQU0sQ0FBQyxHQUFHLE9BQU8sS0FBSyxDQUFDO0FBQUEsUUFDNUMscUJBQXFCLGdCQUFjLE9BQU8sSUFBSSxVQUFVO0FBQUEsUUFDeEQsbUJBQW1CLE1BQU07QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sVUFBVSxTQUFTLGlCQUFpQixJQUFJLEtBQUssZUFBZSxHQUFHLHNCQUFzQixFQUFFO0FBQzdGLFVBQU0sUUFBUSxTQUFTLGtCQUFrQixRQUFRLFdBQVcsb0JBQW9CO0FBRWhGLFdBQU8sSUFBSSxpQkFBaUI7QUFBQSxNQUMzQixXQUFXLElBQUksb0JBQW9CLGdCQUFnQjtBQUFBLE1BQ25ELElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLHNCQUFzQixDQUFDO0FBQUEsTUFDdkIsdUJBQXVCLHNCQUFzQjtBQUFBLElBQzlDLENBQUM7QUFDRCxVQUFNLE9BQU8sU0FBUyxrQkFBa0IsUUFBUSxXQUFXLG9CQUFvQjtBQUUvRSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sRUFBRSxZQUFZLE1BQU0sd0JBQXdCLGFBQWEsTUFBTSxZQUFZO0FBQUEsTUFDbEYsTUFBTSxFQUFFLFlBQVksS0FBSyx3QkFBd0IsYUFBYSxLQUFLLFlBQVk7QUFBQSxJQUNoRixHQUFHO0FBQUEsTUFDRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sV0FBVyxZQUFZLHFCQUFxQixHQUFHLGFBQWEsc0JBQXNCLEdBQUc7QUFBQSxNQUNsSCxNQUFNLEVBQUUsWUFBWSxFQUFFLE1BQU0sZUFBZSxZQUFZLHFCQUFxQixHQUFHLGFBQWEsc0JBQXNCLEdBQUc7QUFBQSxJQUN0SCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0RUFBNEUsWUFBWTtBQUM1RixVQUFNLFdBQVcsMkJBQTJCLGFBQWEsT0FBTyxhQUFhLEVBQUUsTUFBTSxRQUFpQixNQUFNLENBQUMsRUFBMEIsRUFBRTtBQUN6SSxVQUFNLFVBQVUsU0FBUyxpQkFBaUIsSUFBSSxLQUFLLGVBQWUsR0FBRyxzQkFBc0IsRUFBRTtBQUM3RixVQUFNLGtCQUFrQixTQUFTLFdBQVcsUUFBUSxTQUFTO0FBQzdELG9CQUFnQixpQkFBaUIsV0FBVztBQUU1QyxXQUFPLFlBQVksZ0JBQWdCLGNBQWMsSUFBSSxHQUFHLFdBQVc7QUFDbkUsV0FBTyxnQkFBZ0IsZ0JBQWdCLDBCQUEwQixHQUFHLEVBQUUsV0FBVyxTQUFTLENBQUM7QUFDM0Ysb0JBQWdCLFFBQVE7QUFBQSxFQUN6QixDQUFDO0FBRUQsT0FBSyxvRUFBb0UsWUFBWTtBQUNwRixVQUFNLFdBQVcsMkJBQTJCLGFBQWEsT0FBTyxhQUFhLEVBQUUsTUFBTSxRQUFpQixNQUFNLENBQUMsRUFBMEIsRUFBRTtBQUN6SSxVQUFNLFVBQVUsU0FBUyxpQkFBaUIsSUFBSSxLQUFLLGVBQWUsR0FBRyxzQkFBc0IsRUFBRTtBQUM3RixVQUFNLGtCQUFrQixTQUFTLFdBQVcsUUFBUSxTQUFTO0FBQzdELG9CQUFnQixpQkFBaUIsVUFBVTtBQUMzQyxvQkFBZ0IsVUFBVSxNQUFNO0FBRWhDLFdBQU8sZ0JBQWdCLGdCQUFnQiwwQkFBMEIsR0FBRyxFQUFFLFdBQVcsWUFBWSxRQUFRLE9BQU8sQ0FBQztBQUM3RyxvQkFBZ0IsUUFBUTtBQUFBLEVBQ3pCLENBQUM7QUFFRCxPQUFLLGdHQUFnRyxZQUFZO0FBQ2hILFVBQU0sZ0JBQWdCLElBQUkseUJBQXlCO0FBQ25ELGtCQUFjLHFCQUFxQixvQkFBb0IsY0FBYztBQUNyRSxVQUFNLFdBQVcsMkJBQTJCLGFBQWEsT0FBTyxhQUFhLEVBQUUsTUFBTSxRQUFpQixNQUFNLENBQUMsRUFBMEIsSUFBSSxFQUFFLHNCQUFzQixjQUFjLENBQUM7QUFDbEwsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLElBQUksS0FBSyxlQUFlLEdBQUcsc0JBQXNCLEVBQUU7QUFDN0YsVUFBTSxrQkFBa0IsU0FBUyxXQUFXLFFBQVEsU0FBUztBQUM3RCxvQkFBZ0IsaUJBQWlCLFVBQVU7QUFDM0Msb0JBQWdCLFVBQVUsTUFBTTtBQUVoQyxXQUFPLGdCQUFnQixnQkFBZ0IsMEJBQTBCLEdBQUcsRUFBRSxXQUFXLFlBQVksUUFBUSxRQUFRLHNCQUFzQixlQUFlLENBQUM7QUFDbkosb0JBQWdCLFFBQVE7QUFBQSxFQUN6QixDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxVQUFNLGdCQUFnQixJQUFJLHlCQUF5QjtBQUNuRCxrQkFBYyxxQkFBcUIsNEJBQTRCLENBQUMsMEJBQTBCLG9CQUFvQixDQUFDO0FBQy9HLFVBQU0sV0FBVywyQkFBMkIsYUFBYSxPQUFPLGFBQWEsRUFBRSxNQUFNLFFBQWlCLE1BQU0sQ0FBQyxFQUEwQixJQUFJLEVBQUUsc0JBQXNCLGNBQWMsQ0FBQztBQUNsTCxVQUFNLFVBQVUsU0FBUyxpQkFBaUIsSUFBSSxLQUFLLGVBQWUsR0FBRyxzQkFBc0IsRUFBRTtBQUM3RixVQUFNLGtCQUFrQixTQUFTLFdBQVcsUUFBUSxTQUFTO0FBQzdELG9CQUFnQixpQkFBaUIsVUFBVTtBQUMzQyxvQkFBZ0IsVUFBVSxNQUFNO0FBRWhDLFdBQU8sZ0JBQWdCLGdCQUFnQiwwQkFBMEIsR0FBRztBQUFBLE1BQ25FLFdBQVc7QUFBQSxNQUNYLFFBQVE7QUFBQSxNQUNSLHNCQUFzQixDQUFDLDBCQUEwQixvQkFBb0I7QUFBQSxJQUN0RSxDQUFDO0FBQ0Qsb0JBQWdCLFFBQVE7QUFBQSxFQUN6QixDQUFDO0FBSUQsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUMxRixVQUFNLGVBQWUsdUJBQXVCLFFBQVE7QUFDcEQsVUFBTSxXQUFXLFlBQVk7QUFFN0IsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELGFBQVMsWUFBWTtBQUVyQixVQUFNLFVBQVUsU0FBUyxZQUFZLEVBQUUsQ0FBQztBQUN4QyxhQUFTLGVBQWUsUUFBUSxTQUFTO0FBRXpDLFdBQU8sWUFBWSxhQUFhLFdBQVcsR0FBRyxJQUFJO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssMENBQTBDLE1BQU07QUFDcEQsVUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDMUYsVUFBTSxlQUFlLHVCQUF1QixVQUFVLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFDeEUsVUFBTSxXQUFXLFlBQVk7QUFFN0IsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELGFBQVMsWUFBWTtBQUVyQixVQUFNLFVBQVUsU0FBUyxZQUFZLEVBQUUsQ0FBQztBQUN4QyxhQUFTLGlCQUFpQixRQUFRLFNBQVM7QUFFM0MsV0FBTyxZQUFZLGFBQWEsV0FBVyxHQUFHLEtBQUs7QUFBQSxFQUNwRCxDQUFDO0FBSUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUMxRixVQUFNLFdBQVcsdUJBQXVCLFFBQVEsQ0FBQztBQUVqRCxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLGFBQWEsSUFBSSxFQUFFLHVCQUF1QixJQUFJO0FBQUEsRUFDOUUsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLE9BQU8sTUFBTSxhQUFhLENBQUM7QUFDckYsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsY0FBYyxzQkFBc0IsTUFBTSxDQUFDLENBQUM7QUFFaEcsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxhQUFhLElBQUksRUFBRSx1QkFBdUIsS0FBSztBQUFBLEVBQy9FLENBQUM7QUFFRCxPQUFLLGtHQUFrRyxNQUFNO0FBQzVHLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixPQUFPLE1BQU0sYUFBYSxDQUFDO0FBQ3JGLFVBQU0sZ0JBQWdCLElBQUksa0JBQWtCLENBQUM7QUFDN0MsVUFBTSxZQUFZLElBQUkseUJBQXlCO0FBQy9DLFVBQU0sUUFBUSxJQUFJLE1BQU0sdUNBQXVDO0FBQy9ELFVBQU0sYUFBYSx1QkFBdUIsdUJBQXVCLE1BQU07QUFDdkUsY0FBVSxJQUFJLE1BQU0sU0FBUyxHQUFHLFVBQVU7QUFDMUMsVUFBTSxXQUFXLHVCQUF1QixVQUFVO0FBQUEsTUFDakQsY0FBYyxzQkFBc0I7QUFBQSxNQUNwQyxVQUFVO0FBQUEsUUFDVCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUixtQkFBbUI7QUFBQSxRQUNuQixnQkFBZ0IsTUFBTSxTQUFTO0FBQUEsUUFDL0Isa0JBQWtCLHVCQUF1QjtBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxlQUFlLHNCQUFzQixVQUFVLENBQUM7QUFDdEcsVUFBTSxhQUFhLFNBQVMsWUFBWSxFQUFFLENBQUMsRUFBRSxVQUFVLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxlQUFlLFdBQVcsSUFBSTtBQUV4RyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sWUFBWTtBQUFBLE1BQ25CLE1BQU0sWUFBWTtBQUFBLE1BQ2xCLGFBQWEsWUFBWSxlQUFlO0FBQUEsUUFDdkMsUUFBUSxXQUFXLFlBQVk7QUFBQSxRQUMvQixLQUFLLFdBQVcsWUFBWSxJQUFJLFNBQVM7QUFBQSxRQUN6QyxNQUFNLFdBQVcsWUFBWTtBQUFBLE1BQzlCO0FBQUEsTUFDQSxhQUFhLGNBQWM7QUFBQSxNQUMzQixnQ0FBZ0MsY0FBYztBQUFBLElBQy9DLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxRQUNaLFFBQVE7QUFBQSxRQUNSLEtBQUssTUFBTSxTQUFTO0FBQUEsUUFDcEIsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLGFBQWE7QUFBQSxNQUNiLGdDQUFnQztBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtHQUFrRyxNQUFNO0FBQzVHLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixPQUFPLE1BQU0sYUFBYSxDQUFDO0FBQ3JGLFVBQU0sZ0JBQWdCLElBQUksa0JBQWtCO0FBQzVDLFVBQU0sV0FBVyx1QkFBdUIsVUFBVTtBQUFBLE1BQ2pELGNBQWMsc0JBQXNCO0FBQUEsTUFDcEMsVUFBVTtBQUFBLFFBQ1QsZ0JBQWdCO0FBQUEsUUFDaEIsa0JBQWtCLHVCQUF1QjtBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxjQUFjLENBQUM7QUFDckUsVUFBTSxZQUFZLFNBQVMsWUFBWSxFQUFFLENBQUMsRUFBRSxVQUFVLElBQUk7QUFDMUQsVUFBTSxhQUFhLFdBQVcsUUFBUSxDQUFDLEdBQUcsZUFBZSxXQUFXLElBQUk7QUFFeEUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixlQUFlLFdBQVcsUUFBUSxDQUFDLEdBQUcsS0FBSyxTQUFTO0FBQUEsTUFDcEQsT0FBTyxZQUFZO0FBQUEsTUFDbkIsTUFBTSxZQUFZO0FBQUEsTUFDbEIsYUFBYSxZQUFZLGVBQWU7QUFBQSxRQUN2QyxRQUFRLFdBQVcsWUFBWTtBQUFBLFFBQy9CLEtBQUssV0FBVyxZQUFZLElBQUksU0FBUztBQUFBLE1BQzFDO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixlQUFlLElBQUksTUFBTSxhQUFhLEVBQUUsU0FBUztBQUFBLE1BQ2pELE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxRQUNaLFFBQVE7QUFBQSxRQUNSLEtBQUs7QUFBQSxNQUNOO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4RkFBOEYsTUFBTTtBQUN4RyxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsT0FBTyxNQUFNLGFBQWEsQ0FBQztBQUNyRixVQUFNLGdCQUFnQixJQUFJLGtCQUFrQixDQUFDO0FBQzdDLFVBQU0sV0FBVyx1QkFBdUIsVUFBVTtBQUFBLE1BQ2pELGNBQWMsc0JBQXNCO0FBQUEsTUFDcEMsVUFBVTtBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsbUJBQW1CO0FBQUEsUUFDbkIsZ0JBQWdCO0FBQUEsUUFDaEIsa0JBQWtCLHVCQUF1QjtBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxjQUFjLENBQUM7QUFDckUsVUFBTSxhQUFhLFNBQVMsWUFBWSxFQUFFLENBQUMsRUFBRSxVQUFVLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxlQUFlLFdBQVcsSUFBSTtBQUV4RyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sWUFBWTtBQUFBLE1BQ25CLE1BQU0sWUFBWTtBQUFBLE1BQ2xCLGFBQWEsWUFBWSxlQUFlO0FBQUEsUUFDdkMsUUFBUSxXQUFXLFlBQVk7QUFBQSxRQUMvQixLQUFLLFdBQVcsWUFBWSxJQUFJLFNBQVM7QUFBQSxRQUN6QyxNQUFNLFdBQVcsWUFBWTtBQUFBLE1BQzlCO0FBQUEsTUFDQSxhQUFhLGNBQWM7QUFBQSxNQUMzQixnQ0FBZ0MsY0FBYztBQUFBLElBQy9DLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxRQUNaLFFBQVE7QUFBQSxRQUNSLEtBQUs7QUFBQSxRQUNMLE1BQU0sdUJBQXVCLHVCQUF1QixJQUFJO0FBQUEsTUFDekQ7QUFBQSxNQUNBLGFBQWE7QUFBQSxNQUNiLGdDQUFnQztBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtHQUFrRyxZQUFZO0FBQ2xILFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixPQUFPLE1BQU0sYUFBYSxDQUFDO0FBQ3JGLFVBQU0sZ0JBQWdCLElBQUksa0JBQWtCLEVBQUU7QUFDOUMsVUFBTSxZQUFZLElBQUkseUJBQXlCO0FBQy9DLFVBQU0sV0FBVyx1QkFBdUIsVUFBVTtBQUFBLE1BQ2pELGNBQWMsc0JBQXNCO0FBQUEsTUFDcEMsVUFBVTtBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGVBQWUsc0JBQXNCLFVBQVUsQ0FBQztBQUN0RyxVQUFNLGdCQUFnQixTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsVUFBVSxJQUFJLEVBQUcsUUFBUSxDQUFDLEVBQUUsY0FBZTtBQUMzRixVQUFNLG1CQUFtQixZQUFZLElBQUksUUFBUSxZQUFVLGNBQWMsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUN0RixVQUFNLFFBQVEsQ0FBQztBQUNmLFVBQU0sbUJBQW1CLGNBQWMsSUFBSSxHQUFHO0FBRTlDLGtCQUFjLGVBQWUsa0JBQWtCLHVCQUF1QixNQUFNLENBQUM7QUFDN0UsVUFBTSxrQkFBa0IsY0FBYyxJQUFJLEdBQUc7QUFDN0MscUJBQWlCLFFBQVE7QUFFekIsUUFBSTtBQUNKLFFBQUksV0FBVztBQUNmLFVBQU0sb0JBQW9CLFFBQVEsWUFBVTtBQUMzQyxZQUFNLG9CQUFvQixjQUFjLEtBQUssTUFBTSxHQUFHLGFBQWE7QUFDbkUsVUFBSSxDQUFDLFVBQVU7QUFDZCxnQ0FBd0I7QUFDeEIsbUJBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBQ0QsZ0JBQVksSUFBSSxpQkFBaUI7QUFDakMsVUFBTSxlQUFlLHVCQUF1QixVQUFVO0FBQUEsTUFDckQsY0FBYyxzQkFBc0I7QUFBQSxNQUNwQyxPQUFPO0FBQUEsTUFDUCxVQUFVO0FBQUEsUUFDVCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixrQkFBa0Isb0JBQW9CO0FBQUEsUUFDckMsUUFBUSxpQkFBaUI7QUFBQSxRQUN6QixLQUFLLGlCQUFpQixJQUFJLFNBQVM7QUFBQSxRQUNuQyxNQUFNLGlCQUFpQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQSxpQkFBaUIsbUJBQW1CO0FBQUEsUUFDbkMsUUFBUSxnQkFBZ0I7QUFBQSxRQUN4QixLQUFLLGdCQUFnQixJQUFJLFNBQVM7QUFBQSxRQUNsQyxNQUFNLGdCQUFnQjtBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxhQUFhLGNBQWM7QUFBQSxNQUMzQixZQUFZLFVBQVUsSUFBSSx1Q0FBdUM7QUFBQSxNQUNqRTtBQUFBLE1BQ0EsbUJBQW1CLGNBQWMsSUFBSSxHQUFHLGFBQWE7QUFBQSxJQUN0RCxHQUFHO0FBQUEsTUFDRixrQkFBa0I7QUFBQSxRQUNqQixRQUFRO0FBQUEsUUFDUixLQUFLO0FBQUEsUUFDTCxNQUFNLHVCQUF1Qix1QkFBdUIsSUFBSTtBQUFBLE1BQ3pEO0FBQUEsTUFDQSxpQkFBaUI7QUFBQSxRQUNoQixRQUFRO0FBQUEsUUFDUixLQUFLO0FBQUEsUUFDTCxNQUFNLHVCQUF1Qix1QkFBdUIsTUFBTTtBQUFBLE1BQzNEO0FBQUEsTUFDQSxhQUFhO0FBQUEsTUFDYixZQUFZLHVCQUF1Qix1QkFBdUIsTUFBTTtBQUFBLE1BQ2hFLHVCQUF1QjtBQUFBLE1BQ3ZCLG1CQUFtQjtBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlIQUF5SCxZQUFZO0FBQ3pJLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixPQUFPLE1BQU0sYUFBYSxDQUFDO0FBQ3JGLFVBQU0sZ0JBQWdCLElBQUksa0JBQWtCO0FBQzVDLFVBQU0sV0FBVztBQUFBLE1BQ2hCLE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxJQUNUO0FBQ0EsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsY0FBYyxzQkFBc0IsT0FBTyxTQUFTLENBQUMsQ0FBQztBQUUxRyxVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxjQUFjLENBQUM7QUFDckUsVUFBTSxnQkFBZ0IsU0FBUyxZQUFZLEVBQUUsQ0FBQyxFQUFFLFVBQVUsSUFBSSxFQUFHLFFBQVEsQ0FBQyxFQUFFLGNBQWU7QUFDM0YsZ0JBQVksSUFBSSxRQUFRLFlBQVUsY0FBYyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQzdELFVBQU0sUUFBUSxDQUFDO0FBQ2YsVUFBTSxlQUFlLHVCQUF1QixVQUFVO0FBQUEsTUFDckQsY0FBYyxzQkFBc0I7QUFBQSxNQUNwQyxPQUFPO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxRQUFRLENBQUM7QUFFZixVQUFNLGVBQWUsdUJBQXVCLFVBQVU7QUFBQSxNQUNyRCxjQUFjLHNCQUFzQjtBQUFBLE1BQ3BDLFVBQVU7QUFBQSxRQUNULEdBQUc7QUFBQSxRQUNILGdCQUFnQjtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGFBQWEsY0FBYztBQUFBLE1BQzNCLGFBQWEsY0FBYyxJQUFJLEdBQUcsZUFBZTtBQUFBLFFBQ2hELFFBQVEsY0FBYyxJQUFJLEVBQUcsWUFBYTtBQUFBLFFBQzFDLEtBQUssY0FBYyxJQUFJLEVBQUcsWUFBYSxJQUFJLFNBQVM7QUFBQSxNQUNyRDtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsS0FBSztBQUFBLE1BQ047QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sZ0JBQWdCLElBQUksa0JBQWtCLEVBQUU7QUFDOUMsVUFBTSxXQUFXLHVCQUF1QixVQUFVO0FBQUEsTUFDakQsVUFBVTtBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGNBQWMsQ0FBQztBQUNyRSxVQUFNLGdCQUFnQixTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsVUFBVSxJQUFJLEVBQUcsUUFBUSxDQUFDLEVBQUUsY0FBZTtBQUMzRixnQkFBWSxJQUFJLFFBQVEsWUFBVSxjQUFjLEtBQUssTUFBTSxDQUFDLENBQUM7QUFDN0QsVUFBTSxRQUFRLENBQUM7QUFFZixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGFBQWEsY0FBYztBQUFBLE1BQzNCLGFBQWEsY0FBYyxJQUFJLEdBQUc7QUFBQSxJQUNuQyxHQUFHO0FBQUEsTUFDRixhQUFhO0FBQUEsTUFDYixhQUFhO0FBQUEsSUFDZCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtRkFBbUYsTUFBTTtBQUM3RixVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUMxRixVQUFNLFdBQVcsdUJBQXVCLFFBQVEsQ0FBQztBQUVqRCxVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxrQkFBa0IsTUFBTSxDQUFDO0FBQy9FLFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxhQUFhLElBQUksRUFBRSx1QkFBdUIsS0FBSztBQUFBLEVBQy9FLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixRQUFRLE1BQU0sYUFBYSxDQUFDO0FBQ3RGLFVBQU0sV0FBVyx1QkFBdUIsVUFBVSxFQUFFLGNBQWMsc0JBQXNCLE9BQU8sQ0FBQyxDQUFDO0FBRWpHLFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQzNFLFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxhQUFhLElBQUksRUFBRSx1QkFBdUIsS0FBSztBQUFBLEVBQy9FLENBQUM7QUFJRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsUUFBUSxDQUFDO0FBRWpELFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBRXRDLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUNyQyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBQ3BELFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxTQUFTLElBQUksRUFBRSxTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVMsQ0FBQztBQUFBLEVBQ3ZGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxZQUFZO0FBQzdFLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsUUFBUSxDQUFDO0FBRWpELFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFVBQVUsU0FBUyxZQUFZLEVBQUUsQ0FBQztBQUN4QyxhQUFTLFNBQVMsUUFBUSxXQUFXLGdCQUFnQjtBQUVyRCxXQUFPLFlBQVksUUFBUSxRQUFRLElBQUksR0FBRyxnQkFBZ0I7QUFFMUQsVUFBTSxPQUFPLE1BQU0sU0FBUyxjQUFjLFFBQVEsU0FBUztBQUMzRCxRQUFJO0FBQ0gsYUFBTyxZQUFZLEtBQUssUUFBUSxJQUFJLEdBQUcsZ0JBQWdCO0FBQUEsSUFDeEQsVUFBRTtBQUNELFlBQU0sU0FBUyxXQUFXLFFBQVEsV0FBVyxLQUFLLFFBQVE7QUFBQSxJQUMzRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMENBQTBDLFlBQVk7QUFDMUQsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELFVBQU0sT0FBTztBQUFBLE1BQ1osTUFBTSxTQUFTLFlBQVksZUFBZSxJQUFJLE1BQU0sZUFBZSxHQUFHLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFBQSxNQUN2RjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzNGLFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzNGLFVBQU0sV0FBVyx1QkFBdUIsV0FBVyxFQUFFLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFDdkUsVUFBTSxXQUFXLHVCQUF1QixXQUFXLEVBQUUsT0FBTyxTQUFTLENBQUMsQ0FBQztBQUV2RSxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUd0QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLGVBQWUsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGdCQUFnQixDQUFDO0FBQ2pHLFVBQU0saUJBQWlCLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxtQkFBbUIsQ0FBQztBQUN0RyxVQUFNLGlCQUFpQixJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFFdEcsVUFBTSxXQUFXLHVCQUF1QixjQUFjLEVBQUUsT0FBTyxRQUFRLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFDdEYsVUFBTSxXQUFXLHVCQUF1QixnQkFBZ0I7QUFBQSxNQUN2RCxPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUEsTUFDWCxVQUFVLEVBQUUsZ0JBQWdCLGNBQWMsaUJBQWlCLGVBQWU7QUFBQSxJQUMzRSxDQUFDLENBQUM7QUFDRixVQUFNLFdBQVcsdUJBQXVCLGdCQUFnQjtBQUFBLE1BQ3ZELE9BQU87QUFBQSxNQUNQLFdBQVc7QUFBQSxNQUNYLFVBQVUsRUFBRSxnQkFBZ0IsY0FBYyxpQkFBaUIsZUFBZTtBQUFBLElBQzNFLENBQUMsQ0FBQztBQUVGLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBRXRDLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUNyQyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBQ3BELFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxTQUFTLElBQUksRUFBRSxTQUFTLFNBQVMsR0FBRyxhQUFhLFNBQVMsQ0FBQztBQUFBLEVBQzNGLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFVBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sZ0JBQWdCLENBQUM7QUFDakcsVUFBTSxxQkFBcUIsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGVBQWUsQ0FBQztBQUN0RyxVQUFNLHFCQUFxQixJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sZUFBZSxDQUFDO0FBR3RHLFVBQU0sV0FBVyx1QkFBdUIsb0JBQW9CO0FBQUEsTUFDM0QsT0FBTztBQUFBLE1BQ1AsV0FBVztBQUFBLE1BQ1gsVUFBVSxFQUFFLGdCQUFnQixjQUFjLGlCQUFpQixlQUFlO0FBQUEsSUFDM0UsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxXQUFXLHVCQUF1QixjQUFjLEVBQUUsT0FBTyxRQUFRLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFDdkYsVUFBTSxXQUFXLHVCQUF1QixvQkFBb0I7QUFBQSxNQUMzRCxPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUEsTUFDWCxVQUFVLEVBQUUsZ0JBQWdCLGNBQWMsaUJBQWlCLGVBQWU7QUFBQSxJQUMzRSxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsV0FBTztBQUFBLE1BQ04sU0FBUyxDQUFDLEVBQUUsTUFBTSxJQUFJLEVBQUUsSUFBSSxVQUFRLEtBQUssU0FBUyxTQUFTLENBQUM7QUFBQSxNQUM1RCxDQUFDLGFBQWEsU0FBUyxHQUFHLG1CQUFtQixTQUFTLEdBQUcsbUJBQW1CLFNBQVMsQ0FBQztBQUFBLElBQ3ZGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLGtCQUFrQixJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sa0JBQWtCLENBQUM7QUFDdEcsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGtCQUFrQixDQUFDO0FBQ3RHLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUVsRCxhQUFTLFlBQVk7QUFFckIsVUFBTSxVQUFpQyxDQUFDO0FBQ3hDLGdCQUFZLElBQUksU0FBUyxvQkFBb0IsT0FBSyxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFFbEUsVUFBTSxXQUFXLHVCQUF1QixpQkFBaUI7QUFBQSxNQUN4RCxPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUEsTUFDWCxVQUFVLEVBQUUsZ0JBQWdCLGNBQWMsaUJBQWlCLGVBQWU7QUFBQSxJQUMzRSxDQUFDLENBQUM7QUFDRixVQUFNLFdBQVcsdUJBQXVCLGlCQUFpQjtBQUFBLE1BQ3hELE9BQU87QUFBQSxNQUNQLFdBQVc7QUFBQSxNQUNYLFVBQVUsRUFBRSxnQkFBZ0IsY0FBYyxpQkFBaUIsZUFBZTtBQUFBLElBQzNFLENBQUMsQ0FBQztBQUVGLFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU87QUFBQSxNQUNOLFNBQVMsQ0FBQyxFQUFFLE1BQU0sSUFBSSxFQUFFLElBQUksVUFBUSxLQUFLLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDNUQsQ0FBQyxnQkFBZ0IsU0FBUyxHQUFHLGdCQUFnQixTQUFTLENBQUM7QUFBQSxJQUN4RDtBQUNBLFdBQU8sZ0JBQWdCLFFBQVEsSUFBSSxRQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sUUFBUSxTQUFTLEVBQUUsUUFBUSxPQUFPLEVBQUUsR0FBRztBQUFBLE1BQ2hHLEVBQUUsT0FBTyxHQUFHLFNBQVMsRUFBRTtBQUFBLE1BQ3ZCLEVBQUUsT0FBTyxHQUFHLFNBQVMsRUFBRTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0saUJBQWlCLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxrQkFBa0IsQ0FBQztBQUNyRyxVQUFNLGVBQWUsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGdCQUFnQixDQUFDO0FBRWpHLFVBQU0sV0FBVyx1QkFBdUIsZ0JBQWdCO0FBQUEsTUFDdkQsT0FBTztBQUFBLE1BQ1AsV0FBVztBQUFBLE1BQ1gsVUFBVSxFQUFFLGdCQUFnQixjQUFjLGlCQUFpQixlQUFlO0FBQUEsSUFDM0UsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxXQUFXLHVCQUF1QixjQUFjO0FBQUEsTUFDckQsT0FBTztBQUFBLE1BQ1AsV0FBVztBQUFBLE1BQ1gsVUFBVSxFQUFFLGdCQUFnQixjQUFjLGlCQUFpQixpQkFBaUI7QUFBQSxJQUM3RSxDQUFDLENBQUM7QUFFRixVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsV0FBTztBQUFBLE1BQ04sU0FBUyxDQUFDLEVBQUUsTUFBTSxJQUFJLEVBQUUsSUFBSSxVQUFRLEtBQUssU0FBUyxTQUFTLENBQUM7QUFBQSxNQUM1RCxDQUFDLGVBQWUsU0FBUyxHQUFHLGFBQWEsU0FBUyxDQUFDO0FBQUEsSUFDcEQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlEQUFpRCxNQUFNO0FBQzNELFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsVUFBVSxFQUFFLE9BQU8sZ0JBQWdCLENBQUMsQ0FBQztBQUU3RSxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxJQUFJLEdBQUcsZUFBZTtBQUFBLEVBQzVELENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsUUFBUSxDQUFDO0FBRWpELFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBRXRDLFdBQU8sR0FBRyxTQUFTLENBQUMsRUFBRSxRQUFRO0FBQzlCLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxTQUFTLElBQUksRUFBRSxTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVMsQ0FBQztBQUFBLEVBQ3ZGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxZQUFZO0FBQ3JFLFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzNGLFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzNGLFVBQU0sV0FBVyx1QkFBdUIsV0FBVyxFQUFFLE9BQU8sWUFBWSxDQUFDLENBQUM7QUFDMUUsVUFBTSxXQUFXLHVCQUF1QixXQUFXLEVBQUUsT0FBTyxZQUFZLENBQUMsQ0FBQztBQUUxRSxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUN0QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFFckMsVUFBTSxTQUFTLGNBQWMsU0FBUyxDQUFDLEVBQUUsU0FBUztBQUVsRCxVQUFNLG9CQUFvQixTQUFTLFlBQVk7QUFDL0MsV0FBTyxZQUFZLGtCQUFrQixRQUFRLENBQUM7QUFDOUMsV0FBTyxZQUFZLGtCQUFrQixDQUFDLEVBQUUsTUFBTSxJQUFJLEdBQUcsV0FBVztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixJQUFJLE1BQU0sYUFBYSxDQUFDO0FBQ2xGLFVBQU0sb0JBQXdDLENBQUM7QUFDL0MsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsY0FBYyxzQkFBc0IsSUFBSSxPQUFPLFlBQVksQ0FBQyxDQUFDO0FBRWpILFVBQU0sV0FBVyxlQUFlLGFBQWEsT0FBTyxFQUFFLGtCQUFrQixDQUFDO0FBQ3pFLFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsVUFBTSxTQUFTLGNBQWMsU0FBUyxDQUFDLEVBQUUsU0FBUztBQUVsRCxXQUFPLGdCQUFnQixrQkFBa0IsSUFBSSxjQUFZO0FBQUEsTUFDeEQsSUFBSSxRQUFRO0FBQUEsTUFDWixPQUFPLE1BQU0sUUFBUSxRQUFRLEtBQUssQ0FBQyxDQUFDLElBQ2pDLFFBQVEsS0FBSyxDQUFDLEVBQUUsSUFBSSxVQUFRLHFCQUFxQixJQUFJLElBQUksRUFBRSxVQUFVLEtBQUssU0FBUyxTQUFTLEdBQUcsT0FBTyxLQUFLLE1BQU0sSUFBSSxNQUFTLElBQzlIO0FBQUEsTUFDSCxTQUFTLFFBQVEsS0FBSyxDQUFDO0FBQUEsSUFDeEIsRUFBRSxHQUFHLENBQUM7QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sQ0FBQyxFQUFFLFVBQVUsU0FBUyxTQUFTLEdBQUcsT0FBTyxZQUFZLENBQUM7QUFBQSxNQUM3RCxTQUFTLEVBQUUsa0JBQWtCLEtBQUs7QUFBQSxJQUNuQyxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLDBEQUEwRCxZQUFZO0FBQzFFLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsUUFBUSxDQUFDO0FBRWpELFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBQ3RDLFVBQU0sVUFBVSxTQUFTLENBQUM7QUFFMUIsVUFBTSxTQUFTLFdBQVcsUUFBUSxXQUFXLFFBQVE7QUFHckQsV0FBTyxZQUFZLE1BQU0sU0FBUyxRQUFRLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSyw4REFBOEQsWUFBWTtBQUM5RSxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsT0FBTyxNQUFNLGFBQWEsQ0FBQztBQUNyRixVQUFNLFdBQVcsdUJBQXVCLFVBQVUsRUFBRSxjQUFjLHNCQUFzQixNQUFNLENBQUMsQ0FBQztBQUVoRyxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUN0QyxVQUFNLFVBQVUsU0FBUyxDQUFDO0FBRTFCLFVBQU0sT0FBTztBQUFBLE1BQ1osTUFBTSxTQUFTLFdBQVcsUUFBUSxXQUFXLFFBQVE7QUFBQSxNQUNyRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzNGLFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzNGLFVBQU0sV0FBVyx1QkFBdUIsV0FBVyxFQUFFLE9BQU8sWUFBWSxDQUFDLENBQUM7QUFDMUUsVUFBTSxXQUFXLHVCQUF1QixXQUFXLEVBQUUsT0FBTyxZQUFZLENBQUMsQ0FBQztBQUUxRSxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFHbEQsUUFBSSxXQUFXLFNBQVMsWUFBWTtBQUNwQyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFHckMsVUFBTSxjQUFjLFNBQVM7QUFHN0IsZUFBVyxTQUFTLFlBQVk7QUFDaEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxNQUFNLElBQUksR0FBRyxXQUFXO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDM0YsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDM0YsVUFBTSxXQUFXLHVCQUF1QixXQUFXLEVBQUUsT0FBTyxTQUFTLENBQUMsQ0FBQztBQUN2RSxVQUFNLFdBQVcsdUJBQXVCLFdBQVcsRUFBRSxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBRXZFLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBQ3RDLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUdyQyxVQUFNLFdBQVcsU0FBUyxDQUFDO0FBQzNCLFdBQU8sWUFBWSxTQUFTLE1BQU0sSUFBSSxFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsUUFBUSxDQUFDO0FBRWpELFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBR3RDLFdBQU8sR0FBRyxTQUFTLENBQUMsRUFBRSxPQUFPLElBQUksTUFBTSxNQUFTO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsVUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDMUYsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsTUFBTSxLQUFLLENBQUMsQ0FBQztBQUVqRSxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsT0FBTyxJQUFJLEdBQUcsSUFBSTtBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQzFGLFVBQU0sV0FBVyx1QkFBdUIsVUFBVSxFQUFFLE1BQU0sTUFBTSxDQUFDLENBQUM7QUFFbEUsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFFdEMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLE9BQU8sSUFBSSxHQUFHLEtBQUs7QUFBQSxFQUNuRCxDQUFDO0FBRUQsT0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxVQUFNLFlBQVksSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUMzRixVQUFNLFlBQVksSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUMzRixVQUFNLFdBQVcsdUJBQXVCLFdBQVcsRUFBRSxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZFLFVBQU0sV0FBVyx1QkFBdUIsV0FBVyxFQUFFLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFFdkUsVUFBTSxXQUFXLGVBQWUsYUFBYSxLQUFLO0FBQ2xELFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFDdEMsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBR3JDLFVBQU0sVUFBVSxTQUFTLENBQUMsRUFBRTtBQUk1QixVQUFNLFVBQWlDLENBQUM7QUFDeEMsZ0JBQVksSUFBSSxTQUFTLG9CQUFvQixPQUFLLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUVsRSxVQUFNLGNBQWMsU0FBUztBQUc3QixXQUFPLEdBQUcsUUFBUSxTQUFTLENBQUM7QUFDNUIsVUFBTSxhQUFhLFFBQVEsUUFBUSxTQUFTLENBQUM7QUFDN0MsV0FBTyxZQUFZLFdBQVcsUUFBUSxRQUFRLENBQUM7QUFDL0MsV0FBTyxZQUFZLFdBQVcsUUFBUSxDQUFDLEVBQUUsV0FBVyxPQUFPO0FBQUEsRUFDNUQsQ0FBQztBQUVELE9BQUssd0dBQXdHLE1BQU07QUFFbEgsVUFBTSxlQUFlO0FBQ3JCLGFBQVMsSUFBSSxHQUFHLElBQUksY0FBYyxLQUFLO0FBQ3RDLFlBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sU0FBUyxDQUFDLEdBQUcsQ0FBQztBQUMxRixZQUFNLFdBQVcsdUJBQXVCLFVBQVUsRUFBRSxPQUFPLFFBQVEsQ0FBQyxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFBQSxJQUN4RjtBQUVBLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBQ3RDLFdBQU8sWUFBWSxTQUFTLFFBQVEsWUFBWTtBQUtoRCxVQUFNLGFBQWEsU0FBUyxJQUFJLE1BQU0sQ0FBQztBQUN2QyxhQUFTLFFBQVEsQ0FBQyxTQUFTLE1BQU07QUFDaEMsa0JBQVksSUFBSSxRQUFRLFlBQVU7QUFDakMsZ0JBQVEsTUFBTSxLQUFLLE1BQU07QUFDekIsbUJBQVcsQ0FBQztBQUFBLE1BQ2IsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBSUQsVUFBTSxvQkFBcUIsU0FBMkU7QUFDdEcsV0FBTyxZQUFZLGtCQUFrQixPQUFPLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsWUFBWSxTQUFTLElBQUksTUFBTSxDQUFDLENBQUM7QUFHeEQsVUFBTSxRQUFRLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxnQkFBZ0IsQ0FBQztBQUMxRixVQUFNLFdBQVcsdUJBQXVCLE9BQU87QUFBQSxNQUM5QyxPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUEsTUFDWCxVQUFVLEVBQUUsZ0JBQWdCLGNBQWMsaUJBQWlCLFNBQVM7QUFBQSxJQUNyRSxDQUFDLENBQUM7QUFJRixXQUFPLFlBQVksa0JBQWtCLE9BQU8sQ0FBQztBQUM3QyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBQ3BELFdBQU8sZ0JBQWdCLFlBQVksQ0FBQyxHQUFHLEdBQUcsU0FBUyxNQUFNLENBQUMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUMxRSxDQUFDO0FBRUQsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxVQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUMxRixVQUFNLFdBQVcsdUJBQXVCLFFBQVEsQ0FBQztBQUVqRCxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFHbEQsVUFBTSxZQUFZLFNBQVMsWUFBWTtBQUN2QyxVQUFNLFlBQVksU0FBUyxZQUFZO0FBRXZDLFdBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxXQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFFdEMsV0FBTyxZQUFZLFVBQVUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDO0FBQUEsRUFDOUMsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDM0YsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDM0YsVUFBTSxXQUFXLHVCQUF1QixXQUFXLEVBQUUsT0FBTyxZQUFZLENBQUMsQ0FBQztBQUMxRSxVQUFNLFdBQVcsdUJBQXVCLFdBQVcsRUFBRSxPQUFPLFlBQVksQ0FBQyxDQUFDO0FBRTFFLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxhQUFTLFlBQVk7QUFFckIsVUFBTSxVQUFpQyxDQUFDO0FBQ3hDLGdCQUFZLElBQUksU0FBUyxvQkFBb0IsT0FBSyxRQUFRLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFHbEUsVUFBTSxXQUFXO0FBQUEsTUFDaEIsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUFBLE1BQ3pFLEVBQUUsT0FBTyxZQUFZO0FBQUEsSUFDdEIsQ0FBQztBQUdELGVBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQU0sYUFBYSxPQUFPLFFBQVEsSUFBSSxPQUFLLEVBQUUsU0FBUztBQUN0RCxZQUFNLFlBQVksSUFBSSxJQUFJLFVBQVU7QUFDcEMsYUFBTyxZQUFZLFdBQVcsUUFBUSxVQUFVLE1BQU0sMkNBQTJDO0FBQUEsSUFDbEc7QUFBQSxFQUNELENBQUM7QUFJRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLE1BQU0sSUFBSSxLQUFLLGVBQWU7QUFFcEMsVUFBTSxZQUFZLFNBQVMsaUJBQWlCLEdBQUc7QUFFL0MsV0FBTyxHQUFHLFdBQVcsOENBQThDO0FBQ25FLFdBQU8sWUFBWSxVQUFVLE9BQU8sU0FBUztBQUM3QyxXQUFPLFlBQVksVUFBVSxRQUFRLFFBQVEsQ0FBQztBQUM5QyxXQUFPLFlBQVksVUFBVSxRQUFRLENBQUMsRUFBRSxLQUFLLFNBQVMsR0FBRyxJQUFJLFNBQVMsQ0FBQztBQUN2RSxXQUFPLFlBQVksVUFBVSx3QkFBd0IsSUFBSTtBQUFBLEVBQzFELENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixZQUFZLE1BQU0sNkJBQTZCLENBQUM7QUFDMUcsVUFBTSxXQUFXLHVCQUF1QixVQUFVLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRW5FLFVBQU0sV0FBVyxlQUFlLGFBQWEsS0FBSztBQUNsRCxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBQ3RDLFVBQU0sWUFBWSxTQUFTLENBQUMsRUFBRSxVQUFVLElBQUk7QUFFNUMsV0FBTyxHQUFHLFNBQVM7QUFDbkIsV0FBTyxZQUFZLFVBQVUsUUFBUSxRQUFRLENBQUM7QUFDOUMsV0FBTyxZQUFZLFVBQVUsUUFBUSxDQUFDLEVBQUUsS0FBSyxTQUFTLEdBQUcsSUFBSSxNQUFNLGFBQWEsRUFBRSxTQUFTLENBQUM7QUFDNUYsV0FBTyxZQUFZLFVBQVUsd0JBQXdCLElBQUk7QUFHekQsV0FBTyxhQUFhLE1BQU0sSUFBSSxTQUFTLFVBQVUsUUFBUSxDQUFDLEVBQUUsTUFBTSxXQUFXLGVBQWUsQ0FBQztBQUM3RixXQUFPLGFBQWEsTUFBTSxJQUFJLFNBQVMsVUFBVSxRQUFRLENBQUMsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQUEsRUFDN0YsQ0FBQztBQUlELFdBQVMsNkJBQWlKO0FBQ3pKLFFBQUk7QUFDSixRQUFJO0FBQ0osVUFBTSwwQkFBMEIsSUFBSSxRQUFjLE9BQUs7QUFBRSx3QkFBa0I7QUFBQSxJQUFHLENBQUM7QUFDL0UsVUFBTSx5QkFBeUIsSUFBSSxRQUE0QixPQUFLO0FBQUUsdUJBQWlCO0FBQUEsSUFBRyxDQUFDO0FBRzNGLFVBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixRQUFRLE1BQU0sbUJBQW1CLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUU3RyxVQUFNLFdBQVcsMkJBQTJCLGFBQWEsT0FBTyxhQUFhO0FBQUEsTUFDNUUsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDckQ7QUFBQSxJQUNELElBQUk7QUFBQSxNQUNILGVBQWU7QUFBQSxNQUNmLDBCQUEwQixPQUFPLE9BQU8sYUFBd0M7QUFBQSxRQUMvRSxVQUFVO0FBQUEsUUFDVixPQUFPLFFBQVE7QUFBQSxRQUNmLFFBQVEsRUFBRSxTQUFTLEtBQUssSUFBSSxHQUFHLG9CQUFvQixRQUFXLGtCQUFrQixPQUFVO0FBQUEsTUFDM0Y7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGVBQWUsTUFBTTtBQUNwQix1QkFBZSxFQUFFLFlBQVksS0FBSyxDQUFrQztBQUNwRSx3QkFBZ0I7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsZUFBZSxNQUFNO0FBRXBCLGNBQU0sV0FBVyx1QkFBdUIsY0FBYyxFQUFFLGNBQWMsc0JBQXNCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDdEc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsb0JBQW9CLFVBQXNEO0FBQ2xGLFdBQU8sSUFBSSxRQUFjLGFBQVc7QUFDbkMsWUFBTSxJQUFJLFNBQVMsb0JBQW9CLE9BQUs7QUFDM0MsWUFBSSxFQUFFLE1BQU0sU0FBUyxHQUFHO0FBQ3ZCLFlBQUUsUUFBUTtBQUNWLGtCQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFVBQU0sRUFBRSxVQUFVLGNBQWMsSUFBSSwyQkFBMkI7QUFDL0QsVUFBTSxZQUFZLElBQUksS0FBSyxlQUFlO0FBRTFDLFVBQU0sVUFBVSxTQUFTLGlCQUFpQixXQUFXLHNCQUFzQixFQUFFO0FBRTdFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sWUFBWSxRQUFRLGFBQWEsc0JBQXNCLEVBQUU7QUFDaEUsV0FBTyxZQUFZLFFBQVEsT0FBTyxJQUFJLEdBQUcsY0FBYyxRQUFRO0FBRy9ELFVBQU0sUUFBUSxvQkFBb0IsUUFBUTtBQUMxQyxVQUFNLE9BQU8sTUFBTSxTQUFTLGNBQWMsUUFBUSxTQUFTO0FBQzNELFVBQU0sY0FBYyxTQUFTLFlBQVksUUFBUSxXQUFXLEtBQUssVUFBVSxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBQzVGLFVBQU07QUFDTixrQkFBYztBQUNkLFVBQU0sT0FBTyxjQUFjLFdBQVc7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSyxpREFBaUQsWUFBWTtBQUNqRSxVQUFNLEVBQUUsVUFBVSxjQUFjLElBQUksMkJBQTJCO0FBQy9ELFVBQU0sWUFBWSxJQUFJLEtBQUssZUFBZTtBQUMxQyxVQUFNLFVBQVUsU0FBUyxpQkFBaUIsV0FBVyxzQkFBc0IsRUFBRTtBQUU3RSxVQUFNLFFBQVEsb0JBQW9CLFFBQVE7QUFDMUMsVUFBTSxRQUFRLE1BQU0sU0FBUyxjQUFjLFFBQVEsU0FBUztBQUM1RCxVQUFNLGNBQWMsU0FBUyxZQUFZLFFBQVEsV0FBVyxNQUFNLFVBQVUsRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUM3RixVQUFNO0FBRU4sVUFBTSxTQUFTLGVBQWUsUUFBUSxTQUFTO0FBQy9DLFdBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsV0FBVyxJQUFJLEdBQUcsSUFBSTtBQUVuRSxrQkFBYztBQUNkLFVBQU0sT0FBTyxjQUFjLFdBQVc7QUFHdEMsVUFBTSxTQUFTLGNBQWMsUUFBUSxTQUFTO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUsscURBQXFELFlBQVk7QUFDckUsVUFBTSxFQUFFLFVBQVUsY0FBYyxJQUFJLDJCQUEyQjtBQUMvRCxVQUFNLFlBQVksSUFBSSxLQUFLLGVBQWU7QUFDMUMsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLFdBQVcsc0JBQXNCLEVBQUU7QUFFN0UsVUFBTSxRQUFRLG9CQUFvQixRQUFRO0FBQzFDLFVBQU0sUUFBUSxNQUFNLFNBQVMsY0FBYyxRQUFRLFNBQVM7QUFDNUQsVUFBTSxjQUFjLFNBQVMsWUFBWSxRQUFRLFdBQVcsTUFBTSxVQUFVLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFDN0YsVUFBTTtBQUVOLFVBQU0sU0FBUyxlQUFlLFFBQVEsU0FBUztBQUMvQyxXQUFPLFlBQVksU0FBUyxZQUFZLEVBQUUsQ0FBQyxFQUFFLFdBQVcsSUFBSSxHQUFHLElBQUk7QUFFbkUsVUFBTSxTQUFTLGlCQUFpQixRQUFRLFNBQVM7QUFDakQsV0FBTyxZQUFZLFNBQVMsWUFBWSxFQUFFLENBQUMsRUFBRSxXQUFXLElBQUksR0FBRyxLQUFLO0FBRXBFLGtCQUFjO0FBQ2QsVUFBTSxPQUFPLGNBQWMsV0FBVztBQUd0QyxVQUFNLFNBQVMsY0FBYyxRQUFRLFNBQVM7QUFBQSxFQUMvQyxDQUFDO0FBSUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixVQUFNLEVBQUUsVUFBVSxjQUFjLElBQUksMkJBQTJCO0FBQy9ELFVBQU0sWUFBWSxJQUFJLEtBQUssZUFBZTtBQUMxQyxVQUFNLFVBQVUsU0FBUyxpQkFBaUIsV0FBVyxzQkFBc0IsRUFBRTtBQUU3RSxVQUFNLGVBQWlELENBQUM7QUFDeEQsZ0JBQVksSUFBSSxTQUFTLG9CQUFvQixPQUFLLGFBQWEsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUV2RSxVQUFNLFFBQVEsb0JBQW9CLFFBQVE7QUFDMUMsVUFBTSxRQUFRLE1BQU0sU0FBUyxjQUFjLFFBQVEsU0FBUztBQUM1RCxVQUFNLGNBQWMsU0FBUyxZQUFZLFFBQVEsV0FBVyxNQUFNLFVBQVUsRUFBRSxPQUFPLGNBQWMsQ0FBQztBQUNwRyxVQUFNO0FBRU4sV0FBTyxZQUFZLFNBQVMsWUFBWSxFQUFFLFFBQVEsR0FBRyw0Q0FBNEM7QUFHakcsa0JBQWM7QUFDZCxVQUFNO0FBR04sV0FBTyxHQUFHLGFBQWEsU0FBUyxHQUFHLHdDQUF3QztBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFVBQU0sRUFBRSxVQUFVLGNBQWMsSUFBSSwyQkFBMkI7QUFDL0QsVUFBTSxZQUFZLElBQUksS0FBSyxlQUFlO0FBQzFDLFVBQU0sVUFBVSxTQUFTLGlCQUFpQixXQUFXLHNCQUFzQixFQUFFO0FBRTdFLFVBQU0sUUFBUSxvQkFBb0IsUUFBUTtBQUMxQyxVQUFNLFFBQVEsTUFBTSxTQUFTLGNBQWMsUUFBUSxTQUFTO0FBQzVELFVBQU0sY0FBYyxTQUFTLFlBQVksUUFBUSxXQUFXLE1BQU0sVUFBVSxFQUFFLE9BQU8sb0JBQW9CLENBQUM7QUFDMUcsVUFBTTtBQUVOLFVBQU0sV0FBVyxTQUFTLFlBQVk7QUFDdEMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLE1BQU0sSUFBSSxHQUFHLG1CQUFtQjtBQUUvRCxrQkFBYztBQUNkLFVBQU0sT0FBTyxjQUFjLFdBQVc7QUFDdEMsVUFBTSxTQUFTLGNBQWMsUUFBUSxTQUFTO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsVUFBTSxFQUFFLFVBQVUsY0FBYyxJQUFJLDJCQUEyQjtBQUMvRCxVQUFNLFlBQVksSUFBSSxLQUFLLGVBQWU7QUFDMUMsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLFdBQVcsc0JBQXNCLEVBQUU7QUFFN0UsVUFBTSxRQUFRLG9CQUFvQixRQUFRO0FBQzFDLFVBQU0sUUFBUSxNQUFNLFNBQVMsY0FBYyxRQUFRLFNBQVM7QUFDNUQsVUFBTSxjQUFjLFNBQVMsWUFBWSxRQUFRLFdBQVcsTUFBTSxVQUFVLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFDN0YsVUFBTTtBQUdOLGtCQUFjO0FBQ2QsVUFBTTtBQUVOLFdBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxRQUFRLEdBQUcsMENBQTBDO0FBQy9GLFdBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsT0FBTyxJQUFJLEdBQUcsY0FBYyxXQUFXLDRCQUE0QjtBQUVoSCxVQUFNLFNBQVMsY0FBYyxRQUFRLFNBQVM7QUFBQSxFQUMvQyxDQUFDO0FBSUQsT0FBSyxpREFBaUQsWUFBWTtBQUNqRSxVQUFNLGlCQUFpQixJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixRQUFRLE1BQU0sa0JBQWtCLENBQUM7QUFDakcsVUFBTSxXQUFXLHVCQUF1QixnQkFBZ0IsRUFBRSxjQUFjLHNCQUFzQixPQUFPLENBQUMsQ0FBQztBQUV2RyxVQUFNLFdBQVcsZUFBZSxhQUFhLE9BQU8sRUFBRSxlQUFlLEtBQUssQ0FBQztBQUMzRSxVQUFNLFdBQVcsU0FBUyxZQUFZO0FBQ3RDLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUdyQyxVQUFNLFNBQVMsV0FBVyxTQUFTLENBQUMsRUFBRSxXQUFXLGdCQUFnQixXQUFXO0FBQUEsRUFDN0UsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsVUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLE9BQU8sTUFBTSxpQkFBaUIsQ0FBQztBQUN6RixVQUFNLFdBQVcsdUJBQXVCLFVBQVUsRUFBRSxjQUFjLHNCQUFzQixNQUFNLENBQUMsQ0FBQztBQUVoRyxVQUFNLFdBQVcsZUFBZSxhQUFhLEtBQUs7QUFDbEQsVUFBTSxXQUFXLFNBQVMsWUFBWTtBQUV0QyxVQUFNLE9BQU87QUFBQSxNQUNaLE1BQU0sU0FBUyxXQUFXLFNBQVMsQ0FBQyxFQUFFLFdBQVcsVUFBVSxXQUFXO0FBQUEsTUFDdEU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBSUQsUUFBTSxvQ0FBb0MsTUFBTTtBQUMvQyxVQUFNLFlBQVksSUFBSSxLQUFLLFlBQVk7QUFPdkMsYUFBUyx1QkFHUDtBQUNELFVBQUk7QUFDSixVQUFJO0FBQ0osWUFBTSwwQkFBMEIsSUFBSSxRQUFjLE9BQUs7QUFBRSwwQkFBa0I7QUFBQSxNQUFHLENBQUM7QUFDL0UsWUFBTSx5QkFBeUIsSUFBSSxRQUE0QixPQUFLO0FBQUUseUJBQWlCO0FBQUEsTUFBRyxDQUFDO0FBRTNGLFlBQU0sV0FBVywyQkFBMkIsYUFBYSxPQUFPLGFBQWE7QUFBQSxRQUM1RSxNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsVUFDTDtBQUFBLFVBQ0E7QUFBQSxVQUNBLE9BQU8sSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxVQUFFLEVBQUU7QUFBQSxRQUNyRDtBQUFBLE1BQ0QsRUFBRTtBQUVGLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxlQUFlLE1BQU07QUFDcEIseUJBQWUsRUFBRSxZQUFZLEtBQUssQ0FBa0M7QUFDcEUsMEJBQWdCO0FBQUEsUUFDakI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLGFBQVNDLHFCQUFvQixVQUFzRDtBQUNsRixhQUFPLElBQUksUUFBYyxhQUFXO0FBQ25DLGNBQU0sSUFBSSxTQUFTLG9CQUFvQixPQUFLO0FBQzNDLGNBQUksRUFBRSxNQUFNLFNBQVMsR0FBRztBQUN2QixjQUFFLFFBQVE7QUFDVixvQkFBUTtBQUFBLFVBQ1Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBRUEsU0FBSyxnRUFBZ0UsWUFBWTtBQUNoRixZQUFNLEVBQUUsVUFBVSxjQUFjLElBQUkscUJBQXFCO0FBRXpELFlBQU0sYUFBYSxTQUFTLGlCQUFpQixXQUFXLHNCQUFzQixFQUFFO0FBQ2hGLFlBQU0sWUFBWSxXQUFXO0FBRTdCLFlBQU0sUUFBUUEscUJBQW9CLFFBQVE7QUFDMUMsWUFBTSxPQUFPLE1BQU0sU0FBUyxjQUFjLFNBQVM7QUFDbkQsWUFBTSxjQUFjLFNBQVMsWUFBWSxXQUFXLEtBQUssVUFBVSxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBQ3BGLFlBQU07QUFFTixhQUFPLFlBQVksU0FBUyxZQUFZLEVBQUUsUUFBUSxHQUFHLHVDQUF1QztBQUU1RixZQUFNLFNBQVMsY0FBYyxTQUFTO0FBQ3RDLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxRQUFRLEdBQUcsK0NBQStDO0FBR3BHLG9CQUFjO0FBQ2QsWUFBTSxPQUFPLGNBQWMsV0FBVztBQUFBLElBQ3ZDLENBQUM7QUFFRCxTQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFlBQU0sRUFBRSxVQUFVLGNBQWMsSUFBSSxxQkFBcUI7QUFFekQsWUFBTSxhQUFhLFNBQVMsaUJBQWlCLFdBQVcsc0JBQXNCLEVBQUU7QUFDaEYsWUFBTSxZQUFZLFdBQVc7QUFFN0IsWUFBTSxRQUFRQSxxQkFBb0IsUUFBUTtBQUMxQyxZQUFNLE9BQU8sTUFBTSxTQUFTLGNBQWMsU0FBUztBQUNuRCxZQUFNLGNBQWMsU0FBUyxZQUFZLFdBQVcsS0FBSyxVQUFVLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFDcEYsWUFBTTtBQUVOLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxRQUFRLEdBQUcsdUNBQXVDO0FBRTVGLFlBQU0sU0FBUyxlQUFlLFNBQVM7QUFDdkMsYUFBTyxZQUFZLFNBQVMsWUFBWSxFQUFFLFFBQVEsR0FBRywwREFBMEQ7QUFDL0csYUFBTyxZQUFZLFNBQVMsWUFBWSxFQUFFLENBQUMsRUFBRSxXQUFXLElBQUksR0FBRyxNQUFNLDRCQUE0QjtBQUdqRyxvQkFBYztBQUNkLFlBQU0sT0FBTyxjQUFjLFdBQVc7QUFHdEMsWUFBTSxTQUFTLGNBQWMsU0FBUztBQUFBLElBQ3ZDLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFlBQU0sRUFBRSxVQUFVLGNBQWMsSUFBSSxxQkFBcUI7QUFFekQsWUFBTSxhQUFhLFNBQVMsaUJBQWlCLFdBQVcsc0JBQXNCLEVBQUU7QUFDaEYsWUFBTSxZQUFZLFdBQVc7QUFFN0IsWUFBTSxRQUFRQSxxQkFBb0IsUUFBUTtBQUMxQyxZQUFNLE9BQU8sTUFBTSxTQUFTLGNBQWMsU0FBUztBQUNuRCxZQUFNLGNBQWMsU0FBUyxZQUFZLFdBQVcsS0FBSyxVQUFVLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFDcEYsWUFBTTtBQUdOLG9CQUFjO0FBQ2QsWUFBTTtBQUVOLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxRQUFRLEdBQUcsMkNBQTJDO0FBQ2hHLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsT0FBTyxJQUFJLEdBQUcsY0FBYyxXQUFXLDZCQUE2QjtBQUVqSCxZQUFNLFNBQVMsZUFBZSxTQUFTO0FBQ3ZDLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxRQUFRLEdBQUcscURBQXFEO0FBQzFHLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsV0FBVyxJQUFJLEdBQUcsTUFBTSw0QkFBNEI7QUFHakcsWUFBTSxTQUFTLGlCQUFpQixTQUFTO0FBQ3pDLGFBQU8sWUFBWSxTQUFTLFlBQVksRUFBRSxDQUFDLEVBQUUsV0FBVyxJQUFJLEdBQUcsT0FBTyw4QkFBOEI7QUFHcEcsWUFBTSxTQUFTLGNBQWMsU0FBUztBQUFBLElBQ3ZDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxRQUFNLHdDQUF3QyxNQUFNO0FBQ25ELFVBQU0sWUFBWSxJQUFJLEtBQUssWUFBWTtBQUV2QyxhQUFTLFdBQVcsTUFBb0c7QUFDdkgsWUFBTSxTQUFTLElBQUksY0FBYyx5QkFBeUI7QUFBQSxRQUNoRCxRQUFXLEtBQXFDO0FBQ3hELGdCQUFNLE9BQU8sTUFBTSxRQUFXLEdBQUc7QUFDakMsY0FBSSxLQUFLLG9CQUFvQixRQUFRLGtCQUFrQixtQkFBbUI7QUFDekUsbUJBQU8sRUFBRSxHQUFHLE1BQU0sYUFBYSxNQUFzQjtBQUFBLFVBQ3REO0FBQ0EsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxFQUFFO0FBQ0YsVUFBSSxLQUFLLGNBQWM7QUFDdEIsZUFBTyxxQkFBcUIsa0JBQWtCLHdCQUF3QixLQUFLLFlBQVk7QUFBQSxNQUN4RjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxZQUFNLHVCQUF1QixXQUFXLEVBQUUsY0FBYyxvQkFBb0IsVUFBVSxDQUFDO0FBQ3ZGLFlBQU0sV0FBVywyQkFBMkIsYUFBYSxPQUFPLE1BQU0sSUFBSSxRQUFRLE1BQU07QUFBQSxNQUFFLENBQUMsR0FBRyxFQUFFLHFCQUFxQixDQUFDO0FBRXRILFlBQU0sY0FBYyxTQUFTLGlCQUFpQixXQUFXLHNCQUFzQixFQUFFO0FBQ2pGLFlBQU0sVUFBVSxTQUFTLFdBQVcsWUFBWSxTQUFTO0FBRXpELGFBQU8sWUFBWSxTQUFTLGdCQUFnQixJQUFJLEdBQUcsb0JBQW9CLFNBQVM7QUFBQSxJQUNqRixDQUFDO0FBRUQsU0FBSyx3RUFBd0UsTUFBTTtBQUNsRixZQUFNLHVCQUF1QixXQUFXLEVBQUUsY0FBYyxvQkFBb0IsV0FBVyxrQkFBa0IsS0FBSyxDQUFDO0FBQy9HLFlBQU0sV0FBVywyQkFBMkIsYUFBYSxPQUFPLE1BQU0sSUFBSSxRQUFRLE1BQU07QUFBQSxNQUFFLENBQUMsR0FBRyxFQUFFLHFCQUFxQixDQUFDO0FBRXRILFlBQU0sY0FBYyxTQUFTLGlCQUFpQixXQUFXLHNCQUFzQixFQUFFO0FBQ2pGLFlBQU0sVUFBVSxTQUFTLFdBQVcsWUFBWSxTQUFTO0FBRXpELGFBQU8sWUFBWSxTQUFTLGdCQUFnQixJQUFJLEdBQUcsb0JBQW9CLE9BQU87QUFBQSxJQUMvRSxDQUFDO0FBRUQsU0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFNLHVCQUF1QixXQUFXLENBQUMsQ0FBQztBQUMxQyxZQUFNLFdBQVcsMkJBQTJCLGFBQWEsT0FBTyxNQUFNLElBQUksUUFBUSxNQUFNO0FBQUEsTUFBRSxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsQ0FBQztBQUV0SCxZQUFNLGNBQWMsU0FBUyxpQkFBaUIsV0FBVyxzQkFBc0IsRUFBRTtBQUNqRixZQUFNLFVBQVUsU0FBUyxXQUFXLFlBQVksU0FBUztBQUV6RCxhQUFPLFlBQVksU0FBUyxnQkFBZ0IsSUFBSSxHQUFHLG9CQUFvQixPQUFPO0FBQUEsSUFDL0UsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUsseUZBQXlGLFlBQVk7QUFTekcsVUFBTSxFQUFFLFVBQVUsZUFBZSxhQUFhLElBQUksMkJBQTJCO0FBQzdFLFVBQU0sWUFBWSxJQUFJLEtBQUssZUFBZTtBQUMxQyxVQUFNLFVBQVUsU0FBUyxpQkFBaUIsV0FBVyxzQkFBc0IsRUFBRTtBQUU3RSxVQUFNLFdBQXFCLENBQUM7QUFDNUIsZ0JBQVksSUFBSSxTQUFTLG9CQUFvQixPQUFLO0FBQ2pELGlCQUFXLEtBQUssRUFBRSxTQUFTO0FBQzFCLGlCQUFTLEtBQUssRUFBRSxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQ3BDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFFBQVEsb0JBQW9CLFFBQVE7QUFDMUMsVUFBTSxPQUFPLE1BQU0sU0FBUyxjQUFjLFFBQVEsU0FBUztBQUMzRCxVQUFNLGNBQWMsU0FBUyxZQUFZLFFBQVEsV0FBVyxLQUFLLFVBQVUsRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUM1RixVQUFNO0FBSU4sa0JBQWM7QUFNZCxVQUFNLGNBQWMsWUFBWTtBQUdoQyxXQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsU0FBUyxhQUFhLFNBQVMsQ0FBQztBQUFBLE1BQzFDLCtCQUErQixhQUFhLFNBQVMsQ0FBQyxzREFDbkMsU0FBUyxLQUFLLElBQUksQ0FBQztBQUFBLElBQ3ZDO0FBR0EsVUFBTSxXQUFXLHVCQUF1QixjQUFjLEVBQUUsY0FBYyxzQkFBc0IsT0FBTyxDQUFDLENBQUM7QUFFckcsVUFBTTtBQUFBLEVBQ1AsQ0FBQztBQUVELE9BQUsseUVBQXlFLFlBQVk7QUFJekYsVUFBTSxvQkFBb0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsT0FBTyxNQUFNLFNBQVMsYUFBYSxDQUFDLEdBQUcsQ0FBQztBQUMzRyxVQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksUUFBMkMsQ0FBQztBQUVwRixRQUFJO0FBQ0osVUFBTSwwQkFBMEIsSUFBSSxRQUFjLE9BQUs7QUFBRSx3QkFBa0I7QUFBQSxJQUFHLENBQUM7QUFDL0UsVUFBTSx5QkFBeUIsSUFBSSxRQUE0QixNQUFNO0FBQUEsSUFBdUIsQ0FBQztBQUU3RixVQUFNLFdBQVcsMkJBQTJCLGFBQWEsT0FBTyxhQUFhO0FBQUEsTUFDNUUsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDckQ7QUFBQSxJQUNELElBQUksRUFBRSxvQkFBb0IsWUFBWSxNQUFNLENBQUM7QUFFN0MsVUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsMkJBQTJCLE1BQU0sbUJBQW1CLENBQUM7QUFDMUYsVUFBTSxVQUFVLFNBQVMsaUJBQWlCLFdBQVcsd0JBQXdCLEVBQUU7QUFFL0UsVUFBTSxXQUFxQixDQUFDO0FBQzVCLGdCQUFZLElBQUksU0FBUyxvQkFBb0IsT0FBSztBQUNqRCxpQkFBVyxLQUFLLEVBQUUsU0FBUztBQUMxQixpQkFBUyxLQUFLLEVBQUUsU0FBUyxTQUFTLENBQUM7QUFBQSxNQUNwQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxRQUFRLG9CQUFvQixRQUFRO0FBQzFDLFVBQU0sT0FBTyxNQUFNLFNBQVMsY0FBYyxRQUFRLFNBQVM7QUFDM0QsVUFBTSxtQkFBbUIsS0FBSztBQUM5QixVQUFNLGNBQWMsU0FBUyxZQUFZLFFBQVEsV0FBVyxLQUFLLFVBQVUsRUFBRSxPQUFPLEtBQUssQ0FBQztBQUMxRixVQUFNO0FBSU4sb0JBQWdCO0FBRWhCLFVBQU0sV0FBVyx1QkFBdUIsbUJBQW1CLEVBQUUsY0FBYyxzQkFBc0IsTUFBTSxDQUFDLENBQUM7QUFJekcsUUFBSSxjQUFjO0FBQ2xCLFVBQU0seUJBQXlCLFlBQVk7QUFDMUMsYUFBTyxDQUFDLGFBQWE7QUFDcEIsb0JBQVksS0FBSyxFQUFFLFVBQVUsa0JBQWtCLFdBQVcsa0JBQWtCLENBQUM7QUFDN0UsY0FBTSxRQUFRLENBQUM7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLGFBQWEsdUJBQXVCO0FBRTFDLFFBQUk7QUFDSCxZQUFNLE9BQU8sY0FBYyxXQUFXO0FBQUEsSUFDdkMsVUFBRTtBQUNELG9CQUFjO0FBQ2QsWUFBTTtBQUFBLElBQ1A7QUFFQSxXQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsU0FBUyxpQkFBaUIsU0FBUyxDQUFDO0FBQUEsTUFDOUMseUVBQXlFLFNBQVMsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUM3RjtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbIm1vZGVsIiwgIndhaXRGb3JTZXNzaW9uQWRkZWQiXQp9Cg==
