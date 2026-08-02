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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { equals } from "../../../base/common/objects.js";
import { ILogService } from "../../log/common/log.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { TelemetryLevel } from "../../telemetry/common/telemetry.js";
import { ActionType, isRootAction, isSessionAction, isChatAction, isChangesetAction, isAnnotationsAction } from "../common/state/sessionActions.js";
import { rootReducer, sessionReducer, chatReducer, changesetReducer, annotationsReducer } from "../common/state/sessionReducers.js";
import { createRootState, createSessionState, createChatState, createDefaultChatSummary, chatSummaryFromState, buildDefaultChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, isAhpChatChannel, isDefaultChatUri, mergeSessionWithDefaultChat, isAhpRootChannel, SessionLifecycle, withHostBuildInfo, ROOT_STATE_URI, ChangesetStatus, SessionStatus } from "../common/state/sessionState.js";
import { AgentHostTelemetryLevelConfigKey, platformRootSchema, telemetryLevelToAgentHostConfigValue } from "../common/agentHostSchema.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { buildAnnotationsUri, isAnnotationsUri } from "../common/annotationsUri.js";
import { AgentHostChangesetStateCache } from "./agentHostChangesetStateCache.js";
import { arrayEquals, structuralEquals } from "../../../base/common/equals.js";
import { preserveProviderBackedRootConfigValues } from "../common/agentCustomizationSettings.js";
class SessionSummaryNotifier extends Disposable {
  constructor(_getSummary, _emit) {
    super();
    this._getSummary = _getSummary;
    this._emit = _emit;
    /** Last summary announced to clients (via sessionAdded or sessionSummaryChanged). */
    this._lastNotified = /* @__PURE__ */ new Map();
    /** Sessions whose summary changed since the last flush. */
    this._dirty = /* @__PURE__ */ new Set();
    this._scheduler = this._register(new RunOnceScheduler(() => this._flushAll(), 100));
  }
  /** Records `summary` as the last value announced to clients for `session`. */
  announce(session, summary) {
    this._lastNotified.set(session, summary);
  }
  /** Whether `session` has already been announced to clients. */
  isAnnounced(session) {
    return this._lastNotified.has(session);
  }
  /** Marks `session` dirty and schedules a debounced flush. */
  markDirty(session) {
    this._dirty.add(session);
    this._scheduler.schedule();
  }
  /** Whether `session` has a pending (unflushed) summary change. */
  isDirty(session) {
    return this._dirty.has(session);
  }
  /** Drops the pending dirty flag for `session` without flushing it. */
  clearDirty(session) {
    this._dirty.delete(session);
  }
  /** Drops all notification bookkeeping for `session`. */
  remove(session) {
    this._lastNotified.delete(session);
    this._dirty.delete(session);
  }
  _flushAll() {
    for (const session of this._dirty) {
      this.flush(session);
    }
    this._dirty.clear();
  }
  /**
   * Emits a `root/sessionSummaryChanged` notification for `session` if its
   * current summary differs from the last announced one, then advances the
   * snapshot. Does NOT clear the dirty flag — callers own that bookkeeping.
   */
  flush(session) {
    const current = this._getSummary(session);
    const lastNotified = this._lastNotified.get(session);
    if (!current || !lastNotified) {
      return;
    }
    const changes = {};
    if (current.title !== lastNotified.title) {
      changes.title = current.title;
    }
    if (current.status !== lastNotified.status) {
      changes.status = current.status;
    }
    if (current.activity !== lastNotified.activity) {
      changes.activity = current.activity;
    }
    if (current.modifiedAt !== lastNotified.modifiedAt) {
      changes.modifiedAt = current.modifiedAt;
    }
    if (current.project !== lastNotified.project) {
      changes.project = current.project;
    }
    if (current.changes !== lastNotified.changes) {
      changes.changes = current.changes;
    }
    if (current.workingDirectories !== lastNotified.workingDirectories) {
      changes.workingDirectories = current.workingDirectories;
    }
    if (current._meta !== lastNotified._meta) {
      changes._meta = current._meta;
    }
    this._lastNotified.set(session, current);
    if (Object.keys(changes).length > 0) {
      this._emit(session, changes);
    }
  }
}
const IAgentHostStateManager = createDecorator("agentHostStateManager");
let AgentHostStateManager = class extends Disposable {
  constructor(_logService, options = {}) {
    super();
    this._logService = _logService;
    this._serverSeq = 0;
    /**
     * Authoritative per-session state, keyed by session URI string. Each entry
     * bundles the flat {@link SessionState} with the catalog-only fields that
     * are not part of the state (`createdAt`, `modifiedAt`, `changes`). The
     * root-channel {@link SessionSummary} catalog view is derived on demand from
     * an entry via {@link getSessionSummary} (its `_meta` is the same object as
     * {@link SessionState._meta}); the host streams catalog deltas via
     * `root/sessionSummaryChanged`.
     */
    this._sessionStates = /* @__PURE__ */ new Map();
    /**
     * Authoritative per-chat conversation state, keyed by chat channel URI.
     * The protocol moved turns/activeTurn/pending state off the session and
     * onto a per-chat channel. VS Code currently models every session as
     * having exactly one chat — its default chat — whose URI is derived
     * deterministically from the session URI via {@link buildDefaultChatUri}.
     */
    this._chatStates = /* @__PURE__ */ new Map();
    /**
     * Opaque, agent-owned `providerData` blobs keyed by peer-chat channel URI.
     *
     * Each entry is the verbatim token the owning agent produced for a peer
     * chat (see {@link IAgentCreateChatResult.providerData}). The orchestrator
     * persists it with the session and hands it back to the agent on restore so
     * the agent can re-materialize its SDK conversation; the StateManager itself
     * **never parses, validates, or mutates it** — it stores and returns the
     * string as-is. The map is kept separate from the protocol-visible
     * {@link ChatState}/{@link ChatSummary} catalog so the private blob is not
     * streamed to clients. The default chat carries no `providerData`, so it
     * never appears here.
     */
    this._chatProviderData = /* @__PURE__ */ new Map();
    /**
     * Per-channel annotation states for the `<session>/annotations` channel.
     * Unlike changesets (server-owned), annotation actions are
     * client-dispatchable and lazily create their state on first write.
     */
    this._annotations = /* @__PURE__ */ new Map();
    /**
     * Active turns per session, keyed by session URI string with the value
     * being the set of that session's chat channel URIs that currently have an
     * active turn. A session is "active" while at least one of its chats is
     * streaming — this stays correct for multi-chat sessions whose chats can run
     * concurrent turns (e.g. agent-team / sub-agent workers), where the previous
     * single-flag-per-session model would clear too early. Active state is
     * derived from `state.activeTurn` (the source of truth maintained by the
     * session reducer) — never from raw action turn-ids — so that mismatched or
     * out-of-order turn lifecycle actions can't desync it from reality. The
     * session count (`size`) drives `RootActiveSessionsChanged` and
     * `hasActiveSessions`, which together gate `--enable-remote-auto-shutdown`.
     */
    this._sessionsWithActiveTurn = /* @__PURE__ */ new Map();
    this._onDidEmitEnvelope = this._register(new Emitter());
    this.onDidEmitEnvelope = this._onDidEmitEnvelope.event;
    this._onDidEmitNotification = this._register(new Emitter());
    this.onDidEmitNotification = this._onDidEmitNotification.event;
    this._onDidChangeSessionActiveTurn = this._register(new Emitter());
    this.onDidChangeSessionActiveTurn = this._onDidChangeSessionActiveTurn.event;
    this._onDidChangeSessionTitle = this._register(new Emitter());
    this.onDidChangeSessionTitle = this._onDidChangeSessionTitle.event;
    this._log = (msg) => this._logService.warn(`[AgentHostStateManager] ${msg}`);
    this._changesets = new AgentHostChangesetStateCache(options.changesetStateRetention);
    this._rootState = createRootState();
    this._rootState = {
      ...this._rootState,
      config: {
        schema: platformRootSchema.toProtocol(),
        values: platformRootSchema.validateOrDefault({}, {
          [SessionConfigKey.Permissions]: { allow: [], deny: [] },
          [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE)
        })
      },
      _meta: withHostBuildInfo(this._rootState._meta, options.hostBuildInfo)
    };
    this._summaryNotifier = this._register(new SessionSummaryNotifier(
      (session) => {
        const entry = this._sessionStates.get(session);
        return entry ? this._toSummary(session, entry) : void 0;
      },
      (session, changes) => this._onDidEmitNotification.fire({
        type: "root/sessionSummaryChanged",
        channel: ROOT_STATE_URI,
        session,
        changes
      })
    ));
  }
  get hasActiveSessions() {
    return this._sessionsWithActiveTurn.size > 0;
  }
  /**
   * Whether the given session currently has an active turn — i.e. a request is
   * in progress on any of its chats. Stays `true` while at least one chat is
   * streaming, so it remains correct for multi-chat sessions running
   * concurrent turns.
   */
  hasActiveTurn(sessionKey) {
    return this._sessionsWithActiveTurn.has(sessionKey);
  }
  // ---- State accessors ----------------------------------------------------
  get rootState() {
    return this._rootState;
  }
  getSessionState(sessionOrChat) {
    const isChat = isAhpChatChannel(sessionOrChat);
    const session = isChat ? parseDefaultChatUri(sessionOrChat) : sessionOrChat;
    if (session === void 0) {
      return void 0;
    }
    const entry = this._sessionStates.get(session);
    if (!entry) {
      return void 0;
    }
    const chatUri = isChat ? sessionOrChat : buildDefaultChatUri(session);
    return mergeSessionWithDefaultChat(entry.state, this._chatStates.get(chatUri));
  }
  /**
   * Returns the root-channel {@link SessionSummary} catalog entry for a
   * session, or `undefined` when the session is unknown. The summary is
   * derived on demand from the session's {@link ISessionEntry}: its metadata
   * fields and `_meta` come straight off the live {@link SessionState}, while
   * the catalog-only `resource` / `createdAt` / `modifiedAt` / `changes` come
   * from the entry.
   */
  getSessionSummary(session) {
    const entry = this._sessionStates.get(session);
    return entry ? this._toSummary(session, entry) : void 0;
  }
  /**
   * Projects an {@link ISessionEntry} into its root-channel
   * {@link SessionSummary}. The summary's `_meta` is the same object as
   * {@link SessionState._meta} — the host treats the two as identical.
   */
  _toSummary(session, entry) {
    const { state } = entry;
    const summary = {
      resource: session,
      provider: state.provider,
      title: state.title,
      status: state.status,
      createdAt: entry.createdAt,
      modifiedAt: entry.modifiedAt
    };
    if (state.activity !== void 0) {
      summary.activity = state.activity;
    }
    if (state.project !== void 0) {
      summary.project = state.project;
    }
    if (state.workingDirectories !== void 0) {
      summary.workingDirectories = state.workingDirectories;
    }
    if (state.annotations !== void 0) {
      summary.annotations = state.annotations;
    }
    if (entry.changes !== void 0) {
      summary.changes = entry.changes;
    }
    if (state._meta !== void 0) {
      summary._meta = state._meta;
    }
    return summary;
  }
  /**
   * Whether the {@link SessionSummary}-relevant fields of two session states
   * are field-equal. Used to decide whether a session action mutated anything
   * the root-channel catalog cares about.
   */
  _summaryFieldsEqual(a, b) {
    return a.title === b.title && a.status === b.status && a.activity === b.activity && a.project === b.project && a.workingDirectories === b.workingDirectories && a.annotations === b.annotations && a._meta === b._meta;
  }
  /**
   * Returns the authoritative {@link ChatState} for a session's default
   * chat, or `undefined` when the session is unknown. Use this when the
   * caller specifically needs conversation contents (turns, activeTurn,
   * pending/input state) rather than the session summary.
   */
  getDefaultChatState(session) {
    return this._chatStates.get(buildDefaultChatUri(session));
  }
  /** Returns the authoritative {@link ChatState} for a chat channel URI. */
  getChatState(chat) {
    return this._chatStates.get(chat);
  }
  /**
   * Returns the opaque, agent-owned `providerData` blob previously recorded
   * for a peer chat via {@link addChat} or {@link restoreChat}, or `undefined`
   * when none was stored (e.g. the default chat, or a peer chat the agent had
   * nothing resumable to persist for). The value is returned verbatim — the
   * StateManager never interprets it; callers persist it with the session and
   * hand it back to the owning agent on restore.
   */
  getChatProviderData(chat) {
    return this._chatProviderData.get(chat);
  }
  /**
   * Seeds the conversation contents (turns) of a session's default chat.
   * Used by the fork flow, which materializes a new session pre-populated
   * with a slice of the source session's turns.
   */
  seedDefaultChatTurns(session, turns) {
    const chatState = this._chatStates.get(buildDefaultChatUri(session));
    if (chatState) {
      chatState.turns = turns;
    }
  }
  get serverSeq() {
    return this._serverSeq;
  }
  getSessionUris() {
    return [...this._sessionStates.keys()];
  }
  /**
   * Summaries eligible to be overlaid onto a provider's `listSessions`
   * snapshot when that snapshot is missing them. A session qualifies if it
   * has materialized (lifecycle !== {@link SessionLifecycle.Creating}) — this
   * covers the transient-drop case where a provider briefly omits a
   * just-materialized session — or if it is still provisional but has had any
   * turn activity (an in-flight turn, or a completed turn whose materialize
   * event has not landed yet; the first turn can start before materialization
   * completes). Idle provisional sessions (created but not yet materialized
   * and with no turn activity, e.g. the new-session composer's eagerly-created
   * session before its first message) are excluded so they don't leak into
   * the session list (#321269).
   */
  getOverlaySessionSummaries() {
    const summaries = [];
    for (const [key, entry] of this._sessionStates) {
      const chat = this._chatStates.get(buildDefaultChatUri(key));
      if (entry.state.lifecycle === SessionLifecycle.Creating && !chat?.activeTurn && (chat?.turns.length ?? 0) === 0) {
        continue;
      }
      summaries.push(this._toSummary(key, entry));
    }
    return summaries;
  }
  /**
   * Returns all session URIs whose keys start with the given prefix.
   * Used to discover subagent sessions for a given parent.
   */
  getSessionUrisWithPrefix(prefix) {
    const result = [];
    for (const key of this._sessionStates.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result;
  }
  // ---- Snapshots ----------------------------------------------------------
  /**
   * Returns a state snapshot for a given resource URI.
   * The `fromSeq` in the snapshot is the current serverSeq at snapshot time;
   * the client should process subsequent envelopes with serverSeq > fromSeq.
   */
  getSnapshot(resource) {
    if (isAhpRootChannel(resource)) {
      return {
        resource: ROOT_STATE_URI,
        state: this._rootState,
        fromSeq: this._serverSeq
      };
    }
    const changesetState = this._changesets.get(resource);
    if (changesetState) {
      return {
        resource,
        state: changesetState,
        fromSeq: this._serverSeq
      };
    }
    if (isAhpChatChannel(resource)) {
      const chatState = this._chatStates.get(resource);
      if (!chatState) {
        return void 0;
      }
      return {
        resource,
        state: chatState,
        fromSeq: this._serverSeq
      };
    }
    if (isAnnotationsUri(resource)) {
      return {
        resource,
        state: this._annotations.get(resource) ?? { annotations: [] },
        fromSeq: this._serverSeq
      };
    }
    const entry = this._sessionStates.get(resource);
    if (!entry) {
      return void 0;
    }
    return {
      resource,
      state: entry.state,
      fromSeq: this._serverSeq
    };
  }
  /** Read-only accessor for callers that only need to inspect a changeset (not subscribe). */
  getChangesetState(changeset) {
    return this._changesets.get(changeset);
  }
  /** Reconsiders changeset state retention after subscribers or computes release their pins. */
  onChangesetLivenessChanged() {
    this._changesets.trimEvictableEntries();
  }
  // ---- Session lifecycle --------------------------------------------------
  /**
   * Creates a new session in state with `lifecycle: 'creating'`.
   * Returns the initial session state.
   *
   * By default a {@link NotificationType.SessionAdded} notification is
   * emitted so clients see the new session immediately. Pass
   * `options.emitNotification: false` to defer the notification — a typical
   * use is for **provisional** sessions that exist on the server but should
   * not appear in client session lists until they have been persisted by
   * the agent (e.g. on the first message that materializes an SDK session
   * and writes its on-disk metadata). Call {@link markSessionPersisted}
   * afterwards to fire the deferred notification.
   */
  createSession(summary, options) {
    const key = summary.resource;
    const existing = this._sessionStates.get(key);
    if (existing) {
      this._logService.warn(`[AgentHostStateManager] Session already exists: ${key}`);
      return existing.state;
    }
    const state = createSessionState(summary);
    this._sessionStates.set(key, this._newEntry(state, summary));
    this._ensureDefaultChat(key, summary);
    this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);
    if (options?.emitNotification !== false) {
      this._summaryNotifier.announce(key, summary);
      this._onDidEmitNotification.fire({
        type: "root/sessionAdded",
        channel: ROOT_STATE_URI,
        summary
      });
    }
    return state;
  }
  /** Builds the authoritative {@link ISessionEntry} for a freshly seeded state. */
  _newEntry(state, summary) {
    return { state, createdAt: summary.createdAt, modifiedAt: summary.modifiedAt, changes: summary.changes };
  }
  /**
   * Fire a {@link NotificationType.SessionAdded} notification for a session
   * whose creation was deferred via `createSession({ emitNotification: false })`.
   *
   * Propagates the materialization-resolved catalog fields (`project`,
   * `workingDirectory`, `modifiedAt`, `changes`) from the supplied summary
   * onto the session entry so subscribers see them. The reducer-owned metadata
   * (`title`, `status`, `activity`) is intentionally NOT copied back — the live
   * state is authoritative for those. No-ops for sessions that were already
   * announced (idempotent).
   */
  markSessionPersisted(session, summary) {
    const key = session.toString();
    const entry = this._sessionStates.get(key);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] markSessionPersisted: unknown session ${key}`);
      return;
    }
    if (this._summaryNotifier.isAnnounced(key)) {
      return;
    }
    entry.state = { ...entry.state, project: summary.project, workingDirectories: summary.workingDirectories };
    entry.modifiedAt = summary.modifiedAt;
    entry.changes = summary.changes;
    const full = this._toSummary(key, entry);
    this._summaryNotifier.announce(key, full);
    this._onDidEmitNotification.fire({
      type: "root/sessionAdded",
      channel: ROOT_STATE_URI,
      summary: full
    });
  }
  /**
   * Restores a session from a previous server lifetime into the state manager
   * with pre-populated turns. The session is created in `ready` lifecycle
   * state since it already exists on the backend.
   *
   * Unlike {@link createSession}, this does NOT emit a `sessionAdded`
   * notification because the session is already known to clients via
   * `listSessions`.
   */
  restoreSession(summary, turns, options) {
    const key = summary.resource;
    const existing = this._sessionStates.get(key);
    if (existing) {
      this._logService.warn(`[AgentHostStateManager] Session already exists (restore): ${key}`);
      return existing.state;
    }
    const state = {
      ...createSessionState(summary),
      lifecycle: SessionLifecycle.Ready
    };
    this._sessionStates.set(key, this._newEntry(state, summary));
    this._ensureDefaultChat(key, summary, turns, options?.draft, options?.defaultChatTitle);
    this._summaryNotifier.announce(key, summary);
    this._logService.trace(`[AgentHostStateManager] Restored session: ${key} (${turns.length} turns)`);
    return state;
  }
  /**
   * Creates the default {@link ChatState} for a session and records it as
   * the session's single chat. VS Code models every session as having
   * exactly one chat — its default chat — whose URI is derived
   * deterministically from the session URI. The chat is seeded with any
   * pre-populated `turns` (used by {@link restoreSession}).
   *
   * The session's `chats` catalog and `defaultChat` pointer are updated
   * in place rather than via dispatched actions: there are no subscribers
   * at creation/restore time, so the snapshot a client later receives on
   * subscribe already reflects the default chat.
   */
  _ensureDefaultChat(sessionKey, summary, turns, draft, defaultChatTitle) {
    const chatUri = buildDefaultChatUri(sessionKey);
    const chatSummary = { ...createDefaultChatSummary(summary, chatUri), title: defaultChatTitle ?? "" };
    this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: turns ?? [], draft });
    const entry = this._sessionStates.get(sessionKey);
    if (entry) {
      entry.state.chats = [chatSummary];
      entry.state.defaultChat = chatUri;
    }
  }
  /**
   * Adds an additional (non-default) chat to an existing session. Creates
   * the chat's authoritative {@link ChatState}, registers it in the session's
   * catalog via a dispatched {@link ActionType.SessionChatAdded} action (so
   * live subscribers refresh), and returns the new chat's summary.
   *
   * The chat inherits the session's model/agent/working-directory scope. It
   * is a no-op (returning the existing summary) when a chat with the same URI
   * already exists.
   *
   * When `options.providerData` is supplied it is recorded verbatim as the
   * peer chat's opaque, agent-owned restore blob (see
   * {@link getChatProviderData}); the StateManager never parses it. The
   * default chat never carries `providerData`.
   */
  addChat(session, chatUri, options) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] addChat for unknown session: ${session}`);
      return void 0;
    }
    const sessionState = entry.state;
    const existing = sessionState.chats.find((c) => c.resource === chatUri);
    if (existing) {
      return existing;
    }
    const defaultChatUri = sessionState.defaultChat ?? buildDefaultChatUri(session);
    const defaultEntry = sessionState.chats.find((c) => c.resource === defaultChatUri);
    if (defaultEntry && !defaultEntry.title && sessionState.title) {
      this.updateChatTitle(session, defaultChatUri, sessionState.title);
    }
    const chatSummary = {
      ...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
      title: options?.title ?? "",
      status: SessionStatus.Idle,
      origin: options?.origin,
      interactivity: options?.interactivity
    };
    this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: options?.turns ?? [] });
    if (options?.providerData !== void 0) {
      this._chatProviderData.set(chatUri, options.providerData);
    }
    this.dispatchServerAction(session, { type: ActionType.SessionChatAdded, summary: chatSummary });
    return chatSummary;
  }
  /**
   * Re-registers an additional (non-default) peer chat when a session is
   * restored from persistent storage, seeding its {@link ChatState} with the
   * supplied turns. Unlike {@link addChat} this does not snapshot the session
   * title onto the default chat (the default chat's persisted title is
   * restored independently) and it seeds history. The catalog entry is added
   * in place so the object identity returned by {@link restoreSession} stays
   * live; no {@link ActionType.SessionChatAdded} is dispatched because restore
   * runs before clients subscribe.
   *
   * When `options.providerData` is supplied it is recorded verbatim as the
   * peer chat's opaque, agent-owned restore blob (see
   * {@link getChatProviderData}); the StateManager never parses it.
   */
  restoreChat(session, chatUri, options) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] restoreChat for unknown session: ${session}`);
      return;
    }
    const sessionState = entry.state;
    if (sessionState.chats.some((c) => c.resource === chatUri)) {
      return;
    }
    const chatSummary = {
      ...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
      title: options.title ?? "",
      status: SessionStatus.Idle,
      origin: options.origin
    };
    this._chatStates.set(chatUri, { ...createChatState(chatSummary), turns: options.turns, draft: options.draft });
    if (options.providerData !== void 0) {
      this._chatProviderData.set(chatUri, options.providerData);
    }
    sessionState.chats = [...sessionState.chats, chatSummary];
  }
  /**
   * Removes an additional chat from a session. Deletes its
   * {@link ChatState}, dispatches {@link ActionType.SessionChatRemoved}, and
   * — if the removed chat was the default — repoints `defaultChat` to the
   * first remaining chat. The default chat itself cannot be removed in
   * isolation; it lives and dies with its session.
   */
  removeChat(session, chatUri) {
    const entry = this._sessionStates.get(session);
    if (!entry || !entry.state.chats.some((c) => c.resource === chatUri)) {
      return;
    }
    const sessionState = entry.state;
    if (chatUri === sessionState.defaultChat || isDefaultChatUri(chatUri)) {
      this._logService.warn(`[AgentHostStateManager] refusing to remove default chat: ${chatUri}`);
      return;
    }
    this._removeChatActiveTurn(session, chatUri);
    this._chatStates.delete(chatUri);
    this._chatProviderData.delete(chatUri);
    this.dispatchServerAction(session, { type: ActionType.SessionChatRemoved, chat: chatUri });
  }
  /**
   * Renames a single chat within a session independently of the session
   * title. Updates the chat's authoritative {@link ChatState} title (so
   * later `chatSummaryFromState` projections stay consistent) and dispatches
   * a {@link ActionType.SessionChatUpdated} so the session's catalog entry and
   * live subscribers reflect the new title. Works for the default chat too —
   * giving it a non-empty title that no longer inherits the session title.
   */
  updateChatTitle(session, chatUri, title) {
    const chatState = this._chatStates.get(chatUri);
    if (chatState) {
      this._chatStates.set(chatUri, { ...chatState, title });
    }
    this.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: chatUri, changes: { title } });
  }
  /**
   * Removes a session from in-memory state without emitting a
   * {@link NotificationType.SessionRemoved} notification.
   * Use {@link deleteSession} when the session is being permanently deleted
   * and clients need to be notified of its removal.
   *
   * Any pending summary change is flushed synchronously before the session is
   * torn down, so clients receive the final status (e.g. Idle after a turn
   * completes) even when the session is evicted before the scheduler fires.
   * A {@link NotificationType.SessionSummaryChanged} notification may therefore
   * be emitted as a side-effect of this call.
   *
   * Per-session changesets are intentionally NOT torn down here: this method
   * is also used as an idle-eviction (LRU) hook (see
   * `AgentService._maybeEvictIdleSession`) and the session list view keeps a
   * changeset subscription open per visible row to render the diff chip.
   * Tearing down on eviction would clear the chip on the list while the row
   * is still on screen. Permanent-delete paths (`deleteSession`,
   * `removeSubagentSessions`) call `disposeSessionChangesets` explicitly
   * before invoking `removeSession`.
   */
  removeSession(session) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      return;
    }
    if (this._summaryNotifier.isDirty(session)) {
      this._summaryNotifier.flush(session);
    }
    if (this._sessionsWithActiveTurn.delete(session)) {
      this._onDidChangeSessionActiveTurn.fire({ session, active: false });
      this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
    }
    for (const chat of entry.state.chats) {
      this._chatStates.delete(chat.resource);
      this._chatProviderData.delete(chat.resource);
    }
    this._chatStates.delete(buildDefaultChatUri(session));
    this._sessionStates.delete(session);
    this._summaryNotifier.remove(session);
    this._logService.trace(`[AgentHostStateManager] Removed session: ${session}`);
  }
  /**
   * Permanently deletes a session from state and emits a
   * {@link NotificationType.SessionRemoved} notification so that clients
   * know the session is no longer accessible.
   *
   * Sessions whose creation was deferred via
   * `createSession({ emitNotification: false })` and never persisted via
   * {@link markSessionPersisted} are removed silently — no client knows
   * about them, so a `SessionRemoved` would be noise (or worse, would
   * cause clients to drop a session URI they had eagerly subscribed to).
   */
  deleteSession(session) {
    const wasAnnounced = this._summaryNotifier.isAnnounced(session);
    this._summaryNotifier.clearDirty(session);
    this.disposeSessionChangesets(session);
    this.disposeSessionAnnotations(session);
    this.removeSession(session);
    if (wasAnnounced) {
      this._onDidEmitNotification.fire({
        type: "root/sessionRemoved",
        channel: ROOT_STATE_URI,
        session
      });
    }
  }
  // ---- Session meta -------------------------------------------------------
  /**
   * Replaces `state._meta` on a session by dispatching a
   * {@link ActionType.SessionMetaChanged} action so the change flows
   * through the action envelope (and thus to all live subscribers).
   *
   * The full `_meta` object is replaced (not merged) so callers stay in
   * control of the convention for their own keys; use the `withSessionXxx`
   * helpers in `sessionState.ts` to combine slots.
   */
  setSessionMeta(session, meta) {
    this.dispatchServerAction(session, { type: ActionType.SessionMetaChanged, _meta: meta });
  }
  /**
   * Seeds or replaces a session's resolved {@link SessionConfigState} on the
   * live session state. Unlike mid-session {@link ActionType.SessionConfigChanged}
   * updates (which merge values onto an existing config), this establishes
   * the initial config and is therefore an in-place mutation of the
   * authoritative state object so the value is present in the first snapshot
   * a subscriber receives. Use this from create/restore flows where the
   * config is resolved asynchronously after the session state already exists
   * in the map — reading back through {@link getSessionState} would return a
   * detached composite copy and stranding the mutation there.
   */
  setSessionConfig(session, config) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionConfig: unknown session ${session}`);
      return;
    }
    entry.state.config = config;
  }
  /**
   * Seeds or replaces the session's effective customizations directly on the
   * authoritative in-memory state. Used by create/restore flows to ensure the
   * first snapshot already contains customizations.
   */
  setSessionCustomizations(session, customizations) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionCustomizations: unknown session ${session}`);
      return;
    }
    entry.state.customizations = customizations ? [...customizations] : void 0;
  }
  // ---- Changeset registry -------------------------------------------------
  /**
   * Registers a server-side changeset so that subscribers can attach to its
   * URI. The changeset is created with the supplied initial status (default
   * {@link ChangesetStatus.Computing}); subsequent file/operation/status
   * mutations flow through {@link dispatchChangesetAction} on the
   * canonical `<sessionUri>/changeset/<changesetId>` URI.
   *
   * Idempotent: a second call with the same URI is a no-op so producers
   * can safely re-register on session resume without double-creating
   * state.
   *
   * Callers construct `changesetUri` via {@link buildSessionChangesetUri}
   * for the session-wide entry, or {@link buildChangesetUri} for any
   * other catalogue entry.
   *
   * Returns the supplied changeset URI for caller convenience.
   */
  registerChangeset(changesetUri, initialStatus = ChangesetStatus.Computing) {
    this._changesets.register(changesetUri, initialStatus);
    return changesetUri;
  }
  /**
   * Updates the aggregate `changes` for a session.
   *
   * There is no dedicated action for this field: the value is purely
   * informational (chip rendering on the session list), so the write
   * piggybacks on the existing `sessionSummaryChanged` notification
   * path. We update the session entry, mark the session dirty, and let
   * the summary notifier's flush pick the new value up via its
   * `current.changes !== lastNotified.changes` diff.
   */
  setSessionSummaryChanges(session, changes) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionSummaryChanges: unknown session ${session}`);
      return;
    }
    if (structuralEquals(entry.changes, changes)) {
      return;
    }
    entry.changes = changes;
    this._summaryNotifier.markDirty(session);
  }
  /**
   * Replaces the catalogue entries on `state.changesets` for `session` by
   * dispatching a {@link ActionType.SessionChangesetsChanged} action.
   * Subscribers see the mutation in the standard session action stream —
   * the catalogue lives on session state and is not its own subscribable
   * resource. Aggregate `changes` counts (additions / deletions /
   * files) are propagated separately via {@link setSessionSummaryChanges}.
   *
   * Producers call this after each compute pass to keep the list of
   * available changesets (with their `changeKind`) in sync so observers
   * can render the correct entries without subscribing to each one.
   */
  setSessionChangesets(session, changesets) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionChangesets: unknown session ${session}`);
      return;
    }
    const state = entry.state;
    if (arrayEquals(state.changesets ?? [], changesets ?? [], structuralEquals)) {
      return;
    }
    const next = changesets ? changesets.slice() : void 0;
    this.dispatchServerAction(session, {
      type: ActionType.SessionChangesetsChanged,
      changesets: next
    });
  }
  /**
   * Tear down a changeset. Dispatches {@link ActionType.ChangesetCleared}
   * so subscribers see an empty file list, then deletes the local state
   * so a fresh `getChangesetState` returns `undefined` and forces the
   * producer to re-create the changeset on next subscribe.
   *
   * Per the spec, the server SHOULD also unsubscribe its clients after
   * dispatching this action; for VS Code-internal clients that happens
   * via the `notify/sessionRemoved` notification, which the workbench-side
   * provider correlates to release any held subscriptions.
   *
   * Safe to call for a URI that was never registered: producers typically
   * iterate over a candidate set on session disposal and emit dispose
   * actions defensively.
   */
  disposeChangeset(changeset) {
    if (!this._changesets.has(changeset)) {
      return;
    }
    this.dispatchServerAction(changeset, {
      type: ActionType.ChangesetCleared
    });
    this._changesets.delete(changeset);
  }
  /**
   * Disposes every changeset whose URI is nested under `session` (i.e.
   * matches `<session>/changeset/...`). Used to cascade cleanup when a
   * session itself is removed.
   */
  disposeSessionChangesets(session) {
    const toDispose = [];
    for (const uri of this._changesets.keys()) {
      const parsed = parseChangesetUri(uri);
      if (parsed && parsed.sessionUri === session) {
        toDispose.push(uri);
      }
    }
    for (const uri of toDispose) {
      this.disposeChangeset(uri);
    }
  }
  /**
   * Drops the annotation state nested under `session` (i.e. the
   * `<session>/annotations` channel). Used to cascade cleanup when a
   * session itself is removed. Subscriptions are released via the
   * forthcoming `sessionRemoved` notification.
   */
  disposeSessionAnnotations(session) {
    this._annotations.delete(buildAnnotationsUri(session));
  }
  // ---- Turn tracking ------------------------------------------------------
  /**
   * Registers a mapping from turnId to session URI so that incoming
   * provider events (which carry only session URI) can be associated
   * with the correct active turn.
   */
  getActiveTurnId(sessionOrChat) {
    const chatUri = isAhpChatChannel(sessionOrChat) ? sessionOrChat : buildDefaultChatUri(sessionOrChat);
    return this._chatStates.get(chatUri)?.activeTurn?.id;
  }
  // ---- Action dispatch ----------------------------------------------------
  /**
   * Dispatch a server-originated action (from the agent backend).
   * The action is applied to state via the reducer and emitted as an
   * envelope with no origin (server-produced).
   *
   * `channel` identifies the channel the action targets — `ROOT_STATE_URI`
   * for root actions, a session URI for session actions, a terminal URI
   * for terminal actions, an expanded changeset URI for changeset actions.
   */
  dispatchServerAction(channel, action) {
    this._applyAndEmit(channel, action, void 0);
  }
  /**
   * Dispatch a client-originated action (write-ahead from a renderer).
   * The action is applied to state and emitted with the client's origin
   * so the originating client can reconcile.
   */
  dispatchClientAction(channel, action, origin) {
    return this._applyAndEmit(channel, action, origin);
  }
  /**
   * Reject a client-originated action without applying it to state. Emits an
   * {@link ActionEnvelope} that carries the original {@link ActionOrigin} and a
   * {@link ActionEnvelope.rejectionReason | rejectionReason} so the originating
   * client can reconcile (roll back) its optimistic write-ahead action through
   * the normal path instead of leaving it pending until reconnect. The reducer
   * is deliberately NOT run, so no synchronized state changes.
   */
  rejectClientAction(channel, action, origin, reason) {
    const envelope = {
      channel,
      action,
      serverSeq: ++this._serverSeq,
      origin,
      rejectionReason: reason
    };
    this._logService.trace(`[AgentHostStateManager] Emitting rejection envelope: seq=${envelope.serverSeq}, channel=${envelope.channel}, type=${action.type}, origin=${origin.clientId}:${origin.clientSeq}, reason=${reason}`);
    this._onDidEmitEnvelope.fire(envelope);
  }
  // ---- Internal -----------------------------------------------------------
  _applyAndEmit(channel, action, origin) {
    let resultingState = void 0;
    if (action.type === ActionType.RootConfigChanged && action.replace) {
      action = {
        ...action,
        config: preserveProviderBackedRootConfigValues(this._rootState, action.config)
      };
    }
    if (isRootAction(action)) {
      if (action.type === ActionType.RootConfigChanged && this._rootState.config) {
        const current = this._rootState.config.values;
        const patch = action.config;
        const isNoOp = action.replace ? equals(current, patch) : equals({ ...current, ...patch }, current);
        if (isNoOp) {
          return this._rootState;
        }
      }
      this._rootState = rootReducer(this._rootState, action, this._log);
      resultingState = this._rootState;
    }
    if (isSessionAction(action)) {
      const sessionAction = action;
      const key = channel;
      const entry = this._sessionStates.get(key);
      if (entry) {
        const previousState = entry.state;
        const newState = sessionReducer(previousState, sessionAction, this._log);
        const summaryChanged = !this._summaryFieldsEqual(previousState, newState);
        entry.state = newState;
        if (previousState.title !== newState.title) {
          this._onDidChangeSessionTitle.fire({ session: key, title: newState.title });
        }
        if (summaryChanged) {
          this._summaryNotifier.markDirty(key);
        }
        resultingState = newState;
      } else if (!isAhpChatChannel(key)) {
        this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
      }
    }
    if (isChatAction(action)) {
      if (!isAhpChatChannel(channel)) {
        throw new Error(`[AgentHostStateManager] Chat action dispatched to non-chat channel: ${channel}, type=${action.type}`);
      }
      const chatAction = action;
      const sessionKey = parseRequiredSessionUriFromChatUri(channel);
      const chat = this._chatStates.get(channel);
      if (chat && sessionKey !== void 0) {
        const newChat = chatReducer(chat, chatAction, this._log);
        this._chatStates.set(channel, newChat);
        this._onChatStateChanged(sessionKey, channel, chat, newChat);
        resultingState = newChat;
      } else {
        this._logService.warn(`[AgentHostStateManager] Action for unknown chat: ${channel}, type=${action.type}`);
      }
    }
    if (isChangesetAction(action)) {
      const changesetAction = action;
      const key = channel;
      const state = this._changesets.get(key);
      if (!state) {
        this._logService.warn(`[AgentHostStateManager] Action for unknown changeset: ${key}, type=${action.type}`);
        return void 0;
      }
      const newState = changesetReducer(state, changesetAction, this._log);
      if (newState !== state) {
        this._changesets.set(key, newState);
      }
      resultingState = newState;
    }
    if (isAnnotationsAction(action)) {
      const annotationsAction = action;
      const key = channel;
      const state = this._annotations.get(key) ?? { annotations: [] };
      const newState = annotationsReducer(state, annotationsAction, this._log);
      if (newState !== state) {
        this._annotations.set(key, newState);
      }
      resultingState = newState;
    }
    const envelope = {
      channel,
      action,
      serverSeq: ++this._serverSeq,
      origin
    };
    this._logService.trace(`[AgentHostStateManager] Emitting envelope: seq=${envelope.serverSeq}, channel=${envelope.channel}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ""}`);
    this._onDidEmitEnvelope.fire(envelope);
    return resultingState;
  }
  /**
   * Removes a single chat from its session's active-turn set, firing the
   * session-level active flip ({@link onDidChangeSessionActiveTurn} +
   * {@link ActionType.RootActiveSessionsChanged}) when this clears the
   * session's last active chat. Safe to call for chats that aren't currently
   * tracked as active — it is a no-op in that case. Used both when a turn
   * ends and when a chat is removed mid-turn, so the session can't be
   * stranded as permanently "active".
   */
  _removeChatActiveTurn(sessionKey, chatUri) {
    const activeChats = this._sessionsWithActiveTurn.get(sessionKey);
    if (!activeChats || !activeChats.delete(chatUri)) {
      return;
    }
    if (activeChats.size === 0) {
      this._sessionsWithActiveTurn.delete(sessionKey);
      this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: false });
      this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
    }
  }
  /**
   * Bridges a default-chat state transition back onto its owning session.
   *
   * The protocol moved turn lifecycle (and therefore the derived
   * activity status) onto the chat channel. To preserve VS Code's
   * single-chat behaviour we:
   *  - track active-turn transitions (driving `RootActiveSessionsChanged`
   *    and `hasActiveSessions`, which gate `--enable-remote-auto-shutdown`),
   *    keyed by the owning session URI;
   *  - mirror the chat's denormalized `status`/`activity`/`modifiedAt`
   *    onto the session summary so the session list reflects progress;
   *  - forward the chat's own `status` to the session `chats` catalog (via a
   *    {@link ActionType.SessionChatUpdated}) so per-chat tabs reflect that
   *    chat's progress, not just the aggregated session summary; and
   *  - keep the session's `chats` catalog entry in sync.
   */
  _onChatStateChanged(sessionKey, chatUri, prev, next) {
    const hadActive = !!prev.activeTurn;
    const hasActive = !!next.activeTurn;
    if (hadActive !== hasActive) {
      if (hasActive) {
        let activeChats = this._sessionsWithActiveTurn.get(sessionKey);
        const wasSessionActive = !!activeChats?.size;
        if (!activeChats) {
          activeChats = /* @__PURE__ */ new Set();
          this._sessionsWithActiveTurn.set(sessionKey, activeChats);
        }
        activeChats.add(chatUri);
        if (!wasSessionActive) {
          this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: true });
          this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
        }
      } else {
        this._removeChatActiveTurn(sessionKey, chatUri);
      }
    }
    const entry = this._sessionStates.get(sessionKey);
    if (!entry) {
      return;
    }
    const sessionState = entry.state;
    const nextEntry = chatSummaryFromState(next);
    const prevEntry = sessionState.chats.find((c) => c.resource === chatUri);
    const chats = sessionState.chats.map((c) => c.resource === chatUri ? nextEntry : c);
    if (prevEntry?.status !== nextEntry.status) {
      this.dispatchServerAction(sessionKey, {
        type: ActionType.SessionChatUpdated,
        chat: chatUri,
        changes: { status: nextEntry.status, activity: nextEntry.activity }
      });
    }
    const aggregate = this._aggregateChatSummaries(chats, sessionState.defaultChat);
    const newStatus = aggregate.status !== void 0 ? this._mergeSessionStatus(sessionState.status, aggregate.status) : sessionState.status;
    const statusChanged = newStatus !== sessionState.status;
    const activityChanged = aggregate.activity !== sessionState.activity;
    entry.state = {
      ...sessionState,
      chats,
      ...statusChanged ? { status: newStatus } : void 0,
      ...activityChanged ? { activity: aggregate.activity } : void 0
    };
    const newModifiedAt = aggregate.modifiedAt !== void 0 ? new Date(aggregate.modifiedAt).toISOString() : void 0;
    const modifiedAtChanged = newModifiedAt !== void 0 && newModifiedAt !== entry.modifiedAt;
    if (modifiedAtChanged) {
      entry.modifiedAt = newModifiedAt;
    }
    if (statusChanged || activityChanged || modifiedAtChanged) {
      this._summaryNotifier.markDirty(sessionKey);
    }
  }
  /**
   * Aggregates a session's chat catalog into the derived session-summary
   * fields per the protocol rules: activity bits come from the default chat
   * (else the most recently modified chat) with `InputNeeded`/`Error`/
   * `InProgress` promoted whenever any chat raises them; the `activity` string
   * follows the chat driving the resulting status; `modifiedAt` is the max
   * across chats. Promotion precedence is `InputNeeded` > `Error` >
   * `InProgress`, so a running peer (sub) chat surfaces as `InProgress` on the
   * session even when the default chat is idle.
   */
  _aggregateChatSummaries(chats, defaultChat) {
    if (chats.length === 0) {
      return {};
    }
    const activityMask = ~(SessionStatus.IsRead | SessionStatus.IsArchived);
    const base = (defaultChat !== void 0 ? chats.find((c) => c.resource === defaultChat) : void 0) ?? chats.reduce((a, b) => Date.parse(b.modifiedAt) > Date.parse(a.modifiedAt) ? b : a);
    let status = base.status & activityMask;
    let driver = base;
    const errorChat = chats.find((c) => (c.status & SessionStatus.Error) === SessionStatus.Error);
    const inputChat = chats.find((c) => (c.status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded);
    const inProgressChat = chats.find((c) => (c.status & SessionStatus.InputNeeded) === SessionStatus.InProgress);
    if (inputChat) {
      status = SessionStatus.InputNeeded;
      driver = inputChat;
    } else if (errorChat) {
      status = SessionStatus.Error;
      driver = errorChat;
    } else if (inProgressChat) {
      status = SessionStatus.InProgress;
      driver = inProgressChat;
    }
    const modifiedAt = chats.reduce((max, c) => Math.max(max, Date.parse(c.modifiedAt)), 0);
    return { status, activity: driver.activity, modifiedAt };
  }
  /**
   * Combines the chat's activity status bits with the session summary's
   * own metadata flags (IsRead / IsArchived) which live in the high bits
   * of {@link SessionStatus} and are owned by the session, not the chat.
   */
  _mergeSessionStatus(sessionStatus, chatStatus) {
    const metaFlags = sessionStatus & (SessionStatus.IsRead | SessionStatus.IsArchived);
    const activityBits = chatStatus & ~(SessionStatus.IsRead | SessionStatus.IsArchived);
    return activityBits | metaFlags;
  }
  /**
   * Emit a generic progress notification on the root channel, correlated to
   * the originating request by {@link ProgressParams.progressToken}. Routed to
   * clients through the same {@link onDidEmitNotification} path as session
   * notifications, so both the local (IPC proxy) and remote (WebSocket
   * {@link ProtocolServerHandler}) renderers receive it without any
   * transport-specific special casing. Progress for host-level work (e.g. a
   * shared SDK download) rides the root channel rather than a per-session one.
   */
  emitProgress(progress) {
    this._onDidEmitNotification.fire({
      type: "root/progress",
      channel: ROOT_STATE_URI,
      ...progress
    });
  }
  /**
   * Emit an `auth/required` notification on the root channel, asking the
   * client to obtain a fresh token and push it via `authenticate`. Rides the
   * same {@link onDidEmitNotification} path as {@link emitProgress}, so both
   * local (IPC proxy) and remote (WebSocket) renderers receive it. Used for
   * host-level auth requirements (e.g. an agent whose transport flip makes a
   * credential newly required) rather than a per-session one.
   */
  emitAuthRequired(params) {
    this._onDidEmitNotification.fire({
      type: "auth/required",
      channel: ROOT_STATE_URI,
      ...params
    });
  }
};
AgentHostStateManager = __decorateClass([
  __decorateParam(0, ILogService)
], AgentHostStateManager);
function resolveChatStateForUri(stateManager, chatUri) {
  const peerState = stateManager.getChatState(chatUri);
  if (peerState) {
    return peerState;
  }
  if (!isAhpChatChannel(chatUri)) {
    return stateManager.getDefaultChatState(chatUri);
  }
  if (isDefaultChatUri(chatUri)) {
    return stateManager.getDefaultChatState(parseRequiredSessionUriFromChatUri(chatUri));
  }
  return void 0;
}
export {
  AgentHostStateManager,
  IAgentHostStateManager,
  resolveChatStateForUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBBY3Rpb25FbnZlbG9wZSwgQWN0aW9uT3JpZ2luLCBJTm90aWZpY2F0aW9uLCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIFNlc3Npb25BY3Rpb24sIENoYXRBY3Rpb24sIFJvb3RBY3Rpb24sIFN0YXRlQWN0aW9uLCBUZXJtaW5hbEFjdGlvbiwgQ2hhbmdlc2V0QWN0aW9uLCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24sIEFubm90YXRpb25zQWN0aW9uLCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiwgaXNSb290QWN0aW9uLCBpc1Nlc3Npb25BY3Rpb24sIGlzQ2hhdEFjdGlvbiwgaXNDaGFuZ2VzZXRBY3Rpb24sIGlzQW5ub3RhdGlvbnNBY3Rpb24sIHR5cGUgQXV0aFJlcXVpcmVkUGFyYW1zLCB0eXBlIFByb2dyZXNzUGFyYW1zIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSVN0YXRlU25hcHNob3QgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IHJvb3RSZWR1Y2VyLCBzZXNzaW9uUmVkdWNlciwgY2hhdFJlZHVjZXIsIGNoYW5nZXNldFJlZHVjZXIsIGFubm90YXRpb25zUmVkdWNlciB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUmVkdWNlcnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlUm9vdFN0YXRlLCBjcmVhdGVTZXNzaW9uU3RhdGUsIGNyZWF0ZUNoYXRTdGF0ZSwgY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5LCBjaGF0U3VtbWFyeUZyb21TdGF0ZSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgcGFyc2VEZWZhdWx0Q2hhdFVyaSwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSwgaXNBaHBDaGF0Q2hhbm5lbCwgaXNEZWZhdWx0Q2hhdFVyaSwgbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCBpc0FocFJvb3RDaGFubmVsLCBTZXNzaW9uTGlmZWN5Y2xlLCB3aXRoSG9zdEJ1aWxkSW5mbywgdHlwZSBDaGFuZ2VzZXQsIHR5cGUgQ2hhbmdlc2V0U3RhdGUsIHR5cGUgQW5ub3RhdGlvbnNTdGF0ZSwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgQ2hhdFN1bW1hcnksIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgdHlwZSBNZXNzYWdlLCB0eXBlIFJvb3RTdGF0ZSwgdHlwZSBTZXNzaW9uQ29uZmlnU3RhdGUsIHR5cGUgU2Vzc2lvbk1ldGEsIHR5cGUgU2Vzc2lvblN0YXRlLCB0eXBlIFNlc3Npb25TdW1tYXJ5LCB0eXBlIFR1cm4sIHR5cGUgVVJJLCBST09UX1NUQVRFX1VSSSwgQ2hhbmdlc2V0U3RhdHVzLCBJSG9zdEJ1aWxkSW5mbywgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXksIElQZXJtaXNzaW9uc1ZhbHVlLCBwbGF0Zm9ybVJvb3RTY2hlbWEsIHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBwYXJzZUNoYW5nZXNldFVyaSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgYnVpbGRBbm5vdGF0aW9uc1VyaSwgaXNBbm5vdGF0aW9uc1VyaSB9IGZyb20gJy4uL2NvbW1vbi9hbm5vdGF0aW9uc1VyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDaGFuZ2VzZXRTdGF0ZUNhY2hlLCB0eXBlIElBZ2VudEhvc3RDaGFuZ2VzZXRTdGF0ZVJldGVudGlvbk9wdGlvbnMgfSBmcm9tICcuL2FnZW50SG9zdENoYW5nZXNldFN0YXRlQ2FjaGUuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc1N1bW1hcnksIENoYXRJbnRlcmFjdGl2aXR5LCB0eXBlIENoYXRPcmlnaW4gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHMsIHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgcHJlc2VydmVQcm92aWRlckJhY2tlZFJvb3RDb25maWdWYWx1ZXMgfSBmcm9tICcuLi9jb21tb24vYWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgY2hhbmdlc2V0U3RhdGVSZXRlbnRpb24/OiBJQWdlbnRIb3N0Q2hhbmdlc2V0U3RhdGVSZXRlbnRpb25PcHRpb25zO1xuXHQvKipcblx0ICogQnVpbGQgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHByb2dyYW0gaG9zdGluZyB0aGUgYWdlbnQgaG9zdC4gV2hlblxuXHQgKiBwcm92aWRlZCwgaXQgaXMgcHVibGlzaGVkIG9uIHtAbGluayBSb290U3RhdGUuX21ldGF9IHNvIGNsaWVudHMgY2FuIHNlZVxuXHQgKiB3aGljaCBidWlsZCBpcyBob3N0aW5nIHRoZW0uXG5cdCAqL1xuXHRyZWFkb25seSBob3N0QnVpbGRJbmZvPzogSUhvc3RCdWlsZEluZm87XG59XG5cbi8qKlxuICogQXV0aG9yaXRhdGl2ZSBwZXItc2Vzc2lvbiByZWNvcmQgaGVsZCBieSB0aGUgc3RhdGUgbWFuYWdlci4gQnVuZGxlcyB0aGUgZmxhdFxuICoge0BsaW5rIFNlc3Npb25TdGF0ZX0gd2l0aCB0aGUge0BsaW5rIFNlc3Npb25TdW1tYXJ5fSBjYXRhbG9nLW9ubHkgZmllbGRzIHRoYXRcbiAqIGRvIG5vdCBsaXZlIG9uIHRoZSBzdGF0ZS4gVGhlIHNlc3Npb24gVVJJIChjYXRhbG9nIGByZXNvdXJjZWApIGlzIHRoZSBtYXBcbiAqIGtleSwgYW5kIHRoZSBjYXRhbG9nIGBfbWV0YWAgaXMgdGhlIHNhbWUgb2JqZWN0IGFzIHtAbGluayBTZXNzaW9uU3RhdGUuX21ldGF9LFxuICogc28gdGhlIG9ubHkgZXh0cmEgZmllbGRzIHRoZSByZWNvcmQgY2FycmllcyBhcmUgdGhlIHRpbWVzdGFtcHMgYW5kIHRoZVxuICogYWdncmVnYXRlIGNoYW5nZSBjb3VudHMuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvbkVudHJ5IHtcblx0c3RhdGU6IFNlc3Npb25TdGF0ZTtcblx0LyoqIENyZWF0aW9uIHRpbWVzdGFtcCAoSVNPIDg2MDEpLiBDYXRhbG9nLW9ubHk7IGltbXV0YWJsZSBhZnRlciBjcmVhdGlvbi4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBzdHJpbmc7XG5cdC8qKiBMYXN0IG1vZGlmaWNhdGlvbiB0aW1lc3RhbXAgKElTTyA4NjAxKS4gQ2F0YWxvZy1vbmx5OyBkZXJpdmVkIGZyb20gY2hhdCBhZ2dyZWdhdGlvbi4gKi9cblx0bW9kaWZpZWRBdDogc3RyaW5nO1xuXHQvKiogQWdncmVnYXRlIGZpbGUtY2hhbmdlIGNvdW50cyBmb3IgdGhlIHNlc3Npb24td2lkZSBjaGFuZ2VzZXQuIENhdGFsb2ctb25seS4gKi9cblx0Y2hhbmdlcz86IENoYW5nZXNTdW1tYXJ5O1xufVxuXG4vKipcbiAqIEVuY2Fwc3VsYXRlcyB0aGUgcm9vdC1jaGFubmVsIHN1bW1hcnktbm90aWZpY2F0aW9uIGJvb2trZWVwaW5nIGZvciB0aGVcbiAqIHtAbGluayBBZ2VudEhvc3RTdGF0ZU1hbmFnZXJ9OiB0aGUgbGFzdCB7QGxpbmsgU2Vzc2lvblN1bW1hcnl9IGFubm91bmNlZCB0b1xuICogY2xpZW50cyBwZXIgc2Vzc2lvbiAodGhlIGRpZmYgYmFzZWxpbmUpIGFuZCB0aGUgc2V0IG9mIHNlc3Npb25zIHdob3NlIHN1bW1hcnlcbiAqIGNoYW5nZWQgc2luY2UgdGhlIGxhc3QgZGVib3VuY2VkIGZsdXNoLiBUaGUgc25hcHNob3QgbWFwIGFuZCB0aGUgZGlydHkgc2V0XG4gKiBhcmUgYWx3YXlzIG11dGF0ZWQgaW4gbG9ja3N0ZXAsIHNvIGtlZXBpbmcgdGhlbSB0b2dldGhlciBcdTIwMTQgcmF0aGVyIHRoYW4gYXMgdHdvXG4gKiBsb29zZSBmaWVsZHMgb24gdGhlIG1hbmFnZXIgXHUyMDE0IGtlZXBzIHRoZSBkaWZmaW5nIHN0YXRlIGNvaGVzaXZlLlxuICpcbiAqIFRoZSBjdXJyZW50IHN1bW1hcnkgZm9yIGEgc2Vzc2lvbiBpcyBzb3VyY2VkIHZpYSB0aGUgaW5qZWN0ZWQgYGdldFN1bW1hcnlgXG4gKiBjYWxsYmFjazsgZGlmZi1iYXNlZCBgcm9vdC9zZXNzaW9uU3VtbWFyeUNoYW5nZWRgIG5vdGlmaWNhdGlvbnMgYXJlIGVtaXR0ZWRcbiAqIHRocm91Z2ggYGVtaXRgLlxuICovXG5jbGFzcyBTZXNzaW9uU3VtbWFyeU5vdGlmaWVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqIExhc3Qgc3VtbWFyeSBhbm5vdW5jZWQgdG8gY2xpZW50cyAodmlhIHNlc3Npb25BZGRlZCBvciBzZXNzaW9uU3VtbWFyeUNoYW5nZWQpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0Tm90aWZpZWQgPSBuZXcgTWFwPHN0cmluZywgU2Vzc2lvblN1bW1hcnk+KCk7XG5cblx0LyoqIFNlc3Npb25zIHdob3NlIHN1bW1hcnkgY2hhbmdlZCBzaW5jZSB0aGUgbGFzdCBmbHVzaC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGlydHkgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9mbHVzaEFsbCgpLCAxMDApKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRTdW1tYXJ5OiAoc2Vzc2lvbjogc3RyaW5nKSA9PiBTZXNzaW9uU3VtbWFyeSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbWl0OiAoc2Vzc2lvbjogc3RyaW5nLCBjaGFuZ2VzOiBQYXJ0aWFsPFNlc3Npb25TdW1tYXJ5PikgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKiBSZWNvcmRzIGBzdW1tYXJ5YCBhcyB0aGUgbGFzdCB2YWx1ZSBhbm5vdW5jZWQgdG8gY2xpZW50cyBmb3IgYHNlc3Npb25gLiAqL1xuXHRhbm5vdW5jZShzZXNzaW9uOiBzdHJpbmcsIHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5KTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdE5vdGlmaWVkLnNldChzZXNzaW9uLCBzdW1tYXJ5KTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIGBzZXNzaW9uYCBoYXMgYWxyZWFkeSBiZWVuIGFubm91bmNlZCB0byBjbGllbnRzLiAqL1xuXHRpc0Fubm91bmNlZChzZXNzaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdE5vdGlmaWVkLmhhcyhzZXNzaW9uKTtcblx0fVxuXG5cdC8qKiBNYXJrcyBgc2Vzc2lvbmAgZGlydHkgYW5kIHNjaGVkdWxlcyBhIGRlYm91bmNlZCBmbHVzaC4gKi9cblx0bWFya0RpcnR5KHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2RpcnR5LmFkZChzZXNzaW9uKTtcblx0XHR0aGlzLl9zY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIGBzZXNzaW9uYCBoYXMgYSBwZW5kaW5nICh1bmZsdXNoZWQpIHN1bW1hcnkgY2hhbmdlLiAqL1xuXHRpc0RpcnR5KHNlc3Npb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kaXJ0eS5oYXMoc2Vzc2lvbik7XG5cdH1cblxuXHQvKiogRHJvcHMgdGhlIHBlbmRpbmcgZGlydHkgZmxhZyBmb3IgYHNlc3Npb25gIHdpdGhvdXQgZmx1c2hpbmcgaXQuICovXG5cdGNsZWFyRGlydHkoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlydHkuZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0LyoqIERyb3BzIGFsbCBub3RpZmljYXRpb24gYm9va2tlZXBpbmcgZm9yIGBzZXNzaW9uYC4gKi9cblx0cmVtb3ZlKHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3ROb3RpZmllZC5kZWxldGUoc2Vzc2lvbik7XG5cdFx0dGhpcy5fZGlydHkuZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hBbGwoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX2RpcnR5KSB7XG5cdFx0XHR0aGlzLmZsdXNoKHNlc3Npb24pO1xuXHRcdH1cblx0XHR0aGlzLl9kaXJ0eS5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXRzIGEgYHJvb3Qvc2Vzc2lvblN1bW1hcnlDaGFuZ2VkYCBub3RpZmljYXRpb24gZm9yIGBzZXNzaW9uYCBpZiBpdHNcblx0ICogY3VycmVudCBzdW1tYXJ5IGRpZmZlcnMgZnJvbSB0aGUgbGFzdCBhbm5vdW5jZWQgb25lLCB0aGVuIGFkdmFuY2VzIHRoZVxuXHQgKiBzbmFwc2hvdC4gRG9lcyBOT1QgY2xlYXIgdGhlIGRpcnR5IGZsYWcgXHUyMDE0IGNhbGxlcnMgb3duIHRoYXQgYm9va2tlZXBpbmcuXG5cdCAqL1xuXHRmbHVzaChzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fZ2V0U3VtbWFyeShzZXNzaW9uKTtcblx0XHRjb25zdCBsYXN0Tm90aWZpZWQgPSB0aGlzLl9sYXN0Tm90aWZpZWQuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghY3VycmVudCB8fCAhbGFzdE5vdGlmaWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbmdlczogUGFydGlhbDxTZXNzaW9uU3VtbWFyeT4gPSB7fTtcblx0XHRpZiAoY3VycmVudC50aXRsZSAhPT0gbGFzdE5vdGlmaWVkLnRpdGxlKSB7IGNoYW5nZXMudGl0bGUgPSBjdXJyZW50LnRpdGxlOyB9XG5cdFx0aWYgKGN1cnJlbnQuc3RhdHVzICE9PSBsYXN0Tm90aWZpZWQuc3RhdHVzKSB7IGNoYW5nZXMuc3RhdHVzID0gY3VycmVudC5zdGF0dXM7IH1cblx0XHRpZiAoY3VycmVudC5hY3Rpdml0eSAhPT0gbGFzdE5vdGlmaWVkLmFjdGl2aXR5KSB7IGNoYW5nZXMuYWN0aXZpdHkgPSBjdXJyZW50LmFjdGl2aXR5OyB9XG5cdFx0aWYgKGN1cnJlbnQubW9kaWZpZWRBdCAhPT0gbGFzdE5vdGlmaWVkLm1vZGlmaWVkQXQpIHsgY2hhbmdlcy5tb2RpZmllZEF0ID0gY3VycmVudC5tb2RpZmllZEF0OyB9XG5cdFx0aWYgKGN1cnJlbnQucHJvamVjdCAhPT0gbGFzdE5vdGlmaWVkLnByb2plY3QpIHsgY2hhbmdlcy5wcm9qZWN0ID0gY3VycmVudC5wcm9qZWN0OyB9XG5cdFx0aWYgKGN1cnJlbnQuY2hhbmdlcyAhPT0gbGFzdE5vdGlmaWVkLmNoYW5nZXMpIHsgY2hhbmdlcy5jaGFuZ2VzID0gY3VycmVudC5jaGFuZ2VzOyB9XG5cdFx0aWYgKGN1cnJlbnQud29ya2luZ0RpcmVjdG9yaWVzICE9PSBsYXN0Tm90aWZpZWQud29ya2luZ0RpcmVjdG9yaWVzKSB7IGNoYW5nZXMud29ya2luZ0RpcmVjdG9yaWVzID0gY3VycmVudC53b3JraW5nRGlyZWN0b3JpZXM7IH1cblx0XHRpZiAoY3VycmVudC5fbWV0YSAhPT0gbGFzdE5vdGlmaWVkLl9tZXRhKSB7IGNoYW5nZXMuX21ldGEgPSBjdXJyZW50Ll9tZXRhOyB9XG5cblx0XHR0aGlzLl9sYXN0Tm90aWZpZWQuc2V0KHNlc3Npb24sIGN1cnJlbnQpO1xuXG5cdFx0aWYgKE9iamVjdC5rZXlzKGNoYW5nZXMpLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2VtaXQoc2Vzc2lvbiwgY2hhbmdlcyk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogU2VydmVyLXNpZGUgc3RhdGUgbWFuYWdlciBmb3IgdGhlIHNlc3Npb25zIHByb2Nlc3MgcHJvdG9jb2wuXG4gKlxuICogTWFpbnRhaW5zIHRoZSBhdXRob3JpdGF0aXZlIHN0YXRlIHRyZWUgKHJvb3QgKyBwZXItc2Vzc2lvbiksIGFwcGxpZXMgYWN0aW9uc1xuICogdGhyb3VnaCBwdXJlIHJlZHVjZXJzLCBhc3NpZ25zIG1vbm90b25pYyBzZXF1ZW5jZSBudW1iZXJzLCBhbmQgZW1pdHNcbiAqIHtAbGluayBBY3Rpb25FbnZlbG9wZX1zIGZvciBzdWJzY3JpYmVkIGNsaWVudHMuXG4gKi9cbmV4cG9ydCBjb25zdCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyID0gY3JlYXRlRGVjb3JhdG9yPEFnZW50SG9zdFN0YXRlTWFuYWdlcj4oJ2FnZW50SG9zdFN0YXRlTWFuYWdlcicpO1xuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3NlcnZlclNlcSA9IDA7XG5cblx0cHJpdmF0ZSBfcm9vdFN0YXRlOiBSb290U3RhdGU7XG5cblx0LyoqXG5cdCAqIEF1dGhvcml0YXRpdmUgcGVyLXNlc3Npb24gc3RhdGUsIGtleWVkIGJ5IHNlc3Npb24gVVJJIHN0cmluZy4gRWFjaCBlbnRyeVxuXHQgKiBidW5kbGVzIHRoZSBmbGF0IHtAbGluayBTZXNzaW9uU3RhdGV9IHdpdGggdGhlIGNhdGFsb2ctb25seSBmaWVsZHMgdGhhdFxuXHQgKiBhcmUgbm90IHBhcnQgb2YgdGhlIHN0YXRlIChgY3JlYXRlZEF0YCwgYG1vZGlmaWVkQXRgLCBgY2hhbmdlc2ApLiBUaGVcblx0ICogcm9vdC1jaGFubmVsIHtAbGluayBTZXNzaW9uU3VtbWFyeX0gY2F0YWxvZyB2aWV3IGlzIGRlcml2ZWQgb24gZGVtYW5kIGZyb21cblx0ICogYW4gZW50cnkgdmlhIHtAbGluayBnZXRTZXNzaW9uU3VtbWFyeX0gKGl0cyBgX21ldGFgIGlzIHRoZSBzYW1lIG9iamVjdCBhc1xuXHQgKiB7QGxpbmsgU2Vzc2lvblN0YXRlLl9tZXRhfSk7IHRoZSBob3N0IHN0cmVhbXMgY2F0YWxvZyBkZWx0YXMgdmlhXG5cdCAqIGByb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZGAuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uRW50cnk+KCk7XG5cblx0LyoqXG5cdCAqIEF1dGhvcml0YXRpdmUgcGVyLWNoYXQgY29udmVyc2F0aW9uIHN0YXRlLCBrZXllZCBieSBjaGF0IGNoYW5uZWwgVVJJLlxuXHQgKiBUaGUgcHJvdG9jb2wgbW92ZWQgdHVybnMvYWN0aXZlVHVybi9wZW5kaW5nIHN0YXRlIG9mZiB0aGUgc2Vzc2lvbiBhbmRcblx0ICogb250byBhIHBlci1jaGF0IGNoYW5uZWwuIFZTIENvZGUgY3VycmVudGx5IG1vZGVscyBldmVyeSBzZXNzaW9uIGFzXG5cdCAqIGhhdmluZyBleGFjdGx5IG9uZSBjaGF0IFx1MjAxNCBpdHMgZGVmYXVsdCBjaGF0IFx1MjAxNCB3aG9zZSBVUkkgaXMgZGVyaXZlZFxuXHQgKiBkZXRlcm1pbmlzdGljYWxseSBmcm9tIHRoZSBzZXNzaW9uIFVSSSB2aWEge0BsaW5rIGJ1aWxkRGVmYXVsdENoYXRVcml9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFN0YXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBDaGF0U3RhdGU+KCk7XG5cblx0LyoqXG5cdCAqIE9wYXF1ZSwgYWdlbnQtb3duZWQgYHByb3ZpZGVyRGF0YWAgYmxvYnMga2V5ZWQgYnkgcGVlci1jaGF0IGNoYW5uZWwgVVJJLlxuXHQgKlxuXHQgKiBFYWNoIGVudHJ5IGlzIHRoZSB2ZXJiYXRpbSB0b2tlbiB0aGUgb3duaW5nIGFnZW50IHByb2R1Y2VkIGZvciBhIHBlZXJcblx0ICogY2hhdCAoc2VlIHtAbGluayBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LnByb3ZpZGVyRGF0YX0pLiBUaGUgb3JjaGVzdHJhdG9yXG5cdCAqIHBlcnNpc3RzIGl0IHdpdGggdGhlIHNlc3Npb24gYW5kIGhhbmRzIGl0IGJhY2sgdG8gdGhlIGFnZW50IG9uIHJlc3RvcmUgc29cblx0ICogdGhlIGFnZW50IGNhbiByZS1tYXRlcmlhbGl6ZSBpdHMgU0RLIGNvbnZlcnNhdGlvbjsgdGhlIFN0YXRlTWFuYWdlciBpdHNlbGZcblx0ICogKipuZXZlciBwYXJzZXMsIHZhbGlkYXRlcywgb3IgbXV0YXRlcyBpdCoqIFx1MjAxNCBpdCBzdG9yZXMgYW5kIHJldHVybnMgdGhlXG5cdCAqIHN0cmluZyBhcy1pcy4gVGhlIG1hcCBpcyBrZXB0IHNlcGFyYXRlIGZyb20gdGhlIHByb3RvY29sLXZpc2libGVcblx0ICoge0BsaW5rIENoYXRTdGF0ZX0ve0BsaW5rIENoYXRTdW1tYXJ5fSBjYXRhbG9nIHNvIHRoZSBwcml2YXRlIGJsb2IgaXMgbm90XG5cdCAqIHN0cmVhbWVkIHRvIGNsaWVudHMuIFRoZSBkZWZhdWx0IGNoYXQgY2FycmllcyBubyBgcHJvdmlkZXJEYXRhYCwgc28gaXRcblx0ICogbmV2ZXIgYXBwZWFycyBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFByb3ZpZGVyRGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0LyoqIEV4cGFuZGVkIGNoYW5nZXNldCBzdGF0ZXMsIHNlcGFyYXRlZCBmcm9tIHByb3RvY29sIHNlcXVlbmNpbmcgc28gY2FjaGUgcG9saWN5IHN0YXlzIGxvY2FsLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRzOiBBZ2VudEhvc3RDaGFuZ2VzZXRTdGF0ZUNhY2hlO1xuXG5cdC8qKlxuXHQgKiBQZXItY2hhbm5lbCBhbm5vdGF0aW9uIHN0YXRlcyBmb3IgdGhlIGA8c2Vzc2lvbj4vYW5ub3RhdGlvbnNgIGNoYW5uZWwuXG5cdCAqIFVubGlrZSBjaGFuZ2VzZXRzIChzZXJ2ZXItb3duZWQpLCBhbm5vdGF0aW9uIGFjdGlvbnMgYXJlXG5cdCAqIGNsaWVudC1kaXNwYXRjaGFibGUgYW5kIGxhemlseSBjcmVhdGUgdGhlaXIgc3RhdGUgb24gZmlyc3Qgd3JpdGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbm5vdGF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBBbm5vdGF0aW9uc1N0YXRlPigpO1xuXG5cdC8qKlxuXHQgKiBBY3RpdmUgdHVybnMgcGVyIHNlc3Npb24sIGtleWVkIGJ5IHNlc3Npb24gVVJJIHN0cmluZyB3aXRoIHRoZSB2YWx1ZVxuXHQgKiBiZWluZyB0aGUgc2V0IG9mIHRoYXQgc2Vzc2lvbidzIGNoYXQgY2hhbm5lbCBVUklzIHRoYXQgY3VycmVudGx5IGhhdmUgYW5cblx0ICogYWN0aXZlIHR1cm4uIEEgc2Vzc2lvbiBpcyBcImFjdGl2ZVwiIHdoaWxlIGF0IGxlYXN0IG9uZSBvZiBpdHMgY2hhdHMgaXNcblx0ICogc3RyZWFtaW5nIFx1MjAxNCB0aGlzIHN0YXlzIGNvcnJlY3QgZm9yIG11bHRpLWNoYXQgc2Vzc2lvbnMgd2hvc2UgY2hhdHMgY2FuIHJ1blxuXHQgKiBjb25jdXJyZW50IHR1cm5zIChlLmcuIGFnZW50LXRlYW0gLyBzdWItYWdlbnQgd29ya2VycyksIHdoZXJlIHRoZSBwcmV2aW91c1xuXHQgKiBzaW5nbGUtZmxhZy1wZXItc2Vzc2lvbiBtb2RlbCB3b3VsZCBjbGVhciB0b28gZWFybHkuIEFjdGl2ZSBzdGF0ZSBpc1xuXHQgKiBkZXJpdmVkIGZyb20gYHN0YXRlLmFjdGl2ZVR1cm5gICh0aGUgc291cmNlIG9mIHRydXRoIG1haW50YWluZWQgYnkgdGhlXG5cdCAqIHNlc3Npb24gcmVkdWNlcikgXHUyMDE0IG5ldmVyIGZyb20gcmF3IGFjdGlvbiB0dXJuLWlkcyBcdTIwMTQgc28gdGhhdCBtaXNtYXRjaGVkIG9yXG5cdCAqIG91dC1vZi1vcmRlciB0dXJuIGxpZmVjeWNsZSBhY3Rpb25zIGNhbid0IGRlc3luYyBpdCBmcm9tIHJlYWxpdHkuIFRoZVxuXHQgKiBzZXNzaW9uIGNvdW50IChgc2l6ZWApIGRyaXZlcyBgUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZGAgYW5kXG5cdCAqIGBoYXNBY3RpdmVTZXNzaW9uc2AsIHdoaWNoIHRvZ2V0aGVyIGdhdGUgYC0tZW5hYmxlLXJlbW90ZS1hdXRvLXNodXRkb3duYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4gPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG5cblx0LyoqXG5cdCAqIFJvb3QtY2hhbm5lbCBzdW1tYXJ5IG5vdGlmaWNhdGlvbiBib29ra2VlcGluZzogdGhlIGRpZmYgYmFzZWxpbmUgKGxhc3Rcblx0ICogYW5ub3VuY2VkIHN1bW1hcnkgcGVyIHNlc3Npb24pIGFuZCB0aGUgZGlydHkgc2V0LCBkZWJvdW5jZWQgaW50b1xuXHQgKiBgcm9vdC9zZXNzaW9uU3VtbWFyeUNoYW5nZWRgIG5vdGlmaWNhdGlvbnMuIEFzc2lnbmVkIGluIHRoZSBjb25zdHJ1Y3RvclxuXHQgKiBzaW5jZSBpdCBjbG9zZXMgb3ZlciB7QGxpbmsgX3RvU3VtbWFyeX0gYW5kIHtAbGluayBfb25EaWRFbWl0Tm90aWZpY2F0aW9ufS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1bW1hcnlOb3RpZmllcjogU2Vzc2lvblN1bW1hcnlOb3RpZmllcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVtaXRFbnZlbG9wZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpKTtcblx0cmVhZG9ubHkgb25EaWRFbWl0RW52ZWxvcGU6IEV2ZW50PEFjdGlvbkVudmVsb3BlPiA9IHRoaXMuX29uRGlkRW1pdEVudmVsb3BlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW1pdE5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElOb3RpZmljYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVtaXROb3RpZmljYXRpb246IEV2ZW50PElOb3RpZmljYXRpb24+ID0gdGhpcy5fb25EaWRFbWl0Tm90aWZpY2F0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBzZXNzaW9uOiBzdHJpbmc7IGFjdGl2ZTogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybjogRXZlbnQ8eyBzZXNzaW9uOiBzdHJpbmc7IGFjdGl2ZTogYm9vbGVhbiB9PiA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9uVGl0bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlc3Npb246IHN0cmluZzsgdGl0bGU6IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uVGl0bGU6IEV2ZW50PHsgc2Vzc2lvbjogc3RyaW5nOyB0aXRsZTogc3RyaW5nIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uVGl0bGUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdG9wdGlvbnM6IElBZ2VudEhvc3RTdGF0ZU1hbmFnZXJPcHRpb25zID0ge30sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY2hhbmdlc2V0cyA9IG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTdGF0ZUNhY2hlKG9wdGlvbnMuY2hhbmdlc2V0U3RhdGVSZXRlbnRpb24pO1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZSA9IGNyZWF0ZVJvb3RTdGF0ZSgpO1xuXHRcdC8vIFNlZWQgdGhlIGhvc3QtbGV2ZWwgY29uZmlndXJhdGlvbiBzY2hlbWEgKyBkZWZhdWx0IHZhbHVlcyBzbyB0aGF0XG5cdFx0Ly8gUm9vdENvbmZpZ0NoYW5nZWQgYWN0aW9ucyBjYW4gbWVyZ2UgaW50byBpdCwgYW5kIGNsaWVudHMgc2VlIHRoZVxuXHRcdC8vIHNjaGVtYSBpbW1lZGlhdGVseSB1cG9uIHN1YnNjcmliaW5nIHRvIGBhZ2VudGhvc3Q6L3Jvb3RgLiBTZWVcblx0XHQvLyBgcGxhdGZvcm1Sb290U2NoZW1hYCBmb3IgdGhlIHNldCBvZiBwbGF0Zm9ybS1vd25lZCBwcm9wZXJ0aWVzLlxuXHRcdHRoaXMuX3Jvb3RTdGF0ZSA9IHtcblx0XHRcdC4uLnRoaXMuX3Jvb3RTdGF0ZSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRzY2hlbWE6IHBsYXRmb3JtUm9vdFNjaGVtYS50b1Byb3RvY29sKCksXG5cdFx0XHRcdHZhbHVlczogcGxhdGZvcm1Sb290U2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHt9LCB7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdOiB7IGFsbG93OiBbXSwgZGVueTogW10gfSBzYXRpc2ZpZXMgSVBlcm1pc3Npb25zVmFsdWUsXG5cdFx0XHRcdFx0W0FnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5XTogdGVsZW1ldHJ5TGV2ZWxUb0FnZW50SG9zdENvbmZpZ1ZhbHVlKFRlbGVtZXRyeUxldmVsLlVTQUdFKSxcblx0XHRcdFx0fSksXG5cdFx0XHR9LFxuXHRcdFx0X21ldGE6IHdpdGhIb3N0QnVpbGRJbmZvKHRoaXMuX3Jvb3RTdGF0ZS5fbWV0YSwgb3B0aW9ucy5ob3N0QnVpbGRJbmZvKSxcblx0XHR9O1xuXHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXNzaW9uU3VtbWFyeU5vdGlmaWVyKFxuXHRcdFx0c2Vzc2lvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0XHRcdHJldHVybiBlbnRyeSA/IHRoaXMuX3RvU3VtbWFyeShzZXNzaW9uLCBlbnRyeSkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0KHNlc3Npb24sIGNoYW5nZXMpID0+IHRoaXMuX29uRGlkRW1pdE5vdGlmaWNhdGlvbi5maXJlKHtcblx0XHRcdFx0dHlwZTogJ3Jvb3Qvc2Vzc2lvblN1bW1hcnlDaGFuZ2VkJyxcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdGNoYW5nZXMsXG5cdFx0XHR9KSxcblx0XHQpKTtcblx0fVxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2cgPSAobXNnOiBzdHJpbmcpID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gJHttc2d9YCk7XG5cblx0Z2V0IGhhc0FjdGl2ZVNlc3Npb25zKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLnNpemUgPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGdpdmVuIHNlc3Npb24gY3VycmVudGx5IGhhcyBhbiBhY3RpdmUgdHVybiBcdTIwMTQgaS5lLiBhIHJlcXVlc3QgaXNcblx0ICogaW4gcHJvZ3Jlc3Mgb24gYW55IG9mIGl0cyBjaGF0cy4gU3RheXMgYHRydWVgIHdoaWxlIGF0IGxlYXN0IG9uZSBjaGF0IGlzXG5cdCAqIHN0cmVhbWluZywgc28gaXQgcmVtYWlucyBjb3JyZWN0IGZvciBtdWx0aS1jaGF0IHNlc3Npb25zIHJ1bm5pbmdcblx0ICogY29uY3VycmVudCB0dXJucy5cblx0ICovXG5cdGhhc0FjdGl2ZVR1cm4oc2Vzc2lvbktleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uaGFzKHNlc3Npb25LZXkpO1xuXHR9XG5cblx0Ly8gLS0tLSBTdGF0ZSBhY2Nlc3NvcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGdldCByb290U3RhdGUoKTogUm9vdFN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdFN0YXRlO1xuXHR9XG5cblx0Z2V0U2Vzc2lvblN0YXRlKHNlc3Npb25PckNoYXQ6IFVSSSk6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBBY2NlcHQgZWl0aGVyIGEgc2Vzc2lvbiBVUkkgb3Igb25lIG9mIGl0cyBjaGF0IGNoYW5uZWwgVVJJcy4gV2hlbiBhXG5cdFx0Ly8gY2hhdCBVUkkgaXMgZ2l2ZW4gdGhlIGNvbnZlcnNhdGlvbiBjb250ZW50cyBhcmUgdGFrZW4gZnJvbSB0aGF0IGNoYXQsXG5cdFx0Ly8gd2hpbGUgdGhlIHNlc3Npb24gc3VtbWFyeS9jb25maWcgY29tZSBmcm9tIHRoZSBvd25pbmcgc2Vzc2lvbi5cblx0XHRjb25zdCBpc0NoYXQgPSBpc0FocENoYXRDaGFubmVsKHNlc3Npb25PckNoYXQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBpc0NoYXQgPyBwYXJzZURlZmF1bHRDaGF0VXJpKHNlc3Npb25PckNoYXQpIDogc2Vzc2lvbk9yQ2hhdDtcblx0XHRpZiAoc2Vzc2lvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRVcmkgPSBpc0NoYXQgPyBzZXNzaW9uT3JDaGF0IDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblx0XHRyZXR1cm4gbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0KGVudHJ5LnN0YXRlLCB0aGlzLl9jaGF0U3RhdGVzLmdldChjaGF0VXJpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcm9vdC1jaGFubmVsIHtAbGluayBTZXNzaW9uU3VtbWFyeX0gY2F0YWxvZyBlbnRyeSBmb3IgYVxuXHQgKiBzZXNzaW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGlzIHVua25vd24uIFRoZSBzdW1tYXJ5IGlzXG5cdCAqIGRlcml2ZWQgb24gZGVtYW5kIGZyb20gdGhlIHNlc3Npb24ncyB7QGxpbmsgSVNlc3Npb25FbnRyeX06IGl0cyBtZXRhZGF0YVxuXHQgKiBmaWVsZHMgYW5kIGBfbWV0YWAgY29tZSBzdHJhaWdodCBvZmYgdGhlIGxpdmUge0BsaW5rIFNlc3Npb25TdGF0ZX0sIHdoaWxlXG5cdCAqIHRoZSBjYXRhbG9nLW9ubHkgYHJlc291cmNlYCAvIGBjcmVhdGVkQXRgIC8gYG1vZGlmaWVkQXRgIC8gYGNoYW5nZXNgIGNvbWVcblx0ICogZnJvbSB0aGUgZW50cnkuXG5cdCAqL1xuXHRnZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uOiBVUkkpOiBTZXNzaW9uU3VtbWFyeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRyZXR1cm4gZW50cnkgPyB0aGlzLl90b1N1bW1hcnkoc2Vzc2lvbiwgZW50cnkpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2plY3RzIGFuIHtAbGluayBJU2Vzc2lvbkVudHJ5fSBpbnRvIGl0cyByb290LWNoYW5uZWxcblx0ICoge0BsaW5rIFNlc3Npb25TdW1tYXJ5fS4gVGhlIHN1bW1hcnkncyBgX21ldGFgIGlzIHRoZSBzYW1lIG9iamVjdCBhc1xuXHQgKiB7QGxpbmsgU2Vzc2lvblN0YXRlLl9tZXRhfSBcdTIwMTQgdGhlIGhvc3QgdHJlYXRzIHRoZSB0d28gYXMgaWRlbnRpY2FsLlxuXHQgKi9cblx0cHJpdmF0ZSBfdG9TdW1tYXJ5KHNlc3Npb246IHN0cmluZywgZW50cnk6IElTZXNzaW9uRW50cnkpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0Y29uc3QgeyBzdGF0ZSB9ID0gZW50cnk7XG5cdFx0Y29uc3Qgc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkgPSB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdHByb3ZpZGVyOiBzdGF0ZS5wcm92aWRlcixcblx0XHRcdHRpdGxlOiBzdGF0ZS50aXRsZSxcblx0XHRcdHN0YXR1czogc3RhdGUuc3RhdHVzLFxuXHRcdFx0Y3JlYXRlZEF0OiBlbnRyeS5jcmVhdGVkQXQsXG5cdFx0XHRtb2RpZmllZEF0OiBlbnRyeS5tb2RpZmllZEF0LFxuXHRcdH07XG5cdFx0aWYgKHN0YXRlLmFjdGl2aXR5ICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS5hY3Rpdml0eSA9IHN0YXRlLmFjdGl2aXR5OyB9XG5cdFx0aWYgKHN0YXRlLnByb2plY3QgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LnByb2plY3QgPSBzdGF0ZS5wcm9qZWN0OyB9XG5cdFx0aWYgKHN0YXRlLndvcmtpbmdEaXJlY3RvcmllcyAhPT0gdW5kZWZpbmVkKSB7IHN1bW1hcnkud29ya2luZ0RpcmVjdG9yaWVzID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzOyB9XG5cdFx0aWYgKHN0YXRlLmFubm90YXRpb25zICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS5hbm5vdGF0aW9ucyA9IHN0YXRlLmFubm90YXRpb25zOyB9XG5cdFx0aWYgKGVudHJ5LmNoYW5nZXMgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LmNoYW5nZXMgPSBlbnRyeS5jaGFuZ2VzOyB9XG5cdFx0aWYgKHN0YXRlLl9tZXRhICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS5fbWV0YSA9IHN0YXRlLl9tZXRhOyB9XG5cdFx0cmV0dXJuIHN1bW1hcnk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUge0BsaW5rIFNlc3Npb25TdW1tYXJ5fS1yZWxldmFudCBmaWVsZHMgb2YgdHdvIHNlc3Npb24gc3RhdGVzXG5cdCAqIGFyZSBmaWVsZC1lcXVhbC4gVXNlZCB0byBkZWNpZGUgd2hldGhlciBhIHNlc3Npb24gYWN0aW9uIG11dGF0ZWQgYW55dGhpbmdcblx0ICogdGhlIHJvb3QtY2hhbm5lbCBjYXRhbG9nIGNhcmVzIGFib3V0LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3VtbWFyeUZpZWxkc0VxdWFsKGE6IFNlc3Npb25TdGF0ZSwgYjogU2Vzc2lvblN0YXRlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGEudGl0bGUgPT09IGIudGl0bGVcblx0XHRcdCYmIGEuc3RhdHVzID09PSBiLnN0YXR1c1xuXHRcdFx0JiYgYS5hY3Rpdml0eSA9PT0gYi5hY3Rpdml0eVxuXHRcdFx0JiYgYS5wcm9qZWN0ID09PSBiLnByb2plY3Rcblx0XHRcdCYmIGEud29ya2luZ0RpcmVjdG9yaWVzID09PSBiLndvcmtpbmdEaXJlY3Rvcmllc1xuXHRcdFx0JiYgYS5hbm5vdGF0aW9ucyA9PT0gYi5hbm5vdGF0aW9uc1xuXHRcdFx0JiYgYS5fbWV0YSA9PT0gYi5fbWV0YTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhdXRob3JpdGF0aXZlIHtAbGluayBDaGF0U3RhdGV9IGZvciBhIHNlc3Npb24ncyBkZWZhdWx0XG5cdCAqIGNoYXQsIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlIHNlc3Npb24gaXMgdW5rbm93bi4gVXNlIHRoaXMgd2hlbiB0aGVcblx0ICogY2FsbGVyIHNwZWNpZmljYWxseSBuZWVkcyBjb252ZXJzYXRpb24gY29udGVudHMgKHR1cm5zLCBhY3RpdmVUdXJuLFxuXHQgKiBwZW5kaW5nL2lucHV0IHN0YXRlKSByYXRoZXIgdGhhbiB0aGUgc2Vzc2lvbiBzdW1tYXJ5LlxuXHQgKi9cblx0Z2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uOiBVUkkpOiBDaGF0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0U3RhdGVzLmdldChidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHRoZSBhdXRob3JpdGF0aXZlIHtAbGluayBDaGF0U3RhdGV9IGZvciBhIGNoYXQgY2hhbm5lbCBVUkkuICovXG5cdGdldENoYXRTdGF0ZShjaGF0OiBVUkkpOiBDaGF0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0U3RhdGVzLmdldChjaGF0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBvcGFxdWUsIGFnZW50LW93bmVkIGBwcm92aWRlckRhdGFgIGJsb2IgcHJldmlvdXNseSByZWNvcmRlZFxuXHQgKiBmb3IgYSBwZWVyIGNoYXQgdmlhIHtAbGluayBhZGRDaGF0fSBvciB7QGxpbmsgcmVzdG9yZUNoYXR9LCBvciBgdW5kZWZpbmVkYFxuXHQgKiB3aGVuIG5vbmUgd2FzIHN0b3JlZCAoZS5nLiB0aGUgZGVmYXVsdCBjaGF0LCBvciBhIHBlZXIgY2hhdCB0aGUgYWdlbnQgaGFkXG5cdCAqIG5vdGhpbmcgcmVzdW1hYmxlIHRvIHBlcnNpc3QgZm9yKS4gVGhlIHZhbHVlIGlzIHJldHVybmVkIHZlcmJhdGltIFx1MjAxNCB0aGVcblx0ICogU3RhdGVNYW5hZ2VyIG5ldmVyIGludGVycHJldHMgaXQ7IGNhbGxlcnMgcGVyc2lzdCBpdCB3aXRoIHRoZSBzZXNzaW9uIGFuZFxuXHQgKiBoYW5kIGl0IGJhY2sgdG8gdGhlIG93bmluZyBhZ2VudCBvbiByZXN0b3JlLlxuXHQgKi9cblx0Z2V0Q2hhdFByb3ZpZGVyRGF0YShjaGF0OiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0UHJvdmlkZXJEYXRhLmdldChjaGF0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkcyB0aGUgY29udmVyc2F0aW9uIGNvbnRlbnRzICh0dXJucykgb2YgYSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0LlxuXHQgKiBVc2VkIGJ5IHRoZSBmb3JrIGZsb3csIHdoaWNoIG1hdGVyaWFsaXplcyBhIG5ldyBzZXNzaW9uIHByZS1wb3B1bGF0ZWRcblx0ICogd2l0aCBhIHNsaWNlIG9mIHRoZSBzb3VyY2Ugc2Vzc2lvbidzIHR1cm5zLlxuXHQgKi9cblx0c2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbjogVVJJLCB0dXJuczogVHVybltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdFN0YXRlID0gdGhpcy5fY2hhdFN0YXRlcy5nZXQoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0aWYgKGNoYXRTdGF0ZSkge1xuXHRcdFx0Y2hhdFN0YXRlLnR1cm5zID0gdHVybnM7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHNlcnZlclNlcSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zZXJ2ZXJTZXE7XG5cdH1cblxuXHRnZXRTZXNzaW9uVXJpcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9uU3RhdGVzLmtleXMoKV07XG5cdH1cblxuXHQvKipcblx0ICogU3VtbWFyaWVzIGVsaWdpYmxlIHRvIGJlIG92ZXJsYWlkIG9udG8gYSBwcm92aWRlcidzIGBsaXN0U2Vzc2lvbnNgXG5cdCAqIHNuYXBzaG90IHdoZW4gdGhhdCBzbmFwc2hvdCBpcyBtaXNzaW5nIHRoZW0uIEEgc2Vzc2lvbiBxdWFsaWZpZXMgaWYgaXRcblx0ICogaGFzIG1hdGVyaWFsaXplZCAobGlmZWN5Y2xlICE9PSB7QGxpbmsgU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGluZ30pIFx1MjAxNCB0aGlzXG5cdCAqIGNvdmVycyB0aGUgdHJhbnNpZW50LWRyb3AgY2FzZSB3aGVyZSBhIHByb3ZpZGVyIGJyaWVmbHkgb21pdHMgYVxuXHQgKiBqdXN0LW1hdGVyaWFsaXplZCBzZXNzaW9uIFx1MjAxNCBvciBpZiBpdCBpcyBzdGlsbCBwcm92aXNpb25hbCBidXQgaGFzIGhhZCBhbnlcblx0ICogdHVybiBhY3Rpdml0eSAoYW4gaW4tZmxpZ2h0IHR1cm4sIG9yIGEgY29tcGxldGVkIHR1cm4gd2hvc2UgbWF0ZXJpYWxpemVcblx0ICogZXZlbnQgaGFzIG5vdCBsYW5kZWQgeWV0OyB0aGUgZmlyc3QgdHVybiBjYW4gc3RhcnQgYmVmb3JlIG1hdGVyaWFsaXphdGlvblxuXHQgKiBjb21wbGV0ZXMpLiBJZGxlIHByb3Zpc2lvbmFsIHNlc3Npb25zIChjcmVhdGVkIGJ1dCBub3QgeWV0IG1hdGVyaWFsaXplZFxuXHQgKiBhbmQgd2l0aCBubyB0dXJuIGFjdGl2aXR5LCBlLmcuIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlcidzIGVhZ2VybHktY3JlYXRlZFxuXHQgKiBzZXNzaW9uIGJlZm9yZSBpdHMgZmlyc3QgbWVzc2FnZSkgYXJlIGV4Y2x1ZGVkIHNvIHRoZXkgZG9uJ3QgbGVhayBpbnRvXG5cdCAqIHRoZSBzZXNzaW9uIGxpc3QgKCMzMjEyNjkpLlxuXHQgKi9cblx0Z2V0T3ZlcmxheVNlc3Npb25TdW1tYXJpZXMoKTogU2Vzc2lvblN1bW1hcnlbXSB7XG5cdFx0Y29uc3Qgc3VtbWFyaWVzOiBTZXNzaW9uU3VtbWFyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgdGhpcy5fc2Vzc2lvblN0YXRlcykge1xuXHRcdFx0Ly8gVHVybiBhY3Rpdml0eSBsaXZlcyBvbiB0aGUgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdCBhZnRlciB0aGVcblx0XHRcdC8vIG11bHRpLWNoYXQgcHJvdG9jb2wgbW92ZSwgc28gY29uc3VsdCB0aGF0IGNoYXQncyB0dXJucy9hY3RpdmVUdXJuLlxuXHRcdFx0Y29uc3QgY2hhdCA9IHRoaXMuX2NoYXRTdGF0ZXMuZ2V0KGJ1aWxkRGVmYXVsdENoYXRVcmkoa2V5KSk7XG5cdFx0XHRpZiAoZW50cnkuc3RhdGUubGlmZWN5Y2xlID09PSBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nICYmICFjaGF0Py5hY3RpdmVUdXJuICYmIChjaGF0Py50dXJucy5sZW5ndGggPz8gMCkgPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzdW1tYXJpZXMucHVzaCh0aGlzLl90b1N1bW1hcnkoa2V5LCBlbnRyeSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VtbWFyaWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIHNlc3Npb24gVVJJcyB3aG9zZSBrZXlzIHN0YXJ0IHdpdGggdGhlIGdpdmVuIHByZWZpeC5cblx0ICogVXNlZCB0byBkaXNjb3ZlciBzdWJhZ2VudCBzZXNzaW9ucyBmb3IgYSBnaXZlbiBwYXJlbnQuXG5cdCAqL1xuXHRnZXRTZXNzaW9uVXJpc1dpdGhQcmVmaXgocHJlZml4OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX3Nlc3Npb25TdGF0ZXMua2V5cygpKSB7XG5cdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgocHJlZml4KSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gLS0tLSBTbmFwc2hvdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgc3RhdGUgc25hcHNob3QgZm9yIGEgZ2l2ZW4gcmVzb3VyY2UgVVJJLlxuXHQgKiBUaGUgYGZyb21TZXFgIGluIHRoZSBzbmFwc2hvdCBpcyB0aGUgY3VycmVudCBzZXJ2ZXJTZXEgYXQgc25hcHNob3QgdGltZTtcblx0ICogdGhlIGNsaWVudCBzaG91bGQgcHJvY2VzcyBzdWJzZXF1ZW50IGVudmVsb3BlcyB3aXRoIHNlcnZlclNlcSA+IGZyb21TZXEuXG5cdCAqL1xuXHRnZXRTbmFwc2hvdChyZXNvdXJjZTogVVJJKTogSVN0YXRlU25hcHNob3QgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc0FocFJvb3RDaGFubmVsKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2U6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRzdGF0ZTogdGhpcy5fcm9vdFN0YXRlLFxuXHRcdFx0XHRmcm9tU2VxOiB0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIENoYW5nZXNldCBVUklzIGFyZSBuZXN0ZWQgdW5kZXIgdGhlaXIgc2Vzc2lvbiBVUkk7IGNoZWNrIHRoZW1cblx0XHQvLyBiZWZvcmUgZmFsbGluZyBiYWNrIHRvIHRoZSBzZXNzaW9uIG1hcCBzbyBhIHNlc3Npb24gd2hvc2UgVVJJXG5cdFx0Ly8gaGFwcGVucyB0byBzaGFyZSBhIHByZWZpeCB3aXRoIGEgY2hhbmdlc2V0IG5ldmVyIGNvbGxpZGVzLlxuXHRcdGNvbnN0IGNoYW5nZXNldFN0YXRlID0gdGhpcy5fY2hhbmdlc2V0cy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChjaGFuZ2VzZXRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHN0YXRlOiBjaGFuZ2VzZXRTdGF0ZSxcblx0XHRcdFx0ZnJvbVNlcTogdGhpcy5fc2VydmVyU2VxLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBDaGF0IGNoYW5uZWwgVVJJcyByZXNvbHZlIHRvIHBlci1jaGF0IGNvbnZlcnNhdGlvbiBzdGF0ZS5cblx0XHRpZiAoaXNBaHBDaGF0Q2hhbm5lbChyZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHRoaXMuX2NoYXRTdGF0ZXMuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmICghY2hhdFN0YXRlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0c3RhdGU6IGNoYXRTdGF0ZSxcblx0XHRcdFx0ZnJvbVNlcTogdGhpcy5fc2VydmVyU2VxLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBBbm5vdGF0aW9uIFVSSXMgYXJlIG5lc3RlZCB1bmRlciB0aGVpciBzZXNzaW9uIFVSSSBhcyB3ZWxsLiBUaGV5IGFyZVxuXHRcdC8vIGNsaWVudC1kaXNwYXRjaGFibGUgYW5kIGxhemlseSBjcmVhdGVkLCBzbyByZXR1cm4gYW4gZW1wdHkgc3RhdGUgZm9yXG5cdFx0Ly8gYSB3ZWxsLWZvcm1lZCBhbm5vdGF0aW9ucyBVUkkgZXZlbiBiZWZvcmUgdGhlIGZpcnN0IHdyaXRlLlxuXHRcdGlmIChpc0Fubm90YXRpb25zVXJpKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHN0YXRlOiB0aGlzLl9hbm5vdGF0aW9ucy5nZXQocmVzb3VyY2UpID8/IHsgYW5ub3RhdGlvbnM6IFtdIH0sXG5cdFx0XHRcdGZyb21TZXE6IHRoaXMuX3NlcnZlclNlcSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRzdGF0ZTogZW50cnkuc3RhdGUsXG5cdFx0XHRmcm9tU2VxOiB0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBSZWFkLW9ubHkgYWNjZXNzb3IgZm9yIGNhbGxlcnMgdGhhdCBvbmx5IG5lZWQgdG8gaW5zcGVjdCBhIGNoYW5nZXNldCAobm90IHN1YnNjcmliZSkuICovXG5cdGdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldDogVVJJKTogQ2hhbmdlc2V0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGFuZ2VzZXRzLmdldChjaGFuZ2VzZXQpO1xuXHR9XG5cblx0LyoqIFJlY29uc2lkZXJzIGNoYW5nZXNldCBzdGF0ZSByZXRlbnRpb24gYWZ0ZXIgc3Vic2NyaWJlcnMgb3IgY29tcHV0ZXMgcmVsZWFzZSB0aGVpciBwaW5zLiAqL1xuXHRvbkNoYW5nZXNldExpdmVuZXNzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGFuZ2VzZXRzLnRyaW1FdmljdGFibGVFbnRyaWVzKCk7XG5cdH1cblxuXHQvLyAtLS0tIFNlc3Npb24gbGlmZWN5Y2xlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgc2Vzc2lvbiBpbiBzdGF0ZSB3aXRoIGBsaWZlY3ljbGU6ICdjcmVhdGluZydgLlxuXHQgKiBSZXR1cm5zIHRoZSBpbml0aWFsIHNlc3Npb24gc3RhdGUuXG5cdCAqXG5cdCAqIEJ5IGRlZmF1bHQgYSB7QGxpbmsgTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uQWRkZWR9IG5vdGlmaWNhdGlvbiBpc1xuXHQgKiBlbWl0dGVkIHNvIGNsaWVudHMgc2VlIHRoZSBuZXcgc2Vzc2lvbiBpbW1lZGlhdGVseS4gUGFzc1xuXHQgKiBgb3B0aW9ucy5lbWl0Tm90aWZpY2F0aW9uOiBmYWxzZWAgdG8gZGVmZXIgdGhlIG5vdGlmaWNhdGlvbiBcdTIwMTQgYSB0eXBpY2FsXG5cdCAqIHVzZSBpcyBmb3IgKipwcm92aXNpb25hbCoqIHNlc3Npb25zIHRoYXQgZXhpc3Qgb24gdGhlIHNlcnZlciBidXQgc2hvdWxkXG5cdCAqIG5vdCBhcHBlYXIgaW4gY2xpZW50IHNlc3Npb24gbGlzdHMgdW50aWwgdGhleSBoYXZlIGJlZW4gcGVyc2lzdGVkIGJ5XG5cdCAqIHRoZSBhZ2VudCAoZS5nLiBvbiB0aGUgZmlyc3QgbWVzc2FnZSB0aGF0IG1hdGVyaWFsaXplcyBhbiBTREsgc2Vzc2lvblxuXHQgKiBhbmQgd3JpdGVzIGl0cyBvbi1kaXNrIG1ldGFkYXRhKS4gQ2FsbCB7QGxpbmsgbWFya1Nlc3Npb25QZXJzaXN0ZWR9XG5cdCAqIGFmdGVyd2FyZHMgdG8gZmlyZSB0aGUgZGVmZXJyZWQgbm90aWZpY2F0aW9uLlxuXHQgKi9cblx0Y3JlYXRlU2Vzc2lvbihzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgZW1pdE5vdGlmaWNhdGlvbj86IGJvb2xlYW4gfSk6IFNlc3Npb25TdGF0ZSB7XG5cdFx0Y29uc3Qga2V5ID0gc3VtbWFyeS5yZXNvdXJjZTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIFNlc3Npb24gYWxyZWFkeSBleGlzdHM6ICR7a2V5fWApO1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnN0YXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlU2Vzc2lvblN0YXRlKHN1bW1hcnkpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMuc2V0KGtleSwgdGhpcy5fbmV3RW50cnkoc3RhdGUsIHN1bW1hcnkpKTtcblx0XHR0aGlzLl9lbnN1cmVEZWZhdWx0Q2hhdChrZXksIHN1bW1hcnkpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gQ3JlYXRlZCBzZXNzaW9uOiAke2tleX1gKTtcblxuXHRcdGlmIChvcHRpb25zPy5lbWl0Tm90aWZpY2F0aW9uICE9PSBmYWxzZSkge1xuXHRcdFx0Ly8gQW5ub3VuY2luZyB0aGUgc3VtbWFyeSB0byB0aGUgbm90aWZpZXIgaXMgd2hhdCBtYWtlc1xuXHRcdFx0Ly8gaXRzIGxhdGVyIGZsdXNoIGVtaXQgaW5jcmVtZW50YWwgdXBkYXRlcyBhbmQgd2hhdCBtYWtlc1xuXHRcdFx0Ly8gYG1hcmtTZXNzaW9uUGVyc2lzdGVkYCBhIG5vLW9wLiBQcm92aXNpb25hbCBzZXNzaW9uc1xuXHRcdFx0Ly8gaW50ZW50aW9uYWxseSBza2lwIGJvdGggdW50aWwgdGhleSBhcmUgcGVyc2lzdGVkLlxuXHRcdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLmFubm91bmNlKGtleSwgc3VtbWFyeSk7XG5cdFx0XHR0aGlzLl9vbkRpZEVtaXROb3RpZmljYXRpb24uZmlyZSh7XG5cdFx0XHRcdHR5cGU6ICdyb290L3Nlc3Npb25BZGRlZCcsXG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRzdW1tYXJ5LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0LyoqIEJ1aWxkcyB0aGUgYXV0aG9yaXRhdGl2ZSB7QGxpbmsgSVNlc3Npb25FbnRyeX0gZm9yIGEgZnJlc2hseSBzZWVkZWQgc3RhdGUuICovXG5cdHByaXZhdGUgX25ld0VudHJ5KHN0YXRlOiBTZXNzaW9uU3RhdGUsIHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5KTogSVNlc3Npb25FbnRyeSB7XG5cdFx0cmV0dXJuIHsgc3RhdGUsIGNyZWF0ZWRBdDogc3VtbWFyeS5jcmVhdGVkQXQsIG1vZGlmaWVkQXQ6IHN1bW1hcnkubW9kaWZpZWRBdCwgY2hhbmdlczogc3VtbWFyeS5jaGFuZ2VzIH07XG5cdH1cblxuXHQvKipcblx0ICogRmlyZSBhIHtAbGluayBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25BZGRlZH0gbm90aWZpY2F0aW9uIGZvciBhIHNlc3Npb25cblx0ICogd2hvc2UgY3JlYXRpb24gd2FzIGRlZmVycmVkIHZpYSBgY3JlYXRlU2Vzc2lvbih7IGVtaXROb3RpZmljYXRpb246IGZhbHNlIH0pYC5cblx0ICpcblx0ICogUHJvcGFnYXRlcyB0aGUgbWF0ZXJpYWxpemF0aW9uLXJlc29sdmVkIGNhdGFsb2cgZmllbGRzIChgcHJvamVjdGAsXG5cdCAqIGB3b3JraW5nRGlyZWN0b3J5YCwgYG1vZGlmaWVkQXRgLCBgY2hhbmdlc2ApIGZyb20gdGhlIHN1cHBsaWVkIHN1bW1hcnlcblx0ICogb250byB0aGUgc2Vzc2lvbiBlbnRyeSBzbyBzdWJzY3JpYmVycyBzZWUgdGhlbS4gVGhlIHJlZHVjZXItb3duZWQgbWV0YWRhdGFcblx0ICogKGB0aXRsZWAsIGBzdGF0dXNgLCBgYWN0aXZpdHlgKSBpcyBpbnRlbnRpb25hbGx5IE5PVCBjb3BpZWQgYmFjayBcdTIwMTQgdGhlIGxpdmVcblx0ICogc3RhdGUgaXMgYXV0aG9yaXRhdGl2ZSBmb3IgdGhvc2UuIE5vLW9wcyBmb3Igc2Vzc2lvbnMgdGhhdCB3ZXJlIGFscmVhZHlcblx0ICogYW5ub3VuY2VkIChpZGVtcG90ZW50KS5cblx0ICovXG5cdG1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb246IFVSSSwgc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChrZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gbWFya1Nlc3Npb25QZXJzaXN0ZWQ6IHVua25vd24gc2Vzc2lvbiAke2tleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIG5vdGlmaWVyIHJlY29yZHMgYSBzZXNzaW9uJ3MgYW5ub3VuY2VkIHN1bW1hcnkgd2hlbmV2ZXIgaXQgaGFzXG5cdFx0Ly8gYmVlbiBzdXJmYWNlZCB0byBjbGllbnRzIChlaXRoZXIgdGhyb3VnaCBgY3JlYXRlU2Vzc2lvbmAgb3IgaGVyZSk7XG5cdFx0Ly8gdXNpbmcgaXQgYXMgdGhlIGlkZW1wb3RlbmN5IGNoZWNrIGtlZXBzIHVzIGZyb20gZmlyaW5nIGBTZXNzaW9uQWRkZWRgXG5cdFx0Ly8gdHdpY2UgZm9yIGEgc2Vzc2lvbiB3aG9zZSBjcmVhdGlvbiB3YXMgbm90IGRlZmVycmVkLlxuXHRcdGlmICh0aGlzLl9zdW1tYXJ5Tm90aWZpZXIuaXNBbm5vdW5jZWQoa2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBQcm9wYWdhdGUgdGhlIG1hdGVyaWFsaXphdGlvbi1yZXNvbHZlZCBmaWVsZHMgc28gc3Vic2NyaWJlcnMgY2FsbGluZ1xuXHRcdC8vIGBnZXRTZXNzaW9uU3RhdGVgIC8gYGdldFNlc3Npb25TdW1tYXJ5YCBzZWUgdGhlIHJlc29sdmVkIHdvcmtpbmdcblx0XHQvLyBkaXJlY3RvcnkgLyBwcm9qZWN0LiBXZSBkb24ndCBuZWVkIHRvIHNjaGVkdWxlIGFcblx0XHQvLyBgU2Vzc2lvblN1bW1hcnlDaGFuZ2VkYCBmbHVzaCBiZWNhdXNlIHRoZSB1cGNvbWluZyBgU2Vzc2lvbkFkZGVkYFxuXHRcdC8vIG5vdGlmaWNhdGlvbiBjYXJyaWVzIHRoZSBjb21wbGV0ZSBzdW1tYXJ5IGFscmVhZHkuXG5cdFx0ZW50cnkuc3RhdGUgPSB7IC4uLmVudHJ5LnN0YXRlLCBwcm9qZWN0OiBzdW1tYXJ5LnByb2plY3QsIHdvcmtpbmdEaXJlY3Rvcmllczogc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXMgfTtcblx0XHRlbnRyeS5tb2RpZmllZEF0ID0gc3VtbWFyeS5tb2RpZmllZEF0O1xuXHRcdGVudHJ5LmNoYW5nZXMgPSBzdW1tYXJ5LmNoYW5nZXM7XG5cdFx0Y29uc3QgZnVsbCA9IHRoaXMuX3RvU3VtbWFyeShrZXksIGVudHJ5KTtcblx0XHR0aGlzLl9zdW1tYXJ5Tm90aWZpZXIuYW5ub3VuY2Uoa2V5LCBmdWxsKTtcblx0XHR0aGlzLl9vbkRpZEVtaXROb3RpZmljYXRpb24uZmlyZSh7XG5cdFx0XHR0eXBlOiAncm9vdC9zZXNzaW9uQWRkZWQnLFxuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzdW1tYXJ5OiBmdWxsLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RvcmVzIGEgc2Vzc2lvbiBmcm9tIGEgcHJldmlvdXMgc2VydmVyIGxpZmV0aW1lIGludG8gdGhlIHN0YXRlIG1hbmFnZXJcblx0ICogd2l0aCBwcmUtcG9wdWxhdGVkIHR1cm5zLiBUaGUgc2Vzc2lvbiBpcyBjcmVhdGVkIGluIGByZWFkeWAgbGlmZWN5Y2xlXG5cdCAqIHN0YXRlIHNpbmNlIGl0IGFscmVhZHkgZXhpc3RzIG9uIHRoZSBiYWNrZW5kLlxuXHQgKlxuXHQgKiBVbmxpa2Uge0BsaW5rIGNyZWF0ZVNlc3Npb259LCB0aGlzIGRvZXMgTk9UIGVtaXQgYSBgc2Vzc2lvbkFkZGVkYFxuXHQgKiBub3RpZmljYXRpb24gYmVjYXVzZSB0aGUgc2Vzc2lvbiBpcyBhbHJlYWR5IGtub3duIHRvIGNsaWVudHMgdmlhXG5cdCAqIGBsaXN0U2Vzc2lvbnNgLlxuXHQgKi9cblx0cmVzdG9yZVNlc3Npb24oc3VtbWFyeTogU2Vzc2lvblN1bW1hcnksIHR1cm5zOiBUdXJuW10sIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGRyYWZ0PzogTWVzc2FnZTsgcmVhZG9ubHkgZGVmYXVsdENoYXRUaXRsZT86IHN0cmluZyB9KTogU2Vzc2lvblN0YXRlIHtcblx0XHRjb25zdCBrZXkgPSBzdW1tYXJ5LnJlc291cmNlO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gU2Vzc2lvbiBhbHJlYWR5IGV4aXN0cyAocmVzdG9yZSk6ICR7a2V5fWApO1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnN0YXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXNzaW9uU3RhdGUoc3VtbWFyeSksXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0fTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChrZXksIHRoaXMuX25ld0VudHJ5KHN0YXRlLCBzdW1tYXJ5KSk7XG5cdFx0dGhpcy5fZW5zdXJlRGVmYXVsdENoYXQoa2V5LCBzdW1tYXJ5LCB0dXJucywgb3B0aW9ucz8uZHJhZnQsIG9wdGlvbnM/LmRlZmF1bHRDaGF0VGl0bGUpO1xuXHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5hbm5vdW5jZShrZXksIHN1bW1hcnkpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gUmVzdG9yZWQgc2Vzc2lvbjogJHtrZXl9ICgke3R1cm5zLmxlbmd0aH0gdHVybnMpYCk7XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyB0aGUgZGVmYXVsdCB7QGxpbmsgQ2hhdFN0YXRlfSBmb3IgYSBzZXNzaW9uIGFuZCByZWNvcmRzIGl0IGFzXG5cdCAqIHRoZSBzZXNzaW9uJ3Mgc2luZ2xlIGNoYXQuIFZTIENvZGUgbW9kZWxzIGV2ZXJ5IHNlc3Npb24gYXMgaGF2aW5nXG5cdCAqIGV4YWN0bHkgb25lIGNoYXQgXHUyMDE0IGl0cyBkZWZhdWx0IGNoYXQgXHUyMDE0IHdob3NlIFVSSSBpcyBkZXJpdmVkXG5cdCAqIGRldGVybWluaXN0aWNhbGx5IGZyb20gdGhlIHNlc3Npb24gVVJJLiBUaGUgY2hhdCBpcyBzZWVkZWQgd2l0aCBhbnlcblx0ICogcHJlLXBvcHVsYXRlZCBgdHVybnNgICh1c2VkIGJ5IHtAbGluayByZXN0b3JlU2Vzc2lvbn0pLlxuXHQgKlxuXHQgKiBUaGUgc2Vzc2lvbidzIGBjaGF0c2AgY2F0YWxvZyBhbmQgYGRlZmF1bHRDaGF0YCBwb2ludGVyIGFyZSB1cGRhdGVkXG5cdCAqIGluIHBsYWNlIHJhdGhlciB0aGFuIHZpYSBkaXNwYXRjaGVkIGFjdGlvbnM6IHRoZXJlIGFyZSBubyBzdWJzY3JpYmVyc1xuXHQgKiBhdCBjcmVhdGlvbi9yZXN0b3JlIHRpbWUsIHNvIHRoZSBzbmFwc2hvdCBhIGNsaWVudCBsYXRlciByZWNlaXZlcyBvblxuXHQgKiBzdWJzY3JpYmUgYWxyZWFkeSByZWZsZWN0cyB0aGUgZGVmYXVsdCBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlRGVmYXVsdENoYXQoc2Vzc2lvbktleTogc3RyaW5nLCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSwgdHVybnM/OiBUdXJuW10sIGRyYWZ0PzogTWVzc2FnZSwgZGVmYXVsdENoYXRUaXRsZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25LZXkpO1xuXHRcdC8vIEVtcHR5IHRpdGxlIG1lYW5zIFwiaW5oZXJpdCB0aGUgc2Vzc2lvbiB0aXRsZVwiOyBhIHBlcnNpc3RlZCBpbmRlcGVuZGVudFxuXHRcdC8vIHJlbmFtZSAoYGRlZmF1bHRDaGF0VGl0bGVgKSBpcyBzZWVkZWQgYmFjayBoZXJlIHNvIGl0IHN1cnZpdmVzIHJlc3RvcmUuXG5cdFx0Y29uc3QgY2hhdFN1bW1hcnk6IENoYXRTdW1tYXJ5ID0geyAuLi5jcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnkoc3VtbWFyeSwgY2hhdFVyaSksIHRpdGxlOiBkZWZhdWx0Q2hhdFRpdGxlID8/ICcnIH07XG5cdFx0dGhpcy5fY2hhdFN0YXRlcy5zZXQoY2hhdFVyaSwgeyAuLi5jcmVhdGVDaGF0U3RhdGUoY2hhdFN1bW1hcnkpLCB0dXJuczogdHVybnMgPz8gW10sIGRyYWZ0IH0pO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbktleSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHQvLyBVcGRhdGUgdGhlIHNlc3Npb24ncyBjaGF0IGNhdGFsb2cgaW4gcGxhY2Ugc28gdGhlIG9iamVjdFxuXHRcdFx0Ly8gaWRlbnRpdHkgcmV0dXJuZWQgYnkgYGNyZWF0ZVNlc3Npb25gL2ByZXN0b3JlU2Vzc2lvbmAgc3RheXNcblx0XHRcdC8vIGxpdmUgaW4gdGhlIG1hcC4gQ2FsbGVycyAoZS5nLiBgQWdlbnRTZXJ2aWNlLmNyZWF0ZVNlc3Npb25gKVxuXHRcdFx0Ly8gbXV0YXRlIHRoZSByZXR1cm5lZCBzdGF0ZSBkaXJlY3RseSAoYHN0YXRlLmNvbmZpZyA9IFx1MjAyNmApLCBzb1xuXHRcdFx0Ly8gcmVwbGFjaW5nIHRoZSBtYXAgZW50cnkgd2l0aCBhIGZyZXNoIGNsb25lIGhlcmUgd291bGQgc3RyYW5kXG5cdFx0XHQvLyB0aG9zZSBtdXRhdGlvbnMgb24gYSBkZXRhY2hlZCBvYmplY3QuXG5cdFx0XHRlbnRyeS5zdGF0ZS5jaGF0cyA9IFtjaGF0U3VtbWFyeV07XG5cdFx0XHRlbnRyeS5zdGF0ZS5kZWZhdWx0Q2hhdCA9IGNoYXRVcmk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgYW4gYWRkaXRpb25hbCAobm9uLWRlZmF1bHQpIGNoYXQgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbi4gQ3JlYXRlc1xuXHQgKiB0aGUgY2hhdCdzIGF1dGhvcml0YXRpdmUge0BsaW5rIENoYXRTdGF0ZX0sIHJlZ2lzdGVycyBpdCBpbiB0aGUgc2Vzc2lvbidzXG5cdCAqIGNhdGFsb2cgdmlhIGEgZGlzcGF0Y2hlZCB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdEFkZGVkfSBhY3Rpb24gKHNvXG5cdCAqIGxpdmUgc3Vic2NyaWJlcnMgcmVmcmVzaCksIGFuZCByZXR1cm5zIHRoZSBuZXcgY2hhdCdzIHN1bW1hcnkuXG5cdCAqXG5cdCAqIFRoZSBjaGF0IGluaGVyaXRzIHRoZSBzZXNzaW9uJ3MgbW9kZWwvYWdlbnQvd29ya2luZy1kaXJlY3Rvcnkgc2NvcGUuIEl0XG5cdCAqIGlzIGEgbm8tb3AgKHJldHVybmluZyB0aGUgZXhpc3Rpbmcgc3VtbWFyeSkgd2hlbiBhIGNoYXQgd2l0aCB0aGUgc2FtZSBVUklcblx0ICogYWxyZWFkeSBleGlzdHMuXG5cdCAqXG5cdCAqIFdoZW4gYG9wdGlvbnMucHJvdmlkZXJEYXRhYCBpcyBzdXBwbGllZCBpdCBpcyByZWNvcmRlZCB2ZXJiYXRpbSBhcyB0aGVcblx0ICogcGVlciBjaGF0J3Mgb3BhcXVlLCBhZ2VudC1vd25lZCByZXN0b3JlIGJsb2IgKHNlZVxuXHQgKiB7QGxpbmsgZ2V0Q2hhdFByb3ZpZGVyRGF0YX0pOyB0aGUgU3RhdGVNYW5hZ2VyIG5ldmVyIHBhcnNlcyBpdC4gVGhlXG5cdCAqIGRlZmF1bHQgY2hhdCBuZXZlciBjYXJyaWVzIGBwcm92aWRlckRhdGFgLlxuXHQgKi9cblx0YWRkQ2hhdChzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7IHJlYWRvbmx5IHR1cm5zPzogVHVybltdOyByZWFkb25seSBvcmlnaW4/OiBDaGF0T3JpZ2luOyByZWFkb25seSBwcm92aWRlckRhdGE/OiBzdHJpbmc7IHJlYWRvbmx5IGludGVyYWN0aXZpdHk/OiBDaGF0SW50ZXJhY3Rpdml0eSB9KTogQ2hhdFN1bW1hcnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBhZGRDaGF0IGZvciB1bmtub3duIHNlc3Npb246ICR7c2Vzc2lvbn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IGVudHJ5LnN0YXRlO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gc2Vzc2lvblN0YXRlLmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBjaGF0VXJpKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHQvLyBBIHNlc3Npb24gZ2FpbnMgaXRzIGZpcnN0IGFkZGl0aW9uYWwgY2hhdCBoZXJlOiBzbmFwc2hvdCB0aGUgY3VycmVudFxuXHRcdC8vIHNlc3Npb24gdGl0bGUgb250byB0aGUgc3RpbGwtaW5oZXJpdGluZyBkZWZhdWx0IGNoYXQgc28gdGhlIHR3b1xuXHRcdC8vIHRpdGxlcyBiZWNvbWUgZnVsbHkgaW5kZXBlbmRlbnQuIFdpdGhvdXQgdGhpcyB0aGUgZGVmYXVsdCBjaGF0IGtlZXBzXG5cdFx0Ly8gYW4gZW1wdHkgdGl0bGUgKD0gaW5oZXJpdCB0aGUgc2Vzc2lvbiB0aXRsZSksIHNvIHJlbmFtaW5nIHRoZSBzZXNzaW9uXG5cdFx0Ly8gd291bGQgYWxzbyBtb3ZlIHRoZSBkZWZhdWx0IGNoYXQgdGFiIGFuZCB2aWNlLXZlcnNhLlxuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gc2Vzc2lvblN0YXRlLmRlZmF1bHRDaGF0ID8/IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbik7XG5cdFx0Y29uc3QgZGVmYXVsdEVudHJ5ID0gc2Vzc2lvblN0YXRlLmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0aWYgKGRlZmF1bHRFbnRyeSAmJiAhZGVmYXVsdEVudHJ5LnRpdGxlICYmIHNlc3Npb25TdGF0ZS50aXRsZSkge1xuXHRcdFx0dGhpcy51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvbiwgZGVmYXVsdENoYXRVcmksIHNlc3Npb25TdGF0ZS50aXRsZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFN1bW1hcnk6IENoYXRTdW1tYXJ5ID0ge1xuXHRcdFx0Li4uY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5KHRoaXMuX3RvU3VtbWFyeShzZXNzaW9uLCBlbnRyeSksIGNoYXRVcmkpLFxuXHRcdFx0dGl0bGU6IG9wdGlvbnM/LnRpdGxlID8/ICcnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRvcmlnaW46IG9wdGlvbnM/Lm9yaWdpbixcblx0XHRcdGludGVyYWN0aXZpdHk6IG9wdGlvbnM/LmludGVyYWN0aXZpdHksXG5cdFx0fTtcblx0XHR0aGlzLl9jaGF0U3RhdGVzLnNldChjaGF0VXJpLCB7IC4uLmNyZWF0ZUNoYXRTdGF0ZShjaGF0U3VtbWFyeSksIHR1cm5zOiBvcHRpb25zPy50dXJucyA/PyBbXSB9KTtcblx0XHRpZiAob3B0aW9ucz8ucHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2NoYXRQcm92aWRlckRhdGEuc2V0KGNoYXRVcmksIG9wdGlvbnMucHJvdmlkZXJEYXRhKTtcblx0XHR9XG5cdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRBZGRlZCwgc3VtbWFyeTogY2hhdFN1bW1hcnkgfSk7XG5cdFx0cmV0dXJuIGNoYXRTdW1tYXJ5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJlZ2lzdGVycyBhbiBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0IHdoZW4gYSBzZXNzaW9uIGlzXG5cdCAqIHJlc3RvcmVkIGZyb20gcGVyc2lzdGVudCBzdG9yYWdlLCBzZWVkaW5nIGl0cyB7QGxpbmsgQ2hhdFN0YXRlfSB3aXRoIHRoZVxuXHQgKiBzdXBwbGllZCB0dXJucy4gVW5saWtlIHtAbGluayBhZGRDaGF0fSB0aGlzIGRvZXMgbm90IHNuYXBzaG90IHRoZSBzZXNzaW9uXG5cdCAqIHRpdGxlIG9udG8gdGhlIGRlZmF1bHQgY2hhdCAodGhlIGRlZmF1bHQgY2hhdCdzIHBlcnNpc3RlZCB0aXRsZSBpc1xuXHQgKiByZXN0b3JlZCBpbmRlcGVuZGVudGx5KSBhbmQgaXQgc2VlZHMgaGlzdG9yeS4gVGhlIGNhdGFsb2cgZW50cnkgaXMgYWRkZWRcblx0ICogaW4gcGxhY2Ugc28gdGhlIG9iamVjdCBpZGVudGl0eSByZXR1cm5lZCBieSB7QGxpbmsgcmVzdG9yZVNlc3Npb259IHN0YXlzXG5cdCAqIGxpdmU7IG5vIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWR9IGlzIGRpc3BhdGNoZWQgYmVjYXVzZSByZXN0b3JlXG5cdCAqIHJ1bnMgYmVmb3JlIGNsaWVudHMgc3Vic2NyaWJlLlxuXHQgKlxuXHQgKiBXaGVuIGBvcHRpb25zLnByb3ZpZGVyRGF0YWAgaXMgc3VwcGxpZWQgaXQgaXMgcmVjb3JkZWQgdmVyYmF0aW0gYXMgdGhlXG5cdCAqIHBlZXIgY2hhdCdzIG9wYXF1ZSwgYWdlbnQtb3duZWQgcmVzdG9yZSBibG9iIChzZWVcblx0ICoge0BsaW5rIGdldENoYXRQcm92aWRlckRhdGF9KTsgdGhlIFN0YXRlTWFuYWdlciBuZXZlciBwYXJzZXMgaXQuXG5cdCAqL1xuXHRyZXN0b3JlQ2hhdChzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSwgb3B0aW9uczogeyByZWFkb25seSB0aXRsZT86IHN0cmluZzsgcmVhZG9ubHkgdHVybnM6IFR1cm5bXTsgcmVhZG9ubHkgZHJhZnQ/OiBNZXNzYWdlOyByZWFkb25seSBwcm92aWRlckRhdGE/OiBzdHJpbmc7IHJlYWRvbmx5IG9yaWdpbj86IENoYXRPcmlnaW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSByZXN0b3JlQ2hhdCBmb3IgdW5rbm93biBzZXNzaW9uOiAke3Nlc3Npb259YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IGVudHJ5LnN0YXRlO1xuXHRcdGlmIChzZXNzaW9uU3RhdGUuY2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UgPT09IGNoYXRVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRTdW1tYXJ5OiBDaGF0U3VtbWFyeSA9IHtcblx0XHRcdC4uLmNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeSh0aGlzLl90b1N1bW1hcnkoc2Vzc2lvbiwgZW50cnkpLCBjaGF0VXJpKSxcblx0XHRcdHRpdGxlOiBvcHRpb25zLnRpdGxlID8/ICcnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRvcmlnaW46IG9wdGlvbnMub3JpZ2luLFxuXHRcdH07XG5cdFx0dGhpcy5fY2hhdFN0YXRlcy5zZXQoY2hhdFVyaSwgeyAuLi5jcmVhdGVDaGF0U3RhdGUoY2hhdFN1bW1hcnkpLCB0dXJuczogb3B0aW9ucy50dXJucywgZHJhZnQ6IG9wdGlvbnMuZHJhZnQgfSk7XG5cdFx0aWYgKG9wdGlvbnMucHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2NoYXRQcm92aWRlckRhdGEuc2V0KGNoYXRVcmksIG9wdGlvbnMucHJvdmlkZXJEYXRhKTtcblx0XHR9XG5cdFx0c2Vzc2lvblN0YXRlLmNoYXRzID0gWy4uLnNlc3Npb25TdGF0ZS5jaGF0cywgY2hhdFN1bW1hcnldO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYW4gYWRkaXRpb25hbCBjaGF0IGZyb20gYSBzZXNzaW9uLiBEZWxldGVzIGl0c1xuXHQgKiB7QGxpbmsgQ2hhdFN0YXRlfSwgZGlzcGF0Y2hlcyB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdFJlbW92ZWR9LCBhbmRcblx0ICogXHUyMDE0IGlmIHRoZSByZW1vdmVkIGNoYXQgd2FzIHRoZSBkZWZhdWx0IFx1MjAxNCByZXBvaW50cyBgZGVmYXVsdENoYXRgIHRvIHRoZVxuXHQgKiBmaXJzdCByZW1haW5pbmcgY2hhdC4gVGhlIGRlZmF1bHQgY2hhdCBpdHNlbGYgY2Fubm90IGJlIHJlbW92ZWQgaW5cblx0ICogaXNvbGF0aW9uOyBpdCBsaXZlcyBhbmQgZGllcyB3aXRoIGl0cyBzZXNzaW9uLlxuXHQgKi9cblx0cmVtb3ZlQ2hhdChzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSB8fCAhZW50cnkuc3RhdGUuY2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UgPT09IGNoYXRVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IGVudHJ5LnN0YXRlO1xuXHRcdGlmIChjaGF0VXJpID09PSBzZXNzaW9uU3RhdGUuZGVmYXVsdENoYXQgfHwgaXNEZWZhdWx0Q2hhdFVyaShjaGF0VXJpKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSByZWZ1c2luZyB0byByZW1vdmUgZGVmYXVsdCBjaGF0OiAke2NoYXRVcml9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERyb3AgdGhlIGNoYXQgZnJvbSBpdHMgc2Vzc2lvbidzIGFjdGl2ZS10dXJuIHNldCBiZWZvcmUgZGVsZXRpbmcgaXRzXG5cdFx0Ly8gc3RhdGUuIEEgcGVlciBjaGF0IGNhbiBiZSByZW1vdmVkIHdoaWxlIGl0IHN0aWxsIGhhcyBhbiBhY3RpdmUgdHVybjtcblx0XHQvLyBiZWNhdXNlIGFjdGl2ZS10dXJuIHRyYWNraW5nIGlzIGRyaXZlbiBieSBjaGF0IHN0YXRlIHRyYW5zaXRpb25zLFxuXHRcdC8vIGRlbGV0aW5nIHRoZSBDaGF0U3RhdGUgaGVyZSB3aXRob3V0IHRoaXMgd291bGQgc3RyYW5kIHRoZSBjaGF0IFVSSSBpblxuXHRcdC8vIHRoZSBhY3RpdmUgc2V0IGZvcmV2ZXIsIGtlZXBpbmcgdGhlIHNlc3Npb24gcGVybWFuZW50bHkgXCJhY3RpdmVcIlxuXHRcdC8vIChhY3RpdmVTZXNzaW9ucyA+IDApIGFuZCBsZWF2aW5nIGNoYW5nZXNldCBvcGVyYXRpb25zIGRpc2FibGVkLlxuXHRcdHRoaXMuX3JlbW92ZUNoYXRBY3RpdmVUdXJuKHNlc3Npb24sIGNoYXRVcmkpO1xuXHRcdHRoaXMuX2NoYXRTdGF0ZXMuZGVsZXRlKGNoYXRVcmkpO1xuXHRcdHRoaXMuX2NoYXRQcm92aWRlckRhdGEuZGVsZXRlKGNoYXRVcmkpO1xuXHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DaGF0UmVtb3ZlZCwgY2hhdDogY2hhdFVyaSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5hbWVzIGEgc2luZ2xlIGNoYXQgd2l0aGluIGEgc2Vzc2lvbiBpbmRlcGVuZGVudGx5IG9mIHRoZSBzZXNzaW9uXG5cdCAqIHRpdGxlLiBVcGRhdGVzIHRoZSBjaGF0J3MgYXV0aG9yaXRhdGl2ZSB7QGxpbmsgQ2hhdFN0YXRlfSB0aXRsZSAoc29cblx0ICogbGF0ZXIgYGNoYXRTdW1tYXJ5RnJvbVN0YXRlYCBwcm9qZWN0aW9ucyBzdGF5IGNvbnNpc3RlbnQpIGFuZCBkaXNwYXRjaGVzXG5cdCAqIGEge0BsaW5rIEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkfSBzbyB0aGUgc2Vzc2lvbidzIGNhdGFsb2cgZW50cnkgYW5kXG5cdCAqIGxpdmUgc3Vic2NyaWJlcnMgcmVmbGVjdCB0aGUgbmV3IHRpdGxlLiBXb3JrcyBmb3IgdGhlIGRlZmF1bHQgY2hhdCB0b28gXHUyMDE0XG5cdCAqIGdpdmluZyBpdCBhIG5vbi1lbXB0eSB0aXRsZSB0aGF0IG5vIGxvbmdlciBpbmhlcml0cyB0aGUgc2Vzc2lvbiB0aXRsZS5cblx0ICovXG5cdHVwZGF0ZUNoYXRUaXRsZShzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHRoaXMuX2NoYXRTdGF0ZXMuZ2V0KGNoYXRVcmkpO1xuXHRcdGlmIChjaGF0U3RhdGUpIHtcblx0XHRcdHRoaXMuX2NoYXRTdGF0ZXMuc2V0KGNoYXRVcmksIHsgLi4uY2hhdFN0YXRlLCB0aXRsZSB9KTtcblx0XHR9XG5cdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkLCBjaGF0OiBjaGF0VXJpLCBjaGFuZ2VzOiB7IHRpdGxlIH0gfSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhIHNlc3Npb24gZnJvbSBpbi1tZW1vcnkgc3RhdGUgd2l0aG91dCBlbWl0dGluZyBhXG5cdCAqIHtAbGluayBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkfSBub3RpZmljYXRpb24uXG5cdCAqIFVzZSB7QGxpbmsgZGVsZXRlU2Vzc2lvbn0gd2hlbiB0aGUgc2Vzc2lvbiBpcyBiZWluZyBwZXJtYW5lbnRseSBkZWxldGVkXG5cdCAqIGFuZCBjbGllbnRzIG5lZWQgdG8gYmUgbm90aWZpZWQgb2YgaXRzIHJlbW92YWwuXG5cdCAqXG5cdCAqIEFueSBwZW5kaW5nIHN1bW1hcnkgY2hhbmdlIGlzIGZsdXNoZWQgc3luY2hyb25vdXNseSBiZWZvcmUgdGhlIHNlc3Npb24gaXNcblx0ICogdG9ybiBkb3duLCBzbyBjbGllbnRzIHJlY2VpdmUgdGhlIGZpbmFsIHN0YXR1cyAoZS5nLiBJZGxlIGFmdGVyIGEgdHVyblxuXHQgKiBjb21wbGV0ZXMpIGV2ZW4gd2hlbiB0aGUgc2Vzc2lvbiBpcyBldmljdGVkIGJlZm9yZSB0aGUgc2NoZWR1bGVyIGZpcmVzLlxuXHQgKiBBIHtAbGluayBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZH0gbm90aWZpY2F0aW9uIG1heSB0aGVyZWZvcmVcblx0ICogYmUgZW1pdHRlZCBhcyBhIHNpZGUtZWZmZWN0IG9mIHRoaXMgY2FsbC5cblx0ICpcblx0ICogUGVyLXNlc3Npb24gY2hhbmdlc2V0cyBhcmUgaW50ZW50aW9uYWxseSBOT1QgdG9ybiBkb3duIGhlcmU6IHRoaXMgbWV0aG9kXG5cdCAqIGlzIGFsc28gdXNlZCBhcyBhbiBpZGxlLWV2aWN0aW9uIChMUlUpIGhvb2sgKHNlZVxuXHQgKiBgQWdlbnRTZXJ2aWNlLl9tYXliZUV2aWN0SWRsZVNlc3Npb25gKSBhbmQgdGhlIHNlc3Npb24gbGlzdCB2aWV3IGtlZXBzIGFcblx0ICogY2hhbmdlc2V0IHN1YnNjcmlwdGlvbiBvcGVuIHBlciB2aXNpYmxlIHJvdyB0byByZW5kZXIgdGhlIGRpZmYgY2hpcC5cblx0ICogVGVhcmluZyBkb3duIG9uIGV2aWN0aW9uIHdvdWxkIGNsZWFyIHRoZSBjaGlwIG9uIHRoZSBsaXN0IHdoaWxlIHRoZSByb3dcblx0ICogaXMgc3RpbGwgb24gc2NyZWVuLiBQZXJtYW5lbnQtZGVsZXRlIHBhdGhzIChgZGVsZXRlU2Vzc2lvbmAsXG5cdCAqIGByZW1vdmVTdWJhZ2VudFNlc3Npb25zYCkgY2FsbCBgZGlzcG9zZVNlc3Npb25DaGFuZ2VzZXRzYCBleHBsaWNpdGx5XG5cdCAqIGJlZm9yZSBpbnZva2luZyBgcmVtb3ZlU2Vzc2lvbmAuXG5cdCAqL1xuXHRyZW1vdmVTZXNzaW9uKHNlc3Npb246IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZsdXNoIGFueSBwZW5kaW5nIHN1bW1hcnkgbm90aWZpY2F0aW9uIGJlZm9yZSB0ZWFyaW5nIGRvd24gc3RhdGUgc29cblx0XHQvLyB0aGF0IHRoZSBmaW5hbCBzdGF0dXMgKGUuZy4gSWRsZSkgcmVhY2hlcyBjbGllbnRzIGV2ZW4gaWYgdGhlIHNlc3Npb25cblx0XHQvLyBpcyBldmljdGVkIHdpdGhpbiB0aGUgc2NoZWR1bGVyJ3MgZGVib3VuY2Ugd2luZG93LlxuXHRcdGlmICh0aGlzLl9zdW1tYXJ5Tm90aWZpZXIuaXNEaXJ0eShzZXNzaW9uKSkge1xuXHRcdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLmZsdXNoKHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIGFjdGl2ZSB0dXJuIHRyYWNraW5nLiBXZSBtdXN0IGRpc3BhdGNoXG5cdFx0Ly8gYFJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWRgIGlmIHRoZSBjb3VudCBhY3R1YWxseSBjaGFuZ2VzIHNvIHRoYXRcblx0XHQvLyBkb3duc3RyZWFtIGNvbnN1bWVycyAoZS5nLiB0aGUgc2VydmVyIGxpZmV0aW1lIHRyYWNrZXIgZHJpdmluZ1xuXHRcdC8vIGAtLWVuYWJsZS1yZW1vdGUtYXV0by1zaHV0ZG93bmApIHJlbGVhc2UgdGhlaXIgaG9sZCBvbiB0aGUgcHJvY2Vzcy5cblx0XHQvLyBXaXRob3V0IHRoaXMsIGV2aWN0aW5nIGEgc2Vzc2lvbiB0aGF0IHN0aWxsIGhhcyBhbiBhY3RpdmUgdHVyblxuXHRcdC8vIHNpbGVudGx5IHN0cmFuZHMgdGhlIGFjdGl2ZS1zZXNzaW9ucyBjb3VudCBhYm92ZSB6ZXJvIGZvcmV2ZXIuXG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uZGVsZXRlKHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuLmZpcmUoeyBzZXNzaW9uLCBhY3RpdmU6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLnNpemUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVhciBkb3duIGV2ZXJ5IGNoYXQgb3duZWQgYnkgdGhlIHNlc3Npb24sIG5vdCBqdXN0IHRoZSBkZWZhdWx0XG5cdFx0Ly8gY2hhdDogYWRkaXRpb25hbCBwZWVyIGNoYXRzIGVhY2ggaG9sZCB0aGVpciBvd24gQ2hhdFN0YXRlLlxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBlbnRyeS5zdGF0ZS5jaGF0cykge1xuXHRcdFx0dGhpcy5fY2hhdFN0YXRlcy5kZWxldGUoY2hhdC5yZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9jaGF0UHJvdmlkZXJEYXRhLmRlbGV0ZShjaGF0LnJlc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fY2hhdFN0YXRlcy5kZWxldGUoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlcy5kZWxldGUoc2Vzc2lvbik7XG5cdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLnJlbW92ZShzZXNzaW9uKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBSZW1vdmVkIHNlc3Npb246ICR7c2Vzc2lvbn1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJtYW5lbnRseSBkZWxldGVzIGEgc2Vzc2lvbiBmcm9tIHN0YXRlIGFuZCBlbWl0cyBhXG5cdCAqIHtAbGluayBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkfSBub3RpZmljYXRpb24gc28gdGhhdCBjbGllbnRzXG5cdCAqIGtub3cgdGhlIHNlc3Npb24gaXMgbm8gbG9uZ2VyIGFjY2Vzc2libGUuXG5cdCAqXG5cdCAqIFNlc3Npb25zIHdob3NlIGNyZWF0aW9uIHdhcyBkZWZlcnJlZCB2aWFcblx0ICogYGNyZWF0ZVNlc3Npb24oeyBlbWl0Tm90aWZpY2F0aW9uOiBmYWxzZSB9KWAgYW5kIG5ldmVyIHBlcnNpc3RlZCB2aWFcblx0ICoge0BsaW5rIG1hcmtTZXNzaW9uUGVyc2lzdGVkfSBhcmUgcmVtb3ZlZCBzaWxlbnRseSBcdTIwMTQgbm8gY2xpZW50IGtub3dzXG5cdCAqIGFib3V0IHRoZW0sIHNvIGEgYFNlc3Npb25SZW1vdmVkYCB3b3VsZCBiZSBub2lzZSAob3Igd29yc2UsIHdvdWxkXG5cdCAqIGNhdXNlIGNsaWVudHMgdG8gZHJvcCBhIHNlc3Npb24gVVJJIHRoZXkgaGFkIGVhZ2VybHkgc3Vic2NyaWJlZCB0bykuXG5cdCAqL1xuXHRkZWxldGVTZXNzaW9uKHNlc3Npb246IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHdhc0Fubm91bmNlZCA9IHRoaXMuX3N1bW1hcnlOb3RpZmllci5pc0Fubm91bmNlZChzZXNzaW9uKTtcblx0XHQvLyBEcm9wIGFueSBwZW5kaW5nIHN1bW1hcnkgZGlmZjogdGhlIGZvcnRoY29taW5nIFNlc3Npb25SZW1vdmVkIG5vdGlmaWNhdGlvblxuXHRcdC8vIHN1cGVyc2VkZXMgaXQgYW5kIHdlIGRvbid0IHdhbnQgdG8gZW1pdCBzcHVyaW91cyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRcblx0XHQvLyBldmVudHMganVzdCBiZWZvcmUgdGhlIHNlc3Npb24gZGlzYXBwZWFycyBmcm9tIHRoZSBjbGllbnQncyB2aWV3LlxuXHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5jbGVhckRpcnR5KHNlc3Npb24pO1xuXHRcdC8vIFRlYXIgZG93biBwZXItc2Vzc2lvbiBjaGFuZ2VzZXRzIGZpcnN0IHNvIHN1YnNjcmliZXJzIHNlZSB0aGVcblx0XHQvLyBmaW5hbCBgY2hhbmdlc2V0L2NsZWFyZWRgIGVudmVsb3BlIGJlZm9yZSB0aGUgc2Vzc2lvbiBpdHNlbGYgZ29lc1xuXHRcdC8vIGF3YXkuIFRoZSBlbnZlbG9wZXMgZmxvdyB0aHJvdWdoIHRoZSBzYW1lIGVtaXR0ZXIgYXMgZXZlcnl0aGluZ1xuXHRcdC8vIGVsc2UsIHNvIGNhbGxlcnMgb2JzZXJ2aW5nIGBvbkRpZEVtaXRFbnZlbG9wZWAgZ2V0IGEgZGV0ZXJtaW5pc3RpY1xuXHRcdC8vIG9yZGVyOiBjaGFuZ2VzZXQvY2xlYXJlZCAocGVyIGNoYW5nZXNldCkgXHUyMTkyIHNlc3Npb24gcmVtb3ZhbC5cblx0XHR0aGlzLmRpc3Bvc2VTZXNzaW9uQ2hhbmdlc2V0cyhzZXNzaW9uKTtcblx0XHR0aGlzLmRpc3Bvc2VTZXNzaW9uQW5ub3RhdGlvbnMoc2Vzc2lvbik7XG5cdFx0dGhpcy5yZW1vdmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGlmICh3YXNBbm5vdW5jZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkRW1pdE5vdGlmaWNhdGlvbi5maXJlKHtcblx0XHRcdFx0dHlwZTogJ3Jvb3Qvc2Vzc2lvblJlbW92ZWQnLFxuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gU2Vzc2lvbiBtZXRhIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogUmVwbGFjZXMgYHN0YXRlLl9tZXRhYCBvbiBhIHNlc3Npb24gYnkgZGlzcGF0Y2hpbmcgYVxuXHQgKiB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uTWV0YUNoYW5nZWR9IGFjdGlvbiBzbyB0aGUgY2hhbmdlIGZsb3dzXG5cdCAqIHRocm91Z2ggdGhlIGFjdGlvbiBlbnZlbG9wZSAoYW5kIHRodXMgdG8gYWxsIGxpdmUgc3Vic2NyaWJlcnMpLlxuXHQgKlxuXHQgKiBUaGUgZnVsbCBgX21ldGFgIG9iamVjdCBpcyByZXBsYWNlZCAobm90IG1lcmdlZCkgc28gY2FsbGVycyBzdGF5IGluXG5cdCAqIGNvbnRyb2wgb2YgdGhlIGNvbnZlbnRpb24gZm9yIHRoZWlyIG93biBrZXlzOyB1c2UgdGhlIGB3aXRoU2Vzc2lvblh4eGBcblx0ICogaGVscGVycyBpbiBgc2Vzc2lvblN0YXRlLnRzYCB0byBjb21iaW5lIHNsb3RzLlxuXHQgKi9cblx0c2V0U2Vzc2lvbk1ldGEoc2Vzc2lvbjogVVJJLCBtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZCwgX21ldGE6IG1ldGEgfSk7XG5cdH1cblxuXHQvKipcblx0ICogU2VlZHMgb3IgcmVwbGFjZXMgYSBzZXNzaW9uJ3MgcmVzb2x2ZWQge0BsaW5rIFNlc3Npb25Db25maWdTdGF0ZX0gb24gdGhlXG5cdCAqIGxpdmUgc2Vzc2lvbiBzdGF0ZS4gVW5saWtlIG1pZC1zZXNzaW9uIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkfVxuXHQgKiB1cGRhdGVzICh3aGljaCBtZXJnZSB2YWx1ZXMgb250byBhbiBleGlzdGluZyBjb25maWcpLCB0aGlzIGVzdGFibGlzaGVzXG5cdCAqIHRoZSBpbml0aWFsIGNvbmZpZyBhbmQgaXMgdGhlcmVmb3JlIGFuIGluLXBsYWNlIG11dGF0aW9uIG9mIHRoZVxuXHQgKiBhdXRob3JpdGF0aXZlIHN0YXRlIG9iamVjdCBzbyB0aGUgdmFsdWUgaXMgcHJlc2VudCBpbiB0aGUgZmlyc3Qgc25hcHNob3Rcblx0ICogYSBzdWJzY3JpYmVyIHJlY2VpdmVzLiBVc2UgdGhpcyBmcm9tIGNyZWF0ZS9yZXN0b3JlIGZsb3dzIHdoZXJlIHRoZVxuXHQgKiBjb25maWcgaXMgcmVzb2x2ZWQgYXN5bmNocm9ub3VzbHkgYWZ0ZXIgdGhlIHNlc3Npb24gc3RhdGUgYWxyZWFkeSBleGlzdHNcblx0ICogaW4gdGhlIG1hcCBcdTIwMTQgcmVhZGluZyBiYWNrIHRocm91Z2gge0BsaW5rIGdldFNlc3Npb25TdGF0ZX0gd291bGQgcmV0dXJuIGFcblx0ICogZGV0YWNoZWQgY29tcG9zaXRlIGNvcHkgYW5kIHN0cmFuZGluZyB0aGUgbXV0YXRpb24gdGhlcmUuXG5cdCAqL1xuXHRzZXRTZXNzaW9uQ29uZmlnKHNlc3Npb246IFVSSSwgY29uZmlnOiBTZXNzaW9uQ29uZmlnU3RhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gc2V0U2Vzc2lvbkNvbmZpZzogdW5rbm93biBzZXNzaW9uICR7c2Vzc2lvbn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cnkuc3RhdGUuY29uZmlnID0gY29uZmlnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWRzIG9yIHJlcGxhY2VzIHRoZSBzZXNzaW9uJ3MgZWZmZWN0aXZlIGN1c3RvbWl6YXRpb25zIGRpcmVjdGx5IG9uIHRoZVxuXHQgKiBhdXRob3JpdGF0aXZlIGluLW1lbW9yeSBzdGF0ZS4gVXNlZCBieSBjcmVhdGUvcmVzdG9yZSBmbG93cyB0byBlbnN1cmUgdGhlXG5cdCAqIGZpcnN0IHNuYXBzaG90IGFscmVhZHkgY29udGFpbnMgY3VzdG9taXphdGlvbnMuXG5cdCAqL1xuXHRzZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvbjogVVJJLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIHNldFNlc3Npb25DdXN0b21pemF0aW9uczogdW5rbm93biBzZXNzaW9uICR7c2Vzc2lvbn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cnkuc3RhdGUuY3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucyA/IFsuLi5jdXN0b21pemF0aW9uc10gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyAtLS0tIENoYW5nZXNldCByZWdpc3RyeSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIHNlcnZlci1zaWRlIGNoYW5nZXNldCBzbyB0aGF0IHN1YnNjcmliZXJzIGNhbiBhdHRhY2ggdG8gaXRzXG5cdCAqIFVSSS4gVGhlIGNoYW5nZXNldCBpcyBjcmVhdGVkIHdpdGggdGhlIHN1cHBsaWVkIGluaXRpYWwgc3RhdHVzIChkZWZhdWx0XG5cdCAqIHtAbGluayBDaGFuZ2VzZXRTdGF0dXMuQ29tcHV0aW5nfSk7IHN1YnNlcXVlbnQgZmlsZS9vcGVyYXRpb24vc3RhdHVzXG5cdCAqIG11dGF0aW9ucyBmbG93IHRocm91Z2gge0BsaW5rIGRpc3BhdGNoQ2hhbmdlc2V0QWN0aW9ufSBvbiB0aGVcblx0ICogY2Fub25pY2FsIGA8c2Vzc2lvblVyaT4vY2hhbmdlc2V0LzxjaGFuZ2VzZXRJZD5gIFVSSS5cblx0ICpcblx0ICogSWRlbXBvdGVudDogYSBzZWNvbmQgY2FsbCB3aXRoIHRoZSBzYW1lIFVSSSBpcyBhIG5vLW9wIHNvIHByb2R1Y2Vyc1xuXHQgKiBjYW4gc2FmZWx5IHJlLXJlZ2lzdGVyIG9uIHNlc3Npb24gcmVzdW1lIHdpdGhvdXQgZG91YmxlLWNyZWF0aW5nXG5cdCAqIHN0YXRlLlxuXHQgKlxuXHQgKiBDYWxsZXJzIGNvbnN0cnVjdCBgY2hhbmdlc2V0VXJpYCB2aWEge0BsaW5rIGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaX1cblx0ICogZm9yIHRoZSBzZXNzaW9uLXdpZGUgZW50cnksIG9yIHtAbGluayBidWlsZENoYW5nZXNldFVyaX0gZm9yIGFueVxuXHQgKiBvdGhlciBjYXRhbG9ndWUgZW50cnkuXG5cdCAqXG5cdCAqIFJldHVybnMgdGhlIHN1cHBsaWVkIGNoYW5nZXNldCBVUkkgZm9yIGNhbGxlciBjb252ZW5pZW5jZS5cblx0ICovXG5cdHJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaTogVVJJLCBpbml0aWFsU3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMgPSBDaGFuZ2VzZXRTdGF0dXMuQ29tcHV0aW5nKTogVVJJIHtcblx0XHR0aGlzLl9jaGFuZ2VzZXRzLnJlZ2lzdGVyKGNoYW5nZXNldFVyaSwgaW5pdGlhbFN0YXR1cyk7XG5cdFx0cmV0dXJuIGNoYW5nZXNldFVyaTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBhZ2dyZWdhdGUgYGNoYW5nZXNgIGZvciBhIHNlc3Npb24uXG5cdCAqXG5cdCAqIFRoZXJlIGlzIG5vIGRlZGljYXRlZCBhY3Rpb24gZm9yIHRoaXMgZmllbGQ6IHRoZSB2YWx1ZSBpcyBwdXJlbHlcblx0ICogaW5mb3JtYXRpb25hbCAoY2hpcCByZW5kZXJpbmcgb24gdGhlIHNlc3Npb24gbGlzdCksIHNvIHRoZSB3cml0ZVxuXHQgKiBwaWdneWJhY2tzIG9uIHRoZSBleGlzdGluZyBgc2Vzc2lvblN1bW1hcnlDaGFuZ2VkYCBub3RpZmljYXRpb25cblx0ICogcGF0aC4gV2UgdXBkYXRlIHRoZSBzZXNzaW9uIGVudHJ5LCBtYXJrIHRoZSBzZXNzaW9uIGRpcnR5LCBhbmQgbGV0XG5cdCAqIHRoZSBzdW1tYXJ5IG5vdGlmaWVyJ3MgZmx1c2ggcGljayB0aGUgbmV3IHZhbHVlIHVwIHZpYSBpdHNcblx0ICogYGN1cnJlbnQuY2hhbmdlcyAhPT0gbGFzdE5vdGlmaWVkLmNoYW5nZXNgIGRpZmYuXG5cdCAqL1xuXHRzZXRTZXNzaW9uU3VtbWFyeUNoYW5nZXMoc2Vzc2lvbjogVVJJLCBjaGFuZ2VzOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBzZXRTZXNzaW9uU3VtbWFyeUNoYW5nZXM6IHVua25vd24gc2Vzc2lvbiAke3Nlc3Npb259YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzdHJ1Y3R1cmFsRXF1YWxzKGVudHJ5LmNoYW5nZXMsIGNoYW5nZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZW50cnkuY2hhbmdlcyA9IGNoYW5nZXM7XG5cblx0XHR0aGlzLl9zdW1tYXJ5Tm90aWZpZXIubWFya0RpcnR5KHNlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2VzIHRoZSBjYXRhbG9ndWUgZW50cmllcyBvbiBgc3RhdGUuY2hhbmdlc2V0c2AgZm9yIGBzZXNzaW9uYCBieVxuXHQgKiBkaXNwYXRjaGluZyBhIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZH0gYWN0aW9uLlxuXHQgKiBTdWJzY3JpYmVycyBzZWUgdGhlIG11dGF0aW9uIGluIHRoZSBzdGFuZGFyZCBzZXNzaW9uIGFjdGlvbiBzdHJlYW0gXHUyMDE0XG5cdCAqIHRoZSBjYXRhbG9ndWUgbGl2ZXMgb24gc2Vzc2lvbiBzdGF0ZSBhbmQgaXMgbm90IGl0cyBvd24gc3Vic2NyaWJhYmxlXG5cdCAqIHJlc291cmNlLiBBZ2dyZWdhdGUgYGNoYW5nZXNgIGNvdW50cyAoYWRkaXRpb25zIC8gZGVsZXRpb25zIC9cblx0ICogZmlsZXMpIGFyZSBwcm9wYWdhdGVkIHNlcGFyYXRlbHkgdmlhIHtAbGluayBzZXRTZXNzaW9uU3VtbWFyeUNoYW5nZXN9LlxuXHQgKlxuXHQgKiBQcm9kdWNlcnMgY2FsbCB0aGlzIGFmdGVyIGVhY2ggY29tcHV0ZSBwYXNzIHRvIGtlZXAgdGhlIGxpc3Qgb2Zcblx0ICogYXZhaWxhYmxlIGNoYW5nZXNldHMgKHdpdGggdGhlaXIgYGNoYW5nZUtpbmRgKSBpbiBzeW5jIHNvIG9ic2VydmVyc1xuXHQgKiBjYW4gcmVuZGVyIHRoZSBjb3JyZWN0IGVudHJpZXMgd2l0aG91dCBzdWJzY3JpYmluZyB0byBlYWNoIG9uZS5cblx0ICovXG5cdHNldFNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb246IFVSSSwgY2hhbmdlc2V0czogcmVhZG9ubHkgQ2hhbmdlc2V0W10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gc2V0U2Vzc2lvbkNoYW5nZXNldHM6IHVua25vd24gc2Vzc2lvbiAke3Nlc3Npb259YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gZW50cnkuc3RhdGU7XG5cblx0XHQvLyBTa2lwIGRpc3BhdGNoIHdoZW4gdGhlIGNhdGFsb2d1ZSBpcyBmaWVsZC1lcXVhbCB0byB0aGUgZXhpc3Rpbmcgb25lLlxuXHRcdC8vIFByb2R1Y2VycyBjYWxsIHRoaXMgYWZ0ZXIgZXZlcnkgY29tcHV0ZSBwYXNzLCBzbyBkdXBsaWNhdGUgY2FsbHNcblx0XHQvLyBhcmUgY29tbW9uIGFuZCB3b3VsZCBvdGhlcndpc2UgYnJvYWRjYXN0IGEgcmVkdW5kYW50IGVudmVsb3BlIHRvXG5cdFx0Ly8gZXZlcnkgc3Vic2NyaWJlci5cblx0XHRpZiAoYXJyYXlFcXVhbHMoc3RhdGUuY2hhbmdlc2V0cyA/PyBbXSwgY2hhbmdlc2V0cyA/PyBbXSwgc3RydWN0dXJhbEVxdWFscykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGFrZSBhIGRlZmVuc2l2ZSBjb3B5IHNvIGNhbGxlcnMgY2FuJ3QgbXV0YXRlIHRoZSBjYXRhbG9ndWUgYXJyYXlcblx0XHQvLyBhZnRlciBkaXNwYXRjaDsgdGhlIHJlZHVjZXIgb3RoZXJ3aXNlIHN0b3JlcyB0aGUgcmVmZXJlbmNlIGFzLWlzLlxuXHRcdGNvbnN0IG5leHQgPSBjaGFuZ2VzZXRzID8gY2hhbmdlc2V0cy5zbGljZSgpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ2hhbmdlc2V0c0NoYW5nZWQsXG5cdFx0XHRjaGFuZ2VzZXRzOiBuZXh0LFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlYXIgZG93biBhIGNoYW5nZXNldC4gRGlzcGF0Y2hlcyB7QGxpbmsgQWN0aW9uVHlwZS5DaGFuZ2VzZXRDbGVhcmVkfVxuXHQgKiBzbyBzdWJzY3JpYmVycyBzZWUgYW4gZW1wdHkgZmlsZSBsaXN0LCB0aGVuIGRlbGV0ZXMgdGhlIGxvY2FsIHN0YXRlXG5cdCAqIHNvIGEgZnJlc2ggYGdldENoYW5nZXNldFN0YXRlYCByZXR1cm5zIGB1bmRlZmluZWRgIGFuZCBmb3JjZXMgdGhlXG5cdCAqIHByb2R1Y2VyIHRvIHJlLWNyZWF0ZSB0aGUgY2hhbmdlc2V0IG9uIG5leHQgc3Vic2NyaWJlLlxuXHQgKlxuXHQgKiBQZXIgdGhlIHNwZWMsIHRoZSBzZXJ2ZXIgU0hPVUxEIGFsc28gdW5zdWJzY3JpYmUgaXRzIGNsaWVudHMgYWZ0ZXJcblx0ICogZGlzcGF0Y2hpbmcgdGhpcyBhY3Rpb247IGZvciBWUyBDb2RlLWludGVybmFsIGNsaWVudHMgdGhhdCBoYXBwZW5zXG5cdCAqIHZpYSB0aGUgYG5vdGlmeS9zZXNzaW9uUmVtb3ZlZGAgbm90aWZpY2F0aW9uLCB3aGljaCB0aGUgd29ya2JlbmNoLXNpZGVcblx0ICogcHJvdmlkZXIgY29ycmVsYXRlcyB0byByZWxlYXNlIGFueSBoZWxkIHN1YnNjcmlwdGlvbnMuXG5cdCAqXG5cdCAqIFNhZmUgdG8gY2FsbCBmb3IgYSBVUkkgdGhhdCB3YXMgbmV2ZXIgcmVnaXN0ZXJlZDogcHJvZHVjZXJzIHR5cGljYWxseVxuXHQgKiBpdGVyYXRlIG92ZXIgYSBjYW5kaWRhdGUgc2V0IG9uIHNlc3Npb24gZGlzcG9zYWwgYW5kIGVtaXQgZGlzcG9zZVxuXHQgKiBhY3Rpb25zIGRlZmVuc2l2ZWx5LlxuXHQgKi9cblx0ZGlzcG9zZUNoYW5nZXNldChjaGFuZ2VzZXQ6IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2hhbmdlc2V0cy5oYXMoY2hhbmdlc2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldCwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRDbGVhcmVkLFxuXHRcdH0pO1xuXHRcdHRoaXMuX2NoYW5nZXNldHMuZGVsZXRlKGNoYW5nZXNldCk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZXMgZXZlcnkgY2hhbmdlc2V0IHdob3NlIFVSSSBpcyBuZXN0ZWQgdW5kZXIgYHNlc3Npb25gIChpLmUuXG5cdCAqIG1hdGNoZXMgYDxzZXNzaW9uPi9jaGFuZ2VzZXQvLi4uYCkuIFVzZWQgdG8gY2FzY2FkZSBjbGVhbnVwIHdoZW4gYVxuXHQgKiBzZXNzaW9uIGl0c2VsZiBpcyByZW1vdmVkLlxuXHQgKi9cblx0ZGlzcG9zZVNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb246IFVSSSk6IHZvaWQge1xuXHRcdC8vIENvbGxlY3QgZmlyc3QgYmVjYXVzZSBgZGlzcG9zZUNoYW5nZXNldGAgbXV0YXRlcyB0aGUgdW5kZXJseWluZ1xuXHRcdC8vIG1hcCB2aWEgaXRzIGVudmVsb3BlIGhhbmRsZXIuXG5cdFx0Y29uc3QgdG9EaXNwb3NlOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHRoaXMuX2NoYW5nZXNldHMua2V5cygpKSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYW5nZXNldFVyaSh1cmkpO1xuXHRcdFx0aWYgKHBhcnNlZCAmJiBwYXJzZWQuc2Vzc2lvblVyaSA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHR0b0Rpc3Bvc2UucHVzaCh1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0b0Rpc3Bvc2UpIHtcblx0XHRcdHRoaXMuZGlzcG9zZUNoYW5nZXNldCh1cmkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wcyB0aGUgYW5ub3RhdGlvbiBzdGF0ZSBuZXN0ZWQgdW5kZXIgYHNlc3Npb25gIChpLmUuIHRoZVxuXHQgKiBgPHNlc3Npb24+L2Fubm90YXRpb25zYCBjaGFubmVsKS4gVXNlZCB0byBjYXNjYWRlIGNsZWFudXAgd2hlbiBhXG5cdCAqIHNlc3Npb24gaXRzZWxmIGlzIHJlbW92ZWQuIFN1YnNjcmlwdGlvbnMgYXJlIHJlbGVhc2VkIHZpYSB0aGVcblx0ICogZm9ydGhjb21pbmcgYHNlc3Npb25SZW1vdmVkYCBub3RpZmljYXRpb24uXG5cdCAqL1xuXHRkaXNwb3NlU2Vzc2lvbkFubm90YXRpb25zKHNlc3Npb246IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2Fubm90YXRpb25zLmRlbGV0ZShidWlsZEFubm90YXRpb25zVXJpKHNlc3Npb24pKTtcblx0fVxuXG5cdC8vIC0tLS0gVHVybiB0cmFja2luZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgbWFwcGluZyBmcm9tIHR1cm5JZCB0byBzZXNzaW9uIFVSSSBzbyB0aGF0IGluY29taW5nXG5cdCAqIHByb3ZpZGVyIGV2ZW50cyAod2hpY2ggY2Fycnkgb25seSBzZXNzaW9uIFVSSSkgY2FuIGJlIGFzc29jaWF0ZWRcblx0ICogd2l0aCB0aGUgY29ycmVjdCBhY3RpdmUgdHVybi5cblx0ICovXG5cdGdldEFjdGl2ZVR1cm5JZChzZXNzaW9uT3JDaGF0OiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBpc0FocENoYXRDaGFubmVsKHNlc3Npb25PckNoYXQpID8gc2Vzc2lvbk9yQ2hhdCA6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbk9yQ2hhdCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRTdGF0ZXMuZ2V0KGNoYXRVcmkpPy5hY3RpdmVUdXJuPy5pZDtcblx0fVxuXG5cdC8vIC0tLS0gQWN0aW9uIGRpc3BhdGNoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogRGlzcGF0Y2ggYSBzZXJ2ZXItb3JpZ2luYXRlZCBhY3Rpb24gKGZyb20gdGhlIGFnZW50IGJhY2tlbmQpLlxuXHQgKiBUaGUgYWN0aW9uIGlzIGFwcGxpZWQgdG8gc3RhdGUgdmlhIHRoZSByZWR1Y2VyIGFuZCBlbWl0dGVkIGFzIGFuXG5cdCAqIGVudmVsb3BlIHdpdGggbm8gb3JpZ2luIChzZXJ2ZXItcHJvZHVjZWQpLlxuXHQgKlxuXHQgKiBgY2hhbm5lbGAgaWRlbnRpZmllcyB0aGUgY2hhbm5lbCB0aGUgYWN0aW9uIHRhcmdldHMgXHUyMDE0IGBST09UX1NUQVRFX1VSSWBcblx0ICogZm9yIHJvb3QgYWN0aW9ucywgYSBzZXNzaW9uIFVSSSBmb3Igc2Vzc2lvbiBhY3Rpb25zLCBhIHRlcm1pbmFsIFVSSVxuXHQgKiBmb3IgdGVybWluYWwgYWN0aW9ucywgYW4gZXhwYW5kZWQgY2hhbmdlc2V0IFVSSSBmb3IgY2hhbmdlc2V0IGFjdGlvbnMuXG5cdCAqL1xuXHRkaXNwYXRjaFNlcnZlckFjdGlvbihjaGFubmVsOiBVUkksIGFjdGlvbjogU3RhdGVBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9hcHBseUFuZEVtaXQoY2hhbm5lbCwgYWN0aW9uLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgY2xpZW50LW9yaWdpbmF0ZWQgYWN0aW9uICh3cml0ZS1haGVhZCBmcm9tIGEgcmVuZGVyZXIpLlxuXHQgKiBUaGUgYWN0aW9uIGlzIGFwcGxpZWQgdG8gc3RhdGUgYW5kIGVtaXR0ZWQgd2l0aCB0aGUgY2xpZW50J3Mgb3JpZ2luXG5cdCAqIHNvIHRoZSBvcmlnaW5hdGluZyBjbGllbnQgY2FuIHJlY29uY2lsZS5cblx0ICovXG5cdGRpc3BhdGNoQ2xpZW50QWN0aW9uKGNoYW5uZWw6IFVSSSwgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIG9yaWdpbjogQWN0aW9uT3JpZ2luKTogdW5rbm93biB7XG5cdFx0cmV0dXJuIHRoaXMuX2FwcGx5QW5kRW1pdChjaGFubmVsLCBhY3Rpb24sIG9yaWdpbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVqZWN0IGEgY2xpZW50LW9yaWdpbmF0ZWQgYWN0aW9uIHdpdGhvdXQgYXBwbHlpbmcgaXQgdG8gc3RhdGUuIEVtaXRzIGFuXG5cdCAqIHtAbGluayBBY3Rpb25FbnZlbG9wZX0gdGhhdCBjYXJyaWVzIHRoZSBvcmlnaW5hbCB7QGxpbmsgQWN0aW9uT3JpZ2lufSBhbmQgYVxuXHQgKiB7QGxpbmsgQWN0aW9uRW52ZWxvcGUucmVqZWN0aW9uUmVhc29uIHwgcmVqZWN0aW9uUmVhc29ufSBzbyB0aGUgb3JpZ2luYXRpbmdcblx0ICogY2xpZW50IGNhbiByZWNvbmNpbGUgKHJvbGwgYmFjaykgaXRzIG9wdGltaXN0aWMgd3JpdGUtYWhlYWQgYWN0aW9uIHRocm91Z2hcblx0ICogdGhlIG5vcm1hbCBwYXRoIGluc3RlYWQgb2YgbGVhdmluZyBpdCBwZW5kaW5nIHVudGlsIHJlY29ubmVjdC4gVGhlIHJlZHVjZXJcblx0ICogaXMgZGVsaWJlcmF0ZWx5IE5PVCBydW4sIHNvIG5vIHN5bmNocm9uaXplZCBzdGF0ZSBjaGFuZ2VzLlxuXHQgKi9cblx0cmVqZWN0Q2xpZW50QWN0aW9uKGNoYW5uZWw6IFVSSSwgYWN0aW9uOiBTdGF0ZUFjdGlvbiwgb3JpZ2luOiBBY3Rpb25PcmlnaW4sIHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlID0ge1xuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdGFjdGlvbixcblx0XHRcdHNlcnZlclNlcTogKyt0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0XHRvcmlnaW4sXG5cdFx0XHRyZWplY3Rpb25SZWFzb246IHJlYXNvbixcblx0XHR9O1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIEVtaXR0aW5nIHJlamVjdGlvbiBlbnZlbG9wZTogc2VxPSR7ZW52ZWxvcGUuc2VydmVyU2VxfSwgY2hhbm5lbD0ke2VudmVsb3BlLmNoYW5uZWx9LCB0eXBlPSR7YWN0aW9uLnR5cGV9LCBvcmlnaW49JHtvcmlnaW4uY2xpZW50SWR9OiR7b3JpZ2luLmNsaWVudFNlcX0sIHJlYXNvbj0ke3JlYXNvbn1gKTtcblx0XHR0aGlzLl9vbkRpZEVtaXRFbnZlbG9wZS5maXJlKGVudmVsb3BlKTtcblx0fVxuXG5cdC8vIC0tLS0gSW50ZXJuYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9hcHBseUFuZEVtaXQoY2hhbm5lbDogVVJJLCBhY3Rpb246IFN0YXRlQWN0aW9uLCBvcmlnaW46IEFjdGlvbk9yaWdpbiB8IHVuZGVmaW5lZCk6IHVua25vd24ge1xuXHRcdGxldCByZXN1bHRpbmdTdGF0ZTogdW5rbm93biA9IHVuZGVmaW5lZDtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQgJiYgYWN0aW9uLnJlcGxhY2UpIHtcblx0XHRcdGFjdGlvbiA9IHtcblx0XHRcdFx0Li4uYWN0aW9uLFxuXHRcdFx0XHRjb25maWc6IHByZXNlcnZlUHJvdmlkZXJCYWNrZWRSb290Q29uZmlnVmFsdWVzKHRoaXMuX3Jvb3RTdGF0ZSwgYWN0aW9uLmNvbmZpZyksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHQvLyBBcHBseSB0byBzdGF0ZVxuXHRcdGlmIChpc1Jvb3RBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0Ly8gYFJvb3RDb25maWdDaGFuZ2VkYCBjYW4gYmUgYSB0cnVlIG5vLW9wOiB0aGUgcmVkdWNlciBtZXJnZXMvcmVwbGFjZXNcblx0XHRcdC8vIHZhbHVlcyBldmVuIHdoZW4gdGhlIHBhdGNoIG1hdGNoZXMgdGhlIGN1cnJlbnQgc3RhdGUsIGFuZCByZS1lbWl0dGluZ1xuXHRcdFx0Ly8gaXQgd291bGQgY2F1c2UgY2xpZW50cyBvYnNlcnZpbmcgcm9vdFN0YXRlLm9uRGlkQ2hhbmdlIHRvIHJlYWN0IGFuZFxuXHRcdFx0Ly8gcG90ZW50aWFsbHkgcmUtZGlzcGF0Y2ggaW4gYSBsb29wLiBDaGVjayB0aGUgYWN0aW9uJ3Mgb3duIHBhdGNoXG5cdFx0XHQvLyBhZ2FpbnN0IGN1cnJlbnQgdmFsdWVzIGJlZm9yZSBydW5uaW5nIHRoZSByZWR1Y2VyIHNvIHdlIGF2b2lkXG5cdFx0XHQvLyBhbGxvY2F0aW5nIGEgbmV3IHN0YXRlIG9iamVjdCBhdCBhbGwuXG5cdFx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQgJiYgdGhpcy5fcm9vdFN0YXRlLmNvbmZpZykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcm9vdFN0YXRlLmNvbmZpZy52YWx1ZXM7XG5cdFx0XHRcdGNvbnN0IHBhdGNoID0gYWN0aW9uLmNvbmZpZztcblx0XHRcdFx0Y29uc3QgaXNOb09wID0gYWN0aW9uLnJlcGxhY2Vcblx0XHRcdFx0XHQ/IGVxdWFscyhjdXJyZW50LCBwYXRjaClcblx0XHRcdFx0XHQ6IGVxdWFscyh7IC4uLmN1cnJlbnQsIC4uLnBhdGNoIH0sIGN1cnJlbnQpO1xuXHRcdFx0XHRpZiAoaXNOb09wKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jvb3RTdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcm9vdFN0YXRlID0gcm9vdFJlZHVjZXIodGhpcy5fcm9vdFN0YXRlLCBhY3Rpb24gYXMgUm9vdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdHJlc3VsdGluZ1N0YXRlID0gdGhpcy5fcm9vdFN0YXRlO1xuXHRcdH1cblxuXHRcdGlmIChpc1Nlc3Npb25BY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkFjdGlvbiA9IGFjdGlvbiBhcyBTZXNzaW9uQWN0aW9uO1xuXHRcdFx0Y29uc3Qga2V5ID0gY2hhbm5lbDtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoa2V5KTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c1N0YXRlID0gZW50cnkuc3RhdGU7XG5cdFx0XHRcdGNvbnN0IG5ld1N0YXRlID0gc2Vzc2lvblJlZHVjZXIocHJldmlvdXNTdGF0ZSwgc2Vzc2lvbkFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeUNoYW5nZWQgPSAhdGhpcy5fc3VtbWFyeUZpZWxkc0VxdWFsKHByZXZpb3VzU3RhdGUsIG5ld1N0YXRlKTtcblx0XHRcdFx0ZW50cnkuc3RhdGUgPSBuZXdTdGF0ZTtcblxuXHRcdFx0XHRpZiAocHJldmlvdXNTdGF0ZS50aXRsZSAhPT0gbmV3U3RhdGUudGl0bGUpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UaXRsZS5maXJlKHsgc2Vzc2lvbjoga2V5LCB0aXRsZTogbmV3U3RhdGUudGl0bGUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXaGVuIHRoZSByZWR1Y2VyIHRvdWNoZWQgYSBzdW1tYXJ5LXJlbGV2YW50IGZpZWxkLCBub3RpZnlcblx0XHRcdFx0Ly8gcm9vdC1jaGFubmVsIGNsaWVudHMgb2YgdGhlIGRlcml2ZWQtc3VtbWFyeSBkZWx0YS5cblx0XHRcdFx0aWYgKHN1bW1hcnlDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLm1hcmtEaXJ0eShrZXkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0aW5nU3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdH0gZWxzZSBpZiAoIWlzQWhwQ2hhdENoYW5uZWwoa2V5KSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIEFjdGlvbiBmb3IgdW5rbm93biBzZXNzaW9uOiAke2tleX0sIHR5cGU9JHthY3Rpb24udHlwZX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNDaGF0QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGlmICghaXNBaHBDaGF0Q2hhbm5lbChjaGFubmVsKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIENoYXQgYWN0aW9uIGRpc3BhdGNoZWQgdG8gbm9uLWNoYXQgY2hhbm5lbDogJHtjaGFubmVsfSwgdHlwZT0ke2FjdGlvbi50eXBlfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGF0QWN0aW9uID0gYWN0aW9uIGFzIENoYXRBY3Rpb247XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGFubmVsKTtcblx0XHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9jaGF0U3RhdGVzLmdldChjaGFubmVsKTtcblx0XHRcdGlmIChjaGF0ICYmIHNlc3Npb25LZXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBuZXdDaGF0ID0gY2hhdFJlZHVjZXIoY2hhdCwgY2hhdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdFx0dGhpcy5fY2hhdFN0YXRlcy5zZXQoY2hhbm5lbCwgbmV3Q2hhdCk7XG5cdFx0XHRcdHRoaXMuX29uQ2hhdFN0YXRlQ2hhbmdlZChzZXNzaW9uS2V5LCBjaGFubmVsLCBjaGF0LCBuZXdDaGF0KTtcblx0XHRcdFx0cmVzdWx0aW5nU3RhdGUgPSBuZXdDaGF0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBBY3Rpb24gZm9yIHVua25vd24gY2hhdDogJHtjaGFubmVsfSwgdHlwZT0ke2FjdGlvbi50eXBlfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc0NoYW5nZXNldEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRBY3Rpb24gPSBhY3Rpb24gYXMgQ2hhbmdlc2V0QWN0aW9uO1xuXHRcdFx0Y29uc3Qga2V5ID0gY2hhbm5lbDtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fY2hhbmdlc2V0cy5nZXQoa2V5KTtcblx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0Ly8gVW5rbm93biBjaGFuZ2VzZXQ6IGxvZyBhbmQgYmFpbCBiZWZvcmUgZW52ZWxvcGUgY3JlYXRpb24uXG5cdFx0XHRcdC8vIFJvdXRpbmcgdGhlIGFjdGlvbiB0byBzdWJzY3JpYmVycyAoSXNzdWUgMSkgbWFrZXNcblx0XHRcdFx0Ly8gb3JwaGFuIGVudmVsb3BlcyBjbGllbnQtdmlzaWJsZSwgc28gd2UgbXVzdCBkcm9wIHRoZW1cblx0XHRcdFx0Ly8gaGVyZSByYXRoZXIgdGhhbiBsZXR0aW5nIHRoZW0gYWR2YW5jZSBgX3NlcnZlclNlcWAuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gQWN0aW9uIGZvciB1bmtub3duIGNoYW5nZXNldDogJHtrZXl9LCB0eXBlPSR7YWN0aW9uLnR5cGV9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXdTdGF0ZSA9IGNoYW5nZXNldFJlZHVjZXIoc3RhdGUsIGNoYW5nZXNldEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdGlmIChuZXdTdGF0ZSAhPT0gc3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlc2V0cy5zZXQoa2V5LCBuZXdTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHRpbmdTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdH1cblxuXHRcdGlmIChpc0Fubm90YXRpb25zQWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGNvbnN0IGFubm90YXRpb25zQWN0aW9uID0gYWN0aW9uIGFzIEFubm90YXRpb25zQWN0aW9uO1xuXHRcdFx0Y29uc3Qga2V5ID0gY2hhbm5lbDtcblx0XHRcdC8vIEFubm90YXRpb25zIGFyZSBjbGllbnQtZGlzcGF0Y2hhYmxlIGFuZCBsYXppbHkgY3JlYXRlZDogc2VlZCBhblxuXHRcdFx0Ly8gZW1wdHkgc3RhdGUgb24gZmlyc3Qgd3JpdGUgcmF0aGVyIHRoYW4gZHJvcHBpbmcgdGhlIGFjdGlvbi5cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fYW5ub3RhdGlvbnMuZ2V0KGtleSkgPz8geyBhbm5vdGF0aW9uczogW10gfTtcblx0XHRcdGNvbnN0IG5ld1N0YXRlID0gYW5ub3RhdGlvbnNSZWR1Y2VyKHN0YXRlLCBhbm5vdGF0aW9uc0FjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdGlmIChuZXdTdGF0ZSAhPT0gc3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fYW5ub3RhdGlvbnMuc2V0KGtleSwgbmV3U3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0aW5nU3RhdGUgPSBuZXdTdGF0ZTtcblx0XHR9XG5cblx0XHQvLyBFbWl0IGVudmVsb3BlXG5cdFx0Y29uc3QgZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlID0ge1xuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdGFjdGlvbixcblx0XHRcdHNlcnZlclNlcTogKyt0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0XHRvcmlnaW4sXG5cdFx0fTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIEVtaXR0aW5nIGVudmVsb3BlOiBzZXE9JHtlbnZlbG9wZS5zZXJ2ZXJTZXF9LCBjaGFubmVsPSR7ZW52ZWxvcGUuY2hhbm5lbH0sIHR5cGU9JHthY3Rpb24udHlwZX0ke29yaWdpbiA/IGAsIG9yaWdpbj0ke29yaWdpbi5jbGllbnRJZH06JHtvcmlnaW4uY2xpZW50U2VxfWAgOiAnJ31gKTtcblx0XHR0aGlzLl9vbkRpZEVtaXRFbnZlbG9wZS5maXJlKGVudmVsb3BlKTtcblxuXHRcdHJldHVybiByZXN1bHRpbmdTdGF0ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGEgc2luZ2xlIGNoYXQgZnJvbSBpdHMgc2Vzc2lvbidzIGFjdGl2ZS10dXJuIHNldCwgZmlyaW5nIHRoZVxuXHQgKiBzZXNzaW9uLWxldmVsIGFjdGl2ZSBmbGlwICh7QGxpbmsgb25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybn0gK1xuXHQgKiB7QGxpbmsgQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkfSkgd2hlbiB0aGlzIGNsZWFycyB0aGVcblx0ICogc2Vzc2lvbidzIGxhc3QgYWN0aXZlIGNoYXQuIFNhZmUgdG8gY2FsbCBmb3IgY2hhdHMgdGhhdCBhcmVuJ3QgY3VycmVudGx5XG5cdCAqIHRyYWNrZWQgYXMgYWN0aXZlIFx1MjAxNCBpdCBpcyBhIG5vLW9wIGluIHRoYXQgY2FzZS4gVXNlZCBib3RoIHdoZW4gYSB0dXJuXG5cdCAqIGVuZHMgYW5kIHdoZW4gYSBjaGF0IGlzIHJlbW92ZWQgbWlkLXR1cm4sIHNvIHRoZSBzZXNzaW9uIGNhbid0IGJlXG5cdCAqIHN0cmFuZGVkIGFzIHBlcm1hbmVudGx5IFwiYWN0aXZlXCIuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW1vdmVDaGF0QWN0aXZlVHVybihzZXNzaW9uS2V5OiBzdHJpbmcsIGNoYXRVcmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUNoYXRzID0gdGhpcy5fc2Vzc2lvbnNXaXRoQWN0aXZlVHVybi5nZXQoc2Vzc2lvbktleSk7XG5cdFx0aWYgKCFhY3RpdmVDaGF0cyB8fCAhYWN0aXZlQ2hhdHMuZGVsZXRlKGNoYXRVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGl2ZUNoYXRzLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uZGVsZXRlKHNlc3Npb25LZXkpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybi5maXJlKHsgc2Vzc2lvbjogc2Vzc2lvbktleSwgYWN0aXZlOiBmYWxzZSB9KTtcblx0XHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oUk9PVF9TVEFURV9VUkksIHsgdHlwZTogQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkLCBhY3RpdmVTZXNzaW9uczogdGhpcy5fc2Vzc2lvbnNXaXRoQWN0aXZlVHVybi5zaXplIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCcmlkZ2VzIGEgZGVmYXVsdC1jaGF0IHN0YXRlIHRyYW5zaXRpb24gYmFjayBvbnRvIGl0cyBvd25pbmcgc2Vzc2lvbi5cblx0ICpcblx0ICogVGhlIHByb3RvY29sIG1vdmVkIHR1cm4gbGlmZWN5Y2xlIChhbmQgdGhlcmVmb3JlIHRoZSBkZXJpdmVkXG5cdCAqIGFjdGl2aXR5IHN0YXR1cykgb250byB0aGUgY2hhdCBjaGFubmVsLiBUbyBwcmVzZXJ2ZSBWUyBDb2RlJ3Ncblx0ICogc2luZ2xlLWNoYXQgYmVoYXZpb3VyIHdlOlxuXHQgKiAgLSB0cmFjayBhY3RpdmUtdHVybiB0cmFuc2l0aW9ucyAoZHJpdmluZyBgUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZGBcblx0ICogICAgYW5kIGBoYXNBY3RpdmVTZXNzaW9uc2AsIHdoaWNoIGdhdGUgYC0tZW5hYmxlLXJlbW90ZS1hdXRvLXNodXRkb3duYCksXG5cdCAqICAgIGtleWVkIGJ5IHRoZSBvd25pbmcgc2Vzc2lvbiBVUkk7XG5cdCAqICAtIG1pcnJvciB0aGUgY2hhdCdzIGRlbm9ybWFsaXplZCBgc3RhdHVzYC9gYWN0aXZpdHlgL2Btb2RpZmllZEF0YFxuXHQgKiAgICBvbnRvIHRoZSBzZXNzaW9uIHN1bW1hcnkgc28gdGhlIHNlc3Npb24gbGlzdCByZWZsZWN0cyBwcm9ncmVzcztcblx0ICogIC0gZm9yd2FyZCB0aGUgY2hhdCdzIG93biBgc3RhdHVzYCB0byB0aGUgc2Vzc2lvbiBgY2hhdHNgIGNhdGFsb2cgKHZpYSBhXG5cdCAqICAgIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DaGF0VXBkYXRlZH0pIHNvIHBlci1jaGF0IHRhYnMgcmVmbGVjdCB0aGF0XG5cdCAqICAgIGNoYXQncyBwcm9ncmVzcywgbm90IGp1c3QgdGhlIGFnZ3JlZ2F0ZWQgc2Vzc2lvbiBzdW1tYXJ5OyBhbmRcblx0ICogIC0ga2VlcCB0aGUgc2Vzc2lvbidzIGBjaGF0c2AgY2F0YWxvZyBlbnRyeSBpbiBzeW5jLlxuXHQgKi9cblx0cHJpdmF0ZSBfb25DaGF0U3RhdGVDaGFuZ2VkKHNlc3Npb25LZXk6IHN0cmluZywgY2hhdFVyaTogc3RyaW5nLCBwcmV2OiBDaGF0U3RhdGUsIG5leHQ6IENoYXRTdGF0ZSk6IHZvaWQge1xuXHRcdC8vIEFjdGl2ZSB0dXJuIHRyYWNraW5nIFx1MjAxNCBkZXJpdmUgZnJvbSB0aGUgcmVkdWNlcidzIHZpZXcgb2Ygc3RhdGUsXG5cdFx0Ly8gbmV2ZXIgZnJvbSByYXcgYWN0aW9uIHR1cm4taWRzLCBzbyBvdXQtb2Ytb3JkZXIgbGlmZWN5Y2xlIGFjdGlvbnNcblx0XHQvLyBjYW4ndCBkZXN5bmMgdGhlIGNvdW50IGZyb20gcmVhbGl0eS4gVHJhY2sgYWN0aXZlIHR1cm5zIHBlciBjaGF0IHNvIGFcblx0XHQvLyBzZXNzaW9uIHN0YXlzIGFjdGl2ZSB1bnRpbCBBTEwgb2YgaXRzIGNvbmN1cnJlbnQgY2hhdCB0dXJucyBmaW5pc2g7XG5cdFx0Ly8gb25seSBub3RpZnkgd2hlbiB0aGUgc2Vzc2lvbidzIG92ZXJhbGwgYWN0aXZlIHN0YXRlIGFjdHVhbGx5IGZsaXBzLlxuXHRcdGNvbnN0IGhhZEFjdGl2ZSA9ICEhcHJldi5hY3RpdmVUdXJuO1xuXHRcdGNvbnN0IGhhc0FjdGl2ZSA9ICEhbmV4dC5hY3RpdmVUdXJuO1xuXHRcdGlmIChoYWRBY3RpdmUgIT09IGhhc0FjdGl2ZSkge1xuXHRcdFx0aWYgKGhhc0FjdGl2ZSkge1xuXHRcdFx0XHRsZXQgYWN0aXZlQ2hhdHMgPSB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLmdldChzZXNzaW9uS2V5KTtcblx0XHRcdFx0Y29uc3Qgd2FzU2Vzc2lvbkFjdGl2ZSA9ICEhYWN0aXZlQ2hhdHM/LnNpemU7XG5cdFx0XHRcdGlmICghYWN0aXZlQ2hhdHMpIHtcblx0XHRcdFx0XHRhY3RpdmVDaGF0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uc2V0KHNlc3Npb25LZXksIGFjdGl2ZUNoYXRzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhY3RpdmVDaGF0cy5hZGQoY2hhdFVyaSk7XG5cdFx0XHRcdGlmICghd2FzU2Vzc2lvbkFjdGl2ZSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4uZmlyZSh7IHNlc3Npb246IHNlc3Npb25LZXksIGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0aGlzLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uc2l6ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQ2hhdEFjdGl2ZVR1cm4oc2Vzc2lvbktleSwgY2hhdFVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uS2V5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IGVudHJ5LnN0YXRlO1xuXG5cdFx0Ly8gTWlycm9yIGRlbm9ybWFsaXplZCBjaGF0IHN1bW1hcnkgZmllbGRzIG9udG8gdGhlIHNlc3Npb24sIGFnZ3JlZ2F0aW5nXG5cdFx0Ly8gYWNyb3NzIHRoZSB3aG9sZSBjaGF0IGNhdGFsb2cgcGVyIHRoZSBTZXNzaW9uU3VtbWFyeSBydWxlcy5cblx0XHRjb25zdCBuZXh0RW50cnkgPSBjaGF0U3VtbWFyeUZyb21TdGF0ZShuZXh0KTtcblx0XHRjb25zdCBwcmV2RW50cnkgPSBzZXNzaW9uU3RhdGUuY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IGNoYXRVcmkpO1xuXHRcdGNvbnN0IGNoYXRzID0gc2Vzc2lvblN0YXRlLmNoYXRzLm1hcChjID0+IGMucmVzb3VyY2UgPT09IGNoYXRVcmkgPyBuZXh0RW50cnkgOiBjKTtcblxuXHRcdC8vIEZvcndhcmQgdGhlIGNoYXQncyBvd24gc3RhdHVzIHRvIHRoZSBzZXNzaW9uIGNhdGFsb2cgc28gZnVsbFxuXHRcdC8vIFNlc3Npb25TdGF0ZSBzdWJzY3JpYmVycyAodGhlIHBlci1jaGF0IHRhYnMpIHJlZmxlY3QgdGhpcyBjaGF0J3Ncblx0XHQvLyBwcm9ncmVzcyBcdTIwMTQgbm90IGp1c3QgdGhlIGFnZ3JlZ2F0ZWQgc2Vzc2lvbiBzdW1tYXJ5LiBTdGF0dXMgY2hhbmdlc1xuXHRcdC8vIGF0IG1vc3QgYSBjb3VwbGUgb2YgdGltZXMgcGVyIHR1cm4sIHNvIHRoaXMgd29uJ3QgZmxvb2QgdGhlIGNoYW5uZWwuXG5cdFx0aWYgKHByZXZFbnRyeT8uc3RhdHVzICE9PSBuZXh0RW50cnkuc3RhdHVzKSB7XG5cdFx0XHR0aGlzLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25LZXksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdFVwZGF0ZWQsXG5cdFx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRcdGNoYW5nZXM6IHsgc3RhdHVzOiBuZXh0RW50cnkuc3RhdHVzLCBhY3Rpdml0eTogbmV4dEVudHJ5LmFjdGl2aXR5IH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2dyZWdhdGUgPSB0aGlzLl9hZ2dyZWdhdGVDaGF0U3VtbWFyaWVzKGNoYXRzLCBzZXNzaW9uU3RhdGUuZGVmYXVsdENoYXQpO1xuXHRcdGNvbnN0IG5ld1N0YXR1cyA9IGFnZ3JlZ2F0ZS5zdGF0dXMgIT09IHVuZGVmaW5lZCA/IHRoaXMuX21lcmdlU2Vzc2lvblN0YXR1cyhzZXNzaW9uU3RhdGUuc3RhdHVzLCBhZ2dyZWdhdGUuc3RhdHVzKSA6IHNlc3Npb25TdGF0ZS5zdGF0dXM7XG5cdFx0Y29uc3Qgc3RhdHVzQ2hhbmdlZCA9IG5ld1N0YXR1cyAhPT0gc2Vzc2lvblN0YXRlLnN0YXR1cztcblx0XHRjb25zdCBhY3Rpdml0eUNoYW5nZWQgPSBhZ2dyZWdhdGUuYWN0aXZpdHkgIT09IHNlc3Npb25TdGF0ZS5hY3Rpdml0eTtcblx0XHRlbnRyeS5zdGF0ZSA9IHtcblx0XHRcdC4uLnNlc3Npb25TdGF0ZSxcblx0XHRcdGNoYXRzLFxuXHRcdFx0Li4uKHN0YXR1c0NoYW5nZWQgPyB7IHN0YXR1czogbmV3U3RhdHVzIH0gOiB1bmRlZmluZWQpLFxuXHRcdFx0Li4uKGFjdGl2aXR5Q2hhbmdlZCA/IHsgYWN0aXZpdHk6IGFnZ3JlZ2F0ZS5hY3Rpdml0eSB9IDogdW5kZWZpbmVkKSxcblx0XHR9O1xuXG5cdFx0Ly8gUm9sbCB0aGUgYWdncmVnYXRlZCBgbW9kaWZpZWRBdGAgaW50byB0aGUgY2F0YWxvZy1vbmx5IHRpbWVzdGFtcC5cblx0XHRjb25zdCBuZXdNb2RpZmllZEF0ID0gYWdncmVnYXRlLm1vZGlmaWVkQXQgIT09IHVuZGVmaW5lZCA/IG5ldyBEYXRlKGFnZ3JlZ2F0ZS5tb2RpZmllZEF0KS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1vZGlmaWVkQXRDaGFuZ2VkID0gbmV3TW9kaWZpZWRBdCAhPT0gdW5kZWZpbmVkICYmIG5ld01vZGlmaWVkQXQgIT09IGVudHJ5Lm1vZGlmaWVkQXQ7XG5cdFx0aWYgKG1vZGlmaWVkQXRDaGFuZ2VkKSB7XG5cdFx0XHRlbnRyeS5tb2RpZmllZEF0ID0gbmV3TW9kaWZpZWRBdDtcblx0XHR9XG5cblx0XHRpZiAoc3RhdHVzQ2hhbmdlZCB8fCBhY3Rpdml0eUNoYW5nZWQgfHwgbW9kaWZpZWRBdENoYW5nZWQpIHtcblx0XHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5tYXJrRGlydHkoc2Vzc2lvbktleSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFnZ3JlZ2F0ZXMgYSBzZXNzaW9uJ3MgY2hhdCBjYXRhbG9nIGludG8gdGhlIGRlcml2ZWQgc2Vzc2lvbi1zdW1tYXJ5XG5cdCAqIGZpZWxkcyBwZXIgdGhlIHByb3RvY29sIHJ1bGVzOiBhY3Rpdml0eSBiaXRzIGNvbWUgZnJvbSB0aGUgZGVmYXVsdCBjaGF0XG5cdCAqIChlbHNlIHRoZSBtb3N0IHJlY2VudGx5IG1vZGlmaWVkIGNoYXQpIHdpdGggYElucHV0TmVlZGVkYC9gRXJyb3JgL1xuXHQgKiBgSW5Qcm9ncmVzc2AgcHJvbW90ZWQgd2hlbmV2ZXIgYW55IGNoYXQgcmFpc2VzIHRoZW07IHRoZSBgYWN0aXZpdHlgIHN0cmluZ1xuXHQgKiBmb2xsb3dzIHRoZSBjaGF0IGRyaXZpbmcgdGhlIHJlc3VsdGluZyBzdGF0dXM7IGBtb2RpZmllZEF0YCBpcyB0aGUgbWF4XG5cdCAqIGFjcm9zcyBjaGF0cy4gUHJvbW90aW9uIHByZWNlZGVuY2UgaXMgYElucHV0TmVlZGVkYCA+IGBFcnJvcmAgPlxuXHQgKiBgSW5Qcm9ncmVzc2AsIHNvIGEgcnVubmluZyBwZWVyIChzdWIpIGNoYXQgc3VyZmFjZXMgYXMgYEluUHJvZ3Jlc3NgIG9uIHRoZVxuXHQgKiBzZXNzaW9uIGV2ZW4gd2hlbiB0aGUgZGVmYXVsdCBjaGF0IGlzIGlkbGUuXG5cdCAqL1xuXHRwcml2YXRlIF9hZ2dyZWdhdGVDaGF0U3VtbWFyaWVzKGNoYXRzOiByZWFkb25seSBDaGF0U3VtbWFyeVtdLCBkZWZhdWx0Q2hhdDogVVJJIHwgdW5kZWZpbmVkKTogeyBzdGF0dXM/OiBTZXNzaW9uU3RhdHVzOyBhY3Rpdml0eT86IHN0cmluZzsgbW9kaWZpZWRBdD86IG51bWJlciB9IHtcblx0XHRpZiAoY2hhdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2aXR5TWFzayA9IH4oU2Vzc2lvblN0YXR1cy5Jc1JlYWQgfCBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQpO1xuXHRcdGNvbnN0IGJhc2UgPSAoZGVmYXVsdENoYXQgIT09IHVuZGVmaW5lZCA/IGNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBkZWZhdWx0Q2hhdCkgOiB1bmRlZmluZWQpXG5cdFx0XHQ/PyBjaGF0cy5yZWR1Y2UoKGEsIGIpID0+IERhdGUucGFyc2UoYi5tb2RpZmllZEF0KSA+IERhdGUucGFyc2UoYS5tb2RpZmllZEF0KSA/IGIgOiBhKTtcblx0XHRsZXQgc3RhdHVzID0gYmFzZS5zdGF0dXMgJiBhY3Rpdml0eU1hc2s7XG5cdFx0bGV0IGRyaXZlciA9IGJhc2U7XG5cdFx0Y29uc3QgZXJyb3JDaGF0ID0gY2hhdHMuZmluZChjID0+IChjLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuRXJyb3IpID09PSBTZXNzaW9uU3RhdHVzLkVycm9yKTtcblx0XHRjb25zdCBpbnB1dENoYXQgPSBjaGF0cy5maW5kKGMgPT4gKGMuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCkgPT09IFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpO1xuXHRcdC8vIGBJbnB1dE5lZWRlZGAgaXMgYSBzdXBlcnNldCBvZiB0aGUgYEluUHJvZ3Jlc3NgIGJpdCwgc28gZXhjbHVkZVxuXHRcdC8vIGlucHV0LW5lZWRlZCBjaGF0cyBoZXJlIHRvIGZpbmQgb25lIHRoYXQgaXMgcHVyZWx5IHN0cmVhbWluZy5cblx0XHRjb25zdCBpblByb2dyZXNzQ2hhdCA9IGNoYXRzLmZpbmQoYyA9PiAoYy5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKSA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRpZiAoaW5wdXRDaGF0KSB7XG5cdFx0XHRzdGF0dXMgPSBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkO1xuXHRcdFx0ZHJpdmVyID0gaW5wdXRDaGF0O1xuXHRcdH0gZWxzZSBpZiAoZXJyb3JDaGF0KSB7XG5cdFx0XHRzdGF0dXMgPSBTZXNzaW9uU3RhdHVzLkVycm9yO1xuXHRcdFx0ZHJpdmVyID0gZXJyb3JDaGF0O1xuXHRcdH0gZWxzZSBpZiAoaW5Qcm9ncmVzc0NoYXQpIHtcblx0XHRcdHN0YXR1cyA9IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRcdGRyaXZlciA9IGluUHJvZ3Jlc3NDaGF0O1xuXHRcdH1cblx0XHRjb25zdCBtb2RpZmllZEF0ID0gY2hhdHMucmVkdWNlKChtYXgsIGMpID0+IE1hdGgubWF4KG1heCwgRGF0ZS5wYXJzZShjLm1vZGlmaWVkQXQpKSwgMCk7XG5cdFx0cmV0dXJuIHsgc3RhdHVzLCBhY3Rpdml0eTogZHJpdmVyLmFjdGl2aXR5LCBtb2RpZmllZEF0IH07XG5cdH1cblxuXHQvKipcblx0ICogQ29tYmluZXMgdGhlIGNoYXQncyBhY3Rpdml0eSBzdGF0dXMgYml0cyB3aXRoIHRoZSBzZXNzaW9uIHN1bW1hcnknc1xuXHQgKiBvd24gbWV0YWRhdGEgZmxhZ3MgKElzUmVhZCAvIElzQXJjaGl2ZWQpIHdoaWNoIGxpdmUgaW4gdGhlIGhpZ2ggYml0c1xuXHQgKiBvZiB7QGxpbmsgU2Vzc2lvblN0YXR1c30gYW5kIGFyZSBvd25lZCBieSB0aGUgc2Vzc2lvbiwgbm90IHRoZSBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfbWVyZ2VTZXNzaW9uU3RhdHVzKHNlc3Npb25TdGF0dXM6IFNlc3Npb25TdGF0dXMsIGNoYXRTdGF0dXM6IFNlc3Npb25TdGF0dXMpOiBTZXNzaW9uU3RhdHVzIHtcblx0XHRjb25zdCBtZXRhRmxhZ3MgPSBzZXNzaW9uU3RhdHVzICYgKFNlc3Npb25TdGF0dXMuSXNSZWFkIHwgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKTtcblx0XHRjb25zdCBhY3Rpdml0eUJpdHMgPSBjaGF0U3RhdHVzICYgfihTZXNzaW9uU3RhdHVzLklzUmVhZCB8IFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCk7XG5cdFx0cmV0dXJuIGFjdGl2aXR5Qml0cyB8IG1ldGFGbGFncztcblx0fVxuXG5cdC8qKlxuXHQgKiBFbWl0IGEgZ2VuZXJpYyBwcm9ncmVzcyBub3RpZmljYXRpb24gb24gdGhlIHJvb3QgY2hhbm5lbCwgY29ycmVsYXRlZCB0b1xuXHQgKiB0aGUgb3JpZ2luYXRpbmcgcmVxdWVzdCBieSB7QGxpbmsgUHJvZ3Jlc3NQYXJhbXMucHJvZ3Jlc3NUb2tlbn0uIFJvdXRlZCB0b1xuXHQgKiBjbGllbnRzIHRocm91Z2ggdGhlIHNhbWUge0BsaW5rIG9uRGlkRW1pdE5vdGlmaWNhdGlvbn0gcGF0aCBhcyBzZXNzaW9uXG5cdCAqIG5vdGlmaWNhdGlvbnMsIHNvIGJvdGggdGhlIGxvY2FsIChJUEMgcHJveHkpIGFuZCByZW1vdGUgKFdlYlNvY2tldFxuXHQgKiB7QGxpbmsgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyfSkgcmVuZGVyZXJzIHJlY2VpdmUgaXQgd2l0aG91dCBhbnlcblx0ICogdHJhbnNwb3J0LXNwZWNpZmljIHNwZWNpYWwgY2FzaW5nLiBQcm9ncmVzcyBmb3IgaG9zdC1sZXZlbCB3b3JrIChlLmcuIGFcblx0ICogc2hhcmVkIFNESyBkb3dubG9hZCkgcmlkZXMgdGhlIHJvb3QgY2hhbm5lbCByYXRoZXIgdGhhbiBhIHBlci1zZXNzaW9uIG9uZS5cblx0ICovXG5cdGVtaXRQcm9ncmVzcyhwcm9ncmVzczogT21pdDxQcm9ncmVzc1BhcmFtcywgJ2NoYW5uZWwnPik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkRW1pdE5vdGlmaWNhdGlvbi5maXJlKHtcblx0XHRcdHR5cGU6ICdyb290L3Byb2dyZXNzJyxcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0Li4ucHJvZ3Jlc3MsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdCBhbiBgYXV0aC9yZXF1aXJlZGAgbm90aWZpY2F0aW9uIG9uIHRoZSByb290IGNoYW5uZWwsIGFza2luZyB0aGVcblx0ICogY2xpZW50IHRvIG9idGFpbiBhIGZyZXNoIHRva2VuIGFuZCBwdXNoIGl0IHZpYSBgYXV0aGVudGljYXRlYC4gUmlkZXMgdGhlXG5cdCAqIHNhbWUge0BsaW5rIG9uRGlkRW1pdE5vdGlmaWNhdGlvbn0gcGF0aCBhcyB7QGxpbmsgZW1pdFByb2dyZXNzfSwgc28gYm90aFxuXHQgKiBsb2NhbCAoSVBDIHByb3h5KSBhbmQgcmVtb3RlIChXZWJTb2NrZXQpIHJlbmRlcmVycyByZWNlaXZlIGl0LiBVc2VkIGZvclxuXHQgKiBob3N0LWxldmVsIGF1dGggcmVxdWlyZW1lbnRzIChlLmcuIGFuIGFnZW50IHdob3NlIHRyYW5zcG9ydCBmbGlwIG1ha2VzIGFcblx0ICogY3JlZGVudGlhbCBuZXdseSByZXF1aXJlZCkgcmF0aGVyIHRoYW4gYSBwZXItc2Vzc2lvbiBvbmUuXG5cdCAqL1xuXHRlbWl0QXV0aFJlcXVpcmVkKHBhcmFtczogT21pdDxBdXRoUmVxdWlyZWRQYXJhbXMsICdjaGFubmVsJz4pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEVtaXROb3RpZmljYXRpb24uZmlyZSh7XG5cdFx0XHR0eXBlOiAnYXV0aC9yZXF1aXJlZCcsXG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdC4uLnBhcmFtcyxcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBhdXRob3JpdGF0aXZlIHtAbGluayBDaGF0U3RhdGV9IGZvciBhIGNoYXQgVVJJLCB3aGV0aGVyIGl0IG5hbWVzXG4gKiBhIHBlZXIgY2hhdCBvciBhIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgKGFkZHJlc3NlZCBieSB0aGUgc2Vzc2lvbiBVUkkgb3IgdGhlXG4gKiBkZWZhdWx0IGNoYXQgVVJJKS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBjaGF0IGlzIHVua25vd24uXG4gKlxuICogU2hhcmVkIGJ5IHRoZSBjaGF0IGNvbXBsZXRpb24gcHJvdmlkZXIgYW5kIHRoZSBzZXJ2ZXItc2lkZSBjaGF0LWF0dGFjaG1lbnRcbiAqIHJlc29sdmVyIHNvIGJvdGggZGVyaXZlIGEgcmVmZXJlbmNlZCBjaGF0J3MgdHVybnMgdGhlIHNhbWUgd2F5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNoYXRTdGF0ZUZvclVyaShzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgY2hhdFVyaTogc3RyaW5nKTogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGVlclN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0VXJpKTtcblx0aWYgKHBlZXJTdGF0ZSkge1xuXHRcdHJldHVybiBwZWVyU3RhdGU7XG5cdH1cblx0aWYgKCFpc0FocENoYXRDaGFubmVsKGNoYXRVcmkpKSB7XG5cdFx0cmV0dXJuIHN0YXRlTWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKGNoYXRVcmkpO1xuXHR9XG5cdGlmIChpc0RlZmF1bHRDaGF0VXJpKGNoYXRVcmkpKSB7XG5cdFx0cmV0dXJuIHN0YXRlTWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdFVyaSkpO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBMk8sY0FBYyxpQkFBaUIsY0FBYyxtQkFBbUIsMkJBQXlFO0FBRTdYLFNBQVMsYUFBYSxnQkFBZ0IsYUFBYSxrQkFBa0IsMEJBQTBCO0FBQy9GLFNBQVMsaUJBQWlCLG9CQUFvQixpQkFBaUIsMEJBQTBCLHNCQUFzQixxQkFBcUIscUJBQXFCLG9DQUFvQyxrQkFBa0Isa0JBQWtCLDZCQUE2QixrQkFBa0Isa0JBQWtCLG1CQUF5UyxnQkFBZ0IsaUJBQWlDLHFCQUFxQjtBQUNqcEIsU0FBUyxrQ0FBcUQsb0JBQW9CLDRDQUE0QztBQUM5SCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxvQ0FBbUY7QUFFNUYsU0FBUyxhQUFhLHdCQUF3QjtBQUM5QyxTQUFTLDhDQUE4QztBQTBDdkQsTUFBTSwrQkFBK0IsV0FBVztBQUFBLEVBVS9DLFlBQ2tCLGFBQ0EsT0FDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQVRsQjtBQUFBLFNBQWlCLGdCQUFnQixvQkFBSSxJQUE0QjtBQUdqRTtBQUFBLFNBQWlCLFNBQVMsb0JBQUksSUFBWTtBQUUx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
