import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agentService.js";
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from "../../common/changesetUri.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, SessionStatus, withSessionGitState } from "../../common/state/sessionState.js";
import { AgentHostChangesetService } from "../../node/agentHostChangesetService.js";
import { NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { NULL_REVIEW_SERVICE } from "../../common/agentHostReviewService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentConfigurationService } from "../../node/agentConfigurationService.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
function createSubscriptionService(...changesets) {
  const subscriptions = new Set(changesets);
  return {
    _serviceBrand: void 0,
    subscriptions,
    getSessionSubscriptions: () => subscriptions,
    addSubscription: (_session, changeset) => {
      subscriptions.add(changeset);
    },
    removeSubscription: (_session, changeset) => {
      subscriptions.delete(changeset);
    },
    clearSessionSubscriptions: () => {
      subscriptions.clear();
    }
  };
}
function createOperationService() {
  return {
    _serviceBrand: void 0,
    registerContribution: () => toDisposable(() => {
    }),
    updateOperations: () => {
    },
    getOperations: () => void 0,
    invokeChangesetOperation: async () => {
      throw new Error("not implemented");
    },
    dispose: () => {
    }
  };
}
suite.skip("AgentHostChangesetService", () => {
  const disposables = new DisposableStore();
  let stateManager;
  let changesetService;
  const sessionUri = AgentSession.uri("mock", "session-1");
  function setupSession(workingDirectory) {
    stateManager.createSession({
      resource: sessionUri.toString(),
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" },
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    });
    stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalog(sessionUri.toString()));
    stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
  }
  setup(() => {
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    changesetService = disposables.add(new AgentHostChangesetService(
      stateManager,
      new NullLogService(),
      createNullSessionDataService(),
      createNoopGitService(),
      NULL_CHECKPOINT_SERVICE,
      disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
      createOperationService(),
      createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
      NULL_REVIEW_SERVICE
    ));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("registerStaticChangesets makes the two static changeset URIs subscribable with computing status", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.changesets, [
      { label: "Branch Changes", uriTemplate: `${sessionStr}/changeset/session`, changeKind: "session" },
      { label: "Uncommitted Changes", uriTemplate: `${sessionStr}/changeset/uncommitted`, description: "Show uncommitted changes in this session", changeKind: "uncommitted" }
    ]);
    changesetService.registerStaticChangesets(sessionStr);
    for (const id of ["uncommitted", "session"]) {
      const snapshot = stateManager.getSnapshot(`${sessionStr}/changeset/${id}`);
      assert.ok(snapshot, `expected ${id} changeset URI to be subscribable`);
      assert.strictEqual(snapshot.state.status, "computing");
    }
    assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.changesets, [
      { label: "Branch Changes", uriTemplate: `${sessionStr}/changeset/session`, changeKind: "session" },
      { label: "Uncommitted Changes", uriTemplate: `${sessionStr}/changeset/uncommitted`, description: "Show uncommitted changes in this session", changeKind: "uncommitted" }
    ]);
  });
  test("registerStaticChangesets is idempotent across repeated calls", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    changesetService.registerStaticChangesets(sessionStr);
    changesetService.registerStaticChangesets(sessionStr);
    changesetService.registerStaticChangesets(sessionStr);
    const changesets = stateManager.getSessionState(sessionStr)?.changesets;
    assert.strictEqual(changesets?.length, 5, "expected the three default catalogue entries");
  });
  test("restoreStaticChangeset publishes files in Ready and refreshes catalogue counts", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    const diffs = [
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 5, removed: 2 }
      },
      {
        after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } },
        diff: { added: 1, removed: 0 }
      }
    ];
    changesetService.restoreStaticChangeset(sessionStr, "session", diffs);
    const changesetUri = `${sessionStr}/changeset/session`;
    const snapshot = stateManager.getSnapshot(changesetUri);
    assert.ok(snapshot, "expected the changeset URI to be subscribable");
    const state = snapshot.state;
    assert.strictEqual(state.status, "ready");
    assert.deepStrictEqual(state.files.map((f) => f.id), ["file:///wd/a.ts", "file:///wd/b.ts"]);
    const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
    assert.deepStrictEqual(catalogue, [
      {
        label: "Branch Changes",
        uriTemplate: changesetUri,
        changeKind: "session"
      },
      {
        label: "Uncommitted Changes",
        uriTemplate: `${sessionStr}/changeset/uncommitted`,
        description: "Show uncommitted changes in this session",
        changeKind: "uncommitted"
      }
    ]);
  });
  test("restoreStaticChangeset catalogue counts only emitted unique files", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    const diffs = [
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 100, removed: 50 }
      },
      {
        diff: { added: 20, removed: 10 }
      },
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 3, removed: 1 }
      },
      {
        after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } },
        diff: { added: 1, removed: 0 }
      }
    ];
    changesetService.restoreStaticChangeset(sessionStr, "session", diffs);
    const changesetUri = `${sessionStr}/changeset/session`;
    const snapshot = stateManager.getSnapshot(changesetUri);
    const state = snapshot?.state;
    const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
    assert.deepStrictEqual({
      files: state?.files.map((f) => ({ id: f.id, diff: f.edit.diff })),
      catalogue
    }, {
      files: [
        { id: "file:///wd/a.ts", diff: { added: 3, removed: 1 } },
        { id: "file:///wd/b.ts", diff: { added: 1, removed: 0 } }
      ],
      catalogue: [
        {
          label: "Branch Changes",
          uriTemplate: changesetUri,
          changeKind: "session"
        },
        {
          label: "Uncommitted Changes",
          uriTemplate: `${sessionStr}/changeset/uncommitted`,
          description: "Show uncommitted changes in this session",
          changeKind: "uncommitted"
        }
      ]
    });
  });
  test("restoreStaticChangeset works without a live session state (seeds the changeset for unopened sessions)", () => {
    const sessionStr = sessionUri.toString();
    const diffs = [
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 1, removed: 0 }
      }
    ];
    changesetService.restoreStaticChangeset(sessionStr, "session", diffs);
    assert.strictEqual(stateManager.getSessionState(sessionStr), void 0);
    const snapshot = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
    assert.ok(snapshot, "expected the changeset URI to be subscribable even without a session state");
    const state = snapshot.state;
    assert.strictEqual(state.status, "ready");
    assert.deepStrictEqual(state.files.map((f) => f.id), ["file:///wd/a.ts"]);
  });
  suite("session diff computation", () => {
    test("git-driven path is preferred when a git service is provided and the working dir is a git work tree", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const gitDiffs = [{
        after: { uri: "file:///wd/new.ts", content: { uri: "file:///wd/new.ts" } },
        diff: { added: 1, removed: 0 }
      }];
      const computeCalls = [];
      const stubGit = {
        computeSessionFileDiffs: async (wd, opts) => {
          computeCalls.push({ workingDirectory: wd.toString(), sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
          return gitDiffs;
        }
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
        NULL_REVIEW_SERVICE
      ));
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      await sessionDb.setMetadata("agentHost.diffBaseBranch", "main");
      const envelopes = [];
      disposables.add(localStateManager.onDidEmitEnvelope((e) => {
        envelopes.push(e);
      }));
      localChangesets.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 200 && computeCalls.length < 2; i++) {
        await timeout(2);
      }
      const sortedCalls = [...computeCalls].sort((a, b) => (a.baseBranch ?? "") < (b.baseBranch ?? "") ? -1 : 1);
      assert.deepStrictEqual(sortedCalls, [
        { workingDirectory: "file:///wd", sessionUri: sessionUri.toString(), baseBranch: void 0 },
        { workingDirectory: "file:///wd", sessionUri: sessionUri.toString(), baseBranch: "main" }
      ]);
      const contentChanges = envelopes.filter((e) => e.action.type === ActionType.ChangesetContentChanged);
      const sessionContent = contentChanges.filter((e) => e.channel === `${sessionUri.toString()}/changeset/session`);
      const uncommittedContent = contentChanges.filter((e) => e.channel === `${sessionUri.toString()}/changeset/uncommitted`);
      assert.deepStrictEqual(sessionContent.at(-1)?.action.files.map((f) => f.edit), gitDiffs);
      assert.deepStrictEqual(uncommittedContent.at(-1)?.action.files.map((f) => f.edit), gitDiffs);
      let persisted;
      for (let i = 0; i < 50 && !persisted; i++) {
        await timeout(2);
        persisted = await sessionDb.getMetadata("diffs");
      }
      assert.ok(persisted, "expected the compute pass to persist diffs to the session DB");
      assert.deepStrictEqual(JSON.parse(persisted), gitDiffs);
    });
    test("session changeset falls back to _meta.git base branch when persisted diff base is absent", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const computeCalls = [];
      const stubGit = {
        computeSessionFileDiffs: async (_wd, opts) => {
          computeCalls.push({ baseBranch: opts.baseBranch });
          return [];
        }
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
        NULL_REVIEW_SERVICE
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      localStateManager.setSessionMeta(sessionStr, withSessionGitState(void 0, { baseBranchName: "main" }));
      localChangesets.refreshSessionChangeset(sessionStr);
      for (let i = 0; i < 50 && computeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(computeCalls, [{ baseBranch: "main" }]);
    });
    test("session changeset keeps persisted diff base ahead of _meta.git base branch", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      await sessionDb.setMetadata("agentHost.diffBaseBranch", "release");
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const computeCalls = [];
      const stubGit = {
        computeSessionFileDiffs: async (_wd, opts) => {
          computeCalls.push({ baseBranch: opts.baseBranch });
          return [];
        }
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      localStateManager.setSessionMeta(sessionStr, withSessionGitState(void 0, { baseBranchName: "main" }));
      localChangesets.refreshSessionChangeset(sessionStr);
      for (let i = 0; i < 50 && computeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(computeCalls, [{ baseBranch: "release" }]);
    });
    test("falls back to the edit-tracker aggregator when the git service returns undefined", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const stubGit = {
        computeSessionFileDiffs: async () => void 0
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      const envelopes = [];
      let resolveDiffs;
      const diffsEmitted = new Promise((r) => {
        resolveDiffs = r;
      });
      disposables.add(localStateManager.onDidEmitEnvelope((e) => {
        envelopes.push(e);
        if (e.action.type === ActionType.ChangesetStatusChanged) {
          resolveDiffs?.();
        }
      }));
      localChangesets.onTurnComplete(sessionUri.toString(), "turn-1");
      await diffsEmitted;
      const contentChanges = envelopes.map((e) => e.action).filter((a) => a.type === ActionType.ChangesetContentChanged);
      assert.deepStrictEqual(contentChanges.map((a) => a.files), [[]]);
      const statusAction = envelopes.map((e) => e.action).find((a) => a.type === ActionType.ChangesetStatusChanged);
      assert.ok(statusAction, "expected a changeset/statusChanged envelope from the fallback path");
    });
  });
  suite("computeUncommittedChangeset", () => {
    test("happy path: git returns diffs, state goes Ready with files, nothing persisted to the DB", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const gitDiffs = [
        { after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } }, diff: { added: 1, removed: 0 } },
        { after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } }, diff: { added: 2, removed: 1 } }
      ];
      const stubGit = {
        computeSessionFileDiffs: async () => gitDiffs
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      await localChangesets.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = localStateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        files: state?.files.map((f) => f.id).sort(),
        persistedUncommitted: await sessionDb.getMetadata("agentHost.changeset.uncommitted")
      }, {
        status: ChangesetStatus.Ready,
        files: ["file:///wd/a.ts", "file:///wd/b.ts"],
        persistedUncommitted: void 0
      });
    });
    test("no working directory: state goes Error with computeFailed", async () => {
      const sessionStr = sessionUri.toString();
      setupSession();
      await changesetService.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = stateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        errorType: state?.error?.errorType
      }, {
        status: ChangesetStatus.Error,
        errorType: "computeFailed"
      });
    });
    test("git returns undefined (not a git work tree): state goes Error with computeFailed", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      await changesetService.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = stateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        errorType: state?.error?.errorType
      }, {
        status: ChangesetStatus.Error,
        errorType: "computeFailed"
      });
    });
    test("git throws: state goes Error with original message", async () => {
      const stubGit = {
        computeSessionFileDiffs: async () => {
          throw new Error("git command failed");
        }
      };
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        createNullSessionDataService(),
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
        NULL_REVIEW_SERVICE
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      await localChangesets.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = localStateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        errorType: state?.error?.errorType,
        message: state?.error?.message
      }, {
        status: ChangesetStatus.Error,
        errorType: "computeFailed",
        message: "git command failed"
      });
    });
  });
  suite("deferred refresh (working directory unknown)", () => {
    function createDeferringService(subscriptions = []) {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const computes = [];
      const stubGit = {
        computeSessionFileDiffs: async () => {
          computes.push("session");
          return [];
        },
        computeUncommittedFileDiffs: async () => {
          computes.push("uncommitted");
          return [];
        }
      };
      const subscriptionService = createSubscriptionService(...subscriptions);
      const service = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        createNullSessionDataService(),
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        subscriptionService,
        NULL_REVIEW_SERVICE
      ));
      return { service, localStateManager, computes, subscriptions: subscriptionService.subscriptions };
    }
    function createSessionState(localStateManager, workingDirectory) {
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: workingDirectory ? [workingDirectory] : void 0
      });
      localStateManager.setSessionChangesets(sessionStr, buildDefaultChangesetCatalog(sessionStr));
      return sessionStr;
    }
    test("refreshSessionChangeset / refreshBranchChangeset defer until the working directory is known, then drain the subscribed changesets", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes } = createDeferringService([
        buildBranchChangesetUri(sessionStr),
        buildSessionChangesetUri(sessionStr)
      ]);
      createSessionState(localStateManager, void 0);
      service.refreshBranchChangeset(sessionStr);
      service.refreshSessionChangeset(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, [], "nothing computed while the working directory is unknown");
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes.sort(), ["session", "session"]);
    });
    test("computeUncommittedChangeset defers until the working directory is known, then drains", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes } = createDeferringService([buildUncommittedChangesetUri(sessionStr)]);
      createSessionState(localStateManager, void 0);
      await service.computeUncommittedChangeset(sessionStr);
      assert.deepStrictEqual(computes, [], "uncommitted compute deferred while the working directory is unknown");
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, ["uncommitted"]);
    });
    test("a changeset unsubscribed before materialization is naturally skipped on drain", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes, subscriptions } = createDeferringService([buildSessionChangesetUri(sessionStr)]);
      createSessionState(localStateManager, void 0);
      service.refreshSessionChangeset(sessionStr);
      subscriptions.delete(buildSessionChangesetUri(sessionStr));
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, []);
    });
    test("onSessionDisposed clears every pending refresh for the session", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes } = createDeferringService([
        buildBranchChangesetUri(sessionStr),
        buildSessionChangesetUri(sessionStr),
        buildUncommittedChangesetUri(sessionStr)
      ]);
      createSessionState(localStateManager, void 0);
      service.refreshBranchChangeset(sessionStr);
      service.refreshSessionChangeset(sessionStr);
      await service.computeUncommittedChangeset(sessionStr);
      service.onSessionDisposed(sessionStr);
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, []);
    });
  });
  suite("restorePersistedStaticChangesets", () => {
    const aDiff = { after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } }, diff: { added: 1, removed: 0 } };
    const bDiff = { after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } }, diff: { added: 2, removed: 0 } };
    const sessionStr = sessionUri.toString();
    test("parsePersistedStaticChangesets parses without mutating state", () => {
      setupSession();
      changesetService.registerStaticChangesets(sessionStr);
      const result = changesetService.parsePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([bDiff])
      });
      assert.deepStrictEqual({
        session: result.session?.map((d) => d.after?.uri),
        sessionState: stateManager.getChangesetState(buildSessionChangesetUri(sessionStr))
      }, {
        session: ["file:///wd/b.ts"],
        sessionState: { status: "computing", files: [] }
      });
    });
    test("applyPersistedStaticChangesets seeds parsed diffs", () => {
      setupSession();
      changesetService.registerStaticChangesets(sessionStr);
      const parsed = changesetService.parsePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([bDiff])
      });
      changesetService.applyPersistedStaticChangesets(sessionStr, parsed);
      const session = stateManager.getChangesetState(buildSessionChangesetUri(sessionStr));
      assert.deepStrictEqual(
        session && { status: session.status, files: session.files.map((f) => f.id) },
        { status: "ready", files: ["file:///wd/b.ts"] }
      );
    });
    test("new sessionRaw beats legacyRaw when both are present", () => {
      setupSession();
      const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([aDiff]),
        legacyRaw: JSON.stringify([bDiff])
        // would lose
      });
      assert.deepStrictEqual(result.session?.map((d) => d.after?.uri), ["file:///wd/a.ts"], "new key wins over legacy");
    });
    test("legacyRaw still restores session state when sessionRaw is absent", () => {
      setupSession();
      const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
        legacyRaw: JSON.stringify([bDiff])
      });
      assert.deepStrictEqual(result.session?.map((d) => d.after?.uri), ["file:///wd/b.ts"]);
      const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.strictEqual((session?.state).status, "ready");
    });
    test("malformed JSON logs and returns undefined for that slot", () => {
      setupSession();
      changesetService.registerStaticChangesets(sessionStr);
      const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: "{ not valid json"
      });
      assert.strictEqual(result.session, void 0, "malformed slot returns undefined");
      const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.strictEqual((session?.state).status, "computing");
    });
    test("seedIfEmpty honoured: live state with files is not overwritten", () => {
      setupSession();
      changesetService.restoreStaticChangeset(sessionStr, "session", [aDiff]);
      const before = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.deepStrictEqual((before?.state).files.map((f) => f.id), ["file:///wd/a.ts"]);
      changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([bDiff])
      });
      const after = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.deepStrictEqual(
        (after?.state).files.map((f) => f.id),
        ["file:///wd/a.ts"],
        "live state must be preserved when persisted overlay tries to overwrite it"
      );
    });
    test("with live session state, restored diffs publish ready + catalogue counts", () => {
      setupSession();
      changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([aDiff, bDiff])
      });
      const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
      const sessionEntry = catalogue?.find((c) => c.uriTemplate === `${sessionStr}/changeset/session`);
      assert.deepStrictEqual(sessionEntry, {
        label: "Branch Changes",
        uriTemplate: `${sessionStr}/changeset/session`,
        changeKind: "session"
      }, "catalogue counts must reflect restored files");
    });
  });
  suite("idle changeset LRU eviction", () => {
    const sessionStr = sessionUri.toString();
    test("idle changeset states are evicted over the soft limit", () => {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 2 } }));
      const first = `${sessionStr}/changeset/session`;
      const second = `${sessionStr}/changeset/uncommitted`;
      const third = `${sessionStr}/changeset/turn/turn-1`;
      localStateManager.registerChangeset(first);
      localStateManager.registerChangeset(second);
      localStateManager.registerChangeset(third);
      assert.deepStrictEqual({
        first: localStateManager.getChangesetState(first),
        second: localStateManager.getChangesetState(second)?.status,
        third: localStateManager.getChangesetState(third)?.status
      }, {
        first: void 0,
        second: "computing",
        third: "computing"
      });
    });
    test("evictability probe protects subscribed changesets", () => {
      const first = `${sessionStr}/changeset/session`;
      const second = `${sessionStr}/changeset/uncommitted`;
      const third = `${sessionStr}/changeset/turn/turn-1`;
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 2, canEvict: (changeset) => changeset !== first } }));
      localStateManager.registerChangeset(first);
      localStateManager.registerChangeset(second);
      localStateManager.registerChangeset(third);
      assert.deepStrictEqual({
        first: localStateManager.getChangesetState(first)?.status,
        second: localStateManager.getChangesetState(second),
        third: localStateManager.getChangesetState(third)?.status
      }, {
        first: "computing",
        second: void 0,
        third: "computing"
      });
    });
    test("LRU eviction is silent and does not dispatch ChangesetCleared", () => {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 1 } }));
      const envelopes = [];
      const listener = disposables.add(localStateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      localStateManager.registerChangeset(`${sessionStr}/changeset/session`);
      localStateManager.registerChangeset(`${sessionStr}/changeset/uncommitted`);
      assert.deepStrictEqual(envelopes.map((e) => e.action.type), []);
      listener.dispose();
    });
    test("trimming reconsiders entries after they become evictable", () => {
      let canEvict = false;
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 1, canEvict: () => canEvict } }));
      const first = `${sessionStr}/changeset/session`;
      const second = `${sessionStr}/changeset/uncommitted`;
      localStateManager.registerChangeset(first);
      localStateManager.registerChangeset(second);
      canEvict = true;
      localStateManager.onChangesetLivenessChanged();
      assert.deepStrictEqual({
        first: localStateManager.getChangesetState(first),
        second: localStateManager.getChangesetState(second)?.status
      }, {
        first: void 0,
        second: "computing"
      });
    });
  });
  suite("per-turn live streaming", () => {
    class CountingChangesetService extends AgentHostChangesetService {
      constructor() {
        super(...arguments);
        this.turnComputeCalls = [];
        this.uncommittedComputeCalls = [];
      }
      async computeTurnChangeset(session, turnId) {
        this.turnComputeCalls.push({ session, turnId });
        return super.computeTurnChangeset(session, turnId);
      }
      async computeUncommittedChangeset(session) {
        this.uncommittedComputeCalls.push(session);
        return super.computeUncommittedChangeset(session);
      }
    }
    let subscriptions;
    function makeService() {
      const subscriptionService = createSubscriptionService();
      subscriptions = subscriptionService.subscriptions;
      return disposables.add(new CountingChangesetService(
        stateManager,
        new NullLogService(),
        createNullSessionDataService(),
        createNoopGitService(),
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        subscriptionService,
        NULL_REVIEW_SERVICE
      ));
    }
    test("onTurnComplete schedules a per-turn recompute when someone is subscribed", async () => {
      setupSession();
      const svc = makeService();
      subscriptions.add(buildTurnChangesetUri(sessionUri.toString(), "turn-1"));
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 50 && svc.turnComputeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(
        svc.turnComputeCalls,
        [{ session: sessionUri.toString(), turnId: "turn-1" }],
        "expected exactly one per-turn compute for the completed turn"
      );
    });
    test("onTurnComplete does NOT schedule a per-turn recompute when nobody is subscribed", async () => {
      setupSession();
      const svc = makeService();
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      await timeout(20);
      assert.deepStrictEqual(svc.turnComputeCalls, [], "no per-turn compute when nothing observes the turn URI");
    });
    test("onTurnComplete schedules an uncommitted recompute when someone is subscribed", async () => {
      setupSession();
      const svc = makeService();
      subscriptions.add(buildUncommittedChangesetUri(sessionUri.toString()));
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 50 && svc.uncommittedComputeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(
        svc.uncommittedComputeCalls,
        [sessionUri.toString()],
        "expected exactly one uncommitted compute for the completed turn"
      );
    });
    test("onTurnComplete does NOT schedule an uncommitted recompute when nobody is subscribed", async () => {
      setupSession();
      const svc = makeService();
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      await timeout(20);
      assert.deepStrictEqual(svc.uncommittedComputeCalls, [], "no uncommitted compute when nothing observes the uncommitted URI");
    });
    test("onToolCallEditsApplied fires the per-turn debounce only when subscribers exist; cancelled by onTurnComplete", () => {
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        setupSession();
        const svc = makeService();
        subscriptions.add(buildTurnChangesetUri(sessionUri.toString(), "turn-1"));
        svc.onToolCallEditsApplied(sessionUri.toString(), "turn-1");
        await timeout(6e3);
        assert.strictEqual(svc.turnComputeCalls.length, 1, "debounce should fire one per-turn compute");
        svc.onToolCallEditsApplied(sessionUri.toString(), "turn-1");
        await timeout(1e3);
        svc.onTurnComplete(sessionUri.toString(), "turn-1");
        await timeout(10);
        assert.strictEqual(svc.turnComputeCalls.length, 2, "onTurnComplete cancels pending debounce and runs exactly one final compute");
        subscriptions.clear();
        svc.onToolCallEditsApplied(sessionUri.toString(), "turn-1");
        await timeout(6e3);
        assert.strictEqual(svc.turnComputeCalls.length, 2, "unsubscribed turn must not get any further per-turn computes");
      });
    });
    test("per-turn URI streams a ChangesetContentChanged snapshot as the same turn is recomputed", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const svc = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        createSessionDataService(sessionDb),
        createNoopGitService(),
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildTurnChangesetUri(sessionUri.toString(), "turn-1")),
        NULL_REVIEW_SERVICE
      ));
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      const envelopes = [];
      disposables.add(localStateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const turnUri = `${sessionUri.toString()}/changeset/turn/turn-1`;
      await svc.computeTurnChangeset(sessionUri.toString(), "turn-1");
      const statusReady = envelopes.find((e) => e.action.type === ActionType.ChangesetStatusChanged && e.channel === turnUri);
      assert.ok(statusReady, "first per-turn compute must transition the URI to ready");
      envelopes.length = 0;
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 100 && !envelopes.some((e) => e.action.type === ActionType.ChangesetStatusChanged && e.channel === `${sessionUri.toString()}/changeset/session`); i++) {
        await timeout(2);
      }
      assert.ok(
        envelopes.some((e) => e.action.type === ActionType.ChangesetStatusChanged),
        "onTurnComplete must drive at least one downstream changeset status transition"
      );
    });
  });
  suite("computeCompareTurnsChangeset", () => {
    function makeCheckpointService(pairs, baselineRef) {
      return {
        ...NULL_CHECKPOINT_SERVICE,
        getTurnCheckpointPair: async (_session, turnId) => pairs[turnId],
        getBaselineCheckpointRef: async () => baselineRef
      };
    }
    test("publishes diffs as Ready when both checkpoints resolve and git returns diffs", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const expectedDiffs = [
        { after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } }, diff: { added: 4, removed: 1 } }
      ];
      const calls = [];
      const gitService = createNoopGitService();
      gitService.computeFileDiffsBetweenRefs = async (_wd, opts) => {
        calls.push({ fromRef: opts.fromRef, toRef: opts.toRef });
        return expectedDiffs;
      };
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "ref-orig-parent", current: "ref-orig" },
          "mod": { parent: "ref-orig", current: "ref-mod" }
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      assert.strictEqual(compareUri, `${sessionStr}/changeset/compare/orig/mod`);
      assert.deepStrictEqual(calls, [{ fromRef: "ref-orig", toRef: "ref-mod" }]);
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({ status: state?.status, ids: state?.files.map((f) => f.id) }, {
        status: "ready",
        ids: ["file:///wd/a.ts"]
      });
    });
    test("transitions to Error when either checkpoint is missing", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const gitService = createNoopGitService();
      let gitCalls = 0;
      gitService.computeFileDiffsBetweenRefs = async () => {
        gitCalls++;
        return void 0;
      };
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "ref-orig-parent", current: "ref-orig" }
          // 'mod' is intentionally absent
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.strictEqual(state?.status, "error");
      assert.ok(state?.error?.message.includes("modified turn"), `expected error to name the missing side, got ${state?.error?.message}`);
      assert.strictEqual(gitCalls, 0, "git must not be invoked when a checkpoint is missing");
    });
    test("returns empty Ready snapshot when both checkpoints point at the same ref", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const gitService = createNoopGitService();
      let gitCalls = 0;
      gitService.computeFileDiffsBetweenRefs = async () => {
        gitCalls++;
        return void 0;
      };
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "p1", current: "same-ref" },
          "mod": { parent: "same-ref", current: "same-ref" }
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({ status: state?.status, files: state?.files }, { status: "ready", files: [] });
      assert.strictEqual(gitCalls, 0, "git diff must be short-circuited when both refs match");
    });
    test("transitions to Error when the git diff returns undefined (git failure, not empty)", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const gitService = createNoopGitService();
      gitService.computeFileDiffsBetweenRefs = async () => void 0;
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "p", current: "ref-orig" },
          "mod": { parent: "ref-orig", current: "ref-mod" }
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.strictEqual(state?.status, "error");
      assert.ok(state?.error?.message.includes("git"), `expected git-failure error message, got ${state?.error?.message}`);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmksIGJ1aWxkRGVmYXVsdENoYW5nZXNldENhdGFsb2csIGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaSwgYnVpbGRUdXJuQ2hhbmdlc2V0VXJpLCBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25FbnZlbG9wZSwgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRTdGF0dXMsIFNlc3Npb25TdGF0dXMsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHR5cGUgQ2hhbmdlc2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOVUxMX1JFVklFV19TRVJWSUNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvbkRhdGFiYXNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlLCBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UsIFRlc3RTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcblxuLyoqXG4gKiBCdWlsZHMgYSB0ZXN0IHN1YnNjcmlwdGlvbiBzZXJ2aWNlIGJhY2tlZCBieSBhIG11dGFibGUgc2V0IG9mIHN1YnNjcmliZWRcbiAqIGNoYW5nZXNldCBVUklzLCBzbyBzZXJ2aWNlIHRlc3RzIGNhbiBzaW11bGF0ZSBzdWJzY3JpYmUgLyB1bnN1YnNjcmliZVxuICogd2l0aG91dCB3aXJpbmcgdXAgdGhlIGNvb3JkaW5hdG9yLlxuICovXG5mdW5jdGlvbiBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKC4uLmNoYW5nZXNldHM6IHN0cmluZ1tdKTogSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UgJiB7IHJlYWRvbmx5IHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+IH0ge1xuXHRjb25zdCBzdWJzY3JpcHRpb25zID0gbmV3IFNldChjaGFuZ2VzZXRzKTtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0c3Vic2NyaXB0aW9ucyxcblx0XHRnZXRTZXNzaW9uU3Vic2NyaXB0aW9uczogKCkgPT4gc3Vic2NyaXB0aW9ucyxcblx0XHRhZGRTdWJzY3JpcHRpb246IChfc2Vzc2lvbiwgY2hhbmdlc2V0KSA9PiB7IHN1YnNjcmlwdGlvbnMuYWRkKGNoYW5nZXNldCk7IH0sXG5cdFx0cmVtb3ZlU3Vic2NyaXB0aW9uOiAoX3Nlc3Npb24sIGNoYW5nZXNldCkgPT4geyBzdWJzY3JpcHRpb25zLmRlbGV0ZShjaGFuZ2VzZXQpOyB9LFxuXHRcdGNsZWFyU2Vzc2lvblN1YnNjcmlwdGlvbnM6ICgpID0+IHsgc3Vic2NyaXB0aW9ucy5jbGVhcigpOyB9LFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIG5vLW9wIGNoYW5nZXNldCBvcGVyYXRpb24gc2VydmljZSBmb3IgdGVzdHMuIEl0IGFkdmVydGlzZXMgbm9cbiAqIG9wZXJhdGlvbnMsIHdoaWNoIG1pcnJvcnMgdGhlIGRlZmF1bHQgYmVoYXZpb3VyIG9mIGEgc2Vzc2lvbiB3aXRob3V0IGFueVxuICogb3BlcmF0aW9uIGNvbnRyaWJ1dGlvbnMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKTogSUFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0dXBkYXRlT3BlcmF0aW9uczogKCkgPT4geyB9LFxuXHRcdGdldE9wZXJhdGlvbnM6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH07XG59XG5cbnN1aXRlLnNraXAoJ0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcjtcblx0bGV0IGNoYW5nZXNldFNlcnZpY2U6IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2U7XG5cblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJyk7XG5cblx0ZnVuY3Rpb24gc2V0dXBTZXNzaW9uKHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ2hhbmdlc2V0cyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGJ1aWxkRGVmYXVsdENoYW5nZXNldENhdGFsb2coc2Vzc2lvblVyaS50b1N0cmluZygpKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjaGFuZ2VzZXRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0TlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLFxuXHRcdFx0Y3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZShidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSkpLFxuXHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZWdpc3RlclN0YXRpY0NoYW5nZXNldHMgbWFrZXMgdGhlIHR3byBzdGF0aWMgY2hhbmdlc2V0IFVSSXMgc3Vic2NyaWJhYmxlIHdpdGggY29tcHV0aW5nIHN0YXR1cycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0Ly8gQ2F0YWxvZ3VlIGlzIHNlZWRlZCBieSBzZXR1cFNlc3Npb24gKG1pcnJvcnMgd2hhdCBgX2J1aWxkSW5pdGlhbFN1bW1hcnlgXG5cdFx0Ly8gZG9lcyBpbiBwcm9kdWN0aW9uKSBcdTIwMTQgc2FuaXR5IGNoZWNrIGJlZm9yZSBleGVyY2lzaW5nIHJlZ2lzdHJhdGlvbi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cik/LmNoYW5nZXNldHMsIFtcblx0XHRcdHsgbGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsIHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmAsIGNoYW5nZUtpbmQ6ICdzZXNzaW9uJyB9LFxuXHRcdFx0eyBsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLCB1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCwgZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJywgY2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyB9LFxuXHRcdF0pO1xuXG5cdFx0Y2hhbmdlc2V0U2VydmljZS5yZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0cik7XG5cblx0XHQvLyBCb3RoIHN0YXRpYyBjaGFuZ2VzZXQgVVJJcyBhcmUgbm93IHJlZ2lzdGVyZWQgYW5kIHN1YnNjcmliYWJsZVxuXHRcdC8vIHdpdGggYGNvbXB1dGluZ2Agc25hcHNob3RzIHNvIGEgY2xpZW50IHRoYXQgc3Vic2NyaWJlcyBiZWZvcmVcblx0XHQvLyB0aGUgZmlyc3QgY29tcHV0ZSBwYXNzIHNlZXMgYSB2YWxpZCBzdGF0ZS5cblx0XHRmb3IgKGNvbnN0IGlkIG9mIFsndW5jb21taXR0ZWQnLCAnc2Vzc2lvbiddKSB7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvJHtpZH1gKTtcblx0XHRcdGFzc2VydC5vayhzbmFwc2hvdCwgYGV4cGVjdGVkICR7aWR9IGNoYW5nZXNldCBVUkkgdG8gYmUgc3Vic2NyaWJhYmxlYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNuYXBzaG90LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmcgfSkuc3RhdHVzLCAnY29tcHV0aW5nJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0cmF0aW9uIG11c3Qgbm90IG11dGF0ZSB0aGUgc2VlZGVkIGNhdGFsb2d1ZS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cik/LmNoYW5nZXNldHMsIFtcblx0XHRcdHsgbGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsIHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmAsIGNoYW5nZUtpbmQ6ICdzZXNzaW9uJyB9LFxuXHRcdFx0eyBsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLCB1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCwgZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJywgY2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RlclN0YXRpY0NoYW5nZXNldHMgaXMgaWRlbXBvdGVudCBhY3Jvc3MgcmVwZWF0ZWQgY2FsbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIpO1xuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIpO1xuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIpO1xuXG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cik/LmNoYW5nZXNldHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNldHM/Lmxlbmd0aCwgNSwgJ2V4cGVjdGVkIHRoZSB0aHJlZSBkZWZhdWx0IGNhdGFsb2d1ZSBlbnRyaWVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTdGF0aWNDaGFuZ2VzZXQgcHVibGlzaGVzIGZpbGVzIGluIFJlYWR5IGFuZCByZWZyZXNoZXMgY2F0YWxvZ3VlIGNvdW50cycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0Y29uc3QgZGlmZnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDUsIHJlbW92ZWQ6IDIgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9iLnRzJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uU3RyLCAnc2Vzc2lvbicsIGRpZmZzKTtcblxuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYDtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjaGFuZ2VzZXRVcmkpO1xuXHRcdGFzc2VydC5vayhzbmFwc2hvdCwgJ2V4cGVjdGVkIHRoZSBjaGFuZ2VzZXQgVVJJIHRvIGJlIHN1YnNjcmliYWJsZScpO1xuXHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Quc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZyB9PiB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5zdGF0dXMsICdyZWFkeScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuZmlsZXMubWFwKGYgPT4gZi5pZCksIFsnZmlsZTovLy93ZC9hLnRzJywgJ2ZpbGU6Ly8vd2QvYi50cyddKTtcblxuXHRcdGNvbnN0IGNhdGFsb2d1ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cik/LmNoYW5nZXNldHM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXRhbG9ndWUsIFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdHVyaVRlbXBsYXRlOiBjaGFuZ2VzZXRVcmksXG5cdFx0XHRcdGNoYW5nZUtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnVW5jb21taXR0ZWQgQ2hhbmdlcycsXG5cdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Nob3cgdW5jb21taXR0ZWQgY2hhbmdlcyBpbiB0aGlzIHNlc3Npb24nLFxuXHRcdFx0XHRjaGFuZ2VLaW5kOiAndW5jb21taXR0ZWQnLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVN0YXRpY0NoYW5nZXNldCBjYXRhbG9ndWUgY291bnRzIG9ubHkgZW1pdHRlZCB1bmlxdWUgZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdGNvbnN0IGRpZmZzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAxMDAsIHJlbW92ZWQ6IDUwIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAyMCwgcmVtb3ZlZDogMTAgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9iLnRzJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uU3RyLCAnc2Vzc2lvbicsIGRpZmZzKTtcblxuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYDtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Q/LnN0YXRlIGFzIHsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZzsgZWRpdDogeyBkaWZmPzogeyBhZGRlZD86IG51bWJlcjsgcmVtb3ZlZD86IG51bWJlciB9IH0gfT4gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjYXRhbG9ndWUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpPy5jaGFuZ2VzZXRzO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZmlsZXM6IHN0YXRlPy5maWxlcy5tYXAoZiA9PiAoeyBpZDogZi5pZCwgZGlmZjogZi5lZGl0LmRpZmYgfSkpLFxuXHRcdFx0Y2F0YWxvZ3VlLFxuXHRcdH0sIHtcblx0XHRcdGZpbGVzOiBbXG5cdFx0XHRcdHsgaWQ6ICdmaWxlOi8vL3dkL2EudHMnLCBkaWZmOiB7IGFkZGVkOiAzLCByZW1vdmVkOiAxIH0gfSxcblx0XHRcdFx0eyBpZDogJ2ZpbGU6Ly8vd2QvYi50cycsIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9LFxuXHRcdFx0XSxcblx0XHRcdGNhdGFsb2d1ZTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdFx0dXJpVGVtcGxhdGU6IGNoYW5nZXNldFVyaSxcblx0XHRcdFx0XHRjaGFuZ2VLaW5kOiAnc2Vzc2lvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2hvdyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGluIHRoaXMgc2Vzc2lvbicsXG5cdFx0XHRcdFx0Y2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTdGF0aWNDaGFuZ2VzZXQgd29ya3Mgd2l0aG91dCBhIGxpdmUgc2Vzc2lvbiBzdGF0ZSAoc2VlZHMgdGhlIGNoYW5nZXNldCBmb3IgdW5vcGVuZWQgc2Vzc2lvbnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0Ly8gTm90ZTogc2V0dXBTZXNzaW9uIGlzIGludGVudGlvbmFsbHkgTk9UIGNhbGxlZC5cblxuXHRcdGNvbnN0IGRpZmZzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cdFx0Y2hhbmdlc2V0U2VydmljZS5yZXN0b3JlU3RhdGljQ2hhbmdlc2V0KHNlc3Npb25TdHIsICdzZXNzaW9uJywgZGlmZnMpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBzdGF0ZSBzdGlsbCBkb2Vzbid0IGV4aXN0IFx1MjAxNCBvbmx5IHRoZSBjaGFuZ2VzZXRcblx0XHQvLyBzdGF0ZSBpcyByZWdpc3RlcmVkIHNvIGEgY2xpZW50IHN1YnNjcmlwdGlvbiByZXNvbHZlcy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdGFzc2VydC5vayhzbmFwc2hvdCwgJ2V4cGVjdGVkIHRoZSBjaGFuZ2VzZXQgVVJJIHRvIGJlIHN1YnNjcmliYWJsZSBldmVuIHdpdGhvdXQgYSBzZXNzaW9uIHN0YXRlJyk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdC5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBmaWxlczogQXJyYXk8eyBpZDogc3RyaW5nIH0+IH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgJ3JlYWR5Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5maWxlcy5tYXAoZiA9PiBmLmlkKSwgWydmaWxlOi8vL3dkL2EudHMnXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXNzaW9uIGRpZmYgY29tcHV0YXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdnaXQtZHJpdmVuIHBhdGggaXMgcHJlZmVycmVkIHdoZW4gYSBnaXQgc2VydmljZSBpcyBwcm92aWRlZCBhbmQgdGhlIHdvcmtpbmcgZGlyIGlzIGEgZ2l0IHdvcmsgdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdFx0Y29uc3QgZ2l0RGlmZnMgPSBbe1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL25ldy50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9uZXcudHMnIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBjb21wdXRlQ2FsbHM6IHsgd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nOyBzZXNzaW9uVXJpOiBzdHJpbmc7IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHN0dWJHaXQgPSB7XG5cdFx0XHRcdGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzOiBhc3luYyAod2Q6IFVSSSwgb3B0czogeyBzZXNzaW9uVXJpOiBzdHJpbmc7IGJhc2VCcmFuY2g/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRcdGNvbXB1dGVDYWxscy5wdXNoKHsgd29ya2luZ0RpcmVjdG9yeTogd2QudG9TdHJpbmcoKSwgc2Vzc2lvblVyaTogb3B0cy5zZXNzaW9uVXJpLCBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdFx0cmV0dXJuIGdpdERpZmZzO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXG5cdFx0XHRjb25zdCBsb2NhbENoYW5nZXNldHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBzdHViR2l0LCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKGxvY2FsU3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLCBjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksIGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpKSwgTlVMTF9SRVZJRVdfU0VSVklDRSkpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHNlc3Npb25EYi5zZXRNZXRhZGF0YSgnYWdlbnRIb3N0LmRpZmZCYXNlQnJhbmNoJywgJ21haW4nKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobG9jYWxTdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiB7XG5cdFx0XHRcdGVudmVsb3Blcy5wdXNoKGUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGEgdHVybi1jb21wbGV0ZSAod2hpY2ggZmlyZXMgdGhlIGltbWVkaWF0ZSBkaWZmIHBhdGgpLlxuXHRcdFx0Ly8gVGhlIHVuY29tbWl0dGVkIHN1YnNjcmlwdGlvbiBtYWtlcyBvbi10dXJuLWNvbXBsZXRlIGNvbXB1dGUgdGhhdFxuXHRcdFx0Ly8gc2xvdCBhbG9uZ3NpZGUgdGhlIHNlc3Npb24td2lkZSBvbmUuXG5cdFx0XHRsb2NhbENoYW5nZXNldHMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIFR1cm4tY29tcGxldGUgcmVjb21wdXRlcyBib3RoIHRoZSB1bmNvbW1pdHRlZCBhbmQgdGhlXG5cdFx0XHQvLyBzZXNzaW9uLXdpZGUgY2hhbmdlc2V0cyB2aWEgdGhlIHBlci1rZXkgc2VxdWVuY2VyOyB3YWl0XG5cdFx0XHQvLyBkZXRlcm1pbmlzdGljYWxseSB1bnRpbCBib3RoIGdpdCBjYWxscyBoYXZlIGJlZW4gb2JzZXJ2ZWRcblx0XHRcdC8vIHJhdGhlciB0aGFuIHJhY2luZyBvbiB0aGUgZmlyc3QgZGlzcGF0Y2hlZCBlbnZlbG9wZS5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjAwICYmIGNvbXB1dGVDYWxscy5sZW5ndGggPCAyOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHVybi1jb21wbGV0ZSByZWNvbXB1dGVzIGJvdGggdGhlIHVuY29tbWl0dGVkIChub1xuXHRcdFx0Ly8gYGJhc2VCcmFuY2hgKSBhbmQgdGhlIHNlc3Npb24td2lkZSAod2l0aCBgYmFzZUJyYW5jaGApXG5cdFx0XHQvLyBjaGFuZ2VzZXRzIGluIHBhcmFsbGVsOyBhc3NlcnQgYm90aCByYW4gd2l0aCB0aGUgcmlnaHRcblx0XHRcdC8vIG9wdGlvbnMgcmVnYXJkbGVzcyBvZiBvcmRlci5cblx0XHRcdGNvbnN0IHNvcnRlZENhbGxzID0gWy4uLmNvbXB1dGVDYWxsc10uc29ydCgoYSwgYikgPT5cblx0XHRcdFx0KGEuYmFzZUJyYW5jaCA/PyAnJykgPCAoYi5iYXNlQnJhbmNoID8/ICcnKSA/IC0xIDogMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvcnRlZENhbGxzLCBbXG5cdFx0XHRcdHsgd29ya2luZ0RpcmVjdG9yeTogJ2ZpbGU6Ly8vd2QnLCBzZXNzaW9uVXJpOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGJhc2VCcmFuY2g6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IHdvcmtpbmdEaXJlY3Rvcnk6ICdmaWxlOi8vL3dkJywgc2Vzc2lvblVyaTogc2Vzc2lvblVyaS50b1N0cmluZygpLCBiYXNlQnJhbmNoOiAnbWFpbicgfSxcblx0XHRcdF0pO1xuXHRcdFx0Ly8gRWFjaCBjb21wdXRlIHBhc3MgbGFuZHMgYXMgYSBzaW5nbGUgYGNoYW5nZXNldC9jb250ZW50Q2hhbmdlZGBcblx0XHRcdC8vIGVudmVsb3BlIGNhcnJ5aW5nIHRoZSBmdWxsIGZpbGUgbGlzdC4gV2FsayB0aGUgY2FwdHVyZWQgc3RyZWFtXG5cdFx0XHQvLyBhbmQgcmVjb25zdHJ1Y3QgdGhlIHBlci1jaGFuZ2VzZXQgZmlsZSBsaXN0cyB0byBhc3NlcnQgZWFjaFxuXHRcdFx0Ly8gbWF0Y2hlcyB0aGUgZ2l0IHNlcnZpY2Ugb3V0cHV0LlxuXHRcdFx0Y29uc3QgY29udGVudENoYW5nZXMgPSBlbnZlbG9wZXNcblx0XHRcdFx0LmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q29udGVudENoYW5nZWQpIGFzIEFycmF5PHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IHsgZmlsZXM6IEFycmF5PHsgZWRpdDogdW5rbm93biB9PiB9IH0+O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjb250ZW50Q2hhbmdlcy5maWx0ZXIoZSA9PiBlLmNoYW5uZWwgPT09IGAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3Nlc3Npb25gKTtcblx0XHRcdGNvbnN0IHVuY29tbWl0dGVkQ29udGVudCA9IGNvbnRlbnRDaGFuZ2VzLmZpbHRlcihlID0+IGUuY2hhbm5lbCA9PT0gYCR7c2Vzc2lvblVyaS50b1N0cmluZygpfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbkNvbnRlbnQuYXQoLTEpPy5hY3Rpb24uZmlsZXMubWFwKGYgPT4gZi5lZGl0KSwgZ2l0RGlmZnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1bmNvbW1pdHRlZENvbnRlbnQuYXQoLTEpPy5hY3Rpb24uZmlsZXMubWFwKGYgPT4gZi5lZGl0KSwgZ2l0RGlmZnMpO1xuXG5cdFx0XHQvLyBUaGUgY29tcHV0ZSBwYXNzIGFsc28gcGVyc2lzdHMgdGhlIGZpbGUgbGlzdCB1bmRlciB0aGVcblx0XHRcdC8vIGxlZ2FjeSBgJ2RpZmZzJ2Agc2xvdCBzbyBpdCBzdXJ2aXZlcyByZXN0YXJ0cy4gVGhlIHdyaXRlXG5cdFx0XHQvLyBpcyBmaXJlLWFuZC1mb3JnZXQgdGhyb3VnaCB0aGUgbWV0YWRhdGEgc2VxdWVuY2VyOyBwb2xsXG5cdFx0XHQvLyBicmllZmx5IHVudGlsIGl0IGxhbmRzLlxuXHRcdFx0bGV0IHBlcnNpc3RlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MCAmJiAhcGVyc2lzdGVkOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdFx0cGVyc2lzdGVkID0gYXdhaXQgc2Vzc2lvbkRiLmdldE1ldGFkYXRhKCdkaWZmcycpO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm9rKHBlcnNpc3RlZCwgJ2V4cGVjdGVkIHRoZSBjb21wdXRlIHBhc3MgdG8gcGVyc2lzdCBkaWZmcyB0byB0aGUgc2Vzc2lvbiBEQicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHBlcnNpc3RlZCksIGdpdERpZmZzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24gY2hhbmdlc2V0IGZhbGxzIGJhY2sgdG8gX21ldGEuZ2l0IGJhc2UgYnJhbmNoIHdoZW4gcGVyc2lzdGVkIGRpZmYgYmFzZSBpcyBhYnNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGIgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzZXNzaW9uRGIuY2xvc2UoKSkpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBjb21wdXRlQ2FsbHM6IHsgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3R1YkdpdCA9IHtcblx0XHRcdFx0Y29tcHV0ZVNlc3Npb25GaWxlRGlmZnM6IGFzeW5jIChfd2Q6IFVSSSwgb3B0czogeyBzZXNzaW9uVXJpOiBzdHJpbmc7IGJhc2VCcmFuY2g/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRcdGNvbXB1dGVDYWxscy5wdXNoKHsgYmFzZUJyYW5jaDogb3B0cy5iYXNlQnJhbmNoIH0pO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0R2l0U2VydmljZTtcblx0XHRcdGNvbnN0IGxvY2FsQ2hhbmdlc2V0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZShcblx0XHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHN0dWJHaXQsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLCBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxTdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksIGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSwgY3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZShidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSkpLCBOVUxMX1JFVklFV19TRVJWSUNFKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25TdHIsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uU3RyLCB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pKTtcblxuXHRcdFx0bG9jYWxDaGFuZ2VzZXRzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MCAmJiBjb21wdXRlQ2FsbHMubGVuZ3RoID09PSAwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2FsbHMsIFt7IGJhc2VCcmFuY2g6ICdtYWluJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uIGNoYW5nZXNldCBrZWVwcyBwZXJzaXN0ZWQgZGlmZiBiYXNlIGFoZWFkIG9mIF9tZXRhLmdpdCBiYXNlIGJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuc2V0TWV0YWRhdGEoJ2FnZW50SG9zdC5kaWZmQmFzZUJyYW5jaCcsICdyZWxlYXNlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGNvbXB1dGVDYWxsczogeyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKF93ZDogVVJJLCBvcHRzOiB7IHNlc3Npb25Vcmk6IHN0cmluZzsgYmFzZUJyYW5jaD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdFx0Y29tcHV0ZUNhbGxzLnB1c2goeyBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKCksIE5VTExfUkVWSUVXX1NFUlZJQ0UpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblN0cixcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKHNlc3Npb25TdHIsIHdpdGhTZXNzaW9uR2l0U3RhdGUodW5kZWZpbmVkLCB7IGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSkpO1xuXG5cdFx0XHRsb2NhbENoYW5nZXNldHMucmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwICYmIGNvbXB1dGVDYWxscy5sZW5ndGggPT09IDA7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXB1dGVDYWxscywgW3sgYmFzZUJyYW5jaDogJ3JlbGVhc2UnIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGVkaXQtdHJhY2tlciBhZ2dyZWdhdG9yIHdoZW4gdGhlIGdpdCBzZXJ2aWNlIHJldHVybnMgdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRiID0gbmV3IFNlc3Npb25EYXRhYmFzZSgnOm1lbW9yeTonKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc2Vzc2lvbkRiLmNsb3NlKCkpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXG5cdFx0XHRjb25zdCBsb2NhbENoYW5nZXNldHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBzdHViR2l0LCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKGxvY2FsU3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLCBjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksIGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSwgTlVMTF9SRVZJRVdfU0VSVklDRSkpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRsZXQgcmVzb2x2ZURpZmZzOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkaWZmc0VtaXR0ZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHsgcmVzb2x2ZURpZmZzID0gcjsgfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobG9jYWxTdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiB7XG5cdFx0XHRcdGVudmVsb3Blcy5wdXNoKGUpO1xuXHRcdFx0XHRpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZURpZmZzPy4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRsb2NhbENoYW5nZXNldHMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdGF3YWl0IGRpZmZzRW1pdHRlZDtcblxuXHRcdFx0Ly8gV2l0aCBubyByZWNvcmRlZCBlZGl0cywgdGhlIGVkaXQtdHJhY2tlciBhZ2dyZWdhdG9yIHJldHVybnMgYW5cblx0XHRcdC8vIGVtcHR5IGFycmF5IFx1MjAxNCB0aGUgc2luZ2xlIGBjaGFuZ2VzZXQvY29udGVudENoYW5nZWRgIGVudmVsb3BlXG5cdFx0XHQvLyBjYXJyaWVzIGFuIGVtcHR5IGZpbGUgbGlzdC4gVGhlIGltcG9ydGFudCBhc3NlcnRpb24gaXMgdGhhdCB3ZVxuXHRcdFx0Ly8gc3RpbGwgcmFuIHRoZSBwcm9kdWNlciB0aHJvdWdoIHRvIGEgYGNoYW5nZXNldC9zdGF0dXNDaGFuZ2VkIFx1MjE5MlxuXHRcdFx0Ly8gcmVhZHlgIGVudmVsb3BlLCB3aGljaCBwcm92ZXMgdGhlIGZhbGxiYWNrIHBhdGggZXhlY3V0ZWQgd2l0aG91dFxuXHRcdFx0Ly8gdGhyb3dpbmcuXG5cdFx0XHRjb25zdCBjb250ZW50Q2hhbmdlcyA9IGVudmVsb3Blc1xuXHRcdFx0XHQubWFwKGUgPT4gZS5hY3Rpb24pXG5cdFx0XHRcdC5maWx0ZXIoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q29udGVudENoYW5nZWQpIGFzIEFycmF5PHsgZmlsZXM6IHVua25vd25bXSB9Pjtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGVudENoYW5nZXMubWFwKGEgPT4gYS5maWxlcyksIFtbXV0pO1xuXHRcdFx0Y29uc3Qgc3RhdHVzQWN0aW9uID0gZW52ZWxvcGVzXG5cdFx0XHRcdC5tYXAoZSA9PiBlLmFjdGlvbilcblx0XHRcdFx0LmZpbmQoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQub2soc3RhdHVzQWN0aW9uLCAnZXhwZWN0ZWQgYSBjaGFuZ2VzZXQvc3RhdHVzQ2hhbmdlZCBlbnZlbG9wZSBmcm9tIHRoZSBmYWxsYmFjayBwYXRoJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdoYXBweSBwYXRoOiBnaXQgcmV0dXJucyBkaWZmcywgc3RhdGUgZ29lcyBSZWFkeSB3aXRoIGZpbGVzLCBub3RoaW5nIHBlcnNpc3RlZCB0byB0aGUgREInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGIgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzZXNzaW9uRGIuY2xvc2UoKSkpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRcdGNvbnN0IGdpdERpZmZzID0gW1xuXHRcdFx0XHR7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9LFxuXHRcdFx0XHR7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9iLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDIsIHJlbW92ZWQ6IDEgfSB9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHN0dWJHaXQgPSB7XG5cdFx0XHRcdGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzOiBhc3luYyAoKSA9PiBnaXREaWZmcyxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0R2l0U2VydmljZTtcblxuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKCksIE5VTExfUkVWSUVXX1NFUlZJQ0UpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblN0cixcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbG9jYWxDaGFuZ2VzZXRzLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uU3RyKTtcblxuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgO1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBsb2NhbFN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdCh1bmNvbW1pdHRlZFVyaSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBmaWxlczogQXJyYXk8eyBpZDogc3RyaW5nIH0+IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiBzdGF0ZT8uc3RhdHVzLFxuXHRcdFx0XHRmaWxlczogc3RhdGU/LmZpbGVzLm1hcChmID0+IGYuaWQpLnNvcnQoKSxcblx0XHRcdFx0cGVyc2lzdGVkVW5jb21taXR0ZWQ6IGF3YWl0IHNlc3Npb25EYi5nZXRNZXRhZGF0YSgnYWdlbnRIb3N0LmNoYW5nZXNldC51bmNvbW1pdHRlZCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdFx0ZmlsZXM6IFsnZmlsZTovLy93ZC9hLnRzJywgJ2ZpbGU6Ly8vd2QvYi50cyddLFxuXHRcdFx0XHRwZXJzaXN0ZWRVbmNvbW1pdHRlZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyB3b3JraW5nIGRpcmVjdG9yeTogc3RhdGUgZ29lcyBFcnJvciB3aXRoIGNvbXB1dGVGYWlsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGF3YWl0IGNoYW5nZXNldFNlcnZpY2UuY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXG5cdFx0XHRjb25zdCB1bmNvbW1pdHRlZFVyaSA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdCh1bmNvbW1pdHRlZFVyaSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBlcnJvcj86IHsgZXJyb3JUeXBlOiBzdHJpbmcgfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXR1czogc3RhdGU/LnN0YXR1cyxcblx0XHRcdFx0ZXJyb3JUeXBlOiBzdGF0ZT8uZXJyb3I/LmVycm9yVHlwZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsXG5cdFx0XHRcdGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXQgcmV0dXJucyB1bmRlZmluZWQgKG5vdCBhIGdpdCB3b3JrIHRyZWUpOiBzdGF0ZSBnb2VzIEVycm9yIHdpdGggY29tcHV0ZUZhaWxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Ly8gU2hhcmVkIGBjaGFuZ2VzZXRTZXJ2aWNlYCB1c2VzIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkgd2hvc2Vcblx0XHRcdC8vIGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzIHJldHVybnMgdW5kZWZpbmVkIFx1MjAxNCBleGFjdGx5IHRoZVxuXHRcdFx0Ly8gXCJub3QgYSBnaXQgd29yayB0cmVlXCIgc2lnbmFsIHdlIHdhbnQgdG8gZXhlcmNpc2UuXG5cdFx0XHRhd2FpdCBjaGFuZ2VzZXRTZXJ2aWNlLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uU3RyKTtcblxuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgO1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QodW5jb21taXR0ZWRVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZXJyb3I/OiB7IGVycm9yVHlwZTogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHN0YXRlPy5zdGF0dXMsXG5cdFx0XHRcdGVycm9yVHlwZTogc3RhdGU/LmVycm9yPy5lcnJvclR5cGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0IHRocm93czogc3RhdGUgZ29lcyBFcnJvciB3aXRoIG9yaWdpbmFsIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2dpdCBjb21tYW5kIGZhaWxlZCcpOyB9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSksIE5VTExfUkVWSUVXX1NFUlZJQ0UpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblN0cixcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbG9jYWxDaGFuZ2VzZXRzLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uU3RyKTtcblxuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgO1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBsb2NhbFN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdCh1bmNvbW1pdHRlZFVyaSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBlcnJvcj86IHsgZXJyb3JUeXBlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiBzdGF0ZT8uc3RhdHVzLFxuXHRcdFx0XHRlcnJvclR5cGU6IHN0YXRlPy5lcnJvcj8uZXJyb3JUeXBlLFxuXHRcdFx0XHRtZXNzYWdlOiBzdGF0ZT8uZXJyb3I/Lm1lc3NhZ2UsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ2dpdCBjb21tYW5kIGZhaWxlZCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RlZmVycmVkIHJlZnJlc2ggKHdvcmtpbmcgZGlyZWN0b3J5IHVua25vd24pJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlRGVmZXJyaW5nU2VydmljZShzdWJzY3JpcHRpb25zOiBJdGVyYWJsZTxzdHJpbmc+ID0gW10pOiB7IHNlcnZpY2U6IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2U7IGxvY2FsU3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7IGNvbXB1dGVzOiBzdHJpbmdbXTsgc3Vic2NyaXB0aW9uczogU2V0PHN0cmluZz4gfSB7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBjb21wdXRlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHN0dWJHaXQgPSB7XG5cdFx0XHRcdGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzOiBhc3luYyAoKSA9PiB7IGNvbXB1dGVzLnB1c2goJ3Nlc3Npb24nKTsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0XHRjb21wdXRlVW5jb21taXR0ZWRGaWxlRGlmZnM6IGFzeW5jICgpID0+IHsgY29tcHV0ZXMucHVzaCgndW5jb21taXR0ZWQnKTsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uU2VydmljZSA9IGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoLi4uc3Vic2NyaXB0aW9ucyk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlcixcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0c3R1YkdpdCxcblx0XHRcdFx0TlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSxcblx0XHRcdFx0Y3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRzdWJzY3JpcHRpb25TZXJ2aWNlLFxuXHRcdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0KSk7XG5cdFx0XHRyZXR1cm4geyBzZXJ2aWNlLCBsb2NhbFN0YXRlTWFuYWdlciwgY29tcHV0ZXMsIHN1YnNjcmlwdGlvbnM6IHN1YnNjcmlwdGlvblNlcnZpY2Uuc3Vic2NyaXB0aW9ucyB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25TdGF0ZShsb2NhbFN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25TdHIsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnNldFNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb25TdHIsIGJ1aWxkRGVmYXVsdENoYW5nZXNldENhdGFsb2coc2Vzc2lvblN0cikpO1xuXHRcdFx0cmV0dXJuIHNlc3Npb25TdHI7XG5cdFx0fVxuXG5cdFx0dGVzdCgncmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQgLyByZWZyZXNoQnJhbmNoQ2hhbmdlc2V0IGRlZmVyIHVudGlsIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyBrbm93biwgdGhlbiBkcmFpbiB0aGUgc3Vic2NyaWJlZCBjaGFuZ2VzZXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgbG9jYWxTdGF0ZU1hbmFnZXIsIGNvbXB1dGVzIH0gPSBjcmVhdGVEZWZlcnJpbmdTZXJ2aWNlKFtcblx0XHRcdFx0YnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0ciksXG5cdFx0XHRcdGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uU3RyKSxcblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlU2Vzc2lvblN0YXRlKGxvY2FsU3RhdGVNYW5hZ2VyLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRzZXJ2aWNlLnJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRzZXJ2aWNlLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcHV0ZXMsIFtdLCAnbm90aGluZyBjb21wdXRlZCB3aGlsZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMgdW5rbm93bicpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblN0cikhO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIubWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvblN0ciwgeyAuLi5zdW1tYXJ5LCB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddIH0pO1xuXHRcdFx0c2VydmljZS5vbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGUoc2Vzc2lvblN0cik7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlcy5zb3J0KCksIFsnc2Vzc2lvbicsICdzZXNzaW9uJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0IGRlZmVycyB1bnRpbCB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMga25vd24sIHRoZW4gZHJhaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgbG9jYWxTdGF0ZU1hbmFnZXIsIGNvbXB1dGVzIH0gPSBjcmVhdGVEZWZlcnJpbmdTZXJ2aWNlKFtidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpXSk7XG5cdFx0XHRjcmVhdGVTZXNzaW9uU3RhdGUobG9jYWxTdGF0ZU1hbmFnZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlcywgW10sICd1bmNvbW1pdHRlZCBjb21wdXRlIGRlZmVycmVkIHdoaWxlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyB1bmtub3duJyk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBsb2NhbFN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uU3RyKSE7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZChzZXNzaW9uU3RyLCB7IC4uLnN1bW1hcnksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10gfSk7XG5cdFx0XHRzZXJ2aWNlLm9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZShzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXB1dGVzLCBbJ3VuY29tbWl0dGVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjaGFuZ2VzZXQgdW5zdWJzY3JpYmVkIGJlZm9yZSBtYXRlcmlhbGl6YXRpb24gaXMgbmF0dXJhbGx5IHNraXBwZWQgb24gZHJhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBsb2NhbFN0YXRlTWFuYWdlciwgY29tcHV0ZXMsIHN1YnNjcmlwdGlvbnMgfSA9IGNyZWF0ZURlZmVycmluZ1NlcnZpY2UoW2J1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uU3RyKV0pO1xuXHRcdFx0Y3JlYXRlU2Vzc2lvblN0YXRlKGxvY2FsU3RhdGVNYW5hZ2VyLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRzZXJ2aWNlLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Ly8gTGFzdCBzdWJzY3JpYmVyIGxlYXZlcyBiZWZvcmUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGtub3duLlxuXHRcdFx0c3Vic2NyaXB0aW9ucy5kZWxldGUoYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGxvY2FsU3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25TdHIpITtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb25TdHIsIHsgLi4uc3VtbWFyeSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSB9KTtcblx0XHRcdHNlcnZpY2Uub25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKHNlc3Npb25TdHIpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcHV0ZXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uU2Vzc2lvbkRpc3Bvc2VkIGNsZWFycyBldmVyeSBwZW5kaW5nIHJlZnJlc2ggZm9yIHRoZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgbG9jYWxTdGF0ZU1hbmFnZXIsIGNvbXB1dGVzIH0gPSBjcmVhdGVEZWZlcnJpbmdTZXJ2aWNlKFtcblx0XHRcdFx0YnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0ciksXG5cdFx0XHRcdGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uU3RyKSxcblx0XHRcdFx0YnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uU3RyKSxcblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlU2Vzc2lvblN0YXRlKGxvY2FsU3RhdGVNYW5hZ2VyLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRzZXJ2aWNlLnJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRzZXJ2aWNlLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRzZXJ2aWNlLm9uU2Vzc2lvbkRpc3Bvc2VkKHNlc3Npb25TdHIpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblN0cikhO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIubWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvblN0ciwgeyAuLi5zdW1tYXJ5LCB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddIH0pO1xuXHRcdFx0c2VydmljZS5vbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGUoc2Vzc2lvblN0cik7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlcywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBhRGlmZiA9IHsgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSwgZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9IH07XG5cdFx0Y29uc3QgYkRpZmYgPSB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9iLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDIsIHJlbW92ZWQ6IDAgfSB9O1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cblx0XHR0ZXN0KCdwYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMgcGFyc2VzIHdpdGhvdXQgbXV0YXRpbmcgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNoYW5nZXNldFNlcnZpY2UucmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjaGFuZ2VzZXRTZXJ2aWNlLnBhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyLCB7XG5cdFx0XHRcdHNlc3Npb25SYXc6IEpTT04uc3RyaW5naWZ5KFtiRGlmZl0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uOiByZXN1bHQuc2Vzc2lvbj8ubWFwKGQgPT4gZC5hZnRlcj8udXJpKSxcblx0XHRcdFx0c2Vzc2lvblN0YXRlOiBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbjogWydmaWxlOi8vL3dkL2IudHMnXSxcblx0XHRcdFx0c2Vzc2lvblN0YXRlOiB7IHN0YXR1czogJ2NvbXB1dGluZycsIGZpbGVzOiBbXSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBseVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMgc2VlZHMgcGFyc2VkIGRpZmZzJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IGNoYW5nZXNldFNlcnZpY2UucGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIsIHtcblx0XHRcdFx0c2Vzc2lvblJhdzogSlNPTi5zdHJpbmdpZnkoW2JEaWZmXSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y2hhbmdlc2V0U2VydmljZS5hcHBseVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0ciwgcGFyc2VkKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2Vzc2lvbiAmJiB7IHN0YXR1czogc2Vzc2lvbi5zdGF0dXMsIGZpbGVzOiBzZXNzaW9uLmZpbGVzLm1hcChmID0+IGYuaWQpIH0sXG5cdFx0XHRcdHsgc3RhdHVzOiAncmVhZHknLCBmaWxlczogWydmaWxlOi8vL3dkL2IudHMnXSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25ldyBzZXNzaW9uUmF3IGJlYXRzIGxlZ2FjeVJhdyB3aGVuIGJvdGggYXJlIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2hhbmdlc2V0U2VydmljZS5yZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyLCB7XG5cdFx0XHRcdHNlc3Npb25SYXc6IEpTT04uc3RyaW5naWZ5KFthRGlmZl0pLFxuXHRcdFx0XHRsZWdhY3lSYXc6IEpTT04uc3RyaW5naWZ5KFtiRGlmZl0pLCAvLyB3b3VsZCBsb3NlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuc2Vzc2lvbj8ubWFwKGQgPT4gZC5hZnRlcj8udXJpKSwgWydmaWxlOi8vL3dkL2EudHMnXSwgJ25ldyBrZXkgd2lucyBvdmVyIGxlZ2FjeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVnYWN5UmF3IHN0aWxsIHJlc3RvcmVzIHNlc3Npb24gc3RhdGUgd2hlbiBzZXNzaW9uUmF3IGlzIGFic2VudCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjaGFuZ2VzZXRTZXJ2aWNlLnJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIsIHtcblx0XHRcdFx0bGVnYWN5UmF3OiBKU09OLnN0cmluZ2lmeShbYkRpZmZdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9uPy5tYXAoZCA9PiBkLmFmdGVyPy51cmkpLCBbJ2ZpbGU6Ly8vd2QvYi50cyddKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc2Vzc2lvbj8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZyB9KS5zdGF0dXMsICdyZWFkeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFsZm9ybWVkIEpTT04gbG9ncyBhbmQgcmV0dXJucyB1bmRlZmluZWQgZm9yIHRoYXQgc2xvdCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y2hhbmdlc2V0U2VydmljZS5yZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0cik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0ciwge1xuXHRcdFx0XHRzZXNzaW9uUmF3OiAneyBub3QgdmFsaWQganNvbicsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9uLCB1bmRlZmluZWQsICdtYWxmb3JtZWQgc2xvdCByZXR1cm5zIHVuZGVmaW5lZCcpO1xuXHRcdFx0Ly8gU2Vzc2lvbiBzbmFwc2hvdCBzdGF5ZWQgaW4gYGNvbXB1dGluZ2AgYmVjYXVzZSBtYWxmb3JtZWQgaW5wdXRcblx0XHRcdC8vIHdhcyBkaXNjYXJkZWQgXHUyMDE0IG5vdCBzZWVkZWQgd2l0aCBnYXJiYWdlLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzZXNzaW9uPy5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cywgJ2NvbXB1dGluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VlZElmRW1wdHkgaG9ub3VyZWQ6IGxpdmUgc3RhdGUgd2l0aCBmaWxlcyBpcyBub3Qgb3ZlcndyaXR0ZW4nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Ly8gU2VlZCBsaXZlIHNlc3Npb24gc3RhdGUgdmlhIHJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQgdG8gbWltaWNcblx0XHRcdC8vIGEgZnJlc2ggcmVmcmVzaCB0aGF0IGxhbmRlZCBiZWZvcmUgdGhlIHBlcnNpc3RlZC1vdmVybGF5IGNhbGwuXG5cdFx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3Nlc3Npb24nLCBbYURpZmZdKTtcblx0XHRcdGNvbnN0IGJlZm9yZSA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYmVmb3JlPy5zdGF0ZSBhcyB7IGZpbGVzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gfSkuZmlsZXMubWFwKGYgPT4gZi5pZCksIFsnZmlsZTovLy93ZC9hLnRzJ10pO1xuXG5cdFx0XHQvLyBQZXJzaXN0ZWQgYmxvYiBwb2ludHMgYXQgYSBESUZGRVJFTlQgZmlsZTsgd2l0aG91dCB0aGUgZ3VhcmQgaXRcblx0XHRcdC8vIHdvdWxkIGNsb2JiZXIgdGhlIGxpdmUgc3RhdGUuXG5cdFx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIsIHtcblx0XHRcdFx0c2Vzc2lvblJhdzogSlNPTi5zdHJpbmdpZnkoW2JEaWZmXSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdChhZnRlcj8uc3RhdGUgYXMgeyBmaWxlczogQXJyYXk8eyBpZDogc3RyaW5nIH0+IH0pLmZpbGVzLm1hcChmID0+IGYuaWQpLFxuXHRcdFx0XHRbJ2ZpbGU6Ly8vd2QvYS50cyddLFxuXHRcdFx0XHQnbGl2ZSBzdGF0ZSBtdXN0IGJlIHByZXNlcnZlZCB3aGVuIHBlcnNpc3RlZCBvdmVybGF5IHRyaWVzIHRvIG92ZXJ3cml0ZSBpdCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBsaXZlIHNlc3Npb24gc3RhdGUsIHJlc3RvcmVkIGRpZmZzIHB1Ymxpc2ggcmVhZHkgKyBjYXRhbG9ndWUgY291bnRzJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0ciwge1xuXHRcdFx0XHRzZXNzaW9uUmF3OiBKU09OLnN0cmluZ2lmeShbYURpZmYsIGJEaWZmXSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2F0YWxvZ3VlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKT8uY2hhbmdlc2V0cztcblx0XHRcdGNvbnN0IHNlc3Npb25FbnRyeSA9IGNhdGFsb2d1ZT8uZmluZCgoYzogQ2hhbmdlc2V0KSA9PiBjLnVyaVRlbXBsYXRlID09PSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uRW50cnksIHtcblx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmAsXG5cdFx0XHRcdGNoYW5nZUtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdH0sICdjYXRhbG9ndWUgY291bnRzIG11c3QgcmVmbGVjdCByZXN0b3JlZCBmaWxlcycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaWRsZSBjaGFuZ2VzZXQgTFJVIGV2aWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblxuXHRcdHRlc3QoJ2lkbGUgY2hhbmdlc2V0IHN0YXRlcyBhcmUgZXZpY3RlZCBvdmVyIHRoZSBzb2Z0IGxpbWl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSwgeyBjaGFuZ2VzZXRTdGF0ZVJldGVudGlvbjogeyBzb2Z0TGltaXQ6IDIgfSB9KSk7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYDtcblx0XHRcdGNvbnN0IHNlY29uZCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cdFx0XHRjb25zdCB0aGlyZCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC90dXJuL3R1cm4tMWA7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGZpcnN0KTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KHNlY29uZCk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldCh0aGlyZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmaXJzdDogbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoZmlyc3QpLFxuXHRcdFx0XHRzZWNvbmQ6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHNlY29uZCk/LnN0YXR1cyxcblx0XHRcdFx0dGhpcmQ6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHRoaXJkKT8uc3RhdHVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmaXJzdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZWNvbmQ6ICdjb21wdXRpbmcnLFxuXHRcdFx0XHR0aGlyZDogJ2NvbXB1dGluZycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V2aWN0YWJpbGl0eSBwcm9iZSBwcm90ZWN0cyBzdWJzY3JpYmVkIGNoYW5nZXNldHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYDtcblx0XHRcdGNvbnN0IHNlY29uZCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cdFx0XHRjb25zdCB0aGlyZCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC90dXJuL3R1cm4tMWA7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpLCB7IGNoYW5nZXNldFN0YXRlUmV0ZW50aW9uOiB7IHNvZnRMaW1pdDogMiwgY2FuRXZpY3Q6IGNoYW5nZXNldCA9PiBjaGFuZ2VzZXQgIT09IGZpcnN0IH0gfSkpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChmaXJzdCk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChzZWNvbmQpO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQodGhpcmQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3Q6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGZpcnN0KT8uc3RhdHVzLFxuXHRcdFx0XHRzZWNvbmQ6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHNlY29uZCksXG5cdFx0XHRcdHRoaXJkOiBsb2NhbFN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZSh0aGlyZCk/LnN0YXR1cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zmlyc3Q6ICdjb21wdXRpbmcnLFxuXHRcdFx0XHRzZWNvbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGhpcmQ6ICdjb21wdXRpbmcnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdMUlUgZXZpY3Rpb24gaXMgc2lsZW50IGFuZCBkb2VzIG5vdCBkaXNwYXRjaCBDaGFuZ2VzZXRDbGVhcmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSwgeyBjaGFuZ2VzZXRTdGF0ZVJldGVudGlvbjogeyBzb2Z0TGltaXQ6IDEgfSB9KSk7XG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKGxvY2FsU3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gKTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudmVsb3Blcy5tYXAoZSA9PiBlLmFjdGlvbi50eXBlKSwgW10pO1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbW1pbmcgcmVjb25zaWRlcnMgZW50cmllcyBhZnRlciB0aGV5IGJlY29tZSBldmljdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRsZXQgY2FuRXZpY3QgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCksIHsgY2hhbmdlc2V0U3RhdGVSZXRlbnRpb246IHsgc29mdExpbWl0OiAxLCBjYW5FdmljdDogKCkgPT4gY2FuRXZpY3QgfSB9KSk7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYDtcblx0XHRcdGNvbnN0IHNlY29uZCA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGZpcnN0KTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KHNlY29uZCk7XG5cdFx0XHRjYW5FdmljdCA9IHRydWU7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5vbkNoYW5nZXNldExpdmVuZXNzQ2hhbmdlZCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3Q6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGZpcnN0KSxcblx0XHRcdFx0c2Vjb25kOiBsb2NhbFN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShzZWNvbmQpPy5zdGF0dXMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZpcnN0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlY29uZDogJ2NvbXB1dGluZycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Blci10dXJuIGxpdmUgc3RyZWFtaW5nJywgKCkgPT4ge1xuXG5cdFx0Ly8gVGVzdCByaWc6IGEgc3ViY2xhc3MgdGhhdCBjb3VudHMgYGNvbXB1dGVUdXJuQ2hhbmdlc2V0YCBpbnZvY2F0aW9uc1xuXHRcdC8vIHNvIHdlIGNhbiBhc3NlcnQgZ2F0aW5nIHdpcmluZyB3aXRob3V0IG5lZWRpbmcgcmVhbCBzZXNzaW9uIERCXG5cdFx0Ly8gY29udGVudCBmb3IgYGNvbXB1dGVUdXJuRGlmZnNgIHRvIGNoZXcgb24uIFRoZSBiYXNlIGNsYXNzIGJlaGF2aW91clxuXHRcdC8vIGlzIHByZXNlcnZlZCAoc3VwZXItY2FsbCBpcyBhd2FpdGVkKSwgc28gYW55IHBlci1maWxlIGRpc3BhdGNoIHRoZVxuXHRcdC8vIHByb2R1Y3Rpb24gcGF0aCB3b3VsZCBlbWl0IHN0aWxsIGZsb3dzIHRocm91Z2ggbm9ybWFsbHkuXG5cdFx0Y2xhc3MgQ291bnRpbmdDaGFuZ2VzZXRTZXJ2aWNlIGV4dGVuZHMgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB7XG5cdFx0XHRyZWFkb25seSB0dXJuQ29tcHV0ZUNhbGxzOiB7IHNlc3Npb246IHN0cmluZzsgdHVybklkOiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRyZWFkb25seSB1bmNvbW1pdHRlZENvbXB1dGVDYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdFx0XHR0aGlzLnR1cm5Db21wdXRlQ2FsbHMucHVzaCh7IHNlc3Npb24sIHR1cm5JZCB9KTtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLmNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb24sIHR1cm5JZCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdFx0dGhpcy51bmNvbW1pdHRlZENvbXB1dGVDYWxscy5wdXNoKHNlc3Npb24pO1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPjtcblx0XHRmdW5jdGlvbiBtYWtlU2VydmljZSgpOiBDb3VudGluZ0NoYW5nZXNldFNlcnZpY2Uge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uU2VydmljZSA9IGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKTtcblx0XHRcdHN1YnNjcmlwdGlvbnMgPSBzdWJzY3JpcHRpb25TZXJ2aWNlLnN1YnNjcmlwdGlvbnM7XG5cdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb3VudGluZ0NoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdFx0TlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0c3Vic2NyaXB0aW9uU2VydmljZSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdCkpO1xuXHRcdH1cblx0XHR0ZXN0KCdvblR1cm5Db21wbGV0ZSBzY2hlZHVsZXMgYSBwZXItdHVybiByZWNvbXB1dGUgd2hlbiBzb21lb25lIGlzIHN1YnNjcmliZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHN2YyA9IG1ha2VTZXJ2aWNlKCk7XG5cdFx0XHRzdWJzY3JpcHRpb25zLmFkZChidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJykpO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIFNlcXVlbmNlciBkcmFpbnMgYXN5bmM7IHdhaXQgYnJpZWZseSBmb3IgdGhlIHBlci10dXJuIGNhbGwuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwICYmIHN2Yy50dXJuQ29tcHV0ZUNhbGxzLmxlbmd0aCA9PT0gMDsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMik7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdmMudHVybkNvbXB1dGVDYWxscyxcblx0XHRcdFx0W3sgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCB0dXJuSWQ6ICd0dXJuLTEnIH1dLFxuXHRcdFx0XHQnZXhwZWN0ZWQgZXhhY3RseSBvbmUgcGVyLXR1cm4gY29tcHV0ZSBmb3IgdGhlIGNvbXBsZXRlZCB0dXJuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblR1cm5Db21wbGV0ZSBkb2VzIE5PVCBzY2hlZHVsZSBhIHBlci10dXJuIHJlY29tcHV0ZSB3aGVuIG5vYm9keSBpcyBzdWJzY3JpYmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzdmMgPSBtYWtlU2VydmljZSgpO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIEdpdmUgdGhlIHN0YXRpYyBjb21wdXRlcyBhIGNoYW5jZSB0byBkcmFpbiBcdTIwMTQgdGhlIHBlci10dXJuXG5cdFx0XHQvLyBjYWxsIG11c3QgcmVtYWluIGFic2VudCB0aHJvdWdob3V0LlxuXHRcdFx0YXdhaXQgdGltZW91dCgyMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN2Yy50dXJuQ29tcHV0ZUNhbGxzLCBbXSwgJ25vIHBlci10dXJuIGNvbXB1dGUgd2hlbiBub3RoaW5nIG9ic2VydmVzIHRoZSB0dXJuIFVSSScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25UdXJuQ29tcGxldGUgc2NoZWR1bGVzIGFuIHVuY29tbWl0dGVkIHJlY29tcHV0ZSB3aGVuIHNvbWVvbmUgaXMgc3Vic2NyaWJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc3ZjID0gbWFrZVNlcnZpY2UoKTtcblx0XHRcdHN1YnNjcmlwdGlvbnMuYWRkKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSk7XG5cblx0XHRcdHN2Yy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0dXJuLTEnKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MCAmJiBzdmMudW5jb21taXR0ZWRDb21wdXRlQ2FsbHMubGVuZ3RoID09PSAwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN2Yy51bmNvbW1pdHRlZENvbXB1dGVDYWxscyxcblx0XHRcdFx0W3Nlc3Npb25VcmkudG9TdHJpbmcoKV0sXG5cdFx0XHRcdCdleHBlY3RlZCBleGFjdGx5IG9uZSB1bmNvbW1pdHRlZCBjb21wdXRlIGZvciB0aGUgY29tcGxldGVkIHR1cm4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uVHVybkNvbXBsZXRlIGRvZXMgTk9UIHNjaGVkdWxlIGFuIHVuY29tbWl0dGVkIHJlY29tcHV0ZSB3aGVuIG5vYm9keSBpcyBzdWJzY3JpYmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzdmMgPSBtYWtlU2VydmljZSgpO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIEdpdmUgdGhlIHN0YXRpYyBjb21wdXRlcyBhIGNoYW5jZSB0byBkcmFpbiBcdTIwMTQgdGhlIHVuY29tbWl0dGVkXG5cdFx0XHQvLyBjYWxsIG11c3QgcmVtYWluIGFic2VudCB0aHJvdWdob3V0LlxuXHRcdFx0YXdhaXQgdGltZW91dCgyMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN2Yy51bmNvbW1pdHRlZENvbXB1dGVDYWxscywgW10sICdubyB1bmNvbW1pdHRlZCBjb21wdXRlIHdoZW4gbm90aGluZyBvYnNlcnZlcyB0aGUgdW5jb21taXR0ZWQgVVJJJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblRvb2xDYWxsRWRpdHNBcHBsaWVkIGZpcmVzIHRoZSBwZXItdHVybiBkZWJvdW5jZSBvbmx5IHdoZW4gc3Vic2NyaWJlcnMgZXhpc3Q7IGNhbmNlbGxlZCBieSBvblR1cm5Db21wbGV0ZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0XHRjb25zdCBzdmMgPSBtYWtlU2VydmljZSgpO1xuXHRcdFx0XHRzdWJzY3JpcHRpb25zLmFkZChidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJykpO1xuXG5cdFx0XHRcdC8vIDEpIGVkaXRzIHdpdGggc3Vic2NyaWJlciAtPiBhZnRlciBkZWJvdW5jZSwgZXhhY3RseSBvbmUgcGVyLXR1cm4gY29tcHV0ZSBmaXJlcy5cblx0XHRcdFx0c3ZjLm9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNl8wMDApOyAvLyBkZWJvdW5jZSBpcyA1c1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ZjLnR1cm5Db21wdXRlQ2FsbHMubGVuZ3RoLCAxLCAnZGVib3VuY2Ugc2hvdWxkIGZpcmUgb25lIHBlci10dXJuIGNvbXB1dGUnKTtcblxuXHRcdFx0XHQvLyAyKSBhbm90aGVyIGVkaXQgYmF0Y2ggKyBvblR1cm5Db21wbGV0ZSBiZWZvcmUgdGhlIGRlYm91bmNlXG5cdFx0XHRcdC8vIGVsYXBzZXMgLT4gdGhlIGRlYm91bmNlIGlzIGNhbmNlbGxlZCBhbmQgdGhlIGZpbmFsIGNvbXB1dGVcblx0XHRcdFx0Ly8gaXMgc2NoZWR1bGVkIGRpcmVjdGx5IGJ5IG9uVHVybkNvbXBsZXRlIChvbmUgYWRkaXRpb25hbCBjYWxsKS5cblx0XHRcdFx0c3ZjLm9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMV8wMDApO1xuXHRcdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ZjLnR1cm5Db21wdXRlQ2FsbHMubGVuZ3RoLCAyLCAnb25UdXJuQ29tcGxldGUgY2FuY2VscyBwZW5kaW5nIGRlYm91bmNlIGFuZCBydW5zIGV4YWN0bHkgb25lIGZpbmFsIGNvbXB1dGUnKTtcblxuXHRcdFx0XHQvLyAzKSBjbGVhcmluZyB0aGUgc3Vic2NyaXB0aW9uIG1pZC1zdHJlYW0gc2lsZW5jZXMgZnV0dXJlXG5cdFx0XHRcdC8vIHBlci10dXJuIGNvbXB1dGVzIGV2ZW4gaWYgbW9yZSBlZGl0cyBhcnJpdmUuXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0XHRcdFx0c3ZjLm9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNl8wMDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ZjLnR1cm5Db21wdXRlQ2FsbHMubGVuZ3RoLCAyLCAndW5zdWJzY3JpYmVkIHR1cm4gbXVzdCBub3QgZ2V0IGFueSBmdXJ0aGVyIHBlci10dXJuIGNvbXB1dGVzJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Blci10dXJuIFVSSSBzdHJlYW1zIGEgQ2hhbmdlc2V0Q29udGVudENoYW5nZWQgc25hcHNob3QgYXMgdGhlIHNhbWUgdHVybiBpcyByZWNvbXB1dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRW5kLXRvLWVuZCB2YXJpYW50IGV4ZXJjaXNpbmcgdGhlIHJlYWwgYGNvbXB1dGVUdXJuRGlmZnNgIHBhdGhcblx0XHRcdC8vIFx1MjAxNCBwcm9kdWNlcyBhY3R1YWwgZGlmZiBwYXlsb2FkcyBmcm9tIHNlc3Npb24tREIgbWVzc2FnZXMgc29cblx0XHRcdC8vIGBfcHVibGlzaENoYW5nZXNldERpZmZzYCBlbWl0cyBhIGZ1bGwgY29udGVudCBzbmFwc2hvdCBvbiBlYWNoXG5cdFx0XHQvLyByZWNvbXB1dGUgcGFzcy5cblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYiksXG5cdFx0XHRcdGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRcdE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxTdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZShidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJykpLFxuXHRcdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0KSk7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0XHRjb25zdCB0dXJuVXJpID0gYCR7c2Vzc2lvblVyaS50b1N0cmluZygpfS9jaGFuZ2VzZXQvdHVybi90dXJuLTFgO1xuXG5cdFx0XHQvLyBGaXJzdCBjb21wdXRlIHBhc3MgXHUyMDE0IG5vIGVkaXRzIHlldCwgc28ganVzdCBlc3RhYmxpc2hlcyB0aGVcblx0XHRcdC8vIHBlci10dXJuIHN0YXRlIGF0IHN0YXR1czogcmVhZHkgd2l0aCBhbiBlbXB0eSBmaWxlIGxpc3QuXG5cdFx0XHRhd2FpdCBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRjb25zdCBzdGF0dXNSZWFkeSA9IGVudmVsb3Blc1xuXHRcdFx0XHQuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCAmJiBlLmNoYW5uZWwgPT09IHR1cm5VcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXR1c1JlYWR5LCAnZmlyc3QgcGVyLXR1cm4gY29tcHV0ZSBtdXN0IHRyYW5zaXRpb24gdGhlIFVSSSB0byByZWFkeScpO1xuXG5cdFx0XHQvLyBTdWJzZXF1ZW50IHJlY29tcHV0ZXMgYXJlIG9ic2VydmFibGUgdmlhIGBfcHVibGlzaENoYW5nZXNldERpZmZzYFxuXHRcdFx0Ly8gZXZlbiB3aXRoIGVtcHR5IGRpZmZzIFx1MjAxNCB0aGUgZGVsdGEgZGlmZmluZyBpcyB3aGF0IG1hdHRlcnMgaGVyZS5cblx0XHRcdC8vIFNtb2tlLWNoZWNrIHRoYXQgY2FsbGluZyBgb25UdXJuQ29tcGxldGVgIHRyaWdnZXJzIGFub3RoZXJcblx0XHRcdC8vIGBjb21wdXRlVHVybkNoYW5nZXNldGAgaW52b2NhdGlvbiB0aHJvdWdoIHRoZSBzZXF1ZW5jZXIuXG5cdFx0XHRlbnZlbG9wZXMubGVuZ3RoID0gMDtcblx0XHRcdHN2Yy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0dXJuLTEnKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwICYmICFlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCAmJiBlLmNoYW5uZWwgPT09IGAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3Nlc3Npb25gKTsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMik7XG5cdFx0XHR9XG5cdFx0XHQvLyBQZXItdHVybiByZWNvbXB1dGUgd2FzIHNjaGVkdWxlZCBcdTIwMTQgYXQgbWluaW11bSBpdHMgcHJlc2VuY2UgaXNcblx0XHRcdC8vIHByb3ZlbiBieSB0aGUgc3RhdGljLXNlc3Npb24gcmVjb21wdXRlIGFsc28gaGF2aW5nIHJ1biAoYm90aFxuXHRcdFx0Ly8gc2hhcmUgdGhlIHNhbWUgYG9uVHVybkNvbXBsZXRlYCBkaXNwYXRjaCBwYXRoKS5cblx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0ZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQpLFxuXHRcdFx0XHQnb25UdXJuQ29tcGxldGUgbXVzdCBkcml2ZSBhdCBsZWFzdCBvbmUgZG93bnN0cmVhbSBjaGFuZ2VzZXQgc3RhdHVzIHRyYW5zaXRpb24nLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBtYWtlQ2hlY2twb2ludFNlcnZpY2UocGFpcnM6IFJlY29yZDxzdHJpbmcsIHsgcGFyZW50OiBzdHJpbmc7IGN1cnJlbnQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiwgYmFzZWxpbmVSZWY/OiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLk5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRnZXRUdXJuQ2hlY2twb2ludFBhaXI6IGFzeW5jIChfc2Vzc2lvbjogVVJJLCB0dXJuSWQ6IHN0cmluZykgPT4gcGFpcnNbdHVybklkXSxcblx0XHRcdFx0Z2V0QmFzZWxpbmVDaGVja3BvaW50UmVmOiBhc3luYyAoKSA9PiBiYXNlbGluZVJlZixcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncHVibGlzaGVzIGRpZmZzIGFzIFJlYWR5IHdoZW4gYm90aCBjaGVja3BvaW50cyByZXNvbHZlIGFuZCBnaXQgcmV0dXJucyBkaWZmcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Y29uc3QgZXhwZWN0ZWREaWZmcyA9IFtcblx0XHRcdFx0eyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiA0LCByZW1vdmVkOiAxIH0gfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBjYWxsczogQXJyYXk8eyBmcm9tUmVmOiBzdHJpbmc7IHRvUmVmOiBzdHJpbmcgfT4gPSBbXTtcblx0XHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyAoX3dkLCBvcHRzKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goeyBmcm9tUmVmOiBvcHRzLmZyb21SZWYsIHRvUmVmOiBvcHRzLnRvUmVmIH0pO1xuXHRcdFx0XHRyZXR1cm4gZXhwZWN0ZWREaWZmcztcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpKSxcblx0XHRcdFx0Z2l0U2VydmljZSxcblx0XHRcdFx0bWFrZUNoZWNrcG9pbnRTZXJ2aWNlKHtcblx0XHRcdFx0XHQnb3JpZyc6IHsgcGFyZW50OiAncmVmLW9yaWctcGFyZW50JywgY3VycmVudDogJ3JlZi1vcmlnJyB9LFxuXHRcdFx0XHRcdCdtb2QnOiB7IHBhcmVudDogJ3JlZi1vcmlnJywgY3VycmVudDogJ3JlZi1tb2QnIH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLFxuXHRcdFx0XHRjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBjb21wYXJlVXJpID0gYXdhaXQgc3ZjLmNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ29yaWcnLCAnbW9kJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wYXJlVXJpLCBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvY29tcGFyZS9vcmlnL21vZGApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgZnJvbVJlZjogJ3JlZi1vcmlnJywgdG9SZWY6ICdyZWYtbW9kJyB9XSk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjb21wYXJlVXJpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Q/LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmc7IGZpbGVzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdGF0dXM6IHN0YXRlPy5zdGF0dXMsIGlkczogc3RhdGU/LmZpbGVzLm1hcChmID0+IGYuaWQpIH0sIHtcblx0XHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0XHRpZHM6IFsnZmlsZTovLy93ZC9hLnRzJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYW5zaXRpb25zIHRvIEVycm9yIHdoZW4gZWl0aGVyIGNoZWNrcG9pbnQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgZ2l0Q2FsbHMgPSAwO1xuXHRcdFx0Z2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyAoKSA9PiB7IGdpdENhbGxzKys7IHJldHVybiB1bmRlZmluZWQ7IH07XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpKSxcblx0XHRcdFx0Z2l0U2VydmljZSxcblx0XHRcdFx0bWFrZUNoZWNrcG9pbnRTZXJ2aWNlKHtcblx0XHRcdFx0XHQnb3JpZyc6IHsgcGFyZW50OiAncmVmLW9yaWctcGFyZW50JywgY3VycmVudDogJ3JlZi1vcmlnJyB9LFxuXHRcdFx0XHRcdC8vICdtb2QnIGlzIGludGVudGlvbmFsbHkgYWJzZW50XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLFxuXHRcdFx0XHRjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBjb21wYXJlVXJpID0gYXdhaXQgc3ZjLmNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ29yaWcnLCAnbW9kJyk7XG5cblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGNvbXBhcmVVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGU/LmVycm9yPy5tZXNzYWdlLmluY2x1ZGVzKCdtb2RpZmllZCB0dXJuJyksIGBleHBlY3RlZCBlcnJvciB0byBuYW1lIHRoZSBtaXNzaW5nIHNpZGUsIGdvdCAke3N0YXRlPy5lcnJvcj8ubWVzc2FnZX1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRDYWxscywgMCwgJ2dpdCBtdXN0IG5vdCBiZSBpbnZva2VkIHdoZW4gYSBjaGVja3BvaW50IGlzIG1pc3NpbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgUmVhZHkgc25hcHNob3Qgd2hlbiBib3RoIGNoZWNrcG9pbnRzIHBvaW50IGF0IHRoZSBzYW1lIHJlZicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgZ2l0Q2FsbHMgPSAwO1xuXHRcdFx0Z2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyAoKSA9PiB7IGdpdENhbGxzKys7IHJldHVybiB1bmRlZmluZWQ7IH07XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpKSxcblx0XHRcdFx0Z2l0U2VydmljZSxcblx0XHRcdFx0bWFrZUNoZWNrcG9pbnRTZXJ2aWNlKHtcblx0XHRcdFx0XHQnb3JpZyc6IHsgcGFyZW50OiAncDEnLCBjdXJyZW50OiAnc2FtZS1yZWYnIH0sXG5cdFx0XHRcdFx0J21vZCc6IHsgcGFyZW50OiAnc2FtZS1yZWYnLCBjdXJyZW50OiAnc2FtZS1yZWYnIH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLFxuXHRcdFx0XHRjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBjb21wYXJlVXJpID0gYXdhaXQgc3ZjLmNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ29yaWcnLCAnbW9kJyk7XG5cblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGNvbXBhcmVVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZmlsZXM6IEFycmF5PHVua25vd24+IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhdHVzOiBzdGF0ZT8uc3RhdHVzLCBmaWxlczogc3RhdGU/LmZpbGVzIH0sIHsgc3RhdHVzOiAncmVhZHknLCBmaWxlczogW10gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0Q2FsbHMsIDAsICdnaXQgZGlmZiBtdXN0IGJlIHNob3J0LWNpcmN1aXRlZCB3aGVuIGJvdGggcmVmcyBtYXRjaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhbnNpdGlvbnMgdG8gRXJyb3Igd2hlbiB0aGUgZ2l0IGRpZmYgcmV0dXJucyB1bmRlZmluZWQgKGdpdCBmYWlsdXJlLCBub3QgZW1wdHkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93ZCcpO1xuXG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdFNlcnZpY2UuY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzID0gYXN5bmMgKCkgPT4gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UobmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKSksXG5cdFx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0XHRcdG1ha2VDaGVja3BvaW50U2VydmljZSh7XG5cdFx0XHRcdFx0J29yaWcnOiB7IHBhcmVudDogJ3AnLCBjdXJyZW50OiAncmVmLW9yaWcnIH0sXG5cdFx0XHRcdFx0J21vZCc6IHsgcGFyZW50OiAncmVmLW9yaWcnLCBjdXJyZW50OiAncmVmLW1vZCcgfSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZSgpLFxuXHRcdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGNvbXBhcmVVcmkgPSBhd2FpdCBzdmMuY29tcHV0ZUNvbXBhcmVUdXJuc0NoYW5nZXNldChzZXNzaW9uU3RyLCAnb3JpZycsICdtb2QnKTtcblxuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoY29tcGFyZVVyaSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBlcnJvcj86IHsgbWVzc2FnZTogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8uc3RhdHVzLCAnZXJyb3InKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZT8uZXJyb3I/Lm1lc3NhZ2UuaW5jbHVkZXMoJ2dpdCcpLCBgZXhwZWN0ZWQgZ2l0LWZhaWx1cmUgZXJyb3IgbWVzc2FnZSwgZ290ICR7c3RhdGU/LmVycm9yPy5tZXNzYWdlfWApO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixvQkFBb0I7QUFFOUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUIsOEJBQThCLDBCQUEwQix1QkFBdUIsb0NBQW9DO0FBQ3JKLFNBQXlCLGtCQUFrQjtBQUMzQyxTQUFTLGlCQUFpQixlQUFlLDJCQUEyQztBQUNwRixTQUFTLGlDQUFpQztBQUcxQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLDZCQUE2QjtBQUN0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
