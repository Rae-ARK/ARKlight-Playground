import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { TestStorageService } from "../../../../../../workbench/test/common/workbenchTestServices.js";
import { IChatService } from "../../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { IGitService } from "../../../../../../workbench/contrib/git/common/gitService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { SessionStatus } from "../../../../../services/sessions/common/session.js";
import { LocalChatSessionsProvider, LocalSessionType, LOCAL_SESSION_ENABLED_SETTING } from "../../browser/localChatSessionsProvider.js";
function createMockModel(sessionResource, opts) {
  let workingDirectory;
  const requestInProgress = opts?.requestInProgress ?? observableValue("requestInProgress", false);
  const timing = opts?.timing ?? { created: 1e3, lastRequestStarted: void 0, lastRequestEnded: void 0 };
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionResource = sessionResource;
      this.title = opts?.title ?? "Test Session";
      this.timing = timing;
      this.requestInProgress = requestInProgress;
    }
    get workingDirectory() {
      return workingDirectory;
    }
    setWorkingDirectory(uri) {
      workingDirectory = uri;
    }
  }();
}
class MockChatService extends Disposable {
  constructor() {
    super(...arguments);
    this._models = /* @__PURE__ */ new Map();
    this._counter = 0;
    this.sendRequestCalls = [];
    /** When a query matches an entry here, sendRequest reports a rejection. */
    this.rejectQueries = /* @__PURE__ */ new Set();
    /** In-progress state wired into every model created by startNewLocalSession. */
    this.newSessionInProgress = observableValue("newSessionInProgress", false);
    /** When set, sendRequest returns a completion promise resolved via resolveCompletion(). */
    this.deferCompletion = false;
    this._completeResolvers = [];
    this._onDidDisposeSession = this._register(new Emitter());
    this.onDidDisposeSession = this._onDidDisposeSession.event;
    this._onDidSubmitRequest = this._register(new Emitter());
    this.onDidSubmitRequest = this._onDidSubmitRequest.event;
  }
  resolveCompletion() {
    for (const resolve of this._completeResolvers.splice(0)) {
      resolve();
    }
  }
  startNewLocalSession(_location, _options) {
    const resource = URI.parse(`vscode-local-chat://chat/${++this._counter}`);
    const model = createMockModel(resource, { requestInProgress: this.newSessionInProgress });
    this._models.set(resource.toString(), model);
    return { object: model, dispose: () => {
    } };
  }
  getSession(resource) {
    return this._models.get(resource.toString());
  }
  registerModel(model) {
    this._models.set(model.sessionResource.toString(), model);
  }
  async acquireOrLoadSession() {
    return void 0;
  }
  async sendRequest(resource, query) {
    this.sendRequestCalls.push({ resource, query });
    if (this.rejectQueries.has(query)) {
      return { kind: "rejected", reason: "test-rejected" };
    }
    const responseCompletePromise = this.deferCompletion ? new Promise((resolve) => this._completeResolvers.push(resolve)) : Promise.resolve();
    return { kind: "sent", data: { responseCompletePromise, responseCreatedPromise: Promise.resolve({}) } };
  }
  async getLocalSessionHistory() {
    return [];
  }
  async removeHistoryEntry(_resource) {
  }
  setSessionTitle(_resource, _title) {
  }
  fireSubmitRequest(resource) {
    this._onDidSubmitRequest.fire({ chatSessionResource: resource });
  }
}
function createFixture(store) {
  const instantiationService = store.add(new TestInstantiationService());
  const chatService = store.add(new MockChatService());
  const storage = store.add(new TestStorageService());
  const config = new TestConfigurationService();
  config.setUserConfiguration(LOCAL_SESSION_ENABLED_SETTING, true);
  const dialog = { confirmResult: true, confirmCount: 0 };
  instantiationService.stub(IChatService, chatService);
  instantiationService.stub(IStorageService, storage);
  instantiationService.stub(IConfigurationService, config);
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IDialogService, new class extends mock() {
    async confirm() {
      dialog.confirmCount++;
      return { confirmed: dialog.confirmResult };
    }
  }());
  instantiationService.stub(ILabelService, new class extends mock() {
    getUriLabel(uri) {
      return uri.fsPath;
    }
  }());
  instantiationService.stub(ILanguageModelsService, new class extends mock() {
  }());
  instantiationService.stub(ILanguageModelToolsService, new class extends mock() {
  }());
  instantiationService.stub(IGitService, new class extends mock() {
    async openRepository() {
      return void 0;
    }
  }());
  instantiationService.stub(IFileService, new class extends mock() {
  }());
  instantiationService.stub(IInstantiationService, instantiationService);
  return { instantiationService, chatService, storage, config, dialog };
}
const TEST_FOLDER = URI.file("/test/folder");
const STORAGE_KEY_SESSIONS = "sessions.localChat.sessions";
function readStoredSessions(storage) {
  const raw = storage.get(STORAGE_KEY_SESSIONS, StorageScope.PROFILE);
  return raw ? JSON.parse(raw) : [];
}
async function commitNewSession(provider) {
  const newSession = provider.createNewSession(TEST_FOLDER, LocalSessionType.id);
  const chat = await provider.createNewChat(newSession.sessionId);
  await provider.sendRequest(newSession.sessionId, chat.resource, { query: "hello" });
  return newSession;
}
async function addChat(provider, session, query = "second") {
  const chat = await provider.createNewChat(session.sessionId);
  await provider.sendRequest(session.sessionId, chat.resource, { query });
  return chat.resource;
}
suite("LocalChatSessionsProvider", () => {
  const leaks = ensureNoDisposablesAreLeakedInTestSuite();
  test("declares Local session type", () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), [LocalSessionType.id]);
  });
  test("keeps empty Copilot resolution pending until live Copilot models arrive", () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const models = /* @__PURE__ */ new Map();
    instantiationService.stub(ILanguageModelsService, new class extends mock() {
      getLanguageModelIds() {
        return [...models.keys()];
      }
      lookupLanguageModel(identifier) {
        return models.get(identifier);
      }
      hasResolvedVendor() {
        return true;
      }
    }());
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const emptyCopilot = provider.getModelsSnapshot("session", "copilot/remembered");
    const emptyByok = provider.getModelsSnapshot("session", "ollama/remembered");
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
      isDefaultForLocation: {}
    });
    const liveCopilot = provider.getModelsSnapshot("session", "copilot/remembered");
    assert.deepStrictEqual({
      emptyCopilot: emptyCopilot.desiredModelResolution,
      emptyByok: emptyByok.desiredModelResolution,
      liveCopilot: liveCopilot.desiredModelResolution,
      models: liveCopilot.models.map((model) => model.identifier),
      modelTarget: liveCopilot.modelTarget
    }, {
      emptyCopilot: { kind: "pending", identifier: "copilot/remembered" },
      emptyByok: { kind: "unavailable", identifier: "ollama/remembered" },
      liveCopilot: { kind: "unavailable", identifier: "copilot/remembered" },
      models: ["copilot/other"],
      modelTarget: void 0
    });
  });
  test("resolveWorkspace handles only file uris", () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    assert.strictEqual(provider.resolveWorkspace(URI.parse("http://example.com")), void 0);
    const ws = provider.resolveWorkspace(TEST_FOLDER);
    assert.ok(ws);
    assert.strictEqual(ws.folders[0].root.toString(), TEST_FOLDER.toString());
  });
  test("createNewSession returns a session but does not show in getSessions until first send", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const newSession = provider.createNewSession(TEST_FOLDER, LocalSessionType.id);
    assert.strictEqual(newSession.providerId, provider.id);
    assert.strictEqual(provider.getSessions().length, 0);
    const chat = await provider.createNewChat(newSession.sessionId);
    await provider.sendRequest(newSession.sessionId, chat.resource, { query: "hi" });
    assert.strictEqual(provider.getSessions().length, 1);
  });
  test("createNewSession rejects unknown session types", () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    assert.throws(() => provider.createNewSession(TEST_FOLDER, "bogus"));
  });
  test("persists committed sessions and restores them on next provider instance", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Event.toPromise(provider2.onDidChangeSessions);
    const restored = provider2.getSessions();
    assert.strictEqual(restored.length, 1);
    assert.strictEqual(restored[0].resource.toString(), session.resource.toString());
  });
  test("deleteSession removes session from cache and storage", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await provider.deleteSession(session.sessionId);
    assert.strictEqual(provider.getSessions().length, 0);
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(provider2.getSessions().length, 0);
  });
  test("archiveSession and unarchiveSession toggle isArchived and persist", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await provider.archiveSession(session.sessionId);
    assert.strictEqual(provider.getSessions()[0].isArchived.get(), true);
    await provider.unarchiveSession(session.sessionId);
    assert.strictEqual(provider.getSessions()[0].isArchived.get(), false);
    await provider.archiveSession(session.sessionId);
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Event.toPromise(provider2.onDidChangeSessions);
    assert.strictEqual(provider2.getSessions()[0].isArchived.get(), true);
  });
  test("renameChat updates session title and persists it", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await provider.renameChat(session.sessionId, session.resource, "Custom Title");
    assert.strictEqual(provider.getSessions()[0].title.get(), "Custom Title");
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Event.toPromise(provider2.onDidChangeSessions);
    assert.strictEqual(provider2.getSessions()[0].title.get(), "Custom Title");
  });
  test("status follows model.requestInProgress after a submit event", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const inProgress = observableValue("inProgress", false);
    chatService.registerModel(createMockModel(session.resource, { requestInProgress: inProgress }));
    chatService.fireSubmitRequest(session.resource);
    assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed);
    inProgress.set(true, void 0);
    assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.InProgress);
    inProgress.set(false, void 0);
    assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed);
  });
  test("marks the session unread when a tracked turn completes", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const inProgress = observableValue("inProgress", false);
    chatService.registerModel(createMockModel(session.resource, { requestInProgress: inProgress }));
    chatService.fireSubmitRequest(session.resource);
    const readBefore = provider.getSessions()[0].isRead.get();
    inProgress.set(true, void 0);
    inProgress.set(false, void 0);
    assert.deepStrictEqual({
      readBefore,
      readAfter: provider.getSessions()[0].isRead.get()
    }, {
      readBefore: true,
      readAfter: false
    });
  });
  test("does not mark unread when the model was never in progress", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const inProgress = observableValue("inProgress", false);
    chatService.registerModel(createMockModel(session.resource, { requestInProgress: inProgress }));
    chatService.fireSubmitRequest(session.resource);
    assert.strictEqual(provider.getSessions()[0].isRead.get(), true);
  });
  test("marks the session unread when the first turn completes after navigating away", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    chatService.deferCompletion = true;
    chatService.newSessionInProgress.set(true, void 0);
    await commitNewSession(provider);
    const readBefore = provider.getSessions()[0].isRead.get();
    chatService.newSessionInProgress.set(false, void 0);
    chatService.resolveCompletion();
    await Promise.resolve();
    assert.deepStrictEqual({
      readBefore,
      readAfter: provider.getSessions()[0].isRead.get()
    }, {
      readBefore: true,
      readAfter: false
    });
  });
  test("setSessionReadState clears unread across every chat in the group", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    const childInProgress = observableValue("childInProgress", false);
    chatService.registerModel(createMockModel(childResource, { requestInProgress: childInProgress }));
    chatService.fireSubmitRequest(childResource);
    childInProgress.set(true, void 0);
    childInProgress.set(false, void 0);
    const readBefore = provider.getSessions()[0].isRead.get();
    await provider.setSessionReadState(session.sessionId, true);
    assert.deepStrictEqual({
      readBefore,
      readAfter: provider.getSessions()[0].isRead.get()
    }, {
      readBefore: false,
      readAfter: true
    });
  });
  test("a stored session persisted before isRead existed loads as unread", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, storage } = createFixture(store);
    storage.store("sessions.localChat.migrated", true, StorageScope.PROFILE, StorageTarget.MACHINE);
    storage.store(STORAGE_KEY_SESSIONS, JSON.stringify([{
      uri: URI.parse("vscode-local-chat://chat/legacy").toJSON(),
      title: "Legacy",
      createdAt: 1e3,
      lastMessageDate: 2e3,
      workingDirectory: TEST_FOLDER.toJSON()
    }]), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Event.toPromise(provider.onDidChangeSessions);
    assert.strictEqual(provider.getSessions()[0].isRead.get(), false);
  });
  test("Event.None and exports remain stable", () => {
    assert.strictEqual(LocalSessionType.id, "local");
    assert.strictEqual(LOCAL_SESSION_ENABLED_SETTING, "sessions.chat.localAgent.enabled");
    assert.ok(Event.None);
  });
  test("committed sessions advertise supportsMultipleChats", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    assert.strictEqual(session.capabilities.get().supportsMultipleChats, true);
    assert.strictEqual(session.chats.get().length, 1);
  });
  test("createNewChat adds a second chat to an existing session", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await addChat(provider, session);
    assert.strictEqual(provider.getSessions().length, 1);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
  });
  test("persists the chat hierarchy and restores it grouped", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await addChat(provider, session);
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Event.toPromise(provider2.onDidChangeSessions);
    const restored = provider2.getSessions();
    assert.strictEqual(restored.length, 1);
    assert.strictEqual(restored[0].resource.toString(), session.resource.toString());
    assert.strictEqual(restored[0].chats.get().length, 2);
  });
  test("deleteChat removes a child chat but keeps the session after confirmation", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, dialog } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
    await provider.deleteChat(session.sessionId, childResource);
    assert.strictEqual(dialog.confirmCount, 1);
    assert.strictEqual(provider.getSessions().length, 1);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 1);
  });
  test("deleteChat keeps the child chat when the confirmation is cancelled", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, dialog } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
    dialog.confirmResult = false;
    await provider.deleteChat(session.sessionId, childResource);
    assert.strictEqual(dialog.confirmCount, 1);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
  });
  test("deleteChat with skipConfirmation deletes without showing the dialog", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, dialog } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
    const deleted = await provider.deleteChat(session.sessionId, childResource, { skipConfirmation: true });
    assert.strictEqual(deleted, true);
    assert.strictEqual(dialog.confirmCount, 0);
    assert.strictEqual(provider.getSessions().length, 1);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 1);
  });
  test("deleteChat returns false when the confirmation is cancelled", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, dialog } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    dialog.confirmResult = false;
    const deleted = await provider.deleteChat(session.sessionId, childResource);
    assert.strictEqual(deleted, false);
  });
  test("deleteChat with an unknown chat URI is a no-op", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await addChat(provider, session);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
    await provider.deleteChat(session.sessionId, URI.parse("vscode-local-chat://chat/does-not-exist"));
    assert.strictEqual(provider.getSessions().length, 1);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
  });
  test("deleteSession removes the primary chat and all children", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await addChat(provider, session);
    await provider.deleteSession(session.sessionId);
    assert.strictEqual(provider.getSessions().length, 0);
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(provider2.getSessions().length, 0);
  });
  test("a rejected subsequent chat send is rolled back", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    chatService.rejectQueries.add("boom");
    const chat = await provider.createNewChat(session.sessionId);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 2);
    await assert.rejects(provider.sendRequest(session.sessionId, chat.resource, { query: "boom" }));
    assert.strictEqual(provider.getSessions().length, 1);
    assert.strictEqual(provider.getSessions()[0].chats.get().length, 1);
  });
  test("persists the parent link in the child chat metadata", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, storage } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    const stored = readStoredSessions(storage);
    const primaryEntry = stored.find((s) => URI.revive(s.uri).toString() === session.resource.toString());
    const childEntry = stored.find((s) => URI.revive(s.uri).toString() === childResource.toString());
    assert.strictEqual(primaryEntry?.parentUri, void 0);
    assert.ok(childEntry?.parentUri);
    assert.strictEqual(URI.revive(childEntry.parentUri).toString(), session.resource.toString());
  });
  test("promotes an orphaned child to a primary when its parent is missing", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, storage } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    const withoutPrimary = readStoredSessions(storage).filter((s) => URI.revive(s.uri).toString() !== session.resource.toString());
    storage.store(STORAGE_KEY_SESSIONS, JSON.stringify(withoutPrimary), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider2 = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    await Event.toPromise(provider2.onDidChangeSessions);
    const sessions = provider2.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].resource.toString(), childResource.toString());
    assert.strictEqual(sessions[0].chats.get().length, 1);
  });
  test("deleteChat on the primary chat deletes the whole session", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    await addChat(provider, session);
    await provider.deleteChat(session.sessionId, session.resource);
    assert.strictEqual(provider.getSessions().length, 0);
  });
  test("group status aggregates across child chats", async () => {
    const store = leaks.add(new DisposableStore());
    const { instantiationService, chatService } = createFixture(store);
    const provider = store.add(instantiationService.createInstance(LocalChatSessionsProvider));
    const session = await commitNewSession(provider);
    const childResource = await addChat(provider, session);
    const childInProgress = observableValue("childInProgress", false);
    chatService.registerModel(createMockModel(childResource, { requestInProgress: childInProgress }));
    chatService.fireSubmitRequest(childResource);
    const group = provider.getSessions()[0];
    assert.strictEqual(group.status.get(), SessionStatus.Completed);
    childInProgress.set(true, void 0);
    assert.strictEqual(group.status.get(), SessionStatus.InProgress);
    childInProgress.set(false, void 0);
    assert.strictEqual(group.status.get(), SessionStatus.Completed);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2xvY2FsQ2hhdFNlc3Npb25zL3Rlc3QvYnJvd3Nlci9sb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0U2VydmljZSwgSUNoYXRTZXNzaW9uU3RhcnRPcHRpb25zLCBJQ2hhdFNlc3Npb25UaW1pbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2dpdC9jb21tb24vZ2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyLCBMb2NhbFNlc3Npb25UeXBlLCBMT0NBTF9TRVNTSU9OX0VOQUJMRURfU0VUVElORyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbi8vIC0tLS0gTW9jayBjaGF0IHNlcnZpY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdHM/OiB7IHRpdGxlPzogc3RyaW5nOyByZXF1ZXN0SW5Qcm9ncmVzcz86IElPYnNlcnZhYmxlPGJvb2xlYW4+OyB0aW1pbmc/OiBJQ2hhdFNlc3Npb25UaW1pbmcgfSk6IElDaGF0TW9kZWwge1xuXHRsZXQgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRjb25zdCByZXF1ZXN0SW5Qcm9ncmVzcyA9IG9wdHM/LnJlcXVlc3RJblByb2dyZXNzID8/IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPigncmVxdWVzdEluUHJvZ3Jlc3MnLCBmYWxzZSk7XG5cdGNvbnN0IHRpbWluZzogSUNoYXRTZXNzaW9uVGltaW5nID0gb3B0cz8udGltaW5nID8/IHsgY3JlYXRlZDogMV8wMDAsIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRNb2RlbD4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRpdGxlID0gb3B0cz8udGl0bGUgPz8gJ1Rlc3QgU2Vzc2lvbic7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGltaW5nID0gdGltaW5nO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcXVlc3RJblByb2dyZXNzID0gcmVxdWVzdEluUHJvZ3Jlc3M7XG5cdFx0b3ZlcnJpZGUgZ2V0IHdvcmtpbmdEaXJlY3RvcnkoKSB7IHJldHVybiB3b3JraW5nRGlyZWN0b3J5OyB9XG5cdFx0b3ZlcnJpZGUgc2V0V29ya2luZ0RpcmVjdG9yeSh1cmk6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQgeyB3b3JraW5nRGlyZWN0b3J5ID0gdXJpOyB9XG5cdH0oKTtcbn1cblxuY2xhc3MgTW9ja0NoYXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdE1vZGVsPigpO1xuXHRwcml2YXRlIF9jb3VudGVyID0gMDtcblxuXHRyZWFkb25seSBzZW5kUmVxdWVzdENhbGxzOiB7IHJlc291cmNlOiBVUkk7IHF1ZXJ5OiBzdHJpbmcgfVtdID0gW107XG5cblx0LyoqIFdoZW4gYSBxdWVyeSBtYXRjaGVzIGFuIGVudHJ5IGhlcmUsIHNlbmRSZXF1ZXN0IHJlcG9ydHMgYSByZWplY3Rpb24uICovXG5cdHJlYWRvbmx5IHJlamVjdFF1ZXJpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKiogSW4tcHJvZ3Jlc3Mgc3RhdGUgd2lyZWQgaW50byBldmVyeSBtb2RlbCBjcmVhdGVkIGJ5IHN0YXJ0TmV3TG9jYWxTZXNzaW9uLiAqL1xuXHRyZWFkb25seSBuZXdTZXNzaW9uSW5Qcm9ncmVzcyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignbmV3U2Vzc2lvbkluUHJvZ3Jlc3MnLCBmYWxzZSk7XG5cblx0LyoqIFdoZW4gc2V0LCBzZW5kUmVxdWVzdCByZXR1cm5zIGEgY29tcGxldGlvbiBwcm9taXNlIHJlc29sdmVkIHZpYSByZXNvbHZlQ29tcGxldGlvbigpLiAqL1xuXHRkZWZlckNvbXBsZXRpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGVSZXNvbHZlcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cdHJlc29sdmVDb21wbGV0aW9uKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb2x2ZSBvZiB0aGlzLl9jb21wbGV0ZVJlc29sdmVycy5zcGxpY2UoMCkpIHtcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2VTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBzZXNzaW9uUmVzb3VyY2VzOiByZWFkb25seSBVUklbXTsgcmVhZG9ubHkgcmVhc29uOiAnY2xlYXJlZCcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZVNlc3Npb24gPSB0aGlzLl9vbkRpZERpc3Bvc2VTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3VibWl0UmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSB0aGlzLl9vbkRpZFN1Ym1pdFJlcXVlc3QuZXZlbnQ7XG5cblx0c3RhcnROZXdMb2NhbFNlc3Npb24oX2xvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiwgX29wdGlvbnM/OiBJQ2hhdFNlc3Npb25TdGFydE9wdGlvbnMpOiBJQ2hhdE1vZGVsUmVmZXJlbmNlIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgdnNjb2RlLWxvY2FsLWNoYXQ6Ly9jaGF0LyR7Kyt0aGlzLl9jb3VudGVyfWApO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9ja01vZGVsKHJlc291cmNlLCB7IHJlcXVlc3RJblByb2dyZXNzOiB0aGlzLm5ld1Nlc3Npb25JblByb2dyZXNzIH0pO1xuXHRcdHRoaXMuX21vZGVscy5zZXQocmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwpO1xuXHRcdHJldHVybiB7IG9iamVjdDogbW9kZWwsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHR9XG5cblx0Z2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVscy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRyZWdpc3Rlck1vZGVsKG1vZGVsOiBJQ2hhdE1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgYWNxdWlyZU9yTG9hZFNlc3Npb24oKTogUHJvbWlzZTxJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHNlbmRSZXF1ZXN0KHJlc291cmNlOiBVUkksIHF1ZXJ5OiBzdHJpbmcpIHtcblx0XHR0aGlzLnNlbmRSZXF1ZXN0Q2FsbHMucHVzaCh7IHJlc291cmNlLCBxdWVyeSB9KTtcblx0XHRpZiAodGhpcy5yZWplY3RRdWVyaWVzLmhhcyhxdWVyeSkpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ3Rlc3QtcmVqZWN0ZWQnIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gdGhpcy5kZWZlckNvbXBsZXRpb25cblx0XHRcdD8gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB0aGlzLl9jb21wbGV0ZVJlc29sdmVycy5wdXNoKHJlc29sdmUpKVxuXHRcdFx0OiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcsIGRhdGE6IHsgcmVzcG9uc2VDb21wbGV0ZVByb21pc2UsIHJlc3BvbnNlQ3JlYXRlZFByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7fSkgfSB9O1xuXHR9XG5cblx0YXN5bmMgZ2V0TG9jYWxTZXNzaW9uSGlzdG9yeSgpIHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIHJlbW92ZUhpc3RvcnlFbnRyeShfcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdHNldFNlc3Npb25UaXRsZShfcmVzb3VyY2U6IFVSSSwgX3RpdGxlOiBzdHJpbmcpOiB2b2lkIHsgfVxuXG5cdGZpcmVTdWJtaXRSZXF1ZXN0KHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFN1Ym1pdFJlcXVlc3QuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlIH0pO1xuXHR9XG59XG5cbi8vIC0tLS0gVGVzdCBmaXh0dXJlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElUZXN0Rml4dHVyZSB7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGNoYXRTZXJ2aWNlOiBNb2NrQ2hhdFNlcnZpY2U7XG5cdHN0b3JhZ2U6IFRlc3RTdG9yYWdlU2VydmljZTtcblx0Y29uZmlnOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGRpYWxvZzogeyBjb25maXJtUmVzdWx0OiBib29sZWFuOyBjb25maXJtQ291bnQ6IG51bWJlciB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJVGVzdEZpeHR1cmUge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBjaGF0U2VydmljZSA9IHN0b3JlLmFkZChuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRjb25zdCBzdG9yYWdlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKExPQ0FMX1NFU1NJT05fRU5BQkxFRF9TRVRUSU5HLCB0cnVlKTtcblxuXHRjb25zdCBkaWFsb2cgPSB7IGNvbmZpcm1SZXN1bHQ6IHRydWUsIGNvbmZpcm1Db3VudDogMCB9O1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBjaGF0U2VydmljZSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZyk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgY29uZmlybSgpIHsgZGlhbG9nLmNvbmZpcm1Db3VudCsrOyByZXR1cm4geyBjb25maXJtZWQ6IGRpYWxvZy5jb25maXJtUmVzdWx0IH07IH1cblx0fSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYWJlbFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldFVyaUxhYmVsKHVyaTogVVJJKTogc3RyaW5nIHsgcmV0dXJuIHVyaS5mc1BhdGg7IH1cblx0fSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkgeyB9KCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlPigpIHsgfSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJR2l0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblJlcG9zaXRvcnkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0fSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHsgfSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0cmV0dXJuIHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRTZXJ2aWNlLCBzdG9yYWdlLCBjb25maWcsIGRpYWxvZyB9O1xufVxuXG5jb25zdCBURVNUX0ZPTERFUiA9IFVSSS5maWxlKCcvdGVzdC9mb2xkZXInKTtcblxuLyoqIFN0b3JhZ2Uga2V5IHVzZWQgYnkgdGhlIHByb3ZpZGVyIHRvIHBlcnNpc3QgdGhlIHNlc3Npb24gbGlzdC4gKi9cbmNvbnN0IFNUT1JBR0VfS0VZX1NFU1NJT05TID0gJ3Nlc3Npb25zLmxvY2FsQ2hhdC5zZXNzaW9ucyc7XG5cbmludGVyZmFjZSBJUmVhZFN0b3JlZFNlc3Npb24ge1xuXHRyZWFkb25seSB1cmk6IFVyaUNvbXBvbmVudHM7XG5cdHJlYWRvbmx5IHBhcmVudFVyaT86IFVyaUNvbXBvbmVudHM7XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRTZXNzaW9ucyhzdG9yYWdlOiBUZXN0U3RvcmFnZVNlcnZpY2UpOiBJUmVhZFN0b3JlZFNlc3Npb25bXSB7XG5cdGNvbnN0IHJhdyA9IHN0b3JhZ2UuZ2V0KFNUT1JBR0VfS0VZX1NFU1NJT05TLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdHJldHVybiByYXcgPyBKU09OLnBhcnNlKHJhdykgYXMgSVJlYWRTdG9yZWRTZXNzaW9uW10gOiBbXTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcjogTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcik6IFByb21pc2U8SVNlc3Npb24+IHtcblx0Y29uc3QgbmV3U2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVEVTVF9GT0xERVIsIExvY2FsU2Vzc2lvblR5cGUuaWQpO1xuXHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChuZXdTZXNzaW9uLnNlc3Npb25JZCk7XG5cdGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KG5ld1Nlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnaGVsbG8nIH0pO1xuXHRyZXR1cm4gbmV3U2Vzc2lvbjtcbn1cblxuLyoqIEFkZHMgYW5kIHNlbmRzIGEgc3Vic2VxdWVudCBjaGF0IHRvIGFuIGFscmVhZHktY29tbWl0dGVkIG11bHRpLWNoYXQgc2Vzc2lvbi4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFkZENoYXQocHJvdmlkZXI6IExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb246IElTZXNzaW9uLCBxdWVyeSA9ICdzZWNvbmQnKTogUHJvbWlzZTxVUkk+IHtcblx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeSB9KTtcblx0cmV0dXJuIGNoYXQucmVzb3VyY2U7XG59XG5cbi8vIC0tLS0gU3VpdGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5zdWl0ZSgnTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcicsICgpID0+IHtcblx0Y29uc3QgbGVha3MgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkZWNsYXJlcyBMb2NhbCBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5tYXAodCA9PiB0LmlkKSwgW0xvY2FsU2Vzc2lvblR5cGUuaWRdKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZW1wdHkgQ29waWxvdCByZXNvbHV0aW9uIHBlbmRpbmcgdW50aWwgbGl2ZSBDb3BpbG90IG1vZGVscyBhcnJpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbLi4ubW9kZWxzLmtleXMoKV07IH1cblx0XHRcdG92ZXJyaWRlIGxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcjogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQgeyByZXR1cm4gbW9kZWxzLmdldChpZGVudGlmaWVyKTsgfVxuXHRcdFx0b3ZlcnJpZGUgaGFzUmVzb2x2ZWRWZW5kb3IoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdFx0fSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdFx0Y29uc3QgZW1wdHlDb3BpbG90ID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3QoJ3Nlc3Npb24nLCAnY29waWxvdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3QgZW1wdHlCeW9rID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3QoJ3Nlc3Npb24nLCAnb2xsYW1hL3JlbWVtYmVyZWQnKTtcblxuXHRcdG1vZGVscy5zZXQoJ2NvcGlsb3Qvb3RoZXInLCB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0aWQ6ICdvdGhlcicsXG5cdFx0XHRuYW1lOiAnT3RoZXInLFxuXHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdGZhbWlseTogJ290aGVyJyxcblx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHR9KTtcblx0XHRjb25zdCBsaXZlQ29waWxvdCA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KCdzZXNzaW9uJywgJ2NvcGlsb3QvcmVtZW1iZXJlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbXB0eUNvcGlsb3Q6IGVtcHR5Q29waWxvdC5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uLFxuXHRcdFx0ZW1wdHlCeW9rOiBlbXB0eUJ5b2suZGVzaXJlZE1vZGVsUmVzb2x1dGlvbixcblx0XHRcdGxpdmVDb3BpbG90OiBsaXZlQ29waWxvdC5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uLFxuXHRcdFx0bW9kZWxzOiBsaXZlQ29waWxvdC5tb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLFxuXHRcdFx0bW9kZWxUYXJnZXQ6IGxpdmVDb3BpbG90Lm1vZGVsVGFyZ2V0LFxuXHRcdH0sIHtcblx0XHRcdGVtcHR5Q29waWxvdDogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6ICdjb3BpbG90L3JlbWVtYmVyZWQnIH0sXG5cdFx0XHRlbXB0eUJ5b2s6IHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWRlbnRpZmllcjogJ29sbGFtYS9yZW1lbWJlcmVkJyB9LFxuXHRcdFx0bGl2ZUNvcGlsb3Q6IHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWRlbnRpZmllcjogJ2NvcGlsb3QvcmVtZW1iZXJlZCcgfSxcblx0XHRcdG1vZGVsczogWydjb3BpbG90L290aGVyJ10sXG5cdFx0XHRtb2RlbFRhcmdldDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3NwYWNlIGhhbmRsZXMgb25seSBmaWxlIHVyaXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShVUkkucGFyc2UoJ2h0dHA6Ly9leGFtcGxlLmNvbScpKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHdzID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShURVNUX0ZPTERFUik7XG5cdFx0YXNzZXJ0Lm9rKHdzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MhLmZvbGRlcnNbMF0ucm9vdC50b1N0cmluZygpLCBURVNUX0ZPTERFUi50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiByZXR1cm5zIGEgc2Vzc2lvbiBidXQgZG9lcyBub3Qgc2hvdyBpbiBnZXRTZXNzaW9ucyB1bnRpbCBmaXJzdCBzZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVEVTVF9GT0xERVIsIExvY2FsU2Vzc2lvblR5cGUuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdTZXNzaW9uLnByb3ZpZGVySWQsIHByb3ZpZGVyLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDApO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQobmV3U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KG5ld1Nlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnaGknIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gcmVqZWN0cyB1bmtub3duIHNlc3Npb24gdHlwZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVEVTVF9GT0xERVIsICdib2d1cycpKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgY29tbWl0dGVkIHNlc3Npb25zIGFuZCByZXN0b3JlcyB0aGVtIG9uIG5leHQgcHJvdmlkZXIgaW5zdGFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cblx0XHRjb25zdCBwcm92aWRlcjIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShwcm92aWRlcjIub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBwcm92aWRlcjIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWRbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlU2Vzc2lvbiByZW1vdmVzIHNlc3Npb24gZnJvbSBjYWNoZSBhbmQgc3RvcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZUZpeHR1cmUoc3RvcmUpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjb21taXROZXdTZXNzaW9uKHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBwcm92aWRlcjIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXHRcdC8vIFdhaXQgb25lIG1pY3JvdGFzayB0aWNrIGZvciB0aGUgYXN5bmMgbWlncmF0aW9uL2xvYWQgdG8gY29tcGxldGUgKG5vIGV2ZW50IGZpcmVzIHdoZW4gZW1wdHkpXG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMi5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FyY2hpdmVTZXNzaW9uIGFuZCB1bmFyY2hpdmVTZXNzaW9uIHRvZ2dsZSBpc0FyY2hpdmVkIGFuZCBwZXJzaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzQXJjaGl2ZWQuZ2V0KCksIHRydWUpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIudW5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNBcmNoaXZlZC5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyMiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHByb3ZpZGVyMi5vbkRpZENoYW5nZVNlc3Npb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyLmdldFNlc3Npb25zKClbMF0uaXNBcmNoaXZlZC5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZUNoYXQgdXBkYXRlcyBzZXNzaW9uIHRpdGxlIGFuZCBwZXJzaXN0cyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZUZpeHR1cmUoc3RvcmUpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjb21taXROZXdTZXNzaW9uKHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnJlbmFtZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24ucmVzb3VyY2UsICdDdXN0b20gVGl0bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS50aXRsZS5nZXQoKSwgJ0N1c3RvbSBUaXRsZScpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UocHJvdmlkZXIyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjIuZ2V0U2Vzc2lvbnMoKVswXS50aXRsZS5nZXQoKSwgJ0N1c3RvbSBUaXRsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0dXMgZm9sbG93cyBtb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcyBhZnRlciBhIHN1Ym1pdCBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRTZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cblx0XHQvLyBSZXBsYWNlIHRoZSByZWdpc3RlcmVkIG1vZGVsIHdpdGggYSBjb250cm9sbGFibGUgb25lIGZvciB0cmFja2luZ1xuXHRcdGNvbnN0IGluUHJvZ3Jlc3MgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2luUHJvZ3Jlc3MnLCBmYWxzZSk7XG5cdFx0Y2hhdFNlcnZpY2UucmVnaXN0ZXJNb2RlbChjcmVhdGVNb2NrTW9kZWwoc2Vzc2lvbi5yZXNvdXJjZSwgeyByZXF1ZXN0SW5Qcm9ncmVzczogaW5Qcm9ncmVzcyB9KSk7XG5cblx0XHRjaGF0U2VydmljZS5maXJlU3VibWl0UmVxdWVzdChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5zdGF0dXMuZ2V0KCksIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblxuXHRcdGluUHJvZ3Jlc3Muc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uc3RhdHVzLmdldCgpLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXG5cdFx0aW5Qcm9ncmVzcy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uc3RhdHVzLmdldCgpLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIHRoZSBzZXNzaW9uIHVucmVhZCB3aGVuIGEgdHJhY2tlZCB0dXJuIGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRTZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cblx0XHRjb25zdCBpblByb2dyZXNzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdpblByb2dyZXNzJywgZmFsc2UpO1xuXHRcdGNoYXRTZXJ2aWNlLnJlZ2lzdGVyTW9kZWwoY3JlYXRlTW9ja01vZGVsKHNlc3Npb24ucmVzb3VyY2UsIHsgcmVxdWVzdEluUHJvZ3Jlc3M6IGluUHJvZ3Jlc3MgfSkpO1xuXHRcdGNoYXRTZXJ2aWNlLmZpcmVTdWJtaXRSZXF1ZXN0KHNlc3Npb24ucmVzb3VyY2UpO1xuXG5cdFx0Ly8gQSBmcmVzaGx5LXRyYWNrZWQsIGlkbGUgc2Vzc2lvbiBpcyByZWFkOyBhIGNvbXBsZXRlZCB0dXJuIGZsaXBzIGl0IHVucmVhZC5cblx0XHRjb25zdCByZWFkQmVmb3JlID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc1JlYWQuZ2V0KCk7XG5cdFx0aW5Qcm9ncmVzcy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRpblByb2dyZXNzLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVhZEJlZm9yZSxcblx0XHRcdHJlYWRBZnRlcjogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc1JlYWQuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVhZEJlZm9yZTogdHJ1ZSxcblx0XHRcdHJlYWRBZnRlcjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG1hcmsgdW5yZWFkIHdoZW4gdGhlIG1vZGVsIHdhcyBuZXZlciBpbiBwcm9ncmVzcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRTZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cblx0XHRjb25zdCBpblByb2dyZXNzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdpblByb2dyZXNzJywgZmFsc2UpO1xuXHRcdGNoYXRTZXJ2aWNlLnJlZ2lzdGVyTW9kZWwoY3JlYXRlTW9ja01vZGVsKHNlc3Npb24ucmVzb3VyY2UsIHsgcmVxdWVzdEluUHJvZ3Jlc3M6IGluUHJvZ3Jlc3MgfSkpO1xuXHRcdC8vIFRyYWNraW5nIHN0YXJ0cyAoaWRsZSkgXHUyMDE0IG5vIGluLXByb2dyZXNzIFx1MjE5MiBpZGxlIHRyYW5zaXRpb24gb2NjdXJzLlxuXHRcdGNoYXRTZXJ2aWNlLmZpcmVTdWJtaXRSZXF1ZXN0KHNlc3Npb24ucmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNSZWFkLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya3MgdGhlIHNlc3Npb24gdW5yZWFkIHdoZW4gdGhlIGZpcnN0IHR1cm4gY29tcGxldGVzIGFmdGVyIG5hdmlnYXRpbmcgYXdheScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRTZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblxuXHRcdC8vIFRoZSBmaXJzdCB0dXJuIGlzIHN0aWxsIHJ1bm5pbmcgd2hlbiBzZW5kIHJlc29sdmVzLCBhbmQgb25seSBjb21wbGV0ZXNcblx0XHQvLyBsYXRlciAoZGVmZXJyZWQpIFx1MjAxNCBtaW1pY2tpbmcgdGhlIHVzZXIgbGVhdmluZyBtaWQtdHVybi5cblx0XHRjaGF0U2VydmljZS5kZWZlckNvbXBsZXRpb24gPSB0cnVlO1xuXHRcdGNoYXRTZXJ2aWNlLm5ld1Nlc3Npb25JblByb2dyZXNzLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVhZEJlZm9yZSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNSZWFkLmdldCgpO1xuXHRcdGNoYXRTZXJ2aWNlLm5ld1Nlc3Npb25JblByb2dyZXNzLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRjaGF0U2VydmljZS5yZXNvbHZlQ29tcGxldGlvbigpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWFkQmVmb3JlLFxuXHRcdFx0cmVhZEFmdGVyOiBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzUmVhZC5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZWFkQmVmb3JlOiB0cnVlLFxuXHRcdFx0cmVhZEFmdGVyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvblJlYWRTdGF0ZSBjbGVhcnMgdW5yZWFkIGFjcm9zcyBldmVyeSBjaGF0IGluIHRoZSBncm91cCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRTZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hpbGRSZXNvdXJjZSA9IGF3YWl0IGFkZENoYXQocHJvdmlkZXIsIHNlc3Npb24pO1xuXG5cdFx0Ly8gQSBjb21wbGV0ZWQgdHVybiBvbiB0aGUgY2hpbGQgbWFrZXMgdGhlIHdob2xlIGdyb3VwIHVucmVhZC5cblx0XHRjb25zdCBjaGlsZEluUHJvZ3Jlc3MgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2NoaWxkSW5Qcm9ncmVzcycsIGZhbHNlKTtcblx0XHRjaGF0U2VydmljZS5yZWdpc3Rlck1vZGVsKGNyZWF0ZU1vY2tNb2RlbChjaGlsZFJlc291cmNlLCB7IHJlcXVlc3RJblByb2dyZXNzOiBjaGlsZEluUHJvZ3Jlc3MgfSkpO1xuXHRcdGNoYXRTZXJ2aWNlLmZpcmVTdWJtaXRSZXF1ZXN0KGNoaWxkUmVzb3VyY2UpO1xuXHRcdGNoaWxkSW5Qcm9ncmVzcy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRjaGlsZEluUHJvZ3Jlc3Muc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVhZEJlZm9yZSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNSZWFkLmdldCgpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbi5zZXNzaW9uSWQsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWFkQmVmb3JlLFxuXHRcdFx0cmVhZEFmdGVyOiBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzUmVhZC5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZWFkQmVmb3JlOiBmYWxzZSxcblx0XHRcdHJlYWRBZnRlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdG9yZWQgc2Vzc2lvbiBwZXJzaXN0ZWQgYmVmb3JlIGlzUmVhZCBleGlzdGVkIGxvYWRzIGFzIHVucmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHN0b3JhZ2UgfSA9IGNyZWF0ZUZpeHR1cmUoc3RvcmUpO1xuXG5cdFx0c3RvcmFnZS5zdG9yZSgnc2Vzc2lvbnMubG9jYWxDaGF0Lm1pZ3JhdGVkJywgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0c3RvcmFnZS5zdG9yZShTVE9SQUdFX0tFWV9TRVNTSU9OUywgSlNPTi5zdHJpbmdpZnkoW3tcblx0XHRcdHVyaTogVVJJLnBhcnNlKCd2c2NvZGUtbG9jYWwtY2hhdDovL2NoYXQvbGVnYWN5JykudG9KU09OKCksXG5cdFx0XHR0aXRsZTogJ0xlZ2FjeScsXG5cdFx0XHRjcmVhdGVkQXQ6IDFfMDAwLFxuXHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiAyXzAwMCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFRFU1RfRk9MREVSLnRvSlNPTigpLFxuXHRcdH1dKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNSZWFkLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0V2ZW50Lk5vbmUgYW5kIGV4cG9ydHMgcmVtYWluIHN0YWJsZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoTG9jYWxTZXNzaW9uVHlwZS5pZCwgJ2xvY2FsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKExPQ0FMX1NFU1NJT05fRU5BQkxFRF9TRVRUSU5HLCAnc2Vzc2lvbnMuY2hhdC5sb2NhbEFnZW50LmVuYWJsZWQnKTtcblx0XHRhc3NlcnQub2soRXZlbnQuTm9uZSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gTXVsdGktY2hhdCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdjb21taXR0ZWQgc2Vzc2lvbnMgYWR2ZXJ0aXNlIHN1cHBvcnRzTXVsdGlwbGVDaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZUZpeHR1cmUoc3RvcmUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjb21taXROZXdTZXNzaW9uKHByb3ZpZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5jaGF0cy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdDaGF0IGFkZHMgYSBzZWNvbmQgY2hhdCB0byBhbiBleGlzdGluZyBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGF3YWl0IGFkZENoYXQocHJvdmlkZXIsIHNlc3Npb24pO1xuXG5cdFx0Ly8gU3RpbGwgb25lIHNlc3Npb24gKHRoZSBncm91cCksIG5vdyB3aXRoIHR3byBjaGF0cy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmNoYXRzLmdldCgpLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIHRoZSBjaGF0IGhpZXJhcmNoeSBhbmQgcmVzdG9yZXMgaXQgZ3JvdXBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZUZpeHR1cmUoc3RvcmUpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjb21taXROZXdTZXNzaW9uKHByb3ZpZGVyKTtcblx0XHRhd2FpdCBhZGRDaGF0KHByb3ZpZGVyLCBzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyMiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHByb3ZpZGVyMi5vbkRpZENoYW5nZVNlc3Npb25zKTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gcHJvdmlkZXIyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkWzBdLnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkWzBdLmNoYXRzLmdldCgpLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUNoYXQgcmVtb3ZlcyBhIGNoaWxkIGNoYXQgYnV0IGtlZXBzIHRoZSBzZXNzaW9uIGFmdGVyIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpYWxvZyB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGNoaWxkUmVzb3VyY2UgPSBhd2FpdCBhZGRDaGF0KHByb3ZpZGVyLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5jaGF0cy5nZXQoKS5sZW5ndGgsIDIpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgY2hpbGRSZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpYWxvZy5jb25maXJtQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQ2hhdCBrZWVwcyB0aGUgY2hpbGQgY2hhdCB3aGVuIHRoZSBjb25maXJtYXRpb24gaXMgY2FuY2VsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgZGlhbG9nIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hpbGRSZXNvdXJjZSA9IGF3YWl0IGFkZENoYXQocHJvdmlkZXIsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmNoYXRzLmdldCgpLmxlbmd0aCwgMik7XG5cblx0XHRkaWFsb2cuY29uZmlybVJlc3VsdCA9IGZhbHNlO1xuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoaWxkUmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFsb2cuY29uZmlybUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5jaGF0cy5nZXQoKS5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVDaGF0IHdpdGggc2tpcENvbmZpcm1hdGlvbiBkZWxldGVzIHdpdGhvdXQgc2hvd2luZyB0aGUgZGlhbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgZGlhbG9nIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cdFx0Y29uc3QgY2hpbGRSZXNvdXJjZSA9IGF3YWl0IGFkZENoYXQocHJvdmlkZXIsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmNoYXRzLmdldCgpLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBkZWxldGVkID0gYXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgY2hpbGRSZXNvdXJjZSwgeyBza2lwQ29uZmlybWF0aW9uOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlhbG9nLmNvbmZpcm1Db3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5jaGF0cy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVDaGF0IHJldHVybnMgZmFsc2Ugd2hlbiB0aGUgY29uZmlybWF0aW9uIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpYWxvZyB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGNoaWxkUmVzb3VyY2UgPSBhd2FpdCBhZGRDaGF0KHByb3ZpZGVyLCBzZXNzaW9uKTtcblxuXHRcdGRpYWxvZy5jb25maXJtUmVzdWx0ID0gZmFsc2U7XG5cdFx0Y29uc3QgZGVsZXRlZCA9IGF3YWl0IHByb3ZpZGVyLmRlbGV0ZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoaWxkUmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUNoYXQgd2l0aCBhbiB1bmtub3duIGNoYXQgVVJJIGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cdFx0YXdhaXQgYWRkQ2hhdChwcm92aWRlciwgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAyKTtcblxuXHRcdC8vIEEgc3RhbGUvaW5jb3JyZWN0IGNoYXQgVVJJIG11c3Qgbm90IHdpcGUgdGhlIHdob2xlIHNlc3Npb24uXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgVVJJLnBhcnNlKCd2c2NvZGUtbG9jYWwtY2hhdDovL2NoYXQvZG9lcy1ub3QtZXhpc3QnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5jaGF0cy5nZXQoKS5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIHJlbW92ZXMgdGhlIHByaW1hcnkgY2hhdCBhbmQgYWxsIGNoaWxkcmVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGF3YWl0IGFkZENoYXQocHJvdmlkZXIsIHNlc3Npb24pO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyMiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMi5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcmVqZWN0ZWQgc3Vic2VxdWVudCBjaGF0IHNlbmQgaXMgcm9sbGVkIGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjaGF0U2VydmljZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGNoYXRTZXJ2aWNlLnJlamVjdFF1ZXJpZXMuYWRkKCdib29tJyk7XG5cblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAyKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnYm9vbScgfSkpO1xuXG5cdFx0Ly8gVGhlIHVuc2VudCBjaGlsZCBpcyByb2xsZWQgYmFjaywgbGVhdmluZyBhIHNpbmdsZSBjaGF0LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgdGhlIHBhcmVudCBsaW5rIGluIHRoZSBjaGlsZCBjaGF0IG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbGVha3MuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmFnZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGNoaWxkUmVzb3VyY2UgPSBhd2FpdCBhZGRDaGF0KHByb3ZpZGVyLCBzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHN0b3JlZCA9IHJlYWRTdG9yZWRTZXNzaW9ucyhzdG9yYWdlKTtcblx0XHRjb25zdCBwcmltYXJ5RW50cnkgPSBzdG9yZWQuZmluZChzID0+IFVSSS5yZXZpdmUocy51cmkpLnRvU3RyaW5nKCkgPT09IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgY2hpbGRFbnRyeSA9IHN0b3JlZC5maW5kKHMgPT4gVVJJLnJldml2ZShzLnVyaSkudG9TdHJpbmcoKSA9PT0gY2hpbGRSZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmltYXJ5RW50cnk/LnBhcmVudFVyaSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soY2hpbGRFbnRyeT8ucGFyZW50VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnJldml2ZShjaGlsZEVudHJ5LnBhcmVudFVyaSEpLnRvU3RyaW5nKCksIHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21vdGVzIGFuIG9ycGhhbmVkIGNoaWxkIHRvIGEgcHJpbWFyeSB3aGVuIGl0cyBwYXJlbnQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGxlYWtzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHN0b3JhZ2UgfSA9IGNyZWF0ZUZpeHR1cmUoc3RvcmUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjb21taXROZXdTZXNzaW9uKHByb3ZpZGVyKTtcblx0XHRjb25zdCBjaGlsZFJlc291cmNlID0gYXdhaXQgYWRkQ2hhdChwcm92aWRlciwgc2Vzc2lvbik7XG5cblx0XHQvLyBTaW11bGF0ZSBjb3JydXB0ZWQvcGFydGlhbCBzdG9yYWdlIHdoZXJlIHRoZSBwcmltYXJ5IGVudHJ5IGlzIGdvbmUuXG5cdFx0Y29uc3Qgd2l0aG91dFByaW1hcnkgPSByZWFkU3RvcmVkU2Vzc2lvbnMoc3RvcmFnZSkuZmlsdGVyKHMgPT4gVVJJLnJldml2ZShzLnVyaSkudG9TdHJpbmcoKSAhPT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRzdG9yYWdlLnN0b3JlKFNUT1JBR0VfS0VZX1NFU1NJT05TLCBKU09OLnN0cmluZ2lmeSh3aXRob3V0UHJpbWFyeSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UocHJvdmlkZXIyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXG5cdFx0Ly8gVGhlIG9ycGhhbiBzdXJmYWNlcyBhcyBpdHMgb3duIHNpbmdsZS1jaGF0IHByaW1hcnkgc2Vzc2lvbiByYXRoZXIgdGhhbiBkaXNhcHBlYXJpbmcuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlcjIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgY2hpbGRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQ2hhdCBvbiB0aGUgcHJpbWFyeSBjaGF0IGRlbGV0ZXMgdGhlIHdob2xlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVGaXh0dXJlKHN0b3JlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29tbWl0TmV3U2Vzc2lvbihwcm92aWRlcik7XG5cdFx0YXdhaXQgYWRkQ2hhdChwcm92aWRlciwgc2Vzc2lvbik7XG5cblx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cCBzdGF0dXMgYWdncmVnYXRlcyBhY3Jvc3MgY2hpbGQgY2hhdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBsZWFrcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjaGF0U2VydmljZSB9ID0gY3JlYXRlRml4dHVyZShzdG9yZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNvbW1pdE5ld1Nlc3Npb24ocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGNoaWxkUmVzb3VyY2UgPSBhd2FpdCBhZGRDaGF0KHByb3ZpZGVyLCBzZXNzaW9uKTtcblxuXHRcdC8vIERyaXZlIHRoZSBjaGlsZCBjaGF0J3MgcmVxdWVzdCBzdGF0ZTsgdGhlIGdyb3VwIG11c3QgcmVmbGVjdCBpdC5cblx0XHRjb25zdCBjaGlsZEluUHJvZ3Jlc3MgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2NoaWxkSW5Qcm9ncmVzcycsIGZhbHNlKTtcblx0XHRjaGF0U2VydmljZS5yZWdpc3Rlck1vZGVsKGNyZWF0ZU1vY2tNb2RlbChjaGlsZFJlc291cmNlLCB7IHJlcXVlc3RJblByb2dyZXNzOiBjaGlsZEluUHJvZ3Jlc3MgfSkpO1xuXHRcdGNoYXRTZXJ2aWNlLmZpcmVTdWJtaXRSZXF1ZXN0KGNoaWxkUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGF0dXMuZ2V0KCksIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblxuXHRcdGNoaWxkSW5Qcm9ncmVzcy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RhdHVzLmdldCgpLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXG5cdFx0Y2hpbGRJblByb2dyZXNzLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RhdHVzLmdldCgpLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFzQix1QkFBdUI7QUFDN0MsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDBCQUEwQjtBQUduQyxTQUE4QixvQkFBa0U7QUFDaEcsU0FBcUMsOEJBQThCO0FBQ25FLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQW1CLHFCQUFxQjtBQUN4QyxTQUFTLDJCQUEyQixrQkFBa0IscUNBQXFDO0FBSTNGLFNBQVMsZ0JB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
