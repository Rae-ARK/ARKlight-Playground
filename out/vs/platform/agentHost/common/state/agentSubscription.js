import { assertNever } from "../../../../base/common/assert.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { observableFromEvent } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionType, isChangesetAction, isChatAction, isAnnotationsAction, isSessionAction } from "./sessionActions.js";
import { changesetReducer, chatReducer, annotationsReducer, rootReducer, sessionReducer } from "./sessionReducers.js";
import { terminalReducer } from "./protocol/reducers.js";
import { isAhpRootChannel, StateComponents } from "./sessionState.js";
class BaseAgentSubscription extends Disposable {
  constructor(clientId, log) {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidError = this._register(new Emitter());
    this.onDidError = this._onDidError.event;
    this._onWillApplyAction = this._register(new Emitter());
    this.onWillApplyAction = this._onWillApplyAction.event;
    this._onDidApplyAction = this._register(new Emitter());
    this.onDidApplyAction = this._onDidApplyAction.event;
    this._clientId = clientId;
    this._log = log;
  }
  get value() {
    if (this._error) {
      return this._error;
    }
    return this._getOptimisticState() ?? this._confirmedState;
  }
  get verifiedValue() {
    return this._confirmedState;
  }
  /**
   * Apply an initial snapshot from the server.
   */
  handleSnapshot(state, fromSeq) {
    this._confirmedState = state;
    this._error = void 0;
    this._onSnapshotApplied(fromSeq);
    this._onDidChange.fire(this.value);
  }
  /**
   * Mark this subscription as failed.
   */
  setError(error) {
    this._error = error;
    this._onDidError.fire(error);
  }
  /**
   * Process an incoming action envelope. The subscription determines
   * whether the action is relevant via {@link _isRelevantEnvelope}.
   */
  receiveEnvelope(envelope) {
    if (!this._isRelevantEnvelope(envelope)) {
      return;
    }
    if (this._confirmedState === void 0) {
      if (!this._bufferedEnvelopes) {
        this._bufferedEnvelopes = [];
      }
      this._bufferedEnvelopes.push(envelope);
      return;
    }
    const isOwnAction = envelope.origin?.clientId === this._clientId;
    this._onWillApplyAction.fire(envelope);
    this._reconcile(envelope, isOwnAction);
    this._onDidApplyAction.fire(envelope);
  }
  /** Return optimistic state if write-ahead is active, otherwise `undefined`. */
  _getOptimisticState() {
    return void 0;
  }
  /** Hook called after a snapshot is applied. Replays buffered actions. */
  _onSnapshotApplied(_fromSeq) {
    const buffered = this._bufferedEnvelopes;
    if (buffered) {
      this._bufferedEnvelopes = void 0;
      for (const envelope of buffered) {
        if (envelope.serverSeq > _fromSeq) {
          const isOwnAction = envelope.origin?.clientId === this._clientId;
          this._reconcile(envelope, isOwnAction);
        }
      }
    }
  }
  /**
   * Default reconciliation: apply to confirmed, fire change event.
   * Session subscriptions override this for write-ahead.
   */
  _reconcile(envelope, _isOwnAction) {
    this._confirmedState = this._applyReducer(this._confirmedState, envelope.action);
    this._onDidChange.fire(this.value);
  }
}
class RootStateSubscription extends BaseAgentSubscription {
  _applyReducer(state, action) {
    return rootReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isAhpRootChannel(envelope.channel) && envelope.action.type.startsWith("root/");
  }
}
class SessionStateSubscription extends BaseAgentSubscription {
  constructor(sessionUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._sessionUri = sessionUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply a session action. Returns the clientSeq to send
   * to the server so it can echo back for reconciliation.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = sessionReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return sessionReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isSessionAction(envelope.action) && envelope.channel === this._sessionUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const idx = this._pendingActions.findIndex((p) => p.clientSeq === envelope.origin.clientSeq);
      if (idx !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(idx, 1);
      } else if (!envelope.rejectionReason) {
        this._confirmedApply(envelope.action);
      }
    } else if (!envelope.rejectionReason) {
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = sessionReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
  /**
   * Clear pending actions for this session (e.g., on unsubscribe).
   */
  clearPending() {
    this._pendingActions.length = 0;
    this._optimisticState = void 0;
  }
  /**
   * Snapshot of the currently-pending optimistic actions, with the session
   * URI included so callers can re-issue them across a reconnect. The
   * actions remain in the subscription so the optimistic state continues
   * to reflect them — the client must explicitly drop entries echoed back
   * by the server.
   */
  getPendingActions() {
    return this._pendingActions.map((p) => ({ clientSeq: p.clientSeq, action: p.action, channel: this._sessionUri }));
  }
  /**
   * Drop the pending entry whose `clientSeq` matches the supplied value.
   * Used during reconnect to evict actions the server already echoed back
   * in the replay buffer so they're not resent.
   */
  dropPendingByClientSeq(clientSeq) {
    const idx = this._pendingActions.findIndex((p) => p.clientSeq === clientSeq);
    if (idx === -1) {
      return false;
    }
    this._pendingActions.splice(idx, 1);
    return true;
  }
}
class ChatStateSubscription extends BaseAgentSubscription {
  constructor(chatUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._chatUri = chatUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply a chat action. Returns the clientSeq to send to
   * the server so it can echo back for reconciliation.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = chatReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return chatReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isChatAction(envelope.action) && envelope.channel === this._chatUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const idx = this._pendingActions.findIndex((p) => p.clientSeq === envelope.origin.clientSeq);
      if (idx !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(idx, 1);
      } else if (!envelope.rejectionReason) {
        this._confirmedApply(envelope.action);
      }
    } else if (!envelope.rejectionReason) {
      this._promotePendingTurnStartIfTerminal(envelope.action);
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _promotePendingTurnStartIfTerminal(action) {
    if (!isChatAction(action)) {
      return;
    }
    if (action.type !== ActionType.ChatTurnComplete && action.type !== ActionType.ChatTurnCancelled && action.type !== ActionType.ChatError) {
      return;
    }
    const index = this._pendingActions.findIndex((p) => p.action.type === ActionType.ChatTurnStarted && p.action.turnId === action.turnId);
    if (index === -1) {
      return;
    }
    const [{ action: pendingAction }] = this._pendingActions.splice(index, 1);
    if (this._confirmedState && (!this._confirmedState.activeTurn || this._confirmedState.activeTurn.id !== action.turnId)) {
      this._confirmedState = this._applyReducer(this._confirmedState, pendingAction);
    }
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = chatReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
  clearPending() {
    this._pendingActions.length = 0;
    this._optimisticState = void 0;
  }
  getPendingActions() {
    return this._pendingActions.map((p) => ({ clientSeq: p.clientSeq, action: p.action, channel: this._chatUri }));
  }
  dropPendingByClientSeq(clientSeq) {
    const idx = this._pendingActions.findIndex((p) => p.clientSeq === clientSeq);
    if (idx === -1) {
      return false;
    }
    this._pendingActions.splice(idx, 1);
    return true;
  }
}
class TerminalStateSubscription extends BaseAgentSubscription {
  constructor(terminalUri, clientId, log) {
    super(clientId, log);
    this._terminalUri = terminalUri;
  }
  _applyReducer(state, action) {
    return terminalReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return envelope.action.type.startsWith("terminal/") && envelope.channel === this._terminalUri;
  }
}
class ChangesetStateSubscription extends BaseAgentSubscription {
  constructor(changesetUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._changesetUri = changesetUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply a changeset action and return its client sequence.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = changesetReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return changesetReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isChangesetAction(envelope.action) && envelope.channel === this._changesetUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const index = this._pendingActions.findIndex((pending) => pending.clientSeq === envelope.origin.clientSeq);
      if (index !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(index, 1);
      } else {
        this._confirmedApply(envelope.action);
      }
    } else {
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = changesetReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
}
class AnnotationsStateSubscription extends BaseAgentSubscription {
  constructor(annotationsUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._annotationsUri = annotationsUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply an annotations action. Returns the clientSeq to
   * send to the server so it can echo back for reconciliation.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = annotationsReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return annotationsReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isAnnotationsAction(envelope.action) && envelope.channel === this._annotationsUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const idx = this._pendingActions.findIndex((p) => p.clientSeq === envelope.origin.clientSeq);
      if (idx !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(idx, 1);
      } else {
        this._confirmedApply(envelope.action);
      }
    } else {
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = annotationsReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
}
class AgentSubscriptionManager extends Disposable {
  constructor(clientId, seqAllocator, log, subscribe, unsubscribe) {
    super();
    this._subscriptions = new ResourceMap();
    this._inflightCreates = new ResourceMap();
    this._referenceOwnerIds = 0;
    this._clientId = clientId;
    this._seqAllocator = seqAllocator;
    this._log = log;
    this._subscribe = subscribe;
    this._unsubscribe = unsubscribe;
    this._rootState = this._register(new RootStateSubscription(clientId, log));
  }
  /** The always-live root state subscription. */
  get rootState() {
    return this._rootState;
  }
  /**
   * Initialize the root state from a snapshot received during the
   * connection handshake.
   */
  handleRootSnapshot(state, fromSeq) {
    this._rootState.handleSnapshot(state, fromSeq);
  }
  /**
   * Returns an existing subscription without affecting its refcount.
   * Returns `undefined` if no subscription is active for the given resource.
   */
  getSubscriptionUnmanaged(resource) {
    const entry = this._subscriptions.get(resource);
    return entry?.sub;
  }
  /**
   * Returns the in-flight `createSession` Promise for this URI, or `undefined` if no create is pending. Used by
   * callers that need to gate their own work on a still-running eager `createSession` (e.g. the chat handler awaits
   * this before deciding whether the sessions provider's eager-create raced first send).
   */
  getInflightSessionCreate(resource) {
    return this._inflightCreates.get(resource);
  }
  /**
   * Register an in-flight `createSession` Promise for a session URI. Any
   * subscribe issued for this resource while the create is pending waits
   * for the Promise before issuing the wire-level subscribe.
   */
  trackSessionCreate(resource, promise) {
    this._inflightCreates.set(resource, promise);
    void promise.finally(() => {
      if (this._inflightCreates.get(resource) === promise) {
        this._inflightCreates.delete(resource);
      }
    }).catch(() => {
    });
  }
  /**
   * Get or create a refcounted subscription to any resource. Disposing
   * the returned reference decrements the refcount; when it reaches zero
   * the subscription is torn down and the server is notified.
   *
   * `owner` names the caller holding the reference so inspection surfaces
   * (see {@link getActiveSubscriptions}) can attribute who is retaining a
   * subscription. Use a stable, human-readable identifier such as the
   * acquiring class name.
   */
  getSubscription(kind, resource, owner) {
    const existing = this._subscriptions.get(resource);
    if (existing) {
      if (existing.sub.value instanceof Error) {
        this._subscriptions.delete(resource);
        this._disposeSubscriptionEntry(resource, existing);
      } else {
        existing.refCount++;
        return this._acquireReference(resource, existing, owner);
      }
    }
    const key = resource.toString();
    const sub = this._createSubscription(kind, key);
    const entry = { sub, kind, refCount: 1, holders: /* @__PURE__ */ new Map() };
    this._subscriptions.set(resource, entry);
    void (async () => {
      const inflight = this._inflightCreates.get(resource);
      if (inflight) {
        try {
          await inflight;
        } catch {
        }
      }
      try {
        const snapshot = await this._subscribe(resource);
        if (this._subscriptions.get(resource) === entry) {
          sub.handleSnapshot(snapshot.state, snapshot.fromSeq);
        }
      } catch (err) {
        if (this._subscriptions.get(resource) === entry) {
          sub.setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();
    return this._acquireReference(resource, entry, owner);
  }
  /**
   * Register `owner` as a holder of `entry` and return a reference whose
   * disposal removes that holder and releases the subscription. The
   * caller is responsible for the matching refcount increment (a fresh
   * entry starts at 1; an existing entry is bumped before calling this).
   */
  _acquireReference(resource, entry, owner) {
    const ownerId = ++this._referenceOwnerIds;
    entry.holders.set(ownerId, owner);
    let isDisposed = false;
    return {
      object: entry.sub,
      dispose: () => {
        if (isDisposed) {
          return;
        }
        isDisposed = true;
        entry.holders.delete(ownerId);
        this._releaseSubscription(resource, entry);
      }
    };
  }
  _disposeSubscriptionEntry(resource, entry) {
    this._tryUnsubscribe(resource);
    if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
      entry.sub.clearPending();
    }
    entry.sub.dispose();
  }
  _tryUnsubscribe(resource) {
    try {
      this._unsubscribe(resource);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._log(`Failed to unsubscribe ${resource.toString()}: ${message}`);
    }
  }
  /**
   * Route an incoming action envelope to all active subscriptions.
   */
  receiveEnvelope(envelope) {
    this._rootState.receiveEnvelope(envelope);
    for (const { sub } of this._subscriptions.values()) {
      sub.receiveEnvelope(envelope);
    }
  }
  /**
   * Dispatch a client action. Applies optimistically to the relevant
   * subscription if applicable, then returns the clientSeq.
   *
   * `channel` is the protocol URI string identifying the channel the
   * action targets (a session URI for session actions, etc.).
   */
  dispatchOptimistic(channel, action) {
    if (isSessionAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof SessionStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    } else if (isChatAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof ChatStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    } else if (isChangesetAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof ChangesetStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    } else if (isAnnotationsAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof AnnotationsStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    }
    return this._seqAllocator();
  }
  /**
   * URIs currently subscribed to via {@link getSubscription}. Used to
   * build the `subscriptions` payload for a `reconnect` RPC so the
   * server can restore them in one round-trip.
   *
   * Does NOT include the always-live root state, which the protocol
   * client manages separately.
   */
  currentSubscriptionUris() {
    return [...this._subscriptions.keys()];
  }
  /**
   * Read-only descriptors of every active resource subscription, for
   * inspection/debug surfaces. Does NOT include the always-live root
   * state, which the connection exposes separately via {@link rootState}.
   */
  getActiveSubscriptions() {
    const out = [];
    for (const [resource, entry] of this._subscriptions) {
      const value = entry.sub.value;
      const status = value === void 0 ? "pending" : value instanceof Error ? "error" : "snapshot";
      out.push({ resource, kind: entry.kind, refCount: entry.refCount, holders: this._summarizeHolders(entry), status });
    }
    return out;
  }
  /** Group an entry's holders by owner name, sorted by descending count. */
  _summarizeHolders(entry) {
    const counts = /* @__PURE__ */ new Map();
    for (const owner of entry.holders.values()) {
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return [...counts.entries()].map(([owner, count]) => ({ owner, count })).sort((a, b) => b.count - a.count);
  }
  /**
   * Snapshot of every pending optimistic action across all session
   * subscriptions. Callers use this to replay actions after a transport
   * reconnect; entries are kept on their subscriptions until they're
   * either echoed back by the server or explicitly dropped via
   * {@link dropPendingSessionAction}.
   */
  getPendingSessionActions() {
    const out = [];
    for (const { sub } of this._subscriptions.values()) {
      if (sub instanceof SessionStateSubscription || sub instanceof ChatStateSubscription) {
        out.push(...sub.getPendingActions());
      }
    }
    return out;
  }
  /**
   * Remove a single pending optimistic action for a session by its
   * `clientSeq`. Used during reconnect to evict actions the server
   * already processed (and replayed back to us) so they're not resent.
   */
  dropPendingSessionAction(sessionUri, clientSeq) {
    const entry = this._subscriptions.get(URI.parse(sessionUri));
    if (entry?.sub instanceof SessionStateSubscription || entry?.sub instanceof ChatStateSubscription) {
      entry.sub.dropPendingByClientSeq(clientSeq);
    }
  }
  /**
   * Apply a fresh snapshot to a subscribed resource — used when the server
   * responds to a `reconnect` request with `type: 'snapshot'` because the
   * replay buffer no longer covers the client's gap. Routes to the root
   * subscription when {@link ROOT_STATE_URI} matches, otherwise reseats the
   * matching entry in {@link _subscriptions}. Unknown resources are ignored.
   */
  applyReconnectSnapshot(resource, state, fromSeq) {
    if (isAhpRootChannel(resource)) {
      this._rootState.handleSnapshot(state, fromSeq);
      return;
    }
    const entry = this._subscriptions.get(URI.parse(resource));
    if (!entry) {
      return;
    }
    if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
      entry.sub.clearPending();
    }
    entry.sub.handleSnapshot(state, fromSeq);
  }
  /**
   * Mark a set of subscriptions as no longer resumable on the server
   * (reported via `ReconnectReplayResult.missing`). The subscriptions
   * themselves stay alive so consumers continue to hold valid references,
   * but their value transitions to an `Error` until they're recreated.
   */
  markSubscriptionsMissing(missing) {
    for (const resource of missing) {
      const entry = this._subscriptions.get(resource);
      if (entry) {
        if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
          entry.sub.clearPending();
        }
        entry.sub.setError(new Error(`Subscription no longer available after reconnect: ${resource.toString()}`));
      }
    }
  }
  _createSubscription(kind, key) {
    switch (kind) {
      case StateComponents.Session:
        return new SessionStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Chat:
        return new ChatStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Terminal:
        return new TerminalStateSubscription(key, this._clientId, this._log);
      case StateComponents.Changeset:
        return new ChangesetStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Annotations:
        return new AnnotationsStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Root:
        throw new Error("_createSubscription: root subscription is managed separately");
      default:
        assertNever(kind, `_createSubscription: unsupported StateComponents kind: ${kind}`);
    }
  }
  _releaseSubscription(resource, expected) {
    const entry = this._subscriptions.get(resource);
    if (!entry || expected && entry !== expected) {
      return;
    }
    entry.refCount--;
    if (entry.refCount <= 0) {
      this._subscriptions.delete(resource);
      this._disposeSubscriptionEntry(resource, entry);
    }
  }
  dispose() {
    for (const [resource, entry] of this._subscriptions) {
      this._tryUnsubscribe(resource);
      entry.sub.dispose();
    }
    this._subscriptions.clear();
    super.dispose();
  }
}
function isActionEnvelopeRelevantToSubscriptionUris(envelope, subscribedUris) {
  if (isAhpRootChannel(envelope.channel)) {
    for (const uri of subscribedUris) {
      if (isAhpRootChannel(uri)) {
        return true;
      }
    }
    return false;
  }
  for (const uri of subscribedUris) {
    if (uri === envelope.channel) {
      return true;
    }
  }
  return false;
}
function observableFromSubscription(owner, sub) {
  return observableFromEvent(owner, sub.onDidChange, () => {
    const v = sub.value;
    return v instanceof Error ? void 0 : v;
  });
}
export {
  AgentSubscriptionManager,
  AnnotationsStateSubscription,
  ChangesetStateSubscription,
  ChatStateSubscription,
  RootStateSubscription,
  SessionStateSubscription,
  TerminalStateSubscription,
  isActionEnvelopeRelevantToSubscriptionUris,
  observableFromSubscription
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25FbnZlbG9wZSwgQWN0aW9uVHlwZSwgQ2hhbmdlc2V0QWN0aW9uLCBDaGF0QWN0aW9uLCBBbm5vdGF0aW9uc0FjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIENsaWVudENoYW5nZXNldEFjdGlvbiwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBTZXNzaW9uQWN0aW9uLCBTdGF0ZUFjdGlvbiwgaXNDaGFuZ2VzZXRBY3Rpb24sIGlzQ2hhdEFjdGlvbiwgaXNBbm5vdGF0aW9uc0FjdGlvbiwgaXNTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjaGFuZ2VzZXRSZWR1Y2VyLCBjaGF0UmVkdWNlciwgYW5ub3RhdGlvbnNSZWR1Y2VyLCByb290UmVkdWNlciwgc2Vzc2lvblJlZHVjZXIgfSBmcm9tICcuL3Nlc3Npb25SZWR1Y2Vycy5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFJlZHVjZXIgfSBmcm9tICcuL3Byb3RvY29sL3JlZHVjZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdEFjdGlvbiwgU2Vzc2lvbkFjdGlvbiBhcyBJUHJvdG9jb2xTZXNzaW9uQWN0aW9uLCBDaGF0QWN0aW9uIGFzIElQcm90b2NvbENoYXRBY3Rpb24sIFRlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9hY3Rpb24tb3JpZ2luLmdlbmVyYXRlZC5qcyc7XG5pbXBvcnQgdHlwZSB7IEFubm90YXRpb25zU3RhdGUsIENoYW5nZXNldFN0YXRlLCBDaGF0U3RhdGUsIFJvb3RTdGF0ZSwgU2Vzc2lvblN0YXRlLCBUZXJtaW5hbFN0YXRlIH0gZnJvbSAnLi9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTdGF0ZVNuYXBzaG90IH0gZnJvbSAnLi9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgaXNBaHBSb290Q2hhbm5lbCwgUk9PVF9TVEFURV9VUkksIFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4vc2Vzc2lvblN0YXRlLmpzJztcblxuLy8gLS0tIFB1YmxpYyBBUEkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBBIHJlYWQtb25seSBzdWJzY3JpcHRpb24gdG8gYW4gYWdlbnQgaG9zdCByZXNvdXJjZSAocm9vdCwgc2Vzc2lvbiwgb3IgdGVybWluYWwpLlxuICpcbiAqIFN1YnNjcmlwdGlvbnMgYXJlIGh5ZHJhdGVkIGZyb20gYW4gaW5pdGlhbCBzZXJ2ZXIgc25hcHNob3QgYW5kIGtlcHQgaW4gc3luY1xuICogdmlhIGFjdGlvbiBlbnZlbG9wZXMuIFNlc3Npb24gc3Vic2NyaXB0aW9ucyBzdXBwb3J0IHdyaXRlLWFoZWFkXG4gKiByZWNvbmNpbGlhdGlvbiBcdTIwMTQgb3B0aW1pc3RpYyBzdGF0ZSBpcyBsYXllcmVkIG9uIHRvcCBvZiBjb25maXJtZWQgc3RhdGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U3Vic2NyaXB0aW9uPFQ+IHtcblx0LyoqXG5cdCAqIFRoZSBjdXJyZW50IHN0YXRlIHZhbHVlLiBGb3Igd3JpdGUtYWhlYWQgc3Vic2NyaXB0aW9ucyAoc2Vzc2lvbnMpIHRoaXNcblx0ICogcmVmbGVjdHMgdGhlIG9wdGltaXN0aWMgc3RhdGUgKGNvbmZpcm1lZCArIHBlbmRpbmcgcmVwbGF5ZWQpLiBGb3Jcblx0ICogc2VydmVyLW9ubHkgc3Vic2NyaXB0aW9ucyAocm9vdCwgdGVybWluYWwpIHRoaXMgZXF1YWxzIGB2ZXJpZmllZFZhbHVlYC5cblx0ICpcblx0ICogYHVuZGVmaW5lZGAgdW50aWwgdGhlIGZpcnN0IHNuYXBzaG90IGFycml2ZXMuIEFuIGBFcnJvcmAgaWYgc3Vic2NyaXB0aW9uXG5cdCAqIGZhaWxlZC5cblx0ICovXG5cdHJlYWRvbmx5IHZhbHVlOiBUIHwgRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFRoZSBzZXJ2ZXItY29uZmlybWVkIHN0YXRlIHdpdGggbm8gcGVuZGluZyBvcHRpbWlzdGljIGFjdGlvbnMgYXBwbGllZC5cblx0ICogYHVuZGVmaW5lZGAgdW50aWwgdGhlIGZpcnN0IHNuYXBzaG90IGFycml2ZXMuXG5cdCAqL1xuXHRyZWFkb25seSB2ZXJpZmllZFZhbHVlOiBUIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBGaXJlcyB3aGVuIHtAbGluayB2YWx1ZX0gY2hhbmdlcyAob3B0aW1pc3RpYyBvciBjb25maXJtZWQpLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8VD47XG5cblx0LyoqIEZpcmVzIHdoZW4gdGhlIHN1YnNjcmlwdGlvbiBlbnRlcnMgYW4gZXJyb3Igc3RhdGUuICovXG5cdHJlYWRvbmx5IG9uRGlkRXJyb3I/OiBFdmVudDxFcnJvcj47XG5cblx0LyoqIEZpcmVzIGJlZm9yZSBhIHNlcnZlci1vcmlnaW5hdGVkIGFjdGlvbiBpcyBhcHBsaWVkIHRvIHRoaXMgc3Vic2NyaXB0aW9uJ3Mgc3RhdGUuICovXG5cdHJlYWRvbmx5IG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudDxBY3Rpb25FbnZlbG9wZT47XG5cblx0LyoqIEZpcmVzIGFmdGVyIGEgc2VydmVyLW9yaWdpbmF0ZWQgYWN0aW9uIGlzIGFwcGxpZWQgdG8gdGhpcyBzdWJzY3JpcHRpb24ncyBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgb25EaWRBcHBseUFjdGlvbjogRXZlbnQ8QWN0aW9uRW52ZWxvcGU+O1xufVxuXG4vKipcbiAqIFJlYWQtb25seSBzbmFwc2hvdCBkZXNjcmliaW5nIGEgc2luZ2xlIGFjdGl2ZSByZXNvdXJjZSBzdWJzY3JpcHRpb24uIFVzZWQgYnlcbiAqIGluc3BlY3Rpb24vZGVidWcgc3VyZmFjZXMgdGhhdCBlbnVtZXJhdGUgZXZlcnl0aGluZyBhIGNvbm5lY3Rpb24gaXMgY3VycmVudGx5XG4gKiBzdWJzY3JpYmVkIHRvLiBEb2VzIG5vdCBpbmNsdWRlIHRoZSBhbHdheXMtbGl2ZSByb290IHN0YXRlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVTdWJzY3JpcHRpb25JbmZvIHtcblx0LyoqIFRoZSBwcm90b2NvbCByZXNvdXJjZSBVUkkgc3Vic2NyaWJlZCB0by4gKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0LyoqIFdoaWNoIHN0YXRlIGNvbXBvbmVudCB0aGlzIHN1YnNjcmlwdGlvbiB0cmFja3MuICovXG5cdHJlYWRvbmx5IGtpbmQ6IFN0YXRlQ29tcG9uZW50cztcblx0LyoqIE51bWJlciBvZiBvdXRzdGFuZGluZyB7QGxpbmsgSVJlZmVyZW5jZX0gaG9sZGVycy4gKi9cblx0cmVhZG9ubHkgcmVmQ291bnQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBuYW1lZCBvd25lcnMgY3VycmVudGx5IGhvbGRpbmcgYSByZWZlcmVuY2UgdG8gdGhpcyBzdWJzY3JpcHRpb24sXG5cdCAqIHdpdGggaG93IG1hbnkgcmVmZXJlbmNlcyBlYWNoIGhvbGRzLiBOYW1lcyBjb21lIGZyb20gdGhlIGBvd25lcmBcblx0ICogYXJndW1lbnQgcGFzc2VkIHRvIHtAbGluayBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9ufS5cblx0ICovXG5cdHJlYWRvbmx5IGhvbGRlcnM6IHJlYWRvbmx5IElBY3RpdmVTdWJzY3JpcHRpb25Ib2xkZXJbXTtcblx0LyoqXG5cdCAqIExpZmVjeWNsZSBzdGF0dXMgZGVyaXZlZCBmcm9tIHRoZSBzdWJzY3JpcHRpb24ncyB2YWx1ZTpcblx0ICogYHBlbmRpbmdgIGJlZm9yZSB0aGUgZmlyc3Qgc25hcHNob3QsIGBlcnJvcmAgaWYgaXQgZmFpbGVkLCBvdGhlcndpc2Vcblx0ICogYHNuYXBzaG90YC5cblx0ICovXG5cdHJlYWRvbmx5IHN0YXR1czogJ3BlbmRpbmcnIHwgJ3NuYXBzaG90JyB8ICdlcnJvcic7XG59XG5cbi8qKiBBIG5hbWVkIG93bmVyIGhvbGRpbmcgb25lIG9yIG1vcmUgcmVmZXJlbmNlcyB0byBhIHN1YnNjcmlwdGlvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGl2ZVN1YnNjcmlwdGlvbkhvbGRlciB7XG5cdHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG59XG5cbi8vIC0tLSBCYXNlIEltcGxlbWVudGF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQmFzZSBjbGFzcyBmb3IgYWdlbnQgc3Vic2NyaXB0aW9ucy4gSGFuZGxlcyBlbnZlbG9wZSByZWNlcHRpb24sIGNvbmZpcm1lZFxuICogc3RhdGUgbWFuYWdlbWVudCwgYW5kIGFjdGlvbiBldmVudCBlbWlzc2lvbi5cbiAqXG4gKiBTdWJjbGFzc2VzIHByb3ZpZGUgdGhlIHJlZHVjZXIgYW5kIG9wdGlvbmFsbHkgb3ZlcnJpZGUgcmVjb25jaWxpYXRpb25cbiAqIGJlaGF2aW9yLlxuICovXG5hYnN0cmFjdCBjbGFzcyBCYXNlQWdlbnRTdWJzY3JpcHRpb248VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50U3Vic2NyaXB0aW9uPFQ+IHtcblxuXHRwcm90ZWN0ZWQgX2NvbmZpcm1lZFN0YXRlOiBUIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2J1ZmZlcmVkRW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PFQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXJyb3I+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVycm9yOiBFdmVudDxFcnJvcj4gPSB0aGlzLl9vbkRpZEVycm9yLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25XaWxsQXBwbHlBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudDxBY3Rpb25FbnZlbG9wZT4gPSB0aGlzLl9vbldpbGxBcHBseUFjdGlvbi5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQXBwbHlBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50PEFjdGlvbkVudmVsb3BlPiA9IHRoaXMuX29uRGlkQXBwbHlBY3Rpb24uZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9jbGllbnRJZDogc3RyaW5nO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZzogKG1zZzogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGNsaWVudElkOiBzdHJpbmcsIGxvZzogKG1zZzogc3RyaW5nKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jbGllbnRJZCA9IGNsaWVudElkO1xuXHRcdHRoaXMuX2xvZyA9IGxvZztcblx0fVxuXG5cdGdldCB2YWx1ZSgpOiBUIHwgRXJyb3IgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9lcnJvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Vycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0T3B0aW1pc3RpY1N0YXRlKCkgPz8gdGhpcy5fY29uZmlybWVkU3RhdGU7XG5cdH1cblxuXHRnZXQgdmVyaWZpZWRWYWx1ZSgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybWVkU3RhdGU7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYW4gaW5pdGlhbCBzbmFwc2hvdCBmcm9tIHRoZSBzZXJ2ZXIuXG5cdCAqL1xuXHRoYW5kbGVTbmFwc2hvdChzdGF0ZTogVCwgZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY29uZmlybWVkU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9lcnJvciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHRoaXMudmFsdWUgYXMgVCk7XG5cdH1cblxuXHQvKipcblx0ICogTWFyayB0aGlzIHN1YnNjcmlwdGlvbiBhcyBmYWlsZWQuXG5cdCAqL1xuXHRzZXRFcnJvcihlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9lcnJvciA9IGVycm9yO1xuXHRcdHRoaXMuX29uRGlkRXJyb3IuZmlyZShlcnJvcik7XG5cdH1cblxuXHQvKipcblx0ICogUHJvY2VzcyBhbiBpbmNvbWluZyBhY3Rpb24gZW52ZWxvcGUuIFRoZSBzdWJzY3JpcHRpb24gZGV0ZXJtaW5lc1xuXHQgKiB3aGV0aGVyIHRoZSBhY3Rpb24gaXMgcmVsZXZhbnQgdmlhIHtAbGluayBfaXNSZWxldmFudEVudmVsb3BlfS5cblx0ICovXG5cdHJlY2VpdmVFbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzUmVsZXZhbnRFbnZlbG9wZShlbnZlbG9wZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCdWZmZXIgYWN0aW9ucyB0aGF0IGFycml2ZSBiZWZvcmUgdGhlIHNuYXBzaG90IGhhcyBiZWVuIGFwcGxpZWQuXG5cdFx0Ly8gVGhleSdyZSByZXBsYXllZCBpbiBfb25TbmFwc2hvdEFwcGxpZWQoKS5cblx0XHRpZiAodGhpcy5fY29uZmlybWVkU3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCF0aGlzLl9idWZmZXJlZEVudmVsb3Blcykge1xuXHRcdFx0XHR0aGlzLl9idWZmZXJlZEVudmVsb3BlcyA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYnVmZmVyZWRFbnZlbG9wZXMucHVzaChlbnZlbG9wZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNPd25BY3Rpb24gPSBlbnZlbG9wZS5vcmlnaW4/LmNsaWVudElkID09PSB0aGlzLl9jbGllbnRJZDtcblx0XHR0aGlzLl9vbldpbGxBcHBseUFjdGlvbi5maXJlKGVudmVsb3BlKTtcblxuXHRcdHRoaXMuX3JlY29uY2lsZShlbnZlbG9wZSwgaXNPd25BY3Rpb24pO1xuXG5cdFx0dGhpcy5fb25EaWRBcHBseUFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0fVxuXG5cdC8qKiBBcHBseSB0aGUgcmVkdWNlciB0byBjb25maXJtZWQgc3RhdGUuIFN1YmNsYXNzZXMgbXVzdCBpbXBsZW1lbnQuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfYXBwbHlSZWR1Y2VyKHN0YXRlOiBULCBhY3Rpb246IFN0YXRlQWN0aW9uKTogVDtcblxuXHQvKiogV2hldGhlciB0aGUgZ2l2ZW4gZW52ZWxvcGUgdGFyZ2V0cyB0aGlzIHN1YnNjcmlwdGlvbi4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9pc1JlbGV2YW50RW52ZWxvcGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogYm9vbGVhbjtcblxuXHQvKiogUmV0dXJuIG9wdGltaXN0aWMgc3RhdGUgaWYgd3JpdGUtYWhlYWQgaXMgYWN0aXZlLCBvdGhlcndpc2UgYHVuZGVmaW5lZGAuICovXG5cdHByb3RlY3RlZCBfZ2V0T3B0aW1pc3RpY1N0YXRlKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIE5vIHdyaXRlLWFoZWFkIGJ5IGRlZmF1bHRcblx0fVxuXG5cdC8qKiBIb29rIGNhbGxlZCBhZnRlciBhIHNuYXBzaG90IGlzIGFwcGxpZWQuIFJlcGxheXMgYnVmZmVyZWQgYWN0aW9ucy4gKi9cblx0cHJvdGVjdGVkIF9vblNuYXBzaG90QXBwbGllZChfZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gUmVwbGF5IGFueSBhY3Rpb25zIHRoYXQgYXJyaXZlZCBiZWZvcmUgdGhlIHNuYXBzaG90XG5cdFx0Y29uc3QgYnVmZmVyZWQgPSB0aGlzLl9idWZmZXJlZEVudmVsb3Blcztcblx0XHRpZiAoYnVmZmVyZWQpIHtcblx0XHRcdHRoaXMuX2J1ZmZlcmVkRW52ZWxvcGVzID0gdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBlbnZlbG9wZSBvZiBidWZmZXJlZCkge1xuXHRcdFx0XHQvLyBPbmx5IHJlcGxheSBhY3Rpb25zIHdpdGggc2VydmVyU2VxID4gZnJvbVNlcSAoc25hcHNob3QgaXMgYXV0aG9yaXRhdGl2ZSB1cCB0byBmcm9tU2VxKVxuXHRcdFx0XHRpZiAoZW52ZWxvcGUuc2VydmVyU2VxID4gX2Zyb21TZXEpIHtcblx0XHRcdFx0XHRjb25zdCBpc093bkFjdGlvbiA9IGVudmVsb3BlLm9yaWdpbj8uY2xpZW50SWQgPT09IHRoaXMuX2NsaWVudElkO1xuXHRcdFx0XHRcdHRoaXMuX3JlY29uY2lsZShlbnZlbG9wZSwgaXNPd25BY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERlZmF1bHQgcmVjb25jaWxpYXRpb246IGFwcGx5IHRvIGNvbmZpcm1lZCwgZmlyZSBjaGFuZ2UgZXZlbnQuXG5cdCAqIFNlc3Npb24gc3Vic2NyaXB0aW9ucyBvdmVycmlkZSB0aGlzIGZvciB3cml0ZS1haGVhZC5cblx0ICovXG5cdHByb3RlY3RlZCBfcmVjb25jaWxlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSwgX2lzT3duQWN0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fY29uZmlybWVkU3RhdGUgPSB0aGlzLl9hcHBseVJlZHVjZXIodGhpcy5fY29uZmlybWVkU3RhdGUhLCBlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy52YWx1ZSBhcyBUKTtcblx0fVxufVxuXG4vLyAtLS0gUm9vdCBTdGF0ZSBTdWJzY3JpcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFN1YnNjcmlwdGlvbiB0byB0aGUgcm9vdCBzdGF0ZSBhdCBgYWdlbnRob3N0Oi9yb290YC5cbiAqIFNlcnZlci1vbmx5IG11dGF0aW9ucyBcdTIwMTQgbm8gd3JpdGUtYWhlYWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBSb290U3RhdGVTdWJzY3JpcHRpb24gZXh0ZW5kcyBCYXNlQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseVJlZHVjZXIoc3RhdGU6IFJvb3RTdGF0ZSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IFJvb3RTdGF0ZSB7XG5cdFx0cmV0dXJuIHJvb3RSZWR1Y2VyKHN0YXRlLCBhY3Rpb24gYXMgUm9vdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0FocFJvb3RDaGFubmVsKGVudmVsb3BlLmNoYW5uZWwpICYmIGVudmVsb3BlLmFjdGlvbi50eXBlLnN0YXJ0c1dpdGgoJ3Jvb3QvJyk7XG5cdH1cbn1cblxuLy8gLS0tIFNlc3Npb24gU3RhdGUgU3Vic2NyaXB0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElQZW5kaW5nQWN0aW9uIHtcblx0cmVhZG9ubHkgY2xpZW50U2VxOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFjdGlvbjogU2Vzc2lvbkFjdGlvbjtcbn1cblxuLyoqXG4gKiBBIHBlbmRpbmcgb3B0aW1pc3RpYyBhY3Rpb24gYXdhaXRpbmcgc2VydmVyIGNvbmZpcm1hdGlvbiwgcGFpcmVkIHdpdGggdGhlXG4gKiBjaGFubmVsIGl0IHdhcyBkaXNwYXRjaGVkIHRvIHNvIGl0IGNhbiBiZSByZXBsYXllZCBhY3Jvc3MgYSByZWNvbm5lY3QuIFRoZVxuICogY2hhbm5lbCBpcyBhIHNlc3Npb24gY2hhbm5lbCBmb3Ige0BsaW5rIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbn0gYWN0aW9ucyBhbmRcbiAqIGEgY2hhdCBjaGFubmVsIGZvciB7QGxpbmsgQ2hhdFN0YXRlU3Vic2NyaXB0aW9ufSBhY3Rpb25zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQZW5kaW5nRGlzcGF0Y2hBY3Rpb24ge1xuXHRyZWFkb25seSBjbGllbnRTZXE6IG51bWJlcjtcblx0LyoqIFRoZSBvcHRpbWlzdGljIGFjdGlvbiBhd2FpdGluZyBjb25maXJtYXRpb24uICovXG5cdHJlYWRvbmx5IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb247XG5cdC8qKiBVUkkgb2YgdGhlIGNoYW5uZWwgdGhpcyBhY3Rpb24gdGFyZ2V0cywgYXMgc3RvcmVkIG9uIHRoZSBzdWJzY3JpcHRpb24uICovXG5cdHJlYWRvbmx5IGNoYW5uZWw6IHN0cmluZztcbn1cblxuLyoqXG4gKiBTdWJzY3JpcHRpb24gdG8gYSBzZXNzaW9uIGF0IGBjb3BpbG90Oi88dXVpZD5gLlxuICogU3VwcG9ydHMgd3JpdGUtYWhlYWQgcmVjb25jaWxpYXRpb24gZm9yIGNsaWVudC1kaXNwYXRjaGFibGUgYWN0aW9ucy5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiBleHRlbmRzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQWN0aW9uczogSVBlbmRpbmdBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9vcHRpbWlzdGljU3RhdGU6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblVyaTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzZXNzaW9uVXJpOiBzdHJpbmcsXG5cdFx0Y2xpZW50SWQ6IHN0cmluZyxcblx0XHRzZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlcixcblx0XHRsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoY2xpZW50SWQsIGxvZyk7XG5cdFx0dGhpcy5fc2Vzc2lvblVyaSA9IHNlc3Npb25Vcmk7XG5cdFx0dGhpcy5fc2VxQWxsb2NhdG9yID0gc2VxQWxsb2NhdG9yO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wdGltaXN0aWNhbGx5IGFwcGx5IGEgc2Vzc2lvbiBhY3Rpb24uIFJldHVybnMgdGhlIGNsaWVudFNlcSB0byBzZW5kXG5cdCAqIHRvIHRoZSBzZXJ2ZXIgc28gaXQgY2FuIGVjaG8gYmFjayBmb3IgcmVjb25jaWxpYXRpb24uXG5cdCAqL1xuXHRhcHBseU9wdGltaXN0aWMoYWN0aW9uOiBTZXNzaW9uQWN0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCBjbGllbnRTZXEgPSB0aGlzLl9zZXFBbGxvY2F0b3IoKTtcblx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5wdXNoKHsgY2xpZW50U2VxLCBhY3Rpb24gfSk7XG5cdFx0Ly8gQXBwbHkgb24gdG9wIG9mIGN1cnJlbnQgb3B0aW1pc3RpY1xuXHRcdGNvbnN0IGJhc2UgPSB0aGlzLl9vcHRpbWlzdGljU3RhdGUgPz8gdGhpcy52ZXJpZmllZFZhbHVlO1xuXHRcdGlmIChiYXNlKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBzZXNzaW9uUmVkdWNlcihiYXNlLCBhY3Rpb24gYXMgSVByb3RvY29sU2Vzc2lvbkFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5fb3B0aW1pc3RpY1N0YXRlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNsaWVudFNlcTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0T3B0aW1pc3RpY1N0YXRlKCk6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGltaXN0aWNTdGF0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYXBwbHlSZWR1Y2VyKHN0YXRlOiBTZXNzaW9uU3RhdGUsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiBTZXNzaW9uU3RhdGUge1xuXHRcdHJldHVybiBzZXNzaW9uUmVkdWNlcihzdGF0ZSwgYWN0aW9uIGFzIElQcm90b2NvbFNlc3Npb25BY3Rpb24sIHRoaXMuX2xvZyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2lzUmVsZXZhbnRFbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNTZXNzaW9uQWN0aW9uKGVudmVsb3BlLmFjdGlvbikgJiYgZW52ZWxvcGUuY2hhbm5lbCA9PT0gdGhpcy5fc2Vzc2lvblVyaTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gUmVwbGF5IGJ1ZmZlcmVkIGFjdGlvbnMgZmlyc3Rcblx0XHRzdXBlci5fb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcSk7XG5cdFx0Ly8gUmUtYXBwbHkgcGVuZGluZyBhY3Rpb25zIG9uIHRvcCBvZiBuZXcgY29uZmlybWVkIHN0YXRlXG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWNvbmNpbGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlLCBpc093bkFjdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEEgcmVqZWN0ZWQgZW52ZWxvcGUgbXVzdCBuZXZlciBtdXRhdGUgY29uZmlybWVkIHN0YXRlIFx1MjAxNCBpdCBvbmx5IHJvbGxzXG5cdFx0Ly8gYmFjayB0aGUgb3JpZ2luYXRpbmcgY2xpZW50J3MgbWF0Y2hpbmcgb3B0aW1pc3RpYyBhY3Rpb24uIEd1YXJkaW5nIGFsbFxuXHRcdC8vIGFwcGx5IGJyYW5jaGVzIGFsc28gcHJldmVudHMgYSBicm9hZGNhc3QgcmVqZWN0aW9uIGZyb20gbGVha2luZyB0aGVcblx0XHQvLyByZWplY3RlZCBhY3Rpb24gaW50byBhIG5vbi1vcmlnaW4gY2xpZW50J3Mgc3RhdGUuXG5cdFx0aWYgKGlzT3duQWN0aW9uICYmIGVudmVsb3BlLm9yaWdpbikge1xuXHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fcGVuZGluZ0FjdGlvbnMuZmluZEluZGV4KHAgPT4gcC5jbGllbnRTZXEgPT09IGVudmVsb3BlLm9yaWdpbiEuY2xpZW50U2VxKTtcblx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdGlmICghZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH0gZWxzZSBpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlybWVkQXBwbHkoYWN0aW9uOiBTdGF0ZUFjdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25maXJtZWRTdGF0ZSkge1xuXHRcdFx0dGhpcy5fY29uZmlybWVkU3RhdGUgPSB0aGlzLl9hcHBseVJlZHVjZXIodGhpcy5fY29uZmlybWVkU3RhdGUsIGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb21wdXRlT3B0aW1pc3RpYygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maXJtZWQgPSB0aGlzLl9jb25maXJtZWRTdGF0ZTtcblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wZW5kaW5nQWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHVuZGVmaW5lZDsgLy8gTm8gcGVuZGluZyBcdTIxOTIgdmFsdWUgZmFsbHMgdGhyb3VnaCB0byBjb25maXJtZWRcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoY29uZmlybWVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc3RhdGUgPSBjb25maXJtZWQ7XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMuX3BlbmRpbmdBY3Rpb25zKSB7XG5cdFx0XHRzdGF0ZSA9IHNlc3Npb25SZWR1Y2VyKHN0YXRlLCBwZW5kaW5nLmFjdGlvbiBhcyBJUHJvdG9jb2xTZXNzaW9uQWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdH1cblx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciBwZW5kaW5nIGFjdGlvbnMgZm9yIHRoaXMgc2Vzc2lvbiAoZS5nLiwgb24gdW5zdWJzY3JpYmUpLlxuXHQgKi9cblx0Y2xlYXJQZW5kaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNuYXBzaG90IG9mIHRoZSBjdXJyZW50bHktcGVuZGluZyBvcHRpbWlzdGljIGFjdGlvbnMsIHdpdGggdGhlIHNlc3Npb25cblx0ICogVVJJIGluY2x1ZGVkIHNvIGNhbGxlcnMgY2FuIHJlLWlzc3VlIHRoZW0gYWNyb3NzIGEgcmVjb25uZWN0LiBUaGVcblx0ICogYWN0aW9ucyByZW1haW4gaW4gdGhlIHN1YnNjcmlwdGlvbiBzbyB0aGUgb3B0aW1pc3RpYyBzdGF0ZSBjb250aW51ZXNcblx0ICogdG8gcmVmbGVjdCB0aGVtIFx1MjAxNCB0aGUgY2xpZW50IG11c3QgZXhwbGljaXRseSBkcm9wIGVudHJpZXMgZWNob2VkIGJhY2tcblx0ICogYnkgdGhlIHNlcnZlci5cblx0ICovXG5cdGdldFBlbmRpbmdBY3Rpb25zKCk6IElQZW5kaW5nRGlzcGF0Y2hBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdBY3Rpb25zLm1hcChwID0+ICh7IGNsaWVudFNlcTogcC5jbGllbnRTZXEsIGFjdGlvbjogcC5hY3Rpb24sIGNoYW5uZWw6IHRoaXMuX3Nlc3Npb25VcmkgfSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3AgdGhlIHBlbmRpbmcgZW50cnkgd2hvc2UgYGNsaWVudFNlcWAgbWF0Y2hlcyB0aGUgc3VwcGxpZWQgdmFsdWUuXG5cdCAqIFVzZWQgZHVyaW5nIHJlY29ubmVjdCB0byBldmljdCBhY3Rpb25zIHRoZSBzZXJ2ZXIgYWxyZWFkeSBlY2hvZWQgYmFja1xuXHQgKiBpbiB0aGUgcmVwbGF5IGJ1ZmZlciBzbyB0aGV5J3JlIG5vdCByZXNlbnQuXG5cdCAqL1xuXHRkcm9wUGVuZGluZ0J5Q2xpZW50U2VxKGNsaWVudFNlcTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fcGVuZGluZ0FjdGlvbnMuZmluZEluZGV4KHAgPT4gcC5jbGllbnRTZXEgPT09IGNsaWVudFNlcSk7XG5cdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuLy8gLS0tIENoYXQgU3RhdGUgU3Vic2NyaXB0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElQZW5kaW5nQ2hhdEFjdGlvbiB7XG5cdHJlYWRvbmx5IGNsaWVudFNlcTogbnVtYmVyO1xuXHRyZWFkb25seSBhY3Rpb246IENoYXRBY3Rpb247XG59XG5cbi8qKlxuICogU3Vic2NyaXB0aW9uIHRvIGEgY2hhdCBjaGFubmVsIChlLmcuIGEgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdCBVUkkpLiBUdXJucyxcbiAqIHRvb2wgY2FsbHMgYW5kIHBlbmRpbmcvaW5wdXQgc3RhdGUgbW92ZWQgb2ZmIHRoZSBzZXNzaW9uIG9udG8gdGhlIGNoYXRcbiAqIGNoYW5uZWwgaW4gdGhlIG11bHRpLWNoYXQgcHJvdG9jb2wsIHNvIHRoaXMgc3Vic2NyaXB0aW9uIGNhcnJpZXMgdGhlXG4gKiBjb252ZXJzYXRpb24gY29udGVudHMuIFN1cHBvcnRzIHdyaXRlLWFoZWFkIHJlY29uY2lsaWF0aW9uIGZvclxuICogY2xpZW50LWRpc3BhdGNoYWJsZSBjaGF0IGFjdGlvbnMgKHR1cm4gc3RhcnRzLCBjb25maXJtYXRpb25zLCBldGMuKS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRTdGF0ZVN1YnNjcmlwdGlvbiBleHRlbmRzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxDaGF0U3RhdGU+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQWN0aW9uczogSVBlbmRpbmdDaGF0QWN0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfb3B0aW1pc3RpY1N0YXRlOiBDaGF0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRVcmk6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfc2VxQWxsb2NhdG9yOiAoKSA9PiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y2hhdFVyaTogc3RyaW5nLFxuXHRcdGNsaWVudElkOiBzdHJpbmcsXG5cdFx0c2VxQWxsb2NhdG9yOiAoKSA9PiBudW1iZXIsXG5cdFx0bG9nOiAobXNnOiBzdHJpbmcpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKGNsaWVudElkLCBsb2cpO1xuXHRcdHRoaXMuX2NoYXRVcmkgPSBjaGF0VXJpO1xuXHRcdHRoaXMuX3NlcUFsbG9jYXRvciA9IHNlcUFsbG9jYXRvcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcHRpbWlzdGljYWxseSBhcHBseSBhIGNoYXQgYWN0aW9uLiBSZXR1cm5zIHRoZSBjbGllbnRTZXEgdG8gc2VuZCB0b1xuXHQgKiB0aGUgc2VydmVyIHNvIGl0IGNhbiBlY2hvIGJhY2sgZm9yIHJlY29uY2lsaWF0aW9uLlxuXHQgKi9cblx0YXBwbHlPcHRpbWlzdGljKGFjdGlvbjogQ2hhdEFjdGlvbik6IG51bWJlciB7XG5cdFx0Y29uc3QgY2xpZW50U2VxID0gdGhpcy5fc2VxQWxsb2NhdG9yKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMucHVzaCh7IGNsaWVudFNlcSwgYWN0aW9uIH0pO1xuXHRcdGNvbnN0IGJhc2UgPSB0aGlzLl9vcHRpbWlzdGljU3RhdGUgPz8gdGhpcy52ZXJpZmllZFZhbHVlO1xuXHRcdGlmIChiYXNlKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBjaGF0UmVkdWNlcihiYXNlLCBhY3Rpb24gYXMgSVByb3RvY29sQ2hhdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5fb3B0aW1pc3RpY1N0YXRlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNsaWVudFNlcTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0T3B0aW1pc3RpY1N0YXRlKCk6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGltaXN0aWNTdGF0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYXBwbHlSZWR1Y2VyKHN0YXRlOiBDaGF0U3RhdGUsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiBDaGF0U3RhdGUge1xuXHRcdHJldHVybiBjaGF0UmVkdWNlcihzdGF0ZSwgYWN0aW9uIGFzIElQcm90b2NvbENoYXRBY3Rpb24sIHRoaXMuX2xvZyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2lzUmVsZXZhbnRFbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNDaGF0QWN0aW9uKGVudmVsb3BlLmFjdGlvbikgJiYgZW52ZWxvcGUuY2hhbm5lbCA9PT0gdGhpcy5fY2hhdFVyaTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIuX29uU25hcHNob3RBcHBsaWVkKGZyb21TZXEpO1xuXHRcdHRoaXMuX3JlY29tcHV0ZU9wdGltaXN0aWMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVjb25jaWxlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSwgaXNPd25BY3Rpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBBIHJlamVjdGVkIGVudmVsb3BlIG11c3QgbmV2ZXIgbXV0YXRlIGNvbmZpcm1lZCBzdGF0ZSBcdTIwMTQgaXQgb25seSByb2xsc1xuXHRcdC8vIGJhY2sgdGhlIG9yaWdpbmF0aW5nIGNsaWVudCdzIG1hdGNoaW5nIG9wdGltaXN0aWMgYWN0aW9uLiBHdWFyZGluZyBhbGxcblx0XHQvLyBhcHBseSBicmFuY2hlcyBhbHNvIHByZXZlbnRzIGEgYnJvYWRjYXN0IHJlamVjdGlvbiBmcm9tIGxlYWtpbmcgdGhlXG5cdFx0Ly8gcmVqZWN0ZWQgYWN0aW9uIGludG8gYSBub24tb3JpZ2luIGNsaWVudCdzIHN0YXRlLlxuXHRcdGlmIChpc093bkFjdGlvbiAmJiBlbnZlbG9wZS5vcmlnaW4pIHtcblx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuX3BlbmRpbmdBY3Rpb25zLmZpbmRJbmRleChwID0+IHAuY2xpZW50U2VxID09PSBlbnZlbG9wZS5vcmlnaW4hLmNsaWVudFNlcSk7XG5cdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHRpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpcm1lZEFwcGx5KGVudmVsb3BlLmFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24pIHtcblx0XHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24pIHtcblx0XHRcdHRoaXMuX3Byb21vdGVQZW5kaW5nVHVyblN0YXJ0SWZUZXJtaW5hbChlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvbW90ZVBlbmRpbmdUdXJuU3RhcnRJZlRlcm1pbmFsKGFjdGlvbjogU3RhdGVBY3Rpb24pOiB2b2lkIHtcblx0XHQvLyBBIGJhY2tlbmQtb3JpZ2luYXRlZCB0ZXJtaW5hbCB0dXJuIGFjdGlvbiBtYXkgYXJyaXZlIHdpdGhvdXQgdGhlIGNsaWVudFNlcVxuXHRcdC8vIHRoYXQgd291bGQgbm9ybWFsbHkgY29uZmlybSBvdXIgb3B0aW1pc3RpYyB0dXJuIHN0YXJ0LiBQcm9tb3RlIHRoYXQgc3RhcnRcblx0XHQvLyBmaXJzdCBzbyB0aGUgdGVybWluYWwgYWN0aW9uIGNhbiBjbG9zZSBpdCBpbnN0ZWFkIG9mIGxlYXZpbmcgaXQgcGVuZGluZy5cblx0XHRpZiAoIWlzQ2hhdEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlICYmIGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkICYmIGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRFcnJvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3BlbmRpbmdBY3Rpb25zLmZpbmRJbmRleChwID0+IHAuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkICYmIHAuYWN0aW9uLnR1cm5JZCA9PT0gYWN0aW9uLnR1cm5JZCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBbeyBhY3Rpb246IHBlbmRpbmdBY3Rpb24gfV0gPSB0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdGlmICh0aGlzLl9jb25maXJtZWRTdGF0ZSAmJiAoIXRoaXMuX2NvbmZpcm1lZFN0YXRlLmFjdGl2ZVR1cm4gfHwgdGhpcy5fY29uZmlybWVkU3RhdGUuYWN0aXZlVHVybi5pZCAhPT0gYWN0aW9uLnR1cm5JZCkpIHtcblx0XHRcdHRoaXMuX2NvbmZpcm1lZFN0YXRlID0gdGhpcy5fYXBwbHlSZWR1Y2VyKHRoaXMuX2NvbmZpcm1lZFN0YXRlLCBwZW5kaW5nQWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb25maXJtZWRBcHBseShhY3Rpb246IFN0YXRlQWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1lZFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRTdGF0ZSA9IHRoaXMuX2FwcGx5UmVkdWNlcih0aGlzLl9jb25maXJtZWRTdGF0ZSwgYWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbXB1dGVPcHRpbWlzdGljKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IHRoaXMuX2NvbmZpcm1lZFN0YXRlO1xuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9wZW5kaW5nQWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoY29uZmlybWVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IHN0YXRlID0gY29uZmlybWVkO1xuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLl9wZW5kaW5nQWN0aW9ucykge1xuXHRcdFx0c3RhdGUgPSBjaGF0UmVkdWNlcihzdGF0ZSwgcGVuZGluZy5hY3Rpb24gYXMgSVByb3RvY29sQ2hhdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHR9XG5cdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzdGF0ZSk7XG5cdH1cblxuXHRjbGVhclBlbmRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRQZW5kaW5nQWN0aW9ucygpOiBJUGVuZGluZ0Rpc3BhdGNoQWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nQWN0aW9ucy5tYXAocCA9PiAoeyBjbGllbnRTZXE6IHAuY2xpZW50U2VxLCBhY3Rpb246IHAuYWN0aW9uLCBjaGFubmVsOiB0aGlzLl9jaGF0VXJpIH0pKTtcblx0fVxuXG5cdGRyb3BQZW5kaW5nQnlDbGllbnRTZXEoY2xpZW50U2VxOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9wZW5kaW5nQWN0aW9ucy5maW5kSW5kZXgocCA9PiBwLmNsaWVudFNlcSA9PT0gY2xpZW50U2VxKTtcblx0XHRpZiAoaWR4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG4vLyAtLS0gVGVybWluYWwgU3RhdGUgU3Vic2NyaXB0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFN1YnNjcmlwdGlvbiB0byBhIHRlcm1pbmFsIGF0IGFuIGFnZW50LWhvc3QgdGVybWluYWwgVVJJLlxuICogU2VydmVyLW9ubHkgbXV0YXRpb25zIFx1MjAxNCBubyB3cml0ZS1haGVhZCAodGVybWluYWwgSS9PIGlzIHNpZGUtZWZmZWN0LW9ubHkpLlxuICovXG5leHBvcnQgY2xhc3MgVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvbiBleHRlbmRzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxUZXJtaW5hbFN0YXRlPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxVcmk6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcih0ZXJtaW5hbFVyaTogc3RyaW5nLCBjbGllbnRJZDogc3RyaW5nLCBsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGNsaWVudElkLCBsb2cpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsVXJpID0gdGVybWluYWxVcmk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2FwcGx5UmVkdWNlcihzdGF0ZTogVGVybWluYWxTdGF0ZSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IFRlcm1pbmFsU3RhdGUge1xuXHRcdHJldHVybiB0ZXJtaW5hbFJlZHVjZXIoc3RhdGUsIGFjdGlvbiBhcyBUZXJtaW5hbEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbnZlbG9wZS5hY3Rpb24udHlwZS5zdGFydHNXaXRoKCd0ZXJtaW5hbC8nKSAmJiBlbnZlbG9wZS5jaGFubmVsID09PSB0aGlzLl90ZXJtaW5hbFVyaTtcblx0fVxufVxuXG4vLyAtLS0gQ2hhbmdlc2V0IFN0YXRlIFN1YnNjcmlwdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFN1YnNjcmlwdGlvbiB0byBhIGNoYW5nZXNldCBhdCBhbiBleHBhbmRlZCBjaGFuZ2VzZXQgVVJJIChlLmcuXG4gKiBgPHNlc3Npb25Vcmk+L2NoYW5nZXNldC9zZXNzaW9uYCkuXG4gKlxuICogQ2hhbmdlc2V0IHJldmlldyBhY3Rpb25zIGFyZSBjbGllbnQtZGlzcGF0Y2hhYmxlLCBzbyB0aGlzIHN1YnNjcmlwdGlvblxuICogc3VwcG9ydHMgd3JpdGUtYWhlYWQgcmVjb25jaWxpYXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGFuZ2VzZXRTdGF0ZVN1YnNjcmlwdGlvbiBleHRlbmRzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxDaGFuZ2VzZXRTdGF0ZT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBY3Rpb25zOiB7IHJlYWRvbmx5IGNsaWVudFNlcTogbnVtYmVyOyByZWFkb25seSBhY3Rpb246IENsaWVudENoYW5nZXNldEFjdGlvbiB9W10gPSBbXTtcblx0cHJpdmF0ZSBfb3B0aW1pc3RpY1N0YXRlOiBDaGFuZ2VzZXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlc2V0VXJpOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGNoYW5nZXNldFVyaTogc3RyaW5nLCBjbGllbnRJZDogc3RyaW5nLCBzZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlciwgbG9nOiAobXNnOiBzdHJpbmcpID0+IHZvaWQpIHtcblx0XHRzdXBlcihjbGllbnRJZCwgbG9nKTtcblx0XHR0aGlzLl9jaGFuZ2VzZXRVcmkgPSBjaGFuZ2VzZXRVcmk7XG5cdFx0dGhpcy5fc2VxQWxsb2NhdG9yID0gc2VxQWxsb2NhdG9yO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wdGltaXN0aWNhbGx5IGFwcGx5IGEgY2hhbmdlc2V0IGFjdGlvbiBhbmQgcmV0dXJuIGl0cyBjbGllbnQgc2VxdWVuY2UuXG5cdCAqL1xuXHRhcHBseU9wdGltaXN0aWMoYWN0aW9uOiBDbGllbnRDaGFuZ2VzZXRBY3Rpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHRoaXMuX3NlcUFsbG9jYXRvcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLnB1c2goeyBjbGllbnRTZXEsIGFjdGlvbiB9KTtcblx0XHRjb25zdCBiYXNlID0gdGhpcy5fb3B0aW1pc3RpY1N0YXRlID8/IHRoaXMudmVyaWZpZWRWYWx1ZTtcblx0XHRpZiAoYmFzZSkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gY2hhbmdlc2V0UmVkdWNlcihiYXNlLCBhY3Rpb24sIHRoaXMuX2xvZyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHRoaXMuX29wdGltaXN0aWNTdGF0ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBjbGllbnRTZXE7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldE9wdGltaXN0aWNTdGF0ZSgpOiBDaGFuZ2VzZXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGltaXN0aWNTdGF0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYXBwbHlSZWR1Y2VyKHN0YXRlOiBDaGFuZ2VzZXRTdGF0ZSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IENoYW5nZXNldFN0YXRlIHtcblx0XHRyZXR1cm4gY2hhbmdlc2V0UmVkdWNlcihzdGF0ZSwgYWN0aW9uIGFzIENoYW5nZXNldEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0NoYW5nZXNldEFjdGlvbihlbnZlbG9wZS5hY3Rpb24pICYmIGVudmVsb3BlLmNoYW5uZWwgPT09IHRoaXMuX2NoYW5nZXNldFVyaTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIuX29uU25hcHNob3RBcHBsaWVkKGZyb21TZXEpO1xuXHRcdHRoaXMuX3JlY29tcHV0ZU9wdGltaXN0aWMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVjb25jaWxlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSwgaXNPd25BY3Rpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoaXNPd25BY3Rpb24gJiYgZW52ZWxvcGUub3JpZ2luKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3BlbmRpbmdBY3Rpb25zLmZpbmRJbmRleChwZW5kaW5nID0+IHBlbmRpbmcuY2xpZW50U2VxID09PSBlbnZlbG9wZS5vcmlnaW4hLmNsaWVudFNlcSk7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGlmICghZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlybWVkQXBwbHkoYWN0aW9uOiBTdGF0ZUFjdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25maXJtZWRTdGF0ZSkge1xuXHRcdFx0dGhpcy5fY29uZmlybWVkU3RhdGUgPSB0aGlzLl9hcHBseVJlZHVjZXIodGhpcy5fY29uZmlybWVkU3RhdGUsIGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb21wdXRlT3B0aW1pc3RpYygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maXJtZWQgPSB0aGlzLl9jb25maXJtZWRTdGF0ZTtcblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wZW5kaW5nQWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoY29uZmlybWVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc3RhdGUgPSBjb25maXJtZWQ7XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMuX3BlbmRpbmdBY3Rpb25zKSB7XG5cdFx0XHRzdGF0ZSA9IGNoYW5nZXNldFJlZHVjZXIoc3RhdGUsIHBlbmRpbmcuYWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdH1cblx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0fVxufVxuXG50eXBlIE1hbmFnZWRTdWJzY3JpcHRpb24gPSBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24gfCBDaGF0U3RhdGVTdWJzY3JpcHRpb24gfCBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uIHwgQ2hhbmdlc2V0U3RhdGVTdWJzY3JpcHRpb24gfCBBbm5vdGF0aW9uc1N0YXRlU3Vic2NyaXB0aW9uO1xuXG4vLyAtLS0gQW5ub3RhdGlvbnMgU3RhdGUgU3Vic2NyaXB0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdBbm5vdGF0aW9uc0FjdGlvbiB7XG5cdHJlYWRvbmx5IGNsaWVudFNlcTogbnVtYmVyO1xuXHRyZWFkb25seSBhY3Rpb246IEFubm90YXRpb25zQWN0aW9uO1xufVxuXG4vKipcbiAqIFN1YnNjcmlwdGlvbiB0byBhIHNlc3Npb24ncyBhbm5vdGF0aW9ucyBjaGFubmVsIChlLmcuXG4gKiBgPHNlc3Npb25Vcmk+L2Fubm90YXRpb25zYCkuXG4gKlxuICogQW5ub3RhdGlvbnMgYWN0aW9ucyBhcmUgY2xpZW50LWRpc3BhdGNoYWJsZSwgc28gdGhpcyBzdWJzY3JpcHRpb24gc3VwcG9ydHNcbiAqIHdyaXRlLWFoZWFkIHJlY29uY2lsaWF0aW9uOiBvcHRpbWlzdGljIHN0YXRlIGlzIGxheWVyZWQgb24gdG9wIG9mIGNvbmZpcm1lZFxuICogc3RhdGUgYW5kIHJlY29uY2lsZWQgYXMgdGhlIHNlcnZlciBlY2hvZXMgdGhlIGNsaWVudCdzIG93biBhY3Rpb25zIGJhY2suXG4gKlxuICogTGlrZSB7QGxpbmsgQ2hhbmdlc2V0U3RhdGVTdWJzY3JpcHRpb259LCB0aGUgc3Vic2NyaXB0aW9uIGRvZXMgTk9UXG4gKiBzZWxmLXRlYXItZG93biBvbiBsaWZlY3ljbGUgZXZlbnRzOyBjbGVhbnVwIGlzIGRyaXZlbiBleHRlcm5hbGx5IGJ5IHRoZVxuICogaG9sZGVyIHJlbGVhc2luZyBpdHMgYElSZWZlcmVuY2VgLlxuICovXG5leHBvcnQgY2xhc3MgQW5ub3RhdGlvbnNTdGF0ZVN1YnNjcmlwdGlvbiBleHRlbmRzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxBbm5vdGF0aW9uc1N0YXRlPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0FjdGlvbnM6IElQZW5kaW5nQW5ub3RhdGlvbnNBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9vcHRpbWlzdGljU3RhdGU6IEFubm90YXRpb25zU3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Fubm90YXRpb25zVXJpOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGFubm90YXRpb25zVXJpOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcsIHNlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyLCBsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGNsaWVudElkLCBsb2cpO1xuXHRcdHRoaXMuX2Fubm90YXRpb25zVXJpID0gYW5ub3RhdGlvbnNVcmk7XG5cdFx0dGhpcy5fc2VxQWxsb2NhdG9yID0gc2VxQWxsb2NhdG9yO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wdGltaXN0aWNhbGx5IGFwcGx5IGFuIGFubm90YXRpb25zIGFjdGlvbi4gUmV0dXJucyB0aGUgY2xpZW50U2VxIHRvXG5cdCAqIHNlbmQgdG8gdGhlIHNlcnZlciBzbyBpdCBjYW4gZWNobyBiYWNrIGZvciByZWNvbmNpbGlhdGlvbi5cblx0ICovXG5cdGFwcGx5T3B0aW1pc3RpYyhhY3Rpb246IEFubm90YXRpb25zQWN0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCBjbGllbnRTZXEgPSB0aGlzLl9zZXFBbGxvY2F0b3IoKTtcblx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5wdXNoKHsgY2xpZW50U2VxLCBhY3Rpb24gfSk7XG5cdFx0Y29uc3QgYmFzZSA9IHRoaXMuX29wdGltaXN0aWNTdGF0ZSA/PyB0aGlzLnZlcmlmaWVkVmFsdWU7XG5cdFx0aWYgKGJhc2UpIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IGFubm90YXRpb25zUmVkdWNlcihiYXNlLCBhY3Rpb24sIHRoaXMuX2xvZyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHRoaXMuX29wdGltaXN0aWNTdGF0ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBjbGllbnRTZXE7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldE9wdGltaXN0aWNTdGF0ZSgpOiBBbm5vdGF0aW9uc1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW1pc3RpY1N0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseVJlZHVjZXIoc3RhdGU6IEFubm90YXRpb25zU3RhdGUsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiBBbm5vdGF0aW9uc1N0YXRlIHtcblx0XHRyZXR1cm4gYW5ub3RhdGlvbnNSZWR1Y2VyKHN0YXRlLCBhY3Rpb24gYXMgQW5ub3RhdGlvbnNBY3Rpb24sIHRoaXMuX2xvZyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2lzUmVsZXZhbnRFbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBbm5vdGF0aW9uc0FjdGlvbihlbnZlbG9wZS5hY3Rpb24pICYmIGVudmVsb3BlLmNoYW5uZWwgPT09IHRoaXMuX2Fubm90YXRpb25zVXJpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5fb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcSk7XG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWNvbmNpbGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlLCBpc093bkFjdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc093bkFjdGlvbiAmJiBlbnZlbG9wZS5vcmlnaW4pIHtcblx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuX3BlbmRpbmdBY3Rpb25zLmZpbmRJbmRleChwID0+IHAuY2xpZW50U2VxID09PSBlbnZlbG9wZS5vcmlnaW4hLmNsaWVudFNlcSk7XG5cdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHRpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpcm1lZEFwcGx5KGVudmVsb3BlLmFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbXB1dGVPcHRpbWlzdGljKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maXJtZWRBcHBseShhY3Rpb246IFN0YXRlQWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1lZFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRTdGF0ZSA9IHRoaXMuX2FwcGx5UmVkdWNlcih0aGlzLl9jb25maXJtZWRTdGF0ZSwgYWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbXB1dGVPcHRpbWlzdGljKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IHRoaXMuX2NvbmZpcm1lZFN0YXRlO1xuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdBY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkOyAvLyBObyBwZW5kaW5nIFx1MjE5MiB2YWx1ZSBmYWxscyB0aHJvdWdoIHRvIGNvbmZpcm1lZFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShjb25maXJtZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzdGF0ZSA9IGNvbmZpcm1lZDtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5fcGVuZGluZ0FjdGlvbnMpIHtcblx0XHRcdHN0YXRlID0gYW5ub3RhdGlvbnNSZWR1Y2VyKHN0YXRlLCBwZW5kaW5nLmFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHR9XG5cdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzdGF0ZSk7XG5cdH1cbn1cblxudHlwZSBNYW5hZ2VkU3Vic2NyaXB0aW9uRW50cnkgPSB7IHN1YjogTWFuYWdlZFN1YnNjcmlwdGlvbjsga2luZDogU3RhdGVDb21wb25lbnRzOyByZWZDb3VudDogbnVtYmVyOyBob2xkZXJzOiBNYXA8bnVtYmVyLCBzdHJpbmc+IH07XG5cbi8vIC0tLSBTdWJzY3JpcHRpb24gTWFuYWdlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuLyoqXG4gKiBNYW5hZ2VzIHRoZSBsaWZlY3ljbGUgb2YgcmVzb3VyY2Ugc3Vic2NyaXB0aW9ucyBmb3IgYW4gYWdlbnQgY29ubmVjdGlvbi5cbiAqXG4gKiBQcm92aWRlcyByZWZjb3VudGVkIGFjY2VzcyB2aWEge0BsaW5rIGdldFN1YnNjcmlwdGlvbn0gXHUyMDE0IHRoZSBzdWJzY3JpcHRpb25cbiAqIGlzIGNyZWF0ZWQgb24gZmlyc3QgYWNxdWlyZSwgc3Vic2NyaWJlcyB0byB0aGUgc2VydmVyLCBhbmQgc3RheXMgYWxpdmVcbiAqIHVudGlsIHRoZSBsYXN0IHJlZmVyZW5jZSBpcyBkaXNwb3NlZC5cbiAqXG4gKiBUaGUgY29ubmVjdGlvbiBmZWVkcyBhY3Rpb24gZW52ZWxvcGVzIHRvIGFsbCBhY3RpdmUgc3Vic2NyaXB0aW9ucyB2aWFcbiAqIHtAbGluayByZWNlaXZlRW52ZWxvcGV9LlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3Vic2NyaXB0aW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxNYW5hZ2VkU3Vic2NyaXB0aW9uRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luZmxpZ2h0Q3JlYXRlcyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPHVua25vd24+PigpO1xuXHRwcml2YXRlIF9yZWZlcmVuY2VPd25lcklkcyA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RTdGF0ZTogUm9vdFN0YXRlU3Vic2NyaXB0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nOiAobXNnOiBzdHJpbmcpID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1YnNjcmliZTogKHJlc291cmNlOiBVUkkpID0+IFByb21pc2U8SVN0YXRlU25hcHNob3Q+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bnN1YnNjcmliZTogKHJlc291cmNlOiBVUkkpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y2xpZW50SWQ6IHN0cmluZyxcblx0XHRzZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlcixcblx0XHRsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCxcblx0XHRzdWJzY3JpYmU6IChyZXNvdXJjZTogVVJJKSA9PiBQcm9taXNlPElTdGF0ZVNuYXBzaG90Pixcblx0XHR1bnN1YnNjcmliZTogKHJlc291cmNlOiBVUkkpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY2xpZW50SWQgPSBjbGllbnRJZDtcblx0XHR0aGlzLl9zZXFBbGxvY2F0b3IgPSBzZXFBbGxvY2F0b3I7XG5cdFx0dGhpcy5fbG9nID0gbG9nO1xuXHRcdHRoaXMuX3N1YnNjcmliZSA9IHN1YnNjcmliZTtcblx0XHR0aGlzLl91bnN1YnNjcmliZSA9IHVuc3Vic2NyaWJlO1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSb290U3RhdGVTdWJzY3JpcHRpb24oY2xpZW50SWQsIGxvZykpO1xuXHR9XG5cblx0LyoqIFRoZSBhbHdheXMtbGl2ZSByb290IHN0YXRlIHN1YnNjcmlwdGlvbi4gKi9cblx0Z2V0IHJvb3RTdGF0ZSgpOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvb3RTdGF0ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbml0aWFsaXplIHRoZSByb290IHN0YXRlIGZyb20gYSBzbmFwc2hvdCByZWNlaXZlZCBkdXJpbmcgdGhlXG5cdCAqIGNvbm5lY3Rpb24gaGFuZHNoYWtlLlxuXHQgKi9cblx0aGFuZGxlUm9vdFNuYXBzaG90KHN0YXRlOiBSb290U3RhdGUsIGZyb21TZXE6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZS5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgZnJvbVNlcSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBleGlzdGluZyBzdWJzY3JpcHRpb24gd2l0aG91dCBhZmZlY3RpbmcgaXRzIHJlZmNvdW50LlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIG5vIHN1YnNjcmlwdGlvbiBpcyBhY3RpdmUgZm9yIHRoZSBnaXZlbiByZXNvdXJjZS5cblx0ICovXG5cdGdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxUPihyZXNvdXJjZTogVVJJKTogSUFnZW50U3Vic2NyaXB0aW9uPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KHJlc291cmNlKTtcblx0XHRyZXR1cm4gZW50cnk/LnN1YiBhcyBJQWdlbnRTdWJzY3JpcHRpb248VD4gfCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgaW4tZmxpZ2h0IGBjcmVhdGVTZXNzaW9uYCBQcm9taXNlIGZvciB0aGlzIFVSSSwgb3IgYHVuZGVmaW5lZGAgaWYgbm8gY3JlYXRlIGlzIHBlbmRpbmcuIFVzZWQgYnlcblx0ICogY2FsbGVycyB0aGF0IG5lZWQgdG8gZ2F0ZSB0aGVpciBvd24gd29yayBvbiBhIHN0aWxsLXJ1bm5pbmcgZWFnZXIgYGNyZWF0ZVNlc3Npb25gIChlLmcuIHRoZSBjaGF0IGhhbmRsZXIgYXdhaXRzXG5cdCAqIHRoaXMgYmVmb3JlIGRlY2lkaW5nIHdoZXRoZXIgdGhlIHNlc3Npb25zIHByb3ZpZGVyJ3MgZWFnZXItY3JlYXRlIHJhY2VkIGZpcnN0IHNlbmQpLlxuXHQgKi9cblx0Z2V0SW5mbGlnaHRTZXNzaW9uQ3JlYXRlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW5mbGlnaHRDcmVhdGVzLmdldChyZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYW4gaW4tZmxpZ2h0IGBjcmVhdGVTZXNzaW9uYCBQcm9taXNlIGZvciBhIHNlc3Npb24gVVJJLiBBbnlcblx0ICogc3Vic2NyaWJlIGlzc3VlZCBmb3IgdGhpcyByZXNvdXJjZSB3aGlsZSB0aGUgY3JlYXRlIGlzIHBlbmRpbmcgd2FpdHNcblx0ICogZm9yIHRoZSBQcm9taXNlIGJlZm9yZSBpc3N1aW5nIHRoZSB3aXJlLWxldmVsIHN1YnNjcmliZS5cblx0ICovXG5cdHRyYWNrU2Vzc2lvbkNyZWF0ZShyZXNvdXJjZTogVVJJLCBwcm9taXNlOiBQcm9taXNlPHVua25vd24+KTogdm9pZCB7XG5cdFx0dGhpcy5faW5mbGlnaHRDcmVhdGVzLnNldChyZXNvdXJjZSwgcHJvbWlzZSk7XG5cdFx0Ly8gVGhpcyBicmFuY2ggb25seSBvYnNlcnZlcyBzZXR0bGVtZW50IHRvIGV2aWN0IHRoZSBpbmZsaWdodCBlbnRyeTsgdGhlXG5cdFx0Ly8gYGNyZWF0ZVNlc3Npb25gIGNhbGxlciAoYW5kIHRoZSBzZXJ2ZXIsIHZpYSBsb2dTZXJ2aWNlLmVycm9yKSBvd25zIHRoZVxuXHRcdC8vIHJlc3VsdC4gYGZpbmFsbHlgIHJlLXJhaXNlcyBhIHJlamVjdGlvbiwgc28gd2l0aG91dCB0aGlzIHRyYWlsaW5nXG5cdFx0Ly8gYGNhdGNoYCBhbiBleHBlY3RlZCBjcmVhdGUgZmFpbHVyZSAoZS5nLiBBSFBfQVVUSF9SRVFVSVJFRCkgd291bGQgYmVcblx0XHQvLyByZXBvcnRlZCBhIHNlY29uZCB0aW1lIGFzIGFuIHVuaGFuZGxlZCByZWplY3Rpb24uXG5cdFx0dm9pZCBwcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2luZmxpZ2h0Q3JlYXRlcy5nZXQocmVzb3VyY2UpID09PSBwcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuX2luZmxpZ2h0Q3JlYXRlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKCgpID0+IHsgfSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IG9yIGNyZWF0ZSBhIHJlZmNvdW50ZWQgc3Vic2NyaXB0aW9uIHRvIGFueSByZXNvdXJjZS4gRGlzcG9zaW5nXG5cdCAqIHRoZSByZXR1cm5lZCByZWZlcmVuY2UgZGVjcmVtZW50cyB0aGUgcmVmY291bnQ7IHdoZW4gaXQgcmVhY2hlcyB6ZXJvXG5cdCAqIHRoZSBzdWJzY3JpcHRpb24gaXMgdG9ybiBkb3duIGFuZCB0aGUgc2VydmVyIGlzIG5vdGlmaWVkLlxuXHQgKlxuXHQgKiBgb3duZXJgIG5hbWVzIHRoZSBjYWxsZXIgaG9sZGluZyB0aGUgcmVmZXJlbmNlIHNvIGluc3BlY3Rpb24gc3VyZmFjZXNcblx0ICogKHNlZSB7QGxpbmsgZ2V0QWN0aXZlU3Vic2NyaXB0aW9uc30pIGNhbiBhdHRyaWJ1dGUgd2hvIGlzIHJldGFpbmluZyBhXG5cdCAqIHN1YnNjcmlwdGlvbi4gVXNlIGEgc3RhYmxlLCBodW1hbi1yZWFkYWJsZSBpZGVudGlmaWVyIHN1Y2ggYXMgdGhlXG5cdCAqIGFjcXVpcmluZyBjbGFzcyBuYW1lLlxuXHQgKi9cblx0Z2V0U3Vic2NyaXB0aW9uPFQ+KGtpbmQ6IFN0YXRlQ29tcG9uZW50cywgcmVzb3VyY2U6IFVSSSwgb3duZXI6IHN0cmluZyk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRpZiAoZXhpc3Rpbmcuc3ViLnZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0Ly8gRmFpbGVkIHN1YnNjcmlwdGlvbnMgc2hvdWxkIG5vdCBwb2lzb24gdGhlIHJlc291cmNlIGZvcmV2ZXIuIEV2aWN0XG5cdFx0XHRcdC8vIHRoZSBlcnJvcmVkIGVudHJ5IHNvIHRoaXMgYWNxdWlyZSBwZXJmb3JtcyBhIGZyZXNoIHN1YnNjcmliZS5cblx0XHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9ucy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NlU3Vic2NyaXB0aW9uRW50cnkocmVzb3VyY2UsIGV4aXN0aW5nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4aXN0aW5nLnJlZkNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hY3F1aXJlUmVmZXJlbmNlPFQ+KHJlc291cmNlLCBleGlzdGluZywgb3duZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBuZXcgc3Vic2NyaXB0aW9uIGJhc2VkIG9uIGNhbGxlci1zcGVjaWZpZWQga2luZFxuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3ViID0gdGhpcy5fY3JlYXRlU3Vic2NyaXB0aW9uKGtpbmQsIGtleSk7XG5cdFx0Y29uc3QgZW50cnk6IE1hbmFnZWRTdWJzY3JpcHRpb25FbnRyeSA9IHsgc3ViLCBraW5kLCByZWZDb3VudDogMSwgaG9sZGVyczogbmV3IE1hcCgpIH07XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9ucy5zZXQocmVzb3VyY2UsIGVudHJ5KTtcblxuXHRcdC8vIEtpY2sgb2ZmIHNlcnZlciBzdWJzY3JpcHRpb24gYXN5bmNocm9ub3VzbHkuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgZW50cnkgcmVmZXJlbmNlIHNvIHdlIGNhbiB2YWxpZGF0ZSBpdCBoYXNuJ3QgYmVlblxuXHRcdC8vIHJlcGxhY2VkIGJ5IGEgbmV3IHN1YnNjcmlwdGlvbiBmb3IgdGhlIHNhbWUga2V5IChyYWNlIGd1YXJkKS5cblx0XHR2b2lkIChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbmZsaWdodCA9IHRoaXMuX2luZmxpZ2h0Q3JlYXRlcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKGluZmxpZ2h0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgaW5mbGlnaHQ7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIFN3YWxsb3cgXHUyMDE0IGZhbGwgdGhyb3VnaCB0byBzdWJzY3JpYmUgc28gdGhlIGVycm9yXG5cdFx0XHRcdFx0Ly8gc3VyZmFjZXMgY29uc2lzdGVudGx5IHZpYSBzZXRFcnJvcigpIG9uIHRoZVxuXHRcdFx0XHRcdC8vIHN1YnNjcmlwdGlvbiwgbWF0Y2hpbmcgdGhlIG5vLWluZmxpZ2h0IHBhdGguXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fc3Vic2NyaWJlKHJlc291cmNlKTtcblx0XHRcdFx0aWYgKHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KHJlc291cmNlKSA9PT0gZW50cnkpIHtcblx0XHRcdFx0XHRzdWIuaGFuZGxlU25hcHNob3Qoc25hcHNob3Quc3RhdGUgYXMgbmV2ZXIsIHNuYXBzaG90LmZyb21TZXEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KHJlc291cmNlKSA9PT0gZW50cnkpIHtcblx0XHRcdFx0XHRzdWIuc2V0RXJyb3IoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiBuZXcgRXJyb3IoU3RyaW5nKGVycikpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fYWNxdWlyZVJlZmVyZW5jZTxUPihyZXNvdXJjZSwgZW50cnksIG93bmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBgb3duZXJgIGFzIGEgaG9sZGVyIG9mIGBlbnRyeWAgYW5kIHJldHVybiBhIHJlZmVyZW5jZSB3aG9zZVxuXHQgKiBkaXNwb3NhbCByZW1vdmVzIHRoYXQgaG9sZGVyIGFuZCByZWxlYXNlcyB0aGUgc3Vic2NyaXB0aW9uLiBUaGVcblx0ICogY2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvciB0aGUgbWF0Y2hpbmcgcmVmY291bnQgaW5jcmVtZW50IChhIGZyZXNoXG5cdCAqIGVudHJ5IHN0YXJ0cyBhdCAxOyBhbiBleGlzdGluZyBlbnRyeSBpcyBidW1wZWQgYmVmb3JlIGNhbGxpbmcgdGhpcykuXG5cdCAqL1xuXHRwcml2YXRlIF9hY3F1aXJlUmVmZXJlbmNlPFQ+KHJlc291cmNlOiBVUkksIGVudHJ5OiBNYW5hZ2VkU3Vic2NyaXB0aW9uRW50cnksIG93bmVyOiBzdHJpbmcpOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxUPj4ge1xuXHRcdGNvbnN0IG93bmVySWQgPSArK3RoaXMuX3JlZmVyZW5jZU93bmVySWRzO1xuXHRcdGVudHJ5LmhvbGRlcnMuc2V0KG93bmVySWQsIG93bmVyKTtcblxuXHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogZW50cnkuc3ViIGFzIHVua25vd24gYXMgSUFnZW50U3Vic2NyaXB0aW9uPFQ+LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0ZW50cnkuaG9sZGVycy5kZWxldGUob3duZXJJZCk7XG5cdFx0XHRcdHRoaXMuX3JlbGVhc2VTdWJzY3JpcHRpb24ocmVzb3VyY2UsIGVudHJ5KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VTdWJzY3JpcHRpb25FbnRyeShyZXNvdXJjZTogVVJJLCBlbnRyeTogTWFuYWdlZFN1YnNjcmlwdGlvbkVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5fdHJ5VW5zdWJzY3JpYmUocmVzb3VyY2UpO1xuXHRcdGlmIChlbnRyeS5zdWIgaW5zdGFuY2VvZiBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24gfHwgZW50cnkuc3ViIGluc3RhbmNlb2YgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRlbnRyeS5zdWIuY2xlYXJQZW5kaW5nKCk7XG5cdFx0fVxuXHRcdGVudHJ5LnN1Yi5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF90cnlVbnN1YnNjcmliZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3Vuc3Vic2NyaWJlKHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcblx0XHRcdHRoaXMuX2xvZyhgRmFpbGVkIHRvIHVuc3Vic2NyaWJlICR7cmVzb3VyY2UudG9TdHJpbmcoKX06ICR7bWVzc2FnZX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUm91dGUgYW4gaW5jb21pbmcgYWN0aW9uIGVudmVsb3BlIHRvIGFsbCBhY3RpdmUgc3Vic2NyaXB0aW9ucy5cblx0ICovXG5cdHJlY2VpdmVFbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiB2b2lkIHtcblx0XHQvLyBSb290IHN0YXRlIGdldHMgYWxsIHJvb3QgYWN0aW9uc1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZS5yZWNlaXZlRW52ZWxvcGUoZW52ZWxvcGUpO1xuXHRcdC8vIE90aGVyIHN1YnNjcmlwdGlvbnMgZ2V0IGZpbHRlcmVkIGFjdGlvbnNcblx0XHRmb3IgKGNvbnN0IHsgc3ViIH0gb2YgdGhpcy5fc3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShlbnZlbG9wZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgY2xpZW50IGFjdGlvbi4gQXBwbGllcyBvcHRpbWlzdGljYWxseSB0byB0aGUgcmVsZXZhbnRcblx0ICogc3Vic2NyaXB0aW9uIGlmIGFwcGxpY2FibGUsIHRoZW4gcmV0dXJucyB0aGUgY2xpZW50U2VxLlxuXHQgKlxuXHQgKiBgY2hhbm5lbGAgaXMgdGhlIHByb3RvY29sIFVSSSBzdHJpbmcgaWRlbnRpZnlpbmcgdGhlIGNoYW5uZWwgdGhlXG5cdCAqIGFjdGlvbiB0YXJnZXRzIChhIHNlc3Npb24gVVJJIGZvciBzZXNzaW9uIGFjdGlvbnMsIGV0Yy4pLlxuXHQgKi9cblx0ZGlzcGF0Y2hPcHRpbWlzdGljKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pOiBudW1iZXIge1xuXHRcdGlmIChpc1Nlc3Npb25BY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChVUkkucGFyc2UoY2hhbm5lbCkpO1xuXHRcdFx0aWYgKGVudHJ5Py5zdWIgaW5zdGFuY2VvZiBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LnN1Yi5hcHBseU9wdGltaXN0aWMoYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzQ2hhdEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KFVSSS5wYXJzZShjaGFubmVsKSk7XG5cdFx0XHRpZiAoZW50cnk/LnN1YiBpbnN0YW5jZW9mIENoYXRTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZW50cnkuc3ViLmFwcGx5T3B0aW1pc3RpYyhhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNDaGFuZ2VzZXRBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChVUkkucGFyc2UoY2hhbm5lbCkpO1xuXHRcdFx0aWYgKGVudHJ5Py5zdWIgaW5zdGFuY2VvZiBDaGFuZ2VzZXRTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZW50cnkuc3ViLmFwcGx5T3B0aW1pc3RpYyhhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNBbm5vdGF0aW9uc0FjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KFVSSS5wYXJzZShjaGFubmVsKSk7XG5cdFx0XHRpZiAoZW50cnk/LnN1YiBpbnN0YW5jZW9mIEFubm90YXRpb25zU3RhdGVTdWJzY3JpcHRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LnN1Yi5hcHBseU9wdGltaXN0aWMoYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NlcUFsbG9jYXRvcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVSSXMgY3VycmVudGx5IHN1YnNjcmliZWQgdG8gdmlhIHtAbGluayBnZXRTdWJzY3JpcHRpb259LiBVc2VkIHRvXG5cdCAqIGJ1aWxkIHRoZSBgc3Vic2NyaXB0aW9uc2AgcGF5bG9hZCBmb3IgYSBgcmVjb25uZWN0YCBSUEMgc28gdGhlXG5cdCAqIHNlcnZlciBjYW4gcmVzdG9yZSB0aGVtIGluIG9uZSByb3VuZC10cmlwLlxuXHQgKlxuXHQgKiBEb2VzIE5PVCBpbmNsdWRlIHRoZSBhbHdheXMtbGl2ZSByb290IHN0YXRlLCB3aGljaCB0aGUgcHJvdG9jb2xcblx0ICogY2xpZW50IG1hbmFnZXMgc2VwYXJhdGVseS5cblx0ICovXG5cdGN1cnJlbnRTdWJzY3JpcHRpb25VcmlzKCk6IFVSSVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3N1YnNjcmlwdGlvbnMua2V5cygpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkLW9ubHkgZGVzY3JpcHRvcnMgb2YgZXZlcnkgYWN0aXZlIHJlc291cmNlIHN1YnNjcmlwdGlvbiwgZm9yXG5cdCAqIGluc3BlY3Rpb24vZGVidWcgc3VyZmFjZXMuIERvZXMgTk9UIGluY2x1ZGUgdGhlIGFsd2F5cy1saXZlIHJvb3Rcblx0ICogc3RhdGUsIHdoaWNoIHRoZSBjb25uZWN0aW9uIGV4cG9zZXMgc2VwYXJhdGVseSB2aWEge0BsaW5rIHJvb3RTdGF0ZX0uXG5cdCAqL1xuXHRnZXRBY3RpdmVTdWJzY3JpcHRpb25zKCk6IHJlYWRvbmx5IElBY3RpdmVTdWJzY3JpcHRpb25JbmZvW10ge1xuXHRcdGNvbnN0IG91dDogSUFjdGl2ZVN1YnNjcmlwdGlvbkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3Jlc291cmNlLCBlbnRyeV0gb2YgdGhpcy5fc3Vic2NyaXB0aW9ucykge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBlbnRyeS5zdWIudmFsdWU7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gJ3BlbmRpbmcnIDogdmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/ICdlcnJvcicgOiAnc25hcHNob3QnO1xuXHRcdFx0b3V0LnB1c2goeyByZXNvdXJjZSwga2luZDogZW50cnkua2luZCwgcmVmQ291bnQ6IGVudHJ5LnJlZkNvdW50LCBob2xkZXJzOiB0aGlzLl9zdW1tYXJpemVIb2xkZXJzKGVudHJ5KSwgc3RhdHVzIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0LyoqIEdyb3VwIGFuIGVudHJ5J3MgaG9sZGVycyBieSBvd25lciBuYW1lLCBzb3J0ZWQgYnkgZGVzY2VuZGluZyBjb3VudC4gKi9cblx0cHJpdmF0ZSBfc3VtbWFyaXplSG9sZGVycyhlbnRyeTogTWFuYWdlZFN1YnNjcmlwdGlvbkVudHJ5KTogSUFjdGl2ZVN1YnNjcmlwdGlvbkhvbGRlcltdIHtcblx0XHRjb25zdCBjb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3Qgb3duZXIgb2YgZW50cnkuaG9sZGVycy52YWx1ZXMoKSkge1xuXHRcdFx0Y291bnRzLnNldChvd25lciwgKGNvdW50cy5nZXQob3duZXIpID8/IDApICsgMSk7XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uY291bnRzLmVudHJpZXMoKV1cblx0XHRcdC5tYXAoKFtvd25lciwgY291bnRdKSA9PiAoeyBvd25lciwgY291bnQgfSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi5jb3VudCAtIGEuY291bnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNuYXBzaG90IG9mIGV2ZXJ5IHBlbmRpbmcgb3B0aW1pc3RpYyBhY3Rpb24gYWNyb3NzIGFsbCBzZXNzaW9uXG5cdCAqIHN1YnNjcmlwdGlvbnMuIENhbGxlcnMgdXNlIHRoaXMgdG8gcmVwbGF5IGFjdGlvbnMgYWZ0ZXIgYSB0cmFuc3BvcnRcblx0ICogcmVjb25uZWN0OyBlbnRyaWVzIGFyZSBrZXB0IG9uIHRoZWlyIHN1YnNjcmlwdGlvbnMgdW50aWwgdGhleSdyZVxuXHQgKiBlaXRoZXIgZWNob2VkIGJhY2sgYnkgdGhlIHNlcnZlciBvciBleHBsaWNpdGx5IGRyb3BwZWQgdmlhXG5cdCAqIHtAbGluayBkcm9wUGVuZGluZ1Nlc3Npb25BY3Rpb259LlxuXHQgKi9cblx0Z2V0UGVuZGluZ1Nlc3Npb25BY3Rpb25zKCk6IElQZW5kaW5nRGlzcGF0Y2hBY3Rpb25bXSB7XG5cdFx0Y29uc3Qgb3V0OiBJUGVuZGluZ0Rpc3BhdGNoQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgc3ViIH0gb2YgdGhpcy5fc3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHN1YiBpbnN0YW5jZW9mIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiB8fCBzdWIgaW5zdGFuY2VvZiBDaGF0U3RhdGVTdWJzY3JpcHRpb24pIHtcblx0XHRcdFx0b3V0LnB1c2goLi4uc3ViLmdldFBlbmRpbmdBY3Rpb25zKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZSBhIHNpbmdsZSBwZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9uIGZvciBhIHNlc3Npb24gYnkgaXRzXG5cdCAqIGBjbGllbnRTZXFgLiBVc2VkIGR1cmluZyByZWNvbm5lY3QgdG8gZXZpY3QgYWN0aW9ucyB0aGUgc2VydmVyXG5cdCAqIGFscmVhZHkgcHJvY2Vzc2VkIChhbmQgcmVwbGF5ZWQgYmFjayB0byB1cykgc28gdGhleSdyZSBub3QgcmVzZW50LlxuXHQgKi9cblx0ZHJvcFBlbmRpbmdTZXNzaW9uQWN0aW9uKHNlc3Npb25Vcmk6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KFVSSS5wYXJzZShzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKGVudHJ5Py5zdWIgaW5zdGFuY2VvZiBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24gfHwgZW50cnk/LnN1YiBpbnN0YW5jZW9mIENoYXRTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0ZW50cnkuc3ViLmRyb3BQZW5kaW5nQnlDbGllbnRTZXEoY2xpZW50U2VxKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYSBmcmVzaCBzbmFwc2hvdCB0byBhIHN1YnNjcmliZWQgcmVzb3VyY2UgXHUyMDE0IHVzZWQgd2hlbiB0aGUgc2VydmVyXG5cdCAqIHJlc3BvbmRzIHRvIGEgYHJlY29ubmVjdGAgcmVxdWVzdCB3aXRoIGB0eXBlOiAnc25hcHNob3QnYCBiZWNhdXNlIHRoZVxuXHQgKiByZXBsYXkgYnVmZmVyIG5vIGxvbmdlciBjb3ZlcnMgdGhlIGNsaWVudCdzIGdhcC4gUm91dGVzIHRvIHRoZSByb290XG5cdCAqIHN1YnNjcmlwdGlvbiB3aGVuIHtAbGluayBST09UX1NUQVRFX1VSSX0gbWF0Y2hlcywgb3RoZXJ3aXNlIHJlc2VhdHMgdGhlXG5cdCAqIG1hdGNoaW5nIGVudHJ5IGluIHtAbGluayBfc3Vic2NyaXB0aW9uc30uIFVua25vd24gcmVzb3VyY2VzIGFyZSBpZ25vcmVkLlxuXHQgKi9cblx0YXBwbHlSZWNvbm5lY3RTbmFwc2hvdChyZXNvdXJjZTogc3RyaW5nLCBzdGF0ZTogdW5rbm93biwgZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGlzQWhwUm9vdENoYW5uZWwocmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLl9yb290U3RhdGUuaGFuZGxlU25hcHNob3Qoc3RhdGUgYXMgUm9vdFN0YXRlLCBmcm9tU2VxKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChVUkkucGFyc2UocmVzb3VyY2UpKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENsZWFyIGFueSBwZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9ucyBiZWZvcmUgcmVzZWF0aW5nIGNvbmZpcm1lZFxuXHRcdC8vIHN0YXRlIFxcdTIwMTQgdGhleSB3ZXJlIHByZWRpY2F0ZWQgb24gdGhlIHByZS1kaXNjb25uZWN0IGNvbmZpcm1lZFxuXHRcdC8vIHN0YXRlIGFuZCB3b24ndCByZWNvbmNpbGUgY29ycmVjdGx5IGFnYWluc3QgYSBmcmVzaCBzbmFwc2hvdC5cblx0XHRpZiAoZW50cnkuc3ViIGluc3RhbmNlb2YgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uIHx8IGVudHJ5LnN1YiBpbnN0YW5jZW9mIENoYXRTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0ZW50cnkuc3ViLmNsZWFyUGVuZGluZygpO1xuXHRcdH1cblx0XHRlbnRyeS5zdWIuaGFuZGxlU25hcHNob3Qoc3RhdGUgYXMgbmV2ZXIsIGZyb21TZXEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmsgYSBzZXQgb2Ygc3Vic2NyaXB0aW9ucyBhcyBubyBsb25nZXIgcmVzdW1hYmxlIG9uIHRoZSBzZXJ2ZXJcblx0ICogKHJlcG9ydGVkIHZpYSBgUmVjb25uZWN0UmVwbGF5UmVzdWx0Lm1pc3NpbmdgKS4gVGhlIHN1YnNjcmlwdGlvbnNcblx0ICogdGhlbXNlbHZlcyBzdGF5IGFsaXZlIHNvIGNvbnN1bWVycyBjb250aW51ZSB0byBob2xkIHZhbGlkIHJlZmVyZW5jZXMsXG5cdCAqIGJ1dCB0aGVpciB2YWx1ZSB0cmFuc2l0aW9ucyB0byBhbiBgRXJyb3JgIHVudGlsIHRoZXkncmUgcmVjcmVhdGVkLlxuXHQgKi9cblx0bWFya1N1YnNjcmlwdGlvbnNNaXNzaW5nKG1pc3Npbmc6IHJlYWRvbmx5IFVSSVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBtaXNzaW5nKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRpZiAoZW50cnkuc3ViIGluc3RhbmNlb2YgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uIHx8IGVudHJ5LnN1YiBpbnN0YW5jZW9mIENoYXRTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGVudHJ5LnN1Yi5jbGVhclBlbmRpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyeS5zdWIuc2V0RXJyb3IobmV3IEVycm9yKGBTdWJzY3JpcHRpb24gbm8gbG9uZ2VyIGF2YWlsYWJsZSBhZnRlciByZWNvbm5lY3Q6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU3Vic2NyaXB0aW9uKGtpbmQ6IFN0YXRlQ29tcG9uZW50cywga2V5OiBzdHJpbmcpOiBNYW5hZ2VkU3Vic2NyaXB0aW9uIHtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLlNlc3Npb246XG5cdFx0XHRcdHJldHVybiBuZXcgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uKGtleSwgdGhpcy5fY2xpZW50SWQsIHRoaXMuX3NlcUFsbG9jYXRvciwgdGhpcy5fbG9nKTtcblx0XHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLkNoYXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uKGtleSwgdGhpcy5fY2xpZW50SWQsIHRoaXMuX3NlcUFsbG9jYXRvciwgdGhpcy5fbG9nKTtcblx0XHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLlRlcm1pbmFsOlxuXHRcdFx0XHRyZXR1cm4gbmV3IFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24oa2V5LCB0aGlzLl9jbGllbnRJZCwgdGhpcy5fbG9nKTtcblx0XHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLkNoYW5nZXNldDpcblx0XHRcdFx0cmV0dXJuIG5ldyBDaGFuZ2VzZXRTdGF0ZVN1YnNjcmlwdGlvbihrZXksIHRoaXMuX2NsaWVudElkLCB0aGlzLl9zZXFBbGxvY2F0b3IsIHRoaXMuX2xvZyk7XG5cdFx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5Bbm5vdGF0aW9uczpcblx0XHRcdFx0cmV0dXJuIG5ldyBBbm5vdGF0aW9uc1N0YXRlU3Vic2NyaXB0aW9uKGtleSwgdGhpcy5fY2xpZW50SWQsIHRoaXMuX3NlcUFsbG9jYXRvciwgdGhpcy5fbG9nKTtcblx0XHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLlJvb3Q6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignX2NyZWF0ZVN1YnNjcmlwdGlvbjogcm9vdCBzdWJzY3JpcHRpb24gaXMgbWFuYWdlZCBzZXBhcmF0ZWx5Jyk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcihraW5kLCBgX2NyZWF0ZVN1YnNjcmlwdGlvbjogdW5zdXBwb3J0ZWQgU3RhdGVDb21wb25lbnRzIGtpbmQ6ICR7a2luZH1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWxlYXNlU3Vic2NyaXB0aW9uKHJlc291cmNlOiBVUkksIGV4cGVjdGVkPzogTWFuYWdlZFN1YnNjcmlwdGlvbkVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZSk7XG5cdFx0Ly8gQSBmYWlsZWQgc3Vic2NyaXB0aW9uIGNhbiBiZSBldmljdGVkIGFuZCByZXBsYWNlZCB3aGlsZSBvbGQgcmVmZXJlbmNlc1xuXHRcdC8vIHN0aWxsIGV4aXN0OyBzdGFsZSBkaXNwb3NhbHMgbXVzdCBub3QgcmVsZWFzZSB0aGUgcmVwbGFjZW1lbnQgZW50cnkuXG5cdFx0aWYgKCFlbnRyeSB8fCAoZXhwZWN0ZWQgJiYgZW50cnkgIT09IGV4cGVjdGVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbnRyeS5yZWZDb3VudC0tO1xuXHRcdGlmIChlbnRyeS5yZWZDb3VudCA8PSAwKSB7XG5cdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9kaXNwb3NlU3Vic2NyaXB0aW9uRW50cnkocmVzb3VyY2UsIGVudHJ5KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3Jlc291cmNlLCBlbnRyeV0gb2YgdGhpcy5fc3Vic2NyaXB0aW9ucykge1xuXHRcdFx0dGhpcy5fdHJ5VW5zdWJzY3JpYmUocmVzb3VyY2UpO1xuXHRcdFx0ZW50cnkuc3ViLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKiogUmV0dXJucyB3aGV0aGVyIGFuIGFjdGlvbiBlbnZlbG9wZSB0YXJnZXRzIG9uZSBvZiB0aGUgc3Vic2NyaWJlZCBjaGFubmVsIFVSSXMuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBY3Rpb25FbnZlbG9wZVJlbGV2YW50VG9TdWJzY3JpcHRpb25VcmlzKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSwgc3Vic2NyaWJlZFVyaXM6IEl0ZXJhYmxlPHN0cmluZz4pOiBib29sZWFuIHtcblx0aWYgKGlzQWhwUm9vdENoYW5uZWwoZW52ZWxvcGUuY2hhbm5lbCkpIHtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiBzdWJzY3JpYmVkVXJpcykge1xuXHRcdFx0aWYgKGlzQWhwUm9vdENoYW5uZWwodXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGZvciAoY29uc3QgdXJpIG9mIHN1YnNjcmliZWRVcmlzKSB7XG5cdFx0aWYgKHVyaSA9PT0gZW52ZWxvcGUuY2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLy8gLS0tIE9ic2VydmFibGUgQWRhcHRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBBZGFwdHMgYW4ge0BsaW5rIElBZ2VudFN1YnNjcmlwdGlvbn0gaW50byBhbiB7QGxpbmsgSU9ic2VydmFibGV9IG9mIHRoZVxuICogc3Vic2NyaXB0aW9uJ3MgdmFsdWUuIEVycm9ycyBhbmQgdGhlIHByZS1zbmFwc2hvdCBwaGFzZSBhcmUgc3VyZmFjZWQgYXNcbiAqIGB1bmRlZmluZWRgOyBjb25zdW1lcnMgdGhhdCBuZWVkIHRoZSBlcnJvciBpdHNlbGYgc2hvdWxkIHJlYWRcbiAqIHtAbGluayBJQWdlbnRTdWJzY3JpcHRpb24udmFsdWV9IGRpcmVjdGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gb2JzZXJ2YWJsZUZyb21TdWJzY3JpcHRpb248VD4ob3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCwgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248VD4pOiBJT2JzZXJ2YWJsZTxUIHwgdW5kZWZpbmVkPiB7XG5cdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KG93bmVyLCBzdWIub25EaWRDaGFuZ2UsICgpID0+IHtcblx0XHRjb25zdCB2ID0gc3ViLnZhbHVlO1xuXHRcdHJldHVybiB2IGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiB2O1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBOEI7QUFDdkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0IsMkJBQTJCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUF5QixZQUFrSyxtQkFBbUIsY0FBYyxxQkFBcUIsdUJBQXVCO0FBQ3hRLFNBQVMsa0JBQWtCLGFBQWEsb0JBQW9CLGFBQWEsc0JBQXNCO0FBQy9GLFNBQVMsdUJBQXVCO0FB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
