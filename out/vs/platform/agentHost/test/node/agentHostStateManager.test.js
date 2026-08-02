import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType, NotificationType } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, buildSubagentSessionUriPrefix, isSubagentSession, mergeSessionWithDefaultChat, parseSubagentSessionUri, readHostBuildInfo } from "../../common/state/sessionState.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { buildChangesetUri, buildSessionChangesetUri } from "../../common/changesetUri.js";
import { withAgentCustomizationSettings } from "../../common/agentCustomizationSettings.js";
suite("AgentHostStateManager", () => {
  let disposables;
  let manager;
  const sessionUri = URI.from({ scheme: "copilot", path: "/test-session" }).toString();
  const sessionChatUri = buildDefaultChatUri(sessionUri);
  function makeSessionSummary(resource) {
    return {
      resource: resource ?? sessionUri,
      provider: "copilot",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" }
    };
  }
  setup(() => {
    disposables = new DisposableStore();
    manager = disposables.add(new AgentHostStateManager(new NullLogService()));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createSession creates initial state with lifecycle Creating", () => {
    const state = manager.createSession(makeSessionSummary());
    assert.strictEqual(state.lifecycle, SessionLifecycle.Creating);
    const chatState = manager.getDefaultChatState(sessionUri);
    assert.strictEqual(chatState?.turns.length, 0);
    assert.strictEqual(chatState?.activeTurn, void 0);
    assert.strictEqual(manager.getSessionSummary(sessionUri)?.resource.toString(), sessionUri.toString());
  });
  test("getSnapshot returns undefined for unknown session", () => {
    const unknown = URI.from({ scheme: "copilot", path: "/unknown" }).toString();
    const snapshot = manager.getSnapshot(unknown);
    assert.strictEqual(snapshot, void 0);
  });
  test("getSnapshot returns root snapshot", () => {
    const snapshot = manager.getSnapshot(ROOT_STATE_URI);
    assert.ok(snapshot);
    assert.strictEqual(snapshot.resource.toString(), ROOT_STATE_URI.toString());
    const root = snapshot.state;
    assert.deepStrictEqual(root.agents, []);
    assert.strictEqual(root.activeSessions, 0);
    assert.ok(root.config, "root state should include a seeded config");
  });
  test("seeds host build info into root state _meta when provided", () => {
    const buildInfo = { version: "1.96.0", commit: "abc1234", date: "2024-01-02T03:04:05Z", quality: "insider" };
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService(), { hostBuildInfo: buildInfo }));
    assert.deepStrictEqual(readHostBuildInfo(localManager.rootState), buildInfo);
  });
  test("omits host build info from root state _meta when not provided", () => {
    assert.strictEqual(readHostBuildInfo(manager.rootState), void 0);
  });
  test("getSnapshot returns session snapshot after creation", () => {
    manager.createSession(makeSessionSummary());
    const snapshot = manager.getSnapshot(sessionUri);
    assert.ok(snapshot);
    assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
    assert.strictEqual(snapshot.state.lifecycle, SessionLifecycle.Creating);
  });
  test("dispatchServerAction applies action and emits envelope", () => {
    manager.createSession(makeSessionSummary());
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionReady
    });
    const state = manager.getSessionState(sessionUri);
    assert.ok(state);
    assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
    assert.strictEqual(envelopes.length, 1);
    assert.strictEqual(envelopes[0].action.type, ActionType.SessionReady);
    assert.strictEqual(envelopes[0].serverSeq, 1);
    assert.strictEqual(envelopes[0].origin, void 0);
  });
  test("emits session title changes and suppresses no-op assignments", () => {
    manager.createSession(makeSessionSummary());
    const changes = [];
    disposables.add(manager.onDidChangeSessionTitle((e) => changes.push(e)));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Updated" });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Updated" });
    assert.deepStrictEqual(changes, [{ session: sessionUri, title: "Updated" }]);
  });
  test("serverSeq increments monotonically", () => {
    manager.createSession(makeSessionSummary());
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Updated" });
    assert.strictEqual(envelopes.length, 2);
    assert.strictEqual(envelopes[0].serverSeq, 1);
    assert.strictEqual(envelopes[1].serverSeq, 2);
    assert.ok(envelopes[1].serverSeq > envelopes[0].serverSeq);
  });
  test("dispatchClientAction includes origin in envelope", () => {
    manager.createSession(makeSessionSummary());
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    const origin = { clientId: "renderer-1", clientSeq: 42 };
    manager.dispatchClientAction(
      sessionUri,
      { type: ActionType.SessionReady },
      origin
    );
    assert.strictEqual(envelopes.length, 1);
    assert.deepStrictEqual(envelopes[0].origin, origin);
  });
  test("root action that does not change state is not emitted", () => {
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.setting": "value-a" }
    });
    assert.strictEqual(envelopes.length, 1);
    assert.strictEqual(manager.serverSeq, 1);
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.setting": "value-a" }
    });
    assert.strictEqual(envelopes.length, 1);
    assert.strictEqual(manager.serverSeq, 1, "serverSeq must not advance on a no-op");
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.nested": { allow: ["x"], deny: [] } }
    });
    assert.strictEqual(envelopes.length, 2);
    assert.strictEqual(manager.serverSeq, 2);
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.nested": { allow: ["x"], deny: [] } }
    });
    assert.strictEqual(envelopes.length, 2);
    assert.strictEqual(manager.serverSeq, 2, "serverSeq must not advance on a no-op");
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.setting": "value-b" }
    });
    assert.strictEqual(envelopes.length, 3);
    assert.strictEqual(manager.serverSeq, 3);
  });
  test("root config replacement preserves provider-backed values", () => {
    const rootState = manager.rootState;
    assert.ok(rootState.config);
    rootState.config.values["codex.personality"] = "friendly";
    rootState._meta = withAgentCustomizationSettings(rootState, [{
      provider: "codex",
      title: "Codex Settings",
      description: "Codex settings",
      settings: [{ key: "codex.personality", group: "Personalization" }]
    }]);
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchClientAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { codexUsageSource: "openai" },
      replace: true
    }, { clientId: "renderer-1", clientSeq: 1 });
    assert.deepStrictEqual(manager.rootState.config?.values, {
      codexUsageSource: "openai",
      "codex.personality": "friendly"
    });
    assert.deepStrictEqual(envelopes[0].action, {
      type: ActionType.RootConfigChanged,
      config: {
        codexUsageSource: "openai",
        "codex.personality": "friendly"
      },
      replace: true
    });
  });
  test("removeSession clears state without notification", () => {
    manager.createSession(makeSessionSummary());
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.removeSession(sessionUri);
    assert.strictEqual(manager.getSessionState(sessionUri), void 0);
    assert.strictEqual(manager.getSnapshot(sessionUri), void 0);
    assert.strictEqual(notifications.length, 0);
  });
  test("deleteSession clears state and emits notification", () => {
    manager.createSession(makeSessionSummary());
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.deleteSession(sessionUri);
    assert.strictEqual(manager.getSessionState(sessionUri), void 0);
    assert.strictEqual(manager.getSnapshot(sessionUri), void 0);
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, NotificationType.SessionRemoved);
  });
  test("createSession emits sessionAdded notification", () => {
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.createSession(makeSessionSummary());
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, NotificationType.SessionAdded);
  });
  test("default chat inherits the session working directory resolved at materialization", () => {
    manager.createSession({ ...makeSessionSummary(), workingDirectories: ["file:///provisional"] }, { emitNotification: false });
    manager.markSessionPersisted(sessionUri, { ...makeSessionSummary(), workingDirectories: ["file:///resolved-worktree"] });
    assert.deepStrictEqual({
      session: manager.getSessionState(sessionUri)?.workingDirectories?.[0],
      defaultChat: manager.getSessionState(sessionChatUri)?.workingDirectories?.[0]
    }, {
      session: "file:///resolved-worktree",
      defaultChat: "file:///resolved-worktree"
    });
  });
  test("getActiveTurnId returns active turn id after turnStarted", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    assert.strictEqual(manager.getActiveTurnId(sessionUri), void 0);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.getActiveTurnId(sessionUri), "turn-1");
  });
  test("root state starts with activeSessions: 0", () => {
    const snapshot = manager.getSnapshot(ROOT_STATE_URI);
    assert.ok(snapshot);
    const root = snapshot.state;
    assert.deepStrictEqual(root.agents, []);
    assert.strictEqual(root.activeSessions, 0);
  });
  test("turnStarted dispatches root/activeSessionsChanged with correct count", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 1);
    assert.strictEqual(activeChanged[0].action.activeSessions, 1);
    assert.strictEqual(manager.rootState.activeSessions, 1);
  });
  test("turnComplete dispatches root/activeSessionsChanged back to 0", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: 1e3
    });
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 1);
    assert.strictEqual(activeChanged[0].action.activeSessions, 0);
    assert.strictEqual(manager.rootState.activeSessions, 0);
  });
  test("activeSessions reflects concurrent turn count across sessions", () => {
    const session2Uri = URI.from({ scheme: "copilot", path: "/test-session-2" }).toString();
    manager.createSession(makeSessionSummary(sessionUri));
    manager.createSession(makeSessionSummary(session2Uri));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(session2Uri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "a", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-2",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "b", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 2);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-2",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 0);
  });
  test("removeSession decrements active sessions when an active turn is stranded", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.removeSession(sessionUri);
    assert.strictEqual(manager.rootState.activeSessions, 0);
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 1);
    assert.strictEqual(activeChanged[0].action.activeSessions, 0);
  });
  test("removeSession does not dispatch active-sessions change when no turn is active", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.removeSession(sessionUri);
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 0);
  });
  test("stale ChatTurnComplete (wrong turnId) does not decrement active sessions", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "stale-turn",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    assert.strictEqual(manager.hasActiveSessions, true);
  });
  test("concurrent ChatTurnStarted on same session keeps active count at one", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "a", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-2",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "b", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-2",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 0);
    assert.strictEqual(manager.hasActiveSessions, false);
  });
  test("active turn event follows reducer-derived active state transitions", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const events = [];
    disposables.add(manager.onDidChangeSessionActiveTurn((e) => events.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "stale-turn",
      duration: 1e3
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatError,
      turnId: "turn-1",
      duration: 1e3,
      error: { errorType: "failed", message: "boom" }
    });
    assert.deepStrictEqual(events, [
      { session: sessionUri, active: true },
      { session: sessionUri, active: false }
    ]);
  });
  test("active turn event covers cancellation and removal while active", () => {
    const session2Uri = URI.from({ scheme: "copilot", path: "/test-session-2" }).toString();
    manager.createSession(makeSessionSummary(sessionUri));
    manager.createSession(makeSessionSummary(session2Uri));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(session2Uri, { type: ActionType.SessionReady });
    const events = [];
    disposables.add(manager.onDidChangeSessionActiveTurn((e) => events.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnCancelled,
      turnId: "turn-1",
      duration: 1e3
    });
    manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-2",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hi", origin: { kind: MessageKind.User } }
    });
    manager.removeSession(session2Uri);
    assert.deepStrictEqual(events, [
      { session: sessionUri, active: true },
      { session: sessionUri, active: false },
      { session: session2Uri, active: true },
      { session: session2Uri, active: false }
    ]);
  });
  test("restoreSession creates session in Ready state with pre-populated turns", () => {
    const turns = [
      {
        id: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "world" }],
        usage: void 0,
        state: TurnState.Complete
      }
    ];
    const state = manager.restoreSession(makeSessionSummary(), turns);
    assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
    const chatState = manager.getDefaultChatState(sessionUri);
    assert.strictEqual(chatState?.turns.length, 1);
    assert.strictEqual(chatState?.turns[0].message.text, "hello");
    assert.strictEqual((chatState?.turns[0].responseParts[0]).content, "world");
  });
  test("restoreSession returns existing state for duplicate session", () => {
    const existing = manager.createSession(makeSessionSummary());
    const state = manager.restoreSession(makeSessionSummary(), []);
    assert.strictEqual(state, existing);
  });
  test("restoreSession does not emit sessionAdded notification", () => {
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.restoreSession(makeSessionSummary(), []);
    assert.strictEqual(notifications.length, 0, "should not emit notification for restored sessions");
  });
  test("emits sessionSummaryChanged when summary changes", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "New Title" });
      assert.strictEqual(notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged).length, 0);
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 1);
      const notification = changed[0];
      assert.strictEqual(notification.session, sessionUri);
      assert.strictEqual(notification.changes.title, "New Title");
      assert.strictEqual(notification.changes.status, void 0, "unchanged fields should be omitted");
    });
  });
  test("coalesces multiple summary changes into one notification", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "First" });
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Second" });
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 1, "should coalesce into one notification");
      assert.strictEqual(changed[0].changes.title, "Second");
    });
  });
  test("does not emit sessionSummaryChanged when summary is unchanged", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 0);
    });
  });
  test("does not emit sessionSummaryChanged for deleted session", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "New Title" });
      manager.deleteSession(sessionUri);
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 0, "should not emit for deleted sessions");
    });
  });
  test("removeSession flushes pending status=Idle notification before eviction", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      await new Promise((r) => setTimeout(r, 150));
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      manager.removeSession(sessionUri);
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 1, "should emit SessionSummaryChanged synchronously in removeSession");
      assert.strictEqual(changed[0].changes.status, SessionStatus.Idle, "status should be Idle so the spinner clears");
    });
  });
  test("disposeChangeset emits ChangesetCleared and removes the state", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.disposeChangeset(changeset);
    const cleared = envelopes.filter((e) => e.action.type === ActionType.ChangesetCleared);
    assert.strictEqual(cleared.length, 1, "expected exactly one cleared envelope");
    assert.strictEqual(cleared[0].channel, changeset);
    assert.strictEqual(manager.getChangesetState(changeset), void 0, "state should be deleted");
  });
  test("producer-emitted ChangesetCleared keeps the state alive (recompute path)", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    assert.strictEqual(manager.getChangesetState(changeset)?.files.length, 1);
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetCleared
    });
    const after = manager.getChangesetState(changeset);
    assert.ok(after, "state should still exist");
    assert.strictEqual(after.files.length, 0, "files should be cleared");
  });
  test("removeSession does NOT dispose per-session changesets (LRU eviction must not clear list-view chip)", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.removeSession(sessionUri);
    const cleared = envelopes.filter((e) => e.action.type === ActionType.ChangesetCleared);
    assert.strictEqual(cleared.length, 0, "removeSession must not emit ChangesetCleared");
    assert.strictEqual(manager.getChangesetState(changeset)?.files.length, 1, "changeset state should survive eviction");
  });
  test("deleteSession disposes per-session changesets before emitting SessionRemoved", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    const envelopes = [];
    const notifications = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.deleteSession(sessionUri);
    const cleared = envelopes.filter((e) => e.action.type === ActionType.ChangesetCleared);
    const removed = notifications.filter((n) => n.type === NotificationType.SessionRemoved);
    assert.strictEqual(cleared.length, 1, "deleteSession should emit ChangesetCleared");
    assert.strictEqual(removed.length, 1, "deleteSession should emit SessionRemoved");
    assert.strictEqual(manager.getChangesetState(changeset), void 0, "changeset state should be gone after delete");
  });
  test("unknown changeset action is ignored without emitting an envelope", () => {
    manager.createSession(makeSessionSummary());
    const changesetUri = `${sessionUri}/changeset/missing`;
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    const seqBefore = manager.serverSeq;
    manager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///x.ts",
        edit: { after: { uri: "file:///x.ts", content: { uri: "file:///x.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    assert.deepStrictEqual(
      {
        envelopeCount: envelopes.length,
        seqAdvanced: manager.serverSeq - seqBefore,
        changesetState: manager.getChangesetState(changesetUri)
      },
      {
        envelopeCount: 0,
        seqAdvanced: 0,
        changesetState: void 0
      }
    );
    const registered = manager.registerChangeset(buildChangesetUri(sessionUri, "missing"));
    assert.strictEqual(registered, changesetUri);
    manager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///x.ts",
        edit: { after: { uri: "file:///x.ts", content: { uri: "file:///x.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    assert.strictEqual(envelopes.length, 1, "registered changeset action should emit an envelope");
    assert.strictEqual(manager.serverSeq - seqBefore, 1, "serverSeq should advance for registered changeset action");
  });
  suite("multi-chat catalog", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    test("addChat grows the catalog, creates chat state and emits SessionChatAdded", () => {
      manager.createSession(makeSessionSummary());
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const summary = manager.addChat(sessionUri, peerChat, { title: "Peer" });
      assert.deepStrictEqual(
        {
          addedTitle: summary?.title,
          chatResources: manager.getSessionState(sessionUri)?.chats.map((c) => c.resource.toString()).sort(),
          peerTurns: manager.getChatState(peerChat)?.turns.length,
          chatAddedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatAdded).length
        },
        {
          addedTitle: "Peer",
          chatResources: [buildDefaultChatUri(sessionUri), peerChat].sort(),
          peerTurns: 0,
          chatAddedEvents: 1
        }
      );
    });
    test("removeChat shrinks the catalog and refuses the default chat", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat);
      manager.removeChat(sessionUri, buildDefaultChatUri(sessionUri));
      const afterDefaultRemoval = manager.getSessionState(sessionUri)?.chats.length;
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual(
        {
          afterDefaultRemoval,
          afterPeerRemoval: manager.getSessionState(sessionUri)?.chats.map((c) => c.resource.toString()),
          peerState: manager.getChatState(peerChat)
        },
        {
          afterDefaultRemoval: 2,
          afterPeerRemoval: [buildDefaultChatUri(sessionUri)],
          peerState: void 0
        }
      );
    });
    test("session title and default chat title stay independent once multi-chat", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat);
      const afterAdd = manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === defaultChat)?.title;
      manager.updateChatTitle(sessionUri, defaultChat, "Chat A");
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Session B" });
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          afterAdd,
          sessionTitle: state?.title,
          defaultChatTitle: state?.chats.find((c) => c.resource === defaultChat)?.title
        },
        {
          afterAdd: "Test",
          sessionTitle: "Session B",
          defaultChatTitle: "Chat A"
        }
      );
    });
    test("addChat is idempotent for an existing chat URI", () => {
      manager.createSession(makeSessionSummary());
      const first = manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const second = manager.addChat(sessionUri, peerChat, { title: "Ignored" });
      assert.deepStrictEqual(
        {
          sameSummary: first === second,
          title: second?.title,
          chatCount: manager.getSessionState(sessionUri)?.chats.length,
          chatAddedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatAdded).length
        },
        {
          sameSummary: true,
          title: "Peer",
          chatCount: 2,
          chatAddedEvents: 0
        }
      );
    });
    test("addChat for an unknown session is a no-op", () => {
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const summary = manager.addChat("copilot:/missing", peerChat);
      assert.deepStrictEqual(
        {
          summary,
          events: envelopes.length
        },
        {
          summary: void 0,
          events: 0
        }
      );
    });
    test("addChat supports multiple peers and only snapshots the default title once", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat2 = buildChatUri(sessionUri, "peer-2");
      manager.addChat(sessionUri, peerChat);
      manager.updateChatTitle(sessionUri, defaultChat, "Renamed Default");
      manager.addChat(sessionUri, peerChat2);
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          chatResources: state?.chats.map((c) => c.resource.toString()).sort(),
          defaultChatTitle: state?.chats.find((c) => c.resource === defaultChat)?.title
        },
        {
          chatResources: [defaultChat, peerChat, peerChat2].sort(),
          defaultChatTitle: "Renamed Default"
        }
      );
    });
    test("updateChatTitle on a peer leaves the session and default titles untouched", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      manager.updateChatTitle(sessionUri, peerChat, "Peer Renamed");
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          sessionTitle: state?.title,
          defaultChatTitle: state?.chats.find((c) => c.resource === defaultChat)?.title,
          peerTitle: state?.chats.find((c) => c.resource === peerChat)?.title,
          peerStateTitle: manager.getChatState(peerChat)?.title
        },
        {
          sessionTitle: "Test",
          defaultChatTitle: "Test",
          peerTitle: "Peer Renamed",
          peerStateTitle: "Peer Renamed"
        }
      );
    });
    test("removeChat of an unknown chat is a no-op", () => {
      manager.createSession(makeSessionSummary());
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      manager.removeChat(sessionUri, buildChatUri(sessionUri, "never-added"));
      assert.deepStrictEqual(
        {
          chatCount: manager.getSessionState(sessionUri)?.chats.length,
          removedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatRemoved).length
        },
        {
          chatCount: 1,
          removedEvents: 0
        }
      );
    });
    test("removeChat emits SessionChatRemoved for a peer", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat);
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual(
        {
          removed: envelopes.filter((e) => e.action.type === ActionType.SessionChatRemoved).map((e) => e.action.chat),
          chatState: manager.getChatState(peerChat)
        },
        {
          removed: [peerChat],
          chatState: void 0
        }
      );
    });
    test("hasActiveTurn reflects a chat turn lifecycle", () => {
      manager.createSession(makeSessionSummary());
      const idle = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      const afterStart = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      const afterComplete = manager.hasActiveTurn(sessionUri);
      assert.deepStrictEqual(
        { idle, afterStart, afterComplete },
        { idle: false, afterStart: true, afterComplete: false }
      );
    });
    test("active-turn event observers see the updated active-turn state", () => {
      manager.createSession(makeSessionSummary());
      const observed = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => {
        observed.push({ active: e.active, hasActiveTurn: manager.hasActiveTurn(sessionUri) });
      }));
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      assert.deepStrictEqual(observed, [
        { active: true, hasActiveTurn: true },
        { active: false, hasActiveTurn: false }
      ]);
    });
    test("hasActiveTurn stays true until all concurrent chat turns finish", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const idle = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-default",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      const afterDefaultStart = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const afterBothStart = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-default",
        duration: 1e3
      });
      const afterDefaultComplete = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      const afterBothComplete = manager.hasActiveTurn(sessionUri);
      assert.deepStrictEqual(
        { idle, afterDefaultStart, afterBothStart, afterDefaultComplete, afterBothComplete },
        { idle: false, afterDefaultStart: true, afterBothStart: true, afterDefaultComplete: true, afterBothComplete: false }
      );
    });
    test("a running peer chat promotes the session summary to InProgress while the default chat is idle", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const idle = manager.getSessionState(sessionUri)?.status;
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const whilePeerRuns = manager.getSessionState(sessionUri)?.status;
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      const afterPeerComplete = manager.getSessionState(sessionUri)?.status;
      assert.deepStrictEqual(
        {
          idleHasInProgress: ((idle ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
          whilePeerRunsHasInProgress: ((whilePeerRuns ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
          afterPeerCompleteHasInProgress: ((afterPeerComplete ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
          defaultChatStillIdle: ((manager.getChatState(defaultChat)?.status ?? SessionStatus.Idle) & SessionStatus.InProgress) === 0
        },
        {
          idleHasInProgress: false,
          whilePeerRunsHasInProgress: true,
          afterPeerCompleteHasInProgress: false,
          defaultChatStillIdle: true
        }
      );
    });
    test("a running peer chat forwards its own status to the session catalog so its tab can show progress", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const peerCatalogStatus = () => manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.status ?? SessionStatus.Idle;
      const chatUpdatesForPeer = () => envelopes.filter((e) => e.action.type === ActionType.SessionChatUpdated && e.action.chat === peerChat).length;
      const idleCatalog = peerCatalogStatus();
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const runningCatalog = peerCatalogStatus();
      const updatesAfterStart = chatUpdatesForPeer();
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      assert.deepStrictEqual(
        {
          idleCatalogInProgress: (idleCatalog & SessionStatus.InProgress) === SessionStatus.InProgress,
          runningCatalogInProgress: (runningCatalog & SessionStatus.InProgress) === SessionStatus.InProgress,
          finalCatalogInProgress: (peerCatalogStatus() & SessionStatus.InProgress) === SessionStatus.InProgress,
          emittedChatUpdateOnStart: updatesAfterStart >= 1
        },
        {
          idleCatalogInProgress: false,
          runningCatalogInProgress: true,
          finalCatalogInProgress: false,
          emittedChatUpdateOnStart: true
        }
      );
    });
    test("active-turn event and active-session count flip once per session across concurrent chats", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turnEvents = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => turnEvents.push(e.active)));
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-default",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const activeWhileBothRun = manager.rootState.activeSessions;
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-default",
        duration: 1e3
      });
      const activeAfterFirstCompletes = manager.rootState.activeSessions;
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      assert.deepStrictEqual(
        {
          turnEvents,
          activeWhileBothRun,
          activeAfterFirstCompletes,
          activeAfterBothComplete: manager.rootState.activeSessions
        },
        {
          // Exactly one true (first chat starts) and one false (last chat ends).
          turnEvents: [true, false],
          activeWhileBothRun: 1,
          activeAfterFirstCompletes: 1,
          activeAfterBothComplete: 0
        }
      );
    });
    test("removeChat clears a peer chat that is removed mid-turn", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turnEvents = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => turnEvents.push(e.active)));
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-default",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const activeWhileBothRun = manager.hasActiveTurn(sessionUri);
      manager.removeChat(sessionUri, peerChat);
      const activeAfterPeerRemoved = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-default",
        duration: 1e3
      });
      assert.deepStrictEqual(
        {
          turnEvents,
          activeWhileBothRun,
          activeAfterPeerRemoved,
          activeAfterDefaultComplete: manager.hasActiveTurn(sessionUri),
          activeSessions: manager.rootState.activeSessions
        },
        {
          turnEvents: [true, false],
          activeWhileBothRun: true,
          activeAfterPeerRemoved: true,
          activeAfterDefaultComplete: false,
          activeSessions: 0
        }
      );
    });
    test("removeChat flips the session idle when the removed peer held the last active turn", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turnEvents = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => turnEvents.push(e.active)));
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const activeWhilePeerRuns = manager.hasActiveTurn(sessionUri);
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual(
        {
          turnEvents,
          activeWhilePeerRuns,
          activeAfterPeerRemoved: manager.hasActiveTurn(sessionUri),
          activeSessions: manager.rootState.activeSessions
        },
        {
          turnEvents: [true, false],
          activeWhilePeerRuns: true,
          activeAfterPeerRemoved: false,
          activeSessions: 0
        }
      );
    });
  });
  suite("catalog characterization (A3)", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    test("_ensureDefaultChat seeds a single inheriting default chat and points defaultChat at it on createSession", () => {
      manager.createSession(makeSessionSummary());
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          defaultChat: state?.defaultChat,
          defaultChatIsDeterministic: state?.defaultChat === buildDefaultChatUri(sessionUri),
          chatResources: state?.chats.map((c) => c.resource.toString()),
          // Empty title => the default chat inherits the session title for display.
          defaultChatTitle: state?.chats[0]?.title,
          defaultChatStatePresent: manager.getDefaultChatState(sessionUri) !== void 0
        },
        {
          defaultChat: buildDefaultChatUri(sessionUri),
          defaultChatIsDeterministic: true,
          chatResources: [buildDefaultChatUri(sessionUri)],
          defaultChatTitle: "",
          defaultChatStatePresent: true
        }
      );
    });
    test("_ensureDefaultChat seeds the default-chat pointer on restoreSession too", () => {
      const turns = [
        {
          id: "turn-1",
          message: { text: "hello", origin: { kind: MessageKind.User } },
          responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "world" }],
          usage: void 0,
          state: TurnState.Complete
        }
      ];
      manager.restoreSession(makeSessionSummary(), turns);
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          defaultChat: state?.defaultChat,
          chatResources: state?.chats.map((c) => c.resource.toString()),
          defaultChatTurns: manager.getDefaultChatState(sessionUri)?.turns.length
        },
        {
          defaultChat: buildDefaultChatUri(sessionUri),
          chatResources: [buildDefaultChatUri(sessionUri)],
          defaultChatTurns: 1
        }
      );
    });
    test("restoreChat re-registers a peer chat in place, seeding turns and draft without dispatching SessionChatAdded", () => {
      manager.restoreSession(makeSessionSummary(), []);
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const turns = [
        {
          id: "peer-turn-1",
          message: { text: "restored", origin: { kind: MessageKind.User } },
          responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "history" }],
          usage: void 0,
          state: TurnState.Complete
        }
      ];
      const draft = { text: "work in progress", origin: { kind: MessageKind.User } };
      manager.restoreChat(sessionUri, peerChat, { title: "Restored Peer", turns, draft });
      const peerState = manager.getChatState(peerChat);
      assert.deepStrictEqual(
        {
          chatResources: manager.getSessionState(sessionUri)?.chats.map((c) => c.resource.toString()).sort(),
          restoredTitle: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.title,
          peerTurns: peerState?.turns.length,
          peerDraft: peerState?.draft?.text,
          // restoreChat runs before clients subscribe, so it adds the
          // catalog entry in place rather than via a dispatched action.
          chatAddedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatAdded).length
        },
        {
          chatResources: [buildDefaultChatUri(sessionUri), peerChat].sort(),
          restoredTitle: "Restored Peer",
          peerTurns: 1,
          peerDraft: "work in progress",
          chatAddedEvents: 0
        }
      );
    });
    test("restoreChat is a no-op for an already-registered chat URI", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turns = [
        {
          id: "ignored-turn",
          message: { text: "ignored", origin: { kind: MessageKind.User } },
          responseParts: [],
          usage: void 0,
          state: TurnState.Complete
        }
      ];
      manager.restoreChat(sessionUri, peerChat, { title: "Ignored", turns });
      assert.deepStrictEqual(
        {
          chatCount: manager.getSessionState(sessionUri)?.chats.length,
          title: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.title,
          // The existing (empty) chat state is preserved; the supplied turns are dropped.
          peerTurns: manager.getChatState(peerChat)?.turns.length
        },
        {
          chatCount: 2,
          title: "Peer",
          peerTurns: 0
        }
      );
    });
    test("restoreChat for an unknown session is a no-op", () => {
      manager.restoreChat("copilot:/missing", peerChat, { turns: [] });
      assert.strictEqual(manager.getChatState(peerChat), void 0);
    });
    test("SessionSummaryNotifier rolls a running peer chat up onto the session summary and emits one coalesced SessionSummaryChanged", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        manager.createSession(makeSessionSummary());
        manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
        manager.addChat(sessionUri, peerChat, { title: "Peer" });
        const notifications = [];
        disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
        const summaryHasInProgress = () => ((manager.getSessionSummary(sessionUri)?.status ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress;
        const idleRollup = summaryHasInProgress();
        manager.dispatchServerAction(peerChat, {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-peer",
          startedAt: "2025-01-01T00:00:00.000Z",
          message: { text: "b", origin: { kind: MessageKind.User } }
        });
        const runningRollup = summaryHasInProgress();
        await new Promise((r) => setTimeout(r, 150));
        const summaryChanges = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
        assert.deepStrictEqual(
          {
            idleRollup,
            runningRollup,
            summaryChangedCount: summaryChanges.length,
            notifiedStatusHasInProgress: ((summaryChanges[0]?.changes.status ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
            notifiedSession: summaryChanges[0]?.session
          },
          {
            idleRollup: false,
            runningRollup: true,
            summaryChangedCount: 1,
            notifiedStatusHasInProgress: true,
            notifiedSession: sessionUri
          }
        );
      });
    });
  });
  suite("providerData (G-B1)", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    const peerChat2 = buildChatUri(sessionUri, "peer-2");
    test("addChat records providerData verbatim and getChatProviderData returns it unchanged", () => {
      manager.createSession(makeSessionSummary());
      const blob = '{"sdkSessionId":"abc-123","model":{"id":"x\\"y"}}';
      manager.addChat(sessionUri, peerChat, { title: "Peer", providerData: blob });
      assert.deepStrictEqual(
        {
          providerData: manager.getChatProviderData(peerChat),
          // The blob is stored separately and never leaks onto the
          // protocol-visible catalog entry / chat state.
          summaryHasBlob: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.providerData !== void 0,
          chatStateHasBlob: manager.getChatState(peerChat)?.providerData !== void 0
        },
        {
          providerData: blob,
          summaryHasBlob: false,
          chatStateHasBlob: false
        }
      );
    });
    test("the default chat never carries providerData", () => {
      manager.createSession(makeSessionSummary());
      assert.strictEqual(manager.getChatProviderData(buildDefaultChatUri(sessionUri)), void 0);
    });
    test("addChat without providerData stores nothing", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      assert.strictEqual(manager.getChatProviderData(peerChat), void 0);
    });
    test("addChat is idempotent and preserves the originally stored providerData", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer", providerData: "first" });
      manager.addChat(sessionUri, peerChat, { title: "Ignored", providerData: "second" });
      assert.strictEqual(manager.getChatProviderData(peerChat), "first");
    });
    test("restoreChat records providerData verbatim alongside turns", () => {
      manager.restoreSession(makeSessionSummary(), []);
      const blob = "opaque-restore-token";
      manager.restoreChat(sessionUri, peerChat, { title: "Restored", turns: [], providerData: blob });
      assert.strictEqual(manager.getChatProviderData(peerChat), blob);
    });
    test("restoreChat without providerData stores nothing", () => {
      manager.restoreSession(makeSessionSummary(), []);
      manager.restoreChat(sessionUri, peerChat, { title: "Restored", turns: [] });
      assert.strictEqual(manager.getChatProviderData(peerChat), void 0);
    });
    test("removeChat drops the chat providerData", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer", providerData: "blob" });
      manager.removeChat(sessionUri, peerChat);
      assert.strictEqual(manager.getChatProviderData(peerChat), void 0);
    });
    test("removeSession drops providerData for every peer chat", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer 1", providerData: "blob-1" });
      manager.addChat(sessionUri, peerChat2, { title: "Peer 2", providerData: "blob-2" });
      manager.removeSession(sessionUri);
      assert.deepStrictEqual(
        {
          peer1: manager.getChatProviderData(peerChat),
          peer2: manager.getChatProviderData(peerChat2)
        },
        {
          peer1: void 0,
          peer2: void 0
        }
      );
    });
  });
});
suite("Subagent URI helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("buildSubagentSessionUri creates correct URI", () => {
    assert.strictEqual(
      buildSubagentSessionUri("copilot:/session-1", "tc-1"),
      "copilot:/session-1/subagent/tc-1"
    );
  });
  test("buildSubagentSessionUri preserves parent URI path shape", () => {
    assert.strictEqual(
      buildSubagentSessionUri("copilot:/session-1//nested/../kept", "tc-1"),
      "copilot:/session-1//nested/../kept/subagent/tc-1"
    );
  });
  test("parseSubagentSessionUri extracts parent and toolCallId", () => {
    const parsed = parseSubagentSessionUri("copilot:/session-1/subagent/tc-1");
    assert.deepStrictEqual(parsed && {
      parentSession: parsed.parentSession.toString(),
      toolCallId: parsed.toolCallId
    }, {
      parentSession: "copilot:/session-1",
      toolCallId: "tc-1"
    });
  });
  test("parseSubagentSessionUri handles nested subagent URIs", () => {
    const parsed = parseSubagentSessionUri("copilot:/session-1/subagent/tc-1/subagent/tc-2");
    assert.deepStrictEqual(parsed && {
      parentSession: parsed.parentSession.toString(),
      toolCallId: parsed.toolCallId
    }, {
      parentSession: "copilot:/session-1/subagent/tc-1",
      toolCallId: "tc-2"
    });
  });
  test("parseSubagentSessionUri returns undefined for non-subagent URIs", () => {
    assert.strictEqual(parseSubagentSessionUri("copilot:/session-1"), void 0);
  });
  test("isSubagentSession identifies subagent URIs", () => {
    assert.strictEqual(isSubagentSession("copilot:/session-1/subagent/tc-1"), true);
    assert.strictEqual(isSubagentSession("copilot:/session-1"), false);
  });
  test("buildSubagentSessionUriPrefix creates state manager prefix", () => {
    assert.strictEqual(
      buildSubagentSessionUriPrefix("copilot:/session-1"),
      "copilot:/session-1/subagent/"
    );
  });
  test("buildSubagentSessionUriPrefix preserves parent URI path shape", () => {
    assert.strictEqual(
      buildSubagentSessionUriPrefix("copilot:/session-1//nested/../kept"),
      "copilot:/session-1//nested/../kept/subagent/"
    );
  });
  suite("mergeSessionWithDefaultChat", () => {
    function makeSessionState(workingDirectory) {
      return {
        provider: "copilot",
        title: "Session",
        status: SessionStatus.Idle,
        lifecycle: SessionLifecycle.Ready,
        activeClients: [],
        chats: [],
        workingDirectories: workingDirectory ? [workingDirectory] : void 0
      };
    }
    function makeChatState(workingDirectory) {
      return {
        resource: "copilot:/test-session/chat/peer",
        title: "Peer",
        status: SessionStatus.Idle,
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: workingDirectory ? [workingDirectory] : void 0,
        turns: []
      };
    }
    test("resolves the per-chat working directory override over the session default", () => {
      const merged = mergeSessionWithDefaultChat(
        makeSessionState("file:///session-wd"),
        makeChatState("file:///peer-worktree")
      );
      assert.strictEqual(merged.workingDirectories?.[0], "file:///peer-worktree");
    });
    test("falls back to the session working directory when the chat does not override it", () => {
      const merged = mergeSessionWithDefaultChat(
        makeSessionState("file:///session-wd"),
        makeChatState(void 0)
      );
      assert.strictEqual(merged.workingDirectories?.[0], "file:///session-wd");
    });
    test("falls back to the session working directory when no chat state is hydrated", () => {
      const merged = mergeSessionWithDefaultChat(makeSessionState("file:///session-wd"), void 0);
      assert.strictEqual(merged.workingDirectories?.[0], "file:///session-wd");
      assert.deepStrictEqual(merged.turns, []);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgTm90aWZpY2F0aW9uVHlwZSwgdHlwZSBBY3Rpb25FbnZlbG9wZSwgdHlwZSBJTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBTZXNzaW9uU3VtbWFyeSwgUmVzcG9uc2VQYXJ0S2luZCwgUk9PVF9TVEFURV9VUkksIFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25TdGF0dXMsIFR1cm5TdGF0ZSwgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSwgYnVpbGRTdWJhZ2VudFNlc3Npb25VcmlQcmVmaXgsIGlzU3ViYWdlbnRTZXNzaW9uLCBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpLCByZWFkSG9zdEJ1aWxkSW5mbywgdHlwZSBDaGF0U3RhdGUsIHR5cGUgTWFya2Rvd25SZXNwb25zZVBhcnQsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyB0eXBlIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZFBhcmFtcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhbmdlc2V0VXJpLCBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IHdpdGhBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5ncyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5ncy5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RTdGF0ZU1hbmFnZXInLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBtYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3Rlc3Qtc2Vzc2lvbicgfSkudG9TdHJpbmcoKTtcblx0Y29uc3Qgc2Vzc2lvbkNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdGZ1bmN0aW9uIG1ha2VTZXNzaW9uU3VtbWFyeShyZXNvdXJjZT86IHN0cmluZyk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlID8/IHNlc3Npb25VcmksXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0fTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRlU2Vzc2lvbiBjcmVhdGVzIGluaXRpYWwgc3RhdGUgd2l0aCBsaWZlY3ljbGUgQ3JlYXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuQ3JlYXRpbmcpO1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IG1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFN0YXRlPy50dXJucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0U3RhdGU/LmFjdGl2ZVR1cm4sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaSk/LnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNuYXBzaG90IHJldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdW5rbm93biA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvdW5rbm93bicgfSkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IG1hbmFnZXIuZ2V0U25hcHNob3QodW5rbm93bik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTbmFwc2hvdCByZXR1cm5zIHJvb3Qgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtYW5hZ2VyLmdldFNuYXBzaG90KFJPT1RfU1RBVEVfVVJJKTtcblx0XHRhc3NlcnQub2soc25hcHNob3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZXNvdXJjZS50b1N0cmluZygpLCBST09UX1NUQVRFX1VSSS50b1N0cmluZygpKTtcblx0XHRjb25zdCByb290ID0gc25hcHNob3Quc3RhdGUgYXMgeyBhZ2VudHM6IHVua25vd25bXTsgYWN0aXZlU2Vzc2lvbnM6IG51bWJlcjsgY29uZmlnPzogeyB2YWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyb290LmFnZW50cywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0XHQvLyBIb3N0IGNvbmZpZyBpcyBzZWVkZWQgd2l0aCB0aGUgcGxhdGZvcm0gcm9vdCBzY2hlbWEgYW5kIGRlZmF1bHRzLlxuXHRcdGFzc2VydC5vayhyb290LmNvbmZpZywgJ3Jvb3Qgc3RhdGUgc2hvdWxkIGluY2x1ZGUgYSBzZWVkZWQgY29uZmlnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRzIGhvc3QgYnVpbGQgaW5mbyBpbnRvIHJvb3Qgc3RhdGUgX21ldGEgd2hlbiBwcm92aWRlZCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZEluZm8gPSB7IHZlcnNpb246ICcxLjk2LjAnLCBjb21taXQ6ICdhYmMxMjM0JywgZGF0ZTogJzIwMjQtMDEtMDJUMDM6MDQ6MDVaJywgcXVhbGl0eTogJ2luc2lkZXInIH07XG5cdFx0Y29uc3QgbG9jYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCksIHsgaG9zdEJ1aWxkSW5mbzogYnVpbGRJbmZvIH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRIb3N0QnVpbGRJbmZvKGxvY2FsTWFuYWdlci5yb290U3RhdGUpLCBidWlsZEluZm8pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBob3N0IGJ1aWxkIGluZm8gZnJvbSByb290IHN0YXRlIF9tZXRhIHdoZW4gbm90IHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkSG9zdEJ1aWxkSW5mbyhtYW5hZ2VyLnJvb3RTdGF0ZSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNuYXBzaG90IHJldHVybnMgc2Vzc2lvbiBzbmFwc2hvdCBhZnRlciBjcmVhdGlvbicsICgpID0+IHtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbWFuYWdlci5nZXRTbmFwc2hvdChzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQub2soc25hcHNob3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc25hcHNob3Quc3RhdGUgYXMgU2Vzc2lvblN0YXRlKS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuQ3JlYXRpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaFNlcnZlckFjdGlvbiBhcHBsaWVzIGFjdGlvbiBhbmQgZW1pdHMgZW52ZWxvcGUnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmxpZmVjeWNsZSwgU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blc1swXS5hY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXNbMF0uc2VydmVyU2VxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzWzBdLm9yaWdpbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc2Vzc2lvbiB0aXRsZSBjaGFuZ2VzIGFuZCBzdXBwcmVzc2VzIG5vLW9wIGFzc2lnbm1lbnRzJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBBcnJheTx7IHNlc3Npb246IHN0cmluZzsgdGl0bGU6IHN0cmluZyB9PiA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1VwZGF0ZWQnIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVXBkYXRlZCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMsIFt7IHNlc3Npb246IHNlc3Npb25VcmksIHRpdGxlOiAnVXBkYXRlZCcgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXJTZXEgaW5jcmVtZW50cyBtb25vdG9uaWNhbGx5JywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVXBkYXRlZCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blc1swXS5zZXJ2ZXJTZXEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXNbMV0uc2VydmVyU2VxLCAyKTtcblx0XHRhc3NlcnQub2soZW52ZWxvcGVzWzFdLnNlcnZlclNlcSA+IGVudmVsb3Blc1swXS5zZXJ2ZXJTZXEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaENsaWVudEFjdGlvbiBpbmNsdWRlcyBvcmlnaW4gaW4gZW52ZWxvcGUnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IG9yaWdpbiA9IHsgY2xpZW50SWQ6ICdyZW5kZXJlci0xJywgY2xpZW50U2VxOiA0MiB9O1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSxcblx0XHRcdG9yaWdpbixcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW52ZWxvcGVzWzBdLm9yaWdpbiwgb3JpZ2luKTtcblx0fSk7XG5cblx0dGVzdCgncm9vdCBhY3Rpb24gdGhhdCBkb2VzIG5vdCBjaGFuZ2Ugc3RhdGUgaXMgbm90IGVtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0Ly8gRmlyc3QgZGlzcGF0Y2g6IGludHJvZHVjZXMgYSBuZXcgdmFsdWUsIHNob3VsZCBlbWl0LlxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgJ215LnNldHRpbmcnOiAndmFsdWUtYScgfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuc2VydmVyU2VxLCAxKTtcblxuXHRcdC8vIFNlY29uZCBkaXNwYXRjaCB3aXRoIHRoZSBzYW1lIHZhbHVlOiBzaG91bGQgYmUgZGVkdXBlZCBhbmQgbm90IGVtaXQuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyAnbXkuc2V0dGluZyc6ICd2YWx1ZS1hJyB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5zZXJ2ZXJTZXEsIDEsICdzZXJ2ZXJTZXEgbXVzdCBub3QgYWR2YW5jZSBvbiBhIG5vLW9wJyk7XG5cblx0XHQvLyBUaGlyZCBkaXNwYXRjaCB3aXRoIGEgZGVlcGx5LWVxdWFsIGJ1dCBuZXdseSBhbGxvY2F0ZWQgb2JqZWN0IHZhbHVlOlxuXHRcdC8vIHNob3VsZCBhbHNvIGJlIGRlZHVwZWQuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyAnbXkubmVzdGVkJzogeyBhbGxvdzogWyd4J10sIGRlbnk6IFtdIH0gfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuc2VydmVyU2VxLCAyKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7ICdteS5uZXN0ZWQnOiB7IGFsbG93OiBbJ3gnXSwgZGVueTogW10gfSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5zZXJ2ZXJTZXEsIDIsICdzZXJ2ZXJTZXEgbXVzdCBub3QgYWR2YW5jZSBvbiBhIG5vLW9wJyk7XG5cblx0XHQvLyBSZWFsIGNoYW5nZSBzdGlsbCBlbWl0cy5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7ICdteS5zZXR0aW5nJzogJ3ZhbHVlLWInIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnNlcnZlclNlcSwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jvb3QgY29uZmlnIHJlcGxhY2VtZW50IHByZXNlcnZlcyBwcm92aWRlci1iYWNrZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IG1hbmFnZXIucm9vdFN0YXRlO1xuXHRcdGFzc2VydC5vayhyb290U3RhdGUuY29uZmlnKTtcblx0XHRyb290U3RhdGUuY29uZmlnLnZhbHVlc1snY29kZXgucGVyc29uYWxpdHknXSA9ICdmcmllbmRseSc7XG5cdFx0cm9vdFN0YXRlLl9tZXRhID0gd2l0aEFnZW50Q3VzdG9taXphdGlvblNldHRpbmdzKHJvb3RTdGF0ZSwgW3tcblx0XHRcdHByb3ZpZGVyOiAnY29kZXgnLFxuXHRcdFx0dGl0bGU6ICdDb2RleCBTZXR0aW5ncycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0NvZGV4IHNldHRpbmdzJyxcblx0XHRcdHNldHRpbmdzOiBbeyBrZXk6ICdjb2RleC5wZXJzb25hbGl0eScsIGdyb3VwOiAnUGVyc29uYWxpemF0aW9uJyB9XSxcblx0XHR9XSk7XG5cblx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyBjb2RleFVzYWdlU291cmNlOiAnb3BlbmFpJyB9LFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9LCB7IGNsaWVudElkOiAncmVuZGVyZXItMScsIGNsaWVudFNlcTogMSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuY29uZmlnPy52YWx1ZXMsIHtcblx0XHRcdGNvZGV4VXNhZ2VTb3VyY2U6ICdvcGVuYWknLFxuXHRcdFx0J2NvZGV4LnBlcnNvbmFsaXR5JzogJ2ZyaWVuZGx5Jyxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudmVsb3Blc1swXS5hY3Rpb24sIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0Y29kZXhVc2FnZVNvdXJjZTogJ29wZW5haScsXG5cdFx0XHRcdCdjb2RleC5wZXJzb25hbGl0eSc6ICdmcmllbmRseScsXG5cdFx0XHR9LFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBjbGVhcnMgc3RhdGUgd2l0aG91dCBub3RpZmljYXRpb24nLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0bWFuYWdlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldFNuYXBzaG90KHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gY2xlYXJzIHN0YXRlIGFuZCBlbWl0cyBub3RpZmljYXRpb24nLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0bWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldFNuYXBzaG90KHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbnNbMF0udHlwZSwgTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uUmVtb3ZlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVNlc3Npb24gZW1pdHMgc2Vzc2lvbkFkZGVkIG5vdGlmaWNhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zWzBdLnR5cGUsIE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvbkFkZGVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGVmYXVsdCBjaGF0IGluaGVyaXRzIHRoZSBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5IHJlc29sdmVkIGF0IG1hdGVyaWFsaXphdGlvbicsICgpID0+IHtcblx0XHQvLyBBIGRlZmVycmVkIChwcm92aXNpb25hbCkgc2Vzc2lvbiBpcyBjcmVhdGVkIHdpdGggYSBwcmUtbWF0ZXJpYWxpemF0aW9uXG5cdFx0Ly8gd29ya2luZyBkaXJlY3Rvcnk7IG1hdGVyaWFsaXphdGlvbiBsYXRlciByZXNvbHZlcyBpdCB0byBhIGRpZmZlcmVudFxuXHRcdC8vIG9uZSAoZS5nLiBhIGdpdCB3b3JrdHJlZSkgdmlhIG1hcmtTZXNzaW9uUGVyc2lzdGVkLiBUaGUgZGVmYXVsdCBjaGF0XG5cdFx0Ly8gaGFzIG5vIHBlci1jaGF0IHdvcmtpbmctZGlyZWN0b3J5IG92ZXJyaWRlLCBzbyBnZXRTZXNzaW9uU3RhdGUgbXVzdFxuXHRcdC8vIHByb2plY3QgdGhlIFJFU09MVkVEIHNlc3Npb24gd29ya2luZyBkaXJlY3RvcnksIG5ldmVyIHRoZSBzdGFsZVxuXHRcdC8vIGNyZWF0ZS10aW1lIHZhbHVlIHRoYXQgd2FzIHNlZWRlZCBvbnRvIHRoZSBkZWZhdWx0IGNoYXQuXG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKHsgLi4ubWFrZVNlc3Npb25TdW1tYXJ5KCksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3Byb3Zpc2lvbmFsJ10gfSwgeyBlbWl0Tm90aWZpY2F0aW9uOiBmYWxzZSB9KTtcblx0XHRtYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb25VcmksIHsgLi4ubWFrZVNlc3Npb25TdW1tYXJ5KCksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3Jlc29sdmVkLXdvcmt0cmVlJ10gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb246IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSxcblx0XHRcdGRlZmF1bHRDaGF0OiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uQ2hhdFVyaSk/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdH0sIHtcblx0XHRcdHNlc3Npb246ICdmaWxlOi8vL3Jlc29sdmVkLXdvcmt0cmVlJyxcblx0XHRcdGRlZmF1bHRDaGF0OiAnZmlsZTovLy9yZXNvbHZlZC13b3JrdHJlZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVR1cm5JZCByZXR1cm5zIGFjdGl2ZSB0dXJuIGlkIGFmdGVyIHR1cm5TdGFydGVkJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpKSwgdW5kZWZpbmVkKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpKSwgJ3R1cm4tMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb290IHN0YXRlIHN0YXJ0cyB3aXRoIGFjdGl2ZVNlc3Npb25zOiAwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbWFuYWdlci5nZXRTbmFwc2hvdChST09UX1NUQVRFX1VSSSk7XG5cdFx0YXNzZXJ0Lm9rKHNuYXBzaG90KTtcblx0XHRjb25zdCByb290ID0gc25hcHNob3Quc3RhdGUgYXMgeyBhZ2VudHM6IHVua25vd25bXTsgYWN0aXZlU2Vzc2lvbnM6IG51bWJlciB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm9vdC5hZ2VudHMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5hY3RpdmVTZXNzaW9ucywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm5TdGFydGVkIGRpc3BhdGNoZXMgcm9vdC9hY3RpdmVTZXNzaW9uc0NoYW5nZWQgd2l0aCBjb3JyZWN0IGNvdW50JywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYWN0aXZlQ2hhbmdlZFswXS5hY3Rpb24gYXMgeyBhY3RpdmVTZXNzaW9uczogbnVtYmVyIH0pLmFjdGl2ZVNlc3Npb25zLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuQ29tcGxldGUgZGlzcGF0Y2hlcyByb290L2FjdGl2ZVNlc3Npb25zQ2hhbmdlZCBiYWNrIHRvIDAnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYWN0aXZlQ2hhbmdlZFswXS5hY3Rpb24gYXMgeyBhY3RpdmVTZXNzaW9uczogbnVtYmVyIH0pLmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmVTZXNzaW9ucyByZWZsZWN0cyBjb25jdXJyZW50IHR1cm4gY291bnQgYWNyb3NzIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24yVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy90ZXN0LXNlc3Npb24tMicgfSkudG9TdHJpbmcoKTtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkpKTtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KHNlc3Npb24yVXJpKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24yVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uMlVyaSksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdiJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucywgMik7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLCAxKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uMlVyaSksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVTZXNzaW9uIGRlY3JlbWVudHMgYWN0aXZlIHNlc3Npb25zIHdoZW4gYW4gYWN0aXZlIHR1cm4gaXMgc3RyYW5kZWQnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDEpO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0Ly8gRXZpY3QgdGhlIHNlc3Npb24gd2hpbGUgYSB0dXJuIGlzIHN0aWxsIGFjdGl2ZS4gVGhlIGFjdGl2ZS1zZXNzaW9uc1xuXHRcdC8vIGNvdW50IG11c3QgZHJvcCB0byB6ZXJvIHNvIHRoYXQgdGhlIHNlcnZlciBsaWZldGltZSB0cmFja2VyIChkcml2aW5nXG5cdFx0Ly8gYC0tZW5hYmxlLXJlbW90ZS1hdXRvLXNodXRkb3duYCkgcmVsZWFzZXMgaXRzIGhvbGQuXG5cdFx0bWFuYWdlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0XHRjb25zdCBhY3RpdmVDaGFuZ2VkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUNoYW5nZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGFjdGl2ZUNoYW5nZWRbMF0uYWN0aW9uIGFzIHsgYWN0aXZlU2Vzc2lvbnM6IG51bWJlciB9KS5hY3RpdmVTZXNzaW9ucywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVNlc3Npb24gZG9lcyBub3QgZGlzcGF0Y2ggYWN0aXZlLXNlc3Npb25zIGNoYW5nZSB3aGVuIG5vIHR1cm4gaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uVXJpKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFsZSBDaGF0VHVybkNvbXBsZXRlICh3cm9uZyB0dXJuSWQpIGRvZXMgbm90IGRlY3JlbWVudCBhY3RpdmUgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHJlZHVjZXIncyBgZW5kVHVybmAgbm8tb3BzIHdoZW4gdGhlIGFjdGlvbidzIHR1cm5JZCBkb2Vzbid0IG1hdGNoXG5cdFx0Ly8gYHN0YXRlLmFjdGl2ZVR1cm4uaWRgLiBUaGUgYWN0aXZlLXNlc3Npb24gY291bnQgbXVzdCBmb2xsb3cgc3VpdCBzb1xuXHRcdC8vIHRoZSBsaWZldGltZSB0cmFja2VyIGRvZXNuJ3QgcmVsZWFzZSBpdHMgaG9sZCB3aGlsZSBhIHR1cm4gaXMgc3RpbGxcblx0XHQvLyBnZW51aW5lbHkgcnVubmluZy5cblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucywgMSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICdzdGFsZS10dXJuJyxcblx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oYXNBY3RpdmVTZXNzaW9ucywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmN1cnJlbnQgQ2hhdFR1cm5TdGFydGVkIG9uIHNhbWUgc2Vzc2lvbiBrZWVwcyBhY3RpdmUgY291bnQgYXQgb25lJywgKCkgPT4ge1xuXHRcdC8vIFRoZSByZWR1Y2VyIHVuY29uZGl0aW9uYWxseSBvdmVyd3JpdGVzIGBhY3RpdmVUdXJuYCwgc28gdHdvIHN0YXJ0c1xuXHRcdC8vIHdpdGhvdXQgYW4gaW50ZXJ2ZW5pbmcgY29tcGxldGUgc3RpbGwgcmVwcmVzZW50IGEgc2luZ2xlIGFjdGl2ZSB0dXJuXG5cdFx0Ly8gZnJvbSBzdGF0ZSdzIHBvaW50IG9mIHZpZXcuIFRoZSBjb3VudCBtdXN0IG1pcnJvciB0aGF0LlxuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucywgMSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhhc0FjdGl2ZVNlc3Npb25zLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZSB0dXJuIGV2ZW50IGZvbGxvd3MgcmVkdWNlci1kZXJpdmVkIGFjdGl2ZSBzdGF0ZSB0cmFuc2l0aW9ucycsICgpID0+IHtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0Y29uc3QgZXZlbnRzOiBBcnJheTx7IHNlc3Npb246IHN0cmluZzsgYWN0aXZlOiBib29sZWFuIH0+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybihlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0dHVybklkOiAnc3RhbGUtdHVybicsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2ZhaWxlZCcsIG1lc3NhZ2U6ICdib29tJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtcblx0XHRcdHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0XHR7IHNlc3Npb246IHNlc3Npb25VcmksIGFjdGl2ZTogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlIHR1cm4gZXZlbnQgY292ZXJzIGNhbmNlbGxhdGlvbiBhbmQgcmVtb3ZhbCB3aGlsZSBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbjJVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3Rlc3Qtc2Vzc2lvbi0yJyB9KS50b1N0cmluZygpO1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaSkpO1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoc2Vzc2lvbjJVcmkpKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbjJVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdGNvbnN0IGV2ZW50czogQXJyYXk8eyBzZXNzaW9uOiBzdHJpbmc7IGFjdGl2ZTogYm9vbGVhbiB9PiA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4oZSA9PiBldmVudHMucHVzaChlKSkpO1xuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24yVXJpKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uMlVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW1xuXHRcdFx0eyBzZXNzaW9uOiBzZXNzaW9uVXJpLCBhY3RpdmU6IHRydWUgfSxcblx0XHRcdHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgYWN0aXZlOiBmYWxzZSB9LFxuXHRcdFx0eyBzZXNzaW9uOiBzZXNzaW9uMlVyaSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0XHR7IHNlc3Npb246IHNlc3Npb24yVXJpLCBhY3RpdmU6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTZXNzaW9uIGNyZWF0ZXMgc2Vzc2lvbiBpbiBSZWFkeSBzdGF0ZSB3aXRoIHByZS1wb3B1bGF0ZWQgdHVybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncDEnLCBjb250ZW50OiAnd29ybGQnIH0gc2F0aXNmaWVzIE1hcmtkb3duUmVzcG9uc2VQYXJ0XSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgdHVybnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuUmVhZHkpO1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IG1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFN0YXRlPy50dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0U3RhdGU/LnR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChjaGF0U3RhdGU/LnR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgTWFya2Rvd25SZXNwb25zZVBhcnQpLmNvbnRlbnQsICd3b3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlU2Vzc2lvbiByZXR1cm5zIGV4aXN0aW5nIHN0YXRlIGZvciBkdXBsaWNhdGUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUsIGV4aXN0aW5nKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVNlc3Npb24gZG9lcyBub3QgZW1pdCBzZXNzaW9uQWRkZWQgbm90aWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwLCAnc2hvdWxkIG5vdCBlbWl0IG5vdGlmaWNhdGlvbiBmb3IgcmVzdG9yZWQgc2Vzc2lvbnMnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc2Vzc2lvblN1bW1hcnlDaGFuZ2VkIHdoZW4gc3VtbWFyeSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ05ldyBUaXRsZScgfSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgZmlyZSBzeW5jaHJvbm91c2x5IChkZWJvdW5jZWQpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9ucy5maWx0ZXIobiA9PiBuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKS5sZW5ndGgsIDApO1xuXG5cdFx0XHQvLyBBZHZhbmNlIHBhc3QgZGVib3VuY2Vcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gY2hhbmdlZFswXSBhcyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLnNlc3Npb24sIHNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbi5jaGFuZ2VzLnRpdGxlLCAnTmV3IFRpdGxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLmNoYW5nZXMuc3RhdHVzLCB1bmRlZmluZWQsICd1bmNoYW5nZWQgZmllbGRzIHNob3VsZCBiZSBvbWl0dGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvYWxlc2NlcyBtdWx0aXBsZSBzdW1tYXJ5IGNoYW5nZXMgaW50byBvbmUgbm90aWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ0ZpcnN0JyB9KTtcblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnU2Vjb25kJyB9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDE1MCkpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gbm90aWZpY2F0aW9ucy5maWx0ZXIobiA9PiBuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSwgJ3Nob3VsZCBjb2FsZXNjZSBpbnRvIG9uZSBub3RpZmljYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoY2hhbmdlZFswXSBhcyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXMpLmNoYW5nZXMudGl0bGUsICdTZWNvbmQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZW1pdCBzZXNzaW9uU3VtbWFyeUNoYW5nZWQgd2hlbiBzdW1tYXJ5IGlzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdFx0Ly8gU2Vzc2lvblJlYWR5IGNoYW5nZXMgbGlmZWN5Y2xlLCBub3Qgc3VtbWFyeSBcdTIwMTQgc28gbm8gc3VtbWFyeSBub3RpZmljYXRpb25cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IHNlc3Npb25TdW1tYXJ5Q2hhbmdlZCBmb3IgZGVsZXRlZCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ05ldyBUaXRsZScgfSk7XG5cdFx0XHRtYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDAsICdzaG91bGQgbm90IGVtaXQgZm9yIGRlbGV0ZWQgc2Vzc2lvbnMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBmbHVzaGVzIHBlbmRpbmcgc3RhdHVzPUlkbGUgbm90aWZpY2F0aW9uIGJlZm9yZSBldmljdGlvbicsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB3aGVuIF9tYXliZUV2aWN0SWRsZVNlc3Npb24gY2FsbHMgcmVtb3ZlU2Vzc2lvbiB3aXRoaW4gdGhlXG5cdFx0Ly8gMTAwIG1zIHNjaGVkdWxlciB3aW5kb3cgYWZ0ZXIgYSB0dXJuIGNvbXBsZXRlcywgdGhlIGNsaWVudCBtdXN0IHN0aWxsXG5cdFx0Ly8gcmVjZWl2ZSBhIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZCB3aXRoIHN0YXR1cz1JZGxlIHNvIHRoZSBzcGlubmVyIGNsZWFycy5cblx0XHQvL1xuXHRcdC8vIFRoZSBrZXkgcHJlY29uZGl0aW9uIGlzIHRoYXQgX2xhc3ROb3RpZmllZFN1bW1hcmllcyBhbHJlYWR5IGhhc1xuXHRcdC8vIHN0YXR1cz1JblByb2dyZXNzICh0aGUgc2NoZWR1bGVyIG11c3QgaGF2ZSBmaXJlZCBhZnRlciBUdXJuU3RhcnRlZCBzb1xuXHRcdC8vIHRoZSBjbGllbnQga25vd3MgdGhlIHNlc3Npb24gaXMgYnVzeSkuIFRoZW4gVHVybkNvbXBsZXRlIGZsaXBzIHRoZVxuXHRcdC8vIHN1bW1hcnkgYmFjayB0byBJZGxlIGFuZCBzY2hlZHVsZXMgYW5vdGhlciBmbHVzaC4gSWYgcmVtb3ZlU2Vzc2lvblxuXHRcdC8vIHJhY2VzIHdpdGggdGhhdCAxMDAgbXMgd2luZG93IHRoZSBmbHVzaCBtdXN0IGhhcHBlbiBzeW5jaHJvbm91c2x5LlxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHQvLyBTdGFydCBhIHR1cm4gXHUyMTkyIHN0YXR1cyBiZWNvbWVzIEluUHJvZ3Jlc3MuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBMZXQgdGhlIHNjaGVkdWxlciBmaXJlIHNvIF9sYXN0Tm90aWZpZWRTdW1tYXJpZXMgbm93IGhhcyBzdGF0dXM9SW5Qcm9ncmVzcy5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdFx0Ly8gVHVybiBjb21wbGV0ZXMgXHUyMDE0IHN0YXR1cyBmbGlwcyBiYWNrIHRvIElkbGUuIFRoaXMgc2NoZWR1bGVzIGEgc3VtbWFyeVxuXHRcdFx0Ly8gZmx1c2ggMTAwIG1zIGxhdGVyIGJ1dCB3ZSB3aWxsIGNhbGwgcmVtb3ZlU2Vzc2lvbiBiZWZvcmUgaXQgZmlyZXMuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgZXZpY3Rpb24gd2l0aGluIHRoZSAxMDAgbXMgZGVib3VuY2Ugd2luZG93LlxuXHRcdFx0bWFuYWdlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gbm90aWZpY2F0aW9ucy5maWx0ZXIobiA9PiBuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKSBhcyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXNbXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSwgJ3Nob3VsZCBlbWl0IFNlc3Npb25TdW1tYXJ5Q2hhbmdlZCBzeW5jaHJvbm91c2x5IGluIHJlbW92ZVNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkWzBdLmNoYW5nZXMuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklkbGUsICdzdGF0dXMgc2hvdWxkIGJlIElkbGUgc28gdGhlIHNwaW5uZXIgY2xlYXJzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdkaXNwb3NlQ2hhbmdlc2V0IGVtaXRzIENoYW5nZXNldENsZWFyZWQgYW5kIHJlbW92ZXMgdGhlIHN0YXRlJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gbWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0bWFuYWdlci5kaXNwb3NlQ2hhbmdlc2V0KGNoYW5nZXNldCk7XG5cblx0XHRjb25zdCBjbGVhcmVkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFyZWQubGVuZ3RoLCAxLCAnZXhwZWN0ZWQgZXhhY3RseSBvbmUgY2xlYXJlZCBlbnZlbG9wZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhcmVkWzBdLmNoYW5uZWwsIGNoYW5nZXNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KSwgdW5kZWZpbmVkLCAnc3RhdGUgc2hvdWxkIGJlIGRlbGV0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJvZHVjZXItZW1pdHRlZCBDaGFuZ2VzZXRDbGVhcmVkIGtlZXBzIHRoZSBzdGF0ZSBhbGl2ZSAocmVjb21wdXRlIHBhdGgpJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gbWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy9hLnRzJyxcblx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KT8uZmlsZXMubGVuZ3RoLCAxKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldENsZWFyZWQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhZnRlciA9IG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KTtcblx0XHRhc3NlcnQub2soYWZ0ZXIsICdzdGF0ZSBzaG91bGQgc3RpbGwgZXhpc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWZ0ZXIuZmlsZXMubGVuZ3RoLCAwLCAnZmlsZXMgc2hvdWxkIGJlIGNsZWFyZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBkb2VzIE5PVCBkaXNwb3NlIHBlci1zZXNzaW9uIGNoYW5nZXNldHMgKExSVSBldmljdGlvbiBtdXN0IG5vdCBjbGVhciBsaXN0LXZpZXcgY2hpcCknLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogX21heWJlRXZpY3RJZGxlU2Vzc2lvbiBjYWxscyByZW1vdmVTZXNzaW9uIHRvIGRyb3AgYW5cblx0XHQvLyBpZGxlIHNlc3Npb24gZnJvbSB0aGUgaW4tbWVtb3J5IGNhY2hlLiBUaGUgQWdlbnRzIFdpbmRvdyBsaXN0IHZpZXdcblx0XHQvLyBrZWVwcyBhIHBlci1yb3cgY2hhbmdlc2V0IHN1YnNjcmlwdGlvbiBvcGVuIHRvIHJlbmRlciB0aGUgZGlmZlxuXHRcdC8vIGNoaXAsIHNvIGNhc2NhZGluZyBkaXNwb3NlU2Vzc2lvbkNoYW5nZXNldHMgaGVyZSB3b3VsZCBlbWl0IGFcblx0XHQvLyBDaGFuZ2VzZXRDbGVhcmVkIGVudmVsb3BlIHRoYXQgZW1wdGllcyB0aGUgY2hpcCB3aGlsZSB0aGUgcm93IGlzXG5cdFx0Ly8gc3RpbGwgb24gc2NyZWVuLiBUaGUgY2hpcCB0aGVuIHZpc2libHkgdmFuaXNoZXMgYW5kIG9ubHkgcmVhcHBlYXJzXG5cdFx0Ly8gd2hlbiB0aGUgdXNlciBjbGlja3MgYmFjayBpbnRvIHRoZSBzZXNzaW9uIGFuZCB0aGUgbGlzdCByZS1zZWVkc1xuXHRcdC8vIHRoZSBjaGFuZ2VzZXQuXG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBtYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXQsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL2EudHMnLFxuXHRcdFx0XHRlZGl0OiB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9hLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uVXJpKTtcblxuXHRcdGNvbnN0IGNsZWFyZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRDbGVhcmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZC5sZW5ndGgsIDAsICdyZW1vdmVTZXNzaW9uIG11c3Qgbm90IGVtaXQgQ2hhbmdlc2V0Q2xlYXJlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldCk/LmZpbGVzLmxlbmd0aCwgMSwgJ2NoYW5nZXNldCBzdGF0ZSBzaG91bGQgc3Vydml2ZSBldmljdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIGRpc3Bvc2VzIHBlci1zZXNzaW9uIGNoYW5nZXNldHMgYmVmb3JlIGVtaXR0aW5nIFNlc3Npb25SZW1vdmVkJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gbWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy9hLnRzJyxcblx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0Tm90aWZpY2F0aW9uKG4gPT4gbm90aWZpY2F0aW9ucy5wdXNoKG4pKSk7XG5cblx0XHRtYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cblx0XHRjb25zdCBjbGVhcmVkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZC5sZW5ndGgsIDEsICdkZWxldGVTZXNzaW9uIHNob3VsZCBlbWl0IENoYW5nZXNldENsZWFyZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZC5sZW5ndGgsIDEsICdkZWxldGVTZXNzaW9uIHNob3VsZCBlbWl0IFNlc3Npb25SZW1vdmVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KSwgdW5kZWZpbmVkLCAnY2hhbmdlc2V0IHN0YXRlIHNob3VsZCBiZSBnb25lIGFmdGVyIGRlbGV0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIGNoYW5nZXNldCBhY3Rpb24gaXMgaWdub3JlZCB3aXRob3V0IGVtaXR0aW5nIGFuIGVudmVsb3BlJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L21pc3NpbmdgO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdGNvbnN0IHNlcUJlZm9yZSA9IG1hbmFnZXIuc2VydmVyU2VxO1xuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3gudHMnLFxuXHRcdFx0XHRlZGl0OiB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8veC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy94LnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZW52ZWxvcGVDb3VudDogZW52ZWxvcGVzLmxlbmd0aCxcblx0XHRcdFx0c2VxQWR2YW5jZWQ6IG1hbmFnZXIuc2VydmVyU2VxIC0gc2VxQmVmb3JlLFxuXHRcdFx0XHRjaGFuZ2VzZXRTdGF0ZTogbWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmkpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZW52ZWxvcGVDb3VudDogMCxcblx0XHRcdFx0c2VxQWR2YW5jZWQ6IDAsXG5cdFx0XHRcdGNoYW5nZXNldFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHQvLyBTYW5pdHk6IHJlZ2lzdGVyaW5nIHRoZSBzYW1lIFVSSSBhbmQgcmUtZGlzcGF0Y2hpbmcgcHJvZHVjZXMgYW5cblx0XHQvLyBlbnZlbG9wZSBhbmQgYWR2YW5jZXMgdGhlIHNlcSwgcHJvdmluZyB0aGUgZWFybHkgcmV0dXJuIGRvZXNuJ3Rcblx0XHQvLyBicmVhayB2YWxpZCBjaGFuZ2VzZXRzLlxuXHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBtYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmksICdtaXNzaW5nJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RlcmVkLCBjaGFuZ2VzZXRVcmkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy94LnRzJyxcblx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3gudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8veC50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMSwgJ3JlZ2lzdGVyZWQgY2hhbmdlc2V0IGFjdGlvbiBzaG91bGQgZW1pdCBhbiBlbnZlbG9wZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnNlcnZlclNlcSAtIHNlcUJlZm9yZSwgMSwgJ3NlcnZlclNlcSBzaG91bGQgYWR2YW5jZSBmb3IgcmVnaXN0ZXJlZCBjaGFuZ2VzZXQgYWN0aW9uJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aS1jaGF0IGNhdGFsb2cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0dGVzdCgnYWRkQ2hhdCBncm93cyB0aGUgY2F0YWxvZywgY3JlYXRlcyBjaGF0IHN0YXRlIGFuZCBlbWl0cyBTZXNzaW9uQ2hhdEFkZGVkJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZGRlZFRpdGxlOiBzdW1tYXJ5Py50aXRsZSxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKS5zb3J0KCksXG5cdFx0XHRcdFx0cGVlclR1cm5zOiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCk/LnR1cm5zLmxlbmd0aCxcblx0XHRcdFx0XHRjaGF0QWRkZWRFdmVudHM6IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQpLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFkZGVkVGl0bGU6ICdQZWVyJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBbYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgcGVlckNoYXRdLnNvcnQoKSxcblx0XHRcdFx0XHRwZWVyVHVybnM6IDAsXG5cdFx0XHRcdFx0Y2hhdEFkZGVkRXZlbnRzOiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUNoYXQgc2hyaW5rcyB0aGUgY2F0YWxvZyBhbmQgcmVmdXNlcyB0aGUgZGVmYXVsdCBjaGF0JywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCk7XG5cblx0XHRcdG1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uVXJpLCBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdGNvbnN0IGFmdGVyRGVmYXVsdFJlbW92YWwgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubGVuZ3RoO1xuXG5cdFx0XHRtYW5hZ2VyLnJlbW92ZUNoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWZ0ZXJEZWZhdWx0UmVtb3ZhbCxcblx0XHRcdFx0XHRhZnRlclBlZXJSZW1vdmFsOiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRwZWVyU3RhdGU6IG1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHBlZXJDaGF0KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFmdGVyRGVmYXVsdFJlbW92YWw6IDIsXG5cdFx0XHRcdFx0YWZ0ZXJQZWVyUmVtb3ZhbDogW2J1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSldLFxuXHRcdFx0XHRcdHBlZXJTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24gdGl0bGUgYW5kIGRlZmF1bHQgY2hhdCB0aXRsZSBzdGF5IGluZGVwZW5kZW50IG9uY2UgbXVsdGktY2hhdCcsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIEJlY29taW5nIG11bHRpLWNoYXQgc25hcHNob3RzIHRoZSBzZXNzaW9uIHRpdGxlIG9udG8gdGhlIGRlZmF1bHQgY2hhdFxuXHRcdFx0Ly8gc28gaXQgc3RvcHMgaW5oZXJpdGluZyB0aGUgc2Vzc2lvbiB0aXRsZS5cblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCk7XG5cdFx0XHRjb25zdCBhZnRlckFkZCA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gZGVmYXVsdENoYXQpPy50aXRsZTtcblxuXHRcdFx0Ly8gUmVuYW1lIGVhY2ggaW5kZXBlbmRlbnRseS5cblx0XHRcdG1hbmFnZXIudXBkYXRlQ2hhdFRpdGxlKHNlc3Npb25VcmksIGRlZmF1bHRDaGF0LCAnQ2hhdCBBJyk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1Nlc3Npb24gQicgfSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWZ0ZXJBZGQsXG5cdFx0XHRcdFx0c2Vzc2lvblRpdGxlOiBzdGF0ZT8udGl0bGUsXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUaXRsZTogc3RhdGU/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBkZWZhdWx0Q2hhdCk/LnRpdGxlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWZ0ZXJBZGQ6ICdUZXN0Jyxcblx0XHRcdFx0XHRzZXNzaW9uVGl0bGU6ICdTZXNzaW9uIEInLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0VGl0bGU6ICdDaGF0IEEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZENoYXQgaXMgaWRlbXBvdGVudCBmb3IgYW4gZXhpc3RpbmcgY2hhdCBVUkknLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IHNlY29uZCA9IG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ0lnbm9yZWQnIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZVN1bW1hcnk6IGZpcnN0ID09PSBzZWNvbmQsXG5cdFx0XHRcdFx0dGl0bGU6IHNlY29uZD8udGl0bGUsXG5cdFx0XHRcdFx0Y2hhdENvdW50OiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubGVuZ3RoLFxuXHRcdFx0XHRcdGNoYXRBZGRlZEV2ZW50czogZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRBZGRlZCkubGVuZ3RoLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZVN1bW1hcnk6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6ICdQZWVyJyxcblx0XHRcdFx0XHRjaGF0Q291bnQ6IDIsXG5cdFx0XHRcdFx0Y2hhdEFkZGVkRXZlbnRzOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZENoYXQgZm9yIGFuIHVua25vd24gc2Vzc2lvbiBpcyBhIG5vLW9wJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBtYW5hZ2VyLmFkZENoYXQoJ2NvcGlsb3Q6L21pc3NpbmcnLCBwZWVyQ2hhdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdW1tYXJ5LFxuXHRcdFx0XHRcdGV2ZW50czogZW52ZWxvcGVzLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHN1bW1hcnk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRldmVudHM6IDAsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkQ2hhdCBzdXBwb3J0cyBtdWx0aXBsZSBwZWVycyBhbmQgb25seSBzbmFwc2hvdHMgdGhlIGRlZmF1bHQgdGl0bGUgb25jZScsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdDIgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMicpO1xuXG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXHRcdFx0Ly8gUmVuYW1lIHRoZSBkZWZhdWx0IGNoYXQgYXdheSBmcm9tIHRoZSBzbmFwc2hvdHRlZCBzZXNzaW9uIHRpdGxlLlxuXHRcdFx0bWFuYWdlci51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvblVyaSwgZGVmYXVsdENoYXQsICdSZW5hbWVkIERlZmF1bHQnKTtcblx0XHRcdC8vIEFkZGluZyBhIHNlY29uZCBwZWVyIG11c3Qgbm90IHJlLXNuYXBzaG90IC8gY2xvYmJlciB0aGUgZGVmYXVsdCB0aXRsZS5cblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdDIpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZXM6IHN0YXRlPy5jaGF0cy5tYXAoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkpLnNvcnQoKSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiBzdGF0ZT8uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IGRlZmF1bHRDaGF0KT8udGl0bGUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBbZGVmYXVsdENoYXQsIHBlZXJDaGF0LCBwZWVyQ2hhdDJdLnNvcnQoKSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiAnUmVuYW1lZCBEZWZhdWx0Jyxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVDaGF0VGl0bGUgb24gYSBwZWVyIGxlYXZlcyB0aGUgc2Vzc2lvbiBhbmQgZGVmYXVsdCB0aXRsZXMgdW50b3VjaGVkJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ1BlZXInIH0pO1xuXG5cdFx0XHRtYW5hZ2VyLnVwZGF0ZUNoYXRUaXRsZShzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgJ1BlZXIgUmVuYW1lZCcpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNlc3Npb25UaXRsZTogc3RhdGU/LnRpdGxlLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0VGl0bGU6IHN0YXRlPy5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gZGVmYXVsdENoYXQpPy50aXRsZSxcblx0XHRcdFx0XHRwZWVyVGl0bGU6IHN0YXRlPy5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gcGVlckNoYXQpPy50aXRsZSxcblx0XHRcdFx0XHRwZWVyU3RhdGVUaXRsZTogbWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpPy50aXRsZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNlc3Npb25UaXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0VGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0XHRwZWVyVGl0bGU6ICdQZWVyIFJlbmFtZWQnLFxuXHRcdFx0XHRcdHBlZXJTdGF0ZVRpdGxlOiAnUGVlciBSZW5hbWVkJyxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVDaGF0IG9mIGFuIHVua25vd24gY2hhdCBpcyBhIG5vLW9wJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdG1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uVXJpLCBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ25ldmVyLWFkZGVkJykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2hhdENvdW50OiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubGVuZ3RoLFxuXHRcdFx0XHRcdHJlbW92ZWRFdmVudHM6IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0UmVtb3ZlZCkubGVuZ3RoLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2hhdENvdW50OiAxLFxuXHRcdFx0XHRcdHJlbW92ZWRFdmVudHM6IDAsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlQ2hhdCBlbWl0cyBTZXNzaW9uQ2hhdFJlbW92ZWQgZm9yIGEgcGVlcicsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0bWFuYWdlci5yZW1vdmVDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlbW92ZWQ6IGVudmVsb3Blc1xuXHRcdFx0XHRcdFx0LmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRSZW1vdmVkKVxuXHRcdFx0XHRcdFx0Lm1hcChlID0+IChlLmFjdGlvbiBhcyB7IGNoYXQ6IHN0cmluZyB9KS5jaGF0KSxcblx0XHRcdFx0XHRjaGF0U3RhdGU6IG1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHBlZXJDaGF0KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlbW92ZWQ6IFtwZWVyQ2hhdF0sXG5cdFx0XHRcdFx0Y2hhdFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFzQWN0aXZlVHVybiByZWZsZWN0cyBhIGNoYXQgdHVybiBsaWZlY3ljbGUnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXG5cdFx0XHRjb25zdCBpZGxlID0gbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlclN0YXJ0ID0gbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFmdGVyQ29tcGxldGUgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgaWRsZSwgYWZ0ZXJTdGFydCwgYWZ0ZXJDb21wbGV0ZSB9LFxuXHRcdFx0XHR7IGlkbGU6IGZhbHNlLCBhZnRlclN0YXJ0OiB0cnVlLCBhZnRlckNvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjdGl2ZS10dXJuIGV2ZW50IG9ic2VydmVycyBzZWUgdGhlIHVwZGF0ZWQgYWN0aXZlLXR1cm4gc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHQvLyBPcGVyYXRpb25zIGFyZSByZWNvbXB1dGVkIHN5bmNocm9ub3VzbHkgZnJvbSB0aGUgYWN0aXZlLXR1cm4gZXZlbnQsXG5cdFx0XHQvLyBzbyBoYXNBY3RpdmVUdXJuIG11c3QgYWxyZWFkeSByZWZsZWN0IHRoZSBsaWZlY3ljbGUgY2hhbmdlIHdoZW4gdGhhdFxuXHRcdFx0Ly8gZXZlbnQgZmlyZXMgXHUyMDE0IG90aGVyd2lzZSBvcGVyYXRpb25zIHdvdWxkIHN0YXkgZGlzYWJsZWQgYXQgdHVybiBlbmQuXG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXG5cdFx0XHRjb25zdCBvYnNlcnZlZDogeyBhY3RpdmU6IGJvb2xlYW47IGhhc0FjdGl2ZVR1cm46IGJvb2xlYW4gfVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuKGUgPT4ge1xuXHRcdFx0XHRvYnNlcnZlZC5wdXNoKHsgYWN0aXZlOiBlLmFjdGl2ZSwgaGFzQWN0aXZlVHVybjogbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpIH0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvYnNlcnZlZCwgW1xuXHRcdFx0XHR7IGFjdGl2ZTogdHJ1ZSwgaGFzQWN0aXZlVHVybjogdHJ1ZSB9LFxuXHRcdFx0XHR7IGFjdGl2ZTogZmFsc2UsIGhhc0FjdGl2ZVR1cm46IGZhbHNlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhc0FjdGl2ZVR1cm4gc3RheXMgdHJ1ZSB1bnRpbCBhbGwgY29uY3VycmVudCBjaGF0IHR1cm5zIGZpbmlzaCcsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgaWRsZSA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0Ly8gU3RhcnQgYSB0dXJuIG9uIHRoZSBkZWZhdWx0IGNoYXQsIHRoZW4gYSBjb25jdXJyZW50IHR1cm4gb24gdGhlIHBlZXIuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlckRlZmF1bHRTdGFydCA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWZ0ZXJCb3RoU3RhcnQgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIENvbXBsZXRpbmcgdGhlIGRlZmF1bHQgY2hhdCBtdXN0IE5PVCBjbGVhciB3aGlsZSB0aGUgcGVlciBzdHJlYW1zLlxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tZGVmYXVsdCcsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlckRlZmF1bHRDb21wbGV0ZSA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0Ly8gT25seSBvbmNlIHRoZSBwZWVyIGZpbmlzaGVzIHRvbyBkb2VzIHRoZSBzZXNzaW9uIGdvIGlkbGUuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFmdGVyQm90aENvbXBsZXRlID0gbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IGlkbGUsIGFmdGVyRGVmYXVsdFN0YXJ0LCBhZnRlckJvdGhTdGFydCwgYWZ0ZXJEZWZhdWx0Q29tcGxldGUsIGFmdGVyQm90aENvbXBsZXRlIH0sXG5cdFx0XHRcdHsgaWRsZTogZmFsc2UsIGFmdGVyRGVmYXVsdFN0YXJ0OiB0cnVlLCBhZnRlckJvdGhTdGFydDogdHJ1ZSwgYWZ0ZXJEZWZhdWx0Q29tcGxldGU6IHRydWUsIGFmdGVyQm90aENvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgcnVubmluZyBwZWVyIGNoYXQgcHJvbW90ZXMgdGhlIHNlc3Npb24gc3VtbWFyeSB0byBJblByb2dyZXNzIHdoaWxlIHRoZSBkZWZhdWx0IGNoYXQgaXMgaWRsZScsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgaWRsZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5zdGF0dXM7XG5cblx0XHRcdC8vIE9ubHkgdGhlIHBlZXIgKHN1YikgY2hhdCBzdGFydHMgc3RyZWFtaW5nOyB0aGUgZGVmYXVsdCBjaGF0IHN0YXlzIGlkbGUuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdiJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB3aGlsZVBlZXJSdW5zID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LnN0YXR1cztcblxuXHRcdFx0Ly8gT25jZSB0aGUgcGVlciBmaW5pc2hlcyB0aGUgc2Vzc2lvbiBmYWxscyBiYWNrIHRvIGlkbGUuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFmdGVyUGVlckNvbXBsZXRlID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LnN0YXR1cztcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkbGVIYXNJblByb2dyZXNzOiAoKGlkbGUgPz8gMCkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0d2hpbGVQZWVyUnVuc0hhc0luUHJvZ3Jlc3M6ICgod2hpbGVQZWVyUnVucyA/PyAwKSAmIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0XHRhZnRlclBlZXJDb21wbGV0ZUhhc0luUHJvZ3Jlc3M6ICgoYWZ0ZXJQZWVyQ29tcGxldGUgPz8gMCkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRTdGlsbElkbGU6ICgobWFuYWdlci5nZXRDaGF0U3RhdGUoZGVmYXVsdENoYXQpPy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JZGxlKSAmIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykgPT09IDAsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGxlSGFzSW5Qcm9ncmVzczogZmFsc2UsXG5cdFx0XHRcdFx0d2hpbGVQZWVyUnVuc0hhc0luUHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHRcdFx0YWZ0ZXJQZWVyQ29tcGxldGVIYXNJblByb2dyZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFN0aWxsSWRsZTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHJ1bm5pbmcgcGVlciBjaGF0IGZvcndhcmRzIGl0cyBvd24gc3RhdHVzIHRvIHRoZSBzZXNzaW9uIGNhdGFsb2cgc28gaXRzIHRhYiBjYW4gc2hvdyBwcm9ncmVzcycsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IHBlZXJDYXRhbG9nU3RhdHVzID0gKCkgPT4gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCk/LnN0YXR1cyA/PyBTZXNzaW9uU3RhdHVzLklkbGU7XG5cdFx0XHRjb25zdCBjaGF0VXBkYXRlc0ZvclBlZXIgPSAoKSA9PiBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdFVwZGF0ZWQgJiYgKGUuYWN0aW9uIGFzIHsgY2hhdDogc3RyaW5nIH0pLmNoYXQgPT09IHBlZXJDaGF0KS5sZW5ndGg7XG5cblx0XHRcdGNvbnN0IGlkbGVDYXRhbG9nID0gcGVlckNhdGFsb2dTdGF0dXMoKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcnVubmluZ0NhdGFsb2cgPSBwZWVyQ2F0YWxvZ1N0YXR1cygpO1xuXHRcdFx0Y29uc3QgdXBkYXRlc0FmdGVyU3RhcnQgPSBjaGF0VXBkYXRlc0ZvclBlZXIoKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGxlQ2F0YWxvZ0luUHJvZ3Jlc3M6IChpZGxlQ2F0YWxvZyAmIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0XHRydW5uaW5nQ2F0YWxvZ0luUHJvZ3Jlc3M6IChydW5uaW5nQ2F0YWxvZyAmIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0XHRmaW5hbENhdGFsb2dJblByb2dyZXNzOiAocGVlckNhdGFsb2dTdGF0dXMoKSAmIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0XHRlbWl0dGVkQ2hhdFVwZGF0ZU9uU3RhcnQ6IHVwZGF0ZXNBZnRlclN0YXJ0ID49IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGxlQ2F0YWxvZ0luUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHJ1bm5pbmdDYXRhbG9nSW5Qcm9ncmVzczogdHJ1ZSxcblx0XHRcdFx0XHRmaW5hbENhdGFsb2dJblByb2dyZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRlbWl0dGVkQ2hhdFVwZGF0ZU9uU3RhcnQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWN0aXZlLXR1cm4gZXZlbnQgYW5kIGFjdGl2ZS1zZXNzaW9uIGNvdW50IGZsaXAgb25jZSBwZXIgc2Vzc2lvbiBhY3Jvc3MgY29uY3VycmVudCBjaGF0cycsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgdHVybkV2ZW50czogYm9vbGVhbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuKGUgPT4gdHVybkV2ZW50cy5wdXNoKGUuYWN0aXZlKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdiJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhY3RpdmVXaGlsZUJvdGhSdW4gPSBtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucztcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tZGVmYXVsdCcsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhY3RpdmVBZnRlckZpcnN0Q29tcGxldGVzID0gbWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnM7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHVybkV2ZW50cyxcblx0XHRcdFx0XHRhY3RpdmVXaGlsZUJvdGhSdW4sXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJGaXJzdENvbXBsZXRlcyxcblx0XHRcdFx0XHRhY3RpdmVBZnRlckJvdGhDb21wbGV0ZTogbWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQvLyBFeGFjdGx5IG9uZSB0cnVlIChmaXJzdCBjaGF0IHN0YXJ0cykgYW5kIG9uZSBmYWxzZSAobGFzdCBjaGF0IGVuZHMpLlxuXHRcdFx0XHRcdHR1cm5FdmVudHM6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHRcdFx0YWN0aXZlV2hpbGVCb3RoUnVuOiAxLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyRmlyc3RDb21wbGV0ZXM6IDEsXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJCb3RoQ29tcGxldGU6IDAsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlQ2hhdCBjbGVhcnMgYSBwZWVyIGNoYXQgdGhhdCBpcyByZW1vdmVkIG1pZC10dXJuJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ1BlZXInIH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuRXZlbnRzOiBib29sZWFuW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4oZSA9PiB0dXJuRXZlbnRzLnB1c2goZS5hY3RpdmUpKSk7XG5cblx0XHRcdC8vIEJvdGggdGhlIGRlZmF1bHQgY2hhdCBhbmQgdGhlIHBlZXIgY2hhdCBzdGFydCBhIGNvbmN1cnJlbnQgdHVybi5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tZGVmYXVsdCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2EnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFjdGl2ZVdoaWxlQm90aFJ1biA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0Ly8gUmVtb3ZpbmcgdGhlIHBlZXIgbWlkLXR1cm4gbXVzdCBub3Qgc3RyYW5kIGl0IGluIHRoZSBhY3RpdmUgc2V0OlxuXHRcdFx0Ly8gdGhlIHNlc3Npb24gc3RheXMgYWN0aXZlIGJlY2F1c2UgdGhlIGRlZmF1bHQgY2hhdCBzdGlsbCBzdHJlYW1zLlxuXHRcdFx0bWFuYWdlci5yZW1vdmVDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblx0XHRcdGNvbnN0IGFjdGl2ZUFmdGVyUGVlclJlbW92ZWQgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIENvbXBsZXRpbmcgdGhlIGRlZmF1bHQgY2hhdCBpcyBub3cgZW5vdWdoIHRvIGZsaXAgdGhlIHNlc3Npb24gaWRsZS5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHVybkV2ZW50cyxcblx0XHRcdFx0XHRhY3RpdmVXaGlsZUJvdGhSdW4sXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJQZWVyUmVtb3ZlZCxcblx0XHRcdFx0XHRhY3RpdmVBZnRlckRlZmF1bHRDb21wbGV0ZTogbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRcdGFjdGl2ZVNlc3Npb25zOiBtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR1cm5FdmVudHM6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHRcdFx0YWN0aXZlV2hpbGVCb3RoUnVuOiB0cnVlLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyUGVlclJlbW92ZWQ6IHRydWUsXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJEZWZhdWx0Q29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdGFjdGl2ZVNlc3Npb25zOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUNoYXQgZmxpcHMgdGhlIHNlc3Npb24gaWRsZSB3aGVuIHRoZSByZW1vdmVkIHBlZXIgaGVsZCB0aGUgbGFzdCBhY3RpdmUgdHVybicsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgdHVybkV2ZW50czogYm9vbGVhbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuKGUgPT4gdHVybkV2ZW50cy5wdXNoKGUuYWN0aXZlKSkpO1xuXG5cdFx0XHQvLyBPbmx5IHRoZSBwZWVyIGNoYXQgaGFzIGFuIGFjdGl2ZSB0dXJuLlxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWN0aXZlV2hpbGVQZWVyUnVucyA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0Ly8gUmVtb3ZpbmcgdGhhdCBwZWVyIGlzIHRoZSBsYXN0IGFjdGl2ZSBjaGF0LCBzbyB0aGUgc2Vzc2lvbiBtdXN0XG5cdFx0XHQvLyBmbGlwIGJhY2sgdG8gaWRsZSBpbnN0ZWFkIG9mIHN0YXlpbmcgcGVybWFuZW50bHkgYWN0aXZlLlxuXHRcdFx0bWFuYWdlci5yZW1vdmVDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR1cm5FdmVudHMsXG5cdFx0XHRcdFx0YWN0aXZlV2hpbGVQZWVyUnVucyxcblx0XHRcdFx0XHRhY3RpdmVBZnRlclBlZXJSZW1vdmVkOiBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSksXG5cdFx0XHRcdFx0YWN0aXZlU2Vzc2lvbnM6IG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHVybkV2ZW50czogW3RydWUsIGZhbHNlXSxcblx0XHRcdFx0XHRhY3RpdmVXaGlsZVBlZXJSdW5zOiB0cnVlLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyUGVlclJlbW92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGFjdGl2ZVNlc3Npb25zOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gQ2hhcmFjdGVyaXphdGlvbiB0ZXN0cyAodGFzayBBMyk6IHBpbiBkb3duIHRoZSAqY3VycmVudCogY2F0YWxvZyBiZWhhdmlvclxuXHQvLyBcdTIwMTQgdGhlIGRlZmF1bHQtY2hhdCBwb2ludGVyIHNldCB1cCBieSBgX2Vuc3VyZURlZmF1bHRDaGF0YCwgdGhlXG5cdC8vIGByZXN0b3JlQ2hhdGAgcmUtcmVnaXN0cmF0aW9uIHBhdGgsIGFuZCB0aGUgcm9sbGVkLXVwIHNlc3Npb24gc3VtbWFyeVxuXHQvLyBwcm9kdWNlZCBieSB0aGUgU2Vzc2lvblN1bW1hcnlOb3RpZmllciBcdTIwMTQgc28gdGhlIHVwY29taW5nIGBwcm92aWRlckRhdGFgXG5cdC8vIGNoYW5nZSBjYW5ub3Qgc2lsZW50bHkgcmVncmVzcyB0aGVtLlxuXHRzdWl0ZSgnY2F0YWxvZyBjaGFyYWN0ZXJpemF0aW9uIChBMyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0dGVzdCgnX2Vuc3VyZURlZmF1bHRDaGF0IHNlZWRzIGEgc2luZ2xlIGluaGVyaXRpbmcgZGVmYXVsdCBjaGF0IGFuZCBwb2ludHMgZGVmYXVsdENoYXQgYXQgaXQgb24gY3JlYXRlU2Vzc2lvbicsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGVmYXVsdENoYXQ6IHN0YXRlPy5kZWZhdWx0Q2hhdCxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdElzRGV0ZXJtaW5pc3RpYzogc3RhdGU/LmRlZmF1bHRDaGF0ID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZXM6IHN0YXRlPy5jaGF0cy5tYXAoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdC8vIEVtcHR5IHRpdGxlID0+IHRoZSBkZWZhdWx0IGNoYXQgaW5oZXJpdHMgdGhlIHNlc3Npb24gdGl0bGUgZm9yIGRpc3BsYXkuXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUaXRsZTogc3RhdGU/LmNoYXRzWzBdPy50aXRsZSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFN0YXRlUHJlc2VudDogbWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKHNlc3Npb25VcmkpICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdElzRGV0ZXJtaW5pc3RpYzogdHJ1ZSxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBbYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKV0sXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUaXRsZTogJycsXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRTdGF0ZVByZXNlbnQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnX2Vuc3VyZURlZmF1bHRDaGF0IHNlZWRzIHRoZSBkZWZhdWx0LWNoYXQgcG9pbnRlciBvbiByZXN0b3JlU2Vzc2lvbiB0b28nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJucyA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3AxJywgY29udGVudDogJ3dvcmxkJyB9IHNhdGlzZmllcyBNYXJrZG93blJlc3BvbnNlUGFydF0sXG5cdFx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIHR1cm5zKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdDogc3RhdGU/LmRlZmF1bHRDaGF0LFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZXM6IHN0YXRlPy5jaGF0cy5tYXAoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0VHVybnM6IG1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uVXJpKT8udHVybnMubGVuZ3RoLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGVmYXVsdENoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlczogW2J1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSldLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0VHVybnM6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZUNoYXQgcmUtcmVnaXN0ZXJzIGEgcGVlciBjaGF0IGluIHBsYWNlLCBzZWVkaW5nIHR1cm5zIGFuZCBkcmFmdCB3aXRob3V0IGRpc3BhdGNoaW5nIFNlc3Npb25DaGF0QWRkZWQnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCB0dXJucyA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncGVlci10dXJuLTEnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3Jlc3RvcmVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncDEnLCBjb250ZW50OiAnaGlzdG9yeScgfSBzYXRpc2ZpZXMgTWFya2Rvd25SZXNwb25zZVBhcnRdLFxuXHRcdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBkcmFmdCA9IHsgdGV4dDogJ3dvcmsgaW4gcHJvZ3Jlc3MnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH07XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUmVzdG9yZWQgUGVlcicsIHR1cm5zLCBkcmFmdCB9KTtcblxuXHRcdFx0Y29uc3QgcGVlclN0YXRlID0gbWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZXM6IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5jaGF0cy5tYXAoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkpLnNvcnQoKSxcblx0XHRcdFx0XHRyZXN0b3JlZFRpdGxlOiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IHBlZXJDaGF0KT8udGl0bGUsXG5cdFx0XHRcdFx0cGVlclR1cm5zOiBwZWVyU3RhdGU/LnR1cm5zLmxlbmd0aCxcblx0XHRcdFx0XHRwZWVyRHJhZnQ6IHBlZXJTdGF0ZT8uZHJhZnQ/LnRleHQsXG5cdFx0XHRcdFx0Ly8gcmVzdG9yZUNoYXQgcnVucyBiZWZvcmUgY2xpZW50cyBzdWJzY3JpYmUsIHNvIGl0IGFkZHMgdGhlXG5cdFx0XHRcdFx0Ly8gY2F0YWxvZyBlbnRyeSBpbiBwbGFjZSByYXRoZXIgdGhhbiB2aWEgYSBkaXNwYXRjaGVkIGFjdGlvbi5cblx0XHRcdFx0XHRjaGF0QWRkZWRFdmVudHM6IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQpLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZXM6IFtidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLCBwZWVyQ2hhdF0uc29ydCgpLFxuXHRcdFx0XHRcdHJlc3RvcmVkVGl0bGU6ICdSZXN0b3JlZCBQZWVyJyxcblx0XHRcdFx0XHRwZWVyVHVybnM6IDEsXG5cdFx0XHRcdFx0cGVlckRyYWZ0OiAnd29yayBpbiBwcm9ncmVzcycsXG5cdFx0XHRcdFx0Y2hhdEFkZGVkRXZlbnRzOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVDaGF0IGlzIGEgbm8tb3AgZm9yIGFuIGFscmVhZHktcmVnaXN0ZXJlZCBjaGF0IFVSSScsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgdHVybnMgPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2lnbm9yZWQtdHVybicsXG5cdFx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaWdub3JlZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0bWFuYWdlci5yZXN0b3JlQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ0lnbm9yZWQnLCB0dXJucyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRDb3VudDogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmxlbmd0aCxcblx0XHRcdFx0XHR0aXRsZTogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCk/LnRpdGxlLFxuXHRcdFx0XHRcdC8vIFRoZSBleGlzdGluZyAoZW1wdHkpIGNoYXQgc3RhdGUgaXMgcHJlc2VydmVkOyB0aGUgc3VwcGxpZWQgdHVybnMgYXJlIGRyb3BwZWQuXG5cdFx0XHRcdFx0cGVlclR1cm5zOiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCk/LnR1cm5zLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRDb3VudDogMixcblx0XHRcdFx0XHR0aXRsZTogJ1BlZXInLFxuXHRcdFx0XHRcdHBlZXJUdXJuczogMCxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlQ2hhdCBmb3IgYW4gdW5rbm93biBzZXNzaW9uIGlzIGEgbm8tb3AnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVDaGF0KCdjb3BpbG90Oi9taXNzaW5nJywgcGVlckNoYXQsIHsgdHVybnM6IFtdIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2Vzc2lvblN1bW1hcnlOb3RpZmllciByb2xscyBhIHJ1bm5pbmcgcGVlciBjaGF0IHVwIG9udG8gdGhlIHNlc3Npb24gc3VtbWFyeSBhbmQgZW1pdHMgb25lIGNvYWxlc2NlZCBTZXNzaW9uU3VtbWFyeUNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0XHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRcdGNvbnN0IHN1bW1hcnlIYXNJblByb2dyZXNzID0gKCkgPT4gKChtYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkpPy5zdGF0dXMgPz8gMCkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdFx0XHRcdGNvbnN0IGlkbGVSb2xsdXAgPSBzdW1tYXJ5SGFzSW5Qcm9ncmVzcygpO1xuXG5cdFx0XHRcdC8vIE9ubHkgdGhlIHBlZXIgY2hhdCBzdHJlYW1zOyB0aGUgZGVmYXVsdCBjaGF0IHN0YXlzIGlkbGUuXG5cdFx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHJ1bm5pbmdSb2xsdXAgPSBzdW1tYXJ5SGFzSW5Qcm9ncmVzcygpO1xuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0XHRjb25zdCBzdW1tYXJ5Q2hhbmdlcyA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCkgYXMgU2Vzc2lvblN1bW1hcnlDaGFuZ2VkUGFyYW1zW107XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZGxlUm9sbHVwLFxuXHRcdFx0XHRcdFx0cnVubmluZ1JvbGx1cCxcblx0XHRcdFx0XHRcdHN1bW1hcnlDaGFuZ2VkQ291bnQ6IHN1bW1hcnlDaGFuZ2VzLmxlbmd0aCxcblx0XHRcdFx0XHRcdG5vdGlmaWVkU3RhdHVzSGFzSW5Qcm9ncmVzczogKChzdW1tYXJ5Q2hhbmdlc1swXT8uY2hhbmdlcy5zdGF0dXMgPz8gMCkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0XHRub3RpZmllZFNlc3Npb246IHN1bW1hcnlDaGFuZ2VzWzBdPy5zZXNzaW9uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWRsZVJvbGx1cDogZmFsc2UsXG5cdFx0XHRcdFx0XHRydW5uaW5nUm9sbHVwOiB0cnVlLFxuXHRcdFx0XHRcdFx0c3VtbWFyeUNoYW5nZWRDb3VudDogMSxcblx0XHRcdFx0XHRcdG5vdGlmaWVkU3RhdHVzSGFzSW5Qcm9ncmVzczogdHJ1ZSxcblx0XHRcdFx0XHRcdG5vdGlmaWVkU2Vzc2lvbjogc2Vzc2lvblVyaSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIEV4ZXJjaXNlcyB0aGUgb3BhcXVlLCBhZ2VudC1vd25lZCBgcHJvdmlkZXJEYXRhYCBibG9iIHRoZSBTdGF0ZU1hbmFnZXJcblx0Ly8gcmVjb3JkcyBhbG9uZ3NpZGUgYSBwZWVyLWNoYXQgY2F0YWxvZyBlbnRyeSAoRy1CMSkuIFRoZSBTdGF0ZU1hbmFnZXIgbXVzdFxuXHQvLyBzdG9yZSB0aGUgc3RyaW5nIHZlcmJhdGltLCByZXR1cm4gaXQgdW5jaGFuZ2VkLCBrZWVwIGl0IG9mZiB0aGUgZGVmYXVsdFxuXHQvLyBjaGF0LCBhbmQgZHJvcCBpdCB3aGVuIHRoZSBjaGF0IG9yIGl0cyBzZXNzaW9uIGdvZXMgYXdheSBcdTIwMTQgaXQgbXVzdCBORVZFUlxuXHQvLyBwYXJzZSBvciBvdGhlcndpc2UgaW50ZXJwcmV0IHRoZSB2YWx1ZS5cblx0c3VpdGUoJ3Byb3ZpZGVyRGF0YSAoRy1CMSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXHRcdGNvbnN0IHBlZXJDaGF0MiA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0yJyk7XG5cblx0XHR0ZXN0KCdhZGRDaGF0IHJlY29yZHMgcHJvdmlkZXJEYXRhIHZlcmJhdGltIGFuZCBnZXRDaGF0UHJvdmlkZXJEYXRhIHJldHVybnMgaXQgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdC8vIEEgZGVsaWJlcmF0ZWx5IHN0cnVjdHVyZWQtYnV0LW9wYXF1ZSBibG9iOiB0aGUgU3RhdGVNYW5hZ2VyIG11c3Rcblx0XHRcdC8vIG5vdCBwYXJzZSBpdCwgc28gZW1iZWRkZWQgSlNPTiAvIHF1b3RlcyBtdXN0IHJvdW5kLXRyaXAgZXhhY3RseS5cblx0XHRcdGNvbnN0IGJsb2IgPSAne1wic2RrU2Vzc2lvbklkXCI6XCJhYmMtMTIzXCIsXCJtb2RlbFwiOntcImlkXCI6XCJ4XFxcXFwieVwifX0nO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicsIHByb3ZpZGVyRGF0YTogYmxvYiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByb3ZpZGVyRGF0YTogbWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0KSxcblx0XHRcdFx0XHQvLyBUaGUgYmxvYiBpcyBzdG9yZWQgc2VwYXJhdGVseSBhbmQgbmV2ZXIgbGVha3Mgb250byB0aGVcblx0XHRcdFx0XHQvLyBwcm90b2NvbC12aXNpYmxlIGNhdGFsb2cgZW50cnkgLyBjaGF0IHN0YXRlLlxuXHRcdFx0XHRcdHN1bW1hcnlIYXNCbG9iOiAobWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCkgYXMgeyBwcm92aWRlckRhdGE/OiB1bmtub3duIH0gfCB1bmRlZmluZWQpPy5wcm92aWRlckRhdGEgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjaGF0U3RhdGVIYXNCbG9iOiAobWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpIGFzIHsgcHJvdmlkZXJEYXRhPzogdW5rbm93biB9IHwgdW5kZWZpbmVkKT8ucHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcm92aWRlckRhdGE6IGJsb2IsXG5cdFx0XHRcdFx0c3VtbWFyeUhhc0Jsb2I6IGZhbHNlLFxuXHRcdFx0XHRcdGNoYXRTdGF0ZUhhc0Jsb2I6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RoZSBkZWZhdWx0IGNoYXQgbmV2ZXIgY2FycmllcyBwcm92aWRlckRhdGEnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkQ2hhdCB3aXRob3V0IHByb3ZpZGVyRGF0YSBzdG9yZXMgbm90aGluZycsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhdFByb3ZpZGVyRGF0YShwZWVyQ2hhdCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRDaGF0IGlzIGlkZW1wb3RlbnQgYW5kIHByZXNlcnZlcyB0aGUgb3JpZ2luYWxseSBzdG9yZWQgcHJvdmlkZXJEYXRhJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ1BlZXInLCBwcm92aWRlckRhdGE6ICdmaXJzdCcgfSk7XG5cdFx0XHQvLyBSZS1hZGRpbmcgdGhlIHNhbWUgY2hhdCBVUkkgaXMgYSBuby1vcDsgaXQgbXVzdCBub3QgY2xvYmJlciB0aGUgYmxvYi5cblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ0lnbm9yZWQnLCBwcm92aWRlckRhdGE6ICdzZWNvbmQnIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0KSwgJ2ZpcnN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlQ2hhdCByZWNvcmRzIHByb3ZpZGVyRGF0YSB2ZXJiYXRpbSBhbG9uZ3NpZGUgdHVybnMnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cdFx0XHRjb25zdCBibG9iID0gJ29wYXF1ZS1yZXN0b3JlLXRva2VuJztcblx0XHRcdG1hbmFnZXIucmVzdG9yZUNoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdSZXN0b3JlZCcsIHR1cm5zOiBbXSwgcHJvdmlkZXJEYXRhOiBibG9iIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0KSwgYmxvYik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlQ2hhdCB3aXRob3V0IHByb3ZpZGVyRGF0YSBzdG9yZXMgbm90aGluZycsICgpID0+IHtcblx0XHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblx0XHRcdG1hbmFnZXIucmVzdG9yZUNoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdSZXN0b3JlZCcsIHR1cm5zOiBbXSB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhdFByb3ZpZGVyRGF0YShwZWVyQ2hhdCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVDaGF0IGRyb3BzIHRoZSBjaGF0IHByb3ZpZGVyRGF0YScsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJywgcHJvdmlkZXJEYXRhOiAnYmxvYicgfSk7XG5cdFx0XHRtYW5hZ2VyLnJlbW92ZUNoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZVNlc3Npb24gZHJvcHMgcHJvdmlkZXJEYXRhIGZvciBldmVyeSBwZWVyIGNoYXQnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlciAxJywgcHJvdmlkZXJEYXRhOiAnYmxvYi0xJyB9KTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdDIsIHsgdGl0bGU6ICdQZWVyIDInLCBwcm92aWRlckRhdGE6ICdibG9iLTInIH0pO1xuXG5cdFx0XHRtYW5hZ2VyLnJlbW92ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwZWVyMTogbWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0KSxcblx0XHRcdFx0XHRwZWVyMjogbWFuYWdlci5nZXRDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0MiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwZWVyMTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBlZXIyOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU3ViYWdlbnQgVVJJIGhlbHBlcnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkgY3JlYXRlcyBjb3JyZWN0IFVSSScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRidWlsZFN1YmFnZW50U2Vzc2lvblVyaSgnY29waWxvdDovc2Vzc2lvbi0xJywgJ3RjLTEnKSxcblx0XHRcdCdjb3BpbG90Oi9zZXNzaW9uLTEvc3ViYWdlbnQvdGMtMScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkgcHJlc2VydmVzIHBhcmVudCBVUkkgcGF0aCBzaGFwZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRidWlsZFN1YmFnZW50U2Vzc2lvblVyaSgnY29waWxvdDovc2Vzc2lvbi0xLy9uZXN0ZWQvLi4va2VwdCcsICd0Yy0xJyksXG5cdFx0XHQnY29waWxvdDovc2Vzc2lvbi0xLy9uZXN0ZWQvLi4va2VwdC9zdWJhZ2VudC90Yy0xJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSBleHRyYWN0cyBwYXJlbnQgYW5kIHRvb2xDYWxsSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmkoJ2NvcGlsb3Q6L3Nlc3Npb24tMS9zdWJhZ2VudC90Yy0xJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQgJiYge1xuXHRcdFx0cGFyZW50U2Vzc2lvbjogcGFyc2VkLnBhcmVudFNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHRvb2xDYWxsSWQ6IHBhcnNlZC50b29sQ2FsbElkLFxuXHRcdH0sIHtcblx0XHRcdHBhcmVudFNlc3Npb246ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSBoYW5kbGVzIG5lc3RlZCBzdWJhZ2VudCBVUklzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKCdjb3BpbG90Oi9zZXNzaW9uLTEvc3ViYWdlbnQvdGMtMS9zdWJhZ2VudC90Yy0yJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQgJiYge1xuXHRcdFx0cGFyZW50U2Vzc2lvbjogcGFyc2VkLnBhcmVudFNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHRvb2xDYWxsSWQ6IHBhcnNlZC50b29sQ2FsbElkLFxuXHRcdH0sIHtcblx0XHRcdHBhcmVudFNlc3Npb246ICdjb3BpbG90Oi9zZXNzaW9uLTEvc3ViYWdlbnQvdGMtMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlU3ViYWdlbnRTZXNzaW9uVXJpIHJldHVybnMgdW5kZWZpbmVkIGZvciBub24tc3ViYWdlbnQgVVJJcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTdWJhZ2VudFNlc3Npb25VcmkoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1N1YmFnZW50U2Vzc2lvbiBpZGVudGlmaWVzIHN1YmFnZW50IFVSSXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU3ViYWdlbnRTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEvc3ViYWdlbnQvdGMtMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTdWJhZ2VudFNlc3Npb24oJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkU3ViYWdlbnRTZXNzaW9uVXJpUHJlZml4IGNyZWF0ZXMgc3RhdGUgbWFuYWdlciBwcmVmaXgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YnVpbGRTdWJhZ2VudFNlc3Npb25VcmlQcmVmaXgoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLFxuXHRcdFx0J2NvcGlsb3Q6L3Nlc3Npb24tMS9zdWJhZ2VudC8nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkU3ViYWdlbnRTZXNzaW9uVXJpUHJlZml4IHByZXNlcnZlcyBwYXJlbnQgVVJJIHBhdGggc2hhcGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YnVpbGRTdWJhZ2VudFNlc3Npb25VcmlQcmVmaXgoJ2NvcGlsb3Q6L3Nlc3Npb24tMS8vbmVzdGVkLy4uL2tlcHQnKSxcblx0XHRcdCdjb3BpbG90Oi9zZXNzaW9uLTEvL25lc3RlZC8uLi9rZXB0L3N1YmFnZW50LycsXG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ21lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCcsICgpID0+IHtcblx0XHRmdW5jdGlvbiBtYWtlU2Vzc2lvblN0YXRlKHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcpOiBTZXNzaW9uU3RhdGUge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0dGl0bGU6ICdTZXNzaW9uJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBtYWtlQ2hhdFN0YXRlKHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcpOiBDaGF0U3RhdGUge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2U6ICdjb3BpbG90Oi90ZXN0LXNlc3Npb24vY2hhdC9wZWVyJyxcblx0XHRcdFx0dGl0bGU6ICdQZWVyJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0dXJuczogW10sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc29sdmVzIHRoZSBwZXItY2hhdCB3b3JraW5nIGRpcmVjdG9yeSBvdmVycmlkZSBvdmVyIHRoZSBzZXNzaW9uIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQoXG5cdFx0XHRcdG1ha2VTZXNzaW9uU3RhdGUoJ2ZpbGU6Ly8vc2Vzc2lvbi13ZCcpLFxuXHRcdFx0XHRtYWtlQ2hhdFN0YXRlKCdmaWxlOi8vL3BlZXItd29ya3RyZWUnKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VkLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLCAnZmlsZTovLy9wZWVyLXdvcmt0cmVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5IHdoZW4gdGhlIGNoYXQgZG9lcyBub3Qgb3ZlcnJpZGUgaXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQoXG5cdFx0XHRcdG1ha2VTZXNzaW9uU3RhdGUoJ2ZpbGU6Ly8vc2Vzc2lvbi13ZCcpLFxuXHRcdFx0XHRtYWtlQ2hhdFN0YXRlKHVuZGVmaW5lZCksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlZC53b3JraW5nRGlyZWN0b3JpZXM/LlswXSwgJ2ZpbGU6Ly8vc2Vzc2lvbi13ZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSB3aGVuIG5vIGNoYXQgc3RhdGUgaXMgaHlkcmF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQobWFrZVNlc3Npb25TdGF0ZSgnZmlsZTovLy9zZXNzaW9uLXdkJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VkLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLCAnZmlsZTovLy9zZXNzaW9uLXdkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lcmdlZC50dXJucywgW10pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksd0JBQWlFO0FBQ3RGLFNBQVMsYUFBNkIsa0JBQWtCLGdCQUFnQixrQkFBa0IsZUFBZSxXQUFXLGNBQWMscUJBQXFCLHlCQUF5QiwrQkFBK0IsbUJBQW1CLDZCQUE2Qix5QkFBeUIseUJBQXVGO0FBRS9XLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLGdDQUFnQztBQUM1RCxTQUFTLHNDQUFzQztBQUUvQyxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSxhQUFhLElBQUksS0FBSyxFQUFFLFFBQVEsV0FBVyxNQUFNLGdCQUFnQixDQUFDLEVBQUUsU0FBUztBQUNuRixRQUFNLGlCQUFpQixvQkFBb0IsVUFBVTtBQUVyRCxXQUFTLG1CQUFtQixVQUFtQztBQUM5RCxXQUFPO0FBQUEsTUFDTixVQUFVLFlBQVk7QUFBQSxNQUN0QixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCxRQUFRLGNBQWM7QUFBQSxNQUN0QixZQUFXLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsTUFDbEMsYUFBWSxvQkFBSSxLQUFLLEdBQUUsWUFBWTtBQUFBLE1BQ25DLFNBQVMsRUFBRSxLQUFLLHdCQUF3QixhQUFhLGVBQWU7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFFQSxRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJ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
