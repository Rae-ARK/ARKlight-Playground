import assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../../../base/common/async.js";
import { join } from "../../../../../base/common/path.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { GitRefType } from "../../../common/agentHostGitService.js";
import { SessionConfigKey } from "../../../common/sessionConfigKeys.js";
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, MessageKind, ResponsePartKind, TurnState } from "../../../common/state/sessionState.js";
import { AgentBranchNameGenerator } from "../../../node/shared/agentBranchNameGenerator.js";
import { SessionWorkingDirectoryMissingError, WorktreeIsolation, getWorktreeName, getWorktreesRoot } from "../../../node/shared/worktreeIsolation.js";
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from "../../common/sessionTestHelpers.js";
function createNullCopilotApiService() {
  return {
    _serviceBrand: void 0,
    messages: (..._args) => {
      throw new Error("not implemented");
    },
    countTokens: async () => {
      throw new Error("not implemented");
    },
    models: async () => [],
    responses: async () => {
      throw new Error("not implemented");
    },
    utilityChatCompletion: async () => {
      throw new Error("not implemented");
    },
    resolveRestrictedTelemetryContext: async () => {
      throw new Error("not implemented");
    },
    resolveApiEndpoint: async () => void 0
  };
}
suite("WorktreeIsolation", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let repoRoot;
  let worktreesRoot;
  let db;
  let addWorktreeCalls;
  let addExistingCalls;
  let removeCalls;
  let copyIncludeCalls;
  let copyIncludeError;
  let branchName;
  let hasUncommittedChanges;
  let branchExists;
  let headCommit;
  const sessionUri = URI.parse("agent-session://test/s1");
  const sessionId = "s1";
  function createGitService() {
    return {
      ...createNoopGitService(),
      getRepositoryRoot: async () => repoRoot,
      revParse: async (_root, expr) => expr === "HEAD" ? headCommit : void 0,
      getCurrentBranch: async () => "feature",
      getDefaultBranch: async () => ({ name: "main", startPoint: "main" }),
      getBranches: async () => [
        { ref: "refs/heads/main", name: "main", kind: GitRefType.Head },
        { ref: "refs/heads/feature", name: "feature", kind: GitRefType.Head }
      ],
      branchExists: async () => branchExists,
      hasUncommittedChanges: async () => hasUncommittedChanges,
      addWorktree: async (_root, worktree, branch, startPoint, track) => {
        addWorktreeCalls.push({ worktree, branchName: branch, startPoint, track });
        mkdirSync(worktree.fsPath, { recursive: true });
      },
      copyWorktreeIncludeFiles: async (repositoryRoot, worktree, globs) => {
        copyIncludeCalls.push({ repositoryRoot, worktree, globs: [...globs] });
        if (copyIncludeError) {
          throw copyIncludeError;
        }
      },
      addExistingWorktree: async (_root, worktree, branch) => {
        addExistingCalls.push({ worktree, branchName: branch });
        mkdirSync(worktree.fsPath, { recursive: true });
      },
      removeWorktree: async (_root, worktree) => {
        removeCalls.push(worktree);
        rmSync(worktree.fsPath, { recursive: true, force: true });
      }
    };
  }
  function createIsolation(disposableStore, options) {
    const branchNameGenerator = options?.branchNameGenerator ?? {
      generateBranchName: async () => branchName
    };
    return disposableStore.add(new WorktreeIsolation(
      branchNameGenerator,
      options?.gitService ?? createGitService(),
      createNullCopilotApiService(),
      createSessionDataService(db),
      new NullLogService()
    ));
  }
  setup(() => {
    repoRoot = URI.file(mkdtempSync(join(tmpdir(), "wt-iso-")));
    worktreesRoot = getWorktreesRoot(repoRoot);
    db = new TestSessionDatabase();
    addWorktreeCalls = [];
    addExistingCalls = [];
    removeCalls = [];
    copyIncludeCalls = [];
    copyIncludeError = void 0;
    branchName = "agents/my-feature";
    hasUncommittedChanges = false;
    branchExists = true;
    headCommit = "abc123";
  });
  teardown(() => {
    rmSync(repoRoot.fsPath, { recursive: true, force: true });
    rmSync(worktreesRoot.fsPath, { recursive: true, force: true });
  });
  test("getWorktreesRoot / getWorktreeName derive sibling paths and strip the agents/ prefix", () => {
    assert.deepStrictEqual({
      root: getWorktreesRoot(URI.file("/src/vscode")).fsPath,
      named: getWorktreeName("agents/add-config"),
      namedFlattened: getWorktreeName("agents/feature/sub-topic"),
      namedNoPrefix: getWorktreeName("plain-branch"),
      namedWithBranchPrefix: getWorktreeName("users/alice/agents/add-config", "users/alice/")
    }, {
      root: URI.file("/src/vscode.worktrees").fsPath,
      named: "add-config",
      namedFlattened: "feature-sub-topic",
      namedNoPrefix: "plain-branch",
      namedWithBranchPrefix: "add-config"
    });
  });
  test("resolveIsolationConfig advertises folder/worktree + branch based on git state", async () => {
    const isolation = createIsolation(disposables);
    const noRepo = await isolation.resolveIsolationConfig({ workingDirectory: void 0, config: void 0 });
    const repoWorktree = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: void 0 });
    const repoWorktreeSelected = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "feature" } });
    const repoFolder = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "folder" } });
    headCommit = void 0;
    const noCommits = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: void 0 });
    assert.deepStrictEqual({
      noRepo: { enum: noRepo.isolationProperty.protocol.enum, value: noRepo.isolationValue, branch: noRepo.branchProperty, prefix: noRepo.worktreeBranchPrefixProperty, includeFiles: noRepo.worktreeIncludeFilesProperty, branchTrack: noRepo.worktreeBranchTrackProperty },
      repoWorktree: { enum: repoWorktree.isolationProperty.protocol.enum, value: repoWorktree.isolationValue, branchDefault: repoWorktree.branchDefault, branchReadOnly: repoWorktree.branchProperty?.protocol.readOnly, prefixReadOnly: repoWorktree.worktreeBranchPrefixProperty?.protocol.readOnly, includeFilesReadOnly: repoWorktree.worktreeIncludeFilesProperty?.protocol.readOnly, branchTrackReadOnly: repoWorktree.worktreeBranchTrackProperty?.protocol.readOnly },
      repoWorktreeSelected: { branchDefault: repoWorktreeSelected.branchDefault, branchValue: repoWorktreeSelected.branchValue, branchEnum: repoWorktreeSelected.branchProperty?.protocol.enum },
      repoFolder: { value: repoFolder.isolationValue, branchDefault: repoFolder.branchDefault, branchReadOnly: repoFolder.branchProperty?.protocol.readOnly, hasPrefix: !!repoFolder.worktreeBranchPrefixProperty, hasIncludeFiles: !!repoFolder.worktreeIncludeFilesProperty, hasBranchTrack: !!repoFolder.worktreeBranchTrackProperty },
      noCommits: { enum: noCommits.isolationProperty.protocol.enum, value: noCommits.isolationValue, branch: noCommits.branchProperty, prefix: noCommits.worktreeBranchPrefixProperty, includeFiles: noCommits.worktreeIncludeFilesProperty, branchTrack: noCommits.worktreeBranchTrackProperty }
    }, {
      noRepo: { enum: ["folder"], value: "folder", branch: void 0, prefix: void 0, includeFiles: void 0, branchTrack: void 0 },
      repoWorktree: { enum: ["folder", "worktree"], value: "worktree", branchDefault: "main", branchReadOnly: false, prefixReadOnly: true, includeFilesReadOnly: true, branchTrackReadOnly: true },
      repoWorktreeSelected: { branchDefault: "main", branchValue: "feature", branchEnum: ["main"] },
      repoFolder: { value: "folder", branchDefault: "feature", branchReadOnly: true, hasPrefix: true, hasIncludeFiles: true, hasBranchTrack: true },
      noCommits: { enum: ["folder"], value: "folder", branch: void 0, prefix: void 0, includeFiles: void 0, branchTrack: void 0 }
    });
  });
  test("branchCompletions returns current then default then recent git branches, empty without a working directory", async () => {
    const isolation = createIsolation(disposables);
    assert.deepStrictEqual({
      withDir: await isolation.branchCompletions(repoRoot),
      noDir: await isolation.branchCompletions(void 0)
    }, {
      withDir: { items: [{ value: "feature", label: "feature" }, { value: "main", label: "main" }] },
      noDir: { items: [] }
    });
  });
  test("uses the local default branch name in config and its remote ref as the worktree start point", async () => {
    const gitService = createGitService();
    gitService.getDefaultBranch = async () => ({ name: "main", startPoint: "origin/main" });
    const isolation = createIsolation(disposables, { gitService });
    const config = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: void 0 });
    await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: repoRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main"
      },
      prompt: "do a thing"
    });
    assert.deepStrictEqual({
      branchDefault: config.branchDefault,
      branchEnum: config.branchProperty?.protocol.enum,
      startPoint: addWorktreeCalls[0]?.startPoint
    }, {
      branchDefault: "main",
      branchEnum: ["main"],
      startPoint: "origin/main"
    });
  });
  test("resolveWorkingDirectory creates a worktree, persists metadata, queues the announcement, and is idempotent", async () => {
    const isolation = createIsolation(disposables);
    const config = { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" };
    const first = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: "do a thing" });
    const meta = await isolation.readWorktreeMetadata(sessionUri);
    const announcement = isolation.takePendingAnnouncement(sessionId);
    const second = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: "do a thing" });
    const expectedWorktree = URI.joinPath(worktreesRoot, getWorktreeName(branchName));
    assert.deepStrictEqual({
      returnedWorktree: first.toString(),
      addWorktreeCallCount: addWorktreeCalls.length,
      addWorktreeArgs: addWorktreeCalls.map((c) => ({ worktree: c.worktree.toString(), branchName: c.branchName, startPoint: c.startPoint })),
      metaBranch: meta?.branchName,
      metaWorktree: meta?.worktreePath?.toString(),
      metaRepo: meta?.repositoryRoot?.toString(),
      announcementHasBranch: announcement?.includes(branchName) ?? false,
      secondTakeAnnouncement: isolation.takePendingAnnouncement(sessionId),
      idempotentReturn: second.toString(),
      createdSessions: isolation.createdWorktreeSessionIds
    }, {
      returnedWorktree: expectedWorktree.toString(),
      addWorktreeCallCount: 1,
      addWorktreeArgs: [{ worktree: expectedWorktree.toString(), branchName, startPoint: "main" }],
      metaBranch: branchName,
      metaWorktree: expectedWorktree.toString(),
      metaRepo: repoRoot.toString(),
      announcementHasBranch: true,
      secondTakeAnnouncement: void 0,
      idempotentReturn: expectedWorktree.toString(),
      createdSessions: [sessionId]
    });
  });
  test("resolveWorkingDirectory creates from the primary worktree while copying include files from the selected checkout", async () => {
    const checkoutRoot = URI.joinPath(repoRoot, "linked-checkout");
    const gitService = createGitService();
    let addWorktreeRoot;
    gitService.getRepositoryRoot = async () => checkoutRoot;
    gitService.getWorktreeRoots = async () => [repoRoot, checkoutRoot];
    gitService.addWorktree = async (repositoryRoot, worktree2, branch, startPoint, track) => {
      addWorktreeRoot = repositoryRoot;
      addWorktreeCalls.push({ worktree: worktree2, branchName: branch, startPoint, track });
      mkdirSync(worktree2.fsPath, { recursive: true });
    };
    const isolation = createIsolation(disposables, { gitService });
    const includeFiles = [".env"];
    const worktree = await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: checkoutRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main",
        [SessionConfigKey.WorktreeIncludeFiles]: includeFiles
      }
    });
    const meta = await isolation.readWorktreeMetadata(sessionUri);
    const project = isolation.createdWorktreeProject(sessionId);
    assert.deepStrictEqual({
      worktree: worktree?.toString(),
      addWorktreeRoot: addWorktreeRoot?.toString(),
      includeFileRoot: copyIncludeCalls[0]?.repositoryRoot.toString(),
      metaRepositoryRoot: meta?.repositoryRoot?.toString(),
      project: project && { uri: project.uri.toString(), displayName: project.displayName }
    }, {
      worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
      addWorktreeRoot: repoRoot.toString(),
      includeFileRoot: checkoutRoot.toString(),
      metaRepositoryRoot: repoRoot.toString(),
      project: { uri: repoRoot.toString(), displayName: basename(repoRoot) }
    });
  });
  test("resolveWorkingDirectory falls back to the selected checkout when primary worktree resolution fails", async () => {
    const checkoutRoot = URI.joinPath(repoRoot, "linked-checkout");
    const gitService = createGitService();
    gitService.getRepositoryRoot = async () => checkoutRoot;
    gitService.getWorktreeRoots = async () => {
      throw new Error("worktree enumeration failed");
    };
    const isolation = createIsolation(disposables, { gitService });
    const worktree = await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: checkoutRoot,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" }
    });
    const meta = await isolation.readWorktreeMetadata(sessionUri);
    const fallbackWorktreesRoot = getWorktreesRoot(checkoutRoot);
    assert.deepStrictEqual({
      worktree: worktree?.toString(),
      metaRepositoryRoot: meta?.repositoryRoot?.toString()
    }, {
      worktree: URI.joinPath(fallbackWorktreesRoot, getWorktreeName(branchName)).toString(),
      metaRepositoryRoot: checkoutRoot.toString()
    });
  });
  test("resolveWorkingDirectory names each creation phase, rounding percentages down and debouncing updates", async () => {
    const gitService = createGitService();
    gitService.addWorktree = async (_root, worktree, branch, startPoint, track, onProgress) => {
      addWorktreeCalls.push({ worktree, branchName: branch, startPoint, track });
      mkdirSync(worktree.fsPath, { recursive: true });
      onProgress?.({ filesDone: 7, filesTotal: 800 });
      onProgress?.({ filesDone: 96, filesTotal: 800 });
      onProgress?.({ filesDone: 100, filesTotal: 800 });
      await timeout(50);
      onProgress?.({ filesDone: 800, filesTotal: 800 });
    };
    gitService.copyWorktreeIncludeFiles = async (_root, _worktree, _globs, onProgress) => {
      onProgress?.({ filesDone: 1, filesTotal: 4 });
      onProgress?.({ filesDone: 4, filesTotal: 4 });
    };
    const isolation = createIsolation(disposables, { gitService });
    const activities = [];
    await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: repoRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main",
        [SessionConfigKey.WorktreeIncludeFiles]: [".env"]
      },
      prompt: "do a thing",
      onProgress: (activity) => activities.push(activity)
    });
    assert.deepStrictEqual(activities, [
      "Creating isolated worktree",
      "Creating isolated worktree (naming branch)",
      "Creating isolated worktree (checking out files)",
      "Creating isolated worktree (checking out files, 12%)",
      "Creating isolated worktree (checking out files, 100%)",
      "Creating isolated worktree (copying additional files)",
      "Creating isolated worktree (copying additional files, 100%)"
    ]);
  });
  test("resolveWorkingDirectory avoids an existing worktree directory", async () => {
    const collisionSessionId = "12345678-aaaa-bbbb-cccc-123456789abc";
    const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
    const existingWorktree = URI.joinPath(worktreesRoot, "add-feature");
    mkdirSync(existingWorktree.fsPath, { recursive: true });
    branchExists = false;
    const isolation = createIsolation(disposables, {
      branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService())
    });
    const resolved = await isolation.resolveWorkingDirectory({
      sessionUri: collisionSessionUri,
      sessionId: collisionSessionId,
      workingDirectory: repoRoot,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" },
      prompt: "Add feature"
    });
    assert.deepStrictEqual({
      branchName: addWorktreeCalls[0]?.branchName,
      worktree: resolved?.toString()
    }, {
      branchName: "agents/add-feature-12345678",
      worktree: URI.joinPath(worktreesRoot, "add-feature-12345678").toString()
    });
  });
  test("resolveWorkingDirectory treats a failed branch check as a collision", async () => {
    const collisionSessionId = "12345678-aaaa-bbbb-cccc-123456789abc";
    const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
    const gitService = createGitService();
    let branchExistsCalls = 0;
    gitService.branchExists = async () => {
      if (branchExistsCalls++ === 0) {
        throw new Error("transient failure");
      }
      return false;
    };
    const isolation = createIsolation(disposables, {
      branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
      gitService
    });
    const resolved = await isolation.resolveWorkingDirectory({
      sessionUri: collisionSessionUri,
      sessionId: collisionSessionId,
      workingDirectory: repoRoot,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" },
      prompt: "Add feature"
    });
    assert.deepStrictEqual({
      branchExistsCalls,
      branchName: addWorktreeCalls[0]?.branchName,
      worktree: resolved?.toString()
    }, {
      branchExistsCalls: 2,
      branchName: "agents/add-feature-12345678",
      worktree: URI.joinPath(worktreesRoot, "add-feature-12345678").toString()
    });
  });
  test("resolveWorkingDirectory serializes concurrent creation in the same repository", async () => {
    const gitService = createGitService();
    const checkoutRootA = URI.joinPath(repoRoot, "linked-checkout-a");
    const checkoutRootB = URI.joinPath(repoRoot, "linked-checkout-b");
    const existingBranches = /* @__PURE__ */ new Set();
    let activeAddWorktrees = 0;
    let maxActiveAddWorktrees = 0;
    gitService.getRepositoryRoot = async (workingDirectory) => workingDirectory;
    gitService.getWorktreeRoots = async () => [repoRoot, checkoutRootA, checkoutRootB];
    gitService.branchExists = async (_repositoryRoot, candidate) => existingBranches.has(candidate);
    gitService.addWorktree = async (_repositoryRoot, worktree, candidate, startPoint, track) => {
      activeAddWorktrees++;
      maxActiveAddWorktrees = Math.max(maxActiveAddWorktrees, activeAddWorktrees);
      await timeout(10);
      addWorktreeCalls.push({ worktree, branchName: candidate, startPoint, track });
      existingBranches.add(candidate);
      mkdirSync(worktree.fsPath, { recursive: true });
      activeAddWorktrees--;
    };
    const isolation = createIsolation(disposables, {
      branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
      gitService
    });
    const config = { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" };
    const worktrees = await Promise.all([
      isolation.resolveWorkingDirectory({ sessionUri: URI.parse("agent-session://test/12345678-aaaa-bbbb-cccc-123456789abc"), sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", workingDirectory: checkoutRootA, config, prompt: "Add feature" }),
      isolation.resolveWorkingDirectory({ sessionUri: URI.parse("agent-session://test/87654321-aaaa-bbbb-cccc-123456789abc"), sessionId: "87654321-aaaa-bbbb-cccc-123456789abc", workingDirectory: checkoutRootB, config, prompt: "Add feature" })
    ]);
    assert.deepStrictEqual({
      maxActiveAddWorktrees,
      branchNames: addWorktreeCalls.map((call) => call.branchName),
      worktrees: worktrees.map((worktree) => worktree?.toString())
    }, {
      maxActiveAddWorktrees: 1,
      branchNames: ["agents/add-feature", "agents/add-feature-87654321"],
      worktrees: [
        URI.joinPath(worktreesRoot, "add-feature").toString(),
        URI.joinPath(worktreesRoot, "add-feature-87654321").toString()
      ]
    });
  });
  test("resolveWorkingDirectory is a no-op for folder isolation or a missing branch", async () => {
    const isolation = createIsolation(disposables);
    const folder = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "folder", [SessionConfigKey.Branch]: "main" } });
    const noBranch = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree" } });
    assert.deepStrictEqual({
      folder: folder?.toString(),
      noBranch: noBranch?.toString(),
      addWorktreeCallCount: addWorktreeCalls.length,
      createdSessions: isolation.createdWorktreeSessionIds
    }, {
      folder: repoRoot.toString(),
      noBranch: repoRoot.toString(),
      addWorktreeCallCount: 0,
      createdSessions: []
    });
  });
  test("resolveWorkingDirectory copies configured include files and tolerates copy failures", async () => {
    const isolation = createIsolation(disposables);
    const includeFiles = [".env", ".env.local", "config/**"];
    copyIncludeError = new Error("copy failed");
    const worktree = await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: repoRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main",
        [SessionConfigKey.WorktreeIncludeFiles]: includeFiles
      }
    });
    assert.deepStrictEqual({
      worktree: worktree?.toString(),
      copyIncludeCalls: copyIncludeCalls.map((call) => ({
        repositoryRoot: call.repositoryRoot.toString(),
        worktree: call.worktree.toString(),
        globs: call.globs
      })),
      createdSessions: isolation.createdWorktreeSessionIds
    }, {
      worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
      copyIncludeCalls: [{
        repositoryRoot: repoRoot.toString(),
        worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
        globs: includeFiles
      }],
      createdSessions: [sessionId]
    });
  });
  test("resolveWorkingDirectoryForResume recreates a missing live worktree and preserves an existing directory", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-live-worktree");
    const existingWorktree = URI.joinPath(worktreesRoot, "existing-live-worktree");
    mkdirSync(existingWorktree.fsPath, { recursive: true });
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString())
    ]);
    const outcomes = {
      missingWorktreeRecreated: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree)).toString(),
      existingWorktreeUsedUnchanged: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, existingWorktree)).toString(),
      recreatedWorktrees: addExistingCalls.map((call) => ({ worktree: call.worktree.toString(), branchName: call.branchName }))
    };
    assert.deepStrictEqual(outcomes, {
      missingWorktreeRecreated: missingWorktree.toString(),
      existingWorktreeUsedUnchanged: existingWorktree.toString(),
      recreatedWorktrees: [{ worktree: missingWorktree.toString(), branchName: "feature/x" }]
    });
  });
  test("resolveWorkingDirectoryForResume uses the repository root for archived history", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-archived-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString()),
      db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, "true")
    ]);
    const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);
    assert.deepStrictEqual({ resolved: resolved.toString(), worktreesRecreated: addExistingCalls.length }, {
      resolved: repoRoot.toString(),
      worktreesRecreated: 0
    });
  });
  test("resolveWorkingDirectoryForResume falls back to legacy isDone archived metadata", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-legacy-archived-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString()),
      db.setMetadata(AH_META_IS_DONE_DB_KEY, "true")
    ]);
    const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);
    assert.strictEqual(resolved.toString(), repoRoot.toString());
  });
  test("resolveWorkingDirectoryForResume reports a missing preserved branch", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-branch-worktree");
    branchExists = false;
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString())
    ]);
    await assert.rejects(
      () => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
      (error) => error instanceof SessionWorkingDirectoryMissingError && error.reason !== void 0 && /branch 'feature\/x' no longer exists/.test(error.message)
    );
    assert.strictEqual(addExistingCalls.length, 0);
  });
  test("resolveWorkingDirectoryForResume reports a missing live directory without worktree metadata", async () => {
    const isolation = createIsolation(disposables);
    const missingDirectory = URI.joinPath(repoRoot, "missing-directory");
    await assert.rejects(
      () => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingDirectory),
      (error) => error instanceof SessionWorkingDirectoryMissingError
    );
  });
  test("resolveWorkingDirectoryForResume reports an archived session when its repository root is also missing", async () => {
    const isolation = createIsolation(disposables);
    const missingRepositoryRoot = URI.joinPath(repoRoot, "missing-repository");
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-archived-no-root-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", missingRepositoryRoot.toString()),
      db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, "true")
    ]);
    await assert.rejects(
      () => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
      (error) => error instanceof SessionWorkingDirectoryMissingError
    );
  });
  test("resolveWorktreeProject / createdWorktreeProject expose the repository as the session project", async () => {
    const isolation = createIsolation(disposables);
    const expectedDisplayName = basename(repoRoot);
    const beforeAsync = await isolation.resolveWorktreeProject(sessionUri);
    const beforeSync = isolation.createdWorktreeProject(sessionId);
    await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    const afterAsync = await isolation.resolveWorktreeProject(sessionUri);
    const afterSync = isolation.createdWorktreeProject(sessionId);
    assert.deepStrictEqual({
      beforeAsync,
      beforeSync,
      afterAsync: { uri: afterAsync?.uri.toString(), displayName: afterAsync?.displayName },
      afterSync: { uri: afterSync?.uri.toString(), displayName: afterSync?.displayName },
      unknownSession: isolation.createdWorktreeProject("does-not-exist")
    }, {
      beforeAsync: void 0,
      beforeSync: void 0,
      afterAsync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
      afterSync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
      unknownSession: void 0
    });
  });
  test("resolveWorktreeProject normalizes persisted linked-checkout metadata", async () => {
    const checkoutRoot = URI.joinPath(repoRoot, "linked-checkout");
    const existingWorktree = URI.joinPath(repoRoot, "existing-worktree");
    mkdirSync(existingWorktree.fsPath, { recursive: true });
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", existingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", checkoutRoot.toString())
    ]);
    const gitService = createGitService();
    let resolvedFrom;
    let resolutionCount = 0;
    gitService.getWorktreeRoots = async (workingDirectory) => {
      resolvedFrom = workingDirectory;
      resolutionCount++;
      return [repoRoot, checkoutRoot, existingWorktree];
    };
    const isolation = createIsolation(disposables, { gitService });
    const project = await isolation.resolveWorktreeProject(sessionUri);
    await isolation.resolveWorktreeProject(sessionUri);
    assert.deepStrictEqual({
      resolutionCount,
      resolvedFrom: resolvedFrom?.toString(),
      project: project && { uri: project.uri.toString(), displayName: project.displayName },
      persistedRepositoryRoot: await db.getMetadata("copilot.worktree.repositoryRoot")
    }, {
      resolutionCount: 1,
      resolvedFrom: existingWorktree.toString(),
      project: { uri: repoRoot.toString(), displayName: basename(repoRoot) },
      persistedRepositoryRoot: repoRoot.toString()
    });
  });
  test("applyRestoreAnnouncement prepends a markdown part when worktree metadata exists", async () => {
    const isolation = createIsolation(disposables);
    const turn = {
      id: "t1",
      message: { text: "hi", origin: { kind: MessageKind.User } },
      responseParts: [],
      usage: void 0,
      state: TurnState.Complete
    };
    const withoutMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
    await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    const withMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
    const firstPart = withMeta[0].responseParts[0];
    assert.deepStrictEqual({
      unchangedWhenNoMeta: withoutMeta[0].responseParts.length,
      firstPartKind: firstPart?.kind,
      firstPartHasBranch: firstPart?.kind === ResponsePartKind.Markdown ? firstPart.content.includes(branchName) : false
    }, {
      unchangedWhenNoMeta: 0,
      firstPartKind: ResponsePartKind.Markdown,
      firstPartHasBranch: true
    });
  });
  test("cleanup on archive removes a clean worktree and unarchive recreates it", async () => {
    const isolation = createIsolation(disposables);
    const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    await isolation.cleanupWorktreeOnArchive(sessionUri, sessionId);
    const removedDuringArchive = worktree ? !existsSync(worktree.fsPath) : false;
    await isolation.recreateWorktreeOnUnarchive(sessionUri, sessionId);
    const restoredDuringUnarchive = worktree ? existsSync(worktree.fsPath) : false;
    assert.deepStrictEqual({
      removeCalls: removeCalls.map((u) => u.toString()),
      removedDuringArchive,
      addExistingCalls: addExistingCalls.map((c) => ({ worktree: c.worktree.toString(), branchName: c.branchName })),
      restoredDuringUnarchive
    }, {
      removeCalls: [worktree.toString()],
      removedDuringArchive: true,
      addExistingCalls: [{ worktree: worktree.toString(), branchName }],
      restoredDuringUnarchive: true
    });
  });
  test("removeAllCreatedWorktrees drains every worktree created in this process", async () => {
    const isolation = createIsolation(disposables);
    const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    await isolation.removeAllCreatedWorktrees();
    assert.deepStrictEqual({
      removeCalls: removeCalls.map((u) => u.toString()),
      createdSessions: isolation.createdWorktreeSessionIds
    }, {
      removeCalls: [worktree.toString()],
      createdSessions: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2hhcmVkL3dvcmt0cmVlSXNvbGF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIG1rZHRlbXBTeW5jLCBybVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgR2l0UmVmVHlwZSwgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCBBSF9NRVRBX0lTX0RPTkVfREJfS0VZLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVHVyblN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciwgSUFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2FnZW50QnJhbmNoTmFtZUdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvciwgV29ya3RyZWVJc29sYXRpb24sIGdldFdvcmt0cmVlTmFtZSwgZ2V0V29ya3RyZWVzUm9vdCB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL3dvcmt0cmVlSXNvbGF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RTZXNzaW9uRGF0YWJhc2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcblxuLyoqXG4gKiBNaW5pbWFsIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2V9IHN0dWIgZm9yIGNvbnN0cnVjdGluZyB7QGxpbmsgV29ya3RyZWVJc29sYXRpb259XG4gKiBpbiB0ZXN0cy4gVGVzdHMgaW5qZWN0IHRoZWlyIG93biBicmFuY2gtbmFtZSBnZW5lcmF0b3IsIHNvIGl0cyBtZXRob2RzIGFyZSBuZXZlciBjYWxsZWQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU51bGxDb3BpbG90QXBpU2VydmljZSgpOiBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRtZXNzYWdlczogKC4uLl9hcmdzOiB1bmtub3duW10pOiBuZXZlciA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0Y291bnRUb2tlbnM6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRtb2RlbHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdHJlc3BvbnNlczogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdHV0aWxpdHlDaGF0Q29tcGxldGlvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdHJlc29sdmVBcGlFbmRwb2ludDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5zdWl0ZSgnV29ya3RyZWVJc29sYXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcmVwb1Jvb3Q6IFVSSTtcblx0bGV0IHdvcmt0cmVlc1Jvb3Q6IFVSSTtcblx0bGV0IGRiOiBUZXN0U2Vzc2lvbkRhdGFiYXNlO1xuXHRsZXQgYWRkV29ya3RyZWVDYWxsczogeyB3b3JrdHJlZTogVVJJOyBicmFuY2hOYW1lOiBzdHJpbmc7IHN0YXJ0UG9pbnQ6IHN0cmluZzsgdHJhY2s6IGJvb2xlYW4gfVtdO1xuXHRsZXQgYWRkRXhpc3RpbmdDYWxsczogeyB3b3JrdHJlZTogVVJJOyBicmFuY2hOYW1lOiBzdHJpbmcgfVtdO1xuXHRsZXQgcmVtb3ZlQ2FsbHM6IFVSSVtdO1xuXHRsZXQgY29weUluY2x1ZGVDYWxsczogeyByZXBvc2l0b3J5Um9vdDogVVJJOyB3b3JrdHJlZTogVVJJOyBnbG9iczogcmVhZG9ubHkgc3RyaW5nW10gfVtdO1xuXHRsZXQgY29weUluY2x1ZGVFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGxldCBicmFuY2hOYW1lOiBzdHJpbmc7XG5cdGxldCBoYXNVbmNvbW1pdHRlZENoYW5nZXM6IGJvb2xlYW47XG5cdGxldCBicmFuY2hFeGlzdHM6IGJvb2xlYW47XG5cdGxldCBoZWFkQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvczEnKTtcblx0Y29uc3Qgc2Vzc2lvbklkID0gJ3MxJztcblxuXHRmdW5jdGlvbiBjcmVhdGVHaXRTZXJ2aWNlKCk6IElBZ2VudEhvc3RHaXRTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiByZXBvUm9vdCxcblx0XHRcdHJldlBhcnNlOiBhc3luYyAoX3Jvb3QsIGV4cHIpID0+IGV4cHIgPT09ICdIRUFEJyA/IGhlYWRDb21taXQgOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRDdXJyZW50QnJhbmNoOiBhc3luYyAoKSA9PiAnZmVhdHVyZScsXG5cdFx0XHRnZXREZWZhdWx0QnJhbmNoOiBhc3luYyAoKSA9PiAoeyBuYW1lOiAnbWFpbicsIHN0YXJ0UG9pbnQ6ICdtYWluJyB9KSxcblx0XHRcdGdldEJyYW5jaGVzOiBhc3luYyAoKSA9PiBbXG5cdFx0XHRcdHsgcmVmOiAncmVmcy9oZWFkcy9tYWluJywgbmFtZTogJ21haW4nLCBraW5kOiBHaXRSZWZUeXBlLkhlYWQgfSxcblx0XHRcdFx0eyByZWY6ICdyZWZzL2hlYWRzL2ZlYXR1cmUnLCBuYW1lOiAnZmVhdHVyZScsIGtpbmQ6IEdpdFJlZlR5cGUuSGVhZCB9LFxuXHRcdFx0XSxcblx0XHRcdGJyYW5jaEV4aXN0czogYXN5bmMgKCkgPT4gYnJhbmNoRXhpc3RzLFxuXHRcdFx0aGFzVW5jb21taXR0ZWRDaGFuZ2VzOiBhc3luYyAoKSA9PiBoYXNVbmNvbW1pdHRlZENoYW5nZXMsXG5cdFx0XHRhZGRXb3JrdHJlZTogYXN5bmMgKF9yb290LCB3b3JrdHJlZSwgYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjaykgPT4ge1xuXHRcdFx0XHRhZGRXb3JrdHJlZUNhbGxzLnB1c2goeyB3b3JrdHJlZSwgYnJhbmNoTmFtZTogYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjayB9KTtcblx0XHRcdFx0bWtkaXJTeW5jKHdvcmt0cmVlLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR9LFxuXHRcdFx0Y29weVdvcmt0cmVlSW5jbHVkZUZpbGVzOiBhc3luYyAocmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlLCBnbG9icykgPT4ge1xuXHRcdFx0XHRjb3B5SW5jbHVkZUNhbGxzLnB1c2goeyByZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUsIGdsb2JzOiBbLi4uZ2xvYnNdIH0pO1xuXHRcdFx0XHRpZiAoY29weUluY2x1ZGVFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGNvcHlJbmNsdWRlRXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhZGRFeGlzdGluZ1dvcmt0cmVlOiBhc3luYyAoX3Jvb3QsIHdvcmt0cmVlLCBicmFuY2gpID0+IHtcblx0XHRcdFx0YWRkRXhpc3RpbmdDYWxscy5wdXNoKHsgd29ya3RyZWUsIGJyYW5jaE5hbWU6IGJyYW5jaCB9KTtcblx0XHRcdFx0bWtkaXJTeW5jKHdvcmt0cmVlLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVtb3ZlV29ya3RyZWU6IGFzeW5jIChfcm9vdCwgd29ya3RyZWUpID0+IHtcblx0XHRcdFx0cmVtb3ZlQ2FsbHMucHVzaCh3b3JrdHJlZSk7XG5cdFx0XHRcdHJtU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlU3RvcmU6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGJyYW5jaE5hbWVHZW5lcmF0b3I/OiBJQWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yOyByZWFkb25seSBnaXRTZXJ2aWNlPzogSUFnZW50SG9zdEdpdFNlcnZpY2UgfSk6IFdvcmt0cmVlSXNvbGF0aW9uIHtcblx0XHRjb25zdCBicmFuY2hOYW1lR2VuZXJhdG9yID0gb3B0aW9ucz8uYnJhbmNoTmFtZUdlbmVyYXRvciA/PyB7XG5cdFx0XHRnZW5lcmF0ZUJyYW5jaE5hbWU6IGFzeW5jICgpID0+IGJyYW5jaE5hbWUsXG5cdFx0fTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgV29ya3RyZWVJc29sYXRpb24oXG5cdFx0XHRicmFuY2hOYW1lR2VuZXJhdG9yLFxuXHRcdFx0b3B0aW9ucz8uZ2l0U2VydmljZSA/PyBjcmVhdGVHaXRTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVOdWxsQ29waWxvdEFwaVNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRyZXBvUm9vdCA9IFVSSS5maWxlKG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICd3dC1pc28tJykpKTtcblx0XHR3b3JrdHJlZXNSb290ID0gZ2V0V29ya3RyZWVzUm9vdChyZXBvUm9vdCk7XG5cdFx0ZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGFkZFdvcmt0cmVlQ2FsbHMgPSBbXTtcblx0XHRhZGRFeGlzdGluZ0NhbGxzID0gW107XG5cdFx0cmVtb3ZlQ2FsbHMgPSBbXTtcblx0XHRjb3B5SW5jbHVkZUNhbGxzID0gW107XG5cdFx0Y29weUluY2x1ZGVFcnJvciA9IHVuZGVmaW5lZDtcblx0XHRicmFuY2hOYW1lID0gJ2FnZW50cy9teS1mZWF0dXJlJztcblx0XHRoYXNVbmNvbW1pdHRlZENoYW5nZXMgPSBmYWxzZTtcblx0XHRicmFuY2hFeGlzdHMgPSB0cnVlO1xuXHRcdGhlYWRDb21taXQgPSAnYWJjMTIzJztcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJtU3luYyhyZXBvUm9vdC5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRybVN5bmMod29ya3RyZWVzUm9vdC5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0V29ya3RyZWVzUm9vdCAvIGdldFdvcmt0cmVlTmFtZSBkZXJpdmUgc2libGluZyBwYXRocyBhbmQgc3RyaXAgdGhlIGFnZW50cy8gcHJlZml4JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cm9vdDogZ2V0V29ya3RyZWVzUm9vdChVUkkuZmlsZSgnL3NyYy92c2NvZGUnKSkuZnNQYXRoLFxuXHRcdFx0bmFtZWQ6IGdldFdvcmt0cmVlTmFtZSgnYWdlbnRzL2FkZC1jb25maWcnKSxcblx0XHRcdG5hbWVkRmxhdHRlbmVkOiBnZXRXb3JrdHJlZU5hbWUoJ2FnZW50cy9mZWF0dXJlL3N1Yi10b3BpYycpLFxuXHRcdFx0bmFtZWROb1ByZWZpeDogZ2V0V29ya3RyZWVOYW1lKCdwbGFpbi1icmFuY2gnKSxcblx0XHRcdG5hbWVkV2l0aEJyYW5jaFByZWZpeDogZ2V0V29ya3RyZWVOYW1lKCd1c2Vycy9hbGljZS9hZ2VudHMvYWRkLWNvbmZpZycsICd1c2Vycy9hbGljZS8nKSxcblx0XHR9LCB7XG5cdFx0XHRyb290OiBVUkkuZmlsZSgnL3NyYy92c2NvZGUud29ya3RyZWVzJykuZnNQYXRoLFxuXHRcdFx0bmFtZWQ6ICdhZGQtY29uZmlnJyxcblx0XHRcdG5hbWVkRmxhdHRlbmVkOiAnZmVhdHVyZS1zdWItdG9waWMnLFxuXHRcdFx0bmFtZWROb1ByZWZpeDogJ3BsYWluLWJyYW5jaCcsXG5cdFx0XHRuYW1lZFdpdGhCcmFuY2hQcmVmaXg6ICdhZGQtY29uZmlnJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyBhZHZlcnRpc2VzIGZvbGRlci93b3JrdHJlZSArIGJyYW5jaCBiYXNlZCBvbiBnaXQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IG5vUmVwbyA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlSXNvbGF0aW9uQ29uZmlnKHsgd29ya2luZ0RpcmVjdG9yeTogdW5kZWZpbmVkLCBjb25maWc6IHVuZGVmaW5lZCB9KTtcblx0XHRjb25zdCByZXBvV29ya3RyZWUgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyh7IHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LCBjb25maWc6IHVuZGVmaW5lZCB9KTtcblx0XHRjb25zdCByZXBvV29ya3RyZWVTZWxlY3RlZCA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlSXNvbGF0aW9uQ29uZmlnKHsgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnZmVhdHVyZScgfSB9KTtcblx0XHRjb25zdCByZXBvRm9sZGVyID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVJc29sYXRpb25Db25maWcoeyB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH0gfSk7XG5cdFx0aGVhZENvbW1pdCA9IHVuZGVmaW5lZDsgLy8gdW5ib3JuIEhFQUQgKG5vIGNvbW1pdHMpXG5cdFx0Y29uc3Qgbm9Db21taXRzID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVJc29sYXRpb25Db25maWcoeyB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnOiB1bmRlZmluZWQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG5vUmVwbzogeyBlbnVtOiBub1JlcG8uaXNvbGF0aW9uUHJvcGVydHkucHJvdG9jb2wuZW51bSwgdmFsdWU6IG5vUmVwby5pc29sYXRpb25WYWx1ZSwgYnJhbmNoOiBub1JlcG8uYnJhbmNoUHJvcGVydHksIHByZWZpeDogbm9SZXBvLndvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHksIGluY2x1ZGVGaWxlczogbm9SZXBvLndvcmt0cmVlSW5jbHVkZUZpbGVzUHJvcGVydHksIGJyYW5jaFRyYWNrOiBub1JlcG8ud29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5IH0sXG5cdFx0XHRyZXBvV29ya3RyZWU6IHsgZW51bTogcmVwb1dvcmt0cmVlLmlzb2xhdGlvblByb3BlcnR5LnByb3RvY29sLmVudW0sIHZhbHVlOiByZXBvV29ya3RyZWUuaXNvbGF0aW9uVmFsdWUsIGJyYW5jaERlZmF1bHQ6IHJlcG9Xb3JrdHJlZS5icmFuY2hEZWZhdWx0LCBicmFuY2hSZWFkT25seTogcmVwb1dvcmt0cmVlLmJyYW5jaFByb3BlcnR5Py5wcm90b2NvbC5yZWFkT25seSwgcHJlZml4UmVhZE9ubHk6IHJlcG9Xb3JrdHJlZS53b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5Py5wcm90b2NvbC5yZWFkT25seSwgaW5jbHVkZUZpbGVzUmVhZE9ubHk6IHJlcG9Xb3JrdHJlZS53b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5Py5wcm90b2NvbC5yZWFkT25seSwgYnJhbmNoVHJhY2tSZWFkT25seTogcmVwb1dvcmt0cmVlLndvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eT8ucHJvdG9jb2wucmVhZE9ubHkgfSxcblx0XHRcdHJlcG9Xb3JrdHJlZVNlbGVjdGVkOiB7IGJyYW5jaERlZmF1bHQ6IHJlcG9Xb3JrdHJlZVNlbGVjdGVkLmJyYW5jaERlZmF1bHQsIGJyYW5jaFZhbHVlOiByZXBvV29ya3RyZWVTZWxlY3RlZC5icmFuY2hWYWx1ZSwgYnJhbmNoRW51bTogcmVwb1dvcmt0cmVlU2VsZWN0ZWQuYnJhbmNoUHJvcGVydHk/LnByb3RvY29sLmVudW0gfSxcblx0XHRcdHJlcG9Gb2xkZXI6IHsgdmFsdWU6IHJlcG9Gb2xkZXIuaXNvbGF0aW9uVmFsdWUsIGJyYW5jaERlZmF1bHQ6IHJlcG9Gb2xkZXIuYnJhbmNoRGVmYXVsdCwgYnJhbmNoUmVhZE9ubHk6IHJlcG9Gb2xkZXIuYnJhbmNoUHJvcGVydHk/LnByb3RvY29sLnJlYWRPbmx5LCBoYXNQcmVmaXg6ICEhcmVwb0ZvbGRlci53b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5LCBoYXNJbmNsdWRlRmlsZXM6ICEhcmVwb0ZvbGRlci53b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5LCBoYXNCcmFuY2hUcmFjazogISFyZXBvRm9sZGVyLndvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eSB9LFxuXHRcdFx0bm9Db21taXRzOiB7IGVudW06IG5vQ29tbWl0cy5pc29sYXRpb25Qcm9wZXJ0eS5wcm90b2NvbC5lbnVtLCB2YWx1ZTogbm9Db21taXRzLmlzb2xhdGlvblZhbHVlLCBicmFuY2g6IG5vQ29tbWl0cy5icmFuY2hQcm9wZXJ0eSwgcHJlZml4OiBub0NvbW1pdHMud29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eSwgaW5jbHVkZUZpbGVzOiBub0NvbW1pdHMud29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eSwgYnJhbmNoVHJhY2s6IG5vQ29tbWl0cy53b3JrdHJlZUJyYW5jaFRyYWNrUHJvcGVydHkgfSxcblx0XHR9LCB7XG5cdFx0XHRub1JlcG86IHsgZW51bTogWydmb2xkZXInXSwgdmFsdWU6ICdmb2xkZXInLCBicmFuY2g6IHVuZGVmaW5lZCwgcHJlZml4OiB1bmRlZmluZWQsIGluY2x1ZGVGaWxlczogdW5kZWZpbmVkLCBicmFuY2hUcmFjazogdW5kZWZpbmVkIH0sXG5cdFx0XHRyZXBvV29ya3RyZWU6IHsgZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSwgdmFsdWU6ICd3b3JrdHJlZScsIGJyYW5jaERlZmF1bHQ6ICdtYWluJywgYnJhbmNoUmVhZE9ubHk6IGZhbHNlLCBwcmVmaXhSZWFkT25seTogdHJ1ZSwgaW5jbHVkZUZpbGVzUmVhZE9ubHk6IHRydWUsIGJyYW5jaFRyYWNrUmVhZE9ubHk6IHRydWUgfSxcblx0XHRcdHJlcG9Xb3JrdHJlZVNlbGVjdGVkOiB7IGJyYW5jaERlZmF1bHQ6ICdtYWluJywgYnJhbmNoVmFsdWU6ICdmZWF0dXJlJywgYnJhbmNoRW51bTogWydtYWluJ10gfSxcblx0XHRcdHJlcG9Gb2xkZXI6IHsgdmFsdWU6ICdmb2xkZXInLCBicmFuY2hEZWZhdWx0OiAnZmVhdHVyZScsIGJyYW5jaFJlYWRPbmx5OiB0cnVlLCBoYXNQcmVmaXg6IHRydWUsIGhhc0luY2x1ZGVGaWxlczogdHJ1ZSwgaGFzQnJhbmNoVHJhY2s6IHRydWUgfSxcblx0XHRcdG5vQ29tbWl0czogeyBlbnVtOiBbJ2ZvbGRlciddLCB2YWx1ZTogJ2ZvbGRlcicsIGJyYW5jaDogdW5kZWZpbmVkLCBwcmVmaXg6IHVuZGVmaW5lZCwgaW5jbHVkZUZpbGVzOiB1bmRlZmluZWQsIGJyYW5jaFRyYWNrOiB1bmRlZmluZWQgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnJhbmNoQ29tcGxldGlvbnMgcmV0dXJucyBjdXJyZW50IHRoZW4gZGVmYXVsdCB0aGVuIHJlY2VudCBnaXQgYnJhbmNoZXMsIGVtcHR5IHdpdGhvdXQgYSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2l0aERpcjogYXdhaXQgaXNvbGF0aW9uLmJyYW5jaENvbXBsZXRpb25zKHJlcG9Sb290KSxcblx0XHRcdG5vRGlyOiBhd2FpdCBpc29sYXRpb24uYnJhbmNoQ29tcGxldGlvbnModW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHR3aXRoRGlyOiB7IGl0ZW1zOiBbeyB2YWx1ZTogJ2ZlYXR1cmUnLCBsYWJlbDogJ2ZlYXR1cmUnIH0sIHsgdmFsdWU6ICdtYWluJywgbGFiZWw6ICdtYWluJyB9XSB9LFxuXHRcdFx0bm9EaXI6IHsgaXRlbXM6IFtdIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGxvY2FsIGRlZmF1bHQgYnJhbmNoIG5hbWUgaW4gY29uZmlnIGFuZCBpdHMgcmVtb3RlIHJlZiBhcyB0aGUgd29ya3RyZWUgc3RhcnQgcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZUdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2ggPSBhc3luYyAoKSA9PiAoeyBuYW1lOiAnbWFpbicsIHN0YXJ0UG9pbnQ6ICdvcmlnaW4vbWFpbicgfSk7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzLCB7IGdpdFNlcnZpY2UgfSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyh7IHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LCBjb25maWc6IHVuZGVmaW5lZCB9KTtcblx0XHRhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnkoe1xuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0XHRwcm9tcHQ6ICdkbyBhIHRoaW5nJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YnJhbmNoRGVmYXVsdDogY29uZmlnLmJyYW5jaERlZmF1bHQsXG5cdFx0XHRicmFuY2hFbnVtOiBjb25maWcuYnJhbmNoUHJvcGVydHk/LnByb3RvY29sLmVudW0sXG5cdFx0XHRzdGFydFBvaW50OiBhZGRXb3JrdHJlZUNhbGxzWzBdPy5zdGFydFBvaW50LFxuXHRcdH0sIHtcblx0XHRcdGJyYW5jaERlZmF1bHQ6ICdtYWluJyxcblx0XHRcdGJyYW5jaEVudW06IFsnbWFpbiddLFxuXHRcdFx0c3RhcnRQb2ludDogJ29yaWdpbi9tYWluJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgY3JlYXRlcyBhIHdvcmt0cmVlLCBwZXJzaXN0cyBtZXRhZGF0YSwgcXVldWVzIHRoZSBhbm5vdW5jZW1lbnQsIGFuZCBpcyBpZGVtcG90ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgY29uZmlnID0geyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHsgc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnLCBwcm9tcHQ6ICdkbyBhIHRoaW5nJyB9KTtcblx0XHRjb25zdCBtZXRhID0gYXdhaXQgaXNvbGF0aW9uLnJlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGFubm91bmNlbWVudCA9IGlzb2xhdGlvbi50YWtlUGVuZGluZ0Fubm91bmNlbWVudChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZywgcHJvbXB0OiAnZG8gYSB0aGluZycgfSk7XG5cblx0XHRjb25zdCBleHBlY3RlZFdvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXR1cm5lZFdvcmt0cmVlOiBmaXJzdCEudG9TdHJpbmcoKSxcblx0XHRcdGFkZFdvcmt0cmVlQ2FsbENvdW50OiBhZGRXb3JrdHJlZUNhbGxzLmxlbmd0aCxcblx0XHRcdGFkZFdvcmt0cmVlQXJnczogYWRkV29ya3RyZWVDYWxscy5tYXAoYyA9PiAoeyB3b3JrdHJlZTogYy53b3JrdHJlZS50b1N0cmluZygpLCBicmFuY2hOYW1lOiBjLmJyYW5jaE5hbWUsIHN0YXJ0UG9pbnQ6IGMuc3RhcnRQb2ludCB9KSksXG5cdFx0XHRtZXRhQnJhbmNoOiBtZXRhPy5icmFuY2hOYW1lLFxuXHRcdFx0bWV0YVdvcmt0cmVlOiBtZXRhPy53b3JrdHJlZVBhdGg/LnRvU3RyaW5nKCksXG5cdFx0XHRtZXRhUmVwbzogbWV0YT8ucmVwb3NpdG9yeVJvb3Q/LnRvU3RyaW5nKCksXG5cdFx0XHRhbm5vdW5jZW1lbnRIYXNCcmFuY2g6IGFubm91bmNlbWVudD8uaW5jbHVkZXMoYnJhbmNoTmFtZSkgPz8gZmFsc2UsXG5cdFx0XHRzZWNvbmRUYWtlQW5ub3VuY2VtZW50OiBpc29sYXRpb24udGFrZVBlbmRpbmdBbm5vdW5jZW1lbnQoc2Vzc2lvbklkKSxcblx0XHRcdGlkZW1wb3RlbnRSZXR1cm46IHNlY29uZCEudG9TdHJpbmcoKSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogaXNvbGF0aW9uLmNyZWF0ZWRXb3JrdHJlZVNlc3Npb25JZHMsXG5cdFx0fSwge1xuXHRcdFx0cmV0dXJuZWRXb3JrdHJlZTogZXhwZWN0ZWRXb3JrdHJlZS50b1N0cmluZygpLFxuXHRcdFx0YWRkV29ya3RyZWVDYWxsQ291bnQ6IDEsXG5cdFx0XHRhZGRXb3JrdHJlZUFyZ3M6IFt7IHdvcmt0cmVlOiBleHBlY3RlZFdvcmt0cmVlLnRvU3RyaW5nKCksIGJyYW5jaE5hbWUsIHN0YXJ0UG9pbnQ6ICdtYWluJyB9XSxcblx0XHRcdG1ldGFCcmFuY2g6IGJyYW5jaE5hbWUsXG5cdFx0XHRtZXRhV29ya3RyZWU6IGV4cGVjdGVkV29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHRcdG1ldGFSZXBvOiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0YW5ub3VuY2VtZW50SGFzQnJhbmNoOiB0cnVlLFxuXHRcdFx0c2Vjb25kVGFrZUFubm91bmNlbWVudDogdW5kZWZpbmVkLFxuXHRcdFx0aWRlbXBvdGVudFJldHVybjogZXhwZWN0ZWRXb3JrdHJlZS50b1N0cmluZygpLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiBbc2Vzc2lvbklkXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgY3JlYXRlcyBmcm9tIHRoZSBwcmltYXJ5IHdvcmt0cmVlIHdoaWxlIGNvcHlpbmcgaW5jbHVkZSBmaWxlcyBmcm9tIHRoZSBzZWxlY3RlZCBjaGVja291dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGVja291dFJvb3QgPSBVUkkuam9pblBhdGgocmVwb1Jvb3QsICdsaW5rZWQtY2hlY2tvdXQnKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGxldCBhZGRXb3JrdHJlZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gY2hlY2tvdXRSb290O1xuXHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jICgpID0+IFtyZXBvUm9vdCwgY2hlY2tvdXRSb290XTtcblx0XHRnaXRTZXJ2aWNlLmFkZFdvcmt0cmVlID0gYXN5bmMgKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjaykgPT4ge1xuXHRcdFx0YWRkV29ya3RyZWVSb290ID0gcmVwb3NpdG9yeVJvb3Q7XG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxzLnB1c2goeyB3b3JrdHJlZSwgYnJhbmNoTmFtZTogYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjayB9KTtcblx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzLCB7IGdpdFNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgaW5jbHVkZUZpbGVzID0gWycuZW52J107XG5cblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7XG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogY2hlY2tvdXRSb290LFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdOiBpbmNsdWRlRmlsZXMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IG1ldGEgPSBhd2FpdCBpc29sYXRpb24ucmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcHJvamVjdCA9IGlzb2xhdGlvbi5jcmVhdGVkV29ya3RyZWVQcm9qZWN0KHNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmt0cmVlOiB3b3JrdHJlZT8udG9TdHJpbmcoKSxcblx0XHRcdGFkZFdvcmt0cmVlUm9vdDogYWRkV29ya3RyZWVSb290Py50b1N0cmluZygpLFxuXHRcdFx0aW5jbHVkZUZpbGVSb290OiBjb3B5SW5jbHVkZUNhbGxzWzBdPy5yZXBvc2l0b3J5Um9vdC50b1N0cmluZygpLFxuXHRcdFx0bWV0YVJlcG9zaXRvcnlSb290OiBtZXRhPy5yZXBvc2l0b3J5Um9vdD8udG9TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHByb2plY3QgJiYgeyB1cmk6IHByb2plY3QudXJpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBwcm9qZWN0LmRpc3BsYXlOYW1lIH0sXG5cdFx0fSwge1xuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCBnZXRXb3JrdHJlZU5hbWUoYnJhbmNoTmFtZSkpLnRvU3RyaW5nKCksXG5cdFx0XHRhZGRXb3JrdHJlZVJvb3Q6IHJlcG9Sb290LnRvU3RyaW5nKCksXG5cdFx0XHRpbmNsdWRlRmlsZVJvb3Q6IGNoZWNrb3V0Um9vdC50b1N0cmluZygpLFxuXHRcdFx0bWV0YVJlcG9zaXRvcnlSb290OiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6IHJlcG9Sb290LnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBiYXNlbmFtZShyZXBvUm9vdCkgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgZmFsbHMgYmFjayB0byB0aGUgc2VsZWN0ZWQgY2hlY2tvdXQgd2hlbiBwcmltYXJ5IHdvcmt0cmVlIHJlc29sdXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hlY2tvdXRSb290ID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0Jyk7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZUdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gY2hlY2tvdXRSb290O1xuXHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCd3b3JrdHJlZSBlbnVtZXJhdGlvbiBmYWlsZWQnKTsgfTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHsgZ2l0U2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjaGVja291dFJvb3QsXG5cdFx0XHRjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJywgW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ21haW4nIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IGlzb2xhdGlvbi5yZWFkV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBmYWxsYmFja1dvcmt0cmVlc1Jvb3QgPSBnZXRXb3JrdHJlZXNSb290KGNoZWNrb3V0Um9vdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmt0cmVlOiB3b3JrdHJlZT8udG9TdHJpbmcoKSxcblx0XHRcdG1ldGFSZXBvc2l0b3J5Um9vdDogbWV0YT8ucmVwb3NpdG9yeVJvb3Q/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aChmYWxsYmFja1dvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lKSkudG9TdHJpbmcoKSxcblx0XHRcdG1ldGFSZXBvc2l0b3J5Um9vdDogY2hlY2tvdXRSb290LnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5IG5hbWVzIGVhY2ggY3JlYXRpb24gcGhhc2UsIHJvdW5kaW5nIHBlcmNlbnRhZ2VzIGRvd24gYW5kIGRlYm91bmNpbmcgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UuYWRkV29ya3RyZWUgPSBhc3luYyAoX3Jvb3QsIHdvcmt0cmVlLCBicmFuY2gsIHN0YXJ0UG9pbnQsIHRyYWNrLCBvblByb2dyZXNzKSA9PiB7XG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxzLnB1c2goeyB3b3JrdHJlZSwgYnJhbmNoTmFtZTogYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjayB9KTtcblx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0b25Qcm9ncmVzcz8uKHsgZmlsZXNEb25lOiA3LCBmaWxlc1RvdGFsOiA4MDAgfSk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDk2LCBmaWxlc1RvdGFsOiA4MDAgfSk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDEwMCwgZmlsZXNUb3RhbDogODAwIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDgwMCwgZmlsZXNUb3RhbDogODAwIH0pO1xuXHRcdH07XG5cdFx0Z2l0U2VydmljZS5jb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMgPSBhc3luYyAoX3Jvb3QsIF93b3JrdHJlZSwgX2dsb2JzLCBvblByb2dyZXNzKSA9PiB7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDEsIGZpbGVzVG90YWw6IDQgfSk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDQsIGZpbGVzVG90YWw6IDQgfSk7XG5cdFx0fTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHsgZ2l0U2VydmljZSB9KTtcblx0XHRjb25zdCBhY3Rpdml0aWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0YXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXTogWycuZW52J10sXG5cdFx0XHR9LFxuXHRcdFx0cHJvbXB0OiAnZG8gYSB0aGluZycsXG5cdFx0XHRvblByb2dyZXNzOiBhY3Rpdml0eSA9PiBhY3Rpdml0aWVzLnB1c2goYWN0aXZpdHkpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpdml0aWVzLCBbXG5cdFx0XHQnQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUnLFxuXHRcdFx0J0NyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlIChuYW1pbmcgYnJhbmNoKScsXG5cdFx0XHQnQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNoZWNraW5nIG91dCBmaWxlcyknLFxuXHRcdFx0J0NyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlIChjaGVja2luZyBvdXQgZmlsZXMsIDEyJSknLFxuXHRcdFx0J0NyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlIChjaGVja2luZyBvdXQgZmlsZXMsIDEwMCUpJyxcblx0XHRcdCdDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZSAoY29weWluZyBhZGRpdGlvbmFsIGZpbGVzKScsXG5cdFx0XHQnQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNvcHlpbmcgYWRkaXRpb25hbCBmaWxlcywgMTAwJSknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeSBhdm9pZHMgYW4gZXhpc3Rpbmcgd29ya3RyZWUgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25JZCA9ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnO1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25VcmkgPSBVUkkucGFyc2UoYGFnZW50LXNlc3Npb246Ly90ZXN0LyR7Y29sbGlzaW9uU2Vzc2lvbklkfWApO1xuXHRcdGNvbnN0IGV4aXN0aW5nV29ya3RyZWUgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2FkZC1mZWF0dXJlJyk7XG5cdFx0bWtkaXJTeW5jKGV4aXN0aW5nV29ya3RyZWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRicmFuY2hFeGlzdHMgPSBmYWxzZTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHtcblx0XHRcdGJyYW5jaE5hbWVHZW5lcmF0b3I6IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY3JlYXRlTnVsbENvcGlsb3RBcGlTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25Vcmk6IGNvbGxpc2lvblNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQ6IGNvbGxpc2lvblNlc3Npb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9LFxuXHRcdFx0cHJvbXB0OiAnQWRkIGZlYXR1cmUnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2hOYW1lOiBhZGRXb3JrdHJlZUNhbGxzWzBdPy5icmFuY2hOYW1lLFxuXHRcdFx0d29ya3RyZWU6IHJlc29sdmVkPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGJyYW5jaE5hbWU6ICdhZ2VudHMvYWRkLWZlYXR1cmUtMTIzNDU2NzgnLFxuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAnYWRkLWZlYXR1cmUtMTIzNDU2NzgnKS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeSB0cmVhdHMgYSBmYWlsZWQgYnJhbmNoIGNoZWNrIGFzIGEgY29sbGlzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25JZCA9ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnO1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25VcmkgPSBVUkkucGFyc2UoYGFnZW50LXNlc3Npb246Ly90ZXN0LyR7Y29sbGlzaW9uU2Vzc2lvbklkfWApO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVHaXRTZXJ2aWNlKCk7XG5cdFx0bGV0IGJyYW5jaEV4aXN0c0NhbGxzID0gMDtcblx0XHRnaXRTZXJ2aWNlLmJyYW5jaEV4aXN0cyA9IGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChicmFuY2hFeGlzdHNDYWxscysrID09PSAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigndHJhbnNpZW50IGZhaWx1cmUnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcywge1xuXHRcdFx0YnJhbmNoTmFtZUdlbmVyYXRvcjogbmV3IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvcihjcmVhdGVOdWxsQ29waWxvdEFwaVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0Z2l0U2VydmljZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25Vcmk6IGNvbGxpc2lvblNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQ6IGNvbGxpc2lvblNlc3Npb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9LFxuXHRcdFx0cHJvbXB0OiAnQWRkIGZlYXR1cmUnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2hFeGlzdHNDYWxscyxcblx0XHRcdGJyYW5jaE5hbWU6IGFkZFdvcmt0cmVlQ2FsbHNbMF0/LmJyYW5jaE5hbWUsXG5cdFx0XHR3b3JrdHJlZTogcmVzb2x2ZWQ/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0YnJhbmNoRXhpc3RzQ2FsbHM6IDIsXG5cdFx0XHRicmFuY2hOYW1lOiAnYWdlbnRzL2FkZC1mZWF0dXJlLTEyMzQ1Njc4Jyxcblx0XHRcdHdvcmt0cmVlOiBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2FkZC1mZWF0dXJlLTEyMzQ1Njc4JykudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnkgc2VyaWFsaXplcyBjb25jdXJyZW50IGNyZWF0aW9uIGluIHRoZSBzYW1lIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZUdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGVja291dFJvb3RBID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0LWEnKTtcblx0XHRjb25zdCBjaGVja291dFJvb3RCID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0LWInKTtcblx0XHRjb25zdCBleGlzdGluZ0JyYW5jaGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IGFjdGl2ZUFkZFdvcmt0cmVlcyA9IDA7XG5cdFx0bGV0IG1heEFjdGl2ZUFkZFdvcmt0cmVlcyA9IDA7XG5cdFx0Z2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdvcmtpbmdEaXJlY3RvcnkgPT4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRnaXRTZXJ2aWNlLmdldFdvcmt0cmVlUm9vdHMgPSBhc3luYyAoKSA9PiBbcmVwb1Jvb3QsIGNoZWNrb3V0Um9vdEEsIGNoZWNrb3V0Um9vdEJdO1xuXHRcdGdpdFNlcnZpY2UuYnJhbmNoRXhpc3RzID0gYXN5bmMgKF9yZXBvc2l0b3J5Um9vdCwgY2FuZGlkYXRlKSA9PiBleGlzdGluZ0JyYW5jaGVzLmhhcyhjYW5kaWRhdGUpO1xuXHRcdGdpdFNlcnZpY2UuYWRkV29ya3RyZWUgPSBhc3luYyAoX3JlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgY2FuZGlkYXRlLCBzdGFydFBvaW50LCB0cmFjaykgPT4ge1xuXHRcdFx0YWN0aXZlQWRkV29ya3RyZWVzKys7XG5cdFx0XHRtYXhBY3RpdmVBZGRXb3JrdHJlZXMgPSBNYXRoLm1heChtYXhBY3RpdmVBZGRXb3JrdHJlZXMsIGFjdGl2ZUFkZFdvcmt0cmVlcyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdGFkZFdvcmt0cmVlQ2FsbHMucHVzaCh7IHdvcmt0cmVlLCBicmFuY2hOYW1lOiBjYW5kaWRhdGUsIHN0YXJ0UG9pbnQsIHRyYWNrIH0pO1xuXHRcdFx0ZXhpc3RpbmdCcmFuY2hlcy5hZGQoY2FuZGlkYXRlKTtcblx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YWN0aXZlQWRkV29ya3RyZWVzLS07XG5cdFx0fTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHtcblx0XHRcdGJyYW5jaE5hbWVHZW5lcmF0b3I6IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY3JlYXRlTnVsbENvcGlsb3RBcGlTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29uZmlnID0geyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlcyA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25Vcmk6IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJyksIHNlc3Npb25JZDogJzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsIHdvcmtpbmdEaXJlY3Rvcnk6IGNoZWNrb3V0Um9vdEEsIGNvbmZpZywgcHJvbXB0OiAnQWRkIGZlYXR1cmUnIH0pLFxuXHRcdFx0aXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHsgc2Vzc2lvblVyaTogVVJJLnBhcnNlKCdhZ2VudC1zZXNzaW9uOi8vdGVzdC84NzY1NDMyMS1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnKSwgc2Vzc2lvbklkOiAnODc2NTQzMjEtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJywgd29ya2luZ0RpcmVjdG9yeTogY2hlY2tvdXRSb290QiwgY29uZmlnLCBwcm9tcHQ6ICdBZGQgZmVhdHVyZScgfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1heEFjdGl2ZUFkZFdvcmt0cmVlcyxcblx0XHRcdGJyYW5jaE5hbWVzOiBhZGRXb3JrdHJlZUNhbGxzLm1hcChjYWxsID0+IGNhbGwuYnJhbmNoTmFtZSksXG5cdFx0XHR3b3JrdHJlZXM6IHdvcmt0cmVlcy5tYXAod29ya3RyZWUgPT4gd29ya3RyZWU/LnRvU3RyaW5nKCkpLFxuXHRcdH0sIHtcblx0XHRcdG1heEFjdGl2ZUFkZFdvcmt0cmVlczogMSxcblx0XHRcdGJyYW5jaE5hbWVzOiBbJ2FnZW50cy9hZGQtZmVhdHVyZScsICdhZ2VudHMvYWRkLWZlYXR1cmUtODc2NTQzMjEnXSxcblx0XHRcdHdvcmt0cmVlczogW1xuXHRcdFx0XHRVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2FkZC1mZWF0dXJlJykudG9TdHJpbmcoKSxcblx0XHRcdFx0VVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdhZGQtZmVhdHVyZS04NzY1NDMyMScpLnRvU3RyaW5nKCksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeSBpcyBhIG5vLW9wIGZvciBmb2xkZXIgaXNvbGF0aW9uIG9yIGEgbWlzc2luZyBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnZm9sZGVyJywgW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ21haW4nIH0gfSk7XG5cdFx0Y29uc3Qgbm9CcmFuY2ggPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkoeyBzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LCBjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmb2xkZXI6IGZvbGRlcj8udG9TdHJpbmcoKSxcblx0XHRcdG5vQnJhbmNoOiBub0JyYW5jaD8udG9TdHJpbmcoKSxcblx0XHRcdGFkZFdvcmt0cmVlQ2FsbENvdW50OiBhZGRXb3JrdHJlZUNhbGxzLmxlbmd0aCxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogaXNvbGF0aW9uLmNyZWF0ZWRXb3JrdHJlZVNlc3Npb25JZHMsXG5cdFx0fSwge1xuXHRcdFx0Zm9sZGVyOiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0bm9CcmFuY2g6IHJlcG9Sb290LnRvU3RyaW5nKCksXG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxDb3VudDogMCxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5IGNvcGllcyBjb25maWd1cmVkIGluY2x1ZGUgZmlsZXMgYW5kIHRvbGVyYXRlcyBjb3B5IGZhaWx1cmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgaW5jbHVkZUZpbGVzID0gWycuZW52JywgJy5lbnYubG9jYWwnLCAnY29uZmlnLyoqJ107XG5cdFx0Y29weUluY2x1ZGVFcnJvciA9IG5ldyBFcnJvcignY29weSBmYWlsZWQnKTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXTogaW5jbHVkZUZpbGVzLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d29ya3RyZWU6IHdvcmt0cmVlPy50b1N0cmluZygpLFxuXHRcdFx0Y29weUluY2x1ZGVDYWxsczogY29weUluY2x1ZGVDYWxscy5tYXAoY2FsbCA9PiAoe1xuXHRcdFx0XHRyZXBvc2l0b3J5Um9vdDogY2FsbC5yZXBvc2l0b3J5Um9vdC50b1N0cmluZygpLFxuXHRcdFx0XHR3b3JrdHJlZTogY2FsbC53b3JrdHJlZS50b1N0cmluZygpLFxuXHRcdFx0XHRnbG9iczogY2FsbC5nbG9icyxcblx0XHRcdH0pKSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogaXNvbGF0aW9uLmNyZWF0ZWRXb3JrdHJlZVNlc3Npb25JZHMsXG5cdFx0fSwge1xuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCBnZXRXb3JrdHJlZU5hbWUoYnJhbmNoTmFtZSkpLnRvU3RyaW5nKCksXG5cdFx0XHRjb3B5SW5jbHVkZUNhbGxzOiBbe1xuXHRcdFx0XHRyZXBvc2l0b3J5Um9vdDogcmVwb1Jvb3QudG9TdHJpbmcoKSxcblx0XHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCBnZXRXb3JrdHJlZU5hbWUoYnJhbmNoTmFtZSkpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGdsb2JzOiBpbmNsdWRlRmlsZXMsXG5cdFx0XHR9XSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogW3Nlc3Npb25JZF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lIHJlY3JlYXRlcyBhIG1pc3NpbmcgbGl2ZSB3b3JrdHJlZSBhbmQgcHJlc2VydmVzIGFuIGV4aXN0aW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1pc3NpbmdXb3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAnbWlzc2luZy1saXZlLXdvcmt0cmVlJyk7XG5cdFx0Y29uc3QgZXhpc3RpbmdXb3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAnZXhpc3RpbmctbGl2ZS13b3JrdHJlZScpO1xuXHRcdG1rZGlyU3luYyhleGlzdGluZ1dvcmt0cmVlLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUuYnJhbmNoTmFtZScsICdmZWF0dXJlL3gnKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnBhdGgnLCBtaXNzaW5nV29ya3RyZWUudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcsIHJlcG9Sb290LnRvU3RyaW5nKCkpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3V0Y29tZXMgPSB7XG5cdFx0XHRtaXNzaW5nV29ya3RyZWVSZWNyZWF0ZWQ6IChhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCBtaXNzaW5nV29ya3RyZWUpKS50b1N0cmluZygpLFxuXHRcdFx0ZXhpc3RpbmdXb3JrdHJlZVVzZWRVbmNoYW5nZWQ6IChhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCBleGlzdGluZ1dvcmt0cmVlKSkudG9TdHJpbmcoKSxcblx0XHRcdHJlY3JlYXRlZFdvcmt0cmVlczogYWRkRXhpc3RpbmdDYWxscy5tYXAoY2FsbCA9PiAoeyB3b3JrdHJlZTogY2FsbC53b3JrdHJlZS50b1N0cmluZygpLCBicmFuY2hOYW1lOiBjYWxsLmJyYW5jaE5hbWUgfSkpLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG91dGNvbWVzLCB7XG5cdFx0XHRtaXNzaW5nV29ya3RyZWVSZWNyZWF0ZWQ6IG1pc3NpbmdXb3JrdHJlZS50b1N0cmluZygpLFxuXHRcdFx0ZXhpc3RpbmdXb3JrdHJlZVVzZWRVbmNoYW5nZWQ6IGV4aXN0aW5nV29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHRcdHJlY3JlYXRlZFdvcmt0cmVlczogW3sgd29ya3RyZWU6IG1pc3NpbmdXb3JrdHJlZS50b1N0cmluZygpLCBicmFuY2hOYW1lOiAnZmVhdHVyZS94JyB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUgdXNlcyB0aGUgcmVwb3NpdG9yeSByb290IGZvciBhcmNoaXZlZCBoaXN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWlzc2luZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdtaXNzaW5nLWFyY2hpdmVkLXdvcmt0cmVlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUuYnJhbmNoTmFtZScsICdmZWF0dXJlL3gnKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnBhdGgnLCBtaXNzaW5nV29ya3RyZWUudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcsIHJlcG9Sb290LnRvU3RyaW5nKCkpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVksICd0cnVlJyksXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIG1pc3NpbmdXb3JrdHJlZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzb2x2ZWQ6IHJlc29sdmVkLnRvU3RyaW5nKCksIHdvcmt0cmVlc1JlY3JlYXRlZDogYWRkRXhpc3RpbmdDYWxscy5sZW5ndGggfSwge1xuXHRcdFx0cmVzb2x2ZWQ6IHJlcG9Sb290LnRvU3RyaW5nKCksXG5cdFx0XHR3b3JrdHJlZXNSZWNyZWF0ZWQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lIGZhbGxzIGJhY2sgdG8gbGVnYWN5IGlzRG9uZSBhcmNoaXZlZCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1pc3NpbmdXb3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAnbWlzc2luZy1sZWdhY3ktYXJjaGl2ZWQtd29ya3RyZWUnKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJywgJ2ZlYXR1cmUveCcpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucGF0aCcsIG1pc3NpbmdXb3JrdHJlZS50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JywgcmVwb1Jvb3QudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YShBSF9NRVRBX0lTX0RPTkVfREJfS0VZLCAndHJ1ZScpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCBtaXNzaW5nV29ya3RyZWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLnRvU3RyaW5nKCksIHJlcG9Sb290LnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZSByZXBvcnRzIGEgbWlzc2luZyBwcmVzZXJ2ZWQgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWlzc2luZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdtaXNzaW5nLWJyYW5jaC13b3JrdHJlZScpO1xuXHRcdGJyYW5jaEV4aXN0cyA9IGZhbHNlO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLmJyYW5jaE5hbWUnLCAnZmVhdHVyZS94JyksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5wYXRoJywgbWlzc2luZ1dvcmt0cmVlLnRvU3RyaW5nKCkpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucmVwb3NpdG9yeVJvb3QnLCByZXBvUm9vdC50b1N0cmluZygpKSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lKHNlc3Npb25VcmksIHNlc3Npb25JZCwgbWlzc2luZ1dvcmt0cmVlKSxcblx0XHRcdChlcnJvcjogRXJyb3IpID0+IGVycm9yIGluc3RhbmNlb2YgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3Jcblx0XHRcdFx0JiYgZXJyb3IucmVhc29uICE9PSB1bmRlZmluZWRcblx0XHRcdFx0JiYgL2JyYW5jaCAnZmVhdHVyZVxcL3gnIG5vIGxvbmdlciBleGlzdHMvLnRlc3QoZXJyb3IubWVzc2FnZSksXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkRXhpc3RpbmdDYWxscy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZSByZXBvcnRzIGEgbWlzc2luZyBsaXZlIGRpcmVjdG9yeSB3aXRob3V0IHdvcmt0cmVlIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWlzc2luZ0RpcmVjdG9yeSA9IFVSSS5qb2luUGF0aChyZXBvUm9vdCwgJ21pc3NpbmctZGlyZWN0b3J5Jyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIG1pc3NpbmdEaXJlY3RvcnkpLFxuXHRcdFx0KGVycm9yOiBFcnJvcikgPT4gZXJyb3IgaW5zdGFuY2VvZiBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvcixcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZSByZXBvcnRzIGFuIGFyY2hpdmVkIHNlc3Npb24gd2hlbiBpdHMgcmVwb3NpdG9yeSByb290IGlzIGFsc28gbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1pc3NpbmdSZXBvc2l0b3J5Um9vdCA9IFVSSS5qb2luUGF0aChyZXBvUm9vdCwgJ21pc3NpbmctcmVwb3NpdG9yeScpO1xuXHRcdGNvbnN0IG1pc3NpbmdXb3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAnbWlzc2luZy1hcmNoaXZlZC1uby1yb290LXdvcmt0cmVlJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUuYnJhbmNoTmFtZScsICdmZWF0dXJlL3gnKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnBhdGgnLCBtaXNzaW5nV29ya3RyZWUudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcsIG1pc3NpbmdSZXBvc2l0b3J5Um9vdC50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCAndHJ1ZScpLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCBtaXNzaW5nV29ya3RyZWUpLFxuXHRcdFx0KGVycm9yOiBFcnJvcikgPT4gZXJyb3IgaW5zdGFuY2VvZiBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvcixcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3RyZWVQcm9qZWN0IC8gY3JlYXRlZFdvcmt0cmVlUHJvamVjdCBleHBvc2UgdGhlIHJlcG9zaXRvcnkgYXMgdGhlIHNlc3Npb24gcHJvamVjdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgd29ya3RyZWUgbGl2ZXMgYXQgYDxyZXBvPi53b3JrdHJlZXMvPG5hbWU+YCwgYnV0IGEgd29ya3RyZWUgc2Vzc2lvblxuXHRcdC8vIG11c3QgZ3JvdXAgdW5kZXIgdGhlIHJlcG9zaXRvcnkgaW4gdGhlIHNlc3Npb25zIFVJLiBCb3RoIGFjY2Vzc29ycyByZXR1cm5cblx0XHQvLyB0aGUgcmVwbyByb290IGFzIHRoZSBwcm9qZWN0IHNvIGFnZW50cyBjYW4gbWVyZ2UgaXQgaW50byB0aGUgcmVwb3J0ZWRcblx0XHQvLyBgSUFnZW50U2Vzc2lvbk1ldGFkYXRhYCAvIG1hdGVyaWFsaXplIGV2ZW50LiBGb2xkZXIgKG5vbi13b3JrdHJlZSlcblx0XHQvLyBzZXNzaW9ucyBoYXZlIG5vIHdvcmt0cmVlIG1ldGFkYXRhIGFuZCBnZXQgYHVuZGVmaW5lZGAuXG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBleHBlY3RlZERpc3BsYXlOYW1lID0gYmFzZW5hbWUocmVwb1Jvb3QpO1xuXG5cdFx0Y29uc3QgYmVmb3JlQXN5bmMgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmt0cmVlUHJvamVjdChzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBiZWZvcmVTeW5jID0gaXNvbGF0aW9uLmNyZWF0ZWRXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbklkKTtcblxuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSB9KTtcblxuXHRcdGNvbnN0IGFmdGVyQXN5bmMgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmt0cmVlUHJvamVjdChzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBhZnRlclN5bmMgPSBpc29sYXRpb24uY3JlYXRlZFdvcmt0cmVlUHJvamVjdChzZXNzaW9uSWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVBc3luYyxcblx0XHRcdGJlZm9yZVN5bmMsXG5cdFx0XHRhZnRlckFzeW5jOiB7IHVyaTogYWZ0ZXJBc3luYz8udXJpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBhZnRlckFzeW5jPy5kaXNwbGF5TmFtZSB9LFxuXHRcdFx0YWZ0ZXJTeW5jOiB7IHVyaTogYWZ0ZXJTeW5jPy51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IGFmdGVyU3luYz8uZGlzcGxheU5hbWUgfSxcblx0XHRcdHVua25vd25TZXNzaW9uOiBpc29sYXRpb24uY3JlYXRlZFdvcmt0cmVlUHJvamVjdCgnZG9lcy1ub3QtZXhpc3QnKSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVBc3luYzogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlU3luYzogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJBc3luYzogeyB1cmk6IHJlcG9Sb290LnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBleHBlY3RlZERpc3BsYXlOYW1lIH0sXG5cdFx0XHRhZnRlclN5bmM6IHsgdXJpOiByZXBvUm9vdC50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogZXhwZWN0ZWREaXNwbGF5TmFtZSB9LFxuXHRcdFx0dW5rbm93blNlc3Npb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmt0cmVlUHJvamVjdCBub3JtYWxpemVzIHBlcnNpc3RlZCBsaW5rZWQtY2hlY2tvdXQgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hlY2tvdXRSb290ID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0Jyk7XG5cdFx0Y29uc3QgZXhpc3RpbmdXb3JrdHJlZSA9IFVSSS5qb2luUGF0aChyZXBvUm9vdCwgJ2V4aXN0aW5nLXdvcmt0cmVlJyk7XG5cdFx0bWtkaXJTeW5jKGV4aXN0aW5nV29ya3RyZWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJywgJ2ZlYXR1cmUveCcpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucGF0aCcsIGV4aXN0aW5nV29ya3RyZWUudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcsIGNoZWNrb3V0Um9vdC50b1N0cmluZygpKSxcblx0XHRdKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGxldCByZXNvbHZlZEZyb206IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVzb2x1dGlvbkNvdW50ID0gMDtcblx0XHRnaXRTZXJ2aWNlLmdldFdvcmt0cmVlUm9vdHMgPSBhc3luYyB3b3JraW5nRGlyZWN0b3J5ID0+IHtcblx0XHRcdHJlc29sdmVkRnJvbSA9IHdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHRyZXNvbHV0aW9uQ291bnQrKztcblx0XHRcdHJldHVybiBbcmVwb1Jvb3QsIGNoZWNrb3V0Um9vdCwgZXhpc3RpbmdXb3JrdHJlZV07XG5cdFx0fTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHsgZ2l0U2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmt0cmVlUHJvamVjdChzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmt0cmVlUHJvamVjdChzZXNzaW9uVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x1dGlvbkNvdW50LFxuXHRcdFx0cmVzb2x2ZWRGcm9tOiByZXNvbHZlZEZyb20/LnRvU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiBwcm9qZWN0ICYmIHsgdXJpOiBwcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogcHJvamVjdC5kaXNwbGF5TmFtZSB9LFxuXHRcdFx0cGVyc2lzdGVkUmVwb3NpdG9yeVJvb3Q6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JyksXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x1dGlvbkNvdW50OiAxLFxuXHRcdFx0cmVzb2x2ZWRGcm9tOiBleGlzdGluZ1dvcmt0cmVlLnRvU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogcmVwb1Jvb3QudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IGJhc2VuYW1lKHJlcG9Sb290KSB9LFxuXHRcdFx0cGVyc2lzdGVkUmVwb3NpdG9yeVJvb3Q6IHJlcG9Sb290LnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5UmVzdG9yZUFubm91bmNlbWVudCBwcmVwZW5kcyBhIG1hcmtkb3duIHBhcnQgd2hlbiB3b3JrdHJlZSBtZXRhZGF0YSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB0dXJuOiBUdXJuID0ge1xuXHRcdFx0aWQ6ICd0MScsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdpdGhvdXRNZXRhID0gYXdhaXQgaXNvbGF0aW9uLmFwcGx5UmVzdG9yZUFubm91bmNlbWVudChzZXNzaW9uVXJpLCBbdHVybl0pO1xuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSB9KTtcblx0XHRjb25zdCB3aXRoTWV0YSA9IGF3YWl0IGlzb2xhdGlvbi5hcHBseVJlc3RvcmVBbm5vdW5jZW1lbnQoc2Vzc2lvblVyaSwgW3R1cm5dKTtcblx0XHRjb25zdCBmaXJzdFBhcnQgPSB3aXRoTWV0YVswXS5yZXNwb25zZVBhcnRzWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1bmNoYW5nZWRXaGVuTm9NZXRhOiB3aXRob3V0TWV0YVswXS5yZXNwb25zZVBhcnRzLmxlbmd0aCxcblx0XHRcdGZpcnN0UGFydEtpbmQ6IGZpcnN0UGFydD8ua2luZCxcblx0XHRcdGZpcnN0UGFydEhhc0JyYW5jaDogZmlyc3RQYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8gZmlyc3RQYXJ0LmNvbnRlbnQuaW5jbHVkZXMoYnJhbmNoTmFtZSkgOiBmYWxzZSxcblx0XHR9LCB7XG5cdFx0XHR1bmNoYW5nZWRXaGVuTm9NZXRhOiAwLFxuXHRcdFx0Zmlyc3RQYXJ0S2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRcdGZpcnN0UGFydEhhc0JyYW5jaDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW51cCBvbiBhcmNoaXZlIHJlbW92ZXMgYSBjbGVhbiB3b3JrdHJlZSBhbmQgdW5hcmNoaXZlIHJlY3JlYXRlcyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHdvcmt0cmVlID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHsgc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9IH0pO1xuXG5cdFx0YXdhaXQgaXNvbGF0aW9uLmNsZWFudXBXb3JrdHJlZU9uQXJjaGl2ZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHJlbW92ZWREdXJpbmdBcmNoaXZlID0gd29ya3RyZWUgPyAhZXhpc3RzU3luYyh3b3JrdHJlZS5mc1BhdGgpIDogZmFsc2U7XG5cdFx0YXdhaXQgaXNvbGF0aW9uLnJlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHJlc3RvcmVkRHVyaW5nVW5hcmNoaXZlID0gd29ya3RyZWUgPyBleGlzdHNTeW5jKHdvcmt0cmVlLmZzUGF0aCkgOiBmYWxzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlQ2FsbHM6IHJlbW92ZUNhbGxzLm1hcCh1ID0+IHUudG9TdHJpbmcoKSksXG5cdFx0XHRyZW1vdmVkRHVyaW5nQXJjaGl2ZSxcblx0XHRcdGFkZEV4aXN0aW5nQ2FsbHM6IGFkZEV4aXN0aW5nQ2FsbHMubWFwKGMgPT4gKHsgd29ya3RyZWU6IGMud29ya3RyZWUudG9TdHJpbmcoKSwgYnJhbmNoTmFtZTogYy5icmFuY2hOYW1lIH0pKSxcblx0XHRcdHJlc3RvcmVkRHVyaW5nVW5hcmNoaXZlLFxuXHRcdH0sIHtcblx0XHRcdHJlbW92ZUNhbGxzOiBbd29ya3RyZWUhLnRvU3RyaW5nKCldLFxuXHRcdFx0cmVtb3ZlZER1cmluZ0FyY2hpdmU6IHRydWUsXG5cdFx0XHRhZGRFeGlzdGluZ0NhbGxzOiBbeyB3b3JrdHJlZTogd29ya3RyZWUhLnRvU3RyaW5nKCksIGJyYW5jaE5hbWUgfV0sXG5cdFx0XHRyZXN0b3JlZER1cmluZ1VuYXJjaGl2ZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQWxsQ3JlYXRlZFdvcmt0cmVlcyBkcmFpbnMgZXZlcnkgd29ya3RyZWUgY3JlYXRlZCBpbiB0aGlzIHByb2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSB9KTtcblxuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZW1vdmVBbGxDcmVhdGVkV29ya3RyZWVzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbW92ZUNhbGxzOiByZW1vdmVDYWxscy5tYXAodSA9PiB1LnRvU3RyaW5nKCkpLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiBpc29sYXRpb24uY3JlYXRlZFdvcmt0cmVlU2Vzc2lvbklkcyxcblx0XHR9LCB7XG5cdFx0XHRyZW1vdmVDYWxsczogW3dvcmt0cmVlIS50b1N0cmluZygpXSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUFZLFdBQVcsYUFBYSxjQUFjO0FBQzNELFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUF3QztBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUE0Qix3QkFBd0IsYUFBYSxrQkFBa0IsaUJBQTRCO0FBQ3hILFNBQVMsZ0NBQTJEO0FBRXBFLFNBQVMscUNBQXFDLG1CQUFtQixpQkFBaUIs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
