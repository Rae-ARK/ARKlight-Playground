import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { hash } from "../../../../../base/common/hash.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { MAX_TRACKED_SESSIONS, SESSIONS_KEY, SessionsLifecycleTracker } from "../../browser/sessionsLifecycleTracker.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
function createSession(id, opts = {}) {
  const providerId = opts.providerId ?? "test-provider";
  const sessionType = opts.sessionType ?? "test-type";
  return {
    sessionId: id,
    resource: URI.parse(`session://${id}`),
    providerId,
    sessionType,
    icon: Codicon.account,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: observableValue(`workspace-${id}`, opts.workspace),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, /* @__PURE__ */ new Date()),
    status: observableValue(`status-${id}`, SessionStatus.Completed),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, opts.changes ?? []),
    changesSummary: opts.changesSummary !== void 0 ? observableValue(`changesSummary-${id}`, opts.changesSummary) : void 0,
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, false),
    isRead: observableValue(`isRead-${id}`, true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: constObservable(void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
function createWorkspace(uri, folders) {
  return {
    uri,
    label: "ws",
    icon: ThemeIcon.fromId("folder"),
    folders,
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: uri.scheme !== "file"
  };
}
function createFolder(uri, opts = {}) {
  return {
    root: uri,
    workingDirectory: uri,
    name: "folder",
    description: void 0,
    gitRepository: opts.withGitRepository || opts.workTreeUri ? {
      uri,
      workTreeUri: opts.workTreeUri,
      baseBranchName: void 0,
      gitHubInfo: constObservable(void 0)
    } : void 0
  };
}
suite("SessionsLifecycleTracker", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let storage;
  let tracker;
  setup(() => {
    storage = disposables.add(new InMemoryStorageService());
    tracker = disposables.add(new SessionsLifecycleTracker(storage));
  });
  test("starts untracked until a user interaction is recorded", () => {
    const session = createSession("s1");
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
    tracker.recordNewChatRequestSent(session);
    assert.strictEqual(tracker.isTracked(session.sessionId), true);
  });
  test("finalize emits summary and removes tracking entry", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.bumpCounter(session, "feedbackAdded");
    tracker.bumpCounter(session, "feedbackAdded");
    tracker.bumpCounter(session, "commit");
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.agentSessionId, "s1");
    assert.strictEqual(summary.providerId, "test-provider");
    assert.strictEqual(summary.providerType, "test-type");
    assert.strictEqual(summary.doneReason, "archived");
    assert.strictEqual(summary.requestsSent, 1);
    assert.strictEqual(summary.feedbackAdded, 2);
    assert.strictEqual(summary.commit, 1);
    assert.strictEqual(summary.firstRequestSentInThisClient, true);
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
  });
  test("finalize returns undefined when session is not tracked", () => {
    const summary = tracker.finalize("does-not-exist", "deletedRemotely");
    assert.strictEqual(summary, void 0);
  });
  test("state persists across tracker instances and app launch count grows", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.bumpCounter(session, "feedbackAdded");
    const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.strictEqual(secondTracker.isTracked(session.sessionId), true);
    const summary = secondTracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.feedbackAdded, 1);
    assert.strictEqual(summary.requestsSent, 1);
    assert.strictEqual(summary.appLaunchesSinceFirstObserved, 1);
  });
  test("chatCount increments once per recordRequestSent call", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.recordNewChatRequestSent(session);
    tracker.bumpCounter(session, "feedbackAdded");
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.chatCount, 3);
    assert.strictEqual(summary.requestsSent, 3);
  });
  test("getTrackedEntries returns sessionId plus providerId for each entry", () => {
    const a = createSession("a", { providerId: "provider-a" });
    const b = createSession("b", { providerId: "provider-b" });
    tracker.recordNewChatRequestSent(a);
    tracker.bumpCounter(b, "commit");
    const entries = tracker.getTrackedEntries().map((e) => `${e.providerId}:${e.sessionId}`).sort();
    assert.deepStrictEqual(entries, ["provider-a:a", "provider-b:b"]);
  });
  test("local archive then deferred remote signal yields a single summary", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    const localSummary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(localSummary);
    assert.strictEqual(localSummary.doneReason, "archived");
    const deferredSummary = tracker.finalize(session.sessionId, "archivedRemotely", session);
    assert.strictEqual(deferredSummary, void 0);
  });
  test("bumpCounter creates a tracking entry for previously untracked sessions", () => {
    const session = createSession("s1");
    tracker.bumpCounter(session, "commit");
    assert.strictEqual(tracker.isTracked(session.sessionId), true);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.commit, 1);
    assert.strictEqual(summary.requestsSent, 0);
    assert.strictEqual(summary.firstRequestSentInThisClient, false);
  });
  test("bumpCounter increments distinct counter keys independently", () => {
    const session = createSession("s1");
    tracker.bumpCounter(session, "chatRenamed");
    tracker.bumpCounter(session, "chatRenamed");
    tracker.bumpCounter(session, "taskRun");
    tracker.bumpCounter(session, "mergePullRequest");
    tracker.bumpCounter(session, "fixCIChecks");
    tracker.bumpCounter(session, "fixCIChecks");
    tracker.bumpCounter(session, "fixCIChecks");
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      chatRenamed: summary.chatRenamed,
      taskRun: summary.taskRun,
      mergePullRequest: summary.mergePullRequest,
      fixCIChecks: summary.fixCIChecks,
      commit: summary.commit
    }, {
      chatRenamed: 2,
      taskRun: 1,
      mergePullRequest: 1,
      fixCIChecks: 3,
      commit: 0
    });
  });
  test("updateSessionState is a no-op for untracked sessions", () => {
    const session = createSession("s1", { changes: [{ modifiedUri: URI.parse("file:///a"), insertions: 5, deletions: 1 }] });
    tracker.updateSessionState(session);
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
  });
  test("changesSummary observable takes precedence over the changes list", () => {
    const session = createSession("s1", {
      changes: [
        { modifiedUri: URI.parse("file:///a"), insertions: 5, deletions: 1 },
        { modifiedUri: URI.parse("file:///b"), insertions: 2, deletions: 3 }
      ],
      changesSummary: { files: 17, additions: 99, deletions: 88 }
    });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      filesChanged: summary.filesChanged,
      linesAdded: summary.linesAdded,
      linesDeleted: summary.linesDeleted
    }, {
      filesChanged: 17,
      linesAdded: 99,
      linesDeleted: 88
    });
  });
  test("falls back to aggregating changes when changesSummary is absent", () => {
    const session = createSession("s1", {
      changes: [
        { modifiedUri: URI.parse("file:///a"), insertions: 5, deletions: 1 },
        { modifiedUri: URI.parse("file:///b"), insertions: 2, deletions: 3 }
      ]
    });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      filesChanged: summary.filesChanged,
      linesAdded: summary.linesAdded,
      linesDeleted: summary.linesDeleted
    }, {
      filesChanged: 2,
      linesAdded: 7,
      linesDeleted: 4
    });
  });
  test("summary derives workspace fields from the session workspace at first observation", () => {
    const workspaceUri = URI.parse("vscode-remote://host/repo");
    const repoUri = URI.parse("file:///repo");
    const workspace = createWorkspace(workspaceUri, [
      createFolder(repoUri, { workTreeUri: URI.parse("file:///repo/.git/worktrees/feature") })
    ]);
    const session = createSession("s1", { workspace });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      isolationKind: summary.isolationKind,
      hasGitRepository: summary.hasGitRepository,
      isVirtualWorkspace: summary.isVirtualWorkspace,
      workspaceHash: summary.workspaceHash
    }, {
      isolationKind: "worktree",
      hasGitRepository: true,
      isVirtualWorkspace: true,
      workspaceHash: hash(workspaceUri.toString()).toString(16)
    });
  });
  test("summary reports folder isolation for a plain file workspace with no worktree", () => {
    const workspaceUri = URI.parse("file:///repo");
    const workspace = createWorkspace(workspaceUri, [
      createFolder(workspaceUri, { withGitRepository: true })
    ]);
    const session = createSession("s1", { workspace });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      isolationKind: summary.isolationKind,
      hasGitRepository: summary.hasGitRepository,
      isVirtualWorkspace: summary.isVirtualWorkspace
    }, {
      isolationKind: "folder",
      hasGitRepository: true,
      isVirtualWorkspace: false
    });
  });
  test("recordFirstRequestTaskInfo is a no-op when the session is not tracked", () => {
    const session = createSession("s1");
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: true, configuredTasksCount: 3 });
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
  });
  test("recordFirstRequestTaskInfo only records the first call per session", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: true, configuredTasksCount: 4 });
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: false, configuredTasksCount: 0 });
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      hasWorktreeCreatedTask: summary.hasWorktreeCreatedTask,
      configuredTasksCount: summary.configuredTasksCount
    }, {
      hasWorktreeCreatedTask: true,
      configuredTasksCount: 4
    });
  });
  test("recordFirstRequestTaskInfo persists across tracker instances", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: false, configuredTasksCount: 2 });
    const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
    const summary = secondTracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      hasWorktreeCreatedTask: summary.hasWorktreeCreatedTask,
      configuredTasksCount: summary.configuredTasksCount
    }, {
      hasWorktreeCreatedTask: false,
      configuredTasksCount: 2
    });
  });
  test("summary reports task info as undefined when never recorded", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      hasWorktreeCreatedTask: summary.hasWorktreeCreatedTask,
      configuredTasksCount: summary.configuredTasksCount
    }, {
      hasWorktreeCreatedTask: void 0,
      configuredTasksCount: void 0
    });
  });
  test("incrementAndGetUserRequestCounters returns post-increment values per provider, workspace and total", () => {
    const workspaceA = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const workspaceB = createWorkspace(URI.parse("file:///ws/b"), [createFolder(URI.parse("file:///ws/b"))]);
    const a1 = createSession("a1", { providerId: "p1", workspace: workspaceA });
    const a2 = createSession("a2", { providerId: "p1", workspace: workspaceA });
    const b = createSession("b", { providerId: "p2", workspace: workspaceB });
    const noWorkspace = createSession("n", { providerId: "p1" });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(a1), { userSessionsTotal: 1, userSessionsInWorkspace: 1, userSessionsForProvider: 1 });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(a2), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(b), { userSessionsTotal: 3, userSessionsInWorkspace: 1, userSessionsForProvider: 1 });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(noWorkspace), { userSessionsTotal: 4, userSessionsInWorkspace: 0, userSessionsForProvider: 3 });
  });
  test("summary includes the request counters as observed at finalize time", () => {
    const workspaceA = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const workspaceB = createWorkspace(URI.parse("file:///ws/b"), [createFolder(URI.parse("file:///ws/b"))]);
    const sessionToFinalize = createSession("a1", { providerId: "p1", workspace: workspaceA });
    const otherSameWorkspace = createSession("a2", { providerId: "p1", workspace: workspaceA });
    const otherDifferentEverything = createSession("b", { providerId: "p2", workspace: workspaceB });
    tracker.recordNewChatRequestSent(sessionToFinalize);
    tracker.incrementAndGetUserRequestCounters(sessionToFinalize);
    tracker.incrementAndGetUserRequestCounters(otherSameWorkspace);
    tracker.incrementAndGetUserRequestCounters(otherDifferentEverything);
    const summary = tracker.finalize(sessionToFinalize.sessionId, "archived", sessionToFinalize);
    assert.ok(summary);
    assert.deepStrictEqual({
      userSessionsTotal: summary.userSessionsTotal,
      userSessionsInWorkspace: summary.userSessionsInWorkspace,
      userSessionsForProvider: summary.userSessionsForProvider
    }, {
      userSessionsTotal: 3,
      userSessionsInWorkspace: 2,
      userSessionsForProvider: 2
    });
  });
  test("request counters persist across tracker instances", () => {
    const workspace = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const session = createSession("a1", { providerId: "p1", workspace });
    tracker.incrementAndGetUserRequestCounters(session);
    tracker.incrementAndGetUserRequestCounters(session);
    const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.deepStrictEqual(secondTracker.incrementAndGetUserRequestCounters(session), { userSessionsTotal: 3, userSessionsInWorkspace: 3, userSessionsForProvider: 3 });
  });
  test("getUserRequestCounters returns current values without incrementing", () => {
    const workspace = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const session = createSession("a1", { providerId: "p1", workspace });
    assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 0, userSessionsInWorkspace: 0, userSessionsForProvider: 0 });
    tracker.incrementAndGetUserRequestCounters(session);
    tracker.incrementAndGetUserRequestCounters(session);
    assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
    assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
  });
  test("summary reports zero request counters for an untouched provider/workspace", () => {
    const session = createSession("s1");
    tracker.bumpCounter(session, "commit");
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      userSessionsTotal: summary.userSessionsTotal,
      userSessionsInWorkspace: summary.userSessionsInWorkspace,
      userSessionsForProvider: summary.userSessionsForProvider
    }, {
      userSessionsTotal: 0,
      userSessionsInWorkspace: 0,
      userSessionsForProvider: 0
    });
  });
  test("getTrackedIds returns ids of all tracked sessions", () => {
    const a = createSession("a");
    const b = createSession("b");
    tracker.recordNewChatRequestSent(a);
    tracker.bumpCounter(b, "commit");
    assert.deepStrictEqual(tracker.getTrackedIds().sort(), ["a", "b"]);
  });
  test("tracker treats corrupted storage as empty", () => {
    storage.store(SESSIONS_KEY, "{not valid json", StorageScope.APPLICATION, StorageTarget.MACHINE);
    const recoveredTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.deepStrictEqual(recoveredTracker.getTrackedIds(), []);
  });
  test("evicts the oldest entry when capacity is exceeded", () => {
    const now = Date.now();
    const stored = {};
    for (let i = 0; i < MAX_TRACKED_SESSIONS; i++) {
      stored[`existing-${i}`] = {
        providerId: "p",
        providerType: "t",
        sessionResourceUri: `session://existing-${i}`,
        workspaceUriString: "",
        isolationKind: "folder",
        hasGitRepository: false,
        isVirtualWorkspace: false,
        firstRequestSentInThisClient: false,
        hasWorktreeCreatedTask: void 0,
        configuredTasksCount: void 0,
        firstObservedAt: now + i,
        // existing-0 is oldest
        firstRequestSentAt: 0,
        appLaunchCountAtFirstObserved: 1,
        requestsSent: 0,
        chatCount: 0,
        feedbackAdded: 0,
        feedbackConverted: 0,
        feedbackReplyAdded: 0,
        feedbackSubmitted: 0,
        createPullRequest: 0,
        createDraftPullRequest: 0,
        updatePullRequest: 0,
        mergePullRequest: 0,
        checkoutPullRequest: 0,
        initializeRepository: 0,
        commit: 0,
        commitAndSync: 0,
        sessionRestored: 0,
        stickinessToggled: 0,
        maximizeToggled: 0,
        chatDeleted: 0,
        chatRenamed: 0,
        fixCIChecks: 0,
        taskRun: 0,
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0
      };
    }
    storage.store(SESSIONS_KEY, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const capTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.strictEqual(capTracker.getTrackedIds().length, MAX_TRACKED_SESSIONS);
    const newSession = createSession("brand-new");
    capTracker.recordNewChatRequestSent(newSession);
    const ids = capTracker.getTrackedIds();
    assert.strictEqual(ids.length, MAX_TRACKED_SESSIONS);
    assert.strictEqual(ids.includes("brand-new"), true);
    assert.strictEqual(ids.includes("existing-0"), false, "oldest entry should have been evicted");
    assert.strictEqual(ids.includes("existing-1"), true, "second-oldest entry should still be tracked");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL3Nlc3Npb25zTGlmZWN5Y2xlVHJhY2tlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25DaGFuZ2VzU3VtbWFyeSwgSVNlc3Npb25GaWxlQ2hhbmdlLCBJU2Vzc2lvbkZvbGRlciwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBNQVhfVFJBQ0tFRF9TRVNTSU9OUywgU0VTU0lPTlNfS0VZLCBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zTGlmZWN5Y2xlVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5pbnRlcmZhY2UgSUNyZWF0ZVNlc3Npb25PcHRpb25zIHtcblx0cHJvdmlkZXJJZD86IHN0cmluZztcblx0c2Vzc2lvblR5cGU/OiBzdHJpbmc7XG5cdHdvcmtzcGFjZT86IElTZXNzaW9uV29ya3NwYWNlO1xuXHRjaGFuZ2VzPzogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW107XG5cdGNoYW5nZXNTdW1tYXJ5PzogSVNlc3Npb25DaGFuZ2VzU3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihpZDogc3RyaW5nLCBvcHRzOiBJQ3JlYXRlU2Vzc2lvbk9wdGlvbnMgPSB7fSk6IElTZXNzaW9uIHtcblx0Y29uc3QgcHJvdmlkZXJJZCA9IG9wdHMucHJvdmlkZXJJZCA/PyAndGVzdC1wcm92aWRlcic7XG5cdGNvbnN0IHNlc3Npb25UeXBlID0gb3B0cy5zZXNzaW9uVHlwZSA/PyAndGVzdC10eXBlJztcblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uSWQ6IGlkLFxuXHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHNlc3Npb246Ly8ke2lkfWApLFxuXHRcdHByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGUsXG5cdFx0aWNvbjogQ29kaWNvbi5hY2NvdW50LFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0XHR3b3Jrc3BhY2U6IG9ic2VydmFibGVWYWx1ZShgd29ya3NwYWNlLSR7aWR9YCwgb3B0cy53b3Jrc3BhY2UpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoYHRpdGxlLSR7aWR9YCwgaWQpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKGB1cGRhdGVkQXQtJHtpZH1gLCBuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZShgc3RhdHVzLSR7aWR9YCwgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdGNoYW5nZXNldHM6IG9ic2VydmFibGVWYWx1ZShgY2hhbmdlc2V0cy0ke2lkfWAsIFtdKSxcblx0XHRjaGFuZ2VzOiBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXMtJHtpZH1gLCBvcHRzLmNoYW5nZXMgPz8gW10pLFxuXHRcdGNoYW5nZXNTdW1tYXJ5OiBvcHRzLmNoYW5nZXNTdW1tYXJ5ICE9PSB1bmRlZmluZWQgPyBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXNTdW1tYXJ5LSR7aWR9YCwgb3B0cy5jaGFuZ2VzU3VtbWFyeSBhcyBJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkKSA6IHVuZGVmaW5lZCxcblx0XHRtb2RlbElkOiBvYnNlcnZhYmxlVmFsdWUoYG1vZGVsSWQtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZShgbW9kZS0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKGBsb2FkaW5nLSR7aWR9YCwgZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IG9ic2VydmFibGVWYWx1ZShgaXNBcmNoaXZlZC0ke2lkfWAsIGZhbHNlKSxcblx0XHRpc1JlYWQ6IG9ic2VydmFibGVWYWx1ZShgaXNSZWFkLSR7aWR9YCwgdHJ1ZSksXG5cdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZShgZGVzY3JpcHRpb24tJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGxhc3RUdXJuRW5kOiBvYnNlcnZhYmxlVmFsdWUoYGxhc3RUdXJuRW5kLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRjaGF0czogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KGBjaGF0cy0ke2lkfWAsIFtdKSxcblx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlPElDaGF0Pih1bmRlZmluZWQhKSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZSh1cmk6IFVSSSwgZm9sZGVyczogSVNlc3Npb25Gb2xkZXJbXSk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0cmV0dXJuIHtcblx0XHR1cmksXG5cdFx0bGFiZWw6ICd3cycsXG5cdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZm9sZGVyJyksXG5cdFx0Zm9sZGVycyxcblx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHVyaS5zY2hlbWUgIT09ICdmaWxlJyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRm9sZGVyKHVyaTogVVJJLCBvcHRzOiB7IHJlYWRvbmx5IHdvcmtUcmVlVXJpPzogVVJJOyByZWFkb25seSB3aXRoR2l0UmVwb3NpdG9yeT86IGJvb2xlYW4gfSA9IHt9KTogSVNlc3Npb25Gb2xkZXIge1xuXHRyZXR1cm4ge1xuXHRcdHJvb3Q6IHVyaSxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0bmFtZTogJ2ZvbGRlcicsXG5cdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRnaXRSZXBvc2l0b3J5OiAob3B0cy53aXRoR2l0UmVwb3NpdG9yeSB8fCBvcHRzLndvcmtUcmVlVXJpKVxuXHRcdFx0PyB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0d29ya1RyZWVVcmk6IG9wdHMud29ya1RyZWVVcmksXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0fVxuXHRcdFx0OiB1bmRlZmluZWQsXG5cdH07XG59XG5cbnN1aXRlKCdTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IHN0b3JhZ2U6IEluTWVtb3J5U3RvcmFnZVNlcnZpY2U7XG5cdGxldCB0cmFja2VyOiBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0dHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyKHN0b3JhZ2UpKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzIHVudHJhY2tlZCB1bnRpbCBhIHVzZXIgaW50ZXJhY3Rpb24gaXMgcmVjb3JkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNUcmFja2VkKHNlc3Npb24uc2Vzc2lvbklkKSwgZmFsc2UpO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWxpemUgZW1pdHMgc3VtbWFyeSBhbmQgcmVtb3ZlcyB0cmFja2luZyBlbnRyeScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdmZWVkYmFja0FkZGVkJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnZmVlZGJhY2tBZGRlZCcpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2NvbW1pdCcpO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5hZ2VudFNlc3Npb25JZCwgJ3MxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLnByb3ZpZGVySWQsICd0ZXN0LXByb3ZpZGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLnByb3ZpZGVyVHlwZSwgJ3Rlc3QtdHlwZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5kb25lUmVhc29uLCAnYXJjaGl2ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucmVxdWVzdHNTZW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEuZmVlZGJhY2tBZGRlZCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLmNvbW1pdCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLmZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzVHJhY2tlZChzZXNzaW9uLnNlc3Npb25JZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWxpemUgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBzZXNzaW9uIGlzIG5vdCB0cmFja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKCdkb2VzLW5vdC1leGlzdCcsICdkZWxldGVkUmVtb3RlbHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdGUgcGVyc2lzdHMgYWNyb3NzIHRyYWNrZXIgaW5zdGFuY2VzIGFuZCBhcHAgbGF1bmNoIGNvdW50IGdyb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb24pO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2ZlZWRiYWNrQWRkZWQnKTtcblxuXHRcdGNvbnN0IHNlY29uZFRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlcihzdG9yYWdlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kVHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCB0cnVlKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gc2Vjb25kVHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5mZWVkYmFja0FkZGVkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucmVxdWVzdHNTZW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEuYXBwTGF1bmNoZXNTaW5jZUZpcnN0T2JzZXJ2ZWQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGF0Q291bnQgaW5jcmVtZW50cyBvbmNlIHBlciByZWNvcmRSZXF1ZXN0U2VudCBjYWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnZmVlZGJhY2tBZGRlZCcpOyAvLyBidW1wQ291bnRlciBzaG91bGQgbm90IGFmZmVjdCBjaGF0Q291bnRcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEuY2hhdENvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucmVxdWVzdHNTZW50LCAzKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VHJhY2tlZEVudHJpZXMgcmV0dXJucyBzZXNzaW9uSWQgcGx1cyBwcm92aWRlcklkIGZvciBlYWNoIGVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVTZXNzaW9uKCdhJywgeyBwcm92aWRlcklkOiAncHJvdmlkZXItYScgfSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVNlc3Npb24oJ2InLCB7IHByb3ZpZGVySWQ6ICdwcm92aWRlci1iJyB9KTtcblxuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KGEpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoYiwgJ2NvbW1pdCcpO1xuXG5cdFx0Y29uc3QgZW50cmllcyA9IHRyYWNrZXIuZ2V0VHJhY2tlZEVudHJpZXMoKVxuXHRcdFx0Lm1hcChlID0+IGAke2UucHJvdmlkZXJJZH06JHtlLnNlc3Npb25JZH1gKVxuXHRcdFx0LnNvcnQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cmllcywgWydwcm92aWRlci1hOmEnLCAncHJvdmlkZXItYjpiJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBhcmNoaXZlIHRoZW4gZGVmZXJyZWQgcmVtb3RlIHNpZ25hbCB5aWVsZHMgYSBzaW5nbGUgc3VtbWFyeScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGxvY2FsU3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5vayhsb2NhbFN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbFN1bW1hcnkhLmRvbmVSZWFzb24sICdhcmNoaXZlZCcpO1xuXG5cdFx0Y29uc3QgZGVmZXJyZWRTdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkUmVtb3RlbHknLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWRTdW1tYXJ5LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidW1wQ291bnRlciBjcmVhdGVzIGEgdHJhY2tpbmcgZW50cnkgZm9yIHByZXZpb3VzbHkgdW50cmFja2VkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnY29tbWl0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCB0cnVlKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5jb21taXQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5yZXF1ZXN0c1NlbnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5maXJzdFJlcXVlc3RTZW50SW5UaGlzQ2xpZW50LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1bXBDb3VudGVyIGluY3JlbWVudHMgZGlzdGluY3QgY291bnRlciBrZXlzIGluZGVwZW5kZW50bHknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdjaGF0UmVuYW1lZCcpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2NoYXRSZW5hbWVkJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAndGFza1J1bicpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ21lcmdlUHVsbFJlcXVlc3QnKTtcblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdmaXhDSUNoZWNrcycpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2ZpeENJQ2hlY2tzJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnZml4Q0lDaGVja3MnKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjaGF0UmVuYW1lZDogc3VtbWFyeSEuY2hhdFJlbmFtZWQsXG5cdFx0XHR0YXNrUnVuOiBzdW1tYXJ5IS50YXNrUnVuLFxuXHRcdFx0bWVyZ2VQdWxsUmVxdWVzdDogc3VtbWFyeSEubWVyZ2VQdWxsUmVxdWVzdCxcblx0XHRcdGZpeENJQ2hlY2tzOiBzdW1tYXJ5IS5maXhDSUNoZWNrcyxcblx0XHRcdGNvbW1pdDogc3VtbWFyeSEuY29tbWl0LFxuXHRcdH0sIHtcblx0XHRcdGNoYXRSZW5hbWVkOiAyLFxuXHRcdFx0dGFza1J1bjogMSxcblx0XHRcdG1lcmdlUHVsbFJlcXVlc3Q6IDEsXG5cdFx0XHRmaXhDSUNoZWNrczogMyxcblx0XHRcdGNvbW1pdDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlU2Vzc2lvblN0YXRlIGlzIGEgbm8tb3AgZm9yIHVudHJhY2tlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7IGNoYW5nZXM6IFt7IG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYScpLCBpbnNlcnRpb25zOiA1LCBkZWxldGlvbnM6IDEgfV0gfSk7XG5cblx0XHR0cmFja2VyLnVwZGF0ZVNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzVHJhY2tlZChzZXNzaW9uLnNlc3Npb25JZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlc1N1bW1hcnkgb2JzZXJ2YWJsZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGNoYW5nZXMgbGlzdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7XG5cdFx0XHRjaGFuZ2VzOiBbXG5cdFx0XHRcdHsgbW9kaWZpZWRVcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9hJyksIGluc2VydGlvbnM6IDUsIGRlbGV0aW9uczogMSB9LFxuXHRcdFx0XHR7IG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYicpLCBpbnNlcnRpb25zOiAyLCBkZWxldGlvbnM6IDMgfSxcblx0XHRcdF0sXG5cdFx0XHRjaGFuZ2VzU3VtbWFyeTogeyBmaWxlczogMTcsIGFkZGl0aW9uczogOTksIGRlbGV0aW9uczogODggfSxcblx0XHR9KTtcblxuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb24pO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpbGVzQ2hhbmdlZDogc3VtbWFyeSEuZmlsZXNDaGFuZ2VkLFxuXHRcdFx0bGluZXNBZGRlZDogc3VtbWFyeSEubGluZXNBZGRlZCxcblx0XHRcdGxpbmVzRGVsZXRlZDogc3VtbWFyeSEubGluZXNEZWxldGVkLFxuXHRcdH0sIHtcblx0XHRcdGZpbGVzQ2hhbmdlZDogMTcsXG5cdFx0XHRsaW5lc0FkZGVkOiA5OSxcblx0XHRcdGxpbmVzRGVsZXRlZDogODgsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYWdncmVnYXRpbmcgY2hhbmdlcyB3aGVuIGNoYW5nZXNTdW1tYXJ5IGlzIGFic2VudCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7XG5cdFx0XHRjaGFuZ2VzOiBbXG5cdFx0XHRcdHsgbW9kaWZpZWRVcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9hJyksIGluc2VydGlvbnM6IDUsIGRlbGV0aW9uczogMSB9LFxuXHRcdFx0XHR7IG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYicpLCBpbnNlcnRpb25zOiAyLCBkZWxldGlvbnM6IDMgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaWxlc0NoYW5nZWQ6IHN1bW1hcnkhLmZpbGVzQ2hhbmdlZCxcblx0XHRcdGxpbmVzQWRkZWQ6IHN1bW1hcnkhLmxpbmVzQWRkZWQsXG5cdFx0XHRsaW5lc0RlbGV0ZWQ6IHN1bW1hcnkhLmxpbmVzRGVsZXRlZCxcblx0XHR9LCB7XG5cdFx0XHRmaWxlc0NoYW5nZWQ6IDIsXG5cdFx0XHRsaW5lc0FkZGVkOiA3LFxuXHRcdFx0bGluZXNEZWxldGVkOiA0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdW1tYXJ5IGRlcml2ZXMgd29ya3NwYWNlIGZpZWxkcyBmcm9tIHRoZSBzZXNzaW9uIHdvcmtzcGFjZSBhdCBmaXJzdCBvYnNlcnZhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkucGFyc2UoJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L3JlcG8nKTtcblx0XHRjb25zdCByZXBvVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCBbXG5cdFx0XHRjcmVhdGVGb2xkZXIocmVwb1VyaSwgeyB3b3JrVHJlZVVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vLmdpdC93b3JrdHJlZXMvZmVhdHVyZScpIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScsIHsgd29ya3NwYWNlIH0pO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNvbGF0aW9uS2luZDogc3VtbWFyeSEuaXNvbGF0aW9uS2luZCxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHN1bW1hcnkhLmhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHN1bW1hcnkhLmlzVmlydHVhbFdvcmtzcGFjZSxcblx0XHRcdHdvcmtzcGFjZUhhc2g6IHN1bW1hcnkhLndvcmtzcGFjZUhhc2gsXG5cdFx0fSwge1xuXHRcdFx0aXNvbGF0aW9uS2luZDogJ3dvcmt0cmVlJyxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHRydWUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHRydWUsXG5cdFx0XHR3b3Jrc3BhY2VIYXNoOiBoYXNoKHdvcmtzcGFjZVVyaS50b1N0cmluZygpKS50b1N0cmluZygxNiksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1bW1hcnkgcmVwb3J0cyBmb2xkZXIgaXNvbGF0aW9uIGZvciBhIHBsYWluIGZpbGUgd29ya3NwYWNlIHdpdGggbm8gd29ya3RyZWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCBbXG5cdFx0XHRjcmVhdGVGb2xkZXIod29ya3NwYWNlVXJpLCB7IHdpdGhHaXRSZXBvc2l0b3J5OiB0cnVlIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScsIHsgd29ya3NwYWNlIH0pO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNvbGF0aW9uS2luZDogc3VtbWFyeSEuaXNvbGF0aW9uS2luZCxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHN1bW1hcnkhLmhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHN1bW1hcnkhLmlzVmlydHVhbFdvcmtzcGFjZSxcblx0XHR9LCB7XG5cdFx0XHRpc29sYXRpb25LaW5kOiAnZm9sZGVyJyxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHRydWUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRGaXJzdFJlcXVlc3RUYXNrSW5mbyBpcyBhIG5vLW9wIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IHRyYWNrZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cblx0XHR0cmFja2VyLnJlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvKHNlc3Npb24sIHsgaGFzV29ya3RyZWVDcmVhdGVkVGFzazogdHJ1ZSwgY29uZmlndXJlZFRhc2tzQ291bnQ6IDMgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvIG9ubHkgcmVjb3JkcyB0aGUgZmlyc3QgY2FsbCBwZXIgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblxuXHRcdHRyYWNrZXIucmVjb3JkRmlyc3RSZXF1ZXN0VGFza0luZm8oc2Vzc2lvbiwgeyBoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiB0cnVlLCBjb25maWd1cmVkVGFza3NDb3VudDogNCB9KTtcblx0XHR0cmFja2VyLnJlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvKHNlc3Npb24sIHsgaGFzV29ya3RyZWVDcmVhdGVkVGFzazogZmFsc2UsIGNvbmZpZ3VyZWRUYXNrc0NvdW50OiAwIH0pO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IHN1bW1hcnkhLmhhc1dvcmt0cmVlQ3JlYXRlZFRhc2ssXG5cdFx0XHRjb25maWd1cmVkVGFza3NDb3VudDogc3VtbWFyeSEuY29uZmlndXJlZFRhc2tzQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogdHJ1ZSxcblx0XHRcdGNvbmZpZ3VyZWRUYXNrc0NvdW50OiA0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRGaXJzdFJlcXVlc3RUYXNrSW5mbyBwZXJzaXN0cyBhY3Jvc3MgdHJhY2tlciBpbnN0YW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5yZWNvcmRGaXJzdFJlcXVlc3RUYXNrSW5mbyhzZXNzaW9uLCB7IGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IGZhbHNlLCBjb25maWd1cmVkVGFza3NDb3VudDogMiB9KTtcblxuXHRcdGNvbnN0IHNlY29uZFRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlcihzdG9yYWdlKSk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHNlY29uZFRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogc3VtbWFyeSEuaGFzV29ya3RyZWVDcmVhdGVkVGFzayxcblx0XHRcdGNvbmZpZ3VyZWRUYXNrc0NvdW50OiBzdW1tYXJ5IS5jb25maWd1cmVkVGFza3NDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiBmYWxzZSxcblx0XHRcdGNvbmZpZ3VyZWRUYXNrc0NvdW50OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdW1tYXJ5IHJlcG9ydHMgdGFzayBpbmZvIGFzIHVuZGVmaW5lZCB3aGVuIG5ldmVyIHJlY29yZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IHN1bW1hcnkhLmhhc1dvcmt0cmVlQ3JlYXRlZFRhc2ssXG5cdFx0XHRjb25maWd1cmVkVGFza3NDb3VudDogc3VtbWFyeSEuY29uZmlndXJlZFRhc2tzQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlndXJlZFRhc2tzQ291bnQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyByZXR1cm5zIHBvc3QtaW5jcmVtZW50IHZhbHVlcyBwZXIgcHJvdmlkZXIsIHdvcmtzcGFjZSBhbmQgdG90YWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQSA9IGNyZWF0ZVdvcmtzcGFjZShVUkkucGFyc2UoJ2ZpbGU6Ly8vd3MvYScpLCBbY3JlYXRlRm9sZGVyKFVSSS5wYXJzZSgnZmlsZTovLy93cy9hJykpXSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQiA9IGNyZWF0ZVdvcmtzcGFjZShVUkkucGFyc2UoJ2ZpbGU6Ly8vd3MvYicpLCBbY3JlYXRlRm9sZGVyKFVSSS5wYXJzZSgnZmlsZTovLy93cy9iJykpXSk7XG5cdFx0Y29uc3QgYTEgPSBjcmVhdGVTZXNzaW9uKCdhMScsIHsgcHJvdmlkZXJJZDogJ3AxJywgd29ya3NwYWNlOiB3b3Jrc3BhY2VBIH0pO1xuXHRcdGNvbnN0IGEyID0gY3JlYXRlU2Vzc2lvbignYTInLCB7IHByb3ZpZGVySWQ6ICdwMScsIHdvcmtzcGFjZTogd29ya3NwYWNlQSB9KTtcblx0XHRjb25zdCBiID0gY3JlYXRlU2Vzc2lvbignYicsIHsgcHJvdmlkZXJJZDogJ3AyJywgd29ya3NwYWNlOiB3b3Jrc3BhY2VCIH0pO1xuXHRcdGNvbnN0IG5vV29ya3NwYWNlID0gY3JlYXRlU2Vzc2lvbignbicsIHsgcHJvdmlkZXJJZDogJ3AxJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKGExKSwgeyB1c2VyU2Vzc2lvbnNUb3RhbDogMSwgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDEsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAxIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKGEyKSwgeyB1c2VyU2Vzc2lvbnNUb3RhbDogMiwgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDIsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKGIpLCB7IHVzZXJTZXNzaW9uc1RvdGFsOiAzLCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMSwgdXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMobm9Xb3Jrc3BhY2UpLCB7IHVzZXJTZXNzaW9uc1RvdGFsOiA0LCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMCwgdXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDMgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1bW1hcnkgaW5jbHVkZXMgdGhlIHJlcXVlc3QgY291bnRlcnMgYXMgb2JzZXJ2ZWQgYXQgZmluYWxpemUgdGltZScsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VBID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy93cy9hJyksIFtjcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSldKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VCID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy93cy9iJyksIFtjcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2InKSldKTtcblx0XHRjb25zdCBzZXNzaW9uVG9GaW5hbGl6ZSA9IGNyZWF0ZVNlc3Npb24oJ2ExJywgeyBwcm92aWRlcklkOiAncDEnLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZUEgfSk7XG5cdFx0Y29uc3Qgb3RoZXJTYW1lV29ya3NwYWNlID0gY3JlYXRlU2Vzc2lvbignYTInLCB7IHByb3ZpZGVySWQ6ICdwMScsIHdvcmtzcGFjZTogd29ya3NwYWNlQSB9KTtcblx0XHRjb25zdCBvdGhlckRpZmZlcmVudEV2ZXJ5dGhpbmcgPSBjcmVhdGVTZXNzaW9uKCdiJywgeyBwcm92aWRlcklkOiAncDInLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZUIgfSk7XG5cblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uVG9GaW5hbGl6ZSk7XG5cdFx0dHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb25Ub0ZpbmFsaXplKTtcblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMob3RoZXJTYW1lV29ya3NwYWNlKTtcblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMob3RoZXJEaWZmZXJlbnRFdmVyeXRoaW5nKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb25Ub0ZpbmFsaXplLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvblRvRmluYWxpemUpO1xuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVzZXJTZXNzaW9uc1RvdGFsOiBzdW1tYXJ5IS51c2VyU2Vzc2lvbnNUb3RhbCxcblx0XHRcdHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiBzdW1tYXJ5IS51c2VyU2Vzc2lvbnNJbldvcmtzcGFjZSxcblx0XHRcdHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiBzdW1tYXJ5IS51c2VyU2Vzc2lvbnNGb3JQcm92aWRlcixcblx0XHR9LCB7XG5cdFx0XHR1c2VyU2Vzc2lvbnNUb3RhbDogMyxcblx0XHRcdHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiAyLFxuXHRcdFx0dXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3QgY291bnRlcnMgcGVyc2lzdCBhY3Jvc3MgdHJhY2tlciBpbnN0YW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy93cy9hJyksIFtjcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSldKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignYTEnLCB7IHByb3ZpZGVySWQ6ICdwMScsIHdvcmtzcGFjZSB9KTtcblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc2Vjb25kVHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyKHN0b3JhZ2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY29uZFRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhzZXNzaW9uKSwgeyB1c2VyU2Vzc2lvbnNUb3RhbDogMywgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDMsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAzIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRVc2VyUmVxdWVzdENvdW50ZXJzIHJldHVybnMgY3VycmVudCB2YWx1ZXMgd2l0aG91dCBpbmNyZW1lbnRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy93cy9hJyksIFtjcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSldKTtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignYTEnLCB7IHByb3ZpZGVySWQ6ICdwMScsIHdvcmtzcGFjZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5nZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb24pLCB7IHVzZXJTZXNzaW9uc1RvdGFsOiAwLCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMCwgdXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDAgfSk7XG5cblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFja2VyLmdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbiksIHsgdXNlclNlc3Npb25zVG90YWw6IDIsIHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiAyLCB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMiB9KTtcblx0XHQvLyBSZXBlYXRlZCByZWFkcyBkbyBub3QgbXV0YXRlIHN0YXRlLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5nZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb24pLCB7IHVzZXJTZXNzaW9uc1RvdGFsOiAyLCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMiwgdXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDIgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1bW1hcnkgcmVwb3J0cyB6ZXJvIHJlcXVlc3QgY291bnRlcnMgZm9yIGFuIHVudG91Y2hlZCBwcm92aWRlci93b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnY29tbWl0Jyk7XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dXNlclNlc3Npb25zVG90YWw6IHN1bW1hcnkhLnVzZXJTZXNzaW9uc1RvdGFsLFxuXHRcdFx0dXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IHN1bW1hcnkhLnVzZXJTZXNzaW9uc0luV29ya3NwYWNlLFxuXHRcdFx0dXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IHN1bW1hcnkhLnVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyLFxuXHRcdH0sIHtcblx0XHRcdHVzZXJTZXNzaW9uc1RvdGFsOiAwLFxuXHRcdFx0dXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDAsXG5cdFx0XHR1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VHJhY2tlZElkcyByZXR1cm5zIGlkcyBvZiBhbGwgdHJhY2tlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBhID0gY3JlYXRlU2Vzc2lvbignYScpO1xuXHRcdGNvbnN0IGIgPSBjcmVhdGVTZXNzaW9uKCdiJyk7XG5cblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChhKTtcblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKGIsICdjb21taXQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5nZXRUcmFja2VkSWRzKCkuc29ydCgpLCBbJ2EnLCAnYiddKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tlciB0cmVhdHMgY29ycnVwdGVkIHN0b3JhZ2UgYXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0c3RvcmFnZS5zdG9yZShTRVNTSU9OU19LRVksICd7bm90IHZhbGlkIGpzb24nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCByZWNvdmVyZWRUcmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXIoc3RvcmFnZSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvdmVyZWRUcmFja2VyLmdldFRyYWNrZWRJZHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdldmljdHMgdGhlIG9sZGVzdCBlbnRyeSB3aGVuIGNhcGFjaXR5IGlzIGV4Y2VlZGVkJywgKCkgPT4ge1xuXHRcdC8vIFByZS1wb3B1bGF0ZSBzdG9yYWdlIHdpdGggTUFYX1RSQUNLRURfU0VTU0lPTlMgZW50cmllczsgdGhlIG9sZGVzdFxuXHRcdC8vIGVudHJ5IGhhcyB0aGUgc21hbGxlc3QgZmlyc3RPYnNlcnZlZEF0IHNvIGl0IHNob3VsZCBiZSBldmljdGVkIHdoZW5cblx0XHQvLyBvbmUgbW9yZSBzZXNzaW9uIGlzIGFkZGVkLlxuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3Qgc3RvcmVkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTUFYX1RSQUNLRURfU0VTU0lPTlM7IGkrKykge1xuXHRcdFx0c3RvcmVkW2BleGlzdGluZy0ke2l9YF0gPSB7XG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdwJyxcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiAndCcsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZVVyaTogYHNlc3Npb246Ly9leGlzdGluZy0ke2l9YCxcblx0XHRcdFx0d29ya3NwYWNlVXJpU3RyaW5nOiAnJyxcblx0XHRcdFx0aXNvbGF0aW9uS2luZDogJ2ZvbGRlcicsXG5cdFx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0XHRmaXJzdFJlcXVlc3RTZW50SW5UaGlzQ2xpZW50OiBmYWxzZSxcblx0XHRcdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maWd1cmVkVGFza3NDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmaXJzdE9ic2VydmVkQXQ6IG5vdyArIGksIC8vIGV4aXN0aW5nLTAgaXMgb2xkZXN0XG5cdFx0XHRcdGZpcnN0UmVxdWVzdFNlbnRBdDogMCxcblx0XHRcdFx0YXBwTGF1bmNoQ291bnRBdEZpcnN0T2JzZXJ2ZWQ6IDEsXG5cdFx0XHRcdHJlcXVlc3RzU2VudDogMCwgY2hhdENvdW50OiAwLFxuXHRcdFx0XHRmZWVkYmFja0FkZGVkOiAwLCBmZWVkYmFja0NvbnZlcnRlZDogMCwgZmVlZGJhY2tSZXBseUFkZGVkOiAwLCBmZWVkYmFja1N1Ym1pdHRlZDogMCxcblx0XHRcdFx0Y3JlYXRlUHVsbFJlcXVlc3Q6IDAsIGNyZWF0ZURyYWZ0UHVsbFJlcXVlc3Q6IDAsIHVwZGF0ZVB1bGxSZXF1ZXN0OiAwLCBtZXJnZVB1bGxSZXF1ZXN0OiAwLCBjaGVja291dFB1bGxSZXF1ZXN0OiAwLFxuXHRcdFx0XHRpbml0aWFsaXplUmVwb3NpdG9yeTogMCwgY29tbWl0OiAwLCBjb21taXRBbmRTeW5jOiAwLFxuXHRcdFx0XHRzZXNzaW9uUmVzdG9yZWQ6IDAsIHN0aWNraW5lc3NUb2dnbGVkOiAwLCBtYXhpbWl6ZVRvZ2dsZWQ6IDAsXG5cdFx0XHRcdGNoYXREZWxldGVkOiAwLCBjaGF0UmVuYW1lZDogMCwgZml4Q0lDaGVja3M6IDAsIHRhc2tSdW46IDAsXG5cdFx0XHRcdGZpbGVzQ2hhbmdlZDogMCwgbGluZXNBZGRlZDogMCwgbGluZXNEZWxldGVkOiAwLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0c3RvcmFnZS5zdG9yZShTRVNTSU9OU19LRVksIEpTT04uc3RyaW5naWZ5KHN0b3JlZCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IGNhcFRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlcihzdG9yYWdlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcFRyYWNrZXIuZ2V0VHJhY2tlZElkcygpLmxlbmd0aCwgTUFYX1RSQUNLRURfU0VTU0lPTlMpO1xuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ2JyYW5kLW5ldycpO1xuXHRcdGNhcFRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KG5ld1Nlc3Npb24pO1xuXG5cdFx0Y29uc3QgaWRzID0gY2FwVHJhY2tlci5nZXRUcmFja2VkSWRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkcy5sZW5ndGgsIE1BWF9UUkFDS0VEX1NFU1NJT05TKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRzLmluY2x1ZGVzKCdicmFuZC1uZXcnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkcy5pbmNsdWRlcygnZXhpc3RpbmctMCcpLCBmYWxzZSwgJ29sZGVzdCBlbnRyeSBzaG91bGQgaGF2ZSBiZWVuIGV2aWN0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRzLmluY2x1ZGVzKCdleGlzdGluZy0xJyksIHRydWUsICdzZWNvbmQtb2xkZXN0IGVudHJ5IHNob3VsZCBzdGlsbCBiZSB0cmFja2VkJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCLGNBQWMscUJBQXFCO0FBQ3BFLFNBQXlHLHFCQUFxQjtBQUM5SCxTQUFTLHNCQUFzQixjQUFjLGdDQUFnQztBQUM3RSxTQUFTLGlCQUFpQjtBQVUxQixTQUFTLGNBQWMsSUFBWSxPQUE4QixDQUFDLEdBQWE7QUFDOUUsUUFBTSxhQUFhLEtBQUssY0FBYztBQUN0QyxRQUFNLGNBQWMsS0FBSyxlQUFlO0FBQ3hDLFNBQU87QUFBQSxJQUNOLFdBQVc7QUFBQSxJQUNYLFVBQVUsSUFBSSxNQUFNLGFBQWEsRUFBRSxFQUFFO0FBQUEsSUFDckM7QUFBQSxJQUNBO0FBQUEsSUFDQSxNQUFNLFFBQVE7QUFBQSxJQUNkLFdBQVcsb0JBQUksS0FBSztBQUFBLElBQ3BCLFdBQVcsZ0JBQWdCLGFBQWEsRUFBRSxJQUFJLEtBQUssU0FBUztBQUFBLElBQzVELE9BQU8sZ0JBQWdCLFNBQVMsRUFBRSxJQUFJLEVBQUU7QUFBQSxJQUN4QyxXQUFXLGdCQUFnQixhQUFhLEVBQUUsSUFBSSxvQkFBSSxLQUFLLENBQUM7QUFBQSxJQUN4RCxRQUFRLGdCQUFnQixVQUFVLEVBQUUsSUFBSSxjQUFjLFNBQVM7QUFBQSxJQUMvRCxZQUFZLGdCQUFnQixjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUNsRCxTQUFTLGdCQUFnQixXQUFXLEVBQUUsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQUEsSUFDNUQsZ0JBQWdCLEtBQUssbUJBQW1CLFNBQVksZ0JBQWdCLGtCQUFrQixFQUFFLElBQUksS0FBSyxjQUFvRCxJQUFJO0FBQUEsSUFDekosU0FBUyxnQkFBZ0IsV0FBVyxFQUFFLElBQUksTUFBUztBQUFBLElBQ25ELE1BQU0sZ0JBQWdCLFFBQVEsRUFBRSxJQUFJLE1BQVM7QUFBQSxJQUM3QyxTQUFTLGdCQUFnQixXQUFXLEVBQUUsSUFBSSxLQUFLO0FBQUEsSUFDL0MsWUFBWSxnQkFBZ0IsY0FBYyxFQUFFLElBQUksS0FBSztBQUFBLElBQ3JELFFBQVEsZ0JBQWdCLFVBQVUsRUFBRSxJQUFJLElBQUk7QUFBQSxJQUM1QyxhQUFhLGdCQUFnQixlQUFlLEVBQUUsSUFBSSxNQUFTO0FBQUEsSUFDM0QsYUFBYSxnQkFBZ0IsZUFBZSxFQUFFLElBQUksTUFBUztBQUFBLElBQzNELE9BQU8sZ0JBQWtDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUFBLElBQzFELFVBQVUsZ0JBQXVCLE1BQVU7QUFBQSxJQUMzQyxjQUFjLGdCQUFnQixFQUFFLHVCQUF1QixNQUFNLENBQUM7QUFBQSxFQUMvRDtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsS0FBVSxTQUE4QztBQUNoRixTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsT0FBTztBQUFBLElBQ1AsTUFBTSxVQUFVLE9BQU8sUUFBUTtBQUFBLElBQy9CO0FBQUEsSUFDQSx3QkFBd0I7QUFBQSxJQUN4QixvQkFBb0IsSUFBSSxXQUFXO0FBQUEsRUFDcEM7QUFDRDtBQUVBLFNBQVMsYUFBYSxLQUFVLE9BQTZFLENBQUMsR0FBbUI7QUFDaEksU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sa0JBQWtCO0FBQUEsSUFDbEIsTUFBTTtBQUFBLElBQ04sYUFBYTtBQUFBLElBQ2IsZUFBZ0IsS0FBSyxxQkFBcUIsS0FBSyxjQUM1QztBQUFBLE1BQ0Q7QUFBQSxNQUNBLGFBQWEsS0FBSztBQUFBLE1BQ2xCLGdCQUFnQjtBQUFBLE1BQ2hCLFlBQVksZ0JBQWdCLE1BQVM7QUFBQSxJQUN0QyxJQUNFO0FBQUEsRUFDSjtBQUNEO0FBRUEsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxRQUFNLGNBQWMsd0NBQXdDO0FBQzVELE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsY0FBVSxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN0RCxjQUFVLFlBQVksSUFBSSxJQUFJLHlCQUF5QixPQUFPLENBQUM7QUFBQSxFQUNoRSxDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFdBQU8sWUFBWSxRQUFRLFVBQVUsUUFBUSxTQUFTLEdBQUcsS0FBSztBQUU5RCxZQUFRLHlCQUF5QixPQUFPO0FBRXhDLFdBQU8sWUFBWSxRQUFRLFVBQVUsUUFBUSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sVUFBVSxjQUFjLElBQUk7QUFDbEMsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxZQUFRLFlBQVksU0FBUyxlQUFlO0FBQzVDLFlBQVEsWUFBWSxTQUFTLGVBQWU7QUFDNUMsWUFBUSxZQUFZLFNBQVMsUUFBUTtBQUVyQyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxZQUFZLFFBQVMsZ0JBQWdCLElBQUk7QUFDaEQsV0FBTyxZQUFZLFFBQVMsWUFBWSxlQUFlO0FBQ3ZELFdBQU8sWUFBWSxRQUFTLGNBQWMsV0FBVztBQUNyRCxXQUFPLFlBQVksUUFBUyxZQUFZLFVBQVU7QUFDbEQsV0FBTyxZQUFZLFFBQVMsY0FBYyxDQUFDO0FBQzNDLFdBQU8sWUFBWSxRQUFTLGVBQWUsQ0FBQztBQUM1QyxXQUFPLFlBQVksUUFBUyxRQUFRLENBQUM7QUFDckMsV0FBTyxZQUFZLFFBQVMsOEJBQThCLElBQUk7QUFDOUQsV0FBTyxZQUFZLFFBQVEsVUFBVSxRQUFRLFNBQVMsR0FBRyxLQUFLO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSxVQUFVLFFBQVEsU0FBUyxrQkFBa0IsaUJBQWlCO0FBQ3BFLFdBQU8sWUFBWSxTQUFTLE1BQVM7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFlBQVEseUJBQXlCLE9BQU87QUFDeEMsWUFBUSxZQUFZLFNBQVMsZUFBZTtBQUU1QyxVQUFNLGdCQUFnQixZQUFZLElBQUksSUFBSSx5QkFBeUIsT0FBTyxDQUFDO0FBRTNFLFdBQU8sWUFBWSxjQUFjLFVBQVUsUUFBUSxTQUFTLEdBQUcsSUFBSTtBQUNuRSxVQUFNLFVBQVUsY0FBYyxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFDN0UsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxZQUFZLFFBQVMsZUFBZSxDQUFDO0FBQzVDLFdBQU8sWUFBWSxRQUFTLGNBQWMsQ0FBQztBQUMzQyxXQUFPLFlBQVksUUFBUywrQkFBK0IsQ0FBQztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFVBQU0sVUFBVSxjQUFjLElBQUk7QUFFbEMsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxZQUFRLHlCQUF5QixPQUFPO0FBQ3hDLFlBQVEsWUFBWSxTQUFTLGVBQWU7QUFDNUMsWUFBUSx5QkFBeUIsT0FBTztBQUV4QyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxZQUFZLFFBQVMsV0FBVyxDQUFDO0FBQ3hDLFdBQU8sWUFBWSxRQUFTLGNBQWMsQ0FBQztBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sSUFBSSxjQUFjLEtBQUssRUFBRSxZQUFZLGFBQWEsQ0FBQztBQUN6RCxVQUFNLElBQUksY0FBYyxLQUFLLEVBQUUsWUFBWSxhQUFhLENBQUM7QUFFekQsWUFBUSx5QkFBeUIsQ0FBQztBQUNsQyxZQUFRLFlBQVksR0FBRyxRQUFRO0FBRS9CLFVBQU0sVUFBVSxRQUFRLGtCQUFrQixFQUN4QyxJQUFJLE9BQUssR0FBRyxFQUFFLFVBQVUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUN6QyxLQUFLO0FBRVAsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDLGdCQUFnQixjQUFjLENBQUM7QUFBQSxFQUNqRSxDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFlBQVEseUJBQXlCLE9BQU87QUFFeEMsVUFBTSxlQUFlLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQzVFLFdBQU8sR0FBRyxZQUFZO0FBQ3RCLFdBQU8sWUFBWSxhQUFjLFlBQVksVUFBVTtBQUV2RCxVQUFNLGtCQUFrQixRQUFRLFNBQVMsUUFBUSxXQUFXLG9CQUFvQixPQUFPO0FBQ3ZGLFdBQU8sWUFBWSxpQkFBaUIsTUFBUztBQUFBLEVBQzlDLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sVUFBVSxjQUFjLElBQUk7QUFFbEMsWUFBUSxZQUFZLFNBQVMsUUFBUTtBQUVyQyxXQUFPLFlBQVksUUFBUSxVQUFVLFFBQVEsU0FBUyxHQUFHLElBQUk7QUFDN0QsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQ3ZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sWUFBWSxRQUFTLFFBQVEsQ0FBQztBQUNyQyxXQUFPLFlBQVksUUFBUyxjQUFjLENBQUM7QUFDM0MsV0FBTyxZQUFZLFFBQVMsOEJBQThCLEtBQUs7QUFBQSxFQUNoRSxDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFVBQVUsY0FBYyxJQUFJO0FBRWxDLFlBQVEsWUFBWSxTQUFTLGFBQWE7QUFDMUMsWUFBUSxZQUFZLFNBQVMsYUFBYTtBQUMxQyxZQUFRLFlBQVksU0FBUyxTQUFTO0FBQ3RDLFlBQVEsWUFBWSxTQUFTLGtCQUFrQjtBQUMvQyxZQUFRLFlBQVksU0FBUyxhQUFhO0FBQzFDLFlBQVEsWUFBWSxTQUFTLGFBQWE7QUFDMUMsWUFBUSxZQUFZLFNBQVMsYUFBYTtBQUUxQyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFDdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixhQUFhLFFBQVM7QUFBQSxNQUN0QixTQUFTLFFBQVM7QUFBQSxNQUNsQixrQkFBa0IsUUFBUztBQUFBLE1BQzNCLGFBQWEsUUFBUztBQUFBLE1BQ3RCLFFBQVEsUUFBUztBQUFBLElBQ2xCLEdBQUc7QUFBQSxNQUNGLGFBQWE7QUFBQSxNQUNiLFNBQVM7QUFBQSxNQUNULGtCQUFrQjtBQUFBLE1BQ2xCLGFBQWE7QUFBQSxNQUNiLFFBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFVBQU0sVUFBVSxjQUFjLE1BQU0sRUFBRSxTQUFTLENBQUMsRUFBRSxhQUFhLElBQUksTUFBTSxXQUFXLEdBQUcsWUFBWSxHQUFHLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUV2SCxZQUFRLG1CQUFtQixPQUFPO0FBRWxDLFdBQU8sWUFBWSxRQUFRLFVBQVUsUUFBUSxTQUFTLEdBQUcsS0FBSztBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sVUFBVSxjQUFjLE1BQU07QUFBQSxNQUNuQyxTQUFTO0FBQUEsUUFDUixFQUFFLGFBQWEsSUFBSSxNQUFNLFdBQVcsR0FBRyxZQUFZLEdBQUcsV0FBVyxFQUFFO0FBQUEsUUFDbkUsRUFBRSxhQUFhLElBQUksTUFBTSxXQUFXLEdBQUcsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLE1BQ3BFO0FBQUEsTUFDQSxnQkFBZ0IsRUFBRSxPQUFPLElBQUksV0FBVyxJQUFJLFdBQVcsR0FBRztBQUFBLElBQzNELENBQUM7QUFFRCxZQUFRLHlCQUF5QixPQUFPO0FBQ3hDLFVBQU0sVUFBVSxRQUFRLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUV2RSxXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGNBQWMsUUFBUztBQUFBLE1BQ3ZCLFlBQVksUUFBUztBQUFBLE1BQ3JCLGNBQWMsUUFBUztBQUFBLElBQ3hCLEdBQUc7QUFBQSxNQUNGLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFVBQU0sVUFBVSxjQUFjLE1BQU07QUFBQSxNQUNuQyxTQUFTO0FBQUEsUUFDUixFQUFFLGFBQWEsSUFBSSxNQUFNLFdBQVcsR0FBRyxZQUFZLEdBQUcsV0FBVyxFQUFFO0FBQUEsUUFDbkUsRUFBRSxhQUFhLElBQUksTUFBTSxXQUFXLEdBQUcsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLE1BQ3BFO0FBQUEsSUFDRCxDQUFDO0FBRUQsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixjQUFjLFFBQVM7QUFBQSxNQUN2QixZQUFZLFFBQVM7QUFBQSxNQUNyQixjQUFjLFFBQVM7QUFBQSxJQUN4QixHQUFHO0FBQUEsTUFDRixjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvRkFBb0YsTUFBTTtBQUM5RixVQUFNLGVBQWUsSUFBSSxNQUFNLDJCQUEyQjtBQUMxRCxVQUFNLFVBQVUsSUFBSSxNQUFNLGNBQWM7QUFDeEMsVUFBTSxZQUFZLGdCQUFnQixjQUFjO0FBQUEsTUFDL0MsYUFBYSxTQUFTLEVBQUUsYUFBYSxJQUFJLE1BQU0scUNBQXFDLEVBQUUsQ0FBQztBQUFBLElBQ3hGLENBQUM7QUFDRCxVQUFNLFVBQVUsY0FBYyxNQUFNLEVBQUUsVUFBVSxDQUFDO0FBRWpELFlBQVEseUJBQXlCLE9BQU87QUFDeEMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBRXZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsZUFBZSxRQUFTO0FBQUEsTUFDeEIsa0JBQWtCLFFBQVM7QUFBQSxNQUMzQixvQkFBb0IsUUFBUztBQUFBLE1BQzdCLGVBQWUsUUFBUztBQUFBLElBQ3pCLEdBQUc7QUFBQSxNQUNGLGVBQWU7QUFBQSxNQUNmLGtCQUFrQjtBQUFBLE1BQ2xCLG9CQUFvQjtBQUFBLE1BQ3BCLGVBQWUsS0FBSyxhQUFhLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRTtBQUFBLElBQ3pELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdGQUFnRixNQUFNO0FBQzFGLFVBQU0sZUFBZSxJQUFJLE1BQU0sY0FBYztBQUM3QyxVQUFNLFlBQVksZ0JBQWdCLGNBQWM7QUFBQSxNQUMvQyxhQUFhLGNBQWMsRUFBRSxtQkFBbUIsS0FBSyxDQUFDO0FBQUEsSUFDdkQsQ0FBQztBQUNELFVBQU0sVUFBVSxjQUFjLE1BQU0sRUFBRSxVQUFVLENBQUM7QUFFakQsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixlQUFlLFFBQVM7QUFBQSxNQUN4QixrQkFBa0IsUUFBUztBQUFBLE1BQzNCLG9CQUFvQixRQUFTO0FBQUEsSUFDOUIsR0FBRztBQUFBLE1BQ0YsZUFBZTtBQUFBLE1BQ2Ysa0JBQWtCO0FBQUEsTUFDbEIsb0JBQW9CO0FBQUEsSUFDckIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsVUFBTSxVQUFVLGNBQWMsSUFBSTtBQUVsQyxZQUFRLDJCQUEyQixTQUFTLEVBQUUsd0JBQXdCLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQztBQUVyRyxXQUFPLFlBQVksUUFBUSxVQUFVLFFBQVEsU0FBUyxHQUFHLEtBQUs7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFlBQVEseUJBQXlCLE9BQU87QUFFeEMsWUFBUSwyQkFBMkIsU0FBUyxFQUFFLHdCQUF3QixNQUFNLHNCQUFzQixFQUFFLENBQUM7QUFDckcsWUFBUSwyQkFBMkIsU0FBUyxFQUFFLHdCQUF3QixPQUFPLHNCQUFzQixFQUFFLENBQUM7QUFFdEcsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQ3ZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsd0JBQXdCLFFBQVM7QUFBQSxNQUNqQyxzQkFBc0IsUUFBUztBQUFBLElBQ2hDLEdBQUc7QUFBQSxNQUNGLHdCQUF3QjtBQUFBLE1BQ3hCLHNCQUFzQjtBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFVBQU0sVUFBVSxjQUFjLElBQUk7QUFDbEMsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxZQUFRLDJCQUEyQixTQUFTLEVBQUUsd0JBQXdCLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUV0RyxVQUFNLGdCQUFnQixZQUFZLElBQUksSUFBSSx5QkFBeUIsT0FBTyxDQUFDO0FBQzNFLFVBQU0sVUFBVSxjQUFjLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUU3RSxXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLHdCQUF3QixRQUFTO0FBQUEsTUFDakMsc0JBQXNCLFFBQVM7QUFBQSxJQUNoQyxHQUFHO0FBQUEsTUFDRix3QkFBd0I7QUFBQSxNQUN4QixzQkFBc0I7QUFBQSxJQUN2QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFlBQVEseUJBQXlCLE9BQU87QUFFeEMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQ3ZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsd0JBQXdCLFFBQVM7QUFBQSxNQUNqQyxzQkFBc0IsUUFBUztBQUFBLElBQ2hDLEdBQUc7QUFBQSxNQUNGLHdCQUF3QjtBQUFBLE1BQ3hCLHNCQUFzQjtBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNHQUFzRyxNQUFNO0FBQ2hILFVBQU0sYUFBYSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDdkcsVUFBTSxhQUFhLGdCQUFnQixJQUFJLE1BQU0sY0FBYyxHQUFHLENBQUMsYUFBYSxJQUFJLE1BQU0sY0FBYyxDQUFDLENBQUMsQ0FBQztBQUN2RyxVQUFNLEtBQUssY0FBYyxNQUFNLEVBQUUsWUFBWSxNQUFNLFdBQVcsV0FBVyxDQUFDO0FBQzFFLFVBQU0sS0FBSyxjQUFjLE1BQU0sRUFBRSxZQUFZLE1BQU0sV0FBVyxXQUFXLENBQUM7QUFDMUUsVUFBTSxJQUFJLGNBQWMsS0FBSyxFQUFFLFlBQVksTUFBTSxXQUFXLFdBQVcsQ0FBQztBQUN4RSxVQUFNLGNBQWMsY0FBYyxLQUFLLEVBQUUsWUFBWSxLQUFLLENBQUM7QUFFM0QsV0FBTyxnQkFBZ0IsUUFBUSxtQ0FBbUMsRUFBRSxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUN2SixXQUFPLGdCQUFnQixRQUFRLG1DQUFtQyxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsR0FBRyx5QkFBeUIsR0FBRyx5QkFBeUIsRUFBRSxDQUFDO0FBQ3ZKLFdBQU8sZ0JBQWdCLFFBQVEsbUNBQW1DLENBQUMsR0FBRyxFQUFFLG1CQUFtQixHQUFHLHlCQUF5QixHQUFHLHlCQUF5QixFQUFFLENBQUM7QUFDdEosV0FBTyxnQkFBZ0IsUUFBUSxtQ0FBbUMsV0FBVyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUFBLEVBQ2pLLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sYUFBYSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDdkcsVUFBTSxhQUFhLGdCQUFnQixJQUFJLE1BQU0sY0FBYyxHQUFHLENBQUMsYUFBYSxJQUFJLE1BQU0sY0FBYyxDQUFDLENBQUMsQ0FBQztBQUN2RyxVQUFNLG9CQUFvQixjQUFjLE1BQU0sRUFBRSxZQUFZLE1BQU0sV0FBVyxXQUFXLENBQUM7QUFDekYsVUFBTSxxQkFBcUIsY0FBYyxNQUFNLEVBQUUsWUFBWSxNQUFNLFdBQVcsV0FBVyxDQUFDO0FBQzFGLFVBQU0sMkJBQTJCLGNBQWMsS0FBSyxFQUFFLFlBQVksTUFBTSxXQUFXLFdBQVcsQ0FBQztBQUUvRixZQUFRLHlCQUF5QixpQkFBaUI7QUFDbEQsWUFBUSxtQ0FBbUMsaUJBQWlCO0FBQzVELFlBQVEsbUNBQW1DLGtCQUFrQjtBQUM3RCxZQUFRLG1DQUFtQyx3QkFBd0I7QUFFbkUsVUFBTSxVQUFVLFFBQVEsU0FBUyxrQkFBa0IsV0FBVyxZQUFZLGlCQUFpQjtBQUMzRixXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLG1CQUFtQixRQUFTO0FBQUEsTUFDNUIseUJBQXlCLFFBQVM7QUFBQSxNQUNsQyx5QkFBeUIsUUFBUztBQUFBLElBQ25DLEdBQUc7QUFBQSxNQUNGLG1CQUFtQjtBQUFBLE1BQ25CLHlCQUF5QjtBQUFBLE1BQ3pCLHlCQUF5QjtBQUFBLElBQzFCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sWUFBWSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDdEcsVUFBTSxVQUFVLGNBQWMsTUFBTSxFQUFFLFlBQVksTUFBTSxVQUFVLENBQUM7QUFDbkUsWUFBUSxtQ0FBbUMsT0FBTztBQUNsRCxZQUFRLG1DQUFtQyxPQUFPO0FBRWxELFVBQU0sZ0JBQWdCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixPQUFPLENBQUM7QUFDM0UsV0FBTyxnQkFBZ0IsY0FBYyxtQ0FBbUMsT0FBTyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUFBLEVBQ25LLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sWUFBWSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDdEcsVUFBTSxVQUFVLGNBQWMsTUFBTSxFQUFFLFlBQVksTUFBTSxVQUFVLENBQUM7QUFFbkUsV0FBTyxnQkFBZ0IsUUFBUSx1QkFBdUIsT0FBTyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUVoSixZQUFRLG1DQUFtQyxPQUFPO0FBQ2xELFlBQVEsbUNBQW1DLE9BQU87QUFFbEQsV0FBTyxnQkFBZ0IsUUFBUSx1QkFBdUIsT0FBTyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUVoSixXQUFPLGdCQUFnQixRQUFRLHVCQUF1QixPQUFPLEdBQUcsRUFBRSxtQkFBbUIsR0FBRyx5QkFBeUIsR0FBRyx5QkFBeUIsRUFBRSxDQUFDO0FBQUEsRUFDakosQ0FBQztBQUVELE9BQUssNkVBQTZFLE1BQU07QUFDdkYsVUFBTSxVQUFVLGNBQWMsSUFBSTtBQUNsQyxZQUFRLFlBQVksU0FBUyxRQUFRO0FBRXJDLFVBQU0sVUFBVSxRQUFRLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUN2RSxXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLG1CQUFtQixRQUFTO0FBQUEsTUFDNUIseUJBQXlCLFFBQVM7QUFBQSxNQUNsQyx5QkFBeUIsUUFBUztBQUFBLElBQ25DLEdBQUc7QUFBQSxNQUNGLG1CQUFtQjtBQUFBLE1BQ25CLHlCQUF5QjtBQUFBLE1BQ3pCLHlCQUF5QjtBQUFBLElBQzFCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFVBQU0sSUFBSSxjQUFjLEdBQUc7QUFDM0IsVUFBTSxJQUFJLGNBQWMsR0FBRztBQUUzQixZQUFRLHlCQUF5QixDQUFDO0FBQ2xDLFlBQVEsWUFBWSxHQUFHLFFBQVE7QUFFL0IsV0FBTyxnQkFBZ0IsUUFBUSxjQUFjLEVBQUUsS0FBSyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUM7QUFBQSxFQUNsRSxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxZQUFRLE1BQU0sY0FBYyxtQkFBbUIsYUFBYSxhQUFhLGNBQWMsT0FBTztBQUU5RixVQUFNLG1CQUFtQixZQUFZLElBQUksSUFBSSx5QkFBeUIsT0FBTyxDQUFDO0FBRTlFLFdBQU8sZ0JBQWdCLGlCQUFpQixjQUFjLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDNUQsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFJL0QsVUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixVQUFNLFNBQWtDLENBQUM7QUFDekMsYUFBUyxJQUFJLEdBQUcsSUFBSSxzQkFBc0IsS0FBSztBQUM5QyxhQUFPLFlBQVksQ0FBQyxFQUFFLElBQUk7QUFBQSxRQUN6QixZQUFZO0FBQUEsUUFDWixjQUFjO0FBQUEsUUFDZCxvQkFBb0Isc0JBQXNCLENBQUM7QUFBQSxRQUMzQyxvQkFBb0I7QUFBQSxRQUNwQixlQUFlO0FBQUEsUUFDZixrQkFBa0I7QUFBQSxRQUNsQixvQkFBb0I7QUFBQSxRQUNwQiw4QkFBOEI7QUFBQSxRQUM5Qix3QkFBd0I7QUFBQSxRQUN4QixzQkFBc0I7QUFBQSxRQUN0QixpQkFBaUIsTUFBTTtBQUFBO0FBQUEsUUFDdkIsb0JBQW9CO0FBQUEsUUFDcEIsK0JBQStCO0FBQUEsUUFDL0IsY0FBYztBQUFBLFFBQUcsV0FBVztBQUFBLFFBQzVCLGVBQWU7QUFBQSxRQUFHLG1CQUFtQjtBQUFBLFFBQUcsb0JBQW9CO0FBQUEsUUFBRyxtQkFBbUI7QUFBQSxRQUNsRixtQkFBbUI7QUFBQSxRQUFHLHdCQUF3QjtBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFHLHFCQUFxQjtBQUFBLFFBQ2pILHNCQUFzQjtBQUFBLFFBQUcsUUFBUTtBQUFBLFFBQUcsZUFBZTtBQUFBLFFBQ25ELGlCQUFpQjtBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFBRyxpQkFBaUI7QUFBQSxRQUMzRCxhQUFhO0FBQUEsUUFBRyxhQUFhO0FBQUEsUUFBRyxhQUFhO0FBQUEsUUFBRyxTQUFTO0FBQUEsUUFDekQsY0FBYztBQUFBLFFBQUcsWUFBWTtBQUFBLFFBQUcsY0FBYztBQUFBLE1BQy9DO0FBQUEsSUFDRDtBQUNBLFlBQVEsTUFBTSxjQUFjLEtBQUssVUFBVSxNQUFNLEdBQUcsYUFBYSxhQUFhLGNBQWMsT0FBTztBQUVuRyxVQUFNLGFBQWEsWUFBWSxJQUFJLElBQUkseUJBQXlCLE9BQU8sQ0FBQztBQUN4RSxXQUFPLFlBQVksV0FBVyxjQUFjLEVBQUUsUUFBUSxvQkFBb0I7QUFFMUUsVUFBTSxhQUFhLGNBQWMsV0FBVztBQUM1QyxlQUFXLHlCQUF5QixVQUFVO0FBRTlDLFVBQU0sTUFBTSxXQUFXLGNBQWM7QUFDckMsV0FBTyxZQUFZLElBQUksUUFBUSxvQkFBb0I7QUFDbkQsV0FBTyxZQUFZLElBQUksU0FBUyxXQUFXLEdBQUcsSUFBSTtBQUNsRCxXQUFPLFlBQVksSUFBSSxTQUFTLFlBQVksR0FBRyxPQUFPLHVDQUF1QztBQUM3RixXQUFPLFlBQVksSUFBSSxTQUFTLFlBQVksR0FBRyxNQUFNLDZDQUE2QztBQUFBLEVBQ25HLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
