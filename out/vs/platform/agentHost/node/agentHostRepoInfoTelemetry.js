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
import { Limiter } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { relativePath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
const MAX_DIFFS_JSON_BYTES = 900 * 1024;
const MAX_DIFFS_JSON_CHARS = 50 * 8192;
const MAX_CHANGES = 100;
const MAX_MERGE_BASE_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
const MAX_DIFF_COMMITS = 30;
const DIFF_PATCH_CONCURRENCY = 4;
const MAX_DIFF_SIZE = 1e5;
function resolveRepoInfoRemote(remoteUrl, enterpriseHost) {
  const scpMatch = remoteUrl.includes("://") ? void 0 : /^(?:[^@\s]+@)?(?<host>[^:\s]+):(?<path>.+)$/.exec(remoteUrl);
  let host;
  let path;
  let normalizedRemoteUrl;
  if (scpMatch?.groups) {
    host = scpMatch.groups["host"];
    path = scpMatch.groups["path"];
    normalizedRemoteUrl = `https://${host}/${path}`;
  } else {
    let parsed;
    try {
      parsed = new URL(remoteUrl);
    } catch {
      return void 0;
    }
    host = parsed.host;
    path = parsed.pathname;
    normalizedRemoteUrl = `https://${host}${path}`;
  }
  const normalizedHost = host.toLowerCase();
  const normalizedHostname = normalizedHost.replace(/:\d+$/, "");
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  if (normalizedHostname === "github.com" || normalizedHost === enterpriseHost?.toLowerCase() || normalizedHostname === "ghe.com" || normalizedHostname.endsWith(".ghe.com")) {
    const match = /^(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
    if (!match?.groups) {
      return void 0;
    }
    return {
      remoteUrl: normalizedRemoteUrl,
      repoId: `${match.groups["owner"]}/${match.groups["repo"]}`.toLowerCase(),
      repoType: "github"
    };
  }
  let adoMatch = null;
  if (normalizedHostname === "dev.azure.com") {
    adoMatch = /^(?<org>[^/]+)\/(?<project>[^/]+)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
  } else if (normalizedHostname === "ssh.dev.azure.com") {
    adoMatch = /^v3\/(?<org>[^/]+)\/(?<project>[^/]+)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
  } else if (normalizedHostname.endsWith(".visualstudio.com")) {
    adoMatch = /^v3\/(?<org>[^/]+)\/(?<project>[^/]+)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath) ?? /^(?:[^/]+\/)?(?<project>[^/]+)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
    if (adoMatch?.groups && !adoMatch.groups["org"]) {
      adoMatch.groups["org"] = normalizedHostname.substring(0, normalizedHostname.length - ".visualstudio.com".length);
    }
  }
  if (!adoMatch?.groups?.["org"] || !adoMatch.groups["project"] || !adoMatch.groups["repo"]) {
    return void 0;
  }
  return {
    remoteUrl: normalizedRemoteUrl,
    repoId: `${adoMatch.groups["org"]}/${adoMatch.groups["project"]}/${adoMatch.groups["repo"]}`.toLowerCase(),
    repoType: "ado"
  };
}
function measureRepoInfoDiffsJSON(diffsJSON) {
  const diffSizeBytes = Buffer.byteLength(diffsJSON, "utf8");
  return {
    diffSizeBytes,
    tooLarge: diffSizeBytes > MAX_DIFFS_JSON_BYTES || diffsJSON.length > MAX_DIFFS_JSON_CHARS
  };
}
let AgentHostRepoInfoTelemetry = class extends Disposable {
  constructor(_reporter, _gitService, _gitHubEndpointService, _logService) {
    super();
    this._reporter = _reporter;
    this._gitService = _gitService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._logService = _logService;
    this._beginResults = /* @__PURE__ */ new Map();
    this._isDisposed = false;
  }
  async reportBegin(context, sessionUri, telemetryMessageId, clientType, workingDirectory, baseBranch, isContextCurrent) {
    let begin = this._beginResults.get(telemetryMessageId);
    if (!begin) {
      begin = {
        clientType,
        result: this._captureSafely(context, sessionUri, telemetryMessageId, clientType, "begin", workingDirectory, baseBranch, isContextCurrent)
      };
      this._beginResults.set(telemetryMessageId, begin);
    }
    await begin.result;
  }
  async reportEnd(context, sessionUri, telemetryMessageId, workingDirectory, baseBranch, isContextCurrent) {
    const begin = this._beginResults.get(telemetryMessageId);
    if (!begin) {
      return;
    }
    try {
      const beginResult = await begin.result;
      if (beginResult === "success" || beginResult === "noChanges") {
        await this._captureSafely(context, sessionUri, telemetryMessageId, begin.clientType, "end", workingDirectory, baseBranch, isContextCurrent);
      }
    } finally {
      this._beginResults.delete(telemetryMessageId);
    }
  }
  clearTurn(telemetryMessageId) {
    this._beginResults.delete(telemetryMessageId);
  }
  dispose() {
    this._isDisposed = true;
    this._beginResults.clear();
    super.dispose();
  }
  async _captureSafely(context, sessionUri, telemetryMessageId, clientType, location, workingDirectory, baseBranch, isContextCurrent) {
    try {
      return await this._capture(context, sessionUri, telemetryMessageId, clientType, location, workingDirectory, baseBranch, isContextCurrent);
    } catch (error) {
      this._logService.warn(`[AgentHostRepoInfoTelemetry] Failed to capture ${location} repo info: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  async _capture(telemetryContext, sessionUri, telemetryMessageId, clientType, location, workingDirectory, persistedBaseBranch, isContextCurrent) {
    if (!workingDirectory || !isContextCurrent() || !telemetryContext.restrictedTelemetryEnabled && !telemetryContext.isInternal) {
      return void 0;
    }
    const [gitState, untrackedPaths] = await Promise.all([
      this._gitService.getSessionGitState(workingDirectory),
      this._gitService.getUntrackedPaths(workingDirectory)
    ]);
    const upstreamRemote = gitState?.upstreamBranchName?.split("/")[0];
    const fetchRemoteUrls = await this._gitService.getFetchRemoteUrls(workingDirectory, upstreamRemote);
    const remote = fetchRemoteUrls?.map((url) => resolveRepoInfoRemote(url, this._gitHubEndpointService.getEnterpriseHost())).find((candidate) => candidate !== void 0);
    if (!remote) {
      return void 0;
    }
    const baseBranch = persistedBaseBranch ?? gitState?.upstreamBranchName ?? gitState?.baseBranchName ?? (await this._gitService.getDefaultBranch(workingDirectory))?.name;
    const [headBranchName, headCommitHash] = await Promise.all([
      gitState?.branchName ? Promise.resolve(gitState.branchName) : this._gitService.getCurrentBranch(workingDirectory),
      this._gitService.resolveBranchBaselineCommit(workingDirectory, baseBranch)
    ]);
    if (!headCommitHash) {
      return void 0;
    }
    const repoInfo = { ...remote, headCommitHash, headBranchName };
    const safety = await this._gitService.getBranchDiffSafetyInfo(workingDirectory, headCommitHash);
    if (!safety) {
      return void 0;
    }
    if (safety.hasVirtualFileSystem) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "virtualFileSystem", 0, 0, 0);
    }
    if (safety.baselineCommitTimestamp === void 0 || Date.now() - safety.baselineCommitTimestamp > MAX_MERGE_BASE_AGE_MS) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "mergeBaseTooOld", 0, 0, 0);
    }
    if (safety.commitCount === void 0 || safety.commitCount >= MAX_DIFF_COMMITS) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "tooManyCommits", 0, 0, 0);
    }
    const tree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
    if (!tree) {
      return void 0;
    }
    const fileDiffs = await this._gitService.computeFileDiffsBetweenRefs(workingDirectory, {
      sessionUri,
      fromRef: headCommitHash,
      toRef: tree
    });
    if (!fileDiffs) {
      return void 0;
    }
    if (fileDiffs.length === 0) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "noChanges", safety.workspaceFileCount, 0, 0);
    }
    if (fileDiffs.length > MAX_CHANGES) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "tooManyChanges", safety.workspaceFileCount, fileDiffs.length, 0);
    }
    const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const untracked = new Set(untrackedPaths ?? []);
    const descriptors = fileDiffs.map((diff) => this._describeFileDiff(repositoryRoot, diff, untracked));
    if (descriptors.some((descriptor) => descriptor === void 0)) {
      return void 0;
    }
    const resolvedDescriptors = descriptors;
    const fileRelativePaths = JSON.stringify([...new Set(resolvedDescriptors.map((descriptor) => descriptor.newPath ?? descriptor.oldPath).filter((path) => path !== void 0))]);
    if (telemetryContext.copilotIgnoreEnabled !== false) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "success", safety.workspaceFileCount, fileDiffs.length, 0, fileRelativePaths);
    }
    let patchTooLarge = false;
    const limiter = new Limiter(DIFF_PATCH_CONCURRENCY);
    const diffs = await Promise.all(resolvedDescriptors.map((descriptor) => limiter.queue(async () => {
      const paths = [descriptor.oldPath, descriptor.newPath].filter((path) => path !== void 0);
      const result = await this._gitService.getDiffPatchBetweenRefs(workingDirectory, { fromRef: headCommitHash, toRef: tree, paths, maxBuffer: MAX_DIFFS_JSON_BYTES });
      if (!result) {
        throw new Error(`Failed to compute diff for ${paths.join(", ")}`);
      }
      if (result.tooLarge) {
        patchTooLarge = true;
      }
      return {
        uri: descriptor.uri,
        originalUri: descriptor.originalUri,
        renameUri: descriptor.renameUri,
        status: descriptor.status,
        diff: truncateRepoInfoDiff(result.patch ?? "", descriptor.uri)
      };
    })));
    if (patchTooLarge) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "diffTooLarge", safety.workspaceFileCount, fileDiffs.length, MAX_DIFFS_JSON_BYTES + 1, fileRelativePaths);
    }
    const diffsJSON = JSON.stringify(diffs);
    const measurement = measureRepoInfoDiffsJSON(diffsJSON);
    if (measurement.tooLarge) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "diffTooLarge", safety.workspaceFileCount, fileDiffs.length, measurement.diffSizeBytes, fileRelativePaths);
    }
    return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "success", safety.workspaceFileCount, fileDiffs.length, measurement.diffSizeBytes, fileRelativePaths, diffsJSON);
  }
  async _reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, capturedTree, stableResult, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON) {
    const currentTree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
    if (!currentTree || currentTree !== capturedTree) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "filesChanged", workspaceFileCount, changedFileCount, 0);
    }
    return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, stableResult, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON);
  }
  _describeFileDiff(repositoryRoot, diff, untrackedPaths) {
    const beforeUri = diff.before?.uri;
    const afterUri = diff.after?.uri;
    const oldPath = beforeUri ? relativePath(repositoryRoot, URI.parse(beforeUri)) : void 0;
    const newPath = afterUri ? relativePath(repositoryRoot, URI.parse(afterUri)) : void 0;
    if (!oldPath && !newPath || !beforeUri && !afterUri) {
      return void 0;
    }
    const uri = afterUri ?? beforeUri;
    let status;
    if (!beforeUri) {
      status = newPath && untrackedPaths.has(newPath) ? "UNTRACKED" : "INDEX_ADDED";
    } else if (!afterUri) {
      status = "DELETED";
    } else if (beforeUri !== afterUri) {
      status = "INDEX_RENAMED";
    } else {
      status = "MODIFIED";
    }
    return {
      uri,
      originalUri: beforeUri ?? uri,
      renameUri: status === "INDEX_RENAMED" ? afterUri : void 0,
      status,
      oldPath,
      newPath
    };
  }
  _report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, result, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON) {
    if (this._isDisposed || !isContextCurrent()) {
      return result;
    }
    void this._reporter.reportRepoInfo(telemetryContext, {
      telemetryMessageId,
      clientType,
      location,
      remoteUrl: repoInfo.remoteUrl,
      repoId: repoInfo.repoId,
      repoType: repoInfo.repoType,
      headCommitHash: repoInfo.headCommitHash,
      headBranchName: repoInfo.headBranchName,
      fileRelativePaths,
      diffsJSON,
      result,
      isActiveRepository: "true",
      workspaceFileCount,
      changedFileCount,
      diffSizeBytes
    }).catch((err) => this._logService.trace(`[AgentHostRepoInfoTelemetry] Failed to report repo info: ${err instanceof Error ? err.message : String(err)}`));
    return result;
  }
};
AgentHostRepoInfoTelemetry = __decorateClass([
  __decorateParam(1, IAgentHostGitService),
  __decorateParam(2, IAgentHostGitHubEndpointService),
  __decorateParam(3, ILogService)
], AgentHostRepoInfoTelemetry);
function truncateRepoInfoDiff(diff, uri) {
  if (diff.length <= MAX_DIFF_SIZE) {
    return diff;
  }
  return `${diff.substring(0, MAX_DIFF_SIZE)}
... Diff truncated (exceeded ${MAX_DIFF_SIZE} characters) for ${uri}`;
}
export {
  AgentHostRepoInfoTelemetry,
  measureRepoInfoDiffsJSON,
  resolveRepoInfoRemote
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTGltaXRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2Vzc2lvbkZpbGVEaWZmIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudEhvc3RSZXBvSW5mb1Jlc3VsdCwgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi9hZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5LmpzJztcblxuY29uc3QgTUFYX0RJRkZTX0pTT05fQllURVMgPSA5MDAgKiAxMDI0O1xuY29uc3QgTUFYX0RJRkZTX0pTT05fQ0hBUlMgPSA1MCAqIDgxOTI7XG5jb25zdCBNQVhfQ0hBTkdFUyA9IDEwMDtcbmNvbnN0IE1BWF9NRVJHRV9CQVNFX0FHRV9NUyA9IDMwICogMjQgKiA2MCAqIDYwICogMTAwMDtcbmNvbnN0IE1BWF9ESUZGX0NPTU1JVFMgPSAzMDtcbmNvbnN0IERJRkZfUEFUQ0hfQ09OQ1VSUkVOQ1kgPSA0O1xuY29uc3QgTUFYX0RJRkZfU0laRSA9IDEwMF8wMDA7XG5cbmludGVyZmFjZSBJUmVwb0luZm9Db250ZXh0IGV4dGVuZHMgSVJlc29sdmVkUmVwb0luZm9SZW1vdGUge1xuXHRyZWFkb25seSBoZWFkQ29tbWl0SGFzaDogc3RyaW5nO1xuXHRyZWFkb25seSBoZWFkQnJhbmNoTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSVJlcG9JbmZvRmlsZURlc2NyaXB0b3Ige1xuXHRyZWFkb25seSB1cmk6IHN0cmluZztcblx0cmVhZG9ubHkgb3JpZ2luYWxVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgcmVuYW1lVXJpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHN0YXR1czogJ0lOREVYX0FEREVEJyB8ICdNT0RJRklFRCcgfCAnREVMRVRFRCcgfCAnSU5ERVhfUkVOQU1FRCcgfCAnVU5UUkFDS0VEJztcblx0cmVhZG9ubHkgb2xkUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBuZXdQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbnR5cGUgUmVwb0luZm9UZWxlbWV0cnlSZXBvcnRlciA9IFBpY2s8QWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIsICdyZXBvcnRSZXBvSW5mbyc+O1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZFJlcG9JbmZvUmVtb3RlIHtcblx0cmVhZG9ubHkgcmVtb3RlVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG9JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXBvVHlwZTogJ2dpdGh1YicgfCAnYWRvJztcbn1cblxuLyoqIFJlc29sdmVzIGEgR2l0SHViLCBHaXRIdWIgRW50ZXJwcmlzZSwgb3IgQXp1cmUgRGV2T3BzIGZldGNoIFVSTC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUmVwb0luZm9SZW1vdGUocmVtb3RlVXJsOiBzdHJpbmcsIGVudGVycHJpc2VIb3N0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJUmVzb2x2ZWRSZXBvSW5mb1JlbW90ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNjcE1hdGNoID0gcmVtb3RlVXJsLmluY2x1ZGVzKCc6Ly8nKSA/IHVuZGVmaW5lZCA6IC9eKD86W15AXFxzXStAKT8oPzxob3N0PlteOlxcc10rKTooPzxwYXRoPi4rKSQvLmV4ZWMocmVtb3RlVXJsKTtcblx0bGV0IGhvc3Q6IHN0cmluZztcblx0bGV0IHBhdGg6IHN0cmluZztcblx0bGV0IG5vcm1hbGl6ZWRSZW1vdGVVcmw6IHN0cmluZztcblx0aWYgKHNjcE1hdGNoPy5ncm91cHMpIHtcblx0XHRob3N0ID0gc2NwTWF0Y2guZ3JvdXBzWydob3N0J107XG5cdFx0cGF0aCA9IHNjcE1hdGNoLmdyb3Vwc1sncGF0aCddO1xuXHRcdG5vcm1hbGl6ZWRSZW1vdGVVcmwgPSBgaHR0cHM6Ly8ke2hvc3R9LyR7cGF0aH1gO1xuXHR9IGVsc2Uge1xuXHRcdGxldCBwYXJzZWQ6IFVSTDtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gbmV3IFVSTChyZW1vdGVVcmwpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aG9zdCA9IHBhcnNlZC5ob3N0O1xuXHRcdHBhdGggPSBwYXJzZWQucGF0aG5hbWU7XG5cdFx0bm9ybWFsaXplZFJlbW90ZVVybCA9IGBodHRwczovLyR7aG9zdH0ke3BhdGh9YDtcblx0fVxuXG5cdGNvbnN0IG5vcm1hbGl6ZWRIb3N0ID0gaG9zdC50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBub3JtYWxpemVkSG9zdG5hbWUgPSBub3JtYWxpemVkSG9zdC5yZXBsYWNlKC86XFxkKyQvLCAnJyk7XG5cdGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcGF0aC5yZXBsYWNlKC9eXFwvK3xcXC8rJC9nLCAnJyk7XG5cdGlmIChub3JtYWxpemVkSG9zdG5hbWUgPT09ICdnaXRodWIuY29tJyB8fCBub3JtYWxpemVkSG9zdCA9PT0gZW50ZXJwcmlzZUhvc3Q/LnRvTG93ZXJDYXNlKCkgfHwgbm9ybWFsaXplZEhvc3RuYW1lID09PSAnZ2hlLmNvbScgfHwgbm9ybWFsaXplZEhvc3RuYW1lLmVuZHNXaXRoKCcuZ2hlLmNvbScpKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXig/PG93bmVyPlteL10rKVxcLyg/PHJlcG8+W14vXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWMobm9ybWFsaXplZFBhdGgpO1xuXHRcdGlmICghbWF0Y2g/Lmdyb3Vwcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW90ZVVybDogbm9ybWFsaXplZFJlbW90ZVVybCxcblx0XHRcdHJlcG9JZDogYCR7bWF0Y2guZ3JvdXBzWydvd25lciddfS8ke21hdGNoLmdyb3Vwc1sncmVwbyddfWAudG9Mb3dlckNhc2UoKSxcblx0XHRcdHJlcG9UeXBlOiAnZ2l0aHViJyxcblx0XHR9O1xuXHR9XG5cblx0bGV0IGFkb01hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsID0gbnVsbDtcblx0aWYgKG5vcm1hbGl6ZWRIb3N0bmFtZSA9PT0gJ2Rldi5henVyZS5jb20nKSB7XG5cdFx0YWRvTWF0Y2ggPSAvXig/PG9yZz5bXi9dKylcXC8oPzxwcm9qZWN0PlteL10rKVxcL19naXRcXC8oPzpfKD86b3B0aW1pemVkfGZ1bGwpXFwvKT8oPzxyZXBvPlteL10rPykoPzpcXC5naXQpPyQvaS5leGVjKG5vcm1hbGl6ZWRQYXRoKTtcblx0fSBlbHNlIGlmIChub3JtYWxpemVkSG9zdG5hbWUgPT09ICdzc2guZGV2LmF6dXJlLmNvbScpIHtcblx0XHRhZG9NYXRjaCA9IC9edjNcXC8oPzxvcmc+W14vXSspXFwvKD88cHJvamVjdD5bXi9dKylcXC8oPzpfKD86b3B0aW1pemVkfGZ1bGwpXFwvKT8oPzxyZXBvPlteL10rPykoPzpcXC5naXQpPyQvaS5leGVjKG5vcm1hbGl6ZWRQYXRoKTtcblx0fSBlbHNlIGlmIChub3JtYWxpemVkSG9zdG5hbWUuZW5kc1dpdGgoJy52aXN1YWxzdHVkaW8uY29tJykpIHtcblx0XHRhZG9NYXRjaCA9IC9edjNcXC8oPzxvcmc+W14vXSspXFwvKD88cHJvamVjdD5bXi9dKylcXC8oPzpfKD86b3B0aW1pemVkfGZ1bGwpXFwvKT8oPzxyZXBvPlteL10rPykoPzpcXC5naXQpPyQvaS5leGVjKG5vcm1hbGl6ZWRQYXRoKVxuXHRcdFx0Pz8gL14oPzpbXi9dK1xcLyk/KD88cHJvamVjdD5bXi9dKylcXC9fZ2l0XFwvKD86Xyg/Om9wdGltaXplZHxmdWxsKVxcLyk/KD88cmVwbz5bXi9dKz8pKD86XFwuZ2l0KT8kL2kuZXhlYyhub3JtYWxpemVkUGF0aCk7XG5cdFx0aWYgKGFkb01hdGNoPy5ncm91cHMgJiYgIWFkb01hdGNoLmdyb3Vwc1snb3JnJ10pIHtcblx0XHRcdGFkb01hdGNoLmdyb3Vwc1snb3JnJ10gPSBub3JtYWxpemVkSG9zdG5hbWUuc3Vic3RyaW5nKDAsIG5vcm1hbGl6ZWRIb3N0bmFtZS5sZW5ndGggLSAnLnZpc3VhbHN0dWRpby5jb20nLmxlbmd0aCk7XG5cdFx0fVxuXHR9XG5cdGlmICghYWRvTWF0Y2g/Lmdyb3Vwcz8uWydvcmcnXSB8fCAhYWRvTWF0Y2guZ3JvdXBzWydwcm9qZWN0J10gfHwgIWFkb01hdGNoLmdyb3Vwc1sncmVwbyddKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHJlbW90ZVVybDogbm9ybWFsaXplZFJlbW90ZVVybCxcblx0XHRyZXBvSWQ6IGAke2Fkb01hdGNoLmdyb3Vwc1snb3JnJ119LyR7YWRvTWF0Y2guZ3JvdXBzWydwcm9qZWN0J119LyR7YWRvTWF0Y2guZ3JvdXBzWydyZXBvJ119YC50b0xvd2VyQ2FzZSgpLFxuXHRcdHJlcG9UeXBlOiAnYWRvJyxcblx0fTtcbn1cblxuLyoqIE1lYXN1cmVzIGEgc2VyaWFsaXplZCBkaWZmIHBheWxvYWQgdXNpbmcgdGhlIHR3byBsaW1pdHMgYXBwbGllZCBieSB0aGUgbGVnYWN5IGV4dGVuc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZWFzdXJlUmVwb0luZm9EaWZmc0pTT04oZGlmZnNKU09OOiBzdHJpbmcpOiB7IHJlYWRvbmx5IGRpZmZTaXplQnl0ZXM6IG51bWJlcjsgcmVhZG9ubHkgdG9vTGFyZ2U6IGJvb2xlYW4gfSB7XG5cdGNvbnN0IGRpZmZTaXplQnl0ZXMgPSBCdWZmZXIuYnl0ZUxlbmd0aChkaWZmc0pTT04sICd1dGY4Jyk7XG5cdHJldHVybiB7XG5cdFx0ZGlmZlNpemVCeXRlcyxcblx0XHR0b29MYXJnZTogZGlmZlNpemVCeXRlcyA+IE1BWF9ESUZGU19KU09OX0JZVEVTIHx8IGRpZmZzSlNPTi5sZW5ndGggPiBNQVhfRElGRlNfSlNPTl9DSEFSUyxcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JlZ2luUmVzdWx0cyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGU7IHJlYWRvbmx5IHJlc3VsdDogUHJvbWlzZTxBZ2VudEhvc3RSZXBvSW5mb1Jlc3VsdCB8IHVuZGVmaW5lZD4gfT4oKTtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9ydGVyOiBSZXBvSW5mb1RlbGVtZXRyeVJlcG9ydGVyLFxuXHRcdEBJQWdlbnRIb3N0R2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJFbmRwb2ludFNlcnZpY2U6IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcmVwb3J0QmVnaW4oY29udGV4dDogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0LCBzZXNzaW9uVXJpOiBzdHJpbmcsIHRlbGVtZXRyeU1lc3NhZ2VJZDogc3RyaW5nLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCwgaXNDb250ZXh0Q3VycmVudDogKCkgPT4gYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBiZWdpbiA9IHRoaXMuX2JlZ2luUmVzdWx0cy5nZXQodGVsZW1ldHJ5TWVzc2FnZUlkKTtcblx0XHRpZiAoIWJlZ2luKSB7XG5cdFx0XHRiZWdpbiA9IHtcblx0XHRcdFx0Y2xpZW50VHlwZSxcblx0XHRcdFx0cmVzdWx0OiB0aGlzLl9jYXB0dXJlU2FmZWx5KGNvbnRleHQsIHNlc3Npb25VcmksIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgJ2JlZ2luJywgd29ya2luZ0RpcmVjdG9yeSwgYmFzZUJyYW5jaCwgaXNDb250ZXh0Q3VycmVudCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYmVnaW5SZXN1bHRzLnNldCh0ZWxlbWV0cnlNZXNzYWdlSWQsIGJlZ2luKTtcblx0XHR9XG5cdFx0YXdhaXQgYmVnaW4ucmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVwb3J0RW5kKGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCwgc2Vzc2lvblVyaTogc3RyaW5nLCB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzQ29udGV4dEN1cnJlbnQ6ICgpID0+IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiZWdpbiA9IHRoaXMuX2JlZ2luUmVzdWx0cy5nZXQodGVsZW1ldHJ5TWVzc2FnZUlkKTtcblx0XHRpZiAoIWJlZ2luKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBiZWdpblJlc3VsdCA9IGF3YWl0IGJlZ2luLnJlc3VsdDtcblx0XHRcdGlmIChiZWdpblJlc3VsdCA9PT0gJ3N1Y2Nlc3MnIHx8IGJlZ2luUmVzdWx0ID09PSAnbm9DaGFuZ2VzJykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jYXB0dXJlU2FmZWx5KGNvbnRleHQsIHNlc3Npb25VcmksIHRlbGVtZXRyeU1lc3NhZ2VJZCwgYmVnaW4uY2xpZW50VHlwZSwgJ2VuZCcsIHdvcmtpbmdEaXJlY3RvcnksIGJhc2VCcmFuY2gsIGlzQ29udGV4dEN1cnJlbnQpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9iZWdpblJlc3VsdHMuZGVsZXRlKHRlbGVtZXRyeU1lc3NhZ2VJZCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJUdXJuKHRlbGVtZXRyeU1lc3NhZ2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYmVnaW5SZXN1bHRzLmRlbGV0ZSh0ZWxlbWV0cnlNZXNzYWdlSWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9iZWdpblJlc3VsdHMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlU2FmZWx5KGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCwgc2Vzc2lvblVyaTogc3RyaW5nLCB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZywgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZSwgbG9jYXRpb246ICdiZWdpbicgfCAnZW5kJywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzQ29udGV4dEN1cnJlbnQ6ICgpID0+IGJvb2xlYW4pOiBQcm9taXNlPEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9jYXB0dXJlKGNvbnRleHQsIHNlc3Npb25VcmksIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHdvcmtpbmdEaXJlY3RvcnksIGJhc2VCcmFuY2gsIGlzQ29udGV4dEN1cnJlbnQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeV0gRmFpbGVkIHRvIGNhcHR1cmUgJHtsb2NhdGlvbn0gcmVwbyBpbmZvOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2FwdHVyZSh0ZWxlbWV0cnlDb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIHNlc3Npb25Vcmk6IHN0cmluZywgdGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmcsIGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUsIGxvY2F0aW9uOiAnYmVnaW4nIHwgJ2VuZCcsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgcGVyc2lzdGVkQmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0NvbnRleHRDdXJyZW50OiAoKSA9PiBib29sZWFuKTogUHJvbWlzZTxBZ2VudEhvc3RSZXBvSW5mb1Jlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSB8fCAhaXNDb250ZXh0Q3VycmVudCgpIHx8ICghdGVsZW1ldHJ5Q29udGV4dC5yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCAmJiAhdGVsZW1ldHJ5Q29udGV4dC5pc0ludGVybmFsKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBbZ2l0U3RhdGUsIHVudHJhY2tlZFBhdGhzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX2dpdFNlcnZpY2UuZ2V0U2Vzc2lvbkdpdFN0YXRlKHdvcmtpbmdEaXJlY3RvcnkpLFxuXHRcdFx0dGhpcy5fZ2l0U2VydmljZS5nZXRVbnRyYWNrZWRQYXRocyh3b3JraW5nRGlyZWN0b3J5KSxcblx0XHRdKTtcblx0XHRjb25zdCB1cHN0cmVhbVJlbW90ZSA9IGdpdFN0YXRlPy51cHN0cmVhbUJyYW5jaE5hbWU/LnNwbGl0KCcvJylbMF07XG5cdFx0Y29uc3QgZmV0Y2hSZW1vdGVVcmxzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRGZXRjaFJlbW90ZVVybHMod29ya2luZ0RpcmVjdG9yeSwgdXBzdHJlYW1SZW1vdGUpO1xuXHRcdGNvbnN0IHJlbW90ZSA9IGZldGNoUmVtb3RlVXJsc1xuXHRcdFx0Py5tYXAodXJsID0+IHJlc29sdmVSZXBvSW5mb1JlbW90ZSh1cmwsIHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRFbnRlcnByaXNlSG9zdCgpKSlcblx0XHRcdC5maW5kKChjYW5kaWRhdGUpOiBjYW5kaWRhdGUgaXMgSVJlc29sdmVkUmVwb0luZm9SZW1vdGUgPT4gY2FuZGlkYXRlICE9PSB1bmRlZmluZWQpO1xuXHRcdGlmICghcmVtb3RlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJhc2VCcmFuY2ggPSBwZXJzaXN0ZWRCYXNlQnJhbmNoID8/IGdpdFN0YXRlPy51cHN0cmVhbUJyYW5jaE5hbWUgPz8gZ2l0U3RhdGU/LmJhc2VCcmFuY2hOYW1lID8/IChhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2god29ya2luZ0RpcmVjdG9yeSkpPy5uYW1lO1xuXHRcdGNvbnN0IFtoZWFkQnJhbmNoTmFtZSwgaGVhZENvbW1pdEhhc2hdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0Z2l0U3RhdGU/LmJyYW5jaE5hbWUgPyBQcm9taXNlLnJlc29sdmUoZ2l0U3RhdGUuYnJhbmNoTmFtZSkgOiB0aGlzLl9naXRTZXJ2aWNlLmdldEN1cnJlbnRCcmFuY2god29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHR0aGlzLl9naXRTZXJ2aWNlLnJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdCh3b3JraW5nRGlyZWN0b3J5LCBiYXNlQnJhbmNoKSxcblx0XHRdKTtcblx0XHRpZiAoIWhlYWRDb21taXRIYXNoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXBvSW5mbzogSVJlcG9JbmZvQ29udGV4dCA9IHsgLi4ucmVtb3RlLCBoZWFkQ29tbWl0SGFzaCwgaGVhZEJyYW5jaE5hbWUgfTtcblx0XHRjb25zdCBzYWZldHkgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldEJyYW5jaERpZmZTYWZldHlJbmZvKHdvcmtpbmdEaXJlY3RvcnksIGhlYWRDb21taXRIYXNoKTtcblx0XHRpZiAoIXNhZmV0eSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHNhZmV0eS5oYXNWaXJ0dWFsRmlsZVN5c3RlbSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlcG9ydCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgJ3ZpcnR1YWxGaWxlU3lzdGVtJywgMCwgMCwgMCk7XG5cdFx0fVxuXHRcdGlmIChzYWZldHkuYmFzZWxpbmVDb21taXRUaW1lc3RhbXAgPT09IHVuZGVmaW5lZCB8fCBEYXRlLm5vdygpIC0gc2FmZXR5LmJhc2VsaW5lQ29tbWl0VGltZXN0YW1wID4gTUFYX01FUkdFX0JBU0VfQUdFX01TKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVwb3J0KHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCAnbWVyZ2VCYXNlVG9vT2xkJywgMCwgMCwgMCk7XG5cdFx0fVxuXHRcdGlmIChzYWZldHkuY29tbWl0Q291bnQgPT09IHVuZGVmaW5lZCB8fCBzYWZldHkuY29tbWl0Q291bnQgPj0gTUFYX0RJRkZfQ09NTUlUUykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlcG9ydCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgJ3Rvb01hbnlDb21taXRzJywgMCwgMCwgMCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRyZWUgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZURpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMod29ya2luZ0RpcmVjdG9yeSwge1xuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdGZyb21SZWY6IGhlYWRDb21taXRIYXNoLFxuXHRcdFx0dG9SZWY6IHRyZWUsXG5cdFx0fSk7XG5cdFx0aWYgKCFmaWxlRGlmZnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChmaWxlRGlmZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcmVwb3J0SWZUcmVlVW5jaGFuZ2VkKHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCB3b3JraW5nRGlyZWN0b3J5LCB0cmVlLCAnbm9DaGFuZ2VzJywgc2FmZXR5LndvcmtzcGFjZUZpbGVDb3VudCwgMCwgMCk7XG5cdFx0fVxuXHRcdGlmIChmaWxlRGlmZnMubGVuZ3RoID4gTUFYX0NIQU5HRVMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBvcnQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sICd0b29NYW55Q2hhbmdlcycsIHNhZmV0eS53b3Jrc3BhY2VGaWxlQ291bnQsIGZpbGVEaWZmcy5sZW5ndGgsIDApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1bnRyYWNrZWQgPSBuZXcgU2V0KHVudHJhY2tlZFBhdGhzID8/IFtdKTtcblx0XHRjb25zdCBkZXNjcmlwdG9ycyA9IGZpbGVEaWZmcy5tYXAoZGlmZiA9PiB0aGlzLl9kZXNjcmliZUZpbGVEaWZmKHJlcG9zaXRvcnlSb290LCBkaWZmLCB1bnRyYWNrZWQpKTtcblx0XHRpZiAoZGVzY3JpcHRvcnMuc29tZShkZXNjcmlwdG9yID0+IGRlc2NyaXB0b3IgPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkRGVzY3JpcHRvcnMgPSBkZXNjcmlwdG9ycyBhcyBJUmVwb0luZm9GaWxlRGVzY3JpcHRvcltdO1xuXHRcdGNvbnN0IGZpbGVSZWxhdGl2ZVBhdGhzID0gSlNPTi5zdHJpbmdpZnkoWy4uLm5ldyBTZXQocmVzb2x2ZWREZXNjcmlwdG9ycy5tYXAoZGVzY3JpcHRvciA9PiBkZXNjcmlwdG9yLm5ld1BhdGggPz8gZGVzY3JpcHRvci5vbGRQYXRoKS5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiBwYXRoICE9PSB1bmRlZmluZWQpKV0pO1xuXHRcdC8vIFRoZSBTREsgZG9lcyBub3QgZXhwb3NlIHBlci1wYXRoIGV4Y2x1c2lvbiBkZWNpc2lvbnMgeWV0LCBzbyB3aXRoaG9sZCBwYXRjaCBjb250ZW50IHVubGVzcyBleGNsdXNpb24gaXMgZXhwbGljaXRseSBkaXNhYmxlZC5cblx0XHRpZiAodGVsZW1ldHJ5Q29udGV4dC5jb3BpbG90SWdub3JlRW5hYmxlZCAhPT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9yZXBvcnRJZlRyZWVVbmNoYW5nZWQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sIHdvcmtpbmdEaXJlY3RvcnksIHRyZWUsICdzdWNjZXNzJywgc2FmZXR5LndvcmtzcGFjZUZpbGVDb3VudCwgZmlsZURpZmZzLmxlbmd0aCwgMCwgZmlsZVJlbGF0aXZlUGF0aHMpO1xuXHRcdH1cblx0XHRsZXQgcGF0Y2hUb29MYXJnZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjx7IHJlYWRvbmx5IHVyaTogc3RyaW5nOyByZWFkb25seSBvcmlnaW5hbFVyaTogc3RyaW5nOyByZWFkb25seSByZW5hbWVVcmk6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgc3RhdHVzOiBzdHJpbmc7IHJlYWRvbmx5IGRpZmY6IHN0cmluZyB9PihESUZGX1BBVENIX0NPTkNVUlJFTkNZKTtcblx0XHRjb25zdCBkaWZmcyA9IGF3YWl0IFByb21pc2UuYWxsKHJlc29sdmVkRGVzY3JpcHRvcnMubWFwKGRlc2NyaXB0b3IgPT4gbGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRocyA9IFtkZXNjcmlwdG9yLm9sZFBhdGgsIGRlc2NyaXB0b3IubmV3UGF0aF0uZmlsdGVyKChwYXRoKTogcGF0aCBpcyBzdHJpbmcgPT4gcGF0aCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0RGlmZlBhdGNoQmV0d2VlblJlZnMod29ya2luZ0RpcmVjdG9yeSwgeyBmcm9tUmVmOiBoZWFkQ29tbWl0SGFzaCwgdG9SZWY6IHRyZWUsIHBhdGhzLCBtYXhCdWZmZXI6IE1BWF9ESUZGU19KU09OX0JZVEVTIH0pO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY29tcHV0ZSBkaWZmIGZvciAke3BhdGhzLmpvaW4oJywgJyl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0LnRvb0xhcmdlKSB7XG5cdFx0XHRcdHBhdGNoVG9vTGFyZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBkZXNjcmlwdG9yLnVyaSxcblx0XHRcdFx0b3JpZ2luYWxVcmk6IGRlc2NyaXB0b3Iub3JpZ2luYWxVcmksXG5cdFx0XHRcdHJlbmFtZVVyaTogZGVzY3JpcHRvci5yZW5hbWVVcmksXG5cdFx0XHRcdHN0YXR1czogZGVzY3JpcHRvci5zdGF0dXMsXG5cdFx0XHRcdGRpZmY6IHRydW5jYXRlUmVwb0luZm9EaWZmKHJlc3VsdC5wYXRjaCA/PyAnJywgZGVzY3JpcHRvci51cmkpLFxuXHRcdFx0fTtcblx0XHR9KSkpO1xuXHRcdGlmIChwYXRjaFRvb0xhcmdlKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcmVwb3J0SWZUcmVlVW5jaGFuZ2VkKHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCB3b3JraW5nRGlyZWN0b3J5LCB0cmVlLCAnZGlmZlRvb0xhcmdlJywgc2FmZXR5LndvcmtzcGFjZUZpbGVDb3VudCwgZmlsZURpZmZzLmxlbmd0aCwgTUFYX0RJRkZTX0pTT05fQllURVMgKyAxLCBmaWxlUmVsYXRpdmVQYXRocyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRpZmZzSlNPTiA9IEpTT04uc3RyaW5naWZ5KGRpZmZzKTtcblx0XHRjb25zdCBtZWFzdXJlbWVudCA9IG1lYXN1cmVSZXBvSW5mb0RpZmZzSlNPTihkaWZmc0pTT04pO1xuXHRcdGlmIChtZWFzdXJlbWVudC50b29MYXJnZSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3JlcG9ydElmVHJlZVVuY2hhbmdlZCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgd29ya2luZ0RpcmVjdG9yeSwgdHJlZSwgJ2RpZmZUb29MYXJnZScsIHNhZmV0eS53b3Jrc3BhY2VGaWxlQ291bnQsIGZpbGVEaWZmcy5sZW5ndGgsIG1lYXN1cmVtZW50LmRpZmZTaXplQnl0ZXMsIGZpbGVSZWxhdGl2ZVBhdGhzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3JlcG9ydElmVHJlZVVuY2hhbmdlZCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgd29ya2luZ0RpcmVjdG9yeSwgdHJlZSwgJ3N1Y2Nlc3MnLCBzYWZldHkud29ya3NwYWNlRmlsZUNvdW50LCBmaWxlRGlmZnMubGVuZ3RoLCBtZWFzdXJlbWVudC5kaWZmU2l6ZUJ5dGVzLCBmaWxlUmVsYXRpdmVQYXRocywgZGlmZnNKU09OKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlcG9ydElmVHJlZVVuY2hhbmdlZCh0ZWxlbWV0cnlDb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQ6ICgpID0+IGJvb2xlYW4sIHRlbGVtZXRyeU1lc3NhZ2VJZDogc3RyaW5nLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLCBsb2NhdGlvbjogJ2JlZ2luJyB8ICdlbmQnLCByZXBvSW5mbzogSVJlcG9JbmZvQ29udGV4dCwgd29ya2luZ0RpcmVjdG9yeTogVVJJLCBjYXB0dXJlZFRyZWU6IHN0cmluZywgc3RhYmxlUmVzdWx0OiAnc3VjY2VzcycgfCAnbm9DaGFuZ2VzJyB8ICdkaWZmVG9vTGFyZ2UnLCB3b3Jrc3BhY2VGaWxlQ291bnQ6IG51bWJlciwgY2hhbmdlZEZpbGVDb3VudDogbnVtYmVyLCBkaWZmU2l6ZUJ5dGVzOiBudW1iZXIsIGZpbGVSZWxhdGl2ZVBhdGhzPzogc3RyaW5nLCBkaWZmc0pTT04/OiBzdHJpbmcpOiBQcm9taXNlPEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0PiB7XG5cdFx0Y29uc3QgY3VycmVudFRyZWUgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWN1cnJlbnRUcmVlIHx8IGN1cnJlbnRUcmVlICE9PSBjYXB0dXJlZFRyZWUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBvcnQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sICdmaWxlc0NoYW5nZWQnLCB3b3Jrc3BhY2VGaWxlQ291bnQsIGNoYW5nZWRGaWxlQ291bnQsIDApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVwb3J0KHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCBzdGFibGVSZXN1bHQsIHdvcmtzcGFjZUZpbGVDb3VudCwgY2hhbmdlZEZpbGVDb3VudCwgZGlmZlNpemVCeXRlcywgZmlsZVJlbGF0aXZlUGF0aHMsIGRpZmZzSlNPTik7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNjcmliZUZpbGVEaWZmKHJlcG9zaXRvcnlSb290OiBVUkksIGRpZmY6IElTZXNzaW9uRmlsZURpZmYsIHVudHJhY2tlZFBhdGhzOiBSZWFkb25seVNldDxzdHJpbmc+KTogSVJlcG9JbmZvRmlsZURlc2NyaXB0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJlZm9yZVVyaSA9IGRpZmYuYmVmb3JlPy51cmk7XG5cdFx0Y29uc3QgYWZ0ZXJVcmkgPSBkaWZmLmFmdGVyPy51cmk7XG5cdFx0Y29uc3Qgb2xkUGF0aCA9IGJlZm9yZVVyaSA/IHJlbGF0aXZlUGF0aChyZXBvc2l0b3J5Um9vdCwgVVJJLnBhcnNlKGJlZm9yZVVyaSkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG5ld1BhdGggPSBhZnRlclVyaSA/IHJlbGF0aXZlUGF0aChyZXBvc2l0b3J5Um9vdCwgVVJJLnBhcnNlKGFmdGVyVXJpKSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCghb2xkUGF0aCAmJiAhbmV3UGF0aCkgfHwgKCFiZWZvcmVVcmkgJiYgIWFmdGVyVXJpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdXJpID0gYWZ0ZXJVcmkgPz8gYmVmb3JlVXJpITtcblx0XHRsZXQgc3RhdHVzOiBJUmVwb0luZm9GaWxlRGVzY3JpcHRvclsnc3RhdHVzJ107XG5cdFx0aWYgKCFiZWZvcmVVcmkpIHtcblx0XHRcdHN0YXR1cyA9IG5ld1BhdGggJiYgdW50cmFja2VkUGF0aHMuaGFzKG5ld1BhdGgpID8gJ1VOVFJBQ0tFRCcgOiAnSU5ERVhfQURERUQnO1xuXHRcdH0gZWxzZSBpZiAoIWFmdGVyVXJpKSB7XG5cdFx0XHRzdGF0dXMgPSAnREVMRVRFRCc7XG5cdFx0fSBlbHNlIGlmIChiZWZvcmVVcmkgIT09IGFmdGVyVXJpKSB7XG5cdFx0XHRzdGF0dXMgPSAnSU5ERVhfUkVOQU1FRCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXR1cyA9ICdNT0RJRklFRCc7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmksXG5cdFx0XHRvcmlnaW5hbFVyaTogYmVmb3JlVXJpID8/IHVyaSxcblx0XHRcdHJlbmFtZVVyaTogc3RhdHVzID09PSAnSU5ERVhfUkVOQU1FRCcgPyBhZnRlclVyaSA6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXR1cyxcblx0XHRcdG9sZFBhdGgsXG5cdFx0XHRuZXdQYXRoLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnQodGVsZW1ldHJ5Q29udGV4dDogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50OiAoKSA9PiBib29sZWFuLCB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZywgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZSwgbG9jYXRpb246ICdiZWdpbicgfCAnZW5kJywgcmVwb0luZm86IElSZXBvSW5mb0NvbnRleHQsIHJlc3VsdDogQWdlbnRIb3N0UmVwb0luZm9SZXN1bHQsIHdvcmtzcGFjZUZpbGVDb3VudDogbnVtYmVyLCBjaGFuZ2VkRmlsZUNvdW50OiBudW1iZXIsIGRpZmZTaXplQnl0ZXM6IG51bWJlciwgZmlsZVJlbGF0aXZlUGF0aHM/OiBzdHJpbmcsIGRpZmZzSlNPTj86IHN0cmluZyk6IEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCB8fCAhaXNDb250ZXh0Q3VycmVudCgpKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHR2b2lkIHRoaXMuX3JlcG9ydGVyLnJlcG9ydFJlcG9JbmZvKHRlbGVtZXRyeUNvbnRleHQsIHtcblx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZCxcblx0XHRcdGNsaWVudFR5cGUsXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdHJlbW90ZVVybDogcmVwb0luZm8ucmVtb3RlVXJsLFxuXHRcdFx0cmVwb0lkOiByZXBvSW5mby5yZXBvSWQsXG5cdFx0XHRyZXBvVHlwZTogcmVwb0luZm8ucmVwb1R5cGUsXG5cdFx0XHRoZWFkQ29tbWl0SGFzaDogcmVwb0luZm8uaGVhZENvbW1pdEhhc2gsXG5cdFx0XHRoZWFkQnJhbmNoTmFtZTogcmVwb0luZm8uaGVhZEJyYW5jaE5hbWUsXG5cdFx0XHRmaWxlUmVsYXRpdmVQYXRocyxcblx0XHRcdGRpZmZzSlNPTixcblx0XHRcdHJlc3VsdCxcblx0XHRcdGlzQWN0aXZlUmVwb3NpdG9yeTogJ3RydWUnLFxuXHRcdFx0d29ya3NwYWNlRmlsZUNvdW50LFxuXHRcdFx0Y2hhbmdlZEZpbGVDb3VudCxcblx0XHRcdGRpZmZTaXplQnl0ZXMsXG5cdFx0fSkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeV0gRmFpbGVkIHRvIHJlcG9ydCByZXBvIGluZm86ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlUmVwb0luZm9EaWZmKGRpZmY6IHN0cmluZywgdXJpOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoZGlmZi5sZW5ndGggPD0gTUFYX0RJRkZfU0laRSkge1xuXHRcdHJldHVybiBkaWZmO1xuXHR9XG5cdHJldHVybiBgJHtkaWZmLnN1YnN0cmluZygwLCBNQVhfRElGRl9TSVpFKX1cXG4uLi4gRGlmZiB0cnVuY2F0ZWQgKGV4Y2VlZGVkICR7TUFYX0RJRkZfU0laRX0gY2hhcmFjdGVycykgZm9yICR7dXJpfWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx1Q0FBdUM7QUFJaEQsTUFBTSx1QkFBdUIsTUFBTTtBQUNuQyxNQUFNLHVCQUF1QixLQUFLO0FBQ2xDLE1BQU0sY0FBYztBQUNwQixNQUFNLHdCQUF3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
