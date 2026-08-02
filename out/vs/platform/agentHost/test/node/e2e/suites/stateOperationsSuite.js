import assert from "assert";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { SessionConfigKey } from "../../../../common/sessionConfigKeys.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { TerminalClaimKind } from "../../../../common/state/protocol/state.js";
import {
  buildDefaultChatUri,
  MessageKind,
  PendingMessageKind,
  ROOT_STATE_URI,
  SessionStatus
} from "../../../../common/state/sessionState.js";
import { createRealSession } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineStateOperationsTests(context) {
  const { config, createdSessions, tempDirs } = context;
  async function createSession(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-state-${prefix}-`));
    tempDirs.push(workspace);
    const clientId = `${prefix}-${config.provider}`;
    const sessionUri = await createRealSession(context.client, config, clientId, createdSessions, URI.file(workspace));
    return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), clientId, workspace };
  }
  async function sessionState(sessionUri) {
    const result = await context.client.call("subscribe", { channel: sessionUri });
    return result.snapshot.state;
  }
  async function chatState(chatUri) {
    const result = await context.client.call("subscribe", { channel: chatUri });
    return result.snapshot.state;
  }
  async function terminalState(terminalUri) {
    const result = await context.client.call("subscribe", { channel: terminalUri });
    return result.snapshot.state;
  }
  function terminalText(state) {
    return state.content.map((part) => part.type === "command" ? part.output : part.value).join("");
  }
  async function dispatchAndWait(channel, clientSeq, action) {
    context.client.clearReceived();
    context.client.dispatch({ channel, clientSeq, action });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === channel
    );
  }
  function userMessage(text) {
    return { text, origin: { kind: MessageKind.User } };
  }
  async function createTerminal(prefix) {
    const { sessionUri, clientId, workspace } = await createSession(prefix);
    const terminalUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${generateUuid()}` }).toString();
    await context.client.call("createTerminal", {
      channel: terminalUri,
      claim: { kind: TerminalClaimKind.Client, clientId },
      name: `E2E ${prefix}`,
      cwd: URI.file(workspace).toString(),
      cols: 90,
      rows: 30
    });
    await context.client.call("subscribe", { channel: terminalUri });
    return { sessionUri, terminalUri, clientId, workspace };
  }
  async function disposeTerminal(terminalUri) {
    await context.client.call("disposeTerminal", { channel: terminalUri });
  }
  async function withTerminal(prefix, run) {
    const terminal = await createTerminal(prefix);
    try {
      return await run(terminal);
    } finally {
      await disposeTerminal(terminal.terminalUri);
    }
  }
  conformanceTest(context, "client title change updates session state", async function() {
    const { sessionUri } = await createSession("title-change");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionTitleChanged, title: "Direct AHP Title" });
    assert.strictEqual((await sessionState(sessionUri)).title, "Direct AHP Title");
  });
  conformanceTest(context, "marking a session read sets the read status flag", async function() {
    const { sessionUri } = await createSession("read-set");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });
    assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsRead);
  });
  conformanceTest(context, "marking a session unread clears the read status flag", async function() {
    const { sessionUri } = await createSession("read-clear");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });
    await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsReadChanged, isRead: false });
    assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsRead, 0);
  });
  conformanceTest(context, "archiving a session sets the archived status flag", async function() {
    const { sessionUri } = await createSession("archive-set");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsArchived);
  });
  conformanceTest(context, "unarchiving a session clears the archived status flag", async function() {
    const { sessionUri } = await createSession("archive-clear");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsArchivedChanged, isArchived: false });
    assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsArchived, 0);
  });
  conformanceTest(context, "session config changes merge with existing values", async function() {
    const { sessionUri } = await createSession("config-merge");
    const before = await sessionState(sessionUri);
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.AutoApprove]: "assisted" }
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {
      ...before.config?.values,
      [SessionConfigKey.AutoApprove]: "assisted"
    });
  });
  conformanceTest(context, "session config replacement drops previous values", async function() {
    const { sessionUri } = await createSession("config-replace");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.AutoApprove]: "default" },
      replace: true
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {
      [SessionConfigKey.AutoApprove]: "default"
    });
  });
  conformanceTest(context, "active client set adds a session participant", async function() {
    const { sessionUri, clientId } = await createSession("active-client-add");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "Coverage Client", tools: [] }
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, [{
      clientId,
      displayName: "Coverage Client",
      tools: []
    }]);
  });
  conformanceTest(context, "active client set replaces an existing participant", async function() {
    const { sessionUri, clientId } = await createSession("active-client-update");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "Before", tools: [] }
    });
    await dispatchAndWait(sessionUri, 2, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "After", tools: [] }
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).activeClients.map((client) => client.displayName), ["After"]);
  });
  conformanceTest(context, "active client removal removes the session participant", async function() {
    const { sessionUri, clientId } = await createSession("active-client-remove");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "Coverage Client", tools: [] }
    });
    await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionActiveClientRemoved, clientId });
    assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, []);
  });
  conformanceTest(context, "draft change stores a user message", async function() {
    const { chatUri } = await createSession("draft-set");
    const draft = userMessage("draft text");
    await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft });
    assert.deepStrictEqual((await chatState(chatUri)).draft, draft);
  });
  conformanceTest(context, "draft change replaces the previous message", async function() {
    const { chatUri } = await createSession("draft-replace");
    await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage("before") });
    await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged, draft: userMessage("after") });
    assert.deepStrictEqual((await chatState(chatUri)).draft, userMessage("after"));
  });
  conformanceTest(context, "clearing a draft removes it from chat state", async function() {
    const { chatUri } = await createSession("draft-clear");
    await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage("draft") });
    await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged });
    assert.strictEqual((await chatState(chatUri)).draft, void 0);
  });
  conformanceTest(context, "a message queued on an idle chat is promoted straight into a turn", async function() {
    const { chatUri } = await createSession("queue-promote");
    context.client.clearReceived();
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatPendingMessageSet,
      kind: PendingMessageKind.Queued,
      id: "queued-1",
      message: userMessage("/rename Queue Promoted")
    });
    const started = await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnStarted") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.queuedMessageId === "queued-1",
      3e4
    );
    const turnId = getActionEnvelope(started).action.turnId;
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      6e4
    );
    assert.deepStrictEqual((await chatState(chatUri)).queuedMessages ?? [], []);
  });
  conformanceTest(context, "removing a missing queued message leaves chat state unchanged", async function() {
    const { chatUri } = await createSession("queue-remove-missing");
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatPendingMessageRemoved,
      kind: PendingMessageKind.Queued,
      id: "missing"
    });
    assert.strictEqual((await chatState(chatUri)).queuedMessages, void 0);
  });
  conformanceTest(context, "reordering a missing queue leaves chat state unchanged", async function() {
    const { chatUri } = await createSession("queue-reorder-missing");
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatQueuedMessagesReordered,
      order: ["missing"]
    });
    assert.strictEqual((await chatState(chatUri)).queuedMessages, void 0);
  });
  conformanceTest(context, "truncating at a missing turn leaves history unchanged", async function() {
    const { chatUri } = await createSession("truncate-missing");
    const before = await chatState(chatUri);
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatTruncated,
      turnId: "missing-turn"
    });
    assert.deepStrictEqual((await chatState(chatUri)).turns, before.turns);
  });
  conformanceTest(context, "cancelling a missing turn leaves the chat idle", async function() {
    const { chatUri } = await createSession("cancel-missing");
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatTurnCancelled,
      turnId: "missing-turn",
      duration: 0
    });
    const state = await chatState(chatUri);
    assert.deepStrictEqual(
      { activeTurn: state.activeTurn, turns: state.turns, status: state.status },
      { activeTurn: void 0, turns: [], status: SessionStatus.Idle }
    );
  });
  conformanceTest(context, "createTerminal exposes requested dimensions cwd and claim", async function() {
    await withTerminal("terminal-create", async ({ terminalUri, clientId, workspace }) => {
      const state = await terminalState(terminalUri);
      assert.deepStrictEqual({
        cwd: state.cwd,
        cols: state.cols,
        rows: state.rows,
        claim: state.claim
      }, {
        cwd: URI.file(workspace).fsPath,
        cols: 90,
        rows: 30,
        claim: { kind: TerminalClaimKind.Client, clientId }
      });
    });
  });
  conformanceTest(context, "terminal resize updates terminal dimensions", async function() {
    await withTerminal("terminal-resize", async ({ terminalUri }) => {
      await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalResized, cols: 120, rows: 40 });
      const state = await terminalState(terminalUri);
      assert.deepStrictEqual({ cols: state.cols, rows: state.rows }, { cols: 120, rows: 40 });
    });
  });
  conformanceTest(context, "terminal title change is broadcast", async function() {
    await withTerminal("terminal-title", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalTitleChanged, title: "Renamed Terminal" }
      });
      const notification = await context.client.waitForNotification(
        (n) => isActionNotification(n, "terminal/titleChanged") && getActionEnvelope(n).channel === terminalUri && getActionEnvelope(n).action.title === "Renamed Terminal"
      );
      assert.strictEqual(getActionEnvelope(notification).action.title, "Renamed Terminal");
    });
  });
  conformanceTest(context, "terminal claim can transfer from the client to the session", async function() {
    await withTerminal("terminal-claim", async ({ sessionUri, terminalUri }) => {
      const claim = { kind: TerminalClaimKind.Session, session: sessionUri };
      await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalClaimed, claim });
      assert.deepStrictEqual((await terminalState(terminalUri)).claim, claim);
    });
  });
  conformanceTest(context, "terminal input reaches the shell and produces output", async function() {
    await withTerminal("terminal-input", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalInput, data: 'node -p "40+2"\r' }
      });
      let streamedOutput = "";
      await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "terminal/data") || getActionEnvelope(n).channel !== terminalUri) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        streamedOutput += action.data;
        return /(?:^|\D)42(?:\D|$)/.test(streamedOutput);
      }, 3e4);
      const output = terminalText(await terminalState(terminalUri));
      assert.match(output, /(?:^|\D)42(?:\D|$)/);
    });
  });
  conformanceTest(context, "clearing a terminal drops the scrollback the client already saw", async function() {
    await withTerminal("terminal-clear", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalInput, data: `node -p "'CLEAR_MARKER'"\r` }
      });
      let streamedOutput = "";
      await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "terminal/data") || getActionEnvelope(n).channel !== terminalUri) {
          return false;
        }
        streamedOutput += getActionEnvelope(n).action.data;
        return streamedOutput.includes("CLEAR_MARKER");
      }, 3e4);
      const before = terminalText(await terminalState(terminalUri));
      await dispatchAndWait(terminalUri, 2, { type: ActionType.TerminalCleared });
      const after = terminalText(await terminalState(terminalUri));
      assert.deepStrictEqual({
        markerBeforeClear: before.includes("CLEAR_MARKER"),
        markerAfterClear: after.includes("CLEAR_MARKER")
      }, {
        markerBeforeClear: true,
        markerAfterClear: false
      });
    });
  });
  conformanceTest(context, "a terminal whose shell exits reports its exit code", async function() {
    await withTerminal("terminal-exit", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalInput, data: "exit\r" }
      });
      const exited = await context.client.waitForNotification(
        (n) => isActionNotification(n, "terminal/exited") && getActionEnvelope(n).channel === terminalUri,
        3e4
      );
      const action = getActionEnvelope(exited).action;
      assert.deepStrictEqual({
        reportedExitCode: typeof action.exitCode,
        stateMatchesNotification: (await terminalState(terminalUri)).exitCode === action.exitCode
      }, {
        reportedExitCode: "number",
        stateMatchesNotification: true
      });
    });
  });
  conformanceTest(context, "root state tracks terminals as they appear and disappear", async function() {
    await withTerminal("terminal-root", async ({ clientId, workspace }) => {
      await context.client.call("subscribe", { channel: ROOT_STATE_URI });
      context.client.clearReceived();
      function terminalsIn(n) {
        return getActionEnvelope(n).action.terminals ?? [];
      }
      const observedUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${generateUuid()}` }).toString();
      let observedCreated = false;
      try {
        await context.client.call("createTerminal", {
          channel: observedUri,
          claim: { kind: TerminalClaimKind.Client, clientId },
          name: "E2E terminal-root-observed",
          cwd: URI.file(workspace).toString(),
          cols: 90,
          rows: 30
        });
        observedCreated = true;
        await context.client.waitForNotification(
          (n) => isActionNotification(n, "root/terminalsChanged") && terminalsIn(n).some((terminal) => terminal.resource === observedUri),
          3e4
        );
        await disposeTerminal(observedUri);
        observedCreated = false;
        await context.client.waitForNotification(
          (n) => isActionNotification(n, "root/terminalsChanged") && !terminalsIn(n).some((terminal) => terminal.resource === observedUri),
          3e4
        );
      } finally {
        if (observedCreated) {
          await disposeTerminal(observedUri);
        }
      }
    });
  });
  conformanceTest(context, "disposeTerminal removes the terminal from root state", async function() {
    const { terminalUri } = await createTerminal("terminal-dispose");
    await disposeTerminal(terminalUri);
    const root = await context.client.call("subscribe", { channel: ROOT_STATE_URI });
    const state = root.snapshot.state;
    assert.strictEqual(state.terminals?.some((terminal) => terminal.resource === terminalUri) ?? false, false);
  });
  conformanceTest(context, "creating a duplicate terminal resource is rejected", async function() {
    await withTerminal("terminal-duplicate", async ({ terminalUri, clientId }) => {
      await assert.rejects(context.client.call("createTerminal", {
        channel: terminalUri,
        claim: { kind: TerminalClaimKind.Client, clientId }
      }));
    });
  });
  conformanceTest(context, "subscribing to an unknown terminal is rejected", async function() {
    await createSession("terminal-unknown");
    const terminalUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${generateUuid()}` }).toString();
    await assert.rejects(context.client.call("subscribe", { channel: terminalUri }));
  });
}
export {
  defineStateOperationsTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3N1aXRlcy9zdGF0ZU9wZXJhdGlvbnNTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXBTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIFN0YXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2xhaW1LaW5kLCB0eXBlIFRlcm1pbmFsQ2xhaW0gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHtcblx0YnVpbGREZWZhdWx0Q2hhdFVyaSxcblx0TWVzc2FnZUtpbmQsXG5cdFBlbmRpbmdNZXNzYWdlS2luZCxcblx0Uk9PVF9TVEFURV9VUkksXG5cdFNlc3Npb25TdGF0dXMsXG5cdHR5cGUgQ2hhdFN0YXRlLFxuXHR0eXBlIE1lc3NhZ2UsXG5cdHR5cGUgUm9vdFN0YXRlLFxuXHR0eXBlIFNlc3Npb25TdGF0ZSxcblx0dHlwZSBUZXJtaW5hbFN0YXRlLFxufSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uIH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25FbnZlbG9wZSwgaXNBY3Rpb25Ob3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgQWhwTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBjb25mb3JtYW5jZVRlc3QsIHR5cGUgSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0IH0gZnJvbSAnLi9lMmVUZXN0Q29udGV4dC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVTdGF0ZU9wZXJhdGlvbnNUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMgfSA9IGNvbnRleHQ7XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8eyBzZXNzaW9uVXJpOiBzdHJpbmc7IGNoYXRVcmk6IHN0cmluZzsgY2xpZW50SWQ6IHN0cmluZzsgd29ya3NwYWNlOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksIGBhaHAtc3RhdGUtJHtwcmVmaXh9LWApKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3QgY2xpZW50SWQgPSBgJHtwcmVmaXh9LSR7Y29uZmlnLnByb3ZpZGVyfWA7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsIGNsaWVudElkLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdHJldHVybiB7IHNlc3Npb25VcmksIGNoYXRVcmk6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksIGNsaWVudElkLCB3b3Jrc3BhY2UgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcpOiBQcm9taXNlPFNlc3Npb25TdGF0ZT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIFNlc3Npb25TdGF0ZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNoYXRTdGF0ZShjaGF0VXJpOiBzdHJpbmcpOiBQcm9taXNlPENoYXRTdGF0ZT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIENoYXRTdGF0ZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmk6IHN0cmluZyk6IFByb21pc2U8VGVybWluYWxTdGF0ZT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiB0ZXJtaW5hbFVyaSB9KTtcblx0XHRyZXR1cm4gcmVzdWx0LnNuYXBzaG90IS5zdGF0ZSBhcyBUZXJtaW5hbFN0YXRlO1xuXHR9XG5cblx0LyoqIFRoZSB0ZXJtaW5hbCdzIHZpc2libGUgdGV4dCwgZmxhdHRlbmluZyBjb21tYW5kIHBhcnRzIGFuZCByYXcgb3V0cHV0IGFsaWtlLiAqL1xuXHRmdW5jdGlvbiB0ZXJtaW5hbFRleHQoc3RhdGU6IFRlcm1pbmFsU3RhdGUpOiBzdHJpbmcge1xuXHRcdHJldHVybiBzdGF0ZS5jb250ZW50XG5cdFx0XHQubWFwKHBhcnQgPT4gcGFydC50eXBlID09PSAnY29tbWFuZCcgPyBwYXJ0Lm91dHB1dCA6IHBhcnQudmFsdWUpXG5cdFx0XHQuam9pbignJyk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBkaXNwYXRjaEFuZFdhaXQoY2hhbm5lbDogc3RyaW5nLCBjbGllbnRTZXE6IG51bWJlciwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7IGNoYW5uZWwsIGNsaWVudFNlcSwgYWN0aW9uIH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgYWN0aW9uLnR5cGUpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGFubmVsLFxuXHRcdCk7XG5cdH1cblxuXHRmdW5jdGlvbiB1c2VyTWVzc2FnZSh0ZXh0OiBzdHJpbmcpOiBNZXNzYWdlIHtcblx0XHRyZXR1cm4geyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVUZXJtaW5hbChwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8eyBzZXNzaW9uVXJpOiBzdHJpbmc7IHRlcm1pbmFsVXJpOiBzdHJpbmc7IGNsaWVudElkOiBzdHJpbmc7IHdvcmtzcGFjZTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIGNsaWVudElkLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24ocHJlZml4KTtcblx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnRob3N0LXRlcm1pbmFsJywgYXV0aG9yaXR5OiAnZTJlJywgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSkudG9TdHJpbmcoKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdjcmVhdGVUZXJtaW5hbCcsIHtcblx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZCB9LFxuXHRcdFx0bmFtZTogYEUyRSAke3ByZWZpeH1gLFxuXHRcdFx0Y3dkOiBVUkkuZmlsZSh3b3Jrc3BhY2UpLnRvU3RyaW5nKCksXG5cdFx0XHRjb2xzOiA5MCxcblx0XHRcdHJvd3M6IDMwLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiB0ZXJtaW5hbFVyaSB9KTtcblx0XHRyZXR1cm4geyBzZXNzaW9uVXJpLCB0ZXJtaW5hbFVyaSwgY2xpZW50SWQsIHdvcmtzcGFjZSB9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZGlzcG9zZVRlcm1pbmFsKHRlcm1pbmFsVXJpOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdkaXNwb3NlVGVybWluYWwnLCB7IGNoYW5uZWw6IHRlcm1pbmFsVXJpIH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2l0aFRlcm1pbmFsPFQ+KFxuXHRcdHByZWZpeDogc3RyaW5nLFxuXHRcdHJ1bjogKHRlcm1pbmFsOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVRlcm1pbmFsPj4pID0+IFByb21pc2U8VD4sXG5cdCk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgY3JlYXRlVGVybWluYWwocHJlZml4KTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHJ1bih0ZXJtaW5hbCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbC50ZXJtaW5hbFVyaSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjbGllbnQgdGl0bGUgY2hhbmdlIHVwZGF0ZXMgc2Vzc2lvbiBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3RpdGxlLWNoYW5nZScpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ0RpcmVjdCBBSFAgVGl0bGUnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLnRpdGxlLCAnRGlyZWN0IEFIUCBUaXRsZScpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ21hcmtpbmcgYSBzZXNzaW9uIHJlYWQgc2V0cyB0aGUgcmVhZCBzdGF0dXMgZmxhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3JlYWQtc2V0Jyk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc1JlYWQpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ21hcmtpbmcgYSBzZXNzaW9uIHVucmVhZCBjbGVhcnMgdGhlIHJlYWQgc3RhdHVzIGZsYWcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZWFkLWNsZWFyJyk7XG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDIsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzUmVhZCwgMCk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYXJjaGl2aW5nIGEgc2Vzc2lvbiBzZXRzIHRoZSBhcmNoaXZlZCBzdGF0dXMgZmxhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2FyY2hpdmUtc2V0Jyk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZCwgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5vaygoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3VuYXJjaGl2aW5nIGEgc2Vzc2lvbiBjbGVhcnMgdGhlIGFyY2hpdmVkIHN0YXR1cyBmbGFnJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignYXJjaGl2ZS1jbGVhcicpO1xuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzQXJjaGl2ZWRDaGFuZ2VkLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDIsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQsIGlzQXJjaGl2ZWQ6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCwgMCk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnc2Vzc2lvbiBjb25maWcgY2hhbmdlcyBtZXJnZSB3aXRoIGV4aXN0aW5nIHZhbHVlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NvbmZpZy1tZXJnZScpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAxLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2Fzc2lzdGVkJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5jb25maWc/LnZhbHVlcywge1xuXHRcdFx0Li4uYmVmb3JlLmNvbmZpZz8udmFsdWVzLFxuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXNzaXN0ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Nlc3Npb24gY29uZmlnIHJlcGxhY2VtZW50IGRyb3BzIHByZXZpb3VzIHZhbHVlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NvbmZpZy1yZXBsYWNlJyk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdkZWZhdWx0JyB9LFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY29uZmlnPy52YWx1ZXMsIHtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2RlZmF1bHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2FjdGl2ZSBjbGllbnQgc2V0IGFkZHMgYSBzZXNzaW9uIHBhcnRpY2lwYW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgY2xpZW50SWQgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2FjdGl2ZS1jbGllbnQtYWRkJyk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkLCBkaXNwbGF5TmFtZTogJ0NvdmVyYWdlIENsaWVudCcsIHRvb2xzOiBbXSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5hY3RpdmVDbGllbnRzLCBbe1xuXHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0NvdmVyYWdlIENsaWVudCcsXG5cdFx0XHR0b29sczogW10sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2FjdGl2ZSBjbGllbnQgc2V0IHJlcGxhY2VzIGFuIGV4aXN0aW5nIHBhcnRpY2lwYW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgY2xpZW50SWQgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2FjdGl2ZS1jbGllbnQtdXBkYXRlJyk7XG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZCwgZGlzcGxheU5hbWU6ICdCZWZvcmUnLCB0b29sczogW10gfSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAyLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHsgY2xpZW50SWQsIGRpc3BsYXlOYW1lOiAnQWZ0ZXInLCB0b29sczogW10gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuYWN0aXZlQ2xpZW50cy5tYXAoY2xpZW50ID0+IGNsaWVudC5kaXNwbGF5TmFtZSksIFsnQWZ0ZXInXSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYWN0aXZlIGNsaWVudCByZW1vdmFsIHJlbW92ZXMgdGhlIHNlc3Npb24gcGFydGljaXBhbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBjbGllbnRJZCB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignYWN0aXZlLWNsaWVudC1yZW1vdmUnKTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkLCBkaXNwbGF5TmFtZTogJ0NvdmVyYWdlIENsaWVudCcsIHRvb2xzOiBbXSB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDIsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50UmVtb3ZlZCwgY2xpZW50SWQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmFjdGl2ZUNsaWVudHMsIFtdKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdkcmFmdCBjaGFuZ2Ugc3RvcmVzIGEgdXNlciBtZXNzYWdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZHJhZnQtc2V0Jyk7XG5cdFx0Y29uc3QgZHJhZnQgPSB1c2VyTWVzc2FnZSgnZHJhZnQgdGV4dCcpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkLCBkcmFmdCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGNoYXRTdGF0ZShjaGF0VXJpKSkuZHJhZnQsIGRyYWZ0KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdkcmFmdCBjaGFuZ2UgcmVwbGFjZXMgdGhlIHByZXZpb3VzIG1lc3NhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdkcmFmdC1yZXBsYWNlJyk7XG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkLCBkcmFmdDogdXNlck1lc3NhZ2UoJ2JlZm9yZScpIH0pO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDIsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkLCBkcmFmdDogdXNlck1lc3NhZ2UoJ2FmdGVyJykgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSkpLmRyYWZ0LCB1c2VyTWVzc2FnZSgnYWZ0ZXInKSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY2xlYXJpbmcgYSBkcmFmdCByZW1vdmVzIGl0IGZyb20gY2hhdCBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGNoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2RyYWZ0LWNsZWFyJyk7XG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkLCBkcmFmdDogdXNlck1lc3NhZ2UoJ2RyYWZ0JykgfSk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoY2hhdFVyaSwgMiwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXREcmFmdENoYW5nZWQgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGNoYXRTdGF0ZShjaGF0VXJpKSkuZHJhZnQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBtZXNzYWdlIHF1ZXVlZCBvbiBhbiBpZGxlIGNoYXQgaXMgcHJvbW90ZWQgc3RyYWlnaHQgaW50byBhIHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdxdWV1ZS1wcm9tb3RlJyk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0Ly8gUXVldWVpbmcgZXhpc3RzIHRvIGhvbGQgd29yayB3aGlsZSBhIHR1cm4gaXMgcnVubmluZy4gV2l0aCBub3RoaW5nXG5cdFx0Ly8gcnVubmluZyB0aGVyZSBpcyBub3RoaW5nIHRvIHdhaXQgZm9yLCBzbyB0aGUgaG9zdCBtdXN0IHN0YXJ0IHRoZVxuXHRcdC8vIG1lc3NhZ2UgcmF0aGVyIHRoYW4gcGFyayBpdCBcdTIwMTQgb3RoZXJ3aXNlIGEgcXVldWVkIG1lc3NhZ2Ugb24gYW4gaWRsZVxuXHRcdC8vIGNoYXQgd291bGQgbmV2ZXIgcnVuIGF0IGFsbC4gYC9yZW5hbWVgIGtlZXBzIHRoZSBwcm9tb3RlZCB0dXJuIGluc2lkZVxuXHRcdC8vIHRoZSBob3N0J3MgbG9jYWwtY29tbWFuZCBkaXNwYXRjaGVyLCB3aXRoIG5vIHNoZWxsIGFuZCBubyBtb2RlbC5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoY2hhdFVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQsXG5cdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0aWQ6ICdxdWV1ZWQtMScsXG5cdFx0XHRtZXNzYWdlOiB1c2VyTWVzc2FnZSgnL3JlbmFtZSBRdWV1ZSBQcm9tb3RlZCcpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RhcnRlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVyblN0YXJ0ZWQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHF1ZXVlZE1lc3NhZ2VJZD86IHN0cmluZyB9KS5xdWV1ZWRNZXNzYWdlSWQgPT09ICdxdWV1ZWQtMScsXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0XHRjb25zdCB0dXJuSWQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUoc3RhcnRlZCkuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdDYwXzAwMCxcblx0XHQpO1xuXG5cdFx0Ly8gUHJvbW90aW9uIGhhcyB0byBiZSBhdG9taWMgd2l0aCByZW1vdmFsOiBhIG1lc3NhZ2UgbGVmdCBpbiB0aGUgcXVldWVcblx0XHQvLyBhZnRlciBiZWluZyBzdGFydGVkIHdvdWxkIHJ1biBhIHNlY29uZCB0aW1lIG9uIHRoZSBuZXh0IGlkbGUgZXZlbnQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpKS5xdWV1ZWRNZXNzYWdlcyA/PyBbXSwgW10pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3JlbW92aW5nIGEgbWlzc2luZyBxdWV1ZWQgbWVzc2FnZSBsZWF2ZXMgY2hhdCBzdGF0ZSB1bmNoYW5nZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdxdWV1ZS1yZW1vdmUtbWlzc2luZycpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCxcblx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRpZDogJ21pc3NpbmcnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSkpLnF1ZXVlZE1lc3NhZ2VzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlb3JkZXJpbmcgYSBtaXNzaW5nIHF1ZXVlIGxlYXZlcyBjaGF0IHN0YXRlIHVuY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGNoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3F1ZXVlLXJlb3JkZXItbWlzc2luZycpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFF1ZXVlZE1lc3NhZ2VzUmVvcmRlcmVkLFxuXHRcdFx0b3JkZXI6IFsnbWlzc2luZyddLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSkpLnF1ZXVlZE1lc3NhZ2VzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3RydW5jYXRpbmcgYXQgYSBtaXNzaW5nIHR1cm4gbGVhdmVzIGhpc3RvcnkgdW5jaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigndHJ1bmNhdGUtbWlzc2luZycpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IGF3YWl0IGNoYXRTdGF0ZShjaGF0VXJpKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQsXG5cdFx0XHR0dXJuSWQ6ICdtaXNzaW5nLXR1cm4nLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpKS50dXJucywgYmVmb3JlLnR1cm5zKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjYW5jZWxsaW5nIGEgbWlzc2luZyB0dXJuIGxlYXZlcyB0aGUgY2hhdCBpZGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY2FuY2VsLW1pc3NpbmcnKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0dHVybklkOiAnbWlzc2luZy10dXJuJyxcblx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgYWN0aXZlVHVybjogc3RhdGUuYWN0aXZlVHVybiwgdHVybnM6IHN0YXRlLnR1cm5zLCBzdGF0dXM6IHN0YXRlLnN0YXR1cyB9LFxuXHRcdFx0eyBhY3RpdmVUdXJuOiB1bmRlZmluZWQsIHR1cm5zOiBbXSwgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUgfSxcblx0XHQpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NyZWF0ZVRlcm1pbmFsIGV4cG9zZXMgcmVxdWVzdGVkIGRpbWVuc2lvbnMgY3dkIGFuZCBjbGFpbScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLWNyZWF0ZScsIGFzeW5jICh7IHRlcm1pbmFsVXJpLCBjbGllbnRJZCwgd29ya3NwYWNlIH0pID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgdGVybWluYWxTdGF0ZSh0ZXJtaW5hbFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y3dkOiBzdGF0ZS5jd2QsXG5cdFx0XHRcdGNvbHM6IHN0YXRlLmNvbHMsXG5cdFx0XHRcdHJvd3M6IHN0YXRlLnJvd3MsXG5cdFx0XHRcdGNsYWltOiBzdGF0ZS5jbGFpbSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y3dkOiBVUkkuZmlsZSh3b3Jrc3BhY2UpLmZzUGF0aCxcblx0XHRcdFx0Y29sczogOTAsXG5cdFx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICd0ZXJtaW5hbCByZXNpemUgdXBkYXRlcyB0ZXJtaW5hbCBkaW1lbnNpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXJtaW5hbCgndGVybWluYWwtcmVzaXplJywgYXN5bmMgKHsgdGVybWluYWxVcmkgfSkgPT4ge1xuXHRcdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHRlcm1pbmFsVXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxSZXNpemVkLCBjb2xzOiAxMjAsIHJvd3M6IDQwIH0pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB0ZXJtaW5hbFN0YXRlKHRlcm1pbmFsVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb2xzOiBzdGF0ZS5jb2xzLCByb3dzOiBzdGF0ZS5yb3dzIH0sIHsgY29sczogMTIwLCByb3dzOiA0MCB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICd0ZXJtaW5hbCB0aXRsZSBjaGFuZ2UgaXMgYnJvYWRjYXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXJtaW5hbCgndGVybWluYWwtdGl0bGUnLCBhc3luYyAoeyB0ZXJtaW5hbFVyaSB9KSA9PiB7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1JlbmFtZWQgVGVybWluYWwnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAndGVybWluYWwvdGl0bGVDaGFuZ2VkJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gdGVybWluYWxVcmlcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHRpdGxlOiBzdHJpbmcgfSkudGl0bGUgPT09ICdSZW5hbWVkIFRlcm1pbmFsJyxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIHsgdGl0bGU6IHN0cmluZyB9KS50aXRsZSwgJ1JlbmFtZWQgVGVybWluYWwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICd0ZXJtaW5hbCBjbGFpbSBjYW4gdHJhbnNmZXIgZnJvbSB0aGUgY2xpZW50IHRvIHRoZSBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXJtaW5hbCgndGVybWluYWwtY2xhaW0nLCBhc3luYyAoeyBzZXNzaW9uVXJpLCB0ZXJtaW5hbFVyaSB9KSA9PiB7XG5cdFx0XHRjb25zdCBjbGFpbTogVGVybWluYWxDbGFpbSA9IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbiwgc2Vzc2lvbjogc2Vzc2lvblVyaSB9O1xuXHRcdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHRlcm1pbmFsVXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDbGFpbWVkLCBjbGFpbSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmkpKS5jbGFpbSwgY2xhaW0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Rlcm1pbmFsIGlucHV0IHJlYWNoZXMgdGhlIHNoZWxsIGFuZCBwcm9kdWNlcyBvdXRwdXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlcm1pbmFsKCd0ZXJtaW5hbC1pbnB1dCcsIGFzeW5jICh7IHRlcm1pbmFsVXJpIH0pID0+IHtcblx0XHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogdGVybWluYWxVcmksXG5cdFx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxJbnB1dCwgZGF0YTogJ25vZGUgLXAgXCI0MCsyXCJcXHInIH0sXG5cdFx0XHR9KTtcblx0XHRcdGxldCBzdHJlYW1lZE91dHB1dCA9ICcnO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAndGVybWluYWwvZGF0YScpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHRlcm1pbmFsVXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IGRhdGE6IHN0cmluZyB9O1xuXHRcdFx0XHRzdHJlYW1lZE91dHB1dCArPSBhY3Rpb24uZGF0YTtcblx0XHRcdFx0cmV0dXJuIC8oPzpefFxcRCk0Mig/OlxcRHwkKS8udGVzdChzdHJlYW1lZE91dHB1dCk7XG5cdFx0XHR9LCAzMF8wMDApO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gdGVybWluYWxUZXh0KGF3YWl0IHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmkpKTtcblx0XHRcdGFzc2VydC5tYXRjaChvdXRwdXQsIC8oPzpefFxcRCk0Mig/OlxcRHwkKS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NsZWFyaW5nIGEgdGVybWluYWwgZHJvcHMgdGhlIHNjcm9sbGJhY2sgdGhlIGNsaWVudCBhbHJlYWR5IHNhdycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLWNsZWFyJywgYXN5bmMgKHsgdGVybWluYWxVcmkgfSkgPT4ge1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiB0ZXJtaW5hbFVyaSxcblx0XHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0LCBkYXRhOiAnbm9kZSAtcCBcIlxcJ0NMRUFSX01BUktFUlxcJ1wiXFxyJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgc3RyZWFtZWRPdXRwdXQgPSAnJztcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Rlcm1pbmFsL2RhdGEnKSB8fCBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSB0ZXJtaW5hbFVyaSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHJlYW1lZE91dHB1dCArPSAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgZGF0YTogc3RyaW5nIH0pLmRhdGE7XG5cdFx0XHRcdHJldHVybiBzdHJlYW1lZE91dHB1dC5pbmNsdWRlcygnQ0xFQVJfTUFSS0VSJyk7XG5cdFx0XHR9LCAzMF8wMDApO1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gdGVybWluYWxUZXh0KGF3YWl0IHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmkpKTtcblxuXHRcdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHRlcm1pbmFsVXJpLCAyLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDbGVhcmVkIH0pO1xuXG5cdFx0XHQvLyBUaGUgc2Nyb2xsYmFjayBsaXZlcyBpbiBob3N0IHN0YXRlLCBub3QganVzdCBpbiB0aGUgY2xpZW50J3Mgdmlldyxcblx0XHRcdC8vIHNvIGNsZWFyaW5nIG11c3QgZHJvcCBpdCBmb3IgZXZlcnkgc3Vic2NyaWJlciBpbmNsdWRpbmcgb25lIHRoYXRcblx0XHRcdC8vIHN1YnNjcmliZXMgbGF0ZXIuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gQXNzZXJ0aW5nIHRoZSBidWZmZXIgaXMgKmVtcHR5KiB3b3VsZCBiZSB3cm9uZzogdGhlIHNoZWxsIGlzIGxpdmVcblx0XHRcdC8vIGFuZCByZWRyYXdzIGl0cyBwcm9tcHQgYXMgc29vbiBhcyB0aGUgc2NyZWVuIGlzIGNsZWFyZWQsIHNvIGJ5dGVzXG5cdFx0XHQvLyBsZWdpdGltYXRlbHkgYXJyaXZlIGFmdGVyIHRoZSBjbGVhciByZWR1Y2VzLiBXaGF0IGhhcyB0byBiZSBnb25lXG5cdFx0XHQvLyBpcyB0aGUgb3V0cHV0IHRoZSBjbGllbnQgaGFkIGFscmVhZHkgYWNjdW11bGF0ZWQuXG5cdFx0XHRjb25zdCBhZnRlciA9IHRlcm1pbmFsVGV4dChhd2FpdCB0ZXJtaW5hbFN0YXRlKHRlcm1pbmFsVXJpKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWFya2VyQmVmb3JlQ2xlYXI6IGJlZm9yZS5pbmNsdWRlcygnQ0xFQVJfTUFSS0VSJyksXG5cdFx0XHRcdG1hcmtlckFmdGVyQ2xlYXI6IGFmdGVyLmluY2x1ZGVzKCdDTEVBUl9NQVJLRVInKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWFya2VyQmVmb3JlQ2xlYXI6IHRydWUsXG5cdFx0XHRcdG1hcmtlckFmdGVyQ2xlYXI6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSB0ZXJtaW5hbCB3aG9zZSBzaGVsbCBleGl0cyByZXBvcnRzIGl0cyBleGl0IGNvZGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlcm1pbmFsKCd0ZXJtaW5hbC1leGl0JywgYXN5bmMgKHsgdGVybWluYWxVcmkgfSkgPT4ge1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiB0ZXJtaW5hbFVyaSxcblx0XHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0LCBkYXRhOiAnZXhpdFxccicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBleGl0ZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Rlcm1pbmFsL2V4aXRlZCcpICYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHQzMF8wMDAsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBUaGUgZXhpdCBjb2RlIGl0c2VsZiBpcyB0aGUgc2hlbGwncywgbm90IHRoZSBob3N0J3MsIHNvIG9ubHkgaXRzXG5cdFx0XHQvLyBwcmVzZW5jZSBhbmQgaXRzIGFycml2YWwgaW4gc3RhdGUgYXJlIGNvbnRyYWN0dWFsLlxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUoZXhpdGVkKS5hY3Rpb24gYXMgeyBleGl0Q29kZT86IG51bWJlciB9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlcG9ydGVkRXhpdENvZGU6IHR5cGVvZiBhY3Rpb24uZXhpdENvZGUsXG5cdFx0XHRcdHN0YXRlTWF0Y2hlc05vdGlmaWNhdGlvbjogKGF3YWl0IHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmkpKS5leGl0Q29kZSA9PT0gYWN0aW9uLmV4aXRDb2RlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXBvcnRlZEV4aXRDb2RlOiAnbnVtYmVyJyxcblx0XHRcdFx0c3RhdGVNYXRjaGVzTm90aWZpY2F0aW9uOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncm9vdCBzdGF0ZSB0cmFja3MgdGVybWluYWxzIGFzIHRoZXkgYXBwZWFyIGFuZCBkaXNhcHBlYXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVGhlIGZpcnN0IHRlcm1pbmFsIGFsc28gZXN0YWJsaXNoZXMgdGhlIGNvbm5lY3Rpb247IHJvb3QgY2FuIG9ubHkgYmVcblx0XHQvLyBzdWJzY3JpYmVkIG9uY2UgdGhlIGNsaWVudCBoYXMgaGFuZHNoYWtlZC5cblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLXJvb3QnLCBhc3luYyAoeyBjbGllbnRJZCwgd29ya3NwYWNlIH0pID0+IHtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblxuXHRcdFx0ZnVuY3Rpb24gdGVybWluYWxzSW4objogQWhwTm90aWZpY2F0aW9uKTogcmVhZG9ubHkgeyByZXNvdXJjZTogc3RyaW5nIH1bXSB7XG5cdFx0XHRcdHJldHVybiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdGVybWluYWxzPzogcmVhZG9ubHkgeyByZXNvdXJjZTogc3RyaW5nIH1bXSB9KS50ZXJtaW5hbHMgPz8gW107XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJvb3QgaXMgaG93IGEgY2xpZW50IGRpc2NvdmVycyB0ZXJtaW5hbHMgaXQgZGlkIG5vdCBjcmVhdGUgaXRzZWxmLCBzb1xuXHRcdFx0Ly8gaXQgaGFzIHRvIGJlIHRvbGQgb24gYm90aCBlZGdlcywgbm90IG9ubHkgb24gY3JlYXRpb24uXG5cdFx0XHRjb25zdCBvYnNlcnZlZFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnRob3N0LXRlcm1pbmFsJywgYXV0aG9yaXR5OiAnZTJlJywgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSkudG9TdHJpbmcoKTtcblx0XHRcdGxldCBvYnNlcnZlZENyZWF0ZWQgPSBmYWxzZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVRlcm1pbmFsJywge1xuXHRcdFx0XHRcdGNoYW5uZWw6IG9ic2VydmVkVXJpLFxuXHRcdFx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQgfSxcblx0XHRcdFx0XHRuYW1lOiAnRTJFIHRlcm1pbmFsLXJvb3Qtb2JzZXJ2ZWQnLFxuXHRcdFx0XHRcdGN3ZDogVVJJLmZpbGUod29ya3NwYWNlKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdGNvbHM6IDkwLFxuXHRcdFx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0b2JzZXJ2ZWRDcmVhdGVkID0gdHJ1ZTtcblx0XHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Jvb3QvdGVybWluYWxzQ2hhbmdlZCcpXG5cdFx0XHRcdFx0JiYgdGVybWluYWxzSW4obikuc29tZSh0ZXJtaW5hbCA9PiB0ZXJtaW5hbC5yZXNvdXJjZSA9PT0gb2JzZXJ2ZWRVcmkpLFxuXHRcdFx0XHRcdDMwXzAwMCxcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRhd2FpdCBkaXNwb3NlVGVybWluYWwob2JzZXJ2ZWRVcmkpO1xuXHRcdFx0XHRvYnNlcnZlZENyZWF0ZWQgPSBmYWxzZTtcblx0XHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Jvb3QvdGVybWluYWxzQ2hhbmdlZCcpXG5cdFx0XHRcdFx0JiYgIXRlcm1pbmFsc0luKG4pLnNvbWUodGVybWluYWwgPT4gdGVybWluYWwucmVzb3VyY2UgPT09IG9ic2VydmVkVXJpKSxcblx0XHRcdFx0XHQzMF8wMDAsXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAob2JzZXJ2ZWRDcmVhdGVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgZGlzcG9zZVRlcm1pbmFsKG9ic2VydmVkVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2Rpc3Bvc2VUZXJtaW5hbCByZW1vdmVzIHRoZSB0ZXJtaW5hbCBmcm9tIHJvb3Qgc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyB0ZXJtaW5hbFVyaSB9ID0gYXdhaXQgY3JlYXRlVGVybWluYWwoJ3Rlcm1pbmFsLWRpc3Bvc2UnKTtcblxuXHRcdGF3YWl0IGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbFVyaSk7XG5cblx0XHRjb25zdCByb290ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IHN0YXRlID0gcm9vdC5zbmFwc2hvdCEuc3RhdGUgYXMgUm9vdFN0YXRlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbHM/LnNvbWUodGVybWluYWwgPT4gdGVybWluYWwucmVzb3VyY2UgPT09IHRlcm1pbmFsVXJpKSA/PyBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NyZWF0aW5nIGEgZHVwbGljYXRlIHRlcm1pbmFsIHJlc291cmNlIGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXJtaW5hbCgndGVybWluYWwtZHVwbGljYXRlJywgYXN5bmMgKHsgdGVybWluYWxVcmksIGNsaWVudElkIH0pID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVRlcm1pbmFsJywge1xuXHRcdFx0XHRjaGFubmVsOiB0ZXJtaW5hbFVyaSxcblx0XHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZCB9LFxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3N1YnNjcmliaW5nIHRvIGFuIHVua25vd24gdGVybWluYWwgaXMgcmVqZWN0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbigndGVybWluYWwtdW5rbm93bicpO1xuXHRcdGNvbnN0IHRlcm1pbmFsVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudGhvc3QtdGVybWluYWwnLCBhdXRob3JpdHk6ICdlMmUnLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHRlcm1pbmFsVXJpIH0pKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBb0M7QUFFN0MsU0FBUyx5QkFBNkM7QUFDdEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BTU07QUFDUCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQiw0QkFBNEI7QUFFeEQsU0FBUyx1QkFBc0Q7QUFFeEQsU0FBUywyQkFBMkIsU0FBeUM7QUFDbkYsUUFBTSxFQUFFLFFBQVEsaUJBQWlCLFNBQVMsSUFBSTtBQUU5QyxpQkFBZSxjQUFjLFFBQXVHO0FBQ25JLFVBQU0sWUFBWSxZQUFZLEtBQUssT0FBTyxHQUFHLGFBQWEsTUFBTSxHQUFHLENBQUM7QUFDcEUsYUFBUyxLQUFLLFNBQVM7QUFDdkIsVUFBTSxXQUFXLEdBQUcsTUFBTSxJQUFJLE9BQU8sUUFBUTtBQUM3QyxVQUFNLGFBQWEsTUFBTSxrQkFBa0IsUUFBUSxRQUFRLFFBQVEsVUFBVSxpQkFBaUIsSUFBSSxLQUFLLFNBQVMsQ0FBQztBQUNqSCxXQUFPLEVBQUUsWUFBWSxTQUFTLG9CQUFvQixVQUFVLEdBQUcsVUFBVSxVQUFVO0FBQUEsRUFDcEY7QUFFQSxpQkFBZSxhQUFhLFlBQTJDO0FBQ3RFLFVBQU0sU0FBUyxNQUFNLFFBQVEsT0FBTyxLQUFzQixhQUFhLEVBQUUsU0FBUyxXQUFXLENBQUM7QUFDOUYsV0FBTyxPQUFPLFNBQVU7QUFBQSxFQUN6QjtBQUVBLGlCQUFlLFVBQVUsU0FBcUM7QUFDN0QsVUFBTSxTQUFTLE1BQU0sUUFBUSxPQUFPLEtBQXNCLGFBQWEsRUFBRSxTQUFTLFFBQVEsQ0FBQztBQUMzRixXQUFPLE9BQU8sU0FBVTtBQUFBLEVBQ3pCO0FBRUEsaUJBQWUsY0FBYyxhQUE2QztBQUN6RSxVQUFNLFNBQVMsTUFBTSxRQUFRLE9BQU8sS0FBc0IsYUFBYSxFQUFFLFNBQVMsWUFBWSxDQUFDO0FBQy9GLFdBQU8sT0FBTyxTQUFVO0FBQUEsRUFDekI7QUFHQSxXQUFTLGFBQWEsT0FBOEI7QUFDbkQsV0FBTyxNQUFNLFFBQ1gsSUFBSSxVQUFRLEtBQUssU0FBUyxZQUFZLEtBQUssU0FBUyxLQUFLLEtBQUssRUFDOUQsS0FBSyxFQUFFO0FBQUEsRUFDVjtBQUVBLGlCQUFlLGdCQUFnQixTQUFpQixXQUFtQixRQUFvQztBQUN0RyxZQUFRLE9BQU8sY0FBYztBQUM3QixZQUFRLE9BQU8sU0FBUyxFQUFFLFNBQVMsV0FBVyxPQUFPLENBQUM7QUFDdEQsVUFBTSxRQUFRLE9BQU87QUFBQSxNQUFvQixPQUN4QyxxQkFBcUIsR0FBRyxPQUFPLElBQUksS0FDaEMsa0JBQWtCLENBQUMsRUFBRSxZQUFZO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBRUEsV0FBUyxZQUFZLE1BQXVCO0FBQzNDLFdBQU8sRUFBRSxNQUFNLFFBQVEsRUFBRSxNQUFNLFlBQVksS0FBSyxFQUFFO0FBQUEsRUFDbkQ7QUFFQSxpQkFBZSxlQUFlLFFBQTJHO0FBQ3hJLFVBQU0sRUFBRSxZQUFZLFVBQVUsVUFBVSxJQUFJLE1BQU0sY0FBYyxNQUFNO0FBQ3RFLFVBQU0sY0FBYyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixXQUFXLE9BQU8sTUFBTSxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTO0FBQ3RILFVBQU0sUUFBUSxPQUFPLEtBQUssa0JBQWtCO0FBQUEsTUFDM0MsU0FBUztBQUFBLE1BQ1QsT0FBTyxFQUFFLE1BQU0sa0JBQWtCLFFBQVEsU0FBUztBQUFBLE1BQ2xELE1BQU0sT0FBTyxNQUFNO0FBQUEsTUFDbkIsS0FBSyxJQUFJLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFBQSxNQUNsQyxNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsSUFDUCxDQUFDO0FBQ0QsVUFBTSxRQUFRLE9BQU8sS0FBc0IsYUFBYSxFQUFFLFNBQVMsWUFBWSxDQUFDO0FBQ2hGLFdBQU8sRUFBRSxZQUFZLGFBQWEsVUFBVSxVQUFVO0FBQUEsRUFDdkQ7QUFFQSxpQkFBZSxnQkFBZ0IsYUFBb0M7QUFDbEUsVUFBTSxRQUFRLE9BQU8sS0FBSyxtQkFBbUIsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUFBLEVBQ3RFO0FBRUEsaUJBQWUsYUFDZCxRQUNBLEtBQ2E7QUFDYixVQUFNLFdBQVcsTUFBTSxlQUFlLE1BQU07QUFDNUMsUUFBSTtBQUNILGFBQU8sTUFBTSxJQUFJLFFBQVE7QUFBQSxJQUMxQixVQUFFO0FBQ0QsWUFBTSxnQkFBZ0IsU0FBUyxXQUFXO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBRUEsa0JBQWdCLFNBQVMsNkNBQTZDLGlCQUFrQjtBQUN2RixVQUFNLEVBQUUsV0FBVyxJQUFJLE1BQU0sY0FBYyxjQUFjO0FBRXpELFVBQU0sZ0JBQWdCLFlBQVksR0FBRyxFQUFFLE1BQU0sV0FBVyxxQkFBcUIsT0FBTyxtQkFBbUIsQ0FBQztBQUV4RyxXQUFPLGFBQWEsTUFBTSxhQUFhLFVBQVUsR0FBRyxPQUFPLGtCQUFrQjtBQUFBLEVBQzlFLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyxvREFBb0QsaUJBQWtCO0FBQzlGLFVBQU0sRUFBRSxXQUFXLElBQUksTUFBTSxjQUFjLFVBQVU7QUFFckQsVUFBTSxnQkFBZ0IsWUFBWSxHQUFHLEVBQUUsTUFBTSxXQUFXLHNCQUFzQixRQUFRLEtBQUssQ0FBQztBQUU1RixXQUFPLElBQUksTUFBTSxhQUFhLFVBQVUsR0FBRyxTQUFTLGNBQWMsTUFBTTtBQUFBLEVBQ3pFLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyx3REFBd0QsaUJBQWtCO0FBQ2xHLFVBQU0sRUFBRSxXQUFXLElBQUksTUFBTSxjQUFjLFlBQVk7QUFDdkQsVUFBTSxnQkFBZ0IsWUFBWSxHQUFHLEVBQUUsTUFBTSxXQUFXLHNCQUFzQixRQUFRLEtBQUssQ0FBQztBQUU1RixVQUFNLGdCQUFnQixZQUFZLEdBQUcsRUFBRSxNQUFNLFdBQVcsc0JBQXNCLFFBQVEsTUFBTSxDQUFDO0FBRTdGLFdBQU8sYUFBYSxNQUFNLGFBQWEsVUFBVSxHQUFHLFNBQVMsY0FBYyxRQUFRLENBQUM7QUFBQSxFQUNyRixDQUFDO0FBRUQsa0JBQWdCLFNBQVMscURBQXFELGlCQUFrQjtBQUMvRixVQUFNLEVBQUUsV0FBVyxJQUFJLE1BQU0sY0FBYyxhQUFhO0FBRXhELFVBQU0sZ0JBQWdCLFlBQVksR0FBRyxFQUFFLE1BQU0sV0FBVywwQkFBMEIsWUFBWSxLQUFLLENBQUM7QUFFcEcsV0FBTyxJQUFJLE1BQU0sYUFBYSxVQUFVLEdBQUcsU0FBUyxjQUFjLFVBQVU7QUFBQSxFQUM3RSxDQUFDO0FBRUQsa0JBQWdCLFNBQVMseURBQXlELGlCQUFrQjtBQUNuRyxVQUFNLEVBQUUsV0FBVyxJQUFJLE1BQU0sY0FBYyxlQUFlO0FBQzFELFVBQU0sZ0JBQWdCLFlBQVksR0FBRyxFQUFFLE1BQU0sV0FBVywwQkFBMEIsWUFBWSxLQUFLLENBQUM7QUFFcEcsVUFBTSxnQkFBZ0IsWUFBWSxHQUFHLEVBQUUsTUFBTSxXQUFXLDBCQUEwQixZQUFZLE1BQU0sQ0FBQztBQUVyRyxXQUFPLGFBQWEsTUFBTSxhQUFhLFVBQVUsR0FBRyxTQUFTLGNBQWMsWUFBWSxDQUFDO0FBQUEsRUFDekYsQ0FBQztBQUVELGtCQUFnQixTQUFTLHFEQUFxRCxpQkFBa0I7QUFDL0YsVUFBTSxFQUFFLFdBQVcsSUFBSSxNQUFNLGNBQWMsY0FBYztBQUN6RCxVQUFNLFNBQVMsTUFBTSxhQUFhLFVBQVU7QUFFNUMsVUFBTSxnQkFBZ0IsWUFBWSxHQUFHO0FBQUEsTUFDcEMsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUSxFQUFFLENBQUMsaUJBQWlCLFdBQVcsR0FBRyxXQUFXO0FBQUEsSUFDdEQsQ0FBQztBQUVELFdBQU8saUJBQWlCLE1BQU0sYUFBYSxVQUFVLEdBQUcsUUFBUSxRQUFRO0FBQUEsTUFDdkUsR0FBRyxPQUFPLFFBQVE7QUFBQSxNQUNsQixDQUFDLGlCQUFpQixXQUFXLEdBQUc7QUFBQSxJQUNqQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsa0JBQWdCLFNBQVMsb0RBQW9ELGlCQUFrQjtBQUM5RixVQUFNLEVBQUUsV0FBVyxJQUFJLE1BQU0sY0FBYyxnQkFBZ0I7QUFFM0QsVUFBTSxnQkFBZ0IsWUFBWSxHQUFHO0FBQUEsTUFDcEMsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUSxFQUFFLENBQUMsaUJBQWlCLFdBQVcsR0FBRyxVQUFVO0FBQUEsTUFDcEQsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUVELFdBQU8saUJBQWlCLE1BQU0sYUFBYSxVQUFVLEdBQUcsUUFBUSxRQUFRO0FBQUEsTUFDdkUsQ0FBQyxpQkFBaUIsV0FBVyxHQUFHO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELGtCQUFnQixTQUFTLGdEQUFnRCxpQkFBa0I7QUFDMUYsVUFBTSxFQUFFLFlBQVksU0FBUyxJQUFJLE1BQU0sY0FBYyxtQkFBbUI7QUFFeEUsVUFBTSxnQkFBZ0IsWUFBWSxHQUFHO0FBQUEsTUFDcEMsTUFBTSxXQUFXO0FBQUEsTUFDakIsY0FBYyxFQUFFLFVBQVUsYUFBYSxtQkFBbUIsT0FBTyxDQUFDLEVBQUU7QUFBQSxJQUNyRSxDQUFDO0FBRUQsV0FBTyxpQkFBaUIsTUFBTSxhQUFhLFVBQVUsR0FBRyxlQUFlLENBQUM7QUFBQSxNQUN2RTtBQUFBLE1BQ0EsYUFBYTtBQUFBLE1BQ2IsT0FBTyxDQUFDO0FBQUEsSUFDVCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxrQkFBZ0IsU0FBUyxzREFBc0QsaUJBQWtCO0FBQ2hHLFVBQU0sRUFBRSxZQUFZLFNBQVMsSUFBSSxNQUFNLGNBQWMsc0JBQXNCO0FBQzNFLFVBQU0sZ0JBQWdCLFlBQVksR0FBRztBQUFBLE1BQ3BDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLGNBQWMsRUFBRSxVQUFVLGFBQWEsVUFBVSxPQUFPLENBQUMsRUFBRTtBQUFBLElBQzVELENBQUM7QUFFRCxVQUFNLGdCQUFnQixZQUFZLEdBQUc7QUFBQSxNQUNwQyxNQUFNLFdBQVc7QUFBQSxNQUNqQixjQUFjLEVBQUUsVUFBVSxhQUFhLFNBQVMsT0FBTyxDQUFDLEVBQUU7QUFBQSxJQUMzRCxDQUFDO0FBRUQsV0FBTyxpQkFBaUIsTUFBTSxhQUFhLFVBQVUsR0FBRyxjQUFjLElBQUksWUFBVSxPQUFPLFdBQVcsR0FBRyxDQUFDLE9BQU8sQ0FBQztBQUFBLEVBQ25ILENBQUM7QUFFRCxrQkFBZ0IsU0FBUyx5REFBeUQsaUJBQWtCO0FBQ25HLFVBQU0sRUFBRSxZQUFZLFNBQVMsSUFBSSxNQUFNLGNBQWMsc0JBQXNCO0FBQzNFLFVBQU0sZ0JBQWdCLFlBQVksR0FBRztBQUFBLE1BQ3BDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLGNBQWMsRUFBRSxVQUFVLGFBQWEsbUJBQW1CLE9BQU8sQ0FBQyxFQUFFO0FBQUEsSUFDckUsQ0FBQztBQUVELFVBQU0sZ0JBQWdCLFlBQVksR0FBRyxFQUFFLE1BQU0sV0FBVyw0QkFBNEIsU0FBUyxDQUFDO0FBRTlGLFdBQU8saUJBQWlCLE1BQU0sYUFBYSxVQUFVLEdBQUcsZUFBZSxDQUFDLENBQUM7QUFBQSxFQUMxRSxDQUFDO0FBRUQsa0JBQWdCLFNBQVMsc0NBQXNDLGlCQUFrQjtBQUNoRixVQUFNLEVBQUUsUUFBUSxJQUFJLE1BQU0sY0FBYyxXQUFXO0FBQ25ELFVBQU0sUUFBUSxZQUFZLFlBQVk7QUFFdEMsVUFBTSxnQkFBZ0IsU0FBUyxHQUFHLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixNQUFNLENBQUM7QUFFOUUsV0FBTyxpQkFBaUIsTUFBTSxVQUFVLE9BQU8sR0FBRyxPQUFPLEtBQUs7QUFBQSxFQUMvRCxDQUFDO0FBRUQsa0JBQWdCLFNBQVMsOENBQThDLGlCQUFrQjtBQUN4RixVQUFNLEVBQUUsUUFBUSxJQUFJLE1BQU0sY0FBYyxlQUFlO0FBQ3ZELFVBQU0sZ0JBQWdCLFNBQVMsR0FBRyxFQUFFLE1BQU0sV0FBVyxrQkFBa0IsT0FBTyxZQUFZLFFBQVEsRUFBRSxDQUFDO0FBRXJHLFVBQU0sZ0JBQWdCLFNBQVMsR0FBRyxFQUFFLE1BQU0sV0FBVyxrQkFBa0IsT0FBTyxZQUFZLE9BQU8sRUFBRSxDQUFDO0FBRXBHLFdBQU8saUJBQWlCLE1BQU0sVUFBVSxPQUFPLEdBQUcsT0FBTyxZQUFZLE9BQU8sQ0FBQztBQUFBLEVBQzlFLENBQUM7QUFFRCxrQkFBZ0IsU0FBUywrQ0FBK0MsaUJBQWtCO0FBQ3pGLFVBQU0sRUFBRSxRQUFRLElBQUksTUFBTSxjQUFjLGFBQWE7QUFDckQsVUFBTSxnQkFBZ0IsU0FBUyxHQUFHLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixPQUFPLFlBQVksT0FBTyxFQUFFLENBQUM7QUFFcEcsVUFBTSxnQkFBZ0IsU0FBUyxHQUFHLEVBQUUsTUFBTSxXQUFXLGlCQUFpQixDQUFDO0FBRXZFLFdBQU8sYUFBYSxNQUFNLFVBQVUsT0FBTyxHQUFHLE9BQU8sTUFBUztBQUFBLEVBQy9ELENBQUM7QUFFRCxrQkFBZ0IsU0FBUyxxRUFBcUUsaUJBQWtCO0FBQy9HLFVBQU0sRUFBRSxRQUFRLElBQUksTUFBTSxjQUFjLGVBQWU7QUFDdkQsWUFBUSxPQUFPLGNBQWM7QUFPN0IsVUFBTSxnQkFBZ0IsU0FBUyxHQUFHO0FBQUEsTUFDakMsTUFBTSxXQUFXO0FBQUEsTUFDakIsTUFBTSxtQkFBbUI7QUFBQSxNQUN6QixJQUFJO0FBQUEsTUFDSixTQUFTLFlBQVksd0JBQXdCO0FBQUEsSUFDOUMsQ0FBQztBQUVELFVBQU0sVUFBVSxNQUFNLFFBQVEsT0FBTztBQUFBLE1BQW9CLE9BQ3hELHFCQUFxQixHQUFHLGtCQUFrQixLQUN2QyxrQkFBa0IsQ0FBQyxFQUFFLFlBQVksV0FDaEMsa0JBQWtCLENBQUMsRUFBRSxPQUF3QyxvQkFBb0I7QUFBQSxNQUNyRjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVUsa0JBQWtCLE9BQU8sRUFBRSxPQUE4QjtBQUN6RSxVQUFNLFFBQVEsT0FBTztBQUFBLE1BQW9CLE9BQ3hDLHFCQUFxQixHQUFHLG1CQUFtQixLQUN4QyxrQkFBa0IsQ0FBQyxFQUFFLFlBQVksV0FDaEMsa0JBQWtCLENBQUMsRUFBRSxPQUE4QixXQUFXO0FBQUEsTUFDbEU7QUFBQSxJQUNEO0FBSUEsV0FBTyxpQkFBaUIsTUFBTSxVQUFVLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQzNFLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyxpRUFBaUUsaUJBQWtCO0FBQzNHLFVBQU0sRUFBRSxRQUFRLElBQUksTUFBTSxjQUFjLHNCQUFzQjtBQUU5RCxVQUFNLGdCQUFnQixTQUFTLEdBQUc7QUFBQSxNQUNqQyxNQUFNLFdBQVc7QUFBQSxNQUNqQixNQUFNLG1CQUFtQjtBQUFBLE1BQ3pCLElBQUk7QUFBQSxJQUNMLENBQUM7QUFFRCxXQUFPLGFBQWEsTUFBTSxVQUFVLE9BQU8sR0FBRyxnQkFBZ0IsTUFBUztBQUFBLEVBQ3hFLENBQUM7QUFFRCxrQkFBZ0IsU0FBUywwREFBMEQsaUJBQWtCO0FBQ3BHLFVBQU0sRUFBRSxRQUFRLElBQUksTUFBTSxjQUFjLHVCQUF1QjtBQUUvRCxVQUFNLGdCQUFnQixTQUFTLEdBQUc7QUFBQSxNQUNqQyxNQUFNLFdBQVc7QUFBQSxNQUNqQixPQUFPLENBQUMsU0FBUztBQUFBLElBQ2xCLENBQUM7QUFFRCxXQUFPLGFBQWEsTUFBTSxVQUFVLE9BQU8sR0FBRyxnQkFBZ0IsTUFBUztBQUFBLEVBQ3hFLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyx5REFBeUQsaUJBQWtCO0FBQ25HLFVBQU0sRUFBRSxRQUFRLElBQUksTUFBTSxjQUFjLGtCQUFrQjtBQUMxRCxVQUFNLFNBQVMsTUFBTSxVQUFVLE9BQU87QUFFdEMsVUFBTSxnQkFBZ0IsU0FBUyxHQUFHO0FBQUEsTUFDakMsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUVELFdBQU8saUJBQWlCLE1BQU0sVUFBVSxPQUFPLEdBQUcsT0FBTyxPQUFPLEtBQUs7QUFBQSxFQUN0RSxDQUFDO0FBRUQsa0JBQWdCLFNBQVMsa0RBQWtELGlCQUFrQjtBQUM1RixVQUFNLEVBQUUsUUFBUSxJQUFJLE1BQU0sY0FBYyxnQkFBZ0I7QUFFeEQsVUFBTSxnQkFBZ0IsU0FBUyxHQUFHO0FBQUEsTUFDakMsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLElBQ1gsQ0FBQztBQUVELFVBQU0sUUFBUSxNQUFNLFVBQVUsT0FBTztBQUNyQyxXQUFPO0FBQUEsTUFDTixFQUFFLFlBQVksTUFBTSxZQUFZLE9BQU8sTUFBTSxPQUFPLFFBQVEsTUFBTSxPQUFPO0FBQUEsTUFDekUsRUFBRSxZQUFZLFFBQVcsT0FBTyxDQUFDLEdBQUcsUUFBUSxjQUFjLEtBQUs7QUFBQSxJQUNoRTtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixTQUFTLDZEQUE2RCxpQkFBa0I7QUFDdkcsVUFBTSxhQUFhLG1CQUFtQixPQUFPLEVBQUUsYUFBYSxVQUFVLFVBQVUsTUFBTTtBQUNyRixZQUFNLFFBQVEsTUFBTSxjQUFjLFdBQVc7QUFDN0MsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixLQUFLLE1BQU07QUFBQSxRQUNYLE1BQU0sTUFBTTtBQUFBLFFBQ1osTUFBTSxNQUFNO0FBQUEsUUFDWixPQUFPLE1BQU07QUFBQSxNQUNkLEdBQUc7QUFBQSxRQUNGLEtBQUssSUFBSSxLQUFLLFNBQVMsRUFBRTtBQUFBLFFBQ3pCLE1BQU07QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLE9BQU8sRUFBRSxNQUFNLGtCQUFrQixRQUFRLFNBQVM7QUFBQSxNQUNuRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsa0JBQWdCLFNBQVMsK0NBQStDLGlCQUFrQjtBQUN6RixVQUFNLGFBQWEsbUJBQW1CLE9BQU8sRUFBRSxZQUFZLE1BQU07QUFDaEUsWUFBTSxnQkFBZ0IsYUFBYSxHQUFHLEVBQUUsTUFBTSxXQUFXLGlCQUFpQixNQUFNLEtBQUssTUFBTSxHQUFHLENBQUM7QUFDL0YsWUFBTSxRQUFRLE1BQU0sY0FBYyxXQUFXO0FBQzdDLGFBQU8sZ0JBQWdCLEVBQUUsTUFBTSxNQUFNLE1BQU0sTUFBTSxNQUFNLEtBQUssR0FBRyxFQUFFLE1BQU0sS0FBSyxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQ3ZGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyxzQ0FBc0MsaUJBQWtCO0FBQ2hGLFVBQU0sYUFBYSxrQkFBa0IsT0FBTyxFQUFFLFlBQVksTUFBTTtBQUMvRCxjQUFRLE9BQU8sY0FBYztBQUM3QixjQUFRLE9BQU8sU0FBUztBQUFBLFFBQ3ZCLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFFBQVEsRUFBRSxNQUFNLFdBQVcsc0JBQXNCLE9BQU8sbUJBQW1CO0FBQUEsTUFDNUUsQ0FBQztBQUNELFlBQU0sZUFBZSxNQUFNLFFBQVEsT0FBTztBQUFBLFFBQW9CLE9BQzdELHFCQUFxQixHQUFHLHVCQUF1QixLQUM1QyxrQkFBa0IsQ0FBQyxFQUFFLFlBQVksZUFDaEMsa0JBQWtCLENBQUMsRUFBRSxPQUE2QixVQUFVO0FBQUEsTUFDakU7QUFDQSxhQUFPLFlBQWEsa0JBQWtCLFlBQVksRUFBRSxPQUE2QixPQUFPLGtCQUFrQjtBQUFBLElBQzNHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyw4REFBOEQsaUJBQWtCO0FBQ3hHLFVBQU0sYUFBYSxrQkFBa0IsT0FBTyxFQUFFLFlBQVksWUFBWSxNQUFNO0FBQzNFLFlBQU0sUUFBdUIsRUFBRSxNQUFNLGtCQUFrQixTQUFTLFNBQVMsV0FBVztBQUNwRixZQUFNLGdCQUFnQixhQUFhLEdBQUcsRUFBRSxNQUFNLFdBQVcsaUJBQWlCLE1BQU0sQ0FBQztBQUNqRixhQUFPLGlCQUFpQixNQUFNLGNBQWMsV0FBVyxHQUFHLE9BQU8sS0FBSztBQUFBLElBQ3ZFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyx3REFBd0QsaUJBQWtCO0FBQ2xHLFVBQU0sYUFBYSxrQkFBa0IsT0FBTyxFQUFFLFlBQVksTUFBTTtBQUMvRCxjQUFRLE9BQU8sY0FBYztBQUM3QixjQUFRLE9BQU8sU0FBUztBQUFBLFFBQ3ZCLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFFBQVEsRUFBRSxNQUFNLFdBQVcsZUFBZSxNQUFNLG1CQUFtQjtBQUFBLE1BQ3BFLENBQUM7QUFDRCxVQUFJLGlCQUFpQjtBQUNyQixZQUFNLFFBQVEsT0FBTyxvQkFBb0IsT0FBSztBQUM3QyxZQUFJLENBQUMscUJBQXFCLEdBQUcsZUFBZSxLQUFLLGtCQUFrQixDQUFDLEVBQUUsWUFBWSxhQUFhO0FBQzlGLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0sU0FBUyxrQkFBa0IsQ0FBQyxFQUFFO0FBQ3BDLDBCQUFrQixPQUFPO0FBQ3pCLGVBQU8scUJBQXFCLEtBQUssY0FBYztBQUFBLE1BQ2hELEdBQUcsR0FBTTtBQUNULFlBQU0sU0FBUyxhQUFhLE1BQU0sY0FBYyxXQUFXLENBQUM7QUFDNUQsYUFBTyxNQUFNLFFBQVEsb0JBQW9CO0FBQUEsSUFDMUMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELGtCQUFnQixTQUFTLG1FQUFtRSxpQkFBa0I7QUFDN0csVUFBTSxhQUFhLGtCQUFrQixPQUFPLEVBQUUsWUFBWSxNQUFNO0FBQy9ELGNBQVEsT0FBTyxjQUFjO0FBQzdCLGNBQVEsT0FBTyxTQUFTO0FBQUEsUUFDdkIsU0FBUztBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsUUFBUSxFQUFFLE1BQU0sV0FBVyxlQUFlLE1BQU0sNkJBQStCO0FBQUEsTUFDaEYsQ0FBQztBQUNELFVBQUksaUJBQWlCO0FBQ3JCLFlBQU0sUUFBUSxPQUFPLG9CQUFvQixPQUFLO0FBQzdDLFlBQUksQ0FBQyxxQkFBcUIsR0FBRyxlQUFlLEtBQUssa0JBQWtCLENBQUMsRUFBRSxZQUFZLGFBQWE7QUFDOUYsaUJBQU87QUFBQSxRQUNSO0FBQ0EsMEJBQW1CLGtCQUFrQixDQUFDLEVBQUUsT0FBcUM7QUFDN0UsZUFBTyxlQUFlLFNBQVMsY0FBYztBQUFBLE1BQzlDLEdBQUcsR0FBTTtBQUNULFlBQU0sU0FBUyxhQUFhLE1BQU0sY0FBYyxXQUFXLENBQUM7QUFFNUQsWUFBTSxnQkFBZ0IsYUFBYSxHQUFHLEVBQUUsTUFBTSxXQUFXLGdCQUFnQixDQUFDO0FBVTFFLFlBQU0sUUFBUSxhQUFhLE1BQU0sY0FBYyxXQUFXLENBQUM7QUFDM0QsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixtQkFBbUIsT0FBTyxTQUFTLGNBQWM7QUFBQSxRQUNqRCxrQkFBa0IsTUFBTSxTQUFTLGNBQWM7QUFBQSxNQUNoRCxHQUFHO0FBQUEsUUFDRixtQkFBbUI7QUFBQSxRQUNuQixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsa0JBQWdCLFNBQVMsc0RBQXNELGlCQUFrQjtBQUNoRyxVQUFNLGFBQWEsaUJBQWlCLE9BQU8sRUFBRSxZQUFZLE1BQU07QUFDOUQsY0FBUSxPQUFPLGNBQWM7QUFDN0IsY0FBUSxPQUFPLFNBQVM7QUFBQSxRQUN2QixTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsUUFDWCxRQUFRLEVBQUUsTUFBTSxXQUFXLGVBQWUsTUFBTSxTQUFTO0FBQUEsTUFDMUQsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsT0FBTztBQUFBLFFBQW9CLE9BQ3ZELHFCQUFxQixHQUFHLGlCQUFpQixLQUFLLGtCQUFrQixDQUFDLEVBQUUsWUFBWTtBQUFBLFFBQy9FO0FBQUEsTUFDRDtBQUlBLFlBQU0sU0FBUyxrQkFBa0IsTUFBTSxFQUFFO0FBQ3pDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLE9BQU8sT0FBTztBQUFBLFFBQ2hDLDJCQUEyQixNQUFNLGNBQWMsV0FBVyxHQUFHLGFBQWEsT0FBTztBQUFBLE1BQ2xGLEdBQUc7QUFBQSxRQUNGLGtCQUFrQjtBQUFBLFFBQ2xCLDBCQUEwQjtBQUFBLE1BQzNCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxrQkFBZ0IsU0FBUyw0REFBNEQsaUJBQWtCO0FBR3RHLFVBQU0sYUFBYSxpQkFBaUIsT0FBTyxFQUFFLFVBQVUsVUFBVSxNQUFNO0FBQ3RFLFlBQU0sUUFBUSxPQUFPLEtBQXNCLGFBQWEsRUFBRSxTQUFTLGVBQWUsQ0FBQztBQUNuRixjQUFRLE9BQU8sY0FBYztBQUU3QixlQUFTLFlBQVksR0FBcUQ7QUFDekUsZUFBUSxrQkFBa0IsQ0FBQyxFQUFFLE9BQTJELGFBQWEsQ0FBQztBQUFBLE1BQ3ZHO0FBSUEsWUFBTSxjQUFjLElBQUksS0FBSyxFQUFFLFFBQVEsc0JBQXNCLFdBQVcsT0FBTyxNQUFNLElBQUksYUFBYSxDQUFDLEdBQUcsQ0FBQyxFQUFFLFNBQVM7QUFDdEgsVUFBSSxrQkFBa0I7QUFDdEIsVUFBSTtBQUNILGNBQU0sUUFBUSxPQUFPLEtBQUssa0JBQWtCO0FBQUEsVUFDM0MsU0FBUztBQUFBLFVBQ1QsT0FBTyxFQUFFLE1BQU0sa0JBQWtCLFFBQVEsU0FBUztBQUFBLFVBQ2xELE1BQU07QUFBQSxVQUNOLEtBQUssSUFBSSxLQUFLLFNBQVMsRUFBRSxTQUFTO0FBQUEsVUFDbEMsTUFBTTtBQUFBLFVBQ04sTUFBTTtBQUFBLFFBQ1AsQ0FBQztBQUNELDBCQUFrQjtBQUNsQixjQUFNLFFBQVEsT0FBTztBQUFBLFVBQW9CLE9BQ3hDLHFCQUFxQixHQUFHLHVCQUF1QixLQUM1QyxZQUFZLENBQUMsRUFBRSxLQUFLLGNBQVksU0FBUyxhQUFhLFdBQVc7QUFBQSxVQUNwRTtBQUFBLFFBQ0Q7QUFFQSxjQUFNLGdCQUFnQixXQUFXO0FBQ2pDLDBCQUFrQjtBQUNsQixjQUFNLFFBQVEsT0FBTztBQUFBLFVBQW9CLE9BQ3hDLHFCQUFxQixHQUFHLHVCQUF1QixLQUM1QyxDQUFDLFlBQVksQ0FBQyxFQUFFLEtBQUssY0FBWSxTQUFTLGFBQWEsV0FBVztBQUFBLFVBQ3JFO0FBQUEsUUFDRDtBQUFBLE1BQ0QsVUFBRTtBQUNELFlBQUksaUJBQWlCO0FBQ3BCLGdCQUFNLGdCQUFnQixXQUFXO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsa0JBQWdCLFNBQVMsd0RBQXdELGlCQUFrQjtBQUNsRyxVQUFNLEVBQUUsWUFBWSxJQUFJLE1BQU0sZUFBZSxrQkFBa0I7QUFFL0QsVUFBTSxnQkFBZ0IsV0FBVztBQUVqQyxVQUFNLE9BQU8sTUFBTSxRQUFRLE9BQU8sS0FBc0IsYUFBYSxFQUFFLFNBQVMsZUFBZSxDQUFDO0FBQ2hHLFVBQU0sUUFBUSxLQUFLLFNBQVU7QUFDN0IsV0FBTyxZQUFZLE1BQU0sV0FBVyxLQUFLLGNBQVksU0FBUyxhQUFhLFdBQVcsS0FBSyxPQUFPLEtBQUs7QUFBQSxFQUN4RyxDQUFDO0FBRUQsa0JBQWdCLFNBQVMsc0RBQXNELGlCQUFrQjtBQUNoRyxVQUFNLGFBQWEsc0JBQXNCLE9BQU8sRUFBRSxhQUFhLFNBQVMsTUFBTTtBQUM3RSxZQUFNLE9BQU8sUUFBUSxRQUFRLE9BQU8sS0FBSyxrQkFBa0I7QUFBQSxRQUMxRCxTQUFTO0FBQUEsUUFDVCxPQUFPLEVBQUUsTUFBTSxrQkFBa0IsUUFBUSxTQUFTO0FBQUEsTUFDbkQsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsa0JBQWdCLFNBQVMsa0RBQWtELGlCQUFrQjtBQUM1RixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sY0FBYyxJQUFJLEtBQUssRUFBRSxRQUFRLHNCQUFzQixXQUFXLE9BQU8sTUFBTSxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTO0FBRXRILFVBQU0sT0FBTyxRQUFRLFFBQVEsT0FBTyxLQUFzQixhQUFhLEVBQUUsU0FBUyxZQUFZLENBQUMsQ0FBQztBQUFBLEVBQ2pHLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
