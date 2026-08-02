import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { buildUncommittedChangesetUri } from "../../common/changesetUri.js";
import { SessionStatus, withSessionGitState } from "../../common/state/sessionState.js";
import { AgentHostCommitOperationHandler } from "../../node/agentHostCommitOperationHandler.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { CopilotApiError } from "../../node/shared/copilotApiService.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from "../../common/agentService.js";
import { AHP_AUTH_REQUIRED } from "../../common/state/sessionProtocol.js";
class TestGitService {
  constructor() {
    this.calls = [];
    this.uncommitted = true;
    this.diffs = [{
      after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } },
      diff: { added: 1, removed: 0 }
    }];
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
    return false;
  }
  async pull() {
  }
  async push() {
  }
  async getSessionGitState() {
    return void 0;
  }
  async computeSessionFileDiffs() {
    this.calls.push("computeSessionFileDiffs");
    return this.diffs;
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
class TestCopilotApiService {
  constructor() {
    this.calls = [];
    this.response = "```text\nUpdate session changes\n```";
  }
  messages() {
    throw new Error("not used");
  }
  responses(githubToken, body, options) {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
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
class TestChangesetService {
  constructor() {
    this.calls = [];
  }
  registerStaticChangesets() {
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
  isStaticChangesetComputeActive() {
    return false;
  }
  getListMetadataKeys(_sessionUri) {
    return void 0;
  }
  computeListEntryChanges(_sessionUri, _metadata) {
    return void 0;
  }
  refreshChangesetCatalog(session) {
    this.calls.push(`refreshChangesets:${session}`);
  }
  refreshBranchChangeset(session) {
    this.calls.push(`refreshBranch:${session}`);
  }
  refreshSessionChangeset(session) {
    this.calls.push(`refreshSession:${session}`);
  }
  onWorkingDirectoryAvailable(_session) {
  }
  recomputeSubscribedChangesets(_session) {
  }
  onSessionDisposed(_session) {
  }
  async computeUncommittedChangeset(session) {
    this.calls.push(`computeUncommitted:${session}`);
    return `${session}/changeset/uncommitted`;
  }
  async computeTurnChangeset(_session, _turnId) {
    return "";
  }
  async computeCompareTurnsChangeset(_session, _originalTurnId, _modifiedTurnId) {
    return "";
  }
  onToolCallEditsApplied(_session, _turnId) {
  }
  onTurnComplete(_session, _turnId) {
  }
  onSessionTruncated(_session) {
  }
}
function createAgentService(token) {
  return {
    getAuthToken: () => token
  };
}
function setup(disposables, gitService, copilotApiService, changesets, options) {
  const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
  const session = URI.parse("agent:/session");
  const committedSessions = [];
  stateManager.createSession({
    resource: session.toString(),
    provider: "copilot",
    title: "Session",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    workingDirectories: [URI.file("/repo").toString()]
  });
  stateManager.setSessionMeta(session.toString(), withSessionGitState(void 0, {
    branchName: "feature/test",
    uncommittedChanges: 1
  }));
  return {
    handler: new AgentHostCommitOperationHandler((sessionKey) => stateManager.getSessionState(sessionKey), async (sessionKey) => {
      committedSessions.push(sessionKey);
      changesets.calls.push(`onCommitted:${sessionKey}`);
      if (options?.onCommittedError) {
        throw options.onCommittedError;
      }
    }, createAgentService("gh-repo-token"), createTestGitHubEndpointService(), gitService, copilotApiService, new NullLogService()),
    session,
    committedSessions
  };
}
suite("AgentHostCommitOperationHandler", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test.skip("generates a commit message, commits all changes, and refreshes changesets", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);
    const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      gitCalls: gitService.calls,
      completion: copilotApiService.calls.map((call) => ({ token: call.token, fileIncluded: call.request.messages.some((message) => message.content.includes("file.ts")) })),
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      message: { markdown: "Committed changes with message: `Update session changes`" },
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs", "commitAll:Update session changes"],
      completion: [{ token: "gh-repo-token", fileIncluded: true }],
      changesetCalls: ["onCommitted:agent:/session", "computeUncommitted:agent:/session", "refreshSession:agent:/session"],
      committedSessions: ["agent:/session"]
    });
  });
  test("returns no-op success without generating a message or committing when the working tree is clean", async () => {
    const gitService = new TestGitService();
    gitService.uncommitted = false;
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);
    const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    assert.deepStrictEqual({ message: result.message, gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
      message: { markdown: "No uncommitted changes to commit." },
      gitCalls: ["hasUncommittedChanges"],
      completionCalls: 0,
      changesetCalls: []
    });
  });
  test.skip("returns success when post-commit refresh fails", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets, { onCommittedError: new Error("refresh failed") });
    const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      gitCalls: gitService.calls,
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      message: { markdown: "Committed changes with message: `Update session changes`" },
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs", "commitAll:Update session changes"],
      changesetCalls: ["onCommitted:agent:/session", "computeUncommitted:agent:/session", "refreshSession:agent:/session"],
      committedSessions: ["agent:/session"]
    });
  });
  test("honors cancellation before mutating the repository", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);
    const cts = disposables.add(new CancellationTokenSource());
    cts.cancel();
    await assert.rejects(
      () => handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, cts.token),
      /Commit operation was cancelled/
    );
    assert.deepStrictEqual({ gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
      gitCalls: [],
      completionCalls: 0,
      changesetCalls: []
    });
  });
  test("maps stale Copilot auth failures to AHP_AUTH_REQUIRED before committing", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new CopilotApiError(401, {
      type: "error",
      error: { type: "authentication_error", message: "bad token" },
      request_id: null
    });
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);
    let err;
    try {
      await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual({
      code: err?.code,
      data: err?.data,
      gitCalls: gitService.calls,
      completionCalls: copilotApiService.calls.length,
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      code: AHP_AUTH_REQUIRED,
      data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs"],
      completionCalls: 1,
      changesetCalls: [],
      committedSessions: []
    });
  });
  test("maps Copilot token mint auth failures to AHP_AUTH_REQUIRED before committing", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("Copilot session token mint failed: 403 Forbidden");
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);
    let err;
    try {
      await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual({
      code: err?.code,
      data: err?.data,
      gitCalls: gitService.calls,
      completionCalls: copilotApiService.calls.length,
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      code: AHP_AUTH_REQUIRED,
      data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs"],
      completionCalls: 1,
      changesetCalls: [],
      committedSessions: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgQW50aHJvcGljIGZyb20gJ0BhbnRocm9waWMtYWkvc2RrJztcbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXMsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHR5cGUgSVNlc3Npb25GaWxlRGlmZiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0R2l0U2VydmljZSwgSUJyYW5jaCwgSURlZmF1bHRCcmFuY2ggfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQ29waWxvdEFwaUVycm9yLCB0eXBlIElDb3BpbG90QXBpU2VydmljZSwgdHlwZSBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucywgdHlwZSBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3QgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UsIElBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFIUF9BVVRIX1JFUVVJUkVELCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzU3VtbWFyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEsIElSZXN0b3JlZENoYW5nZXNldERpZmZzLCBTdGF0aWNDaGFuZ2VzZXRLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuXG5jbGFzcyBUZXN0R2l0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RHaXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdHVuY29tbWl0dGVkID0gdHJ1ZTtcblx0ZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZCA9IFt7XG5cdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyB9IH0sXG5cdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHR9XTtcblxuXHRhc3luYyBnZXRDdXJyZW50QnJhbmNoKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiAnZmVhdHVyZS90ZXN0JzsgfVxuXHRhc3luYyBnZXREZWZhdWx0QnJhbmNoKCk6IFByb21pc2U8SURlZmF1bHRCcmFuY2ggfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHsgbmFtZTogJ21haW4nLCBzdGFydFBvaW50OiAnbWFpbicgfTsgfVxuXHRhc3luYyBnZXRCcmFuY2goKTogUHJvbWlzZTxJQnJhbmNoIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0UmVmcygpOiBQcm9taXNlPElCcmFuY2hbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZ2V0QnJhbmNoZXMoKTogUHJvbWlzZTxJQnJhbmNoW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldFJlcG9zaXRvcnlSb290KCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7IHJldHVybiBVUkkuZmlsZSgnL3JlcG8nKTsgfVxuXHRhc3luYyBnZXRXb3JrdHJlZVJvb3RzKCk6IFByb21pc2U8VVJJW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGFkZFdvcmt0cmVlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNvcHlXb3JrdHJlZUluY2x1ZGVGaWxlcygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBhZGRFeGlzdGluZ1dvcmt0cmVlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHJlbW92ZVdvcmt0cmVlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGJyYW5jaEV4aXN0cygpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIGhhc1VuY29tbWl0dGVkQ2hhbmdlcygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcycpO1xuXHRcdHJldHVybiB0aGlzLnVuY29tbWl0dGVkO1xuXHR9XG5cdGFzeW5jIGNvbW1pdEFsbChfd29ya2luZ0RpcmVjdG9yeTogVVJJLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goYGNvbW1pdEFsbDoke21lc3NhZ2V9YCk7XG5cdFx0dGhpcy51bmNvbW1pdHRlZCA9IGZhbHNlO1xuXHR9XG5cdGFzeW5jIHJlc3RvcmUoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgaGFzVXBzdHJlYW0oKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBwdWxsKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHB1c2goKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ2V0U2Vzc2lvbkdpdFN0YXRlKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMoKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goJ2NvbXB1dGVTZXNzaW9uRmlsZURpZmZzJyk7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZnM7XG5cdH1cblx0YXN5bmMgc2hvd0Jsb2IoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjb21taXRUcmVlKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXBkYXRlUmVmKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGRlbGV0ZVJlZnMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmV2UGFyc2UoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyByZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBvdmVybGF5UGF0aEludG9UcmVlKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZGlmZlRyZWVQYXRocygpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzKCk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0RmV0Y2hSZW1vdGVVcmxzKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0VW50cmFja2VkUGF0aHMoKTogUHJvbWlzZTxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZ2V0QnJhbmNoRGlmZlNhZmV0eUluZm8oKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXREaWZmUGF0Y2hCZXR3ZWVuUmVmcygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbmNsYXNzIFRlc3RDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhbGxzOiB7IHRva2VuOiBzdHJpbmc7IHJlcXVlc3Q6IElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdDsgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zIH1bXSA9IFtdO1xuXHRyZXNwb25zZSA9ICdgYGB0ZXh0XFxuVXBkYXRlIHNlc3Npb24gY2hhbmdlc1xcbmBgYCc7XG5cdGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgcmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNTdHJlYW1pbmcsIF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50Pjtcblx0bWVzc2FnZXMoX2dpdGh1YlRva2VuOiBzdHJpbmcsIHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zTm9uU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT47XG5cdG1lc3NhZ2VzKCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHwgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTtcblx0fVxuXHRyZXNwb25zZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRib2R5OiBzdHJpbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgcmVzb2x2ZVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0KCkgeyByZXR1cm4geyByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogZmFsc2UsIHRyYWNraW5nSWQ6IHVuZGVmaW5lZCwgdGVsZW1ldHJ5RW5kcG9pbnQ6IHVuZGVmaW5lZCB9OyB9XG5cdGFzeW5jIHJlc29sdmVBcGlFbmRwb2ludCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyB1dGlsaXR5Q2hhdENvbXBsZXRpb24oZ2l0aHViVG9rZW46IHN0cmluZywgcmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0LCBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7IHRva2VuOiBnaXRodWJUb2tlbiwgcmVxdWVzdCwgb3B0aW9ucyB9KTtcblx0XHRpZiAodGhpcy5lcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5lcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVzcG9uc2U7XG5cdH1cbn1cblxuY2xhc3MgVGVzdENoYW5nZXNldFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoKTogdm9pZCB7IH1cblx0cmVzdG9yZVN0YXRpY0NoYW5nZXNldChfc2Vzc2lvbjogc3RyaW5nLCBfa2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCwgX2RpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10pOiB2b2lkIHsgfVxuXHRwYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX21ldGFkYXRhOiBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEpOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyB7IHJldHVybiB7fTsgfVxuXHRhcHBseVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX2RpZmZzOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyk6IHZvaWQgeyB9XG5cdHJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKF9zZXNzaW9uVXJpOiBzdHJpbmcsIF9tZXRhZGF0YTogSVBlcnNpc3RlZENoYW5nZXNldE1ldGFkYXRhKTogSVJlc3RvcmVkQ2hhbmdlc2V0RGlmZnMgeyByZXR1cm4ge307IH1cblx0cGVyc2lzdENoYW5nZXNTdW1tYXJ5KF9zZXNzaW9uVXJpOiBzdHJpbmcsIF9zdW1tYXJ5OiBDaGFuZ2VzU3VtbWFyeSk6IHZvaWQgeyB9XG5cdGlzU3RhdGljQ2hhbmdlc2V0Q29tcHV0ZUFjdGl2ZSgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGdldExpc3RNZXRhZGF0YUtleXMoX3Nlc3Npb25Vcmk6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHRydWU+IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlcyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0cmVmcmVzaENoYW5nZXNldENhdGFsb2coc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IHRoaXMuY2FsbHMucHVzaChgcmVmcmVzaENoYW5nZXNldHM6JHtzZXNzaW9ufWApOyB9XG5cdHJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IHRoaXMuY2FsbHMucHVzaChgcmVmcmVzaEJyYW5jaDoke3Nlc3Npb259YCk7IH1cblx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IHRoaXMuY2FsbHMucHVzaChgcmVmcmVzaFNlc3Npb246JHtzZXNzaW9ufWApOyB9XG5cdG9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZShfc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IH1cblx0cmVjb21wdXRlU3Vic2NyaWJlZENoYW5nZXNldHMoX3Nlc3Npb246IHN0cmluZyk6IHZvaWQgeyB9XG5cdG9uU2Vzc2lvbkRpc3Bvc2VkKF9zZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgdGhpcy5jYWxscy5wdXNoKGBjb21wdXRlVW5jb21taXR0ZWQ6JHtzZXNzaW9ufWApOyByZXR1cm4gYCR7c2Vzc2lvbn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDsgfVxuXHRhc3luYyBjb21wdXRlVHVybkNoYW5nZXNldChfc2Vzc2lvbjogc3RyaW5nLCBfdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0YXN5bmMgY29tcHV0ZUNvbXBhcmVUdXJuc0NoYW5nZXNldChfc2Vzc2lvbjogc3RyaW5nLCBfb3JpZ2luYWxUdXJuSWQ6IHN0cmluZywgX21vZGlmaWVkVHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0b25Ub29sQ2FsbEVkaXRzQXBwbGllZChfc2Vzc2lvbjogc3RyaW5nLCBfdHVybklkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRvblR1cm5Db21wbGV0ZShfc2Vzc2lvbjogc3RyaW5nLCBfdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25UcnVuY2F0ZWQoX3Nlc3Npb246IHN0cmluZyk6IHZvaWQgeyB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFnZW50U2VydmljZSh0b2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogSUFnZW50U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0QXV0aFRva2VuOiAoKSA9PiB0b2tlbixcblx0fSBhcyBQYXJ0aWFsPElBZ2VudFNlcnZpY2U+IGFzIElBZ2VudFNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIHNldHVwKGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBnaXRTZXJ2aWNlOiBUZXN0R2l0U2VydmljZSwgY29waWxvdEFwaVNlcnZpY2U6IFRlc3RDb3BpbG90QXBpU2VydmljZSwgY2hhbmdlc2V0czogVGVzdENoYW5nZXNldFNlcnZpY2UsIG9wdGlvbnM/OiB7IHJlYWRvbmx5IG9uQ29tbWl0dGVkRXJyb3I/OiBFcnJvciB9KTogeyBoYW5kbGVyOiBBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyOyBzZXNzaW9uOiBVUkk7IGNvbW1pdHRlZFNlc3Npb25zOiBzdHJpbmdbXSB9IHtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnYWdlbnQ6L3Nlc3Npb24nKTtcblx0Y29uc3QgY29tbWl0dGVkU2Vzc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0dGl0bGU6ICdTZXNzaW9uJyxcblx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDEpLnRvSVNPU3RyaW5nKCksXG5cdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3JlcG8nKS50b1N0cmluZygpXSxcblx0fSk7XG5cdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uLnRvU3RyaW5nKCksIHdpdGhTZXNzaW9uR2l0U3RhdGUodW5kZWZpbmVkLCB7XG5cdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvdGVzdCcsXG5cdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiAxLFxuXHR9KSk7XG5cdHJldHVybiB7XG5cdFx0aGFuZGxlcjogbmV3IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIoc2Vzc2lvbktleSA9PiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpLCBhc3luYyBzZXNzaW9uS2V5ID0+IHtcblx0XHRcdGNvbW1pdHRlZFNlc3Npb25zLnB1c2goc2Vzc2lvbktleSk7XG5cdFx0XHRjaGFuZ2VzZXRzLmNhbGxzLnB1c2goYG9uQ29tbWl0dGVkOiR7c2Vzc2lvbktleX1gKTtcblx0XHRcdGlmIChvcHRpb25zPy5vbkNvbW1pdHRlZEVycm9yKSB7XG5cdFx0XHRcdHRocm93IG9wdGlvbnMub25Db21taXR0ZWRFcnJvcjtcblx0XHRcdH1cblx0XHR9LCBjcmVhdGVBZ2VudFNlcnZpY2UoJ2doLXJlcG8tdG9rZW4nKSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBnaXRTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdHNlc3Npb24sXG5cdFx0Y29tbWl0dGVkU2Vzc2lvbnMsXG5cdH07XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3Quc2tpcCgnZ2VuZXJhdGVzIGEgY29tbWl0IG1lc3NhZ2UsIGNvbW1pdHMgYWxsIGNoYW5nZXMsIGFuZCByZWZyZXNoZXMgY2hhbmdlc2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBUZXN0Q2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY29tbWl0dGVkU2Vzc2lvbnMgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZSwgY2hhbmdlc2V0cyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NPTU1JVCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscyxcblx0XHRcdGNvbXBsZXRpb246IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzLm1hcChjYWxsID0+ICh7IHRva2VuOiBjYWxsLnRva2VuLCBmaWxlSW5jbHVkZWQ6IGNhbGwucmVxdWVzdC5tZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKCdmaWxlLnRzJykpIH0pKSxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBjaGFuZ2VzZXRzLmNhbGxzLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ0NvbW1pdHRlZCBjaGFuZ2VzIHdpdGggbWVzc2FnZTogYFVwZGF0ZSBzZXNzaW9uIGNoYW5nZXNgJyB9LFxuXHRcdFx0Z2l0Q2FsbHM6IFsnaGFzVW5jb21taXR0ZWRDaGFuZ2VzJywgJ2NvbXB1dGVTZXNzaW9uRmlsZURpZmZzJywgJ2NvbW1pdEFsbDpVcGRhdGUgc2Vzc2lvbiBjaGFuZ2VzJ10sXG5cdFx0XHRjb21wbGV0aW9uOiBbeyB0b2tlbjogJ2doLXJlcG8tdG9rZW4nLCBmaWxlSW5jbHVkZWQ6IHRydWUgfV0sXG5cdFx0XHRjaGFuZ2VzZXRDYWxsczogWydvbkNvbW1pdHRlZDphZ2VudDovc2Vzc2lvbicsICdjb21wdXRlVW5jb21taXR0ZWQ6YWdlbnQ6L3Nlc3Npb24nLCAncmVmcmVzaFNlc3Npb246YWdlbnQ6L3Nlc3Npb24nXSxcblx0XHRcdGNvbW1pdHRlZFNlc3Npb25zOiBbJ2FnZW50Oi9zZXNzaW9uJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgbm8tb3Agc3VjY2VzcyB3aXRob3V0IGdlbmVyYXRpbmcgYSBtZXNzYWdlIG9yIGNvbW1pdHRpbmcgd2hlbiB0aGUgd29ya2luZyB0cmVlIGlzIGNsZWFuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLnVuY29tbWl0dGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBUZXN0Q2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLCBnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscywgY29tcGxldGlvbkNhbGxzOiBjb3BpbG90QXBpU2VydmljZS5jYWxscy5sZW5ndGgsIGNoYW5nZXNldENhbGxzOiBjaGFuZ2VzZXRzLmNhbGxzIH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdObyB1bmNvbW1pdHRlZCBjaGFuZ2VzIHRvIGNvbW1pdC4nIH0sXG5cdFx0XHRnaXRDYWxsczogWydoYXNVbmNvbW1pdHRlZENoYW5nZXMnXSxcblx0XHRcdGNvbXBsZXRpb25DYWxsczogMCxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdyZXR1cm5zIHN1Y2Nlc3Mgd2hlbiBwb3N0LWNvbW1pdCByZWZyZXNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IFRlc3RDaGFuZ2VzZXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjb21taXR0ZWRTZXNzaW9ucyB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBjaGFuZ2VzZXRzLCB7IG9uQ29tbWl0dGVkRXJyb3I6IG5ldyBFcnJvcigncmVmcmVzaCBmYWlsZWQnKSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdGdpdENhbGxzOiBnaXRTZXJ2aWNlLmNhbGxzLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IGNoYW5nZXNldHMuY2FsbHMsXG5cdFx0XHRjb21taXR0ZWRTZXNzaW9ucyxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ29tbWl0dGVkIGNoYW5nZXMgd2l0aCBtZXNzYWdlOiBgVXBkYXRlIHNlc3Npb24gY2hhbmdlc2AnIH0sXG5cdFx0XHRnaXRDYWxsczogWydoYXNVbmNvbW1pdHRlZENoYW5nZXMnLCAnY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMnLCAnY29tbWl0QWxsOlVwZGF0ZSBzZXNzaW9uIGNoYW5nZXMnXSxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBbJ29uQ29tbWl0dGVkOmFnZW50Oi9zZXNzaW9uJywgJ2NvbXB1dGVVbmNvbW1pdHRlZDphZ2VudDovc2Vzc2lvbicsICdyZWZyZXNoU2Vzc2lvbjphZ2VudDovc2Vzc2lvbiddLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnM6IFsnYWdlbnQ6L3Nlc3Npb24nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaG9ub3JzIGNhbmNlbGxhdGlvbiBiZWZvcmUgbXV0YXRpbmcgdGhlIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgVGVzdENoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24gfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZSwgY2hhbmdlc2V0cyk7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIGN0cy50b2tlbiksXG5cdFx0XHQvQ29tbWl0IG9wZXJhdGlvbiB3YXMgY2FuY2VsbGVkLyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGdpdENhbGxzOiBnaXRTZXJ2aWNlLmNhbGxzLCBjb21wbGV0aW9uQ2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzLmxlbmd0aCwgY2hhbmdlc2V0Q2FsbHM6IGNoYW5nZXNldHMuY2FsbHMgfSwge1xuXHRcdFx0Z2l0Q2FsbHM6IFtdLFxuXHRcdFx0Y29tcGxldGlvbkNhbGxzOiAwLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHN0YWxlIENvcGlsb3QgYXV0aCBmYWlsdXJlcyB0byBBSFBfQVVUSF9SRVFVSVJFRCBiZWZvcmUgY29tbWl0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UuZXJyb3IgPSBuZXcgQ29waWxvdEFwaUVycm9yKDQwMSwge1xuXHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdGVycm9yOiB7IHR5cGU6ICdhdXRoZW50aWNhdGlvbl9lcnJvcicsIG1lc3NhZ2U6ICdiYWQgdG9rZW4nIH0sXG5cdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgVGVzdENoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNvbW1pdHRlZFNlc3Npb25zIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgY29waWxvdEFwaVNlcnZpY2UsIGNoYW5nZXNldHMpO1xuXG5cdFx0bGV0IGVycjogUHJvdG9jb2xFcnJvciB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DT01NSVQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGVyciA9IGVycm9yIGFzIFByb3RvY29sRXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb2RlOiBlcnI/LmNvZGUsXG5cdFx0XHRkYXRhOiBlcnI/LmRhdGEsXG5cdFx0XHRnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscyxcblx0XHRcdGNvbXBsZXRpb25DYWxsczogY29waWxvdEFwaVNlcnZpY2UuY2FsbHMubGVuZ3RoLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IGNoYW5nZXNldHMuY2FsbHMsXG5cdFx0XHRjb21taXR0ZWRTZXNzaW9ucyxcblx0XHR9LCB7XG5cdFx0XHRjb2RlOiBBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdGRhdGE6IFtHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0VdLFxuXHRcdFx0Z2l0Q2FsbHM6IFsnaGFzVW5jb21taXR0ZWRDaGFuZ2VzJywgJ2NvbXB1dGVTZXNzaW9uRmlsZURpZmZzJ10sXG5cdFx0XHRjb21wbGV0aW9uQ2FsbHM6IDEsXG5cdFx0XHRjaGFuZ2VzZXRDYWxsczogW10sXG5cdFx0XHRjb21taXR0ZWRTZXNzaW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgQ29waWxvdCB0b2tlbiBtaW50IGF1dGggZmFpbHVyZXMgdG8gQUhQX0FVVEhfUkVRVUlSRUQgYmVmb3JlIGNvbW1pdHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLmVycm9yID0gbmV3IEVycm9yKCdDb3BpbG90IHNlc3Npb24gdG9rZW4gbWludCBmYWlsZWQ6IDQwMyBGb3JiaWRkZW4nKTtcblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IFRlc3RDaGFuZ2VzZXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjb21taXR0ZWRTZXNzaW9ucyB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblxuXHRcdGxldCBlcnI6IFByb3RvY29sRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlcnIgPSBlcnJvciBhcyBQcm90b2NvbEVycm9yO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29kZTogZXJyPy5jb2RlLFxuXHRcdFx0ZGF0YTogZXJyPy5kYXRhLFxuXHRcdFx0Z2l0Q2FsbHM6IGdpdFNlcnZpY2UuY2FsbHMsXG5cdFx0XHRjb21wbGV0aW9uQ2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzLmxlbmd0aCxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBjaGFuZ2VzZXRzLmNhbGxzLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0Y29kZTogQUhQX0FVVEhfUkVRVUlSRUQsXG5cdFx0XHRkYXRhOiBbR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFXSxcblx0XHRcdGdpdENhbGxzOiBbJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcycsICdjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyddLFxuXHRcdFx0Y29tcGxldGlvbkNhbGxzOiAxLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IFtdLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBR25CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUUzRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUFlLDJCQUFrRDtBQUUxRSxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUFrSTtBQUMzSSxTQUFTLHlDQUF3RDtBQUNqRSxTQUFTLHlCQUF3QztBQUlqRCxNQUFNLGVBQStDO0FBQUEsRUFBckQ7QUFHQyxTQUFTLFFBQWtCLENBQUM7QUFDNUIsdUJBQWM7QUFDZCxpQkFBaUQsQ0FBQztBQUFBLE1BQ2pELE9BQU8sRUFBRSxLQUFLLHdCQUF3QixTQUFTLEVBQUUsS0FBSyx1QkFBdUIsRUFBRTtBQUFBLE1BQy9FLE1BQU0sRUFBRSxPQUFPLEdBQUcsU0FBUyxFQUFFO0FBQUEsSUFDOUIsQ0FBQztBQUFBO0FBQUEsRUFFRCxNQUFNLG1CQUFnRDtBQUFFLFdBQU87QUFBQSxFQUFnQjtBQUFBLEVBQy9FLE1BQU0sbUJBQXdEO0FBQUUsV0FBTyxFQUFFLE1BQU0sUUFBUSxZQUFZLE9BQU87QUFBQSxFQUFHO0FBQUEsRUFDN0csTUFBTSxZQUEwQztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDcEUsTUFBTSxVQUE4QjtBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUNqRCxNQUFNLGNBQWtDO0FBQUUsV0FBTyxDQUFDO0FBQUEsRUFBRztBQUFBLEVBQ3JELE1BQU0sb0JBQThDO0FBQUUsV0FBTyxJQUFJLEtBQUssT0FBTztBQUFBLEVBQUc7QUFBQSxFQUNoRixNQUFNLG1CQUFtQztBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUN0RCxNQUFNLGNBQTZCO0FBQUEsRUFBRTtBQUFBLEVBQ3JDLE1BQU0sMkJBQTBDO0FBQUEsRUFBRTtBQUFBLEVBQ2xELE1BQU0sc0JBQXFDO0FBQUEsRUFBRTtBQUFBLEVBQzdDLE1BQU0saUJBQWdDO0FBQUEsRUFBRTtBQUFBLEVBQ3hDLE1BQU0sZUFBaUM7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3ZELE1BQU0sd0JBQTBDO0FBQy9DLFNBQUssTUFBTSxLQUFLLHVCQUF1QjtBQUN2QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFDQSxNQUFNLFVBQVUsbUJBQXdCLFNBQWdDO0FBQ3ZFLFNBQUssTUFBTSxLQUFLLGFBQWEsT0FBTyxFQUFFO0FBQ3RDLFNBQUssY0FBYztBQUFBLEVBQ3BCO0FBQUEsRUFDQSxNQUFNLFVBQXlCO0FBQUEsRUFBRTtBQUFBLEVBQ2pDLE1BQU0sY0FBZ0M7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3RELE1BQU0sT0FBc0I7QUFBQSxFQUFFO0FBQUEsRUFDOUIsTUFBTSxPQUFzQjtBQUFBLEVBQUU7QUFBQSxFQUM5QixNQUFNLHFCQUF5QztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDbkUsTUFBTSwwQkFBNEU7QUFDakYsU0FBSyxNQUFNLEtBQUsseUJBQXlCO0FBQ3pDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUNBLE1BQU0sV0FBK0I7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3pELE1BQU0sMkJBQStDO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUN6RSxNQUFNLGFBQWlDO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUMzRCxNQUFNLFlBQTJCO0FBQUEsRUFBRTtBQUFBLEVBQ25DLE1BQU0sYUFBNEI7QUFBQSxFQUFFO0FBQUEsRUFDcEMsTUFBTSxXQUF3QztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDbEUsTUFBTSw4QkFBMkQ7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3JGLE1BQU0sc0JBQW1EO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUM3RSxNQUFNLGdCQUErQztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDekUsTUFBTSw4QkFBZ0Y7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQzFHLE1BQU0scUJBQXlDO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUNuRSxNQUFNLG9CQUFpQztBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUNwRCxNQUFNLDBCQUE4QztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDeEUsTUFBTSwwQkFBOEM7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUN6RTtBQUVBLE1BQU0sc0JBQW9EO0FBQUEsRUFBMUQ7QUFHQyxTQUFTLFFBQXdILENBQUM7QUFDbEksb0JBQVc7QUFBQTtBQUFBLEVBS1gsV0FBc0Y7QUFDckYsVUFBTSxJQUFJLE1BQU0sVUFBVTtBQUFBLEVBQzNCO0FBQUEsRUFDQSxVQUNDLGFBQ0EsTUFDQSxTQUNvQjtBQUNwQixVQUFNLElBQUksTUFBTSxVQUFVO0FBQUEsRUFDM0I7QUFBQSxFQUNBLE1BQU0sY0FBcUQ7QUFBRSxVQUFNLElBQUksTUFBTSxVQUFVO0FBQUEsRUFBRztBQUFBLEVBQzFGLE1BQU0sU0FBOEI7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDakQsTUFBTSxvQ0FBb0M7QUFBRSxXQUFPLEVBQUUsNEJBQTRCLE9BQU8sWUFBWSxRQUFXLG1CQUFtQixPQUFVO0FBQUEsRUFBRztBQUFBLEVBQy9JLE1BQU0scUJBQXFCO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUMvQyxNQUFNLHNCQUFzQixhQUFxQixTQUErQyxTQUE2RDtBQUM1SixTQUFLLE1BQU0sS0FBSyxFQUFFLE9BQU8sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN4RCxRQUFJLEtBQUssT0FBTztBQUNmLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFQSxNQUFNLHFCQUEyRDtBQUFBLEVBQWpFO0FBR0MsU0FBUyxRQUFrQixDQUFDO0FBQUE7QUFBQSxFQUM1QiwyQkFBaUM7QUFBQSxFQUFFO0FBQUEsRUFDbkMsdUJBQXVCLFVBQWtCLE9BQTRCLFFBQTJDO0FBQUEsRUFBRTtBQUFBLEVBQ2xILCtCQUErQixhQUFxQixXQUFpRTtBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUNsSSwrQkFBK0IsYUFBcUIsUUFBdUM7QUFBQSxFQUFFO0FBQUEsRUFDN0YsaUNBQWlDLGFBQXFCLFdBQWlFO0FBQUUsV0FBTyxDQUFDO0FBQUEsRUFBRztBQUFBLEVBQ3BJLHNCQUFzQixhQUFxQixVQUFnQztBQUFBLEVBQUU7QUFBQSxFQUM3RSxpQ0FBMEM7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBQzFELG9CQUFvQixhQUF1RDtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDL0Ysd0JBQXdCLGFBQXFCLFdBQTJFO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUM1SSx3QkFBd0IsU0FBdUI7QUFBRSxTQUFLLE1BQU0sS0FBSyxxQkFBcUIsT0FBTyxFQUFFO0FBQUEsRUFBRztBQUFBLEVBQ2xHLHVCQUF1QixTQUF1QjtBQUFFLFNBQUssTUFBTSxLQUFLLGlCQUFpQixPQUFPLEVBQUU7QUFBQSxFQUFHO0FBQUEsRUFDN0Ysd0JBQXdCLFNBQXVCO0FBQUUsU0FBSyxNQUFNLEtBQUssa0JBQWtCLE9BQU8sRUFBRTtBQUFBLEVBQUc7QUFBQSxFQUMvRiw0QkFBNEIsVUFBd0I7QUFBQSxFQUFFO0FBQUEsRUFDdEQsOEJBQThCLFVBQXdCO0FBQUEsRUFBRTtBQUFBLEVBQ3hELGtCQUFrQixVQUF3QjtBQUFBLEVBQUU7QUFBQSxFQUM1QyxNQUFNLDRCQUE0QixTQUFrQztBQUFFLFNBQUssTUFBTSxLQUFLLHNCQUFzQixPQUFPLEVBQUU7QUFBRyxXQUFPLEdBQUcsT0FBTztBQUFBLEVBQTBCO0FBQUEsRUFDbkssTUFBTSxxQkFBcUIsVUFBa0IsU0FBa0M7QUFBRSxXQUFPO0FBQUEsRUFBSTtBQUFBLEVBQzVGLE1BQU0sNkJBQTZCLFVBQWtCLGlCQUF5QixpQkFBMEM7QUFBRSxXQUFPO0FBQUEsRUFBSTtBQUFBLEVBQ3JJLHVCQUF1QixVQUFrQixTQUF1QjtBQUFBLEVBQUU7QUFBQSxFQUNsRSxlQUFlLFVBQWtCLFNBQW1DO0FBQUEsRUFBRTtBQUFBLEVBQ3RFLG1CQUFtQixVQUF3QjtBQUFBLEVBQUU7QUFDOUM7QUFFQSxTQUFTLG1CQUFtQixPQUEwQztBQUNyRSxTQUFPO0FBQUEsSUFDTixjQUFjLE1BQU07QUFBQSxFQUNyQjtBQUNEO0FBRUEsU0FBUyxNQUFNLGFBQTJDLFlBQTRCLG1CQUEwQyxZQUFrQyxTQUEwSTtBQUMzUyxRQUFNLGVBQWUsWUFBWSxJQUFJLElBQUksc0JBQXNCLElBQUksZUFBZSxDQUFDLENBQUM7QUFDcEYsUUFBTSxVQUFVLElBQUksTUFBTSxnQkFBZ0I7QUFDMUMsUUFBTSxvQkFBOEIsQ0FBQztBQUNyQyxlQUFhLGNBQWM7QUFBQSxJQUMxQixVQUFVLFFBQVEsU0FBUztBQUFBLElBQzNCLFVBQVU7QUFBQSxJQUNWLE9BQU87QUFBQSxJQUNQLFFBQVEsY0FBYztBQUFBLElBQ3RCLFlBQVcsb0JBQUksS0FBSyxDQUFDLEdBQUUsWUFBWTtBQUFBLElBQ25DLGFBQVksb0JBQUksS0FBSyxDQUFDLEdBQUUsWUFBWTtBQUFBLElBQ3BDLG9CQUFvQixDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsU0FBUyxDQUFDO0FBQUEsRUFDbEQsQ0FBQztBQUNELGVBQWEsZUFBZSxRQUFRLFNBQVMsR0FBRyxvQkFBb0IsUUFBVztBQUFBLElBQzlFLFlBQVk7QUFBQSxJQUNaLG9CQUFvQjtBQUFBLEVBQ3JCLENBQUMsQ0FBQztBQUNGLFNBQU87QUFBQSxJQUNOLFNBQVMsSUFBSSxnQ0FBZ0MsZ0JBQWMsYUFBYSxnQkFBZ0IsVUFBVSxHQUFHLE9BQU0sZUFBYztBQUN4SCx3QkFBa0IsS0FBSyxVQUFVO0FBQ2pDLGlCQUFXLE1BQU0sS0FBSyxlQUFlLFVBQVUsRUFBRTtBQUNqRCxVQUFJLFNBQVMsa0JBQWtCO0FBQzlCLGNBQU0sUUFBUTtBQUFBLE1BQ2Y7QUFBQSxJQUNELEdBQUcsbUJBQW1CLGVBQWUsR0FBRyxnQ0FBZ0MsR0FBRyxZQUFZLG1CQUFtQixJQUFJLGVBQWUsQ0FBQztBQUFBLElBQzlIO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sbUNBQW1DLE1BQU07QUFDOUMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLEtBQUssNkVBQTZFLFlBQVk7QUFDbEcsVUFBTSxhQUFhLElBQUksZUFBZTtBQUN0QyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxVQUFNLGFBQWEsSUFBSSxxQkFBcUI7QUFDNUMsVUFBTSxFQUFFLFNBQVMsU0FBUyxrQkFBa0IsSUFBSSxNQUFNLGFBQWEsWUFBWSxtQkFBbUIsVUFBVTtBQUU1RyxVQUFNLFNBQVMsTUFBTSxRQUFRLE9BQU8sRUFBRSxTQUFTLDZCQUE2QixRQUFRLFNBQVMsQ0FBQyxHQUFHLGFBQWEsZ0NBQWdDLGlCQUFpQixHQUFHLGtCQUFrQixJQUFJO0FBRXhMLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxPQUFPO0FBQUEsTUFDaEIsVUFBVSxXQUFXO0FBQUEsTUFDckIsWUFBWSxrQkFBa0IsTUFBTSxJQUFJLFdBQVMsRUFBRSxPQUFPLEtBQUssT0FBTyxjQUFjLEtBQUssUUFBUSxTQUFTLEtBQUssYUFBVyxRQUFRLFFBQVEsU0FBUyxTQUFTLENBQUMsRUFBRSxFQUFFO0FBQUEsTUFDakssZ0JBQWdCLFdBQVc7QUFBQSxNQUMzQjtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsU0FBUyxFQUFFLFVBQVUsMkRBQTJEO0FBQUEsTUFDaEYsVUFBVSxDQUFDLHlCQUF5QiwyQkFBMkIsa0NBQWtDO0FBQUEsTUFDakcsWUFBWSxDQUFDLEVBQUUsT0FBTyxpQkFBaUIsY0FBYyxLQUFLLENBQUM7QUFBQSxNQUMzRCxnQkFBZ0IsQ0FBQyw4QkFBOEIscUNBQXFDLCtCQUErQjtBQUFBLE1BQ25ILG1CQUFtQixDQUFDLGdCQUFnQjtBQUFBLElBQ3JDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1HQUFtRyxZQUFZO0FBQ25ILFVBQU0sYUFBYSxJQUFJLGVBQWU7QUFDdEMsZUFBVyxjQUFjO0FBQ3pCLFVBQU0sb0JBQW9CLElBQUksc0JBQXNCO0FBQ3BELFVBQU0sYUFBYSxJQUFJLHFCQUFxQjtBQUM1QyxVQUFNLEVBQUUsU0FBUyxRQUFRLElBQUksTUFBTSxhQUFhLFlBQVksbUJBQW1CLFVBQVU7QUFFekYsVUFBTSxTQUFTLE1BQU0sUUFBUSxPQUFPLEVBQUUsU0FBUyw2QkFBNkIsUUFBUSxTQUFTLENBQUMsR0FBRyxhQUFhLGdDQUFnQyxpQkFBaUIsR0FBRyxrQkFBa0IsSUFBSTtBQUV4TCxXQUFPLGdCQUFnQixFQUFFLFNBQVMsT0FBTyxTQUFTLFVBQVUsV0FBVyxPQUFPLGlCQUFpQixrQkFBa0IsTUFBTSxRQUFRLGdCQUFnQixXQUFXLE1BQU0sR0FBRztBQUFBLE1BQ2xLLFNBQVMsRUFBRSxVQUFVLG9DQUFvQztBQUFBLE1BQ3pELFVBQVUsQ0FBQyx1QkFBdUI7QUFBQSxNQUNsQyxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0IsQ0FBQztBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLEtBQUssa0RBQWtELFlBQVk7QUFDdkUsVUFBTSxhQUFhLElBQUksZUFBZTtBQUN0QyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxVQUFNLGFBQWEsSUFBSSxxQkFBcUI7QUFDNUMsVUFBTSxFQUFFLFNBQVMsU0FBUyxrQkFBa0IsSUFBSSxNQUFNLGFBQWEsWUFBWSxtQkFBbUIsWUFBWSxFQUFFLGtCQUFrQixJQUFJLE1BQU0sZ0JBQWdCLEVBQUUsQ0FBQztBQUUvSixVQUFNLFNBQVMsTUFBTSxRQUFRLE9BQU8sRUFBRSxTQUFTLDZCQUE2QixRQUFRLFNBQVMsQ0FBQyxHQUFHLGFBQWEsZ0NBQWdDLGlCQUFpQixHQUFHLGtCQUFrQixJQUFJO0FBRXhMLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxPQUFPO0FBQUEsTUFDaEIsVUFBVSxXQUFXO0FBQUEsTUFDckIsZ0JBQWdCLFdBQVc7QUFBQSxNQUMzQjtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsU0FBUyxFQUFFLFVBQVUsMkRBQTJEO0FBQUEsTUFDaEYsVUFBVSxDQUFDLHlCQUF5QiwyQkFBMkIsa0NBQWtDO0FBQUEsTUFDakcsZ0JBQWdCLENBQUMsOEJBQThCLHFDQUFxQywrQkFBK0I7QUFBQSxNQUNuSCxtQkFBbUIsQ0FBQyxnQkFBZ0I7QUFBQSxJQUNyQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzREFBc0QsWUFBWTtBQUN0RSxVQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLFVBQU0sb0JBQW9CLElBQUksc0JBQXNCO0FBQ3BELFVBQU0sYUFBYSxJQUFJLHFCQUFxQjtBQUM1QyxVQUFNLEVBQUUsU0FBUyxRQUFRLElBQUksTUFBTSxhQUFhLFlBQVksbUJBQW1CLFVBQVU7QUFDekYsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBQ3pELFFBQUksT0FBTztBQUVYLFVBQU0sT0FBTztBQUFBLE1BQ1osTUFBTSxRQUFRLE9BQU8sRUFBRSxTQUFTLDZCQUE2QixRQUFRLFNBQVMsQ0FBQyxHQUFHLGFBQWEsZ0NBQWdDLGlCQUFpQixHQUFHLElBQUksS0FBSztBQUFBLE1BQzVKO0FBQUEsSUFDRDtBQUVBLFdBQU8sZ0JBQWdCLEVBQUUsVUFBVSxXQUFXLE9BQU8saUJBQWlCLGtCQUFrQixNQUFNLFFBQVEsZ0JBQWdCLFdBQVcsTUFBTSxHQUFHO0FBQUEsTUFDekksVUFBVSxDQUFDO0FBQUEsTUFDWCxpQkFBaUI7QUFBQSxNQUNqQixnQkFBZ0IsQ0FBQztBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxZQUFZO0FBQzNGLFVBQU0sYUFBYSxJQUFJLGVBQWU7QUFDdEMsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsc0JBQWtCLFFBQVEsSUFBSSxnQkFBZ0IsS0FBSztBQUFBLE1BQ2xELE1BQU07QUFBQSxNQUNOLE9BQU8sRUFBRSxNQUFNLHdCQUF3QixTQUFTLFlBQVk7QUFBQSxNQUM1RCxZQUFZO0FBQUEsSUFDYixDQUFDO0FBQ0QsVUFBTSxhQUFhLElBQUkscUJBQXFCO0FBQzVDLFVBQU0sRUFBRSxTQUFTLFNBQVMsa0JBQWtCLElBQUksTUFBTSxhQUFhLFlBQVksbUJBQW1CLFVBQVU7QUFFNUcsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFFBQVEsT0FBTyxFQUFFLFNBQVMsNkJBQTZCLFFBQVEsU0FBUyxDQUFDLEdBQUcsYUFBYSxnQ0FBZ0MsaUJBQWlCLEdBQUcsa0JBQWtCLElBQUk7QUFBQSxJQUMxSyxTQUFTLE9BQU87QUFDZixZQUFNO0FBQUEsSUFDUDtBQUVBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsTUFBTSxLQUFLO0FBQUEsTUFDWCxNQUFNLEtBQUs7QUFBQSxNQUNYLFVBQVUsV0FBVztBQUFBLE1BQ3JCLGlCQUFpQixrQkFBa0IsTUFBTTtBQUFBLE1BQ3pDLGdCQUFnQixXQUFXO0FBQUEsTUFDM0I7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxpQ0FBaUM7QUFBQSxNQUN4QyxVQUFVLENBQUMseUJBQXlCLHlCQUF5QjtBQUFBLE1BQzdELGlCQUFpQjtBQUFBLE1BQ2pCLGdCQUFnQixDQUFDO0FBQUEsTUFDakIsbUJBQW1CLENBQUM7QUFBQSxJQUNyQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxVQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLFVBQU0sb0JBQW9CLElBQUksc0JBQXNCO0FBQ3BELHNCQUFrQixRQUFRLElBQUksTUFBTSxrREFBa0Q7QUFDdEYsVUFBTSxhQUFhLElBQUkscUJBQXFCO0FBQzVDLFVBQU0sRUFBRSxTQUFTLFNBQVMsa0JBQWtCLElBQUksTUFBTSxhQUFhLFlBQVksbUJBQW1CLFVBQVU7QUFFNUcsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFFBQVEsT0FBTyxFQUFFLFNBQVMsNkJBQTZCLFFBQVEsU0FBUyxDQUFDLEdBQUcsYUFBYSxnQ0FBZ0MsaUJBQWlCLEdBQUcsa0JBQWtCLElBQUk7QUFBQSxJQUMxSyxTQUFTLE9BQU87QUFDZixZQUFNO0FBQUEsSUFDUDtBQUVBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsTUFBTSxLQUFLO0FBQUEsTUFDWCxNQUFNLEtBQUs7QUFBQSxNQUNYLFVBQVUsV0FBVztBQUFBLE1BQ3JCLGlCQUFpQixrQkFBa0IsTUFBTTtBQUFBLE1BQ3pDLGdCQUFnQixXQUFXO0FBQUEsTUFDM0I7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxpQ0FBaUM7QUFBQSxNQUN4QyxVQUFVLENBQUMseUJBQXlCLHlCQUF5QjtBQUFBLE1BQzdELGlCQUFpQjtBQUFBLE1BQ2pCLGdCQUFnQixDQUFDO0FBQUEsTUFDakIsbUJBQW1CLENBQUM7QUFBQSxJQUNyQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
