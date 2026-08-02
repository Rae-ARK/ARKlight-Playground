import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { autorun, constObservable, observableValue } from "../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatWidgetHistoryService } from "../../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js";
import { nullExtensionDescription } from "../../../../../workbench/services/extensions/common/extensions.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../../common/session.js";
import { SessionsManagementService } from "../../browser/sessionsManagementService.js";
import { ISessionsManagementService, inheritableSessionTarget, WorkspaceNotTrustedError } from "../../common/sessionsManagement.js";
import { SessionsService } from "../../browser/sessionsService.js";
import { ISessionsPartService } from "../../browser/sessionsPartService.js";
import { CustomViewService, ICustomViewService } from "../../../customView/browser/customViewService.js";
import { ISessionsProvidersService } from "../../browser/sessionsProvidersService.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../common/agentHostSessionsProvider.js";
const stubChat = {
  resource: URI.parse("test:///chat"),
  createdAt: /* @__PURE__ */ new Date(),
  title: constObservable("Chat"),
  updatedAt: constObservable(/* @__PURE__ */ new Date()),
  status: constObservable(0),
  changes: constObservable([]),
  checkpoints: constObservable(void 0),
  modelId: constObservable(void 0),
  mode: constObservable(void 0),
  isArchived: constObservable(false),
  isRead: constObservable(true),
  interactivity: constObservable(ChatInteractivity.Full),
  description: constObservable(void 0),
  lastTurnEnd: constObservable(void 0)
};
function stubSession(overrides) {
  return {
    resource: URI.parse(`test:///${overrides.sessionId}`),
    sessionType: "test",
    icon: Codicon.vm,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: constObservable(void 0),
    title: constObservable("Test"),
    updatedAt: constObservable(/* @__PURE__ */ new Date()),
    status: constObservable(0),
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: constObservable(void 0),
    mode: constObservable(void 0),
    loading: constObservable(false),
    isArchived: constObservable(false),
    isRead: constObservable(true),
    description: constObservable(void 0),
    lastTurnEnd: constObservable(void 0),
    chats: constObservable([]),
    mainChat: constObservable(stubChat),
    capabilities: constObservable({ supportsMultipleChats: false }),
    ...overrides
  };
}
class TestChatWidgetService extends mock() {
  constructor() {
    super(...arguments);
    this.opened = [];
    this._widgetSessionResources = /* @__PURE__ */ new Set();
  }
  async openSession(sessionResource, _target, _options) {
    this.opened.push(sessionResource);
    return void 0;
  }
  /** Simulate a session being displayed in a chat widget. */
  setWidgetSessionResource(resource) {
    this._widgetSessionResources.add(resource.toString());
  }
  clearWidgetSessionResources() {
    this._widgetSessionResources.clear();
  }
  getWidgetBySessionResource(sessionResource) {
    if (this._widgetSessionResources.has(sessionResource.toString())) {
      return {};
    }
    return void 0;
  }
}
class TestChatService extends mock() {
  constructor() {
    super(...arguments);
    this.onDidSubmitRequest = Event.None;
    this.cancelledResources = [];
  }
  async cancelCurrentRequestForSession(sessionResource) {
    this.cancelledResources.push(sessionResource);
  }
}
class TestProgressService extends mock() {
  async withProgress(_options, task) {
    return task({ report() {
    } });
  }
}
class TestWorkspaceTrustManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.trusted = true;
    this.requestedUris = [];
  }
  async getUriTrustInfo(uri) {
    this.requestedUris.push(uri);
    return { uri, trusted: this.trusted };
  }
}
class TestSessionsProvidersService extends mock() {
  constructor(_providers) {
    super();
    this._providers = _providers;
    this.onDidChangeProviders = Event.None;
  }
  registerProvider() {
    throw new Error("not implemented");
  }
  getProviders() {
    return [...this._providers].sort((a, b) => a.order - b.order);
  }
  getProvider(providerId) {
    return this._providers.find((provider) => provider.id === providerId);
  }
}
class TestSessionsProvider extends mock() {
  constructor(_session) {
    super();
    this._session = _session;
    this.id = "test";
    this.label = "Test";
    this.icon = Codicon.vm;
    this.order = 0;
    this.sessionTypes = [{ id: "test", label: "Test", icon: Codicon.vm, supportsWorktreeConfiguration: true }];
    this.onDidChangeSessionTypes = Event.None;
    this.onDidChangeSessions = Event.None;
    this.browseActions = [];
    this.onDidChangeModels = Event.None;
  }
  getSessions() {
    return [this._session];
  }
  resolveWorkspace(_folderUri) {
    return void 0;
  }
  createNewSession(_folderUri, _sessionTypeId) {
    return this._session;
  }
  getSessionTypes(_folderUri) {
    return [...this.sessionTypes];
  }
  async renameChat() {
  }
  getModelsSnapshot() {
    return { models: [], desiredModelResolution: { kind: "notRequested" }, modelTarget: void 0 };
  }
  getModelPickerOptions() {
    return { useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false };
  }
  setModel(_sessionId, _modelId) {
  }
  async archiveSession() {
  }
  async unarchiveSession() {
  }
  async deleteSession() {
  }
  async deleteSessions(_sessionIds) {
  }
  async deleteChat() {
    return true;
  }
  deleteNewSession(_sessionId) {
  }
  async sendRequest(_sessionId, _chatResource, _options) {
    return this._session;
  }
  async createNewChat() {
    return this._session.mainChat.get();
  }
  async forkChat(_sessionId, _sourceChat, _turnId) {
    throw new Error("not implemented");
  }
  async createSideChat(_sessionId, _sourceChat, _turnId, _selection) {
    throw new Error("not implemented");
  }
}
function createSessionsManagementService(session, disposables, provider = new TestSessionsProvider(session), workspaceTrustManagementService = new TestWorkspaceTrustManagementService(), workspaceTrustRequestService) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const chatWidgetService = new TestChatWidgetService();
  const chatService = new TestChatService();
  instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
  instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
  instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
  instantiationService.stub(IChatWidgetService, chatWidgetService);
  instantiationService.stub(IProgressService, new TestProgressService());
  instantiationService.stub(IChatService, chatService);
  instantiationService.stub(IChatWidgetHistoryService, new class extends mock() {
    moveHistory() {
    }
  }());
  instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustManagementService);
  if (workspaceTrustRequestService) {
    instantiationService.stub(IWorkspaceTrustRequestService, workspaceTrustRequestService);
  }
  const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
  const view = createView(instantiationService, service, disposables);
  return { service, view, chatWidgetService, chatService };
}
class TestSessionsPartService extends mock() {
  constructor() {
    super(...arguments);
    this.onDidFocusSession = Event.None;
    this.onDidToggleMaximizeSession = Event.None;
  }
  updateVisibleSessions() {
  }
  focusSession() {
  }
}
function createView(instantiationService, service, disposables) {
  instantiationService.stub(ISessionsManagementService, service);
  instantiationService.stub(ISessionsPartService, new TestSessionsPartService());
  instantiationService.stub(ICustomViewService, disposables.add(new CustomViewService(new NullLogService())));
  return disposables.add(instantiationService.createInstance(SessionsService));
}
suite("SessionsManagementService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("openSession waits for a loading session before opening chat content", async () => {
    const loading = observableValue("loading", true);
    const session = stubSession({ sessionId: "loading", providerId: "test", loading });
    const { view } = createSessionsManagementService(session, disposables);
    let resolved = false;
    const openPromise = view.openSession(session.resource).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    assert.deepStrictEqual({ resolved }, { resolved: false });
    loading.set(false, void 0);
    await openPromise;
    assert.deepStrictEqual({ resolved }, { resolved: true });
  });
  test("marks the active session as read via its provider even when its provider state was unread", async () => {
    const isRead = observableValue("isRead", false);
    const session = stubSession({ sessionId: "unread", providerId: "test", isRead });
    const provider = new class extends TestSessionsProvider {
      async setSessionReadState(_sessionId, read) {
        isRead.set(read, void 0);
      }
    }(session);
    const { view } = createSessionsManagementService(session, disposables, provider);
    const readBeforeActive = session.isRead.get();
    await view.openSession(session.resource);
    const readWhileActive = session.isRead.get();
    assert.deepStrictEqual(
      { readBeforeActive, readWhileActive, activeId: view.activeSession.get()?.sessionId },
      { readBeforeActive: false, readWhileActive: true, activeId: "unread" }
    );
  });
  test("leaves a non-active session in its provider read state", () => {
    const active = stubSession({ sessionId: "active", providerId: "test" });
    const other = stubSession({ sessionId: "other", providerId: "test", isRead: constObservable(false) });
    const { view } = createSessionsManagementService(active, disposables);
    assert.deepStrictEqual(
      { activeId: view.activeSession.get()?.sessionId, otherRead: other.isRead.get() },
      { activeId: void 0, otherRead: false }
    );
  });
  test("does not change active session when added session is not displayed in any widget", async () => {
    const originalSession = stubSession({ sessionId: "original", providerId: "test" });
    const onDidChangeSessions = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(originalSession);
        this.onDidChangeSessions = onDidChangeSessions.event;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const chatWidgetService = new TestChatWidgetService();
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, chatWidgetService);
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    await view.openSession(originalSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "original");
    const otherSession = stubSession({ sessionId: "other", providerId: "test" });
    onDidChangeSessions.fire({ added: [otherSession], removed: [], changed: [] });
    assert.strictEqual(view.activeSession.get()?.sessionId, "original");
  });
  test("getSessionForChatResource returns the session that owns the chat", () => {
    const chatA = { ...stubChat, resource: URI.parse("test:///chat-a") };
    const chatB = { ...stubChat, resource: URI.parse("test:///CHAT-B") };
    const sessionA = stubSession({
      sessionId: "a",
      providerId: "test",
      chats: constObservable([chatA]),
      mainChat: constObservable(chatA)
    });
    const sessionB = stubSession({
      sessionId: "b",
      providerId: "test",
      chats: constObservable([chatB]),
      mainChat: constObservable(chatB)
    });
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(sessionA);
      }
      getSessions() {
        return [sessionA, sessionB];
      }
    }();
    const { service } = createSessionsManagementService(sessionA, disposables, provider);
    const ownedChat = service.getSessionForChatResource(URI.parse("test:///chat-b"));
    assert.deepStrictEqual({
      sessionId: ownedChat?.session.sessionId,
      chat: ownedChat?.chat,
      missing: service.getSessionForChatResource(URI.parse("test:///missing"))
    }, {
      sessionId: "b",
      chat: chatB,
      missing: void 0
    });
  });
  test("restoreVisibleSessions waits for session to appear via onDidChangeSessions", async () => {
    const targetSession = stubSession({ sessionId: "target", providerId: "test" });
    const onDidChangeSessions = disposables.add(new Emitter());
    let sessions = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(targetSession);
        this.onDidChangeSessions = onDidChangeSessions.event;
      }
      getSessions() {
        return sessions;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const chatWidgetService = new TestChatWidgetService();
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
      1,
      1
    );
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, chatWidgetService);
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    const restorePromise = view.restoreVisibleSessions();
    await Promise.resolve();
    assert.deepStrictEqual(view.visibleSessions.get().filter((s) => !!s).map((s) => s.sessionId), []);
    sessions = [targetSession];
    onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
    await restorePromise;
    assert.deepStrictEqual(view.visibleSessions.get().map((s) => s?.sessionId), [targetSession.sessionId]);
  });
  test("ROUNDTRIP: opened session is retained across save + restore", async () => {
    const createdChat = { ...stubChat, resource: URI.parse("test:///chat-x"), status: constObservable(1) };
    const session = stubSession({
      sessionId: "x",
      providerId: "test",
      status: constObservable(1),
      chats: constObservable([createdChat]),
      mainChat: constObservable(createdChat)
    });
    const provider = new TestSessionsProvider(session);
    const storage = disposables.add(new InMemoryStorageService());
    const makeService = () => {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, storage);
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
      instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
      instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
      instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
      instantiationService.stub(IProgressService, new TestProgressService());
      instantiationService.stub(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidSubmitRequest = Event.None;
        }
      }());
      const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
      const view = createView(instantiationService, service, disposables);
      return { service, view };
    };
    const first = makeService();
    await first.view.openSession(session.resource);
    assert.strictEqual(first.view.activeSession.get()?.sessionId, "x");
    await storage.flush();
    const second = makeService();
    await second.view.restoreVisibleSessions();
    assert.deepStrictEqual({
      visible: second.view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: second.view.activeSession.get()?.sessionId ?? null
    }, {
      visible: ["x"],
      active: "x"
    });
  });
  test("RACE: a new session created during restore does not drop the restored session", async () => {
    const targetSession = stubSession({ sessionId: "target", providerId: "test" });
    const newSession = stubSession({ sessionId: "fresh", providerId: "test" });
    const onDidChangeSessions = disposables.add(new Emitter());
    let sessions = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(targetSession);
        this.onDidChangeSessions = onDidChangeSessions.event;
      }
      getSessions() {
        return sessions;
      }
      createNewSession() {
        return newSession;
      }
      resolveWorkspace() {
        return { folders: [], isVirtualWorkspace: false };
      }
    }();
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
      1,
      1
    );
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    const restorePromise = view.restoreVisibleSessions();
    await Promise.resolve();
    service.createNewSession(URI.parse("file:///folder"));
    sessions = [targetSession];
    onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
    await restorePromise;
    assert.deepStrictEqual({
      hasTarget: view.visibleSessions.get().some((s) => s?.sessionId === "target"),
      active: view.activeSession.get()?.sessionId ?? null
    }, {
      hasTarget: true,
      active: "target"
    });
  });
  test.skip("openNewSession inherits the active session workspace when requested", async () => {
    const makeWorkspace = (uri) => ({
      uri,
      label: "ws",
      icon: Codicon.vm,
      folders: [{ root: uri, workingDirectory: uri, name: "ws", description: void 0 }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    });
    const workspaceB = URI.parse("file:///workspaceB");
    const openSession = stubSession({ sessionId: "open", providerId: "test", workspace: constObservable(makeWorkspace(workspaceB)) });
    let createdFolderUri;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(openSession);
      }
      getSessions() {
        return [openSession];
      }
      resolveWorkspace(folderUri) {
        return makeWorkspace(folderUri);
      }
      createNewSession(folderUri) {
        createdFolderUri = folderUri;
        return stubSession({ sessionId: "inherited", providerId: "test", workspace: constObservable(makeWorkspace(folderUri)) });
      }
    }();
    const { view } = createSessionsManagementService(openSession, disposables, provider);
    await view.openSession(openSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "open");
    view.openNewSession();
    assert.deepStrictEqual({
      createdFor: createdFolderUri?.toString() ?? null,
      activeSession: view.activeSession.get()?.sessionId ?? null,
      activeWorkspace: view.activeSession.get()?.workspace.get()?.folders[0]?.root.toString() ?? null
    }, {
      createdFor: workspaceB.toString(),
      activeSession: "inherited",
      activeWorkspace: workspaceB.toString()
    });
  });
  test("openNewSession does not inherit the active session workspace by default", async () => {
    const workspaceB = URI.parse("file:///workspaceB");
    const openSession = stubSession({
      sessionId: "open",
      providerId: "test",
      workspace: constObservable({
        uri: workspaceB,
        label: "ws",
        icon: Codicon.vm,
        folders: [{ root: workspaceB, workingDirectory: workspaceB, name: "ws", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      })
    });
    let createNewSessionCalled = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(openSession);
      }
      getSessions() {
        return [openSession];
      }
      createNewSession() {
        createNewSessionCalled = true;
        return openSession;
      }
    }();
    const { view } = createSessionsManagementService(openSession, disposables, provider);
    await view.openSession(openSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "open");
    view.openNewSession();
    assert.deepStrictEqual({
      createNewSessionCalled,
      activeSession: view.activeSession.get()?.sessionId ?? null
    }, {
      createNewSessionCalled: false,
      activeSession: null
    });
  });
  test("cancelled openNewSession does not replace a newer draft after workspace trust resolves", async () => {
    const staleFolder = URI.file("/stale");
    const latestFolder = URI.file("/latest");
    const makeWorkspace = (uri) => ({
      uri,
      label: uri.path,
      icon: Codicon.folder,
      folders: [{ root: uri, workingDirectory: uri, name: uri.path, description: void 0 }],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: false
    });
    const staleSession = stubSession({ sessionId: "stale", providerId: "test", workspace: constObservable(makeWorkspace(staleFolder)) });
    const latestSession = stubSession({ sessionId: "latest", providerId: "test", workspace: constObservable(makeWorkspace(latestFolder)) });
    const createdFolders = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(latestSession);
      }
      resolveWorkspace(folderUri) {
        return makeWorkspace(folderUri);
      }
      createNewSession(folderUri) {
        createdFolders.push(folderUri.toString());
        return folderUri.toString() === staleFolder.toString() ? staleSession : latestSession;
      }
    }();
    const staleTrust = new DeferredPromise();
    let trustRequestCount = 0;
    const trustRequestService = new class extends mock() {
      requestResourcesTrust() {
        trustRequestCount++;
        return trustRequestCount === 1 ? staleTrust.p : Promise.resolve(true);
      }
    }();
    const { view } = createSessionsManagementService(
      latestSession,
      disposables,
      provider,
      new TestWorkspaceTrustManagementService(),
      trustRequestService
    );
    const staleCts = disposables.add(new CancellationTokenSource());
    const staleOpen = view.openNewSession({ folderUri: staleFolder }, staleCts.token);
    await Promise.resolve();
    staleCts.cancel();
    const latestResult = await view.openNewSession({ folderUri: latestFolder });
    staleTrust.complete(true);
    const staleResult = await staleOpen;
    assert.deepStrictEqual({
      createdFolders,
      activeSessionId: view.activeSession.get()?.sessionId,
      latestSessionId: latestResult.session?.sessionId,
      staleSessionId: staleResult.session?.sessionId
    }, {
      createdFolders: [latestFolder.toString()],
      activeSessionId: "latest",
      latestSessionId: "latest",
      staleSessionId: void 0
    });
  });
  test.skip("openNewSession recreates a draft for the active session workspace when inheriting", async () => {
    const makeWorkspace = (uri) => ({
      uri,
      label: "ws",
      icon: Codicon.vm,
      folders: [{ root: uri, workingDirectory: uri, name: "ws", description: void 0 }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    });
    const workspaceA = URI.parse("file:///workspaceA");
    const openSession = stubSession({ sessionId: "open", providerId: "test", workspace: constObservable(makeWorkspace(workspaceA)) });
    const pendingSession = stubSession({ sessionId: "pending", providerId: "test", workspace: constObservable(makeWorkspace(workspaceA)) });
    let createNewSessionCount = 0;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(openSession);
      }
      getSessions() {
        return [openSession];
      }
      resolveWorkspace(folderUri) {
        return makeWorkspace(folderUri);
      }
      createNewSession() {
        createNewSessionCount++;
        return pendingSession;
      }
    }();
    const { view } = createSessionsManagementService(openSession, disposables, provider);
    view.openNewSession({ folderUri: workspaceA });
    assert.strictEqual(view.activeSession.get()?.sessionId, "pending");
    await view.openSession(openSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "open");
    view.openNewSession();
    assert.deepStrictEqual({
      createNewSessionCount,
      activeSession: view.activeSession.get()?.sessionId ?? null
    }, {
      createNewSessionCount: 2,
      activeSession: "pending"
    });
  });
  test("restoreVisibleSessions restores the grid order, sticky and active state", async () => {
    const sessionA = stubSession({ sessionId: "a", providerId: "test" });
    const sessionB = stubSession({ sessionId: "b", providerId: "test" });
    const sessionC = stubSession({ sessionId: "c", providerId: "test" });
    const sessions = [sessionA, sessionB, sessionC];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(sessionA);
      }
      getSessions() {
        return sessions;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([
        { sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: true, isActive: false },
        { sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true },
        { sessionResource: sessionC.resource.toString(), visibleOrder: 2, isSticky: false, isActive: false }
      ]),
      1,
      1
    );
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    await view.restoreVisibleSessions();
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      sticky: view.visibleSessions.get().map((s) => s?.sticky.get() ?? false),
      active: view.activeSession.get()?.sessionId
    }, {
      visible: ["a", "b", "c"],
      sticky: [true, false, false],
      active: "b"
    });
  });
  test("restoreVisibleSessions lays out the grid atomically without intermediate single-session states", async () => {
    const sessionA = stubSession({ sessionId: "a", providerId: "test" });
    const sessionB = stubSession({ sessionId: "b", providerId: "test" });
    const sessions = [sessionA, sessionB];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(sessionA);
      }
      getSessions() {
        return sessions;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([
        { sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: false, isActive: false },
        { sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true }
      ]),
      1,
      1
    );
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    const states = [];
    disposables.add(autorun((reader) => {
      states.push(view.visibleSessions.read(reader).map((s) => s?.sessionId ?? null));
    }));
    await view.restoreVisibleSessions();
    const showedActiveAlone = states.some((s) => s.length === 1 && s[0] === "b");
    assert.deepStrictEqual({
      showedActiveAlone,
      final: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: view.activeSession.get()?.sessionId
    }, {
      showedActiveAlone: false,
      final: ["a", "b"],
      active: "b"
    });
  });
  test("sendNewChatRequest keeps the started session active for a foreground send", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const { service, view } = createSessionsManagementService(session, disposables);
    await view.openSession(session.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "s1");
    await service.sendNewChatRequest(session, { query: "hi" });
    assert.strictEqual(view.activeSession.get()?.sessionId, "s1");
  });
  test("sendNewChatRequest with background resolves before provider send commits", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let completeSendRequest;
    let sendRequestStarted = false;
    const provider = new class extends TestSessionsProvider {
      async sendRequest(_sessionId, _chatResource, _options) {
        sendRequestStarted = true;
        await new Promise((resolve) => {
          completeSendRequest = resolve;
        });
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const sendPromise = service.sendNewChatRequest(session, { query: "hi", background: true });
    await sendPromise;
    assert.strictEqual(sendRequestStarted, true);
    completeSendRequest?.();
  });
  test("sendRequest with background is fire-and-forget and does not fire onWillSendRequest", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat"), status: constObservable(SessionStatus.Untitled) };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let completeSendRequest;
    let sentChatResource;
    const provider = new class extends TestSessionsProvider {
      async sendRequest(_sessionId, chatResource, _options) {
        sentChatResource = chatResource;
        await new Promise((resolve) => {
          completeSendRequest = resolve;
        });
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    let willSendCount = 0;
    disposables.add(service.onWillSendRequest(() => willSendCount++));
    await service.sendRequest(session, chat, { query: "hi", background: true });
    assert.deepStrictEqual({
      sentChatResource: sentChatResource?.toString(),
      willSendCount
    }, {
      sentChatResource: chat.resource.toString(),
      willSendCount: 0
    });
    completeSendRequest?.();
  });
  test("send-follow activates only visible chat tabs", async () => {
    const mainChat = { ...stubChat, resource: URI.parse("test:///chat/main"), title: constObservable("main") };
    const sideChat = { ...stubChat, resource: URI.parse("test:///chat/side"), title: constObservable("side"), origin: { kind: ChatOriginKind.SideChat } };
    const toolChat = { ...stubChat, resource: URI.parse("test:///chat/tool"), title: constObservable("tool"), origin: { kind: ChatOriginKind.Tool }, interactivity: constObservable(ChatInteractivity.ReadOnly) };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([mainChat, sideChat, toolChat]),
      mainChat: constObservable(mainChat),
      capabilities: constObservable({ supportsMultipleChats: true })
    });
    const provider = new class extends TestSessionsProvider {
      async sendRequest(_sessionId, _chatResource, _options) {
        return session;
      }
    }(session);
    const { service, view } = createSessionsManagementService(session, disposables, provider);
    await view.openSession(session.resource);
    await view.openChat(session, sideChat.resource);
    await service.sendRequest(session, toolChat, { query: "hidden tool" });
    await Promise.resolve();
    const afterHiddenSend = view.activeSession.get()?.activeChat.get().resource.toString();
    await view.openChat(session, toolChat.resource);
    await service.sendRequest(session, toolChat, { query: "visible tool" });
    await Promise.resolve();
    const afterVisibleSend = view.activeSession.get()?.activeChat.get().resource.toString();
    assert.deepStrictEqual({
      visibleTabs: view.activeSession.get()?.visibleChatTabs.get().map((chat) => chat.title.get()),
      afterHiddenSend,
      afterVisibleSend
    }, {
      visibleTabs: ["main", "side", "tool"],
      afterHiddenSend: sideChat.resource.toString(),
      afterVisibleSend: toolChat.resource.toString()
    });
  });
  test("createAndSendNewChatRequest sends without changing the active view", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let sendRequestStarted = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        sendRequestStarted = true;
        return session;
      }
    }(session);
    const { service, view } = createSessionsManagementService(session, disposables, provider);
    assert.strictEqual(view.activeSession.get(), void 0);
    await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" });
    assert.strictEqual(sendRequestStarted, true);
    assert.strictEqual(view.activeSession.get(), void 0);
  });
  test("createAndSendNewChatRequest refuses an untrusted required workspace before creating a session", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const folderUri = URI.parse("test:///folder");
    let resolveCount = 0;
    let createCount = 0;
    let sendCount = 0;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(uri) {
        resolveCount++;
        return {
          uri,
          label: "Test",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: true,
          isVirtualWorkspace: false
        };
      }
      createNewSession() {
        createCount++;
        return session;
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        sendCount++;
        return session;
      }
    }(session);
    const workspaceTrustManagementService = new TestWorkspaceTrustManagementService();
    workspaceTrustManagementService.trusted = false;
    const { service } = createSessionsManagementService(session, disposables, provider, workspaceTrustManagementService);
    await assert.rejects(
      service.createAndSendNewChatRequest(folderUri, { query: "hi" }),
      WorkspaceNotTrustedError
    );
    workspaceTrustManagementService.trusted = true;
    await service.createAndSendNewChatRequest(folderUri, { query: "hi" });
    assert.deepStrictEqual({
      requestedUris: workspaceTrustManagementService.requestedUris.map((uri) => uri.toString()),
      resolveCount,
      createCount,
      sendCount
    }, {
      requestedUris: [folderUri.toString(), folderUri.toString()],
      resolveCount: 2,
      createCount: 1,
      sendCount: 1
    });
  });
  test("target availability requires the requested provider and session type to be advertised", () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const availableFolder = URI.parse("test:///available");
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
        this.sessionTypes = [
          { id: "workspace-agent", label: "Workspace Agent", icon: Codicon.vm },
          { id: "quick-agent", label: "Quick Agent", icon: Codicon.vm }
        ];
      }
      resolveWorkspace(folderUri) {
        return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? { folderUri } : void 0;
      }
      getSessionTypes(folderUri) {
        return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? [this.sessionTypes[0]] : [];
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    assert.deepStrictEqual({
      defaultWorkspace: service.isNewSessionTargetAvailable(availableFolder),
      exactWorkspace: service.isNewSessionTargetAvailable(availableFolder, { providerId: "test", sessionTypeId: "workspace-agent" }),
      wrongWorkspaceType: service.isNewSessionTargetAvailable(availableFolder, { providerId: "test", sessionTypeId: "quick-agent" }),
      missingWorkspace: service.isNewSessionTargetAvailable(URI.parse("test:///missing")),
      exactQuickChat: service.isQuickChatTargetAvailable({ providerId: "test", sessionTypeId: "quick-agent" }),
      wrongQuickChatProvider: service.isQuickChatTargetAvailable({ providerId: "other", sessionTypeId: "quick-agent" })
    }, {
      defaultWorkspace: true,
      exactWorkspace: true,
      wrongWorkspaceType: false,
      missingWorkspace: false,
      exactQuickChat: true,
      wrongQuickChatProvider: false
    });
  });
  test("createNewSession rejects a pinned session type that is not advertised", () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    assert.throws(
      () => service.createNewSession(URI.parse("test:///folder"), { providerId: "test", sessionTypeId: "missing" }),
      /does not advertise session type 'missing'/
    );
  });
  test("inheritableSessionTarget drops a harness the folder no longer offers", () => {
    const folderUri = URI.parse("test:///folder");
    const hiddenHarnessSession = stubSession({ sessionId: "s1", providerId: "test", sessionType: "copilotcli" });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(_folderUri) {
        return { folderUri: _folderUri };
      }
      getSessionTypes() {
        return [{ id: "test", label: "Test", icon: Codicon.vm }];
      }
    }(hiddenHarnessSession);
    const { service } = createSessionsManagementService(hiddenHarnessSession, disposables, provider);
    const stillOfferedSession = stubSession({ sessionId: "s2", providerId: "test", sessionType: "test" });
    assert.deepStrictEqual({
      hiddenHarness: inheritableSessionTarget(service, hiddenHarnessSession, folderUri),
      offeredHarness: inheritableSessionTarget(service, stillOfferedSession, folderUri),
      noFolder: inheritableSessionTarget(service, stillOfferedSession, void 0),
      noSession: inheritableSessionTarget(service, void 0, folderUri)
    }, {
      hiddenHarness: {},
      offeredHarness: { providerId: "test", sessionTypeId: "test" },
      noFolder: {},
      noSession: {}
    });
  });
  test("a New Session gesture whose harness is hidden still creates on the fallback provider", async () => {
    const folderUri = URI.parse("test:///folder");
    const extHostSession = stubSession({ sessionId: "exthost-1", providerId: "copilot", sessionType: "copilotcli" });
    const created = [];
    const copilot = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.id = "copilot";
        this.order = 0;
        this.sessionTypes = [];
      }
      resolveWorkspace(_folderUri) {
        return { folderUri: _folderUri };
      }
      getSessionTypes() {
        return [];
      }
      getSessions() {
        return [extHostSession];
      }
    }(extHostSession);
    const agentHostSession = stubSession({ sessionId: "ah-draft", providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: "copilotcli" });
    const agentHost = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.id = LOCAL_AGENT_HOST_PROVIDER_ID;
        this.order = -1;
        this.sessionTypes = [{ id: "copilotcli", label: "Copilot", icon: Codicon.vm }];
      }
      resolveWorkspace(_folderUri) {
        return { folderUri: _folderUri };
      }
      getSessionTypes() {
        return [{ id: "copilotcli", label: "Copilot", icon: Codicon.vm }];
      }
      getSessions() {
        return [];
      }
      createNewSession(_folderUri, sessionTypeId) {
        created.push({ providerId: this.id, sessionTypeId });
        return agentHostSession;
      }
    }(agentHostSession);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilot, agentHost]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new TestChatService());
    instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock() {
      async requestResourcesTrust() {
        return true;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    await view.openSession(extHostSession.resource);
    const active = view.activeSession.get();
    const result = await view.openNewSession({
      folderUri,
      ...inheritableSessionTarget(service, active, folderUri)
    });
    assert.deepStrictEqual({
      created,
      resultProviderId: result.session?.providerId,
      trustDeclined: result.trustDeclined
    }, {
      created: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: "copilotcli" }],
      resultProviderId: LOCAL_AGENT_HOST_PROVIDER_ID,
      trustDeclined: false
    });
  });
  test("createAndSendQuickChatRequest uses the quick-chat contract without navigation or repository configuration", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///quick-chat") };
    const activeSession = stubSession({ sessionId: "active", providerId: "test" });
    const quickChat = stubSession({
      sessionId: "quick-1",
      providerId: "test",
      isQuickChat: constObservable(true),
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
      }
      getSessions() {
        return [activeSession];
      }
      createQuickChat(sessionTypeId) {
        calls.push(`createQuickChat:${sessionTypeId}`);
        return quickChat;
      }
      setModel(_sessionId, modelId) {
        calls.push(`setModel:${modelId}`);
      }
      setIsolationMode() {
        throw new Error("isolation should not be configured");
      }
      setBranch() {
        throw new Error("branch should not be configured");
      }
      async sendRequest() {
        calls.push("send");
        return quickChat;
      }
    }(quickChat);
    const { service, view } = createSessionsManagementService(activeSession, disposables, provider);
    await view.openSession(activeSession.resource);
    const result = await service.createAndSendQuickChatRequest({ query: "hi" }, {
      providerId: "test",
      sessionTypeId: "test",
      modelId: "gpt-4o",
      isolationMode: "worktree",
      branch: "stale"
    });
    assert.deepStrictEqual({
      sessionId: result?.sessionId,
      activeSession: view.activeSession.get()?.sessionId,
      newSession: service.newSession.get(),
      calls
    }, {
      sessionId: "quick-1",
      activeSession: "active",
      newSession: void 0,
      calls: ["createQuickChat:test", "setModel:gpt-4o", "send"]
    });
  });
  test("createAndSendQuickChatRequest cancels commit detection and disposes the provisional draft", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///quick-chat") };
    const session = stubSession({
      sessionId: "quick-1",
      providerId: "test",
      isQuickChat: constObservable(true),
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const sendStarted = new DeferredPromise();
    const sendDone = new DeferredPromise();
    const sendReturned = new DeferredPromise();
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
      }
      createQuickChat() {
        return session;
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest() {
        await sendStarted.complete();
        await sendDone.p;
        await sendReturned.complete();
        return session;
      }
    }(session);
    const { service, chatService } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    let started = 0;
    let sent = 0;
    disposables.add(service.onDidStartSession(() => started++));
    disposables.add(service.onDidSendRequest(() => sent++));
    const request = service.createAndSendQuickChatRequest({ query: "hi" }, {
      providerId: "test",
      sessionTypeId: "test"
    }, cts.token);
    await sendStarted.p;
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.strictEqual(deleted, true);
    await sendDone.complete();
    await sendReturned.p;
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual({
      cancelledResources: chatService.cancelledResources.map((resource) => resource.toString()),
      started,
      sent
    }, {
      cancelledResources: [chat.resource.toString()],
      started: 0,
      sent: 0
    });
  });
  test("createAndSendNewChatRequest invokes configuration setters from createOptions", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      setModel(_sessionId, _modelId) {
        calls.push(`setModel:${_modelId}`);
      }
      setMode(_sessionId, _modeId) {
        calls.push(`setMode:${_modeId}`);
      }
      setPermissionLevel(_sessionId, _level) {
        calls.push(`setPermissionLevel:${_level}`);
      }
      async setIsolationMode(_sessionId, _mode) {
        calls.push(`setIsolationMode:${_mode}`);
      }
      async setBranch(_sessionId, _branch) {
        calls.push(`setBranch:${_branch}`);
      }
      async setWorktreeBranchTrack(_sessionId, _enabled) {
        calls.push(`setWorktreeBranchTrack:${_enabled}`);
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const createOptions = {
      modelId: "gpt-4o",
      modeId: "agent",
      permissionLevel: "allowedTools",
      isolationMode: "worktree",
      worktreeBranchTrack: false,
      branch: "main"
    };
    const result = await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, createOptions);
    assert.strictEqual(result?.sessionId, "s1");
    assert.deepStrictEqual(calls, [
      "setModel:gpt-4o",
      "setMode:agent",
      "setPermissionLevel:allowedTools",
      "setIsolationMode:worktree",
      "setWorktreeBranchTrack:false",
      "setBranch:main"
    ]);
  });
  test("createAndSendNewChatRequest uses an immediately resolved model identifier", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const resolvedModel = {
      identifier: "target:gpt-4o",
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "GPT-4o",
        vendor: "target",
        family: "gpt-4o",
        version: "1",
        id: "gpt-4o",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      }
    };
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [resolvedModel], desiredModelResolution: { kind: "available", model: resolvedModel }, modelTarget: "target" };
      }
      setModel(_sessionId, modelId) {
        calls.push(`setModel:${modelId}`);
      }
      async sendRequest() {
        calls.push("send");
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "legacy/gpt-4o" });
    assert.deepStrictEqual(calls, ["setModel:target:gpt-4o", "send"]);
  });
  test("createAndSendNewChatRequest waits for and uses the resolved model identifier", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeModels = disposables.add(new Emitter());
    let resolution = { kind: "pending", identifier: "target:gpt-4o" };
    const calls = [];
    const model = {
      identifier: "target:gpt-4o",
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "GPT-4o",
        vendor: "target",
        family: "gpt-4o",
        version: "1",
        id: "gpt-4o",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      }
    };
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeModels = onDidChangeModels.event;
      }
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: resolution, modelTarget: void 0 };
      }
      setModel(_sessionId, modelId) {
        calls.push(`setModel:${modelId}`);
      }
      async sendRequest() {
        calls.push("send");
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "legacy/gpt-4o" });
    await Promise.resolve();
    assert.deepStrictEqual(calls, []);
    resolution = { kind: "available", model };
    onDidChangeModels.fire();
    await request;
    assert.deepStrictEqual(calls, ["setModel:target:gpt-4o", "send"]);
  });
  test("createAndSendNewChatRequest rejects a pending model that becomes unavailable and disposes the draft", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeModels = disposables.add(new Emitter());
    let resolution = { kind: "pending", identifier: "removed-model" };
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeModels = onDidChangeModels.event;
      }
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: resolution, modelTarget: void 0 };
      }
      setModel() {
        throw new Error("setModel should not be called");
      }
      deleteNewSession() {
        deleted = true;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "removed-model" });
    await Promise.resolve();
    resolution = { kind: "unavailable", identifier: "removed-model" };
    onDidChangeModels.fire();
    await assert.rejects(request, /Model 'removed-model' is unavailable/);
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest rejects when the workspace stops advertising the session type", async () => {
    const folderUri = URI.parse("test:///folder");
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeSessionTypes = disposables.add(new Emitter());
    let folderTypeAvailable = true;
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeSessionTypes = onDidChangeSessionTypes.event;
      }
      resolveWorkspace() {
        return { uri: folderUri };
      }
      getSessionTypes(candidate) {
        return folderTypeAvailable && extUriBiasedIgnorePathCase.isEqual(candidate, folderUri) ? [...this.sessionTypes] : [];
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: { kind: "pending", identifier: "gpt-4o" }, modelTarget: void 0 };
      }
      deleteNewSession() {
        deleted = true;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(folderUri, { query: "hi" }, { modelId: "gpt-4o" });
    await Promise.resolve();
    folderTypeAvailable = false;
    onDidChangeSessionTypes.fire();
    await assert.rejects(request, /Session type 'test' is no longer available/);
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest cancels while waiting for model resolution and disposes the draft", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeModels = disposables.add(new Emitter());
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeModels = onDidChangeModels.event;
      }
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: { kind: "pending", identifier: "gpt-4o" }, modelTarget: void 0 };
      }
      deleteNewSession() {
        deleted = true;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "gpt-4o" }, cts.token);
    await Promise.resolve();
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest awaits asynchronous repository configuration setters", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const isolationDone = new DeferredPromise();
    const branchTrackStarted = new DeferredPromise();
    const branchTrackDone = new DeferredPromise();
    const branchStarted = new DeferredPromise();
    const branchDone = new DeferredPromise();
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async setIsolationMode() {
        calls.push("isolation:start");
        await isolationDone.p;
        calls.push("isolation:end");
      }
      async setWorktreeBranchTrack() {
        calls.push("branchTrack:start");
        await branchTrackStarted.complete();
        await branchTrackDone.p;
        calls.push("branchTrack:end");
      }
      async setBranch() {
        calls.push("branch:start");
        await branchStarted.complete();
        await branchDone.p;
        calls.push("branch:end");
      }
      async sendRequest() {
        calls.push("send");
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "worktree",
      worktreeBranchTrack: false,
      branch: "main"
    });
    await Promise.resolve();
    assert.deepStrictEqual(calls, ["isolation:start"]);
    await isolationDone.complete();
    await branchTrackStarted.p;
    assert.deepStrictEqual(calls, ["isolation:start", "isolation:end", "branchTrack:start"]);
    await branchTrackDone.complete();
    await branchStarted.p;
    assert.deepStrictEqual(calls, ["isolation:start", "isolation:end", "branchTrack:start", "branchTrack:end", "branch:start"]);
    await branchDone.complete();
    await request;
    assert.deepStrictEqual(calls, ["isolation:start", "isolation:end", "branchTrack:start", "branchTrack:end", "branch:start", "branch:end", "send"]);
  });
  test("createAndSendNewChatRequest cancels pending repository configuration and disposes the draft", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const configurationDone = new DeferredPromise();
    let deleted = false;
    let sent = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async setIsolationMode() {
        await configurationDone.p;
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest() {
        sent = true;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "worktree",
      branch: "main"
    }, cts.token);
    await Promise.resolve();
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.deepStrictEqual({ deleted, sent }, { deleted: true, sent: false });
    await configurationDone.complete();
  });
  test("createAndSendNewChatRequest cancels a pending send and disposes the draft", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const sendDone = new DeferredPromise();
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest() {
        await sendDone.p;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, void 0, cts.token);
    await Promise.resolve();
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.strictEqual(deleted, true);
    await sendDone.complete();
  });
  test("createAndSendNewChatRequest skips repository configuration for unsupported session types", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let sent = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.sessionTypes = [{ id: "test", label: "Test", icon: Codicon.vm }];
      }
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      setIsolationMode() {
        throw new Error("isolation should not be configured");
      }
      setBranch() {
        throw new Error("branch should not be configured");
      }
      async sendRequest() {
        sent = true;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "workspace",
      branch: "legacy-branch"
    });
    assert.strictEqual(sent, true);
  });
  test("createAndSendNewChatRequest disposes stranded draft when a setter throws", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      setModel() {
        throw new Error("model not found");
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await assert.rejects(
      () => service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "bad" }),
      /model not found/
    );
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest returns undefined when service is disposed mid-send", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const serviceRef = {};
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        serviceRef.current.dispose();
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    serviceRef.current = service;
    const result = await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" });
    assert.strictEqual(result, void 0);
  });
  test("discardNewSession fires onDidDiscardNewSession with the discarded draft", () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const discarded = [];
    disposables.add(service.onDidDiscardNewSession((s) => discarded.push(s.sessionId)));
    service.createNewSession(URI.parse("test:///folder"));
    service.discardNewSession();
    assert.deepStrictEqual(discarded, ["s1"]);
  });
  test("createNewSession fires replacement before publishing the new draft", () => {
    const drafts = [
      stubSession({ sessionId: "s1", providerId: "test" }),
      stubSession({ sessionId: "s2", providerId: "test" })
    ];
    const deleted = [];
    let createIndex = 0;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      createNewSession() {
        return drafts[createIndex++];
      }
      deleteNewSession(sessionId) {
        deleted.push(sessionId);
      }
    }(drafts[0]);
    const { service } = createSessionsManagementService(drafts[0], disposables, provider);
    const replacements = [];
    disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => {
      replacements.push({ from: from.sessionId, to: to.sessionId, currentDraft: service.newSession.get()?.sessionId });
    }));
    service.createNewSession(URI.parse("test:///folder"));
    service.createNewSession(URI.parse("test:///folder"));
    assert.deepStrictEqual({
      replacements,
      deleted,
      currentDraft: service.newSession.get()?.sessionId
    }, {
      replacements: [{ from: "s1", to: "s2", currentDraft: "s1" }],
      deleted: ["s1"],
      currentDraft: "s2"
    });
  });
  test("createNewSession keeps the previous draft when replacement creation fails", () => {
    const draft = stubSession({ sessionId: "s1", providerId: "test" });
    let createCount = 0;
    const deleted = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      createNewSession() {
        if (createCount++ > 0) {
          throw new Error("create failed");
        }
        return draft;
      }
      deleteNewSession(sessionId) {
        deleted.push(sessionId);
      }
    }(draft);
    const { service } = createSessionsManagementService(draft, disposables, provider);
    const replacements = [];
    disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));
    service.createNewSession(URI.parse("test:///folder"));
    assert.throws(() => service.createNewSession(URI.parse("test:///folder")), /create failed/);
    assert.deepStrictEqual({
      currentDraft: service.newSession.get()?.sessionId,
      replacements,
      deleted
    }, {
      currentDraft: "s1",
      replacements: [],
      deleted: []
    });
  });
  test("sendNewChatRequest clears the draft without firing onDidDiscardNewSession", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    let discardCount = 0;
    disposables.add(service.onDidDiscardNewSession(() => discardCount++));
    const draft = service.createNewSession(URI.parse("test:///folder"));
    await service.sendNewChatRequest(draft, { query: "hi" });
    assert.strictEqual(discardCount, 0);
  });
  test("getAllSessionTypes orders providers by their order property (lower first)", () => {
    const service = createOrderedTypesService(disposables, 0, 1);
    assert.deepStrictEqual(service.getAllSessionTypes().map((type) => type.id), ["copilot", "agent-host"]);
  });
  test("getAllSessionTypes surfaces local agent host types first when it has lower order", () => {
    const service = createOrderedTypesService(disposables, 0, -1);
    assert.deepStrictEqual(service.getAllSessionTypes().map((type) => type.id), ["agent-host", "copilot"]);
  });
  test("replacing the active session promotes the committed session to active", async () => {
    const draft = stubSession({ sessionId: "draft", providerId: "test" });
    const committed = stubSession({ sessionId: "committed", providerId: "test" });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(draft);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [draft, committed];
      }
    }();
    const { view } = createSessionsManagementService(draft, disposables, provider);
    await view.openSession(draft.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "draft");
    onDidReplaceSession.fire({ from: draft, to: committed });
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: view.activeSession.get()?.sessionId ?? null
    }, {
      visible: ["committed"],
      active: "committed"
    });
  });
  test("replacing the active session in place (same id, new resource) re-points the active session", async () => {
    const before = stubSession({ sessionId: "same", providerId: "test", resource: URI.parse("test:///before") });
    const after = stubSession({ sessionId: "same", providerId: "test", resource: URI.parse("test:///after") });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(before);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [before];
      }
    }();
    const { view } = createSessionsManagementService(before, disposables, provider);
    await view.openSession(before.resource);
    assert.strictEqual(view.activeSession.get()?.resource.toString(), before.resource.toString());
    onDidReplaceSession.fire({ from: before, to: after });
    assert.strictEqual(view.activeSession.get()?.resource.toString(), after.resource.toString());
  });
  test("replacing a non-active session leaves the active session unchanged", async () => {
    const active = stubSession({ sessionId: "active", providerId: "test" });
    const draft = stubSession({ sessionId: "draft", providerId: "test" });
    const committed = stubSession({ sessionId: "committed", providerId: "test" });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(active);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [active, draft, committed];
      }
    }();
    const { view } = createSessionsManagementService(active, disposables, provider);
    await view.openSession(active.resource);
    view.insertAt(draft, "active", "right", false);
    assert.strictEqual(view.activeSession.get()?.sessionId, "active");
    onDidReplaceSession.fire({ from: draft, to: committed });
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: view.activeSession.get()?.sessionId ?? null
    }, {
      visible: ["active", "committed"],
      active: "active"
    });
  });
  test("replacing a session only swaps the active session when it matches `from`", async () => {
    const a = stubSession({ sessionId: "a", providerId: "test" });
    const b = stubSession({ sessionId: "b", providerId: "test" });
    const other = stubSession({ sessionId: "other", providerId: "test" });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(a);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [a, b, other];
      }
    }();
    const { view } = createSessionsManagementService(a, disposables, provider);
    await view.openSession(a.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "a");
    onDidReplaceSession.fire({ from: other, to: b });
    assert.strictEqual(view.activeSession.get()?.sessionId, "a");
    onDidReplaceSession.fire({ from: a, to: b });
    assert.strictEqual(view.activeSession.get()?.sessionId, "b");
  });
  suite("deleteSessions", () => {
    class RecordingProvider extends TestSessionsProvider {
      constructor(id, _fail, session) {
        super(session);
        this.id = id;
        this._fail = _fail;
        this.deleted = [];
      }
      async deleteSessions(sessionIds) {
        this.deleted.push([...sessionIds]);
        if (this._fail) {
          throw new Error(`${this.id} failed`);
        }
      }
    }
    function createService(providers) {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
      instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
      instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
      instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
      instantiationService.stub(IProgressService, new TestProgressService());
      instantiationService.stub(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidSubmitRequest = Event.None;
        }
      }());
      instantiationService.stub(IChatWidgetHistoryService, new class extends mock() {
        moveHistory() {
        }
      }());
      return disposables.add(instantiationService.createInstance(SessionsManagementService));
    }
    test("groups sessions by provider and continues when one provider fails (best-effort)", async () => {
      const s1 = stubSession({ sessionId: "s1", providerId: "p1" });
      const s2 = stubSession({ sessionId: "s2", providerId: "p2" });
      const failing = new RecordingProvider("p1", true, s1);
      const succeeding = new RecordingProvider("p2", false, s2);
      const service = createService([failing, succeeding]);
      const deleted = [];
      disposables.add(service.onDidDeleteSession((session) => deleted.push(session.sessionId)));
      await assert.rejects(service.deleteSessions([s1, s2]), /p1 failed/);
      assert.deepStrictEqual({
        failingDeleted: failing.deleted,
        succeedingDeleted: succeeding.deleted,
        eventsFired: deleted
      }, {
        failingDeleted: [["s1"]],
        succeedingDeleted: [["s2"]],
        eventsFired: ["s2"]
      });
    });
  });
  suite("createNewChatInSession", () => {
    test("reuses an existing untitled chat instead of creating a new one", async () => {
      const untitledChat = { ...stubChat, resource: URI.parse("test:///untitled"), status: constObservable(SessionStatus.Untitled) };
      const session = stubSession({ sessionId: "reuse", providerId: "test", chats: constObservable([untitledChat]) });
      let createNewChatCalls = 0;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createNewChat() {
          createNewChatCalls++;
          return stubChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session);
      assert.deepStrictEqual({
        reused: result === untitledChat,
        createNewChatCalls
      }, {
        reused: true,
        createNewChatCalls: 0
      });
    });
    test("asks the provider to create a chat when none are untitled", async () => {
      const activeChat = { ...stubChat, resource: URI.parse("test:///active"), status: constObservable(SessionStatus.InProgress) };
      const createdChat = { ...stubChat, resource: URI.parse("test:///created") };
      const session = stubSession({ sessionId: "create", providerId: "test", chats: constObservable([activeChat]) });
      let createNewChatCalls = 0;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createNewChat() {
          createNewChatCalls++;
          return createdChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session);
      assert.deepStrictEqual({
        result: result?.resource.toString(),
        createNewChatCalls
      }, {
        result: createdChat.resource.toString(),
        createNewChatCalls: 1
      });
    });
    test("forceNew creates a fresh chat even when an untitled one exists", async () => {
      const untitledChat = { ...stubChat, resource: URI.parse("test:///untitled"), status: constObservable(SessionStatus.Untitled) };
      const createdChat = { ...stubChat, resource: URI.parse("test:///created") };
      const session = stubSession({ sessionId: "force-new", providerId: "test", chats: constObservable([untitledChat]) });
      let createNewChatCalls = 0;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createNewChat() {
          createNewChatCalls++;
          return createdChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session, { forceNew: true });
      assert.deepStrictEqual({
        result: result?.resource.toString(),
        createNewChatCalls
      }, {
        result: createdChat.resource.toString(),
        createNewChatCalls: 1
      });
    });
    test("returns undefined when the provider is not found", async () => {
      const session = stubSession({ sessionId: "orphan", providerId: "missing-provider" });
      const provider = new TestSessionsProvider(stubSession({ sessionId: "other", providerId: "test" }));
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session);
      assert.strictEqual(result, void 0);
    });
  });
  suite("forkChatInSession", () => {
    test("asks the provider to fork the chat when the session supports multiple chats", async () => {
      const sourceChat = URI.parse("test:///source");
      const forkedChat = { ...stubChat, resource: URI.parse("test:///forked") };
      const session = stubSession({ sessionId: "fork", providerId: "test", capabilities: constObservable({ supportsMultipleChats: true }) });
      let forkChatArgs;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async forkChat(sessionId, sourceChat2, turnId) {
          forkChatArgs = [sessionId, sourceChat2, turnId];
          return forkedChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.forkChatInSession(session, sourceChat, "turn-1");
      assert.deepStrictEqual({
        result: result.resource.toString(),
        args: forkChatArgs?.map((arg) => URI.isUri(arg) ? arg.toString() : arg)
      }, {
        result: forkedChat.resource.toString(),
        args: ["fork", sourceChat.toString(), "turn-1"]
      });
    });
    test("throws when the provider is not found", async () => {
      const session = stubSession({ sessionId: "orphan", providerId: "missing-provider", capabilities: constObservable({ supportsMultipleChats: true }) });
      const provider = new TestSessionsProvider(stubSession({ sessionId: "other", providerId: "test" }));
      const { service } = createSessionsManagementService(session, disposables, provider);
      await assert.rejects(() => service.forkChatInSession(session, URI.parse("test:///source"), "turn-1"), /Provider 'missing-provider' not found/);
    });
    test("throws when the session does not support multiple chats", async () => {
      const session = stubSession({ sessionId: "single-chat", providerId: "test", capabilities: constObservable({ supportsMultipleChats: false }) });
      const { service } = createSessionsManagementService(session, disposables);
      await assert.rejects(() => service.forkChatInSession(session, URI.parse("test:///source"), "turn-1"), /does not support forking into a chat/);
    });
  });
  suite("createSideChatInSession", () => {
    test("asks the provider to create the side chat when the session supports it", async () => {
      const sourceChat = URI.parse("test:///source");
      const sideChat = { ...stubChat, resource: URI.parse("test:///side") };
      const session = stubSession({ sessionId: "side", providerId: "test", capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
      const selection = { text: "  selected text  " };
      let createSideChatArgs;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createSideChat(sessionId, sourceChat2, turnId, selection2) {
          createSideChatArgs = [sessionId, sourceChat2, turnId, selection2];
          return sideChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createSideChatInSession(session, sourceChat, "turn-1", selection);
      assert.deepStrictEqual({
        result: result.resource.toString(),
        args: createSideChatArgs?.map((arg) => URI.isUri(arg) ? arg.toString() : arg)
      }, {
        result: sideChat.resource.toString(),
        args: ["side", sourceChat.toString(), "turn-1", selection]
      });
    });
    test("throws when the provider is not found", async () => {
      const session = stubSession({ sessionId: "orphan", providerId: "missing-provider", capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
      const provider = new TestSessionsProvider(stubSession({ sessionId: "other", providerId: "test" }));
      const { service } = createSessionsManagementService(session, disposables, provider);
      await assert.rejects(() => service.createSideChatInSession(session, URI.parse("test:///source"), "turn-1"), /Provider 'missing-provider' not found/);
    });
    test("throws when the session does not support side chats", async () => {
      const session = stubSession({ sessionId: "no-side-chat", providerId: "test", capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: false }) });
      const { service } = createSessionsManagementService(session, disposables);
      await assert.rejects(() => service.createSideChatInSession(session, URI.parse("test:///source"), "turn-1"), /does not support side chats/);
    });
  });
  suite("closed chats persistence", () => {
    function chat(id, status = SessionStatus.Completed, origin) {
      return {
        ...stubChat,
        resource: URI.parse(`test:///chat/${id}`),
        title: constObservable(id),
        status: constObservable(status),
        origin: origin ? { kind: origin } : void 0
      };
    }
    function multiChatSession(id, chats) {
      return stubSession({
        sessionId: id,
        providerId: "test",
        chats: constObservable(chats),
        mainChat: constObservable(chats[0]),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
    }
    function setup(sessions) {
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessions[0]);
        }
        getSessions() {
          return sessions;
        }
      }();
      return createSessionsManagementService(sessions[0], disposables, provider);
    }
    const closedTitles = (view) => (view.activeSession.get()?.closedChats.get() ?? []).map((c) => c.title.get());
    test("a chat closed in one session stays closed after switching away and back", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.closeChat(activeA, chatB);
      assert.deepStrictEqual(closedTitles(view), ["b"]);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), ["b"]);
    });
    test("closing the middle of three chats persists across a switch", async () => {
      const sessionA = multiChatSession("A", [chat("c1"), chat("c2"), chat("c3")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const middle = sessionA.chats.get().find((c) => c.title.get() === "c2");
      await view.closeChat(activeA, middle);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      const reActiveA = view.activeSession.get();
      assert.deepStrictEqual({
        open: reActiveA.openChats.get().map((c) => c.title.get()),
        closed: reActiveA.closedChats.get().map((c) => c.title.get())
      }, {
        open: ["c1", "c3"],
        closed: ["c2"]
      });
    });
    test("closing the active chat persists across a switch", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.openChat(sessionA, chatB.resource);
      await view.closeChat(view.activeSession.get(), chatB);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), ["b"]);
    });
    test("reopening a closed chat is also persisted across a switch", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.closeChat(activeA, chatB);
      await view.openChat(sessionA, chatB.resource);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), []);
    });
    test("a closed side chat stays closed after switching away and back", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("side", SessionStatus.Completed, ChatOriginKind.SideChat)]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const sideChat = sessionA.chats.get().find((c) => c.title.get() === "side");
      await view.closeChat(activeA, sideChat);
      assert.deepStrictEqual(closedTitles(view), ["side"]);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), ["side"]);
    });
    test("a closed chat stays closed across a restart", async () => {
      const mainA = chat("mainA");
      const chatB = chat("b");
      const sessionA = stubSession({
        sessionId: "A",
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable([mainA, chatB]),
        mainChat: constObservable(mainA),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
      const storage = disposables.add(new InMemoryStorageService());
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessionA);
        }
        getSessions() {
          return [sessionA];
        }
      }();
      const makeView = () => {
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, storage);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
        instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
        instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
        instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
        instantiationService.stub(IProgressService, new TestProgressService());
        instantiationService.stub(IChatService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidSubmitRequest = Event.None;
          }
        }());
        const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
        return createView(instantiationService, service, disposables);
      };
      const first = makeView();
      await first.openSession(sessionA.resource);
      await first.closeChat(first.activeSession.get(), chatB);
      await storage.flush();
      const second = makeView();
      await second.restoreVisibleSessions();
      assert.deepStrictEqual((second.activeSession.get()?.closedChats.get() ?? []).map((c) => c.title.get()), ["b"]);
    });
    test("a chat closed in a non-active session stays closed across a restart", async () => {
      const mainA = chat("mainA");
      const chatA2 = chat("a2");
      const sessionA = stubSession({
        sessionId: "A",
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable([mainA, chatA2]),
        mainChat: constObservable(mainA),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
      const mainB = chat("mainB");
      const chatB2 = chat("b2");
      const sessionB = stubSession({
        sessionId: "B",
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable([mainB, chatB2]),
        mainChat: constObservable(mainB),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
      const storage = disposables.add(new InMemoryStorageService());
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessionA);
        }
        getSessions() {
          return [sessionA, sessionB];
        }
      }();
      const makeView = () => {
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, storage);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
        instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
        instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
        instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
        instantiationService.stub(IProgressService, new TestProgressService());
        instantiationService.stub(IChatService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidSubmitRequest = Event.None;
          }
        }());
        const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
        return createView(instantiationService, service, disposables);
      };
      const first = makeView();
      await first.openSession(sessionB.resource);
      await first.closeChat(first.activeSession.get(), chatB2);
      await first.openSession(sessionA.resource);
      await first.closeChat(first.activeSession.get(), chatA2);
      await storage.flush();
      const second = makeView();
      await second.restoreVisibleSessions();
      await second.openSession(sessionB.resource);
      assert.deepStrictEqual((second.activeSession.get()?.closedChats.get() ?? []).map((c) => c.title.get()), ["b2"]);
    });
  });
  suite("createQuickChat", () => {
    class QuickChatProvider extends TestSessionsProvider {
      constructor(seed, id = "quick-provider", order = 0, sessionTypes = [{ id: "quick", label: "Quick", icon: Codicon.vm }]) {
        super(seed);
        this.id = id;
        this.order = order;
        this.sessionTypes = sessionTypes;
        this.createQuickChatCalls = 0;
        this.supportsQuickChats = true;
      }
      createQuickChat(sessionTypeId) {
        this.createQuickChatCalls++;
        this.lastQuickChatType = sessionTypeId;
        return stubSession({ sessionId: `q${this.createQuickChatCalls}`, providerId: this.id });
      }
    }
    function setupQuickChat(providers) {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
      instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
      instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
      instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
      instantiationService.stub(IProgressService, new TestProgressService());
      instantiationService.stub(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidSubmitRequest = Event.None;
        }
      }());
      return disposables.add(instantiationService.createInstance(SessionsManagementService));
    }
    test("creates a session via the first capable provider (by order) and defaults the type", () => {
      const plain = new class extends TestSessionsProvider {
        constructor() {
          super(...arguments);
          this.id = "plain";
          this.order = 0;
        }
      }(stubSession({ sessionId: "p1", providerId: "plain" }));
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 1);
      const service = setupQuickChat([plain, quick]);
      const session = service.createQuickChat();
      assert.deepStrictEqual({
        createdSessionId: session.sessionId,
        requestedType: quick.lastQuickChatType,
        draft: service.newSession.get()?.sessionId
      }, {
        createdSessionId: "q1",
        requestedType: "quick",
        draft: "q1"
      });
    });
    test("mints a new quick-chat session on each call", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }));
      const service = setupQuickChat([quick]);
      const first = service.createQuickChat();
      const second = service.createQuickChat();
      assert.deepStrictEqual({
        first: first.sessionId,
        second: second.sessionId,
        createQuickChatCalls: quick.createQuickChatCalls,
        draft: service.newSession.get()?.sessionId
      }, {
        first: "q1",
        second: "q2",
        createQuickChatCalls: 2,
        draft: "q2"
      });
    });
    test("throws when no provider supports quick chats", () => {
      const plain = new TestSessionsProvider(stubSession({ sessionId: "p1", providerId: "test" }));
      const service = setupQuickChat([plain]);
      assert.throws(() => service.createQuickChat(), /No sessions provider supports quick chats/);
    });
    test("honours options.providerId and the requested session type", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 0, [
        { id: "quick", label: "Quick", icon: Codicon.vm },
        { id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([quick]);
      service.createQuickChat({ providerId: "quick-provider", sessionTypeId: "other" });
      assert.strictEqual(quick.lastQuickChatType, "other");
    });
    test("honours an explicit sessionTypeId without a providerId", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 0, [
        { id: "quick", label: "Quick", icon: Codicon.vm },
        { id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([quick]);
      service.createQuickChat({ sessionTypeId: "other" });
      assert.strictEqual(quick.lastQuickChatType, "other");
    });
    test("defaults to the last-used session type on the next call", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 0, [
        { id: "quick", label: "Quick", icon: Codicon.vm },
        { id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([quick]);
      service.createQuickChat({ sessionTypeId: "other" });
      service.createQuickChat();
      assert.strictEqual(quick.lastQuickChatType, "other");
    });
    test("throws when the requested provider does not advertise the session type", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }));
      const service = setupQuickChat([quick]);
      assert.throws(() => service.createQuickChat({ providerId: "quick-provider", sessionTypeId: "missing" }), /does not advertise session type/);
    });
    test("throws when the requested provider does not support quick chats", () => {
      const plain = new class extends TestSessionsProvider {
        constructor() {
          super(...arguments);
          this.id = "plain";
        }
      }(stubSession({ sessionId: "p1", providerId: "plain" }));
      const service = setupQuickChat([plain]);
      assert.throws(() => service.createQuickChat({ providerId: "plain" }), /does not support quick chats/);
    });
    test("getQuickChatSessionTypes returns every advertised type from quick-chat-capable providers only", () => {
      const plain = new class extends TestSessionsProvider {
        constructor() {
          super(...arguments);
          this.id = "plain";
          this.order = 0;
        }
      }(stubSession({ sessionId: "p1", providerId: "plain" }));
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 1, [
        { id: "quick", label: "Quick", icon: Codicon.vm },
        { id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([plain, quick]);
      assert.deepStrictEqual(
        service.getQuickChatSessionTypes().map((t) => ({ providerId: t.providerId, sessionTypeId: t.sessionType.id })),
        [
          { providerId: "quick-provider", sessionTypeId: "quick" },
          { providerId: "quick-provider", sessionTypeId: "other" }
        ]
      );
    });
  });
});
function createOrderedTypesService(disposables, copilotOrder, agentHostOrder) {
  const copilotProvider = new class extends TestSessionsProvider {
    constructor() {
      super(...arguments);
      this.id = "default-copilot";
      this.order = copilotOrder;
      this.sessionTypes = [{ id: "copilot", label: "Copilot", icon: Codicon.vm }];
    }
  }(stubSession({ sessionId: "c1", providerId: "default-copilot" }));
  const agentHostProvider = new class extends TestSessionsProvider {
    constructor() {
      super(...arguments);
      this.id = LOCAL_AGENT_HOST_PROVIDER_ID;
      this.order = agentHostOrder;
      this.sessionTypes = [{ id: "agent-host", label: "Agent Host", icon: Codicon.vm }];
    }
  }(stubSession({ sessionId: "a1", providerId: LOCAL_AGENT_HOST_PROVIDER_ID }));
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
  instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilotProvider, agentHostProvider]));
  instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
  instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
  instantiationService.stub(IProgressService, new TestProgressService());
  instantiationService.stub(IChatService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidSubmitRequest = Event.None;
    }
  }());
  return disposables.add(instantiationService.createInstance(SessionsManagementService));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1BhbmVUYXJnZXQsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJlZmVycmVkR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBDaGF0T3JpZ2luS2luZCwgSUNoYXQsIElTZXNzaW9uLCBJU2Vzc2lvblR5cGUsIElTZXNzaW9uV29ya3NwYWNlLCBJU2lkZUNoYXRTZWxlY3Rpb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZUV2ZW50LCBJU2VuZFJlcXVlc3RPcHRpb25zLCBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90LCBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucywgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMsIGluaGVyaXRhYmxlU2Vzc2lvblRhcmdldCwgV29ya3NwYWNlTm90VHJ1c3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbnNQYXJ0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21WaWV3U2VydmljZSwgSUN1c3RvbVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuXG5jb25zdCBzdHViQ2hhdCA9IHtcblx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JyksXG5cdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0dGl0bGU6IGNvbnN0T2JzZXJ2YWJsZSgnQ2hhdCcpLFxuXHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgpKSxcblx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoMCksXG5cdGNoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdGNoZWNrcG9pbnRzOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bW9kZWxJZDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRpc0FyY2hpdmVkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRpc1JlYWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0aW50ZXJhY3Rpdml0eTogY29uc3RPYnNlcnZhYmxlKENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpLFxuXHRkZXNjcmlwdGlvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdGxhc3RUdXJuRW5kOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcbn0gc2F0aXNmaWVzIElDaGF0O1xuXG5mdW5jdGlvbiBzdHViU2Vzc2lvbihvdmVycmlkZXM6IFBhcnRpYWw8SVNlc3Npb24+ICYgUGljazxJU2Vzc2lvbiwgJ3Nlc3Npb25JZCcgfCAncHJvdmlkZXJJZCc+KTogSVNlc3Npb24ge1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHRlc3Q6Ly8vJHtvdmVycmlkZXMuc2Vzc2lvbklkfWApLFxuXHRcdHNlc3Npb25UeXBlOiAndGVzdCcsXG5cdFx0aWNvbjogQ29kaWNvbi52bSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdUZXN0JyksXG5cdFx0dXBkYXRlZEF0OiBjb25zdE9ic2VydmFibGUobmV3IERhdGUoKSksXG5cdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoMCksXG5cdFx0Y2hhbmdlc2V0czogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRjaGFuZ2VzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdG1vZGVsSWQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRpc1JlYWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRkZXNjcmlwdGlvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoc3R1YkNoYXQpLFxuXHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSB9KSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmNsYXNzIFRlc3RDaGF0V2lkZ2V0U2VydmljZSBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXRTZXJ2aWNlPigpIHtcblx0cmVhZG9ubHkgb3BlbmVkOiBVUklbXSA9IFtdO1xuXHRwcml2YXRlIF93aWRnZXRTZXNzaW9uUmVzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0b3ZlcnJpZGUgYXN5bmMgb3BlblNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIF90YXJnZXQ/OiB0eXBlb2YgQ2hhdFZpZXdQYW5lVGFyZ2V0IHwgUHJlZmVycmVkR3JvdXAsIF9vcHRpb25zPzogSUNoYXRFZGl0b3JPcHRpb25zKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMub3BlbmVkLnB1c2goc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFNpbXVsYXRlIGEgc2Vzc2lvbiBiZWluZyBkaXNwbGF5ZWQgaW4gYSBjaGF0IHdpZGdldC4gKi9cblx0c2V0V2lkZ2V0U2Vzc2lvblJlc291cmNlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXRTZXNzaW9uUmVzb3VyY2VzLmFkZChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0fVxuXG5cdGNsZWFyV2lkZ2V0U2Vzc2lvblJlc291cmNlcygpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXRTZXNzaW9uUmVzb3VyY2VzLmNsZWFyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0U2Vzc2lvblJlc291cmNlcy5oYXMoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRyZXR1cm4ge30gYXMgSUNoYXRXaWRnZXQ7IC8vIHRydXRoeSBzdHViXG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgVGVzdENoYXRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBjYW5jZWxsZWRSZXNvdXJjZXM6IFVSSVtdID0gW107XG5cblx0b3ZlcnJpZGUgYXN5bmMgY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYW5jZWxsZWRSZXNvdXJjZXMucHVzaChzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RQcm9ncmVzc1NlcnZpY2UgZXh0ZW5kcyBtb2NrPElQcm9ncmVzc1NlcnZpY2U+KCkge1xuXHRvdmVycmlkZSBhc3luYyB3aXRoUHJvZ3Jlc3M8Uj4oX29wdGlvbnM6IFBhcmFtZXRlcnM8SVByb2dyZXNzU2VydmljZVsnd2l0aFByb2dyZXNzJ10+WzBdLCB0YXNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4gUHJvbWlzZTxSPik6IFByb21pc2U8Uj4ge1xuXHRcdHJldHVybiB0YXNrKHsgcmVwb3J0KCkgeyB9IH0pO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdHRydXN0ZWQgPSB0cnVlO1xuXHRyZWFkb25seSByZXF1ZXN0ZWRVcmlzOiBVUklbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSkge1xuXHRcdHRoaXMucmVxdWVzdGVkVXJpcy5wdXNoKHVyaSk7XG5cdFx0cmV0dXJuIHsgdXJpLCB0cnVzdGVkOiB0aGlzLnRydXN0ZWQgfTtcblx0fVxufVxuXG5jbGFzcyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyczogcmVhZG9ubHkgSVNlc3Npb25zUHJvdmlkZXJbXSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSByZWdpc3RlclByb3ZpZGVyKCk6IG5ldmVyIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXJzKCk6IElTZXNzaW9uc1Byb3ZpZGVyW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fcHJvdmlkZXJzXS5zb3J0KChhLCBiKSA9PiBhLm9yZGVyIC0gYi5vcmRlcik7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlcnMuZmluZChwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gcHJvdmlkZXJJZCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBUZXN0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXI+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSBpZDogc3RyaW5nID0gJ3Rlc3QnO1xuXHRvdmVycmlkZSByZWFkb25seSBsYWJlbCA9ICdUZXN0Jztcblx0b3ZlcnJpZGUgcmVhZG9ubHkgaWNvbiA9IENvZGljb24udm07XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyOiBudW1iZXIgPSAwO1xuXHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElTZXNzaW9uVHlwZVtdID0gW3sgaWQ6ICd0ZXN0JywgbGFiZWw6ICdUZXN0JywgaWNvbjogQ29kaWNvbi52bSwgc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb246IHRydWUgfV07XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGJyb3dzZUFjdGlvbnMgPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBJU2Vzc2lvbikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFt0aGlzLl9zZXNzaW9uXTsgfVxuXHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKF9mb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKF9mb2xkZXJVcmk/OiBVUkksIF9zZXNzaW9uVHlwZUlkPzogc3RyaW5nKTogSVNlc3Npb24geyByZXR1cm4gdGhpcy5fc2Vzc2lvbjsgfVxuXHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXMoX2ZvbGRlclVyaTogVVJJKTogSVNlc3Npb25UeXBlW10geyByZXR1cm4gWy4uLnRoaXMuc2Vzc2lvblR5cGVzXTsgfVxuXHRvdmVycmlkZSBhc3luYyByZW5hbWVDaGF0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdG92ZXJyaWRlIGdldE1vZGVsc1NuYXBzaG90KCk6IElTZXNzaW9uTW9kZWxzU25hcHNob3QgeyByZXR1cm4geyBtb2RlbHM6IFtdLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdub3RSZXF1ZXN0ZWQnIH0sIG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQgfTsgfVxuXHRvdmVycmlkZSBnZXRNb2RlbFBpY2tlck9wdGlvbnMoKTogSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMgeyByZXR1cm4geyB1c2VHcm91cGVkTW9kZWxQaWNrZXI6IHRydWUsIHNob3dGZWF0dXJlZDogdHJ1ZSwgc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IGZhbHNlLCBzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiBmYWxzZSB9OyB9XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgc2V0TW9kZWwoX3Nlc3Npb25JZDogc3RyaW5nLCBfbW9kZWxJZDogc3RyaW5nKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgYXN5bmMgYXJjaGl2ZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0b3ZlcnJpZGUgYXN5bmMgdW5hcmNoaXZlU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRvdmVycmlkZSBhc3luYyBkZWxldGVTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZVNlc3Npb25zKF9zZXNzaW9uSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4geyB9XG5cdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZUNoYXQoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIGRlbGV0ZU5ld1Nlc3Npb24oX3Nlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4geyByZXR1cm4gdGhpcy5fc2Vzc2lvbjsgfVxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVOZXdDaGF0KCk6IFByb21pc2U8SUNoYXQ+IHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ubWFpbkNoYXQuZ2V0KCk7IH1cblx0b3ZlcnJpZGUgYXN5bmMgZm9ya0NoYXQoX3Nlc3Npb25JZDogc3RyaW5nLCBfc291cmNlQ2hhdDogVVJJLCBfdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElDaGF0PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2lkZUNoYXQoX3Nlc3Npb25JZDogc3RyaW5nLCBfc291cmNlQ2hhdDogVVJJLCBfdHVybklkOiBzdHJpbmcsIF9zZWxlY3Rpb24/OiBJU2lkZUNoYXRTZWxlY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShcblx0c2Vzc2lvbjogSVNlc3Npb24sXG5cdGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LFxuXHRwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgPSBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXIoc2Vzc2lvbiksXG5cdHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgPSBuZXcgVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UoKSxcblx0d29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT86IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuKTogeyBzZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTsgdmlldzogU2Vzc2lvbnNTZXJ2aWNlOyBjaGF0V2lkZ2V0U2VydmljZTogVGVzdENoYXRXaWRnZXRTZXJ2aWNlOyBjaGF0U2VydmljZTogVGVzdENoYXRTZXJ2aWNlIH0ge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IG5ldyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UoKTtcblx0Y29uc3QgY2hhdFNlcnZpY2UgPSBuZXcgVGVzdENoYXRTZXJ2aWNlKCk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgY2hhdFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgbW92ZUhpc3RvcnkoKTogdm9pZCB7IH1cblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXHRpZiAod29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSkge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UpO1xuXHR9XG5cblx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdHJldHVybiB7IHNlcnZpY2UsIHZpZXcsIGNoYXRXaWRnZXRTZXJ2aWNlLCBjaGF0U2VydmljZSB9O1xufVxuXG4vKipcbiAqIFBhc3NpdmUgc2Vzc2lvbnMgcGFydCBzdHViLiBUaGUgdmlldyBzZXJ2aWNlIGRyaXZlcyBpdCBidXQgdGhlIHRlc3RzIG9ubHlcbiAqIGV4ZXJjaXNlIHRoZSB2aWV3L21vZGVsIGJlaGF2aW91ciwgc28gdGhlIGNhbGxzIGFyZSBuby1vcHMuXG4gKi9cbmNsYXNzIFRlc3RTZXNzaW9uc1BhcnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQYXJ0U2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRm9jdXNTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRUb2dnbGVNYXhpbWl6ZVNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSB1cGRhdGVWaXNpYmxlU2Vzc2lvbnMoKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgZm9jdXNTZXNzaW9uKCk6IHZvaWQgeyB9XG59XG5cbi8qKlxuICogQnVpbGRzIGEge0BsaW5rIFNlc3Npb25zU2VydmljZX0gb3ZlciBhbiBhbHJlYWR5LWNyZWF0ZWQgbWFuYWdlbWVudFxuICogc2VydmljZSwgc3R1YmJpbmcgdGhlIG1hbmFnZW1lbnQgc2VydmljZSBpbnN0YW5jZSBhbmQgYSBwYXNzaXZlIHBhcnQgc28gdGhlXG4gKiB2aWV3J3Mgb3BlbmluZy9yZXN0b3JlL3Zpc2libGUtc2Vzc2lvbiBiZWhhdmlvdXIgY2FuIGJlIHRlc3RlZC5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlVmlldyhpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgZGlzcG9zYWJsZXM6IFJldHVyblR5cGU8dHlwZW9mIGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZT4pOiBTZXNzaW9uc1NlcnZpY2Uge1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQYXJ0U2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1BhcnRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDdXN0b21WaWV3U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBDdXN0b21WaWV3U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpKTtcblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc1NlcnZpY2UpKTtcbn1cblxuc3VpdGUoJ1Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdvcGVuU2Vzc2lvbiB3YWl0cyBmb3IgYSBsb2FkaW5nIHNlc3Npb24gYmVmb3JlIG9wZW5pbmcgY2hhdCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvYWRpbmcgPSBvYnNlcnZhYmxlVmFsdWUoJ2xvYWRpbmcnLCB0cnVlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdsb2FkaW5nJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBsb2FkaW5nIH0pO1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBvcGVuUHJvbWlzZSA9IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSkudGhlbigoKSA9PiB7IHJlc29sdmVkID0gdHJ1ZTsgfSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzb2x2ZWQgfSwgeyByZXNvbHZlZDogZmFsc2UgfSk7XG5cblx0XHRsb2FkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBvcGVuUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXNvbHZlZCB9LCB7IHJlc29sdmVkOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB0aGUgYWN0aXZlIHNlc3Npb24gYXMgcmVhZCB2aWEgaXRzIHByb3ZpZGVyIGV2ZW4gd2hlbiBpdHMgcHJvdmlkZXIgc3RhdGUgd2FzIHVucmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc1JlYWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2lzUmVhZCcsIGZhbHNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICd1bnJlYWQnLCBwcm92aWRlcklkOiAndGVzdCcsIGlzUmVhZCB9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldFNlc3Npb25SZWFkU3RhdGUoX3Nlc3Npb25JZDogc3RyaW5nLCByZWFkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlzUmVhZC5zZXQocmVhZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Ly8gV2hpbGUgbm90IGFjdGl2ZSwgdGhlIHByb3ZpZGVyLW93bmVkIHVucmVhZCBzdGF0ZSBpcyB1bnRvdWNoZWQuXG5cdFx0Y29uc3QgcmVhZEJlZm9yZUFjdGl2ZSA9IHNlc3Npb24uaXNSZWFkLmdldCgpO1xuXG5cdFx0Ly8gT3BlbmluZyB0aGUgc2Vzc2lvbiBtYWtlcyBpdCBhY3RpdmU7IGl0IG11c3QgdGhlbiBiZSBtYXJrZWQgcmVhZC5cblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlYWRXaGlsZUFjdGl2ZSA9IHNlc3Npb24uaXNSZWFkLmdldCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgcmVhZEJlZm9yZUFjdGl2ZSwgcmVhZFdoaWxlQWN0aXZlLCBhY3RpdmVJZDogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQgfSxcblx0XHRcdHsgcmVhZEJlZm9yZUFjdGl2ZTogZmFsc2UsIHJlYWRXaGlsZUFjdGl2ZTogdHJ1ZSwgYWN0aXZlSWQ6ICd1bnJlYWQnIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIGEgbm9uLWFjdGl2ZSBzZXNzaW9uIGluIGl0cyBwcm92aWRlciByZWFkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZSA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYWN0aXZlJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG90aGVyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvdGhlcicsIHByb3ZpZGVySWQ6ICd0ZXN0JywgaXNSZWFkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpIH0pO1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShhY3RpdmUsIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIE5vdGhpbmcgaXMgb3BlbmVkLCBzbyBgb3RoZXJgIHN0YXlzIG5vbi1hY3RpdmUgYW5kIGtlZXBzIGl0cyB1bnJlYWQgc3RhdGUuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgYWN0aXZlSWQ6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCBvdGhlclJlYWQ6IG90aGVyLmlzUmVhZC5nZXQoKSB9LFxuXHRcdFx0eyBhY3RpdmVJZDogdW5kZWZpbmVkLCBvdGhlclJlYWQ6IGZhbHNlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY2hhbmdlIGFjdGl2ZSBzZXNzaW9uIHdoZW4gYWRkZWQgc2Vzc2lvbiBpcyBub3QgZGlzcGxheWVkIGluIGFueSB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvcmlnaW5hbCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVNlc3Npb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIob3JpZ2luYWxTZXNzaW9uKTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaTogZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIE9wZW4gdGhlIG9yaWdpbmFsIHNlc3Npb24gc28gaXQgYmVjb21lcyB0aGUgYWN0aXZlIHNlc3Npb25cblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKG9yaWdpbmFsU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAnb3JpZ2luYWwnKTtcblxuXHRcdC8vIEEgbmV3IHNlc3Npb24gYXBwZWFycyBidXQgaXMgTk9UIGRpc3BsYXllZCBpbiBhbnkgd2lkZ2V0XG5cdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvdGhlcicsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHQvLyBOb3RlOiBub3QgY2FsbGluZyBjaGF0V2lkZ2V0U2VydmljZS5zZXRXaWRnZXRTZXNzaW9uUmVzb3VyY2UoKVxuXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtvdGhlclNlc3Npb25dLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHQvLyBUaGUgYWN0aXZlIHNlc3Npb24gc2hvdWxkIHJlbWFpbiB1bmNoYW5nZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdvcmlnaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlIHJldHVybnMgdGhlIHNlc3Npb24gdGhhdCBvd25zIHRoZSBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRBOiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC1hJykgfTtcblx0XHRjb25zdCBjaGF0QjogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL0NIQVQtQicpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdhJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRBXSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXRBKSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ2InLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdEJdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdEIpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb25BKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbc2Vzc2lvbkEsIHNlc3Npb25CXTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb25BLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3Qgb3duZWRDaGF0ID0gc2VydmljZS5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKFVSSS5wYXJzZSgndGVzdDovLy9jaGF0LWInKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25JZDogb3duZWRDaGF0Py5zZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdGNoYXQ6IG93bmVkQ2hhdD8uY2hhdCxcblx0XHRcdG1pc3Npbmc6IHNlcnZpY2UuZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZShVUkkucGFyc2UoJ3Rlc3Q6Ly8vbWlzc2luZycpKSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdiJyxcblx0XHRcdGNoYXQ6IGNoYXRCLFxuXHRcdFx0bWlzc2luZzogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlVmlzaWJsZVNlc3Npb25zIHdhaXRzIGZvciBzZXNzaW9uIHRvIGFwcGVhciB2aWEgb25EaWRDaGFuZ2VTZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXRTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0YXJnZXQnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbkNoYW5nZUV2ZW50PigpKTtcblxuXHRcdGxldCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIodGFyZ2V0U2Vzc2lvbik7IH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gc2Vzc2lvbnM7IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IG5ldyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UoKTtcblxuXHRcdC8vIFNlZWQgc3RvcmFnZSBzbyB0aGUgbWFuYWdlbWVudCBzZXJ2aWNlIHRyZWF0cyBgdGFyZ2V0U2Vzc2lvbmAgYXMgdGhlXG5cdFx0Ly8gbGFzdCBhY3RpdmUgc2Vzc2lvbiBhbmQgdHJpZXMgdG8gcmVzdG9yZSBpdCBvbiBzdGFydHVwLlxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZS5zdG9yZShcblx0XHRcdCdhZ2VudFNlc3Npb25zLmFjdGl2ZVNlc3Npb25TdGF0ZXMnLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoW3sgc2Vzc2lvblJlc291cmNlOiB0YXJnZXRTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHZpc2libGVPcmRlcjogMCwgaXNBY3RpdmU6IHRydWUgfV0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRjb25zdCB2aWV3ID0gY3JlYXRlVmlldyhpbnN0YW50aWF0aW9uU2VydmljZSwgc2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gQXQgdGhpcyBwb2ludCB0aGUgcHJvdmlkZXIgZG9lcyBub3QgeWV0IGtub3cgYWJvdXQgdGhlIHNlc3Npb25cblx0XHQvLyAobWltaWNraW5nIGFuIGFnZW50IGhvc3QgcHJvdmlkZXIgd2hvc2UgY2FjaGUgaGFzIG5vdCBsb2FkZWQgeWV0KS5cblx0XHRjb25zdCByZXN0b3JlUHJvbWlzZSA9IHZpZXcucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldy52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkuZmlsdGVyKChzKTogcyBpcyBOb25OdWxsYWJsZTx0eXBlb2Ygcz4gPT4gISFzKS5tYXAocyA9PiBzLnNlc3Npb25JZCksIFtdKTtcblxuXHRcdC8vIE5vdyB0aGUgcHJvdmlkZXIgbGVhcm5zIGFib3V0IHRoZSBzZXNzaW9uIGFuZCBmaXJlcyBpdHMgY2hhbmdlIGV2ZW50LlxuXHRcdC8vIGBvbkRpZENoYW5nZVByb3ZpZGVyc2AgZG9lcyBOT1QgZmlyZSBoZXJlIFx1MjAxNCBvbmx5IHRoZSBwZXItcHJvdmlkZXJcblx0XHQvLyBzZXNzaW9uIGNoYW5nZSBldmVudCBcdTIwMTQgc28gdGhlIGZpeCBtdXN0IHN1YnNjcmliZSB0byBpdCBhcyB3ZWxsLlxuXHRcdHNlc3Npb25zID0gW3RhcmdldFNlc3Npb25dO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbdGFyZ2V0U2Vzc2lvbl0sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdGF3YWl0IHJlc3RvcmVQcm9taXNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldy52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkubWFwKHMgPT4gcz8uc2Vzc2lvbklkKSwgW3RhcmdldFNlc3Npb24uc2Vzc2lvbklkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JPVU5EVFJJUDogb3BlbmVkIHNlc3Npb24gaXMgcmV0YWluZWQgYWNyb3NzIHNhdmUgKyByZXN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZWRDaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC14JyksIHN0YXR1czogY29uc3RPYnNlcnZhYmxlKDEpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3gnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoMSksXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjcmVhdGVkQ2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjcmVhdGVkQ2hhdCksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcihzZXNzaW9uKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgbWFrZVNlcnZpY2UgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaTogZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRcdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRyZXR1cm4geyBzZXJ2aWNlLCB2aWV3IH07XG5cdFx0fTtcblxuXHRcdC8vIEZpcnN0IHdpbmRvdzogb3BlbiB0aGUgc2Vzc2lvbiwgdGhlbiBzaW11bGF0ZSBzaHV0ZG93biAoZmx1c2ggc3RvcmFnZSkuXG5cdFx0Y29uc3QgZmlyc3QgPSBtYWtlU2VydmljZSgpO1xuXHRcdGF3YWl0IGZpcnN0LnZpZXcub3BlblNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAneCcpO1xuXHRcdGF3YWl0IHN0b3JhZ2UuZmx1c2goKTtcblxuXHRcdC8vIFNlY29uZCB3aW5kb3c6IHJlc3RvcmUgZnJvbSBwZXJzaXN0ZWQgc3RhdGUuXG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFrZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZWNvbmQudmlldy5yZXN0b3JlVmlzaWJsZVNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZpc2libGU6IHNlY29uZC52aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRhY3RpdmU6IHNlY29uZC52aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCA/PyBudWxsLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFsneCddLFxuXHRcdFx0YWN0aXZlOiAneCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JBQ0U6IGEgbmV3IHNlc3Npb24gY3JlYXRlZCBkdXJpbmcgcmVzdG9yZSBkb2VzIG5vdCBkcm9wIHRoZSByZXN0b3JlZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldFNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3RhcmdldCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdmcmVzaCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVNlc3Npb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXG5cdFx0bGV0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcih0YXJnZXRTZXNzaW9uKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBzZXNzaW9uczsgfVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbigpOiBJU2Vzc2lvbiB7IHJldHVybiBuZXdTZXNzaW9uOyB9XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyczogW10sIGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZS5zdG9yZShcblx0XHRcdCdhZ2VudFNlc3Npb25zLmFjdGl2ZVNlc3Npb25TdGF0ZXMnLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoW3sgc2Vzc2lvblJlc291cmNlOiB0YXJnZXRTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHZpc2libGVPcmRlcjogMCwgaXNBY3RpdmU6IHRydWUgfV0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIFJlc3RvcmUgc3RhcnRzIGJ1dCB0aGUgcHJvdmlkZXIgaGFzIG5vdCB5ZXQgc3VyZmFjZWQgdGhlIHNlc3Npb24uXG5cdFx0Y29uc3QgcmVzdG9yZVByb21pc2UgPSB2aWV3LnJlc3RvcmVWaXNpYmxlU2Vzc2lvbnMoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdC8vIFRoZSBuZXctY2hhdCB3aWRnZXQgZWFnZXJseSBjcmVhdGVzIGEgc2Vzc2lvbiBmb3IgdGhlIHJlc3RvcmVkXG5cdFx0Ly8gd29ya3NwYWNlIGZvbGRlciB3aGlsZSByZXN0b3JlIGlzIHN0aWxsIHdhaXRpbmcgZm9yIGl0cyBzZXNzaW9uLlxuXHRcdHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vZm9sZGVyJykpO1xuXG5cdFx0Ly8gVGhlIHByb3ZpZGVyIG5vdyBzdXJmYWNlcyB0aGUgcGVyc2lzdGVkIHNlc3Npb24uXG5cdFx0c2Vzc2lvbnMgPSBbdGFyZ2V0U2Vzc2lvbl07XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFt0YXJnZXRTZXNzaW9uXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGF3YWl0IHJlc3RvcmVQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNUYXJnZXQ6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLnNvbWUocyA9PiBzPy5zZXNzaW9uSWQgPT09ICd0YXJnZXQnKSxcblx0XHRcdGFjdGl2ZTogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQgPz8gbnVsbCxcblx0XHR9LCB7XG5cdFx0XHRoYXNUYXJnZXQ6IHRydWUsXG5cdFx0XHRhY3RpdmU6ICd0YXJnZXQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ29wZW5OZXdTZXNzaW9uIGluaGVyaXRzIHRoZSBhY3RpdmUgc2Vzc2lvbiB3b3Jrc3BhY2Ugd2hlbiByZXF1ZXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFrZVdvcmtzcGFjZSA9ICh1cmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlID0+ICh7XG5cdFx0XHR1cmksXG5cdFx0XHRsYWJlbDogJ3dzJyxcblx0XHRcdGljb246IENvZGljb24udm0sXG5cdFx0XHRmb2xkZXJzOiBbeyByb290OiB1cmksIHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSwgbmFtZTogJ3dzJywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9XSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlQicpO1xuXHRcdGNvbnN0IG9wZW5TZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvcGVuJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKHdvcmtzcGFjZUIpKSB9KTtcblxuXHRcdGxldCBjcmVhdGVkRm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIob3BlblNlc3Npb24pOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtvcGVuU2Vzc2lvbl07IH1cblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpPzogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4gbWFrZVdvcmtzcGFjZShmb2xkZXJVcmkhKTsgfVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmk/OiBVUkkpOiBJU2Vzc2lvbiB7XG5cdFx0XHRcdGNyZWF0ZWRGb2xkZXJVcmkgPSBmb2xkZXJVcmk7XG5cdFx0XHRcdHJldHVybiBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2luaGVyaXRlZCcsIHByb3ZpZGVySWQ6ICd0ZXN0Jywgd29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUobWFrZVdvcmtzcGFjZShmb2xkZXJVcmkhKSkgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShvcGVuU2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdC8vIE1ha2UgdGhlIGVzdGFibGlzaGVkIHNlc3Npb24gYWN0aXZlLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24ob3BlblNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ29wZW4nKTtcblxuXHRcdC8vIE9wZW5pbmcgYSBuZXcgc2Vzc2lvbiB2aWV3IGluaGVyaXRzIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHdvcmtzcGFjZS5cblx0XHR2aWV3Lm9wZW5OZXdTZXNzaW9uKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZWRGb3I6IGNyZWF0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCkgPz8gbnVsbCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0XHRhY3RpdmVXb3Jrc3BhY2U6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290LnRvU3RyaW5nKCkgPz8gbnVsbCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkRm9yOiB3b3Jrc3BhY2VCLnRvU3RyaW5nKCksXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiAnaW5oZXJpdGVkJyxcblx0XHRcdGFjdGl2ZVdvcmtzcGFjZTogd29ya3NwYWNlQi50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuTmV3U2Vzc2lvbiBkb2VzIG5vdCBpbmhlcml0IHRoZSBhY3RpdmUgc2Vzc2lvbiB3b3Jrc3BhY2UgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VCID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZUInKTtcblx0XHRjb25zdCBvcGVuU2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ29wZW4nLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0XHR1cmk6IHdvcmtzcGFjZUIsXG5cdFx0XHRcdGxhYmVsOiAnd3MnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnZtLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyByb290OiB3b3Jrc3BhY2VCLCB3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2VCLCBuYW1lOiAnd3MnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0gc2F0aXNmaWVzIElTZXNzaW9uV29ya3NwYWNlKSxcblx0XHR9KTtcblxuXHRcdGxldCBjcmVhdGVOZXdTZXNzaW9uQ2FsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIob3BlblNlc3Npb24pOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtvcGVuU2Vzc2lvbl07IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVOZXdTZXNzaW9uQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIG9wZW5TZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uob3BlblNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKG9wZW5TZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdvcGVuJyk7XG5cblx0XHQvLyBXaXRob3V0IHRoZSBpbmhlcml0IG9wdGlvbiwgbm8gbmV3IHNlc3Npb24gaXMgY3JlYXRlZCBmcm9tIHRoZSBhY3RpdmVcblx0XHQvLyBzZXNzaW9uJ3Mgd29ya3NwYWNlOyB0aGUgZW1wdHkgbmV3LXNlc3Npb24gdmlldyBpcyBzaG93biBpbnN0ZWFkLlxuXHRcdHZpZXcub3Blbk5ld1Nlc3Npb24oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlTmV3U2Vzc2lvbkNhbGxlZCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlTmV3U2Vzc2lvbkNhbGxlZDogZmFsc2UsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiBudWxsLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsZWQgb3Blbk5ld1Nlc3Npb24gZG9lcyBub3QgcmVwbGFjZSBhIG5ld2VyIGRyYWZ0IGFmdGVyIHdvcmtzcGFjZSB0cnVzdCByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdGFsZUZvbGRlciA9IFVSSS5maWxlKCcvc3RhbGUnKTtcblx0XHRjb25zdCBsYXRlc3RGb2xkZXIgPSBVUkkuZmlsZSgnL2xhdGVzdCcpO1xuXHRcdGNvbnN0IG1ha2VXb3Jrc3BhY2UgPSAodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSA9PiAoe1xuXHRcdFx0dXJpLFxuXHRcdFx0bGFiZWw6IHVyaS5wYXRoLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRmb2xkZXJzOiBbeyByb290OiB1cmksIHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSwgbmFtZTogdXJpLnBhdGgsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiB0cnVlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBzdGFsZVNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3N0YWxlJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKHN0YWxlRm9sZGVyKSkgfSk7XG5cdFx0Y29uc3QgbGF0ZXN0U2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnbGF0ZXN0JywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKGxhdGVzdEZvbGRlcikpIH0pO1xuXHRcdGNvbnN0IGNyZWF0ZWRGb2xkZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKGxhdGVzdFNlc3Npb24pOyB9XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4gbWFrZVdvcmtzcGFjZShmb2xkZXJVcmkpOyB9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVkRm9sZGVycy5wdXNoKGZvbGRlclVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIGZvbGRlclVyaS50b1N0cmluZygpID09PSBzdGFsZUZvbGRlci50b1N0cmluZygpID8gc3RhbGVTZXNzaW9uIDogbGF0ZXN0U2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHN0YWxlVHJ1c3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0bGV0IHRydXN0UmVxdWVzdENvdW50ID0gMDtcblx0XHRjb25zdCB0cnVzdFJlcXVlc3RTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZXF1ZXN0UmVzb3VyY2VzVHJ1c3QoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRcdHRydXN0UmVxdWVzdENvdW50Kys7XG5cdFx0XHRcdHJldHVybiB0cnVzdFJlcXVlc3RDb3VudCA9PT0gMSA/IHN0YWxlVHJ1c3QucCA6IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShcblx0XHRcdGxhdGVzdFNlc3Npb24sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0bmV3IFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKCksXG5cdFx0XHR0cnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc3RhbGVDdHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Y29uc3Qgc3RhbGVPcGVuID0gdmlldy5vcGVuTmV3U2Vzc2lvbih7IGZvbGRlclVyaTogc3RhbGVGb2xkZXIgfSwgc3RhbGVDdHMudG9rZW4pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHN0YWxlQ3RzLmNhbmNlbCgpO1xuXHRcdGNvbnN0IGxhdGVzdFJlc3VsdCA9IGF3YWl0IHZpZXcub3Blbk5ld1Nlc3Npb24oeyBmb2xkZXJVcmk6IGxhdGVzdEZvbGRlciB9KTtcblx0XHRzdGFsZVRydXN0LmNvbXBsZXRlKHRydWUpO1xuXHRcdGNvbnN0IHN0YWxlUmVzdWx0ID0gYXdhaXQgc3RhbGVPcGVuO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVkRm9sZGVycyxcblx0XHRcdGFjdGl2ZVNlc3Npb25JZDogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0XHRsYXRlc3RTZXNzaW9uSWQ6IGxhdGVzdFJlc3VsdC5zZXNzaW9uPy5zZXNzaW9uSWQsXG5cdFx0XHRzdGFsZVNlc3Npb25JZDogc3RhbGVSZXN1bHQuc2Vzc2lvbj8uc2Vzc2lvbklkLFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZWRGb2xkZXJzOiBbbGF0ZXN0Rm9sZGVyLnRvU3RyaW5nKCldLFxuXHRcdFx0YWN0aXZlU2Vzc2lvbklkOiAnbGF0ZXN0Jyxcblx0XHRcdGxhdGVzdFNlc3Npb25JZDogJ2xhdGVzdCcsXG5cdFx0XHRzdGFsZVNlc3Npb25JZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ29wZW5OZXdTZXNzaW9uIHJlY3JlYXRlcyBhIGRyYWZ0IGZvciB0aGUgYWN0aXZlIHNlc3Npb24gd29ya3NwYWNlIHdoZW4gaW5oZXJpdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYWtlV29ya3NwYWNlID0gKHVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgPT4gKHtcblx0XHRcdHVyaSxcblx0XHRcdGxhYmVsOiAnd3MnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi52bSxcblx0XHRcdGZvbGRlcnM6IFt7IHJvb3Q6IHVyaSwgd29ya2luZ0RpcmVjdG9yeTogdXJpLCBuYW1lOiAnd3MnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlQSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2VBJyk7XG5cdFx0Y29uc3Qgb3BlblNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29wZW4nLCBwcm92aWRlcklkOiAndGVzdCcsIHdvcmtzcGFjZTogY29uc3RPYnNlcnZhYmxlKG1ha2VXb3Jrc3BhY2Uod29ya3NwYWNlQSkpIH0pO1xuXHRcdGNvbnN0IHBlbmRpbmdTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdwZW5kaW5nJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKHdvcmtzcGFjZUEpKSB9KTtcblxuXHRcdGxldCBjcmVhdGVOZXdTZXNzaW9uQ291bnQgPSAwO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKG9wZW5TZXNzaW9uKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbb3BlblNlc3Npb25dOyB9XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaT86IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIG1ha2VXb3Jrc3BhY2UoZm9sZGVyVXJpISk7IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVOZXdTZXNzaW9uQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHBlbmRpbmdTZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uob3BlblNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHQvLyBDb21wb3NlIGFuIGluLXByb2dyZXNzIG5ldyBzZXNzaW9uIChwZW5kaW5nIGRyYWZ0KSBmb3Igd29ya3NwYWNlIEEuXG5cdFx0dmlldy5vcGVuTmV3U2Vzc2lvbih7IGZvbGRlclVyaTogd29ya3NwYWNlQSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdwZW5kaW5nJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byB0aGUgZXN0YWJsaXNoZWQgc2Vzc2lvbiwgd2hpY2ggc2hhcmVzIHdvcmtzcGFjZSBBLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24ob3BlblNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ29wZW4nKTtcblxuXHRcdC8vIE9wZW5pbmcgYSBuZXcgc2Vzc2lvbiB2aWV3IGluaGVyaXRzIHdvcmtzcGFjZSBBIGFuZCBhbHdheXMgY3JlYXRlcyBhXG5cdFx0Ly8gZnJlc2ggZHJhZnQgZm9yIGl0IChubyB3b3Jrc3BhY2UgZGUtZHVwbGljYXRpb24pLlxuXHRcdHZpZXcub3Blbk5ld1Nlc3Npb24oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlTmV3U2Vzc2lvbkNvdW50LFxuXHRcdFx0YWN0aXZlU2Vzc2lvbjogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQgPz8gbnVsbCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVOZXdTZXNzaW9uQ291bnQ6IDIsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiAncGVuZGluZycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVWaXNpYmxlU2Vzc2lvbnMgcmVzdG9yZXMgdGhlIGdyaWQgb3JkZXIsIHN0aWNreSBhbmQgYWN0aXZlIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25BID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdiJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25DID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdjJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gW3Nlc3Npb25BLCBzZXNzaW9uQiwgc2Vzc2lvbkNdO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIHNlc3Npb25zOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHQvLyBQZXJzaXN0ZWQgZ3JpZDogW0EgKHN0aWNreSksIEIgKGFjdGl2ZSksIENdXG5cdFx0c3RvcmFnZS5zdG9yZShcblx0XHRcdCdhZ2VudFNlc3Npb25zLmFjdGl2ZVNlc3Npb25TdGF0ZXMnLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoW1xuXHRcdFx0XHR7IHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkEucmVzb3VyY2UudG9TdHJpbmcoKSwgdmlzaWJsZU9yZGVyOiAwLCBpc1N0aWNreTogdHJ1ZSwgaXNBY3RpdmU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQi5yZXNvdXJjZS50b1N0cmluZygpLCB2aXNpYmxlT3JkZXI6IDEsIGlzU3RpY2t5OiBmYWxzZSwgaXNBY3RpdmU6IHRydWUgfSxcblx0XHRcdFx0eyBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25DLnJlc291cmNlLnRvU3RyaW5nKCksIHZpc2libGVPcmRlcjogMiwgaXNTdGlja3k6IGZhbHNlLCBpc0FjdGl2ZTogZmFsc2UgfSxcblx0XHRcdF0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGF3YWl0IHZpZXcucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmxlOiB2aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRzdGlja3k6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLm1hcChzID0+IHM/LnN0aWNreS5nZXQoKSA/PyBmYWxzZSksXG5cdFx0XHRhY3RpdmU6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFsnYScsICdiJywgJ2MnXSxcblx0XHRcdHN0aWNreTogW3RydWUsIGZhbHNlLCBmYWxzZV0sXG5cdFx0XHRhY3RpdmU6ICdiJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVZpc2libGVTZXNzaW9ucyBsYXlzIG91dCB0aGUgZ3JpZCBhdG9taWNhbGx5IHdpdGhvdXQgaW50ZXJtZWRpYXRlIHNpbmdsZS1zZXNzaW9uIHN0YXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uQSA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYicsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IFtzZXNzaW9uQSwgc2Vzc2lvbkJdO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIHNlc3Npb25zOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHQvLyBQZXJzaXN0ZWQgZ3JpZDogW0EsIEIgKGFjdGl2ZSldIFx1MjAxNCB0aGUgYWN0aXZlIHNlc3Npb24gaXMgTk9UIHRoZVxuXHRcdC8vIGxlZnQtbW9zdCBvbmUsIHdoaWNoIHVzZWQgdG8gc3VyZmFjZSBCIGFsb25lIGJlZm9yZSBBIHdhcyBpbnNlcnRlZC5cblx0XHRzdG9yYWdlLnN0b3JlKFxuXHRcdFx0J2FnZW50U2Vzc2lvbnMuYWN0aXZlU2Vzc2lvblN0YXRlcycsXG5cdFx0XHRKU09OLnN0cmluZ2lmeShbXG5cdFx0XHRcdHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQS5yZXNvdXJjZS50b1N0cmluZygpLCB2aXNpYmxlT3JkZXI6IDAsIGlzU3RpY2t5OiBmYWxzZSwgaXNBY3RpdmU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQi5yZXNvdXJjZS50b1N0cmluZygpLCB2aXNpYmxlT3JkZXI6IDEsIGlzU3RpY2t5OiBmYWxzZSwgaXNBY3RpdmU6IHRydWUgfSxcblx0XHRcdF0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIFJlY29yZCBldmVyeSBncmlkIHN0YXRlIHB1Ymxpc2hlZCB3aGlsZSByZXN0b3JpbmcuXG5cdFx0Y29uc3Qgc3RhdGVzOiAoc3RyaW5nIHwgbnVsbClbXVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHN0YXRlcy5wdXNoKHZpZXcudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCkpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHZpZXcucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXG5cdFx0Ly8gVGhlIGdyaWQgbXVzdCBuZXZlciBnbyB0aHJvdWdoIGEgc3RhdGUgc2hvd2luZyBvbmx5IHRoZSBhY3RpdmVcblx0XHQvLyBzZXNzaW9uICdiJyBvbiBpdHMgb3duIFx1MjAxNCB0aGF0IGludGVybWVkaWF0ZSBsYXlvdXQgaXMgdGhlIGZsaWNrZXIuXG5cdFx0Y29uc3Qgc2hvd2VkQWN0aXZlQWxvbmUgPSBzdGF0ZXMuc29tZShzID0+IHMubGVuZ3RoID09PSAxICYmIHNbMF0gPT09ICdiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNob3dlZEFjdGl2ZUFsb25lLFxuXHRcdFx0ZmluYWw6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLm1hcChzID0+IHM/LnNlc3Npb25JZCA/PyBudWxsKSxcblx0XHRcdGFjdGl2ZTogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0fSwge1xuXHRcdFx0c2hvd2VkQWN0aXZlQWxvbmU6IGZhbHNlLFxuXHRcdFx0ZmluYWw6IFsnYScsICdiJ10sXG5cdFx0XHRhY3RpdmU6ICdiJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZE5ld0NoYXRSZXF1ZXN0IGtlZXBzIHRoZSBzdGFydGVkIHNlc3Npb24gYWN0aXZlIGZvciBhIGZvcmVncm91bmQgc2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdCcpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIE9wZW4gdGhlIHNlc3Npb24gc28gaXQgYmVjb21lcyB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdzMScpO1xuXG5cdFx0Ly8gQSBmb3JlZ3JvdW5kIG5ldy1jaGF0IHNlbmQga2VlcHMgdGhlIHN0YXJ0ZWQgc2Vzc2lvbiBhY3RpdmUgKHRoZSB2aWV3XG5cdFx0Ly8gZm9sbG93cyB0aGUgc2VuZCBhbmQgbmV2ZXIgcmVzZXRzIHRoZSBhY3RpdmUgc2xvdCkuXG5cdFx0YXdhaXQgc2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbiwgeyBxdWVyeTogJ2hpJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdzMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTmV3Q2hhdFJlcXVlc3Qgd2l0aCBiYWNrZ3JvdW5kIHJlc29sdmVzIGJlZm9yZSBwcm92aWRlciBzZW5kIGNvbW1pdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGxldCBjb21wbGV0ZVNlbmRSZXF1ZXN0OiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlbmRSZXF1ZXN0U3RhcnRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdFx0XHRzZW5kUmVxdWVzdFN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRjb21wbGV0ZVNlbmRSZXF1ZXN0ID0gcmVzb2x2ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHQvLyBUaGUgYmFja2dyb3VuZCBzZW5kIGlzIGZpcmUtYW5kLWZvcmdldDogdGhlIHByb21pc2UgcmVzb2x2ZXMgYmVmb3JlXG5cdFx0Ly8gdGhlIHByb3ZpZGVyJ3MgYHNlbmRSZXF1ZXN0YCBjb21taXRzLlxuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gc2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbiwgeyBxdWVyeTogJ2hpJywgYmFja2dyb3VuZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZW5kUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW5kUmVxdWVzdFN0YXJ0ZWQsIHRydWUpO1xuXG5cdFx0Y29tcGxldGVTZW5kUmVxdWVzdD8uKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IHdpdGggYmFja2dyb3VuZCBpcyBmaXJlLWFuZC1mb3JnZXQgYW5kIGRvZXMgbm90IGZpcmUgb25XaWxsU2VuZFJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSwgc3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRsZXQgY29tcGxldGVTZW5kUmVxdWVzdDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZW50Q2hhdFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VudENoYXRSZXNvdXJjZSA9IGNoYXRSZXNvdXJjZTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y29tcGxldGVTZW5kUmVxdWVzdCA9IHJlc29sdmU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0bGV0IHdpbGxTZW5kQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uV2lsbFNlbmRSZXF1ZXN0KCgpID0+IHdpbGxTZW5kQ291bnQrKykpO1xuXG5cdFx0Ly8gVGhlIGJhY2tncm91bmQgc2VuZCBpcyBmaXJlLWFuZC1mb3JnZXQgKGl0IHJlc29sdmVzIGJlZm9yZSB0aGVcblx0XHQvLyBwcm92aWRlciBjb21taXRzKSBhbmQgbmV2ZXIgZmlyZXMgYG9uV2lsbFNlbmRSZXF1ZXN0YCwgc28gdGhlIHZpZXcnc1xuXHRcdC8vIHNlbmQtZm9sbG93IGNhbm5vdCBuYXZpZ2F0ZSBpbnRvIHRoZSBzZW50IGNoYXQuXG5cdFx0YXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uLCBjaGF0LCB7IHF1ZXJ5OiAnaGknLCBiYWNrZ3JvdW5kOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZW50Q2hhdFJlc291cmNlOiBzZW50Q2hhdFJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0d2lsbFNlbmRDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRzZW50Q2hhdFJlc291cmNlOiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHR3aWxsU2VuZENvdW50OiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29tcGxldGVTZW5kUmVxdWVzdD8uKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmQtZm9sbG93IGFjdGl2YXRlcyBvbmx5IHZpc2libGUgY2hhdCB0YWJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1haW5DaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC9tYWluJyksIHRpdGxlOiBjb25zdE9ic2VydmFibGUoJ21haW4nKSB9O1xuXHRcdGNvbnN0IHNpZGVDaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC9zaWRlJyksIHRpdGxlOiBjb25zdE9ic2VydmFibGUoJ3NpZGUnKSwgb3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0IH0gfTtcblx0XHRjb25zdCB0b29sQ2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvdG9vbCcpLCB0aXRsZTogY29uc3RPYnNlcnZhYmxlKCd0b29sJyksIG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sIH0sIGludGVyYWN0aXZpdHk6IGNvbnN0T2JzZXJ2YWJsZShDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSkgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbbWFpbkNoYXQsIHNpZGVDaGF0LCB0b29sQ2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShtYWluQ2hhdCksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHR9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0YXdhaXQgdmlldy5vcGVuQ2hhdChzZXNzaW9uLCBzaWRlQ2hhdC5yZXNvdXJjZSk7XG5cdFx0YXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uLCB0b29sQ2hhdCwgeyBxdWVyeTogJ2hpZGRlbiB0b29sJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBhZnRlckhpZGRlblNlbmQgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmFjdGl2ZUNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKTtcblxuXHRcdGF3YWl0IHZpZXcub3BlbkNoYXQoc2Vzc2lvbiwgdG9vbENoYXQucmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvbiwgdG9vbENoYXQsIHsgcXVlcnk6ICd2aXNpYmxlIHRvb2wnIH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IGFmdGVyVmlzaWJsZVNlbmQgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmFjdGl2ZUNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmlzaWJsZVRhYnM6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8udmlzaWJsZUNoYXRUYWJzLmdldCgpLm1hcChjaGF0ID0+IGNoYXQudGl0bGUuZ2V0KCkpLFxuXHRcdFx0YWZ0ZXJIaWRkZW5TZW5kLFxuXHRcdFx0YWZ0ZXJWaXNpYmxlU2VuZCxcblx0XHR9LCB7XG5cdFx0XHR2aXNpYmxlVGFiczogWydtYWluJywgJ3NpZGUnLCAndG9vbCddLFxuXHRcdFx0YWZ0ZXJIaWRkZW5TZW5kOiBzaWRlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0YWZ0ZXJWaXNpYmxlU2VuZDogdG9vbENoYXQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IHNlbmRzIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGFjdGl2ZSB2aWV3JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRsZXQgc2VuZFJlcXVlc3RTdGFydGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIF9jaGF0UmVzb3VyY2U6IFVSSSwgX29wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdHNlbmRSZXF1ZXN0U3RhcnRlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHQvLyBObyBhY3RpdmUgc2Vzc2lvbiBhbmQgbm8gcGVuZGluZyBjb21wb3NlciBiZWZvcmUgdGhlIGhlYWRsZXNzIHNlbmQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSwgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9KTtcblxuXHRcdC8vIFRoZSByZXF1ZXN0IHdhcyBzZW50LCBidXQgdGhlIHVzZXIncyB2aWV3IHdhcyBub3QgbmF2aWdhdGVkIGludG8gdGhlIHNlc3Npb24uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbmRSZXF1ZXN0U3RhcnRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IHJlZnVzZXMgYW4gdW50cnVzdGVkIHJlcXVpcmVkIHdvcmtzcGFjZSBiZWZvcmUgY3JlYXRpbmcgYSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyk7XG5cdFx0bGV0IHJlc29sdmVDb3VudCA9IDA7XG5cdFx0bGV0IGNyZWF0ZUNvdW50ID0gMDtcblx0XHRsZXQgc2VuZENvdW50ID0gMDtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdFx0XHRcdHJlc29sdmVDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHRydWUsXG5cdFx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VuZENvdW50Kys7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSA9IG5ldyBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSgpO1xuXHRcdHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UudHJ1c3RlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChmb2xkZXJVcmksIHsgcXVlcnk6ICdoaScgfSksXG5cdFx0XHRXb3Jrc3BhY2VOb3RUcnVzdGVkRXJyb3IsXG5cdFx0KTtcblx0XHR3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnRydXN0ZWQgPSB0cnVlO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KGZvbGRlclVyaSwgeyBxdWVyeTogJ2hpJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdGVkVXJpczogd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5yZXF1ZXN0ZWRVcmlzLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0cmVzb2x2ZUNvdW50LFxuXHRcdFx0Y3JlYXRlQ291bnQsXG5cdFx0XHRzZW5kQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0cmVxdWVzdGVkVXJpczogW2ZvbGRlclVyaS50b1N0cmluZygpLCBmb2xkZXJVcmkudG9TdHJpbmcoKV0sXG5cdFx0XHRyZXNvbHZlQ291bnQ6IDIsXG5cdFx0XHRjcmVhdGVDb3VudDogMSxcblx0XHRcdHNlbmRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGFyZ2V0IGF2YWlsYWJpbGl0eSByZXF1aXJlcyB0aGUgcmVxdWVzdGVkIHByb3ZpZGVyIGFuZCBzZXNzaW9uIHR5cGUgdG8gYmUgYWR2ZXJ0aXNlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBhdmFpbGFibGVGb2xkZXIgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vYXZhaWxhYmxlJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdXBwb3J0c1F1aWNrQ2hhdHMgPSB0cnVlO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFtcblx0XHRcdFx0eyBpZDogJ3dvcmtzcGFjZS1hZ2VudCcsIGxhYmVsOiAnV29ya3NwYWNlIEFnZW50JywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2stYWdlbnQnLCBsYWJlbDogJ1F1aWNrIEFnZW50JywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XTtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKGZvbGRlclVyaSwgYXZhaWxhYmxlRm9sZGVyKSA/IHsgZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlcyhmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRcdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoZm9sZGVyVXJpLCBhdmFpbGFibGVGb2xkZXIpID8gW3RoaXMuc2Vzc2lvblR5cGVzWzBdXSA6IFtdO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlZmF1bHRXb3Jrc3BhY2U6IHNlcnZpY2UuaXNOZXdTZXNzaW9uVGFyZ2V0QXZhaWxhYmxlKGF2YWlsYWJsZUZvbGRlciksXG5cdFx0XHRleGFjdFdvcmtzcGFjZTogc2VydmljZS5pc05ld1Nlc3Npb25UYXJnZXRBdmFpbGFibGUoYXZhaWxhYmxlRm9sZGVyLCB7IHByb3ZpZGVySWQ6ICd0ZXN0Jywgc2Vzc2lvblR5cGVJZDogJ3dvcmtzcGFjZS1hZ2VudCcgfSksXG5cdFx0XHR3cm9uZ1dvcmtzcGFjZVR5cGU6IHNlcnZpY2UuaXNOZXdTZXNzaW9uVGFyZ2V0QXZhaWxhYmxlKGF2YWlsYWJsZUZvbGRlciwgeyBwcm92aWRlcklkOiAndGVzdCcsIHNlc3Npb25UeXBlSWQ6ICdxdWljay1hZ2VudCcgfSksXG5cdFx0XHRtaXNzaW5nV29ya3NwYWNlOiBzZXJ2aWNlLmlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZShVUkkucGFyc2UoJ3Rlc3Q6Ly8vbWlzc2luZycpKSxcblx0XHRcdGV4YWN0UXVpY2tDaGF0OiBzZXJ2aWNlLmlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKHsgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZUlkOiAncXVpY2stYWdlbnQnIH0pLFxuXHRcdFx0d3JvbmdRdWlja0NoYXRQcm92aWRlcjogc2VydmljZS5pc1F1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZSh7IHByb3ZpZGVySWQ6ICdvdGhlcicsIHNlc3Npb25UeXBlSWQ6ICdxdWljay1hZ2VudCcgfSksXG5cdFx0fSwge1xuXHRcdFx0ZGVmYXVsdFdvcmtzcGFjZTogdHJ1ZSxcblx0XHRcdGV4YWN0V29ya3NwYWNlOiB0cnVlLFxuXHRcdFx0d3JvbmdXb3Jrc3BhY2VUeXBlOiBmYWxzZSxcblx0XHRcdG1pc3NpbmdXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0ZXhhY3RRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHR3cm9uZ1F1aWNrQ2hhdFByb3ZpZGVyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiByZWplY3RzIGEgcGlubmVkIHNlc3Npb24gdHlwZSB0aGF0IGlzIG5vdCBhZHZlcnRpc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0XHRcdFx0cmV0dXJuIHsgZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXNzZXJ0LnRocm93cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZUlkOiAnbWlzc2luZycgfSksXG5cdFx0XHQvZG9lcyBub3QgYWR2ZXJ0aXNlIHNlc3Npb24gdHlwZSAnbWlzc2luZycvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaGVyaXRhYmxlU2Vzc2lvblRhcmdldCBkcm9wcyBhIGhhcm5lc3MgdGhlIGZvbGRlciBubyBsb25nZXIgb2ZmZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKTtcblx0XHQvLyBUaGUgcHJvdmlkZXIgc3RpbGwgcmVzb2x2ZXMgdGhlIGZvbGRlciAoaXRzIGV4aXN0aW5nIHNlc3Npb25zIHN0YXlcblx0XHQvLyB1c2FibGUpIGJ1dCBubyBsb25nZXIgYWR2ZXJ0aXNlcyB0aGUgdHlwZSB0aGV5IHdlcmUgY3JlYXRlZCB3aXRoIFx1MjAxNFxuXHRcdC8vIGUuZy4gdGhlIGV4dGVuc2lvbi1ob3N0IENvcGlsb3QgQ0xJIG9uY2Vcblx0XHQvLyBgY2hhdC5hZ2VudHMuY29waWxvdENsaS5oaWRlRXh0ZW5zaW9uSG9zdGAgaXMgb24uXG5cdFx0Y29uc3QgaGlkZGVuSGFybmVzc1Nlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShfZm9sZGVyVXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdFx0XHRcdHJldHVybiB7IGZvbGRlclVyaTogX2ZvbGRlclVyaSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXMoKTogSVNlc3Npb25UeXBlW10ge1xuXHRcdFx0XHRyZXR1cm4gW3sgaWQ6ICd0ZXN0JywgbGFiZWw6ICdUZXN0JywgaWNvbjogQ29kaWNvbi52bSB9XTtcblx0XHRcdH1cblx0XHR9KGhpZGRlbkhhcm5lc3NTZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoaGlkZGVuSGFybmVzc1Nlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRjb25zdCBzdGlsbE9mZmVyZWRTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMicsIHByb3ZpZGVySWQ6ICd0ZXN0Jywgc2Vzc2lvblR5cGU6ICd0ZXN0JyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGlkZGVuSGFybmVzczogaW5oZXJpdGFibGVTZXNzaW9uVGFyZ2V0KHNlcnZpY2UsIGhpZGRlbkhhcm5lc3NTZXNzaW9uLCBmb2xkZXJVcmkpLFxuXHRcdFx0b2ZmZXJlZEhhcm5lc3M6IGluaGVyaXRhYmxlU2Vzc2lvblRhcmdldChzZXJ2aWNlLCBzdGlsbE9mZmVyZWRTZXNzaW9uLCBmb2xkZXJVcmkpLFxuXHRcdFx0bm9Gb2xkZXI6IGluaGVyaXRhYmxlU2Vzc2lvblRhcmdldChzZXJ2aWNlLCBzdGlsbE9mZmVyZWRTZXNzaW9uLCB1bmRlZmluZWQpLFxuXHRcdFx0bm9TZXNzaW9uOiBpbmhlcml0YWJsZVNlc3Npb25UYXJnZXQoc2VydmljZSwgdW5kZWZpbmVkLCBmb2xkZXJVcmkpLFxuXHRcdH0sIHtcblx0XHRcdGhpZGRlbkhhcm5lc3M6IHt9LFxuXHRcdFx0b2ZmZXJlZEhhcm5lc3M6IHsgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZUlkOiAndGVzdCcgfSxcblx0XHRcdG5vRm9sZGVyOiB7fSxcblx0XHRcdG5vU2Vzc2lvbjoge30sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgTmV3IFNlc3Npb24gZ2VzdHVyZSB3aG9zZSBoYXJuZXNzIGlzIGhpZGRlbiBzdGlsbCBjcmVhdGVzIG9uIHRoZSBmYWxsYmFjayBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBFbmQtdG8tZW5kIHNoYXBlIG9mIHRoZSBBZ2VudHMtd2luZG93IGJ1ZzogYW4gZXh0ZW5zaW9uLWhvc3Qgc2Vzc2lvbiBpc1xuXHRcdC8vIG9wZW4sIGl0cyBoYXJuZXNzIGhhcyBzaW5jZSBiZWVuIGhpZGRlbiAoYGhpZGVFeHRlbnNpb25Ib3N0YCksIGFuZCB0aGVcblx0XHQvLyB1c2VyIHByZXNzZXMgTmV3LiBUaGUgZ2VzdHVyZSBzcHJlYWRzIGBpbmhlcml0YWJsZVNlc3Npb25UYXJnZXRgIGludG9cblx0XHQvLyB0aGUgb3B0aW9ucywgc28gdGhpcyBhbHNvIGNvdmVycyB0aGUgZW1wdHktdGFyZ2V0IHBhdGggYXQgYSBjYWxsIHNpdGUuXG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpO1xuXHRcdGNvbnN0IGV4dEhvc3RTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdleHRob3N0LTEnLCBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlOiAnY29waWxvdGNsaScgfSk7XG5cdFx0Y29uc3QgY3JlYXRlZDogeyBwcm92aWRlcklkOiBzdHJpbmc7IHNlc3Npb25UeXBlSWQ6IHN0cmluZyB9W10gPSBbXTtcblxuXHRcdC8vIFN0aWxsIHJlc29sdmVzIHRoZSBmb2xkZXIgKGl0cyBleGlzdGluZyBzZXNzaW9ucyBzdGF5IHVzYWJsZSkgYnV0XG5cdFx0Ly8gYWR2ZXJ0aXNlcyBub3RoaW5nIGZvciBpdC5cblx0XHRjb25zdCBjb3BpbG90ID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSAnY29waWxvdCc7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvcmRlciA9IDA7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElTZXNzaW9uVHlwZVtdID0gW107XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKF9mb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBfZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblR5cGVzKCk6IElTZXNzaW9uVHlwZVtdIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtleHRIb3N0U2Vzc2lvbl07IH1cblx0XHR9KGV4dEhvc3RTZXNzaW9uKTtcblxuXHRcdC8vIFRoZSBhZ2VudCBob3N0IHNvcnRzIGZpcnN0IChgY2hhdC5hZ2VudEhvc3QuZGVmYXVsdFNlc3Npb25zUHJvdmlkZXJgKS5cblx0XHRjb25zdCBhZ2VudEhvc3RTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhaC1kcmFmdCcsIHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIHNlc3Npb25UeXBlOiAnY29waWxvdGNsaScgfSk7XG5cdFx0Y29uc3QgYWdlbnRIb3N0ID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXIgPSAtMTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbeyBpZDogJ2NvcGlsb3RjbGknLCBsYWJlbDogJ0NvcGlsb3QnLCBpY29uOiBDb2RpY29uLnZtIH1dO1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShfZm9sZGVyVXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaTogX2ZvbGRlclVyaSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlcygpOiBJU2Vzc2lvblR5cGVbXSB7IHJldHVybiBbeyBpZDogJ2NvcGlsb3RjbGknLCBsYWJlbDogJ0NvcGlsb3QnLCBpY29uOiBDb2RpY29uLnZtIH1dOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKF9mb2xkZXJVcmk6IFVSSSwgc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVkLnB1c2goeyBwcm92aWRlcklkOiB0aGlzLmlkLCBzZXNzaW9uVHlwZUlkIH0pO1xuXHRcdFx0XHRyZXR1cm4gYWdlbnRIb3N0U2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KGFnZW50SG9zdFNlc3Npb24pO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtjb3BpbG90LCBhZ2VudEhvc3RdKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaTogZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IFRlc3RDaGF0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlcXVlc3RSZXNvdXJjZXNUcnVzdCgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRydWU7IH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihleHRIb3N0U2Vzc2lvbi5yZXNvdXJjZSk7XG5cblx0XHRjb25zdCBhY3RpdmUgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdmlldy5vcGVuTmV3U2Vzc2lvbih7XG5cdFx0XHRmb2xkZXJVcmksXG5cdFx0XHQuLi5pbmhlcml0YWJsZVNlc3Npb25UYXJnZXQoc2VydmljZSwgYWN0aXZlLCBmb2xkZXJVcmkpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVkLFxuXHRcdFx0cmVzdWx0UHJvdmlkZXJJZDogcmVzdWx0LnNlc3Npb24/LnByb3ZpZGVySWQsXG5cdFx0XHR0cnVzdERlY2xpbmVkOiByZXN1bHQudHJ1c3REZWNsaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkOiBbeyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfV0sXG5cdFx0XHRyZXN1bHRQcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELFxuXHRcdFx0dHJ1c3REZWNsaW5lZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmRRdWlja0NoYXRSZXF1ZXN0IHVzZXMgdGhlIHF1aWNrLWNoYXQgY29udHJhY3Qgd2l0aG91dCBuYXZpZ2F0aW9uIG9yIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vcXVpY2stY2hhdCcpIH07XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYWN0aXZlJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdCA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3F1aWNrLTEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0aXNRdWlja0NoYXQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdXBwb3J0c1F1aWNrQ2hhdHMgPSB0cnVlO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbYWN0aXZlU2Vzc2lvbl07IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZVF1aWNrQ2hhdChzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYGNyZWF0ZVF1aWNrQ2hhdDoke3Nlc3Npb25UeXBlSWR9YCk7XG5cdFx0XHRcdHJldHVybiBxdWlja0NoYXQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRNb2RlbDoke21vZGVsSWR9YCk7IH1cblx0XHRcdG92ZXJyaWRlIHNldElzb2xhdGlvbk1vZGUoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ2lzb2xhdGlvbiBzaG91bGQgbm90IGJlIGNvbmZpZ3VyZWQnKTsgfVxuXHRcdFx0b3ZlcnJpZGUgc2V0QnJhbmNoKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdicmFuY2ggc2hvdWxkIG5vdCBiZSBjb25maWd1cmVkJyk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCgnc2VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gcXVpY2tDaGF0O1xuXHRcdFx0fVxuXHRcdH0ocXVpY2tDaGF0KTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoYWN0aXZlU2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jcmVhdGVBbmRTZW5kUXVpY2tDaGF0UmVxdWVzdCh7IHF1ZXJ5OiAnaGknIH0sIHtcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdHNlc3Npb25UeXBlSWQ6ICd0ZXN0Jyxcblx0XHRcdG1vZGVsSWQ6ICdncHQtNG8nLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdGJyYW5jaDogJ3N0YWxlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvbklkOiByZXN1bHQ/LnNlc3Npb25JZCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdFx0bmV3U2Vzc2lvbjogc2VydmljZS5uZXdTZXNzaW9uLmdldCgpLFxuXHRcdFx0Y2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbklkOiAncXVpY2stMScsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiAnYWN0aXZlJyxcblx0XHRcdG5ld1Nlc3Npb246IHVuZGVmaW5lZCxcblx0XHRcdGNhbGxzOiBbJ2NyZWF0ZVF1aWNrQ2hhdDp0ZXN0JywgJ3NldE1vZGVsOmdwdC00bycsICdzZW5kJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmRRdWlja0NoYXRSZXF1ZXN0IGNhbmNlbHMgY29tbWl0IGRldGVjdGlvbiBhbmQgZGlzcG9zZXMgdGhlIHByb3Zpc2lvbmFsIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9xdWljay1jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAncXVpY2stMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZW5kU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzZW5kRG9uZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzZW5kUmV0dXJuZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGRlbGV0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN1cHBvcnRzUXVpY2tDaGF0cyA9IHRydWU7XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVRdWlja0NoYXQoKTogSVNlc3Npb24geyByZXR1cm4gc2Vzc2lvbjsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHsgZGVsZXRlZCA9IHRydWU7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0YXdhaXQgc2VuZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgc2VuZERvbmUucDtcblx0XHRcdFx0YXdhaXQgc2VuZFJldHVybmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjaGF0U2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXHRcdGNvbnN0IGN0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0bGV0IHN0YXJ0ZWQgPSAwO1xuXHRcdGxldCBzZW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFN0YXJ0U2Vzc2lvbigoKSA9PiBzdGFydGVkKyspKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFNlbmRSZXF1ZXN0KCgpID0+IHNlbnQrKykpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3QoeyBxdWVyeTogJ2hpJyB9LCB7XG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiAndGVzdCcsXG5cdFx0fSwgY3RzLnRva2VuKTtcblx0XHRhd2FpdCBzZW5kU3RhcnRlZC5wO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3QsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0XHRhd2FpdCBzZW5kRG9uZS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHNlbmRSZXR1cm5lZC5wO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuY2VsbGVkUmVzb3VyY2VzOiBjaGF0U2VydmljZS5jYW5jZWxsZWRSZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0c3RhcnRlZCxcblx0XHRcdHNlbnQsXG5cdFx0fSwge1xuXHRcdFx0Y2FuY2VsbGVkUmVzb3VyY2VzOiBbY2hhdC5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHRcdHN0YXJ0ZWQ6IDAsXG5cdFx0XHRzZW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgaW52b2tlcyBjb25maWd1cmF0aW9uIHNldHRlcnMgZnJvbSBjcmVhdGVPcHRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIHNldE1vZGVsKF9zZXNzaW9uSWQ6IHN0cmluZywgX21vZGVsSWQ6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRNb2RlbDoke19tb2RlbElkfWApOyB9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlKF9zZXNzaW9uSWQ6IHN0cmluZywgX21vZGVJZDogc3RyaW5nKTogdm9pZCB7IGNhbGxzLnB1c2goYHNldE1vZGU6JHtfbW9kZUlkfWApOyB9XG5cdFx0XHRvdmVycmlkZSBzZXRQZXJtaXNzaW9uTGV2ZWwoX3Nlc3Npb25JZDogc3RyaW5nLCBfbGV2ZWw6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRQZXJtaXNzaW9uTGV2ZWw6JHtfbGV2ZWx9YCk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldElzb2xhdGlvbk1vZGUoX3Nlc3Npb25JZDogc3RyaW5nLCBfbW9kZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IGNhbGxzLnB1c2goYHNldElzb2xhdGlvbk1vZGU6JHtfbW9kZX1gKTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2V0QnJhbmNoKF9zZXNzaW9uSWQ6IHN0cmluZywgX2JyYW5jaDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IGNhbGxzLnB1c2goYHNldEJyYW5jaDoke19icmFuY2h9YCk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldFdvcmt0cmVlQnJhbmNoVHJhY2soX3Nlc3Npb25JZDogc3RyaW5nLCBfZW5hYmxlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyBjYWxscy5wdXNoKGBzZXRXb3JrdHJlZUJyYW5jaFRyYWNrOiR7X2VuYWJsZWR9YCk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHsgcmV0dXJuIHNlc3Npb247IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgY3JlYXRlT3B0aW9uczogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zID0ge1xuXHRcdFx0bW9kZWxJZDogJ2dwdC00bycsXG5cdFx0XHRtb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6ICdhbGxvd2VkVG9vbHMnLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdHdvcmt0cmVlQnJhbmNoVHJhY2s6IGZhbHNlLFxuXHRcdFx0YnJhbmNoOiAnbWFpbicsXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwgY3JlYXRlT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5zZXNzaW9uSWQsICdzMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtcblx0XHRcdCdzZXRNb2RlbDpncHQtNG8nLFxuXHRcdFx0J3NldE1vZGU6YWdlbnQnLFxuXHRcdFx0J3NldFBlcm1pc3Npb25MZXZlbDphbGxvd2VkVG9vbHMnLFxuXHRcdFx0J3NldElzb2xhdGlvbk1vZGU6d29ya3RyZWUnLFxuXHRcdFx0J3NldFdvcmt0cmVlQnJhbmNoVHJhY2s6ZmFsc2UnLFxuXHRcdFx0J3NldEJyYW5jaDptYWluJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IHVzZXMgYW4gaW1tZWRpYXRlbHkgcmVzb2x2ZWQgbW9kZWwgaWRlbnRpZmllcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCByZXNvbHZlZE1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPSB7XG5cdFx0XHRpZGVudGlmaWVyOiAndGFyZ2V0OmdwdC00bycsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHRcdFx0dmVuZG9yOiAndGFyZ2V0Jyxcblx0XHRcdFx0ZmFtaWx5OiAnZ3B0LTRvJyxcblx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRNb2RlbHNTbmFwc2hvdCgpOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90IHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWxzOiBbcmVzb2x2ZWRNb2RlbF0sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ2F2YWlsYWJsZScsIG1vZGVsOiByZXNvbHZlZE1vZGVsIH0sIG1vZGVsVGFyZ2V0OiAndGFyZ2V0JyB9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2V0TW9kZWwoX3Nlc3Npb25JZDogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcpOiB2b2lkIHsgY2FsbHMucHVzaChgc2V0TW9kZWw6JHttb2RlbElkfWApOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdCgpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ3NlbmQnKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdsZWdhY3kvZ3B0LTRvJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnc2V0TW9kZWw6dGFyZ2V0OmdwdC00bycsICdzZW5kJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3Qgd2FpdHMgZm9yIGFuZCB1c2VzIHRoZSByZXNvbHZlZCBtb2RlbCBpZGVudGlmaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWxzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCByZXNvbHV0aW9uOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90WydkZXNpcmVkTW9kZWxSZXNvbHV0aW9uJ10gPSB7IGtpbmQ6ICdwZW5kaW5nJywgaWRlbnRpZmllcjogJ3RhcmdldDpncHQtNG8nIH07XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgbW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9IHtcblx0XHRcdGlkZW50aWZpZXI6ICd0YXJnZXQ6Z3B0LTRvJyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGV4dGVuc2lvbjogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdG5hbWU6ICdHUFQtNG8nLFxuXHRcdFx0XHR2ZW5kb3I6ICd0YXJnZXQnLFxuXHRcdFx0XHRmYW1pbHk6ICdncHQtNG8nLFxuXHRcdFx0XHR2ZXJzaW9uOiAnMScsXG5cdFx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzID0gb25EaWRDaGFuZ2VNb2RlbHMuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRNb2RlbHNTbmFwc2hvdCgpOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90IHsgcmV0dXJuIHsgbW9kZWxzOiBbXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogcmVzb2x1dGlvbiwgbW9kZWxUYXJnZXQ6IHVuZGVmaW5lZCB9OyB9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRNb2RlbDoke21vZGVsSWR9YCk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCgnc2VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdsZWdhY3kvZ3B0LTRvJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cblx0XHRyZXNvbHV0aW9uID0geyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWwgfTtcblx0XHRvbkRpZENoYW5nZU1vZGVscy5maXJlKCk7XG5cdFx0YXdhaXQgcmVxdWVzdDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnc2V0TW9kZWw6dGFyZ2V0OmdwdC00bycsICdzZW5kJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcmVqZWN0cyBhIHBlbmRpbmcgbW9kZWwgdGhhdCBiZWNvbWVzIHVuYXZhaWxhYmxlIGFuZCBkaXNwb3NlcyB0aGUgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VNb2RlbHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IHJlc29sdXRpb246IElTZXNzaW9uTW9kZWxzU25hcHNob3RbJ2Rlc2lyZWRNb2RlbFJlc29sdXRpb24nXSA9IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAncmVtb3ZlZC1tb2RlbCcgfTtcblx0XHRsZXQgZGVsZXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbHMgPSBvbkRpZENoYW5nZU1vZGVscy5ldmVudDtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldE1vZGVsc1NuYXBzaG90KCk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdFx0XHRyZXR1cm4geyBtb2RlbHM6IFtdLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHV0aW9uLCBtb2RlbFRhcmdldDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignc2V0TW9kZWwgc2hvdWxkIG5vdCBiZSBjYWxsZWQnKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHsgZGVsZXRlZCA9IHRydWU7IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdyZW1vdmVkLW1vZGVsJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRyZXNvbHV0aW9uID0geyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiAncmVtb3ZlZC1tb2RlbCcgfTtcblx0XHRvbkRpZENoYW5nZU1vZGVscy5maXJlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXF1ZXN0LCAvTW9kZWwgJ3JlbW92ZWQtbW9kZWwnIGlzIHVuYXZhaWxhYmxlLyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcmVqZWN0cyB3aGVuIHRoZSB3b3Jrc3BhY2Ugc3RvcHMgYWR2ZXJ0aXNpbmcgdGhlIHNlc3Npb24gdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IGZvbGRlclR5cGVBdmFpbGFibGUgPSB0cnVlO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IHVyaTogZm9sZGVyVXJpIH0gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlcyhjYW5kaWRhdGU6IFVSSSk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRlclR5cGVBdmFpbGFibGUgJiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChjYW5kaWRhdGUsIGZvbGRlclVyaSkgPyBbLi4udGhpcy5zZXNzaW9uVHlwZXNdIDogW107XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRNb2RlbHNTbmFwc2hvdCgpOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90IHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWxzOiBbXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6ICdncHQtNG8nIH0sIG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGRlbGV0ZU5ld1Nlc3Npb24oKTogdm9pZCB7IGRlbGV0ZWQgPSB0cnVlOyB9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChmb2xkZXJVcmksIHsgcXVlcnk6ICdoaScgfSwgeyBtb2RlbElkOiAnZ3B0LTRvJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRmb2xkZXJUeXBlQXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMuZmlyZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVxdWVzdCwgL1Nlc3Npb24gdHlwZSAndGVzdCcgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZS8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IGNhbmNlbHMgd2hpbGUgd2FpdGluZyBmb3IgbW9kZWwgcmVzb2x1dGlvbiBhbmQgZGlzcG9zZXMgdGhlIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWxzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1vZGVscyA9IG9uRGlkQ2hhbmdlTW9kZWxzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0TW9kZWxzU25hcHNob3QoKTogSVNlc3Npb25Nb2RlbHNTbmFwc2hvdCB7XG5cdFx0XHRcdHJldHVybiB7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAnZ3B0LTRvJyB9LCBtb2RlbFRhcmdldDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKCk6IHZvaWQgeyBkZWxldGVkID0gdHJ1ZTsgfVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwgeyBtb2RlbElkOiAnZ3B0LTRvJyB9LCBjdHMudG9rZW4pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3QsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IGF3YWl0cyBhc3luY2hyb25vdXMgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIHNldHRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGlzb2xhdGlvbkRvbmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgYnJhbmNoVHJhY2tTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGJyYW5jaFRyYWNrRG9uZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBicmFuY2hTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGJyYW5jaERvbmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRJc29sYXRpb25Nb2RlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdpc29sYXRpb246c3RhcnQnKTtcblx0XHRcdFx0YXdhaXQgaXNvbGF0aW9uRG9uZS5wO1xuXHRcdFx0XHRjYWxscy5wdXNoKCdpc29sYXRpb246ZW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRXb3JrdHJlZUJyYW5jaFRyYWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdicmFuY2hUcmFjazpzdGFydCcpO1xuXHRcdFx0XHRhd2FpdCBicmFuY2hUcmFja1N0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgYnJhbmNoVHJhY2tEb25lLnA7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ2JyYW5jaFRyYWNrOmVuZCcpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2V0QnJhbmNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdicmFuY2g6c3RhcnQnKTtcblx0XHRcdFx0YXdhaXQgYnJhbmNoU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCBicmFuY2hEb25lLnA7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ2JyYW5jaDplbmQnKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCgnc2VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7XG5cdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnLFxuXHRcdFx0d29ya3RyZWVCcmFuY2hUcmFjazogZmFsc2UsXG5cdFx0XHRicmFuY2g6ICdtYWluJyxcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ2lzb2xhdGlvbjpzdGFydCddKTtcblxuXHRcdGF3YWl0IGlzb2xhdGlvbkRvbmUuY29tcGxldGUoKTtcblx0XHRhd2FpdCBicmFuY2hUcmFja1N0YXJ0ZWQucDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ2lzb2xhdGlvbjpzdGFydCcsICdpc29sYXRpb246ZW5kJywgJ2JyYW5jaFRyYWNrOnN0YXJ0J10pO1xuXG5cdFx0YXdhaXQgYnJhbmNoVHJhY2tEb25lLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgYnJhbmNoU3RhcnRlZC5wO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnaXNvbGF0aW9uOnN0YXJ0JywgJ2lzb2xhdGlvbjplbmQnLCAnYnJhbmNoVHJhY2s6c3RhcnQnLCAnYnJhbmNoVHJhY2s6ZW5kJywgJ2JyYW5jaDpzdGFydCddKTtcblxuXHRcdGF3YWl0IGJyYW5jaERvbmUuY29tcGxldGUoKTtcblx0XHRhd2FpdCByZXF1ZXN0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnaXNvbGF0aW9uOnN0YXJ0JywgJ2lzb2xhdGlvbjplbmQnLCAnYnJhbmNoVHJhY2s6c3RhcnQnLCAnYnJhbmNoVHJhY2s6ZW5kJywgJ2JyYW5jaDpzdGFydCcsICdicmFuY2g6ZW5kJywgJ3NlbmQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBjYW5jZWxzIHBlbmRpbmcgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIGFuZCBkaXNwb3NlcyB0aGUgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Eb25lID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0bGV0IHNlbnQgPSBmYWxzZTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldElzb2xhdGlvbk1vZGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25Eb25lLnA7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKCk6IHZvaWQge1xuXHRcdFx0XHRkZWxldGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VudCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwge1xuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdGJyYW5jaDogJ21haW4nLFxuXHRcdH0sIGN0cy50b2tlbik7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVxdWVzdCwgL0NhbmNlbGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGRlbGV0ZWQsIHNlbnQgfSwgeyBkZWxldGVkOiB0cnVlLCBzZW50OiBmYWxzZSB9KTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uRG9uZS5jb21wbGV0ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgY2FuY2VscyBhIHBlbmRpbmcgc2VuZCBhbmQgZGlzcG9zZXMgdGhlIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZW5kRG9uZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRsZXQgZGVsZXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHtcblx0XHRcdFx0ZGVsZXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdCgpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdGF3YWl0IHNlbmREb25lLnA7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwgdW5kZWZpbmVkLCBjdHMudG9rZW4pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3QsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0XHRhd2FpdCBzZW5kRG9uZS5jb21wbGV0ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3Qgc2tpcHMgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIGZvciB1bnN1cHBvcnRlZCBzZXNzaW9uIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRsZXQgc2VudCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFt7IGlkOiAndGVzdCcsIGxhYmVsOiAnVGVzdCcsIGljb246IENvZGljb24udm0gfV07XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBzZXRJc29sYXRpb25Nb2RlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdpc29sYXRpb24gc2hvdWxkIG5vdCBiZSBjb25maWd1cmVkJyk7IH1cblx0XHRcdG92ZXJyaWRlIHNldEJyYW5jaCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignYnJhbmNoIHNob3VsZCBub3QgYmUgY29uZmlndXJlZCcpOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdCgpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdHNlbnQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpLCB7IHF1ZXJ5OiAnaGknIH0sIHtcblx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0YnJhbmNoOiAnbGVnYWN5LWJyYW5jaCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VudCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBkaXNwb3NlcyBzdHJhbmRlZCBkcmFmdCB3aGVuIGEgc2V0dGVyIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdCcpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0bGV0IGRlbGV0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIHNldE1vZGVsKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsIG5vdCBmb3VuZCcpOyB9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKCk6IHZvaWQgeyBkZWxldGVkID0gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4geyByZXR1cm4gc2Vzc2lvbjsgfVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdiYWQnIH0pLFxuXHRcdFx0L21vZGVsIG5vdCBmb3VuZC8sXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZXRlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHNlcnZpY2UgaXMgZGlzcG9zZWQgbWlkLXNlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2VSZWY6IHsgY3VycmVudD86IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gPSB7fTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Ly8gRGlzcG9zZSB0aGUgc2VydmljZSB3aGlsZSB0aGUgc2VuZCBpcyBpbi1mbGlnaHQuXG5cdFx0XHRcdChzZXJ2aWNlUmVmLmN1cnJlbnQgYXMgdW5rbm93biBhcyB7IGRpc3Bvc2UoKTogdm9pZCB9KS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0c2VydmljZVJlZi5jdXJyZW50ID0gc2VydmljZTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjYXJkTmV3U2Vzc2lvbiBmaXJlcyBvbkRpZERpc2NhcmROZXdTZXNzaW9uIHdpdGggdGhlIGRpc2NhcmRlZCBkcmFmdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgZGlzY2FyZGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkRGlzY2FyZE5ld1Nlc3Npb24ocyA9PiBkaXNjYXJkZWQucHVzaChzLnNlc3Npb25JZCkpKTtcblxuXHRcdC8vIEVzdGFibGlzaCBhIHBlbmRpbmcgZHJhZnQsIHRoZW4gYWJhbmRvbiBpdC5cblx0XHRzZXJ2aWNlLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpKTtcblx0XHRzZXJ2aWNlLmRpc2NhcmROZXdTZXNzaW9uKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpc2NhcmRlZCwgWydzMSddKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBmaXJlcyByZXBsYWNlbWVudCBiZWZvcmUgcHVibGlzaGluZyB0aGUgbmV3IGRyYWZ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRyYWZ0cyA9IFtcblx0XHRcdHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSksXG5cdFx0XHRzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MyJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgY3JlYXRlSW5kZXggPSAwO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbigpOiBJU2Vzc2lvbiB7IHJldHVybiBkcmFmdHNbY3JlYXRlSW5kZXgrK107IH1cblx0XHRcdG92ZXJyaWRlIGRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHsgZGVsZXRlZC5wdXNoKHNlc3Npb25JZCk7IH1cblx0XHR9KGRyYWZ0c1swXSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGRyYWZ0c1swXSwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IHJlcGxhY2VtZW50czogeyBmcm9tOiBzdHJpbmc7IHRvOiBzdHJpbmc7IGN1cnJlbnREcmFmdDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbigoeyBmcm9tLCB0byB9KSA9PiB7XG5cdFx0XHRyZXBsYWNlbWVudHMucHVzaCh7IGZyb206IGZyb20uc2Vzc2lvbklkLCB0bzogdG8uc2Vzc2lvbklkLCBjdXJyZW50RHJhZnQ6IHNlcnZpY2UubmV3U2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkIH0pO1xuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykpO1xuXHRcdHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXBsYWNlbWVudHMsXG5cdFx0XHRkZWxldGVkLFxuXHRcdFx0Y3VycmVudERyYWZ0OiBzZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHR9LCB7XG5cdFx0XHRyZXBsYWNlbWVudHM6IFt7IGZyb206ICdzMScsIHRvOiAnczInLCBjdXJyZW50RHJhZnQ6ICdzMScgfV0sXG5cdFx0XHRkZWxldGVkOiBbJ3MxJ10sXG5cdFx0XHRjdXJyZW50RHJhZnQ6ICdzMicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24ga2VlcHMgdGhlIHByZXZpb3VzIGRyYWZ0IHdoZW4gcmVwbGFjZW1lbnQgY3JlYXRpb24gZmFpbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHJhZnQgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGxldCBjcmVhdGVDb3VudCA9IDA7XG5cdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0XHRpZiAoY3JlYXRlQ291bnQrKyA+IDApIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NyZWF0ZSBmYWlsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZHJhZnQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7IGRlbGV0ZWQucHVzaChzZXNzaW9uSWQpOyB9XG5cdFx0fShkcmFmdCk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGRyYWZ0LCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24oKHsgZnJvbSwgdG8gfSkgPT4gcmVwbGFjZW1lbnRzLnB1c2goYCR7ZnJvbS5zZXNzaW9uSWR9LT4ke3RvLnNlc3Npb25JZH1gKSkpO1xuXG5cdFx0c2VydmljZS5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpKSwgL2NyZWF0ZSBmYWlsZWQvKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudERyYWZ0OiBzZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHRcdHJlcGxhY2VtZW50cyxcblx0XHRcdGRlbGV0ZWQsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudERyYWZ0OiAnczEnLFxuXHRcdFx0cmVwbGFjZW1lbnRzOiBbXSxcblx0XHRcdGRlbGV0ZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTmV3Q2hhdFJlcXVlc3QgY2xlYXJzIHRoZSBkcmFmdCB3aXRob3V0IGZpcmluZyBvbkRpZERpc2NhcmROZXdTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0bGV0IGRpc2NhcmRDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWREaXNjYXJkTmV3U2Vzc2lvbigoKSA9PiBkaXNjYXJkQ291bnQrKykpO1xuXG5cdFx0Ly8gU2VuZGluZyB0aGUgY29tcG9zZWQgZHJhZnQgZ3JhZHVhdGVzIGl0IGludG8gdGhlIGxpc3QgcmF0aGVyIHRoYW5cblx0XHQvLyBkaXNjYXJkaW5nIGl0LCBzbyB0aGUgZGlzY2FyZCBldmVudCBtdXN0IG5vdCBmaXJlLlxuXHRcdGNvbnN0IGRyYWZ0ID0gc2VydmljZS5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSk7XG5cdFx0YXdhaXQgc2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3QoZHJhZnQsIHsgcXVlcnk6ICdoaScgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY2FyZENvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWxsU2Vzc2lvblR5cGVzIG9yZGVycyBwcm92aWRlcnMgYnkgdGhlaXIgb3JkZXIgcHJvcGVydHkgKGxvd2VyIGZpcnN0KScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlT3JkZXJlZFR5cGVzU2VydmljZShkaXNwb3NhYmxlcywgMCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEFsbFNlc3Npb25UeXBlcygpLm1hcCh0eXBlID0+IHR5cGUuaWQpLCBbJ2NvcGlsb3QnLCAnYWdlbnQtaG9zdCddKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWxsU2Vzc2lvblR5cGVzIHN1cmZhY2VzIGxvY2FsIGFnZW50IGhvc3QgdHlwZXMgZmlyc3Qgd2hlbiBpdCBoYXMgbG93ZXIgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZU9yZGVyZWRUeXBlc1NlcnZpY2UoZGlzcG9zYWJsZXMsIDAsIC0xKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0QWxsU2Vzc2lvblR5cGVzKCkubWFwKHR5cGUgPT4gdHlwZS5pZCksIFsnYWdlbnQtaG9zdCcsICdjb3BpbG90J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uIHByb21vdGVzIHRoZSBjb21taXR0ZWQgc2Vzc2lvbiB0byBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZHJhZnQgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2RyYWZ0JywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnY29tbWl0dGVkJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkUmVwbGFjZVNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IG9uRGlkUmVwbGFjZVNlc3Npb24uZXZlbnQ7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoZHJhZnQpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtkcmFmdCwgY29tbWl0dGVkXTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGRyYWZ0LCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgZHJhZnQgc28gaXQgYmVjb21lcyB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihkcmFmdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAnZHJhZnQnKTtcblxuXHRcdC8vIFRoZSBwcm92aWRlciBhdG9taWNhbGx5IHJlcGxhY2VzIHRoZSBkcmFmdCB3aXRoIGEgY29tbWl0dGVkIHNlc3Npb25cblx0XHQvLyAoZS5nLiBhZnRlciB0aGUgZmlyc3QgdHVybikuIFRoZSBjb21wbGV0ZSBmbG93IG11c3Q6IHN3YXAgdGhlIHZpc2libGVcblx0XHQvLyBncmlkIHNsb3QsIG1ha2UgdGhlIGNvbW1pdHRlZCBzZXNzaW9uIGFjdGl2ZSBpbiB0aGUgdmlldywgYW5kIHVwZGF0ZVxuXHRcdC8vIHRoZSBjYW5vbmljYWwgYWN0aXZlIHNlc3Npb24gaW4gdGhlIG1hbmFnZW1lbnQgc2VydmljZS5cblx0XHRvbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tOiBkcmFmdCwgdG86IGNvbW1pdHRlZCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmlzaWJsZTogdmlldy52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkubWFwKHMgPT4gcz8uc2Vzc2lvbklkID8/IG51bGwpLFxuXHRcdFx0YWN0aXZlOiB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCA/PyBudWxsLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFsnY29tbWl0dGVkJ10sXG5cdFx0XHRhY3RpdmU6ICdjb21taXR0ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uIGluIHBsYWNlIChzYW1lIGlkLCBuZXcgcmVzb3VyY2UpIHJlLXBvaW50cyB0aGUgYWN0aXZlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzYW1lJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2JlZm9yZScpIH0pO1xuXHRcdGNvbnN0IGFmdGVyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzYW1lJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2FmdGVyJykgfSk7XG5cdFx0Y29uc3Qgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4oKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uID0gb25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihiZWZvcmUpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtiZWZvcmVdOyB9XG5cdFx0fTtcblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoYmVmb3JlLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihiZWZvcmUucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCksIGJlZm9yZS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIEEgc2FtZS1pZCByZXBsYWNlbWVudCBzdGlsbCBuZWVkcyB0byBmb3JjZSB0aGUgYWN0aXZlIHNlc3Npb24gdXBkYXRlXG5cdFx0Ly8gc28gY29uc3VtZXJzIG9ic2VydmUgdGhlIG5ldyByZXNvdXJjZS5cblx0XHRvbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tOiBiZWZvcmUsIHRvOiBhZnRlciB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCksIGFmdGVyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgYSBub24tYWN0aXZlIHNlc3Npb24gbGVhdmVzIHRoZSBhY3RpdmUgc2Vzc2lvbiB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhY3RpdmUnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3QgZHJhZnQgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2RyYWZ0JywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnY29tbWl0dGVkJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkUmVwbGFjZVNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IG9uRGlkUmVwbGFjZVNlc3Npb24uZXZlbnQ7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoYWN0aXZlKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbYWN0aXZlLCBkcmFmdCwgY29tbWl0dGVkXTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGFjdGl2ZSwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdC8vIE9wZW4gYGFjdGl2ZWAgYW5kIGFkZCBgZHJhZnRgIHRvIHRoZSBncmlkIGFsb25nc2lkZSBpdCB3aXRob3V0XG5cdFx0Ly8gYWN0aXZhdGluZywgc28gYGRyYWZ0YCBpcyB2aXNpYmxlIGJ1dCBub3QgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oYWN0aXZlLnJlc291cmNlKTtcblx0XHR2aWV3Lmluc2VydEF0KGRyYWZ0LCAnYWN0aXZlJywgJ3JpZ2h0JywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ2FjdGl2ZScpO1xuXG5cdFx0Ly8gUmVwbGFjaW5nIHRoZSBub24tYWN0aXZlIGBkcmFmdGAgc3dhcHMgaXRzIGdyaWQgc2xvdCB0byBgY29tbWl0dGVkYFxuXHRcdC8vIGJ1dCBtdXN0IG5vdCBoaWphY2sgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IGRyYWZ0LCB0bzogY29tbWl0dGVkIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmxlOiB2aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRhY3RpdmU6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0fSwge1xuXHRcdFx0dmlzaWJsZTogWydhY3RpdmUnLCAnY29tbWl0dGVkJ10sXG5cdFx0XHRhY3RpdmU6ICdhY3RpdmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgYSBzZXNzaW9uIG9ubHkgc3dhcHMgdGhlIGFjdGl2ZSBzZXNzaW9uIHdoZW4gaXQgbWF0Y2hlcyBgZnJvbWAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBiID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdiJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG90aGVyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvdGhlcicsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBvbkRpZFJlcGxhY2VTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgZnJvbTogSVNlc3Npb247IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVwbGFjZVNlc3Npb24gPSBvbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKGEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFthLCBiLCBvdGhlcl07IH1cblx0XHR9O1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShhLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihhLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdhJyk7XG5cblx0XHQvLyBgZnJvbWAgZG9lcyBub3QgbWF0Y2ggdGhlIGFjdGl2ZSBzZXNzaW9uOiBhY3RpdmUgc3RheXMgcHV0LlxuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IG90aGVyLCB0bzogYiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdhJyk7XG5cblx0XHQvLyBgZnJvbWAgbWF0Y2hlcyB0aGUgYWN0aXZlIHNlc3Npb246IGFjdGl2ZSBpcyByZXBsYWNlZCB3aXRoIGB0b2AuXG5cdFx0b25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbTogYSwgdG86IGIgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAnYicpO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGVsZXRlU2Vzc2lvbnMnLCAoKSA9PiB7XG5cblx0XHRjbGFzcyBSZWNvcmRpbmdQcm92aWRlciBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdHJlYWRvbmx5IGRlbGV0ZWQ6IHN0cmluZ1tdW10gPSBbXTtcblx0XHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBvdmVycmlkZSByZWFkb25seSBpZDogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IF9mYWlsOiBib29sZWFuLCBzZXNzaW9uOiBJU2Vzc2lvbikge1xuXHRcdFx0XHRzdXBlcihzZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZVNlc3Npb25zKHNlc3Npb25JZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoaXMuZGVsZXRlZC5wdXNoKFsuLi5zZXNzaW9uSWRzXSk7XG5cdFx0XHRcdGlmICh0aGlzLl9mYWlsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke3RoaXMuaWR9IGZhaWxlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShwcm92aWRlcnM6IElTZXNzaW9uc1Byb3ZpZGVyW10pOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShwcm92aWRlcnMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRTdWJtaXRSZXF1ZXN0ID0gRXZlbnQuTm9uZTtcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBtb3ZlSGlzdG9yeSgpOiB2b2lkIHsgfVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgcHJvdmlkZXIgYW5kIGNvbnRpbnVlcyB3aGVuIG9uZSBwcm92aWRlciBmYWlscyAoYmVzdC1lZmZvcnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgczEgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3AxJyB9KTtcblx0XHRcdGNvbnN0IHMyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMicsIHByb3ZpZGVySWQ6ICdwMicgfSk7XG5cdFx0XHRjb25zdCBmYWlsaW5nID0gbmV3IFJlY29yZGluZ1Byb3ZpZGVyKCdwMScsIHRydWUsIHMxKTtcblx0XHRcdGNvbnN0IHN1Y2NlZWRpbmcgPSBuZXcgUmVjb3JkaW5nUHJvdmlkZXIoJ3AyJywgZmFsc2UsIHMyKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKFtmYWlsaW5nLCBzdWNjZWVkaW5nXSk7XG5cblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZERlbGV0ZVNlc3Npb24oc2Vzc2lvbiA9PiBkZWxldGVkLnB1c2goc2Vzc2lvbi5zZXNzaW9uSWQpKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHNlcnZpY2UuZGVsZXRlU2Vzc2lvbnMoW3MxLCBzMl0pLCAvcDEgZmFpbGVkLyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmYWlsaW5nRGVsZXRlZDogZmFpbGluZy5kZWxldGVkLFxuXHRcdFx0XHRzdWNjZWVkaW5nRGVsZXRlZDogc3VjY2VlZGluZy5kZWxldGVkLFxuXHRcdFx0XHRldmVudHNGaXJlZDogZGVsZXRlZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZmFpbGluZ0RlbGV0ZWQ6IFtbJ3MxJ11dLFxuXHRcdFx0XHRzdWNjZWVkaW5nRGVsZXRlZDogW1snczInXV0sXG5cdFx0XHRcdGV2ZW50c0ZpcmVkOiBbJ3MyJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZU5ld0NoYXRJblNlc3Npb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXVzZXMgYW4gZXhpc3RpbmcgdW50aXRsZWQgY2hhdCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVudGl0bGVkQ2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL3VudGl0bGVkJyksIHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIH07XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdyZXVzZScsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbdW50aXRsZWRDaGF0XSkgfSk7XG5cdFx0XHRsZXQgY3JlYXRlTmV3Q2hhdENhbGxzID0gMDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbik7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTmV3Q2hhdCgpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0XHRcdFx0Y3JlYXRlTmV3Q2hhdENhbGxzKys7XG5cdFx0XHRcdFx0cmV0dXJuIHN0dWJDaGF0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJldXNlZDogcmVzdWx0ID09PSB1bnRpdGxlZENoYXQsXG5cdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmV1c2VkOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVOZXdDaGF0Q2FsbHM6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fza3MgdGhlIHByb3ZpZGVyIHRvIGNyZWF0ZSBhIGNoYXQgd2hlbiBub25lIGFyZSB1bnRpdGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9hY3RpdmUnKSwgc3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB9O1xuXHRcdFx0Y29uc3QgY3JlYXRlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jcmVhdGVkJykgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2NyZWF0ZScsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbYWN0aXZlQ2hhdF0pIH0pO1xuXHRcdFx0bGV0IGNyZWF0ZU5ld0NoYXRDYWxscyA9IDA7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb24pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU5ld0NoYXQoKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxscysrO1xuXHRcdFx0XHRcdHJldHVybiBjcmVhdGVkQ2hhdDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZU5ld0NoYXRJblNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdD8ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0Y3JlYXRlTmV3Q2hhdENhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IGNyZWF0ZWRDaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxsczogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yY2VOZXcgY3JlYXRlcyBhIGZyZXNoIGNoYXQgZXZlbiB3aGVuIGFuIHVudGl0bGVkIG9uZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1bnRpdGxlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy91bnRpdGxlZCcpLCBzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB9O1xuXHRcdFx0Y29uc3QgY3JlYXRlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jcmVhdGVkJykgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2ZvcmNlLW5ldycsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbdW50aXRsZWRDaGF0XSkgfSk7XG5cdFx0XHRsZXQgY3JlYXRlTmV3Q2hhdENhbGxzID0gMDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbik7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTmV3Q2hhdCgpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0XHRcdFx0Y3JlYXRlTmV3Q2hhdENhbGxzKys7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZWRDaGF0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uLCB7IGZvcmNlTmV3OiB0cnVlIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiByZXN1bHQ/LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiBjcmVhdGVkQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjcmVhdGVOZXdDaGF0Q2FsbHM6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlIHByb3ZpZGVyIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29ycGhhbicsIHByb3ZpZGVySWQ6ICdtaXNzaW5nLXByb3ZpZGVyJyB9KTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnb3RoZXInLCBwcm92aWRlcklkOiAndGVzdCcgfSkpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZvcmtDaGF0SW5TZXNzaW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYXNrcyB0aGUgcHJvdmlkZXIgdG8gZm9yayB0aGUgY2hhdCB3aGVuIHRoZSBzZXNzaW9uIHN1cHBvcnRzIG11bHRpcGxlIGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlQ2hhdCA9IFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKTtcblx0XHRcdGNvbnN0IGZvcmtlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9mb3JrZWQnKSB9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnZm9yaycsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUgfSkgfSk7XG5cdFx0XHRsZXQgZm9ya0NoYXRBcmdzOiByZWFkb25seSBbc3RyaW5nLCBVUkksIHN0cmluZ10gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb24pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGZvcmtDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBzb3VyY2VDaGF0OiBVUkksIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdFx0XHRcdGZvcmtDaGF0QXJncyA9IFtzZXNzaW9uSWQsIHNvdXJjZUNoYXQsIHR1cm5JZF07XG5cdFx0XHRcdFx0cmV0dXJuIGZvcmtlZENoYXQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5mb3JrQ2hhdEluU2Vzc2lvbihzZXNzaW9uLCBzb3VyY2VDaGF0LCAndHVybi0xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRhcmdzOiBmb3JrQ2hhdEFyZ3M/Lm1hcChhcmcgPT4gVVJJLmlzVXJpKGFyZykgPyBhcmcudG9TdHJpbmcoKSA6IGFyZyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogZm9ya2VkQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRhcmdzOiBbJ2ZvcmsnLCBzb3VyY2VDaGF0LnRvU3RyaW5nKCksICd0dXJuLTEnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHByb3ZpZGVyIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29ycGhhbicsIHByb3ZpZGVySWQ6ICdtaXNzaW5nLXByb3ZpZGVyJywgY2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUgfSkgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ290aGVyJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmZvcmtDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvUHJvdmlkZXIgJ21pc3NpbmctcHJvdmlkZXInIG5vdCBmb3VuZC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NpbmdsZS1jaGF0JywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSkgfSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmZvcmtDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvZG9lcyBub3Qgc3VwcG9ydCBmb3JraW5nIGludG8gYSBjaGF0Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjcmVhdGVTaWRlQ2hhdEluU2Vzc2lvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Fza3MgdGhlIHByb3ZpZGVyIHRvIGNyZWF0ZSB0aGUgc2lkZSBjaGF0IHdoZW4gdGhlIHNlc3Npb24gc3VwcG9ydHMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2VDaGF0ID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL3NvdXJjZScpO1xuXHRcdFx0Y29uc3Qgc2lkZUNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9zaWRlJykgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NpZGUnLCBwcm92aWRlcklkOiAndGVzdCcsIGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlLCBzdXBwb3J0c1NpZGVDaGF0OiB0cnVlIH0pIH0pO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0geyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnIH07XG5cdFx0XHRsZXQgY3JlYXRlU2lkZUNoYXRBcmdzOiByZWFkb25seSBbc3RyaW5nLCBVUkksIHN0cmluZywgSVNpZGVDaGF0U2VsZWN0aW9uIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbik7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2lkZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIHNvdXJjZUNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcsIHNlbGVjdGlvbj86IElTaWRlQ2hhdFNlbGVjdGlvbik6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRcdFx0XHRjcmVhdGVTaWRlQ2hhdEFyZ3MgPSBbc2Vzc2lvbklkLCBzb3VyY2VDaGF0LCB0dXJuSWQsIHNlbGVjdGlvbl07XG5cdFx0XHRcdFx0cmV0dXJuIHNpZGVDaGF0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2lkZUNoYXRJblNlc3Npb24oc2Vzc2lvbiwgc291cmNlQ2hhdCwgJ3R1cm4tMScsIHNlbGVjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRhcmdzOiBjcmVhdGVTaWRlQ2hhdEFyZ3M/Lm1hcChhcmcgPT4gVVJJLmlzVXJpKGFyZykgPyBhcmcudG9TdHJpbmcoKSA6IGFyZyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogc2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0YXJnczogWydzaWRlJywgc291cmNlQ2hhdC50b1N0cmluZygpLCAndHVybi0xJywgc2VsZWN0aW9uXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHByb3ZpZGVyIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29ycGhhbicsIHByb3ZpZGVySWQ6ICdtaXNzaW5nLXByb3ZpZGVyJywgY2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUsIHN1cHBvcnRzU2lkZUNoYXQ6IHRydWUgfSkgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ290aGVyJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvUHJvdmlkZXIgJ21pc3NpbmctcHJvdmlkZXInIG5vdCBmb3VuZC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnbm8tc2lkZS1jaGF0JywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSwgc3VwcG9ydHNTaWRlQ2hhdDogZmFsc2UgfSkgfSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzLyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjbG9zZWQgY2hhdHMgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBjaGF0KGlkOiBzdHJpbmcsIHN0YXR1czogU2Vzc2lvblN0YXR1cyA9IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBvcmlnaW4/OiBDaGF0T3JpZ2luS2luZCk6IElDaGF0IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0dWJDaGF0LFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vL2NoYXQvJHtpZH1gKSxcblx0XHRcdFx0dGl0bGU6IGNvbnN0T2JzZXJ2YWJsZShpZCksXG5cdFx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKHN0YXR1cyksXG5cdFx0XHRcdG9yaWdpbjogb3JpZ2luID8geyBraW5kOiBvcmlnaW4gfSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbXVsdGlDaGF0U2Vzc2lvbihpZDogc3RyaW5nLCBjaGF0czogSUNoYXRbXSk6IElTZXNzaW9uIHtcblx0XHRcdHJldHVybiBzdHViU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogaWQsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShjaGF0cyksXG5cdFx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdHNbMF0pLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldHVwKHNlc3Npb25zOiBJU2Vzc2lvbltdKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb25zWzBdKTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIHNlc3Npb25zOyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbnNbMF0sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xvc2VkVGl0bGVzID0gKHZpZXc6IFNlc3Npb25zU2VydmljZSkgPT5cblx0XHRcdCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmNsb3NlZENoYXRzLmdldCgpID8/IFtdKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKTtcblxuXHRcdHRlc3QoJ2EgY2hhdCBjbG9zZWQgaW4gb25lIHNlc3Npb24gc3RheXMgY2xvc2VkIGFmdGVyIHN3aXRjaGluZyBhd2F5IGFuZCBiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUEgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhO1xuXHRcdFx0Y29uc3QgY2hhdEIgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2InKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdChhY3RpdmVBLCBjaGF0Qik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydiJ10pO1xuXG5cdFx0XHQvLyBTd2l0Y2hpbmcgYXdheSBkaXNwb3NlcyBzZXNzaW9uIEEncyB3cmFwcGVyIChhbmQgaXRzIGluLW1lbW9yeSBjbG9zZWRcblx0XHRcdC8vIHNldCk7IHN3aXRjaGluZyBiYWNrIG11c3QgcmVzdG9yZSB0aGUgY2xvc2VkIGNoYXQgZnJvbSBwZXJzaXN0ZWQgc3RhdGUuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xvc2luZyB0aGUgbWlkZGxlIG9mIHRocmVlIGNoYXRzIHBlcnNpc3RzIGFjcm9zcyBhIHN3aXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gbXVsdGlDaGF0U2Vzc2lvbignQScsIFtjaGF0KCdjMScpLCBjaGF0KCdjMicpLCBjaGF0KCdjMycpXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQiA9IG11bHRpQ2hhdFNlc3Npb24oJ0InLCBbY2hhdCgnbWFpbkInKV0pO1xuXHRcdFx0Y29uc3QgeyB2aWV3IH0gPSBzZXR1cChbc2Vzc2lvbkEsIHNlc3Npb25CXSk7XG5cblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgYWN0aXZlQSA9IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSE7XG5cdFx0XHRjb25zdCBtaWRkbGUgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2MyJykhO1xuXHRcdFx0YXdhaXQgdmlldy5jbG9zZUNoYXQoYWN0aXZlQSwgbWlkZGxlKTtcblxuXHRcdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uQi5yZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblxuXHRcdFx0Y29uc3QgcmVBY3RpdmVBID0gdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuOiByZUFjdGl2ZUEub3BlbkNoYXRzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdFx0XHRjbG9zZWQ6IHJlQWN0aXZlQS5jbG9zZWRDaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0b3BlbjogWydjMScsICdjMyddLFxuXHRcdFx0XHRjbG9zZWQ6IFsnYzInXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xvc2luZyB0aGUgYWN0aXZlIGNoYXQgcGVyc2lzdHMgYWNyb3NzIGEgc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNoYXRCID0gc2Vzc2lvbkEuY2hhdHMuZ2V0KCkuZmluZChjID0+IGMudGl0bGUuZ2V0KCkgPT09ICdiJykhO1xuXHRcdFx0YXdhaXQgdmlldy5vcGVuQ2hhdChzZXNzaW9uQSwgY2hhdEIucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdmlldy5jbG9zZUNoYXQodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpISwgY2hhdEIpO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVvcGVuaW5nIGEgY2xvc2VkIGNoYXQgaXMgYWxzbyBwZXJzaXN0ZWQgYWNyb3NzIGEgc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUEgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhO1xuXHRcdFx0Y29uc3QgY2hhdEIgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2InKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdChhY3RpdmVBLCBjaGF0Qik7XG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5DaGF0KHNlc3Npb25BLCBjaGF0Qi5yZXNvdXJjZSk7IC8vIHJlb3BlblxuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjbG9zZWQgc2lkZSBjaGF0IHN0YXlzIGNsb3NlZCBhZnRlciBzd2l0Y2hpbmcgYXdheSBhbmQgYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gbXVsdGlDaGF0U2Vzc2lvbignQScsIFtjaGF0KCdtYWluQScpLCBjaGF0KCdzaWRlJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0KV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUEgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhO1xuXHRcdFx0Y29uc3Qgc2lkZUNoYXQgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ3NpZGUnKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdChhY3RpdmVBLCBzaWRlQ2hhdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydzaWRlJ10pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydzaWRlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjbG9zZWQgY2hhdCBzdGF5cyBjbG9zZWQgYWNyb3NzIGEgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5BID0gY2hhdCgnbWFpbkEnKTtcblx0XHRcdGNvbnN0IGNoYXRCID0gY2hhdCgnYicpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogJ0EnLCBwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbbWFpbkEsIGNoYXRCXSksXG5cdFx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobWFpbkEpLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gW3Nlc3Npb25BXTsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1ha2VWaWV3ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCB3aW5kb3c6IGNsb3NlIGNoYXQgQiwgdGhlbiBzaW11bGF0ZSBzaHV0ZG93biAoZmx1c2ggc3RvcmFnZSkuXG5cdFx0XHRjb25zdCBmaXJzdCA9IG1ha2VWaWV3KCk7XG5cdFx0XHRhd2FpdCBmaXJzdC5vcGVuU2Vzc2lvbihzZXNzaW9uQS5yZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBmaXJzdC5jbG9zZUNoYXQoZmlyc3QuYWN0aXZlU2Vzc2lvbi5nZXQoKSEsIGNoYXRCKTtcblx0XHRcdGF3YWl0IHN0b3JhZ2UuZmx1c2goKTtcblxuXHRcdFx0Ly8gU2Vjb25kIHdpbmRvdzogcmVzdG9yZSBhbmQgY29uZmlybSBCIGlzIHN0aWxsIGNsb3NlZC5cblx0XHRcdGNvbnN0IHNlY29uZCA9IG1ha2VWaWV3KCk7XG5cdFx0XHRhd2FpdCBzZWNvbmQucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoc2Vjb25kLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmNsb3NlZENoYXRzLmdldCgpID8/IFtdKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSwgWydiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjaGF0IGNsb3NlZCBpbiBhIG5vbi1hY3RpdmUgc2Vzc2lvbiBzdGF5cyBjbG9zZWQgYWNyb3NzIGEgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5BID0gY2hhdCgnbWFpbkEnKTtcblx0XHRcdGNvbnN0IGNoYXRBMiA9IGNoYXQoJ2EyJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQSA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdFx0c2Vzc2lvbklkOiAnQScsIHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFttYWluQSwgY2hhdEEyXSksXG5cdFx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobWFpbkEpLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbWFpbkIgPSBjaGF0KCdtYWluQicpO1xuXHRcdFx0Y29uc3QgY2hhdEIyID0gY2hhdCgnYjInKTtcblx0XHRcdGNvbnN0IHNlc3Npb25CID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0XHRzZXNzaW9uSWQ6ICdCJywgcHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCksXG5cdFx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW21haW5CLCBjaGF0QjJdKSxcblx0XHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShtYWluQiksXG5cdFx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihzZXNzaW9uQSk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbc2Vzc2lvbkEsIHNlc3Npb25CXTsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1ha2VWaWV3ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCB3aW5kb3c6IGNsb3NlIGEgY2hhdCBpbiBlYWNoIHNlc3Npb24sIGVuZCBvbiBzZXNzaW9uIEEgc28gQiBpc1xuXHRcdFx0Ly8gbm8gbG9uZ2VyIHZpc2libGUsIHRoZW4gc2ltdWxhdGUgc2h1dGRvd24gKGZsdXNoIHN0b3JhZ2UpLlxuXHRcdFx0Y29uc3QgZmlyc3QgPSBtYWtlVmlldygpO1xuXHRcdFx0YXdhaXQgZmlyc3Qub3BlblNlc3Npb24oc2Vzc2lvbkIucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgZmlyc3QuY2xvc2VDaGF0KGZpcnN0LmFjdGl2ZVNlc3Npb24uZ2V0KCkhLCBjaGF0QjIpO1xuXHRcdFx0YXdhaXQgZmlyc3Qub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgZmlyc3QuY2xvc2VDaGF0KGZpcnN0LmFjdGl2ZVNlc3Npb24uZ2V0KCkhLCBjaGF0QTIpO1xuXHRcdFx0YXdhaXQgc3RvcmFnZS5mbHVzaCgpO1xuXG5cdFx0XHQvLyBTZWNvbmQgd2luZG93OiByZXN0b3JlLCB0aGVuIHN3aXRjaCB0byBCIGFuZCBjb25maXJtIGl0cyBjaGF0IGlzIHN0aWxsIGNsb3NlZC5cblx0XHRcdGNvbnN0IHNlY29uZCA9IG1ha2VWaWV3KCk7XG5cdFx0XHRhd2FpdCBzZWNvbmQucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXHRcdFx0YXdhaXQgc2Vjb25kLm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHNlY29uZC5hY3RpdmVTZXNzaW9uLmdldCgpPy5jbG9zZWRDaGF0cy5nZXQoKSA/PyBbXSkubWFwKGMgPT4gYy50aXRsZS5nZXQoKSksIFsnYjInXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjcmVhdGVRdWlja0NoYXQnLCAoKSA9PiB7XG5cblx0XHQvKipcblx0XHQgKiBQcm92aWRlciB0aGF0IHN1cHBvcnRzIHF1aWNrIGNoYXRzIGFuZCBtaW50cyBhIGZyZXNoIGRyYWZ0IHNlc3Npb24gb25cblx0XHQgKiBlYWNoIGBjcmVhdGVRdWlja0NoYXRgLCByZWNvcmRpbmcgdGhlIHJlcXVlc3RlZCB0eXBlIGFuZCBjYWxsIGNvdW50LlxuXHRcdCAqL1xuXHRcdGNsYXNzIFF1aWNrQ2hhdFByb3ZpZGVyIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0bGFzdFF1aWNrQ2hhdFR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNyZWF0ZVF1aWNrQ2hhdENhbGxzID0gMDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN1cHBvcnRzUXVpY2tDaGF0cyA9IHRydWU7XG5cblx0XHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0XHRzZWVkOiBJU2Vzc2lvbixcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQ6IHN0cmluZyA9ICdxdWljay1wcm92aWRlcicsXG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyOiBudW1iZXIgPSAwLFxuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElTZXNzaW9uVHlwZVtdID0gW3sgaWQ6ICdxdWljaycsIGxhYmVsOiAnUXVpY2snLCBpY29uOiBDb2RpY29uLnZtIH1dLFxuXHRcdFx0KSB7XG5cdFx0XHRcdHN1cGVyKHNlZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBjcmVhdGVRdWlja0NoYXQoc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVF1aWNrQ2hhdENhbGxzKys7XG5cdFx0XHRcdHRoaXMubGFzdFF1aWNrQ2hhdFR5cGUgPSBzZXNzaW9uVHlwZUlkO1xuXHRcdFx0XHRyZXR1cm4gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6IGBxJHt0aGlzLmNyZWF0ZVF1aWNrQ2hhdENhbGxzfWAsIHByb3ZpZGVySWQ6IHRoaXMuaWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0dXBRdWlja0NoYXQocHJvdmlkZXJzOiByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdKTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UocHJvdmlkZXJzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2NyZWF0ZXMgYSBzZXNzaW9uIHZpYSB0aGUgZmlyc3QgY2FwYWJsZSBwcm92aWRlciAoYnkgb3JkZXIpIGFuZCBkZWZhdWx0cyB0aGUgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdwbGFpbic7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyID0gMDtcblx0XHRcdH0oc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdwMScsIHByb3ZpZGVySWQ6ICdwbGFpbicgfSkpO1xuXHRcdFx0Y29uc3QgcXVpY2sgPSBuZXcgUXVpY2tDaGF0UHJvdmlkZXIoc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzZWVkJywgcHJvdmlkZXJJZDogJ3F1aWNrLXByb3ZpZGVyJyB9KSwgJ3F1aWNrLXByb3ZpZGVyJywgMSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXR1cFF1aWNrQ2hhdChbcGxhaW4sIHF1aWNrXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2VydmljZS5jcmVhdGVRdWlja0NoYXQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNyZWF0ZWRTZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0XHRyZXF1ZXN0ZWRUeXBlOiBxdWljay5sYXN0UXVpY2tDaGF0VHlwZSxcblx0XHRcdFx0ZHJhZnQ6IHNlcnZpY2UubmV3U2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjcmVhdGVkU2Vzc2lvbklkOiAncTEnLFxuXHRcdFx0XHRyZXF1ZXN0ZWRUeXBlOiAncXVpY2snLFxuXHRcdFx0XHRkcmFmdDogJ3ExJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWludHMgYSBuZXcgcXVpY2stY2hhdCBzZXNzaW9uIG9uIGVhY2ggY2FsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSkpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc2V0dXBRdWlja0NoYXQoW3F1aWNrXSk7XG5cdFx0XHRjb25zdCBmaXJzdCA9IHNlcnZpY2UuY3JlYXRlUXVpY2tDaGF0KCk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3Q6IGZpcnN0LnNlc3Npb25JZCxcblx0XHRcdFx0c2Vjb25kOiBzZWNvbmQuc2Vzc2lvbklkLFxuXHRcdFx0XHRjcmVhdGVRdWlja0NoYXRDYWxsczogcXVpY2suY3JlYXRlUXVpY2tDaGF0Q2FsbHMsXG5cdFx0XHRcdGRyYWZ0OiBzZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zmlyc3Q6ICdxMScsXG5cdFx0XHRcdHNlY29uZDogJ3EyJyxcblx0XHRcdFx0Y3JlYXRlUXVpY2tDaGF0Q2FsbHM6IDIsXG5cdFx0XHRcdGRyYWZ0OiAncTInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvd3Mgd2hlbiBubyBwcm92aWRlciBzdXBwb3J0cyBxdWljayBjaGF0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluID0gbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAncDEnLCBwcm92aWRlcklkOiAndGVzdCcgfSkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNldHVwUXVpY2tDaGF0KFtwbGFpbl0pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCgpLCAvTm8gc2Vzc2lvbnMgcHJvdmlkZXIgc3VwcG9ydHMgcXVpY2sgY2hhdHMvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm91cnMgb3B0aW9ucy5wcm92aWRlcklkIGFuZCB0aGUgcmVxdWVzdGVkIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSksICdxdWljay1wcm92aWRlcicsIDAsIFtcblx0XHRcdFx0eyBpZDogJ3F1aWNrJywgbGFiZWw6ICdRdWljaycsIGljb246IENvZGljb24udm0gfSxcblx0XHRcdFx0eyBpZDogJ290aGVyJywgbGFiZWw6ICdPdGhlcicsIGljb246IENvZGljb24udm0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc2V0dXBRdWlja0NoYXQoW3F1aWNrXSk7XG5cdFx0XHRzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCh7IHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICdvdGhlcicgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWljay5sYXN0UXVpY2tDaGF0VHlwZSwgJ290aGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob25vdXJzIGFuIGV4cGxpY2l0IHNlc3Npb25UeXBlSWQgd2l0aG91dCBhIHByb3ZpZGVySWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWljayA9IG5ldyBRdWlja0NoYXRQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NlZWQnLCBwcm92aWRlcklkOiAncXVpY2stcHJvdmlkZXInIH0pLCAncXVpY2stcHJvdmlkZXInLCAwLCBbXG5cdFx0XHRcdHsgaWQ6ICdxdWljaycsIGxhYmVsOiAnUXVpY2snLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRcdHsgaWQ6ICdvdGhlcicsIGxhYmVsOiAnT3RoZXInLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNldHVwUXVpY2tDaGF0KFtxdWlja10pO1xuXHRcdFx0c2VydmljZS5jcmVhdGVRdWlja0NoYXQoeyBzZXNzaW9uVHlwZUlkOiAnb3RoZXInIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2subGFzdFF1aWNrQ2hhdFR5cGUsICdvdGhlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVmYXVsdHMgdG8gdGhlIGxhc3QtdXNlZCBzZXNzaW9uIHR5cGUgb24gdGhlIG5leHQgY2FsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSksICdxdWljay1wcm92aWRlcicsIDAsIFtcblx0XHRcdFx0eyBpZDogJ3F1aWNrJywgbGFiZWw6ICdRdWljaycsIGljb246IENvZGljb24udm0gfSxcblx0XHRcdFx0eyBpZDogJ290aGVyJywgbGFiZWw6ICdPdGhlcicsIGljb246IENvZGljb24udm0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc2V0dXBRdWlja0NoYXQoW3F1aWNrXSk7XG5cdFx0XHRzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCh7IHNlc3Npb25UeXBlSWQ6ICdvdGhlcicgfSk7XG5cdFx0XHRzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2subGFzdFF1aWNrQ2hhdFR5cGUsICdvdGhlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHJlcXVlc3RlZCBwcm92aWRlciBkb2VzIG5vdCBhZHZlcnRpc2UgdGhlIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNldHVwUXVpY2tDaGF0KFtxdWlja10pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCh7IHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICdtaXNzaW5nJyB9KSwgL2RvZXMgbm90IGFkdmVydGlzZSBzZXNzaW9uIHR5cGUvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIHRoZSByZXF1ZXN0ZWQgcHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdwbGFpbic7XG5cdFx0XHR9KHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAncDEnLCBwcm92aWRlcklkOiAncGxhaW4nIH0pKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXR1cFF1aWNrQ2hhdChbcGxhaW5dKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VydmljZS5jcmVhdGVRdWlja0NoYXQoeyBwcm92aWRlcklkOiAncGxhaW4nIH0pLCAvZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0cy8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzIHJldHVybnMgZXZlcnkgYWR2ZXJ0aXNlZCB0eXBlIGZyb20gcXVpY2stY2hhdC1jYXBhYmxlIHByb3ZpZGVycyBvbmx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGxhaW4gPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ3BsYWluJztcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXIgPSAwO1xuXHRcdFx0fShzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3AxJywgcHJvdmlkZXJJZDogJ3BsYWluJyB9KSk7XG5cdFx0XHRjb25zdCBxdWljayA9IG5ldyBRdWlja0NoYXRQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NlZWQnLCBwcm92aWRlcklkOiAncXVpY2stcHJvdmlkZXInIH0pLCAncXVpY2stcHJvdmlkZXInLCAxLCBbXG5cdFx0XHRcdHsgaWQ6ICdxdWljaycsIGxhYmVsOiAnUXVpY2snLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRcdHsgaWQ6ICdvdGhlcicsIGxhYmVsOiAnT3RoZXInLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNldHVwUXVpY2tDaGF0KFtwbGFpbiwgcXVpY2tdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2VydmljZS5nZXRRdWlja0NoYXRTZXNzaW9uVHlwZXMoKS5tYXAodCA9PiAoeyBwcm92aWRlcklkOiB0LnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IHQuc2Vzc2lvblR5cGUuaWQgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBwcm92aWRlcklkOiAncXVpY2stcHJvdmlkZXInLCBzZXNzaW9uVHlwZUlkOiAncXVpY2snIH0sXG5cdFx0XHRcdFx0eyBwcm92aWRlcklkOiAncXVpY2stcHJvdmlkZXInLCBzZXNzaW9uVHlwZUlkOiAnb3RoZXInIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vKipcbiAqIEJ1aWxkcyBhIG1hbmFnZW1lbnQgc2VydmljZSB3aXRoIGEgQ29waWxvdC1zdHlsZSBwcm92aWRlciBhbmQgYVxuICogbG9jYWwtYWdlbnQtaG9zdCBwcm92aWRlciwgZWFjaCB3aXRoIGFuIGV4cGxpY2l0IHtAbGluayBJU2Vzc2lvbnNQcm92aWRlci5vcmRlcn0uXG4gKiBVc2VkIHRvIGFzc2VydCB0aGF0IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2Ugc3VyZmFjZXMgc2Vzc2lvbiB0eXBlcyBvcmRlcmVkIGJ5XG4gKiBwcm92aWRlciBvcmRlciAobG93ZXIgZmlyc3QpLlxuICovXG5mdW5jdGlvbiBjcmVhdGVPcmRlcmVkVHlwZXNTZXJ2aWNlKGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LCBjb3BpbG90T3JkZXI6IG51bWJlciwgYWdlbnRIb3N0T3JkZXI6IG51bWJlcik6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHtcblx0Y29uc3QgY29waWxvdFByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2RlZmF1bHQtY29waWxvdCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXIgPSBjb3BpbG90T3JkZXI7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFt7IGlkOiAnY29waWxvdCcsIGxhYmVsOiAnQ29waWxvdCcsIGljb246IENvZGljb24udm0gfV07XG5cdH0oc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdjMScsIHByb3ZpZGVySWQ6ICdkZWZhdWx0LWNvcGlsb3QnIH0pKTtcblx0Y29uc3QgYWdlbnRIb3N0UHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyID0gYWdlbnRIb3N0T3JkZXI7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFt7IGlkOiAnYWdlbnQtaG9zdCcsIGxhYmVsOiAnQWdlbnQgSG9zdCcsIGljb246IENvZGljb24udm0gfV07XG5cdH0oc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhMScsIHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSkpO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoW2NvcGlsb3RQcm92aWRlciwgYWdlbnRIb3N0UHJvdmlkZXJdKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHR9KTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUMxRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQW9CLHdCQUF1QztBQUMzRCxTQUFTLHdCQUF3Qix1QkFBdUI7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0MscUNBQXFDO0FBQ2hGLFNBQTBDLDBCQUEwQjtBQUNwRSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGlDQUFpQztBQUUxQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQixnQkFBc0YscUJBQXFCO0FBR3ZJLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNEJBQXNELDBCQUEwQixnQ0FBZ0M7QUFDekgsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBbUIsMEJBQTBCO0FBQ3RELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsb0NBQW9DO0FBRTdDLE1BQU0sV0FBVztBQUFBLEVBQ2hCLFVBQVUsSUFBSSxNQUFNLGNBQWM7QUFBQSxFQUNsQyxXQUFXLG9CQUFJLEtBQUs7QUFBQSxFQUNwQixPQUFPLGdCQUFnQixNQUFNO0FBQUEsRUFDN0IsV0FBVyxnQkFBZ0Isb0JBQUksS0FBSyxDQUFDO0FBQUEsRUFDckMsUUFBUSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3pCLFNBQVMsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLEVB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LEVBQUUsWUFBWSxHQUFHLEVBQUU7QUFBQSxRQUMzRztBQUFBLFVBQ0MsRUFBRSxZQUFZLGtCQUFrQixlQUFlLFFBQVE7QUFBQSxVQUN2RCxFQUFFLFlBQVksa0JBQWtCLGVBQWUsUUFBUTtBQUFBLFFBQ3hEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFRRCxTQUFTLDBCQUEwQixhQUF5RSxjQUFzQixnQkFBb0Q7QUFDckwsUUFBTSxrQkFBa0IsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLElBQW5DO0FBQUE7QUFDM0IsV0FBa0IsS0FBSztBQUN2QixXQUFrQixRQUFRO0FBQzFCLFdBQWtCLGVBQXdDLENBQUMsRUFBRSxJQUFJLFdBQVcsT0FBTyxXQUFXLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFBQTtBQUFBLEVBQ2pILEVBQUUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLGtCQUFrQixDQUFDLENBQUM7QUFDakUsUUFBTSxvQkFBb0IsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLElBQW5DO0FBQUE7QUFDN0IsV0FBa0IsS0FBSztBQUN2QixXQUFrQixRQUFRO0FBQzFCLFdBQWtCLGVBQXdDLENBQUMsRUFBRSxJQUFJLGNBQWMsT0FBTyxjQUFjLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFBQTtBQUFBLEVBQ3ZILEVBQUUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLDZCQUE2QixDQUFDLENBQUM7QUFFNUUsUUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsdUJBQXFCLEtBQUssaUJBQWlCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDeEYsdUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCx1QkFBcUIsS0FBSyxvQkFBb0IsWUFBWSxJQUFJLElBQUksc0JBQXNCLENBQUMsQ0FBQztBQUMxRix1QkFBcUIsS0FBSywyQkFBMkIsSUFBSSw2QkFBNkIsQ0FBQyxpQkFBaUIsaUJBQWlCLENBQUMsQ0FBQztBQUMzSCx1QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLHVCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLHVCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLHVCQUFxQixLQUFLLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxJQUFuQztBQUFBO0FBQzNDLFdBQWtCLHFCQUFxQixNQUFNO0FBQUE7QUFBQSxFQUM5QyxHQUFDO0FBRUQsU0FBTyxZQUFZLElBQUkscUJBQXFCLGVBQWUseUJBQXlCLENBQUM7QUFDdEY7IiwKICAibmFtZXMiOiBbInNvdXJjZUNoYXQiLCAic2VsZWN0aW9uIl0KfQo=
