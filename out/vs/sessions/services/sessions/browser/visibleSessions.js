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
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../common/session.js";
class VisibleSession extends Disposable {
  constructor(_session, initialChat, initialClosedChatUris) {
    super();
    this._session = _session;
    this._sticky = observableValue("activeSessionSticky", false);
    this.sticky = this._sticky;
    /** Append-only list tracking close order; last element is the most recently closed. */
    this._closedChatOrder = [];
    this._activeChat = observableValue(`activeChat-${_session.sessionId}`, initialChat);
    this.activeChat = this._activeChat;
    this._activeChatModelId = derived(this, (reader) => this._activeChat.read(reader).modelId.read(reader));
    this._activeChatMode = derived(this, (reader) => this._activeChat.read(reader).mode.read(reader));
    const seed = new Set(initialClosedChatUris);
    seed.delete(_session.mainChat.get().resource.toString());
    const activeUri = initialChat?.resource.toString();
    if (activeUri) {
      seed.delete(activeUri);
    }
    this._closedChatUris = observableValue("closedChatUris", seed);
    const shownSubagents = /* @__PURE__ */ new Set();
    if (initialChat?.origin?.kind === ChatOriginKind.Tool) {
      shownSubagents.add(initialChat.resource.toString());
    }
    this._shownSubagentUris = observableValue("shownSubagentUris", shownSubagents);
    this._isCreated = _session.status.map((status) => status !== SessionStatus.Untitled);
    this.isCreated = this._isCreated;
    this.openChats = derived(this, (reader) => {
      const closed = this._closedChatUris.read(reader);
      const chats = this._session.chats.read(reader);
      return chats.filter((c) => c.interactivity.read(reader) !== ChatInteractivity.Hidden && !closed.has(c.resource.toString()));
    });
    this.closedChats = derived(this, (reader) => {
      const closed = this._closedChatUris.read(reader);
      if (closed.size === 0) {
        return [];
      }
      return this._session.chats.read(reader).filter((c) => closed.has(c.resource.toString()));
    });
    this.visibleChatTabs = derived(this, (reader) => {
      const shownSubagents2 = this._shownSubagentUris.read(reader);
      return this.openChats.read(reader).filter((c) => c.origin?.kind !== ChatOriginKind.Tool || shownSubagents2.has(c.resource.toString()));
    });
    this.shouldShowChatTabs = derived(this, (reader) => {
      return this.visibleChatTabs.read(reader).length > 1;
    });
  }
  setActiveChat(chat) {
    this._activeChat.set(chat, void 0);
  }
  closeChat(chat) {
    const chatUri = chat.resource.toString();
    if (chatUri === this._session.mainChat.get().resource.toString()) {
      return;
    }
    if (chat.origin?.kind === ChatOriginKind.Tool) {
      const shown = this._shownSubagentUris.get();
      if (!shown.has(chatUri)) {
        return;
      }
      const nextShown = new Set(shown);
      nextShown.delete(chatUri);
      transaction((tx) => {
        this._shownSubagentUris.set(nextShown, tx);
        if (this._activeChat.get().resource.toString() === chatUri) {
          this._activeChat.set(this._defaultActiveChat(this._closedChatUris.get(), nextShown), tx);
        }
      });
      return;
    }
    const closed = this._closedChatUris.get();
    if (closed.has(chatUri)) {
      return;
    }
    const next = new Set(closed);
    next.add(chatUri);
    this._closedChatOrder.push(chat);
    transaction((tx) => {
      this._closedChatUris.set(next, tx);
      if (this._activeChat.get().resource.toString() === chatUri) {
        this._activeChat.set(this._defaultActiveChat(next, this._shownSubagentUris.get()), tx);
      }
    });
  }
  openChat(chat) {
    if (chat.origin?.kind === ChatOriginKind.Tool) {
      const shown = this._shownSubagentUris.get();
      if (shown.has(chat.resource.toString())) {
        return;
      }
      const next2 = new Set(shown);
      next2.add(chat.resource.toString());
      this._shownSubagentUris.set(next2, void 0);
      return;
    }
    const closed = this._closedChatUris.get();
    if (!closed.has(chat.resource.toString())) {
      return;
    }
    const next = new Set(closed);
    next.delete(chat.resource.toString());
    this._closedChatUris.set(next, void 0);
    const idx = this._closedChatOrder.findLastIndex((c) => c.resource.toString() === chat.resource.toString());
    if (idx !== -1) {
      this._closedChatOrder.splice(idx, 1);
    }
  }
  /**
   * Pick the active chat to fall back to when the current one is closed: the
   * last chat that would appear as a visible tab given the closed and shown-
   * subagent sets, or the main chat.
   */
  _defaultActiveChat(closed, shownSubagents) {
    const candidates = this._session.chats.get().filter((c) => c.interactivity.get() !== ChatInteractivity.Hidden && !closed.has(c.resource.toString()) && (c.origin?.kind !== ChatOriginKind.Tool || shownSubagents.has(c.resource.toString())));
    return candidates[candidates.length - 1] ?? this._session.mainChat.get();
  }
  get lastClosedChat() {
    const currentChats = this._session.chats.get();
    const closed = this._closedChatUris.get();
    for (let i = this._closedChatOrder.length - 1; i >= 0; i--) {
      const chat = this._closedChatOrder[i];
      const uri = chat.resource.toString();
      if (closed.has(uri) && currentChats.some((c) => c.resource.toString() === uri)) {
        return chat;
      }
    }
    return void 0;
  }
  setSticky(value) {
    this._sticky.set(value, void 0);
  }
  /** Register a disposable that lives as long as this wrapper. */
  addDisposable(disposable) {
    return this._register(disposable);
  }
  get sessionId() {
    return this._session.sessionId;
  }
  get resource() {
    return this._session.resource;
  }
  get providerId() {
    return this._session.providerId;
  }
  get sessionType() {
    return this._session.sessionType;
  }
  get icon() {
    return this._session.icon;
  }
  get createdAt() {
    return this._session.createdAt;
  }
  get workspace() {
    return this._session.workspace;
  }
  get hasGitRepository() {
    return this._session.hasGitRepository;
  }
  get worktreePending() {
    return this._session.worktreePending;
  }
  get isQuickChat() {
    return this._session.isQuickChat;
  }
  get title() {
    return this._session.title;
  }
  get updatedAt() {
    return this._session.updatedAt;
  }
  get status() {
    return this._session.status;
  }
  get changesSummary() {
    return this._session.changesSummary;
  }
  get changesets() {
    return this._session.changesets;
  }
  get changes() {
    return this._session.changes;
  }
  get externalChanges() {
    return this._session.externalChanges;
  }
  get modelId() {
    return this._activeChatModelId;
  }
  get mode() {
    return this._activeChatMode;
  }
  get loading() {
    return this._session.loading;
  }
  get isArchived() {
    return this._session.isArchived;
  }
  get isRead() {
    return this._session.isRead;
  }
  get description() {
    return this._session.description;
  }
  get lastTurnEnd() {
    return this._session.lastTurnEnd;
  }
  get chats() {
    return this._session.chats;
  }
  get mainChat() {
    return this._session.mainChat;
  }
  get capabilities() {
    return this._session.capabilities;
  }
}
class ResourceOverrideSession {
  constructor(_session, resource) {
    this._session = _session;
    this.resource = resource;
  }
  get sessionId() {
    return this._session.sessionId;
  }
  get providerId() {
    return this._session.providerId;
  }
  get sessionType() {
    return this._session.sessionType;
  }
  get icon() {
    return this._session.icon;
  }
  get createdAt() {
    return this._session.createdAt;
  }
  get workspace() {
    return this._session.workspace;
  }
  get hasGitRepository() {
    return this._session.hasGitRepository;
  }
  get worktreePending() {
    return this._session.worktreePending;
  }
  get isQuickChat() {
    return this._session.isQuickChat;
  }
  get title() {
    return this._session.title;
  }
  get updatedAt() {
    return this._session.updatedAt;
  }
  get status() {
    return this._session.status;
  }
  get changesSummary() {
    return this._session.changesSummary;
  }
  get changes() {
    return this._session.changes;
  }
  get changesets() {
    return this._session.changesets;
  }
  get externalChanges() {
    return this._session.externalChanges;
  }
  get modelId() {
    return this._session.modelId;
  }
  get mode() {
    return this._session.mode;
  }
  get loading() {
    return this._session.loading;
  }
  get isArchived() {
    return this._session.isArchived;
  }
  get isRead() {
    return this._session.isRead;
  }
  get description() {
    return this._session.description;
  }
  get lastTurnEnd() {
    return this._session.lastTurnEnd;
  }
  get chats() {
    return this._session.chats;
  }
  get mainChat() {
    return this._session.mainChat;
  }
  get capabilities() {
    return this._session.capabilities;
  }
}
const NO_RECENT = /* @__PURE__ */ Symbol("no-recent");
let VisibleSessions = class extends Disposable {
  constructor(_resolveInitialChat, _resolveInitialClosedChats, _uriIdentityService) {
    super();
    this._resolveInitialChat = _resolveInitialChat;
    this._resolveInitialClosedChats = _resolveInitialClosedChats;
    this._uriIdentityService = _uriIdentityService;
    this._activeSession = observableValue(this, void 0);
    this.activeSession = this._activeSession;
    /**
     * Whether the most recent active-session change asked to preserve keyboard
     * focus (i.e. show the session without moving focus into it). Always set in
     * the **same transaction** as {@link _activeSession} via
     * {@link _setActiveSession} so the pair can never go stale, and read
     * reactively by the consumer that drives focus.
     */
    this._activePreserveFocus = observableValue(this, false);
    this.activePreserveFocus = this._activePreserveFocus;
    this._visibleSessions = observableValue(this, [void 0]);
    this.visibleSessions = this._visibleSessions;
    this._wrappers = this._register(new DisposableMap());
    /**
     * Ordered slot ids in the grid (left-to-right). Each entry is either a
     * session id or `undefined` (the empty slot). The invariant is that at
     * most one entry is `undefined` at any time.
     */
    this._visibleList = [];
    /** Subset of {@link _visibleList} the user has marked sticky. */
    this._stickyIds = /* @__PURE__ */ new Set();
    /**
     * Slot id of the most recently opened (or toggled-to-non-sticky) entry in
     * the grid. Used to choose which non-sticky slot to replace when opening a
     * new session while the active one is sticky.
     * - `NO_RECENT` means none is tracked.
     * - `undefined` refers to the empty slot.
     * - A string refers to that session id.
     */
    this._mostRecentNonStickySlot = NO_RECENT;
  }
  /**
   * Set the active session together with its preserve-focus intent in a
   * single transaction. Routing every active-session change through here
   * guarantees the two observables are always consistent and that the intent
   * never goes stale (callers that do not preserve focus pass `false`).
   */
  _setActiveSession(session, preserveFocus, tsx) {
    this._activeSession.set(session, tsx);
    this._activePreserveFocus.set(preserveFocus, tsx);
  }
  /**
   * Set the active session, updating the visibility model accordingly.
   *
   * - Passing `undefined` places (or keeps) the single empty slot in the
   *   grid and makes it active. The empty slot is always non-sticky.
   * - If the session is already in the grid, its slot is preserved and only
   *   the active observable is updated.
   * - Otherwise the session is placed as non-sticky:
   *   - If the active slot is non-sticky, the new one replaces it in
   *     place.
   *   - Else if a non-sticky slot exists, the most-recently opened
   *     non-sticky is replaced.
   *   - Else the session is appended at the end of the grid.
   *
   * Returns the wrapper for the active session, or `undefined` when the
   * active slot is the empty slot.
   */
  setActive(session, preserveFocus = false) {
    const targetId = session?.sessionId;
    if (!this._visibleList.includes(targetId)) {
      const activeSlot = this._currentActiveSlot();
      const activeIsNonSticky = activeSlot !== NO_RECENT && !this._isStickySlot(activeSlot);
      let replaceSlot;
      if (activeIsNonSticky) {
        replaceSlot = activeSlot;
      } else if (this._mostRecentNonStickySlot !== NO_RECENT && this._visibleList.includes(this._mostRecentNonStickySlot) && !this._isStickySlot(this._mostRecentNonStickySlot)) {
        replaceSlot = this._mostRecentNonStickySlot;
      } else {
        replaceSlot = this._findLastNonSticky();
      }
      if (replaceSlot !== NO_RECENT) {
        const idx = this._visibleList.indexOf(replaceSlot);
        this._visibleList.splice(idx, 1, targetId);
        if (replaceSlot !== void 0) {
          this._wrappers.deleteAndDispose(replaceSlot);
        }
      } else {
        this._visibleList.push(targetId);
      }
      this._mostRecentNonStickySlot = targetId;
    }
    const visibleSession = session ? this._getOrCreateVisibleSession(session) : void 0;
    transaction((tsx) => {
      this._setActiveSession(visibleSession, preserveFocus, tsx);
      this._refresh(tsx);
    });
    return visibleSession;
  }
  /**
   * Insert (or move) a slot into the grid positioned next to a target
   * session that is already visible. Used by drag-and-drop and by
   * "open at position" entry points.
   *
   * - If the slot is not yet visible, a new non-sticky entry is created
   *   at the computed position. For an `undefined` session (empty slot),
   *   this is a no-op when an empty slot already exists in the grid.
   * - If the slot is already visible, it is moved to the computed
   *   position; its sticky / non-sticky state is preserved.
   *
   * When `activate` is `true` (default), the inserted slot also becomes
   * the active session. When `false`, the active session is left
   * unchanged.
   *
   * `targetSessionId` may be `undefined` to position relative to the empty
   * (new-session) slot. No-op if the target slot is not currently visible.
   */
  insertAt(session, targetSessionId, side, activate = true) {
    const id = session?.sessionId;
    const targetIdx = this._visibleList.indexOf(targetSessionId);
    if (targetIdx < 0) {
      return;
    }
    if (id === void 0 && this._visibleList.includes(void 0)) {
      return;
    }
    let destIdx = side === "left" ? targetIdx : targetIdx + 1;
    const currentIdx = this._visibleList.indexOf(id);
    if (currentIdx >= 0) {
      if (currentIdx !== destIdx && currentIdx + 1 !== destIdx) {
        this._visibleList.splice(currentIdx, 1);
        if (currentIdx < destIdx) {
          destIdx--;
        }
        this._visibleList.splice(destIdx, 0, id);
      }
      if (!this._isStickySlot(id)) {
        this._mostRecentNonStickySlot = id;
      }
    } else {
      if (session) {
        this._getOrCreateVisibleSession(session);
      }
      this._visibleList.splice(destIdx, 0, id);
      this._mostRecentNonStickySlot = id;
    }
    transaction((tsx) => {
      if (activate) {
        const wrapper = id !== void 0 ? this._wrappers.get(id) : void 0;
        this._setActiveSession(wrapper, false, tsx);
      }
      this._refresh(tsx);
    });
  }
  /**
   * Atomically (re)build the entire grid from a persisted snapshot.
   *
   * Slots are given left-to-right; a `session` of `undefined` denotes the
   * empty new-session slot. The whole model — slot order, stickiness and the
   * active slot — is published in a single transaction so restoring multiple
   * sessions does not produce intermediate layouts (which would otherwise
   * cause the grid to visibly flicker as sessions are restored one by one).
   *
   * Any wrappers for sessions no longer present in the snapshot are disposed.
   *
   * @param slots Ordered grid slots to restore.
   * @param activeIndex Index into `slots` of the slot that should be active,
   * or `-1` for none.
   */
  restoreGrid(slots, activeIndex) {
    this._visibleList = [];
    this._stickyIds.clear();
    let activeWrapper;
    let lastNonStickySlot = NO_RECENT;
    for (let i = 0; i < slots.length; i++) {
      const { session, sticky } = slots[i];
      const id = session?.sessionId;
      this._visibleList.push(id);
      if (session) {
        const wrapper = this._getOrCreateVisibleSession(session);
        if (sticky) {
          this._stickyIds.add(session.sessionId);
        }
        if (i === activeIndex) {
          activeWrapper = wrapper;
        }
      }
      if (!this._isStickySlot(id)) {
        lastNonStickySlot = id;
      }
    }
    for (const existingId of [...this._wrappers.keys()]) {
      if (!this._visibleList.includes(existingId)) {
        this._wrappers.deleteAndDispose(existingId);
      }
    }
    const activeId = activeWrapper?.sessionId;
    this._mostRecentNonStickySlot = activeId !== void 0 && !this._isStickySlot(activeId) ? activeId : lastNonStickySlot;
    transaction((tsx) => {
      this._setActiveSession(activeWrapper, false, tsx);
      this._refresh(tsx);
    });
  }
  /**
   * Toggle a session's stickiness in the grid. The session keeps its grid
   * slot when toggled.
   * - If the session is not currently visible, it is appended at the end as
   *   sticky.
   *
   * Returns the session's stickiness state after the toggle.
   */
  toggleStickiness(session) {
    const id = session.sessionId;
    if (!this._visibleList.includes(id)) {
      this._stickyIds.add(id);
      this._getOrCreateVisibleSession(session);
      this._visibleList.push(id);
    } else if (this._stickyIds.has(id)) {
      this._stickyIds.delete(id);
      this._mostRecentNonStickySlot = id;
    } else {
      this._stickyIds.add(id);
      if (this._mostRecentNonStickySlot === id) {
        this._mostRecentNonStickySlot = this._findLastNonSticky();
      }
    }
    this._refresh(void 0);
    return this._stickyIds.has(id);
  }
  /**
   * Remove the given session ids from the visibility model and dispose their
   * wrappers. Passing `undefined` removes the empty (new-session) slot if
   * present. If the active slot is among the removed entries, the active
   * observable falls back to the slot at the active's original position
   * (or the slot to its left if it was at the end of the grid); when no
   * visible slot remains, the active observable is cleared. Observables
   * are refreshed once if anything changed.
   */
  removeMany(sessionIds) {
    transaction((tsx) => {
      let changed = false;
      const activeId = this._activeSession.get()?.sessionId;
      const emptySlotIsActive = activeId === void 0 && this._visibleList.includes(void 0);
      const activeSlotId = emptySlotIsActive ? void 0 : activeId;
      const activeIdx = activeId !== void 0 || emptySlotIsActive ? this._visibleList.indexOf(activeSlotId) : -1;
      let activeRemoved = false;
      for (const id of sessionIds) {
        if (this._removeFromModel(id)) {
          changed = true;
          if (id === void 0 ? emptySlotIsActive : id === activeId) {
            activeRemoved = true;
          }
        }
      }
      if (activeRemoved) {
        if (this._visibleList.length === 0) {
          this._setActiveSession(void 0, false, tsx);
        } else {
          const fallbackIdx = Math.max(0, Math.min(activeIdx - 1, this._visibleList.length - 1));
          const fallbackId = this._visibleList[fallbackIdx];
          const fallbackWrapper = fallbackId !== void 0 ? this._wrappers.get(fallbackId) : void 0;
          this._setActiveSession(fallbackWrapper, false, tsx);
        }
      }
      if (changed) {
        this._refresh(tsx);
      }
    });
  }
  /**
   * Set the active chat for the given session's wrapper. No-op if the
   * session is not currently tracked in the visibility model.
   */
  setActiveChat(session, chat) {
    this._wrappers.get(session.sessionId)?.setActiveChat(chat);
  }
  /**
   * Close (hide from the tab strip) the given chat in the session's wrapper.
   * No-op if the session is not currently tracked in the visibility model.
   */
  closeChat(session, chat) {
    this._wrappers.get(session.sessionId)?.closeChat(chat);
  }
  /**
   * Open (un-hide from the tab strip) a previously closed chat in the session's
   * wrapper. No-op if the session is not currently tracked in the visibility model.
   */
  openChat(session, chat) {
    this._wrappers.get(session.sessionId)?.openChat(chat);
  }
  /**
   * Replace the given session in the visibility model with `updatedSession`,
   * preserving the grid slot, sticky state, and active state. The wrapper
   * for the old session is disposed; a fresh wrapper is created for the
   * updated session. No-op if `session` is not currently in the grid.
   */
  updateSession(session, updatedSession) {
    const fromId = session.sessionId;
    if (!this._visibleList.includes(fromId)) {
      return;
    }
    const wasActive = this._activeSession.get()?.sessionId === fromId;
    this.replaceId(fromId, updatedSession.sessionId);
    if (fromId === updatedSession.sessionId && this._wrappers.has(fromId)) {
      this._wrappers.deleteAndDispose(fromId);
    }
    transaction((tsx) => {
      const visibleSession = this._getOrCreateVisibleSession(updatedSession);
      if (wasActive) {
        this._setActiveSession(visibleSession, false, tsx);
      }
      this._refresh(tsx);
    });
  }
  /**
   * Create a transient {@link ISession} that mirrors the given session but
   * exposes a different {@link ISession.resource}. The visibility model's
   * wrapper for the same session id is rebuilt against this transient
   * session so consumers observe the new resource. Returns the transient
   * session so callers can pass it to a subsequent {@link updateSession}
   * once the provider produces the final session.
   *
   * No-op (but still returns the transient session) if the session is not
   * currently in the grid.
   */
  updateResourceOfSession(session, resource) {
    const tmpSession = new ResourceOverrideSession(session, resource);
    this.updateSession(session, tmpSession);
    return tmpSession;
  }
  /**
   * Rename a session id in the visibility model so the same grid slot is
   * reused for the replacement. The old wrapper is disposed; a fresh one is
   * created lazily on next access. Does not auto-refresh — callers should
   * call {@link refresh} or {@link setActive} as appropriate.
   */
  replaceId(fromId, toId) {
    if (fromId === toId) {
      return;
    }
    const idx = this._visibleList.indexOf(fromId);
    if (idx >= 0) {
      this._visibleList.splice(idx, 1, toId);
    }
    if (this._stickyIds.delete(fromId)) {
      this._stickyIds.add(toId);
    }
    if (this._mostRecentNonStickySlot === fromId) {
      this._mostRecentNonStickySlot = toId;
    }
    if (this._wrappers.has(fromId)) {
      this._wrappers.deleteAndDispose(fromId);
    }
  }
  /** Re-publish the visible sessions and sticky ids observables. */
  refresh() {
    this._refresh(void 0);
  }
  _findLastNonSticky() {
    for (let i = this._visibleList.length - 1; i >= 0; i--) {
      const sid = this._visibleList[i];
      if (!this._isStickySlot(sid)) {
        return sid;
      }
    }
    return NO_RECENT;
  }
  /** True if the given slot id refers to a sticky session. The empty slot is never sticky. */
  _isStickySlot(id) {
    return id !== void 0 && this._stickyIds.has(id);
  }
  /**
   * Returns the slot id of the currently active entry in the grid, or
   * {@link NO_RECENT} if no entry in the grid is active.
   */
  _currentActiveSlot() {
    const activeId = this._activeSession.get()?.sessionId;
    if (activeId !== void 0) {
      return this._visibleList.includes(activeId) ? activeId : NO_RECENT;
    }
    return this._visibleList.includes(void 0) ? void 0 : NO_RECENT;
  }
  _removeFromModel(sessionId) {
    let changed = false;
    const idx = this._visibleList.indexOf(sessionId);
    if (idx >= 0) {
      this._visibleList.splice(idx, 1);
      changed = true;
    }
    if (sessionId !== void 0 && this._stickyIds.delete(sessionId)) {
      changed = true;
    }
    if (this._mostRecentNonStickySlot === sessionId) {
      this._mostRecentNonStickySlot = this._findLastNonSticky();
      changed = true;
    }
    if (sessionId !== void 0 && this._wrappers.has(sessionId)) {
      this._wrappers.deleteAndDispose(sessionId);
      changed = true;
    }
    return changed;
  }
  _refresh(tsx) {
    const wrappers = [];
    for (const id of this._visibleList) {
      if (id === void 0) {
        wrappers.push(void 0);
        continue;
      }
      const visibleSession = this._wrappers.get(id);
      if (visibleSession) {
        visibleSession.setSticky(this._stickyIds.has(id));
        wrappers.push(visibleSession);
      }
    }
    this._visibleSessions.set(wrappers, tsx);
  }
  _getOrCreateVisibleSession(session) {
    let visibleSession = this._wrappers.get(session.sessionId);
    if (visibleSession) {
      return visibleSession;
    }
    const initialChat = this._resolveInitialChat(session);
    visibleSession = new VisibleSession(session, initialChat, this._resolveInitialClosedChats(session));
    const visibleSessionRef = visibleSession;
    visibleSession.addDisposable(autorun((reader) => {
      const chats = session.chats.read(reader);
      const activeChat = visibleSessionRef.activeChat.read(reader);
      if (activeChat && !chats.some((c) => this._uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
        const visibleChatTabs = visibleSessionRef.visibleChatTabs.read(reader);
        const fallback = visibleChatTabs[visibleChatTabs.length - 1] ?? session.mainChat.read(reader);
        if (fallback) {
          visibleSessionRef.setActiveChat(fallback);
        }
      }
    }));
    this._wrappers.set(session.sessionId, visibleSession);
    return visibleSession;
  }
};
VisibleSessions = __decorateClass([
  __decorateParam(2, IUriIdentityService)
], VisibleSessions);
export {
  VisibleSession,
  VisibleSessions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvdmlzaWJsZVNlc3Npb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIElUcmFuc2FjdGlvbiwgYXV0b3J1biwgZGVyaXZlZCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBDaGF0T3JpZ2luS2luZCwgSUNoYXQsIElTZXNzaW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb24uanMnO1xuXG4vKipcbiAqIFdyYXBzIGFuIHtAbGluayBJU2Vzc2lvbn0gd2l0aCBhbiBhY3RpdmUgY2hhdCBvYnNlcnZhYmxlIHRvIGZvcm0gYW5cbiAqIHtAbGluayBJQWN0aXZlU2Vzc2lvbn0uIERlbGVnYXRlcyBhbGwge0BsaW5rIElTZXNzaW9ufSBwcm9wZXJ0eSBhY2Nlc3Nlc1xuICogdG8gdGhlIHdyYXBwZWQgc2Vzc2lvbiBzbyB0aGUgYWN0aXZlIHNlc3Npb24gYWx3YXlzIHJlZmxlY3RzIHRoZSBsYXRlc3RcbiAqIHNlc3Npb24gc3RhdGUgd2l0aG91dCBhIHN0YWxlIHNoYWxsb3cgY29weS5cbiAqXG4gKiBPbmUgaW5zdGFuY2UgZXhpc3RzIHBlciBzZXNzaW9uIGN1cnJlbnRseSBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbFxuICogKGFjdGl2ZSwgdHJhbnNpZW50LCBvciBzdGlja3kpLiBFYWNoIGluc3RhbmNlIG93bnMgaXRzIG93biBhY3RpdmUtY2hhdFxuICogb2JzZXJ2YWJsZSBzbyB2aXNpYmxlLWJ1dC1ub3QtYWN0aXZlIHNlc3Npb25zIHJldGFpbiB0aGVpciBwZXItc2Vzc2lvblxuICogY2hhdCBzZWxlY3Rpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBWaXNpYmxlU2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWN0aXZlU2Vzc2lvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNDcmVhdGVkO1xuXHRyZWFkb25seSBpc0NyZWF0ZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0aWNreSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignYWN0aXZlU2Vzc2lvblN0aWNreScsIGZhbHNlKTtcblx0cmVhZG9ubHkgc3RpY2t5OiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX3N0aWNreTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDaGF0OiBJU2V0dGFibGVPYnNlcnZhYmxlPElDaGF0Pjtcblx0cmVhZG9ubHkgYWN0aXZlQ2hhdDogSU9ic2VydmFibGU8SUNoYXQ+O1xuXG5cdC8qKlxuXHQgKiBNb2RlbCBhbmQgbW9kZSBhcmUgc2NvcGVkIHRvIHRoZSBhY3RpdmUgY2hhdCBzbyB0aGUgQWdlbnRzIHdpbmRvdyBwaWNrZXJzXG5cdCAqIHJlYWQgYW5kIHdyaXRlIHRoZSBzZWxlY3Rpb24gb2YgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGNoYXQsIG5vdCB0aGVcblx0ICogc2Vzc2lvbi9kZWZhdWx0IGNoYXQuIFNlc3Npb25zIHdpdGggbXVsdGlwbGUgcGVlciBjaGF0cyBrZWVwIGFuXG5cdCAqIGluZGVwZW5kZW50IG1vZGVsL2FnZW50IHBlciBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2hhdE1vZGVsSWQ6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNoYXRNb2RlOiBJT2JzZXJ2YWJsZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPjtcblxuXHQvKiogUmVzb3VyY2Ugc3RyaW5ncyBvZiBjaGF0cyB0aGF0IGhhdmUgYmVlbiBjbG9zZWQgKGhpZGRlbiBmcm9tIHRoZSB0YWIgc3RyaXApLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZWRDaGF0VXJpczogSVNldHRhYmxlT2JzZXJ2YWJsZTxSZWFkb25seVNldDxzdHJpbmc+Pjtcblx0LyoqXG5cdCAqIFJlc291cmNlIHN0cmluZ3Mgb2Ygc3ViYWdlbnQgKHRvb2wtb3JpZ2luKSBjaGF0cyB0aGUgdXNlciBleHBsaWNpdGx5IG9wZW5lZCxcblx0ICogc28gdGhleSBzdXJmYWNlIGFzIHRhYnMuIFN1YmFnZW50cyBhcmUgaGlkZGVuIGZyb20gdGhlIHRhYiBzdHJpcCBieSBkZWZhdWx0O1xuXHQgKiB0aGlzIHNldCBpcyBub3QgcGVyc2lzdGVkLCBzbyB0aGV5IHJldmVydCB0byBoaWRkZW4gb24gcmVsb2FkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd25TdWJhZ2VudFVyaXM6IElTZXR0YWJsZU9ic2VydmFibGU8UmVhZG9ubHlTZXQ8c3RyaW5nPj47XG5cdC8qKiBBcHBlbmQtb25seSBsaXN0IHRyYWNraW5nIGNsb3NlIG9yZGVyOyBsYXN0IGVsZW1lbnQgaXMgdGhlIG1vc3QgcmVjZW50bHkgY2xvc2VkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZWRDaGF0T3JkZXI6IElDaGF0W10gPSBbXTtcblx0cmVhZG9ubHkgb3BlbkNoYXRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPjtcblx0cmVhZG9ubHkgY2xvc2VkQ2hhdHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXHRyZWFkb25seSB2aXNpYmxlQ2hhdFRhYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXHRyZWFkb25seSBzaG91bGRTaG93Q2hhdFRhYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IElTZXNzaW9uLFxuXHRcdGluaXRpYWxDaGF0OiBJQ2hhdCxcblx0XHRpbml0aWFsQ2xvc2VkQ2hhdFVyaXM/OiBJdGVyYWJsZTxzdHJpbmc+LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2FjdGl2ZUNoYXQgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXQ+KGBhY3RpdmVDaGF0LSR7X3Nlc3Npb24uc2Vzc2lvbklkfWAsIGluaXRpYWxDaGF0KTtcblx0XHR0aGlzLmFjdGl2ZUNoYXQgPSB0aGlzLl9hY3RpdmVDaGF0O1xuXG5cdFx0dGhpcy5fYWN0aXZlQ2hhdE1vZGVsSWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9hY3RpdmVDaGF0LnJlYWQocmVhZGVyKS5tb2RlbElkLnJlYWQocmVhZGVyKSk7XG5cdFx0dGhpcy5fYWN0aXZlQ2hhdE1vZGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9hY3RpdmVDaGF0LnJlYWQocmVhZGVyKS5tb2RlLnJlYWQocmVhZGVyKSk7XG5cblx0XHQvLyBTZWVkIHRoZSBjbG9zZWQgc2V0IGZyb20gcGVyc2lzdGVkIHN0YXRlLCBidXQgbmV2ZXIgaGlkZSB0aGUgY2hhdCB0aGF0XG5cdFx0Ly8gaXMgYmVpbmcgcmVzdG9yZWQgYXMgYWN0aXZlLCBub3IgdGhlIG1haW4gY2hhdCAod2hpY2ggY2FuIG5ldmVyIGJlXG5cdFx0Ly8gY2xvc2VkIGFuZCBtdXN0IGFsd2F5cyByZW1haW4gaW4gdGhlIHRhYiBzdHJpcCkuXG5cdFx0Y29uc3Qgc2VlZCA9IG5ldyBTZXQoaW5pdGlhbENsb3NlZENoYXRVcmlzKTtcblx0XHRzZWVkLmRlbGV0ZShfc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3RpdmVVcmkgPSBpbml0aWFsQ2hhdD8ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAoYWN0aXZlVXJpKSB7XG5cdFx0XHRzZWVkLmRlbGV0ZShhY3RpdmVVcmkpO1xuXHRcdH1cblx0XHR0aGlzLl9jbG9zZWRDaGF0VXJpcyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+PignY2xvc2VkQ2hhdFVyaXMnLCBzZWVkKTtcblxuXHRcdC8vIFN1YmFnZW50cyBhcmUgaGlkZGVuIGJ5IGRlZmF1bHQ7IGlmIHRoZSByZXN0b3JlZCBhY3RpdmUgY2hhdCBpcyBvbmUsXG5cdFx0Ly8gc3VyZmFjZSBpdHMgdGFiIHNvIHRoZSBzZXNzaW9uIG9wZW5zIHdoZXJlIHRoZSB1c2VyIGxlZnQgb2ZmLlxuXHRcdGNvbnN0IHNob3duU3ViYWdlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0aWYgKGluaXRpYWxDaGF0Py5vcmlnaW4/LmtpbmQgPT09IENoYXRPcmlnaW5LaW5kLlRvb2wpIHtcblx0XHRcdHNob3duU3ViYWdlbnRzLmFkZChpbml0aWFsQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0dGhpcy5fc2hvd25TdWJhZ2VudFVyaXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4oJ3Nob3duU3ViYWdlbnRVcmlzJywgc2hvd25TdWJhZ2VudHMpO1xuXG5cdFx0dGhpcy5faXNDcmVhdGVkID0gX3Nlc3Npb24uc3RhdHVzLm1hcChzdGF0dXMgPT4gc3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHR0aGlzLmlzQ3JlYXRlZCA9IHRoaXMuX2lzQ3JlYXRlZDtcblxuXHRcdHRoaXMub3BlbkNoYXRzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2xvc2VkID0gdGhpcy5fY2xvc2VkQ2hhdFVyaXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY2hhdHMgPSB0aGlzLl9zZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIEhpZGRlbiBjaGF0cyBhcmUgaW50ZXJuYWwgd29ya2VycyB0aGF0IG11c3QgbmV2ZXIgYmUgc3VyZmFjZWQgaW4gdGhlXG5cdFx0XHQvLyBjb252ZXJzYXRpb24gdGFiIHN0cmlwOyBjbG9zZWQgY2hhdHMgYXJlIHVzZXItZGlzbWlzc2VkLlxuXHRcdFx0cmV0dXJuIGNoYXRzLmZpbHRlcihjID0+XG5cdFx0XHRcdGMuaW50ZXJhY3Rpdml0eS5yZWFkKHJlYWRlcikgIT09IENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbiAmJlxuXHRcdFx0XHQhY2xvc2VkLmhhcyhjLnJlc291cmNlLnRvU3RyaW5nKCkpKTtcblx0XHR9KTtcblx0XHR0aGlzLmNsb3NlZENoYXRzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2xvc2VkID0gdGhpcy5fY2xvc2VkQ2hhdFVyaXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGNsb3NlZC5zaXplID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9zZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKS5maWx0ZXIoYyA9PiBjbG9zZWQuaGFzKGMucmVzb3VyY2UudG9TdHJpbmcoKSkpO1xuXHRcdH0pO1xuXHRcdC8vIFRhYiBzdHJpcCBjb250ZW50czogdGhlIG9wZW4gY2hhdHMgaW4gdGhlIHByb3ZpZGVyJ3Mgb3JkZXIsIHdpdGggc3ViYWdlbnRcblx0XHQvLyAodG9vbC1vcmlnaW4pIGNoYXRzIGhpZGRlbiBieSBkZWZhdWx0LiBBIHN1YmFnZW50IHN1cmZhY2VzIGFzIGEgdGFiIG9ubHlcblx0XHQvLyBvbmNlIGV4cGxpY2l0bHkgb3BlbmVkIChlLmcuIGZyb20gdGhlIENvbnZlcnNhdGlvbnMgbWVudSksIHRyYWNrZWQgaW5cblx0XHQvLyBgX3Nob3duU3ViYWdlbnRVcmlzYC4gSGlkZGVuIGFuZCBjbG9zZWQgY2hhdHMgYXJlIGV4Y2x1ZGVkIGJ5IGBvcGVuQ2hhdHNgLlxuXHRcdHRoaXMudmlzaWJsZUNoYXRUYWJzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvd25TdWJhZ2VudHMgPSB0aGlzLl9zaG93blN1YmFnZW50VXJpcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5vcGVuQ2hhdHMucmVhZChyZWFkZXIpLmZpbHRlcihjID0+XG5cdFx0XHRcdGMub3JpZ2luPy5raW5kICE9PSBDaGF0T3JpZ2luS2luZC5Ub29sIHx8XG5cdFx0XHRcdHNob3duU3ViYWdlbnRzLmhhcyhjLnJlc291cmNlLnRvU3RyaW5nKCkpKTtcblx0XHR9KTtcblx0XHQvLyBTaG93biBvbmx5IHdoZW4gdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBjaGF0IGFjdHVhbGx5IHNob3dpbmcgYXMgYSB0YWIuXG5cdFx0Ly8gQSBzaW5nbGUgdmlzaWJsZSB0YWIgKGV2ZW4gaWYgb3RoZXIgY2hhdHMgYXJlIGNsb3NlZCwgb3IgaXRzIHRpdGxlXG5cdFx0Ly8gZGl2ZXJnZWQgZnJvbSB0aGUgc2Vzc2lvbiB0aXRsZSwgb3Igc3ViYWdlbnRzIGV4aXN0KSBhbHdheXMgaGlkZXMgdGhlXG5cdFx0Ly8gc3RyaXA7IHRoZSBDb252ZXJzYXRpb25zIG1lbnUgc3VyZmFjZXMgaW4gdGhlIHNlc3Npb24gaGVhZGVyIGluc3RlYWQuXG5cdFx0dGhpcy5zaG91bGRTaG93Q2hhdFRhYnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDE7XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRBY3RpdmVDaGF0KGNoYXQ6IElDaGF0KTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlQ2hhdC5zZXQoY2hhdCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGNsb3NlQ2hhdChjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Ly8gVGhlIG1haW4gY2hhdCByZXByZXNlbnRzIHRoZSBzZXNzaW9uIGl0c2VsZiBhbmQgaXMgbmV2ZXIgY2xvc2VkLlxuXHRcdGlmIChjaGF0VXJpID09PSB0aGlzLl9zZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQ2xvc2luZyBhIHN1YmFnZW50ICh0b29sLW9yaWdpbikgdGFiIGp1c3QgaGlkZXMgaXQgYWdhaW47IGl0IHN0YXlzXG5cdFx0Ly8gcmVhY2hhYmxlIGZyb20gdGhlIENvbnZlcnNhdGlvbnMgbWVudSBhbmQgaXMgbm90IGFkZGVkIHRvIHRoZVxuXHRcdC8vIHJlb3BlbmFibGUgY2xvc2VkIHNldC5cblx0XHRpZiAoY2hhdC5vcmlnaW4/LmtpbmQgPT09IENoYXRPcmlnaW5LaW5kLlRvb2wpIHtcblx0XHRcdGNvbnN0IHNob3duID0gdGhpcy5fc2hvd25TdWJhZ2VudFVyaXMuZ2V0KCk7XG5cdFx0XHRpZiAoIXNob3duLmhhcyhjaGF0VXJpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXh0U2hvd24gPSBuZXcgU2V0KHNob3duKTtcblx0XHRcdG5leHRTaG93bi5kZWxldGUoY2hhdFVyaSk7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nob3duU3ViYWdlbnRVcmlzLnNldChuZXh0U2hvd24sIHR4KTtcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY2hhdFVyaSkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZUNoYXQuc2V0KHRoaXMuX2RlZmF1bHRBY3RpdmVDaGF0KHRoaXMuX2Nsb3NlZENoYXRVcmlzLmdldCgpLCBuZXh0U2hvd24pLCB0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjbG9zZWQgPSB0aGlzLl9jbG9zZWRDaGF0VXJpcy5nZXQoKTtcblx0XHRpZiAoY2xvc2VkLmhhcyhjaGF0VXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0ID0gbmV3IFNldChjbG9zZWQpO1xuXHRcdG5leHQuYWRkKGNoYXRVcmkpO1xuXHRcdHRoaXMuX2Nsb3NlZENoYXRPcmRlci5wdXNoKGNoYXQpO1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX2Nsb3NlZENoYXRVcmlzLnNldChuZXh0LCB0eCk7XG5cdFx0XHQvLyBJZiB0aGUgY2xvc2VkIGNoYXQgd2FzIGFjdGl2ZSwgZmFsbCBiYWNrIHRvIGFub3RoZXIgdmlzaWJsZSB0YWIuXG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0VXJpKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUNoYXQuc2V0KHRoaXMuX2RlZmF1bHRBY3RpdmVDaGF0KG5leHQsIHRoaXMuX3Nob3duU3ViYWdlbnRVcmlzLmdldCgpKSwgdHgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3BlbkNoYXQoY2hhdDogSUNoYXQpOiB2b2lkIHtcblx0XHQvLyBPcGVuaW5nIGEgc3ViYWdlbnQgKHRvb2wtb3JpZ2luKSBjaGF0IHN1cmZhY2VzIGl0IGFzIGEgdGFiLlxuXHRcdGlmIChjaGF0Lm9yaWdpbj8ua2luZCA9PT0gQ2hhdE9yaWdpbktpbmQuVG9vbCkge1xuXHRcdFx0Y29uc3Qgc2hvd24gPSB0aGlzLl9zaG93blN1YmFnZW50VXJpcy5nZXQoKTtcblx0XHRcdGlmIChzaG93bi5oYXMoY2hhdC5yZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXh0ID0gbmV3IFNldChzaG93bik7XG5cdFx0XHRuZXh0LmFkZChjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5fc2hvd25TdWJhZ2VudFVyaXMuc2V0KG5leHQsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNsb3NlZCA9IHRoaXMuX2Nsb3NlZENoYXRVcmlzLmdldCgpO1xuXHRcdGlmICghY2xvc2VkLmhhcyhjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSBuZXcgU2V0KGNsb3NlZCk7XG5cdFx0bmV4dC5kZWxldGUoY2hhdC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR0aGlzLl9jbG9zZWRDaGF0VXJpcy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9jbG9zZWRDaGF0T3JkZXIuZmluZExhc3RJbmRleChjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fY2xvc2VkQ2hhdE9yZGVyLnNwbGljZShpZHgsIDEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQaWNrIHRoZSBhY3RpdmUgY2hhdCB0byBmYWxsIGJhY2sgdG8gd2hlbiB0aGUgY3VycmVudCBvbmUgaXMgY2xvc2VkOiB0aGVcblx0ICogbGFzdCBjaGF0IHRoYXQgd291bGQgYXBwZWFyIGFzIGEgdmlzaWJsZSB0YWIgZ2l2ZW4gdGhlIGNsb3NlZCBhbmQgc2hvd24tXG5cdCAqIHN1YmFnZW50IHNldHMsIG9yIHRoZSBtYWluIGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIF9kZWZhdWx0QWN0aXZlQ2hhdChjbG9zZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4sIHNob3duU3ViYWdlbnRzOiBSZWFkb25seVNldDxzdHJpbmc+KTogSUNoYXQge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSB0aGlzLl9zZXNzaW9uLmNoYXRzLmdldCgpLmZpbHRlcihjID0+XG5cdFx0XHRjLmludGVyYWN0aXZpdHkuZ2V0KCkgIT09IENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbiAmJlxuXHRcdFx0IWNsb3NlZC5oYXMoYy5yZXNvdXJjZS50b1N0cmluZygpKSAmJlxuXHRcdFx0KGMub3JpZ2luPy5raW5kICE9PSBDaGF0T3JpZ2luS2luZC5Ub29sIHx8IHNob3duU3ViYWdlbnRzLmhhcyhjLnJlc291cmNlLnRvU3RyaW5nKCkpKSk7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZXNbY2FuZGlkYXRlcy5sZW5ndGggLSAxXSA/PyB0aGlzLl9zZXNzaW9uLm1haW5DaGF0LmdldCgpO1xuXHR9XG5cblx0Z2V0IGxhc3RDbG9zZWRDaGF0KCk6IElDaGF0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBGaWx0ZXIgb3V0IHN0YWxlIGVudHJpZXMgd2hvc2UgY2hhdCBoYXMgc2luY2UgYmVlbiBkZWxldGVkIGZyb20gdGhlIHNlc3Npb24uXG5cdFx0Y29uc3QgY3VycmVudENoYXRzID0gdGhpcy5fc2Vzc2lvbi5jaGF0cy5nZXQoKTtcblx0XHRjb25zdCBjbG9zZWQgPSB0aGlzLl9jbG9zZWRDaGF0VXJpcy5nZXQoKTtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fY2xvc2VkQ2hhdE9yZGVyLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBjaGF0ID0gdGhpcy5fY2xvc2VkQ2hhdE9yZGVyW2ldO1xuXHRcdFx0Y29uc3QgdXJpID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0aWYgKGNsb3NlZC5oYXModXJpKSAmJiBjdXJyZW50Q2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gY2hhdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFN0aWNreSh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3N0aWNreS5zZXQodmFsdWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogUmVnaXN0ZXIgYSBkaXNwb3NhYmxlIHRoYXQgbGl2ZXMgYXMgbG9uZyBhcyB0aGlzIHdyYXBwZXIuICovXG5cdGFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25JZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uc2Vzc2lvbklkOyB9XG5cdGdldCByZXNvdXJjZSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ucmVzb3VyY2U7IH1cblx0Z2V0IHByb3ZpZGVySWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnByb3ZpZGVySWQ7IH1cblx0Z2V0IHNlc3Npb25UeXBlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5zZXNzaW9uVHlwZTsgfVxuXHRnZXQgaWNvbigpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaWNvbjsgfVxuXHRnZXQgY3JlYXRlZEF0KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jcmVhdGVkQXQ7IH1cblx0Z2V0IHdvcmtzcGFjZSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ud29ya3NwYWNlOyB9XG5cdGdldCBoYXNHaXRSZXBvc2l0b3J5KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5oYXNHaXRSZXBvc2l0b3J5OyB9XG5cdGdldCB3b3JrdHJlZVBlbmRpbmcoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLndvcmt0cmVlUGVuZGluZzsgfVxuXHRnZXQgaXNRdWlja0NoYXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzUXVpY2tDaGF0OyB9XG5cdGdldCB0aXRsZSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24udGl0bGU7IH1cblx0Z2V0IHVwZGF0ZWRBdCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24udXBkYXRlZEF0OyB9XG5cdGdldCBzdGF0dXMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnN0YXR1czsgfVxuXHRnZXQgY2hhbmdlc1N1bW1hcnkoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNoYW5nZXNTdW1tYXJ5OyB9XG5cdGdldCBjaGFuZ2VzZXRzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jaGFuZ2VzZXRzOyB9XG5cdGdldCBjaGFuZ2VzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jaGFuZ2VzOyB9XG5cdGdldCBleHRlcm5hbENoYW5nZXMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmV4dGVybmFsQ2hhbmdlczsgfVxuXHRnZXQgbW9kZWxJZCgpIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUNoYXRNb2RlbElkOyB9XG5cdGdldCBtb2RlKCkgeyByZXR1cm4gdGhpcy5fYWN0aXZlQ2hhdE1vZGU7IH1cblx0Z2V0IGxvYWRpbmcoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmxvYWRpbmc7IH1cblx0Z2V0IGlzQXJjaGl2ZWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzQXJjaGl2ZWQ7IH1cblx0Z2V0IGlzUmVhZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaXNSZWFkOyB9XG5cdGdldCBkZXNjcmlwdGlvbigpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uZGVzY3JpcHRpb247IH1cblx0Z2V0IGxhc3RUdXJuRW5kKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5sYXN0VHVybkVuZDsgfVxuXHRnZXQgY2hhdHMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNoYXRzOyB9XG5cdGdldCBtYWluQ2hhdCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ubWFpbkNoYXQ7IH1cblx0Z2V0IGNhcGFiaWxpdGllcygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2FwYWJpbGl0aWVzOyB9XG59XG5cbi8qKlxuICogTGlnaHR3ZWlnaHQge0BsaW5rIElTZXNzaW9ufSBhZGFwdGVyIHRoYXQgZGVsZWdhdGVzIGV2ZXJ5IHByb3BlcnR5IHRvIGFcbiAqIHdyYXBwZWQgc2Vzc2lvbiBidXQgZXhwb3NlcyBhIGRpZmZlcmVudCB7QGxpbmsgSVNlc3Npb24ucmVzb3VyY2V9IHZhbHVlLlxuICpcbiAqIFVzZWQgYXMgYSB0cmFuc2llbnQgc2Vzc2lvbiBpbnN0YW5jZSBkdXJpbmcgdGhlIGNyZWF0ZS1jaGF0IC8gc2VuZC1yZXF1ZXN0XG4gKiB0cmFuc2l0aW9uLCBzbyB0aGUgdmlzaWJpbGl0eSBtb2RlbCBjYW4gcmVmbGVjdCB0aGUgbmV3IGNoYXQgcmVzb3VyY2Ugb25cbiAqIHRoZSBzYW1lIGdyaWQgc2xvdCBiZWZvcmUgdGhlIHByb3ZpZGVyIGhhcyBwcm9kdWNlZCBhIGZpbmFsIHNlc3Npb24uXG4gKi9cbmNsYXNzIFJlc291cmNlT3ZlcnJpZGVTZXNzaW9uIGltcGxlbWVudHMgSVNlc3Npb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IElTZXNzaW9uLFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdCkgeyB9XG5cblx0Z2V0IHNlc3Npb25JZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uc2Vzc2lvbklkOyB9XG5cdGdldCBwcm92aWRlcklkKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5wcm92aWRlcklkOyB9XG5cdGdldCBzZXNzaW9uVHlwZSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uc2Vzc2lvblR5cGU7IH1cblx0Z2V0IGljb24oKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmljb247IH1cblx0Z2V0IGNyZWF0ZWRBdCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY3JlYXRlZEF0OyB9XG5cdGdldCB3b3Jrc3BhY2UoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLndvcmtzcGFjZTsgfVxuXHRnZXQgaGFzR2l0UmVwb3NpdG9yeSgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaGFzR2l0UmVwb3NpdG9yeTsgfVxuXHRnZXQgd29ya3RyZWVQZW5kaW5nKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi53b3JrdHJlZVBlbmRpbmc7IH1cblx0Z2V0IGlzUXVpY2tDaGF0KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5pc1F1aWNrQ2hhdDsgfVxuXHRnZXQgdGl0bGUoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnRpdGxlOyB9XG5cdGdldCB1cGRhdGVkQXQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLnVwZGF0ZWRBdDsgfVxuXHRnZXQgc3RhdHVzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5zdGF0dXM7IH1cblx0Z2V0IGNoYW5nZXNTdW1tYXJ5KCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeTsgfVxuXHRnZXQgY2hhbmdlcygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2hhbmdlczsgfVxuXHRnZXQgY2hhbmdlc2V0cygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2hhbmdlc2V0czsgfVxuXHRnZXQgZXh0ZXJuYWxDaGFuZ2VzKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5leHRlcm5hbENoYW5nZXM7IH1cblx0Z2V0IG1vZGVsSWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLm1vZGVsSWQ7IH1cblx0Z2V0IG1vZGUoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLm1vZGU7IH1cblx0Z2V0IGxvYWRpbmcoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmxvYWRpbmc7IH1cblx0Z2V0IGlzQXJjaGl2ZWQoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmlzQXJjaGl2ZWQ7IH1cblx0Z2V0IGlzUmVhZCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uaXNSZWFkOyB9XG5cdGdldCBkZXNjcmlwdGlvbigpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uZGVzY3JpcHRpb247IH1cblx0Z2V0IGxhc3RUdXJuRW5kKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbi5sYXN0VHVybkVuZDsgfVxuXHRnZXQgY2hhdHMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uLmNoYXRzOyB9XG5cdGdldCBtYWluQ2hhdCgpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ubWFpbkNoYXQ7IH1cblx0Z2V0IGNhcGFiaWxpdGllcygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24uY2FwYWJpbGl0aWVzOyB9XG59XG5cbi8qKlxuICogU2VudGluZWwgdXNlZCB0byBkaXN0aW5ndWlzaCBcIm5vIHNsb3QgdHJhY2tlZFwiIGZyb20gdGhlIGVtcHR5IHNsb3RcbiAqICh3aGljaCBpcyBpdHNlbGYgcmVwcmVzZW50ZWQgYnkgYHVuZGVmaW5lZGAgaW4gdGhlIHZpc2libGUgbGlzdCkuXG4gKi9cbmNvbnN0IE5PX1JFQ0VOVCA9IFN5bWJvbCgnbm8tcmVjZW50Jyk7XG5cbi8qKlxuICogRW5jYXBzdWxhdGVzIHRoZSB2aXNpYmlsaXR5IG1vZGVsIHVzZWQgYnkgdGhlXG4gKiB7QGxpbmsgU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZX0uXG4gKlxuICogVGhlIG1vZGVsIHRyYWNrczpcbiAqIC0gVGhlIGN1cnJlbnRseSBhY3RpdmUgc2Vzc2lvbi5cbiAqIC0gQW4gb3JkZXJlZCBsaXN0IG9mIHNsb3RzIHRvIGRpc3BsYXkgaW4gdGhlIHNlc3Npb25zIHBhcnQncyBncmlkLiBBIHNsb3RcbiAqICAgaXMgZWl0aGVyIGEgc2Vzc2lvbiBpZCAoc3RyaW5nKSBvciBgdW5kZWZpbmVkYCAodGhlIFwiZW1wdHlcIiAvIG5ldy1zZXNzaW9uXG4gKiAgIHBsYWNlaG9sZGVyKS4gQXQgbW9zdCBvbmUgc2xvdCBtYXkgYmUgYHVuZGVmaW5lZGAgYXQgYSB0aW1lLlxuICogLSBBIFwic3RpY2t5XCIgc2V0OiBzZXNzaW9ucyB0aGUgdXNlciBoYXMgZXhwbGljaXRseSBwaW5uZWQuIE5vbi1zdGlja3lcbiAqICAgc2Vzc2lvbnMgYWxzbyBsaXZlIGluIHRoZSBncmlkIGJ1dCBnZXQgcmVwbGFjZWQgd2hlbiBuZXcgc2Vzc2lvbnMgb3Blbi5cbiAqICAgVGhlIGVtcHR5IHNsb3QgaXMgYWx3YXlzIG5vbi1zdGlja3kuXG4gKlxuICogRWFjaCB0cmFja2VkIHNlc3Npb24gaGFzIGEgc2luZ2xlIHtAbGluayBWaXNpYmxlU2Vzc2lvbn0gd3JhcHBlciBvd25lZCBieVxuICogdGhpcyBjbGFzcy4gV3JhcHBlcnMgYXJlIGRpc3Bvc2VkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGVpciBzZXNzaW9uIGxlYXZlc1xuICogdGhlIHZpc2liaWxpdHkgbW9kZWwuXG4gKi9cbmV4cG9ydCBjbGFzcyBWaXNpYmxlU2Vzc2lvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4gPSB0aGlzLl9hY3RpdmVTZXNzaW9uO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBtb3N0IHJlY2VudCBhY3RpdmUtc2Vzc2lvbiBjaGFuZ2UgYXNrZWQgdG8gcHJlc2VydmUga2V5Ym9hcmRcblx0ICogZm9jdXMgKGkuZS4gc2hvdyB0aGUgc2Vzc2lvbiB3aXRob3V0IG1vdmluZyBmb2N1cyBpbnRvIGl0KS4gQWx3YXlzIHNldCBpblxuXHQgKiB0aGUgKipzYW1lIHRyYW5zYWN0aW9uKiogYXMge0BsaW5rIF9hY3RpdmVTZXNzaW9ufSB2aWFcblx0ICoge0BsaW5rIF9zZXRBY3RpdmVTZXNzaW9ufSBzbyB0aGUgcGFpciBjYW4gbmV2ZXIgZ28gc3RhbGUsIGFuZCByZWFkXG5cdCAqIHJlYWN0aXZlbHkgYnkgdGhlIGNvbnN1bWVyIHRoYXQgZHJpdmVzIGZvY3VzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUHJlc2VydmVGb2N1cyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IGFjdGl2ZVByZXNlcnZlRm9jdXM6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fYWN0aXZlUHJlc2VydmVGb2N1cztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlU2Vzc2lvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPih0aGlzLCBbdW5kZWZpbmVkXSk7XG5cdHJlYWRvbmx5IHZpc2libGVTZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPiA9IHRoaXMuX3Zpc2libGVTZXNzaW9ucztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93cmFwcGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgVmlzaWJsZVNlc3Npb24+KCkpO1xuXHQvKipcblx0ICogT3JkZXJlZCBzbG90IGlkcyBpbiB0aGUgZ3JpZCAobGVmdC10by1yaWdodCkuIEVhY2ggZW50cnkgaXMgZWl0aGVyIGFcblx0ICogc2Vzc2lvbiBpZCBvciBgdW5kZWZpbmVkYCAodGhlIGVtcHR5IHNsb3QpLiBUaGUgaW52YXJpYW50IGlzIHRoYXQgYXRcblx0ICogbW9zdCBvbmUgZW50cnkgaXMgYHVuZGVmaW5lZGAgYXQgYW55IHRpbWUuXG5cdCAqL1xuXHRwcml2YXRlIF92aXNpYmxlTGlzdDogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHQvKiogU3Vic2V0IG9mIHtAbGluayBfdmlzaWJsZUxpc3R9IHRoZSB1c2VyIGhhcyBtYXJrZWQgc3RpY2t5LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGlja3lJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0LyoqXG5cdCAqIFNsb3QgaWQgb2YgdGhlIG1vc3QgcmVjZW50bHkgb3BlbmVkIChvciB0b2dnbGVkLXRvLW5vbi1zdGlja3kpIGVudHJ5IGluXG5cdCAqIHRoZSBncmlkLiBVc2VkIHRvIGNob29zZSB3aGljaCBub24tc3RpY2t5IHNsb3QgdG8gcmVwbGFjZSB3aGVuIG9wZW5pbmcgYVxuXHQgKiBuZXcgc2Vzc2lvbiB3aGlsZSB0aGUgYWN0aXZlIG9uZSBpcyBzdGlja3kuXG5cdCAqIC0gYE5PX1JFQ0VOVGAgbWVhbnMgbm9uZSBpcyB0cmFja2VkLlxuXHQgKiAtIGB1bmRlZmluZWRgIHJlZmVycyB0byB0aGUgZW1wdHkgc2xvdC5cblx0ICogLSBBIHN0cmluZyByZWZlcnMgdG8gdGhhdCBzZXNzaW9uIGlkLlxuXHQgKi9cblx0cHJpdmF0ZSBfbW9zdFJlY2VudE5vblN0aWNreVNsb3Q6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHR5cGVvZiBOT19SRUNFTlQgPSBOT19SRUNFTlQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZUluaXRpYWxDaGF0OiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IElDaGF0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVJbml0aWFsQ2xvc2VkQ2hhdHM6IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gSXRlcmFibGU8c3RyaW5nPixcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBhY3RpdmUgc2Vzc2lvbiB0b2dldGhlciB3aXRoIGl0cyBwcmVzZXJ2ZS1mb2N1cyBpbnRlbnQgaW4gYVxuXHQgKiBzaW5nbGUgdHJhbnNhY3Rpb24uIFJvdXRpbmcgZXZlcnkgYWN0aXZlLXNlc3Npb24gY2hhbmdlIHRocm91Z2ggaGVyZVxuXHQgKiBndWFyYW50ZWVzIHRoZSB0d28gb2JzZXJ2YWJsZXMgYXJlIGFsd2F5cyBjb25zaXN0ZW50IGFuZCB0aGF0IHRoZSBpbnRlbnRcblx0ICogbmV2ZXIgZ29lcyBzdGFsZSAoY2FsbGVycyB0aGF0IGRvIG5vdCBwcmVzZXJ2ZSBmb2N1cyBwYXNzIGBmYWxzZWApLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgdHN4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uLnNldChzZXNzaW9uLCB0c3gpO1xuXHRcdHRoaXMuX2FjdGl2ZVByZXNlcnZlRm9jdXMuc2V0KHByZXNlcnZlRm9jdXMsIHRzeCk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBhY3RpdmUgc2Vzc2lvbiwgdXBkYXRpbmcgdGhlIHZpc2liaWxpdHkgbW9kZWwgYWNjb3JkaW5nbHkuXG5cdCAqXG5cdCAqIC0gUGFzc2luZyBgdW5kZWZpbmVkYCBwbGFjZXMgKG9yIGtlZXBzKSB0aGUgc2luZ2xlIGVtcHR5IHNsb3QgaW4gdGhlXG5cdCAqICAgZ3JpZCBhbmQgbWFrZXMgaXQgYWN0aXZlLiBUaGUgZW1wdHkgc2xvdCBpcyBhbHdheXMgbm9uLXN0aWNreS5cblx0ICogLSBJZiB0aGUgc2Vzc2lvbiBpcyBhbHJlYWR5IGluIHRoZSBncmlkLCBpdHMgc2xvdCBpcyBwcmVzZXJ2ZWQgYW5kIG9ubHlcblx0ICogICB0aGUgYWN0aXZlIG9ic2VydmFibGUgaXMgdXBkYXRlZC5cblx0ICogLSBPdGhlcndpc2UgdGhlIHNlc3Npb24gaXMgcGxhY2VkIGFzIG5vbi1zdGlja3k6XG5cdCAqICAgLSBJZiB0aGUgYWN0aXZlIHNsb3QgaXMgbm9uLXN0aWNreSwgdGhlIG5ldyBvbmUgcmVwbGFjZXMgaXQgaW5cblx0ICogICAgIHBsYWNlLlxuXHQgKiAgIC0gRWxzZSBpZiBhIG5vbi1zdGlja3kgc2xvdCBleGlzdHMsIHRoZSBtb3N0LXJlY2VudGx5IG9wZW5lZFxuXHQgKiAgICAgbm9uLXN0aWNreSBpcyByZXBsYWNlZC5cblx0ICogICAtIEVsc2UgdGhlIHNlc3Npb24gaXMgYXBwZW5kZWQgYXQgdGhlIGVuZCBvZiB0aGUgZ3JpZC5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgd3JhcHBlciBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZVxuXHQgKiBhY3RpdmUgc2xvdCBpcyB0aGUgZW1wdHkgc2xvdC5cblx0ICovXG5cdHNldEFjdGl2ZShzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcHJlc2VydmVGb2N1czogYm9vbGVhbiA9IGZhbHNlKTogVmlzaWJsZVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRhcmdldElkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBzZXNzaW9uPy5zZXNzaW9uSWQ7XG5cblx0XHRpZiAoIXRoaXMuX3Zpc2libGVMaXN0LmluY2x1ZGVzKHRhcmdldElkKSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2xvdCA9IHRoaXMuX2N1cnJlbnRBY3RpdmVTbG90KCk7XG5cdFx0XHRjb25zdCBhY3RpdmVJc05vblN0aWNreSA9IGFjdGl2ZVNsb3QgIT09IE5PX1JFQ0VOVCAmJiAhdGhpcy5faXNTdGlja3lTbG90KGFjdGl2ZVNsb3QpO1xuXG5cdFx0XHRsZXQgcmVwbGFjZVNsb3Q6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHR5cGVvZiBOT19SRUNFTlQ7XG5cdFx0XHRpZiAoYWN0aXZlSXNOb25TdGlja3kpIHtcblx0XHRcdFx0cmVwbGFjZVNsb3QgPSBhY3RpdmVTbG90O1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCAhPT0gTk9fUkVDRU5UXG5cdFx0XHRcdCYmIHRoaXMuX3Zpc2libGVMaXN0LmluY2x1ZGVzKHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90KVxuXHRcdFx0XHQmJiAhdGhpcy5faXNTdGlja3lTbG90KHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90KSkge1xuXHRcdFx0XHRyZXBsYWNlU2xvdCA9IHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVwbGFjZVNsb3QgPSB0aGlzLl9maW5kTGFzdE5vblN0aWNreSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVwbGFjZVNsb3QgIT09IE5PX1JFQ0VOVCkge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKHJlcGxhY2VTbG90KTtcblx0XHRcdFx0dGhpcy5fdmlzaWJsZUxpc3Quc3BsaWNlKGlkeCwgMSwgdGFyZ2V0SWQpO1xuXHRcdFx0XHRpZiAocmVwbGFjZVNsb3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3dyYXBwZXJzLmRlbGV0ZUFuZERpc3Bvc2UocmVwbGFjZVNsb3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl92aXNpYmxlTGlzdC5wdXNoKHRhcmdldElkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gdGFyZ2V0SWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZVNlc3Npb24gPSBzZXNzaW9uID8gdGhpcy5fZ2V0T3JDcmVhdGVWaXNpYmxlU2Vzc2lvbihzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHR0cmFuc2FjdGlvbigodHN4KSA9PiB7XG5cdFx0XHR0aGlzLl9zZXRBY3RpdmVTZXNzaW9uKHZpc2libGVTZXNzaW9uLCBwcmVzZXJ2ZUZvY3VzLCB0c3gpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaCh0c3gpO1xuXHRcdH0pO1xuXHRcdHJldHVybiB2aXNpYmxlU2Vzc2lvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnNlcnQgKG9yIG1vdmUpIGEgc2xvdCBpbnRvIHRoZSBncmlkIHBvc2l0aW9uZWQgbmV4dCB0byBhIHRhcmdldFxuXHQgKiBzZXNzaW9uIHRoYXQgaXMgYWxyZWFkeSB2aXNpYmxlLiBVc2VkIGJ5IGRyYWctYW5kLWRyb3AgYW5kIGJ5XG5cdCAqIFwib3BlbiBhdCBwb3NpdGlvblwiIGVudHJ5IHBvaW50cy5cblx0ICpcblx0ICogLSBJZiB0aGUgc2xvdCBpcyBub3QgeWV0IHZpc2libGUsIGEgbmV3IG5vbi1zdGlja3kgZW50cnkgaXMgY3JlYXRlZFxuXHQgKiAgIGF0IHRoZSBjb21wdXRlZCBwb3NpdGlvbi4gRm9yIGFuIGB1bmRlZmluZWRgIHNlc3Npb24gKGVtcHR5IHNsb3QpLFxuXHQgKiAgIHRoaXMgaXMgYSBuby1vcCB3aGVuIGFuIGVtcHR5IHNsb3QgYWxyZWFkeSBleGlzdHMgaW4gdGhlIGdyaWQuXG5cdCAqIC0gSWYgdGhlIHNsb3QgaXMgYWxyZWFkeSB2aXNpYmxlLCBpdCBpcyBtb3ZlZCB0byB0aGUgY29tcHV0ZWRcblx0ICogICBwb3NpdGlvbjsgaXRzIHN0aWNreSAvIG5vbi1zdGlja3kgc3RhdGUgaXMgcHJlc2VydmVkLlxuXHQgKlxuXHQgKiBXaGVuIGBhY3RpdmF0ZWAgaXMgYHRydWVgIChkZWZhdWx0KSwgdGhlIGluc2VydGVkIHNsb3QgYWxzbyBiZWNvbWVzXG5cdCAqIHRoZSBhY3RpdmUgc2Vzc2lvbi4gV2hlbiBgZmFsc2VgLCB0aGUgYWN0aXZlIHNlc3Npb24gaXMgbGVmdFxuXHQgKiB1bmNoYW5nZWQuXG5cdCAqXG5cdCAqIGB0YXJnZXRTZXNzaW9uSWRgIG1heSBiZSBgdW5kZWZpbmVkYCB0byBwb3NpdGlvbiByZWxhdGl2ZSB0byB0aGUgZW1wdHlcblx0ICogKG5ldy1zZXNzaW9uKSBzbG90LiBOby1vcCBpZiB0aGUgdGFyZ2V0IHNsb3QgaXMgbm90IGN1cnJlbnRseSB2aXNpYmxlLlxuXHQgKi9cblx0aW5zZXJ0QXQoc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIHRhcmdldFNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzaWRlOiAnbGVmdCcgfCAncmlnaHQnLCBhY3RpdmF0ZTogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBpZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gc2Vzc2lvbj8uc2Vzc2lvbklkO1xuXHRcdGNvbnN0IHRhcmdldElkeCA9IHRoaXMuX3Zpc2libGVMaXN0LmluZGV4T2YodGFyZ2V0U2Vzc2lvbklkKTtcblx0XHRpZiAodGFyZ2V0SWR4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEludmFyaWFudDogYXQgbW9zdCBvbmUgZW1wdHkgc2xvdC4gSWYgaW5zZXJ0aW5nIHRoZSBlbXB0eSBzbG90IGFuZFxuXHRcdC8vIG9uZSBhbHJlYWR5IGV4aXN0cywgZG8gbm90IGFkZCBvciBtb3ZlIGFub3RoZXIuXG5cdFx0aWYgKGlkID09PSB1bmRlZmluZWQgJiYgdGhpcy5fdmlzaWJsZUxpc3QuaW5jbHVkZXModW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkZXN0SWR4ID0gc2lkZSA9PT0gJ2xlZnQnID8gdGFyZ2V0SWR4IDogdGFyZ2V0SWR4ICsgMTtcblxuXHRcdGNvbnN0IGN1cnJlbnRJZHggPSB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKGlkKTtcblx0XHRpZiAoY3VycmVudElkeCA+PSAwKSB7XG5cdFx0XHQvLyBBbHJlYWR5IHZpc2libGU6IG1vdmUgb25seSBpZiB0aGUgZGVzdGluYXRpb24gZGlmZmVycyBmcm9tIHRoZVxuXHRcdFx0Ly8gY3VycmVudCBwb3NpdGlvbiAoZHJvcHBpbmcgdG8gdGhlIHJpZ2h0IG9mIHRoZSBwcmV2aW91cyBzbG90IG9yXG5cdFx0XHQvLyB0byB0aGUgbGVmdCBvZiB0aGUgbmV4dCBzbG90IGFyZSBib3RoIG5vLW9wcykuXG5cdFx0XHRpZiAoY3VycmVudElkeCAhPT0gZGVzdElkeCAmJiBjdXJyZW50SWR4ICsgMSAhPT0gZGVzdElkeCkge1xuXHRcdFx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoY3VycmVudElkeCwgMSk7XG5cdFx0XHRcdGlmIChjdXJyZW50SWR4IDwgZGVzdElkeCkge1xuXHRcdFx0XHRcdGRlc3RJZHgtLTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoZGVzdElkeCwgMCwgaWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pc1N0aWNreVNsb3QoaWQpKSB7XG5cdFx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gaWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX2dldE9yQ3JlYXRlVmlzaWJsZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoZGVzdElkeCwgMCwgaWQpO1xuXHRcdFx0dGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPSBpZDtcblx0XHR9XG5cblx0XHR0cmFuc2FjdGlvbigodHN4KSA9PiB7XG5cdFx0XHRpZiAoYWN0aXZhdGUpIHtcblx0XHRcdFx0Y29uc3Qgd3JhcHBlciA9IGlkICE9PSB1bmRlZmluZWQgPyB0aGlzLl93cmFwcGVycy5nZXQoaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVTZXNzaW9uKHdyYXBwZXIsIGZhbHNlLCB0c3gpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVmcmVzaCh0c3gpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0b21pY2FsbHkgKHJlKWJ1aWxkIHRoZSBlbnRpcmUgZ3JpZCBmcm9tIGEgcGVyc2lzdGVkIHNuYXBzaG90LlxuXHQgKlxuXHQgKiBTbG90cyBhcmUgZ2l2ZW4gbGVmdC10by1yaWdodDsgYSBgc2Vzc2lvbmAgb2YgYHVuZGVmaW5lZGAgZGVub3RlcyB0aGVcblx0ICogZW1wdHkgbmV3LXNlc3Npb24gc2xvdC4gVGhlIHdob2xlIG1vZGVsIFx1MjAxNCBzbG90IG9yZGVyLCBzdGlja2luZXNzIGFuZCB0aGVcblx0ICogYWN0aXZlIHNsb3QgXHUyMDE0IGlzIHB1Ymxpc2hlZCBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbiBzbyByZXN0b3JpbmcgbXVsdGlwbGVcblx0ICogc2Vzc2lvbnMgZG9lcyBub3QgcHJvZHVjZSBpbnRlcm1lZGlhdGUgbGF5b3V0cyAod2hpY2ggd291bGQgb3RoZXJ3aXNlXG5cdCAqIGNhdXNlIHRoZSBncmlkIHRvIHZpc2libHkgZmxpY2tlciBhcyBzZXNzaW9ucyBhcmUgcmVzdG9yZWQgb25lIGJ5IG9uZSkuXG5cdCAqXG5cdCAqIEFueSB3cmFwcGVycyBmb3Igc2Vzc2lvbnMgbm8gbG9uZ2VyIHByZXNlbnQgaW4gdGhlIHNuYXBzaG90IGFyZSBkaXNwb3NlZC5cblx0ICpcblx0ICogQHBhcmFtIHNsb3RzIE9yZGVyZWQgZ3JpZCBzbG90cyB0byByZXN0b3JlLlxuXHQgKiBAcGFyYW0gYWN0aXZlSW5kZXggSW5kZXggaW50byBgc2xvdHNgIG9mIHRoZSBzbG90IHRoYXQgc2hvdWxkIGJlIGFjdGl2ZSxcblx0ICogb3IgYC0xYCBmb3Igbm9uZS5cblx0ICovXG5cdHJlc3RvcmVHcmlkKHNsb3RzOiBSZWFkb25seUFycmF5PHsgcmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQ7IHJlYWRvbmx5IHN0aWNreTogYm9vbGVhbiB9PiwgYWN0aXZlSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGVMaXN0ID0gW107XG5cdFx0dGhpcy5fc3RpY2t5SWRzLmNsZWFyKCk7XG5cblx0XHRsZXQgYWN0aXZlV3JhcHBlcjogVmlzaWJsZVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3ROb25TdGlja3lTbG90OiBzdHJpbmcgfCB1bmRlZmluZWQgfCB0eXBlb2YgTk9fUkVDRU5UID0gTk9fUkVDRU5UO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2xvdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgc3RpY2t5IH0gPSBzbG90c1tpXTtcblx0XHRcdGNvbnN0IGlkID0gc2Vzc2lvbj8uc2Vzc2lvbklkO1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpc3QucHVzaChpZCk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5fZ2V0T3JDcmVhdGVWaXNpYmxlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdFx0aWYgKHN0aWNreSkge1xuXHRcdFx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpID09PSBhY3RpdmVJbmRleCkge1xuXHRcdFx0XHRcdGFjdGl2ZVdyYXBwZXIgPSB3cmFwcGVyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2lzU3RpY2t5U2xvdChpZCkpIHtcblx0XHRcdFx0bGFzdE5vblN0aWNreVNsb3QgPSBpZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIHdyYXBwZXJzIGZvciBzZXNzaW9ucyB0aGF0IGFyZSBubyBsb25nZXIgcGFydCBvZiB0aGUgZ3JpZCBzb1xuXHRcdC8vIHRoZSBtb2RlbCBkb2VzIG5vdCBsZWFrIGVudHJpZXMgZnJvbSBhIHByZXZpb3VzIChlLmcuIHRyYW5zaWVudFxuXHRcdC8vIG5ldy1zZXNzaW9uKSBzdGF0ZS5cblx0XHRmb3IgKGNvbnN0IGV4aXN0aW5nSWQgb2YgWy4uLnRoaXMuX3dyYXBwZXJzLmtleXMoKV0pIHtcblx0XHRcdGlmICghdGhpcy5fdmlzaWJsZUxpc3QuaW5jbHVkZXMoZXhpc3RpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy5fd3JhcHBlcnMuZGVsZXRlQW5kRGlzcG9zZShleGlzdGluZ0lkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNaXJyb3IgdGhlIHNsb3QtcmVwbGFjZW1lbnQgYm9va2tlZXBpbmcgdXNlZCBlbHNld2hlcmU6IHByZWZlciB0aGVcblx0XHQvLyBhY3RpdmUgc2xvdCB3aGVuIGl0IGlzIG5vbi1zdGlja3ksIG90aGVyd2lzZSB0aGUgbGFzdCBub24tc3RpY2t5IHNsb3QuXG5cdFx0Y29uc3QgYWN0aXZlSWQgPSBhY3RpdmVXcmFwcGVyPy5zZXNzaW9uSWQ7XG5cdFx0dGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPSAoYWN0aXZlSWQgIT09IHVuZGVmaW5lZCAmJiAhdGhpcy5faXNTdGlja3lTbG90KGFjdGl2ZUlkKSlcblx0XHRcdD8gYWN0aXZlSWRcblx0XHRcdDogbGFzdE5vblN0aWNreVNsb3Q7XG5cblx0XHR0cmFuc2FjdGlvbih0c3ggPT4ge1xuXHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbihhY3RpdmVXcmFwcGVyLCBmYWxzZSwgdHN4KTtcblx0XHRcdHRoaXMuX3JlZnJlc2godHN4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgYSBzZXNzaW9uJ3Mgc3RpY2tpbmVzcyBpbiB0aGUgZ3JpZC4gVGhlIHNlc3Npb24ga2VlcHMgaXRzIGdyaWRcblx0ICogc2xvdCB3aGVuIHRvZ2dsZWQuXG5cdCAqIC0gSWYgdGhlIHNlc3Npb24gaXMgbm90IGN1cnJlbnRseSB2aXNpYmxlLCBpdCBpcyBhcHBlbmRlZCBhdCB0aGUgZW5kIGFzXG5cdCAqICAgc3RpY2t5LlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSBzZXNzaW9uJ3Mgc3RpY2tpbmVzcyBzdGF0ZSBhZnRlciB0aGUgdG9nZ2xlLlxuXHQgKi9cblx0dG9nZ2xlU3RpY2tpbmVzcyhzZXNzaW9uOiBJU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlkID0gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyhpZCkpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQoaWQpO1xuXHRcdFx0dGhpcy5fZ2V0T3JDcmVhdGVWaXNpYmxlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdHRoaXMuX3Zpc2libGVMaXN0LnB1c2goaWQpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc3RpY2t5SWRzLmhhcyhpZCkpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPSBpZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RpY2t5SWRzLmFkZChpZCk7XG5cdFx0XHRpZiAodGhpcy5fbW9zdFJlY2VudE5vblN0aWNreVNsb3QgPT09IGlkKSB7XG5cdFx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gdGhpcy5fZmluZExhc3ROb25TdGlja3koKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVmcmVzaCh1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0aGlzLl9zdGlja3lJZHMuaGFzKGlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgdGhlIGdpdmVuIHNlc3Npb24gaWRzIGZyb20gdGhlIHZpc2liaWxpdHkgbW9kZWwgYW5kIGRpc3Bvc2UgdGhlaXJcblx0ICogd3JhcHBlcnMuIFBhc3NpbmcgYHVuZGVmaW5lZGAgcmVtb3ZlcyB0aGUgZW1wdHkgKG5ldy1zZXNzaW9uKSBzbG90IGlmXG5cdCAqIHByZXNlbnQuIElmIHRoZSBhY3RpdmUgc2xvdCBpcyBhbW9uZyB0aGUgcmVtb3ZlZCBlbnRyaWVzLCB0aGUgYWN0aXZlXG5cdCAqIG9ic2VydmFibGUgZmFsbHMgYmFjayB0byB0aGUgc2xvdCBhdCB0aGUgYWN0aXZlJ3Mgb3JpZ2luYWwgcG9zaXRpb25cblx0ICogKG9yIHRoZSBzbG90IHRvIGl0cyBsZWZ0IGlmIGl0IHdhcyBhdCB0aGUgZW5kIG9mIHRoZSBncmlkKTsgd2hlbiBub1xuXHQgKiB2aXNpYmxlIHNsb3QgcmVtYWlucywgdGhlIGFjdGl2ZSBvYnNlcnZhYmxlIGlzIGNsZWFyZWQuIE9ic2VydmFibGVzXG5cdCAqIGFyZSByZWZyZXNoZWQgb25jZSBpZiBhbnl0aGluZyBjaGFuZ2VkLlxuXHQgKi9cblx0cmVtb3ZlTWFueShzZXNzaW9uSWRzOiBJdGVyYWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24oKHRzeCkgPT4ge1xuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGFjdGl2ZUlkID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXHRcdFx0Ly8gYWN0aXZlU2Vzc2lvbi5nZXQoKSBpcyB1bmRlZmluZWQgYm90aCB3aGVuIHRoZSBlbXB0eSBzbG90IGlzIGFjdGl2ZVxuXHRcdFx0Ly8gYW5kIHdoZW4gbm8gc2xvdCBpcyBhY3RpdmU7IGRpc2FtYmlndWF0ZSB2aWEgdGhlIHZpc2libGUgbGlzdC5cblx0XHRcdGNvbnN0IGVtcHR5U2xvdElzQWN0aXZlID0gYWN0aXZlSWQgPT09IHVuZGVmaW5lZCAmJiB0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyh1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2xvdElkID0gZW1wdHlTbG90SXNBY3RpdmUgPyB1bmRlZmluZWQgOiBhY3RpdmVJZDtcblx0XHRcdGNvbnN0IGFjdGl2ZUlkeCA9IGFjdGl2ZUlkICE9PSB1bmRlZmluZWQgfHwgZW1wdHlTbG90SXNBY3RpdmVcblx0XHRcdFx0PyB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKGFjdGl2ZVNsb3RJZClcblx0XHRcdFx0OiAtMTtcblx0XHRcdGxldCBhY3RpdmVSZW1vdmVkID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHNlc3Npb25JZHMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3JlbW92ZUZyb21Nb2RlbChpZCkpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoaWQgPT09IHVuZGVmaW5lZCA/IGVtcHR5U2xvdElzQWN0aXZlIDogaWQgPT09IGFjdGl2ZUlkKSB7XG5cdFx0XHRcdFx0XHRhY3RpdmVSZW1vdmVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChhY3RpdmVSZW1vdmVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVTZXNzaW9uKHVuZGVmaW5lZCwgZmFsc2UsIHRzeCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tJZHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihhY3RpdmVJZHggLSAxLCB0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGggLSAxKSk7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tJZCA9IHRoaXMuX3Zpc2libGVMaXN0W2ZhbGxiYWNrSWR4XTtcblx0XHRcdFx0XHRjb25zdCBmYWxsYmFja1dyYXBwZXIgPSBmYWxsYmFja0lkICE9PSB1bmRlZmluZWQgPyB0aGlzLl93cmFwcGVycy5nZXQoZmFsbGJhY2tJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbihmYWxsYmFja1dyYXBwZXIsIGZhbHNlLCB0c3gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoKHRzeCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBhY3RpdmUgY2hhdCBmb3IgdGhlIGdpdmVuIHNlc3Npb24ncyB3cmFwcGVyLiBOby1vcCBpZiB0aGVcblx0ICogc2Vzc2lvbiBpcyBub3QgY3VycmVudGx5IHRyYWNrZWQgaW4gdGhlIHZpc2liaWxpdHkgbW9kZWwuXG5cdCAqL1xuXHRzZXRBY3RpdmVDaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJzLmdldChzZXNzaW9uLnNlc3Npb25JZCk/LnNldEFjdGl2ZUNoYXQoY2hhdCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvc2UgKGhpZGUgZnJvbSB0aGUgdGFiIHN0cmlwKSB0aGUgZ2l2ZW4gY2hhdCBpbiB0aGUgc2Vzc2lvbidzIHdyYXBwZXIuXG5cdCAqIE5vLW9wIGlmIHRoZSBzZXNzaW9uIGlzIG5vdCBjdXJyZW50bHkgdHJhY2tlZCBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbC5cblx0ICovXG5cdGNsb3NlQ2hhdChzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdDogSUNoYXQpOiB2b2lkIHtcblx0XHR0aGlzLl93cmFwcGVycy5nZXQoc2Vzc2lvbi5zZXNzaW9uSWQpPy5jbG9zZUNoYXQoY2hhdCk7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiAodW4taGlkZSBmcm9tIHRoZSB0YWIgc3RyaXApIGEgcHJldmlvdXNseSBjbG9zZWQgY2hhdCBpbiB0aGUgc2Vzc2lvbidzXG5cdCAqIHdyYXBwZXIuIE5vLW9wIGlmIHRoZSBzZXNzaW9uIGlzIG5vdCBjdXJyZW50bHkgdHJhY2tlZCBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbC5cblx0ICovXG5cdG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJzLmdldChzZXNzaW9uLnNlc3Npb25JZCk/Lm9wZW5DaGF0KGNoYXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2UgdGhlIGdpdmVuIHNlc3Npb24gaW4gdGhlIHZpc2liaWxpdHkgbW9kZWwgd2l0aCBgdXBkYXRlZFNlc3Npb25gLFxuXHQgKiBwcmVzZXJ2aW5nIHRoZSBncmlkIHNsb3QsIHN0aWNreSBzdGF0ZSwgYW5kIGFjdGl2ZSBzdGF0ZS4gVGhlIHdyYXBwZXJcblx0ICogZm9yIHRoZSBvbGQgc2Vzc2lvbiBpcyBkaXNwb3NlZDsgYSBmcmVzaCB3cmFwcGVyIGlzIGNyZWF0ZWQgZm9yIHRoZVxuXHQgKiB1cGRhdGVkIHNlc3Npb24uIE5vLW9wIGlmIGBzZXNzaW9uYCBpcyBub3QgY3VycmVudGx5IGluIHRoZSBncmlkLlxuXHQgKi9cblx0dXBkYXRlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgdXBkYXRlZFNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZnJvbUlkID0gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyhmcm9tSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FzQWN0aXZlID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID09PSBmcm9tSWQ7XG5cdFx0dGhpcy5yZXBsYWNlSWQoZnJvbUlkLCB1cGRhdGVkU2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdC8vIGByZXBsYWNlSWRgIGlzIGEgbm8tb3Agd2hlbiBpZHMgbWF0Y2ggXHUyMDE0IGRpc3Bvc2UgdGhlIG9sZCB3cmFwcGVyXG5cdFx0Ly8gZGlyZWN0bHkgc28gYSBmcmVzaCBvbmUgaXMgY3JlYXRlZCBhZ2FpbnN0IGB1cGRhdGVkU2Vzc2lvbmAuXG5cdFx0aWYgKGZyb21JZCA9PT0gdXBkYXRlZFNlc3Npb24uc2Vzc2lvbklkICYmIHRoaXMuX3dyYXBwZXJzLmhhcyhmcm9tSWQpKSB7XG5cdFx0XHR0aGlzLl93cmFwcGVycy5kZWxldGVBbmREaXNwb3NlKGZyb21JZCk7XG5cdFx0fVxuXG5cdFx0dHJhbnNhY3Rpb24oKHRzeCkgPT4ge1xuXHRcdFx0Y29uc3QgdmlzaWJsZVNlc3Npb24gPSB0aGlzLl9nZXRPckNyZWF0ZVZpc2libGVTZXNzaW9uKHVwZGF0ZWRTZXNzaW9uKTtcblx0XHRcdGlmICh3YXNBY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlU2Vzc2lvbih2aXNpYmxlU2Vzc2lvbiwgZmFsc2UsIHRzeCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWZyZXNoKHRzeCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgdHJhbnNpZW50IHtAbGluayBJU2Vzc2lvbn0gdGhhdCBtaXJyb3JzIHRoZSBnaXZlbiBzZXNzaW9uIGJ1dFxuXHQgKiBleHBvc2VzIGEgZGlmZmVyZW50IHtAbGluayBJU2Vzc2lvbi5yZXNvdXJjZX0uIFRoZSB2aXNpYmlsaXR5IG1vZGVsJ3Ncblx0ICogd3JhcHBlciBmb3IgdGhlIHNhbWUgc2Vzc2lvbiBpZCBpcyByZWJ1aWx0IGFnYWluc3QgdGhpcyB0cmFuc2llbnRcblx0ICogc2Vzc2lvbiBzbyBjb25zdW1lcnMgb2JzZXJ2ZSB0aGUgbmV3IHJlc291cmNlLiBSZXR1cm5zIHRoZSB0cmFuc2llbnRcblx0ICogc2Vzc2lvbiBzbyBjYWxsZXJzIGNhbiBwYXNzIGl0IHRvIGEgc3Vic2VxdWVudCB7QGxpbmsgdXBkYXRlU2Vzc2lvbn1cblx0ICogb25jZSB0aGUgcHJvdmlkZXIgcHJvZHVjZXMgdGhlIGZpbmFsIHNlc3Npb24uXG5cdCAqXG5cdCAqIE5vLW9wIChidXQgc3RpbGwgcmV0dXJucyB0aGUgdHJhbnNpZW50IHNlc3Npb24pIGlmIHRoZSBzZXNzaW9uIGlzIG5vdFxuXHQgKiBjdXJyZW50bHkgaW4gdGhlIGdyaWQuXG5cdCAqL1xuXHR1cGRhdGVSZXNvdXJjZU9mU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgcmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHtcblx0XHRjb25zdCB0bXBTZXNzaW9uID0gbmV3IFJlc291cmNlT3ZlcnJpZGVTZXNzaW9uKHNlc3Npb24sIHJlc291cmNlKTtcblx0XHR0aGlzLnVwZGF0ZVNlc3Npb24oc2Vzc2lvbiwgdG1wU2Vzc2lvbik7XG5cdFx0cmV0dXJuIHRtcFNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVuYW1lIGEgc2Vzc2lvbiBpZCBpbiB0aGUgdmlzaWJpbGl0eSBtb2RlbCBzbyB0aGUgc2FtZSBncmlkIHNsb3QgaXNcblx0ICogcmV1c2VkIGZvciB0aGUgcmVwbGFjZW1lbnQuIFRoZSBvbGQgd3JhcHBlciBpcyBkaXNwb3NlZDsgYSBmcmVzaCBvbmUgaXNcblx0ICogY3JlYXRlZCBsYXppbHkgb24gbmV4dCBhY2Nlc3MuIERvZXMgbm90IGF1dG8tcmVmcmVzaCBcdTIwMTQgY2FsbGVycyBzaG91bGRcblx0ICogY2FsbCB7QGxpbmsgcmVmcmVzaH0gb3Ige0BsaW5rIHNldEFjdGl2ZX0gYXMgYXBwcm9wcmlhdGUuXG5cdCAqL1xuXHRyZXBsYWNlSWQoZnJvbUlkOiBzdHJpbmcsIHRvSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChmcm9tSWQgPT09IHRvSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fdmlzaWJsZUxpc3QuaW5kZXhPZihmcm9tSWQpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUxpc3Quc3BsaWNlKGlkeCwgMSwgdG9JZCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGlja3lJZHMuZGVsZXRlKGZyb21JZCkpIHtcblx0XHRcdHRoaXMuX3N0aWNreUlkcy5hZGQodG9JZCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCA9PT0gZnJvbUlkKSB7XG5cdFx0XHR0aGlzLl9tb3N0UmVjZW50Tm9uU3RpY2t5U2xvdCA9IHRvSWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl93cmFwcGVycy5oYXMoZnJvbUlkKSkge1xuXHRcdFx0dGhpcy5fd3JhcHBlcnMuZGVsZXRlQW5kRGlzcG9zZShmcm9tSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZS1wdWJsaXNoIHRoZSB2aXNpYmxlIHNlc3Npb25zIGFuZCBzdGlja3kgaWRzIG9ic2VydmFibGVzLiAqL1xuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZnJlc2godW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRMYXN0Tm9uU3RpY2t5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHR5cGVvZiBOT19SRUNFTlQge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl92aXNpYmxlTGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3Qgc2lkID0gdGhpcy5fdmlzaWJsZUxpc3RbaV07XG5cdFx0XHRpZiAoIXRoaXMuX2lzU3RpY2t5U2xvdChzaWQpKSB7XG5cdFx0XHRcdHJldHVybiBzaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBOT19SRUNFTlQ7XG5cdH1cblxuXHQvKiogVHJ1ZSBpZiB0aGUgZ2l2ZW4gc2xvdCBpZCByZWZlcnMgdG8gYSBzdGlja3kgc2Vzc2lvbi4gVGhlIGVtcHR5IHNsb3QgaXMgbmV2ZXIgc3RpY2t5LiAqL1xuXHRwcml2YXRlIF9pc1N0aWNreVNsb3QoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3N0aWNreUlkcy5oYXMoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHNsb3QgaWQgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgZW50cnkgaW4gdGhlIGdyaWQsIG9yXG5cdCAqIHtAbGluayBOT19SRUNFTlR9IGlmIG5vIGVudHJ5IGluIHRoZSBncmlkIGlzIGFjdGl2ZS5cblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRBY3RpdmVTbG90KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB8IHR5cGVvZiBOT19SRUNFTlQge1xuXHRcdGNvbnN0IGFjdGl2ZUlkID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXHRcdGlmIChhY3RpdmVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZUxpc3QuaW5jbHVkZXMoYWN0aXZlSWQpID8gYWN0aXZlSWQgOiBOT19SRUNFTlQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGlzdC5pbmNsdWRlcyh1bmRlZmluZWQpID8gdW5kZWZpbmVkIDogTk9fUkVDRU5UO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRnJvbU1vZGVsKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRjb25zdCBpZHggPSB0aGlzLl92aXNpYmxlTGlzdC5pbmRleE9mKHNlc3Npb25JZCk7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTGlzdC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbklkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fc3RpY2t5SWRzLmRlbGV0ZShzZXNzaW9uSWQpKSB7XG5cdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID09PSBzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX21vc3RSZWNlbnROb25TdGlja3lTbG90ID0gdGhpcy5fZmluZExhc3ROb25TdGlja3koKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbklkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fd3JhcHBlcnMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdHRoaXMuX3dyYXBwZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2godHN4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyczogKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLl92aXNpYmxlTGlzdCkge1xuXHRcdFx0aWYgKGlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0d3JhcHBlcnMucHVzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZpc2libGVTZXNzaW9uID0gdGhpcy5fd3JhcHBlcnMuZ2V0KGlkKTtcblx0XHRcdGlmICh2aXNpYmxlU2Vzc2lvbikge1xuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbi5zZXRTdGlja3kodGhpcy5fc3RpY2t5SWRzLmhhcyhpZCkpO1xuXHRcdFx0XHR3cmFwcGVycy5wdXNoKHZpc2libGVTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdmlzaWJsZVNlc3Npb25zLnNldCh3cmFwcGVycywgdHN4KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlVmlzaWJsZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBWaXNpYmxlU2Vzc2lvbiB7XG5cdFx0bGV0IHZpc2libGVTZXNzaW9uID0gdGhpcy5fd3JhcHBlcnMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRpZiAodmlzaWJsZVNlc3Npb24pIHtcblx0XHRcdHJldHVybiB2aXNpYmxlU2Vzc2lvbjtcblx0XHR9XG5cblx0XHRjb25zdCBpbml0aWFsQ2hhdCA9IHRoaXMuX3Jlc29sdmVJbml0aWFsQ2hhdChzZXNzaW9uKTtcblx0XHR2aXNpYmxlU2Vzc2lvbiA9IG5ldyBWaXNpYmxlU2Vzc2lvbihzZXNzaW9uLCBpbml0aWFsQ2hhdCwgdGhpcy5fcmVzb2x2ZUluaXRpYWxDbG9zZWRDaGF0cyhzZXNzaW9uKSk7XG5cdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25SZWYgPSB2aXNpYmxlU2Vzc2lvbjtcblxuXHRcdC8vIFRyYWNrIGNoYXQgbGlzdCBjaGFuZ2VzIFx1MjAxNCBpZiB0aGUgYWN0aXZlIGNoYXQgaXMgcmVtb3ZlZCwgZmFsbCBiYWNrIHRvIHRoZSBsYXN0IHZpc2libGUgdGFiLlxuXHRcdHZpc2libGVTZXNzaW9uLmFkZERpc3Bvc2FibGUoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUNoYXQgPSB2aXNpYmxlU2Vzc2lvblJlZi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVDaGF0ICYmICFjaGF0cy5zb21lKGMgPT4gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGMucmVzb3VyY2UsIGFjdGl2ZUNoYXQucmVzb3VyY2UpKSkge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlQ2hhdFRhYnMgPSB2aXNpYmxlU2Vzc2lvblJlZi52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBmYWxsYmFjayA9IHZpc2libGVDaGF0VGFic1t2aXNpYmxlQ2hhdFRhYnMubGVuZ3RoIC0gMV0gPz8gc2Vzc2lvbi5tYWluQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChmYWxsYmFjaykge1xuXHRcdFx0XHRcdHZpc2libGVTZXNzaW9uUmVmLnNldEFjdGl2ZUNoYXQoZmFsbGJhY2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fd3JhcHBlcnMuc2V0KHNlc3Npb24uc2Vzc2lvbklkLCB2aXNpYmxlU2Vzc2lvbik7XG5cdFx0cmV0dXJuIHZpc2libGVTZXNzaW9uO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxxQkFBa0M7QUFDdkQsU0FBeUQsU0FBUyxTQUFTLGlCQUFpQixtQkFBbUI7QUFFL0csU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxtQkFBbUIsZ0JBQWlDLHFCQUFxQjtBQWEzRSxNQUFNLHVCQUF1QixXQUFxQztBQUFBLEVBbUN4RSxZQUNrQixVQUNqQixhQUNBLHVCQUNDO0FBQ0QsVUFBTTtBQUpXO0FBL0JsQixTQUFpQixVQUFVLGdCQUF5Qix1QkFBdUIsS0FBSztBQUNoRixTQUFTLFNBQStCLEtBQUs7QUF1QjdDO0FBQUEsU0FBaUIsbUJBQTRCLENBQUM7QUFZN0MsU0FBSyxjQUFjLGdCQUF1QixjQUFjLFNBQVMsU0FBUyxJQUFJLFdBQVc7QUFDekYsU0FBSyxhQUFhLEtBQUs7QUFFdkIsU0FBSyxxQkFBcUIsUUFBUSxNQUFNLFlBQVUsS0FBSyxZQUFZLEtBQUssTUFBTSxFQUFFLFFBQVEsS0FBSyxNQUFNLENBQUM7QUFDcEcsU0FBSyxrQkFBa0IsUUFBUSxNQUFNLFlBQVUsS0FBSyxZQUFZLEtBQUssTUFBTSxFQUFFLEtBQUssS0FBSyxNQUFNLENBQUM7QUFLOUYsVUFBTSxPQUFPLElBQUksSUFBSSxxQkFBcUI7QUFDMUMsU0FBSyxPQUFPLFNBQVMsU0FBUyxJQUFJLEVBQUUsU0FBUyxTQUFTLENBQUM7QUFDdkQsVUFBTSxZQUFZLGFBQWEsU0FBUyxTQUFTO0FBQ2pELFFBQUksV0FBVztBQUNkLFdBQUssT0FBTyxTQUFTO0FBQUEsSUFDdEI7QUFDQSxTQUFLLGtCQUFrQixnQkFBcUMsa0JBQWtCLElBQUk7QUFJbEYsVUFBTSxpQkFBaUIsb0JBQUksSUFBWTtBQUN2QyxRQUFJLGFBQWEsUUFBUSxTQUFTLGVBQWUsTUFBTTtBQUN0RCxxQkFBZSxJQUFJLFlBQVksU0FBUyxT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LEtBQUssV0FBVyxPQUFPLFNBQVMsR0FBRztBQUNqRSxnQkFBVTtBQUFBLElBQ1g7QUFDQSxRQUFJLEtBQUssNkJBQTZCLFdBQVc7QUFDaEQsV0FBSywyQkFBMkIsS0FBSyxtQkFBbUI7QUFDeEQsZ0JBQVU7QUFBQSxJQUNYO0FBQ0EsUUFBSSxjQUFjLFVBQWEsS0FBSyxVQUFVLElBQUksU0FBUyxHQUFHO0FBQzdELFdBQUssVUFBVSxpQkFBaUIsU0FBUztBQUN6QyxnQkFBVTtBQUFBLElBQ1g7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsU0FBUyxLQUFxQztBQUNyRCxVQUFNLFdBQTJDLENBQUM7QUFDbEQsZUFBVyxNQUFNLEtBQUssY0FBYztBQUNuQyxVQUFJLE9BQU8sUUFBVztBQUNyQixpQkFBUyxLQUFLLE1BQVM7QUFDdkI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxpQkFBaUIsS0FBSyxVQUFVLElBQUksRUFBRTtBQUM1QyxVQUFJLGdCQUFnQjtBQUNuQix1QkFBZSxVQUFVLEtBQUssV0FBVyxJQUFJLEVBQUUsQ0FBQztBQUNoRCxpQkFBUyxLQUFLLGNBQWM7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQixJQUFJLFVBQVUsR0FBRztBQUFBLEVBQ3hDO0FBQUEsRUFFUSwyQkFBMkIsU0FBbUM7QUFDckUsUUFBSSxpQkFBaUIsS0FBSyxVQUFVLElBQUksUUFBUSxTQUFTO0FBQ3pELFFBQUksZ0JBQWdCO0FBQ25CLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxjQUFjLEtBQUssb0JBQW9CLE9BQU87QUFDcEQscUJBQWlCLElBQUksZUFBZSxTQUFTLGFBQWEsS0FBSywyQkFBMkIsT0FBTyxDQUFDO0FBQ2xHLFVBQU0sb0JBQW9CO0FBRzFCLG1CQUFlLGNBQWMsUUFBUSxZQUFVO0FBQzlDLFlBQU0sUUFBUSxRQUFRLE1BQU0sS0FBSyxNQUFNO0FBQ3ZDLFlBQU0sYUFBYSxrQkFBa0IsV0FBVyxLQUFLLE1BQU07QUFDM0QsVUFBSSxjQUFjLENBQUMsTUFBTSxLQUFLLE9BQUssS0FBSyxvQkFBb0IsT0FBTyxRQUFRLEVBQUUsVUFBVSxXQUFXLFFBQVEsQ0FBQyxHQUFHO0FBQzdHLGNBQU0sa0JBQWtCLGtCQUFrQixnQkFBZ0IsS0FBSyxNQUFNO0FBQ3JFLGNBQU0sV0FBVyxnQkFBZ0IsZ0JBQWdCLFNBQVMsQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUFLLE1BQU07QUFDNUYsWUFBSSxVQUFVO0FBQ2IsNEJBQWtCLGNBQWMsUUFBUTtBQUFBLFFBQ3pDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLElBQUksUUFBUSxXQUFXLGNBQWM7QUFDcEQsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQW5mYSxrQkFBTjtBQUFBLEVBd0NKO0FBQUEsR0F4Q1U7IiwKICAibmFtZXMiOiBbInNob3duU3ViYWdlbnRzIiwgIm5leHQiXQp9Cg==
