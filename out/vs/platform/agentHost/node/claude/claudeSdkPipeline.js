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
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { ClaudePromptQueue } from "./claudePromptQueue.js";
import { ClaudeSdkMessageRouter } from "./claudeSdkMessageRouter.js";
let ClaudeSdkPipeline = class extends Disposable {
  constructor(sessionId, sessionUri, chatChannelUri, warm, abortController, dbRef, subagents, clientToolOwner = void 0, instantiationService, _logService) {
    super();
    this.sessionId = sessionId;
    this.sessionUri = sessionUri;
    this.chatChannelUri = chatChannelUri;
    this._logService = _logService;
    /** Flips to `true` on the first `system:init` SDK message. Drives `Options.resume` decisions for downstream phases. */
    this._isResumed = false;
    /**
     * Native plugins reported by the most recent `system:init` message.
     * Captured on *every* init (including resume) so the post-materialize
     * native-plugin filter always reflects the live set. `source` is the
     * plugin id and is the reliable match key (see {@link ISdkResolvedCustomizations}).
     */
    this._initPlugins = [];
    /** Set when the consumer loop ends in error (cancellation OR crash). Read by {@link send} to trigger rebind. */
    this._needsRebind = false;
    /** Tracks whether the consumer loop is currently draining {@link _query}. */
    this._consumerLoopRunning = false;
    this._onDidProduceSignal = this._register(new Emitter());
    /**
     * Single fan-out for every {@link AgentSignal} this session produces:
     *   • Router-mapped per-message signals (response parts, tool calls,
     *     pending confirmations, etc.).
     *   • `ChatTurnComplete` action, fired when the LAST entry in the
     *     queue drains via `result` (intermediate results during steering
     *     preempt do NOT fire — CONTEXT.md M10).
     *   • `steering_consumed` signal, fired the moment the iterable yields
     *     a steering entry to the SDK.
     */
    this.onDidProduceSignal = this._onDidProduceSignal.event;
    this._warm = warm;
    this._abortController = abortController;
    this._wireAbortHandler(abortController);
    this._queue = this._register(instantiationService.createInstance(
      ClaudePromptQueue,
      sessionId,
      () => this._abortController.signal,
      (pendingId) => this._onDidProduceSignal.fire({
        kind: "steering_consumed",
        chat: this.chatChannelUri,
        id: pendingId
      })
    ));
    this._router = this._register(instantiationService.createInstance(
      ClaudeSdkMessageRouter,
      sessionUri,
      chatChannelUri,
      dbRef,
      subagents,
      clientToolOwner
    ));
    this._register(this._router.onDidProduceSignal((s) => this._onDidProduceSignal.fire(s)));
    this._register(toDisposable(() => this._abortController.abort()));
    this._register(toDisposable(() => {
      void Promise.resolve(this._warm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline] WarmQuery dispose failed: ${err}`));
    }));
  }
  /**
   * Phase 11 — hot-swap the SDK's plugin set in place via
   * `Query.reloadPlugins()`. Commands / agents / mcpServers added or
   * removed by the new plugin set become visible to the SDK
   * immediately, without a session restart. Throws if the query is
   * not yet bound (session not materialized).
   */
  async reloadPlugins() {
    const query = await this._ensureQueryBound();
    await query.reloadPlugins();
  }
  /**
   * Phase 11 — snapshot the SDK's currently-resolved customization
   * surface (slash commands / skills, subagents, MCP servers). This
   * is the SDK's view of "what does this session actually have
   * access to right now" — covers everything the SDK loaded itself
   * (`~/.claude/**`, `.claude/agents/`, `settings.json` MCP) AND
   * anything we fed in via `Options.plugins`. The host overlays
   * client-side enablement separately.
   */
  async snapshotResolvedCustomizations() {
    const query = await this._ensureQueryBound();
    const [commands, agents, mcpServers] = await Promise.all([
      query.supportedCommands(),
      query.supportedAgents(),
      query.mcpServerStatus()
    ]);
    return { commands, agents, mcpServers, plugins: this._initPlugins };
  }
  async startMcpServer(serverName) {
    const query = await this._ensureQueryBound();
    return this._applyMcpServerEnablement(query, serverName, true);
  }
  async stopMcpServer(serverName) {
    const query = await this._ensureQueryBound();
    return this._applyMcpServerEnablement(query, serverName, false);
  }
  async reconcileMcpServerEnablement(desired) {
    const query = await this._ensureQueryBound();
    const observed = new Map((await query.mcpServerStatus()).map((server) => [server.name, server.status !== "disabled"]));
    for (const [serverName, enabled] of desired) {
      const current = observed.get(serverName);
      if (current === void 0 || current === enabled) {
        continue;
      }
      if (!await this._applyMcpServerEnablement(query, serverName, enabled)) {
        return false;
      }
    }
    return true;
  }
  async _applyMcpServerEnablement(query, serverName, enabled) {
    if (!query.toggleMcpServer || enabled && !query.reconnectMcpServer) {
      return false;
    }
    await query.toggleMcpServer(serverName, enabled);
    if (enabled) {
      await query.reconnectMcpServer(serverName);
    }
    return true;
  }
  /**
   * Bind the SDK Query if needed, recovering a dead one first. Mirrors the
   * gate in {@link send}: if the pipeline is marked for rebind (after an
   * abort/crash the `_query` handle is retained for teardown but its stream
   * is dead), rebuild via the rematerializer so pre-flight helpers never
   * operate on a disposed stream. Then lazily bind if nothing is bound yet.
   */
  async _ensureQueryBound() {
    if (this._needsRebind) {
      await this._rebindQuery("recover");
    }
    if (!this._query) {
      this._bindWarmQuery();
      await this._replayCurrentConfig();
    }
    return this._query;
  }
  /**
   * Bind a fresh SDK stream off the current warm subprocess. The stream is
   * long-lived: it spans every turn until a rebind swaps the subprocess (the
   * prompt iterable parks between turns rather than ending), so {@link _query}
   * tracks the lifetime of {@link _warm} and is only swapped here.
   */
  _bindWarmQuery() {
    const query = this._warm.query(this._queue.iterable);
    this._query = query;
    return query;
  }
  get isResumed() {
    return this._isResumed;
  }
  get isAborted() {
    return this._abortController.signal.aborted;
  }
  /**
   * Whether a turn is currently in flight or queued. False between turns (the
   * warm query parks with a drained queue). Used by non-destructive idle
   * release to avoid tearing the pipeline down mid-turn.
   */
  get hasActiveTurn() {
    return !this._queue.isEmpty;
  }
  /**
   * Abort the live SDK subprocess and **await its actual exit**.
   *
   * `WarmQuery[Symbol.asyncDispose]()` calls the query's `close()`, which
   * *fires* the SDK cleanup but does not await it — so it returns while the
   * subprocess is still shutting down (and still re-flushing its transcript).
   * `Query.return()` awaits the same (memoized) cleanup, which in turn awaits
   * `transport.waitForExit()` — the OS process actually exiting after its
   * final transcript flush. Awaiting that is what lets a caller safely reuse
   * the `--session-id` (the CLI rejects a fresh spawn while `<id>.jsonl`
   * still exists, and the dying process would otherwise recreate it).
   */
  async shutdownAndWait() {
    this._abortController.abort();
    try {
      await this._warm[Symbol.asyncDispose]();
      await this._query?.return(void 0);
    } catch (err) {
      this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] shutdownAndWait: teardown failed`, err);
    }
  }
  /**
   * Phase 10 \u2014 narrow public wrapper around the internal
   * {@link _rebindQuery} so {@link ClaudeAgentSession.rebindForClientTools}
   * can drive a yield-restart without exposing the private rebind
   * machinery to every collaborator.
   */
  rebindForRestart() {
    return this._rebindQuery("restart");
  }
  /**
   * Phase 10 — update the resolver the stream mapper uses to stamp the
   * owning workbench `clientId` onto subsequent `ChatToolCallStart` events.
   */
  setClientToolOwner(clientToolOwner) {
    this._router.setClientToolOwner(clientToolOwner);
  }
  /** Attach the rematerializer hook for abort / crash recovery. Optional — tests that exercise only the dispose path skip this. */
  attachRematerializer(rematerializer) {
    this._rematerializer = rematerializer;
  }
  /**
   * Seed the current + applied config from materialize-time `Options`.
   * The SDK already starts with these values, so we mark them as both
   * "current" (what the consumer wants) and "applied" (what the SDK has)
   * to avoid a redundant `setModel` / `applyFlagSettings` on first use.
   */
  seedCurrentConfig(model, effort, permissionMode) {
    this._currentModel = model;
    this._currentEffort = effort;
    this._currentPermissionMode = permissionMode;
    this._appliedModel = model;
    this._appliedEffort = effort;
    this._appliedPermissionMode = permissionMode;
  }
  /**
   * Eagerly push a model change to the SDK. Safe to call mid-turn:
   * `Query.setModel` only takes effect on the NEXT user request. No-op
   * if the value is unchanged. Buffered as `_currentModel` until the
   * Query is bound (and replayed on rebind).
   */
  async setModel(model) {
    this._currentModel = model;
    if (this._query && !this._needsRebind && model !== this._appliedModel) {
      try {
        await this._query.setModel(model);
        this._appliedModel = model;
      } catch (err) {
        this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setModel failed: ${err}`);
      }
    }
  }
  /**
   * Eagerly push an effort-level change to the SDK via
   * `applyFlagSettings({ effortLevel })`. Same mid-turn safety as
   * {@link setModel}.
   *
   * `undefined` means "clear the effort the SDK is currently applying" —
   * issued as `applyFlagSettings({ effortLevel: null })` (sdk.d.ts:2263:
   * passing `null` clears a key from the flag layer). This is what makes a
   * switch to a model that does not support reasoning effort (e.g. Haiku)
   * drop a `'high'` left over from a prior effort-capable model instead of
   * replaying it onto a model the API will 400 on.
   */
  async setEffort(effort) {
    this._currentEffort = effort;
    if (this._query && !this._needsRebind && effort !== this._appliedEffort) {
      try {
        await this._query.applyFlagSettings({ effortLevel: effort ?? null });
        this._appliedEffort = effort;
      } catch (err) {
        this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setEffort failed: ${err}`);
      }
    }
  }
  /**
   * Queue a user prompt for the SDK. Resolves when the matching
   * `result` message arrives.
   *
   * If a previous turn aborted or crashed, this triggers a rebind via
   * the attached rematerializer before queueing.
   */
  async send(prompt, turnId) {
    if (this._needsRebind) {
      await this._rebindQuery("recover");
    }
    if (this._abortController.signal.aborted) {
      throw new CancellationError();
    }
    if (!this._query) {
      this._bindWarmQuery();
      await this._replayCurrentConfig();
    }
    this._ensureConsumerLoop();
    const entry = {
      sdkMessage: prompt,
      sdkUuid: typeof prompt.uuid === "string" ? prompt.uuid : turnId,
      turnId,
      stopWatch: StopWatch.create(false),
      deferred: new DeferredPromise()
    };
    return this._queue.push(entry);
  }
  /**
   * Push a `priority: 'now'` steering message into the iterable. The
   * caller pre-builds the {@link SDKUserMessage} (the pipeline is SDK
   * messaging-shaped, not protocol-shaped). `pendingMessageId` is the
   * protocol `PendingMessage.id` that {@link onSteeringConsumed} will
   * carry when the SDK accepts the message.
   *
   * No-op if the pipeline is aborted or no in-flight / queued request
   * exists to inherit a `turnId` from (CONTEXT.md M10: steering folds
   * into the in-progress protocol Turn).
   */
  injectSteering(prompt, pendingMessageId) {
    if (this._abortController.signal.aborted) {
      this._logService.warn(`[Claude:${this.sessionId}] injectSteering: dropped (controller aborted) id=${pendingMessageId}`);
      return;
    }
    const parent = this._queue.peekParent();
    if (!parent) {
      this._logService.warn(`[Claude:${this.sessionId}] injectSteering: dropped (no in-flight turn) id=${pendingMessageId}`);
      return;
    }
    const sdkUuid = typeof prompt.uuid === "string" ? prompt.uuid : pendingMessageId;
    this._queue.push({
      sdkMessage: prompt,
      sdkUuid,
      turnId: parent.turnId,
      stopWatch: parent.stopWatch,
      deferred: new DeferredPromise(),
      steeringPendingId: pendingMessageId
    }).catch(() => {
    });
    this._logService.info(`[Claude:${this.sessionId}] injectSteering: enqueued id=${pendingMessageId} sdkUuid=${sdkUuid}`);
  }
  /**
   * Cancel the in-flight SDK turn via the abort controller. Mirrors
   * the production reference (`claudeCodeAgent.ts:719`). Drops every
   * pending entry's deferred (rejected with `CancellationError`),
   * marks the pipeline for rebind on next {@link send}. Idempotent.
   *
   * Safe to call during rebind: {@link _rebindQuery} swaps in a fresh
   * placeholder {@link AbortController} before awaiting the
   * rematerializer, so an abort issued during recovery lands on that
   * placeholder and is honored when the freshly-built pair arrives
   * (the rebind discards the new pair and surfaces a cancellation).
   */
  abort() {
    if (this._abortController.signal.aborted) {
      return;
    }
    this._abortController.abort();
    this._queue.failAll(new CancellationError());
    this._needsRebind = true;
  }
  /**
   * Forwards to {@link Query.setPermissionMode} once the query is
   * bound; the value is also remembered so it's re-applied after a
   * rebind. Permission mode is whole-session (not per-entry).
   */
  async setPermissionMode(mode) {
    this._currentPermissionMode = mode;
    if (this._query && !this._needsRebind && mode !== this._appliedPermissionMode) {
      await this._query.setPermissionMode(mode);
      this._appliedPermissionMode = mode;
    }
  }
  _wireAbortHandler(controller) {
    controller.signal.addEventListener("abort", () => {
      this._queue.notifyAborted();
    }, { once: true });
  }
  _ensureConsumerLoop() {
    if (this._consumerLoopRunning) {
      return;
    }
    this._consumerLoopRunning = true;
    this._runConsumerLoop();
  }
  /**
   * Runs one {@link _processMessages} pass over the live {@link _query} and,
   * when it ends, decides whether to hand off to a fresh pass.
   *
   * A rebind ({@link _rebindQuery}) swaps in a new `_query` while the loop is
   * still draining the OLD (now-disposed) one; that old pass then ends with
   * the "stream ended without a result" guard. Because `_consumerLoopRunning`
   * stays `true` for the whole handoff, the {@link send} that queued the
   * post-rebind prompt already saw {@link _ensureConsumerLoop} no-op — so if
   * this pass just stopped, nothing would ever read the new query and `send`
   * would hang. Detect the swap (current `_query` differs from the one this
   * pass bound) and re-arm for it instead. Abort / crash / dispose leave
   * `_query` cleared (or the store disposed), so they fall through to stop.
   */
  _runConsumerLoop() {
    const boundQuery = this._query;
    void this._processMessages().catch((err) => this._logService.error(`[ClaudeSdkPipeline:${this.sessionId}] _processMessages crashed: ${err}`)).finally(() => {
      if (!this._store.isDisposed && this._query && this._query !== boundQuery) {
        this._runConsumerLoop();
      } else {
        this._consumerLoopRunning = false;
      }
    });
  }
  /**
   * Push the current model / effort / permissionMode to the SDK if they
   * diverge from what was last applied. Called after binding a fresh
   * Query (initial first-send and after rebind). Failures are logged.
   */
  async _replayCurrentConfig() {
    try {
      if (this._currentModel !== void 0 && this._currentModel !== this._appliedModel) {
        await this._query?.setModel(this._currentModel);
        this._appliedModel = this._currentModel;
      }
      if (this._currentEffort !== void 0 && this._currentEffort !== this._appliedEffort) {
        await this._query?.applyFlagSettings({ effortLevel: this._currentEffort });
        this._appliedEffort = this._currentEffort;
      }
      if (this._currentPermissionMode !== void 0 && this._currentPermissionMode !== this._appliedPermissionMode) {
        await this._query?.setPermissionMode(this._currentPermissionMode);
        this._appliedPermissionMode = this._currentPermissionMode;
      }
    } catch (err) {
      this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] _replayCurrentConfig failed: ${err}`);
    }
  }
  /**
   * Dispose the dead SDK plumbing and rebuild via the agent-supplied
   * rematerializer in `resume` mode. Re-applies the current model /
   * effort / permission mode to the fresh Query.
   */
  async _rebindQuery(reason) {
    if (!this._rematerializer) {
      throw new Error(`ClaudeSdkPipeline.rebind: no rematerializer attached (reason=${reason})`);
    }
    const oldWarm = this._warm;
    const placeholder = new AbortController();
    this._abortController = placeholder;
    const built = await this._rematerializer(reason);
    if (this._store.isDisposed) {
      built.abortController.abort();
      void Promise.resolve(built.warm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] rebind-after-dispose: warm dispose failed: ${err}`));
      throw new CancellationError();
    }
    if (placeholder.signal.aborted) {
      built.abortController.abort();
      void Promise.resolve(built.warm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] rebind-aborted: warm dispose failed: ${err}`));
      void Promise.resolve(oldWarm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] previous WarmQuery dispose failed during aborted rebind: ${err}`));
      this._queue.failAll(new CancellationError());
      this._needsRebind = true;
      throw new CancellationError();
    }
    void Promise.resolve(oldWarm[Symbol.asyncDispose]()).catch((err) => this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] previous WarmQuery dispose failed during rebind: ${err}`));
    this._warm = built.warm;
    this._abortController = built.abortController;
    this._wireAbortHandler(built.abortController);
    this._queue.resetForRebind();
    this._needsRebind = false;
    this._appliedModel = void 0;
    this._appliedEffort = void 0;
    this._appliedPermissionMode = void 0;
    this._bindWarmQuery();
    await this._replayCurrentConfig();
  }
  /**
   * Consumer loop. Drains the SDK iterator, dispatches each message
   * to the {@link ClaudeSdkMessageRouter} (awaited so async file-edit
   * observation completes before the next message), settles the head
   * entry's deferred on `result`, and fires `ChatTurnComplete` only
   * when the queue fully drains.
   *
   * On any uncaught error (cancellation, transport failure, or the
   * post-loop "stream ended without result" guard) the catch block
   * rejects every pending entry's deferred with the same error and
   * marks `_needsRebind=true`. Cancellation is swallowed (don't
   * rethrow); other errors propagate to the void caller's `.catch` for
   * logging.
   */
  async _processMessages() {
    const query = this._query;
    if (!query) {
      throw new Error("ClaudeSdkPipeline._processMessages called before query was bound");
    }
    try {
      for await (const message of query) {
        if (this._abortController.signal.aborted) {
          throw new CancellationError();
        }
        if (message.type === "system" && message.subtype === "init") {
          this._initPlugins = message.plugins ?? [];
          if (!this._isResumed) {
            this._isResumed = true;
          }
        }
        const turnId = this._queue.peekParent()?.turnId;
        const turnDuration = this._queue.peekParent()?.stopWatch.elapsed();
        try {
          await this._router.handle(message, turnId, turnDuration);
        } catch (handlerErr) {
          this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] router threw, skipping: ${handlerErr}`);
        }
        if (message.type === "result") {
          const completed = this._queue.settleHead();
          this._logService.info(`[Claude:${this.sessionId}] result for sdkUuid=${completed?.sdkUuid}`);
          if (completed && this._queue.isEmpty) {
            this._onDidProduceSignal.fire({
              kind: "action",
              resource: this.chatChannelUri,
              action: {
                type: ActionType.ChatTurnComplete,
                turnId: completed.turnId,
                duration: Math.max(0, completed.stopWatch.elapsed())
              }
            });
          }
        }
      }
      if (this._abortController.signal.aborted) {
        throw new CancellationError();
      }
      if (this._query !== query) {
        return;
      }
      throw new Error("Claude SDK stream ended without a result message");
    } catch (err) {
      const fatal = err instanceof Error ? err : new Error(String(err));
      if (this._query === query) {
        this._queue.failAll(fatal);
        this._needsRebind = true;
      }
      if (!isCancellationError(fatal)) {
        throw fatal;
      }
    }
  }
};
ClaudeSdkPipeline = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILogService)
], ClaudeSdkPipeline);
export {
  ClaudeSdkPipeline
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVTZGtQaXBlbGluZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQWdlbnRJbmZvLCBNY3BTZXJ2ZXJTdGF0dXMsIFBlcm1pc3Npb25Nb2RlLCBRdWVyeSwgU0RLVXNlck1lc3NhZ2UsIFNsYXNoQ29tbWFuZCwgV2FybVF1ZXJ5IH0gZnJvbSAnQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENsYXVkZVJ1bnRpbWVFZmZvcnRMZXZlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jbGF1ZGVNb2RlbENvbmZpZy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNpZ25hbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVQcm9tcHRRdWV1ZSwgSVBlbmRpbmdTZGtNZXNzYWdlIH0gZnJvbSAnLi9jbGF1ZGVQcm9tcHRRdWV1ZS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVTZGtNZXNzYWdlUm91dGVyIH0gZnJvbSAnLi9jbGF1ZGVTZGtNZXNzYWdlUm91dGVyLmpzJztcbmltcG9ydCB0eXBlIHsgU3ViYWdlbnRSZWdpc3RyeSB9IGZyb20gJy4vY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5cbi8qKlxuICogQ2FsbGJhY2sgdGhlIGFnZW50IHN1cHBsaWVzIHZpYSB7QGxpbmsgQ2xhdWRlU2RrUGlwZWxpbmUuYXR0YWNoUmVtYXRlcmlhbGl6ZXJ9XG4gKiBzbyB0aGUgcGlwZWxpbmUgY2FuIHJlYnVpbGQgaXRzIHVuZGVybHlpbmcge0BsaW5rIFdhcm1RdWVyeX0gL1xuICoge0BsaW5rIEFib3J0Q29udHJvbGxlcn0gb24gYWJvcnQgb3IgY3Jhc2ggcmVjb3Zlcnkgd2l0aG91dCBkZXBlbmRpbmcgb25cbiAqIHRoZSBtYXRlcmlhbGl6ZXIgc2VydmljZSBkaXJlY3RseS4gVGhlIGNhbGxiYWNrIE1VU1Qgc3RhcnQgdGhlIFNESyBpblxuICogYHJlc3VtZWAgbW9kZSAoaS5lLiBwYXNzIGBPcHRpb25zLnJlc3VtZSA9IHNlc3Npb25JZGAgaW5zdGVhZCBvZlxuICogYE9wdGlvbnMuc2Vzc2lvbklkYCkgYW5kIE1VU1QgTk9UIHJlLWZpcmUgdGhlIGFnZW50J3NcbiAqIGBvbkRpZE1hdGVyaWFsaXplU2Vzc2lvbmAgZXZlbnQgXHUyMDE0IHRoYXQgZXZlbnQgaXMgb25jZS1wZXItcHJvdmlzaW9uYWxcbiAqIHByb21vdGlvbiAoc2VlIGBjbGF1ZGVBZ2VudC50c2AgbWF0ZXJpYWxpemUgcGF0aCkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbWF0ZXJpYWxpemVyIHtcblx0KHJlYXNvbjogJ3Jlc3RhcnQnIHwgJ3JlY292ZXInKTogUHJvbWlzZTx7IHJlYWRvbmx5IHdhcm06IFdhcm1RdWVyeTsgcmVhZG9ubHkgYWJvcnRDb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIgfT47XG59XG5cbi8qKlxuICogT3ducyBvbmUgU0RLIFF1ZXJ5IGxpZmVjeWNsZSBmb3IgYSBDbGF1ZGUgc2Vzc2lvbi4gS25vd3Mgbm90aGluZyBhYm91dFxuICogcHJvdG9jb2wgdHVybnMsIHRoZSB3b3JrYmVuY2ggbWFwcGVyLCBmaWxlLWVkaXQgb2JzZXJ2ZXJzLCBvclxuICogcGVybWlzc2lvbiByZWdpc3RyaWVzIFx1MjAxNCB0aGUgY29uc3VtaW5nIHNlc3Npb24gc3Vic2NyaWJlcyB0b1xuICoge0BsaW5rIG9uRGlkUHJvZHVjZVNpZ25hbH0gYW5kIGZhbnMgb3V0IHRvIGl0cyBvd24gY29sbGFib3JhdG9ycy5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOlxuICogICBcdTIwMjIgSG9sZCB0aGUge0BsaW5rIFdhcm1RdWVyeX0gKyB7QGxpbmsgQWJvcnRDb250cm9sbGVyfSBmb3IgdGhlXG4gKiAgICAgYWN0aXZlIFNESyBzdWJwcm9jZXNzLiBCb3RoIGFyZSBtdXRhYmxlOiByZWJpbmQgb24gYWJvcnQvY3Jhc2hcbiAqICAgICByZWNvdmVyeSB2aWEgdGhlIHN1cHBsaWVkIHtAbGluayBJUmVtYXRlcmlhbGl6ZXJ9LlxuICogICBcdTIwMjIgRHJpdmUgYSB7QGxpbmsgQ2xhdWRlUHJvbXB0UXVldWV9IHdob3NlIGl0ZXJhYmxlIGlzIGhhbmRlZCB0b1xuICogICAgIGBXYXJtUXVlcnkucXVlcnkoKWAuXG4gKiAgIFx1MjAyMiBBcHBseSB0aGUgY3VycmVudCBtb2RlbCAvIGVmZm9ydCAvIHBlcm1pc3Npb25Nb2RlIHRvIHRoZSBTREtcbiAqICAgICBlYWdlcmx5IHdoZW4gdGhlIGNvbnN1bWVyIGNhbGxzIHtAbGluayBzZXRNb2RlbH0gL1xuICogICAgIHtAbGluayBzZXRFZmZvcnR9IC8ge0BsaW5rIHNldFBlcm1pc3Npb25Nb2RlfS4gVGhlIFNESyBvbmx5IHRha2VzXG4gKiAgICAgdGhlc2UgaW50byBhY2NvdW50IG9uIHRoZSBORVhUIHVzZXIgcmVxdWVzdCwgc28gbWlkLXR1cm4gY2FsbHNcbiAqICAgICBhcmUgc2FmZSBcdTIwMTQgbm8gbmVlZCB0byBhbGlnbiB0aGUgU0RLIHNldHRlciB3aXRoIHRoZSBwcm9tcHQgeWllbGQuXG4gKiAgICAgUmUtYXBwbGllZCB0byBhIGZyZXNoIFF1ZXJ5IG9uIHJlYmluZC5cbiAqICAgXHUyMDIyIERyYWluIHRoZSBTREsgbWVzc2FnZSBzdHJlYW0sIGRpc3BhdGNoIGVhY2ggbWVzc2FnZSB0byB0aGVcbiAqICAgICB7QGxpbmsgQ2xhdWRlU2RrTWVzc2FnZVJvdXRlcn0sIHNldHRsZSB0aGUgbWF0Y2hpbmcgZW50cnknc1xuICogICAgIGRlZmVycmVkIG9uIGByZXN1bHRgLCBhbmQgZW1pdCBgQ2hhdFR1cm5Db21wbGV0ZWAgb25seSB3aGVuXG4gKiAgICAgdGhlIHF1ZXVlIGZ1bGx5IGRyYWlucyAoaW50ZXJtZWRpYXRlIHJlc3VsdHMgZHVyaW5nIHN0ZWVyaW5nXG4gKiAgICAgcHJlZW1wdGlvbiBkbyBOT1QgZmlyZSB0dXJuLWNvbXBsZXRlIFx1MjAxNCBDT05URVhULm1kIE0xMCkuXG4gKlxuICogRGlzcG9zaW5nIHRoZSBwaXBlbGluZSBhYm9ydHMgdGhlIGNvbnRyb2xsZXIgKHRlcm1pbmF0aW5nIHRoZSBTREtcbiAqIHN1YnByb2Nlc3MgcGVyIGBzZGsuZC50czo5ODJgKSBhbmQgYXN5bmMtZGlzcG9zZXMgdGhlIFdhcm1RdWVyeS5cbiAqL1xuLyoqXG4gKiBTbmFwc2hvdCBvZiBldmVyeXRoaW5nIHRoZSBTREsgaGFzIGN1cnJlbnRseSByZXNvbHZlZCBmb3IgdGhpc1xuICogc2Vzc2lvbi4gUmV0dXJuZWQgYnkge0BsaW5rIENsYXVkZVNka1BpcGVsaW5lLnNuYXBzaG90UmVzb2x2ZWRDdXN0b21pemF0aW9uc30uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNka1Jlc29sdmVkQ3VzdG9taXphdGlvbnMge1xuXHRyZWFkb25seSBjb21tYW5kczogcmVhZG9ubHkgU2xhc2hDb21tYW5kW107XG5cdHJlYWRvbmx5IGFnZW50czogcmVhZG9ubHkgQWdlbnRJbmZvW107XG5cdHJlYWRvbmx5IG1jcFNlcnZlcnM6IHJlYWRvbmx5IE1jcFNlcnZlclN0YXR1c1tdO1xuXHQvKipcblx0ICogTmF0aXZlIHBsdWdpbnMgdGhlIGxpdmUgc2Vzc2lvbiBhY3R1YWxseSBsb2FkZWQsIGFzIHJlcG9ydGVkIGJ5IHRoZVxuXHQgKiBTREsgYHN5c3RlbS9pbml0YCBtZXNzYWdlLiBVc2VkIHRvIGZpbHRlciB0aGUgZGlzay1kaXNjb3ZlcmVkIG5hdGl2ZVxuXHQgKiBwbHVnaW5zIHBvc3QtbWF0ZXJpYWxpemU6IGEgcGx1Z2luIGRlY2xhcmVkIGluIGBlbmFibGVkUGx1Z2luc2AgYnV0XG5cdCAqIGFic2VudCBoZXJlIChiYWQgcGF0aCwgbWFuaWZlc3QgZXJyb3IsIHVudHJ1c3RlZCB3b3Jrc3BhY2UpIGlzIGhpZGRlbi5cblx0ICpcblx0ICogYHNvdXJjZWAgaXMgdGhlIHBsdWdpbiBpZCAoYDxwbHVnaW4+QDxtYXJrZXRwbGFjZT5gKSBhbmQgaXMgdGhlXG5cdCAqIGF1dGhvcml0YXRpdmUgbWF0Y2gga2V5IFx1MjAxNCB0aGUgU0RLJ3MgYHBhdGhgIGlzIHVucmVsaWFibGUgZm9yXG5cdCAqIHdvcmtzcGFjZS1gbG9jYWxgLXNjb3BlZCBwbHVnaW5zIChpdCBjYW4gcmVwb3J0IGEgbm9uLWNhY2hlIHBhdGgpLiBUaGVcblx0ICogU0RLIGAuZC50c2AgdHlwZXMgdGhlIGVsZW1lbnQgYXMgYHsgbmFtZSwgcGF0aCB9YCBidXQgdGhlIHJ1bnRpbWUgYWRkc1xuXHQgKiBgc291cmNlYCwgc28gaXQgaXMgY2FwdHVyZWQgYXMgb3B0aW9uYWwuXG5cdCAqL1xuXHRyZWFkb25seSBwbHVnaW5zOiByZWFkb25seSB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgcGF0aDogc3RyaW5nOyByZWFkb25seSBzb3VyY2U/OiBzdHJpbmcgfVtdO1xufVxuXG5leHBvcnQgY2xhc3MgQ2xhdWRlU2RrUGlwZWxpbmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0LyoqXG5cdCAqIFBoYXNlIDExIFx1MjAxNCBob3Qtc3dhcCB0aGUgU0RLJ3MgcGx1Z2luIHNldCBpbiBwbGFjZSB2aWFcblx0ICogYFF1ZXJ5LnJlbG9hZFBsdWdpbnMoKWAuIENvbW1hbmRzIC8gYWdlbnRzIC8gbWNwU2VydmVycyBhZGRlZCBvclxuXHQgKiByZW1vdmVkIGJ5IHRoZSBuZXcgcGx1Z2luIHNldCBiZWNvbWUgdmlzaWJsZSB0byB0aGUgU0RLXG5cdCAqIGltbWVkaWF0ZWx5LCB3aXRob3V0IGEgc2Vzc2lvbiByZXN0YXJ0LiBUaHJvd3MgaWYgdGhlIHF1ZXJ5IGlzXG5cdCAqIG5vdCB5ZXQgYm91bmQgKHNlc3Npb24gbm90IG1hdGVyaWFsaXplZCkuXG5cdCAqL1xuXHRhc3luYyByZWxvYWRQbHVnaW5zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5fZW5zdXJlUXVlcnlCb3VuZCgpO1xuXHRcdGF3YWl0IHF1ZXJ5LnJlbG9hZFBsdWdpbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaGFzZSAxMSBcdTIwMTQgc25hcHNob3QgdGhlIFNESydzIGN1cnJlbnRseS1yZXNvbHZlZCBjdXN0b21pemF0aW9uXG5cdCAqIHN1cmZhY2UgKHNsYXNoIGNvbW1hbmRzIC8gc2tpbGxzLCBzdWJhZ2VudHMsIE1DUCBzZXJ2ZXJzKS4gVGhpc1xuXHQgKiBpcyB0aGUgU0RLJ3MgdmlldyBvZiBcIndoYXQgZG9lcyB0aGlzIHNlc3Npb24gYWN0dWFsbHkgaGF2ZVxuXHQgKiBhY2Nlc3MgdG8gcmlnaHQgbm93XCIgXHUyMDE0IGNvdmVycyBldmVyeXRoaW5nIHRoZSBTREsgbG9hZGVkIGl0c2VsZlxuXHQgKiAoYH4vLmNsYXVkZS8qKmAsIGAuY2xhdWRlL2FnZW50cy9gLCBgc2V0dGluZ3MuanNvbmAgTUNQKSBBTkRcblx0ICogYW55dGhpbmcgd2UgZmVkIGluIHZpYSBgT3B0aW9ucy5wbHVnaW5zYC4gVGhlIGhvc3Qgb3ZlcmxheXNcblx0ICogY2xpZW50LXNpZGUgZW5hYmxlbWVudCBzZXBhcmF0ZWx5LlxuXHQgKi9cblx0YXN5bmMgc25hcHNob3RSZXNvbHZlZEN1c3RvbWl6YXRpb25zKCk6IFByb21pc2U8SVNka1Jlc29sdmVkQ3VzdG9taXphdGlvbnM+IHtcblx0XHRjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVF1ZXJ5Qm91bmQoKTtcblx0XHRjb25zdCBbY29tbWFuZHMsIGFnZW50cywgbWNwU2VydmVyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRxdWVyeS5zdXBwb3J0ZWRDb21tYW5kcygpLFxuXHRcdFx0cXVlcnkuc3VwcG9ydGVkQWdlbnRzKCksXG5cdFx0XHRxdWVyeS5tY3BTZXJ2ZXJTdGF0dXMoKSxcblx0XHRdKTtcblx0XHRyZXR1cm4geyBjb21tYW5kcywgYWdlbnRzLCBtY3BTZXJ2ZXJzLCBwbHVnaW5zOiB0aGlzLl9pbml0UGx1Z2lucyB9O1xuXHR9XG5cblx0YXN5bmMgc3RhcnRNY3BTZXJ2ZXIoc2VydmVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLl9lbnN1cmVRdWVyeUJvdW5kKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2FwcGx5TWNwU2VydmVyRW5hYmxlbWVudChxdWVyeSwgc2VydmVyTmFtZSwgdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBzdG9wTWNwU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5fZW5zdXJlUXVlcnlCb3VuZCgpO1xuXHRcdHJldHVybiB0aGlzLl9hcHBseU1jcFNlcnZlckVuYWJsZW1lbnQocXVlcnksIHNlcnZlck5hbWUsIGZhbHNlKTtcblx0fVxuXG5cdGFzeW5jIHJlY29uY2lsZU1jcFNlcnZlckVuYWJsZW1lbnQoZGVzaXJlZDogUmVhZG9ubHlNYXA8c3RyaW5nLCBib29sZWFuPik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5fZW5zdXJlUXVlcnlCb3VuZCgpO1xuXHRcdGNvbnN0IG9ic2VydmVkID0gbmV3IE1hcCgoYXdhaXQgcXVlcnkubWNwU2VydmVyU3RhdHVzKCkpLm1hcChzZXJ2ZXIgPT4gW3NlcnZlci5uYW1lLCBzZXJ2ZXIuc3RhdHVzICE9PSAnZGlzYWJsZWQnXSkpO1xuXHRcdGZvciAoY29uc3QgW3NlcnZlck5hbWUsIGVuYWJsZWRdIG9mIGRlc2lyZWQpIHtcblx0XHRcdC8vIGBkZXNpcmVkYCBpcyBzZXNzaW9uLXNjb3BlZCBzdGF0ZSwgc28gaXQgY2FuIG5hbWUgc2VydmVycyB0aGlzXG5cdFx0XHQvLyBwYXJ0aWN1bGFyIGNoYXQncyBxdWVyeSBkb2VzIG5vdCBoYXZlIChhIHBlZXIgY2hhdCB0aGF0IGhhcyBub3Rcblx0XHRcdC8vIGZpbmlzaGVkIGNvbm5lY3RpbmcgaXRzIHNlcnZlcnMsIG9yIGEgY2hhdCBjcmVhdGVkIGFmdGVyIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbiBzdGF0ZSB3YXMgcHVibGlzaGVkKS4gVG9nZ2xpbmcgb25lIG9mIHRob3NlIGFsd2F5cyBmYWlsc1xuXHRcdFx0Ly8gd2l0aCBgU2VydmVyIG5vdCBmb3VuZDogPG5hbWU+YCBhbmQgd291bGQgdGFrZSB0aGUgdHVybiBkb3duIHdpdGhcblx0XHRcdC8vIGl0LCBzbyBvbmx5IHJlY29uY2lsZSBzZXJ2ZXJzIHRoZSBsaXZlIHF1ZXJ5IGFjdHVhbGx5IHJlcG9ydHMuXG5cdFx0XHRjb25zdCBjdXJyZW50ID0gb2JzZXJ2ZWQuZ2V0KHNlcnZlck5hbWUpO1xuXHRcdFx0aWYgKGN1cnJlbnQgPT09IHVuZGVmaW5lZCB8fCBjdXJyZW50ID09PSBlbmFibGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9hcHBseU1jcFNlcnZlckVuYWJsZW1lbnQocXVlcnksIHNlcnZlck5hbWUsIGVuYWJsZWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseU1jcFNlcnZlckVuYWJsZW1lbnQocXVlcnk6IFF1ZXJ5LCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXF1ZXJ5LnRvZ2dsZU1jcFNlcnZlciB8fCAoZW5hYmxlZCAmJiAhcXVlcnkucmVjb25uZWN0TWNwU2VydmVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhd2FpdCBxdWVyeS50b2dnbGVNY3BTZXJ2ZXIoc2VydmVyTmFtZSwgZW5hYmxlZCk7XG5cdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdGF3YWl0IHF1ZXJ5LnJlY29ubmVjdE1jcFNlcnZlciEoc2VydmVyTmFtZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpbmQgdGhlIFNESyBRdWVyeSBpZiBuZWVkZWQsIHJlY292ZXJpbmcgYSBkZWFkIG9uZSBmaXJzdC4gTWlycm9ycyB0aGVcblx0ICogZ2F0ZSBpbiB7QGxpbmsgc2VuZH06IGlmIHRoZSBwaXBlbGluZSBpcyBtYXJrZWQgZm9yIHJlYmluZCAoYWZ0ZXIgYW5cblx0ICogYWJvcnQvY3Jhc2ggdGhlIGBfcXVlcnlgIGhhbmRsZSBpcyByZXRhaW5lZCBmb3IgdGVhcmRvd24gYnV0IGl0cyBzdHJlYW1cblx0ICogaXMgZGVhZCksIHJlYnVpbGQgdmlhIHRoZSByZW1hdGVyaWFsaXplciBzbyBwcmUtZmxpZ2h0IGhlbHBlcnMgbmV2ZXJcblx0ICogb3BlcmF0ZSBvbiBhIGRpc3Bvc2VkIHN0cmVhbS4gVGhlbiBsYXppbHkgYmluZCBpZiBub3RoaW5nIGlzIGJvdW5kIHlldC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZVF1ZXJ5Qm91bmQoKTogUHJvbWlzZTxRdWVyeT4ge1xuXHRcdGlmICh0aGlzLl9uZWVkc1JlYmluZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmViaW5kUXVlcnkoJ3JlY292ZXInKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9xdWVyeSkge1xuXHRcdFx0dGhpcy5fYmluZFdhcm1RdWVyeSgpO1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVwbGF5Q3VycmVudENvbmZpZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcXVlcnkhO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpbmQgYSBmcmVzaCBTREsgc3RyZWFtIG9mZiB0aGUgY3VycmVudCB3YXJtIHN1YnByb2Nlc3MuIFRoZSBzdHJlYW0gaXNcblx0ICogbG9uZy1saXZlZDogaXQgc3BhbnMgZXZlcnkgdHVybiB1bnRpbCBhIHJlYmluZCBzd2FwcyB0aGUgc3VicHJvY2VzcyAodGhlXG5cdCAqIHByb21wdCBpdGVyYWJsZSBwYXJrcyBiZXR3ZWVuIHR1cm5zIHJhdGhlciB0aGFuIGVuZGluZyksIHNvIHtAbGluayBfcXVlcnl9XG5cdCAqIHRyYWNrcyB0aGUgbGlmZXRpbWUgb2Yge0BsaW5rIF93YXJtfSBhbmQgaXMgb25seSBzd2FwcGVkIGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIF9iaW5kV2FybVF1ZXJ5KCk6IFF1ZXJ5IHtcblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuX3dhcm0ucXVlcnkodGhpcy5fcXVldWUuaXRlcmFibGUpO1xuXHRcdHRoaXMuX3F1ZXJ5ID0gcXVlcnk7XG5cdFx0cmV0dXJuIHF1ZXJ5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBTREsgc3RyZWFtIGJvdW5kIHRvIHRoZSBjdXJyZW50IHtAbGluayBfd2FybX0gc3VicHJvY2Vzcywgb3Jcblx0ICogYHVuZGVmaW5lZGAgYmVmb3JlIHRoZSBmaXJzdCBiaW5kLiBIZWFsdGggaXMgdHJhY2tlZCBzZXBhcmF0ZWx5IGJ5XG5cdCAqIHtAbGluayBfbmVlZHNSZWJpbmR9OiBhIG5vbi1gdW5kZWZpbmVkYCBgX3F1ZXJ5YCB3aXRoIGBfbmVlZHNSZWJpbmRgXG5cdCAqIHNldCBpcyBhICpkZWFkKiBzdHJlYW0gYXdhaXRpbmcgcmVidWlsZC4gQ2xlYXJlZCBvbmx5IG9uIGRpc3Bvc2UuXG5cdCAqL1xuXHRwcml2YXRlIF9xdWVyeTogUXVlcnkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dhcm06IFdhcm1RdWVyeTtcblx0cHJpdmF0ZSBfYWJvcnRDb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcXVldWU6IENsYXVkZVByb21wdFF1ZXVlO1xuXG5cdC8qKiBGbGlwcyB0byBgdHJ1ZWAgb24gdGhlIGZpcnN0IGBzeXN0ZW06aW5pdGAgU0RLIG1lc3NhZ2UuIERyaXZlcyBgT3B0aW9ucy5yZXN1bWVgIGRlY2lzaW9ucyBmb3IgZG93bnN0cmVhbSBwaGFzZXMuICovXG5cdHByaXZhdGUgX2lzUmVzdW1lZCA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBOYXRpdmUgcGx1Z2lucyByZXBvcnRlZCBieSB0aGUgbW9zdCByZWNlbnQgYHN5c3RlbTppbml0YCBtZXNzYWdlLlxuXHQgKiBDYXB0dXJlZCBvbiAqZXZlcnkqIGluaXQgKGluY2x1ZGluZyByZXN1bWUpIHNvIHRoZSBwb3N0LW1hdGVyaWFsaXplXG5cdCAqIG5hdGl2ZS1wbHVnaW4gZmlsdGVyIGFsd2F5cyByZWZsZWN0cyB0aGUgbGl2ZSBzZXQuIGBzb3VyY2VgIGlzIHRoZVxuXHQgKiBwbHVnaW4gaWQgYW5kIGlzIHRoZSByZWxpYWJsZSBtYXRjaCBrZXkgKHNlZSB7QGxpbmsgSVNka1Jlc29sdmVkQ3VzdG9taXphdGlvbnN9KS5cblx0ICovXG5cdHByaXZhdGUgX2luaXRQbHVnaW5zOiByZWFkb25seSB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgcGF0aDogc3RyaW5nOyByZWFkb25seSBzb3VyY2U/OiBzdHJpbmcgfVtdID0gW107XG5cblx0LyoqIExhc3QgbW9kZWwgLyBlZmZvcnQgLyBwZXJtaXNzaW9uIG1vZGUgYXBwbGllZCB0byB0aGUgU0RLIHZpYSB0aGUgcnVudGltZSBzZXR0ZXJzLiBSZXNldCBvbiByZWJpbmQuICovXG5cdHByaXZhdGUgX2FwcGxpZWRNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hcHBsaWVkRWZmb3J0OiBDbGF1ZGVSdW50aW1lRWZmb3J0TGV2ZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FwcGxpZWRQZXJtaXNzaW9uTW9kZTogUGVybWlzc2lvbk1vZGUgfCB1bmRlZmluZWQ7XG5cblx0LyoqIEN1cnJlbnQgdmFsdWVzIHRoZSBjb25zdW1lciBoYXMgYXNrZWQgZm9yLiBSZXBsYXllZCB0byBhIGZyZXNoIFF1ZXJ5IG9uIGJpbmQgLyByZWJpbmQuICovXG5cdHByaXZhdGUgX2N1cnJlbnRNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50RWZmb3J0OiBDbGF1ZGVSdW50aW1lRWZmb3J0TGV2ZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRQZXJtaXNzaW9uTW9kZTogUGVybWlzc2lvbk1vZGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcmVtYXRlcmlhbGl6ZXI6IElSZW1hdGVyaWFsaXplciB8IHVuZGVmaW5lZDtcblxuXHQvKiogU2V0IHdoZW4gdGhlIGNvbnN1bWVyIGxvb3AgZW5kcyBpbiBlcnJvciAoY2FuY2VsbGF0aW9uIE9SIGNyYXNoKS4gUmVhZCBieSB7QGxpbmsgc2VuZH0gdG8gdHJpZ2dlciByZWJpbmQuICovXG5cdHByaXZhdGUgX25lZWRzUmViaW5kID0gZmFsc2U7XG5cblx0LyoqIFRyYWNrcyB3aGV0aGVyIHRoZSBjb25zdW1lciBsb29wIGlzIGN1cnJlbnRseSBkcmFpbmluZyB7QGxpbmsgX3F1ZXJ5fS4gKi9cblx0cHJpdmF0ZSBfY29uc3VtZXJMb29wUnVubmluZyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZHVjZVNpZ25hbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpKTtcblx0LyoqXG5cdCAqIFNpbmdsZSBmYW4tb3V0IGZvciBldmVyeSB7QGxpbmsgQWdlbnRTaWduYWx9IHRoaXMgc2Vzc2lvbiBwcm9kdWNlczpcblx0ICogICBcdTIwMjIgUm91dGVyLW1hcHBlZCBwZXItbWVzc2FnZSBzaWduYWxzIChyZXNwb25zZSBwYXJ0cywgdG9vbCBjYWxscyxcblx0ICogICAgIHBlbmRpbmcgY29uZmlybWF0aW9ucywgZXRjLikuXG5cdCAqICAgXHUyMDIyIGBDaGF0VHVybkNvbXBsZXRlYCBhY3Rpb24sIGZpcmVkIHdoZW4gdGhlIExBU1QgZW50cnkgaW4gdGhlXG5cdCAqICAgICBxdWV1ZSBkcmFpbnMgdmlhIGByZXN1bHRgIChpbnRlcm1lZGlhdGUgcmVzdWx0cyBkdXJpbmcgc3RlZXJpbmdcblx0ICogICAgIHByZWVtcHQgZG8gTk9UIGZpcmUgXHUyMDE0IENPTlRFWFQubWQgTTEwKS5cblx0ICogICBcdTIwMjIgYHN0ZWVyaW5nX2NvbnN1bWVkYCBzaWduYWwsIGZpcmVkIHRoZSBtb21lbnQgdGhlIGl0ZXJhYmxlIHlpZWxkc1xuXHQgKiAgICAgYSBzdGVlcmluZyBlbnRyeSB0byB0aGUgU0RLLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRQcm9kdWNlU2lnbmFsOiBFdmVudDxBZ2VudFNpZ25hbD4gPSB0aGlzLl9vbkRpZFByb2R1Y2VTaWduYWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcm91dGVyOiBDbGF1ZGVTZGtNZXNzYWdlUm91dGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHNlc3Npb25Vcmk6IFVSSSxcblx0XHRyZWFkb25seSBjaGF0Q2hhbm5lbFVyaTogVVJJLFxuXHRcdHdhcm06IFdhcm1RdWVyeSxcblx0XHRhYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcixcblx0XHRkYlJlZjogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPixcblx0XHRzdWJhZ2VudHM6IFN1YmFnZW50UmVnaXN0cnksXG5cdFx0Y2xpZW50VG9vbE93bmVyOiAoKHRvb2xOYW1lOiBzdHJpbmcpID0+IHN0cmluZyB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl93YXJtID0gd2FybTtcblx0XHR0aGlzLl9hYm9ydENvbnRyb2xsZXIgPSBhYm9ydENvbnRyb2xsZXI7XG5cdFx0dGhpcy5fd2lyZUFib3J0SGFuZGxlcihhYm9ydENvbnRyb2xsZXIpO1xuXHRcdHRoaXMuX3F1ZXVlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDbGF1ZGVQcm9tcHRRdWV1ZSxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdCgpID0+IHRoaXMuX2Fib3J0Q29udHJvbGxlci5zaWduYWwsXG5cdFx0XHQocGVuZGluZ0lkOiBzdHJpbmcpID0+IHRoaXMuX29uRGlkUHJvZHVjZVNpZ25hbC5maXJlKHtcblx0XHRcdFx0a2luZDogJ3N0ZWVyaW5nX2NvbnN1bWVkJyxcblx0XHRcdFx0Y2hhdDogdGhpcy5jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0aWQ6IHBlbmRpbmdJZCxcblx0XHRcdH0pLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JvdXRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2xhdWRlU2RrTWVzc2FnZVJvdXRlciwgc2Vzc2lvblVyaSwgY2hhdENoYW5uZWxVcmksIGRiUmVmLCBzdWJhZ2VudHMsIGNsaWVudFRvb2xPd25lcixcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yb3V0ZXIub25EaWRQcm9kdWNlU2lnbmFsKHMgPT4gdGhpcy5fb25EaWRQcm9kdWNlU2lnbmFsLmZpcmUocykpKTtcblx0XHQvLyBEaXNwb3NlIGNoYWluIFx1MjE5MiBhYm9ydCBcdTIxOTIgU0RLIGNsZWFudXAuIFJlYWRzIHRoZSAqY3VycmVudCpcblx0XHQvLyBgX2Fib3J0Q29udHJvbGxlcmAgc28gYSBzd2FwIGFib3J0cyB0aGUgbGl2ZSBzdWJwcm9jZXNzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9hYm9ydENvbnRyb2xsZXIuYWJvcnQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZSh0aGlzLl93YXJtW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCkpLmNhdGNoKChlcnI6IHVua25vd24pID0+XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZVNka1BpcGVsaW5lXSBXYXJtUXVlcnkgZGlzcG9zZSBmYWlsZWQ6ICR7ZXJyfWApKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXQgaXNSZXN1bWVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNSZXN1bWVkOyB9XG5cblx0Z2V0IGlzQWJvcnRlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2Fib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZDsgfVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgdHVybiBpcyBjdXJyZW50bHkgaW4gZmxpZ2h0IG9yIHF1ZXVlZC4gRmFsc2UgYmV0d2VlbiB0dXJucyAodGhlXG5cdCAqIHdhcm0gcXVlcnkgcGFya3Mgd2l0aCBhIGRyYWluZWQgcXVldWUpLiBVc2VkIGJ5IG5vbi1kZXN0cnVjdGl2ZSBpZGxlXG5cdCAqIHJlbGVhc2UgdG8gYXZvaWQgdGVhcmluZyB0aGUgcGlwZWxpbmUgZG93biBtaWQtdHVybi5cblx0ICovXG5cdGdldCBoYXNBY3RpdmVUdXJuKCk6IGJvb2xlYW4geyByZXR1cm4gIXRoaXMuX3F1ZXVlLmlzRW1wdHk7IH1cblxuXHQvKipcblx0ICogQWJvcnQgdGhlIGxpdmUgU0RLIHN1YnByb2Nlc3MgYW5kICoqYXdhaXQgaXRzIGFjdHVhbCBleGl0KiouXG5cdCAqXG5cdCAqIGBXYXJtUXVlcnlbU3ltYm9sLmFzeW5jRGlzcG9zZV0oKWAgY2FsbHMgdGhlIHF1ZXJ5J3MgYGNsb3NlKClgLCB3aGljaFxuXHQgKiAqZmlyZXMqIHRoZSBTREsgY2xlYW51cCBidXQgZG9lcyBub3QgYXdhaXQgaXQgXHUyMDE0IHNvIGl0IHJldHVybnMgd2hpbGUgdGhlXG5cdCAqIHN1YnByb2Nlc3MgaXMgc3RpbGwgc2h1dHRpbmcgZG93biAoYW5kIHN0aWxsIHJlLWZsdXNoaW5nIGl0cyB0cmFuc2NyaXB0KS5cblx0ICogYFF1ZXJ5LnJldHVybigpYCBhd2FpdHMgdGhlIHNhbWUgKG1lbW9pemVkKSBjbGVhbnVwLCB3aGljaCBpbiB0dXJuIGF3YWl0c1xuXHQgKiBgdHJhbnNwb3J0LndhaXRGb3JFeGl0KClgIFx1MjAxNCB0aGUgT1MgcHJvY2VzcyBhY3R1YWxseSBleGl0aW5nIGFmdGVyIGl0c1xuXHQgKiBmaW5hbCB0cmFuc2NyaXB0IGZsdXNoLiBBd2FpdGluZyB0aGF0IGlzIHdoYXQgbGV0cyBhIGNhbGxlciBzYWZlbHkgcmV1c2Vcblx0ICogdGhlIGAtLXNlc3Npb24taWRgICh0aGUgQ0xJIHJlamVjdHMgYSBmcmVzaCBzcGF3biB3aGlsZSBgPGlkPi5qc29ubGBcblx0ICogc3RpbGwgZXhpc3RzLCBhbmQgdGhlIGR5aW5nIHByb2Nlc3Mgd291bGQgb3RoZXJ3aXNlIHJlY3JlYXRlIGl0KS5cblx0ICovXG5cdGFzeW5jIHNodXRkb3duQW5kV2FpdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fd2FybVtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpO1xuXHRcdFx0YXdhaXQgdGhpcy5fcXVlcnk/LnJldHVybih1bmRlZmluZWQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHNodXRkb3duQW5kV2FpdDogdGVhcmRvd24gZmFpbGVkYCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGhhc2UgMTAgXFx1MjAxNCBuYXJyb3cgcHVibGljIHdyYXBwZXIgYXJvdW5kIHRoZSBpbnRlcm5hbFxuXHQgKiB7QGxpbmsgX3JlYmluZFF1ZXJ5fSBzbyB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9uLnJlYmluZEZvckNsaWVudFRvb2xzfVxuXHQgKiBjYW4gZHJpdmUgYSB5aWVsZC1yZXN0YXJ0IHdpdGhvdXQgZXhwb3NpbmcgdGhlIHByaXZhdGUgcmViaW5kXG5cdCAqIG1hY2hpbmVyeSB0byBldmVyeSBjb2xsYWJvcmF0b3IuXG5cdCAqL1xuXHRyZWJpbmRGb3JSZXN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWJpbmRRdWVyeSgncmVzdGFydCcpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBoYXNlIDEwIFx1MjAxNCB1cGRhdGUgdGhlIHJlc29sdmVyIHRoZSBzdHJlYW0gbWFwcGVyIHVzZXMgdG8gc3RhbXAgdGhlXG5cdCAqIG93bmluZyB3b3JrYmVuY2ggYGNsaWVudElkYCBvbnRvIHN1YnNlcXVlbnQgYENoYXRUb29sQ2FsbFN0YXJ0YCBldmVudHMuXG5cdCAqL1xuXHRzZXRDbGllbnRUb29sT3duZXIoY2xpZW50VG9vbE93bmVyOiAoKHRvb2xOYW1lOiBzdHJpbmcpID0+IHN0cmluZyB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9yb3V0ZXIuc2V0Q2xpZW50VG9vbE93bmVyKGNsaWVudFRvb2xPd25lcik7XG5cdH1cblxuXHQvKiogQXR0YWNoIHRoZSByZW1hdGVyaWFsaXplciBob29rIGZvciBhYm9ydCAvIGNyYXNoIHJlY292ZXJ5LiBPcHRpb25hbCBcdTIwMTQgdGVzdHMgdGhhdCBleGVyY2lzZSBvbmx5IHRoZSBkaXNwb3NlIHBhdGggc2tpcCB0aGlzLiAqL1xuXHRhdHRhY2hSZW1hdGVyaWFsaXplcihyZW1hdGVyaWFsaXplcjogSVJlbWF0ZXJpYWxpemVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVtYXRlcmlhbGl6ZXIgPSByZW1hdGVyaWFsaXplcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkIHRoZSBjdXJyZW50ICsgYXBwbGllZCBjb25maWcgZnJvbSBtYXRlcmlhbGl6ZS10aW1lIGBPcHRpb25zYC5cblx0ICogVGhlIFNESyBhbHJlYWR5IHN0YXJ0cyB3aXRoIHRoZXNlIHZhbHVlcywgc28gd2UgbWFyayB0aGVtIGFzIGJvdGhcblx0ICogXCJjdXJyZW50XCIgKHdoYXQgdGhlIGNvbnN1bWVyIHdhbnRzKSBhbmQgXCJhcHBsaWVkXCIgKHdoYXQgdGhlIFNESyBoYXMpXG5cdCAqIHRvIGF2b2lkIGEgcmVkdW5kYW50IGBzZXRNb2RlbGAgLyBgYXBwbHlGbGFnU2V0dGluZ3NgIG9uIGZpcnN0IHVzZS5cblx0ICovXG5cdHNlZWRDdXJyZW50Q29uZmlnKG1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGVmZm9ydDogQ2xhdWRlUnVudGltZUVmZm9ydExldmVsIHwgdW5kZWZpbmVkLCBwZXJtaXNzaW9uTW9kZTogUGVybWlzc2lvbk1vZGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50TW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9jdXJyZW50RWZmb3J0ID0gZWZmb3J0O1xuXHRcdHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTW9kZSA9IHBlcm1pc3Npb25Nb2RlO1xuXHRcdHRoaXMuX2FwcGxpZWRNb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2FwcGxpZWRFZmZvcnQgPSBlZmZvcnQ7XG5cdFx0dGhpcy5fYXBwbGllZFBlcm1pc3Npb25Nb2RlID0gcGVybWlzc2lvbk1vZGU7XG5cdH1cblxuXHQvKipcblx0ICogRWFnZXJseSBwdXNoIGEgbW9kZWwgY2hhbmdlIHRvIHRoZSBTREsuIFNhZmUgdG8gY2FsbCBtaWQtdHVybjpcblx0ICogYFF1ZXJ5LnNldE1vZGVsYCBvbmx5IHRha2VzIGVmZmVjdCBvbiB0aGUgTkVYVCB1c2VyIHJlcXVlc3QuIE5vLW9wXG5cdCAqIGlmIHRoZSB2YWx1ZSBpcyB1bmNoYW5nZWQuIEJ1ZmZlcmVkIGFzIGBfY3VycmVudE1vZGVsYCB1bnRpbCB0aGVcblx0ICogUXVlcnkgaXMgYm91bmQgKGFuZCByZXBsYXllZCBvbiByZWJpbmQpLlxuXHQgKi9cblx0YXN5bmMgc2V0TW9kZWwobW9kZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2N1cnJlbnRNb2RlbCA9IG1vZGVsO1xuXHRcdGlmICh0aGlzLl9xdWVyeSAmJiAhdGhpcy5fbmVlZHNSZWJpbmQgJiYgbW9kZWwgIT09IHRoaXMuX2FwcGxpZWRNb2RlbCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcXVlcnkuc2V0TW9kZWwobW9kZWwpO1xuXHRcdFx0XHR0aGlzLl9hcHBsaWVkTW9kZWwgPSBtb2RlbDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZToke3RoaXMuc2Vzc2lvbklkfV0gc2V0TW9kZWwgZmFpbGVkOiAke2Vycn1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRWFnZXJseSBwdXNoIGFuIGVmZm9ydC1sZXZlbCBjaGFuZ2UgdG8gdGhlIFNESyB2aWFcblx0ICogYGFwcGx5RmxhZ1NldHRpbmdzKHsgZWZmb3J0TGV2ZWwgfSlgLiBTYW1lIG1pZC10dXJuIHNhZmV0eSBhc1xuXHQgKiB7QGxpbmsgc2V0TW9kZWx9LlxuXHQgKlxuXHQgKiBgdW5kZWZpbmVkYCBtZWFucyBcImNsZWFyIHRoZSBlZmZvcnQgdGhlIFNESyBpcyBjdXJyZW50bHkgYXBwbHlpbmdcIiBcdTIwMTRcblx0ICogaXNzdWVkIGFzIGBhcHBseUZsYWdTZXR0aW5ncyh7IGVmZm9ydExldmVsOiBudWxsIH0pYCAoc2RrLmQudHM6MjI2Mzpcblx0ICogcGFzc2luZyBgbnVsbGAgY2xlYXJzIGEga2V5IGZyb20gdGhlIGZsYWcgbGF5ZXIpLiBUaGlzIGlzIHdoYXQgbWFrZXMgYVxuXHQgKiBzd2l0Y2ggdG8gYSBtb2RlbCB0aGF0IGRvZXMgbm90IHN1cHBvcnQgcmVhc29uaW5nIGVmZm9ydCAoZS5nLiBIYWlrdSlcblx0ICogZHJvcCBhIGAnaGlnaCdgIGxlZnQgb3ZlciBmcm9tIGEgcHJpb3IgZWZmb3J0LWNhcGFibGUgbW9kZWwgaW5zdGVhZCBvZlxuXHQgKiByZXBsYXlpbmcgaXQgb250byBhIG1vZGVsIHRoZSBBUEkgd2lsbCA0MDAgb24uXG5cdCAqL1xuXHRhc3luYyBzZXRFZmZvcnQoZWZmb3J0OiBDbGF1ZGVSdW50aW1lRWZmb3J0TGV2ZWwgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9jdXJyZW50RWZmb3J0ID0gZWZmb3J0O1xuXHRcdGlmICh0aGlzLl9xdWVyeSAmJiAhdGhpcy5fbmVlZHNSZWJpbmQgJiYgZWZmb3J0ICE9PSB0aGlzLl9hcHBsaWVkRWZmb3J0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9xdWVyeS5hcHBseUZsYWdTZXR0aW5ncyh7IGVmZm9ydExldmVsOiBlZmZvcnQgPz8gbnVsbCB9KTtcblx0XHRcdFx0dGhpcy5fYXBwbGllZEVmZm9ydCA9IGVmZm9ydDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZToke3RoaXMuc2Vzc2lvbklkfV0gc2V0RWZmb3J0IGZhaWxlZDogJHtlcnJ9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFF1ZXVlIGEgdXNlciBwcm9tcHQgZm9yIHRoZSBTREsuIFJlc29sdmVzIHdoZW4gdGhlIG1hdGNoaW5nXG5cdCAqIGByZXN1bHRgIG1lc3NhZ2UgYXJyaXZlcy5cblx0ICpcblx0ICogSWYgYSBwcmV2aW91cyB0dXJuIGFib3J0ZWQgb3IgY3Jhc2hlZCwgdGhpcyB0cmlnZ2VycyBhIHJlYmluZCB2aWFcblx0ICogdGhlIGF0dGFjaGVkIHJlbWF0ZXJpYWxpemVyIGJlZm9yZSBxdWV1ZWluZy5cblx0ICovXG5cdGFzeW5jIHNlbmQocHJvbXB0OiBTREtVc2VyTWVzc2FnZSwgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fbmVlZHNSZWJpbmQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlYmluZFF1ZXJ5KCdyZWNvdmVyJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3F1ZXJ5KSB7XG5cdFx0XHR0aGlzLl9iaW5kV2FybVF1ZXJ5KCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXBsYXlDdXJyZW50Q29uZmlnKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Vuc3VyZUNvbnN1bWVyTG9vcCgpO1xuXHRcdGNvbnN0IGVudHJ5OiBJUGVuZGluZ1Nka01lc3NhZ2UgPSB7XG5cdFx0XHRzZGtNZXNzYWdlOiBwcm9tcHQsXG5cdFx0XHRzZGtVdWlkOiB0eXBlb2YgcHJvbXB0LnV1aWQgPT09ICdzdHJpbmcnID8gcHJvbXB0LnV1aWQgOiB0dXJuSWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzdG9wV2F0Y2g6IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpLFxuXHRcdFx0ZGVmZXJyZWQ6IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKSxcblx0XHR9O1xuXHRcdHJldHVybiB0aGlzLl9xdWV1ZS5wdXNoKGVudHJ5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQdXNoIGEgYHByaW9yaXR5OiAnbm93J2Agc3RlZXJpbmcgbWVzc2FnZSBpbnRvIHRoZSBpdGVyYWJsZS4gVGhlXG5cdCAqIGNhbGxlciBwcmUtYnVpbGRzIHRoZSB7QGxpbmsgU0RLVXNlck1lc3NhZ2V9ICh0aGUgcGlwZWxpbmUgaXMgU0RLXG5cdCAqIG1lc3NhZ2luZy1zaGFwZWQsIG5vdCBwcm90b2NvbC1zaGFwZWQpLiBgcGVuZGluZ01lc3NhZ2VJZGAgaXMgdGhlXG5cdCAqIHByb3RvY29sIGBQZW5kaW5nTWVzc2FnZS5pZGAgdGhhdCB7QGxpbmsgb25TdGVlcmluZ0NvbnN1bWVkfSB3aWxsXG5cdCAqIGNhcnJ5IHdoZW4gdGhlIFNESyBhY2NlcHRzIHRoZSBtZXNzYWdlLlxuXHQgKlxuXHQgKiBOby1vcCBpZiB0aGUgcGlwZWxpbmUgaXMgYWJvcnRlZCBvciBubyBpbi1mbGlnaHQgLyBxdWV1ZWQgcmVxdWVzdFxuXHQgKiBleGlzdHMgdG8gaW5oZXJpdCBhIGB0dXJuSWRgIGZyb20gKENPTlRFWFQubWQgTTEwOiBzdGVlcmluZyBmb2xkc1xuXHQgKiBpbnRvIHRoZSBpbi1wcm9ncmVzcyBwcm90b2NvbCBUdXJuKS5cblx0ICovXG5cdGluamVjdFN0ZWVyaW5nKHByb21wdDogU0RLVXNlck1lc3NhZ2UsIHBlbmRpbmdNZXNzYWdlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gaW5qZWN0U3RlZXJpbmc6IGRyb3BwZWQgKGNvbnRyb2xsZXIgYWJvcnRlZCkgaWQ9JHtwZW5kaW5nTWVzc2FnZUlkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLl9xdWV1ZS5wZWVrUGFyZW50KCk7XG5cdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gaW5qZWN0U3RlZXJpbmc6IGRyb3BwZWQgKG5vIGluLWZsaWdodCB0dXJuKSBpZD0ke3BlbmRpbmdNZXNzYWdlSWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNka1V1aWQgPSB0eXBlb2YgcHJvbXB0LnV1aWQgPT09ICdzdHJpbmcnID8gcHJvbXB0LnV1aWQgOiBwZW5kaW5nTWVzc2FnZUlkO1xuXHRcdC8vIFN0ZWVyaW5nIGRlZmVycmVkcyBhcmVuJ3Qgb2JzZXJ2ZWQgYnkgYW55b25lICh0aGUgYWdlbnQncyBzZW5kXG5cdFx0Ly8gcHJvbWlzZSBpcyB0aGUgb3JpZ2luYWwgZW50cnkncyBkZWZlcnJlZCk7IGF0dGFjaCBhIG5vLW9wIGNhdGNoXG5cdFx0Ly8gc28gYSBgZmFpbEFsbGAgcmVqZWN0aW9uIG9uIGFib3J0L2NyYXNoIGRvZXNuJ3Qgc3VyZmFjZSBhcyBhblxuXHRcdC8vIHVuaGFuZGxlZCByZWplY3Rpb24uXG5cdFx0dGhpcy5fcXVldWUucHVzaCh7XG5cdFx0XHRzZGtNZXNzYWdlOiBwcm9tcHQsXG5cdFx0XHRzZGtVdWlkLFxuXHRcdFx0dHVybklkOiBwYXJlbnQudHVybklkLFxuXHRcdFx0c3RvcFdhdGNoOiBwYXJlbnQuc3RvcFdhdGNoLFxuXHRcdFx0ZGVmZXJyZWQ6IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKSxcblx0XHRcdHN0ZWVyaW5nUGVuZGluZ0lkOiBwZW5kaW5nTWVzc2FnZUlkLFxuXHRcdH0pLmNhdGNoKCgpID0+IHsgLyogZXhwZWN0ZWQgb24gYWJvcnQvY3Jhc2ggKi8gfSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlOiR7dGhpcy5zZXNzaW9uSWR9XSBpbmplY3RTdGVlcmluZzogZW5xdWV1ZWQgaWQ9JHtwZW5kaW5nTWVzc2FnZUlkfSBzZGtVdWlkPSR7c2RrVXVpZH1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgdGhlIGluLWZsaWdodCBTREsgdHVybiB2aWEgdGhlIGFib3J0IGNvbnRyb2xsZXIuIE1pcnJvcnNcblx0ICogdGhlIHByb2R1Y3Rpb24gcmVmZXJlbmNlIChgY2xhdWRlQ29kZUFnZW50LnRzOjcxOWApLiBEcm9wcyBldmVyeVxuXHQgKiBwZW5kaW5nIGVudHJ5J3MgZGVmZXJyZWQgKHJlamVjdGVkIHdpdGggYENhbmNlbGxhdGlvbkVycm9yYCksXG5cdCAqIG1hcmtzIHRoZSBwaXBlbGluZSBmb3IgcmViaW5kIG9uIG5leHQge0BsaW5rIHNlbmR9LiBJZGVtcG90ZW50LlxuXHQgKlxuXHQgKiBTYWZlIHRvIGNhbGwgZHVyaW5nIHJlYmluZDoge0BsaW5rIF9yZWJpbmRRdWVyeX0gc3dhcHMgaW4gYSBmcmVzaFxuXHQgKiBwbGFjZWhvbGRlciB7QGxpbmsgQWJvcnRDb250cm9sbGVyfSBiZWZvcmUgYXdhaXRpbmcgdGhlXG5cdCAqIHJlbWF0ZXJpYWxpemVyLCBzbyBhbiBhYm9ydCBpc3N1ZWQgZHVyaW5nIHJlY292ZXJ5IGxhbmRzIG9uIHRoYXRcblx0ICogcGxhY2Vob2xkZXIgYW5kIGlzIGhvbm9yZWQgd2hlbiB0aGUgZnJlc2hseS1idWlsdCBwYWlyIGFycml2ZXNcblx0ICogKHRoZSByZWJpbmQgZGlzY2FyZHMgdGhlIG5ldyBwYWlyIGFuZCBzdXJmYWNlcyBhIGNhbmNlbGxhdGlvbikuXG5cdCAqL1xuXHRhYm9ydCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Fib3J0Q29udHJvbGxlci5hYm9ydCgpO1xuXHRcdHRoaXMuX3F1ZXVlLmZhaWxBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdC8vIE1hcmsgdW5oZWFsdGh5IGJ1dCBrZWVwIHRoZSBgX3F1ZXJ5YCBoYW5kbGU6IHRoZSBuZXh0IGBzZW5kYCByZWJpbmRzLFxuXHRcdC8vIGFuZCBgc2h1dGRvd25BbmRXYWl0YCBzdGlsbCBuZWVkcyBpdCB0byBhd2FpdCB0aGUgc3VicHJvY2VzcyBleGl0LlxuXHRcdHRoaXMuX25lZWRzUmViaW5kID0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkcyB0byB7QGxpbmsgUXVlcnkuc2V0UGVybWlzc2lvbk1vZGV9IG9uY2UgdGhlIHF1ZXJ5IGlzXG5cdCAqIGJvdW5kOyB0aGUgdmFsdWUgaXMgYWxzbyByZW1lbWJlcmVkIHNvIGl0J3MgcmUtYXBwbGllZCBhZnRlciBhXG5cdCAqIHJlYmluZC4gUGVybWlzc2lvbiBtb2RlIGlzIHdob2xlLXNlc3Npb24gKG5vdCBwZXItZW50cnkpLlxuXHQgKi9cblx0YXN5bmMgc2V0UGVybWlzc2lvbk1vZGUobW9kZTogUGVybWlzc2lvbk1vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9jdXJyZW50UGVybWlzc2lvbk1vZGUgPSBtb2RlO1xuXHRcdGlmICh0aGlzLl9xdWVyeSAmJiAhdGhpcy5fbmVlZHNSZWJpbmQgJiYgbW9kZSAhPT0gdGhpcy5fYXBwbGllZFBlcm1pc3Npb25Nb2RlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9xdWVyeS5zZXRQZXJtaXNzaW9uTW9kZShtb2RlKTtcblx0XHRcdHRoaXMuX2FwcGxpZWRQZXJtaXNzaW9uTW9kZSA9IG1vZGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd2lyZUFib3J0SGFuZGxlcihjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIpOiB2b2lkIHtcblx0XHRjb250cm9sbGVyLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsICgpID0+IHtcblx0XHRcdHRoaXMuX3F1ZXVlLm5vdGlmeUFib3J0ZWQoKTtcblx0XHR9LCB7IG9uY2U6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVDb25zdW1lckxvb3AoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbnN1bWVyTG9vcFJ1bm5pbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29uc3VtZXJMb29wUnVubmluZyA9IHRydWU7XG5cdFx0dGhpcy5fcnVuQ29uc3VtZXJMb29wKCk7XG5cdH1cblxuXHQvKipcblx0ICogUnVucyBvbmUge0BsaW5rIF9wcm9jZXNzTWVzc2FnZXN9IHBhc3Mgb3ZlciB0aGUgbGl2ZSB7QGxpbmsgX3F1ZXJ5fSBhbmQsXG5cdCAqIHdoZW4gaXQgZW5kcywgZGVjaWRlcyB3aGV0aGVyIHRvIGhhbmQgb2ZmIHRvIGEgZnJlc2ggcGFzcy5cblx0ICpcblx0ICogQSByZWJpbmQgKHtAbGluayBfcmViaW5kUXVlcnl9KSBzd2FwcyBpbiBhIG5ldyBgX3F1ZXJ5YCB3aGlsZSB0aGUgbG9vcCBpc1xuXHQgKiBzdGlsbCBkcmFpbmluZyB0aGUgT0xEIChub3ctZGlzcG9zZWQpIG9uZTsgdGhhdCBvbGQgcGFzcyB0aGVuIGVuZHMgd2l0aFxuXHQgKiB0aGUgXCJzdHJlYW0gZW5kZWQgd2l0aG91dCBhIHJlc3VsdFwiIGd1YXJkLiBCZWNhdXNlIGBfY29uc3VtZXJMb29wUnVubmluZ2Bcblx0ICogc3RheXMgYHRydWVgIGZvciB0aGUgd2hvbGUgaGFuZG9mZiwgdGhlIHtAbGluayBzZW5kfSB0aGF0IHF1ZXVlZCB0aGVcblx0ICogcG9zdC1yZWJpbmQgcHJvbXB0IGFscmVhZHkgc2F3IHtAbGluayBfZW5zdXJlQ29uc3VtZXJMb29wfSBuby1vcCBcdTIwMTQgc28gaWZcblx0ICogdGhpcyBwYXNzIGp1c3Qgc3RvcHBlZCwgbm90aGluZyB3b3VsZCBldmVyIHJlYWQgdGhlIG5ldyBxdWVyeSBhbmQgYHNlbmRgXG5cdCAqIHdvdWxkIGhhbmcuIERldGVjdCB0aGUgc3dhcCAoY3VycmVudCBgX3F1ZXJ5YCBkaWZmZXJzIGZyb20gdGhlIG9uZSB0aGlzXG5cdCAqIHBhc3MgYm91bmQpIGFuZCByZS1hcm0gZm9yIGl0IGluc3RlYWQuIEFib3J0IC8gY3Jhc2ggLyBkaXNwb3NlIGxlYXZlXG5cdCAqIGBfcXVlcnlgIGNsZWFyZWQgKG9yIHRoZSBzdG9yZSBkaXNwb3NlZCksIHNvIHRoZXkgZmFsbCB0aHJvdWdoIHRvIHN0b3AuXG5cdCAqL1xuXHRwcml2YXRlIF9ydW5Db25zdW1lckxvb3AoKTogdm9pZCB7XG5cdFx0Y29uc3QgYm91bmRRdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuXHRcdHZvaWQgdGhpcy5fcHJvY2Vzc01lc3NhZ2VzKClcblx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NsYXVkZVNka1BpcGVsaW5lOiR7dGhpcy5zZXNzaW9uSWR9XSBfcHJvY2Vzc01lc3NhZ2VzIGNyYXNoZWQ6ICR7ZXJyfWApKVxuXHRcdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgJiYgdGhpcy5fcXVlcnkgJiYgdGhpcy5fcXVlcnkgIT09IGJvdW5kUXVlcnkpIHtcblx0XHRcdFx0XHR0aGlzLl9ydW5Db25zdW1lckxvb3AoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9jb25zdW1lckxvb3BSdW5uaW5nID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1c2ggdGhlIGN1cnJlbnQgbW9kZWwgLyBlZmZvcnQgLyBwZXJtaXNzaW9uTW9kZSB0byB0aGUgU0RLIGlmIHRoZXlcblx0ICogZGl2ZXJnZSBmcm9tIHdoYXQgd2FzIGxhc3QgYXBwbGllZC4gQ2FsbGVkIGFmdGVyIGJpbmRpbmcgYSBmcmVzaFxuXHQgKiBRdWVyeSAoaW5pdGlhbCBmaXJzdC1zZW5kIGFuZCBhZnRlciByZWJpbmQpLiBGYWlsdXJlcyBhcmUgbG9nZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVwbGF5Q3VycmVudENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRNb2RlbCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2N1cnJlbnRNb2RlbCAhPT0gdGhpcy5fYXBwbGllZE1vZGVsKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3F1ZXJ5Py5zZXRNb2RlbCh0aGlzLl9jdXJyZW50TW9kZWwpO1xuXHRcdFx0XHR0aGlzLl9hcHBsaWVkTW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEVmZm9ydCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2N1cnJlbnRFZmZvcnQgIT09IHRoaXMuX2FwcGxpZWRFZmZvcnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcXVlcnk/LmFwcGx5RmxhZ1NldHRpbmdzKHsgZWZmb3J0TGV2ZWw6IHRoaXMuX2N1cnJlbnRFZmZvcnQgfSk7XG5cdFx0XHRcdHRoaXMuX2FwcGxpZWRFZmZvcnQgPSB0aGlzLl9jdXJyZW50RWZmb3J0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTW9kZSAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTW9kZSAhPT0gdGhpcy5fYXBwbGllZFBlcm1pc3Npb25Nb2RlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3F1ZXJ5Py5zZXRQZXJtaXNzaW9uTW9kZSh0aGlzLl9jdXJyZW50UGVybWlzc2lvbk1vZGUpO1xuXHRcdFx0XHR0aGlzLl9hcHBsaWVkUGVybWlzc2lvbk1vZGUgPSB0aGlzLl9jdXJyZW50UGVybWlzc2lvbk1vZGU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZToke3RoaXMuc2Vzc2lvbklkfV0gX3JlcGxheUN1cnJlbnRDb25maWcgZmFpbGVkOiAke2Vycn1gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZSB0aGUgZGVhZCBTREsgcGx1bWJpbmcgYW5kIHJlYnVpbGQgdmlhIHRoZSBhZ2VudC1zdXBwbGllZFxuXHQgKiByZW1hdGVyaWFsaXplciBpbiBgcmVzdW1lYCBtb2RlLiBSZS1hcHBsaWVzIHRoZSBjdXJyZW50IG1vZGVsIC9cblx0ICogZWZmb3J0IC8gcGVybWlzc2lvbiBtb2RlIHRvIHRoZSBmcmVzaCBRdWVyeS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYmluZFF1ZXJ5KHJlYXNvbjogJ3Jlc3RhcnQnIHwgJ3JlY292ZXInKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1hdGVyaWFsaXplcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDbGF1ZGVTZGtQaXBlbGluZS5yZWJpbmQ6IG5vIHJlbWF0ZXJpYWxpemVyIGF0dGFjaGVkIChyZWFzb249JHtyZWFzb259KWApO1xuXHRcdH1cblx0XHRjb25zdCBvbGRXYXJtID0gdGhpcy5fd2FybTtcblx0XHQvLyBJbnN0YWxsIGEgcGxhY2Vob2xkZXIgY29udHJvbGxlciBCRUZPUkUgYXdhaXRpbmcgdGhlXG5cdFx0Ly8gcmVtYXRlcmlhbGl6ZXIgc28gYSBjb25jdXJyZW50IHtAbGluayBhYm9ydH0gaGFzIGEgbGl2ZSB0YXJnZXRcblx0XHQvLyBpbnN0ZWFkIG9mIHJldHVybmluZyBlYXJseSBhcyBpZGVtcG90ZW50IGFnYWluc3QgdGhlIGFscmVhZHktXG5cdFx0Ly8gYWJvcnRlZCBvbGQgY29udHJvbGxlci5cblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHR0aGlzLl9hYm9ydENvbnRyb2xsZXIgPSBwbGFjZWhvbGRlcjtcblx0XHRjb25zdCBidWlsdCA9IGF3YWl0IHRoaXMuX3JlbWF0ZXJpYWxpemVyKHJlYXNvbik7XG5cdFx0Ly8gRGlzcG9zZSBtYXkgaGF2ZSBydW4gd2hpbGUgd2Ugd2VyZSBhd2FpdGluZyB0aGUgcmVtYXRlcmlhbGl6ZXIuXG5cdFx0Ly8gVGhlIGRpc3Bvc2UgY2hhaW4gaGFzIGFscmVhZHkgdG9ybiBkb3duIHRoZSBPTEQgd2FybS9jb250cm9sbGVyO1xuXHRcdC8vIHRoZSBmcmVzaGx5LWJ1aWx0IHBhaXIgd291bGQgb3RoZXJ3aXNlIGxlYWsgaXRzIHN1YnByb2Nlc3MuIE1pcnJvclxuXHRcdC8vIHRoZSBwb3N0LWF3YWl0IGFib3J0IGdhdGUgaW4gYF9tYXRlcmlhbGl6ZVByb3Zpc2lvbmFsYC5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0YnVpbHQuYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShidWlsdC53YXJtW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCkpLmNhdGNoKChlcnI6IHVua25vd24pID0+XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZVNka1BpcGVsaW5lOiR7dGhpcy5zZXNzaW9uSWR9XSByZWJpbmQtYWZ0ZXItZGlzcG9zZTogd2FybSBkaXNwb3NlIGZhaWxlZDogJHtlcnJ9YCkpO1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdC8vIEFib3J0IGlzc3VlZCB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nIHRoZSByZW1hdGVyaWFsaXplciBsYW5kZWQgb25cblx0XHQvLyB0aGUgcGxhY2Vob2xkZXIuIERpc2NhcmQgdGhlIGZyZXNobHktYnVpbHQgcGFpciBhbmQgc3VyZmFjZSBhXG5cdFx0Ly8gY2FuY2VsbGF0aW9uIHRvIHRoZSBpbi1mbGlnaHQgYHNlbmRgLlxuXHRcdGlmIChwbGFjZWhvbGRlci5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0YnVpbHQuYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShidWlsdC53YXJtW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCkpLmNhdGNoKChlcnI6IHVua25vd24pID0+XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZVNka1BpcGVsaW5lOiR7dGhpcy5zZXNzaW9uSWR9XSByZWJpbmQtYWJvcnRlZDogd2FybSBkaXNwb3NlIGZhaWxlZDogJHtlcnJ9YCkpO1xuXHRcdFx0dm9pZCBQcm9taXNlLnJlc29sdmUob2xkV2FybVtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpKS5jYXRjaCgoZXJyOiB1bmtub3duKSA9PlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZToke3RoaXMuc2Vzc2lvbklkfV0gcHJldmlvdXMgV2FybVF1ZXJ5IGRpc3Bvc2UgZmFpbGVkIGR1cmluZyBhYm9ydGVkIHJlYmluZDogJHtlcnJ9YCkpO1xuXHRcdFx0dGhpcy5fcXVldWUuZmFpbEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR0aGlzLl9uZWVkc1JlYmluZCA9IHRydWU7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0dm9pZCBQcm9taXNlLnJlc29sdmUob2xkV2FybVtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpKS5jYXRjaCgoZXJyOiB1bmtub3duKSA9PlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlU2RrUGlwZWxpbmU6JHt0aGlzLnNlc3Npb25JZH1dIHByZXZpb3VzIFdhcm1RdWVyeSBkaXNwb3NlIGZhaWxlZCBkdXJpbmcgcmViaW5kOiAke2Vycn1gKSk7XG5cdFx0dGhpcy5fd2FybSA9IGJ1aWx0Lndhcm07XG5cdFx0dGhpcy5fYWJvcnRDb250cm9sbGVyID0gYnVpbHQuYWJvcnRDb250cm9sbGVyO1xuXHRcdHRoaXMuX3dpcmVBYm9ydEhhbmRsZXIoYnVpbHQuYWJvcnRDb250cm9sbGVyKTtcblx0XHR0aGlzLl9xdWV1ZS5yZXNldEZvclJlYmluZCgpO1xuXHRcdHRoaXMuX25lZWRzUmViaW5kID0gZmFsc2U7XG5cdFx0Ly8gTmV3IFNESyBzdGFydHMgd2l0aCB0aGUgbWF0ZXJpYWxpemVyJ3MgYE9wdGlvbnMubW9kZWxgIC8gZWZmb3J0IC9cblx0XHQvLyBwZXJtaXNzaW9uTW9kZSBidXQgd2UgZG9uJ3QgdHJ1c3QgdGhhdCB0byBtYXRjaCBgX2N1cnJlbnRNb2RlbGBcblx0XHQvLyBldGMuIFx1MjAxNCByZXNldCB0aGUgYXBwbGllZCBjYWNoZSBhbmQgbGV0IGBfcmVwbGF5Q3VycmVudENvbmZpZ2Bcblx0XHQvLyBwdXNoIHdoYXRldmVyIHRoZSBjb25zdW1lciBsYXN0IHNldC5cblx0XHR0aGlzLl9hcHBsaWVkTW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYXBwbGllZEVmZm9ydCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hcHBsaWVkUGVybWlzc2lvbk1vZGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYmluZFdhcm1RdWVyeSgpO1xuXHRcdGF3YWl0IHRoaXMuX3JlcGxheUN1cnJlbnRDb25maWcoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdW1lciBsb29wLiBEcmFpbnMgdGhlIFNESyBpdGVyYXRvciwgZGlzcGF0Y2hlcyBlYWNoIG1lc3NhZ2Vcblx0ICogdG8gdGhlIHtAbGluayBDbGF1ZGVTZGtNZXNzYWdlUm91dGVyfSAoYXdhaXRlZCBzbyBhc3luYyBmaWxlLWVkaXRcblx0ICogb2JzZXJ2YXRpb24gY29tcGxldGVzIGJlZm9yZSB0aGUgbmV4dCBtZXNzYWdlKSwgc2V0dGxlcyB0aGUgaGVhZFxuXHQgKiBlbnRyeSdzIGRlZmVycmVkIG9uIGByZXN1bHRgLCBhbmQgZmlyZXMgYENoYXRUdXJuQ29tcGxldGVgIG9ubHlcblx0ICogd2hlbiB0aGUgcXVldWUgZnVsbHkgZHJhaW5zLlxuXHQgKlxuXHQgKiBPbiBhbnkgdW5jYXVnaHQgZXJyb3IgKGNhbmNlbGxhdGlvbiwgdHJhbnNwb3J0IGZhaWx1cmUsIG9yIHRoZVxuXHQgKiBwb3N0LWxvb3AgXCJzdHJlYW0gZW5kZWQgd2l0aG91dCByZXN1bHRcIiBndWFyZCkgdGhlIGNhdGNoIGJsb2NrXG5cdCAqIHJlamVjdHMgZXZlcnkgcGVuZGluZyBlbnRyeSdzIGRlZmVycmVkIHdpdGggdGhlIHNhbWUgZXJyb3IgYW5kXG5cdCAqIG1hcmtzIGBfbmVlZHNSZWJpbmQ9dHJ1ZWAuIENhbmNlbGxhdGlvbiBpcyBzd2FsbG93ZWQgKGRvbid0XG5cdCAqIHJldGhyb3cpOyBvdGhlciBlcnJvcnMgcHJvcGFnYXRlIHRvIHRoZSB2b2lkIGNhbGxlcidzIGAuY2F0Y2hgIGZvclxuXHQgKiBsb2dnaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcHJvY2Vzc01lc3NhZ2VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5fcXVlcnk7XG5cdFx0aWYgKCFxdWVyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDbGF1ZGVTZGtQaXBlbGluZS5fcHJvY2Vzc01lc3NhZ2VzIGNhbGxlZCBiZWZvcmUgcXVlcnkgd2FzIGJvdW5kJyk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IG1lc3NhZ2Ugb2YgcXVlcnkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2Fib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdzeXN0ZW0nICYmIG1lc3NhZ2Uuc3VidHlwZSA9PT0gJ2luaXQnKSB7XG5cdFx0XHRcdFx0Ly8gQ2FwdHVyZSB0aGUgbG9hZGVkIG5hdGl2ZS1wbHVnaW4gbGlzdCBvbiBldmVyeSBpbml0IChpbmNsLlxuXHRcdFx0XHRcdC8vIHJlc3VtZSAvIHBvc3QtcmViaW5kKSBzbyB0aGUgcG9zdC1tYXRlcmlhbGl6ZSBmaWx0ZXIgaXMgZnJlc2guXG5cdFx0XHRcdFx0dGhpcy5faW5pdFBsdWdpbnMgPSBtZXNzYWdlLnBsdWdpbnMgPz8gW107XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9pc1Jlc3VtZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2lzUmVzdW1lZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX3F1ZXVlLnBlZWtQYXJlbnQoKT8udHVybklkO1xuXHRcdFx0XHRjb25zdCB0dXJuRHVyYXRpb24gPSB0aGlzLl9xdWV1ZS5wZWVrUGFyZW50KCk/LnN0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcm91dGVyLmhhbmRsZShtZXNzYWdlLCB0dXJuSWQsIHR1cm5EdXJhdGlvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGhhbmRsZXJFcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVTZGtQaXBlbGluZToke3RoaXMuc2Vzc2lvbklkfV0gcm91dGVyIHRocmV3LCBza2lwcGluZzogJHtoYW5kbGVyRXJyfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdyZXN1bHQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tcGxldGVkID0gdGhpcy5fcXVldWUuc2V0dGxlSGVhZCgpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gcmVzdWx0IGZvciBzZGtVdWlkPSR7Y29tcGxldGVkPy5zZGtVdWlkfWApO1xuXHRcdFx0XHRcdC8vIEZpbmFsIHJlc3VsdDogcXVldWUgZnVsbHkgZHJhaW5lZCBcdTIxOTIgcHJvdG9jb2wgdHVybiBkb25lLlxuXHRcdFx0XHRcdC8vIEludGVybWVkaWF0ZSByZXN1bHQgKHN0aWxsIHBlbmRpbmcgZW50cmllcyBmcm9tIGFcblx0XHRcdFx0XHQvLyBzdGVlcmluZyBwcmVlbXB0KSBkb2VzIE5PVCBmaXJlIENoYXRUdXJuQ29tcGxldGUuXG5cdFx0XHRcdFx0aWYgKGNvbXBsZXRlZCAmJiB0aGlzLl9xdWV1ZS5pc0VtcHR5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFByb2R1Y2VTaWduYWwuZmlyZSh7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogdGhpcy5jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHRcdFx0XHRcdHR1cm5JZDogY29tcGxldGVkLnR1cm5JZCxcblx0XHRcdFx0XHRcdFx0XHRkdXJhdGlvbjogTWF0aC5tYXgoMCwgY29tcGxldGVkLnN0b3BXYXRjaC5lbGFwc2VkKCkpLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fYWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQSByZWJpbmQgKHtAbGluayBfcmViaW5kUXVlcnl9KSBzd2FwcyBpbiBhIGZyZXNoIGBfcXVlcnlgIGFuZFxuXHRcdFx0Ly8gZGlzcG9zZXMgdGhlIG9sZCBvbmUsIGVuZGluZyBUSElTIHBhc3MncyBzdHJlYW0gY2xlYW5seS4gVGhhdCBpc1xuXHRcdFx0Ly8gZXhwZWN0ZWQgXHUyMDE0IHJldHVybiBxdWlldGx5IGFuZCBsZXQge0BsaW5rIF9ydW5Db25zdW1lckxvb3B9IGhhbmRcblx0XHRcdC8vIG9mZiB0byB0aGUgbmV3IHF1ZXJ5LiBPbmx5IGFuIHVuZXhwZWN0ZWQgZW5kIG9mIHRoZSAqY3VycmVudCpcblx0XHRcdC8vIHF1ZXJ5IChubyBzd2FwKSBpcyB0aGUgcmVhbCBcInN0cmVhbSBlbmRlZCB3aXRob3V0IGEgcmVzdWx0XCJcblx0XHRcdC8vIGZhaWx1cmUgdGhhdCBzaG91bGQgbWFyayB0aGUgcGlwZWxpbmUgZm9yIHJlY292ZXJ5LlxuXHRcdFx0aWYgKHRoaXMuX3F1ZXJ5ICE9PSBxdWVyeSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NsYXVkZSBTREsgc3RyZWFtIGVuZGVkIHdpdGhvdXQgYSByZXN1bHQgbWVzc2FnZScpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgZmF0YWwgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyKSk7XG5cdFx0XHQvLyBPbmx5IHRoZSBsb29wIHRoYXQgc3RpbGwgb3ducyB0aGUgbGl2ZSBxdWVyeSByZWFjdHM6IGEgbGF0ZXJcblx0XHRcdC8vIHVud2luZGluZyBwYXNzIHdob3NlIHF1ZXJ5IHdhcyBhbHJlYWR5IHN3YXBwZWQgYnkgYSByZWJpbmQgbXVzdFxuXHRcdFx0Ly8gbm90IGNsb2JiZXIgdGhlIGZyZXNoIG9uZS4gTWFyayB1bmhlYWx0aHkgKGtlZXAgdGhlIGhhbmRsZSBmb3Jcblx0XHRcdC8vIHRlYXJkb3duKTsgdGhlIG5leHQgYHNlbmRgIHJlYmluZHMuXG5cdFx0XHRpZiAodGhpcy5fcXVlcnkgPT09IHF1ZXJ5KSB7XG5cdFx0XHRcdHRoaXMuX3F1ZXVlLmZhaWxBbGwoZmF0YWwpO1xuXHRcdFx0XHR0aGlzLl9uZWVkc1JlYmluZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZmF0YWwpKSB7XG5cdFx0XHRcdHRocm93IGZhdGFsO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQXdCLG9CQUFvQjtBQUNyRCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUk1QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUE2QztBQUN0RCxTQUFTLDhCQUE4QjtBQW1FaEMsSUFBTSxvQkFBTixjQUFnQyxXQUFXO0FBQUEsRUFnS2pELFlBQ1UsV0FDQSxZQUNBLGdCQUNULE1BQ0EsaUJBQ0EsT0FDQSxXQUNBLGtCQUEwRSxRQUNuRCxzQkFDTyxhQUM3QjtBQUNELFVBQU07QUFYRztBQUNBO0FBQ0E7QUFPcUI7QUFyRC9CO0FBQUEsU0FBUSxhQUFhO0FBUXJCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsZUFBc0csQ0FBQztBQWUvRztBQUFBLFNBQVEs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
