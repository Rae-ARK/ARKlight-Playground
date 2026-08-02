import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agentService.js";
import { buildDefaultChangesetCatalog, buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind, parseChangesetUri } from "../../common/changesetUri.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildSubagentSessionUri, SessionStatus } from "../../common/state/sessionState.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostChangesetCoordinator } from "../../node/agentHostChangesetCoordinator.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { IAgentHostChangesetOperationService } from "../../common/agentHostChangesetOperationService.js";
import { IAgentHostFileMonitorService } from "../../node/agentHostFileMonitorService.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { IAgentHostGitStateService } from "../../common/agentHostGitStateService.js";
import { AgentHostStateManager, IAgentHostStateManager } from "../../node/agentHostStateManager.js";
import { createNoopGitService } from "../common/sessionTestHelpers.js";
import { IAgentHostChangesetSubscriptionService } from "../../common/agentHostChangesetSubscriptionService.js";
import { AgentHostChangesetSubscriptionService } from "../../node/agentHostChangesetSubscriptionService.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
suite("ChangesetSessionCoordinator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(stateManager, session, workingDirectory, emitNotification = true) {
    stateManager.createSession({
      resource: session,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" },
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    }, { emitNotification });
    stateManager.setSessionChangesets(session, buildDefaultChangesetCatalog(session));
    stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
  }
  function createEnvironment(root = URI.file("/repo")) {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const logService = new NullLogService();
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const subscriptions = new AgentHostChangesetSubscriptionService();
    const changesets = new TestChangesetService(subscriptions);
    const monitor = disposables.add(new TestFileMonitorService());
    const gitService = createGitService(root);
    const gitStateService = disposables.add(new TestGitStateService());
    const operationContributionService = {
      _serviceBrand: void 0,
      registerContribution: () => Disposable.None,
      getOperations: () => [],
      updateOperations: () => {
      },
      invokeChangesetOperation: async () => ({}),
      dispose: () => {
      }
    };
    const instantiationService = disposables.add(new InstantiationService(
      new ServiceCollection(
        [ILogService, logService],
        [IAgentHostStateManager, stateManager],
        [IAgentConfigurationService, configurationService],
        [IAgentHostChangesetOperationService, operationContributionService],
        [IAgentHostChangesetService, changesets],
        [IAgentHostChangesetSubscriptionService, subscriptions],
        [IAgentHostFileMonitorService, monitor],
        [IAgentHostGitService, gitService],
        [IAgentHostGitStateService, gitStateService]
      ),
      /*strict*/
      true
    ));
    const coordinator = disposables.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
    return { stateManager, changesets, subscriptions, monitor, gitService, gitStateService, coordinator };
  }
  test("shares root watchers across sessions and fans out root changes to static refreshes", async () => {
    const firstSession = AgentSession.uri("mock", "session-1").toString();
    const secondSession = AgentSession.uri("mock", "session-2").toString();
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, firstSession, "file:///repo/worktree-a");
    createSession(environment.stateManager, secondSession, "file:///repo/worktree-b");
    environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({
      acquisitions: environment.monitor.acquisitions,
      branchRefreshes: environment.changesets.branchRefreshes,
      uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
      gitStateRefreshes: environment.gitStateService.refreshed
    }, {
      acquisitions: ["file:///repo"],
      branchRefreshes: [firstSession],
      uncommittedRefreshes: [secondSession],
      gitStateRefreshes: [firstSession, secondSession]
    });
  });
  test("releases a root watcher after the last interested session unsubscribes", async () => {
    const firstSession = AgentSession.uri("mock", "session-1").toString();
    const secondSession = AgentSession.uri("mock", "session-2").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, firstSession, "file:///repo/worktree-a");
    createSession(environment.stateManager, secondSession, "file:///repo/worktree-b");
    environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.coordinator.onLastSubscriber(URI.parse(firstSession));
    assert.deepStrictEqual(environment.monitor.disposals, []);
    environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
    assert.deepStrictEqual(environment.monitor.disposals, ["file:///repo"]);
  });
  test("attaches deferred watch interest on materialization without re-querying an unchanged root", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, void 0, false);
    environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, rootLookups: environment.gitService.rootLookupCalls }, { acquisitions: [], rootLookups: [] });
    const summary = environment.stateManager.getSessionSummary(session);
    environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectories: ["file:///repo/worktree"] });
    environment.coordinator.onSessionMaterialized(session);
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionMaterialized(session);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, rootLookups: environment.gitService.rootLookupCalls }, {
      acquisitions: ["file:///repo"],
      rootLookups: ["file:///repo/worktree"]
    });
  });
  test("forwards session changeset refresh to the changeset service and drains pending work on materialization", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, void 0, false);
    environment.coordinator.onFirstSubscriber(URI.parse(buildSessionChangesetUri(session)));
    await tick();
    const summary = environment.stateManager.getSessionSummary(session);
    environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectories: ["file:///repo/worktree"] });
    environment.coordinator.onSessionMaterialized(session);
    await tick();
    assert.deepStrictEqual({
      sessionRefreshes: environment.changesets.sessionRefreshes,
      workingDirectoryAvailable: environment.changesets.workingDirectoryAvailable
    }, {
      sessionRefreshes: [session],
      workingDirectoryAvailable: [session]
    });
  });
  test("exposes subscriptions and drops them when the last subscriber leaves", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    const changeset = buildSessionChangesetUri(session);
    createSession(environment.stateManager, session, void 0, false);
    environment.coordinator.onFirstSubscriber(URI.parse(changeset));
    const subscribed = [...environment.subscriptions.getSessionSubscriptions(session)];
    environment.coordinator.onLastSubscriber(URI.parse(changeset));
    const afterUnsubscribe = [...environment.subscriptions.getSessionSubscriptions(session)];
    assert.deepStrictEqual({ subscribed, afterUnsubscribe }, {
      subscribed: [changeset],
      afterUnsubscribe: []
    });
  });
  test("does not attach root state when watcher acquisition fails", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.monitor.failAcquire = true;
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.gitService.waitForRootLookups(1);
    await tick();
    environment.monitor.fire(URI.file("/repo"));
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, refreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo"],
      refreshes: []
    });
  });
  test("active turn suspends and resumes root watcher when interest remains", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionTurnActiveChanged(session, true);
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(session, false);
    await environment.monitor.waitForAcquisitions(2);
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo", "file:///repo"],
      disposals: ["file:///repo"],
      refreshes: []
    });
  });
  test("active session sharing a root suspends watcher for other subscribed sessions", async () => {
    const firstSession = AgentSession.uri("mock", "session-1").toString();
    const secondSession = AgentSession.uri("mock", "session-2").toString();
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, firstSession, "file:///repo/worktree-a");
    createSession(environment.stateManager, secondSession, "file:///repo/worktree-b");
    environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onFirstSubscriber(URI.parse(secondSession));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(secondSession, true);
    await environment.gitService.waitForRootLookups(3);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(secondSession, false);
    await environment.monitor.waitForAcquisitions(2);
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, uncommittedRefreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo", "file:///repo"],
      disposals: ["file:///repo"],
      uncommittedRefreshes: []
    });
  });
  test("active subagent maps to parent root and suspends watcher until subagent completes", async () => {
    const parentSession = AgentSession.uri("mock", "session-1").toString();
    const subagentSession = buildSubagentSessionUri(parentSession, "tool-1");
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, parentSession, "file:///repo/worktree");
    createSession(environment.stateManager, subagentSession, void 0);
    environment.coordinator.onFirstSubscriber(URI.parse(parentSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionTurnActiveChanged(subagentSession, true);
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(subagentSession, false);
    await environment.monitor.waitForAcquisitions(2);
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo", "file:///repo"],
      disposals: ["file:///repo"],
      refreshes: []
    });
  });
  test("turn ending after unsubscribe or dispose does not reattach watcher", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionTurnActiveChanged(session, true);
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.coordinator.onLastSubscriber(URI.parse(session));
    environment.coordinator.onSessionDisposed(session);
    environment.coordinator.onSessionTurnActiveChanged(session, false);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals }, {
      acquisitions: ["file:///repo"],
      disposals: ["file:///repo"]
    });
  });
});
function createGitService(root) {
  const rootLookupCalls = [];
  const waiters = [];
  const releaseWaiters = () => {
    for (const waiter of [...waiters]) {
      if (rootLookupCalls.length >= waiter.count) {
        waiters.splice(waiters.indexOf(waiter), 1);
        void waiter.deferred.complete(void 0);
      }
    }
  };
  return {
    ...createNoopGitService(),
    rootLookupCalls,
    async getRepositoryRoot(workingDirectory) {
      rootLookupCalls.push(workingDirectory.toString());
      releaseWaiters();
      return root;
    },
    waitForRootLookups(count) {
      if (rootLookupCalls.length >= count) {
        return Promise.resolve();
      }
      const deferred = new DeferredPromise();
      waiters.push({ count, deferred });
      return deferred.p;
    }
  };
}
class TestGitStateService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidRefreshSessionGitState = this._register(new Emitter());
    this.onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;
    this.refreshed = [];
  }
  async refreshSessionGitState(sessionKey, _workingDirectory) {
    this.refreshed.push(sessionKey);
    this._onDidRefreshSessionGitState.fire(sessionKey);
  }
  async setSessionGitHubState(_sessionKey, _state) {
  }
  async attachSessionGitHubPullRequest(_sessionKey) {
  }
  async attachSessionGitHubIssues(_sessionKey, _text) {
  }
}
class TestFileMonitorService extends Disposable {
  constructor() {
    super(...arguments);
    this.acquisitions = [];
    this.disposals = [];
    this.failAcquire = false;
    this._callbacks = /* @__PURE__ */ new Map();
    this._acquisitionWaiters = [];
  }
  acquire(folder, callback, _options) {
    const root = folder.toString();
    this.acquisitions.push(root);
    if (this.failAcquire) {
      this._releaseAcquisitionWaiters();
      return void 0;
    }
    let callbacks = this._callbacks.get(root);
    if (!callbacks) {
      callbacks = /* @__PURE__ */ new Set();
      this._callbacks.set(root, callbacks);
    }
    callbacks.add(callback);
    this._releaseAcquisitionWaiters();
    return toDisposable(() => {
      callbacks.delete(callback);
      this.disposals.push(root);
    });
  }
  fire(root) {
    for (const callback of this._callbacks.get(root.toString()) ?? []) {
      callback();
    }
  }
  waitForAcquisitions(count) {
    if (this.acquisitions.length >= count) {
      return Promise.resolve();
    }
    const deferred = new DeferredPromise();
    this._acquisitionWaiters.push({ count, deferred });
    return deferred.p;
  }
  _releaseAcquisitionWaiters() {
    for (const waiter of [...this._acquisitionWaiters]) {
      if (this.acquisitions.length >= waiter.count) {
        this._acquisitionWaiters.splice(this._acquisitionWaiters.indexOf(waiter), 1);
        void waiter.deferred.complete(void 0);
      }
    }
  }
}
class TestChangesetService {
  constructor(_subscriptions) {
    this._subscriptions = _subscriptions;
    this.branchRefreshes = [];
    this.uncommittedRefreshes = [];
    this.sessionRefreshes = [];
    this.workingDirectoryAvailable = [];
    this.recomputed = [];
    this.disposed = [];
  }
  registerStaticChangesets(_session) {
  }
  restoreStaticChangeset(_session, _kind, _diffs) {
  }
  parsePersistedStaticChangesets(_sessionUri, _metadata) {
    return {};
  }
  applyPersistedStaticChangesets(_sessionUri, _diffs) {
  }
  restorePersistedStaticChangesets(_sessionUri, _metadata) {
    return {};
  }
  persistChangesSummary(_sessionUri, _summary) {
  }
  isStaticChangesetComputeActive(_changesetUri) {
    return false;
  }
  refreshChangesetCatalog(_session) {
  }
  refreshBranchChangeset(session) {
    this.branchRefreshes.push(session);
  }
  refreshSessionChangeset(session) {
    this.sessionRefreshes.push(session);
  }
  onWorkingDirectoryAvailable(session) {
    this.workingDirectoryAvailable.push(session);
  }
  recomputeSubscribedChangesets(session) {
    this.recomputed.push(session);
    for (const changeset of this._subscriptions.getSessionSubscriptions(session)) {
      const parsed = parseChangesetUri(changeset);
      switch (parsed?.kind) {
        case ChangesetKind.Branch:
          this.refreshBranchChangeset(session);
          break;
        case ChangesetKind.Session:
          this.refreshSessionChangeset(session);
          break;
        case ChangesetKind.Uncommitted:
          void this.computeUncommittedChangeset(session);
          break;
        default:
          if (changeset === session) {
            this.refreshBranchChangeset(session);
            this.refreshSessionChangeset(session);
          }
          break;
      }
    }
  }
  onSessionDisposed(session) {
    this.disposed.push(session);
  }
  async computeUncommittedChangeset(session) {
    if (this._subscriptions.getSessionSubscriptions(session).has(URI.parse(buildUncommittedChangesetUri(session)).toString())) {
      this.uncommittedRefreshes.push(session);
    }
    return `${session}/changeset/uncommitted`;
  }
  async computeTurnChangeset(session, turnId) {
    return `${session}/changeset/turn/${turnId}`;
  }
  async computeCompareTurnsChangeset(session, originalTurnId, modifiedTurnId) {
    return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`;
  }
  onToolCallEditsApplied(_session, _turnId) {
  }
  onTurnComplete(_session, _turnId) {
  }
  onSessionTruncated(_session) {
  }
  clearRefreshes() {
    this.branchRefreshes.length = 0;
    this.uncommittedRefreshes.length = 0;
    this.sessionRefreshes.length = 0;
    this.recomputed.length = 0;
  }
  getListMetadataKeys(_sessionStr) {
    return void 0;
  }
  computeListEntryChanges(_sessionUri, _metadata) {
    return void 0;
  }
}
function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0Q2hhbmdlc2V0Q29vcmRpbmF0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZywgYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpLCBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpLCBDaGFuZ2VzZXRLaW5kLCBwYXJzZUNoYW5nZXNldFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSwgU2Vzc2lvblN0YXR1cywgdHlwZSBJU2Vzc2lvbkZpbGVEaWZmLCB0eXBlIElTZXNzaW9uR2l0SHViU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgSVBlcnNpc3RlZENoYW5nZXNldE1ldGFkYXRhLCBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcywgU3RhdGljQ2hhbmdlc2V0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbGVNb25pdG9yT3B0aW9ucywgSUFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm9vcEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuXG5zdWl0ZSgnQ2hhbmdlc2V0U2Vzc2lvbkNvb3JkaW5hdG9yJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgc2Vzc2lvbjogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nLCBlbWl0Tm90aWZpY2F0aW9uID0gdHJ1ZSk6IHZvaWQge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uLFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdH0sIHsgZW1pdE5vdGlmaWNhdGlvbiB9KTtcblx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvbiwgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudChyb290OiBVUkkgPSBVUkkuZmlsZSgnL3JlcG8nKSk6IHtcblx0XHRzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcjtcblx0XHRjaGFuZ2VzZXRzOiBUZXN0Q2hhbmdlc2V0U2VydmljZTtcblx0XHRzdWJzY3JpcHRpb25zOiBJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZTtcblx0XHRtb25pdG9yOiBUZXN0RmlsZU1vbml0b3JTZXJ2aWNlO1xuXHRcdGdpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlICYgeyByZWFkb25seSByb290TG9va3VwQ2FsbHM6IHN0cmluZ1tdOyB3YWl0Rm9yUm9vdExvb2t1cHMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4gfTtcblx0XHRnaXRTdGF0ZVNlcnZpY2U6IFRlc3RHaXRTdGF0ZVNlcnZpY2U7XG5cdFx0Y29vcmRpbmF0b3I6IEFnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yO1xuXHR9IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb25zID0gbmV3IEFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IFRlc3RDaGFuZ2VzZXRTZXJ2aWNlKHN1YnNjcmlwdGlvbnMpO1xuXHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlTW9uaXRvclNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZUdpdFNlcnZpY2Uocm9vdCk7XG5cdFx0Y29uc3QgZ2l0U3RhdGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0R2l0U3RhdGVTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IG9wZXJhdGlvbkNvbnRyaWJ1dGlvblNlcnZpY2U6IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb246ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdGdldE9wZXJhdGlvbnM6ICgpID0+IFtdLFxuXHRcdFx0dXBkYXRlT3BlcmF0aW9uczogKCkgPT4geyB9LFxuXHRcdFx0aW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uOiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgc3RhdGVNYW5hZ2VyXSxcblx0XHRcdFtJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLCBvcGVyYXRpb25Db250cmlidXRpb25TZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgY2hhbmdlc2V0c10sXG5cdFx0XHRbSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UsIHN1YnNjcmlwdGlvbnNdLFxuXHRcdFx0W0lBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UsIG1vbml0b3JdLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRTZXJ2aWNlLCBnaXRTZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlLCBnaXRTdGF0ZVNlcnZpY2VdLFxuXHRcdCksIC8qc3RyaWN0Ki8gdHJ1ZSkpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdG9yID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yKSk7XG5cdFx0cmV0dXJuIHsgc3RhdGVNYW5hZ2VyLCBjaGFuZ2VzZXRzLCBzdWJzY3JpcHRpb25zLCBtb25pdG9yLCBnaXRTZXJ2aWNlLCBnaXRTdGF0ZVNlcnZpY2UsIGNvb3JkaW5hdG9yIH07XG5cdH1cblxuXHR0ZXN0KCdzaGFyZXMgcm9vdCB3YXRjaGVycyBhY3Jvc3Mgc2Vzc2lvbnMgYW5kIGZhbnMgb3V0IHJvb3QgY2hhbmdlcyB0byBzdGF0aWMgcmVmcmVzaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHJvb3QpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBmaXJzdFNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUtYScpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZWNvbmRTZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlLWInKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShmaXJzdFNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMSk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vjb25kU2Vzc2lvbikpKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3VwcygyKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0ZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5jbGVhclJlZnJlc2hlcygpO1xuXG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHJvb3QpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWNxdWlzaXRpb25zOiBlbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9ucyxcblx0XHRcdGJyYW5jaFJlZnJlc2hlczogZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5icmFuY2hSZWZyZXNoZXMsXG5cdFx0XHR1bmNvbW1pdHRlZFJlZnJlc2hlczogZW52aXJvbm1lbnQuY2hhbmdlc2V0cy51bmNvbW1pdHRlZFJlZnJlc2hlcyxcblx0XHRcdGdpdFN0YXRlUmVmcmVzaGVzOiBlbnZpcm9ubWVudC5naXRTdGF0ZVNlcnZpY2UucmVmcmVzaGVkLFxuXHRcdH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHRcdGJyYW5jaFJlZnJlc2hlczogW2ZpcnN0U2Vzc2lvbl0sXG5cdFx0XHR1bmNvbW1pdHRlZFJlZnJlc2hlczogW3NlY29uZFNlc3Npb25dLFxuXHRcdFx0Z2l0U3RhdGVSZWZyZXNoZXM6IFtmaXJzdFNlc3Npb24sIHNlY29uZFNlc3Npb25dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxlYXNlcyBhIHJvb3Qgd2F0Y2hlciBhZnRlciB0aGUgbGFzdCBpbnRlcmVzdGVkIHNlc3Npb24gdW5zdWJzY3JpYmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQoKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgZmlyc3RTZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlLWEnKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vjb25kU2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZS1iJyk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2UoZmlyc3RTZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlY29uZFNlc3Npb24pKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMik7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25MYXN0U3Vic2NyaWJlcihVUkkucGFyc2UoZmlyc3RTZXNzaW9uKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2FscywgW10pO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uTGFzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vjb25kU2Vzc2lvbikpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudmlyb25tZW50Lm1vbml0b3IuZGlzcG9zYWxzLCBbJ2ZpbGU6Ly8vcmVwbyddKTtcblx0fSk7XG5cblx0dGVzdCgnYXR0YWNoZXMgZGVmZXJyZWQgd2F0Y2ggaW50ZXJlc3Qgb24gbWF0ZXJpYWxpemF0aW9uIHdpdGhvdXQgcmUtcXVlcnlpbmcgYW4gdW5jaGFuZ2VkIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbikpKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjcXVpc2l0aW9uczogZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsIHJvb3RMb29rdXBzOiBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLnJvb3RMb29rdXBDYWxscyB9LCB7IGFjcXVpc2l0aW9uczogW10sIHJvb3RMb29rdXBzOiBbXSB9KTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbikhO1xuXHRcdGVudmlyb25tZW50LnN0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZChzZXNzaW9uLCB7IC4uLnN1bW1hcnksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG8vd29ya3RyZWUnXSB9KTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25NYXRlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uTWF0ZXJpYWxpemVkKHNlc3Npb24pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3F1aXNpdGlvbnM6IGVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zLCByb290TG9va3VwczogZW52aXJvbm1lbnQuZ2l0U2VydmljZS5yb290TG9va3VwQ2FsbHMgfSwge1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbJ2ZpbGU6Ly8vcmVwbyddLFxuXHRcdFx0cm9vdExvb2t1cHM6IFsnZmlsZTovLy9yZXBvL3dvcmt0cmVlJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHNlc3Npb24gY2hhbmdlc2V0IHJlZnJlc2ggdG8gdGhlIGNoYW5nZXNldCBzZXJ2aWNlIGFuZCBkcmFpbnMgcGVuZGluZyB3b3JrIG9uIG1hdGVyaWFsaXphdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQoKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2UoYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24pKSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGVudmlyb25tZW50LnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uKSE7XG5cdFx0ZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb24sIHsgLi4uc3VtbWFyeSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZSddIH0pO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvbk1hdGVyaWFsaXplZChzZXNzaW9uKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25SZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMuc2Vzc2lvblJlZnJlc2hlcyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGU6IGVudmlyb25tZW50LmNoYW5nZXNldHMud29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uUmVmcmVzaGVzOiBbc2Vzc2lvbl0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlOiBbc2Vzc2lvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cG9zZXMgc3Vic2NyaXB0aW9ucyBhbmQgZHJvcHMgdGhlbSB3aGVuIHRoZSBsYXN0IHN1YnNjcmliZXIgbGVhdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudCgpO1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2UoY2hhbmdlc2V0KSk7XG5cdFx0Y29uc3Qgc3Vic2NyaWJlZCA9IFsuLi5lbnZpcm9ubWVudC5zdWJzY3JpcHRpb25zLmdldFNlc3Npb25TdWJzY3JpcHRpb25zKHNlc3Npb24pXTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uTGFzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGNoYW5nZXNldCkpO1xuXHRcdGNvbnN0IGFmdGVyVW5zdWJzY3JpYmUgPSBbLi4uZW52aXJvbm1lbnQuc3Vic2NyaXB0aW9ucy5nZXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhzZXNzaW9uKV07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3Vic2NyaWJlZCwgYWZ0ZXJVbnN1YnNjcmliZSB9LCB7XG5cdFx0XHRzdWJzY3JpYmVkOiBbY2hhbmdlc2V0XSxcblx0XHRcdGFmdGVyVW5zdWJzY3JpYmU6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhdHRhY2ggcm9vdCBzdGF0ZSB3aGVuIHdhdGNoZXIgYWNxdWlzaXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUnKTtcblxuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmFpbEFjcXVpcmUgPSB0cnVlO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShzZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShVUkkuZmlsZSgnL3JlcG8nKSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjcXVpc2l0aW9uczogZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsIHJlZnJlc2hlczogZW52aXJvbm1lbnQuY2hhbmdlc2V0cy51bmNvbW1pdHRlZFJlZnJlc2hlcyB9LCB7XG5cdFx0XHRhY3F1aXNpdGlvbnM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRyZWZyZXNoZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmUgdHVybiBzdXNwZW5kcyBhbmQgcmVzdW1lcyByb290IHdhdGNoZXIgd2hlbiBpbnRlcmVzdCByZW1haW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQocm9vdCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUnKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShzZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHNlc3Npb24sIHRydWUpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLmNsZWFyUmVmcmVzaGVzKCk7XG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHJvb3QpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHNlc3Npb24sIGZhbHNlKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHJvb3QpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3F1aXNpdGlvbnM6IGVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zLCBkaXNwb3NhbHM6IGVudmlyb25tZW50Lm1vbml0b3IuZGlzcG9zYWxzLCByZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMudW5jb21taXR0ZWRSZWZyZXNoZXMgfSwge1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbJ2ZpbGU6Ly8vcmVwbycsICdmaWxlOi8vL3JlcG8nXSxcblx0XHRcdGRpc3Bvc2FsczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHRcdHJlZnJlc2hlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZSBzZXNzaW9uIHNoYXJpbmcgYSByb290IHN1c3BlbmRzIHdhdGNoZXIgZm9yIG90aGVyIHN1YnNjcmliZWQgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQocm9vdCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIGZpcnN0U2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZS1hJyk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlY29uZFNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUtYicpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGZpcnN0U2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vjb25kU2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzZWNvbmRTZXNzaW9uLCB0cnVlKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3VwcygzKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0ZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5jbGVhclJlZnJlc2hlcygpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShyb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzZWNvbmRTZXNzaW9uLCBmYWxzZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDIpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShyb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWNxdWlzaXRpb25zOiBlbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9ucywgZGlzcG9zYWxzOiBlbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2FscywgdW5jb21taXR0ZWRSZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMudW5jb21taXR0ZWRSZWZyZXNoZXMgfSwge1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbJ2ZpbGU6Ly8vcmVwbycsICdmaWxlOi8vL3JlcG8nXSxcblx0XHRcdGRpc3Bvc2FsczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHRcdHVuY29tbWl0dGVkUmVmcmVzaGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlIHN1YmFnZW50IG1hcHMgdG8gcGFyZW50IHJvb3QgYW5kIHN1c3BlbmRzIHdhdGNoZXIgdW50aWwgc3ViYWdlbnQgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRTZXNzaW9uID0gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50U2Vzc2lvbiwgJ3Rvb2wtMScpO1xuXHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHJvb3QpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBwYXJlbnRTZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlJyk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHN1YmFnZW50U2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShwYXJlbnRTZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHN1YmFnZW50U2Vzc2lvbiwgdHJ1ZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMik7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGVudmlyb25tZW50LmNoYW5nZXNldHMuY2xlYXJSZWZyZXNoZXMoKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUocm9vdCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc3ViYWdlbnRTZXNzaW9uLCBmYWxzZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDIpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShyb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWNxdWlzaXRpb25zOiBlbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9ucywgZGlzcG9zYWxzOiBlbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2FscywgcmVmcmVzaGVzOiBlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnVuY29tbWl0dGVkUmVmcmVzaGVzIH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nLCAnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRkaXNwb3NhbHM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRyZWZyZXNoZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuIGVuZGluZyBhZnRlciB1bnN1YnNjcmliZSBvciBkaXNwb3NlIGRvZXMgbm90IHJlYXR0YWNoIHdhdGNoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUnKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShzZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHNlc3Npb24sIHRydWUpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkxhc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShzZXNzaW9uKSk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uRGlzcG9zZWQoc2Vzc2lvbik7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc2Vzc2lvbiwgZmFsc2UpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3F1aXNpdGlvbnM6IGVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zLCBkaXNwb3NhbHM6IGVudmlyb25tZW50Lm1vbml0b3IuZGlzcG9zYWxzIH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHRcdGRpc3Bvc2FsczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gY3JlYXRlR2l0U2VydmljZShyb290OiBVUkkpOiBJQWdlbnRIb3N0R2l0U2VydmljZSAmIHsgcmVhZG9ubHkgcm9vdExvb2t1cENhbGxzOiBzdHJpbmdbXTsgd2FpdEZvclJvb3RMb29rdXBzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IH0ge1xuXHRjb25zdCByb290TG9va3VwQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHdhaXRlcnM6IEFycmF5PHsgY291bnQ6IG51bWJlcjsgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB9PiA9IFtdO1xuXHRjb25zdCByZWxlYXNlV2FpdGVycyA9ICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHdhaXRlciBvZiBbLi4ud2FpdGVyc10pIHtcblx0XHRcdGlmIChyb290TG9va3VwQ2FsbHMubGVuZ3RoID49IHdhaXRlci5jb3VudCkge1xuXHRcdFx0XHR3YWl0ZXJzLnNwbGljZSh3YWl0ZXJzLmluZGV4T2Yod2FpdGVyKSwgMSk7XG5cdFx0XHRcdHZvaWQgd2FpdGVyLmRlZmVycmVkLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0cm9vdExvb2t1cENhbGxzLFxuXHRcdGFzeW5jIGdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0XHRyb290TG9va3VwQ2FsbHMucHVzaCh3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkpO1xuXHRcdFx0cmVsZWFzZVdhaXRlcnMoKTtcblx0XHRcdHJldHVybiByb290O1xuXHRcdH0sXG5cdFx0d2FpdEZvclJvb3RMb29rdXBzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGlmIChyb290TG9va3VwQ2FsbHMubGVuZ3RoID49IGNvdW50KSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0d2FpdGVycy5wdXNoKHsgY291bnQsIGRlZmVycmVkIH0pO1xuXHRcdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdFx0fSxcblx0fTtcbn1cblxuY2xhc3MgVGVzdEdpdFN0YXRlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlID0gdGhpcy5fb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IHJlZnJlc2hlZDogc3RyaW5nW10gPSBbXTtcblxuXHRhc3luYyByZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKHNlc3Npb25LZXk6IHN0cmluZywgX3dvcmtpbmdEaXJlY3Rvcnk/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNaXJyb3IgdGhlIHByb2R1Y3Rpb24gc2VydmljZTogcmVjb3JkIHRoZSByZWZyZXNoIGFuZCBub3RpZnlcblx0XHQvLyBsaXN0ZW5lcnMgc28gdGhlIGNvb3JkaW5hdG9yIHJlY29tcHV0ZXMgdGhlIHN1YnNjcmliZWQgY2hhbmdlc2V0cy5cblx0XHR0aGlzLnJlZnJlc2hlZC5wdXNoKHNlc3Npb25LZXkpO1xuXHRcdHRoaXMuX29uRGlkUmVmcmVzaFNlc3Npb25HaXRTdGF0ZS5maXJlKHNlc3Npb25LZXkpO1xuXHR9XG5cdGFzeW5jIHNldFNlc3Npb25HaXRIdWJTdGF0ZShfc2Vzc2lvbktleTogc3RyaW5nLCBfc3RhdGU6IElTZXNzaW9uR2l0SHViU3RhdGUpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBhdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoX3Nlc3Npb25LZXk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGF0dGFjaFNlc3Npb25HaXRIdWJJc3N1ZXMoX3Nlc3Npb25LZXk6IHN0cmluZywgX3RleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbmNsYXNzIFRlc3RGaWxlTW9uaXRvclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGFjcXVpc2l0aW9uczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgZGlzcG9zYWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRmYWlsQWNxdWlyZSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWxsYmFja3MgPSBuZXcgTWFwPHN0cmluZywgU2V0PCgpID0+IHZvaWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3F1aXNpdGlvbldhaXRlcnM6IEFycmF5PHsgY291bnQ6IG51bWJlcjsgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB9PiA9IFtdO1xuXG5cdGFjcXVpcmUoZm9sZGVyOiBVUkksIGNhbGxiYWNrOiAoKSA9PiB2b2lkLCBfb3B0aW9ucz86IElBZ2VudEhvc3RGaWxlTW9uaXRvck9wdGlvbnMpOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IGZvbGRlci50b1N0cmluZygpO1xuXHRcdHRoaXMuYWNxdWlzaXRpb25zLnB1c2gocm9vdCk7XG5cdFx0aWYgKHRoaXMuZmFpbEFjcXVpcmUpIHtcblx0XHRcdHRoaXMuX3JlbGVhc2VBY3F1aXNpdGlvbldhaXRlcnMoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBjYWxsYmFja3MgPSB0aGlzLl9jYWxsYmFja3MuZ2V0KHJvb3QpO1xuXHRcdGlmICghY2FsbGJhY2tzKSB7XG5cdFx0XHRjYWxsYmFja3MgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5cdFx0XHR0aGlzLl9jYWxsYmFja3Muc2V0KHJvb3QsIGNhbGxiYWNrcyk7XG5cdFx0fVxuXHRcdGNhbGxiYWNrcy5hZGQoY2FsbGJhY2spO1xuXHRcdHRoaXMuX3JlbGVhc2VBY3F1aXNpdGlvbldhaXRlcnMoKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNhbGxiYWNrcy5kZWxldGUoY2FsbGJhY2spO1xuXHRcdFx0dGhpcy5kaXNwb3NhbHMucHVzaChyb290KTtcblx0XHR9KTtcblx0fVxuXG5cdGZpcmUocm9vdDogVVJJKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjYWxsYmFjayBvZiB0aGlzLl9jYWxsYmFja3MuZ2V0KHJvb3QudG9TdHJpbmcoKSkgPz8gW10pIHtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0fVxuXHR9XG5cblx0d2FpdEZvckFjcXVpc2l0aW9ucyhjb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuYWNxdWlzaXRpb25zLmxlbmd0aCA+PSBjb3VudCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHR0aGlzLl9hY3F1aXNpdGlvbldhaXRlcnMucHVzaCh7IGNvdW50LCBkZWZlcnJlZCB9KTtcblx0XHRyZXR1cm4gZGVmZXJyZWQucDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbGVhc2VBY3F1aXNpdGlvbldhaXRlcnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3YWl0ZXIgb2YgWy4uLnRoaXMuX2FjcXVpc2l0aW9uV2FpdGVyc10pIHtcblx0XHRcdGlmICh0aGlzLmFjcXVpc2l0aW9ucy5sZW5ndGggPj0gd2FpdGVyLmNvdW50KSB7XG5cdFx0XHRcdHRoaXMuX2FjcXVpc2l0aW9uV2FpdGVycy5zcGxpY2UodGhpcy5fYWNxdWlzaXRpb25XYWl0ZXJzLmluZGV4T2Yod2FpdGVyKSwgMSk7XG5cdFx0XHRcdHZvaWQgd2FpdGVyLmRlZmVycmVkLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRlc3RDaGFuZ2VzZXRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBicmFuY2hSZWZyZXNoZXM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IHVuY29tbWl0dGVkUmVmcmVzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSBzZXNzaW9uUmVmcmVzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSByZWNvbXB1dGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSBkaXNwb3NlZDogc3RyaW5nW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zdWJzY3JpcHRpb25zOiBJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSkgeyB9XG5cblx0cmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKF9zZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRyZXN0b3JlU3RhdGljQ2hhbmdlc2V0KF9zZXNzaW9uOiBzdHJpbmcsIF9raW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kLCBfZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IHZvaWQgeyB9XG5cdHBhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfbWV0YWRhdGE6IElQZXJzaXN0ZWRDaGFuZ2VzZXRNZXRhZGF0YSk6IElSZXN0b3JlZENoYW5nZXNldERpZmZzIHsgcmV0dXJuIHt9OyB9XG5cdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfZGlmZnM6IElSZXN0b3JlZENoYW5nZXNldERpZmZzKTogdm9pZCB7IH1cblx0cmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX21ldGFkYXRhOiBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEpOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyB7IHJldHVybiB7fTsgfVxuXHRwZXJzaXN0Q2hhbmdlc1N1bW1hcnkoX3Nlc3Npb25Vcmk6IHN0cmluZywgX3N1bW1hcnk6IENoYW5nZXNTdW1tYXJ5KTogdm9pZCB7IH1cblx0aXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKF9jaGFuZ2VzZXRVcmk6IHN0cmluZyk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0cmVmcmVzaENoYW5nZXNldENhdGFsb2coX3Nlc3Npb246IHN0cmluZyk6IHZvaWQgeyB9XG5cdHJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5icmFuY2hSZWZyZXNoZXMucHVzaChzZXNzaW9uKTtcblx0fVxuXHRyZWZyZXNoU2Vzc2lvbkNoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25SZWZyZXNoZXMucHVzaChzZXNzaW9uKTtcblx0fVxuXHRvbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGUoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy53b3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlLnB1c2goc2Vzc2lvbik7XG5cdH1cblx0cmVjb21wdXRlU3Vic2NyaWJlZENoYW5nZXNldHMoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yZWNvbXB1dGVkLnB1c2goc2Vzc2lvbik7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2VzZXQgb2YgdGhpcy5fc3Vic2NyaXB0aW9ucy5nZXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhzZXNzaW9uKSkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGFuZ2VzZXRVcmkoY2hhbmdlc2V0KTtcblx0XHRcdHN3aXRjaCAocGFyc2VkPy5raW5kKSB7XG5cdFx0XHRcdGNhc2UgQ2hhbmdlc2V0S2luZC5CcmFuY2g6XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuU2Vzc2lvbjpcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuVW5jb21taXR0ZWQ6XG5cdFx0XHRcdFx0dm9pZCB0aGlzLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRpZiAoY2hhbmdlc2V0ID09PSBzZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoc2Vzc2lvbik7XG5cdFx0XHRcdFx0XHR0aGlzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0b25TZXNzaW9uRGlzcG9zZWQoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlZC5wdXNoKHNlc3Npb24pO1xuXHR9XG5cdGFzeW5jIGNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9zdWJzY3JpcHRpb25zLmdldFNlc3Npb25TdWJzY3JpcHRpb25zKHNlc3Npb24pLmhhcyhVUkkucGFyc2UoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uKSkudG9TdHJpbmcoKSkpIHtcblx0XHRcdHRoaXMudW5jb21taXR0ZWRSZWZyZXNoZXMucHVzaChzZXNzaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cdH1cblx0YXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiBgJHtzZXNzaW9ufS9jaGFuZ2VzZXQvdHVybi8ke3R1cm5JZH1gOyB9XG5cdGFzeW5jIGNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nLCBvcmlnaW5hbFR1cm5JZDogc3RyaW5nLCBtb2RpZmllZFR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC9jb21wYXJlLyR7b3JpZ2luYWxUdXJuSWR9LyR7bW9kaWZpZWRUdXJuSWR9YDsgfVxuXHRvblRvb2xDYWxsRWRpdHNBcHBsaWVkKF9zZXNzaW9uOiBzdHJpbmcsIF90dXJuSWQ6IHN0cmluZyk6IHZvaWQgeyB9XG5cdG9uVHVybkNvbXBsZXRlKF9zZXNzaW9uOiBzdHJpbmcsIF90dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQgeyB9XG5cdG9uU2Vzc2lvblRydW5jYXRlZChfc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IH1cblxuXHRjbGVhclJlZnJlc2hlcygpOiB2b2lkIHtcblx0XHR0aGlzLmJyYW5jaFJlZnJlc2hlcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMudW5jb21taXR0ZWRSZWZyZXNoZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLnNlc3Npb25SZWZyZXNoZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLnJlY29tcHV0ZWQubGVuZ3RoID0gMDtcblx0fVxuXG5cdGdldExpc3RNZXRhZGF0YUtleXMoX3Nlc3Npb25TdHI6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHRydWU+IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlcyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuZnVuY3Rpb24gdGljaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0SW1tZWRpYXRlKHJlc29sdmUpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNo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
