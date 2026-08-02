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
import { disposableTimeout, SequencerByKey } from "../../../base/common/async.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import {
  buildBranchChangesetUri,
  buildCompareTurnsChangesetUri,
  buildSessionChangesetUri,
  buildTurnChangesetUri,
  buildUncommittedChangesetUri,
  parseChangesetUri,
  ChangesetKind,
  buildDefaultChangesetCatalog
} from "../common/changesetUri.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { ActionType } from "../common/state/sessionActions.js";
import {
  ChangesetStatus,
  readSessionGitState,
  isDefaultChatUri,
  SessionLifecycle
} from "../common/state/sessionState.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName } from "../common/agentHostGitService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { NodeWorkerDiffComputeService } from "./diffComputeService.js";
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs } from "./sessionDiffAggregator.js";
import { CHANGESET_DB_METADATA_KEYS, META_CHANGES_SUMMARY, META_CHANGESET_BRANCH, META_CHANGESET_SESSION, META_LEGACY_DIFFS } from "../common/agentHostChangesetService.js";
import { IAgentHostChangesetSubscriptionService } from "../common/agentHostChangesetSubscriptionService.js";
import { IAgentHostChangesetOperationService } from "../common/agentHostChangesetOperationService.js";
import { IAgentHostReviewService } from "../common/agentHostReviewService.js";
import { relativePath } from "../../../base/common/resources.js";
function staticChangesetUri(session, kind) {
  return kind === "branch" ? buildBranchChangesetUri(session) : buildSessionChangesetUri(session);
}
function persistKeyFor(kind) {
  return kind === "branch" ? META_CHANGESET_BRANCH : META_CHANGESET_SESSION;
}
function summariseDiffs(diffs) {
  if (!diffs) {
    return void 0;
  }
  let additions = 0;
  let deletions = 0;
  for (const d of diffs) {
    additions += d.diff?.added ?? 0;
    deletions += d.diff?.removed ?? 0;
  }
  return { additions, deletions, files: diffs.length };
}
function computeChangesSummaryFromLiveState(session) {
  const sessionDiffs = session?.status === ChangesetStatus.Ready ? session.files.map((f) => f.edit) : void 0;
  return summariseDiffs(sessionDiffs);
}
function computeChangesSummaryFromPersistedDiffs(sessionDiffs) {
  return summariseDiffs(sessionDiffs);
}
function tryParsePersistedDiffs(raw, sessionUri, kind, log) {
  if (!raw) {
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    log.warn(`[AgentHostChangesetService] Failed to parse persisted ${kind} diffs for ${sessionUri}: ${toErrorMessage(err)}`);
    return void 0;
  }
}
let AgentHostChangesetService = class extends Disposable {
  constructor(_stateManager, _logService, _sessionDataService, _gitService, _checkpointService, _configurationService, _changesetOperationService, _changesetSubscriptions, _reviewService) {
    super();
    this._stateManager = _stateManager;
    this._logService = _logService;
    this._sessionDataService = _sessionDataService;
    this._gitService = _gitService;
    this._checkpointService = _checkpointService;
    this._configurationService = _configurationService;
    this._changesetOperationService = _changesetOperationService;
    this._changesetSubscriptions = _changesetSubscriptions;
    this._reviewService = _reviewService;
    /** Serializes per-session diff computations to avoid races with stale previousDiffs. */
    this._diffComputationSequencer = new SequencerByKey();
    /** Per-session debounce timers for mid-turn diff computation. */
    this._debouncedDiffTimers = this._register(new DisposableMap());
    /** Per-`(session, turnId)` debounce timers for mid-turn per-turn changeset recomputation. */
    this._perTurnDebouncedDiffTimers = this._register(new DisposableMap());
    this._activeStaticComputes = /* @__PURE__ */ new Set();
    /**
     * Sessions whose static changeset refresh was requested before the
     * working directory was known (provisional / not-yet-materialized
     * sessions). Drained from {@link onWorkingDirectoryAvailable} once the
     * working directory is set, which recomputes every changeset still
     * subscribed for the session.
     *
     * Firing a refresh before the working directory is known would compute
     * against a missing directory and the git path would bail, so we defer
     * instead and re-run once materialization / restore populates it.
     */
    this._pendingMaterialization = /* @__PURE__ */ new Set();
    this._diffComputeService = this._register(new NodeWorkerDiffComputeService(this._logService));
  }
  /**
   * Returns true when at least one client is subscribed to `changeset`
   * under `session`.
   */
  _hasSubscription(session, changeset) {
    return this._changesetSubscriptions.getSessionSubscriptions(session).has(changeset);
  }
  _hasWorkingDirectory(session) {
    return !!this._configurationService.getEffectiveWorkingDirectory(session);
  }
  registerStaticChangesets(session) {
    this._stateManager.registerChangeset(buildBranchChangesetUri(session));
    this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
    this._stateManager.registerChangeset(buildSessionChangesetUri(session));
  }
  restoreStaticChangeset(session, kind, diffs) {
    const changesetUri = this._stateManager.registerChangeset(staticChangesetUri(session, kind));
    this._publishChangesetDiffs(session, changesetUri, diffs);
  }
  parsePersistedStaticChangesets(sessionUri, metadata) {
    const persistedBranch = tryParsePersistedDiffs(metadata.branchRaw, sessionUri, "branch", this._logService);
    const persistedSession = tryParsePersistedDiffs(metadata.sessionRaw, sessionUri, "session", this._logService) ?? tryParsePersistedDiffs(metadata.legacyRaw, sessionUri, "session (legacy)", this._logService);
    return { branch: persistedBranch, session: persistedSession };
  }
  applyPersistedStaticChangesets(sessionUri, diffs) {
    this._seedIfEmpty(sessionUri, "branch", diffs.branch);
    this._seedIfEmpty(sessionUri, "session", diffs.session);
  }
  restorePersistedStaticChangesets(sessionUri, metadata) {
    const parsed = this.parsePersistedStaticChangesets(sessionUri, metadata);
    this.applyPersistedStaticChangesets(sessionUri, parsed);
    return parsed;
  }
  persistChangesSummary(sessionUri, summary) {
    this._persistSessionFlag(sessionUri, META_CHANGES_SUMMARY, JSON.stringify(summary));
  }
  getListMetadataKeys(sessionUri) {
    const liveSummaryChanges = this._stateManager.getSessionSummary(sessionUri)?.changes;
    if (liveSummaryChanges) {
      return void 0;
    }
    const liveSession = this._stateManager.getChangesetState(buildSessionChangesetUri(sessionUri));
    if (liveSession?.status === ChangesetStatus.Ready) {
      return void 0;
    }
    return CHANGESET_DB_METADATA_KEYS;
  }
  computeListEntryChanges(sessionUri, metadata) {
    if (this._stateManager.getSessionState(sessionUri)) {
      return void 0;
    }
    const changesSummary = metadata[META_CHANGES_SUMMARY];
    if (changesSummary !== void 0) {
      try {
        return JSON.parse(changesSummary);
      } catch (error) {
        return void 0;
      }
    }
    const liveSession = this._stateManager.getChangesetState(buildBranchChangesetUri(sessionUri));
    const liveChanges = computeChangesSummaryFromLiveState(liveSession);
    if (liveChanges) {
      this.persistChangesSummary(sessionUri, liveChanges);
      return liveChanges;
    }
    const branchRaw = metadata[META_CHANGESET_BRANCH];
    const legacyRaw = metadata[META_LEGACY_DIFFS];
    if (branchRaw === void 0 && legacyRaw === void 0) {
      return void 0;
    }
    const restored = this.parsePersistedStaticChangesets(sessionUri, { branchRaw, legacyRaw });
    const persistedChanges = computeChangesSummaryFromPersistedDiffs(restored.branch);
    if (persistedChanges) {
      this.persistChangesSummary(sessionUri, persistedChanges);
      return persistedChanges;
    }
    return void 0;
  }
  isStaticChangesetComputeActive(changesetUri) {
    return this._activeStaticComputes.has(changesetUri);
  }
  _seedIfEmpty(session, kind, diffs) {
    if (!diffs) {
      return;
    }
    const existing = this._stateManager.getChangesetState(staticChangesetUri(session, kind));
    if (existing && existing.files.length > 0) {
      return;
    }
    this.restoreStaticChangeset(session, kind, diffs);
  }
  refreshChangesetCatalog(session) {
    const state = this._stateManager.getSessionState(session);
    if (!state || state?.lifecycle === SessionLifecycle.CreationFailed) {
      return;
    }
    const changesets = buildDefaultChangesetCatalog(session, state);
    this._stateManager.setSessionChangesets(session, changesets);
  }
  refreshBranchChangeset(session) {
    if (!this._hasWorkingDirectory(session)) {
      this._pendingMaterialization.add(session);
      return;
    }
    this._scheduleStaticRecompute(session, "branch", void 0, this._markStaticChangesetComputing(session, "branch"));
  }
  refreshSessionChangeset(session) {
    if (!this._hasWorkingDirectory(session)) {
      this._pendingMaterialization.add(session);
      return;
    }
    this._scheduleStaticRecompute(session, "session", void 0, this._markStaticChangesetComputing(session, "session"));
  }
  /**
   * Drains static changeset refreshes that were deferred because the
   * session's working directory was not yet known. Called by the
   * coordinator once a session is materialized or restored. Recomputes
   * every changeset still subscribed for the session; subscriptions that
   * dropped while the working directory was unknown are naturally skipped.
   */
  onWorkingDirectoryAvailable(session) {
    if (this._pendingMaterialization.delete(session)) {
      this.recomputeSubscribedChangesets(session);
    }
  }
  /**
   * Recomputes every changeset currently subscribed for `session`. Each
   * subscribed changeset is dispatched to its kind-specific recompute; the
   * recomputes self-defer when the working directory is still unknown.
   */
  recomputeSubscribedChangesets(session) {
    const subscriptions = this._changesetSubscriptions.getSessionSubscriptions(session);
    if (subscriptions.size === 0) {
      return;
    }
    for (const changeset of subscriptions) {
      const parsed = parseChangesetUri(changeset);
      switch (parsed?.kind) {
        case ChangesetKind.Branch:
          this.refreshBranchChangeset(session);
          break;
        case ChangesetKind.Session:
          this.refreshSessionChangeset(session);
          break;
        case ChangesetKind.Uncommitted:
          void this.computeUncommittedChangeset(session);
          break;
        case ChangesetKind.Turn:
          if (parsed.turnId !== void 0) {
            void this.computeTurnChangeset(session, parsed.turnId);
          }
          break;
        default:
          if (changeset === session) {
            this.refreshBranchChangeset(session);
            this.refreshSessionChangeset(session);
          }
          break;
      }
    }
  }
  /**
   * Forgets any deferred static changeset refreshes queued for a session
   * that is being disposed.
   */
  onSessionDisposed(session) {
    this._pendingMaterialization.delete(session);
  }
  async computeTurnChangeset(session, turnId) {
    const turnUri = this._stateManager.registerChangeset(buildTurnChangesetUri(session, turnId));
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(URI.parse(session));
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to open session database for turn diff: ${session}`, err);
      this._stateManager.dispatchServerAction(turnUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
      return turnUri;
    }
    try {
      const diffs = await this._computeTurnDiffsPreferCheckpoint(session, ref.object, turnId);
      this._publishChangesetDiffs(session, turnUri, diffs);
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute turn diffs for ${session}/${turnId}`, err);
      this._stateManager.dispatchServerAction(turnUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
    } finally {
      ref.dispose();
    }
    return turnUri;
  }
  async computeCompareTurnsChangeset(session, originalTurnId, modifiedTurnId) {
    const compareUri = this._stateManager.registerChangeset(buildCompareTurnsChangesetUri(session, originalTurnId, modifiedTurnId));
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(URI.parse(session));
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to open session database for compare-turns diff: ${session}`, err);
      this._stateManager.dispatchServerAction(compareUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
      return compareUri;
    }
    try {
      const sessionUri = URI.parse(session);
      const [originalCurrentRef, modifiedPair] = await Promise.all([
        this._checkpointService.getTurnCheckpointPair(sessionUri, originalTurnId).then((p) => p?.current),
        this._checkpointService.getTurnCheckpointPair(sessionUri, modifiedTurnId)
      ]);
      if (!originalCurrentRef || !modifiedPair) {
        const missing = !originalCurrentRef && !modifiedPair ? "both turns" : !originalCurrentRef ? "original turn" : "modified turn";
        this._stateManager.dispatchServerAction(compareUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: `No checkpoint available for ${missing}; compare requires git-backed sessions.` }
        });
        return compareUri;
      }
      if (originalCurrentRef === modifiedPair.current) {
        this._publishChangesetDiffs(session, compareUri, []);
        return compareUri;
      }
      const workingDir = await this._resolveWorkingDirectory(session);
      if (!workingDir) {
        this._stateManager.dispatchServerAction(compareUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: "No working directory recorded for session; compare requires git-backed sessions." }
        });
        return compareUri;
      }
      const diffs = await this._gitService.computeFileDiffsBetweenRefs(workingDir, {
        sessionUri: session,
        fromRef: originalCurrentRef,
        toRef: modifiedPair.current
      });
      if (diffs === void 0) {
        this._stateManager.dispatchServerAction(compareUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: `Failed to compute compare-turns diff from git (${originalCurrentRef}..${modifiedPair.current}).` }
        });
        return compareUri;
      }
      this._publishChangesetDiffs(session, compareUri, diffs);
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute compare-turns diffs for ${session}/${originalTurnId}/${modifiedTurnId}`, err);
      this._stateManager.dispatchServerAction(compareUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
    } finally {
      ref.dispose();
    }
    return compareUri;
  }
  async computeUncommittedChangeset(session) {
    const uncommittedUri = this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
    if (!this._hasSubscription(session, uncommittedUri)) {
      return uncommittedUri;
    }
    if (!this._hasWorkingDirectory(session)) {
      this._pendingMaterialization.add(session);
      return uncommittedUri;
    }
    const statusBeforeCompute = this._stateManager.getChangesetState(uncommittedUri)?.status;
    if (statusBeforeCompute !== ChangesetStatus.Computing) {
      this._stateManager.dispatchServerAction(uncommittedUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Computing
      });
    }
    try {
      const diffs = await this._computeUncommittedDiffs(session);
      if (diffs === void 0) {
        this._stateManager.dispatchServerAction(uncommittedUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: "Failed to compute uncommitted diff from git." }
        });
        return uncommittedUri;
      }
      this._publishChangesetDiffs(session, uncommittedUri, diffs);
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute uncommitted diffs for ${session}`, err);
      this._stateManager.dispatchServerAction(uncommittedUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
    }
    return uncommittedUri;
  }
  async _computeUncommittedDiffs(session) {
    const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch {
      return void 0;
    }
    return this._gitService.computeSessionFileDiffs(workingDirectoryUri, {
      sessionUri: session
    });
  }
  async _computeTurnDiffsPreferCheckpoint(session, db, turnId) {
    const pair = await this._checkpointService.getTurnCheckpointPair(URI.parse(session), turnId);
    if (pair && pair.parent !== pair.current) {
      const workingDir = await this._resolveWorkingDirectory(session);
      if (workingDir) {
        const fromRefDiffs = await this._gitService.computeFileDiffsBetweenRefs(workingDir, {
          sessionUri: session,
          fromRef: pair.parent,
          toRef: pair.current
        });
        if (fromRefDiffs) {
          return fromRefDiffs;
        }
      }
    } else if (pair && pair.parent === pair.current) {
      return [];
    }
    return computeTurnDiffs(session, db, this._diffComputeService, turnId);
  }
  async _resolveWorkingDirectory(session) {
    const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
    return workingDirectories && workingDirectories.length > 0 ? URI.parse(workingDirectories[0]) : void 0;
  }
  // ---- Lifecycle hooks invoked by AgentSideEffects -----------------------
  onToolCallEditsApplied(session, turnId) {
    this._scheduleDebouncedDiffComputation(session, turnId);
    if (this._hasSubscription(session, buildTurnChangesetUri(session, turnId))) {
      this._scheduleDebouncedTurnDiffComputation(session, turnId);
    }
  }
  onTurnComplete(session, turnId) {
    this._cancelDebouncedDiffComputation(session);
    if (turnId !== void 0) {
      this._cancelDebouncedTurnDiffComputation(session, turnId);
      if (this._hasSubscription(session, buildTurnChangesetUri(session, turnId))) {
        this._scheduleTurnRecompute(session, turnId);
      }
    }
    if (this._hasSubscription(session, buildUncommittedChangesetUri(session))) {
      this._scheduleUncommittedRecompute(session);
    }
    this._scheduleStaticRecompute(session, "branch", turnId);
    this._scheduleStaticRecompute(session, "session", turnId);
  }
  onSessionTruncated(session) {
    this._scheduleStaticRecompute(session, "branch");
    this._scheduleStaticRecompute(session, "session");
  }
  // ---- Internal compute pipeline -----------------------------------------
  /**
   * Schedules a debounced session-changeset recomputation. Uncommitted
   * recomputes ride the same turn-complete path; mid-turn debounce only
   * makes sense for the SDK-tracked session-wide diff (which sees fresh
   * `tool_complete` events between turn boundaries).
   */
  _scheduleDebouncedDiffComputation(session, turnId) {
    this._debouncedDiffTimers.set(session, disposableTimeout(() => {
      this._debouncedDiffTimers.deleteAndDispose(session);
      this._scheduleStaticRecompute(session, "branch", turnId);
      this._scheduleStaticRecompute(session, "session", turnId);
    }, AgentHostChangesetService._DIFF_DEBOUNCE_MS));
  }
  /**
   * Cancels any pending debounced diff computation for a session.
   * Called at turn end before the final (non-debounced) computation.
   */
  _cancelDebouncedDiffComputation(session) {
    this._debouncedDiffTimers.deleteAndDispose(session);
  }
  /**
   * Schedules a debounced per-turn changeset recomputation. Mirrors
   * {@link _scheduleDebouncedDiffComputation} but uses a per-
   * `(session, turnId)` map key so a long-running per-turn compute
   * doesn't block the static session recompute path (and vice versa).
   */
  _scheduleDebouncedTurnDiffComputation(session, turnId) {
    const key = `${session}\0${turnId}`;
    this._perTurnDebouncedDiffTimers.set(key, disposableTimeout(() => {
      this._perTurnDebouncedDiffTimers.deleteAndDispose(key);
      this._scheduleTurnRecompute(session, turnId);
    }, AgentHostChangesetService._DIFF_DEBOUNCE_MS));
  }
  /**
   * Cancels any pending debounced per-turn diff computation for a
   * `(session, turnId)`. Called at turn end before the final
   * (non-debounced) per-turn computation.
   */
  _cancelDebouncedTurnDiffComputation(session, turnId) {
    this._perTurnDebouncedDiffTimers.deleteAndDispose(`${session}\0${turnId}`);
  }
  /**
   * Queues a per-turn recompute on a per-`(session, turnId)` sequencer
   * key so back-to-back recomputes for the same turn serialise, but
   * recomputes for different turns (or for the static `session` /
   * `uncommitted` slots) run independently. Fire-and-forget — failures
   * are logged inside `computeTurnChangeset` and do not fail the turn.
   */
  _scheduleTurnRecompute(session, turnId) {
    this._diffComputationSequencer.queue(`${session}\0turn\0${turnId}`, () => this.computeTurnChangeset(session, turnId).then(() => void 0));
  }
  _scheduleUncommittedRecompute(session) {
    this._diffComputationSequencer.queue(`${session}\0uncommitted`, () => this.computeUncommittedChangeset(session).then(() => void 0));
  }
  /**
   * Schedules a static changeset (`uncommitted` or `session`) recompute,
   * serialised per-session so back-to-back triggers don't race against
   * stale `previousDiffs` reads. Fire-and-forget — failures are logged
   * but do not fail the turn.
   */
  _scheduleStaticRecompute(session, kind, changedTurnId, statusBeforeRefresh) {
    this._diffComputationSequencer.queue(`${session}\0${kind}`, () => this._doComputeStaticChangeset(session, kind, changedTurnId, statusBeforeRefresh));
  }
  _markStaticChangesetComputing(session, kind) {
    const changesetUri = staticChangesetUri(session, kind);
    this._stateManager.registerChangeset(changesetUri);
    const status = this._stateManager.getChangesetState(changesetUri)?.status;
    if (status !== ChangesetStatus.Computing) {
      this._stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Computing
      });
    }
    return status;
  }
  async _doComputeStaticChangeset(session, kind, changedTurnId, statusBeforeRefresh) {
    const changesetUri = staticChangesetUri(session, kind);
    this._activeStaticComputes.add(changesetUri);
    const statusBeforeCompute = statusBeforeRefresh ?? this._stateManager.getChangesetState(changesetUri)?.status;
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(URI.parse(session));
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to open session database for ${kind} diff computation: ${session}`, err);
      this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
      this._activeStaticComputes.delete(changesetUri);
      this._stateManager.onChangesetLivenessChanged();
      return;
    }
    this._stateManager.registerChangeset(changesetUri);
    try {
      let diffs = await this._tryComputeGitDiffs(session, ref.object, kind);
      if (!diffs) {
        if (kind === "branch") {
          this._logService.debug(`[AgentHostChangesetService] Branch git diff unavailable for ${session}; preserving cached changeset. previousStatus=${statusBeforeCompute ?? "unknown"} cachedFiles=${this._stateManager.getChangesetState(changesetUri)?.files.length ?? 0}`);
          this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
          return;
        }
        const peerSources = this._openPeerChatSources(session);
        try {
          if (peerSources.length > 0) {
            const sources = [
              { sessionUri: session, db: ref.object },
              ...peerSources.map((p) => ({ sessionUri: p.sessionUri, db: p.ref.object }))
            ];
            diffs = await computeUnionedDiffs(sources, this._diffComputeService);
          } else {
            let incremental;
            if (changedTurnId) {
              const previousDiffs = this._readPreviousChangesetDiffs(changesetUri);
              if (previousDiffs) {
                incremental = { changedTurnId, previousDiffs: [...previousDiffs] };
              }
            }
            diffs = await computeSessionDiffs(session, ref.object, this._diffComputeService, incremental);
          }
        } finally {
          for (const peer of peerSources) {
            peer.ref.dispose();
          }
        }
      }
      const reviewed = kind === ChangesetKind.Branch ? await this._computeReviewedInfo(session, ref.object) : void 0;
      this._publishChangesetDiffs(session, changesetUri, diffs, reviewed);
      this._persistSessionFlag(session, persistKeyFor(kind), JSON.stringify(diffs));
      if (kind === ChangesetKind.Branch) {
        this._persistSessionFlag(session, META_LEGACY_DIFFS, JSON.stringify(diffs));
        const changesSummary = summariseDiffs(diffs) ?? { additions: 0, deletions: 0, files: 0 };
        this.persistChangesSummary(session, changesSummary);
        this._stateManager.setSessionSummaryChanges(session, changesSummary);
      }
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute ${kind} diffs`, err);
      this._stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
    } finally {
      this._activeStaticComputes.delete(changesetUri);
      this._stateManager.onChangesetLivenessChanged();
      ref.dispose();
    }
  }
  /**
   * Refresh requests optimistically mark static changesets as Computing
   * while preserving their current files. Some refresh paths intentionally
   * do not publish a replacement file list (for example, uncommitted git
   * diff is temporarily unavailable), so restore the previous non-computing
   * status instead of leaving a stale cached snapshot stuck as Computing.
   */
  _restoreStaticChangesetStatus(changesetUri, status) {
    if (!status || status === ChangesetStatus.Computing) {
      return;
    }
    this._stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetStatusChanged,
      status
    });
  }
  /**
   * Reads the previous diff list back out of the changeset state so the
   * incremental aggregator can avoid recomputing files that haven't
   * changed.
   */
  _readPreviousChangesetDiffs(changesetUri) {
    const state = this._stateManager.getChangesetState(changesetUri);
    if (!state || state.files.length === 0) {
      return void 0;
    }
    return state.files.map((f) => f.edit);
  }
  /**
   * Translates the new file list into a sequence of changeset/* actions
   * (fileSet, fileRemoved) and moves the changeset to `ready` once the
   * fresh file list has been applied.
   */
  _publishChangesetDiffs(session, changesetUri, diffs, reviewed) {
    const operations = this._changesetOperationService.getOperations(session, changesetUri);
    const files = [];
    for (const edit of diffs) {
      const id = edit.after?.uri ?? edit.before?.uri;
      if (!id) {
        continue;
      }
      if (reviewed) {
        const relPath = relativePath(reviewed.repoRoot, URI.parse(id));
        files.push({
          id,
          edit,
          reviewed: relPath ? reviewed.paths.has(relPath) : false
        });
      } else {
        files.push({ id, edit });
      }
    }
    this._stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetContentChanged,
      files,
      operations: operations ? [...operations] : void 0
    });
    const status = this._stateManager.getChangesetState(changesetUri)?.status;
    if (status !== ChangesetStatus.Ready) {
      this._stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Ready
      });
    }
  }
  /**
   * Opens the databases for every non-default (peer) chat in a multi-chat
   * session. Each peer chat records its file edits into its own database
   * keyed by the chat URI, so the session changeset must union those
   * databases with the session DB. Returns an empty array for single-chat
   * sessions. Callers MUST dispose every returned `ref`.
   */
  _openPeerChatSources(session) {
    const chats = this._stateManager.getSessionState(session)?.chats ?? [];
    const sources = [];
    for (const chat of chats) {
      if (isDefaultChatUri(chat.resource)) {
        continue;
      }
      try {
        const ref = this._sessionDataService.openDatabase(URI.parse(chat.resource));
        sources.push({ sessionUri: chat.resource, ref });
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] Failed to open peer chat database for session changes: ${chat.resource}`, err);
      }
    }
    return sources;
  }
  /**
   * Returns the turn id whose checkpoint best represents the latest state of
   * the session's shared working tree. For single-chat sessions this is the
   * default chat's last turn. For multi-chat sessions it is the last turn of
   * the most-recently-modified chat (peer-chat turn checkpoints are stored
   * under the session URI keyed by their turn id). Returns `undefined` when
   * no chat has any turns.
   */
  _latestTurnIdAcrossChats(session) {
    const sessionState = this._stateManager.getSessionState(session);
    if (!sessionState) {
      return void 0;
    }
    const chats = sessionState.chats ?? [];
    if (chats.length <= 1) {
      return sessionState.turns.at(-1)?.id;
    }
    let bestTurnId;
    let bestModifiedAt = "";
    for (const chat of chats) {
      const turns = isDefaultChatUri(chat.resource) ? sessionState.turns : this._stateManager.getChatState(chat.resource)?.turns;
      const lastTurnId = turns?.at(-1)?.id;
      if (lastTurnId && chat.modifiedAt >= bestModifiedAt) {
        bestModifiedAt = chat.modifiedAt;
        bestTurnId = lastTurnId;
      }
    }
    return bestTurnId;
  }
  /**
   * Computes diffs for a static changeset by shelling out to git.
   * Returns the diff list when the session has a working directory and
   * that directory is a git work tree; returns `undefined` otherwise so
   * the caller can fall back to the edit-tracker aggregator (for
   * `kind: 'session'`) or preserve cached state (for `kind: 'branch'`).
   *
   * For `kind: 'session'` the diff is computed between the baseline
   * checkpoint ref and the latest turn checkpoint ref.
   * For `kind: 'branch'` the diff is computed against the merge-base
   * with {@link META_DIFF_BASE_BRANCH} when one is set; without a base
   * branch git falls back to `HEAD`.
   */
  async _tryComputeGitDiffs(session, db, kind) {
    const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch {
      return void 0;
    }
    if (kind === "session") {
      const latestTurnId = this._latestTurnIdAcrossChats(session);
      if (!latestTurnId) {
        return void 0;
      }
      const sessionUri = URI.parse(session);
      const [baseline, pair] = await Promise.all([
        this._checkpointService.getBaselineCheckpoint(sessionUri),
        this._checkpointService.getTurnCheckpointPair(sessionUri, latestTurnId)
      ]);
      if (!baseline || !pair) {
        return void 0;
      }
      try {
        return await this._gitService.computeFileDiffsBetweenRefs(workingDirectoryUri, {
          sessionUri: session,
          fromRef: baseline,
          toRef: pair.current
        });
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] git-driven ${kind} diff computation failed; falling back to edit-tracker`, err);
        return void 0;
      }
    }
    const baseBranch = await this._resolveBranchBaseBranch(session, db);
    try {
      return await this._gitService.computeSessionFileDiffs(workingDirectoryUri, {
        sessionUri: session,
        baseBranch
      });
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] git-driven ${kind} diff computation failed; falling back to edit-tracker`, err);
      return void 0;
    }
  }
  /**
   * Resolves the Branch Changes base branch, reused by the diff computation
   * and the review-status lookup so both are keyed on the same baseline.
   */
  async _resolveBranchBaseBranch(session, db) {
    const persistedBaseBranch = await db.getMetadata(META_DIFF_BASE_BRANCH);
    const gitStateBaseBranch = readSessionGitState(this._stateManager.getSessionState(session)?._meta)?.baseBranchName;
    if (!persistedBaseBranch && gitStateBaseBranch) {
      this._logService.debug(`[AgentHostChangesetService] Using _meta.git base branch fallback for Branch Changes in ${session}: ${gitStateBaseBranch}`);
    }
    return resolveDiffBaseBranchName(persistedBaseBranch, gitStateBaseBranch);
  }
  /**
   * Computes the reviewed-paths overlay for the Branch changeset: the
   * repository root (used to key file ids to repo-relative paths) and the set
   * of reviewed repo-relative paths. Returns `undefined` when the session has
   * no git working directory (review status is then simply omitted).
   */
  async _computeReviewedInfo(session, db) {
    const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch {
      return void 0;
    }
    const repoRoot = await this._gitService.getRepositoryRoot(workingDirectoryUri);
    if (!repoRoot) {
      return void 0;
    }
    const baseBranch = await this._resolveBranchBaseBranch(session, db);
    const paths = await this._reviewService.getReviewedPaths(session, workingDirectoryUri, baseBranch);
    return { repoRoot, paths };
  }
  /**
   * Persists a session metadata key/value pair to the session database.
   * Counterpart in `agentSideEffects.ts` (`AgentSideEffects._persistSessionFlag`):
   * keep both copies in sync if the signature changes. Duplicated rather
   * than lifted because the two consumers persist disjoint metadata
   * (changeset diffs here vs. customTitle / isRead / isArchived /
   * configValues there) and a shared util would only have two callers.
   */
  _persistSessionFlag(session, key, value) {
    const ref = this._sessionDataService.openDatabase(URI.parse(session));
    ref.object.setMetadata(key, value).catch((err) => {
      this._logService.warn(`[AgentHostChangesetService] Failed to persist ${key}`, err);
    }).finally(() => {
      ref.dispose();
    });
  }
};
AgentHostChangesetService._DIFF_DEBOUNCE_MS = 5e3;
AgentHostChangesetService = __decorateClass([
  __decorateParam(0, IAgentHostStateManager),
  __decorateParam(1, ILogService),
  __decorateParam(2, ISessionDataService),
  __decorateParam(3, IAgentHostGitService),
  __decorateParam(4, IAgentHostCheckpointService),
  __decorateParam(5, IAgentConfigurationService),
  __decorateParam(6, IAgentHostChangesetOperationService),
  __decorateParam(7, IAgentHostChangesetSubscriptionService),
  __decorateParam(8, IAgentHostReviewService)
], AgentHostChangesetService);
export {
  AgentHostChangesetService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpLFxuXHRidWlsZENvbXBhcmVUdXJuc0NoYW5nZXNldFVyaSxcblx0YnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpLFxuXHRidWlsZFR1cm5DaGFuZ2VzZXRVcmksXG5cdGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmksXG5cdHBhcnNlQ2hhbmdlc2V0VXJpLFxuXHRDaGFuZ2VzZXRLaW5kLFxuXHRidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nLFxufSBmcm9tICcuLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UsIElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgQ2hhbmdlc2V0U3RhdGUsIENoYW5nZXNTdW1tYXJ5IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHtcblx0Q2hhbmdlc2V0U3RhdHVzLFxuXHR0eXBlIENoYW5nZXNldEZpbGUsXG5cdHR5cGUgSVNlc3Npb25GaWxlRGlmZixcblx0dHlwZSBVUkkgYXMgUHJvdG9jb2xVUkksXG5cdHJlYWRTZXNzaW9uR2l0U3RhdGUsXG5cdGlzRGVmYXVsdENoYXRVcmksXG5cdFNlc3Npb25MaWZlY3ljbGUsXG59IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UsIE1FVEFfRElGRl9CQVNFX0JSQU5DSCwgcmVzb2x2ZURpZmZCYXNlQnJhbmNoTmFtZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb2RlV29ya2VyRGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVNlc3Npb25EaWZmcywgY29tcHV0ZVR1cm5EaWZmcywgY29tcHV0ZVVuaW9uZWREaWZmcywgdHlwZSBJSW5jcmVtZW50YWxEaWZmT3B0aW9ucywgdHlwZSBJU2Vzc2lvbkRpZmZTb3VyY2UgfSBmcm9tICcuL3Nlc3Npb25EaWZmQWdncmVnYXRvci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgSVBlcnNpc3RlZENoYW5nZXNldE1ldGFkYXRhLCBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcywgQ0hBTkdFU0VUX0RCX01FVEFEQVRBX0tFWVMsIE1FVEFfQ0hBTkdFU19TVU1NQVJZLCBNRVRBX0NIQU5HRVNFVF9CUkFOQ0gsIE1FVEFfQ0hBTkdFU0VUX1NFU1NJT04sIE1FVEFfTEVHQUNZX0RJRkZTLCBTdGF0aWNDaGFuZ2VzZXRLaW5kIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RSZXZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxuZnVuY3Rpb24gc3RhdGljQ2hhbmdlc2V0VXJpKHNlc3Npb246IFByb3RvY29sVVJJLCBraW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kKTogUHJvdG9jb2xVUkkge1xuXHRyZXR1cm4ga2luZCA9PT0gJ2JyYW5jaCdcblx0XHQ/IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb24pXG5cdFx0OiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbik7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RLZXlGb3Ioa2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCk6IHN0cmluZyB7XG5cdHJldHVybiBraW5kID09PSAnYnJhbmNoJ1xuXHRcdD8gTUVUQV9DSEFOR0VTRVRfQlJBTkNIXG5cdFx0OiBNRVRBX0NIQU5HRVNFVF9TRVNTSU9OO1xufVxuXG4vKipcbiAqIFN1bXMgdGhlIHBlci1maWxlIGRpZmYgY291bnRzIGludG8gdGhlIHtAbGluayBDaGFuZ2VzU3VtbWFyeX0gc2hhcGVcbiAqIHRoYXQgbGl2ZXMgb24gYHN1bW1hcnkuY2hhbmdlc2AuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIGFuIHVuZGVmaW5lZFxuICogaW5wdXQgc28gY2FsbGVycyBjYW4gZGlzdGluZ3Vpc2ggXCJubyBkYXRhIHlldFwiIGZyb20gXCJkYXRhLCB6ZXJvIGNoYW5nZXNcIi5cbiAqL1xuZnVuY3Rpb24gc3VtbWFyaXNlRGlmZnMoZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZCk6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFkaWZmcykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0bGV0IGFkZGl0aW9ucyA9IDA7XG5cdGxldCBkZWxldGlvbnMgPSAwO1xuXHRmb3IgKGNvbnN0IGQgb2YgZGlmZnMpIHtcblx0XHRhZGRpdGlvbnMgKz0gZC5kaWZmPy5hZGRlZCA/PyAwO1xuXHRcdGRlbGV0aW9ucyArPSBkLmRpZmY/LnJlbW92ZWQgPz8gMDtcblx0fVxuXHRyZXR1cm4geyBhZGRpdGlvbnMsIGRlbGV0aW9ucywgZmlsZXM6IGRpZmZzLmxlbmd0aCB9O1xufVxuXG4vKipcbiAqIERlcml2ZXMgdGhlIGBzdW1tYXJ5LmNoYW5nZXNgIGFnZ3JlZ2F0ZSBmb3IgYW4gdW5vcGVuZWQgc2Vzc2lvbiBmcm9tXG4gKiB0aGUgcmVhZHkgbGl2ZSB7QGxpbmsgQ2hhbmdlc2V0U3RhdGV9IG9mIHRoZSBjYXRhbG9ndWUgZW50cnkgd2hvc2VcbiAqIGBjaGFuZ2VLaW5kID09PSAnc2Vzc2lvbidgIFx1MjAxNCB0eXBpY2FsbHkgYmVjYXVzZSBhIHByZXZpb3VzXG4gKiBgcmVzdG9yZVN0YXRpY0NoYW5nZXNldGAgd2FybWVkIHRoZSBjYWNoZSBiZWZvcmUgdGhlIHNlc3Npb24gaXRzZWxmXG4gKiB3YXMgYXR0YWNoZWQuXG4gKlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIGxpdmUgc2Vzc2lvbi13aWRlIHN0YXRlIGlzIHJlYWR5LCBzb1xuICogYGxpc3RTZXNzaW9uc2AgbGVhdmVzIHRoZSBgY2hhbmdlc2AgZmllbGQgdW5zZXQgZm9yIHNlc3Npb25zIHdpdGhvdXRcbiAqIHVzYWJsZSBjb3VudHMgXHUyMDE0IHByZXNlcnZpbmcgdGhlIGxvbmctc3RhbmRpbmcgY29udHJhY3QgdGhhdCB1bm9wZW5lZFxuICogc2Vzc2lvbnMgd2l0aG91dCBsaXZlIG9yIHBlcnNpc3RlZCBkYXRhIGFkdmVydGlzZSBubyBhZ2dyZWdhdGUuXG4gKlxuICogT25seSB0aGUgYGNoYW5nZUtpbmQ6ICdzZXNzaW9uJ2AgZW50cnkgZmVlZHMgdGhlIHN1bW1hcnk7IG90aGVyIGtpbmRzXG4gKiAoYCd1bmNvbW1pdHRlZCdgLCBgJ3R1cm4nYCwgYCdjb21wYXJlLXR1cm5zJ2ApIGRlc2NyaWJlIHNsaWNlcywgbm90XG4gKiB0aGUgc2Vzc2lvbi1sZXZlbCBmb290cHJpbnQuIFRoZSBzdGF0aWMgY2F0YWxvZ3VlIGl0c2VsZiAoYnVpbHQgYnlcbiAqIHtAbGluayBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nfSkgaXMgaW5kZXBlbmRlbnQgb2YgY291bnRzIGFuZFxuICogaXMgc2VlZGVkIG9uY2UgYXQgc2Vzc2lvbiBjcmVhdGlvbi5cbiAqL1xuZnVuY3Rpb24gY29tcHV0ZUNoYW5nZXNTdW1tYXJ5RnJvbUxpdmVTdGF0ZShcblx0c2Vzc2lvbjogQ2hhbmdlc2V0U3RhdGUgfCB1bmRlZmluZWQsXG4pOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNlc3Npb25EaWZmcyA9IHNlc3Npb24/LnN0YXR1cyA9PT0gQ2hhbmdlc2V0U3RhdHVzLlJlYWR5ID8gc2Vzc2lvbi5maWxlcy5tYXAoZiA9PiBmLmVkaXQpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4gc3VtbWFyaXNlRGlmZnMoc2Vzc2lvbkRpZmZzKTtcbn1cblxuLyoqXG4gKiBEZXJpdmVzIHRoZSBgc3VtbWFyeS5jaGFuZ2VzYCBhZ2dyZWdhdGUgZm9yIGFuIHVub3BlbmVkIHNlc3Npb24gZnJvbVxuICogcGFyc2VkIHBlcnNpc3RlZCBkaWZmcyBmb3IgdGhlIGBjaGFuZ2VLaW5kOiAnc2Vzc2lvbidgIGNhdGFsb2d1ZVxuICogZW50cnkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbi13aWRlIGJsb2IgaXMgYWJzZW50IHNvXG4gKiBtYWxmb3JtZWQgbWV0YWRhdGEgbGVhdmVzIGBzdW1tYXJ5LmNoYW5nZXNgIHVuc2V0LlxuICovXG5mdW5jdGlvbiBjb21wdXRlQ2hhbmdlc1N1bW1hcnlGcm9tUGVyc2lzdGVkRGlmZnMoXG5cdHNlc3Npb25EaWZmczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkLFxuKTogQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gc3VtbWFyaXNlRGlmZnMoc2Vzc2lvbkRpZmZzKTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgYSBKU09OLXNlcmlhbGlzZWQge0BsaW5rIElTZXNzaW9uRmlsZURpZmZ9W10gYmxvYiBmcm9tIHNlc3Npb25cbiAqIG1ldGFkYXRhLiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciBtaXNzaW5nIG9yIG1hbGZvcm1lZCBpbnB1dCwgbG9nZ2luZyBhXG4gKiB3YXJuaW5nIHRoYXQgbmFtZXMgYHNlc3Npb25VcmlgIGFuZCBga2luZGAgc28gb3BlcmF0b3JzIGNhbiBjb3JyZWxhdGUgdGhlXG4gKiBmYWlsdXJlIHdpdGggYSBzcGVjaWZpYyBzZXNzaW9uL2NoYW5nZXNldCBzbG90LiBOZXZlciB0aHJvd3MuXG4gKi9cbmZ1bmN0aW9uIHRyeVBhcnNlUGVyc2lzdGVkRGlmZnMocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlc3Npb25Vcmk6IHN0cmluZywga2luZDogc3RyaW5nLCBsb2c6IElMb2dTZXJ2aWNlKTogSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyYXcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UocmF3KSBhcyBJU2Vzc2lvbkZpbGVEaWZmW107XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGxvZy53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIHBhcnNlIHBlcnNpc3RlZCAke2tpbmR9IGRpZmZzIGZvciAke3Nlc3Npb25Vcml9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKiBTaGFyZWQgZGlmZiBjb21wdXRlIHNlcnZpY2UgZm9yIGNhbGN1bGF0aW5nIGxpbmUtbGV2ZWwgZGlmZnMgaW4gYSB3b3JrZXIgdGhyZWFkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmQ29tcHV0ZVNlcnZpY2U6IElEaWZmQ29tcHV0ZVNlcnZpY2U7XG5cdC8qKiBTZXJpYWxpemVzIHBlci1zZXNzaW9uIGRpZmYgY29tcHV0YXRpb25zIHRvIGF2b2lkIHJhY2VzIHdpdGggc3RhbGUgcHJldmlvdXNEaWZmcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGlmZkNvbXB1dGF0aW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblx0LyoqIFBlci1zZXNzaW9uIGRlYm91bmNlIHRpbWVycyBmb3IgbWlkLXR1cm4gZGlmZiBjb21wdXRhdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVib3VuY2VkRGlmZlRpbWVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdC8qKiBQZXItYChzZXNzaW9uLCB0dXJuSWQpYCBkZWJvdW5jZSB0aW1lcnMgZm9yIG1pZC10dXJuIHBlci10dXJuIGNoYW5nZXNldCByZWNvbXB1dGF0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJUdXJuRGVib3VuY2VkRGlmZlRpbWVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVN0YXRpY0NvbXB1dGVzID0gbmV3IFNldDxQcm90b2NvbFVSST4oKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0RJRkZfREVCT1VOQ0VfTVMgPSA1MDAwO1xuXG5cdC8qKlxuXHQgKiBTZXNzaW9ucyB3aG9zZSBzdGF0aWMgY2hhbmdlc2V0IHJlZnJlc2ggd2FzIHJlcXVlc3RlZCBiZWZvcmUgdGhlXG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5IHdhcyBrbm93biAocHJvdmlzaW9uYWwgLyBub3QteWV0LW1hdGVyaWFsaXplZFxuXHQgKiBzZXNzaW9ucykuIERyYWluZWQgZnJvbSB7QGxpbmsgb25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlfSBvbmNlIHRoZVxuXHQgKiB3b3JraW5nIGRpcmVjdG9yeSBpcyBzZXQsIHdoaWNoIHJlY29tcHV0ZXMgZXZlcnkgY2hhbmdlc2V0IHN0aWxsXG5cdCAqIHN1YnNjcmliZWQgZm9yIHRoZSBzZXNzaW9uLlxuXHQgKlxuXHQgKiBGaXJpbmcgYSByZWZyZXNoIGJlZm9yZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMga25vd24gd291bGQgY29tcHV0ZVxuXHQgKiBhZ2FpbnN0IGEgbWlzc2luZyBkaXJlY3RvcnkgYW5kIHRoZSBnaXQgcGF0aCB3b3VsZCBiYWlsLCBzbyB3ZSBkZWZlclxuXHQgKiBpbnN0ZWFkIGFuZCByZS1ydW4gb25jZSBtYXRlcmlhbGl6YXRpb24gLyByZXN0b3JlIHBvcHVsYXRlcyBpdC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24gPSBuZXcgU2V0PFByb3RvY29sVVJJPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVNlc3Npb25EYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hlY2twb2ludFNlcnZpY2U6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlOiBJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhbmdlc2V0U3Vic2NyaXB0aW9uczogSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RSZXZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Jldmlld1NlcnZpY2U6IElBZ2VudEhvc3RSZXZpZXdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb2RlV29ya2VyRGlmZkNvbXB1dGVTZXJ2aWNlKHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgd2hlbiBhdCBsZWFzdCBvbmUgY2xpZW50IGlzIHN1YnNjcmliZWQgdG8gYGNoYW5nZXNldGBcblx0ICogdW5kZXIgYHNlc3Npb25gLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFzU3Vic2NyaXB0aW9uKHNlc3Npb246IFByb3RvY29sVVJJLCBjaGFuZ2VzZXQ6IFByb3RvY29sVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYW5nZXNldFN1YnNjcmlwdGlvbnMuZ2V0U2Vzc2lvblN1YnNjcmlwdGlvbnMoc2Vzc2lvbikuaGFzKGNoYW5nZXNldCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNXb3JraW5nRGlyZWN0b3J5KHNlc3Npb246IFByb3RvY29sVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yeShzZXNzaW9uKTtcblx0fVxuXG5cdHJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uKSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbikpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbikpO1xuXHR9XG5cblx0cmVzdG9yZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uOiBQcm90b2NvbFVSSSwga2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCwgZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChzdGF0aWNDaGFuZ2VzZXRVcmkoc2Vzc2lvbiwga2luZCkpO1xuXHRcdHRoaXMuX3B1Ymxpc2hDaGFuZ2VzZXREaWZmcyhzZXNzaW9uLCBjaGFuZ2VzZXRVcmksIGRpZmZzKTtcblx0fVxuXG5cdHBhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSwgbWV0YWRhdGE6IElQZXJzaXN0ZWRDaGFuZ2VzZXRNZXRhZGF0YSk6IElSZXN0b3JlZENoYW5nZXNldERpZmZzIHtcblx0XHRjb25zdCBwZXJzaXN0ZWRCcmFuY2ggPSB0cnlQYXJzZVBlcnNpc3RlZERpZmZzKG1ldGFkYXRhLmJyYW5jaFJhdywgc2Vzc2lvblVyaSwgJ2JyYW5jaCcsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0Ly8gTGVnYWN5IGBkaWZmc2AgaXMgdGhlIG1pZ3JhdGlvbiBmYWxsYmFjayBmb3IgdGhlIHNlc3Npb24td2lkZVxuXHRcdC8vIGNoYW5nZXNldCBvbmx5IFx1MjAxNCBpdCBuZXZlciBjYXJyaWVkIHVuY29tbWl0dGVkIHN0YXRlLlxuXHRcdGNvbnN0IHBlcnNpc3RlZFNlc3Npb24gPSB0cnlQYXJzZVBlcnNpc3RlZERpZmZzKG1ldGFkYXRhLnNlc3Npb25SYXcsIHNlc3Npb25VcmksICdzZXNzaW9uJywgdGhpcy5fbG9nU2VydmljZSlcblx0XHRcdD8/IHRyeVBhcnNlUGVyc2lzdGVkRGlmZnMobWV0YWRhdGEubGVnYWN5UmF3LCBzZXNzaW9uVXJpLCAnc2Vzc2lvbiAobGVnYWN5KScsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHsgYnJhbmNoOiBwZXJzaXN0ZWRCcmFuY2gsIHNlc3Npb246IHBlcnNpc3RlZFNlc3Npb24gfTtcblx0fVxuXG5cdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSwgZGlmZnM6IElSZXN0b3JlZENoYW5nZXNldERpZmZzKTogdm9pZCB7XG5cdFx0Ly8gYHNlZWRJZkVtcHR5YDogb25seSByZXNlZWQgcGVyc2lzdGVkIGRpZmZzIHdoZW4gdGhlIG1hdGNoaW5nIGxpdmVcblx0XHQvLyBjaGFuZ2VzZXQgc3RhdGUgaXMgYWJzZW50IG9yIGVtcHR5LiBMaXZlIHN0YXRlIChlLmcuIGZyb20gYSBwcmlvclxuXHRcdC8vIHJlZnJlc2ggaW4gdGhpcyBsaWZldGltZSkgaXMgYWx3YXlzIG1vcmUgYXV0aG9yaXRhdGl2ZSB0aGFuIGFcblx0XHQvLyBwb3RlbnRpYWxseS1zdGFsZSBwZXJzaXN0ZWQgYmxvYjsgd2l0aG91dCB0aGlzIGd1YXJkIGEgZnJlc2hcblx0XHQvLyBgcmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHNgIGNhbGwgd291bGQgY2xvYmJlciBpdC5cblx0XHR0aGlzLl9zZWVkSWZFbXB0eShzZXNzaW9uVXJpLCAnYnJhbmNoJywgZGlmZnMuYnJhbmNoKTtcblx0XHR0aGlzLl9zZWVkSWZFbXB0eShzZXNzaW9uVXJpLCAnc2Vzc2lvbicsIGRpZmZzLnNlc3Npb24pO1xuXHR9XG5cblx0cmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblVyaTogUHJvdG9jb2xVUkksIG1ldGFkYXRhOiBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEpOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyB7XG5cdFx0Y29uc3QgcGFyc2VkID0gdGhpcy5wYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblVyaSwgbWV0YWRhdGEpO1xuXHRcdHRoaXMuYXBwbHlQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25VcmksIHBhcnNlZCk7XG5cdFx0cmV0dXJuIHBhcnNlZDtcblx0fVxuXG5cdHBlcnNpc3RDaGFuZ2VzU3VtbWFyeShzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSwgc3VtbWFyeTogQ2hhbmdlc1N1bW1hcnkpOiB2b2lkIHtcblx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoc2Vzc2lvblVyaSwgTUVUQV9DSEFOR0VTX1NVTU1BUlksIEpTT04uc3RyaW5naWZ5KHN1bW1hcnkpKTtcblx0fVxuXG5cdGdldExpc3RNZXRhZGF0YUtleXMoc2Vzc2lvblVyaTogUHJvdG9jb2xVUkkpOiBSZWNvcmQ8c3RyaW5nLCB0cnVlPiB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gRmFzdCBwYXRoOiBhIGxpdmUgYHN1bW1hcnkuY2hhbmdlc2AgKGxvYWRlZCBzZXNzaW9uKSBvciBhIHJlYWR5IGxpdmVcblx0XHQvLyBgY2hhbmdlS2luZDogJ3Nlc3Npb24nYCBjaGFuZ2VzZXQgc3RhdGUgKHJlZ2lzdGVyZWQgYnV0IG5vdC15ZXQtXG5cdFx0Ly8gcmVzdG9yZWQgc2Vzc2lvbikgaXMgYXV0aG9yaXRhdGl2ZSwgc28gdGhlIGNhbGxlciBjYW4gc2tpcCBsb2FkaW5nXG5cdFx0Ly8gdGhlIHBvdGVudGlhbGx5LWxhcmdlIHBlcnNpc3RlZCBkaWZmIGJsb2JzLlxuXHRcdGNvbnN0IGxpdmVTdW1tYXJ5Q2hhbmdlcyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uVXJpKT8uY2hhbmdlcztcblx0XHRpZiAobGl2ZVN1bW1hcnlDaGFuZ2VzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsaXZlU2Vzc2lvbiA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdGlmIChsaXZlU2Vzc2lvbj8uc3RhdHVzID09PSBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBDSEFOR0VTRVRfREJfTUVUQURBVEFfS0VZUztcblx0fVxuXG5cdGNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKHNlc3Npb25Vcmk6IFByb3RvY29sVVJJLCBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBMb2FkZWQgc2Vzc2lvbjogdGhlIGNhbGxlciBoYXMgYWxyZWFkeSBwcm9qZWN0ZWRcblx0XHQvLyBgc3RhdGUuc3VtbWFyeS5jaGFuZ2VzYCBvbnRvIHRoZSBlbnRyeS4gTm90aGluZyB0byBvdmVybGF5LlxuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBtZXRhZGF0YSBjb250YWlucyB0aGUgY2hhbmdlcyBzdW1tYXJ5LiBJbiB0aGUgcGFzdCB3ZVxuXHRcdC8vIHVzZWQgdG8gc3RvcmUgdGhlIGNoYW5nZXNldHMgaW4gdGhlIHNlc3Npb24gZGF0YWJhc2UgYnV0IHdlIGhhdmVcblx0XHQvLyBzaW5jZSBtb3ZlZCB0byBhIG1vcmUgZWZmaWNpZW50IHN0b3JhZ2UgbWVjaGFuaXNtIGJ5IG9ubHkgc3RvcmluZ1xuXHRcdC8vIHRoZSBjaGFuZ2VzIHN1bW1hcnkuXG5cdFx0Y29uc3QgY2hhbmdlc1N1bW1hcnkgPSBtZXRhZGF0YVtNRVRBX0NIQU5HRVNfU1VNTUFSWV07XG5cdFx0aWYgKGNoYW5nZXNTdW1tYXJ5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNoYW5nZXNTdW1tYXJ5KSBhcyBDaGFuZ2VzU3VtbWFyeTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVhZCBsaXZlIHN0YXRlIGZvciBhbiB1bm9wZW5lZCBzZXNzaW9uOiBzeW50aGVzaXNlIHRoZSBhZ2dyZWdhdGVcblx0XHQvLyBmcm9tIHRoZSBsaXZlIGBjaGFuZ2VLaW5kOiAnYnJhbmNoJ2AgY2hhbmdlc2V0IHN0YXRlLiBDb3VudHMgc3RheVxuXHRcdC8vIGluIGxvY2tzdGVwIHdpdGggdGhlIGFjdHVhbCBjaGFuZ2VzZXQgc3RhdGUgZm9yIHRoZSBzZXNzaW9uLWxpc3QgY2hpcC5cblx0XHRjb25zdCBsaXZlU2Vzc2lvbiA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3QgbGl2ZUNoYW5nZXMgPSBjb21wdXRlQ2hhbmdlc1N1bW1hcnlGcm9tTGl2ZVN0YXRlKGxpdmVTZXNzaW9uKTtcblx0XHRpZiAobGl2ZUNoYW5nZXMpIHtcblx0XHRcdC8vIE1pZ3JhdGUgdGhlIGNoYW5nZXMgc3VtbWFyeSB0byB0aGUgbmV3IHN0b3JhZ2UgbWVjaGFuaXNtLlxuXHRcdFx0dGhpcy5wZXJzaXN0Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvblVyaSwgbGl2ZUNoYW5nZXMpO1xuXHRcdFx0cmV0dXJuIGxpdmVDaGFuZ2VzO1xuXHRcdH1cblxuXHRcdC8vIE5vIGxpdmUgc291cmNlIFx1MjAxNCB0cnkgcGVyc2lzdGVkIGJsb2JzIChpZiB0aGUgY2FsbGVyIGJhdGNoZWQgdGhlbSkuXG5cdFx0Y29uc3QgYnJhbmNoUmF3ID0gbWV0YWRhdGFbTUVUQV9DSEFOR0VTRVRfQlJBTkNIXTtcblx0XHRjb25zdCBsZWdhY3lSYXcgPSBtZXRhZGF0YVtNRVRBX0xFR0FDWV9ESUZGU107XG5cdFx0aWYgKGJyYW5jaFJhdyA9PT0gdW5kZWZpbmVkICYmIGxlZ2FjeVJhdyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN0b3JlZCA9IHRoaXMucGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25VcmksIHsgYnJhbmNoUmF3LCBsZWdhY3lSYXcgfSk7XG5cblx0XHQvLyBgbGlzdFNlc3Npb25zYCBtdXN0IG5vdCBzZWVkIGZ1bGwgY2hhbmdlc2V0IHN0YXRlIGZvciBldmVyeSByb3c7IGl0XG5cdFx0Ly8gb25seSBwYXJzZXMgcGVyc2lzdGVkIGJsb2JzIGVub3VnaCB0byByZW5kZXIgdGhlIGNoaXAgYWdncmVnYXRlLlxuXHRcdC8vIE9uY2UgdGhlIHNlc3Npb24gaXMgb3BlbmVkIHZpYSBgcmVzdG9yZVNlc3Npb25gLCB0aGUgbGl2ZSBvdmVybGF5IGluXG5cdFx0Ly8gYEFnZW50U2VydmljZS5saXN0U2Vzc2lvbnNgIHJlcGxhY2VzIHRoaXMgcGFyc2Utb25seSBhZ2dyZWdhdGUuXG5cdFx0Y29uc3QgcGVyc2lzdGVkQ2hhbmdlcyA9IGNvbXB1dGVDaGFuZ2VzU3VtbWFyeUZyb21QZXJzaXN0ZWREaWZmcyhyZXN0b3JlZC5icmFuY2gpO1xuXHRcdGlmIChwZXJzaXN0ZWRDaGFuZ2VzKSB7XG5cdFx0XHQvLyBNaWdyYXRlIHRoZSBjaGFuZ2VzIHN1bW1hcnkgdG8gdGhlIG5ldyBzdG9yYWdlIG1lY2hhbmlzbS5cblx0XHRcdHRoaXMucGVyc2lzdENoYW5nZXNTdW1tYXJ5KHNlc3Npb25VcmksIHBlcnNpc3RlZENoYW5nZXMpO1xuXHRcdFx0cmV0dXJuIHBlcnNpc3RlZENoYW5nZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzU3RhdGljQ2hhbmdlc2V0Q29tcHV0ZUFjdGl2ZShjaGFuZ2VzZXRVcmk6IFByb3RvY29sVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZVN0YXRpY0NvbXB1dGVzLmhhcyhjaGFuZ2VzZXRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VlZElmRW1wdHkoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtpbmQ6IFN0YXRpY0NoYW5nZXNldEtpbmQsIGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWRpZmZzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHN0YXRpY0NoYW5nZXNldFVyaShzZXNzaW9uLCBraW5kKSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLmZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZXN0b3JlU3RhdGljQ2hhbmdlc2V0KHNlc3Npb24sIGtpbmQsIGRpZmZzKTtcblx0fVxuXG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pO1xuXHRcdGlmICghc3RhdGUgfHwgc3RhdGU/LmxpZmVjeWNsZSA9PT0gU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGlvbkZhaWxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nKHNlc3Npb24sIHN0YXRlKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvbiwgY2hhbmdlc2V0cyk7XG5cdH1cblxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWF0ZXJpYWxpemF0aW9uLmFkZChzZXNzaW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ2JyYW5jaCcsIHVuZGVmaW5lZCwgdGhpcy5fbWFya1N0YXRpY0NoYW5nZXNldENvbXB1dGluZyhzZXNzaW9uLCAnYnJhbmNoJykpO1xuXHR9XG5cblx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1dvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvbikpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uYWRkKHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zY2hlZHVsZVN0YXRpY1JlY29tcHV0ZShzZXNzaW9uLCAnc2Vzc2lvbicsIHVuZGVmaW5lZCwgdGhpcy5fbWFya1N0YXRpY0NoYW5nZXNldENvbXB1dGluZyhzZXNzaW9uLCAnc2Vzc2lvbicpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcmFpbnMgc3RhdGljIGNoYW5nZXNldCByZWZyZXNoZXMgdGhhdCB3ZXJlIGRlZmVycmVkIGJlY2F1c2UgdGhlXG5cdCAqIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSB3YXMgbm90IHlldCBrbm93bi4gQ2FsbGVkIGJ5IHRoZVxuXHQgKiBjb29yZGluYXRvciBvbmNlIGEgc2Vzc2lvbiBpcyBtYXRlcmlhbGl6ZWQgb3IgcmVzdG9yZWQuIFJlY29tcHV0ZXNcblx0ICogZXZlcnkgY2hhbmdlc2V0IHN0aWxsIHN1YnNjcmliZWQgZm9yIHRoZSBzZXNzaW9uOyBzdWJzY3JpcHRpb25zIHRoYXRcblx0ICogZHJvcHBlZCB3aGlsZSB0aGUgd29ya2luZyBkaXJlY3Rvcnkgd2FzIHVua25vd24gYXJlIG5hdHVyYWxseSBza2lwcGVkLlxuXHQgKi9cblx0b25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uZGVsZXRlKHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLnJlY29tcHV0ZVN1YnNjcmliZWRDaGFuZ2VzZXRzKHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbXB1dGVzIGV2ZXJ5IGNoYW5nZXNldCBjdXJyZW50bHkgc3Vic2NyaWJlZCBmb3IgYHNlc3Npb25gLiBFYWNoXG5cdCAqIHN1YnNjcmliZWQgY2hhbmdlc2V0IGlzIGRpc3BhdGNoZWQgdG8gaXRzIGtpbmQtc3BlY2lmaWMgcmVjb21wdXRlOyB0aGVcblx0ICogcmVjb21wdXRlcyBzZWxmLWRlZmVyIHdoZW4gdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHN0aWxsIHVua25vd24uXG5cdCAqL1xuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cyhzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbnMgPSB0aGlzLl9jaGFuZ2VzZXRTdWJzY3JpcHRpb25zLmdldFNlc3Npb25TdWJzY3JpcHRpb25zKHNlc3Npb24pO1xuXHRcdGlmIChzdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2VzZXQgb2Ygc3Vic2NyaXB0aW9ucykge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGFuZ2VzZXRVcmkoY2hhbmdlc2V0KTtcblx0XHRcdHN3aXRjaCAocGFyc2VkPy5raW5kKSB7XG5cdFx0XHRcdGNhc2UgQ2hhbmdlc2V0S2luZC5CcmFuY2g6XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuU2Vzc2lvbjpcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuVW5jb21taXR0ZWQ6XG5cdFx0XHRcdFx0dm9pZCB0aGlzLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFuZ2VzZXRLaW5kLlR1cm46XG5cdFx0XHRcdFx0aWYgKHBhcnNlZC50dXJuSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLmNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb24sIHBhcnNlZC50dXJuSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHQvLyBBIHBsYWluIHNlc3Npb24gVVJJIHN1YnNjcmlwdGlvbiAoQWdlbnRzIFdpbmRvdyBsaXN0IC9cblx0XHRcdFx0XHQvLyBkZXRhaWwgb2JzZXJ2aW5nIHRoZSBzZXNzaW9uKSBpbXBsaWNpdGx5IG9ic2VydmVzIHRoZVxuXHRcdFx0XHRcdC8vIGNhdGFsb2d1ZSdzIHN0YXRpYyBjaGFuZ2VzZXRzIFx1MjAxNCByZWZyZXNoIGJvdGguXG5cdFx0XHRcdFx0aWYgKGNoYW5nZXNldCA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbkNoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmdldHMgYW55IGRlZmVycmVkIHN0YXRpYyBjaGFuZ2VzZXQgcmVmcmVzaGVzIHF1ZXVlZCBmb3IgYSBzZXNzaW9uXG5cdCAqIHRoYXQgaXMgYmVpbmcgZGlzcG9zZWQuXG5cdCAqL1xuXHRvblNlc3Npb25EaXNwb3NlZChzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxQcm90b2NvbFVSST4ge1xuXHRcdGNvbnN0IHR1cm5VcmkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb24sIHR1cm5JZCkpO1xuXHRcdGxldCByZWY6IFJldHVyblR5cGU8SVNlc3Npb25EYXRhU2VydmljZVsnb3BlbkRhdGFiYXNlJ10+O1xuXHRcdHRyeSB7XG5cdFx0XHRyZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKFVSSS5wYXJzZShzZXNzaW9uKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBzZXNzaW9uIGRhdGFiYXNlIGZvciB0dXJuIGRpZmY6ICR7c2Vzc2lvbn1gLCBlcnIpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHR1cm5VcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdHVyblVyaTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFByZWZlciB0aGUgY2hlY2twb2ludC1yZWYgZ2l0IGRpZmYgd2hlbiBhdmFpbGFibGUgXHUyMDE0IHRoYXQgcGF0aFxuXHRcdFx0Ly8gY2FwdHVyZXMgdGVybWluYWwtdG9vbCBlZGl0cyB0aGUgRmlsZUVkaXRUcmFja2VyIHBpcGVsaW5lXG5cdFx0XHQvLyAoYGZpbGVfZWRpdHNgIHJvd3MpIG1pc3Nlcy4gRmFsbHMgYmFjayB0byB0aGUgU0RLLXRyYWNrZWRcblx0XHRcdC8vIGFnZ3JlZ2F0b3Igd2hlbiBjaGVja3BvaW50cyBhcmVuJ3Qgc2V0IHVwIChub24tZ2l0IGZvbGRlclxuXHRcdFx0Ly8gaXNvbGF0aW9uLCBiYXNlbGluZSBuZXZlciBjYXB0dXJlZCwgb3IgY2FwdHVyZSBmYWlsdXJlKS5cblx0XHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fY29tcHV0ZVR1cm5EaWZmc1ByZWZlckNoZWNrcG9pbnQoc2Vzc2lvbiwgcmVmLm9iamVjdCwgdHVybklkKTtcblx0XHRcdHRoaXMuX3B1Ymxpc2hDaGFuZ2VzZXREaWZmcyhzZXNzaW9uLCB0dXJuVXJpLCBkaWZmcyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gY29tcHV0ZSB0dXJuIGRpZmZzIGZvciAke3Nlc3Npb259LyR7dHVybklkfWAsIGVycik7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odHVyblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHR1cm5Vcmk7XG5cdH1cblxuXHRhc3luYyBjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJLCBvcmlnaW5hbFR1cm5JZDogc3RyaW5nLCBtb2RpZmllZFR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxQcm90b2NvbFVSST4ge1xuXHRcdGNvbnN0IGNvbXBhcmVVcmkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYnVpbGRDb21wYXJlVHVybnNDaGFuZ2VzZXRVcmkoc2Vzc2lvbiwgb3JpZ2luYWxUdXJuSWQsIG1vZGlmaWVkVHVybklkKSk7XG5cdFx0bGV0IHJlZjogUmV0dXJuVHlwZTxJU2Vzc2lvbkRhdGFTZXJ2aWNlWydvcGVuRGF0YWJhc2UnXT47XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgZm9yIGNvbXBhcmUtdHVybnMgZGlmZjogJHtzZXNzaW9ufWAsIGVycik7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY29tcGFyZVVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShzZXNzaW9uKTtcblx0XHRcdGNvbnN0IFtvcmlnaW5hbEN1cnJlbnRSZWYsIG1vZGlmaWVkUGFpcl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmdldFR1cm5DaGVja3BvaW50UGFpcihzZXNzaW9uVXJpLCBvcmlnaW5hbFR1cm5JZCkudGhlbihwID0+IHA/LmN1cnJlbnQpLFxuXHRcdFx0XHR0aGlzLl9jaGVja3BvaW50U2VydmljZS5nZXRUdXJuQ2hlY2twb2ludFBhaXIoc2Vzc2lvblVyaSwgbW9kaWZpZWRUdXJuSWQpLFxuXHRcdFx0XSk7XG5cdFx0XHRpZiAoIW9yaWdpbmFsQ3VycmVudFJlZiB8fCAhbW9kaWZpZWRQYWlyKSB7XG5cdFx0XHRcdC8vIE9uZSBvZiB0aGUgdHVybnMgaGFzIG5vIGNoZWNrcG9pbnQgXHUyMDE0IGVpdGhlciBpdCdzIGFuXG5cdFx0XHRcdC8vIHVua25vd24gaWQsIHRoZSBzZXNzaW9uIGlzbid0IGdpdC1iYWNrZWQsIG9yIHRoZVxuXHRcdFx0XHQvLyBiYXNlbGluZSAvIGNhcHR1cmUgZmFpbGVkLiBObyBlZGl0LXRyYWNrZXIgZmFsbGJhY2tcblx0XHRcdFx0Ly8gZXhpc3RzIGZvciBiZXR3ZWVuLXR3by10dXJucyBjb21wYXJpc29ucy5cblx0XHRcdFx0Y29uc3QgbWlzc2luZyA9ICFvcmlnaW5hbEN1cnJlbnRSZWYgJiYgIW1vZGlmaWVkUGFpclxuXHRcdFx0XHRcdD8gJ2JvdGggdHVybnMnXG5cdFx0XHRcdFx0OiAhb3JpZ2luYWxDdXJyZW50UmVmXG5cdFx0XHRcdFx0XHQ/ICdvcmlnaW5hbCB0dXJuJ1xuXHRcdFx0XHRcdFx0OiAnbW9kaWZpZWQgdHVybic7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjb21wYXJlVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLCBtZXNzYWdlOiBgTm8gY2hlY2twb2ludCBhdmFpbGFibGUgZm9yICR7bWlzc2luZ307IGNvbXBhcmUgcmVxdWlyZXMgZ2l0LWJhY2tlZCBzZXNzaW9ucy5gIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gY29tcGFyZVVyaTtcblx0XHRcdH1cblx0XHRcdGlmIChvcmlnaW5hbEN1cnJlbnRSZWYgPT09IG1vZGlmaWVkUGFpci5jdXJyZW50KSB7XG5cdFx0XHRcdC8vIFNhbWUgZW5kcG9pbnQgb24gYm90aCBzaWRlcyBcdTIwMTQgZGlmZiBpcyBlbXB0eSBieVxuXHRcdFx0XHQvLyBjb25zdHJ1Y3Rpb24gKGNvdmVycyBjb21wYXJlKHR1cm4sIHR1cm4pIGFuZCB0aGUgbm8tb3Bcblx0XHRcdFx0Ly8gdHVybiBjYXNlIHdoZXJlIHR3byBhZGphY2VudCB0dXJucyBzaGFyZSBhIHJlZikuXG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2hDaGFuZ2VzZXREaWZmcyhzZXNzaW9uLCBjb21wYXJlVXJpLCBbXSk7XG5cdFx0XHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya2luZ0RpciA9IGF3YWl0IHRoaXMuX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pO1xuXHRcdFx0aWYgKCF3b3JraW5nRGlyKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjb21wYXJlVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLCBtZXNzYWdlOiAnTm8gd29ya2luZyBkaXJlY3RvcnkgcmVjb3JkZWQgZm9yIHNlc3Npb247IGNvbXBhcmUgcmVxdWlyZXMgZ2l0LWJhY2tlZCBzZXNzaW9ucy4nIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gY29tcGFyZVVyaTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMod29ya2luZ0Rpciwge1xuXHRcdFx0XHRzZXNzaW9uVXJpOiBzZXNzaW9uLFxuXHRcdFx0XHRmcm9tUmVmOiBvcmlnaW5hbEN1cnJlbnRSZWYsXG5cdFx0XHRcdHRvUmVmOiBtb2RpZmllZFBhaXIuY3VycmVudCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGRpZmZzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gYGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmc2AgcmV0dXJucyB1bmRlZmluZWQgdG8gc2lnbmFsIGFcblx0XHRcdFx0Ly8gZ2l0IGZhaWx1cmUgKG5vdCBhIGdpdCB3b3JrIHRyZWUsIGJhZCByZWYsIHRyYW5zcG9ydCBlcnJvcixcblx0XHRcdFx0Ly8gZXRjLikgYW5kIGFuIGVtcHR5IGFycmF5IHRvIHNpZ25hbCBcIm5vIGNoYW5nZXNcIi4gQ29sbGFwc2luZ1xuXHRcdFx0XHQvLyBib3RoIGludG8gW10gd291bGQgbWFzayByZWFsIGZhaWx1cmVzIGFzIGFuIGVtcHR5IFJlYWR5XG5cdFx0XHRcdC8vIHNuYXBzaG90IFx1MjAxNCBzdXJmYWNlIHRoZSBmYWlsdXJlIGV4cGxpY2l0bHkgaW5zdGVhZC5cblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNvbXBhcmVVcmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6IGBGYWlsZWQgdG8gY29tcHV0ZSBjb21wYXJlLXR1cm5zIGRpZmYgZnJvbSBnaXQgKCR7b3JpZ2luYWxDdXJyZW50UmVmfS4uJHttb2RpZmllZFBhaXIuY3VycmVudH0pLmAgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHVibGlzaENoYW5nZXNldERpZmZzKHNlc3Npb24sIGNvbXBhcmVVcmksIGRpZmZzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBjb21wdXRlIGNvbXBhcmUtdHVybnMgZGlmZnMgZm9yICR7c2Vzc2lvbn0vJHtvcmlnaW5hbFR1cm5JZH0vJHttb2RpZmllZFR1cm5JZH1gLCBlcnIpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNvbXBhcmVVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHR9XG5cblx0YXN5bmMgY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJKTogUHJvbWlzZTxQcm90b2NvbFVSST4ge1xuXHRcdGNvbnN0IHVuY29tbWl0dGVkVXJpID0gdGhpcy5fc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbikpO1xuXHRcdGlmICghdGhpcy5faGFzU3Vic2NyaXB0aW9uKHNlc3Npb24sIHVuY29tbWl0dGVkVXJpKSkge1xuXHRcdFx0cmV0dXJuIHVuY29tbWl0dGVkVXJpO1xuXHRcdH1cblxuXHRcdC8vIERlZmVyIHVudGlsIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyBrbm93bi4gQ29tcHV0aW5nIG5vdyB3b3VsZCBiYWlsXG5cdFx0Ly8gaW4gdGhlIGdpdCBwYXRoICh0aGVyZSBpcyBubyBTREsgZWRpdC10cmFja2VyIGZhbGxiYWNrIGZvciB0aGVcblx0XHQvLyB1bmNvbW1pdHRlZCBzbG90KTsgYG9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZWAgcmUtcnVucyB0aGUgcmVmcmVzaFxuXHRcdC8vIG9uY2UgbWF0ZXJpYWxpemF0aW9uIC8gcmVzdG9yZSBwb3B1bGF0ZXMgdGhlIGRpcmVjdG9yeS5cblx0XHRpZiAoIXRoaXMuX2hhc1dvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvbikpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uYWRkKHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHVuY29tbWl0dGVkVXJpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXR1c0JlZm9yZUNvbXB1dGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodW5jb21taXR0ZWRVcmkpPy5zdGF0dXM7XG5cdFx0aWYgKHN0YXR1c0JlZm9yZUNvbXB1dGUgIT09IENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmcpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1bmNvbW1pdHRlZFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkNvbXB1dGluZyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkaWZmcyA9IGF3YWl0IHRoaXMuX2NvbXB1dGVVbmNvbW1pdHRlZERpZmZzKHNlc3Npb24pO1xuXHRcdFx0aWYgKGRpZmZzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gR2l0IHVuYXZhaWxhYmxlIChubyB3b3JraW5nIGRpcmVjdG9yeSwgbm90IGEgZ2l0IHdvcmtcblx0XHRcdFx0Ly8gdHJlZSwgb3IgdGhlIGdpdCBjb21tYW5kIHJldHVybmVkIG5vdGhpbmcpLiBTdXJmYWNlIGFzXG5cdFx0XHRcdC8vIEVycm9yIHJhdGhlciB0aGFuIHByZXNlcnZpbmcgY2FjaGVkIHN0YXRlIFx1MjAxNCBubyBTREtcblx0XHRcdFx0Ly8gZWRpdC10cmFja2VyIGZhbGxiYWNrIGV4aXN0cyBmb3IgdGhlIHVuY29tbWl0dGVkIHNsb3QuXG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1bmNvbW1pdHRlZFVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogJ0ZhaWxlZCB0byBjb21wdXRlIHVuY29tbWl0dGVkIGRpZmYgZnJvbSBnaXQuJyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHVuY29tbWl0dGVkVXJpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wdWJsaXNoQ2hhbmdlc2V0RGlmZnMoc2Vzc2lvbiwgdW5jb21taXR0ZWRVcmksIGRpZmZzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBjb21wdXRlIHVuY29tbWl0dGVkIGRpZmZzIGZvciAke3Nlc3Npb259YCwgZXJyKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih1bmNvbW1pdHRlZFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5jb21taXR0ZWRVcmk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlVW5jb21taXR0ZWREaWZmcyhzZXNzaW9uOiBQcm90b2NvbFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgd29ya2luZ0RpcmVjdG9yeVVyaTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5VXJpID0gVVJJLnBhcnNlKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyh3b3JraW5nRGlyZWN0b3J5VXJpLCB7XG5cdFx0XHRzZXNzaW9uVXJpOiBzZXNzaW9uLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVR1cm5EaWZmc1ByZWZlckNoZWNrcG9pbnQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGRiOiBJU2Vzc2lvbkRhdGFiYXNlLCB0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdPiB7XG5cdFx0Y29uc3QgcGFpciA9IGF3YWl0IHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmdldFR1cm5DaGVja3BvaW50UGFpcihVUkkucGFyc2Uoc2Vzc2lvbiksIHR1cm5JZCk7XG5cdFx0aWYgKHBhaXIgJiYgcGFpci5wYXJlbnQgIT09IHBhaXIuY3VycmVudCkge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpciA9IGF3YWl0IHRoaXMuX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pO1xuXHRcdFx0aWYgKHdvcmtpbmdEaXIpIHtcblx0XHRcdFx0Y29uc3QgZnJvbVJlZkRpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMod29ya2luZ0Rpciwge1xuXHRcdFx0XHRcdHNlc3Npb25Vcmk6IHNlc3Npb24sXG5cdFx0XHRcdFx0ZnJvbVJlZjogcGFpci5wYXJlbnQsXG5cdFx0XHRcdFx0dG9SZWY6IHBhaXIuY3VycmVudCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChmcm9tUmVmRGlmZnMpIHtcblx0XHRcdFx0XHRyZXR1cm4gZnJvbVJlZkRpZmZzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChwYWlyICYmIHBhaXIucGFyZW50ID09PSBwYWlyLmN1cnJlbnQpIHtcblx0XHRcdC8vIEEgbm8tb3AgdHVybiBjaGVja3BvaW50IHJldXNlcyB0aGUgcGFyZW50IHJlZiAoc28gcGVyLXR1cm5cblx0XHRcdC8vIGRpZmYgaXMgZW1wdHkgYnkgY29uc3RydWN0aW9uKSBcdTIwMTQgc2hvcnQtY2lyY3VpdCB0byBhbiBlbXB0eVxuXHRcdFx0Ly8gbGlzdCBpbnN0ZWFkIG9mIGFza2luZyBnaXQgZm9yIHRoZSAoZW1wdHkpIGRpZmYuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdC8vIEZhbGxiYWNrOiBTREstdHJhY2tlZCBmaWxlX2VkaXRzIGFnZ3JlZ2F0b3IuXG5cdFx0cmV0dXJuIGNvbXB1dGVUdXJuRGlmZnMoc2Vzc2lvbiwgZGIsIHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSwgdHVybklkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb246IFByb3RvY29sVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBGb3IgdGhlIHRpbWUgYmVpbmcgd2UgZGVmYXVsdCB0byB0aGUgZmlyc3Qgd29ya2luZyBkaXJlY3RvcnkgaW4gdGhlIGxpc3QsIGlmIGFueS5cblx0XHQvLyBJbiB0aGUgZnV0dXJlIHdlIG1heSB3YW50IHRvIHN1cHBvcnQgbXVsdGlwbGUgd29ya2luZyBkaXJlY3RvcmllcyBwZXIgc2Vzc2lvbixcblx0XHQvLyBidXQgZm9yIG5vdyB3ZSBvbmx5IHN1cHBvcnQgb25lLlxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKTtcblx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yaWVzICYmIHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPiAwXG5cdFx0XHQ/IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3JpZXNbMF0pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIC0tLS0gTGlmZWN5Y2xlIGhvb2tzIGludm9rZWQgYnkgQWdlbnRTaWRlRWZmZWN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdG9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2NoZWR1bGVEZWJvdW5jZWREaWZmQ29tcHV0YXRpb24oc2Vzc2lvbiwgdHVybklkKTtcblx0XHQvLyBQZXItdHVybiBVUklzIGhhdmUgbm8gY2F0YWxvZ3VlIGNoaXAgYWdncmVnYXRlcywgc28gc2tpcCB0aGVcblx0XHQvLyByZWNvbXB1dGUgZW50aXJlbHkgd2hlbiBubyBjbGllbnQgaXMgb2JzZXJ2aW5nIHRoaXMgdHVybi4gVGhlXG5cdFx0Ly8gbmV4dCBzdWJzY3JpYmVyIHdpbGwgZ2V0IGEgZnJlc2ggc25hcHNob3QgZnJvbVxuXHRcdC8vIGB0cnlIYW5kbGVTdWJzY3JpYmUgXHUyMTkyIGNvbXB1dGVUdXJuQ2hhbmdlc2V0YC5cblx0XHRpZiAodGhpcy5faGFzU3Vic2NyaXB0aW9uKHNlc3Npb24sIGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uLCB0dXJuSWQpKSkge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVEZWJvdW5jZWRUdXJuRGlmZkNvbXB1dGF0aW9uKHNlc3Npb24sIHR1cm5JZCk7XG5cdFx0fVxuXHR9XG5cblx0b25UdXJuQ29tcGxldGUoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gT3JkZXJpbmcgbWF0dGVycyBmb3IgY2FuY2VsbGF0aW9uOiBjYW5jZWwgYW55IHBlbmRpbmcgbWlkLXR1cm5cblx0XHQvLyBkZWJvdW5jZXMgZmlyc3Qgc28gdGhlIGZpbmFsIHR1cm4tY29tcGxldGUgY29tcHV0ZXMgc3VwZXJzZWRlXG5cdFx0Ly8gdGhlbS4gQWZ0ZXIgdGhhdCwgc2NoZWR1bGUgdGhlIGZpbmFsIHJlY29tcHV0ZXMgZm9yIHRoZSB0dXJuXG5cdFx0Ly8gKHdoZW4gb2JzZXJ2ZWQpLCB0aGUgc2Vzc2lvbi13aWRlIGNoYW5nZXNldCB3aXRoIHRoZSBjaGFuZ2VkXG5cdFx0Ly8gdHVybiBpZCwgYW5kIHRoZSB1bmNvbW1pdHRlZCBjaGFuZ2VzZXQgd2hlbiBpdCBpcyBvYnNlcnZlZC5cblx0XHR0aGlzLl9jYW5jZWxEZWJvdW5jZWREaWZmQ29tcHV0YXRpb24oc2Vzc2lvbik7XG5cdFx0aWYgKHR1cm5JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9jYW5jZWxEZWJvdW5jZWRUdXJuRGlmZkNvbXB1dGF0aW9uKHNlc3Npb24sIHR1cm5JZCk7XG5cdFx0XHRpZiAodGhpcy5faGFzU3Vic2NyaXB0aW9uKHNlc3Npb24sIGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uLCB0dXJuSWQpKSkge1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZVR1cm5SZWNvbXB1dGUoc2Vzc2lvbiwgdHVybklkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5faGFzU3Vic2NyaXB0aW9uKHNlc3Npb24sIGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbikpKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVVuY29tbWl0dGVkUmVjb21wdXRlKHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb24sICdicmFuY2gnLCB0dXJuSWQpO1xuXHRcdHRoaXMuX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb24sICdzZXNzaW9uJywgdHVybklkKTtcblx0fVxuXG5cdG9uU2Vzc2lvblRydW5jYXRlZChzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdC8vIFR1cm5zIHdlcmUgcmVtb3ZlZCBcdTIwMTQgcmVjb21wdXRlIGZyb20gc2NyYXRjaCAobm8gY2hhbmdlZFR1cm5JZCkuXG5cdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ2JyYW5jaCcpO1xuXHRcdHRoaXMuX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb24sICdzZXNzaW9uJyk7XG5cdH1cblxuXHQvLyAtLS0tIEludGVybmFsIGNvbXB1dGUgcGlwZWxpbmUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogU2NoZWR1bGVzIGEgZGVib3VuY2VkIHNlc3Npb24tY2hhbmdlc2V0IHJlY29tcHV0YXRpb24uIFVuY29tbWl0dGVkXG5cdCAqIHJlY29tcHV0ZXMgcmlkZSB0aGUgc2FtZSB0dXJuLWNvbXBsZXRlIHBhdGg7IG1pZC10dXJuIGRlYm91bmNlIG9ubHlcblx0ICogbWFrZXMgc2Vuc2UgZm9yIHRoZSBTREstdHJhY2tlZCBzZXNzaW9uLXdpZGUgZGlmZiAod2hpY2ggc2VlcyBmcmVzaFxuXHQgKiBgdG9vbF9jb21wbGV0ZWAgZXZlbnRzIGJldHdlZW4gdHVybiBib3VuZGFyaWVzKS5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlRGVib3VuY2VkRGlmZkNvbXB1dGF0aW9uKHNlc3Npb246IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2RlYm91bmNlZERpZmZUaW1lcnMuc2V0KHNlc3Npb24sIGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RlYm91bmNlZERpZmZUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uKTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb24sICdicmFuY2gnLCB0dXJuSWQpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ3Nlc3Npb24nLCB0dXJuSWQpO1xuXHRcdH0sIEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuX0RJRkZfREVCT1VOQ0VfTVMpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGFueSBwZW5kaW5nIGRlYm91bmNlZCBkaWZmIGNvbXB1dGF0aW9uIGZvciBhIHNlc3Npb24uXG5cdCAqIENhbGxlZCBhdCB0dXJuIGVuZCBiZWZvcmUgdGhlIGZpbmFsIChub24tZGVib3VuY2VkKSBjb21wdXRhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2NhbmNlbERlYm91bmNlZERpZmZDb21wdXRhdGlvbihzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2RlYm91bmNlZERpZmZUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTY2hlZHVsZXMgYSBkZWJvdW5jZWQgcGVyLXR1cm4gY2hhbmdlc2V0IHJlY29tcHV0YXRpb24uIE1pcnJvcnNcblx0ICoge0BsaW5rIF9zY2hlZHVsZURlYm91bmNlZERpZmZDb21wdXRhdGlvbn0gYnV0IHVzZXMgYSBwZXItXG5cdCAqIGAoc2Vzc2lvbiwgdHVybklkKWAgbWFwIGtleSBzbyBhIGxvbmctcnVubmluZyBwZXItdHVybiBjb21wdXRlXG5cdCAqIGRvZXNuJ3QgYmxvY2sgdGhlIHN0YXRpYyBzZXNzaW9uIHJlY29tcHV0ZSBwYXRoIChhbmQgdmljZSB2ZXJzYSkuXG5cdCAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZURlYm91bmNlZFR1cm5EaWZmQ29tcHV0YXRpb24oc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7c2Vzc2lvbn1cXHUwMDAwJHt0dXJuSWR9YDtcblx0XHR0aGlzLl9wZXJUdXJuRGVib3VuY2VkRGlmZlRpbWVycy5zZXQoa2V5LCBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZXJUdXJuRGVib3VuY2VkRGlmZlRpbWVycy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVR1cm5SZWNvbXB1dGUoc2Vzc2lvbiwgdHVybklkKTtcblx0XHR9LCBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLl9ESUZGX0RFQk9VTkNFX01TKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VscyBhbnkgcGVuZGluZyBkZWJvdW5jZWQgcGVyLXR1cm4gZGlmZiBjb21wdXRhdGlvbiBmb3IgYVxuXHQgKiBgKHNlc3Npb24sIHR1cm5JZClgLiBDYWxsZWQgYXQgdHVybiBlbmQgYmVmb3JlIHRoZSBmaW5hbFxuXHQgKiAobm9uLWRlYm91bmNlZCkgcGVyLXR1cm4gY29tcHV0YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9jYW5jZWxEZWJvdW5jZWRUdXJuRGlmZkNvbXB1dGF0aW9uKHNlc3Npb246IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3BlclR1cm5EZWJvdW5jZWREaWZmVGltZXJzLmRlbGV0ZUFuZERpc3Bvc2UoYCR7c2Vzc2lvbn1cXHUwMDAwJHt0dXJuSWR9YCk7XG5cdH1cblxuXHQvKipcblx0ICogUXVldWVzIGEgcGVyLXR1cm4gcmVjb21wdXRlIG9uIGEgcGVyLWAoc2Vzc2lvbiwgdHVybklkKWAgc2VxdWVuY2VyXG5cdCAqIGtleSBzbyBiYWNrLXRvLWJhY2sgcmVjb21wdXRlcyBmb3IgdGhlIHNhbWUgdHVybiBzZXJpYWxpc2UsIGJ1dFxuXHQgKiByZWNvbXB1dGVzIGZvciBkaWZmZXJlbnQgdHVybnMgKG9yIGZvciB0aGUgc3RhdGljIGBzZXNzaW9uYCAvXG5cdCAqIGB1bmNvbW1pdHRlZGAgc2xvdHMpIHJ1biBpbmRlcGVuZGVudGx5LiBGaXJlLWFuZC1mb3JnZXQgXHUyMDE0IGZhaWx1cmVzXG5cdCAqIGFyZSBsb2dnZWQgaW5zaWRlIGBjb21wdXRlVHVybkNoYW5nZXNldGAgYW5kIGRvIG5vdCBmYWlsIHRoZSB0dXJuLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVUdXJuUmVjb21wdXRlKHNlc3Npb246IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2RpZmZDb21wdXRhdGlvblNlcXVlbmNlci5xdWV1ZShgJHtzZXNzaW9ufVxcdTAwMDB0dXJuXFx1MDAwMCR7dHVybklkfWAsICgpID0+IHRoaXMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbiwgdHVybklkKS50aGVuKCgpID0+IHVuZGVmaW5lZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVVbmNvbW1pdHRlZFJlY29tcHV0ZShzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2RpZmZDb21wdXRhdGlvblNlcXVlbmNlci5xdWV1ZShgJHtzZXNzaW9ufVxcdTAwMDB1bmNvbW1pdHRlZGAsICgpID0+IHRoaXMuY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb24pLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSk7XG5cdH1cblxuXHQvKipcblx0ICogU2NoZWR1bGVzIGEgc3RhdGljIGNoYW5nZXNldCAoYHVuY29tbWl0dGVkYCBvciBgc2Vzc2lvbmApIHJlY29tcHV0ZSxcblx0ICogc2VyaWFsaXNlZCBwZXItc2Vzc2lvbiBzbyBiYWNrLXRvLWJhY2sgdHJpZ2dlcnMgZG9uJ3QgcmFjZSBhZ2FpbnN0XG5cdCAqIHN0YWxlIGBwcmV2aW91c0RpZmZzYCByZWFkcy4gRmlyZS1hbmQtZm9yZ2V0IFx1MjAxNCBmYWlsdXJlcyBhcmUgbG9nZ2VkXG5cdCAqIGJ1dCBkbyBub3QgZmFpbCB0aGUgdHVybi5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb246IFByb3RvY29sVVJJLCBraW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kLCBjaGFuZ2VkVHVybklkPzogc3RyaW5nLCBzdGF0dXNCZWZvcmVSZWZyZXNoPzogQ2hhbmdlc2V0U3RhdHVzKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlmZkNvbXB1dGF0aW9uU2VxdWVuY2VyLnF1ZXVlKGAke3Nlc3Npb259XFx1MDAwMCR7a2luZH1gLCAoKSA9PiB0aGlzLl9kb0NvbXB1dGVTdGF0aWNDaGFuZ2VzZXQoc2Vzc2lvbiwga2luZCwgY2hhbmdlZFR1cm5JZCwgc3RhdHVzQmVmb3JlUmVmcmVzaCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1N0YXRpY0NoYW5nZXNldENvbXB1dGluZyhzZXNzaW9uOiBQcm90b2NvbFVSSSwga2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCk6IENoYW5nZXNldFN0YXR1cyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gc3RhdGljQ2hhbmdlc2V0VXJpKHNlc3Npb24sIGtpbmQpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmkpPy5zdGF0dXM7XG5cdFx0aWYgKHN0YXR1cyAhPT0gQ2hhbmdlc2V0U3RhdHVzLkNvbXB1dGluZykge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkNvbXB1dGluZyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdHVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9Db21wdXRlU3RhdGljQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJLCBraW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kLCBjaGFuZ2VkVHVybklkPzogc3RyaW5nLCBzdGF0dXNCZWZvcmVSZWZyZXNoPzogQ2hhbmdlc2V0U3RhdHVzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gc3RhdGljQ2hhbmdlc2V0VXJpKHNlc3Npb24sIGtpbmQpO1xuXHRcdHRoaXMuX2FjdGl2ZVN0YXRpY0NvbXB1dGVzLmFkZChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHN0YXR1c0JlZm9yZUNvbXB1dGUgPSBzdGF0dXNCZWZvcmVSZWZyZXNoID8/IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmkpPy5zdGF0dXM7XG5cdFx0bGV0IHJlZjogUmV0dXJuVHlwZTxJU2Vzc2lvbkRhdGFTZXJ2aWNlWydvcGVuRGF0YWJhc2UnXT47XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgZm9yICR7a2luZH0gZGlmZiBjb21wdXRhdGlvbjogJHtzZXNzaW9ufWAsIGVycik7XG5cdFx0XHR0aGlzLl9yZXN0b3JlU3RhdGljQ2hhbmdlc2V0U3RhdHVzKGNoYW5nZXNldFVyaSwgc3RhdHVzQmVmb3JlQ29tcHV0ZSk7XG5cdFx0XHR0aGlzLl9hY3RpdmVTdGF0aWNDb21wdXRlcy5kZWxldGUoY2hhbmdlc2V0VXJpKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5vbkNoYW5nZXNldExpdmVuZXNzQ2hhbmdlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHR0cnkge1xuXHRcdFx0bGV0IGRpZmZzID0gYXdhaXQgdGhpcy5fdHJ5Q29tcHV0ZUdpdERpZmZzKHNlc3Npb24sIHJlZi5vYmplY3QsIGtpbmQpO1xuXHRcdFx0aWYgKCFkaWZmcykge1xuXHRcdFx0XHRpZiAoa2luZCA9PT0gJ2JyYW5jaCcpIHtcblx0XHRcdFx0XHQvLyBCcmFuY2ggY2hhbmdlc2V0IGFuc3dlcnMgYSBkaWZmZXJlbnQgcXVlc3Rpb24gdGhhbiB0aGVcblx0XHRcdFx0XHQvLyBlZGl0LXRyYWNrZXIgYWdncmVnYXRvciBcdTIwMTQgZG8gbm90IGZhbGwgYmFjay4gUHJlc2VydmVcblx0XHRcdFx0XHQvLyB3aGF0ZXZlciBjYWNoZWQgc3RhdGUgaXMgYWxyZWFkeSB0aGVyZS5cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gQnJhbmNoIGdpdCBkaWZmIHVuYXZhaWxhYmxlIGZvciAke3Nlc3Npb259OyBwcmVzZXJ2aW5nIGNhY2hlZCBjaGFuZ2VzZXQuIHByZXZpb3VzU3RhdHVzPSR7c3RhdHVzQmVmb3JlQ29tcHV0ZSA/PyAndW5rbm93bid9IGNhY2hlZEZpbGVzPSR7dGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/LmZpbGVzLmxlbmd0aCA/PyAwfWApO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3RvcmVTdGF0aWNDaGFuZ2VzZXRTdGF0dXMoY2hhbmdlc2V0VXJpLCBzdGF0dXNCZWZvcmVDb21wdXRlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gYHNlc3Npb25gIGtpbmQ6IHdvcmtpbmctdHJlZSBnaXQgaXMgdW5hdmFpbGFibGUgKG5vXG5cdFx0XHRcdC8vIHdvcmtpbmcgZGlyIG9yIG5vdCBhIGdpdCB3b3JrIHRyZWUpLiBGYWxsIGJhY2sgdG8gdGhlXG5cdFx0XHRcdC8vIGVkaXQtdHJhY2tlciBhZ2dyZWdhdG9yIFx1MjAxNCBmb3IgdGhlIHNlc3Npb24gY2hhbmdlc2V0IHRoZVxuXHRcdFx0XHQvLyBTREstdHJhY2tlZCBlZGl0cyBhcmUgdGhlIGJlc3QgYXZhaWxhYmxlIGFwcHJveGltYXRpb24uXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIEluIG11bHRpLWNoYXQgc2Vzc2lvbnMgZWFjaCBwZWVyIGNoYXQgcmVjb3JkcyBpdHMgZmlsZVxuXHRcdFx0XHQvLyBlZGl0cyBpbnRvIGl0cyBPV04gZGF0YWJhc2UgKHRoZSBjaGF0IFVSSSBpcyB1c2VkIGFzIHRoZVxuXHRcdFx0XHQvLyBzZXNzaW9uIFVSSSBmb3IgdGhhdCBjaGF0J3MgZWRpdCB0cmFja2VyKS4gVW5pb24gdGhlXG5cdFx0XHRcdC8vIHNlc3Npb24gREIgd2l0aCBldmVyeSBwZWVyIGNoYXQgREIgc28gcGVlci1jaGF0IGVkaXRzIHJvbGxcblx0XHRcdFx0Ly8gdXAgaW50byB0aGUgc2Vzc2lvbi1sZXZlbCBjaGFuZ2VzLlxuXHRcdFx0XHRjb25zdCBwZWVyU291cmNlcyA9IHRoaXMuX29wZW5QZWVyQ2hhdFNvdXJjZXMoc2Vzc2lvbik7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKHBlZXJTb3VyY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZXM6IElTZXNzaW9uRGlmZlNvdXJjZVtdID0gW1xuXHRcdFx0XHRcdFx0XHR7IHNlc3Npb25Vcmk6IHNlc3Npb24sIGRiOiByZWYub2JqZWN0IH0sXG5cdFx0XHRcdFx0XHRcdC4uLnBlZXJTb3VyY2VzLm1hcChwID0+ICh7IHNlc3Npb25Vcmk6IHAuc2Vzc2lvblVyaSwgZGI6IHAucmVmLm9iamVjdCB9KSksXG5cdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdFx0Ly8gVE9ETyAoZGVidCk6IG11bHRpLWNoYXQgYWx3YXlzIGRvZXMgYSBmdWxsIHJlY29tcHV0ZVxuXHRcdFx0XHRcdFx0Ly8gKHRoZSBpbmNyZW1lbnRhbCBgY2hhbmdlZFR1cm5JZGAvYHByZXZpb3VzRGlmZnNgIHBhdGggaXNcblx0XHRcdFx0XHRcdC8vIG9ubHkgdXNlZCBmb3Igc2luZ2xlLWNoYXQgYmVsb3cpLiBBIGZvbGxvdy11cCBjYW4gbWFrZVxuXHRcdFx0XHRcdFx0Ly8gYGNvbXB1dGVVbmlvbmVkRGlmZnNgIGluY3JlbWVudGFsIFx1MjAxNCBzZWUgaXRzIGRvYyBjb21tZW50XG5cdFx0XHRcdFx0XHQvLyBhbmQgdGhlIHRyYWNraW5nIGlzc3VlLlxuXHRcdFx0XHRcdFx0ZGlmZnMgPSBhd2FpdCBjb21wdXRlVW5pb25lZERpZmZzKHNvdXJjZXMsIHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxldCBpbmNyZW1lbnRhbDogSUluY3JlbWVudGFsRGlmZk9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoY2hhbmdlZFR1cm5JZCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcmV2aW91c0RpZmZzID0gdGhpcy5fcmVhZFByZXZpb3VzQ2hhbmdlc2V0RGlmZnMoY2hhbmdlc2V0VXJpKTtcblx0XHRcdFx0XHRcdFx0aWYgKHByZXZpb3VzRGlmZnMpIHtcblx0XHRcdFx0XHRcdFx0XHRpbmNyZW1lbnRhbCA9IHsgY2hhbmdlZFR1cm5JZCwgcHJldmlvdXNEaWZmczogWy4uLnByZXZpb3VzRGlmZnNdIH07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGRpZmZzID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhzZXNzaW9uLCByZWYub2JqZWN0LCB0aGlzLl9kaWZmQ29tcHV0ZVNlcnZpY2UsIGluY3JlbWVudGFsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwZWVyIG9mIHBlZXJTb3VyY2VzKSB7XG5cdFx0XHRcdFx0XHRwZWVyLnJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJldmlld2VkID0ga2luZCA9PT0gQ2hhbmdlc2V0S2luZC5CcmFuY2hcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl9jb21wdXRlUmV2aWV3ZWRJbmZvKHNlc3Npb24sIHJlZi5vYmplY3QpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcHVibGlzaENoYW5nZXNldERpZmZzKHNlc3Npb24sIGNoYW5nZXNldFVyaSwgZGlmZnMsIHJldmlld2VkKTtcblxuXHRcdFx0Ly8gUGVyc2lzdCB0aGUgZmlsZSBsaXN0IHNvIGEgc3Vic2VxdWVudCBgbGlzdFNlc3Npb25zYCAvXG5cdFx0XHQvLyBgcmVzdG9yZVNlc3Npb25gIGNhbiByZXNlZWQgdGhlIGNoYW5nZXNldCBiZWZvcmUgdGhlIGZpcnN0XG5cdFx0XHQvLyBwb3N0LXJlc3RhcnQgY29tcHV0ZSBjb21wbGV0ZXMuXG5cdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoc2Vzc2lvbiwgcGVyc2lzdEtleUZvcihraW5kKSwgSlNPTi5zdHJpbmdpZnkoZGlmZnMpKTtcblxuXHRcdFx0aWYgKGtpbmQgPT09IENoYW5nZXNldEtpbmQuQnJhbmNoKSB7XG5cdFx0XHRcdC8vIE1pZ3JhdGlvbjogYWxzbyBvdmVyd3JpdGUgdGhlIGxlZ2FjeSBgJ2RpZmZzJ2Aga2V5IHdpdGggdGhlXG5cdFx0XHRcdC8vIHNlc3Npb24tY2hhbmdlc2V0IHBheWxvYWQgc28gb2xkZXIgcmVhZGVycyBzdGF5IGNvcnJlY3Rcblx0XHRcdFx0Ly8gZHVyaW5nIHRoZSByb2xsb3V0IHdpbmRvdy5cblx0XHRcdFx0dGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKHNlc3Npb24sIE1FVEFfTEVHQUNZX0RJRkZTLCBKU09OLnN0cmluZ2lmeShkaWZmcykpO1xuXG5cdFx0XHRcdC8vIFBlcnNpc3QgdGhlIGNoYW5nZXMgc3VtbWFyeSBhbmQgdXBkYXRlIHRoZSBpbi1tZW1vcnkgc2Vzc2lvblxuXHRcdFx0XHQvLyBzdW1tYXJ5IGZyb20gdGhlIEJSQU5DSCBjaGFuZ2VzZXQuIFRoZSBzZXNzaW9uLWxpc3QgY2hpcCBhbmQgdGhlXG5cdFx0XHRcdC8vIGluYWN0aXZlLXNlc3Npb24gYWdncmVnYXRlIChgY29tcHV0ZUxpc3RFbnRyeUNoYW5nZXNgKSByZWFkIHRoZVxuXHRcdFx0XHQvLyBicmFuY2ggY2hhbmdlc2V0LCBhcyBkb2VzIHRoZSBhY3RpdmUgc2Vzc2lvbiB2aWV3LCBzbyBzb3VyY2luZ1xuXHRcdFx0XHQvLyB0aGUgcGVyc2lzdGVkIHN1bW1hcnkgZnJvbSB0aGUgc2FtZSBwbGFjZSBrZWVwcyB0aGUgY291bnQgc3RhYmxlXG5cdFx0XHRcdC8vIGFjcm9zcyB0aGUgYWN0aXZlIDwtPiBpbmFjdGl2ZSB0cmFuc2l0aW9uIGluc3RlYWQgb2YgZmxpcHBpbmcgdG9cblx0XHRcdFx0Ly8gdGhlIChkaWZmZXJlbnQpIHNlc3Npb24gY2hhbmdlc2V0J3MgY291bnQuXG5cdFx0XHRcdGNvbnN0IGNoYW5nZXNTdW1tYXJ5ID0gc3VtbWFyaXNlRGlmZnMoZGlmZnMpID8/IHsgYWRkaXRpb25zOiAwLCBkZWxldGlvbnM6IDAsIGZpbGVzOiAwIH07XG5cdFx0XHRcdHRoaXMucGVyc2lzdENoYW5nZXNTdW1tYXJ5KHNlc3Npb24sIGNoYW5nZXNTdW1tYXJ5KTtcblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25TdW1tYXJ5Q2hhbmdlcyhzZXNzaW9uLCBjaGFuZ2VzU3VtbWFyeSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gY29tcHV0ZSAke2tpbmR9IGRpZmZzYCwgZXJyKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2FjdGl2ZVN0YXRpY0NvbXB1dGVzLmRlbGV0ZShjaGFuZ2VzZXRVcmkpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLm9uQ2hhbmdlc2V0TGl2ZW5lc3NDaGFuZ2VkKCk7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWZyZXNoIHJlcXVlc3RzIG9wdGltaXN0aWNhbGx5IG1hcmsgc3RhdGljIGNoYW5nZXNldHMgYXMgQ29tcHV0aW5nXG5cdCAqIHdoaWxlIHByZXNlcnZpbmcgdGhlaXIgY3VycmVudCBmaWxlcy4gU29tZSByZWZyZXNoIHBhdGhzIGludGVudGlvbmFsbHlcblx0ICogZG8gbm90IHB1Ymxpc2ggYSByZXBsYWNlbWVudCBmaWxlIGxpc3QgKGZvciBleGFtcGxlLCB1bmNvbW1pdHRlZCBnaXRcblx0ICogZGlmZiBpcyB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZSksIHNvIHJlc3RvcmUgdGhlIHByZXZpb3VzIG5vbi1jb21wdXRpbmdcblx0ICogc3RhdHVzIGluc3RlYWQgb2YgbGVhdmluZyBhIHN0YWxlIGNhY2hlZCBzbmFwc2hvdCBzdHVjayBhcyBDb21wdXRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXN0b3JlU3RhdGljQ2hhbmdlc2V0U3RhdHVzKGNoYW5nZXNldFVyaTogUHJvdG9jb2xVUkksIHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFzdGF0dXMgfHwgc3RhdHVzID09PSBDaGFuZ2VzZXRTdGF0dXMuQ29tcHV0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdHN0YXR1cyxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgcHJldmlvdXMgZGlmZiBsaXN0IGJhY2sgb3V0IG9mIHRoZSBjaGFuZ2VzZXQgc3RhdGUgc28gdGhlXG5cdCAqIGluY3JlbWVudGFsIGFnZ3JlZ2F0b3IgY2FuIGF2b2lkIHJlY29tcHV0aW5nIGZpbGVzIHRoYXQgaGF2ZW4ndFxuXHQgKiBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVhZFByZXZpb3VzQ2hhbmdlc2V0RGlmZnMoY2hhbmdlc2V0VXJpOiBQcm90b2NvbFVSSSk6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0VXJpKTtcblx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLmZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlLmZpbGVzLm1hcChmID0+IGYuZWRpdCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNsYXRlcyB0aGUgbmV3IGZpbGUgbGlzdCBpbnRvIGEgc2VxdWVuY2Ugb2YgY2hhbmdlc2V0LyogYWN0aW9uc1xuXHQgKiAoZmlsZVNldCwgZmlsZVJlbW92ZWQpIGFuZCBtb3ZlcyB0aGUgY2hhbmdlc2V0IHRvIGByZWFkeWAgb25jZSB0aGVcblx0ICogZnJlc2ggZmlsZSBsaXN0IGhhcyBiZWVuIGFwcGxpZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9wdWJsaXNoQ2hhbmdlc2V0RGlmZnMoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGNoYW5nZXNldFVyaTogUHJvdG9jb2xVUkksIGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10sIHJldmlld2VkPzogeyByZWFkb25seSByZXBvUm9vdDogVVJJOyByZWFkb25seSBwYXRoczogUmVhZG9ubHlTZXQ8c3RyaW5nPiB9KTogdm9pZCB7XG5cdFx0Ly8gR2V0IHRoZSBhdmFpbGFibGUgb3BlcmF0aW9ucyBmb3IgdGhpcyBjaGFuZ2VzZXQuIFRoaXMgY2FsbCBhc3N1bWVzIHRoYXQgYXQgdGhpcyBwb2ludFxuXHRcdC8vIHRoZSBnaXQgc3RhdGUgb2YgdGhlIHNlc3Npb24gaXMgdXAtdG8tZGF0ZSBhcyBpdCBpcyBiZWluZyB1c2VkIHRvIGRldGVybWluZSB0aGUgYXZhaWxhYmxlXG5cdFx0Ly8gb3BlcmF0aW9ucy4gTG9uZyB0ZXJtIHRoaXMgc2hvdWxkIGJlIHJlcGxhY2VkIHdpdGggYSBtb3JlIHJvYnVzdCBtZWNoYW5pc20uXG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHRoaXMuX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuZ2V0T3BlcmF0aW9ucyhzZXNzaW9uLCBjaGFuZ2VzZXRVcmkpO1xuXG5cdFx0Y29uc3QgZmlsZXM6IENoYW5nZXNldEZpbGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBkaWZmcykge1xuXHRcdFx0Y29uc3QgaWQgPSBlZGl0LmFmdGVyPy51cmkgPz8gZWRpdC5iZWZvcmU/LnVyaTtcblx0XHRcdGlmICghaWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmV2aWV3ZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVsUGF0aCA9IHJlbGF0aXZlUGF0aChyZXZpZXdlZC5yZXBvUm9vdCwgVVJJLnBhcnNlKGlkKSk7XG5cdFx0XHRcdGZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdGlkLCBlZGl0LFxuXHRcdFx0XHRcdHJldmlld2VkOiByZWxQYXRoXG5cdFx0XHRcdFx0XHQ/IHJldmlld2VkLnBhdGhzLmhhcyhyZWxQYXRoKVxuXHRcdFx0XHRcdFx0OiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZpbGVzLnB1c2goeyBpZCwgZWRpdCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0ZmlsZXMsXG5cdFx0XHRvcGVyYXRpb25zOiBvcGVyYXRpb25zXG5cdFx0XHRcdD8gWy4uLm9wZXJhdGlvbnNdXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0Ly8gTW92ZSB0aGUgY2hhbmdlc2V0IG91dCBvZiBgY29tcHV0aW5nYCAob3Igb3V0IG9mIGFuIGVhcmxpZXIgZXJyb3IpXG5cdFx0Ly8gbm93IHRoYXQgd2UgaGF2ZSBhIGZyZXNoLCBjb21wbGV0ZSBmaWxlIGxpc3QuXG5cdFx0Y29uc3Qgc3RhdHVzID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/LnN0YXR1cztcblx0XHRpZiAoc3RhdHVzICE9PSBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgZGF0YWJhc2VzIGZvciBldmVyeSBub24tZGVmYXVsdCAocGVlcikgY2hhdCBpbiBhIG11bHRpLWNoYXRcblx0ICogc2Vzc2lvbi4gRWFjaCBwZWVyIGNoYXQgcmVjb3JkcyBpdHMgZmlsZSBlZGl0cyBpbnRvIGl0cyBvd24gZGF0YWJhc2Vcblx0ICoga2V5ZWQgYnkgdGhlIGNoYXQgVVJJLCBzbyB0aGUgc2Vzc2lvbiBjaGFuZ2VzZXQgbXVzdCB1bmlvbiB0aG9zZVxuXHQgKiBkYXRhYmFzZXMgd2l0aCB0aGUgc2Vzc2lvbiBEQi4gUmV0dXJucyBhbiBlbXB0eSBhcnJheSBmb3Igc2luZ2xlLWNoYXRcblx0ICogc2Vzc2lvbnMuIENhbGxlcnMgTVVTVCBkaXNwb3NlIGV2ZXJ5IHJldHVybmVkIGByZWZgLlxuXHQgKi9cblx0cHJpdmF0ZSBfb3BlblBlZXJDaGF0U291cmNlcyhzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHsgc2Vzc2lvblVyaTogUHJvdG9jb2xVUkk7IHJlZjogUmV0dXJuVHlwZTxJU2Vzc2lvbkRhdGFTZXJ2aWNlWydvcGVuRGF0YWJhc2UnXT4gfVtdIHtcblx0XHRjb25zdCBjaGF0cyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik/LmNoYXRzID8/IFtdO1xuXHRcdGNvbnN0IHNvdXJjZXM6IHsgc2Vzc2lvblVyaTogUHJvdG9jb2xVUkk7IHJlZjogUmV0dXJuVHlwZTxJU2Vzc2lvbkRhdGFTZXJ2aWNlWydvcGVuRGF0YWJhc2UnXT4gfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzKSB7XG5cdFx0XHRpZiAoaXNEZWZhdWx0Q2hhdFVyaShjaGF0LnJlc291cmNlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKGNoYXQucmVzb3VyY2UpKTtcblx0XHRcdFx0c291cmNlcy5wdXNoKHsgc2Vzc2lvblVyaTogY2hhdC5yZXNvdXJjZSwgcmVmIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHBlZXIgY2hhdCBkYXRhYmFzZSBmb3Igc2Vzc2lvbiBjaGFuZ2VzOiAke2NoYXQucmVzb3VyY2V9YCwgZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNvdXJjZXM7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgdHVybiBpZCB3aG9zZSBjaGVja3BvaW50IGJlc3QgcmVwcmVzZW50cyB0aGUgbGF0ZXN0IHN0YXRlIG9mXG5cdCAqIHRoZSBzZXNzaW9uJ3Mgc2hhcmVkIHdvcmtpbmcgdHJlZS4gRm9yIHNpbmdsZS1jaGF0IHNlc3Npb25zIHRoaXMgaXMgdGhlXG5cdCAqIGRlZmF1bHQgY2hhdCdzIGxhc3QgdHVybi4gRm9yIG11bHRpLWNoYXQgc2Vzc2lvbnMgaXQgaXMgdGhlIGxhc3QgdHVybiBvZlxuXHQgKiB0aGUgbW9zdC1yZWNlbnRseS1tb2RpZmllZCBjaGF0IChwZWVyLWNoYXQgdHVybiBjaGVja3BvaW50cyBhcmUgc3RvcmVkXG5cdCAqIHVuZGVyIHRoZSBzZXNzaW9uIFVSSSBrZXllZCBieSB0aGVpciB0dXJuIGlkKS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuXG5cdCAqIG5vIGNoYXQgaGFzIGFueSB0dXJucy5cblx0ICovXG5cdHByaXZhdGUgX2xhdGVzdFR1cm5JZEFjcm9zc0NoYXRzKHNlc3Npb246IFByb3RvY29sVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pO1xuXHRcdGlmICghc2Vzc2lvblN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRzID0gc2Vzc2lvblN0YXRlLmNoYXRzID8/IFtdO1xuXHRcdGlmIChjaGF0cy5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25TdGF0ZS50dXJucy5hdCgtMSk/LmlkO1xuXHRcdH1cblxuXHRcdGxldCBiZXN0VHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGJlc3RNb2RpZmllZEF0ID0gJyc7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzKSB7XG5cdFx0XHRjb25zdCB0dXJucyA9IGlzRGVmYXVsdENoYXRVcmkoY2hhdC5yZXNvdXJjZSlcblx0XHRcdFx0PyBzZXNzaW9uU3RhdGUudHVybnNcblx0XHRcdFx0OiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXQucmVzb3VyY2UpPy50dXJucztcblx0XHRcdGNvbnN0IGxhc3RUdXJuSWQgPSB0dXJucz8uYXQoLTEpPy5pZDtcblx0XHRcdGlmIChsYXN0VHVybklkICYmIGNoYXQubW9kaWZpZWRBdCA+PSBiZXN0TW9kaWZpZWRBdCkge1xuXHRcdFx0XHRiZXN0TW9kaWZpZWRBdCA9IGNoYXQubW9kaWZpZWRBdDtcblx0XHRcdFx0YmVzdFR1cm5JZCA9IGxhc3RUdXJuSWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBiZXN0VHVybklkO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGVzIGRpZmZzIGZvciBhIHN0YXRpYyBjaGFuZ2VzZXQgYnkgc2hlbGxpbmcgb3V0IHRvIGdpdC5cblx0ICogUmV0dXJucyB0aGUgZGlmZiBsaXN0IHdoZW4gdGhlIHNlc3Npb24gaGFzIGEgd29ya2luZyBkaXJlY3RvcnkgYW5kXG5cdCAqIHRoYXQgZGlyZWN0b3J5IGlzIGEgZ2l0IHdvcmsgdHJlZTsgcmV0dXJucyBgdW5kZWZpbmVkYCBvdGhlcndpc2Ugc29cblx0ICogdGhlIGNhbGxlciBjYW4gZmFsbCBiYWNrIHRvIHRoZSBlZGl0LXRyYWNrZXIgYWdncmVnYXRvciAoZm9yXG5cdCAqIGBraW5kOiAnc2Vzc2lvbidgKSBvciBwcmVzZXJ2ZSBjYWNoZWQgc3RhdGUgKGZvciBga2luZDogJ2JyYW5jaCdgKS5cblx0ICpcblx0ICogRm9yIGBraW5kOiAnc2Vzc2lvbidgIHRoZSBkaWZmIGlzIGNvbXB1dGVkIGJldHdlZW4gdGhlIGJhc2VsaW5lXG5cdCAqIGNoZWNrcG9pbnQgcmVmIGFuZCB0aGUgbGF0ZXN0IHR1cm4gY2hlY2twb2ludCByZWYuXG5cdCAqIEZvciBga2luZDogJ2JyYW5jaCdgIHRoZSBkaWZmIGlzIGNvbXB1dGVkIGFnYWluc3QgdGhlIG1lcmdlLWJhc2Vcblx0ICogd2l0aCB7QGxpbmsgTUVUQV9ESUZGX0JBU0VfQlJBTkNIfSB3aGVuIG9uZSBpcyBzZXQ7IHdpdGhvdXQgYSBiYXNlXG5cdCAqIGJyYW5jaCBnaXQgZmFsbHMgYmFjayB0byBgSEVBRGAuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF90cnlDb21wdXRlR2l0RGlmZnMoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGRiOiBJU2Vzc2lvbkRhdGFiYXNlLCBraW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCB3b3JraW5nRGlyZWN0b3J5VXJpOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnlVcmkgPSBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNlc3Npb25cblx0XHRpZiAoa2luZCA9PT0gJ3Nlc3Npb24nKSB7XG5cdFx0XHQvLyBHZXQgc2Vzc2lvbiBjaGVja3BvaW50cy4gSW4gbXVsdGktY2hhdCBzZXNzaW9ucyB0aGUgd29ya2luZyB0cmVlXG5cdFx0XHQvLyBpcyBzaGFyZWQgYW5kIGVhY2ggY2hhdCdzIHR1cm4gY2hlY2twb2ludHMgYXJlIHN0b3JlZCB1bmRlciB0aGVcblx0XHRcdC8vIHNlc3Npb24gVVJJIGtleWVkIGJ5IHRoZWlyIHR1cm4gaWQsIHNvIHRoZSBtb3N0LXJlY2VudGx5LW1vZGlmaWVkXG5cdFx0XHQvLyBjaGF0J3MgbGFzdCB0dXJuIGNhcHR1cmVzIHRoZSBmdWxsIHdvcmtpbmctdHJlZSBkZWx0YS5cblx0XHRcdGNvbnN0IGxhdGVzdFR1cm5JZCA9IHRoaXMuX2xhdGVzdFR1cm5JZEFjcm9zc0NoYXRzKHNlc3Npb24pO1xuXHRcdFx0aWYgKCFsYXRlc3RUdXJuSWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShzZXNzaW9uKTtcblx0XHRcdGNvbnN0IFtiYXNlbGluZSwgcGFpcl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmdldEJhc2VsaW5lQ2hlY2twb2ludChzZXNzaW9uVXJpKSxcblx0XHRcdFx0dGhpcy5fY2hlY2twb2ludFNlcnZpY2UuZ2V0VHVybkNoZWNrcG9pbnRQYWlyKHNlc3Npb25VcmksIGxhdGVzdFR1cm5JZCksXG5cdFx0XHRdKTtcblx0XHRcdGlmICghYmFzZWxpbmUgfHwgIXBhaXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzKHdvcmtpbmdEaXJlY3RvcnlVcmksIHtcblx0XHRcdFx0XHRzZXNzaW9uVXJpOiBzZXNzaW9uLFxuXHRcdFx0XHRcdGZyb21SZWY6IGJhc2VsaW5lLFxuXHRcdFx0XHRcdHRvUmVmOiBwYWlyLmN1cnJlbnRcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gZ2l0LWRyaXZlbiAke2tpbmR9IGRpZmYgY29tcHV0YXRpb24gZmFpbGVkOyBmYWxsaW5nIGJhY2sgdG8gZWRpdC10cmFja2VyYCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCcmFuY2hcblx0XHRjb25zdCBiYXNlQnJhbmNoID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJyYW5jaEJhc2VCcmFuY2goc2Vzc2lvbiwgZGIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKHdvcmtpbmdEaXJlY3RvcnlVcmksIHtcblx0XHRcdFx0c2Vzc2lvblVyaTogc2Vzc2lvbixcblx0XHRcdFx0YmFzZUJyYW5jaFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBnaXQtZHJpdmVuICR7a2luZH0gZGlmZiBjb21wdXRhdGlvbiBmYWlsZWQ7IGZhbGxpbmcgYmFjayB0byBlZGl0LXRyYWNrZXJgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIEJyYW5jaCBDaGFuZ2VzIGJhc2UgYnJhbmNoLCByZXVzZWQgYnkgdGhlIGRpZmYgY29tcHV0YXRpb25cblx0ICogYW5kIHRoZSByZXZpZXctc3RhdHVzIGxvb2t1cCBzbyBib3RoIGFyZSBrZXllZCBvbiB0aGUgc2FtZSBiYXNlbGluZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVCcmFuY2hCYXNlQnJhbmNoKHNlc3Npb246IFByb3RvY29sVVJJLCBkYjogSVNlc3Npb25EYXRhYmFzZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGVyc2lzdGVkQmFzZUJyYW5jaCA9IGF3YWl0IGRiLmdldE1ldGFkYXRhKE1FVEFfRElGRl9CQVNFX0JSQU5DSCk7XG5cdFx0Y29uc3QgZ2l0U3RhdGVCYXNlQnJhbmNoID0gcmVhZFNlc3Npb25HaXRTdGF0ZSh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy5fbWV0YSk/LmJhc2VCcmFuY2hOYW1lO1xuXHRcdGlmICghcGVyc2lzdGVkQmFzZUJyYW5jaCAmJiBnaXRTdGF0ZUJhc2VCcmFuY2gpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBVc2luZyBfbWV0YS5naXQgYmFzZSBicmFuY2ggZmFsbGJhY2sgZm9yIEJyYW5jaCBDaGFuZ2VzIGluICR7c2Vzc2lvbn06ICR7Z2l0U3RhdGVCYXNlQnJhbmNofWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzb2x2ZURpZmZCYXNlQnJhbmNoTmFtZShwZXJzaXN0ZWRCYXNlQnJhbmNoLCBnaXRTdGF0ZUJhc2VCcmFuY2gpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGVzIHRoZSByZXZpZXdlZC1wYXRocyBvdmVybGF5IGZvciB0aGUgQnJhbmNoIGNoYW5nZXNldDogdGhlXG5cdCAqIHJlcG9zaXRvcnkgcm9vdCAodXNlZCB0byBrZXkgZmlsZSBpZHMgdG8gcmVwby1yZWxhdGl2ZSBwYXRocykgYW5kIHRoZSBzZXRcblx0ICogb2YgcmV2aWV3ZWQgcmVwby1yZWxhdGl2ZSBwYXRocy4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGhhc1xuXHQgKiBubyBnaXQgd29ya2luZyBkaXJlY3RvcnkgKHJldmlldyBzdGF0dXMgaXMgdGhlbiBzaW1wbHkgb21pdHRlZCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlUmV2aWV3ZWRJbmZvKHNlc3Npb246IFByb3RvY29sVVJJLCBkYjogSVNlc3Npb25EYXRhYmFzZSk6IFByb21pc2U8eyByZWFkb25seSByZXBvUm9vdDogVVJJOyByZWFkb25seSBwYXRoczogUmVhZG9ubHlTZXQ8c3RyaW5nPiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgd29ya2luZ0RpcmVjdG9yeVVyaTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5VXJpID0gVVJJLnBhcnNlKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXBvUm9vdCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeVVyaSk7XG5cdFx0aWYgKCFyZXBvUm9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBiYXNlQnJhbmNoID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJyYW5jaEJhc2VCcmFuY2goc2Vzc2lvbiwgZGIpO1xuXHRcdGNvbnN0IHBhdGhzID0gYXdhaXQgdGhpcy5fcmV2aWV3U2VydmljZS5nZXRSZXZpZXdlZFBhdGhzKHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcnlVcmksIGJhc2VCcmFuY2gpO1xuXG5cdFx0cmV0dXJuIHsgcmVwb1Jvb3QsIHBhdGhzIH07XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgYSBzZXNzaW9uIG1ldGFkYXRhIGtleS92YWx1ZSBwYWlyIHRvIHRoZSBzZXNzaW9uIGRhdGFiYXNlLlxuXHQgKiBDb3VudGVycGFydCBpbiBgYWdlbnRTaWRlRWZmZWN0cy50c2AgKGBBZ2VudFNpZGVFZmZlY3RzLl9wZXJzaXN0U2Vzc2lvbkZsYWdgKTpcblx0ICoga2VlcCBib3RoIGNvcGllcyBpbiBzeW5jIGlmIHRoZSBzaWduYXR1cmUgY2hhbmdlcy4gRHVwbGljYXRlZCByYXRoZXJcblx0ICogdGhhbiBsaWZ0ZWQgYmVjYXVzZSB0aGUgdHdvIGNvbnN1bWVycyBwZXJzaXN0IGRpc2pvaW50IG1ldGFkYXRhXG5cdCAqIChjaGFuZ2VzZXQgZGlmZnMgaGVyZSB2cy4gY3VzdG9tVGl0bGUgLyBpc1JlYWQgLyBpc0FyY2hpdmVkIC9cblx0ICogY29uZmlnVmFsdWVzIHRoZXJlKSBhbmQgYSBzaGFyZWQgdXRpbCB3b3VsZCBvbmx5IGhhdmUgdHdvIGNhbGxlcnMuXG5cdCAqL1xuXHRwcml2YXRlIF9wZXJzaXN0U2Vzc2lvbkZsYWcoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdHJlZi5vYmplY3Quc2V0TWV0YWRhdGEoa2V5LCB2YWx1ZSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBwZXJzaXN0ICR7a2V5fWAsIGVycik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0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S0FBSyxjQUFjLGdCQUFnQixPQUFPLEdBQUcsS0FBSyxHQUFHO0FBQ3BHLFFBQUksQ0FBQyx1QkFBdUIsb0JBQW9CO0FBQy9DLFdBQUssWUFBWSxNQUFNLDBGQUEwRixPQUFPLEtBQUssa0JBQWtCLEVBQUU7QUFBQSxJQUNsSjtBQUNBLFdBQU8sMEJBQTBCLHFCQUFxQixrQkFBa0I7QUFBQSxFQUN6RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyxxQkFBcUIsU0FBc0IsSUFBNEc7QUFDcEssVUFBTSxtQkFBbUIsS0FBSyxjQUFjLGdCQUFnQixPQUFPLEdBQUcscUJBQXFCLENBQUM7QUFDNUYsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0gsNEJBQXNCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxJQUNqRCxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsTUFBTSxLQUFLLFlBQVksa0JBQWtCLG1CQUFtQjtBQUM3RSxRQUFJLENBQUMsVUFBVTtBQUNkLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxhQUFhLE1BQU0sS0FBSyx5QkFBeUIsU0FBUyxFQUFFO0FBQ2xFLFVBQU0sUUFBUSxNQUFNLEtBQUssZUFBZSxpQkFBaUIsU0FBUyxxQkFBcUIsVUFBVTtBQUVqRyxXQUFPLEVBQUUsVUFBVSxNQUFNO0FBQUEsRUFDMUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVUSxvQkFBb0IsU0FBc0IsS0FBYSxPQUFxQjtBQUNuRixVQUFNLE1BQU0sS0FBSyxvQkFBb0IsYUFBYSxJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQ3BFLFFBQUksT0FBTyxZQUFZLEtBQUssS0FBSyxFQUFFLE1BQU0sU0FBTztBQUMvQyxXQUFLLFlBQVksS0FBSyxpREFBaUQsR0FBRyxJQUFJLEdBQUc7QUFBQSxJQUNsRixDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ2hCLFVBQUksUUFBUTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQS85QmEsMEJBWVksb0JBQW9CO0FBWmhDLDRCQUFOO0FBQUEsRUE0Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcENVOyIsCiAgIm5hbWVzIjogW10KfQo=
