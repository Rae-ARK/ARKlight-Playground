import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { GitHubPRFetcher, computeMergeability } from "../../browser/fetchers/githubPRFetcher.js";
import { GitHubPRCIFetcher, computeOverallCIStatus } from "../../browser/fetchers/githubPRCIFetcher.js";
import { GitHubRepositoryFetcher } from "../../browser/fetchers/githubRepositoryFetcher.js";
import { GitHubApiError } from "../../browser/githubApiClient.js";
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, GitHubPullRequestState, MergeBlockerKind } from "../../common/types.js";
class MockApiClient {
  constructor() {
    this.requestCalls = [];
    this.graphqlCalls = [];
  }
  setNextResponse(data) {
    this._nextResponse = data;
    this._nextError = void 0;
  }
  setNextError(error) {
    this._nextError = error;
    this._nextResponse = void 0;
  }
  async request(_method, _path, _callSite, _options) {
    this.requestCalls.push({ method: _method, path: _path, body: _options?.data });
    if (this._nextError) {
      throw this._nextError;
    }
    return { data: this._nextResponse, statusCode: 200 };
  }
  async graphql(query, _callSite, variables) {
    this.graphqlCalls.push({ query, variables });
    if (this._nextError) {
      throw this._nextError;
    }
    return this._nextResponse;
  }
}
suite("GitHubRepositoryFetcher", () => {
  const store = new DisposableStore();
  let mockApi;
  let fetcher;
  setup(() => {
    mockApi = new MockApiClient();
    fetcher = new GitHubRepositoryFetcher(mockApi);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getRepository returns mapped data", async () => {
    mockApi.setNextResponse({
      name: "vscode",
      full_name: "microsoft/vscode",
      owner: { login: "microsoft" },
      default_branch: "main",
      private: false,
      description: "Visual Studio Code"
    });
    const repo = await fetcher.getRepository("microsoft", "vscode");
    assert.deepStrictEqual(repo.data, {
      owner: "microsoft",
      name: "vscode",
      fullName: "microsoft/vscode",
      defaultBranch: "main",
      isPrivate: false,
      description: "Visual Studio Code"
    });
    assert.strictEqual(mockApi.requestCalls[0].path, "/repos/microsoft/vscode");
  });
  test("getRepository handles null description", async () => {
    mockApi.setNextResponse({
      name: "test",
      full_name: "owner/test",
      owner: { login: "owner" },
      default_branch: "main",
      private: true,
      description: null
    });
    const repo = await fetcher.getRepository("owner", "test");
    assert.strictEqual(repo.data?.description, "");
  });
  test("getRepository propagates API errors", async () => {
    mockApi.setNextError(new GitHubApiError("Not found", 404, void 0));
    await assert.rejects(
      () => fetcher.getRepository("owner", "nonexistent"),
      (err) => err instanceof GitHubApiError && err.statusCode === 404
    );
  });
});
suite("GitHubPRFetcher", () => {
  const store = new DisposableStore();
  let mockApi;
  let fetcher;
  setup(() => {
    mockApi = new MockApiClient();
    fetcher = new GitHubPRFetcher(mockApi);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getPullRequest maps open PR", async () => {
    mockApi.setNextResponse(makePRResponse({ state: "open", merged: false, draft: false }));
    const pr = await fetcher.getPullRequest("owner", "repo", 1);
    assert.strictEqual(pr.data?.state, GitHubPullRequestState.Open);
    assert.strictEqual(pr.data?.isDraft, false);
    assert.strictEqual(pr.data?.number, 1);
    assert.strictEqual(pr.data?.title, "Test PR");
  });
  test("getPullRequest maps merged PR", async () => {
    mockApi.setNextResponse(makePRResponse({ state: "closed", merged: true, draft: false }));
    const pr = await fetcher.getPullRequest("owner", "repo", 1);
    assert.strictEqual(pr.data?.state, GitHubPullRequestState.Merged);
    assert.ok(pr.data?.mergedAt);
  });
  test("getPullRequest maps closed PR", async () => {
    mockApi.setNextResponse(makePRResponse({ state: "closed", merged: false, draft: false }));
    const pr = await fetcher.getPullRequest("owner", "repo", 1);
    assert.strictEqual(pr.data?.state, GitHubPullRequestState.Closed);
  });
  test("getReviewThreads returns GraphQL thread metadata", async () => {
    mockApi.setNextResponse(makeGraphQLReviewThreadsResponse([
      makeGraphQLReviewThread({
        id: "thread-a",
        path: "src/a.ts",
        line: 10,
        isResolved: false,
        comments: [
          makeGraphQLReviewComment({ databaseId: 100, path: "src/a.ts", line: 10 }),
          makeGraphQLReviewComment({ databaseId: 101, path: "src/a.ts", line: 10, replyToDatabaseId: 100 })
        ]
      }),
      makeGraphQLReviewThread({
        id: "thread-b",
        path: "src/b.ts",
        line: 20,
        isResolved: true,
        comments: [makeGraphQLReviewComment({ databaseId: 200, path: "src/b.ts", line: 20 })]
      })
    ]));
    const threads = await fetcher.getReviewThreads("owner", "repo", 1);
    assert.strictEqual(threads.length, 2);
    const thread1 = threads.find((t) => t.id === "thread-a");
    assert.ok(thread1);
    assert.strictEqual(thread1.comments.length, 2);
    assert.strictEqual(thread1.path, "src/a.ts");
    assert.strictEqual(thread1.line, 10);
    assert.strictEqual(thread1.comments[0].threadId, "thread-a");
    const thread2 = threads.find((t) => t.id === "thread-b");
    assert.ok(thread2);
    assert.strictEqual(thread2.comments.length, 1);
    assert.strictEqual(thread2.path, "src/b.ts");
    assert.strictEqual(thread2.isResolved, true);
  });
  test("resolveThread uses GraphQL mutation", async () => {
    mockApi.setNextResponse({
      resolveReviewThread: {
        thread: {
          isResolved: true
        }
      }
    });
    await fetcher.resolveThread("owner", "repo", "thread-a");
    assert.strictEqual(mockApi.graphqlCalls.length, 1);
    assert.deepStrictEqual(mockApi.graphqlCalls[0].variables, { threadId: "thread-a" });
  });
  test("getReviews maps API response", async () => {
    mockApi.setNextResponse([
      { id: 1, user: { login: "reviewer", avatar_url: "" }, state: "APPROVED", submitted_at: "2024-01-01T00:00:00Z" },
      { id: 2, user: { login: "other", avatar_url: "" }, state: "CHANGES_REQUESTED", submitted_at: "2024-01-02T00:00:00Z" }
    ]);
    const reviews = await fetcher.getReviews("owner", "repo", 1);
    assert.deepStrictEqual(reviews.data, [
      { id: 1, author: { login: "reviewer", avatarUrl: "" }, state: "APPROVED", submittedAt: "2024-01-01T00:00:00Z" },
      { id: 2, author: { login: "other", avatarUrl: "" }, state: "CHANGES_REQUESTED", submittedAt: "2024-01-02T00:00:00Z" }
    ]);
    assert.strictEqual(mockApi.requestCalls.length, 1);
    assert.strictEqual(mockApi.requestCalls[0].path, "/repos/owner/repo/pulls/1/reviews");
  });
  test("computeMergeability detects draft blocker", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: true, mergeable: true, mergeableState: "clean" });
    const result = computeMergeability(pr, []);
    assert.strictEqual(result.canMerge, false);
    assert.ok(result.blockers.some((b) => b.kind === MergeBlockerKind.Draft));
  });
  test("computeMergeability detects conflicts blocker", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: false, mergeableState: "dirty" });
    const result = computeMergeability(pr, []);
    assert.strictEqual(result.canMerge, false);
    assert.ok(result.blockers.some((b) => b.kind === MergeBlockerKind.Conflicts));
  });
  test("computeMergeability detects changes requested blocker", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: true, mergeableState: "clean" });
    const reviews = [
      { id: 1, author: { login: "reviewer", avatarUrl: "" }, state: "CHANGES_REQUESTED", submittedAt: "2024-01-01T00:00:00Z" }
    ];
    const result = computeMergeability(pr, reviews);
    assert.strictEqual(result.canMerge, false);
    assert.ok(result.blockers.some((b) => b.kind === MergeBlockerKind.ChangesRequested));
  });
  test("computeMergeability returns canMerge for clean open PR", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: true, mergeableState: "clean" });
    const result = computeMergeability(pr, []);
    assert.strictEqual(result.canMerge, true);
    assert.strictEqual(result.blockers.length, 0);
  });
});
suite("GitHubPRCIFetcher", () => {
  const store = new DisposableStore();
  let mockApi;
  let fetcher;
  setup(() => {
    mockApi = new MockApiClient();
    fetcher = new GitHubPRCIFetcher(mockApi);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getCheckRuns maps check runs", async () => {
    mockApi.setNextResponse({
      total_count: 2,
      check_runs: [
        { id: 1, name: "build", status: "completed", conclusion: "success", started_at: "2024-01-01T00:00:00Z", completed_at: "2024-01-01T00:10:00Z", details_url: "https://example.com/1" },
        { id: 2, name: "test", status: "in_progress", conclusion: null, started_at: "2024-01-01T00:00:00Z", completed_at: null, details_url: null }
      ]
    });
    const checks = await fetcher.getCheckRuns("owner", "repo", "abc123");
    assert.strictEqual(checks.data?.length, 2);
    assert.deepStrictEqual(checks.data?.[0], {
      id: 1,
      name: "build",
      status: GitHubCheckStatus.Completed,
      conclusion: GitHubCheckConclusion.Success,
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: "2024-01-01T00:10:00Z",
      detailsUrl: "https://example.com/1"
    });
    assert.strictEqual(checks.data?.[1].conclusion, void 0);
  });
  test("getCheckRunAnnotations returns formatted annotations", async () => {
    mockApi.setNextResponse([
      { path: "src/a.ts", start_line: 10, end_line: 10, annotation_level: "failure", message: "type error", title: "TS2345" },
      { path: "src/b.ts", start_line: 5, end_line: 8, annotation_level: "warning", message: "unused var", title: null }
    ]);
    const result = await fetcher.getCheckRunAnnotations("owner", "repo", 1);
    assert.ok(result.includes("[failure] src/a.ts:10"));
    assert.ok(result.includes("(TS2345)"));
    assert.ok(result.includes("[warning] src/b.ts:5-8"));
  });
  test("rerunFailedJobs sends POST to correct endpoint", async () => {
    mockApi.setNextResponse(void 0);
    await fetcher.rerunFailedJobs("myOwner", "myRepo", 12345);
    assert.strictEqual(mockApi.requestCalls.length, 1);
    assert.deepStrictEqual(mockApi.requestCalls[0], {
      method: "POST",
      path: "/repos/myOwner/myRepo/actions/runs/12345/rerun-failed-jobs",
      body: void 0
    });
  });
});
suite("computeOverallCIStatus", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns neutral for empty checks", () => {
    assert.strictEqual(computeOverallCIStatus([]), GitHubCIOverallStatus.Neutral);
  });
  test("returns success when all completed successfully", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Neutral })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Success);
  });
  test("returns failure when any check failed", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Failure);
  });
  test("returns pending when any check is in progress", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
      makeCheck({ status: GitHubCheckStatus.InProgress, conclusion: void 0 })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Pending);
  });
  test("failure takes precedence over pending", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure }),
      makeCheck({ status: GitHubCheckStatus.InProgress, conclusion: void 0 })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Failure);
  });
});
function makePR(overrides) {
  return {
    number: 1,
    title: "Test PR",
    body: "Test body",
    state: overrides.state,
    author: { login: "author", avatarUrl: "" },
    headRef: "feature",
    headSha: "abc123",
    baseRef: "main",
    isDraft: overrides.isDraft,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    mergedAt: void 0,
    mergeable: overrides.mergeable,
    mergeableState: overrides.mergeableState
  };
}
function makePRResponse(overrides) {
  return {
    number: 1,
    title: "Test PR",
    body: "Test body",
    state: overrides.state,
    draft: overrides.draft,
    user: { login: "author", avatar_url: "https://example.com/avatar" },
    head: { ref: "feature-branch" },
    base: { ref: "main" },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    merged_at: overrides.merged ? "2024-01-02T00:00:00Z" : null,
    mergeable: overrides.mergeable ?? true,
    mergeable_state: overrides.mergeable_state ?? "clean",
    merged: overrides.merged
  };
}
function makeGraphQLReviewThreadsResponse(threads) {
  return {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: threads
        }
      }
    }
  };
}
function makeGraphQLReviewThread(overrides = {}) {
  return {
    id: overrides.id ?? "thread-1",
    isResolved: overrides.isResolved ?? false,
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 10,
    comments: {
      nodes: overrides.comments ?? [makeGraphQLReviewComment()]
    }
  };
}
function makeGraphQLReviewComment(overrides = {}) {
  return {
    databaseId: overrides.databaseId ?? 100,
    body: overrides.body ?? "Test comment",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 10,
    originalLine: overrides.line ?? 10,
    replyTo: overrides.replyToDatabaseId !== void 0 ? { databaseId: overrides.replyToDatabaseId } : null,
    author: {
      login: "reviewer",
      avatarUrl: "https://example.com/avatar"
    }
  };
}
function makeCheck(overrides) {
  return {
    id: 1,
    name: "test-check",
    status: overrides.status,
    conclusion: overrides.conclusion,
    startedAt: void 0,
    completedAt: void 0,
    detailsUrl: void 0
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL3Rlc3QvYnJvd3Nlci9naXRodWJGZXRjaGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgR2l0SHViUFJGZXRjaGVyLCBjb21wdXRlTWVyZ2VhYmlsaXR5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9mZXRjaGVycy9naXRodWJQUkZldGNoZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViUFJDSUZldGNoZXIsIGNvbXB1dGVPdmVyYWxsQ0lTdGF0dXMgfSBmcm9tICcuLi8uLi9icm93c2VyL2ZldGNoZXJzL2dpdGh1YlBSQ0lGZXRjaGVyLmpzJztcbmltcG9ydCB7IEdpdEh1YlJlcG9zaXRvcnlGZXRjaGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9mZXRjaGVycy9naXRodWJSZXBvc2l0b3J5RmV0Y2hlci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJBcGlDbGllbnQsIEdpdEh1YkFwaUVycm9yLCBJR2l0SHViQXBpUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL2dpdGh1YkFwaUNsaWVudC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDaGVja0NvbmNsdXNpb24sIEdpdEh1YkNoZWNrU3RhdHVzLCBHaXRIdWJDSU92ZXJhbGxTdGF0dXMsIEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUsIElHaXRIdWJQdWxsUmVxdWVzdFJldmlldywgSUdpdEh1YlB1bGxSZXF1ZXN0LCBNZXJnZUJsb2NrZXJLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcblxuY2xhc3MgTW9ja0FwaUNsaWVudCB7XG5cblx0cHJpdmF0ZSBfbmV4dFJlc3BvbnNlOiB1bmtub3duO1xuXHRwcml2YXRlIF9uZXh0RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZXF1ZXN0Q2FsbHM6IHsgbWV0aG9kOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgYm9keT86IHVua25vd24gfVtdID0gW107XG5cdHJlYWRvbmx5IGdyYXBocWxDYWxsczogeyBxdWVyeTogc3RyaW5nOyB2YXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblxuXHRzZXROZXh0UmVzcG9uc2UoZGF0YTogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX25leHRSZXNwb25zZSA9IGRhdGE7XG5cdFx0dGhpcy5fbmV4dEVycm9yID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0TmV4dEVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX25leHRFcnJvciA9IGVycm9yO1xuXHRcdHRoaXMuX25leHRSZXNwb25zZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3Q8VD4oX21ldGhvZDogc3RyaW5nLCBfcGF0aDogc3RyaW5nLCBfY2FsbFNpdGU6IHN0cmluZywgX29wdGlvbnM/OiBJR2l0SHViQXBpUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHsgZGF0YTogVCB8IHVuZGVmaW5lZDsgc3RhdHVzQ29kZTogbnVtYmVyOyBldGFnPzogc3RyaW5nIH0+IHtcblx0XHR0aGlzLnJlcXVlc3RDYWxscy5wdXNoKHsgbWV0aG9kOiBfbWV0aG9kLCBwYXRoOiBfcGF0aCwgYm9keTogX29wdGlvbnM/LmRhdGEgfSk7XG5cdFx0aWYgKHRoaXMuX25leHRFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbmV4dEVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4geyBkYXRhOiB0aGlzLl9uZXh0UmVzcG9uc2UgYXMgVCwgc3RhdHVzQ29kZTogMjAwIH07XG5cdH1cblxuXHRhc3luYyBncmFwaHFsPFQ+KHF1ZXJ5OiBzdHJpbmcsIF9jYWxsU2l0ZTogc3RyaW5nLCB2YXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8VD4ge1xuXHRcdHRoaXMuZ3JhcGhxbENhbGxzLnB1c2goeyBxdWVyeSwgdmFyaWFibGVzIH0pO1xuXHRcdGlmICh0aGlzLl9uZXh0RXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuX25leHRFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25leHRSZXNwb25zZSBhcyBUO1xuXHR9XG59XG5cbnN1aXRlKCdHaXRIdWJSZXBvc2l0b3J5RmV0Y2hlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1vY2tBcGk6IE1vY2tBcGlDbGllbnQ7XG5cdGxldCBmZXRjaGVyOiBHaXRIdWJSZXBvc2l0b3J5RmV0Y2hlcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9ja0FwaSA9IG5ldyBNb2NrQXBpQ2xpZW50KCk7XG5cdFx0ZmV0Y2hlciA9IG5ldyBHaXRIdWJSZXBvc2l0b3J5RmV0Y2hlcihtb2NrQXBpIGFzIHVua25vd24gYXMgR2l0SHViQXBpQ2xpZW50KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZ2V0UmVwb3NpdG9yeSByZXR1cm5zIG1hcHBlZCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKHtcblx0XHRcdG5hbWU6ICd2c2NvZGUnLFxuXHRcdFx0ZnVsbF9uYW1lOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRvd25lcjogeyBsb2dpbjogJ21pY3Jvc29mdCcgfSxcblx0XHRcdGRlZmF1bHRfYnJhbmNoOiAnbWFpbicsXG5cdFx0XHRwcml2YXRlOiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiAnVmlzdWFsIFN0dWRpbyBDb2RlJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlcG8gPSBhd2FpdCBmZXRjaGVyLmdldFJlcG9zaXRvcnkoJ21pY3Jvc29mdCcsICd2c2NvZGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcG8uZGF0YSwge1xuXHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0bmFtZTogJ3ZzY29kZScsXG5cdFx0XHRmdWxsTmFtZTogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0ZGVmYXVsdEJyYW5jaDogJ21haW4nLFxuXHRcdFx0aXNQcml2YXRlOiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiAnVmlzdWFsIFN0dWRpbyBDb2RlJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0FwaS5yZXF1ZXN0Q2FsbHNbMF0ucGF0aCwgJy9yZXBvcy9taWNyb3NvZnQvdnNjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlcG9zaXRvcnkgaGFuZGxlcyBudWxsIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKHtcblx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdGZ1bGxfbmFtZTogJ293bmVyL3Rlc3QnLFxuXHRcdFx0b3duZXI6IHsgbG9naW46ICdvd25lcicgfSxcblx0XHRcdGRlZmF1bHRfYnJhbmNoOiAnbWFpbicsXG5cdFx0XHRwcml2YXRlOiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG51bGwsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXBvID0gYXdhaXQgZmV0Y2hlci5nZXRSZXBvc2l0b3J5KCdvd25lcicsICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcG8uZGF0YT8uZGVzY3JpcHRpb24sICcnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UmVwb3NpdG9yeSBwcm9wYWdhdGVzIEFQSSBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0RXJyb3IobmV3IEdpdEh1YkFwaUVycm9yKCdOb3QgZm91bmQnLCA0MDQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gZmV0Y2hlci5nZXRSZXBvc2l0b3J5KCdvd25lcicsICdub25leGlzdGVudCcpLFxuXHRcdFx0KGVycjogRXJyb3IpID0+IGVyciBpbnN0YW5jZW9mIEdpdEh1YkFwaUVycm9yICYmIChlcnIgYXMgR2l0SHViQXBpRXJyb3IpLnN0YXR1c0NvZGUgPT09IDQwNCxcblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnR2l0SHViUFJGZXRjaGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbW9ja0FwaTogTW9ja0FwaUNsaWVudDtcblx0bGV0IGZldGNoZXI6IEdpdEh1YlBSRmV0Y2hlcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9ja0FwaSA9IG5ldyBNb2NrQXBpQ2xpZW50KCk7XG5cdFx0ZmV0Y2hlciA9IG5ldyBHaXRIdWJQUkZldGNoZXIobW9ja0FwaSBhcyB1bmtub3duIGFzIEdpdEh1YkFwaUNsaWVudCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dldFB1bGxSZXF1ZXN0IG1hcHMgb3BlbiBQUicsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZShtYWtlUFJSZXNwb25zZSh7IHN0YXRlOiAnb3BlbicsIG1lcmdlZDogZmFsc2UsIGRyYWZ0OiBmYWxzZSB9KSk7XG5cblx0XHRjb25zdCBwciA9IGF3YWl0IGZldGNoZXIuZ2V0UHVsbFJlcXVlc3QoJ293bmVyJywgJ3JlcG8nLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHIuZGF0YT8uc3RhdGUsIEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3Blbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByLmRhdGE/LmlzRHJhZnQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHIuZGF0YT8ubnVtYmVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHIuZGF0YT8udGl0bGUsICdUZXN0IFBSJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFB1bGxSZXF1ZXN0IG1hcHMgbWVyZ2VkIFBSJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKG1ha2VQUlJlc3BvbnNlKHsgc3RhdGU6ICdjbG9zZWQnLCBtZXJnZWQ6IHRydWUsIGRyYWZ0OiBmYWxzZSB9KSk7XG5cblx0XHRjb25zdCBwciA9IGF3YWl0IGZldGNoZXIuZ2V0UHVsbFJlcXVlc3QoJ293bmVyJywgJ3JlcG8nLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHIuZGF0YT8uc3RhdGUsIEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuTWVyZ2VkKTtcblx0XHRhc3NlcnQub2socHIuZGF0YT8ubWVyZ2VkQXQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQdWxsUmVxdWVzdCBtYXBzIGNsb3NlZCBQUicsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZShtYWtlUFJSZXNwb25zZSh7IHN0YXRlOiAnY2xvc2VkJywgbWVyZ2VkOiBmYWxzZSwgZHJhZnQ6IGZhbHNlIH0pKTtcblxuXHRcdGNvbnN0IHByID0gYXdhaXQgZmV0Y2hlci5nZXRQdWxsUmVxdWVzdCgnb3duZXInLCAncmVwbycsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwci5kYXRhPy5zdGF0ZSwgR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5DbG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRSZXZpZXdUaHJlYWRzIHJldHVybnMgR3JhcGhRTCB0aHJlYWQgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2UobWFrZUdyYXBoUUxSZXZpZXdUaHJlYWRzUmVzcG9uc2UoW1xuXHRcdFx0bWFrZUdyYXBoUUxSZXZpZXdUaHJlYWQoe1xuXHRcdFx0XHRpZDogJ3RocmVhZC1hJyxcblx0XHRcdFx0cGF0aDogJ3NyYy9hLnRzJyxcblx0XHRcdFx0bGluZTogMTAsXG5cdFx0XHRcdGlzUmVzb2x2ZWQ6IGZhbHNlLFxuXHRcdFx0XHRjb21tZW50czogW1xuXHRcdFx0XHRcdG1ha2VHcmFwaFFMUmV2aWV3Q29tbWVudCh7IGRhdGFiYXNlSWQ6IDEwMCwgcGF0aDogJ3NyYy9hLnRzJywgbGluZTogMTAgfSksXG5cdFx0XHRcdFx0bWFrZUdyYXBoUUxSZXZpZXdDb21tZW50KHsgZGF0YWJhc2VJZDogMTAxLCBwYXRoOiAnc3JjL2EudHMnLCBsaW5lOiAxMCwgcmVwbHlUb0RhdGFiYXNlSWQ6IDEwMCB9KSxcblx0XHRcdFx0XSxcblx0XHRcdH0pLFxuXHRcdFx0bWFrZUdyYXBoUUxSZXZpZXdUaHJlYWQoe1xuXHRcdFx0XHRpZDogJ3RocmVhZC1iJyxcblx0XHRcdFx0cGF0aDogJ3NyYy9iLnRzJyxcblx0XHRcdFx0bGluZTogMjAsXG5cdFx0XHRcdGlzUmVzb2x2ZWQ6IHRydWUsXG5cdFx0XHRcdGNvbW1lbnRzOiBbbWFrZUdyYXBoUUxSZXZpZXdDb21tZW50KHsgZGF0YWJhc2VJZDogMjAwLCBwYXRoOiAnc3JjL2IudHMnLCBsaW5lOiAyMCB9KV0sXG5cdFx0XHR9KSxcblx0XHRdKSk7XG5cblx0XHRjb25zdCB0aHJlYWRzID0gYXdhaXQgZmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzKCdvd25lcicsICdyZXBvJywgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZHMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IHRocmVhZDEgPSB0aHJlYWRzLmZpbmQodCA9PiB0LmlkID09PSAndGhyZWFkLWEnKSE7XG5cdFx0YXNzZXJ0Lm9rKHRocmVhZDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQxLmNvbW1lbnRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDEucGF0aCwgJ3NyYy9hLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDEubGluZSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQxLmNvbW1lbnRzWzBdLnRocmVhZElkLCAndGhyZWFkLWEnKTtcblxuXHRcdGNvbnN0IHRocmVhZDIgPSB0aHJlYWRzLmZpbmQodCA9PiB0LmlkID09PSAndGhyZWFkLWInKSE7XG5cdFx0YXNzZXJ0Lm9rKHRocmVhZDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQyLmNvbW1lbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDIucGF0aCwgJ3NyYy9iLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVhZDIuaXNSZXNvbHZlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVUaHJlYWQgdXNlcyBHcmFwaFFMIG11dGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKHtcblx0XHRcdHJlc29sdmVSZXZpZXdUaHJlYWQ6IHtcblx0XHRcdFx0dGhyZWFkOiB7XG5cdFx0XHRcdFx0aXNSZXNvbHZlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBmZXRjaGVyLnJlc29sdmVUaHJlYWQoJ293bmVyJywgJ3JlcG8nLCAndGhyZWFkLWEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0FwaS5ncmFwaHFsQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vY2tBcGkuZ3JhcGhxbENhbGxzWzBdLnZhcmlhYmxlcywgeyB0aHJlYWRJZDogJ3RocmVhZC1hJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UmV2aWV3cyBtYXBzIEFQSSByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZShbXG5cdFx0XHR7IGlkOiAxLCB1c2VyOiB7IGxvZ2luOiAncmV2aWV3ZXInLCBhdmF0YXJfdXJsOiAnJyB9LCBzdGF0ZTogJ0FQUFJPVkVEJywgc3VibWl0dGVkX2F0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonIH0sXG5cdFx0XHR7IGlkOiAyLCB1c2VyOiB7IGxvZ2luOiAnb3RoZXInLCBhdmF0YXJfdXJsOiAnJyB9LCBzdGF0ZTogJ0NIQU5HRVNfUkVRVUVTVEVEJywgc3VibWl0dGVkX2F0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZXZpZXdzID0gYXdhaXQgZmV0Y2hlci5nZXRSZXZpZXdzKCdvd25lcicsICdyZXBvJywgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXZpZXdzLmRhdGEsIFtcblx0XHRcdHsgaWQ6IDEsIGF1dGhvcjogeyBsb2dpbjogJ3Jldmlld2VyJywgYXZhdGFyVXJsOiAnJyB9LCBzdGF0ZTogJ0FQUFJPVkVEJywgc3VibWl0dGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicgfSxcblx0XHRcdHsgaWQ6IDIsIGF1dGhvcjogeyBsb2dpbjogJ290aGVyJywgYXZhdGFyVXJsOiAnJyB9LCBzdGF0ZTogJ0NIQU5HRVNfUkVRVUVTVEVEJywgc3VibWl0dGVkQXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwWicgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0FwaS5yZXF1ZXN0Q2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0FwaS5yZXF1ZXN0Q2FsbHNbMF0ucGF0aCwgJy9yZXBvcy9vd25lci9yZXBvL3B1bGxzLzEvcmV2aWV3cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlTWVyZ2VhYmlsaXR5IGRldGVjdHMgZHJhZnQgYmxvY2tlcicsICgpID0+IHtcblx0XHRjb25zdCBwciA9IG1ha2VQUih7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IHRydWUsIG1lcmdlYWJsZTogdHJ1ZSwgbWVyZ2VhYmxlU3RhdGU6ICdjbGVhbicgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZU1lcmdlYWJpbGl0eShwciwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2FuTWVyZ2UsIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJsb2NrZXJzLnNvbWUoYiA9PiBiLmtpbmQgPT09IE1lcmdlQmxvY2tlcktpbmQuRHJhZnQpKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZU1lcmdlYWJpbGl0eSBkZXRlY3RzIGNvbmZsaWN0cyBibG9ja2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByID0gbWFrZVBSKHsgc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbiwgaXNEcmFmdDogZmFsc2UsIG1lcmdlYWJsZTogZmFsc2UsIG1lcmdlYWJsZVN0YXRlOiAnZGlydHknIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVNZXJnZWFiaWxpdHkocHIsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNhbk1lcmdlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ibG9ja2Vycy5zb21lKGIgPT4gYi5raW5kID09PSBNZXJnZUJsb2NrZXJLaW5kLkNvbmZsaWN0cykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlTWVyZ2VhYmlsaXR5IGRldGVjdHMgY2hhbmdlcyByZXF1ZXN0ZWQgYmxvY2tlcicsICgpID0+IHtcblx0XHRjb25zdCBwciA9IG1ha2VQUih7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBtZXJnZWFibGU6IHRydWUsIG1lcmdlYWJsZVN0YXRlOiAnY2xlYW4nIH0pO1xuXHRcdGNvbnN0IHJldmlld3M6IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1tdID0gW1xuXHRcdFx0eyBpZDogMSwgYXV0aG9yOiB7IGxvZ2luOiAncmV2aWV3ZXInLCBhdmF0YXJVcmw6ICcnIH0sIHN0YXRlOiAnQ0hBTkdFU19SRVFVRVNURUQnLCBzdWJtaXR0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZU1lcmdlYWJpbGl0eShwciwgcmV2aWV3cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jYW5NZXJnZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYmxvY2tlcnMuc29tZShiID0+IGIua2luZCA9PT0gTWVyZ2VCbG9ja2VyS2luZC5DaGFuZ2VzUmVxdWVzdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVNZXJnZWFiaWxpdHkgcmV0dXJucyBjYW5NZXJnZSBmb3IgY2xlYW4gb3BlbiBQUicsICgpID0+IHtcblx0XHRjb25zdCBwciA9IG1ha2VQUih7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBtZXJnZWFibGU6IHRydWUsIG1lcmdlYWJsZVN0YXRlOiAnY2xlYW4nIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVNZXJnZWFiaWxpdHkocHIsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNhbk1lcmdlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJsb2NrZXJzLmxlbmd0aCwgMCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdHaXRIdWJQUkNJRmV0Y2hlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1vY2tBcGk6IE1vY2tBcGlDbGllbnQ7XG5cdGxldCBmZXRjaGVyOiBHaXRIdWJQUkNJRmV0Y2hlcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9ja0FwaSA9IG5ldyBNb2NrQXBpQ2xpZW50KCk7XG5cdFx0ZmV0Y2hlciA9IG5ldyBHaXRIdWJQUkNJRmV0Y2hlcihtb2NrQXBpIGFzIHVua25vd24gYXMgR2l0SHViQXBpQ2xpZW50KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZ2V0Q2hlY2tSdW5zIG1hcHMgY2hlY2sgcnVucycsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZSh7XG5cdFx0XHR0b3RhbF9jb3VudDogMixcblx0XHRcdGNoZWNrX3J1bnM6IFtcblx0XHRcdFx0eyBpZDogMSwgbmFtZTogJ2J1aWxkJywgc3RhdHVzOiAnY29tcGxldGVkJywgY29uY2x1c2lvbjogJ3N1Y2Nlc3MnLCBzdGFydGVkX2F0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLCBjb21wbGV0ZWRfYXQ6ICcyMDI0LTAxLTAxVDAwOjEwOjAwWicsIGRldGFpbHNfdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8xJyB9LFxuXHRcdFx0XHR7IGlkOiAyLCBuYW1lOiAndGVzdCcsIHN0YXR1czogJ2luX3Byb2dyZXNzJywgY29uY2x1c2lvbjogbnVsbCwgc3RhcnRlZF9hdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJywgY29tcGxldGVkX2F0OiBudWxsLCBkZXRhaWxzX3VybDogbnVsbCB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoZWNrcyA9IGF3YWl0IGZldGNoZXIuZ2V0Q2hlY2tSdW5zKCdvd25lcicsICdyZXBvJywgJ2FiYzEyMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3MuZGF0YT8ubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoZWNrcy5kYXRhPy5bMF0sIHtcblx0XHRcdGlkOiAxLFxuXHRcdFx0bmFtZTogJ2J1aWxkJyxcblx0XHRcdHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0Y29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3MsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRjb21wbGV0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MTA6MDBaJyxcblx0XHRcdGRldGFpbHNVcmw6ICdodHRwczovL2V4YW1wbGUuY29tLzEnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3MuZGF0YT8uWzFdLmNvbmNsdXNpb24sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENoZWNrUnVuQW5ub3RhdGlvbnMgcmV0dXJucyBmb3JtYXR0ZWQgYW5ub3RhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2UoW1xuXHRcdFx0eyBwYXRoOiAnc3JjL2EudHMnLCBzdGFydF9saW5lOiAxMCwgZW5kX2xpbmU6IDEwLCBhbm5vdGF0aW9uX2xldmVsOiAnZmFpbHVyZScsIG1lc3NhZ2U6ICd0eXBlIGVycm9yJywgdGl0bGU6ICdUUzIzNDUnIH0sXG5cdFx0XHR7IHBhdGg6ICdzcmMvYi50cycsIHN0YXJ0X2xpbmU6IDUsIGVuZF9saW5lOiA4LCBhbm5vdGF0aW9uX2xldmVsOiAnd2FybmluZycsIG1lc3NhZ2U6ICd1bnVzZWQgdmFyJywgdGl0bGU6IG51bGwgfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoZXIuZ2V0Q2hlY2tSdW5Bbm5vdGF0aW9ucygnb3duZXInLCAncmVwbycsIDEpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1tmYWlsdXJlXSBzcmMvYS50czoxMCcpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCcoVFMyMzQ1KScpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdbd2FybmluZ10gc3JjL2IudHM6NS04JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXJ1bkZhaWxlZEpvYnMgc2VuZHMgUE9TVCB0byBjb3JyZWN0IGVuZHBvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBmZXRjaGVyLnJlcnVuRmFpbGVkSm9icygnbXlPd25lcicsICdteVJlcG8nLCAxMjM0NSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0FwaS5yZXF1ZXN0Q2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vY2tBcGkucmVxdWVzdENhbGxzWzBdLCB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdHBhdGg6ICcvcmVwb3MvbXlPd25lci9teVJlcG8vYWN0aW9ucy9ydW5zLzEyMzQ1L3JlcnVuLWZhaWxlZC1qb2JzJyxcblx0XHRcdGJvZHk6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvbXB1dGVPdmVyYWxsQ0lTdGF0dXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBuZXV0cmFsIGZvciBlbXB0eSBjaGVja3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVPdmVyYWxsQ0lTdGF0dXMoW10pLCBHaXRIdWJDSU92ZXJhbGxTdGF0dXMuTmV1dHJhbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgc3VjY2VzcyB3aGVuIGFsbCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoZWNrcyA9IFtcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyB9KSxcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uTmV1dHJhbCB9KSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlT3ZlcmFsbENJU3RhdHVzKGNoZWNrcyksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5TdWNjZXNzKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBmYWlsdXJlIHdoZW4gYW55IGNoZWNrIGZhaWxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjaGVja3MgPSBbXG5cdFx0XHRtYWtlQ2hlY2soeyBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3MgfSksXG5cdFx0XHRtYWtlQ2hlY2soeyBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLkZhaWx1cmUgfSksXG5cdFx0XTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZU92ZXJhbGxDSVN0YXR1cyhjaGVja3MpLCBHaXRIdWJDSU92ZXJhbGxTdGF0dXMuRmFpbHVyZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgcGVuZGluZyB3aGVuIGFueSBjaGVjayBpcyBpbiBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCBjaGVja3MgPSBbXG5cdFx0XHRtYWtlQ2hlY2soeyBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3MgfSksXG5cdFx0XHRtYWtlQ2hlY2soeyBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkluUHJvZ3Jlc3MsIGNvbmNsdXNpb246IHVuZGVmaW5lZCB9KSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlT3ZlcmFsbENJU3RhdHVzKGNoZWNrcyksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5QZW5kaW5nKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbHVyZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgcGVuZGluZycsICgpID0+IHtcblx0XHRjb25zdCBjaGVja3MgPSBbXG5cdFx0XHRtYWtlQ2hlY2soeyBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLkZhaWx1cmUgfSksXG5cdFx0XHRtYWtlQ2hlY2soeyBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkluUHJvZ3Jlc3MsIGNvbmNsdXNpb246IHVuZGVmaW5lZCB9KSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlT3ZlcmFsbENJU3RhdHVzKGNoZWNrcyksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5GYWlsdXJlKTtcblx0fSk7XG59KTtcblxuXG4vLyNyZWdpb24gVGVzdCBIZWxwZXJzXG5cbmZ1bmN0aW9uIG1ha2VQUihvdmVycmlkZXM6IHtcblx0c3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGU7XG5cdGlzRHJhZnQ6IGJvb2xlYW47XG5cdG1lcmdlYWJsZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0bWVyZ2VhYmxlU3RhdGU6IHN0cmluZztcbn0pOiBJR2l0SHViUHVsbFJlcXVlc3Qge1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcjogMSxcblx0XHR0aXRsZTogJ1Rlc3QgUFInLFxuXHRcdGJvZHk6ICdUZXN0IGJvZHknLFxuXHRcdHN0YXRlOiBvdmVycmlkZXMuc3RhdGUsXG5cdFx0YXV0aG9yOiB7IGxvZ2luOiAnYXV0aG9yJywgYXZhdGFyVXJsOiAnJyB9LFxuXHRcdGhlYWRSZWY6ICdmZWF0dXJlJyxcblx0XHRoZWFkU2hhOiAnYWJjMTIzJyxcblx0XHRiYXNlUmVmOiAnbWFpbicsXG5cdFx0aXNEcmFmdDogb3ZlcnJpZGVzLmlzRHJhZnQsXG5cdFx0Y3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuXHRcdHVwZGF0ZWRBdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyxcblx0XHRtZXJnZWRBdDogdW5kZWZpbmVkLFxuXHRcdG1lcmdlYWJsZTogb3ZlcnJpZGVzLm1lcmdlYWJsZSxcblx0XHRtZXJnZWFibGVTdGF0ZTogb3ZlcnJpZGVzLm1lcmdlYWJsZVN0YXRlLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUFJSZXNwb25zZShvdmVycmlkZXM6IHtcblx0c3RhdGU6ICdvcGVuJyB8ICdjbG9zZWQnO1xuXHRtZXJnZWQ6IGJvb2xlYW47XG5cdGRyYWZ0OiBib29sZWFuO1xuXHRtZXJnZWFibGU/OiBib29sZWFuIHwgbnVsbDtcblx0bWVyZ2VhYmxlX3N0YXRlPzogc3RyaW5nO1xufSk6IHVua25vd24ge1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcjogMSxcblx0XHR0aXRsZTogJ1Rlc3QgUFInLFxuXHRcdGJvZHk6ICdUZXN0IGJvZHknLFxuXHRcdHN0YXRlOiBvdmVycmlkZXMuc3RhdGUsXG5cdFx0ZHJhZnQ6IG92ZXJyaWRlcy5kcmFmdCxcblx0XHR1c2VyOiB7IGxvZ2luOiAnYXV0aG9yJywgYXZhdGFyX3VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXZhdGFyJyB9LFxuXHRcdGhlYWQ6IHsgcmVmOiAnZmVhdHVyZS1icmFuY2gnIH0sXG5cdFx0YmFzZTogeyByZWY6ICdtYWluJyB9LFxuXHRcdGNyZWF0ZWRfYXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0dXBkYXRlZF9hdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyxcblx0XHRtZXJnZWRfYXQ6IG92ZXJyaWRlcy5tZXJnZWQgPyAnMjAyNC0wMS0wMlQwMDowMDowMFonIDogbnVsbCxcblx0XHRtZXJnZWFibGU6IG92ZXJyaWRlcy5tZXJnZWFibGUgPz8gdHJ1ZSxcblx0XHRtZXJnZWFibGVfc3RhdGU6IG92ZXJyaWRlcy5tZXJnZWFibGVfc3RhdGUgPz8gJ2NsZWFuJyxcblx0XHRtZXJnZWQ6IG92ZXJyaWRlcy5tZXJnZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VHcmFwaFFMUmV2aWV3VGhyZWFkc1Jlc3BvbnNlKHRocmVhZHM6IHJlYWRvbmx5IFJldHVyblR5cGU8dHlwZW9mIG1ha2VHcmFwaFFMUmV2aWV3VGhyZWFkPltdKTogdW5rbm93biB7XG5cdHJldHVybiB7XG5cdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0cmV2aWV3VGhyZWFkczoge1xuXHRcdFx0XHRcdG5vZGVzOiB0aHJlYWRzLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlR3JhcGhRTFJldmlld1RocmVhZChvdmVycmlkZXM6IFBhcnRpYWw8e1xuXHRpZDogc3RyaW5nO1xuXHRpc1Jlc29sdmVkOiBib29sZWFuO1xuXHRwYXRoOiBzdHJpbmc7XG5cdGxpbmU6IG51bWJlcjtcblx0Y29tbWVudHM6IHJlYWRvbmx5IFJldHVyblR5cGU8dHlwZW9mIG1ha2VHcmFwaFFMUmV2aWV3Q29tbWVudD5bXTtcbn0+ID0ge30pOiB1bmtub3duIHtcblx0cmV0dXJuIHtcblx0XHRpZDogb3ZlcnJpZGVzLmlkID8/ICd0aHJlYWQtMScsXG5cdFx0aXNSZXNvbHZlZDogb3ZlcnJpZGVzLmlzUmVzb2x2ZWQgPz8gZmFsc2UsXG5cdFx0cGF0aDogb3ZlcnJpZGVzLnBhdGggPz8gJ3NyYy9hLnRzJyxcblx0XHRsaW5lOiBvdmVycmlkZXMubGluZSA/PyAxMCxcblx0XHRjb21tZW50czoge1xuXHRcdFx0bm9kZXM6IG92ZXJyaWRlcy5jb21tZW50cyA/PyBbbWFrZUdyYXBoUUxSZXZpZXdDb21tZW50KCldLFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VHcmFwaFFMUmV2aWV3Q29tbWVudChvdmVycmlkZXM6IFBhcnRpYWw8e1xuXHRkYXRhYmFzZUlkOiBudW1iZXI7XG5cdGJvZHk6IHN0cmluZztcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lOiBudW1iZXI7XG5cdHJlcGx5VG9EYXRhYmFzZUlkOiBudW1iZXI7XG59PiA9IHt9KTogdW5rbm93biB7XG5cdHJldHVybiB7XG5cdFx0ZGF0YWJhc2VJZDogb3ZlcnJpZGVzLmRhdGFiYXNlSWQgPz8gMTAwLFxuXHRcdGJvZHk6IG92ZXJyaWRlcy5ib2R5ID8/ICdUZXN0IGNvbW1lbnQnLFxuXHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0cGF0aDogb3ZlcnJpZGVzLnBhdGggPz8gJ3NyYy9hLnRzJyxcblx0XHRsaW5lOiBvdmVycmlkZXMubGluZSA/PyAxMCxcblx0XHRvcmlnaW5hbExpbmU6IG92ZXJyaWRlcy5saW5lID8/IDEwLFxuXHRcdHJlcGx5VG86IG92ZXJyaWRlcy5yZXBseVRvRGF0YWJhc2VJZCAhPT0gdW5kZWZpbmVkID8geyBkYXRhYmFzZUlkOiBvdmVycmlkZXMucmVwbHlUb0RhdGFiYXNlSWQgfSA6IG51bGwsXG5cdFx0YXV0aG9yOiB7XG5cdFx0XHRsb2dpbjogJ3Jldmlld2VyJyxcblx0XHRcdGF2YXRhclVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXZhdGFyJyxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlQ2hlY2sob3ZlcnJpZGVzOiB7XG5cdHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXM7XG5cdGNvbmNsdXNpb246IEdpdEh1YkNoZWNrQ29uY2x1c2lvbiB8IHVuZGVmaW5lZDtcbn0pOiB7IGlkOiBudW1iZXI7IG5hbWU6IHN0cmluZzsgc3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1czsgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uIHwgdW5kZWZpbmVkOyBzdGFydGVkQXQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgY29tcGxldGVkQXQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgZGV0YWlsc1VybDogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAxLFxuXHRcdG5hbWU6ICd0ZXN0LWNoZWNrJyxcblx0XHRzdGF0dXM6IG92ZXJyaWRlcy5zdGF0dXMsXG5cdFx0Y29uY2x1c2lvbjogb3ZlcnJpZGVzLmNvbmNsdXNpb24sXG5cdFx0c3RhcnRlZEF0OiB1bmRlZmluZWQsXG5cdFx0Y29tcGxldGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRkZXRhaWxzVXJsOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLDJCQUEyQjtBQUNyRCxTQUFTLG1CQUFtQiw4QkFBOEI7QUFDMUQsU0FBUywrQkFBK0I7QUFDeEMsU0FBMEIsc0JBQWdEO0FBQzFFLFNBQVMs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
