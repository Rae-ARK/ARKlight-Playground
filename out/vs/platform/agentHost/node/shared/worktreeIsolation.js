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
import * as fs from "fs/promises";
import { RunOnceScheduler, SequencerByKey } from "../../../../base/common/async.js";
import { appendEscapedMarkdownInlineCode } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../log/common/log.js";
import { getBranchCompletions, IAgentHostGitService, META_DIFF_BASE_BRANCH, tryResolvePrimaryWorktreeRoot } from "../../common/agentHostGitService.js";
import { schemaProperty } from "../../common/agentHostSchema.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, ResponsePartKind } from "../../common/state/sessionState.js";
import { AGENT_BRANCH_PREFIX, AgentBranchNameGenerator } from "./agentBranchNameGenerator.js";
import { ICopilotApiService } from "./copilotApiService.js";
const WORKTREE_META_BRANCH = "copilot.worktree.branchName";
const WORKTREE_META_PATH = "copilot.worktree.path";
const WORKTREE_META_REPOSITORY_ROOT = "copilot.worktree.repositoryRoot";
class SessionWorkingDirectoryMissingError extends Error {
  constructor(workingDirectory, reason) {
    super(reason ? localize("sessionWorkingDirectoryMissingWithReason", "This session couldn't be loaded because its worktree is missing and could not be recreated: {0}", reason) : localize("sessionWorkingDirectoryMissing", "This session couldn't be loaded because its working directory no longer exists: {0}", workingDirectory.fsPath));
    this.workingDirectory = workingDirectory;
    this.reason = reason;
    this.name = "SessionWorkingDirectoryMissingError";
  }
}
const BRANCH_COMPLETION_LIMIT = 25;
const WORKTREE_PROGRESS_DEBOUNCE_MS = 40;
function getWorktreesRoot(repositoryRoot) {
  return URI.joinPath(repositoryRoot, "..", `${basename(repositoryRoot.fsPath)}.worktrees`);
}
function getWorktreeName(branchName, branchPrefix = "") {
  let name = branchName;
  if (branchPrefix && name.startsWith(branchPrefix)) {
    name = name.substring(branchPrefix.length);
  }
  if (name.startsWith(AGENT_BRANCH_PREFIX)) {
    name = name.substring(AGENT_BRANCH_PREFIX.length);
  }
  return name.replace(/\//g, "-");
}
function buildWorktreeAnnouncementText(branchName) {
  return localize(
    "agentHost.worktreeCreated",
    "Created isolated worktree for branch {0}",
    appendEscapedMarkdownInlineCode(branchName)
  ) + "\n\n";
}
var WorktreeCreationPhase = /* @__PURE__ */ ((WorktreeCreationPhase2) => {
  WorktreeCreationPhase2[WorktreeCreationPhase2["Starting"] = 0] = "Starting";
  WorktreeCreationPhase2[WorktreeCreationPhase2["NamingBranch"] = 1] = "NamingBranch";
  WorktreeCreationPhase2[WorktreeCreationPhase2["CheckingOut"] = 2] = "CheckingOut";
  WorktreeCreationPhase2[WorktreeCreationPhase2["CopyingIncludeFiles"] = 3] = "CopyingIncludeFiles";
  return WorktreeCreationPhase2;
})(WorktreeCreationPhase || {});
function buildWorktreeProgressText(phase, percent) {
  switch (phase) {
    case 1 /* NamingBranch */:
      return localize("agentHost.worktreeNamingBranch", "Creating isolated worktree (naming branch)");
    case 2 /* CheckingOut */:
      return percent === void 0 ? localize("agentHost.worktreeCheckingOut", "Creating isolated worktree (checking out files)") : localize("agentHost.worktreeCheckingOutPercent", "Creating isolated worktree (checking out files, {0}%)", percent);
    case 3 /* CopyingIncludeFiles */:
      return percent === void 0 ? localize("agentHost.worktreeCopyingIncludeFiles", "Creating isolated worktree (copying additional files)") : localize("agentHost.worktreeCopyingIncludeFilesPercent", "Creating isolated worktree (copying additional files, {0}%)", percent);
    default:
      return localize("agentHost.worktreeCreating", "Creating isolated worktree");
  }
}
async function withPercentProgress(phase, onProgress, operation) {
  if (!onProgress) {
    return operation(void 0);
  }
  let lastPercent = -1;
  const scheduler = new RunOnceScheduler(() => onProgress(buildWorktreeProgressText(phase, lastPercent)), WORKTREE_PROGRESS_DEBOUNCE_MS);
  try {
    return await operation(({ filesDone, filesTotal }) => {
      const percent = Math.min(100, Math.floor(filesDone * 100 / filesTotal));
      if (percent <= lastPercent) {
        return;
      }
      lastPercent = percent;
      scheduler.schedule();
    });
  } finally {
    const shouldFlush = scheduler.isScheduled();
    scheduler.dispose();
    if (shouldFlush) {
      onProgress(buildWorktreeProgressText(phase, lastPercent));
    }
  }
}
function prependAnnouncementToFirstTurn(turns, announcement) {
  if (turns.length === 0) {
    return turns;
  }
  const result = turns.slice();
  const first = result[0];
  const part = first.responseParts[0];
  if (part?.kind === ResponsePartKind.Markdown) {
    const responseParts = first.responseParts.slice();
    responseParts[0] = { ...part, content: announcement + part.content };
    result[0] = { ...first, responseParts };
  } else {
    const responseParts = [
      { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
      ...first.responseParts
    ];
    result[0] = { ...first, responseParts };
  }
  return result;
}
let WorktreeIsolation = class extends Disposable {
  constructor(branchNameGenerator, _gitService, copilotApiService, _sessionDataService, _logService) {
    super();
    this._gitService = _gitService;
    this._sessionDataService = _sessionDataService;
    this._logService = _logService;
    /**
     * Worktrees created by this agent in the current process, keyed by
     * sessionId. Used to remove the worktree on dispose / error and to
     * enumerate live worktrees during shutdown.
     */
    this._createdWorktrees = /* @__PURE__ */ new Map();
    /**
     * Per-session announcement (markdown) emitted as a synthetic streaming
     * markdown part the first time the session sends a message. Surfaces the
     * "Created isolated worktree for branch X" message live during the first
     * turn; the same announcement is re-injected on restore via
     * {@link applyRestoreAnnouncement}.
     */
    this._pendingFirstTurnAnnouncements = /* @__PURE__ */ new Map();
    /**
     * SessionIds of freshly-created worktree-isolation sessions whose worktree
     * has not yet been created (creation is deferred to the first send so the
     * user's prompt can drive branch naming). While a session is in this set the
     * host reports its working directory as "pending" ({@link isWorkingDirectoryPending})
     * so agents defer prewarming / materializing until {@link resolveOnFirstSend}
     * runs. Never populated for restored sessions — their worktree already exists
     * on disk and their persisted working directory already points at it.
     */
    this._pending = /* @__PURE__ */ new Set();
    /** Fixed log label; one host-owned instance serves every agent. */
    this._logLabel = "AgentHost";
    /**
     * Serializes the worktree lifecycle per session so a first-send creation
     * ({@link resolveOnFirstSend}) never interleaves with archive/unarchive
     * cleanup ({@link cleanupWorktreeOnArchive} / {@link recreateWorktreeOnUnarchive})
     * or dispose ({@link removeCreatedWorktree}) for the same session — the
     * guarantee each agent previously enforced with its own sequencer.
     */
    this._sequencer = new SequencerByKey();
    this._worktreeCreationSequencer = new SequencerByKey();
    this._branchNameGenerator = branchNameGenerator ?? new AgentBranchNameGenerator(copilotApiService, this._logService);
  }
  /** SessionIds with a worktree created by this agent in the current process. */
  get createdWorktreeSessionIds() {
    return [...this._createdWorktrees.keys()];
  }
  /**
   * Marks a fresh worktree-isolation session as pending — its worktree is
   * deferred to the first send. Called by the host while a creating session's
   * resolved config selects `worktree` isolation.
   */
  notePending(sessionId) {
    this._pending.add(sessionId);
  }
  /** Clears a pending marker when a session will not materialize a worktree. */
  clearPending(sessionId) {
    this._pending.delete(sessionId);
  }
  /**
   * Whether a session's worktree is still pending creation. The host exposes
   * this through {@link IAgentConfigurationService.isWorkingDirectoryPending} so
   * agents defer materialization until the host has resolved the worktree.
   */
  isWorkingDirectoryPending(sessionId) {
    return this._pending.has(sessionId);
  }
  /** The worktree created for a session in this process, if any. */
  getResolvedWorktree(sessionId) {
    return this._createdWorktrees.get(sessionId)?.worktree;
  }
  /**
   * First-send worktree resolution: creates the worktree (when the session
   * selected `worktree` isolation on a git repo) and clears the pending marker
   * regardless of outcome, so a failed creation falls back to folder isolation
   * instead of leaving the session permanently "pending". Delegates to
   * {@link resolveWorkingDirectory}, which is idempotent per session.
   */
  async resolveOnFirstSend(request) {
    return this._sequencer.queue(request.sessionId, async () => {
      try {
        return await this.resolveWorkingDirectory(request);
      } finally {
        this.clearPending(request.sessionId);
      }
    });
  }
  /**
   * Builds the `isolation` / `branch` schema contribution for
   * `resolveSessionConfig`. When {@link IResolveIsolationConfigRequest.workingDirectory}
   * is not a git repository (or has no commits yet) isolation is forced to
   * `folder` and no branch property is offered.
   */
  async resolveIsolationConfig(request) {
    const gitInfo = request.workingDirectory ? await this._getGitInfo(request.workingDirectory) : void 0;
    const isolationProperty = schemaProperty({
      type: "string",
      title: localize("agentHost.sessionConfig.isolation", "Isolation"),
      description: localize("agentHost.sessionConfig.isolationDescription", "Where the agent should make changes"),
      enum: gitInfo ? ["folder", "worktree"] : ["folder"],
      enumLabels: gitInfo ? [localize("agentHost.sessionConfig.isolation.folder", "Folder"), localize("agentHost.sessionConfig.isolation.worktree", "Worktree")] : [localize("agentHost.sessionConfig.isolation.folder", "Folder")],
      enumDescriptions: gitInfo ? [localize("agentHost.sessionConfig.isolation.folderDescription", "Work directly in the folder"), localize("agentHost.sessionConfig.isolation.worktreeDescription", "Create a Git worktree for isolation")] : [localize("agentHost.sessionConfig.isolation.folderDescription", "Work directly in the folder")],
      default: gitInfo ? "worktree" : "folder",
      readOnly: !gitInfo,
      sessionMutable: false
    });
    const isolationDefault = gitInfo ? "worktree" : "folder";
    const isolationValue = isolationProperty.validate(request.config?.[SessionConfigKey.Isolation]) ? request.config[SessionConfigKey.Isolation] : isolationDefault;
    let branchProperty;
    let branchDefault;
    let branchValue;
    let worktreeBranchPrefixProperty;
    let worktreeIncludeFilesProperty;
    let worktreeBranchTrackProperty;
    if (gitInfo) {
      const branchReadOnly = isolationValue === "folder";
      branchDefault = isolationValue === "worktree" ? gitInfo.defaultBranch.name : gitInfo.currentBranch;
      branchValue = isolationValue === "worktree" && typeof request.config?.[SessionConfigKey.Branch] === "string" ? request.config[SessionConfigKey.Branch] : branchDefault;
      branchProperty = schemaProperty({
        type: "string",
        title: localize("agentHost.sessionConfig.branch", "Branch"),
        description: localize("agentHost.sessionConfig.branchDescription", "Base branch to work from"),
        enum: [branchDefault],
        enumLabels: [branchDefault],
        default: branchDefault,
        enumDynamic: !branchReadOnly,
        readOnly: branchReadOnly,
        sessionMutable: false
      });
      worktreeBranchPrefixProperty = schemaProperty({
        type: "string",
        title: localize("agentHost.sessionConfig.worktreeBranchPrefix", "Worktree Branch Prefix"),
        description: localize("agentHost.sessionConfig.worktreeBranchPrefixDescription", "Prefix applied to the branch created for an isolated worktree."),
        readOnly: true,
        sessionMutable: false
      });
      worktreeBranchTrackProperty = schemaProperty({
        type: "boolean",
        title: localize("agentHost.sessionConfig.worktreeBranchTrack", "Worktree Branch Tracking"),
        description: localize("agentHost.sessionConfig.worktreeBranchTrackDescription", "Whether the branch created for an isolated worktree tracks its upstream."),
        default: false,
        readOnly: true,
        sessionMutable: false
      });
      worktreeIncludeFilesProperty = schemaProperty({
        type: "array",
        title: localize("agentHost.sessionConfig.worktreeIncludeFiles", "Worktree Include Files"),
        description: localize("agentHost.sessionConfig.worktreeIncludeFilesDescription", "Glob patterns for git-ignored files to copy into the isolated worktree."),
        items: {
          type: "string",
          title: localize("agentHost.sessionConfig.worktreeIncludeFilesItem", "Pattern")
        },
        readOnly: true,
        sessionMutable: false
      });
    }
    return { isolationProperty, branchProperty, worktreeBranchPrefixProperty, worktreeBranchTrackProperty, worktreeIncludeFilesProperty, isolationValue, branchDefault, branchValue };
  }
  /**
   * Branch-name completions for the branch picker. Callers forward this from
   * their `sessionConfigCompletions` when the requested property is
   * {@link SessionConfigKey.Branch}.
   */
  async branchCompletions(workingDirectory, query) {
    if (!workingDirectory) {
      return { items: [] };
    }
    const [branches, currentBranch, defaultBranch] = await Promise.all([
      this._gitService.getBranches(workingDirectory, { pattern: ["refs/heads"], sort: "committerdate" }),
      this._gitService.getCurrentBranch(workingDirectory),
      this._gitService.getDefaultBranch(workingDirectory)
    ]);
    const branchCompletions = getBranchCompletions(branches.map((branch) => branch.name), {
      currentBranch,
      defaultBranch: defaultBranch?.name,
      query,
      limit: BRANCH_COMPLETION_LIMIT
    });
    return { items: branchCompletions.map((branch) => ({ value: branch, label: branch })) };
  }
  /**
   * Resolves the effective working directory for a session that is about to
   * be materialized. When the session config selects `worktree` isolation on
   * a git repository, creates a fresh branch + worktree, records it for
   * cleanup, queues the first-turn announcement, persists the worktree
   * metadata, and returns the worktree URI. Otherwise returns the requested
   * working directory unchanged.
   */
  async resolveWorkingDirectory(request) {
    const { config, workingDirectory, sessionId, sessionUri, prompt, githubToken, onProgress } = request;
    if (config?.[SessionConfigKey.Isolation] !== "worktree" || !workingDirectory || typeof config[SessionConfigKey.Branch] !== "string") {
      return workingDirectory;
    }
    const already = this._createdWorktrees.get(sessionId);
    if (already) {
      return already.worktree;
    }
    onProgress?.(buildWorktreeProgressText(0 /* Starting */));
    const checkoutRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!checkoutRoot) {
      return workingDirectory;
    }
    const repositoryRoot = await this._resolvePrimaryWorktreeRoot(checkoutRoot, checkoutRoot);
    const worktreesRoot = getWorktreesRoot(repositoryRoot);
    const worktreeBranchPrefix = typeof config[SessionConfigKey.WorktreeBranchPrefix] === "string" ? config[SessionConfigKey.WorktreeBranchPrefix] : void 0;
    const selectedBranch = config[SessionConfigKey.Branch];
    const { branchName, worktree, baseBranch } = await this._worktreeCreationSequencer.queue(repositoryRoot.toString(), async () => {
      onProgress?.(buildWorktreeProgressText(1 /* NamingBranch */));
      const branchName2 = await this._branchNameGenerator.generateBranchName({
        sessionId,
        message: prompt,
        githubToken,
        branchPrefix: worktreeBranchPrefix,
        branchNameCollides: async (candidate) => {
          if (await this._gitService.branchExists(repositoryRoot, candidate).catch(() => true)) {
            return true;
          }
          const candidateWorktree = URI.joinPath(worktreesRoot, getWorktreeName(candidate, worktreeBranchPrefix));
          return fileExists(candidateWorktree.fsPath);
        }
      });
      const worktree2 = URI.joinPath(worktreesRoot, getWorktreeName(branchName2, worktreeBranchPrefix));
      const baseBranch2 = await this._resolveBranchStartPoint(repositoryRoot, selectedBranch);
      await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
      onProgress?.(buildWorktreeProgressText(2 /* CheckingOut */));
      const worktreeBranchTrack = config[SessionConfigKey.WorktreeBranchTrack] === true;
      await withPercentProgress(2 /* CheckingOut */, onProgress, (progress) => this._gitService.addWorktree(repositoryRoot, worktree2, branchName2, baseBranch2, worktreeBranchTrack, progress));
      return { branchName: branchName2, worktree: worktree2, baseBranch: baseBranch2 };
    });
    const worktreeIncludeFiles = Array.isArray(config[SessionConfigKey.WorktreeIncludeFiles]) && config[SessionConfigKey.WorktreeIncludeFiles].every((pattern) => typeof pattern === "string") ? config[SessionConfigKey.WorktreeIncludeFiles] : void 0;
    if (worktreeIncludeFiles?.length) {
      try {
        onProgress?.(buildWorktreeProgressText(3 /* CopyingIncludeFiles */));
        await withPercentProgress(3 /* CopyingIncludeFiles */, onProgress, (progress) => this._gitService.copyWorktreeIncludeFiles(checkoutRoot, worktree, worktreeIncludeFiles, progress));
      } catch (error) {
        this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to copy worktree include files: ${errorMessage(error)}`);
      }
    }
    this._createdWorktrees.set(sessionId, { repositoryRoot, worktree });
    this._pendingFirstTurnAnnouncements.set(sessionId, buildWorktreeAnnouncementText(branchName));
    try {
      await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktree, repositoryRoot });
    } catch (error) {
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to persist worktree branch metadata: ${errorMessage(error)}`);
    }
    return worktree;
  }
  /** Resolves a persisted working directory, repairing a removed worktree when possible. */
  async resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory) {
    return this._sequencer.queue(sessionId, () => this._resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory));
  }
  async _resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory) {
    if (workingDirectory.scheme !== Schemas.file) {
      return workingDirectory;
    }
    try {
      await fs.access(workingDirectory.fsPath);
      return workingDirectory;
    } catch {
    }
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    const archived = await this._isSessionArchived(sessionUri);
    if (archived) {
      if (meta?.repositoryRoot) {
        try {
          await fs.access(meta.repositoryRoot.fsPath);
          this._logService.info(`[${this._logLabel}:${sessionId}] Archived session working directory '${workingDirectory.fsPath}' is missing; resuming against repository root '${meta.repositoryRoot.fsPath}' for history`);
          return meta.repositoryRoot;
        } catch {
        }
      }
      this._logService.warn(`[${this._logLabel}:${sessionId}] Cannot resume archived session: working directory '${workingDirectory.fsPath}' is missing and no usable repository-root fallback was found`);
      throw new SessionWorkingDirectoryMissingError(workingDirectory);
    }
    let recreateFailureReason;
    if (meta?.worktreePath && meta.repositoryRoot) {
      const { branchName, worktreePath, repositoryRoot } = meta;
      const recreated = await this._recreateWorktree(sessionId, { branchName, worktreePath, repositoryRoot });
      if (recreated.ok) {
        this._logService.info(`[${this._logLabel}:${sessionId}] Recreated missing worktree '${worktreePath.fsPath}' for a live session on resume`);
        return worktreePath;
      }
      recreateFailureReason = recreated.reason;
    }
    this._logService.warn(`[${this._logLabel}:${sessionId}] Cannot resume: working directory '${workingDirectory.fsPath}' is missing and its worktree could not be recreated${recreateFailureReason ? `: ${recreateFailureReason}` : ""}`);
    throw new SessionWorkingDirectoryMissingError(workingDirectory, recreateFailureReason);
  }
  /**
   * Takes (and clears) the pending "worktree created" announcement for a
   * session so callers can emit it live as the first response part on the
   * first turn. Returns `undefined` when the session has no pending
   * announcement.
   */
  takePendingAnnouncement(sessionId) {
    const announcement = this._pendingFirstTurnAnnouncements.get(sessionId);
    if (announcement !== void 0) {
      this._pendingFirstTurnAnnouncements.delete(sessionId);
    }
    return announcement;
  }
  /**
   * Re-injects the worktree announcement into a restored transcript by
   * prepending it to the first turn. No-op when the session was not worktree
   * isolated. Callers forward the turns returned from their history-read path.
   *
   * The live path ({@link takePendingAnnouncement}) handles the very first
   * turn while the session is fresh; this path takes over on subsequent loads
   * (where the synthetic announcement is not part of the agent transcript).
   */
  async applyRestoreAnnouncement(sessionUri, turns) {
    const worktreeMeta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    if (!worktreeMeta?.branchName) {
      return turns;
    }
    return prependAnnouncementToFirstTurn(turns, buildWorktreeAnnouncementText(worktreeMeta.branchName));
  }
  /**
   * Removes the worktree created for a session in the current process (if
   * any). Used on session dispose and on materialization failure.
   */
  async removeCreatedWorktree(sessionId) {
    return this._sequencer.queue(sessionId, () => this._removeCreatedWorktree(sessionId));
  }
  async _removeCreatedWorktree(sessionId) {
    this.clearPending(sessionId);
    const worktree = this._createdWorktrees.get(sessionId);
    if (!worktree) {
      return;
    }
    try {
      await this._gitService.removeWorktree(worktree.repositoryRoot, worktree.worktree);
    } catch (error) {
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktree.worktree.fsPath}': ${errorMessage(error)}`);
    } finally {
      this._createdWorktrees.delete(sessionId);
    }
  }
  /**
   * Removes every worktree created by this agent in the current process.
   * Called from the agent's `shutdown` so no isolated worktree is leaked when
   * the provider is torn down, matching Copilot's shutdown drain.
   */
  async removeAllCreatedWorktrees() {
    await Promise.all(this.createdWorktreeSessionIds.map((sessionId) => this.removeCreatedWorktree(sessionId)));
  }
  /**
   * On archive, removes the worktree directory when its branch is preserved
   * and the working tree is clean, so the worktree can be recreated on
   * unarchive without losing work. Skips the removal when the branch is
   * missing or the tree is dirty.
   */
  async cleanupWorktreeOnArchive(sessionUri, sessionId) {
    return this._sequencer.queue(sessionId, () => this._cleanupWorktreeOnArchive(sessionUri, sessionId));
  }
  async _cleanupWorktreeOnArchive(sessionUri, sessionId) {
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    if (!meta?.worktreePath || !meta.repositoryRoot) {
      return;
    }
    const { branchName, worktreePath, repositoryRoot } = meta;
    try {
      await fs.access(worktreePath.fsPath);
    } catch {
      this._createdWorktrees.delete(sessionId);
      return;
    }
    const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
    if (!branchPresent) {
      this._logService.info(`[${this._logLabel}:${sessionId}] Skipping worktree cleanup: branch '${branchName}' is missing`);
      return;
    }
    const hasUncommittedChanges = await this._gitService.hasUncommittedChanges(worktreePath).catch(() => true);
    if (hasUncommittedChanges) {
      try {
        await this._gitService.commitAll(worktreePath, localize("worktreeIsolation.commitMessage", "Saving uncommitted changes before archiving session"));
      } catch (error) {
        this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to commit uncommitted changes in '${worktreePath.fsPath}': ${errorMessage(error)}`);
        return;
      }
    }
    try {
      await this._gitService.removeWorktree(repositoryRoot, worktreePath);
      this._logService.info(`[${this._logLabel}:${sessionId}] Removed worktree '${worktreePath.fsPath}' on archive`);
    } catch (error) {
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktreePath.fsPath}' on archive: ${errorMessage(error)}`);
    } finally {
      this._createdWorktrees.delete(sessionId);
    }
  }
  /**
   * On unarchive, recreates a previously cleaned-up worktree against its
   * preserved branch. No-op when the directory still exists or the branch is
   * missing.
   */
  async recreateWorktreeOnUnarchive(sessionUri, sessionId) {
    return this._sequencer.queue(sessionId, () => this._recreateWorktreeOnUnarchive(sessionUri, sessionId));
  }
  async _recreateWorktreeOnUnarchive(sessionUri, sessionId) {
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    if (!meta?.worktreePath || !meta.repositoryRoot) {
      return;
    }
    try {
      await fs.access(meta.worktreePath.fsPath);
      return;
    } catch {
    }
    const { branchName, worktreePath, repositoryRoot } = meta;
    await this._recreateWorktree(sessionId, { branchName, worktreePath, repositoryRoot });
  }
  async _recreateWorktree(sessionId, meta) {
    const { branchName, worktreePath, repositoryRoot } = meta;
    const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
    if (!branchPresent) {
      const reason = localize("worktreeRecreateBranchMissing", "the branch '{0}' no longer exists", branchName);
      this._logService.info(`[${this._logLabel}:${sessionId}] Cannot recreate worktree: branch '${branchName}' is missing`);
      return { ok: false, reason };
    }
    try {
      await fs.mkdir(URI.joinPath(worktreePath, "..").fsPath, { recursive: true });
      await this._gitService.addExistingWorktree(repositoryRoot, worktreePath, branchName);
      this._createdWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });
      this._logService.info(`[${this._logLabel}:${sessionId}] Recreated worktree '${worktreePath.fsPath}'`);
      return { ok: true };
    } catch (error) {
      const reason = errorMessage(error);
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to recreate worktree '${worktreePath.fsPath}': ${reason}`);
      return { ok: false, reason };
    }
  }
  /** Reads the persisted worktree metadata for a session, if any. */
  async readWorktreeMetadata(sessionUri) {
    return this._readWorktreeMetadata(sessionUri);
  }
  /**
   * Resolves the repository "project" for a worktree-isolated session from its
   * persisted worktree metadata. Worktree sessions run out of a
   * `<repo>.worktrees/<name>` directory, but in the sessions UI they must group
   * under the *repository* (e.g. `vscode`) — not the worktree folder — exactly
   * like Copilot. Returns the repository root as the project so agents can merge
   * it into the `project` field of the `IAgentSessionMetadata` reported from
   * `listSessions` / `getSessionMetadata`; without it a list refresh clears the
   * transient project set by the materialize event and the workspace reverts to
   * the worktree directory name. Returns `undefined` for sessions that were never
   * worktree-isolated, leaving the caller's own folder-based project untouched.
   */
  async resolveWorktreeProject(sessionUri) {
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    return meta?.repositoryRoot ? projectFromRepositoryRoot(meta.repositoryRoot) : void 0;
  }
  async _resolvePrimaryWorktreeRoot(checkoutRoot, fallbackRoot) {
    try {
      return await tryResolvePrimaryWorktreeRoot(this._gitService, checkoutRoot) ?? fallbackRoot;
    } catch (error) {
      this._logService.warn(`[${this._logLabel}] Failed to resolve primary worktree for '${checkoutRoot.fsPath}': ${errorMessage(error)}`);
      return fallbackRoot;
    }
  }
  /**
   * Synchronous companion to {@link resolveWorktreeProject} for the
   * materialize-event path: the repository project for a worktree this agent
   * created in the current process, or `undefined` when the session has none.
   * Lets an agent supply the materialize event's `project` without an async
   * metadata read so a fresh worktree groups under the repository the moment it
   * materializes.
   */
  createdWorktreeProject(sessionId) {
    const worktree = this._createdWorktrees.get(sessionId);
    return worktree ? projectFromRepositoryRoot(worktree.repositoryRoot) : void 0;
  }
  async _getGitInfo(workingDirectory) {
    const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const headCommit = await this._gitService.revParse(repositoryRoot, "HEAD").catch(() => void 0);
    if (!headCommit) {
      return void 0;
    }
    const currentBranch = await this._gitService.getCurrentBranch(repositoryRoot) ?? "HEAD";
    const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot) ?? { name: currentBranch, startPoint: currentBranch };
    return { currentBranch, defaultBranch };
  }
  async _resolveBranchStartPoint(repositoryRoot, selectedBranch) {
    const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot);
    return defaultBranch?.name === selectedBranch ? defaultBranch.startPoint : selectedBranch;
  }
  async _writeWorktreeMetadata(sessionUri, metadata) {
    const dbRef = this._sessionDataService.openDatabase(sessionUri);
    try {
      const work = [
        dbRef.object.setMetadata(WORKTREE_META_BRANCH, metadata.branchName),
        dbRef.object.setMetadata(WORKTREE_META_PATH, metadata.worktreePath.toString()),
        dbRef.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, metadata.repositoryRoot.toString())
      ];
      if (metadata.baseBranch) {
        work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, metadata.baseBranch));
      }
      await Promise.all(work);
    } finally {
      dbRef.dispose();
    }
  }
  /**
   * Reads worktree metadata and migrates repository roots written before linked checkouts were canonicalized.
   * It probes an existing worktree when available and otherwise falls back to the persisted root for archived sessions.
   */
  async _readWorktreeMetadata(sessionUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
    if (!ref) {
      return void 0;
    }
    try {
      const [branchName, worktreePathRaw, repositoryRootRaw] = await Promise.all([
        ref.object.getMetadata(WORKTREE_META_BRANCH),
        ref.object.getMetadata(WORKTREE_META_PATH),
        ref.object.getMetadata(WORKTREE_META_REPOSITORY_ROOT)
      ]);
      if (!branchName) {
        return void 0;
      }
      const worktreePath = worktreePathRaw ? URI.parse(worktreePathRaw) : void 0;
      let repositoryRoot = repositoryRootRaw ? URI.parse(repositoryRootRaw) : void 0;
      if (repositoryRoot) {
        const checkoutRoot = worktreePath && await fileExists(worktreePath.fsPath) ? worktreePath : repositoryRoot;
        const primaryRoot = await this._resolvePrimaryWorktreeRoot(checkoutRoot, repositoryRoot);
        if (primaryRoot.toString() !== repositoryRoot.toString()) {
          repositoryRoot = primaryRoot;
          try {
            await ref.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, primaryRoot.toString());
          } catch (error) {
            this._logService.warn(`[${this._logLabel}] Failed to normalize worktree repository metadata for '${sessionUri.toString()}': ${errorMessage(error)}`);
          }
        }
      }
      return { branchName, worktreePath, repositoryRoot };
    } finally {
      ref.dispose();
    }
  }
  async _isSessionArchived(sessionUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
    if (!ref) {
      return false;
    }
    try {
      const [isArchived, isDone] = await Promise.all([
        ref.object.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
        ref.object.getMetadata(AH_META_IS_DONE_DB_KEY)
      ]);
      return isArchived !== void 0 ? isArchived === "true" : isDone === "true";
    } finally {
      ref.dispose();
    }
  }
};
WorktreeIsolation = __decorateClass([
  __decorateParam(1, IAgentHostGitService),
  __decorateParam(2, ICopilotApiService),
  __decorateParam(3, ISessionDataService),
  __decorateParam(4, ILogService)
], WorktreeIsolation);
function projectFromRepositoryRoot(repositoryRoot) {
  return { uri: repositoryRoot, displayName: basename(repositoryRoot.fsPath) || repositoryRoot.toString() };
}
function worktreeProjectFromRepositoryRoot(repositoryRootRaw) {
  return repositoryRootRaw ? projectFromRepositoryRoot(URI.parse(repositoryRootRaw)) : void 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
export {
  SessionWorkingDirectoryMissingError,
  WORKTREE_META_REPOSITORY_ROOT,
  WorktreeCreationPhase,
  WorktreeIsolation,
  buildWorktreeAnnouncementText,
  buildWorktreeProgressText,
  getWorktreeName,
  getWorktreesRoot,
  prependAnnouncementToFirstTurn,
  worktreeProjectFromRepositoryRoot
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC93b3JrdHJlZUlzb2xhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRCcmFuY2hDb21wbGV0aW9ucywgSUFnZW50SG9zdEdpdFNlcnZpY2UsIElEZWZhdWx0QnJhbmNoLCBJV29ya3RyZWVGaWxlUHJvZ3Jlc3MsIE1FVEFfRElGRl9CQVNFX0JSQU5DSCwgdHJ5UmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2NoZW1hUHJvcGVydHksIHNjaGVtYVByb3BlcnR5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCBBSF9NRVRBX0lTX0RPTkVfREJfS0VZLCBSZXNwb25zZVBhcnQsIFJlc3BvbnNlUGFydEtpbmQsIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFHRU5UX0JSQU5DSF9QUkVGSVgsIEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciwgSUFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciB9IGZyb20gJy4vYWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4vY29waWxvdEFwaVNlcnZpY2UuanMnO1xuXG4vKipcbiAqIFBlci1zZXNzaW9uLWRhdGFiYXNlIG1ldGFkYXRhIGtleXMgdW5kZXIgd2hpY2ggdGhlIHdvcmt0cmVlIGFuIGFnZW50XG4gKiBjcmVhdGVkIGZvciBhbiBpc29sYXRlZCBzZXNzaW9uIGlzIHJlY29yZGVkLiBUaGUgc3RyaW5nIHZhbHVlcyBrZWVwIHRoZVxuICogaGlzdG9yaWNhbCBgY29waWxvdC53b3JrdHJlZS4qYCBwcmVmaXggc28gc2Vzc2lvbnMgbWF0ZXJpYWxpemVkIGJ5IGVhcmxpZXJcbiAqIENvcGlsb3QgYnVpbGRzIGtlZXAgcmVzb2x2aW5nIHRoZWlyIHdvcmt0cmVlIG9uIGFyY2hpdmUgLyB1bmFyY2hpdmUgL1xuICogcmVzdG9yZSBhZnRlciB0aGlzIGxvZ2ljIHdhcyB1bmlmaWVkIGFjcm9zcyBhZ2VudHMuIEFsbCBhZ2VudHMgKENvcGlsb3QsXG4gKiBDb2RleCwgQ2xhdWRlKSBub3cgd3JpdGUgYW5kIHJlYWQgdGhlc2Ugc2FtZSBrZXlzOyB0aGUgcGVyLXNlc3Npb24gZGF0YWJhc2VcbiAqIGlzIGFscmVhZHkgc2NvcGVkIGJ5IHNlc3Npb24sIHNvIHRoZXJlIGlzIG5vIGNyb3NzLWFnZW50IGNvbGxpc2lvbi5cbiAqL1xuY29uc3QgV09SS1RSRUVfTUVUQV9CUkFOQ0ggPSAnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJztcbmNvbnN0IFdPUktUUkVFX01FVEFfUEFUSCA9ICdjb3BpbG90Lndvcmt0cmVlLnBhdGgnO1xuZXhwb3J0IGNvbnN0IFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09UID0gJ2NvcGlsb3Qud29ya3RyZWUucmVwb3NpdG9yeVJvb3QnO1xuXG4vKiogVGhyb3duIHdoZW4gYSBwZXJzaXN0ZWQgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSBpcyBtaXNzaW5nIGFuZCBjYW5ub3QgYmUgcmVwYWlyZWQuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgcmVhZG9ubHkgcmVhc29uPzogc3RyaW5nKSB7XG5cdFx0c3VwZXIocmVhc29uXG5cdFx0XHQ/IGxvY2FsaXplKCdzZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdXaXRoUmVhc29uJywgXCJUaGlzIHNlc3Npb24gY291bGRuJ3QgYmUgbG9hZGVkIGJlY2F1c2UgaXRzIHdvcmt0cmVlIGlzIG1pc3NpbmcgYW5kIGNvdWxkIG5vdCBiZSByZWNyZWF0ZWQ6IHswfVwiLCByZWFzb24pXG5cdFx0XHQ6IGxvY2FsaXplKCdzZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmcnLCBcIlRoaXMgc2Vzc2lvbiBjb3VsZG4ndCBiZSBsb2FkZWQgYmVjYXVzZSBpdHMgd29ya2luZyBkaXJlY3Rvcnkgbm8gbG9uZ2VyIGV4aXN0czogezB9XCIsIHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoKSk7XG5cdFx0dGhpcy5uYW1lID0gJ1Nlc3Npb25Xb3JraW5nRGlyZWN0b3J5TWlzc2luZ0Vycm9yJztcblx0fVxufVxuXG4vKiogRGVmYXVsdCB1cHBlciBib3VuZCBvbiBicmFuY2ggbmFtZXMgcmV0dXJuZWQgZm9yIHRoZSBicmFuY2ggcGlja2VyLiAqL1xuY29uc3QgQlJBTkNIX0NPTVBMRVRJT05fTElNSVQgPSAyNTtcbmNvbnN0IFdPUktUUkVFX1BST0dSRVNTX0RFQk9VTkNFX01TID0gNDA7XG5cbmludGVyZmFjZSBJQ3JlYXRlZFdvcmt0cmVlIHtcblx0cmVhZG9ubHkgcmVwb3NpdG9yeVJvb3Q6IFVSSTtcblx0cmVhZG9ubHkgd29ya3RyZWU6IFVSSTtcbn1cblxuLyoqXG4gKiBUaGUgYDxyZXBvPi53b3JrdHJlZXNgIHNpYmxpbmcgZGlyZWN0b3J5IHdoZXJlIHBlci1zZXNzaW9uIGlzb2xhdGVkXG4gKiB3b3JrdHJlZXMgYXJlIGNyZWF0ZWQsIGUuZy4gYC9zcmMvdnNjb2RlYCBcdTIxOTIgYC9zcmMvdnNjb2RlLndvcmt0cmVlc2AuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRXb3JrdHJlZXNSb290KHJlcG9zaXRvcnlSb290OiBVUkkpOiBVUkkge1xuXHRyZXR1cm4gVVJJLmpvaW5QYXRoKHJlcG9zaXRvcnlSb290LCAnLi4nLCBgJHtiYXNlbmFtZShyZXBvc2l0b3J5Um9vdC5mc1BhdGgpfS53b3JrdHJlZXNgKTtcbn1cblxuLyoqXG4gKiBEZXJpdmVzIHRoZSBvbi1kaXNrIHdvcmt0cmVlIGRpcmVjdG9yeSBuYW1lIGZyb20gYSBicmFuY2ggbmFtZTogc3RyaXBzIHRoZVxuICogY2FsbGVyLXN1cHBsaWVkIHByZWZpeCAoZS5nLiB0aGUgdXNlcidzIGBnaXQuYnJhbmNoUHJlZml4YCkgYW5kIHRoZSBidWlsdC1pblxuICogYGFnZW50cy9gIHByZWZpeCBzbyB0aGUgZGlyZWN0b3J5IHN0YXlzIGNvbmNpc2UsIHRoZW4gZmxhdHRlbnMgYW55IHJlbWFpbmluZ1xuICogcGF0aCBzZXBhcmF0b3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0V29ya3RyZWVOYW1lKGJyYW5jaE5hbWU6IHN0cmluZywgYnJhbmNoUHJlZml4OiBzdHJpbmcgPSAnJyk6IHN0cmluZyB7XG5cdGxldCBuYW1lID0gYnJhbmNoTmFtZTtcblx0aWYgKGJyYW5jaFByZWZpeCAmJiBuYW1lLnN0YXJ0c1dpdGgoYnJhbmNoUHJlZml4KSkge1xuXHRcdG5hbWUgPSBuYW1lLnN1YnN0cmluZyhicmFuY2hQcmVmaXgubGVuZ3RoKTtcblx0fVxuXHRpZiAobmFtZS5zdGFydHNXaXRoKEFHRU5UX0JSQU5DSF9QUkVGSVgpKSB7XG5cdFx0bmFtZSA9IG5hbWUuc3Vic3RyaW5nKEFHRU5UX0JSQU5DSF9QUkVGSVgubGVuZ3RoKTtcblx0fVxuXHRyZXR1cm4gbmFtZS5yZXBsYWNlKC9cXC8vZywgJy0nKTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGxvY2FsaXplZCBcIkNyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWUgZm9yIGJyYW5jaCBYXCIgbWFya2Rvd24gc2hvd25cbiAqIGF0IHRoZSB0b3Agb2YgdGhlIGZpcnN0IHJlc3BvbnNlIGluIHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb25zLiBUaGUgYnJhbmNoXG4gKiBuYW1lIGlzIHdyYXBwZWQgYXMgaW5saW5lIGNvZGUgc28gdGhlIGxvY2FsaXplZCB0ZW1wbGF0ZSBkb2Vzbid0IGhhdmUgdG9cbiAqIGVtYmVkIG1hcmtkb3duIHB1bmN0dWF0aW9uLiBUaGUgdHJhaWxpbmcgYmxhbmsgbGluZSBrZWVwcyB0aGUgYW5ub3VuY2VtZW50XG4gKiB2aXN1YWxseSBzZXBhcmF0ZWQgd2hlbiBpdCBnZXRzIG1lcmdlZCBpbnRvIHRoZSBzYW1lIG1hcmtkb3duIHBhcnQgYXMgdGhlXG4gKiBtb2RlbCdzIHJlcGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRXb3JrdHJlZUFubm91bmNlbWVudFRleHQoYnJhbmNoTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdCdhZ2VudEhvc3Qud29ya3RyZWVDcmVhdGVkJyxcblx0XHRcIkNyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWUgZm9yIGJyYW5jaCB7MH1cIixcblx0XHRhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGJyYW5jaE5hbWUpXG5cdCkgKyAnXFxuXFxuJztcbn1cblxuLyoqXG4gKiBUaGUgc3RlcHMgb2Ygd29ya3RyZWUgY3JlYXRpb24gdGhhdCBhcmUgc2xvdyBlbm91Z2ggdG8gYmUgd29ydGggbmFtaW5nIHdoaWxlXG4gKiBhIHNlc3Npb24gbWF0ZXJpYWxpemVzLiBPcmRlcmVkIGFzIHRoZXkgcnVuLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBXb3JrdHJlZUNyZWF0aW9uUGhhc2Uge1xuXHQvKiogUXVldWVkIGJlaGluZCBhbm90aGVyIHdvcmt0cmVlIGJlaW5nIGNyZWF0ZWQgaW4gdGhlIHNhbWUgcmVwb3NpdG9yeS4gKi9cblx0U3RhcnRpbmcsXG5cdC8qKiBBc2tpbmcgdGhlIG1vZGVsIGZvciBhIGJyYW5jaCBuYW1lLCB0aGVuIHByb2JpbmcgY2FuZGlkYXRlcyBmb3IgY29sbGlzaW9ucy4gKi9cblx0TmFtaW5nQnJhbmNoLFxuXHQvKiogYGdpdCB3b3JrdHJlZSBhZGRgIFx1MjAxNCB0aGUgcGhhc2UgdGhhdCByZXBvcnRzIGZpbGUtbGV2ZWwgcHJvZ3Jlc3MuICovXG5cdENoZWNraW5nT3V0LFxuXHQvKiogQ29weWluZyB0aGUgZ2l0LWlnbm9yZWQgZmlsZXMgdGhlIGNsaWVudCBhc2tlZCB0byBjYXJyeSBvdmVyLiAqL1xuXHRDb3B5aW5nSW5jbHVkZUZpbGVzLFxufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgbG9jYWxpemVkIGFjdGl2aXR5IGxhYmVsIGZvciBhIHdvcmt0cmVlLWNyZWF0aW9uIHBoYXNlLiBgcGVyY2VudGBcbiAqIG9ubHkgYXBwbGllcyB0byB0aGUgcGhhc2VzIHRoYXQgcmVwb3J0IGZpbGUtbGV2ZWwgcHJvZ3Jlc3NcbiAqICh7QGxpbmsgV29ya3RyZWVDcmVhdGlvblBoYXNlLkNoZWNraW5nT3V0fSBhbmRcbiAqIHtAbGluayBXb3JrdHJlZUNyZWF0aW9uUGhhc2UuQ29weWluZ0luY2x1ZGVGaWxlc30pLCB3aGVyZSBpdCBpcyBhYnNlbnQgdW50aWxcbiAqIHRoZSBmaXJzdCBzYW1wbGUgYXJyaXZlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQocGhhc2U6IFdvcmt0cmVlQ3JlYXRpb25QaGFzZSwgcGVyY2VudD86IG51bWJlcik6IHN0cmluZyB7XG5cdHN3aXRjaCAocGhhc2UpIHtcblx0XHRjYXNlIFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5OYW1pbmdCcmFuY2g6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC53b3JrdHJlZU5hbWluZ0JyYW5jaCcsIFwiQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKG5hbWluZyBicmFuY2gpXCIpO1xuXHRcdGNhc2UgV29ya3RyZWVDcmVhdGlvblBoYXNlLkNoZWNraW5nT3V0OlxuXHRcdFx0cmV0dXJuIHBlcmNlbnQgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3Qud29ya3RyZWVDaGVja2luZ091dCcsIFwiQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNoZWNraW5nIG91dCBmaWxlcylcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lndvcmt0cmVlQ2hlY2tpbmdPdXRQZXJjZW50JywgXCJDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZSAoY2hlY2tpbmcgb3V0IGZpbGVzLCB7MH0lKVwiLCBwZXJjZW50KTtcblx0XHRjYXNlIFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5Db3B5aW5nSW5jbHVkZUZpbGVzOlxuXHRcdFx0cmV0dXJuIHBlcmNlbnQgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3Qud29ya3RyZWVDb3B5aW5nSW5jbHVkZUZpbGVzJywgXCJDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZSAoY29weWluZyBhZGRpdGlvbmFsIGZpbGVzKVwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3Qud29ya3RyZWVDb3B5aW5nSW5jbHVkZUZpbGVzUGVyY2VudCcsIFwiQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNvcHlpbmcgYWRkaXRpb25hbCBmaWxlcywgezB9JSlcIiwgcGVyY2VudCk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lndvcmt0cmVlQ3JlYXRpbmcnLCBcIkNyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlXCIpO1xuXHR9XG59XG5cbi8qKlxuICogQWRhcHRzIHRoZSByYXcgZmlsZSBjb3VudHMgdGhlIGdpdCBzZXJ2aWNlIHJlcG9ydHMgaW50byBwcm9ncmVzcyBsYWJlbHMgZm9yXG4gKiBhIHBoYXNlLiBSb3VuZHMgZG93biB0byB3aG9sZSBwZXJjZW50YWdlcywgZHJvcHMgbm9uLWFkdmFuY2luZyBzYW1wbGVzLCBhbmRcbiAqIGRlYm91bmNlcyB1cGRhdGVzIHRvIGF2b2lkIG92ZXJ3aGVsbWluZyBjb25zdW1lcnMsIGZsdXNoaW5nIHRoZSBsYXRlc3RcbiAqIHBlcmNlbnRhZ2Ugd2hlbiB0aGUgb3BlcmF0aW9uIGNvbXBsZXRlcy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gd2l0aFBlcmNlbnRQcm9ncmVzczxUPihcblx0cGhhc2U6IFdvcmt0cmVlQ3JlYXRpb25QaGFzZSxcblx0b25Qcm9ncmVzczogKChhY3Rpdml0eTogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCxcblx0b3BlcmF0aW9uOiAob25Qcm9ncmVzczogKChwcm9ncmVzczogSVdvcmt0cmVlRmlsZVByb2dyZXNzKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCkgPT4gUHJvbWlzZTxUPixcbik6IFByb21pc2U8VD4ge1xuXHRpZiAoIW9uUHJvZ3Jlc3MpIHtcblx0XHRyZXR1cm4gb3BlcmF0aW9uKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRsZXQgbGFzdFBlcmNlbnQgPSAtMTtcblx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gb25Qcm9ncmVzcyhidWlsZFdvcmt0cmVlUHJvZ3Jlc3NUZXh0KHBoYXNlLCBsYXN0UGVyY2VudCkpLCBXT1JLVFJFRV9QUk9HUkVTU19ERUJPVU5DRV9NUyk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IG9wZXJhdGlvbigoeyBmaWxlc0RvbmUsIGZpbGVzVG90YWwgfSkgPT4ge1xuXHRcdFx0Y29uc3QgcGVyY2VudCA9IE1hdGgubWluKDEwMCwgTWF0aC5mbG9vcihmaWxlc0RvbmUgKiAxMDAgLyBmaWxlc1RvdGFsKSk7XG5cdFx0XHRpZiAocGVyY2VudCA8PSBsYXN0UGVyY2VudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsYXN0UGVyY2VudCA9IHBlcmNlbnQ7XG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KTtcblx0fSBmaW5hbGx5IHtcblx0XHRjb25zdCBzaG91bGRGbHVzaCA9IHNjaGVkdWxlci5pc1NjaGVkdWxlZCgpO1xuXHRcdHNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0aWYgKHNob3VsZEZsdXNoKSB7XG5cdFx0XHRvblByb2dyZXNzKGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQocGhhc2UsIGxhc3RQZXJjZW50KSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBhIGNvcHkgb2YgYHR1cm5zYCB3aGVyZSBgYW5ub3VuY2VtZW50YCBoYXMgYmVlbiBwcmVwZW5kZWQgdG8gdGhlXG4gKiBmaXJzdCB0b3AtbGV2ZWwgYXNzaXN0YW50IHR1cm4ncyBmaXJzdCBtYXJrZG93biByZXNwb25zZSBwYXJ0LiBVc2VkIG9uXG4gKiBzZXNzaW9uIHJlc3RvcmUgc28gdGhlIHdvcmt0cmVlIGFubm91bmNlbWVudCByZW1haW5zIHZpc2libGUgYWZ0ZXIgdGhlXG4gKiBzZXNzaW9uIGlzIHJlb3BlbmVkLiBJZiBubyBhc3Npc3RhbnQgY29udGVudCBleGlzdHMgeWV0LCBhIGZyZXNoIG1hcmtkb3duXG4gKiBwYXJ0IGlzIGluc2VydGVkIGF0IHRoZSB0b3Agb2YgdGhlIGZpcnN0IHR1cm4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwZW5kQW5ub3VuY2VtZW50VG9GaXJzdFR1cm4odHVybnM6IHJlYWRvbmx5IFR1cm5bXSwgYW5ub3VuY2VtZW50OiBzdHJpbmcpOiByZWFkb25seSBUdXJuW10ge1xuXHRpZiAodHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHR1cm5zO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IHR1cm5zLnNsaWNlKCk7XG5cdGNvbnN0IGZpcnN0ID0gcmVzdWx0WzBdO1xuXHRjb25zdCBwYXJ0ID0gZmlyc3QucmVzcG9uc2VQYXJ0c1swXTtcblx0aWYgKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pIHtcblx0XHRjb25zdCByZXNwb25zZVBhcnRzID0gZmlyc3QucmVzcG9uc2VQYXJ0cy5zbGljZSgpO1xuXHRcdHJlc3BvbnNlUGFydHNbMF0gPSB7IC4uLnBhcnQsIGNvbnRlbnQ6IGFubm91bmNlbWVudCArIHBhcnQuY29udGVudCB9O1xuXHRcdHJlc3VsdFswXSA9IHsgLi4uZmlyc3QsIHJlc3BvbnNlUGFydHMgfTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCByZXNwb25zZVBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtcblx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50OiBhbm5vdW5jZW1lbnQgfSxcblx0XHRcdC4uLmZpcnN0LnJlc3BvbnNlUGFydHMsXG5cdFx0XTtcblx0XHRyZXN1bHRbMF0gPSB7IC4uLmZpcnN0LCByZXNwb25zZVBhcnRzIH07XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIFBhcmFtZXRlcnMgZm9yIHtAbGluayBXb3JrdHJlZUlzb2xhdGlvbi5yZXNvbHZlSXNvbGF0aW9uQ29uZmlnfS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVJc29sYXRpb25Db25maWdSZXF1ZXN0IHtcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFRoZSBpc29sYXRpb24gKyBicmFuY2ggc2NoZW1hIGNvbnRyaWJ1dGlvbiBmb3IgYW4gYWdlbnQnc1xuICogYHJlc29sdmVTZXNzaW9uQ29uZmlnYC4gQ2FsbGVycyBtZXJnZSB7QGxpbmsgaXNvbGF0aW9uUHJvcGVydHl9IChhbmRcbiAqIHtAbGluayBicmFuY2hQcm9wZXJ0eX0gLyB7QGxpbmsgd29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eX0gd2hlbiBwcmVzZW50KVxuICogaW50byB0aGVpciBvd24gc2NoZW1hIGFuZCBtZXJnZSB0aGUgZGVmYXVsdCB2YWx1ZXMgKHtAbGluayBpc29sYXRpb25WYWx1ZX0gL1xuICoge0BsaW5rIGJyYW5jaERlZmF1bHR9KSBpbnRvIHRoZSBkZWZhdWx0cyBiYWcgdGhleSBwYXNzIHRvIGB2YWxpZGF0ZU9yRGVmYXVsdGAuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUlzb2xhdGlvbkNvbmZpZ0NvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IGlzb2xhdGlvblByb3BlcnR5OiBJU2NoZW1hUHJvcGVydHk8J2ZvbGRlcicgfCAnd29ya3RyZWUnPjtcblx0cmVhZG9ubHkgYnJhbmNoUHJvcGVydHk6IElTY2hlbWFQcm9wZXJ0eTxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogUmVhZC1vbmx5IGNhcnJpZXIgZm9yIHRoZSBjbGllbnQncyBgZ2l0LmJyYW5jaFByZWZpeGAuIERlY2xhcmVkIGZvciBib3RoXG5cdCAqIGlzb2xhdGlvbnMgKGxpa2UgYGJyYW5jaGApIHNvIHRoZSB2YWx1ZSByaWRlcyBgX2NvbmZpZy52YWx1ZXNgIGFuZFxuXHQgKiBzdXJ2aXZlcyBpc29sYXRpb24gdG9nZ2xlczsgdGhlIGhvc3Qgb25seSBjb25zdW1lcyBpdCBmb3Igd29ya3RyZWVcblx0ICogaXNvbGF0aW9uIChzZWUge0BsaW5rIFdvcmt0cmVlSXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5fSkuXG5cdCAqL1xuXHRyZWFkb25seSB3b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5OiBJU2NoZW1hUHJvcGVydHk8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0LyoqIFJlYWQtb25seSBjYXJyaWVyIGZvciB0aGUgY2xpZW50J3MgYGdpdC53b3JrdHJlZUluY2x1ZGVGaWxlc2AuICovXG5cdHJlYWRvbmx5IHdvcmt0cmVlSW5jbHVkZUZpbGVzUHJvcGVydHk6IElTY2hlbWFQcm9wZXJ0eTxyZWFkb25seSBzdHJpbmdbXT4gfCB1bmRlZmluZWQ7XG5cdC8qKiBSZWFkLW9ubHkgY2FycmllciBmb3IgdGhlIHByb2dyYW1tYXRpYyB3b3JrdHJlZSBicmFuY2ggdHJhY2tpbmcgcHJlZmVyZW5jZS4gKi9cblx0cmVhZG9ubHkgd29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5OiBJU2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzb2xhdGlvblZhbHVlOiAnZm9sZGVyJyB8ICd3b3JrdHJlZSc7XG5cdHJlYWRvbmx5IGJyYW5jaERlZmF1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnJhbmNoVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuLyoqIFBhcmFtZXRlcnMgZm9yIHtAbGluayBXb3JrdHJlZUlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeX0uICovXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlV29ya2luZ0RpcmVjdG9yeVJlcXVlc3Qge1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHByb21wdD86IHN0cmluZztcblx0cmVhZG9ubHkgZ2l0aHViVG9rZW4/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBSZWNlaXZlcyBsb2NhbGl6ZWQgYWN0aXZpdHkgbGFiZWxzIHdoaWxlIHRoZSB3b3JrdHJlZSBpcyBiZWluZyBjcmVhdGVkLFxuXHQgKiBzbyBjYWxsZXJzIGNhbiBzdXJmYWNlIGxpdmUgcHJvZ3Jlc3MuIE9ubHkgY2FsbGVkIGZvciBzZXNzaW9ucyB0aGF0XG5cdCAqIHNlbGVjdGVkIHdvcmt0cmVlIGlzb2xhdGlvbiBcdTIwMTQgdGhvdWdoIHN1Y2ggYSBzZXNzaW9uIGNhbiBzdGlsbCBmYWxsIGJhY2tcblx0ICogdG8gaXRzIGZvbGRlciBhZnRlciB0aGUgZmlyc3QgbGFiZWwgKGUuZy4gdGhlIGRpcmVjdG9yeSB0dXJucyBvdXQgbm90IHRvXG5cdCAqIGJlIGEgZ2l0IHJlcG9zaXRvcnkpIFx1MjAxNCBhbmQgdGhlIGNhbGxlciBpcyByZXNwb25zaWJsZSBmb3IgY2xlYXJpbmcgdGhlXG5cdCAqIGFjdGl2aXR5IG9uY2UgcmVzb2x1dGlvbiBzZXR0bGVzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25Qcm9ncmVzcz86IChhY3Rpdml0eTogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIFNoYXJlZCwgcGVyLWFnZW50IGNvbnRyb2xsZXIgZm9yIGdpdC13b3JrdHJlZSBzZXNzaW9uIGlzb2xhdGlvbi4gT3ducyB0aGVcbiAqIGZ1bGwgbWFjaGluZXJ5IENvcGlsb3QgcGlvbmVlcmVkIHNvIENvZGV4IGFuZCBDbGF1ZGUgZ2V0IGlkZW50aWNhbCBiZWhhdmlvcjpcbiAqXG4gKiAtIGFkdmVydGlzaW5nIHRoZSBgaXNvbGF0aW9uYCAoYGZvbGRlcmAgLyBgd29ya3RyZWVgKSBhbmQgYGJyYW5jaGAgc2Vzc2lvblxuICogICBjb25maWcgcHJvcGVydGllcyBmcm9tIGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2AgKHtAbGluayByZXNvbHZlSXNvbGF0aW9uQ29uZmlnfSk7XG4gKiAtIGNvbXBsZXRpbmcgYnJhbmNoIG5hbWVzIGZvciB0aGUgYnJhbmNoIHBpY2tlciAoe0BsaW5rIGJyYW5jaENvbXBsZXRpb25zfSk7XG4gKiAtIGNyZWF0aW5nIHRoZSB3b3JrdHJlZSBvbiBtYXRlcmlhbGl6YXRpb24gYW5kIHBlcnNpc3RpbmcgaXRzIG1ldGFkYXRhXG4gKiAgICh7QGxpbmsgcmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnl9KTtcbiAqIC0gc3VyZmFjaW5nIHRoZSBcIkNyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWVcIiBhbm5vdW5jZW1lbnQgbGl2ZSBvbiB0aGUgZmlyc3RcbiAqICAgdHVybiAoe0BsaW5rIHRha2VQZW5kaW5nQW5ub3VuY2VtZW50fSkgYW5kIG9uIHJlc3RvcmVcbiAqICAgKHtAbGluayBhcHBseVJlc3RvcmVBbm5vdW5jZW1lbnR9KTtcbiAqIC0gY2xlYW5pbmcgdXAgLyByZWNyZWF0aW5nIHRoZSB3b3JrdHJlZSBvbiBkaXNwb3NlLCBhcmNoaXZlLCBhbmQgdW5hcmNoaXZlLlxuICpcbiAqIEEgc2luZ2xlIGhvc3Qtb3duZWQgaW5zdGFuY2Ugc2VydmVzIGV2ZXJ5IGFnZW50OiB0aGUgb3JjaGVzdHJhdG9yXG4gKiAoe0BsaW5rIEFnZW50U2VydmljZX0pIGNyZWF0ZXMgaXQgYW5kIGRyaXZlcyB0aGUgbGlmZWN5Y2xlIHNvIGluZGl2aWR1YWxcbiAqIGFnZW50cyBzdGF5IHVuYXdhcmUgb2YgdGhlIGZvbGRlci12cy13b3JrdHJlZSBkaXN0aW5jdGlvbi4gU2Vzc2lvbiBzdGF0ZVxuICogKGBfY3JlYXRlZFdvcmt0cmVlc2AsIHBlbmRpbmcgbWFya2VycywgcGVuZGluZyBhbm5vdW5jZW1lbnRzKSBpcyBrZXllZCBieSB0aGVcbiAqIGdsb2JhbGx5LXVuaXF1ZSBzZXNzaW9uSWQsIHNvIHNoYXJpbmcgb25lIGluc3RhbmNlIGFjcm9zcyBhZ2VudHMgaXMgc2FmZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmt0cmVlSXNvbGF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIFdvcmt0cmVlcyBjcmVhdGVkIGJ5IHRoaXMgYWdlbnQgaW4gdGhlIGN1cnJlbnQgcHJvY2Vzcywga2V5ZWQgYnlcblx0ICogc2Vzc2lvbklkLiBVc2VkIHRvIHJlbW92ZSB0aGUgd29ya3RyZWUgb24gZGlzcG9zZSAvIGVycm9yIGFuZCB0b1xuXHQgKiBlbnVtZXJhdGUgbGl2ZSB3b3JrdHJlZXMgZHVyaW5nIHNodXRkb3duLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY3JlYXRlZFdvcmt0cmVlcyA9IG5ldyBNYXA8c3RyaW5nLCBJQ3JlYXRlZFdvcmt0cmVlPigpO1xuXG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiBhbm5vdW5jZW1lbnQgKG1hcmtkb3duKSBlbWl0dGVkIGFzIGEgc3ludGhldGljIHN0cmVhbWluZ1xuXHQgKiBtYXJrZG93biBwYXJ0IHRoZSBmaXJzdCB0aW1lIHRoZSBzZXNzaW9uIHNlbmRzIGEgbWVzc2FnZS4gU3VyZmFjZXMgdGhlXG5cdCAqIFwiQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZSBmb3IgYnJhbmNoIFhcIiBtZXNzYWdlIGxpdmUgZHVyaW5nIHRoZSBmaXJzdFxuXHQgKiB0dXJuOyB0aGUgc2FtZSBhbm5vdW5jZW1lbnQgaXMgcmUtaW5qZWN0ZWQgb24gcmVzdG9yZSB2aWFcblx0ICoge0BsaW5rIGFwcGx5UmVzdG9yZUFubm91bmNlbWVudH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nRmlyc3RUdXJuQW5ub3VuY2VtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIFNlc3Npb25JZHMgb2YgZnJlc2hseS1jcmVhdGVkIHdvcmt0cmVlLWlzb2xhdGlvbiBzZXNzaW9ucyB3aG9zZSB3b3JrdHJlZVxuXHQgKiBoYXMgbm90IHlldCBiZWVuIGNyZWF0ZWQgKGNyZWF0aW9uIGlzIGRlZmVycmVkIHRvIHRoZSBmaXJzdCBzZW5kIHNvIHRoZVxuXHQgKiB1c2VyJ3MgcHJvbXB0IGNhbiBkcml2ZSBicmFuY2ggbmFtaW5nKS4gV2hpbGUgYSBzZXNzaW9uIGlzIGluIHRoaXMgc2V0IHRoZVxuXHQgKiBob3N0IHJlcG9ydHMgaXRzIHdvcmtpbmcgZGlyZWN0b3J5IGFzIFwicGVuZGluZ1wiICh7QGxpbmsgaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZ30pXG5cdCAqIHNvIGFnZW50cyBkZWZlciBwcmV3YXJtaW5nIC8gbWF0ZXJpYWxpemluZyB1bnRpbCB7QGxpbmsgcmVzb2x2ZU9uRmlyc3RTZW5kfVxuXHQgKiBydW5zLiBOZXZlciBwb3B1bGF0ZWQgZm9yIHJlc3RvcmVkIHNlc3Npb25zIFx1MjAxNCB0aGVpciB3b3JrdHJlZSBhbHJlYWR5IGV4aXN0c1xuXHQgKiBvbiBkaXNrIGFuZCB0aGVpciBwZXJzaXN0ZWQgd29ya2luZyBkaXJlY3RvcnkgYWxyZWFkeSBwb2ludHMgYXQgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0LyoqIEZpeGVkIGxvZyBsYWJlbDsgb25lIGhvc3Qtb3duZWQgaW5zdGFuY2Ugc2VydmVzIGV2ZXJ5IGFnZW50LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dMYWJlbCA9ICdBZ2VudEhvc3QnO1xuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSB3b3JrdHJlZSBsaWZlY3ljbGUgcGVyIHNlc3Npb24gc28gYSBmaXJzdC1zZW5kIGNyZWF0aW9uXG5cdCAqICh7QGxpbmsgcmVzb2x2ZU9uRmlyc3RTZW5kfSkgbmV2ZXIgaW50ZXJsZWF2ZXMgd2l0aCBhcmNoaXZlL3VuYXJjaGl2ZVxuXHQgKiBjbGVhbnVwICh7QGxpbmsgY2xlYW51cFdvcmt0cmVlT25BcmNoaXZlfSAvIHtAbGluayByZWNyZWF0ZVdvcmt0cmVlT25VbmFyY2hpdmV9KVxuXHQgKiBvciBkaXNwb3NlICh7QGxpbmsgcmVtb3ZlQ3JlYXRlZFdvcmt0cmVlfSkgZm9yIHRoZSBzYW1lIHNlc3Npb24gXHUyMDE0IHRoZVxuXHQgKiBndWFyYW50ZWUgZWFjaCBhZ2VudCBwcmV2aW91c2x5IGVuZm9yY2VkIHdpdGggaXRzIG93biBzZXF1ZW5jZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrdHJlZUNyZWF0aW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHQvKiogQnJhbmNoLW5hbWUgZ2VuZXJhdG9yIGZvciB3b3JrdHJlZSBzZXNzaW9uczsgY3JlYXRlZCBmcm9tIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2V9IHVubGVzcyBhIHRlc3Qgc3VwcGxpZXMgYW4gb3ZlcnJpZGUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyYW5jaE5hbWVHZW5lcmF0b3I6IElBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YnJhbmNoTmFtZUdlbmVyYXRvcjogSUFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciB8IHVuZGVmaW5lZCxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBjb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkRhdGFTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYnJhbmNoTmFtZUdlbmVyYXRvciA9IGJyYW5jaE5hbWVHZW5lcmF0b3IgPz8gbmV3IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvcihjb3BpbG90QXBpU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdH1cblxuXHQvKiogU2Vzc2lvbklkcyB3aXRoIGEgd29ya3RyZWUgY3JlYXRlZCBieSB0aGlzIGFnZW50IGluIHRoZSBjdXJyZW50IHByb2Nlc3MuICovXG5cdGdldCBjcmVhdGVkV29ya3RyZWVTZXNzaW9uSWRzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2NyZWF0ZWRXb3JrdHJlZXMua2V5cygpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrcyBhIGZyZXNoIHdvcmt0cmVlLWlzb2xhdGlvbiBzZXNzaW9uIGFzIHBlbmRpbmcgXHUyMDE0IGl0cyB3b3JrdHJlZSBpc1xuXHQgKiBkZWZlcnJlZCB0byB0aGUgZmlyc3Qgc2VuZC4gQ2FsbGVkIGJ5IHRoZSBob3N0IHdoaWxlIGEgY3JlYXRpbmcgc2Vzc2lvbidzXG5cdCAqIHJlc29sdmVkIGNvbmZpZyBzZWxlY3RzIGB3b3JrdHJlZWAgaXNvbGF0aW9uLlxuXHQgKi9cblx0bm90ZVBlbmRpbmcoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nLmFkZChzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIENsZWFycyBhIHBlbmRpbmcgbWFya2VyIHdoZW4gYSBzZXNzaW9uIHdpbGwgbm90IG1hdGVyaWFsaXplIGEgd29ya3RyZWUuICovXG5cdGNsZWFyUGVuZGluZyhzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKHNlc3Npb25JZCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIHNlc3Npb24ncyB3b3JrdHJlZSBpcyBzdGlsbCBwZW5kaW5nIGNyZWF0aW9uLiBUaGUgaG9zdCBleHBvc2VzXG5cdCAqIHRoaXMgdGhyb3VnaCB7QGxpbmsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZ30gc29cblx0ICogYWdlbnRzIGRlZmVyIG1hdGVyaWFsaXphdGlvbiB1bnRpbCB0aGUgaG9zdCBoYXMgcmVzb2x2ZWQgdGhlIHdvcmt0cmVlLlxuXHQgKi9cblx0aXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhzZXNzaW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nLmhhcyhzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIFRoZSB3b3JrdHJlZSBjcmVhdGVkIGZvciBhIHNlc3Npb24gaW4gdGhpcyBwcm9jZXNzLCBpZiBhbnkuICovXG5cdGdldFJlc29sdmVkV29ya3RyZWUoc2Vzc2lvbklkOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVkV29ya3RyZWVzLmdldChzZXNzaW9uSWQpPy53b3JrdHJlZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJzdC1zZW5kIHdvcmt0cmVlIHJlc29sdXRpb246IGNyZWF0ZXMgdGhlIHdvcmt0cmVlICh3aGVuIHRoZSBzZXNzaW9uXG5cdCAqIHNlbGVjdGVkIGB3b3JrdHJlZWAgaXNvbGF0aW9uIG9uIGEgZ2l0IHJlcG8pIGFuZCBjbGVhcnMgdGhlIHBlbmRpbmcgbWFya2VyXG5cdCAqIHJlZ2FyZGxlc3Mgb2Ygb3V0Y29tZSwgc28gYSBmYWlsZWQgY3JlYXRpb24gZmFsbHMgYmFjayB0byBmb2xkZXIgaXNvbGF0aW9uXG5cdCAqIGluc3RlYWQgb2YgbGVhdmluZyB0aGUgc2Vzc2lvbiBwZXJtYW5lbnRseSBcInBlbmRpbmdcIi4gRGVsZWdhdGVzIHRvXG5cdCAqIHtAbGluayByZXNvbHZlV29ya2luZ0RpcmVjdG9yeX0sIHdoaWNoIGlzIGlkZW1wb3RlbnQgcGVyIHNlc3Npb24uXG5cdCAqL1xuXHRhc3luYyByZXNvbHZlT25GaXJzdFNlbmQocmVxdWVzdDogSVJlc29sdmVXb3JraW5nRGlyZWN0b3J5UmVxdWVzdCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShyZXF1ZXN0LnNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkocmVxdWVzdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLmNsZWFyUGVuZGluZyhyZXF1ZXN0LnNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBgaXNvbGF0aW9uYCAvIGBicmFuY2hgIHNjaGVtYSBjb250cmlidXRpb24gZm9yXG5cdCAqIGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2AuIFdoZW4ge0BsaW5rIElSZXNvbHZlSXNvbGF0aW9uQ29uZmlnUmVxdWVzdC53b3JraW5nRGlyZWN0b3J5fVxuXHQgKiBpcyBub3QgYSBnaXQgcmVwb3NpdG9yeSAob3IgaGFzIG5vIGNvbW1pdHMgeWV0KSBpc29sYXRpb24gaXMgZm9yY2VkIHRvXG5cdCAqIGBmb2xkZXJgIGFuZCBubyBicmFuY2ggcHJvcGVydHkgaXMgb2ZmZXJlZC5cblx0ICovXG5cdGFzeW5jIHJlc29sdmVJc29sYXRpb25Db25maWcocmVxdWVzdDogSVJlc29sdmVJc29sYXRpb25Db25maWdSZXF1ZXN0KTogUHJvbWlzZTxJSXNvbGF0aW9uQ29uZmlnQ29udHJpYnV0aW9uPiB7XG5cdFx0Y29uc3QgZ2l0SW5mbyA9IHJlcXVlc3Qud29ya2luZ0RpcmVjdG9yeSA/IGF3YWl0IHRoaXMuX2dldEdpdEluZm8ocmVxdWVzdC53b3JraW5nRGlyZWN0b3J5KSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGlzb2xhdGlvblByb3BlcnR5ID0gc2NoZW1hUHJvcGVydHk8J2ZvbGRlcicgfCAnd29ya3RyZWUnPih7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuaXNvbGF0aW9uJywgXCJJc29sYXRpb25cIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmlzb2xhdGlvbkRlc2NyaXB0aW9uJywgXCJXaGVyZSB0aGUgYWdlbnQgc2hvdWxkIG1ha2UgY2hhbmdlc1wiKSxcblx0XHRcdGVudW06IGdpdEluZm8gPyBbJ2ZvbGRlcicsICd3b3JrdHJlZSddIDogWydmb2xkZXInXSxcblx0XHRcdGVudW1MYWJlbHM6IGdpdEluZm8gPyBbbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmlzb2xhdGlvbi5mb2xkZXInLCBcIkZvbGRlclwiKSwgbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmlzb2xhdGlvbi53b3JrdHJlZScsIFwiV29ya3RyZWVcIildIDogW2xvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5pc29sYXRpb24uZm9sZGVyJywgXCJGb2xkZXJcIildLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogZ2l0SW5mbyA/IFtsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuaXNvbGF0aW9uLmZvbGRlckRlc2NyaXB0aW9uJywgXCJXb3JrIGRpcmVjdGx5IGluIHRoZSBmb2xkZXJcIiksIGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5pc29sYXRpb24ud29ya3RyZWVEZXNjcmlwdGlvbicsIFwiQ3JlYXRlIGEgR2l0IHdvcmt0cmVlIGZvciBpc29sYXRpb25cIildIDogW2xvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5pc29sYXRpb24uZm9sZGVyRGVzY3JpcHRpb24nLCBcIldvcmsgZGlyZWN0bHkgaW4gdGhlIGZvbGRlclwiKV0sXG5cdFx0XHRkZWZhdWx0OiBnaXRJbmZvID8gJ3dvcmt0cmVlJyA6ICdmb2xkZXInLFxuXHRcdFx0cmVhZE9ubHk6ICFnaXRJbmZvLFxuXHRcdFx0c2Vzc2lvbk11dGFibGU6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVzb2x2ZSBpc29sYXRpb24gZmlyc3QgXHUyMDE0IGRvd25zdHJlYW0gc2NoZW1hIHNoYXBlcyAoYnJhbmNoJ3Ncblx0XHQvLyByZWFkLW9ubHkgbW9kZSArIGVudW0gcmVzdHJpY3Rpb24pIGRlcGVuZCBvbiB0aGUgZWZmZWN0aXZlIHZhbHVlLlxuXHRcdGNvbnN0IGlzb2xhdGlvbkRlZmF1bHQ6ICdmb2xkZXInIHwgJ3dvcmt0cmVlJyA9IGdpdEluZm8gPyAnd29ya3RyZWUnIDogJ2ZvbGRlcic7XG5cdFx0Y29uc3QgaXNvbGF0aW9uVmFsdWUgPSBpc29sYXRpb25Qcm9wZXJ0eS52YWxpZGF0ZShyZXF1ZXN0LmNvbmZpZz8uW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSlcblx0XHRcdD8gcmVxdWVzdC5jb25maWchW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSBhcyAnZm9sZGVyJyB8ICd3b3JrdHJlZSdcblx0XHRcdDogaXNvbGF0aW9uRGVmYXVsdDtcblxuXHRcdGxldCBicmFuY2hQcm9wZXJ0eTogSVNjaGVtYVByb3BlcnR5PHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGJyYW5jaERlZmF1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYnJhbmNoVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgd29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eTogSVNjaGVtYVByb3BlcnR5PHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHdvcmt0cmVlSW5jbHVkZUZpbGVzUHJvcGVydHk6IElTY2hlbWFQcm9wZXJ0eTxyZWFkb25seSBzdHJpbmdbXT4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHdvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eTogSVNjaGVtYVByb3BlcnR5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChnaXRJbmZvKSB7XG5cdFx0XHRjb25zdCBicmFuY2hSZWFkT25seSA9IGlzb2xhdGlvblZhbHVlID09PSAnZm9sZGVyJztcblx0XHRcdGJyYW5jaERlZmF1bHQgPSBpc29sYXRpb25WYWx1ZSA9PT0gJ3dvcmt0cmVlJyA/IGdpdEluZm8uZGVmYXVsdEJyYW5jaC5uYW1lIDogZ2l0SW5mby5jdXJyZW50QnJhbmNoO1xuXHRcdFx0YnJhbmNoVmFsdWUgPSBpc29sYXRpb25WYWx1ZSA9PT0gJ3dvcmt0cmVlJyAmJiB0eXBlb2YgcmVxdWVzdC5jb25maWc/LltTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0gPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gcmVxdWVzdC5jb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdIGFzIHN0cmluZ1xuXHRcdFx0XHQ6IGJyYW5jaERlZmF1bHQ7XG5cdFx0XHRicmFuY2hQcm9wZXJ0eSA9IHNjaGVtYVByb3BlcnR5PHN0cmluZz4oe1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5icmFuY2gnLCBcIkJyYW5jaFwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5icmFuY2hEZXNjcmlwdGlvbicsIFwiQmFzZSBicmFuY2ggdG8gd29yayBmcm9tXCIpLFxuXHRcdFx0XHRlbnVtOiBbYnJhbmNoRGVmYXVsdF0sXG5cdFx0XHRcdGVudW1MYWJlbHM6IFticmFuY2hEZWZhdWx0XSxcblx0XHRcdFx0ZGVmYXVsdDogYnJhbmNoRGVmYXVsdCxcblx0XHRcdFx0ZW51bUR5bmFtaWM6ICFicmFuY2hSZWFkT25seSxcblx0XHRcdFx0cmVhZE9ubHk6IGJyYW5jaFJlYWRPbmx5LFxuXHRcdFx0XHRzZXNzaW9uTXV0YWJsZTogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ2FycmllciBmb3IgdGhlIGNsaWVudCdzIGBnaXQuYnJhbmNoUHJlZml4YDogdGhlIGhvc3QgcHJlcGVuZHMgaXRcblx0XHRcdC8vIHRvIHRoZSBicmFuY2ggaXQgY3JlYXRlcyBmb3IgYW4gaXNvbGF0ZWQgd29ya3RyZWUuIERlY2xhcmVkIGZvclxuXHRcdFx0Ly8gYm90aCBpc29sYXRpb25zIChsaWtlIGBicmFuY2hgKSwgc28gdGhlIHZhbHVlIHJpZGVzXG5cdFx0XHQvLyBgX2NvbmZpZy52YWx1ZXNgIGFuZCBzdXJ2aXZlcyBpc29sYXRpb24gdG9nZ2xlcyBcdTIwMTQgYSB1c2VyIHdobyBmbGlwc1xuXHRcdFx0Ly8gd29ya3RyZWUgXHUyMTkyIGZvbGRlciBcdTIxOTIgd29ya3RyZWUga2VlcHMgdGhlIHByZWZpeC4gSXQgaGFzIG5vXG5cdFx0XHQvLyBgZW51bWAvYGVudW1EeW5hbWljYCwgc28gdGhlIGNvbmZpZyBwaWNrZXIgdHJlYXRzIGl0IGFzXG5cdFx0XHQvLyBub24tcGlja2FibGUgYW5kIG5ldmVyIHN1cmZhY2VzIGl0IGFzIGEgY2hpcDogdGhlIGNsaWVudCBzZWVkcyBpdFxuXHRcdFx0Ly8gKGZyb20gYGdpdC5icmFuY2hQcmVmaXhgKSwgdGhlIHVzZXIgbmV2ZXIgZWRpdHMgaXQsIGFuZCB0aGUgaG9zdFxuXHRcdFx0Ly8gb25seSAqY29uc3VtZXMqIGl0IGZvciB3b3JrdHJlZSBpc29sYXRpb24gKHNlZVxuXHRcdFx0Ly8ge0BsaW5rIHJlc29sdmVXb3JraW5nRGlyZWN0b3J5fSkuXG5cdFx0XHR3b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5ID0gc2NoZW1hUHJvcGVydHk8c3RyaW5nPih7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLndvcmt0cmVlQnJhbmNoUHJlZml4JywgXCJXb3JrdHJlZSBCcmFuY2ggUHJlZml4XCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLndvcmt0cmVlQnJhbmNoUHJlZml4RGVzY3JpcHRpb24nLCBcIlByZWZpeCBhcHBsaWVkIHRvIHRoZSBicmFuY2ggY3JlYXRlZCBmb3IgYW4gaXNvbGF0ZWQgd29ya3RyZWUuXCIpLFxuXHRcdFx0XHRyZWFkT25seTogdHJ1ZSxcblx0XHRcdFx0c2Vzc2lvbk11dGFibGU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdHdvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eSA9IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLndvcmt0cmVlQnJhbmNoVHJhY2snLCBcIldvcmt0cmVlIEJyYW5jaCBUcmFja2luZ1wiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy53b3JrdHJlZUJyYW5jaFRyYWNrRGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdGhlIGJyYW5jaCBjcmVhdGVkIGZvciBhbiBpc29sYXRlZCB3b3JrdHJlZSB0cmFja3MgaXRzIHVwc3RyZWFtLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHRzZXNzaW9uTXV0YWJsZTogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0d29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eSA9IHNjaGVtYVByb3BlcnR5PHJlYWRvbmx5IHN0cmluZ1tdPih7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcud29ya3RyZWVJbmNsdWRlRmlsZXMnLCBcIldvcmt0cmVlIEluY2x1ZGUgRmlsZXNcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcud29ya3RyZWVJbmNsdWRlRmlsZXNEZXNjcmlwdGlvbicsIFwiR2xvYiBwYXR0ZXJucyBmb3IgZ2l0LWlnbm9yZWQgZmlsZXMgdG8gY29weSBpbnRvIHRoZSBpc29sYXRlZCB3b3JrdHJlZS5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy53b3JrdHJlZUluY2x1ZGVGaWxlc0l0ZW0nLCBcIlBhdHRlcm5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHRzZXNzaW9uTXV0YWJsZTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBpc29sYXRpb25Qcm9wZXJ0eSwgYnJhbmNoUHJvcGVydHksIHdvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHksIHdvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eSwgd29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eSwgaXNvbGF0aW9uVmFsdWUsIGJyYW5jaERlZmF1bHQsIGJyYW5jaFZhbHVlIH07XG5cdH1cblxuXHQvKipcblx0ICogQnJhbmNoLW5hbWUgY29tcGxldGlvbnMgZm9yIHRoZSBicmFuY2ggcGlja2VyLiBDYWxsZXJzIGZvcndhcmQgdGhpcyBmcm9tXG5cdCAqIHRoZWlyIGBzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNgIHdoZW4gdGhlIHJlcXVlc3RlZCBwcm9wZXJ0eSBpc1xuXHQgKiB7QGxpbmsgU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2h9LlxuXHQgKi9cblx0YXN5bmMgYnJhbmNoQ29tcGxldGlvbnMod29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBxdWVyeT86IHN0cmluZyk6IFByb21pc2U8eyBpdGVtczogeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH1bXSB9PiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0XHR9XG5cdFx0Y29uc3QgW2JyYW5jaGVzLCBjdXJyZW50QnJhbmNoLCBkZWZhdWx0QnJhbmNoXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX2dpdFNlcnZpY2UuZ2V0QnJhbmNoZXMod29ya2luZ0RpcmVjdG9yeSwgeyBwYXR0ZXJuOiBbJ3JlZnMvaGVhZHMnXSwgc29ydDogJ2NvbW1pdHRlcmRhdGUnIH0pLFxuXHRcdFx0dGhpcy5fZ2l0U2VydmljZS5nZXRDdXJyZW50QnJhbmNoKHdvcmtpbmdEaXJlY3RvcnkpLFxuXHRcdFx0dGhpcy5fZ2l0U2VydmljZS5nZXREZWZhdWx0QnJhbmNoKHdvcmtpbmdEaXJlY3RvcnkpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGJyYW5jaENvbXBsZXRpb25zID0gZ2V0QnJhbmNoQ29tcGxldGlvbnMoYnJhbmNoZXMubWFwKGJyYW5jaCA9PiBicmFuY2gubmFtZSksIHtcblx0XHRcdGN1cnJlbnRCcmFuY2gsXG5cdFx0XHRkZWZhdWx0QnJhbmNoOiBkZWZhdWx0QnJhbmNoPy5uYW1lLFxuXHRcdFx0cXVlcnksXG5cdFx0XHRsaW1pdDogQlJBTkNIX0NPTVBMRVRJT05fTElNSVQsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyBpdGVtczogYnJhbmNoQ29tcGxldGlvbnMubWFwKGJyYW5jaCA9PiAoeyB2YWx1ZTogYnJhbmNoLCBsYWJlbDogYnJhbmNoIH0pKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBlZmZlY3RpdmUgd29ya2luZyBkaXJlY3RvcnkgZm9yIGEgc2Vzc2lvbiB0aGF0IGlzIGFib3V0IHRvXG5cdCAqIGJlIG1hdGVyaWFsaXplZC4gV2hlbiB0aGUgc2Vzc2lvbiBjb25maWcgc2VsZWN0cyBgd29ya3RyZWVgIGlzb2xhdGlvbiBvblxuXHQgKiBhIGdpdCByZXBvc2l0b3J5LCBjcmVhdGVzIGEgZnJlc2ggYnJhbmNoICsgd29ya3RyZWUsIHJlY29yZHMgaXQgZm9yXG5cdCAqIGNsZWFudXAsIHF1ZXVlcyB0aGUgZmlyc3QtdHVybiBhbm5vdW5jZW1lbnQsIHBlcnNpc3RzIHRoZSB3b3JrdHJlZVxuXHQgKiBtZXRhZGF0YSwgYW5kIHJldHVybnMgdGhlIHdvcmt0cmVlIFVSSS4gT3RoZXJ3aXNlIHJldHVybnMgdGhlIHJlcXVlc3RlZFxuXHQgKiB3b3JraW5nIGRpcmVjdG9yeSB1bmNoYW5nZWQuXG5cdCAqL1xuXHRhc3luYyByZXNvbHZlV29ya2luZ0RpcmVjdG9yeShyZXF1ZXN0OiBJUmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlSZXF1ZXN0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IGNvbmZpZywgd29ya2luZ0RpcmVjdG9yeSwgc2Vzc2lvbklkLCBzZXNzaW9uVXJpLCBwcm9tcHQsIGdpdGh1YlRva2VuLCBvblByb2dyZXNzIH0gPSByZXF1ZXN0O1xuXHRcdGlmIChjb25maWc/LltTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0gIT09ICd3b3JrdHJlZScgfHwgIXdvcmtpbmdEaXJlY3RvcnkgfHwgdHlwZW9mIGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHR9XG5cblx0XHQvLyBJZGVtcG90ZW50OiBpZiBhIHdvcmt0cmVlIHdhcyBhbHJlYWR5IGNyZWF0ZWQgZm9yIHRoaXMgc2Vzc2lvbiBpbiB0aGlzXG5cdFx0Ly8gcHJvY2VzcyAoZS5nLiB0aGUgY2FsbGVyIHJlLWVudGVycyBtYXRlcmlhbGl6YXRpb24gYWZ0ZXIgYSB0aHJlYWRcblx0XHQvLyByZXN0YXJ0IG9yIGEgcG9zdC1jcmVhdGlvbiBmYWlsdXJlKSByZXVzZSBpdCByYXRoZXIgdGhhbiBjcmVhdGluZyBhXG5cdFx0Ly8gc2Vjb25kIGJyYW5jaCArIHdvcmt0cmVlLlxuXHRcdGNvbnN0IGFscmVhZHkgPSB0aGlzLl9jcmVhdGVkV29ya3RyZWVzLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChhbHJlYWR5KSB7XG5cdFx0XHRyZXR1cm4gYWxyZWFkeS53b3JrdHJlZTtcblx0XHR9XG5cblx0XHRvblByb2dyZXNzPy4oYnVpbGRXb3JrdHJlZVByb2dyZXNzVGV4dChXb3JrdHJlZUNyZWF0aW9uUGhhc2UuU3RhcnRpbmcpKTtcblxuXHRcdGNvbnN0IGNoZWNrb3V0Um9vdCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFjaGVja291dFJvb3QpIHtcblx0XHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QoY2hlY2tvdXRSb290LCBjaGVja291dFJvb3QpO1xuXHRcdGNvbnN0IHdvcmt0cmVlc1Jvb3QgPSBnZXRXb3JrdHJlZXNSb290KHJlcG9zaXRvcnlSb290KTtcblx0XHQvLyBQcmVmaXggKGUuZy4gdGhlIHVzZXIncyBgZ2l0LmJyYW5jaFByZWZpeGApIHRoZSBjbGllbnQgZm9yd2FyZHMgZm9yXG5cdFx0Ly8gd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbnMuIFByZXBlbmRlZCBhaGVhZCBvZiB0aGUgYnVpbHQtaW4gYGFnZW50cy9gXG5cdFx0Ly8gcHJlZml4IHdoZW4gbmFtaW5nIHRoZSBicmFuY2ggYW5kIHN0cmlwcGVkIGZyb20gdGhlIHdvcmt0cmVlIGRpciBuYW1lLlxuXHRcdGNvbnN0IHdvcmt0cmVlQnJhbmNoUHJlZml4ID0gdHlwZW9mIGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4XSA9PT0gJ3N0cmluZydcblx0XHRcdD8gY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXhdIGFzIHN0cmluZ1xuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRCcmFuY2ggPSBjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdIGFzIHN0cmluZztcblx0XHRjb25zdCB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlLCBiYXNlQnJhbmNoIH0gPSBhd2FpdCB0aGlzLl93b3JrdHJlZUNyZWF0aW9uU2VxdWVuY2VyLnF1ZXVlKHJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCksIGFzeW5jICgpID0+IHtcblx0XHRcdG9uUHJvZ3Jlc3M/LihidWlsZFdvcmt0cmVlUHJvZ3Jlc3NUZXh0KFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5OYW1pbmdCcmFuY2gpKTtcblx0XHRcdGNvbnN0IGJyYW5jaE5hbWUgPSBhd2FpdCB0aGlzLl9icmFuY2hOYW1lR2VuZXJhdG9yLmdlbmVyYXRlQnJhbmNoTmFtZSh7XG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0bWVzc2FnZTogcHJvbXB0LFxuXHRcdFx0XHRnaXRodWJUb2tlbixcblx0XHRcdFx0YnJhbmNoUHJlZml4OiB3b3JrdHJlZUJyYW5jaFByZWZpeCxcblx0XHRcdFx0YnJhbmNoTmFtZUNvbGxpZGVzOiBhc3luYyBjYW5kaWRhdGUgPT4ge1xuXHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmJyYW5jaEV4aXN0cyhyZXBvc2l0b3J5Um9vdCwgY2FuZGlkYXRlKS5jYXRjaCgoKSA9PiB0cnVlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZVdvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShjYW5kaWRhdGUsIHdvcmt0cmVlQnJhbmNoUHJlZml4KSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZpbGVFeGlzdHMoY2FuZGlkYXRlV29ya3RyZWUuZnNQYXRoKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgd29ya3RyZWUgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgZ2V0V29ya3RyZWVOYW1lKGJyYW5jaE5hbWUsIHdvcmt0cmVlQnJhbmNoUHJlZml4KSk7XG5cdFx0XHRjb25zdCBiYXNlQnJhbmNoID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJyYW5jaFN0YXJ0UG9pbnQocmVwb3NpdG9yeVJvb3QsIHNlbGVjdGVkQnJhbmNoKTtcblx0XHRcdGF3YWl0IGZzLm1rZGlyKHdvcmt0cmVlc1Jvb3QuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdFx0Ly8gR2l0IHN1cHByZXNzZXMgcHJvZ3Jlc3MgZm9yIHRoZSBmaXJzdCBjb3VwbGUgb2Ygc2Vjb25kcywgc28gbmFtZVxuXHRcdFx0Ly8gdGhlIHBoYXNlIHVwIGZyb250IHJhdGhlciB0aGFuIGxlYXZpbmcgdGhlIGxhYmVsIHN0YWxlIHVudGlsIHRoZVxuXHRcdFx0Ly8gZmlyc3QgcGVyY2VudGFnZSBhcnJpdmVzLlxuXHRcdFx0b25Qcm9ncmVzcz8uKGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQoV29ya3RyZWVDcmVhdGlvblBoYXNlLkNoZWNraW5nT3V0KSk7XG5cblx0XHRcdGNvbnN0IHdvcmt0cmVlQnJhbmNoVHJhY2sgPSBjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXSA9PT0gdHJ1ZTtcblx0XHRcdGF3YWl0IHdpdGhQZXJjZW50UHJvZ3Jlc3MoV29ya3RyZWVDcmVhdGlvblBoYXNlLkNoZWNraW5nT3V0LCBvblByb2dyZXNzLCBwcm9ncmVzcyA9PlxuXHRcdFx0XHR0aGlzLl9naXRTZXJ2aWNlLmFkZFdvcmt0cmVlKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgYnJhbmNoTmFtZSwgYmFzZUJyYW5jaCwgd29ya3RyZWVCcmFuY2hUcmFjaywgcHJvZ3Jlc3MpKTtcblx0XHRcdHJldHVybiB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlLCBiYXNlQnJhbmNoIH07XG5cdFx0fSk7XG5cdFx0Y29uc3Qgd29ya3RyZWVJbmNsdWRlRmlsZXMgPSBBcnJheS5pc0FycmF5KGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXSlcblx0XHRcdCYmIGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXS5ldmVyeShwYXR0ZXJuID0+IHR5cGVvZiBwYXR0ZXJuID09PSAnc3RyaW5nJylcblx0XHRcdD8gY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdIGFzIHJlYWRvbmx5IHN0cmluZ1tdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAod29ya3RyZWVJbmNsdWRlRmlsZXM/Lmxlbmd0aCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0b25Qcm9ncmVzcz8uKGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQoV29ya3RyZWVDcmVhdGlvblBoYXNlLkNvcHlpbmdJbmNsdWRlRmlsZXMpKTtcblx0XHRcdFx0YXdhaXQgd2l0aFBlcmNlbnRQcm9ncmVzcyhXb3JrdHJlZUNyZWF0aW9uUGhhc2UuQ29weWluZ0luY2x1ZGVGaWxlcywgb25Qcm9ncmVzcywgcHJvZ3Jlc3MgPT5cblx0XHRcdFx0XHR0aGlzLl9naXRTZXJ2aWNlLmNvcHlXb3JrdHJlZUluY2x1ZGVGaWxlcyhjaGVja291dFJvb3QsIHdvcmt0cmVlLCB3b3JrdHJlZUluY2x1ZGVGaWxlcywgcHJvZ3Jlc3MpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGNvcHkgd29ya3RyZWUgaW5jbHVkZSBmaWxlczogJHtlcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jcmVhdGVkV29ya3RyZWVzLnNldChzZXNzaW9uSWQsIHsgcmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlIH0pO1xuXHRcdC8vIFF1ZXVlIHRoZSB3b3JrdHJlZSBhbm5vdW5jZW1lbnQgc28gdGhlIGZpcnN0IHR1cm4gKGxpdmUpIGFuZCBhbnlcblx0XHQvLyBzdWJzZXF1ZW50IHJlc3RvcmUgKGhpc3RvcnkpIGJvdGggc3VyZmFjZSB0aGUgbWVzc2FnZSBpbiB0aGUgY2hhdC5cblx0XHR0aGlzLl9wZW5kaW5nRmlyc3RUdXJuQW5ub3VuY2VtZW50cy5zZXQoc2Vzc2lvbklkLCBidWlsZFdvcmt0cmVlQW5ub3VuY2VtZW50VGV4dChicmFuY2hOYW1lKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpLCB7IGJyYW5jaE5hbWUsIGJhc2VCcmFuY2gsIHdvcmt0cmVlUGF0aDogd29ya3RyZWUsIHJlcG9zaXRvcnlSb290IH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBwZXJzaXN0IHdvcmt0cmVlIGJyYW5jaCBtZXRhZGF0YTogJHtlcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya3RyZWU7XG5cdH1cblxuXHQvKiogUmVzb2x2ZXMgYSBwZXJzaXN0ZWQgd29ya2luZyBkaXJlY3RvcnksIHJlcGFpcmluZyBhIHJlbW92ZWQgd29ya3RyZWUgd2hlbiBwb3NzaWJsZS4gKi9cblx0YXN5bmMgcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaTogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgKCkgPT4gdGhpcy5fcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdGlmICh3b3JraW5nRGlyZWN0b3J5LnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzLmFjY2Vzcyh3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCk7XG5cdFx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFJlcGFpciBvciBmYWxsIGJhY2sgYmVsb3cuXG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IHRoaXMuX3JlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYXJjaGl2ZWQgPSBhd2FpdCB0aGlzLl9pc1Nlc3Npb25BcmNoaXZlZChzZXNzaW9uVXJpKTtcblx0XHRpZiAoYXJjaGl2ZWQpIHtcblx0XHRcdGlmIChtZXRhPy5yZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGZzLmFjY2VzcyhtZXRhLnJlcG9zaXRvcnlSb290LmZzUGF0aCk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBBcmNoaXZlZCBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5ICcke3dvcmtpbmdEaXJlY3RvcnkuZnNQYXRofScgaXMgbWlzc2luZzsgcmVzdW1pbmcgYWdhaW5zdCByZXBvc2l0b3J5IHJvb3QgJyR7bWV0YS5yZXBvc2l0b3J5Um9vdC5mc1BhdGh9JyBmb3IgaGlzdG9yeWApO1xuXHRcdFx0XHRcdHJldHVybiBtZXRhLnJlcG9zaXRvcnlSb290O1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBGYWxsIHRocm91Z2ggd2hlbiB0aGUgcmVwb3NpdG9yeSByb290IGlzIGFsc28gZ29uZS5cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBDYW5ub3QgcmVzdW1lIGFyY2hpdmVkIHNlc3Npb246IHdvcmtpbmcgZGlyZWN0b3J5ICcke3dvcmtpbmdEaXJlY3RvcnkuZnNQYXRofScgaXMgbWlzc2luZyBhbmQgbm8gdXNhYmxlIHJlcG9zaXRvcnktcm9vdCBmYWxsYmFjayB3YXMgZm91bmRgKTtcblx0XHRcdHRocm93IG5ldyBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvcih3b3JraW5nRGlyZWN0b3J5KTtcblx0XHR9XG5cblx0XHRsZXQgcmVjcmVhdGVGYWlsdXJlUmVhc29uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1ldGE/Lndvcmt0cmVlUGF0aCAmJiBtZXRhLnJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRjb25zdCB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlUGF0aCwgcmVwb3NpdG9yeVJvb3QgfSA9IG1ldGE7XG5cdFx0XHRjb25zdCByZWNyZWF0ZWQgPSBhd2FpdCB0aGlzLl9yZWNyZWF0ZVdvcmt0cmVlKHNlc3Npb25JZCwgeyBicmFuY2hOYW1lLCB3b3JrdHJlZVBhdGgsIHJlcG9zaXRvcnlSb290IH0pO1xuXHRcdFx0aWYgKHJlY3JlYXRlZC5vaykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIFJlY3JlYXRlZCBtaXNzaW5nIHdvcmt0cmVlICcke3dvcmt0cmVlUGF0aC5mc1BhdGh9JyBmb3IgYSBsaXZlIHNlc3Npb24gb24gcmVzdW1lYCk7XG5cdFx0XHRcdHJldHVybiB3b3JrdHJlZVBhdGg7XG5cdFx0XHR9XG5cdFx0XHRyZWNyZWF0ZUZhaWx1cmVSZWFzb24gPSByZWNyZWF0ZWQucmVhc29uO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gQ2Fubm90IHJlc3VtZTogd29ya2luZyBkaXJlY3RvcnkgJyR7d29ya2luZ0RpcmVjdG9yeS5mc1BhdGh9JyBpcyBtaXNzaW5nIGFuZCBpdHMgd29ya3RyZWUgY291bGQgbm90IGJlIHJlY3JlYXRlZCR7cmVjcmVhdGVGYWlsdXJlUmVhc29uID8gYDogJHtyZWNyZWF0ZUZhaWx1cmVSZWFzb259YCA6ICcnfWApO1xuXHRcdHRocm93IG5ldyBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvcih3b3JraW5nRGlyZWN0b3J5LCByZWNyZWF0ZUZhaWx1cmVSZWFzb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRha2VzIChhbmQgY2xlYXJzKSB0aGUgcGVuZGluZyBcIndvcmt0cmVlIGNyZWF0ZWRcIiBhbm5vdW5jZW1lbnQgZm9yIGFcblx0ICogc2Vzc2lvbiBzbyBjYWxsZXJzIGNhbiBlbWl0IGl0IGxpdmUgYXMgdGhlIGZpcnN0IHJlc3BvbnNlIHBhcnQgb24gdGhlXG5cdCAqIGZpcnN0IHR1cm4uIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm8gcGVuZGluZ1xuXHQgKiBhbm5vdW5jZW1lbnQuXG5cdCAqL1xuXHR0YWtlUGVuZGluZ0Fubm91bmNlbWVudChzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYW5ub3VuY2VtZW50ID0gdGhpcy5fcGVuZGluZ0ZpcnN0VHVybkFubm91bmNlbWVudHMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGFubm91bmNlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRmlyc3RUdXJuQW5ub3VuY2VtZW50cy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFubm91bmNlbWVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1pbmplY3RzIHRoZSB3b3JrdHJlZSBhbm5vdW5jZW1lbnQgaW50byBhIHJlc3RvcmVkIHRyYW5zY3JpcHQgYnlcblx0ICogcHJlcGVuZGluZyBpdCB0byB0aGUgZmlyc3QgdHVybi4gTm8tb3Agd2hlbiB0aGUgc2Vzc2lvbiB3YXMgbm90IHdvcmt0cmVlXG5cdCAqIGlzb2xhdGVkLiBDYWxsZXJzIGZvcndhcmQgdGhlIHR1cm5zIHJldHVybmVkIGZyb20gdGhlaXIgaGlzdG9yeS1yZWFkIHBhdGguXG5cdCAqXG5cdCAqIFRoZSBsaXZlIHBhdGggKHtAbGluayB0YWtlUGVuZGluZ0Fubm91bmNlbWVudH0pIGhhbmRsZXMgdGhlIHZlcnkgZmlyc3Rcblx0ICogdHVybiB3aGlsZSB0aGUgc2Vzc2lvbiBpcyBmcmVzaDsgdGhpcyBwYXRoIHRha2VzIG92ZXIgb24gc3Vic2VxdWVudCBsb2Fkc1xuXHQgKiAod2hlcmUgdGhlIHN5bnRoZXRpYyBhbm5vdW5jZW1lbnQgaXMgbm90IHBhcnQgb2YgdGhlIGFnZW50IHRyYW5zY3JpcHQpLlxuXHQgKi9cblx0YXN5bmMgYXBwbHlSZXN0b3JlQW5ub3VuY2VtZW50KHNlc3Npb25Vcmk6IFVSSSwgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVNZXRhID0gYXdhaXQgdGhpcy5fcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRpZiAoIXdvcmt0cmVlTWV0YT8uYnJhbmNoTmFtZSkge1xuXHRcdFx0cmV0dXJuIHR1cm5zO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJlcGVuZEFubm91bmNlbWVudFRvRmlyc3RUdXJuKHR1cm5zLCBidWlsZFdvcmt0cmVlQW5ub3VuY2VtZW50VGV4dCh3b3JrdHJlZU1ldGEuYnJhbmNoTmFtZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgdGhlIHdvcmt0cmVlIGNyZWF0ZWQgZm9yIGEgc2Vzc2lvbiBpbiB0aGUgY3VycmVudCBwcm9jZXNzIChpZlxuXHQgKiBhbnkpLiBVc2VkIG9uIHNlc3Npb24gZGlzcG9zZSBhbmQgb24gbWF0ZXJpYWxpemF0aW9uIGZhaWx1cmUuXG5cdCAqL1xuXHRhc3luYyByZW1vdmVDcmVhdGVkV29ya3RyZWUoc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgKCkgPT4gdGhpcy5fcmVtb3ZlQ3JlYXRlZFdvcmt0cmVlKHNlc3Npb25JZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVtb3ZlQ3JlYXRlZFdvcmt0cmVlKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jbGVhclBlbmRpbmcoc2Vzc2lvbklkKTtcblx0XHRjb25zdCB3b3JrdHJlZSA9IHRoaXMuX2NyZWF0ZWRXb3JrdHJlZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCF3b3JrdHJlZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS5yZW1vdmVXb3JrdHJlZSh3b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUud29ya3RyZWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byByZW1vdmUgd29ya3RyZWUgJyR7d29ya3RyZWUud29ya3RyZWUuZnNQYXRofSc6ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fY3JlYXRlZFdvcmt0cmVlcy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBldmVyeSB3b3JrdHJlZSBjcmVhdGVkIGJ5IHRoaXMgYWdlbnQgaW4gdGhlIGN1cnJlbnQgcHJvY2Vzcy5cblx0ICogQ2FsbGVkIGZyb20gdGhlIGFnZW50J3MgYHNodXRkb3duYCBzbyBubyBpc29sYXRlZCB3b3JrdHJlZSBpcyBsZWFrZWQgd2hlblxuXHQgKiB0aGUgcHJvdmlkZXIgaXMgdG9ybiBkb3duLCBtYXRjaGluZyBDb3BpbG90J3Mgc2h1dGRvd24gZHJhaW4uXG5cdCAqL1xuXHRhc3luYyByZW1vdmVBbGxDcmVhdGVkV29ya3RyZWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMuY3JlYXRlZFdvcmt0cmVlU2Vzc2lvbklkcy5tYXAoc2Vzc2lvbklkID0+IHRoaXMucmVtb3ZlQ3JlYXRlZFdvcmt0cmVlKHNlc3Npb25JZCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbiBhcmNoaXZlLCByZW1vdmVzIHRoZSB3b3JrdHJlZSBkaXJlY3Rvcnkgd2hlbiBpdHMgYnJhbmNoIGlzIHByZXNlcnZlZFxuXHQgKiBhbmQgdGhlIHdvcmtpbmcgdHJlZSBpcyBjbGVhbiwgc28gdGhlIHdvcmt0cmVlIGNhbiBiZSByZWNyZWF0ZWQgb25cblx0ICogdW5hcmNoaXZlIHdpdGhvdXQgbG9zaW5nIHdvcmsuIFNraXBzIHRoZSByZW1vdmFsIHdoZW4gdGhlIGJyYW5jaCBpc1xuXHQgKiBtaXNzaW5nIG9yIHRoZSB0cmVlIGlzIGRpcnR5LlxuXHQgKi9cblx0YXN5bmMgY2xlYW51cFdvcmt0cmVlT25BcmNoaXZlKHNlc3Npb25Vcmk6IFVSSSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgKCkgPT4gdGhpcy5fY2xlYW51cFdvcmt0cmVlT25BcmNoaXZlKHNlc3Npb25VcmksIHNlc3Npb25JZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2xlYW51cFdvcmt0cmVlT25BcmNoaXZlKHNlc3Npb25Vcmk6IFVSSSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZXRhID0gYXdhaXQgdGhpcy5fcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRpZiAoIW1ldGE/Lndvcmt0cmVlUGF0aCB8fCAhbWV0YS5yZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlUGF0aCwgcmVwb3NpdG9yeVJvb3QgfSA9IG1ldGE7XG5cblx0XHQvLyBTa2lwIGlmIHRoZSB3b3JrdHJlZSBkaXJlY3RvcnkgaXMgYWxyZWFkeSBnb25lIFx1MjAxNCBub3RoaW5nIHRvIGNsZWFuLlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5hY2Nlc3Mod29ya3RyZWVQYXRoLmZzUGF0aCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9jcmVhdGVkV29ya3RyZWVzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgaWYgdGhlIGJyYW5jaCBpcyBtaXNzaW5nIFx1MjAxNCB3aXRob3V0IGl0IHdlIGNhbid0IHNhZmVseSByZWNyZWF0ZVxuXHRcdC8vIHRoZSB3b3JrdHJlZSBvbiB1bmFyY2hpdmUsIHNvIGxlYXZlIHRoZSB3b3JraW5nIHRyZWUgaW50YWN0LlxuXHRcdGNvbnN0IGJyYW5jaFByZXNlbnQgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmJyYW5jaEV4aXN0cyhyZXBvc2l0b3J5Um9vdCwgYnJhbmNoTmFtZSkuY2F0Y2goKCkgPT4gZmFsc2UpO1xuXHRcdGlmICghYnJhbmNoUHJlc2VudCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBTa2lwcGluZyB3b3JrdHJlZSBjbGVhbnVwOiBicmFuY2ggJyR7YnJhbmNoTmFtZX0nIGlzIG1pc3NpbmdgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb21taXQgYW55IHVuY29tbWl0dGVkIGNoYW5nZXMgYmVmb3JlIGFyY2hpdmluZyB0aGUgc2Vzc2lvblxuXHRcdGNvbnN0IGhhc1VuY29tbWl0dGVkQ2hhbmdlcyA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuaGFzVW5jb21taXR0ZWRDaGFuZ2VzKHdvcmt0cmVlUGF0aCkuY2F0Y2goKCkgPT4gdHJ1ZSk7XG5cdFx0aWYgKGhhc1VuY29tbWl0dGVkQ2hhbmdlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21taXRBbGwod29ya3RyZWVQYXRoLCBsb2NhbGl6ZSgnd29ya3RyZWVJc29sYXRpb24uY29tbWl0TWVzc2FnZScsICdTYXZpbmcgdW5jb21taXR0ZWQgY2hhbmdlcyBiZWZvcmUgYXJjaGl2aW5nIHNlc3Npb24nKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBjb21taXQgdW5jb21taXR0ZWQgY2hhbmdlcyBpbiAnJHt3b3JrdHJlZVBhdGguZnNQYXRofSc6ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnJlbW92ZVdvcmt0cmVlKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZVBhdGgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBSZW1vdmVkIHdvcmt0cmVlICcke3dvcmt0cmVlUGF0aC5mc1BhdGh9JyBvbiBhcmNoaXZlYCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlbW92ZSB3b3JrdHJlZSAnJHt3b3JrdHJlZVBhdGguZnNQYXRofScgb24gYXJjaGl2ZTogJHtlcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVkV29ya3RyZWVzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPbiB1bmFyY2hpdmUsIHJlY3JlYXRlcyBhIHByZXZpb3VzbHkgY2xlYW5lZC11cCB3b3JrdHJlZSBhZ2FpbnN0IGl0c1xuXHQgKiBwcmVzZXJ2ZWQgYnJhbmNoLiBOby1vcCB3aGVuIHRoZSBkaXJlY3Rvcnkgc3RpbGwgZXhpc3RzIG9yIHRoZSBicmFuY2ggaXNcblx0ICogbWlzc2luZy5cblx0ICovXG5cdGFzeW5jIHJlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsICgpID0+IHRoaXMuX3JlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IHRoaXMuX3JlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFtZXRhPy53b3JrdHJlZVBhdGggfHwgIW1ldGEucmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU2tpcCBpZiB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IGFscmVhZHkgZXhpc3RzIFx1MjAxNCBub3RoaW5nIHRvIGRvLlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5hY2Nlc3MobWV0YS53b3JrdHJlZVBhdGguZnNQYXRoKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGV4cGVjdGVkIHdoZW4gdGhlIHdvcmt0cmVlIHdhcyBjbGVhbmVkIHVwIG9uIGFyY2hpdmVcblx0XHR9XG5cblx0XHRjb25zdCB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlUGF0aCwgcmVwb3NpdG9yeVJvb3QgfSA9IG1ldGE7XG5cdFx0YXdhaXQgdGhpcy5fcmVjcmVhdGVXb3JrdHJlZShzZXNzaW9uSWQsIHsgYnJhbmNoTmFtZSwgd29ya3RyZWVQYXRoLCByZXBvc2l0b3J5Um9vdCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY3JlYXRlV29ya3RyZWUoc2Vzc2lvbklkOiBzdHJpbmcsIG1ldGE6IHsgcmVhZG9ubHkgYnJhbmNoTmFtZTogc3RyaW5nOyByZWFkb25seSB3b3JrdHJlZVBhdGg6IFVSSTsgcmVhZG9ubHkgcmVwb3NpdG9yeVJvb3Q6IFVSSSB9KTogUHJvbWlzZTx7IHJlYWRvbmx5IG9rOiB0cnVlIH0gfCB7IHJlYWRvbmx5IG9rOiBmYWxzZTsgcmVhZG9ubHkgcmVhc29uOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHsgYnJhbmNoTmFtZSwgd29ya3RyZWVQYXRoLCByZXBvc2l0b3J5Um9vdCB9ID0gbWV0YTtcblx0XHRjb25zdCBicmFuY2hQcmVzZW50ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5icmFuY2hFeGlzdHMocmVwb3NpdG9yeVJvb3QsIGJyYW5jaE5hbWUpLmNhdGNoKCgpID0+IGZhbHNlKTtcblx0XHRpZiAoIWJyYW5jaFByZXNlbnQpIHtcblx0XHRcdGNvbnN0IHJlYXNvbiA9IGxvY2FsaXplKCd3b3JrdHJlZVJlY3JlYXRlQnJhbmNoTWlzc2luZycsIFwidGhlIGJyYW5jaCAnezB9JyBubyBsb25nZXIgZXhpc3RzXCIsIGJyYW5jaE5hbWUpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBDYW5ub3QgcmVjcmVhdGUgd29ya3RyZWU6IGJyYW5jaCAnJHticmFuY2hOYW1lfScgaXMgbWlzc2luZ2ApO1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb24gfTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzLm1rZGlyKFVSSS5qb2luUGF0aCh3b3JrdHJlZVBhdGgsICcuLicpLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmFkZEV4aXN0aW5nV29ya3RyZWUocmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlUGF0aCwgYnJhbmNoTmFtZSk7XG5cdFx0XHR0aGlzLl9jcmVhdGVkV29ya3RyZWVzLnNldChzZXNzaW9uSWQsIHsgcmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlOiB3b3JrdHJlZVBhdGggfSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIFJlY3JlYXRlZCB3b3JrdHJlZSAnJHt3b3JrdHJlZVBhdGguZnNQYXRofSdgKTtcblx0XHRcdHJldHVybiB7IG9rOiB0cnVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHJlYXNvbiA9IGVycm9yTWVzc2FnZShlcnJvcik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byByZWNyZWF0ZSB3b3JrdHJlZSAnJHt3b3JrdHJlZVBhdGguZnNQYXRofSc6ICR7cmVhc29ufWApO1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb24gfTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVhZHMgdGhlIHBlcnNpc3RlZCB3b3JrdHJlZSBtZXRhZGF0YSBmb3IgYSBzZXNzaW9uLCBpZiBhbnkuICovXG5cdGFzeW5jIHJlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25Vcmk6IFVSSSk6IFByb21pc2U8eyBicmFuY2hOYW1lOiBzdHJpbmc7IHdvcmt0cmVlUGF0aD86IFVSSTsgcmVwb3NpdG9yeVJvb3Q/OiBVUkkgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgcmVwb3NpdG9yeSBcInByb2plY3RcIiBmb3IgYSB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9uIGZyb20gaXRzXG5cdCAqIHBlcnNpc3RlZCB3b3JrdHJlZSBtZXRhZGF0YS4gV29ya3RyZWUgc2Vzc2lvbnMgcnVuIG91dCBvZiBhXG5cdCAqIGA8cmVwbz4ud29ya3RyZWVzLzxuYW1lPmAgZGlyZWN0b3J5LCBidXQgaW4gdGhlIHNlc3Npb25zIFVJIHRoZXkgbXVzdCBncm91cFxuXHQgKiB1bmRlciB0aGUgKnJlcG9zaXRvcnkqIChlLmcuIGB2c2NvZGVgKSBcdTIwMTQgbm90IHRoZSB3b3JrdHJlZSBmb2xkZXIgXHUyMDE0IGV4YWN0bHlcblx0ICogbGlrZSBDb3BpbG90LiBSZXR1cm5zIHRoZSByZXBvc2l0b3J5IHJvb3QgYXMgdGhlIHByb2plY3Qgc28gYWdlbnRzIGNhbiBtZXJnZVxuXHQgKiBpdCBpbnRvIHRoZSBgcHJvamVjdGAgZmllbGQgb2YgdGhlIGBJQWdlbnRTZXNzaW9uTWV0YWRhdGFgIHJlcG9ydGVkIGZyb21cblx0ICogYGxpc3RTZXNzaW9uc2AgLyBgZ2V0U2Vzc2lvbk1ldGFkYXRhYDsgd2l0aG91dCBpdCBhIGxpc3QgcmVmcmVzaCBjbGVhcnMgdGhlXG5cdCAqIHRyYW5zaWVudCBwcm9qZWN0IHNldCBieSB0aGUgbWF0ZXJpYWxpemUgZXZlbnQgYW5kIHRoZSB3b3Jrc3BhY2UgcmV2ZXJ0cyB0b1xuXHQgKiB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IG5hbWUuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIHNlc3Npb25zIHRoYXQgd2VyZSBuZXZlclxuXHQgKiB3b3JrdHJlZS1pc29sYXRlZCwgbGVhdmluZyB0aGUgY2FsbGVyJ3Mgb3duIGZvbGRlci1iYXNlZCBwcm9qZWN0IHVudG91Y2hlZC5cblx0ICovXG5cdGFzeW5jIHJlc29sdmVXb3JrdHJlZVByb2plY3Qoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtZXRhID0gYXdhaXQgdGhpcy5fcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gbWV0YT8ucmVwb3NpdG9yeVJvb3QgPyBwcm9qZWN0RnJvbVJlcG9zaXRvcnlSb290KG1ldGEucmVwb3NpdG9yeVJvb3QpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QoY2hlY2tvdXRSb290OiBVUkksIGZhbGxiYWNrUm9vdDogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRyeVJlc29sdmVQcmltYXJ5V29ya3RyZWVSb290KHRoaXMuX2dpdFNlcnZpY2UsIGNoZWNrb3V0Um9vdCkgPz8gZmFsbGJhY2tSb290O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfV0gRmFpbGVkIHRvIHJlc29sdmUgcHJpbWFyeSB3b3JrdHJlZSBmb3IgJyR7Y2hlY2tvdXRSb290LmZzUGF0aH0nOiAke2Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2tSb290O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jaHJvbm91cyBjb21wYW5pb24gdG8ge0BsaW5rIHJlc29sdmVXb3JrdHJlZVByb2plY3R9IGZvciB0aGVcblx0ICogbWF0ZXJpYWxpemUtZXZlbnQgcGF0aDogdGhlIHJlcG9zaXRvcnkgcHJvamVjdCBmb3IgYSB3b3JrdHJlZSB0aGlzIGFnZW50XG5cdCAqIGNyZWF0ZWQgaW4gdGhlIGN1cnJlbnQgcHJvY2Vzcywgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm9uZS5cblx0ICogTGV0cyBhbiBhZ2VudCBzdXBwbHkgdGhlIG1hdGVyaWFsaXplIGV2ZW50J3MgYHByb2plY3RgIHdpdGhvdXQgYW4gYXN5bmNcblx0ICogbWV0YWRhdGEgcmVhZCBzbyBhIGZyZXNoIHdvcmt0cmVlIGdyb3VwcyB1bmRlciB0aGUgcmVwb3NpdG9yeSB0aGUgbW9tZW50IGl0XG5cdCAqIG1hdGVyaWFsaXplcy5cblx0ICovXG5cdGNyZWF0ZWRXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbklkOiBzdHJpbmcpOiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdvcmt0cmVlID0gdGhpcy5fY3JlYXRlZFdvcmt0cmVlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gd29ya3RyZWUgPyBwcm9qZWN0RnJvbVJlcG9zaXRvcnlSb290KHdvcmt0cmVlLnJlcG9zaXRvcnlSb290KSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEdpdEluZm8od29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTx7IGN1cnJlbnRCcmFuY2g6IHN0cmluZzsgZGVmYXVsdEJyYW5jaDogSURlZmF1bHRCcmFuY2ggfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgd29ya3RyZWUgaXNvbGF0aW9uIGZvciBhIHJlcG8gd2l0aCBubyBjb21taXRzIHlldCAodW5ib3JuIEhFQUQpOyBgZ2l0IHdvcmt0cmVlIGFkZGAgd291bGQgZmFpbC5cblx0XHRjb25zdCBoZWFkQ29tbWl0ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5yZXZQYXJzZShyZXBvc2l0b3J5Um9vdCwgJ0hFQUQnKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGlmICghaGVhZENvbW1pdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50QnJhbmNoID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRDdXJyZW50QnJhbmNoKHJlcG9zaXRvcnlSb290KSA/PyAnSEVBRCc7XG5cdFx0Y29uc3QgZGVmYXVsdEJyYW5jaCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0RGVmYXVsdEJyYW5jaChyZXBvc2l0b3J5Um9vdCkgPz8geyBuYW1lOiBjdXJyZW50QnJhbmNoLCBzdGFydFBvaW50OiBjdXJyZW50QnJhbmNoIH07XG5cdFx0cmV0dXJuIHsgY3VycmVudEJyYW5jaCwgZGVmYXVsdEJyYW5jaCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUJyYW5jaFN0YXJ0UG9pbnQocmVwb3NpdG9yeVJvb3Q6IFVSSSwgc2VsZWN0ZWRCcmFuY2g6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZGVmYXVsdEJyYW5jaCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0RGVmYXVsdEJyYW5jaChyZXBvc2l0b3J5Um9vdCk7XG5cdFx0cmV0dXJuIGRlZmF1bHRCcmFuY2g/Lm5hbWUgPT09IHNlbGVjdGVkQnJhbmNoXG5cdFx0XHQ/IGRlZmF1bHRCcmFuY2guc3RhcnRQb2ludFxuXHRcdFx0OiBzZWxlY3RlZEJyYW5jaDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dyaXRlV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpOiBVUkksIG1ldGFkYXRhOiB7IGJyYW5jaE5hbWU6IHN0cmluZzsgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkOyB3b3JrdHJlZVBhdGg6IFVSSTsgcmVwb3NpdG9yeVJvb3Q6IFVSSSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGJSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb25VcmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB3b3JrOiBQcm9taXNlPHZvaWQ+W10gPSBbXG5cdFx0XHRcdGRiUmVmLm9iamVjdC5zZXRNZXRhZGF0YShXT1JLVFJFRV9NRVRBX0JSQU5DSCwgbWV0YWRhdGEuYnJhbmNoTmFtZSksXG5cdFx0XHRcdGRiUmVmLm9iamVjdC5zZXRNZXRhZGF0YShXT1JLVFJFRV9NRVRBX1BBVEgsIG1ldGFkYXRhLndvcmt0cmVlUGF0aC50b1N0cmluZygpKSxcblx0XHRcdFx0ZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09ULCBtZXRhZGF0YS5yZXBvc2l0b3J5Um9vdC50b1N0cmluZygpKSxcblx0XHRcdF07XG5cdFx0XHRpZiAobWV0YWRhdGEuYmFzZUJyYW5jaCkge1xuXHRcdFx0XHR3b3JrLnB1c2goZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKE1FVEFfRElGRl9CQVNFX0JSQU5DSCwgbWV0YWRhdGEuYmFzZUJyYW5jaCkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwod29yayk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRiUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgd29ya3RyZWUgbWV0YWRhdGEgYW5kIG1pZ3JhdGVzIHJlcG9zaXRvcnkgcm9vdHMgd3JpdHRlbiBiZWZvcmUgbGlua2VkIGNoZWNrb3V0cyB3ZXJlIGNhbm9uaWNhbGl6ZWQuXG5cdCAqIEl0IHByb2JlcyBhbiBleGlzdGluZyB3b3JrdHJlZSB3aGVuIGF2YWlsYWJsZSBhbmQgb3RoZXJ3aXNlIGZhbGxzIGJhY2sgdG8gdGhlIHBlcnNpc3RlZCByb290IGZvciBhcmNoaXZlZCBzZXNzaW9ucy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25Vcmk6IFVSSSk6IFByb21pc2U8eyBicmFuY2hOYW1lOiBzdHJpbmc7IHdvcmt0cmVlUGF0aD86IFVSSTsgcmVwb3NpdG9yeVJvb3Q/OiBVUkkgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbYnJhbmNoTmFtZSwgd29ya3RyZWVQYXRoUmF3LCByZXBvc2l0b3J5Um9vdFJhd10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9CUkFOQ0gpLFxuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUEFUSCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9SRVBPU0lUT1JZX1JPT1QpLFxuXHRcdFx0XSk7XG5cdFx0XHRpZiAoIWJyYW5jaE5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdvcmt0cmVlUGF0aCA9IHdvcmt0cmVlUGF0aFJhdyA/IFVSSS5wYXJzZSh3b3JrdHJlZVBhdGhSYXcpIDogdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHJlcG9zaXRvcnlSb290ID0gcmVwb3NpdG9yeVJvb3RSYXcgPyBVUkkucGFyc2UocmVwb3NpdG9yeVJvb3RSYXcpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRcdGNvbnN0IGNoZWNrb3V0Um9vdCA9IHdvcmt0cmVlUGF0aCAmJiBhd2FpdCBmaWxlRXhpc3RzKHdvcmt0cmVlUGF0aC5mc1BhdGgpID8gd29ya3RyZWVQYXRoIDogcmVwb3NpdG9yeVJvb3Q7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlSb290ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QoY2hlY2tvdXRSb290LCByZXBvc2l0b3J5Um9vdCk7XG5cdFx0XHRcdGlmIChwcmltYXJ5Um9vdC50b1N0cmluZygpICE9PSByZXBvc2l0b3J5Um9vdC50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0cmVwb3NpdG9yeVJvb3QgPSBwcmltYXJ5Um9vdDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgcmVmLm9iamVjdC5zZXRNZXRhZGF0YShXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVCwgcHJpbWFyeVJvb3QudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9XSBGYWlsZWQgdG8gbm9ybWFsaXplIHdvcmt0cmVlIHJlcG9zaXRvcnkgbWV0YWRhdGEgZm9yICcke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0nOiAke2Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBicmFuY2hOYW1lLCB3b3JrdHJlZVBhdGgsIHJlcG9zaXRvcnlSb290IH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNTZXNzaW9uQXJjaGl2ZWQoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW2lzQXJjaGl2ZWQsIGlzRG9uZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVkpLFxuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKEFIX01FVEFfSVNfRE9ORV9EQl9LRVkpLFxuXHRcdFx0XSk7XG5cdFx0XHRyZXR1cm4gaXNBcmNoaXZlZCAhPT0gdW5kZWZpbmVkID8gaXNBcmNoaXZlZCA9PT0gJ3RydWUnIDogaXNEb25lID09PSAndHJ1ZSc7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogRGVyaXZlcyB0aGUgcmVwb3NpdG9yeSB7QGxpbmsgSUFnZW50U2Vzc2lvblByb2plY3RJbmZvfSBmcm9tIGEgcmVwb3NpdG9yeVxuICogcm9vdCBVUkkuIFRoZSBkaXNwbGF5IG5hbWUgaXMgdGhlIHJlcG8gZGlyZWN0b3J5J3MgYmFzZW5hbWUgKGZhbGxpbmcgYmFjayB0b1xuICogdGhlIFVSSSBzdHJpbmcgZm9yIHBhdGhvbG9naWNhbCByb290cyksIG1hdGNoaW5nIGhvdyBDb3BpbG90IG5hbWVzIHRoZVxuICogcHJvamVjdCB2aWEgYHJlc29sdmVHaXRQcm9qZWN0YC5cbiAqL1xuZnVuY3Rpb24gcHJvamVjdEZyb21SZXBvc2l0b3J5Um9vdChyZXBvc2l0b3J5Um9vdDogVVJJKTogSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHtcblx0cmV0dXJuIHsgdXJpOiByZXBvc2l0b3J5Um9vdCwgZGlzcGxheU5hbWU6IGJhc2VuYW1lKHJlcG9zaXRvcnlSb290LmZzUGF0aCkgfHwgcmVwb3NpdG9yeVJvb3QudG9TdHJpbmcoKSB9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgcmVwb3NpdG9yeSB7QGxpbmsgSUFnZW50U2Vzc2lvblByb2plY3RJbmZvfSBmcm9tIGEgcGVyc2lzdGVkXG4gKiB7QGxpbmsgV09SS1RSRUVfTUVUQV9SRVBPU0lUT1JZX1JPT1R9IHZhbHVlIChhIFVSSSBzdHJpbmcpLCBvciBgdW5kZWZpbmVkYFxuICogd2hlbiBhYnNlbnQuIExldHMgdGhlIGhvc3QgbWVyZ2UgdGhlIHJlcG9zaXRvcnkgcHJvamVjdCBpbnRvIGEgc2Vzc2lvbidzXG4gKiBjYXRhbG9nIGVudHJ5IGRpcmVjdGx5IGZyb20gYSBtZXRhZGF0YSBiYXRjaCBpdCBhbHJlYWR5IHJlYWQsIHdpdGhvdXQgYVxuICogc2Vjb25kIGRhdGFiYXNlIG9wZW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3b3JrdHJlZVByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3QocmVwb3NpdG9yeVJvb3RSYXc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiByZXBvc2l0b3J5Um9vdFJhdyA/IHByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3QoVVJJLnBhcnNlKHJlcG9zaXRvcnlSb290UmF3KSkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGVycm9yTWVzc2FnZShlcnJvcjogdW5rbm93bik6IHN0cmluZyB7XG5cdHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbGVFeGlzdHMocGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdHRyeSB7XG5cdFx0YXdhaXQgZnMuYWNjZXNzKHBhdGgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsc0JBQXNCLHNCQUE2RCx1QkFBdUIscUNBQXFDO0FBQ3hKLFNBQTBCLHNC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Z0JBQWdCO0FBQ25CLGNBQU0sZUFBZSxnQkFBZ0IsTUFBTSxXQUFXLGFBQWEsTUFBTSxJQUFJLGVBQWU7QUFDNUYsY0FBTSxjQUFjLE1BQU0sS0FBSyw0QkFBNEIsY0FBYyxjQUFjO0FBQ3ZGLFlBQUksWUFBWSxTQUFTLE1BQU0sZUFBZSxTQUFTLEdBQUc7QUFDekQsMkJBQWlCO0FBQ2pCLGNBQUk7QUFDSCxrQkFBTSxJQUFJLE9BQU8sWUFBWSwrQkFBK0IsWUFBWSxTQUFTLENBQUM7QUFBQSxVQUNuRixTQUFTLE9BQU87QUFDZixpQkFBSyxZQUFZLEtBQUssSUFBSSxLQUFLLFNBQVMsMkRBQTJELFdBQVcsU0FBUyxDQUFDLE1BQU0sYUFBYSxLQUFLLENBQUMsRUFBRTtBQUFBLFVBQ3BKO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEVBQUUsWUFBWSxjQUFjLGVBQWU7QUFBQSxJQUNuRCxVQUFFO0FBQ0QsVUFBSSxRQUFRO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLFlBQW1DO0FBQ25FLFVBQU0sTUFBTSxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixVQUFVO0FBQ3JFLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJO0FBQ0gsWUFBTSxDQUFDLFlBQVksTUFBTSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsUUFDOUMsSUFBSSxPQUFPLFlBQVksMEJBQTBCO0FBQUEsUUFDakQsSUFBSSxPQUFPLFlBQVksc0JBQXNCO0FBQUEsTUFDOUMsQ0FBQztBQUNELGFBQU8sZUFBZSxTQUFZLGVBQWUsU0FBUyxXQUFXO0FBQUEsSUFDdEUsVUFBRTtBQUNELFVBQUksUUFBUTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQ0Q7QUEzcEJhLG9CQUFOO0FBQUEsRUErQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxEVTtBQW1xQmIsU0FBUywwQkFBMEIsZ0JBQStDO0FBQ2pGLFNBQU8sRUFBRSxLQUFLLGdCQUFnQixhQUFhLFNBQVMsZUFBZSxNQUFNLEtBQUssZUFBZSxTQUFTLEVBQUU7QUFDekc7QUFTTyxTQUFTLGtDQUFrQyxtQkFBNkU7QUFDOUgsU0FBTyxvQkFBb0IsMEJBQTBCLElBQUksTUFBTSxpQkFBaUIsQ0FBQyxJQUFJO0FBQ3RGO0FBRUEsU0FBUyxhQUFhLE9BQXdCO0FBQzdDLFNBQU8saUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUM3RDtBQUVBLGVBQWUsV0FBVyxNQUFnQztBQUN6RCxNQUFJO0FBQ0gsVUFBTSxHQUFHLE9BQU8sSUFBSTtBQUNwQixXQUFPO0FBQUEsRUFDUixRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsiV29ya3RyZWVDcmVhdGlvblBoYXNlIiwgImJyYW5jaE5hbWUiLCAid29ya3RyZWUiLCAiYmFzZUJyYW5jaCJdCn0K
