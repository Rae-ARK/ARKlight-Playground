import { fork } from "child_process";
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "fs/promises";
import { raceTimeout } from "../../../../base/common/async.js";
import { Schemas } from "../../../../base/common/network.js";
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { userInfo } from "os";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { CapiReplayProxy } from "./e2e/harness/capiReplayProxy.js";
import { dirname, join, resolve as resolvePath } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import {
  ContentEncoding,
  ResourceType,
  ResourceWriteMode
} from "../../common/state/protocol/commands.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { MessageKind, buildDefaultChatUri, mergeSessionWithDefaultChat, parseDefaultChatUri } from "../../common/state/sessionState.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentEnabledEnvVar } from "../../common/agentService.js";
import {
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  ProtocolError
} from "../../common/state/sessionProtocol.js";
import { AhpSnapshotRecorder } from "./e2e/harness/ahpSnapshot.js";
import { recordAhpSurface } from "./ahpSurfaceCoverage.js";
import { isWindows } from "../../../../base/common/platform.js";
function getProtocolOperationTimeout() {
  if (process.env["AGENT_HOST_E2E_COVERAGE"] === "1") {
    return 3e4;
  }
  return isWindows ? 8e3 : 5e3;
}
class TestProtocolClient {
  constructor(port, _takeReplayError, _setWorkingDirectory) {
    this._takeReplayError = _takeReplayError;
    this._setWorkingDirectory = _setWorkingDirectory;
    this._ahpSnapshot = new AhpSnapshotRecorder();
    this._nextId = 1;
    this._pendingCalls = /* @__PURE__ */ new Map();
    this._notifications = [];
    this._notifWaiters = [];
    this._nextWatchId = 1;
    this._closed = false;
    /**
     * Reverse requests this client has served, in arrival order. Lets a test
     * assert that the host actually reached back to the client for filesystem
     * access rather than resolving a path locally. `uri` is absent when the
     * request carries no resource (rather than being recorded as an empty
     * string, which would be indistinguishable from a real one).
     */
    this._servedReverseRequests = [];
    this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this._ws.on("open", () => {
        this._ws.on("message", (data) => {
          const text = typeof data === "string" ? data : data.toString("utf-8");
          const msg = JSON.parse(text);
          this._ahpSnapshot.record("s2c", msg);
          this._handleMessage(msg);
        });
        resolve();
      });
      this._ws.on("error", reject);
    });
  }
  _handleMessage(msg) {
    if (isJsonRpcResponse(msg)) {
      const pending = this._pendingCalls.get(msg.id);
      if (pending) {
        this._pendingCalls.delete(msg.id);
        const errResp = msg;
        if (errResp.error) {
          pending.reject(new ProtocolError(errResp.error.code, errResp.error.message, errResp.error.data));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (isJsonRpcRequest(msg)) {
      recordAhpSurface("command", msg.method);
      void this._handleServerRequest(msg);
    } else if (isJsonRpcNotification(msg)) {
      const notif = msg;
      recordAhpSurface("notification", notif.method);
      if (notif.method === "action") {
        const envelope = notif.params;
        recordAhpSurface("action", envelope?.action?.type ?? "");
      }
      this._notifications.push(notif);
      this._flushNotificationWaiters();
    }
  }
  async _handleServerRequest(msg) {
    try {
      if (!this._isReverseRequestMethod(msg.method)) {
        throw new Error(`Unsupported reverse request method: ${msg.method}`);
      }
      const params = msg.params;
      this._servedReverseRequests.push({ method: msg.method, uri: params?.uri ?? params?.source });
      const result = await this._handleServerRequestMethod(msg.method, msg.params);
      const response = { jsonrpc: "2.0", id: msg.id, result };
      this._ahpSnapshot.record("c2s", response);
      this._ws.send(JSON.stringify(response));
    } catch (error) {
      const response = {
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error)
        }
      };
      this._ahpSnapshot.record("c2s", response);
      this._ws.send(JSON.stringify(response));
    }
  }
  _isReverseRequestMethod(method) {
    switch (method) {
      case "createResourceWatch":
      case "resourceRequest":
      case "resourceRead":
      case "resourceList":
      case "resourceResolve":
      case "resourceWrite":
      case "resourceMkdir":
      case "resourceDelete":
      case "resourceMove":
      case "resourceCopy":
        return true;
      default:
        return false;
    }
  }
  async _handleServerRequestMethod(method, params) {
    switch (method) {
      case "createResourceWatch":
        return this._createResourceWatch(params);
      case "resourceRequest":
        return {};
      case "resourceRead":
        return this._resourceRead(params);
      case "resourceList":
        return this._resourceList(params);
      case "resourceResolve":
        return this._resourceResolve(params);
      case "resourceWrite":
        return this._resourceWrite(params);
      case "resourceMkdir":
        return this._resourceMkdir(params);
      case "resourceDelete":
        return this._resourceDelete(params);
      case "resourceMove":
        return this._resourceMove(params);
      case "resourceCopy":
        return this._resourceCopy(params);
    }
  }
  _coerceUri(value) {
    return URI.parse(value);
  }
  _assertFileUri(uri) {
    if (uri.scheme !== Schemas.file) {
      throw new Error(`Unsupported URI scheme for test client filesystem: ${uri.toString()}`);
    }
    return uri.fsPath;
  }
  async _pathExists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
  async _resourceRead(params) {
    const uri = this._coerceUri(params.uri);
    const filePath = this._assertFileUri(uri);
    const encoding = params.encoding === ContentEncoding.Utf8 ? ContentEncoding.Utf8 : ContentEncoding.Base64;
    const content = await readFile(filePath);
    return {
      data: encoding === ContentEncoding.Utf8 ? content.toString("utf-8") : content.toString("base64"),
      encoding
    };
  }
  async _resourceList(params) {
    const uri = this._coerceUri(params.uri);
    const dirPath = this._assertFileUri(uri);
    const entries = await readdir(dirPath, { withFileTypes: true });
    return {
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file"
      }))
    };
  }
  async _resourceResolve(params) {
    const requested = this._coerceUri(params.uri);
    const requestedPath = this._assertFileUri(requested);
    const followSymlinks = params.followSymlinks ?? true;
    const lst = await lstat(requestedPath);
    if (lst.isSymbolicLink() && followSymlinks) {
      const resolvedPath = await realpath(requestedPath);
      const resolvedUri = URI.file(resolvedPath);
      const resolvedStat = await stat(resolvedPath);
      return {
        uri: resolvedUri.toString(),
        type: resolvedStat.isDirectory() ? ResourceType.Directory : ResourceType.File,
        size: resolvedStat.isDirectory() ? void 0 : resolvedStat.size,
        mtime: resolvedStat.mtime.toISOString(),
        ctime: resolvedStat.ctime.toISOString(),
        etag: `W/"${resolvedStat.size}-${Math.trunc(resolvedStat.mtimeMs)}"`
      };
    }
    const st = followSymlinks ? await stat(requestedPath) : lst;
    return {
      uri: requested.toString(),
      type: lst.isSymbolicLink() && !followSymlinks ? ResourceType.Symlink : st.isDirectory() ? ResourceType.Directory : ResourceType.File,
      size: st.isDirectory() ? void 0 : st.size,
      mtime: st.mtime.toISOString(),
      ctime: st.ctime.toISOString(),
      etag: `W/"${st.size}-${Math.trunc(st.mtimeMs)}"`
    };
  }
  async _resourceWrite(params) {
    const uri = this._coerceUri(params.uri);
    const filePath = this._assertFileUri(uri);
    const dataEncoding = params.encoding === ContentEncoding.Utf8 ? ContentEncoding.Utf8 : ContentEncoding.Base64;
    const incoming = Buffer.from(params.data, dataEncoding);
    const mode = params.mode ?? ResourceWriteMode.Truncate;
    const position = Math.max(0, params.position ?? 0);
    const createOnly = params.createOnly ?? false;
    await mkdir(dirname(filePath), { recursive: true });
    const exists = await this._pathExists(filePath);
    if (createOnly && exists) {
      throw new Error(`File already exists: ${filePath}`);
    }
    const existing = exists ? await readFile(filePath) : Buffer.alloc(0);
    const clampedStart = Math.min(position, existing.length);
    let next;
    switch (mode) {
      case ResourceWriteMode.Append: {
        const insertAt = Math.max(0, existing.length - Math.min(position, existing.length));
        next = Buffer.concat([existing.subarray(0, insertAt), incoming, existing.subarray(insertAt)]);
        break;
      }
      case ResourceWriteMode.Insert:
        next = Buffer.concat([existing.subarray(0, clampedStart), incoming, existing.subarray(clampedStart)]);
        break;
      case ResourceWriteMode.Truncate:
      default:
        next = Buffer.concat([existing.subarray(0, clampedStart), incoming]);
        break;
    }
    await writeFile(filePath, next);
    return {};
  }
  async _resourceMkdir(params) {
    const uri = this._coerceUri(params.uri);
    const dirPath = this._assertFileUri(uri);
    await mkdir(dirPath, { recursive: true });
    return {};
  }
  async _resourceDelete(params) {
    const uri = this._coerceUri(params.uri);
    const targetPath = this._assertFileUri(uri);
    await rm(targetPath, { recursive: params.recursive ?? false, force: false });
    return {};
  }
  async _resourceMove(params) {
    const source = this._assertFileUri(this._coerceUri(params.source));
    const destination = this._assertFileUri(this._coerceUri(params.destination));
    const failIfExists = params.failIfExists ?? false;
    if (failIfExists && await this._pathExists(destination)) {
      throw new Error(`Destination already exists: ${destination}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await rename(source, destination);
    return {};
  }
  async _resourceCopy(params) {
    const source = this._assertFileUri(this._coerceUri(params.source));
    const destination = this._assertFileUri(this._coerceUri(params.destination));
    const failIfExists = params.failIfExists ?? false;
    if (failIfExists && await this._pathExists(destination)) {
      throw new Error(`Destination already exists: ${destination}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: !failIfExists, errorOnExist: failIfExists });
    return {};
  }
  async _createResourceWatch(_params) {
    return { channel: `ahp-resource-watch:/mock-${this._nextWatchId++}` };
  }
  /** Send a JSON-RPC notification (fire-and-forget). */
  notify(method, params) {
    recordAhpSurface("command", method);
    if (method === "dispatchAction") {
      const dispatched = params;
      recordAhpSurface("action", dispatched?.action?.type ?? "");
    }
    const message = { jsonrpc: "2.0", method, params };
    this._ahpSnapshot.record("c2s", message);
    this._ws.send(JSON.stringify(message));
  }
  /**
   * Dispatch a strongly-typed protocol action (fire-and-forget write-ahead).
   *
   * Prefer this over the raw {@link notify} escape hatch: the action payload
   * is checked against the {@link StateAction} union at compile time, so a
   * malformed or incomplete action (e.g. an approval missing its required
   * `confirmed` field) is caught by the type-checker rather than silently
   * shipped over the wire and reduced into `undefined`.
   */
  dispatch(params) {
    this.notify("dispatchAction", params);
  }
  /** Send a JSON-RPC request and await the response. */
  call(method, params, timeoutMs = getProtocolOperationTimeout()) {
    recordAhpSurface("command", method);
    const id = this._nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    this._ahpSnapshot.record("c2s", message);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingCalls.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id}, ${timeoutMs}ms)`));
      }, timeoutMs);
      this._pendingCalls.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      try {
        this._ws.send(JSON.stringify(message));
      } catch (error) {
        this._pendingCalls.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  /** Wait for a server notification matching a predicate. */
  waitForNotification(predicate, timeoutMs = getProtocolOperationTimeout()) {
    const existing = this._notifications.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        dispose: () => clearTimeout(timer)
      };
      const timer = setTimeout(() => {
        this._removeNotificationWaiter(waiter);
        const received = this._notifications.map((n) => {
          const action = n.method === "action" ? n.params.action.type : void 0;
          return action ? `${n.method}:${action}` : n.method;
        }).join(", ");
        reject(new Error(`Timeout waiting for notification (${timeoutMs}ms). Received: ${received}`));
      }, timeoutMs);
      this._notifWaiters.push(waiter);
      this._flushNotificationWaiters();
    });
  }
  _flushNotificationWaiters() {
    for (let i = this._notifWaiters.length - 1; i >= 0; i--) {
      const waiter = this._notifWaiters[i];
      const match = this._notifications.find(waiter.predicate);
      if (match) {
        this._notifWaiters.splice(i, 1);
        waiter.dispose();
        waiter.resolve(match);
      }
    }
  }
  _removeNotificationWaiter(waiter) {
    const idx = this._notifWaiters.indexOf(waiter);
    if (idx >= 0) {
      this._notifWaiters.splice(idx, 1);
    }
  }
  /** Return all received notifications matching a predicate. */
  receivedNotifications(predicate) {
    return predicate ? this._notifications.filter(predicate) : [...this._notifications];
  }
  /** Send a raw string over the WebSocket without JSON serialization. */
  sendRaw(data) {
    this._ws.send(data);
  }
  /** Wait for the next raw message from the server. */
  waitForRawMessage(timeoutMs = getProtocolOperationTimeout()) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for raw message (${timeoutMs}ms)`));
      }, timeoutMs);
      const onMsg = (data) => {
        cleanup();
        const text = typeof data === "string" ? data : data.toString("utf-8");
        resolve(JSON.parse(text));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this._ws.removeListener("message", onMsg);
      };
      this._ws.on("message", onMsg);
    });
  }
  close() {
    if (this._closed) {
      return;
    }
    this._closed = true;
    for (const w of this._notifWaiters) {
      w.dispose();
      w.reject(new Error("Client closed"));
    }
    this._notifWaiters.length = 0;
    for (const [, p] of this._pendingCalls) {
      p.reject(new Error("Client closed"));
    }
    this._pendingCalls.clear();
    this._ws.close();
  }
  clearReceived() {
    this._notifications.length = 0;
  }
  /**
   * Reverse requests the host has sent to this client, in arrival order.
   * Separate from {@link clearReceived} so resetting notifications does not
   * silently discard this history.
   */
  get servedReverseRequests() {
    return this._servedReverseRequests;
  }
  clearServedReverseRequests() {
    this._servedReverseRequests.length = 0;
  }
  clearAhpSnapshot() {
    this._ahpSnapshot.clear();
  }
  setAhpSnapshotNormalization(normalization) {
    this._ahpSnapshot.setNormalization(normalization);
  }
  setWorkingDirectory(workingDirectory) {
    this._setWorkingDirectory?.(workingDirectory);
  }
  beginAhpSnapshotRound() {
    this._ahpSnapshot.beginRound();
  }
  serializeAhpSnapshot(options) {
    return this._ahpSnapshot.serialize(options);
  }
  takeReplayError() {
    return this._takeReplayError?.();
  }
}
const SERVER_SHUTDOWN_TIMEOUT_MS = isWindows || process.env["AGENT_HOST_E2E_COVERAGE"] === "1" ? 3e4 : 5e3;
async function stopServer(server) {
  const serverProcess = server?.process;
  if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
    return;
  }
  const serverExit = new Promise((resolve) => {
    const onExit = () => resolve();
    serverProcess.once("exit", onExit);
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      serverProcess.removeListener("exit", onExit);
      resolve();
    }
  });
  serverProcess.stdin?.end();
  if (!await raceTimeout(serverExit.then(() => true), SERVER_SHUTDOWN_TIMEOUT_MS)) {
    try {
      if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
        const killed = serverProcess.kill("SIGKILL");
        if (!killed && serverProcess.exitCode === null && serverProcess.signalCode === null) {
          throw new Error("Failed to terminate Agent Host test server");
        }
      }
    } catch (error) {
      if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
        throw error;
      }
    }
    await serverExit;
  }
}
const AGENT_HOST_E2E_COVERAGE = process.env["AGENT_HOST_E2E_COVERAGE"] === "1";
function getAgentHostE2ETestTimeout(normalTimeoutMs, extendedTimeoutMs) {
  return AGENT_HOST_E2E_COVERAGE || isWindows ? extendedTimeoutMs : normalTimeoutMs;
}
function withAgentHostCoverage(environment) {
  const childEnvironment = { ...environment };
  if (AGENT_HOST_E2E_COVERAGE) {
    const coveragePath = resolvePath(process.cwd(), ".build", "agent-host-e2e-coverage", "raw");
    mkdirSync(coveragePath, { recursive: true });
    childEnvironment.NODE_V8_COVERAGE = coveragePath;
  } else {
    delete childEnvironment.NODE_V8_COVERAGE;
  }
  return childEnvironment;
}
function buildCopilotChatToken(mockUrl, copilotPlan = "free") {
  return Buffer.from(JSON.stringify({
    token: "smoketest-fake-token",
    expires_at: Math.floor(Date.now() / 1e3) + 3600,
    refresh_in: 1800,
    sku: copilotPlan === "pro" ? "individual_subscription_copilot" : "free_limited_copilot",
    individual: true,
    isNoAuthUser: true,
    copilot_plan: copilotPlan,
    organization_login_list: [],
    endpoints: { api: mockUrl, proxy: mockUrl }
  })).toString("base64");
}
async function startMockLlmServer(scenarios) {
  const mockServerPath = fileURLToPath(new URL("../../../../../../scripts/chat-simulation/common/mock-llm-server.ts", import.meta.url));
  const nodeRequire = createRequire(import.meta.url);
  const mockModule = nodeRequire(mockServerPath);
  mockModule.registerScenario("text-only", {
    type: "multi-turn",
    turns: [{ kind: "echo-last-message" }]
  });
  for (const scenario of scenarios ?? []) {
    mockModule.registerScenario(scenario.id, scenario.definition);
  }
  const messages = [];
  const serverHandle = await mockModule.startServer(0, { logger: (msg) => messages.push(msg), verbose: true, captureRequests: true });
  return { ...serverHandle, logMessages: messages };
}
async function startServer(options) {
  return new Promise((resolve, reject) => {
    const serverPath = fileURLToPath(new URL("../../node/agentHostServerMain.js", import.meta.url));
    const args = ["--enable-mock-agent", "--port", "0", "--without-connection-token"];
    if (options?.quiet ?? true) {
      args.push("--quiet");
    }
    if (options?.userDataDir) {
      args.push("--user-data-dir", options.userDataDir);
    }
    const child = fork(serverPath, args, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: withAgentHostCoverage({ ...process.env, ...options?.env })
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Server startup timed out"));
    }, options?.startupTimeoutMs ?? getAgentHostE2ETestTimeout(1e4, 45e3));
    child.stdout.on("data", (data) => {
      const text = data.toString();
      const match = text.match(/READY:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ process: child, port: parseInt(match[1], 10) });
      }
    });
    child.stderr.on("data", () => {
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited prematurely with code ${code}`));
    });
  });
}
async function startRealServer(options) {
  const realCapture = options?.capiReplay?.real === true;
  const mockLlmServer = options?.mockLlm || options?.capiReplay && !realCapture ? await startMockLlmServer(options?.mockScenarios) : void 0;
  let capiReplayProxy;
  if (options?.capiReplay) {
    capiReplayProxy = new CapiReplayProxy(realCapture ? {
      fixturePath: options.capiReplay.fixturePath,
      mode: options.capiReplay.mode,
      workDir: options.capiReplay.workDir,
      allowPosixCommands: options.capiReplay.allowPosixCommands,
      allowStaleRecordedRequest: options.capiReplay.allowStaleRecordedRequest,
      homeDir: options.homeDir,
      userName: userInfo().username,
      // Real hosts (consumer defaults); override for Enterprise/Business accounts.
      githubUpstreamUrl: process.env["AGENT_HOST_RECORD_GITHUB_URL"] || "https://api.github.com",
      capiUpstreamUrl: process.env["AGENT_HOST_RECORD_CAPI_URL"] || "https://api.githubcopilot.com"
    } : {
      fixturePath: options.capiReplay.fixturePath,
      mode: options.capiReplay.mode,
      workDir: options.capiReplay.workDir,
      allowPosixCommands: options.capiReplay.allowPosixCommands,
      allowStaleRecordedRequest: options.capiReplay.allowStaleRecordedRequest,
      homeDir: options.homeDir,
      userName: userInfo().username,
      upstreamUrl: mockLlmServer.url
    });
    await capiReplayProxy.start();
  }
  const capiUrl = capiReplayProxy?.url ?? mockLlmServer?.url;
  return new Promise((resolve, reject) => {
    const serverPath = fileURLToPath(new URL("../../node/agentHostServerMain.js", import.meta.url));
    const args = ["--port", "0", "--without-connection-token"];
    if (options?.claudeSdkRoot) {
      args.push("--claude-sdk-root", options.claudeSdkRoot);
    }
    if (options?.codexSdkRoot) {
      args.push("--codex-sdk-root", options.codexSdkRoot);
    }
    if (options?.userDataDir) {
      args.push("--user-data-dir", options.userDataDir);
    }
    if (options?.logLevel) {
      args.push("--log", options.logLevel);
    }
    const childEnv = withAgentHostCoverage({
      ...process.env,
      ...options?.env ?? {},
      ...options?.homeDir ? {
        HOME: options.homeDir,
        USERPROFILE: options.homeDir,
        APPDATA: join(options.homeDir, "AppData", "Roaming"),
        LOCALAPPDATA: join(options.homeDir, "AppData", "Local"),
        XDG_CONFIG_HOME: join(options.homeDir, ".config"),
        COPILOT_HOME: join(options.homeDir, ".copilot"),
        COPILOT_SKILLS_DIRS: void 0,
        CLAUDE_CONFIG_DIR: void 0,
        CODEX_HOME: void 0,
        ...isWindows && options.homeDir.match(/^[A-Za-z]:[\\/]/) ? {
          HOMEDRIVE: options.homeDir.slice(0, 2),
          HOMEPATH: options.homeDir.slice(2).replace(/\//g, "\\")
        } : {}
      } : {},
      // Codex defaults to disabled; opt it in for the agent host e2e suite when a
      // codex SDK root is supplied so the provider actually registers.
      ...options?.codexSdkRoot ? { [AgentHostCodexAgentEnabledEnvVar]: "true" } : {},
      // Fixtures use Codex's unified exec tool, so keep record and replay on the same shell protocol.
      ...options?.codexSdkRoot && options.capiReplay ? { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(["-c", "features.unified_exec=true"]) } : {},
      ...realCapture ? {
        // Real-CAPI capture/replay: route all CAPI + GitHub-API traffic through
        // the proxy. The real GitHub token flows via the `authenticate`
        // protocol call (record) or a placeholder (replay), not via env.
        COPILOT_API_URL: capiUrl,
        COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
        VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: capiUrl
      } : mockLlmServer ? {
        GITHUB_PAT: "smoketest-fake-pat",
        IS_SCENARIO_AUTOMATION: "1",
        // Agent host e2e Copilot tests run against responses-capable models
        // (e.g. gpt-5.3-codex) that are "pro"-gated in the mock /models
        // fixture, so mint a pro-plan token for this harness.
        VSCODE_COPILOT_CHAT_TOKEN: buildCopilotChatToken(capiUrl, "pro"),
        // Route the Copilot SDK's GitHub API calls (token refresh, model
        // discovery, etc.) at the mock/proxy instead of api.github.com,
        // which would 401 with the fake token.
        COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
        COPILOT_API_URL: capiUrl,
        GITHUB_COPILOT_API_TOKEN: "smoketest-fake-agent-host-token",
        // Route the agent host's shared CAPI client (used by the Codex /
        // agent-host harnesses for model discovery + requests) at the
        // mock/proxy instead of api.github.com, which would 401 with the
        // fake token.
        VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: capiUrl
      } : {}
    });
    let child;
    try {
      child = fork(serverPath, args, {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        env: childEnv
      });
    } catch (err) {
      void mockLlmServer?.close();
      void capiReplayProxy?.stop().catch(() => void 0);
      throw err;
    }
    let mockClosed = false;
    const closeMockServer = async () => {
      if (mockClosed || !mockLlmServer) {
        return;
      }
      mockClosed = true;
      await capiReplayProxy?.stop().catch(() => void 0);
      try {
        await mockLlmServer.close();
      } catch {
      }
    };
    child.on("exit", () => {
      void closeMockServer();
    });
    const timer = setTimeout(() => {
      child.kill();
      void closeMockServer();
      reject(new Error("Real server startup timed out"));
    }, 3e4);
    child.stdout.on("data", (data) => {
      const text = data.toString();
      const match = text.match(/READY:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ process: child, port: parseInt(match[1], 10), mockLlm: mockLlmServer, capiReplay: capiReplayProxy });
      }
    });
    child.stderr.on("data", () => {
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      void closeMockServer();
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      void closeMockServer();
      reject(new Error(`Real server exited prematurely with code ${code}`));
    });
  });
}
let sessionCounter = 0;
function nextSessionUri() {
  return URI.from({ scheme: "mock", path: `/test-session-${++sessionCounter}` }).toString();
}
function defaultChatChannel(sessionUri) {
  return buildDefaultChatUri(sessionUri);
}
function isActionNotification(n, actionType) {
  if (n.method !== "action") {
    return false;
  }
  const envelope = n.params;
  return envelope.action.type === actionType;
}
function getActionEnvelope(n) {
  return n.params;
}
async function createAndSubscribeSession(c, clientId, workingDirectory) {
  await c.call("initialize", { channel: "ahp-root://", protocolVersions: [PROTOCOL_VERSION], clientId });
  await c.call("createSession", { channel: nextSessionUri(), provider: "mock", workingDirectories: workingDirectory ? [workingDirectory] : void 0 });
  const notif = await c.waitForNotification(
    (n) => n.method === "root/sessionAdded"
  );
  const realSessionUri = notif.params.summary.resource;
  await c.call("subscribe", { channel: realSessionUri });
  await c.call("subscribe", { channel: buildDefaultChatUri(realSessionUri) });
  c.clearReceived();
  return realSessionUri;
}
function dispatchTurnStarted(c, session, turnId, text, clientSeq) {
  c.dispatch({
    channel: defaultChatChannel(session),
    clientSeq,
    action: {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User } }
    }
  });
}
async function fetchSessionWithChat(c, sessionUri) {
  const owningSession = parseDefaultChatUri(sessionUri) ?? sessionUri;
  const chatUri = parseDefaultChatUri(sessionUri) ? sessionUri : buildDefaultChatUri(sessionUri);
  const sessionSnap = await c.call("subscribe", { channel: owningSession });
  const chatSnap = await c.call("subscribe", { channel: chatUri });
  return mergeSessionWithDefaultChat(
    sessionSnap.snapshot.state,
    chatSnap.snapshot?.state
  );
}
export {
  TestProtocolClient,
  createAndSubscribeSession,
  defaultChatChannel,
  dispatchTurnStarted,
  fetchSessionWithChat,
  getActionEnvelope,
  getAgentHostE2ETestTimeout,
  isActionNotification,
  nextSessionUri,
  startRealServer,
  startServer,
  stopServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoaWxkUHJvY2VzcywgZm9yayB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgY3AsIGxzdGF0LCBta2RpciwgcmVhZEZpbGUsIHJlYWRkaXIsIHJlYWxwYXRoLCByZW5hbWUsIHJtLCBzdGF0LCB3cml0ZUZpbGUgfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tICdtb2R1bGUnO1xuaW1wb3J0IHsgbWtkaXJTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdXNlckluZm8gfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJztcbmltcG9ydCB7IFdlYlNvY2tldCB9IGZyb20gJ3dzJztcbmltcG9ydCB7IENhcGlSZXBsYXlQcm94eSwgdHlwZSBDYXBpUmVwbGF5TW9kZSB9IGZyb20gJy4vZTJlL2hhcm5lc3MvY2FwaVJlcGxheVByb3h5LmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIHJlc29sdmUgYXMgcmVzb2x2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQge1xuXHRDb250ZW50RW5jb2RpbmcsXG5cdHR5cGUgQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyxcblx0dHlwZSBDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0LFxuXHRSZXNvdXJjZVR5cGUsXG5cdFJlc291cmNlV3JpdGVNb2RlLFxuXHRTdWJzY3JpYmVSZXN1bHQsXG5cdHR5cGUgRGlzcGF0Y2hBY3Rpb25QYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VDb3B5UGFyYW1zLFxuXHR0eXBlIFJlc291cmNlQ29weVJlc3VsdCxcblx0dHlwZSBSZXNvdXJjZURlbGV0ZVBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZURlbGV0ZVJlc3VsdCxcblx0dHlwZSBSZXNvdXJjZUxpc3RQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VMaXN0UmVzdWx0LFxuXHR0eXBlIFJlc291cmNlTWtkaXJQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VNa2RpclJlc3VsdCxcblx0dHlwZSBSZXNvdXJjZU1vdmVQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VNb3ZlUmVzdWx0LFxuXHR0eXBlIFJlc291cmNlUmVhZFBhcmFtcyxcblx0dHlwZSBSZXNvdXJjZVJlYWRSZXN1bHQsXG5cdHR5cGUgUmVzb3VyY2VSZXF1ZXN0UGFyYW1zLFxuXHR0eXBlIFJlc291cmNlUmVxdWVzdFJlc3VsdCxcblx0dHlwZSBSZXNvdXJjZVJlc29sdmVQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VSZXNvbHZlUmVzdWx0LFxuXHR0eXBlIFJlc291cmNlV3JpdGVQYXJhbXMsXG5cdHR5cGUgUmVzb3VyY2VXcml0ZVJlc3VsdCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQWRkZWRQYXJhbXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCBwYXJzZURlZmF1bHRDaGF0VXJpLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50QmluYXJ5QXJnc0VudlZhciwgQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRFbnZWYXIgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdGlzSnNvblJwY05vdGlmaWNhdGlvbixcblx0aXNKc29uUnBjUmVxdWVzdCxcblx0aXNKc29uUnBjUmVzcG9uc2UsXG5cdFByb3RvY29sRXJyb3IsXG5cdHR5cGUgQWhwTm90aWZpY2F0aW9uLFxuXHR0eXBlIEpzb25ScGNOb3RpZmljYXRpb24sXG5cdHR5cGUgSnNvblJwY1JlcXVlc3QsXG5cdHR5cGUgSnNvblJwY0Vycm9yUmVzcG9uc2UsXG5cdHR5cGUgSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSxcblx0dHlwZSBQcm90b2NvbE1lc3NhZ2UsXG59IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQWhwU25hcHNob3RSZWNvcmRlciwgdHlwZSBJQWhwU25hcHNob3ROb3JtYWxpemF0aW9uLCB0eXBlIElBaHBTbmFwc2hvdE9wdGlvbnMgfSBmcm9tICcuL2UyZS9oYXJuZXNzL2FocFNuYXBzaG90LmpzJztcbmltcG9ydCB7IHJlY29yZEFocFN1cmZhY2UgfSBmcm9tICcuL2FocFN1cmZhY2VDb3ZlcmFnZS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbi8vIC0tLS0gSlNPTi1SUEMgdGVzdCBjbGllbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJUGVuZGluZ0NhbGwge1xuXHRyZXNvbHZlOiAocmVzdWx0OiB1bmtub3duKSA9PiB2b2lkO1xuXHRyZWplY3Q6IChlcnI6IEVycm9yKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBnZXRQcm90b2NvbE9wZXJhdGlvblRpbWVvdXQoKTogbnVtYmVyIHtcblx0aWYgKHByb2Nlc3MuZW52WydBR0VOVF9IT1NUX0UyRV9DT1ZFUkFHRSddID09PSAnMScpIHtcblx0XHRyZXR1cm4gMzBfMDAwO1xuXHR9XG5cdHJldHVybiBpc1dpbmRvd3MgPyA4XzAwMCA6IDVfMDAwO1xufVxuXG50eXBlIFJldmVyc2VSZXF1ZXN0TWV0aG9kID1cblx0fCAnY3JlYXRlUmVzb3VyY2VXYXRjaCdcblx0fCAncmVzb3VyY2VSZXF1ZXN0J1xuXHR8ICdyZXNvdXJjZVJlYWQnXG5cdHwgJ3Jlc291cmNlTGlzdCdcblx0fCAncmVzb3VyY2VSZXNvbHZlJ1xuXHR8ICdyZXNvdXJjZVdyaXRlJ1xuXHR8ICdyZXNvdXJjZU1rZGlyJ1xuXHR8ICdyZXNvdXJjZURlbGV0ZSdcblx0fCAncmVzb3VyY2VNb3ZlJ1xuXHR8ICdyZXNvdXJjZUNvcHknO1xuXG50eXBlIFJldmVyc2VSZXF1ZXN0UGFyYW1zQnlNZXRob2QgPSB7XG5cdGNyZWF0ZVJlc291cmNlV2F0Y2g6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXM7XG5cdHJlc291cmNlUmVxdWVzdDogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zO1xuXHRyZXNvdXJjZVJlYWQ6IFJlc291cmNlUmVhZFBhcmFtcztcblx0cmVzb3VyY2VMaXN0OiBSZXNvdXJjZUxpc3RQYXJhbXM7XG5cdHJlc291cmNlUmVzb2x2ZTogUmVzb3VyY2VSZXNvbHZlUGFyYW1zO1xuXHRyZXNvdXJjZVdyaXRlOiBSZXNvdXJjZVdyaXRlUGFyYW1zO1xuXHRyZXNvdXJjZU1rZGlyOiBSZXNvdXJjZU1rZGlyUGFyYW1zO1xuXHRyZXNvdXJjZURlbGV0ZTogUmVzb3VyY2VEZWxldGVQYXJhbXM7XG5cdHJlc291cmNlTW92ZTogUmVzb3VyY2VNb3ZlUGFyYW1zO1xuXHRyZXNvdXJjZUNvcHk6IFJlc291cmNlQ29weVBhcmFtcztcbn07XG5cbnR5cGUgUmV2ZXJzZVJlcXVlc3RSZXN1bHRCeU1ldGhvZCA9IHtcblx0Y3JlYXRlUmVzb3VyY2VXYXRjaDogQ3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdDtcblx0cmVzb3VyY2VSZXF1ZXN0OiBSZXNvdXJjZVJlcXVlc3RSZXN1bHQ7XG5cdHJlc291cmNlUmVhZDogUmVzb3VyY2VSZWFkUmVzdWx0O1xuXHRyZXNvdXJjZUxpc3Q6IFJlc291cmNlTGlzdFJlc3VsdDtcblx0cmVzb3VyY2VSZXNvbHZlOiBSZXNvdXJjZVJlc29sdmVSZXN1bHQ7XG5cdHJlc291cmNlV3JpdGU6IFJlc291cmNlV3JpdGVSZXN1bHQ7XG5cdHJlc291cmNlTWtkaXI6IFJlc291cmNlTWtkaXJSZXN1bHQ7XG5cdHJlc291cmNlRGVsZXRlOiBSZXNvdXJjZURlbGV0ZVJlc3VsdDtcblx0cmVzb3VyY2VNb3ZlOiBSZXNvdXJjZU1vdmVSZXN1bHQ7XG5cdHJlc291cmNlQ29weTogUmVzb3VyY2VDb3B5UmVzdWx0O1xufTtcblxuLyoqIEEgcmV2ZXJzZSByZXF1ZXN0IHRoZSBob3N0IHNlbnQgdG8gdGhlIGNsaWVudCwgYXMgb2JzZXJ2ZWQgb24gdGhlIHdpcmUuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXJ2ZWRSZXZlcnNlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IG1ldGhvZDogUmV2ZXJzZVJlcXVlc3RNZXRob2Q7XG5cdC8qKiBUaGUgcmVzb3VyY2UgdGhlIHJlcXVlc3QgdGFyZ2V0cywgb3IgYHVuZGVmaW5lZGAgaWYgaXQgY2FycmllcyBub25lLiAqL1xuXHRyZWFkb25seSB1cmk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RQcm90b2NvbENsaWVudCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dzOiBXZWJTb2NrZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FocFNuYXBzaG90ID0gbmV3IEFocFNuYXBzaG90UmVjb3JkZXIoKTtcblx0cHJpdmF0ZSBfbmV4dElkID0gMTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NhbGxzID0gbmV3IE1hcDxudW1iZXIsIElQZW5kaW5nQ2FsbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uczogQWhwTm90aWZpY2F0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90aWZXYWl0ZXJzOiB7IHByZWRpY2F0ZTogKG46IEFocE5vdGlmaWNhdGlvbikgPT4gYm9vbGVhbjsgcmVzb2x2ZTogKG46IEFocE5vdGlmaWNhdGlvbikgPT4gdm9pZDsgcmVqZWN0OiAoZXJyOiBFcnJvcikgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9W10gPSBbXTtcblx0cHJpdmF0ZSBfbmV4dFdhdGNoSWQgPSAxO1xuXHRwcml2YXRlIF9jbG9zZWQgPSBmYWxzZTtcblx0LyoqXG5cdCAqIFJldmVyc2UgcmVxdWVzdHMgdGhpcyBjbGllbnQgaGFzIHNlcnZlZCwgaW4gYXJyaXZhbCBvcmRlci4gTGV0cyBhIHRlc3Rcblx0ICogYXNzZXJ0IHRoYXQgdGhlIGhvc3QgYWN0dWFsbHkgcmVhY2hlZCBiYWNrIHRvIHRoZSBjbGllbnQgZm9yIGZpbGVzeXN0ZW1cblx0ICogYWNjZXNzIHJhdGhlciB0aGFuIHJlc29sdmluZyBhIHBhdGggbG9jYWxseS4gYHVyaWAgaXMgYWJzZW50IHdoZW4gdGhlXG5cdCAqIHJlcXVlc3QgY2FycmllcyBubyByZXNvdXJjZSAocmF0aGVyIHRoYW4gYmVpbmcgcmVjb3JkZWQgYXMgYW4gZW1wdHlcblx0ICogc3RyaW5nLCB3aGljaCB3b3VsZCBiZSBpbmRpc3Rpbmd1aXNoYWJsZSBmcm9tIGEgcmVhbCBvbmUpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVkUmV2ZXJzZVJlcXVlc3RzOiBJU2VydmVkUmV2ZXJzZVJlcXVlc3RbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBvcnQ6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YWtlUmVwbGF5RXJyb3I/OiAoKSA9PiBFcnJvciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXRXb3JraW5nRGlyZWN0b3J5PzogKHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZykgPT4gdm9pZCxcblx0KSB7XG5cdFx0dGhpcy5fd3MgPSBuZXcgV2ViU29ja2V0KGB3czovLzEyNy4wLjAuMToke3BvcnR9YCk7XG5cdH1cblxuXHRhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLl93cy5vbignb3BlbicsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fd3Mub24oJ21lc3NhZ2UnLCAoZGF0YTogQnVmZmVyIHwgc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJyA/IGRhdGEgOiBkYXRhLnRvU3RyaW5nKCd1dGYtOCcpO1xuXHRcdFx0XHRcdGNvbnN0IG1zZyA9IEpTT04ucGFyc2UodGV4dCkgYXMgUHJvdG9jb2xNZXNzYWdlO1xuXHRcdFx0XHRcdHRoaXMuX2FocFNuYXBzaG90LnJlY29yZCgnczJjJywgbXNnKTtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVNZXNzYWdlKG1zZyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3dzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVNZXNzYWdlKG1zZzogUHJvdG9jb2xNZXNzYWdlKTogdm9pZCB7XG5cdFx0aWYgKGlzSnNvblJwY1Jlc3BvbnNlKG1zZykpIHtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nQ2FsbHMuZ2V0KG1zZy5pZCk7XG5cdFx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2FsbHMuZGVsZXRlKG1zZy5pZCk7XG5cdFx0XHRcdGNvbnN0IGVyclJlc3AgPSBtc2cgYXMgSnNvblJwY0Vycm9yUmVzcG9uc2U7XG5cdFx0XHRcdGlmIChlcnJSZXNwLmVycm9yKSB7XG5cdFx0XHRcdFx0cGVuZGluZy5yZWplY3QobmV3IFByb3RvY29sRXJyb3IoZXJyUmVzcC5lcnJvci5jb2RlLCBlcnJSZXNwLmVycm9yLm1lc3NhZ2UsIGVyclJlc3AuZXJyb3IuZGF0YSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHBlbmRpbmcucmVzb2x2ZSgobXNnIGFzIEpzb25ScGNTdWNjZXNzUmVzcG9uc2UpLnJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzSnNvblJwY1JlcXVlc3QobXNnKSkge1xuXHRcdFx0cmVjb3JkQWhwU3VyZmFjZSgnY29tbWFuZCcsIG1zZy5tZXRob2QpO1xuXHRcdFx0dm9pZCB0aGlzLl9oYW5kbGVTZXJ2ZXJSZXF1ZXN0KG1zZyk7XG5cdFx0fSBlbHNlIGlmIChpc0pzb25ScGNOb3RpZmljYXRpb24obXNnKSkge1xuXHRcdFx0Y29uc3Qgbm90aWYgPSBtc2c7XG5cdFx0XHRyZWNvcmRBaHBTdXJmYWNlKCdub3RpZmljYXRpb24nLCBub3RpZi5tZXRob2QpO1xuXHRcdFx0aWYgKG5vdGlmLm1ldGhvZCA9PT0gJ2FjdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBub3RpZi5wYXJhbXMgYXMgdW5rbm93biBhcyBBY3Rpb25FbnZlbG9wZSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0cmVjb3JkQWhwU3VyZmFjZSgnYWN0aW9uJywgZW52ZWxvcGU/LmFjdGlvbj8udHlwZSA/PyAnJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25zLnB1c2gobm90aWYpO1xuXHRcdFx0dGhpcy5fZmx1c2hOb3RpZmljYXRpb25XYWl0ZXJzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlU2VydmVyUmVxdWVzdChtc2c6IEpzb25ScGNSZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5faXNSZXZlcnNlUmVxdWVzdE1ldGhvZChtc2cubWV0aG9kKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIHJldmVyc2UgcmVxdWVzdCBtZXRob2Q6ICR7bXNnLm1ldGhvZH1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmFtcyA9IG1zZy5wYXJhbXMgYXMgeyB1cmk/OiBzdHJpbmc7IHNvdXJjZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc2VydmVkUmV2ZXJzZVJlcXVlc3RzLnB1c2goeyBtZXRob2Q6IG1zZy5tZXRob2QsIHVyaTogcGFyYW1zPy51cmkgPz8gcGFyYW1zPy5zb3VyY2UgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKG1zZy5tZXRob2QsIG1zZy5wYXJhbXMgYXMgUmV2ZXJzZVJlcXVlc3RQYXJhbXNCeU1ldGhvZFtSZXZlcnNlUmVxdWVzdE1ldGhvZF0pO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2U6IEpzb25ScGNTdWNjZXNzUmVzcG9uc2UgPSB7IGpzb25ycGM6ICcyLjAnLCBpZDogbXNnLmlkLCByZXN1bHQgfTtcblx0XHRcdHRoaXMuX2FocFNuYXBzaG90LnJlY29yZCgnYzJzJywgcmVzcG9uc2UpO1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeShyZXNwb25zZSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZTogSnNvblJwY0Vycm9yUmVzcG9uc2UgPSB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogbXNnLmlkLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IC0zMjYwMyxcblx0XHRcdFx0XHRtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYWhwU25hcHNob3QucmVjb3JkKCdjMnMnLCByZXNwb25zZSk7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNSZXZlcnNlUmVxdWVzdE1ldGhvZChtZXRob2Q6IHN0cmluZyk6IG1ldGhvZCBpcyBSZXZlcnNlUmVxdWVzdE1ldGhvZCB7XG5cdFx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRcdGNhc2UgJ2NyZWF0ZVJlc291cmNlV2F0Y2gnOlxuXHRcdFx0Y2FzZSAncmVzb3VyY2VSZXF1ZXN0Jzpcblx0XHRcdGNhc2UgJ3Jlc291cmNlUmVhZCc6XG5cdFx0XHRjYXNlICdyZXNvdXJjZUxpc3QnOlxuXHRcdFx0Y2FzZSAncmVzb3VyY2VSZXNvbHZlJzpcblx0XHRcdGNhc2UgJ3Jlc291cmNlV3JpdGUnOlxuXHRcdFx0Y2FzZSAncmVzb3VyY2VNa2Rpcic6XG5cdFx0XHRjYXNlICdyZXNvdXJjZURlbGV0ZSc6XG5cdFx0XHRjYXNlICdyZXNvdXJjZU1vdmUnOlxuXHRcdFx0Y2FzZSAncmVzb3VyY2VDb3B5Jzpcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZVJlcXVlc3QnLCBwYXJhbXM6IFJlc291cmNlUmVxdWVzdFBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXF1ZXN0UmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdjcmVhdGVSZXNvdXJjZVdhdGNoJywgcGFyYW1zOiBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zKTogUHJvbWlzZTxDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZVJlYWQnLCBwYXJhbXM6IFJlc291cmNlUmVhZFBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZUxpc3QnLCBwYXJhbXM6IFJlc291cmNlTGlzdFBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZVJlc29sdmUnLCBwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZVdyaXRlJywgcGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZU1rZGlyJywgcGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZURlbGV0ZScsIHBhcmFtczogUmVzb3VyY2VEZWxldGVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlRGVsZXRlUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZU1vdmUnLCBwYXJhbXM6IFJlc291cmNlTW92ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNb3ZlUmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChtZXRob2Q6ICdyZXNvdXJjZUNvcHknLCBwYXJhbXM6IFJlc291cmNlQ29weVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VDb3B5UmVzdWx0Pjtcblx0cHJpdmF0ZSBfaGFuZGxlU2VydmVyUmVxdWVzdE1ldGhvZChcblx0XHRtZXRob2Q6IFJldmVyc2VSZXF1ZXN0TWV0aG9kLFxuXHRcdHBhcmFtczogUmV2ZXJzZVJlcXVlc3RQYXJhbXNCeU1ldGhvZFtSZXZlcnNlUmVxdWVzdE1ldGhvZF0sXG5cdCk6IFByb21pc2U8UmV2ZXJzZVJlcXVlc3RSZXN1bHRCeU1ldGhvZFtSZXZlcnNlUmVxdWVzdE1ldGhvZF0+O1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVTZXJ2ZXJSZXF1ZXN0TWV0aG9kKFxuXHRcdG1ldGhvZDogUmV2ZXJzZVJlcXVlc3RNZXRob2QsXG5cdFx0cGFyYW1zOiBSZXZlcnNlUmVxdWVzdFBhcmFtc0J5TWV0aG9kW1JldmVyc2VSZXF1ZXN0TWV0aG9kXSxcblx0KTogUHJvbWlzZTxSZXZlcnNlUmVxdWVzdFJlc3VsdEJ5TWV0aG9kW1JldmVyc2VSZXF1ZXN0TWV0aG9kXT4ge1xuXHRcdHN3aXRjaCAobWV0aG9kKSB7XG5cdFx0XHRjYXNlICdjcmVhdGVSZXNvdXJjZVdhdGNoJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVJlc291cmNlV2F0Y2gocGFyYW1zIGFzIENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpO1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VSZXF1ZXN0Jzpcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VSZWFkJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlUmVhZChwYXJhbXMgYXMgUmVzb3VyY2VSZWFkUGFyYW1zKTtcblx0XHRcdGNhc2UgJ3Jlc291cmNlTGlzdCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZUxpc3QocGFyYW1zIGFzIFJlc291cmNlTGlzdFBhcmFtcyk7XG5cdFx0XHRjYXNlICdyZXNvdXJjZVJlc29sdmUnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VSZXNvbHZlKHBhcmFtcyBhcyBSZXNvdXJjZVJlc29sdmVQYXJhbXMpO1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VXcml0ZSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVdyaXRlKHBhcmFtcyBhcyBSZXNvdXJjZVdyaXRlUGFyYW1zKTtcblx0XHRcdGNhc2UgJ3Jlc291cmNlTWtkaXInOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VNa2RpcihwYXJhbXMgYXMgUmVzb3VyY2VNa2RpclBhcmFtcyk7XG5cdFx0XHRjYXNlICdyZXNvdXJjZURlbGV0ZSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZURlbGV0ZShwYXJhbXMgYXMgUmVzb3VyY2VEZWxldGVQYXJhbXMpO1xuXHRcdFx0Y2FzZSAncmVzb3VyY2VNb3ZlJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlTW92ZShwYXJhbXMgYXMgUmVzb3VyY2VNb3ZlUGFyYW1zKTtcblx0XHRcdGNhc2UgJ3Jlc291cmNlQ29weSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZUNvcHkocGFyYW1zIGFzIFJlc291cmNlQ29weVBhcmFtcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29lcmNlVXJpKHZhbHVlOiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkucGFyc2UodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXNzZXJ0RmlsZVVyaSh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBVUkkgc2NoZW1lIGZvciB0ZXN0IGNsaWVudCBmaWxlc3lzdGVtOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJpLmZzUGF0aDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BhdGhFeGlzdHMocGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN0YXQocGF0aCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZVJlYWQocGFyYW1zOiBSZXNvdXJjZVJlYWRQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX2NvZXJjZVVyaShwYXJhbXMudXJpKTtcblx0XHRjb25zdCBmaWxlUGF0aCA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodXJpKTtcblx0XHRjb25zdCBlbmNvZGluZyA9IHBhcmFtcy5lbmNvZGluZyA9PT0gQ29udGVudEVuY29kaW5nLlV0ZjggPyBDb250ZW50RW5jb2RpbmcuVXRmOCA6IENvbnRlbnRFbmNvZGluZy5CYXNlNjQ7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRGaWxlKGZpbGVQYXRoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YTogZW5jb2RpbmcgPT09IENvbnRlbnRFbmNvZGluZy5VdGY4ID8gY29udGVudC50b1N0cmluZygndXRmLTgnKSA6IGNvbnRlbnQudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuXHRcdFx0ZW5jb2RpbmcsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlTGlzdChwYXJhbXM6IFJlc291cmNlTGlzdFBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fY29lcmNlVXJpKHBhcmFtcy51cmkpO1xuXHRcdGNvbnN0IGRpclBhdGggPSB0aGlzLl9hc3NlcnRGaWxlVXJpKHVyaSk7XG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHJlYWRkaXIoZGlyUGF0aCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbnRyaWVzOiBlbnRyaWVzLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0XHRuYW1lOiBlbnRyeS5uYW1lLFxuXHRcdFx0XHR0eXBlOiBlbnRyeS5pc0RpcmVjdG9yeSgpID8gJ2RpcmVjdG9yeScgOiAnZmlsZScsXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlUmVzb2x2ZShwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVxdWVzdGVkID0gdGhpcy5fY29lcmNlVXJpKHBhcmFtcy51cmkpO1xuXHRcdGNvbnN0IHJlcXVlc3RlZFBhdGggPSB0aGlzLl9hc3NlcnRGaWxlVXJpKHJlcXVlc3RlZCk7XG5cdFx0Y29uc3QgZm9sbG93U3ltbGlua3MgPSBwYXJhbXMuZm9sbG93U3ltbGlua3MgPz8gdHJ1ZTtcblx0XHRjb25zdCBsc3QgPSBhd2FpdCBsc3RhdChyZXF1ZXN0ZWRQYXRoKTtcblx0XHRpZiAobHN0LmlzU3ltYm9saWNMaW5rKCkgJiYgZm9sbG93U3ltbGlua3MpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkUGF0aCA9IGF3YWl0IHJlYWxwYXRoKHJlcXVlc3RlZFBhdGgpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRVcmkgPSBVUkkuZmlsZShyZXNvbHZlZFBhdGgpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRTdGF0ID0gYXdhaXQgc3RhdChyZXNvbHZlZFBhdGgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiByZXNvbHZlZFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR0eXBlOiByZXNvbHZlZFN0YXQuaXNEaXJlY3RvcnkoKSA/IFJlc291cmNlVHlwZS5EaXJlY3RvcnkgOiBSZXNvdXJjZVR5cGUuRmlsZSxcblx0XHRcdFx0c2l6ZTogcmVzb2x2ZWRTdGF0LmlzRGlyZWN0b3J5KCkgPyB1bmRlZmluZWQgOiByZXNvbHZlZFN0YXQuc2l6ZSxcblx0XHRcdFx0bXRpbWU6IHJlc29sdmVkU3RhdC5tdGltZS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRjdGltZTogcmVzb2x2ZWRTdGF0LmN0aW1lLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdGV0YWc6IGBXL1wiJHtyZXNvbHZlZFN0YXQuc2l6ZX0tJHtNYXRoLnRydW5jKHJlc29sdmVkU3RhdC5tdGltZU1zKX1cImAsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBzdCA9IGZvbGxvd1N5bWxpbmtzID8gYXdhaXQgc3RhdChyZXF1ZXN0ZWRQYXRoKSA6IGxzdDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiByZXF1ZXN0ZWQudG9TdHJpbmcoKSxcblx0XHRcdHR5cGU6IGxzdC5pc1N5bWJvbGljTGluaygpICYmICFmb2xsb3dTeW1saW5rcyA/IFJlc291cmNlVHlwZS5TeW1saW5rIDogKHN0LmlzRGlyZWN0b3J5KCkgPyBSZXNvdXJjZVR5cGUuRGlyZWN0b3J5IDogUmVzb3VyY2VUeXBlLkZpbGUpLFxuXHRcdFx0c2l6ZTogc3QuaXNEaXJlY3RvcnkoKSA/IHVuZGVmaW5lZCA6IHN0LnNpemUsXG5cdFx0XHRtdGltZTogc3QubXRpbWUudG9JU09TdHJpbmcoKSxcblx0XHRcdGN0aW1lOiBzdC5jdGltZS50b0lTT1N0cmluZygpLFxuXHRcdFx0ZXRhZzogYFcvXCIke3N0LnNpemV9LSR7TWF0aC50cnVuYyhzdC5tdGltZU1zKX1cImAsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlV3JpdGUocGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fY29lcmNlVXJpKHBhcmFtcy51cmkpO1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh1cmkpO1xuXHRcdGNvbnN0IGRhdGFFbmNvZGluZyA9IHBhcmFtcy5lbmNvZGluZyA9PT0gQ29udGVudEVuY29kaW5nLlV0ZjggPyBDb250ZW50RW5jb2RpbmcuVXRmOCA6IENvbnRlbnRFbmNvZGluZy5CYXNlNjQ7XG5cdFx0Y29uc3QgaW5jb21pbmcgPSBCdWZmZXIuZnJvbShwYXJhbXMuZGF0YSwgZGF0YUVuY29kaW5nKTtcblx0XHRjb25zdCBtb2RlID0gcGFyYW1zLm1vZGUgPz8gUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGU7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBNYXRoLm1heCgwLCBwYXJhbXMucG9zaXRpb24gPz8gMCk7XG5cdFx0Y29uc3QgY3JlYXRlT25seSA9IHBhcmFtcy5jcmVhdGVPbmx5ID8/IGZhbHNlO1xuXG5cdFx0YXdhaXQgbWtkaXIoZGlybmFtZShmaWxlUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuX3BhdGhFeGlzdHMoZmlsZVBhdGgpO1xuXHRcdGlmIChjcmVhdGVPbmx5ICYmIGV4aXN0cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVQYXRofWApO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IGV4aXN0cyA/IGF3YWl0IHJlYWRGaWxlKGZpbGVQYXRoKSA6IEJ1ZmZlci5hbGxvYygwKTtcblx0XHRjb25zdCBjbGFtcGVkU3RhcnQgPSBNYXRoLm1pbihwb3NpdGlvbiwgZXhpc3RpbmcubGVuZ3RoKTtcblx0XHRsZXQgbmV4dDogQnVmZmVyO1xuXHRcdHN3aXRjaCAobW9kZSkge1xuXHRcdFx0Y2FzZSBSZXNvdXJjZVdyaXRlTW9kZS5BcHBlbmQ6IHtcblx0XHRcdFx0Y29uc3QgaW5zZXJ0QXQgPSBNYXRoLm1heCgwLCBleGlzdGluZy5sZW5ndGggLSBNYXRoLm1pbihwb3NpdGlvbiwgZXhpc3RpbmcubGVuZ3RoKSk7XG5cdFx0XHRcdG5leHQgPSBCdWZmZXIuY29uY2F0KFtleGlzdGluZy5zdWJhcnJheSgwLCBpbnNlcnRBdCksIGluY29taW5nLCBleGlzdGluZy5zdWJhcnJheShpbnNlcnRBdCldKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFJlc291cmNlV3JpdGVNb2RlLkluc2VydDpcblx0XHRcdFx0bmV4dCA9IEJ1ZmZlci5jb25jYXQoW2V4aXN0aW5nLnN1YmFycmF5KDAsIGNsYW1wZWRTdGFydCksIGluY29taW5nLCBleGlzdGluZy5zdWJhcnJheShjbGFtcGVkU3RhcnQpXSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSZXNvdXJjZVdyaXRlTW9kZS5UcnVuY2F0ZTpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG5leHQgPSBCdWZmZXIuY29uY2F0KFtleGlzdGluZy5zdWJhcnJheSgwLCBjbGFtcGVkU3RhcnQpLCBpbmNvbWluZ10pO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0YXdhaXQgd3JpdGVGaWxlKGZpbGVQYXRoLCBuZXh0KTtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZU1rZGlyKHBhcmFtczogUmVzb3VyY2VNa2RpclBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNa2RpclJlc3VsdD4ge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX2NvZXJjZVVyaShwYXJhbXMudXJpKTtcblx0XHRjb25zdCBkaXJQYXRoID0gdGhpcy5fYXNzZXJ0RmlsZVVyaSh1cmkpO1xuXHRcdGF3YWl0IG1rZGlyKGRpclBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlRGVsZXRlKHBhcmFtczogUmVzb3VyY2VEZWxldGVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlRGVsZXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fY29lcmNlVXJpKHBhcmFtcy51cmkpO1xuXHRcdGNvbnN0IHRhcmdldFBhdGggPSB0aGlzLl9hc3NlcnRGaWxlVXJpKHVyaSk7XG5cdFx0YXdhaXQgcm0odGFyZ2V0UGF0aCwgeyByZWN1cnNpdmU6IHBhcmFtcy5yZWN1cnNpdmUgPz8gZmFsc2UsIGZvcmNlOiBmYWxzZSB9KTtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZU1vdmUocGFyYW1zOiBSZXNvdXJjZU1vdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlTW92ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodGhpcy5fY29lcmNlVXJpKHBhcmFtcy5zb3VyY2UpKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodGhpcy5fY29lcmNlVXJpKHBhcmFtcy5kZXN0aW5hdGlvbikpO1xuXHRcdGNvbnN0IGZhaWxJZkV4aXN0cyA9IHBhcmFtcy5mYWlsSWZFeGlzdHMgPz8gZmFsc2U7XG5cdFx0aWYgKGZhaWxJZkV4aXN0cyAmJiBhd2FpdCB0aGlzLl9wYXRoRXhpc3RzKGRlc3RpbmF0aW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBEZXN0aW5hdGlvbiBhbHJlYWR5IGV4aXN0czogJHtkZXN0aW5hdGlvbn1gKTtcblx0XHR9XG5cdFx0YXdhaXQgbWtkaXIoZGlybmFtZShkZXN0aW5hdGlvbiksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHJlbmFtZShzb3VyY2UsIGRlc3RpbmF0aW9uKTtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZUNvcHkocGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlQ29weVJlc3VsdD4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodGhpcy5fY29lcmNlVXJpKHBhcmFtcy5zb3VyY2UpKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IHRoaXMuX2Fzc2VydEZpbGVVcmkodGhpcy5fY29lcmNlVXJpKHBhcmFtcy5kZXN0aW5hdGlvbikpO1xuXHRcdGNvbnN0IGZhaWxJZkV4aXN0cyA9IHBhcmFtcy5mYWlsSWZFeGlzdHMgPz8gZmFsc2U7XG5cdFx0aWYgKGZhaWxJZkV4aXN0cyAmJiBhd2FpdCB0aGlzLl9wYXRoRXhpc3RzKGRlc3RpbmF0aW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBEZXN0aW5hdGlvbiBhbHJlYWR5IGV4aXN0czogJHtkZXN0aW5hdGlvbn1gKTtcblx0XHR9XG5cdFx0YXdhaXQgbWtkaXIoZGlybmFtZShkZXN0aW5hdGlvbiksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGNwKHNvdXJjZSwgZGVzdGluYXRpb24sIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogIWZhaWxJZkV4aXN0cywgZXJyb3JPbkV4aXN0OiBmYWlsSWZFeGlzdHMgfSk7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlUmVzb3VyY2VXYXRjaChfcGFyYW1zOiBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zKTogUHJvbWlzZTxDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHsgY2hhbm5lbDogYGFocC1yZXNvdXJjZS13YXRjaDovbW9jay0ke3RoaXMuX25leHRXYXRjaElkKyt9YCB9O1xuXHR9XG5cblx0LyoqIFNlbmQgYSBKU09OLVJQQyBub3RpZmljYXRpb24gKGZpcmUtYW5kLWZvcmdldCkuICovXG5cdG5vdGlmeShtZXRob2Q6IHN0cmluZywgcGFyYW1zPzogdW5rbm93bik6IHZvaWQge1xuXHRcdHJlY29yZEFocFN1cmZhY2UoJ2NvbW1hbmQnLCBtZXRob2QpO1xuXHRcdGlmIChtZXRob2QgPT09ICdkaXNwYXRjaEFjdGlvbicpIHtcblx0XHRcdGNvbnN0IGRpc3BhdGNoZWQgPSBwYXJhbXMgYXMgRGlzcGF0Y2hBY3Rpb25QYXJhbXMgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZWNvcmRBaHBTdXJmYWNlKCdhY3Rpb24nLCBkaXNwYXRjaGVkPy5hY3Rpb24/LnR5cGUgPz8gJycpO1xuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlOiBKc29uUnBjTm90aWZpY2F0aW9uID0geyBqc29ucnBjOiAnMi4wJywgbWV0aG9kLCBwYXJhbXMgfTtcblx0XHR0aGlzLl9haHBTbmFwc2hvdC5yZWNvcmQoJ2MycycsIG1lc3NhZ2UpO1xuXHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgc3Ryb25nbHktdHlwZWQgcHJvdG9jb2wgYWN0aW9uIChmaXJlLWFuZC1mb3JnZXQgd3JpdGUtYWhlYWQpLlxuXHQgKlxuXHQgKiBQcmVmZXIgdGhpcyBvdmVyIHRoZSByYXcge0BsaW5rIG5vdGlmeX0gZXNjYXBlIGhhdGNoOiB0aGUgYWN0aW9uIHBheWxvYWRcblx0ICogaXMgY2hlY2tlZCBhZ2FpbnN0IHRoZSB7QGxpbmsgU3RhdGVBY3Rpb259IHVuaW9uIGF0IGNvbXBpbGUgdGltZSwgc28gYVxuXHQgKiBtYWxmb3JtZWQgb3IgaW5jb21wbGV0ZSBhY3Rpb24gKGUuZy4gYW4gYXBwcm92YWwgbWlzc2luZyBpdHMgcmVxdWlyZWRcblx0ICogYGNvbmZpcm1lZGAgZmllbGQpIGlzIGNhdWdodCBieSB0aGUgdHlwZS1jaGVja2VyIHJhdGhlciB0aGFuIHNpbGVudGx5XG5cdCAqIHNoaXBwZWQgb3ZlciB0aGUgd2lyZSBhbmQgcmVkdWNlZCBpbnRvIGB1bmRlZmluZWRgLlxuXHQgKi9cblx0ZGlzcGF0Y2gocGFyYW1zOiBEaXNwYXRjaEFjdGlvblBhcmFtcyk6IHZvaWQge1xuXHRcdHRoaXMubm90aWZ5KCdkaXNwYXRjaEFjdGlvbicsIHBhcmFtcyk7XG5cdH1cblxuXHQvKiogU2VuZCBhIEpTT04tUlBDIHJlcXVlc3QgYW5kIGF3YWl0IHRoZSByZXNwb25zZS4gKi9cblx0Y2FsbDxUPihtZXRob2Q6IHN0cmluZywgcGFyYW1zPzogdW5rbm93biwgdGltZW91dE1zID0gZ2V0UHJvdG9jb2xPcGVyYXRpb25UaW1lb3V0KCkpOiBQcm9taXNlPFQ+IHtcblx0XHRyZWNvcmRBaHBTdXJmYWNlKCdjb21tYW5kJywgbWV0aG9kKTtcblx0XHRjb25zdCBpZCA9IHRoaXMuX25leHRJZCsrO1xuXHRcdGNvbnN0IG1lc3NhZ2U6IEpzb25ScGNSZXF1ZXN0ID0geyBqc29ucnBjOiAnMi4wJywgaWQsIG1ldGhvZCwgcGFyYW1zIH07XG5cdFx0dGhpcy5fYWhwU25hcHNob3QucmVjb3JkKCdjMnMnLCBtZXNzYWdlKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0NhbGxzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYFRpbWVvdXQgd2FpdGluZyBmb3IgcmVzcG9uc2UgdG8gJHttZXRob2R9IChpZD0ke2lkfSwgJHt0aW1lb3V0TXN9bXMpYCkpO1xuXHRcdFx0fSwgdGltZW91dE1zKTtcblxuXHRcdFx0dGhpcy5fcGVuZGluZ0NhbGxzLnNldChpZCwge1xuXHRcdFx0XHRyZXNvbHZlOiByZXN1bHQgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyByZXNvbHZlKHJlc3VsdCBhcyBUKTsgfSxcblx0XHRcdFx0cmVqZWN0OiBlcnIgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyByZWplY3QoZXJyKTsgfSxcblx0XHRcdH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2FsbHMuZGVsZXRlKGlkKTtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKiBXYWl0IGZvciBhIHNlcnZlciBub3RpZmljYXRpb24gbWF0Y2hpbmcgYSBwcmVkaWNhdGUuICovXG5cdHdhaXRGb3JOb3RpZmljYXRpb24ocHJlZGljYXRlOiAobjogQWhwTm90aWZpY2F0aW9uKSA9PiBib29sZWFuLCB0aW1lb3V0TXMgPSBnZXRQcm90b2NvbE9wZXJhdGlvblRpbWVvdXQoKSk6IFByb21pc2U8QWhwTm90aWZpY2F0aW9uPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9ub3RpZmljYXRpb25zLmZpbmQocHJlZGljYXRlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZXhpc3RpbmcpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxBaHBOb3RpZmljYXRpb24+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHdhaXRlciA9IHtcblx0XHRcdFx0cHJlZGljYXRlLFxuXHRcdFx0XHRyZXNvbHZlLFxuXHRcdFx0XHRyZWplY3QsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGNsZWFyVGltZW91dCh0aW1lciksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlTm90aWZpY2F0aW9uV2FpdGVyKHdhaXRlcik7XG5cdFx0XHRcdGNvbnN0IHJlY2VpdmVkID0gdGhpcy5fbm90aWZpY2F0aW9ucy5tYXAobiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbi5tZXRob2QgPT09ICdhY3Rpb24nID8gKG4ucGFyYW1zIGFzIEFjdGlvbkVudmVsb3BlKS5hY3Rpb24udHlwZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uID8gYCR7bi5tZXRob2R9OiR7YWN0aW9ufWAgOiBuLm1ldGhvZDtcblx0XHRcdFx0fSkuam9pbignLCAnKTtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCB3YWl0aW5nIGZvciBub3RpZmljYXRpb24gKCR7dGltZW91dE1zfW1zKS4gUmVjZWl2ZWQ6ICR7cmVjZWl2ZWR9YCkpO1xuXHRcdFx0fSwgdGltZW91dE1zKTtcblx0XHRcdHRoaXMuX25vdGlmV2FpdGVycy5wdXNoKHdhaXRlcik7XG5cdFx0XHR0aGlzLl9mbHVzaE5vdGlmaWNhdGlvbldhaXRlcnMoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZsdXNoTm90aWZpY2F0aW9uV2FpdGVycygpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5fbm90aWZXYWl0ZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCB3YWl0ZXIgPSB0aGlzLl9ub3RpZldhaXRlcnNbaV07XG5cdFx0XHRjb25zdCBtYXRjaCA9IHRoaXMuX25vdGlmaWNhdGlvbnMuZmluZCh3YWl0ZXIucHJlZGljYXRlKTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHR0aGlzLl9ub3RpZldhaXRlcnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHR3YWl0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR3YWl0ZXIucmVzb2x2ZShtYXRjaCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlTm90aWZpY2F0aW9uV2FpdGVyKHdhaXRlcjogeyBwcmVkaWNhdGU6IChuOiBBaHBOb3RpZmljYXRpb24pID0+IGJvb2xlYW47IHJlc29sdmU6IChuOiBBaHBOb3RpZmljYXRpb24pID0+IHZvaWQ7IHJlamVjdDogKGVycjogRXJyb3IpID0+IHZvaWQ7IGRpc3Bvc2U6ICgpID0+IHZvaWQgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX25vdGlmV2FpdGVycy5pbmRleE9mKHdhaXRlcik7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9ub3RpZldhaXRlcnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJldHVybiBhbGwgcmVjZWl2ZWQgbm90aWZpY2F0aW9ucyBtYXRjaGluZyBhIHByZWRpY2F0ZS4gKi9cblx0cmVjZWl2ZWROb3RpZmljYXRpb25zKHByZWRpY2F0ZT86IChuOiBBaHBOb3RpZmljYXRpb24pID0+IGJvb2xlYW4pOiBBaHBOb3RpZmljYXRpb25bXSB7XG5cdFx0cmV0dXJuIHByZWRpY2F0ZSA/IHRoaXMuX25vdGlmaWNhdGlvbnMuZmlsdGVyKHByZWRpY2F0ZSkgOiBbLi4udGhpcy5fbm90aWZpY2F0aW9uc107XG5cdH1cblxuXHQvKiogU2VuZCBhIHJhdyBzdHJpbmcgb3ZlciB0aGUgV2ViU29ja2V0IHdpdGhvdXQgSlNPTiBzZXJpYWxpemF0aW9uLiAqL1xuXHRzZW5kUmF3KGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dzLnNlbmQoZGF0YSk7XG5cdH1cblxuXHQvKiogV2FpdCBmb3IgdGhlIG5leHQgcmF3IG1lc3NhZ2UgZnJvbSB0aGUgc2VydmVyLiAqL1xuXHR3YWl0Rm9yUmF3TWVzc2FnZSh0aW1lb3V0TXMgPSBnZXRQcm90b2NvbE9wZXJhdGlvblRpbWVvdXQoKSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYFRpbWVvdXQgd2FpdGluZyBmb3IgcmF3IG1lc3NhZ2UgKCR7dGltZW91dE1zfW1zKWApKTtcblx0XHRcdH0sIHRpbWVvdXRNcyk7XG5cdFx0XHRjb25zdCBvbk1zZyA9IChkYXRhOiBCdWZmZXIgfCBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gdHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnID8gZGF0YSA6IGRhdGEudG9TdHJpbmcoJ3V0Zi04Jyk7XG5cdFx0XHRcdHJlc29sdmUoSlNPTi5wYXJzZSh0ZXh0KSk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2xlYW51cCA9ICgpID0+IHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0dGhpcy5fd3MucmVtb3ZlTGlzdGVuZXIoJ21lc3NhZ2UnLCBvbk1zZyk7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fd3Mub24oJ21lc3NhZ2UnLCBvbk1zZyk7XG5cdFx0fSk7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY2xvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Nsb3NlZCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCB3IG9mIHRoaXMuX25vdGlmV2FpdGVycykge1xuXHRcdFx0dy5kaXNwb3NlKCk7XG5cdFx0XHR3LnJlamVjdChuZXcgRXJyb3IoJ0NsaWVudCBjbG9zZWQnKSk7XG5cdFx0fVxuXHRcdHRoaXMuX25vdGlmV2FpdGVycy5sZW5ndGggPSAwO1xuXHRcdGZvciAoY29uc3QgWywgcF0gb2YgdGhpcy5fcGVuZGluZ0NhbGxzKSB7XG5cdFx0XHRwLnJlamVjdChuZXcgRXJyb3IoJ0NsaWVudCBjbG9zZWQnKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdDYWxscy5jbGVhcigpO1xuXHRcdHRoaXMuX3dzLmNsb3NlKCk7XG5cdH1cblxuXHRjbGVhclJlY2VpdmVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX25vdGlmaWNhdGlvbnMubGVuZ3RoID0gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXZlcnNlIHJlcXVlc3RzIHRoZSBob3N0IGhhcyBzZW50IHRvIHRoaXMgY2xpZW50LCBpbiBhcnJpdmFsIG9yZGVyLlxuXHQgKiBTZXBhcmF0ZSBmcm9tIHtAbGluayBjbGVhclJlY2VpdmVkfSBzbyByZXNldHRpbmcgbm90aWZpY2F0aW9ucyBkb2VzIG5vdFxuXHQgKiBzaWxlbnRseSBkaXNjYXJkIHRoaXMgaGlzdG9yeS5cblx0ICovXG5cdGdldCBzZXJ2ZWRSZXZlcnNlUmVxdWVzdHMoKTogcmVhZG9ubHkgSVNlcnZlZFJldmVyc2VSZXF1ZXN0W10ge1xuXHRcdHJldHVybiB0aGlzLl9zZXJ2ZWRSZXZlcnNlUmVxdWVzdHM7XG5cdH1cblxuXHRjbGVhclNlcnZlZFJldmVyc2VSZXF1ZXN0cygpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXJ2ZWRSZXZlcnNlUmVxdWVzdHMubGVuZ3RoID0gMDtcblx0fVxuXG5cdGNsZWFyQWhwU25hcHNob3QoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWhwU25hcHNob3QuY2xlYXIoKTtcblx0fVxuXG5cdHNldEFocFNuYXBzaG90Tm9ybWFsaXphdGlvbihub3JtYWxpemF0aW9uOiBJQWhwU25hcHNob3ROb3JtYWxpemF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fYWhwU25hcHNob3Quc2V0Tm9ybWFsaXphdGlvbihub3JtYWxpemF0aW9uKTtcblx0fVxuXG5cdHNldFdvcmtpbmdEaXJlY3Rvcnkod29ya2luZ0RpcmVjdG9yeTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0V29ya2luZ0RpcmVjdG9yeT8uKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHR9XG5cblx0YmVnaW5BaHBTbmFwc2hvdFJvdW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FocFNuYXBzaG90LmJlZ2luUm91bmQoKTtcblx0fVxuXG5cdHNlcmlhbGl6ZUFocFNuYXBzaG90KG9wdGlvbnM/OiBJQWhwU25hcHNob3RPcHRpb25zKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fYWhwU25hcHNob3Quc2VyaWFsaXplKG9wdGlvbnMpO1xuXHR9XG5cblx0dGFrZVJlcGxheUVycm9yKCk6IEVycm9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGFrZVJlcGxheUVycm9yPy4oKTtcblx0fVxufVxuXG4vLyAtLS0tIFNlcnZlciBwcm9jZXNzIGxpZmVjeWNsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJ2ZXJIYW5kbGUge1xuXHRwcm9jZXNzOiBDaGlsZFByb2Nlc3M7XG5cdHBvcnQ6IG51bWJlcjtcblx0LyoqIFByZXNlbnQgd2hlbiB0aGUgc2VydmVyIHdhcyBzdGFydGVkIHdpdGggYSBtb2NrIExMTTsgZXhwb3NlcyByZXF1ZXN0IGNvdW50IGZvciBhc3NlcnRpb25zLiAqL1xuXHRtb2NrTGxtPzogSU1vY2tMbG1TZXJ2ZXJIYW5kbGVXaXRoTG9nO1xuXHQvKipcblx0ICogUHJlc2VudCB3aGVuIHRoZSBzZXJ2ZXIgd2FzIHN0YXJ0ZWQgd2l0aCBgY2FwaVJlcGxheWAuIFN0b3AgaXQgKGlkZWFsbHkgaW5cblx0ICogYHN1aXRlVGVhcmRvd25gLCBiZWZvcmUga2lsbGluZyB0aGUgcHJvY2VzcykgdG8gZmx1c2ggcmVjb3JkZWQgZXhjaGFuZ2VzIHRvXG5cdCAqIHRoZSBmaXh0dXJlIGFuZCBzdXJmYWNlIHN0cmljdC1tb2RlIGNhY2hlIG1pc3Nlcy5cblx0ICovXG5cdGNhcGlSZXBsYXk/OiBDYXBpUmVwbGF5UHJveHk7XG59XG5cbmNvbnN0IFNFUlZFUl9TSFVURE9XTl9USU1FT1VUX01TID0gaXNXaW5kb3dzIHx8IHByb2Nlc3MuZW52WydBR0VOVF9IT1NUX0UyRV9DT1ZFUkFHRSddID09PSAnMScgPyAzMF8wMDAgOiA1XzAwMDtcblxuLyoqIEdyYWNlZnVsbHkgc3RvcCBhbiBBZ2VudCBIb3N0IHRlc3Qgc2VydmVyLCBraWxsaW5nIGl0IGlmIHNodXRkb3duIHN0YWxscy4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdG9wU2VydmVyKHNlcnZlcjogSVNlcnZlckhhbmRsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzZXJ2ZXJQcm9jZXNzID0gc2VydmVyPy5wcm9jZXNzO1xuXHRpZiAoIXNlcnZlclByb2Nlc3MgfHwgc2VydmVyUHJvY2Vzcy5leGl0Q29kZSAhPT0gbnVsbCB8fCBzZXJ2ZXJQcm9jZXNzLnNpZ25hbENvZGUgIT09IG51bGwpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBzZXJ2ZXJFeGl0ID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0Y29uc3Qgb25FeGl0ID0gKCkgPT4gcmVzb2x2ZSgpO1xuXHRcdHNlcnZlclByb2Nlc3Mub25jZSgnZXhpdCcsIG9uRXhpdCk7XG5cdFx0aWYgKHNlcnZlclByb2Nlc3MuZXhpdENvZGUgIT09IG51bGwgfHwgc2VydmVyUHJvY2Vzcy5zaWduYWxDb2RlICE9PSBudWxsKSB7XG5cdFx0XHRzZXJ2ZXJQcm9jZXNzLnJlbW92ZUxpc3RlbmVyKCdleGl0Jywgb25FeGl0KTtcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9XG5cdH0pO1xuXHRzZXJ2ZXJQcm9jZXNzLnN0ZGluPy5lbmQoKTtcblx0aWYgKCFhd2FpdCByYWNlVGltZW91dChzZXJ2ZXJFeGl0LnRoZW4oKCkgPT4gdHJ1ZSksIFNFUlZFUl9TSFVURE9XTl9USU1FT1VUX01TKSkge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoc2VydmVyUHJvY2Vzcy5leGl0Q29kZSA9PT0gbnVsbCAmJiBzZXJ2ZXJQcm9jZXNzLnNpZ25hbENvZGUgPT09IG51bGwpIHtcblx0XHRcdFx0Y29uc3Qga2lsbGVkID0gc2VydmVyUHJvY2Vzcy5raWxsKCdTSUdLSUxMJyk7XG5cdFx0XHRcdGlmICgha2lsbGVkICYmIHNlcnZlclByb2Nlc3MuZXhpdENvZGUgPT09IG51bGwgJiYgc2VydmVyUHJvY2Vzcy5zaWduYWxDb2RlID09PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gdGVybWluYXRlIEFnZW50IEhvc3QgdGVzdCBzZXJ2ZXInKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoc2VydmVyUHJvY2Vzcy5leGl0Q29kZSA9PT0gbnVsbCAmJiBzZXJ2ZXJQcm9jZXNzLnNpZ25hbENvZGUgPT09IG51bGwpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHNlcnZlckV4aXQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNb2NrTGxtU2VydmVySGFuZGxlIHtcblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlcXVlc3RDb3VudCgpOiBudW1iZXI7XG5cdGdldFJlcXVlc3RzPygpOiByZWFkb25seSB1bmtub3duW107XG5cdGNsb3NlKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJTW9ja0xsbVNlcnZlckhhbmRsZVdpdGhMb2cgZXh0ZW5kcyBJTW9ja0xsbVNlcnZlckhhbmRsZSB7XG5cdGxvZ01lc3NhZ2VzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIElNb2NrTGxtU2VydmVyTW9kdWxlIHtcblx0c3RhcnRTZXJ2ZXIocG9ydDogbnVtYmVyLCBvcHRpb25zPzogeyBsb2dnZXI/OiAobXNnOiBzdHJpbmcpID0+IHZvaWQ7IHZlcmJvc2U/OiBib29sZWFuOyBjYXB0dXJlUmVxdWVzdHM/OiBib29sZWFuIH0pOiBQcm9taXNlPElNb2NrTGxtU2VydmVySGFuZGxlPjtcblx0cmVnaXN0ZXJTY2VuYXJpbyhpZDogc3RyaW5nLCBkZWZpbml0aW9uOiB1bmtub3duKTogdm9pZDtcbn1cblxuLyoqIEEgbW9jay1MTE0gc2NlbmFyaW8gdG8gcmVnaXN0ZXIgYmVmb3JlIHJlY29yZGluZyAoc2VlIGBtb2NrLWxsbS1zZXJ2ZXIudHNgKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1vY2tTY2VuYXJpbyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlZmluaXRpb246IHVua25vd247XG59XG5cbmNvbnN0IEFHRU5UX0hPU1RfRTJFX0NPVkVSQUdFID0gcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfRTJFX0NPVkVSQUdFJ10gPT09ICcxJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0KG5vcm1hbFRpbWVvdXRNczogbnVtYmVyLCBleHRlbmRlZFRpbWVvdXRNczogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIEFHRU5UX0hPU1RfRTJFX0NPVkVSQUdFIHx8IGlzV2luZG93cyA/IGV4dGVuZGVkVGltZW91dE1zIDogbm9ybWFsVGltZW91dE1zO1xufVxuXG5mdW5jdGlvbiB3aXRoQWdlbnRIb3N0Q292ZXJhZ2UoZW52aXJvbm1lbnQ6IE5vZGVKUy5Qcm9jZXNzRW52KTogTm9kZUpTLlByb2Nlc3NFbnYge1xuXHRjb25zdCBjaGlsZEVudmlyb25tZW50ID0geyAuLi5lbnZpcm9ubWVudCB9O1xuXHRpZiAoQUdFTlRfSE9TVF9FMkVfQ09WRVJBR0UpIHtcblx0XHRjb25zdCBjb3ZlcmFnZVBhdGggPSByZXNvbHZlUGF0aChwcm9jZXNzLmN3ZCgpLCAnLmJ1aWxkJywgJ2FnZW50LWhvc3QtZTJlLWNvdmVyYWdlJywgJ3JhdycpO1xuXHRcdG1rZGlyU3luYyhjb3ZlcmFnZVBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGNoaWxkRW52aXJvbm1lbnQuTk9ERV9WOF9DT1ZFUkFHRSA9IGNvdmVyYWdlUGF0aDtcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgY2hpbGRFbnZpcm9ubWVudC5OT0RFX1Y4X0NPVkVSQUdFO1xuXHR9XG5cdHJldHVybiBjaGlsZEVudmlyb25tZW50O1xufVxuXG5mdW5jdGlvbiBidWlsZENvcGlsb3RDaGF0VG9rZW4obW9ja1VybDogc3RyaW5nLCBjb3BpbG90UGxhbjogJ2ZyZWUnIHwgJ3BybycgPSAnZnJlZScpOiBzdHJpbmcge1xuXHRyZXR1cm4gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoe1xuXHRcdHRva2VuOiAnc21va2V0ZXN0LWZha2UtdG9rZW4nLFxuXHRcdGV4cGlyZXNfYXQ6IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgMzYwMCxcblx0XHRyZWZyZXNoX2luOiAxODAwLFxuXHRcdHNrdTogY29waWxvdFBsYW4gPT09ICdwcm8nID8gJ2luZGl2aWR1YWxfc3Vic2NyaXB0aW9uX2NvcGlsb3QnIDogJ2ZyZWVfbGltaXRlZF9jb3BpbG90Jyxcblx0XHRpbmRpdmlkdWFsOiB0cnVlLFxuXHRcdGlzTm9BdXRoVXNlcjogdHJ1ZSxcblx0XHRjb3BpbG90X3BsYW46IGNvcGlsb3RQbGFuLFxuXHRcdG9yZ2FuaXphdGlvbl9sb2dpbl9saXN0OiBbXSxcblx0XHRlbmRwb2ludHM6IHsgYXBpOiBtb2NrVXJsLCBwcm94eTogbW9ja1VybCB9LFxuXHR9KSkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzdGFydE1vY2tMbG1TZXJ2ZXIoc2NlbmFyaW9zPzogcmVhZG9ubHkgSU1vY2tTY2VuYXJpb1tdKTogUHJvbWlzZTxJTW9ja0xsbVNlcnZlckhhbmRsZVdpdGhMb2c+IHtcblx0Y29uc3QgbW9ja1NlcnZlclBhdGggPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4uLy4uLy4uLy4uLy4uLy4uL3NjcmlwdHMvY2hhdC1zaW11bGF0aW9uL2NvbW1vbi9tb2NrLWxsbS1zZXJ2ZXIudHMnLCBpbXBvcnQubWV0YS51cmwpKTtcblx0Y29uc3Qgbm9kZVJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7XG5cdGNvbnN0IG1vY2tNb2R1bGUgPSBub2RlUmVxdWlyZShtb2NrU2VydmVyUGF0aCkgYXMgSU1vY2tMbG1TZXJ2ZXJNb2R1bGU7XG5cdG1vY2tNb2R1bGUucmVnaXN0ZXJTY2VuYXJpbygndGV4dC1vbmx5Jywge1xuXHRcdHR5cGU6ICdtdWx0aS10dXJuJyxcblx0XHR0dXJuczogW3sga2luZDogJ2VjaG8tbGFzdC1tZXNzYWdlJyB9XSxcblx0fSk7XG5cdGZvciAoY29uc3Qgc2NlbmFyaW8gb2Ygc2NlbmFyaW9zID8/IFtdKSB7XG5cdFx0bW9ja01vZHVsZS5yZWdpc3RlclNjZW5hcmlvKHNjZW5hcmlvLmlkLCBzY2VuYXJpby5kZWZpbml0aW9uKTtcblx0fVxuXHRjb25zdCBtZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgc2VydmVySGFuZGxlID0gYXdhaXQgbW9ja01vZHVsZS5zdGFydFNlcnZlcigwLCB7IGxvZ2dlcjogbXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSwgdmVyYm9zZTogdHJ1ZSwgY2FwdHVyZVJlcXVlc3RzOiB0cnVlIH0pO1xuXHRyZXR1cm4geyAuLi5zZXJ2ZXJIYW5kbGUsIGxvZ01lc3NhZ2VzOiBtZXNzYWdlcyB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhcnRTZXJ2ZXIob3B0aW9ucz86IHsgcmVhZG9ubHkgcXVpZXQ/OiBib29sZWFuOyByZWFkb25seSB1c2VyRGF0YURpcj86IHN0cmluZzsgcmVhZG9ubHkgZW52PzogTm9kZUpTLlByb2Nlc3NFbnY7IHJlYWRvbmx5IHN0YXJ0dXBUaW1lb3V0TXM/OiBudW1iZXIgfSk6IFByb21pc2U8SVNlcnZlckhhbmRsZT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlclBhdGggPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4uLy4uL25vZGUvYWdlbnRIb3N0U2VydmVyTWFpbi5qcycsIGltcG9ydC5tZXRhLnVybCkpO1xuXHRcdGNvbnN0IGFyZ3MgPSBbJy0tZW5hYmxlLW1vY2stYWdlbnQnLCAnLS1wb3J0JywgJzAnLCAnLS13aXRob3V0LWNvbm5lY3Rpb24tdG9rZW4nXTtcblx0XHRpZiAob3B0aW9ucz8ucXVpZXQgPz8gdHJ1ZSkge1xuXHRcdFx0YXJncy5wdXNoKCctLXF1aWV0Jyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy51c2VyRGF0YURpcikge1xuXHRcdFx0YXJncy5wdXNoKCctLXVzZXItZGF0YS1kaXInLCBvcHRpb25zLnVzZXJEYXRhRGlyKTtcblx0XHR9XG5cdFx0Y29uc3QgY2hpbGQgPSBmb3JrKHNlcnZlclBhdGgsIGFyZ3MsIHtcblx0XHRcdHN0ZGlvOiBbJ3BpcGUnLCAncGlwZScsICdwaXBlJywgJ2lwYyddLFxuXHRcdFx0ZW52OiB3aXRoQWdlbnRIb3N0Q292ZXJhZ2UoeyAuLi5wcm9jZXNzLmVudiwgLi4ub3B0aW9ucz8uZW52IH0pLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNoaWxkLmtpbGwoKTtcblx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1NlcnZlciBzdGFydHVwIHRpbWVkIG91dCcpKTtcblx0XHR9LCBvcHRpb25zPy5zdGFydHVwVGltZW91dE1zID8/IGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0KDEwXzAwMCwgNDVfMDAwKSk7XG5cblx0XHRjaGlsZC5zdGRvdXQhLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGRhdGEudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IG1hdGNoID0gdGV4dC5tYXRjaCgvUkVBRFk6KFxcZCspLyk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0cmVzb2x2ZSh7IHByb2Nlc3M6IGNoaWxkLCBwb3J0OiBwYXJzZUludChtYXRjaFsxXSwgMTApIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y2hpbGQuc3RkZXJyIS5vbignZGF0YScsICgpID0+IHtcblx0XHRcdC8vIEludGVudGlvbmFsbHkgc3dhbGxvd2VkIC0gdGhlIHRlc3QgcnVubmVyIGZhaWxzIGlmIGNvbnNvbGUuZXJyb3IgaXMgdXNlZC5cblx0XHR9KTtcblxuXHRcdGNoaWxkLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0cmVqZWN0KGVycik7XG5cdFx0fSk7XG5cblx0XHRjaGlsZC5vbignZXhpdCcsIGNvZGUgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdHJlamVjdChuZXcgRXJyb3IoYFNlcnZlciBleGl0ZWQgcHJlbWF0dXJlbHkgd2l0aCBjb2RlICR7Y29kZX1gKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIFN0YXJ0IHRoZSBhZ2VudCBob3N0IHNlcnZlciB3aXRoIHRoZSBDb3BpbG90IFNESyBhZ2VudCB3aXRoIGVpdGhlciBhIHJlYWwgb3IgbW9ja2VkIExMTS5cbiAqIFRoZSBzZXJ2ZXIgaXMgc3RhcnRlZCB3aXRoIGxvZ2dpbmcgZW5hYmxlZCBzbyB0aGUgQ29waWxvdEFnZW50IGlzIHJlZ2lzdGVyZWQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFJlYWxTZXJ2ZXIob3B0aW9ucz86IHsgcmVhZG9ubHkgY2xhdWRlU2RrUm9vdD86IHN0cmluZzsgcmVhZG9ubHkgY29kZXhTZGtSb290Pzogc3RyaW5nOyByZWFkb25seSBtb2NrTGxtPzogYm9vbGVhbjsgcmVhZG9ubHkgaG9tZURpcj86IHN0cmluZzsgcmVhZG9ubHkgdXNlckRhdGFEaXI/OiBzdHJpbmc7IHJlYWRvbmx5IGxvZ0xldmVsPzogc3RyaW5nOyByZWFkb25seSBlbnY/OiBOb2RlSlMuUHJvY2Vzc0VudjsgcmVhZG9ubHkgY2FwaVJlcGxheT86IHsgcmVhZG9ubHkgZml4dHVyZVBhdGg6IHN0cmluZzsgcmVhZG9ubHkgbW9kZT86IENhcGlSZXBsYXlNb2RlOyByZWFkb25seSB3b3JrRGlyPzogc3RyaW5nOyByZWFkb25seSByZWFsPzogYm9vbGVhbjsgcmVhZG9ubHkgYWxsb3dQb3NpeENvbW1hbmRzPzogYm9vbGVhbjsgcmVhZG9ubHkgYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdD86IGJvb2xlYW4gfTsgcmVhZG9ubHkgbW9ja1NjZW5hcmlvcz86IHJlYWRvbmx5IElNb2NrU2NlbmFyaW9bXSB9KTogUHJvbWlzZTxJU2VydmVySGFuZGxlPiB7XG5cdC8vIGBjYXBpUmVwbGF5YCByZWNvcmRzL3JlcGxheXMgaW4gZnJvbnQgb2YgdGhlIG1vY2sgTExNIHNlcnZlciwgc28gaXQgaW1wbGllc1xuXHQvLyBhIG1vY2sgdXBzdHJlYW0gZXZlbiB3aGVuIGBtb2NrTGxtYCB3YXMgbm90IGV4cGxpY2l0bHkgcmVxdWVzdGVkIFx1MjAxNCB1bmxlc3Ncblx0Ly8gYHJlYWxgIGlzIHNldCwgaW4gd2hpY2ggY2FzZSB0aGUgcHJveHkgZm9yd2FyZHMgdG8gcmVhbCBDQVBJL0dpdEh1Yi5cblx0Y29uc3QgcmVhbENhcHR1cmUgPSBvcHRpb25zPy5jYXBpUmVwbGF5Py5yZWFsID09PSB0cnVlO1xuXHRjb25zdCBtb2NrTGxtU2VydmVyID0gKG9wdGlvbnM/Lm1vY2tMbG0gfHwgKG9wdGlvbnM/LmNhcGlSZXBsYXkgJiYgIXJlYWxDYXB0dXJlKSkgPyBhd2FpdCBzdGFydE1vY2tMbG1TZXJ2ZXIob3B0aW9ucz8ubW9ja1NjZW5hcmlvcykgOiB1bmRlZmluZWQ7XG5cdGxldCBjYXBpUmVwbGF5UHJveHk6IENhcGlSZXBsYXlQcm94eSB8IHVuZGVmaW5lZDtcblx0aWYgKG9wdGlvbnM/LmNhcGlSZXBsYXkpIHtcblx0XHRjYXBpUmVwbGF5UHJveHkgPSBuZXcgQ2FwaVJlcGxheVByb3h5KHJlYWxDYXB0dXJlID8ge1xuXHRcdFx0Zml4dHVyZVBhdGg6IG9wdGlvbnMuY2FwaVJlcGxheS5maXh0dXJlUGF0aCxcblx0XHRcdG1vZGU6IG9wdGlvbnMuY2FwaVJlcGxheS5tb2RlLFxuXHRcdFx0d29ya0Rpcjogb3B0aW9ucy5jYXBpUmVwbGF5LndvcmtEaXIsXG5cdFx0XHRhbGxvd1Bvc2l4Q29tbWFuZHM6IG9wdGlvbnMuY2FwaVJlcGxheS5hbGxvd1Bvc2l4Q29tbWFuZHMsXG5cdFx0XHRhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0OiBvcHRpb25zLmNhcGlSZXBsYXkuYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCxcblx0XHRcdGhvbWVEaXI6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdHVzZXJOYW1lOiB1c2VySW5mbygpLnVzZXJuYW1lLFxuXHRcdFx0Ly8gUmVhbCBob3N0cyAoY29uc3VtZXIgZGVmYXVsdHMpOyBvdmVycmlkZSBmb3IgRW50ZXJwcmlzZS9CdXNpbmVzcyBhY2NvdW50cy5cblx0XHRcdGdpdGh1YlVwc3RyZWFtVXJsOiBwcm9jZXNzLmVudlsnQUdFTlRfSE9TVF9SRUNPUkRfR0lUSFVCX1VSTCddIHx8ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRcdGNhcGlVcHN0cmVhbVVybDogcHJvY2Vzcy5lbnZbJ0FHRU5UX0hPU1RfUkVDT1JEX0NBUElfVVJMJ10gfHwgJ2h0dHBzOi8vYXBpLmdpdGh1YmNvcGlsb3QuY29tJyxcblx0XHR9IDoge1xuXHRcdFx0Zml4dHVyZVBhdGg6IG9wdGlvbnMuY2FwaVJlcGxheS5maXh0dXJlUGF0aCxcblx0XHRcdG1vZGU6IG9wdGlvbnMuY2FwaVJlcGxheS5tb2RlLFxuXHRcdFx0d29ya0Rpcjogb3B0aW9ucy5jYXBpUmVwbGF5LndvcmtEaXIsXG5cdFx0XHRhbGxvd1Bvc2l4Q29tbWFuZHM6IG9wdGlvbnMuY2FwaVJlcGxheS5hbGxvd1Bvc2l4Q29tbWFuZHMsXG5cdFx0XHRhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0OiBvcHRpb25zLmNhcGlSZXBsYXkuYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCxcblx0XHRcdGhvbWVEaXI6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdHVzZXJOYW1lOiB1c2VySW5mbygpLnVzZXJuYW1lLFxuXHRcdFx0dXBzdHJlYW1Vcmw6IG1vY2tMbG1TZXJ2ZXIhLnVybCxcblx0XHR9KTtcblx0XHRhd2FpdCBjYXBpUmVwbGF5UHJveHkuc3RhcnQoKTtcblx0fVxuXHQvLyBUaGUgYWdlbnQgaG9zdCB0YWxrcyB0byB0aGUgcHJveHkgKHdoZW4gcmVwbGF5aW5nKSBvciBkaXJlY3RseSB0byB0aGUgbW9jay5cblx0Y29uc3QgY2FwaVVybCA9IGNhcGlSZXBsYXlQcm94eT8udXJsID8/IG1vY2tMbG1TZXJ2ZXI/LnVybDtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXJQYXRoID0gZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuLi8uLi9ub2RlL2FnZW50SG9zdFNlcnZlck1haW4uanMnLCBpbXBvcnQubWV0YS51cmwpKTtcblx0XHRjb25zdCBhcmdzID0gWyctLXBvcnQnLCAnMCcsICctLXdpdGhvdXQtY29ubmVjdGlvbi10b2tlbiddO1xuXHRcdGlmIChvcHRpb25zPy5jbGF1ZGVTZGtSb290KSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tY2xhdWRlLXNkay1yb290Jywgb3B0aW9ucy5jbGF1ZGVTZGtSb290KTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnM/LmNvZGV4U2RrUm9vdCkge1xuXHRcdFx0YXJncy5wdXNoKCctLWNvZGV4LXNkay1yb290Jywgb3B0aW9ucy5jb2RleFNka1Jvb3QpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8udXNlckRhdGFEaXIpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS11c2VyLWRhdGEtZGlyJywgb3B0aW9ucy51c2VyRGF0YURpcik7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5sb2dMZXZlbCkge1xuXHRcdFx0YXJncy5wdXNoKCctLWxvZycsIG9wdGlvbnMubG9nTGV2ZWwpO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZEVudiA9IHdpdGhBZ2VudEhvc3RDb3ZlcmFnZSh7XG5cdFx0XHQuLi5wcm9jZXNzLmVudixcblx0XHRcdC4uLihvcHRpb25zPy5lbnYgPz8ge30pLFxuXHRcdFx0Li4uKG9wdGlvbnM/LmhvbWVEaXIgPyB7XG5cdFx0XHRcdEhPTUU6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdFx0VVNFUlBST0ZJTEU6IG9wdGlvbnMuaG9tZURpcixcblx0XHRcdFx0QVBQREFUQTogam9pbihvcHRpb25zLmhvbWVEaXIsICdBcHBEYXRhJywgJ1JvYW1pbmcnKSxcblx0XHRcdFx0TE9DQUxBUFBEQVRBOiBqb2luKG9wdGlvbnMuaG9tZURpciwgJ0FwcERhdGEnLCAnTG9jYWwnKSxcblx0XHRcdFx0WERHX0NPTkZJR19IT01FOiBqb2luKG9wdGlvbnMuaG9tZURpciwgJy5jb25maWcnKSxcblx0XHRcdFx0Q09QSUxPVF9IT01FOiBqb2luKG9wdGlvbnMuaG9tZURpciwgJy5jb3BpbG90JyksXG5cdFx0XHRcdENPUElMT1RfU0tJTExTX0RJUlM6IHVuZGVmaW5lZCxcblx0XHRcdFx0Q0xBVURFX0NPTkZJR19ESVI6IHVuZGVmaW5lZCxcblx0XHRcdFx0Q09ERVhfSE9NRTogdW5kZWZpbmVkLFxuXHRcdFx0XHQuLi4oaXNXaW5kb3dzICYmIG9wdGlvbnMuaG9tZURpci5tYXRjaCgvXltBLVphLXpdOltcXFxcL10vKSA/IHtcblx0XHRcdFx0XHRIT01FRFJJVkU6IG9wdGlvbnMuaG9tZURpci5zbGljZSgwLCAyKSxcblx0XHRcdFx0XHRIT01FUEFUSDogb3B0aW9ucy5ob21lRGlyLnNsaWNlKDIpLnJlcGxhY2UoL1xcLy9nLCAnXFxcXCcpLFxuXHRcdFx0XHR9IDoge30pLFxuXHRcdFx0fSA6IHt9KSxcblx0XHRcdC8vIENvZGV4IGRlZmF1bHRzIHRvIGRpc2FibGVkOyBvcHQgaXQgaW4gZm9yIHRoZSBhZ2VudCBob3N0IGUyZSBzdWl0ZSB3aGVuIGFcblx0XHRcdC8vIGNvZGV4IFNESyByb290IGlzIHN1cHBsaWVkIHNvIHRoZSBwcm92aWRlciBhY3R1YWxseSByZWdpc3RlcnMuXG5cdFx0XHQuLi4ob3B0aW9ucz8uY29kZXhTZGtSb290ID8geyBbQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRFbnZWYXJdOiAndHJ1ZScgfSA6IHt9KSxcblx0XHRcdC8vIEZpeHR1cmVzIHVzZSBDb2RleCdzIHVuaWZpZWQgZXhlYyB0b29sLCBzbyBrZWVwIHJlY29yZCBhbmQgcmVwbGF5IG9uIHRoZSBzYW1lIHNoZWxsIHByb3RvY29sLlxuXHRcdFx0Li4uKG9wdGlvbnM/LmNvZGV4U2RrUm9vdCAmJiBvcHRpb25zLmNhcGlSZXBsYXkgPyB7IFtBZ2VudEhvc3RDb2RleEFnZW50QmluYXJ5QXJnc0VudlZhcl06IEpTT04uc3RyaW5naWZ5KFsnLWMnLCAnZmVhdHVyZXMudW5pZmllZF9leGVjPXRydWUnXSkgfSA6IHt9KSxcblx0XHRcdC4uLihyZWFsQ2FwdHVyZSA/IHtcblx0XHRcdFx0Ly8gUmVhbC1DQVBJIGNhcHR1cmUvcmVwbGF5OiByb3V0ZSBhbGwgQ0FQSSArIEdpdEh1Yi1BUEkgdHJhZmZpYyB0aHJvdWdoXG5cdFx0XHRcdC8vIHRoZSBwcm94eS4gVGhlIHJlYWwgR2l0SHViIHRva2VuIGZsb3dzIHZpYSB0aGUgYGF1dGhlbnRpY2F0ZWBcblx0XHRcdFx0Ly8gcHJvdG9jb2wgY2FsbCAocmVjb3JkKSBvciBhIHBsYWNlaG9sZGVyIChyZXBsYXkpLCBub3QgdmlhIGVudi5cblx0XHRcdFx0Q09QSUxPVF9BUElfVVJMOiBjYXBpVXJsLFxuXHRcdFx0XHRDT1BJTE9UX0RFQlVHX0dJVEhVQl9BUElfVVJMOiBjYXBpVXJsLFxuXHRcdFx0XHRWU0NPREVfQUdFTlRfSE9TVF9DQVBJX1VSTF9PVkVSUklERTogY2FwaVVybCxcblx0XHRcdH0gOiBtb2NrTGxtU2VydmVyID8ge1xuXHRcdFx0XHRHSVRIVUJfUEFUOiAnc21va2V0ZXN0LWZha2UtcGF0Jyxcblx0XHRcdFx0SVNfU0NFTkFSSU9fQVVUT01BVElPTjogJzEnLFxuXHRcdFx0XHQvLyBBZ2VudCBob3N0IGUyZSBDb3BpbG90IHRlc3RzIHJ1biBhZ2FpbnN0IHJlc3BvbnNlcy1jYXBhYmxlIG1vZGVsc1xuXHRcdFx0XHQvLyAoZS5nLiBncHQtNS4zLWNvZGV4KSB0aGF0IGFyZSBcInByb1wiLWdhdGVkIGluIHRoZSBtb2NrIC9tb2RlbHNcblx0XHRcdFx0Ly8gZml4dHVyZSwgc28gbWludCBhIHByby1wbGFuIHRva2VuIGZvciB0aGlzIGhhcm5lc3MuXG5cdFx0XHRcdFZTQ09ERV9DT1BJTE9UX0NIQVRfVE9LRU46IGJ1aWxkQ29waWxvdENoYXRUb2tlbihjYXBpVXJsISwgJ3BybycpLFxuXHRcdFx0XHQvLyBSb3V0ZSB0aGUgQ29waWxvdCBTREsncyBHaXRIdWIgQVBJIGNhbGxzICh0b2tlbiByZWZyZXNoLCBtb2RlbFxuXHRcdFx0XHQvLyBkaXNjb3ZlcnksIGV0Yy4pIGF0IHRoZSBtb2NrL3Byb3h5IGluc3RlYWQgb2YgYXBpLmdpdGh1Yi5jb20sXG5cdFx0XHRcdC8vIHdoaWNoIHdvdWxkIDQwMSB3aXRoIHRoZSBmYWtlIHRva2VuLlxuXHRcdFx0XHRDT1BJTE9UX0RFQlVHX0dJVEhVQl9BUElfVVJMOiBjYXBpVXJsLFxuXHRcdFx0XHRDT1BJTE9UX0FQSV9VUkw6IGNhcGlVcmwsXG5cdFx0XHRcdEdJVEhVQl9DT1BJTE9UX0FQSV9UT0tFTjogJ3Ntb2tldGVzdC1mYWtlLWFnZW50LWhvc3QtdG9rZW4nLFxuXHRcdFx0XHQvLyBSb3V0ZSB0aGUgYWdlbnQgaG9zdCdzIHNoYXJlZCBDQVBJIGNsaWVudCAodXNlZCBieSB0aGUgQ29kZXggL1xuXHRcdFx0XHQvLyBhZ2VudC1ob3N0IGhhcm5lc3NlcyBmb3IgbW9kZWwgZGlzY292ZXJ5ICsgcmVxdWVzdHMpIGF0IHRoZVxuXHRcdFx0XHQvLyBtb2NrL3Byb3h5IGluc3RlYWQgb2YgYXBpLmdpdGh1Yi5jb20sIHdoaWNoIHdvdWxkIDQwMSB3aXRoIHRoZVxuXHRcdFx0XHQvLyBmYWtlIHRva2VuLlxuXHRcdFx0XHRWU0NPREVfQUdFTlRfSE9TVF9DQVBJX1VSTF9PVkVSUklERTogY2FwaVVybCxcblx0XHRcdH0gOiB7fSksXG5cdFx0fSk7XG5cdFx0bGV0IGNoaWxkOiBDaGlsZFByb2Nlc3M7XG5cdFx0dHJ5IHtcblx0XHRcdGNoaWxkID0gZm9yayhzZXJ2ZXJQYXRoLCBhcmdzLCB7XG5cdFx0XHRcdHN0ZGlvOiBbJ3BpcGUnLCAncGlwZScsICdwaXBlJywgJ2lwYyddLFxuXHRcdFx0XHRlbnY6IGNoaWxkRW52LFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR2b2lkIG1vY2tMbG1TZXJ2ZXI/LmNsb3NlKCk7XG5cdFx0XHR2b2lkIGNhcGlSZXBsYXlQcm94eT8uc3RvcCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdGxldCBtb2NrQ2xvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgY2xvc2VNb2NrU2VydmVyID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0aWYgKG1vY2tDbG9zZWQgfHwgIW1vY2tMbG1TZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bW9ja0Nsb3NlZCA9IHRydWU7XG5cdFx0XHQvLyBGbHVzaCBhbnkgcmVjb3JkaW5nIGJlZm9yZSBjbG9zaW5nIHRoZSB1cHN0cmVhbS4gU3dhbGxvdyBzdHJpY3Rcblx0XHRcdC8vIGNhY2hlLW1pc3MgZXJyb3JzIGhlcmUgXHUyMDE0IHRlc3RzIHRoYXQgd2FudCB0aGVtIGNhbGwgYGNhcGlSZXBsYXkuc3RvcCgpYFxuXHRcdFx0Ly8gZXhwbGljaXRseSBpbiB0ZWFyZG93bi5cblx0XHRcdGF3YWl0IGNhcGlSZXBsYXlQcm94eT8uc3RvcCgpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBtb2NrTGxtU2VydmVyLmNsb3NlKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gYmVzdCBlZmZvcnRcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNoaWxkLm9uKCdleGl0JywgKCkgPT4ge1xuXHRcdFx0dm9pZCBjbG9zZU1vY2tTZXJ2ZXIoKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRjaGlsZC5raWxsKCk7XG5cdFx0XHR2b2lkIGNsb3NlTW9ja1NlcnZlcigpO1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcignUmVhbCBzZXJ2ZXIgc3RhcnR1cCB0aW1lZCBvdXQnKSk7XG5cdFx0fSwgMzBfMDAwKTtcblxuXHRcdGNoaWxkLnN0ZG91dCEub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gZGF0YS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9SRUFEWTooXFxkKykvKTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHRyZXNvbHZlKHsgcHJvY2VzczogY2hpbGQsIHBvcnQ6IHBhcnNlSW50KG1hdGNoWzFdLCAxMCksIG1vY2tMbG06IG1vY2tMbG1TZXJ2ZXIsIGNhcGlSZXBsYXk6IGNhcGlSZXBsYXlQcm94eSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNoaWxkLnN0ZGVyciEub24oJ2RhdGEnLCAoKSA9PiB7XG5cdFx0XHQvLyBJbnRlbnRpb25hbGx5IHN3YWxsb3dlZCAtIHRoZSB0ZXN0IHJ1bm5lciBmYWlscyBpZiBjb25zb2xlLmVycm9yIGlzIHVzZWQuXG5cdFx0XHQvLyBTZXJ2ZXIgbG9ncyBnbyB0byB0aGUgYWdlbnQgaG9zdCdzIGxvZ2dlciAodW5kZXJcblx0XHRcdC8vIGA8dXNlckRhdGFQYXRoPi9sb2dzLzx0aW1lc3RhbXA+L2FnZW50aG9zdC1zZXJ2ZXIubG9nYCk7IGNoZWNrXG5cdFx0XHQvLyB0aGVyZSB3aGVuIGludmVzdGlnYXRpbmcgYWdlbnQgaG9zdCBlMmUgdGVzdCBmYWlsdXJlcy5cblx0XHR9KTtcblxuXHRcdGNoaWxkLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0dm9pZCBjbG9zZU1vY2tTZXJ2ZXIoKTtcblx0XHRcdHJlamVjdChlcnIpO1xuXHRcdH0pO1xuXG5cdFx0Y2hpbGQub24oJ2V4aXQnLCBjb2RlID0+IHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHR2b2lkIGNsb3NlTW9ja1NlcnZlcigpO1xuXHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgUmVhbCBzZXJ2ZXIgZXhpdGVkIHByZW1hdHVyZWx5IHdpdGggY29kZSAke2NvZGV9YCkpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuLy8gLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxubGV0IHNlc3Npb25Db3VudGVyID0gMDtcblxuZXhwb3J0IGZ1bmN0aW9uIG5leHRTZXNzaW9uVXJpKCk6IHN0cmluZyB7XG5cdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ21vY2snLCBwYXRoOiBgL3Rlc3Qtc2Vzc2lvbi0keysrc2Vzc2lvbkNvdW50ZXJ9YCB9KS50b1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdENoYXRDaGFubmVsKHNlc3Npb25Vcmk6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBY3Rpb25Ob3RpZmljYXRpb24objogQWhwTm90aWZpY2F0aW9uLCBhY3Rpb25UeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKG4ubWV0aG9kICE9PSAnYWN0aW9uJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBlbnZlbG9wZSA9IG4ucGFyYW1zIGFzIHVua25vd24gYXMgQWN0aW9uRW52ZWxvcGU7XG5cdHJldHVybiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gYWN0aW9uVHlwZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFjdGlvbkVudmVsb3BlKG46IEFocE5vdGlmaWNhdGlvbik6IEFjdGlvbkVudmVsb3BlIHtcblx0cmV0dXJuIG4ucGFyYW1zIGFzIHVua25vd24gYXMgQWN0aW9uRW52ZWxvcGU7XG59XG5cbi8qKiBQZXJmb3JtIGhhbmRzaGFrZSwgY3JlYXRlIGEgc2Vzc2lvbiwgc3Vic2NyaWJlLCBhbmQgcmV0dXJuIGl0cyBVUkkuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbihjOiBUZXN0UHJvdG9jb2xDbGllbnQsIGNsaWVudElkOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRhd2FpdCBjLmNhbGwoJ2luaXRpYWxpemUnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQgfSk7XG5cblx0YXdhaXQgYy5jYWxsKCdjcmVhdGVTZXNzaW9uJywgeyBjaGFubmVsOiBuZXh0U2Vzc2lvblVyaSgpLCBwcm92aWRlcjogJ21vY2snLCB3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQgfSk7XG5cblx0Y29uc3Qgbm90aWYgPSBhd2FpdCBjLndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdG4ubWV0aG9kID09PSAncm9vdC9zZXNzaW9uQWRkZWQnXG5cdCk7XG5cdGNvbnN0IHJlYWxTZXNzaW9uVXJpID0gKG5vdGlmLnBhcmFtcyBhcyBTZXNzaW9uQWRkZWRQYXJhbXMpLnN1bW1hcnkucmVzb3VyY2U7XG5cblx0YXdhaXQgYy5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcmVhbFNlc3Npb25VcmkgfSk7XG5cdC8vIFR1cm5zIGFuZCBvdGhlciBjb252ZXJzYXRpb24gY29udGVudHMgbGl2ZSBvbiB0aGUgc2Vzc2lvbidzIGRlZmF1bHRcblx0Ly8gY2hhdCBjaGFubmVsIGluIHRoZSBtdWx0aS1jaGF0IHByb3RvY29sOyBzdWJzY3JpYmUgdG8gaXQgYXMgd2VsbCBzb1xuXHQvLyBgY2hhdC8qYCBhY3Rpb24gbm90aWZpY2F0aW9ucyAocmVzcG9uc2VQYXJ0LCB0dXJuQ29tcGxldGUsIFx1MjAyNikgYXJlXG5cdC8vIGRlbGl2ZXJlZCB0byB0aGlzIGNsaWVudC5cblx0YXdhaXQgYy5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShyZWFsU2Vzc2lvblVyaSkgfSk7XG5cdGMuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdHJldHVybiByZWFsU2Vzc2lvblVyaTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRpc3BhdGNoVHVyblN0YXJ0ZWQoYzogVGVzdFByb3RvY29sQ2xpZW50LCBzZXNzaW9uOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyKTogdm9pZCB7XG5cdGMuZGlzcGF0Y2goe1xuXHRcdGNoYW5uZWw6IGRlZmF1bHRDaGF0Q2hhbm5lbChzZXNzaW9uKSxcblx0XHRjbGllbnRTZXEsXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9LFxuXHR9KTtcbn1cblxuLyoqXG4gKiBTdWJzY3JpYmVzIHRvIGEgc2Vzc2lvbiBjaGFubmVsIGFuZCBpdHMgZGVmYXVsdCBjaGF0IGNoYW5uZWwgYW5kIHJldHVybnMgdGhlXG4gKiBtZXJnZWQge0BsaW5rIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0fSB2aWV3LiBJbiB0aGUgbXVsdGktY2hhdCBwcm90b2NvbCB0aGVcbiAqIGNvbnZlcnNhdGlvbiBjb250ZW50cyAodHVybnMsIGFjdGl2ZVR1cm4sIHF1ZXVlZC9zdGVlcmluZyBtZXNzYWdlcywgaW5wdXRcbiAqIHJlcXVlc3RzKSBsaXZlIG9uIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IGNoYW5uZWwsIHNvIHJlYWRpbmcgdGhlbVxuICogcmVxdWlyZXMgbWVyZ2luZyB0aGUgc2Vzc2lvbiBzbmFwc2hvdCB3aXRoIGl0cyBkZWZhdWx0IGNoYXQgc25hcHNob3QuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaFNlc3Npb25XaXRoQ2hhdChjOiBUZXN0UHJvdG9jb2xDbGllbnQsIHNlc3Npb25Vcmk6IHN0cmluZyk6IFByb21pc2U8SVNlc3Npb25XaXRoRGVmYXVsdENoYXQ+IHtcblx0Y29uc3Qgb3duaW5nU2Vzc2lvbiA9IHBhcnNlRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkgPz8gc2Vzc2lvblVyaTtcblx0Y29uc3QgY2hhdFVyaSA9IHBhcnNlRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkgPyBzZXNzaW9uVXJpIDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0Y29uc3Qgc2Vzc2lvblNuYXAgPSBhd2FpdCBjLmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBvd25pbmdTZXNzaW9uIH0pO1xuXHRjb25zdCBjaGF0U25hcCA9IGF3YWl0IGMuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYXRVcmkgfSk7XG5cdHJldHVybiBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQoXG5cdFx0c2Vzc2lvblNuYXAuc25hcHNob3QhLnN0YXRlIGFzIFNlc3Npb25TdGF0ZSxcblx0XHRjaGF0U25hcC5zbmFwc2hvdD8uc3RhdGUgYXMgQ2hhdFN0YXRlIHwgdW5kZWZpbmVkLFxuXHQpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBdUIsWUFBWTtBQUNuQyxTQUFTLElBQUksT0FBTyxPQUFPLFVBQVUsU0FBUyxVQUFVLFFBQVEsSUFBSSxNQUFNLGlCQUFpQjtBQUMzRixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBNEM7QUFDckQsU0FBUyxTQUFTLE1BQU0sV0FBVyxtQkFBbUI7QUFDdEQsU0FBUyxXQUFXO0FBQ3BCO0FBQUEsRUFDQztBQUFBLEVBR0E7QUFBQSxFQUNBO0FBQUEsT0FxQk07QUFDUCxTQUFTLGtCQUF1QztBQUVoRCxTQUFTLGFBQWEscUJBQXFCLDZCQUE2QiwyQkFBNEY7QUFDcEssU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUMsd0NBQXdDO0FBQ3RGO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BT007QUFDUCxTQUFTLDJCQUFxRjtBQUM5RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQjtBQVMxQixTQUFTLDhCQUFzQztBQUM5QyxNQUFJLFFBQVEsSUFBSSx5QkFBeUIsTUFBTSxLQUFLO0FBQ25ELFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxZ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
