var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as cp from "child_process";
import * as fsPromises from "fs/promises";
import { cp as copyFile } from "@vscode/fs-copyfile";
import * as path from "../../../base/common/path.js";
import { URI } from "../../../base/common/uri.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { parse } from "../../../base/common/glob.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { FileEditKind } from "../common/state/sessionState.js";
import { buildGitBlobUri } from "./gitDiffContent.js";
import { EMPTY_TREE_OBJECT, GitRefType } from "../common/agentHostGitService.js";
import { LRUCache } from "../../../base/common/map.js";
import { Limiter, SequencerByKey } from "../../../base/common/async.js";
let AgentHostGitService = class {
  constructor(_fileService, _environmentService, _logService) {
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    /**
     * A cache of repository roots that have already been discovered.
     */
    this._repositoryRoots = new LRUCache(100);
    this._repositoryRootSequencer = new SequencerByKey();
  }
  async getCurrentBranch(workingDirectory) {
    return (await this._runGit(workingDirectory, ["branch", "--show-current"]))?.trim() || (await this._runGit(workingDirectory, ["rev-parse", "--short", "HEAD"]))?.trim() || void 0;
  }
  async getCurrentBranchName(workingDirectory) {
    return (await this._runGit(workingDirectory, ["branch", "--show-current"]))?.trim() || void 0;
  }
  async getDefaultBranch(workingDirectory) {
    const remoteRef = (await this._runGit(workingDirectory, ["symbolic-ref", "refs/remotes/origin/HEAD"]))?.trim();
    if (remoteRef) {
      if (!remoteRef.startsWith("refs/remotes/origin/")) {
        return { name: remoteRef, startPoint: remoteRef };
      }
      const branch = remoteRef.substring("refs/remotes/origin/".length);
      const hasRemoteRef = await this._runGit(workingDirectory, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`]) !== void 0;
      if (hasRemoteRef) {
        return { name: branch, startPoint: `origin/${branch}` };
      }
      const hasLocalBranch = await this._runGit(workingDirectory, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]) !== void 0;
      return hasLocalBranch ? { name: branch, startPoint: branch } : void 0;
    }
    return void 0;
  }
  async getRefs(workingDirectory, query) {
    const args = ["for-each-ref", "--format=%(refname)%00%(upstream)"];
    if (query?.sort && query.sort !== "alphabetically") {
      args.push("--sort", `-${query.sort}`);
    }
    if (query?.count) {
      args.push(`--count=${query.count}`);
    }
    if (query?.pattern) {
      const patterns = Array.isArray(query.pattern) ? query.pattern : [query.pattern];
      for (const pattern of patterns) {
        args.push(pattern.startsWith("refs/") ? pattern : `refs/${pattern}`);
      }
    }
    const output = await this._runGit(workingDirectory, args);
    return parseGitRefs(output);
  }
  async getBranches(workingDirectory, query) {
    const refs = await this.getRefs(workingDirectory, query);
    return refs.filter((r) => r.kind === GitRefType.Head || r.kind === GitRefType.RemoteHead);
  }
  async getBranch(workingDirectory, name) {
    const refs = await this.getBranches(workingDirectory, { pattern: name });
    return refs.length > 0 ? refs[0] : void 0;
  }
  async getRepositoryRoot(workingDirectory) {
    const workingDirectoryKey = workingDirectory.toString();
    return this._repositoryRootSequencer.queue(workingDirectoryKey, async () => {
      let repositoryRoot = this._repositoryRoots.get(workingDirectoryKey);
      if (repositoryRoot) {
        return repositoryRoot;
      }
      try {
        const repositoryRootPath = (await this._runGit(workingDirectory, ["rev-parse", "--show-toplevel"]))?.trim();
        if (repositoryRootPath) {
          repositoryRoot = URI.file(repositoryRootPath);
          this._repositoryRoots.set(workingDirectoryKey, repositoryRoot);
        }
        return repositoryRoot;
      } catch (error) {
      }
      return void 0;
    });
  }
  async getWorktreeRoots(workingDirectory) {
    const output = await this._runGit(workingDirectory, ["worktree", "list", "--porcelain"]);
    if (!output) {
      return [];
    }
    return output.split(/\r?\n/g).filter((line) => line.startsWith("worktree ")).map((line) => URI.file(line.substring("worktree ".length)));
  }
  async addWorktree(repositoryRoot, worktree, branchName, startPoint, track = false, onProgress) {
    const resolvedStartPoint = await this._resolveRemoteTrackingBranch(repositoryRoot, startPoint) ?? startPoint;
    const args = ["-c", "checkout.workers=0", "worktree", "add"];
    if (!track) {
      args.push("--no-track");
    }
    args.push("-b", branchName, worktree.fsPath, resolvedStartPoint);
    const progressParser = onProgress ? new GitCheckoutProgressParser(onProgress) : void 0;
    await this._runGit(repositoryRoot, args, {
      timeout: 18e4,
      throwOnError: true,
      ...progressParser ? { env: { GIT_PROGRESS_DELAY: "0" }, onStderr: (chunk) => progressParser.push(chunk) } : {}
    });
  }
  async copyWorktreeIncludeFiles(repositoryRoot, worktree, globs, onProgress) {
    try {
      const worktreeIncludePaths = await this._getWorktreeIncludePaths(repositoryRoot, worktree, globs);
      if (worktreeIncludePaths.length === 0) {
        return;
      }
      const startTime = performance.now();
      const limiter = new Limiter(15);
      const filesTotal = worktreeIncludePaths.reduce((total, entry) => total + entry.fileCount, 0);
      let filesDone = 0;
      const results = await Promise.allSettled(worktreeIncludePaths.map((entry) => limiter.queue(async () => {
        const targetPath = path.join(worktree.fsPath, path.relative(repositoryRoot.fsPath, entry.sourcePath));
        await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
        await copyFile(entry.sourcePath, targetPath, { force: true, recursive: true, verbatimSymlinks: true });
        filesDone += entry.fileCount;
        onProgress?.({ filesDone, filesTotal });
      })));
      const failedOperations = results.filter((result) => result.status === "rejected");
      this._logService.info(`[AgentHostGitService][copyWorktreeIncludeFiles] Copied ${worktreeIncludePaths.length - failedOperations.length}/${worktreeIncludePaths.length} folder(s)/file(s) to worktree ${worktree.fsPath}. [${(performance.now() - startTime).toFixed(2)}ms]`);
      if (failedOperations.length > 0) {
        this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Failed to copy ${failedOperations.length} folder(s)/file(s) to worktree ${worktree.fsPath}.`);
        for (const error of failedOperations) {
          this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] ${error.reason}`);
        }
      }
    } catch (error) {
      this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Failed to copy folder(s)/file(s) to worktree ${worktree.fsPath}: ${error}`);
    }
  }
  async addExistingWorktree(repositoryRoot, worktree, branchName) {
    await this._runGit(repositoryRoot, ["-c", "checkout.workers=0", "worktree", "add", "-f", worktree.fsPath, branchName], { timeout: 18e4, throwOnError: true });
  }
  async removeWorktree(repositoryRoot, worktree) {
    await this._runGit(repositoryRoot, ["worktree", "remove", "--force", worktree.fsPath], { timeout: 6e4, throwOnError: true });
  }
  async branchExists(repositoryRoot, branchName) {
    const output = await this._runGit(repositoryRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return output !== void 0;
  }
  async hasUncommittedChanges(workingDirectory) {
    const output = await this._runGit(workingDirectory, ["status", "--porcelain"]);
    return !!output && output.trim().length > 0;
  }
  async commitAll(workingDirectory, message) {
    await this._runGit(workingDirectory, ["add", "-A", "--", ":/"], { throwOnError: true });
    await this._runGit(workingDirectory, ["commit", "--no-verify", "-m", message], { timeout: 6e4, throwOnError: true });
  }
  async restore(workingDirectory, paths, options) {
    const args = ["restore"];
    if (options?.staged) {
      args.push("--staged");
    }
    if (options?.ref) {
      args.push("--source", options.ref);
    }
    if (paths.length === 0) {
      paths = ["."];
    }
    await this._runGit(workingDirectory, [...args, "--", ...paths], { throwOnError: true });
  }
  async hasUpstream(workingDirectory, branchName) {
    const output = await this._runGit(workingDirectory, ["rev-parse", "--abbrev-ref", `${branchName}@{upstream}`]);
    return output !== void 0 && output.trim().length > 0;
  }
  async pull(workingDirectory, options) {
    const args = ["pull"];
    if (options?.rebase) {
      args.push("-r");
    }
    if (options?.remote || options?.ref) {
      args.push(options.remote ?? "origin");
      if (options.ref) {
        args.push(options.ref);
      }
    }
    await this._runGit(workingDirectory, args, { timeout: 18e4, throwOnError: true });
  }
  async push(workingDirectory, options) {
    const args = ["push"];
    if (options?.setUpstream) {
      args.push("--set-upstream");
    }
    if (options?.remote || options?.ref) {
      args.push(options.remote ?? "origin");
      if (options.ref) {
        args.push(options.ref);
      }
    }
    await this._runGit(workingDirectory, args, { timeout: 18e4, throwOnError: true });
  }
  async computeSessionFileDiffs(workingDirectory, options) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const mergeBaseCommit = await this._resolveBranchMergeBaseCommit(repositoryRoot, options.baseBranch);
    const statusOut = await this._runGit(repositoryRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    if (statusOut === void 0) {
      return void 0;
    }
    const hasUntracked = parseUntrackedPaths(statusOut).length > 0;
    let rawDiffOutput;
    if (!hasUntracked) {
      rawDiffOutput = await this._runGit(repositoryRoot, ["diff", "--raw", "--numstat", "--diff-filter=ADMR", "-z", mergeBaseCommit, "--"]);
    } else {
      const changedPaths = parseChangedPaths(statusOut);
      rawDiffOutput = await this._runWithTempIndex(repositoryRoot, mergeBaseCommit, changedPaths);
    }
    if (rawDiffOutput === void 0) {
      return void 0;
    }
    return parseGitDiffRawNumstat(rawDiffOutput, repositoryRoot, options.sessionUri, mergeBaseCommit);
  }
  async resolveBranchBaselineCommit(workingDirectory, baseBranch) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    return this._resolveBranchMergeBaseCommit(repositoryRoot, baseBranch);
  }
  /**
   * Resolves the merge-base commit-ish the Branch Changes baseline is anchored
   * on. With a base branch, prefers the corresponding `origin/<base>`
   * remote-tracking ref when it exists so branch changes match a PR-style
   * comparison even if the local base branch is stale. Without a usable base,
   * falls back to `HEAD` (surfaces uncommitted work but no committed-on-branch
   * work). For empty repos with no `HEAD`, falls back to the empty-tree object.
   * Always resolves to a commit-ish (never `undefined`) once the repository
   * root is known.
   */
  async _resolveBranchMergeBaseCommit(repositoryRoot, baseBranch) {
    let mergeBaseCommit;
    if (baseBranch) {
      const resolvedBase = await this._resolveRemoteTrackingBranch(repositoryRoot, baseBranch) ?? baseBranch;
      mergeBaseCommit = (await this._runGit(repositoryRoot, ["merge-base", "HEAD", resolvedBase]))?.trim();
    }
    if (!mergeBaseCommit) {
      mergeBaseCommit = (await this._runGit(repositoryRoot, ["rev-parse", "HEAD"]))?.trim();
    }
    return mergeBaseCommit ?? EMPTY_TREE_OBJECT;
  }
  async _runWithTempIndex(repositoryRoot, mergeBaseCommit, changedPaths) {
    const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-git-diff-${generateUuid()}`);
    await this._fileService.createFolder(tempDir);
    const indexFile = URI.joinPath(tempDir, "index").fsPath;
    const env = { GIT_INDEX_FILE: indexFile };
    env.COMMAND_HOOK_LOCK = "1";
    try {
      const seeded = await this._runGit(repositoryRoot, ["read-tree", "HEAD"], { env });
      if (seeded === void 0) {
        await this._runGit(repositoryRoot, ["read-tree", EMPTY_TREE_OBJECT], { env });
      }
      if (!await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env)) {
        return void 0;
      }
      return await this._runGit(repositoryRoot, ["diff", "--cached", "--raw", "--numstat", "--diff-filter=ADMR", "-z", mergeBaseCommit, "--"], { env });
    } finally {
      try {
        await this._fileService.del(tempDir, { recursive: true, useTrash: false });
      } catch {
      }
    }
  }
  async _stageChangedPaths(repositoryRoot, tempDir, changedPaths, env) {
    if (changedPaths.length === 0) {
      return true;
    }
    const pathspecFile = URI.joinPath(tempDir, "pathspec");
    await this._fileService.writeFile(pathspecFile, VSBuffer.fromString(changedPaths.join("\0") + "\0"));
    this._logService.debug(`[agentHostGitService] Staging ${changedPaths.length} changed path(s) into temp index`);
    return await this._runGit(repositoryRoot, ["add", "-A", `--pathspec-from-file=${pathspecFile.fsPath}`, "--pathspec-file-nul"], {
      env: { ...env, GIT_LITERAL_PATHSPECS: "1" }
    }) !== void 0;
  }
  async _resolveRemoteTrackingBranch(repositoryRoot, branch) {
    const remoteBranch = `origin/${branch}`;
    const output = await this._runGit(repositoryRoot, ["show-ref", "--verify", "--quiet", `refs/remotes/${remoteBranch}`]);
    return output !== void 0 ? remoteBranch : void 0;
  }
  /**
   * Resolves the git-ignored paths to copy into a worktree.
   */
  async _getWorktreeIncludePaths(repositoryRoot, worktreeRoot, globs) {
    if (globs.length === 0) {
      return [];
    }
    const baseArgs = ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"];
    const [filesOutput, directoryOutput, worktreeOutput] = await Promise.all([
      this._runGit(repositoryRoot, baseArgs, { timeout: 6e4 }),
      this._runGit(repositoryRoot, [...baseArgs, "--directory", "--no-empty-directory"], { timeout: 6e4 }),
      this._runGit(worktreeRoot, ["ls-files", "-z"], { timeout: 6e4 })
    ]);
    if (!filesOutput) {
      return [];
    }
    const ignoredFiles = filesOutput.split("\0").filter((entry) => entry.length > 0);
    if (ignoredFiles.length === 0) {
      return [];
    }
    const matchers = globs.map((pattern) => parse(pattern));
    const wholeDirectories = new Set((directoryOutput ?? "").split("\0").filter((entry) => entry.endsWith("/")));
    const worktreeFiles = new Set((worktreeOutput ?? "").split("\0").filter((entry) => entry.length > 0));
    const worktreeDirectories = /* @__PURE__ */ new Set();
    for (const file of worktreeFiles) {
      let index = file.indexOf("/");
      while (index !== -1) {
        worktreeDirectories.add(file.slice(0, index + 1));
        index = file.indexOf("/", index + 1);
      }
    }
    const matchedFiles = [];
    const nonCollapsibleDirectories = /* @__PURE__ */ new Set();
    for (const file of ignoredFiles) {
      if (matchers.some((matcher) => matcher(file)) && !hasWorktreePathCollision(file, worktreeFiles, worktreeDirectories)) {
        matchedFiles.push(file);
      } else if (wholeDirectories.size > 0) {
        const containingDirectory = findContainingDirectory(file, wholeDirectories);
        if (containingDirectory !== void 0) {
          nonCollapsibleDirectories.add(containingDirectory);
        }
      }
    }
    if (matchedFiles.length === 0) {
      return [];
    }
    const collapsedDirectories = /* @__PURE__ */ new Set();
    for (const dir of wholeDirectories) {
      if (!nonCollapsibleDirectories.has(dir)) {
        collapsedDirectories.add(dir);
      }
    }
    return toWorktreeIncludeEntries(repositoryRoot, matchedFiles, collapsedDirectories);
  }
  async showBlob(workingDirectory, ref, repoRelativePath) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    return new Promise((resolve) => {
      cp.execFile("git", ["show", `${ref}:${repoRelativePath}`], { cwd: workingDirectory.fsPath, timeout: 5e3, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          resolve(void 0);
          return;
        }
        resolve(VSBuffer.wrap(stdout));
      });
    });
  }
  async getSessionGitState(workingDirectory) {
    return this._computeSessionGitState(workingDirectory);
  }
  async getFetchRemoteUrls(workingDirectory, preferredRemote) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    return parseFetchRemoteUrls(await this._runGit(repositoryRoot, ["remote", "-v"]), preferredRemote);
  }
  async getUntrackedPaths(workingDirectory) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const status = await this._runGit(repositoryRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    return status === void 0 ? void 0 : parseUntrackedPaths(status);
  }
  async captureWorkingTreeAsTree(workingDirectory) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const statusOut = await this._runGit(repositoryRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    if (statusOut === void 0) {
      return void 0;
    }
    const changedPaths = parseChangedPaths(statusOut);
    const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-checkpoint-${generateUuid()}`);
    await this._fileService.createFolder(tempDir);
    const indexFile = URI.joinPath(tempDir, "index").fsPath;
    const env = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: "1" };
    try {
      const seeded = await this._runGit(repositoryRoot, ["read-tree", "HEAD"], { env });
      if (seeded === void 0) {
        await this._runGit(repositoryRoot, ["read-tree", EMPTY_TREE_OBJECT], { env });
      }
      if (!await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env)) {
        return void 0;
      }
      const tree = (await this._runGit(repositoryRoot, ["write-tree"], { env }))?.trim();
      return tree || void 0;
    } finally {
      try {
        await this._fileService.del(tempDir, { recursive: true, useTrash: false });
      } catch {
      }
    }
  }
  async commitTree(repositoryRoot, treeOid, parentOid, message) {
    const args = ["commit-tree", treeOid];
    if (parentOid) {
      args.push("-p", parentOid);
    }
    args.push("-m", message);
    const out = await this._runGit(repositoryRoot, args, { throwOnError: true });
    return out?.trim() || void 0;
  }
  async updateRef(repositoryRoot, ref, newOid) {
    await this._runGit(repositoryRoot, ["update-ref", ref, newOid], { throwOnError: true });
  }
  async deleteRefs(repositoryRoot, refs) {
    if (refs.length === 0) {
      return;
    }
    const stdin = refs.map((ref) => `delete ${ref}\0\0`).join("");
    await new Promise((resolve) => {
      const proc = cp.execFile("git", ["update-ref", "--stdin", "-z"], { cwd: repositoryRoot.fsPath, timeout: 1e4 }, () => {
        resolve();
      });
      proc.stdin?.end(stdin);
    });
  }
  async revParse(repositoryRoot, expression) {
    const out = await this._runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", expression]);
    return out?.trim() || void 0;
  }
  async overlayPathIntoTree(repositoryRoot, baseTreeOid, path2, sourceTreeOid) {
    const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-review-overlay-${generateUuid()}`);
    await this._fileService.createFolder(tempDir);
    const indexFile = URI.joinPath(tempDir, "index").fsPath;
    const env = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: "1" };
    try {
      const readTreeOut = await this._runGit(repositoryRoot, ["read-tree", baseTreeOid], { env, throwOnError: false });
      if (readTreeOut === void 0) {
        return void 0;
      }
      const lsTreeOut = await this._runGit(repositoryRoot, ["ls-tree", "-z", sourceTreeOid, "--", path2], { env });
      const entry = parseSingleLsTreeEntry(lsTreeOut);
      if (entry) {
        const updateIndexOut = await this._runGit(repositoryRoot, ["update-index", "--add", "--cacheinfo", `${entry.mode},${entry.oid},${path2}`], { env, throwOnError: false });
        if (updateIndexOut === void 0) {
          return void 0;
        }
      } else {
        const updateIndexOut = await this._runGit(repositoryRoot, ["update-index", "--force-remove", "--", path2], { env, throwOnError: false });
        if (updateIndexOut === void 0) {
          return void 0;
        }
      }
      const writeTreeOut = await this._runGit(repositoryRoot, ["write-tree"], { env });
      return writeTreeOut?.trim();
    } finally {
      try {
        await this._fileService.del(tempDir, { recursive: true, useTrash: false });
      } catch {
      }
    }
  }
  async diffTreePaths(repositoryRoot, fromTreeish, toTreeish) {
    const out = await this._runGit(repositoryRoot, ["diff", "--name-only", "--no-renames", "-z", fromTreeish, toTreeish, "--"]);
    if (out === void 0) {
      return void 0;
    }
    return out.split("\0").filter(Boolean);
  }
  async computeFileDiffsBetweenRefs(workingDirectory, options) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    try {
      const raw = await this._runGit(repositoryRoot, ["diff", "--raw", "--numstat", "--diff-filter=ADMR", "-z", options.fromRef, options.toRef, "--"]);
      if (raw === void 0) {
        return void 0;
      }
      return parseGitDiffRawNumstat(raw, repositoryRoot, options.sessionUri, options.fromRef, options.toRef);
    } catch (err) {
      this._logService.warn(`[AgentHostGitService][computeFileDiffsBetweenRefs] Failed to compute file diffs ${repositoryRoot.toString()}, ${options.fromRef}, ${options.toRef}: ${err}`);
      return void 0;
    }
  }
  async getBranchDiffSafetyInfo(workingDirectory, baselineCommit) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const [virtualFileSystem, sparseCheckout, timestamp, commitCount, workspaceFiles] = await Promise.all([
      this._runGit(repositoryRoot, ["config", "--get", "core.virtualfilesystem"]),
      this._runGit(repositoryRoot, ["config", "--get", "core.sparsecheckout"]),
      this._runGit(repositoryRoot, ["show", "-s", "--format=%ct", baselineCommit]),
      this._runGit(repositoryRoot, ["rev-list", "--count", `${baselineCommit}..HEAD`]),
      this._runGit(repositoryRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    ]);
    const sparseCheckoutEnabled = (/* @__PURE__ */ new Set(["true", "yes", "on", "1"])).has(sparseCheckout?.trim().toLowerCase() ?? "");
    const timestampSeconds = Number(timestamp?.trim());
    const parsedCommitCount = Number(commitCount?.trim());
    return {
      hasVirtualFileSystem: Boolean(virtualFileSystem?.trim()) || sparseCheckoutEnabled,
      baselineCommitTimestamp: Number.isFinite(timestampSeconds) ? timestampSeconds * 1e3 : void 0,
      commitCount: Number.isFinite(parsedCommitCount) ? parsedCommitCount : void 0,
      workspaceFileCount: workspaceFiles?.split("\0").filter(Boolean).length ?? 0
    };
  }
  async getDiffPatchBetweenRefs(workingDirectory, options) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const paths = [...new Set(options.paths)];
    if (paths.length === 0) {
      return { patch: "", tooLarge: false };
    }
    try {
      const patch = await this._runGit(repositoryRoot, ["diff", "--patch", "--no-ext-diff", "--find-renames", "--diff-filter=ADMR", options.fromRef, options.toRef, "--", ...paths], { maxBuffer: options.maxBuffer, throwOnError: true });
      return patch === void 0 ? void 0 : { patch, tooLarge: false };
    } catch (error) {
      if (isMaxBufferError(error)) {
        return { patch: void 0, tooLarge: true };
      }
      throw error;
    }
  }
  async _computeSessionGitState(workingDirectory) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const [
      statusOutput,
      remotesOutput,
      defaultBranchRef
    ] = await Promise.all([
      this._runGit(repositoryRoot, ["status", "-b", "--porcelain=v2"]),
      this._runGit(repositoryRoot, ["remote", "-v"]),
      this._runGit(repositoryRoot, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
    ]);
    const status = parseGitStatusV2(statusOutput);
    const hasGitHubRemote = parseHasGitHubRemote(remotesOutput);
    const baseBranchName = parseDefaultBranchRef(defaultBranchRef);
    const githubRepo = parseGitHubRepoFromRemote(remotesOutput);
    const upstreamRemote = status.upstreamBranchName?.split("/")[0];
    const githubHeadRepo = upstreamRemote ? parseGitHubRepoFromRemote(remotesOutput, upstreamRemote) : void 0;
    let outgoingChanges = status.outgoingChanges;
    if (outgoingChanges === void 0 && baseBranchName && status.branchName && status.branchName !== baseBranchName) {
      const ahead = await this._runGit(repositoryRoot, ["rev-list", "--count", `${baseBranchName}..HEAD`]);
      const parsed = ahead === void 0 ? NaN : Number(ahead.trim());
      if (Number.isFinite(parsed)) {
        outgoingChanges = parsed;
      }
    }
    const result = {
      hasGitHubRemote,
      branchName: status.branchName,
      baseBranchName,
      upstreamBranchName: status.upstreamBranchName,
      incomingChanges: status.incomingChanges,
      outgoingChanges,
      uncommittedChanges: status.uncommittedChanges,
      githubOwner: githubRepo?.owner,
      githubHeadOwner: githubHeadRepo?.owner,
      githubRepo: githubRepo?.repo
    };
    return stripUndefined(result);
  }
  _runGit(workingDirectory, args, options) {
    this._logService.trace(`[agentHostGitService] > git ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
      const env = options?.env ? { ...process.env, ...options.env } : void 0;
      const timeoutMs = options?.timeout ?? 5e3;
      let didTimeOut = false;
      const child = cp.execFile("git", [...args], { cwd: workingDirectory.fsPath, env, maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          if (stderr) {
            this._logService.warn(`[agentHostGitService] > git ${args.join(" ")} failed; full stderr:
${stderr}`);
          }
          if (options?.throwOnError) {
            reject(new Error(formatGitError(args, timeoutMs, didTimeOut, error, stderr), { cause: error }));
            return;
          }
          resolve(void 0);
          return;
        }
        resolve(stdout);
      });
      const onStderr = options?.onStderr;
      if (onStderr) {
        child.stderr?.on("data", (chunk) => onStderr(chunk.toString()));
      }
      const timer = setTimeout(() => {
        didTimeOut = true;
        child.kill();
      }, timeoutMs);
      child.on("exit", () => clearTimeout(timer));
    });
  }
};
AgentHostGitService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, INativeEnvironmentService),
  __decorateParam(2, ILogService)
], AgentHostGitService);
const _GitCheckoutProgressParser = class _GitCheckoutProgressParser {
  constructor(_onProgress) {
    this._onProgress = _onProgress;
    this._pending = "";
  }
  push(chunk) {
    const buffer = this._pending + chunk;
    const lastBreak = Math.max(buffer.lastIndexOf("\r"), buffer.lastIndexOf("\n"));
    if (lastBreak === -1) {
      this._pending = buffer;
      return;
    }
    this._pending = buffer.substring(lastBreak + 1);
    const complete = buffer.substring(0, lastBreak);
    _GitCheckoutProgressParser._pattern.lastIndex = 0;
    let match;
    while (match = _GitCheckoutProgressParser._pattern.exec(complete)) {
      const filesTotal = Number(match.groups.total);
      if (filesTotal > 0) {
        this._onProgress({ filesDone: Number(match.groups.done), filesTotal });
      }
    }
  }
};
_GitCheckoutProgressParser._pattern = /Updating files:\s+\d+% \((?<done>\d+)\/(?<total>\d+)\)/g;
let GitCheckoutProgressParser = _GitCheckoutProgressParser;
function toWorktreeIncludeEntries(repositoryRoot, matchedFiles, collapsedDirectories) {
  const toEntry = (relativePath, fileCount) => ({
    sourcePath: path.join(repositoryRoot.fsPath, relativePath),
    fileCount
  });
  const directoryFileCounts = /* @__PURE__ */ new Map();
  for (const dir of collapsedDirectories) {
    directoryFileCounts.set(dir, 0);
  }
  const fileEntries = [];
  for (const file of matchedFiles) {
    const containingDirectory = collapsedDirectories.size > 0 ? findContainingDirectory(file, collapsedDirectories) : void 0;
    if (containingDirectory === void 0) {
      fileEntries.push(toEntry(file, 1));
    } else {
      directoryFileCounts.set(containingDirectory, directoryFileCounts.get(containingDirectory) + 1);
    }
  }
  return [
    ...[...directoryFileCounts].map(([dir, fileCount]) => toEntry(dir, fileCount)),
    ...fileEntries
  ];
}
function findContainingDirectory(file, directories) {
  let index = file.indexOf("/");
  while (index !== -1) {
    const prefix = file.slice(0, index + 1);
    if (directories.has(prefix)) {
      return prefix;
    }
    index = file.indexOf("/", index + 1);
  }
  return void 0;
}
function hasWorktreePathCollision(file, worktreeFiles, worktreeDirectories) {
  if (worktreeFiles.has(file) || worktreeDirectories.has(`${file}/`)) {
    return true;
  }
  let index = file.indexOf("/");
  while (index !== -1) {
    if (worktreeFiles.has(file.slice(0, index))) {
      return true;
    }
    index = file.indexOf("/", index + 1);
  }
  return false;
}
function formatGitError(args, timeoutMs, didTimeOut, error, stderr) {
  const subcommand = args[0] ?? "(unknown)";
  let reason;
  if (didTimeOut) {
    reason = `git ${subcommand} timed out after ${timeoutMs}ms`;
  } else if (error.killed && error.signal) {
    reason = `git ${subcommand} killed by ${error.signal}`;
  } else if (typeof error.code === "number") {
    reason = `git ${subcommand} exited with code ${error.code}`;
  } else {
    reason = error.message;
  }
  const detail = summarizeStderrForError(stderr);
  return detail ? `${reason}: ${detail}` : reason;
}
function summarizeStderrForError(stderr) {
  if (!stderr) {
    return "";
  }
  const lines = stderr.split(/[\r\n]+/g).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "";
  }
  const MAX = 200;
  const gitLfsMissing = lines.find(
    (line) => /\bgit-lfs\b/i.test(line) && /(command not found|not recognized|no such file)/i.test(line)
  );
  const summary = gitLfsMissing ?? lines[lines.length - 1];
  return summary.length > MAX ? `${summary.slice(0, MAX - 1)}\u2026` : summary;
}
function parseUntrackedPaths(output) {
  return parseChangedPaths(output, (status) => status === "??");
}
function parseChangedPaths(output, includeStatus = () => true) {
  if (!output) {
    return [];
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const addPath = (path2) => {
    if (path2 && !seen.has(path2)) {
      seen.add(path2);
      result.push(path2);
    }
  };
  const segments = output.split("\0");
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) {
      continue;
    }
    const status = seg.substring(0, 2);
    const path2 = seg.substring(3);
    const isRenameOrCopy = status[0] === "R" || status[1] === "R" || status[0] === "C" || status[1] === "C";
    if (includeStatus(status)) {
      addPath(path2);
      if (isRenameOrCopy) {
        const sourcePath = segments[++i];
        if (sourcePath) {
          addPath(sourcePath);
        }
      }
    } else if (isRenameOrCopy) {
      i++;
    }
  }
  return result;
}
function parseSingleLsTreeEntry(output) {
  if (!output) {
    return void 0;
  }
  const entry = output.split("\0")[0];
  if (!entry) {
    return void 0;
  }
  const tabIndex = entry.indexOf("	");
  const meta = (tabIndex === -1 ? entry : entry.substring(0, tabIndex)).split(" ");
  if (meta.length < 3) {
    return void 0;
  }
  return { mode: meta[0], oid: meta[2] };
}
function parseGitDiffRawNumstat(output, repositoryRoot, sessionUri, beforeRef, afterRef) {
  const segments = output.split("\0");
  const changes = [];
  const numStats = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < segments.length) {
    const segment = segments[i++];
    if (!segment) {
      continue;
    }
    if (segment.startsWith(":")) {
      const fields = segment.split(" ");
      const status = fields[4] ?? "";
      const path1 = segments[i++];
      if (!path1) {
        continue;
      }
      switch (status[0]) {
        case "A":
          changes.push({ kind: FileEditKind.Create, newPath: path1 });
          break;
        case "M":
          changes.push({ kind: FileEditKind.Edit, oldPath: path1, newPath: path1 });
          break;
        case "D":
          changes.push({ kind: FileEditKind.Delete, oldPath: path1 });
          break;
        case "R": {
          const path2 = segments[i++];
          if (!path2) {
            continue;
          }
          changes.push({ kind: FileEditKind.Rename, oldPath: path1, newPath: path2 });
          break;
        }
        default:
          break;
      }
    } else {
      const [addedStr, removedStr, filePath] = segment.split("	");
      let key;
      if (filePath === "" || filePath === void 0) {
        const oldPath = segments[i++];
        const newPath = segments[i++];
        key = newPath ?? oldPath ?? "";
      } else {
        key = filePath;
      }
      if (!key) {
        continue;
      }
      numStats.set(key, {
        added: addedStr === "-" ? 0 : Number(addedStr) || 0,
        removed: removedStr === "-" ? 0 : Number(removedStr) || 0
      });
    }
  }
  return changes.map((change) => {
    const stats = numStats.get(change.newPath ?? change.oldPath ?? "");
    const beforeFileUri = change.oldPath ? URI.joinPath(repositoryRoot, change.oldPath) : void 0;
    const afterFileUri = change.newPath ? URI.joinPath(repositoryRoot, change.newPath) : void 0;
    const before = change.kind !== FileEditKind.Create && change.oldPath && beforeFileUri ? {
      uri: beforeFileUri.toString(),
      content: { uri: buildGitBlobUri(sessionUri, beforeRef, change.oldPath, beforeFileUri.path) }
    } : void 0;
    const after = change.kind !== FileEditKind.Delete && change.newPath && afterFileUri ? {
      uri: afterFileUri.toString(),
      content: afterRef !== void 0 ? { uri: buildGitBlobUri(sessionUri, afterRef, change.newPath, afterFileUri.path) } : { uri: afterFileUri.toString() }
    } : void 0;
    const diff = {
      added: stats?.added ?? 0,
      removed: stats?.removed ?? 0
    };
    return {
      ...before ? { before } : {},
      ...after ? { after } : {},
      diff
    };
  });
}
function parseGitStatusV2(output) {
  if (!output) {
    return {};
  }
  let branchName;
  let upstreamBranchName;
  let outgoingChanges;
  let incomingChanges;
  let uncommittedChanges = 0;
  for (const rawLine of output.split(/\r?\n/g)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }
    if (line.startsWith("# branch.head ")) {
      const head = line.substring("# branch.head ".length).trim();
      branchName = head === "(detached)" ? void 0 : head;
    } else if (line.startsWith("# branch.upstream ")) {
      upstreamBranchName = line.substring("# branch.upstream ".length).trim();
    } else if (line.startsWith("# branch.ab ")) {
      const m = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
      if (m) {
        outgoingChanges = Number(m[1]);
        incomingChanges = Number(m[2]);
      }
    } else if (!line.startsWith("#")) {
      uncommittedChanges++;
    }
  }
  return { branchName, upstreamBranchName, outgoingChanges, incomingChanges, uncommittedChanges };
}
function parseHasGitHubRemote(remotesOutput) {
  if (remotesOutput === void 0) {
    return void 0;
  }
  if (!remotesOutput.trim()) {
    return false;
  }
  return /github\.com[:\/]/i.test(remotesOutput);
}
function parseFetchRemoteUrls(remotesOutput, preferredRemote) {
  const candidates = parseFetchRemotes(remotesOutput);
  if (!candidates) {
    return void 0;
  }
  const preferredNames = new Set([preferredRemote, "origin"].filter((name) => Boolean(name)));
  const ordered = [
    ...candidates.filter((candidate) => candidate.name === preferredRemote),
    ...candidates.filter((candidate) => candidate.name === "origin" && candidate.name !== preferredRemote),
    ...candidates.filter((candidate) => !preferredNames.has(candidate.name))
  ];
  return [...new Set(ordered.map((candidate) => candidate.url))];
}
function parseFetchRemotes(remotesOutput) {
  if (remotesOutput === void 0) {
    return void 0;
  }
  const candidates = [];
  for (const rawLine of remotesOutput.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(rawLine.trim());
    if (match) {
      candidates.push({ name: match[1], url: match[2] });
    }
  }
  return candidates;
}
function parseGitHubRepoFromRemote(remotesOutput, remoteName) {
  const candidates = remoteName === void 0 ? parseFetchRemoteUrls(remotesOutput) : parseFetchRemotes(remotesOutput)?.filter((candidate) => candidate.name === remoteName).map((candidate) => candidate.url);
  if (!candidates) {
    return void 0;
  }
  for (const url of candidates) {
    const parsed = parseGitHubOwnerRepoFromUrl(url);
    if (parsed) {
      return parsed;
    }
  }
  return void 0;
}
function parseGitHubOwnerRepoFromUrl(url) {
  let m = /^[^@\s]+@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(url);
  if (m) {
    return { owner: m[1], repo: m[2] };
  }
  m = /^[a-z+]+:\/\/(?:[^@\/\s]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(url);
  if (m) {
    return { owner: m[1], repo: m[2] };
  }
  return void 0;
}
function parseDefaultBranchRef(symbolicRefOutput) {
  const ref = symbolicRefOutput?.trim();
  if (!ref) {
    return void 0;
  }
  const prefix = "refs/remotes/origin/";
  return ref.startsWith(prefix) ? ref.substring(prefix.length) : ref;
}
function parseRemoteBranchRef(ref) {
  if (!ref.startsWith("refs/remotes/")) {
    return void 0;
  }
  const name = ref.substring(13);
  const remote = name.split("/")[0];
  return { ref, name, remote };
}
function parseGitRefs(output) {
  if (!output) {
    return [];
  }
  const refs = [];
  for (const line of output.split(/\r?\n/g)) {
    const [ref, upstream] = line.trim().split("\0");
    if (ref.startsWith("refs/heads/")) {
      refs.push({
        ref,
        name: ref.substring(11),
        upstream: upstream ? parseRemoteBranchRef(upstream) : void 0,
        kind: GitRefType.Head
      });
    } else if (ref.startsWith("refs/remotes/") && !/^refs\/remotes\/[^/]+\/HEAD$/.test(ref)) {
      const parsedRemoteBranch = parseRemoteBranchRef(ref);
      if (parsedRemoteBranch) {
        refs.push({
          ...parsedRemoteBranch,
          kind: GitRefType.RemoteHead
        });
      }
    } else if (ref.startsWith("refs/tags/")) {
      refs.push({
        ref,
        name: ref.substring(10),
        kind: GitRefType.Tag
      });
    }
  }
  return refs;
}
function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== void 0) {
      out[k] = v;
    }
  }
  return out;
}
function isMaxBufferError(error) {
  const cause = error instanceof Error ? error.cause : void 0;
  return cause instanceof Error && cause.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}
export {
  AgentHostGitService,
  GitCheckoutProgressParser,
  formatGitError,
  parseChangedPaths,
  parseDefaultBranchRef,
  parseFetchRemoteUrls,
  parseGitDiffRawNumstat,
  parseGitHubRepoFromRemote,
  parseGitRefs,
  parseGitStatusV2,
  parseHasGitHubRemote,
  parseRemoteBranchRef,
  parseSingleLsTreeEntry,
  parseUntrackedPaths,
  summarizeStderrForError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdEdpdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzUHJvbWlzZXMgZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgY3AgYXMgY29weUZpbGUgfSBmcm9tICdAdnNjb2RlL2ZzLWNvcHlmaWxlJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdEtpbmQsIHR5cGUgSVNlc3Npb25GaWxlRGlmZiwgdHlwZSBJU2Vzc2lvbkdpdFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZEdpdEJsb2JVcmkgfSBmcm9tICcuL2dpdERpZmZDb250ZW50LmpzJztcbmltcG9ydCB7IEVNUFRZX1RSRUVfT0JKRUNULCBJQWdlbnRIb3N0R2l0U2VydmljZSwgSUJyYW5jaCwgSUJyYW5jaERpZmZTYWZldHlJbmZvLCBJUmVmUXVlcnksIElDb21wdXRlU2Vzc2lvbkZpbGVEaWZmc09wdGlvbnMsIElEZWZhdWx0QnJhbmNoLCBJUHVsbE9wdGlvbnMsIElQdXNoT3B0aW9ucywgR2l0UmVmVHlwZSwgSVJlbW90ZUJyYW5jaCwgR2l0UmVmLCBJVGFnLCBCcmFuY2gsIElXb3JrdHJlZUZpbGVQcm9ncmVzcyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IExpbWl0ZXIsIFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0R2l0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RHaXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEEgY2FjaGUgb2YgcmVwb3NpdG9yeSByb290cyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIGRpc2NvdmVyZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBvc2l0b3J5Um9vdHMgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBVUkk+KDEwMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9zaXRvcnlSb290U2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBnZXRDdXJyZW50QnJhbmNoKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydicmFuY2gnLCAnLS1zaG93LWN1cnJlbnQnXSkpPy50cmltKClcblx0XHRcdHx8IChhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydyZXYtcGFyc2UnLCAnLS1zaG9ydCcsICdIRUFEJ10pKT8udHJpbSgpXG5cdFx0XHR8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRDdXJyZW50QnJhbmNoTmFtZSh3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsnYnJhbmNoJywgJy0tc2hvdy1jdXJyZW50J10pKT8udHJpbSgpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldERlZmF1bHRCcmFuY2god29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxJRGVmYXVsdEJyYW5jaCB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFRyeSB0byByZWFkIHRoZSBkZWZhdWx0IGJyYW5jaCBmcm9tIHRoZSByZW1vdGUgSEVBRCByZWZlcmVuY2Vcblx0XHRjb25zdCByZW1vdGVSZWYgPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsnc3ltYm9saWMtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRCddKSk/LnRyaW0oKTtcblx0XHRpZiAocmVtb3RlUmVmKSB7XG5cdFx0XHRpZiAoIXJlbW90ZVJlZi5zdGFydHNXaXRoKCdyZWZzL3JlbW90ZXMvb3JpZ2luLycpKSB7XG5cdFx0XHRcdHJldHVybiB7IG5hbWU6IHJlbW90ZVJlZiwgc3RhcnRQb2ludDogcmVtb3RlUmVmIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJyYW5jaCA9IHJlbW90ZVJlZi5zdWJzdHJpbmcoJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vJy5sZW5ndGgpO1xuXHRcdFx0Ly8gUHJlZmVyIHRoZSByZW1vdGUtdHJhY2tpbmcgcmVmICgnb3JpZ2luLzxicmFuY2g+Jykgb3ZlciB0aGUgbG9jYWxcblx0XHRcdC8vIGJyYW5jaCB3aGVuIGJvdGggZXhpc3QsIHNvIHdvcmt0cmVlcyBhcmUgYmFzZWQgb24gdGhlIG1vc3Rcblx0XHRcdC8vIHVwLXRvLWRhdGUgY29tbWl0IHJhdGhlciB0aGFuIGEgcG9zc2libHkgc3RhbGUgbG9jYWwgYnJhbmNoLlxuXHRcdFx0Ly8gVGhpcyBtaXJyb3JzIHRoZSBleHRlbnNpb24taG9zdCBDTEkgd2hpY2ggcmVzb2x2ZXMgYSBicmFuY2gnc1xuXHRcdFx0Ly8gdXBzdHJlYW0gYW5kIHVzZXMgdGhhdCBhcyB0aGUgd29ya3RyZWUgc3RhcnQgcG9pbnQuIEZhbGxzIGJhY2tcblx0XHRcdC8vIHRvIHRoZSBsb2NhbCBicmFuY2ggd2hlbiB0aGUgcmVtb3RlLXRyYWNraW5nIHJlZiBpcyBtaXNzaW5nXG5cdFx0XHQvLyAoZS5nLiBmcmVzaCBjbG9uZSB3aXRoIG5vIHJlbW90ZS10cmFja2luZyByZWZzIHlldCkuXG5cdFx0XHRjb25zdCBoYXNSZW1vdGVSZWYgPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsnc2hvdy1yZWYnLCAnLS12ZXJpZnknLCAnLS1xdWlldCcsIGByZWZzL3JlbW90ZXMvb3JpZ2luLyR7YnJhbmNofWBdKSkgIT09IHVuZGVmaW5lZDtcblx0XHRcdGlmIChoYXNSZW1vdGVSZWYpIHtcblx0XHRcdFx0cmV0dXJuIHsgbmFtZTogYnJhbmNoLCBzdGFydFBvaW50OiBgb3JpZ2luLyR7YnJhbmNofWAgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhhc0xvY2FsQnJhbmNoID0gKGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3Nob3ctcmVmJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCBgcmVmcy9oZWFkcy8ke2JyYW5jaH1gXSkpICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gaGFzTG9jYWxCcmFuY2ggPyB7IG5hbWU6IGJyYW5jaCwgc3RhcnRQb2ludDogYnJhbmNoIH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRSZWZzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgcXVlcnk/OiBJUmVmUXVlcnkpOiBQcm9taXNlPEdpdFJlZltdPiB7XG5cdFx0Y29uc3QgYXJncyA9IFsnZm9yLWVhY2gtcmVmJywgJy0tZm9ybWF0PSUocmVmbmFtZSklMDAlKHVwc3RyZWFtKSddO1xuXG5cdFx0aWYgKHF1ZXJ5Py5zb3J0ICYmIHF1ZXJ5LnNvcnQgIT09ICdhbHBoYWJldGljYWxseScpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1zb3J0JywgYC0ke3F1ZXJ5LnNvcnR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHF1ZXJ5Py5jb3VudCkge1xuXHRcdFx0YXJncy5wdXNoKGAtLWNvdW50PSR7cXVlcnkuY291bnR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHF1ZXJ5Py5wYXR0ZXJuKSB7XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IEFycmF5LmlzQXJyYXkocXVlcnkucGF0dGVybikgPyBxdWVyeS5wYXR0ZXJuIDogW3F1ZXJ5LnBhdHRlcm5dO1xuXHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XG5cdFx0XHRcdGFyZ3MucHVzaChwYXR0ZXJuLnN0YXJ0c1dpdGgoJ3JlZnMvJykgPyBwYXR0ZXJuIDogYHJlZnMvJHtwYXR0ZXJufWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBhcmdzKTtcblx0XHRyZXR1cm4gcGFyc2VHaXRSZWZzKG91dHB1dCk7XG5cdH1cblxuXHRhc3luYyBnZXRCcmFuY2hlcyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIHF1ZXJ5PzogSVJlZlF1ZXJ5KTogUHJvbWlzZTxCcmFuY2hbXT4ge1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCB0aGlzLmdldFJlZnMod29ya2luZ0RpcmVjdG9yeSwgcXVlcnkpO1xuXHRcdHJldHVybiByZWZzLmZpbHRlcihyID0+IHIua2luZCA9PT0gR2l0UmVmVHlwZS5IZWFkIHx8IHIua2luZCA9PT0gR2l0UmVmVHlwZS5SZW1vdGVIZWFkKTtcblx0fVxuXG5cdGFzeW5jIGdldEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5OiBVUkksIG5hbWU6IHN0cmluZyk6IFByb21pc2U8QnJhbmNoIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHRoaXMuZ2V0QnJhbmNoZXMod29ya2luZ0RpcmVjdG9yeSwgeyBwYXR0ZXJuOiBuYW1lIH0pO1xuXHRcdHJldHVybiByZWZzLmxlbmd0aCA+IDAgPyByZWZzWzBdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5S2V5ID0gd29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcnlSb290U2VxdWVuY2VyLnF1ZXVlKHdvcmtpbmdEaXJlY3RvcnlLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCByZXBvc2l0b3J5Um9vdCA9IHRoaXMuX3JlcG9zaXRvcnlSb290cy5nZXQod29ya2luZ0RpcmVjdG9yeUtleSk7XG5cdFx0XHRpZiAocmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIHJlcG9zaXRvcnlSb290O1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5Um9vdFBhdGggPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsncmV2LXBhcnNlJywgJy0tc2hvdy10b3BsZXZlbCddKSk/LnRyaW0oKTtcblx0XHRcdFx0aWYgKHJlcG9zaXRvcnlSb290UGF0aCkge1xuXHRcdFx0XHRcdHJlcG9zaXRvcnlSb290ID0gVVJJLmZpbGUocmVwb3NpdG9yeVJvb3RQYXRoKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvc2l0b3J5Um9vdHMuc2V0KHdvcmtpbmdEaXJlY3RvcnlLZXksIHJlcG9zaXRvcnlSb290KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXBvc2l0b3J5Um9vdDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7IH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldFdvcmt0cmVlUm9vdHMod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3dvcmt0cmVlJywgJ2xpc3QnLCAnLS1wb3JjZWxhaW4nXSk7XG5cdFx0aWYgKCFvdXRwdXQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dC5zcGxpdCgvXFxyP1xcbi9nKVxuXHRcdFx0LmZpbHRlcihsaW5lID0+IGxpbmUuc3RhcnRzV2l0aCgnd29ya3RyZWUgJykpXG5cdFx0XHQubWFwKGxpbmUgPT4gVVJJLmZpbGUobGluZS5zdWJzdHJpbmcoJ3dvcmt0cmVlICcubGVuZ3RoKSkpO1xuXHR9XG5cblx0YXN5bmMgYWRkV29ya3RyZWUocmVwb3NpdG9yeVJvb3Q6IFVSSSwgd29ya3RyZWU6IFVSSSwgYnJhbmNoTmFtZTogc3RyaW5nLCBzdGFydFBvaW50OiBzdHJpbmcsIHRyYWNrID0gZmFsc2UsIG9uUHJvZ3Jlc3M/OiAocHJvZ3Jlc3M6IElXb3JrdHJlZUZpbGVQcm9ncmVzcykgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkU3RhcnRQb2ludCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZW1vdGVUcmFja2luZ0JyYW5jaChyZXBvc2l0b3J5Um9vdCwgc3RhcnRQb2ludCkgPz8gc3RhcnRQb2ludDtcblxuXHRcdGNvbnN0IGFyZ3MgPSBbJy1jJywgJ2NoZWNrb3V0LndvcmtlcnM9MCcsICd3b3JrdHJlZScsICdhZGQnXTtcblxuXHRcdGlmICghdHJhY2spIHtcblx0XHRcdC8vIFBhc3MgLS1uby10cmFjayBzbyB0aGUgbmV3IGFnZW50IGJyYW5jaCBuZXZlciBwaWNrcyB1cCB1cHN0cmVhbVxuXHRcdFx0Ly8gdHJhY2tpbmcgZnJvbSB0aGUgc3RhcnQgcG9pbnQgKGUuZy4gd2hlbiBzdGFydGluZyBmcm9tXG5cdFx0XHQvLyAnb3JpZ2luL21haW4nLCB3aXRob3V0IC0tbm8tdHJhY2sgZ2l0IHdvdWxkIHNldCB0aGUgbmV3IGJyYW5jaCdzXG5cdFx0XHQvLyB1cHN0cmVhbSB0byBvcmlnaW4vbWFpbiwgd2hpY2ggd291bGQgbWlzLWF0dHJpYnV0ZSBwdXNoZXMvcHVsbHMpLlxuXHRcdFx0YXJncy5wdXNoKCctLW5vLXRyYWNrJyk7XG5cdFx0fVxuXG5cdFx0YXJncy5wdXNoKCctYicsIGJyYW5jaE5hbWUsIHdvcmt0cmVlLmZzUGF0aCwgcmVzb2x2ZWRTdGFydFBvaW50KTtcblxuXHRcdC8vIGBnaXQgd29ya3RyZWUgYWRkYCBmb3JjZXMgcHJvZ3Jlc3MgcmVwb3J0aW5nIG9uIGl0cyBpbnRlcm5hbCBjaGVja291dFxuXHRcdC8vIGV2ZW4gd2hlbiBzdGRlcnIgaXMgYSBwaXBlLCBzbyBgVXBkYXRpbmcgZmlsZXM6IE4lICh4L3kpYCBjYW4gYmVcblx0XHQvLyBwYXJzZWQgZm9yIGxpdmUgZmVlZGJhY2suIEdJVF9QUk9HUkVTU19ERUxBWT0wIGxpZnRzIGdpdCdzIGRlZmF1bHRcblx0XHQvLyB0d28tc2Vjb25kIHN1cHByZXNzaW9uIHNvIHRoZSBmaXJzdCBzYW1wbGUgYXJyaXZlcyBpbW1lZGlhdGVseS5cblx0XHRjb25zdCBwcm9ncmVzc1BhcnNlciA9IG9uUHJvZ3Jlc3MgPyBuZXcgR2l0Q2hlY2tvdXRQcm9ncmVzc1BhcnNlcihvblByb2dyZXNzKSA6IHVuZGVmaW5lZDtcblxuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgYXJncywge1xuXHRcdFx0dGltZW91dDogMTgwXzAwMCxcblx0XHRcdHRocm93T25FcnJvcjogdHJ1ZSxcblx0XHRcdC4uLihwcm9ncmVzc1BhcnNlciA/IHsgZW52OiB7IEdJVF9QUk9HUkVTU19ERUxBWTogJzAnIH0sIG9uU3RkZXJyOiBjaHVuayA9PiBwcm9ncmVzc1BhcnNlci5wdXNoKGNodW5rKSB9IDoge30pLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgY29weVdvcmt0cmVlSW5jbHVkZUZpbGVzKHJlcG9zaXRvcnlSb290OiBVUkksIHdvcmt0cmVlOiBVUkksIGdsb2JzOiByZWFkb25seSBzdHJpbmdbXSwgb25Qcm9ncmVzcz86IChwcm9ncmVzczogSVdvcmt0cmVlRmlsZVByb2dyZXNzKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcmt0cmVlSW5jbHVkZVBhdGhzID0gYXdhaXQgdGhpcy5fZ2V0V29ya3RyZWVJbmNsdWRlUGF0aHMocmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlLCBnbG9icyk7XG5cdFx0XHRpZiAod29ya3RyZWVJbmNsdWRlUGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0XHRjb25zdCBsaW1pdGVyID0gbmV3IExpbWl0ZXI8dm9pZD4oMTUpO1xuXHRcdFx0Y29uc3QgZmlsZXNUb3RhbCA9IHdvcmt0cmVlSW5jbHVkZVBhdGhzLnJlZHVjZSgodG90YWwsIGVudHJ5KSA9PiB0b3RhbCArIGVudHJ5LmZpbGVDb3VudCwgMCk7XG5cdFx0XHRsZXQgZmlsZXNEb25lID0gMDtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQod29ya3RyZWVJbmNsdWRlUGF0aHMubWFwKGVudHJ5ID0+IGxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRQYXRoID0gcGF0aC5qb2luKHdvcmt0cmVlLmZzUGF0aCwgcGF0aC5yZWxhdGl2ZShyZXBvc2l0b3J5Um9vdC5mc1BhdGgsIGVudHJ5LnNvdXJjZVBhdGgpKTtcblx0XHRcdFx0YXdhaXQgZnNQcm9taXNlcy5ta2RpcihwYXRoLmRpcm5hbWUodGFyZ2V0UGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCBjb3B5RmlsZShlbnRyeS5zb3VyY2VQYXRoLCB0YXJnZXRQYXRoLCB7IGZvcmNlOiB0cnVlLCByZWN1cnNpdmU6IHRydWUsIHZlcmJhdGltU3ltbGlua3M6IHRydWUgfSk7XG5cdFx0XHRcdGZpbGVzRG9uZSArPSBlbnRyeS5maWxlQ291bnQ7XG5cdFx0XHRcdG9uUHJvZ3Jlc3M/Lih7IGZpbGVzRG9uZSwgZmlsZXNUb3RhbCB9KTtcblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGZhaWxlZE9wZXJhdGlvbnMgPSByZXN1bHRzLmZpbHRlcigocmVzdWx0KTogcmVzdWx0IGlzIFByb21pc2VSZWplY3RlZFJlc3VsdCA9PiByZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdEdpdFNlcnZpY2VdW2NvcHlXb3JrdHJlZUluY2x1ZGVGaWxlc10gQ29waWVkICR7d29ya3RyZWVJbmNsdWRlUGF0aHMubGVuZ3RoIC0gZmFpbGVkT3BlcmF0aW9ucy5sZW5ndGh9LyR7d29ya3RyZWVJbmNsdWRlUGF0aHMubGVuZ3RofSBmb2xkZXIocykvZmlsZShzKSB0byB3b3JrdHJlZSAke3dvcmt0cmVlLmZzUGF0aH0uIFskeyhwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0VGltZSkudG9GaXhlZCgyKX1tc11gKTtcblxuXHRcdFx0aWYgKGZhaWxlZE9wZXJhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RHaXRTZXJ2aWNlXVtjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXNdIEZhaWxlZCB0byBjb3B5ICR7ZmFpbGVkT3BlcmF0aW9ucy5sZW5ndGh9IGZvbGRlcihzKS9maWxlKHMpIHRvIHdvcmt0cmVlICR7d29ya3RyZWUuZnNQYXRofS5gKTtcblx0XHRcdFx0Zm9yIChjb25zdCBlcnJvciBvZiBmYWlsZWRPcGVyYXRpb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0R2l0U2VydmljZV1bY29weVdvcmt0cmVlSW5jbHVkZUZpbGVzXSAke2Vycm9yLnJlYXNvbn1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RHaXRTZXJ2aWNlXVtjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXNdIEZhaWxlZCB0byBjb3B5IGZvbGRlcihzKS9maWxlKHMpIHRvIHdvcmt0cmVlICR7d29ya3RyZWUuZnNQYXRofTogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBhZGRFeGlzdGluZ1dvcmt0cmVlKHJlcG9zaXRvcnlSb290OiBVUkksIHdvcmt0cmVlOiBVUkksIGJyYW5jaE5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGAtZmAgKGZvcmNlKSBzbyByZWNyZWF0aW9uIHN1Y2NlZWRzIGV2ZW4gd2hlbiB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IHdhc1xuXHRcdC8vIGRlbGV0ZWQgb3V0LW9mLWJhbmQgYnV0IGdpdCBzdGlsbCBoYXMgaXQgcmVnaXN0ZXJlZCAoXCJtaXNzaW5nIGJ1dFxuXHRcdC8vIGFscmVhZHkgcmVnaXN0ZXJlZCB3b3JrdHJlZVwiKS4gVGhpcyBpcyBvdXIgb3duIG1hbmFnZWQgcGVyLXNlc3Npb25cblx0XHQvLyB3b3JrdHJlZS9icmFuY2gsIHNvIG92ZXJyaWRpbmcgZ2l0J3Mgc2FmZWd1YXJkcyBoZXJlIGlzIHNhZmUuXG5cdFx0YXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJy1jJywgJ2NoZWNrb3V0LndvcmtlcnM9MCcsICd3b3JrdHJlZScsICdhZGQnLCAnLWYnLCB3b3JrdHJlZS5mc1BhdGgsIGJyYW5jaE5hbWVdLCB7IHRpbWVvdXQ6IDE4MF8wMDAsIHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZVdvcmt0cmVlKHJlcG9zaXRvcnlSb290OiBVUkksIHdvcmt0cmVlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnd29ya3RyZWUnLCAncmVtb3ZlJywgJy0tZm9yY2UnLCB3b3JrdHJlZS5mc1BhdGhdLCB7IHRpbWVvdXQ6IDYwXzAwMCwgdGhyb3dPbkVycm9yOiB0cnVlIH0pO1xuXHR9XG5cblx0YXN5bmMgYnJhbmNoRXhpc3RzKHJlcG9zaXRvcnlSb290OiBVUkksIGJyYW5jaE5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIGBzaG93LXJlZiAtLXZlcmlmeSAtLXF1aWV0YCBleGl0cyAwIHdoZW4gdGhlIHJlZiBleGlzdHMgYW5kIDEgb3RoZXJ3aXNlLlxuXHRcdC8vIGBfcnVuR2l0YCByZXR1cm5zIHVuZGVmaW5lZCBvbiBub24temVybyBleGl0LCBzbyBgIT09IHVuZGVmaW5lZGAgaXMgdGhlIGV4aXN0ZW5jZSBzaWduYWwuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Nob3ctcmVmJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCBgcmVmcy9oZWFkcy8ke2JyYW5jaE5hbWV9YF0pO1xuXHRcdHJldHVybiBvdXRwdXQgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGhhc1VuY29tbWl0dGVkQ2hhbmdlcyh3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydzdGF0dXMnLCAnLS1wb3JjZWxhaW4nXSk7XG5cdFx0cmV0dXJuICEhb3V0cHV0ICYmIG91dHB1dC50cmltKCkubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIGNvbW1pdEFsbCh3b3JraW5nRGlyZWN0b3J5OiBVUkksIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ2FkZCcsICctQScsICctLScsICc6LyddLCB7IHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydjb21taXQnLCAnLS1uby12ZXJpZnknLCAnLW0nLCBtZXNzYWdlXSwgeyB0aW1lb3V0OiA2MF8wMDAsIHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIHJlc3RvcmUod29ya2luZ0RpcmVjdG9yeTogVVJJLCBwYXRoczogcmVhZG9ubHkgc3RyaW5nW10sIG9wdGlvbnM/OiB7IHJlYWRvbmx5IHN0YWdlZD86IGJvb2xlYW47IHJlYWRvbmx5IHJlZj86IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXJncyA9IFsncmVzdG9yZSddO1xuXG5cdFx0aWYgKG9wdGlvbnM/LnN0YWdlZCkge1xuXHRcdFx0YXJncy5wdXNoKCctLXN0YWdlZCcpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5yZWYpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1zb3VyY2UnLCBvcHRpb25zLnJlZik7XG5cdFx0fVxuXG5cdFx0aWYgKHBhdGhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cGF0aHMgPSBbJy4nXTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWy4uLmFyZ3MsICctLScsIC4uLnBhdGhzXSwgeyB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyBoYXNVcHN0cmVhbSh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGJyYW5jaE5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3Jldi1wYXJzZScsICctLWFiYnJldi1yZWYnLCBgJHticmFuY2hOYW1lfUB7dXBzdHJlYW19YF0pO1xuXHRcdHJldHVybiBvdXRwdXQgIT09IHVuZGVmaW5lZCAmJiBvdXRwdXQudHJpbSgpLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRhc3luYyBwdWxsKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgb3B0aW9ucz86IElQdWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBbJ3B1bGwnXTtcblxuXHRcdGlmIChvcHRpb25zPy5yZWJhc2UpIHtcblx0XHRcdGFyZ3MucHVzaCgnLXInKTtcblx0XHR9XG5cblx0XHQvLyBBIHJlZiBjYW4gb25seSBiZSBwYXNzZWQgYWxvbmdzaWRlIGFcblx0XHQvLyByZW1vdGU7IGRlZmF1bHQgdG8gYG9yaWdpbmAgd2hlbiBhIHJlZlxuXHRcdC8vIGlzIGdpdmVuIHdpdGhvdXQgb25lLlxuXHRcdGlmIChvcHRpb25zPy5yZW1vdGUgfHwgb3B0aW9ucz8ucmVmKSB7XG5cdFx0XHRhcmdzLnB1c2gob3B0aW9ucy5yZW1vdGUgPz8gJ29yaWdpbicpO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5yZWYpIHtcblx0XHRcdFx0YXJncy5wdXNoKG9wdGlvbnMucmVmKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgYXJncywgeyB0aW1lb3V0OiAxODBfMDAwLCB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyBwdXNoKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgb3B0aW9ucz86IElQdXNoT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBbJ3B1c2gnXTtcblxuXHRcdGlmIChvcHRpb25zPy5zZXRVcHN0cmVhbSkge1xuXHRcdFx0YXJncy5wdXNoKCctLXNldC11cHN0cmVhbScpO1xuXHRcdH1cblxuXHRcdC8vIEEgcmVmIGNhbiBvbmx5IGJlIHBhc3NlZCBhbG9uZ3NpZGUgYVxuXHRcdC8vIHJlbW90ZTsgZGVmYXVsdCB0byBgb3JpZ2luYCB3aGVuIGEgcmVmXG5cdFx0Ly8gaXMgZ2l2ZW4gd2l0aG91dCBvbmUuXG5cdFx0aWYgKG9wdGlvbnM/LnJlbW90ZSB8fCBvcHRpb25zPy5yZWYpIHtcblx0XHRcdGFyZ3MucHVzaChvcHRpb25zLnJlbW90ZSA/PyAnb3JpZ2luJyk7XG5cblx0XHRcdGlmIChvcHRpb25zLnJlZikge1xuXHRcdFx0XHRhcmdzLnB1c2gob3B0aW9ucy5yZWYpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBhcmdzLCB7IHRpbWVvdXQ6IDE4MF8wMDAsIHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgb3B0aW9uczogSUNvbXB1dGVTZXNzaW9uRmlsZURpZmZzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gQWxsIGdpdCBpbnZvY2F0aW9ucyBydW4gZnJvbSB0aGUgd29ya2luZyB0cmVlJ3MgcmVwb3NpdG9yeSByb290IHNvXG5cdFx0Ly8gYC0tcmF3YCBwYXRocyBhcmUgcmVwby1yZWxhdGl2ZSBcdTIwMTQgdGhhdCdzIHdoYXQgYGdpdCBzaG93IDxzaGE+OjxwYXRoPmBcblx0XHQvLyBleHBlY3RzIHdoZW4gd2UgcmVzb2x2ZSBgZ2l0LWJsb2I6YCBVUklzIGxhdGVyLlxuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIG1lcmdlLWJhc2UgY29tbWl0IHRoZSBCcmFuY2ggQ2hhbmdlcyBkaWZmIGlzIGFuY2hvcmVkIG9uLlxuXHRcdGNvbnN0IG1lcmdlQmFzZUNvbW1pdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVCcmFuY2hNZXJnZUJhc2VDb21taXQocmVwb3NpdG9yeVJvb3QsIG9wdGlvbnMuYmFzZUJyYW5jaCk7XG5cblx0XHQvLyBEZXRlY3Qgd2hldGhlciB0aGUgd29ya2luZyB0cmVlIGhhcyBhbnkgdW50cmFja2VkIGZpbGVzLiBJZiBzbyB3ZVxuXHRcdC8vIGhhdmUgdG8gdXNlIHRoZSB0ZW1wLWluZGV4IHRyaWNrIHNvIHRoZSB1bnRyYWNrZWQgY29udGVudCBpc1xuXHRcdC8vIGluY2x1ZGVkIGluIGAtLWNhY2hlZCAtLXJhd2Agb3V0cHV0OyBvdGhlcndpc2UgYSBwbGFpbiBgZ2l0IGRpZmZgXG5cdFx0Ly8gaXMgc3VmZmljaWVudCBhbmQgYXZvaWRzIHRoZSB0ZW1wLWRpciBvdmVyaGVhZC5cblx0XHRjb25zdCBzdGF0dXNPdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnc3RhdHVzJywgJy0tcG9yY2VsYWluPXYxJywgJy16JywgJy0tdW50cmFja2VkLWZpbGVzPWFsbCddKTtcblx0XHRpZiAoc3RhdHVzT3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGhhc1VudHJhY2tlZCA9IHBhcnNlVW50cmFja2VkUGF0aHMoc3RhdHVzT3V0KS5sZW5ndGggPiAwO1xuXG5cdFx0bGV0IHJhd0RpZmZPdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWhhc1VudHJhY2tlZCkge1xuXHRcdFx0cmF3RGlmZk91dHB1dCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydkaWZmJywgJy0tcmF3JywgJy0tbnVtc3RhdCcsICctLWRpZmYtZmlsdGVyPUFETVInLCAnLXonLCBtZXJnZUJhc2VDb21taXQsICctLSddKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY2hhbmdlZFBhdGhzID0gcGFyc2VDaGFuZ2VkUGF0aHMoc3RhdHVzT3V0KTtcblx0XHRcdHJhd0RpZmZPdXRwdXQgPSBhd2FpdCB0aGlzLl9ydW5XaXRoVGVtcEluZGV4KHJlcG9zaXRvcnlSb290LCBtZXJnZUJhc2VDb21taXQsIGNoYW5nZWRQYXRocyk7XG5cdFx0fVxuXG5cdFx0aWYgKHJhd0RpZmZPdXRwdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyc2VHaXREaWZmUmF3TnVtc3RhdChyYXdEaWZmT3V0cHV0LCByZXBvc2l0b3J5Um9vdCwgb3B0aW9ucy5zZXNzaW9uVXJpLCBtZXJnZUJhc2VDb21taXQpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgYmFzZUJyYW5jaD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVCcmFuY2hNZXJnZUJhc2VDb21taXQocmVwb3NpdG9yeVJvb3QsIGJhc2VCcmFuY2gpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBtZXJnZS1iYXNlIGNvbW1pdC1pc2ggdGhlIEJyYW5jaCBDaGFuZ2VzIGJhc2VsaW5lIGlzIGFuY2hvcmVkXG5cdCAqIG9uLiBXaXRoIGEgYmFzZSBicmFuY2gsIHByZWZlcnMgdGhlIGNvcnJlc3BvbmRpbmcgYG9yaWdpbi88YmFzZT5gXG5cdCAqIHJlbW90ZS10cmFja2luZyByZWYgd2hlbiBpdCBleGlzdHMgc28gYnJhbmNoIGNoYW5nZXMgbWF0Y2ggYSBQUi1zdHlsZVxuXHQgKiBjb21wYXJpc29uIGV2ZW4gaWYgdGhlIGxvY2FsIGJhc2UgYnJhbmNoIGlzIHN0YWxlLiBXaXRob3V0IGEgdXNhYmxlIGJhc2UsXG5cdCAqIGZhbGxzIGJhY2sgdG8gYEhFQURgIChzdXJmYWNlcyB1bmNvbW1pdHRlZCB3b3JrIGJ1dCBubyBjb21taXR0ZWQtb24tYnJhbmNoXG5cdCAqIHdvcmspLiBGb3IgZW1wdHkgcmVwb3Mgd2l0aCBubyBgSEVBRGAsIGZhbGxzIGJhY2sgdG8gdGhlIGVtcHR5LXRyZWUgb2JqZWN0LlxuXHQgKiBBbHdheXMgcmVzb2x2ZXMgdG8gYSBjb21taXQtaXNoIChuZXZlciBgdW5kZWZpbmVkYCkgb25jZSB0aGUgcmVwb3NpdG9yeVxuXHQgKiByb290IGlzIGtub3duLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUJyYW5jaE1lcmdlQmFzZUNvbW1pdChyZXBvc2l0b3J5Um9vdDogVVJJLCBiYXNlQnJhbmNoPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRsZXQgbWVyZ2VCYXNlQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGJhc2VCcmFuY2gpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQmFzZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZW1vdGVUcmFja2luZ0JyYW5jaChyZXBvc2l0b3J5Um9vdCwgYmFzZUJyYW5jaCkgPz8gYmFzZUJyYW5jaDtcblx0XHRcdG1lcmdlQmFzZUNvbW1pdCA9IChhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnbWVyZ2UtYmFzZScsICdIRUFEJywgcmVzb2x2ZWRCYXNlXSkpPy50cmltKCk7XG5cdFx0fVxuXHRcdGlmICghbWVyZ2VCYXNlQ29tbWl0KSB7XG5cdFx0XHRtZXJnZUJhc2VDb21taXQgPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Jldi1wYXJzZScsICdIRUFEJ10pKT8udHJpbSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtZXJnZUJhc2VDb21taXQgPz8gRU1QVFlfVFJFRV9PQkpFQ1Q7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5XaXRoVGVtcEluZGV4KHJlcG9zaXRvcnlSb290OiBVUkksIG1lcmdlQmFzZUNvbW1pdDogc3RyaW5nLCBjaGFuZ2VkUGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBCdWlsZCBhIHRocm93YXdheSBpbmRleCBzbyB3ZSBjYW4gc3RhZ2UgdGhlIGNoYW5nZWQgd29ya2luZyB0cmVlXG5cdFx0Ly8gcGF0aHMgKGluY2x1ZGluZyB1bnRyYWNrZWQgZmlsZXMpIHdpdGhvdXQgZGlzdHVyYmluZyB0aGUgdXNlcidzIHJlYWxcblx0XHQvLyBpbmRleC4gYHJlYWQtdHJlZSBIRUFEYCBzZWVkcyBpdDsgaW4gZW1wdHkgcmVwb3MgdGhhdCBmYWlscyBzbyB3ZVxuXHRcdC8vIGZhbGwgYmFjayB0byB0aGUgZW1wdHkgdHJlZSwgbGVhdmluZyBldmVyeXRoaW5nIGFzIFwiYWRkZWRcIi5cblx0XHRjb25zdCB0ZW1wRGlyID0gVVJJLmpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS50bXBEaXIsIGBhZ2VudC1ob3N0LWdpdC1kaWZmLSR7Z2VuZXJhdGVVdWlkKCl9YCk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHRlbXBEaXIpO1xuXHRcdC8vIGBHSVRfSU5ERVhfRklMRWAgaXMgY29uc3VtZWQgYnkgdGhlIGBnaXRgIHN1YnByb2Nlc3Mgc28gaXQgbXVzdCBiZVxuXHRcdC8vIGEgcmVhbCBPUyBwYXRoIHN0cmluZywgbm90IGEgVVJJLlxuXHRcdGNvbnN0IGluZGV4RmlsZSA9IFVSSS5qb2luUGF0aCh0ZW1wRGlyLCAnaW5kZXgnKS5mc1BhdGg7XG5cdFx0Y29uc3QgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBHSVRfSU5ERVhfRklMRTogaW5kZXhGaWxlIH07XG5cdFx0Ly8gR1ZGUyAoVmlydHVhbCBGaWxlIFN5c3RlbSkgcmVwb3MgdXNlIGEgaG9vayB0aGF0IGFjcXVpcmVzIGEgbG9jayBhcm91bmRcblx0XHQvLyBnaXQgY29tbWFuZHMuIFNldHRpbmcgQ09NTUFORF9IT09LX0xPQ0s9MSBwcmV2ZW50cyB0aGUgdGVtcC1pbmRleFxuXHRcdC8vIG9wZXJhdGlvbnMgZnJvbSBibG9ja2luZyB0aGUgbWFpbiB3b3JraW5nLXRyZWUgbG9jay4gVGhpcyBtaXJyb3JzIHdoYXRcblx0XHQvLyB0aGUgZXh0ZW5zaW9uJ3MgYGJ1aWxkVGVtcEluZGV4RW52YCBkb2VzIGZvciB0aGUgc2FtZSByZWFzb24uXG5cdFx0ZW52LkNPTU1BTkRfSE9PS19MT0NLID0gJzEnO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZWVkZWQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsncmVhZC10cmVlJywgJ0hFQUQnXSwgeyBlbnYgfSk7XG5cdFx0XHRpZiAoc2VlZGVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gRW1wdHkgcmVwbyAobm8gSEVBRCB5ZXQpIC0gYHJlYWQtdHJlZWAgb2YgdGhlIGVtcHR5IHRyZWUgYWx3YXlzIHN1Y2NlZWRzLlxuXHRcdFx0XHRhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsncmVhZC10cmVlJywgRU1QVFlfVFJFRV9PQkpFQ1RdLCB7IGVudiB9KTtcblx0XHRcdH1cblx0XHRcdGlmICghKGF3YWl0IHRoaXMuX3N0YWdlQ2hhbmdlZFBhdGhzKHJlcG9zaXRvcnlSb290LCB0ZW1wRGlyLCBjaGFuZ2VkUGF0aHMsIGVudikpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2RpZmYnLCAnLS1jYWNoZWQnLCAnLS1yYXcnLCAnLS1udW1zdGF0JywgJy0tZGlmZi1maWx0ZXI9QURNUicsICcteicsIG1lcmdlQmFzZUNvbW1pdCwgJy0tJ10sIHsgZW52IH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkgeyBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwodGVtcERpciwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0ICovIH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFnZUNoYW5nZWRQYXRocyhyZXBvc2l0b3J5Um9vdDogVVJJLCB0ZW1wRGlyOiBVUkksIGNoYW5nZWRQYXRoczogcmVhZG9ubHkgc3RyaW5nW10sIGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChjaGFuZ2VkUGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgcGF0aHNwZWNGaWxlID0gVVJJLmpvaW5QYXRoKHRlbXBEaXIsICdwYXRoc3BlYycpO1xuXHRcdC8vIFN0YWdlIG9ubHkgdGhlIHBhdGhzIGBnaXQgc3RhdHVzYCByZXBvcnRlZCBhcyBjaGFuZ2VkLiBUaGUgcHJldmlvdXNcblx0XHQvLyBmdWxsLXJlcG8gYGdpdCBhZGQgLUEgLS0gOi9gIHdhbGtlZCBuZXN0ZWQgcmVwb3Mvd29ya3RyZWVzIGFuZCBsYXJnZVxuXHRcdC8vIGNoZWNrb3V0cywgd2hpY2ggbWFkZSB0ZW1wLWluZGV4IGRpZmZpbmcgc2xvdyBhbmQgdGltZW91dC1wcm9uZS4gQVxuXHRcdC8vIE5VTC1zZXBhcmF0ZWQgcGF0aHNwZWMgcHJlc2VydmVzIG9kZCBmaWxlbmFtZXMgd2hpbGUga2VlcGluZyBkZWxldGVzXG5cdFx0Ly8gYW5kIHJlbmFtZS9jb3B5IHNvdXJjZXMgaW4gc2NvcGUuXG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBhdGhzcGVjRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjaGFuZ2VkUGF0aHMuam9pbignXFx4MDAnKSArICdcXHgwMCcpKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbYWdlbnRIb3N0R2l0U2VydmljZV0gU3RhZ2luZyAke2NoYW5nZWRQYXRocy5sZW5ndGh9IGNoYW5nZWQgcGF0aChzKSBpbnRvIHRlbXAgaW5kZXhgKTtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2FkZCcsICctQScsIGAtLXBhdGhzcGVjLWZyb20tZmlsZT0ke3BhdGhzcGVjRmlsZS5mc1BhdGh9YCwgJy0tcGF0aHNwZWMtZmlsZS1udWwnXSwge1xuXHRcdFx0ZW52OiB7IC4uLmVudiwgR0lUX0xJVEVSQUxfUEFUSFNQRUNTOiAnMScgfSxcblx0XHR9KSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJlbW90ZVRyYWNraW5nQnJhbmNoKHJlcG9zaXRvcnlSb290OiBVUkksIGJyYW5jaDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZW1vdGVCcmFuY2ggPSBgb3JpZ2luLyR7YnJhbmNofWA7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Nob3ctcmVmJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCBgcmVmcy9yZW1vdGVzLyR7cmVtb3RlQnJhbmNofWBdKTtcblx0XHRyZXR1cm4gb3V0cHV0ICE9PSB1bmRlZmluZWQgPyByZW1vdGVCcmFuY2ggOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGdpdC1pZ25vcmVkIHBhdGhzIHRvIGNvcHkgaW50byBhIHdvcmt0cmVlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0V29ya3RyZWVJbmNsdWRlUGF0aHMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgd29ya3RyZWVSb290OiBVUkksIGdsb2JzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8SVdvcmt0cmVlSW5jbHVkZUVudHJ5W10+IHtcblx0XHRpZiAoZ2xvYnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gTGlzdCB0aGUgZ2l0LWlnbm9yZWQgKGJ1dCB1bnRyYWNrZWQpIGZpbGVzOiBgLS1vdGhlcnNgIHNlbGVjdHNcblx0XHQvLyB1bnRyYWNrZWQgZmlsZXMsIGAtLWlnbm9yZWRgIHJlc3RyaWN0cyB0byB0aG9zZSBtYXRjaGVkIGJ5IGFuIGV4Y2x1ZGVcblx0XHQvLyBzb3VyY2UsIGFuZCBgLS1leGNsdWRlLXN0YW5kYXJkYCB1c2VzIHRoZSBzdGFuZGFyZCBzb3VyY2VzICguZ2l0aWdub3JlLFxuXHRcdC8vIC5naXQvaW5mby9leGNsdWRlLCBjb3JlLmV4Y2x1ZGVzRmlsZSkuIGAtemAgTlVMLXNlcGFyYXRlcyBlbnRyaWVzIHNvXG5cdFx0Ly8gcGF0aHMgY29udGFpbmluZyBzcGFjZXMgb3Igb3RoZXIgc3BlY2lhbCBjaGFyYWN0ZXJzIHN1cnZpdmUgaW50YWN0LlxuXHRcdC8vXG5cdFx0Ly8gVGhlIGAtLWRpcmVjdG9yeWAgdmFyaWFudCBhZGRpdGlvbmFsbHkgY29sbGFwc2VzIGEgKndob2xseSotaWdub3JlZFxuXHRcdC8vIGRpcmVjdG9yeSAob25lIGNvbnRhaW5pbmcgbm8gdHJhY2tlZCBmaWxlcykgaW50byBhIHNpbmdsZSBgZGlyL2Bcblx0XHQvLyBlbnRyeS4gSXQgaXMgZW51bWVyYXRlZCBpbiBwYXJhbGxlbCBhbmQgdXNlZCBiZWxvdyB0byBjb3B5IHN1Y2hcblx0XHQvLyBkaXJlY3RvcmllcyBhcyBvbmUgcmVjdXJzaXZlIHVuaXQgcmF0aGVyIHRoYW4gZmlsZS1ieS1maWxlLlxuXHRcdGNvbnN0IGJhc2VBcmdzID0gWydscy1maWxlcycsICctLW90aGVycycsICctLWlnbm9yZWQnLCAnLS1leGNsdWRlLXN0YW5kYXJkJywgJy16J107XG5cdFx0Y29uc3QgW2ZpbGVzT3V0cHV0LCBkaXJlY3RvcnlPdXRwdXQsIHdvcmt0cmVlT3V0cHV0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgYmFzZUFyZ3MsIHsgdGltZW91dDogNjBfMDAwIH0pLFxuXHRcdFx0dGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbLi4uYmFzZUFyZ3MsICctLWRpcmVjdG9yeScsICctLW5vLWVtcHR5LWRpcmVjdG9yeSddLCB7IHRpbWVvdXQ6IDYwXzAwMCB9KSxcblx0XHRcdHRoaXMuX3J1bkdpdCh3b3JrdHJlZVJvb3QsIFsnbHMtZmlsZXMnLCAnLXonXSwgeyB0aW1lb3V0OiA2MF8wMDAgfSksXG5cdFx0XSk7XG5cdFx0aWYgKCFmaWxlc091dHB1dCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIGdpdCBlbWl0cyByZXBvc2l0b3J5LXJlbGF0aXZlLCBmb3J3YXJkLXNsYXNoIHBhdGhzLlxuXHRcdGNvbnN0IGlnbm9yZWRGaWxlcyA9IGZpbGVzT3V0cHV0LnNwbGl0KCdcXHgwMCcpLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5sZW5ndGggPiAwKTtcblx0XHRpZiAoaWdub3JlZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgb25seSB0aGUgaWdub3JlZCBmaWxlcyB0aGF0IG1hdGNoIG9uZSBvZiB0aGUgY29uZmlndXJlZFxuXHRcdC8vIGBnaXQud29ya3RyZWVJbmNsdWRlRmlsZXNgIGdsb2IgcGF0dGVybnMgKFZTIENvZGUgZ2xvYiBzZW1hbnRpY3MpLFxuXHRcdC8vIGFuZCBcdTIwMTQgaW4gdGhlIHNhbWUgcGFzcyBcdTIwMTQgdGFsbHkgd2hpY2ggd2hvbGx5LWlnbm9yZWQgZGlyZWN0b3JpZXNcblx0XHQvLyBjb250YWluIGFuIGlnbm9yZWQgZmlsZSB0aGF0IGNhbm5vdCBiZSBjb3BpZWQgKGFuZCB0aGVyZWZvcmUgY2Fubm90IGJlXG5cdFx0Ly8gY29sbGFwc2VkKS4gYGdpdCBscy1maWxlcyAtLWRpcmVjdG9yeWAgcmVwb3J0cyBhIHdob2xseS1pZ25vcmVkXG5cdFx0Ly8gZGlyZWN0b3J5IGFzIGEgc2luZ2xlIGBkaXIvYCBlbnRyeSBhbmQgbmV2ZXIgbmVzdHMgdGhlc2UgZW50cmllc1xuXHRcdC8vIChpdCBzdG9wcyBkZXNjZW5kaW5nIG9uY2UgYSBkaXJlY3RvcnkgaXMgd2hvbGx5IGlnbm9yZWQpLCBzbyBlYWNoXG5cdFx0Ly8gZmlsZSBoYXMgYXQgbW9zdCBvbmUgY29udGFpbmluZyBkaXJlY3RvcnkgYW5kIG5vIGRlLWR1cGxpY2F0aW9uIG9mXG5cdFx0Ly8gdGhlIGRpcmVjdG9yeSBzZXQgaXMgcmVxdWlyZWQuXG5cdFx0Y29uc3QgbWF0Y2hlcnMgPSBnbG9icy5tYXAocGF0dGVybiA9PiBwYXJzZShwYXR0ZXJuKSk7XG5cdFx0Y29uc3Qgd2hvbGVEaXJlY3RvcmllcyA9IG5ldyBTZXQoKGRpcmVjdG9yeU91dHB1dCA/PyAnJylcblx0XHRcdC5zcGxpdCgnXFx4MDAnKS5maWx0ZXIoZW50cnkgPT4gZW50cnkuZW5kc1dpdGgoJy8nKSkpO1xuXHRcdGNvbnN0IHdvcmt0cmVlRmlsZXMgPSBuZXcgU2V0KCh3b3JrdHJlZU91dHB1dCA/PyAnJylcblx0XHRcdC5zcGxpdCgnXFx4MDAnKS5maWx0ZXIoZW50cnkgPT4gZW50cnkubGVuZ3RoID4gMCkpO1xuXG5cdFx0Ly8gRXZlcnkgYW5jZXN0b3IgZGlyZWN0b3J5IG9mIGEgdHJhY2tlZCBwYXRoLCB3aXRoIHRoZSB0cmFpbGluZyBgL2AgdXNlZFxuXHRcdC8vIGJ5IGBnaXQgbHMtZmlsZXMgLS1kaXJlY3RvcnlgLCBzbyBhIHNvdXJjZSBwYXRoIGNhbiBiZSBjaGVja2VkIGFnYWluc3Rcblx0XHQvLyB0aGUgc2hhcGUgKGZpbGUgdnMgZGlyZWN0b3J5KSBvZiBpdHMgZGVzdGluYXRpb24uXG5cdFx0Y29uc3Qgd29ya3RyZWVEaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiB3b3JrdHJlZUZpbGVzKSB7XG5cdFx0XHRsZXQgaW5kZXggPSBmaWxlLmluZGV4T2YoJy8nKTtcblx0XHRcdHdoaWxlIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0d29ya3RyZWVEaXJlY3Rvcmllcy5hZGQoZmlsZS5zbGljZSgwLCBpbmRleCArIDEpKTtcblx0XHRcdFx0aW5kZXggPSBmaWxlLmluZGV4T2YoJy8nLCBpbmRleCArIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZWRGaWxlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBub25Db2xsYXBzaWJsZURpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGlnbm9yZWRGaWxlcykge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRtYXRjaGVycy5zb21lKG1hdGNoZXIgPT4gbWF0Y2hlcihmaWxlKSkgJiZcblx0XHRcdFx0IWhhc1dvcmt0cmVlUGF0aENvbGxpc2lvbihmaWxlLCB3b3JrdHJlZUZpbGVzLCB3b3JrdHJlZURpcmVjdG9yaWVzKVxuXHRcdFx0KSB7XG5cdFx0XHRcdG1hdGNoZWRGaWxlcy5wdXNoKGZpbGUpO1xuXHRcdFx0fSBlbHNlIGlmICh3aG9sZURpcmVjdG9yaWVzLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5pbmdEaXJlY3RvcnkgPSBmaW5kQ29udGFpbmluZ0RpcmVjdG9yeShmaWxlLCB3aG9sZURpcmVjdG9yaWVzKTtcblx0XHRcdFx0aWYgKGNvbnRhaW5pbmdEaXJlY3RvcnkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG5vbkNvbGxhcHNpYmxlRGlyZWN0b3JpZXMuYWRkKGNvbnRhaW5pbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1hdGNoZWRGaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBDb2xsYXBzZSBtYXRjaGVkIGZpbGVzIGludG8gdGhlaXIgY29udGFpbmluZyBkaXJlY3Rvcnkgd2hlbiB0aGUgd2hvbGVcblx0XHQvLyBkaXJlY3RvcnkgY2FuIGJlIGNvcGllZCBhcyBhIHNpbmdsZSByZWN1cnNpdmUgdW5pdCBcdTIwMTQgaS5lLiBpdCBpc1xuXHRcdC8vIHdob2xseSBpZ25vcmVkIChzbyBpdCBoYXMgbm8gdHJhY2tlZCBmaWxlcyBhIHJlY3Vyc2l2ZSBjb3B5IHdvdWxkXG5cdFx0Ly8gY2xvYmJlcikgYW5kIGV2ZXJ5IGlnbm9yZWQgZmlsZSBpdCBjb250YWlucyBtYXRjaGVkIGEgZ2xvYiAoc29cblx0XHQvLyBub3RoaW5nIHVud2FudGVkIGlzIGNvcGllZCwgdHJhY2tlZCBieSBgbm9uQ29sbGFwc2libGVEaXJlY3Rvcmllc2AgYWJvdmUpLlxuXHRcdC8vIFRoaXMgdHVybnMgYSBsYXJnZSB0cmVlIHN1Y2ggYXMgYG5vZGVfbW9kdWxlcy9gIGludG8gb25lIGNvcHkgaW5zdGVhZFxuXHRcdC8vIG9mIG9uZSBwZXIgZmlsZSwgd2hpbGUgYSBwYXJ0aWFsbHktbWF0Y2hlZCBvciBwYXJ0aWFsbHktdHJhY2tlZFxuXHRcdC8vIGRpcmVjdG9yeSBmYWxscyBiYWNrIHRvIGl0cyBpbmRpdmlkdWFsIG1hdGNoZWQgZmlsZXMuIGAtLWRpcmVjdG9yeWBcblx0XHQvLyB3aXRoIGAtLW5vLWVtcHR5LWRpcmVjdG9yeWAgbmV2ZXIgcmVwb3J0cyBhbiBlbXB0eSBkaXJlY3RvcnksIHNvIGV2ZXJ5XG5cdFx0Ly8gZW50cnkgaW4gYHdob2xlRGlyZWN0b3JpZXNgIGlzIGtub3duIHRvIGNvbnRhaW4gYXQgbGVhc3Qgb25lIGlnbm9yZWQgZmlsZS5cblx0XHRjb25zdCBjb2xsYXBzZWREaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZGlyIG9mIHdob2xlRGlyZWN0b3JpZXMpIHtcblx0XHRcdGlmICghbm9uQ29sbGFwc2libGVEaXJlY3Rvcmllcy5oYXMoZGlyKSkge1xuXHRcdFx0XHRjb2xsYXBzZWREaXJlY3Rvcmllcy5hZGQoZGlyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdG9Xb3JrdHJlZUluY2x1ZGVFbnRyaWVzKHJlcG9zaXRvcnlSb290LCBtYXRjaGVkRmlsZXMsIGNvbGxhcHNlZERpcmVjdG9yaWVzKTtcblx0fVxuXG5cdGFzeW5jIHNob3dCbG9iKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgcmVmOiBzdHJpbmcsIHJlcG9SZWxhdGl2ZVBhdGg6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBgZ2l0IHNob3dgIGV4aXRzIG5vbi16ZXJvIHdoZW4gdGhlIHBhdGggZGlkbid0IGV4aXN0IGF0IHRoYXRcblx0XHQvLyByZWY7IGBfcnVuR2l0YCBzd2FsbG93cyB0aGF0IGludG8gYHVuZGVmaW5lZGAgd2hpY2ggaXMgZXhhY3RseVxuXHRcdC8vIHRoZSBjb250cmFjdCBjYWxsZXJzIHdhbnQuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRjcC5leGVjRmlsZSgnZ2l0JywgWydzaG93JywgYCR7cmVmfToke3JlcG9SZWxhdGl2ZVBhdGh9YF0sIHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgdGltZW91dDogNTAwMCwgZW5jb2Rpbmc6ICdidWZmZXInLCBtYXhCdWZmZXI6IDMyICogMTAyNCAqIDEwMjQgfSwgKGVycm9yLCBzdGRvdXQpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKFZTQnVmZmVyLndyYXAoc3Rkb3V0IGFzIEJ1ZmZlcikpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxJU2Vzc2lvbkdpdFN0YXRlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeSk7XG5cdH1cblxuXHRhc3luYyBnZXRGZXRjaFJlbW90ZVVybHMod29ya2luZ0RpcmVjdG9yeTogVVJJLCBwcmVmZXJyZWRSZW1vdGU/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZUZldGNoUmVtb3RlVXJscyhhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsncmVtb3RlJywgJy12J10pLCBwcmVmZXJyZWRSZW1vdGUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VW50cmFja2VkUGF0aHMod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0dXMgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnc3RhdHVzJywgJy0tcG9yY2VsYWluPXYxJywgJy16JywgJy0tdW50cmFja2VkLWZpbGVzPWFsbCddKTtcblx0XHRyZXR1cm4gc3RhdHVzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBwYXJzZVVudHJhY2tlZFBhdGhzKHN0YXR1cyk7XG5cdH1cblxuXHRhc3luYyBjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNPdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnc3RhdHVzJywgJy0tcG9yY2VsYWluPXYxJywgJy16JywgJy0tdW50cmFja2VkLWZpbGVzPWFsbCddKTtcblx0XHRpZiAoc3RhdHVzT3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYW5nZWRQYXRocyA9IHBhcnNlQ2hhbmdlZFBhdGhzKHN0YXR1c091dCk7XG5cdFx0Y29uc3QgdGVtcERpciA9IFVSSS5qb2luUGF0aCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudG1wRGlyLCBgYWdlbnQtaG9zdC1jaGVja3BvaW50LSR7Z2VuZXJhdGVVdWlkKCl9YCk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHRlbXBEaXIpO1xuXHRcdGNvbnN0IGluZGV4RmlsZSA9IFVSSS5qb2luUGF0aCh0ZW1wRGlyLCAnaW5kZXgnKS5mc1BhdGg7XG5cdFx0Y29uc3QgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBHSVRfSU5ERVhfRklMRTogaW5kZXhGaWxlLCBDT01NQU5EX0hPT0tfTE9DSzogJzEnIH07XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNlZWQgdGhlIHRlbXAgaW5kZXggZnJvbSBIRUFEOyBmb3IgZW1wdHkgcmVwb3Mgc2VlZCBmcm9tIHRoZSBlbXB0eSB0cmVlLlxuXHRcdFx0Y29uc3Qgc2VlZGVkID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3JlYWQtdHJlZScsICdIRUFEJ10sIHsgZW52IH0pO1xuXHRcdFx0aWYgKHNlZWRlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZWFkLXRyZWUnLCBFTVBUWV9UUkVFX09CSkVDVF0sIHsgZW52IH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fc3RhZ2VDaGFuZ2VkUGF0aHMocmVwb3NpdG9yeVJvb3QsIHRlbXBEaXIsIGNoYW5nZWRQYXRocywgZW52KSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRyZWUgPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3dyaXRlLXRyZWUnXSwgeyBlbnYgfSkpPy50cmltKCk7XG5cdFx0XHRyZXR1cm4gdHJlZSB8fCB1bmRlZmluZWQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbCh0ZW1wRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2g6IGZhbHNlIH0pOyB9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgKi8gfVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvbW1pdFRyZWUocmVwb3NpdG9yeVJvb3Q6IFVSSSwgdHJlZU9pZDogc3RyaW5nLCBwYXJlbnRPaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gWydjb21taXQtdHJlZScsIHRyZWVPaWRdO1xuXHRcdGlmIChwYXJlbnRPaWQpIHtcblx0XHRcdGFyZ3MucHVzaCgnLXAnLCBwYXJlbnRPaWQpO1xuXHRcdH1cblx0XHRhcmdzLnB1c2goJy1tJywgbWVzc2FnZSk7XG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBhcmdzLCB7IHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gb3V0Py50cmltKCkgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUmVmKHJlcG9zaXRvcnlSb290OiBVUkksIHJlZjogc3RyaW5nLCBuZXdPaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWyd1cGRhdGUtcmVmJywgcmVmLCBuZXdPaWRdLCB7IHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVJlZnMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgcmVmczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVXNlIGB1cGRhdGUtcmVmIC0tc3RkaW4gLXpgIHNvIGFsbCBkZWxldGlvbnMgZ28gdGhyb3VnaCBhIHNpbmdsZSBnaXRcblx0XHQvLyBpbnZvY2F0aW9uLiBFYWNoIGNvbW1hbmQgaXMgYGRlbGV0ZSBTUCA8cmVmPiBOVUwgWzxleHBlY3RlZF9vaWQ+XSBOVUxgO1xuXHRcdC8vIHdlIG9taXQgdGhlIGV4cGVjdGVkIG9pZCBzbyBhbHJlYWR5LW1pc3NpbmcgcmVmcyBkb24ndCBmYWlsIHRoZSBiYXRjaC5cblx0XHRjb25zdCBzdGRpbiA9IHJlZnMubWFwKHJlZiA9PiBgZGVsZXRlICR7cmVmfVxceDAwXFx4MDBgKS5qb2luKCcnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYyA9IGNwLmV4ZWNGaWxlKCdnaXQnLCBbJ3VwZGF0ZS1yZWYnLCAnLS1zdGRpbicsICcteiddLCB7IGN3ZDogcmVwb3NpdG9yeVJvb3QuZnNQYXRoLCB0aW1lb3V0OiAxMF8wMDAgfSwgKCkgPT4ge1xuXHRcdFx0XHQvLyBUb2xlcmF0ZSBub24temVybyBleGl0cyBcdTIwMTQgbWlzc2luZyByZWZzIGFyZSBub3QgZmF0YWwgZm9yIGNsZWFudXAuXG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0cHJvYy5zdGRpbj8uZW5kKHN0ZGluKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJldlBhcnNlKHJlcG9zaXRvcnlSb290OiBVUkksIGV4cHJlc3Npb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Jldi1wYXJzZScsICctLXZlcmlmeScsICctLXF1aWV0JywgZXhwcmVzc2lvbl0pO1xuXHRcdHJldHVybiBvdXQ/LnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBvdmVybGF5UGF0aEludG9UcmVlKHJlcG9zaXRvcnlSb290OiBVUkksIGJhc2VUcmVlT2lkOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgc291cmNlVHJlZU9pZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBCdWlsZCBhIHRocm93YXdheSBpbmRleCBzZWVkZWQgZnJvbSBgYmFzZVRyZWVPaWRgLCByZXBsYWNlL3JlbW92ZSB0aGVcblx0XHQvLyBzaW5nbGUgYHBhdGhgIHVzaW5nIGBzb3VyY2VUcmVlT2lkYCwgYW5kIHdyaXRlIHRoZSByZXN1bHQgYmFjayBvdXQgYXNcblx0XHQvLyBhIG5ldyB0cmVlLiBUaGUgdXNlcidzIHJlYWwgaW5kZXggaXMgbmV2ZXIgdG91Y2hlZCAobWlycm9ycyB0aGVcblx0XHQvLyB0ZW1wLWluZGV4IHRlY2huaXF1ZSB1c2VkIGJ5IGBjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWVgKS5cblx0XHRjb25zdCB0ZW1wRGlyID0gVVJJLmpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS50bXBEaXIsIGBhZ2VudC1ob3N0LXJldmlldy1vdmVybGF5LSR7Z2VuZXJhdGVVdWlkKCl9YCk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHRlbXBEaXIpO1xuXHRcdGNvbnN0IGluZGV4RmlsZSA9IFVSSS5qb2luUGF0aCh0ZW1wRGlyLCAnaW5kZXgnKS5mc1BhdGg7XG5cdFx0Y29uc3QgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBHSVRfSU5ERVhfRklMRTogaW5kZXhGaWxlLCBDT01NQU5EX0hPT0tfTE9DSzogJzEnIH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVhZFRyZWVPdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsncmVhZC10cmVlJywgYmFzZVRyZWVPaWRdLCB7IGVudiwgdGhyb3dPbkVycm9yOiBmYWxzZSB9KTtcblx0XHRcdGlmIChyZWFkVHJlZU91dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc29sdmUgdGhlIHNvdXJjZSBibG9iIChtb2RlICsgb2lkKSBmb3IgYHBhdGhgLiBgLXpgIGF2b2lkc1xuXHRcdFx0Ly8gcGF0aCBxdW90aW5nOyBhbiBlbXB0eSByZXN1bHQgbWVhbnMgdGhlIHBhdGggaXMgYWJzZW50IGluIHRoZVxuXHRcdFx0Ly8gc291cmNlIHRyZWUsIHNvIHRoZSBvdmVybGF5IHJlbW92ZXMgaXQgZnJvbSB0aGUgYmFzZS5cblx0XHRcdGNvbnN0IGxzVHJlZU91dCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydscy10cmVlJywgJy16Jywgc291cmNlVHJlZU9pZCwgJy0tJywgcGF0aF0sIHsgZW52IH0pO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBwYXJzZVNpbmdsZUxzVHJlZUVudHJ5KGxzVHJlZU91dCk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlSW5kZXhPdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsndXBkYXRlLWluZGV4JywgJy0tYWRkJywgJy0tY2FjaGVpbmZvJywgYCR7ZW50cnkubW9kZX0sJHtlbnRyeS5vaWR9LCR7cGF0aH1gXSwgeyBlbnYsIHRocm93T25FcnJvcjogZmFsc2UgfSk7XG5cdFx0XHRcdGlmICh1cGRhdGVJbmRleE91dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gYC0tZm9yY2UtcmVtb3ZlYCB0b2xlcmF0ZXMgdGhlIHBhdGggYWxyZWFkeSBiZWluZyBhYnNlbnQgZnJvbVxuXHRcdFx0XHQvLyB0aGUgaW5kZXgsIHNvIHJlbW92aW5nIGFuIHVudHJhY2tlZC9hZGRlZCBwYXRoIGlzIGEgbm8tb3AuXG5cdFx0XHRcdGNvbnN0IHVwZGF0ZUluZGV4T3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3VwZGF0ZS1pbmRleCcsICctLWZvcmNlLXJlbW92ZScsICctLScsIHBhdGhdLCB7IGVudiwgdGhyb3dPbkVycm9yOiBmYWxzZSB9KTtcblx0XHRcdFx0aWYgKHVwZGF0ZUluZGV4T3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdyaXRlVHJlZU91dCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWyd3cml0ZS10cmVlJ10sIHsgZW52IH0pO1xuXHRcdFx0cmV0dXJuIHdyaXRlVHJlZU91dD8udHJpbSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwodGVtcERpciwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSB9KTtcblx0XHRcdH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCAqLyB9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGlmZlRyZWVQYXRocyhyZXBvc2l0b3J5Um9vdDogVVJJLCBmcm9tVHJlZWlzaDogc3RyaW5nLCB0b1RyZWVpc2g6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnZGlmZicsICctLW5hbWUtb25seScsICctLW5vLXJlbmFtZXMnLCAnLXonLCBmcm9tVHJlZWlzaCwgdG9UcmVlaXNoLCAnLS0nXSk7XG5cdFx0aWYgKG91dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0LnNwbGl0KCdcXHgwMCcpLmZpbHRlcihCb29sZWFuKTtcblx0fVxuXG5cdGFzeW5jIGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIG9wdGlvbnM6IHsgcmVhZG9ubHkgc2Vzc2lvblVyaTogc3RyaW5nOyByZWFkb25seSBmcm9tUmVmOiBzdHJpbmc7IHJlYWRvbmx5IHRvUmVmOiBzdHJpbmcgfSk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydkaWZmJywgJy0tcmF3JywgJy0tbnVtc3RhdCcsICctLWRpZmYtZmlsdGVyPUFETVInLCAnLXonLCBvcHRpb25zLmZyb21SZWYsIG9wdGlvbnMudG9SZWYsICctLSddKTtcblx0XHRcdGlmIChyYXcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGFyc2VHaXREaWZmUmF3TnVtc3RhdChyYXcsIHJlcG9zaXRvcnlSb290LCBvcHRpb25zLnNlc3Npb25VcmksIG9wdGlvbnMuZnJvbVJlZiwgb3B0aW9ucy50b1JlZik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RHaXRTZXJ2aWNlXVtjb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnNdIEZhaWxlZCB0byBjb21wdXRlIGZpbGUgZGlmZnMgJHtyZXBvc2l0b3J5Um9vdC50b1N0cmluZygpfSwgJHtvcHRpb25zLmZyb21SZWZ9LCAke29wdGlvbnMudG9SZWZ9OiAke2Vycn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0QnJhbmNoRGlmZlNhZmV0eUluZm8od29ya2luZ0RpcmVjdG9yeTogVVJJLCBiYXNlbGluZUNvbW1pdDogc3RyaW5nKTogUHJvbWlzZTxJQnJhbmNoRGlmZlNhZmV0eUluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBbdmlydHVhbEZpbGVTeXN0ZW0sIHNwYXJzZUNoZWNrb3V0LCB0aW1lc3RhbXAsIGNvbW1pdENvdW50LCB3b3Jrc3BhY2VGaWxlc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnY29uZmlnJywgJy0tZ2V0JywgJ2NvcmUudmlydHVhbGZpbGVzeXN0ZW0nXSksXG5cdFx0XHR0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnY29uZmlnJywgJy0tZ2V0JywgJ2NvcmUuc3BhcnNlY2hlY2tvdXQnXSksXG5cdFx0XHR0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnc2hvdycsICctcycsICctLWZvcm1hdD0lY3QnLCBiYXNlbGluZUNvbW1pdF0pLFxuXHRcdFx0dGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Jldi1saXN0JywgJy0tY291bnQnLCBgJHtiYXNlbGluZUNvbW1pdH0uLkhFQURgXSksXG5cdFx0XHR0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnbHMtZmlsZXMnLCAnLS1jYWNoZWQnLCAnLS1vdGhlcnMnLCAnLS1leGNsdWRlLXN0YW5kYXJkJywgJy16J10pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNwYXJzZUNoZWNrb3V0RW5hYmxlZCA9IG5ldyBTZXQoWyd0cnVlJywgJ3llcycsICdvbicsICcxJ10pLmhhcyhzcGFyc2VDaGVja291dD8udHJpbSgpLnRvTG93ZXJDYXNlKCkgPz8gJycpO1xuXHRcdGNvbnN0IHRpbWVzdGFtcFNlY29uZHMgPSBOdW1iZXIodGltZXN0YW1wPy50cmltKCkpO1xuXHRcdGNvbnN0IHBhcnNlZENvbW1pdENvdW50ID0gTnVtYmVyKGNvbW1pdENvdW50Py50cmltKCkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRoYXNWaXJ0dWFsRmlsZVN5c3RlbTogQm9vbGVhbih2aXJ0dWFsRmlsZVN5c3RlbT8udHJpbSgpKSB8fCBzcGFyc2VDaGVja291dEVuYWJsZWQsXG5cdFx0XHRiYXNlbGluZUNvbW1pdFRpbWVzdGFtcDogTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcFNlY29uZHMpID8gdGltZXN0YW1wU2Vjb25kcyAqIDEwMDAgOiB1bmRlZmluZWQsXG5cdFx0XHRjb21taXRDb3VudDogTnVtYmVyLmlzRmluaXRlKHBhcnNlZENvbW1pdENvdW50KSA/IHBhcnNlZENvbW1pdENvdW50IDogdW5kZWZpbmVkLFxuXHRcdFx0d29ya3NwYWNlRmlsZUNvdW50OiB3b3Jrc3BhY2VGaWxlcz8uc3BsaXQoJ1xceDAwJykuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aCA/PyAwLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXREaWZmUGF0Y2hCZXR3ZWVuUmVmcyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIG9wdGlvbnM6IHsgcmVhZG9ubHkgZnJvbVJlZjogc3RyaW5nOyByZWFkb25seSB0b1JlZjogc3RyaW5nOyByZWFkb25seSBwYXRoczogcmVhZG9ubHkgc3RyaW5nW107IHJlYWRvbmx5IG1heEJ1ZmZlcjogbnVtYmVyIH0pOiBQcm9taXNlPHsgcmVhZG9ubHkgcGF0Y2g6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgdG9vTGFyZ2U6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwYXRocyA9IFsuLi5uZXcgU2V0KG9wdGlvbnMucGF0aHMpXTtcblx0XHRpZiAocGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBwYXRjaDogJycsIHRvb0xhcmdlOiBmYWxzZSB9O1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGF0Y2ggPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnZGlmZicsICctLXBhdGNoJywgJy0tbm8tZXh0LWRpZmYnLCAnLS1maW5kLXJlbmFtZXMnLCAnLS1kaWZmLWZpbHRlcj1BRE1SJywgb3B0aW9ucy5mcm9tUmVmLCBvcHRpb25zLnRvUmVmLCAnLS0nLCAuLi5wYXRoc10sIHsgbWF4QnVmZmVyOiBvcHRpb25zLm1heEJ1ZmZlciwgdGhyb3dPbkVycm9yOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIHBhdGNoID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7IHBhdGNoLCB0b29MYXJnZTogZmFsc2UgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzTWF4QnVmZmVyRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybiB7IHBhdGNoOiB1bmRlZmluZWQsIHRvb0xhcmdlOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlU2Vzc2lvbkdpdFN0YXRlKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8SVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJ1biBhbGwgcHJvYmVzIGluIHBhcmFsbGVsLiBFYWNoIGhhbmRsZXMgaXRzIG93biBlcnJvcnMgYW5kIHJldHVybnNcblx0XHQvLyB1bmRlZmluZWQgb24gZmFpbHVyZSBzbyB3ZSBjYW4gcG9wdWxhdGUgZmllbGRzIGluZGVwZW5kZW50bHkuXG5cdFx0Y29uc3QgW1xuXHRcdFx0c3RhdHVzT3V0cHV0LFxuXHRcdFx0cmVtb3Rlc091dHB1dCxcblx0XHRcdGRlZmF1bHRCcmFuY2hSZWYsXG5cdFx0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydzdGF0dXMnLCAnLWInLCAnLS1wb3JjZWxhaW49djInXSksXG5cdFx0XHR0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsncmVtb3RlJywgJy12J10pLFxuXHRcdFx0dGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3N5bWJvbGljLXJlZicsICctLXF1aWV0JywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRCddKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHN0YXR1cyA9IHBhcnNlR2l0U3RhdHVzVjIoc3RhdHVzT3V0cHV0KTtcblx0XHRjb25zdCBoYXNHaXRIdWJSZW1vdGUgPSBwYXJzZUhhc0dpdEh1YlJlbW90ZShyZW1vdGVzT3V0cHV0KTtcblx0XHRjb25zdCBiYXNlQnJhbmNoTmFtZSA9IHBhcnNlRGVmYXVsdEJyYW5jaFJlZihkZWZhdWx0QnJhbmNoUmVmKTtcblx0XHRjb25zdCBnaXRodWJSZXBvID0gcGFyc2VHaXRIdWJSZXBvRnJvbVJlbW90ZShyZW1vdGVzT3V0cHV0KTtcblx0XHRjb25zdCB1cHN0cmVhbVJlbW90ZSA9IHN0YXR1cy51cHN0cmVhbUJyYW5jaE5hbWU/LnNwbGl0KCcvJylbMF07XG5cdFx0Y29uc3QgZ2l0aHViSGVhZFJlcG8gPSB1cHN0cmVhbVJlbW90ZSA/IHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUocmVtb3Rlc091dHB1dCwgdXBzdHJlYW1SZW1vdGUpIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gYGdpdCBzdGF0dXMgLWIgLS1wb3JjZWxhaW49djJgIG9ubHkgZW1pdHMgYWhlYWQvYmVoaW5kIGNvdW50cyB3aGVuIHRoZVxuXHRcdC8vIGJyYW5jaCBoYXMgYW4gdXBzdHJlYW0gdHJhY2tpbmcgcmVmLiBGb3IgYWdlbnQtaG9zdCB3b3JrdHJlZXMgdGhlXG5cdFx0Ly8gYnJhbmNoIGlzIHR5cGljYWxseSBjcmVhdGVkIGxvY2FsbHkgd2l0aCBubyB1cHN0cmVhbSwgc28gdGhlIHVzZXIgY2FuXG5cdFx0Ly8gaGF2ZSBjb21taXR0ZWQgd29yayB0aGF0IHdlJ2Qgb3RoZXJ3aXNlIHJlcG9ydCBhcyAwIG91dGdvaW5nIGNoYW5nZXNcblx0XHQvLyBhbmQgdGhlIFwiQ3JlYXRlIFBSXCIgYnV0dG9uIHdvdWxkIG5ldmVyIGFwcGVhci4gRmFsbCBiYWNrIHRvIGNvdW50aW5nXG5cdFx0Ly8gY29tbWl0cyByZWxhdGl2ZSB0byB0aGUgYmFzZSBicmFuY2ggXHUyMDE0IHRoYXQgbWF0Y2hlcyB3aGF0IHRoZSB1c2VyXG5cdFx0Ly8gYWN0dWFsbHkgY2FyZXMgYWJvdXQgZm9yIFwiaXMgdGhlcmUgd29yayB0byBQUj9cIi5cblx0XHRsZXQgb3V0Z29pbmdDaGFuZ2VzID0gc3RhdHVzLm91dGdvaW5nQ2hhbmdlcztcblx0XHRpZiAob3V0Z29pbmdDaGFuZ2VzID09PSB1bmRlZmluZWQgJiYgYmFzZUJyYW5jaE5hbWUgJiYgc3RhdHVzLmJyYW5jaE5hbWUgJiYgc3RhdHVzLmJyYW5jaE5hbWUgIT09IGJhc2VCcmFuY2hOYW1lKSB7XG5cdFx0XHRjb25zdCBhaGVhZCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZXYtbGlzdCcsICctLWNvdW50JywgYCR7YmFzZUJyYW5jaE5hbWV9Li5IRUFEYF0pO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gYWhlYWQgPT09IHVuZGVmaW5lZCA/IE5hTiA6IE51bWJlcihhaGVhZC50cmltKCkpO1xuXHRcdFx0aWYgKE51bWJlci5pc0Zpbml0ZShwYXJzZWQpKSB7XG5cdFx0XHRcdG91dGdvaW5nQ2hhbmdlcyA9IHBhcnNlZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IElTZXNzaW9uR2l0U3RhdGUgPSB7XG5cdFx0XHRoYXNHaXRIdWJSZW1vdGUsXG5cdFx0XHRicmFuY2hOYW1lOiBzdGF0dXMuYnJhbmNoTmFtZSxcblx0XHRcdGJhc2VCcmFuY2hOYW1lLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiBzdGF0dXMudXBzdHJlYW1CcmFuY2hOYW1lLFxuXHRcdFx0aW5jb21pbmdDaGFuZ2VzOiBzdGF0dXMuaW5jb21pbmdDaGFuZ2VzLFxuXHRcdFx0b3V0Z29pbmdDaGFuZ2VzLFxuXHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiBzdGF0dXMudW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0Z2l0aHViT3duZXI6IGdpdGh1YlJlcG8/Lm93bmVyLFxuXHRcdFx0Z2l0aHViSGVhZE93bmVyOiBnaXRodWJIZWFkUmVwbz8ub3duZXIsXG5cdFx0XHRnaXRodWJSZXBvOiBnaXRodWJSZXBvPy5yZXBvLFxuXHRcdH07XG5cdFx0Ly8gU3RyaXAgdW5kZWZpbmVkIGZpZWxkcyBzbyB0aGUgcmVzdWx0aW5nIG9iamVjdCBpcyB0aGUgc2FtZSByZWdhcmRsZXNzXG5cdFx0Ly8gb2Ygd2hpY2ggcHJvYmVzIHN1Y2NlZWRlZCBcdTIwMTQgZWFzaWVyIHRvIGNvbXBhcmUgaW4gdGVzdHMuXG5cdFx0cmV0dXJuIHN0cmlwVW5kZWZpbmVkKHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIF9ydW5HaXQod29ya2luZ0RpcmVjdG9yeTogVVJJLCBhcmdzOiByZWFkb25seSBzdHJpbmdbXSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgdGltZW91dD86IG51bWJlcjsgcmVhZG9ubHkgdGhyb3dPbkVycm9yPzogYm9vbGVhbjsgcmVhZG9ubHkgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgcmVhZG9ubHkgbWF4QnVmZmVyPzogbnVtYmVyOyByZWFkb25seSBvblN0ZGVycj86IChjaHVuazogc3RyaW5nKSA9PiB2b2lkIH0pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFthZ2VudEhvc3RHaXRTZXJ2aWNlXSA+IGdpdCAke2FyZ3Muam9pbignICcpfWApO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGVudiA9IG9wdGlvbnM/LmVudiA/IHsgLi4ucHJvY2Vzcy5lbnYsIC4uLm9wdGlvbnMuZW52IH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0aW1lb3V0TXMgPSBvcHRpb25zPy50aW1lb3V0ID8/IDUwMDA7XG5cdFx0XHQvLyBVc2Ugb3VyIG93biB0aW1lciByYXRoZXIgdGhhbiBleGVjRmlsZSdzIGB0aW1lb3V0YCBvcHRpb24gc29cblx0XHRcdC8vIHdlIGNhbiBkZWZpbml0aXZlbHkgZmxhZyB0aGUgdGltZW91dCBjYXNlIGluIHRoZSBlcnJvclxuXHRcdFx0Ly8gbWVzc2FnZSBcdTIwMTQgZXhlY0ZpbGUgb25seSBzdXJmYWNlcyBzaWduYWwva2lsbGVkLCB3aGljaCBjYW5cblx0XHRcdC8vIGFsc28gbWVhbiB0aGUgcHJvY2VzcyB3YXMga2lsbGVkIGZvciBvdGhlciByZWFzb25zLlxuXHRcdFx0bGV0IGRpZFRpbWVPdXQgPSBmYWxzZTtcblx0XHRcdC8vIERlZmF1bHQgbWF4QnVmZmVyIGlzIDMyTUIgXHUyMDE0IE5vZGUncyBkZWZhdWx0IGlzIH4xTUIsIHdoaWNoIGlzXG5cdFx0XHQvLyBlYXN5IHRvIGV4Y2VlZCBmb3IgZGlmZiBvdXRwdXQgaW4gbGFyZ2UgcmVwb3MuIEV4Y2VlZGluZyBpdFxuXHRcdFx0Ly8gY2F1c2VzIGV4ZWNGaWxlIHRvIGVycm9yIGFuZCB3ZSdkIHNpbGVudGx5IGRyb3AgdGhlIGRpZmYuXG5cdFx0XHRjb25zdCBjaGlsZCA9IGNwLmV4ZWNGaWxlKCdnaXQnLCBbLi4uYXJnc10sIHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgZW52LCBtYXhCdWZmZXI6IG9wdGlvbnM/Lm1heEJ1ZmZlciA/PyAzMiAqIDEwMjQgKiAxMDI0IH0sIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gc3RkZXJyIGlzIHN1bW1hcml6ZWQgaW4gdGhlIHRocm93biBlcnJvciBtZXNzYWdlIHRvIGtlZXBcblx0XHRcdFx0XHQvLyBpdCByZWFkYWJsZTsgbG9nIHRoZSBmdWxsIHVubW9kaWZpZWQgb3V0cHV0IGhlcmUgc28gdGhlXG5cdFx0XHRcdFx0Ly8gcmF3IHByb2dyZXNzL2RpYWdub3N0aWMgdGV4dCBpcyBzdGlsbCBhdmFpbGFibGUuXG5cdFx0XHRcdFx0aWYgKHN0ZGVycikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbYWdlbnRIb3N0R2l0U2VydmljZV0gPiBnaXQgJHthcmdzLmpvaW4oJyAnKX0gZmFpbGVkOyBmdWxsIHN0ZGVycjpcXG4ke3N0ZGVycn1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnM/LnRocm93T25FcnJvcikge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihmb3JtYXRHaXRFcnJvcihhcmdzLCB0aW1lb3V0TXMsIGRpZFRpbWVPdXQsIGVycm9yLCBzdGRlcnIpLCB7IGNhdXNlOiBlcnJvciB9KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0fSk7XG5cdFx0XHQvLyBgZXhlY0ZpbGVgIGtlZXBzIGl0cyBvd24gbGlzdGVuZXIgZm9yIHRoZSBidWZmZXJlZCByZXN1bHQ7IGFuXG5cdFx0XHQvLyBleHRyYSBvbmUganVzdCB0ZWVzIHRoZSBzYW1lIGNodW5rcyBmb3IgbGl2ZSBwcm9ncmVzcy5cblx0XHRcdGNvbnN0IG9uU3RkZXJyID0gb3B0aW9ucz8ub25TdGRlcnI7XG5cdFx0XHRpZiAob25TdGRlcnIpIHtcblx0XHRcdFx0Y2hpbGQuc3RkZXJyPy5vbignZGF0YScsIChjaHVuazogQnVmZmVyIHwgc3RyaW5nKSA9PiBvblN0ZGVycihjaHVuay50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRkaWRUaW1lT3V0ID0gdHJ1ZTtcblx0XHRcdFx0Y2hpbGQua2lsbCgpO1xuXHRcdFx0fSwgdGltZW91dE1zKTtcblx0XHRcdGNoaWxkLm9uKCdleGl0JywgKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVyKSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBJbmNyZW1lbnRhbGx5IGV4dHJhY3RzIGNoZWNrb3V0IHByb2dyZXNzIGZyb20gZ2l0J3Mgc3RkZXJyLiBHaXQgcmV3cml0ZXMgdGhlXG4gKiBwcm9ncmVzcyBsaW5lIGluIHBsYWNlIHdpdGggY2FycmlhZ2UgcmV0dXJucywgc28gYSBjaHVuayBjYXJyaWVzIGFueSBudW1iZXJcbiAqIG9mIHNhbXBsZXMgYW5kIG1heSBzcGxpdCBvbmUgYWNyb3NzIGNodW5rIGJvdW5kYXJpZXM7IHRoZSB0cmFpbGluZyBwYXJ0aWFsXG4gKiBsaW5lIGlzIGhlbGQgYmFjayB1bnRpbCB0aGUgcmVzdCBhcnJpdmVzLiBFdmVyeSBjb21wbGV0ZSBzYW1wbGUgaXMgZm9yd2FyZGVkXG4gKiB2ZXJiYXRpbSBcdTIwMTQgcm91bmRpbmcgYW5kIHJhdGUgbGltaXRpbmcgYmVsb25nIHRvIHRoZSBjb25zdW1lciwgd2hpY2gga25vd3MgaG93XG4gKiBpdCB3YW50cyB0byBwcmVzZW50IHRoZW0uXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgY2xhc3MgR2l0Q2hlY2tvdXRQcm9ncmVzc1BhcnNlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3BhdHRlcm4gPSAvVXBkYXRpbmcgZmlsZXM6XFxzK1xcZCslIFxcKCg/PGRvbmU+XFxkKylcXC8oPzx0b3RhbD5cXGQrKVxcKS9nO1xuXG5cdHByaXZhdGUgX3BlbmRpbmcgPSAnJztcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9vblByb2dyZXNzOiAocHJvZ3Jlc3M6IElXb3JrdHJlZUZpbGVQcm9ncmVzcykgPT4gdm9pZCkgeyB9XG5cblx0cHVzaChjaHVuazogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gS2VlcCB3aGF0ZXZlciBmb2xsb3dzIHRoZSBsYXN0IGxpbmUgYnJlYWsgZm9yIHRoZSBuZXh0IGNodW5rOyBnaXRcblx0XHQvLyBzZXBhcmF0ZXMgcHJvZ3Jlc3Mgc2FtcGxlcyB3aXRoIGBcXHJgIGFuZCBlbmRzIHRoZSBwaGFzZSB3aXRoIGBcXG5gLlxuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3BlbmRpbmcgKyBjaHVuaztcblx0XHRjb25zdCBsYXN0QnJlYWsgPSBNYXRoLm1heChidWZmZXIubGFzdEluZGV4T2YoJ1xccicpLCBidWZmZXIubGFzdEluZGV4T2YoJ1xcbicpKTtcblx0XHRpZiAobGFzdEJyZWFrID09PSAtMSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZyA9IGJ1ZmZlcjtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZyA9IGJ1ZmZlci5zdWJzdHJpbmcobGFzdEJyZWFrICsgMSk7XG5cblx0XHRjb25zdCBjb21wbGV0ZSA9IGJ1ZmZlci5zdWJzdHJpbmcoMCwgbGFzdEJyZWFrKTtcblx0XHRHaXRDaGVja291dFByb2dyZXNzUGFyc2VyLl9wYXR0ZXJuLmxhc3RJbmRleCA9IDA7XG5cdFx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRcdHdoaWxlICgobWF0Y2ggPSBHaXRDaGVja291dFByb2dyZXNzUGFyc2VyLl9wYXR0ZXJuLmV4ZWMoY29tcGxldGUpKSkge1xuXHRcdFx0Y29uc3QgZmlsZXNUb3RhbCA9IE51bWJlcihtYXRjaC5ncm91cHMhLnRvdGFsKTtcblx0XHRcdGlmIChmaWxlc1RvdGFsID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vblByb2dyZXNzKHsgZmlsZXNEb25lOiBOdW1iZXIobWF0Y2guZ3JvdXBzIS5kb25lKSwgZmlsZXNUb3RhbCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBIHBhdGggdG8gY29weSBpbnRvIGEgd29ya3RyZWUsIHBsdXMgaG93IG1hbnkgaW5kaXZpZHVhbCBpZ25vcmVkIGZpbGVzIGl0XG4gKiBjb3ZlcnMgXHUyMDE0IG9uZSBmb3IgYSBwbGFpbiBmaWxlLCB0aGUgd2hvbGUgdGFsbHkgZm9yIGEgY29sbGFwc2VkIGRpcmVjdG9yeSBcdTIwMTRcbiAqIHNvIGNhbGxlcnMgY2FuIHJlcG9ydCBwcm9ncmVzcyBpbiBmaWxlcyByYXRoZXIgdGhhbiBpbiBlbnRyaWVzIG9mIHdpbGRseVxuICogZGlmZmVyZW50IHNpemUuXG4gKi9cbmludGVyZmFjZSBJV29ya3RyZWVJbmNsdWRlRW50cnkge1xuXHRyZWFkb25seSBzb3VyY2VQYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbGVDb3VudDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgZW50cmllcyB0byBjb3B5OiBvbmUgcGVyIGNvbGxhcHNlZCBkaXJlY3RvcnksIHN0YW5kaW5nIGluIGZvciBhbGxcbiAqIHRoZSBtYXRjaGVkIGZpbGVzIGJlbmVhdGggaXQsIHBsdXMgb25lIHBlciBtYXRjaGVkIGZpbGUgbm8gY29sbGFwc2VkXG4gKiBkaXJlY3RvcnkgY292ZXJzLlxuICovXG5mdW5jdGlvbiB0b1dvcmt0cmVlSW5jbHVkZUVudHJpZXMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgbWF0Y2hlZEZpbGVzOiByZWFkb25seSBzdHJpbmdbXSwgY29sbGFwc2VkRGlyZWN0b3JpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBJV29ya3RyZWVJbmNsdWRlRW50cnlbXSB7XG5cdGNvbnN0IHRvRW50cnkgPSAocmVsYXRpdmVQYXRoOiBzdHJpbmcsIGZpbGVDb3VudDogbnVtYmVyKTogSVdvcmt0cmVlSW5jbHVkZUVudHJ5ID0+ICh7XG5cdFx0c291cmNlUGF0aDogcGF0aC5qb2luKHJlcG9zaXRvcnlSb290LmZzUGF0aCwgcmVsYXRpdmVQYXRoKSxcblx0XHRmaWxlQ291bnQsXG5cdH0pO1xuXG5cdC8vIFNlZWRlZCB3aXRoIGV2ZXJ5IGNvbGxhcHNlZCBkaXJlY3Rvcnkgc28gb25lIGlzIHN0aWxsIGVtaXR0ZWQgZXZlbiBpZiB0aGVcblx0Ly8gdGFsbHkgYmVsb3cgbmV2ZXIgcmVhY2hlcyBpdC5cblx0Y29uc3QgZGlyZWN0b3J5RmlsZUNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdGZvciAoY29uc3QgZGlyIG9mIGNvbGxhcHNlZERpcmVjdG9yaWVzKSB7XG5cdFx0ZGlyZWN0b3J5RmlsZUNvdW50cy5zZXQoZGlyLCAwKTtcblx0fVxuXG5cdGNvbnN0IGZpbGVFbnRyaWVzOiBJV29ya3RyZWVJbmNsdWRlRW50cnlbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGZpbGUgb2YgbWF0Y2hlZEZpbGVzKSB7XG5cdFx0Y29uc3QgY29udGFpbmluZ0RpcmVjdG9yeSA9IGNvbGxhcHNlZERpcmVjdG9yaWVzLnNpemUgPiAwXG5cdFx0XHQ/IGZpbmRDb250YWluaW5nRGlyZWN0b3J5KGZpbGUsIGNvbGxhcHNlZERpcmVjdG9yaWVzKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbnRhaW5pbmdEaXJlY3RvcnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZmlsZUVudHJpZXMucHVzaCh0b0VudHJ5KGZpbGUsIDEpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlyZWN0b3J5RmlsZUNvdW50cy5zZXQoY29udGFpbmluZ0RpcmVjdG9yeSwgZGlyZWN0b3J5RmlsZUNvdW50cy5nZXQoY29udGFpbmluZ0RpcmVjdG9yeSkhICsgMSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIFtcblx0XHQuLi5bLi4uZGlyZWN0b3J5RmlsZUNvdW50c10ubWFwKChbZGlyLCBmaWxlQ291bnRdKSA9PiB0b0VudHJ5KGRpciwgZmlsZUNvdW50KSksXG5cdFx0Li4uZmlsZUVudHJpZXMsXG5cdF07XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgc2hhbGxvd2VzdCBkaXJlY3RvcnkgZnJvbSBgZGlyZWN0b3JpZXNgIHRoYXQgY29udGFpbnMgYGZpbGVgLCBvclxuICogYHVuZGVmaW5lZGAgaWYgbm9uZSBkb2VzLiBgZmlsZWAgaXMgYSByZXBvc2l0b3J5LXJlbGF0aXZlLCBmb3J3YXJkLXNsYXNoIHBhdGhcbiAqIGFuZCBldmVyeSBlbnRyeSBpbiBgZGlyZWN0b3JpZXNgIGlzIGV4cGVjdGVkIHRvIGVuZCB3aXRoIGEgdHJhaWxpbmcgYC9gIChhc1xuICogcHJvZHVjZWQgYnkgYGdpdCBscy1maWxlcyAtLWRpcmVjdG9yeWApLiBXYWxraW5nIHRoZSBwYXRoJ3MgYC9gIGJvdW5kYXJpZXNcbiAqIGFuZCBwcm9iaW5nIHRoZSBzZXQgaXMgTyhwYXRoIGRlcHRoKSBwZXIgZmlsZSwgYXZvaWRpbmcgYW4gTyhkaXJlY3RvcmllcylcbiAqIHNjYW4gZm9yIGVhY2ggZmlsZS5cbiAqL1xuZnVuY3Rpb24gZmluZENvbnRhaW5pbmdEaXJlY3RvcnkoZmlsZTogc3RyaW5nLCBkaXJlY3RvcmllczogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGxldCBpbmRleCA9IGZpbGUuaW5kZXhPZignLycpO1xuXHR3aGlsZSAoaW5kZXggIT09IC0xKSB7XG5cdFx0Y29uc3QgcHJlZml4ID0gZmlsZS5zbGljZSgwLCBpbmRleCArIDEpO1xuXHRcdGlmIChkaXJlY3Rvcmllcy5oYXMocHJlZml4KSkge1xuXHRcdFx0cmV0dXJuIHByZWZpeDtcblx0XHR9XG5cdFx0aW5kZXggPSBmaWxlLmluZGV4T2YoJy8nLCBpbmRleCArIDEpO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIGNvcHlpbmcgYSBzb3VyY2UgcGF0aCB3b3VsZCBvdmVyd3JpdGUgYSB0cmFja2VkIHdvcmt0cmVlIHBhdGhcbiAqIG9yIGNvbmZsaWN0IHdpdGggdGhlIGZpbGUvZGlyZWN0b3J5IHNoYXBlIG9mIGl0cyBkZXN0aW5hdGlvbi4gYGZpbGVgIGFuZCBib3RoXG4gKiBzZXRzIHVzZSByZXBvc2l0b3J5LXJlbGF0aXZlLCBmb3J3YXJkLXNsYXNoIHBhdGhzLCB3aXRoIGB3b3JrdHJlZURpcmVjdG9yaWVzYFxuICogZW50cmllcyBjYXJyeWluZyBhIHRyYWlsaW5nIGAvYC5cbiAqL1xuZnVuY3Rpb24gaGFzV29ya3RyZWVQYXRoQ29sbGlzaW9uKGZpbGU6IHN0cmluZywgd29ya3RyZWVGaWxlczogUmVhZG9ubHlTZXQ8c3RyaW5nPiwgd29ya3RyZWVEaXJlY3RvcmllczogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHQvLyBUaGUgZGVzdGluYXRpb24gaXMgYSB0cmFja2VkIGZpbGUsIHdoaWNoIHRoZSBjb3B5IHdvdWxkIG92ZXJ3cml0ZSwgb3IgYVxuXHQvLyB0cmFja2VkIGRpcmVjdG9yeSwgd2hpY2ggYSBmaWxlIGNhbm5vdCB0YWtlIHRoZSBwbGFjZSBvZi5cblx0aWYgKHdvcmt0cmVlRmlsZXMuaGFzKGZpbGUpIHx8IHdvcmt0cmVlRGlyZWN0b3JpZXMuaGFzKGAke2ZpbGV9L2ApKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBBbiBhbmNlc3RvciBvZiB0aGUgZGVzdGluYXRpb24gaXMgYSB0cmFja2VkIGZpbGUsIHNvIHRoZSBkaXJlY3Rvcmllc1xuXHQvLyBsZWFkaW5nIHVwIHRvIGl0IGNhbm5vdCBiZSBjcmVhdGVkLlxuXHRsZXQgaW5kZXggPSBmaWxlLmluZGV4T2YoJy8nKTtcblx0d2hpbGUgKGluZGV4ICE9PSAtMSkge1xuXHRcdGlmICh3b3JrdHJlZUZpbGVzLmhhcyhmaWxlLnNsaWNlKDAsIGluZGV4KSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpbmRleCA9IGZpbGUuaW5kZXhPZignLycsIGluZGV4ICsgMSk7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIGRpYWdub3N0aWMgZXJyb3IgbWVzc2FnZSBmb3IgYSBmYWlsZWQgYGdpdGAgaW52b2NhdGlvbiB0aGF0XG4gKiBwcmVzZXJ2ZXMgdGhlIHJlYXNvbiAodGltZW91dCAvIHNpZ25hbCAvIGV4aXQgY29kZSkgaW5zdGVhZCBvZiBqdXN0XG4gKiBzdXJmYWNpbmcgd2hhdGV2ZXIgaGFwcGVuZWQgdG8gYmUgb24gc3RkZXJyLiBXaGVuIGBnaXRgIGlzIGtpbGxlZCBieVxuICogdGhlIHRpbWVvdXQsIHN0ZGVyciBvZnRlbiBjb250YWlucyBvbmx5IHByb2dyZXNzIG91dHB1dCAoZS5nLlxuICogYFVwZGF0aW5nIGZpbGVzOiAgIDAlICgxNDkvMTQ4MzQpYCksIHNvIHdpdGhvdXQgdGhlIHRpbWVvdXQgaW5kaWNhdG9yXG4gKiB0aGUgYnViYmxlZC11cCBlcnJvciBpcyBtaXNsZWFkaW5nLlxuICpcbiAqIEV4cG9ydGVkIGZvciB0ZXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEdpdEVycm9yKGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdLCB0aW1lb3V0TXM6IG51bWJlciwgZGlkVGltZU91dDogYm9vbGVhbiwgZXJyb3I6IGNwLkV4ZWNGaWxlRXhjZXB0aW9uLCBzdGRlcnI6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHN1YmNvbW1hbmQgPSBhcmdzWzBdID8/ICcodW5rbm93biknO1xuXHRsZXQgcmVhc29uOiBzdHJpbmc7XG5cdGlmIChkaWRUaW1lT3V0KSB7XG5cdFx0cmVhc29uID0gYGdpdCAke3N1YmNvbW1hbmR9IHRpbWVkIG91dCBhZnRlciAke3RpbWVvdXRNc31tc2A7XG5cdH0gZWxzZSBpZiAoZXJyb3Iua2lsbGVkICYmIGVycm9yLnNpZ25hbCkge1xuXHRcdHJlYXNvbiA9IGBnaXQgJHtzdWJjb21tYW5kfSBraWxsZWQgYnkgJHtlcnJvci5zaWduYWx9YDtcblx0fSBlbHNlIGlmICh0eXBlb2YgZXJyb3IuY29kZSA9PT0gJ251bWJlcicpIHtcblx0XHRyZWFzb24gPSBgZ2l0ICR7c3ViY29tbWFuZH0gZXhpdGVkIHdpdGggY29kZSAke2Vycm9yLmNvZGV9YDtcblx0fSBlbHNlIHtcblx0XHRyZWFzb24gPSBlcnJvci5tZXNzYWdlO1xuXHR9XG5cdGNvbnN0IGRldGFpbCA9IHN1bW1hcml6ZVN0ZGVyckZvckVycm9yKHN0ZGVycik7XG5cdHJldHVybiBkZXRhaWwgPyBgJHtyZWFzb259OiAke2RldGFpbH1gIDogcmVhc29uO1xufVxuXG4vKipcbiAqIFNxdWFzaGVzIG11bHRpLWxpbmUgLyBjYXJyaWFnZS1yZXR1cm4taGVhdnkgc3RkZXJyIChlLmcuIGdpdCBwcm9ncmVzc1xuICogbWV0ZXJzIHRoYXQgZW1pdCBgVXBkYXRpbmcgZmlsZXM6ICAgMCUgKDE0OS8xNDgzNClcXHIuLi5gIHJlcGVhdGVkbHkpXG4gKiBpbnRvIGEgc2luZ2xlIHNob3J0IGxpbmUgc3VpdGFibGUgZm9yIGEgb25lLWxpbmVyIGVycm9yIG1lc3NhZ2UuXG4gKiBLZWVwcyB0aGUgbW9zdCByZWNlbnQgbm9uLWVtcHR5IGxpbmUgYW5kIGNhcHMgdG90YWwgbGVuZ3RoLlxuICpcbiAqIEV4cG9ydGVkIGZvciB0ZXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN1bW1hcml6ZVN0ZGVyckZvckVycm9yKHN0ZGVycjogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFzdGRlcnIpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgbGluZXMgPSBzdGRlcnIuc3BsaXQoL1tcXHJcXG5dKy9nKS5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZS5sZW5ndGggPiAwKTtcblx0aWYgKGxpbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRjb25zdCBNQVggPSAyMDA7XG5cdGNvbnN0IGdpdExmc01pc3NpbmcgPSBsaW5lcy5maW5kKGxpbmUgPT5cblx0XHQvXFxiZ2l0LWxmc1xcYi9pLnRlc3QobGluZSkgJiZcblx0XHQvKGNvbW1hbmQgbm90IGZvdW5kfG5vdCByZWNvZ25pemVkfG5vIHN1Y2ggZmlsZSkvaS50ZXN0KGxpbmUpXG5cdCk7XG5cdGNvbnN0IHN1bW1hcnkgPSBnaXRMZnNNaXNzaW5nID8/IGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdO1xuXHRyZXR1cm4gc3VtbWFyeS5sZW5ndGggPiBNQVggPyBgJHtzdW1tYXJ5LnNsaWNlKDAsIE1BWCAtIDEpfVx1MjAyNmAgOiBzdW1tYXJ5O1xufVxuXG4vKipcbiAqIFBhcnNlcyBOVUwtc2VwYXJhdGVkIGBnaXQgc3RhdHVzIC0tcG9yY2VsYWluPXYxIC16IC0tdW50cmFja2VkLWZpbGVzPWFsbGBcbiAqIG91dHB1dCBhbmQgcmV0dXJucyB0aGUgcmVwby1yZWxhdGl2ZSBwYXRocyBvZiB1bnRyYWNrZWQgZW50cmllcyAoc3RhdHVzXG4gKiBgPz9gKS4gT3RoZXIgZW50cmllcyBhcmUgaWdub3JlZDsgd2Ugb25seSBuZWVkIHRvIGtub3cgd2hldGhlciBhbnlcbiAqIHVudHJhY2tlZCBmaWxlcyBleGlzdCB0byBkZWNpZGUgd2hldGhlciB0byB1c2UgdGhlIHRlbXAtaW5kZXggcGF0aC5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVVudHJhY2tlZFBhdGhzKG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nW10ge1xuXHRyZXR1cm4gcGFyc2VDaGFuZ2VkUGF0aHMob3V0cHV0LCBzdGF0dXMgPT4gc3RhdHVzID09PSAnPz8nKTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgTlVMLXNlcGFyYXRlZCBgZ2l0IHN0YXR1cyAtLXBvcmNlbGFpbj12MSAteiAtLXVudHJhY2tlZC1maWxlcz1hbGxgXG4gKiBvdXRwdXQgYW5kIHJldHVybnMgYWxsIGNoYW5nZWQgcmVwby1yZWxhdGl2ZSBwYXRocy4gUmVuYW1lL2NvcHkgZW50cmllc1xuICogaW5jbHVkZSBib3RoIHRoZSBkZXN0aW5hdGlvbiBhbmQgc291cmNlIHBhdGhzIHNvIHNjb3BlZCBgZ2l0IGFkZCAtQWBcbiAqIHN0YWdlcyBib3RoIHNpZGVzIG9mIHRoZSBjaGFuZ2UuXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDaGFuZ2VkUGF0aHMob3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQsIGluY2x1ZGVTdGF0dXM6IChzdGF0dXM6IHN0cmluZykgPT4gYm9vbGVhbiA9ICgpID0+IHRydWUpOiBzdHJpbmdbXSB7XG5cdGlmICghb3V0cHV0KSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBhZGRQYXRoID0gKHBhdGg6IHN0cmluZykgPT4ge1xuXHRcdGlmIChwYXRoICYmICFzZWVuLmhhcyhwYXRoKSkge1xuXHRcdFx0c2Vlbi5hZGQocGF0aCk7XG5cdFx0XHRyZXN1bHQucHVzaChwYXRoKTtcblx0XHR9XG5cdH07XG5cdGNvbnN0IHNlZ21lbnRzID0gb3V0cHV0LnNwbGl0KCdcXHgwMCcpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3Qgc2VnID0gc2VnbWVudHNbaV07XG5cdFx0aWYgKCFzZWcpIHsgY29udGludWU7IH1cblx0XHQvLyBFYWNoIGVudHJ5IGlzIFwiWFkgPHBhdGg+XCI7IGZvciByZW5hbWVzIHYxIGVtaXRzIGEgc2Vjb25kIE5VTC1zZXBhcmF0ZWRcblx0XHQvLyBcImZyb21cIiBwYXRoLlxuXHRcdGNvbnN0IHN0YXR1cyA9IHNlZy5zdWJzdHJpbmcoMCwgMik7XG5cdFx0Y29uc3QgcGF0aCA9IHNlZy5zdWJzdHJpbmcoMyk7XG5cdFx0Y29uc3QgaXNSZW5hbWVPckNvcHkgPSBzdGF0dXNbMF0gPT09ICdSJyB8fCBzdGF0dXNbMV0gPT09ICdSJyB8fCBzdGF0dXNbMF0gPT09ICdDJyB8fCBzdGF0dXNbMV0gPT09ICdDJztcblx0XHRpZiAoaW5jbHVkZVN0YXR1cyhzdGF0dXMpKSB7XG5cdFx0XHRhZGRQYXRoKHBhdGgpO1xuXHRcdFx0aWYgKGlzUmVuYW1lT3JDb3B5KSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZVBhdGggPSBzZWdtZW50c1srK2ldO1xuXHRcdFx0XHRpZiAoc291cmNlUGF0aCkge1xuXHRcdFx0XHRcdGFkZFBhdGgoc291cmNlUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzUmVuYW1lT3JDb3B5KSB7XG5cdFx0XHRpKys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUGFyc2VzIE5VTC10ZXJtaW5hdGVkIGBnaXQgbHMtdHJlZSAteiA8dHJlZT4gLS0gPHBhdGg+YCBvdXRwdXQgZm9yIGEgc2luZ2xlXG4gKiBwYXRoIGFuZCByZXR1cm5zIGl0cyBgeyBtb2RlLCBvaWQgfWAsIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlIHBhdGggaXMgYWJzZW50XG4gKiBmcm9tIHRoZSB0cmVlIChlbXB0eSBvdXRwdXQpLiBFYWNoIGVudHJ5IGhhcyB0aGUgZm9ybVxuICogYDxtb2RlPiBTUCA8dHlwZT4gU1AgPG9pZD4gVEFCIDxwYXRoPiBOVUxgOyB3ZSBvbmx5IG5lZWQgdGhlIG1vZGUgYW5kIG9pZC5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNpbmdsZUxzVHJlZUVudHJ5KG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyBtb2RlOiBzdHJpbmc7IG9pZDogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoIW91dHB1dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZW50cnkgPSBvdXRwdXQuc3BsaXQoJ1xceDAwJylbMF07XG5cdGlmICghZW50cnkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHRhYkluZGV4ID0gZW50cnkuaW5kZXhPZignXFx0Jyk7XG5cdGNvbnN0IG1ldGEgPSAodGFiSW5kZXggPT09IC0xID8gZW50cnkgOiBlbnRyeS5zdWJzdHJpbmcoMCwgdGFiSW5kZXgpKS5zcGxpdCgnICcpO1xuXHRpZiAobWV0YS5sZW5ndGggPCAzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyBtb2RlOiBtZXRhWzBdLCBvaWQ6IG1ldGFbMl0gfTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgY29tYmluZWQgYC0tcmF3IC0tbnVtc3RhdCAtemAgb3V0cHV0IHByb2R1Y2VkIGJ5XG4gKiB7QGxpbmsgSUFnZW50SG9zdEdpdFNlcnZpY2UuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnN9IGFuZCBjb252ZXJ0cyBlYWNoXG4gKiBjaGFuZ2UgaW50byBhbiB7QGxpbmsgSVNlc3Npb25GaWxlRGlmZn0gcmVhZHkgZm9yIHRoZSBwcm90b2NvbC5cbiAqXG4gKiBUaGUgY29tYmluZWQgTlVMLXNlcGFyYXRlZCBzdHJlYW0gYWx0ZXJuYXRlcyBiZXR3ZWVuIGAtLXJhd2Agc2VnbWVudHNcbiAqIChzdGFydCB3aXRoIGA6YCkgYW5kIGAtLW51bXN0YXRgIHNlZ21lbnRzLiBGb3IgcmVuYW1lcyB0aGUgcmF3IHNlZ21lbnRcbiAqIGlzIGZvbGxvd2VkIGJ5IHR3byBleHRyYSBwYXRoIHNlZ21lbnRzIChvbGQsIG5ldyk7IHRoZSBudW1zdGF0IHNlZ21lbnRcbiAqIGhhcyBhbiBlbXB0eSBwYXRoIGZpZWxkIGZvbGxvd2VkIGJ5IG9sZC9uZXcgcGF0aCBzZWdtZW50cy5cbiAqXG4gKiBgYmVmb3JlUmVmYCBpcyB0aGUgY29tbWl0IHRoZSBgYmVmb3JlYCBzaWRlIGlzIGFuY2hvcmVkIG9uICh0eXBpY2FsbHkgYVxuICogbWVyZ2UtYmFzZSBvciB0aGUgbG93ZXIgYm91bmQgb2YgYSByZWYtdG8tcmVmIGRpZmYpLlxuICpcbiAqIGBhZnRlclJlZmAgY29udHJvbHMgaG93IHRoZSBgYWZ0ZXJgIHNpZGUgaXMgYnVpbHQ6XG4gKiAtIFdoZW4gYHVuZGVmaW5lZGAgKHRoZSBtZXJnZS1iYXNlIFx1MjE5MiB3b3JraW5nLXRyZWUgY2FzZSkgdGhlIGBhZnRlcmBcbiAqICAgY29udGVudCBVUkkgcG9pbnRzIGF0IHRoZSBvbi1kaXNrIHdvcmtpbmctdHJlZSBmaWxlLiBUaGUgZGlmZiBlZGl0b3JcbiAqICAgcmVhZHMgdGhlIGZpbGUgZnJvbSBkaXNrIGFzIHRoZSB1c2VyIGN1cnJlbnRseSBzZWVzIGl0LlxuICogLSBXaGVuIHNldCAodGhlIHJlZiBcdTIxOTIgcmVmIGNhc2UsIGUuZy4gY2hlY2twb2ludCBkaWZmcykgYm90aCBgYWZ0ZXIudXJpYFxuICogICBhbmQgYGFmdGVyLmNvbnRlbnQudXJpYCBhcmUgYnVpbHQgYXMgYGdpdC1ibG9iOmAgVVJJcyBhbmNob3JlZCBvbiB0aGF0XG4gKiAgIGNvbW1pdCwgc28gdGhlIGFmdGVyIHBhbmUgcmVmbGVjdHMgdGhlIHN0YXRlIGF0IHRoYXQgY29tbWl0XG4gKiAgIHJlZ2FyZGxlc3Mgb2Ygd2hhdCBpcyBjdXJyZW50bHkgb24gZGlzay4gVGhpcyBhbHNvIG1ha2VzIHRoZSBkaWZmXG4gKiAgIGNvcnJlY3Qgd2hlbiB0aGUgZmlsZSBkb2VzIG5vdCAob3Igbm8gbG9uZ2VyKSBleGlzdHMgaW4gdGhlIHdvcmtpbmdcbiAqICAgdHJlZS5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUdpdERpZmZSYXdOdW1zdGF0KG91dHB1dDogc3RyaW5nLCByZXBvc2l0b3J5Um9vdDogVVJJLCBzZXNzaW9uVXJpOiBzdHJpbmcsIGJlZm9yZVJlZjogc3RyaW5nLCBhZnRlclJlZj86IHN0cmluZyk6IElTZXNzaW9uRmlsZURpZmZbXSB7XG5cdGNvbnN0IHNlZ21lbnRzID0gb3V0cHV0LnNwbGl0KCdcXHgwMCcpO1xuXHRjb25zdCBjaGFuZ2VzOiB7IGtpbmQ6IEZpbGVFZGl0S2luZDsgb2xkUGF0aD86IHN0cmluZzsgbmV3UGF0aD86IHN0cmluZyB9W10gPSBbXTtcblx0Y29uc3QgbnVtU3RhdHMgPSBuZXcgTWFwPHN0cmluZywgeyBhZGRlZDogbnVtYmVyOyByZW1vdmVkOiBudW1iZXIgfT4oKTtcblxuXHRsZXQgaSA9IDA7XG5cdHdoaWxlIChpIDwgc2VnbWVudHMubGVuZ3RoKSB7XG5cdFx0Y29uc3Qgc2VnbWVudCA9IHNlZ21lbnRzW2krK107XG5cdFx0aWYgKCFzZWdtZW50KSB7IGNvbnRpbnVlOyB9XG5cblx0XHRpZiAoc2VnbWVudC5zdGFydHNXaXRoKCc6JykpIHtcblx0XHRcdC8vIFJhdyBsaW5lOiBcIjo8c3JjTW9kZT4gPGRzdE1vZGU+IDxzcmNTaGE+IDxkc3RTaGE+IDxzdGF0dXM+XCJcblx0XHRcdC8vIGZvbGxvd2VkIGJ5IE5VTC1zZXBhcmF0ZWQgcGF0aChzKS5cblx0XHRcdGNvbnN0IGZpZWxkcyA9IHNlZ21lbnQuc3BsaXQoJyAnKTtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IGZpZWxkc1s0XSA/PyAnJztcblx0XHRcdGNvbnN0IHBhdGgxID0gc2VnbWVudHNbaSsrXTtcblx0XHRcdGlmICghcGF0aDEpIHsgY29udGludWU7IH1cblxuXHRcdFx0c3dpdGNoIChzdGF0dXNbMF0pIHtcblx0XHRcdFx0Y2FzZSAnQSc6XG5cdFx0XHRcdFx0Y2hhbmdlcy5wdXNoKHsga2luZDogRmlsZUVkaXRLaW5kLkNyZWF0ZSwgbmV3UGF0aDogcGF0aDEgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ00nOlxuXHRcdFx0XHRcdGNoYW5nZXMucHVzaCh7IGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LCBvbGRQYXRoOiBwYXRoMSwgbmV3UGF0aDogcGF0aDEgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0QnOlxuXHRcdFx0XHRcdGNoYW5nZXMucHVzaCh7IGtpbmQ6IEZpbGVFZGl0S2luZC5EZWxldGUsIG9sZFBhdGg6IHBhdGgxIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdSJzoge1xuXHRcdFx0XHRcdGNvbnN0IHBhdGgyID0gc2VnbWVudHNbaSsrXTtcblx0XHRcdFx0XHRpZiAoIXBhdGgyKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0Y2hhbmdlcy5wdXNoKHsga2luZDogRmlsZUVkaXRLaW5kLlJlbmFtZSwgb2xkUGF0aDogcGF0aDEsIG5ld1BhdGg6IHBhdGgyIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE51bXN0YXQgbGluZTogXCI8YWRkZWQ+XFx0PHJlbW92ZWQ+XFx0PHBhdGg+XCIgb3IsIGZvciByZW5hbWVzLFxuXHRcdFx0Ly8gXCI8YWRkZWQ+XFx0PHJlbW92ZWQ+XFx0XCIgZm9sbG93ZWQgYnkgTlVMLXNlcGFyYXRlZCBvbGQvbmV3IHBhdGhzLlxuXHRcdFx0Y29uc3QgW2FkZGVkU3RyLCByZW1vdmVkU3RyLCBmaWxlUGF0aF0gPSBzZWdtZW50LnNwbGl0KCdcXHQnKTtcblx0XHRcdGxldCBrZXk6IHN0cmluZztcblx0XHRcdGlmIChmaWxlUGF0aCA9PT0gJycgfHwgZmlsZVBhdGggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBvbGRQYXRoID0gc2VnbWVudHNbaSsrXTtcblx0XHRcdFx0Y29uc3QgbmV3UGF0aCA9IHNlZ21lbnRzW2krK107XG5cdFx0XHRcdGtleSA9IG5ld1BhdGggPz8gb2xkUGF0aCA/PyAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGtleSA9IGZpbGVQYXRoO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFrZXkpIHsgY29udGludWU7IH1cblx0XHRcdG51bVN0YXRzLnNldChrZXksIHtcblx0XHRcdFx0YWRkZWQ6IGFkZGVkU3RyID09PSAnLScgPyAwIDogTnVtYmVyKGFkZGVkU3RyKSB8fCAwLFxuXHRcdFx0XHRyZW1vdmVkOiByZW1vdmVkU3RyID09PSAnLScgPyAwIDogTnVtYmVyKHJlbW92ZWRTdHIpIHx8IDAsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gY2hhbmdlcy5tYXAoY2hhbmdlID0+IHtcblx0XHRjb25zdCBzdGF0cyA9IG51bVN0YXRzLmdldChjaGFuZ2UubmV3UGF0aCA/PyBjaGFuZ2Uub2xkUGF0aCA/PyAnJyk7XG5cblx0XHRjb25zdCBiZWZvcmVGaWxlVXJpID0gY2hhbmdlLm9sZFBhdGggPyBVUkkuam9pblBhdGgocmVwb3NpdG9yeVJvb3QsIGNoYW5nZS5vbGRQYXRoKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhZnRlckZpbGVVcmkgPSBjaGFuZ2UubmV3UGF0aCA/IFVSSS5qb2luUGF0aChyZXBvc2l0b3J5Um9vdCwgY2hhbmdlLm5ld1BhdGgpIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgYmVmb3JlID0gY2hhbmdlLmtpbmQgIT09IEZpbGVFZGl0S2luZC5DcmVhdGUgJiYgY2hhbmdlLm9sZFBhdGggJiYgYmVmb3JlRmlsZVVyaVxuXHRcdFx0PyB7XG5cdFx0XHRcdHVyaTogYmVmb3JlRmlsZVVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRjb250ZW50OiB7IHVyaTogYnVpbGRHaXRCbG9iVXJpKHNlc3Npb25VcmksIGJlZm9yZVJlZiwgY2hhbmdlLm9sZFBhdGgsIGJlZm9yZUZpbGVVcmkucGF0aCkgfSxcblx0XHRcdH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgYWZ0ZXIgPSBjaGFuZ2Uua2luZCAhPT0gRmlsZUVkaXRLaW5kLkRlbGV0ZSAmJiBjaGFuZ2UubmV3UGF0aCAmJiBhZnRlckZpbGVVcmlcblx0XHRcdD8ge1xuXHRcdFx0XHR1cmk6IGFmdGVyRmlsZVVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRjb250ZW50OiBhZnRlclJlZiAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyB7IHVyaTogYnVpbGRHaXRCbG9iVXJpKHNlc3Npb25VcmksIGFmdGVyUmVmLCBjaGFuZ2UubmV3UGF0aCwgYWZ0ZXJGaWxlVXJpLnBhdGgpIH1cblx0XHRcdFx0XHQ6IHsgdXJpOiBhZnRlckZpbGVVcmkudG9TdHJpbmcoKSB9XG5cdFx0XHR9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGRpZmYgPSB7XG5cdFx0XHRhZGRlZDogc3RhdHM/LmFkZGVkID8/IDAsXG5cdFx0XHRyZW1vdmVkOiBzdGF0cz8ucmVtb3ZlZCA/PyAwXG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi4oYmVmb3JlID8geyBiZWZvcmUgfSA6IHt9KSxcblx0XHRcdC4uLihhZnRlciA/IHsgYWZ0ZXIgfSA6IHt9KSxcblx0XHRcdGRpZmZcblx0XHR9O1xuXHR9KTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgb3V0cHV0IG9mIGBnaXQgc3RhdHVzIC1iIC0tcG9yY2VsYWluPXYyYC4gVGhlIGZvcm1hdCBpcyBkb2N1bWVudGVkXG4gKiBhdCBodHRwczovL2dpdC1zY20uY29tL2RvY3MvZ2l0LXN0YXR1cy4gV2UgY2FyZSBhYm91dCBhIGZldyBoZWFkZXIgbGluZXM6XG4gKlxuICogICAjIGJyYW5jaC5oZWFkIDxuYW1lPlxuICogICAjIGJyYW5jaC51cHN0cmVhbSA8bmFtZT5cbiAqICAgIyBicmFuY2guYWIgKzxhaGVhZD4gLTxiZWhpbmQ+XG4gKlxuICogYW5kIHRoZSBjb3VudCBvZiBub24taGVhZGVyIGxpbmVzIChvbmUgcGVyIGNoYW5nZWQgZW50cnkpLlxuICpcbiAqIEV4cG9ydGVkIGZvciB0ZXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlR2l0U3RhdHVzVjIob3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7XG5cdGJyYW5jaE5hbWU/OiBzdHJpbmc7XG5cdHVwc3RyZWFtQnJhbmNoTmFtZT86IHN0cmluZztcblx0b3V0Z29pbmdDaGFuZ2VzPzogbnVtYmVyO1xuXHRpbmNvbWluZ0NoYW5nZXM/OiBudW1iZXI7XG5cdHVuY29tbWl0dGVkQ2hhbmdlcz86IG51bWJlcjtcbn0ge1xuXHRpZiAoIW91dHB1dCkge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRsZXQgYnJhbmNoTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgdXBzdHJlYW1CcmFuY2hOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBvdXRnb2luZ0NoYW5nZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IGluY29taW5nQ2hhbmdlczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRsZXQgdW5jb21taXR0ZWRDaGFuZ2VzID0gMDtcblx0Zm9yIChjb25zdCByYXdMaW5lIG9mIG91dHB1dC5zcGxpdCgvXFxyP1xcbi9nKSkge1xuXHRcdGNvbnN0IGxpbmUgPSByYXdMaW5lLnRyaW1FbmQoKTtcblx0XHRpZiAoIWxpbmUpIHsgY29udGludWU7IH1cblx0XHRpZiAobGluZS5zdGFydHNXaXRoKCcjIGJyYW5jaC5oZWFkICcpKSB7XG5cdFx0XHRjb25zdCBoZWFkID0gbGluZS5zdWJzdHJpbmcoJyMgYnJhbmNoLmhlYWQgJy5sZW5ndGgpLnRyaW0oKTtcblx0XHRcdC8vIGAoZGV0YWNoZWQpYCBpcyB3aGF0IGdpdCBlbWl0cyBmb3IgYSBkZXRhY2hlZCBIRUFELiBUcmVhdCBhcyBubyBicmFuY2guXG5cdFx0XHRicmFuY2hOYW1lID0gaGVhZCA9PT0gJyhkZXRhY2hlZCknID8gdW5kZWZpbmVkIDogaGVhZDtcblx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnIyBicmFuY2gudXBzdHJlYW0gJykpIHtcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZSA9IGxpbmUuc3Vic3RyaW5nKCcjIGJyYW5jaC51cHN0cmVhbSAnLmxlbmd0aCkudHJpbSgpO1xuXHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCcjIGJyYW5jaC5hYiAnKSkge1xuXHRcdFx0Y29uc3QgbSA9IC9eIyBicmFuY2hcXC5hYiBcXCsoXFxkKykgLShcXGQrKSQvLmV4ZWMobGluZSk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXMgPSBOdW1iZXIobVsxXSk7XG5cdFx0XHRcdGluY29taW5nQ2hhbmdlcyA9IE51bWJlcihtWzJdKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFsaW5lLnN0YXJ0c1dpdGgoJyMnKSkge1xuXHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzKys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGJyYW5jaE5hbWUsIHVwc3RyZWFtQnJhbmNoTmFtZSwgb3V0Z29pbmdDaGFuZ2VzLCBpbmNvbWluZ0NoYW5nZXMsIHVuY29tbWl0dGVkQ2hhbmdlcyB9O1xufVxuXG4vKiogRXhwb3J0ZWQgZm9yIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSGFzR2l0SHViUmVtb3RlKHJlbW90ZXNPdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRpZiAocmVtb3Rlc091dHB1dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIXJlbW90ZXNPdXRwdXQudHJpbSgpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiAvZ2l0aHViXFwuY29tWzpcXC9dL2kudGVzdChyZW1vdGVzT3V0cHV0KTtcbn1cblxuLyoqIFJldHVybnMgZmV0Y2ggcmVtb3RlIFVSTHMgd2l0aCB0aGUgcHJlZmVycmVkIHJlbW90ZSwgdGhlbiBgb3JpZ2luYCwgZmlyc3QuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VGZXRjaFJlbW90ZVVybHMocmVtb3Rlc091dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwcmVmZXJyZWRSZW1vdGU/OiBzdHJpbmcpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNhbmRpZGF0ZXMgPSBwYXJzZUZldGNoUmVtb3RlcyhyZW1vdGVzT3V0cHV0KTtcblx0aWYgKCFjYW5kaWRhdGVzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwcmVmZXJyZWROYW1lcyA9IG5ldyBTZXQoW3ByZWZlcnJlZFJlbW90ZSwgJ29yaWdpbiddLmZpbHRlcigobmFtZSk6IG5hbWUgaXMgc3RyaW5nID0+IEJvb2xlYW4obmFtZSkpKTtcblx0Y29uc3Qgb3JkZXJlZCA9IFtcblx0XHQuLi5jYW5kaWRhdGVzLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLm5hbWUgPT09IHByZWZlcnJlZFJlbW90ZSksXG5cdFx0Li4uY2FuZGlkYXRlcy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5uYW1lID09PSAnb3JpZ2luJyAmJiBjYW5kaWRhdGUubmFtZSAhPT0gcHJlZmVycmVkUmVtb3RlKSxcblx0XHQuLi5jYW5kaWRhdGVzLmZpbHRlcihjYW5kaWRhdGUgPT4gIXByZWZlcnJlZE5hbWVzLmhhcyhjYW5kaWRhdGUubmFtZSkpLFxuXHRdO1xuXHRyZXR1cm4gWy4uLm5ldyBTZXQob3JkZXJlZC5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS51cmwpKV07XG59XG5cbmZ1bmN0aW9uIHBhcnNlRmV0Y2hSZW1vdGVzKHJlbW90ZXNPdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgbmFtZTogc3RyaW5nOyB1cmw6IHN0cmluZyB9W10gfCB1bmRlZmluZWQge1xuXHRpZiAocmVtb3Rlc091dHB1dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjYW5kaWRhdGVzOiB7IG5hbWU6IHN0cmluZzsgdXJsOiBzdHJpbmcgfVtdID0gW107XG5cdGZvciAoY29uc3QgcmF3TGluZSBvZiByZW1vdGVzT3V0cHV0LnNwbGl0KC9cXHI/XFxuLykpIHtcblx0XHRjb25zdCBtYXRjaCA9IC9eKFxcUyspXFxzKyhcXFMrKVxccytcXChmZXRjaFxcKSQvLmV4ZWMocmF3TGluZS50cmltKCkpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0Y2FuZGlkYXRlcy5wdXNoKHsgbmFtZTogbWF0Y2hbMV0sIHVybDogbWF0Y2hbMl0gfSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjYW5kaWRhdGVzO1xufVxuXG4vKipcbiAqIFBhcnNlIGBvd25lcmAgYW5kIGByZXBvYCBmcm9tIGBnaXQgcmVtb3RlIC12YCBvdXRwdXQuIFdoZW4gYHJlbW90ZU5hbWVgIGlzXG4gKiBwcm92aWRlZCwgb25seSB0aGF0IHJlbW90ZSBpcyBjb25zaWRlcmVkLiBPdGhlcndpc2UsIGBvcmlnaW5gIGlzIHByZWZlcnJlZC5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKHJlbW90ZXNPdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVtb3RlTmFtZT86IHN0cmluZyk6IHsgb3duZXI6IHN0cmluZzsgcmVwbzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRjb25zdCBjYW5kaWRhdGVzID0gcmVtb3RlTmFtZSA9PT0gdW5kZWZpbmVkXG5cdFx0PyBwYXJzZUZldGNoUmVtb3RlVXJscyhyZW1vdGVzT3V0cHV0KVxuXHRcdDogcGFyc2VGZXRjaFJlbW90ZXMocmVtb3Rlc091dHB1dCk/LmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLm5hbWUgPT09IHJlbW90ZU5hbWUpLm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnVybCk7XG5cdGlmICghY2FuZGlkYXRlcykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Zm9yIChjb25zdCB1cmwgb2YgY2FuZGlkYXRlcykge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlR2l0SHViT3duZXJSZXBvRnJvbVVybCh1cmwpO1xuXHRcdGlmIChwYXJzZWQpIHtcblx0XHRcdHJldHVybiBwYXJzZWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRXh0cmFjdCBge293bmVyLCByZXBvfWAgZnJvbSBhIEdpdEh1YiByZW1vdGUgVVJMLiBIYW5kbGVzIHRoZSBjb21tb25cbiAqIGZvcm1zOiBgZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwbyguZ2l0KT9gLCBgaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8oLmdpdCk/YCxcbiAqIGBzc2g6Ly9naXRAZ2l0aHViLmNvbS9vd25lci9yZXBvKC5naXQpP2AsIGBnaXQ6Ly9naXRodWIuY29tL293bmVyL3JlcG8oLmdpdCk/YC5cbiAqL1xuZnVuY3Rpb24gcGFyc2VHaXRIdWJPd25lclJlcG9Gcm9tVXJsKHVybDogc3RyaW5nKTogeyBvd25lcjogc3RyaW5nOyByZXBvOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdC8vIFNDUC1saWtlOiBnaXRAZ2l0aHViLmNvbTpvd25lci9yZXBvKC5naXQpP1xuXHRsZXQgbSA9IC9eW15AXFxzXStAZ2l0aHViXFwuY29tOihbXi9cXHNdKylcXC8oW14vXFxzXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWModXJsKTtcblx0aWYgKG0pIHtcblx0XHRyZXR1cm4geyBvd25lcjogbVsxXSwgcmVwbzogbVsyXSB9O1xuXHR9XG5cdC8vIFVSTC1mb3JtOiA8c2NoZW1lPjovL1t1c2VyQF1naXRodWIuY29tWzpwb3J0XS9vd25lci9yZXBvKC5naXQpP1xuXHRtID0gL15bYS16K10rOlxcL1xcLyg/OlteQFxcL1xcc10rQCk/Z2l0aHViXFwuY29tKD86OlxcZCspP1xcLyhbXi9cXHNdKylcXC8oW14vXFxzXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWModXJsKTtcblx0aWYgKG0pIHtcblx0XHRyZXR1cm4geyBvd25lcjogbVsxXSwgcmVwbzogbVsyXSB9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKiBFeHBvcnRlZCBmb3IgdGVzdHMuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VEZWZhdWx0QnJhbmNoUmVmKHN5bWJvbGljUmVmT3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZWYgPSBzeW1ib2xpY1JlZk91dHB1dD8udHJpbSgpO1xuXHRpZiAoIXJlZikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNvbnN0IHByZWZpeCA9ICdyZWZzL3JlbW90ZXMvb3JpZ2luLyc7XG5cdHJldHVybiByZWYuc3RhcnRzV2l0aChwcmVmaXgpID8gcmVmLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKSA6IHJlZjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVtb3RlQnJhbmNoUmVmKHJlZjogc3RyaW5nKTogeyByZWY6IHN0cmluZzsgbmFtZTogc3RyaW5nOyByZW1vdGU6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyZWYuc3RhcnRzV2l0aCgncmVmcy9yZW1vdGVzLycpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IG5hbWUgPSByZWYuc3Vic3RyaW5nKDEzKTtcblx0Y29uc3QgcmVtb3RlID0gbmFtZS5zcGxpdCgnLycpWzBdO1xuXHRyZXR1cm4geyByZWYsIG5hbWUsIHJlbW90ZSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VHaXRSZWZzKG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogR2l0UmVmW10ge1xuXHRpZiAoIW91dHB1dCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHJlZnM6IEdpdFJlZltdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiBvdXRwdXQuc3BsaXQoL1xccj9cXG4vZykpIHtcblx0XHRjb25zdCBbcmVmLCB1cHN0cmVhbV0gPSBsaW5lLnRyaW0oKS5zcGxpdCgnXFwwJyk7XG5cblx0XHRpZiAocmVmLnN0YXJ0c1dpdGgoJ3JlZnMvaGVhZHMvJykpIHtcblx0XHRcdHJlZnMucHVzaCh7XG5cdFx0XHRcdHJlZixcblx0XHRcdFx0bmFtZTogcmVmLnN1YnN0cmluZygxMSksXG5cdFx0XHRcdHVwc3RyZWFtOiB1cHN0cmVhbVxuXHRcdFx0XHRcdD8gcGFyc2VSZW1vdGVCcmFuY2hSZWYodXBzdHJlYW0pXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdGtpbmQ6IEdpdFJlZlR5cGUuSGVhZFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUJyYW5jaCk7XG5cdFx0fSBlbHNlIGlmIChyZWYuc3RhcnRzV2l0aCgncmVmcy9yZW1vdGVzLycpICYmICEvXnJlZnNcXC9yZW1vdGVzXFwvW14vXStcXC9IRUFEJC8udGVzdChyZWYpKSB7XG5cdFx0XHRjb25zdCBwYXJzZWRSZW1vdGVCcmFuY2ggPSBwYXJzZVJlbW90ZUJyYW5jaFJlZihyZWYpO1xuXHRcdFx0aWYgKHBhcnNlZFJlbW90ZUJyYW5jaCkge1xuXHRcdFx0XHRyZWZzLnB1c2goe1xuXHRcdFx0XHRcdC4uLnBhcnNlZFJlbW90ZUJyYW5jaCxcblx0XHRcdFx0XHRraW5kOiBHaXRSZWZUeXBlLlJlbW90ZUhlYWRcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVJlbW90ZUJyYW5jaCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZWYuc3RhcnRzV2l0aCgncmVmcy90YWdzLycpKSB7XG5cdFx0XHRyZWZzLnB1c2goe1xuXHRcdFx0XHRyZWYsXG5cdFx0XHRcdG5hbWU6IHJlZi5zdWJzdHJpbmcoMTApLFxuXHRcdFx0XHRraW5kOiBHaXRSZWZUeXBlLlRhZ1xuXHRcdFx0fSBzYXRpc2ZpZXMgSVRhZyk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlZnM7XG59XG5cbmZ1bmN0aW9uIHN0cmlwVW5kZWZpbmVkPFQgZXh0ZW5kcyBvYmplY3Q+KG9iajogVCk6IFQge1xuXHRjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcblx0XHRpZiAodiAhPT0gdW5kZWZpbmVkKSB7IG91dFtrXSA9IHY7IH1cblx0fVxuXHRyZXR1cm4gb3V0IGFzIFQ7XG59XG5cbmZ1bmN0aW9uIGlzTWF4QnVmZmVyRXJyb3IoZXJyb3I6IHVua25vd24pOiBib29sZWFuIHtcblx0Y29uc3QgY2F1c2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IuY2F1c2UgOiB1bmRlZmluZWQ7XG5cdHJldHVybiBjYXVzZSBpbnN0YW5jZW9mIEVycm9yICYmIChjYXVzZSBhcyBjcC5FeGVjRmlsZUV4Y2VwdGlvbikuY29kZSA9PT0gJ0VSUl9DSElMRF9QUk9DRVNTX1NURElPX01BWEJVRkZFUic7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFB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
