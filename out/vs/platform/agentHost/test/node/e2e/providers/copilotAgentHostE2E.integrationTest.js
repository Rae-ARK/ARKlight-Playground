import assert from "assert";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { MessageAttachmentKind, MessageKind, PendingMessageKind, ToolCallConfirmationReason, ToolCallContributorKind, buildDefaultChatUri } from "../../../../common/state/sessionState.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import {
  AgentHostE2EServerLease,
  assertToolCallCompleteText,
  createRealSession,
  dispatchTurn,
  driveTurnWithAttachmentsToCompletion,
  removeTempDirs,
  runAhpSnapshotTest
} from "../harness/agentHostE2ETestHarness.js";
import { defineAgentHostE2ETests } from "../suites/agentHostE2ESuites.js";
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
const COPILOT_CONFIG = {
  suiteTitle: "Agent Host E2E \u2014 Copilot",
  provider: "copilotcli",
  scheme: "copilotcli",
  shellToolName: "bash",
  subagentToolNames: ["task"],
  exitPlanModeToolName: "exit_plan_mode",
  streamingFileCreateToolName: "create",
  // The shared suite runs by default in deterministic replay mode (tokenless,
  // against committed fixtures). Recording new fixtures is opt-in via
  // `AGENT_HOST_REPLAY_RECORD=1`. The Copilot CLI is always present (dev dep).
  enabled: true,
  supportsWorktreeIsolation: true,
  supportsHostTerminalTool: true,
  supportsSubagents: true,
  supportsSideChats: true,
  supportsPlanMode: true,
  supportsMultipleChats: true,
  supportsChatFork: true,
  supportsChatForkE2E: true,
  supportsFileTools: true
};
const RECORD_ONLY = process.env["AGENT_HOST_REPLAY_RECORD"] === "1";
const isWindows = process.platform === "win32";
defineAgentHostE2ETests(COPILOT_CONFIG);
suite("Agent Host E2E \u2014 Copilot (Copilot-specific)", function() {
  let client;
  let lease;
  const createdSessions = [];
  const tempDirs = [];
  suiteSetup(function() {
    lease = new AgentHostE2EServerLease(COPILOT_CONFIG);
  });
  setup(async function() {
    this.timeout(6e4);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    ({ client } = await lease.acquire(this.currentTest?.title ?? "unknown"));
  });
  teardown(async function() {
    this.timeout(12e4);
    if (!lease) {
      throw new Error("Agent Host E2E server lease was not initialized.");
    }
    const failed = this.currentTest?.state === "failed";
    if (failed) {
      lease.dumpRuntimeLogsOnFailure(this.currentTest?.title ?? "unknown");
    }
    const errors = [];
    try {
      await lease.release(createdSessions, failed);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    try {
      await removeTempDirs(tempDirs);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to dispose Copilot-specific E2E test resources");
    }
  });
  test("client tool reaches ready after start and completes", async function() {
    this.timeout(18e4);
    await runAhpSnapshotTest(client, COPILOT_CONFIG, this.test, createdSessions, tempDirs, {
      ignoredActionTypes: [ActionType.ChatUsage]
    });
    const start = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((action) => action.toolName === "get_magic_word");
    const ready = start && client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallReady")).map((n) => getActionEnvelope(n).action).find((action) => action.toolCallId === start.toolCallId);
    const deltas = start && client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallDelta")).map((n) => getActionEnvelope(n).action).filter((action) => action.toolCallId === start.toolCallId);
    assert.deepStrictEqual({
      startContributor: start?.contributor,
      readyContributor: ready?.contributor,
      deltaCount: deltas?.length
    }, {
      startContributor: { kind: ToolCallContributorKind.Client, clientId: "copilot-client-tool" },
      readyContributor: { kind: ToolCallContributorKind.Client, clientId: "copilot-client-tool" },
      deltaCount: 0
    });
  });
  test("client tool disconnect before permission still completes the turn", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-client-tool-disconnect-"));
    tempDirs.push(workingDirectory);
    const clientId = "copilot-client-tool-disconnect";
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
    client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId,
          displayName: "Test Client",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const turnId = "turn-client-tool-disconnect";
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(client, sessionUri, turnId, "Call the get_magic_word tool and then report whether it succeeded.", 2);
    const toolStart = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallStart")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolName === "get_magic_word";
    }, 9e4);
    const toolCallId = getActionEnvelope(toolStart).action.toolCallId;
    client.notify("unsubscribe", { channel: sessionUri });
    const failedCompletion = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallComplete")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === toolCallId && !action.result.success;
    }, 3e4);
    const failedCompletionSeq = getActionEnvelope(failedCompletion).serverSeq;
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
    const staleReady = client.receivedNotifications((n) => {
      if (!isActionNotification(n, "chat/toolCallReady")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && envelope.serverSeq > failedCompletionSeq && action.turnId === turnId && action.toolCallId === toolCallId;
    });
    assert.deepStrictEqual(staleReady, []);
  });
  (RECORD_ONLY ? test : test.skip)("accepted steering followed by abort does not block the replacement turn", async function() {
    this.timeout(18e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-steering-abort-"));
    tempDirs.push(workingDirectory);
    const clientId = "copilot-steering-abort";
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, clientId, createdSessions, URI.file(workingDirectory));
    const chatUri = buildDefaultChatUri(sessionUri);
    client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId,
          displayName: "Test Client",
          tools: [{
            name: "get_magic_word",
            description: "Returns a magic word. Call this tool when explicitly asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const initialTurnId = "turn-steering-abort-initial";
    dispatchTurn(client, sessionUri, initialTurnId, "Explain the history of source control in detail.", 2);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/responsePart") || isActionNotification(n, "chat/toolCallStart"),
      9e4
    );
    const steeringId = "steering-before-abort";
    client.dispatch({
      channel: chatUri,
      clientSeq: 3,
      action: {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: steeringId,
        message: {
          text: "Call get_magic_word exactly once, then report its result.",
          origin: { kind: MessageKind.User }
        }
      }
    });
    await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/pendingMessageRemoved")) {
        return false;
      }
      return getActionEnvelope(n).action.id === steeringId;
    }, 6e4);
    client.dispatch({
      channel: chatUri,
      clientSeq: 4,
      action: {
        type: ActionType.ChatTurnCancelled,
        turnId: initialTurnId,
        duration: 0
      }
    });
    const replacementTurnId = "turn-steering-abort-replacement";
    dispatchTurn(client, sessionUri, replacementTurnId, 'Reply with exactly "replacement-ok". Do not use tools.', 5);
    await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/turnComplete")) {
        return false;
      }
      return getActionEnvelope(n).action.turnId === replacementTurnId;
    }, 9e4);
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.deepStrictEqual({
      activeTurn: state.activeTurn,
      inputNeeded: state.inputNeeded,
      replacementState: state.turns.find((turn) => turn.id === replacementTurnId)?.state
    }, {
      activeTurn: void 0,
      inputNeeded: void 0,
      replacementState: "complete"
    });
  });
  suiteTeardown(async function() {
    this.timeout(12e4);
    await lease?.dispose();
  });
  test("usage reports include Copilot cost metadata", async function() {
    this.timeout(12e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-cost-report-"));
    tempDirs.push(workingDirectory);
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-usage", createdSessions, URI.file(workingDirectory));
    dispatchTurn(client, sessionUri, "turn-usage", 'Reply with exactly "usage-ok" and do not use tools.', 1);
    const usageNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/usage")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === "turn-usage";
    }, 9e4);
    const usageEnvelope = getActionEnvelope(usageNotif);
    const usageAction = usageEnvelope.action;
    assert.strictEqual(usageEnvelope.channel, buildDefaultChatUri(sessionUri));
    assert.strictEqual(usageAction.turnId, "turn-usage");
    assert.strictEqual(typeof usageAction.usage.model, "string");
    assert.ok(usageAction.usage.model);
    assert.ok(usageAction.usage.inputTokens === void 0 || usageAction.usage.inputTokens > 0);
    assert.ok(usageAction.usage.outputTokens === void 0 || usageAction.usage.outputTokens > 0);
    const cost = usageAction.usage._meta?.cost;
    if (typeof cost !== "number") {
      assert.fail(`expected usage._meta.cost to be numeric: ${JSON.stringify(usageAction.usage)}`);
    }
    assert.ok(cost > 0, `expected usage._meta.cost to be positive: ${JSON.stringify(usageAction.usage)}`);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === buildDefaultChatUri(sessionUri) && getActionEnvelope(n).action.turnId === "turn-usage",
      9e4
    );
    const state = await fetchSessionWithChat(client, sessionUri);
    const turn = state.turns.find((t) => t.id === "turn-usage");
    assert.strictEqual(turn?.usage?._meta?.cost, cost);
  });
  test("attaches a Python file and reads its function names", async function() {
    this.timeout(12e4);
    const workingDirectory = await mkdtemp(`${tmpdir()}/ahp-attachment-test-`);
    tempDirs.push(workingDirectory);
    const filePath = join(workingDirectory, "calculator.py");
    await writeFile(filePath, [
      "def add(a, b):",
      "	return a + b"
    ].join("\n"));
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-attachment", createdSessions, URI.file(workingDirectory));
    const prompt = "Read the attached Python file. What function names are defined in it? Reply with only the function names.";
    const attachments = [{
      type: MessageAttachmentKind.Resource,
      uri: URI.file(filePath).toString(),
      label: "calculator.py",
      displayKind: "document"
    }];
    const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, "turn-attachment", prompt, attachments, 1);
    assert.match(result.responseText, /\badd\b/i, `expected the model to identify the attached file function; got: ${JSON.stringify(result.responseText)}`);
    assertToolCallCompleteText(client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId: "turn-attachment",
      toolNames: ["view"],
      workspace: workingDirectory,
      expected: [/def add\(a, b\):/, /return a \+ b/],
      success: true
    });
  });
  test("attaches a text blob and reads its function names", async function() {
    this.timeout(12e4);
    const workingDirectory = await mkdtemp(join(tmpdir(), "copilot-text-blob-"));
    tempDirs.push(workingDirectory);
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-blob-attachment", createdSessions, URI.file(workingDirectory));
    const prompt = "Read the attached Python text blob. What function names are defined in it? Reply with only the function names.";
    const attachments = [{
      type: MessageAttachmentKind.Simple,
      label: "calculator.py",
      displayKind: "document",
      modelRepresentation: [
        "def subtract(a, b):",
        "	return a - b"
      ].join("\n")
    }];
    const result = await driveTurnWithAttachmentsToCompletion(client, sessionUri, "turn-blob-attachment", prompt, attachments, 1);
    assert.match(result.responseText, /\bsubtract\b/i, `expected the model to identify the attached blob function; got: ${JSON.stringify(result.responseText)}`);
  });
  (isWindows ? test.skip : test)("strips redundant `cd <workingDirectory> &&` prefix from shell tool calls", async function() {
    this.timeout(18e4);
    const workspaceDir = await mkdtemp(`${tmpdir()}/ahp-cd-strip-test-`);
    tempDirs.push(workspaceDir);
    const expectedWorkingDirPath = workspaceDir;
    const sessionUri = await createRealSession(client, COPILOT_CONFIG, "real-sdk-cd-strip", createdSessions, URI.file(workspaceDir));
    client.clearReceived();
    const turnId = "turn-cd-strip";
    const chatUri = buildDefaultChatUri(sessionUri);
    dispatchTurn(
      client,
      sessionUri,
      turnId,
      `Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
      1
    );
    const toolStartNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallStart")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolName === COPILOT_CONFIG.shellToolName;
    }, 9e4);
    const toolStartAction = getActionEnvelope(toolStartNotif).action;
    const toolReadyNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/toolCallReady")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      const action = envelope.action;
      return envelope.channel === chatUri && action.turnId === turnId && action.toolCallId === toolStartAction.toolCallId && typeof action.toolInput === "string";
    }, 9e4);
    const toolReadyEnvelope = getActionEnvelope(toolReadyNotif);
    const toolReadyAction = toolReadyEnvelope.action;
    const toolInput = toolReadyAction.toolInput;
    const escapedWorkingDirPath = expectedWorkingDirPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const redundantWorkingDirCdPrefix = new RegExp(
      `^\\s*cd\\s+(?:"${escapedWorkingDirPath}"|'${escapedWorkingDirPath}'|${escapedWorkingDirPath})\\s*(?:&&|;)\\s*`
    );
    assert.ok(
      !redundantWorkingDirCdPrefix.test(toolInput),
      `toolInput should not contain a redundant cd-prefix targeting the working directory; got: ${JSON.stringify(toolInput)}`
    );
    assert.ok(
      toolInput.includes("strip-me-please"),
      `toolInput should retain the command marker after rewriting; got: ${JSON.stringify(toolInput)}`
    );
    if (!toolReadyAction.confirmed) {
      client.dispatch({
        channel: toolReadyEnvelope.channel,
        clientSeq: 2,
        action: {
          type: ActionType.ChatToolCallConfirmed,
          turnId,
          toolCallId: toolReadyAction.toolCallId,
          approved: true,
          confirmed: ToolCallConfirmationReason.UserAction
        }
      });
    }
    const seenSeqs = /* @__PURE__ */ new Set();
    seenSeqs.add(toolReadyEnvelope.serverSeq);
    let teardownSeq = 3;
    while (true) {
      const next = await client.waitForNotification(
        (n) => {
          if (isActionNotification(n, "chat/turnComplete") || isActionNotification(n, "chat/error")) {
            return true;
          }
          if (!isActionNotification(n, "chat/toolCallReady")) {
            return false;
          }
          const envelope2 = getActionEnvelope(n);
          const action2 = envelope2.action;
          return envelope2.channel === chatUri && action2.turnId === turnId && !seenSeqs.has(envelope2.serverSeq);
        },
        9e4
      );
      if (isActionNotification(next, "chat/error")) {
        const action2 = getActionEnvelope(next).action;
        throw new Error(`cd-strip turn failed: ${JSON.stringify(action2.error)}`);
      }
      if (isActionNotification(next, "chat/turnComplete")) {
        break;
      }
      const envelope = getActionEnvelope(next);
      seenSeqs.add(envelope.serverSeq);
      const action = envelope.action;
      if (!action.confirmed) {
        client.dispatch({
          channel: envelope.channel,
          clientSeq: ++teardownSeq,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: action.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      }
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3Byb3ZpZGVycy9jb3BpbG90QWdlbnRIb3N0RTJFLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogQWdlbnQgaG9zdCBlbmQtdG8tZW5kIHRlc3RzIChDb3BpbG90KS5cbiAqXG4gKiBUaGUgY3Jvc3MtcHJvdmlkZXIgcG9ydGlvbiBsaXZlcyBpbiB7QGxpbmsgZGVmaW5lQWdlbnRIb3N0RTJFVGVzdHN9OyB0aGlzXG4gKiBmaWxlIGxheWVycyBvbiBDb3BpbG90LXNwZWNpZmljIGFzc2VydGlvbnMgKGNvc3QgbWV0YWRhdGEsIGNkLXByZWZpeFxuICogc3RyaXBwaW5nKS5cbiAqXG4gKiBUaGVzZSBydW4gYnkgZGVmYXVsdCBpbiBkZXRlcm1pbmlzdGljIHJlcGxheSBtb2RlIGFnYWluc3QgY29tbWl0dGVkIFlBTUxcbiAqIGZpeHR1cmVzIChubyB0b2tlbiwgbm8gbmV0d29yaykuIFRvIHJlLXJlY29yZCB0aGUgZml4dHVyZXMgYWdhaW5zdCByZWFsIENBUEksXG4gKiBzZXQgYEFHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRD0xYDpcbiAqXG4gKiAgIEFHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRD0xIC4vc2NyaXB0cy90ZXN0LWludGVncmF0aW9uLnNoIC0tcnVuIHNyYy92cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL2UyZS9wcm92aWRlcnMvY29waWxvdEFnZW50SG9zdEUyRS5pbnRlZ3JhdGlvblRlc3QudHNcbiAqXG4gKiBSZWNvcmRpbmcgYXV0aDogdGhlIHRva2VuIGlzIG9idGFpbmVkIGZyb20gYGdoIGF1dGggdG9rZW5gLCBvciBvdmVycmlkZSB3aXRoXG4gKiBgR0lUSFVCX1RPS0VOPWdocF94eHhgLiBSZXBsYXkgbmVlZHMgbm8gY3JlZGVudGlhbC5cbiAqXG4gKiBTQUZFVFk6IFJlY29yZGluZyBjcmVhdGVzIHJlYWwgYWdlbnQgc2Vzc2lvbnMgYmFja2VkIGJ5IHRoZSBDb3BpbG90IFNESy5cbiAqIFByb21wdHMgYXJlIGtlcHQgdG8gcmVhZC1vbmx5IHF1ZXN0aW9ucywgc2FmZSBgZWNob2AgY29tbWFuZHMsIGFuZCBpc29sYXRlZFxuICogdGVtcCBkaXJlY3Rvcmllcy5cbiAqL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBta2R0ZW1wLCB3cml0ZUZpbGUgfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBNZXNzYWdlS2luZCwgUGVuZGluZ01lc3NhZ2VLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIGJ1aWxkRGVmYXVsdENoYXRVcmksIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdEVycm9yQWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbERlbHRhQWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uLCB0eXBlIENoYXRVc2FnZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RFMkVTZXJ2ZXJMZWFzZSwgYXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQsIGNyZWF0ZVJlYWxTZXNzaW9uLCBkaXNwYXRjaFR1cm4sXG5cdGRyaXZlVHVybldpdGhBdHRhY2htZW50c1RvQ29tcGxldGlvbiwgcmVtb3ZlVGVtcERpcnMsIHJ1bkFocFNuYXBzaG90VGVzdCwgdHlwZSBJQWdlbnRIb3N0RTJFUHJvdmlkZXJDb25maWcsXG59IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZGVmaW5lQWdlbnRIb3N0RTJFVGVzdHMgfSBmcm9tICcuLi9zdWl0ZXMvYWdlbnRIb3N0RTJFU3VpdGVzLmpzJztcbmltcG9ydCB7IGZldGNoU2Vzc2lvbldpdGhDaGF0LCBnZXRBY3Rpb25FbnZlbG9wZSwgaXNBY3Rpb25Ob3RpZmljYXRpb24sIFRlc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuXG5jb25zdCBDT1BJTE9UX0NPTkZJRzogSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnID0ge1xuXHRzdWl0ZVRpdGxlOiAnQWdlbnQgSG9zdCBFMkUgXHUyMDE0IENvcGlsb3QnLFxuXHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRzY2hlbWU6ICdjb3BpbG90Y2xpJyxcblx0c2hlbGxUb29sTmFtZTogJ2Jhc2gnLFxuXHRzdWJhZ2VudFRvb2xOYW1lczogWyd0YXNrJ10sXG5cdGV4aXRQbGFuTW9kZVRvb2xOYW1lOiAnZXhpdF9wbGFuX21vZGUnLFxuXHRzdHJlYW1pbmdGaWxlQ3JlYXRlVG9vbE5hbWU6ICdjcmVhdGUnLFxuXHQvLyBUaGUgc2hhcmVkIHN1aXRlIHJ1bnMgYnkgZGVmYXVsdCBpbiBkZXRlcm1pbmlzdGljIHJlcGxheSBtb2RlICh0b2tlbmxlc3MsXG5cdC8vIGFnYWluc3QgY29tbWl0dGVkIGZpeHR1cmVzKS4gUmVjb3JkaW5nIG5ldyBmaXh0dXJlcyBpcyBvcHQtaW4gdmlhXG5cdC8vIGBBR0VOVF9IT1NUX1JFUExBWV9SRUNPUkQ9MWAuIFRoZSBDb3BpbG90IENMSSBpcyBhbHdheXMgcHJlc2VudCAoZGV2IGRlcCkuXG5cdGVuYWJsZWQ6IHRydWUsXG5cdHN1cHBvcnRzV29ya3RyZWVJc29sYXRpb246IHRydWUsXG5cdHN1cHBvcnRzSG9zdFRlcm1pbmFsVG9vbDogdHJ1ZSxcblx0c3VwcG9ydHNTdWJhZ2VudHM6IHRydWUsXG5cdHN1cHBvcnRzU2lkZUNoYXRzOiB0cnVlLFxuXHRzdXBwb3J0c1BsYW5Nb2RlOiB0cnVlLFxuXHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUsXG5cdHN1cHBvcnRzQ2hhdEZvcms6IHRydWUsXG5cdHN1cHBvcnRzQ2hhdEZvcmtFMkU6IHRydWUsXG5cdHN1cHBvcnRzRmlsZVRvb2xzOiB0cnVlLFxufTtcblxuY29uc3QgUkVDT1JEX09OTFkgPSBwcm9jZXNzLmVudlsnQUdFTlRfSE9TVF9SRVBMQVlfUkVDT1JEJ10gPT09ICcxJztcbmNvbnN0IGlzV2luZG93cyA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMic7XG5cbmRlZmluZUFnZW50SG9zdEUyRVRlc3RzKENPUElMT1RfQ09ORklHKTtcblxuc3VpdGUoJ0FnZW50IEhvc3QgRTJFIFx1MjAxNCBDb3BpbG90IChDb3BpbG90LXNwZWNpZmljKScsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgY2xpZW50OiBUZXN0UHJvdG9jb2xDbGllbnQ7XG5cdGxldCBsZWFzZTogQWdlbnRIb3N0RTJFU2VydmVyTGVhc2UgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGNyZWF0ZWRTZXNzaW9uczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgdGVtcERpcnM6IHN0cmluZ1tdID0gW107XG5cblx0Ly8gVGhlIGxlYXNlIGZyb250cyB0aGUgc2VydmVyIHdpdGggdGhlIHJlY29yZC9yZXBsYXkgcHJveHk6IHRoZXNlIHRlc3RzXG5cdC8vIHJlcGxheSBjb21taXR0ZWQgZml4dHVyZXMgYnkgZGVmYXVsdCAodG9rZW5sZXNzKSBhbmQgcmVjb3JkIGFnYWluc3QgcmVhbFxuXHQvLyBDQVBJIHdpdGggYEFHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRD0xYCwgbWlycm9yaW5nIHRoZSBzaGFyZWQgc3VpdGUuIEluXG5cdC8vIHJlcGxheSB0aGUgbGVhc2UgcmV1c2VzIG9uZSBzZXJ2ZXIgYWNyb3NzIHRoZSBzdWl0ZSBhbmQgc3dhcHMgdGhlIGZpeHR1cmVcblx0Ly8gcGVyIHRlc3Q7IHdoaWxlIHJlY29yZGluZyBpdCBzdGFydHMgYSBmcmVzaCBzZXJ2ZXIgcGVyIHRlc3QuXG5cdHN1aXRlU2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGxlYXNlID0gbmV3IEFnZW50SG9zdEUyRVNlcnZlckxlYXNlKENPUElMT1RfQ09ORklHKTtcblx0fSk7XG5cblx0c2V0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCg2MF8wMDApO1xuXHRcdGlmICghbGVhc2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgSG9zdCBFMkUgc2VydmVyIGxlYXNlIHdhcyBub3QgaW5pdGlhbGl6ZWQuJyk7XG5cdFx0fVxuXHRcdCh7IGNsaWVudCB9ID0gYXdhaXQgbGVhc2UuYWNxdWlyZSh0aGlzLmN1cnJlbnRUZXN0Py50aXRsZSA/PyAndW5rbm93bicpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMjBfMDAwKTtcblx0XHRpZiAoIWxlYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FnZW50IEhvc3QgRTJFIHNlcnZlciBsZWFzZSB3YXMgbm90IGluaXRpYWxpemVkLicpO1xuXHRcdH1cblx0XHRjb25zdCBmYWlsZWQgPSB0aGlzLmN1cnJlbnRUZXN0Py5zdGF0ZSA9PT0gJ2ZhaWxlZCc7XG5cdFx0aWYgKGZhaWxlZCkge1xuXHRcdFx0bGVhc2UuZHVtcFJ1bnRpbWVMb2dzT25GYWlsdXJlKHRoaXMuY3VycmVudFRlc3Q/LnRpdGxlID8/ICd1bmtub3duJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBsZWFzZS5yZWxlYXNlKGNyZWF0ZWRTZXNzaW9ucywgZmFpbGVkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlbW92ZVRlbXBEaXJzKHRlbXBEaXJzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZXJyb3JzLnB1c2goZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHR9XG5cdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgQWdncmVnYXRlRXJyb3IoZXJyb3JzLCAnRmFpbGVkIHRvIGRpc3Bvc2UgQ29waWxvdC1zcGVjaWZpYyBFMkUgdGVzdCByZXNvdXJjZXMnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCB0b29sIHJlYWNoZXMgcmVhZHkgYWZ0ZXIgc3RhcnQgYW5kIGNvbXBsZXRlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0YXdhaXQgcnVuQWhwU25hcHNob3RUZXN0KGNsaWVudCwgQ09QSUxPVF9DT05GSUcsIHRoaXMudGVzdCEsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMsIHtcblx0XHRcdGlnbm9yZWRBY3Rpb25UeXBlczogW0FjdGlvblR5cGUuQ2hhdFVzYWdlXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0YXJ0ID0gY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSlcblx0XHRcdC5tYXAobiA9PiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24pXG5cdFx0XHQuZmluZChhY3Rpb24gPT4gYWN0aW9uLnRvb2xOYW1lID09PSAnZ2V0X21hZ2ljX3dvcmQnKTtcblx0XHRjb25zdCByZWFkeSA9IHN0YXJ0ICYmIGNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpXG5cdFx0XHQubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uKVxuXHRcdFx0LmZpbmQoYWN0aW9uID0+IGFjdGlvbi50b29sQ2FsbElkID09PSBzdGFydC50b29sQ2FsbElkKTtcblx0XHRjb25zdCBkZWx0YXMgPSBzdGFydCAmJiBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxEZWx0YScpKVxuXHRcdFx0Lm1hcChuID0+IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxEZWx0YUFjdGlvbilcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi50b29sQ2FsbElkID09PSBzdGFydC50b29sQ2FsbElkKTtcblxuXHRcdC8vIFRoZSBBSFAgc25hcHNob3QgcHJvamVjdHMgY29udHJpYnV0b3IgbWV0YWRhdGEgb25seSBvbiBTdGFydCwgc28gUmVhZHkgb3duZXJzaGlwIG5lZWRzIGFuIGV4cGxpY2l0IGFzc2VydGlvbi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q29udHJpYnV0b3I6IHN0YXJ0Py5jb250cmlidXRvcixcblx0XHRcdHJlYWR5Q29udHJpYnV0b3I6IHJlYWR5Py5jb250cmlidXRvcixcblx0XHRcdGRlbHRhQ291bnQ6IGRlbHRhcz8ubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0Q29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NvcGlsb3QtY2xpZW50LXRvb2wnIH0sXG5cdFx0XHRyZWFkeUNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjb3BpbG90LWNsaWVudC10b29sJyB9LFxuXHRcdFx0ZGVsdGFDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgZGlzY29ubmVjdCBiZWZvcmUgcGVybWlzc2lvbiBzdGlsbCBjb21wbGV0ZXMgdGhlIHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdjb3BpbG90LWNsaWVudC10b29sLWRpc2Nvbm5lY3QtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3QgY2xpZW50SWQgPSAnY29waWxvdC1jbGllbnQtdG9vbC1kaXNjb25uZWN0Jztcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgY2xpZW50SWQsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgQ2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdnZXRfbWFnaWNfd29yZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JldHVybnMgdGhlIHNlY3JldCBtYWdpYyB3b3JkLiBDYWxsIHRoaXMgd2hlbiBhc2tlZCBmb3IgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSwgcmVxdWlyZWQ6IFtdIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWNsaWVudC10b29sLWRpc2Nvbm5lY3QnO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ0NhbGwgdGhlIGdldF9tYWdpY193b3JkIHRvb2wgYW5kIHRoZW4gcmVwb3J0IHdoZXRoZXIgaXQgc3VjY2VlZGVkLicsIDIpO1xuXG5cdFx0Y29uc3QgdG9vbFN0YXJ0ID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG4pO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uO1xuXHRcdFx0cmV0dXJuIGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYXRVcmkgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sTmFtZSA9PT0gJ2dldF9tYWdpY193b3JkJztcblx0XHR9LCA5MF8wMDApO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUodG9vbFN0YXJ0KS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24pLnRvb2xDYWxsSWQ7XG5cblx0XHRjbGllbnQubm90aWZ5KCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblxuXHRcdGNvbnN0IGZhaWxlZENvbXBsZXRpb24gPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb247XG5cdFx0XHRyZXR1cm4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQgJiYgIWFjdGlvbi5yZXN1bHQuc3VjY2Vzcztcblx0XHR9LCAzMF8wMDApO1xuXHRcdGNvbnN0IGZhaWxlZENvbXBsZXRpb25TZXEgPSBnZXRBY3Rpb25FbnZlbG9wZShmYWlsZWRDb21wbGV0aW9uKS5zZXJ2ZXJTZXE7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0OTBfMDAwKTtcblxuXHRcdGNvbnN0IHN0YWxlUmVhZHkgPSBjbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShuKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbjtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGVudmVsb3BlLnNlcnZlclNlcSA+IGZhaWxlZENvbXBsZXRpb25TZXEgJiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sQ2FsbElkID09PSB0b29sQ2FsbElkO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhbGVSZWFkeSwgW10pO1xuXHR9KTtcblxuXHQoUkVDT1JEX09OTFkgPyB0ZXN0IDogdGVzdC5za2lwKSgnYWNjZXB0ZWQgc3RlZXJpbmcgZm9sbG93ZWQgYnkgYWJvcnQgZG9lcyBub3QgYmxvY2sgdGhlIHJlcGxhY2VtZW50IHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdjb3BpbG90LXN0ZWVyaW5nLWFib3J0LScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IGNsaWVudElkID0gJ2NvcGlsb3Qtc3RlZXJpbmctYWJvcnQnO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPUElMT1RfQ09ORklHLCBjbGllbnRJZCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBDbGllbnQnLFxuXHRcdFx0XHRcdHRvb2xzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ2dldF9tYWdpY193b3JkJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV0dXJucyBhIG1hZ2ljIHdvcmQuIENhbGwgdGhpcyB0b29sIHdoZW4gZXhwbGljaXRseSBhc2tlZCBmb3IgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSwgcmVxdWlyZWQ6IFtdIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluaXRpYWxUdXJuSWQgPSAndHVybi1zdGVlcmluZy1hYm9ydC1pbml0aWFsJztcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uVXJpLCBpbml0aWFsVHVybklkLCAnRXhwbGFpbiB0aGUgaGlzdG9yeSBvZiBzb3VyY2UgY29udHJvbCBpbiBkZXRhaWwuJywgMik7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0JykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpLFxuXHRcdFx0OTBfMDAwKTtcblxuXHRcdGNvbnN0IHN0ZWVyaW5nSWQgPSAnc3RlZXJpbmctYmVmb3JlLWFib3J0Jztcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogMyxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogc3RlZXJpbmdJZCxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdDYWxsIGdldF9tYWdpY193b3JkIGV4YWN0bHkgb25jZSwgdGhlbiByZXBvcnQgaXRzIHJlc3VsdC4nLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9wZW5kaW5nTWVzc2FnZVJlbW92ZWQnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IGlkPzogc3RyaW5nIH0pLmlkID09PSBzdGVlcmluZ0lkO1xuXHRcdH0sIDYwXzAwMCk7XG5cblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogNCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHR0dXJuSWQ6IGluaXRpYWxUdXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCByZXBsYWNlbWVudFR1cm5JZCA9ICd0dXJuLXN0ZWVyaW5nLWFib3J0LXJlcGxhY2VtZW50Jztcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uVXJpLCByZXBsYWNlbWVudFR1cm5JZCwgJ1JlcGx5IHdpdGggZXhhY3RseSBcInJlcGxhY2VtZW50LW9rXCIuIERvIG5vdCB1c2UgdG9vbHMuJywgNSk7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSByZXBsYWNlbWVudFR1cm5JZDtcblx0XHR9LCA5MF8wMDApO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjbGllbnQsIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlVHVybjogc3RhdGUuYWN0aXZlVHVybixcblx0XHRcdGlucHV0TmVlZGVkOiBzdGF0ZS5pbnB1dE5lZWRlZCxcblx0XHRcdHJlcGxhY2VtZW50U3RhdGU6IHN0YXRlLnR1cm5zLmZpbmQodHVybiA9PiB0dXJuLmlkID09PSByZXBsYWNlbWVudFR1cm5JZCk/LnN0YXRlLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHRcdGlucHV0TmVlZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRyZXBsYWNlbWVudFN0YXRlOiAnY29tcGxldGUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0YXdhaXQgbGVhc2U/LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXNhZ2UgcmVwb3J0cyBpbmNsdWRlIENvcGlsb3QgY29zdCBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2NvcGlsb3QtY29zdC1yZXBvcnQtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgJ3JlYWwtc2RrLXVzYWdlJywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tdXNhZ2UnLCAnUmVwbHkgd2l0aCBleGFjdGx5IFwidXNhZ2Utb2tcIiBhbmQgZG8gbm90IHVzZSB0b29scy4nLCAxKTtcblxuXHRcdGNvbnN0IHVzYWdlTm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdXNhZ2UnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG4pO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRVc2FnZUFjdGlvbjtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpICYmIGFjdGlvbi50dXJuSWQgPT09ICd0dXJuLXVzYWdlJztcblx0XHR9LCA5MF8wMDApO1xuXHRcdGNvbnN0IHVzYWdlRW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZSh1c2FnZU5vdGlmKTtcblx0XHRjb25zdCB1c2FnZUFjdGlvbiA9IHVzYWdlRW52ZWxvcGUuYWN0aW9uIGFzIENoYXRVc2FnZUFjdGlvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VFbnZlbG9wZS5jaGFubmVsLCBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VBY3Rpb24udHVybklkLCAndHVybi11c2FnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgdXNhZ2VBY3Rpb24udXNhZ2UubW9kZWwsICdzdHJpbmcnKTtcblx0XHRhc3NlcnQub2sodXNhZ2VBY3Rpb24udXNhZ2UubW9kZWwpO1xuXHRcdGFzc2VydC5vayh1c2FnZUFjdGlvbi51c2FnZS5pbnB1dFRva2VucyA9PT0gdW5kZWZpbmVkIHx8IHVzYWdlQWN0aW9uLnVzYWdlLmlucHV0VG9rZW5zID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHVzYWdlQWN0aW9uLnVzYWdlLm91dHB1dFRva2VucyA9PT0gdW5kZWZpbmVkIHx8IHVzYWdlQWN0aW9uLnVzYWdlLm91dHB1dFRva2VucyA+IDApO1xuXG5cdFx0Y29uc3QgY29zdCA9IHVzYWdlQWN0aW9uLnVzYWdlLl9tZXRhPy5jb3N0O1xuXHRcdGlmICh0eXBlb2YgY29zdCAhPT0gJ251bWJlcicpIHtcblx0XHRcdGFzc2VydC5mYWlsKGBleHBlY3RlZCB1c2FnZS5fbWV0YS5jb3N0IHRvIGJlIG51bWVyaWM6ICR7SlNPTi5zdHJpbmdpZnkodXNhZ2VBY3Rpb24udXNhZ2UpfWApO1xuXHRcdH1cblx0XHRhc3NlcnQub2soY29zdCA+IDAsIGBleHBlY3RlZCB1c2FnZS5fbWV0YS5jb3N0IHRvIGJlIHBvc2l0aXZlOiAke0pTT04uc3RyaW5naWZ5KHVzYWdlQWN0aW9uLnVzYWdlKX1gKTtcblxuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi11c2FnZScsXG5cdFx0XHQ5MF8wMDApO1xuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRjb25zdCB0dXJuID0gc3RhdGUudHVybnMuZmluZCh0ID0+IHQuaWQgPT09ICd0dXJuLXVzYWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm4/LnVzYWdlPy5fbWV0YT8uY29zdCwgY29zdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIGEgUHl0aG9uIGZpbGUgYW5kIHJlYWRzIGl0cyBmdW5jdGlvbiBuYW1lcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChgJHt0bXBkaXIoKX0vYWhwLWF0dGFjaG1lbnQtdGVzdC1gKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih3b3JraW5nRGlyZWN0b3J5LCAnY2FsY3VsYXRvci5weScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZShmaWxlUGF0aCwgW1xuXHRcdFx0J2RlZiBhZGQoYSwgYik6Jyxcblx0XHRcdCdcXHRyZXR1cm4gYSArIGInLFxuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09QSUxPVF9DT05GSUcsICdyZWFsLXNkay1hdHRhY2htZW50JywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gJ1JlYWQgdGhlIGF0dGFjaGVkIFB5dGhvbiBmaWxlLiBXaGF0IGZ1bmN0aW9uIG5hbWVzIGFyZSBkZWZpbmVkIGluIGl0PyBSZXBseSB3aXRoIG9ubHkgdGhlIGZ1bmN0aW9uIG5hbWVzLic7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShmaWxlUGF0aCkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiAnY2FsY3VsYXRvci5weScsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHR9XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVybldpdGhBdHRhY2htZW50c1RvQ29tcGxldGlvbihjbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWF0dGFjaG1lbnQnLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvXFxiYWRkXFxiL2ksIGBleHBlY3RlZCB0aGUgbW9kZWwgdG8gaWRlbnRpZnkgdGhlIGF0dGFjaGVkIGZpbGUgZnVuY3Rpb247IGdvdDogJHtKU09OLnN0cmluZ2lmeShyZXN1bHQucmVzcG9uc2VUZXh0KX1gKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWF0dGFjaG1lbnQnLFxuXHRcdFx0dG9vbE5hbWVzOiBbJ3ZpZXcnXSxcblx0XHRcdHdvcmtzcGFjZTogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdGV4cGVjdGVkOiBbL2RlZiBhZGRcXChhLCBiXFwpOi8sIC9yZXR1cm4gYSBcXCsgYi9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXR0YWNoZXMgYSB0ZXh0IGJsb2IgYW5kIHJlYWRzIGl0cyBmdW5jdGlvbiBuYW1lcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29waWxvdC10ZXh0LWJsb2ItJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgJ3JlYWwtc2RrLWJsb2ItYXR0YWNobWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IHByb21wdCA9ICdSZWFkIHRoZSBhdHRhY2hlZCBQeXRob24gdGV4dCBibG9iLiBXaGF0IGZ1bmN0aW9uIG5hbWVzIGFyZSBkZWZpbmVkIGluIGl0PyBSZXBseSB3aXRoIG9ubHkgdGhlIGZ1bmN0aW9uIG5hbWVzLic7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdGxhYmVsOiAnY2FsY3VsYXRvci5weScsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdG1vZGVsUmVwcmVzZW50YXRpb246IFtcblx0XHRcdFx0J2RlZiBzdWJ0cmFjdChhLCBiKTonLFxuXHRcdFx0XHQnXFx0cmV0dXJuIGEgLSBiJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0fV07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5XaXRoQXR0YWNobWVudHNUb0NvbXBsZXRpb24oY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1ibG9iLWF0dGFjaG1lbnQnLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQucmVzcG9uc2VUZXh0LCAvXFxic3VidHJhY3RcXGIvaSwgYGV4cGVjdGVkIHRoZSBtb2RlbCB0byBpZGVudGlmeSB0aGUgYXR0YWNoZWQgYmxvYiBmdW5jdGlvbjsgZ290OiAke0pTT04uc3RyaW5naWZ5KHJlc3VsdC5yZXNwb25zZVRleHQpfWApO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ3N0cmlwcyByZWR1bmRhbnQgYGNkIDx3b3JraW5nRGlyZWN0b3J5PiAmJmAgcHJlZml4IGZyb20gc2hlbGwgdG9vbCBjYWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VEaXIgPSBhd2FpdCBta2R0ZW1wKGAke3RtcGRpcigpfS9haHAtY2Qtc3RyaXAtdGVzdC1gKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZURpcik7XG5cdFx0Y29uc3QgZXhwZWN0ZWRXb3JraW5nRGlyUGF0aCA9IHdvcmtzcGFjZURpcjtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT1BJTE9UX0NPTkZJRywgJ3JlYWwtc2RrLWNkLXN0cmlwJywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2VEaXIpKTtcblxuXHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY2Qtc3RyaXAnO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCxcblx0XHRcdGBSdW4gdGhpcyBleGFjdCBzaGVsbCBjb21tYW5kLCBkbyBub3QgbW9kaWZ5IGl0OiBjZCAke2V4cGVjdGVkV29ya2luZ0RpclBhdGh9ICYmIGVjaG8gc3RyaXAtbWUtcGxlYXNlYCxcblx0XHRcdDEpO1xuXG5cdFx0Y29uc3QgdG9vbFN0YXJ0Tm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb247XG5cdFx0XHRyZXR1cm4gZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhdFVyaSAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xOYW1lID09PSBDT1BJTE9UX0NPTkZJRy5zaGVsbFRvb2xOYW1lO1xuXHRcdH0sIDkwXzAwMCk7XG5cdFx0Y29uc3QgdG9vbFN0YXJ0QWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUodG9vbFN0YXJ0Tm90aWYpLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbjtcblxuXHRcdGNvbnN0IHRvb2xSZWFkeU5vdGlmID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG4pO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uO1xuXHRcdFx0cmV0dXJuIGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdFx0JiYgYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkXG5cdFx0XHRcdCYmIGFjdGlvbi50b29sQ2FsbElkID09PSB0b29sU3RhcnRBY3Rpb24udG9vbENhbGxJZFxuXHRcdFx0XHQmJiB0eXBlb2YgYWN0aW9uLnRvb2xJbnB1dCA9PT0gJ3N0cmluZyc7XG5cdFx0fSwgOTBfMDAwKTtcblxuXHRcdGNvbnN0IHRvb2xSZWFkeUVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUodG9vbFJlYWR5Tm90aWYpO1xuXHRcdGNvbnN0IHRvb2xSZWFkeUFjdGlvbiA9IHRvb2xSZWFkeUVudmVsb3BlLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbjtcblx0XHRjb25zdCB0b29sSW5wdXQgPSB0b29sUmVhZHlBY3Rpb24udG9vbElucHV0ITtcblxuXHRcdGNvbnN0IGVzY2FwZWRXb3JraW5nRGlyUGF0aCA9IGV4cGVjdGVkV29ya2luZ0RpclBhdGgucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcblx0XHRjb25zdCByZWR1bmRhbnRXb3JraW5nRGlyQ2RQcmVmaXggPSBuZXcgUmVnRXhwKFxuXHRcdFx0YF5cXFxccypjZFxcXFxzKyg/OlwiJHtlc2NhcGVkV29ya2luZ0RpclBhdGh9XCJ8JyR7ZXNjYXBlZFdvcmtpbmdEaXJQYXRofSd8JHtlc2NhcGVkV29ya2luZ0RpclBhdGh9KVxcXFxzKig/OiYmfDspXFxcXHMqYCxcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFyZWR1bmRhbnRXb3JraW5nRGlyQ2RQcmVmaXgudGVzdCh0b29sSW5wdXQpLFxuXHRcdFx0YHRvb2xJbnB1dCBzaG91bGQgbm90IGNvbnRhaW4gYSByZWR1bmRhbnQgY2QtcHJlZml4IHRhcmdldGluZyB0aGUgd29ya2luZyBkaXJlY3Rvcnk7IGdvdDogJHtKU09OLnN0cmluZ2lmeSh0b29sSW5wdXQpfWAsXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHR0b29sSW5wdXQuaW5jbHVkZXMoJ3N0cmlwLW1lLXBsZWFzZScpLFxuXHRcdFx0YHRvb2xJbnB1dCBzaG91bGQgcmV0YWluIHRoZSBjb21tYW5kIG1hcmtlciBhZnRlciByZXdyaXRpbmc7IGdvdDogJHtKU09OLnN0cmluZ2lmeSh0b29sSW5wdXQpfWAsXG5cdFx0KTtcblxuXHRcdGlmICghdG9vbFJlYWR5QWN0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogdG9vbFJlYWR5RW52ZWxvcGUuY2hhbm5lbCxcblx0XHRcdFx0Y2xpZW50U2VxOiAyLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogdG9vbFJlYWR5QWN0aW9uLnRvb2xDYWxsSWQsIGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlZW5TZXFzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0c2VlblNlcXMuYWRkKHRvb2xSZWFkeUVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0bGV0IHRlYXJkb3duU2VxID0gMztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKFxuXHRcdFx0XHRuID0+IHtcblx0XHRcdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uO1xuXHRcdFx0XHRcdHJldHVybiBlbnZlbG9wZS5jaGFubmVsID09PSBjaGF0VXJpICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiAhc2VlblNlcXMuaGFzKGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdDkwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obmV4dCwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuZXh0KS5hY3Rpb24gYXMgQ2hhdEVycm9yQWN0aW9uO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGNkLXN0cmlwIHR1cm4gZmFpbGVkOiAke0pTT04uc3RyaW5naWZ5KGFjdGlvbi5lcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obmV4dCwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGdldEFjdGlvbkVudmVsb3BlKG5leHQpO1xuXHRcdFx0c2VlblNlcXMuYWRkKGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRpZiAoIWFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRjaGFubmVsOiBlbnZlbG9wZS5jaGFubmVsLFxuXHRcdFx0XHRcdGNsaWVudFNlcTogKyt0ZWFyZG93blNlcSxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFB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
