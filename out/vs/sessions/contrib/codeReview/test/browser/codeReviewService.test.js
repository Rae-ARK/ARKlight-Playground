import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { URI } from "../../../../../base/common/uri.js";
import { derived, observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { DisposableStore, ImmortalReference } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from "../../../../../workbench/common/contextkeys.js";
import { Menus } from "../../../../browser/menus.js";
import { SessionHasChangesContext, SessionIsCreatedContext, SinglePaneLayoutEnabledContext } from "../../../../common/contextkeys.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { GitHubPullRequestReviewThreadsModel } from "../../../github/browser/models/githubPullRequestReviewThreadsModel.js";
import { SessionChangesEditorInput } from "../../../changes/browser/sessionChangesEditorInput.js";
import { CodeReviewService, PRReviewStateKind } from "../../browser/codeReviewService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import "../../browser/codeReview.contributions.js";
suite("CodeReviewService", () => {
  const store = new DisposableStore();
  let instantiationService;
  let service;
  let gitHubService;
  let sessionsManagement;
  let session;
  class MockSessionsManagementService extends mock() {
    constructor(disposables) {
      super();
      this._sessions = /* @__PURE__ */ new Map();
      this._onDidChangeSessions = disposables.add(new Emitter());
      this.onDidChangeSessions = this._onDidChangeSessions.event;
      this._activeSession = observableValue("test.activeSession", void 0);
      this.activeSession = this._activeSession;
    }
    getSession(resource) {
      return this._sessions.get(resource.toString());
    }
    addSession(resource, changes, archived = false) {
      const changesObs = observableValue(
        "test.changes",
        (changes ?? []).map((c) => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions }))
      );
      const isArchivedObs = observableValue("test.isArchived", archived);
      const gitHubInfoObs = observableValue("test.gitHubInfo", void 0);
      const workspaceUri = URI.file("/workspace");
      const workspaceObs = observableValue("test.workspace", {
        uri: workspaceUri,
        label: "workspace",
        icon: Codicon.folder,
        folders: [{
          root: workspaceUri,
          workingDirectory: workspaceUri,
          name: "workspace",
          description: void 0,
          gitRepository: { uri: workspaceUri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: gitHubInfoObs }
        }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      });
      const sessionData = {
        sessionId: `test:${resource.toString()}`,
        resource,
        workspace: workspaceObs,
        changes: changesObs,
        isArchived: isArchivedObs
      };
      this._sessions.set(resource.toString(), sessionData);
      return sessionData;
    }
    setGitHubInfo(resource, gitHubInfo) {
      const session2 = this._sessions.get(resource.toString());
      if (session2) {
        const workspace = session2.workspace.get();
        const folder = workspace?.folders[0];
        if (folder) {
          folder.gitRepository.gitHubInfo.set(gitHubInfo, void 0);
        }
      }
    }
    setActiveSession(session2) {
      this._activeSession.set(session2, void 0);
    }
    updateSessionChanges(resource, changes) {
      const session2 = this._sessions.get(resource.toString());
      if (session2) {
        const obs = session2.changes;
        obs.set(
          (changes ?? []).map((c) => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions })),
          void 0
        );
      }
    }
    removeSession(resource) {
      this._sessions.delete(resource.toString());
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
  class MockReviewThreadsFetcher {
    constructor() {
      this.nextThreads = [];
      this.getReviewThreadsCalls = 0;
      this.resolveThreadCalls = [];
    }
    async getReviewThreads(_owner, _repo, _prNumber) {
      this.getReviewThreadsCalls++;
      return this.nextThreads;
    }
    async postReviewComment(_owner, _repo, _prNumber, body, inReplyTo) {
      return makePRComment(inReplyTo, body);
    }
    async resolveThread(_owner, _repo, threadId) {
      this.resolveThreadCalls.push({ threadId });
    }
  }
  class MockGitHubService extends mock() {
    constructor(sessionsManagementService) {
      super();
      this.legacyFetcher = new MockReviewThreadsFetcher();
      this.reviewThreadsFetcher = new MockReviewThreadsFetcher();
      this._reviewThreadsModels = /* @__PURE__ */ new Map();
      this._reviewThreadsFetchers = /* @__PURE__ */ new Map();
      this.getPullRequestCalls = 0;
      this.getPullRequestReviewThreadsCalls = 0;
      this._reviewThreadsFetchers.set(this._key("owner", "repo", 1), this.reviewThreadsFetcher);
      this.activeSessionPullRequestReviewThreadsObs = derived((reader) => {
        const session2 = sessionsManagementService.activeSession.read(reader);
        const gitHubInfo = session2?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
        if (!gitHubInfo?.pullRequest) {
          return void 0;
        }
        return this.getReviewThreadsModel(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
      });
    }
    getReviewThreadsFetcher(owner, repo, prNumber) {
      const key = this._key(owner, repo, prNumber);
      let fetcher = this._reviewThreadsFetchers.get(key);
      if (!fetcher) {
        fetcher = new MockReviewThreadsFetcher();
        this._reviewThreadsFetchers.set(key, fetcher);
      }
      return fetcher;
    }
    getReviewThreadsModel(owner, repo, prNumber) {
      const key = this._key(owner, repo, prNumber);
      let model = this._reviewThreadsModels.get(key);
      if (!model) {
        model = store.add(new GitHubPullRequestReviewThreadsModel(owner, repo, prNumber, this.getReviewThreadsFetcher(owner, repo, prNumber), new NullLogService()));
        this._reviewThreadsModels.set(key, model);
      }
      return model;
    }
    createPullRequestReviewThreadsModelReference(owner, repo, prNumber) {
      this.getPullRequestReviewThreadsCalls++;
      return new ImmortalReference(this.getReviewThreadsModel(owner, repo, prNumber));
    }
    _key(owner, repo, prNumber) {
      return `${owner}/${repo}#${prNumber}`;
    }
  }
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    const logService = new NullLogService();
    instantiationService.stub(ILogService, logService);
    sessionsManagement = new MockSessionsManagementService(store);
    instantiationService.stub(ISessionsManagementService, sessionsManagement);
    instantiationService.stub(ISessionsService, { activeSession: sessionsManagement.activeSession });
    gitHubService = new MockGitHubService(sessionsManagement);
    instantiationService.stub(IGitHubService, gitHubService);
    service = store.add(instantiationService.createInstance(CodeReviewService));
    session = URI.parse("test://session/1");
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("PR review state uses dedicated review threads model", async () => {
    sessionsManagement.addSession(session);
    sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
    gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread("thread-100", "src/a.ts")];
    sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
    await tick();
    await gitHubService.getReviewThreadsModel("owner", "repo", 1).refresh();
    await tick();
    const state = service.getPRReviewState(session).get();
    assert.strictEqual(state.kind, PRReviewStateKind.Loaded);
    if (state.kind === PRReviewStateKind.Loaded) {
      assert.deepStrictEqual({
        comments: state.comments.map((comment) => ({ id: comment.id, uri: comment.uri.toString(), body: comment.body, author: comment.author })),
        getPullRequestCalls: gitHubService.getPullRequestCalls,
        getPullRequestReviewThreadsCalls: gitHubService.getPullRequestReviewThreadsCalls,
        legacyThreadRefreshes: gitHubService.legacyFetcher.getReviewThreadsCalls,
        reviewThreadRefreshes: gitHubService.reviewThreadsFetcher.getReviewThreadsCalls
      }, {
        comments: [{ id: "thread-100", uri: "file:///workspace/src/a.ts", body: "Comment on src/a.ts", author: "reviewer" }],
        getPullRequestCalls: 0,
        getPullRequestReviewThreadsCalls: 0,
        legacyThreadRefreshes: 0,
        reviewThreadRefreshes: 1
      });
    }
  });
  test("resolvePRReviewThread uses dedicated review threads model", async () => {
    sessionsManagement.addSession(session);
    sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
    await service.resolvePRReviewThread(session, "thread-100");
    assert.deepStrictEqual({
      getPullRequestCalls: gitHubService.getPullRequestCalls,
      getPullRequestReviewThreadsCalls: gitHubService.getPullRequestReviewThreadsCalls,
      legacyResolveThreadCalls: gitHubService.legacyFetcher.resolveThreadCalls,
      reviewResolveThreadCalls: gitHubService.reviewThreadsFetcher.resolveThreadCalls
    }, {
      getPullRequestCalls: 0,
      getPullRequestReviewThreadsCalls: 1,
      legacyResolveThreadCalls: [],
      reviewResolveThreadCalls: [{ threadId: "thread-100" }]
    });
  });
  test("dismissPRReviewComment filters the comment from the loaded review state", async () => {
    sessionsManagement.addSession(session);
    sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
    gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread("thread-100", "src/a.ts"), makePRThread("thread-200", "src/b.ts")];
    sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
    await tick();
    await gitHubService.getReviewThreadsModel("owner", "repo", 1).refresh();
    await tick();
    service.dismissPRReviewComment(session, "thread-100");
    const state = service.getPRReviewState(session).get();
    assert.deepStrictEqual(
      state.kind === PRReviewStateKind.Loaded ? state.comments.map((c) => c.id) : state.kind,
      ["thread-200"]
    );
  });
});
suite("Code Review Contributions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Run Code Review is shown in the single-pane Changes header only for created sessions with changes", () => {
    const item = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderPrimary).filter(isIMenuItem).find((item2) => item2.command.id === "sessions.codeReview.run");
    assert.ok(item, "expected Run Code Review action on the single-pane Changes editor header");
    const when = item.when?.serialize() ?? "";
    assert.deepStrictEqual({
      group: item.group,
      order: item.order,
      hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
      hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditorInput.EDITOR_ID),
      hasSinglePaneLayoutGate: when.includes(SinglePaneLayoutEnabledContext.key),
      hasAuxiliaryWindowGate: when.includes(IsAuxiliaryWindowContext.key),
      hasTopRightEditorGroupGate: when.includes(IsTopRightEditorGroupContext.key),
      hasChangesGate: when.includes(SessionHasChangesContext.key),
      hasCreatedGate: when.includes(SessionIsCreatedContext.key)
    }, {
      group: "1_codeReview",
      order: 1,
      hasSessionsWindowGate: true,
      hasActiveEditorGate: true,
      hasSinglePaneLayoutGate: true,
      hasAuxiliaryWindowGate: true,
      hasTopRightEditorGroupGate: true,
      hasChangesGate: true,
      hasCreatedGate: true
    });
  });
  test("Run Code Review is shown in the classic Changes toolbar only for created sessions", () => {
    const item = MenuRegistry.getMenuItems(MenuId.AgentsChangesToolbar).filter(isIMenuItem).find((item2) => item2.command.id === "sessions.codeReview.run");
    assert.ok(item, "expected Run Code Review action on the classic Changes toolbar");
    assert.strictEqual(
      item.when?.serialize().includes(SessionIsCreatedContext.key),
      true
    );
  });
});
function makeGitHubInfo(prNumber = 1) {
  return {
    owner: "owner",
    repo: "repo",
    pullRequest: {
      number: prNumber,
      uri: URI.parse(`https://github.com/owner/repo/pull/${prNumber}`)
    }
  };
}
function makePRThread(id, path) {
  return {
    id,
    isResolved: false,
    path,
    line: 10,
    comments: [makePRComment(100, `Comment on ${path}`, id)]
  };
}
function makePRComment(id, body, threadId = String(id)) {
  return {
    id,
    body,
    author: { login: "reviewer", avatarUrl: "" },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    path: void 0,
    line: void 0,
    threadId,
    inReplyToId: void 0
  };
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY29kZVJldmlldy90ZXN0L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGRlcml2ZWQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSW1tb3J0YWxSZWZlcmVuY2UsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UsIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkhhc0NoYW5nZXNDb250ZXh0LCBTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQUkZldGNoZXIgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9mZXRjaGVycy9naXRodWJQUkZldGNoZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9tb2RlbHMvZ2l0aHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlBSQ29tbWVudCwgSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUdpdEh1YkluZm8sIElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDb2RlUmV2aWV3U2VydmljZSwgQ29kZVJldmlld1NlcnZpY2UsIFBSUmV2aWV3U3RhdGVLaW5kIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0ICcuLi8uLi9icm93c2VyL2NvZGVSZXZpZXcuY29udHJpYnV0aW9ucy5qcyc7XG5cbnN1aXRlKCdDb2RlUmV2aWV3U2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBzZXJ2aWNlOiBJQ29kZVJldmlld1NlcnZpY2U7XG5cdGxldCBnaXRIdWJTZXJ2aWNlOiBNb2NrR2l0SHViU2VydmljZTtcblx0bGV0IHNlc3Npb25zTWFuYWdlbWVudDogTW9ja1Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U7XG5cblx0bGV0IHNlc3Npb246IFVSSTtcblxuXHRjbGFzcyBNb2NrU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbnM6IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVNlc3Npb246IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4+O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PElTZXNzaW9uc0NoYW5nZUV2ZW50Pjtcblx0XHRyZWFkb25seSBhY3RpdmVTZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblxuXHRcdGNvbnN0cnVjdG9yKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50PigpKTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX2FjdGl2ZVNlc3Npb247XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHRhZGRTZXNzaW9uKHJlc291cmNlOiBVUkksIGNoYW5nZXM/OiByZWFkb25seSBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMltdLCBhcmNoaXZlZCA9IGZhbHNlKTogSVNlc3Npb24ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc09icyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlW10+KCd0ZXN0LmNoYW5nZXMnLFxuXHRcdFx0XHQoY2hhbmdlcyA/PyBbXSkubWFwKGMgPT4gKHsgbW9kaWZpZWRVcmk6IGMubW9kaWZpZWRVcmkgPz8gYy51cmksIG9yaWdpbmFsVXJpOiBjLm9yaWdpbmFsVXJpLCBpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsIGRlbGV0aW9uczogYy5kZWxldGlvbnMgfSkpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXNBcmNoaXZlZE9icyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPigndGVzdC5pc0FyY2hpdmVkJywgYXJjaGl2ZWQpO1xuXHRcdFx0Y29uc3QgZ2l0SHViSW5mb09icyA9IG9ic2VydmFibGVWYWx1ZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4oJ3Rlc3QuZ2l0SHViSW5mbycsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPigndGVzdC53b3Jrc3BhY2UnLCB7XG5cdFx0XHRcdHVyaTogd29ya3NwYWNlVXJpLFxuXHRcdFx0XHRsYWJlbDogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRcdHJvb3Q6IHdvcmtzcGFjZVVyaSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2VVcmksXG5cdFx0XHRcdFx0bmFtZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaTogd29ya3NwYWNlVXJpLCB3b3JrVHJlZVVyaTogdW5kZWZpbmVkLCBiYXNlQnJhbmNoTmFtZTogdW5kZWZpbmVkLCBnaXRIdWJJbmZvOiBnaXRIdWJJbmZvT2JzIH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGE6IElTZXNzaW9uID0ge1xuXHRcdFx0XHRzZXNzaW9uSWQ6IGB0ZXN0OiR7cmVzb3VyY2UudG9TdHJpbmcoKX1gLFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0d29ya3NwYWNlOiB3b3Jrc3BhY2VPYnMsXG5cdFx0XHRcdGNoYW5nZXM6IGNoYW5nZXNPYnMsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6IGlzQXJjaGl2ZWRPYnMsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSVNlc3Npb247XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zZXQocmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbkRhdGEpO1xuXHRcdFx0cmV0dXJuIHNlc3Npb25EYXRhO1xuXHRcdH1cblxuXHRcdHNldEdpdEh1YkluZm8ocmVzb3VyY2U6IFVSSSwgZ2l0SHViSW5mbzogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdO1xuXHRcdFx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRcdFx0KGZvbGRlci5naXRSZXBvc2l0b3J5IS5naXRIdWJJbmZvIGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4+KS5zZXQoZ2l0SHViSW5mbywgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb24uc2V0KHNlc3Npb24gYXMgSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dXBkYXRlU2Vzc2lvbkNoYW5nZXMocmVzb3VyY2U6IFVSSSwgY2hhbmdlczogcmVhZG9ubHkgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTJbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnN0IG9icyA9IHNlc3Npb24uY2hhbmdlcyBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZVtdPj47XG5cdFx0XHRcdG9icy5zZXQoXG5cdFx0XHRcdFx0KGNoYW5nZXMgPz8gW10pLm1hcChjID0+ICh7IG1vZGlmaWVkVXJpOiBjLm1vZGlmaWVkVXJpID8/IGMudXJpLCBvcmlnaW5hbFVyaTogYy5vcmlnaW5hbFVyaSwgaW5zZXJ0aW9uczogYy5pbnNlcnRpb25zLCBkZWxldGlvbnM6IGMuZGVsZXRpb25zIH0pKSxcblx0XHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZW1vdmVTZXNzaW9uKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldO1xuXHRcdH1cblxuXHRcdGZpcmVTZXNzaW9uc0NoYW5nZWQoZXZlbnQ/OiBQYXJ0aWFsPElTZXNzaW9uc0NoYW5nZUV2ZW50Pik6IHZvaWQge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHtcblx0XHRcdFx0YWRkZWQ6IGV2ZW50Py5hZGRlZCA/PyBbXSxcblx0XHRcdFx0cmVtb3ZlZDogZXZlbnQ/LnJlbW92ZWQgPz8gW10sXG5cdFx0XHRcdGNoYW5nZWQ6IGV2ZW50Py5jaGFuZ2VkID8/IFtdLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgTW9ja1Jldmlld1RocmVhZHNGZXRjaGVyIHtcblx0XHRuZXh0VGhyZWFkczogSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkW10gPSBbXTtcblx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHMgPSAwO1xuXHRcdHJlc29sdmVUaHJlYWRDYWxsczogeyB0aHJlYWRJZDogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdFx0YXN5bmMgZ2V0UmV2aWV3VGhyZWFkcyhfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgX3ByTnVtYmVyOiBudW1iZXIpOiBQcm9taXNlPElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdPiB7XG5cdFx0XHR0aGlzLmdldFJldmlld1RocmVhZHNDYWxscysrO1xuXHRcdFx0cmV0dXJuIHRoaXMubmV4dFRocmVhZHM7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcG9zdFJldmlld0NvbW1lbnQoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIF9wck51bWJlcjogbnVtYmVyLCBib2R5OiBzdHJpbmcsIGluUmVwbHlUbzogbnVtYmVyKTogUHJvbWlzZTxJR2l0SHViUFJDb21tZW50PiB7XG5cdFx0XHRyZXR1cm4gbWFrZVBSQ29tbWVudChpblJlcGx5VG8sIGJvZHkpO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJlc29sdmVUaHJlYWQoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIHRocmVhZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHRoaXMucmVzb2x2ZVRocmVhZENhbGxzLnB1c2goeyB0aHJlYWRJZCB9KTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBNb2NrR2l0SHViU2VydmljZSBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdHJlYWRvbmx5IGxlZ2FjeUZldGNoZXIgPSBuZXcgTW9ja1Jldmlld1RocmVhZHNGZXRjaGVyKCk7XG5cdFx0cmVhZG9ubHkgcmV2aWV3VGhyZWFkc0ZldGNoZXIgPSBuZXcgTW9ja1Jldmlld1RocmVhZHNGZXRjaGVyKCk7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXZpZXdUaHJlYWRzTW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsPigpO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jldmlld1RocmVhZHNGZXRjaGVycyA9IG5ldyBNYXA8c3RyaW5nLCBNb2NrUmV2aWV3VGhyZWFkc0ZldGNoZXI+KCk7XG5cblx0XHRnZXRQdWxsUmVxdWVzdENhbGxzID0gMDtcblx0XHRnZXRQdWxsUmVxdWVzdFJldmlld1RocmVhZHNDYWxscyA9IDA7XG5cblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzT2JzOiBJT2JzZXJ2YWJsZTxHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbCB8IHVuZGVmaW5lZD47XG5cblx0XHRjb25zdHJ1Y3RvcihzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBNb2NrU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHRcdHRoaXMuX3Jldmlld1RocmVhZHNGZXRjaGVycy5zZXQodGhpcy5fa2V5KCdvd25lcicsICdyZXBvJywgMSksIHRoaXMucmV2aWV3VGhyZWFkc0ZldGNoZXIpO1xuXG5cdFx0XHR0aGlzLmFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdFJldmlld1RocmVhZHNPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBnaXRIdWJJbmZvID0gc2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghZ2l0SHViSW5mbz8ucHVsbFJlcXVlc3QpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFJldmlld1RocmVhZHNNb2RlbChnaXRIdWJJbmZvLm93bmVyLCBnaXRIdWJJbmZvLnJlcG8sIGdpdEh1YkluZm8ucHVsbFJlcXVlc3QubnVtYmVyKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGdldFJldmlld1RocmVhZHNGZXRjaGVyKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlcik6IE1vY2tSZXZpZXdUaHJlYWRzRmV0Y2hlciB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkob3duZXIsIHJlcG8sIHByTnVtYmVyKTtcblx0XHRcdGxldCBmZXRjaGVyID0gdGhpcy5fcmV2aWV3VGhyZWFkc0ZldGNoZXJzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFmZXRjaGVyKSB7XG5cdFx0XHRcdGZldGNoZXIgPSBuZXcgTW9ja1Jldmlld1RocmVhZHNGZXRjaGVyKCk7XG5cdFx0XHRcdHRoaXMuX3Jldmlld1RocmVhZHNGZXRjaGVycy5zZXQoa2V5LCBmZXRjaGVyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmZXRjaGVyO1xuXHRcdH1cblxuXHRcdGdldFJldmlld1RocmVhZHNNb2RlbChvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHByTnVtYmVyOiBudW1iZXIpOiBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbCB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkob3duZXIsIHJlcG8sIHByTnVtYmVyKTtcblx0XHRcdGxldCBtb2RlbCA9IHRoaXMuX3Jldmlld1RocmVhZHNNb2RlbHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdG1vZGVsID0gc3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbChvd25lciwgcmVwbywgcHJOdW1iZXIsIHRoaXMuZ2V0UmV2aWV3VGhyZWFkc0ZldGNoZXIob3duZXIsIHJlcG8sIHByTnVtYmVyKSBhcyB1bmtub3duIGFzIEdpdEh1YlBSRmV0Y2hlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdFx0dGhpcy5fcmV2aWV3VGhyZWFkc01vZGVscy5zZXQoa2V5LCBtb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWxSZWZlcmVuY2Uob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogSVJlZmVyZW5jZTxHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbD4ge1xuXHRcdFx0dGhpcy5nZXRQdWxsUmVxdWVzdFJldmlld1RocmVhZHNDYWxscysrO1xuXHRcdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh0aGlzLmdldFJldmlld1RocmVhZHNNb2RlbChvd25lciwgcmVwbywgcHJOdW1iZXIpKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9rZXkob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiBgJHtvd25lcn0vJHtyZXBvfSMke3ByTnVtYmVyfWA7XG5cdFx0fVxuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnQgPSBuZXcgTW9ja1Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc3RvcmUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCB7IGFjdGl2ZVNlc3Npb246IHNlc3Npb25zTWFuYWdlbWVudC5hY3RpdmVTZXNzaW9uIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGdpdEh1YlNlcnZpY2UgPSBuZXcgTW9ja0dpdEh1YlNlcnZpY2Uoc2Vzc2lvbnNNYW5hZ2VtZW50KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElHaXRIdWJTZXJ2aWNlLCBnaXRIdWJTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZVJldmlld1NlcnZpY2UpKTtcblx0XHRzZXNzaW9uID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi8xJyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdQUiByZXZpZXcgc3RhdGUgdXNlcyBkZWRpY2F0ZWQgcmV2aWV3IHRocmVhZHMgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50LmFkZFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50LnNldEdpdEh1YkluZm8oc2Vzc2lvbiwgbWFrZUdpdEh1YkluZm8oKSk7XG5cdFx0Z2l0SHViU2VydmljZS5yZXZpZXdUaHJlYWRzRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFttYWtlUFJUaHJlYWQoJ3RocmVhZC0xMDAnLCAnc3JjL2EudHMnKV07XG5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnQuc2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9uc01hbmFnZW1lbnQuZ2V0U2Vzc2lvbihzZXNzaW9uKSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gUG9sbGluZyBpcyBvd25lZCBieSBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb247IHJlZnJlc2hcblx0XHQvLyBtYW51YWxseSBoZXJlIHRvIHNlZWQgdGhlIHJldmlldyB0aHJlYWRzIG1vZGVsIHdpdGggZGF0YS5cblx0XHRhd2FpdCBnaXRIdWJTZXJ2aWNlLmdldFJldmlld1RocmVhZHNNb2RlbCgnb3duZXInLCAncmVwbycsIDEpLnJlZnJlc2goKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHNlcnZpY2UuZ2V0UFJSZXZpZXdTdGF0ZShzZXNzaW9uKS5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUua2luZCwgUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkKTtcblx0XHRpZiAoc3RhdGUua2luZCA9PT0gUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29tbWVudHM6IHN0YXRlLmNvbW1lbnRzLm1hcChjb21tZW50ID0+ICh7IGlkOiBjb21tZW50LmlkLCB1cmk6IGNvbW1lbnQudXJpLnRvU3RyaW5nKCksIGJvZHk6IGNvbW1lbnQuYm9keSwgYXV0aG9yOiBjb21tZW50LmF1dGhvciB9KSksXG5cdFx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IGdpdEh1YlNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdFx0Z2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHM6IGdpdEh1YlNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHMsXG5cdFx0XHRcdGxlZ2FjeVRocmVhZFJlZnJlc2hlczogZ2l0SHViU2VydmljZS5sZWdhY3lGZXRjaGVyLmdldFJldmlld1RocmVhZHNDYWxscyxcblx0XHRcdFx0cmV2aWV3VGhyZWFkUmVmcmVzaGVzOiBnaXRIdWJTZXJ2aWNlLnJldmlld1RocmVhZHNGZXRjaGVyLmdldFJldmlld1RocmVhZHNDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tbWVudHM6IFt7IGlkOiAndGhyZWFkLTEwMCcsIHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL3NyYy9hLnRzJywgYm9keTogJ0NvbW1lbnQgb24gc3JjL2EudHMnLCBhdXRob3I6ICdyZXZpZXdlcicgfV0sXG5cdFx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IDAsXG5cdFx0XHRcdGdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc0NhbGxzOiAwLFxuXHRcdFx0XHRsZWdhY3lUaHJlYWRSZWZyZXNoZXM6IDAsXG5cdFx0XHRcdHJldmlld1RocmVhZFJlZnJlc2hlczogMSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVBSUmV2aWV3VGhyZWFkIHVzZXMgZGVkaWNhdGVkIHJldmlldyB0aHJlYWRzIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5zZXRHaXRIdWJJbmZvKHNlc3Npb24sIG1ha2VHaXRIdWJJbmZvKCkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXNvbHZlUFJSZXZpZXdUaHJlYWQoc2Vzc2lvbiwgJ3RocmVhZC0xMDAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2V0UHVsbFJlcXVlc3RDYWxsczogZ2l0SHViU2VydmljZS5nZXRQdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0Z2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHM6IGdpdEh1YlNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHMsXG5cdFx0XHRsZWdhY3lSZXNvbHZlVGhyZWFkQ2FsbHM6IGdpdEh1YlNlcnZpY2UubGVnYWN5RmV0Y2hlci5yZXNvbHZlVGhyZWFkQ2FsbHMsXG5cdFx0XHRyZXZpZXdSZXNvbHZlVGhyZWFkQ2FsbHM6IGdpdEh1YlNlcnZpY2UucmV2aWV3VGhyZWFkc0ZldGNoZXIucmVzb2x2ZVRocmVhZENhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IDAsXG5cdFx0XHRnZXRQdWxsUmVxdWVzdFJldmlld1RocmVhZHNDYWxsczogMSxcblx0XHRcdGxlZ2FjeVJlc29sdmVUaHJlYWRDYWxsczogW10sXG5cdFx0XHRyZXZpZXdSZXNvbHZlVGhyZWFkQ2FsbHM6IFt7IHRocmVhZElkOiAndGhyZWFkLTEwMCcgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NQUlJldmlld0NvbW1lbnQgZmlsdGVycyB0aGUgY29tbWVudCBmcm9tIHRoZSBsb2FkZWQgcmV2aWV3IHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5zZXRHaXRIdWJJbmZvKHNlc3Npb24sIG1ha2VHaXRIdWJJbmZvKCkpO1xuXHRcdGdpdEh1YlNlcnZpY2UucmV2aWV3VGhyZWFkc0ZldGNoZXIubmV4dFRocmVhZHMgPSBbbWFrZVBSVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyksIG1ha2VQUlRocmVhZCgndGhyZWFkLTIwMCcsICdzcmMvYi50cycpXTtcblxuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25zTWFuYWdlbWVudC5nZXRTZXNzaW9uKHNlc3Npb24pKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXdhaXQgZ2l0SHViU2VydmljZS5nZXRSZXZpZXdUaHJlYWRzTW9kZWwoJ293bmVyJywgJ3JlcG8nLCAxKS5yZWZyZXNoKCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzUFJSZXZpZXdDb21tZW50KHNlc3Npb24sICd0aHJlYWQtMTAwJyk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHNlcnZpY2UuZ2V0UFJSZXZpZXdTdGF0ZShzZXNzaW9uKS5nZXQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c3RhdGUua2luZCA9PT0gUFJSZXZpZXdTdGF0ZUtpbmQuTG9hZGVkID8gc3RhdGUuY29tbWVudHMubWFwKGMgPT4gYy5pZCkgOiBzdGF0ZS5raW5kLFxuXHRcdFx0Wyd0aHJlYWQtMjAwJ10sXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NvZGUgUmV2aWV3IENvbnRyaWJ1dGlvbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnUnVuIENvZGUgUmV2aWV3IGlzIHNob3duIGluIHRoZSBzaW5nbGUtcGFuZSBDaGFuZ2VzIGhlYWRlciBvbmx5IGZvciBjcmVhdGVkIHNlc3Npb25zIHdpdGggY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnkpXG5cdFx0XHQuZmlsdGVyKGlzSU1lbnVJdGVtKVxuXHRcdFx0LmZpbmQoaXRlbSA9PiBpdGVtLmNvbW1hbmQuaWQgPT09ICdzZXNzaW9ucy5jb2RlUmV2aWV3LnJ1bicpO1xuXG5cdFx0YXNzZXJ0Lm9rKGl0ZW0sICdleHBlY3RlZCBSdW4gQ29kZSBSZXZpZXcgYWN0aW9uIG9uIHRoZSBzaW5nbGUtcGFuZSBDaGFuZ2VzIGVkaXRvciBoZWFkZXInKTtcblx0XHRjb25zdCB3aGVuID0gaXRlbS53aGVuPy5zZXJpYWxpemUoKSA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdyb3VwOiBpdGVtLmdyb3VwLFxuXHRcdFx0b3JkZXI6IGl0ZW0ub3JkZXIsXG5cdFx0XHRoYXNTZXNzaW9uc1dpbmRvd0dhdGU6IHdoZW4uaW5jbHVkZXMoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQua2V5KSxcblx0XHRcdGhhc0FjdGl2ZUVkaXRvckdhdGU6IHdoZW4uaW5jbHVkZXMoQWN0aXZlRWRpdG9yQ29udGV4dC5rZXkpICYmIHdoZW4uaW5jbHVkZXMoU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dC5FRElUT1JfSUQpLFxuXHRcdFx0aGFzU2luZ2xlUGFuZUxheW91dEdhdGU6IHdoZW4uaW5jbHVkZXMoU2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0LmtleSksXG5cdFx0XHRoYXNBdXhpbGlhcnlXaW5kb3dHYXRlOiB3aGVuLmluY2x1ZGVzKElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC5rZXkpLFxuXHRcdFx0aGFzVG9wUmlnaHRFZGl0b3JHcm91cEdhdGU6IHdoZW4uaW5jbHVkZXMoSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dC5rZXkpLFxuXHRcdFx0aGFzQ2hhbmdlc0dhdGU6IHdoZW4uaW5jbHVkZXMoU2Vzc2lvbkhhc0NoYW5nZXNDb250ZXh0LmtleSksXG5cdFx0XHRoYXNDcmVhdGVkR2F0ZTogd2hlbi5pbmNsdWRlcyhTZXNzaW9uSXNDcmVhdGVkQ29udGV4dC5rZXkpLFxuXHRcdH0sIHtcblx0XHRcdGdyb3VwOiAnMV9jb2RlUmV2aWV3Jyxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0aGFzU2Vzc2lvbnNXaW5kb3dHYXRlOiB0cnVlLFxuXHRcdFx0aGFzQWN0aXZlRWRpdG9yR2F0ZTogdHJ1ZSxcblx0XHRcdGhhc1NpbmdsZVBhbmVMYXlvdXRHYXRlOiB0cnVlLFxuXHRcdFx0aGFzQXV4aWxpYXJ5V2luZG93R2F0ZTogdHJ1ZSxcblx0XHRcdGhhc1RvcFJpZ2h0RWRpdG9yR3JvdXBHYXRlOiB0cnVlLFxuXHRcdFx0aGFzQ2hhbmdlc0dhdGU6IHRydWUsXG5cdFx0XHRoYXNDcmVhdGVkR2F0ZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUnVuIENvZGUgUmV2aWV3IGlzIHNob3duIGluIHRoZSBjbGFzc2ljIENoYW5nZXMgdG9vbGJhciBvbmx5IGZvciBjcmVhdGVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW0gPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5BZ2VudHNDaGFuZ2VzVG9vbGJhcilcblx0XHRcdC5maWx0ZXIoaXNJTWVudUl0ZW0pXG5cdFx0XHQuZmluZChpdGVtID0+IGl0ZW0uY29tbWFuZC5pZCA9PT0gJ3Nlc3Npb25zLmNvZGVSZXZpZXcucnVuJyk7XG5cblx0XHRhc3NlcnQub2soaXRlbSwgJ2V4cGVjdGVkIFJ1biBDb2RlIFJldmlldyBhY3Rpb24gb24gdGhlIGNsYXNzaWMgQ2hhbmdlcyB0b29sYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aXRlbS53aGVuPy5zZXJpYWxpemUoKS5pbmNsdWRlcyhTZXNzaW9uSXNDcmVhdGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0dHJ1ZSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBtYWtlR2l0SHViSW5mbyhwck51bWJlciA9IDEpOiBJR2l0SHViSW5mbyB7XG5cdHJldHVybiB7XG5cdFx0b3duZXI6ICdvd25lcicsXG5cdFx0cmVwbzogJ3JlcG8nLFxuXHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRudW1iZXI6IHByTnVtYmVyLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoYGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvJHtwck51bWJlcn1gKSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUFJUaHJlYWQoaWQ6IHN0cmluZywgcGF0aDogc3RyaW5nKTogSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkIHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRpc1Jlc29sdmVkOiBmYWxzZSxcblx0XHRwYXRoLFxuXHRcdGxpbmU6IDEwLFxuXHRcdGNvbW1lbnRzOiBbbWFrZVBSQ29tbWVudCgxMDAsIGBDb21tZW50IG9uICR7cGF0aH1gLCBpZCldLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUFJDb21tZW50KGlkOiBudW1iZXIsIGJvZHk6IHN0cmluZywgdGhyZWFkSWQ6IHN0cmluZyA9IFN0cmluZyhpZCkpOiBJR2l0SHViUFJDb21tZW50IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRib2R5LFxuXHRcdGF1dGhvcjogeyBsb2dpbjogJ3Jldmlld2VyJywgYXZhdGFyVXJsOiAnJyB9LFxuXHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0cGF0aDogdW5kZWZpbmVkLFxuXHRcdGxpbmU6IHVuZGVmaW5lZCxcblx0XHR0aHJlYWRJZCxcblx0XHRpblJlcGx5VG9JZDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0aWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQXNCLFNBQVMsdUJBQXVCO0FBQ3RELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYSxRQUFRLG9CQUFvQjtBQUNsRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlCQUFpQix5QkFBcUM7QUFDL0QsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBUyxhQUFhLHNCQUFzQjtBQUU1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
