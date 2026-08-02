import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore, ImmortalReference, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { GitHubPullRequestState } from "../../common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { GitHubPullRequestPollingContribution } from "../../browser/github.contribution.js";
import { ChatInteractivity, SessionStatus } from "../../../../services/sessions/common/session.js";
suite("GitHubPullRequestPollingContribution", () => {
  const store = new DisposableStore();
  const logService = new NullLogService();
  let sessionsManagementService;
  let sessionsService;
  let gitHubService;
  let activeSession;
  setup(() => {
    sessionsManagementService = new TestSessionsManagementService(store);
    activeSession = observableValue("test.activeSession", void 0);
    sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = activeSession;
      }
    }();
    gitHubService = new TestGitHubService();
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("starts polling existing and added pull request sessions", () => {
    const existingSession = sessionsManagementService.addSession("existing", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    const addedSession = sessionsManagementService.addSession("added", makeGitHubInfo(2));
    sessionsManagementService.fireSessionsChanged({ added: [addedSession] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
      "owner/repo/2": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
    assert.strictEqual(existingSession.isArchived.get(), false);
  });
  test("stops polling when a session is archived, then resumes when unarchived", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    sessionsManagementService.setArchived(session, true);
    sessionsManagementService.fireSessionsChanged({ changed: [session] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 }
    });
    sessionsManagementService.setArchived(session, false);
    sessionsManagementService.fireSessionsChanged({ changed: [session] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 2, stopPollingCalls: 1, disposeCalls: 0 }
    });
  });
  test("does not poll archived sessions until they are unarchived", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1), true);
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    assert.deepStrictEqual(gitHubService.snapshot(), {});
    sessionsManagementService.setArchived(session, false);
    sessionsManagementService.fireSessionsChanged({ changed: [session] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
  });
  test("stops polling tracked pull requests when disposed", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    const contribution = store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    contribution.dispose();
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 }
    });
    assert.strictEqual(session.isArchived.get(), false);
  });
  test("polls CI checks and review threads once an open pull request resolves", () => {
    sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    assert.deepStrictEqual(gitHubService.statusModelSnapshot(), { ci: {}, reviewThreads: {} });
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.statusModelSnapshot(), {
      ci: { "owner/repo/1/sha1": { startPollingCalls: 1, refreshCalls: 1 } },
      reviewThreads: { "owner/repo/1": { startPollingCalls: 1, refreshCalls: 1 } }
    });
  });
  test("does not poll CI checks or review threads for draft pull requests", () => {
    sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Open, isDraft: true, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.statusModelSnapshot(), { ci: {}, reviewThreads: {} });
  });
  test("starts polling once an asynchronously resolved PR number appears", () => {
    const session = sessionsManagementService.addSession("async", { owner: "owner", repo: "repo" });
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    assert.deepStrictEqual(gitHubService.snapshot(), {});
    sessionsManagementService.setGitHubInfo(session, makeGitHubInfo(1));
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
  });
  test("stops polling a merged pull request unless it is the active session", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Merged, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 }
    });
    activeSession.set(session, void 0);
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 2, stopPollingCalls: 1, disposeCalls: 0 }
    });
  });
});
class TestSessionsManagementService extends mock() {
  constructor(disposables) {
    super();
    this._sessions = /* @__PURE__ */ new Map();
    this._onDidChangeSessions = disposables.add(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
  }
  addSession(id, gitHubInfo, archived = false) {
    const session = new TestSession(id, gitHubInfo, archived);
    this._sessions.set(session.sessionId, session);
    return session;
  }
  removeSession(session) {
    this._sessions.delete(session.sessionId);
    this.fireSessionsChanged({ removed: [session] });
  }
  setArchived(session, archived) {
    session.isArchived.set(archived, void 0);
  }
  setGitHubInfo(session, gitHubInfo) {
    const workspace = session.workspace.get();
    const folder = workspace?.folders[0];
    if (folder) {
      folder.gitRepository.gitHubInfo.set(gitHubInfo, void 0);
    }
  }
  getSessions() {
    return [...this._sessions.values()];
  }
  fireSessionsChanged(event) {
    this._onDidChangeSessions.fire({
      added: event?.added ?? [],
      removed: event?.removed ?? [],
      changed: event?.changed ?? []
    });
  }
}
class TestSession {
  constructor(id, gitHubInfo, archived) {
    this.providerId = "test";
    this.sessionType = "test";
    this.icon = Codicon.comment;
    this.createdAt = /* @__PURE__ */ new Date(0);
    this.capabilities = constObservable({ supportsMultipleChats: false });
    this.sessionId = `test:${id}`;
    this.resource = URI.from({ scheme: "test", path: `/${id}` });
    const gitHubInfoObs = observableValue(`test.gitHubInfo.${id}`, gitHubInfo);
    const workspaceUri = URI.from({ scheme: "test", path: `/workspace/${id}` });
    this.title = observableValue(`test.title.${id}`, id);
    this.updatedAt = observableValue(`test.updatedAt.${id}`, /* @__PURE__ */ new Date(0));
    this.status = observableValue(`test.status.${id}`, SessionStatus.Completed);
    this.changesets = observableValue(`test.changesets.${id}`, []);
    this.changes = observableValue(`test.changes.${id}`, []);
    this.workspace = observableValue(`test.workspace.${id}`, {
      uri: workspaceUri,
      label: id,
      icon: Codicon.folder,
      folders: [{
        root: workspaceUri,
        workingDirectory: workspaceUri,
        name: id,
        description: void 0,
        gitRepository: { uri: workspaceUri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: gitHubInfoObs }
      }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    });
    this.modelId = observableValue(`test.modelId.${id}`, void 0);
    this.mode = observableValue(`test.mode.${id}`, void 0);
    this.loading = observableValue(`test.loading.${id}`, false);
    this.isArchived = observableValue(`test.isArchived.${id}`, archived);
    this.isRead = observableValue(`test.isRead.${id}`, true);
    this.description = observableValue(`test.description.${id}`, void 0);
    this.lastTurnEnd = observableValue(`test.lastTurnEnd.${id}`, void 0);
    const checkpoints = observableValue(`test.checkpoints.${id}`, void 0);
    const mainChat = {
      resource: this.resource,
      createdAt: this.createdAt,
      title: this.title,
      updatedAt: this.updatedAt,
      status: this.status,
      changes: this.changes,
      checkpoints,
      modelId: this.modelId,
      mode: this.mode,
      isArchived: this.isArchived,
      isRead: this.isRead,
      interactivity: constObservable(ChatInteractivity.Full),
      description: this.description,
      lastTurnEnd: this.lastTurnEnd
    };
    this.mainChat = constObservable(mainChat);
    this.chats = observableValue(`test.chats.${id}`, [mainChat]);
  }
}
class TestGitHubService extends mock() {
  constructor() {
    super(...arguments);
    this._models = /* @__PURE__ */ new Map();
    this._ciModels = /* @__PURE__ */ new Map();
    this._threadModels = /* @__PURE__ */ new Map();
    this.activeSessionPullRequestObs = observableValue("test.activePR", void 0);
    this.activeSessionPullRequestCIObs = observableValue("test.activePRCI", void 0);
    this.activeSessionPullRequestReviewThreadsObs = observableValue("test.activePRReviewThreads", void 0);
  }
  createPullRequestModelReference(owner, repo, prNumber) {
    const key = `${owner}/${repo}/${prNumber}`;
    let model = this._models.get(key);
    if (!model) {
      model = new TestPullRequestModel();
      this._models.set(key, model);
    }
    return new ImmortalReference(model);
  }
  createPullRequestCIModelReference(owner, repo, prNumber, headSha) {
    const key = `${owner}/${repo}/${prNumber}/${headSha}`;
    let model = this._ciModels.get(key);
    if (!model) {
      model = new TestStatusModel();
      this._ciModels.set(key, model);
    }
    return new ImmortalReference(model);
  }
  createPullRequestReviewThreadsModelReference(owner, repo, prNumber) {
    const key = `${owner}/${repo}/${prNumber}`;
    let model = this._threadModels.get(key);
    if (!model) {
      model = new TestStatusModel();
      this._threadModels.set(key, model);
    }
    return new ImmortalReference(model);
  }
  setPullRequestDetails(owner, repo, prNumber, details) {
    const model = this._models.get(`${owner}/${repo}/${prNumber}`);
    model?.setPullRequest(makePullRequest(details));
  }
  snapshot() {
    const entries = [...this._models.entries()].map(([key, model]) => [key, {
      startPollingCalls: model.startPollingCalls,
      stopPollingCalls: model.stopPollingCalls,
      disposeCalls: model.disposeCalls
    }]);
    return Object.fromEntries(entries);
  }
  statusModelSnapshot() {
    const toRecord = (models) => Object.fromEntries(
      [...models.entries()].map(([key, model]) => [key, { startPollingCalls: model.startPollingCalls, refreshCalls: model.refreshCalls }])
    );
    return { ci: toRecord(this._ciModels), reviewThreads: toRecord(this._threadModels) };
  }
}
class TestPullRequestModel {
  constructor() {
    this.startPollingCalls = 0;
    this.stopPollingCalls = 0;
    this.disposeCalls = 0;
    this._pullRequest = observableValue("test.pullRequest", void 0);
    this.pullRequest = this._pullRequest;
  }
  setPullRequest(pullRequest) {
    this._pullRequest.set(pullRequest, void 0);
  }
  startPolling() {
    this.startPollingCalls++;
    return toDisposable(() => this.stopPollingCalls++);
  }
  refresh() {
    return Promise.resolve();
  }
  dispose() {
    this.disposeCalls++;
  }
}
class TestStatusModel {
  constructor() {
    this.startPollingCalls = 0;
    this.refreshCalls = 0;
  }
  refresh() {
    this.refreshCalls++;
    return Promise.resolve();
  }
  startPolling() {
    this.startPollingCalls++;
    return toDisposable(() => {
    });
  }
  dispose() {
  }
}
function makePullRequest(overrides) {
  return {
    number: 1,
    title: "",
    body: "",
    state: overrides.state,
    author: { login: "", avatarUrl: "" },
    headRef: "",
    headSha: overrides.headSha,
    baseRef: "",
    isDraft: overrides.isDraft,
    createdAt: "",
    updatedAt: "",
    mergedAt: void 0,
    mergeable: void 0,
    mergeableState: ""
  };
}
function makeGitHubInfo(prNumber) {
  return {
    owner: "owner",
    repo: "repo",
    pullRequest: {
      number: prNumber,
      uri: URI.parse(`https://github.com/owner/repo/pull/${prNumber}`)
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL3Rlc3QvYnJvd3Nlci9naXRodWJDb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIEltbW9ydGFsUmVmZXJlbmNlLCBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdE1vZGVsLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0Q0lNb2RlbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUsIElHaXRIdWJQdWxsUmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZ2l0aHViLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgSUNoYXQsIElHaXRIdWJJbmZvLCBJU2Vzc2lvbiwgSVNlc3Npb25DYXBhYmlsaXRpZXMsIElTZXNzaW9uQ2hhbmdlc2V0LCBJQ2hhdENoZWNrcG9pbnRzLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0dpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRsZXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogVGVzdFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U7XG5cdGxldCBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2U7XG5cdGxldCBnaXRIdWJTZXJ2aWNlOiBUZXN0R2l0SHViU2VydmljZTtcblx0bGV0IGFjdGl2ZVNlc3Npb246IElTZXR0YWJsZU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHN0b3JlKTtcblx0XHRhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRzZXNzaW9uc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGFjdGl2ZVNlc3Npb247XG5cdFx0fTtcblx0XHRnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3N0YXJ0cyBwb2xsaW5nIGV4aXN0aW5nIGFuZCBhZGRlZCBwdWxsIHJlcXVlc3Qgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdTZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdleGlzdGluZycsIG1ha2VHaXRIdWJJbmZvKDEpKTtcblxuXHRcdHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgYWRkZWRTZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdhZGRlZCcsIG1ha2VHaXRIdWJJbmZvKDIpKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmZpcmVTZXNzaW9uc0NoYW5nZWQoeyBhZGRlZDogW2FkZGVkU2Vzc2lvbl0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHN0b3BQb2xsaW5nQ2FsbHM6IDAsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdFx0J293bmVyL3JlcG8vMic6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHN0b3BQb2xsaW5nQ2FsbHM6IDAsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdGluZ1Nlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBwb2xsaW5nIHdoZW4gYSBzZXNzaW9uIGlzIGFyY2hpdmVkLCB0aGVuIHJlc3VtZXMgd2hlbiB1bmFyY2hpdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ3Nlc3Npb24nLCBtYWtlR2l0SHViSW5mbygxKSk7XG5cdFx0c3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb24oZ2l0SHViU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNldEFyY2hpdmVkKHNlc3Npb24sIHRydWUpO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZmlyZVNlc3Npb25zQ2hhbmdlZCh7IGNoYW5nZWQ6IFtzZXNzaW9uXSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zbmFwc2hvdCgpLCB7XG5cdFx0XHQnb3duZXIvcmVwby8xJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgc3RvcFBvbGxpbmdDYWxsczogMSwgZGlzcG9zZUNhbGxzOiAwIH0sXG5cdFx0fSk7XG5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNldEFyY2hpdmVkKHNlc3Npb24sIGZhbHNlKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmZpcmVTZXNzaW9uc0NoYW5nZWQoeyBjaGFuZ2VkOiBbc2Vzc2lvbl0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDIsIHN0b3BQb2xsaW5nQ2FsbHM6IDEsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwb2xsIGFyY2hpdmVkIHNlc3Npb25zIHVudGlsIHRoZXkgYXJlIHVuYXJjaGl2ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYWRkU2Vzc2lvbignc2Vzc2lvbicsIG1ha2VHaXRIdWJJbmZvKDEpLCB0cnVlKTtcblx0XHRzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbihnaXRIdWJTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zbmFwc2hvdCgpLCB7fSk7XG5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNldEFyY2hpdmVkKHNlc3Npb24sIGZhbHNlKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmZpcmVTZXNzaW9uc0NoYW5nZWQoeyBjaGFuZ2VkOiBbc2Vzc2lvbl0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHN0b3BQb2xsaW5nQ2FsbHM6IDAsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBwb2xsaW5nIHRyYWNrZWQgcHVsbCByZXF1ZXN0cyB3aGVuIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ3Nlc3Npb24nLCBtYWtlR2l0SHViSW5mbygxKSk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gc3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb24oZ2l0SHViU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb250cmlidXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAxLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGxzIENJIGNoZWNrcyBhbmQgcmV2aWV3IHRocmVhZHMgb25jZSBhbiBvcGVuIHB1bGwgcmVxdWVzdCByZXNvbHZlcycsICgpID0+IHtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ3Nlc3Npb24nLCBtYWtlR2l0SHViSW5mbygxKSk7XG5cdFx0c3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb24oZ2l0SHViU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHQvLyBVbnRpbCB0aGUgUFIgZGV0YWlscyBsb2FkLCBvbmx5IHRoZSBQUiBtb2RlbCBpcyBwb2xsZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnN0YXR1c01vZGVsU25hcHNob3QoKSwgeyBjaToge30sIHJldmlld1RocmVhZHM6IHt9IH0pO1xuXG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdERldGFpbHMoJ293bmVyJywgJ3JlcG8nLCAxLCB7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc3RhdHVzTW9kZWxTbmFwc2hvdCgpLCB7XG5cdFx0XHRjaTogeyAnb3duZXIvcmVwby8xL3NoYTEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCByZWZyZXNoQ2FsbHM6IDEgfSB9LFxuXHRcdFx0cmV2aWV3VGhyZWFkczogeyAnb3duZXIvcmVwby8xJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgcmVmcmVzaENhbGxzOiAxIH0gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcG9sbCBDSSBjaGVja3Mgb3IgcmV2aWV3IHRocmVhZHMgZm9yIGRyYWZ0IHB1bGwgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdzZXNzaW9uJywgbWFrZUdpdEh1YkluZm8oMSkpO1xuXHRcdHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdERldGFpbHMoJ293bmVyJywgJ3JlcG8nLCAxLCB7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IHRydWUsIGhlYWRTaGE6ICdzaGExJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zdGF0dXNNb2RlbFNuYXBzaG90KCksIHsgY2k6IHt9LCByZXZpZXdUaHJlYWRzOiB7fSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzIHBvbGxpbmcgb25jZSBhbiBhc3luY2hyb25vdXNseSByZXNvbHZlZCBQUiBudW1iZXIgYXBwZWFycycsICgpID0+IHtcblx0XHQvLyBNaXJyb3JzIHRoZSBhZ2VudC1ob3N0IHByb3ZpZGVyLCB3aG9zZSBgZ2l0SHViSW5mb2AgaW5pdGlhbGx5IGhhcyBubyBQUlxuXHRcdC8vIG51bWJlciAoaXQgaXMgcmVzb2x2ZWQgYXN5bmNocm9ub3VzbHkgdmlhIGZpbmRQdWxsUmVxdWVzdE51bWJlckJ5SGVhZEJyYW5jaCkuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYWRkU2Vzc2lvbignYXN5bmMnLCB7IG93bmVyOiAnb3duZXInLCByZXBvOiAncmVwbycgfSk7XG5cdFx0c3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb24oZ2l0SHViU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHQvLyBObyBQUiBudW1iZXIgeWV0IFx1MjE5MiBub3RoaW5nIGlzIHBvbGxlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge30pO1xuXG5cdFx0Ly8gVGhlIFBSIG51bWJlciByZXNvbHZlcyBsYXRlci5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNldEdpdEh1YkluZm8oc2Vzc2lvbiwgbWFrZUdpdEh1YkluZm8oMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAwLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcHMgcG9sbGluZyBhIG1lcmdlZCBwdWxsIHJlcXVlc3QgdW5sZXNzIGl0IGlzIHRoZSBhY3RpdmUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdzZXNzaW9uJywgbWFrZUdpdEh1YkluZm8oMSkpO1xuXHRcdHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gT3BlbiBQUiBcdTIxOTIgcG9sbGluZy5cblx0XHRnaXRIdWJTZXJ2aWNlLnNldFB1bGxSZXF1ZXN0RGV0YWlscygnb3duZXInLCAncmVwbycsIDEsIHsgc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbiwgaXNEcmFmdDogZmFsc2UsIGhlYWRTaGE6ICdzaGExJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHN0b3BQb2xsaW5nQ2FsbHM6IDAsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gTWVyZ2VzIHdoaWxlIG5vdCB0aGUgYWN0aXZlIHNlc3Npb24gXHUyMTkyIHRoZSByZXBlYXRpbmcgcG9sbCBsb29wIHN0b3BzICh0aGVcblx0XHQvLyBzaW5nbGUgaW5pdGlhbCBmZXRjaCBhbHJlYWR5IHByb2R1Y2VkIHRoZSBtZXJnZWQgaWNvbikuXG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdERldGFpbHMoJ293bmVyJywgJ3JlcG8nLCAxLCB7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCwgaXNEcmFmdDogZmFsc2UsIGhlYWRTaGE6ICdzaGExJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHN0b3BQb2xsaW5nQ2FsbHM6IDEsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gQmVjb21lcyB0aGUgYWN0aXZlIHNlc3Npb24gXHUyMTkyIHBvbGxpbmcgcmVzdW1lcyBldmVuIHRob3VnaCBpdCBpcyBtZXJnZWQuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQoc2Vzc2lvbiBhcyB1bmtub3duIGFzIElBY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zbmFwc2hvdCgpLCB7XG5cdFx0XHQnb3duZXIvcmVwby8xJzogeyBzdGFydFBvbGxpbmdDYWxsczogMiwgc3RvcFBvbGxpbmdDYWxsczogMSwgZGlzcG9zZUNhbGxzOiAwIH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9uczogRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uPigpO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PElTZXNzaW9uc0NoYW5nZUV2ZW50PjtcblxuXHRjb25zdHJ1Y3RvcihkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50PigpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50O1xuXHR9XG5cblx0YWRkU2Vzc2lvbihpZDogc3RyaW5nLCBnaXRIdWJJbmZvOiBJR2l0SHViSW5mbyB8IHVuZGVmaW5lZCwgYXJjaGl2ZWQgPSBmYWxzZSk6IElTZXNzaW9uIHtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IFRlc3RTZXNzaW9uKGlkLCBnaXRIdWJJbmZvLCBhcmNoaXZlZCk7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdHJlbW92ZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuZmlyZVNlc3Npb25zQ2hhbmdlZCh7IHJlbW92ZWQ6IFtzZXNzaW9uXSB9KTtcblx0fVxuXG5cdHNldEFyY2hpdmVkKHNlc3Npb246IElTZXNzaW9uLCBhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdChzZXNzaW9uLmlzQXJjaGl2ZWQgYXMgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+Pikuc2V0KGFyY2hpdmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0R2l0SHViSW5mbyhzZXNzaW9uOiBJU2Vzc2lvbiwgZ2l0SHViSW5mbzogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF07XG5cdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0KGZvbGRlci5naXRSZXBvc2l0b3J5IS5naXRIdWJJbmZvIGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4+KS5zZXQoZ2l0SHViSW5mbywgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdGZpcmVTZXNzaW9uc0NoYW5nZWQoZXZlbnQ/OiBQYXJ0aWFsPElTZXNzaW9uc0NoYW5nZUV2ZW50Pik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogZXZlbnQ/LmFkZGVkID8/IFtdLFxuXHRcdFx0cmVtb3ZlZDogZXZlbnQ/LnJlbW92ZWQgPz8gW10sXG5cdFx0XHRjaGFuZ2VkOiBldmVudD8uY2hhbmdlZCA/PyBbXSxcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBUZXN0U2Vzc2lvbiBpbXBsZW1lbnRzIElTZXNzaW9uIHtcblxuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZCA9ICd0ZXN0Jztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGUgPSAndGVzdCc7XG5cdHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmNvbW1lbnQ7XG5cdHJlYWRvbmx5IGNyZWF0ZWRBdCA9IG5ldyBEYXRlKDApO1xuXHRyZWFkb25seSB0aXRsZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHN0cmluZz4+O1xuXHRyZWFkb25seSB1cGRhdGVkQXQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxEYXRlPj47XG5cdHJlYWRvbmx5IHN0YXR1czogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPFNlc3Npb25TdGF0dXM+Pjtcblx0cmVhZG9ubHkgY2hhbmdlc2V0czogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10+Pjtcblx0cmVhZG9ubHkgY2hhbmdlczogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPj47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgbW9kZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgbG9hZGluZzogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+Pjtcblx0cmVhZG9ubHkgaXNBcmNoaXZlZDogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+Pjtcblx0cmVhZG9ubHkgaXNSZWFkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4+O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4+O1xuXHRyZWFkb25seSBsYXN0VHVybkVuZDogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPERhdGUgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgY2hhdHM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdFtdPj47XG5cdHJlYWRvbmx5IG1haW5DaGF0OiBJT2JzZXJ2YWJsZTxJQ2hhdD47XG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllczogSU9ic2VydmFibGU8SVNlc3Npb25DYXBhYmlsaXRpZXM+ID0gY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSB9KTtcblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBnaXRIdWJJbmZvOiBJR2l0SHViSW5mbyB8IHVuZGVmaW5lZCwgYXJjaGl2ZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLnNlc3Npb25JZCA9IGB0ZXN0OiR7aWR9YDtcblx0XHR0aGlzLnJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JywgcGF0aDogYC8ke2lkfWAgfSk7XG5cdFx0Y29uc3QgZ2l0SHViSW5mb09icyA9IG9ic2VydmFibGVWYWx1ZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4oYHRlc3QuZ2l0SHViSW5mby4ke2lkfWAsIGdpdEh1YkluZm8pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6IGAvd29ya3NwYWNlLyR7aWR9YCB9KTtcblx0XHR0aGlzLnRpdGxlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZz4oYHRlc3QudGl0bGUuJHtpZH1gLCBpZCk7XG5cdFx0dGhpcy51cGRhdGVkQXQgPSBvYnNlcnZhYmxlVmFsdWU8RGF0ZT4oYHRlc3QudXBkYXRlZEF0LiR7aWR9YCwgbmV3IERhdGUoMCkpO1xuXHRcdHRoaXMuc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFNlc3Npb25TdGF0dXM+KGB0ZXN0LnN0YXR1cy4ke2lkfWAsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHR0aGlzLmNoYW5nZXNldHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRbXT4oYHRlc3QuY2hhbmdlc2V0cy4ke2lkfWAsIFtdKTtcblx0XHR0aGlzLmNoYW5nZXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+KGB0ZXN0LmNoYW5nZXMuJHtpZH1gLCBbXSk7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+KGB0ZXN0LndvcmtzcGFjZS4ke2lkfWAsIHtcblx0XHRcdHVyaTogd29ya3NwYWNlVXJpLFxuXHRcdFx0bGFiZWw6IGlkLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRyb290OiB3b3Jrc3BhY2VVcmksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtzcGFjZVVyaSxcblx0XHRcdFx0bmFtZTogaWQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdFJlcG9zaXRvcnk6IHsgdXJpOiB3b3Jrc3BhY2VVcmksIHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsIGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsIGdpdEh1YkluZm86IGdpdEh1YkluZm9PYnMgfSxcblx0XHRcdH1dLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHRoaXMubW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KGB0ZXN0Lm1vZGVsSWQuJHtpZH1gLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMubW9kZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPihgdGVzdC5tb2RlLiR7aWR9YCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxvYWRpbmcgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oYHRlc3QubG9hZGluZy4ke2lkfWAsIGZhbHNlKTtcblx0XHR0aGlzLmlzQXJjaGl2ZWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oYHRlc3QuaXNBcmNoaXZlZC4ke2lkfWAsIGFyY2hpdmVkKTtcblx0XHR0aGlzLmlzUmVhZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPihgdGVzdC5pc1JlYWQuJHtpZH1gLCB0cnVlKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4oYHRlc3QuZGVzY3JpcHRpb24uJHtpZH1gLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMubGFzdFR1cm5FbmQgPSBvYnNlcnZhYmxlVmFsdWU8RGF0ZSB8IHVuZGVmaW5lZD4oYHRlc3QubGFzdFR1cm5FbmQuJHtpZH1gLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgY2hlY2twb2ludHMgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRDaGVja3BvaW50cyB8IHVuZGVmaW5lZD4oYHRlc3QuY2hlY2twb2ludHMuJHtpZH1gLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgbWFpbkNoYXQ6IElDaGF0ID0ge1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRjcmVhdGVkQXQ6IHRoaXMuY3JlYXRlZEF0LFxuXHRcdFx0dGl0bGU6IHRoaXMudGl0bGUsXG5cdFx0XHR1cGRhdGVkQXQ6IHRoaXMudXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiB0aGlzLnN0YXR1cyxcblx0XHRcdGNoYW5nZXM6IHRoaXMuY2hhbmdlcyxcblx0XHRcdGNoZWNrcG9pbnRzLFxuXHRcdFx0bW9kZWxJZDogdGhpcy5tb2RlbElkLFxuXHRcdFx0bW9kZTogdGhpcy5tb2RlLFxuXHRcdFx0aXNBcmNoaXZlZDogdGhpcy5pc0FyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiB0aGlzLmlzUmVhZCxcblx0XHRcdGludGVyYWN0aXZpdHk6IGNvbnN0T2JzZXJ2YWJsZShDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0bGFzdFR1cm5FbmQ6IHRoaXMubGFzdFR1cm5FbmQsXG5cdFx0fTtcblx0XHR0aGlzLm1haW5DaGF0ID0gY29uc3RPYnNlcnZhYmxlKG1haW5DaGF0KTtcblx0XHR0aGlzLmNoYXRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KGB0ZXN0LmNoYXRzLiR7aWR9YCwgW21haW5DaGF0XSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEdpdEh1YlNlcnZpY2UgZXh0ZW5kcyBtb2NrPElHaXRIdWJTZXJ2aWNlPigpIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgVGVzdFB1bGxSZXF1ZXN0TW9kZWw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NpTW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RTdGF0dXNNb2RlbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGhyZWFkTW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RTdGF0dXNNb2RlbD4oKTtcblxuXHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RPYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuYWN0aXZlUFInLCB1bmRlZmluZWQpO1xuXHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RDSU9icyA9IG9ic2VydmFibGVWYWx1ZSgndGVzdC5hY3RpdmVQUkNJJywgdW5kZWZpbmVkKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc09icyA9IG9ic2VydmFibGVWYWx1ZSgndGVzdC5hY3RpdmVQUlJldmlld1RocmVhZHMnLCB1bmRlZmluZWQpO1xuXG5cdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2Uob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogSVJlZmVyZW5jZTxHaXRIdWJQdWxsUmVxdWVzdE1vZGVsPiB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7b3duZXJ9LyR7cmVwb30vJHtwck51bWJlcn1gO1xuXHRcdGxldCBtb2RlbCA9IHRoaXMuX21vZGVscy5nZXQoa2V5KTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IG5ldyBUZXN0UHVsbFJlcXVlc3RNb2RlbCgpO1xuXHRcdFx0dGhpcy5fbW9kZWxzLnNldChrZXksIG1vZGVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZShtb2RlbCBhcyB1bmtub3duIGFzIEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RDSU1vZGVsUmVmZXJlbmNlKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlciwgaGVhZFNoYTogc3RyaW5nKTogSVJlZmVyZW5jZTxHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWw+IHtcblx0XHRjb25zdCBrZXkgPSBgJHtvd25lcn0vJHtyZXBvfS8ke3ByTnVtYmVyfS8ke2hlYWRTaGF9YDtcblx0XHRsZXQgbW9kZWwgPSB0aGlzLl9jaU1vZGVscy5nZXQoa2V5KTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IG5ldyBUZXN0U3RhdHVzTW9kZWwoKTtcblx0XHRcdHRoaXMuX2NpTW9kZWxzLnNldChrZXksIG1vZGVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZShtb2RlbCBhcyB1bmtub3duIGFzIEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGVQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbFJlZmVyZW5jZShvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHByTnVtYmVyOiBudW1iZXIpOiBJUmVmZXJlbmNlPEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsPiB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7b3duZXJ9LyR7cmVwb30vJHtwck51bWJlcn1gO1xuXHRcdGxldCBtb2RlbCA9IHRoaXMuX3RocmVhZE1vZGVscy5nZXQoa2V5KTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IG5ldyBUZXN0U3RhdHVzTW9kZWwoKTtcblx0XHRcdHRoaXMuX3RocmVhZE1vZGVscy5zZXQoa2V5LCBtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UobW9kZWwgYXMgdW5rbm93biBhcyBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbCk7XG5cdH1cblxuXHRzZXRQdWxsUmVxdWVzdERldGFpbHMob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyLCBkZXRhaWxzOiB7IHJlYWRvbmx5IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlOyByZWFkb25seSBpc0RyYWZ0OiBib29sZWFuOyByZWFkb25seSBoZWFkU2hhOiBzdHJpbmcgfSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxzLmdldChgJHtvd25lcn0vJHtyZXBvfS8ke3ByTnVtYmVyfWApO1xuXHRcdG1vZGVsPy5zZXRQdWxsUmVxdWVzdChtYWtlUHVsbFJlcXVlc3QoZGV0YWlscykpO1xuXHR9XG5cblx0c25hcHNob3QoKTogUmVjb3JkPHN0cmluZywgeyBzdGFydFBvbGxpbmdDYWxsczogbnVtYmVyOyBzdG9wUG9sbGluZ0NhbGxzOiBudW1iZXI7IGRpc3Bvc2VDYWxsczogbnVtYmVyIH0+IHtcblx0XHRjb25zdCBlbnRyaWVzID0gWy4uLnRoaXMuX21vZGVscy5lbnRyaWVzKCldLm1hcCgoW2tleSwgbW9kZWxdKSA9PiBba2V5LCB7XG5cdFx0XHRzdGFydFBvbGxpbmdDYWxsczogbW9kZWwuc3RhcnRQb2xsaW5nQ2FsbHMsXG5cdFx0XHRzdG9wUG9sbGluZ0NhbGxzOiBtb2RlbC5zdG9wUG9sbGluZ0NhbGxzLFxuXHRcdFx0ZGlzcG9zZUNhbGxzOiBtb2RlbC5kaXNwb3NlQ2FsbHMsXG5cdFx0fV0gYXMgY29uc3QpO1xuXHRcdHJldHVybiBPYmplY3QuZnJvbUVudHJpZXMoZW50cmllcyk7XG5cdH1cblxuXHRzdGF0dXNNb2RlbFNuYXBzaG90KCk6IHsgY2k6IFJlY29yZDxzdHJpbmcsIHsgc3RhcnRQb2xsaW5nQ2FsbHM6IG51bWJlcjsgcmVmcmVzaENhbGxzOiBudW1iZXIgfT47IHJldmlld1RocmVhZHM6IFJlY29yZDxzdHJpbmcsIHsgc3RhcnRQb2xsaW5nQ2FsbHM6IG51bWJlcjsgcmVmcmVzaENhbGxzOiBudW1iZXIgfT4gfSB7XG5cdFx0Y29uc3QgdG9SZWNvcmQgPSAobW9kZWxzOiBNYXA8c3RyaW5nLCBUZXN0U3RhdHVzTW9kZWw+KSA9PiBPYmplY3QuZnJvbUVudHJpZXMoXG5cdFx0XHRbLi4ubW9kZWxzLmVudHJpZXMoKV0ubWFwKChba2V5LCBtb2RlbF0pID0+IFtrZXksIHsgc3RhcnRQb2xsaW5nQ2FsbHM6IG1vZGVsLnN0YXJ0UG9sbGluZ0NhbGxzLCByZWZyZXNoQ2FsbHM6IG1vZGVsLnJlZnJlc2hDYWxscyB9XSBhcyBjb25zdClcblx0XHQpO1xuXHRcdHJldHVybiB7IGNpOiB0b1JlY29yZCh0aGlzLl9jaU1vZGVscyksIHJldmlld1RocmVhZHM6IHRvUmVjb3JkKHRoaXMuX3RocmVhZE1vZGVscykgfTtcblx0fVxufVxuXG5jbGFzcyBUZXN0UHVsbFJlcXVlc3RNb2RlbCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRzdGFydFBvbGxpbmdDYWxscyA9IDA7XG5cdHN0b3BQb2xsaW5nQ2FsbHMgPSAwO1xuXHRkaXNwb3NlQ2FsbHMgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0ID0gb2JzZXJ2YWJsZVZhbHVlPElHaXRIdWJQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZD4oJ3Rlc3QucHVsbFJlcXVlc3QnLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBwdWxsUmVxdWVzdDogSU9ic2VydmFibGU8SUdpdEh1YlB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPiA9IHRoaXMuX3B1bGxSZXF1ZXN0O1xuXG5cdHNldFB1bGxSZXF1ZXN0KHB1bGxSZXF1ZXN0OiBJR2l0SHViUHVsbFJlcXVlc3QpOiB2b2lkIHtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdC5zZXQocHVsbFJlcXVlc3QsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzdGFydFBvbGxpbmcoKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuc3RhcnRQb2xsaW5nQ2FsbHMrKztcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuc3RvcFBvbGxpbmdDYWxscysrKTtcblx0fVxuXG5cdHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2VDYWxscysrO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RTdGF0dXNNb2RlbCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRzdGFydFBvbGxpbmdDYWxscyA9IDA7XG5cdHJlZnJlc2hDYWxscyA9IDA7XG5cblx0cmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnJlZnJlc2hDYWxscysrO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHN0YXJ0UG9sbGluZygpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5zdGFydFBvbGxpbmdDYWxscysrO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cbn1cblxuZnVuY3Rpb24gbWFrZVB1bGxSZXF1ZXN0KG92ZXJyaWRlczogeyByZWFkb25seSBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZTsgcmVhZG9ubHkgaXNEcmFmdDogYm9vbGVhbjsgcmVhZG9ubHkgaGVhZFNoYTogc3RyaW5nIH0pOiBJR2l0SHViUHVsbFJlcXVlc3Qge1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcjogMSxcblx0XHR0aXRsZTogJycsXG5cdFx0Ym9keTogJycsXG5cdFx0c3RhdGU6IG92ZXJyaWRlcy5zdGF0ZSxcblx0XHRhdXRob3I6IHsgbG9naW46ICcnLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0aGVhZFJlZjogJycsXG5cdFx0aGVhZFNoYTogb3ZlcnJpZGVzLmhlYWRTaGEsXG5cdFx0YmFzZVJlZjogJycsXG5cdFx0aXNEcmFmdDogb3ZlcnJpZGVzLmlzRHJhZnQsXG5cdFx0Y3JlYXRlZEF0OiAnJyxcblx0XHR1cGRhdGVkQXQ6ICcnLFxuXHRcdG1lcmdlZEF0OiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VhYmxlOiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VhYmxlU3RhdGU6ICcnLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlR2l0SHViSW5mbyhwck51bWJlcjogbnVtYmVyKTogSUdpdEh1YkluZm8ge1xuXHRyZXR1cm4ge1xuXHRcdG93bmVyOiAnb3duZXInLFxuXHRcdHJlcG86ICdyZXBvJyxcblx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0bnVtYmVyOiBwck51bWJlcixcblx0XHRcdHVyaTogVVJJLnBhcnNlKGBodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLyR7cHJOdW1iZXJ9YCksXG5cdFx0fSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUUvQixTQUFTLGlCQUE4QixtQkFBK0Isb0JBQW9CO0FBQzFGLFNBQVMsaUJBQW1ELHVCQUF1QjtBQUNuRixTQUFTLHNCQUFzQjtBQUkvQixTQUFTLDhCQUFrRDtBQUMzRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsNENBQTRDO0FBRXJELFNBQVMsbUJBQW1KLHFCQUFxQjtBQUlqTCxNQUFNLHdDQUF3QyxNQUFNO0FBRW5ELFFBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxRQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxnQ0FBNEIsSUFBSSw4QkFBOEIsS0FBSztBQUNuRSxvQkFBZ0IsZ0JBQTRDLHNCQUFzQixNQUFTO0FBQzNGLHNCQUFrQixJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLE1BQXZDO0FBQUE7QUFDckIsYUFBa0IsZ0JBQWdCO0FBQUE7QUFBQSxJQUNuQztBQUNBLG9CQUFnQixJQUFJLGtCQUFrQjtBQUFBLEVBQ3ZDLENBQUM7QUFFRCxXQUFTLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFFNUIsMENBQXdDO0FBRXhDLE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxrQkFBa0IsMEJBQTBCLFdBQVcsWUFBWSxlQUFlLENBQUMsQ0FBQztBQUUxRixVQUFNLElBQUksSUFBSSxxQ0FBcUMsZUFBZSwyQkFBMkIsaUJBQWlCLFVBQVUsQ0FBQztBQUV6SCxVQUFNLGVBQWUsMEJBQTBCLFdBQVcsU0FBUyxlQUFlLENBQUMsQ0FBQztBQUNwRiw4QkFBMEIsb0JBQW9CLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO0FBRXZFLFdBQU8sZ0JBQWdCLGNBQWMsU0FBUyxHQUFHO0FBQUEsTUFDaEQsZ0JBQWdCLEVBQUUsbUJBQW1CLEdBQUcsa0JBQWtCLEdBQUcsY0FBYyxFQUFFO0FBQUEsTUFDN0UsZ0JBQWdCLEVBQUUsbUJBQW1CLEdBQUcsa0JBQWtCLEdBQUcsY0FBYyxFQUFFO0FBQUEsSUFDOUUsQ0FBQztBQUNELFdBQU8sWUFBWSxnQkFBZ0IsV0FBVyxJQUFJLEdBQUcsS0FBSztBQUFBLEVBQzNELENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sVUFBVSwwQkFBMEIsV0FBVyxXQUFXLGVBQWUsQ0FBQyxDQUFDO0FBQ2pGLFVBQU0sSUFBSSxJQUFJLHFDQUFxQyxlQUFlLDJCQUEyQixpQkFBaUIsVUFBVSxDQUFDO0FBRXpILDhCQUEwQixZQUFZLFNBQVMsSUFBSTtBQUNuRCw4QkFBMEIsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBRXBFLFdBQU8sZ0JBQWdCLGNBQWMsU0FBUyxHQUFHO0FBQUEsTUFDaEQsZ0JBQWdCLEVBQUUsbUJBQW1CLEdBQUcsa0JBQWtCLEdBQUcsY0FBYyxFQUFFO0FBQUEsSUFDOUUsQ0FBQztBQUVELDhCQUEwQixZQUFZLFNBQVMsS0FBSztBQUNwRCw4QkFBMEIsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBRXBFLFdBQU8sZ0JBQWdCLGNBQWMsU0FBUyxHQUFHO0FBQUEsTUFDaEQsZ0JBQWdCLEVBQUUsbUJBQW1CLEdBQUcsa0JBQWtCLEdBQUcsY0FBYyxFQUFFO0FBQUEsSUFDOUUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsVUFBTSxVQUFVLDBCQUEwQixXQUFXLFdBQVcsZUFBZSxDQUFDLEdBQUcsSUFBSTtBQUN2RixVQUFNLElBQUksSUFBSSxxQ0FBcUMsZUFBZSwyQkFBMkIsaUJBQWlCLFVBQVUsQ0FBQztBQUV6SCxXQUFPLGdCQUFnQixjQUFjLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFbkQsOEJBQTBCLFlBQVksU0FBUyxLQUFLO0FBQ3BELDhCQUEwQixvQkFBb0IsRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7QUFFcEUsV0FBTyxnQkFBZ0IsY0FBYyxTQUFTLEdBQUc7QUFBQSxNQUNoRCxnQkFBZ0IsRUFBRSxtQkFBbUIsR0FBRyxrQkFBa0IsR0FBRyxjQUFjLEVBQUU7QUFBQSxJQUM5RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLFVBQVUsMEJBQTBCLFdBQVcsV0FBVyxlQUFlLENBQUMsQ0FBQztBQUNqRixVQUFNLGVBQWUsTUFBTSxJQUFJLElBQUkscUNBQXFDLGVBQWUsMkJBQTJCLGlCQUFpQixVQUFVLENBQUM7QUFFOUksaUJBQWEsUUFBUTtBQUVyQixXQUFPLGdCQUFnQixjQUFjLFNBQVMsR0FBRztBQUFBLE1BQ2hELGdCQUFnQixFQUFFLG1CQUFtQixHQUFHLGtCQUFrQixHQUFHLGNBQWMsRUFBRTtBQUFBLElBQzlFLENBQUM7QUFDRCxXQUFPLFlBQVksUUFBUSxXQUFXLElBQUksR0FBRyxLQUFLO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsOEJBQTBCLFdBQVcsV0FBVyxlQUFlLENBQUMsQ0FBQztBQUNqRSxVQUFNLElBQUksSUFBSSxxQ0FBcUMsZUFBZSwyQkFBMkIsaUJBQWlCLFVBQVUsQ0FBQztBQUd6SCxXQUFPLGdCQUFnQixjQUFjLG9CQUFvQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQztBQUV6RixrQkFBYyxzQkFBc0IsU0FBUyxRQUFRLEdBQUcsRUFBRSxPQUFPLHVCQUF1QixNQUFNLFNBQVMsT0FBTyxTQUFTLE9BQU8sQ0FBQztBQUUvSCxXQUFPLGdCQUFnQixjQUFjLG9CQUFvQixHQUFHO0FBQUEsTUFDM0QsSUFBSSxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixHQUFHLGNBQWMsRUFBRSxFQUFFO0FBQUEsTUFDckUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixHQUFHLGNBQWMsRUFBRSxFQUFFO0FBQUEsSUFDNUUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUVBQXFFLE1BQU07QUFDL0UsOEJBQTBCLFdBQVcsV0FBVyxlQUFlLENBQUMsQ0FBQztBQUNqRSxVQUFNLElBQUksSUFBSSxxQ0FBcUMsZUFBZSwyQkFBMkIsaUJBQWlCLFVBQVUsQ0FBQztBQUV6SCxrQkFBYyxzQkFBc0IsU0FBUyxRQUFRLEdBQUcsRUFBRSxPQUFPLHVCQUF1QixNQUFNLFNBQVMsTUFBTSxTQUFTLE9BQU8sQ0FBQztBQUU5SCxXQUFPLGdCQUFnQixjQUFjLG9CQUFvQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQztBQUFBLEVBQzFGLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBRzlFLFVBQU0sVUFBVSwwQkFBMEIsV0FBVyxTQUFTLEVBQUUsT0FBTyxTQUFTLE1BQU0sT0FBTyxDQUFDO0FBQzlGLFVBQU0sSUFBSSxJQUFJLHFDQUFxQyxlQUFlLDJCQUEyQixpQkFBaUIsVUFBVSxDQUFDO0FBR3pILFdBQU8sZ0JBQWdCLGNBQWMsU0FBUyxHQUFHLENBQUMsQ0FBQztBQUduRCw4QkFBMEIsY0FBYyxTQUFTLGVBQWUsQ0FBQyxDQUFDO0FBRWxFLFdBQU8sZ0JBQWdCLGNBQWMsU0FBUyxHQUFHO0FBQUEsTUFDaEQsZ0JBQWdCLEVBQUUsbUJBQW1CLEdBQUcsa0JBQWtCLEdBQUcsY0FBYyxFQUFFO0FBQUEsSUFDOUUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxVQUFVLDBCQUEwQixXQUFXLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDakYsVUFBTSxJQUFJLElBQUkscUNBQXFDLGVBQWUsMkJBQTJCLGlCQUFpQixVQUFVLENBQUM7QUFHekgsa0JBQWMsc0JBQXNCLFNBQVMsUUFBUSxHQUFHLEVBQUUsT0FBTyx1QkFBdUIsTUFBTSxTQUFTLE9BQU8sU0FBUyxPQUFPLENBQUM7QUFDL0gsV0FBTyxnQkFBZ0IsY0FBYyxTQUFTLEdBQUc7QUFBQSxNQUNoRCxnQkFBZ0IsRUFBRSxtQkFBbUIsR0FBRyxrQkFBa0IsR0FBRyxjQUFjLEVBQUU7QUFBQSxJQUM5RSxDQUFDO0FBSUQsa0JBQWMsc0JBQXNCLFNBQVMsUUFBUSxHQUFHLEVBQUUsT0FBTyx1QkFBdUIsUUFBUSxTQUFTLE9BQU8sU0FBUyxPQUFPLENBQUM7QUFDakksV0FBTyxnQkFBZ0IsY0FBYyxTQUFTLEdBQUc7QUFBQSxNQUNoRCxnQkFBZ0IsRUFBRSxtQkFBbUIsR0FBRyxrQkFBa0IsR0FBRyxjQUFjLEVBQUU7QUFBQSxJQUM5RSxDQUFDO0FBR0Qsa0JBQWMsSUFBSSxTQUFzQyxNQUFTO0FBQ2pFLFdBQU8sZ0JBQWdCLGNBQWMsU0FBUyxHQUFHO0FBQUEsTUFDaEQsZ0JBQWdCLEVBQUUsbUJBQW1CLEdBQUcsa0JBQWtCLEdBQUcsY0FBYyxFQUFFO0FBQUEsSUFDOUUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLHNDQUFzQyxLQUFpQyxFQUFFO0FBQUEsRUFPOUUsWUFBWSxhQUE4QjtBQUN6QyxVQUFNO0FBTFAsU0FBaUIsWUFBWSxvQkFBSSxJQUFzQjtBQU10RCxTQUFLLHVCQUF1QixZQUFZLElBQUksSUFBSSxRQUE4QixDQUFDO0FBQy9FLFNBQUssc0JBQXNCLEtBQUsscUJBQXFCO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLFdBQVcsSUFBWSxZQUFxQyxXQUFXLE9BQWlCO0FBQ3ZGLFVBQU0sVUFBVSxJQUFJLFlBQVksSUFBSSxZQUFZLFFBQVE7QUFDeEQsU0FBSyxVQUFVLElBQUksUUFBUSxXQUFXLE9BQU87QUFDN0MsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsU0FBeUI7QUFDdEMsU0FBSyxVQUFVLE9BQU8sUUFBUSxTQUFTO0FBQ3ZDLFNBQUssb0JBQW9CLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLFlBQVksU0FBbUIsVUFBeUI7QUFDdkQsSUFBQyxRQUFRLFdBQTJELElBQUksVUFBVSxNQUFTO0FBQUEsRUFDNUY7QUFBQSxFQUVBLGNBQWMsU0FBbUIsWUFBMkM7QUFDM0UsVUFBTSxZQUFZLFFBQVEsVUFBVSxJQUFJO0FBQ3hDLFVBQU0sU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUNuQyxRQUFJLFFBQVE7QUFDWCxNQUFDLE9BQU8sY0FBZSxXQUEyRSxJQUFJLFlBQVksTUFBUztBQUFBLElBQzVIO0FBQUEsRUFDRDtBQUFBLEVBRVMsY0FBMEI7QUFDbEMsV0FBTyxDQUFDLEdBQUcsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUFBLEVBQ25DO0FBQUEsRUFFQSxvQkFBb0IsT0FBNkM7QUFDaEUsU0FBSyxxQkFBcUIsS0FBSztBQUFBLE1BQzlCLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFBQSxNQUN4QixTQUFTLE9BQU8sV0FBVyxDQUFDO0FBQUEsTUFDNUIsU0FBUyxPQUFPLFdBQVcsQ0FBQztBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFFQSxNQUFNLFlBQWdDO0FBQUEsRUF5QnJDLFlBQVksSUFBWSxZQUFxQyxVQUFtQjtBQXJCaEYsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsY0FBYztBQUN2QixTQUFTLE9BQU8sUUFBUTtBQUN4QixTQUFTLFlBQVksb0JBQUksS0FBSyxDQUFDO0FBZ0IvQixTQUFTLGVBQWtELGdCQUFnQixFQUFFLHVCQUF1QixNQUFNLENBQUM7QUFHMUcsU0FBSyxZQUFZLFFBQVEsRUFBRTtBQUMzQixTQUFLLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLE1BQU0sSUFBSSxFQUFFLEdBQUcsQ0FBQztBQUMzRCxVQUFNLGdCQUFnQixnQkFBeUMsbUJBQW1CLEVBQUUsSUFBSSxVQUFVO0FBQ2xHLFVBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsTUFBTSxjQUFjLEVBQUUsR0FBRyxDQUFDO0FBQzFFLFNBQUssUUFBUSxnQkFBd0IsY0FBYyxFQUFFLElBQUksRUFBRTtBQUMzRCxTQUFLLFlBQVksZ0JBQXNCLGtCQUFrQixFQUFFLElBQUksb0JBQUksS0FBSyxDQUFDLENBQUM7QUFDMUUsU0FBSyxTQUFTLGdCQUErQixlQUFlLEVBQUUsSUFBSSxjQUFjLFNBQVM7QUFDekYsU0FBSyxhQUFhLGdCQUE4QyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMzRixTQUFLLFVBQVUsZ0JBQStDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3RGLFNBQUssWUFBWSxnQkFBK0Msa0JBQWtCLEVBQUUsSUFBSTtBQUFBLE1BQ3ZGLEtBQUs7QUFBQSxNQUNMLE9BQU87QUFBQSxNQUNQLE1BQU0sUUFBUTtBQUFBLE1BQ2QsU0FBUyxDQUFDO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixrQkFBa0I7QUFBQSxRQUNsQixNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixlQUFlLEVBQUUsS0FBSyxjQUFjLGFBQWEsUUFBVyxnQkFBZ0IsUUFBVyxZQUFZLGNBQWM7QUFBQSxNQUNsSCxDQUFDO0FBQUEsTUFDRCx3QkFBd0I7QUFBQSxNQUN4QixvQkFBb0I7QUFBQSxJQUNyQixDQUFDO0FBQ0QsU0FBSyxVQUFVLGdCQUFvQyxnQkFBZ0IsRUFBRSxJQUFJLE1BQVM7QUFDbEYsU0FBSyxPQUFPLGdCQUE0RSxhQUFhLEVBQUUsSUFBSSxNQUFTO0FBQ3BILFNBQUssVUFBVSxnQkFBeUIsZ0JBQWdCLEVBQUUsSUFBSSxLQUFLO0FBQ25FLFNBQUssYUFBYSxnQkFBeUIsbUJBQW1CLEVBQUUsSUFBSSxRQUFRO0FBQzVFLFNBQUssU0FBUyxnQkFBeUIsZUFBZSxFQUFFLElBQUksSUFBSTtBQUNoRSxTQUFLLGNBQWMsZ0JBQTZDLG9CQUFvQixFQUFFLElBQUksTUFBUztBQUNuRyxTQUFLLGNBQWMsZ0JBQWtDLG9CQUFvQixFQUFFLElBQUksTUFBUztBQUV4RixVQUFNLGNBQWMsZ0JBQThDLG9CQUFvQixFQUFFLElBQUksTUFBUztBQUVyRyxVQUFNLFdBQWtCO0FBQUEsTUFDdkIsVUFBVSxLQUFLO0FBQUEsTUFDZixXQUFXLEtBQUs7QUFBQSxNQUNoQixPQUFPLEtBQUs7QUFBQSxNQUNaLFdBQVcsS0FBSztBQUFBLE1BQ2hCLFFBQVEsS0FBSztBQUFBLE1BQ2IsU0FBUyxLQUFLO0FBQUEsTUFDZDtBQUFBLE1BQ0EsU0FBUyxLQUFLO0FBQUEsTUFDZCxNQUFNLEtBQUs7QUFBQSxNQUNYLFlBQVksS0FBSztBQUFBLE1BQ2pCLFFBQVEsS0FBSztBQUFBLE1BQ2IsZUFBZSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFBQSxNQUNyRCxhQUFhLEtBQUs7QUFBQSxNQUNsQixhQUFhLEtBQUs7QUFBQSxJQUNuQjtBQUNBLFNBQUssV0FBVyxnQkFBZ0IsUUFBUTtBQUN4QyxTQUFLLFFBQVEsZ0JBQWtDLGNBQWMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDO0FBQUEsRUFDOUU7QUFDRDtBQUVBLE1BQU0sMEJBQTBCLEtBQXFCLEVBQUU7QUFBQSxFQUF2RDtBQUFBO0FBRUMsU0FBaUIsVUFBVSxvQkFBSSxJQUFrQztBQUNqRSxTQUFpQixZQUFZLG9CQUFJLElBQTZCO0FBQzlELFNBQWlCLGdCQUFnQixvQkFBSSxJQUE2QjtBQUVsRSxTQUFrQiw4QkFBOEIsZ0JBQWdCLGlCQUFpQixNQUFTO0FBQzFGLFNBQWtCLGdDQUFnQyxnQkFBZ0IsbUJBQW1CLE1BQVM7QUFDOUYsU0FBa0IsMkNBQTJDLGdCQUFnQiw4QkFBOEIsTUFBUztBQUFBO0FBQUEsRUFFM0csZ0NBQWdDLE9BQWUsTUFBYyxVQUFzRDtBQUMzSCxVQUFNLE1BQU0sR0FBRyxLQUFLLElBQUksSUFBSSxJQUFJLFFBQVE7QUFDeEMsUUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLEdBQUc7QUFDaEMsUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRLElBQUkscUJBQXFCO0FBQ2pDLFdBQUssUUFBUSxJQUFJLEtBQUssS0FBSztBQUFBLElBQzVCO0FBQ0EsV0FBTyxJQUFJLGtCQUFrQixLQUEwQztBQUFBLEVBQ3hFO0FBQUEsRUFFUyxrQ0FBa0MsT0FBZSxNQUFjLFVBQWtCLFNBQXVEO0FBQ2hKLFVBQU0sTUFBTSxHQUFHLEtBQUssSUFBSSxJQUFJLElBQUksUUFBUSxJQUFJLE9BQU87QUFDbkQsUUFBSSxRQUFRLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFDbEMsUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRLElBQUksZ0JBQWdCO0FBQzVCLFdBQUssVUFBVSxJQUFJLEtBQUssS0FBSztBQUFBLElBQzlCO0FBQ0EsV0FBTyxJQUFJLGtCQUFrQixLQUE0QztBQUFBLEVBQzFFO0FBQUEsRUFFUyw2Q0FBNkMsT0FBZSxNQUFjLFVBQW1FO0FBQ3JKLFVBQU0sTUFBTSxHQUFHLEtBQUssSUFBSSxJQUFJLElBQUksUUFBUTtBQUN4QyxRQUFJLFFBQVEsS0FBSyxjQUFjLElBQUksR0FBRztBQUN0QyxRQUFJLENBQUMsT0FBTztBQUNYLGNBQVEsSUFBSSxnQkFBZ0I7QUFDNUIsV0FBSyxjQUFjLElBQUksS0FBSyxLQUFLO0FBQUEsSUFDbEM7QUFDQSxXQUFPLElBQUksa0JBQWtCLEtBQXVEO0FBQUEsRUFDckY7QUFBQSxFQUVBLHNCQUFzQixPQUFlLE1BQWMsVUFBa0IsU0FBZ0g7QUFDcEwsVUFBTSxRQUFRLEtBQUssUUFBUSxJQUFJLEdBQUcsS0FBSyxJQUFJLElBQUksSUFBSSxRQUFRLEVBQUU7QUFDN0QsV0FBTyxlQUFlLGdCQUFnQixPQUFPLENBQUM7QUFBQSxFQUMvQztBQUFBLEVBRUEsV0FBMEc7QUFDekcsVUFBTSxVQUFVLENBQUMsR0FBRyxLQUFLLFFBQVEsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxLQUFLO0FBQUEsTUFDdkUsbUJBQW1CLE1BQU07QUFBQSxNQUN6QixrQkFBa0IsTUFBTTtBQUFBLE1BQ3hCLGNBQWMsTUFBTTtBQUFBLElBQ3JCLENBQUMsQ0FBVTtBQUNYLFdBQU8sT0FBTyxZQUFZLE9BQU87QUFBQSxFQUNsQztBQUFBLEVBRUEsc0JBQXVMO0FBQ3RMLFVBQU0sV0FBVyxDQUFDLFdBQXlDLE9BQU87QUFBQSxNQUNqRSxDQUFDLEdBQUcsT0FBTyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssTUFBTSxDQUFDLEtBQUssRUFBRSxtQkFBbUIsTUFBTSxtQkFBbUIsY0FBYyxNQUFNLGFBQWEsQ0FBQyxDQUFVO0FBQUEsSUFDN0k7QUFDQSxXQUFPLEVBQUUsSUFBSSxTQUFTLEtBQUssU0FBUyxHQUFHLGVBQWUsU0FBUyxLQUFLLGFBQWEsRUFBRTtBQUFBLEVBQ3BGO0FBQ0Q7QUFFQSxNQUFNLHFCQUE0QztBQUFBLEVBQWxEO0FBRUMsNkJBQW9CO0FBQ3BCLDRCQUFtQjtBQUNuQix3QkFBZTtBQUVmLFNBQWlCLGVBQWUsZ0JBQWdELG9CQUFvQixNQUFTO0FBQzdHLFNBQVMsY0FBMkQsS0FBSztBQUFBO0FBQUEsRUFFekUsZUFBZSxhQUF1QztBQUNyRCxTQUFLLGFBQWEsSUFBSSxhQUFhLE1BQVM7QUFBQSxFQUM3QztBQUFBLEVBRUEsZUFBNEI7QUFDM0IsU0FBSztBQUNMLFdBQU8sYUFBYSxNQUFNLEtBQUssa0JBQWtCO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLFVBQXlCO0FBQ3hCLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFDeEI7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSztBQUFBLEVBQ047QUFDRDtBQUVBLE1BQU0sZ0JBQXVDO0FBQUEsRUFBN0M7QUFFQyw2QkFBb0I7QUFDcEIsd0JBQWU7QUFBQTtBQUFBLEVBRWYsVUFBeUI7QUFDeEIsU0FBSztBQUNMLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFDeEI7QUFBQSxFQUVBLGVBQTRCO0FBQzNCLFNBQUs7QUFDTCxXQUFPLGFBQWEsTUFBTTtBQUFBLElBQUUsQ0FBQztBQUFBLEVBQzlCO0FBQUEsRUFFQSxVQUFnQjtBQUFBLEVBQUU7QUFDbkI7QUFFQSxTQUFTLGdCQUFnQixXQUFnSTtBQUN4SixTQUFPO0FBQUEsSUFDTixRQUFRO0FBQUEsSUFDUixPQUFPO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixPQUFPLFVBQVU7QUFBQSxJQUNqQixRQUFRLEVBQUUsT0FBTyxJQUFJLFdBQVcsR0FBRztBQUFBLElBQ25DLFNBQVM7QUFBQSxJQUNULFNBQVMsVUFBVTtBQUFBLElBQ25CLFNBQVM7QUFBQSxJQUNULFNBQVMsVUFBVTtBQUFBLElBQ25CLFdBQVc7QUFBQSxJQUNYLFdBQVc7QUFBQSxJQUNYLFVBQVU7QUFBQSxJQUNWLFdBQVc7QUFBQSxJQUNYLGdCQUFnQjtBQUFBLEVBQ2pCO0FBQ0Q7QUFFQSxTQUFTLGVBQWUsVUFBK0I7QUFDdEQsU0FBTztBQUFBLElBQ04sT0FBTztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sYUFBYTtBQUFBLE1BQ1osUUFBUTtBQUFBLE1BQ1IsS0FBSyxJQUFJLE1BQU0sc0NBQXNDLFFBQVEsRUFBRTtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
