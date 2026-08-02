import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from "../../common/agentService.js";
import { buildSessionChangesetUri } from "../../common/changesetUri.js";
import { withSessionGitHubState, withSessionGitState, MessageKind, ResponsePartKind, SessionStatus, TurnState } from "../../common/state/sessionState.js";
import { AgentHostPullRequestOperationHandler } from "../../node/agentHostPullRequestOperationHandler.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
class TestCopilotApiService {
  constructor() {
    this.calls = [];
    this.response = "Generated PR title\n\nGenerated PR description.";
  }
  messages() {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
  }
  async responses() {
    throw new Error("not used");
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  async utilityChatCompletion(githubToken, request, options) {
    this.calls.push({ token: githubToken, request, options });
    if (this.error) {
      throw this.error;
    }
    return this.response;
  }
}
class TestGitService {
  constructor() {
    this.calls = [];
    this.pushOptions = [];
    this.uncommitted = false;
    this.upstream = false;
    this.branchChanges = [{ after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } } }];
  }
  async getCurrentBranch() {
    return "feature/test";
  }
  async getDefaultBranch() {
    return { name: "main", startPoint: "main" };
  }
  async getBranch() {
    return void 0;
  }
  async getRefs() {
    return [];
  }
  async getBranches() {
    return [];
  }
  async getRepositoryRoot() {
    return URI.file("/repo");
  }
  async getWorktreeRoots() {
    return [];
  }
  async addWorktree() {
  }
  async copyWorktreeIncludeFiles() {
  }
  async addExistingWorktree() {
  }
  async removeWorktree() {
  }
  async branchExists() {
    return false;
  }
  async hasUncommittedChanges() {
    this.calls.push("hasUncommittedChanges");
    return this.uncommitted;
  }
  async commitAll(_workingDirectory, message) {
    this.calls.push(`commitAll:${message}`);
    this.uncommitted = false;
  }
  async restore() {
  }
  async hasUpstream() {
    this.calls.push("hasUpstream");
    return this.upstream;
  }
  async pull() {
  }
  async push(_workingDirectory, options) {
    this.calls.push(`push:${options.ref}:${options.setUpstream}`);
    this.pushOptions.push(options);
  }
  async getSessionGitState() {
    return this.gitState;
  }
  async computeSessionFileDiffs() {
    this.calls.push("computeSessionFileDiffs");
    return this.branchChanges;
  }
  async showBlob() {
    return void 0;
  }
  async captureWorkingTreeAsTree() {
    return void 0;
  }
  async commitTree() {
    return void 0;
  }
  async updateRef() {
  }
  async deleteRefs() {
  }
  async revParse() {
    return void 0;
  }
  async resolveBranchBaselineCommit() {
    return void 0;
  }
  async overlayPathIntoTree() {
    return void 0;
  }
  async diffTreePaths() {
    return void 0;
  }
  async computeFileDiffsBetweenRefs() {
    return void 0;
  }
  async getFetchRemoteUrls() {
    return void 0;
  }
  async getUntrackedPaths() {
    return [];
  }
  async getBranchDiffSafetyInfo() {
    return void 0;
  }
  async getDiffPatchBetweenRefs() {
    return void 0;
  }
}
class TestOctoKitService {
  constructor() {
    this.calls = [];
    this.created = { url: "https://github.com/microsoft/vscode/pull/123", number: 123, nodeId: "PR_node_123" };
    this.findRequests = [];
  }
  async createPullRequest(_owner, _repo, title, body, head, _base, draft, _token, _signal) {
    this.calls.push(`createPullRequest:${draft}`);
    this.lastTitle = title;
    this.lastBody = body;
    this.lastHead = head;
    if (this.createError) {
      throw this.createError;
    }
    return this.created;
  }
  async findPullRequestByHeadBranch(_owner, _repo, branch, _token, _signal, headOwner) {
    this.calls.push(`findPullRequestByHeadBranch:${branch}`);
    this.findRequests.push({ branch, headOwner });
    if (this.calls.some((call) => call.startsWith("createPullRequest:"))) {
      if (this.findAfterCreateError) {
        throw this.findAfterCreateError;
      }
      return this.existingAfterCreateFailure;
    }
    return this.existing;
  }
  async enablePullRequestAutoMerge(pullRequestId, mergeMethod, _token, _signal) {
    this.calls.push(`enablePullRequestAutoMerge:${pullRequestId}:${mergeMethod}`);
    if (this.autoMergeError) {
      throw this.autoMergeError;
    }
  }
}
function createAgentService(withCopilotToken = false) {
  return {
    getAuthToken: (resource) => {
      if (resource.resource === GITHUB_REPO_PROTECTED_RESOURCE.resource) {
        return "gh-token";
      }
      if (withCopilotToken && resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
        return "copilot-token";
      }
      return void 0;
    }
  };
}
function setup(disposables, gitService, octoKitService, options) {
  const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
  const session = URI.parse("agent:/session");
  const createdEvents = [];
  stateManager.createSession({
    resource: session.toString(),
    provider: "copilot",
    title: "Session",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    workingDirectories: [URI.file("/repo").toString()]
  });
  const sessionMeta = withSessionGitHubState(withSessionGitState(void 0, {
    hasGitHubRemote: true,
    githubOwner: "microsoft",
    githubRepo: "vscode",
    branchName: "feature/test",
    baseBranchName: "main"
  }), {
    owner: "microsoft",
    repo: "vscode"
  });
  stateManager.setSessionMeta(session.toString(), sessionMeta);
  const copilotApiService = options?.copilotApiService ?? new TestCopilotApiService();
  return {
    handler: new AgentHostPullRequestOperationHandler(
      options?.draft ?? false,
      options?.autoMergeMethod,
      (sessionKey) => {
        const state = stateManager.getSessionState(sessionKey);
        if (state && options?.turns) {
          return { ...state, turns: options.turns };
        }
        return state;
      },
      (event) => createdEvents.push(`${event.sessionKey}:${event.pullRequestUrl}`),
      createAgentService(options?.withCopilotToken),
      gitService,
      octoKitService,
      createTestGitHubEndpointService(),
      copilotApiService,
      new NullLogService()
    ),
    session,
    createdEvents,
    copilotApiService
  };
}
suite("AgentHostPullRequestOperationHandler", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("commits uncommitted changes before pushing and creating a pull request", async () => {
    const gitService = new TestGitService();
    gitService.uncommitted = true;
    const octoKitService = new TestOctoKitService();
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      gitCalls: gitService.calls,
      octoCalls: octoKitService.calls,
      createdEvents
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123)." },
      gitCalls: [
        "hasUncommittedChanges",
        "commitAll:Agent Host changes for feature/test",
        "computeSessionFileDiffs",
        "hasUpstream",
        "push:feature/test:true"
      ],
      octoCalls: [
        "findPullRequestByHeadBranch:feature/test",
        "createPullRequest:false"
      ],
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/123"]
    });
  });
  test("pushes, finds, and creates with the same fork upstream", async () => {
    const gitService = new TestGitService();
    gitService.upstream = true;
    gitService.gitState = {
      branchName: "feature/test",
      baseBranchName: "main",
      upstreamBranchName: "fork/published-feature",
      githubOwner: "microsoft",
      githubHeadOwner: "fork-owner",
      githubRepo: "vscode"
    };
    const octoKitService = new TestOctoKitService();
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      pushOptions: gitService.pushOptions,
      findRequests: octoKitService.findRequests,
      createHead: octoKitService.lastHead
    }, {
      pushOptions: [{ remote: "fork", ref: "feature/test:published-feature", setUpstream: false }],
      findRequests: [{ branch: "published-feature", headOwner: "fork-owner" }],
      createHead: "fork-owner:published-feature"
    });
  });
  test("returns an existing pull request without creating a duplicate", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.existing = { url: "https://github.com/microsoft/vscode/pull/7", number: 7 };
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      octoCalls: octoKitService.calls,
      followUp: result.followUp,
      createdEvents
    }, {
      message: { markdown: "Pull request [#7](https://github.com/microsoft/vscode/pull/7) already exists." },
      octoCalls: ["findPullRequestByHeadBranch:feature/test"],
      followUp: { content: { uri: "https://github.com/microsoft/vscode/pull/7", contentType: "text/html" }, external: true },
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/7"]
    });
  });
  test("does not call GitHub when there are no branch changes", async () => {
    const gitService = new TestGitService();
    gitService.branchChanges = [];
    const octoKitService = new TestOctoKitService();
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
      /no branch changes/
    );
    assert.deepStrictEqual(octoKitService.calls, []);
  });
  test("does not push or call GitHub when branch changes cannot be computed", async () => {
    const gitService = new TestGitService();
    gitService.branchChanges = void 0;
    const octoKitService = new TestOctoKitService();
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
      /Could not compute branch changes/
    );
    assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: octoKitService.calls }, {
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs"],
      octoCalls: []
    });
  });
  test("returns existing pull request found after create failure", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.createError = new Error("Validation Failed");
    octoKitService.existingAfterCreateFailure = { url: "https://github.com/microsoft/vscode/pull/8", number: 8 };
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({ message: result.message, octoCalls: octoKitService.calls, createdEvents }, {
      message: { markdown: "Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists." },
      octoCalls: ["findPullRequestByHeadBranch:feature/test", "createPullRequest:false", "findPullRequestByHeadBranch:feature/test"],
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/8"]
    });
  });
  test("preserves create failure when existing pull request recovery fails", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.createError = new Error("create failed");
    octoKitService.findAfterCreateError = new Error("find failed");
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
      /create failed/
    );
  });
  test("honors cancellation before mutating the repository", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const cts = new CancellationTokenSource();
    disposables.add(cts);
    cts.cancel();
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, cts.token),
      /Pull request operation was cancelled/
    );
    assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: octoKitService.calls, createdEvents }, {
      gitCalls: [],
      octoCalls: [],
      createdEvents: []
    });
  });
  test("generates the PR title and description from the conversation via the model", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const turns = [{
      id: "turn-1",
      message: { text: "Add retry logic to the uploader", origin: { kind: MessageKind.User } },
      responseParts: [
        { kind: ResponsePartKind.Reasoning, id: "r1", content: "SECRET_REASONING_SHOULD_BE_EXCLUDED" },
        { kind: ResponsePartKind.Markdown, id: "m1", content: "I added exponential backoff to the uploader." }
      ],
      usage: void 0,
      state: TurnState.Complete
    }];
    const { handler, session, copilotApiService } = setup(disposables, gitService, octoKitService, { withCopilotToken: true, turns });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    const userContent = copilotApiService.calls[0]?.request.messages.find((m) => m.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      message: result.message,
      token: copilotApiService.calls[0]?.token,
      title: octoKitService.lastTitle,
      body: octoKitService.lastBody,
      includesUserRequest: userContent.includes("Add retry logic to the uploader"),
      includesAgentResponse: userContent.includes("I added exponential backoff to the uploader."),
      excludesReasoning: !userContent.includes("SECRET_REASONING_SHOULD_BE_EXCLUDED")
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123)." },
      token: "copilot-token",
      title: "Generated PR title",
      body: "Generated PR description.",
      includesUserRequest: true,
      includesAgentResponse: true,
      excludesReasoning: true
    });
  });
  test("falls back to branch-name title and description without a Copilot token", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const { handler, session, copilotApiService } = setup(disposables, gitService, octoKitService);
    await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      utilityCalls: copilotApiService.calls.length,
      title: octoKitService.lastTitle,
      body: octoKitService.lastBody
    }, {
      utilityCalls: 0,
      title: "feature: test",
      body: "Created from `feature/test` targeting `main`."
    });
  });
  test("falls back to branch-name title and description when generation fails", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("utility model unavailable");
    const { handler, session } = setup(disposables, gitService, octoKitService, { withCopilotToken: true, copilotApiService });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      title: octoKitService.lastTitle,
      body: octoKitService.lastBody
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123)." },
      title: "feature: test",
      body: "Created from `feature/test` targeting `main`."
    });
  });
  test("enables auto-merge with the requested merge method after creating the pull request", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { autoMergeMethod: "SQUASH" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      octoCalls: octoKitService.calls,
      createdEvents
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123) with auto-merge (squash) enabled." },
      octoCalls: [
        "findPullRequestByHeadBranch:feature/test",
        "createPullRequest:false",
        "enablePullRequestAutoMerge:PR_node_123:SQUASH"
      ],
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/123"]
    });
  });
  test("reports but does not fail when auto-merge cannot be enabled", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.autoMergeError = new Error("Auto-merge is not allowed for this repository");
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { autoMergeMethod: "MERGE" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      createdEvents
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123), but auto-merge could not be enabled: Auto-merge is not allowed for this repository" },
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/123"]
    });
  });
  test("reports when the pull request node id is missing for auto-merge", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.created = { url: "https://github.com/microsoft/vscode/pull/55", number: 55 };
    const { handler, session } = setup(disposables, gitService, octoKitService, { autoMergeMethod: "REBASE" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      enableCalled: octoKitService.calls.some((call) => call.startsWith("enablePullRequestAutoMerge:"))
    }, {
      message: { markdown: "Created pull request [#55](https://github.com/microsoft/vscode/pull/55), but auto-merge could not be enabled: the pull request identifier was not returned by GitHub." },
      enableCalled: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UsIEdJVEhVQl9SRVBPX1BST1RFQ1RFRF9SRVNPVVJDRSwgdHlwZSBJQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IHdpdGhTZXNzaW9uR2l0SHViU3RhdGUsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHR5cGUgSVNlc3Npb25GaWxlRGlmZiwgdHlwZSBJU2Vzc2lvbkdpdFN0YXRlLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgVHVyblN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdEdpdFNlcnZpY2UsIElCcmFuY2gsIElEZWZhdWx0QnJhbmNoLCBJUHVzaE9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgQXV0b01lcmdlTWV0aG9kLCBDcmVhdGVkUHVsbFJlcXVlc3QsIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvcGlsb3RBcGlTZXJ2aWNlLCBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucywgSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0IH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgQW50aHJvcGljIGZyb20gJ0BhbnRocm9waWMtYWkvc2RrJztcbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcblxuY2xhc3MgVGVzdENvcGlsb3RBcGlTZXJ2aWNlIGltcGxlbWVudHMgSUNvcGlsb3RBcGlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgY2FsbHM6IHsgdG9rZW46IHN0cmluZzsgcmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0OyBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfVtdID0gW107XG5cdHJlc3BvbnNlID0gJ0dlbmVyYXRlZCBQUiB0aXRsZVxcblxcbkdlbmVyYXRlZCBQUiBkZXNjcmlwdGlvbi4nO1xuXHRlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0bWVzc2FnZXMoX2dpdGh1YlRva2VuOiBzdHJpbmcsIF9yZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc1N0cmVhbWluZywgX29wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgX3JlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zTm9uU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT47XG5cdG1lc3NhZ2VzKCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHwgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTtcblx0fVxuXHRhc3luYyBjb3VudFRva2VucygpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlVG9rZW5zQ291bnQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpOyB9XG5cdGFzeW5jIG1vZGVscygpOiBQcm9taXNlPENDQU1vZGVsW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIHJlc3BvbnNlcygpOiBQcm9taXNlPFJlc3BvbnNlPiB7IHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTsgfVxuXHRhc3luYyByZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoKSB7IHJldHVybiB7IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiBmYWxzZSwgdHJhY2tpbmdJZDogdW5kZWZpbmVkLCB0ZWxlbWV0cnlFbmRwb2ludDogdW5kZWZpbmVkIH07IH1cblx0YXN5bmMgcmVzb2x2ZUFwaUVuZHBvaW50KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHV0aWxpdHlDaGF0Q29tcGxldGlvbihnaXRodWJUb2tlbjogc3RyaW5nLCByZXF1ZXN0OiBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3QsIG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKHsgdG9rZW46IGdpdGh1YlRva2VuLCByZXF1ZXN0LCBvcHRpb25zIH0pO1xuXHRcdGlmICh0aGlzLmVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZXNwb25zZTtcblx0fVxufVxuXG5jbGFzcyBUZXN0R2l0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RHaXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IHB1c2hPcHRpb25zOiBJUHVzaE9wdGlvbnNbXSA9IFtdO1xuXHR1bmNvbW1pdHRlZCA9IGZhbHNlO1xuXHR1cHN0cmVhbSA9IGZhbHNlO1xuXHRnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0YnJhbmNoQ2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkID0gW3sgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyB9IH0gfV07XG5cblx0YXN5bmMgZ2V0Q3VycmVudEJyYW5jaCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gJ2ZlYXR1cmUvdGVzdCc7IH1cblx0YXN5bmMgZ2V0RGVmYXVsdEJyYW5jaCgpOiBQcm9taXNlPElEZWZhdWx0QnJhbmNoIHwgdW5kZWZpbmVkPiB7IHJldHVybiB7IG5hbWU6ICdtYWluJywgc3RhcnRQb2ludDogJ21haW4nIH07IH1cblx0YXN5bmMgZ2V0QnJhbmNoKCk6IFByb21pc2U8SUJyYW5jaCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldFJlZnMoKTogUHJvbWlzZTxJQnJhbmNoW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldEJyYW5jaGVzKCk6IFByb21pc2U8SUJyYW5jaFtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBnZXRSZXBvc2l0b3J5Um9vdCgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4geyByZXR1cm4gVVJJLmZpbGUoJy9yZXBvJyk7IH1cblx0YXN5bmMgZ2V0V29ya3RyZWVSb290cygpOiBQcm9taXNlPFVSSVtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBhZGRXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgYWRkRXhpc3RpbmdXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZW1vdmVXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBicmFuY2hFeGlzdHMoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBoYXNVbmNvbW1pdHRlZENoYW5nZXMoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKCdoYXNVbmNvbW1pdHRlZENoYW5nZXMnKTtcblx0XHRyZXR1cm4gdGhpcy51bmNvbW1pdHRlZDtcblx0fVxuXHRhc3luYyBjb21taXRBbGwoX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKGBjb21taXRBbGw6JHttZXNzYWdlfWApO1xuXHRcdHRoaXMudW5jb21taXR0ZWQgPSBmYWxzZTtcblx0fVxuXHRhc3luYyByZXN0b3JlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGhhc1Vwc3RyZWFtKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCgnaGFzVXBzdHJlYW0nKTtcblx0XHRyZXR1cm4gdGhpcy51cHN0cmVhbTtcblx0fVxuXHRhc3luYyBwdWxsKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHB1c2goX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgb3B0aW9uczogSVB1c2hPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKGBwdXNoOiR7b3B0aW9ucy5yZWZ9OiR7b3B0aW9ucy5zZXRVcHN0cmVhbX1gKTtcblx0XHR0aGlzLnB1c2hPcHRpb25zLnB1c2gob3B0aW9ucyk7XG5cdH1cblx0YXN5bmMgZ2V0U2Vzc2lvbkdpdFN0YXRlKCk6IFByb21pc2U8SVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5naXRTdGF0ZTsgfVxuXHRhc3luYyBjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcygpOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCgnY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMnKTtcblx0XHRyZXR1cm4gdGhpcy5icmFuY2hDaGFuZ2VzO1xuXHR9XG5cdGFzeW5jIHNob3dCbG9iKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY29tbWl0VHJlZSgpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHVwZGF0ZVJlZigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBkZWxldGVSZWZzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHJldlBhcnNlKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgcmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgb3ZlcmxheVBhdGhJbnRvVHJlZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGRpZmZUcmVlUGF0aHMoKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcygpOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldEZldGNoUmVtb3RlVXJscygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldFVudHJhY2tlZFBhdGhzKCk6IFByb21pc2U8W10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldEJyYW5jaERpZmZTYWZldHlJbmZvKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0RGlmZlBhdGNoQmV0d2VlblJlZnMoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG5jbGFzcyBUZXN0T2N0b0tpdFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0ZXhpc3Rpbmc6IENyZWF0ZWRQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0ZXhpc3RpbmdBZnRlckNyZWF0ZUZhaWx1cmU6IENyZWF0ZWRQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0Y3JlYXRlRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRmaW5kQWZ0ZXJDcmVhdGVFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGF1dG9NZXJnZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0Y3JlYXRlZDogQ3JlYXRlZFB1bGxSZXF1ZXN0ID0geyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEyMycsIG51bWJlcjogMTIzLCBub2RlSWQ6ICdQUl9ub2RlXzEyMycgfTtcblx0bGFzdFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxhc3RCb2R5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxhc3RIZWFkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGZpbmRSZXF1ZXN0czogeyBicmFuY2g6IHN0cmluZzsgaGVhZE93bmVyOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cblx0YXN5bmMgY3JlYXRlUHVsbFJlcXVlc3QoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGJvZHk6IHN0cmluZywgaGVhZDogc3RyaW5nLCBfYmFzZTogc3RyaW5nLCBkcmFmdDogYm9vbGVhbiwgX3Rva2VuOiBzdHJpbmcsIF9zaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxDcmVhdGVkUHVsbFJlcXVlc3Q+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goYGNyZWF0ZVB1bGxSZXF1ZXN0OiR7ZHJhZnR9YCk7XG5cdFx0dGhpcy5sYXN0VGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLmxhc3RCb2R5ID0gYm9keTtcblx0XHR0aGlzLmxhc3RIZWFkID0gaGVhZDtcblx0XHRpZiAodGhpcy5jcmVhdGVFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5jcmVhdGVFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlZDtcblx0fVxuXHRhc3luYyBmaW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2goX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIGJyYW5jaDogc3RyaW5nLCBfdG9rZW46IHN0cmluZywgX3NpZ25hbDogQWJvcnRTaWduYWwsIGhlYWRPd25lcj86IHN0cmluZyk6IFByb21pc2U8Q3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKGBmaW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2g6JHticmFuY2h9YCk7XG5cdFx0dGhpcy5maW5kUmVxdWVzdHMucHVzaCh7IGJyYW5jaCwgaGVhZE93bmVyIH0pO1xuXHRcdGlmICh0aGlzLmNhbGxzLnNvbWUoY2FsbCA9PiBjYWxsLnN0YXJ0c1dpdGgoJ2NyZWF0ZVB1bGxSZXF1ZXN0OicpKSkge1xuXHRcdFx0aWYgKHRoaXMuZmluZEFmdGVyQ3JlYXRlRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy5maW5kQWZ0ZXJDcmVhdGVFcnJvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmV4aXN0aW5nQWZ0ZXJDcmVhdGVGYWlsdXJlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leGlzdGluZztcblx0fVxuXHRhc3luYyBlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZShwdWxsUmVxdWVzdElkOiBzdHJpbmcsIG1lcmdlTWV0aG9kOiBBdXRvTWVyZ2VNZXRob2QsIF90b2tlbjogc3RyaW5nLCBfc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaChgZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2U6JHtwdWxsUmVxdWVzdElkfToke21lcmdlTWV0aG9kfWApO1xuXHRcdGlmICh0aGlzLmF1dG9NZXJnZUVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmF1dG9NZXJnZUVycm9yO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudFNlcnZpY2Uod2l0aENvcGlsb3RUb2tlbiA9IGZhbHNlKTogSUFnZW50U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0QXV0aFRva2VuOiByZXNvdXJjZSA9PiB7XG5cdFx0XHRpZiAocmVzb3VyY2UucmVzb3VyY2UgPT09IEdJVEhVQl9SRVBPX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gJ2doLXRva2VuJztcblx0XHRcdH1cblx0XHRcdGlmICh3aXRoQ29waWxvdFRva2VuICYmIHJlc291cmNlLnJlc291cmNlID09PSBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuICdjb3BpbG90LXRva2VuJztcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0fSBhcyBJQWdlbnRTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBzZXR1cChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgZ2l0U2VydmljZTogVGVzdEdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlOiBUZXN0T2N0b0tpdFNlcnZpY2UsIG9wdGlvbnM/OiB7IGNvcGlsb3RBcGlTZXJ2aWNlPzogVGVzdENvcGlsb3RBcGlTZXJ2aWNlOyB3aXRoQ29waWxvdFRva2VuPzogYm9vbGVhbjsgdHVybnM/OiBUdXJuW107IGRyYWZ0PzogYm9vbGVhbjsgYXV0b01lcmdlTWV0aG9kPzogQXV0b01lcmdlTWV0aG9kIH0pOiB7IGhhbmRsZXI6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlcjsgc2Vzc2lvbjogVVJJOyBjcmVhdGVkRXZlbnRzOiBzdHJpbmdbXTsgY29waWxvdEFwaVNlcnZpY2U6IFRlc3RDb3BpbG90QXBpU2VydmljZSB9IHtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnYWdlbnQ6L3Nlc3Npb24nKTtcblx0Y29uc3QgY3JlYXRlZEV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdHJlc291cmNlOiBzZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHR0aXRsZTogJ1Nlc3Npb24nLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgxKS50b0lTT1N0cmluZygpLFxuXHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwbycpLnRvU3RyaW5nKCldLFxuXHR9KTtcblx0Ly8gR2l0IHN0YXRlIGFuZCBHaXRIdWIgc3RhdGUgbm93IHNoYXJlIHRoZSBzaW5nbGUgYF9tZXRhYCBiYWcuXG5cdGNvbnN0IHNlc3Npb25NZXRhID0gd2l0aFNlc3Npb25HaXRIdWJTdGF0ZSh3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwge1xuXHRcdGhhc0dpdEh1YlJlbW90ZTogdHJ1ZSxcblx0XHRnaXRodWJPd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0Z2l0aHViUmVwbzogJ3ZzY29kZScsXG5cdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvdGVzdCcsXG5cdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0fSksIHtcblx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0cmVwbzogJ3ZzY29kZScsXG5cdH0pO1xuXHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbk1ldGEoc2Vzc2lvbi50b1N0cmluZygpLCBzZXNzaW9uTWV0YSk7XG5cdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gb3B0aW9ucz8uY29waWxvdEFwaVNlcnZpY2UgPz8gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRyZXR1cm4ge1xuXHRcdGhhbmRsZXI6IG5ldyBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIoXG5cdFx0XHRvcHRpb25zPy5kcmFmdCA/PyBmYWxzZSxcblx0XHRcdG9wdGlvbnM/LmF1dG9NZXJnZU1ldGhvZCxcblx0XHRcdHNlc3Npb25LZXkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk7XG5cdFx0XHRcdGlmIChzdGF0ZSAmJiBvcHRpb25zPy50dXJucykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCB0dXJuczogb3B0aW9ucy50dXJucyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0sXG5cdFx0XHRldmVudCA9PiBjcmVhdGVkRXZlbnRzLnB1c2goYCR7ZXZlbnQuc2Vzc2lvbktleX06JHtldmVudC5wdWxsUmVxdWVzdFVybH1gKSxcblx0XHRcdGNyZWF0ZUFnZW50U2VydmljZShvcHRpb25zPy53aXRoQ29waWxvdFRva2VuKSwgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgY29waWxvdEFwaVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRzZXNzaW9uLFxuXHRcdGNyZWF0ZWRFdmVudHMsXG5cdFx0Y29waWxvdEFwaVNlcnZpY2UsXG5cdH07XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gTWF0Y2hlcyB0aGUgQ29waWxvdCBDTEkgQWdlbnQgV2luZG93IGJlaGF2aW9yOiBpZiB0aGUgc2Vzc2lvbiBoYXNcblx0Ly8gdW5jb21taXR0ZWQgd29yaywgQ3JlYXRlIFBSIGZpcnN0IGNvbW1pdHMgdGhhdCB3b3JrLCB0aGVuIHB1c2hlcyB0aGVcblx0Ly8gYnJhbmNoLCB0aGVuIGFza3MgR2l0SHViIHRvIGNyZWF0ZSB0aGUgUFIuXG5cdHRlc3QoJ2NvbW1pdHMgdW5jb21taXR0ZWQgY2hhbmdlcyBiZWZvcmUgcHVzaGluZyBhbmQgY3JlYXRpbmcgYSBwdWxsIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UudW5jb21taXR0ZWQgPSB0cnVlO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY3JlYXRlZEV2ZW50cyB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscyxcblx0XHRcdG9jdG9DYWxsczogb2N0b0tpdFNlcnZpY2UuY2FsbHMsXG5cdFx0XHRjcmVhdGVkRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDcmVhdGVkIHB1bGwgcmVxdWVzdCBbIzEyM10oaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMjMpLicgfSxcblx0XHRcdGdpdENhbGxzOiBbXG5cdFx0XHRcdCdoYXNVbmNvbW1pdHRlZENoYW5nZXMnLFxuXHRcdFx0XHQnY29tbWl0QWxsOkFnZW50IEhvc3QgY2hhbmdlcyBmb3IgZmVhdHVyZS90ZXN0Jyxcblx0XHRcdFx0J2NvbXB1dGVTZXNzaW9uRmlsZURpZmZzJyxcblx0XHRcdFx0J2hhc1Vwc3RyZWFtJyxcblx0XHRcdFx0J3B1c2g6ZmVhdHVyZS90ZXN0OnRydWUnLFxuXHRcdFx0XSxcblx0XHRcdG9jdG9DYWxsczogW1xuXHRcdFx0XHQnZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoOmZlYXR1cmUvdGVzdCcsXG5cdFx0XHRcdCdjcmVhdGVQdWxsUmVxdWVzdDpmYWxzZScsXG5cdFx0XHRdLFxuXHRcdFx0Y3JlYXRlZEV2ZW50czogWydhZ2VudDovc2Vzc2lvbjpodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEyMyddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdXNoZXMsIGZpbmRzLCBhbmQgY3JlYXRlcyB3aXRoIHRoZSBzYW1lIGZvcmsgdXBzdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UudXBzdHJlYW0gPSB0cnVlO1xuXHRcdGdpdFNlcnZpY2UuZ2l0U3RhdGUgPSB7XG5cdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS90ZXN0Jyxcblx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6ICdmb3JrL3B1Ymxpc2hlZC1mZWF0dXJlJyxcblx0XHRcdGdpdGh1Yk93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdGdpdGh1YkhlYWRPd25lcjogJ2Zvcmstb3duZXInLFxuXHRcdFx0Z2l0aHViUmVwbzogJ3ZzY29kZScsXG5cdFx0fTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24gfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHB1c2hPcHRpb25zOiBnaXRTZXJ2aWNlLnB1c2hPcHRpb25zLFxuXHRcdFx0ZmluZFJlcXVlc3RzOiBvY3RvS2l0U2VydmljZS5maW5kUmVxdWVzdHMsXG5cdFx0XHRjcmVhdGVIZWFkOiBvY3RvS2l0U2VydmljZS5sYXN0SGVhZCxcblx0XHR9LCB7XG5cdFx0XHRwdXNoT3B0aW9uczogW3sgcmVtb3RlOiAnZm9yaycsIHJlZjogJ2ZlYXR1cmUvdGVzdDpwdWJsaXNoZWQtZmVhdHVyZScsIHNldFVwc3RyZWFtOiBmYWxzZSB9XSxcblx0XHRcdGZpbmRSZXF1ZXN0czogW3sgYnJhbmNoOiAncHVibGlzaGVkLWZlYXR1cmUnLCBoZWFkT3duZXI6ICdmb3JrLW93bmVyJyB9XSxcblx0XHRcdGNyZWF0ZUhlYWQ6ICdmb3JrLW93bmVyOnB1Ymxpc2hlZC1mZWF0dXJlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gR2l0SHViIHJldHVybnMgNDIyIHdoZW4gYSBQUiBhbHJlYWR5IGV4aXN0cyBmb3IgdGhlIGJyYW5jaC4gVGhlIGhhbmRsZXJcblx0Ly8gc2hvdWxkIHByZWZsaWdodCB0aGUgYnJhbmNoIGFuZCByZXR1cm4vb3BlbiB0aGUgZXhpc3RpbmcgUFIgaW5zdGVhZCBvZlxuXHQvLyB0cnlpbmcgdG8gY3JlYXRlIGEgZHVwbGljYXRlLlxuXHR0ZXN0KCdyZXR1cm5zIGFuIGV4aXN0aW5nIHB1bGwgcmVxdWVzdCB3aXRob3V0IGNyZWF0aW5nIGEgZHVwbGljYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5leGlzdGluZyA9IHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC83JywgbnVtYmVyOiA3IH07XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjcmVhdGVkRXZlbnRzIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdG9jdG9DYWxsczogb2N0b0tpdFNlcnZpY2UuY2FsbHMsXG5cdFx0XHRmb2xsb3dVcDogcmVzdWx0LmZvbGxvd1VwLFxuXHRcdFx0Y3JlYXRlZEV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnUHVsbCByZXF1ZXN0IFsjN10oaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC83KSBhbHJlYWR5IGV4aXN0cy4nIH0sXG5cdFx0XHRvY3RvQ2FsbHM6IFsnZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoOmZlYXR1cmUvdGVzdCddLFxuXHRcdFx0Zm9sbG93VXA6IHsgY29udGVudDogeyB1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzcnLCBjb250ZW50VHlwZTogJ3RleHQvaHRtbCcgfSwgZXh0ZXJuYWw6IHRydWUgfSxcblx0XHRcdGNyZWF0ZWRFdmVudHM6IFsnYWdlbnQ6L3Nlc3Npb246aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC83J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIEEgdmlzaWJsZSBQUiBidXR0b24gY2FuIHJhY2Ugd2l0aCByZWZyZXNoZWQgZ2l0IHN0YXRlLiBJZiB0aGUgYmFja2VuZFxuXHQvLyBkaXNjb3ZlcnMgdGhhdCB0aGUgYnJhbmNoIGhhcyBubyBmaWxlIGNoYW5nZXMsIGl0IHNob3VsZCBzdG9wIGJlZm9yZVxuXHQvLyBjYWxsaW5nIEdpdEh1YiBzbyB0aGUgdXNlciBnZXRzIGEgbG9jYWwsIGFjdGlvbmFibGUgZmFpbHVyZS5cblx0dGVzdCgnZG9lcyBub3QgY2FsbCBHaXRIdWIgd2hlbiB0aGVyZSBhcmUgbm8gYnJhbmNoIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UuYnJhbmNoQ2hhbmdlcyA9IFtdO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L25vIGJyYW5jaCBjaGFuZ2VzLyxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2N0b0tpdFNlcnZpY2UuY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcHVzaCBvciBjYWxsIEdpdEh1YiB3aGVuIGJyYW5jaCBjaGFuZ2VzIGNhbm5vdCBiZSBjb21wdXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0U2VydmljZS5icmFuY2hDaGFuZ2VzID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L0NvdWxkIG5vdCBjb21wdXRlIGJyYW5jaCBjaGFuZ2VzLyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGdpdENhbGxzOiBnaXRTZXJ2aWNlLmNhbGxzLCBvY3RvQ2FsbHM6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzIH0sIHtcblx0XHRcdGdpdENhbGxzOiBbJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcycsICdjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyddLFxuXHRcdFx0b2N0b0NhbGxzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBleGlzdGluZyBwdWxsIHJlcXVlc3QgZm91bmQgYWZ0ZXIgY3JlYXRlIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLmNyZWF0ZUVycm9yID0gbmV3IEVycm9yKCdWYWxpZGF0aW9uIEZhaWxlZCcpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLmV4aXN0aW5nQWZ0ZXJDcmVhdGVGYWlsdXJlID0geyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzgnLCBudW1iZXI6IDggfTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNyZWF0ZWRFdmVudHMgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsIG9jdG9DYWxsczogb2N0b0tpdFNlcnZpY2UuY2FsbHMsIGNyZWF0ZWRFdmVudHMgfSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ1B1bGwgcmVxdWVzdCBbIzhdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvOCkgYWxyZWFkeSBleGlzdHMuJyB9LFxuXHRcdFx0b2N0b0NhbGxzOiBbJ2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDpmZWF0dXJlL3Rlc3QnLCAnY3JlYXRlUHVsbFJlcXVlc3Q6ZmFsc2UnLCAnZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoOmZlYXR1cmUvdGVzdCddLFxuXHRcdFx0Y3JlYXRlZEV2ZW50czogWydhZ2VudDovc2Vzc2lvbjpodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzgnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGNyZWF0ZSBmYWlsdXJlIHdoZW4gZXhpc3RpbmcgcHVsbCByZXF1ZXN0IHJlY292ZXJ5IGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5jcmVhdGVFcnJvciA9IG5ldyBFcnJvcignY3JlYXRlIGZhaWxlZCcpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLmZpbmRBZnRlckNyZWF0ZUVycm9yID0gbmV3IEVycm9yKCdmaW5kIGZhaWxlZCcpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L2NyZWF0ZSBmYWlsZWQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hvbm9ycyBjYW5jZWxsYXRpb24gYmVmb3JlIG11dGF0aW5nIHRoZSByZXBvc2l0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNyZWF0ZWRFdmVudHMgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGN0cyk7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFIgfSwgY3RzLnRva2VuKSxcblx0XHRcdC9QdWxsIHJlcXVlc3Qgb3BlcmF0aW9uIHdhcyBjYW5jZWxsZWQvLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZ2l0Q2FsbHM6IGdpdFNlcnZpY2UuY2FsbHMsIG9jdG9DYWxsczogb2N0b0tpdFNlcnZpY2UuY2FsbHMsIGNyZWF0ZWRFdmVudHMgfSwge1xuXHRcdFx0Z2l0Q2FsbHM6IFtdLFxuXHRcdFx0b2N0b0NhbGxzOiBbXSxcblx0XHRcdGNyZWF0ZWRFdmVudHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBXaGVuIGEgQ29waWxvdCB0b2tlbiBpcyBhdmFpbGFibGUsIHRoZSBoYW5kbGVyIGFza3MgdGhlIHV0aWxpdHkgbW9kZWxcblx0Ly8gZm9yIGEgdGl0bGUvZGVzY3JpcHRpb24sIGZlZWRpbmcgaXQgdGhlIG1haW4gc2Vzc2lvbiBjb252ZXJzYXRpb24gKG9ubHlcblx0Ly8gdGhlIG1hcmtkb3duIHRleHQgb2YgcmVxdWVzdHMvcmVzcG9uc2VzIFx1MjAxNCByZWFzb25pbmcsIHRvb2wgY2FsbHMsIGFuZFxuXHQvLyBzdWJhZ2VudHMgYXJlIGV4Y2x1ZGVkKSBwbHVzIHRoZSBjaGFuZ2VkLWZpbGUgc3VtbWFyeS5cblx0dGVzdCgnZ2VuZXJhdGVzIHRoZSBQUiB0aXRsZSBhbmQgZGVzY3JpcHRpb24gZnJvbSB0aGUgY29udmVyc2F0aW9uIHZpYSB0aGUgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbe1xuXHRcdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnQWRkIHJldHJ5IGxvZ2ljIHRvIHRoZSB1cGxvYWRlcicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6ICdyMScsIGNvbnRlbnQ6ICdTRUNSRVRfUkVBU09OSU5HX1NIT1VMRF9CRV9FWENMVURFRCcgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ20xJywgY29udGVudDogJ0kgYWRkZWQgZXhwb25lbnRpYWwgYmFja29mZiB0byB0aGUgdXBsb2FkZXIuJyB9LFxuXHRcdFx0XSxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdH1dO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY29waWxvdEFwaVNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSwgeyB3aXRoQ29waWxvdFRva2VuOiB0cnVlLCB0dXJucyB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IHVzZXJDb250ZW50ID0gY29waWxvdEFwaVNlcnZpY2UuY2FsbHNbMF0/LnJlcXVlc3QubWVzc2FnZXMuZmluZChtID0+IG0ucm9sZSA9PT0gJ3VzZXInKT8uY29udGVudCA/PyAnJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLFxuXHRcdFx0dG9rZW46IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzWzBdPy50b2tlbixcblx0XHRcdHRpdGxlOiBvY3RvS2l0U2VydmljZS5sYXN0VGl0bGUsXG5cdFx0XHRib2R5OiBvY3RvS2l0U2VydmljZS5sYXN0Qm9keSxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHVzZXJDb250ZW50LmluY2x1ZGVzKCdBZGQgcmV0cnkgbG9naWMgdG8gdGhlIHVwbG9hZGVyJyksXG5cdFx0XHRpbmNsdWRlc0FnZW50UmVzcG9uc2U6IHVzZXJDb250ZW50LmluY2x1ZGVzKCdJIGFkZGVkIGV4cG9uZW50aWFsIGJhY2tvZmYgdG8gdGhlIHVwbG9hZGVyLicpLFxuXHRcdFx0ZXhjbHVkZXNSZWFzb25pbmc6ICF1c2VyQ29udGVudC5pbmNsdWRlcygnU0VDUkVUX1JFQVNPTklOR19TSE9VTERfQkVfRVhDTFVERUQnKSxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyMxMjNdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzKS4nIH0sXG5cdFx0XHR0b2tlbjogJ2NvcGlsb3QtdG9rZW4nLFxuXHRcdFx0dGl0bGU6ICdHZW5lcmF0ZWQgUFIgdGl0bGUnLFxuXHRcdFx0Ym9keTogJ0dlbmVyYXRlZCBQUiBkZXNjcmlwdGlvbi4nLFxuXHRcdFx0aW5jbHVkZXNVc2VyUmVxdWVzdDogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzQWdlbnRSZXNwb25zZTogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzUmVhc29uaW5nOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBXaXRob3V0IGEgQ29waWxvdCB0b2tlbiB0aGUgbW9kZWwgaXMgbmV2ZXIgY2FsbGVkIGFuZCB0aGUgaGFuZGxlciBmYWxsc1xuXHQvLyBiYWNrIHRvIHRoZSBicmFuY2gtbmFtZSBiYXNlZCB0aXRsZS9kZXNjcmlwdGlvbi5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBicmFuY2gtbmFtZSB0aXRsZSBhbmQgZGVzY3JpcHRpb24gd2l0aG91dCBhIENvcGlsb3QgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY29waWxvdEFwaVNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHV0aWxpdHlDYWxsczogY29waWxvdEFwaVNlcnZpY2UuY2FsbHMubGVuZ3RoLFxuXHRcdFx0dGl0bGU6IG9jdG9LaXRTZXJ2aWNlLmxhc3RUaXRsZSxcblx0XHRcdGJvZHk6IG9jdG9LaXRTZXJ2aWNlLmxhc3RCb2R5LFxuXHRcdH0sIHtcblx0XHRcdHV0aWxpdHlDYWxsczogMCxcblx0XHRcdHRpdGxlOiAnZmVhdHVyZTogdGVzdCcsXG5cdFx0XHRib2R5OiAnQ3JlYXRlZCBmcm9tIGBmZWF0dXJlL3Rlc3RgIHRhcmdldGluZyBgbWFpbmAuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gTW9kZWwgZmFpbHVyZXMgbXVzdCBub3QgYmxvY2sgUFIgY3JlYXRpb24gXHUyMDE0IHRoZSBoYW5kbGVyIGZhbGxzIGJhY2sgdG8gdGhlXG5cdC8vIGJyYW5jaC1uYW1lIGJhc2VkIHRpdGxlL2Rlc2NyaXB0aW9uLlxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGJyYW5jaC1uYW1lIHRpdGxlIGFuZCBkZXNjcmlwdGlvbiB3aGVuIGdlbmVyYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLmVycm9yID0gbmV3IEVycm9yKCd1dGlsaXR5IG1vZGVsIHVuYXZhaWxhYmxlJyk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIHsgd2l0aENvcGlsb3RUb2tlbjogdHJ1ZSwgY29waWxvdEFwaVNlcnZpY2UgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLFxuXHRcdFx0dGl0bGU6IG9jdG9LaXRTZXJ2aWNlLmxhc3RUaXRsZSxcblx0XHRcdGJvZHk6IG9jdG9LaXRTZXJ2aWNlLmxhc3RCb2R5LFxuXHRcdH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDcmVhdGVkIHB1bGwgcmVxdWVzdCBbIzEyM10oaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMjMpLicgfSxcblx0XHRcdHRpdGxlOiAnZmVhdHVyZTogdGVzdCcsXG5cdFx0XHRib2R5OiAnQ3JlYXRlZCBmcm9tIGBmZWF0dXJlL3Rlc3RgIHRhcmdldGluZyBgbWFpbmAuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gVGhlIGF1dG8tbWVyZ2UgdmFyaWFudHMgY3JlYXRlIHRoZSBQUiBhbmQgdGhlbiBhc2sgR2l0SHViIHRvIGVuYWJsZVxuXHQvLyBhdXRvLW1lcmdlIHdpdGggdGhlIHJlcXVlc3RlZCBtZXJnZSBtZXRob2QsIHJlcG9ydGluZyBpdCBpbiB0aGUgcmVzdWx0LlxuXHR0ZXN0KCdlbmFibGVzIGF1dG8tbWVyZ2Ugd2l0aCB0aGUgcmVxdWVzdGVkIG1lcmdlIG1ldGhvZCBhZnRlciBjcmVhdGluZyB0aGUgcHVsbCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNyZWF0ZWRFdmVudHMgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSwgeyBhdXRvTWVyZ2VNZXRob2Q6ICdTUVVBU0gnIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSX0FVVE9fU1FVQVNIIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdG9jdG9DYWxsczogb2N0b0tpdFNlcnZpY2UuY2FsbHMsXG5cdFx0XHRjcmVhdGVkRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDcmVhdGVkIHB1bGwgcmVxdWVzdCBbIzEyM10oaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMjMpIHdpdGggYXV0by1tZXJnZSAoc3F1YXNoKSBlbmFibGVkLicgfSxcblx0XHRcdG9jdG9DYWxsczogW1xuXHRcdFx0XHQnZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoOmZlYXR1cmUvdGVzdCcsXG5cdFx0XHRcdCdjcmVhdGVQdWxsUmVxdWVzdDpmYWxzZScsXG5cdFx0XHRcdCdlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZTpQUl9ub2RlXzEyMzpTUVVBU0gnLFxuXHRcdFx0XSxcblx0XHRcdGNyZWF0ZWRFdmVudHM6IFsnYWdlbnQ6L3Nlc3Npb246aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMjMnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gRW5hYmxpbmcgYXV0by1tZXJnZSBpcyBiZXN0LWVmZm9ydDogYSBmYWlsdXJlIChlLmcuIHRoZSByZXBvc2l0b3J5IGRvZXNcblx0Ly8gbm90IGFsbG93IHRoZSBtZXJnZSBtZXRob2QpIG11c3Qgbm90IGZhaWwgUFIgY3JlYXRpb24uXG5cdHRlc3QoJ3JlcG9ydHMgYnV0IGRvZXMgbm90IGZhaWwgd2hlbiBhdXRvLW1lcmdlIGNhbm5vdCBiZSBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5hdXRvTWVyZ2VFcnJvciA9IG5ldyBFcnJvcignQXV0by1tZXJnZSBpcyBub3QgYWxsb3dlZCBmb3IgdGhpcyByZXBvc2l0b3J5Jyk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjcmVhdGVkRXZlbnRzIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIHsgYXV0b01lcmdlTWV0aG9kOiAnTUVSR0UnIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSX0FVVE9fTUVSR0UgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLFxuXHRcdFx0Y3JlYXRlZEV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyMxMjNdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzKSwgYnV0IGF1dG8tbWVyZ2UgY291bGQgbm90IGJlIGVuYWJsZWQ6IEF1dG8tbWVyZ2UgaXMgbm90IGFsbG93ZWQgZm9yIHRoaXMgcmVwb3NpdG9yeScgfSxcblx0XHRcdGNyZWF0ZWRFdmVudHM6IFsnYWdlbnQ6L3Nlc3Npb246aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMjMnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gV2l0aG91dCBhIHB1bGwgcmVxdWVzdCBub2RlIGlkIHdlIGNhbm5vdCBpc3N1ZSB0aGUgR3JhcGhRTCBtdXRhdGlvbiwgc29cblx0Ly8gYXV0by1tZXJnZSBpcyByZXBvcnRlZCBhcyBub3QgZW5hYmxlZCByYXRoZXIgdGhhbiBzaWxlbnRseSBza2lwcGVkLlxuXHR0ZXN0KCdyZXBvcnRzIHdoZW4gdGhlIHB1bGwgcmVxdWVzdCBub2RlIGlkIGlzIG1pc3NpbmcgZm9yIGF1dG8tbWVyZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IG9jdG9LaXRTZXJ2aWNlID0gbmV3IFRlc3RPY3RvS2l0U2VydmljZSgpO1xuXHRcdG9jdG9LaXRTZXJ2aWNlLmNyZWF0ZWQgPSB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNTUnLCBudW1iZXI6IDU1IH07XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIHsgYXV0b01lcmdlTWV0aG9kOiAnUkVCQVNFJyB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUl9BVVRPX1JFQkFTRSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRlbmFibGVDYWxsZWQ6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLnNvbWUoY2FsbCA9PiBjYWxsLnN0YXJ0c1dpdGgoJ2VuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlOicpKSxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyM1NV0oaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC81NSksIGJ1dCBhdXRvLW1lcmdlIGNvdWxkIG5vdCBiZSBlbmFibGVkOiB0aGUgcHVsbCByZXF1ZXN0IGlkZW50aWZpZXIgd2FzIG5vdCByZXR1cm5lZCBieSBHaXRIdWIuJyB9LFxuXHRcdFx0ZW5hYmxlQ2FsbGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFFM0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUNBQW1DLHNDQUEwRDtBQUN0RyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QixxQkFBbUUsYUFBYSxrQkFBa0IsZUFBZSxpQkFBNEI7QUFFOUssU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw2QkFBNkI7QUFNdEMsTUFBTSxzQkFBb0Q7QUFBQSxFQUExRDtBQUdDLFNBQVMsUUFBd0gsQ0FBQztBQUNsSSxvQkFBVztBQUFBO0FBQUEsRUFLWCxXQUFzRjtBQUNy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
