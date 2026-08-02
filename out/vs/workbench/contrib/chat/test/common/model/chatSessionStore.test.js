import assert from "assert";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService, toUserDataProfile } from "../../../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkspaceFolder } from "../../../../../../platform/workspace/common/workspace.js";
import { TestWorkspace, Workspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IWorkspaceEditingService } from "../../../../../services/workspaces/common/workspaceEditing.js";
import { InMemoryTestFileService, TestContextService, TestLifecycleService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatSessionStore } from "../../../common/model/chatSessionStore.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { MockChatModel } from "./mockChatModel.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
function createMockChatModel(sessionResource, options) {
  const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
  if (!sessionId) {
    throw new Error("createMockChatModel requires a local session URI");
  }
  const model = new MockChatModel(sessionResource);
  model.sessionId = sessionId;
  if (options?.customTitle) {
    model.customTitle = options.customTitle;
  }
  return model;
}
class MockWorkspaceEditingService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidEnterWorkspace = this._register(new Emitter());
    this.onDidEnterWorkspace = this._onDidEnterWorkspace.event;
  }
  fireWorkspaceTransition(oldWorkspace, newWorkspace) {
    const promises = [];
    const event = {
      oldWorkspace,
      newWorkspace,
      join: (promise) => promises.push(promise)
    };
    this._onDidEnterWorkspace.fire(event);
    return Promise.all(promises).then(() => {
    });
  }
}
suite("ChatSessionStore", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let mockWorkspaceEditingService;
  function createChatSessionStore(isEmptyWindow = false) {
    const workspace = isEmptyWindow ? new Workspace("empty-window-id", []) : TestWorkspace;
    instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
    return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
  }
  setup(() => {
    instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection()));
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, NullLogService);
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IFileService, testDisposables.add(new InMemoryTestFileService()));
    instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file("/test/workspaceStorage") });
    instantiationService.stub(ILifecycleService, testDisposables.add(new TestLifecycleService()));
    instantiationService.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile("default", "Default", URI.file("/test/userdata"), URI.file("/test/cache")) });
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    mockWorkspaceEditingService = testDisposables.add(new MockWorkspaceEditingService());
    instantiationService.stub(IWorkspaceEditingService, mockWorkspaceEditingService);
  });
  test("hasSessions returns false when no sessions exist", () => {
    const store = createChatSessionStore();
    assert.strictEqual(store.hasSessions(), false);
  });
  test("getIndex returns empty index initially", async () => {
    const store = createChatSessionStore();
    const index = await store.getIndex();
    assert.deepStrictEqual(index, {});
  });
  test("getChatStorageFolder returns correct path for workspace", () => {
    const store = createChatSessionStore(false);
    const storageFolder = store.getChatStorageFolder();
    assert.ok(storageFolder.path.includes("workspaceStorage"));
    assert.ok(storageFolder.path.includes("chatSessions"));
  });
  test("getChatStorageFolder returns correct path for empty window", () => {
    const store = createChatSessionStore(true);
    const storageFolder = store.getChatStorageFolder();
    assert.ok(storageFolder.path.includes("emptyWindowChatSessions"));
  });
  test("isSessionEmpty returns true for non-existent session", () => {
    const store = createChatSessionStore();
    assert.strictEqual(store.isSessionEmpty("non-existent-session"), true);
  });
  test("readSession returns undefined for non-existent session", async () => {
    const store = createChatSessionStore();
    const session = await store.readSession("non-existent-session");
    assert.strictEqual(session, void 0);
  });
  test("deleteSession handles non-existent session gracefully", async () => {
    const store = createChatSessionStore();
    await store.deleteSession("non-existent-session");
    assert.strictEqual(store.hasSessions(), false);
  });
  test("storeSessions persists session to index", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    assert.strictEqual(store.hasSessions(), true);
    const index = await store.getIndex();
    assert.ok(index["session-1"]);
    assert.strictEqual(index["session-1"].sessionId, "session-1");
  });
  test("storeSessions persists custom title", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1"), { customTitle: "My Custom Title" }));
    await store.storeSessions([model]);
    const index = await store.getIndex();
    assert.strictEqual(index["session-1"].title, "My Custom Title");
  });
  test("readSession returns stored session data", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    const session = await store.readSession("session-1");
    assert.ok(session);
    assert.strictEqual(session.value.sessionId, "session-1");
  });
  test("deleteSession removes session from index", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    await store.storeSessions([model]);
    assert.strictEqual(store.hasSessions(), true);
    await store.deleteSession("session-1");
    assert.strictEqual(store.hasSessions(), false);
    const index = await store.getIndex();
    assert.strictEqual(index["session-1"], void 0);
  });
  test("clearAllSessions removes all sessions", async () => {
    const store = createChatSessionStore();
    const model1 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
    const model2 = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-2")));
    await store.storeSessions([model1, model2]);
    assert.strictEqual(Object.keys(await store.getIndex()).length, 2);
    await store.clearAllSessions();
    const index = await store.getIndex();
    assert.deepStrictEqual(index, {});
  });
  test("setSessionTitle updates existing session title", async () => {
    const store = createChatSessionStore();
    const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1"), { customTitle: "Original Title" }));
    await store.storeSessions([model]);
    await store.setSessionTitle("session-1", "New Title");
    const index = await store.getIndex();
    assert.strictEqual(index["session-1"].title, "New Title");
  });
  test("setSessionTitle does nothing for non-existent session", async () => {
    const store = createChatSessionStore();
    await store.setSessionTitle("non-existent", "Title");
    const index = await store.getIndex();
    assert.strictEqual(index["non-existent"], void 0);
  });
  test("multiple stores can be created with different workspaces", async () => {
    const store1 = createChatSessionStore(false);
    const store2 = createChatSessionStore(true);
    const folder1 = store1.getChatStorageFolder();
    const folder2 = store2.getChatStorageFolder();
    assert.notStrictEqual(folder1.toString(), folder2.toString());
  });
  suite("transferred sessions", () => {
    function createSingleFolderWorkspace(folderUri) {
      const folder = new WorkspaceFolder({ uri: folderUri, index: 0, name: "test" });
      return new Workspace("single-folder-id", [folder]);
    }
    function createChatSessionStoreWithSingleFolder(folderUri) {
      instantiationService.stub(IWorkspaceContextService, new TestContextService(createSingleFolderWorkspace(folderUri)));
      return testDisposables.add(instantiationService.createInstance(ChatSessionStore));
    }
    function createTransferData(toWorkspace, sessionResource, timestampInMilliseconds) {
      return {
        toWorkspace,
        sessionResource,
        timestampInMilliseconds: timestampInMilliseconds ?? Date.now()
      };
    }
    test("getTransferredSessionData returns undefined for empty window", () => {
      const store = createChatSessionStore(true);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("getTransferredSessionData returns undefined when no transfer exists", () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("storeTransferSession stores and retrieves transfer data", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const transferData = createTransferData(folderUri, sessionResource);
      await store.storeTransferSession(transferData, model);
      const result = store.getTransferredSessionData();
      assert.ok(result);
      assert.strictEqual(result.toString(), sessionResource.toString());
    });
    test("readTransferredSession returns session data", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const transferData = createTransferData(folderUri, sessionResource);
      await store.storeTransferSession(transferData, model);
      const sessionData = await store.readTransferredSession(sessionResource);
      assert.ok(sessionData);
      assert.strictEqual(sessionData.value.sessionId, "transfer-session");
    });
    test("readTransferredSession cleans up after reading", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const transferData = createTransferData(folderUri, sessionResource);
      await store.storeTransferSession(transferData, model);
      await store.readTransferredSession(sessionResource);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("getTransferredSessionData returns undefined for expired transfer", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const expiredTimestamp = Date.now() - 10 * 60 * 1e3;
      const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
      await store.storeTransferSession(transferData, model);
      const result = store.getTransferredSessionData();
      assert.strictEqual(result, void 0);
    });
    test("expired transfer cleans up index and file", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const sessionResource = LocalChatSessionUri.forSession("transfer-session");
      const model = testDisposables.add(createMockChatModel(sessionResource));
      const expiredTimestamp = Date.now() - 100 * 60 * 1e3;
      const transferData = createTransferData(folderUri, sessionResource, expiredTimestamp);
      await store.storeTransferSession(transferData, model);
      const data = store.getTransferredSessionData();
      assert.strictEqual(data, void 0);
    });
    test("readTransferredSession returns undefined for invalid session resource", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const invalidResource = URI.parse("file:///invalid/session");
      const result = await store.readTransferredSession(invalidResource);
      assert.strictEqual(result, void 0);
    });
    test("storeTransferSession deletes preexisting transferred session file", async () => {
      const folderUri = URI.file("/test/workspace");
      const store = createChatSessionStoreWithSingleFolder(folderUri);
      const fileService = instantiationService.get(IFileService);
      const session1Resource = LocalChatSessionUri.forSession("transfer-session-1");
      const model1 = testDisposables.add(createMockChatModel(session1Resource));
      const transferData1 = createTransferData(folderUri, session1Resource);
      await store.storeTransferSession(transferData1, model1);
      const userDataProfile = instantiationService.get(IUserDataProfilesService).defaultProfile;
      const storageLocation1 = URI.joinPath(
        userDataProfile.globalStorageHome,
        "transferredChatSessions",
        "transfer-session-1.json"
      );
      const exists1 = await fileService.exists(storageLocation1);
      assert.strictEqual(exists1, true, "First session file should exist");
      const session2Resource = LocalChatSessionUri.forSession("transfer-session-2");
      const model2 = testDisposables.add(createMockChatModel(session2Resource));
      const transferData2 = createTransferData(folderUri, session2Resource);
      await store.storeTransferSession(transferData2, model2);
      const exists1After = await fileService.exists(storageLocation1);
      assert.strictEqual(exists1After, false, "First session file should be deleted");
      const storageLocation2 = URI.joinPath(
        userDataProfile.globalStorageHome,
        "transferredChatSessions",
        "transfer-session-2.json"
      );
      const exists2 = await fileService.exists(storageLocation2);
      assert.strictEqual(exists2, true, "Second session file should exist");
      const result = store.getTransferredSessionData();
      assert.ok(result);
      assert.strictEqual(result.toString(), session2Resource.toString());
    });
  });
  suite("workspace migration", () => {
    test("migration is triggered when onDidEnterWorkspace fires", async () => {
      const fileService = instantiationService.get(IFileService);
      const store = createChatSessionStore(true);
      const model = testDisposables.add(createMockChatModel(LocalChatSessionUri.forSession("session-1")));
      await store.storeSessions([model]);
      assert.strictEqual(store.hasSessions(), true);
      const emptyWindowStorageRoot = store.getChatStorageFolder();
      const sessionFile = URI.joinPath(emptyWindowStorageRoot, "session-1.json");
      const fileExists = await fileService.exists(sessionFile);
      assert.strictEqual(fileExists, true, "Session file should exist in empty window storage");
      const oldWorkspace = { id: "empty-window-id" };
      const newWorkspace = { id: TestWorkspace.id, uri: URI.file("/test/folder") };
      await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
      const newStorageRoot = store.getChatStorageFolder();
      const migratedSessionFile = URI.joinPath(newStorageRoot, "session-1.json");
      const migratedFileExists = await fileService.exists(migratedSessionFile);
      assert.strictEqual(migratedFileExists, true, "Session file should be migrated to workspace storage");
    });
    test("migration handles non-existent old storage location gracefully", async () => {
      const store = createChatSessionStore(false);
      const oldWorkspace = { id: "non-existent-workspace-id" };
      const newWorkspace = { id: "new-workspace-id" };
      await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
      assert.strictEqual(store.hasSessions(), false);
    });
    test("storage root is updated after workspace transition", async () => {
      const store = createChatSessionStore(true);
      const initialStorageRoot = store.getChatStorageFolder();
      assert.ok(initialStorageRoot.path.includes("emptyWindowChatSessions"), "Initial storage should be empty window location");
      const oldWorkspace = { id: "empty-window-id" };
      const newWorkspace = { id: "new-workspace-id", uri: URI.file("/test/folder") };
      await mockWorkspaceEditingService.fireWorkspaceTransition(oldWorkspace, newWorkspace);
      const newStorageRoot = store.getChatStorageFolder();
      assert.ok(newStorageRoot.path.includes("new-workspace-id"), "Storage root should be updated to new workspace location");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvY2hhdFNlc3Npb25TdG9yZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdG9Vc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBUZXN0V29ya3NwYWNlLCBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElEaWRFbnRlcldvcmtzcGFjZUV2ZW50LCBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5VGVzdEZpbGVTZXJ2aWNlLCBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RMaWZlY3ljbGVTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsLCBJU2VyaWFsaXphYmxlQ2hhdERhdGEzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0b3JlLCBJQ2hhdFRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRTZXNzaW9uU3RvcmUuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZWwgfSBmcm9tICcuL21vY2tDaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbnM/OiB7IGN1c3RvbVRpdGxlPzogc3RyaW5nIH0pOiBDaGF0TW9kZWwge1xuXHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NyZWF0ZU1vY2tDaGF0TW9kZWwgcmVxdWlyZXMgYSBsb2NhbCBzZXNzaW9uIFVSSScpO1xuXHR9XG5cdGNvbnN0IG1vZGVsID0gbmV3IE1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlKTtcblx0bW9kZWwuc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXHRpZiAob3B0aW9ucz8uY3VzdG9tVGl0bGUpIHtcblx0XHRtb2RlbC5jdXN0b21UaXRsZSA9IG9wdGlvbnMuY3VzdG9tVGl0bGU7XG5cdH1cblx0Ly8gQ2FzdCB0byBDaGF0TW9kZWwgLSB0aGUgbW9jayBpbXBsZW1lbnRzIGVub3VnaCBvZiB0aGUgaW50ZXJmYWNlIGZvciB0ZXN0aW5nXG5cdHJldHVybiBtb2RlbCBhcyB1bmtub3duIGFzIENoYXRNb2RlbDtcbn1cblxuY2xhc3MgTW9ja1dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIFBhcnRpYWw8SVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW50ZXJXb3Jrc3BhY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGlkRW50ZXJXb3Jrc3BhY2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW50ZXJXb3Jrc3BhY2UgPSB0aGlzLl9vbkRpZEVudGVyV29ya3NwYWNlLmV2ZW50O1xuXG5cdGZpcmVXb3Jrc3BhY2VUcmFuc2l0aW9uKG9sZFdvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIG5ld1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Y29uc3QgZXZlbnQ6IElEaWRFbnRlcldvcmtzcGFjZUV2ZW50ID0ge1xuXHRcdFx0b2xkV29ya3NwYWNlLFxuXHRcdFx0bmV3V29ya3NwYWNlLFxuXHRcdFx0am9pbjogKHByb21pc2U6IFByb21pc2U8dm9pZD4pID0+IHByb21pc2VzLnB1c2gocHJvbWlzZSlcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkRW50ZXJXb3Jrc3BhY2UuZmlyZShldmVudCk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHsgfSk7XG5cdH1cbn1cblxuc3VpdGUoJ0NoYXRTZXNzaW9uU3RvcmUnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgbW9ja1dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlOiBNb2NrV29ya3NwYWNlRWRpdGluZ1NlcnZpY2U7XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZShpc0VtcHR5V2luZG93OiBib29sZWFuID0gZmFsc2UpOiBDaGF0U2Vzc2lvblN0b3JlIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBpc0VtcHR5V2luZG93ID8gbmV3IFdvcmtzcGFjZSgnZW1wdHktd2luZG93LWlkJywgW10pIDogVGVzdFdvcmtzcGFjZTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSh3b3Jrc3BhY2UpKTtcblx0XHRyZXR1cm4gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvblN0b3JlKSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVRlc3RGaWxlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IHdvcmtzcGFjZVN0b3JhZ2VIb21lOiBVUkkuZmlsZSgnL3Rlc3Qvd29ya3NwYWNlU3RvcmFnZScpIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgeyBkZWZhdWx0UHJvZmlsZTogdG9Vc2VyRGF0YVByb2ZpbGUoJ2RlZmF1bHQnLCAnRGVmYXVsdCcsIFVSSS5maWxlKCcvdGVzdC91c2VyZGF0YScpLCBVUkkuZmlsZSgnL3Rlc3QvY2FjaGUnKSkgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0bW9ja1dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1dvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLCBtb2NrV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgYXMgdW5rbm93biBhcyBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNTZXNzaW9ucyByZXR1cm5zIGZhbHNlIHdoZW4gbm8gc2Vzc2lvbnMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRJbmRleCByZXR1cm5zIGVtcHR5IGluZGV4IGluaXRpYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblxuXHRcdGNvbnN0IGluZGV4ID0gYXdhaXQgc3RvcmUuZ2V0SW5kZXgoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluZGV4LCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENoYXRTdG9yYWdlRm9sZGVyIHJldHVybnMgY29ycmVjdCBwYXRoIGZvciB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKGZhbHNlKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2VGb2xkZXIgPSBzdG9yZS5nZXRDaGF0U3RvcmFnZUZvbGRlcigpO1xuXHRcdGFzc2VydC5vayhzdG9yYWdlRm9sZGVyLnBhdGguaW5jbHVkZXMoJ3dvcmtzcGFjZVN0b3JhZ2UnKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JhZ2VGb2xkZXIucGF0aC5pbmNsdWRlcygnY2hhdFNlc3Npb25zJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDaGF0U3RvcmFnZUZvbGRlciByZXR1cm5zIGNvcnJlY3QgcGF0aCBmb3IgZW1wdHkgd2luZG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSh0cnVlKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2VGb2xkZXIgPSBzdG9yZS5nZXRDaGF0U3RvcmFnZUZvbGRlcigpO1xuXHRcdGFzc2VydC5vayhzdG9yYWdlRm9sZGVyLnBhdGguaW5jbHVkZXMoJ2VtcHR5V2luZG93Q2hhdFNlc3Npb25zJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1Nlc3Npb25FbXB0eSByZXR1cm5zIHRydWUgZm9yIG5vbi1leGlzdGVudCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmlzU2Vzc2lvbkVtcHR5KCdub24tZXhpc3RlbnQtc2Vzc2lvbicpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZFNlc3Npb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1leGlzdGVudCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHN0b3JlLnJlYWRTZXNzaW9uKCdub24tZXhpc3RlbnQtc2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIGhhbmRsZXMgbm9uLWV4aXN0ZW50IHNlc3Npb24gZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRhd2FpdCBzdG9yZS5kZWxldGVTZXNzaW9uKCdub24tZXhpc3RlbnQtc2Vzc2lvbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmhhc1Nlc3Npb25zKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcmVTZXNzaW9ucyBwZXJzaXN0cyBzZXNzaW9uIHRvIGluZGV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc2Vzc2lvbi0xJykpKTtcblxuXHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCBzdG9yZS5nZXRJbmRleCgpO1xuXHRcdGFzc2VydC5vayhpbmRleFsnc2Vzc2lvbi0xJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRleFsnc2Vzc2lvbi0xJ10uc2Vzc2lvbklkLCAnc2Vzc2lvbi0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3JlU2Vzc2lvbnMgcGVyc2lzdHMgY3VzdG9tIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignc2Vzc2lvbi0xJyksIHsgY3VzdG9tVGl0bGU6ICdNeSBDdXN0b20gVGl0bGUnIH0pKTtcblxuXHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4WydzZXNzaW9uLTEnXS50aXRsZSwgJ015IEN1c3RvbSBUaXRsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkU2Vzc2lvbiByZXR1cm5zIHN0b3JlZCBzZXNzaW9uIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTEnKSkpO1xuXG5cdFx0YXdhaXQgc3RvcmUuc3RvcmVTZXNzaW9ucyhbbW9kZWxdKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc3RvcmUucmVhZFNlc3Npb24oJ3Nlc3Npb24tMScpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc2Vzc2lvbi52YWx1ZSBhcyBJU2VyaWFsaXphYmxlQ2hhdERhdGEzKS5zZXNzaW9uSWQsICdzZXNzaW9uLTEnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlU2Vzc2lvbiByZW1vdmVzIHNlc3Npb24gZnJvbSBpbmRleCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpKSk7XG5cblx0XHRhd2FpdCBzdG9yZS5zdG9yZVNlc3Npb25zKFttb2RlbF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5oYXNTZXNzaW9ucygpLCB0cnVlKTtcblxuXHRcdGF3YWl0IHN0b3JlLmRlbGV0ZVNlc3Npb24oJ3Nlc3Npb24tMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmhhc1Nlc3Npb25zKCksIGZhbHNlKTtcblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4WydzZXNzaW9uLTEnXSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJBbGxTZXNzaW9ucyByZW1vdmVzIGFsbCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbDEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTEnKSkpO1xuXHRcdGNvbnN0IG1vZGVsMiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMicpKSk7XG5cblx0XHRhd2FpdCBzdG9yZS5zdG9yZVNlc3Npb25zKFttb2RlbDEsIG1vZGVsMl0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyhhd2FpdCBzdG9yZS5nZXRJbmRleCgpKS5sZW5ndGgsIDIpO1xuXG5cdFx0YXdhaXQgc3RvcmUuY2xlYXJBbGxTZXNzaW9ucygpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCBzdG9yZS5nZXRJbmRleCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5kZXgsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvblRpdGxlIHVwZGF0ZXMgZXhpc3Rpbmcgc2Vzc2lvbiB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpLCB7IGN1c3RvbVRpdGxlOiAnT3JpZ2luYWwgVGl0bGUnIH0pKTtcblxuXHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cdFx0YXdhaXQgc3RvcmUuc2V0U2Vzc2lvblRpdGxlKCdzZXNzaW9uLTEnLCAnTmV3IFRpdGxlJyk7XG5cblx0XHRjb25zdCBpbmRleCA9IGF3YWl0IHN0b3JlLmdldEluZGV4KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZGV4WydzZXNzaW9uLTEnXS50aXRsZSwgJ05ldyBUaXRsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRTZXNzaW9uVGl0bGUgZG9lcyBub3RoaW5nIGZvciBub24tZXhpc3RlbnQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRhd2FpdCBzdG9yZS5zZXRTZXNzaW9uVGl0bGUoJ25vbi1leGlzdGVudCcsICdUaXRsZScpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCBzdG9yZS5nZXRJbmRleCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRleFsnbm9uLWV4aXN0ZW50J10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHN0b3JlcyBjYW4gYmUgY3JlYXRlZCB3aXRoIGRpZmZlcmVudCB3b3Jrc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlMSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoZmFsc2UpO1xuXHRcdGNvbnN0IHN0b3JlMiA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUodHJ1ZSk7XG5cblx0XHRjb25zdCBmb2xkZXIxID0gc3RvcmUxLmdldENoYXRTdG9yYWdlRm9sZGVyKCk7XG5cdFx0Y29uc3QgZm9sZGVyMiA9IHN0b3JlMi5nZXRDaGF0U3RvcmFnZUZvbGRlcigpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZvbGRlcjEudG9TdHJpbmcoKSwgZm9sZGVyMi50b1N0cmluZygpKTtcblx0fSk7XG5cblx0c3VpdGUoJ3RyYW5zZmVycmVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZVNpbmdsZUZvbGRlcldvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IFdvcmtzcGFjZSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBuZXcgV29ya3NwYWNlRm9sZGVyKHsgdXJpOiBmb2xkZXJVcmksIGluZGV4OiAwLCBuYW1lOiAndGVzdCcgfSk7XG5cdFx0XHRyZXR1cm4gbmV3IFdvcmtzcGFjZSgnc2luZ2xlLWZvbGRlci1pZCcsIFtmb2xkZXJdKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlV2l0aFNpbmdsZUZvbGRlcihmb2xkZXJVcmk6IFVSSSk6IENoYXRTZXNzaW9uU3RvcmUge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoY3JlYXRlU2luZ2xlRm9sZGVyV29ya3NwYWNlKGZvbGRlclVyaSkpKTtcblx0XHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uU3RvcmUpKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVUcmFuc2ZlckRhdGEodG9Xb3Jrc3BhY2U6IFVSSSwgc2Vzc2lvblJlc291cmNlOiBVUkksIHRpbWVzdGFtcEluTWlsbGlzZWNvbmRzPzogbnVtYmVyKTogSUNoYXRUcmFuc2ZlciB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b1dvcmtzcGFjZSxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0aW1lc3RhbXBJbk1pbGxpc2Vjb25kczogdGltZXN0YW1wSW5NaWxsaXNlY29uZHMgPz8gRGF0ZS5ub3coKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSByZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgd2luZG93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlKHRydWUpOyAvLyBlbXB0eSB3aW5kb3dcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHRyYW5zZmVyIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmVUcmFuc2ZlclNlc3Npb24gc3RvcmVzIGFuZCByZXRyaWV2ZXMgdHJhbnNmZXIgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndHJhbnNmZXItc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlKSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRUcmFuc2ZlcnJlZFNlc3Npb24gcmV0dXJucyBzZXNzaW9uIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3Rlc3Qvd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmVXaXRoU2luZ2xlRm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3RyYW5zZmVyLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKHNlc3Npb25SZXNvdXJjZSkpO1xuXG5cdFx0XHRjb25zdCB0cmFuc2ZlckRhdGEgPSBjcmVhdGVUcmFuc2ZlckRhdGEoZm9sZGVyVXJpLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgc3RvcmUuc3RvcmVUcmFuc2ZlclNlc3Npb24odHJhbnNmZXJEYXRhLCBtb2RlbCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhID0gYXdhaXQgc3RvcmUucmVhZFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25EYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc2Vzc2lvbkRhdGEudmFsdWUgYXMgSVNlcmlhbGl6YWJsZUNoYXREYXRhMykuc2Vzc2lvbklkLCAndHJhbnNmZXItc2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZFRyYW5zZmVycmVkU2Vzc2lvbiBjbGVhbnMgdXAgYWZ0ZXIgcmVhZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndHJhbnNmZXItc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvblJlc291cmNlKSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Ly8gUmVhZCB0aGUgc2Vzc2lvblxuXHRcdFx0YXdhaXQgc3RvcmUucmVhZFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBUcmFuc2ZlciBzaG91bGQgYmUgY2xlYW5lZCB1cFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFRyYW5zZmVycmVkU2Vzc2lvbkRhdGEgcmV0dXJucyB1bmRlZmluZWQgZm9yIGV4cGlyZWQgdHJhbnNmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL3Rlc3Qvd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmVXaXRoU2luZ2xlRm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3RyYW5zZmVyLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKHNlc3Npb25SZXNvdXJjZSkpO1xuXG5cdFx0XHQvLyBDcmVhdGUgdHJhbnNmZXIgd2l0aCB0aW1lc3RhbXAgMTAgbWludXRlcyBpbiB0aGUgcGFzdCAoZXhwaXJlZClcblx0XHRcdGNvbnN0IGV4cGlyZWRUaW1lc3RhbXAgPSBEYXRlLm5vdygpIC0gKDEwICogNjAgKiAxMDAwKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSwgZXhwaXJlZFRpbWVzdGFtcCk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cGlyZWQgdHJhbnNmZXIgY2xlYW5zIHVwIGluZGV4IGFuZCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLmZpbGUoJy90ZXN0L3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBjcmVhdGVDaGF0U2Vzc2lvblN0b3JlV2l0aFNpbmdsZUZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0cmFuc2Zlci1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChzZXNzaW9uUmVzb3VyY2UpKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRyYW5zZmVyIHdpdGggdGltZXN0YW1wIDEwMCBtaW51dGVzIGluIHRoZSBwYXN0IChleHBpcmVkKVxuXHRcdFx0Y29uc3QgZXhwaXJlZFRpbWVzdGFtcCA9IERhdGUubm93KCkgLSAoMTAwICogNjAgKiAxMDAwKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YSA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb25SZXNvdXJjZSwgZXhwaXJlZFRpbWVzdGFtcCk7XG5cdFx0XHRhd2FpdCBzdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGEsIG1vZGVsKTtcblxuXHRcdFx0Ly8gQXNzZXJ0IGNsZWFuZWQgdXBcblx0XHRcdGNvbnN0IGRhdGEgPSBzdG9yZS5nZXRUcmFuc2ZlcnJlZFNlc3Npb25EYXRhKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRUcmFuc2ZlcnJlZFNlc3Npb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgc2Vzc2lvbiByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblxuXHRcdFx0Ly8gVXNlIGEgbm9uLWxvY2FsIHNlc3Npb24gVVJJXG5cdFx0XHRjb25zdCBpbnZhbGlkUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vaW52YWxpZC9zZXNzaW9uJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0b3JlLnJlYWRUcmFuc2ZlcnJlZFNlc3Npb24oaW52YWxpZFJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9yZVRyYW5zZmVyU2Vzc2lvbiBkZWxldGVzIHByZWV4aXN0aW5nIHRyYW5zZmVycmVkIHNlc3Npb24gZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvdGVzdC93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZVdpdGhTaW5nbGVGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRcdC8vIFN0b3JlIGZpcnN0IHNlc3Npb25cblx0XHRcdGNvbnN0IHNlc3Npb24xUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3RyYW5zZmVyLXNlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgbW9kZWwxID0gdGVzdERpc3Bvc2FibGVzLmFkZChjcmVhdGVNb2NrQ2hhdE1vZGVsKHNlc3Npb24xUmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVyRGF0YTEgPSBjcmVhdGVUcmFuc2ZlckRhdGEoZm9sZGVyVXJpLCBzZXNzaW9uMVJlc291cmNlKTtcblx0XHRcdGF3YWl0IHN0b3JlLnN0b3JlVHJhbnNmZXJTZXNzaW9uKHRyYW5zZmVyRGF0YTEsIG1vZGVsMSk7XG5cblx0XHRcdC8vIFZlcmlmeSBmaXJzdCBzZXNzaW9uIGZpbGUgZXhpc3RzXG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbjEgPSBVUkkuam9pblBhdGgoXG5cdFx0XHRcdHVzZXJEYXRhUHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSxcblx0XHRcdFx0J3RyYW5zZmVycmVkQ2hhdFNlc3Npb25zJyxcblx0XHRcdFx0J3RyYW5zZmVyLXNlc3Npb24tMS5qc29uJ1xuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGV4aXN0czEgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc3RvcmFnZUxvY2F0aW9uMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzMSwgdHJ1ZSwgJ0ZpcnN0IHNlc3Npb24gZmlsZSBzaG91bGQgZXhpc3QnKTtcblxuXHRcdFx0Ly8gU3RvcmUgc2Vjb25kIHNlc3Npb24gZm9yIHRoZSBzYW1lIHdvcmtzcGFjZVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbjJSZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndHJhbnNmZXItc2Vzc2lvbi0yJyk7XG5cdFx0XHRjb25zdCBtb2RlbDIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vY2tDaGF0TW9kZWwoc2Vzc2lvbjJSZXNvdXJjZSkpO1xuXHRcdFx0Y29uc3QgdHJhbnNmZXJEYXRhMiA9IGNyZWF0ZVRyYW5zZmVyRGF0YShmb2xkZXJVcmksIHNlc3Npb24yUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgc3RvcmUuc3RvcmVUcmFuc2ZlclNlc3Npb24odHJhbnNmZXJEYXRhMiwgbW9kZWwyKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGZpcnN0IHNlc3Npb24gZmlsZSBpcyBkZWxldGVkXG5cdFx0XHRjb25zdCBleGlzdHMxQWZ0ZXIgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc3RvcmFnZUxvY2F0aW9uMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzMUFmdGVyLCBmYWxzZSwgJ0ZpcnN0IHNlc3Npb24gZmlsZSBzaG91bGQgYmUgZGVsZXRlZCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgc2Vjb25kIHNlc3Npb24gZmlsZSBleGlzdHNcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbjIgPSBVUkkuam9pblBhdGgoXG5cdFx0XHRcdHVzZXJEYXRhUHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSxcblx0XHRcdFx0J3RyYW5zZmVycmVkQ2hhdFNlc3Npb25zJyxcblx0XHRcdFx0J3RyYW5zZmVyLXNlc3Npb24tMi5qc29uJ1xuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGV4aXN0czIgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc3RvcmFnZUxvY2F0aW9uMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzMiwgdHJ1ZSwgJ1NlY29uZCBzZXNzaW9uIGZpbGUgc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdC8vIFZlcmlmeSBvbmx5IHRoZSBzZWNvbmQgc2Vzc2lvbiBpcyByZXRyaWV2YWJsZVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksIHNlc3Npb24yUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd3b3Jrc3BhY2UgbWlncmF0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ21pZ3JhdGlvbiBpcyB0cmlnZ2VyZWQgd2hlbiBvbkRpZEVudGVyV29ya3NwYWNlIGZpcmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKSBhcyBJbk1lbW9yeVRlc3RGaWxlU2VydmljZTtcblxuXHRcdFx0Ly8gQ3JlYXRlIHN0b3JlIHdpdGggZW1wdHkgd2luZG93XG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUodHJ1ZSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9ja0NoYXRNb2RlbChMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMScpKSk7XG5cblx0XHRcdC8vIFN0b3JlIGEgc2Vzc2lvbiBpbiBlbXB0eSB3aW5kb3dcblx0XHRcdGF3YWl0IHN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEdldCB0aGUgZmlsZSBwYXRoIGZvciB0aGUgc2Vzc2lvbiBpbiBlbXB0eSB3aW5kb3cgc3RvcmFnZVxuXHRcdFx0Y29uc3QgZW1wdHlXaW5kb3dTdG9yYWdlUm9vdCA9IHN0b3JlLmdldENoYXRTdG9yYWdlRm9sZGVyKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRmlsZSA9IFVSSS5qb2luUGF0aChlbXB0eVdpbmRvd1N0b3JhZ2VSb290LCAnc2Vzc2lvbi0xLmpzb24nKTtcblx0XHRcdGNvbnN0IGZpbGVFeGlzdHMgPSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoc2Vzc2lvbkZpbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFeGlzdHMsIHRydWUsICdTZXNzaW9uIGZpbGUgc2hvdWxkIGV4aXN0IGluIGVtcHR5IHdpbmRvdyBzdG9yYWdlJyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHdvcmtzcGFjZSB0cmFuc2l0aW9uIHZpYSB0aGUgb25EaWRFbnRlcldvcmtzcGFjZSBldmVudFxuXHRcdFx0Y29uc3Qgb2xkV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6ICdlbXB0eS13aW5kb3ctaWQnIH07XG5cdFx0XHRjb25zdCBuZXdXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyID0geyBpZDogVGVzdFdvcmtzcGFjZS5pZCwgdXJpOiBVUkkuZmlsZSgnL3Rlc3QvZm9sZGVyJykgfTtcblxuXHRcdFx0Ly8gRmlyZSB0aGUgd29ya3NwYWNlIHRyYW5zaXRpb24gZXZlbnQgLSBtaWdyYXRpb24gaGFwcGVucyBzeW5jaHJvbm91c2x5IHZpYSBqb2luKClcblx0XHRcdGF3YWl0IG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5maXJlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdC8vIFZlcmlmeSBmaWxlIHdhcyBjb3BpZWQgdG8gbmV3IGxvY2F0aW9uXG5cdFx0XHRjb25zdCBuZXdTdG9yYWdlUm9vdCA9IHN0b3JlLmdldENoYXRTdG9yYWdlRm9sZGVyKCk7XG5cdFx0XHRjb25zdCBtaWdyYXRlZFNlc3Npb25GaWxlID0gVVJJLmpvaW5QYXRoKG5ld1N0b3JhZ2VSb290LCAnc2Vzc2lvbi0xLmpzb24nKTtcblx0XHRcdGNvbnN0IG1pZ3JhdGVkRmlsZUV4aXN0cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhtaWdyYXRlZFNlc3Npb25GaWxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWdyYXRlZEZpbGVFeGlzdHMsIHRydWUsICdTZXNzaW9uIGZpbGUgc2hvdWxkIGJlIG1pZ3JhdGVkIHRvIHdvcmtzcGFjZSBzdG9yYWdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRpb24gaGFuZGxlcyBub24tZXhpc3RlbnQgb2xkIHN0b3JhZ2UgbG9jYXRpb24gZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBzdG9yZSB3aXRoIGEgd29ya3NwYWNlXG5cdFx0XHRjb25zdCBzdG9yZSA9IGNyZWF0ZUNoYXRTZXNzaW9uU3RvcmUoZmFsc2UpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB3b3Jrc3BhY2UgdHJhbnNpdGlvbiBmcm9tIGEgbm9uLWV4aXN0ZW50IHdvcmtzcGFjZVxuXHRcdFx0Y29uc3Qgb2xkV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6ICdub24tZXhpc3RlbnQtd29ya3NwYWNlLWlkJyB9O1xuXHRcdFx0Y29uc3QgbmV3V29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6ICduZXctd29ya3NwYWNlLWlkJyB9O1xuXG5cdFx0XHQvLyBGaXJlIHRoZSB3b3Jrc3BhY2UgdHJhbnNpdGlvbiBldmVudCAtIHNob3VsZCBub3QgY3Jhc2hcblx0XHRcdGF3YWl0IG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5maXJlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdC8vIFN0b3JlIHNob3VsZCB3b3JrIG5vcm1hbGx5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaGFzU2Vzc2lvbnMoKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmFnZSByb290IGlzIHVwZGF0ZWQgYWZ0ZXIgd29ya3NwYWNlIHRyYW5zaXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDcmVhdGUgc3RvcmUgd2l0aCBlbXB0eSB3aW5kb3dcblx0XHRcdGNvbnN0IHN0b3JlID0gY3JlYXRlQ2hhdFNlc3Npb25TdG9yZSh0cnVlKTtcblxuXHRcdFx0Y29uc3QgaW5pdGlhbFN0b3JhZ2VSb290ID0gc3RvcmUuZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTtcblx0XHRcdGFzc2VydC5vayhpbml0aWFsU3RvcmFnZVJvb3QucGF0aC5pbmNsdWRlcygnZW1wdHlXaW5kb3dDaGF0U2Vzc2lvbnMnKSwgJ0luaXRpYWwgc3RvcmFnZSBzaG91bGQgYmUgZW1wdHkgd2luZG93IGxvY2F0aW9uJyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHdvcmtzcGFjZSB0cmFuc2l0aW9uIC0gdXNlIHByb3BlciBpZGVudGlmaWVyIHR5cGVzXG5cdFx0XHQvLyBFbXB0eSB3b3Jrc3BhY2Ugb25seSBoYXMgJ2lkJywgc2luZ2xlIGZvbGRlciBoYXMgJ3VyaScgcHJvcGVydHkgdG9vXG5cdFx0XHRjb25zdCBvbGRXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyID0geyBpZDogJ2VtcHR5LXdpbmRvdy1pZCcgfTtcblx0XHRcdGNvbnN0IG5ld1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgPSB7IGlkOiAnbmV3LXdvcmtzcGFjZS1pZCcsIHVyaTogVVJJLmZpbGUoJy90ZXN0L2ZvbGRlcicpIH07XG5cblx0XHRcdGF3YWl0IG1vY2tXb3Jrc3BhY2VFZGl0aW5nU2VydmljZS5maXJlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cblx0XHRcdGNvbnN0IG5ld1N0b3JhZ2VSb290ID0gc3RvcmUuZ2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTtcblx0XHRcdGFzc2VydC5vayhuZXdTdG9yYWdlUm9vdC5wYXRoLmluY2x1ZGVzKCduZXctd29ya3NwYWNlLWlkJyksICdTdG9yYWdlIHJvb3Qgc2hvdWxkIGJlIHVwZGF0ZWQgdG8gbmV3IHdvcmtzcGFjZSBsb2NhdGlvbicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQix5QkFBeUI7QUFDNUQsU0FBa0MsMEJBQTBCLHVCQUF1QjtBQUNuRixTQUFTLGVBQWUsaUJBQWlCO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQWtDLGdDQUFnQztBQUNsRSxTQUFTLHlCQUF5QixvQkFBb0Isc0JBQXNCLDBCQUEwQjtBQUV0RyxTQUFTLHdCQUF1QztBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLG9CQUFvQixpQkFBc0IsU0FBK0M7QUFDakcsUUFBTSxZQUFZLG9CQUFvQixvQkFBb0IsZUFBZTtBQUN6RSxNQUFJLENBQUMsV0FBVztBQUNmLFVBQU0sSUFBSSxNQUFNLGtEQUFrRDtBQUFBLEVBQ25FO0FBQ0EsUUFBTSxRQUFRLElBQUksY0FBYyxlQUFl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
