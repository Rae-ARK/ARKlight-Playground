import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { readSessionGitHubState, readSessionGitState, withSessionGitHubState, withSessionGitState, SessionStatus } from "../../common/state/sessionState.js";
import { META_GIT_STATE, META_GITHUB_STATE } from "../../common/agentHostGitStateService.js";
import { AgentHostGitStateService } from "../../node/agentHostGitStateService.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from "../common/sessionTestHelpers.js";
const SESSION = "mock:/session-1";
const WORKING_DIRECTORY = "file:///wd";
suite("AgentHostGitStateService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(options) {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const db = new TestSessionDatabase();
    const sessionDataService = createSessionDataService(db);
    const gitCalls = [];
    let gitResult;
    let gitError;
    const gitService = {
      ...createNoopGitService(),
      getSessionGitState: async (workingDirectory) => {
        gitCalls.push(workingDirectory.toString());
        if (gitError) {
          throw gitError;
        }
        return gitResult;
      }
    };
    const pullRequestCalls = [];
    const pullRequestsByBranch = /* @__PURE__ */ new Map();
    let onPullRequestLookup;
    const octoKitService = {
      findPullRequestByHeadBranch: async (_owner, _repo, branch) => {
        pullRequestCalls.push(branch);
        await onPullRequestLookup?.(branch);
        return pullRequestsByBranch.get(branch);
      }
    };
    const agentService = { getAuthToken: () => "token" };
    const service = disposables.add(new AgentHostGitStateService(
      stateManager,
      gitService,
      options?.octoKitService ?? octoKitService,
      options?.agentService ?? agentService,
      createTestGitHubEndpointService(),
      new NullLogService(),
      sessionDataService
    ));
    const runEvents = [];
    disposables.add(service.onDidRefreshSessionGitState((key) => runEvents.push(key)));
    return {
      stateManager,
      db,
      service,
      gitCalls,
      runEvents,
      pullRequestCalls,
      setGitResult: (state) => {
        gitResult = state;
      },
      setGitError: (error) => {
        gitError = error;
      },
      setPullRequest: (branch, pullRequest) => {
        pullRequestsByBranch.set(branch, pullRequest);
      },
      setOnPullRequestLookup: (fn) => {
        onPullRequestLookup = fn;
      }
    };
  }
  function seedSession(stateManager, options) {
    const summary = {
      resource: SESSION,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      workingDirectories: options?.workingDirectory ? [options.workingDirectory] : void 0
    };
    stateManager.restoreSession(summary, []);
    if (options?.gitState) {
      stateManager.setSessionMeta(SESSION, withSessionGitState(void 0, options.gitState));
    }
    if (options?.gitHubState) {
      stateManager.setSessionMeta(SESSION, withSessionGitHubState(stateManager.getSessionState(SESSION)?._meta, options.gitHubState));
    }
  }
  test("does nothing when no working directory can be resolved", async () => {
    const h = createHarness();
    seedSession(h.stateManager);
    await h.service.refreshSessionGitState(SESSION, void 0);
    assert.deepStrictEqual({
      gitCalls: h.gitCalls,
      runEvents: h.runEvents
    }, {
      gitCalls: [],
      runEvents: []
    });
  });
  test("refreshes git state in memory while a session is creating", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      h.stateManager.createSession({
        resource: SESSION,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        workingDirectories: ["file:///original"]
      }, { emitNotification: false });
      const next = { branchName: "feature", uncommittedChanges: 1 };
      h.setGitResult(next);
      await h.service.refreshSessionGitState(SESSION, URI.parse("file:///explicit"));
      assert.deepStrictEqual({
        gitCalls: h.gitCalls,
        gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
        persistedGit: await h.db.getMetadata(META_GIT_STATE),
        runEvents: h.runEvents
      }, {
        gitCalls: ["file:///explicit"],
        gitState: next,
        persistedGit: void 0,
        runEvents: [SESSION]
      });
    });
  });
  test("resolves the working directory from the session summary when none is provided", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      h.setGitResult({ branchName: "feature" });
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual(h.gitCalls, [WORKING_DIRECTORY]);
    });
  });
  test("prefers an explicitly provided working directory over the session summary", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      h.setGitResult({ branchName: "feature" });
      await h.service.refreshSessionGitState(SESSION, URI.parse("file:///explicit"));
      assert.deepStrictEqual(h.gitCalls, ["file:///explicit"]);
    });
  });
  test("unchanged git state still fires the run-refresh event", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", uncommittedChanges: 1 };
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState });
      h.setGitResult(gitState);
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual(h.runEvents, [SESSION]);
    });
  });
  test("changed git state updates the session meta and fires the run-refresh event", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      const next = { branchName: "feature", baseBranchName: "main", uncommittedChanges: 2 };
      h.setGitResult(next);
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual({
        gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
        runEvents: h.runEvents
      }, {
        gitState: next,
        runEvents: [SESSION]
      });
    });
  });
  test("persists git state and derives GitHub state when git reports a GitHub repo", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      const next = { branchName: "feature", githubOwner: "microsoft", githubRepo: "vscode" };
      h.setGitResult(next);
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual({
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
        persistedGit: await h.db.getMetadata(META_GIT_STATE)
      }, {
        github: { owner: "microsoft", repo: "vscode" },
        persistedGit: JSON.stringify(next)
      });
    });
  });
  test("preserves pull request attachment when a later refresh replaces its queued refresh", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const calls = [];
      const octoKitService = {
        findPullRequestByHeadBranch: async (owner, repo, branch, _token, _signal, headOwner) => {
          calls.push({ owner, repo, branch, headOwner });
          return { url: "https://github.com/microsoft/vscode/pull/1", number: 1 };
        }
      };
      const agentService = { getAuthToken: () => "token" };
      const h = createHarness({ octoKitService, agentService });
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState: {
          branchName: "feature",
          baseBranchName: "main",
          githubOwner: "microsoft",
          githubRepo: "vscode"
        }
      });
      h.setGitResult({
        branchName: "feature",
        baseBranchName: "main",
        upstreamBranchName: "fork/feature",
        githubOwner: "microsoft",
        githubHeadOwner: "fork-owner",
        githubRepo: "vscode"
      });
      await Promise.all([
        h.service.refreshSessionGitState(SESSION, URI.parse(WORKING_DIRECTORY)),
        h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY)),
        h.service.refreshSessionGitState(SESSION, URI.parse(WORKING_DIRECTORY))
      ]);
      assert.deepStrictEqual({
        gitCalls: h.gitCalls.length,
        calls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        gitCalls: 2,
        calls: [{ owner: "microsoft", repo: "vscode", branch: "feature", headOwner: "fork-owner" }],
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrl: "https://github.com/microsoft/vscode/pull/1",
          pullRequestBranchName: "feature"
        }
      });
    });
  });
  test("accumulates the GitHub issues referenced across user messages", async () => {
    const h = createHarness();
    seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
    await h.service.attachSessionGitHubIssues(SESSION, "Fix https://github.com/microsoft/vscode/issues/1 please");
    await h.service.attachSessionGitHubIssues(SESSION, "Also microsoft/vscode#1 and octo/repo#2, but not #3");
    await h.service.attachSessionGitHubIssues(SESSION, "Nothing to see here");
    assert.deepStrictEqual({
      github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
      persistedGitHub: await h.db.getMetadata(META_GITHUB_STATE)
    }, {
      github: {
        issueUrls: [
          "https://github.com/microsoft/vscode/issues/1",
          "https://github.com/octo/repo/issues/2"
        ]
      },
      persistedGitHub: JSON.stringify({
        issueUrls: [
          "https://github.com/microsoft/vscode/issues/1",
          "https://github.com/octo/repo/issues/2"
        ]
      })
    });
  });
  test("swallows git errors and fires no events", async () => {
    const h = createHarness();
    seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
    h.setGitError(new Error("git command failed"));
    await h.service.refreshSessionGitState(SESSION, void 0);
    assert.deepStrictEqual({
      runEvents: h.runEvents
    }, {
      runEvents: []
    });
  });
  test("coalesces concurrent refreshes for the same session", async () => {
    await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      h.setGitResult({ branchName: "feature" });
      await Promise.all([
        h.service.refreshSessionGitState(SESSION, void 0),
        h.service.refreshSessionGitState(SESSION, void 0),
        h.service.refreshSessionGitState(SESSION, void 0)
      ]);
      assert.strictEqual(h.gitCalls.length, 2);
    });
  });
  test("stops looking for a pull request once one is known for the current branch", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1", pullRequestBranchName: "feature" }
      });
    });
  });
  test("keeps the known pull request but resumes looking after the branch changed", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const nextGitState = { branchName: "feature-2", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState: { branchName: "feature", baseBranchName: "main" },
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1", pullRequestBranchName: "feature" }
      });
      h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, nextGitState));
      h.setGitResult(nextGitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const githubBeforePullRequestExists = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      h.setPullRequest("feature-2", { url: "https://github.com/microsoft/vscode/pull/2", number: 2 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        githubBeforePullRequestExists,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature-2", "feature-2"],
        githubBeforePullRequestExists: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1", pullRequestBranchName: "feature" },
        github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/2", pullRequestBranchName: "feature-2" }
      });
    });
  });
  test("verifies a pull request that predates branch tracking against the current branch", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1" }
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1", pullRequestBranchName: "feature" }
      });
    });
  });
  test("does not bind a pull request that predates branch tracking to a branch without one", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature-2", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1" }
      });
      h.setGitResult(gitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature-2", "feature-2"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1" }
      });
    });
  });
  test("discards a pull request lookup whose branch is no longer checked out", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      h.setOnPullRequestLookup(async () => {
        h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, { branchName: "feature-2", baseBranchName: "main" }));
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature"],
        github: { owner: "microsoft", repo: "vscode" }
      });
    });
  });
  test("looks for a pull request before reporting a refresh that observed a branch change", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState: { branchName: "feature", baseBranchName: "main", githubOwner: "microsoft", githubRepo: "vscode" },
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/1", pullRequestBranchName: "feature" }
      });
      h.setGitResult({ branchName: "feature-2", baseBranchName: "main", githubOwner: "microsoft", githubRepo: "vscode" });
      h.setPullRequest("feature-2", { url: "https://github.com/microsoft/vscode/pull/2", number: 2 });
      let githubOnRefreshEvent;
      disposables.add(h.service.onDidRefreshSessionGitState(() => {
        githubOnRefreshEvent = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      }));
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        githubOnRefreshEvent
      }, {
        pullRequestCalls: ["feature-2"],
        githubOnRefreshEvent: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/2", pullRequestBranchName: "feature-2" }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSwgcmVhZFNlc3Npb25HaXRTdGF0ZSwgd2l0aFNlc3Npb25HaXRIdWJTdGF0ZSwgd2l0aFNlc3Npb25HaXRTdGF0ZSwgU2Vzc2lvblN0YXR1cywgdHlwZSBJU2Vzc2lvbkdpdEh1YlN0YXRlLCB0eXBlIElTZXNzaW9uR2l0U3RhdGUsIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IE1FVEFfR0lUX1NUQVRFLCBNRVRBX0dJVEhVQl9TVEFURSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4vdGVzdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgdHlwZSB7IENyZWF0ZWRQdWxsUmVxdWVzdCwgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFNlc3Npb25EYXRhYmFzZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuXG5jb25zdCBTRVNTSU9OID0gJ21vY2s6L3Nlc3Npb24tMSc7XG5jb25zdCBXT1JLSU5HX0RJUkVDVE9SWSA9ICdmaWxlOi8vL3dkJztcblxuc3VpdGUoJ0FnZW50SG9zdEdpdFN0YXRlU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhcm5lc3Mob3B0aW9ucz86IHsgb2N0b0tpdFNlcnZpY2U/OiBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2U7IGFnZW50U2VydmljZT86IElBZ2VudFNlcnZpY2UgfSkge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYik7XG5cblx0XHRjb25zdCBnaXRDYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZ2l0UmVzdWx0OiBJU2Vzc2lvbkdpdFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBnaXRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0U2Vzc2lvbkdpdFN0YXRlOiBhc3luYyAod29ya2luZ0RpcmVjdG9yeTogVVJJKSA9PiB7XG5cdFx0XHRcdGdpdENhbGxzLnB1c2god29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGdpdEVycm9yKSB7XG5cdFx0XHRcdFx0dGhyb3cgZ2l0RXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGdpdFJlc3VsdDtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0Q2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RzQnlCcmFuY2ggPSBuZXcgTWFwPHN0cmluZywgQ3JlYXRlZFB1bGxSZXF1ZXN0PigpO1xuXHRcdGxldCBvblB1bGxSZXF1ZXN0TG9va3VwOiAoKGJyYW5jaDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IHtcblx0XHRcdGZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDogYXN5bmMgKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzLnB1c2goYnJhbmNoKTtcblx0XHRcdFx0YXdhaXQgb25QdWxsUmVxdWVzdExvb2t1cD8uKGJyYW5jaCk7XG5cdFx0XHRcdHJldHVybiBwdWxsUmVxdWVzdHNCeUJyYW5jaC5nZXQoYnJhbmNoKTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZTtcblx0XHRjb25zdCBhZ2VudFNlcnZpY2UgPSB7IGdldEF1dGhUb2tlbjogKCkgPT4gJ3Rva2VuJyB9IGFzIHVua25vd24gYXMgSUFnZW50U2VydmljZTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEdpdFN0YXRlU2VydmljZShcblx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0XHRvcHRpb25zPy5vY3RvS2l0U2VydmljZSA/PyBvY3RvS2l0U2VydmljZSxcblx0XHRcdG9wdGlvbnM/LmFnZW50U2VydmljZSA/PyBhZ2VudFNlcnZpY2UsXG5cdFx0XHRjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHJ1bkV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoa2V5ID0+IHJ1bkV2ZW50cy5wdXNoKGtleSkpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRkYixcblx0XHRcdHNlcnZpY2UsXG5cdFx0XHRnaXRDYWxscyxcblx0XHRcdHJ1bkV2ZW50cyxcblx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRzZXRHaXRSZXN1bHQ6IChzdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCkgPT4geyBnaXRSZXN1bHQgPSBzdGF0ZTsgfSxcblx0XHRcdHNldEdpdEVycm9yOiAoZXJyb3I6IEVycm9yKSA9PiB7IGdpdEVycm9yID0gZXJyb3I7IH0sXG5cdFx0XHRzZXRQdWxsUmVxdWVzdDogKGJyYW5jaDogc3RyaW5nLCBwdWxsUmVxdWVzdDogQ3JlYXRlZFB1bGxSZXF1ZXN0KSA9PiB7IHB1bGxSZXF1ZXN0c0J5QnJhbmNoLnNldChicmFuY2gsIHB1bGxSZXF1ZXN0KTsgfSxcblx0XHRcdHNldE9uUHVsbFJlcXVlc3RMb29rdXA6IChmbjogKGJyYW5jaDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+KSA9PiB7IG9uUHVsbFJlcXVlc3RMb29rdXAgPSBmbjsgfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VlZFNlc3Npb24oc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIG9wdGlvbnM/OiB7IHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmc7IGdpdFN0YXRlPzogSVNlc3Npb25HaXRTdGF0ZTsgZ2l0SHViU3RhdGU/OiBJU2Vzc2lvbkdpdEh1YlN0YXRlIH0pOiB2b2lkIHtcblx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IG9wdGlvbnM/LndvcmtpbmdEaXJlY3RvcnkgPyBbb3B0aW9ucy53b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdC8vIGByZXN0b3JlU2Vzc2lvbmAgbWF0ZXJpYWxpemVzIHRoZSBzZXNzaW9uIGluIGByZWFkeWAgbGlmZWN5Y2xlIHNvIHRoZVxuXHRcdC8vIHBlcnNpc3RlbmNlIHBhdGggKHdoaWNoIHNraXBzIGBjcmVhdGluZ2Agc2Vzc2lvbnMpIGFjdHVhbGx5IHJ1bnMuXG5cdFx0c3RhdGVNYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKHN1bW1hcnksIFtdKTtcblx0XHRpZiAob3B0aW9ucz8uZ2l0U3RhdGUpIHtcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShTRVNTSU9OLCB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgb3B0aW9ucy5naXRTdGF0ZSkpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8uZ2l0SHViU3RhdGUpIHtcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShTRVNTSU9OLCB3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhLCBvcHRpb25zLmdpdEh1YlN0YXRlKSk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnZG9lcyBub3RoaW5nIHdoZW4gbm8gd29ya2luZyBkaXJlY3RvcnkgY2FuIGJlIHJlc29sdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIpO1xuXG5cdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2l0Q2FsbHM6IGguZ2l0Q2FsbHMsXG5cdFx0XHRydW5FdmVudHM6IGgucnVuRXZlbnRzXG5cdFx0fSwge1xuXHRcdFx0Z2l0Q2FsbHM6IFtdLFxuXHRcdFx0cnVuRXZlbnRzOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoZXMgZ2l0IHN0YXRlIGluIG1lbW9yeSB3aGlsZSBhIHNlc3Npb24gaXMgY3JlYXRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0aC5zdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9vcmlnaW5hbCddLFxuXHRcdFx0fSwgeyBlbWl0Tm90aWZpY2F0aW9uOiBmYWxzZSB9KTtcblx0XHRcdGNvbnN0IG5leHQ6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgdW5jb21taXR0ZWRDaGFuZ2VzOiAxIH07XG5cdFx0XHRoLnNldEdpdFJlc3VsdChuZXh0KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgVVJJLnBhcnNlKCdmaWxlOi8vL2V4cGxpY2l0JykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2l0Q2FsbHM6IGguZ2l0Q2FsbHMsXG5cdFx0XHRcdGdpdFN0YXRlOiByZWFkU2Vzc2lvbkdpdFN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpLFxuXHRcdFx0XHRwZXJzaXN0ZWRHaXQ6IGF3YWl0IGguZGIuZ2V0TWV0YWRhdGEoTUVUQV9HSVRfU1RBVEUpLFxuXHRcdFx0XHRydW5FdmVudHM6IGgucnVuRXZlbnRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRnaXRDYWxsczogWydmaWxlOi8vL2V4cGxpY2l0J10sXG5cdFx0XHRcdGdpdFN0YXRlOiBuZXh0LFxuXHRcdFx0XHRwZXJzaXN0ZWRHaXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cnVuRXZlbnRzOiBbU0VTU0lPTl0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGZyb20gdGhlIHNlc3Npb24gc3VtbWFyeSB3aGVuIG5vbmUgaXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlkgfSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoLmdpdENhbGxzLCBbV09SS0lOR19ESVJFQ1RPUlldKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycyBhbiBleHBsaWNpdGx5IHByb3ZpZGVkIHdvcmtpbmcgZGlyZWN0b3J5IG92ZXIgdGhlIHNlc3Npb24gc3VtbWFyeScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwgeyB3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSB9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH0pO1xuXG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vZXhwbGljaXQnKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaC5naXRDYWxscywgWydmaWxlOi8vL2V4cGxpY2l0J10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmNoYW5nZWQgZ2l0IHN0YXRlIHN0aWxsIGZpcmVzIHRoZSBydW4tcmVmcmVzaCBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIHVuY29tbWl0dGVkQ2hhbmdlczogMSB9O1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7IHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLCBnaXRTdGF0ZSB9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoLnJ1bkV2ZW50cywgW1NFU1NJT05dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlZCBnaXQgc3RhdGUgdXBkYXRlcyB0aGUgc2Vzc2lvbiBtZXRhIGFuZCBmaXJlcyB0aGUgcnVuLXJlZnJlc2ggZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlkgfSk7XG5cdFx0XHRjb25zdCBuZXh0OiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsIHVuY29tbWl0dGVkQ2hhbmdlczogMiB9O1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQobmV4dCk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRnaXRTdGF0ZTogcmVhZFNlc3Npb25HaXRTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdFx0cnVuRXZlbnRzOiBoLnJ1bkV2ZW50cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2l0U3RhdGU6IG5leHQsXG5cdFx0XHRcdHJ1bkV2ZW50czogW1NFU1NJT05dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGdpdCBzdGF0ZSBhbmQgZGVyaXZlcyBHaXRIdWIgc3RhdGUgd2hlbiBnaXQgcmVwb3J0cyBhIEdpdEh1YiByZXBvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7IHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZIH0pO1xuXHRcdFx0Y29uc3QgbmV4dDogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBnaXRodWJPd25lcjogJ21pY3Jvc29mdCcsIGdpdGh1YlJlcG86ICd2c2NvZGUnIH07XG5cdFx0XHRoLnNldEdpdFJlc3VsdChuZXh0KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdFx0cGVyc2lzdGVkR2l0OiBhd2FpdCBoLmRiLmdldE1ldGFkYXRhKE1FVEFfR0lUX1NUQVRFKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2l0aHViOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0cGVyc2lzdGVkR2l0OiBKU09OLnN0cmluZ2lmeShuZXh0KSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgcHVsbCByZXF1ZXN0IGF0dGFjaG1lbnQgd2hlbiBhIGxhdGVyIHJlZnJlc2ggcmVwbGFjZXMgaXRzIHF1ZXVlZCByZWZyZXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FsbHM6IHsgb3duZXI6IHN0cmluZzsgcmVwbzogc3RyaW5nOyBicmFuY2g6IHN0cmluZzsgaGVhZE93bmVyOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IHtcblx0XHRcdFx0ZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoOiBhc3luYyAob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZywgX3Rva2VuOiBzdHJpbmcsIF9zaWduYWw6IEFib3J0U2lnbmFsLCBoZWFkT3duZXI/OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRjYWxscy5wdXNoKHsgb3duZXIsIHJlcG8sIGJyYW5jaCwgaGVhZE93bmVyIH0pO1xuXHRcdFx0XHRcdHJldHVybiB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScsIG51bWJlcjogMSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZTtcblx0XHRcdGNvbnN0IGFnZW50U2VydmljZSA9IHsgZ2V0QXV0aFRva2VuOiAoKSA9PiAndG9rZW4nIH0gYXMgdW5rbm93biBhcyBJQWdlbnRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoeyBvY3RvS2l0U2VydmljZSwgYWdlbnRTZXJ2aWNlIH0pO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlOiB7XG5cdFx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdFx0Z2l0aHViT3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRcdGdpdGh1YlJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdCh7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnZm9yay9mZWF0dXJlJyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRnaXRodWJIZWFkT3duZXI6ICdmb3JrLW93bmVyJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ3ZzY29kZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKSxcblx0XHRcdFx0aC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKSxcblx0XHRcdFx0aC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGdpdENhbGxzOiBoLmdpdENhbGxzLmxlbmd0aCxcblx0XHRcdFx0Y2FsbHMsXG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2l0Q2FsbHM6IDIsXG5cdFx0XHRcdGNhbGxzOiBbeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBicmFuY2g6ICdmZWF0dXJlJywgaGVhZE93bmVyOiAnZm9yay1vd25lcicgfV0sXG5cdFx0XHRcdGdpdGh1Yjoge1xuXHRcdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScsXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWNjdW11bGF0ZXMgdGhlIEdpdEh1YiBpc3N1ZXMgcmVmZXJlbmNlZCBhY3Jvc3MgdXNlciBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7IHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZIH0pO1xuXG5cdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJJc3N1ZXMoU0VTU0lPTiwgJ0ZpeCBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMSBwbGVhc2UnKTtcblx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1Yklzc3VlcyhTRVNTSU9OLCAnQWxzbyBtaWNyb3NvZnQvdnNjb2RlIzEgYW5kIG9jdG8vcmVwbyMyLCBidXQgbm90ICMzJyk7XG5cdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJJc3N1ZXMoU0VTU0lPTiwgJ05vdGhpbmcgdG8gc2VlIGhlcmUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2l0aHViOiByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpLFxuXHRcdFx0cGVyc2lzdGVkR2l0SHViOiBhd2FpdCBoLmRiLmdldE1ldGFkYXRhKE1FVEFfR0lUSFVCX1NUQVRFKSxcblx0XHR9LCB7XG5cdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0aXNzdWVVcmxzOiBbXG5cdFx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xJyxcblx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL29jdG8vcmVwby9pc3N1ZXMvMicsXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZWRHaXRIdWI6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0aXNzdWVVcmxzOiBbXG5cdFx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xJyxcblx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL29jdG8vcmVwby9pc3N1ZXMvMicsXG5cdFx0XHRcdF1cblx0XHRcdH0pLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2FsbG93cyBnaXQgZXJyb3JzIGFuZCBmaXJlcyBubyBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwgeyB3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSB9KTtcblx0XHRoLnNldEdpdEVycm9yKG5ldyBFcnJvcignZ2l0IGNvbW1hbmQgZmFpbGVkJykpO1xuXG5cdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cnVuRXZlbnRzOiBoLnJ1bkV2ZW50c1xuXHRcdH0sIHtcblx0XHRcdHJ1bkV2ZW50czogW11cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29hbGVzY2VzIGNvbmN1cnJlbnQgcmVmcmVzaGVzIGZvciB0aGUgc2FtZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwgeyB3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSB9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH0pO1xuXG5cdFx0XHQvLyBUaHJlZSBjb25jdXJyZW50IHJlZnJlc2hlcyBjb2xsYXBzZSB2aWEgdGhlIHRocm90dGxlcjogdGhlIGZpcnN0XG5cdFx0XHQvLyBydW5zIGltbWVkaWF0ZWx5IGFuZCB0aGUgbGFzdCBxdWV1ZWQgb25lIHJ1bnMgYWZ0ZXIgaXQgc2V0dGxlcztcblx0XHRcdC8vIHRoZSBtaWRkbGUgcmVxdWVzdCBpcyBkcm9wcGVkLlxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoLmdpdENhbGxzLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3BzIGxvb2tpbmcgZm9yIGEgcHVsbCByZXF1ZXN0IG9uY2Ugb25lIGlzIGtub3duIGZvciB0aGUgY3VycmVudCBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblx0XHRcdGguc2V0UHVsbFJlcXVlc3QoJ2ZlYXR1cmUnLCB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScsIG51bWJlcjogMSB9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogWydmZWF0dXJlJ10sXG5cdFx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScsIHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIGtub3duIHB1bGwgcmVxdWVzdCBidXQgcmVzdW1lcyBsb29raW5nIGFmdGVyIHRoZSBicmFuY2ggY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5leHRHaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0Z2l0U3RhdGU6IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0sXG5cdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJywgcHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnZmVhdHVyZScgfSxcblx0XHRcdH0pO1xuXHRcdFx0aC5zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbk1ldGEoU0VTU0lPTiwgd2l0aFNlc3Npb25HaXRTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhLCBuZXh0R2l0U3RhdGUpKTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KG5leHRHaXRTdGF0ZSk7XG5cblx0XHRcdC8vIE5vIHB1bGwgcmVxdWVzdCBleGlzdHMgZm9yIHRoZSBuZXcgYnJhbmNoIHlldFxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblx0XHRcdGNvbnN0IGdpdGh1YkJlZm9yZVB1bGxSZXF1ZXN0RXhpc3RzID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblxuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZS0yJywgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLCBudW1iZXI6IDIgfSk7XG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogaC5wdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0XHRnaXRodWJCZWZvcmVQdWxsUmVxdWVzdEV4aXN0cyxcblx0XHRcdFx0Z2l0aHViOiByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBbJ2ZlYXR1cmUtMicsICdmZWF0dXJlLTInXSxcblx0XHRcdFx0Z2l0aHViQmVmb3JlUHVsbFJlcXVlc3RFeGlzdHM6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9LFxuXHRcdFx0XHRnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlLTInIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmVyaWZpZXMgYSBwdWxsIHJlcXVlc3QgdGhhdCBwcmVkYXRlcyBicmFuY2ggdHJhY2tpbmcgYWdhaW5zdCB0aGUgY3VycmVudCBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScgfSxcblx0XHRcdH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoZ2l0U3RhdGUpO1xuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZScsIHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJywgbnVtYmVyOiAxIH0pO1xuXG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogaC5wdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IFsnZmVhdHVyZSddLFxuXHRcdFx0XHRnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJpbmQgYSBwdWxsIHJlcXVlc3QgdGhhdCBwcmVkYXRlcyBicmFuY2ggdHJhY2tpbmcgdG8gYSBicmFuY2ggd2l0aG91dCBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0Z2l0U3RhdGUsXG5cdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogaC5wdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IFsnZmVhdHVyZS0yJywgJ2ZlYXR1cmUtMiddLFxuXHRcdFx0XHRnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY2FyZHMgYSBwdWxsIHJlcXVlc3QgbG9va3VwIHdob3NlIGJyYW5jaCBpcyBubyBsb25nZXIgY2hlY2tlZCBvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblx0XHRcdGguc2V0UHVsbFJlcXVlc3QoJ2ZlYXR1cmUnLCB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScsIG51bWJlcjogMSB9KTtcblx0XHRcdC8vIFRoZSB3b3JraW5nIGNvcHkgbW92ZXMgdG8gYW5vdGhlciBicmFuY2ggd2hpbGUgdGhlIGxvb2t1cCBpcyBpbiBmbGlnaHQuXG5cdFx0XHRoLnNldE9uUHVsbFJlcXVlc3RMb29rdXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRoLnN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShTRVNTSU9OLCB3aXRoU2Vzc2lvbkdpdFN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEsIHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogWydmZWF0dXJlJ10sXG5cdFx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbG9va3MgZm9yIGEgcHVsbCByZXF1ZXN0IGJlZm9yZSByZXBvcnRpbmcgYSByZWZyZXNoIHRoYXQgb2JzZXJ2ZWQgYSBicmFuY2ggY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZTogeyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsIGdpdGh1Yk93bmVyOiAnbWljcm9zb2Z0JywgZ2l0aHViUmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlLTInLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nLCBnaXRodWJPd25lcjogJ21pY3Jvc29mdCcsIGdpdGh1YlJlcG86ICd2c2NvZGUnIH0pO1xuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZS0yJywgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLCBudW1iZXI6IDIgfSk7XG5cblx0XHRcdC8vIFRoZSBHaXRIdWIgc3RhdGUgaXMgY2FwdHVyZWQgd2hlbiB0aGUgcmVmcmVzaCBpcyByZXBvcnRlZCBzbyB0aGVcblx0XHRcdC8vIGV2ZW50IGNhcnJpZXMgdGhlIHB1bGwgcmVxdWVzdCBvZiB0aGUgbmV3bHkgY2hlY2tlZCBvdXQgYnJhbmNoLlxuXHRcdFx0bGV0IGdpdGh1Yk9uUmVmcmVzaEV2ZW50OiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGguc2VydmljZS5vbkRpZFJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoKCkgPT4ge1xuXHRcdFx0XHRnaXRodWJPblJlZnJlc2hFdmVudCA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdpdGh1Yk9uUmVmcmVzaEV2ZW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBbJ2ZlYXR1cmUtMiddLFxuXHRcdFx0XHRnaXRodWJPblJlZnJlc2hFdmVudDogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMicsIHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLHdCQUF3QixxQkFBcUIsd0JBQXdCLHFCQUFxQixxQkFBMkY7QUFDOUwsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMscUJBQXFCLHNCQUFzQixnQ0FBZ0M7QUFFcEYsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sb0JBQW9CO0FBRTFCLE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxXQUFTLGNBQWMsU0FBdUY7QUFDN0csVUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJLHNCQUFzQixJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ3BGLFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUNuQyxVQUFNLHFCQUFxQix5QkFBeUIsRUFBRTtBQUV0RCxVQUFNLFdBQXFCLENBQUM7QUFDNUIsUUFBSTtBQUNKLFFBQUk7QUFDSixVQUFNLGFBQW1DO0FBQUEsTUFDeEMsR0FBRyxxQkFBcUI7QUFBQSxNQUN4QixvQkFBb0IsT0FBTyxxQkFBMEI7QUFDcEQsaUJBQVMsS0FBSyxpQkFBaUIsU0FBUyxDQUFDO0FBQ3pDLFlBQUksVUFBVTtBQUNiLGdCQUFNO0FBQUEsUUFDUDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQTZCLENBQUM7QUFDcEMsVUFBTSx1QkFBdUIsb0JBQUksSUFBZ0M7QUFDakUsUUFBSTtBQUNKLFVBQU0saUJBQWlCO0FBQUEsTUFDdEIsNkJBQTZCLE9BQU8sUUFBZ0IsT0FBZSxXQUFtQjtBQUNyRix5QkFBaUIsS0FBSyxNQUFNO0FBQzVCLGNBQU0sc0JBQXNCLE1BQU07QUFDbEMsZUFBTyxxQkFBcUIsSUFBSSxNQUFNO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLEVBQUUsY0FBYyxNQUFNLFFBQVE7QUFFbkQsVUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDbkM7QUFBQSxNQUNBO0FBQUEsTUFDQSxTQUFTLGtCQUFrQjtBQUFBLE1BQzNCLFNBQVMsZ0JBQWdCO0FBQUEsTUFDekIsZ0NBQWdDO0FBQUEsTUFDaEMsSUFBSSxlQUFlO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFlBQXNCLENBQUM7QUFDN0IsZ0JBQVksSUFBSSxRQUFRLDRCQUE0QixTQUFPLFVBQVUsS0FBSyxHQUFHLENBQUMsQ0FBQztBQUUvRSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjLENBQUMsVUFBd0M7QUFBRSxvQkFBWTtBQUFBLE1BQU87QUFBQSxNQUM1RSxhQUFhLENBQUMsVUFBaUI7QUFBRSxtQkFBVztBQUFBLE1BQU87QUFBQSxNQUNuRCxnQkFBZ0IsQ0FBQyxRQUFnQixnQkFBb0M7QUFBRSw2QkFBcUIsSUFBSSxRQUFRLFdBQVc7QUFBQSxNQUFHO0FBQUEsTUFDdEgsd0JBQXdCLENBQUMsT0FBMEM7QUFBRSw4QkFBc0I7QUFBQSxNQUFJO0FBQUEsSUFDaEc7QUFBQSxFQUNEO0FBRUEsV0FBUyxZQUFZLGNBQXFDLFNBQStHO0FBQ3hLLFVBQU0sVUFBMEI7QUFBQSxNQUMvQixVQUFVO0FBQUEsTUFDVixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCxRQUFRLGNBQWM7QUFBQSxNQUN0QixZQUFXLG9CQUFJLEtBQUssQ0FBQyxHQUFFLFlBQVk7QUFBQSxNQUNuQyxhQUFZLG9CQUFJLEtBQUssQ0FBQyxHQUFFLFlBQVk7QUFBQSxNQUNwQyxvQkFBb0IsU0FBUyxtQkFBbUIsQ0FBQyxRQUFRLGdCQUFnQixJQUFJO0FBQUEsSUFDOUU7QUFHQSxpQkFBYSxlQUFlLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZDLFFBQUksU0FBUyxVQUFVO0FBQ3RCLG1CQUFhLGVBQWUsU0FBUyxvQkFBb0IsUUFBVyxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3RGO0FBQ0EsUUFBSSxTQUFTLGFBQWE7QUFDekIsbUJBQWEsZUFBZSxTQUFTLHVCQUF1QixhQUFhLGdCQUFnQixPQUFPLEdBQUcsT0FBTyxRQUFRLFdBQVcsQ0FBQztBQUFBLElBQy9IO0FBQUEsRUFDRDtBQUVBLE9BQUssMERBQTBELFlBQVk7QUFDMUUsVUFBTSxJQUFJLGNBQWM7QUFDeEIsZ0JBQVksRUFBRSxZQUFZO0FBRTFCLFVBQU0sRUFBRSxRQUFRLHVCQUF1QixTQUFTLE1BQVM7QUFFekQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLEVBQUU7QUFBQSxNQUNaLFdBQVcsRUFBRTtBQUFBLElBQ2QsR0FBRztBQUFBLE1BQ0YsVUFBVSxDQUFDO0FBQUEsTUFDWCxXQUFXLENBQUM7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxZQUFZO0FBQzdFLFVBQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RCxZQUFNLElBQUksY0FBYztBQUN4QixRQUFFLGFBQWEsY0FBYztBQUFBLFFBQzVCLFVBQVU7QUFBQSxRQUNWLFVBQVU7QUFBQSxRQUNWLE9BQU87QUFBQSxRQUNQLFFBQVEsY0FBYztBQUFBLFFBQ3RCLFlBQVcsb0JBQUksS0FBSyxDQUFDLEdBQUUsWUFBWTtBQUFBLFFBQ25DLGFBQVksb0JBQUksS0FBSyxDQUFDLEdBQUUsWUFBWTtBQUFBLFFBQ3BDLG9CQUFvQixDQUFDLGtCQUFrQjtBQUFBLE1BQ3hDLEdBQUcsRUFBRSxrQkFBa0IsTUFBTSxDQUFDO0FBQzlCLFlBQU0sT0FBeUIsRUFBRSxZQUFZLFdBQVcsb0JBQW9CLEVBQUU7QUFDOUUsUUFBRSxhQUFhLElBQUk7QUFFbkIsWUFBTSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsSUFBSSxNQUFNLGtCQUFrQixDQUFDO0FBRTdFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxFQUFFO0FBQUEsUUFDWixVQUFVLG9CQUFvQixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxLQUFLO0FBQUEsUUFDNUUsY0FBYyxNQUFNLEVBQUUsR0FBRyxZQUFZLGNBQWM7QUFBQSxRQUNuRCxXQUFXLEVBQUU7QUFBQSxNQUNkLEdBQUc7QUFBQSxRQUNGLFVBQVUsQ0FBQyxrQkFBa0I7QUFBQSxRQUM3QixVQUFVO0FBQUEsUUFDVixjQUFjO0FBQUEsUUFDZCxXQUFXLENBQUMsT0FBTztBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlGQUFpRixZQUFZO0FBQ2pHLFVBQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RCxZQUFNLElBQUksY0FBYztBQUN4QixrQkFBWSxFQUFFLGNBQWMsRUFBRSxrQkFBa0Isa0JBQWtCLENBQUM7QUFDbkUsUUFBRSxhQUFhLEVBQUUsWUFBWSxVQUFVLENBQUM7QUFFeEMsWUFBTSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsTUFBUztBQUV6RCxhQUFPLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFVBQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RCxZQUFNLElBQUksY0FBYztBQUN4QixrQkFBWSxFQUFFLGNBQWMsRUFBRSxrQkFBa0Isa0JBQWtCLENBQUM7QUFDbkUsUUFBRSxhQUFhLEVBQUUsWUFBWSxVQUFVLENBQUM7QUFFeEMsWUFBTSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsSUFBSSxNQUFNLGtCQUFrQixDQUFDO0FBRTdFLGFBQU8sZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixDQUFDO0FBQUEsSUFDeEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseURBQXlELFlBQVk7QUFDekUsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQzdELFlBQU0sV0FBNkIsRUFBRSxZQUFZLFdBQVcsb0JBQW9CLEVBQUU7QUFDbEYsWUFBTSxJQUFJLGNBQWM7QUFDeEIsa0JBQVksRUFBRSxjQUFjLEVBQUUsa0JBQWtCLG1CQUFtQixTQUFTLENBQUM7QUFDN0UsUUFBRSxhQUFhLFFBQVE7QUFFdkIsWUFBTSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsTUFBUztBQUV6RCxhQUFPLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUM7QUFBQSxJQUM5QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4RUFBOEUsWUFBWTtBQUM5RixVQUFNLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDN0QsWUFBTSxJQUFJLGNBQWM7QUFDeEIsa0JBQVksRUFBRSxjQUFjLEVBQUUsa0JBQWtCLGtCQUFrQixDQUFDO0FBQ25FLFlBQU0sT0FBeUIsRUFBRSxZQUFZLFdBQVcsZ0JBQWdCLFFBQVEsb0JBQW9CLEVBQUU7QUFDdEcsUUFBRSxhQUFhLElBQUk7QUFFbkIsWUFBTSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsTUFBUztBQUV6RCxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFVBQVUsb0JBQW9CLEVBQUUsYUFBYSxnQkFBZ0IsT0FBTyxHQUFHLEtBQUs7QUFBQSxRQUM1RSxXQUFXLEVBQUU7QUFBQSxNQUNkLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLFdBQVcsQ0FBQyxPQUFPO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOEVBQThFLFlBQVk7QUFDOUYsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQzdELFlBQU0sSUFBSSxjQUFjO0FBQ3hCLGtCQUFZLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixrQkFBa0IsQ0FBQztBQUNuRSxZQUFNLE9BQXlCLEVBQUUsWUFBWSxXQUFXLGFBQWEsYUFBYSxZQUFZLFNBQVM7QUFDdkcsUUFBRSxhQUFhLElBQUk7QUFFbkIsWUFBTSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsTUFBUztBQUV6RCxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFFBQVEsdUJBQXVCLEVBQUUsYUFBYSxnQkFBZ0IsT0FBTyxHQUFHLEtBQUs7QUFBQSxRQUM3RSxjQUFjLE1BQU0sRUFBRSxHQUFHLFlBQVksY0FBYztBQUFBLE1BQ3BELEdBQUc7QUFBQSxRQUNGLFFBQVEsRUFBRSxPQUFPLGFBQWEsTUFBTSxTQUFTO0FBQUEsUUFDN0MsY0FBYyxLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQ2xDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNGQUFzRixZQUFZO0FBQ3RHLFVBQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RCxZQUFNLFFBQTBGLENBQUM7QUFDakcsWUFBTSxpQkFBaUI7QUFBQSxRQUN0Qiw2QkFBNkIsT0FBTyxPQUFlLE1BQWMsUUFBZ0IsUUFBZ0IsU0FBc0IsY0FBdUI7QUFDN0ksZ0JBQU0sS0FBSyxFQUFFLE9BQU8sTUFBTSxRQUFRLFVBQVUsQ0FBQztBQUM3QyxpQkFBTyxFQUFFLEtBQUssOENBQThDLFFBQVEsRUFBRTtBQUFBLFFBQ3ZFO0FBQUEsTUFDRDtBQUNBLFlBQU0sZUFBZSxFQUFFLGNBQWMsTUFBTSxRQUFRO0FBQ25ELFlBQU0sSUFBSSxjQUFjLEVBQUUsZ0JBQWdCLGFBQWEsQ0FBQztBQUN4RCxrQkFBWSxFQUFFLGNBQWM7QUFBQSxRQUMzQixrQkFBa0I7QUFBQSxRQUNsQixVQUFVO0FBQUEsVUFDVCxZQUFZO0FBQUEsVUFDWixnQkFBZ0I7QUFBQSxVQUNoQixhQUFhO0FBQUEsVUFDYixZQUFZO0FBQUEsUUFDYjtBQUFBLE1BQ0QsQ0FBQztBQUNELFFBQUUsYUFBYTtBQUFBLFFBQ2QsWUFBWTtBQUFBLFFBQ1osZ0JBQWdCO0FBQUEsUUFDaEIsb0JBQW9CO0FBQUEsUUFDcEIsYUFBYTtBQUFBLFFBQ2IsaUJBQWlCO0FBQUEsUUFDakIsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUVELFlBQU0sUUFBUSxJQUFJO0FBQUEsUUFDakIsRUFBRSxRQUFRLHVCQUF1QixTQUFTLElBQUksTUFBTSxpQkFBaUIsQ0FBQztBQUFBLFFBQ3RFLEVBQUUsUUFBUSwrQkFBK0IsU0FBUyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFBQSxRQUM5RSxFQUFFLFFBQVEsdUJBQXVCLFNBQVMsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUVELGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxFQUFFLFNBQVM7QUFBQSxRQUNyQjtBQUFBLFFBQ0EsUUFBUSx1QkFBdUIsRUFBRSxhQUFhLGdCQUFnQixPQUFPLEdBQUcsS0FBSztBQUFBLE1BQzlFLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLE9BQU8sQ0FBQyxFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsUUFBUSxXQUFXLFdBQVcsYUFBYSxDQUFDO0FBQUEsUUFDMUYsUUFBUTtBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sZ0JBQWdCO0FBQUEsVUFDaEIsdUJBQXVCO0FBQUEsUUFDeEI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sSUFBSSxjQUFjO0FBQ3hCLGdCQUFZLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixrQkFBa0IsQ0FBQztBQUVuRSxVQUFNLEVBQUUsUUFBUSwwQkFBMEIsU0FBUyx5REFBeUQ7QUFDNUcsVUFBTSxFQUFFLFFBQVEsMEJBQTBCLFNBQVMscURBQXFEO0FBQ3hHLFVBQU0sRUFBRSxRQUFRLDBCQUEwQixTQUFTLHFCQUFxQjtBQUV4RSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsdUJBQXVCLEVBQUUsYUFBYSxnQkFBZ0IsT0FBTyxHQUFHLEtBQUs7QUFBQSxNQUM3RSxpQkFBaUIsTUFBTSxFQUFFLEdBQUcsWUFBWSxpQkFBaUI7QUFBQSxJQUMxRCxHQUFHO0FBQUEsTUFDRixRQUFRO0FBQUEsUUFDUCxXQUFXO0FBQUEsVUFDVjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsaUJBQWlCLEtBQUssVUFBVTtBQUFBLFFBQy9CLFdBQVc7QUFBQSxVQUNWO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxZQUFZO0FBQzNELFVBQU0sSUFBSSxjQUFjO0FBQ3hCLGdCQUFZLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixrQkFBa0IsQ0FBQztBQUNuRSxNQUFFLFlBQVksSUFBSSxNQUFNLG9CQUFvQixDQUFDO0FBRTdDLFVBQU0sRUFBRSxRQUFRLHVCQUF1QixTQUFTLE1BQVM7QUFFekQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixXQUFXLEVBQUU7QUFBQSxJQUNkLEdBQUc7QUFBQSxNQUNGLFdBQVcsQ0FBQztBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNuRixZQUFNLElBQUksY0FBYztBQUN4QixrQkFBWSxFQUFFLGNBQWMsRUFBRSxrQkFBa0Isa0JBQWtCLENBQUM7QUFDbkUsUUFBRSxhQUFhLEVBQUUsWUFBWSxVQUFVLENBQUM7QUFLeEMsWUFBTSxRQUFRLElBQUk7QUFBQSxRQUNqQixFQUFFLFFBQVEsdUJBQXVCLFNBQVMsTUFBUztBQUFBLFFBQ25ELEVBQUUsUUFBUSx1QkFBdUIsU0FBUyxNQUFTO0FBQUEsUUFDbkQsRUFBRSxRQUFRLHVCQUF1QixTQUFTLE1BQVM7QUFBQSxNQUNwRCxDQUFDO0FBRUQsYUFBTyxZQUFZLEVBQUUsU0FBUyxRQUFRLENBQUM7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDN0QsWUFBTSxXQUE2QixFQUFFLFlBQVksV0FBVyxnQkFBZ0IsT0FBTztBQUNuRixZQUFNLElBQUksY0FBYztBQUN4QixrQkFBWSxFQUFFLGNBQWM7QUFBQSxRQUMzQixrQkFBa0I7QUFBQSxRQUNsQjtBQUFBLFFBQ0EsYUFBYSxFQUFFLE9BQU8sYUFBYSxNQUFNLFNBQVM7QUFBQSxNQUNuRCxDQUFDO0FBQ0QsUUFBRSxhQUFhLFFBQVE7QUFDdkIsUUFBRSxlQUFlLFdBQVcsRUFBRSxLQUFLLDhDQUE4QyxRQUFRLEVBQUUsQ0FBQztBQUU1RixZQUFNLEVBQUUsUUFBUSwrQkFBK0IsU0FBUyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFDcEYsWUFBTSxFQUFFLFFBQVEsK0JBQStCLFNBQVMsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBRXBGLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLEVBQUU7QUFBQSxRQUNwQixRQUFRLHVCQUF1QixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxLQUFLO0FBQUEsTUFDOUUsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLENBQUMsU0FBUztBQUFBLFFBQzVCLFFBQVEsRUFBRSxPQUFPLGFBQWEsTUFBTSxVQUFVLGdCQUFnQiw4Q0FBOEMsdUJBQXVCLFVBQVU7QUFBQSxNQUM5SSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDN0QsWUFBTSxlQUFpQyxFQUFFLFlBQVksYUFBYSxnQkFBZ0IsT0FBTztBQUN6RixZQUFNLElBQUksY0FBYztBQUN4QixrQkFBWSxFQUFFLGNBQWM7QUFBQSxRQUMzQixrQkFBa0I7QUFBQSxRQUNsQixVQUFVLEVBQUUsWUFBWSxXQUFXLGdCQUFnQixPQUFPO0FBQUEsUUFDMUQsYUFBYSxFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsZ0JBQWdCLDhDQUE4Qyx1QkFBdUIsVUFBVTtBQUFBLE1BQ25KLENBQUM7QUFDRCxRQUFFLGFBQWEsZUFBZSxTQUFTLG9CQUFvQixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxPQUFPLFlBQVksQ0FBQztBQUN4SCxRQUFFLGFBQWEsWUFBWTtBQUczQixZQUFNLEVBQUUsUUFBUSwrQkFBK0IsU0FBUyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFDcEYsWUFBTSxnQ0FBZ0MsdUJBQXVCLEVBQUUsYUFBYSxnQkFBZ0IsT0FBTyxHQUFHLEtBQUs7QUFFM0csUUFBRSxlQUFlLGFBQWEsRUFBRSxLQUFLLDhDQUE4QyxRQUFRLEVBQUUsQ0FBQztBQUM5RixZQUFNLEVBQUUsUUFBUSwrQkFBK0IsU0FBUyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFFcEYsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixrQkFBa0IsRUFBRTtBQUFBLFFBQ3BCO0FBQUEsUUFDQSxRQUFRLHVCQUF1QixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxLQUFLO0FBQUEsTUFDOUUsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLENBQUMsYUFBYSxXQUFXO0FBQUEsUUFDM0MsK0JBQStCLEVBQUUsT0FBTyxhQUFhLE1BQU0sVUFBVSxnQkFBZ0IsOENBQThDLHVCQUF1QixVQUFVO0FBQUEsUUFDcEssUUFBUSxFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsZ0JBQWdCLDhDQUE4Qyx1QkFBdUIsWUFBWTtBQUFBLE1BQ2hKLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9GQUFvRixZQUFZO0FBQ3BHLFVBQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RCxZQUFNLFdBQTZCLEVBQUUsWUFBWSxXQUFXLGdCQUFnQixPQUFPO0FBQ25GLFlBQU0sSUFBSSxjQUFjO0FBQ3hCLGtCQUFZLEVBQUUsY0FBYztBQUFBLFFBQzNCLGtCQUFrQjtBQUFBLFFBQ2xCO0FBQUEsUUFDQSxhQUFhLEVBQUUsT0FBTyxhQUFhLE1BQU0sVUFBVSxnQkFBZ0IsNkNBQTZDO0FBQUEsTUFDakgsQ0FBQztBQUNELFFBQUUsYUFBYSxRQUFRO0FBQ3ZCLFFBQUUsZUFBZSxXQUFXLEVBQUUsS0FBSyw4Q0FBOEMsUUFBUSxFQUFFLENBQUM7QUFFNUYsWUFBTSxFQUFFLFFBQVEsK0JBQStCLFNBQVMsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBRXBGLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLEVBQUU7QUFBQSxRQUNwQixRQUFRLHVCQUF1QixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxLQUFLO0FBQUEsTUFDOUUsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLENBQUMsU0FBUztBQUFBLFFBQzVCLFFBQVEsRUFBRSxPQUFPLGFBQWEsTUFBTSxVQUFVLGdCQUFnQiw4Q0FBOEMsdUJBQXVCLFVBQVU7QUFBQSxNQUM5SSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRkFBc0YsWUFBWTtBQUN0RyxVQUFNLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDN0QsWUFBTSxXQUE2QixFQUFFLFlBQVksYUFBYSxnQkFBZ0IsT0FBTztBQUNyRixZQUFNLElBQUksY0FBYztBQUN4QixrQkFBWSxFQUFFLGNBQWM7QUFBQSxRQUMzQixrQkFBa0I7QUFBQSxRQUNsQjtBQUFBLFFBQ0EsYUFBYSxFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsZ0JBQWdCLDZDQUE2QztBQUFBLE1BQ2pILENBQUM7QUFDRCxRQUFFLGFBQWEsUUFBUTtBQUV2QixZQUFNLEVBQUUsUUFBUSwrQkFBK0IsU0FBUyxJQUFJLE1BQU0saUJBQWlCLENBQUM7QUFDcEYsWUFBTSxFQUFFLFFBQVEsK0JBQStCLFNBQVMsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBRXBGLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLEVBQUU7QUFBQSxRQUNwQixRQUFRLHVCQUF1QixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxLQUFLO0FBQUEsTUFDOUUsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLENBQUMsYUFBYSxXQUFXO0FBQUEsUUFDM0MsUUFBUSxFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsZ0JBQWdCLDZDQUE2QztBQUFBLE1BQzVHLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdFQUF3RSxZQUFZO0FBQ3hGLFVBQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RCxZQUFNLFdBQTZCLEVBQUUsWUFBWSxXQUFXLGdCQUFnQixPQUFPO0FBQ25GLFlBQU0sSUFBSSxjQUFjO0FBQ3hCLGtCQUFZLEVBQUUsY0FBYztBQUFBLFFBQzNCLGtCQUFrQjtBQUFBLFFBQ2xCO0FBQUEsUUFDQSxhQUFhLEVBQUUsT0FBTyxhQUFhLE1BQU0sU0FBUztBQUFBLE1BQ25ELENBQUM7QUFDRCxRQUFFLGFBQWEsUUFBUTtBQUN2QixRQUFFLGVBQWUsV0FBVyxFQUFFLEtBQUssOENBQThDLFFBQVEsRUFBRSxDQUFDO0FBRTVGLFFBQUUsdUJBQXVCLFlBQVk7QUFDcEMsVUFBRSxhQUFhLGVBQWUsU0FBUyxvQkFBb0IsRUFBRSxhQUFhLGdCQUFnQixPQUFPLEdBQUcsT0FBTyxFQUFFLFlBQVksYUFBYSxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFBQSxNQUNoSyxDQUFDO0FBRUQsWUFBTSxFQUFFLFFBQVEsK0JBQStCLFNBQVMsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBRXBGLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLEVBQUU7QUFBQSxRQUNwQixRQUFRLHVCQUF1QixFQUFFLGFBQWEsZ0JBQWdCLE9BQU8sR0FBRyxLQUFLO0FBQUEsTUFDOUUsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLENBQUMsU0FBUztBQUFBLFFBQzVCLFFBQVEsRUFBRSxPQUFPLGFBQWEsTUFBTSxTQUFTO0FBQUEsTUFDOUMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUZBQXFGLFlBQVk7QUFDckcsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQzdELFlBQU0sSUFBSSxjQUFjO0FBQ3hCLGtCQUFZLEVBQUUsY0FBYztBQUFBLFFBQzNCLGtCQUFrQjtBQUFBLFFBQ2xCLFVBQVUsRUFBRSxZQUFZLFdBQVcsZ0JBQWdCLFFBQVEsYUFBYSxhQUFhLFlBQVksU0FBUztBQUFBLFFBQzFHLGFBQWEsRUFBRSxPQUFPLGFBQWEsTUFBTSxVQUFVLGdCQUFnQiw4Q0FBOEMsdUJBQXVCLFVBQVU7QUFBQSxNQUNuSixDQUFDO0FBQ0QsUUFBRSxhQUFhLEVBQUUsWUFBWSxhQUFhLGdCQUFnQixRQUFRLGFBQWEsYUFBYSxZQUFZLFNBQVMsQ0FBQztBQUNsSCxRQUFFLGVBQWUsYUFBYSxFQUFFLEtBQUssOENBQThDLFFBQVEsRUFBRSxDQUFDO0FBSTlGLFVBQUk7QUFDSixrQkFBWSxJQUFJLEVBQUUsUUFBUSw0QkFBNEIsTUFBTTtBQUMzRCwrQkFBdUIsdUJBQXVCLEVBQUUsYUFBYSxnQkFBZ0IsT0FBTyxHQUFHLEtBQUs7QUFBQSxNQUM3RixDQUFDLENBQUM7QUFFRixZQUFNLEVBQUUsUUFBUSx1QkFBdUIsU0FBUyxNQUFTO0FBRXpELGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLEVBQUU7QUFBQSxRQUNwQjtBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLENBQUMsV0FBVztBQUFBLFFBQzlCLHNCQUFzQixFQUFFLE9BQU8sYUFBYSxNQUFNLFVBQVUsZ0JBQWdCLDhDQUE4Qyx1QkFBdUIsWUFBWTtBQUFBLE1BQzlKLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
