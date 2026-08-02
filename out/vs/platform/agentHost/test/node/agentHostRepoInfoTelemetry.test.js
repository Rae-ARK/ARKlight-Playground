import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostRepoInfoTelemetry, measureRepoInfoDiffsJSON, resolveRepoInfoRemote } from "../../node/agentHostRepoInfoTelemetry.js";
import { createNoopGitService } from "../common/sessionTestHelpers.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
const restrictedContext = {
  restrictedTelemetryEnabled: true,
  trackingId: "tracking-id",
  telemetryEndpoint: "https://telemetry.example/telemetry",
  isInternal: true,
  userName: "octocat",
  isVscodeTeamMember: true,
  copilotIgnoreEnabled: false
};
suite("AgentHostRepoInfoTelemetry", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves dotcom and configured Enterprise remotes", () => {
    assert.deepStrictEqual({
      https: resolveRepoInfoRemote("https://github.com/microsoft/vscode.git", void 0),
      ssh: resolveRepoInfoRemote("git@github.com:microsoft/vscode.git", void 0),
      enterprise: resolveRepoInfoRemote("ssh://git@ghe.example.com/octo/repo.git", "ghe.example.com"),
      enterprisePort: resolveRepoInfoRemote("https://ghe.example.com:8443/octo/repo.git", "ghe.example.com:8443"),
      adoHttps: resolveRepoInfoRemote("https://dev.azure.com/Org/Project/_git/Repo", void 0),
      adoSsh: resolveRepoInfoRemote("git@ssh.dev.azure.com:v3/Org/Project/Repo", void 0),
      wrongEnterprise: resolveRepoInfoRemote("https://other.example.com/octo/repo.git", "ghe.example.com")
    }, {
      https: { remoteUrl: "https://github.com/microsoft/vscode.git", repoId: "microsoft/vscode", repoType: "github" },
      ssh: { remoteUrl: "https://github.com/microsoft/vscode.git", repoId: "microsoft/vscode", repoType: "github" },
      enterprise: { remoteUrl: "https://ghe.example.com/octo/repo.git", repoId: "octo/repo", repoType: "github" },
      enterprisePort: { remoteUrl: "https://ghe.example.com:8443/octo/repo.git", repoId: "octo/repo", repoType: "github" },
      adoHttps: { remoteUrl: "https://dev.azure.com/Org/Project/_git/Repo", repoId: "org/project/repo", repoType: "ado" },
      adoSsh: { remoteUrl: "https://ssh.dev.azure.com/v3/Org/Project/Repo", repoId: "org/project/repo", repoType: "ado" },
      wrongEnterprise: void 0
    });
  });
  test("applies the legacy byte and multiplex character limits", () => {
    assert.deepStrictEqual({
      atCharacterLimit: measureRepoInfoDiffsJSON("x".repeat(50 * 8192)).tooLarge,
      overCharacterLimit: measureRepoInfoDiffsJSON("x".repeat(50 * 8192 + 1)).tooLarge,
      overByteLimit: measureRepoInfoDiffsJSON("\u20AC".repeat(307201)).tooLarge
    }, {
      atCharacterLimit: false,
      overCharacterLimit: true,
      overByteLimit: true
    });
  });
  test("emits structured begin and end snapshots against the branch baseline", async () => {
    const root = URI.file("/repo");
    const snapshots = ["tree-begin", "tree-begin", "tree-end", "tree-end"];
    const patches = [];
    const fileDiff = {
      before: { uri: URI.joinPath(root, "src/a.ts").toString(), content: { uri: "git-blob://before" } },
      after: { uri: URI.joinPath(root, "src/a.ts").toString(), content: { uri: "git-blob://after" } },
      diff: { added: 1, removed: 1 }
    };
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["git@github.com:microsoft/vscode.git"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 42 }),
      captureWorkingTreeAsTree: async () => snapshots.shift(),
      computeFileDiffsBetweenRefs: async () => [fileDiff],
      getDiffPatchBetweenRefs: async (_workingDirectory, options) => {
        patches.push(options.toRef);
        return { patch: `patch-${options.toRef}`, tooLarge: false };
      }
    };
    const reports = [];
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({
      reportRepoInfo: async (_context, report) => {
        reports.push(report);
      }
    }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true);
    await collector.reportEnd(restrictedContext, "agent-session://copilot/s1", "turn-1", root, void 0, () => true);
    assert.deepStrictEqual({
      patches,
      reports: reports.map((report) => ({
        telemetryMessageId: report.telemetryMessageId,
        clientType: report.clientType,
        location: report.location,
        result: report.result,
        remoteUrl: report.remoteUrl,
        repoId: report.repoId,
        headCommitHash: report.headCommitHash,
        headBranchName: report.headBranchName,
        fileRelativePaths: report.fileRelativePaths,
        diffs: report.diffsJSON ? JSON.parse(report.diffsJSON) : void 0,
        workspaceFileCount: report.workspaceFileCount,
        changedFileCount: report.changedFileCount
      }))
    }, {
      patches: ["tree-begin", "tree-end"],
      reports: [{
        telemetryMessageId: "turn-1",
        clientType: AgentHostClientType.EditorWindow,
        location: "begin",
        result: "success",
        remoteUrl: "https://github.com/microsoft/vscode.git",
        repoId: "microsoft/vscode",
        headCommitHash: "base",
        headBranchName: "feature",
        fileRelativePaths: JSON.stringify(["src/a.ts"]),
        diffs: [{
          uri: URI.joinPath(root, "src/a.ts").toString(),
          originalUri: URI.joinPath(root, "src/a.ts").toString(),
          status: "MODIFIED",
          diff: "patch-tree-begin"
        }],
        workspaceFileCount: 42,
        changedFileCount: 1
      }, {
        telemetryMessageId: "turn-1",
        clientType: AgentHostClientType.EditorWindow,
        location: "end",
        result: "success",
        remoteUrl: "https://github.com/microsoft/vscode.git",
        repoId: "microsoft/vscode",
        headCommitHash: "base",
        headBranchName: "feature",
        fileRelativePaths: JSON.stringify(["src/a.ts"]),
        diffs: [{
          uri: URI.joinPath(root, "src/a.ts").toString(),
          originalUri: URI.joinPath(root, "src/a.ts").toString(),
          status: "MODIFIED",
          diff: "patch-tree-end"
        }],
        workspaceFileCount: 42,
        changedFileCount: 1
      }]
    });
  });
  test("skips Git collection when restricted telemetry is unavailable", async () => {
    let gitCalls = 0;
    const gitService = {
      ...createNoopGitService(),
      getSessionGitState: async () => {
        gitCalls++;
        return void 0;
      }
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async () => {
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin({ ...restrictedContext, restrictedTelemetryEnabled: false, isInternal: false }, "agent-session://copilot/s1", "turn-1", AgentHostClientType.Unknown, URI.file("/repo"), void 0, () => true);
    assert.strictEqual(gitCalls, 0);
  });
  test("does not emit end after a begin result that legacy suppresses", async () => {
    const root = URI.file("/repo");
    const fileDiffs = Array.from({ length: 101 }, (_, index) => ({
      after: { uri: URI.joinPath(root, `file-${index}.txt`).toString(), content: { uri: `git-blob://after/${index}` } },
      diff: { added: 1, removed: 0 }
    }));
    let snapshots = 0;
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 42 }),
      captureWorkingTreeAsTree: async () => {
        snapshots++;
        return "tree";
      },
      computeFileDiffsBetweenRefs: async () => fileDiffs
    };
    const reports = [];
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.AgentsWindow, root, void 0, () => true);
    await collector.reportEnd(restrictedContext, "agent-session://copilot/s1", "turn-1", root, void 0, () => true);
    assert.deepStrictEqual({ snapshots, results: reports.map((report) => report.result) }, { snapshots: 1, results: ["tooManyChanges"] });
  });
  test("withholds diff content when content exclusion is enabled or unknown", async () => {
    const root = URI.file("/repo");
    let patchCalls = 0;
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/Microsoft/VSCode"],
      getUntrackedPaths: async () => ["new.txt"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 2 }),
      captureWorkingTreeAsTree: async () => "tree",
      computeFileDiffsBetweenRefs: async () => [{
        after: { uri: URI.joinPath(root, "new.txt").toString(), content: { uri: "git-blob://after" } },
        diff: { added: 1, removed: 0 }
      }],
      getDiffPatchBetweenRefs: async () => {
        patchCalls++;
        return { patch: "secret", tooLarge: false };
      }
    };
    const reports = [];
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    for (const [index, copilotIgnoreEnabled] of [true, void 0].entries()) {
      await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled }, "agent-session://copilot/s1", `turn-${index}`, AgentHostClientType.Unknown, root, void 0, () => true);
    }
    assert.deepStrictEqual({
      patchCalls,
      reports: reports.map((report) => ({
        repoId: report.repoId,
        fileRelativePaths: report.fileRelativePaths,
        diffsJSON: report.diffsJSON,
        result: report.result
      }))
    }, {
      patchCalls: 0,
      reports: [{
        repoId: "microsoft/vscode",
        fileRelativePaths: JSON.stringify(["new.txt"]),
        diffsJSON: void 0,
        result: "success"
      }, {
        repoId: "microsoft/vscode",
        fileRelativePaths: JSON.stringify(["new.txt"]),
        diffsJSON: void 0,
        result: "success"
      }]
    });
  });
  test("reports filesChanged when the working tree changes during collection", async () => {
    const root = URI.file("/repo");
    const trees = ["tree-before", "tree-after"];
    const reports = [];
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 1 }),
      captureWorkingTreeAsTree: async () => trees.shift(),
      computeFileDiffsBetweenRefs: async () => [{
        before: { uri: URI.joinPath(root, "a.txt").toString(), content: { uri: "git-blob://before" } },
        after: { uri: URI.joinPath(root, "a.txt").toString(), content: { uri: "git-blob://after" } },
        diff: { added: 1, removed: 1 }
      }],
      getDiffPatchBetweenRefs: async () => ({ patch: "-before\n+after", tooLarge: false })
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true);
    assert.deepStrictEqual(reports.map((report) => ({ result: report.result, diffsJSON: report.diffsJSON, fileRelativePaths: report.fileRelativePaths })), [{
      result: "filesChanged",
      diffsJSON: void 0,
      fileRelativePaths: void 0
    }]);
  });
  test("marks untracked files and truncates each diff at the legacy limit", async () => {
    const root = URI.file("/repo");
    const reports = [];
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      getUntrackedPaths: async () => ["new.txt"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 1 }),
      captureWorkingTreeAsTree: async () => "tree",
      computeFileDiffsBetweenRefs: async () => [{
        after: { uri: URI.joinPath(root, "new.txt").toString(), content: { uri: "git-blob://after" } },
        diff: { added: 1, removed: 0 }
      }],
      getDiffPatchBetweenRefs: async () => ({ patch: "x".repeat(100001), tooLarge: false })
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true);
    const diffs = JSON.parse(reports[0].diffsJSON ?? "[]");
    assert.deepStrictEqual({
      status: diffs[0]?.status,
      diffLength: diffs[0]?.diff.length,
      truncated: diffs[0]?.diff.endsWith(`... Diff truncated (exceeded 100000 characters) for ${URI.joinPath(root, "new.txt").toString()}`)
    }, {
      status: "UNTRACKED",
      diffLength: 100001 + `... Diff truncated (exceeded 100000 characters) for ${URI.joinPath(root, "new.txt").toString()}`.length,
      truncated: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uRmlsZURpZmYgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5LCBtZWFzdXJlUmVwb0luZm9EaWZmc0pTT04sIHJlc29sdmVSZXBvSW5mb1JlbW90ZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0UmVwb0luZm9SZXBvcnQgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcblxuY29uc3QgcmVzdHJpY3RlZENvbnRleHQgPSB7XG5cdHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiB0cnVlLFxuXHR0cmFja2luZ0lkOiAndHJhY2tpbmctaWQnLFxuXHR0ZWxlbWV0cnlFbmRwb2ludDogJ2h0dHBzOi8vdGVsZW1ldHJ5LmV4YW1wbGUvdGVsZW1ldHJ5Jyxcblx0aXNJbnRlcm5hbDogdHJ1ZSxcblx0dXNlck5hbWU6ICdvY3RvY2F0Jyxcblx0aXNWc2NvZGVUZWFtTWVtYmVyOiB0cnVlLFxuXHRjb3BpbG90SWdub3JlRW5hYmxlZDogZmFsc2UsXG59O1xuXG5zdWl0ZSgnQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnknLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVzb2x2ZXMgZG90Y29tIGFuZCBjb25maWd1cmVkIEVudGVycHJpc2UgcmVtb3RlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGh0dHBzOiByZXNvbHZlUmVwb0luZm9SZW1vdGUoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcsIHVuZGVmaW5lZCksXG5cdFx0XHRzc2g6IHJlc29sdmVSZXBvSW5mb1JlbW90ZSgnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS5naXQnLCB1bmRlZmluZWQpLFxuXHRcdFx0ZW50ZXJwcmlzZTogcmVzb2x2ZVJlcG9JbmZvUmVtb3RlKCdzc2g6Ly9naXRAZ2hlLmV4YW1wbGUuY29tL29jdG8vcmVwby5naXQnLCAnZ2hlLmV4YW1wbGUuY29tJyksXG5cdFx0XHRlbnRlcnByaXNlUG9ydDogcmVzb2x2ZVJlcG9JbmZvUmVtb3RlKCdodHRwczovL2doZS5leGFtcGxlLmNvbTo4NDQzL29jdG8vcmVwby5naXQnLCAnZ2hlLmV4YW1wbGUuY29tOjg0NDMnKSxcblx0XHRcdGFkb0h0dHBzOiByZXNvbHZlUmVwb0luZm9SZW1vdGUoJ2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9PcmcvUHJvamVjdC9fZ2l0L1JlcG8nLCB1bmRlZmluZWQpLFxuXHRcdFx0YWRvU3NoOiByZXNvbHZlUmVwb0luZm9SZW1vdGUoJ2dpdEBzc2guZGV2LmF6dXJlLmNvbTp2My9PcmcvUHJvamVjdC9SZXBvJywgdW5kZWZpbmVkKSxcblx0XHRcdHdyb25nRW50ZXJwcmlzZTogcmVzb2x2ZVJlcG9JbmZvUmVtb3RlKCdodHRwczovL290aGVyLmV4YW1wbGUuY29tL29jdG8vcmVwby5naXQnLCAnZ2hlLmV4YW1wbGUuY29tJyksXG5cdFx0fSwge1xuXHRcdFx0aHR0cHM6IHsgcmVtb3RlVXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0JywgcmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsIHJlcG9UeXBlOiAnZ2l0aHViJyB9LFxuXHRcdFx0c3NoOiB7IHJlbW90ZVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcsIHJlcG9JZDogJ21pY3Jvc29mdC92c2NvZGUnLCByZXBvVHlwZTogJ2dpdGh1YicgfSxcblx0XHRcdGVudGVycHJpc2U6IHsgcmVtb3RlVXJsOiAnaHR0cHM6Ly9naGUuZXhhbXBsZS5jb20vb2N0by9yZXBvLmdpdCcsIHJlcG9JZDogJ29jdG8vcmVwbycsIHJlcG9UeXBlOiAnZ2l0aHViJyB9LFxuXHRcdFx0ZW50ZXJwcmlzZVBvcnQ6IHsgcmVtb3RlVXJsOiAnaHR0cHM6Ly9naGUuZXhhbXBsZS5jb206ODQ0My9vY3RvL3JlcG8uZ2l0JywgcmVwb0lkOiAnb2N0by9yZXBvJywgcmVwb1R5cGU6ICdnaXRodWInIH0sXG5cdFx0XHRhZG9IdHRwczogeyByZW1vdGVVcmw6ICdodHRwczovL2Rldi5henVyZS5jb20vT3JnL1Byb2plY3QvX2dpdC9SZXBvJywgcmVwb0lkOiAnb3JnL3Byb2plY3QvcmVwbycsIHJlcG9UeXBlOiAnYWRvJyB9LFxuXHRcdFx0YWRvU3NoOiB7IHJlbW90ZVVybDogJ2h0dHBzOi8vc3NoLmRldi5henVyZS5jb20vdjMvT3JnL1Byb2plY3QvUmVwbycsIHJlcG9JZDogJ29yZy9wcm9qZWN0L3JlcG8nLCByZXBvVHlwZTogJ2FkbycgfSxcblx0XHRcdHdyb25nRW50ZXJwcmlzZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWVzIHRoZSBsZWdhY3kgYnl0ZSBhbmQgbXVsdGlwbGV4IGNoYXJhY3RlciBsaW1pdHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdENoYXJhY3RlckxpbWl0OiBtZWFzdXJlUmVwb0luZm9EaWZmc0pTT04oJ3gnLnJlcGVhdCg1MCAqIDgxOTIpKS50b29MYXJnZSxcblx0XHRcdG92ZXJDaGFyYWN0ZXJMaW1pdDogbWVhc3VyZVJlcG9JbmZvRGlmZnNKU09OKCd4Jy5yZXBlYXQoNTAgKiA4MTkyICsgMSkpLnRvb0xhcmdlLFxuXHRcdFx0b3ZlckJ5dGVMaW1pdDogbWVhc3VyZVJlcG9JbmZvRGlmZnNKU09OKCdcXHUyMGFjJy5yZXBlYXQoMzA3XzIwMSkpLnRvb0xhcmdlLFxuXHRcdH0sIHtcblx0XHRcdGF0Q2hhcmFjdGVyTGltaXQ6IGZhbHNlLFxuXHRcdFx0b3ZlckNoYXJhY3RlckxpbWl0OiB0cnVlLFxuXHRcdFx0b3ZlckJ5dGVMaW1pdDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc3RydWN0dXJlZCBiZWdpbiBhbmQgZW5kIHNuYXBzaG90cyBhZ2FpbnN0IHRoZSBicmFuY2ggYmFzZWxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHNuYXBzaG90cyA9IFsndHJlZS1iZWdpbicsICd0cmVlLWJlZ2luJywgJ3RyZWUtZW5kJywgJ3RyZWUtZW5kJ107XG5cdFx0Y29uc3QgcGF0Y2hlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBmaWxlRGlmZjogSVNlc3Npb25GaWxlRGlmZiA9IHtcblx0XHRcdGJlZm9yZTogeyB1cmk6IFVSSS5qb2luUGF0aChyb290LCAnc3JjL2EudHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYmVmb3JlJyB9IH0sXG5cdFx0XHRhZnRlcjogeyB1cmk6IFVSSS5qb2luUGF0aChyb290LCAnc3JjL2EudHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYWZ0ZXInIH0gfSxcblx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDEgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGdpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlID0ge1xuXHRcdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiByb290LFxuXHRcdFx0Z2V0U2Vzc2lvbkdpdFN0YXRlOiBhc3luYyAoKSA9PiAoeyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSksXG5cdFx0XHRnZXRGZXRjaFJlbW90ZVVybHM6IGFzeW5jICgpID0+IFsnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS5naXQnXSxcblx0XHRcdHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdDogYXN5bmMgKCkgPT4gJ2Jhc2UnLFxuXHRcdFx0Z2V0QnJhbmNoRGlmZlNhZmV0eUluZm86IGFzeW5jICgpID0+ICh7IGhhc1ZpcnR1YWxGaWxlU3lzdGVtOiBmYWxzZSwgYmFzZWxpbmVDb21taXRUaW1lc3RhbXA6IERhdGUubm93KCksIGNvbW1pdENvdW50OiAxLCB3b3Jrc3BhY2VGaWxlQ291bnQ6IDQyIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiBzbmFwc2hvdHMuc2hpZnQoKSxcblx0XHRcdGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmczogYXN5bmMgKCkgPT4gW2ZpbGVEaWZmXSxcblx0XHRcdGdldERpZmZQYXRjaEJldHdlZW5SZWZzOiBhc3luYyAoX3dvcmtpbmdEaXJlY3RvcnksIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0cGF0Y2hlcy5wdXNoKG9wdGlvbnMudG9SZWYpO1xuXHRcdFx0XHRyZXR1cm4geyBwYXRjaDogYHBhdGNoLSR7b3B0aW9ucy50b1JlZn1gLCB0b29MYXJnZTogZmFsc2UgfTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXBvcnRzOiBJQWdlbnRIb3N0UmVwb0luZm9SZXBvcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbGxlY3RvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkoe1xuXHRcdFx0cmVwb3J0UmVwb0luZm86IGFzeW5jIChfY29udGV4dCwgcmVwb3J0KSA9PiB7IHJlcG9ydHMucHVzaChyZXBvcnQpOyB9LFxuXHRcdH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbihyZXN0cmljdGVkQ29udGV4dCwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRFbmQocmVzdHJpY3RlZENvbnRleHQsICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9zMScsICd0dXJuLTEnLCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXRjaGVzLFxuXHRcdFx0cmVwb3J0czogcmVwb3J0cy5tYXAocmVwb3J0ID0+ICh7XG5cdFx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZDogcmVwb3J0LnRlbGVtZXRyeU1lc3NhZ2VJZCxcblx0XHRcdFx0Y2xpZW50VHlwZTogcmVwb3J0LmNsaWVudFR5cGUsXG5cdFx0XHRcdGxvY2F0aW9uOiByZXBvcnQubG9jYXRpb24sXG5cdFx0XHRcdHJlc3VsdDogcmVwb3J0LnJlc3VsdCxcblx0XHRcdFx0cmVtb3RlVXJsOiByZXBvcnQucmVtb3RlVXJsLFxuXHRcdFx0XHRyZXBvSWQ6IHJlcG9ydC5yZXBvSWQsXG5cdFx0XHRcdGhlYWRDb21taXRIYXNoOiByZXBvcnQuaGVhZENvbW1pdEhhc2gsXG5cdFx0XHRcdGhlYWRCcmFuY2hOYW1lOiByZXBvcnQuaGVhZEJyYW5jaE5hbWUsXG5cdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiByZXBvcnQuZmlsZVJlbGF0aXZlUGF0aHMsXG5cdFx0XHRcdGRpZmZzOiByZXBvcnQuZGlmZnNKU09OID8gSlNPTi5wYXJzZShyZXBvcnQuZGlmZnNKU09OKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya3NwYWNlRmlsZUNvdW50OiByZXBvcnQud29ya3NwYWNlRmlsZUNvdW50LFxuXHRcdFx0XHRjaGFuZ2VkRmlsZUNvdW50OiByZXBvcnQuY2hhbmdlZEZpbGVDb3VudCxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRwYXRjaGVzOiBbJ3RyZWUtYmVnaW4nLCAndHJlZS1lbmQnXSxcblx0XHRcdHJlcG9ydHM6IFt7XG5cdFx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZDogJ3R1cm4tMScsXG5cdFx0XHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LFxuXHRcdFx0XHRsb2NhdGlvbjogJ2JlZ2luJyxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdHJlbW90ZVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcsXG5cdFx0XHRcdHJlcG9JZDogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0XHRoZWFkQ29tbWl0SGFzaDogJ2Jhc2UnLFxuXHRcdFx0XHRoZWFkQnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRmaWxlUmVsYXRpdmVQYXRoczogSlNPTi5zdHJpbmdpZnkoWydzcmMvYS50cyddKSxcblx0XHRcdFx0ZGlmZnM6IFt7XG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdCwgJ3NyYy9hLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICdzcmMvYS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0c3RhdHVzOiAnTU9ESUZJRUQnLFxuXHRcdFx0XHRcdGRpZmY6ICdwYXRjaC10cmVlLWJlZ2luJyxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHdvcmtzcGFjZUZpbGVDb3VudDogNDIsXG5cdFx0XHRcdGNoYW5nZWRGaWxlQ291bnQ6IDEsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZDogJ3R1cm4tMScsXG5cdFx0XHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LFxuXHRcdFx0XHRsb2NhdGlvbjogJ2VuZCcsXG5cdFx0XHRcdHJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRyZW1vdGVVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQnLFxuXHRcdFx0XHRyZXBvSWQ6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdFx0aGVhZENvbW1pdEhhc2g6ICdiYXNlJyxcblx0XHRcdFx0aGVhZEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IEpTT04uc3RyaW5naWZ5KFsnc3JjL2EudHMnXSksXG5cdFx0XHRcdGRpZmZzOiBbe1xuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICdzcmMvYS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0b3JpZ2luYWxVcmk6IFVSSS5qb2luUGF0aChyb290LCAnc3JjL2EudHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHN0YXR1czogJ01PRElGSUVEJyxcblx0XHRcdFx0XHRkaWZmOiAncGF0Y2gtdHJlZS1lbmQnLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0d29ya3NwYWNlRmlsZUNvdW50OiA0Mixcblx0XHRcdFx0Y2hhbmdlZEZpbGVDb3VudDogMSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBHaXQgY29sbGVjdGlvbiB3aGVuIHJlc3RyaWN0ZWQgdGVsZW1ldHJ5IGlzIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBnaXRDYWxscyA9IDA7XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0U2Vzc2lvbkdpdFN0YXRlOiBhc3luYyAoKSA9PiB7IGdpdENhbGxzKys7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb2xsZWN0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5KHsgcmVwb3J0UmVwb0luZm86IGFzeW5jICgpID0+IHsgfSB9LCBnaXRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRhd2FpdCBjb2xsZWN0b3IucmVwb3J0QmVnaW4oeyAuLi5yZXN0cmljdGVkQ29udGV4dCwgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCBpc0ludGVybmFsOiBmYWxzZSB9LCAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCAndHVybi0xJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLCBVUkkuZmlsZSgnL3JlcG8nKSwgdW5kZWZpbmVkLCAoKSA9PiB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRDYWxscywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGVtaXQgZW5kIGFmdGVyIGEgYmVnaW4gcmVzdWx0IHRoYXQgbGVnYWN5IHN1cHByZXNzZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IGZpbGVEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAxIH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsIGBmaWxlLSR7aW5kZXh9LnR4dGApLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiBgZ2l0LWJsb2I6Ly9hZnRlci8ke2luZGV4fWAgfSB9LFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdH0pKTtcblx0XHRsZXQgc25hcHNob3RzID0gMDtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcm9vdCxcblx0XHRcdGdldFNlc3Npb25HaXRTdGF0ZTogYXN5bmMgKCkgPT4gKHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pLFxuXHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJ10sXG5cdFx0XHRyZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQ6IGFzeW5jICgpID0+ICdiYXNlJyxcblx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiAoeyBoYXNWaXJ0dWFsRmlsZVN5c3RlbTogZmFsc2UsIGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBEYXRlLm5vdygpLCBjb21taXRDb3VudDogMSwgd29ya3NwYWNlRmlsZUNvdW50OiA0MiB9KSxcblx0XHRcdGNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZTogYXN5bmMgKCkgPT4geyBzbmFwc2hvdHMrKzsgcmV0dXJuICd0cmVlJzsgfSxcblx0XHRcdGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmczogYXN5bmMgKCkgPT4gZmlsZURpZmZzLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVwb3J0czogSUFnZW50SG9zdFJlcG9JbmZvUmVwb3J0W10gPSBbXTtcblx0XHRjb25zdCBjb2xsZWN0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5KHsgcmVwb3J0UmVwb0luZm86IGFzeW5jIChfY29udGV4dCwgcmVwb3J0KSA9PiB7IHJlcG9ydHMucHVzaChyZXBvcnQpOyB9IH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbihyZXN0cmljdGVkQ29udGV4dCwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIEFnZW50SG9zdENsaWVudFR5cGUuQWdlbnRzV2luZG93LCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRFbmQocmVzdHJpY3RlZENvbnRleHQsICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9zMScsICd0dXJuLTEnLCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNuYXBzaG90cywgcmVzdWx0czogcmVwb3J0cy5tYXAocmVwb3J0ID0+IHJlcG9ydC5yZXN1bHQpIH0sIHsgc25hcHNob3RzOiAxLCByZXN1bHRzOiBbJ3Rvb01hbnlDaGFuZ2VzJ10gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dpdGhob2xkcyBkaWZmIGNvbnRlbnQgd2hlbiBjb250ZW50IGV4Y2x1c2lvbiBpcyBlbmFibGVkIG9yIHVua25vd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGxldCBwYXRjaENhbGxzID0gMDtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcm9vdCxcblx0XHRcdGdldFNlc3Npb25HaXRTdGF0ZTogYXN5bmMgKCkgPT4gKHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pLFxuXHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvVlNDb2RlJ10sXG5cdFx0XHRnZXRVbnRyYWNrZWRQYXRoczogYXN5bmMgKCkgPT4gWyduZXcudHh0J10sXG5cdFx0XHRyZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQ6IGFzeW5jICgpID0+ICdiYXNlJyxcblx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiAoeyBoYXNWaXJ0dWFsRmlsZVN5c3RlbTogZmFsc2UsIGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBEYXRlLm5vdygpLCBjb21taXRDb3VudDogMSwgd29ya3NwYWNlRmlsZUNvdW50OiAyIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiAndHJlZScsXG5cdFx0XHRjb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IFt7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICduZXcudHh0JykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2FmdGVyJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH1dLFxuXHRcdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IHsgcGF0Y2hDYWxscysrOyByZXR1cm4geyBwYXRjaDogJ3NlY3JldCcsIHRvb0xhcmdlOiBmYWxzZSB9OyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVwb3J0czogSUFnZW50SG9zdFJlcG9JbmZvUmVwb3J0W10gPSBbXTtcblx0XHRjb25zdCBjb2xsZWN0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5KHsgcmVwb3J0UmVwb0luZm86IGFzeW5jIChfY29udGV4dCwgcmVwb3J0KSA9PiB7IHJlcG9ydHMucHVzaChyZXBvcnQpOyB9IH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBjb3BpbG90SWdub3JlRW5hYmxlZF0gb2YgW3RydWUsIHVuZGVmaW5lZF0uZW50cmllcygpKSB7XG5cdFx0XHRhd2FpdCBjb2xsZWN0b3IucmVwb3J0QmVnaW4oeyAuLi5yZXN0cmljdGVkQ29udGV4dCwgY29waWxvdElnbm9yZUVuYWJsZWQgfSwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgYHR1cm4tJHtpbmRleH1gLCBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXRjaENhbGxzLFxuXHRcdFx0cmVwb3J0czogcmVwb3J0cy5tYXAocmVwb3J0ID0+ICh7XG5cdFx0XHRcdHJlcG9JZDogcmVwb3J0LnJlcG9JZCxcblx0XHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IHJlcG9ydC5maWxlUmVsYXRpdmVQYXRocyxcblx0XHRcdFx0ZGlmZnNKU09OOiByZXBvcnQuZGlmZnNKU09OLFxuXHRcdFx0XHRyZXN1bHQ6IHJlcG9ydC5yZXN1bHQsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0cGF0Y2hDYWxsczogMCxcblx0XHRcdHJlcG9ydHM6IFt7XG5cdFx0XHRcdHJlcG9JZDogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0XHRmaWxlUmVsYXRpdmVQYXRoczogSlNPTi5zdHJpbmdpZnkoWyduZXcudHh0J10pLFxuXHRcdFx0XHRkaWZmc0pTT046IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlcG9JZDogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0XHRmaWxlUmVsYXRpdmVQYXRoczogSlNPTi5zdHJpbmdpZnkoWyduZXcudHh0J10pLFxuXHRcdFx0XHRkaWZmc0pTT046IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBmaWxlc0NoYW5nZWQgd2hlbiB0aGUgd29ya2luZyB0cmVlIGNoYW5nZXMgZHVyaW5nIGNvbGxlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHRyZWVzID0gWyd0cmVlLWJlZm9yZScsICd0cmVlLWFmdGVyJ107XG5cdFx0Y29uc3QgcmVwb3J0czogSUFnZW50SG9zdFJlcG9JbmZvUmVwb3J0W10gPSBbXTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcm9vdCxcblx0XHRcdGdldFNlc3Npb25HaXRTdGF0ZTogYXN5bmMgKCkgPT4gKHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pLFxuXHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJ10sXG5cdFx0XHRyZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQ6IGFzeW5jICgpID0+ICdiYXNlJyxcblx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiAoeyBoYXNWaXJ0dWFsRmlsZVN5c3RlbTogZmFsc2UsIGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBEYXRlLm5vdygpLCBjb21taXRDb3VudDogMSwgd29ya3NwYWNlRmlsZUNvdW50OiAxIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiB0cmVlcy5zaGlmdCgpLFxuXHRcdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiBbe1xuXHRcdFx0XHRiZWZvcmU6IHsgdXJpOiBVUkkuam9pblBhdGgocm9vdCwgJ2EudHh0JykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2JlZm9yZScgfSB9LFxuXHRcdFx0XHRhZnRlcjogeyB1cmk6IFVSSS5qb2luUGF0aChyb290LCAnYS50eHQnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYWZ0ZXInIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMSB9LFxuXHRcdFx0fV0sXG5cdFx0XHRnZXREaWZmUGF0Y2hCZXR3ZWVuUmVmczogYXN5bmMgKCkgPT4gKHsgcGF0Y2g6ICctYmVmb3JlXFxuK2FmdGVyJywgdG9vTGFyZ2U6IGZhbHNlIH0pLFxuXHRcdH07XG5cdFx0Y29uc3QgY29sbGVjdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeSh7IHJlcG9ydFJlcG9JbmZvOiBhc3luYyAoX2NvbnRleHQsIHJlcG9ydCkgPT4geyByZXBvcnRzLnB1c2gocmVwb3J0KTsgfSB9LCBnaXRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRhd2FpdCBjb2xsZWN0b3IucmVwb3J0QmVnaW4ocmVzdHJpY3RlZENvbnRleHQsICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9zMScsICd0dXJuLTEnLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgcm9vdCwgdW5kZWZpbmVkLCAoKSA9PiB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwb3J0cy5tYXAocmVwb3J0ID0+ICh7IHJlc3VsdDogcmVwb3J0LnJlc3VsdCwgZGlmZnNKU09OOiByZXBvcnQuZGlmZnNKU09OLCBmaWxlUmVsYXRpdmVQYXRoczogcmVwb3J0LmZpbGVSZWxhdGl2ZVBhdGhzIH0pKSwgW3tcblx0XHRcdHJlc3VsdDogJ2ZpbGVzQ2hhbmdlZCcsXG5cdFx0XHRkaWZmc0pTT046IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB1bnRyYWNrZWQgZmlsZXMgYW5kIHRydW5jYXRlcyBlYWNoIGRpZmYgYXQgdGhlIGxlZ2FjeSBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgcmVwb3J0czogSUFnZW50SG9zdFJlcG9JbmZvUmVwb3J0W10gPSBbXTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcm9vdCxcblx0XHRcdGdldFNlc3Npb25HaXRTdGF0ZTogYXN5bmMgKCkgPT4gKHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pLFxuXHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJ10sXG5cdFx0XHRnZXRVbnRyYWNrZWRQYXRoczogYXN5bmMgKCkgPT4gWyduZXcudHh0J10sXG5cdFx0XHRyZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQ6IGFzeW5jICgpID0+ICdiYXNlJyxcblx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiAoeyBoYXNWaXJ0dWFsRmlsZVN5c3RlbTogZmFsc2UsIGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBEYXRlLm5vdygpLCBjb21taXRDb3VudDogMSwgd29ya3NwYWNlRmlsZUNvdW50OiAxIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiAndHJlZScsXG5cdFx0XHRjb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IFt7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICduZXcudHh0JykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2FmdGVyJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH1dLFxuXHRcdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jICgpID0+ICh7IHBhdGNoOiAneCcucmVwZWF0KDEwMF8wMDEpLCB0b29MYXJnZTogZmFsc2UgfSksXG5cdFx0fTtcblx0XHRjb25zdCBjb2xsZWN0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5KHsgcmVwb3J0UmVwb0luZm86IGFzeW5jIChfY29udGV4dCwgcmVwb3J0KSA9PiB7IHJlcG9ydHMucHVzaChyZXBvcnQpOyB9IH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbihyZXN0cmljdGVkQ29udGV4dCwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXG5cdFx0Y29uc3QgZGlmZnMgPSBKU09OLnBhcnNlKHJlcG9ydHNbMF0uZGlmZnNKU09OID8/ICdbXScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBkaWZmc1swXT8uc3RhdHVzLFxuXHRcdFx0ZGlmZkxlbmd0aDogZGlmZnNbMF0/LmRpZmYubGVuZ3RoLFxuXHRcdFx0dHJ1bmNhdGVkOiBkaWZmc1swXT8uZGlmZi5lbmRzV2l0aChgLi4uIERpZmYgdHJ1bmNhdGVkIChleGNlZWRlZCAxMDAwMDAgY2hhcmFjdGVycykgZm9yICR7VVJJLmpvaW5QYXRoKHJvb3QsICduZXcudHh0JykudG9TdHJpbmcoKX1gKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICdVTlRSQUNLRUQnLFxuXHRcdFx0ZGlmZkxlbmd0aDogMTAwXzAwMSArIGAuLi4gRGlmZiB0cnVuY2F0ZWQgKGV4Y2VlZGVkIDEwMDAwMCBjaGFyYWN0ZXJzKSBmb3IgJHtVUkkuam9pblBhdGgocm9vdCwgJ25ldy50eHQnKS50b1N0cmluZygpfWAubGVuZ3RoLFxuXHRcdFx0dHJ1bmNhdGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLDRCQUE0QiwwQkFBMEIsNkJBQTZCO0FBRTVGLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUNBQXVDO0FBRWhELE1BQU0sb0JBQW9CO0FBQUEsRUFDekIsNEJBQTRCO0FBQUEsRUFDNUIsWUFBWTtBQUFBLEVBQ1osbUJBQW1CO0FBQUEsRUFDbkIsWUFBWTtBQUFBLEVBQ1osVUFBVTtBQUFBLEVBQ1Ysb0JBQW9CO0FBQUEsRUFDcEIsc0JBQXNCO0FBQ3ZCO0FBRUEsTUFBTSw4QkFBOEIsTUFBTTtBQUN6QyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUsscURBQXFELE1BQU07QUFDL0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixPQUFPLHNCQUFzQiwyQ0FBMkMsTUFBUztBQUFBLE1BQ2pGLEtBQUssc0JBQXNCLHVDQUF1QyxNQUFTO0FBQUEsTUFDM0UsWUFBWSxzQkFBc0IsMkNBQTJDLGlCQUFpQjtBQUFBLE1B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
