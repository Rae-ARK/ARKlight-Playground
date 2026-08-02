import assert from "assert";
import * as cp from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { NullLogService } from "../../../log/common/log.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { isWindows } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { Schemas } from "../../../../base/common/network.js";
import { DiskFileSystemProvider } from "../../../files/node/diskFileSystemProvider.js";
import { AgentHostGitService } from "../../node/agentHostGitService.js";
function createGitService(disposables) {
  const logService = new NullLogService();
  const fileService = disposables.add(new FileService(logService));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
  const env = { tmpDir: URI.file(tmpdir()) };
  return new AgentHostGitService(fileService, env, logService);
}
function rmDirWithRetry(path) {
  if (!path) {
    return;
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
  }
}
suite("AgentHostGitService - getSessionGitState (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo(opts) {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", opts?.baseBranch ?? "main");
    run("commit", "-q", "--allow-empty", "-m", "initial");
    if (opts?.remote) {
      run("remote", "add", "origin", opts.remote);
    }
    return tmpRoot;
  }
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-"));
    tmpRoot = dir;
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.strictEqual(result, void 0);
  });
  (hasGit ? test : test.skip)("reports branch, github remote and clean state for a fresh repo", async () => {
    const dir = initRepo({ remote: "https://github.com/owner/repo.git" });
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.ok(result, "expected git state");
    assert.strictEqual(result.branchName, "main");
    assert.strictEqual(result.hasGitHubRemote, true);
    assert.strictEqual(result.uncommittedChanges, 0);
    assert.strictEqual(result.upstreamBranchName, void 0);
    assert.strictEqual(result.outgoingChanges, void 0);
    assert.strictEqual(result.incomingChanges, void 0);
  });
  (hasGit ? test : test.skip)("reports the GitHub owner of the branch upstream remote", async () => {
    const dir = initRepo({ remote: "https://github.com/base-owner/repo.git" });
    cp.execFileSync("git", ["remote", "add", "fork", "https://github.com/fork-owner/repo.git"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["update-ref", "refs/remotes/fork/feature", "HEAD"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["branch", "--set-upstream-to", "fork/feature"], { cwd: dir, stdio: "pipe" });
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.deepStrictEqual({
      githubOwner: result?.githubOwner,
      githubHeadOwner: result?.githubHeadOwner,
      githubRepo: result?.githubRepo,
      upstreamBranchName: result?.upstreamBranchName
    }, {
      githubOwner: "base-owner",
      githubHeadOwner: "fork-owner",
      githubRepo: "repo",
      upstreamBranchName: "fork/feature"
    });
  });
  (hasGit ? test : test.skip)("resolves the default branch name and remote-tracking start point", async () => {
    const dir = initRepo();
    cp.execFileSync("git", ["update-ref", "refs/remotes/origin/main", "refs/heads/main"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"], { cwd: dir, stdio: "pipe" });
    assert.deepStrictEqual(await svc.getDefaultBranch(URI.file(dir)), {
      name: "main",
      startPoint: "origin/main"
    });
  });
  (hasGit ? test : test.skip)("falls back to the local branch when the default remote-tracking ref is missing", async () => {
    const dir = initRepo();
    cp.execFileSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"], { cwd: dir, stdio: "pipe" });
    assert.deepStrictEqual(await svc.getDefaultBranch(URI.file(dir)), {
      name: "main",
      startPoint: "main"
    });
  });
  (hasGit ? test : test.skip)("counts uncommitted changes", async () => {
    const dir = initRepo({ remote: "git@gitlab.com:owner/repo.git" });
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "a.txt"), "hello");
    await fs.writeFile(join(dir, "b.txt"), "world");
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.ok(result);
    assert.strictEqual(result.uncommittedChanges, 2);
    assert.strictEqual(result.hasGitHubRemote, false);
  });
  (hasGit ? test : test.skip)("reports outgoingChanges relative to base branch when local branch has no upstream", async () => {
    const remoteDir = mkdtempSync(join(tmpdir(), "agent-host-remote-"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    try {
      cp.execFileSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: remoteDir, env, stdio: "pipe" });
      tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-"));
      const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
      run("init", "-q", "-b", "main");
      run("commit", "-q", "--allow-empty", "-m", "initial");
      run("remote", "add", "origin", `https://github.com/owner/repo.git`);
      run("remote", "add", "tmp", remoteDir);
      run("push", "-q", "tmp", "main:main");
      run("update-ref", "refs/remotes/origin/main", "refs/heads/main");
      run("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      run("checkout", "-q", "-b", "feature", "--no-track");
      run("commit", "-q", "--allow-empty", "-m", "one");
      run("commit", "-q", "--allow-empty", "-m", "two");
      const result = await svc.getSessionGitState(URI.file(tmpRoot));
      assert.ok(result, "expected git state");
      assert.strictEqual(result.branchName, "feature");
      assert.strictEqual(result.baseBranchName, "main");
      assert.strictEqual(result.upstreamBranchName, void 0);
      assert.strictEqual(result.outgoingChanges, 2);
      assert.strictEqual(result.uncommittedChanges, 0);
    } finally {
      rmDirWithRetry(remoteDir);
    }
  });
});
suite("AgentHostGitService - computeSessionFileDiffs (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo() {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-diff-"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    return { dir: tmpRoot, run };
  }
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-diff-"));
    tmpRoot = dir;
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.strictEqual(result, void 0);
  });
  (hasGit ? test : test.skip)("reports modified, added (untracked) and deleted files against HEAD", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "kept.txt"), "one\ntwo\nthree\n");
    await fs.writeFile(join(dir, "gone.txt"), "bye\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    await fs.writeFile(join(dir, "kept.txt"), "one\ntwo\nthree\nfour\n");
    await fs.writeFile(join(dir, "fresh.txt"), "hello\n");
    await fs.unlink(join(dir, "gone.txt"));
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.ok(result, "expected diffs");
    const byPath = new Map(result.map((d) => [d.after?.uri ?? d.before?.uri, d]));
    const findByBasename = (name) => result.find((d) => {
      const u = d.after?.uri ?? d.before?.uri;
      return typeof u === "string" && u.endsWith("/" + name);
    });
    const kept = findByBasename("kept.txt");
    assert.ok(kept?.before && kept.after, `modified file should have before+after; result=${JSON.stringify(result.map((d) => ({ a: d.after?.uri, b: d.before?.uri })))}`);
    assert.deepStrictEqual(kept.diff, { added: 1, removed: 0 });
    assert.strictEqual(URI.parse(kept.before.content.uri).scheme, "git-blob", "before content should be a git-blob: URI");
    const fresh = findByBasename("fresh.txt");
    assert.ok(fresh?.after && !fresh.before, "untracked file should have only after");
    const gone = findByBasename("gone.txt");
    assert.ok(gone?.before && !gone.after, "deleted file should have only before");
    void byPath;
  });
  (hasGit ? test : test.skip)("reports staged rename source when untracked files force temp-index staging", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "old.txt"), "one\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    run("mv", "old.txt", "new.txt");
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.ok(result, "expected diffs");
    const rename = result.find((d) => d.before?.uri.endsWith("/old.txt") && d.after?.uri.endsWith("/new.txt"));
    const fresh = result.find((d) => !d.before && d.after?.uri.endsWith("/fresh.txt"));
    assert.deepStrictEqual({
      rename: rename && { before: URI.parse(rename.before.uri).path.split("/").pop(), after: URI.parse(rename.after.uri).path.split("/").pop() },
      fresh: fresh && URI.parse(fresh.after.uri).path.split("/").pop()
    }, {
      rename: { before: "old.txt", after: "new.txt" },
      fresh: "fresh.txt"
    });
  });
  (hasGit && !isWindows ? test : test.skip)("returns undefined when temp-index staging fails", async () => {
    const fs = await import("fs/promises");
    const { dir } = initRepo();
    const blockedPath = join(dir, "blocked.txt");
    await fs.writeFile(blockedPath, "blocked\n");
    await fs.chmod(blockedPath, 0);
    try {
      const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
      assert.strictEqual(result, void 0);
    } finally {
      await fs.chmod(blockedPath, 384);
    }
  });
  (hasGit ? test : test.skip)("anchors against the merge-base of the requested base branch", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "a.txt"), "a\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    run("checkout", "-q", "-b", "feature");
    await fs.writeFile(join(dir, "b.txt"), "b\n");
    run("add", ".");
    run("commit", "-q", "-m", "add b on feature");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s", baseBranch: "main" });
    assert.ok(result, "expected diffs");
    const paths = result.map((d) => d.after?.uri ?? d.before?.uri);
    assert.ok(paths.some((p) => p?.endsWith("b.txt")), `expected b.txt in diff; got ${paths.join(", ")}`);
  });
  (hasGit ? test : test.skip)("prefers origin base branch when local base branch is stale", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "shared.txt"), "base\n");
    run("add", ".");
    run("commit", "-q", "-m", "base");
    run("update-ref", "refs/remotes/origin/main", "HEAD");
    run("checkout", "-q", "-b", "feature");
    run("checkout", "-q", "-b", "upstream", "main");
    await fs.writeFile(join(dir, "upstream.txt"), "upstream\n");
    run("add", ".");
    run("commit", "-q", "-m", "upstream");
    run("update-ref", "refs/remotes/origin/main", "HEAD");
    run("checkout", "-q", "feature");
    run("merge", "-q", "--no-ff", "origin/main", "-m", "merge origin/main");
    await fs.writeFile(join(dir, "feature.txt"), "feature\n");
    run("add", ".");
    run("commit", "-q", "-m", "feature");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s", baseBranch: "main" });
    assert.ok(result, "expected diffs");
    const paths = result.map((d) => d.after?.uri ?? d.before?.uri);
    assert.deepStrictEqual({
      feature: paths.some((p) => p?.endsWith("feature.txt")),
      upstream: paths.some((p) => p?.endsWith("upstream.txt"))
    }, {
      feature: true,
      upstream: false
    });
  });
  (hasGit ? test : test.skip)("returns no diffs for a clean repo", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "a.txt"), "a\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.deepStrictEqual(result, []);
  });
  (hasGit ? test : test.skip)("handles an empty repo (no HEAD) by treating files as added", async () => {
    const fs = await import("fs/promises");
    const { dir } = initRepo();
    await fs.writeFile(join(dir, "first.txt"), "hello\n");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.ok(result, "expected diffs");
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].after && !result[0].before, "untracked file in empty repo should be an addition");
  });
  (hasGit ? test : test.skip)("captureWorkingTreeAsTree stages scoped rename source and untracked paths", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "old.txt"), "one\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    run("mv", "old.txt", "new.txt");
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const tree = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(tree, "expected tree object");
    const treePaths = cp.execFileSync("git", ["ls-tree", "-r", "--name-only", tree], { cwd: dir, encoding: "utf8" }).trim().split(/\r?\n/g).filter(Boolean).sort();
    assert.deepStrictEqual(treePaths, ["fresh.txt", "new.txt"]);
  });
  (hasGit ? test : test.skip)("computes bounded per-file patches from an immutable working-tree snapshot", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "tracked.txt"), "before\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    const baseline = run("rev-parse", "HEAD").toString().trim();
    await fs.writeFile(join(dir, "tracked.txt"), "after\n");
    await fs.writeFile(join(dir, "untracked.txt"), "new\n");
    const tree = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(tree);
    const fileDiffs = await svc.computeFileDiffsBetweenRefs(URI.file(dir), { sessionUri: "copilot:/s", fromRef: baseline, toRef: tree });
    assert.ok(fileDiffs);
    const snapshots = await Promise.all(fileDiffs.map(async (fileDiff) => {
      const before = fileDiff.before?.uri ? URI.parse(fileDiff.before.uri).path.split("/").pop() : void 0;
      const after = fileDiff.after?.uri ? URI.parse(fileDiff.after.uri).path.split("/").pop() : void 0;
      const paths = [before, after].filter((path) => path !== void 0);
      const patch = await svc.getDiffPatchBetweenRefs(URI.file(dir), { fromRef: baseline, toRef: tree, paths, maxBuffer: 900 * 1024 });
      return { before, after, patch };
    }));
    assert.deepStrictEqual(snapshots.map((snapshot) => ({
      before: snapshot.before,
      after: snapshot.after,
      tooLarge: snapshot.patch?.tooLarge,
      containsExpectedContent: snapshot.after === "tracked.txt" ? snapshot.patch?.patch?.includes("-before\n+after") : snapshot.patch?.patch?.includes("+new")
    })).sort((a, b) => (a.after ?? "").localeCompare(b.after ?? "")), [{
      before: "tracked.txt",
      after: "tracked.txt",
      tooLarge: false,
      containsExpectedContent: true
    }, {
      before: void 0,
      after: "untracked.txt",
      tooLarge: false,
      containsExpectedContent: true
    }]);
  });
  (hasGit && !isWindows ? test : test.skip)("captureWorkingTreeAsTree returns undefined when staging fails", async () => {
    const fs = await import("fs/promises");
    const { dir } = initRepo();
    const blockedPath = join(dir, "blocked.txt");
    await fs.writeFile(blockedPath, "blocked\n");
    await fs.chmod(blockedPath, 0);
    try {
      const result = await svc.captureWorkingTreeAsTree(URI.file(dir));
      assert.strictEqual(result, void 0);
    } finally {
      await fs.chmod(blockedPath, 384);
    }
  });
  (hasGit ? test : test.skip)("showBlob retrieves committed content", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "a.txt"), "original\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    const ref = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    await fs.writeFile(join(dir, "a.txt"), "changed\n");
    const blob = await svc.showBlob(URI.file(dir), ref, "a.txt");
    assert.ok(blob);
    assert.strictEqual(blob.toString(), "original\n");
  });
});
suite("AgentHostGitService - worktree helpers (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo() {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-wt-"));
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    run("config", "user.name", "t");
    run("config", "user.email", "t@t");
    run("commit", "-q", "--allow-empty", "-m", "initial");
    return tmpRoot;
  }
  (hasGit ? test : test.skip)("branchExists reports true for HEAD branch and false for missing branches", async () => {
    const dir = initRepo();
    assert.strictEqual(await svc.branchExists(URI.file(dir), "main"), true);
    assert.strictEqual(await svc.branchExists(URI.file(dir), "does-not-exist"), false);
  });
  (hasGit ? test : test.skip)("hasUncommittedChanges flips with untracked and committed work", async () => {
    const dir = initRepo();
    assert.strictEqual(await svc.hasUncommittedChanges(URI.file(dir)), false);
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "a.txt"), "hello");
    assert.strictEqual(await svc.hasUncommittedChanges(URI.file(dir)), true);
    cp.execFileSync("git", ["add", "a.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add a"], { cwd: dir, env, stdio: "pipe" });
    assert.strictEqual(await svc.hasUncommittedChanges(URI.file(dir)), false);
  });
  (hasGit ? test : test.skip)("commitAll stages tracked, staged and untracked changes and creates a commit", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "tracked.txt"), "before");
    cp.execFileSync("git", ["add", "tracked.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add tracked"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "tracked.txt"), "after");
    await fs.writeFile(join(dir, "staged.txt"), "staged");
    cp.execFileSync("git", ["add", "staged.txt"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "untracked.txt"), "untracked");
    await svc.commitAll(URI.file(dir), "commit all changes");
    const status = cp.execFileSync("git", ["status", "--porcelain"], { cwd: dir, env, encoding: "utf8" }).trim();
    const lastMessage = cp.execFileSync("git", ["log", "-1", "--format=%s"], { cwd: dir, env, encoding: "utf8" }).trim();
    const committedFiles = cp.execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], { cwd: dir, env, encoding: "utf8" }).trim().split(/\r?\n/g).sort();
    assert.deepStrictEqual({ status, lastMessage, committedFiles }, {
      status: "",
      lastMessage: "commit all changes",
      committedFiles: ["staged.txt", "tracked.txt", "untracked.txt"]
    });
  });
  (hasGit ? test : test.skip)("addExistingWorktree attaches a worktree for an existing branch (no -b)", async () => {
    const dir = initRepo();
    cp.execFileSync("git", ["branch", "feature"], { cwd: dir, env, stdio: "pipe" });
    const wtPath = join(dir, "..", `wt-${Date.now()}`);
    try {
      await svc.addExistingWorktree(URI.file(dir), URI.file(wtPath), "feature");
      const fs = await import("fs/promises");
      const stat = await fs.stat(wtPath);
      assert.ok(stat.isDirectory(), "worktree directory should exist");
    } finally {
      rmDirWithRetry(wtPath);
    }
  });
  (hasGit ? test : test.skip)("addWorktree prefers origin start point when local branch is stale", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    cp.execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "upstream", "main"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "upstream.txt"), "upstream");
    cp.execFileSync("git", ["add", "."], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "upstream"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, env, stdio: "pipe" });
    const wtPath = join(dir, "..", `wt-${Date.now()}`);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/test-origin-start-point", "main");
      const stat = await fs.stat(join(wtPath, "upstream.txt"));
      assert.ok(stat.isFile(), "worktree should start from origin/main, not stale local main");
      assert.throws(() => cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: wtPath, env, stdio: "pipe" }), /fatal:/);
    } finally {
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath));
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/test-origin-start-point"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
  (hasGit ? test : test.skip)("copyWorktreeIncludeFiles copies matched git-ignored files, collapsing wholly-ignored folders", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, ".gitignore"), ".env\nsecrets/\nbuild/\npartial/\n*.local\n");
    await fs.writeFile(join(dir, ".env"), "SECRET=1");
    await fs.mkdir(join(dir, "secrets", "nested"), { recursive: true });
    await fs.writeFile(join(dir, "secrets", "key.txt"), "key");
    await fs.writeFile(join(dir, "secrets", "nested", "deep.txt"), "deep");
    await fs.mkdir(join(dir, "build"), { recursive: true });
    await fs.writeFile(join(dir, "build", "output.txt"), "artifact");
    await fs.mkdir(join(dir, "partial"), { recursive: true });
    await fs.writeFile(join(dir, "partial", "keep.txt"), "keep");
    await fs.writeFile(join(dir, "partial", "skip.bin"), "skip");
    await fs.mkdir(join(dir, "app"), { recursive: true });
    await fs.writeFile(join(dir, "app", "main.ts"), "committed");
    await fs.writeFile(join(dir, "app", "config.local"), "local");
    cp.execFileSync("git", ["add", "app/main.ts"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add tracked"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "app", "main.ts"), "MODIFIED");
    const wtPath = join(dir, "..", `wt-${Date.now()}`);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/include-files", "main");
      const progress = [];
      await svc.copyWorktreeIncludeFiles(URI.file(dir), URI.file(wtPath), [".env", "secrets/**", "partial/*.txt", "app/**"], (sample) => progress.push(sample));
      const read = async (relativePath) => {
        try {
          return await fs.readFile(join(wtPath, relativePath), "utf8");
        } catch {
          return void 0;
        }
      };
      assert.deepStrictEqual({
        env: await read(".env"),
        secretKey: await read(join("secrets", "key.txt")),
        secretDeep: await read(join("secrets", "nested", "deep.txt")),
        buildArtifact: await read(join("build", "output.txt")),
        partialKeep: await read(join("partial", "keep.txt")),
        partialSkip: await read(join("partial", "skip.bin")),
        appConfig: await read(join("app", "config.local")),
        appTracked: await read(join("app", "main.ts")),
        // One sample per copied entry (`secrets/` collapsed, plus three
        // standalone files), but counted in the 5 files they cover so
        // the collapsed directory isn't under-weighted. Completion order
        // is nondeterministic, so only the totals are asserted.
        progressSamples: progress.length,
        progressTotals: [...new Set(progress.map((sample) => sample.filesTotal))],
        progressDone: progress.at(-1)?.filesDone
      }, {
        env: "SECRET=1",
        secretKey: "key",
        secretDeep: "deep",
        buildArtifact: void 0,
        partialKeep: "keep",
        partialSkip: void 0,
        appConfig: "local",
        appTracked: "committed",
        progressSamples: 4,
        progressTotals: [5],
        progressDone: 5
      });
    } finally {
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath));
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/include-files"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
});
suite("AgentHostGitService - restore (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  async function initRepoWithFiles(files) {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-restore-"));
    const fs = await import("fs/promises");
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(join(tmpRoot, name), content);
    }
    run("add", ".");
    run("commit", "-q", "-m", "init");
    return tmpRoot;
  }
  (hasGit ? test : test.skip)("reverts a modified working-tree file to the committed content", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "original" });
    await fs.writeFile(join(dir, "a.txt"), "changed");
    await svc.restore(URI.file(dir), ["a.txt"]);
    assert.strictEqual(await fs.readFile(join(dir, "a.txt"), "utf8"), "original");
  });
  (hasGit ? test : test.skip)("with `staged: true` un-stages a file without touching the working tree", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "original" });
    await fs.writeFile(join(dir, "a.txt"), "changed");
    cp.execFileSync("git", ["add", "a.txt"], { cwd: dir, env, stdio: "pipe" });
    await svc.restore(URI.file(dir), ["a.txt"], { staged: true });
    const stagedDiff = cp.execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, env, encoding: "utf8" }).trim();
    const workingTree = await fs.readFile(join(dir, "a.txt"), "utf8");
    assert.deepStrictEqual({ stagedDiff, workingTree }, { stagedDiff: "", workingTree: "changed" });
  });
  (hasGit ? test : test.skip)("with `ref` restores content from a specific commit", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "v1" });
    const v1Sha = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, env, encoding: "utf8" }).trim();
    await fs.writeFile(join(dir, "a.txt"), "v2");
    cp.execFileSync("git", ["commit", "-q", "-am", "v2"], { cwd: dir, env, stdio: "pipe" });
    await svc.restore(URI.file(dir), ["a.txt"], { ref: v1Sha });
    assert.strictEqual(await fs.readFile(join(dir, "a.txt"), "utf8"), "v1");
  });
  (hasGit ? test : test.skip)("with no paths restores every modified file in the working tree", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "one", "b.txt": "two" });
    await fs.writeFile(join(dir, "a.txt"), "mutated-a");
    await fs.writeFile(join(dir, "b.txt"), "mutated-b");
    await svc.restore(URI.file(dir), []);
    const [a, b] = await Promise.all([
      fs.readFile(join(dir, "a.txt"), "utf8"),
      fs.readFile(join(dir, "b.txt"), "utf8")
    ]);
    assert.deepStrictEqual({ a, b }, { a: "one", b: "two" });
  });
  (hasGit ? test : test.skip)("rejects when run against a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-restore-"));
    tmpRoot = dir;
    await assert.rejects(() => svc.restore(URI.file(dir), ["a.txt"]));
  });
});
suite("AgentHostGitService - overlayPathIntoTree (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  async function initRepoWithFiles(files) {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-overlay-"));
    const fs = await import("fs/promises");
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(join(tmpRoot, name), content);
    }
    run("add", ".");
    run("commit", "-q", "-m", "init");
    return { dir: tmpRoot, run };
  }
  const headTree = (dir) => cp.execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dir, env, encoding: "utf8" }).trim();
  const lsTree = (dir, tree) => cp.execFileSync("git", ["ls-tree", "-r", "--name-only", tree], { cwd: dir, env, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const blobAt = (dir, tree, path) => cp.execFileSync("git", ["cat-file", "blob", `${tree}:${path}`], { cwd: dir, env, encoding: "utf8" });
  (hasGit ? test : test.skip)("overlays a modified path from the source tree, leaving other paths untouched", async () => {
    const fs = await import("fs/promises");
    const { dir } = await initRepoWithFiles({ "a.txt": "a-v1\n", "b.txt": "b-v1\n" });
    const base = headTree(dir);
    await fs.writeFile(join(dir, "a.txt"), "a-v2\n");
    const source = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(source, "expected a working-tree snapshot");
    const result = await svc.overlayPathIntoTree(URI.file(dir), base, "a.txt", source);
    assert.ok(result, "expected a result tree");
    assert.deepStrictEqual(
      {
        files: lsTree(dir, result),
        aContent: blobAt(dir, result, "a.txt"),
        bContent: blobAt(dir, result, "b.txt")
      },
      {
        files: ["a.txt", "b.txt"],
        aContent: "a-v2\n",
        // overlaid from the source tree
        bContent: "b-v1\n"
        // copied verbatim from the base tree
      }
    );
  });
  (hasGit ? test : test.skip)("overlays an added path from the source tree", async () => {
    const fs = await import("fs/promises");
    const { dir } = await initRepoWithFiles({ "a.txt": "a-v1\n" });
    const base = headTree(dir);
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const source = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(source, "expected a working-tree snapshot");
    const result = await svc.overlayPathIntoTree(URI.file(dir), base, "fresh.txt", source);
    assert.ok(result, "expected a result tree");
    assert.deepStrictEqual(
      { files: lsTree(dir, result), freshContent: blobAt(dir, result, "fresh.txt") },
      { files: ["a.txt", "fresh.txt"], freshContent: "fresh\n" }
    );
  });
  (hasGit ? test : test.skip)("removes a path absent from the source tree", async () => {
    const fs = await import("fs/promises");
    const { dir } = await initRepoWithFiles({ "a.txt": "a-v1\n", "b.txt": "b-v1\n" });
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const base = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(base, "expected a working-tree snapshot");
    const source = headTree(dir);
    const result = await svc.overlayPathIntoTree(URI.file(dir), base, "fresh.txt", source);
    assert.ok(result, "expected a result tree");
    assert.deepStrictEqual(lsTree(dir, result), ["a.txt", "b.txt"]);
  });
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-overlay-"));
    tmpRoot = dir;
    const result = await svc.overlayPathIntoTree(URI.file(dir), "HEAD", "a.txt", "HEAD");
    assert.strictEqual(result, void 0);
  });
});
suite("AgentHostGitService - resolveBranchBaselineCommit (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo() {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-baseline-"));
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    return run;
  }
  (hasGit ? test : test.skip)("returns the merge-base of HEAD and the base branch", async () => {
    const fs = await import("fs/promises");
    const run = initRepo();
    await fs.writeFile(join(tmpRoot, "a.txt"), "base\n");
    run("add", ".");
    run("commit", "-q", "-m", "base");
    const baseCommit = run("rev-parse", "HEAD").toString().trim();
    run("checkout", "-q", "-b", "feature");
    await fs.writeFile(join(tmpRoot, "a.txt"), "feature\n");
    run("commit", "-q", "-am", "feature");
    const result = await svc.resolveBranchBaselineCommit(URI.file(tmpRoot), "main");
    assert.strictEqual(result, baseCommit);
  });
  (hasGit ? test : test.skip)("falls back to HEAD when no base branch is given", async () => {
    const fs = await import("fs/promises");
    const run = initRepo();
    await fs.writeFile(join(tmpRoot, "a.txt"), "base\n");
    run("add", ".");
    run("commit", "-q", "-m", "base");
    const headCommit = run("rev-parse", "HEAD").toString().trim();
    const result = await svc.resolveBranchBaselineCommit(URI.file(tmpRoot));
    assert.strictEqual(result, headCommit);
  });
  (hasGit ? test : test.skip)("falls back to the empty tree for a repo with no commits", async () => {
    initRepo();
    const result = await svc.resolveBranchBaselineCommit(URI.file(tmpRoot));
    assert.strictEqual(result, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-baseline-"));
    tmpRoot = dir;
    const result = await svc.resolveBranchBaselineCommit(URI.file(dir), "main");
    assert.strictEqual(result, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0R2l0U2VydmljZS5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIEludGVncmF0aW9uIHRlc3RzIGZvciB7QGxpbmsgQWdlbnRIb3N0R2l0U2VydmljZX0gdGhhdCBzcGF3biByZWFsIGBnaXRgIGFnYWluc3RcbiAqIHRlbXBvcmFyeSBvbi1kaXNrIHJlcG9zaXRvcmllcy4gS2VwdCBvdXQgb2YgdGhlIHVuaXQtdGVzdCBzdWl0ZSBiZWNhdXNlIHRoZXlcbiAqIHJlcXVpcmUgYGdpdGAgb24gUEFUSCBhbmQgZG8gcmVhbCBmaWxlc3lzdGVtIGFuZCBwcm9jZXNzIHdvcmsgXHUyMDE0IHNhbWUgc3BsaXQgYXNcbiAqIHRoZSBnaXQgZXh0ZW5zaW9uIChwdXJlIHBhcnNlciB0ZXN0cyBpbiBgZ2l0LnRlc3QudHNgLCBvbi1kaXNrIHRlc3RzIGluXG4gKiBgc21va2UudGVzdC50c2ApLlxuICpcbiAqIFJ1biB2aWEgYHNjcmlwdHMvdGVzdC1pbnRlZ3JhdGlvbi5zaGAuXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBta2R0ZW1wU3luYywgcm1TeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9ub2RlL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVHaXRTZXJ2aWNlKGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KTogQWdlbnRIb3N0R2l0U2VydmljZSB7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNwb3NhYmxlcy5hZGQobmV3IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIobG9nU2VydmljZSkpKSk7XG5cdGNvbnN0IGVudjogUGFydGlhbDxJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlPiA9IHsgdG1wRGlyOiBVUkkuZmlsZSh0bXBkaXIoKSkgfTtcblx0cmV0dXJuIG5ldyBBZ2VudEhvc3RHaXRTZXJ2aWNlKGZpbGVTZXJ2aWNlLCBlbnYgYXMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSk7XG59XG5cbmZ1bmN0aW9uIHJtRGlyV2l0aFJldHJ5KHBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAoIXBhdGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0dHJ5IHsgcm1TeW5jKHBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSwgbWF4UmV0cmllczogMTAsIHJldHJ5RGVsYXk6IDIwMCB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IHRlbXAgY2xlYW51cDsgV2luZG93cyBjYW4gYnJpZWZseSBob2xkIGdpdCBoYW5kbGVzICovIH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdEdpdFNlcnZpY2UgLSBnZXRTZXNzaW9uR2l0U3RhdGUgKHJlYWwgZ2l0KScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBTa2lwIHRoZSBvbi1kaXNrIGdpdCB0ZXN0cyB3aGVuIGBnaXRgIGlzIG5vdCBvbiBQQVRIIChlLmcuIG1pbmltYWwgQ0kpLlxuXHRjb25zdCBoYXNHaXQgPSAoKCkgPT4ge1xuXHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyctLXZlcnNpb24nXSwgeyBzdGRpbzogJ2lnbm9yZScgfSk7IHJldHVybiB0cnVlOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG5cdH0pKCk7XG5cblx0bGV0IHRtcFJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHN2YzogQWdlbnRIb3N0R2l0U2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dG1wUm9vdCA9IHVuZGVmaW5lZDtcblx0XHRzdmMgPSBjcmVhdGVHaXRTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJtRGlyV2l0aFJldHJ5KHRtcFJvb3QpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBpbml0UmVwbyhvcHRzPzogeyByZW1vdGU/OiBzdHJpbmc7IGJhc2VCcmFuY2g/OiBzdHJpbmcgfSk6IHN0cmluZyB7XG5cdFx0dG1wUm9vdCA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhZ2VudC1ob3N0LWdpdC0nKSk7XG5cdFx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiwgR0lUX0FVVEhPUl9OQU1FOiAndCcsIEdJVF9BVVRIT1JfRU1BSUw6ICd0QHQnLCBHSVRfQ09NTUlUVEVSX05BTUU6ICd0JywgR0lUX0NPTU1JVFRFUl9FTUFJTDogJ3RAdCcgfTtcblx0XHRjb25zdCBydW4gPSAoLi4uYXJnczogc3RyaW5nW10pID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgYXJncywgeyBjd2Q6IHRtcFJvb3QhLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0cnVuKCdpbml0JywgJy1xJywgJy1iJywgb3B0cz8uYmFzZUJyYW5jaCA/PyAnbWFpbicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy0tYWxsb3ctZW1wdHknLCAnLW0nLCAnaW5pdGlhbCcpO1xuXHRcdGlmIChvcHRzPy5yZW1vdGUpIHtcblx0XHRcdHJ1bigncmVtb3RlJywgJ2FkZCcsICdvcmlnaW4nLCBvcHRzLnJlbW90ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0bXBSb290ITtcblx0fVxuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgbm9uLWdpdCBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3Qtbm9uZ2l0LScpKTtcblx0XHR0bXBSb290ID0gZGlyO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuZ2V0U2Vzc2lvbkdpdFN0YXRlKFVSSS5maWxlKGRpcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmVwb3J0cyBicmFuY2gsIGdpdGh1YiByZW1vdGUgYW5kIGNsZWFuIHN0YXRlIGZvciBhIGZyZXNoIHJlcG8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oeyByZW1vdGU6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXQnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuZ2V0U2Vzc2lvbkdpdFN0YXRlKFVSSS5maWxlKGRpcikpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBnaXQgc3RhdGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJyYW5jaE5hbWUsICdtYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5oYXNHaXRIdWJSZW1vdGUsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudW5jb21taXR0ZWRDaGFuZ2VzLCAwKTtcblx0XHQvLyBObyB1cHN0cmVhbSBjb25maWd1cmVkIGZvciB0aGUgZnJlc2ggbG9jYWwgYnJhbmNoLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXBzdHJlYW1CcmFuY2hOYW1lLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3V0Z29pbmdDaGFuZ2VzLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jb21pbmdDaGFuZ2VzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlcG9ydHMgdGhlIEdpdEh1YiBvd25lciBvZiB0aGUgYnJhbmNoIHVwc3RyZWFtIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbyh7IHJlbW90ZTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9iYXNlLW93bmVyL3JlcG8uZ2l0JyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmVtb3RlJywgJ2FkZCcsICdmb3JrJywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9mb3JrLW93bmVyL3JlcG8uZ2l0J10sIHsgY3dkOiBkaXIsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NoZWNrb3V0JywgJy1xJywgJy1iJywgJ2ZlYXR1cmUnXSwgeyBjd2Q6IGRpciwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsndXBkYXRlLXJlZicsICdyZWZzL3JlbW90ZXMvZm9yay9mZWF0dXJlJywgJ0hFQUQnXSwgeyBjd2Q6IGRpciwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYnJhbmNoJywgJy0tc2V0LXVwc3RyZWFtLXRvJywgJ2ZvcmsvZmVhdHVyZSddLCB7IGN3ZDogZGlyLCBzdGRpbzogJ3BpcGUnIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUoZGlyKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdpdGh1Yk93bmVyOiByZXN1bHQ/LmdpdGh1Yk93bmVyLFxuXHRcdFx0Z2l0aHViSGVhZE93bmVyOiByZXN1bHQ/LmdpdGh1YkhlYWRPd25lcixcblx0XHRcdGdpdGh1YlJlcG86IHJlc3VsdD8uZ2l0aHViUmVwbyxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogcmVzdWx0Py51cHN0cmVhbUJyYW5jaE5hbWUsXG5cdFx0fSwge1xuXHRcdFx0Z2l0aHViT3duZXI6ICdiYXNlLW93bmVyJyxcblx0XHRcdGdpdGh1YkhlYWRPd25lcjogJ2Zvcmstb3duZXInLFxuXHRcdFx0Z2l0aHViUmVwbzogJ3JlcG8nLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnZm9yay9mZWF0dXJlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXNvbHZlcyB0aGUgZGVmYXVsdCBicmFuY2ggbmFtZSBhbmQgcmVtb3RlLXRyYWNraW5nIHN0YXJ0IHBvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3VwZGF0ZS1yZWYnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJywgJ3JlZnMvaGVhZHMvbWFpbiddLCB7IGN3ZDogZGlyLCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydzeW1ib2xpYy1yZWYnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9IRUFEJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vbWFpbiddLCB7IGN3ZDogZGlyLCBzdGRpbzogJ3BpcGUnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzdmMhLmdldERlZmF1bHRCcmFuY2goVVJJLmZpbGUoZGlyKSksIHtcblx0XHRcdG5hbWU6ICdtYWluJyxcblx0XHRcdHN0YXJ0UG9pbnQ6ICdvcmlnaW4vbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnZmFsbHMgYmFjayB0byB0aGUgbG9jYWwgYnJhbmNoIHdoZW4gdGhlIGRlZmF1bHQgcmVtb3RlLXRyYWNraW5nIHJlZiBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3N5bWJvbGljLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL0hFQUQnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJ10sIHsgY3dkOiBkaXIsIHN0ZGlvOiAncGlwZScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHN2YyEuZ2V0RGVmYXVsdEJyYW5jaChVUkkuZmlsZShkaXIpKSwge1xuXHRcdFx0bmFtZTogJ21haW4nLFxuXHRcdFx0c3RhcnRQb2ludDogJ21haW4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NvdW50cyB1bmNvbW1pdHRlZCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKHsgcmVtb3RlOiAnZ2l0QGdpdGxhYi5jb206b3duZXIvcmVwby5naXQnIH0pO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICdoZWxsbycpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2IudHh0JyksICd3b3JsZCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuZ2V0U2Vzc2lvbkdpdFN0YXRlKFVSSS5maWxlKGRpcikpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudW5jb21taXR0ZWRDaGFuZ2VzLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhhc0dpdEh1YlJlbW90ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlcG9ydHMgb3V0Z29pbmdDaGFuZ2VzIHJlbGF0aXZlIHRvIGJhc2UgYnJhbmNoIHdoZW4gbG9jYWwgYnJhbmNoIGhhcyBubyB1cHN0cmVhbScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDcmVhdGUgYSBiYXJlIFwicmVtb3RlXCIgcmVwbyBhbmQgc2V0IHVwIHRoZSB3b3JraW5nIHJlcG8gc28gdGhhdFxuXHRcdC8vIGByZWZzL3JlbW90ZXMvb3JpZ2luL0hFQURgIGV4aXN0cyAocmVxdWlyZWQgZm9yIGJhc2VCcmFuY2hOYW1lIHBhcnNpbmcpLlxuXHRcdGNvbnN0IHJlbW90ZURpciA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhZ2VudC1ob3N0LXJlbW90ZS0nKSk7XG5cdFx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiwgR0lUX0FVVEhPUl9OQU1FOiAndCcsIEdJVF9BVVRIT1JfRU1BSUw6ICd0QHQnLCBHSVRfQ09NTUlUVEVSX05BTUU6ICd0JywgR0lUX0NPTU1JVFRFUl9FTUFJTDogJ3RAdCcgfTtcblx0XHR0cnkge1xuXHRcdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2luaXQnLCAnLXEnLCAnLS1iYXJlJywgJy1iJywgJ21haW4nXSwgeyBjd2Q6IHJlbW90ZURpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdFx0dG1wUm9vdCA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhZ2VudC1ob3N0LWdpdC0nKSk7XG5cdFx0XHRjb25zdCBydW4gPSAoLi4uYXJnczogc3RyaW5nW10pID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgYXJncywgeyBjd2Q6IHRtcFJvb3QhLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCAnbWFpbicpO1xuXHRcdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLS1hbGxvdy1lbXB0eScsICctbScsICdpbml0aWFsJyk7XG5cdFx0XHRydW4oJ3JlbW90ZScsICdhZGQnLCAnb3JpZ2luJywgYGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdGApO1xuXHRcdFx0Ly8gVXNlIGEgc2VwYXJhdGUgXCJ1cGxvYWRcIiByZW1vdGUgcG9pbnRpbmcgYXQgdGhlIGJhcmUgcmVwbyB0byBwb3B1bGF0ZVxuXHRcdFx0Ly8gdGhlIG9yaWdpbi9tYWluIHJlbW90ZS10cmFja2luZyByZWYgd2l0aG91dCBjaGFuZ2luZyB0aGUgR2l0SHViIFVSTFxuXHRcdFx0Ly8gd2UncmUgdGVzdGluZyBmb3IgaGFzR2l0SHViUmVtb3RlIGRldGVjdGlvbi5cblx0XHRcdHJ1bigncmVtb3RlJywgJ2FkZCcsICd0bXAnLCByZW1vdGVEaXIpO1xuXHRcdFx0cnVuKCdwdXNoJywgJy1xJywgJ3RtcCcsICdtYWluOm1haW4nKTtcblx0XHRcdC8vIENyZWF0ZSB0aGUgb3JpZ2luL21haW4gcmVmIGxvY2FsbHkgd2l0aG91dCBhbnkgbmV0d29yayByb3VuZC10cmlwLlxuXHRcdFx0cnVuKCd1cGRhdGUtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vbWFpbicsICdyZWZzL2hlYWRzL21haW4nKTtcblx0XHRcdHJ1bignc3ltYm9saWMtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRCcsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nKTtcblxuXHRcdFx0Ly8gQnJhbmNoIG9mZiBhbmQgYWRkIHR3byBjb21taXRzIHdpdGhvdXQgc2V0dGluZyBhbiB1cHN0cmVhbS5cblx0XHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnZmVhdHVyZScsICctLW5vLXRyYWNrJyk7XG5cdFx0XHRydW4oJ2NvbW1pdCcsICctcScsICctLWFsbG93LWVtcHR5JywgJy1tJywgJ29uZScpO1xuXHRcdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLS1hbGxvdy1lbXB0eScsICctbScsICd0d28nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUodG1wUm9vdCEpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBnaXQgc3RhdGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYnJhbmNoTmFtZSwgJ2ZlYXR1cmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYmFzZUJyYW5jaE5hbWUsICdtYWluJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVwc3RyZWFtQnJhbmNoTmFtZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3V0Z29pbmdDaGFuZ2VzLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudW5jb21taXR0ZWRDaGFuZ2VzLCAwKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cm1EaXJXaXRoUmV0cnkocmVtb3RlRGlyKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RHaXRTZXJ2aWNlIC0gY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgKHJlYWwgZ2l0KScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBoYXNHaXQgPSAoKCkgPT4ge1xuXHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyctLXZlcnNpb24nXSwgeyBzdGRpbzogJ2lnbm9yZScgfSk7IHJldHVybiB0cnVlOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG5cdH0pKCk7XG5cblx0bGV0IHRtcFJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHN2YzogQWdlbnRIb3N0R2l0U2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dG1wUm9vdCA9IHVuZGVmaW5lZDtcblx0XHRzdmMgPSBjcmVhdGVHaXRTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJtRGlyV2l0aFJldHJ5KHRtcFJvb3QpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBpbml0UmVwbygpOiB7IGRpcjogc3RyaW5nOyBydW46ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gQnVmZmVyIH0ge1xuXHRcdHRtcFJvb3QgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1kaWZmLScpKTtcblx0XHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCAnbWFpbicpO1xuXHRcdHJldHVybiB7IGRpcjogdG1wUm9vdCEsIHJ1biB9O1xuXHR9XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYSBub24tZ2l0IGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1ub25naXQtZGlmZi0nKSk7XG5cdFx0dG1wUm9vdCA9IGRpcjtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKFVSSS5maWxlKGRpciksIHsgc2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3MnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmVwb3J0cyBtb2RpZmllZCwgYWRkZWQgKHVudHJhY2tlZCkgYW5kIGRlbGV0ZWQgZmlsZXMgYWdhaW5zdCBIRUFEJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAna2VwdC50eHQnKSwgJ29uZVxcbnR3b1xcbnRocmVlXFxuJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZ29uZS50eHQnKSwgJ2J5ZVxcbicpO1xuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICdpbml0Jyk7XG5cblx0XHQvLyBNb2RpZnksIGFkZCAodW50cmFja2VkKSwgZGVsZXRlLlxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2tlcHQudHh0JyksICdvbmVcXG50d29cXG50aHJlZVxcbmZvdXJcXG4nKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdmcmVzaC50eHQnKSwgJ2hlbGxvXFxuJyk7XG5cdFx0YXdhaXQgZnMudW5saW5rKGpvaW4oZGlyLCAnZ29uZS50eHQnKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKFVSSS5maWxlKGRpciksIHsgc2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3MnIH0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBkaWZmcycpO1xuXHRcdGNvbnN0IGJ5UGF0aCA9IG5ldyBNYXAocmVzdWx0Lm1hcChkID0+IFtkLmFmdGVyPy51cmkgPz8gZC5iZWZvcmU/LnVyaSwgZF0pKTtcblxuXHRcdC8vIEZpbmQgYnkgYmFzZW5hbWUgdG8gYmUgcm9idXN0IGFnYWluc3QgcGF0aCBub3JtYWxpemF0aW9uIGRpZmZlcmVuY2VzIChlLmcuIG1hY09TIC9wcml2YXRlIHByZWZpeCkuXG5cdFx0Y29uc3QgZmluZEJ5QmFzZW5hbWUgPSAobmFtZTogc3RyaW5nKSA9PiByZXN1bHQuZmluZChkID0+IHtcblx0XHRcdGNvbnN0IHUgPSBkLmFmdGVyPy51cmkgPz8gZC5iZWZvcmU/LnVyaTtcblx0XHRcdHJldHVybiB0eXBlb2YgdSA9PT0gJ3N0cmluZycgJiYgdS5lbmRzV2l0aCgnLycgKyBuYW1lKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGtlcHQgPSBmaW5kQnlCYXNlbmFtZSgna2VwdC50eHQnKTtcblx0XHRhc3NlcnQub2soa2VwdD8uYmVmb3JlICYmIGtlcHQuYWZ0ZXIsIGBtb2RpZmllZCBmaWxlIHNob3VsZCBoYXZlIGJlZm9yZSthZnRlcjsgcmVzdWx0PSR7SlNPTi5zdHJpbmdpZnkocmVzdWx0Lm1hcChkID0+ICh7IGE6IGQuYWZ0ZXI/LnVyaSwgYjogZC5iZWZvcmU/LnVyaSB9KSkpfWApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoa2VwdCEuZGlmZiwgeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKGtlcHQhLmJlZm9yZSEuY29udGVudC51cmkpLnNjaGVtZSwgJ2dpdC1ibG9iJywgJ2JlZm9yZSBjb250ZW50IHNob3VsZCBiZSBhIGdpdC1ibG9iOiBVUkknKTtcblxuXHRcdGNvbnN0IGZyZXNoID0gZmluZEJ5QmFzZW5hbWUoJ2ZyZXNoLnR4dCcpO1xuXHRcdGFzc2VydC5vayhmcmVzaD8uYWZ0ZXIgJiYgIWZyZXNoLmJlZm9yZSwgJ3VudHJhY2tlZCBmaWxlIHNob3VsZCBoYXZlIG9ubHkgYWZ0ZXInKTtcblxuXHRcdGNvbnN0IGdvbmUgPSBmaW5kQnlCYXNlbmFtZSgnZ29uZS50eHQnKTtcblx0XHRhc3NlcnQub2soZ29uZT8uYmVmb3JlICYmICFnb25lLmFmdGVyLCAnZGVsZXRlZCBmaWxlIHNob3VsZCBoYXZlIG9ubHkgYmVmb3JlJyk7XG5cdFx0dm9pZCBieVBhdGg7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmVwb3J0cyBzdGFnZWQgcmVuYW1lIHNvdXJjZSB3aGVuIHVudHJhY2tlZCBmaWxlcyBmb3JjZSB0ZW1wLWluZGV4IHN0YWdpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIsIHJ1biB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdvbGQudHh0JyksICdvbmVcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXG5cdFx0cnVuKCdtdicsICdvbGQudHh0JywgJ25ldy50eHQnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdmcmVzaC50eHQnKSwgJ2ZyZXNoXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKFVSSS5maWxlKGRpciksIHsgc2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3MnIH0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBkaWZmcycpO1xuXHRcdGNvbnN0IHJlbmFtZSA9IHJlc3VsdC5maW5kKGQgPT4gZC5iZWZvcmU/LnVyaS5lbmRzV2l0aCgnL29sZC50eHQnKSAmJiBkLmFmdGVyPy51cmkuZW5kc1dpdGgoJy9uZXcudHh0JykpO1xuXHRcdGNvbnN0IGZyZXNoID0gcmVzdWx0LmZpbmQoZCA9PiAhZC5iZWZvcmUgJiYgZC5hZnRlcj8udXJpLmVuZHNXaXRoKCcvZnJlc2gudHh0JykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW5hbWU6IHJlbmFtZSAmJiB7IGJlZm9yZTogVVJJLnBhcnNlKHJlbmFtZS5iZWZvcmUhLnVyaSkucGF0aC5zcGxpdCgnLycpLnBvcCgpLCBhZnRlcjogVVJJLnBhcnNlKHJlbmFtZS5hZnRlciEudXJpKS5wYXRoLnNwbGl0KCcvJykucG9wKCkgfSxcblx0XHRcdGZyZXNoOiBmcmVzaCAmJiBVUkkucGFyc2UoZnJlc2guYWZ0ZXIhLnVyaSkucGF0aC5zcGxpdCgnLycpLnBvcCgpLFxuXHRcdH0sIHtcblx0XHRcdHJlbmFtZTogeyBiZWZvcmU6ICdvbGQudHh0JywgYWZ0ZXI6ICduZXcudHh0JyB9LFxuXHRcdFx0ZnJlc2g6ICdmcmVzaC50eHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ICYmICFpc1dpbmRvd3MgPyB0ZXN0IDogdGVzdC5za2lwKSgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB0ZW1wLWluZGV4IHN0YWdpbmcgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIgfSA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3QgYmxvY2tlZFBhdGggPSBqb2luKGRpciwgJ2Jsb2NrZWQudHh0Jyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGJsb2NrZWRQYXRoLCAnYmxvY2tlZFxcbicpO1xuXHRcdGF3YWl0IGZzLmNobW9kKGJsb2NrZWRQYXRoLCAwKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGZzLmNobW9kKGJsb2NrZWRQYXRoLCAwbzYwMCk7XG5cdFx0fVxuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2FuY2hvcnMgYWdhaW5zdCB0aGUgbWVyZ2UtYmFzZSBvZiB0aGUgcmVxdWVzdGVkIGJhc2UgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2FcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXHRcdC8vIEJyYW5jaCBvZmYsIHRoZW4gYWR2YW5jZSBtYWluIGJlaGluZCB1cyBzbyBtZXJnZS1iYXNlICE9IEhFQUQuXG5cdFx0cnVuKCdjaGVja291dCcsICctcScsICctYicsICdmZWF0dXJlJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYi50eHQnKSwgJ2JcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnYWRkIGIgb24gZmVhdHVyZScpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJywgYmFzZUJyYW5jaDogJ21haW4nIH0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBkaWZmcycpO1xuXHRcdC8vIGBiLnR4dGAgd2FzIGNvbW1pdHRlZCBvbiBgZmVhdHVyZWAgYWZ0ZXIgYnJhbmNoaW5nIGZyb20gYG1haW5gLCBzb1xuXHRcdC8vIGl0IG11c3Qgc2hvdyB1cCBpbiB0aGUgbWVyZ2UtYmFzZSBkaWZmIGV2ZW4gdGhvdWdoIHRoZXJlIGFyZSBub1xuXHRcdC8vIHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhlIHdvcmtpbmcgdHJlZS5cblx0XHRjb25zdCBwYXRocyA9IHJlc3VsdC5tYXAoZCA9PiAoZC5hZnRlcj8udXJpID8/IGQuYmVmb3JlPy51cmkpKTtcblx0XHRhc3NlcnQub2socGF0aHMuc29tZShwID0+IHA/LmVuZHNXaXRoKCdiLnR4dCcpKSwgYGV4cGVjdGVkIGIudHh0IGluIGRpZmY7IGdvdCAke3BhdGhzLmpvaW4oJywgJyl9YCk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncHJlZmVycyBvcmlnaW4gYmFzZSBicmFuY2ggd2hlbiBsb2NhbCBiYXNlIGJyYW5jaCBpcyBzdGFsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCB7IGRpciwgcnVuIH0gPSBpbml0UmVwbygpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3NoYXJlZC50eHQnKSwgJ2Jhc2VcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnYmFzZScpO1xuXHRcdHJ1bigndXBkYXRlLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nLCAnSEVBRCcpO1xuXG5cdFx0cnVuKCdjaGVja291dCcsICctcScsICctYicsICdmZWF0dXJlJyk7XG5cdFx0cnVuKCdjaGVja291dCcsICctcScsICctYicsICd1cHN0cmVhbScsICdtYWluJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAndXBzdHJlYW0udHh0JyksICd1cHN0cmVhbVxcbicpO1xuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICd1cHN0cmVhbScpO1xuXHRcdHJ1bigndXBkYXRlLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nLCAnSEVBRCcpO1xuXG5cdFx0cnVuKCdjaGVja291dCcsICctcScsICdmZWF0dXJlJyk7XG5cdFx0cnVuKCdtZXJnZScsICctcScsICctLW5vLWZmJywgJ29yaWdpbi9tYWluJywgJy1tJywgJ21lcmdlIG9yaWdpbi9tYWluJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZmVhdHVyZS50eHQnKSwgJ2ZlYXR1cmVcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnZmVhdHVyZScpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJywgYmFzZUJyYW5jaDogJ21haW4nIH0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBkaWZmcycpO1xuXHRcdGNvbnN0IHBhdGhzID0gcmVzdWx0Lm1hcChkID0+IGQuYWZ0ZXI/LnVyaSA/PyBkLmJlZm9yZT8udXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZlYXR1cmU6IHBhdGhzLnNvbWUocCA9PiBwPy5lbmRzV2l0aCgnZmVhdHVyZS50eHQnKSksXG5cdFx0XHR1cHN0cmVhbTogcGF0aHMuc29tZShwID0+IHA/LmVuZHNXaXRoKCd1cHN0cmVhbS50eHQnKSksXG5cdFx0fSwge1xuXHRcdFx0ZmVhdHVyZTogdHJ1ZSxcblx0XHRcdHVwc3RyZWFtOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXR1cm5zIG5vIGRpZmZzIGZvciBhIGNsZWFuIHJlcG8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIsIHJ1biB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnYVxcbicpO1xuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICdpbml0Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKFVSSS5maWxlKGRpciksIHsgc2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3MnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnaGFuZGxlcyBhbiBlbXB0eSByZXBvIChubyBIRUFEKSBieSB0cmVhdGluZyBmaWxlcyBhcyBhZGRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCB7IGRpciB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdmaXJzdC50eHQnKSwgJ2hlbGxvXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKFVSSS5maWxlKGRpciksIHsgc2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3MnIH0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBkaWZmcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2socmVzdWx0WzBdLmFmdGVyICYmICFyZXN1bHRbMF0uYmVmb3JlLCAndW50cmFja2VkIGZpbGUgaW4gZW1wdHkgcmVwbyBzaG91bGQgYmUgYW4gYWRkaXRpb24nKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUgc3RhZ2VzIHNjb3BlZCByZW5hbWUgc291cmNlIGFuZCB1bnRyYWNrZWQgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIsIHJ1biB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdvbGQudHh0JyksICdvbmVcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXG5cdFx0cnVuKCdtdicsICdvbGQudHh0JywgJ25ldy50eHQnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdmcmVzaC50eHQnKSwgJ2ZyZXNoXFxuJyk7XG5cblx0XHRjb25zdCB0cmVlID0gYXdhaXQgc3ZjIS5jYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKHRyZWUsICdleHBlY3RlZCB0cmVlIG9iamVjdCcpO1xuXHRcdGNvbnN0IHRyZWVQYXRocyA9IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydscy10cmVlJywgJy1yJywgJy0tbmFtZS1vbmx5JywgdHJlZV0sIHsgY3dkOiBkaXIsIGVuY29kaW5nOiAndXRmOCcgfSlcblx0XHRcdC50cmltKClcblx0XHRcdC5zcGxpdCgvXFxyP1xcbi9nKVxuXHRcdFx0LmZpbHRlcihCb29sZWFuKVxuXHRcdFx0LnNvcnQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJlZVBhdGhzLCBbJ2ZyZXNoLnR4dCcsICduZXcudHh0J10pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NvbXB1dGVzIGJvdW5kZWQgcGVyLWZpbGUgcGF0Y2hlcyBmcm9tIGFuIGltbXV0YWJsZSB3b3JraW5nLXRyZWUgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIsIHJ1biB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICd0cmFja2VkLnR4dCcpLCAnYmVmb3JlXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblx0XHRjb25zdCBiYXNlbGluZSA9IHJ1bigncmV2LXBhcnNlJywgJ0hFQUQnKS50b1N0cmluZygpLnRyaW0oKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3RyYWNrZWQudHh0JyksICdhZnRlclxcbicpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3VudHJhY2tlZC50eHQnKSwgJ25ld1xcbicpO1xuXHRcdGNvbnN0IHRyZWUgPSBhd2FpdCBzdmMhLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZShVUkkuZmlsZShkaXIpKTtcblx0XHRhc3NlcnQub2sodHJlZSk7XG5cdFx0Y29uc3QgZmlsZURpZmZzID0gYXdhaXQgc3ZjIS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMoVVJJLmZpbGUoZGlyKSwgeyBzZXNzaW9uVXJpOiAnY29waWxvdDovcycsIGZyb21SZWY6IGJhc2VsaW5lLCB0b1JlZjogdHJlZSB9KTtcblx0XHRhc3NlcnQub2soZmlsZURpZmZzKTtcblx0XHRjb25zdCBzbmFwc2hvdHMgPSBhd2FpdCBQcm9taXNlLmFsbChmaWxlRGlmZnMubWFwKGFzeW5jIGZpbGVEaWZmID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9IGZpbGVEaWZmLmJlZm9yZT8udXJpID8gVVJJLnBhcnNlKGZpbGVEaWZmLmJlZm9yZS51cmkpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGFmdGVyID0gZmlsZURpZmYuYWZ0ZXI/LnVyaSA/IFVSSS5wYXJzZShmaWxlRGlmZi5hZnRlci51cmkpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHBhdGhzID0gW2JlZm9yZSwgYWZ0ZXJdLmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHBhdGggIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBwYXRjaCA9IGF3YWl0IHN2YyEuZ2V0RGlmZlBhdGNoQmV0d2VlblJlZnMoVVJJLmZpbGUoZGlyKSwgeyBmcm9tUmVmOiBiYXNlbGluZSwgdG9SZWY6IHRyZWUsIHBhdGhzLCBtYXhCdWZmZXI6IDkwMCAqIDEwMjQgfSk7XG5cdFx0XHRyZXR1cm4geyBiZWZvcmUsIGFmdGVyLCBwYXRjaCB9O1xuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3RzLm1hcChzbmFwc2hvdCA9PiAoe1xuXHRcdFx0YmVmb3JlOiBzbmFwc2hvdC5iZWZvcmUsXG5cdFx0XHRhZnRlcjogc25hcHNob3QuYWZ0ZXIsXG5cdFx0XHR0b29MYXJnZTogc25hcHNob3QucGF0Y2g/LnRvb0xhcmdlLFxuXHRcdFx0Y29udGFpbnNFeHBlY3RlZENvbnRlbnQ6IHNuYXBzaG90LmFmdGVyID09PSAndHJhY2tlZC50eHQnXG5cdFx0XHRcdD8gc25hcHNob3QucGF0Y2g/LnBhdGNoPy5pbmNsdWRlcygnLWJlZm9yZVxcbithZnRlcicpXG5cdFx0XHRcdDogc25hcHNob3QucGF0Y2g/LnBhdGNoPy5pbmNsdWRlcygnK25ldycpLFxuXHRcdH0pKS5zb3J0KChhLCBiKSA9PiAoYS5hZnRlciA/PyAnJykubG9jYWxlQ29tcGFyZShiLmFmdGVyID8/ICcnKSksIFt7XG5cdFx0XHRiZWZvcmU6ICd0cmFja2VkLnR4dCcsXG5cdFx0XHRhZnRlcjogJ3RyYWNrZWQudHh0Jyxcblx0XHRcdHRvb0xhcmdlOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zRXhwZWN0ZWRDb250ZW50OiB0cnVlLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZTogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXI6ICd1bnRyYWNrZWQudHh0Jyxcblx0XHRcdHRvb0xhcmdlOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zRXhwZWN0ZWRDb250ZW50OiB0cnVlLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0KGhhc0dpdCAmJiAhaXNXaW5kb3dzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NhcHR1cmVXb3JraW5nVHJlZUFzVHJlZSByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHN0YWdpbmcgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIgfSA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3QgYmxvY2tlZFBhdGggPSBqb2luKGRpciwgJ2Jsb2NrZWQudHh0Jyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGJsb2NrZWRQYXRoLCAnYmxvY2tlZFxcbicpO1xuXHRcdGF3YWl0IGZzLmNobW9kKGJsb2NrZWRQYXRoLCAwKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBmcy5jaG1vZChibG9ja2VkUGF0aCwgMG82MDApO1xuXHRcdH1cblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdzaG93QmxvYiByZXRyaWV2ZXMgY29tbWl0dGVkIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIsIHJ1biB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnb3JpZ2luYWxcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXHRcdGNvbnN0IHJlZiA9IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydyZXYtcGFyc2UnLCAnSEVBRCddLCB7IGN3ZDogZGlyLCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnY2hhbmdlZFxcbicpO1xuXG5cdFx0Y29uc3QgYmxvYiA9IGF3YWl0IHN2YyEuc2hvd0Jsb2IoVVJJLmZpbGUoZGlyKSwgcmVmLCAnYS50eHQnKTtcblx0XHRhc3NlcnQub2soYmxvYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJsb2IudG9TdHJpbmcoKSwgJ29yaWdpbmFsXFxuJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RHaXRTZXJ2aWNlIC0gd29ya3RyZWUgaGVscGVycyAocmVhbCBnaXQpJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGhhc0dpdCA9ICgoKSA9PiB7XG5cdFx0dHJ5IHsgY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJy0tdmVyc2lvbiddLCB7IHN0ZGlvOiAnaWdub3JlJyB9KTsgcmV0dXJuIHRydWU7IH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cblx0fSkoKTtcblxuXHRsZXQgdG1wUm9vdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgc3ZjOiBBZ2VudEhvc3RHaXRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0bXBSb290ID0gdW5kZWZpbmVkO1xuXHRcdHN2YyA9IGNyZWF0ZUdpdFNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cm1EaXJXaXRoUmV0cnkodG1wUm9vdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGluaXRSZXBvKCk6IHN0cmluZyB7XG5cdFx0dG1wUm9vdCA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhZ2VudC1ob3N0LWdpdC13dC0nKSk7XG5cdFx0Y29uc3QgcnVuID0gKC4uLmFyZ3M6IHN0cmluZ1tdKSA9PiBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIGFyZ3MsIHsgY3dkOiB0bXBSb290ISwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdHJ1bignaW5pdCcsICctcScsICctYicsICdtYWluJyk7XG5cdFx0cnVuKCdjb25maWcnLCAndXNlci5uYW1lJywgJ3QnKTtcblx0XHRydW4oJ2NvbmZpZycsICd1c2VyLmVtYWlsJywgJ3RAdCcpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy0tYWxsb3ctZW1wdHknLCAnLW0nLCAnaW5pdGlhbCcpO1xuXHRcdHJldHVybiB0bXBSb290ITtcblx0fVxuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnYnJhbmNoRXhpc3RzIHJlcG9ydHMgdHJ1ZSBmb3IgSEVBRCBicmFuY2ggYW5kIGZhbHNlIGZvciBtaXNzaW5nIGJyYW5jaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHN2YyEuYnJhbmNoRXhpc3RzKFVSSS5maWxlKGRpciksICdtYWluJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzdmMhLmJyYW5jaEV4aXN0cyhVUkkuZmlsZShkaXIpLCAnZG9lcy1ub3QtZXhpc3QnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcyBmbGlwcyB3aXRoIHVudHJhY2tlZCBhbmQgY29tbWl0dGVkIHdvcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc3ZjIS5oYXNVbmNvbW1pdHRlZENoYW5nZXMoVVJJLmZpbGUoZGlyKSksIGZhbHNlKTtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc3ZjIS5oYXNVbmNvbW1pdHRlZENoYW5nZXMoVVJJLmZpbGUoZGlyKSksIHRydWUpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnYS50eHQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjb21taXQnLCAnLXEnLCAnLW0nLCAnYWRkIGEnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzdmMhLmhhc1VuY29tbWl0dGVkQ2hhbmdlcyhVUkkuZmlsZShkaXIpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NvbW1pdEFsbCBzdGFnZXMgdHJhY2tlZCwgc3RhZ2VkIGFuZCB1bnRyYWNrZWQgY2hhbmdlcyBhbmQgY3JlYXRlcyBhIGNvbW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3RyYWNrZWQudHh0JyksICdiZWZvcmUnKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYWRkJywgJ3RyYWNrZWQudHh0J10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1tJywgJ2FkZCB0cmFja2VkJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3RyYWNrZWQudHh0JyksICdhZnRlcicpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3N0YWdlZC50eHQnKSwgJ3N0YWdlZCcpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnc3RhZ2VkLnR4dCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAndW50cmFja2VkLnR4dCcpLCAndW50cmFja2VkJyk7XG5cblx0XHRhd2FpdCBzdmMhLmNvbW1pdEFsbChVUkkuZmlsZShkaXIpLCAnY29tbWl0IGFsbCBjaGFuZ2VzJyk7XG5cblx0XHRjb25zdCBzdGF0dXMgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnc3RhdHVzJywgJy0tcG9yY2VsYWluJ10sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCk7XG5cdFx0Y29uc3QgbGFzdE1lc3NhZ2UgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnbG9nJywgJy0xJywgJy0tZm9ybWF0PSVzJ10sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCk7XG5cdFx0Y29uc3QgY29tbWl0dGVkRmlsZXMgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnZGlmZi10cmVlJywgJy0tbm8tY29tbWl0LWlkJywgJy0tbmFtZS1vbmx5JywgJy1yJywgJ0hFQUQnXSwgeyBjd2Q6IGRpciwgZW52LCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKS5zcGxpdCgvXFxyP1xcbi9nKS5zb3J0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhdHVzLCBsYXN0TWVzc2FnZSwgY29tbWl0dGVkRmlsZXMgfSwge1xuXHRcdFx0c3RhdHVzOiAnJyxcblx0XHRcdGxhc3RNZXNzYWdlOiAnY29tbWl0IGFsbCBjaGFuZ2VzJyxcblx0XHRcdGNvbW1pdHRlZEZpbGVzOiBbJ3N0YWdlZC50eHQnLCAndHJhY2tlZC50eHQnLCAndW50cmFja2VkLnR4dCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2FkZEV4aXN0aW5nV29ya3RyZWUgYXR0YWNoZXMgYSB3b3JrdHJlZSBmb3IgYW4gZXhpc3RpbmcgYnJhbmNoIChubyAtYiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYnJhbmNoJywgJ2ZlYXR1cmUnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNvbnN0IHd0UGF0aCA9IGpvaW4oZGlyLCAnLi4nLCBgd3QtJHtEYXRlLm5vdygpfWApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdmMhLmFkZEV4aXN0aW5nV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgJ2ZlYXR1cmUnKTtcblx0XHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzLnN0YXQod3RQYXRoKTtcblx0XHRcdGFzc2VydC5vayhzdGF0LmlzRGlyZWN0b3J5KCksICd3b3JrdHJlZSBkaXJlY3Rvcnkgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJtRGlyV2l0aFJldHJ5KHd0UGF0aCk7XG5cdFx0fVxuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2FkZFdvcmt0cmVlIHByZWZlcnMgb3JpZ2luIHN0YXJ0IHBvaW50IHdoZW4gbG9jYWwgYnJhbmNoIGlzIHN0YWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3VwZGF0ZS1yZWYnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJywgJ0hFQUQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjaGVja291dCcsICctcScsICctYicsICd1cHN0cmVhbScsICdtYWluJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICd1cHN0cmVhbS50eHQnKSwgJ3Vwc3RyZWFtJyk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2FkZCcsICcuJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1tJywgJ3Vwc3RyZWFtJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsndXBkYXRlLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nLCAnSEVBRCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NoZWNrb3V0JywgJy1xJywgJ21haW4nXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXG5cdFx0Y29uc3Qgd3RQYXRoID0gam9pbihkaXIsICcuLicsIGB3dC0ke0RhdGUubm93KCl9YCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN2YyEuYWRkV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgJ2FnZW50cy90ZXN0LW9yaWdpbi1zdGFydC1wb2ludCcsICdtYWluJyk7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgZnMuc3RhdChqb2luKHd0UGF0aCwgJ3Vwc3RyZWFtLnR4dCcpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0LmlzRmlsZSgpLCAnd29ya3RyZWUgc2hvdWxkIHN0YXJ0IGZyb20gb3JpZ2luL21haW4sIG5vdCBzdGFsZSBsb2NhbCBtYWluJyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydyZXYtcGFyc2UnLCAnLS1hYmJyZXYtcmVmJywgJy0tc3ltYm9saWMtZnVsbC1uYW1lJywgJ0B7dX0nXSwgeyBjd2Q6IHd0UGF0aCwgZW52LCBzdGRpbzogJ3BpcGUnIH0pLCAvZmF0YWw6Lyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7IGF3YWl0IHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSk7IH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCBjbGVhbnVwICovIH1cblx0XHRcdHJtRGlyV2l0aFJldHJ5KHd0UGF0aCk7XG5cdFx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYnJhbmNoJywgJy1EJywgJ2FnZW50cy90ZXN0LW9yaWdpbi1zdGFydC1wb2ludCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdH1cblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMgY29waWVzIG1hdGNoZWQgZ2l0LWlnbm9yZWQgZmlsZXMsIGNvbGxhcHNpbmcgd2hvbGx5LWlnbm9yZWQgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnLmdpdGlnbm9yZScpLCAnLmVudlxcbnNlY3JldHMvXFxuYnVpbGQvXFxucGFydGlhbC9cXG4qLmxvY2FsXFxuJyk7XG5cblx0XHQvLyBNYXRjaGVkIHJvb3QgZmlsZS5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICcuZW52JyksICdTRUNSRVQ9MScpO1xuXHRcdC8vIFdob2xseS1pZ25vcmVkIGRpciwgZnVsbHkgbWF0Y2hlZCBieSBgc2VjcmV0cy8qKmAgLT4gY29sbGFwc2VkIHRvIG9uZSByZWN1cnNpdmUgY29weS5cblx0XHRhd2FpdCBmcy5ta2Rpcihqb2luKGRpciwgJ3NlY3JldHMnLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3NlY3JldHMnLCAna2V5LnR4dCcpLCAna2V5Jyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnc2VjcmV0cycsICduZXN0ZWQnLCAnZGVlcC50eHQnKSwgJ2RlZXAnKTtcblx0XHQvLyBXaG9sbHktaWdub3JlZCBkaXIgdGhhdCBubyBnbG9iIG1hdGNoZXMgLT4gbXVzdCBiZSBza2lwcGVkIGVudGlyZWx5LlxuXHRcdGF3YWl0IGZzLm1rZGlyKGpvaW4oZGlyLCAnYnVpbGQnKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYnVpbGQnLCAnb3V0cHV0LnR4dCcpLCAnYXJ0aWZhY3QnKTtcblx0XHQvLyBXaG9sbHktaWdub3JlZCBkaXIgb25seSBwYXJ0aWFsbHkgbWF0Y2hlZCBieSBgcGFydGlhbC8qLnR4dGAgLT4gbXVzdCBOT1Rcblx0XHQvLyBjb2xsYXBzZTsgb25seSB0aGUgbWF0Y2hlZCBmaWxlIGlzIGNvcGllZCwgaXRzIHNpYmxpbmcgaXMgbGVmdCBiZWhpbmQuXG5cdFx0YXdhaXQgZnMubWtkaXIoam9pbihkaXIsICdwYXJ0aWFsJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3BhcnRpYWwnLCAna2VlcC50eHQnKSwgJ2tlZXAnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdwYXJ0aWFsJywgJ3NraXAuYmluJyksICdza2lwJyk7XG5cdFx0Ly8gUGFydGlhbGx5LXRyYWNrZWQgZGlyOiBhbiBpZ25vcmVkIGZpbGUgaXMgbWF0Y2hlZCBieSBgYXBwLyoqYCwgYnV0IHRoZVxuXHRcdC8vIHRyYWNrZWQgc2libGluZyBtdXN0IG5ldmVyIGJlIGNvcGllZC9jbG9iYmVyZWQgZXZlbiB0aG91Z2ggaXQgdG9vIGlzXG5cdFx0Ly8gdW5kZXIgYGFwcC9gIChpdCBpcyBub3QgYSBnaXQtaWdub3JlZCBmaWxlLCBzbyBpdCBpcyBub3QgYSBjYW5kaWRhdGUpLlxuXHRcdGF3YWl0IGZzLm1rZGlyKGpvaW4oZGlyLCAnYXBwJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2FwcCcsICdtYWluLnRzJyksICdjb21taXR0ZWQnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhcHAnLCAnY29uZmlnLmxvY2FsJyksICdsb2NhbCcpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnYXBwL21haW4udHMnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjb21taXQnLCAnLXEnLCAnLW0nLCAnYWRkIHRyYWNrZWQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdC8vIFVuY29tbWl0dGVkIGNoYW5nZSB0byB0aGUgdHJhY2tlZCBmaWxlOiBpZiB0aGUgZm9sZGVyIHdlcmUgd3JvbmdseVxuXHRcdC8vIGNvbGxhcHNlZC9jb3BpZWQsIHRoZSB3b3JrdHJlZSBjaGVja291dCB3b3VsZCBiZSBvdmVyd3JpdHRlbiB3aXRoIHRoaXMuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYXBwJywgJ21haW4udHMnKSwgJ01PRElGSUVEJyk7XG5cblx0XHRjb25zdCB3dFBhdGggPSBqb2luKGRpciwgJy4uJywgYHd0LSR7RGF0ZS5ub3coKX1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3ZjIS5hZGRXb3JrdHJlZShVUkkuZmlsZShkaXIpLCBVUkkuZmlsZSh3dFBhdGgpLCAnYWdlbnRzL2luY2x1ZGUtZmlsZXMnLCAnbWFpbicpO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3M6IHsgZmlsZXNEb25lOiBudW1iZXI7IGZpbGVzVG90YWw6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdGF3YWl0IHN2YyEuY29weVdvcmt0cmVlSW5jbHVkZUZpbGVzKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksIFsnLmVudicsICdzZWNyZXRzLyoqJywgJ3BhcnRpYWwvKi50eHQnLCAnYXBwLyoqJ10sIHNhbXBsZSA9PiBwcm9ncmVzcy5wdXNoKHNhbXBsZSkpO1xuXG5cdFx0XHRjb25zdCByZWFkID0gYXN5bmMgKHJlbGF0aXZlUGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHRyeSB7IHJldHVybiBhd2FpdCBmcy5yZWFkRmlsZShqb2luKHd0UGF0aCwgcmVsYXRpdmVQYXRoKSwgJ3V0ZjgnKTsgfSBjYXRjaCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlbnY6IGF3YWl0IHJlYWQoJy5lbnYnKSxcblx0XHRcdFx0c2VjcmV0S2V5OiBhd2FpdCByZWFkKGpvaW4oJ3NlY3JldHMnLCAna2V5LnR4dCcpKSxcblx0XHRcdFx0c2VjcmV0RGVlcDogYXdhaXQgcmVhZChqb2luKCdzZWNyZXRzJywgJ25lc3RlZCcsICdkZWVwLnR4dCcpKSxcblx0XHRcdFx0YnVpbGRBcnRpZmFjdDogYXdhaXQgcmVhZChqb2luKCdidWlsZCcsICdvdXRwdXQudHh0JykpLFxuXHRcdFx0XHRwYXJ0aWFsS2VlcDogYXdhaXQgcmVhZChqb2luKCdwYXJ0aWFsJywgJ2tlZXAudHh0JykpLFxuXHRcdFx0XHRwYXJ0aWFsU2tpcDogYXdhaXQgcmVhZChqb2luKCdwYXJ0aWFsJywgJ3NraXAuYmluJykpLFxuXHRcdFx0XHRhcHBDb25maWc6IGF3YWl0IHJlYWQoam9pbignYXBwJywgJ2NvbmZpZy5sb2NhbCcpKSxcblx0XHRcdFx0YXBwVHJhY2tlZDogYXdhaXQgcmVhZChqb2luKCdhcHAnLCAnbWFpbi50cycpKSxcblx0XHRcdFx0Ly8gT25lIHNhbXBsZSBwZXIgY29waWVkIGVudHJ5IChgc2VjcmV0cy9gIGNvbGxhcHNlZCwgcGx1cyB0aHJlZVxuXHRcdFx0XHQvLyBzdGFuZGFsb25lIGZpbGVzKSwgYnV0IGNvdW50ZWQgaW4gdGhlIDUgZmlsZXMgdGhleSBjb3ZlciBzb1xuXHRcdFx0XHQvLyB0aGUgY29sbGFwc2VkIGRpcmVjdG9yeSBpc24ndCB1bmRlci13ZWlnaHRlZC4gQ29tcGxldGlvbiBvcmRlclxuXHRcdFx0XHQvLyBpcyBub25kZXRlcm1pbmlzdGljLCBzbyBvbmx5IHRoZSB0b3RhbHMgYXJlIGFzc2VydGVkLlxuXHRcdFx0XHRwcm9ncmVzc1NhbXBsZXM6IHByb2dyZXNzLmxlbmd0aCxcblx0XHRcdFx0cHJvZ3Jlc3NUb3RhbHM6IFsuLi5uZXcgU2V0KHByb2dyZXNzLm1hcChzYW1wbGUgPT4gc2FtcGxlLmZpbGVzVG90YWwpKV0sXG5cdFx0XHRcdHByb2dyZXNzRG9uZTogcHJvZ3Jlc3MuYXQoLTEpPy5maWxlc0RvbmUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVudjogJ1NFQ1JFVD0xJyxcblx0XHRcdFx0c2VjcmV0S2V5OiAna2V5Jyxcblx0XHRcdFx0c2VjcmV0RGVlcDogJ2RlZXAnLFxuXHRcdFx0XHRidWlsZEFydGlmYWN0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhcnRpYWxLZWVwOiAna2VlcCcsXG5cdFx0XHRcdHBhcnRpYWxTa2lwOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFwcENvbmZpZzogJ2xvY2FsJyxcblx0XHRcdFx0YXBwVHJhY2tlZDogJ2NvbW1pdHRlZCcsXG5cdFx0XHRcdHByb2dyZXNzU2FtcGxlczogNCxcblx0XHRcdFx0cHJvZ3Jlc3NUb3RhbHM6IFs1XSxcblx0XHRcdFx0cHJvZ3Jlc3NEb25lOiA1LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7IGF3YWl0IHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSk7IH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCBjbGVhbnVwICovIH1cblx0XHRcdHJtRGlyV2l0aFJldHJ5KHd0UGF0aCk7XG5cdFx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYnJhbmNoJywgJy1EJywgJ2FnZW50cy9pbmNsdWRlLWZpbGVzJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdpZ25vcmUnIH0pOyB9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgY2xlYW51cCAqLyB9XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0R2l0U2VydmljZSAtIHJlc3RvcmUgKHJlYWwgZ2l0KScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBoYXNHaXQgPSAoKCkgPT4ge1xuXHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyctLXZlcnNpb24nXSwgeyBzdGRpbzogJ2lnbm9yZScgfSk7IHJldHVybiB0cnVlOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG5cdH0pKCk7XG5cblx0bGV0IHRtcFJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHN2YzogQWdlbnRIb3N0R2l0U2VydmljZSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiwgR0lUX0FVVEhPUl9OQU1FOiAndCcsIEdJVF9BVVRIT1JfRU1BSUw6ICd0QHQnLCBHSVRfQ09NTUlUVEVSX05BTUU6ICd0JywgR0lUX0NPTU1JVFRFUl9FTUFJTDogJ3RAdCcgfTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dG1wUm9vdCA9IHVuZGVmaW5lZDtcblx0XHRzdmMgPSBjcmVhdGVHaXRTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJtRGlyV2l0aFJldHJ5KHRtcFJvb3QpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBpbml0UmVwb1dpdGhGaWxlcyhmaWxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dG1wUm9vdCA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhZ2VudC1ob3N0LWdpdC1yZXN0b3JlLScpKTtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCBydW4gPSAoLi4uYXJnczogc3RyaW5nW10pID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgYXJncywgeyBjd2Q6IHRtcFJvb3QhLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0cnVuKCdpbml0JywgJy1xJywgJy1iJywgJ21haW4nKTtcblx0XHRmb3IgKGNvbnN0IFtuYW1lLCBjb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhmaWxlcykpIHtcblx0XHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKHRtcFJvb3QhLCBuYW1lKSwgY29udGVudCk7XG5cdFx0fVxuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICdpbml0Jyk7XG5cdFx0cmV0dXJuIHRtcFJvb3QhO1xuXHR9XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXZlcnRzIGEgbW9kaWZpZWQgd29ya2luZy10cmVlIGZpbGUgdG8gdGhlIGNvbW1pdHRlZCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IGRpciA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ29yaWdpbmFsJyB9KTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnY2hhbmdlZCcpO1xuXG5cdFx0YXdhaXQgc3ZjIS5yZXN0b3JlKFVSSS5maWxlKGRpciksIFsnYS50eHQnXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZnMucmVhZEZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAndXRmOCcpLCAnb3JpZ2luYWwnKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCd3aXRoIGBzdGFnZWQ6IHRydWVgIHVuLXN0YWdlcyBhIGZpbGUgd2l0aG91dCB0b3VjaGluZyB0aGUgd29ya2luZyB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IGRpciA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ29yaWdpbmFsJyB9KTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnY2hhbmdlZCcpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnYS50eHQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXG5cdFx0YXdhaXQgc3ZjIS5yZXN0b3JlKFVSSS5maWxlKGRpciksIFsnYS50eHQnXSwgeyBzdGFnZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBzdGFnZWREaWZmID0gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2RpZmYnLCAnLS1jYWNoZWQnLCAnLS1uYW1lLW9ubHknXSwgeyBjd2Q6IGRpciwgZW52LCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0XHRjb25zdCB3b3JraW5nVHJlZSA9IGF3YWl0IGZzLnJlYWRGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ3V0ZjgnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhZ2VkRGlmZiwgd29ya2luZ1RyZWUgfSwgeyBzdGFnZWREaWZmOiAnJywgd29ya2luZ1RyZWU6ICdjaGFuZ2VkJyB9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCd3aXRoIGByZWZgIHJlc3RvcmVzIGNvbnRlbnQgZnJvbSBhIHNwZWNpZmljIGNvbW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCBkaXIgPSBhd2FpdCBpbml0UmVwb1dpdGhGaWxlcyh7ICdhLnR4dCc6ICd2MScgfSk7XG5cdFx0Y29uc3QgdjFTaGEgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgeyBjd2Q6IGRpciwgZW52LCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAndjInKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1hbScsICd2MiddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cblx0XHRhd2FpdCBzdmMhLnJlc3RvcmUoVVJJLmZpbGUoZGlyKSwgWydhLnR4dCddLCB7IHJlZjogdjFTaGEgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZnMucmVhZEZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAndXRmOCcpLCAndjEnKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCd3aXRoIG5vIHBhdGhzIHJlc3RvcmVzIGV2ZXJ5IG1vZGlmaWVkIGZpbGUgaW4gdGhlIHdvcmtpbmcgdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCBkaXIgPSBhd2FpdCBpbml0UmVwb1dpdGhGaWxlcyh7ICdhLnR4dCc6ICdvbmUnLCAnYi50eHQnOiAndHdvJyB9KTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnbXV0YXRlZC1hJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYi50eHQnKSwgJ211dGF0ZWQtYicpO1xuXG5cdFx0YXdhaXQgc3ZjIS5yZXN0b3JlKFVSSS5maWxlKGRpciksIFtdKTtcblxuXHRcdGNvbnN0IFthLCBiXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGZzLnJlYWRGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ3V0ZjgnKSxcblx0XHRcdGZzLnJlYWRGaWxlKGpvaW4oZGlyLCAnYi50eHQnKSwgJ3V0ZjgnKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYSwgYiB9LCB7IGE6ICdvbmUnLCBiOiAndHdvJyB9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZWplY3RzIHdoZW4gcnVuIGFnYWluc3QgYSBub24tZ2l0IGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1ub25naXQtcmVzdG9yZS0nKSk7XG5cdFx0dG1wUm9vdCA9IGRpcjtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzdmMhLnJlc3RvcmUoVVJJLmZpbGUoZGlyKSwgWydhLnR4dCddKSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RHaXRTZXJ2aWNlIC0gb3ZlcmxheVBhdGhJbnRvVHJlZSAocmVhbCBnaXQpJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGhhc0dpdCA9ICgoKSA9PiB7XG5cdFx0dHJ5IHsgY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJy0tdmVyc2lvbiddLCB7IHN0ZGlvOiAnaWdub3JlJyB9KTsgcmV0dXJuIHRydWU7IH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cblx0fSkoKTtcblxuXHRsZXQgdG1wUm9vdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgc3ZjOiBBZ2VudEhvc3RHaXRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0bXBSb290ID0gdW5kZWZpbmVkO1xuXHRcdHN2YyA9IGNyZWF0ZUdpdFNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cm1EaXJXaXRoUmV0cnkodG1wUm9vdCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGluaXRSZXBvV2l0aEZpbGVzKGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx7IGRpcjogc3RyaW5nOyBydW46ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gQnVmZmVyIH0+IHtcblx0XHR0bXBSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtZ2l0LW92ZXJsYXktJykpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCAnbWFpbicpO1xuXHRcdGZvciAoY29uc3QgW25hbWUsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKGZpbGVzKSkge1xuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4odG1wUm9vdCEsIG5hbWUpLCBjb250ZW50KTtcblx0XHR9XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblx0XHRyZXR1cm4geyBkaXI6IHRtcFJvb3QhLCBydW4gfTtcblx0fVxuXG5cdGNvbnN0IGhlYWRUcmVlID0gKGRpcjogc3RyaW5nKSA9PiBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJ0hFQURee3RyZWV9J10sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCk7XG5cdGNvbnN0IGxzVHJlZSA9IChkaXI6IHN0cmluZywgdHJlZTogc3RyaW5nKSA9PiBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnbHMtdHJlZScsICctcicsICctLW5hbWUtb25seScsIHRyZWVdLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpLnNwbGl0KCdcXG4nKS5maWx0ZXIoQm9vbGVhbik7XG5cdGNvbnN0IGJsb2JBdCA9IChkaXI6IHN0cmluZywgdHJlZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjYXQtZmlsZScsICdibG9iJywgYCR7dHJlZX06JHtwYXRofWBdLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdvdmVybGF5cyBhIG1vZGlmaWVkIHBhdGggZnJvbSB0aGUgc291cmNlIHRyZWUsIGxlYXZpbmcgb3RoZXIgcGF0aHMgdW50b3VjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyIH0gPSBhd2FpdCBpbml0UmVwb1dpdGhGaWxlcyh7ICdhLnR4dCc6ICdhLXYxXFxuJywgJ2IudHh0JzogJ2ItdjFcXG4nIH0pO1xuXHRcdGNvbnN0IGJhc2UgPSBoZWFkVHJlZShkaXIpO1xuXG5cdFx0Ly8gV29ya2luZyB0cmVlIG1vZGlmaWVzIGEudHh0IG9ubHk7IGNhcHR1cmUgaXQgYXMgdGhlIHNvdXJjZSB0cmVlLlxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICdhLXYyXFxuJyk7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc3ZjIS5jYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZSwgJ2V4cGVjdGVkIGEgd29ya2luZy10cmVlIHNuYXBzaG90Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLm92ZXJsYXlQYXRoSW50b1RyZWUoVVJJLmZpbGUoZGlyKSwgYmFzZSwgJ2EudHh0Jywgc291cmNlISk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ2V4cGVjdGVkIGEgcmVzdWx0IHRyZWUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGZpbGVzOiBsc1RyZWUoZGlyLCByZXN1bHQhKSxcblx0XHRcdFx0YUNvbnRlbnQ6IGJsb2JBdChkaXIsIHJlc3VsdCEsICdhLnR4dCcpLFxuXHRcdFx0XHRiQ29udGVudDogYmxvYkF0KGRpciwgcmVzdWx0ISwgJ2IudHh0JyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRmaWxlczogWydhLnR4dCcsICdiLnR4dCddLFxuXHRcdFx0XHRhQ29udGVudDogJ2EtdjJcXG4nLCAvLyBvdmVybGFpZCBmcm9tIHRoZSBzb3VyY2UgdHJlZVxuXHRcdFx0XHRiQ29udGVudDogJ2ItdjFcXG4nLCAvLyBjb3BpZWQgdmVyYmF0aW0gZnJvbSB0aGUgYmFzZSB0cmVlXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdvdmVybGF5cyBhbiBhZGRlZCBwYXRoIGZyb20gdGhlIHNvdXJjZSB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyIH0gPSBhd2FpdCBpbml0UmVwb1dpdGhGaWxlcyh7ICdhLnR4dCc6ICdhLXYxXFxuJyB9KTtcblx0XHRjb25zdCBiYXNlID0gaGVhZFRyZWUoZGlyKTtcblxuXHRcdC8vIFdvcmtpbmcgdHJlZSBhZGRzIGFuIHVudHJhY2tlZCBmaWxlOyBjYXB0dXJlIGl0IGFzIHRoZSBzb3VyY2UgdHJlZS5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdmcmVzaC50eHQnKSwgJ2ZyZXNoXFxuJyk7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc3ZjIS5jYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZSwgJ2V4cGVjdGVkIGEgd29ya2luZy10cmVlIHNuYXBzaG90Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLm92ZXJsYXlQYXRoSW50b1RyZWUoVVJJLmZpbGUoZGlyKSwgYmFzZSwgJ2ZyZXNoLnR4dCcsIHNvdXJjZSEpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBhIHJlc3VsdCB0cmVlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBmaWxlczogbHNUcmVlKGRpciwgcmVzdWx0ISksIGZyZXNoQ29udGVudDogYmxvYkF0KGRpciwgcmVzdWx0ISwgJ2ZyZXNoLnR4dCcpIH0sXG5cdFx0XHR7IGZpbGVzOiBbJ2EudHh0JywgJ2ZyZXNoLnR4dCddLCBmcmVzaENvbnRlbnQ6ICdmcmVzaFxcbicgfSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmVtb3ZlcyBhIHBhdGggYWJzZW50IGZyb20gdGhlIHNvdXJjZSB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyIH0gPSBhd2FpdCBpbml0UmVwb1dpdGhGaWxlcyh7ICdhLnR4dCc6ICdhLXYxXFxuJywgJ2IudHh0JzogJ2ItdjFcXG4nIH0pO1xuXG5cdFx0Ly8gQmFzZSA9IHdvcmtpbmcgdHJlZSB0aGF0IGluY2x1ZGVzIGFuIHVudHJhY2tlZCBmaWxlOyBzb3VyY2UgPSBIRUFEIHRyZWVcblx0XHQvLyAod2hpY2ggbGFja3MgaXQpLiBPdmVybGF5aW5nIHRoYXQgcGF0aCByZW1vdmVzIGl0IGZyb20gdGhlIGJhc2UuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZnJlc2gudHh0JyksICdmcmVzaFxcbicpO1xuXHRcdGNvbnN0IGJhc2UgPSBhd2FpdCBzdmMhLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZShVUkkuZmlsZShkaXIpKTtcblx0XHRhc3NlcnQub2soYmFzZSwgJ2V4cGVjdGVkIGEgd29ya2luZy10cmVlIHNuYXBzaG90Jyk7XG5cdFx0Y29uc3Qgc291cmNlID0gaGVhZFRyZWUoZGlyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEub3ZlcmxheVBhdGhJbnRvVHJlZShVUkkuZmlsZShkaXIpLCBiYXNlISwgJ2ZyZXNoLnR4dCcsIHNvdXJjZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ2V4cGVjdGVkIGEgcmVzdWx0IHRyZWUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobHNUcmVlKGRpciwgcmVzdWx0ISksIFsnYS50eHQnLCAnYi50eHQnXSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgbm9uLWdpdCBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3Qtbm9uZ2l0LW92ZXJsYXktJykpO1xuXHRcdHRtcFJvb3QgPSBkaXI7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5vdmVybGF5UGF0aEludG9UcmVlKFVSSS5maWxlKGRpciksICdIRUFEJywgJ2EudHh0JywgJ0hFQUQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0R2l0U2VydmljZSAtIHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdCAocmVhbCBnaXQpJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGhhc0dpdCA9ICgoKSA9PiB7XG5cdFx0dHJ5IHsgY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJy0tdmVyc2lvbiddLCB7IHN0ZGlvOiAnaWdub3JlJyB9KTsgcmV0dXJuIHRydWU7IH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cblx0fSkoKTtcblxuXHRsZXQgdG1wUm9vdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgc3ZjOiBBZ2VudEhvc3RHaXRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0bXBSb290ID0gdW5kZWZpbmVkO1xuXHRcdHN2YyA9IGNyZWF0ZUdpdFNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cm1EaXJXaXRoUmV0cnkodG1wUm9vdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGluaXRSZXBvKCk6ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gQnVmZmVyIHtcblx0XHR0bXBSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtZ2l0LWJhc2VsaW5lLScpKTtcblx0XHRjb25zdCBydW4gPSAoLi4uYXJnczogc3RyaW5nW10pID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgYXJncywgeyBjd2Q6IHRtcFJvb3QhLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0cnVuKCdpbml0JywgJy1xJywgJy1iJywgJ21haW4nKTtcblx0XHRyZXR1cm4gcnVuO1xuXHR9XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXR1cm5zIHRoZSBtZXJnZS1iYXNlIG9mIEhFQUQgYW5kIHRoZSBiYXNlIGJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCBydW4gPSBpbml0UmVwbygpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKHRtcFJvb3QhLCAnYS50eHQnKSwgJ2Jhc2VcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnYmFzZScpO1xuXHRcdGNvbnN0IGJhc2VDb21taXQgPSBydW4oJ3Jldi1wYXJzZScsICdIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG5cblx0XHQvLyBEaXZlcmdlIG9udG8gYSBmZWF0dXJlIGJyYW5jaCB3aXRoIGFuIGV4dHJhIGNvbW1pdC5cblx0XHRydW4oJ2NoZWNrb3V0JywgJy1xJywgJy1iJywgJ2ZlYXR1cmUnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbih0bXBSb290ISwgJ2EudHh0JyksICdmZWF0dXJlXFxuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLWFtJywgJ2ZlYXR1cmUnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEucmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KFVSSS5maWxlKHRtcFJvb3QhKSwgJ21haW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBiYXNlQ29tbWl0KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdmYWxscyBiYWNrIHRvIEhFQUQgd2hlbiBubyBiYXNlIGJyYW5jaCBpcyBnaXZlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCBydW4gPSBpbml0UmVwbygpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKHRtcFJvb3QhLCAnYS50eHQnKSwgJ2Jhc2VcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnYmFzZScpO1xuXHRcdGNvbnN0IGhlYWRDb21taXQgPSBydW4oJ3Jldi1wYXJzZScsICdIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLnJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdChVUkkuZmlsZSh0bXBSb290ISkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGhlYWRDb21taXQpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2ZhbGxzIGJhY2sgdG8gdGhlIGVtcHR5IHRyZWUgZm9yIGEgcmVwbyB3aXRoIG5vIGNvbW1pdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0aW5pdFJlcG8oKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLnJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdChVUkkuZmlsZSh0bXBSb290ISkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICc0YjgyNWRjNjQyY2I2ZWI5YTA2MGU1NGJmOGQ2OTI4OGZiZWU0OTA0Jyk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgbm9uLWdpdCBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3Qtbm9uZ2l0LWJhc2VsaW5lLScpKTtcblx0XHR0bXBSb290ID0gZGlyO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEucmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KFVSSS5maWxlKGRpciksICdtYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQWVBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxhQUFhLGNBQWM7QUFDcEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsaUJBQWlCLGFBQWdFO0FB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RyxVQUFVLEtBQUssU0FBVSxPQUFPLEdBQUcsUUFBUTtBQUNwRCxRQUFJLE9BQU8sR0FBRztBQUNkLFFBQUksVUFBVSxNQUFNLE1BQU0sTUFBTTtBQUNoQyxVQUFNLGFBQWEsSUFBSSxhQUFhLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSztBQUc1RCxRQUFJLFlBQVksTUFBTSxNQUFNLFNBQVM7QUFDckMsVUFBTSxHQUFHLFVBQVUsS0FBSyxTQUFVLE9BQU8sR0FBRyxXQUFXO0FBQ3ZELFFBQUksVUFBVSxNQUFNLE9BQU8sU0FBUztBQUVwQyxVQUFNLFNBQVMsTUFBTSxJQUFLLDRCQUE0QixJQUFJLEtBQUssT0FBUSxHQUFHLE1BQU07QUFDaEYsV0FBTyxZQUFZLFFBQVEsVUFBVTtBQUFBLEVBQ3RDLENBQUM7QUFFRCxHQUFDLFNBQVMsT0FBTyxLQUFLLE1BQU0sbURBQW1ELFlBQVk7QUFDMUYsVUFBTSxLQUFLLE1BQU0sT0FBTyxhQUFhO0FBQ3JDLFVBQU0sTUFBTSxTQUFTO0FBQ3JCLFVBQU0sR0FBRyxVQUFVLEtBQUssU0FBVSxPQUFPLEdBQUcsUUFBUTtBQUNwRCxRQUFJLE9BQU8sR0FBRztBQUNkLFFBQUksVUFBVSxNQUFNLE1BQU0sTUFBTTtBQUNoQyxVQUFNLGFBQWEsSUFBSSxhQUFhLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSztBQUU1RCxVQUFNLFNBQVMsTUFBTSxJQUFLLDRCQUE0QixJQUFJLEtBQUssT0FBUSxDQUFDO0FBQ3hFLFdBQU8sWUFBWSxRQUFRLFVBQVU7QUFBQSxFQUN0QyxDQUFDO0FBRUQsR0FBQyxTQUFTLE9BQU8sS0FBSyxNQUFNLDJEQUEyRCxZQUFZO0FBQ2xHLGFBQVM7QUFDVCxVQUFNLFNBQVMsTUFBTSxJQUFLLDRCQUE0QixJQUFJLEtBQUssT0FBUSxDQUFDO0FBQ3hFLFdBQU8sWUFBWSxRQUFRLDBDQUEwQztBQUFBLEVBQ3RFLENBQUM7QUFFRCxHQUFDLFNBQVMsT0FBTyxLQUFLLE1BQU0sNkNBQTZDLFlBQVk7QUFDcEYsVUFBTSxNQUFNLFlBQVksS0FBSyxPQUFPLEdBQUcsNkJBQTZCLENBQUM7QUFDckUsY0FBVTtBQUNWLFVBQU0sU0FBUyxNQUFNLElBQUssNEJBQTRCLElBQUksS0FBSyxHQUFHLEdBQUcsTUFBTTtBQUMzRSxXQUFPLFlBQVksUUFBUSxNQUFTO0FBQUEsRUFDckMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
