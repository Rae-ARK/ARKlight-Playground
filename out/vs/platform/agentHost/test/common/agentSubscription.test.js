import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, MessageKind, SessionLifecycle, SessionStatus, TerminalClaimKind, TurnState } from "../../common/state/protocol/state.js";
import { buildDefaultChatUri, createChatState, createDefaultChatSummary, ROOT_STATE_URI, StateComponents } from "../../common/state/sessionState.js";
import { AgentSubscriptionManager, ChangesetStateSubscription, ChatStateSubscription, isActionEnvelopeRelevantToSubscriptionUris, RootStateSubscription, SessionStateSubscription, TerminalStateSubscription } from "../../common/state/agentSubscription.js";
function makeRootState(overrides) {
  return {
    agents: [],
    activeSessions: 0,
    terminals: [],
    ...overrides
  };
}
function makeSessionSummary(sessionUri2) {
  return {
    resource: sessionUri2,
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    project: { uri: "file:///test-project", displayName: "Test Project" }
  };
}
function makeSessionState(sessionUri2, overrides) {
  return {
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    project: { uri: "file:///test-project", displayName: "Test Project" },
    lifecycle: SessionLifecycle.Ready,
    activeClients: [],
    chats: [],
    ...overrides
  };
}
function makeChatState(chatUri2, sessionSummary = makeSessionSummary(sessionUri), overrides) {
  return {
    ...createChatState(createDefaultChatSummary(sessionSummary, chatUri2)),
    ...overrides
  };
}
function makeTerminalState(overrides) {
  return {
    title: "bash",
    content: [],
    claim: { kind: TerminalClaimKind.Client, clientId: "c1" },
    ...overrides
  };
}
function makeEnvelope(action, serverSeq, origin, rejectionReason, channel) {
  const resolvedChannel = channel ?? (action.type.startsWith("root/") ? ROOT_STATE_URI : action.type.startsWith("chat/") ? chatUri : action.type.startsWith("terminal/") ? terminalUri : action.type.startsWith("changeset/") ? changesetUri : sessionUri);
  return { channel: resolvedChannel, action, serverSeq, origin, rejectionReason };
}
const noop = () => {
};
const sessionUri = URI.from({ scheme: "copilot", path: "/test-session" }).toString();
const terminalUri = URI.from({ scheme: "agenthost-terminal", path: "/term1" }).toString();
const chatUri = buildDefaultChatUri(sessionUri);
const changesetUri = `${sessionUri}/changeset/session`;
suite("ChangesetStateSubscription", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("optimistically applies and reconciles file review state", () => {
    const state = {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///test.txt",
        edit: {
          before: { uri: "file:///test.txt", content: { uri: "file:///before.txt" } },
          after: { uri: "file:///test.txt", content: { uri: "file:///after.txt" } }
        }
      }]
    };
    const subscription = disposables.add(new ChangesetStateSubscription(changesetUri, "c1", () => 1, noop));
    subscription.handleSnapshot(state, 0);
    const action = {
      type: ActionType.ChangesetFilesReviewChanged,
      files: ["file:///test.txt"],
      reviewed: true
    };
    const clientSeq = subscription.applyOptimistic(action);
    const optimisticState = subscription.value;
    subscription.receiveEnvelope(makeEnvelope(action, 1, { clientId: "c1", clientSeq }));
    assert.deepStrictEqual({
      optimisticReviewed: optimisticState.files[0].reviewed,
      verifiedBeforeEcho: state.files[0].reviewed,
      verifiedAfterEcho: subscription.verifiedValue?.files[0].reviewed,
      pendingCleared: subscription.value === subscription.verifiedValue
    }, {
      optimisticReviewed: true,
      verifiedBeforeEcho: void 0,
      verifiedAfterEcho: true,
      pendingCleared: true
    });
  });
});
suite("RootStateSubscription", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("value is undefined before snapshot", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    assert.strictEqual(sub.value, void 0);
    assert.strictEqual(sub.verifiedValue, void 0);
  });
  test("handleSnapshot sets value and verifiedValue", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    const state = makeRootState({ activeSessions: 3 });
    sub.handleSnapshot(state, 0);
    assert.deepStrictEqual(sub.value, state);
    assert.deepStrictEqual(sub.verifiedValue, state);
  });
  test("handleSnapshot fires onDidChange", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    const fired = [];
    disposables.add(sub.onDidChange((s) => fired.push(s)));
    sub.handleSnapshot(makeRootState(), 0);
    assert.strictEqual(fired.length, 1);
  });
  test("receiveEnvelope updates state for root actions", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.handleSnapshot(makeRootState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
      1
    ));
    assert.strictEqual(sub.value.activeSessions, 5);
  });
  test("ignores non-root actions", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    const state = makeRootState();
    sub.handleSnapshot(state, 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionReady },
      1
    ));
    assert.deepStrictEqual(sub.value, state);
  });
  test("fires onWillApplyAction and onDidApplyAction around envelope", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.handleSnapshot(makeRootState(), 0);
    const events = [];
    disposables.add(sub.onWillApplyAction(() => events.push("will")));
    disposables.add(sub.onDidApplyAction(() => events.push("did")));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 1 },
      1
    ));
    assert.deepStrictEqual(events, ["will", "did"]);
  });
  test("buffers envelopes before snapshot and replays after", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 7 },
      2
    ));
    assert.strictEqual(sub.value, void 0);
    sub.handleSnapshot(makeRootState(), 1);
    assert.strictEqual(sub.value.activeSessions, 7);
  });
  test("buffered envelopes with serverSeq <= fromSeq are discarded", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 99 },
      1
    ));
    sub.handleSnapshot(makeRootState({ activeSessions: 0 }), 1);
    assert.strictEqual(sub.value.activeSessions, 0);
  });
  test("setError makes value return the error", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.handleSnapshot(makeRootState(), 0);
    const err = new Error("failed");
    const errors = [];
    disposables.add(sub.onDidError((error) => errors.push(error)));
    sub.setError(err);
    assert.deepStrictEqual({
      value: sub.value,
      verifiedValueExists: !!sub.verifiedValue,
      errors
    }, {
      value: err,
      verifiedValueExists: true,
      errors: [err]
    });
  });
});
suite("SessionStateSubscription", () => {
  let disposables;
  let seq;
  setup(() => {
    disposables = new DisposableStore();
    seq = 0;
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSub(uri = sessionUri, clientId = "c1") {
    return disposables.add(new SessionStateSubscription(uri, clientId, () => ++seq, noop));
  }
  test("value is undefined before snapshot", () => {
    const sub = createSub();
    assert.strictEqual(sub.value, void 0);
  });
  test("handleSnapshot sets value and verifiedValue", () => {
    const sub = createSub();
    const state = makeSessionState(sessionUri);
    sub.handleSnapshot(state, 0);
    assert.deepStrictEqual(sub.value, state);
    assert.deepStrictEqual(sub.verifiedValue, state);
  });
  test("applyOptimistic returns clientSeq and updates value but not verifiedValue", () => {
    const sub = createSub();
    const state = makeSessionState(sessionUri);
    sub.handleSnapshot(state, 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Optimistic"
    });
    assert.strictEqual(clientSeq, 1);
    assert.strictEqual(sub.value.title, "Optimistic");
    assert.strictEqual(sub.verifiedValue.title, "Test");
  });
  test("confirmed own action removes pending and updates confirmed", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Optimistic"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Optimistic" },
      1,
      { clientId: "c1", clientSeq }
    ));
    assert.strictEqual(sub.verifiedValue.title, "Optimistic");
    assert.strictEqual(sub.value.title, "Optimistic");
  });
  test("rejected own action removes pending without updating confirmed", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Optimistic"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Optimistic" },
      1,
      { clientId: "c1", clientSeq },
      "denied"
    ));
    assert.strictEqual(sub.verifiedValue.title, "Test");
    assert.strictEqual(sub.value.title, "Test");
  });
  test("foreign action updates confirmed and recomputes optimistic", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Local"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionReady },
      1,
      { clientId: "other-client", clientSeq: 1 }
    ));
    assert.strictEqual(sub.verifiedValue.lifecycle, SessionLifecycle.Ready);
    assert.strictEqual(sub.value.title, "Local");
  });
  test("server terminal turn action remains ignored by session subscription", () => {
    const sub = createSub();
    const state = makeSessionState(sessionUri);
    sub.handleSnapshot(state, 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 },
      1,
      void 0
    ));
    assert.deepStrictEqual(sub.value, state);
  });
  test("after all pending cleared, value falls through to verifiedValue", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Temp"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Temp" },
      1,
      { clientId: "c1", clientSeq }
    ));
    assert.strictEqual(sub.value, sub.verifiedValue);
  });
  test("clearPending resets optimistic state", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Pending"
    });
    assert.strictEqual(sub.value.title, "Pending");
    sub.clearPending();
    assert.strictEqual(sub.value.title, "Test");
  });
  test("ignores actions for different session", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Other" },
      1,
      void 0,
      void 0,
      "copilot:/other-session"
    ));
    assert.strictEqual(sub.value.title, "Test");
  });
  test("buffers envelopes before snapshot and replays after", () => {
    const sub = createSub();
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Buffered" },
      2
    ));
    assert.strictEqual(sub.value, void 0);
    sub.handleSnapshot(makeSessionState(sessionUri), 1);
    assert.strictEqual(sub.value.title, "Buffered");
  });
  test("fires onDidChange on optimistic apply", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const fired = [];
    disposables.add(sub.onDidChange((s) => fired.push(s)));
    sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Changed"
    });
    assert.strictEqual(fired.length, 1);
    assert.strictEqual(fired[0].title, "Changed");
  });
});
suite("ChatStateSubscription", () => {
  let disposables;
  let seq;
  setup(() => {
    disposables = new DisposableStore();
    seq = 0;
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSub(uri = chatUri, clientId = "c1") {
    return disposables.add(new ChatStateSubscription(uri, clientId, () => ++seq, noop));
  }
  test("server terminal turn action drops stale optimistic turn start", () => {
    const sub = createSub();
    sub.handleSnapshot(makeChatState(chatUri), 0);
    sub.applyOptimistic({
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(sub.value?.activeTurn?.id, "turn-1");
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 },
      1,
      void 0
    ));
    assert.deepStrictEqual({
      activeTurn: sub.value?.activeTurn,
      turns: sub.value?.turns.map((turn) => ({ id: turn.id, state: turn.state }))
    }, {
      activeTurn: void 0,
      turns: [{ id: "turn-1", state: TurnState.Complete }]
    });
  });
});
suite("TerminalStateSubscription", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts terminal actions matching its URI", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalData, data: "hello" },
      1
    ));
    assert.deepStrictEqual(sub.value.content, [
      { type: "unclassified", value: "hello" }
    ]);
  });
  test("data between command executed and finished is attributed to the command", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalCommandExecuted, commandId: "cmd-1", commandLine: "echo hi", timestamp: 1e3 },
      1
    ));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalData, data: "hi\r\n" },
      2
    ));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalCommandFinished, commandId: "cmd-1", exitCode: 0, durationMs: 5 },
      3
    ));
    assert.deepStrictEqual(sub.value.content, [{
      type: "command",
      commandId: "cmd-1",
      commandLine: "echo hi",
      output: "hi\r\n",
      timestamp: 1e3,
      isComplete: true,
      exitCode: 0,
      durationMs: 5
    }]);
  });
  test("ignores terminal actions for other URIs", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalData, data: "nope" },
      1,
      void 0,
      void 0,
      "agenthost-terminal:/other-term"
    ));
    assert.deepStrictEqual(sub.value.content, []);
  });
  test("ignores non-terminal actions", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
      1
    ));
    assert.deepStrictEqual(sub.value.content, []);
  });
  test("handleSnapshot sets value", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    const state = makeTerminalState({ title: "zsh" });
    sub.handleSnapshot(state, 0);
    assert.deepStrictEqual(sub.value, state);
  });
});
suite("AgentSubscriptionManager", () => {
  let disposables;
  let seq;
  let subscribedResources;
  let unsubscribedResources;
  setup(() => {
    disposables = new DisposableStore();
    seq = 0;
    subscribedResources = [];
    unsubscribedResources = [];
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createManager(subscribe = async (resource) => {
    subscribedResources.push(resource.toString());
    const key = resource.toString();
    if (key.startsWith("copilot:")) {
      return { resource: key, state: makeSessionState(key), fromSeq: 0 };
    }
    return { resource: key, state: makeTerminalState(), fromSeq: 0 };
  }) {
    return disposables.add(new AgentSubscriptionManager(
      "c1",
      () => ++seq,
      noop,
      subscribe,
      (resource) => {
        unsubscribedResources.push(resource.toString());
      }
    ));
  }
  test("rootState is available immediately", () => {
    const mgr = createManager();
    assert.ok(mgr.rootState);
    assert.strictEqual(mgr.rootState.value, void 0);
  });
  test("handleRootSnapshot initializes root state", () => {
    const mgr = createManager();
    const state = makeRootState({ activeSessions: 2 });
    mgr.handleRootSnapshot(state, 0);
    assert.deepStrictEqual(mgr.rootState.value, state);
  });
  test("getSubscription returns IReference with subscription", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    assert.ok(ref.object);
    assert.strictEqual(ref.object.value, void 0);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ref.object.value);
    ref.dispose();
  });
  test("second call for same resource increments refcount", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref1 = mgr.getSubscription(StateComponents.Session, uri, "test");
    const ref2 = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(ref1.object, ref2.object);
    ref1.dispose();
    assert.strictEqual(unsubscribedResources.length, 0);
    ref2.dispose();
    assert.strictEqual(unsubscribedResources.length, 1);
  });
  test("disposing last ref calls unsubscribe callback", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    ref.dispose();
    assert.ok(unsubscribedResources.includes(sessionUri));
  });
  test("receiveEnvelope routes to root and all active subscriptions", async () => {
    const mgr = createManager();
    mgr.handleRootSnapshot(makeRootState(), 0);
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    mgr.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 10 },
      1
    ));
    assert.strictEqual(mgr.rootState.value.activeSessions, 10);
    mgr.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Routed" },
      2
    ));
    assert.strictEqual(ref.object.value.title, "Routed");
    ref.dispose();
  });
  test("isActionEnvelopeRelevantToSubscriptionUris filters by subscribed channel", () => {
    assert.deepStrictEqual({
      rootVariant: isActionEnvelopeRelevantToSubscriptionUris(
        makeEnvelope({ type: ActionType.RootActiveSessionsChanged, activeSessions: 1 }, 1, void 0, void 0, ROOT_STATE_URI),
        ["ahp-root:"]
      ),
      rootOnlyGetsSession: isActionEnvelopeRelevantToSubscriptionUris(
        makeEnvelope({ type: ActionType.SessionTitleChanged, title: "Nope" }, 2),
        ["ahp-root:"]
      ),
      exactSession: isActionEnvelopeRelevantToSubscriptionUris(
        makeEnvelope({ type: ActionType.SessionTitleChanged, title: "Yep" }, 3),
        ["ahp-root:", sessionUri]
      )
    }, {
      rootVariant: true,
      rootOnlyGetsSession: false,
      exactSession: true
    });
  });
  test("creating session subscription for copilot: URI", async () => {
    const mgr = createManager();
    const mySessionUri = URI.from({ scheme: "copilot", path: "/my-session" });
    const ref = mgr.getSubscription(StateComponents.Session, mySessionUri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ref.object.value);
    assert.ok(subscribedResources.includes(mySessionUri.toString()));
    ref.dispose();
  });
  test("creating terminal subscription for terminal URI", async () => {
    const mgr = createManager();
    const uri = URI.parse(terminalUri);
    const ref = mgr.getSubscription(StateComponents.Terminal, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ref.object.value);
    assert.ok(subscribedResources.includes(terminalUri));
    ref.dispose();
  });
  test("dispatchOptimistic applies to matching session subscription", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    const clientSeq = mgr.dispatchOptimistic(uri.toString(), {
      type: ActionType.SessionTitleChanged,
      title: "Dispatched"
    });
    assert.ok(clientSeq > 0);
    assert.strictEqual(ref.object.value.title, "Dispatched");
    assert.strictEqual(ref.object.verifiedValue.title, "Test");
    ref.dispose();
  });
  test("dispatchOptimistic applies to matching changeset subscription", async () => {
    const state = {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///test.txt",
        edit: {
          after: { uri: "file:///test.txt", content: { uri: "file:///after.txt" } }
        }
      }]
    };
    const mgr = createManager(async (resource) => ({ resource: resource.toString(), state, fromSeq: 0 }));
    const uri = URI.parse(changesetUri);
    const ref = mgr.getSubscription(StateComponents.Changeset, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    const clientSeq = mgr.dispatchOptimistic(uri.toString(), {
      type: ActionType.ChangesetFilesReviewChanged,
      files: ["file:///test.txt"],
      reviewed: true
    });
    assert.deepStrictEqual({
      clientSeq,
      optimisticReviewed: ref.object.value.files[0].reviewed,
      verifiedReviewed: ref.object.verifiedValue?.files[0].reviewed
    }, {
      clientSeq: 1,
      optimisticReviewed: true,
      verifiedReviewed: void 0
    });
    ref.dispose();
  });
  test("dispose clears all subscriptions and calls unsubscribe for each", async () => {
    const mgr = createManager();
    const ref1 = mgr.getSubscription(StateComponents.Session, URI.parse(sessionUri), "test");
    const ref2 = mgr.getSubscription(StateComponents.Terminal, URI.parse(terminalUri), "test");
    await new Promise((r) => setTimeout(r, 0));
    disposables.delete(mgr);
    mgr.dispose();
    assert.ok(unsubscribedResources.includes(sessionUri));
    assert.ok(unsubscribedResources.includes(terminalUri));
    ref1.dispose();
    ref2.dispose();
  });
  test("getSubscriptionUnmanaged returns undefined when no subscription exists", () => {
    const mgr = createManager();
    const result = mgr.getSubscriptionUnmanaged(URI.parse("copilot:/nonexistent"));
    assert.strictEqual(result, void 0);
  });
  test("getSubscriptionUnmanaged returns existing subscription without affecting refcount", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    const unmanaged = mgr.getSubscriptionUnmanaged(uri);
    assert.ok(unmanaged);
    assert.strictEqual(unmanaged, ref.object);
    ref.dispose();
    const after = mgr.getSubscriptionUnmanaged(uri);
    assert.strictEqual(after, void 0);
  });
  test("getSubscription retries after a failed subscribe for the same resource", async () => {
    let subscribeAttempts = 0;
    const mgr = createManager(async (resource) => {
      subscribedResources.push(resource.toString());
      subscribeAttempts++;
      if (subscribeAttempts === 1) {
        throw new Error("not found yet");
      }
      return { resource: resource.toString(), state: makeSessionState(resource.toString(), { title: "Retried" }), fromSeq: 0 };
    });
    const uri = URI.parse(sessionUri);
    const failedRef = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(failedRef.object.value instanceof Error);
    const retryRef = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual({
      subscribeAttempts,
      retriedTitle: retryRef.object.value.title,
      unmanagedIsRetry: mgr.getSubscriptionUnmanaged(uri) === retryRef.object
    }, {
      subscribeAttempts: 2,
      retriedTitle: "Retried",
      unmanagedIsRetry: true
    });
    failedRef.dispose();
    assert.strictEqual(mgr.getSubscriptionUnmanaged(uri), retryRef.object);
    retryRef.dispose();
    assert.strictEqual(mgr.getSubscriptionUnmanaged(uri), void 0);
  });
  test("getActiveSubscriptions reports kind, refCount, holders and status per active subscription", async () => {
    const mgr = createManager();
    const sUri = URI.parse(sessionUri);
    const tUri = URI.parse(terminalUri);
    const sessionRef = mgr.getSubscription(StateComponents.Session, sUri, "SessionHolder");
    const sessionRef2 = mgr.getSubscription(StateComponents.Session, sUri, "SessionHolder");
    const terminalRef = mgr.getSubscription(StateComponents.Terminal, tUri, "TerminalHolder");
    const map = () => mgr.getActiveSubscriptions().map((s) => ({ resource: s.resource.toString(), kind: s.kind, refCount: s.refCount, holders: s.holders, status: s.status }));
    const pending = map();
    await new Promise((r) => setTimeout(r, 0));
    const active = map();
    assert.deepStrictEqual({ pending, active }, {
      pending: [
        { resource: sessionUri, kind: StateComponents.Session, refCount: 2, holders: [{ owner: "SessionHolder", count: 2 }], status: "pending" },
        { resource: terminalUri, kind: StateComponents.Terminal, refCount: 1, holders: [{ owner: "TerminalHolder", count: 1 }], status: "pending" }
      ],
      active: [
        { resource: sessionUri, kind: StateComponents.Session, refCount: 2, holders: [{ owner: "SessionHolder", count: 2 }], status: "snapshot" },
        { resource: terminalUri, kind: StateComponents.Terminal, refCount: 1, holders: [{ owner: "TerminalHolder", count: 1 }], status: "snapshot" }
      ]
    });
    sessionRef.dispose();
    sessionRef2.dispose();
    terminalRef.dispose();
    assert.strictEqual(mgr.getActiveSubscriptions().length, 0);
  });
  test("getActiveSubscriptions tracks distinct holders and drops them as references are disposed", async () => {
    const mgr = createManager();
    const sUri = URI.parse(sessionUri);
    const refA = mgr.getSubscription(StateComponents.Session, sUri, "HolderA");
    const refB = mgr.getSubscription(StateComponents.Session, sUri, "HolderB");
    const refB2 = mgr.getSubscription(StateComponents.Session, sUri, "HolderB");
    await new Promise((r) => setTimeout(r, 0));
    const withAll = mgr.getActiveSubscriptions()[0].holders;
    refB.dispose();
    const afterOneB = mgr.getActiveSubscriptions()[0].holders;
    refB.dispose();
    const afterDoubleDispose = mgr.getActiveSubscriptions()[0].holders;
    refA.dispose();
    refB2.dispose();
    assert.deepStrictEqual({ withAll, afterOneB, afterDoubleDispose, remaining: mgr.getActiveSubscriptions().length }, {
      // Sorted by descending count, so HolderB (2) precedes HolderA (1).
      withAll: [{ owner: "HolderB", count: 2 }, { owner: "HolderA", count: 1 }],
      afterOneB: [{ owner: "HolderA", count: 1 }, { owner: "HolderB", count: 1 }],
      afterDoubleDispose: [{ owner: "HolderA", count: 1 }, { owner: "HolderB", count: 1 }],
      remaining: 0
    });
  });
  test("getActiveSubscriptions reports error status for a failed subscription", async () => {
    const mgr = createManager(async () => {
      throw new Error("nope");
    });
    const ref = mgr.getSubscription(StateComponents.Session, URI.parse(sessionUri), "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(
      mgr.getActiveSubscriptions().map((s) => ({ kind: s.kind, status: s.status })),
      [{ kind: StateComponents.Session, status: "error" }]
    );
    ref.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9hZ2VudFN1YnNjcmlwdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUsIHR5cGUgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYW5nZXNldFN0YXR1cywgTWVzc2FnZUtpbmQsIFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25TdGF0dXMsIFRlcm1pbmFsQ2xhaW1LaW5kLCBUdXJuU3RhdGUsIHR5cGUgQ2hhbmdlc2V0U3RhdGUsIHR5cGUgUm9vdFN0YXRlLCB0eXBlIFNlc3Npb25TdGF0ZSwgdHlwZSBTZXNzaW9uU3VtbWFyeSwgdHlwZSBUZXJtaW5hbFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIGNyZWF0ZUNoYXRTdGF0ZSwgY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5LCBST09UX1NUQVRFX1VSSSwgU3RhdGVDb21wb25lbnRzLCB0eXBlIENoYXRTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyLCBDaGFuZ2VzZXRTdGF0ZVN1YnNjcmlwdGlvbiwgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uLCBpc0FjdGlvbkVudmVsb3BlUmVsZXZhbnRUb1N1YnNjcmlwdGlvblVyaXMsIFJvb3RTdGF0ZVN1YnNjcmlwdGlvbiwgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uLCBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcblxuLy8gSGVscGVyc1xuXG5mdW5jdGlvbiBtYWtlUm9vdFN0YXRlKG92ZXJyaWRlcz86IFBhcnRpYWw8Um9vdFN0YXRlPik6IFJvb3RTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0YWdlbnRzOiBbXSxcblx0XHRhY3RpdmVTZXNzaW9uczogMCxcblx0XHR0ZXJtaW5hbHM6IFtdLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVNlc3Npb25TdW1tYXJ5KHNlc3Npb25Vcmk6IHN0cmluZyk6IFNlc3Npb25TdW1tYXJ5IHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaSxcblx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgxKS50b0lTT1N0cmluZygpLFxuXHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDEpLnRvSVNPU3RyaW5nKCksXG5cdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZywgb3ZlcnJpZGVzPzogUGFydGlhbDxTZXNzaW9uU3RhdGU+KTogU2Vzc2lvblN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRjaGF0czogW10sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlQ2hhdFN0YXRlKGNoYXRVcmk6IHN0cmluZywgc2Vzc2lvblN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5ID0gbWFrZVNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkpLCBvdmVycmlkZXM/OiBQYXJ0aWFsPENoYXRTdGF0ZT4pOiBDaGF0U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdC4uLmNyZWF0ZUNoYXRTdGF0ZShjcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnkoc2Vzc2lvblN1bW1hcnksIGNoYXRVcmkpKSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VUZXJtaW5hbFN0YXRlKG92ZXJyaWRlcz86IFBhcnRpYWw8VGVybWluYWxTdGF0ZT4pOiBUZXJtaW5hbFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHR0aXRsZTogJ2Jhc2gnLFxuXHRcdGNvbnRlbnQ6IFtdLFxuXHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjMScgfSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VFbnZlbG9wZShhY3Rpb246IEFjdGlvbkVudmVsb3BlWydhY3Rpb24nXSwgc2VydmVyU2VxOiBudW1iZXIsIG9yaWdpbj86IEFjdGlvbkVudmVsb3BlWydvcmlnaW4nXSwgcmVqZWN0aW9uUmVhc29uPzogc3RyaW5nLCBjaGFubmVsPzogc3RyaW5nKTogQWN0aW9uRW52ZWxvcGUge1xuXHRjb25zdCByZXNvbHZlZENoYW5uZWwgPSBjaGFubmVsID8/IChcblx0XHRhY3Rpb24udHlwZS5zdGFydHNXaXRoKCdyb290LycpID8gUk9PVF9TVEFURV9VUklcblx0XHRcdDogYWN0aW9uLnR5cGUuc3RhcnRzV2l0aCgnY2hhdC8nKSA/IGNoYXRVcmlcblx0XHRcdFx0OiBhY3Rpb24udHlwZS5zdGFydHNXaXRoKCd0ZXJtaW5hbC8nKSA/IHRlcm1pbmFsVXJpXG5cdFx0XHRcdFx0OiBhY3Rpb24udHlwZS5zdGFydHNXaXRoKCdjaGFuZ2VzZXQvJykgPyBjaGFuZ2VzZXRVcmlcblx0XHRcdFx0XHRcdDogc2Vzc2lvblVyaVxuXHQpO1xuXHRyZXR1cm4geyBjaGFubmVsOiByZXNvbHZlZENoYW5uZWwsIGFjdGlvbiwgc2VydmVyU2VxLCBvcmlnaW4sIHJlamVjdGlvblJlYXNvbiB9O1xufVxuXG5jb25zdCBub29wID0gKCkgPT4geyB9O1xuY29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvdGVzdC1zZXNzaW9uJyB9KS50b1N0cmluZygpO1xuY29uc3QgdGVybWluYWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50aG9zdC10ZXJtaW5hbCcsIHBhdGg6ICcvdGVybTEnIH0pLnRvU3RyaW5nKCk7XG5jb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcbmNvbnN0IGNoYW5nZXNldFVyaSA9IGAke3Nlc3Npb25Vcml9L2NoYW5nZXNldC9zZXNzaW9uYDtcblxuc3VpdGUoJ0NoYW5nZXNldFN0YXRlU3Vic2NyaXB0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ29wdGltaXN0aWNhbGx5IGFwcGxpZXMgYW5kIHJlY29uY2lsZXMgZmlsZSByZXZpZXcgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGU6IENoYW5nZXNldFN0YXRlID0ge1xuXHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksXG5cdFx0XHRmaWxlczogW3tcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3Rlc3QudHh0Jyxcblx0XHRcdFx0ZWRpdDoge1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3Rlc3QudHh0JywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL2JlZm9yZS50eHQnIH0gfSxcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3Rlc3QudHh0JywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL2FmdGVyLnR4dCcgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYW5nZXNldFN0YXRlU3Vic2NyaXB0aW9uKGNoYW5nZXNldFVyaSwgJ2MxJywgKCkgPT4gMSwgbm9vcCkpO1xuXHRcdHN1YnNjcmlwdGlvbi5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgMCk7XG5cblx0XHRjb25zdCBhY3Rpb246IENsaWVudENoYW5nZXNldEFjdGlvbiA9IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkLFxuXHRcdFx0ZmlsZXM6IFsnZmlsZTovLy90ZXN0LnR4dCddLFxuXHRcdFx0cmV2aWV3ZWQ6IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBjbGllbnRTZXEgPSBzdWJzY3JpcHRpb24uYXBwbHlPcHRpbWlzdGljKGFjdGlvbik7XG5cdFx0Y29uc3Qgb3B0aW1pc3RpY1N0YXRlID0gc3Vic2NyaXB0aW9uLnZhbHVlIGFzIENoYW5nZXNldFN0YXRlO1xuXHRcdHN1YnNjcmlwdGlvbi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKGFjdGlvbiwgMSwgeyBjbGllbnRJZDogJ2MxJywgY2xpZW50U2VxIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3B0aW1pc3RpY1Jldmlld2VkOiBvcHRpbWlzdGljU3RhdGUuZmlsZXNbMF0ucmV2aWV3ZWQsXG5cdFx0XHR2ZXJpZmllZEJlZm9yZUVjaG86IHN0YXRlLmZpbGVzWzBdLnJldmlld2VkLFxuXHRcdFx0dmVyaWZpZWRBZnRlckVjaG86IHN1YnNjcmlwdGlvbi52ZXJpZmllZFZhbHVlPy5maWxlc1swXS5yZXZpZXdlZCxcblx0XHRcdHBlbmRpbmdDbGVhcmVkOiBzdWJzY3JpcHRpb24udmFsdWUgPT09IHN1YnNjcmlwdGlvbi52ZXJpZmllZFZhbHVlLFxuXHRcdH0sIHtcblx0XHRcdG9wdGltaXN0aWNSZXZpZXdlZDogdHJ1ZSxcblx0XHRcdHZlcmlmaWVkQmVmb3JlRWNobzogdW5kZWZpbmVkLFxuXHRcdFx0dmVyaWZpZWRBZnRlckVjaG86IHRydWUsXG5cdFx0XHRwZW5kaW5nQ2xlYXJlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cbn0pO1xuXG4vLyBSb290U3RhdGVTdWJzY3JpcHRpb25cblxuc3VpdGUoJ1Jvb3RTdGF0ZVN1YnNjcmlwdGlvbicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZhbHVlIGlzIHVuZGVmaW5lZCBiZWZvcmUgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSb290U3RhdGVTdWJzY3JpcHRpb24oJ2MxJywgbm9vcCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVTbmFwc2hvdCBzZXRzIHZhbHVlIGFuZCB2ZXJpZmllZFZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUm9vdFN0YXRlU3Vic2NyaXB0aW9uKCdjMScsIG5vb3ApKTtcblx0XHRjb25zdCBzdGF0ZSA9IG1ha2VSb290U3RhdGUoeyBhY3RpdmVTZXNzaW9uczogMyB9KTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3Qoc3RhdGUsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViLnZhbHVlLCBzdGF0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdWIudmVyaWZpZWRWYWx1ZSwgc3RhdGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVTbmFwc2hvdCBmaXJlcyBvbkRpZENoYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0Y29uc3QgZmlyZWQ6IFJvb3RTdGF0ZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN1Yi5vbkRpZENoYW5nZShzID0+IGZpcmVkLnB1c2gocykpKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVJvb3RTdGF0ZSgpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVjZWl2ZUVudmVsb3BlIHVwZGF0ZXMgc3RhdGUgZm9yIHJvb3QgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VSb290U3RhdGUoKSwgMCk7XG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IDUgfSxcblx0XHRcdDEsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgUm9vdFN0YXRlKS5hY3RpdmVTZXNzaW9ucywgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbm9uLXJvb3QgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtYWtlUm9vdFN0YXRlKCk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KHN0YXRlLCAwKTtcblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0sXG5cdFx0XHQxLFxuXHRcdCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViLnZhbHVlLCBzdGF0ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uV2lsbEFwcGx5QWN0aW9uIGFuZCBvbkRpZEFwcGx5QWN0aW9uIGFyb3VuZCBlbnZlbG9wZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VSb290U3RhdGUoKSwgMCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdWIub25XaWxsQXBwbHlBY3Rpb24oKCkgPT4gZXZlbnRzLnB1c2goJ3dpbGwnKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdWIub25EaWRBcHBseUFjdGlvbigoKSA9PiBldmVudHMucHVzaCgnZGlkJykpKTtcblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkLCBhY3RpdmVTZXNzaW9uczogMSB9LFxuXHRcdFx0MSxcblx0XHQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgWyd3aWxsJywgJ2RpZCddKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVycyBlbnZlbG9wZXMgYmVmb3JlIHNuYXBzaG90IGFuZCByZXBsYXlzIGFmdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUm9vdFN0YXRlU3Vic2NyaXB0aW9uKCdjMScsIG5vb3ApKTtcblx0XHQvLyBTZW5kIGVudmVsb3BlIGJlZm9yZSBzbmFwc2hvdFxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiA3IH0sXG5cdFx0XHQyLFxuXHRcdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBOb3cgYXBwbHkgc25hcHNob3Qgd2l0aCBmcm9tU2VxPTE7IGVudmVsb3BlIGF0IHNlcSAyIHNob3VsZCByZXBsYXlcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVJvb3RTdGF0ZSgpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSEgYXMgUm9vdFN0YXRlKS5hY3RpdmVTZXNzaW9ucywgNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcmVkIGVudmVsb3BlcyB3aXRoIHNlcnZlclNlcSA8PSBmcm9tU2VxIGFyZSBkaXNjYXJkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSb290U3RhdGVTdWJzY3JpcHRpb24oJ2MxJywgbm9vcCkpO1xuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiA5OSB9LFxuXHRcdFx0MSxcblx0XHQpKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVJvb3RTdGF0ZSh7IGFjdGl2ZVNlc3Npb25zOiAwIH0pLCAxKTtcblx0XHQvLyBFbnZlbG9wZSBhdCBzZXEgMSBzaG91bGQgbm90IHJlcGxheSBzaW5jZSBmcm9tU2VxID09PSAxXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgUm9vdFN0YXRlKS5hY3RpdmVTZXNzaW9ucywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldEVycm9yIG1ha2VzIHZhbHVlIHJldHVybiB0aGUgZXJyb3InLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSb290U3RhdGVTdWJzY3JpcHRpb24oJ2MxJywgbm9vcCkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlUm9vdFN0YXRlKCksIDApO1xuXHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignZmFpbGVkJyk7XG5cdFx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN1Yi5vbkRpZEVycm9yKGVycm9yID0+IGVycm9ycy5wdXNoKGVycm9yKSkpO1xuXHRcdHN1Yi5zZXRFcnJvcihlcnIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmFsdWU6IHN1Yi52YWx1ZSxcblx0XHRcdHZlcmlmaWVkVmFsdWVFeGlzdHM6ICEhc3ViLnZlcmlmaWVkVmFsdWUsXG5cdFx0XHRlcnJvcnMsXG5cdFx0fSwge1xuXHRcdFx0dmFsdWU6IGVycixcblx0XHRcdHZlcmlmaWVkVmFsdWVFeGlzdHM6IHRydWUsXG5cdFx0XHRlcnJvcnM6IFtlcnJdLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vLyBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25cblxuc3VpdGUoJ1Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcTogbnVtYmVyO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzZXEgPSAwO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdWIodXJpOiBzdHJpbmcgPSBzZXNzaW9uVXJpLCBjbGllbnRJZDogc3RyaW5nID0gJ2MxJyk6IFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uKHVyaSwgY2xpZW50SWQsICgpID0+ICsrc2VxLCBub29wKSk7XG5cdH1cblxuXHR0ZXN0KCd2YWx1ZSBpcyB1bmRlZmluZWQgYmVmb3JlIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmFsdWUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZVNuYXBzaG90IHNldHMgdmFsdWUgYW5kIHZlcmlmaWVkVmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdWIudmFsdWUsIHN0YXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlLCBzdGF0ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5T3B0aW1pc3RpYyByZXR1cm5zIGNsaWVudFNlcSBhbmQgdXBkYXRlcyB2YWx1ZSBidXQgbm90IHZlcmlmaWVkVmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgMCk7XG5cblx0XHRjb25zdCBjbGllbnRTZXEgPSBzdWIuYXBwbHlPcHRpbWlzdGljKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnT3B0aW1pc3RpYycsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50U2VxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnT3B0aW1pc3RpYycpO1xuXHRcdC8vIHZlcmlmaWVkVmFsdWUgc2hvdWxkIHJlbWFpbiB1bmNoYW5nZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZlcmlmaWVkVmFsdWUhLnRpdGxlLCAnVGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maXJtZWQgb3duIGFjdGlvbiByZW1vdmVzIHBlbmRpbmcgYW5kIHVwZGF0ZXMgY29uZmlybWVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHN1Yi5hcHBseU9wdGltaXN0aWMoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0dGl0bGU6ICdPcHRpbWlzdGljJyxcblx0XHR9KTtcblxuXHRcdC8vIFNlcnZlciBjb25maXJtcyB0aGUgYWN0aW9uXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdPcHRpbWlzdGljJyB9LFxuXHRcdFx0MSxcblx0XHRcdHsgY2xpZW50SWQ6ICdjMScsIGNsaWVudFNlcSB9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gQWZ0ZXIgY29uZmlybWF0aW9uLCB2ZXJpZmllZFZhbHVlIHNob3VsZCBtYXRjaFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmVyaWZpZWRWYWx1ZSEudGl0bGUsICdPcHRpbWlzdGljJyk7XG5cdFx0Ly8gTm8gcGVuZGluZywgdmFsdWUgZmFsbHMgdGhyb3VnaCB0byBjb25maXJtZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnT3B0aW1pc3RpYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RlZCBvd24gYWN0aW9uIHJlbW92ZXMgcGVuZGluZyB3aXRob3V0IHVwZGF0aW5nIGNvbmZpcm1lZCcsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cblx0XHRjb25zdCBjbGllbnRTZXEgPSBzdWIuYXBwbHlPcHRpbWlzdGljKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnT3B0aW1pc3RpYycsXG5cdFx0fSk7XG5cblx0XHQvLyBTZXJ2ZXIgcmVqZWN0cyB0aGUgYWN0aW9uXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdPcHRpbWlzdGljJyB9LFxuXHRcdFx0MSxcblx0XHRcdHsgY2xpZW50SWQ6ICdjMScsIGNsaWVudFNlcSB9LFxuXHRcdFx0J2RlbmllZCcsXG5cdFx0KSk7XG5cblx0XHQvLyBDb25maXJtZWQgc3RhdGUgdW5jaGFuZ2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlIS50aXRsZSwgJ1Rlc3QnKTtcblx0XHQvLyBObyBtb3JlIHBlbmRpbmcsIHZhbHVlID0gY29uZmlybWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSwgJ1Rlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yZWlnbiBhY3Rpb24gdXBkYXRlcyBjb25maXJtZWQgYW5kIHJlY29tcHV0ZXMgb3B0aW1pc3RpYycsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cblx0XHQvLyBMb2NhbCBvcHRpbWlzdGljIGFjdGlvblxuXHRcdHN1Yi5hcHBseU9wdGltaXN0aWMoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0dGl0bGU6ICdMb2NhbCcsXG5cdFx0fSk7XG5cblx0XHQvLyBGb3JlaWduIGFjdGlvbiBhcnJpdmVzXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9LFxuXHRcdFx0MSxcblx0XHRcdHsgY2xpZW50SWQ6ICdvdGhlci1jbGllbnQnLCBjbGllbnRTZXE6IDEgfSxcblx0XHQpKTtcblxuXHRcdC8vIENvbmZpcm1lZCBzdGF0ZSBzaG91bGQgaGF2ZSBTZXNzaW9uUmVhZHkgYXBwbGllZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmVyaWZpZWRWYWx1ZSEubGlmZWN5Y2xlLCBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5KTtcblx0XHQvLyBPcHRpbWlzdGljIHNob3VsZCBzdGlsbCBoYXZlICdMb2NhbCcgdGl0bGUgb24gdG9wXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSwgJ0xvY2FsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZlciB0ZXJtaW5hbCB0dXJuIGFjdGlvbiByZW1haW5zIGlnbm9yZWQgYnkgc2Vzc2lvbiBzdWJzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgMCk7XG5cblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0MSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViLnZhbHVlLCBzdGF0ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FmdGVyIGFsbCBwZW5kaW5nIGNsZWFyZWQsIHZhbHVlIGZhbGxzIHRocm91Z2ggdG8gdmVyaWZpZWRWYWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cblx0XHRjb25zdCBjbGllbnRTZXEgPSBzdWIuYXBwbHlPcHRpbWlzdGljKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnVGVtcCcsXG5cdFx0fSk7XG5cblx0XHQvLyBDb25maXJtIHRoZSBwZW5kaW5nIGFjdGlvblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVGVtcCcgfSxcblx0XHRcdDEsXG5cdFx0XHR7IGNsaWVudElkOiAnYzEnLCBjbGllbnRTZXEgfSxcblx0XHQpKTtcblxuXHRcdC8vIHZhbHVlIGFuZCB2ZXJpZmllZFZhbHVlIHNob3VsZCBiZSB0aGUgc2FtZSBvYmplY3QgcmVmZXJlbmNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgc3ViLnZlcmlmaWVkVmFsdWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhclBlbmRpbmcgcmVzZXRzIG9wdGltaXN0aWMgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSksIDApO1xuXG5cdFx0c3ViLmFwcGx5T3B0aW1pc3RpYyh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogJ1BlbmRpbmcnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSwgJ1BlbmRpbmcnKTtcblxuXHRcdHN1Yi5jbGVhclBlbmRpbmcoKTtcblxuXHRcdC8vIFNob3VsZCBmYWxsIGJhY2sgdG8gY29uZmlybWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSwgJ1Rlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBhY3Rpb25zIGZvciBkaWZmZXJlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ090aGVyJyB9LFxuXHRcdFx0MSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCdjb3BpbG90Oi9vdGhlci1zZXNzaW9uJyxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc3ViLnZhbHVlIGFzIFNlc3Npb25TdGF0ZSkudGl0bGUsICdUZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcnMgZW52ZWxvcGVzIGJlZm9yZSBzbmFwc2hvdCBhbmQgcmVwbGF5cyBhZnRlcicsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnQnVmZmVyZWQnIH0sXG5cdFx0XHQyLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc3ViLnZhbHVlISBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnQnVmZmVyZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2Ugb24gb3B0aW1pc3RpYyBhcHBseScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cblx0XHRjb25zdCBmaXJlZDogU2Vzc2lvblN0YXRlW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3ViLm9uRGlkQ2hhbmdlKHMgPT4gZmlyZWQucHVzaChzKSkpO1xuXG5cdFx0c3ViLmFwcGx5T3B0aW1pc3RpYyh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogJ0NoYW5nZWQnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkWzBdLnRpdGxlLCAnQ2hhbmdlZCcpO1xuXHR9KTtcbn0pO1xuXG4vLyBDaGF0U3RhdGVTdWJzY3JpcHRpb25cblxuc3VpdGUoJ0NoYXRTdGF0ZVN1YnNjcmlwdGlvbicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcTogbnVtYmVyO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzZXEgPSAwO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdWIodXJpOiBzdHJpbmcgPSBjaGF0VXJpLCBjbGllbnRJZDogc3RyaW5nID0gJ2MxJyk6IENoYXRTdGF0ZVN1YnNjcmlwdGlvbiB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uKHVyaSwgY2xpZW50SWQsICgpID0+ICsrc2VxLCBub29wKSk7XG5cdH1cblxuXHR0ZXN0KCdzZXJ2ZXIgdGVybWluYWwgdHVybiBhY3Rpb24gZHJvcHMgc3RhbGUgb3B0aW1pc3RpYyB0dXJuIHN0YXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlQ2hhdFN0YXRlKGNoYXRVcmkpLCAwKTtcblxuXHRcdHN1Yi5hcHBseU9wdGltaXN0aWMoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgQ2hhdFN0YXRlIHwgdW5kZWZpbmVkKT8uYWN0aXZlVHVybj8uaWQsICd0dXJuLTEnKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHQxLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmVUdXJuOiAoc3ViLnZhbHVlIGFzIENoYXRTdGF0ZSB8IHVuZGVmaW5lZCk/LmFjdGl2ZVR1cm4sXG5cdFx0XHR0dXJuczogKHN1Yi52YWx1ZSBhcyBDaGF0U3RhdGUgfCB1bmRlZmluZWQpPy50dXJucy5tYXAodHVybiA9PiAoeyBpZDogdHVybi5pZCwgc3RhdGU6IHR1cm4uc3RhdGUgfSkpLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHRcdHR1cm5zOiBbeyBpZDogJ3R1cm4tMScsIHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUgfV0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8vIFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb25cblxuc3VpdGUoJ1Rlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24nLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhY2NlcHRzIHRlcm1pbmFsIGFjdGlvbnMgbWF0Y2hpbmcgaXRzIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24odGVybWluYWxVcmksICdjMScsIG5vb3ApKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVRlcm1pbmFsU3RhdGUoKSwgMCk7XG5cblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGE6ICdoZWxsbycgfSxcblx0XHRcdDEsXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgVGVybWluYWxTdGF0ZSkuY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6ICdoZWxsbycgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGF0YSBiZXR3ZWVuIGNvbW1hbmQgZXhlY3V0ZWQgYW5kIGZpbmlzaGVkIGlzIGF0dHJpYnV0ZWQgdG8gdGhlIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uKHRlcm1pbmFsVXJpLCAnYzEnLCBub29wKSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VUZXJtaW5hbFN0YXRlKCksIDApO1xuXG5cdFx0Ly8gVGhlIHNlcnZlciBkaXNwYXRjaGVzIGRhdGEgaW4gc3RyZWFtIG9yZGVyIHJlbGF0aXZlIHRvIGNvbW1hbmRcblx0XHQvLyBldmVudHMsIHNvIGEgY29tbWFuZCdzIG91dHB1dCBhcnJpdmVzIGJldHdlZW4gdGhlIGV4ZWN1dGVkIGFuZFxuXHRcdC8vIGZpbmlzaGVkIGFjdGlvbnMgYW5kIG11c3QgbGFuZCBpbiB0aGUgY29tbWFuZCBwYXJ0LCBub3QgaW4gYVxuXHRcdC8vIHRyYWlsaW5nIHVuY2xhc3NpZmllZCBwYXJ0LlxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkLCBjb21tYW5kSWQ6ICdjbWQtMScsIGNvbW1hbmRMaW5lOiAnZWNobyBoaScsIHRpbWVzdGFtcDogMTAwMCB9LFxuXHRcdFx0MSxcblx0XHQpKTtcblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGE6ICdoaVxcclxcbicgfSxcblx0XHRcdDIsXG5cdFx0KSk7XG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQsIGNvbW1hbmRJZDogJ2NtZC0xJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDUgfSxcblx0XHRcdDMsXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgVGVybWluYWxTdGF0ZSkuY29udGVudCwgW3tcblx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdGNvbW1hbmRJZDogJ2NtZC0xJyxcblx0XHRcdGNvbW1hbmRMaW5lOiAnZWNobyBoaScsXG5cdFx0XHRvdXRwdXQ6ICdoaVxcclxcbicsXG5cdFx0XHR0aW1lc3RhbXA6IDEwMDAsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRkdXJhdGlvbk1zOiA1LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB0ZXJtaW5hbCBhY3Rpb25zIGZvciBvdGhlciBVUklzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvbih0ZXJtaW5hbFVyaSwgJ2MxJywgbm9vcCkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlVGVybWluYWxTdGF0ZSgpLCAwKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ25vcGUnIH0sXG5cdFx0XHQxLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J2FnZW50aG9zdC10ZXJtaW5hbDovb3RoZXItdGVybScsXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgVGVybWluYWxTdGF0ZSkuY29udGVudCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIG5vbi10ZXJtaW5hbCBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvbih0ZXJtaW5hbFVyaSwgJ2MxJywgbm9vcCkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlVGVybWluYWxTdGF0ZSgpLCAwKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiA1IH0sXG5cdFx0XHQxLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoc3ViLnZhbHVlIGFzIFRlcm1pbmFsU3RhdGUpLmNvbnRlbnQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlU25hcHNob3Qgc2V0cyB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24odGVybWluYWxVcmksICdjMScsIG5vb3ApKTtcblx0XHRjb25zdCBzdGF0ZSA9IG1ha2VUZXJtaW5hbFN0YXRlKHsgdGl0bGU6ICd6c2gnIH0pO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdWIudmFsdWUsIHN0YXRlKTtcblx0fSk7XG59KTtcblxuLy8gQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyXG5cbnN1aXRlKCdBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXInLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBzZXE6IG51bWJlcjtcblx0bGV0IHN1YnNjcmliZWRSZXNvdXJjZXM6IHN0cmluZ1tdO1xuXHRsZXQgdW5zdWJzY3JpYmVkUmVzb3VyY2VzOiBzdHJpbmdbXTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c2VxID0gMDtcblx0XHRzdWJzY3JpYmVkUmVzb3VyY2VzID0gW107XG5cdFx0dW5zdWJzY3JpYmVkUmVzb3VyY2VzID0gW107XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1hbmFnZXIoc3Vic2NyaWJlOiAocmVzb3VyY2U6IFVSSSkgPT4gUHJvbWlzZTx7IHJlc291cmNlOiBzdHJpbmc7IHN0YXRlOiBTZXNzaW9uU3RhdGUgfCBUZXJtaW5hbFN0YXRlIHwgQ2hhbmdlc2V0U3RhdGU7IGZyb21TZXE6IG51bWJlciB9PiA9IGFzeW5jIChyZXNvdXJjZSkgPT4ge1xuXHRcdHN1YnNjcmliZWRSZXNvdXJjZXMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmIChrZXkuc3RhcnRzV2l0aCgnY29waWxvdDonKSkge1xuXHRcdFx0cmV0dXJuIHsgcmVzb3VyY2U6IGtleSwgc3RhdGU6IG1ha2VTZXNzaW9uU3RhdGUoa2V5KSwgZnJvbVNlcTogMCB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyByZXNvdXJjZToga2V5LCBzdGF0ZTogbWFrZVRlcm1pbmFsU3RhdGUoKSwgZnJvbVNlcTogMCB9O1xuXHR9KTogQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXIoXG5cdFx0XHQnYzEnLFxuXHRcdFx0KCkgPT4gKytzZXEsXG5cdFx0XHRub29wLFxuXHRcdFx0c3Vic2NyaWJlLFxuXHRcdFx0KHJlc291cmNlKSA9PiB7XG5cdFx0XHRcdHVuc3Vic2NyaWJlZFJlc291cmNlcy5wdXNoKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0fVxuXG5cdHRlc3QoJ3Jvb3RTdGF0ZSBpcyBhdmFpbGFibGUgaW1tZWRpYXRlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGFzc2VydC5vayhtZ3Iucm9vdFN0YXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWdyLnJvb3RTdGF0ZS52YWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlUm9vdFNuYXBzaG90IGluaXRpYWxpemVzIHJvb3Qgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHN0YXRlID0gbWFrZVJvb3RTdGF0ZSh7IGFjdGl2ZVNlc3Npb25zOiAyIH0pO1xuXHRcdG1nci5oYW5kbGVSb290U25hcHNob3Qoc3RhdGUsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWdyLnJvb3RTdGF0ZS52YWx1ZSwgc3RhdGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTdWJzY3JpcHRpb24gcmV0dXJucyBJUmVmZXJlbmNlIHdpdGggc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQub2socmVmLm9iamVjdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZi5vYmplY3QudmFsdWUsIHVuZGVmaW5lZCk7IC8vIG5vdCB5ZXQgaW5pdGlhbGl6ZWQgKGFzeW5jKVxuXG5cdFx0Ly8gV2FpdCBmb3IgYXN5bmMgc3Vic2NyaWJlXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5vayhyZWYub2JqZWN0LnZhbHVlKTtcblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWNvbmQgY2FsbCBmb3Igc2FtZSByZXNvdXJjZSBpbmNyZW1lbnRzIHJlZmNvdW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVmMSA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgdXJpLCAndGVzdCcpO1xuXHRcdGNvbnN0IHJlZjIgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHVyaSwgJ3Rlc3QnKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHQvLyBTaG91bGQgYmUgdGhlIHNhbWUgc3Vic2NyaXB0aW9uIG9iamVjdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWYxLm9iamVjdCwgcmVmMi5vYmplY3QpO1xuXG5cdFx0Ly8gRGlzcG9zaW5nIG9uZSByZWYgc2hvdWxkIG5vdCB0cmlnZ2VyIHVuc3Vic2NyaWJlXG5cdFx0cmVmMS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3Vic2NyaWJlZFJlc291cmNlcy5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gRGlzcG9zaW5nIHRoZSBsYXN0IHJlZiBzaG91bGQgdHJpZ2dlciB1bnN1YnNjcmliZVxuXHRcdHJlZjIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN1YnNjcmliZWRSZXNvdXJjZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zaW5nIGxhc3QgcmVmIGNhbGxzIHVuc3Vic2NyaWJlIGNhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2sodW5zdWJzY3JpYmVkUmVzb3VyY2VzLmluY2x1ZGVzKHNlc3Npb25VcmkpKTtcblx0fSk7XG5cblx0dGVzdCgncmVjZWl2ZUVudmVsb3BlIHJvdXRlcyB0byByb290IGFuZCBhbGwgYWN0aXZlIHN1YnNjcmlwdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdG1nci5oYW5kbGVSb290U25hcHNob3QobWFrZVJvb3RTdGF0ZSgpLCAwKTtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHVyaSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0Ly8gU2VuZCBhIHJvb3QgYWN0aW9uXG5cdFx0bWdyLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IDEwIH0sXG5cdFx0XHQxLFxuXHRcdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobWdyLnJvb3RTdGF0ZS52YWx1ZSBhcyBSb290U3RhdGUpLmFjdGl2ZVNlc3Npb25zLCAxMCk7XG5cblx0XHQvLyBTZW5kIGEgc2Vzc2lvbiBhY3Rpb25cblx0XHRtZ3IucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1JvdXRlZCcgfSxcblx0XHRcdDIsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZWYub2JqZWN0LnZhbHVlIGFzIFNlc3Npb25TdGF0ZSkudGl0bGUsICdSb3V0ZWQnKTtcblxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQWN0aW9uRW52ZWxvcGVSZWxldmFudFRvU3Vic2NyaXB0aW9uVXJpcyBmaWx0ZXJzIGJ5IHN1YnNjcmliZWQgY2hhbm5lbCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJvb3RWYXJpYW50OiBpc0FjdGlvbkVudmVsb3BlUmVsZXZhbnRUb1N1YnNjcmlwdGlvblVyaXMoXG5cdFx0XHRcdG1ha2VFbnZlbG9wZSh7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IDEgfSwgMSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFJPT1RfU1RBVEVfVVJJKSxcblx0XHRcdFx0WydhaHAtcm9vdDonXSxcblx0XHRcdCksXG5cdFx0XHRyb290T25seUdldHNTZXNzaW9uOiBpc0FjdGlvbkVudmVsb3BlUmVsZXZhbnRUb1N1YnNjcmlwdGlvblVyaXMoXG5cdFx0XHRcdG1ha2VFbnZlbG9wZSh7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdOb3BlJyB9LCAyKSxcblx0XHRcdFx0WydhaHAtcm9vdDonXSxcblx0XHRcdCksXG5cdFx0XHRleGFjdFNlc3Npb246IGlzQWN0aW9uRW52ZWxvcGVSZWxldmFudFRvU3Vic2NyaXB0aW9uVXJpcyhcblx0XHRcdFx0bWFrZUVudmVsb3BlKHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1llcCcgfSwgMyksXG5cdFx0XHRcdFsnYWhwLXJvb3Q6Jywgc2Vzc2lvblVyaV0sXG5cdFx0XHQpLFxuXHRcdH0sIHtcblx0XHRcdHJvb3RWYXJpYW50OiB0cnVlLFxuXHRcdFx0cm9vdE9ubHlHZXRzU2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRleGFjdFNlc3Npb246IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0aW5nIHNlc3Npb24gc3Vic2NyaXB0aW9uIGZvciBjb3BpbG90OiBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IG15U2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvbXktc2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBteVNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5vayhyZWYub2JqZWN0LnZhbHVlKTtcblx0XHRhc3NlcnQub2soc3Vic2NyaWJlZFJlc291cmNlcy5pbmNsdWRlcyhteVNlc3Npb25VcmkudG9TdHJpbmcoKSkpO1xuXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRpbmcgdGVybWluYWwgc3Vic2NyaXB0aW9uIGZvciB0ZXJtaW5hbCBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh0ZXJtaW5hbFVyaSk7XG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxUZXJtaW5hbFN0YXRlPihTdGF0ZUNvbXBvbmVudHMuVGVybWluYWwsIHVyaSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlZi5vYmplY3QudmFsdWUpO1xuXHRcdGFzc2VydC5vayhzdWJzY3JpYmVkUmVzb3VyY2VzLmluY2x1ZGVzKHRlcm1pbmFsVXJpKSk7XG5cblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaE9wdGltaXN0aWMgYXBwbGllcyB0byBtYXRjaGluZyBzZXNzaW9uIHN1YnNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgdXJpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRjb25zdCBjbGllbnRTZXEgPSBtZ3IuZGlzcGF0Y2hPcHRpbWlzdGljKHVyaS50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogJ0Rpc3BhdGNoZWQnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGNsaWVudFNlcSA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVmLm9iamVjdC52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnRGlzcGF0Y2hlZCcpO1xuXHRcdC8vIHZlcmlmaWVkVmFsdWUgdW5jaGFuZ2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZi5vYmplY3QudmVyaWZpZWRWYWx1ZSEudGl0bGUsICdUZXN0Jyk7XG5cblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaE9wdGltaXN0aWMgYXBwbGllcyB0byBtYXRjaGluZyBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlOiBDaGFuZ2VzZXRTdGF0ZSA9IHtcblx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LFxuXHRcdFx0ZmlsZXM6IFt7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy90ZXN0LnR4dCcsXG5cdFx0XHRcdGVkaXQ6IHtcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3Rlc3QudHh0JywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL2FmdGVyLnR4dCcgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKGFzeW5jIHJlc291cmNlID0+ICh7IHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLCBzdGF0ZSwgZnJvbVNlcTogMCB9KSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGNoYW5nZXNldFVyaSk7XG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxDaGFuZ2VzZXRTdGF0ZT4oU3RhdGVDb21wb25lbnRzLkNoYW5nZXNldCwgdXJpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRjb25zdCBjbGllbnRTZXEgPSBtZ3IuZGlzcGF0Y2hPcHRpbWlzdGljKHVyaS50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVzUmV2aWV3Q2hhbmdlZCxcblx0XHRcdGZpbGVzOiBbJ2ZpbGU6Ly8vdGVzdC50eHQnXSxcblx0XHRcdHJldmlld2VkOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGllbnRTZXEsXG5cdFx0XHRvcHRpbWlzdGljUmV2aWV3ZWQ6IChyZWYub2JqZWN0LnZhbHVlIGFzIENoYW5nZXNldFN0YXRlKS5maWxlc1swXS5yZXZpZXdlZCxcblx0XHRcdHZlcmlmaWVkUmV2aWV3ZWQ6IHJlZi5vYmplY3QudmVyaWZpZWRWYWx1ZT8uZmlsZXNbMF0ucmV2aWV3ZWQsXG5cdFx0fSwge1xuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0b3B0aW1pc3RpY1Jldmlld2VkOiB0cnVlLFxuXHRcdFx0dmVyaWZpZWRSZXZpZXdlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBjbGVhcnMgYWxsIHN1YnNjcmlwdGlvbnMgYW5kIGNhbGxzIHVuc3Vic2NyaWJlIGZvciBlYWNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblxuXHRcdGNvbnN0IHJlZjEgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIFVSSS5wYXJzZShzZXNzaW9uVXJpKSwgJ3Rlc3QnKTtcblx0XHRjb25zdCByZWYyID0gbWdyLmdldFN1YnNjcmlwdGlvbjxUZXJtaW5hbFN0YXRlPihTdGF0ZUNvbXBvbmVudHMuVGVybWluYWwsIFVSSS5wYXJzZSh0ZXJtaW5hbFVyaSksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdC8vIFJlbW92ZSB0aGUgbWFuYWdlciBmcm9tIGRpc3Bvc2FibGVzIHNvIHdlIGNhbiBkaXNwb3NlIGl0IG1hbnVhbGx5XG5cdFx0Ly8gd2l0aG91dCBkb3VibGUtZGlzcG9zZVxuXHRcdGRpc3Bvc2FibGVzLmRlbGV0ZShtZ3IpO1xuXHRcdG1nci5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQub2sodW5zdWJzY3JpYmVkUmVzb3VyY2VzLmluY2x1ZGVzKHNlc3Npb25VcmkpKTtcblx0XHRhc3NlcnQub2sodW5zdWJzY3JpYmVkUmVzb3VyY2VzLmluY2x1ZGVzKHRlcm1pbmFsVXJpKSk7XG5cblx0XHQvLyBDbGVhbiB1cCByZWZzIChhbHJlYWR5IGRpc3Bvc2VkIHdpdGggbWFuYWdlciwgYnV0IHNhZmUgdG8gY2FsbClcblx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRyZWYyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gc3Vic2NyaXB0aW9uIGV4aXN0cycsICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWdyLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxTZXNzaW9uU3RhdGU+KFVSSS5wYXJzZSgnY29waWxvdDovbm9uZXhpc3RlbnQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkIHJldHVybnMgZXhpc3Rpbmcgc3Vic2NyaXB0aW9uIHdpdGhvdXQgYWZmZWN0aW5nIHJlZmNvdW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cblx0XHQvLyBDcmVhdGUgYSBzdWJzY3JpcHRpb24gdmlhIGdldFN1YnNjcmlwdGlvblxuXHRcdGNvbnN0IHJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgdXJpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHQvLyBHZXQgaXQgdW5tYW5hZ2VkXG5cdFx0Y29uc3QgdW5tYW5hZ2VkID0gbWdyLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxTZXNzaW9uU3RhdGU+KHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHVubWFuYWdlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVubWFuYWdlZCwgcmVmLm9iamVjdCk7XG5cblx0XHQvLyBEaXNwb3NlIHRoZSByZWYuIFN1YnNjcmlwdGlvbiBzaG91bGQgYmUgcmVsZWFzZWQgKHJlZmNvdW50IHdhcyAxKVxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cblx0XHQvLyBOb3cgdW5tYW5hZ2VkIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkIHNpbmNlIGl0IHdhcyByZWxlYXNlZFxuXHRcdGNvbnN0IGFmdGVyID0gbWdyLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxTZXNzaW9uU3RhdGU+KHVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFmdGVyLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTdWJzY3JpcHRpb24gcmV0cmllcyBhZnRlciBhIGZhaWxlZCBzdWJzY3JpYmUgZm9yIHRoZSBzYW1lIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzdWJzY3JpYmVBdHRlbXB0cyA9IDA7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcihhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRzdWJzY3JpYmVkUmVzb3VyY2VzLnB1c2gocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRzdWJzY3JpYmVBdHRlbXB0cysrO1xuXHRcdFx0aWYgKHN1YnNjcmliZUF0dGVtcHRzID09PSAxKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IGZvdW5kIHlldCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlOiBtYWtlU2Vzc2lvblN0YXRlKHJlc291cmNlLnRvU3RyaW5nKCksIHsgdGl0bGU6ICdSZXRyaWVkJyB9KSwgZnJvbVNlcTogMCB9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpKTtcblxuXHRcdGNvbnN0IGZhaWxlZFJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgdXJpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQub2soZmFpbGVkUmVmLm9iamVjdC52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKTtcblxuXHRcdGNvbnN0IHJldHJ5UmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3Vic2NyaWJlQXR0ZW1wdHMsXG5cdFx0XHRyZXRyaWVkVGl0bGU6IChyZXRyeVJlZi5vYmplY3QudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSxcblx0XHRcdHVubWFuYWdlZElzUmV0cnk6IG1nci5nZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8U2Vzc2lvblN0YXRlPih1cmkpID09PSByZXRyeVJlZi5vYmplY3QsXG5cdFx0fSwge1xuXHRcdFx0c3Vic2NyaWJlQXR0ZW1wdHM6IDIsXG5cdFx0XHRyZXRyaWVkVGl0bGU6ICdSZXRyaWVkJyxcblx0XHRcdHVubWFuYWdlZElzUmV0cnk6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRmYWlsZWRSZWYuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZ3IuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFNlc3Npb25TdGF0ZT4odXJpKSwgcmV0cnlSZWYub2JqZWN0KTtcblxuXHRcdHJldHJ5UmVmLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWdyLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxTZXNzaW9uU3RhdGU+KHVyaSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVN1YnNjcmlwdGlvbnMgcmVwb3J0cyBraW5kLCByZWZDb3VudCwgaG9sZGVycyBhbmQgc3RhdHVzIHBlciBhY3RpdmUgc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCBzVXJpID0gVVJJLnBhcnNlKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHRVcmkgPSBVUkkucGFyc2UodGVybWluYWxVcmkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc1VyaSwgJ1Nlc3Npb25Ib2xkZXInKTtcblx0XHRjb25zdCBzZXNzaW9uUmVmMiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc1VyaSwgJ1Nlc3Npb25Ib2xkZXInKTtcblx0XHRjb25zdCB0ZXJtaW5hbFJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248VGVybWluYWxTdGF0ZT4oU3RhdGVDb21wb25lbnRzLlRlcm1pbmFsLCB0VXJpLCAnVGVybWluYWxIb2xkZXInKTtcblxuXHRcdGNvbnN0IG1hcCA9ICgpID0+IG1nci5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKCkubWFwKHMgPT4gKHsgcmVzb3VyY2U6IHMucmVzb3VyY2UudG9TdHJpbmcoKSwga2luZDogcy5raW5kLCByZWZDb3VudDogcy5yZWZDb3VudCwgaG9sZGVyczogcy5ob2xkZXJzLCBzdGF0dXM6IHMuc3RhdHVzIH0pKTtcblx0XHRjb25zdCBwZW5kaW5nID0gbWFwKCk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0Y29uc3QgYWN0aXZlID0gbWFwKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcGVuZGluZywgYWN0aXZlIH0sIHtcblx0XHRcdHBlbmRpbmc6IFtcblx0XHRcdFx0eyByZXNvdXJjZTogc2Vzc2lvblVyaSwga2luZDogU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHJlZkNvdW50OiAyLCBob2xkZXJzOiBbeyBvd25lcjogJ1Nlc3Npb25Ib2xkZXInLCBjb3VudDogMiB9XSwgc3RhdHVzOiAncGVuZGluZycgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogdGVybWluYWxVcmksIGtpbmQ6IFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbCwgcmVmQ291bnQ6IDEsIGhvbGRlcnM6IFt7IG93bmVyOiAnVGVybWluYWxIb2xkZXInLCBjb3VudDogMSB9XSwgc3RhdHVzOiAncGVuZGluZycgfSxcblx0XHRcdF0sXG5cdFx0XHRhY3RpdmU6IFtcblx0XHRcdFx0eyByZXNvdXJjZTogc2Vzc2lvblVyaSwga2luZDogU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHJlZkNvdW50OiAyLCBob2xkZXJzOiBbeyBvd25lcjogJ1Nlc3Npb25Ib2xkZXInLCBjb3VudDogMiB9XSwgc3RhdHVzOiAnc25hcHNob3QnIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IHRlcm1pbmFsVXJpLCBraW5kOiBTdGF0ZUNvbXBvbmVudHMuVGVybWluYWwsIHJlZkNvdW50OiAxLCBob2xkZXJzOiBbeyBvd25lcjogJ1Rlcm1pbmFsSG9sZGVyJywgY291bnQ6IDEgfV0sIHN0YXR1czogJ3NuYXBzaG90JyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdHNlc3Npb25SZWYuZGlzcG9zZSgpO1xuXHRcdHNlc3Npb25SZWYyLmRpc3Bvc2UoKTtcblx0XHR0ZXJtaW5hbFJlZi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWdyLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBY3RpdmVTdWJzY3JpcHRpb25zIHRyYWNrcyBkaXN0aW5jdCBob2xkZXJzIGFuZCBkcm9wcyB0aGVtIGFzIHJlZmVyZW5jZXMgYXJlIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCBzVXJpID0gVVJJLnBhcnNlKHNlc3Npb25VcmkpO1xuXG5cdFx0Y29uc3QgcmVmQSA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc1VyaSwgJ0hvbGRlckEnKTtcblx0XHRjb25zdCByZWZCID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzVXJpLCAnSG9sZGVyQicpO1xuXHRcdGNvbnN0IHJlZkIyID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzVXJpLCAnSG9sZGVyQicpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRjb25zdCB3aXRoQWxsID0gbWdyLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKVswXS5ob2xkZXJzO1xuXG5cdFx0cmVmQi5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgYWZ0ZXJPbmVCID0gbWdyLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKVswXS5ob2xkZXJzO1xuXG5cdFx0Ly8gRGlzcG9zaW5nIHRoZSBzYW1lIHJlZmVyZW5jZSB0d2ljZSBtdXN0IG5vdCBvdmVyLXJlbW92ZSBob2xkZXJzLlxuXHRcdHJlZkIuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IGFmdGVyRG91YmxlRGlzcG9zZSA9IG1nci5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKClbMF0uaG9sZGVycztcblxuXHRcdHJlZkEuZGlzcG9zZSgpO1xuXHRcdHJlZkIyLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB3aXRoQWxsLCBhZnRlck9uZUIsIGFmdGVyRG91YmxlRGlzcG9zZSwgcmVtYWluaW5nOiBtZ3IuZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpLmxlbmd0aCB9LCB7XG5cdFx0XHQvLyBTb3J0ZWQgYnkgZGVzY2VuZGluZyBjb3VudCwgc28gSG9sZGVyQiAoMikgcHJlY2VkZXMgSG9sZGVyQSAoMSkuXG5cdFx0XHR3aXRoQWxsOiBbeyBvd25lcjogJ0hvbGRlckInLCBjb3VudDogMiB9LCB7IG93bmVyOiAnSG9sZGVyQScsIGNvdW50OiAxIH1dLFxuXHRcdFx0YWZ0ZXJPbmVCOiBbeyBvd25lcjogJ0hvbGRlckEnLCBjb3VudDogMSB9LCB7IG93bmVyOiAnSG9sZGVyQicsIGNvdW50OiAxIH1dLFxuXHRcdFx0YWZ0ZXJEb3VibGVEaXNwb3NlOiBbeyBvd25lcjogJ0hvbGRlckEnLCBjb3VudDogMSB9LCB7IG93bmVyOiAnSG9sZGVyQicsIGNvdW50OiAxIH1dLFxuXHRcdFx0cmVtYWluaW5nOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBY3RpdmVTdWJzY3JpcHRpb25zIHJlcG9ydHMgZXJyb3Igc3RhdHVzIGZvciBhIGZhaWxlZCBzdWJzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcihhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm9wZScpOyB9KTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIFVSSS5wYXJzZShzZXNzaW9uVXJpKSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG1nci5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKCkubWFwKHMgPT4gKHsga2luZDogcy5raW5kLCBzdGF0dXM6IHMuc3RhdHVzIH0pKSxcblx0XHRcdFt7IGtpbmQ6IFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzdGF0dXM6ICdlcnJvcicgfV0sXG5cdFx0KTtcblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFtRTtBQUM1RSxTQUFTLGlCQUFpQixhQUFhLGtCQUFrQixlQUFlLG1CQUFtQixpQkFBa0g7QUFDN00sU0FBUyxxQkFBcUIsaUJBQWlCLDBCQUEwQixnQkFBZ0IsdUJBQXVDO0FBQ2hJLFNBQVMsMEJBQTBCLDRCQUE0Qix1QkFBdUIsNENBQTRDLHVCQUF1QiwwQkFBMEIsaUNBQWlDO0FBSXBOLFNBQVMsY0FBYyxXQUEyQztBQUNqRSxTQUFPO0FBQUEsSUFDTixRQUFRLENBQUM7QUFBQSxJQUNULGdCQUFnQjtBQUFBLElBQ2hCLFdBQVcsQ0FBQztBQUFBLElBQ1osR0FBRztBQUFBLEVBQ0o7QUFDRDtBQUVBLFNBQVMsbUJBQW1CQSxhQUFvQztBQUMvRCxTQUFPO0FBQUEsSUFDTixVQUFVQTtBQUFBLElBQ1YsVUFBVTtBQUFBLElBQ1YsT0FBTztBQUFBLElBQ1AsUUFBUSxjQUFjO0FBQUEsSUFDdEIsWUFBVyxvQkFBSSxLQUFLLENBQUMsR0FBRSxZQUFZO0FBQUEsSUFDbkMsYUFBWSxvQkFBSSxLQUFLLENBQUMsR0FBRSxZQUFZO0FBQUEsSUFD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
