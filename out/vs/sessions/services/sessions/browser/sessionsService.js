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
import { disposableTimeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { autorun } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { localize } from "../../../../nls.js";
import { ChatInteractivity, ChatOriginKind, SessionStatus } from "../common/session.js";
import { inheritableSessionTarget, ISessionsManagementService } from "../common/sessionsManagement.js";
import { ISessionsProvidersService } from "./sessionsProvidersService.js";
import { SessionsNavigation } from "./sessionNavigation.js";
import { SessionsRecencyHistory } from "./sessionsRecencyHistory.js";
import { VisibleSessions } from "./visibleSessions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ISessionsPartService } from "./sessionsPartService.js";
import { ICustomViewService } from "../../customView/browser/customViewService.js";
import { IsNewChatSessionContext } from "../../../common/contextkeys.js";
import { setActiveSessionContextKeys } from "../common/sessionContextKeys.js";
const ACTIVE_SESSION_STATES_KEY = "agentSessions.activeSessionStates";
const RESTORE_SESSION_WAIT_TIMEOUT = 3e4;
const MAX_RECENTLY_OPENED_SESSIONS = 10;
const ISessionsService = createDecorator("sessionsService");
let SessionsService = class extends Disposable {
  constructor(storageService, logService, uriIdentityService, contextKeyService, sessionsManagementService, sessionsProvidersService, sessionsPartService, customViewService, instantiationService, workspaceTrustRequestService) {
    super();
    this.storageService = storageService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this.contextKeyService = contextKeyService;
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.sessionsPartService = sessionsPartService;
    this.customViewService = customViewService;
    this.instantiationService = instantiationService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this._onDidToggleSessionStickiness = this._register(new Emitter());
    this.onDidToggleSessionStickiness = this._onDidToggleSessionStickiness.event;
    /** Cancelled on every navigation action so in-flight async opens bail out. */
    this._openSessionCts = this._register(new MutableDisposable());
    /**
     * Cancellation for the in-flight {@link restoreVisibleSessions}. Kept
     * separate from {@link _openSessionCts} so that additive new-session
     * operations (the new-chat composer eagerly creating a draft on startup)
     * do not abort restoring the previously visible grid. Only an explicit
     * navigation to a specific session cancels a restore.
     */
    this._restoreCts = this._register(new MutableDisposable());
    /** The in-flight foreground send's "keep newest chat active" follow. */
    this._sendFollow = this._register(new MutableDisposable());
    this._sessionStates = this._loadSessionStates();
    this._visibility = this._register(this.instantiationService.createInstance(
      VisibleSessions,
      (session) => this._restoreInitialChat(session),
      (session) => this._restoreClosedChats(session)
    ));
    this.visibleSessions = this._visibility.visibleSessions;
    this.activeSession = this._visibility.activeSession;
    this._isNewChatSessionContext = IsNewChatSessionContext.bindTo(this.contextKeyService);
    this._register(this.storageService.onWillSaveState(() => this._saveSessionStates()));
    this._recencyHistory = this._register(new SessionsRecencyHistory(
      this.storageService,
      this.logService
    ));
    this._navigation = this._register(new SessionsNavigation(
      this,
      this.activeSession,
      this.sessionsManagementService,
      this._recencyHistory,
      this.contextKeyService,
      this.logService
    ));
    this._register(this.sessionsManagementService.onDidChangeSessions((e) => this._navigation.onDidRemoveSessions(e)));
    this._register(this.sessionsManagementService.onDidDeleteSession((session) => this._recencyHistory.remove((entry) => entry.sessionResource.toString() === session.resource.toString())));
    this._register(autorun((reader) => {
      const activeSession = this.activeSession.read(reader);
      const newSession = this.sessionsManagementService.newSession.read(reader);
      this._isNewChatSessionContext.set(activeSession === void 0 || activeSession.sessionId === newSession?.sessionId);
      setActiveSessionContextKeys(activeSession, this.contextKeyService, reader);
    }));
    this._register(autorun((reader) => {
      const activeSession = this.activeSession.read(reader);
      if (activeSession) {
        reader.store.add(this._activeSessionViewListeners(activeSession));
      }
    }));
    this._register(autorun((reader) => {
      const activeSession = this.activeSession.read(reader);
      if (activeSession && !activeSession.isRead.read(reader)) {
        this.sessionsManagementService.markRead(activeSession);
      }
    }));
    this._register(this.sessionsManagementService.onDidChangeSessions((e) => this._onDidChangeSessions(e)));
    this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => this._onDidReplaceSession(from, to)));
    this._register(this.sessionsManagementService.onWillSendRequest((session) => this._startSendFollow(session)));
    this._register(this.sessionsManagementService.onDidSendRequest(() => this._sendFollow.clear()));
    this._register(autorun((reader) => {
      const visible = this.visibleSessions.read(reader);
      const active = this._visibility.activeSession.read(reader);
      const preserveFocus = this._visibility.activePreserveFocus.read(reader);
      this.sessionsPartService.updateVisibleSessions(visible, active);
      const activeId = active?.sessionId;
      if (activeId !== this._focusedActiveSessionId) {
        this._focusedActiveSessionId = activeId;
        if (!preserveFocus) {
          this.sessionsPartService.focusSession(active);
        }
      }
    }));
    this._register(this.sessionsPartService.onDidFocusSession((sessionId) => {
      const session = this.visibleSessions.get().find((s) => s?.sessionId === sessionId);
      if (session) {
        this.setActive(session);
      }
    }));
  }
  _onDidReplaceSession(from, to) {
    this._visibility.updateSession(from, to);
  }
  _activeSessionViewListeners(activeSession) {
    const disposables = new DisposableStore();
    let wasArchived = activeSession.isArchived.get();
    disposables.add(autorun((reader) => {
      const isArchived = activeSession.isArchived.read(reader);
      if (isArchived && !wasArchived) {
        if (activeSession.isQuickChat?.read(void 0)) {
          this.openQuickChat();
        } else {
          const folderUri = activeSession.workspace.read(void 0)?.folders[0]?.root;
          this.openNewSession(folderUri ? { folderUri, ...inheritableSessionTarget(this.sessionsManagementService, activeSession, folderUri) } : void 0);
        }
      }
      wasArchived = isArchived;
    }));
    if (activeSession.status.get() !== SessionStatus.Untitled) {
      disposables.add(autorun((reader) => {
        const chats = activeSession.chats.read(reader);
        const activeChat = activeSession.activeChat.read(reader);
        if (activeChat && !chats.some((c) => this.uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
          const visible = chats.filter((c) => c.interactivity.read(reader) !== ChatInteractivity.Hidden);
          const fallback = visible[visible.length - 1] ?? activeSession.mainChat.read(reader);
          if (fallback) {
            this.openChat(activeSession, fallback.resource);
          }
        }
      }));
    }
    disposables.add(autorun((reader) => {
      const chat = activeSession.activeChat.read(reader);
      if (chat && chat.status.read(void 0) !== SessionStatus.Untitled) {
        const existing = this._sessionStates.get(activeSession.resource);
        this._sessionStates.set(activeSession.resource, {
          ...existing,
          sessionResource: activeSession.resource.toString(),
          activeChatResource: chat.resource.toString()
        });
      }
    }));
    return disposables;
  }
  _onDidChangeSessions(e) {
    const currentActive = this._visibility.activeSession.get();
    if (e.removed.length) {
      for (const session of e.removed) {
        this._sessionStates.delete(session.resource);
      }
      this._visibility.removeMany(e.removed.map((r) => r.sessionId));
    }
    if (!currentActive) {
      return;
    }
    if (e.removed.length && e.removed.some((r) => r.sessionId === currentActive.sessionId)) {
      const fallback = this._visibility.activeSession.get();
      if (fallback && this.sessionsManagementService.getSession(fallback.resource)) {
        this.openSession(fallback.resource);
      } else {
        this.openNewSession();
      }
    }
  }
  _startSendFollow(session) {
    const store = new DisposableStore();
    let followId = session.sessionId;
    store.add(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
      if (from.sessionId === followId) {
        followId = to.sessionId;
      }
    }));
    store.add(autorun((reader) => {
      const active = this._visibility.activeSession.read(reader);
      if (active && active.sessionId === followId) {
        const chats = active.visibleChatTabs.read(reader);
        const lastChat = chats[chats.length - 1];
        if (lastChat) {
          this._visibility.setActiveChat(active, lastChat);
        }
      }
    }));
    this._sendFollow.value = store;
  }
  getRecentlyOpenedSessions() {
    const seen = /* @__PURE__ */ new Set();
    const recent = [];
    for (const entry of this._recencyHistory.entries) {
      if (recent.length >= MAX_RECENTLY_OPENED_SESSIONS) {
        break;
      }
      const key = entry.sessionResource.toString();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const session = this.sessionsManagementService.getSession(entry.sessionResource);
      if (session) {
        recent.push(session);
      }
    }
    const other = this.sessionsManagementService.getSessions().filter((s) => !seen.has(s.resource.toString())).sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());
    return { recent, other };
  }
  /**
   * Cancel any in-flight open-session/restore and return a fresh cancellation token.
   */
  _startOpenSession() {
    this.customViewService.hideCustomView();
    this._openSessionCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this._openSessionCts.value = cts;
    return cts.token;
  }
  /**
   * Cancel an in-flight {@link restoreVisibleSessions}. Called when the user
   * explicitly navigates to a specific session, so restore stops fighting
   * the user's choice. Additive new-session operations do NOT call this.
   */
  _cancelRestore() {
    this._restoreCts.value?.cancel();
    this._restoreCts.clear();
  }
  /**
   * Make the given session active in the visibility model, optionally without
   * moving focus into it. The preserve-focus intent is published atomically
   * with the active session by the visibility model, and the model's
   * canonical active session is updated reactively by the mirror autorun.
   */
  _activate(session, preserveFocus) {
    return this._visibility.setActive(session, preserveFocus);
  }
  async openChat(session, chatUri) {
    const t0 = Date.now();
    this._cancelRestore();
    const token = this._startOpenSession();
    this.logService.trace(`[SessionsView] openChat start uri=${chatUri.toString()} provider=${session.providerId}`);
    this._activate(session);
    if (!await this._waitForSessionToLoad(session, token)) {
      this.logService.trace(`[SessionsView] openChat cancelled while waiting for session to load uri=${chatUri.toString()}`);
      return;
    }
    let chat;
    const activeSession = this._visibility.activeSession.get();
    if (activeSession) {
      chat = activeSession.chats.get().find((c) => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
      if (chat) {
        this._visibility.openChat(session, chat);
        this._visibility.setActiveChat(session, chat);
        this._setChatClosedState(session, chat, false);
      }
    }
    if (chat && chat.status.get() === SessionStatus.Untitled) {
      this.logService.trace(`[SessionsView] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()} path=untitled`);
      return;
    }
    this.logService.trace(`[SessionsView] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()}`);
  }
  async closeChat(session, chat) {
    this._visibility.closeChat(session, chat);
    this._setChatClosedState(session, chat, true);
  }
  /**
   * Persist a chat's closed/open state into the session's stored view state so
   * it survives switching the session out of the grid (which disposes its
   * wrapper) and reloads. Done synchronously on the close/open action rather
   * than reactively from `closedChats`, which would depend on the session's
   * chats being loaded. The main chat can never be closed and is ignored.
   */
  _setChatClosedState(session, chat, closed) {
    if (this.uriIdentityService.extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
      return;
    }
    if (chat.origin?.kind === ChatOriginKind.Tool) {
      return;
    }
    const existing = this._sessionStates.get(session.resource);
    const closedSet = new Set(existing?.closedChatResources ?? []);
    const chatResource = chat.resource.toString();
    if (closed) {
      closedSet.add(chatResource);
    } else if (!closedSet.delete(chatResource)) {
      return;
    }
    this._sessionStates.set(session.resource, {
      ...existing,
      sessionResource: session.resource.toString(),
      closedChatResources: [...closedSet]
    });
  }
  async openSession(sessionResource, options) {
    this._cancelRestore();
    const token = this._startOpenSession();
    await this._doOpenSession(sessionResource, token, options);
  }
  async _doOpenSession(sessionResource, token, options) {
    const t0 = Date.now();
    const sessionData = this.sessionsManagementService.getSession(sessionResource);
    if (!sessionData) {
      this.logService.warn(`[SessionsView] openSession: session not found uri=${sessionResource.toString()}`);
      throw new Error(`Session with resource ${sessionResource.toString()} not found`);
    }
    this.logService.trace(`[SessionsView] openSession start uri=${sessionResource.toString()} provider=${sessionData.providerId}`);
    this._activate(sessionData, options?.preserveFocus);
    if (!await this._waitForSessionToLoad(sessionData, token)) {
      this.logService.trace(`[SessionsView] openSession cancelled while waiting for session to load uri=${sessionResource.toString()}`);
      return;
    }
    this.logService.trace(`[SessionsView] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
  }
  unsetNewSession() {
    this.sessionsManagementService.discardNewSession();
    this._activate(void 0);
  }
  async openNewSession(options, token = CancellationToken.None) {
    const folderUri = options?.folderUri;
    if (folderUri) {
      const resolved = this.sessionsManagementService.resolveWorkspace(folderUri, options?.providerId);
      if (resolved?.workspace.requiresWorkspaceTrust) {
        const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
          uri: folderUri,
          message: localize("sessionsService.trustFolderMessage", "An agent session will be able to read files, run commands, and make changes in this folder.")
        });
        if (token.isCancellationRequested) {
          return { session: void 0, trustDeclined: false };
        }
        if (!trusted) {
          return { session: void 0, trustDeclined: true };
        }
      }
      if (token.isCancellationRequested) {
        return { session: void 0, trustDeclined: false };
      }
      this._startOpenSession();
      try {
        const session = this.sessionsManagementService.createNewSession(folderUri, options);
        this._activate(session);
        return { session, trustDeclined: false };
      } catch (e) {
        this.logService.trace(`[SessionsView] openNewSession: createNewSession failed for folder ${folderUri.toString()}, falling back to composer view`);
      }
    }
    if (this._visibility.activeSession.get() === void 0) {
      return { session: void 0, trustDeclined: false };
    }
    if (!folderUri) {
      this._startOpenSession();
    }
    const newSession = this.sessionsManagementService.newSession.get();
    if (newSession?.isQuickChat?.get()) {
      this.sessionsManagementService.discardNewSession(newSession);
      this._activate(void 0);
      return { session: void 0, trustDeclined: false };
    }
    this._activate(newSession ?? void 0);
    return { session: newSession ?? void 0, trustDeclined: false };
  }
  openQuickChat(options) {
    this._startOpenSession();
    try {
      const session = this.sessionsManagementService.createQuickChat(options);
      return this._activate(session);
    } catch (e) {
      this.logService.trace(`[SessionsView] openQuickChat: createQuickChat failed: ${e}`);
      return void 0;
    }
  }
  async openNewChatInSession(session, options) {
    this._cancelRestore();
    this._startOpenSession();
    const chat = await this.sessionsManagementService.createNewChatInSession(session, options);
    if (!chat) {
      return;
    }
    this._activate(session);
    this._visibility.setActiveChat(session, chat);
  }
  setActive(session) {
    this._activate(session);
  }
  async submitNewSessionInput() {
    let activeSession = this.activeSession.get();
    if (activeSession?.isCreated.get()) {
      return false;
    }
    if (!this.sessionsPartService.getSessionView(activeSession?.sessionId)) {
      await this.openNewSession();
      activeSession = this.activeSession.get();
      if (activeSession?.isCreated.get()) {
        return false;
      }
    }
    return this.sessionsPartService.getSessionView(activeSession?.sessionId)?.submitInput() ?? false;
  }
  toggleSessionStickiness(session) {
    const sticky = this._visibility.toggleStickiness(session);
    this._onDidToggleSessionStickiness.fire({ session, sticky });
  }
  insertAt(session, targetSessionId, side, activate = true) {
    this._visibility.insertAt(session, targetSessionId, side, activate);
  }
  closeSession(session) {
    const sessionId = session?.sessionId;
    const visible = this._visibility.visibleSessions.get();
    if (!visible.some((s) => s?.sessionId === sessionId)) {
      return;
    }
    const activeSessionId = this._visibility.activeSession.get()?.sessionId;
    const wasActive = activeSessionId === sessionId;
    this.sessionsManagementService.discardNewSession(session);
    this._visibility.removeMany([sessionId]);
    if (!wasActive) {
      return;
    }
    const fallback = this._visibility.activeSession.get();
    if (fallback === void 0) {
      this.openNewSession();
    }
  }
  closeAllSessions() {
    const ids = this._visibility.visibleSessions.get().filter((s) => !!s).map((s) => s.sessionId);
    if (ids.length === 0) {
      return;
    }
    this.sessionsManagementService.discardNewSession();
    this._visibility.removeMany(ids);
  }
  _restoreInitialChat(session) {
    const chats = session.chats.get();
    let initialChat = chats[0];
    const sessionState = this._sessionStates.get(session.resource);
    if (sessionState?.activeChatResource) {
      try {
        const lastChatResource = URI.parse(sessionState.activeChatResource);
        const found = chats.find((c) => this.uriIdentityService.extUri.isEqual(c.resource, lastChatResource));
        if (found) {
          initialChat = found;
        }
      } catch (error) {
        this.logService.warn("[SessionsView] Failed to restore active chat from stored session state", error);
      }
    }
    return initialChat;
  }
  /**
   * The resource strings of chats that were closed (hidden from the tab strip)
   * when the session was last saved, so they stay hidden across reloads. Stale
   * URIs that no longer match a chat are harmless: the visible session
   * intersects them with the live chat list.
   */
  _restoreClosedChats(session) {
    return this._sessionStates.get(session.resource)?.closedChatResources ?? [];
  }
  async _waitForSessionToLoad(session, token) {
    if (!session.loading.get()) {
      return true;
    }
    if (token.isCancellationRequested) {
      return false;
    }
    await new Promise((resolve) => {
      const disposables = new DisposableStore();
      let resolved = false;
      const finish = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        disposables.dispose();
        resolve();
      };
      disposables.add(token.onCancellationRequested(finish));
      disposables.add(autorun((reader) => {
        if (!session.loading.read(reader)) {
          finish();
        }
      }));
    });
    return !token.isCancellationRequested;
  }
  _loadSessionStates() {
    const map = new ResourceMap();
    const raw = this.storageService.get(ACTIVE_SESSION_STATES_KEY, StorageScope.WORKSPACE);
    if (!raw) {
      return map;
    }
    try {
      const entries = JSON.parse(raw);
      for (const entry of entries) {
        const uri = URI.parse(entry.sessionResource);
        map.set(uri, entry);
      }
    } catch {
    }
    return map;
  }
  _saveSessionStates() {
    const entries = this._snapshotVisibleSessionStates();
    const visible = new ResourceMap();
    for (const entry of entries) {
      visible.set(URI.parse(entry.sessionResource), true);
    }
    for (const [resource, state] of this._sessionStates) {
      if (visible.has(resource)) {
        continue;
      }
      entries.push({
        sessionResource: state.sessionResource,
        activeChatResource: state.activeChatResource,
        closedChatResources: state.closedChatResources
      });
    }
    this.storageService.store(ACTIVE_SESSION_STATES_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  _snapshotVisibleSessionStates() {
    const activeId = this._visibility.activeSession.get()?.sessionId;
    const visible = this._visibility.visibleSessions.get();
    const entries = [];
    visible.forEach((session, index) => {
      if (!session) {
        return;
      }
      if (session.status.get() === SessionStatus.Untitled) {
        this._sessionStates.delete(session.resource);
        return;
      }
      const existing = this._sessionStates.get(session.resource);
      const state = {
        sessionResource: session.resource.toString(),
        activeChatResource: session.activeChat.get()?.resource.toString() ?? existing?.activeChatResource,
        closedChatResources: existing?.closedChatResources ?? session.closedChats.get().map((c) => c.resource.toString()),
        visibleOrder: index,
        isSticky: session.sticky.get(),
        isActive: session.sessionId === activeId
      };
      this._sessionStates.set(session.resource, state);
      entries.push(state);
    });
    return entries;
  }
  /**
   * The persisted visible sessions, ordered left-to-right by their stored
   * grid position.
   */
  _getVisibleSessionStates() {
    const states = [];
    for (const [, state] of this._sessionStates) {
      if (state.visibleOrder !== void 0) {
        states.push(state);
      }
    }
    return states.sort((a, b) => a.visibleOrder - b.visibleOrder);
  }
  /**
   * Wait for the session with the given resource to become available via its
   * provider, resolving with the session or `undefined` if the token is
   * cancelled before it appears. When `timeout` is given, resolves with
   * `undefined` after that many milliseconds so a persisted session that never
   * resurfaces (e.g. deleted while the window was closed) cannot keep restore
   * pending — and its provider listeners alive — indefinitely.
   */
  _waitForSession(sessionResource, token, timeout) {
    const existing = this.sessionsManagementService.getSession(sessionResource);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let resolved = false;
      const finish = (session) => {
        if (resolved) {
          return;
        }
        resolved = true;
        disposables.dispose();
        resolve(session);
      };
      disposables.add(token.onCancellationRequested(() => finish(void 0)));
      const tryFind = () => {
        if (token.isCancellationRequested) {
          finish(void 0);
          return;
        }
        const session = this.sessionsManagementService.getSession(sessionResource);
        if (session) {
          finish(session);
        }
      };
      disposables.add(this.sessionsProvidersService.onDidChangeProviders(() => tryFind()));
      disposables.add(this.sessionsManagementService.onDidChangeSessions(() => tryFind()));
      if (timeout !== void 0) {
        disposables.add(disposableTimeout(() => finish(void 0), timeout));
      }
      tryFind();
    });
  }
  async restoreVisibleSessions() {
    const targets = this._getVisibleSessionStates().map((state) => ({
      resource: URI.parse(state.sessionResource),
      isSticky: !!state.isSticky,
      isActive: !!state.isActive,
      order: state.visibleOrder
    }));
    if (targets.length === 0) {
      targets.push({ resource: void 0, isSticky: false, isActive: true, order: 1 });
    }
    targets.sort((a, b) => a.order - b.order);
    let activeIdx = targets.findIndex((t) => t.isActive);
    if (activeIdx < 0) {
      activeIdx = 0;
    }
    const cts = new CancellationTokenSource();
    this._restoreCts.value = cts;
    const token = cts.token;
    const resolved = new Array(targets.length).fill(void 0);
    const place = (idx, session) => {
      let anchor;
      for (let j = idx - 1; j >= 0 && !anchor; j--) {
        const neighbour = resolved[j];
        if (neighbour !== void 0) {
          anchor = { id: neighbour?.sessionId, side: "right" };
        }
      }
      for (let j = idx + 1; j < targets.length && !anchor; j++) {
        const neighbour = resolved[j];
        if (neighbour !== void 0) {
          anchor = { id: neighbour?.sessionId, side: "left" };
        }
      }
      resolved[idx] = session;
      if (anchor) {
        this._visibility.insertAt(session, anchor.id, anchor.side, false);
      } else {
        this._activate(session);
      }
      if (targets[idx].isSticky) {
        this._visibility.toggleStickiness(session);
      }
    };
    const activeTarget = targets[activeIdx];
    const activeSessionPromise = activeTarget.resource ? this._waitForSession(activeTarget.resource, token, RESTORE_SESSION_WAIT_TIMEOUT).then((session) => session ?? void 0) : Promise.resolve(void 0);
    const activeSession = await activeSessionPromise;
    if (token.isCancellationRequested) {
      return;
    }
    const slots = [];
    let activeSlotIndex = -1;
    for (let idx = 0; idx < targets.length; idx++) {
      const target = targets[idx];
      let session;
      if (!target.resource) {
        session = null;
      } else if (idx === activeIdx) {
        session = activeSession;
      } else {
        session = this.sessionsManagementService.getSession(target.resource);
      }
      if (session === void 0) {
        continue;
      }
      resolved[idx] = session;
      if (idx === activeIdx) {
        activeSlotIndex = slots.length;
      }
      slots.push({ session: session ?? void 0, sticky: target.isSticky });
    }
    this._visibility.restoreGrid(slots, activeSlotIndex);
    if (token.isCancellationRequested) {
      return;
    }
    await Promise.all(targets.map(async (target, idx) => {
      if (idx === activeIdx || !target.resource || token.isCancellationRequested || resolved[idx] !== void 0) {
        return;
      }
      const session = await this._waitForSession(target.resource, token, RESTORE_SESSION_WAIT_TIMEOUT);
      if (!session || token.isCancellationRequested || resolved[idx] !== void 0) {
        return;
      }
      place(idx, session);
    }));
  }
  // -- Session Navigation --
  async openPreviousSession() {
    await this._navigation.goBack();
  }
  async openNextSession() {
    await this._navigation.goForward();
  }
};
SessionsService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ISessionsManagementService),
  __decorateParam(5, ISessionsProvidersService),
  __decorateParam(6, ISessionsPartService),
  __decorateParam(7, ICustomViewService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IWorkspaceTrustRequestService)
], SessionsService);
registerSingleton(ISessionsService, SessionsService, InstantiationType.Eager);
export {
  ISessionsService,
  SessionsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBDaGF0T3JpZ2luS2luZCwgSUNoYXQsIElTZXNzaW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElDcmVhdGVOZXdDaGF0SW5TZXNzaW9uT3B0aW9ucywgSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zLCBpbmhlcml0YWJsZVNlc3Npb25UYXJnZXQsIElSZWNlbnRseU9wZW5lZFNlc3Npb25zLCBJU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIElUb2dnbGVTZXNzaW9uU3RpY2tpbmVzc0V2ZW50IH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNOYXZpZ2F0aW9uIH0gZnJvbSAnLi9zZXNzaW9uTmF2aWdhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1JlY2VuY3lIaXN0b3J5IH0gZnJvbSAnLi9zZXNzaW9uc1JlY2VuY3lIaXN0b3J5LmpzJztcbmltcG9ydCB7IFZpc2libGVTZXNzaW9ucyB9IGZyb20gJy4vdmlzaWJsZVNlc3Npb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJc05ld0NoYXRTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBzZXRBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbnRleHRLZXlzLmpzJztcblxuY29uc3QgQUNUSVZFX1NFU1NJT05fU1RBVEVTX0tFWSA9ICdhZ2VudFNlc3Npb25zLmFjdGl2ZVNlc3Npb25TdGF0ZXMnO1xuXG4vKipcbiAqIFVwcGVyIGJvdW5kIG9uIGhvdyBsb25nIHJlc3RvcmUgd2FpdHMgZm9yIGEgcGVyc2lzdGVkIHNlc3Npb24gdG8gcmVzdXJmYWNlXG4gKiB2aWEgaXRzIHByb3ZpZGVyLiBHZW5lcm91cyAocHJvdmlkZXJzIG1heSBsb2FkIGFmdGVyIGF1dGggc2V0dGxlcykgYnV0IGZpbml0ZVxuICogc28gYSBzZXNzaW9uIHRoYXQgaXMgZ29uZSBmb3IgZ29vZCBjYW5ub3Qga2VlcCByZXN0b3JlIFx1MjAxNCBhbmQgaXRzIHByb3ZpZGVyXG4gKiBsaXN0ZW5lcnMgXHUyMDE0IGFsaXZlIGluZGVmaW5pdGVseS5cbiAqL1xuY29uc3QgUkVTVE9SRV9TRVNTSU9OX1dBSVRfVElNRU9VVCA9IDMwXzAwMDtcblxuLyoqIE1heGltdW0gbnVtYmVyIG9mIHJlY2VudGx5IG9wZW5lZCBzZXNzaW9ucyByZXBvcnRlZCBieSB7QGxpbmsgU2Vzc2lvbnNTZXJ2aWNlLmdldFJlY2VudGx5T3BlbmVkU2Vzc2lvbnN9LiAqL1xuY29uc3QgTUFYX1JFQ0VOVExZX09QRU5FRF9TRVNTSU9OUyA9IDEwO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHtAbGluayBJU2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9ufS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJT3Blbk5ld1Nlc3Npb25PcHRpb25zIGV4dGVuZHMgSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zIHtcblx0LyoqXG5cdCAqIEZvbGRlciB0byBjcmVhdGUgYSBjb25jcmV0ZSBkcmFmdCBzZXNzaW9uIGZvci4gV2hlbiBzZXQsIGEgbmV3IGRyYWZ0IGlzXG5cdCAqIGNyZWF0ZWQgYW5kIHNob3duOyB3aGVuIG9taXR0ZWQsIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlciBpcyBzaG93blxuXHQgKiAocmVzdG9yaW5nIGFueSBwZW5kaW5nIGRyYWZ0KS5cblx0ICovXG5cdHJlYWRvbmx5IGZvbGRlclVyaT86IFVSSTtcbn1cblxuLyoqXG4gKiBSZXN1bHQgb2Yge0BsaW5rIElTZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb259LiBgc2Vzc2lvbmAgaG9sZHMgdGhlXG4gKiBjcmVhdGVkL3Jlc3RvcmVkIGRyYWZ0IG9uIHN1Y2Nlc3MuIGB0cnVzdERlY2xpbmVkYCBpcyBgdHJ1ZWAgb25seSB3aGVuIGFcbiAqIGBmb2xkZXJVcmlgIHdhcyBzdXBwbGllZCwgdGhlIGZvbGRlciByZXF1aXJlZCB3b3Jrc3BhY2UgdHJ1c3QsIGFuZCB0aGVcbiAqIHVzZXIgZXhwbGljaXRseSBkZWNsaW5lZCBpdCBcdTIwMTQgZGlzdGluY3QgZnJvbSBhbnkgb3RoZXIgcmVzb2x1dGlvbi9jcmVhdGlvblxuICogZmFpbHVyZSAod2hlcmUgYHNlc3Npb25gIGlzIGFsc28gYHVuZGVmaW5lZGAgYnV0IGB0cnVzdERlY2xpbmVkYCBpc1xuICogYGZhbHNlYCwgc2luY2UgdGhhdCBtYXkgc3RpbGwgc3VjY2VlZCBsYXRlciBvbmNlIGEgcHJvdmlkZXIgcmVnaXN0ZXJzKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJT3Blbk5ld1Nlc3Npb25SZXN1bHQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdHJ1c3REZWNsaW5lZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBQZXJzaXN0ZWQgc3RhdGUgZm9yIGEgc2Vzc2lvbi5cbiAqIEV4dGVuZCB0aGlzIGludGVyZmFjZSB0byBzdG9yZSBhZGRpdGlvbmFsIHBlci1zZXNzaW9uIHN0YXRlIHRoYXQgc2hvdWxkIGJlXG4gKiByZW1lbWJlcmVkIGFjcm9zcyByZXN0YXJ0cy5cbiAqL1xuaW50ZXJmYWNlIElTZXNzaW9uU3RhdGUge1xuXHQvKiogVGhlIHJlc291cmNlIFVSSSBvZiB0aGUgc2Vzc2lvbi4gKi9cblx0c2Vzc2lvblJlc291cmNlOiBzdHJpbmc7XG5cdC8qKiBUaGUgcmVzb3VyY2UgVVJJIG9mIHRoZSBsYXN0IGFjdGl2ZSBjaGF0IHdpdGhpbiB0aGUgc2Vzc2lvbi4gKi9cblx0YWN0aXZlQ2hhdFJlc291cmNlPzogc3RyaW5nO1xuXHQvKipcblx0ICogUmVzb3VyY2UgVVJJcyBvZiBjaGF0cyB0aGF0IHdlcmUgY2xvc2VkIChoaWRkZW4gZnJvbSB0aGUgdGFiIHN0cmlwKSBhdCBzYXZlXG5cdCAqIHRpbWUuIFJlc3RvcmVkIHNvIGNsb3NlZCBjaGF0cyBzdGF5IGhpZGRlbiBhY3Jvc3MgcmVsb2FkczsgcmVvcGVuIHRoZW0gZnJvbVxuXHQgKiB0aGUgc2Vzc2lvbiBoZWFkZXIncyBjaGF0cyBkcm9wZG93bi5cblx0ICovXG5cdGNsb3NlZENoYXRSZXNvdXJjZXM/OiBzdHJpbmdbXTtcblx0LyoqIFdoZXRoZXIgdGhpcyBzZXNzaW9uIHdhcyB0aGUgYWN0aXZlIHNlc3Npb24gYXQgdGhlIHRpbWUgb2Ygc2F2ZS4gKi9cblx0aXNBY3RpdmU/OiBib29sZWFuO1xuXHQvKipcblx0ICogUG9zaXRpb24gKGxlZnQtdG8tcmlnaHQpIG9mIHRoZSBzZXNzaW9uIGluIHRoZSBncmlkIGF0IHNhdmUgdGltZSwgd2hlblxuXHQgKiB0aGUgc2Vzc2lvbiB3YXMgdmlzaWJsZS4gYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiB3YXMgbm90IHZpc2libGUuXG5cdCAqL1xuXHR2aXNpYmxlT3JkZXI/OiBudW1iZXI7XG5cdC8qKiBXaGV0aGVyIHRoZSBzZXNzaW9uIHdhcyBwaW5uZWQgKHN0aWNreSkgaW4gdGhlIGdyaWQgYXQgc2F2ZSB0aW1lLiAqL1xuXHRpc1N0aWNreT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogT3ducyB0aGUgdmlzaWJsZSBzZXNzaW9ucyBzaG93biBpbiB0aGUgc2Vzc2lvbnMgcGFydCdzIGdyaWQgYW5kIGV2ZXJ5dGhpbmdcbiAqIHRoYXQgZHJpdmVzIHRoZW06IG9wZW5pbmcgc2Vzc2lvbnMvY2hhdHMsIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlciB2aWV3LFxuICogZ3JpZCBhcnJhbmdlbWVudCAoaW5zZXJ0IC8gc3RpY2tpbmVzcyAvIGNsb3NlKSwgQmFjay9Gb3J3YXJkIG5hdmlnYXRpb24sXG4gKiBmb2N1cywgYW5kIHBlci1zZXNzaW9uIHZpZXcgcGVyc2lzdGVuY2UgKHJlc3RvcmUpLlxuICpcbiAqIFRoaXMgaXMgdGhlICp2aWV3KiBjb3VudGVycGFydCB0byB0aGUgKm1vZGVsKlxuICoge0BsaW5rIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlfTogaXQgcmVmbGVjdHMgbW9kZWwgY2hhbmdlcyByZWFjdGl2ZWx5IGFuZFxuICogb3ducyB0aGUge0BsaW5rIGFjdGl2ZVNlc3Npb259ICh0aGUgdmlzaWJsZSBhY3RpdmUgc2xvdCkuIEl0IG5ldmVyIHBlcmZvcm1zXG4gKiBtb2RlbCBsaWZlY3ljbGUgb3BlcmF0aW9ucyAoY3JlYXRpbmcgc2Vzc2lvbnMsIHNlbmRpbmcgcmVxdWVzdHMsIENSVUQpXG4gKiBpdHNlbGYgXHUyMDE0IHRob3NlIHN0YXkgaW4gdGhlIG1hbmFnZW1lbnQgc2VydmljZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbnNTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBPYnNlcnZhYmxlIGZvciB0aGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uIGFzIHtAbGluayBJQWN0aXZlU2Vzc2lvbn0sXG5cdCAqIG9yIGB1bmRlZmluZWRgIGZvciB0aGUgbmV3LXNlc3Npb24gKGVtcHR5KSBzbG90LlxuXHQgKlxuXHQgKiBUaGlzIGlzIHRoZSBjYW5vbmljYWwgYWN0aXZlIHNlc3Npb246IGl0IHJlZmxlY3RzIHRoZSB2aXNpYmxlIGFjdGl2ZSBzbG90XG5cdCAqIGluIHRoZSBncmlkLiBUaGUgc3BsaXQgbWlycm9ycyBgSUVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yYCAodmlldyBvd25zXG5cdCAqIHRoZSBhY3RpdmUgZWRpdG9yKSB2cyB0aGUgc2Vzc2lvbiBtb2RlbCBpblxuXHQgKiB7QGxpbmsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2V9LlxuXHQgKi9cblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBPYnNlcnZhYmxlIGxpc3Qgb2Ygc2xvdHMgY3VycmVudGx5IGRpc3BsYXllZCBpbiB0aGUgc2Vzc2lvbnMgcGFydCdzXG5cdCAqIGdyaWQsIGluIHRoZWlyIGdyaWQgb3JkZXIgKGxlZnQtdG8tcmlnaHQpLiBFYWNoIGVudHJ5IGlzIGVpdGhlciBhblxuXHQgKiB7QGxpbmsgSUFjdGl2ZVNlc3Npb259IG9yIGB1bmRlZmluZWRgIGZvciB0aGUgZW1wdHkgKG5ldy1zZXNzaW9uKVxuXHQgKiBwbGFjZWhvbGRlci4gQXQgbW9zdCBvbmUgZW50cnkgaXMgYHVuZGVmaW5lZGAgYXQgYSB0aW1lLiBTZXNzaW9uc1xuXHQgKiBwaW5uZWQgdmlhIHtAbGluayB0b2dnbGVTZXNzaW9uU3RpY2tpbmVzc30gYXJlIHN0aWNreTsgdGhlIHJlbWFpbmluZ1xuXHQgKiBub24tc3RpY2t5IGVudHJpZXMgZ2V0IHJlcGxhY2VkIHdoZW4gbmV3IHNlc3Npb25zIGFyZSBvcGVuZWQuXG5cdCAqL1xuXHRyZWFkb25seSB2aXNpYmxlU2Vzc2lvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT47XG5cblx0LyoqIEZpcmVzIGFmdGVyIGEgc2Vzc2lvbidzIHN0aWNraW5lc3Mgd2FzIHRvZ2dsZWQgdmlhIHtAbGluayB0b2dnbGVTZXNzaW9uU3RpY2tpbmVzc30uICovXG5cdHJlYWRvbmx5IG9uRGlkVG9nZ2xlU2Vzc2lvblN0aWNraW5lc3M6IEV2ZW50PElUb2dnbGVTZXNzaW9uU3RpY2tpbmVzc0V2ZW50PjtcblxuXHQvKipcblx0ICogR2V0IGFsbCBzZXNzaW9ucyBmcm9tIGFsbCByZWdpc3RlcmVkIHByb3ZpZGVycywgc3BsaXQgaW50byB0d28gZ3JvdXBzOlxuXHQgKiAtIGByZWNlbnRgOiBzZXNzaW9ucyBvcGVuZWQgaW4gdGhpcyB3b3Jrc3BhY2UsIG1vc3QgcmVjZW50bHkgb3BlbmVkIGZpcnN0LFxuXHQgKiAgIGNhcHBlZCBhdCBhIGZpeGVkIG1heGltdW0uXG5cdCAqIC0gYG90aGVyYDogdGhlIHJlbWFpbmluZyBzZXNzaW9ucywgc29ydGVkIGJ5IHRoZWlyIGxhc3QgdXBkYXRlIHRpbWUgKG1vc3Rcblx0ICogICByZWNlbnRseSB1cGRhdGVkIGZpcnN0KS5cblx0ICpcblx0ICogVXNlZCB0byBwb3B1bGF0ZSB0aGUgc2Vzc2lvbnMgcGlja2VyLlxuXHQgKi9cblx0Z2V0UmVjZW50bHlPcGVuZWRTZXNzaW9ucygpOiBJUmVjZW50bHlPcGVuZWRTZXNzaW9ucztcblxuXHQvKipcblx0ICogU2VsZWN0IGFuIGV4aXN0aW5nIHNlc3Npb24gYXMgdGhlIGFjdGl2ZSBzZXNzaW9uIGFuZCBzaG93IGl0IGluIHRoZSBncmlkLlxuXHQgKiBXaGVuIGBvcHRpb25zLnByZXNlcnZlRm9jdXNgIGlzIHNldCwgdGhlIHNlc3Npb24gaXMgc2hvd24gd2l0aG91dCBtb3Zpbmdcblx0ICoga2V5Ym9hcmQgZm9jdXMgaW50byBpdC5cblx0ICovXG5cdG9wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogT3BlbiBhIHNwZWNpZmljIGNoYXQgd2l0aGluIGEgc2Vzc2lvbiBhbmQgc2hvdyBpdCBpbiB0aGUgZ3JpZC5cblx0ICovXG5cdG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBDbG9zZSBhIGNoYXQgZnJvbSB0aGUgc2Vzc2lvbiB2aWV3LiBUaGUgY2hhdCBpcyBoaWRkZW4gZnJvbSB0aGUgdGFiIHN0cmlwXG5cdCAqIGFuZCBjYW4gYmUgcmVvcGVuZWQgZnJvbSB0aGUgc2Vzc2lvbiBoZWFkZXIncyBjaGF0cyBkcm9wZG93bi5cblx0ICovXG5cdGNsb3NlQ2hhdChzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiwgY2hhdDogSUNoYXQpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBPcGVuIHRoZSBuZXctc2Vzc2lvbiBjb21wb3Nlci5cblx0ICpcblx0ICogLSBXaXRob3V0IGBvcHRpb25zLmZvbGRlclVyaWA6IHN3aXRjaCB0byB0aGUgbmV3LXNlc3Npb24gdmlldywgcmVzdG9yaW5nXG5cdCAqICAgdGhlIHBlbmRpbmcgKGNvbXBvc2VkLWJ1dC1ub3Qtc2VudCkgZHJhZnQgaWYgb25lIGV4aXN0cywgb3RoZXJ3aXNlXG5cdCAqICAgc2hvd2luZyB0aGUgZW1wdHkgcGxhY2Vob2xkZXIuIE5vLW9wIHdoZW4gdGhlIGVtcHR5IHBsYWNlaG9sZGVyIGlzXG5cdCAqICAgYWxyZWFkeSBzaG93aW5nIChubyBzZXNzaW9uIGFjdGl2ZSkuIFJldHVybnMgdGhlIHJlc3RvcmVkIHBlbmRpbmdcblx0ICogICBkcmFmdCBhcyBgcmVzdWx0LnNlc3Npb25gLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vbmU7IGB0cnVzdERlY2xpbmVkYFxuXHQgKiAgIGlzIGFsd2F5cyBgZmFsc2VgLlxuXHQgKiAtIFdpdGggYG9wdGlvbnMuZm9sZGVyVXJpYDogcmVzb2x2ZSB0aGUgd29ya3NwYWNlIGFuZCwgd2hlbiBpdCByZXF1aXJlc1xuXHQgKiAgIHdvcmtzcGFjZSB0cnVzdCwgcHJvbXB0IGZvciBpdCBmaXJzdCAoc2luZ2xlIGdhdGUgZm9yIGV2ZXJ5IHBhdGggdGhhdFxuXHQgKiAgIGNyZWF0ZXMgYSBjb25jcmV0ZSBzZXNzaW9uIGZvciBhIGZvbGRlcikuIElmIHRydXN0IGlzIGRlY2xpbmVkLFxuXHQgKiAgIHJldHVybnMgYHsgc2Vzc2lvbjogdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiB0cnVlIH1gIHdpdGhvdXRcblx0ICogICBjcmVhdGluZyBhIHNlc3Npb24uIE90aGVyd2lzZSBjcmVhdGVzIGEgY29uY3JldGUgZHJhZnQgc2Vzc2lvbiBmb3Jcblx0ICogICB0aGF0IGZvbGRlciAodmlhIHtAbGluayBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVOZXdTZXNzaW9ufSlcblx0ICogICBhbmQgc2hvd3MgaXQgYXMgdGhlIGFjdGl2ZSBzZXNzaW9uLCByZXR1cm5pbmcgaXQgYXMgYHJlc3VsdC5zZXNzaW9uYC5cblx0ICovXG5cdG9wZW5OZXdTZXNzaW9uKG9wdGlvbnM/OiBJT3Blbk5ld1Nlc3Npb25PcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJT3Blbk5ld1Nlc3Npb25SZXN1bHQ+O1xuXG5cdC8qKlxuXHQgKiBPcGVuIGEgbmV3ICoqcXVpY2sgY2hhdCoqOiBjcmVhdGUgYSBjb25jcmV0ZSB3b3Jrc3BhY2UtbGVzcyBkcmFmdCBzZXNzaW9uXG5cdCAqICh2aWEge0BsaW5rIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdH0pIGFuZCBzaG93IGl0IGFzIHRoZVxuXHQgKiBhY3RpdmUgc2Vzc2lvbi4gUmV0dXJucyB0aGUgYWN0aXZhdGVkIHNlc3Npb24sIG9yIGB1bmRlZmluZWRgIHdoZW4gbm9cblx0ICogcHJvdmlkZXIgc3VwcG9ydHMgcXVpY2sgY2hhdHMuXG5cdCAqL1xuXHRvcGVuUXVpY2tDaGF0KG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU3dpdGNoIHRvIHRoZSBuZXctY2hhdC1pbi1zZXNzaW9uIHZpZXcuXG5cdCAqIEFkZHMgYSBuZXcgY2hhdCB0byB0aGUgc2Vzc2lvbiB2aWEgdGhlIHByb3ZpZGVyLCBtYWtlcyBpdCB0aGUgYWN0aXZlIGNoYXQsXG5cdCAqIGFuZCBzaG93cyBhIHJpY2ggaW5wdXQgZm9yIGNvbXBvc2luZyBhIG1lc3NhZ2UuIFBhc3Ncblx0ICoge0BsaW5rIElDcmVhdGVOZXdDaGF0SW5TZXNzaW9uT3B0aW9ucy5mb3JjZU5ld30gdG8gYWx3YXlzIGNyZWF0ZSBhIGZyZXNoXG5cdCAqIGNoYXQgKGUuZy4gd2hlbiByZXNldHRpbmcgdGhlIGNvbXBvc2VyIHJpZ2h0IGFmdGVyIGEgYmFja2dyb3VuZCBzZW5kKS5cblx0ICovXG5cdG9wZW5OZXdDaGF0SW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCBvcHRpb25zPzogSUNyZWF0ZU5ld0NoYXRJblNlc3Npb25PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogRGlzY2FyZCB0aGUgcGVuZGluZyBuZXcgc2Vzc2lvbiBhbmQgY2xlYXIgdGhlIGFjdGl2ZSBzZXNzaW9uLCByZXR1cm5pbmdcblx0ICogdG8gdGhlIGVtcHR5IG5ldy1zZXNzaW9uIHBsYWNlaG9sZGVyLlxuXHQgKi9cblx0dW5zZXROZXdTZXNzaW9uKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEluc2VydCAob3IgbW92ZSkgYSBzZXNzaW9uIGludG8gdGhlIGdyaWQgcG9zaXRpb25lZCBuZXh0IHRvIGEgdGFyZ2V0XG5cdCAqIHNlc3Npb24gdGhhdCBpcyBhbHJlYWR5IHZpc2libGUuXG5cdCAqL1xuXHRpbnNlcnRBdChzZXNzaW9uOiBJU2Vzc2lvbiwgdGFyZ2V0U2Vzc2lvbklkOiBzdHJpbmcsIHNpZGU6ICdsZWZ0JyB8ICdyaWdodCcsIGFjdGl2YXRlPzogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFRvZ2dsZSBhIHNlc3Npb24ncyBzdGlja2luZXNzIGluIHRoZSBncmlkLiBUaGUgc2Vzc2lvbiBrZWVwcyBpdHMgZ3JpZFxuXHQgKiBzbG90IHdoZW4gdG9nZ2xlZC4gSWYgdGhlIHNlc3Npb24gaXMgbm90IGN1cnJlbnRseSB2aXNpYmxlLCBpdCBpc1xuXHQgKiBhcHBlbmRlZCB0byB0aGUgZ3JpZCBhcyBzdGlja3kuXG5cdCAqL1xuXHR0b2dnbGVTZXNzaW9uU3RpY2tpbmVzcyhzZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENsb3NlIGEgc2Vzc2lvbjogcmVtb3ZlIGl0IGZyb20gdGhlIGdyaWQuIElmIGl0IHdhcyB0aGUgYWN0aXZlIG9uZSwgdGhlXG5cdCAqIHByZXZpb3VzIHZpc2libGUgc2Vzc2lvbiBiZWNvbWVzIGFjdGl2ZTsgaWYgbm8gc2Vzc2lvbiByZW1haW5zIHZpc2libGUsXG5cdCAqIHRoZSBuZXctc2Vzc2lvbiB2aWV3IGlzIG9wZW5lZC4gUGFzc2luZyBgdW5kZWZpbmVkYCBjbG9zZXMgdGhlIGVtcHR5XG5cdCAqIChuZXctc2Vzc2lvbikgc2xvdCBpZiBpdCBpcyBjdXJyZW50bHkgdmlzaWJsZS5cblx0ICovXG5cdGNsb3NlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENsb3NlIGFsbCBzZXNzaW9ucyBjdXJyZW50bHkgc2hvd24gaW4gdGhlIGdyaWQgYW5kIGxhbmQgb24gdGhlXG5cdCAqIG5ldy1zZXNzaW9uIHZpZXcuIE5vLW9wIHdoZW4gbm8gc2Vzc2lvbiBpcyBjdXJyZW50bHkgdmlzaWJsZS5cblx0ICovXG5cdGNsb3NlQWxsU2Vzc2lvbnMoKTogdm9pZDtcblxuXHQvKiogTWFrZSB0aGUgZ2l2ZW4gKGFscmVhZHkgdmlzaWJsZSkgc2Vzc2lvbiB0aGUgYWN0aXZlIHNlc3Npb24uICovXG5cdHNldEFjdGl2ZShzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqIFN1Ym1pdCB0aGUgbGl2ZSBpbnB1dCBpbiB0aGUgYWN0aXZlIG5ldy1zZXNzaW9uIGNvbXBvc2VyLiAqL1xuXHRzdWJtaXROZXdTZXNzaW9uSW5wdXQoKTogUHJvbWlzZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogUmVzdG9yZSB0aGUgc2Vzc2lvbnMgdGhhdCB3ZXJlIHZpc2libGUgaW4gdGhlIGdyaWQgZnJvbSBwZXJzaXN0ZWQgc3RhdGUuXG5cdCAqIFJlc3RvcmVzIHRoZWlyIG9yZGVyLCBzdGlja3kgKHBpbm5lZCkgc3RhdGUgYW5kIHRoZSBhY3RpdmUgc2Vzc2lvbixcblx0ICogd2FpdGluZyB1bnRpbCBlYWNoIHNlc3Npb24ncyBwcm92aWRlciBtYWtlcyBpdCBhdmFpbGFibGUuIEZhbGxzIGJhY2sgdG9cblx0ICogdGhlIG5ldy1zZXNzaW9uIHZpZXcgd2hlbiBub3RoaW5nIGNhbiBiZSByZXN0b3JlZC5cblx0ICovXG5cdHJlc3RvcmVWaXNpYmxlU2Vzc2lvbnMoKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKiogTmF2aWdhdGUgdG8gdGhlIHByZXZpb3VzIHNlc3Npb24gaW4gdGhlIG5hdmlnYXRpb24gaGlzdG9yeS4gKi9cblx0b3BlblByZXZpb3VzU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKiBOYXZpZ2F0ZSB0byB0aGUgbmV4dCBzZXNzaW9uIGluIHRoZSBuYXZpZ2F0aW9uIGhpc3RvcnkuICovXG5cdG9wZW5OZXh0U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgSVNlc3Npb25zU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJU2Vzc2lvbnNTZXJ2aWNlPignc2Vzc2lvbnNTZXJ2aWNlJyk7XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlc3Npb25zU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2dnbGVTZXNzaW9uU3RpY2tpbmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUb2dnbGVTZXNzaW9uU3RpY2tpbmVzc0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRUb2dnbGVTZXNzaW9uU3RpY2tpbmVzczogRXZlbnQ8SVRvZ2dsZVNlc3Npb25TdGlja2luZXNzRXZlbnQ+ID0gdGhpcy5fb25EaWRUb2dnbGVTZXNzaW9uU3RpY2tpbmVzcy5ldmVudDtcblxuXHQvKiogT3ducyB0aGUgYWN0aXZlL3N0aWNreS90cmFuc2llbnQgdmlzaWJpbGl0eSBtb2RlbCBhbmQgdGhlIHtAbGluayBJQWN0aXZlU2Vzc2lvbn0gd3JhcHBlcnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2liaWxpdHk6IFZpc2libGVTZXNzaW9ucztcblx0cmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+O1xuXG5cdC8qKiBUaGUgY2Fub25pY2FsIGFjdGl2ZSBzZXNzaW9uIFx1MjAxNCB0aGUgdmlzaWJsZSBhY3RpdmUgc2xvdC4gKi9cblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTmV3Q2hhdFNlc3Npb25Db250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKiogQ2FuY2VsbGVkIG9uIGV2ZXJ5IG5hdmlnYXRpb24gYWN0aW9uIHNvIGluLWZsaWdodCBhc3luYyBvcGVucyBiYWlsIG91dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlblNlc3Npb25DdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHQvKipcblx0ICogQ2FuY2VsbGF0aW9uIGZvciB0aGUgaW4tZmxpZ2h0IHtAbGluayByZXN0b3JlVmlzaWJsZVNlc3Npb25zfS4gS2VwdFxuXHQgKiBzZXBhcmF0ZSBmcm9tIHtAbGluayBfb3BlblNlc3Npb25DdHN9IHNvIHRoYXQgYWRkaXRpdmUgbmV3LXNlc3Npb25cblx0ICogb3BlcmF0aW9ucyAodGhlIG5ldy1jaGF0IGNvbXBvc2VyIGVhZ2VybHkgY3JlYXRpbmcgYSBkcmFmdCBvbiBzdGFydHVwKVxuXHQgKiBkbyBub3QgYWJvcnQgcmVzdG9yaW5nIHRoZSBwcmV2aW91c2x5IHZpc2libGUgZ3JpZC4gT25seSBhbiBleHBsaWNpdFxuXHQgKiBuYXZpZ2F0aW9uIHRvIGEgc3BlY2lmaWMgc2Vzc2lvbiBjYW5jZWxzIGEgcmVzdG9yZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3RvcmVDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZXM6IFJlc291cmNlTWFwPElTZXNzaW9uU3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uYXZpZ2F0aW9uOiBTZXNzaW9uc05hdmlnYXRpb247XG5cdC8qKlxuXHQgKiBUaGUgc2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3Igc2Vzc2lvbiByZWNlbmN5IChtb3N0LXJlY2VudGx5LW9wZW5lZFxuXHQgKiBmaXJzdCksIHBlcnNpc3RlZCBhY3Jvc3MgcmVzdGFydHMuIEJvdGggdGhlIHJlY2VudC1zZXNzaW9ucyBwaWNrZXIgKHZpYVxuXHQgKiB7QGxpbmsgZ2V0UmVjZW50bHlPcGVuZWRTZXNzaW9uc30pIGFuZCB7QGxpbmsgU2Vzc2lvbnNOYXZpZ2F0aW9ufSBidWlsZCBvblxuXHQgKiB0b3Agb2YgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNlbmN5SGlzdG9yeTogU2Vzc2lvbnNSZWNlbmN5SGlzdG9yeTtcblxuXHQvKipcblx0ICogU2Vzc2lvbiBpZCAob3IgYHVuZGVmaW5lZGAgZm9yIHRoZSBuZXctc2Vzc2lvbiBzbG90KSB0aGF0IGZvY3VzIHdhcyBsYXN0XG5cdCAqIG1vdmVkIGludG8gaW4gcmVzcG9uc2UgdG8gYW4gYWN0aXZlLXNlc3Npb24gY2hhbmdlLiBUcmFja3MgdGhlIGFjdGl2ZSBpZFxuXHQgKiBzbyB1bnJlbGF0ZWQgdmlzaWJpbGl0eSB1cGRhdGVzIGRvbid0IHJlLWZvY3VzIGFuZCBzdGVhbCBmb2N1cy5cblx0ICovXG5cdHByaXZhdGUgX2ZvY3VzZWRBY3RpdmVTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogVGhlIGluLWZsaWdodCBmb3JlZ3JvdW5kIHNlbmQncyBcImtlZXAgbmV3ZXN0IGNoYXQgYWN0aXZlXCIgZm9sbG93LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZW5kRm9sbG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1BhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNQYXJ0U2VydmljZTogSVNlc3Npb25zUGFydFNlcnZpY2UsXG5cdFx0QElDdXN0b21WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbVZpZXdTZXJ2aWNlOiBJQ3VzdG9tVmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBMb2FkIHBlcnNpc3RlZCBzdGF0ZVxuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMgPSB0aGlzLl9sb2FkU2Vzc2lvblN0YXRlcygpO1xuXG5cdFx0Ly8gVmlzaWJpbGl0eSBtb2RlbCBcdTIwMTQgb3ducyB3cmFwcGVycywgYWN0aXZlL3N0aWNreS90cmFuc2llbnQgc3RhdGUsIGFuZFxuXHRcdC8vIG9ic2VydmFibGVzIGV4cG9zZWQgdG8gdGhlIFVJLlxuXHRcdHRoaXMuX3Zpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VmlzaWJsZVNlc3Npb25zLFxuXHRcdFx0c2Vzc2lvbiA9PiB0aGlzLl9yZXN0b3JlSW5pdGlhbENoYXQoc2Vzc2lvbiksXG5cdFx0XHRzZXNzaW9uID0+IHRoaXMuX3Jlc3RvcmVDbG9zZWRDaGF0cyhzZXNzaW9uKSxcblx0XHQpKTtcblx0XHR0aGlzLnZpc2libGVTZXNzaW9ucyA9IHRoaXMuX3Zpc2liaWxpdHkudmlzaWJsZVNlc3Npb25zO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbjtcblxuXHRcdC8vIEJpbmQgYWN0aXZlLXNlc3Npb24gY29udGV4dCBrZXlzLiBUaGVzZSByZWZsZWN0IHRoZSB2aXNpYmxlIGFjdGl2ZVxuXHRcdC8vIHNsb3QgKHRoZSB2aWV3J3MgYGFjdGl2ZVNlc3Npb25gKTsgYGlzTmV3Q2hhdFNlc3Npb25gIGFsc28gY29uc3VsdHNcblx0XHQvLyB0aGUgbW9kZWwncyBpbi1wcm9ncmVzcyBkcmFmdCAoYG5ld1Nlc3Npb25gKS5cblx0XHR0aGlzLl9pc05ld0NoYXRTZXNzaW9uQ29udGV4dCA9IElzTmV3Q2hhdFNlc3Npb25Db250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFNhdmUgb24gc2h1dGRvd25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB0aGlzLl9zYXZlU2Vzc2lvblN0YXRlcygpKSk7XG5cblx0XHQvLyBTZXNzaW9uIHJlY2VuY3kgaGlzdG9yeSBcdTIwMTQgdGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIFwicmVjZW50bHlcblx0XHQvLyBvcGVuZWRcIiBvcmRlcmluZywgc2hhcmVkIGJ5IHRoZSBwaWNrZXIgYW5kIG5hdmlnYXRpb24uXG5cdFx0dGhpcy5fcmVjZW5jeUhpc3RvcnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbnNSZWNlbmN5SGlzdG9yeShcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHQvLyBTZXNzaW9uIG5hdmlnYXRpb24gaGlzdG9yeSAoQmFjay9Gb3J3YXJkKSBidWlsZHMgb24gdGhlIHJlY2VuY3kgaGlzdG9yeS5cblx0XHR0aGlzLl9uYXZpZ2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNlc3Npb25zTmF2aWdhdGlvbihcblx0XHRcdHRoaXMsXG5cdFx0XHR0aGlzLmFjdGl2ZVNlc3Npb24sXG5cdFx0XHR0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0XHR0aGlzLl9yZWNlbmN5SGlzdG9yeSxcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9uYXZpZ2F0aW9uLm9uRGlkUmVtb3ZlU2Vzc2lvbnMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWREZWxldGVTZXNzaW9uKHNlc3Npb24gPT4gdGhpcy5fcmVjZW5jeUhpc3RvcnkucmVtb3ZlKGVudHJ5ID0+IGVudHJ5LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpKSk7XG5cblx0XHQvLyBLZWVwIHRoZSBhY3RpdmUtc2Vzc2lvbiBjb250ZXh0IGtleXMgaW4gc3luYyB3aXRoIHRoZSB2aXNpYmxlIGFjdGl2ZVxuXHRcdC8vIHNsb3QgYW5kIHRoZSBtb2RlbCdzIGluLXByb2dyZXNzIGRyYWZ0LiBUaGUgaGVscGVyIHJlYWRzIHRoZSBzZXNzaW9uJ3Ncblx0XHQvLyBvYnNlcnZhYmxlIHByb3BlcnRpZXMgdmlhIGByZWFkZXJgLCBzbyB0aGlzIGF1dG9ydW4gcmUtYXBwbGllcyB0aGUga2V5c1xuXHRcdC8vIHdoZW5ldmVyIGFueSBvZiB0aGVtIGNoYW5nZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubmV3U2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHQvLyBgaXNOZXdDaGF0U2Vzc2lvbmAgaXMgdHJ1ZSB3aGVuIG5vIGFjdGl2ZSBzZXNzaW9uIGV4aXN0cywgT1Igd2hlbiB0aGVcblx0XHRcdC8vIGFjdGl2ZSBzZXNzaW9uIGlzIHN0aWxsIHRoZSBpbi1wcm9ncmVzcyBuZXcgc2Vzc2lvbiAoY3JlYXRlZCBidXQgbm90IHlldFxuXHRcdFx0Ly8gc2VudCBmb3IgdGhlIGZpcnN0IHRpbWUpLiBTY29waW5nIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbiBhdm9pZHMgZmxpcHBpbmdcblx0XHRcdC8vIGludG8gXCJuZXcgY2hhdFwiIG1vZGUgd2hpbGUgdmlld2luZyBhIGRpZmZlcmVudCBlc3RhYmxpc2hlZCBzZXNzaW9uLlxuXHRcdFx0dGhpcy5faXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQuc2V0KGFjdGl2ZVNlc3Npb24gPT09IHVuZGVmaW5lZCB8fCBhY3RpdmVTZXNzaW9uLnNlc3Npb25JZCA9PT0gbmV3U2Vzc2lvbj8uc2Vzc2lvbklkKTtcblx0XHRcdHNldEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cyhhY3RpdmVTZXNzaW9uLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFBlci1hY3RpdmUtc2Vzc2lvbiB2aWV3IHJlYWN0aW9ucyAoYXJjaGl2ZWQgXHUyMTkyIG5ldy1zZXNzaW9uIHZpZXcsXG5cdFx0Ly8gYWN0aXZlLWNoYXQgcmVtb3ZlZCBcdTIxOTIgZmFsbGJhY2sgY2hhdCwgcGVyc2lzdCB0aGUgYWN0aXZlIGNoYXQpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9hY3RpdmVTZXNzaW9uVmlld0xpc3RlbmVycyhhY3RpdmVTZXNzaW9uKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVmlld2luZyBhIHNlc3Npb24gbWFya3MgaXQgcmVhZC4gVGhpcyBrZWVwcyB0aGUgYWN0aXZlIHNlc3Npb24gcmVhZFxuXHRcdC8vIHdoaWxlIGl0IHN0YXlzIGFjdGl2ZSwgc28gYElTZXNzaW9uLmlzUmVhZGAgaXMgdGhlIHNpbmdsZSBzb3VyY2Ugb2Zcblx0XHQvLyB0cnV0aCBmb3IgcmVhZCBzdGF0ZSAobm8gZGlzcGxheS1vbmx5IG92ZXJsYXkgbmVlZGVkKS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uICYmICFhY3RpdmVTZXNzaW9uLmlzUmVhZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtSZWFkKGFjdGl2ZVNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlZmxlY3QgcHJvdmlkZXItbGV2ZWwgc2Vzc2lvbiBjaGFuZ2VzIG9udG8gdGhlIGdyaWQ6IGRyb3AgcmVtb3ZlZFxuXHRcdC8vIHNlc3Npb25zIGFuZCBwaWNrIGEgZmFsbGJhY2sgKG9yIHRoZSBuZXctc2Vzc2lvbiB2aWV3KSB3aGVuIHRoZSBhY3RpdmVcblx0XHQvLyBvbmUgZGlzYXBwZWFycy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMoZSkpKTtcblxuXHRcdC8vIFJlZmxlY3QgcHJvdmlkZXIgc2Vzc2lvbiByZXBsYWNlbWVudCAoZS5nLiBhIGRyYWZ0IGdyYWR1YXRpbmcgaW50byBhXG5cdFx0Ly8gY29tbWl0dGVkIHNlc3Npb24pIG9udG8gdGhlIGdyaWQgc2xvdC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRSZXBsYWNlU2Vzc2lvbigoeyBmcm9tLCB0byB9KSA9PiB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uKGZyb20sIHRvKSkpO1xuXG5cdFx0Ly8gV2hpbGUgYSBmb3JlZ3JvdW5kIHNlbmQgbWF0ZXJpYWxpc2VzIG5ldyBjaGF0cywga2VlcCB0aGUgbmV3ZXN0IGNoYXRcblx0XHQvLyBhY3RpdmUgaW4gdGhlIHZpc2libGUgc2xvdCBzbyB0aGUgdXNlciBzZWVzIHRoZSBjaGF0IGJlaW5nIHNlbnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uV2lsbFNlbmRSZXF1ZXN0KHNlc3Npb24gPT4gdGhpcy5fc3RhcnRTZW5kRm9sbG93KHNlc3Npb24pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkU2VuZFJlcXVlc3QoKCkgPT4gdGhpcy5fc2VuZEZvbGxvdy5jbGVhcigpKSk7XG5cblx0XHQvLyBEcml2ZSB0aGUgcGFydDogcmVjb25jaWxlIHRoZSBncmlkIGFuZCBtb3ZlIGZvY3VzIGludG8gdGhlIGFjdGl2ZVxuXHRcdC8vIHNlc3Npb24gd2hlbmV2ZXIgdGhlIHZpc2libGUgc2Vzc2lvbnMgb3IgdGhlIGFjdGl2ZSBzZXNzaW9uIGNoYW5nZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy52aXNpYmxlU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSB0aGlzLl92aXNpYmlsaXR5LmFjdGl2ZVByZXNlcnZlRm9jdXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc1BhcnRTZXJ2aWNlLnVwZGF0ZVZpc2libGVTZXNzaW9ucyh2aXNpYmxlLCBhY3RpdmUpO1xuXG5cdFx0XHQvLyBNb3ZlIGtleWJvYXJkIGZvY3VzIGludG8gdGhlIGFjdGl2ZSBzZXNzaW9uIHdoZW5ldmVyIGl0IGNoYW5nZXNcblx0XHRcdC8vIChlLmcuIGFmdGVyIG9wZW5pbmcsIHN3aXRjaGluZyB0bywgb3IgcmVzdG9yaW5nIGEgc2Vzc2lvbikgc28gdGhlXG5cdFx0XHQvLyB1c2VyIGNhbiBzdGFydCB0eXBpbmcgaW1tZWRpYXRlbHkuIFRoZSBmb2N1cyBpcyBndWFyZGVkIHNvIGFcblx0XHRcdC8vIHNlc3Npb24gdGhlIHVzZXIgaXMgYWxyZWFkeSBpbnRlcmFjdGluZyB3aXRoIGlzIG5ldmVyIHJlLWZvY3VzZWRcblx0XHRcdC8vICh3aGljaCB3b3VsZCBzdGVhbCBmb2N1cyBmcm9tIHRoZSBjbGlja2VkIGVsZW1lbnQpLCBhbmQgdGhlIGlkXG5cdFx0XHQvLyBjaGVjayBlbnN1cmVzIHVucmVsYXRlZCB2aXNpYmlsaXR5IHVwZGF0ZXMgZG8gbm90IG1vdmUgZm9jdXMuXG5cdFx0XHQvLyBgcHJlc2VydmVGb2N1c2AgKHB1Ymxpc2hlZCBhdG9taWNhbGx5IHdpdGggdGhlIGFjdGl2ZSBzZXNzaW9uKVxuXHRcdFx0Ly8gc3VwcHJlc3NlcyB0aGUgZm9jdXMgbW92ZSBmb3IgYmFja2dyb3VuZCBvcGVucy5cblx0XHRcdGNvbnN0IGFjdGl2ZUlkID0gYWN0aXZlPy5zZXNzaW9uSWQ7XG5cdFx0XHRpZiAoYWN0aXZlSWQgIT09IHRoaXMuX2ZvY3VzZWRBY3RpdmVTZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEFjdGl2ZVNlc3Npb25JZCA9IGFjdGl2ZUlkO1xuXHRcdFx0XHRpZiAoIXByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0XHR0aGlzLnNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKGFjdGl2ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIGEgc2Vzc2lvbiB2aWV3IGluIHRoZSBncmlkIHJlY2VpdmVzIGZvY3VzLCBwcm9tb3RlIHRoYXQgc2Vzc2lvblxuXHRcdC8vIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zUGFydFNlcnZpY2Uub25EaWRGb2N1c1Nlc3Npb24oc2Vzc2lvbklkID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnZpc2libGVTZXNzaW9ucy5nZXQoKS5maW5kKHMgPT4gcz8uc2Vzc2lvbklkID09PSBzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5zZXRBY3RpdmUoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRSZXBsYWNlU2Vzc2lvbihmcm9tOiBJU2Vzc2lvbiwgdG86IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJpbGl0eS51cGRhdGVTZXNzaW9uKGZyb20sIHRvKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2ZVNlc3Npb25WaWV3TGlzdGVuZXJzKGFjdGl2ZVNlc3Npb246IElBY3RpdmVTZXNzaW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gYmVjb21lcyBhcmNoaXZlZCwgcmV0dXJuIHRvIHRoZSBuZXctc2Vzc2lvblxuXHRcdC8vIHZpZXcgKG9yIHRoZSBxdWljay1jaGF0IGNvbXBvc2VyIGZvciBhIHF1aWNrIGNoYXQpLCBrZWVwaW5nIGNvbnRleHQuXG5cdFx0bGV0IHdhc0FyY2hpdmVkID0gYWN0aXZlU2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0FyY2hpdmVkID0gYWN0aXZlU2Vzc2lvbi5pc0FyY2hpdmVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc0FyY2hpdmVkICYmICF3YXNBcmNoaXZlZCkge1xuXHRcdFx0XHRpZiAoYWN0aXZlU2Vzc2lvbi5pc1F1aWNrQ2hhdD8ucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuUXVpY2tDaGF0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UucmVhZCh1bmRlZmluZWQpPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdFx0XHRcdHRoaXMub3Blbk5ld1Nlc3Npb24oZm9sZGVyVXJpXG5cdFx0XHRcdFx0XHQ/IHsgZm9sZGVyVXJpLCAuLi5pbmhlcml0YWJsZVNlc3Npb25UYXJnZXQodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBhY3RpdmVTZXNzaW9uLCBmb2xkZXJVcmkpIH1cblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0d2FzQXJjaGl2ZWQgPSBpc0FyY2hpdmVkO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGNoYXQgbGlzdCBjaGFuZ2VzIFx1MjAxNCBpZiB0aGUgYWN0aXZlIGNoYXQgaXMgcmVtb3ZlZCwgZmFsbCBiYWNrLlxuXHRcdGlmIChhY3RpdmVTZXNzaW9uLnN0YXR1cy5nZXQoKSAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY2hhdHMgPSBhY3RpdmVTZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlQ2hhdCA9IGFjdGl2ZVNlc3Npb24uYWN0aXZlQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChhY3RpdmVDaGF0ICYmICFjaGF0cy5zb21lKGMgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoYy5yZXNvdXJjZSwgYWN0aXZlQ2hhdC5yZXNvdXJjZSkpKSB7XG5cdFx0XHRcdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBsYXN0IHZpc2libGUgKG5vbi1oaWRkZW4pIGNoYXQsIG9yIHRoZSBtYWluIGNoYXQuXG5cdFx0XHRcdFx0Y29uc3QgdmlzaWJsZSA9IGNoYXRzLmZpbHRlcihjID0+IGMuaW50ZXJhY3Rpdml0eS5yZWFkKHJlYWRlcikgIT09IENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbik7XG5cdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2sgPSB2aXNpYmxlW3Zpc2libGUubGVuZ3RoIC0gMV0gPz8gYWN0aXZlU2Vzc2lvbi5tYWluQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKGZhbGxiYWNrKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW5DaGF0KGFjdGl2ZVNlc3Npb24sIGZhbGxiYWNrLnJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBhY3RpdmUgY2hhdCBjaGFuZ2VzIHRvIHBlcnNpc3QgcGVyLXNlc3Npb24gc3RhdGUuIFRoZSB2aXNpYmxlIC9cblx0XHQvLyBhY3RpdmUgLyBzdGlja3kgZmxhZ3MgYXJlIHNuYXBzaG90dGVkIGZyb20gdGhlIGxpdmUgZ3JpZCBhdCBzYXZlIHRpbWVcblx0XHQvLyAoc2VlIGBfc25hcHNob3RWaXNpYmxlU2Vzc2lvblN0YXRlc2ApOyBoZXJlIHdlIG9ubHkgcmVtZW1iZXIgdGhlIGxhc3Rcblx0XHQvLyBhY3RpdmUgY2hhdCBzbyByZW9wZW5pbmcgdGhlIHNlc3Npb24gcmVzdG9yZXMgaXRzIHNlbGVjdGVkIGNoYXQuIFRoZVxuXHRcdC8vIGNsb3NlZC1jaGF0IHNldCBpcyBwZXJzaXN0ZWQgZGV0ZXJtaW5pc3RpY2FsbHkgaW4gYGNsb3NlQ2hhdGAvYG9wZW5DaGF0YFxuXHRcdC8vIGluc3RlYWQgKHNlZSBgX3NldENoYXRDbG9zZWRTdGF0ZWApLCBzbyBpdCBuZXZlciBkZXBlbmRzIG9uIGNoYXRzIGJlaW5nXG5cdFx0Ly8gbG9hZGVkIG9yIG9uIGF1dG9ydW4gdGltaW5nLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGF0ID0gYWN0aXZlU2Vzc2lvbi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjaGF0ICYmIGNoYXQuc3RhdHVzLnJlYWQodW5kZWZpbmVkKSAhPT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChhY3RpdmVTZXNzaW9uLnJlc291cmNlLCB7XG5cdFx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBhY3RpdmVTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0YWN0aXZlQ2hhdFJlc291cmNlOiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2Vzc2lvbnMoZTogSVNlc3Npb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50QWN0aXZlID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXG5cdFx0Ly8gQ2xlYW4gcmVtb3ZlZCBzZXNzaW9ucyBvdXQgb2YgdGhlIHZpc2liaWxpdHkgbW9kZWwgKGRyb3BzIHRoZWlyIGdyaWRcblx0XHQvLyBzbG90IGFuZCBkaXNwb3NlcyB0aGVpciB3cmFwcGVyKS4gSWYgdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIGFtb25nIHRoZVxuXHRcdC8vIHJlbW92ZWQsIHJlbW92ZU1hbnkgcGlja3MgYSBmYWxsYmFjayBhY3RpdmUgc2Vzc2lvbiAob3IgY2xlYXJzIGl0IHdoZW5cblx0XHQvLyBubyBzbG90IHJlbWFpbnMpOyBkcml2ZSB0aGUgb3BlbiBmbG93IGJlbG93IHNvIHRoZSBmYWxsYmFjayBpcyBmdWxseVxuXHRcdC8vIG9wZW5lZC5cblx0XHRpZiAoZS5yZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Zpc2liaWxpdHkucmVtb3ZlTWFueShlLnJlbW92ZWQubWFwKHIgPT4gci5zZXNzaW9uSWQpKTtcblx0XHR9XG5cblx0XHRpZiAoIWN1cnJlbnRBY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5yZW1vdmVkLmxlbmd0aCAmJiBlLnJlbW92ZWQuc29tZShyID0+IHIuc2Vzc2lvbklkID09PSBjdXJyZW50QWN0aXZlLnNlc3Npb25JZCkpIHtcblx0XHRcdGNvbnN0IGZhbGxiYWNrID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGZhbGxiYWNrICYmIHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKGZhbGxiYWNrLnJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLm9wZW5TZXNzaW9uKGZhbGxiYWNrLnJlc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMub3Blbk5ld1Nlc3Npb24oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydFNlbmRGb2xsb3coc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgZm9sbG93SWQgPSBzZXNzaW9uLnNlc3Npb25JZDtcblx0XHQvLyBBIGZvcmVncm91bmQgc2VuZCBjYW4gcmVwbGFjZSB0aGUgc2Vzc2lvbiBpZCAoZHJhZnQgZ3JhZHVhdGluZyBpbnRvIGFcblx0XHQvLyBjb21taXR0ZWQgc2Vzc2lvbik7IGtlZXAgZm9sbG93aW5nIHRoZSBuZXcgaWQuXG5cdFx0c3RvcmUuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZFJlcGxhY2VTZXNzaW9uKCh7IGZyb20sIHRvIH0pID0+IHtcblx0XHRcdGlmIChmcm9tLnNlc3Npb25JZCA9PT0gZm9sbG93SWQpIHtcblx0XHRcdFx0Zm9sbG93SWQgPSB0by5zZXNzaW9uSWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLl92aXNpYmlsaXR5LmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGFjdGl2ZSAmJiBhY3RpdmUuc2Vzc2lvbklkID09PSBmb2xsb3dJZCkge1xuXHRcdFx0XHRjb25zdCBjaGF0cyA9IGFjdGl2ZS52aXNpYmxlQ2hhdFRhYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBsYXN0Q2hhdCA9IGNoYXRzW2NoYXRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRpZiAobGFzdENoYXQpIHtcblx0XHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZUNoYXQoYWN0aXZlLCBsYXN0Q2hhdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fc2VuZEZvbGxvdy52YWx1ZSA9IHN0b3JlO1xuXHR9XG5cblx0Z2V0UmVjZW50bHlPcGVuZWRTZXNzaW9ucygpOiBJUmVjZW50bHlPcGVuZWRTZXNzaW9ucyB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlY2VudDogSVNlc3Npb25bXSA9IFtdO1xuXG5cdFx0Ly8gU2Vzc2lvbnMgaW4gcmVjZW5jeSBvcmRlciAobW9zdC1yZWNlbnRseS1vcGVuZWQgZmlyc3QpLCBkZWR1cGxpY2F0ZWQgYnlcblx0XHQvLyBzZXNzaW9uIHNvIGEgc2Vzc2lvbiB3aXRoIG11bHRpcGxlIG9wZW5lZCBjaGF0cyBhcHBlYXJzIG9ubHkgb25jZSBhbmRcblx0XHQvLyBjYXBwZWQgYXQgdGhlIG1vc3QgcmVjZW50IHtAbGluayBNQVhfUkVDRU5UTFlfT1BFTkVEX1NFU1NJT05TfS5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3JlY2VuY3lIaXN0b3J5LmVudHJpZXMpIHtcblx0XHRcdGlmIChyZWNlbnQubGVuZ3RoID49IE1BWF9SRUNFTlRMWV9PUEVORURfU0VTU0lPTlMpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrZXkgPSBlbnRyeS5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGlmIChzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihlbnRyeS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0cmVjZW50LnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2Vzc2lvbnMgdGhhdCBoYXZlIG5vdCBiZWVuIGluY2x1ZGVkIGluIHRoZSByZWNlbnRseSBvcGVuZWQgZ3JvdXAsXG5cdFx0Ly8gc29ydGVkIGJ5IG1vc3QgcmVjZW50bHkgdXBkYXRlZCBmaXJzdC5cblx0XHRjb25zdCBvdGhlciA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9ucygpXG5cdFx0XHQuZmlsdGVyKHMgPT4gIXNlZW4uaGFzKHMucmVzb3VyY2UudG9TdHJpbmcoKSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpIC0gYS51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpKTtcblxuXHRcdHJldHVybiB7IHJlY2VudCwgb3RoZXIgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgYW55IGluLWZsaWdodCBvcGVuLXNlc3Npb24vcmVzdG9yZSBhbmQgcmV0dXJuIGEgZnJlc2ggY2FuY2VsbGF0aW9uIHRva2VuLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRPcGVuU2Vzc2lvbigpOiBDYW5jZWxsYXRpb25Ub2tlbiB7XG5cdFx0Ly8gT3BlbmluZyBhIHNlc3Npb24gaXMgdGhlIGdlc3R1cmUgdGhhdCBkaXNtaXNzZXMgYSBjdXN0b20gdmlldzsgdGhlXG5cdFx0Ly8gd29ya2JlbmNoIHRoZW4gcmVzdG9yZXMgdGhlIHNlc3Npb25zIGdyaWQgYW5kIGl0cyBzaWRlIHBhbmVsIHN0YXRlLlxuXHRcdHRoaXMuY3VzdG9tVmlld1NlcnZpY2UuaGlkZUN1c3RvbVZpZXcoKTtcblxuXHRcdHRoaXMuX29wZW5TZXNzaW9uQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9vcGVuU2Vzc2lvbkN0cy52YWx1ZSA9IGN0cztcblx0XHRyZXR1cm4gY3RzLnRva2VuO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbCBhbiBpbi1mbGlnaHQge0BsaW5rIHJlc3RvcmVWaXNpYmxlU2Vzc2lvbnN9LiBDYWxsZWQgd2hlbiB0aGUgdXNlclxuXHQgKiBleHBsaWNpdGx5IG5hdmlnYXRlcyB0byBhIHNwZWNpZmljIHNlc3Npb24sIHNvIHJlc3RvcmUgc3RvcHMgZmlnaHRpbmdcblx0ICogdGhlIHVzZXIncyBjaG9pY2UuIEFkZGl0aXZlIG5ldy1zZXNzaW9uIG9wZXJhdGlvbnMgZG8gTk9UIGNhbGwgdGhpcy5cblx0ICovXG5cdHByaXZhdGUgX2NhbmNlbFJlc3RvcmUoKTogdm9pZCB7XG5cdFx0Ly8gYGNhbmNlbCgpYCAobm90IGp1c3QgYGNsZWFyKClgL2Rpc3Bvc2UpIHNvIHRoZSBpbi1mbGlnaHQgcmVzdG9yZSdzXG5cdFx0Ly8gdG9rZW4gYWN0dWFsbHkgZmlyZXMgY2FuY2VsbGF0aW9uIGFuZCBiYWlscyBvdXQ7IGBNdXRhYmxlRGlzcG9zYWJsZWBcblx0XHQvLyBkaXNwb3NlcyB0aGUgc291cmNlIHdpdGhvdXQgY2FuY2VsbGluZyBpdC5cblx0XHR0aGlzLl9yZXN0b3JlQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZXN0b3JlQ3RzLmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogTWFrZSB0aGUgZ2l2ZW4gc2Vzc2lvbiBhY3RpdmUgaW4gdGhlIHZpc2liaWxpdHkgbW9kZWwsIG9wdGlvbmFsbHkgd2l0aG91dFxuXHQgKiBtb3ZpbmcgZm9jdXMgaW50byBpdC4gVGhlIHByZXNlcnZlLWZvY3VzIGludGVudCBpcyBwdWJsaXNoZWQgYXRvbWljYWxseVxuXHQgKiB3aXRoIHRoZSBhY3RpdmUgc2Vzc2lvbiBieSB0aGUgdmlzaWJpbGl0eSBtb2RlbCwgYW5kIHRoZSBtb2RlbCdzXG5cdCAqIGNhbm9uaWNhbCBhY3RpdmUgc2Vzc2lvbiBpcyB1cGRhdGVkIHJlYWN0aXZlbHkgYnkgdGhlIG1pcnJvciBhdXRvcnVuLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWN0aXZhdGUoc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZShzZXNzaW9uLCBwcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5DaGF0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0MCA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fY2FuY2VsUmVzdG9yZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fc3RhcnRPcGVuU2Vzc2lvbigpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlbkNoYXQgc3RhcnQgdXJpPSR7Y2hhdFVyaS50b1N0cmluZygpfSBwcm92aWRlcj0ke3Nlc3Npb24ucHJvdmlkZXJJZH1gKTtcblx0XHR0aGlzLl9hY3RpdmF0ZShzZXNzaW9uKTtcblx0XHRpZiAoIWF3YWl0IHRoaXMuX3dhaXRGb3JTZXNzaW9uVG9Mb2FkKHNlc3Npb24sIHRva2VuKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNWaWV3XSBvcGVuQ2hhdCBjYW5jZWxsZWQgd2hpbGUgd2FpdGluZyBmb3Igc2Vzc2lvbiB0byBsb2FkIHVyaT0ke2NoYXRVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBjaGF0IGFuZCB1cGRhdGUgYWN0aXZlIGNoYXRcblx0XHRsZXQgY2hhdDogSUNoYXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0Y2hhdCA9IGFjdGl2ZVNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGMucmVzb3VyY2UsIGNoYXRVcmkpKTtcblx0XHRcdGlmIChjaGF0KSB7XG5cdFx0XHRcdC8vIE9wZW5pbmcgYSBjaGF0IGFsc28gdW4taGlkZXMgaXQgaWYgaXQgd2FzIHByZXZpb3VzbHkgY2xvc2VkLlxuXHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5Lm9wZW5DaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5LnNldEFjdGl2ZUNoYXQoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0XHRcdHRoaXMuX3NldENoYXRDbG9zZWRTdGF0ZShzZXNzaW9uLCBjaGF0LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXQgJiYgY2hhdC5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlbkNoYXQgZG9uZSB0b3RhbD0ke0RhdGUubm93KCkgLSB0MH1tcyB1cmk9JHtjaGF0VXJpLnRvU3RyaW5nKCl9IHBhdGg9dW50aXRsZWRgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1ZpZXddIG9wZW5DaGF0IGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7Y2hhdFVyaS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0YXN5bmMgY2xvc2VDaGF0KHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCBjaGF0OiBJQ2hhdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENsb3NpbmcgaGlkZXMgdGhlIGNoYXQgZnJvbSB0aGUgdGFiIHN0cmlwOyBpdCBzdGF5cyByZW9wZW5hYmxlIGZyb20gdGhlXG5cdFx0Ly8gc2Vzc2lvbiBoZWFkZXIncyBjaGF0cyBkcm9wZG93bi5cblx0XHR0aGlzLl92aXNpYmlsaXR5LmNsb3NlQ2hhdChzZXNzaW9uLCBjaGF0KTtcblx0XHR0aGlzLl9zZXRDaGF0Q2xvc2VkU3RhdGUoc2Vzc2lvbiwgY2hhdCwgdHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdCBhIGNoYXQncyBjbG9zZWQvb3BlbiBzdGF0ZSBpbnRvIHRoZSBzZXNzaW9uJ3Mgc3RvcmVkIHZpZXcgc3RhdGUgc29cblx0ICogaXQgc3Vydml2ZXMgc3dpdGNoaW5nIHRoZSBzZXNzaW9uIG91dCBvZiB0aGUgZ3JpZCAod2hpY2ggZGlzcG9zZXMgaXRzXG5cdCAqIHdyYXBwZXIpIGFuZCByZWxvYWRzLiBEb25lIHN5bmNocm9ub3VzbHkgb24gdGhlIGNsb3NlL29wZW4gYWN0aW9uIHJhdGhlclxuXHQgKiB0aGFuIHJlYWN0aXZlbHkgZnJvbSBgY2xvc2VkQ2hhdHNgLCB3aGljaCB3b3VsZCBkZXBlbmQgb24gdGhlIHNlc3Npb24nc1xuXHQgKiBjaGF0cyBiZWluZyBsb2FkZWQuIFRoZSBtYWluIGNoYXQgY2FuIG5ldmVyIGJlIGNsb3NlZCBhbmQgaXMgaWdub3JlZC5cblx0ICovXG5cdHByaXZhdGUgX3NldENoYXRDbG9zZWRTdGF0ZShzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdDogSUNoYXQsIGNsb3NlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjaGF0LnJlc291cmNlLCBzZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTdWJhZ2VudCAodG9vbC1vcmlnaW4pIGNoYXRzIGFyZSBoaWRkZW4gYnkgZGVmYXVsdCBhbmQgdG9nZ2xlZCB2aWEgYW5cblx0XHQvLyBpbi1tZW1vcnkgc2hvd24gc2V0LCBub3QgdGhlIHBlcnNpc3RlZCBjbG9zZWQgc2V0LCBzbyB0aGV5IG5ldmVyXG5cdFx0Ly8gcGFydGljaXBhdGUgaW4gY2xvc2VkLWNoYXQgcGVyc2lzdGVuY2UuXG5cdFx0aWYgKGNoYXQub3JpZ2luPy5raW5kID09PSBDaGF0T3JpZ2luS2luZC5Ub29sKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2xvc2VkU2V0ID0gbmV3IFNldChleGlzdGluZz8uY2xvc2VkQ2hhdFJlc291cmNlcyA/PyBbXSk7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmIChjbG9zZWQpIHtcblx0XHRcdGNsb3NlZFNldC5hZGQoY2hhdFJlc291cmNlKTtcblx0XHR9IGVsc2UgaWYgKCFjbG9zZWRTZXQuZGVsZXRlKGNoYXRSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjsgLy8gbm90aGluZyBjaGFuZ2VkIChjaGF0IHdhcyBub3QgY2xvc2VkKVxuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChzZXNzaW9uLnJlc291cmNlLCB7XG5cdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0Y2xvc2VkQ2hhdFJlc291cmNlczogWy4uLmNsb3NlZFNldF0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBvcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IHsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2NhbmNlbFJlc3RvcmUoKTtcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3N0YXJ0T3BlblNlc3Npb24oKTtcblx0XHRhd2FpdCB0aGlzLl9kb09wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4sIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9PcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvcHRpb25zPzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdDAgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXNlc3Npb25EYXRhKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW1Nlc3Npb25zVmlld10gb3BlblNlc3Npb246IHNlc3Npb24gbm90IGZvdW5kIHVyaT0ke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uIHdpdGggcmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gbm90IGZvdW5kYCk7XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25zVmlld10gb3BlblNlc3Npb24gc3RhcnQgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IHByb3ZpZGVyPSR7c2Vzc2lvbkRhdGEucHJvdmlkZXJJZH1gKTtcblx0XHR0aGlzLl9hY3RpdmF0ZShzZXNzaW9uRGF0YSwgb3B0aW9ucz8ucHJlc2VydmVGb2N1cyk7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLl93YWl0Rm9yU2Vzc2lvblRvTG9hZChzZXNzaW9uRGF0YSwgdG9rZW4pKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1ZpZXddIG9wZW5TZXNzaW9uIGNhbmNlbGxlZCB3aGlsZSB3YWl0aW5nIGZvciBzZXNzaW9uIHRvIGxvYWQgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNWaWV3XSBvcGVuU2Vzc2lvbiBkb25lIHRvdGFsPSR7RGF0ZS5ub3coKSAtIHQwfW1zIHVyaT0ke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0dW5zZXROZXdTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kaXNjYXJkTmV3U2Vzc2lvbigpO1xuXHRcdHRoaXMuX2FjdGl2YXRlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhc3luYyBvcGVuTmV3U2Vzc2lvbihvcHRpb25zPzogSU9wZW5OZXdTZXNzaW9uT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SU9wZW5OZXdTZXNzaW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gb3B0aW9ucz8uZm9sZGVyVXJpO1xuXHRcdGlmIChmb2xkZXJVcmkpIHtcblx0XHRcdC8vIFNpbmdsZSB0cnVzdCBnYXRlIGZvciBldmVyeSBwYXRoIHRoYXQgY3JlYXRlcyBhIGNvbmNyZXRlIHNlc3Npb24gZm9yXG5cdFx0XHQvLyBhIGZvbGRlciAodGhlIHdvcmtzcGFjZSBwaWNrZXIgZHJvcGRvd24sIHRoZSBmb2xkZXIgUXVpY2sgUGljaywgZXRjLik6XG5cdFx0XHQvLyByZXNvbHZlIHRoZSB3b3Jrc3BhY2UgYW5kLCBpZiBpdCByZXF1aXJlcyB0cnVzdCwgcHJvbXB0IGJlZm9yZVxuXHRcdFx0Ly8gY3JlYXRpbmcgdGhlIHNlc3Npb24uIEEgbm8tb3AgaWYgdGhlIGZvbGRlciBpcyBhbHJlYWR5IHRydXN0ZWQuXG5cdFx0XHQvLyBSZXNvbHZlZCB3aXRoIHRoZSBzYW1lIHByb3ZpZGVyIGBjcmVhdGVOZXdTZXNzaW9uYCBiZWxvdyB3aWxsIHVzZVxuXHRcdFx0Ly8gKGhvbm9yaW5nIGBvcHRpb25zLnByb3ZpZGVySWRgKSwgc28gdGhlIHRydXN0IGRlY2lzaW9uIGFsd2F5c1xuXHRcdFx0Ly8gcmVmbGVjdHMgdGhlIHdvcmtzcGFjZSB0aGF0IGlzIGFjdHVhbGx5IGFib3V0IHRvIGJlIGNyZWF0ZWQuXG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSwgb3B0aW9ucz8ucHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAocmVzb2x2ZWQ/LndvcmtzcGFjZS5yZXF1aXJlc1dvcmtzcGFjZVRydXN0KSB7XG5cdFx0XHRcdGNvbnN0IHRydXN0ZWQgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFJlc291cmNlc1RydXN0KHtcblx0XHRcdFx0XHR1cmk6IGZvbGRlclVyaSxcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc2Vzc2lvbnNTZXJ2aWNlLnRydXN0Rm9sZGVyTWVzc2FnZScsIFwiQW4gYWdlbnQgc2Vzc2lvbiB3aWxsIGJlIGFibGUgdG8gcmVhZCBmaWxlcywgcnVuIGNvbW1hbmRzLCBhbmQgbWFrZSBjaGFuZ2VzIGluIHRoaXMgZm9sZGVyLlwiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB7IHNlc3Npb246IHVuZGVmaW5lZCwgdHJ1c3REZWNsaW5lZDogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uOiB1bmRlZmluZWQsIHRydXN0RGVjbGluZWQ6IHRydWUgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhcnRPcGVuU2Vzc2lvbigpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaSwgb3B0aW9ucyk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2YXRlKHNlc3Npb24pO1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBXaGVuIHRoZSBmb2xkZXIgY2Fubm90IGJlIHJlc29sdmVkIChlLmcuIHRoZSBhY3RpdmUgc2Vzc2lvbidzXG5cdFx0XHRcdC8vIHdvcmtzcGFjZSB1c2VzIGFuIHVuc3VwcG9ydGVkIHNjaGVtZSBsaWtlICd1bmtub3duOi8nKSwgZmFsbFxuXHRcdFx0XHQvLyB0aHJvdWdoIHRvIHRoZSBmb2xkZXItbGVzcyBjb21wb3NlciB2aWV3LlxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1ZpZXddIG9wZW5OZXdTZXNzaW9uOiBjcmVhdGVOZXdTZXNzaW9uIGZhaWxlZCBmb3IgZm9sZGVyICR7Zm9sZGVyVXJpLnRvU3RyaW5nKCl9LCBmYWxsaW5nIGJhY2sgdG8gY29tcG9zZXIgdmlld2ApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdpdGhvdXQgYSBmb2xkZXIgKG9yIHdoZW4gZm9sZGVyIHJlc29sdXRpb24gZmFpbGVkIGFib3ZlKTogc3dpdGNoIHRvXG5cdFx0Ly8gdGhlIG5ldy1zZXNzaW9uIGNvbXBvc2VyIHZpZXcuXG5cdFx0Ly8gTm8tb3Agd2hlbiBubyBzZXNzaW9uIGlzIGFjdGl2ZSAoZW1wdHkgbmV3LXNlc3Npb24gcGxhY2Vob2xkZXIgc2hvd2luZykuXG5cdFx0aWYgKHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbi5nZXQoKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiB1bmRlZmluZWQsIHRydXN0RGVjbGluZWQ6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGlmICghZm9sZGVyVXJpKSB7XG5cdFx0XHR0aGlzLl9zdGFydE9wZW5TZXNzaW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSB0aGUgaW4tcHJvZ3Jlc3MgbmV3IHNlc3Npb24gaWYgb25lIGV4aXN0cywgc28gcGlja2VycyByZS1kZXJpdmVcblx0XHQvLyB0aGVpciBzdGF0ZSBmcm9tIHRoZSBzdGlsbC1hbGl2ZSBzZXNzaW9uIG9iamVjdC4gT3RoZXJ3aXNlIGNsZWFyIHRoZVxuXHRcdC8vIGFjdGl2ZSBzZXNzaW9uIChmaXJzdCB0aW1lIC8gYWZ0ZXIgc2VuZCkuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5uZXdTZXNzaW9uLmdldCgpO1xuXG5cdFx0Ly8gQSBxdWljay1jaGF0IGRyYWZ0IG11c3Qgbm90IGJlIHJlc3RvcmVkIGludG8gdGhlIHdvcmtzcGFjZSBuZXctc2Vzc2lvblxuXHRcdC8vIGNvbXBvc2VyIChzeW1tZXRyaWMgdG8gdGhlIE5ldyBRdWljayBDaGF0IGdlc3R1cmUpOiBkaXNjYXJkIGl0IGFuZCBzaG93XG5cdFx0Ly8gYSBmcmVzaCB3b3Jrc3BhY2UgY29tcG9zZXIgaW5zdGVhZC5cblx0XHRpZiAobmV3U2Vzc2lvbj8uaXNRdWlja0NoYXQ/LmdldCgpKSB7XG5cdFx0XHR0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZGlzY2FyZE5ld1Nlc3Npb24obmV3U2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9hY3RpdmF0ZSh1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2FjdGl2YXRlKG5ld1Nlc3Npb24gPz8gdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uOiBuZXdTZXNzaW9uID8/IHVuZGVmaW5lZCwgdHJ1c3REZWNsaW5lZDogZmFsc2UgfTtcblx0fVxuXG5cdG9wZW5RdWlja0NoYXQob3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl9zdGFydE9wZW5TZXNzaW9uKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlUXVpY2tDaGF0KG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRlKHNlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIE5vIHByb3ZpZGVyIHN1cHBvcnRzIHF1aWNrIGNoYXRzOiBsZWF2ZSB3aGF0ZXZlciB3YXMgdmlzaWJsZSBhcy1pc1xuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gYWN0aXZhdGluZyBhbiB1bnJlbGF0ZWQgd29ya3NwYWNlLWJvdW5kIGRyYWZ0LlxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNWaWV3XSBvcGVuUXVpY2tDaGF0OiBjcmVhdGVRdWlja0NoYXQgZmFpbGVkOiAke2V9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIG9wZW5OZXdDaGF0SW5TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCBvcHRpb25zPzogSUNyZWF0ZU5ld0NoYXRJblNlc3Npb25PcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fY2FuY2VsUmVzdG9yZSgpO1xuXHRcdHRoaXMuX3N0YXJ0T3BlblNlc3Npb24oKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZU5ld0NoYXRJblNlc3Npb24oc2Vzc2lvbiwgb3B0aW9ucyk7XG5cdFx0aWYgKCFjaGF0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aXZhdGUoc2Vzc2lvbik7XG5cblx0XHQvLyBTZXQgdGhlIGNoYXQgYXMgdGhlIGFjdGl2ZSBjaGF0XG5cdFx0dGhpcy5fdmlzaWJpbGl0eS5zZXRBY3RpdmVDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHR9XG5cblx0c2V0QWN0aXZlKHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZhdGUoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBzdWJtaXROZXdTZXNzaW9uSW5wdXQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKGFjdGl2ZVNlc3Npb24/LmlzQ3JlYXRlZC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBjb21wb3NlciBpcyBub3QgbmVjZXNzYXJpbHkgbW91bnRlZCBpbiB0aGUgZ3JpZCAoZS5nLiBldmVyeSBzbG90XG5cdFx0Ly8gaG9sZHMgYSBjcmVhdGVkIHNlc3Npb24pLCBzbyBvcGVuIGl0IGJlZm9yZSBzdWJtaXR0aW5nIGludG8gaXQuXG5cdFx0aWYgKCF0aGlzLnNlc3Npb25zUGFydFNlcnZpY2UuZ2V0U2Vzc2lvblZpZXcoYWN0aXZlU2Vzc2lvbj8uc2Vzc2lvbklkKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5vcGVuTmV3U2Vzc2lvbigpO1xuXHRcdFx0YWN0aXZlU2Vzc2lvbiA9IHRoaXMuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uPy5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNlc3Npb25zUGFydFNlcnZpY2UuZ2V0U2Vzc2lvblZpZXcoYWN0aXZlU2Vzc2lvbj8uc2Vzc2lvbklkKT8uc3VibWl0SW5wdXQoKSA/PyBmYWxzZTtcblx0fVxuXG5cdHRvZ2dsZVNlc3Npb25TdGlja2luZXNzKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RpY2t5ID0gdGhpcy5fdmlzaWJpbGl0eS50b2dnbGVTdGlja2luZXNzKHNlc3Npb24pO1xuXHRcdHRoaXMuX29uRGlkVG9nZ2xlU2Vzc2lvblN0aWNraW5lc3MuZmlyZSh7IHNlc3Npb24sIHN0aWNreSB9KTtcblx0fVxuXG5cdGluc2VydEF0KHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXRTZXNzaW9uSWQ6IHN0cmluZywgc2lkZTogJ2xlZnQnIHwgJ3JpZ2h0JywgYWN0aXZhdGU6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJpbGl0eS5pbnNlcnRBdChzZXNzaW9uLCB0YXJnZXRTZXNzaW9uSWQsIHNpZGUsIGFjdGl2YXRlKTtcblx0fVxuXG5cdGNsb3NlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHNlc3Npb24/LnNlc3Npb25JZDtcblx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy5fdmlzaWJpbGl0eS52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cdFx0aWYgKCF2aXNpYmxlLnNvbWUocyA9PiBzPy5zZXNzaW9uSWQgPT09IHNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgZW1wdHkvbmV3LXNlc3Npb24gc2xvdCBoYXMgbm8gc2Vzc2lvbklkOyBib3RoIGl0IGFuZCBcIm5vIGFjdGl2ZVxuXHRcdC8vIHNlc3Npb25cIiBhcmUgcmVwb3J0ZWQgYnkgYWN0aXZlU2Vzc2lvbiBhcyB1bmRlZmluZWQuIFNpbmNlIHdlIGFscmVhZHlcblx0XHQvLyBjb25maXJtZWQgdGhlIHNsb3QgaXMgcHJlc2VudCBpbiBgdmlzaWJsZWAsIHVuZGVmaW5lZCA9PT0gdW5kZWZpbmVkXG5cdFx0Ly8gaGVyZSBtZWFucyB0aGUgZW1wdHkgc2xvdCBpcyBhY3RpdmUuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbklkID0gdGhpcy5fdmlzaWJpbGl0eS5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQ7XG5cdFx0Y29uc3Qgd2FzQWN0aXZlID0gYWN0aXZlU2Vzc2lvbklkID09PSBzZXNzaW9uSWQ7XG5cblx0XHQvLyBEaXNjYXJkIHRoZSBpbi1wcm9ncmVzcyBuZXcgc2Vzc2lvbiB3aGVuIGl0cyBzbG90IChvciB0aGUgZW1wdHkgc2xvdClcblx0XHQvLyBpcyB0aGUgb25lIGJlaW5nIGNsb3NlZDsgY2xvc2luZyBhbiB1bnJlbGF0ZWQgc2Vzc2lvbiBsZWF2ZXMgaXQgaW50YWN0LlxuXHRcdHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kaXNjYXJkTmV3U2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdHRoaXMuX3Zpc2liaWxpdHkucmVtb3ZlTWFueShbc2Vzc2lvbklkXSk7XG5cblx0XHRpZiAoIXdhc0FjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHJlbW92ZU1hbnkgYWxyZWFkeSBwaWNrZWQgYSBmYWxsYmFjayBhY3RpdmUgc2Vzc2lvbiAob3IgY2xlYXJlZCB0aGVcblx0XHQvLyBhY3RpdmUgb2JzZXJ2YWJsZSB3aGVuIG5vIHNsb3QgcmVtYWlucyk7IGRyaXZlIHRoZSBmdWxsIG9wZW4gZmxvdy5cblx0XHRjb25zdCBmYWxsYmFjayA9IHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoZmFsbGJhY2sgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5vcGVuTmV3U2Vzc2lvbigpO1xuXHRcdH1cblx0fVxuXG5cdGNsb3NlQWxsU2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgaWRzID0gdGhpcy5fdmlzaWJpbGl0eS52aXNpYmxlU2Vzc2lvbnMuZ2V0KClcblx0XHRcdC5maWx0ZXIoKHMpOiBzIGlzIElBY3RpdmVTZXNzaW9uID0+ICEhcylcblx0XHRcdC5tYXAocyA9PiBzLnNlc3Npb25JZCk7XG5cdFx0aWYgKGlkcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZGlzY2FyZE5ld1Nlc3Npb24oKTtcblxuXHRcdC8vIFJlbW92ZSBldmVyeSB2aXNpYmxlIHNlc3Npb24gaW4gYSBzaW5nbGUgcGFzczsgdGhlIHZpc2liaWxpdHkgbW9kZWxcblx0XHQvLyBjbGVhcnMgdGhlIGFjdGl2ZSBzZXNzaW9uLCB3aGljaCBkcml2ZXMgdGhlIGdyaWQgYmFjayB0byB0aGVcblx0XHQvLyBuZXctc2Vzc2lvbiB2aWV3IHZpYSB0aGUgcmVjb25jaWxlIGF1dG9ydW4uXG5cdFx0dGhpcy5fdmlzaWJpbGl0eS5yZW1vdmVNYW55KGlkcyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlSW5pdGlhbENoYXQoc2Vzc2lvbjogSVNlc3Npb24pOiBJQ2hhdCB7XG5cdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uLmNoYXRzLmdldCgpO1xuXHRcdGxldCBpbml0aWFsQ2hhdCA9IGNoYXRzWzBdO1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGlmIChzZXNzaW9uU3RhdGU/LmFjdGl2ZUNoYXRSZXNvdXJjZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbGFzdENoYXRSZXNvdXJjZSA9IFVSSS5wYXJzZShzZXNzaW9uU3RhdGUuYWN0aXZlQ2hhdFJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBjaGF0cy5maW5kKGMgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoYy5yZXNvdXJjZSwgbGFzdENoYXRSZXNvdXJjZSkpO1xuXHRcdFx0XHRpZiAoZm91bmQpIHtcblx0XHRcdFx0XHRpbml0aWFsQ2hhdCA9IGZvdW5kO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW1Nlc3Npb25zVmlld10gRmFpbGVkIHRvIHJlc3RvcmUgYWN0aXZlIGNoYXQgZnJvbSBzdG9yZWQgc2Vzc2lvbiBzdGF0ZScsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGluaXRpYWxDaGF0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSByZXNvdXJjZSBzdHJpbmdzIG9mIGNoYXRzIHRoYXQgd2VyZSBjbG9zZWQgKGhpZGRlbiBmcm9tIHRoZSB0YWIgc3RyaXApXG5cdCAqIHdoZW4gdGhlIHNlc3Npb24gd2FzIGxhc3Qgc2F2ZWQsIHNvIHRoZXkgc3RheSBoaWRkZW4gYWNyb3NzIHJlbG9hZHMuIFN0YWxlXG5cdCAqIFVSSXMgdGhhdCBubyBsb25nZXIgbWF0Y2ggYSBjaGF0IGFyZSBoYXJtbGVzczogdGhlIHZpc2libGUgc2Vzc2lvblxuXHQgKiBpbnRlcnNlY3RzIHRoZW0gd2l0aCB0aGUgbGl2ZSBjaGF0IGxpc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXN0b3JlQ2xvc2VkQ2hhdHMoc2Vzc2lvbjogSVNlc3Npb24pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24ucmVzb3VyY2UpPy5jbG9zZWRDaGF0UmVzb3VyY2VzID8/IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvclNlc3Npb25Ub0xvYWQoc2Vzc2lvbjogSVNlc3Npb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghc2Vzc2lvbi5sb2FkaW5nLmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZmluaXNoID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChmaW5pc2gpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGlmICghc2Vzc2lvbi5sb2FkaW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdGZpbmlzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZFNlc3Npb25TdGF0ZXMoKTogUmVzb3VyY2VNYXA8SVNlc3Npb25TdGF0ZT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBSZXNvdXJjZU1hcDxJU2Vzc2lvblN0YXRlPigpO1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEFDVElWRV9TRVNTSU9OX1NUQVRFU19LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gbWFwO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZW50cmllczogSVNlc3Npb25TdGF0ZVtdID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShlbnRyeS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRtYXAuc2V0KHVyaSwgZW50cnkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlIGNvcnJ1cHQgZGF0YVxuXHRcdH1cblx0XHRyZXR1cm4gbWFwO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVNlc3Npb25TdGF0ZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX3NuYXBzaG90VmlzaWJsZVNlc3Npb25TdGF0ZXMoKTtcblxuXHRcdC8vIEFsc28gcGVyc2lzdCB0aGUgcGVyLXNlc3Npb24gc3RhdGUgKGNsb3NlZCBjaGF0cywgbGFzdCBhY3RpdmUgY2hhdCkgb2Zcblx0XHQvLyBzZXNzaW9ucyB0aGF0IGFyZSBub3QgY3VycmVudGx5IHZpc2libGUsIHNvIGEgc2Vzc2lvbiBzd2l0Y2hlZCBvdXQgb2Zcblx0XHQvLyB0aGUgZ3JpZCBrZWVwcyBpdHMgY2xvc2VkLWNoYXQgc2V0IGFjcm9zcyBhIHJlbG9hZC4gR3JpZC1wbGFjZW1lbnRcblx0XHQvLyBmaWVsZHMgYXJlIHN0cmlwcGVkIHNvIHRoZXkgYXJlIG5vdCByZXN0b3JlZCBpbnRvIHRoZSBncmlkLlxuXHRcdGNvbnN0IHZpc2libGUgPSBuZXcgUmVzb3VyY2VNYXA8dHJ1ZT4oKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdHZpc2libGUuc2V0KFVSSS5wYXJzZShlbnRyeS5zZXNzaW9uUmVzb3VyY2UpLCB0cnVlKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIHN0YXRlXSBvZiB0aGlzLl9zZXNzaW9uU3RhdGVzKSB7XG5cdFx0XHRpZiAodmlzaWJsZS5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzdGF0ZS5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGFjdGl2ZUNoYXRSZXNvdXJjZTogc3RhdGUuYWN0aXZlQ2hhdFJlc291cmNlLFxuXHRcdFx0XHRjbG9zZWRDaGF0UmVzb3VyY2VzOiBzdGF0ZS5jbG9zZWRDaGF0UmVzb3VyY2VzLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBQ1RJVkVfU0VTU0lPTl9TVEFURVNfS0VZLCBKU09OLnN0cmluZ2lmeShlbnRyaWVzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgX3NuYXBzaG90VmlzaWJsZVNlc3Npb25TdGF0ZXMoKTogSVNlc3Npb25TdGF0ZVtdIHtcblx0XHRjb25zdCBhY3RpdmVJZCA9IHRoaXMuX3Zpc2liaWxpdHkuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXHRcdGNvbnN0IHZpc2libGUgPSB0aGlzLl92aXNpYmlsaXR5LnZpc2libGVTZXNzaW9ucy5nZXQoKTtcblx0XHRjb25zdCBlbnRyaWVzOiBJU2Vzc2lvblN0YXRlW10gPSBbXTtcblx0XHR2aXNpYmxlLmZvckVhY2goKHNlc3Npb24sIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlcy5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gS2VlcCB0aGUgaW4tbWVtb3J5IHJlY29yZCB1cCB0byBkYXRlIHNvIHRoZSBzZXNzaW9uJ3MgbGFzdCBhY3RpdmVcblx0XHRcdC8vIGNoYXQgaXMgcmVtZW1iZXJlZCB3aGlsZSByZW9wZW5pbmcgaXQgd2l0aGluIHRoaXMgd2luZG93LiBUaGVcblx0XHRcdC8vIGNsb3NlZC1jaGF0IHNldCBpcyBtYWludGFpbmVkIGRldGVybWluaXN0aWNhbGx5IGJ5XG5cdFx0XHQvLyBgX3NldENoYXRDbG9zZWRTdGF0ZWA7IHByZWZlciBpdCBvdmVyIHRoZSBsaXZlIChsb2FkZWQtY2hhdHMgb25seSlcblx0XHRcdC8vIGBjbG9zZWRDaGF0c2Agc28gYSBub3QteWV0LWxvYWRlZCBzZXNzaW9uIGRvZXMgbm90IGRyb3AgaXRzIHNldC5cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzdGF0ZTogSVNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGFjdGl2ZUNoYXRSZXNvdXJjZTogc2Vzc2lvbi5hY3RpdmVDaGF0LmdldCgpPy5yZXNvdXJjZS50b1N0cmluZygpID8/IGV4aXN0aW5nPy5hY3RpdmVDaGF0UmVzb3VyY2UsXG5cdFx0XHRcdGNsb3NlZENoYXRSZXNvdXJjZXM6IGV4aXN0aW5nPy5jbG9zZWRDaGF0UmVzb3VyY2VzID8/IHNlc3Npb24uY2xvc2VkQ2hhdHMuZ2V0KCkubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0dmlzaWJsZU9yZGVyOiBpbmRleCxcblx0XHRcdFx0aXNTdGlja3k6IHNlc3Npb24uc3RpY2t5LmdldCgpLFxuXHRcdFx0XHRpc0FjdGl2ZTogc2Vzc2lvbi5zZXNzaW9uSWQgPT09IGFjdGl2ZUlkLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHN0YXRlKTtcblx0XHRcdGVudHJpZXMucHVzaChzdGF0ZSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGVudHJpZXM7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHBlcnNpc3RlZCB2aXNpYmxlIHNlc3Npb25zLCBvcmRlcmVkIGxlZnQtdG8tcmlnaHQgYnkgdGhlaXIgc3RvcmVkXG5cdCAqIGdyaWQgcG9zaXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRWaXNpYmxlU2Vzc2lvblN0YXRlcygpOiBJU2Vzc2lvblN0YXRlW10ge1xuXHRcdGNvbnN0IHN0YXRlczogSVNlc3Npb25TdGF0ZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCBzdGF0ZV0gb2YgdGhpcy5fc2Vzc2lvblN0YXRlcykge1xuXHRcdFx0aWYgKHN0YXRlLnZpc2libGVPcmRlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHN0YXRlcy5wdXNoKHN0YXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlcy5zb3J0KChhLCBiKSA9PiAoYS52aXNpYmxlT3JkZXIhIC0gYi52aXNpYmxlT3JkZXIhKSk7XG5cdH1cblxuXHQvKipcblx0ICogV2FpdCBmb3IgdGhlIHNlc3Npb24gd2l0aCB0aGUgZ2l2ZW4gcmVzb3VyY2UgdG8gYmVjb21lIGF2YWlsYWJsZSB2aWEgaXRzXG5cdCAqIHByb3ZpZGVyLCByZXNvbHZpbmcgd2l0aCB0aGUgc2Vzc2lvbiBvciBgdW5kZWZpbmVkYCBpZiB0aGUgdG9rZW4gaXNcblx0ICogY2FuY2VsbGVkIGJlZm9yZSBpdCBhcHBlYXJzLiBXaGVuIGB0aW1lb3V0YCBpcyBnaXZlbiwgcmVzb2x2ZXMgd2l0aFxuXHQgKiBgdW5kZWZpbmVkYCBhZnRlciB0aGF0IG1hbnkgbWlsbGlzZWNvbmRzIHNvIGEgcGVyc2lzdGVkIHNlc3Npb24gdGhhdCBuZXZlclxuXHQgKiByZXN1cmZhY2VzIChlLmcuIGRlbGV0ZWQgd2hpbGUgdGhlIHdpbmRvdyB3YXMgY2xvc2VkKSBjYW5ub3Qga2VlcCByZXN0b3JlXG5cdCAqIHBlbmRpbmcgXHUyMDE0IGFuZCBpdHMgcHJvdmlkZXIgbGlzdGVuZXJzIGFsaXZlIFx1MjAxNCBpbmRlZmluaXRlbHkuXG5cdCAqL1xuXHRwcml2YXRlIF93YWl0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB0aW1lb3V0PzogbnVtYmVyKTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZXhpc3RpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZpbmlzaCA9IChzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoc2Vzc2lvbik7XG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZmluaXNoKHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0Y29uc3QgdHJ5RmluZCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0ZmluaXNoKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdGZpbmlzaChzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gUHJvdmlkZXJzIChlLmcuIHRoZSBhZ2VudCBob3N0KSBsb2FkIHRoZWlyIHNlc3Npb24gY2FjaGVcblx0XHRcdC8vIGFzeW5jaHJvbm91c2x5LCBzbyB0aGUgc2Vzc2lvbiBtYXkgYXBwZWFyIHZpYSBlaXRoZXIgYSBwcm92aWRlclxuXHRcdFx0Ly8gY2hhbmdlIG9yIGEgc2Vzc2lvbiBsaXN0IGNoYW5nZS5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB0cnlGaW5kKCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB0cnlGaW5kKCkpKTtcblxuXHRcdFx0Ly8gR2l2ZSB1cCBhZnRlciB0aGUgdGltZW91dCBzbyB0aGUgbGlzdGVuZXJzIGFib3ZlIGFyZSBub3QgcmV0YWluZWRcblx0XHRcdC8vIGZvcmV2ZXIgd2hlbiB0aGUgc2Vzc2lvbiBpcyBnb25lIGZvciBnb29kLlxuXHRcdFx0aWYgKHRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gZmluaXNoKHVuZGVmaW5lZCksIHRpbWVvdXQpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW4gY2FzZSB0aGUgc2Vzc2lvbiBiZWNhbWUgYXZhaWxhYmxlIGJldHdlZW4gdGhlIGluaXRpYWwgY2hlY2sgYW5kXG5cdFx0XHQvLyB0aGUgbGlzdGVuZXIgcmVnaXN0cmF0aW9uLlxuXHRcdFx0dHJ5RmluZCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcmVzdG9yZVZpc2libGVTZXNzaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBPcmRlcmVkIGxpc3Qgb2Ygc2xvdHMgdG8gcmVzdG9yZTogcmVhbCBzZXNzaW9ucyBwbHVzLCBvcHRpb25hbGx5LCB0aGVcblx0XHQvLyBlbXB0eSAobmV3LXNlc3Npb24pIHNsb3Qgd2hlbiBpdCB3YXMgYWN0aXZlLlxuXHRcdGludGVyZmFjZSBJUmVzdG9yZVRhcmdldCB7XG5cdFx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgaXNTdGlja3k6IGJvb2xlYW47XG5cdFx0XHRyZWFkb25seSBpc0FjdGl2ZTogYm9vbGVhbjtcblx0XHRcdHJlYWRvbmx5IG9yZGVyOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0czogSVJlc3RvcmVUYXJnZXRbXSA9IHRoaXMuX2dldFZpc2libGVTZXNzaW9uU3RhdGVzKCkubWFwKHN0YXRlID0+ICh7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKHN0YXRlLnNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRpc1N0aWNreTogISFzdGF0ZS5pc1N0aWNreSxcblx0XHRcdGlzQWN0aXZlOiAhIXN0YXRlLmlzQWN0aXZlLFxuXHRcdFx0b3JkZXI6IHN0YXRlLnZpc2libGVPcmRlciEsXG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0YXJnZXRzLnB1c2goeyByZXNvdXJjZTogdW5kZWZpbmVkLCBpc1N0aWNreTogZmFsc2UsIGlzQWN0aXZlOiB0cnVlLCBvcmRlcjogMSB9KTtcblx0XHR9XG5cblx0XHR0YXJnZXRzLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKTtcblxuXHRcdGxldCBhY3RpdmVJZHggPSB0YXJnZXRzLmZpbmRJbmRleCh0ID0+IHQuaXNBY3RpdmUpO1xuXHRcdGlmIChhY3RpdmVJZHggPCAwKSB7XG5cdFx0XHRhY3RpdmVJZHggPSAwO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBhIGRlZGljYXRlZCBjYW5jZWxsYXRpb24gdG9rZW4gKG5vdCB0aGUgc2hhcmVkIG9wZW4tc2Vzc2lvbiBvbmUpXG5cdFx0Ly8gc28gdGhhdCBhIG5ldy1zZXNzaW9uIGRyYWZ0IGNyZWF0ZWQgZHVyaW5nIHJlc3RvcmUgKGUuZy4gYnkgdGhlXG5cdFx0Ly8gbmV3LWNoYXQgY29tcG9zZXIgb24gc3RhcnR1cCkgZG9lcyBub3QgYWJvcnQgcmVzdG9yaW5nIHRoZSBncmlkLiBUaGVcblx0XHQvLyB0b2tlbiBpcyBjYW5jZWxsZWQgb25seSB3aGVuIHRoZSB1c2VyIGV4cGxpY2l0bHkgb3BlbnMgYSBzZXNzaW9uLlxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3Jlc3RvcmVDdHMudmFsdWUgPSBjdHM7XG5cdFx0Y29uc3QgdG9rZW4gPSBjdHMudG9rZW47XG5cblx0XHQvLyBTZXNzaW9ucyByZXNvbHZlZCBzbyBmYXIsIGluZGV4ZWQgYnkgdGhlaXIgcG9zaXRpb24gaW4gYHRhcmdldHNgLlxuXHRcdC8vIGBudWxsYCBtYXJrcyB0aGUgZW1wdHkgKG5ldy1zZXNzaW9uKSBzbG90LCB3aGljaCBoYXMgbm8gc2Vzc2lvbi5cblx0XHRjb25zdCByZXNvbHZlZDogKElTZXNzaW9uIHwgbnVsbCB8IHVuZGVmaW5lZClbXSA9IG5ldyBBcnJheSh0YXJnZXRzLmxlbmd0aCkuZmlsbCh1bmRlZmluZWQpO1xuXG5cdFx0LyoqXG5cdFx0ICogSW5zZXJ0IGEgcmVzb2x2ZWQgc2Vzc2lvbiBpbnRvIHRoZSBncmlkIG5leHQgdG8gdGhlIG5lYXJlc3Rcblx0XHQgKiBhbHJlYWR5LXBsYWNlZCBuZWlnaGJvdXIsIHByZXNlcnZpbmcgdGhlIHBlcnNpc3RlZCBvcmRlciByZWdhcmRsZXNzIG9mXG5cdFx0ICogdGhlIG9yZGVyIGluIHdoaWNoIHNlc3Npb25zIGJlY29tZSBhdmFpbGFibGUuIFdoZW4gYSBuZWlnaGJvdXIgZXhpc3RzXG5cdFx0ICogdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIGxlZnQgdW5jaGFuZ2VkOyBvbmx5IGluIHRoZSBlZGdlIGNhc2Ugd2hlcmUgbm9cblx0XHQgKiBuZWlnaGJvdXIgaGFzIGJlZW4gcGxhY2VkIHlldCAoZS5nLiB0aGUgYWN0aXZlIHRhcmdldCBuZXZlciByZXN1cmZhY2VkLFxuXHRcdCAqIHNvIHRoZSBncmlkIGxhaWQgb3V0IGVtcHR5KSBkb2VzIHRoZSBmaXJzdCBzZXNzaW9uIHRvIGFycml2ZSBiZWNvbWVcblx0XHQgKiBhY3RpdmUgYXMgYSBzZW5zaWJsZSBmYWxsYmFjay5cblx0XHQgKi9cblx0XHRjb25zdCBwbGFjZSA9IChpZHg6IG51bWJlciwgc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkID0+IHtcblx0XHRcdGxldCBhbmNob3I6IHsgaWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgc2lkZTogJ2xlZnQnIHwgJ3JpZ2h0JyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChsZXQgaiA9IGlkeCAtIDE7IGogPj0gMCAmJiAhYW5jaG9yOyBqLS0pIHtcblx0XHRcdFx0Y29uc3QgbmVpZ2hib3VyID0gcmVzb2x2ZWRbal07XG5cdFx0XHRcdGlmIChuZWlnaGJvdXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGFuY2hvciA9IHsgaWQ6IG5laWdoYm91cj8uc2Vzc2lvbklkLCBzaWRlOiAncmlnaHQnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGogPSBpZHggKyAxOyBqIDwgdGFyZ2V0cy5sZW5ndGggJiYgIWFuY2hvcjsgaisrKSB7XG5cdFx0XHRcdGNvbnN0IG5laWdoYm91ciA9IHJlc29sdmVkW2pdO1xuXHRcdFx0XHRpZiAobmVpZ2hib3VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRhbmNob3IgPSB7IGlkOiBuZWlnaGJvdXI/LnNlc3Npb25JZCwgc2lkZTogJ2xlZnQnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmVzb2x2ZWRbaWR4XSA9IHNlc3Npb247XG5cdFx0XHRpZiAoYW5jaG9yKSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2liaWxpdHkuaW5zZXJ0QXQoc2Vzc2lvbiwgYW5jaG9yLmlkLCBhbmNob3Iuc2lkZSwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFyZ2V0c1tpZHhdLmlzU3RpY2t5KSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2liaWxpdHkudG9nZ2xlU3RpY2tpbmVzcyhzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgYWN0aXZlIHNlc3Npb24gZmlyc3Qgc28gaXQgY2FuIGFjdCBhcyB0aGUgYW5jaG9yIGZvciB0aGVcblx0XHQvLyBpbml0aWFsIGxheW91dC4gVGhlIGVtcHR5IHNsb3QgcmVzb2x2ZXMgaW1tZWRpYXRlbHkgKHRoZSBncmlkIGFscmVhZHlcblx0XHQvLyBzaG93cyB0aGUgbmV3LXNlc3Npb24gdmlldykuIExvYWQgcHJvZ3Jlc3MgaXMgc3VyZmFjZWQgcGVyLWxlYWYgYnkgdGhlXG5cdFx0Ly8gY2hhdCB2aWV3IGl0c2VsZiBvbmNlIHRoZSBncmlkIGlzIGxhaWQgb3V0IChtaXJyb3JpbmcgaG93IGVhY2ggZWRpdG9yXG5cdFx0Ly8gZ3JvdXAgb3ducyBpdHMgcHJvZ3Jlc3MgYmFyKSwgc28gbm8gcGFydC13aWRlIHByb2dyZXNzIGlzIGRyaXZlbiBoZXJlLlxuXHRcdGNvbnN0IGFjdGl2ZVRhcmdldCA9IHRhcmdldHNbYWN0aXZlSWR4XTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUHJvbWlzZTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4gPSBhY3RpdmVUYXJnZXQucmVzb3VyY2Vcblx0XHRcdD8gdGhpcy5fd2FpdEZvclNlc3Npb24oYWN0aXZlVGFyZ2V0LnJlc291cmNlLCB0b2tlbiwgUkVTVE9SRV9TRVNTSU9OX1dBSVRfVElNRU9VVCkudGhlbihzZXNzaW9uID0+IHNlc3Npb24gPz8gdW5kZWZpbmVkKVxuXHRcdFx0OiBQcm9taXNlLnJlc29sdmU8SVNlc3Npb24gfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gYXdhaXQgYWN0aXZlU2Vzc2lvblByb21pc2U7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMYXkgb3V0IGFsbCBjdXJyZW50bHktYXZhaWxhYmxlIHNlc3Npb25zIGF0b21pY2FsbHkgaW4gdGhlIHBlcnNpc3RlZFxuXHRcdC8vIG9yZGVyIHNvIHRoZSBncmlkIGFwcGVhcnMgaW4gb25lIHNob3QgcmF0aGVyIHRoYW4gYnVpbGRpbmcgdXAgc2xvdCBieVxuXHRcdC8vIHNsb3QgKHdoaWNoIGNhdXNlZCB0aGUgYWN0aXZlIHNlc3Npb24gdG8gYmUgc2hvd24gYWxvbmUgYW5kIHRoZW5cblx0XHQvLyByZWZsb3cgYXMgdGhlIG90aGVycyB3ZXJlIGluc2VydGVkKS4gU2Vzc2lvbnMgd2hvc2UgcHJvdmlkZXIgaGFzIG5vdFxuXHRcdC8vIHlldCBzdXJmYWNlZCB0aGVtIGFyZSBmaWxsZWQgaW4gaW5jcmVtZW50YWxseSBiZWxvdy5cblx0XHRjb25zdCBzbG90czogeyBzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDsgc3RpY2t5OiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGxldCBhY3RpdmVTbG90SW5kZXggPSAtMTtcblx0XHRmb3IgKGxldCBpZHggPSAwOyBpZHggPCB0YXJnZXRzLmxlbmd0aDsgaWR4KyspIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldHNbaWR4XTtcblx0XHRcdGxldCBzZXNzaW9uOiBJU2Vzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXRhcmdldC5yZXNvdXJjZSkge1xuXHRcdFx0XHRzZXNzaW9uID0gbnVsbDsgLy8gZW1wdHkgbmV3LXNlc3Npb24gc2xvdFxuXHRcdFx0fSBlbHNlIGlmIChpZHggPT09IGFjdGl2ZUlkeCkge1xuXHRcdFx0XHRzZXNzaW9uID0gYWN0aXZlU2Vzc2lvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbih0YXJnZXQucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHlldCBhdmFpbGFibGUgXHUyMDE0IHBsYWNlZCBpbmNyZW1lbnRhbGx5IGJlbG93XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlZFtpZHhdID0gc2Vzc2lvbjtcblx0XHRcdGlmIChpZHggPT09IGFjdGl2ZUlkeCkge1xuXHRcdFx0XHRhY3RpdmVTbG90SW5kZXggPSBzbG90cy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRzbG90cy5wdXNoKHsgc2Vzc2lvbjogc2Vzc2lvbiA/PyB1bmRlZmluZWQsIHN0aWNreTogdGFyZ2V0LmlzU3RpY2t5IH0pO1xuXHRcdH1cblx0XHR0aGlzLl92aXNpYmlsaXR5LnJlc3RvcmVHcmlkKHNsb3RzLCBhY3RpdmVTbG90SW5kZXgpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXMgaXMgbW92ZWQgaW50byB0aGUgcmVzdG9yZWQgYWN0aXZlIHNlc3Npb24gYnkgdGhlIHJlY29uY2lsZVxuXHRcdC8vIGF1dG9ydW4sIHdoaWNoIG9ic2VydmVzIHRoZSBhY3RpdmUtc2Vzc2lvbiBjaGFuZ2UuXG5cblx0XHQvLyBQbGFjZSBhbnkgc2Vzc2lvbnMgdGhhdCBiZWNhbWUgYXZhaWxhYmxlIGxhdGVyIGluIHRoZWlyIGNvcnJlY3Rcblx0XHQvLyBwb3NpdGlvbnMgYXJvdW5kIHRoZSBhbHJlYWR5LWVzdGFibGlzaGVkIGxheW91dC5cblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0YXJnZXRzLm1hcChhc3luYyAodGFyZ2V0LCBpZHgpID0+IHtcblx0XHRcdGlmIChpZHggPT09IGFjdGl2ZUlkeCB8fCAhdGFyZ2V0LnJlc291cmNlIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHJlc29sdmVkW2lkeF0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fd2FpdEZvclNlc3Npb24odGFyZ2V0LnJlc291cmNlLCB0b2tlbiwgUkVTVE9SRV9TRVNTSU9OX1dBSVRfVElNRU9VVCk7XG5cdFx0XHRpZiAoIXNlc3Npb24gfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgcmVzb2x2ZWRbaWR4XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBsYWNlKGlkeCwgc2Vzc2lvbik7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbiBOYXZpZ2F0aW9uIC0tXG5cblx0YXN5bmMgb3BlblByZXZpb3VzU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9uYXZpZ2F0aW9uLmdvQmFjaygpO1xuXHR9XG5cblx0YXN5bmMgb3Blbk5leHRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX25hdmlnYXRpb24uZ29Gb3J3YXJkKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVNlc3Npb25zU2VydmljZSwgU2Vzc2lvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXNCLGVBQWU7QUFDckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUJBQWlCLDZCQUE2QjtBQUN2RCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsZ0JBQWlDLHFCQUFxQjtBQUNsRixTQUFtRiwwQkFBeUUsa0NBQWlFO0FBQzdOLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXNCLDBCQUEw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
