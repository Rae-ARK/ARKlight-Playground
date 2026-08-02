import assert from "assert";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, ChatInputResponseKind, MessageKind, PendingMessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType } from "../../../../common/state/sessionState.js";
import { createRealSession, dispatchTurn, getAcceptedAnswers } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient } from "../../serverIntegrationTestHelpers.js";
import { CODEX_CONFIG, CODEX_SDK_ROOT } from "./codexTestConfiguration.js";
const REAL_CODEX_ENABLED = process.env["AGENT_HOST_REAL_CODEX"] === "1";
(REAL_CODEX_ENABLED && !!CODEX_SDK_ROOT ? suite : suite.skip)("Agent Host E2E \u2014 Codex - steering", function() {
  let server;
  let client;
  const createdSessions = [];
  const tempDirs = [];
  let cleanupClientSeq = 1e4;
  async function chatState(chat) {
    const result = await client.call("subscribe", { channel: chat });
    return result.snapshot.state;
  }
  async function markdownResponse(chat, turnId) {
    const turn = (await chatState(chat)).turns.find((turn2) => turn2.id === turnId);
    return turn?.responseParts.filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content).join("") ?? "";
  }
  async function cancelActiveTurnIfNeeded(session) {
    const chat = buildDefaultChatUri(session);
    const state = await chatState(chat);
    const turnId = state.activeTurn?.id;
    if (!turnId) {
      return;
    }
    client.dispatch({
      channel: chat,
      clientSeq: cleanupClientSeq++,
      action: {
        type: ActionType.ChatTurnCancelled,
        turnId,
        duration: 0
      }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, ActionType.ChatTurnCancelled) && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
      3e4
    );
  }
  setup(async function() {
    this.timeout(6e4);
    server = await startRealServer({ codexSdkRoot: CODEX_CONFIG.codexSdkRoot });
    client = new TestProtocolClient(server.port);
    await client.connect();
  });
  teardown(async function() {
    this.timeout(18e4);
    const cleanupFailures = [];
    for (const session of createdSessions) {
      try {
        await cancelActiveTurnIfNeeded(session);
      } catch (error) {
        cleanupFailures.push(`failed to cancel active turn for ${session}: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        await client.call("disposeSession", { channel: session }, 3e4);
      } catch (error) {
        cleanupFailures.push(`failed to dispose ${session}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    createdSessions.length = 0;
    try {
      client.close();
    } catch (error) {
      cleanupFailures.push(`failed to close client: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await stopServer(server);
    } catch (error) {
      cleanupFailures.push(`failed to stop server: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        cleanupFailures.push(`failed to remove ${dir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    tempDirs.length = 0;
    if (cleanupFailures.length > 0) {
      if (this.currentTest?.state === "failed") {
        process.stdout.write(`[agent-host-e2e] Codex live cleanup reported secondary errors:
${cleanupFailures.map((failure) => `[agent-host-e2e] # ${failure}`).join("\n")}
`);
        return;
      }
      throw new Error(`Codex live test cleanup failed:
${cleanupFailures.join("\n")}`);
    }
  });
  test("mid-turn steering clears pending state without getting stuck", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-steer-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "steer-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Count slowly from 1 to 40. Put each number on its own line and think briefly between each.", 1);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/responsePart") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
    const steerText = "IMPORTANT: also include the exact word PINEAPPLE in your reply.";
    client.dispatch({
      channel: chat,
      clientSeq: 2,
      action: {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-1",
        message: { text: steerText, origin: { kind: MessageKind.User } }
      }
    });
    await client.waitForNotification((n) => {
      if (isActionNotification(n, "chat/turnStarted")) {
        if (getActionEnvelope(n).channel !== chat) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        if (action.message?.text === steerText) {
          return true;
        }
        return false;
      }
      return isActionNotification(n, "chat/pendingMessageRemoved") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.id === "steer-1" && getActionEnvelope(n).action.kind === PendingMessageKind.Steering;
    }, 12e4);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
      12e4
    );
    const snapshot = await chatState(chat);
    assert.strictEqual(snapshot.steeringMessage, void 0);
  });
  test("client tool is registered and invoked end-to-end", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-tool-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "tool-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "tool-client",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Call the get_magic_word tool and then tell me the exact magic word it returned.", 2);
    const seen = /* @__PURE__ */ new Set();
    let toolCallId;
    let sawToolCall = false;
    let completed = false;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallReady") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolName === "get_magic_word") {
          toolCallId = a.toolCallId;
          sawToolCall = true;
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallReady")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolCallId === toolCallId && !completed) {
          completed = true;
          client.dispatch({
            channel: chat,
            clientSeq: nextSeq++,
            action: {
              type: ActionType.ChatToolCallComplete,
              turnId,
              toolCallId: a.toolCallId,
              result: { success: true, pastTenseMessage: "Got the magic word", content: [{ type: ToolResultContentType.Text, text: "XYLOPHONE" }] }
            }
          });
        }
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during client-tool test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.deepStrictEqual({
      sawToolCall,
      completed,
      responseIncludesResult: (await markdownResponse(chat, turnId)).includes("XYLOPHONE")
    }, {
      sawToolCall: true,
      completed: true,
      responseIncludesResult: true
    });
  });
  test("client tool registered after session creation is still invoked", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-tool2-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "tool-client-2", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "tool-client-2",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Call the get_magic_word tool and then tell me the exact magic word it returned.", 2);
    const seen = /* @__PURE__ */ new Set();
    let toolCallId;
    let completed = false;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallReady") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolName === "get_magic_word") {
          toolCallId = a.toolCallId;
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallReady")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolCallId === toolCallId && !completed) {
          completed = true;
          client.dispatch({
            channel: chat,
            clientSeq: nextSeq++,
            action: {
              type: ActionType.ChatToolCallComplete,
              turnId,
              toolCallId: a.toolCallId,
              result: { success: true, pastTenseMessage: "Got the magic word", content: [{ type: ToolResultContentType.Text, text: "XYLOPHONE" }] }
            }
          });
        }
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during late client-tool test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.deepStrictEqual({
      completed,
      responseIncludesResult: (await markdownResponse(chat, turnId)).includes("XYLOPHONE")
    }, {
      completed: true,
      responseIncludesResult: true
    });
  });
  test("server tool (listComments) is registered and executed in-process", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-servertool-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "servertool-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Call your listComments tool to list existing comments, then tell me exactly how many comments there are.", 1);
    const seen = /* @__PURE__ */ new Set();
    let sawServerToolCall = false;
    let serverToolHadClientContributor = false;
    let serverToolCallId;
    let sawSuccessfulCompletion = false;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallComplete") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolName === "listComments") {
          sawServerToolCall = true;
          serverToolCallId = a.toolCallId;
          serverToolHadClientContributor = a.contributor?.kind === "client";
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallComplete")) {
        const action = getActionEnvelope(n).action;
        if (action.turnId === turnId && action.toolCallId === serverToolCallId) {
          sawSuccessfulCompletion = action.result.success;
        }
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during server-tool test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.deepStrictEqual({
      sawServerToolCall,
      serverToolHadClientContributor,
      sawSuccessfulCompletion,
      responseReportsNoComments: /\b0\b|no comments/i.test(await markdownResponse(chat, turnId))
    }, {
      sawServerToolCall: true,
      serverToolHadClientContributor: false,
      sawSuccessfulCompletion: true,
      responseReportsNoComments: true
    });
  });
  test("file-change approval is surfaced and can be approved", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-fileapprove-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "fileapprove-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: { type: ActionType.SessionConfigChanged, config: { "codex.sandboxMode": "read-only", "codex.approvalPolicy": "on-request" } }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "session/configChanged") && getActionEnvelope(n).channel === session,
      3e4
    );
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, 'Create a new file named hello.txt containing exactly the text "hi" by editing the file (use your apply_patch/file-edit capability, not a shell command).', 2);
    const seen = /* @__PURE__ */ new Set();
    let sawPendingConfirmation = false;
    let sawSuccessfulFileEdit = false;
    let fileEditToolCallId;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallReady") || isActionNotification(x, "chat/toolCallComplete") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during file-change approval test");
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const action = getActionEnvelope(n).action;
        if (getActionEnvelope(n).channel === chat && action.turnId === turnId && action.toolName === "file_edit") {
          fileEditToolCallId = action.toolCallId;
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallReady")) {
        const action = getActionEnvelope(n).action;
        if (getActionEnvelope(n).channel !== chat || action.turnId !== turnId || action.toolCallId !== fileEditToolCallId || action.confirmed !== void 0) {
          continue;
        }
        sawPendingConfirmation = true;
        client.dispatch({
          channel: chat,
          clientSeq: nextSeq++,
          action: { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: true, confirmed: ToolCallConfirmationReason.UserAction }
        });
        continue;
      }
      if (isActionNotification(n, "chat/toolCallComplete") || isActionNotification(n, "chat/turnComplete")) {
        const action = getActionEnvelope(n).action;
        if (getActionEnvelope(n).channel !== chat || action.turnId !== turnId) {
          continue;
        }
        if (isActionNotification(n, "chat/toolCallComplete") && action.toolCallId !== fileEditToolCallId) {
          continue;
        }
        if (isActionNotification(n, "chat/toolCallComplete")) {
          sawSuccessfulFileEdit = getActionEnvelope(n).action.result.success;
          continue;
        }
        break;
      }
    }
    assert.deepStrictEqual({
      sawPendingConfirmation,
      sawSuccessfulFileEdit,
      fileContents: readFileSync(join(workingDirectory, "hello.txt"), "utf8")
    }, {
      sawPendingConfirmation: true,
      sawSuccessfulFileEdit: true,
      fileContents: "hi"
    });
  });
  test("Plan mode (Agent Mode control) makes request_user_input reachable end-to-end", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-planmode-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "planmode-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: { type: ActionType.SessionConfigChanged, config: { mode: "plan" } }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "session/configChanged") && getActionEnvelope(n).channel === session,
      3e4
    );
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, 'Use your request_user_input capability to ask me one question: "Which fruit?" with options Apple and Banana. After I answer, reply with the option I chose.', 2);
    const seen = /* @__PURE__ */ new Set();
    let sawInputRequest = false;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/inputRequested") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 15e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/inputRequested")) {
        sawInputRequest = true;
        const action = getActionEnvelope(n).action;
        client.dispatch({
          channel: chat,
          clientSeq: nextSeq++,
          action: {
            type: ActionType.ChatInputCompleted,
            requestId: action.request.id,
            response: ChatInputResponseKind.Accept,
            answers: getAcceptedAnswers(action.request)
          }
        });
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during plan-mode request_user_input test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.ok(sawInputRequest, "switching to Plan mode should make request_user_input surface as chat/inputRequested");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3Byb3ZpZGVycy9jb2RleEFnZW50SG9zdExpdmUuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBMaXZlLCBub24tZGV0ZXJtaW5pc3RpYyBDb2RleCBzY2VuYXJpb3MgdGhhdCBkZXBlbmQgb24gcmVhbC10aW1lIGFwcC1zZXJ2ZXIgYmVoYXZpb3IuXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkdGVtcFN5bmMsIHJlYWRGaWxlU3luYywgcm1TeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFN1YnNjcmliZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIE1lc3NhZ2VLaW5kLCBQZW5kaW5nTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgQ2hhdElucHV0UmVxdWVzdCwgdHlwZSBDaGF0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uLCBkaXNwYXRjaFR1cm4sIGdldEFjY2VwdGVkQW5zd2VycyB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uLCBzdGFydFJlYWxTZXJ2ZXIsIHN0b3BTZXJ2ZXIsIFRlc3RQcm90b2NvbENsaWVudCwgdHlwZSBJU2VydmVySGFuZGxlIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBDT0RFWF9DT05GSUcsIENPREVYX1NES19ST09UIH0gZnJvbSAnLi9jb2RleFRlc3RDb25maWd1cmF0aW9uLmpzJztcblxuY29uc3QgUkVBTF9DT0RFWF9FTkFCTEVEID0gcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVBTF9DT0RFWCddID09PSAnMSc7XG5cbi8vIENvZGV4LXNwZWNpZmljIHN0ZWVyaW5nIGNvdmVyYWdlLiBTdGVlcmluZyBpcyB3aXJlZCB2aWEgYHR1cm4vc3RlZXJgOyB0aGVcbi8vIGFnZW50IGJ1ZmZlcnMgdGhlIG1lc3NhZ2UgYW5kIHByb21vdGVzIHRoZSBjb2RleCBgdXNlck1lc3NhZ2VgIGVjaG8gaW50byBhXG4vLyBmcmVzaCB2aXNpYmxlIHR1cm4gKGNsZWFyaW5nIHRoZSBwZW5kaW5nIGJ1YmJsZSkuIFRoZXNlIGV4ZXJjaXNlIHJlYWwtdGltZSxcbi8vIHN0YXRlZnVsIGFwcC1zZXJ2ZXIgYmVoYXZpb3JzIChtaWQtdHVybiBzdGVlcmluZywgbGF0ZSB0b29sIHJlZ2lzdHJhdGlvbixcbi8vIHRydW5jYXRlKSB0aGF0IGFyZSBub3QgZGV0ZXJtaW5pc3RpY2FsbHkgcmVwcm9kdWNpYmxlLCBzbyB0aGV5IHJ1biBvbmx5XG4vLyBhZ2FpbnN0IHRoZSBsaXZlIGFwcC1zZXJ2ZXIgKGBBR0VOVF9IT1NUX1JFQUxfQ09ERVg9MWApLlxuKFJFQUxfQ09ERVhfRU5BQkxFRCAmJiAhIUNPREVYX1NES19ST09UID8gc3VpdGUgOiBzdWl0ZS5za2lwKSgnQWdlbnQgSG9zdCBFMkUgXHUyMDE0IENvZGV4IC0gc3RlZXJpbmcnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IHNlcnZlcjogSVNlcnZlckhhbmRsZTtcblx0bGV0IGNsaWVudDogVGVzdFByb3RvY29sQ2xpZW50O1xuXHRjb25zdCBjcmVhdGVkU2Vzc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHRlbXBEaXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgY2xlYW51cENsaWVudFNlcSA9IDEwXzAwMDtcblxuXHRhc3luYyBmdW5jdGlvbiBjaGF0U3RhdGUoY2hhdDogc3RyaW5nKTogUHJvbWlzZTxDaGF0U3RhdGU+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXQgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgQ2hhdFN0YXRlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gbWFya2Rvd25SZXNwb25zZShjaGF0OiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCB0dXJuID0gKGF3YWl0IGNoYXRTdGF0ZShjaGF0KSkudHVybnMuZmluZCh0dXJuID0+IHR1cm4uaWQgPT09IHR1cm5JZCk7XG5cdFx0cmV0dXJuIHR1cm4/LnJlc3BvbnNlUGFydHNcblx0XHRcdC5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pXG5cdFx0XHQubWFwKHBhcnQgPT4gcGFydC5jb250ZW50KVxuXHRcdFx0LmpvaW4oJycpID8/ICcnO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY2FuY2VsQWN0aXZlVHVybklmTmVlZGVkKHNlc3Npb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhdFN0YXRlKGNoYXQpO1xuXHRcdGNvbnN0IHR1cm5JZCA9IHN0YXRlLmFjdGl2ZVR1cm4/LmlkO1xuXHRcdGlmICghdHVybklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBjaGF0LFxuXHRcdFx0Y2xpZW50U2VxOiBjbGVhbnVwQ2xpZW50U2VxKyssXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbjogMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZClcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0fVxuXG5cdHNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoNjBfMDAwKTtcblx0XHRzZXJ2ZXIgPSBhd2FpdCBzdGFydFJlYWxTZXJ2ZXIoeyBjb2RleFNka1Jvb3Q6IENPREVYX0NPTkZJRy5jb2RleFNka1Jvb3QgfSk7XG5cdFx0Y2xpZW50ID0gbmV3IFRlc3RQcm90b2NvbENsaWVudChzZXJ2ZXIucG9ydCk7XG5cdFx0YXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCBjbGVhbnVwRmFpbHVyZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNyZWF0ZWRTZXNzaW9ucykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY2FuY2VsQWN0aXZlVHVybklmTmVlZGVkKHNlc3Npb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2xlYW51cEZhaWx1cmVzLnB1c2goYGZhaWxlZCB0byBjYW5jZWwgYWN0aXZlIHR1cm4gZm9yICR7c2Vzc2lvbn06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2Rpc3Bvc2VTZXNzaW9uJywgeyBjaGFubmVsOiBzZXNzaW9uIH0sIDMwXzAwMCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjbGVhbnVwRmFpbHVyZXMucHVzaChgZmFpbGVkIHRvIGRpc3Bvc2UgJHtzZXNzaW9ufTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNyZWF0ZWRTZXNzaW9ucy5sZW5ndGggPSAwO1xuXHRcdHRyeSB7XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y2xlYW51cEZhaWx1cmVzLnB1c2goYGZhaWxlZCB0byBjbG9zZSBjbGllbnQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3RvcFNlcnZlcihzZXJ2ZXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjbGVhbnVwRmFpbHVyZXMucHVzaChgZmFpbGVkIHRvIHN0b3Agc2VydmVyOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBkaXIgb2YgdGVtcERpcnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJtU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSwgbWF4UmV0cmllczogNSwgcmV0cnlEZWxheTogMjAwIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2xlYW51cEZhaWx1cmVzLnB1c2goYGZhaWxlZCB0byByZW1vdmUgJHtkaXJ9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGVtcERpcnMubGVuZ3RoID0gMDtcblx0XHRpZiAoY2xlYW51cEZhaWx1cmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRUZXN0Py5zdGF0ZSA9PT0gJ2ZhaWxlZCcpIHtcblx0XHRcdFx0cHJvY2Vzcy5zdGRvdXQud3JpdGUoYFthZ2VudC1ob3N0LWUyZV0gQ29kZXggbGl2ZSBjbGVhbnVwIHJlcG9ydGVkIHNlY29uZGFyeSBlcnJvcnM6XFxuJHtjbGVhbnVwRmFpbHVyZXMubWFwKGZhaWx1cmUgPT4gYFthZ2VudC1ob3N0LWUyZV0gIyAke2ZhaWx1cmV9YCkuam9pbignXFxuJyl9XFxuYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29kZXggbGl2ZSB0ZXN0IGNsZWFudXAgZmFpbGVkOlxcbiR7Y2xlYW51cEZhaWx1cmVzLmpvaW4oJ1xcbicpfWApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWlkLXR1cm4gc3RlZXJpbmcgY2xlYXJzIHBlbmRpbmcgc3RhdGUgd2l0aG91dCBnZXR0aW5nIHN0dWNrJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXN0ZWVyLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPREVYX0NPTkZJRywgJ3N0ZWVyLWNsaWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXG5cdFx0Ly8gQSBsb25nLCBzbG93IHR1cm4gZ2l2ZXMgdXMgYSB3aW5kb3cgdG8gc3RlZXIgYmVmb3JlIGl0IGNvbXBsZXRlcy5cblx0XHRjb25zdCB0dXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uLCB0dXJuSWQsICdDb3VudCBzbG93bHkgZnJvbSAxIHRvIDQwLiBQdXQgZWFjaCBudW1iZXIgb24gaXRzIG93biBsaW5lIGFuZCB0aGluayBicmllZmx5IGJldHdlZW4gZWFjaC4nLCAxKTtcblxuXHRcdC8vIFdhaXQgdW50aWwgdGhlIHR1cm4gaXMgdmlzaWJseSBpbiBwcm9ncmVzcy5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9yZXNwb25zZVBhcnQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdDkwXzAwMCxcblx0XHQpO1xuXG5cdFx0Ly8gSW5qZWN0IGEgc3RlZXJpbmcgbWVzc2FnZSB3aXRoIGEgZGlzdGluY3RpdmUgbWFya2VyLlxuXHRcdGNvbnN0IHN0ZWVyVGV4dCA9ICdJTVBPUlRBTlQ6IGFsc28gaW5jbHVkZSB0aGUgZXhhY3Qgd29yZCBQSU5FQVBQTEUgaW4geW91ciByZXBseS4nO1xuXHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBjaGF0LFxuXHRcdFx0Y2xpZW50U2VxOiAyLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdGlkOiAnc3RlZXItMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogc3RlZXJUZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gVGhlIGZpeCBwcm9tb3RlcyB0aGUgc3RlZXJpbmcgaW50byBpdHMgb3duIHZpc2libGUgdHVybiAocHJlZmVycmVkKVxuXHRcdC8vIE9SIFx1MjAxNCBpZiBjb2RleCBuZXZlciBlY2hvZXMgdGhlIHVzZXJNZXNzYWdlIFx1MjAxNCBkcmFpbnMgaXQgb24gdHVyblxuXHRcdC8vIGNvbXBsZXRpb24uIEVpdGhlciB3YXkgdGhlIHBlbmRpbmcgYnViYmxlIG11c3QgY2xlYXIuIEFzc2VydCB0aGVcblx0XHQvLyBzdHJvbmdlciBwcm9tb3Rpb24gb3V0Y29tZSwgZmFsbGluZyBiYWNrIHRvIHRoZSByZW1vdmFsIHNpZ25hbC5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuU3RhcnRlZCcpKSB7XG5cdFx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG1lc3NhZ2U/OiB7IHRleHQ/OiBzdHJpbmcgfSB9O1xuXHRcdFx0XHRpZiAoYWN0aW9uLm1lc3NhZ2U/LnRleHQgPT09IHN0ZWVyVGV4dCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9wZW5kaW5nTWVzc2FnZVJlbW92ZWQnKVxuXHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0XG5cdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBpZD86IHN0cmluZzsga2luZD86IFBlbmRpbmdNZXNzYWdlS2luZCB9KS5pZCA9PT0gJ3N0ZWVyLTEnXG5cdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBpZD86IHN0cmluZzsga2luZD86IFBlbmRpbmdNZXNzYWdlS2luZCB9KS5raW5kID09PSBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmc7XG5cdFx0fSwgMTIwXzAwMCk7XG5cblx0XHQvLyBEcml2ZSByZW1haW5pbmcgdHVybnMgdG8gY29tcGxldGlvbiBzbyB0ZWFyZG93biBpcyBjbGVhbi5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdDEyMF8wMDAsXG5cdFx0KTtcblxuXHRcdC8vIFJlZ2FyZGxlc3Mgb2YgcGF0aCwgdGhlIHN0ZWVyaW5nIGJ1YmJsZSBtdXN0IG5vdCBiZSBzdHVjayBpbiBzdGF0ZS5cblx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGNoYXRTdGF0ZShjaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3Quc3RlZXJpbmdNZXNzYWdlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgdG9vbCBpcyByZWdpc3RlcmVkIGFuZCBpbnZva2VkIGVuZC10by1lbmQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnY29kZXgtdG9vbC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT0RFWF9DT05GSUcsICd0b29sLWNsaWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYSBjbGllbnQtcHJvdmlkZWQgdG9vbCBCRUZPUkUgdGhlIGZpcnN0IHR1cm4gc28gaXQgbGFuZHMgaW5cblx0XHQvLyBgdGhyZWFkL3N0YXJ0LmR5bmFtaWNUb29sc2AuXG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb24sXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ3Rvb2wtY2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdnZXRfbWFnaWNfd29yZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JldHVybnMgdGhlIHNlY3JldCBtYWdpYyB3b3JkLiBDYWxsIHRoaXMgd2hlbiBhc2tlZCBmb3IgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSwgcmVxdWlyZWQ6IFtdIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvbiwgdHVybklkLCAnQ2FsbCB0aGUgZ2V0X21hZ2ljX3dvcmQgdG9vbCBhbmQgdGhlbiB0ZWxsIG1lIHRoZSBleGFjdCBtYWdpYyB3b3JkIGl0IHJldHVybmVkLicsIDIpO1xuXG5cdFx0Ly8gU3VyZmFjZSBhbmQgY29tcGxldGUgdGhlIGNsaWVudCB0b29sIGNhbGwsIHRoZW4gd2FpdCBmb3IgdGhlIHR1cm4gdG9cblx0XHQvLyBmaW5pc2guIGBjaGF0L3Rvb2xDYWxsU3RhcnRgIGNhcnJpZXMgdGhlIHRvb2wgbmFtZTsgYGNoYXQvdG9vbENhbGxSZWFkeWBcblx0XHQvLyAoa2V5ZWQgb25seSBieSB0b29sQ2FsbElkKSBpcyB3aGVuIHRoZSBjbGllbnQgbWF5IHJ1biBpdC5cblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IHRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2F3VG9vbENhbGwgPSBmYWxzZTtcblx0XHRsZXQgY29tcGxldGVkID0gZmFsc2U7XG5cdFx0bGV0IG5leHRTZXEgPSAzO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBuID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24oeCA9PiAhc2Vlbi5oYXMoeCBhcyBvYmplY3QpICYmIChcblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdG9vbENhbGxTdGFydCcpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsUmVhZHknKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC9lcnJvcicpKSwgMTIwXzAwMCk7XG5cdFx0XHRzZWVuLmFkZChuIGFzIG9iamVjdCk7XG5cdFx0XHRpZiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpIHtcblx0XHRcdFx0Y29uc3QgYSA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoYS50dXJuSWQgPT09IHR1cm5JZCAmJiBhLnRvb2xOYW1lID09PSAnZ2V0X21hZ2ljX3dvcmQnKSB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZCA9IGEudG9vbENhbGxJZDtcblx0XHRcdFx0XHRzYXdUb29sQ2FsbCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoYS50dXJuSWQgPT09IHR1cm5JZCAmJiBhLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQgJiYgIWNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdGNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRcdGNoYW5uZWw6IGNoYXQsXG5cdFx0XHRcdFx0XHRjbGllbnRTZXE6IG5leHRTZXErKyxcblx0XHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdHb3QgdGhlIG1hZ2ljIHdvcmQnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ1hZTE9QSE9ORScgfV0gfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvZGV4IHJlcG9ydGVkIGEgdHVybiBlcnJvciBkdXJpbmcgY2xpZW50LXRvb2wgdGVzdCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYXdUb29sQ2FsbCxcblx0XHRcdGNvbXBsZXRlZCxcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNSZXN1bHQ6IChhd2FpdCBtYXJrZG93blJlc3BvbnNlKGNoYXQsIHR1cm5JZCkpLmluY2x1ZGVzKCdYWUxPUEhPTkUnKSxcblx0XHR9LCB7XG5cdFx0XHRzYXdUb29sQ2FsbDogdHJ1ZSxcblx0XHRcdGNvbXBsZXRlZDogdHJ1ZSxcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNSZXN1bHQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCB0b29sIHJlZ2lzdGVyZWQgYWZ0ZXIgc2Vzc2lvbiBjcmVhdGlvbiBpcyBzdGlsbCBpbnZva2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXRvb2wyLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPREVYX0NPTkZJRywgJ3Rvb2wtY2xpZW50LTInLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFmdGVyIHRoZSBzZXNzaW9uIGV4aXN0cyBidXQgYmVmb3JlIHRoZSBmaXJzdCB0dXJuLiBUaGVyZSBpc1xuXHRcdC8vIG5vIHB1YmxpYyBBSFAgc2lnbmFsIGZvciBDb2RleCB0aHJlYWQtcHJld2FybSByZWFkaW5lc3MuXG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb24sXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ3Rvb2wtY2xpZW50LTInLFxuXHRcdFx0XHRcdHRvb2xzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ2dldF9tYWdpY193b3JkJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV0dXJucyB0aGUgc2VjcmV0IG1hZ2ljIHdvcmQuIENhbGwgdGhpcyB3aGVuIGFza2VkIGZvciB0aGUgbWFnaWMgd29yZC4nLFxuXHRcdFx0XHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9LCByZXF1aXJlZDogW10gfSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0dXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uLCB0dXJuSWQsICdDYWxsIHRoZSBnZXRfbWFnaWNfd29yZCB0b29sIGFuZCB0aGVuIHRlbGwgbWUgdGhlIGV4YWN0IG1hZ2ljIHdvcmQgaXQgcmV0dXJuZWQuJywgMik7XG5cblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IHRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY29tcGxldGVkID0gZmFsc2U7XG5cdFx0bGV0IG5leHRTZXEgPSAzO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBuID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24oeCA9PiAhc2Vlbi5oYXMoeCBhcyBvYmplY3QpICYmIChcblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdG9vbENhbGxTdGFydCcpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsUmVhZHknKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC9lcnJvcicpKSwgMTIwXzAwMCk7XG5cdFx0XHRzZWVuLmFkZChuIGFzIG9iamVjdCk7XG5cdFx0XHRpZiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpIHtcblx0XHRcdFx0Y29uc3QgYSA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoYS50dXJuSWQgPT09IHR1cm5JZCAmJiBhLnRvb2xOYW1lID09PSAnZ2V0X21hZ2ljX3dvcmQnKSB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZCA9IGEudG9vbENhbGxJZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdFx0Y29uc3QgYSA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nIH07XG5cdFx0XHRcdGlmIChhLnR1cm5JZCA9PT0gdHVybklkICYmIGEudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCAmJiAhY29tcGxldGVkKSB7XG5cdFx0XHRcdFx0Y29tcGxldGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdFx0Y2hhbm5lbDogY2hhdCxcblx0XHRcdFx0XHRcdGNsaWVudFNlcTogbmV4dFNlcSsrLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogYS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ0dvdCB0aGUgbWFnaWMgd29yZCcsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnWFlMT1BIT05FJyB9XSB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9lcnJvcicpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignY29kZXggcmVwb3J0ZWQgYSB0dXJuIGVycm9yIGR1cmluZyBsYXRlIGNsaWVudC10b29sIHRlc3QnKTtcblx0XHRcdH1cblx0XHRcdGlmICgoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nIH0pLnR1cm5JZCAhPT0gdHVybklkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tcGxldGVkLFxuXHRcdFx0cmVzcG9uc2VJbmNsdWRlc1Jlc3VsdDogKGF3YWl0IG1hcmtkb3duUmVzcG9uc2UoY2hhdCwgdHVybklkKSkuaW5jbHVkZXMoJ1hZTE9QSE9ORScpLFxuXHRcdH0sIHtcblx0XHRcdGNvbXBsZXRlZDogdHJ1ZSxcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNSZXN1bHQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZlciB0b29sIChsaXN0Q29tbWVudHMpIGlzIHJlZ2lzdGVyZWQgYW5kIGV4ZWN1dGVkIGluLXByb2Nlc3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnY29kZXgtc2VydmVydG9vbC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT0RFWF9DT05GSUcsICdzZXJ2ZXJ0b29sLWNsaWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXG5cdFx0Ly8gTm8gY2xpZW50IHRvb2xzIGFyZSByZWdpc3RlcmVkLiBUaGUgYWdlbnQgaG9zdCdzIHNlcnZlciB0b29sc1xuXHRcdC8vIChmZWVkYmFjayBcImNvbW1lbnRzXCIpIGFyZSB3aXJlZCBhdXRvbWF0aWNhbGx5IGJ5IHRoZSBzZXJ2ZXIgYW5kIG11c3Rcblx0XHQvLyBiZSByZWdpc3RlcmVkIHdpdGggY29kZXggYXQgYHRocmVhZC9zdGFydGAgd2l0aG91dCBhbnkgY2xpZW50LlxuXHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb24sIHR1cm5JZCwgJ0NhbGwgeW91ciBsaXN0Q29tbWVudHMgdG9vbCB0byBsaXN0IGV4aXN0aW5nIGNvbW1lbnRzLCB0aGVuIHRlbGwgbWUgZXhhY3RseSBob3cgbWFueSBjb21tZW50cyB0aGVyZSBhcmUuJywgMSk7XG5cblx0XHQvLyBEcml2ZSB0aGUgdHVybiB0byBjb21wbGV0aW9uIFdJVEhPVVQgZXZlciBkaXNwYXRjaGluZyBhXG5cdFx0Ly8gYGNoYXQvdG9vbENhbGxDb21wbGV0ZWA6IGEgc2VydmVyIHRvb2wgZXhlY3V0ZXMgaW4tcHJvY2Vzcywgc28gdGhlXG5cdFx0Ly8gYWdlbnQgaG9zdCBhbnN3ZXJzIGNvZGV4J3MgYGl0ZW0vdG9vbC9jYWxsYCBpdHNlbGYuIElmIHRoZSBoYXJuZXNzIGhhZFxuXHRcdC8vIHRvIHJvdW5kLXRyaXAgdG8gYSBjbGllbnQsIHRoZSB0dXJuIHdvdWxkIGhhbmcgYW5kIHRpbWUgb3V0LlxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PG9iamVjdD4oKTtcblx0XHRsZXQgc2F3U2VydmVyVG9vbENhbGwgPSBmYWxzZTtcblx0XHRsZXQgc2VydmVyVG9vbEhhZENsaWVudENvbnRyaWJ1dG9yID0gZmFsc2U7XG5cdFx0bGV0IHNlcnZlclRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2F3U3VjY2Vzc2Z1bENvbXBsZXRpb24gPSBmYWxzZTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKHggPT4gIXNlZW4uaGFzKHggYXMgb2JqZWN0KSAmJiAoXG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsU3RhcnQnKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvZXJyb3InKSksIDEyMF8wMDApO1xuXHRcdFx0c2Vlbi5hZGQobiBhcyBvYmplY3QpO1xuXHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ/OiBzdHJpbmc7IHRvb2xOYW1lPzogc3RyaW5nOyBjb250cmlidXRvcj86IHsga2luZDogc3RyaW5nIH0gfTtcblx0XHRcdFx0aWYgKGEudHVybklkID09PSB0dXJuSWQgJiYgYS50b29sTmFtZSA9PT0gJ2xpc3RDb21tZW50cycpIHtcblx0XHRcdFx0XHRzYXdTZXJ2ZXJUb29sQ2FsbCA9IHRydWU7XG5cdFx0XHRcdFx0c2VydmVyVG9vbENhbGxJZCA9IGEudG9vbENhbGxJZDtcblx0XHRcdFx0XHQvLyBBIHNlcnZlciB0b29sIGV4ZWN1dGVzIGluLXByb2Nlc3MsIHNvIGl0IG11c3QgTk9UIGFkdmVydGlzZVxuXHRcdFx0XHRcdC8vIGEgY2xpZW50IGNvbnRyaWJ1dG9yICh3aGljaCB3b3VsZCByb3V0ZSBleGVjdXRpb24gYXdheSkuXG5cdFx0XHRcdFx0c2VydmVyVG9vbEhhZENsaWVudENvbnRyaWJ1dG9yID0gYS5jb250cmlidXRvcj8ua2luZCA9PT0gJ2NsaWVudCc7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyByZXN1bHQ6IHsgc3VjY2VzczogYm9vbGVhbiB9IH07XG5cdFx0XHRcdGlmIChhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHNlcnZlclRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHRzYXdTdWNjZXNzZnVsQ29tcGxldGlvbiA9IGFjdGlvbi5yZXN1bHQuc3VjY2Vzcztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9lcnJvcicpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignY29kZXggcmVwb3J0ZWQgYSB0dXJuIGVycm9yIGR1cmluZyBzZXJ2ZXItdG9vbCB0ZXN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgIT09IHR1cm5JZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhd1NlcnZlclRvb2xDYWxsLFxuXHRcdFx0c2VydmVyVG9vbEhhZENsaWVudENvbnRyaWJ1dG9yLFxuXHRcdFx0c2F3U3VjY2Vzc2Z1bENvbXBsZXRpb24sXG5cdFx0XHRyZXNwb25zZVJlcG9ydHNOb0NvbW1lbnRzOiAvXFxiMFxcYnxubyBjb21tZW50cy9pLnRlc3QoYXdhaXQgbWFya2Rvd25SZXNwb25zZShjaGF0LCB0dXJuSWQpKSxcblx0XHR9LCB7XG5cdFx0XHRzYXdTZXJ2ZXJUb29sQ2FsbDogdHJ1ZSxcblx0XHRcdHNlcnZlclRvb2xIYWRDbGllbnRDb250cmlidXRvcjogZmFsc2UsXG5cdFx0XHRzYXdTdWNjZXNzZnVsQ29tcGxldGlvbjogdHJ1ZSxcblx0XHRcdHJlc3BvbnNlUmVwb3J0c05vQ29tbWVudHM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUtY2hhbmdlIGFwcHJvdmFsIGlzIHN1cmZhY2VkIGFuZCBjYW4gYmUgYXBwcm92ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnY29kZXgtZmlsZWFwcHJvdmUtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09ERVhfQ09ORklHLCAnZmlsZWFwcHJvdmUtY2xpZW50JywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgY2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbik7XG5cblx0XHQvLyBSZWFkLW9ubHkgc2FuZGJveCArIG9uLXJlcXVlc3QgYXBwcm92YWwgZm9yY2VzIGNvZGV4IHRvIGFzayBiZWZvcmVcblx0XHQvLyBhcHBseWluZyBhbnkgZmlsZSBlZGl0IChhbiBgaXRlbS9maWxlQ2hhbmdlL3JlcXVlc3RBcHByb3ZhbGApLlxuXHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyAnY29kZXguc2FuZGJveE1vZGUnOiAncmVhZC1vbmx5JywgJ2NvZGV4LmFwcHJvdmFsUG9saWN5JzogJ29uLXJlcXVlc3QnIH0gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9jb25maWdDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb24sXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb24sIHR1cm5JZCwgJ0NyZWF0ZSBhIG5ldyBmaWxlIG5hbWVkIGhlbGxvLnR4dCBjb250YWluaW5nIGV4YWN0bHkgdGhlIHRleHQgXCJoaVwiIGJ5IGVkaXRpbmcgdGhlIGZpbGUgKHVzZSB5b3VyIGFwcGx5X3BhdGNoL2ZpbGUtZWRpdCBjYXBhYmlsaXR5LCBub3QgYSBzaGVsbCBjb21tYW5kKS4nLCAyKTtcblxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PG9iamVjdD4oKTtcblx0XHRsZXQgc2F3UGVuZGluZ0NvbmZpcm1hdGlvbiA9IGZhbHNlO1xuXHRcdGxldCBzYXdTdWNjZXNzZnVsRmlsZUVkaXQgPSBmYWxzZTtcblx0XHRsZXQgZmlsZUVkaXRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG5leHRTZXEgPSAzO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBuID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24oeCA9PiAhc2Vlbi5oYXMoeCBhcyBvYmplY3QpICYmIChcblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdG9vbENhbGxTdGFydCcpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsUmVhZHknKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvZXJyb3InKSksIDEyMF8wMDApO1xuXHRcdFx0c2Vlbi5hZGQobiBhcyBvYmplY3QpO1xuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjb2RleCByZXBvcnRlZCBhIHR1cm4gZXJyb3IgZHVyaW5nIGZpbGUtY2hhbmdlIGFwcHJvdmFsIHRlc3QnKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nOyB0b29sQ2FsbElkOiBzdHJpbmc7IHRvb2xOYW1lPzogc3RyaW5nIH07XG5cdFx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0ICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiBhY3Rpb24udG9vbE5hbWUgPT09ICdmaWxlX2VkaXQnKSB7XG5cdFx0XHRcdFx0ZmlsZUVkaXRUb29sQ2FsbElkID0gYWN0aW9uLnRvb2xDYWxsSWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyBjb25maXJtZWQ/OiBzdHJpbmcgfTtcblx0XHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXQgfHwgYWN0aW9uLnR1cm5JZCAhPT0gdHVybklkIHx8IGFjdGlvbi50b29sQ2FsbElkICE9PSBmaWxlRWRpdFRvb2xDYWxsSWQgfHwgYWN0aW9uLmNvbmZpcm1lZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2F3UGVuZGluZ0NvbmZpcm1hdGlvbiA9IHRydWU7XG5cdFx0XHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogY2hhdCxcblx0XHRcdFx0XHRjbGllbnRTZXE6IG5leHRTZXErKyxcblx0XHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsIHR1cm5JZCwgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIGFwcHJvdmVkOiB0cnVlLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKSB8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ/OiBzdHJpbmcgfTtcblx0XHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXQgfHwgYWN0aW9uLnR1cm5JZCAhPT0gdHVybklkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKSAmJiBhY3Rpb24udG9vbENhbGxJZCAhPT0gZmlsZUVkaXRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKSkge1xuXHRcdFx0XHRcdHNhd1N1Y2Nlc3NmdWxGaWxlRWRpdCA9IChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZXN1bHQ6IHsgc3VjY2VzczogYm9vbGVhbiB9IH0pLnJlc3VsdC5zdWNjZXNzO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRzYXdTdWNjZXNzZnVsRmlsZUVkaXQsXG5cdFx0XHRmaWxlQ29udGVudHM6IHJlYWRGaWxlU3luYyhqb2luKHdvcmtpbmdEaXJlY3RvcnksICdoZWxsby50eHQnKSwgJ3V0ZjgnKSxcblx0XHR9LCB7XG5cdFx0XHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0c2F3U3VjY2Vzc2Z1bEZpbGVFZGl0OiB0cnVlLFxuXHRcdFx0ZmlsZUNvbnRlbnRzOiAnaGknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQbGFuIG1vZGUgKEFnZW50IE1vZGUgY29udHJvbCkgbWFrZXMgcmVxdWVzdF91c2VyX2lucHV0IHJlYWNoYWJsZSBlbmQtdG8tZW5kJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXBsYW5tb2RlLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPREVYX0NPTkZJRywgJ3BsYW5tb2RlLWNsaWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXG5cdFx0Ly8gU3dpdGNoIHRoZSBzZXNzaW9uIHRvIFBsYW4gbW9kZSB2aWEgdGhlIHBsYXRmb3JtLWdlbmVyaWMgQWdlbnQgTW9kZVxuXHRcdC8vIGNvbnRyb2wgXHUyMDE0IGNvZGV4IG9ubHkgZXhwb3NlcyBgcmVxdWVzdF91c2VyX2lucHV0YCBpbiBwbGFuIGNvbGxhYm9yYXRpb25cblx0XHQvLyBtb2RlLCBzbyB0aGlzIGlzIHRoZSB1c2VyLWZhY2luZyBzd2l0Y2ggdGhhdCBtYWtlcyBhc2tfdXNlciByZWFjaGFibGUuXG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb24sXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7IG1vZGU6ICdwbGFuJyB9IH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vY29uZmlnQ2hhbmdlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cblx0XHRjb25zdCB0dXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uLCB0dXJuSWQsICdVc2UgeW91ciByZXF1ZXN0X3VzZXJfaW5wdXQgY2FwYWJpbGl0eSB0byBhc2sgbWUgb25lIHF1ZXN0aW9uOiBcIldoaWNoIGZydWl0P1wiIHdpdGggb3B0aW9ucyBBcHBsZSBhbmQgQmFuYW5hLiBBZnRlciBJIGFuc3dlciwgcmVwbHkgd2l0aCB0aGUgb3B0aW9uIEkgY2hvc2UuJywgMik7XG5cblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IHNhd0lucHV0UmVxdWVzdCA9IGZhbHNlO1xuXHRcdGxldCBuZXh0U2VxID0gMztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKHggPT4gIXNlZW4uaGFzKHggYXMgb2JqZWN0KSAmJiAoXG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L2lucHV0UmVxdWVzdGVkJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvZXJyb3InKSksIDE1MF8wMDApO1xuXHRcdFx0c2Vlbi5hZGQobiBhcyBvYmplY3QpO1xuXHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvaW5wdXRSZXF1ZXN0ZWQnKSkge1xuXHRcdFx0XHRzYXdJbnB1dFJlcXVlc3QgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZXF1ZXN0OiBDaGF0SW5wdXRSZXF1ZXN0IH07XG5cdFx0XHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogY2hhdCxcblx0XHRcdFx0XHRjbGllbnRTZXE6IG5leHRTZXErKyxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRcdFx0cmVxdWVzdElkOiBhY3Rpb24ucmVxdWVzdC5pZCxcblx0XHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0XHRcdFx0YW5zd2VyczogZ2V0QWNjZXB0ZWRBbnN3ZXJzKGFjdGlvbi5yZXF1ZXN0KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvZGV4IHJlcG9ydGVkIGEgdHVybiBlcnJvciBkdXJpbmcgcGxhbi1tb2RlIHJlcXVlc3RfdXNlcl9pbnB1dCB0ZXN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgIT09IHR1cm5JZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRhc3NlcnQub2soc2F3SW5wdXRSZXF1ZXN0LCAnc3dpdGNoaW5nIHRvIFBsYW4gbW9kZSBzaG91bGQgbWFrZSByZXF1ZXN0X3VzZXJfaW5wdXQgc3VyZmFjZSBhcyBjaGF0L2lucHV0UmVxdWVzdGVkJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFTQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhLGNBQWMsY0FBYztBQUNsRCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFv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
