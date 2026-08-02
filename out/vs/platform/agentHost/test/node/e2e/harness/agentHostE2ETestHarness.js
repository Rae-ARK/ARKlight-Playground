import assert from "assert";
import { execSync } from "child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "fs";
import { homedir, tmpdir, userInfo } from "os";
import { fileURLToPath } from "url";
import { timeout } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { removeAnsiEscapeCodes } from "../../../../../../base/common/strings.js";
import { URI } from "../../../../../../base/common/uri.js";
import {
  ResponsePartKind,
  ChatInputAnswerState,
  ChatInputAnswerValueKind,
  ChatInputQuestionKind,
  ChatInputResponseKind,
  ToolResultContentType,
  ToolCallConfirmationReason,
  ToolCallCancellationReason,
  buildDefaultChatUri,
  ROOT_STATE_URI
} from "../../../../common/state/sessionState.js";
import { TerminalClaimKind } from "../../../../common/state/protocol/channels-terminal/state.js";
import {
  ActionType
} from "../../../../common/state/sessionActions.js";
import {
  fetchSessionWithChat,
  getActionEnvelope,
  getAgentHostE2ETestTimeout,
  isActionNotification,
  stopServer,
  TestProtocolClient
} from "../../serverIntegrationTestHelpers.js";
import { defaultAgentHostTarget } from "./agentHostTarget.js";
import { createProviderSession, dispatchTurn, dispatchTurnWithAttachments } from "../../providerIntegrationTestHelpers.js";
import { AgentHostUpdateSnapshotsEnvVar, AhpSnapshotScenario } from "./ahpSnapshot.js";
import { normalizeShellToolNameForCapture } from "./shellToolNames.js";
const UPDATE_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === "1";
const RECORD = process.env["AGENT_HOST_REPLAY_RECORD"] === "1" || UPDATE_SNAPSHOTS;
const REPLAY_MODE = RECORD ? "record" : "replay";
const MAX_MODEL_BACKED_TESTS_PER_SHARED_SERVER = 25;
const MAX_TESTS_PER_SHARED_SERVER = 40;
const TEMP_DIR_CLEANUP_TIMEOUT_MS = 3e4;
const REPLAY_PLACEHOLDER_TOKEN = "replay-no-token";
function clearReadOnlyAttributes(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = join(dir, entry);
    try {
      const isDirectory = statSync(entryPath).isDirectory();
      chmodSync(entryPath, isDirectory ? 448 : 384);
      if (isDirectory) {
        clearReadOnlyAttributes(entryPath);
      }
    } catch {
    }
  }
}
function initTestGitRepo(cwd) {
  execSync("git init", { cwd });
  execSync('git config user.name "Agent Host Test"', { cwd });
  execSync('git config user.email "agent-host-test@example.com"', { cwd });
  execSync("git config gc.auto 0", { cwd });
}
async function removeTempDirs(tempDirs) {
  const pendingDirs = tempDirs.splice(0);
  const errors = /* @__PURE__ */ new Map();
  const deadline = Date.now() + TEMP_DIR_CLEANUP_TIMEOUT_MS;
  while (pendingDirs.length > 0) {
    for (let index = pendingDirs.length - 1; index >= 0; index--) {
      const dir = pendingDirs[index];
      try {
        rmSync(dir, { recursive: true, force: true });
        pendingDirs.splice(index, 1);
        errors.delete(dir);
      } catch (error) {
        errors.set(dir, error instanceof Error ? error : new Error(String(error)));
        clearReadOnlyAttributes(dir);
      }
    }
    if (pendingDirs.length === 0) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new AggregateError(
        Array.from(errors.values()),
        `Failed to remove Agent Host E2E temporary directories: ${pendingDirs.join(", ")}`
      );
    }
    await timeout(500);
  }
}
const CAPTURES_DIR = fileURLToPath(new URL("../../../../../../../../src/vs/platform/agentHost/test/node/e2e/captures/", import.meta.url));
const EMPTY_CAPTURE_PATH = join(CAPTURES_DIR, "empty.yaml");
function fixturePathFor(provider, testTitle) {
  const slug = testTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return join(CAPTURES_DIR, `${provider}-${slug}.yaml`);
}
const POSIX_COMMAND_EXCEPTIONS = /* @__PURE__ */ new Set([]);
const STALE_RECORDED_REQUEST_EXCEPTIONS = /* @__PURE__ */ new Set([
  // Re-recording anchors a side chat on a source turn, which hits the same
  // anchor-resolution defect that gates `supportsChatForkE2E`: Claude cannot
  // resolve a client-assigned turn id, so the fork silently degrades to an
  // injected context preamble. The capture predates that preamble and cannot
  // be refreshed until the defect is fixed. Claude only: the other providers
  // fork fine and their captures are current.
  "claude:side chat receives bounded source context without copied history"
]);
function captureKey(provider, testTitle) {
  return `${provider}:${testTitle}`;
}
function capiReplayFor(provider, testTitle, modelTraffic = "recorded") {
  const key = captureKey(provider, testTitle);
  const allowPosixCommands = POSIX_COMMAND_EXCEPTIONS.has(key);
  const allowStaleRecordedRequest = STALE_RECORDED_REQUEST_EXCEPTIONS.has(key);
  if (modelTraffic === "none") {
    return { fixturePath: EMPTY_CAPTURE_PATH, real: true, mode: "replay", allowPosixCommands, allowStaleRecordedRequest };
  }
  return { fixturePath: fixturePathFor(provider, testTitle), real: true, mode: REPLAY_MODE, allowPosixCommands, allowStaleRecordedRequest };
}
function resolveGitHubToken() {
  if (!RECORD) {
    return REPLAY_PLACEHOLDER_TOKEN;
  }
  const envToken = process.env["GITHUB_TOKEN"];
  if (envToken) {
    return envToken;
  }
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("No GITHUB_TOKEN set and `gh auth token` failed. Run `gh auth login` first.");
  }
}
async function createRealSession(c, config, clientId, trackingList, workingDirectory) {
  const sessionUri = await createProviderSession(c, {
    provider: config.provider,
    scheme: config.scheme,
    githubToken: config.githubToken ?? resolveGitHubToken()
  }, clientId, trackingList, workingDirectory);
  c.setAhpSnapshotNormalization({
    workingDirectory: workingDirectory.fsPath,
    homeDirectory: homedir(),
    userName: userInfo().username
  });
  c.clearAhpSnapshot();
  return sessionUri;
}
async function runAhpSnapshotTest(c, config, test, trackingList, tempDirs, options) {
  const scenario = AhpSnapshotScenario.load(test);
  const workingDirectory = mkdtempSync(join(tmpdir(), "ahp-snapshot-"));
  tempDirs.push(workingDirectory);
  const sessionUri = await createRealSession(c, config, scenario.clientId, trackingList, URI.file(workingDirectory));
  await scenario.run(c, sessionUri, options);
}
function getAcceptedAnswers(request) {
  if (!request.questions?.length) {
    return void 0;
  }
  return Object.fromEntries(request.questions.map((question) => {
    switch (question.kind) {
      case ChatInputQuestionKind.Text:
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: question.defaultValue ?? "interactive" }
        }];
      case ChatInputQuestionKind.Number:
      case ChatInputQuestionKind.Integer:
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Number, value: question.defaultValue ?? question.min ?? 1 }
        }];
      case ChatInputQuestionKind.Boolean:
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Boolean, value: question.defaultValue ?? true }
        }];
      case ChatInputQuestionKind.SingleSelect: {
        const preferredOption = question.options.find((option) => /exit_only/i.test(option.id)) ?? question.options.find((option) => /interactive/i.test(option.id) || /interactive/i.test(option.label)) ?? question.options.find((option) => option.recommended) ?? question.options[0];
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Selected, value: preferredOption.id }
        }];
      }
      case ChatInputQuestionKind.MultiSelect: {
        const preferredOptions = question.options.filter((option) => option.recommended);
        const selectedOptions = preferredOptions.length > 0 ? preferredOptions : question.options.slice(0, 1);
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.SelectedMany, value: selectedOptions.map((option) => option.id) }
        }];
      }
    }
  }));
}
function getMarkdownResponseText(c) {
  const markdownPartIds = /* @__PURE__ */ new Set();
  const pieces = [];
  for (const notification of c.receivedNotifications(
    (n) => isActionNotification(n, "chat/responsePart") || isActionNotification(n, "chat/delta")
  )) {
    const action = getActionEnvelope(notification).action;
    if (action.type === "chat/responsePart" && action.part.kind === ResponsePartKind.Markdown) {
      markdownPartIds.add(action.part.id);
      pieces.push(action.part.content);
    } else if (action.type === "chat/delta" && markdownPartIds.has(action.partId)) {
      pieces.push(action.content);
    }
  }
  return pieces.join("");
}
async function driveTurnToCompletion(c, session, turnId, text, clientSeq) {
  return driveTurn(c, session, turnId, clientSeq, () => dispatchTurn(c, session, turnId, text, clientSeq));
}
async function driveTurnWithAttachmentsToCompletion(c, session, turnId, text, attachments, clientSeq) {
  return driveTurn(c, session, turnId, clientSeq, () => dispatchTurnWithAttachments(c, session, turnId, text, attachments, clientSeq));
}
async function driveTurn(c, session, turnId, clientSeq, dispatch) {
  c.clearReceived();
  dispatch();
  const chat = buildDefaultChatUri(session);
  const seenNotifications = /* @__PURE__ */ new Set();
  let nextClientSeq = clientSeq + 1;
  let sawInputRequest = false;
  let sawPendingConfirmation = false;
  while (true) {
    const notification = await c.waitForNotification((n) => {
      if (seenNotifications.has(n) || !isActionNotification(n, "chat/toolCallReady") && !isActionNotification(n, "chat/inputRequested") && !isActionNotification(n, "chat/turnComplete") && !isActionNotification(n, "chat/error")) {
        return false;
      }
      if (getActionEnvelope(n).channel !== chat) {
        return false;
      }
      if (isActionNotification(n, "chat/inputRequested")) {
        return true;
      }
      return getActionEnvelope(n).action.turnId === turnId;
    }, 9e4);
    seenNotifications.add(notification);
    if (isActionNotification(notification, "chat/error")) {
      throw new Error(`Session error while driving ${turnId}`);
    }
    if (isActionNotification(notification, "chat/toolCallReady")) {
      const action2 = getActionEnvelope(notification).action;
      if (!action2.confirmed) {
        sawPendingConfirmation = true;
        c.dispatch({
          channel: buildDefaultChatUri(session),
          clientSeq: nextClientSeq++,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: action2.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      }
      continue;
    }
    if (isActionNotification(notification, "chat/inputRequested")) {
      sawInputRequest = true;
      const action2 = getActionEnvelope(notification).action;
      c.dispatch({
        channel: buildDefaultChatUri(session),
        clientSeq: nextClientSeq++,
        action: {
          type: ActionType.ChatInputCompleted,
          requestId: action2.request.id,
          response: ChatInputResponseKind.Accept,
          answers: getAcceptedAnswers(action2.request)
        }
      });
      continue;
    }
    const action = getActionEnvelope(notification).action;
    assert.strictEqual(action.turnId, turnId);
    break;
  }
  return { sawInputRequest, sawPendingConfirmation, responseText: getMarkdownResponseText(c) };
}
function terminalResourceFromContent(content) {
  const terminalContent = content.find((c) => c.type === ToolResultContentType.Terminal);
  return terminalContent?.resource;
}
function textFromContent(content) {
  return content.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("");
}
function toolResultText(content) {
  if (!content) {
    return "";
  }
  const terminalTexts = [];
  for (const part of content) {
    if (part.type !== ToolResultContentType.Terminal) {
      continue;
    }
    if (part.result?.preview) {
      terminalTexts.push(part.result.preview);
    }
  }
  return [textFromContent(content), ...terminalTexts].filter((text) => text.length > 0).join("\n");
}
function normalizeToolResultText(value, workspace) {
  const withoutAnsi = removeAnsiEscapeCodes(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  let normalizedWorkspace = withoutAnsi;
  if (workspace) {
    normalizedWorkspace = normalizedWorkspace.replaceAll(realpathSync(workspace), "${workdir}").replaceAll(workspace, "${workdir}");
  }
  return normalizedWorkspace.replaceAll("\\", "/").trim();
}
function assertToolCallCompleteText(client, options) {
  const toolNames = new Set(options.toolNames.map(normalizeShellToolNameForCapture));
  const starts = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === options.channel && action.turnId === options.turnId && toolNames.has(normalizeShellToolNameForCapture(action.toolName)));
  const startedToolCallIds = new Set(starts.map(({ action }) => action.toolCallId));
  const completions = client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === options.channel && action.turnId === options.turnId && startedToolCallIds.has(action.toolCallId));
  const observed = [];
  let matchingCompletion;
  for (const { action } of completions) {
    if (options.success !== void 0 && action.result.success !== options.success) {
      continue;
    }
    const text = normalizeToolResultText(toolResultText(action.result.content), options.workspace);
    observed.push({ toolCallId: action.toolCallId, success: action.result.success, text });
    if (options.expected.every((expected) => expected.test(text))) {
      matchingCompletion = action;
      break;
    }
  }
  assert.ok(matchingCompletion, `expected ${options.turnId} to complete ${options.toolNames.join("/")} with result text matching ${options.expected.map(String).join(", ")}; observed ${observed.map((value) => JSON.stringify(value)).join(", ")}`);
}
function terminalText(state) {
  return removeAnsiEscapeCodes(state.content.map((part) => part.type === "command" ? `${part.commandLine}
${part.output}` : part.value).join(""));
}
function findToolNameForCall(c, toolCallId) {
  return c.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((a) => a.toolCallId === toolCallId)?.toolName;
}
function startBackgroundApprovalLoop(c, options) {
  const errors = [];
  const approvedToolNames = /* @__PURE__ */ new Set();
  const observedToolNames = /* @__PURE__ */ new Set();
  const processedSeqs = /* @__PURE__ */ new Set();
  let active = true;
  let approvalSeq = options.approvalSeqStart;
  const loop = (async () => {
    while (active) {
      try {
        const ready = await c.waitForNotification((n) => {
          if (!isActionNotification(n, "chat/toolCallReady")) {
            return false;
          }
          return !processedSeqs.has(getActionEnvelope(n).serverSeq);
        }, 2e3);
        const envelope = getActionEnvelope(ready);
        processedSeqs.add(envelope.serverSeq);
        const action = envelope.action;
        if (action.confirmed) {
          continue;
        }
        const toolName = findToolNameForCall(c, action.toolCallId);
        if (toolName) {
          observedToolNames.add(toolName);
        }
        const matchingRule = options.allow.find((rule) => rule.toolName === toolName && (rule.matchInput?.(action.toolInput) ?? true));
        if (!matchingRule) {
          errors.push(`unexpected tool call: toolName=${toolName ?? "<unknown>"} input=${JSON.stringify(action.toolInput)}`);
          c.dispatch({
            channel: envelope.channel,
            clientSeq: ++approvalSeq,
            action: {
              type: ActionType.ChatToolCallConfirmed,
              turnId: action.turnId,
              toolCallId: action.toolCallId,
              approved: false,
              reason: ToolCallCancellationReason.Denied
            }
          });
          continue;
        }
        matchingRule.inspect?.({ action, errors });
        approvedToolNames.add(matchingRule.toolName);
        c.dispatch({
          channel: envelope.channel,
          clientSeq: ++approvalSeq,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId: action.turnId,
            toolCallId: action.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/timeout/i.test(msg)) {
          errors.push(`approval loop error: ${msg}`);
          active = false;
        }
      }
    }
  })();
  return {
    errors,
    approvedToolNames,
    observedToolNames,
    async stop() {
      active = false;
      await loop;
    }
  };
}
class AgentHostE2EServerLease {
  constructor(_config, startOptions = {}) {
    this._config = _config;
    /**
     * Number of **model-backed** tests served by the current shared server. A
     * single long-lived host caches one provider SDK/CLI subprocess and reuses it
     * across every test; after enough model-driven turns that subprocess can
     * accumulate state and eventually wedge a turn (turn starts, but no model
     * response arrives even though replay is instant). Recycling the server well
     * before that keeps each host instance within its reliable range while still
     * amortizing startup.
     */
    this._modelBackedTestsOnCurrentServer = 0;
    this._testsOnCurrentServer = 0;
    this._cleanupClientSeq = 1e6;
    const dataDir = mkdtempSync(join(tmpdir(), "vscode-agent-host-e2e-"));
    this._dataDir = dataDir;
    this._target = startOptions.target ?? defaultAgentHostTarget;
    this._startOptions = {
      claudeSdkRoot: startOptions.claudeSdkRoot,
      codexSdkRoot: startOptions.codexSdkRoot,
      homeDir: dataDir,
      userDataDir: join(dataDir, "user-data")
    };
    this._shared = !RECORD;
  }
  /** Acquire a server + connected client for a test, returning both. */
  async acquire(testTitle, modelTraffic = "recorded") {
    const capiReplay = capiReplayFor(this._config.provider, testTitle, modelTraffic);
    if (this._shared && this._server && (this._testsOnCurrentServer >= MAX_TESTS_PER_SHARED_SERVER || this._modelBackedTestsOnCurrentServer >= MAX_MODEL_BACKED_TESTS_PER_SHARED_SERVER)) {
      await this._recycleSharedServer();
    }
    if (this._shared && this._server) {
      const proxy = this._server.capiReplay;
      if (!proxy) {
        throw new Error("[agent-host-e2e] shared replay server has no capiReplay proxy to reset");
      }
      proxy.resetForReplay(capiReplay.fixturePath, capiReplay.allowStaleRecordedRequest);
    } else {
      this._server = await this._target.launch({ ...this._startOptions, capiReplay, logLevel: this._isCopilotProvider ? "trace" : void 0 });
      this._modelBackedTestsOnCurrentServer = 0;
      this._testsOnCurrentServer = 0;
    }
    this._testsOnCurrentServer++;
    if (modelTraffic === "recorded") {
      this._modelBackedTestsOnCurrentServer++;
    }
    this._client = new TestProtocolClient(
      this._server.port,
      () => this._server?.capiReplay?.takeReplayError(),
      (workingDirectory) => this._server?.capiReplay?.setWorkingDirectory(workingDirectory)
    );
    await this._client.connect();
    return { server: this._server, client: this._client };
  }
  /**
   * Open an additional connection to the current server.
   *
   * `reconnect` is only answerable on a transport that has not completed the
   * handshake, so a test that exercises connection recovery needs a second
   * socket it can close and re-establish without disturbing the shared
   * client. The caller owns the returned client and must close it.
   */
  async connectClient() {
    if (!this._server) {
      throw new Error("[agent-host-e2e] no server acquired yet");
    }
    const client = new TestProtocolClient(this._server.port);
    await client.connect();
    return client;
  }
  /** Stop the current shared server so the next {@link acquire} starts a fresh one. */
  async _recycleSharedServer() {
    try {
      await this._server?.capiReplay?.close();
    } finally {
      await stopServer(this._server);
      this._server = void 0;
      this._modelBackedTestsOnCurrentServer = 0;
      this._testsOnCurrentServer = 0;
    }
  }
  get observedModelRequestBodies() {
    return this._server?.capiReplay?.observedModelRequestBodies ?? [];
  }
  /** The bundled `@github/copilot` CLI is the only provider whose runtime logs we capture / run verbosely. */
  get _isCopilotProvider() {
    return this._config.provider === "copilotcli";
  }
  /**
   * Tail the most recent Copilot runtime (`@github/copilot` CLI) `process-*.log`
   * into the test output. This is the SDK/CLI's own diagnostics — the key signal
   * when a turn hangs or times out, which the AHP assertions alone don't explain.
   * The runtime writes these under `${COPILOT_HOME}/logs`, and the harness pins
   * `COPILOT_HOME` to `${homeDir}/.copilot` (see `startRealServer`), running it
   * at `trace`. Only the Copilot CLI provider is captured — Claude/Codex use their
   * own runtimes and log elsewhere. Best-effort: never throws (it runs in a
   * `teardown`, right before the failure is re-raised). Output goes to
   * `process.stdout` directly (not `console.*`): the integration harness overrides
   * `console.*` and fails the test on ANY unexpected console output during a test,
   * and `currentTest` is still set during `teardown`.
   */
  dumpRuntimeLogsOnFailure(label) {
    if (!this._isCopilotProvider) {
      return;
    }
    try {
      const logsDir = join(this._startOptions.homeDir, ".copilot", "logs");
      let entries;
      try {
        entries = readdirSync(logsDir);
      } catch {
        process.stdout.write(`[agent-host-e2e] no Copilot runtime logs for failed test "${label}" (CLI never spawned; ${logsDir} absent)
`);
        return;
      }
      const newest = entries.filter((name) => /^process-.*\.log$/.test(name)).map((name) => {
        const full = join(logsDir, name);
        try {
          return { full, mtimeMs: statSync(full).mtimeMs };
        } catch {
          return void 0;
        }
      }).filter((v) => v !== void 0).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (!newest) {
        process.stdout.write(`[agent-host-e2e] no Copilot runtime process-*.log for failed test "${label}" under ${logsDir}
`);
        return;
      }
      const lines = readFileSync(newest.full, "utf8").split(/\r?\n/);
      const tail = lines.slice(-200);
      process.stdout.write(`[agent-host-e2e] --- Copilot runtime log for failed test "${label}" (${newest.full}; last ${tail.length} of ${lines.length} lines) ---
`);
      for (const ln of tail) {
        process.stdout.write(`[agent-host-e2e] # ${ln}
`);
      }
      process.stdout.write("[agent-host-e2e] --- end Copilot runtime log ---\n");
    } catch {
    }
  }
  /**
   * Release a test: dispose its sessions, disconnect the client, and verify the
   * replay traffic. A shared server is normally kept alive (with its cached SDK
   * client) for the next test; a per-test server is stopped.
   *
   * Pass `forceRestart` when the just-run test failed. A failed test can leave
   * a mid-turn session that wedges (or has already killed) the shared host, so
   * reusing it would cascade `ECONNREFUSED` / `createSession` timeouts into the
   * next, unrelated test. Restarting isolates the failure to the one test that
   * caused it. The strict cache-miss assertion is also skipped on restart: the
   * test already failed for its own reason, and a secondary cache-miss throw
   * would only obscure it.
   */
  async release(createdSessions, forceRestart = false) {
    const client = this._client;
    const cleanupErrors = [];
    if (client) {
      for (const session of createdSessions) {
        try {
          const state = await fetchSessionWithChat(client, session);
          if (state.activeTurn) {
            const chat = buildDefaultChatUri(session);
            const turnId = state.activeTurn.id;
            client.dispatch({
              channel: chat,
              clientSeq: this._cleanupClientSeq++,
              action: { type: ActionType.ChatTurnCancelled, turnId, duration: 0 }
            });
            await client.waitForNotification(
              (n) => isActionNotification(n, "chat/turnCancelled") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
              1e4
            );
          }
          const root = await client.call("subscribe", { channel: ROOT_STATE_URI });
          const terminals = root.snapshot.state.terminals ?? [];
          for (const terminal of terminals) {
            if (terminal.claim.kind === TerminalClaimKind.Session && terminal.claim.session === session) {
              await client.call("disposeTerminal", { channel: terminal.resource }, getAgentHostE2ETestTimeout(3e4, 9e4));
            }
          }
          await client.call("disposeSession", { channel: session }, getAgentHostE2ETestTimeout(3e4, 9e4));
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      client.close();
    }
    createdSessions.length = 0;
    this._client = void 0;
    const mustRestart = forceRestart || cleanupErrors.length > 0;
    if (this._shared && !mustRestart) {
      try {
        this._server?.capiReplay?.assertNoReplayMismatches();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        try {
          await this._server?.capiReplay?.close();
        } catch (stopError) {
          cleanupErrors.push(stopError instanceof Error ? stopError : new Error(String(stopError)));
        }
        try {
          await stopServer(this._server);
        } catch (stopError) {
          cleanupErrors.push(stopError instanceof Error ? stopError : new Error(String(stopError)));
        }
        this._server = void 0;
        this._modelBackedTestsOnCurrentServer = 0;
        this._testsOnCurrentServer = 0;
      }
    } else {
      try {
        if (forceRestart) {
          await this._server?.capiReplay?.close();
        } else {
          await this._server?.capiReplay?.stop();
        }
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
      } finally {
        try {
          await stopServer(this._server);
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
        this._server = void 0;
        this._modelBackedTestsOnCurrentServer = 0;
        this._testsOnCurrentServer = 0;
      }
    }
    if (cleanupErrors.length > 0) {
      if (forceRestart) {
        process.stdout.write(`[agent-host-e2e] cleanup reported ${cleanupErrors.length} secondary error(s) after the test failed:
`);
        for (const error of cleanupErrors) {
          process.stdout.write(`[agent-host-e2e] # ${error.message}
`);
        }
        return;
      }
      throw new AggregateError(cleanupErrors, `Failed to release Agent Host E2E test resources: ${cleanupErrors.map((error) => error.message).join("; ")}`);
    }
  }
  /** Tear down a shared server at the end of the suite (no-op for per-test). */
  async dispose() {
    const dataDir = this._dataDir;
    this._dataDir = void 0;
    try {
      if (this._server) {
        try {
          await this._server.capiReplay?.close();
        } finally {
          await stopServer(this._server);
          this._server = void 0;
        }
      }
    } finally {
      if (dataDir) {
        await removeTempDirs([dataDir]);
      }
    }
  }
}
export {
  AgentHostE2EServerLease,
  REPLAY_PLACEHOLDER_TOKEN,
  assertToolCallCompleteText,
  capiReplayFor,
  createRealSession,
  dispatchTurn,
  dispatchTurnWithAttachments,
  driveTurnToCompletion,
  driveTurnWithAttachmentsToCompletion,
  findToolNameForCall,
  getAcceptedAnswers,
  getMarkdownResponseText,
  initTestGitRepo,
  removeTempDirs,
  resolveGitHubToken,
  runAhpSnapshotTest,
  startBackgroundApprovalLoop,
  terminalResourceFromContent,
  terminalText,
  textFromContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFNoYXJlZCBkcml2ZXJzIGFuZCBsaWZlY3ljbGUgaGVscGVycyBmb3IgYnVuZGxlZC1wcm92aWRlciBBZ2VudCBIb3N0IEUyRSB0ZXN0cy5cbiAqL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgY2htb2RTeW5jLCBta2R0ZW1wU3luYywgcmVhZGRpclN5bmMsIHJlYWRGaWxlU3luYywgcmVhbHBhdGhTeW5jLCBybVN5bmMsIHN0YXRTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgaG9tZWRpciwgdG1wZGlyLCB1c2VySW5mbyB9IGZyb20gJ29zJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7XG5cdFJlc3BvbnNlUGFydEtpbmQsIENoYXRJbnB1dEFuc3dlclN0YXRlLCBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsIENoYXRJbnB1dFF1ZXN0aW9uS2luZCxcblx0Q2hhdElucHV0UmVzcG9uc2VLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgYnVpbGREZWZhdWx0Q2hhdFVyaSxcblx0Uk9PVF9TVEFURV9VUkksIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgUm9vdFN0YXRlLCB0eXBlIFRlcm1pbmFsU3RhdGUsXG5cdHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsXG59IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtdGVybWluYWwvc3RhdGUuanMnO1xuaW1wb3J0IHtcblx0QWN0aW9uVHlwZSxcblx0dHlwZSBDaGF0SW5wdXRSZXF1ZXN0ZWRBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24sXG5cdHR5cGUgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24sXG59IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q2xpQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHsgQ2FwaVJlcGxheU1vZGUgfSBmcm9tICcuL2NhcGlSZXBsYXlQcm94eS5qcyc7XG5pbXBvcnQge1xuXHRmZXRjaFNlc3Npb25XaXRoQ2hhdCwgZ2V0QWN0aW9uRW52ZWxvcGUsIGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0LCBpc0FjdGlvbk5vdGlmaWNhdGlvbiwgSVNlcnZlckhhbmRsZSwgc3RvcFNlcnZlciwgVGVzdFByb3RvY29sQ2xpZW50LFxufSBmcm9tICcuLi8uLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRBZ2VudEhvc3RUYXJnZXQsIHR5cGUgSUFnZW50SG9zdFRhcmdldCB9IGZyb20gJy4vYWdlbnRIb3N0VGFyZ2V0LmpzJztcbmltcG9ydCB7IGNyZWF0ZVByb3ZpZGVyU2Vzc2lvbiwgZGlzcGF0Y2hUdXJuLCBkaXNwYXRjaFR1cm5XaXRoQXR0YWNobWVudHMgfSBmcm9tICcuLi8uLi9wcm92aWRlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VXBkYXRlU25hcHNob3RzRW52VmFyLCBBaHBTbmFwc2hvdFNjZW5hcmlvLCB0eXBlIElBaHBTbmFwc2hvdE9wdGlvbnMgfSBmcm9tICcuL2FocFNuYXBzaG90LmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWVGb3JDYXB0dXJlIH0gZnJvbSAnLi9zaGVsbFRvb2xOYW1lcy5qcyc7XG5cbi8vICNyZWdpb24gUmVjb3JkL3JlcGxheVxuXG4vKipcbiAqIGBBR0VOVF9IT1NUX1JFUExBWV9SRUNPUkQ9MWAgcmVjb3JkcyBvbmx5IExMTSBmaXh0dXJlcywgd2hpbGVcbiAqIGBBR0VOVF9IT1NUX1VQREFURV9TTkFQU0hPVFM9MWAgcmVjb3JkcyBMTE0gZml4dHVyZXMgYW5kIHVwZGF0ZXMgQUhQXG4gKiBzbmFwc2hvdHMgaW4gdGhlIHNhbWUgcnVuLlxuICovXG5jb25zdCBVUERBVEVfU05BUFNIT1RTID0gcHJvY2Vzcy5lbnZbQWdlbnRIb3N0VXBkYXRlU25hcHNob3RzRW52VmFyXSA9PT0gJzEnO1xuY29uc3QgUkVDT1JEID0gcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVQTEFZX1JFQ09SRCddID09PSAnMScgfHwgVVBEQVRFX1NOQVBTSE9UUztcbmNvbnN0IFJFUExBWV9NT0RFOiBDYXBpUmVwbGF5TW9kZSA9IFJFQ09SRCA/ICdyZWNvcmQnIDogJ3JlcGxheSc7XG5cbi8qKlxuICogVXBwZXIgYm91bmQgb24gKiptb2RlbC1iYWNrZWQqKiB0ZXN0cyBzZXJ2ZWQgYnkgYSBzaW5nbGUgc2hhcmVkIHJlcGxheSBzZXJ2ZXJcbiAqIGJlZm9yZSBpdCBpcyBwcm9hY3RpdmVseSByZWN5Y2xlZC4gVGhlIGNhY2hlZCBwcm92aWRlciBTREsvQ0xJIHN1YnByb2Nlc3NcbiAqIGRlZ3JhZGVzIGFzIGEgZnVuY3Rpb24gb2YgdGhlIG1vZGVsLWRyaXZlbiB0dXJucyBpdCBoYXMgcnVuLCBub3Qgb2YgaG93IG1hbnlcbiAqIHRlc3RzIGNvbm5lY3RlZCwgc28gaG9zdC1vbmx5IHRlc3RzIGRvIG5vdCBjb3VudCBhZ2FpbnN0IHRoaXMgYnVkZ2V0LlxuICogQW1vcnRpemVzIHN0YXJ0dXAgYWNyb3NzIG1hbnkgdGVzdHMgd2hpbGUga2VlcGluZyBlYWNoIGNhY2hlZCBwcm92aWRlclxuICogc3VicHJvY2VzcyB3ZWxsIHdpdGhpbiB0aGUgcmFuZ2Ugd2hlcmUgaXQgc3RheXMgaGVhbHRoeS5cbiAqL1xuY29uc3QgTUFYX01PREVMX0JBQ0tFRF9URVNUU19QRVJfU0hBUkVEX1NFUlZFUiA9IDI1O1xuLyoqIEJvdW5kcyBob3N0LW93bmVkIHJlc291cmNlIGFjY3VtdWxhdGlvbiBldmVuIHdoZW4gdGVzdHMgbmV2ZXIgY29udGFjdCBhIG1vZGVsLiAqL1xuY29uc3QgTUFYX1RFU1RTX1BFUl9TSEFSRURfU0VSVkVSID0gNDA7XG5jb25zdCBURU1QX0RJUl9DTEVBTlVQX1RJTUVPVVRfTVMgPSAzMF8wMDA7XG4vKiogQSBzeW50aGV0aWMgdG9rZW4gdXNlZCBvbiByZXBsYXkgKG5vIHJlYWwgY3JlZGVudGlhbCBuZWVkZWQpLiAqL1xuZXhwb3J0IGNvbnN0IFJFUExBWV9QTEFDRUhPTERFUl9UT0tFTiA9ICdyZXBsYXktbm8tdG9rZW4nO1xuZXhwb3J0IHR5cGUgQWdlbnRIb3N0RTJFTW9kZWxUcmFmZmljID0gJ3JlY29yZGVkJyB8ICdub25lJztcblxuLyoqXG4gKiBDbGVhcnMgcmVhZC1vbmx5IGF0dHJpYnV0ZXMgYWNyb3NzIGEgZGlyZWN0b3J5IHRyZWUuXG4gKlxuICogR2l0IG1hcmtzIHRoZSBmaWxlcyB1bmRlciBgLmdpdC9vYmplY3RzYCByZWFkLW9ubHksIGFuZCBvbiBXaW5kb3dzIGFcbiAqIHJlYWQtb25seSBmaWxlIGNhbm5vdCBiZSBkZWxldGVkIFx1MjAxNCBgcm1TeW5jYCdzIGBmb3JjZWAgb3B0aW9uIG9ubHkgc3VwcHJlc3Nlc1xuICogYEVOT0VOVGAsIGl0IGRvZXMgbm90IG92ZXJyaWRlIHRoZSBhdHRyaWJ1dGUuIFdpdGhvdXQgdGhpcywgYW55IHRlc3QgdGhhdFxuICogY3JlYXRlcyBhIGdpdCByZXBvc2l0b3J5IGluIGEgdGVtcCBkaXJlY3RvcnkgZmFpbHMgdGVhcmRvd24gb24gV2luZG93cyBhZnRlclxuICogYnVybmluZyB0aGUgZnVsbCBjbGVhbnVwIHRpbWVvdXQsIGV2ZW4gdGhvdWdoIHRoZSB0ZXN0IGl0c2VsZiBwYXNzZWQuXG4gKlxuICogQmVzdC1lZmZvcnQgdGhyb3VnaG91dDogZW50cmllcyBjYW4gZGlzYXBwZWFyIHVuZGVybmVhdGggdXMgd2hpbGUgdGhlIGZhaWxlZFxuICogcmVtb3ZhbCBpcyBzdGlsbCB1bndpbmRpbmcsIGFuZCBhIGZhaWx1cmUgaGVyZSBqdXN0IG1lYW5zIHRoZSByZXRyeSBmYWlscyB0aGVcbiAqIHNhbWUgd2F5IGl0IGFscmVhZHkgZGlkLlxuICovXG5mdW5jdGlvbiBjbGVhclJlYWRPbmx5QXR0cmlidXRlcyhkaXI6IHN0cmluZyk6IHZvaWQge1xuXHRsZXQgZW50cmllczogc3RyaW5nW107XG5cdHRyeSB7XG5cdFx0ZW50cmllcyA9IHJlYWRkaXJTeW5jKGRpcik7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybjtcblx0fVxuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRjb25zdCBlbnRyeVBhdGggPSBqb2luKGRpciwgZW50cnkpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBEaXJlY3RvcmllcyBuZWVkIHRoZSBleGVjdXRlIGJpdCB0byBzdGF5IHRyYXZlcnNhYmxlLlxuXHRcdFx0Y29uc3QgaXNEaXJlY3RvcnkgPSBzdGF0U3luYyhlbnRyeVBhdGgpLmlzRGlyZWN0b3J5KCk7XG5cdFx0XHRjaG1vZFN5bmMoZW50cnlQYXRoLCBpc0RpcmVjdG9yeSA/IDBvNzAwIDogMG82MDApO1xuXHRcdFx0aWYgKGlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGNsZWFyUmVhZE9ubHlBdHRyaWJ1dGVzKGVudHJ5UGF0aCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBFbnRyeSB2YW5pc2hlZCBvciBjYW5ub3QgYmUgY2hhbmdlZDsgdGhlIHJldHJ5IHdpbGwgcmVwb3J0IGl0LlxuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEluaXRpYWxpemVzIGEgZ2l0IHJlcG9zaXRvcnkgZm9yIGEgdGVzdCwgd2l0aCBhbiBpZGVudGl0eSBhbmQgbm8gYmFja2dyb3VuZFxuICogbWFpbnRlbmFuY2UuXG4gKlxuICogYGdjLmF1dG8gMGAgbWF0dGVycyBvbiBXaW5kb3dzOiBhbiBhdXRvLXRyaWdnZXJlZCBgZ2l0IGdjYCBydW5zIGluIHRoZVxuICogYmFja2dyb3VuZCBhbmQgY2FuIHN0aWxsIGhvbGQgaGFuZGxlcyB1bmRlciBgLmdpdGAgd2hlbiB0aGUgdGVzdCBmaW5pc2hlcyxcbiAqIHdoaWNoIG1ha2VzIHRoZSB0ZW1wLWRpcmVjdG9yeSBjbGVhbnVwIGZhaWwgZm9yIGEgcmVhc29uIHVucmVsYXRlZCB0byB0aGVcbiAqIGJlaGF2aW9yIHVuZGVyIHRlc3QuIFRlc3RzIGhlcmUgbmV2ZXIgY3JlYXRlIGVub3VnaCBvYmplY3RzIHRvIG5lZWQgZ2MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbml0VGVzdEdpdFJlcG8oY3dkOiBzdHJpbmcpOiB2b2lkIHtcblx0ZXhlY1N5bmMoJ2dpdCBpbml0JywgeyBjd2QgfSk7XG5cdGV4ZWNTeW5jKCdnaXQgY29uZmlnIHVzZXIubmFtZSBcIkFnZW50IEhvc3QgVGVzdFwiJywgeyBjd2QgfSk7XG5cdGV4ZWNTeW5jKCdnaXQgY29uZmlnIHVzZXIuZW1haWwgXCJhZ2VudC1ob3N0LXRlc3RAZXhhbXBsZS5jb21cIicsIHsgY3dkIH0pO1xuXHRleGVjU3luYygnZ2l0IGNvbmZpZyBnYy5hdXRvIDAnLCB7IGN3ZCB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbW92ZVRlbXBEaXJzKHRlbXBEaXJzOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBwZW5kaW5nRGlycyA9IHRlbXBEaXJzLnNwbGljZSgwKTtcblx0Y29uc3QgZXJyb3JzID0gbmV3IE1hcDxzdHJpbmcsIEVycm9yPigpO1xuXHRjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyBURU1QX0RJUl9DTEVBTlVQX1RJTUVPVVRfTVM7XG5cdHdoaWxlIChwZW5kaW5nRGlycy5sZW5ndGggPiAwKSB7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSBwZW5kaW5nRGlycy5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG5cdFx0XHRjb25zdCBkaXIgPSBwZW5kaW5nRGlyc1tpbmRleF07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRybVN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdHBlbmRpbmdEaXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdGVycm9ycy5kZWxldGUoZGlyKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGVycm9ycy5zZXQoZGlyLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdFx0XHQvLyBBIHJlYWQtb25seSBmaWxlIG5ldmVyIGJlY29tZXMgZGVsZXRhYmxlIGJ5IHdhaXRpbmcsIHNvIGNsZWFyIHRoZVxuXHRcdFx0XHQvLyBhdHRyaWJ1dGVzIGJlZm9yZSB0aGUgcmV0cnkgcmF0aGVyIHRoYW4gc3Bpbm5pbmcgdW50aWwgdGhlXG5cdFx0XHRcdC8vIGRlYWRsaW5lLiBIYXJtbGVzcyB3aGVuIHRoZSByZWFsIGNhdXNlIGlzIGEgdHJhbnNpZW50IGxvY2suXG5cdFx0XHRcdGNsZWFyUmVhZE9ubHlBdHRyaWJ1dGVzKGRpcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwZW5kaW5nRGlycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKERhdGUubm93KCkgPj0gZGVhZGxpbmUpIHtcblx0XHRcdHRocm93IG5ldyBBZ2dyZWdhdGVFcnJvcihcblx0XHRcdFx0QXJyYXkuZnJvbShlcnJvcnMudmFsdWVzKCkpLFxuXHRcdFx0XHRgRmFpbGVkIHRvIHJlbW92ZSBBZ2VudCBIb3N0IEUyRSB0ZW1wb3JhcnkgZGlyZWN0b3JpZXM6ICR7cGVuZGluZ0RpcnMuam9pbignLCAnKX1gLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0YXdhaXQgdGltZW91dCg1MDApO1xuXHR9XG59XG5cbi8qKlxuICogRml4dHVyZXMgbGl2ZSBpbiB0aGUgc291cmNlIHRyZWUgKGNvbW1pdHRlZCkgdGhvdWdoIHRoZSBjb21waWxlZCB0ZXN0IHJ1bnNcbiAqIGZyb20gYG91dC9gL2BvdXQtYnVpbGQvYCBcdTIwMTQgcmVzb2x2ZSB1cCB0byB0aGUgcmVwbyByb290IGFuZCBpbnRvIGBzcmMvLi4uYC5cbiAqL1xuY29uc3QgQ0FQVFVSRVNfRElSID0gZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvdnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9lMmUvY2FwdHVyZXMvJywgaW1wb3J0Lm1ldGEudXJsKSk7XG5jb25zdCBFTVBUWV9DQVBUVVJFX1BBVEggPSBqb2luKENBUFRVUkVTX0RJUiwgJ2VtcHR5LnlhbWwnKTtcblxuLyoqIFBlci10ZXN0IGZpeHR1cmUgcGF0aCBkZXJpdmVkIGZyb20gdGhlIHByb3ZpZGVyICsgdGVzdCB0aXRsZS4gKi9cbmZ1bmN0aW9uIGZpeHR1cmVQYXRoRm9yKHByb3ZpZGVyOiBzdHJpbmcsIHRlc3RUaXRsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2x1ZyA9IHRlc3RUaXRsZS5yZXBsYWNlKC9bXmEtejAtOV0rL2dpLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpLnRvTG93ZXJDYXNlKCk7XG5cdHJldHVybiBqb2luKENBUFRVUkVTX0RJUiwgYCR7cHJvdmlkZXJ9LSR7c2x1Z30ueWFtbGApO1xufVxuXG4vKipcbiAqIFRlc3RzIHdob3NlIHJlY29yZGVkIGNhcHR1cmUgaXMgYWxsb3dlZCB0byBjb250YWluIFBPU0lYLW9ubHkgY29tbWFuZHMuXG4gKlxuICogS2V5ZWQgYnkgcHJvdmlkZXIgYW5kIHRlc3QgdGl0bGUsIHNpbmNlIGEgY2FwdHVyZSBleGlzdHMgcGVyIHByb3ZpZGVyIGFuZCBhblxuICogZXhjZXB0aW9uIG11c3Qgb25seSBldmVyIHNpbGVuY2UgdGhlIG9uZSBpdCB3YXMgd3JpdHRlbiBmb3IuIEVhY2ggZW50cnkgbXVzdFxuICogY29ycmVzcG9uZCB0byBhIHRlc3QgdGhhdCBpcyAqYWxzbyogc2NvcGVkIGF3YXkgZnJvbSBXaW5kb3dzIGF0IGl0cyBjYWxsXG4gKiBzaXRlLCB3aXRoIHRoZSByZWFzb24gc3RhdGVkIHRoZXJlLiBUaGlzIGxpc3QgZXhpc3RzIHNvIHRoZSBleGNlcHRpb25zIGFyZVxuICogY291bnRhYmxlIGluIG9uZSBwbGFjZTsgYWRkaW5nIHRvIGl0IHNob3VsZCBiZSByYXJlIGFuZCBkZWxpYmVyYXRlLiBTZWVcbiAqIGBoYXJuZXNzL3Bvc2l4Q29tbWFuZExpbnQudHNgLlxuICovXG5jb25zdCBQT1NJWF9DT01NQU5EX0VYQ0VQVElPTlMgPSBuZXcgU2V0PHN0cmluZz4oW10pO1xuXG4vKipcbiAqIENhcHR1cmVzIHRoYXQgYXJlIGFsbG93ZWQgdG8gZGlzYWdyZWUgd2l0aCB0aGUgcmVxdWVzdCB0aGUgaG9zdCBub3cgc2VuZHMuXG4gKlxuICogS2V5ZWQgYnkgcHJvdmlkZXIgYW5kIHRlc3QgdGl0bGUgZm9yIHRoZSBzYW1lIHJlYXNvbiBhc1xuICoge0BsaW5rIFBPU0lYX0NPTU1BTkRfRVhDRVBUSU9OU306IHRoZSBzYW1lIHRlc3QgcnVucyBhZ2FpbnN0IGV2ZXJ5IHByb3ZpZGVyXG4gKiB0aGF0IHN1cHBvcnRzIGl0LCBhbmQgZWFjaCBoYXMgaXRzIG93biBjYXB0dXJlLiBUaGUgY2FwdHVyZSBzdG9wcyBiZWluZyBhblxuICogYXNzZXJ0aW9uIGZvciBhbiBlbnRyeSBoZXJlLCBzbyBvbmUgaXMgb25seSBqdXN0aWZpZWQgd2hlbiBpdCAqY2Fubm90KiBiZVxuICogcmVmcmVzaGVkLCBhbmQgaXQgbXVzdCBoYXZlIGEgYEtOT1dOX0lTU1VFUy5tZGAgZW50cnkgcmVjb3JkaW5nIHdoeS4gU2VlXG4gKiBgaGFybmVzcy9tb2RlbFJlcXVlc3RQcm9qZWN0aW9uLnRzYC5cbiAqL1xuY29uc3QgU1RBTEVfUkVDT1JERURfUkVRVUVTVF9FWENFUFRJT05TID0gbmV3IFNldDxzdHJpbmc+KFtcblx0Ly8gUmUtcmVjb3JkaW5nIGFuY2hvcnMgYSBzaWRlIGNoYXQgb24gYSBzb3VyY2UgdHVybiwgd2hpY2ggaGl0cyB0aGUgc2FtZVxuXHQvLyBhbmNob3ItcmVzb2x1dGlvbiBkZWZlY3QgdGhhdCBnYXRlcyBgc3VwcG9ydHNDaGF0Rm9ya0UyRWA6IENsYXVkZSBjYW5ub3Rcblx0Ly8gcmVzb2x2ZSBhIGNsaWVudC1hc3NpZ25lZCB0dXJuIGlkLCBzbyB0aGUgZm9yayBzaWxlbnRseSBkZWdyYWRlcyB0byBhblxuXHQvLyBpbmplY3RlZCBjb250ZXh0IHByZWFtYmxlLiBUaGUgY2FwdHVyZSBwcmVkYXRlcyB0aGF0IHByZWFtYmxlIGFuZCBjYW5ub3Rcblx0Ly8gYmUgcmVmcmVzaGVkIHVudGlsIHRoZSBkZWZlY3QgaXMgZml4ZWQuIENsYXVkZSBvbmx5OiB0aGUgb3RoZXIgcHJvdmlkZXJzXG5cdC8vIGZvcmsgZmluZSBhbmQgdGhlaXIgY2FwdHVyZXMgYXJlIGN1cnJlbnQuXG5cdCdjbGF1ZGU6c2lkZSBjaGF0IHJlY2VpdmVzIGJvdW5kZWQgc291cmNlIGNvbnRleHQgd2l0aG91dCBjb3BpZWQgaGlzdG9yeScsXG5dKTtcblxuLyoqIElkZW50aWZpZXMgb25lIHByb3ZpZGVyJ3MgY2FwdHVyZSBvZiBhIHRlc3QsIG1hdGNoaW5nIGBmaXh0dXJlUGF0aEZvcmAuICovXG5mdW5jdGlvbiBjYXB0dXJlS2V5KHByb3ZpZGVyOiBzdHJpbmcsIHRlc3RUaXRsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke3Byb3ZpZGVyfToke3Rlc3RUaXRsZX1gO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSBgY2FwaVJlcGxheWAgb3B0aW9uIGZvciBhIHRlc3Q6IHJlcGxheXMgdGhlIGNvbW1pdHRlZCBwZXItdGVzdFxuICogZml4dHVyZSBieSBkZWZhdWx0ICh0b2tlbmxlc3MpLCBvciByZWNvcmRzIGl0IGFnYWluc3QgcmVhbCBDQVBJIHdoZW5cbiAqIGBBR0VOVF9IT1NUX1JFUExBWV9SRUNPUkQ9MWAgb3IgYEFHRU5UX0hPU1RfVVBEQVRFX1NOQVBTSE9UUz0xYC4gVGVzdHMgdGhhdFxuICogZGVjbGFyZSBubyBtb2RlbCB0cmFmZmljIGFsd2F5cyB1c2UgdGhlIHN0cmljdCBzaGFyZWQgZW1wdHkgcmVwbGF5IGZpeHR1cmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYXBpUmVwbGF5Rm9yKHByb3ZpZGVyOiBzdHJpbmcsIHRlc3RUaXRsZTogc3RyaW5nLCBtb2RlbFRyYWZmaWM6IEFnZW50SG9zdEUyRU1vZGVsVHJhZmZpYyA9ICdyZWNvcmRlZCcpOiB7IGZpeHR1cmVQYXRoOiBzdHJpbmc7IHJlYWw6IHRydWU7IG1vZGU6IENhcGlSZXBsYXlNb2RlOyBhbGxvd1Bvc2l4Q29tbWFuZHM6IGJvb2xlYW47IGFsbG93U3RhbGVSZWNvcmRlZFJlcXVlc3Q6IGJvb2xlYW4gfSB7XG5cdGNvbnN0IGtleSA9IGNhcHR1cmVLZXkocHJvdmlkZXIsIHRlc3RUaXRsZSk7XG5cdGNvbnN0IGFsbG93UG9zaXhDb21tYW5kcyA9IFBPU0lYX0NPTU1BTkRfRVhDRVBUSU9OUy5oYXMoa2V5KTtcblx0Y29uc3QgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCA9IFNUQUxFX1JFQ09SREVEX1JFUVVFU1RfRVhDRVBUSU9OUy5oYXMoa2V5KTtcblx0aWYgKG1vZGVsVHJhZmZpYyA9PT0gJ25vbmUnKSB7XG5cdFx0cmV0dXJuIHsgZml4dHVyZVBhdGg6IEVNUFRZX0NBUFRVUkVfUEFUSCwgcmVhbDogdHJ1ZSwgbW9kZTogJ3JlcGxheScsIGFsbG93UG9zaXhDb21tYW5kcywgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCB9O1xuXHR9XG5cdHJldHVybiB7IGZpeHR1cmVQYXRoOiBmaXh0dXJlUGF0aEZvcihwcm92aWRlciwgdGVzdFRpdGxlKSwgcmVhbDogdHJ1ZSwgbW9kZTogUkVQTEFZX01PREUsIGFsbG93UG9zaXhDb21tYW5kcywgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCB9O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gVG9rZW5cblxuLyoqIFJlc29sdmUgR2l0SHViIHRva2VuIGZyb20gZW52IG9yIGBnaCBhdXRoIHRva2VuYC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlR2l0SHViVG9rZW4oKTogc3RyaW5nIHtcblx0Ly8gUmVwbGF5aW5nIGNvbW1pdHRlZCBmaXh0dXJlcyBuZWVkcyBubyByZWFsIGNyZWRlbnRpYWw6IHRoZSBjYXB0dXJlIHByb3h5XG5cdC8vIHNlcnZlcyByZWNvcmRlZCByZXNwb25zZXMgYW5kIGlnbm9yZXMgYXV0aC4gT25seSByZWNvcmRpbmcgdGFsa3MgdG8gcmVhbFxuXHQvLyBDQVBJIGFuZCB0aHVzIG5lZWRzIGEgcmVhbCB0b2tlbi5cblx0aWYgKCFSRUNPUkQpIHtcblx0XHRyZXR1cm4gUkVQTEFZX1BMQUNFSE9MREVSX1RPS0VOO1xuXHR9XG5cdGNvbnN0IGVudlRva2VuID0gcHJvY2Vzcy5lbnZbJ0dJVEhVQl9UT0tFTiddO1xuXHRpZiAoZW52VG9rZW4pIHtcblx0XHRyZXR1cm4gZW52VG9rZW47XG5cdH1cblx0dHJ5IHtcblx0XHRyZXR1cm4gZXhlY1N5bmMoJ2doIGF1dGggdG9rZW4nLCB7IGVuY29kaW5nOiAndXRmLTgnIH0pLnRyaW0oKTtcblx0fSBjYXRjaCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdObyBHSVRIVUJfVE9LRU4gc2V0IGFuZCBgZ2ggYXV0aCB0b2tlbmAgZmFpbGVkLiBSdW4gYGdoIGF1dGggbG9naW5gIGZpcnN0LicpO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBQcm92aWRlciBjb25maWd1cmF0aW9uXG5cbi8qKlxuICogUGVyLXByb3ZpZGVyIGtub2JzIGZvciB0aGUgc2hhcmVkIGFnZW50IGhvc3QgZTJlIHN1aXRlLiBMZXRzIHVzIHNoYXJlIHRoZSBidWxrIG9mXG4gKiB0aGUgdGVzdCBib2RpZXMgd2hpbGUgcGFyYW1ldGVyaXppbmcgdGhpbmdzIHRoYXQgZ2VudWluZWx5IGRpZmZlciBiZXR3ZWVuXG4gKiBDb3BpbG90IGFuZCBDbGF1ZGUgKHRvb2wgbmFtZXMsIFVSSSBzY2hlbWUsIHNlcnZlciBzdGFydHVwIG9wdGlvbnMpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RFMkVQcm92aWRlckNvbmZpZyB7XG5cdC8qKiBTdWl0ZSB0aXRsZSBzaG93biBpbiB0aGUgdGVzdCBydW5uZXIuICovXG5cdHJlYWRvbmx5IHN1aXRlVGl0bGU6IHN0cmluZztcblx0LyoqIFByb3ZpZGVyIGlkIHBhc3NlZCB0byBgY3JlYXRlU2Vzc2lvbmAuICovXG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBzdHJpbmc7XG5cdC8qKiBVUkkgc2NoZW1lIHVzZWQgd2hlbiBtaW50aW5nIHNlc3Npb24gVVJJcy4gKi9cblx0cmVhZG9ubHkgc2NoZW1lOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUb29sIG5hbWUgdXNlZCBieSB0aGUgcHJvdmlkZXIgZm9yIGFuIGludGVyYWN0aXZlIHNoZWxsIGNvbW1hbmQuIFVzZWRcblx0ICogYnkgdGhlIHNoZWxsLXBlcm1pc3Npb24gYW5kIGNkLXByZWZpeCB0ZXN0cy4gKGBiYXNoYCBmb3IgQ29waWxvdCxcblx0ICogYEJhc2hgIGZvciBDbGF1ZGUuKVxuXHQgKi9cblx0cmVhZG9ubHkgc2hlbGxUb29sTmFtZTogc3RyaW5nO1xuXHQvKipcblx0ICogVG9vbCBuYW1lcyB0aGUgcHJvdmlkZXIgdXNlcyB0byBkaXNwYXRjaCBhIHN1YmFnZW50LiBUaGUgZmlyc3QgZW50cnlcblx0ICogaXMgdXNlZCBpbiB0aGUgc3ViYWdlbnQtcm91dGluZyBwcm9tcHQ7IGFsbCBlbnRyaWVzIGFyZSBleGVtcHRlZCBmcm9tXG5cdCAqIHRoZSBcInBhcmVudCBtdXN0IG5vdCBjb250YWluIGlubmVyIHRvb2wgY2FsbHNcIiBhc3NlcnRpb24uIChgWyd0YXNrJ11gXG5cdCAqIGZvciBDb3BpbG90OyBDbGF1ZGUgZXhwb3NlcyBib3RoIGBUYXNrYCBhbmQgYEFnZW50YCBhcyBzdWJhZ2VudC1raW5kXG5cdCAqIHRvb2xzIGFuZCB0aGUgbW9kZWwgbWF5IHBpY2sgZWl0aGVyLilcblx0ICovXG5cdHJlYWRvbmx5IHN1YmFnZW50VG9vbE5hbWVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIFRvb2wgbmFtZSB1c2VkIGJ5IHRoZSBwcm92aWRlciB0byBjb25maXJtIHRoZSB1c2VyIGlzIHJlYWR5IHRvIGxlYXZlXG5cdCAqIHBsYW4gbW9kZS4gKGBleGl0X3BsYW5fbW9kZWAgZm9yIENvcGlsb3QsIGBFeGl0UGxhbk1vZGVgIGZvciBDbGF1ZGUuKVxuXHQgKi9cblx0cmVhZG9ubHkgZXhpdFBsYW5Nb2RlVG9vbE5hbWU6IHN0cmluZztcblx0LyoqIEZpbGUtY3JlYXRpb24gdG9vbCB0aGF0IGV4cG9zZXMgbW9kZWwtZ2VuZXJhdGVkIGFyZ3VtZW50IGRlbHRhcywgd2hlbiBzdXBwb3J0ZWQuICovXG5cdHJlYWRvbmx5IHN0cmVhbWluZ0ZpbGVDcmVhdGVUb29sTmFtZT86IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHN1aXRlIHNob3VsZCBiZSBlbmFibGVkLiBSZXR1cm5pbmcgZmFsc2Ugc2tpcHMgdGhlIHN1aXRlXG5cdCAqIGVudGlyZWx5IChtaXJyb3JzIGBzdWl0ZS5za2lwKC4uLilgKS5cblx0ICovXG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBwYXRoIHRvIGEgbG9jYWxseSBpbnN0YWxsZWQgYEBhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNka2Bcblx0ICogcGFja2FnZS4gRm9yd2FyZGVkIHRvIHRoZSB0YXJnZXQncyBgbGF1bmNoYCBzbyB0aGUgYWdlbnQgaG9zdCByZWdpc3RlcnNcblx0ICogdGhlIENsYXVkZSBwcm92aWRlci5cblx0ICovXG5cdHJlYWRvbmx5IGNsYXVkZVNka1Jvb3Q/OiBzdHJpbmc7XG5cdC8qKiBPcHRpb25hbCBwYXRoIHRvIGEgbG9jYWxseSBpbnN0YWxsZWQgYGNvZGV4YCBiaW5hcnkuIEZvcndhcmRlZCB0byB0aGUgdGFyZ2V0J3MgYGxhdW5jaGAuICovXG5cdHJlYWRvbmx5IGNvZGV4U2RrUm9vdD86IHN0cmluZztcblx0LyoqXG5cdCAqIFByb3ZpZGVyIGltcGxlbWVudHMgYGNvbmZpZy5pc29sYXRpb246ICd3b3JrdHJlZSdgIGFuZCByZXNvbHZlcyB0aGVcblx0ICogd29ya2luZyBkaXJlY3RvcnkgdG8gYSBgLndvcmt0cmVlcy8uLi5gIHBhdGggb24gbWF0ZXJpYWxpemF0aW9uLiBOb3dcblx0ICogc2hhcmVkIGFjcm9zcyBhbGwgYWdlbnRzIChDb3BpbG90LCBDb2RleCwgQ2xhdWRlKSB2aWEgdGhlIGhvc3Qtb3duZWRcblx0ICogd29ya3RyZWUgaXNvbGF0aW9uIGNvbnRyb2xsZXIuXG5cdCAqL1xuXHRyZWFkb25seSBzdXBwb3J0c1dvcmt0cmVlSXNvbGF0aW9uOiBib29sZWFuO1xuXHQvKipcblx0ICogUHJvdmlkZXIgcm91dGVzIHNoZWxsIGNvbW1hbmRzIHRocm91Z2ggdGhlIGhvc3QtbWFuYWdlZCBjdXN0b20gdGVybWluYWxcblx0ICogdG9vbCAoZ2F0ZWQgYnkge0BsaW5rIENvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sfSksXG5cdCAqIHdoaWNoIGV4cG9zZXMgYSB0ZXJtaW5hbCByZXNvdXJjZSB3aG9zZSBgY3dkYCAvIGBwd2RgIG91dHB1dCBjYW4gYmVcblx0ICogYXNzZXJ0ZWQuIEN1cnJlbnRseSB0cnVlIG9ubHkgZm9yIENvcGlsb3QgXHUyMDE0IENvZGV4IGFuZCBDbGF1ZGUgcnVuIHNoZWxsXG5cdCAqIGNvbW1hbmRzIGluc2lkZSB0aGVpciBvd24gU0RLIHN1YnByb2Nlc3MgYW5kIG5ldmVyIHN1cmZhY2UgYSBob3N0XG5cdCAqIHRlcm1pbmFsIHJlc291cmNlLCBzbyB0aGUgd29ya3RyZWUgc3VpdGUgdmVyaWZpZXMgaXNvbGF0aW9uIHZpYSB0aGVcblx0ICogcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkgYWxvbmUgZm9yIHRoZW0uXG5cdCAqL1xuXHRyZWFkb25seSBzdXBwb3J0c0hvc3RUZXJtaW5hbFRvb2w6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBQcm92aWRlciBleHBvc2VzIGEgc3ViYWdlbnQgdG9vbCAoYHRhc2tgIC8gYFRhc2tgKSB0aGF0IHByb2R1Y2VzXG5cdCAqIGBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50YCBhbmQgcm91dGVzIGlubmVyIHRvb2wgY2FsbHMgdG8gYSBjaGlsZFxuXHQgKiBzZXNzaW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNTdWJhZ2VudHM6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSBwcm92aWRlciBzdXBwb3J0cyBjcmVhdGluZyBzaWRlIGNoYXRzIGZyb20gYSBzb3VyY2UgdHVybi4gKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNTaWRlQ2hhdHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHNoZWxsLWRlcGVuZGVudCByZXBsYXkgdGVzdHMgYXJlIHNraXBwZWQgb24gTGludXggYmVjYXVzZSB0aGlzXG5cdCAqIHByb3ZpZGVyIGNvbXBsZXRlcyByZWNvcmRlZCBzaGVsbC10b29sIHR1cm5zIHdpdGhvdXQgZW1pdHRpbmcgdG9vbC1jYWxsXG5cdCAqIG5vdGlmaWNhdGlvbnMgdGhlcmUuIFJlY29yZGluZyBhbmQgb3RoZXIgcGxhdGZvcm1zIGtlZXAgZnVsbCBjb3ZlcmFnZS5cblx0ICovXG5cdHJlYWRvbmx5IHNoZWxsVG9vbFJlcGxheVVuc3RhYmxlT25MaW51eD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgcHJvdmlkZXIgb2ZmZXJzIGZpbGUtcmVhZGluZy93cml0aW5nIHRvb2xzIG9mIGl0cyBvd24uXG5cdCAqXG5cdCAqIFNjZW5hcmlvcyB3aG9zZSBwcm9tcHQgc3RlZXJzIHRoZSBhZ2VudCB0byBpdHMgZmlsZSB0b29scyAoXCJVc2UgeW91ciBmaWxlXG5cdCAqIHRvb2xzOyBkbyBub3QgcnVuIGEgc2hlbGwgY29tbWFuZC5cIikgY2Fubm90IGJlIHNhdGlzZmllZCBieSBhIHByb3ZpZGVyXG5cdCAqIHRoYXQgb25seSBoYXMgYSBzaGVsbDogaXQgcmVmdXNlcyB0aGUgb3BlcmF0aW9uIHJhdGhlciB0aGFuIGZhbGxpbmcgYmFjay5cblx0ICogQ29kZXggaXMgdGhlIGN1cnJlbnQgZXhhbXBsZSBcdTIwMTQgaXRzIGNhcHR1cmVzIGNvbnRhaW4gb25seSBgZXhlY19jb21tYW5kYC5cblx0ICpcblx0ICogU2NlbmFyaW9zIHRoYXQgcGluIGEgcG9ydGFibGUgc2hlbGwgY29tbWFuZCBpbnN0ZWFkIGFyZSB1bmFmZmVjdGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgc3VwcG9ydHNGaWxlVG9vbHM6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgcHJvdmlkZXIncyBmaWxlLW1hbmlwdWxhdGlvbiBzY2VuYXJpb3MgcmVwbGF5IHN0YWJseSB3aGVuIHRoZVxuXHQgKiB3aG9sZSBzdWl0ZSBzaGFyZXMgb25lIHNlcnZlci5cblx0ICpcblx0ICogQSBwcm92aWRlciB3aXRob3V0IGZpbGUgdG9vbHMgcGVyZm9ybXMgZWFjaCBvZiB0aGVtIHRocm91Z2ggaXRzIHNoZWxsLCBhbmRcblx0ICogc2V2ZXJhbCBzdWNoIHR1cm5zIG9uIG9uZSBsb25nLWxpdmVkIHNlcnZlciBoaXQgdGhlIHNoYXJlZC1zZXJ2ZXIgbG9hZFxuXHQgKiBjZWlsaW5nOiB0aGUgdG9vbC1jYWxsIGNvbXBsZXRpb24gaXMgcmVwb3J0ZWQgaW5jb25zaXN0ZW50bHkgYW5kIHRoZVxuXHQgKiBmYWlsaW5nIHNjZW5hcmlvIG1vdmVzIGJldHdlZW4gcnVucy4gSW5kaXZpZHVhbGx5IHRoZXkgcmVwbGF5IGZpbmUsIHNvXG5cdCAqIHRoaXMgZ2F0ZXMgdGhlIGZhbWlseSByYXRoZXIgdGhhbiBhbnkgc2luZ2xlIHRlc3QuXG5cdCAqL1xuXHRyZWFkb25seSBzdGFibGVTaGFyZWRTZXJ2ZXJGaWxlU2NlbmFyaW9zPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB0aGUgc3ViYWdlbnQtcmVvcGVuIChcInJlcGxheSBwYXRoXCIpIHRlc3QgaXMgc2tpcHBlZCBvbiBXaW5kb3dzIGZvclxuXHQgKiB0aGlzIHByb3ZpZGVyLCB3aGljaCByZWJ1aWxkcyB0aGUgcmVvcGVuZWQgdHJhbnNjcmlwdCBmcm9tIHRoZSBidW5kbGVkIFNESydzXG5cdCAqIG9uLWRpc2sgYHN1YmFnZW50cy9hZ2VudC0qLmpzb25sYCBmaWxlcyBcdTIwMTQgbm90IHJlbGlhYmx5IHZpc2libGUgb24gV2luZG93c1xuXHQgKiByaWdodCBhZnRlciB0aGUgdHVybiwgc28gdGhlIHRyYW5zY3JpcHQgY2FuIGNvbWUgYmFjayBlbXB0eS4gbWFjT1MvTGludXgga2VlcFxuXHQgKiBmdWxsIGNvdmVyYWdlOyBwcm92aWRlcnMgdGhhdCByZWJ1aWxkIGZyb20gdGhlIGluLXByb2Nlc3MgZXZlbnQgbG9nIChDb3BpbG90KVxuXHQgKiBhcmUgdW5hZmZlY3RlZCBhbmQgc3RheSBlbmFibGVkIG9uIFdpbmRvd3MuXG5cdCAqL1xuXHRyZWFkb25seSBzdWJhZ2VudFJlcGxheVVuc3RhYmxlT25XaW5kb3dzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHByb3ZpZGVyJ3MgcGxhbi1tb2RlIGZsb3cgbWF0Y2hlcyB0aGUgc2hhcmVkIHRlc3Qnc1xuXHQgKiBleHBlY3RhdGlvbnMgKGF1dG8tYXBwcm92ZSBzZXNzaW9uLXN0YXRlIHdyaXRlczsgcmVhY2ggdGhlXG5cdCAqIGV4aXQtcGxhbi1tb2RlIHRvb2wgYXMgYW4gYGlucHV0UmVxdWVzdGVkYCkuIEN1cnJlbnRseSB0cnVlIG9ubHkgZm9yXG5cdCAqIENvcGlsb3QgXHUyMDE0IENsYXVkZSdzIHBsYW4tbW9kZSBwcm9tcHQgY29udmVudGlvbnMgZGlmZmVyIGVub3VnaCB0aGF0IHRoZVxuXHQgKiBzaGFyZWQgdGVzdCBwcm9tcHQgZG9lc24ndCByZWxpYWJseSBkcml2ZSBpdCB0byBgRXhpdFBsYW5Nb2RlYC5cblx0ICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzUGxhbk1vZGU6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSBwcm92aWRlciBzdXBwb3J0cyBhZGRpdGlvbmFsIHBlZXIgY2hhdHMgYW5kIGNoYXQgZm9ya3MuICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3VwcG9ydHNDaGF0Rm9yazogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgcHJvdmlkZXItYmFja2VkIGZvcmsgY29udGV4dCBjYW4gYmUgdGVzdGVkIGVuZC10by1lbmQuICovXG5cdHJlYWRvbmx5IHN1cHBvcnRzQ2hhdEZvcmtFMkU6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBnaXRodWIgdG9rZW4gdG8gdXNlLiBJZiBub3QgcHJvdmlkZWQsIHRoZSB0ZXN0IHdpbGwgYXR0ZW1wdCB0byByZXNvbHZlIGl0IGZyb20gdGhlIGVudmlyb25tZW50IG9yIGBnaCBhdXRoIHRva2VuYC5cblx0ICovXG5cdHJlYWRvbmx5IGdpdGh1YlRva2VuPzogc3RyaW5nO1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU2Vzc2lvbiBjcmVhdGlvbiAvIGRpc3BhdGNoXG5cbi8qKiBDcmVhdGUgYSBzZXNzaW9uIGZvciB0aGUgY29uZmlndXJlZCBwcm92aWRlciwgYXV0aGVudGljYXRlLCBzdWJzY3JpYmUsIGFuZCByZXR1cm4gdGhlIHNlc3Npb24gVVJJLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJlYWxTZXNzaW9uKFxuXHRjOiBUZXN0UHJvdG9jb2xDbGllbnQsXG5cdGNvbmZpZzogSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnLFxuXHRjbGllbnRJZDogc3RyaW5nLFxuXHR0cmFja2luZ0xpc3Q6IHN0cmluZ1tdLFxuXHR3b3JraW5nRGlyZWN0b3J5OiBVUkksXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUHJvdmlkZXJTZXNzaW9uKGMsIHtcblx0XHRwcm92aWRlcjogY29uZmlnLnByb3ZpZGVyLFxuXHRcdHNjaGVtZTogY29uZmlnLnNjaGVtZSxcblx0XHRnaXRodWJUb2tlbjogY29uZmlnLmdpdGh1YlRva2VuID8/IHJlc29sdmVHaXRIdWJUb2tlbigpLFxuXHR9LCBjbGllbnRJZCwgdHJhY2tpbmdMaXN0LCB3b3JraW5nRGlyZWN0b3J5KTtcblx0Yy5zZXRBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24oe1xuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdGhvbWVEaXJlY3Rvcnk6IGhvbWVkaXIoKSxcblx0XHR1c2VyTmFtZTogdXNlckluZm8oKS51c2VybmFtZSxcblx0fSk7XG5cdGMuY2xlYXJBaHBTbmFwc2hvdCgpO1xuXG5cdHJldHVybiBzZXNzaW9uVXJpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuQWhwU25hcHNob3RUZXN0KFxuXHRjOiBUZXN0UHJvdG9jb2xDbGllbnQsXG5cdGNvbmZpZzogSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnLFxuXHR0ZXN0OiBNb2NoYS5SdW5uYWJsZSxcblx0dHJhY2tpbmdMaXN0OiBzdHJpbmdbXSxcblx0dGVtcERpcnM6IHN0cmluZ1tdLFxuXHRvcHRpb25zPzogSUFocFNuYXBzaG90T3B0aW9ucyxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzY2VuYXJpbyA9IEFocFNuYXBzaG90U2NlbmFyaW8ubG9hZCh0ZXN0KTtcblx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhaHAtc25hcHNob3QtJykpO1xuXHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oYywgY29uZmlnLCBzY2VuYXJpby5jbGllbnRJZCwgdHJhY2tpbmdMaXN0LCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdGF3YWl0IHNjZW5hcmlvLnJ1bihjLCBzZXNzaW9uVXJpLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IHsgZGlzcGF0Y2hUdXJuLCBkaXNwYXRjaFR1cm5XaXRoQXR0YWNobWVudHMgfTtcblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIElucHV0IGFuc3dlciBoZWxwZXJzXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY2NlcHRlZEFuc3dlcnMocmVxdWVzdDogQ2hhdElucHV0UmVxdWVzdCk6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJlcXVlc3QucXVlc3Rpb25zPy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhyZXF1ZXN0LnF1ZXN0aW9ucy5tYXAocXVlc3Rpb24gPT4ge1xuXHRcdHN3aXRjaCAocXVlc3Rpb24ua2luZCkge1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dDpcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPz8gJ2ludGVyYWN0aXZlJyB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTnVtYmVyOlxuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuSW50ZWdlcjpcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLk51bWJlciwgdmFsdWU6IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA/PyBxdWVzdGlvbi5taW4gPz8gMSB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuQm9vbGVhbjpcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLkJvb2xlYW4sIHZhbHVlOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPz8gdHJ1ZSB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0Y2FzZSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0OiB7XG5cdFx0XHRcdC8vIEZvciBwbGFuLW1vZGUgcmV2aWV3cywgcHJlZmVyIGFwcHJvdmluZyB0aGUgcGxhbiBXSVRIT1VUXG5cdFx0XHRcdC8vIGF1dG8tZXhlY3V0aW5nIGl0IChgZXhpdF9vbmx5YCkgc28gdGhlIHR1cm4gZW5kcyBpbnN0ZWFkIG9mXG5cdFx0XHRcdC8vIGNvbnRpbnVpbmcgdG8gaW1wbGVtZW50IGluLXR1cm4gXHUyMDE0IHdoaWNoIHdvdWxkIHN1cmZhY2Vcblx0XHRcdFx0Ly8gdG9vbC1jYWxsIGNvbmZpcm1hdGlvbnMgdGhlIHBsYW5uaW5nIHRlc3QgYXNzZXJ0cyBhZ2FpbnN0LlxuXHRcdFx0XHQvLyBGYWxsIGJhY2sgdG8gYW4gYGludGVyYWN0aXZlYCBvcHRpb24sIHRoZW4gdGhlIHJlY29tbWVuZGVkXG5cdFx0XHRcdC8vIG9wdGlvbiwgdGhlbiB0aGUgZmlyc3QuXG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZE9wdGlvbiA9IHF1ZXN0aW9uLm9wdGlvbnMuZmluZChvcHRpb24gPT4gL2V4aXRfb25seS9pLnRlc3Qob3B0aW9uLmlkKSlcblx0XHRcdFx0XHQ/PyBxdWVzdGlvbi5vcHRpb25zLmZpbmQob3B0aW9uID0+IC9pbnRlcmFjdGl2ZS9pLnRlc3Qob3B0aW9uLmlkKSB8fCAvaW50ZXJhY3RpdmUvaS50ZXN0KG9wdGlvbi5sYWJlbCkpXG5cdFx0XHRcdFx0Pz8gcXVlc3Rpb24ub3B0aW9ucy5maW5kKG9wdGlvbiA9PiBvcHRpb24ucmVjb21tZW5kZWQpXG5cdFx0XHRcdFx0Pz8gcXVlc3Rpb24ub3B0aW9uc1swXTtcblx0XHRcdFx0cmV0dXJuIFtxdWVzdGlvbi5pZCwge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogcHJlZmVycmVkT3B0aW9uLmlkIH0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIENoYXRJbnB1dEFuc3dlcl07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENoYXRJbnB1dFF1ZXN0aW9uS2luZC5NdWx0aVNlbGVjdDoge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJyZWRPcHRpb25zID0gcXVlc3Rpb24ub3B0aW9ucy5maWx0ZXIob3B0aW9uID0+IG9wdGlvbi5yZWNvbW1lbmRlZCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkT3B0aW9ucyA9IHByZWZlcnJlZE9wdGlvbnMubGVuZ3RoID4gMCA/IHByZWZlcnJlZE9wdGlvbnMgOiBxdWVzdGlvbi5vcHRpb25zLnNsaWNlKDAsIDEpO1xuXHRcdFx0XHRyZXR1cm4gW3F1ZXN0aW9uLmlkLCB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogc2VsZWN0ZWRPcHRpb25zLm1hcChvcHRpb24gPT4gb3B0aW9uLmlkKSB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBDaGF0SW5wdXRBbnN3ZXJdO1xuXHRcdFx0fVxuXHRcdH1cblx0fSkpO1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gUmVzcG9uc2UgLyB0dXJuIGRyaXZlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1hcmtkb3duUmVzcG9uc2VUZXh0KGM6IFRlc3RQcm90b2NvbENsaWVudCk6IHN0cmluZyB7XG5cdGNvbnN0IG1hcmtkb3duUGFydElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBwaWVjZXM6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3Qgbm90aWZpY2F0aW9uIG9mIGMucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT5cblx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9yZXNwb25zZVBhcnQnKSB8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9kZWx0YScpXG5cdCkpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbjtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09ICdjaGF0L3Jlc3BvbnNlUGFydCcgJiYgYWN0aW9uLnBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bikge1xuXHRcdFx0bWFya2Rvd25QYXJ0SWRzLmFkZChhY3Rpb24ucGFydC5pZCk7XG5cdFx0XHRwaWVjZXMucHVzaChhY3Rpb24ucGFydC5jb250ZW50KTtcblx0XHR9IGVsc2UgaWYgKGFjdGlvbi50eXBlID09PSAnY2hhdC9kZWx0YScgJiYgbWFya2Rvd25QYXJ0SWRzLmhhcyhhY3Rpb24ucGFydElkKSkge1xuXHRcdFx0cGllY2VzLnB1c2goYWN0aW9uLmNvbnRlbnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcGllY2VzLmpvaW4oJycpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEcml2ZW5UdXJuUmVzdWx0IHtcblx0c2F3SW5wdXRSZXF1ZXN0OiBib29sZWFuO1xuXHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uOiBib29sZWFuO1xuXHRyZXNwb25zZVRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRyaXZlVHVyblRvQ29tcGxldGlvbihjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIpOiBQcm9taXNlPElEcml2ZW5UdXJuUmVzdWx0PiB7XG5cdHJldHVybiBkcml2ZVR1cm4oYywgc2Vzc2lvbiwgdHVybklkLCBjbGllbnRTZXEsICgpID0+IGRpc3BhdGNoVHVybihjLCBzZXNzaW9uLCB0dXJuSWQsIHRleHQsIGNsaWVudFNlcSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZHJpdmVUdXJuV2l0aEF0dGFjaG1lbnRzVG9Db21wbGV0aW9uKGM6IFRlc3RQcm90b2NvbENsaWVudCwgc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBhdHRhY2htZW50czogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgY2xpZW50U2VxOiBudW1iZXIpOiBQcm9taXNlPElEcml2ZW5UdXJuUmVzdWx0PiB7XG5cdHJldHVybiBkcml2ZVR1cm4oYywgc2Vzc2lvbiwgdHVybklkLCBjbGllbnRTZXEsICgpID0+IGRpc3BhdGNoVHVybldpdGhBdHRhY2htZW50cyhjLCBzZXNzaW9uLCB0dXJuSWQsIHRleHQsIGF0dGFjaG1lbnRzLCBjbGllbnRTZXEpKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZHJpdmVUdXJuKGM6IFRlc3RQcm90b2NvbENsaWVudCwgc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIsIGRpc3BhdGNoOiAoKSA9PiB2b2lkKTogUHJvbWlzZTxJRHJpdmVuVHVyblJlc3VsdD4ge1xuXHRjLmNsZWFyUmVjZWl2ZWQoKTtcblx0ZGlzcGF0Y2goKTtcblxuXHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblx0Y29uc3Qgc2Vlbk5vdGlmaWNhdGlvbnMgPSBuZXcgU2V0PG9iamVjdD4oKTtcblx0bGV0IG5leHRDbGllbnRTZXEgPSBjbGllbnRTZXEgKyAxO1xuXHRsZXQgc2F3SW5wdXRSZXF1ZXN0ID0gZmFsc2U7XG5cdGxldCBzYXdQZW5kaW5nQ29uZmlybWF0aW9uID0gZmFsc2U7XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjLndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoc2Vlbk5vdGlmaWNhdGlvbnMuaGFzKG4gYXMgb2JqZWN0KVxuXHRcdFx0XHR8fCAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKVxuXHRcdFx0XHRcdCYmICFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpXG5cdFx0XHRcdFx0JiYgIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdFx0JiYgIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJykpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZDtcblx0XHR9LCA5MF8wMDApO1xuXHRcdHNlZW5Ob3RpZmljYXRpb25zLmFkZChub3RpZmljYXRpb24gYXMgb2JqZWN0KTtcblxuXHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L2Vycm9yJykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBlcnJvciB3aGlsZSBkcml2aW5nICR7dHVybklkfWApO1xuXHRcdH1cblxuXHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRpZiAoIWFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0c2F3UGVuZGluZ0NvbmZpcm1hdGlvbiA9IHRydWU7XG5cdFx0XHRcdGMuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBuZXh0Q2xpZW50U2VxKyssXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpKSB7XG5cdFx0XHRzYXdJbnB1dFJlcXVlc3QgPSB0cnVlO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdElucHV0UmVxdWVzdGVkQWN0aW9uO1xuXHRcdFx0Yy5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksXG5cdFx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSsrLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGFjdGlvbi5yZXF1ZXN0LmlkLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0XHRcdGFuc3dlcnM6IGdldEFjY2VwdGVkQW5zd2VycyhhY3Rpb24ucmVxdWVzdCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24udHVybklkLCB0dXJuSWQpO1xuXHRcdGJyZWFrO1xuXHR9XG5cblx0cmV0dXJuIHsgc2F3SW5wdXRSZXF1ZXN0LCBzYXdQZW5kaW5nQ29uZmlybWF0aW9uLCByZXNwb25zZVRleHQ6IGdldE1hcmtkb3duUmVzcG9uc2VUZXh0KGMpIH07XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBBcHByb3ZhbC1sb29wIGhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIHRlcm1pbmFsUmVzb3VyY2VGcm9tQ29udGVudChjb250ZW50OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGVybWluYWxDb250ZW50ID0gY29udGVudC5maW5kKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwpO1xuXHRyZXR1cm4gdGVybWluYWxDb250ZW50Py5yZXNvdXJjZTtcbn1cblxuLyoqIENvbmNhdGVuYXRlcyB0aGUgdGV4dCBvZiBhbnkge0BsaW5rIFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0fSBwYXJ0cyBpbiBhIHRvb2wgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRleHRGcm9tQ29udGVudChjb250ZW50OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbnRlbnRcblx0XHQuZmlsdGVyKChjKTogYyBpcyBFeHRyYWN0PFRvb2xSZXN1bHRDb250ZW50LCB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0IH0+ID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpXG5cdFx0Lm1hcChjID0+IGMudGV4dClcblx0XHQuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIHRvb2xSZXN1bHRUZXh0KGNvbnRlbnQ6IHJlYWRvbmx5IFRvb2xSZXN1bHRDb250ZW50W10gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRpZiAoIWNvbnRlbnQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgdGVybWluYWxUZXh0czogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBwYXJ0IG9mIGNvbnRlbnQpIHtcblx0XHRpZiAocGFydC50eXBlICE9PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAocGFydC5yZXN1bHQ/LnByZXZpZXcpIHtcblx0XHRcdHRlcm1pbmFsVGV4dHMucHVzaChwYXJ0LnJlc3VsdC5wcmV2aWV3KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFt0ZXh0RnJvbUNvbnRlbnQoY29udGVudCksIC4uLnRlcm1pbmFsVGV4dHNdLmZpbHRlcih0ZXh0ID0+IHRleHQubGVuZ3RoID4gMCkuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVRvb2xSZXN1bHRUZXh0KHZhbHVlOiBzdHJpbmcsIHdvcmtzcGFjZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHdpdGhvdXRBbnNpID0gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKHZhbHVlKS5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJykucmVwbGFjZUFsbCgnXFxyJywgJ1xcbicpO1xuXHRsZXQgbm9ybWFsaXplZFdvcmtzcGFjZSA9IHdpdGhvdXRBbnNpO1xuXHRpZiAod29ya3NwYWNlKSB7XG5cdFx0bm9ybWFsaXplZFdvcmtzcGFjZSA9IG5vcm1hbGl6ZWRXb3Jrc3BhY2Vcblx0XHRcdC5yZXBsYWNlQWxsKHJlYWxwYXRoU3luYyh3b3Jrc3BhY2UpLCAnJHt3b3JrZGlyfScpXG5cdFx0XHQucmVwbGFjZUFsbCh3b3Jrc3BhY2UsICcke3dvcmtkaXJ9Jyk7XG5cdH1cblx0cmV0dXJuIG5vcm1hbGl6ZWRXb3Jrc3BhY2UucmVwbGFjZUFsbCgnXFxcXCcsICcvJykudHJpbSgpO1xufVxuXG4vKiogQXNzZXJ0cyBkZXRlcm1pbmlzdGljIGNvbnRlbnQgZnJvbSBhIGNvbXBsZXRlZCB0b29sIGNhbGwgaW5zdGVhZCBvZiB0cnVzdGluZyByZXBsYXllZCBhc3Npc3RhbnQgcHJvc2UuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoXG5cdGNsaWVudDogVGVzdFByb3RvY29sQ2xpZW50LFxuXHRvcHRpb25zOiB7IHJlYWRvbmx5IGNoYW5uZWw6IHN0cmluZzsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmc7IHJlYWRvbmx5IHRvb2xOYW1lczogcmVhZG9ubHkgc3RyaW5nW107IHJlYWRvbmx5IHdvcmtzcGFjZT86IHN0cmluZzsgcmVhZG9ubHkgZXhwZWN0ZWQ6IHJlYWRvbmx5IFJlZ0V4cFtdOyByZWFkb25seSBzdWNjZXNzPzogYm9vbGVhbiB9LFxuKTogdm9pZCB7XG5cdGNvbnN0IHRvb2xOYW1lcyA9IG5ldyBTZXQob3B0aW9ucy50b29sTmFtZXMubWFwKG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWVGb3JDYXB0dXJlKSk7XG5cdGNvbnN0IHN0YXJ0cyA9IGNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpXG5cdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24gfSkpXG5cdFx0LmZpbHRlcigoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IG9wdGlvbnMuY2hhbm5lbCAmJiBhY3Rpb24udHVybklkID09PSBvcHRpb25zLnR1cm5JZCAmJiB0b29sTmFtZXMuaGFzKG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWVGb3JDYXB0dXJlKGFjdGlvbi50b29sTmFtZSkpKTtcblx0Y29uc3Qgc3RhcnRlZFRvb2xDYWxsSWRzID0gbmV3IFNldChzdGFydHMubWFwKCh7IGFjdGlvbiB9KSA9PiBhY3Rpb24udG9vbENhbGxJZCkpO1xuXHRjb25zdCBjb21wbGV0aW9ucyA9IGNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykpXG5cdFx0Lm1hcChuID0+ICh7IGVudmVsb3BlOiBnZXRBY3Rpb25FbnZlbG9wZShuKSwgYWN0aW9uOiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gfSkpXG5cdFx0LmZpbHRlcigoeyBlbnZlbG9wZSwgYWN0aW9uIH0pID0+IGVudmVsb3BlLmNoYW5uZWwgPT09IG9wdGlvbnMuY2hhbm5lbCAmJiBhY3Rpb24udHVybklkID09PSBvcHRpb25zLnR1cm5JZCAmJiBzdGFydGVkVG9vbENhbGxJZHMuaGFzKGFjdGlvbi50b29sQ2FsbElkKSk7XG5cdGNvbnN0IG9ic2VydmVkOiB7IHRvb2xDYWxsSWQ6IHN0cmluZzsgc3VjY2VzczogYm9vbGVhbjsgdGV4dDogc3RyaW5nIH1bXSA9IFtdO1xuXHRsZXQgbWF0Y2hpbmdDb21wbGV0aW9uOiBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCB7IGFjdGlvbiB9IG9mIGNvbXBsZXRpb25zKSB7XG5cdFx0aWYgKG9wdGlvbnMuc3VjY2VzcyAhPT0gdW5kZWZpbmVkICYmIGFjdGlvbi5yZXN1bHQuc3VjY2VzcyAhPT0gb3B0aW9ucy5zdWNjZXNzKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IG5vcm1hbGl6ZVRvb2xSZXN1bHRUZXh0KHRvb2xSZXN1bHRUZXh0KGFjdGlvbi5yZXN1bHQuY29udGVudCksIG9wdGlvbnMud29ya3NwYWNlKTtcblx0XHRvYnNlcnZlZC5wdXNoKHsgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIHN1Y2Nlc3M6IGFjdGlvbi5yZXN1bHQuc3VjY2VzcywgdGV4dCB9KTtcblx0XHRpZiAob3B0aW9ucy5leHBlY3RlZC5ldmVyeShleHBlY3RlZCA9PiBleHBlY3RlZC50ZXN0KHRleHQpKSkge1xuXHRcdFx0bWF0Y2hpbmdDb21wbGV0aW9uID0gYWN0aW9uO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdGFzc2VydC5vayhtYXRjaGluZ0NvbXBsZXRpb24sIGBleHBlY3RlZCAke29wdGlvbnMudHVybklkfSB0byBjb21wbGV0ZSAke29wdGlvbnMudG9vbE5hbWVzLmpvaW4oJy8nKX0gd2l0aCByZXN1bHQgdGV4dCBtYXRjaGluZyAke29wdGlvbnMuZXhwZWN0ZWQubWFwKFN0cmluZykuam9pbignLCAnKX07IG9ic2VydmVkICR7b2JzZXJ2ZWQubWFwKHZhbHVlID0+IEpTT04uc3RyaW5naWZ5KHZhbHVlKSkuam9pbignLCAnKX1gKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRlcm1pbmFsVGV4dChzdGF0ZTogVGVybWluYWxTdGF0ZSk6IHN0cmluZyB7XG5cdHJldHVybiByZW1vdmVBbnNpRXNjYXBlQ29kZXMoc3RhdGUuY29udGVudC5tYXAocGFydCA9PiBwYXJ0LnR5cGUgPT09ICdjb21tYW5kJyA/IGAke3BhcnQuY29tbWFuZExpbmV9XFxuJHtwYXJ0Lm91dHB1dH1gIDogcGFydC52YWx1ZSkuam9pbignJykpO1xufVxuXG4vKiogTG9va3MgdXAgdGhlIHRvb2xOYW1lIGZvciBhIHRvb2xDYWxsUmVhZHkgYnkgam9pbmluZyBhZ2FpbnN0IHRoZSBtYXRjaGluZyB0b29sQ2FsbFN0YXJ0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRUb29sTmFtZUZvckNhbGwoYzogVGVzdFByb3RvY29sQ2xpZW50LCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gYy5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpXG5cdFx0Lm1hcChuID0+IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbilcblx0XHQuZmluZChhID0+IGEudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCk/LnRvb2xOYW1lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBcHByb3ZhbFJ1bGUge1xuXHRyZWFkb25seSB0b29sTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBtYXRjaElucHV0PzogKHRvb2xJbnB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBpbnNwZWN0PzogKGluZm86IHsgYWN0aW9uOiBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbjsgZXJyb3JzOiBzdHJpbmdbXSB9KSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCYWNrZ3JvdW5kQXBwcm92YWxMb29wT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFwcHJvdmFsU2VxU3RhcnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgYWxsb3c6IHJlYWRvbmx5IElBcHByb3ZhbFJ1bGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQmFja2dyb3VuZEFwcHJvdmFsTG9vcCB7XG5cdHJlYWRvbmx5IGVycm9yczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGFwcHJvdmVkVG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+O1xuXHRyZWFkb25seSBvYnNlcnZlZFRvb2xOYW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0c3RvcCgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKipcbiAqIEF1dG8tYXBwcm92ZXMgcGVuZGluZyB0b29sLWNhbGwgY29uZmlybWF0aW9ucyB0aGF0IG1hdGNoIHRoZSBzdXBwbGllZFxuICogYWxsb3ctbGlzdC4gQW55dGhpbmcgb3V0c2lkZSB0aGUgYWxsb3ctbGlzdCBpcyBkZW5pZWQgYW5kIHJlY29yZGVkIGFzIGFuXG4gKiBlcnJvciBzbyB0aGUgdGVzdCBmYWlscyBsb3VkbHkgaW5zdGVhZCBvZiBzaWxlbnRseSBhcHByb3ZpbmcgbW9kZWwtY2hvc2VuXG4gKiB0b29sIGNhbGxzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRCYWNrZ3JvdW5kQXBwcm92YWxMb29wKGM6IFRlc3RQcm90b2NvbENsaWVudCwgb3B0aW9uczogSUJhY2tncm91bmRBcHByb3ZhbExvb3BPcHRpb25zKTogSUJhY2tncm91bmRBcHByb3ZhbExvb3Age1xuXHRjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGFwcHJvdmVkVG9vbE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IG9ic2VydmVkVG9vbE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHByb2Nlc3NlZFNlcXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0bGV0IGFjdGl2ZSA9IHRydWU7XG5cdGxldCBhcHByb3ZhbFNlcSA9IG9wdGlvbnMuYXBwcm92YWxTZXFTdGFydDtcblxuXHRjb25zdCBsb29wID0gKGFzeW5jICgpID0+IHtcblx0XHR3aGlsZSAoYWN0aXZlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZWFkeSA9IGF3YWl0IGMud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gIXByb2Nlc3NlZFNlcXMuaGFzKGdldEFjdGlvbkVudmVsb3BlKG4pLnNlcnZlclNlcSk7XG5cdFx0XHRcdH0sIDJfMDAwKTtcblx0XHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBnZXRBY3Rpb25FbnZlbG9wZShyZWFkeSk7XG5cdFx0XHRcdHByb2Nlc3NlZFNlcXMuYWRkKGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbjtcblx0XHRcdFx0aWYgKGFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRvb2xOYW1lID0gZmluZFRvb2xOYW1lRm9yQ2FsbChjLCBhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHRcdGlmICh0b29sTmFtZSkge1xuXHRcdFx0XHRcdG9ic2VydmVkVG9vbE5hbWVzLmFkZCh0b29sTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdSdWxlID0gb3B0aW9ucy5hbGxvdy5maW5kKHJ1bGUgPT5cblx0XHRcdFx0XHRydWxlLnRvb2xOYW1lID09PSB0b29sTmFtZVxuXHRcdFx0XHRcdCYmIChydWxlLm1hdGNoSW5wdXQ/LihhY3Rpb24udG9vbElucHV0KSA/PyB0cnVlKSk7XG5cblx0XHRcdFx0aWYgKCFtYXRjaGluZ1J1bGUpIHtcblx0XHRcdFx0XHRlcnJvcnMucHVzaChgdW5leHBlY3RlZCB0b29sIGNhbGw6IHRvb2xOYW1lPSR7dG9vbE5hbWUgPz8gJzx1bmtub3duPid9IGlucHV0PSR7SlNPTi5zdHJpbmdpZnkoYWN0aW9uLnRvb2xJbnB1dCl9YCk7XG5cdFx0XHRcdFx0Yy5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0XHRjaGFubmVsOiBlbnZlbG9wZS5jaGFubmVsLFxuXHRcdFx0XHRcdFx0Y2xpZW50U2VxOiArK2FwcHJvdmFsU2VxLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGFjdGlvbi50dXJuSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hdGNoaW5nUnVsZS5pbnNwZWN0Py4oeyBhY3Rpb24sIGVycm9ycyB9KTtcblx0XHRcdFx0YXBwcm92ZWRUb29sTmFtZXMuYWRkKG1hdGNoaW5nUnVsZS50b29sTmFtZSk7XG5cblx0XHRcdFx0Yy5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogZW52ZWxvcGUuY2hhbm5lbCxcblx0XHRcdFx0XHRjbGllbnRTZXE6ICsrYXBwcm92YWxTZXEsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZDogYWN0aW9uLnR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuXHRcdFx0XHQvLyBFeHBlY3RlZDogdGhlIDItc2Vjb25kIHBvbGwncyBgVGltZW91dCB3YWl0aW5nIGZvciBub3RpZmljYXRpb25gLlxuXHRcdFx0XHQvLyBBbnl0aGluZyBlbHNlIChlLmcuICdDbGllbnQgY2xvc2VkJywgZXhjZXB0aW9uIGZyb21cblx0XHRcdFx0Ly8gYG1hdGNoaW5nUnVsZS5pbnNwZWN0YCkgaXMgYSByZWFsIGZhaWx1cmUgXHUyMDE0IHJlY29yZCBpdCBzbyB0aGVcblx0XHRcdFx0Ly8gdGVzdCBmYWlscyBkZXRlcm1pbmlzdGljYWxseS5cblx0XHRcdFx0aWYgKCEvdGltZW91dC9pLnRlc3QobXNnKSkge1xuXHRcdFx0XHRcdGVycm9ycy5wdXNoKGBhcHByb3ZhbCBsb29wIGVycm9yOiAke21zZ31gKTtcblx0XHRcdFx0XHRhY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSkoKTtcblxuXHRyZXR1cm4ge1xuXHRcdGVycm9ycywgYXBwcm92ZWRUb29sTmFtZXMsIG9ic2VydmVkVG9vbE5hbWVzLFxuXHRcdGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRhY3RpdmUgPSBmYWxzZTtcblx0XHRcdGF3YWl0IGxvb3A7XG5cdFx0fSxcblx0fTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIFNlcnZlciBsZWFzZVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGFnZW50IGhvc3Qgc2VydmVyICsgY29ubmVjdGVkIGNsaWVudCBsaWZlY3ljbGUgZm9yIG9uZSBlMmUgdGVzdCxcbiAqIGhpZGluZyB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHR3byBzdHJhdGVnaWVzOlxuICpcbiAqIC0gKipQZXItdGVzdCoqIChhbHdheXMgd2hpbGUgcmVjb3JkaW5nKTogc3RhcnQgYSBmcmVzaCBzZXJ2ZXIgKyBwcm94eSBmb3JcbiAqICAgZWFjaCB0ZXN0IGFuZCBraWxsIGl0IGluIHRlYXJkb3duLiBGdWxsIGlzb2xhdGlvbjsgZXZlcnkgdGVzdCBwYXlzIHNlcnZlclxuICogICBmb3JrICsgcHJvdmlkZXIgU0RLIGNsaWVudCBzdGFydHVwLlxuICogLSAqKlNoYXJlZCoqICh0aGUgZGVmYXVsdCBpbiByZXBsYXkpOiBzdGFydCB0aGUgc2VydmVyICsgcHJveHkgb25jZSwgdGhlbiBzd2FwXG4gKiAgIHRoZSBwZXItdGVzdCBmaXh0dXJlIHZpYSB7QGxpbmsgQ2FwaVJlcGxheVByb3h5LnJlc2V0Rm9yUmVwbGF5fSBhbmQgcmVjb25uZWN0XG4gKiAgIGEgZnJlc2ggY2xpZW50IGVhY2ggdGVzdC4gVGhlIGFnZW50IGhvc3QncyBjYWNoZWQgU0RLIGNsaWVudCAvIENMSSBzdWJwcm9jZXNzXG4gKiAgIGlzIHJldXNlZCwgc28gb25seSB0aGUgZmlyc3QgdGVzdCBwYXlzIHRoYXQgc3RhcnR1cC4gU2FmZSBhcyBsb25nIGFzIG5vIHRlc3RcbiAqICAgcmV0dXJucyBtaWQtdHVybjogb25lIHNlcnZlclxuICogICBzZXJ2ZXMgZXZlcnkgdGVzdCwgc28gYSB0dXJuIGxlZnQgaW4gZmxpZ2h0IHdvdWxkIGxlYWsgaXRzIGNvbnRpbnVhdGlvbiBpbnRvXG4gKiAgIHRoZSBuZXh0IHRlc3QncyBmaXh0dXJlIHdpbmRvdyBhcyBhIHN0cmljdCBjYWNoZSBtaXNzLlxuICpcbiAqIEJvdGggc3RyYXRlZ2llcyBkaXNwb3NlIGVhY2ggdGVzdCdzIHNlc3Npb25zIChhYm9ydC1maXJzdCwgdGhlblxuICogYGRpc3Bvc2VTZXNzaW9uYCkgYW5kIHZlcmlmeSB0aGUgcmVwbGF5IHRyYWZmaWM7IHRoZSBzaGFyZWQgc3RyYXRlZ3kgdmVyaWZpZXNcbiAqIHdpdGhvdXQgc3RvcHBpbmcgdGhlIHNlcnZlciBzbyB0aGUgbmV4dCB0ZXN0IGNhbiByZXVzZSBpdC5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEUyRVNlcnZlckxlYXNlIHtcblx0cHJpdmF0ZSBfc2VydmVyOiBJU2VydmVySGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hhcmVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9kYXRhRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgKiptb2RlbC1iYWNrZWQqKiB0ZXN0cyBzZXJ2ZWQgYnkgdGhlIGN1cnJlbnQgc2hhcmVkIHNlcnZlci4gQVxuXHQgKiBzaW5nbGUgbG9uZy1saXZlZCBob3N0IGNhY2hlcyBvbmUgcHJvdmlkZXIgU0RLL0NMSSBzdWJwcm9jZXNzIGFuZCByZXVzZXMgaXRcblx0ICogYWNyb3NzIGV2ZXJ5IHRlc3Q7IGFmdGVyIGVub3VnaCBtb2RlbC1kcml2ZW4gdHVybnMgdGhhdCBzdWJwcm9jZXNzIGNhblxuXHQgKiBhY2N1bXVsYXRlIHN0YXRlIGFuZCBldmVudHVhbGx5IHdlZGdlIGEgdHVybiAodHVybiBzdGFydHMsIGJ1dCBubyBtb2RlbFxuXHQgKiByZXNwb25zZSBhcnJpdmVzIGV2ZW4gdGhvdWdoIHJlcGxheSBpcyBpbnN0YW50KS4gUmVjeWNsaW5nIHRoZSBzZXJ2ZXIgd2VsbFxuXHQgKiBiZWZvcmUgdGhhdCBrZWVwcyBlYWNoIGhvc3QgaW5zdGFuY2Ugd2l0aGluIGl0cyByZWxpYWJsZSByYW5nZSB3aGlsZSBzdGlsbFxuXHQgKiBhbW9ydGl6aW5nIHN0YXJ0dXAuXG5cdCAqL1xuXHRwcml2YXRlIF9tb2RlbEJhY2tlZFRlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0cHJpdmF0ZSBfdGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPSAwO1xuXHRwcml2YXRlIF9jbGVhbnVwQ2xpZW50U2VxID0gMV8wMDBfMDAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydE9wdGlvbnM6IHsgcmVhZG9ubHkgY2xhdWRlU2RrUm9vdD86IHN0cmluZzsgcmVhZG9ubHkgY29kZXhTZGtSb290Pzogc3RyaW5nOyByZWFkb25seSBob21lRGlyOiBzdHJpbmc7IHJlYWRvbmx5IHVzZXJEYXRhRGlyOiBzdHJpbmcgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0OiBJQWdlbnRIb3N0VGFyZ2V0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZzogSUFnZW50SG9zdEUyRVByb3ZpZGVyQ29uZmlnLFxuXHRcdHN0YXJ0T3B0aW9uczogeyByZWFkb25seSBjbGF1ZGVTZGtSb290Pzogc3RyaW5nOyByZWFkb25seSBjb2RleFNka1Jvb3Q/OiBzdHJpbmc7IHJlYWRvbmx5IHRhcmdldD86IElBZ2VudEhvc3RUYXJnZXQgfSA9IHt9LFxuXHQpIHtcblx0XHRjb25zdCBkYXRhRGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ3ZzY29kZS1hZ2VudC1ob3N0LWUyZS0nKSk7XG5cdFx0dGhpcy5fZGF0YURpciA9IGRhdGFEaXI7XG5cdFx0dGhpcy5fdGFyZ2V0ID0gc3RhcnRPcHRpb25zLnRhcmdldCA/PyBkZWZhdWx0QWdlbnRIb3N0VGFyZ2V0O1xuXHRcdHRoaXMuX3N0YXJ0T3B0aW9ucyA9IHtcblx0XHRcdGNsYXVkZVNka1Jvb3Q6IHN0YXJ0T3B0aW9ucy5jbGF1ZGVTZGtSb290LFxuXHRcdFx0Y29kZXhTZGtSb290OiBzdGFydE9wdGlvbnMuY29kZXhTZGtSb290LFxuXHRcdFx0aG9tZURpcjogZGF0YURpcixcblx0XHRcdHVzZXJEYXRhRGlyOiBqb2luKGRhdGFEaXIsICd1c2VyLWRhdGEnKSxcblx0XHR9O1xuXHRcdC8vIFNlcnZlciByZXVzZSBpcyBhIHJlcGxheS1vbmx5IG9wdGltaXphdGlvbjogcmVjb3JkaW5nIHdyaXRlcyBvbmUgZml4dHVyZVxuXHRcdC8vIHBlciBwcm94eSBhbmQgc28gbmVlZHMgYSBmcmVzaCBwcm94eSAoaGVuY2UgYSBmcmVzaCBzZXJ2ZXIpIHBlciB0ZXN0LlxuXHRcdC8vIEluIHJlcGxheSBpdCBpcyBhbHdheXMgc2FmZSBiZWNhdXNlIGV2ZXJ5IHRlc3QgZHJhaW5zIGl0cyB0dXJucywgc28gdGhlXG5cdFx0Ly8gcmV1c2VkIHNlcnZlciBjYXJyaWVzIG5vIGluLWZsaWdodCB3b3JrIGFjcm9zcyB0ZXN0cy5cblx0XHR0aGlzLl9zaGFyZWQgPSAhUkVDT1JEO1xuXHR9XG5cblx0LyoqIEFjcXVpcmUgYSBzZXJ2ZXIgKyBjb25uZWN0ZWQgY2xpZW50IGZvciBhIHRlc3QsIHJldHVybmluZyBib3RoLiAqL1xuXHRhc3luYyBhY3F1aXJlKHRlc3RUaXRsZTogc3RyaW5nLCBtb2RlbFRyYWZmaWM6IEFnZW50SG9zdEUyRU1vZGVsVHJhZmZpYyA9ICdyZWNvcmRlZCcpOiBQcm9taXNlPHsgc2VydmVyOiBJU2VydmVySGFuZGxlOyBjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudCB9PiB7XG5cdFx0Y29uc3QgY2FwaVJlcGxheSA9IGNhcGlSZXBsYXlGb3IodGhpcy5fY29uZmlnLnByb3ZpZGVyLCB0ZXN0VGl0bGUsIG1vZGVsVHJhZmZpYyk7XG5cdFx0Ly8gQm91bmQgYm90aCBwcm92aWRlci1tb2RlbCBsb2FkIGFuZCBob3N0LW93bmVkIHJlc291cmNlIGFjY3VtdWxhdGlvbi5cblx0XHRpZiAodGhpcy5fc2hhcmVkICYmIHRoaXMuX3NlcnZlciAmJiAoXG5cdFx0XHR0aGlzLl90ZXN0c09uQ3VycmVudFNlcnZlciA+PSBNQVhfVEVTVFNfUEVSX1NIQVJFRF9TRVJWRVJcblx0XHRcdHx8IHRoaXMuX21vZGVsQmFja2VkVGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPj0gTUFYX01PREVMX0JBQ0tFRF9URVNUU19QRVJfU0hBUkVEX1NFUlZFUlxuXHRcdCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlY3ljbGVTaGFyZWRTZXJ2ZXIoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3NoYXJlZCAmJiB0aGlzLl9zZXJ2ZXIpIHtcblx0XHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fc2VydmVyLmNhcGlSZXBsYXk7XG5cdFx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignW2FnZW50LWhvc3QtZTJlXSBzaGFyZWQgcmVwbGF5IHNlcnZlciBoYXMgbm8gY2FwaVJlcGxheSBwcm94eSB0byByZXNldCcpO1xuXHRcdFx0fVxuXHRcdFx0cHJveHkucmVzZXRGb3JSZXBsYXkoY2FwaVJlcGxheS5maXh0dXJlUGF0aCwgY2FwaVJlcGxheS5hbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gT25seSB0aGUgQ29waWxvdCBDTEkgcHJvdmlkZXIgd3JpdGVzIHRoZSBgQGdpdGh1Yi9jb3BpbG90YCBydW50aW1lIGxvZ3Mgd2Vcblx0XHRcdC8vIGNhcHR1cmUsIHNvIG9ubHkgaXQgaXMgcnVuIHZlcmJvc2VseTsgQ2xhdWRlL0NvZGV4IHVzZSB0aGVpciBvd24gcnVudGltZXMuXG5cdFx0XHR0aGlzLl9zZXJ2ZXIgPSBhd2FpdCB0aGlzLl90YXJnZXQubGF1bmNoKHsgLi4udGhpcy5fc3RhcnRPcHRpb25zLCBjYXBpUmVwbGF5LCBsb2dMZXZlbDogdGhpcy5faXNDb3BpbG90UHJvdmlkZXIgPyAndHJhY2UnIDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0dGhpcy5fbW9kZWxCYWNrZWRUZXN0c09uQ3VycmVudFNlcnZlciA9IDA7XG5cdFx0XHR0aGlzLl90ZXN0c09uQ3VycmVudFNlcnZlciA9IDA7XG5cdFx0fVxuXHRcdHRoaXMuX3Rlc3RzT25DdXJyZW50U2VydmVyKys7XG5cdFx0aWYgKG1vZGVsVHJhZmZpYyA9PT0gJ3JlY29yZGVkJykge1xuXHRcdFx0dGhpcy5fbW9kZWxCYWNrZWRUZXN0c09uQ3VycmVudFNlcnZlcisrO1xuXHRcdH1cblx0XHR0aGlzLl9jbGllbnQgPSBuZXcgVGVzdFByb3RvY29sQ2xpZW50KFxuXHRcdFx0dGhpcy5fc2VydmVyLnBvcnQsXG5cdFx0XHQoKSA9PiB0aGlzLl9zZXJ2ZXI/LmNhcGlSZXBsYXk/LnRha2VSZXBsYXlFcnJvcigpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSA9PiB0aGlzLl9zZXJ2ZXI/LmNhcGlSZXBsYXk/LnNldFdvcmtpbmdEaXJlY3Rvcnkod29ya2luZ0RpcmVjdG9yeSksXG5cdFx0KTtcblx0XHRhd2FpdCB0aGlzLl9jbGllbnQuY29ubmVjdCgpO1xuXHRcdHJldHVybiB7IHNlcnZlcjogdGhpcy5fc2VydmVyLCBjbGllbnQ6IHRoaXMuX2NsaWVudCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW4gYW4gYWRkaXRpb25hbCBjb25uZWN0aW9uIHRvIHRoZSBjdXJyZW50IHNlcnZlci5cblx0ICpcblx0ICogYHJlY29ubmVjdGAgaXMgb25seSBhbnN3ZXJhYmxlIG9uIGEgdHJhbnNwb3J0IHRoYXQgaGFzIG5vdCBjb21wbGV0ZWQgdGhlXG5cdCAqIGhhbmRzaGFrZSwgc28gYSB0ZXN0IHRoYXQgZXhlcmNpc2VzIGNvbm5lY3Rpb24gcmVjb3ZlcnkgbmVlZHMgYSBzZWNvbmRcblx0ICogc29ja2V0IGl0IGNhbiBjbG9zZSBhbmQgcmUtZXN0YWJsaXNoIHdpdGhvdXQgZGlzdHVyYmluZyB0aGUgc2hhcmVkXG5cdCAqIGNsaWVudC4gVGhlIGNhbGxlciBvd25zIHRoZSByZXR1cm5lZCBjbGllbnQgYW5kIG11c3QgY2xvc2UgaXQuXG5cdCAqL1xuXHRhc3luYyBjb25uZWN0Q2xpZW50KCk6IFByb21pc2U8VGVzdFByb3RvY29sQ2xpZW50PiB7XG5cdFx0aWYgKCF0aGlzLl9zZXJ2ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignW2FnZW50LWhvc3QtZTJlXSBubyBzZXJ2ZXIgYWNxdWlyZWQgeWV0Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0UHJvdG9jb2xDbGllbnQodGhpcy5fc2VydmVyLnBvcnQpO1xuXHRcdGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0cmV0dXJuIGNsaWVudDtcblx0fVxuXG5cdC8qKiBTdG9wIHRoZSBjdXJyZW50IHNoYXJlZCBzZXJ2ZXIgc28gdGhlIG5leHQge0BsaW5rIGFjcXVpcmV9IHN0YXJ0cyBhIGZyZXNoIG9uZS4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVjeWNsZVNoYXJlZFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2VydmVyPy5jYXBpUmVwbGF5Py5jbG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzdG9wU2VydmVyKHRoaXMuX3NlcnZlcik7XG5cdFx0XHR0aGlzLl9zZXJ2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9tb2RlbEJhY2tlZFRlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHRcdHRoaXMuX3Rlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHR9XG5cdH1cblxuXHRnZXQgb2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9zZXJ2ZXI/LmNhcGlSZXBsYXk/Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzID8/IFtdO1xuXHR9XG5cblx0LyoqIFRoZSBidW5kbGVkIGBAZ2l0aHViL2NvcGlsb3RgIENMSSBpcyB0aGUgb25seSBwcm92aWRlciB3aG9zZSBydW50aW1lIGxvZ3Mgd2UgY2FwdHVyZSAvIHJ1biB2ZXJib3NlbHkuICovXG5cdHByaXZhdGUgZ2V0IF9pc0NvcGlsb3RQcm92aWRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLnByb3ZpZGVyID09PSAnY29waWxvdGNsaSc7XG5cdH1cblxuXHQvKipcblx0ICogVGFpbCB0aGUgbW9zdCByZWNlbnQgQ29waWxvdCBydW50aW1lIChgQGdpdGh1Yi9jb3BpbG90YCBDTEkpIGBwcm9jZXNzLSoubG9nYFxuXHQgKiBpbnRvIHRoZSB0ZXN0IG91dHB1dC4gVGhpcyBpcyB0aGUgU0RLL0NMSSdzIG93biBkaWFnbm9zdGljcyBcdTIwMTQgdGhlIGtleSBzaWduYWxcblx0ICogd2hlbiBhIHR1cm4gaGFuZ3Mgb3IgdGltZXMgb3V0LCB3aGljaCB0aGUgQUhQIGFzc2VydGlvbnMgYWxvbmUgZG9uJ3QgZXhwbGFpbi5cblx0ICogVGhlIHJ1bnRpbWUgd3JpdGVzIHRoZXNlIHVuZGVyIGAke0NPUElMT1RfSE9NRX0vbG9nc2AsIGFuZCB0aGUgaGFybmVzcyBwaW5zXG5cdCAqIGBDT1BJTE9UX0hPTUVgIHRvIGAke2hvbWVEaXJ9Ly5jb3BpbG90YCAoc2VlIGBzdGFydFJlYWxTZXJ2ZXJgKSwgcnVubmluZyBpdFxuXHQgKiBhdCBgdHJhY2VgLiBPbmx5IHRoZSBDb3BpbG90IENMSSBwcm92aWRlciBpcyBjYXB0dXJlZCBcdTIwMTQgQ2xhdWRlL0NvZGV4IHVzZSB0aGVpclxuXHQgKiBvd24gcnVudGltZXMgYW5kIGxvZyBlbHNld2hlcmUuIEJlc3QtZWZmb3J0OiBuZXZlciB0aHJvd3MgKGl0IHJ1bnMgaW4gYVxuXHQgKiBgdGVhcmRvd25gLCByaWdodCBiZWZvcmUgdGhlIGZhaWx1cmUgaXMgcmUtcmFpc2VkKS4gT3V0cHV0IGdvZXMgdG9cblx0ICogYHByb2Nlc3Muc3Rkb3V0YCBkaXJlY3RseSAobm90IGBjb25zb2xlLipgKTogdGhlIGludGVncmF0aW9uIGhhcm5lc3Mgb3ZlcnJpZGVzXG5cdCAqIGBjb25zb2xlLipgIGFuZCBmYWlscyB0aGUgdGVzdCBvbiBBTlkgdW5leHBlY3RlZCBjb25zb2xlIG91dHB1dCBkdXJpbmcgYSB0ZXN0LFxuXHQgKiBhbmQgYGN1cnJlbnRUZXN0YCBpcyBzdGlsbCBzZXQgZHVyaW5nIGB0ZWFyZG93bmAuXG5cdCAqL1xuXHRkdW1wUnVudGltZUxvZ3NPbkZhaWx1cmUobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNDb3BpbG90UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvZ3NEaXIgPSBqb2luKHRoaXMuX3N0YXJ0T3B0aW9ucy5ob21lRGlyLCAnLmNvcGlsb3QnLCAnbG9ncycpO1xuXHRcdFx0bGV0IGVudHJpZXM6IHN0cmluZ1tdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZW50cmllcyA9IHJlYWRkaXJTeW5jKGxvZ3NEaXIpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIE5vIGxvZyBkaXIgYXQgYWxsIFx1MjAxNCB0aGUgQ0xJIG5ldmVyIHNwYXduZWQuIFRoYXQgaXRzZWxmIGlzIGEgc2lnbmFsLlxuXHRcdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZShgW2FnZW50LWhvc3QtZTJlXSBubyBDb3BpbG90IHJ1bnRpbWUgbG9ncyBmb3IgZmFpbGVkIHRlc3QgXCIke2xhYmVsfVwiIChDTEkgbmV2ZXIgc3Bhd25lZDsgJHtsb2dzRGlyfSBhYnNlbnQpXFxuYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld2VzdCA9IGVudHJpZXNcblx0XHRcdFx0LmZpbHRlcihuYW1lID0+IC9ecHJvY2Vzcy0uKlxcLmxvZyQvLnRlc3QobmFtZSkpXG5cdFx0XHRcdC5tYXAobmFtZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZnVsbCA9IGpvaW4obG9nc0RpciwgbmFtZSk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGZ1bGwsIG10aW1lTXM6IHN0YXRTeW5jKGZ1bGwpLm10aW1lTXMgfTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0XHQuZmlsdGVyKCh2KTogdiBpcyB7IGZ1bGw6IHN0cmluZzsgbXRpbWVNczogbnVtYmVyIH0gPT4gdiAhPT0gdW5kZWZpbmVkKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYi5tdGltZU1zIC0gYS5tdGltZU1zKVswXTtcblx0XHRcdGlmICghbmV3ZXN0KSB7XG5cdFx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKGBbYWdlbnQtaG9zdC1lMmVdIG5vIENvcGlsb3QgcnVudGltZSBwcm9jZXNzLSoubG9nIGZvciBmYWlsZWQgdGVzdCBcIiR7bGFiZWx9XCIgdW5kZXIgJHtsb2dzRGlyfVxcbmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lcyA9IHJlYWRGaWxlU3luYyhuZXdlc3QuZnVsbCwgJ3V0ZjgnKS5zcGxpdCgvXFxyP1xcbi8pO1xuXHRcdFx0Y29uc3QgdGFpbCA9IGxpbmVzLnNsaWNlKC0yMDApO1xuXHRcdFx0cHJvY2Vzcy5zdGRvdXQud3JpdGUoYFthZ2VudC1ob3N0LWUyZV0gLS0tIENvcGlsb3QgcnVudGltZSBsb2cgZm9yIGZhaWxlZCB0ZXN0IFwiJHtsYWJlbH1cIiAoJHtuZXdlc3QuZnVsbH07IGxhc3QgJHt0YWlsLmxlbmd0aH0gb2YgJHtsaW5lcy5sZW5ndGh9IGxpbmVzKSAtLS1cXG5gKTtcblx0XHRcdGZvciAoY29uc3QgbG4gb2YgdGFpbCkge1xuXHRcdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZShgW2FnZW50LWhvc3QtZTJlXSAjICR7bG59XFxuYCk7XG5cdFx0XHR9XG5cdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZSgnW2FnZW50LWhvc3QtZTJlXSAtLS0gZW5kIENvcGlsb3QgcnVudGltZSBsb2cgLS0tXFxuJyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBuZXZlciBsZXQgZGlhZ25vc3RpY3MgYnJlYWsgdGVhcmRvd25cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVsZWFzZSBhIHRlc3Q6IGRpc3Bvc2UgaXRzIHNlc3Npb25zLCBkaXNjb25uZWN0IHRoZSBjbGllbnQsIGFuZCB2ZXJpZnkgdGhlXG5cdCAqIHJlcGxheSB0cmFmZmljLiBBIHNoYXJlZCBzZXJ2ZXIgaXMgbm9ybWFsbHkga2VwdCBhbGl2ZSAod2l0aCBpdHMgY2FjaGVkIFNES1xuXHQgKiBjbGllbnQpIGZvciB0aGUgbmV4dCB0ZXN0OyBhIHBlci10ZXN0IHNlcnZlciBpcyBzdG9wcGVkLlxuXHQgKlxuXHQgKiBQYXNzIGBmb3JjZVJlc3RhcnRgIHdoZW4gdGhlIGp1c3QtcnVuIHRlc3QgZmFpbGVkLiBBIGZhaWxlZCB0ZXN0IGNhbiBsZWF2ZVxuXHQgKiBhIG1pZC10dXJuIHNlc3Npb24gdGhhdCB3ZWRnZXMgKG9yIGhhcyBhbHJlYWR5IGtpbGxlZCkgdGhlIHNoYXJlZCBob3N0LCBzb1xuXHQgKiByZXVzaW5nIGl0IHdvdWxkIGNhc2NhZGUgYEVDT05OUkVGVVNFRGAgLyBgY3JlYXRlU2Vzc2lvbmAgdGltZW91dHMgaW50byB0aGVcblx0ICogbmV4dCwgdW5yZWxhdGVkIHRlc3QuIFJlc3RhcnRpbmcgaXNvbGF0ZXMgdGhlIGZhaWx1cmUgdG8gdGhlIG9uZSB0ZXN0IHRoYXRcblx0ICogY2F1c2VkIGl0LiBUaGUgc3RyaWN0IGNhY2hlLW1pc3MgYXNzZXJ0aW9uIGlzIGFsc28gc2tpcHBlZCBvbiByZXN0YXJ0OiB0aGVcblx0ICogdGVzdCBhbHJlYWR5IGZhaWxlZCBmb3IgaXRzIG93biByZWFzb24sIGFuZCBhIHNlY29uZGFyeSBjYWNoZS1taXNzIHRocm93XG5cdCAqIHdvdWxkIG9ubHkgb2JzY3VyZSBpdC5cblx0ICovXG5cdGFzeW5jIHJlbGVhc2UoY3JlYXRlZFNlc3Npb25zOiBzdHJpbmdbXSwgZm9yY2VSZXN0YXJ0ID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9jbGllbnQ7XG5cdFx0Y29uc3QgY2xlYW51cEVycm9yczogRXJyb3JbXSA9IFtdO1xuXHRcdGlmIChjbGllbnQpIHtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjcmVhdGVkU2Vzc2lvbnMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvbik7XG5cdFx0XHRcdFx0aWYgKHN0YXRlLmFjdGl2ZVR1cm4pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0Y29uc3QgdHVybklkID0gc3RhdGUuYWN0aXZlVHVybi5pZDtcblx0XHRcdFx0XHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0XHRcdGNoYW5uZWw6IGNoYXQsXG5cdFx0XHRcdFx0XHRcdGNsaWVudFNlcTogdGhpcy5fY2xlYW51cENsaWVudFNlcSsrLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCwgdHVybklkLCBkdXJhdGlvbjogMCB9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRcdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5DYW5jZWxsZWQnKVxuXHRcdFx0XHRcdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0XG5cdFx0XHRcdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdFx0XHRcdFx0MTBfMDAwLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0XHRcdFx0Y29uc3QgdGVybWluYWxzID0gKHJvb3Quc25hcHNob3QhLnN0YXRlIGFzIFJvb3RTdGF0ZSkudGVybWluYWxzID8/IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgdGVybWluYWxzKSB7XG5cdFx0XHRcdFx0XHRpZiAodGVybWluYWwuY2xhaW0ua2luZCA9PT0gVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbiAmJiB0ZXJtaW5hbC5jbGFpbS5zZXNzaW9uID09PSBzZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdkaXNwb3NlVGVybWluYWwnLCB7IGNoYW5uZWw6IHRlcm1pbmFsLnJlc291cmNlIH0sIGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0KDMwXzAwMCwgOTBfMDAwKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdkaXNwb3NlU2Vzc2lvbicsIHsgY2hhbm5lbDogc2Vzc2lvbiB9LCBnZXRBZ2VudEhvc3RFMkVUZXN0VGltZW91dCgzMF8wMDAsIDkwXzAwMCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGNsZWFudXBFcnJvcnMucHVzaChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjbGllbnQuY2xvc2UoKTtcblx0XHR9XG5cdFx0Y3JlYXRlZFNlc3Npb25zLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fY2xpZW50ID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbXVzdFJlc3RhcnQgPSBmb3JjZVJlc3RhcnQgfHwgY2xlYW51cEVycm9ycy5sZW5ndGggPiAwO1xuXHRcdGlmICh0aGlzLl9zaGFyZWQgJiYgIW11c3RSZXN0YXJ0KSB7XG5cdFx0XHQvLyBTdXJmYWNlIHRoaXMgdGVzdCdzIHN0cmljdCByZXBsYXkgZmFpbHVyZXMgYnV0IGtlZXAgdGhlIHNlcnZlciAoYW5kXG5cdFx0XHQvLyBpdHMgY2FjaGVkIFNESyBjbGllbnQpIGFsaXZlIGZvciB0aGUgbmV4dCB0ZXN0LlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fc2VydmVyPy5jYXBpUmVwbGF5Py5hc3NlcnROb1JlcGxheU1pc21hdGNoZXMoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNsZWFudXBFcnJvcnMucHVzaChlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheT8uY2xvc2UoKTtcblx0XHRcdFx0fSBjYXRjaCAoc3RvcEVycm9yKSB7XG5cdFx0XHRcdFx0Y2xlYW51cEVycm9ycy5wdXNoKHN0b3BFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gc3RvcEVycm9yIDogbmV3IEVycm9yKFN0cmluZyhzdG9wRXJyb3IpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBzdG9wU2VydmVyKHRoaXMuX3NlcnZlcik7XG5cdFx0XHRcdH0gY2F0Y2ggKHN0b3BFcnJvcikge1xuXHRcdFx0XHRcdGNsZWFudXBFcnJvcnMucHVzaChzdG9wRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHN0b3BFcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoc3RvcEVycm9yKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NlcnZlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fbW9kZWxCYWNrZWRUZXN0c09uQ3VycmVudFNlcnZlciA9IDA7XG5cdFx0XHRcdHRoaXMuX3Rlc3RzT25DdXJyZW50U2VydmVyID0gMDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUGVyLXRlc3Qgc2VydmVyLCBvciBhIHNoYXJlZCBzZXJ2ZXIgYmVpbmcgcmVzdGFydGVkIGFmdGVyIGEgZmFpbHVyZS5cblx0XHRcdC8vIEZsdXNoIHRoZSByZWNvcmRpbmcgLyBzdXJmYWNlIHN0cmljdCByZXBsYXkgY2FjaGUtbWlzc2VzICh1bmxlc3MgdGhlXG5cdFx0XHQvLyB0ZXN0IGFscmVhZHkgZmFpbGVkKSBiZWZvcmUgdGhlIHByb2Nlc3MgZ29lcyBhd2F5LiBLaWxsIGV2ZW4gaWYgdGhlXG5cdFx0XHQvLyBzdHJpY3QgY2hlY2sgdGhyb3dzLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGZvcmNlUmVzdGFydCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NlcnZlcj8uY2FwaVJlcGxheT8uY2xvc2UoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zZXJ2ZXI/LmNhcGlSZXBsYXk/LnN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2xlYW51cEVycm9ycy5wdXNoKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHN0b3BTZXJ2ZXIodGhpcy5fc2VydmVyKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRjbGVhbnVwRXJyb3JzLnB1c2goZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZXJ2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX21vZGVsQmFja2VkVGVzdHNPbkN1cnJlbnRTZXJ2ZXIgPSAwO1xuXHRcdFx0XHR0aGlzLl90ZXN0c09uQ3VycmVudFNlcnZlciA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjbGVhbnVwRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChmb3JjZVJlc3RhcnQpIHtcblx0XHRcdFx0cHJvY2Vzcy5zdGRvdXQud3JpdGUoYFthZ2VudC1ob3N0LWUyZV0gY2xlYW51cCByZXBvcnRlZCAke2NsZWFudXBFcnJvcnMubGVuZ3RofSBzZWNvbmRhcnkgZXJyb3IocykgYWZ0ZXIgdGhlIHRlc3QgZmFpbGVkOlxcbmApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVycm9yIG9mIGNsZWFudXBFcnJvcnMpIHtcblx0XHRcdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZShgW2FnZW50LWhvc3QtZTJlXSAjICR7ZXJyb3IubWVzc2FnZX1cXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgQWdncmVnYXRlRXJyb3IoY2xlYW51cEVycm9ycywgYEZhaWxlZCB0byByZWxlYXNlIEFnZW50IEhvc3QgRTJFIHRlc3QgcmVzb3VyY2VzOiAke2NsZWFudXBFcnJvcnMubWFwKGVycm9yID0+IGVycm9yLm1lc3NhZ2UpLmpvaW4oJzsgJyl9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFRlYXIgZG93biBhIHNoYXJlZCBzZXJ2ZXIgYXQgdGhlIGVuZCBvZiB0aGUgc3VpdGUgKG5vLW9wIGZvciBwZXItdGVzdCkuICovXG5cdGFzeW5jIGRpc3Bvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGF0YURpciA9IHRoaXMuX2RhdGFEaXI7XG5cdFx0dGhpcy5fZGF0YURpciA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuX3NlcnZlcikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NlcnZlci5jYXBpUmVwbGF5Py5jbG9zZSgpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGF3YWl0IHN0b3BTZXJ2ZXIodGhpcy5fc2VydmVyKTtcblx0XHRcdFx0XHR0aGlzLl9zZXJ2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKGRhdGFEaXIpIHtcblx0XHRcdFx0YXdhaXQgcmVtb3ZlVGVtcERpcnMoW2RhdGFEaXJdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIFNoYXJlZCBzdWl0ZVxuXG4vKipcbiAqIFJlZ2lzdGVycyB0aGUgY3Jvc3MtcHJvdmlkZXIgYWdlbnQgaG9zdCBlMmUgc3VpdGUuIFRoZSBib2R5IGlzIGlkZW50aWNhbCBmb3JcbiAqIGV2ZXJ5IHByb3ZpZGVyIHRoYXQgc3BlYWtzIHRoZSBhZ2VudCBob3N0IHByb3RvY29sIFx1MjAxNCB0aGUgb25seSBrbm9icyBhcmVcbiAqIHRvb2wgbmFtZXMgYW5kIFVSSSBzY2hlbWUuXG4gKi9cbiJdLAogICJtYXBwaW5ncyI6ICJBQVNBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsYUFBYSxhQUFhLGNBQWMsY0FBYyxRQUFRLGdCQUFnQjtBQUNsRyxTQUFTLFNBQVMsUUFBUSxnQkFBZ0I7QUFDMUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVc7QUFDcEI7QUFBQSxFQUNDO0FBQUEsRUFBa0I7QUFBQSxFQUFzQjtBQUFBLEVBQTBCO0FBQUEsRUFDbEU7QUFBQSxFQUF1QjtBQUFBLEVBQXVCO0FBQUEsRUFBNEI7QUFBQSxFQUE0QjtBQUFBLEVBQ3RHO0FBQUEsT0FFTTtBQUVQLFNBQVMseUJBQXlCO0FBQ2xDO0FBQUEsRUFDQztBQUFBLE9BR007QUFHUDtBQUFBLEVBQ0M7QUFBQSxFQUFzQjtBQUFBLEVBQW1CO0FBQUEsRUFB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
