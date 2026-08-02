import assert from "assert";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ReconnectResultType } from "../../../../common/state/protocol/commands.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildChatUri, buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus } from "../../../../common/state/sessionState.js";
import { createRealSession, dispatchTurn } from "../harness/agentHostE2ETestHarness.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { AhpErrorCodes, JsonRpcErrorCodes } from "../../../../common/state/sessionProtocol.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineProtocolContractTests(context) {
  const { config, createdSessions, tempDirs } = context;
  let clientSeq = 4e3;
  function nextClientSeq() {
    return clientSeq++;
  }
  async function dispatchAndWaitOnShared(channel, action) {
    const seq = nextClientSeq();
    context.client.dispatch({ channel, clientSeq: seq, action });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === channel && getActionEnvelope(n).origin?.clientSeq === seq,
      3e4
    );
  }
  async function createSession(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
    return { sessionUri, workspace };
  }
  conformanceTest(context, "ping answers while the connection is live", async function() {
    await context.client.call("ping", { channel: ROOT_STATE_URI });
  });
  conformanceTest(context, "ping answers before the client initializes", async function() {
    const client = await context.connectClient();
    try {
      const result = await client.call("ping", { channel: ROOT_STATE_URI });
      assert.strictEqual(result, null);
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize rejects incompatible protocol versions", async function() {
    const client = await context.connectClient();
    try {
      await assert.rejects(client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: ["999.0.0"],
        clientId: `incompatible-version-${config.provider}`
      }), { code: AhpErrorCodes.UnsupportedProtocolVersion });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize rejects an empty protocol version list", async function() {
    const client = await context.connectClient();
    try {
      await assert.rejects(client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [],
        clientId: `empty-versions-${config.provider}`
      }), { code: AhpErrorCodes.UnsupportedProtocolVersion });
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "initialize without subscriptions returns no snapshots", async function() {
    const client = await context.connectClient();
    try {
      const initialized = await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `no-initial-subscriptions-${config.provider}`
      });
      assert.deepStrictEqual(initialized.snapshots, []);
    } finally {
      client.close();
    }
  });
  conformanceTest(context, "listSessions includes provider-backed session metadata", async function() {
    const { sessionUri, workspace } = await createSession("list-session-metadata");
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(context.client, sessionUri, "turn-list-session-metadata", "/rename Listed Session", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-list-session-metadata"
    );
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    const item = result.items.find((item2) => item2.resource === sessionUri);
    assert.deepStrictEqual({
      provider: item?.provider,
      hasTitle: typeof item?.title === "string" && item.title.length > 0,
      statusIsNumber: typeof item?.status === "number",
      workingDirectories: item?.workingDirectories,
      hasCreatedAt: item !== void 0 && Number.isFinite(Date.parse(item.createdAt)),
      hasModifiedAt: item !== void 0 && Number.isFinite(Date.parse(item.modifiedAt))
    }, {
      provider: config.provider,
      hasTitle: true,
      statusIsNumber: true,
      workingDirectories: [URI.file(workspace).toString()],
      hasCreatedAt: true,
      hasModifiedAt: true
    });
  });
  conformanceTest(context, "listSessions reflects live title and status changes", async function() {
    const { sessionUri } = await createSession("list-session-live-state");
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(context.client, sessionUri, "turn-list-session-live-state", "/rename Catalog Title", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-list-session-live-state"
    );
    await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsReadChanged, isRead: true });
    await dispatchAndWaitOnShared(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    const item = result.items.find((item2) => item2.resource === sessionUri);
    assert.deepStrictEqual({
      title: item?.title,
      isRead: !!(item?.status && item.status & SessionStatus.IsRead),
      isArchived: !!(item?.status && item.status & SessionStatus.IsArchived)
    }, {
      title: "Catalog Title",
      isRead: true,
      isArchived: true
    });
  });
  conformanceTest(context, "disposing a session removes it from listSessions", async function() {
    const { sessionUri } = await createSession("list-session-dispose");
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(context.client, sessionUri, "turn-list-session-dispose", "/rename Disposable Session", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-list-session-dispose"
    );
    const before = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    assert.strictEqual(before.items.some((item) => item.resource === sessionUri), true);
    await context.client.call("disposeSession", { channel: sessionUri });
    const trackedIndex = createdSessions.indexOf(sessionUri);
    if (trackedIndex >= 0) {
      createdSessions.splice(trackedIndex, 1);
    }
    const result = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    assert.strictEqual(result.items.some((item) => item.resource === sessionUri), false);
  });
  conformanceTest(context, "fetchTurns currently emits an empty loaded-turns page", async function() {
    const { sessionUri } = await createSession("fetch-turns");
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.call("subscribe", { channel: chatUri });
    dispatchTurn(context.client, sessionUri, "turn-fetch", "/rename Fetch Turns", nextClientSeq());
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === "turn-fetch",
      6e4
    );
    context.client.clearReceived();
    const result = await context.client.call("fetchTurns", { channel: chatUri });
    const loaded = await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnsLoaded") && getActionEnvelope(n).channel === chatUri,
      3e4
    );
    const action = getActionEnvelope(loaded).action;
    assert.deepStrictEqual({
      result,
      action
    }, {
      result: {},
      action: {
        type: ActionType.ChatTurnsLoaded,
        turns: []
      }
    });
  });
  conformanceTest(context, "fetchTurns rejects a cursor the host did not issue", async function() {
    const { sessionUri } = await createSession("fetch-turns-cursor");
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.call("subscribe", { channel: chatUri });
    await assert.rejects(context.client.call("fetchTurns", {
      channel: chatUri,
      cursor: "not-a-host-cursor"
    }), { code: JsonRpcErrorCodes.InvalidParams });
  });
  conformanceTest(context, "fetchTurns rejects an unknown chat channel", async function() {
    const { sessionUri } = await createSession("fetch-turns-missing");
    const missingChat = buildChatUri(sessionUri, "missing");
    await assert.rejects(context.client.call("fetchTurns", {
      channel: missingChat
    }));
  });
  conformanceTest(context, "initialize returns snapshots for initial subscriptions", async function() {
    const { sessionUri } = await createSession("initial-subscriptions");
    const chatUri = buildDefaultChatUri(sessionUri);
    const client = await context.connectClient();
    try {
      const initialized = await client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `initial-subscriptions-${config.provider}`,
        initialSubscriptions: [sessionUri, chatUri]
      });
      assert.deepStrictEqual(initialized.snapshots.map((snapshot) => snapshot.resource).sort(), [sessionUri, chatUri].sort());
    } finally {
      client.close();
    }
  });
  async function afterConnectionDrop(clientId, body) {
    const first = await context.connectClient();
    let carried;
    try {
      await first.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId });
      carried = await body(first);
    } finally {
      first.close();
    }
    return { carried, revived: await context.connectClient() };
  }
  conformanceTest(context, "reconnect replays only the actions a dropped client missed", async function() {
    const { sessionUri } = await createSession("reconnect");
    const chatUri = buildDefaultChatUri(sessionUri);
    const droppedClientId = `reconnect-dropped-${config.provider}`;
    const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async (first) => {
      const subscribed = await first.call("subscribe", { channel: chatUri });
      return subscribed.snapshot.fromSeq;
    });
    try {
      await dispatchAndWaitOnShared(chatUri, { type: ActionType.ChatDraftChanged, draft: { text: "missed while disconnected", origin: { kind: MessageKind.User } } });
      const result = await revived.call("reconnect", {
        channel: ROOT_STATE_URI,
        clientId: droppedClientId,
        lastSeenServerSeq: seenThrough,
        subscriptions: [chatUri]
      });
      assert.deepStrictEqual({
        type: result.type,
        replayedAlreadySeen: result.type === ReconnectResultType.Replay && result.actions.some((envelope) => envelope.serverSeq <= seenThrough),
        replayedTheGap: result.type === ReconnectResultType.Replay && result.actions.some((envelope) => envelope.serverSeq > seenThrough)
      }, {
        type: ReconnectResultType.Replay,
        replayedAlreadySeen: false,
        replayedTheGap: true
      });
    } finally {
      revived.close();
    }
  });
  conformanceTest(context, "reconnect reports a subscription it cannot resume as missing", async function() {
    const { sessionUri } = await createSession("reconnect-missing");
    const chatUri = buildDefaultChatUri(sessionUri);
    const droppedClientId = `reconnect-missing-dropped-${config.provider}`;
    const goneUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: "/never-existed" }).toString();
    const { carried: seenThrough, revived } = await afterConnectionDrop(droppedClientId, async (first) => {
      const subscribed = await first.call("subscribe", { channel: chatUri });
      return subscribed.snapshot.fromSeq;
    });
    try {
      const result = await revived.call("reconnect", {
        channel: ROOT_STATE_URI,
        clientId: droppedClientId,
        lastSeenServerSeq: seenThrough,
        subscriptions: [chatUri, goneUri]
      });
      assert.deepStrictEqual({
        type: result.type,
        missing: result.type === ReconnectResultType.Replay ? result.missing : void 0
      }, {
        type: ReconnectResultType.Replay,
        missing: [goneUri]
      });
    } finally {
      revived.close();
    }
  });
  const unsupportedWorkingDirectoryActions = [
    { notification: "session/workingDirectorySet", channel: "session", build: (directory) => ({ type: ActionType.SessionWorkingDirectorySet, directory }) },
    { notification: "session/workingDirectoryRemoved", channel: "session", build: (directory) => ({ type: ActionType.SessionWorkingDirectoryRemoved, directory }) },
    { notification: "chat/workingDirectorySet", channel: "chat", build: (directory) => ({ type: ActionType.ChatWorkingDirectorySet, directory }) },
    { notification: "chat/workingDirectoryRemoved", channel: "chat", build: (directory) => ({ type: ActionType.ChatWorkingDirectoryRemoved, directory }) }
  ];
  for (const unsupported of unsupportedWorkingDirectoryActions) {
    conformanceTest(context, `${unsupported.notification} is rejected rather than silently dropped`, async function() {
      const { sessionUri, workspace } = await createSession("unsupported-action");
      const channel = unsupported.channel === "session" ? sessionUri : buildDefaultChatUri(sessionUri);
      await context.client.call("subscribe", { channel });
      context.client.clearReceived();
      const seq = nextClientSeq();
      const directory = URI.file(join(workspace, "second-root")).toString();
      context.client.dispatch({ channel, clientSeq: seq, action: unsupported.build(directory) });
      const rejected = await context.client.waitForNotification(
        (n) => isActionNotification(n, unsupported.notification) && getActionEnvelope(n).channel === channel,
        3e4
      );
      const envelope = getActionEnvelope(rejected);
      const state = (await context.client.call("subscribe", { channel })).snapshot.state;
      assert.deepStrictEqual({
        hasRejectionReason: typeof envelope.rejectionReason === "string" && envelope.rejectionReason.length > 0,
        echoedClientSeq: envelope.origin?.clientSeq,
        // The reducer is deliberately not run, so state never moves.
        directoryApplied: (state.workingDirectories ?? []).includes(directory)
      }, {
        hasRejectionReason: true,
        echoedClientSeq: seq,
        directoryApplied: false
      });
    });
  }
}
export {
  defineProtocolContractTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3N1aXRlcy9wcm90b2NvbENvbnRyYWN0c1N1aXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBQcm90b2NvbC1sZXZlbCBjb250cmFjdHMgdGhhdCBhcmUgbm90IHRpZWQgdG8gYW55IG9uZSBjaGFubmVsOiBsaXZlbmVzcyxcbiAqIHR1cm4taGlzdG9yeSBwYWdpbmcsIGFuZCBob3cgdGhlIGhvc3QgYW5zd2VycyBhIGNsaWVudCBhY3Rpb24gaXQgZGVjbGFyZXNcbiAqIGJ1dCBkb2VzIG5vdCB5ZXQgaW1wbGVtZW50LlxuICpcbiAqIEFsbCBvZiB0aGVzZSBhcmUgaG9zdC1vd25lZCBhbmQgY3Jvc3Mgbm8gbW9kZWwgYm91bmRhcnkuXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkdGVtcFN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmVjb25uZWN0UmVzdWx0VHlwZSwgdHlwZSBGZXRjaFR1cm5zUmVzdWx0LCB0eXBlIEluaXRpYWxpemVSZXN1bHQsIHR5cGUgTGlzdFNlc3Npb25zUmVzdWx0LCB0eXBlIFJlY29ubmVjdFJlc3VsdCwgdHlwZSBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBTdGF0ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIE1lc3NhZ2VLaW5kLCBST09UX1NUQVRFX1VSSSwgU2Vzc2lvblN0YXR1cywgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWFsU2Vzc2lvbiwgZGlzcGF0Y2hUdXJuIH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWhwRXJyb3JDb2RlcywgSnNvblJwY0Vycm9yQ29kZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiwgdHlwZSBUZXN0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IGNvbmZvcm1hbmNlVGVzdCwgdHlwZSBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQgfSBmcm9tICcuL2UyZVRlc3RDb250ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZVByb3RvY29sQ29udHJhY3RUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMgfSA9IGNvbnRleHQ7XG5cblx0LyoqXG5cdCAqIENsaWVudCBzZXF1ZW5jZSBudW1iZXJzIG11c3Qgc3RyaWN0bHkgaW5jcmVhc2UgZm9yIHRoZSBsaWZldGltZSBvZiBhXG5cdCAqIGNsaWVudCwgYW5kIHRoZSBzdWl0ZSBzaGFyZXMgb25lIGFjcm9zcyB0ZXN0cywgc28gdGhleSBjYW5ub3QgYmVcblx0ICogaGFyZC1jb2RlZCBwZXIgc2NlbmFyaW8uXG5cdCAqL1xuXHRsZXQgY2xpZW50U2VxID0gNDAwMDtcblx0ZnVuY3Rpb24gbmV4dENsaWVudFNlcSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBjbGllbnRTZXErKztcblx0fVxuXG5cdC8qKiBEaXNwYXRjaCBvbiB0aGUgc2hhcmVkIGNsaWVudCBhbmQgd2FpdCBmb3IgdGhlIHNlcnZlciB0byBlY2hvIGl0IGJhY2suICovXG5cdGFzeW5jIGZ1bmN0aW9uIGRpc3BhdGNoQW5kV2FpdE9uU2hhcmVkKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcSA9IG5leHRDbGllbnRTZXEoKTtcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7IGNoYW5uZWwsIGNsaWVudFNlcTogc2VxLCBhY3Rpb24gfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCBhY3Rpb24udHlwZSlcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYW5uZWxcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLm9yaWdpbj8uY2xpZW50U2VxID09PSBzZXEsXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24ocHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHsgc2Vzc2lvblVyaTogc3RyaW5nOyB3b3Jrc3BhY2U6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgYGFocC0ke3ByZWZpeH0tYCkpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYCR7cHJlZml4fS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHRcdHJldHVybiB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9O1xuXHR9XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwaW5nIGFuc3dlcnMgd2hpbGUgdGhlIGNvbm5lY3Rpb24gaXMgbGl2ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBMaXZlbmVzcyBoYXMgbm8gcGF5bG9hZCBcdTIwMTQgdGhlIHJlc3BvbnNlIGl0c2VsZiBpcyB0aGUgc2lnbmFsLCBzbyB0aGVcblx0XHQvLyBjb250cmFjdCBpcyB0aGF0IHRoZSBjYWxsIHJlc29sdmVzIHJhdGhlciB0aGFuIHdoYXQgaXQgcmV0dXJucy5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwaW5nIGFuc3dlcnMgYmVmb3JlIHRoZSBjbGllbnQgaW5pdGlhbGl6ZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5jYWxsKCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIG51bGwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnaW5pdGlhbGl6ZSByZWplY3RzIGluY29tcGF0aWJsZSBwcm90b2NvbCB2ZXJzaW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbJzk5OS4wLjAnXSxcblx0XHRcdFx0Y2xpZW50SWQ6IGBpbmNvbXBhdGlibGUtdmVyc2lvbi0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdFx0fSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5VbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbiB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2luaXRpYWxpemUgcmVqZWN0cyBhbiBlbXB0eSBwcm90b2NvbCB2ZXJzaW9uIGxpc3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgY29udGV4dC5jb25uZWN0Q2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW10sXG5cdFx0XHRcdGNsaWVudElkOiBgZW1wdHktdmVyc2lvbnMtJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24gfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdpbml0aWFsaXplIHdpdGhvdXQgc3Vic2NyaXB0aW9ucyByZXR1cm5zIG5vIHNuYXBzaG90cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5pdGlhbGl6ZWQgPSBhd2FpdCBjbGllbnQuY2FsbDxJbml0aWFsaXplUmVzdWx0PignaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdFx0Y2xpZW50SWQ6IGBuby1pbml0aWFsLXN1YnNjcmlwdGlvbnMtJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbml0aWFsaXplZC5zbmFwc2hvdHMsIFtdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2xpc3RTZXNzaW9ucyBpbmNsdWRlcyBwcm92aWRlci1iYWNrZWQgc2Vzc2lvbiBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbGlzdC1zZXNzaW9uLW1ldGFkYXRhJyk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1saXN0LXNlc3Npb24tbWV0YWRhdGEnLCAnL3JlbmFtZSBMaXN0ZWQgU2Vzc2lvbicsIG5leHRDbGllbnRTZXEoKSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gJ3R1cm4tbGlzdC1zZXNzaW9uLW1ldGFkYXRhJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IGl0ZW0gPSByZXN1bHQuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm92aWRlcjogaXRlbT8ucHJvdmlkZXIsXG5cdFx0XHRoYXNUaXRsZTogdHlwZW9mIGl0ZW0/LnRpdGxlID09PSAnc3RyaW5nJyAmJiBpdGVtLnRpdGxlLmxlbmd0aCA+IDAsXG5cdFx0XHRzdGF0dXNJc051bWJlcjogdHlwZW9mIGl0ZW0/LnN0YXR1cyA9PT0gJ251bWJlcicsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGl0ZW0/LndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdGhhc0NyZWF0ZWRBdDogaXRlbSAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZShEYXRlLnBhcnNlKGl0ZW0uY3JlYXRlZEF0KSksXG5cdFx0XHRoYXNNb2RpZmllZEF0OiBpdGVtICE9PSB1bmRlZmluZWQgJiYgTnVtYmVyLmlzRmluaXRlKERhdGUucGFyc2UoaXRlbS5tb2RpZmllZEF0KSksXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdGhhc1RpdGxlOiB0cnVlLFxuXHRcdFx0c3RhdHVzSXNOdW1iZXI6IHRydWUsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSh3b3Jrc3BhY2UpLnRvU3RyaW5nKCldLFxuXHRcdFx0aGFzQ3JlYXRlZEF0OiB0cnVlLFxuXHRcdFx0aGFzTW9kaWZpZWRBdDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdsaXN0U2Vzc2lvbnMgcmVmbGVjdHMgbGl2ZSB0aXRsZSBhbmQgc3RhdHVzIGNoYW5nZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdsaXN0LXNlc3Npb24tbGl2ZS1zdGF0ZScpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbGlzdC1zZXNzaW9uLWxpdmUtc3RhdGUnLCAnL3JlbmFtZSBDYXRhbG9nIFRpdGxlJywgbmV4dENsaWVudFNlcSgpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1saXN0LXNlc3Npb24tbGl2ZS1zdGF0ZScsXG5cdFx0KTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXRPblNoYXJlZChzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzQXJjaGl2ZWRDaGFuZ2VkLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IGl0ZW0gPSByZXN1bHQuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogaXRlbT8udGl0bGUsXG5cdFx0XHRpc1JlYWQ6ICEhKGl0ZW0/LnN0YXR1cyAmJiBpdGVtLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNSZWFkKSxcblx0XHRcdGlzQXJjaGl2ZWQ6ICEhKGl0ZW0/LnN0YXR1cyAmJiBpdGVtLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCksXG5cdFx0fSwge1xuXHRcdFx0dGl0bGU6ICdDYXRhbG9nIFRpdGxlJyxcblx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdGlzQXJjaGl2ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzcG9zaW5nIGEgc2Vzc2lvbiByZW1vdmVzIGl0IGZyb20gbGlzdFNlc3Npb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbGlzdC1zZXNzaW9uLWRpc3Bvc2UnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRkaXNwYXRjaFR1cm4oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWxpc3Qtc2Vzc2lvbi1kaXNwb3NlJywgJy9yZW5hbWUgRGlzcG9zYWJsZSBTZXNzaW9uJywgbmV4dENsaWVudFNlcSgpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1saXN0LXNlc3Npb24tZGlzcG9zZScsXG5cdFx0KTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPExpc3RTZXNzaW9uc1Jlc3VsdD4oJ2xpc3RTZXNzaW9ucycsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZS5pdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSA9PT0gc2Vzc2lvblVyaSksIHRydWUpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZVNlc3Npb24nLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0Y29uc3QgdHJhY2tlZEluZGV4ID0gY3JlYXRlZFNlc3Npb25zLmluZGV4T2Yoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKHRyYWNrZWRJbmRleCA+PSAwKSB7XG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnMuc3BsaWNlKHRyYWNrZWRJbmRleCwgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8TGlzdFNlc3Npb25zUmVzdWx0PignbGlzdFNlc3Npb25zJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaXRlbXMuc29tZShpdGVtID0+IGl0ZW0ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmV0Y2hUdXJucyBjdXJyZW50bHkgZW1pdHMgYW4gZW1wdHkgbG9hZGVkLXR1cm5zIHBhZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdmZXRjaC10dXJucycpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXG5cdFx0Ly8gR2l2ZSB0aGUgY2hhdCBhIHR1cm4gdG8gcGFnZSBvdmVyLiBgL3JlbmFtZWAgaXMgaGFuZGxlZCBlbnRpcmVseSBieSB0aGVcblx0XHQvLyBob3N0J3MgbG9jYWwtY29tbWFuZCBkaXNwYXRjaGVyLCBzbyB0aGUgdHVybiBpcyByZWFsIHdpdGhvdXQgY3Jvc3Npbmdcblx0XHQvLyB0aGUgbW9kZWwgYm91bmRhcnkgYW5kIHdpdGhvdXQgZGVwZW5kaW5nIG9uIGEgc2hlbGwuXG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1mZXRjaCcsICcvcmVuYW1lIEZldGNoIFR1cm5zJywgbmV4dENsaWVudFNlcSgpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1mZXRjaCcsXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPEZldGNoVHVybnNSZXN1bHQ+KCdmZXRjaFR1cm5zJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXG5cdFx0Ly8gVGhlIGN1cnJlbnQgaG9zdCBpbXBsZW1lbnRhdGlvbiBhY2NlcHRzIHRoZSByZXF1ZXN0IGJ1dCBoYXMgbm8gYmFja2luZ1xuXHRcdC8vIHBhZ2VyOiBpdCBhbHdheXMgcHVibGlzaGVzIGFuIGVtcHR5IHBhZ2UsIGV2ZW4gd2hlbiB0aGUgY2hhdCBhbHJlYWR5IGhhc1xuXHRcdC8vIGxvYWRlZCB0dXJucy5cblx0XHRjb25zdCBsb2FkZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5zTG9hZGVkJykgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaSxcblx0XHRcdDMwXzAwMCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobG9hZGVkKS5hY3Rpb24gYXMgeyByZWFkb25seSB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuc0xvYWRlZDsgcmVhZG9ubHkgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0YWN0aW9uLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge30sXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybnNMb2FkZWQsXG5cdFx0XHRcdHR1cm5zOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmV0Y2hUdXJucyByZWplY3RzIGEgY3Vyc29yIHRoZSBob3N0IGRpZCBub3QgaXNzdWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdmZXRjaC10dXJucy1jdXJzb3InKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2ZldGNoVHVybnMnLCB7XG5cdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0Y3Vyc29yOiAnbm90LWEtaG9zdC1jdXJzb3InLFxuXHRcdH0pLCB7IGNvZGU6IEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZmV0Y2hUdXJucyByZWplY3RzIGFuIHVua25vd24gY2hhdCBjaGFubmVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZmV0Y2gtdHVybnMtbWlzc2luZycpO1xuXHRcdGNvbnN0IG1pc3NpbmdDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdtaXNzaW5nJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdmZXRjaFR1cm5zJywge1xuXHRcdFx0Y2hhbm5lbDogbWlzc2luZ0NoYXQsXG5cdFx0fSkpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2luaXRpYWxpemUgcmV0dXJucyBzbmFwc2hvdHMgZm9yIGluaXRpYWwgc3Vic2NyaXB0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2luaXRpYWwtc3Vic2NyaXB0aW9ucycpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbml0aWFsaXplZCA9IGF3YWl0IGNsaWVudC5jYWxsPEluaXRpYWxpemVSZXN1bHQ+KCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogYGluaXRpYWwtc3Vic2NyaXB0aW9ucy0ke2NvbmZpZy5wcm92aWRlcn1gLFxuXHRcdFx0XHRpbml0aWFsU3Vic2NyaXB0aW9uczogW3Nlc3Npb25VcmksIGNoYXRVcmldLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5pdGlhbGl6ZWQuc25hcHNob3RzLm1hcChzbmFwc2hvdCA9PiBzbmFwc2hvdC5yZXNvdXJjZSkuc29ydCgpLCBbc2Vzc2lvblVyaSwgY2hhdFVyaV0uc29ydCgpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvKipcblx0ICogUnVucyBgYm9keWAgYWdhaW5zdCBhIHNlY29uZCBjb25uZWN0aW9uIHRoYXQgaGFzIGNvbXBsZXRlZCB0aGUgaGFuZHNoYWtlXG5cdCAqIHVuZGVyIGl0cyBvd24gY2xpZW50SWQsIHRoZW4gZHJvcHMgdGhhdCBjb25uZWN0aW9uIGFuZCBoYW5kcyBiYWNrIGEgZnJlc2hcblx0ICogdW4taGFuZHNoYWtlZCBvbmUuIGByZWNvbm5lY3RgIGlzIG9ubHkgYW5zd2VyYWJsZSBwcmUtaGFuZHNoYWtlLCBzb1xuXHQgKiByZWNvdmVyeSBjYW5ub3QgYmUgZXhlcmNpc2VkIG9uIHRoZSBzaGFyZWQgY2xpZW50LlxuXHQgKi9cblx0YXN5bmMgZnVuY3Rpb24gYWZ0ZXJDb25uZWN0aW9uRHJvcDxUPihcblx0XHRjbGllbnRJZDogc3RyaW5nLFxuXHRcdGJvZHk6IChjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudCkgPT4gUHJvbWlzZTxUPixcblx0KTogUHJvbWlzZTx7IGNhcnJpZWQ6IFQ7IHJldml2ZWQ6IFRlc3RQcm90b2NvbENsaWVudCB9PiB7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjb250ZXh0LmNvbm5lY3RDbGllbnQoKTtcblx0XHRsZXQgY2FycmllZDogVDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZmlyc3QuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQgfSk7XG5cdFx0XHRjYXJyaWVkID0gYXdhaXQgYm9keShmaXJzdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZpcnN0LmNsb3NlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGNhcnJpZWQsIHJldml2ZWQ6IGF3YWl0IGNvbnRleHQuY29ubmVjdENsaWVudCgpIH07XG5cdH1cblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3JlY29ubmVjdCByZXBsYXlzIG9ubHkgdGhlIGFjdGlvbnMgYSBkcm9wcGVkIGNsaWVudCBtaXNzZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZWNvbm5lY3QnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBkcm9wcGVkQ2xpZW50SWQgPSBgcmVjb25uZWN0LWRyb3BwZWQtJHtjb25maWcucHJvdmlkZXJ9YDtcblxuXHRcdC8vIFRoZSBjdXRvZmYgY29tZXMgZnJvbSB0aGUgc3Vic2NyaWJlIHJlc3BvbnNlIHJhdGhlciB0aGFuIGZyb20gd2F0Y2hpbmdcblx0XHQvLyB0aGlzIGNsaWVudCByZWNlaXZlIGl0cyBvd24gZGlzcGF0Y2g6IGEgc3Vic2NyaXB0aW9uIGlzIG5vdCBndWFyYW50ZWVkXG5cdFx0Ly8gdG8gYmUgaW5zdGFsbGVkIGJlZm9yZSBhIGRpc3BhdGNoIHNlbnQgaW1tZWRpYXRlbHkgYWZ0ZXIgaXQgaXMgaGFuZGxlZCxcblx0XHQvLyBzbyB3YWl0aW5nIGZvciB0aGF0IGVjaG8gcmFjZXMuIGBmcm9tU2VxYCBpcyB0aGUgc2FtZSBib3VuZGFyeSBhbmQgdGhlXG5cdFx0Ly8gcmVzcG9uc2UgaXRzZWxmIGd1YXJhbnRlZXMgaXQuXG5cdFx0Y29uc3QgeyBjYXJyaWVkOiBzZWVuVGhyb3VnaCwgcmV2aXZlZCB9ID0gYXdhaXQgYWZ0ZXJDb25uZWN0aW9uRHJvcChkcm9wcGVkQ2xpZW50SWQsIGFzeW5jIGZpcnN0ID0+IHtcblx0XHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBmaXJzdC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblx0XHRcdHJldHVybiBzdWJzY3JpYmVkLnNuYXBzaG90IS5mcm9tU2VxO1xuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFByb2R1Y2VkIHdoaWxlIG5vYm9keSB3YXMgbGlzdGVuaW5nIG9uIHRoYXQgY2xpZW50SWQsIHNvIGl0IGNhbiBvbmx5XG5cdFx0XHQvLyByZWFjaCB0aGUgY2xpZW50IHRocm91Z2ggcmVwbGF5LlxuXHRcdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0T25TaGFyZWQoY2hhdFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXREcmFmdENoYW5nZWQsIGRyYWZ0OiB7IHRleHQ6ICdtaXNzZWQgd2hpbGUgZGlzY29ubmVjdGVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXZpdmVkLmNhbGw8UmVjb25uZWN0UmVzdWx0PigncmVjb25uZWN0Jywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0Y2xpZW50SWQ6IGRyb3BwZWRDbGllbnRJZCxcblx0XHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IHNlZW5UaHJvdWdoLFxuXHRcdFx0XHRzdWJzY3JpcHRpb25zOiBbY2hhdFVyaV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQSBjbGllbnQgdGhhdCByZWNvbm5lY3RzIGluc2lkZSB0aGUgcmVwbGF5IHdpbmRvdyBtdXN0IGJlIGFibGUgdG9cblx0XHRcdC8vIGNhdGNoIHVwIGJ5IGFwcGx5aW5nIGFjdGlvbnMgcmF0aGVyIHRoYW4gZGlzY2FyZGluZyBsb2NhbCBzdGF0ZSBmb3Jcblx0XHRcdC8vIGEgZnJlc2ggc25hcHNob3QsIHNvIHRoZSBjdXRvZmYgaGFzIHRvIGJlIGV4Y2x1c2l2ZSBhbmQgZXhhY3QuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHlwZTogcmVzdWx0LnR5cGUsXG5cdFx0XHRcdHJlcGxheWVkQWxyZWFkeVNlZW46IHJlc3VsdC50eXBlID09PSBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheVxuXHRcdFx0XHRcdCYmIHJlc3VsdC5hY3Rpb25zLnNvbWUoZW52ZWxvcGUgPT4gZW52ZWxvcGUuc2VydmVyU2VxIDw9IHNlZW5UaHJvdWdoKSxcblx0XHRcdFx0cmVwbGF5ZWRUaGVHYXA6IHJlc3VsdC50eXBlID09PSBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheVxuXHRcdFx0XHRcdCYmIHJlc3VsdC5hY3Rpb25zLnNvbWUoZW52ZWxvcGUgPT4gZW52ZWxvcGUuc2VydmVyU2VxID4gc2VlblRocm91Z2gpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSxcblx0XHRcdFx0cmVwbGF5ZWRBbHJlYWR5U2VlbjogZmFsc2UsXG5cdFx0XHRcdHJlcGxheWVkVGhlR2FwOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJldml2ZWQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVjb25uZWN0IHJlcG9ydHMgYSBzdWJzY3JpcHRpb24gaXQgY2Fubm90IHJlc3VtZSBhcyBtaXNzaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVjb25uZWN0LW1pc3NpbmcnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBkcm9wcGVkQ2xpZW50SWQgPSBgcmVjb25uZWN0LW1pc3NpbmctZHJvcHBlZC0ke2NvbmZpZy5wcm92aWRlcn1gO1xuXHRcdC8vIEEgY2hhbm5lbCB0aGF0IG5ldmVyIGV4aXN0ZWQgc3RhbmRzIGluIGZvciBvbmUgZGlzcG9zZWQgd2hpbGUgdGhlIGNsaWVudFxuXHRcdC8vIHdhcyBhd2F5OiBlaXRoZXIgd2F5IHRoZSBzZXJ2ZXIgY2Fubm90IHJlc3VtZSBpdCwgYW5kIHRoZSBjbGllbnQgaGFzIHRvXG5cdFx0Ly8gYmUgdG9sZCByYXRoZXIgdGhhbiBsZWZ0IHdhaXRpbmcgb24gYSBkZWFkIGNoYW5uZWwuXG5cdFx0Y29uc3QgZ29uZVVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnRob3N0LXRlcm1pbmFsJywgYXV0aG9yaXR5OiAnZTJlJywgcGF0aDogJy9uZXZlci1leGlzdGVkJyB9KS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgeyBjYXJyaWVkOiBzZWVuVGhyb3VnaCwgcmV2aXZlZCB9ID0gYXdhaXQgYWZ0ZXJDb25uZWN0aW9uRHJvcChkcm9wcGVkQ2xpZW50SWQsIGFzeW5jIGZpcnN0ID0+IHtcblx0XHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBmaXJzdC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblx0XHRcdHJldHVybiBzdWJzY3JpYmVkLnNuYXBzaG90IS5mcm9tU2VxO1xuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJldml2ZWQuY2FsbDxSZWNvbm5lY3RSZXN1bHQ+KCdyZWNvbm5lY3QnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRjbGllbnRJZDogZHJvcHBlZENsaWVudElkLFxuXHRcdFx0XHRsYXN0U2VlblNlcnZlclNlcTogc2VlblRocm91Z2gsXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnM6IFtjaGF0VXJpLCBnb25lVXJpXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHlwZTogcmVzdWx0LnR5cGUsXG5cdFx0XHRcdG1pc3Npbmc6IHJlc3VsdC50eXBlID09PSBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSA/IHJlc3VsdC5taXNzaW5nIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSxcblx0XHRcdFx0bWlzc2luZzogW2dvbmVVcmldLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJldml2ZWQuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFRoZSBwcm90b2NvbCBkZWNsYXJlcyB3b3JraW5nLWRpcmVjdG9yeSBtdXRhdGlvbiBvbiBib3RoIHRoZSBzZXNzaW9uIGFuZFxuXHQvLyBjaGF0IGNoYW5uZWxzLCBidXQgdGhlIGhvc3QgcmVqZWN0cyBhbGwgZm91cjogYXBwbHlpbmcgb25lIHdvdWxkIGNoYW5nZVxuXHQvLyB0aGUgc3luY2hyb25pemVkIGRpcmVjdG9yeSBzZXQgd2l0aG91dCByZWNvbmZpZ3VyaW5nIHRoZSBhZ2VudCdzIGFjdHVhbFxuXHQvLyBhY2Nlc3MuIEVhY2ggaXMgYW5zd2VyZWQgdGhyb3VnaCB0aGUgbm9ybWFsIHJlY29uY2lsaWF0aW9uIHBhdGggc28gdGhlXG5cdC8vIGNsaWVudCBjYW4gcm9sbCBiYWNrIGl0cyBvcHRpbWlzdGljIHdyaXRlLWFoZWFkIGFjdGlvbiBpbnN0ZWFkIG9mIGxlYXZpbmdcblx0Ly8gaXQgcGVuZGluZyB1bnRpbCByZWNvbm5lY3QuXG5cdGNvbnN0IHVuc3VwcG9ydGVkV29ya2luZ0RpcmVjdG9yeUFjdGlvbnMgPSBbXG5cdFx0eyBub3RpZmljYXRpb246ICdzZXNzaW9uL3dvcmtpbmdEaXJlY3RvcnlTZXQnLCBjaGFubmVsOiAnc2Vzc2lvbicsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3RvcnkgfSkgfSxcblx0XHR7IG5vdGlmaWNhdGlvbjogJ3Nlc3Npb24vd29ya2luZ0RpcmVjdG9yeVJlbW92ZWQnLCBjaGFubmVsOiAnc2Vzc2lvbicsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5IH0pIH0sXG5cdFx0eyBub3RpZmljYXRpb246ICdjaGF0L3dvcmtpbmdEaXJlY3RvcnlTZXQnLCBjaGFubmVsOiAnY2hhdCcsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3RvcnkgfSkgfSxcblx0XHR7IG5vdGlmaWNhdGlvbjogJ2NoYXQvd29ya2luZ0RpcmVjdG9yeVJlbW92ZWQnLCBjaGFubmVsOiAnY2hhdCcsIGJ1aWxkOiAoZGlyZWN0b3J5OiBzdHJpbmcpOiBTdGF0ZUFjdGlvbiA9PiAoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5IH0pIH0sXG5cdF0gYXMgY29uc3Q7XG5cblx0Zm9yIChjb25zdCB1bnN1cHBvcnRlZCBvZiB1bnN1cHBvcnRlZFdvcmtpbmdEaXJlY3RvcnlBY3Rpb25zKSB7XG5cdFx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsIGAke3Vuc3VwcG9ydGVkLm5vdGlmaWNhdGlvbn0gaXMgcmVqZWN0ZWQgcmF0aGVyIHRoYW4gc2lsZW50bHkgZHJvcHBlZGAsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCd1bnN1cHBvcnRlZC1hY3Rpb24nKTtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSB1bnN1cHBvcnRlZC5jaGFubmVsID09PSAnc2Vzc2lvbicgPyBzZXNzaW9uVXJpIDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsIH0pO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0XHRjb25zdCBzZXEgPSBuZXh0Q2xpZW50U2VxKCk7XG5cdFx0XHRjb25zdCBkaXJlY3RvcnkgPSBVUkkuZmlsZShqb2luKHdvcmtzcGFjZSwgJ3NlY29uZC1yb290JykpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7IGNoYW5uZWwsIGNsaWVudFNlcTogc2VxLCBhY3Rpb246IHVuc3VwcG9ydGVkLmJ1aWxkKGRpcmVjdG9yeSkgfSk7XG5cblx0XHRcdGNvbnN0IHJlamVjdGVkID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIHVuc3VwcG9ydGVkLm5vdGlmaWNhdGlvbikgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbm5lbCxcblx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUocmVqZWN0ZWQpIGFzIHsgcmVqZWN0aW9uUmVhc29uPzogc3RyaW5nOyBvcmlnaW4/OiB7IGNsaWVudFNlcT86IG51bWJlciB9IH07XG5cdFx0XHRjb25zdCBzdGF0ZSA9IChhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbCB9KSkuc25hcHNob3QhLnN0YXRlIGFzIHsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgc3RyaW5nW10gfTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1JlamVjdGlvblJlYXNvbjogdHlwZW9mIGVudmVsb3BlLnJlamVjdGlvblJlYXNvbiA9PT0gJ3N0cmluZycgJiYgZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uLmxlbmd0aCA+IDAsXG5cdFx0XHRcdGVjaG9lZENsaWVudFNlcTogZW52ZWxvcGUub3JpZ2luPy5jbGllbnRTZXEsXG5cdFx0XHRcdC8vIFRoZSByZWR1Y2VyIGlzIGRlbGliZXJhdGVseSBub3QgcnVuLCBzbyBzdGF0ZSBuZXZlciBtb3Zlcy5cblx0XHRcdFx0ZGlyZWN0b3J5QXBwbGllZDogKHN0YXRlLndvcmtpbmdEaXJlY3RvcmllcyA/PyBbXSkuaW5jbHVkZXMoZGlyZWN0b3J5KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzUmVqZWN0aW9uUmVhc29uOiB0cnVlLFxuXHRcdFx0XHRlY2hvZWRDbGllbnRTZXE6IHNlcSxcblx0XHRcdFx0ZGlyZWN0b3J5QXBwbGllZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBYUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMkJBQThJO0FBQ3ZKLFNBQVMsa0JBQW9DO0FBQzdDLFNBQVMsY0FBYyxxQkFBcUIsYUFBYSxnQkFBZ0IscUJBQWdDO0FBQ3pHLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWUseUJBQXlCO0FBQ2pELFNBQVMsbUJBQW1CLDRCQUFxRDtBQUNqRixTQUFTLHVCQUFzRDtBQUV4RCxTQUFTLDRCQUE0QixTQUF5QztBQUNwRixRQUFNLEVBQUUsUUFBUSxpQkFBaUIsU0FBUyxJQUFJO0FBTzlDLE1BQUksWUFBWTtBQUNoQixXQUFTLGdCQUF3QjtBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUdBLGlCQUFlLHdCQUF3QixTQUFpQixRQUFvQztB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
