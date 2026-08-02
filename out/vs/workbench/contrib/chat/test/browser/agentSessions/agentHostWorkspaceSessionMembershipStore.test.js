import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { AgentHostWorkspaceSessionMembershipStore } from "../../../browser/agentSessions/agentHost/agentHostWorkspaceSessionMembershipStore.js";
suite("AgentHostWorkspaceSessionMembershipStore", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class TestMembershipStore extends AgentHostWorkspaceSessionMembershipStore {
    constructor(_now, storageService, workspaceContextService, isSessionsWindow = false) {
      super(storageService, workspaceContextService, new NullLogService(), { isSessionsWindow });
      this._now = _now;
    }
    now() {
      return this._now();
    }
  }
  class TestWorkspaceContextService extends mock() {
    constructor() {
      super(...arguments);
      this.state = WorkbenchState.WORKSPACE;
      this.folders = [];
      this.onDidChangeWorkspaceFolders = Event.None;
    }
    getWorkbenchState() {
      return this.state;
    }
    getWorkspace() {
      return upcastPartial({
        id: "workspace",
        folders: this.folders.map((uri, index) => ({ uri, index, name: uri.path, toResource: (path) => URI.joinPath(uri, path) }))
      });
    }
  }
  test("workspace membership survives folder and directory-set transitions", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    const c = URI.file("/workspace/c");
    const d = URI.file("/workspace/d");
    workspaceService.folders = [a, b];
    const store = new TestMembershipStore(() => 1e3, storageService, workspaceService);
    const key = "copilot://session";
    const initial = store.shouldInclude(key, [a, b], false);
    store.reconcileBackendSessions([key]);
    const restoredStore = new TestMembershipStore(() => 1e3, storageService, workspaceService);
    workspaceService.folders = [c, d];
    const changedWorkspace = restoredStore.shouldInclude(key, [a, b], false);
    workspaceService.folders = [c];
    const singleFolder = restoredStore.shouldInclude(key, [a, b], false);
    workspaceService.folders = [c, d];
    const shrunkSession = restoredStore.shouldInclude(key, [a], false);
    const expandedAgain = restoredStore.shouldInclude(key, [a, b], false);
    restoredStore.remove(key);
    const afterDelete = restoredStore.shouldInclude(key, [a, b], false);
    assert.deepStrictEqual({
      initial,
      changedWorkspace,
      singleFolder,
      shrunkSession,
      expandedAgain,
      afterDelete
    }, {
      initial: true,
      changedWorkspace: true,
      singleFolder: false,
      shrunkSession: false,
      expandedAgain: true,
      afterDelete: false
    });
  });
  test("records only eligible multi-root session provenance", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    const c = URI.file("/workspace/c");
    const d = URI.file("/workspace/d");
    workspaceService.folders = [a, b];
    const store = new TestMembershipStore(() => 1e3, storageService, workspaceService);
    const pathMatchKey = "copilot://path-match";
    const pendingKey = "copilot://pending";
    const noMatchKey = "copilot://no-match";
    const singleRootKey = "copilot://single-root";
    assert.deepStrictEqual({
      pathMatch: store.shouldInclude(pathMatchKey, [c, b], false),
      pathMatchStored: store.has(pathMatchKey),
      pendingNoMatch: store.shouldInclude(pendingKey, [c, d], true),
      pendingStored: store.has(pendingKey),
      nonPendingNoMatch: store.shouldInclude(noMatchKey, [c, d], false),
      nonPendingStored: store.has(noMatchKey),
      singleRootPathMatch: store.shouldInclude(singleRootKey, [a], false),
      singleRootStored: store.has(singleRootKey)
    }, {
      pathMatch: true,
      pathMatchStored: true,
      pendingNoMatch: true,
      pendingStored: true,
      nonPendingNoMatch: false,
      nonPendingStored: false,
      singleRootPathMatch: true,
      singleRootStored: false
    });
  });
  test("last-seen reconciliation retains active sessions and prunes after thirty unseen days", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    workspaceService.folders = [a, b];
    let now = 0;
    const store = new TestMembershipStore(() => now, storageService, workspaceService);
    const key = "copilot://session";
    store.shouldInclude(key, [a, b], false);
    now = 20 * 24 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([key]);
    now += 29 * 24 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([]);
    const retained = store.has(key);
    now += 2 * 24 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([]);
    assert.deepStrictEqual({ retained, pruned: store.has(key) }, { retained: true, pruned: false });
  });
  test("snapshot reconciliation batches new and retained membership writes", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    workspaceService.folders = [a, b];
    let now = 0;
    const store = new TestMembershipStore(() => now, storageService, workspaceService);
    const first = "copilot://first";
    const second = "copilot://second";
    const listenerStore = disposables.add(new DisposableStore());
    let writes = 0;
    listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, void 0, listenerStore)(() => writes++));
    store.shouldInclude(first, [a, b], false);
    store.shouldInclude(second, [a, b], false);
    const beforeSnapshot = writes;
    store.reconcileBackendSessions([first, second]);
    const afterNewMembershipSnapshot = writes;
    now = 2 * 24 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([first, second]);
    const afterRetainedMembershipSnapshot = writes;
    now += 12 * 60 * 60 * 1e3;
    store.markSeen(first);
    const afterThrottledNotification = writes;
    now += 24 * 60 * 60 * 1e3;
    store.markSeen(first);
    assert.deepStrictEqual({
      beforeSnapshot,
      afterNewMembershipSnapshot,
      afterRetainedMembershipSnapshot,
      afterThrottledNotification,
      afterEligibleNotification: writes
    }, {
      beforeSnapshot: 0,
      afterNewMembershipSnapshot: 1,
      afterRetainedMembershipSnapshot: 2,
      afterThrottledNotification: 2,
      afterEligibleNotification: 3
    });
  });
  test("snapshot freshness prevents pruning before thirty full days of absence", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    workspaceService.folders = [a, b];
    let now = 0;
    const store = new TestMembershipStore(() => now, storageService, workspaceService);
    const key = "copilot://session";
    store.shouldInclude(key, [a, b], false);
    store.reconcileBackendSessions([key]);
    now = 12 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([key]);
    now += 29 * 24 * 60 * 60 * 1e3 + 23 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([]);
    const retainedBeforeThirtyDays = store.has(key);
    now += 2 * 60 * 60 * 1e3;
    store.reconcileBackendSessions([]);
    assert.deepStrictEqual({ retainedBeforeThirtyDays, prunedAfterThirtyDays: store.has(key) }, {
      retainedBeforeThirtyDays: true,
      prunedAfterThirtyDays: false
    });
  });
  test("notification path flushes a newly discovered membership", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    workspaceService.folders = [a, b];
    const key = "copilot://session";
    const store = new TestMembershipStore(() => 1e3, storageService, workspaceService);
    const listenerStore = disposables.add(new DisposableStore());
    let writes = 0;
    listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, void 0, listenerStore)(() => writes++));
    store.shouldInclude(key, [a, b], false);
    const beforeMarkSeen = writes;
    store.markSeen(key);
    const restoredStore = new TestMembershipStore(() => 1e3, storageService, workspaceService);
    assert.deepStrictEqual({ beforeMarkSeen, afterMarkSeen: writes, restored: restoredStore.has(key) }, {
      beforeMarkSeen: 0,
      afterMarkSeen: 1,
      restored: true
    });
  });
  test("ignores malformed persisted membership", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store("agentHost.workspaceSessionMembership.v1", "{not-json", StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const workspaceService = new TestWorkspaceContextService();
    workspaceService.folders = [URI.file("/workspace/a"), URI.file("/workspace/b")];
    const store = new TestMembershipStore(() => 1e3, storageService, workspaceService);
    assert.deepStrictEqual({
      hasCorruptEntry: store.has("copilot://corrupt"),
      unmatchedSession: store.shouldInclude("copilot://unmatched", [URI.file("/other/a"), URI.file("/other/b")], false)
    }, {
      hasCorruptEntry: false,
      unmatchedSession: false
    });
  });
  test("storage is dormant in the Agents window", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    const c = URI.file("/workspace/c");
    const d = URI.file("/workspace/d");
    workspaceService.folders = [a, b];
    const key = "copilot://session";
    const seedStore = new TestMembershipStore(() => 0, storageService, workspaceService);
    seedStore.shouldInclude(key, [a, b], false);
    seedStore.reconcileBackendSessions([key]);
    const listenerStore = disposables.add(new DisposableStore());
    let writes = 0;
    listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, void 0, listenerStore)(() => writes++));
    workspaceService.folders = [c, d];
    const sessionsWindowStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1e3, storageService, workspaceService, true);
    const sessionsWindowIncluded = sessionsWindowStore.shouldInclude(key, [a, b], false);
    sessionsWindowStore.reconcileBackendSessions([key]);
    sessionsWindowStore.markSeen(key);
    sessionsWindowStore.remove(key);
    workspaceService.folders = [a, b];
    const restoredEditorStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1e3, storageService, workspaceService);
    assert.deepStrictEqual({
      sessionsWindowIncluded,
      writes,
      membershipPreserved: restoredEditorStore.has(key)
    }, {
      sessionsWindowIncluded: false,
      writes: 0,
      membershipPreserved: true
    });
  });
  test("storage is dormant in Editor windows without a multi-root workspace", () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const workspaceService = new TestWorkspaceContextService();
    const a = URI.file("/workspace/a");
    const b = URI.file("/workspace/b");
    const c = URI.file("/workspace/c");
    workspaceService.folders = [a, b];
    const key = "copilot://session";
    const seedStore = new TestMembershipStore(() => 0, storageService, workspaceService);
    seedStore.shouldInclude(key, [a, b], false);
    seedStore.reconcileBackendSessions([key]);
    const listenerStore = disposables.add(new DisposableStore());
    let writes = 0;
    listenerStore.add(storageService.onDidChangeValue(StorageScope.WORKSPACE, void 0, listenerStore)(() => writes++));
    workspaceService.folders = [c];
    const singleFolderWorkspaceStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1e3, storageService, workspaceService);
    const singleFolderWorkspaceIncluded = singleFolderWorkspaceStore.shouldInclude(key, [a, b], false);
    singleFolderWorkspaceStore.reconcileBackendSessions([key]);
    singleFolderWorkspaceStore.markSeen(key);
    singleFolderWorkspaceStore.remove(key);
    workspaceService.state = WorkbenchState.FOLDER;
    const folderWindowStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1e3, storageService, workspaceService);
    const folderWindowIncluded = folderWindowStore.shouldInclude(key, [a, b], false);
    folderWindowStore.reconcileBackendSessions([key]);
    folderWindowStore.markSeen(key);
    folderWindowStore.remove(key);
    workspaceService.state = WorkbenchState.EMPTY;
    workspaceService.folders = [];
    const emptyWindowStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1e3, storageService, workspaceService);
    const emptyWindowIncluded = emptyWindowStore.shouldInclude(key, [a, b], false);
    emptyWindowStore.reconcileBackendSessions([key]);
    emptyWindowStore.markSeen(key);
    emptyWindowStore.remove(key);
    workspaceService.state = WorkbenchState.WORKSPACE;
    workspaceService.folders = [a, b];
    const restoredEditorStore = new TestMembershipStore(() => 2 * 24 * 60 * 60 * 1e3, storageService, workspaceService);
    assert.deepStrictEqual({
      singleFolderWorkspaceIncluded,
      folderWindowIncluded,
      emptyWindowIncluded,
      writes,
      membershipPreserved: restoredEditorStore.has(key)
    }, {
      singleFolderWorkspaceIncluded: false,
      folderWindowIncluded: false,
      emptyWindowIncluded: true,
      writes: 0,
      membershipPreserved: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0V29ya3NwYWNlU2Vzc2lvbk1lbWJlcnNoaXBTdG9yZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFdvcmtzcGFjZVNlc3Npb25NZW1iZXJzaGlwU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFdvcmtzcGFjZVNlc3Npb25NZW1iZXJzaGlwU3RvcmUuanMnO1xuXG5zdWl0ZSgnQWdlbnRIb3N0V29ya3NwYWNlU2Vzc2lvbk1lbWJlcnNoaXBTdG9yZScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBUZXN0TWVtYmVyc2hpcFN0b3JlIGV4dGVuZHMgQWdlbnRIb3N0V29ya3NwYWNlU2Vzc2lvbk1lbWJlcnNoaXBTdG9yZSB7XG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3c6ICgpID0+IG51bWJlcixcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdGlzU2Vzc2lvbnNXaW5kb3cgPSBmYWxzZSxcblx0XHQpIHtcblx0XHRcdHN1cGVyKHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHsgaXNTZXNzaW9uc1dpbmRvdyB9IGFzIFBhcnRpYWw8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4gYXMgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIG5vdygpOiBudW1iZXIge1xuXHRcdFx0cmV0dXJuIHRoaXMuX25vdygpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFRlc3RXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHtcblx0XHRzdGF0ZSA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHRmb2xkZXJzOiBVUklbXSA9IFtdO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0V29ya2JlbmNoU3RhdGUoKTogV29ya2JlbmNoU3RhdGUgeyByZXR1cm4gdGhpcy5zdGF0ZTsgfVxuXHRcdG92ZXJyaWRlIGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHtcblx0XHRcdHJldHVybiB1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2U+KHtcblx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRmb2xkZXJzOiB0aGlzLmZvbGRlcnMubWFwKCh1cmksIGluZGV4KSA9PiAoeyB1cmksIGluZGV4LCBuYW1lOiB1cmkucGF0aCwgdG9SZXNvdXJjZTogcGF0aCA9PiBVUkkuam9pblBhdGgodXJpLCBwYXRoKSB9KSksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCd3b3Jrc3BhY2UgbWVtYmVyc2hpcCBzdXJ2aXZlcyBmb2xkZXIgYW5kIGRpcmVjdG9yeS1zZXQgdHJhbnNpdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IG5ldyBUZXN0V29ya3NwYWNlQ29udGV4dFNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpO1xuXHRcdGNvbnN0IGIgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyk7XG5cdFx0Y29uc3QgYyA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2MnKTtcblx0XHRjb25zdCBkID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZCcpO1xuXHRcdHdvcmtzcGFjZVNlcnZpY2UuZm9sZGVycyA9IFthLCBiXTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDEwMDAsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGtleSA9ICdjb3BpbG90Oi8vc2Vzc2lvbic7XG5cdFx0Y29uc3QgaW5pdGlhbCA9IHN0b3JlLnNob3VsZEluY2x1ZGUoa2V5LCBbYSwgYl0sIGZhbHNlKTtcblx0XHRzdG9yZS5yZWNvbmNpbGVCYWNrZW5kU2Vzc2lvbnMoW2tleV0pO1xuXHRcdGNvbnN0IHJlc3RvcmVkU3RvcmUgPSBuZXcgVGVzdE1lbWJlcnNoaXBTdG9yZSgoKSA9PiAxMDAwLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlU2VydmljZSk7XG5cdFx0d29ya3NwYWNlU2VydmljZS5mb2xkZXJzID0gW2MsIGRdO1xuXHRcdGNvbnN0IGNoYW5nZWRXb3Jrc3BhY2UgPSByZXN0b3JlZFN0b3JlLnNob3VsZEluY2x1ZGUoa2V5LCBbYSwgYl0sIGZhbHNlKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbY107XG5cdFx0Y29uc3Qgc2luZ2xlRm9sZGVyID0gcmVzdG9yZWRTdG9yZS5zaG91bGRJbmNsdWRlKGtleSwgW2EsIGJdLCBmYWxzZSk7XG5cdFx0d29ya3NwYWNlU2VydmljZS5mb2xkZXJzID0gW2MsIGRdO1xuXHRcdGNvbnN0IHNocnVua1Nlc3Npb24gPSByZXN0b3JlZFN0b3JlLnNob3VsZEluY2x1ZGUoa2V5LCBbYV0sIGZhbHNlKTtcblx0XHRjb25zdCBleHBhbmRlZEFnYWluID0gcmVzdG9yZWRTdG9yZS5zaG91bGRJbmNsdWRlKGtleSwgW2EsIGJdLCBmYWxzZSk7XG5cdFx0cmVzdG9yZWRTdG9yZS5yZW1vdmUoa2V5KTtcblx0XHRjb25zdCBhZnRlckRlbGV0ZSA9IHJlc3RvcmVkU3RvcmUuc2hvdWxkSW5jbHVkZShrZXksIFthLCBiXSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbml0aWFsLFxuXHRcdFx0Y2hhbmdlZFdvcmtzcGFjZSxcblx0XHRcdHNpbmdsZUZvbGRlcixcblx0XHRcdHNocnVua1Nlc3Npb24sXG5cdFx0XHRleHBhbmRlZEFnYWluLFxuXHRcdFx0YWZ0ZXJEZWxldGUsXG5cdFx0fSwge1xuXHRcdFx0aW5pdGlhbDogdHJ1ZSxcblx0XHRcdGNoYW5nZWRXb3Jrc3BhY2U6IHRydWUsXG5cdFx0XHRzaW5nbGVGb2xkZXI6IGZhbHNlLFxuXHRcdFx0c2hydW5rU2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRleHBhbmRlZEFnYWluOiB0cnVlLFxuXHRcdFx0YWZ0ZXJEZWxldGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRzIG9ubHkgZWxpZ2libGUgbXVsdGktcm9vdCBzZXNzaW9uIHByb3ZlbmFuY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IG5ldyBUZXN0V29ya3NwYWNlQ29udGV4dFNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpO1xuXHRcdGNvbnN0IGIgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyk7XG5cdFx0Y29uc3QgYyA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2MnKTtcblx0XHRjb25zdCBkID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZCcpO1xuXHRcdHdvcmtzcGFjZVNlcnZpY2UuZm9sZGVycyA9IFthLCBiXTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDEwMDAsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBhdGhNYXRjaEtleSA9ICdjb3BpbG90Oi8vcGF0aC1tYXRjaCc7XG5cdFx0Y29uc3QgcGVuZGluZ0tleSA9ICdjb3BpbG90Oi8vcGVuZGluZyc7XG5cdFx0Y29uc3Qgbm9NYXRjaEtleSA9ICdjb3BpbG90Oi8vbm8tbWF0Y2gnO1xuXHRcdGNvbnN0IHNpbmdsZVJvb3RLZXkgPSAnY29waWxvdDovL3NpbmdsZS1yb290Jztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhdGhNYXRjaDogc3RvcmUuc2hvdWxkSW5jbHVkZShwYXRoTWF0Y2hLZXksIFtjLCBiXSwgZmFsc2UpLFxuXHRcdFx0cGF0aE1hdGNoU3RvcmVkOiBzdG9yZS5oYXMocGF0aE1hdGNoS2V5KSxcblx0XHRcdHBlbmRpbmdOb01hdGNoOiBzdG9yZS5zaG91bGRJbmNsdWRlKHBlbmRpbmdLZXksIFtjLCBkXSwgdHJ1ZSksXG5cdFx0XHRwZW5kaW5nU3RvcmVkOiBzdG9yZS5oYXMocGVuZGluZ0tleSksXG5cdFx0XHRub25QZW5kaW5nTm9NYXRjaDogc3RvcmUuc2hvdWxkSW5jbHVkZShub01hdGNoS2V5LCBbYywgZF0sIGZhbHNlKSxcblx0XHRcdG5vblBlbmRpbmdTdG9yZWQ6IHN0b3JlLmhhcyhub01hdGNoS2V5KSxcblx0XHRcdHNpbmdsZVJvb3RQYXRoTWF0Y2g6IHN0b3JlLnNob3VsZEluY2x1ZGUoc2luZ2xlUm9vdEtleSwgW2FdLCBmYWxzZSksXG5cdFx0XHRzaW5nbGVSb290U3RvcmVkOiBzdG9yZS5oYXMoc2luZ2xlUm9vdEtleSksXG5cdFx0fSwge1xuXHRcdFx0cGF0aE1hdGNoOiB0cnVlLFxuXHRcdFx0cGF0aE1hdGNoU3RvcmVkOiB0cnVlLFxuXHRcdFx0cGVuZGluZ05vTWF0Y2g6IHRydWUsXG5cdFx0XHRwZW5kaW5nU3RvcmVkOiB0cnVlLFxuXHRcdFx0bm9uUGVuZGluZ05vTWF0Y2g6IGZhbHNlLFxuXHRcdFx0bm9uUGVuZGluZ1N0b3JlZDogZmFsc2UsXG5cdFx0XHRzaW5nbGVSb290UGF0aE1hdGNoOiB0cnVlLFxuXHRcdFx0c2luZ2xlUm9vdFN0b3JlZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3Qtc2VlbiByZWNvbmNpbGlhdGlvbiByZXRhaW5zIGFjdGl2ZSBzZXNzaW9ucyBhbmQgcHJ1bmVzIGFmdGVyIHRoaXJ0eSB1bnNlZW4gZGF5cycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gbmV3IFRlc3RXb3Jrc3BhY2VDb250ZXh0U2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3QgYiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2InKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYSwgYl07XG5cdFx0bGV0IG5vdyA9IDA7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVGVzdE1lbWJlcnNoaXBTdG9yZSgoKSA9PiBub3csIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBrZXkgPSAnY29waWxvdDovL3Nlc3Npb24nO1xuXG5cdFx0c3RvcmUuc2hvdWxkSW5jbHVkZShrZXksIFthLCBiXSwgZmFsc2UpO1xuXHRcdG5vdyA9IDIwICogMjQgKiA2MCAqIDYwICogMTAwMDtcblx0XHRzdG9yZS5yZWNvbmNpbGVCYWNrZW5kU2Vzc2lvbnMoW2tleV0pO1xuXHRcdG5vdyArPSAyOSAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cdFx0c3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtdKTtcblx0XHRjb25zdCByZXRhaW5lZCA9IHN0b3JlLmhhcyhrZXkpO1xuXHRcdG5vdyArPSAyICogMjQgKiA2MCAqIDYwICogMTAwMDtcblx0XHRzdG9yZS5yZWNvbmNpbGVCYWNrZW5kU2Vzc2lvbnMoW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJldGFpbmVkLCBwcnVuZWQ6IHN0b3JlLmhhcyhrZXkpIH0sIHsgcmV0YWluZWQ6IHRydWUsIHBydW5lZDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuYXBzaG90IHJlY29uY2lsaWF0aW9uIGJhdGNoZXMgbmV3IGFuZCByZXRhaW5lZCBtZW1iZXJzaGlwIHdyaXRlcycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gbmV3IFRlc3RXb3Jrc3BhY2VDb250ZXh0U2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3QgYiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2InKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYSwgYl07XG5cdFx0bGV0IG5vdyA9IDA7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVGVzdE1lbWJlcnNoaXBTdG9yZSgoKSA9PiBub3csIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBmaXJzdCA9ICdjb3BpbG90Oi8vZmlyc3QnO1xuXHRcdGNvbnN0IHNlY29uZCA9ICdjb3BpbG90Oi8vc2Vjb25kJztcblx0XHRjb25zdCBsaXN0ZW5lclN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHdyaXRlcyA9IDA7XG5cdFx0bGlzdGVuZXJTdG9yZS5hZGQoc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB1bmRlZmluZWQsIGxpc3RlbmVyU3RvcmUpKCgpID0+IHdyaXRlcysrKSk7XG5cdFx0c3RvcmUuc2hvdWxkSW5jbHVkZShmaXJzdCwgW2EsIGJdLCBmYWxzZSk7XG5cdFx0c3RvcmUuc2hvdWxkSW5jbHVkZShzZWNvbmQsIFthLCBiXSwgZmFsc2UpO1xuXHRcdGNvbnN0IGJlZm9yZVNuYXBzaG90ID0gd3JpdGVzO1xuXHRcdHN0b3JlLnJlY29uY2lsZUJhY2tlbmRTZXNzaW9ucyhbZmlyc3QsIHNlY29uZF0pO1xuXHRcdGNvbnN0IGFmdGVyTmV3TWVtYmVyc2hpcFNuYXBzaG90ID0gd3JpdGVzO1xuXHRcdG5vdyA9IDIgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuXHRcdHN0b3JlLnJlY29uY2lsZUJhY2tlbmRTZXNzaW9ucyhbZmlyc3QsIHNlY29uZF0pO1xuXHRcdGNvbnN0IGFmdGVyUmV0YWluZWRNZW1iZXJzaGlwU25hcHNob3QgPSB3cml0ZXM7XG5cdFx0bm93ICs9IDEyICogNjAgKiA2MCAqIDEwMDA7XG5cdFx0c3RvcmUubWFya1NlZW4oZmlyc3QpO1xuXHRcdGNvbnN0IGFmdGVyVGhyb3R0bGVkTm90aWZpY2F0aW9uID0gd3JpdGVzO1xuXHRcdG5vdyArPSAyNCAqIDYwICogNjAgKiAxMDAwO1xuXHRcdHN0b3JlLm1hcmtTZWVuKGZpcnN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YmVmb3JlU25hcHNob3QsXG5cdFx0XHRhZnRlck5ld01lbWJlcnNoaXBTbmFwc2hvdCxcblx0XHRcdGFmdGVyUmV0YWluZWRNZW1iZXJzaGlwU25hcHNob3QsXG5cdFx0XHRhZnRlclRocm90dGxlZE5vdGlmaWNhdGlvbixcblx0XHRcdGFmdGVyRWxpZ2libGVOb3RpZmljYXRpb246IHdyaXRlcyxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVTbmFwc2hvdDogMCxcblx0XHRcdGFmdGVyTmV3TWVtYmVyc2hpcFNuYXBzaG90OiAxLFxuXHRcdFx0YWZ0ZXJSZXRhaW5lZE1lbWJlcnNoaXBTbmFwc2hvdDogMixcblx0XHRcdGFmdGVyVGhyb3R0bGVkTm90aWZpY2F0aW9uOiAyLFxuXHRcdFx0YWZ0ZXJFbGlnaWJsZU5vdGlmaWNhdGlvbjogMyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc25hcHNob3QgZnJlc2huZXNzIHByZXZlbnRzIHBydW5pbmcgYmVmb3JlIHRoaXJ0eSBmdWxsIGRheXMgb2YgYWJzZW5jZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gbmV3IFRlc3RXb3Jrc3BhY2VDb250ZXh0U2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3QgYiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2InKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYSwgYl07XG5cdFx0bGV0IG5vdyA9IDA7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVGVzdE1lbWJlcnNoaXBTdG9yZSgoKSA9PiBub3csIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBrZXkgPSAnY29waWxvdDovL3Nlc3Npb24nO1xuXHRcdHN0b3JlLnNob3VsZEluY2x1ZGUoa2V5LCBbYSwgYl0sIGZhbHNlKTtcblx0XHRzdG9yZS5yZWNvbmNpbGVCYWNrZW5kU2Vzc2lvbnMoW2tleV0pO1xuXHRcdG5vdyA9IDEyICogNjAgKiA2MCAqIDEwMDA7XG5cdFx0c3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtrZXldKTtcblx0XHRub3cgKz0gMjkgKiAyNCAqIDYwICogNjAgKiAxMDAwICsgMjMgKiA2MCAqIDYwICogMTAwMDtcblx0XHRzdG9yZS5yZWNvbmNpbGVCYWNrZW5kU2Vzc2lvbnMoW10pO1xuXHRcdGNvbnN0IHJldGFpbmVkQmVmb3JlVGhpcnR5RGF5cyA9IHN0b3JlLmhhcyhrZXkpO1xuXHRcdG5vdyArPSAyICogNjAgKiA2MCAqIDEwMDA7XG5cdFx0c3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXRhaW5lZEJlZm9yZVRoaXJ0eURheXMsIHBydW5lZEFmdGVyVGhpcnR5RGF5czogc3RvcmUuaGFzKGtleSkgfSwge1xuXHRcdFx0cmV0YWluZWRCZWZvcmVUaGlydHlEYXlzOiB0cnVlLFxuXHRcdFx0cHJ1bmVkQWZ0ZXJUaGlydHlEYXlzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm90aWZpY2F0aW9uIHBhdGggZmx1c2hlcyBhIG5ld2x5IGRpc2NvdmVyZWQgbWVtYmVyc2hpcCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gbmV3IFRlc3RXb3Jrc3BhY2VDb250ZXh0U2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3QgYiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2InKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYSwgYl07XG5cdFx0Y29uc3Qga2V5ID0gJ2NvcGlsb3Q6Ly9zZXNzaW9uJztcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDEwMDAsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0ZW5lclN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHdyaXRlcyA9IDA7XG5cdFx0bGlzdGVuZXJTdG9yZS5hZGQoc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB1bmRlZmluZWQsIGxpc3RlbmVyU3RvcmUpKCgpID0+IHdyaXRlcysrKSk7XG5cblx0XHRzdG9yZS5zaG91bGRJbmNsdWRlKGtleSwgW2EsIGJdLCBmYWxzZSk7XG5cdFx0Y29uc3QgYmVmb3JlTWFya1NlZW4gPSB3cml0ZXM7XG5cdFx0c3RvcmUubWFya1NlZW4oa2V5KTtcblx0XHRjb25zdCByZXN0b3JlZFN0b3JlID0gbmV3IFRlc3RNZW1iZXJzaGlwU3RvcmUoKCkgPT4gMTAwMCwgc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGJlZm9yZU1hcmtTZWVuLCBhZnRlck1hcmtTZWVuOiB3cml0ZXMsIHJlc3RvcmVkOiByZXN0b3JlZFN0b3JlLmhhcyhrZXkpIH0sIHtcblx0XHRcdGJlZm9yZU1hcmtTZWVuOiAwLFxuXHRcdFx0YWZ0ZXJNYXJrU2VlbjogMSxcblx0XHRcdHJlc3RvcmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIG1hbGZvcm1lZCBwZXJzaXN0ZWQgbWVtYmVyc2hpcCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnYWdlbnRIb3N0LndvcmtzcGFjZVNlc3Npb25NZW1iZXJzaGlwLnYxJywgJ3tub3QtanNvbicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IG5ldyBUZXN0V29ya3NwYWNlQ29udGV4dFNlcnZpY2UoKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyldO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRlc3RNZW1iZXJzaGlwU3RvcmUoKCkgPT4gMTAwMCwgc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNDb3JydXB0RW50cnk6IHN0b3JlLmhhcygnY29waWxvdDovL2NvcnJ1cHQnKSxcblx0XHRcdHVubWF0Y2hlZFNlc3Npb246IHN0b3JlLnNob3VsZEluY2x1ZGUoJ2NvcGlsb3Q6Ly91bm1hdGNoZWQnLCBbVVJJLmZpbGUoJy9vdGhlci9hJyksIFVSSS5maWxlKCcvb3RoZXIvYicpXSwgZmFsc2UpLFxuXHRcdH0sIHtcblx0XHRcdGhhc0NvcnJ1cHRFbnRyeTogZmFsc2UsXG5cdFx0XHR1bm1hdGNoZWRTZXNzaW9uOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcmFnZSBpcyBkb3JtYW50IGluIHRoZSBBZ2VudHMgd2luZG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNlcnZpY2UgPSBuZXcgVGVzdFdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2EnKTtcblx0XHRjb25zdCBiID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYicpO1xuXHRcdGNvbnN0IGMgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9jJyk7XG5cdFx0Y29uc3QgZCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2QnKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYSwgYl07XG5cdFx0Y29uc3Qga2V5ID0gJ2NvcGlsb3Q6Ly9zZXNzaW9uJztcblx0XHRjb25zdCBzZWVkU3RvcmUgPSBuZXcgVGVzdE1lbWJlcnNoaXBTdG9yZSgoKSA9PiAwLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlU2VydmljZSk7XG5cdFx0c2VlZFN0b3JlLnNob3VsZEluY2x1ZGUoa2V5LCBbYSwgYl0sIGZhbHNlKTtcblx0XHRzZWVkU3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtrZXldKTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyU3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgd3JpdGVzID0gMDtcblx0XHRsaXN0ZW5lclN0b3JlLmFkZChzdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHVuZGVmaW5lZCwgbGlzdGVuZXJTdG9yZSkoKCkgPT4gd3JpdGVzKyspKTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYywgZF07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNXaW5kb3dTdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDIgKiAyNCAqIDYwICogNjAgKiAxMDAwLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlU2VydmljZSwgdHJ1ZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNXaW5kb3dJbmNsdWRlZCA9IHNlc3Npb25zV2luZG93U3RvcmUuc2hvdWxkSW5jbHVkZShrZXksIFthLCBiXSwgZmFsc2UpO1xuXHRcdHNlc3Npb25zV2luZG93U3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtrZXldKTtcblx0XHRzZXNzaW9uc1dpbmRvd1N0b3JlLm1hcmtTZWVuKGtleSk7XG5cdFx0c2Vzc2lvbnNXaW5kb3dTdG9yZS5yZW1vdmUoa2V5KTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLmZvbGRlcnMgPSBbYSwgYl07XG5cdFx0Y29uc3QgcmVzdG9yZWRFZGl0b3JTdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDIgKiAyNCAqIDYwICogNjAgKiAxMDAwLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25zV2luZG93SW5jbHVkZWQsXG5cdFx0XHR3cml0ZXMsXG5cdFx0XHRtZW1iZXJzaGlwUHJlc2VydmVkOiByZXN0b3JlZEVkaXRvclN0b3JlLmhhcyhrZXkpLFxuXHRcdH0sIHtcblx0XHRcdHNlc3Npb25zV2luZG93SW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0d3JpdGVzOiAwLFxuXHRcdFx0bWVtYmVyc2hpcFByZXNlcnZlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcmFnZSBpcyBkb3JtYW50IGluIEVkaXRvciB3aW5kb3dzIHdpdGhvdXQgYSBtdWx0aS1yb290IHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gbmV3IFRlc3RXb3Jrc3BhY2VDb250ZXh0U2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3QgYiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2InKTtcblx0XHRjb25zdCBjID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYycpO1xuXHRcdHdvcmtzcGFjZVNlcnZpY2UuZm9sZGVycyA9IFthLCBiXTtcblx0XHRjb25zdCBrZXkgPSAnY29waWxvdDovL3Nlc3Npb24nO1xuXHRcdGNvbnN0IHNlZWRTdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDAsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRzZWVkU3RvcmUuc2hvdWxkSW5jbHVkZShrZXksIFthLCBiXSwgZmFsc2UpO1xuXHRcdHNlZWRTdG9yZS5yZWNvbmNpbGVCYWNrZW5kU2Vzc2lvbnMoW2tleV0pO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXJTdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCB3cml0ZXMgPSAwO1xuXHRcdGxpc3RlbmVyU3RvcmUuYWRkKHN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdW5kZWZpbmVkLCBsaXN0ZW5lclN0b3JlKSgoKSA9PiB3cml0ZXMrKykpO1xuXHRcdHdvcmtzcGFjZVNlcnZpY2UuZm9sZGVycyA9IFtjXTtcblx0XHRjb25zdCBzaW5nbGVGb2xkZXJXb3Jrc3BhY2VTdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDIgKiAyNCAqIDYwICogNjAgKiAxMDAwLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlU2VydmljZSk7XG5cdFx0Y29uc3Qgc2luZ2xlRm9sZGVyV29ya3NwYWNlSW5jbHVkZWQgPSBzaW5nbGVGb2xkZXJXb3Jrc3BhY2VTdG9yZS5zaG91bGRJbmNsdWRlKGtleSwgW2EsIGJdLCBmYWxzZSk7XG5cdFx0c2luZ2xlRm9sZGVyV29ya3NwYWNlU3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtrZXldKTtcblx0XHRzaW5nbGVGb2xkZXJXb3Jrc3BhY2VTdG9yZS5tYXJrU2VlbihrZXkpO1xuXHRcdHNpbmdsZUZvbGRlcldvcmtzcGFjZVN0b3JlLnJlbW92ZShrZXkpO1xuXHRcdHdvcmtzcGFjZVNlcnZpY2Uuc3RhdGUgPSBXb3JrYmVuY2hTdGF0ZS5GT0xERVI7XG5cdFx0Y29uc3QgZm9sZGVyV2luZG93U3RvcmUgPSBuZXcgVGVzdE1lbWJlcnNoaXBTdG9yZSgoKSA9PiAyICogMjQgKiA2MCAqIDYwICogMTAwMCwgc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGZvbGRlcldpbmRvd0luY2x1ZGVkID0gZm9sZGVyV2luZG93U3RvcmUuc2hvdWxkSW5jbHVkZShrZXksIFthLCBiXSwgZmFsc2UpO1xuXHRcdGZvbGRlcldpbmRvd1N0b3JlLnJlY29uY2lsZUJhY2tlbmRTZXNzaW9ucyhba2V5XSk7XG5cdFx0Zm9sZGVyV2luZG93U3RvcmUubWFya1NlZW4oa2V5KTtcblx0XHRmb2xkZXJXaW5kb3dTdG9yZS5yZW1vdmUoa2V5KTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLnN0YXRlID0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdFx0d29ya3NwYWNlU2VydmljZS5mb2xkZXJzID0gW107XG5cdFx0Y29uc3QgZW1wdHlXaW5kb3dTdG9yZSA9IG5ldyBUZXN0TWVtYmVyc2hpcFN0b3JlKCgpID0+IDIgKiAyNCAqIDYwICogNjAgKiAxMDAwLCBzdG9yYWdlU2VydmljZSwgd29ya3NwYWNlU2VydmljZSk7XG5cdFx0Y29uc3QgZW1wdHlXaW5kb3dJbmNsdWRlZCA9IGVtcHR5V2luZG93U3RvcmUuc2hvdWxkSW5jbHVkZShrZXksIFthLCBiXSwgZmFsc2UpO1xuXHRcdGVtcHR5V2luZG93U3RvcmUucmVjb25jaWxlQmFja2VuZFNlc3Npb25zKFtrZXldKTtcblx0XHRlbXB0eVdpbmRvd1N0b3JlLm1hcmtTZWVuKGtleSk7XG5cdFx0ZW1wdHlXaW5kb3dTdG9yZS5yZW1vdmUoa2V5KTtcblx0XHR3b3Jrc3BhY2VTZXJ2aWNlLnN0YXRlID0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdHdvcmtzcGFjZVNlcnZpY2UuZm9sZGVycyA9IFthLCBiXTtcblx0XHRjb25zdCByZXN0b3JlZEVkaXRvclN0b3JlID0gbmV3IFRlc3RNZW1iZXJzaGlwU3RvcmUoKCkgPT4gMiAqIDI0ICogNjAgKiA2MCAqIDEwMDAsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2luZ2xlRm9sZGVyV29ya3NwYWNlSW5jbHVkZWQsXG5cdFx0XHRmb2xkZXJXaW5kb3dJbmNsdWRlZCxcblx0XHRcdGVtcHR5V2luZG93SW5jbHVkZWQsXG5cdFx0XHR3cml0ZXMsXG5cdFx0XHRtZW1iZXJzaGlwUHJlc2VydmVkOiByZXN0b3JlZEVkaXRvclN0b3JlLmhhcyhrZXkpLFxuXHRcdH0sIHtcblx0XHRcdHNpbmdsZUZvbGRlcldvcmtzcGFjZUluY2x1ZGVkOiBmYWxzZSxcblx0XHRcdGZvbGRlcldpbmRvd0luY2x1ZGVkOiBmYWxzZSxcblx0XHRcdGVtcHR5V2luZG93SW5jbHVkZWQ6IHRydWUsXG5cdFx0XHR3cml0ZXM6IDAsXG5cdFx0XHRtZW1iZXJzaGlwUHJlc2VydmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxNQUFNLHFCQUFxQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QixjQUFjLHFCQUFxQjtBQUNwRSxTQUErQyxzQkFBc0I7QUFFckUsU0FBUyxnREFBZ0Q7QUFFekQsTUFBTSw0Q0FBNEMsTUFBTTtBQUN2RCxRQUFNLGNBQWMs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
