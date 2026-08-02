import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { DisposableStore, Disposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Emitter } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { IAgentHostTerminalService } from "../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITerminalProfileService } from "../../../../../workbench/contrib/terminal/common/terminal.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService, ILogService } from "../../../../../platform/log/common/log.js";
import { ITerminalService } from "../../../../../workbench/contrib/terminal/browser/terminal.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentSessionProviders } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js";
import { ChatInteractivity } from "../../../../services/sessions/common/session.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { SessionsTerminalContribution } from "../../browser/sessionsTerminalContribution.js";
import { TestPathService } from "../../../../../workbench/test/browser/workbenchTestServices.js";
import { IPathService } from "../../../../../workbench/services/path/common/pathService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
const HOME_DIR = URI.file("/home/user");
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.infos = [];
    this.traces = [];
  }
  info(message, ...args) {
    this.infos.push([message, ...args].join(" "));
  }
  trace(message, ...args) {
    this.traces.push([message, ...args].join(" "));
  }
}
function makeAgentSession(opts) {
  const folder = opts.repository || opts.worktree ? {
    root: opts.repository ?? opts.worktree,
    workingDirectory: opts.worktree ?? opts.repository,
    name: "test",
    description: void 0,
    gitRepository: { uri: opts.repository ?? opts.worktree, workTreeUri: opts.worktree, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
  } : void 0;
  const chat = {
    resource: URI.parse("file:///session"),
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("test.title", "Test Session"),
    updatedAt: observableValue("test.updatedAt", /* @__PURE__ */ new Date()),
    status: observableValue("test.status", 0),
    changes: observableValue("test.changes", []),
    modelId: observableValue("test.modelId", void 0),
    mode: observableValue("test.mode", void 0),
    isArchived: observableValue("test.isArchived", opts.isArchived ?? false),
    isRead: observableValue("test.isRead", true),
    interactivity: observableValue("test.interactivity", ChatInteractivity.Full),
    checkpoints: observableValue("test.checkpoints", void 0),
    lastTurnEnd: observableValue("test.lastTurnEnd", void 0),
    description: observableValue("test.description", void 0)
  };
  const session = {
    sessionId: opts.sessionId ?? "test:session",
    resource: chat.resource,
    providerId: opts.providerId ?? "test",
    sessionType: opts.providerType ?? AgentSessionProviders.Local,
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("test.workspace", folder ? {
      uri: folder.root,
      label: "test",
      icon: Codicon.repo,
      folders: [folder],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    } : void 0),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("test.loading", opts.loading ?? false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("test.chats", [chat]),
    activeChat: observableValue("test.activeChat", chat),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false }),
    isCreated: observableValue("test.isCreated", true),
    sticky: observableValue("test.sticky", false),
    openChats: observableValue("test.openChats", [chat]),
    closedChats: constObservable([]),
    lastClosedChat: void 0,
    visibleChatTabs: constObservable([chat]),
    shouldShowChatTabs: constObservable(false)
  };
  return session;
}
function makeNonAgentSession(opts) {
  const folder = opts.repository || opts.worktree ? {
    root: opts.repository ?? opts.worktree,
    workingDirectory: opts.worktree ?? opts.repository,
    name: "test",
    description: void 0,
    gitRepository: { uri: opts.repository ?? opts.worktree, workTreeUri: opts.worktree, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
  } : void 0;
  const chat = {
    resource: URI.parse("file:///session"),
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("test.title", "Test Session"),
    updatedAt: observableValue("test.updatedAt", /* @__PURE__ */ new Date()),
    status: observableValue("test.status", 0),
    changes: observableValue("test.changes", []),
    modelId: observableValue("test.modelId", void 0),
    mode: observableValue("test.mode", void 0),
    isArchived: observableValue("test.isArchived", false),
    isRead: observableValue("test.isRead", true),
    interactivity: observableValue("test.interactivity", ChatInteractivity.Full),
    checkpoints: observableValue("test.checkpoints", void 0),
    lastTurnEnd: observableValue("test.lastTurnEnd", void 0),
    description: observableValue("test.description", void 0)
  };
  const session = {
    sessionId: opts.sessionId ?? "test:non-agent",
    resource: chat.resource,
    providerId: "test",
    sessionType: opts.providerType ?? AgentSessionProviders.Local,
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("test.workspace", folder ? {
      uri: folder.root,
      label: "test",
      icon: Codicon.repo,
      folders: [folder],
      requiresWorkspaceTrust: false
    } : void 0),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("test.loading", false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("test.chats", [chat]),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
  return session;
}
function makeTerminalInstance(id, cwd) {
  const commandHistory = [];
  let isDisposed = false;
  let initialCwdBarrier;
  let shellLaunchConfig = {};
  const capabilities = {
    get(cap) {
      if (cap === TerminalCapability.CommandDetection && commandHistory.length > 0) {
        return { commands: commandHistory };
      }
      return void 0;
    }
  };
  return {
    instanceId: id,
    get isDisposed() {
      return isDisposed;
    },
    get shellLaunchConfig() {
      return shellLaunchConfig;
    },
    async getInitialCwd() {
      await initialCwdBarrier;
      return cwd;
    },
    capabilities,
    _testCommandHistory: commandHistory,
    _testSetDisposed(disposed) {
      isDisposed = disposed;
    },
    _testSetInitialCwdBarrier(barrier) {
      initialCwdBarrier = barrier;
    },
    _testSetShellLaunchConfig(value) {
      shellLaunchConfig = value;
    }
  };
}
function addCommandToInstance(instance, timestamp) {
  instance._testCommandHistory.push({ timestamp });
}
suite("SessionsTerminalContribution", () => {
  const store = new DisposableStore();
  let contribution;
  let activeSessionObs;
  let onDidChangeSessions;
  let onDidReplaceSession;
  let onDidReplaceNewDraftSession;
  let onDidCreateInstance;
  let onDidDisposeInstance;
  let createdTerminals;
  let agentHostTerminalAddresses;
  let terminalCreationBarriers;
  let terminalCreationStarted;
  let activeInstanceSet;
  let activeInstanceId;
  let focusCalls;
  let disposedInstances;
  let nextInstanceId;
  let terminalInstances;
  let backgroundedInstances;
  let moveToBackgroundCalls;
  let showBackgroundCalls;
  let disposeOnCreatePaths;
  let defaultCwdCalls;
  let logService;
  let allSessions;
  let sessionProviders;
  let instantiationService;
  setup(() => {
    createdTerminals = [];
    agentHostTerminalAddresses = [];
    terminalCreationBarriers = /* @__PURE__ */ new Map();
    terminalCreationStarted = [];
    activeInstanceSet = [];
    activeInstanceId = void 0;
    focusCalls = 0;
    disposedInstances = [];
    nextInstanceId = 1;
    terminalInstances = /* @__PURE__ */ new Map();
    backgroundedInstances = /* @__PURE__ */ new Set();
    moveToBackgroundCalls = [];
    showBackgroundCalls = [];
    disposeOnCreatePaths = /* @__PURE__ */ new Set();
    defaultCwdCalls = [];
    logService = new TestLogService();
    allSessions = [];
    sessionProviders = /* @__PURE__ */ new Map();
    instantiationService = store.add(new TestInstantiationService());
    activeSessionObs = observableValue("activeSession", void 0);
    onDidChangeSessions = store.add(new Emitter());
    onDidReplaceSession = store.add(new Emitter());
    onDidReplaceNewDraftSession = store.add(new Emitter());
    onDidCreateInstance = store.add(new Emitter());
    onDidDisposeInstance = store.add(new Emitter());
    instantiationService.stub(ILogService, logService);
    instantiationService.stub(ISessionsManagementService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeSessions = onDidChangeSessions.event;
        this.onDidReplaceSession = onDidReplaceSession.event;
        this.onDidReplaceNewDraftSession = onDidReplaceNewDraftSession.event;
      }
      getSessions() {
        return [...allSessions];
      }
    }());
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = activeSessionObs;
      }
    }());
    instantiationService.stub(ITerminalService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidCreateInstance = onDidCreateInstance.event;
        this.onDidDisposeInstance = onDidDisposeInstance.event;
      }
      get instances() {
        return [...terminalInstances.values()];
      }
      get foregroundInstances() {
        return [...terminalInstances.values()].filter((i) => !backgroundedInstances.has(i.instanceId));
      }
      get activeInstance() {
        return activeInstanceId !== void 0 ? terminalInstances.get(activeInstanceId) : void 0;
      }
      async createTerminal(opts) {
        const cwdUri = opts?.config?.cwd;
        const cwdStr = cwdUri?.fsPath ?? "";
        terminalCreationStarted.push(cwdStr);
        await terminalCreationBarriers.get(cwdStr)?.p;
        const id = nextInstanceId++;
        const instance = makeTerminalInstance(id, cwdStr);
        createdTerminals.push({ cwd: opts?.config?.cwd });
        terminalInstances.set(id, instance);
        if (disposeOnCreatePaths.has(cwdStr)) {
          instance._testSetDisposed(true);
          terminalInstances.delete(id);
        }
        return instance;
      }
      getInstanceFromId(id) {
        return terminalInstances.get(id);
      }
      setActiveInstance(instance) {
        activeInstanceSet.push(instance.instanceId);
        activeInstanceId = instance.instanceId;
      }
      async focusActiveInstance() {
        focusCalls++;
      }
      async safeDisposeTerminal(instance) {
        disposedInstances.push(instance);
        instance._testSetDisposed(true);
        terminalInstances.delete(instance.instanceId);
        backgroundedInstances.delete(instance.instanceId);
        if (activeInstanceId === instance.instanceId) {
          activeInstanceId = void 0;
        }
      }
      moveToBackground(instance) {
        backgroundedInstances.add(instance.instanceId);
        moveToBackgroundCalls.push(instance.instanceId);
      }
      async showBackgroundTerminal(instance) {
        backgroundedInstances.delete(instance.instanceId);
        showBackgroundCalls.push(instance.instanceId);
      }
    }());
    instantiationService.stub(IPathService, new TestPathService(HOME_DIR));
    instantiationService.stub(IAgentHostTerminalService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.profiles = constObservable([]);
      }
      getProfileForConnection() {
        return void 0;
      }
      setDefaultCwd(cwd) {
        defaultCwdCalls.push(cwd);
      }
      async createTerminalForEntry(address, options) {
        const cwd = typeof options?.cwd === "string" ? URI.file(options.cwd) : options?.cwd;
        if (!cwd) {
          return void 0;
        }
        const instance = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        agentHostTerminalAddresses.push(address);
        createdTerminals.push({ cwd });
        terminalInstances.set(instance.instanceId, instance);
        return instance;
      }
    }());
    instantiationService.stub(ITerminalProfileService, new class extends mock() {
      overrideDefaultProfile() {
        return Disposable.None;
      }
    }());
    instantiationService.stub(ISessionsProvidersService, new class extends mock() {
      getProvider(providerId) {
        return sessionProviders.get(providerId);
      }
    }());
    instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
    instantiationService.stub(IViewsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeViewVisibility = store.add(new Emitter()).event;
      }
      isViewVisible() {
        return false;
      }
    }());
    contribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creates a terminal at the worktree for a background session", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file("/repo"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
  });
  test("falls back to repository when worktree is undefined for a background session", async () => {
    const repoUri = URI.file("/repo");
    const session = makeAgentSession({ repository: repoUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
  });
  test("creates a terminal at the worktree for a Claude session", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file("/repo"), providerType: AgentSessionProviders.Claude });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
  });
  test("falls back to repository when worktree is undefined for a Claude session", async () => {
    const repoUri = URI.file("/repo");
    const session = makeAgentSession({ repository: repoUri, providerType: AgentSessionProviders.Claude });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
  });
  test("uses worktree directory for a cloud agent session when workspace exists", async () => {
    const session = makeAgentSession({ worktree: URI.file("/worktree"), repository: URI.file("/repo"), providerType: AgentSessionProviders.Cloud });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file("/worktree").fsPath);
  });
  test("uses worktree directory for a local agent session when workspace exists", async () => {
    const session = makeAgentSession({ worktree: URI.file("/worktree"), providerType: AgentSessionProviders.Local });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file("/worktree").fsPath);
  });
  test("uses home directory for a non-agent session", async () => {
    const session = makeNonAgentSession({ repository: URI.file("/repo") });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
  });
  test("creates separate terminals when different non-background sessions share the home directory", async () => {
    const session1 = makeAgentSession({ providerType: AgentSessionProviders.Cloud, sessionId: "test:cloud-1" });
    activeSessionObs.set(session1, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    const session2 = makeAgentSession({ providerType: AgentSessionProviders.Local, sessionId: "test:local-1" });
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2);
  });
  test("does not create a terminal when there is no active session", async () => {
    activeSessionObs.set(void 0, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 0);
  });
  test("waits for a loading session before creating a terminal", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background, loading: true });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 0, "should not create a terminal while session is loading");
    assert.strictEqual(defaultCwdCalls.at(-1), void 0, "should not set the default cwd while session is loading");
    session.loading.set(false, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
    assert.strictEqual(defaultCwdCalls.at(-1)?.fsPath, worktreeUri.fsPath);
  });
  test("does not recreate terminal for the same path", async () => {
    const worktreeUri = URI.file("/worktree");
    const session1 = makeAgentSession({ sessionId: "test:session-1", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session1, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    const session2 = makeAgentSession({ sessionId: "test:session-1", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
  });
  test("creates new terminal when switching to a different background path", async () => {
    const worktree1 = URI.file("/worktree1");
    const worktree2 = URI.file("/worktree2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: worktree1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: worktree2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2);
    assert.strictEqual(createdTerminals[1].cwd.fsPath, worktree2.fsPath);
  });
  test("ensureTerminal creates terminal and sets it active", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, cwd.fsPath);
    assert.strictEqual(activeInstanceSet.length, 1);
    assert.strictEqual(focusCalls, 0);
  });
  test("ensureTerminal focuses when requested", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, true);
    assert.strictEqual(focusCalls, 1);
  });
  test("ensureTerminal reuses existing terminal for same path", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, false);
    await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1, "should reuse the existing terminal");
    assert.strictEqual(activeInstanceSet.length, 1, "should only set active instance on creation");
  });
  test("ensureTerminal creates new terminal for different path", async () => {
    await contribution.ensureTerminal(URI.file("/cwd1"), false);
    await contribution.ensureTerminal(URI.file("/cwd2"), false);
    assert.strictEqual(createdTerminals.length, 2);
  });
  test("ensureTerminal path comparison is case-insensitive", async () => {
    await contribution.ensureTerminal(URI.file("/Test/CWD"), false);
    await contribution.ensureTerminal(URI.file("/test/cwd"), false);
    assert.strictEqual(createdTerminals.length, 1, "should match case-insensitively");
  });
  test("ensureTerminal does not activate a terminal disposed during creation", async () => {
    const cwd = URI.file("/test-cwd");
    disposeOnCreatePaths.add(cwd.fsPath);
    const instances = await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(instances.length, 0);
    assert.strictEqual(activeInstanceSet.length, 0);
    assert.ok(logService.traces.some((message) => message.includes(`Cannot activate created terminal for ${cwd.fsPath}; terminal 1 is no longer available`)));
  });
  test("reuses one terminal across repeated same-cwd replacement drafts", async () => {
    const cwd = URI.file("/worktree");
    sessionProviders.set("agenthost-one", new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-one";
        this.remoteAddress = "ssh-remote+one";
      }
    }());
    let currentSession = makeAgentSession({
      sessionId: "test:draft-1",
      providerId: "agenthost-one",
      worktree: cwd,
      providerType: AgentSessionProviders.Background
    });
    const [firstTerminal] = await contribution.ensureTerminal(cwd, false, currentSession);
    let latestResult = [firstTerminal];
    for (let i = 2; i <= 10; i++) {
      const nextSession = makeAgentSession({
        sessionId: `test:draft-${i}`,
        providerId: "agenthost-one",
        worktree: cwd,
        providerType: AgentSessionProviders.Background
      });
      onDidReplaceNewDraftSession.fire({ from: currentSession, to: nextSession });
      latestResult = await contribution.ensureTerminal(cwd, false, nextSession);
      currentSession = nextSession;
    }
    assert.deepStrictEqual({
      created: createdTerminals.length,
      agentHostAddresses: agentHostTerminalAddresses,
      transferredTerminalId: latestResult[0]?.instanceId,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      created: 1,
      agentHostAddresses: ["ssh-remote+one"],
      transferredTerminalId: firstTerminal.instanceId,
      disposed: []
    });
  });
  test("transfers all tracked terminals to a same-cwd replacement draft", async () => {
    const cwd = URI.file("/worktree");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: cwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: cwd, providerType: AgentSessionProviders.Background });
    const first = makeTerminalInstance(1, cwd.fsPath);
    const second = makeTerminalInstance(2, cwd.fsPath);
    terminalInstances.set(first.instanceId, first);
    terminalInstances.set(second.instanceId, second);
    nextInstanceId = 3;
    await contribution.ensureTerminal(cwd, false, firstSession);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    const result = await contribution.ensureTerminal(cwd, false, secondSession);
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      created: createdTerminals.length,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      result: [1, 2],
      created: 0,
      disposed: []
    });
  });
  test("rehomes terminals when replacement drafts use different cwd values", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const thirdSession = makeAgentSession({ sessionId: "test:third-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const [firstTerminal] = await contribution.ensureTerminal(firstCwd, false, firstSession);
    addCommandToInstance(firstTerminal, 100);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    activeSessionObs.set(secondSession, void 0);
    await tick();
    const secondTerminal = terminalInstances.get(activeInstanceId);
    onDidReplaceNewDraftSession.fire({ from: secondSession, to: thirdSession });
    activeSessionObs.set(thirdSession, void 0);
    await tick();
    const thirdTerminal = terminalInstances.get(activeInstanceId);
    assert.deepStrictEqual({
      createdCwds: createdTerminals.map((terminal) => terminal.cwd.fsPath),
      firstStillAlive: terminalInstances.has(firstTerminal.instanceId),
      secondStillAlive: secondTerminal ? terminalInstances.has(secondTerminal.instanceId) : false,
      thirdTerminalId: thirdTerminal?.instanceId,
      activeTerminalId: activeInstanceId,
      backgrounded: moveToBackgroundCalls,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      createdCwds: [firstCwd.fsPath, secondCwd.fsPath, firstCwd.fsPath],
      firstStillAlive: true,
      secondStillAlive: true,
      thirdTerminalId: 3,
      activeTerminalId: 3,
      backgrounded: [],
      disposed: []
    });
  });
  test("rehomes a same-cwd terminal when the Agent Host backend changes", async () => {
    const cwd = URI.file("/worktree");
    sessionProviders.set("agenthost-one", new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-one";
        this.remoteAddress = "ssh-remote+one";
      }
    }());
    sessionProviders.set("agenthost-two", new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-two";
        this.remoteAddress = "ssh-remote+two";
      }
    }());
    const firstSession = makeAgentSession({
      sessionId: "test:first-draft",
      providerId: "agenthost-one",
      worktree: cwd,
      providerType: AgentSessionProviders.Background
    });
    const secondSession = makeAgentSession({
      sessionId: "test:second-draft",
      providerId: "agenthost-two",
      worktree: cwd,
      providerType: AgentSessionProviders.Background
    });
    const [firstTerminal] = await contribution.ensureTerminal(cwd, false, firstSession);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    activeSessionObs.set(secondSession, void 0);
    await tick();
    const secondTerminal = terminalInstances.get(activeInstanceId);
    assert.deepStrictEqual({
      created: createdTerminals.length,
      agentHostAddresses: agentHostTerminalAddresses,
      firstStillAlive: terminalInstances.has(firstTerminal.instanceId),
      secondTerminalId: secondTerminal?.instanceId,
      backgrounded: moveToBackgroundCalls,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      created: 2,
      agentHostAddresses: ["ssh-remote+one", "ssh-remote+two"],
      firstStillAlive: true,
      secondTerminalId: 2,
      backgrounded: [],
      disposed: []
    });
  });
  test("allows generic lookup to reuse a standalone terminal", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const [firstTerminal] = await contribution.ensureTerminal(firstCwd, false, firstSession);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    const result = await contribution.ensureTerminal(firstCwd, false);
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      created: createdTerminals.length
    }, {
      result: [firstTerminal.instanceId],
      created: 1
    });
  });
  test("disposes a terminal whose creation finishes after its draft is replaced", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const creationBarrier = new DeferredPromise();
    terminalCreationBarriers.set(firstCwd.fsPath, creationBarrier);
    const operation = contribution.ensureTerminal(firstCwd, false, firstSession);
    await tick();
    assert.deepStrictEqual(terminalCreationStarted, [firstCwd.fsPath]);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    await creationBarrier.complete();
    const result = await operation;
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      disposed: disposedInstances.map((instance) => instance.instanceId),
      activated: activeInstanceSet,
      remaining: [...terminalInstances.keys()]
    }, {
      result: [],
      disposed: [1],
      activated: [],
      remaining: []
    });
  });
  test("leaves an existing terminal untouched when lookup finishes after replacement", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const cwdBarrier = new DeferredPromise();
    const existing = makeTerminalInstance(1, firstCwd.fsPath);
    existing._testSetInitialCwdBarrier(cwdBarrier.p);
    terminalInstances.set(existing.instanceId, existing);
    nextInstanceId = 2;
    const operation = contribution.ensureTerminal(firstCwd, false, firstSession);
    await tick();
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    await cwdBarrier.complete();
    const result = await operation;
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      disposed: disposedInstances.map((instance) => instance.instanceId),
      remaining: [...terminalInstances.keys()]
    }, {
      result: [],
      disposed: [],
      remaining: [1]
    });
  });
  test("hides (does not dispose) terminals when session is archived", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:archived-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    assert.strictEqual(createdTerminals.length, 1);
    const otherSession = makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(otherSession, void 0);
    await tick();
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({
      sessionId: "test:archived-session",
      isArchived: true,
      worktree: worktreeUri,
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "archived session terminal must be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [1], "archived session terminal should be moved to background");
  });
  test("does not hide or dispose terminals when session is not archived", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:active-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({
      sessionId: "test:active-session",
      isArchived: false,
      worktree: worktreeUri
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0);
    assert.strictEqual(moveToBackgroundCalls.length, 0);
  });
  test("does not log info when an archived session has no tracked terminals", async () => {
    const session = makeAgentSession({
      sessionId: "test:archived-without-terminal",
      isArchived: true,
      worktree: URI.file("/worktree"),
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.deepStrictEqual(logService.infos, []);
  });
  test("does not hide or dispose terminals when archived session has no worktree", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:active-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({ sessionId: "test:archived-session", isArchived: true });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0);
    assert.strictEqual(moveToBackgroundCalls.length, 0);
  });
  test("hides terminals when archived session has only a repository (no worktree)", async () => {
    const repoUri = URI.file("/repo");
    const session = makeAgentSession({ sessionId: "test:repo-session", repository: repoUri, providerType: AgentSessionProviders.Background, isArchived: false });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
    const otherSession = makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(otherSession, void 0);
    await tick();
    moveToBackgroundCalls.length = 0;
    const archivedSession = makeAgentSession({ sessionId: "test:repo-session", repository: repoUri, providerType: AgentSessionProviders.Background, isArchived: true });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "archived repo-only session terminal must be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [1]);
  });
  test("does not hide the terminal at the active session cwd when archiving (just-opened terminal is protected)", async () => {
    const worktreeUri = URI.file("/worktree");
    const activeSession = makeAgentSession({ sessionId: "test:active-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(activeSession, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    moveToBackgroundCalls.length = 0;
    const archivedSession = makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "terminal at the active session cwd must not be disposed");
    assert.strictEqual(moveToBackgroundCalls.length, 0, "terminal at the active session cwd must not be hidden");
  });
  test("does not re-hide a newly-opened terminal when an already-archived session is re-emitted", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    const archivedSession = makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0);
    assert.deepStrictEqual(moveToBackgroundCalls, [1]);
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:later-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    activeInstanceId = 2;
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "re-emitted archived session must not dispose any terminal");
    assert.strictEqual(moveToBackgroundCalls.length, 0, "re-emitted archived session must not re-hide the newly-opened terminal");
  });
  test("does not hide terminals for a session that was already archived when the contribution started", async () => {
    const worktreeUri = URI.file("/worktree");
    const archivedSession = makeAgentSession({ sessionId: "test:restored-archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    allSessions = [archivedSession];
    contribution.dispose();
    const freshContribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
    await freshContribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:restored-archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await freshContribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "already-archived session must not dispose any terminal");
    assert.strictEqual(moveToBackgroundCalls.length, 0, "already-archived session must not be treated as a fresh archive transition");
  });
  test("closes terminals when a non-focused session is removed", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:removed-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    assert.strictEqual(createdTerminals.length, 2);
    const session = makeAgentSession({ sessionId: "test:removed-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 1);
  });
  test("does not log info when a removed session has no tracked terminals", async () => {
    const session = makeAgentSession({
      sessionId: "test:removed-without-terminal",
      worktree: URI.file("/worktree"),
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
    await tick();
    assert.deepStrictEqual(logService.infos, []);
  });
  test("does not dispose the focused terminal when its session is removed (graduation case)", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    assert.strictEqual(createdTerminals.length, 1);
    const skeleton = makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    onDidChangeSessions.fire({ added: [], removed: [skeleton], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "the focused terminal must not be disposed on graduation");
  });
  test("closes only the removed session terminal when sessions share a cwd", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:committed", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const fromSession = makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    const toSession = makeAgentSession({ sessionId: "test:committed", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    allSessions = [toSession];
    onDidChangeSessions.fire({ added: [], removed: [fromSession], changed: [toSession] });
    await tick();
    assert.deepStrictEqual(disposedInstances.map((instance) => instance.instanceId), [1], "only the removed session terminal should be closed");
    assert.ok(terminalInstances.has(2), "the surviving session terminal should remain");
  });
  test("hides only the archived session terminal when sessions share a cwd", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:live", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const liveSession = makeAgentSession({ sessionId: "test:live", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    const archivedSession = makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    allSessions = [liveSession, archivedSession];
    activeSessionObs.set(liveSession, void 0);
    await tick();
    activeInstanceId = 1;
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "terminal should be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [2], "only the archived session terminal should be hidden");
  });
  test("closes terminal when the only session at a cwd is removed even if other live sessions exist elsewhere", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:gone", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const otherLive = makeAgentSession({ sessionId: "test:other", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    const removedSession = makeAgentSession({ sessionId: "test:gone", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    allSessions = [otherLive];
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 1, "no live session owns this cwd, terminal should be closed");
  });
  test("switching back to a previously used background path reuses the existing terminal", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2, "should reuse the terminal for cwd1");
  });
  test("hides terminals from previous session when switching to a new session", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(moveToBackgroundCalls.includes(1), "terminal for cwd1 should be backgrounded");
    assert.ok(backgroundedInstances.has(1), "terminal for cwd1 should remain backgrounded");
  });
  test("shows previously hidden terminals when switching back to their session", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(showBackgroundCalls.includes(1), "terminal for cwd1 should be shown");
    assert.ok(!backgroundedInstances.has(1), "terminal for cwd1 should be foreground");
    assert.ok(backgroundedInstances.has(2), "terminal for cwd2 should be backgrounded");
  });
  test("only terminals of the active session are visible after multiple switches", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    const cwd3 = URI.file("/cwd3");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-3", worktree: cwd3, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(backgroundedInstances.has(1), "terminal for cwd1 should be backgrounded");
    assert.ok(backgroundedInstances.has(2), "terminal for cwd2 should be backgrounded");
    assert.ok(!backgroundedInstances.has(3), "terminal for cwd3 should be foreground");
  });
  test("shows pre-existing terminal with matching cwd instead of creating a new one", async () => {
    const cwd = URI.file("/worktree");
    const existingInstance = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(existingInstance.instanceId, existingInstance);
    backgroundedInstances.add(existingInstance.instanceId);
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 0, "should reuse existing terminal, not create a new one");
    assert.ok(showBackgroundCalls.includes(existingInstance.instanceId), "should show the existing terminal");
  });
  test("does not background a restored terminal that is disposed before cwd resolves", async () => {
    let resolveInitialCwd;
    const restoredInstance = makeTerminalInstance(nextInstanceId++, "/restored");
    restoredInstance._testSetShellLaunchConfig({ attachPersistentProcess: {} });
    restoredInstance.getInitialCwd = () => new Promise((resolve) => {
      resolveInitialCwd = resolve;
    });
    terminalInstances.set(restoredInstance.instanceId, restoredInstance);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:active-session", worktree: URI.file("/active"), providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    onDidCreateInstance.fire(restoredInstance);
    restoredInstance._testSetDisposed(true);
    terminalInstances.delete(restoredInstance.instanceId);
    resolveInitialCwd?.("/other");
    await tick();
    assert.ok(!moveToBackgroundCalls.includes(restoredInstance.instanceId), "disposed restored terminal should not be backgrounded");
    assert.ok(logService.traces.some((message) => message.includes("Cannot hide restored terminal for /other; terminal") && message.includes("is no longer available")));
  });
  test("hides pre-existing terminal with non-matching cwd when session changes", async () => {
    const otherInstance = makeTerminalInstance(nextInstanceId++, "/other/path");
    terminalInstances.set(otherInstance.instanceId, otherInstance);
    const cwd = URI.file("/worktree");
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(moveToBackgroundCalls.includes(otherInstance.instanceId), "non-matching terminal should be backgrounded");
  });
  test("ensureTerminal finds a backgrounded terminal instead of creating a new one", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, false);
    const instanceId = activeInstanceSet[0];
    backgroundedInstances.add(instanceId);
    const result = await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1, "should not create a new terminal");
    assert.strictEqual(result[0].instanceId, instanceId, "should return the existing backgrounded terminal");
  });
  test("does not reuse an untracked cwd match when it is already tracked to another session", async () => {
    const cwd = URI.file("/shared");
    const session1 = makeAgentSession({ sessionId: "test:session-1", worktree: cwd, providerType: AgentSessionProviders.Background });
    const session2 = makeAgentSession({ sessionId: "test:session-2", worktree: cwd, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session1, void 0);
    await tick();
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.deepStrictEqual(createdTerminals.map((terminal) => terminal.cwd.fsPath), [cwd.fsPath, cwd.fsPath]);
    assert.ok(backgroundedInstances.has(1), "the first session terminal should be backgrounded");
    assert.ok(!backgroundedInstances.has(2), "the second session terminal should stay visible");
  });
  test("visibility is determined by tracked session terminals when sessions share a cwd", async () => {
    const cwd = URI.file("/cwd");
    const session1 = makeAgentSession({ sessionId: "test:session-1", worktree: cwd, providerType: AgentSessionProviders.Background });
    const session2 = makeAgentSession({ sessionId: "test:session-2", worktree: cwd, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session1, void 0);
    await tick();
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.ok(backgroundedInstances.has(1), "session 1 terminal should be backgrounded when session 2 is active");
    assert.ok(!backgroundedInstances.has(2), "session 2 terminal should be foreground");
    activeSessionObs.set(session1, void 0);
    await tick();
    assert.ok(!backgroundedInstances.has(1), "session 1 terminal should be shown again when reactivated");
    assert.ok(backgroundedInstances.has(2), "session 2 terminal should be backgrounded when session 1 is active");
  });
  test("sets the terminal with the most recent command as active after visibility update", async () => {
    const cwd = URI.file("/worktree");
    const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(t1.instanceId, t1);
    terminalInstances.set(t2.instanceId, t2);
    addCommandToInstance(t1, 100);
    addCommandToInstance(t2, 200);
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(activeInstanceSet.at(-1), t2.instanceId, "should set the terminal with the most recent command as active");
  });
  test("does not change active instance when no terminals have command history", async () => {
    const cwd = URI.file("/worktree");
    const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(t1.instanceId, t1);
    terminalInstances.set(t2.instanceId, t2);
    const activeCountBefore = activeInstanceSet.length;
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(activeInstanceSet.length, activeCountBefore, "should not call setActiveInstance when no command history exists");
  });
  test("uses the unwrapped repository path for a background session with a remote agent host repository", async () => {
    const remoteRepoUri = toAgentHostUri(URI.file("/Users/user/repo"), "my-server");
    const session = makeAgentSession({ repository: remoteRepoUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1, "should create a terminal at the unwrapped repository path");
    assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file("/Users/user/repo").fsPath);
  });
  test("does not hide hidden tool terminals when session is archived", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:regular-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const toolTerminal = makeTerminalInstance(nextInstanceId++, worktreeUri.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    const otherSession = makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(otherSession, void 0);
    await tick();
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({
      sessionId: "test:regular-session",
      isArchived: true,
      worktree: worktreeUri,
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "archived session terminal must be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [1], "only the regular terminal should be hidden, not the tool terminal");
  });
  test("does not dispose hidden tool terminals when session is removed", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:regular-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const toolTerminal = makeTerminalInstance(nextInstanceId++, worktreeUri.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    const session = makeAgentSession({ sessionId: "test:regular-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 1, "should dispose exactly one terminal");
    assert.notStrictEqual(disposedInstances[0].instanceId, toolTerminal.instanceId, "should not dispose the tool terminal");
  });
  test("does not background hidden tool terminals during session switch", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    const toolTerminal = makeTerminalInstance(nextInstanceId++, cwd1.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(!moveToBackgroundCalls.includes(toolTerminal.instanceId), "hidden tool terminal should not be moved to background");
  });
  test("does not include hidden tool terminals in ensureTerminal matches", async () => {
    const cwd = URI.file("/worktree");
    const toolTerminal = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1, "should create a new terminal since tool terminal is hidden");
  });
  test("does not hide restored hidden tool terminals on session create", async () => {
    activeSessionObs.set(makeAgentSession({ sessionId: "test:active-session", worktree: URI.file("/active"), providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    const toolTerminal = makeTerminalInstance(nextInstanceId++, "/other");
    toolTerminal._testSetShellLaunchConfig({
      hideFromUser: true,
      attachPersistentProcess: {}
    });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    onDidCreateInstance.fire(toolTerminal);
    await tick();
    assert.ok(!moveToBackgroundCalls.includes(toolTerminal.instanceId), "hidden tool terminal should not be moved to background on restore");
  });
  test("transfers tracked terminals when a session is replaced (graduation)", async () => {
    const worktreeUri = URI.file("/worktree");
    const untitledSession = makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    const committedSession = makeAgentSession({ sessionId: "test:committed", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    await contribution.ensureTerminal(worktreeUri, false, untitledSession);
    assert.strictEqual(createdTerminals.length, 1);
    const terminalId = [...terminalInstances.keys()][0];
    onDidReplaceSession.fire({ from: untitledSession, to: committedSession });
    activeInstanceId = void 0;
    onDidChangeSessions.fire({ added: [], removed: [untitledSession], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "terminal should survive graduation because tracking was transferred");
    assert.ok(terminalInstances.has(terminalId), "terminal should still exist");
    const result = await contribution.ensureTerminal(worktreeUri, false, committedSession);
    assert.strictEqual(createdTerminals.length, 1, "should reuse the transferred terminal");
    assert.strictEqual(result[0].instanceId, terminalId);
  });
  test("cleans up tracked terminal ids when terminals are externally disposed", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ sessionId: "test:session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    await contribution.ensureTerminal(worktreeUri, false, session);
    assert.strictEqual(createdTerminals.length, 1);
    const instance = [...terminalInstances.values()][0];
    instance._testSetDisposed(true);
    terminalInstances.delete(instance.instanceId);
    onDidDisposeInstance.fire(instance);
    const result = await contribution.ensureTerminal(worktreeUri, false, session);
    assert.strictEqual(createdTerminals.length, 2, "should create a new terminal since the tracked one was disposed");
    assert.notStrictEqual(result[0].instanceId, instance.instanceId, "should be a different terminal");
  });
  test("untracked restored terminals are visible alongside tracked terminals for the same session", async () => {
    const cwd = URI.file("/worktree");
    const session = makeAgentSession({ sessionId: "test:session", worktree: cwd, providerType: AgentSessionProviders.Background });
    const restoredTerminal = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(restoredTerminal.instanceId, restoredTerminal);
    backgroundedInstances.add(restoredTerminal.instanceId);
    activeSessionObs.set(session, void 0);
    await tick();
    assert.ok(showBackgroundCalls.includes(restoredTerminal.instanceId), "untracked restored terminal at matching cwd should be shown");
  });
});
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvdGVybWluYWwvdGVzdC9icm93c2VyL3Nlc3Npb25zVGVybWluYWxDb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zLCBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgSUNoYXQsIElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbmNvbnN0IEhPTUVfRElSID0gVVJJLmZpbGUoJy9ob21lL3VzZXInKTtcblxuY2xhc3MgVGVzdExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IGluZm9zOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSB0cmFjZXM6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgaW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuaW5mb3MucHVzaChbbWVzc2FnZSwgLi4uYXJnc10uam9pbignICcpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZXMucHVzaChbbWVzc2FnZSwgLi4uYXJnc10uam9pbignICcpKTtcblx0fVxufVxuXG50eXBlIFRlc3RUZXJtaW5hbEluc3RhbmNlID0gSVRlcm1pbmFsSW5zdGFuY2UgJiB7XG5cdF90ZXN0Q29tbWFuZEhpc3Rvcnk6IHsgdGltZXN0YW1wOiBudW1iZXIgfVtdO1xuXHRfdGVzdFNldERpc3Bvc2VkKGRpc3Bvc2VkOiBib29sZWFuKTogdm9pZDtcblx0X3Rlc3RTZXRJbml0aWFsQ3dkQmFycmllcihiYXJyaWVyOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkKTogdm9pZDtcblx0X3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyhzaGVsbExhdW5jaENvbmZpZzogSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pOiB2b2lkO1xufTtcblxudHlwZSBUZXN0QWN0aXZlU2Vzc2lvbiA9IElBY3RpdmVTZXNzaW9uICYge1xuXHRsb2FkaW5nOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4+O1xufTtcblxuZnVuY3Rpb24gbWFrZUFnZW50U2Vzc2lvbihvcHRzOiB7XG5cdHJlcG9zaXRvcnk/OiBVUkk7XG5cdHdvcmt0cmVlPzogVVJJO1xuXHRwcm92aWRlclR5cGU/OiBzdHJpbmc7XG5cdGlzQXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRsb2FkaW5nPzogYm9vbGVhbjtcblx0c2Vzc2lvbklkPzogc3RyaW5nO1xuXHRwcm92aWRlcklkPzogc3RyaW5nO1xufSk6IFRlc3RBY3RpdmVTZXNzaW9uIHtcblx0Y29uc3QgZm9sZGVyID0gb3B0cy5yZXBvc2l0b3J5IHx8IG9wdHMud29ya3RyZWUgPyB7XG5cdFx0cm9vdDogb3B0cy5yZXBvc2l0b3J5ID8/IG9wdHMud29ya3RyZWUhLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IG9wdHMud29ya3RyZWUgPz8gb3B0cy5yZXBvc2l0b3J5ISxcblx0XHRuYW1lOiAndGVzdCcsXG5cdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaTogb3B0cy5yZXBvc2l0b3J5ID8/IG9wdHMud29ya3RyZWUhLCB3b3JrVHJlZVVyaTogb3B0cy53b3JrdHJlZSwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0fSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgY2hhdDogSUNoYXQgPSB7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9zZXNzaW9uJyksXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QudGl0bGUnLCAnVGVzdCBTZXNzaW9uJyksXG5cdFx0dXBkYXRlZEF0OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QudXBkYXRlZEF0JywgbmV3IERhdGUoKSksXG5cdFx0c3RhdHVzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3Quc3RhdHVzJywgMCksXG5cdFx0Y2hhbmdlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmNoYW5nZXMnLCBbXSksXG5cdFx0bW9kZWxJZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lm1vZGVsSWQnLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5tb2RlJywgdW5kZWZpbmVkKSxcblx0XHRpc0FyY2hpdmVkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNBcmNoaXZlZCcsIG9wdHMuaXNBcmNoaXZlZCA/PyBmYWxzZSksXG5cdFx0aXNSZWFkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNSZWFkJywgdHJ1ZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmludGVyYWN0aXZpdHknLCBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmNoZWNrcG9pbnRzJywgdW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lmxhc3RUdXJuRW5kJywgdW5kZWZpbmVkKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmRlc2NyaXB0aW9uJywgdW5kZWZpbmVkKSxcblx0fSBzYXRpc2ZpZXMgSUNoYXQ7XG5cdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0c2Vzc2lvbklkOiBvcHRzLnNlc3Npb25JZCA/PyAndGVzdDpzZXNzaW9uJyxcblx0XHRyZXNvdXJjZTogY2hhdC5yZXNvdXJjZSxcblx0XHRwcm92aWRlcklkOiBvcHRzLnByb3ZpZGVySWQgPz8gJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiBvcHRzLnByb3ZpZGVyVHlwZSA/PyBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRcdGNyZWF0ZWRBdDogY2hhdC5jcmVhdGVkQXQsXG5cdFx0d29ya3NwYWNlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3Qud29ya3NwYWNlJywgZm9sZGVyXG5cdFx0XHQ/IHtcblx0XHRcdFx0dXJpOiBmb2xkZXIucm9vdCxcblx0XHRcdFx0bGFiZWw6ICd0ZXN0Jyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2Vcblx0XHRcdH0gc2F0aXNmaWVzIElTZXNzaW9uV29ya3NwYWNlXG5cdFx0XHQ6IHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0dXBkYXRlZEF0OiBjaGF0LnVwZGF0ZWRBdCxcblx0XHRzdGF0dXM6IGNoYXQuc3RhdHVzLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY2hhdC5jaGFuZ2VzLFxuXHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmxvYWRpbmcnLCBvcHRzLmxvYWRpbmcgPz8gZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IGNoYXQuaXNBcmNoaXZlZCxcblx0XHRpc1JlYWQ6IGNoYXQuaXNSZWFkLFxuXHRcdGxhc3RUdXJuRW5kOiBjaGF0Lmxhc3RUdXJuRW5kLFxuXHRcdGRlc2NyaXB0aW9uOiBjaGF0LmRlc2NyaXB0aW9uLFxuXHRcdGNoYXRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuY2hhdHMnLCBbY2hhdF0pLFxuXHRcdGFjdGl2ZUNoYXQ6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5hY3RpdmVDaGF0JywgY2hhdCksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdFx0aXNDcmVhdGVkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNDcmVhdGVkJywgdHJ1ZSksXG5cdFx0c3RpY2t5OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3Quc3RpY2t5JywgZmFsc2UpLFxuXHRcdG9wZW5DaGF0czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lm9wZW5DaGF0cycsIFtjaGF0XSksXG5cdFx0Y2xvc2VkQ2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0bGFzdENsb3NlZENoYXQ6IHVuZGVmaW5lZCxcblx0XHR2aXNpYmxlQ2hhdFRhYnM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdHNob3VsZFNob3dDaGF0VGFiczogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0fSBzYXRpc2ZpZXMgVGVzdEFjdGl2ZVNlc3Npb247XG5cdHJldHVybiBzZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWtlTm9uQWdlbnRTZXNzaW9uKG9wdHM6IHsgcmVwb3NpdG9yeT86IFVSSTsgd29ya3RyZWU/OiBVUkk7IHByb3ZpZGVyVHlwZT86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH0pOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IGZvbGRlciA9IG9wdHMucmVwb3NpdG9yeSB8fCBvcHRzLndvcmt0cmVlID8ge1xuXHRcdHJvb3Q6IG9wdHMucmVwb3NpdG9yeSA/PyBvcHRzLndvcmt0cmVlISxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBvcHRzLndvcmt0cmVlID8/IG9wdHMucmVwb3NpdG9yeSEsXG5cdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmk6IG9wdHMucmVwb3NpdG9yeSA/PyBvcHRzLndvcmt0cmVlISwgd29ya1RyZWVVcmk6IG9wdHMud29ya3RyZWUsIGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsIGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0sXG5cdH0gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNoYXQ6IElDaGF0ID0ge1xuXHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vzc2lvbicpLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0XHR0aXRsZTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LnRpdGxlJywgJ1Rlc3QgU2Vzc2lvbicpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LnVwZGF0ZWRBdCcsIG5ldyBEYXRlKCkpLFxuXHRcdHN0YXR1czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LnN0YXR1cycsIDApLFxuXHRcdGNoYW5nZXM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5jaGFuZ2VzJywgW10pLFxuXHRcdG1vZGVsSWQ6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5tb2RlbElkJywgdW5kZWZpbmVkKSxcblx0XHRtb2RlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QubW9kZScsIHVuZGVmaW5lZCksXG5cdFx0aXNBcmNoaXZlZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmlzQXJjaGl2ZWQnLCBmYWxzZSksXG5cdFx0aXNSZWFkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNSZWFkJywgdHJ1ZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmludGVyYWN0aXZpdHknLCBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmNoZWNrcG9pbnRzJywgdW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lmxhc3RUdXJuRW5kJywgdW5kZWZpbmVkKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmRlc2NyaXB0aW9uJywgdW5kZWZpbmVkKSxcblx0fSBzYXRpc2ZpZXMgSUNoYXQ7XG5cdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0c2Vzc2lvbklkOiBvcHRzLnNlc3Npb25JZCA/PyAndGVzdDpub24tYWdlbnQnLFxuXHRcdHJlc291cmNlOiBjaGF0LnJlc291cmNlLFxuXHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRzZXNzaW9uVHlwZTogb3B0cy5wcm92aWRlclR5cGUgPz8gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdGljb246IENvZGljb24uY29waWxvdCxcblx0XHRjcmVhdGVkQXQ6IGNoYXQuY3JlYXRlZEF0LFxuXHRcdHdvcmtzcGFjZTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LndvcmtzcGFjZScsIGZvbGRlclxuXHRcdFx0PyB7XG5cdFx0XHRcdHVyaTogZm9sZGVyLnJvb3QsXG5cdFx0XHRcdGxhYmVsOiAndGVzdCcsXG5cdFx0XHRcdGljb246IENvZGljb24ucmVwbyxcblx0XHRcdFx0Zm9sZGVyczogW2ZvbGRlcl0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0fSBhcyBJU2Vzc2lvbldvcmtzcGFjZSA6IHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0dXBkYXRlZEF0OiBjaGF0LnVwZGF0ZWRBdCxcblx0XHRzdGF0dXM6IGNoYXQuc3RhdHVzLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY2hhdC5jaGFuZ2VzLFxuXHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmxvYWRpbmcnLCBmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY2hhdC5pc0FyY2hpdmVkLFxuXHRcdGlzUmVhZDogY2hhdC5pc1JlYWQsXG5cdFx0bGFzdFR1cm5FbmQ6IGNoYXQubGFzdFR1cm5FbmQsXG5cdFx0ZGVzY3JpcHRpb246IGNoYXQuZGVzY3JpcHRpb24sXG5cdFx0Y2hhdHM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5jaGF0cycsIFtjaGF0XSksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH0gc2F0aXNmaWVzIElTZXNzaW9uO1xuXHRyZXR1cm4gc2Vzc2lvbjtcbn1cblxuZnVuY3Rpb24gbWFrZVRlcm1pbmFsSW5zdGFuY2UoaWQ6IG51bWJlciwgY3dkOiBzdHJpbmcpOiBUZXN0VGVybWluYWxJbnN0YW5jZSB7XG5cdGNvbnN0IGNvbW1hbmRIaXN0b3J5OiB7IHRpbWVzdGFtcDogbnVtYmVyIH1bXSA9IFtdO1xuXHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRsZXQgaW5pdGlhbEN3ZEJhcnJpZXI6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdGxldCBzaGVsbExhdW5jaENvbmZpZzogSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10gPSB7fSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXTtcblx0Y29uc3QgY2FwYWJpbGl0aWVzID0ge1xuXHRcdGdldChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkge1xuXHRcdFx0aWYgKGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gJiYgY29tbWFuZEhpc3RvcnkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb21tYW5kczogY29tbWFuZEhpc3RvcnkgfSBhcyB1bmtub3duIGFzIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9IGFzIElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZTtcblxuXHRyZXR1cm4ge1xuXHRcdGluc3RhbmNlSWQ6IGlkLFxuXHRcdGdldCBpc0Rpc3Bvc2VkKCkgeyByZXR1cm4gaXNEaXNwb3NlZDsgfSxcblx0XHRnZXQgc2hlbGxMYXVuY2hDb25maWcoKSB7IHJldHVybiBzaGVsbExhdW5jaENvbmZpZzsgfSxcblx0XHRhc3luYyBnZXRJbml0aWFsQ3dkKCkge1xuXHRcdFx0YXdhaXQgaW5pdGlhbEN3ZEJhcnJpZXI7XG5cdFx0XHRyZXR1cm4gY3dkO1xuXHRcdH0sXG5cdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdF90ZXN0Q29tbWFuZEhpc3Rvcnk6IGNvbW1hbmRIaXN0b3J5LFxuXHRcdF90ZXN0U2V0RGlzcG9zZWQoZGlzcG9zZWQ6IGJvb2xlYW4pIHtcblx0XHRcdGlzRGlzcG9zZWQgPSBkaXNwb3NlZDtcblx0XHR9LFxuXHRcdF90ZXN0U2V0SW5pdGlhbEN3ZEJhcnJpZXIoYmFycmllcjogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCkge1xuXHRcdFx0aW5pdGlhbEN3ZEJhcnJpZXIgPSBiYXJyaWVyO1xuXHRcdH0sXG5cdFx0X3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyh2YWx1ZTogSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnID0gdmFsdWU7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIFRlc3RUZXJtaW5hbEluc3RhbmNlO1xufVxuXG5mdW5jdGlvbiBhZGRDb21tYW5kVG9JbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG5cdChpbnN0YW5jZSBhcyBUZXN0VGVybWluYWxJbnN0YW5jZSkuX3Rlc3RDb21tYW5kSGlzdG9yeS5wdXNoKHsgdGltZXN0YW1wIH0pO1xufVxuXG5zdWl0ZSgnU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBjb250cmlidXRpb246IFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb247XG5cdGxldCBhY3RpdmVTZXNzaW9uT2JzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+Pjtcblx0bGV0IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXHRsZXQgb25EaWRSZXBsYWNlU2Vzc2lvbjogRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT47XG5cdGxldCBvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb246IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+O1xuXHRsZXQgb25EaWRDcmVhdGVJbnN0YW5jZTogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT47XG5cdGxldCBvbkRpZERpc3Bvc2VJbnN0YW5jZTogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT47XG5cblx0bGV0IGNyZWF0ZWRUZXJtaW5hbHM6IHsgY3dkOiBVUkkgfVtdO1xuXHRsZXQgYWdlbnRIb3N0VGVybWluYWxBZGRyZXNzZXM6IHN0cmluZ1tdO1xuXHRsZXQgdGVybWluYWxDcmVhdGlvbkJhcnJpZXJzOiBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8dm9pZD4+O1xuXHRsZXQgdGVybWluYWxDcmVhdGlvblN0YXJ0ZWQ6IHN0cmluZ1tdO1xuXHRsZXQgYWN0aXZlSW5zdGFuY2VTZXQ6IG51bWJlcltdO1xuXHRsZXQgYWN0aXZlSW5zdGFuY2VJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRsZXQgZm9jdXNDYWxsczogbnVtYmVyO1xuXHRsZXQgZGlzcG9zZWRJbnN0YW5jZXM6IElUZXJtaW5hbEluc3RhbmNlW107XG5cdGxldCBuZXh0SW5zdGFuY2VJZDogbnVtYmVyO1xuXHRsZXQgdGVybWluYWxJbnN0YW5jZXM6IE1hcDxudW1iZXIsIElUZXJtaW5hbEluc3RhbmNlPjtcblx0bGV0IGJhY2tncm91bmRlZEluc3RhbmNlczogU2V0PG51bWJlcj47XG5cdGxldCBtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHM6IG51bWJlcltdO1xuXHRsZXQgc2hvd0JhY2tncm91bmRDYWxsczogbnVtYmVyW107XG5cdGxldCBkaXNwb3NlT25DcmVhdGVQYXRoczogU2V0PHN0cmluZz47XG5cdGxldCBkZWZhdWx0Q3dkQ2FsbHM6IChVUkkgfCB1bmRlZmluZWQpW107XG5cdGxldCBsb2dTZXJ2aWNlOiBUZXN0TG9nU2VydmljZTtcblx0bGV0IGFsbFNlc3Npb25zOiBJU2Vzc2lvbltdO1xuXHRsZXQgc2Vzc2lvblByb3ZpZGVyczogTWFwPHN0cmluZywgSVNlc3Npb25zUHJvdmlkZXI+O1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y3JlYXRlZFRlcm1pbmFscyA9IFtdO1xuXHRcdGFnZW50SG9zdFRlcm1pbmFsQWRkcmVzc2VzID0gW107XG5cdFx0dGVybWluYWxDcmVhdGlvbkJhcnJpZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRlcm1pbmFsQ3JlYXRpb25TdGFydGVkID0gW107XG5cdFx0YWN0aXZlSW5zdGFuY2VTZXQgPSBbXTtcblx0XHRhY3RpdmVJbnN0YW5jZUlkID0gdW5kZWZpbmVkO1xuXHRcdGZvY3VzQ2FsbHMgPSAwO1xuXHRcdGRpc3Bvc2VkSW5zdGFuY2VzID0gW107XG5cdFx0bmV4dEluc3RhbmNlSWQgPSAxO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzID0gbmV3IE1hcCgpO1xuXHRcdGJhY2tncm91bmRlZEluc3RhbmNlcyA9IG5ldyBTZXQoKTtcblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93QmFja2dyb3VuZENhbGxzID0gW107XG5cdFx0ZGlzcG9zZU9uQ3JlYXRlUGF0aHMgPSBuZXcgU2V0KCk7XG5cdFx0ZGVmYXVsdEN3ZENhbGxzID0gW107XG5cdFx0bG9nU2VydmljZSA9IG5ldyBUZXN0TG9nU2VydmljZSgpO1xuXHRcdGFsbFNlc3Npb25zID0gW107XG5cdFx0c2Vzc2lvblByb3ZpZGVycyA9IG5ldyBNYXAoKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKSk7XG5cdFx0b25EaWRSZXBsYWNlU2Vzc2lvbiA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4oKSk7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0XHRvbkRpZENyZWF0ZUluc3RhbmNlID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0XHRvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uID0gb25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbiA9IG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5ldmVudDtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gWy4uLmFsbFNlc3Npb25zXTsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBhY3RpdmVTZXNzaW9uT2JzO1xuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXJtaW5hbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDcmVhdGVJbnN0YW5jZSA9IG9uRGlkQ3JlYXRlSW5zdGFuY2UuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IG9uRGlkRGlzcG9zZUluc3RhbmNlLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IGluc3RhbmNlcygpOiByZWFkb25seSBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRcdFx0cmV0dXJuIFsuLi50ZXJtaW5hbEluc3RhbmNlcy52YWx1ZXMoKV07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXQgZm9yZWdyb3VuZEluc3RhbmNlcygpOiByZWFkb25seSBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRcdFx0cmV0dXJuIFsuLi50ZXJtaW5hbEluc3RhbmNlcy52YWx1ZXMoKV0uZmlsdGVyKGkgPT4gIWJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoaS5pbnN0YW5jZUlkKSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlSW5zdGFuY2UoKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gYWN0aXZlSW5zdGFuY2VJZCAhPT0gdW5kZWZpbmVkID8gdGVybWluYWxJbnN0YW5jZXMuZ2V0KGFjdGl2ZUluc3RhbmNlSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlVGVybWluYWwob3B0cz86IGFueSk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRcdFx0Y29uc3QgY3dkVXJpOiBVUkkgfCB1bmRlZmluZWQgPSBvcHRzPy5jb25maWc/LmN3ZDtcblx0XHRcdFx0Y29uc3QgY3dkU3RyID0gY3dkVXJpPy5mc1BhdGggPz8gJyc7XG5cdFx0XHRcdHRlcm1pbmFsQ3JlYXRpb25TdGFydGVkLnB1c2goY3dkU3RyKTtcblx0XHRcdFx0YXdhaXQgdGVybWluYWxDcmVhdGlvbkJhcnJpZXJzLmdldChjd2RTdHIpPy5wO1xuXHRcdFx0XHRjb25zdCBpZCA9IG5leHRJbnN0YW5jZUlkKys7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UoaWQsIGN3ZFN0cik7XG5cdFx0XHRcdGNyZWF0ZWRUZXJtaW5hbHMucHVzaCh7IGN3ZDogb3B0cz8uY29uZmlnPy5jd2QgfSk7XG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldChpZCwgaW5zdGFuY2UpO1xuXHRcdFx0XHRpZiAoZGlzcG9zZU9uQ3JlYXRlUGF0aHMuaGFzKGN3ZFN0cikpIHtcblx0XHRcdFx0XHRpbnN0YW5jZS5fdGVzdFNldERpc3Bvc2VkKHRydWUpO1xuXHRcdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2VzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0SW5zdGFuY2VGcm9tSWQoaWQ6IG51bWJlcik6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHRlcm1pbmFsSW5zdGFuY2VzLmdldChpZCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRcdFx0YWN0aXZlSW5zdGFuY2VTZXQucHVzaChpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRcdFx0YWN0aXZlSW5zdGFuY2VJZCA9IGluc3RhbmNlLmluc3RhbmNlSWQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBmb2N1c0FjdGl2ZUluc3RhbmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRmb2N1c0NhbGxzKys7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzYWZlRGlzcG9zZVRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRkaXNwb3NlZEluc3RhbmNlcy5wdXNoKGluc3RhbmNlKTtcblx0XHRcdFx0KGluc3RhbmNlIGFzIFRlc3RUZXJtaW5hbEluc3RhbmNlKS5fdGVzdFNldERpc3Bvc2VkKHRydWUpO1xuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlcy5kZWxldGUoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHRcdGJhY2tncm91bmRlZEluc3RhbmNlcy5kZWxldGUoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHRcdGlmIChhY3RpdmVJbnN0YW5jZUlkID09PSBpbnN0YW5jZS5pbnN0YW5jZUlkKSB7XG5cdFx0XHRcdFx0YWN0aXZlSW5zdGFuY2VJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgbW92ZVRvQmFja2dyb3VuZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRcdFx0YmFja2dyb3VuZGVkSW5zdGFuY2VzLmFkZChpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRcdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLnB1c2goaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzaG93QmFja2dyb3VuZFRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuZGVsZXRlKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdFx0XHRzaG93QmFja2dyb3VuZENhbGxzLnB1c2goaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQYXRoU2VydmljZSwgbmV3IFRlc3RQYXRoU2VydmljZShIT01FX0RJUikpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvZmlsZXMgPSBjb25zdE9ic2VydmFibGU8bmV2ZXJbXT4oW10pO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0UHJvZmlsZUZvckNvbm5lY3Rpb24oKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdG92ZXJyaWRlIHNldERlZmF1bHRDd2QoY3dkOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHsgZGVmYXVsdEN3ZENhbGxzLnB1c2goY3dkKTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlVGVybWluYWxGb3JFbnRyeShhZGRyZXNzOiBzdHJpbmcsIG9wdGlvbnM/OiBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRjb25zdCBjd2QgPSB0eXBlb2Ygb3B0aW9ucz8uY3dkID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKG9wdGlvbnMuY3dkKSA6IG9wdGlvbnM/LmN3ZDtcblx0XHRcdFx0aWYgKCFjd2QpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkLmZzUGF0aCk7XG5cdFx0XHRcdGFnZW50SG9zdFRlcm1pbmFsQWRkcmVzc2VzLnB1c2goYWRkcmVzcyk7XG5cdFx0XHRcdGNyZWF0ZWRUZXJtaW5hbHMucHVzaCh7IGN3ZCB9KTtcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlKTtcblx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxQcm9maWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGVybWluYWxQcm9maWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvdmVycmlkZURlZmF1bHRQcm9maWxlKCkgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc1ZpZXdWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+KCkpLmV2ZW50O1xuXHRcdH0pO1xuXG5cdFx0Y29udHJpYnV0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24pKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSBCYWNrZ3JvdW5kIHByb3ZpZGVyOiB1c2VzIHdvcmt0cmVlL3JlcG9zaXRvcnkgcGF0aCAtLS1cblxuXHR0ZXN0KCdjcmVhdGVzIGEgdGVybWluYWwgYXQgdGhlIHdvcmt0cmVlIGZvciBhIGJhY2tncm91bmQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogVVJJLmZpbGUoJy9yZXBvJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcmVwb3NpdG9yeSB3aGVuIHdvcmt0cmVlIGlzIHVuZGVmaW5lZCBmb3IgYSBiYWNrZ3JvdW5kIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb1VyaSA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgcmVwb3NpdG9yeTogcmVwb1VyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgcmVwb1VyaS5mc1BhdGgpO1xuXHR9KTtcblxuXHQvLyAtLS0gQ2xhdWRlIHByb3ZpZGVyOiBhbHNvIHVzZXMgd29ya3RyZWUvcmVwb3NpdG9yeSBwYXRoIC0tLVxuXG5cdHRlc3QoJ2NyZWF0ZXMgYSB0ZXJtaW5hbCBhdCB0aGUgd29ya3RyZWUgZm9yIGEgQ2xhdWRlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHJlcG9zaXRvcnk6IFVSSS5maWxlKCcvcmVwbycpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcmVwb3NpdG9yeSB3aGVuIHdvcmt0cmVlIGlzIHVuZGVmaW5lZCBmb3IgYSBDbGF1ZGUgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXBvVXJpID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyByZXBvc2l0b3J5OiByZXBvVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIHJlcG9VcmkuZnNQYXRoKTtcblx0fSk7XG5cblx0Ly8gLS0tIFdvcmtzcGFjZS1iYWNrZWQgc2Vzc2lvbnM6IHVzZSB3b3JraW5nIGRpcmVjdG9yeSAtLS1cblxuXHR0ZXN0KCd1c2VzIHdvcmt0cmVlIGRpcmVjdG9yeSBmb3IgYSBjbG91ZCBhZ2VudCBzZXNzaW9uIHdoZW4gd29ya3NwYWNlIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiBVUkkuZmlsZSgnL3dvcmt0cmVlJyksIHJlcG9zaXRvcnk6IFVSSS5maWxlKCcvcmVwbycpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgVVJJLmZpbGUoJy93b3JrdHJlZScpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgd29ya3RyZWUgZGlyZWN0b3J5IGZvciBhIGxvY2FsIGFnZW50IHNlc3Npb24gd2hlbiB3b3Jrc3BhY2UgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgd29ya3RyZWU6IFVSSS5maWxlKCcvd29ya3RyZWUnKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIFVSSS5maWxlKCcvd29ya3RyZWUnKS5mc1BhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGhvbWUgZGlyZWN0b3J5IGZvciBhIG5vbi1hZ2VudCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlTm9uQWdlbnRTZXNzaW9uKHsgcmVwb3NpdG9yeTogVVJJLmZpbGUoJy9yZXBvJykgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiBhcyBJQWN0aXZlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIEhPTUVfRElSLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgc2VwYXJhdGUgdGVybWluYWxzIHdoZW4gZGlmZmVyZW50IG5vbi1iYWNrZ3JvdW5kIHNlc3Npb25zIHNoYXJlIHRoZSBob21lIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VBZ2VudFNlc3Npb24oeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgc2Vzc2lvbklkOiAndGVzdDpjbG91ZC0xJyB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZUFnZW50U2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLCBzZXNzaW9uSWQ6ICd0ZXN0OmxvY2FsLTEnIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjcmVhdGUgYSB0ZXJtaW5hbCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYSBsb2FkaW5nIHNlc3Npb24gYmVmb3JlIGNyZWF0aW5nIGEgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGxvYWRpbmc6IHRydWUgfSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMCwgJ3Nob3VsZCBub3QgY3JlYXRlIGEgdGVybWluYWwgd2hpbGUgc2Vzc2lvbiBpcyBsb2FkaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHRDd2RDYWxscy5hdCgtMSksIHVuZGVmaW5lZCwgJ3Nob3VsZCBub3Qgc2V0IHRoZSBkZWZhdWx0IGN3ZCB3aGlsZSBzZXNzaW9uIGlzIGxvYWRpbmcnKTtcblxuXHRcdHNlc3Npb24ubG9hZGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5jd2QuZnNQYXRoLCB3b3JrdHJlZVVyaS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0Q3dkQ2FsbHMuYXQoLTEpPy5mc1BhdGgsIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlY3JlYXRlIHRlcm1pbmFsIGZvciB0aGUgc2FtZSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIG5ldyB0ZXJtaW5hbCB3aGVuIHN3aXRjaGluZyB0byBhIGRpZmZlcmVudCBiYWNrZ3JvdW5kIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWUxID0gVVJJLmZpbGUoJy93b3JrdHJlZTEnKTtcblx0XHRjb25zdCB3b3JrdHJlZTIgPSBVUkkuZmlsZSgnL3dvcmt0cmVlMicpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IHdvcmt0cmVlMSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTInLCB3b3JrdHJlZTogd29ya3RyZWUyLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMV0uY3dkLmZzUGF0aCwgd29ya3RyZWUyLmZzUGF0aCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBlbnN1cmVUZXJtaW5hbCAtLS1cblxuXHR0ZXN0KCdlbnN1cmVUZXJtaW5hbCBjcmVhdGVzIHRlcm1pbmFsIGFuZCBzZXRzIGl0IGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3Rlc3QtY3dkJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5jd2QuZnNQYXRoLCBjd2QuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSW5zdGFuY2VTZXQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9jdXNDYWxscywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVRlcm1pbmFsIGZvY3VzZXMgd2hlbiByZXF1ZXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy90ZXN0LWN3ZCcpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvY3VzQ2FsbHMsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVUZXJtaW5hbCByZXVzZXMgZXhpc3RpbmcgdGVybWluYWwgZm9yIHNhbWUgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3Rlc3QtY3dkJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSwgJ3Nob3VsZCByZXVzZSB0aGUgZXhpc3RpbmcgdGVybWluYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSW5zdGFuY2VTZXQubGVuZ3RoLCAxLCAnc2hvdWxkIG9ubHkgc2V0IGFjdGl2ZSBpbnN0YW5jZSBvbiBjcmVhdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVUZXJtaW5hbCBjcmVhdGVzIG5ldyB0ZXJtaW5hbCBmb3IgZGlmZmVyZW50IHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvY3dkMScpLCBmYWxzZSk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvY3dkMicpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVUZXJtaW5hbCBwYXRoIGNvbXBhcmlzb24gaXMgY2FzZS1pbnNlbnNpdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9UZXN0L0NXRCcpLCBmYWxzZSk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvdGVzdC9jd2QnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxLCAnc2hvdWxkIG1hdGNoIGNhc2UtaW5zZW5zaXRpdmVseScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVUZXJtaW5hbCBkb2VzIG5vdCBhY3RpdmF0ZSBhIHRlcm1pbmFsIGRpc3Bvc2VkIGR1cmluZyBjcmVhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3Rlc3QtY3dkJyk7XG5cdFx0ZGlzcG9zZU9uQ3JlYXRlUGF0aHMuYWRkKGN3ZC5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2VzID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVJbnN0YW5jZVNldC5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayhsb2dTZXJ2aWNlLnRyYWNlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5pbmNsdWRlcyhgQ2Fubm90IGFjdGl2YXRlIGNyZWF0ZWQgdGVybWluYWwgZm9yICR7Y3dkLmZzUGF0aH07IHRlcm1pbmFsIDEgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZWApKSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBuZXctc2Vzc2lvbiBkcmFmdCByZXBsYWNlbWVudCAtLS1cblxuXHR0ZXN0KCdyZXVzZXMgb25lIHRlcm1pbmFsIGFjcm9zcyByZXBlYXRlZCBzYW1lLWN3ZCByZXBsYWNlbWVudCBkcmFmdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdHNlc3Npb25Qcm92aWRlcnMuc2V0KCdhZ2VudGhvc3Qtb25lJywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdhZ2VudGhvc3Qtb25lJztcblx0XHRcdHJlYWRvbmx5IHJlbW90ZUFkZHJlc3MgPSAnc3NoLXJlbW90ZStvbmUnO1xuXHRcdH0pO1xuXHRcdGxldCBjdXJyZW50U2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAndGVzdDpkcmFmdC0xJyxcblx0XHRcdHByb3ZpZGVySWQ6ICdhZ2VudGhvc3Qtb25lJyxcblx0XHRcdHdvcmt0cmVlOiBjd2QsXG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdH0pO1xuXHRcdGNvbnN0IFtmaXJzdFRlcm1pbmFsXSA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlLCBjdXJyZW50U2Vzc2lvbik7XG5cdFx0bGV0IGxhdGVzdFJlc3VsdDogSVRlcm1pbmFsSW5zdGFuY2VbXSA9IFtmaXJzdFRlcm1pbmFsXTtcblxuXHRcdGZvciAobGV0IGkgPSAyOyBpIDw9IDEwOyBpKyspIHtcblx0XHRcdGNvbnN0IG5leHRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogYHRlc3Q6ZHJhZnQtJHtpfWAsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdhZ2VudGhvc3Qtb25lJyxcblx0XHRcdFx0d29ya3RyZWU6IGN3ZCxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCxcblx0XHRcdH0pO1xuXHRcdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBjdXJyZW50U2Vzc2lvbiwgdG86IG5leHRTZXNzaW9uIH0pO1xuXHRcdFx0bGF0ZXN0UmVzdWx0ID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UsIG5leHRTZXNzaW9uKTtcblx0XHRcdGN1cnJlbnRTZXNzaW9uID0gbmV4dFNlc3Npb247XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVkOiBjcmVhdGVkVGVybWluYWxzLmxlbmd0aCxcblx0XHRcdGFnZW50SG9zdEFkZHJlc3NlczogYWdlbnRIb3N0VGVybWluYWxBZGRyZXNzZXMsXG5cdFx0XHR0cmFuc2ZlcnJlZFRlcm1pbmFsSWQ6IGxhdGVzdFJlc3VsdFswXT8uaW5zdGFuY2VJZCxcblx0XHRcdGRpc3Bvc2VkOiBkaXNwb3NlZEluc3RhbmNlcy5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlZDogMSxcblx0XHRcdGFnZW50SG9zdEFkZHJlc3NlczogWydzc2gtcmVtb3RlK29uZSddLFxuXHRcdFx0dHJhbnNmZXJyZWRUZXJtaW5hbElkOiBmaXJzdFRlcm1pbmFsLmluc3RhbmNlSWQsXG5cdFx0XHRkaXNwb3NlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zZmVycyBhbGwgdHJhY2tlZCB0ZXJtaW5hbHMgdG8gYSBzYW1lLWN3ZCByZXBsYWNlbWVudCBkcmFmdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Zmlyc3QtZHJhZnQnLCB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZWNvbmQtZHJhZnQnLCB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IGZpcnN0ID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UoMSwgY3dkLmZzUGF0aCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UoMiwgY3dkLmZzUGF0aCk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KGZpcnN0Lmluc3RhbmNlSWQsIGZpcnN0KTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQoc2Vjb25kLmluc3RhbmNlSWQsIHNlY29uZCk7XG5cdFx0bmV4dEluc3RhbmNlSWQgPSAzO1xuXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UsIGZpcnN0U2Vzc2lvbik7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBmaXJzdFNlc3Npb24sIHRvOiBzZWNvbmRTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlLCBzZWNvbmRTZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiByZXN1bHQubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdFx0Y3JlYXRlZDogY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsXG5cdFx0XHRkaXNwb3NlZDogZGlzcG9zZWRJbnN0YW5jZXMubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogWzEsIDJdLFxuXHRcdFx0Y3JlYXRlZDogMCxcblx0XHRcdGRpc3Bvc2VkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVob21lcyB0ZXJtaW5hbHMgd2hlbiByZXBsYWNlbWVudCBkcmFmdHMgdXNlIGRpZmZlcmVudCBjd2QgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0Q3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZS1vbmUnKTtcblx0XHRjb25zdCBzZWNvbmRDd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlLXR3bycpO1xuXHRcdGNvbnN0IHRoaXJkU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnRoaXJkLWRyYWZ0Jywgd29ya3RyZWU6IGZpcnN0Q3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmZpcnN0LWRyYWZ0Jywgd29ya3RyZWU6IGZpcnN0Q3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZWNvbmQtZHJhZnQnLCB3b3JrdHJlZTogc2Vjb25kQ3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXG5cdFx0Y29uc3QgW2ZpcnN0VGVybWluYWxdID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGZpcnN0Q3dkLCBmYWxzZSwgZmlyc3RTZXNzaW9uKTtcblx0XHRhZGRDb21tYW5kVG9JbnN0YW5jZShmaXJzdFRlcm1pbmFsLCAxMDApO1xuXHRcdG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5maXJlKHsgZnJvbTogZmlyc3RTZXNzaW9uLCB0bzogc2Vjb25kU2Vzc2lvbiB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZWNvbmRTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRjb25zdCBzZWNvbmRUZXJtaW5hbCA9IHRlcm1pbmFsSW5zdGFuY2VzLmdldChhY3RpdmVJbnN0YW5jZUlkISk7XG5cblx0XHRvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZmlyZSh7IGZyb206IHNlY29uZFNlc3Npb24sIHRvOiB0aGlyZFNlc3Npb24gfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQodGhpcmRTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRjb25zdCB0aGlyZFRlcm1pbmFsID0gdGVybWluYWxJbnN0YW5jZXMuZ2V0KGFjdGl2ZUluc3RhbmNlSWQhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlZEN3ZHM6IGNyZWF0ZWRUZXJtaW5hbHMubWFwKHRlcm1pbmFsID0+IHRlcm1pbmFsLmN3ZC5mc1BhdGgpLFxuXHRcdFx0Zmlyc3RTdGlsbEFsaXZlOiB0ZXJtaW5hbEluc3RhbmNlcy5oYXMoZmlyc3RUZXJtaW5hbC5pbnN0YW5jZUlkKSxcblx0XHRcdHNlY29uZFN0aWxsQWxpdmU6IHNlY29uZFRlcm1pbmFsID8gdGVybWluYWxJbnN0YW5jZXMuaGFzKHNlY29uZFRlcm1pbmFsLmluc3RhbmNlSWQpIDogZmFsc2UsXG5cdFx0XHR0aGlyZFRlcm1pbmFsSWQ6IHRoaXJkVGVybWluYWw/Lmluc3RhbmNlSWQsXG5cdFx0XHRhY3RpdmVUZXJtaW5hbElkOiBhY3RpdmVJbnN0YW5jZUlkLFxuXHRcdFx0YmFja2dyb3VuZGVkOiBtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMsXG5cdFx0XHRkaXNwb3NlZDogZGlzcG9zZWRJbnN0YW5jZXMubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZWRDd2RzOiBbZmlyc3RDd2QuZnNQYXRoLCBzZWNvbmRDd2QuZnNQYXRoLCBmaXJzdEN3ZC5mc1BhdGhdLFxuXHRcdFx0Zmlyc3RTdGlsbEFsaXZlOiB0cnVlLFxuXHRcdFx0c2Vjb25kU3RpbGxBbGl2ZTogdHJ1ZSxcblx0XHRcdHRoaXJkVGVybWluYWxJZDogMyxcblx0XHRcdGFjdGl2ZVRlcm1pbmFsSWQ6IDMsXG5cdFx0XHRiYWNrZ3JvdW5kZWQ6IFtdLFxuXHRcdFx0ZGlzcG9zZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWhvbWVzIGEgc2FtZS1jd2QgdGVybWluYWwgd2hlbiB0aGUgQWdlbnQgSG9zdCBiYWNrZW5kIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdHNlc3Npb25Qcm92aWRlcnMuc2V0KCdhZ2VudGhvc3Qtb25lJywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdhZ2VudGhvc3Qtb25lJztcblx0XHRcdHJlYWRvbmx5IHJlbW90ZUFkZHJlc3MgPSAnc3NoLXJlbW90ZStvbmUnO1xuXHRcdH0pO1xuXHRcdHNlc3Npb25Qcm92aWRlcnMuc2V0KCdhZ2VudGhvc3QtdHdvJywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdhZ2VudGhvc3QtdHdvJztcblx0XHRcdHJlYWRvbmx5IHJlbW90ZUFkZHJlc3MgPSAnc3NoLXJlbW90ZSt0d28nO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAndGVzdDpmaXJzdC1kcmFmdCcsXG5cdFx0XHRwcm92aWRlcklkOiAnYWdlbnRob3N0LW9uZScsXG5cdFx0XHR3b3JrdHJlZTogY3dkLFxuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCxcblx0XHR9KTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OnNlY29uZC1kcmFmdCcsXG5cdFx0XHRwcm92aWRlcklkOiAnYWdlbnRob3N0LXR3bycsXG5cdFx0XHR3b3JrdHJlZTogY3dkLFxuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IFtmaXJzdFRlcm1pbmFsXSA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlLCBmaXJzdFNlc3Npb24pO1xuXHRcdG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5maXJlKHsgZnJvbTogZmlyc3RTZXNzaW9uLCB0bzogc2Vjb25kU2Vzc2lvbiB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZWNvbmRTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRjb25zdCBzZWNvbmRUZXJtaW5hbCA9IHRlcm1pbmFsSW5zdGFuY2VzLmdldChhY3RpdmVJbnN0YW5jZUlkISk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZWQ6IGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLFxuXHRcdFx0YWdlbnRIb3N0QWRkcmVzc2VzOiBhZ2VudEhvc3RUZXJtaW5hbEFkZHJlc3Nlcyxcblx0XHRcdGZpcnN0U3RpbGxBbGl2ZTogdGVybWluYWxJbnN0YW5jZXMuaGFzKGZpcnN0VGVybWluYWwuaW5zdGFuY2VJZCksXG5cdFx0XHRzZWNvbmRUZXJtaW5hbElkOiBzZWNvbmRUZXJtaW5hbD8uaW5zdGFuY2VJZCxcblx0XHRcdGJhY2tncm91bmRlZDogbW92ZVRvQmFja2dyb3VuZENhbGxzLFxuXHRcdFx0ZGlzcG9zZWQ6IGRpc3Bvc2VkSW5zdGFuY2VzLm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkOiAyLFxuXHRcdFx0YWdlbnRIb3N0QWRkcmVzc2VzOiBbJ3NzaC1yZW1vdGUrb25lJywgJ3NzaC1yZW1vdGUrdHdvJ10sXG5cdFx0XHRmaXJzdFN0aWxsQWxpdmU6IHRydWUsXG5cdFx0XHRzZWNvbmRUZXJtaW5hbElkOiAyLFxuXHRcdFx0YmFja2dyb3VuZGVkOiBbXSxcblx0XHRcdGRpc3Bvc2VkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIGdlbmVyaWMgbG9va3VwIHRvIHJldXNlIGEgc3RhbmRhbG9uZSB0ZXJtaW5hbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdEN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUtb25lJyk7XG5cdFx0Y29uc3Qgc2Vjb25kQ3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZS10d28nKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpmaXJzdC1kcmFmdCcsIHdvcmt0cmVlOiBmaXJzdEN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vjb25kLWRyYWZ0Jywgd29ya3RyZWU6IHNlY29uZEN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblxuXHRcdGNvbnN0IFtmaXJzdFRlcm1pbmFsXSA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChmaXJzdEN3ZCwgZmFsc2UsIGZpcnN0U2Vzc2lvbik7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBmaXJzdFNlc3Npb24sIHRvOiBzZWNvbmRTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChmaXJzdEN3ZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IHJlc3VsdC5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0XHRjcmVhdGVkOiBjcmVhdGVkVGVybWluYWxzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IFtmaXJzdFRlcm1pbmFsLmluc3RhbmNlSWRdLFxuXHRcdFx0Y3JlYXRlZDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZXMgYSB0ZXJtaW5hbCB3aG9zZSBjcmVhdGlvbiBmaW5pc2hlcyBhZnRlciBpdHMgZHJhZnQgaXMgcmVwbGFjZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RDd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlLW9uZScpO1xuXHRcdGNvbnN0IHNlY29uZEN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUtdHdvJyk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Zmlyc3QtZHJhZnQnLCB3b3JrdHJlZTogZmlyc3RDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlY29uZC1kcmFmdCcsIHdvcmt0cmVlOiBzZWNvbmRDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgY3JlYXRpb25CYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHRlcm1pbmFsQ3JlYXRpb25CYXJyaWVycy5zZXQoZmlyc3RDd2QuZnNQYXRoLCBjcmVhdGlvbkJhcnJpZXIpO1xuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGZpcnN0Q3dkLCBmYWxzZSwgZmlyc3RTZXNzaW9uKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbENyZWF0aW9uU3RhcnRlZCwgW2ZpcnN0Q3dkLmZzUGF0aF0pO1xuXG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBmaXJzdFNlc3Npb24sIHRvOiBzZWNvbmRTZXNzaW9uIH0pO1xuXHRcdGF3YWl0IGNyZWF0aW9uQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wZXJhdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiByZXN1bHQubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdFx0ZGlzcG9zZWQ6IGRpc3Bvc2VkSW5zdGFuY2VzLm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSxcblx0XHRcdGFjdGl2YXRlZDogYWN0aXZlSW5zdGFuY2VTZXQsXG5cdFx0XHRyZW1haW5pbmc6IFsuLi50ZXJtaW5hbEluc3RhbmNlcy5rZXlzKCldLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogW10sXG5cdFx0XHRkaXNwb3NlZDogWzFdLFxuXHRcdFx0YWN0aXZhdGVkOiBbXSxcblx0XHRcdHJlbWFpbmluZzogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyBhbiBleGlzdGluZyB0ZXJtaW5hbCB1bnRvdWNoZWQgd2hlbiBsb29rdXAgZmluaXNoZXMgYWZ0ZXIgcmVwbGFjZW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RDd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlLW9uZScpO1xuXHRcdGNvbnN0IHNlY29uZEN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUtdHdvJyk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Zmlyc3QtZHJhZnQnLCB3b3JrdHJlZTogZmlyc3RDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlY29uZC1kcmFmdCcsIHdvcmt0cmVlOiBzZWNvbmRDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgY3dkQmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBleGlzdGluZyA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKDEsIGZpcnN0Q3dkLmZzUGF0aCk7XG5cdFx0ZXhpc3RpbmcuX3Rlc3RTZXRJbml0aWFsQ3dkQmFycmllcihjd2RCYXJyaWVyLnApO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldChleGlzdGluZy5pbnN0YW5jZUlkLCBleGlzdGluZyk7XG5cdFx0bmV4dEluc3RhbmNlSWQgPSAyO1xuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGZpcnN0Q3dkLCBmYWxzZSwgZmlyc3RTZXNzaW9uKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBmaXJzdFNlc3Npb24sIHRvOiBzZWNvbmRTZXNzaW9uIH0pO1xuXHRcdGF3YWl0IGN3ZEJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBvcGVyYXRpb247XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogcmVzdWx0Lm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSxcblx0XHRcdGRpc3Bvc2VkOiBkaXNwb3NlZEluc3RhbmNlcy5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0XHRyZW1haW5pbmc6IFsuLi50ZXJtaW5hbEluc3RhbmNlcy5rZXlzKCldLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogW10sXG5cdFx0XHRkaXNwb3NlZDogW10sXG5cdFx0XHRyZW1haW5pbmc6IFsxXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIG9uRGlkQ2hhbmdlU2Vzc2lvbnMgKGFyY2hpdmVkKSAtLS1cblxuXHR0ZXN0KCdoaWRlcyAoZG9lcyBub3QgZGlzcG9zZSkgdGVybWluYWxzIHdoZW4gc2Vzc2lvbiBpcyBhcmNoaXZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphcmNoaXZlZC1zZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMSBhdCAvd29ya3RyZWVcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBBcmNoaXZpbmcgZmxpcHMgdGhlIGFjdGl2ZSBzZXNzaW9uIGF3YXkgZnJvbSB0aGUgYXJjaGl2ZWQgb25lLCBzbyB0aGVcblx0XHQvLyBhcmNoaXZlZCBzZXNzaW9uJ3MgdGVybWluYWwgaXMgbm8gbG9uZ2VyIHRoZSBmb2N1c2VkIChhY3RpdmUpIHRlcm1pbmFsLlxuXHRcdGNvbnN0IG90aGVyU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0Om90aGVyLXNlc3Npb24nLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9vdGhlcicpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG90aGVyU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBJc29sYXRlIHRoZSBhcmNoaXZlLWRyaXZlbiBoaWRlIGZyb20gdGhlIHZpc2liaWxpdHktc3dpdGNoIGhpZGUgYWJvdmUuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkLXNlc3Npb24nLFxuXHRcdFx0aXNBcmNoaXZlZDogdHJ1ZSxcblx0XHRcdHdvcmt0cmVlOiB3b3JrdHJlZVVyaSxcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsXG5cdFx0fSk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICdhcmNoaXZlZCBzZXNzaW9uIHRlcm1pbmFsIG11c3QgYmUgaGlkZGVuLCBub3QgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscywgWzFdLCAnYXJjaGl2ZWQgc2Vzc2lvbiB0ZXJtaW5hbCBzaG91bGQgYmUgbW92ZWQgdG8gYmFja2dyb3VuZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBoaWRlIG9yIGRpc3Bvc2UgdGVybWluYWxzIHdoZW4gc2Vzc2lvbiBpcyBub3QgYXJjaGl2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YWN0aXZlLXNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpO1xuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OmFjdGl2ZS1zZXNzaW9uJyxcblx0XHRcdGlzQXJjaGl2ZWQ6IGZhbHNlLFxuXHRcdFx0d29ya3RyZWU6IHdvcmt0cmVlVXJpLFxuXHRcdH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtzZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGxvZyBpbmZvIHdoZW4gYW4gYXJjaGl2ZWQgc2Vzc2lvbiBoYXMgbm8gdHJhY2tlZCB0ZXJtaW5hbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAndGVzdDphcmNoaXZlZC13aXRob3V0LXRlcm1pbmFsJyxcblx0XHRcdGlzQXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHR3b3JrdHJlZTogVVJJLmZpbGUoJy93b3JrdHJlZScpLFxuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCxcblx0XHR9KTtcblxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtzZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2dTZXJ2aWNlLmluZm9zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGhpZGUgb3IgZGlzcG9zZSB0ZXJtaW5hbHMgd2hlbiBhcmNoaXZlZCBzZXNzaW9uIGhhcyBubyB3b3JrdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphY3RpdmUtc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7XG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphcmNoaXZlZC1zZXNzaW9uJywgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbc2Vzc2lvbl0gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyB0ZXJtaW5hbHMgd2hlbiBhcmNoaXZlZCBzZXNzaW9uIGhhcyBvbmx5IGEgcmVwb3NpdG9yeSAobm8gd29ya3RyZWUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcG9VcmkgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVwby1zZXNzaW9uJywgcmVwb3NpdG9yeTogcmVwb1VyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgaXNBcmNoaXZlZDogZmFsc2UgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIHJlcG9VcmkuZnNQYXRoKTtcblxuXHRcdC8vIFN3aXRjaCB0aGUgYWN0aXZlIHNlc3Npb24gdG8gYSBkaWZmZXJlbnQgY3dkIHNvIHRoZSByZXBvIGN3ZCBpcyBubyBsb25nZXJcblx0XHQvLyB0aGUgcHJvdGVjdGVkIGFjdGl2ZSBjd2QgKG1pcnJvcnMgYXJjaGl2aW5nIGZsaXBwaW5nIHRoZSBhY3RpdmUgc2Vzc2lvblxuXHRcdC8vIHRvIGEgbmV3IG9uZSksIHRoZW4gYXJjaGl2ZSB0aGUgcmVwby1vbmx5IHNlc3Npb24uXG5cdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQob3RoZXJTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVwby1zZXNzaW9uJywgcmVwb3NpdG9yeTogcmVwb1VyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbYXJjaGl2ZWRTZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwLCAnYXJjaGl2ZWQgcmVwby1vbmx5IHNlc3Npb24gdGVybWluYWwgbXVzdCBiZSBoaWRkZW4sIG5vdCBkaXNwb3NlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW92ZVRvQmFja2dyb3VuZENhbGxzLCBbMV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBoaWRlIHRoZSB0ZXJtaW5hbCBhdCB0aGUgYWN0aXZlIHNlc3Npb24gY3dkIHdoZW4gYXJjaGl2aW5nIChqdXN0LW9wZW5lZCB0ZXJtaW5hbCBpcyBwcm90ZWN0ZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1pcnJvcnMgdGhlIFwiYXJjaGl2ZSBhbGwgc2Vzc2lvbnMsIHRoZW4gb3BlbiBhIHRlcm1pbmFsXCIgcmVwcm8gKCMzMTM1MTApOlxuXHRcdC8vIGEgbGF0ZSBhcmNoaXZlIGV2ZW50IG11c3Qgbm90IHRvdWNoIHRoZSB0ZXJtaW5hbCB0aGUgdXNlciBpcyBjdXJyZW50bHlcblx0XHQvLyB3b3JraW5nIGluIGF0IHRoZSBhY3RpdmUgc2Vzc2lvbidzIGN3ZC5cblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YWN0aXZlLXNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoYWN0aXZlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHQvLyBBIGRpZmZlcmVudCwgbm93LWFyY2hpdmVkIHNlc3Npb24gdGhhdCBoYXBwZW5zIHRvIHNoYXJlIHRoZSBhY3RpdmUgY3dkLlxuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFthcmNoaXZlZFNlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICd0ZXJtaW5hbCBhdCB0aGUgYWN0aXZlIHNlc3Npb24gY3dkIG11c3Qgbm90IGJlIGRpc3Bvc2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGgsIDAsICd0ZXJtaW5hbCBhdCB0aGUgYWN0aXZlIHNlc3Npb24gY3dkIG11c3Qgbm90IGJlIGhpZGRlbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1oaWRlIGEgbmV3bHktb3BlbmVkIHRlcm1pbmFsIHdoZW4gYW4gYWxyZWFkeS1hcmNoaXZlZCBzZXNzaW9uIGlzIHJlLWVtaXR0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTWlycm9ycyB0aGUgXCJldmVyeSBuZXcgdGVybWluYWwga2VlcHMgZHlpbmdcIiByZXBybyAoIzMxMzUxMCwgIzMxODY0NSk6XG5cdFx0Ly8gdGhlIHByb3ZpZGVyIGtlZXBzIGFyY2hpdmVkIHNlc3Npb25zIGNhY2hlZCBhbmQgcmUtZW1pdHMgdGhlbSBpbiBgY2hhbmdlZGBcblx0XHQvLyBvbiBldmVyeSBzeW5jLiBUaGUgYXJjaGl2ZSBjbGVhbnVwIG11c3Qgb25seSBydW4gb24gdGhlIGZpcnN0IGFyY2hpdmVkXG5cdFx0Ly8gdHJhbnNpdGlvbiwgbm90IG9uIGVhY2ggcmUtZW1pdC5cblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphcmNoaXZlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDEgYXQgL3dvcmt0cmVlXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvb3RoZXInKSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0Om90aGVyLXNlc3Npb24nLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9vdGhlcicpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMiBhdCAvb3RoZXIsIG5vdyBhY3RpdmVcblxuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHQvLyBGaXJzdCBhcmNoaXZlIGV2ZW50IGhpZGVzIHRoZSB0ZXJtaW5hbCBhdCB0aGUgYXJjaGl2ZWQgY3dkIChub3QgYWN0aXZlKS5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbYXJjaGl2ZWRTZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMsIFsxXSk7XG5cblx0XHQvLyBUaGUgdXNlciBvcGVucyBhIG5ldyB0ZXJtaW5hbCBhdCB0aGUgc2FtZSBjd2QsIHRoZW4gbW92ZXMgZm9jdXMgZWxzZXdoZXJlLlxuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmxhdGVyLXNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCAzIGF0IC93b3JrdHJlZSwgYWN0aXZlXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvb3RoZXInKSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0Om90aGVyLXNlc3Npb24nLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9vdGhlcicpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gcmV1c2UgdGVybWluYWwgMlxuXHRcdGFjdGl2ZUluc3RhbmNlSWQgPSAyOyAvLyBzaW11bGF0ZSB0aGUgdXNlciByZWZvY3VzaW5nIHRlcm1pbmFsIDIgYXQgL290aGVyXG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdC8vIFRoZSBwcm92aWRlciByZS1lbWl0cyB0aGUgc3RpbGwtYXJjaGl2ZWQgc2Vzc2lvbiBvbiBhIGxhdGVyIHN5bmMuIFRlcm1pbmFsIDNcblx0XHQvLyBhdCAvd29ya3RyZWUgaXMgbm8gbG9uZ2VyIHRoZSBhY3RpdmUgdGVybWluYWwsIHNvIG9ubHkgdGhlIHRyYW5zaXRpb24gZ3VhcmRcblx0XHQvLyBrZWVwcyBpdCBhbGl2ZTogdGhlIHJlLWVtaXQgbXVzdCBiZSBhIG5vLW9wIHNvIHRoZSBuZXdseS1vcGVuZWQgdGVybWluYWwgc3Vydml2ZXMuXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2FyY2hpdmVkU2Vzc2lvbl0gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICdyZS1lbWl0dGVkIGFyY2hpdmVkIHNlc3Npb24gbXVzdCBub3QgZGlzcG9zZSBhbnkgdGVybWluYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCwgMCwgJ3JlLWVtaXR0ZWQgYXJjaGl2ZWQgc2Vzc2lvbiBtdXN0IG5vdCByZS1oaWRlIHRoZSBuZXdseS1vcGVuZWQgdGVybWluYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaGlkZSB0ZXJtaW5hbHMgZm9yIGEgc2Vzc2lvbiB0aGF0IHdhcyBhbHJlYWR5IGFyY2hpdmVkIHdoZW4gdGhlIGNvbnRyaWJ1dGlvbiBzdGFydGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNlc3Npb25zIHJlc3RvcmVkIGFscmVhZHktYXJjaGl2ZWQgZnJvbSBhIHByZXZpb3VzIHdpbmRvdyBhcmUgc2VlZGVkXG5cdFx0Ly8gaW50byB0aGUgdHJhY2tlZCBzZXQgYXQgY29uc3RydWN0aW9uLCBzbyB0aGVpciBmaXJzdCBgY2hhbmdlZGAgcmUtZW1pdFxuXHRcdC8vIG11c3Qgbm90IGNvdW50IGFzIGEgZnJlc2ggYXJjaGl2ZSB0cmFuc2l0aW9uLiBTZWUgIzMxMzUxMCwgIzMxODY0NS5cblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBhcmNoaXZlZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpyZXN0b3JlZC1hcmNoaXZlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblx0XHRhbGxTZXNzaW9ucyA9IFthcmNoaXZlZFNlc3Npb25dO1xuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgZGVmYXVsdCBjb250cmlidXRpb24gKGNyZWF0ZWQgaW4gc2V0dXAgd2l0aCBubyBzZXNzaW9ucykgc29cblx0XHQvLyBvbmx5IHRoZSBmcmVzaGx5LWNvbnN0cnVjdGVkLCBzZWVkZWQgY29udHJpYnV0aW9uIG9ic2VydmVzIHRoZSBldmVudC5cblx0XHRjb250cmlidXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0Ly8gQSBmcmVzaCBjb250cmlidXRpb24gb2JzZXJ2ZXMgdGhlIGFscmVhZHktYXJjaGl2ZWQgc2Vzc2lvbiBhdCBzdGFydHVwLlxuXHRcdGNvbnN0IGZyZXNoQ29udHJpYnV0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24pKTtcblx0XHRhd2FpdCBmcmVzaENvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnJlc3RvcmVkLWFyY2hpdmVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgYXQgL3dvcmt0cmVlXG5cdFx0YXdhaXQgZnJlc2hDb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9vdGhlcicpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyBtb3ZlIGZvY3VzIGF3YXlcblxuXHRcdG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Ly8gVGhlIHByb3ZpZGVyIHJlLWVtaXRzIHRoZSBhbHJlYWR5LWFyY2hpdmVkIHNlc3Npb24gb24gaXRzIGZpcnN0IHN5bmMuXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2FyY2hpdmVkU2Vzc2lvbl0gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCwgJ2FscmVhZHktYXJjaGl2ZWQgc2Vzc2lvbiBtdXN0IG5vdCBkaXNwb3NlIGFueSB0ZXJtaW5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoLCAwLCAnYWxyZWFkeS1hcmNoaXZlZCBzZXNzaW9uIG11c3Qgbm90IGJlIHRyZWF0ZWQgYXMgYSBmcmVzaCBhcmNoaXZlIHRyYW5zaXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VzIHRlcm1pbmFscyB3aGVuIGEgbm9uLWZvY3VzZWQgc2Vzc2lvbiBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnJlbW92ZWQtc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDEgYXQgL3dvcmt0cmVlLCBhY3RpdmVcblx0XHQvLyBPcGVuIGEgdGVybWluYWwgZWxzZXdoZXJlIHNvIHRoZSAvd29ya3RyZWUgdGVybWluYWwgaXMgbm8gbG9uZ2VyIHRoZVxuXHRcdC8vIGZvY3VzZWQgKGFjdGl2ZSkgaW5zdGFuY2UgXHUyMDE0IGkuZS4gdGhlIHVzZXIgcmVtb3ZlZCBhIHNlc3Npb24gdGhleSB3ZXJlIG5vdFxuXHRcdC8vIGN1cnJlbnRseSB3b3JraW5nIGluLlxuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChVUkkuZmlsZSgnL290aGVyJyksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpvdGhlci1zZXNzaW9uJywgd29ya3RyZWU6IFVSSS5maWxlKCcvb3RoZXInKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDIgYXQgL290aGVyLCBhY3RpdmVcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVtb3ZlZC1zZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbG9nIGluZm8gd2hlbiBhIHJlbW92ZWQgc2Vzc2lvbiBoYXMgbm8gdHJhY2tlZCB0ZXJtaW5hbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAndGVzdDpyZW1vdmVkLXdpdGhvdXQtdGVybWluYWwnLFxuXHRcdFx0d29ya3RyZWU6IFVSSS5maWxlKCcvd29ya3RyZWUnKSxcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsXG5cdFx0fSk7XG5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtzZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2dTZXJ2aWNlLmluZm9zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc3Bvc2UgdGhlIGZvY3VzZWQgdGVybWluYWwgd2hlbiBpdHMgc2Vzc2lvbiBpcyByZW1vdmVkIChncmFkdWF0aW9uIGNhc2UpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1pcnJvcnMgdGhlIGZpcnN0LXR1cm4gdW50aXRsZWQgXHUyMTkyIGNvbW1pdHRlZCBncmFkdWF0aW9uICgjMzEzNTEwLCAjMzE4NjQ1KTpcblx0XHQvLyBgb25EaWRSZXBsYWNlU2Vzc2lvbmAgc3VyZmFjZXMgdGhlIHNrZWxldG9uIGluIGByZW1vdmVkYCB3aGlsZSB0aGVcblx0XHQvLyBjb21taXR0ZWQgc2Vzc2lvbiBpbmhlcml0cyB0aGUgc2FtZSBjd2QgYnV0IGhhcyBub3QgcmVzb2x2ZWQgaXRzIHdvcmtzcGFjZVxuXHRcdC8vIHlldCwgc28gaXQgZG9lcyBub3QgYXBwZWFyIGluIGBsaXZlQ3dkS2V5c2AuIFRoZSB0ZXJtaW5hbCB0aGUgdXNlciBqdXN0XG5cdFx0Ly8gdXNlZCBmb3IgdGhlIGZpcnN0IHR1cm4gaXMgdGhlIGZvY3VzZWQgKGFjdGl2ZSkgaW5zdGFuY2UgYW5kIG11c3Qgc3Vydml2ZS5cblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDp1bnRpdGxlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDEgYXQgL3dvcmt0cmVlLCBhY3RpdmVcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBza2VsZXRvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnVudGl0bGVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdC8vIFRoZSBjb21taXR0ZWQgc2Vzc2lvbiByZXBvcnRzIG5vIHdvcmtzcGFjZSB5ZXQsIHNvIGl0IGlzIG5vdCBpbiBhbGxTZXNzaW9ucy5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtza2VsZXRvbl0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICd0aGUgZm9jdXNlZCB0ZXJtaW5hbCBtdXN0IG5vdCBiZSBkaXNwb3NlZCBvbiBncmFkdWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlcyBvbmx5IHRoZSByZW1vdmVkIHNlc3Npb24gdGVybWluYWwgd2hlbiBzZXNzaW9ucyBzaGFyZSBhIGN3ZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDp1bnRpdGxlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Y29tbWl0dGVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBvbkRpZFJlcGxhY2VTZXNzaW9uIGZsb3c6IGBmcm9tYCAodW50aXRsZWQpIGlzIHJlcG9ydGVkIGFzXG5cdFx0Ly8gcmVtb3ZlZCB3aGlsZSBgdG9gIChjb21taXR0ZWQpIGlzIHN0aWxsIGxpdmUgYXQgdGhlIHNhbWUgY3dkLlxuXHRcdGNvbnN0IGZyb21TZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6dW50aXRsZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgdG9TZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Y29tbWl0dGVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFsbFNlc3Npb25zID0gW3RvU2Vzc2lvbl07XG5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtmcm9tU2Vzc2lvbl0sIGNoYW5nZWQ6IFt0b1Nlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLCBbMV0sICdvbmx5IHRoZSByZW1vdmVkIHNlc3Npb24gdGVybWluYWwgc2hvdWxkIGJlIGNsb3NlZCcpO1xuXHRcdGFzc2VydC5vayh0ZXJtaW5hbEluc3RhbmNlcy5oYXMoMiksICd0aGUgc3Vydml2aW5nIHNlc3Npb24gdGVybWluYWwgc2hvdWxkIHJlbWFpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyBvbmx5IHRoZSBhcmNoaXZlZCBzZXNzaW9uIHRlcm1pbmFsIHdoZW4gc2Vzc2lvbnMgc2hhcmUgYSBjd2QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6bGl2ZScsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YXJjaGl2ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpO1xuXG5cdFx0Y29uc3QgbGl2ZVNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpsaXZlJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdGFsbFNlc3Npb25zID0gW2xpdmVTZXNzaW9uLCBhcmNoaXZlZFNlc3Npb25dO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobGl2ZVNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFjdGl2ZUluc3RhbmNlSWQgPSAxO1xuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbYXJjaGl2ZWRTZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwLCAndGVybWluYWwgc2hvdWxkIGJlIGhpZGRlbiwgbm90IGRpc3Bvc2VkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMsIFsyXSwgJ29ubHkgdGhlIGFyY2hpdmVkIHNlc3Npb24gdGVybWluYWwgc2hvdWxkIGJlIGhpZGRlbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZXMgdGVybWluYWwgd2hlbiB0aGUgb25seSBzZXNzaW9uIGF0IGEgY3dkIGlzIHJlbW92ZWQgZXZlbiBpZiBvdGhlciBsaXZlIHNlc3Npb25zIGV4aXN0IGVsc2V3aGVyZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpnb25lJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMSBhdCAvd29ya3RyZWUsIGFjdGl2ZVxuXG5cdFx0Y29uc3Qgb3RoZXJMaXZlID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXInLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9vdGhlcicpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IHJlbW92ZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Z29uZScsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRhbGxTZXNzaW9ucyA9IFtvdGhlckxpdmVdO1xuXG5cdFx0Ly8gU3dpdGNoIGZvY3VzIHRvIHRoZSBvdGhlciBsaXZlIHNlc3Npb24ncyB0ZXJtaW5hbCBzbyB0aGUgL3dvcmt0cmVlXG5cdFx0Ly8gdGVybWluYWwgaXMgbm8gbG9uZ2VyIHRoZSBwcm90ZWN0ZWQgYWN0aXZlIGluc3RhbmNlLlxuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChVUkkuZmlsZSgnL290aGVyJyksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpvdGhlcicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCAyIGF0IC9vdGhlciwgYWN0aXZlXG5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtyZW1vdmVkU2Vzc2lvbl0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDEsICdubyBsaXZlIHNlc3Npb24gb3ducyB0aGlzIGN3ZCwgdGVybWluYWwgc2hvdWxkIGJlIGNsb3NlZCcpO1xuXHR9KTtcblxuXHQvLyAtLS0gc3dpdGNoaW5nIGJhY2sgdG8gcHJldmlvdXNseSB1c2VkIHBhdGggcmV1c2VzIHRlcm1pbmFsIC0tLVxuXG5cdHRlc3QoJ3N3aXRjaGluZyBiYWNrIHRvIGEgcHJldmlvdXNseSB1c2VkIGJhY2tncm91bmQgcGF0aCByZXVzZXMgdGhlIGV4aXN0aW5nIHRlcm1pbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZDEgPSBVUkkuZmlsZSgnL2N3ZDEnKTtcblx0XHRjb25zdCBjd2QyID0gVVJJLmZpbGUoJy9jd2QyJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogY3dkMSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMicsIHdvcmt0cmVlOiBjd2QyLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gU3dpdGNoIGJhY2sgdG8gY3dkMSAtIHNob3VsZCByZXVzZSB0ZXJtaW5hbCwgbm90IGNyZWF0ZSBhIG5ldyBvbmVcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogY3dkMSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAyLCAnc2hvdWxkIHJldXNlIHRoZSB0ZXJtaW5hbCBmb3IgY3dkMScpO1xuXHR9KTtcblxuXHQvLyAtLS0gVGVybWluYWwgdmlzaWJpbGl0eSBtYW5hZ2VtZW50IChzZXNzaW9uLWJhc2VkIHdpdGggY3dkIGZhbGxiYWNrKSAtLS1cblxuXHR0ZXN0KCdoaWRlcyB0ZXJtaW5hbHMgZnJvbSBwcmV2aW91cyBzZXNzaW9uIHdoZW4gc3dpdGNoaW5nIHRvIGEgbmV3IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkMSA9IFVSSS5maWxlKCcvY3dkMScpO1xuXHRcdGNvbnN0IGN3ZDIgPSBVUkkuZmlsZSgnL2N3ZDInKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiBjd2QxLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZDIsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gVGhlIGZpcnN0IHRlcm1pbmFsIChpZD0xKSBzaG91bGQgaGF2ZSBiZWVuIG1vdmVkIHRvIGJhY2tncm91bmRcblx0XHRhc3NlcnQub2sobW92ZVRvQmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKDEpLCAndGVybWluYWwgZm9yIGN3ZDEgc2hvdWxkIGJlIGJhY2tncm91bmRlZCcpO1xuXHRcdGFzc2VydC5vayhiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDEpLCAndGVybWluYWwgZm9yIGN3ZDEgc2hvdWxkIHJlbWFpbiBiYWNrZ3JvdW5kZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgcHJldmlvdXNseSBoaWRkZW4gdGVybWluYWxzIHdoZW4gc3dpdGNoaW5nIGJhY2sgdG8gdGhlaXIgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QxID0gVVJJLmZpbGUoJy9jd2QxJyk7XG5cdFx0Y29uc3QgY3dkMiA9IFVSSS5maWxlKCcvY3dkMicpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IGN3ZDEsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZDIsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gU3dpdGNoIGJhY2sgdG8gY3dkMVxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiBjd2QxLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIFRlcm1pbmFsIGZvciBjd2QxIChpZD0xKSBzaG91bGQgYmUgc2hvd24gYWdhaW5cblx0XHRhc3NlcnQub2soc2hvd0JhY2tncm91bmRDYWxscy5pbmNsdWRlcygxKSwgJ3Rlcm1pbmFsIGZvciBjd2QxIHNob3VsZCBiZSBzaG93bicpO1xuXHRcdGFzc2VydC5vayghYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygxKSwgJ3Rlcm1pbmFsIGZvciBjd2QxIHNob3VsZCBiZSBmb3JlZ3JvdW5kJyk7XG5cdFx0Ly8gVGVybWluYWwgZm9yIGN3ZDIgKGlkPTIpIHNob3VsZCBub3cgYmUgYmFja2dyb3VuZGVkXG5cdFx0YXNzZXJ0Lm9rKGJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMiksICd0ZXJtaW5hbCBmb3IgY3dkMiBzaG91bGQgYmUgYmFja2dyb3VuZGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgdGVybWluYWxzIG9mIHRoZSBhY3RpdmUgc2Vzc2lvbiBhcmUgdmlzaWJsZSBhZnRlciBtdWx0aXBsZSBzd2l0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QxID0gVVJJLmZpbGUoJy9jd2QxJyk7XG5cdFx0Y29uc3QgY3dkMiA9IFVSSS5maWxlKCcvY3dkMicpO1xuXHRcdGNvbnN0IGN3ZDMgPSBVUkkuZmlsZSgnL2N3ZDMnKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiBjd2QxLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMicsIHdvcmt0cmVlOiBjd2QyLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMycsIHdvcmt0cmVlOiBjd2QzLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIE9ubHkgdGVybWluYWwgZm9yIGN3ZDMgKGlkPTMpIHNob3VsZCBiZSBmb3JlZ3JvdW5kXG5cdFx0YXNzZXJ0Lm9rKGJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMSksICd0ZXJtaW5hbCBmb3IgY3dkMSBzaG91bGQgYmUgYmFja2dyb3VuZGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMiksICd0ZXJtaW5hbCBmb3IgY3dkMiBzaG91bGQgYmUgYmFja2dyb3VuZGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKCFiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDMpLCAndGVybWluYWwgZm9yIGN3ZDMgc2hvdWxkIGJlIGZvcmVncm91bmQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgcHJlLWV4aXN0aW5nIHRlcm1pbmFsIHdpdGggbWF0Y2hpbmcgY3dkIGluc3RlYWQgb2YgY3JlYXRpbmcgYSBuZXcgb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1hbnVhbGx5IGFkZCBhIHRlcm1pbmFsIHRoYXQgYWxyZWFkeSBleGlzdHMgd2l0aCBhIG1hdGNoaW5nIGN3ZFxuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBleGlzdGluZ0luc3RhbmNlID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkLmZzUGF0aCk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KGV4aXN0aW5nSW5zdGFuY2UuaW5zdGFuY2VJZCwgZXhpc3RpbmdJbnN0YW5jZSk7XG5cdFx0YmFja2dyb3VuZGVkSW5zdGFuY2VzLmFkZChleGlzdGluZ0luc3RhbmNlLmluc3RhbmNlSWQpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAwLCAnc2hvdWxkIHJldXNlIGV4aXN0aW5nIHRlcm1pbmFsLCBub3QgY3JlYXRlIGEgbmV3IG9uZScpO1xuXHRcdGFzc2VydC5vayhzaG93QmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKGV4aXN0aW5nSW5zdGFuY2UuaW5zdGFuY2VJZCksICdzaG91bGQgc2hvdyB0aGUgZXhpc3RpbmcgdGVybWluYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYmFja2dyb3VuZCBhIHJlc3RvcmVkIHRlcm1pbmFsIHRoYXQgaXMgZGlzcG9zZWQgYmVmb3JlIGN3ZCByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVzb2x2ZUluaXRpYWxDd2Q6ICgoY3dkOiBzdHJpbmcpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc3RvcmVkSW5zdGFuY2UgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCAnL3Jlc3RvcmVkJyk7XG5cdFx0cmVzdG9yZWRJbnN0YW5jZS5fdGVzdFNldFNoZWxsTGF1bmNoQ29uZmlnKHsgYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M6IHt9IGFzIG5ldmVyIH0gYXMgSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pO1xuXHRcdHJlc3RvcmVkSW5zdGFuY2UuZ2V0SW5pdGlhbEN3ZCA9ICgpID0+IG5ldyBQcm9taXNlPHN0cmluZz4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRyZXNvbHZlSW5pdGlhbEN3ZCA9IHJlc29sdmU7XG5cdFx0fSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHJlc3RvcmVkSW5zdGFuY2UuaW5zdGFuY2VJZCwgcmVzdG9yZWRJbnN0YW5jZSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphY3RpdmUtc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL2FjdGl2ZScpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdG9uRGlkQ3JlYXRlSW5zdGFuY2UuZmlyZShyZXN0b3JlZEluc3RhbmNlKTtcblx0XHRyZXN0b3JlZEluc3RhbmNlLl90ZXN0U2V0RGlzcG9zZWQodHJ1ZSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuZGVsZXRlKHJlc3RvcmVkSW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0cmVzb2x2ZUluaXRpYWxDd2Q/LignL290aGVyJyk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMuaW5jbHVkZXMocmVzdG9yZWRJbnN0YW5jZS5pbnN0YW5jZUlkKSwgJ2Rpc3Bvc2VkIHJlc3RvcmVkIHRlcm1pbmFsIHNob3VsZCBub3QgYmUgYmFja2dyb3VuZGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGxvZ1NlcnZpY2UudHJhY2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmluY2x1ZGVzKCdDYW5ub3QgaGlkZSByZXN0b3JlZCB0ZXJtaW5hbCBmb3IgL290aGVyOyB0ZXJtaW5hbCcpICYmIG1lc3NhZ2UuaW5jbHVkZXMoJ2lzIG5vIGxvbmdlciBhdmFpbGFibGUnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyBwcmUtZXhpc3RpbmcgdGVybWluYWwgd2l0aCBub24tbWF0Y2hpbmcgY3dkIHdoZW4gc2Vzc2lvbiBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1hbnVhbGx5IGFkZCBhIHRlcm1pbmFsIHRoYXQgYWxyZWFkeSBleGlzdHMgd2l0aCBhIGRpZmZlcmVudCBjd2Rcblx0XHRjb25zdCBvdGhlckluc3RhbmNlID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgJy9vdGhlci9wYXRoJyk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KG90aGVySW5zdGFuY2UuaW5zdGFuY2VJZCwgb3RoZXJJbnN0YW5jZSk7XG5cblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0Lm9rKG1vdmVUb0JhY2tncm91bmRDYWxscy5pbmNsdWRlcyhvdGhlckluc3RhbmNlLmluc3RhbmNlSWQpLCAnbm9uLW1hdGNoaW5nIHRlcm1pbmFsIHNob3VsZCBiZSBiYWNrZ3JvdW5kZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZW5zdXJlVGVybWluYWwgZmluZHMgYSBiYWNrZ3JvdW5kZWQgdGVybWluYWwgaW5zdGVhZCBvZiBjcmVhdGluZyBhIG5ldyBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy90ZXN0LWN3ZCcpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlKTtcblx0XHRjb25zdCBpbnN0YW5jZUlkID0gYWN0aXZlSW5zdGFuY2VTZXRbMF07XG5cblx0XHQvLyBNYW51YWxseSBiYWNrZ3JvdW5kIGl0XG5cdFx0YmFja2dyb3VuZGVkSW5zdGFuY2VzLmFkZChpbnN0YW5jZUlkKTtcblxuXHRcdC8vIGVuc3VyZVRlcm1pbmFsIHNob3VsZCBmaW5kIGl0IGJ5IGN3ZCwgbm90IGNyZWF0ZSBhIG5ldyBvbmVcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEsICdzaG91bGQgbm90IGNyZWF0ZSBhIG5ldyB0ZXJtaW5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaW5zdGFuY2VJZCwgaW5zdGFuY2VJZCwgJ3Nob3VsZCByZXR1cm4gdGhlIGV4aXN0aW5nIGJhY2tncm91bmRlZCB0ZXJtaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXVzZSBhbiB1bnRyYWNrZWQgY3dkIG1hdGNoIHdoZW4gaXQgaXMgYWxyZWFkeSB0cmFja2VkIHRvIGFub3RoZXIgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3NoYXJlZCcpO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IGN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMicsIHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLm1hcCh0ZXJtaW5hbCA9PiB0ZXJtaW5hbC5jd2QuZnNQYXRoKSwgW2N3ZC5mc1BhdGgsIGN3ZC5mc1BhdGhdKTtcblx0XHRhc3NlcnQub2soYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygxKSwgJ3RoZSBmaXJzdCBzZXNzaW9uIHRlcm1pbmFsIHNob3VsZCBiZSBiYWNrZ3JvdW5kZWQnKTtcblx0XHRhc3NlcnQub2soIWJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMiksICd0aGUgc2Vjb25kIHNlc3Npb24gdGVybWluYWwgc2hvdWxkIHN0YXkgdmlzaWJsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd2aXNpYmlsaXR5IGlzIGRldGVybWluZWQgYnkgdHJhY2tlZCBzZXNzaW9uIHRlcm1pbmFscyB3aGVuIHNlc3Npb25zIHNoYXJlIGEgY3dkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvY3dkJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQub2soYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygxKSwgJ3Nlc3Npb24gMSB0ZXJtaW5hbCBzaG91bGQgYmUgYmFja2dyb3VuZGVkIHdoZW4gc2Vzc2lvbiAyIGlzIGFjdGl2ZScpO1xuXHRcdGFzc2VydC5vayghYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygyKSwgJ3Nlc3Npb24gMiB0ZXJtaW5hbCBzaG91bGQgYmUgZm9yZWdyb3VuZCcpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDEpLCAnc2Vzc2lvbiAxIHRlcm1pbmFsIHNob3VsZCBiZSBzaG93biBhZ2FpbiB3aGVuIHJlYWN0aXZhdGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMiksICdzZXNzaW9uIDIgdGVybWluYWwgc2hvdWxkIGJlIGJhY2tncm91bmRlZCB3aGVuIHNlc3Npb24gMSBpcyBhY3RpdmUnKTtcblx0fSk7XG5cblx0Ly8gLS0tIE1vc3QtcmVjZW50LWNvbW1hbmQgYWN0aXZlIHRlcm1pbmFsIHNlbGVjdGlvbiAtLS1cblxuXHR0ZXN0KCdzZXRzIHRoZSB0ZXJtaW5hbCB3aXRoIHRoZSBtb3N0IHJlY2VudCBjb21tYW5kIGFzIGFjdGl2ZSBhZnRlciB2aXNpYmlsaXR5IHVwZGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3QgdDEgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCBjd2QuZnNQYXRoKTtcblx0XHRjb25zdCB0MiA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIGN3ZC5mc1BhdGgpO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0MS5pbnN0YW5jZUlkLCB0MSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHQyLmluc3RhbmNlSWQsIHQyKTtcblxuXHRcdC8vIHQxIHJhbiBhIGNvbW1hbmQgYXQgdGltZXN0YW1wIDEwMCwgdDIgYXQgdGltZXN0YW1wIDIwMCAobW9yZSByZWNlbnQpXG5cdFx0YWRkQ29tbWFuZFRvSW5zdGFuY2UodDEsIDEwMCk7XG5cdFx0YWRkQ29tbWFuZFRvSW5zdGFuY2UodDIsIDIwMCk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgd29ya3RyZWU6IGN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBUaGUgbW9zdCByZWNlbnQgc2V0QWN0aXZlSW5zdGFuY2UgY2FsbCBzaG91bGQgYmUgZm9yIHQyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUluc3RhbmNlU2V0LmF0KC0xKSwgdDIuaW5zdGFuY2VJZCwgJ3Nob3VsZCBzZXQgdGhlIHRlcm1pbmFsIHdpdGggdGhlIG1vc3QgcmVjZW50IGNvbW1hbmQgYXMgYWN0aXZlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNoYW5nZSBhY3RpdmUgaW5zdGFuY2Ugd2hlbiBubyB0ZXJtaW5hbHMgaGF2ZSBjb21tYW5kIGhpc3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGNvbnN0IHQxID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkLmZzUGF0aCk7XG5cdFx0Y29uc3QgdDIgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCBjd2QuZnNQYXRoKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQodDEuaW5zdGFuY2VJZCwgdDEpO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0Mi5pbnN0YW5jZUlkLCB0Mik7XG5cblx0XHRjb25zdCBhY3RpdmVDb3VudEJlZm9yZSA9IGFjdGl2ZUluc3RhbmNlU2V0Lmxlbmd0aDtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIE5vIHNldEFjdGl2ZUluc3RhbmNlIGNhbGxzIGZyb20gdmlzaWJpbGl0eSB1cGRhdGUgc2luY2Ugbm8gY29tbWFuZHMgd2VyZSBydW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSW5zdGFuY2VTZXQubGVuZ3RoLCBhY3RpdmVDb3VudEJlZm9yZSwgJ3Nob3VsZCBub3QgY2FsbCBzZXRBY3RpdmVJbnN0YW5jZSB3aGVuIG5vIGNvbW1hbmQgaGlzdG9yeSBleGlzdHMnKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlbW90ZSBhZ2VudCBob3N0IHNlc3Npb25zIC0tLVxuXG5cdHRlc3QoJ3VzZXMgdGhlIHVud3JhcHBlZCByZXBvc2l0b3J5IHBhdGggZm9yIGEgYmFja2dyb3VuZCBzZXNzaW9uIHdpdGggYSByZW1vdGUgYWdlbnQgaG9zdCByZXBvc2l0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVJlcG9VcmkgPSB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnL1VzZXJzL3VzZXIvcmVwbycpLCAnbXktc2VydmVyJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyByZXBvc2l0b3J5OiByZW1vdGVSZXBvVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxLCAnc2hvdWxkIGNyZWF0ZSBhIHRlcm1pbmFsIGF0IHRoZSB1bndyYXBwZWQgcmVwb3NpdG9yeSBwYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgVVJJLmZpbGUoJy9Vc2Vycy91c2VyL3JlcG8nKS5mc1BhdGgpO1xuXHR9KTtcblxuXHQvLyAtLS0gSGlkZGVuIHRvb2wgdGVybWluYWxzIChoaWRlRnJvbVVzZXIpIC0tLVxuXG5cdHRlc3QoJ2RvZXMgbm90IGhpZGUgaGlkZGVuIHRvb2wgdGVybWluYWxzIHdoZW4gc2Vzc2lvbiBpcyBhcmNoaXZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpyZWd1bGFyLXNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCAxIChyZWd1bGFyKSBhdCAvd29ya3RyZWVcblxuXHRcdC8vIFNpbXVsYXRlIGEgaGlkZGVuIHRvb2wgdGVybWluYWwgKGNyZWF0ZWQgYnkgcnVuX2luX3Rlcm1pbmFsKSBhdCB0aGUgc2FtZSBjd2Rcblx0XHRjb25zdCB0b29sVGVybWluYWwgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCB3b3JrdHJlZVVyaS5mc1BhdGgpO1xuXHRcdHRvb2xUZXJtaW5hbC5fdGVzdFNldFNoZWxsTGF1bmNoQ29uZmlnKHsgaGlkZUZyb21Vc2VyOiB0cnVlIH0gYXMgSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0b29sVGVybWluYWwuaW5zdGFuY2VJZCwgdG9vbFRlcm1pbmFsKTtcblxuXHRcdC8vIEFyY2hpdmluZyBmbGlwcyB0aGUgYWN0aXZlIHNlc3Npb24gYXdheSwgc28gdGhlIGFyY2hpdmVkIHNlc3Npb24nc1xuXHRcdC8vIHJlZ3VsYXIgdGVybWluYWwgaXMgbm8gbG9uZ2VyIHRoZSBmb2N1c2VkIChhY3RpdmUpIHRlcm1pbmFsLlxuXHRcdGNvbnN0IG90aGVyU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0Om90aGVyLXNlc3Npb24nLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9vdGhlcicpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG90aGVyU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3Rlc3Q6cmVndWxhci1zZXNzaW9uJyxcblx0XHRcdGlzQXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHR3b3JrdHJlZTogd29ya3RyZWVVcmksXG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtzZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBUaGUgcmVndWxhciB0ZXJtaW5hbCBzaG91bGQgYmUgaGlkZGVuLCBidXQgdGhlIHRvb2wgdGVybWluYWwgbXVzdCBzdXJ2aXZlIHVudG91Y2hlZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwLCAnYXJjaGl2ZWQgc2Vzc2lvbiB0ZXJtaW5hbCBtdXN0IGJlIGhpZGRlbiwgbm90IGRpc3Bvc2VkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMsIFsxXSwgJ29ubHkgdGhlIHJlZ3VsYXIgdGVybWluYWwgc2hvdWxkIGJlIGhpZGRlbiwgbm90IHRoZSB0b29sIHRlcm1pbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc3Bvc2UgaGlkZGVuIHRvb2wgdGVybWluYWxzIHdoZW4gc2Vzc2lvbiBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnJlZ3VsYXItc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDEgKHJlZ3VsYXIpIGF0IC93b3JrdHJlZSwgYWN0aXZlXG5cblx0XHRjb25zdCB0b29sVGVybWluYWwgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCB3b3JrdHJlZVVyaS5mc1BhdGgpO1xuXHRcdHRvb2xUZXJtaW5hbC5fdGVzdFNldFNoZWxsTGF1bmNoQ29uZmlnKHsgaGlkZUZyb21Vc2VyOiB0cnVlIH0gYXMgSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0b29sVGVybWluYWwuaW5zdGFuY2VJZCwgdG9vbFRlcm1pbmFsKTtcblxuXHRcdC8vIFN3aXRjaCBmb2N1cyBhd2F5IHNvIHRoZSByZWd1bGFyIHRlcm1pbmFsIGlzIG5vIGxvbmdlciB0aGUgcHJvdGVjdGVkIGFjdGl2ZSBpbnN0YW5jZS5cblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9vdGhlcicpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCBhdCAvb3RoZXIsIGFjdGl2ZVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnJlZ3VsYXItc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtzZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMSwgJ3Nob3VsZCBkaXNwb3NlIGV4YWN0bHkgb25lIHRlcm1pbmFsJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzWzBdLmluc3RhbmNlSWQsIHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkLCAnc2hvdWxkIG5vdCBkaXNwb3NlIHRoZSB0b29sIHRlcm1pbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJhY2tncm91bmQgaGlkZGVuIHRvb2wgdGVybWluYWxzIGR1cmluZyBzZXNzaW9uIHN3aXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QxID0gVVJJLmZpbGUoJy9jd2QxJyk7XG5cdFx0Y29uc3QgY3dkMiA9IFVSSS5maWxlKCcvY3dkMicpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IGN3ZDEsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gQWRkIGEgaGlkZGVuIHRvb2wgdGVybWluYWwgYXQgY3dkMVxuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIGN3ZDEuZnNQYXRoKTtcblx0XHR0b29sVGVybWluYWwuX3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyh7IGhpZGVGcm9tVXNlcjogdHJ1ZSB9IGFzIElUZXJtaW5hbEluc3RhbmNlWydzaGVsbExhdW5jaENvbmZpZyddKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQodG9vbFRlcm1pbmFsLmluc3RhbmNlSWQsIHRvb2xUZXJtaW5hbCk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gY3dkMlxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMicsIHdvcmt0cmVlOiBjd2QyLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5vayghbW92ZVRvQmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkKSwgJ2hpZGRlbiB0b29sIHRlcm1pbmFsIHNob3VsZCBub3QgYmUgbW92ZWQgdG8gYmFja2dyb3VuZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBpbmNsdWRlIGhpZGRlbiB0b29sIHRlcm1pbmFscyBpbiBlbnN1cmVUZXJtaW5hbCBtYXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblxuXHRcdC8vIEFkZCBhIGhpZGRlbiB0b29sIHRlcm1pbmFsIGF0IHRoZSB0YXJnZXQgY3dkXG5cdFx0Y29uc3QgdG9vbFRlcm1pbmFsID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkLmZzUGF0aCk7XG5cdFx0dG9vbFRlcm1pbmFsLl90ZXN0U2V0U2hlbGxMYXVuY2hDb25maWcoeyBoaWRlRnJvbVVzZXI6IHRydWUgfSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkLCB0b29sVGVybWluYWwpO1xuXG5cdFx0Ly8gZW5zdXJlVGVybWluYWwgc2hvdWxkIG5vdCBmaW5kIHRoZSB0b29sIHRlcm1pbmFsLCBzbyBpdCBjcmVhdGVzIGEgbmV3IG9uZVxuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSwgJ3Nob3VsZCBjcmVhdGUgYSBuZXcgdGVybWluYWwgc2luY2UgdG9vbCB0ZXJtaW5hbCBpcyBoaWRkZW4nKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaGlkZSByZXN0b3JlZCBoaWRkZW4gdG9vbCB0ZXJtaW5hbHMgb24gc2Vzc2lvbiBjcmVhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YWN0aXZlLXNlc3Npb24nLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9hY3RpdmUnKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRjb25zdCB0b29sVGVybWluYWwgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCAnL290aGVyJyk7XG5cdFx0dG9vbFRlcm1pbmFsLl90ZXN0U2V0U2hlbGxMYXVuY2hDb25maWcoe1xuXHRcdFx0aGlkZUZyb21Vc2VyOiB0cnVlLFxuXHRcdFx0YXR0YWNoUGVyc2lzdGVudFByb2Nlc3M6IHt9IGFzIG5ldmVyLFxuXHRcdH0gYXMgSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0b29sVGVybWluYWwuaW5zdGFuY2VJZCwgdG9vbFRlcm1pbmFsKTtcblxuXHRcdG9uRGlkQ3JlYXRlSW5zdGFuY2UuZmlyZSh0b29sVGVybWluYWwpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5vayghbW92ZVRvQmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkKSwgJ2hpZGRlbiB0b29sIHRlcm1pbmFsIHNob3VsZCBub3QgYmUgbW92ZWQgdG8gYmFja2dyb3VuZCBvbiByZXN0b3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zZmVycyB0cmFja2VkIHRlcm1pbmFscyB3aGVuIGEgc2Vzc2lvbiBpcyByZXBsYWNlZCAoZ3JhZHVhdGlvbiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3QgdW50aXRsZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6dW50aXRsZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgY29tbWl0dGVkU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmNvbW1pdHRlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblxuXHRcdC8vIEVuc3VyZSBhIHRlcm1pbmFsIGZvciB0aGUgdW50aXRsZWQgc2Vzc2lvblxuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIHVudGl0bGVkU2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCB0ZXJtaW5hbElkID0gWy4uLnRlcm1pbmFsSW5zdGFuY2VzLmtleXMoKV1bMF07XG5cblx0XHQvLyBGaXJlIG9uRGlkUmVwbGFjZVNlc3Npb24gdG8gdHJhbnNmZXIgdHJhY2tpbmdcblx0XHRvbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tOiB1bnRpdGxlZFNlc3Npb24sIHRvOiBjb21taXR0ZWRTZXNzaW9uIH0pO1xuXG5cdFx0Ly8gTm93IHJlbW92aW5nIHRoZSBvbGQgc2Vzc2lvbiBzaG91bGQgbm90IGtpbGwgdGhlIHRlcm1pbmFsIHNpbmNlXG5cdFx0Ly8gdHJhY2tpbmcgd2FzIHRyYW5zZmVycmVkIHRvIHRoZSBjb21taXR0ZWQgc2Vzc2lvblxuXHRcdGFjdGl2ZUluc3RhbmNlSWQgPSB1bmRlZmluZWQ7IC8vIHRlcm1pbmFsIGlzIG5vdCBmb2N1c2VkXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbdW50aXRsZWRTZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCwgJ3Rlcm1pbmFsIHNob3VsZCBzdXJ2aXZlIGdyYWR1YXRpb24gYmVjYXVzZSB0cmFja2luZyB3YXMgdHJhbnNmZXJyZWQnKTtcblx0XHRhc3NlcnQub2sodGVybWluYWxJbnN0YW5jZXMuaGFzKHRlcm1pbmFsSWQpLCAndGVybWluYWwgc2hvdWxkIHN0aWxsIGV4aXN0Jyk7XG5cblx0XHQvLyBBbmQgZW5zdXJlVGVybWluYWwgZm9yIHRoZSBjb21taXR0ZWQgc2Vzc2lvbiBzaG91bGQgcmV1c2UsIG5vdCBjcmVhdGVcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBjb21taXR0ZWRTZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEsICdzaG91bGQgcmV1c2UgdGhlIHRyYW5zZmVycmVkIHRlcm1pbmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbnN0YW5jZUlkLCB0ZXJtaW5hbElkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW5zIHVwIHRyYWNrZWQgdGVybWluYWwgaWRzIHdoZW4gdGVybWluYWxzIGFyZSBleHRlcm5hbGx5IGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXG5cdFx0Ly8gRW5zdXJlIGEgdGVybWluYWwgZm9yIHRoZSBzZXNzaW9uXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IFsuLi50ZXJtaW5hbEluc3RhbmNlcy52YWx1ZXMoKV1bMF0gYXMgVGVzdFRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHQvLyBFeHRlcm5hbGx5IGRpc3Bvc2UgdGhlIHRlcm1pbmFsICh1c2VyIGNsb3NlcyB0aGUgdGFiKVxuXHRcdGluc3RhbmNlLl90ZXN0U2V0RGlzcG9zZWQodHJ1ZSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuZGVsZXRlKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdG9uRGlkRGlzcG9zZUluc3RhbmNlLmZpcmUoaW5zdGFuY2UpO1xuXG5cdFx0Ly8gTm93IGVuc3VyZVRlcm1pbmFsIHNob3VsZCBjcmVhdGUgYSBuZXcgdGVybWluYWwgc2luY2UgdGhlIHRyYWNrZWQgb25lIHdhcyBkaXNwb3NlZFxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMiwgJ3Nob3VsZCBjcmVhdGUgYSBuZXcgdGVybWluYWwgc2luY2UgdGhlIHRyYWNrZWQgb25lIHdhcyBkaXNwb3NlZCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHRbMF0uaW5zdGFuY2VJZCwgaW5zdGFuY2UuaW5zdGFuY2VJZCwgJ3Nob3VsZCBiZSBhIGRpZmZlcmVudCB0ZXJtaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnRyYWNrZWQgcmVzdG9yZWQgdGVybWluYWxzIGFyZSB2aXNpYmxlIGFsb25nc2lkZSB0cmFja2VkIHRlcm1pbmFscyBmb3IgdGhlIHNhbWUgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24nLCB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSByZXN0b3JlZCB0ZXJtaW5hbCBhdCB0aGUgc2FtZSBjd2QgKG5vdCB0cmFja2VkKVxuXHRcdGNvbnN0IHJlc3RvcmVkVGVybWluYWwgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCBjd2QuZnNQYXRoKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQocmVzdG9yZWRUZXJtaW5hbC5pbnN0YW5jZUlkLCByZXN0b3JlZFRlcm1pbmFsKTtcblx0XHRiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuYWRkKHJlc3RvcmVkVGVybWluYWwuaW5zdGFuY2VJZCk7XG5cblx0XHQvLyBBY3RpdmF0ZSB0aGUgc2Vzc2lvbiBcdTIwMTQgdGhpcyBjcmVhdGVzIGEgdHJhY2tlZCB0ZXJtaW5hbFxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gVGhlIHJlc3RvcmVkIHRlcm1pbmFsIHNob3VsZCBoYXZlIGJlZW4gc2hvd24gKHZpYSBjd2QgZmFsbGJhY2spXG5cdFx0Ly8gcmF0aGVyIHRoYW4gbGVmdCBpbiB0aGUgYmFja2dyb3VuZFxuXHRcdGFzc2VydC5vayhzaG93QmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKHJlc3RvcmVkVGVybWluYWwuaW5zdGFuY2VJZCksICd1bnRyYWNrZWQgcmVzdG9yZWQgdGVybWluYWwgYXQgbWF0Y2hpbmcgY3dkIHNob3VsZCBiZSBzaG93bicpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiB0aWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixrQkFBa0I7QUFDNUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBMEMsaUNBQWlDO0FBQzNFLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsWUFBWTtBQUNyQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQixtQkFBbUI7QUFDNUMsU0FBNEIsd0JBQXdCO0FBQ3BELFNBQWdFLDBCQUEwQjtBQUMxRixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUE2RDtBQUN0RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FB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
