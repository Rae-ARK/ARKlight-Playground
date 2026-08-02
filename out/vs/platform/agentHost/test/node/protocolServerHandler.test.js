import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { FileType } from "../../../files/common/files.js";
import { ChatSourceKind, ContentEncoding } from "../../common/state/protocol/commands.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, JSON_RPC_INTERNAL_ERROR, JsonRpcErrorCodes, ProtocolError, AhpErrorCodes, AHP_UNSUPPORTED_PROTOCOL_VERSION, AHP_SESSION_NOT_FOUND } from "../../common/state/sessionProtocol.js";
import { MessageKind, ResponsePartKind, SessionStatus, ChangesetStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, readSessionWorkspaceless, withSessionWorkspaceless } from "../../common/state/sessionState.js";
import { ProtocolServerHandler } from "../../node/protocolServerHandler.js";
import { CompositeProtocolServer } from "../../node/compositeProtocolServer.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostFileSystemProvider, agentHostUri } from "../../common/agentHostFileSystemProvider.js";
import { agentsWindowAgentHostClientInfo } from "../../common/agentHostClientInfo.js";
import { iterateOtlpLogRecords, OtlpLogEmitter } from "../../common/otlp/otlpLogEmitter.js";
import { MessagePortProtocolServer } from "../../node/messagePortProtocolServer.js";
class MockProtocolTransport {
  constructor() {
    this._onMessage = new Emitter();
    this.onMessage = this._onMessage.event;
    this._onDidSend = new Emitter();
    this.onDidSend = this._onDidSend.event;
    this._onClose = new Emitter();
    this.onClose = this._onClose.event;
    this.sent = [];
  }
  send(message) {
    this.sent.push(message);
    this._onDidSend.fire(message);
  }
  simulateMessage(msg) {
    this._onMessage.fire(msg);
  }
  simulateClose() {
    this._onClose.fire();
  }
  dispose() {
    this._onMessage.dispose();
    this._onDidSend.dispose();
    this._onClose.dispose();
  }
}
class MockProtocolServer {
  constructor() {
    this._onConnection = new Emitter();
    this.onConnection = this._onConnection.event;
    this.address = "mock://test";
  }
  simulateConnection(transport) {
    this._onConnection.fire(transport);
  }
  dispose() {
    this._onConnection.dispose();
  }
}
class CountingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errorCount = 0;
  }
  error(_message, ..._args) {
    this.errorCount++;
  }
}
class MockAgentService {
  constructor() {
    this.handledActions = [];
    this.handledClientTypes = [];
    this.browsedUris = [];
    this.browseErrors = /* @__PURE__ */ new Map();
    this.readErrors = /* @__PURE__ */ new Map();
    this.listedSessions = [];
    this.createSessionConfigs = [];
    this.managedSettingsDiagnostics = [];
    this.shutdownCalls = 0;
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this._onMcpNotification = new Emitter();
    this.onMcpNotification = this._onMcpNotification.event;
    this.createdChats = [];
    this.disposedChats = [];
    this.watchSubscribeCalls = [];
    this.watchUnsubscribeCalls = [];
    /** Channels for which `onResourceWatchSubscribed` should return a descriptor. */
    this.liveWatchDescriptors = /* @__PURE__ */ new Map();
  }
  /** Connect to the state manager so dispatchAction works correctly. */
  setStateManager(sm) {
    this._stateManager = sm;
  }
  dispatchAction(channel, action, clientId, clientSeq, clientType) {
    this.handledActions.push(action);
    this.handledClientTypes.push(clientType);
    const origin = { clientId, clientSeq };
    this._stateManager.dispatchClientAction(channel, action, origin);
  }
  async createSession(config) {
    this.createSessionConfigs.push(config);
    const session = config?.session ?? URI.parse("copilot:///new-session");
    this._stateManager.createSession({
      resource: session.toString(),
      provider: config?.provider ?? "copilot",
      title: "",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///created-project", displayName: "Created Project" },
      workingDirectories: config?.workingDirectories?.[0] ? [config.workingDirectories?.[0].toString()] : void 0
    });
    return session;
  }
  async resolveSessionConfig(_params) {
    return { schema: { type: "object", properties: {} }, values: {} };
  }
  async sessionConfigCompletions(_params) {
    return { items: [] };
  }
  async completions(_params) {
    return { items: [] };
  }
  async getCompletionTriggerCharacters() {
    return [];
  }
  async disposeSession(_session) {
  }
  async createChat(session, chat, options) {
    this.createdChats.push({ session: session.toString(), chat: chat.toString(), ...options ? { options } : {} });
    this._stateManager.addChat(session.toString(), chat.toString());
  }
  async disposeChat(session, chat) {
    this.disposedChats.push({ session: session.toString(), chat: chat.toString() });
    this._stateManager.removeChat(session.toString(), chat.toString());
  }
  async listSessions() {
    return this.listedSessions;
  }
  async subscribe(resource, _clientId) {
    const snapshot = this._stateManager.getSnapshot(resource.toString());
    if (!snapshot) {
      throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
    }
    return snapshot;
  }
  addSubscriber(_resource, _clientId) {
  }
  unsubscribe(_resource, _clientId) {
  }
  async shutdown() {
    this.shutdownCalls++;
  }
  async getNetworkDiagnosticsInfo() {
    return { version: "test", os: "test", arch: "test", proxySettings: {}, proxyEnv: {}, endpoints: [] };
  }
  async getManagedSettingsDiagnostics() {
    return this.managedSettingsDiagnostics;
  }
  async diagnosticsFetch(url) {
    return { url };
  }
  async authenticate(_params) {
    return { authenticated: true };
  }
  getAuthToken() {
    return void 0;
  }
  async resourceWrite(_params) {
    return {};
  }
  async resourceList(uri) {
    this.browsedUris.push(uri);
    const error = this.browseErrors.get(uri.toString());
    if (error) {
      throw error;
    }
    return {
      entries: [
        { name: "src", type: "directory" },
        { name: "README.md", type: "file" }
      ]
    };
  }
  async resourceRead(uri) {
    const error = this.readErrors.get(uri.toString());
    if (error) {
      throw error;
    }
    return { data: "", encoding: ContentEncoding.Utf8 };
  }
  async resourceCopy(_params) {
    return {};
  }
  async resourceDelete() {
    return {};
  }
  async resourceMove() {
    return {};
  }
  async resourceResolve(_params) {
    throw new Error("Not implemented");
  }
  async resourceMkdir(_params) {
    return {};
  }
  async createResourceWatch(_params) {
    throw new Error("Not implemented");
  }
  onResourceWatchSubscribed(channel) {
    this.watchSubscribeCalls.push(channel);
    return this.liveWatchDescriptors.get(channel);
  }
  onResourceWatchUnsubscribed(channel) {
    this.watchUnsubscribeCalls.push(channel);
    return this.liveWatchDescriptors.has(channel);
  }
  async createTerminal() {
  }
  async disposeTerminal() {
  }
  async invokeChangesetOperation() {
    return {};
  }
  async handleMcpRequest() {
    throw new Error("Method not found");
  }
  dispose() {
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
    this._onMcpNotification.dispose();
  }
}
function notification(method, params) {
  return { jsonrpc: "2.0", method, params };
}
function request(id, method, params) {
  return { jsonrpc: "2.0", id, method, params };
}
function findNotifications(sent, method) {
  return sent.filter(isJsonRpcNotification);
}
function findResponse(sent, id) {
  return sent.find((message) => isJsonRpcResponse(message) && message.id === id);
}
function waitForResponse(transport, id) {
  return Event.toPromise(Event.filter(transport.onDidSend, (message) => isJsonRpcResponse(message) && message.id === id));
}
suite("ProtocolServerHandler", () => {
  let disposables;
  let stateManager;
  let server;
  let agentService;
  let handler;
  let fileSystemProvider;
  let logService;
  const sessionUri = URI.from({ scheme: "copilot", path: "/test-session" }).toString();
  const defaultChatUri = buildDefaultChatUri(sessionUri);
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
  function connectClient(clientId, initialSubscriptions, clientInfo) {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId,
      clientInfo,
      initialSubscriptions
    }));
    return transport;
  }
  setup(() => {
    disposables = new DisposableStore();
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    server = disposables.add(new MockProtocolServer());
    agentService = new MockAgentService();
    agentService.setStateManager(stateManager);
    logService = new CountingLogService();
    disposables.add(agentService);
    disposables.add(handler = new ProtocolServerHandler(
      agentService,
      stateManager,
      server,
      { defaultDirectory: URI.file("/home/testuser").toString() },
      disposables.add(fileSystemProvider = new AgentHostFileSystemProvider()),
      logService
    ));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("handshake returns initialize response", () => {
    const transport = connectClient("client-1");
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp, "should have sent initialize response");
    const result = resp.result;
    assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual(result.serverSeq, stateManager.serverSeq);
  });
  test("handshake rejects unsupported protocol versions", () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: ["0.0.0"],
      clientId: "client-incompat"
    }));
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp, "should have sent error response");
    assert.strictEqual(resp.error?.code, AHP_UNSUPPORTED_PROTOCOL_VERSION);
    assert.match(resp.error.message, /0\.0\.0/);
    assert.match(resp.error.message, new RegExp(PROTOCOL_VERSION.replace(/\./g, "\\.")));
    const data = resp.error.data;
    assert.strictEqual(data?._meta?.vscodeUpgradeMethod, void 0);
    transport.simulateClose();
    transport.dispose();
  });
  test("handshake leniently picks the highest compatible offered version", () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: ["0.0.0", PROTOCOL_VERSION, "9.9.9"],
      clientId: "client-lenient"
    }));
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp?.result, "should have negotiated successfully");
    assert.strictEqual(resp.result.protocolVersion, PROTOCOL_VERSION);
    transport.simulateClose();
    transport.dispose();
  });
  test("upgrade method advertised when management socket env var is set", () => {
    const originalEnv = process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET;
    process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET = "/tmp/mock-supervisor.sock";
    try {
      const transport = new MockProtocolTransport();
      server.simulateConnection(transport);
      transport.simulateMessage(request(1, "initialize", {
        protocolVersions: ["9.9.9"],
        clientId: "client-incompat-with-cli"
      }));
      const resp = findResponse(transport.sent, 1);
      assert.strictEqual(resp?.error?.code, AHP_UNSUPPORTED_PROTOCOL_VERSION);
      const data = resp.error.data;
      assert.strictEqual(data?._meta?.vscodeUpgradeMethod, "_vscodeUpgrade");
      transport.simulateClose();
      transport.dispose();
    } finally {
      if (originalEnv === void 0) {
        delete process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET;
      } else {
        process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET = originalEnv;
      }
    }
  });
  test("_vscodeUpgrade RPC returns MethodNotFound when no supervisor is available", async () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    const responsePromise = waitForResponse(transport, 42);
    transport.simulateMessage(request(42, "_vscodeUpgrade", {}));
    const resp = await responsePromise;
    assert.ok(resp.error, "should have responded with an error");
    assert.strictEqual(
      resp.error.code,
      -32601
      /* MethodNotFound */
    );
    transport.simulateClose();
    transport.dispose();
  });
  test("handshake with initialSubscriptions returns snapshots", () => {
    stateManager.createSession(makeSessionSummary());
    const transport = connectClient("client-1", [sessionUri]);
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp);
    const result = resp.result;
    assert.strictEqual(result.snapshots.length, 1);
    assert.strictEqual(result.snapshots[0].resource.toString(), sessionUri.toString());
  });
  test("ping responds before initialize", async () => {
    const transport = new MockProtocolTransport();
    disposables.add(transport);
    server.simulateConnection(transport);
    const responsePromise = waitForResponse(transport, 7);
    transport.simulateMessage(request(7, "ping", {}));
    const resp = await responsePromise;
    assert.strictEqual(resp.id, 7);
    assert.strictEqual(resp.result, null);
    transport.simulateClose();
  });
  test("unknown requests return MethodNotFound before and after initialize", () => {
    const transport = new MockProtocolTransport();
    disposables.add(transport);
    server.simulateConnection(transport);
    transport.simulateMessage(request(7, "notARealMethod", { channel: "ahp-root://" }));
    transport.simulateMessage(request(8, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "client-1"
    }));
    transport.simulateMessage(request(9, "notARealMethod", { channel: "ahp-root://" }));
    assert.deepStrictEqual(
      [findResponse(transport.sent, 7), findResponse(transport.sent, 9)],
      [
        { jsonrpc: "2.0", id: 7, error: { code: JsonRpcErrorCodes.MethodNotFound, message: "Method not found: notARealMethod" } },
        { jsonrpc: "2.0", id: 9, error: { code: JsonRpcErrorCodes.MethodNotFound, message: "Method not found: notARealMethod" } }
      ]
    );
  });
  test("extension methods remain enabled by default", async () => {
    const transport = connectClient("client-extension-default");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 11);
    transport.simulateMessage(request(11, "shutdown", {}));
    assert.deepStrictEqual({
      response: await responsePromise,
      shutdownCalls: agentService.shutdownCalls
    }, {
      response: { jsonrpc: "2.0", id: 11, result: null },
      shutdownCalls: 1
    });
  });
  test("extension methods can be disabled", () => {
    const localDisposables = disposables.add(new DisposableStore());
    const localServer = localDisposables.add(new MockProtocolServer());
    localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      localServer,
      {
        defaultDirectory: URI.file("/home/testuser").toString(),
        allowExtensionMethods: false
      },
      localDisposables.add(new AgentHostFileSystemProvider()),
      logService
    ));
    const transport = new MockProtocolTransport();
    localServer.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "client-extension-disabled"
    }));
    transport.sent.length = 0;
    transport.simulateMessage(request(2, "shutdown", {}));
    assert.deepStrictEqual({
      response: findResponse(transport.sent, 2),
      shutdownCalls: agentService.shutdownCalls
    }, {
      response: { jsonrpc: "2.0", id: 2, error: { code: JsonRpcErrorCodes.MethodNotFound, message: "Method not found: shutdown" } },
      shutdownCalls: 0
    });
  });
  test("ping responds after initialize", async () => {
    const transport = connectClient("client-1");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 9);
    transport.simulateMessage(request(9, "ping", {}));
    const resp = await responsePromise;
    assert.strictEqual(resp.id, 9);
    assert.strictEqual(resp.result, null);
  });
  test("subscribe request returns snapshot", async () => {
    stateManager.createSession(makeSessionSummary());
    const transport = connectClient("client-1");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 1);
    transport.simulateMessage(request(1, "subscribe", { channel: sessionUri }));
    const resp = await responsePromise;
    assert.ok(resp, "should have sent response");
    const result = resp.result;
    assert.strictEqual(result.snapshot.resource.toString(), sessionUri.toString());
  });
  test("client action is dispatched and echoed", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport = connectClient("client-1", [sessionUri, defaultChatUri]);
    transport.sent.length = 0;
    transport.simulateMessage(notification("dispatchAction", {
      channel: defaultChatUri,
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      }
    }));
    const actionMsgs = findNotifications(transport.sent, "action");
    const turnStarted = actionMsgs.find((m) => {
      const envelope2 = m.params;
      return envelope2.action.type === ActionType.ChatTurnStarted;
    });
    assert.ok(turnStarted, "should have echoed turnStarted");
    const envelope = turnStarted.params;
    assert.strictEqual(envelope.origin.clientId, "client-1");
    assert.strictEqual(envelope.origin.clientSeq, 1);
  });
  test("unsupported working-directory actions are rejected, not dispatched", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const cases = [
      { type: ActionType.SessionWorkingDirectorySet, channel: sessionUri },
      { type: ActionType.SessionWorkingDirectoryRemoved, channel: sessionUri },
      { type: ActionType.ChatWorkingDirectorySet, channel: defaultChatUri },
      { type: ActionType.ChatWorkingDirectoryRemoved, channel: defaultChatUri }
    ];
    for (const [index, { type, channel }] of cases.entries()) {
      const clientId = `wd-client-${index}`;
      const clientSeq = 100 + index;
      const transport = connectClient(clientId, [sessionUri, defaultChatUri]);
      transport.sent.length = 0;
      agentService.handledActions.length = 0;
      transport.simulateMessage(notification("dispatchAction", {
        channel,
        clientSeq,
        action: { type, directory: "file:///tmp/extra-root" }
      }));
      assert.deepStrictEqual(agentService.handledActions, [], `${type} must not be dispatched`);
      const actionMsgs = findNotifications(transport.sent, "action");
      assert.strictEqual(actionMsgs.length, 1, `${type} should emit exactly one envelope`);
      const envelope = actionMsgs[0].params;
      assert.strictEqual(envelope.action.type, type);
      assert.ok(envelope.rejectionReason, `${type} envelope should carry a rejectionReason`);
      assert.strictEqual(envelope.origin.clientId, clientId);
      assert.strictEqual(envelope.origin.clientSeq, clientSeq);
    }
  });
  test("actions are scoped to subscribed sessions", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transportA = connectClient("client-a", [sessionUri]);
    const transportB = connectClient("client-b");
    transportA.sent.length = 0;
    transportB.sent.length = 0;
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionTitleChanged,
      title: "New Title"
    });
    assert.strictEqual(findNotifications(transportA.sent, "action").length, 1);
    assert.strictEqual(findNotifications(transportB.sent, "action").length, 0);
  });
  test("changeset actions are scoped to subscribed changeset URIs", () => {
    const changesetUri = `${sessionUri}/changeset/session`;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.registerChangeset(changesetUri);
    const transportA = connectClient("client-a-cs", [changesetUri]);
    const transportB = connectClient("client-b-cs", [sessionUri]);
    transportA.sent.length = 0;
    transportB.sent.length = 0;
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///test/changed.ts",
        edit: {
          after: { uri: "file:///test/changed.ts", content: { uri: "file:///test/changed.ts" } },
          diff: { added: 1, removed: 0 }
        }
      }
    });
    const aActions = findNotifications(transportA.sent, "action");
    const bActions = findNotifications(transportB.sent, "action");
    assert.strictEqual(aActions.length, 1, "changeset subscriber should receive 1 envelope");
    assert.strictEqual(bActions.length, 0, "session-only subscriber should receive 0 changeset envelopes");
    const params = aActions[0].params;
    assert.deepStrictEqual(
      { type: params.action.type, channel: params.channel },
      { type: ActionType.ChangesetFileSet, channel: changesetUri }
    );
  });
  test("changeset/cleared reaches changeset subscribers", () => {
    const changesetUri = `${sessionUri}/changeset/session`;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.registerChangeset(changesetUri);
    const transport = connectClient("client-clear", [changesetUri]);
    transport.sent.length = 0;
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetCleared
    });
    const actions = findNotifications(transport.sent, "action");
    assert.strictEqual(actions.length, 1);
    const params = actions[0].params;
    assert.strictEqual(params.action.type, ActionType.ChangesetCleared);
  });
  test("notifications are broadcast to all clients", () => {
    const transportA = connectClient("client-a");
    const transportB = connectClient("client-b");
    transportA.sent.length = 0;
    transportB.sent.length = 0;
    stateManager.createSession(makeSessionSummary());
    assert.strictEqual(findNotifications(transportA.sent, "root/sessionAdded").length, 1);
    assert.strictEqual(findNotifications(transportB.sent, "root/sessionAdded").length, 1);
  });
  test("listSessions includes project metadata", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      project: { uri: URI.file("/workspace/project"), displayName: "Project" },
      summary: "Session Summary"
    });
    const transport = connectClient("client-list");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => item.project), [{ uri: URI.file("/workspace/project").toString(), displayName: "Project" }]);
  });
  test("listSessions omits project metadata when absent", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Session Summary"
    });
    const transport = connectClient("client-list-no-project");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => item.project), [void 0]);
  });
  test("listSessions surfaces the changes summary from the agent", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Session With Changesets",
      changes: {
        additions: 5,
        deletions: 2,
        files: 3
      }
    });
    const transport = connectClient("client-list-changesets");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items[0].changes, {
      additions: 5,
      deletions: 2,
      files: 3
    });
  });
  test("listSessions carries the workspace-less marker on _meta", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Quick Chat",
      workingDirectories: [URI.file("/home/user/.copilot/chats/session-1")],
      _meta: withSessionWorkspaceless(void 0, true)
    });
    const transport = connectClient("client-list-workspaceless");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => readSessionWorkspaceless(item._meta)), [true]);
  });
  test("listSessions omits _meta when the agent provides none", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Session Summary"
    });
    const transport = connectClient("client-list-no-meta");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => item._meta), [void 0]);
  });
  test("createSession returns null and broadcasts project in sessionAdded summary", async () => {
    const transport = connectClient("client-create");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    const newSession = URI.parse("copilot:///created-session").toString();
    transport.simulateMessage(request(2, "createSession", { channel: newSession }));
    const resp = await responsePromise;
    const added = findNotifications(transport.sent, "root/sessionAdded")[0];
    assert.deepStrictEqual({
      result: resp.result,
      project: added.params.summary.project
    }, {
      result: null,
      project: { uri: "file:///created-project", displayName: "Created Project" }
    });
  });
  suite("createChat / disposeChat", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    test("createChat on the default chat URI is a no-op", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", { channel: sessionUri, chat: buildDefaultChatUri(sessionUri) }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats
      }, {
        result: null,
        created: []
      });
    });
    test("createChat for an additional chat forwards to the agent service and grows the catalog", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", { channel: sessionUri, chat: peerChat }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats,
        inCatalog: stateManager.getSessionState(sessionUri)?.chats.some((c) => c.resource === peerChat)
      }, {
        result: null,
        created: [{ session: sessionUri, chat: peerChat }],
        inCatalog: true
      });
    });
    test("createChat forwards a fork source to the agent service", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: { kind: ChatSourceKind.Fork, chat: buildDefaultChatUri(sessionUri), turnId: "turn-1" }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats
      }, {
        result: null,
        created: [{
          session: sessionUri,
          chat: peerChat,
          options: {
            fork: { source: URI.parse(buildDefaultChatUri(sessionUri)), turnId: "turn-1" }
          }
        }]
      });
    });
    test("createChat rejects a source without kind", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: {
          chat: buildDefaultChatUri(sessionUri),
          turnId: "turn-1"
        }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        code: resp.error?.code,
        message: resp.error?.message,
        created: agentService.createdChats
      }, {
        code: JsonRpcErrorCodes.InvalidParams,
        message: "Unsupported createChat source kind: undefined",
        created: []
      });
    });
    test("createChat forwards a side chat source to the agent service", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: {
          kind: ChatSourceKind.SideChat,
          chat: buildDefaultChatUri(sessionUri),
          turnId: "turn-active",
          selection: { text: "  selected text  ", responsePartId: "response-part-1" }
        }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats
      }, {
        result: null,
        created: [{
          session: sessionUri,
          chat: peerChat,
          options: {
            sideChat: { source: URI.parse(buildDefaultChatUri(sessionUri)), turnId: "turn-active", selection: { text: "  selected text  ", responsePartId: "response-part-1" } }
          }
        }]
      });
    });
    test("createChat rejects an unknown source kind", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: {
          kind: "unknown",
          chat: buildDefaultChatUri(sessionUri),
          turnId: "turn-1"
        }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        code: resp.error?.code,
        message: resp.error?.message,
        created: agentService.createdChats
      }, {
        code: JsonRpcErrorCodes.InvalidParams,
        message: "Unsupported createChat source kind: unknown",
        created: []
      });
    });
    test("createChat for an unknown session fails with SESSION_NOT_FOUND", async () => {
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", { channel: "copilot:/missing", chat: buildChatUri("copilot:/missing", "peer-1") }));
      const resp = await responsePromise;
      assert.strictEqual(resp.error?.code, AHP_SESSION_NOT_FOUND);
    });
    test("disposeChat forwards to the agent service and shrinks the catalog", async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.addChat(sessionUri, peerChat);
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "disposeChat", { channel: peerChat }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        disposed: agentService.disposedChats,
        inCatalog: stateManager.getSessionState(sessionUri)?.chats.some((c) => c.resource === peerChat)
      }, {
        result: null,
        disposed: [{ session: sessionUri, chat: peerChat }],
        inCatalog: false
      });
    });
  });
  test("reconnect replays missed actions", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-r", [sessionUri]);
    const resp = findResponse(transport1.sent, 1);
    const initSeq = resp.result.serverSeq;
    transport1.simulateClose();
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Title A" });
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Title B" });
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-r",
      lastSeenServerSeq: initSeq,
      subscriptions: [sessionUri]
    }));
    const reconnectResp = await reconnectRespPromise;
    const result = reconnectResp.result;
    assert.strictEqual(result.type, "replay");
    if (result.type === "replay") {
      assert.strictEqual(result.actions.length, 2);
    }
  });
  test("reconnect rejects a client the server no longer remembers", async () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    const responsePromise = waitForResponse(transport, 1);
    transport.simulateMessage(request(1, "reconnect", {
      clientId: "forgotten-client",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    const response = await responsePromise;
    assert.deepStrictEqual(response.error, {
      code: AhpErrorCodes.NotFound,
      message: "Reconnect client not found: forgotten-client"
    });
    transport.simulateClose();
  });
  test("retains client info for action attribution across reconnect", async () => {
    const transport1 = connectClient("client-attribution", void 0, agentsWindowAgentHostClientInfo);
    transport1.simulateMessage(notification("dispatchAction", {
      channel: "ahp-root://",
      clientSeq: 1,
      action: { type: ActionType.RootConfigChanged, config: {} }
    }));
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 2);
    transport2.simulateMessage(request(2, "reconnect", {
      clientId: "client-attribution",
      lastSeenServerSeq: stateManager.serverSeq,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport2.simulateMessage(notification("dispatchAction", {
      channel: "ahp-root://",
      clientSeq: 2,
      action: { type: ActionType.RootConfigChanged, config: {} }
    }));
    assert.deepStrictEqual(agentService.handledClientTypes, ["agents_window", "agents_window"]);
  });
  test("reconnect replays missed changeset actions to changeset subscribers", async () => {
    const changesetUri = `${sessionUri}/changeset/session`;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.registerChangeset(changesetUri);
    const transport1 = connectClient("client-rc", [changesetUri]);
    const resp = findResponse(transport1.sent, 1);
    const initSeq = resp.result.serverSeq;
    transport1.simulateClose();
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: {
          after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } },
          diff: { added: 2, removed: 0 }
        }
      }
    });
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetStatusChanged,
      status: ChangesetStatus.Ready
    });
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-rc",
      lastSeenServerSeq: initSeq,
      subscriptions: [changesetUri]
    }));
    const reconnectResp = await reconnectRespPromise;
    const result = reconnectResp.result;
    assert.strictEqual(result.type, "replay");
    if (result.type === "replay") {
      const replayedTypes = result.actions.map((e) => e.action.type);
      assert.ok(replayedTypes.includes(ActionType.ChangesetFileSet), "replay should include ChangesetFileSet");
      assert.ok(replayedTypes.includes(ActionType.ChangesetStatusChanged), "replay should include ChangesetStatusChanged");
    }
  });
  test("reconnect sends fresh snapshots when gap too large", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-g", [sessionUri]);
    transport1.simulateClose();
    for (let i = 0; i < 1100; i++) {
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: `Title ${i}` });
    }
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-g",
      lastSeenServerSeq: 0,
      subscriptions: [sessionUri]
    }));
    const reconnectResp = await reconnectRespPromise;
    const result = reconnectResp.result;
    assert.strictEqual(result.type, "snapshot");
    if (result.type === "snapshot") {
      assert.ok(result.snapshots.length > 0, "should contain snapshots");
    }
  });
  test("reconnect rehydrates server-side state that was evicted while disconnected", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const subscribeCalls = [];
    agentService.subscribe = async (resource, _clientId) => {
      subscribeCalls.push(resource.toString());
      let snapshot = stateManager.getSnapshot(resource.toString());
      if (!snapshot) {
        stateManager.restoreSession(makeSessionSummary(), []);
        snapshot = stateManager.getSnapshot(resource.toString());
      }
      return snapshot;
    };
    const transport1 = connectClient("client-e", [sessionUri]);
    const initResp = findResponse(transport1.sent, 1);
    const initSeq = initResp.result.serverSeq;
    transport1.simulateClose();
    stateManager.removeSession(sessionUri);
    assert.strictEqual(stateManager.getSnapshot(sessionUri), void 0, "precondition: state evicted");
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-e",
      lastSeenServerSeq: initSeq,
      subscriptions: [sessionUri]
    }));
    await reconnectRespPromise;
    assert.deepStrictEqual(subscribeCalls, [sessionUri], "reconnect should call subscribe to restore evicted state");
    assert.ok(stateManager.getSnapshot(sessionUri), "state should have been re-hydrated by reconnect");
  });
  test("reconnect re-registers the reverse-RPC filesystem authority", async () => {
    const transport1 = connectClient("client-fs");
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-fs",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport2.sent.length = 0;
    disposables.add(transport2.onDidSend((msg) => {
      if (isJsonRpcRequest(msg) && msg.method === "resourceList") {
        transport2.simulateMessage({
          jsonrpc: "2.0",
          id: msg.id,
          result: { entries: [{ name: "after-reconnect.txt", type: "file" }] }
        });
      }
    }));
    const result = await fileSystemProvider.readdir(agentHostUri("client-fs", "/workspace"));
    assert.deepStrictEqual(result, [["after-reconnect.txt", FileType.File]]);
  });
  test("overlapping reconnect keeps earlier reverse-RPC requests alive until that transport closes", async () => {
    const transport1 = connectClient("client-fs-overlap");
    const reverseRequestPromise = Event.toPromise(Event.filter(transport1.onDidSend, (msg) => isJsonRpcRequest(msg) && msg.method === "resourceList"));
    const readPromise = fileSystemProvider.readdir(agentHostUri("client-fs-overlap", "/workspace"));
    const reverseRequest = await reverseRequestPromise;
    assert.ok(isJsonRpcRequest(reverseRequest));
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-fs-overlap",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport1.simulateMessage({
      jsonrpc: "2.0",
      id: reverseRequest.id,
      result: { entries: [{ name: "from-original-transport.txt", type: "file" }] }
    });
    const result = await readPromise;
    assert.deepStrictEqual(result, [["from-original-transport.txt", FileType.File]]);
  });
  test("closing an older overlapping transport rejects its pending reverse-RPC requests", async () => {
    const transport1 = connectClient("client-fs-overlap-close");
    const reverseRequestPromise = Event.toPromise(Event.filter(transport1.onDidSend, (msg) => isJsonRpcRequest(msg) && msg.method === "resourceList"));
    const readPromise = fileSystemProvider.readdir(agentHostUri("client-fs-overlap-close", "/workspace"));
    await reverseRequestPromise;
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-fs-overlap-close",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport1.simulateClose();
    await assert.rejects(readPromise, /Client client-fs-overlap-close disconnected/);
  });
  test("client disconnect cleans up", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport = connectClient("client-d", [sessionUri]);
    transport.sent.length = 0;
    transport.simulateClose();
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "After Disconnect" });
    assert.strictEqual(transport.sent.length, 0);
  });
  test("client disconnect retains active client during grace, then removes it and fails owned tool calls after grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients.map((c) => c.clientId), ["client-tools"]);
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Running);
      await new Promise((r) => setTimeout(r, 30001));
      assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client client-tools disconnected before completing Run Task"
      });
    });
  });
  test("client disconnect fails owned streaming tool calls after grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client client-tools disconnected before completing Run Task"
      });
    });
  });
  test("owned tool call is not failed when closing the latest overlapping transport falls back to an older one", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      const fallbackTransport = connectClient("client-tools", [sessionUri]);
      const latestTransport = connectClient("client-tools", [sessionUri]);
      latestTransport.simulateClose();
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      fallbackTransport.simulateClose();
    });
  });
  test("owned tool call is failed after the last overlapping transport closes", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      const fallbackTransport = connectClient("client-tools", [sessionUri]);
      const latestTransport = connectClient("client-tools", [sessionUri]);
      latestTransport.simulateClose();
      await new Promise((r) => setTimeout(r, 30001));
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      fallbackTransport.simulateClose();
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client client-tools disconnected before completing Run Task"
      });
    });
  });
  test("client reconnect without session subscription does not clear tool call disconnect timeout", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      const reconnectTransport = new MockProtocolTransport();
      server.simulateConnection(reconnectTransport);
      reconnectTransport.simulateMessage(request(1, "reconnect", {
        clientId: "client-tools",
        lastSeenServerSeq: stateManager.serverSeq,
        subscriptions: []
      }));
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false
      });
    });
  });
  test("client reconnect with session subscription clears tool call disconnect timeout for that session", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      const reconnectTransport = new MockProtocolTransport();
      server.simulateConnection(reconnectTransport);
      reconnectTransport.simulateMessage(request(1, "reconnect", {
        clientId: "client-tools",
        lastSeenServerSeq: stateManager.serverSeq,
        subscriptions: [sessionUri]
      }));
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Running);
    });
  });
  test("client tool timeout tells model it may retry when replacement active client provides the tool", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-replacement",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
        status: part.toolCall.status,
        success: part.toolCall.success,
        content: part.toolCall.content
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        content: [{ type: ToolResultContentType.Text, text: "The client that was running Run Task disconnected, but another active client now provides Run Task. You may try calling the tool again." }]
      });
    });
  });
  test("client tool call stamped for a disconnected protocol client fails after the grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const chatUri = buildDefaultChatUri(sessionUri);
      const transport = connectClient("disconnected-client", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(chatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(chatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" }
      });
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client disconnected-client disconnected before completing Run Task"
      });
    });
  });
  test("client tool call owned by an active local IPC client is not treated as orphaned", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "local-client",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "local-client" }
      });
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
    });
  });
  test("orphaned client tool call timeout is cleared when the owning client connects within the window", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const transport = connectClient("late-client", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "late-client" }
      });
      connectClient("late-client", [sessionUri]);
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
    });
  });
  test("a later orphaned tool call does not extend an earlier one past the grace window", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const transport = connectClient("disconnected-client", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" }
      });
      await new Promise((r) => setTimeout(r, 2e4));
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-2",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" }
      });
      await new Promise((r) => setTimeout(r, 11e3));
      const parts = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts ?? [];
      const statuses = parts.filter((p) => p.kind === ResponsePartKind.ToolCall).map((p) => p.kind === ResponsePartKind.ToolCall ? p.toolCall.status : void 0);
      assert.deepStrictEqual(statuses, [ToolCallStatus.Completed, ToolCallStatus.Completed]);
    });
  });
  test("unsubscribe removes the active client and fails its owned tool calls", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionActiveClientSet,
      activeClient: {
        clientId: "client-tools",
        tools: [{ name: "runTask", description: "Runs a task" }]
      }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "run it", origin: { kind: MessageKind.User } }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tool-1",
      toolName: "runTask",
      displayName: "Run Task",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tool-1",
      invocationMessage: "Run Task",
      toolInput: "{}",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    const transport = connectClient("client-tools", [sessionUri]);
    transport.simulateMessage(notification("unsubscribe", { channel: sessionUri }));
    assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
    const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
    assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
      status: part.toolCall.status,
      success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
      error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
    } : void 0, {
      status: ToolCallStatus.Completed,
      success: false,
      error: "Client client-tools disconnected before completing Run Task"
    });
    transport.simulateClose();
  });
  test("reconnect without resubscription removes the active client and fails its owned tool calls", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-tools", [sessionUri]);
    const initSeq = findResponse(transport1.sent, 1).result.serverSeq;
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionActiveClientSet,
      activeClient: {
        clientId: "client-tools",
        tools: [{ name: "runTask", description: "Runs a task" }]
      }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "run it", origin: { kind: MessageKind.User } }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tool-1",
      toolName: "runTask",
      displayName: "Run Task",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tool-1",
      invocationMessage: "Run Task",
      toolInput: "{}",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-tools",
      lastSeenServerSeq: initSeq,
      subscriptions: []
    }));
    await reconnectRespPromise;
    assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
    const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
    assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
      status: part.toolCall.status,
      success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
      error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
    } : void 0, {
      status: ToolCallStatus.Completed,
      success: false,
      error: "Client client-tools disconnected before completing Run Task"
    });
    transport2.simulateClose();
  });
  test("reconnect with resubscription keeps the active client and its owned tool calls", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-tools", [sessionUri]);
    const initSeq = findResponse(transport1.sent, 1).result.serverSeq;
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionActiveClientSet,
      activeClient: {
        clientId: "client-tools",
        tools: [{ name: "runTask", description: "Runs a task" }]
      }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "run it", origin: { kind: MessageKind.User } }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tool-1",
      toolName: "runTask",
      displayName: "Run Task",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
    });
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-tools",
      lastSeenServerSeq: initSeq,
      subscriptions: [sessionUri]
    }));
    await reconnectRespPromise;
    assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients.map((c) => c.clientId), ["client-tools"]);
    const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
    assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
    transport2.simulateClose();
  });
  test("handshake includes defaultDirectory from side effects", () => {
    const transport = connectClient("client-home");
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp);
    const result = resp.result;
    assert.strictEqual(URI.parse(result.defaultDirectory).path, "/home/testuser");
  });
  test("resourceList routes to side effect handler", async () => {
    const transport = connectClient("client-browse");
    transport.sent.length = 0;
    const dirUri = URI.file("/home/user/project").toString();
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceList", { uri: dirUri }));
    const resp = await responsePromise;
    assert.strictEqual(agentService.browsedUris.length, 1);
    assert.strictEqual(agentService.browsedUris[0].path, "/home/user/project");
    assert.ok(resp);
    const result = resp.result;
    assert.strictEqual(result.entries.length, 2);
    assert.strictEqual(result.entries[0].name, "src");
    assert.strictEqual(result.entries[0].type, "directory");
    assert.strictEqual(result.entries[1].name, "README.md");
    assert.strictEqual(result.entries[1].type, "file");
  });
  test("resourceList returns a JSON-RPC error when the target is invalid", async () => {
    const transport = connectClient("client-browse-error");
    transport.sent.length = 0;
    const dirUri = URI.file("/missing").toString();
    agentService.browseErrors.set(URI.file("/missing").toString(), new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Directory not found: ${dirUri}`));
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceList", { uri: dirUri }));
    const resp = await responsePromise;
    assert.ok(resp?.error);
    assert.strictEqual(resp.error.code, JSON_RPC_INTERNAL_ERROR);
    assert.match(resp.error.message, /Directory not found/);
  });
  test("resourceRead does not log missing file reads", async () => {
    const transport = connectClient("client-read-missing-file");
    transport.sent.length = 0;
    const fileUri = URI.file("/missing").toString();
    agentService.readErrors.set(fileUri, new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${fileUri}`));
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceRead", { uri: fileUri }));
    const resp = await responsePromise;
    assert.deepStrictEqual({
      errorCode: resp.error?.code,
      errorCount: logService.errorCount
    }, {
      errorCode: AhpErrorCodes.NotFound,
      errorCount: 0
    });
  });
  test("resourceRead logs missing non-file reads", async () => {
    const transport = connectClient("client-read-missing-session-db");
    transport.sent.length = 0;
    const resource = "session-db:/missing";
    agentService.readErrors.set(resource, new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${resource}`));
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceRead", { uri: resource }));
    const resp = await responsePromise;
    assert.deepStrictEqual({
      errorCode: resp.error?.code,
      errorCount: logService.errorCount
    }, {
      errorCode: AhpErrorCodes.NotFound,
      errorCount: 1
    });
  });
  test("authenticate returns result via typed request", async () => {
    const transport = connectClient("client-auth");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "authenticate", { resource: "https://api.github.com", token: "test-token" }));
    const resp = await responsePromise;
    assert.ok(!resp.error, `unexpected error: ${resp.error?.message}`);
    assert.deepStrictEqual(resp.result, {});
  });
  test("getManagedSettingsDiagnostics returns provider SDK snapshots", async () => {
    agentService.managedSettingsDiagnostics = [{
      provider: "copilot",
      snapshot: {
        source: "device",
        serverManaged: false,
        deviceManaged: true,
        failClosed: false,
        bypassPermissionsDisabled: false,
        managedKeys: ["permissions"],
        settings: { permissions: { allow: ["Shell(echo *)"] } }
      }
    }];
    const transport = connectClient("client-managed-settings");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "getManagedSettingsDiagnostics"));
    const response = await responsePromise;
    assert.ok(!response.error, `unexpected error: ${response.error?.message}`);
    assert.deepStrictEqual(response.result, agentService.managedSettingsDiagnostics);
  });
  test("extension request preserves ProtocolError code and data", async () => {
    const origHandler = agentService.authenticate;
    agentService.authenticate = async () => {
      throw new ProtocolError(-32007, "Auth required", { hint: "sign in" });
    };
    const transport = connectClient("client-auth-error");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "authenticate", { resource: "test", token: "bad" }));
    const resp = await responsePromise;
    assert.ok(resp?.error);
    assert.strictEqual(resp.error.code, -32007);
    assert.strictEqual(resp.error.message, "Auth required");
    assert.deepStrictEqual(resp.error.data, { hint: "sign in" });
    agentService.authenticate = origHandler;
  });
  test("onDidChangeConnectionCount fires on connect and disconnect", () => {
    const counts = [];
    disposables.add(handler.onDidChangeConnectionCount((c) => counts.push(c)));
    const transport = connectClient("client-count-1");
    connectClient("client-count-2");
    transport.simulateClose();
    assert.deepStrictEqual(counts, [1, 2, 1]);
  });
  test("shares connection count across MessagePort and external listeners", async () => {
    const localDisposables = disposables.add(new DisposableStore());
    const messagePortServer = new MessagePortProtocolServer();
    const socketServer = new MockProtocolServer();
    const combinedServer = localDisposables.add(new CompositeProtocolServer([messagePortServer, socketServer]));
    const combinedHandler = localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      combinedServer,
      { defaultDirectory: URI.file("/home/testuser").toString() },
      localDisposables.add(new AgentHostFileSystemProvider()),
      logService
    ));
    const counts = [];
    localDisposables.add(combinedHandler.onDidChangeConnectionCount((count) => counts.push(count)));
    await messagePortServer.call("message-port-client", "connect");
    await messagePortServer.call("message-port-client", "send", JSON.stringify(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "message-port-client"
    })));
    const socketTransport = new MockProtocolTransport();
    socketServer.simulateConnection(socketTransport);
    socketTransport.simulateMessage(request(2, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "socket-client"
    }));
    messagePortServer.closeClient("message-port-client");
    socketTransport.simulateClose();
    assert.deepStrictEqual(counts, [1, 2, 1, 0]);
  });
  test("onDidChangeConnectionCount is not decremented by stale reconnect close", () => {
    const counts = [];
    disposables.add(handler.onDidChangeConnectionCount((c) => counts.push(c)));
    const transport1 = connectClient("client-rc");
    assert.deepStrictEqual(counts, [1]);
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-rc",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    assert.deepStrictEqual(counts, [1, 1]);
    transport1.simulateClose();
    assert.deepStrictEqual(counts, [1, 1]);
    transport2.simulateClose();
    assert.deepStrictEqual(counts, [1, 1, 0]);
  });
  suite("createSession activeClient", () => {
    test("forwards activeClient to the agent service", async () => {
      const newSession = URI.parse("copilot:///eager-session").toString();
      const transport = connectClient("client-1");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createSession", {
        session: newSession,
        provider: "copilot",
        activeClient: {
          clientId: "client-1",
          tools: [{ name: "t1", description: "d", inputSchema: { type: "object" } }],
          customizations: [{ uri: "file:///plugin-a", displayName: "A" }]
        }
      }));
      const resp = await responsePromise;
      assert.strictEqual(resp.error, void 0, "createSession should succeed");
      const config = agentService.createSessionConfigs.at(-1);
      assert.deepStrictEqual({
        clientId: config?.activeClient?.clientId,
        toolName: config?.activeClient?.tools[0]?.name,
        customizationUri: config?.activeClient?.customizations?.[0].uri
      }, {
        clientId: "client-1",
        toolName: "t1",
        customizationUri: "file:///plugin-a"
      });
    });
    test("rejects createSession when activeClient.clientId mismatches", async () => {
      const newSession = URI.parse("copilot:///mismatch-session").toString();
      const transport = connectClient("client-1");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createSession", {
        session: newSession,
        provider: "copilot",
        activeClient: {
          clientId: "other-client",
          tools: []
        }
      }));
      const resp = await responsePromise;
      assert.ok(resp.error, "response should be an error");
      assert.strictEqual(resp.result, void 0);
      assert.strictEqual(agentService.createSessionConfigs.length, 0, "agent service should not have been called");
    });
  });
  suite("OTLP logs channel", () => {
    let otlpEmitter;
    let otlpStateManager;
    let otlpServer;
    let otlpAgentService;
    let localDisposables;
    setup(() => {
      localDisposables = new DisposableStore();
      otlpEmitter = localDisposables.add(new OtlpLogEmitter());
      otlpStateManager = localDisposables.add(new AgentHostStateManager(new NullLogService()));
      otlpServer = localDisposables.add(new MockProtocolServer());
      otlpAgentService = new MockAgentService();
      otlpAgentService.setStateManager(otlpStateManager);
      localDisposables.add(otlpAgentService);
      localDisposables.add(new ProtocolServerHandler(
        otlpAgentService,
        otlpStateManager,
        otlpServer,
        { defaultDirectory: URI.file("/home/testuser").toString(), otlpLogEmitter: otlpEmitter },
        localDisposables.add(new AgentHostFileSystemProvider()),
        new NullLogService()
      ));
    });
    teardown(() => {
      localDisposables.dispose();
    });
    function connectOtlpClient(clientId, initialSubscriptions) {
      const transport = new MockProtocolTransport();
      otlpServer.simulateConnection(transport);
      transport.simulateMessage(request(1, "initialize", {
        protocolVersions: [PROTOCOL_VERSION],
        clientId,
        initialSubscriptions
      }));
      return transport;
    }
    function findOtlpLogs(sent) {
      return sent.filter(isJsonRpcNotification).filter((m) => m.method === "otlp/exportLogs").map((m) => ({ channel: m.params.channel, payload: m.params.payload }));
    }
    test("handshake advertises the logs channel template", () => {
      const transport = connectOtlpClient("client-otlp-1");
      const resp = findResponse(transport.sent, 1);
      assert.deepStrictEqual(resp.result.telemetry, { logs: "ahp-otlp://logs/{level}" });
    });
    test("subscribe to logs channel returns an empty stateless result and starts forwarding records at-or-above the requested level", async () => {
      const transport = connectOtlpClient("client-otlp-2");
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/warn" }));
      const resp = await waitForResponse(transport, 2);
      assert.deepStrictEqual(resp.result, {});
      otlpEmitter.emit({ timeUnixNano: "1000", severityNumber: 9, severityText: "info", body: "info-msg" });
      otlpEmitter.emit({ timeUnixNano: "1001", severityNumber: 13, severityText: "warn", body: "warn-msg" });
      otlpEmitter.emit({ timeUnixNano: "1002", severityNumber: 17, severityText: "error", body: "error-msg" });
      const logs = findOtlpLogs(transport.sent);
      const bodies = logs.flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map((r) => r.body));
      assert.deepStrictEqual(bodies, ["warn-msg", "error-msg"]);
      for (const { channel } of logs) {
        assert.strictEqual(channel, "ahp-otlp://logs/warn");
      }
    });
    test("unsubscribe stops forwarding without affecting other subscribers", async () => {
      const a = connectOtlpClient("client-otlp-a");
      const b = connectOtlpClient("client-otlp-b");
      const aSubscribed = waitForResponse(a, 2);
      const bSubscribed = waitForResponse(b, 2);
      a.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/trace" }));
      b.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/trace" }));
      await aSubscribed;
      await bSubscribed;
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "first" });
      a.simulateMessage(notification("unsubscribe", { channel: "ahp-otlp://logs/trace" }));
      otlpEmitter.emit({ timeUnixNano: "2", severityNumber: 9, severityText: "info", body: "second" });
      const aBodies = findOtlpLogs(a.sent).flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map((r) => r.body));
      const bBodies = findOtlpLogs(b.sent).flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map((r) => r.body));
      assert.deepStrictEqual({ a: aBodies, b: bBodies }, { a: ["first"], b: ["first", "second"] });
    });
    test("multiple subscriptions to different levels each receive their own band", async () => {
      const transport = connectOtlpClient("client-otlp-multi");
      const subscribed2 = waitForResponse(transport, 2);
      const subscribed3 = waitForResponse(transport, 3);
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/info" }));
      transport.simulateMessage(request(3, "subscribe", { channel: "ahp-otlp://logs/error" }));
      await subscribed2;
      await subscribed3;
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "info-only" });
      otlpEmitter.emit({ timeUnixNano: "2", severityNumber: 17, severityText: "error", body: "both" });
      const byChannel = /* @__PURE__ */ new Map();
      for (const { channel, payload } of findOtlpLogs(transport.sent)) {
        const bodies = [...iterateOtlpLogRecords(payload)].map((r) => r.body);
        byChannel.set(channel, [...byChannel.get(channel) ?? [], ...bodies]);
      }
      assert.deepStrictEqual(Object.fromEntries(byChannel), {
        "ahp-otlp://logs/info": ["info-only", "both"],
        "ahp-otlp://logs/error": ["both"]
      });
    });
    test("client disconnect drops its OTLP subscriptions", async () => {
      const transport = connectOtlpClient("client-otlp-disconnect");
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/trace" }));
      await waitForResponse(transport, 2);
      transport.simulateClose();
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "after-close" });
      const logs = findOtlpLogs(transport.sent);
      assert.deepStrictEqual(logs, []);
    });
    test("unrecognised ahp-otlp URIs do not crash subscribe", async () => {
      const transport = connectOtlpClient("client-otlp-bad");
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/verbose" }));
      const resp = await waitForResponse(transport, 2);
      assert.deepStrictEqual(resp.result, {}, "unknown level should be acknowledged as stateless");
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "whatever" });
      assert.deepStrictEqual(findOtlpLogs(transport.sent), [], "no records should leak to an invalid level");
    });
    test("URI variants that parse to the same level collapse to one canonical subscription", async () => {
      const transport = connectOtlpClient("client-otlp-canonical");
      const r2 = waitForResponse(transport, 2);
      const r3 = waitForResponse(transport, 3);
      const r4 = waitForResponse(transport, 4);
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/info" }));
      transport.simulateMessage(request(3, "subscribe", { channel: "ahp-otlp://logs/info?dup=1" }));
      transport.simulateMessage(request(4, "subscribe", { channel: "ahp-otlp://logs/info#frag" }));
      await r2;
      await r3;
      await r4;
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "once" });
      const logs = findOtlpLogs(transport.sent);
      assert.strictEqual(logs.length, 1, "one record should produce exactly one notification");
      assert.strictEqual(logs[0].channel, "ahp-otlp://logs/info", "channel should be canonicalised");
      transport.simulateMessage(notification("unsubscribe", { channel: "ahp-otlp://logs/info?dup=1" }));
      otlpEmitter.emit({ timeUnixNano: "2", severityNumber: 9, severityText: "info", body: "after-unsub" });
      assert.strictEqual(findOtlpLogs(transport.sent).length, 1, "no further notifications after unsubscribe");
    });
  });
  suite("download progress channel", () => {
    let dlStateManager;
    let dlServer;
    let dlAgentService;
    let localDisposables;
    setup(() => {
      localDisposables = new DisposableStore();
      dlStateManager = localDisposables.add(new AgentHostStateManager(new NullLogService()));
      dlServer = localDisposables.add(new MockProtocolServer());
      dlAgentService = new MockAgentService();
      dlAgentService.setStateManager(dlStateManager);
      localDisposables.add(dlAgentService);
      localDisposables.add(new ProtocolServerHandler(
        dlAgentService,
        dlStateManager,
        dlServer,
        { defaultDirectory: URI.file("/home/testuser").toString() },
        localDisposables.add(new AgentHostFileSystemProvider()),
        new NullLogService()
      ));
    });
    teardown(() => {
      localDisposables.dispose();
    });
    function connectDownloadClient(clientId) {
      const transport = new MockProtocolTransport();
      dlServer.simulateConnection(transport);
      transport.simulateMessage(request(1, "initialize", {
        protocolVersions: [PROTOCOL_VERSION],
        clientId
      }));
      return transport;
    }
    function findProgress(sent) {
      return sent.filter(isJsonRpcNotification).filter((m) => m.method === "root/progress").map((m) => m.params);
    }
    test("forwards each progress frame to connected clients on the root channel", () => {
      const transport = connectDownloadClient("client-dl-1");
      dlStateManager.emitProgress({ progressToken: "t1", progress: 0, total: 1e3, message: "Claude" });
      dlStateManager.emitProgress({ progressToken: "t1", progress: 500, total: 1e3, message: "Claude" });
      dlStateManager.emitProgress({ progressToken: "t1", progress: 1e3, total: 1e3, message: "Claude" });
      const frames = findProgress(transport.sent);
      assert.deepStrictEqual(frames.map((f) => f.progress), [0, 500, 1e3]);
      assert.ok(frames.every((f) => f.progressToken === "t1" && f.message === "Claude" && f.total === 1e3));
      assert.ok(frames.every((f) => f.channel === "ahp-root://"), "frames are broadcast on the root channel");
    });
  });
  suite("resource watches", () => {
    test("subscribe to a resource-watch channel returns the descriptor + bumps refcount; envelopes are routed", async () => {
      const watchChannel = "ahp-resource-watch:/mock-watch";
      const descriptor = { root: "file:///workspace", recursive: false };
      agentService.liveWatchDescriptors.set(watchChannel, descriptor);
      const transport = connectClient("client-watch");
      transport.sent.length = 0;
      const subPromise = waitForResponse(transport, 101);
      transport.simulateMessage(request(101, "subscribe", { channel: watchChannel }));
      const resp = await subPromise;
      const result = resp.result;
      assert.strictEqual(result.snapshot.resource, watchChannel);
      assert.deepStrictEqual(result.snapshot.state, descriptor);
      assert.deepStrictEqual(agentService.watchSubscribeCalls, [watchChannel]);
      transport.sent.length = 0;
      stateManager.dispatchServerAction(watchChannel, {
        type: ActionType.ResourceWatchChanged,
        changes: { items: [{ uri: "file:///workspace/a.txt", type: "updated" }] }
      });
      const actionMsgs = findNotifications(transport.sent, "action");
      assert.strictEqual(actionMsgs.length, 1, "subscriber should receive the change envelope");
      const env = actionMsgs[0].params;
      assert.strictEqual(env.channel, watchChannel);
      assert.strictEqual(env.action.type, ActionType.ResourceWatchChanged);
      transport.simulateMessage(notification("unsubscribe", { channel: watchChannel }));
      assert.deepStrictEqual(agentService.watchUnsubscribeCalls, [watchChannel]);
    });
    test("subscribe to an unknown resource-watch channel surfaces a JSON-RPC error", async () => {
      const transport = connectClient("client-watch-bad");
      transport.sent.length = 0;
      const respPromise = waitForResponse(transport, 102);
      transport.simulateMessage(request(102, "subscribe", { channel: "ahp-resource-watch:/bogus" }));
      const resp = await respPromise;
      const error = resp.error;
      assert.ok(error, `expected an error response, got ${JSON.stringify(resp)}`);
    });
    test("client disconnect releases the watch refcount", async () => {
      const watchChannel = "ahp-resource-watch:/mock-watch-disconnect";
      agentService.liveWatchDescriptors.set(watchChannel, { root: "file:///root", recursive: false });
      const transport = connectClient("client-watch-2");
      const subPromise = waitForResponse(transport, 200);
      transport.simulateMessage(request(200, "subscribe", { channel: watchChannel }));
      await subPromise;
      assert.deepStrictEqual(agentService.watchSubscribeCalls, [watchChannel]);
      transport.simulateClose();
      assert.deepStrictEqual(agentService.watchUnsubscribeCalls, [watchChannel]);
    });
    test("overlapping transports release each resource-watch subscription", async () => {
      const watchChannel = "ahp-resource-watch:/mock-watch-overlap";
      agentService.liveWatchDescriptors.set(watchChannel, { root: "file:///root", recursive: false });
      const transport1 = connectClient("client-watch-overlap");
      const subPromise1 = waitForResponse(transport1, 200);
      transport1.simulateMessage(request(200, "subscribe", { channel: watchChannel }));
      await subPromise1;
      const transport2 = connectClient("client-watch-overlap");
      const subPromise2 = waitForResponse(transport2, 201);
      transport2.simulateMessage(request(201, "subscribe", { channel: watchChannel }));
      await subPromise2;
      transport2.simulateClose();
      transport1.simulateClose();
      assert.deepStrictEqual({
        subscribes: agentService.watchSubscribeCalls,
        unsubscribes: agentService.watchUnsubscribeCalls
      }, {
        subscribes: [watchChannel, watchChannel],
        unsubscribes: [watchChannel, watchChannel]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvcHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBGaWxlVHlwZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIHR5cGUgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzLCB0eXBlIElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvLCB0eXBlIElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQsIHR5cGUgSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMsIHR5cGUgSUFnZW50U2VydmljZSwgdHlwZSBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsIHR5cGUgSUFnZW50U2Vzc2lvbk1ldGFkYXRhLCB0eXBlIEF1dGhlbnRpY2F0ZVBhcmFtcywgdHlwZSBBdXRoZW50aWNhdGVSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTb3VyY2VLaW5kLCBDb21wbGV0aW9uc1BhcmFtcywgQ29tcGxldGlvbnNSZXN1bHQsIENvbnRlbnRFbmNvZGluZywgTGlzdFNlc3Npb25zUmVzdWx0LCBSZXNvdXJjZVJlYWRSZXN1bHQsIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQsIFJlc291cmNlTWtkaXJQYXJhbXMsIFJlc291cmNlTWtkaXJSZXN1bHQsIFJlc291cmNlUmVzb2x2ZVBhcmFtcywgUmVzb3VyY2VSZXNvbHZlUmVzdWx0LCBSZXNvdXJjZUNvcHlQYXJhbXMsIFJlc291cmNlQ29weVJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uLCB0eXBlIFRlcm1pbmFsQWN0aW9uLCB0eXBlIENsaWVudEFubm90YXRpb25zQWN0aW9uLCB0eXBlIFByb2dyZXNzUGFyYW1zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc0pzb25ScGNOb3RpZmljYXRpb24sIGlzSnNvblJwY1JlcXVlc3QsIGlzSnNvblJwY1Jlc3BvbnNlLCBKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgSnNvblJwY0Vycm9yQ29kZXMsIFByb3RvY29sRXJyb3IsIEFocEVycm9yQ29kZXMsIEFIUF9VTlNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OLCBBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIHR5cGUgQWhwTm90aWZpY2F0aW9uLCB0eXBlIEluaXRpYWxpemVSZXN1bHQsIHR5cGUgUHJvdG9jb2xNZXNzYWdlLCB0eXBlIFJlY29ubmVjdFJlc3VsdCwgdHlwZSBSZXNvdXJjZUxpc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VXcml0ZVBhcmFtcywgdHlwZSBSZXNvdXJjZVdyaXRlUmVzdWx0LCB0eXBlIElTdGF0ZVNuYXBzaG90IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MsIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkFkZGVkUGFyYW1zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL25vdGlmaWNhdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvdG9jb2xTZXJ2ZXIsIElQcm90b2NvbFRyYW5zcG9ydCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IFByb3RvY29sU2VydmVySGFuZGxlciB9IGZyb20gJy4uLy4uL25vZGUvcHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZVByb3RvY29sU2VydmVyIH0gZnJvbSAnLi4vLi4vbm9kZS9jb21wb3NpdGVQcm90b2NvbFNlcnZlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIsIGFnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbywgdHlwZSBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgaXRlcmF0ZU90bHBMb2dSZWNvcmRzLCBPdGxwTG9nRW1pdHRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGxwL290bHBMb2dFbWl0dGVyLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIgfSBmcm9tICcuLi8uLi9ub2RlL21lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIuanMnO1xuXG4vLyAtLS0tIE1vY2sgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQgaW1wbGVtZW50cyBJUHJvdG9jb2xUcmFuc3BvcnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSBuZXcgRW1pdHRlcjxQcm90b2NvbE1lc3NhZ2U+KCk7XG5cdHJlYWRvbmx5IG9uTWVzc2FnZSA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZW5kID0gbmV3IEVtaXR0ZXI8UHJvdG9jb2xNZXNzYWdlPigpO1xuXHRyZWFkb25seSBvbkRpZFNlbmQgPSB0aGlzLl9vbkRpZFNlbmQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2xvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkNsb3NlID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblxuXHRyZWFkb25seSBzZW50OiBQcm90b2NvbE1lc3NhZ2VbXSA9IFtdO1xuXG5cdHNlbmQobWVzc2FnZTogUHJvdG9jb2xNZXNzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5zZW50LnB1c2gobWVzc2FnZSk7XG5cdFx0dGhpcy5fb25EaWRTZW5kLmZpcmUobWVzc2FnZSk7XG5cdH1cblxuXHRzaW11bGF0ZU1lc3NhZ2UobXNnOiBQcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZShtc2cpO1xuXHR9XG5cblx0c2ltdWxhdGVDbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkNsb3NlLmZpcmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25NZXNzYWdlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFNlbmQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uQ2xvc2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tQcm90b2NvbFNlcnZlciBpbXBsZW1lbnRzIElQcm90b2NvbFNlcnZlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29ubmVjdGlvbiA9IG5ldyBFbWl0dGVyPElQcm90b2NvbFRyYW5zcG9ydD4oKTtcblx0cmVhZG9ubHkgb25Db25uZWN0aW9uID0gdGhpcy5fb25Db25uZWN0aW9uLmV2ZW50O1xuXHRyZWFkb25seSBhZGRyZXNzID0gJ21vY2s6Ly90ZXN0JztcblxuXHRzaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkNvbm5lY3Rpb24uZmlyZSh0cmFuc3BvcnQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIENvdW50aW5nTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0ZXJyb3JDb3VudCA9IDA7XG5cblx0b3ZlcnJpZGUgZXJyb3IoX21lc3NhZ2U6IHN0cmluZywgLi4uX2FyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuZXJyb3JDb3VudCsrO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tBZ2VudFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGhhbmRsZWRBY3Rpb25zOiAoU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pW10gPSBbXTtcblx0cmVhZG9ubHkgaGFuZGxlZENsaWVudFR5cGVzOiAoQWdlbnRIb3N0Q2xpZW50VHlwZSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRyZWFkb25seSBicm93c2VkVXJpczogVVJJW10gPSBbXTtcblx0cmVhZG9ubHkgYnJvd3NlRXJyb3JzID0gbmV3IE1hcDxzdHJpbmcsIEVycm9yPigpO1xuXHRyZWFkb25seSByZWFkRXJyb3JzID0gbmV3IE1hcDxzdHJpbmcsIEVycm9yPigpO1xuXHRyZWFkb25seSBsaXN0ZWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10gPSBbXTtcblx0cmVhZG9ubHkgY3JlYXRlU2Vzc2lvbkNvbmZpZ3M6IChJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdG1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzOiByZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXSA9IFtdO1xuXHRzaHV0ZG93bkNhbGxzID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPGltcG9ydCgnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJykuQWN0aW9uRW52ZWxvcGU+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTm90aWZpY2F0aW9uID0gbmV3IEVtaXR0ZXI8aW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnKS5JTm90aWZpY2F0aW9uPigpO1xuXHRyZWFkb25seSBvbkRpZE5vdGlmaWNhdGlvbiA9IHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1jcE5vdGlmaWNhdGlvbiA9IG5ldyBFbWl0dGVyPGltcG9ydCgnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcycpLklNY3BOb3RpZmljYXRpb24+KCk7XG5cdHJlYWRvbmx5IG9uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fb25NY3BOb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RhdGVNYW5hZ2VyITogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXG5cdC8qKiBDb25uZWN0IHRvIHRoZSBzdGF0ZSBtYW5hZ2VyIHNvIGRpc3BhdGNoQWN0aW9uIHdvcmtzIGNvcnJlY3RseS4gKi9cblx0c2V0U3RhdGVNYW5hZ2VyKHNtOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIgPSBzbTtcblx0fVxuXG5cdGRpc3BhdGNoQWN0aW9uKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgY2xpZW50SWQ6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIsIGNsaWVudFR5cGU/OiBBZ2VudEhvc3RDbGllbnRUeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVkQWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0dGhpcy5oYW5kbGVkQ2xpZW50VHlwZXMucHVzaChjbGllbnRUeXBlKTtcblx0XHRjb25zdCBvcmlnaW4gPSB7IGNsaWVudElkLCBjbGllbnRTZXEgfTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oY2hhbm5lbCwgYWN0aW9uLCBvcmlnaW4pO1xuXHR9XG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnPzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8VVJJPiB7XG5cdFx0dGhpcy5jcmVhdGVTZXNzaW9uQ29uZmlncy5wdXNoKGNvbmZpZyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbmZpZz8uc2Vzc2lvbiA/PyBVUkkucGFyc2UoJ2NvcGlsb3Q6Ly8vbmV3LXNlc3Npb24nKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZz8ucHJvdmlkZXIgPz8gJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9jcmVhdGVkLXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ0NyZWF0ZWQgUHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogY29uZmlnPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/IFtjb25maWcud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0udG9TdHJpbmcoKV0gOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhfcGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHsgcmV0dXJuIHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH07IH1cblx0YXN5bmMgc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKF9wYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7IHJldHVybiB7IGl0ZW1zOiBbXSB9OyB9XG5cdGFzeW5jIGNvbXBsZXRpb25zKF9wYXJhbXM6IENvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxDb21wbGV0aW9uc1Jlc3VsdD4geyByZXR1cm4geyBpdGVtczogW10gfTsgfVxuXHRhc3luYyBnZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZGlzcG9zZVNlc3Npb24oX3Nlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdHJlYWRvbmx5IGNyZWF0ZWRDaGF0czogeyBzZXNzaW9uOiBzdHJpbmc7IGNoYXQ6IHN0cmluZzsgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIH1bXSA9IFtdO1xuXHRyZWFkb25seSBkaXNwb3NlZENoYXRzOiB7IHNlc3Npb246IHN0cmluZzsgY2hhdDogc3RyaW5nIH1bXSA9IFtdO1xuXHRhc3luYyBjcmVhdGVDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNyZWF0ZWRDaGF0cy5wdXNoKHsgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjaGF0LnRvU3RyaW5nKCksIC4uLihvcHRpb25zID8geyBvcHRpb25zIH0gOiB7fSkgfSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0LnRvU3RyaW5nKCkpO1xuXHR9XG5cdGFzeW5jIGRpc3Bvc2VDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlZENoYXRzLnB1c2goeyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXQudG9TdHJpbmcoKSB9KTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQudG9TdHJpbmcoKSk7XG5cdH1cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+IHsgcmV0dXJuIHRoaXMubGlzdGVkU2Vzc2lvbnM7IH1cblx0YXN5bmMgc3Vic2NyaWJlKHJlc291cmNlOiBVUkksIF9jbGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxJU3RhdGVTbmFwc2hvdD4ge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghc25hcHNob3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHN1YnNjcmliZSB0byB1bmtub3duIHJlc291cmNlOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBzbmFwc2hvdDtcblx0fVxuXHRhZGRTdWJzY3JpYmVyKF9yZXNvdXJjZTogVVJJLCBfY2xpZW50SWQ6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHVuc3Vic2NyaWJlKF9yZXNvdXJjZTogVVJJLCBfY2xpZW50SWQ6IHN0cmluZyk6IHZvaWQgeyB9XG5cdGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4geyB0aGlzLnNodXRkb3duQ2FsbHMrKzsgfVxuXHRhc3luYyBnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvKCk6IFByb21pc2U8SUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8+IHsgcmV0dXJuIHsgdmVyc2lvbjogJ3Rlc3QnLCBvczogJ3Rlc3QnLCBhcmNoOiAndGVzdCcsIHByb3h5U2V0dGluZ3M6IHt9LCBwcm94eUVudjoge30sIGVuZHBvaW50czogW10gfTsgfVxuXHRhc3luYyBnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcygpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljc1tdPiB7IHJldHVybiB0aGlzLm1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzOyB9XG5cdGFzeW5jIGRpYWdub3N0aWNzRmV0Y2godXJsOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQ+IHsgcmV0dXJuIHsgdXJsIH07IH1cblx0YXN5bmMgYXV0aGVudGljYXRlKF9wYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8QXV0aGVudGljYXRlUmVzdWx0PiB7IHJldHVybiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfTsgfVxuXHRnZXRBdXRoVG9rZW4oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyByZXNvdXJjZVdyaXRlKF9wYXJhbXM6IFJlc291cmNlV3JpdGVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlV3JpdGVSZXN1bHQ+IHsgcmV0dXJuIHt9OyB9XG5cdGFzeW5jIHJlc291cmNlTGlzdCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0dGhpcy5icm93c2VkVXJpcy5wdXNoKHVyaSk7XG5cdFx0Y29uc3QgZXJyb3IgPSB0aGlzLmJyb3dzZUVycm9ycy5nZXQodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChlcnJvcikge1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRlbnRyaWVzOiBbXG5cdFx0XHRcdHsgbmFtZTogJ3NyYycsIHR5cGU6ICdkaXJlY3RvcnknIH0sXG5cdFx0XHRcdHsgbmFtZTogJ1JFQURNRS5tZCcsIHR5cGU6ICdmaWxlJyB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9XG5cdGFzeW5jIHJlc291cmNlUmVhZCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0Y29uc3QgZXJyb3IgPSB0aGlzLnJlYWRFcnJvcnMuZ2V0KHVyaS50b1N0cmluZygpKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4geyBkYXRhOiAnJywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4IH07XG5cdH1cblx0YXN5bmMgcmVzb3VyY2VDb3B5KF9wYXJhbXM6IFJlc291cmNlQ29weVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VDb3B5UmVzdWx0PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyByZXNvdXJjZURlbGV0ZSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyByZXNvdXJjZU1vdmUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0YXN5bmMgcmVzb3VyY2VSZXNvbHZlKF9wYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7IH1cblx0YXN5bmMgcmVzb3VyY2VNa2RpcihfcGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0PiB7IHJldHVybiB7fTsgfVxuXHRyZWFkb25seSB3YXRjaFN1YnNjcmliZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSB3YXRjaFVuc3Vic2NyaWJlQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdC8qKiBDaGFubmVscyBmb3Igd2hpY2ggYG9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWRgIHNob3VsZCByZXR1cm4gYSBkZXNjcmlwdG9yLiAqL1xuXHRyZWFkb25seSBsaXZlV2F0Y2hEZXNjcmlwdG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBpbXBvcnQoJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnKS5SZXNvdXJjZVdhdGNoU3RhdGU+KCk7XG5cdGFzeW5jIGNyZWF0ZVJlc291cmNlV2F0Y2goX3BhcmFtczogaW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJykuQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyk6IFByb21pc2U8aW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJykuQ3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG5cdH1cblx0b25SZXNvdXJjZVdhdGNoU3Vic2NyaWJlZChjaGFubmVsOiBzdHJpbmcpOiBpbXBvcnQoJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnKS5SZXNvdXJjZVdhdGNoU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMud2F0Y2hTdWJzY3JpYmVDYWxscy5wdXNoKGNoYW5uZWwpO1xuXHRcdHJldHVybiB0aGlzLmxpdmVXYXRjaERlc2NyaXB0b3JzLmdldChjaGFubmVsKTtcblx0fVxuXHRvblJlc291cmNlV2F0Y2hVbnN1YnNjcmliZWQoY2hhbm5lbDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0dGhpcy53YXRjaFVuc3Vic2NyaWJlQ2FsbHMucHVzaChjaGFubmVsKTtcblx0XHRyZXR1cm4gdGhpcy5saXZlV2F0Y2hEZXNjcmlwdG9ycy5oYXMoY2hhbm5lbCk7XG5cdH1cblx0YXN5bmMgY3JlYXRlVGVybWluYWwoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZGlzcG9zZVRlcm1pbmFsKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGludm9rZUNoYW5nZXNldE9wZXJhdGlvbigpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KCk6IFByb21pc2U8dW5rbm93bj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgZm91bmQnKTsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBY3Rpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8gLS0tLSBIZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gbm90aWZpY2F0aW9uKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM/OiB1bmtub3duKTogUHJvdG9jb2xNZXNzYWdlIHtcblx0cmV0dXJuIHsganNvbnJwYzogJzIuMCcsIG1ldGhvZCwgcGFyYW1zIH0gYXMgUHJvdG9jb2xNZXNzYWdlO1xufVxuXG5mdW5jdGlvbiByZXF1ZXN0KGlkOiBudW1iZXIsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM/OiB1bmtub3duKTogUHJvdG9jb2xNZXNzYWdlIHtcblx0cmV0dXJuIHsganNvbnJwYzogJzIuMCcsIGlkLCBtZXRob2QsIHBhcmFtcyB9IGFzIFByb3RvY29sTWVzc2FnZTtcbn1cblxuZnVuY3Rpb24gZmluZE5vdGlmaWNhdGlvbnMoc2VudDogUHJvdG9jb2xNZXNzYWdlW10sIG1ldGhvZDogc3RyaW5nKTogQWhwTm90aWZpY2F0aW9uW10ge1xuXHRyZXR1cm4gc2VudC5maWx0ZXIoaXNKc29uUnBjTm90aWZpY2F0aW9uKSBhcyBBaHBOb3RpZmljYXRpb25bXTtcbn1cblxuZnVuY3Rpb24gZmluZFJlc3BvbnNlKHNlbnQ6IFByb3RvY29sTWVzc2FnZVtdLCBpZDogbnVtYmVyKTogUHJvdG9jb2xNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHNlbnQuZmluZChtZXNzYWdlID0+IGlzSnNvblJwY1Jlc3BvbnNlKG1lc3NhZ2UpICYmIG1lc3NhZ2UuaWQgPT09IGlkKTtcbn1cblxuZnVuY3Rpb24gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDogTW9ja1Byb3RvY29sVHJhbnNwb3J0LCBpZDogbnVtYmVyKTogUHJvbWlzZTxQcm90b2NvbE1lc3NhZ2U+IHtcblx0cmV0dXJuIEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIodHJhbnNwb3J0Lm9uRGlkU2VuZCwgbWVzc2FnZSA9PiBpc0pzb25ScGNSZXNwb25zZShtZXNzYWdlKSAmJiBtZXNzYWdlLmlkID09PSBpZCkpO1xufVxuXG4vLyAtLS0tIFRlc3RzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5zdWl0ZSgnUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGxldCBzZXJ2ZXI6IE1vY2tQcm90b2NvbFNlcnZlcjtcblx0bGV0IGFnZW50U2VydmljZTogTW9ja0FnZW50U2VydmljZTtcblx0bGV0IGhhbmRsZXI6IFByb3RvY29sU2VydmVySGFuZGxlcjtcblx0bGV0IGZpbGVTeXN0ZW1Qcm92aWRlcjogQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyO1xuXHRsZXQgbG9nU2VydmljZTogQ291bnRpbmdMb2dTZXJ2aWNlO1xuXG5cdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3Rlc3Qtc2Vzc2lvbicgfSkudG9TdHJpbmcoKTtcblx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdGZ1bmN0aW9uIG1ha2VTZXNzaW9uU3VtbWFyeShyZXNvdXJjZT86IHN0cmluZyk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlID8/IHNlc3Npb25VcmksXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbm5lY3RDbGllbnQoY2xpZW50SWQ6IHN0cmluZywgaW5pdGlhbFN1YnNjcmlwdGlvbnM/OiByZWFkb25seSBzdHJpbmdbXSwgY2xpZW50SW5mbz86IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nIH0pOiBNb2NrUHJvdG9jb2xUcmFuc3BvcnQge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydCk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdpbml0aWFsaXplJywge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRjbGllbnRJbmZvLFxuXHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnMsXG5cdFx0fSkpO1xuXHRcdHJldHVybiB0cmFuc3BvcnQ7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzZXJ2ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRhZ2VudFNlcnZpY2UgPSBuZXcgTW9ja0FnZW50U2VydmljZSgpO1xuXHRcdGFnZW50U2VydmljZS5zZXRTdGF0ZU1hbmFnZXIoc3RhdGVNYW5hZ2VyKTtcblx0XHRsb2dTZXJ2aWNlID0gbmV3IENvdW50aW5nTG9nU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudFNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChoYW5kbGVyID0gbmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdHNlcnZlcixcblx0XHRcdHsgZGVmYXVsdERpcmVjdG9yeTogVVJJLmZpbGUoJy9ob21lL3Rlc3R1c2VyJykudG9TdHJpbmcoKSB9LFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTeXN0ZW1Qcm92aWRlciA9IG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdoYW5kc2hha2UgcmV0dXJucyBpbml0aWFsaXplIHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJyk7XG5cblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKTtcblx0XHRhc3NlcnQub2socmVzcCwgJ3Nob3VsZCBoYXZlIHNlbnQgaW5pdGlhbGl6ZSByZXNwb25zZScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHsgcmVzdWx0OiBJbml0aWFsaXplUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByb3RvY29sVmVyc2lvbiwgUFJPVE9DT0xfVkVSU0lPTik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXJ2ZXJTZXEsIHN0YXRlTWFuYWdlci5zZXJ2ZXJTZXEpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kc2hha2UgcmVqZWN0cyB1bnN1cHBvcnRlZCBwcm90b2NvbCB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdC8vIE9mZmVyIGEgc2luZ2xlLCBkZWxpYmVyYXRlbHktdW5zdXBwb3J0ZWQgdmVyc2lvbi4gVGhlIHNlcnZlciBzaG91bGRcblx0XHQvLyByZXNwb25kIHdpdGggLTMyMDA1IGFuZCBhIG1lc3NhZ2UgbmFtaW5nIHRoZSBvZmZlcmVkL3N1cHBvcnRlZCBzZXRzXG5cdFx0Ly8gaW5zdGVhZCBvZiBhIHJlc3VsdC5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbJzAuMC4wJ10sXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1pbmNvbXBhdCcsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzcCA9IGZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgMSkgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IGRhdGE/OiB1bmtub3duIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2socmVzcCwgJ3Nob3VsZCBoYXZlIHNlbnQgZXJyb3IgcmVzcG9uc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5lcnJvcj8uY29kZSwgQUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04pO1xuXHRcdGFzc2VydC5tYXRjaChyZXNwLmVycm9yIS5tZXNzYWdlLCAvMFxcLjBcXC4wLyk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3AuZXJyb3IhLm1lc3NhZ2UsIG5ldyBSZWdFeHAoUFJPVE9DT0xfVkVSU0lPTi5yZXBsYWNlKC9cXC4vZywgJ1xcXFwuJykpKTtcblx0XHQvLyBXaXRob3V0IHRoZSB1cGdyYWRlLXNvY2tldCBlbnYgdmFyLCBubyBfbWV0YSBzaG91bGQgYmUgYWR2ZXJ0aXNlZC5cblx0XHRjb25zdCBkYXRhID0gcmVzcC5lcnJvciEuZGF0YSBhcyB7IF9tZXRhPzogeyB2c2NvZGVVcGdyYWRlTWV0aG9kPzogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YT8uX21ldGE/LnZzY29kZVVwZ3JhZGVNZXRob2QsIHVuZGVmaW5lZCk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdHRyYW5zcG9ydC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzaGFrZSBsZW5pZW50bHkgcGlja3MgdGhlIGhpZ2hlc3QgY29tcGF0aWJsZSBvZmZlcmVkIHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Ly8gTWl4IGFuIGluY29tcGF0aWJsZSB2ZXJzaW9uIHdpdGggYSBjb21wYXRpYmxlIG9uZSBcdTIwMTQgdGhlIHNlcnZlclxuXHRcdC8vIG11c3QgcGljayB0aGUgY29tcGF0aWJsZSBvbmUgcmF0aGVyIHRoYW4gcmVqZWN0aW5nIG9uIHRoZSBmaXJzdFxuXHRcdC8vIHVua25vd24gZW50cnkuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbJzAuMC4wJywgUFJPVE9DT0xfVkVSU0lPTiwgJzkuOS45J10sXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1sZW5pZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKSBhcyB7IHJlc3VsdD86IEluaXRpYWxpemVSZXN1bHQgfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2socmVzcD8ucmVzdWx0LCAnc2hvdWxkIGhhdmUgbmVnb3RpYXRlZCBzdWNjZXNzZnVsbHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5yZXN1bHQucHJvdG9jb2xWZXJzaW9uLCBQUk9UT0NPTF9WRVJTSU9OKTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0dHJhbnNwb3J0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBncmFkZSBtZXRob2QgYWR2ZXJ0aXNlZCB3aGVuIG1hbmFnZW1lbnQgc29ja2V0IGVudiB2YXIgaXMgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsRW52ID0gcHJvY2Vzcy5lbnYuVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVQ7XG5cdFx0cHJvY2Vzcy5lbnYuVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVQgPSAnL3RtcC9tb2NrLXN1cGVydmlzb3Iuc29jayc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogWyc5LjkuOSddLFxuXHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC1pbmNvbXBhdC13aXRoLWNsaScsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0LnNlbnQsIDEpIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgZGF0YT86IHVua25vd24gfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3A/LmVycm9yPy5jb2RlLCBBSFBfVU5TVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTik7XG5cdFx0XHRjb25zdCBkYXRhID0gcmVzcC5lcnJvciEuZGF0YSBhcyB7IF9tZXRhPzogeyB2c2NvZGVVcGdyYWRlTWV0aG9kPzogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhPy5fbWV0YT8udnNjb2RlVXBncmFkZU1ldGhvZCwgJ192c2NvZGVVcGdyYWRlJyk7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHR0cmFuc3BvcnQuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAob3JpZ2luYWxFbnYgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkZWxldGUgcHJvY2Vzcy5lbnYuVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9jZXNzLmVudi5WU0NPREVfQUdFTlRfSE9TVF9NQU5BR0VNRU5UX1NPQ0tFVCA9IG9yaWdpbmFsRW52O1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnX3ZzY29kZVVwZ3JhZGUgUlBDIHJldHVybnMgTWV0aG9kTm90Rm91bmQgd2hlbiBubyBzdXBlcnZpc29yIGlzIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdC8vIE5vdGU6IE5PVCBnb2luZyB0aHJvdWdoIGluaXRpYWxpemUgZmlyc3QgXHUyMDE0IHRoZSB1cGdyYWRlIG1ldGhvZCBtdXN0XG5cdFx0Ly8gYWxzbyBiZSBjYWxsYWJsZSBwcmUtaGFuZHNoYWtlLlxuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDQyKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoNDIsICdfdnNjb2RlVXBncmFkZScsIHt9KSk7XG5cblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfTtcblx0XHRhc3NlcnQub2socmVzcC5lcnJvciwgJ3Nob3VsZCBoYXZlIHJlc3BvbmRlZCB3aXRoIGFuIGVycm9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3IhLmNvZGUsIC0zMjYwMSAvKiBNZXRob2ROb3RGb3VuZCAqLyk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdHRyYW5zcG9ydC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzaGFrZSB3aXRoIGluaXRpYWxTdWJzY3JpcHRpb25zIHJldHVybnMgc25hcHNob3RzJywgKCkgPT4ge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJywgW3Nlc3Npb25VcmldKTtcblxuXHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0LnNlbnQsIDEpO1xuXHRcdGFzc2VydC5vayhyZXNwKTtcblx0XHRjb25zdCByZXN1bHQgPSAocmVzcCBhcyB7IHJlc3VsdDogSW5pdGlhbGl6ZVJlc3VsdCB9KS5yZXN1bHQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmFwc2hvdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNuYXBzaG90c1swXS5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwaW5nIHJlc3BvbmRzIGJlZm9yZSBpbml0aWFsaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhbnNwb3J0KTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydCk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgNyk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDcsICdwaW5nJywge30pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgaWQ6IG51bWJlcjsgcmVzdWx0OiBudWxsIH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5pZCwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AucmVzdWx0LCBudWxsKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIHJlcXVlc3RzIHJldHVybiBNZXRob2ROb3RGb3VuZCBiZWZvcmUgYW5kIGFmdGVyIGluaXRpYWxpemUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFuc3BvcnQpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCg3LCAnbm90QVJlYWxNZXRob2QnLCB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycgfSkpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCg4LCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LTEnLFxuXHRcdH0pKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoOSwgJ25vdEFSZWFsTWV0aG9kJywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCA3KSwgZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCA5KV0sXG5cdFx0XHRbXG5cdFx0XHRcdHsganNvbnJwYzogJzIuMCcsIGlkOiA3LCBlcnJvcjogeyBjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5NZXRob2ROb3RGb3VuZCwgbWVzc2FnZTogJ01ldGhvZCBub3QgZm91bmQ6IG5vdEFSZWFsTWV0aG9kJyB9IH0sXG5cdFx0XHRcdHsganNvbnJwYzogJzIuMCcsIGlkOiA5LCBlcnJvcjogeyBjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5NZXRob2ROb3RGb3VuZCwgbWVzc2FnZTogJ01ldGhvZCBub3QgZm91bmQ6IG5vdEFSZWFsTWV0aG9kJyB9IH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dGVuc2lvbiBtZXRob2RzIHJlbWFpbiBlbmFibGVkIGJ5IGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWV4dGVuc2lvbi1kZWZhdWx0Jyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAxMSk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMTEsICdzaHV0ZG93bicsIHt9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3BvbnNlOiBhd2FpdCByZXNwb25zZVByb21pc2UsXG5cdFx0XHRzaHV0ZG93bkNhbGxzOiBhZ2VudFNlcnZpY2Uuc2h1dGRvd25DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRyZXNwb25zZTogeyBqc29ucnBjOiAnMi4wJywgaWQ6IDExLCByZXN1bHQ6IG51bGwgfSxcblx0XHRcdHNodXRkb3duQ2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dGVuc2lvbiBtZXRob2RzIGNhbiBiZSBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgbG9jYWxTZXJ2ZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sU2VydmVyKCkpO1xuXHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0XHRhZ2VudFNlcnZpY2UsXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRsb2NhbFNlcnZlcixcblx0XHRcdHtcblx0XHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogVVJJLmZpbGUoJy9ob21lL3Rlc3R1c2VyJykudG9TdHJpbmcoKSxcblx0XHRcdFx0YWxsb3dFeHRlbnNpb25NZXRob2RzOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0bG9jYWxTZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydCk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdpbml0aWFsaXplJywge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtZXh0ZW5zaW9uLWRpc2FibGVkJyxcblx0XHR9KSk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ3NodXRkb3duJywge30pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzcG9uc2U6IGZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgMiksXG5cdFx0XHRzaHV0ZG93bkNhbGxzOiBhZ2VudFNlcnZpY2Uuc2h1dGRvd25DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRyZXNwb25zZTogeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIGVycm9yOiB7IGNvZGU6IEpzb25ScGNFcnJvckNvZGVzLk1ldGhvZE5vdEZvdW5kLCBtZXNzYWdlOiAnTWV0aG9kIG5vdCBmb3VuZDogc2h1dGRvd24nIH0gfSxcblx0XHRcdHNodXRkb3duQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpbmcgcmVzcG9uZHMgYWZ0ZXIgaW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtMScpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgOSk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDksICdwaW5nJywge30pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgaWQ6IG51bWJlcjsgcmVzdWx0OiBudWxsIH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5pZCwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AucmVzdWx0LCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnc3Vic2NyaWJlIHJlcXVlc3QgcmV0dXJucyBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtMScpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMSk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5vayhyZXNwLCAnc2hvdWxkIGhhdmUgc2VudCByZXNwb25zZScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHVua25vd24gYXMgeyByZXN1bHQ6IHsgc25hcHNob3Q6IElTdGF0ZVNuYXBzaG90IH0gfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc25hcHNob3QucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGFjdGlvbiBpcyBkaXNwYXRjaGVkIGFuZCBlY2hvZWQnLCAoKSA9PiB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdC8vIENoYXQgYWN0aW9ucyBhcmUgZW1pdHRlZCBvbiB0aGUgZGVyaXZlZCBkZWZhdWx0LWNoYXQgY2hhbm5lbCwgc28gdGhlXG5cdFx0Ly8gY2xpZW50IG11c3Qgc3Vic2NyaWJlIHRvIGl0IChhcyB0aGUgcmVhbCBVSSBicmlkZ2UgZG9lcykgdG8gc2VlIGVjaG9lcy5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtMScsIFtzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaV0pO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbignZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBkZWZhdWx0Q2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbk1zZ3MgPSBmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnQuc2VudCwgJ2FjdGlvbicpO1xuXHRcdGNvbnN0IHR1cm5TdGFydGVkID0gYWN0aW9uTXNncy5maW5kKG0gPT4ge1xuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBtLnBhcmFtcyBhcyB1bmtub3duIGFzIHsgYWN0aW9uOiB7IHR5cGU6IHN0cmluZyB9IH07XG5cdFx0XHRyZXR1cm4gZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5vayh0dXJuU3RhcnRlZCwgJ3Nob3VsZCBoYXZlIGVjaG9lZCB0dXJuU3RhcnRlZCcpO1xuXHRcdGNvbnN0IGVudmVsb3BlID0gdHVyblN0YXJ0ZWQhLnBhcmFtcyBhcyB1bmtub3duIGFzIHsgb3JpZ2luOiB7IGNsaWVudElkOiBzdHJpbmc7IGNsaWVudFNlcTogbnVtYmVyIH0gfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGUub3JpZ2luLmNsaWVudElkLCAnY2xpZW50LTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGUub3JpZ2luLmNsaWVudFNlcSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc3VwcG9ydGVkIHdvcmtpbmctZGlyZWN0b3J5IGFjdGlvbnMgYXJlIHJlamVjdGVkLCBub3QgZGlzcGF0Y2hlZCcsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgY2FzZXM6IHJlYWRvbmx5IHsgcmVhZG9ubHkgdHlwZTogQWN0aW9uVHlwZTsgcmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nIH1bXSA9IFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgY2hhbm5lbDogc2Vzc2lvblVyaSB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgY2hhbm5lbDogc2Vzc2lvblVyaSB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5U2V0LCBjaGFubmVsOiBkZWZhdWx0Q2hhdFVyaSB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgY2hhbm5lbDogZGVmYXVsdENoYXRVcmkgfSxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBbaW5kZXgsIHsgdHlwZSwgY2hhbm5lbCB9XSBvZiBjYXNlcy5lbnRyaWVzKCkpIHtcblx0XHRcdGNvbnN0IGNsaWVudElkID0gYHdkLWNsaWVudC0ke2luZGV4fWA7XG5cdFx0XHRjb25zdCBjbGllbnRTZXEgPSAxMDAgKyBpbmRleDtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoY2xpZW50SWQsIFtzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaV0pO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGFnZW50U2VydmljZS5oYW5kbGVkQWN0aW9ucy5sZW5ndGggPSAwO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbignZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRcdGNoYW5uZWwsXG5cdFx0XHRcdGNsaWVudFNlcSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGUsIGRpcmVjdG9yeTogJ2ZpbGU6Ly8vdG1wL2V4dHJhLXJvb3QnIH0sXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIE5vIGRpc3BhdGNoOiB0aGUgZ2F0ZSBpbnRlcmNlcHRzIGJlZm9yZSByZWFjaGluZyB0aGUgYWdlbnQgc2VydmljZSxcblx0XHRcdC8vIHNvIHRoZSByZWR1Y2VyIG5ldmVyIHJ1bnMgYW5kIHN5bmNocm9uaXplZCBzdGF0ZSBpcyB1bnRvdWNoZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50U2VydmljZS5oYW5kbGVkQWN0aW9ucywgW10sIGAke3R5cGV9IG11c3Qgbm90IGJlIGRpc3BhdGNoZWRgKTtcblxuXHRcdFx0Ly8gRXhhY3RseSBvbmUgcmVqZWN0aW9uIGVudmVsb3BlLCBwcmVzZXJ2aW5nIHRoZSBvcmlnaW5hbCBvcmlnaW4gc28gdGhlXG5cdFx0XHQvLyBjbGllbnQgY2FuIHJlY29uY2lsZSBpdHMgb3B0aW1pc3RpYyBhY3Rpb24uXG5cdFx0XHRjb25zdCBhY3Rpb25Nc2dzID0gZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0LnNlbnQsICdhY3Rpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25Nc2dzLmxlbmd0aCwgMSwgYCR7dHlwZX0gc2hvdWxkIGVtaXQgZXhhY3RseSBvbmUgZW52ZWxvcGVgKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlID0gYWN0aW9uTXNnc1swXS5wYXJhbXMgYXMgdW5rbm93biBhcyB7IGFjdGlvbjogeyB0eXBlOiBzdHJpbmcgfTsgb3JpZ2luOiB7IGNsaWVudElkOiBzdHJpbmc7IGNsaWVudFNlcTogbnVtYmVyIH07IHJlamVjdGlvblJlYXNvbj86IHN0cmluZyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3BlLmFjdGlvbi50eXBlLCB0eXBlKTtcblx0XHRcdGFzc2VydC5vayhlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24sIGAke3R5cGV9IGVudmVsb3BlIHNob3VsZCBjYXJyeSBhIHJlamVjdGlvblJlYXNvbmApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3BlLm9yaWdpbi5jbGllbnRJZCwgY2xpZW50SWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3BlLm9yaWdpbi5jbGllbnRTZXEsIGNsaWVudFNlcSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdhY3Rpb25zIGFyZSBzY29wZWQgdG8gc3Vic2NyaWJlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0QSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1hJywgW3Nlc3Npb25VcmldKTtcblx0XHRjb25zdCB0cmFuc3BvcnRCID0gY29ubmVjdENsaWVudCgnY2xpZW50LWInKTtcblxuXHRcdHRyYW5zcG9ydEEuc2VudC5sZW5ndGggPSAwO1xuXHRcdHRyYW5zcG9ydEIuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnTmV3IFRpdGxlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnRBLnNlbnQsICdhY3Rpb24nKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnRCLnNlbnQsICdhY3Rpb24nKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VzZXQgYWN0aW9ucyBhcmUgc2NvcGVkIHRvIHN1YnNjcmliZWQgY2hhbmdlc2V0IFVSSXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnRBID0gY29ubmVjdENsaWVudCgnY2xpZW50LWEtY3MnLCBbY2hhbmdlc2V0VXJpXSk7XG5cdFx0Ly8gU2Vzc2lvbi1vbmx5IHN1YnNjcmliZXI6IG11c3QgTk9UIHJlY2VpdmUgY2hhbmdlc2V0IGVudmVsb3Blcy5cblx0XHRjb25zdCB0cmFuc3BvcnRCID0gY29ubmVjdENsaWVudCgnY2xpZW50LWItY3MnLCBbc2Vzc2lvblVyaV0pO1xuXG5cdFx0dHJhbnNwb3J0QS5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0dHJhbnNwb3J0Qi5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy90ZXN0L2NoYW5nZWQudHMnLFxuXHRcdFx0XHRlZGl0OiB7XG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy90ZXN0L2NoYW5nZWQudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC9jaGFuZ2VkLnRzJyB9IH0sXG5cdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhQWN0aW9ucyA9IGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydEEuc2VudCwgJ2FjdGlvbicpO1xuXHRcdGNvbnN0IGJBY3Rpb25zID0gZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0Qi5zZW50LCAnYWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFBY3Rpb25zLmxlbmd0aCwgMSwgJ2NoYW5nZXNldCBzdWJzY3JpYmVyIHNob3VsZCByZWNlaXZlIDEgZW52ZWxvcGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYkFjdGlvbnMubGVuZ3RoLCAwLCAnc2Vzc2lvbi1vbmx5IHN1YnNjcmliZXIgc2hvdWxkIHJlY2VpdmUgMCBjaGFuZ2VzZXQgZW52ZWxvcGVzJyk7XG5cblx0XHRjb25zdCBwYXJhbXMgPSBhQWN0aW9uc1swXS5wYXJhbXMgYXMgeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogeyB0eXBlOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHR5cGU6IHBhcmFtcy5hY3Rpb24udHlwZSwgY2hhbm5lbDogcGFyYW1zLmNoYW5uZWwgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlU2V0LCBjaGFubmVsOiBjaGFuZ2VzZXRVcmkgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VzZXQvY2xlYXJlZCByZWFjaGVzIGNoYW5nZXNldCBzdWJzY3JpYmVycycsICgpID0+IHtcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBgJHtzZXNzaW9uVXJpfS9jaGFuZ2VzZXQvc2Vzc2lvbmA7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jbGVhcicsIFtjaGFuZ2VzZXRVcmldKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRDbGVhcmVkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydC5zZW50LCAnYWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBwYXJhbXMgPSBhY3Rpb25zWzBdLnBhcmFtcyBhcyB7IGFjdGlvbjogeyB0eXBlOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJhbXMuYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGlmaWNhdGlvbnMgYXJlIGJyb2FkY2FzdCB0byBhbGwgY2xpZW50cycsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnRBID0gY29ubmVjdENsaWVudCgnY2xpZW50LWEnKTtcblx0XHRjb25zdCB0cmFuc3BvcnRCID0gY29ubmVjdENsaWVudCgnY2xpZW50LWInKTtcblxuXHRcdHRyYW5zcG9ydEEuc2VudC5sZW5ndGggPSAwO1xuXHRcdHRyYW5zcG9ydEIuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydEEuc2VudCwgJ3Jvb3Qvc2Vzc2lvbkFkZGVkJykubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0Qi5zZW50LCAncm9vdC9zZXNzaW9uQWRkZWQnKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgaW5jbHVkZXMgcHJvamVjdCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UubGlzdGVkU2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksXG5cdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJvamVjdCcpLCBkaXNwbGF5TmFtZTogJ1Byb2plY3QnIH0sXG5cdFx0XHRzdW1tYXJ5OiAnU2Vzc2lvbiBTdW1tYXJ5Jyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1saXN0Jyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnbGlzdFNlc3Npb25zJykpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRjb25zdCByZXN1bHQgPSAocmVzcCBhcyB1bmtub3duIGFzIHsgcmVzdWx0OiBMaXN0U2Vzc2lvbnNSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lml0ZW1zLm1hcChpdGVtID0+IGl0ZW0ucHJvamVjdCksIFt7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJvamVjdCcpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiAnUHJvamVjdCcgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgb21pdHMgcHJvamVjdCBtZXRhZGF0YSB3aGVuIGFic2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UubGlzdGVkU2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksXG5cdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRzdW1tYXJ5OiAnU2Vzc2lvbiBTdW1tYXJ5Jyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1saXN0LW5vLXByb2plY3QnKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdsaXN0U2Vzc2lvbnMnKSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHVua25vd24gYXMgeyByZXN1bHQ6IExpc3RTZXNzaW9uc1Jlc3VsdCB9KS5yZXN1bHQ7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5wcm9qZWN0KSwgW3VuZGVmaW5lZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgc3VyZmFjZXMgdGhlIGNoYW5nZXMgc3VtbWFyeSBmcm9tIHRoZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UubGlzdGVkU2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksXG5cdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRzdW1tYXJ5OiAnU2Vzc2lvbiBXaXRoIENoYW5nZXNldHMnLFxuXHRcdFx0Y2hhbmdlczoge1xuXHRcdFx0XHRhZGRpdGlvbnM6IDUsXG5cdFx0XHRcdGRlbGV0aW9uczogMixcblx0XHRcdFx0ZmlsZXM6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3QtY2hhbmdlc2V0cycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2xpc3RTZXNzaW9ucycpKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogTGlzdFNlc3Npb25zUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtc1swXS5jaGFuZ2VzLCB7XG5cdFx0XHRhZGRpdGlvbnM6IDUsXG5cdFx0XHRkZWxldGlvbnM6IDIsXG5cdFx0XHRmaWxlczogMyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdFNlc3Npb25zIGNhcnJpZXMgdGhlIHdvcmtzcGFjZS1sZXNzIG1hcmtlciBvbiBfbWV0YScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB0aGUgY2xpZW50IHJlc29sdmVzIGEgc2Vzc2lvbidzIGtpbmQgKHF1aWNrIGNoYXQgdnMuXG5cdFx0Ly8gd29ya3NwYWNlKSBmcm9tIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCwgYW5kIGEgbGlzdGluZyBpcyB0aGUgZmlyc3Rcblx0XHQvLyB0aGluZyBpdCBzZWVzIGFmdGVyIGEgd2luZG93IHJlbG9hZC5cblx0XHQvLyBEcm9wcGluZyBgX21ldGFgIGhlcmUgbWFkZSBldmVyeSByZXN0b3JlZCBxdWljayBjaGF0IGxvb2tcblx0XHQvLyB3b3Jrc3BhY2UtYm91bmQgYW5kIGxlYWsgdGhlIGhvc3QncyBzY3JhdGNoIGN3ZCBhcyBhIHdvcmtzcGFjZSBmb2xkZXIuXG5cdFx0YWdlbnRTZXJ2aWNlLmxpc3RlZFNlc3Npb25zLnB1c2goe1xuXHRcdFx0c2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkpLFxuXHRcdFx0c3RhcnRUaW1lOiAxMDAwLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiAyMDAwLFxuXHRcdFx0c3VtbWFyeTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvY2hhdHMvc2Vzc2lvbi0xJyldLFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3Qtd29ya3NwYWNlbGVzcycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2xpc3RTZXNzaW9ucycpKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogTGlzdFNlc3Npb25zUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtcy5tYXAoaXRlbSA9PiByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MoaXRlbS5fbWV0YSkpLCBbdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgb21pdHMgX21ldGEgd2hlbiB0aGUgYWdlbnQgcHJvdmlkZXMgbm9uZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgd2lyZSBpdGVtIGlzIGJ1aWx0IGZpZWxkIGJ5IGZpZWxkIGFuZCBgc2F0aXNmaWVzIFNlc3Npb25TdW1tYXJ5YFxuXHRcdC8vIGNhbm5vdCBjYXRjaCBhIGRyb3BwZWQgb3B0aW9uYWwsIHNvIHBpbiB0aGUgYWJzZW50IGNhc2UgdG9vOiBhXG5cdFx0Ly8gbGlzdGluZyBtdXN0IG5vdCBzdGFydCBtYW51ZmFjdHVyaW5nIGFuIGVtcHR5IGBfbWV0YWAgYmFnIHRoYXQgbGF0ZXJcblx0XHQvLyBvdmVyd3JpdGVzIGEgcmljaGVyIG9uZSBvbiB0aGUgY2xpZW50LlxuXHRcdGFnZW50U2VydmljZS5saXN0ZWRTZXNzaW9ucy5wdXNoKHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpKSxcblx0XHRcdHN0YXJ0VGltZTogMTAwMCxcblx0XHRcdG1vZGlmaWVkVGltZTogMjAwMCxcblx0XHRcdHN1bW1hcnk6ICdTZXNzaW9uIFN1bW1hcnknLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3Qtbm8tbWV0YScpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2xpc3RTZXNzaW9ucycpKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogTGlzdFNlc3Npb25zUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtcy5tYXAoaXRlbSA9PiBpdGVtLl9tZXRhKSwgW3VuZGVmaW5lZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVTZXNzaW9uIHJldHVybnMgbnVsbCBhbmQgYnJvYWRjYXN0cyBwcm9qZWN0IGluIHNlc3Npb25BZGRlZCBzdW1tYXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jcmVhdGUnKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdDovLy9jcmVhdGVkLXNlc3Npb24nKS50b1N0cmluZygpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlU2Vzc2lvbicsIHsgY2hhbm5lbDogbmV3U2Vzc2lvbiB9KSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZTtcblxuXHRcdGNvbnN0IGFkZGVkID0gZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0LnNlbnQsICdyb290L3Nlc3Npb25BZGRlZCcpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiAocmVzcCBhcyB7IHJlc3VsdDogbnVsbCB9KS5yZXN1bHQsXG5cdFx0XHRwcm9qZWN0OiAoYWRkZWQhLnBhcmFtcyBhcyBTZXNzaW9uQWRkZWRQYXJhbXMpLnN1bW1hcnkucHJvamVjdCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IG51bGwsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vY3JlYXRlZC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdDcmVhdGVkIFByb2plY3QnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjcmVhdGVDaGF0IC8gZGlzcG9zZUNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0dGVzdCgnY3JlYXRlQ2hhdCBvbiB0aGUgZGVmYXVsdCBjaGF0IFVSSSBpcyBhIG5vLW9wJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNjJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlQ2hhdCcsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSwgY2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiAocmVzcCBhcyB7IHJlc3VsdDogbnVsbCB9KS5yZXN1bHQsXG5cdFx0XHRcdGNyZWF0ZWQ6IGFnZW50U2VydmljZS5jcmVhdGVkQ2hhdHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogbnVsbCxcblx0XHRcdFx0Y3JlYXRlZDogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgZm9yIGFuIGFkZGl0aW9uYWwgY2hhdCBmb3J3YXJkcyB0byB0aGUgYWdlbnQgc2VydmljZSBhbmQgZ3Jvd3MgdGhlIGNhdGFsb2cnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtY2MnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVDaGF0JywgeyBjaGFubmVsOiBzZXNzaW9uVXJpLCBjaGF0OiBwZWVyQ2hhdCB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiAocmVzcCBhcyB7IHJlc3VsdDogbnVsbCB9KS5yZXN1bHQsXG5cdFx0XHRcdGNyZWF0ZWQ6IGFnZW50U2VydmljZS5jcmVhdGVkQ2hhdHMsXG5cdFx0XHRcdGluQ2F0YWxvZzogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UgPT09IHBlZXJDaGF0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiBudWxsLFxuXHRcdFx0XHRjcmVhdGVkOiBbeyBzZXNzaW9uOiBzZXNzaW9uVXJpLCBjaGF0OiBwZWVyQ2hhdCB9XSxcblx0XHRcdFx0aW5DYXRhbG9nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IGZvcndhcmRzIGEgZm9yayBzb3VyY2UgdG8gdGhlIGFnZW50IHNlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtY2MnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVDaGF0Jywge1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjaGF0OiBwZWVyQ2hhdCxcblx0XHRcdFx0c291cmNlOiB7IGtpbmQ6IENoYXRTb3VyY2VLaW5kLkZvcmssIGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IChyZXNwIGFzIHsgcmVzdWx0OiBudWxsIH0pLnJlc3VsdCxcblx0XHRcdFx0Y3JlYXRlZDogYWdlbnRTZXJ2aWNlLmNyZWF0ZWRDaGF0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiBudWxsLFxuXHRcdFx0XHRjcmVhdGVkOiBbe1xuXHRcdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmksXG5cdFx0XHRcdFx0Y2hhdDogcGVlckNoYXQsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0Zm9yazogeyBzb3VyY2U6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKSwgdHVybklkOiAndHVybi0xJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IHJlamVjdHMgYSBzb3VyY2Ugd2l0aG91dCBraW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNjJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlQ2hhdCcsIHtcblx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdFx0Y2hhdDogcGVlckNoYXQsXG5cdFx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHRcdGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSB9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29kZTogcmVzcC5lcnJvcj8uY29kZSxcblx0XHRcdFx0bWVzc2FnZTogcmVzcC5lcnJvcj8ubWVzc2FnZSxcblx0XHRcdFx0Y3JlYXRlZDogYWdlbnRTZXJ2aWNlLmNyZWF0ZWRDaGF0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29kZTogSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcyxcblx0XHRcdFx0bWVzc2FnZTogJ1Vuc3VwcG9ydGVkIGNyZWF0ZUNoYXQgc291cmNlIGtpbmQ6IHVuZGVmaW5lZCcsXG5cdFx0XHRcdGNyZWF0ZWQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IGZvcndhcmRzIGEgc2lkZSBjaGF0IHNvdXJjZSB0byB0aGUgYWdlbnQgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jYycpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZUNoYXQnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdGNoYXQ6IHBlZXJDaGF0LFxuXHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRraW5kOiBDaGF0U291cmNlS2luZC5TaWRlQ2hhdCxcblx0XHRcdFx0XHRjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tYWN0aXZlJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHsgdGV4dDogJyAgc2VsZWN0ZWQgdGV4dCAgJywgcmVzcG9uc2VQYXJ0SWQ6ICdyZXNwb25zZS1wYXJ0LTEnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiAocmVzcCBhcyB7IHJlc3VsdDogbnVsbCB9KS5yZXN1bHQsXG5cdFx0XHRcdGNyZWF0ZWQ6IGFnZW50U2VydmljZS5jcmVhdGVkQ2hhdHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogbnVsbCxcblx0XHRcdFx0Y3JlYXRlZDogW3tcblx0XHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRcdGNoYXQ6IHBlZXJDaGF0LFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHNpZGVDaGF0OiB7IHNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpLCB0dXJuSWQ6ICd0dXJuLWFjdGl2ZScsIHNlbGVjdGlvbjogeyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnLCByZXNwb25zZVBhcnRJZDogJ3Jlc3BvbnNlLXBhcnQtMScgfSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IHJlamVjdHMgYW4gdW5rbm93biBzb3VyY2Uga2luZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jYycpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZUNoYXQnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdGNoYXQ6IHBlZXJDaGF0LFxuXHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRraW5kOiAndW5rbm93bicsXG5cdFx0XHRcdFx0Y2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb2RlOiByZXNwLmVycm9yPy5jb2RlLFxuXHRcdFx0XHRtZXNzYWdlOiByZXNwLmVycm9yPy5tZXNzYWdlLFxuXHRcdFx0XHRjcmVhdGVkOiBhZ2VudFNlcnZpY2UuY3JlYXRlZENoYXRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zLFxuXHRcdFx0XHRtZXNzYWdlOiAnVW5zdXBwb3J0ZWQgY3JlYXRlQ2hhdCBzb3VyY2Uga2luZDogdW5rbm93bicsXG5cdFx0XHRcdGNyZWF0ZWQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IGZvciBhbiB1bmtub3duIHNlc3Npb24gZmFpbHMgd2l0aCBTRVNTSU9OX05PVF9GT1VORCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jYycpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZUNoYXQnLCB7IGNoYW5uZWw6ICdjb3BpbG90Oi9taXNzaW5nJywgY2hhdDogYnVpbGRDaGF0VXJpKCdjb3BpbG90Oi9taXNzaW5nJywgJ3BlZXItMScpIH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyIH0gfTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3I/LmNvZGUsIEFIUF9TRVNTSU9OX05PVF9GT1VORCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlQ2hhdCBmb3J3YXJkcyB0byB0aGUgYWdlbnQgc2VydmljZSBhbmQgc2hyaW5rcyB0aGUgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jYycpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2Rpc3Bvc2VDaGF0JywgeyBjaGFubmVsOiBwZWVyQ2hhdCB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiAocmVzcCBhcyB7IHJlc3VsdDogbnVsbCB9KS5yZXN1bHQsXG5cdFx0XHRcdGRpc3Bvc2VkOiBhZ2VudFNlcnZpY2UuZGlzcG9zZWRDaGF0cyxcblx0XHRcdFx0aW5DYXRhbG9nOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5jaGF0cy5zb21lKGMgPT4gYy5yZXNvdXJjZSA9PT0gcGVlckNoYXQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IG51bGwsXG5cdFx0XHRcdGRpc3Bvc2VkOiBbeyBzZXNzaW9uOiBzZXNzaW9uVXJpLCBjaGF0OiBwZWVyQ2hhdCB9XSxcblx0XHRcdFx0aW5DYXRhbG9nOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmVwbGF5cyBtaXNzZWQgYWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1yJywgW3Nlc3Npb25VcmldKTtcblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydDEuc2VudCwgMSk7XG5cdFx0Y29uc3QgaW5pdFNlcSA9IChyZXNwIGFzIHsgcmVzdWx0OiBJbml0aWFsaXplUmVzdWx0IH0pLnJlc3VsdC5zZXJ2ZXJTZXE7XG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVGl0bGUgQScgfSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1RpdGxlIEInIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LXInLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IGluaXRTZXEsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbc2Vzc2lvblVyaV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcCA9IGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZWNvbm5lY3RSZXNwIGFzIHsgcmVzdWx0OiBSZWNvbm5lY3RSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgJ3JlcGxheScpO1xuXHRcdGlmIChyZXN1bHQudHlwZSA9PT0gJ3JlcGxheScpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWN0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IHJlamVjdHMgYSBjbGllbnQgdGhlIHNlcnZlciBubyBsb25nZXIgcmVtZW1iZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydCk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMSk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRjbGllbnRJZDogJ2ZvcmdvdHRlbi1jbGllbnQnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IDAsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbXSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZXNwb25zZSBhcyB7IGVycm9yOiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfSkuZXJyb3IsIHtcblx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsXG5cdFx0XHRtZXNzYWdlOiAnUmVjb25uZWN0IGNsaWVudCBub3QgZm91bmQ6IGZvcmdvdHRlbi1jbGllbnQnLFxuXHRcdH0pO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldGFpbnMgY2xpZW50IGluZm8gZm9yIGFjdGlvbiBhdHRyaWJ1dGlvbiBhY3Jvc3MgcmVjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydDEgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtYXR0cmlidXRpb24nLCB1bmRlZmluZWQsIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8pO1xuXHRcdHRyYW5zcG9ydDEuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbignZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzoge30gfSxcblx0XHR9KSk7XG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMik7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtYXR0cmlidXRpb24nLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IHN0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbXSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgcmVjb25uZWN0UmVzcFByb21pc2U7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6ICdhaHAtcm9vdDovLycsXG5cdFx0XHRjbGllbnRTZXE6IDIsXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7fSB9LFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRTZXJ2aWNlLmhhbmRsZWRDbGllbnRUeXBlcywgWydhZ2VudHNfd2luZG93JywgJ2FnZW50c193aW5kb3cnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCByZXBsYXlzIG1pc3NlZCBjaGFuZ2VzZXQgYWN0aW9ucyB0byBjaGFuZ2VzZXQgc3Vic2NyaWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNoYW5nZXNldCBiZWZvcmUgdGhlIGZpcnN0IGNvbm5lY3Rpb24gc28gdGhlIGluaXRpYWxcblx0XHQvLyBzdWJzY3JpcHRpb24gc3VjY2VlZHMuXG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LXJjJywgW2NoYW5nZXNldFVyaV0pO1xuXHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0MS5zZW50LCAxKTtcblx0XHRjb25zdCBpbml0U2VxID0gKHJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdC8vIERpc3BhdGNoIHR3byBjaGFuZ2VzZXQgYWN0aW9ucyB3aGlsZSBjbGllbnQgaXMgZGlzY29ubmVjdGVkLlxuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL2EudHMnLFxuXHRcdFx0XHRlZGl0OiB7XG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL2EudHMnIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAyLCByZW1vdmVkOiAwIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHR9KTtcblxuXHRcdC8vIFJlY29ubmVjdCB3aXRoIHNhbWUgY2xpZW50SWQgYW5kIHRoZSBjaGFuZ2VzZXQgVVJJIGluIHN1YnNjcmlwdGlvbnMuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LXJjJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiBpbml0U2VxLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW2NoYW5nZXNldFVyaV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcCA9IGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZWNvbm5lY3RSZXNwIGFzIHsgcmVzdWx0OiBSZWNvbm5lY3RSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgJ3JlcGxheScpO1xuXHRcdGlmIChyZXN1bHQudHlwZSA9PT0gJ3JlcGxheScpIHtcblx0XHRcdGNvbnN0IHJlcGxheWVkVHlwZXMgPSByZXN1bHQuYWN0aW9ucy5tYXAoZSA9PiBlLmFjdGlvbi50eXBlKTtcblx0XHRcdGFzc2VydC5vayhyZXBsYXllZFR5cGVzLmluY2x1ZGVzKEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCksICdyZXBsYXkgc2hvdWxkIGluY2x1ZGUgQ2hhbmdlc2V0RmlsZVNldCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcGxheWVkVHlwZXMuaW5jbHVkZXMoQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkKSwgJ3JlcGxheSBzaG91bGQgaW5jbHVkZSBDaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3Qgc2VuZHMgZnJlc2ggc25hcHNob3RzIHdoZW4gZ2FwIHRvbyBsYXJnZScsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1nJywgW3Nlc3Npb25VcmldKTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTEwMDsgaSsrKSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiBgVGl0bGUgJHtpfWAgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LWcnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IDAsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbc2Vzc2lvblVyaV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcCA9IGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZWNvbm5lY3RSZXNwIGFzIHsgcmVzdWx0OiBSZWNvbm5lY3RSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgJ3NuYXBzaG90Jyk7XG5cdFx0aWYgKHJlc3VsdC50eXBlID09PSAnc25hcHNob3QnKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnNuYXBzaG90cy5sZW5ndGggPiAwLCAnc2hvdWxkIGNvbnRhaW4gc25hcHNob3RzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmVoeWRyYXRlcyBzZXJ2ZXItc2lkZSBzdGF0ZSB0aGF0IHdhcyBldmljdGVkIHdoaWxlIGRpc2Nvbm5lY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Ly8gTW9ja0FnZW50U2VydmljZS5zdWJzY3JpYmUgbm9ybWFsbHkganVzdCByZXR1cm5zIHRoZSBleGlzdGluZyBzbmFwc2hvdC5cblx0XHQvLyBPdmVycmlkZSBpdCBzbyBhIG1pc3Npbmcgc2Vzc2lvbiBpcyByZXN0b3JlZCBvbiBzdWJzY3JpYmUgXHUyMDE0IHRoaXMgaXMgdGhlXG5cdFx0Ly8gYmVoYXZpb3IgdGhlIHJlYWwgQWdlbnRTZXJ2aWNlIHByb3ZpZGVzIGFuZCB0aGF0IHJlY29ubmVjdCBub3cgcmVsaWVzIG9uLlxuXHRcdGNvbnN0IHN1YnNjcmliZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGFnZW50U2VydmljZS5zdWJzY3JpYmUgPSBhc3luYyAocmVzb3VyY2UsIF9jbGllbnRJZCkgPT4ge1xuXHRcdFx0c3Vic2NyaWJlQ2FsbHMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGxldCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmICghc25hcHNob3QpIHtcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cdFx0XHRcdHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlLnRvU3RyaW5nKCkpITtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzbmFwc2hvdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1lJywgW3Nlc3Npb25VcmldKTtcblx0XHRjb25zdCBpbml0UmVzcCA9IGZpbmRSZXNwb25zZSh0cmFuc3BvcnQxLnNlbnQsIDEpO1xuXHRcdGNvbnN0IGluaXRTZXEgPSAoaW5pdFJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBBZ2VudFNlcnZpY2UgZXZpY3RpbmcgdGhlIGlkbGUgc2Vzc2lvbiB3aGlsZSB0aGUgY2xpZW50XG5cdFx0Ly8gd2FzIGRpc2Nvbm5lY3RlZCAodGhpcyBpcyB3aGF0IGBfbWF5YmVFdmljdElkbGVTZXNzaW9uYCBkb2VzIGluIHRoZVxuXHRcdC8vIHJlYWwgc2VydmljZSkuXG5cdFx0c3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChzZXNzaW9uVXJpKSwgdW5kZWZpbmVkLCAncHJlY29uZGl0aW9uOiBzdGF0ZSBldmljdGVkJyk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtZScsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogaW5pdFNlcSxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpXSxcblx0XHR9KSk7XG5cblx0XHRhd2FpdCByZWNvbm5lY3RSZXNwUHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1YnNjcmliZUNhbGxzLCBbc2Vzc2lvblVyaV0sICdyZWNvbm5lY3Qgc2hvdWxkIGNhbGwgc3Vic2NyaWJlIHRvIHJlc3RvcmUgZXZpY3RlZCBzdGF0ZScpO1xuXHRcdGFzc2VydC5vayhzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3Qoc2Vzc2lvblVyaSksICdzdGF0ZSBzaG91bGQgaGF2ZSBiZWVuIHJlLWh5ZHJhdGVkIGJ5IHJlY29ubmVjdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmUtcmVnaXN0ZXJzIHRoZSByZXZlcnNlLVJQQyBmaWxlc3lzdGVtIGF1dGhvcml0eScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgc2VydmVyLXNpZGUgZmlsZXN5c3RlbSBwcm92aWRlciB0YWxrcyBiYWNrIHRvIHRoZSBjbGllbnQgdmlhXG5cdFx0Ly8gcmV2ZXJzZS1SUEMgKGUuZy4gYHJlc291cmNlTGlzdGApLiBJZiB0aGUgYXV0aG9yaXR5IGlzIG5vdFxuXHRcdC8vIHJlLXJlZ2lzdGVyZWQgb24gcmVjb25uZWN0LCB0aGUgYWdlbnQgaG9zdCB3b3VsZCBmYWlsIHdpdGhcblx0XHQvLyBcIk5vIGNvbm5lY3Rpb24gZm9yIGF1dGhvcml0eTogPGNsaWVudElkPlwiIHVudGlsIHRoZSBjbGllbnRcblx0XHQvLyByZWluaXRpYWxpemVkLiBWZXJpZnkgYSByZXZlcnNlLVJQQyByb3V0ZXMgdGhyb3VnaCB0aGUgbmV3XG5cdFx0Ly8gdHJhbnNwb3J0IGFmdGVyIHJlY29ubmVjdC5cblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LWZzJyk7XG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtZnMnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IDAsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbXSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgcmVjb25uZWN0UmVzcFByb21pc2U7XG5cdFx0dHJhbnNwb3J0Mi5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHQvLyBXaXJlIHRoZSB0ZXN0J3MgcmVzcG9uc2UgKmJlZm9yZSogd2UgdHJpZ2dlciB0aGUgcmV2ZXJzZS1SUEMgc29cblx0XHQvLyB0aGUgcmVzcG9uc2UgaXMgb2JzZXJ2ZWQgb24gdGhlIG5leHQgbWljcm90YXNrLlxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFuc3BvcnQyLm9uRGlkU2VuZChtc2cgPT4ge1xuXHRcdFx0aWYgKGlzSnNvblJwY1JlcXVlc3QobXNnKSAmJiBtc2cubWV0aG9kID09PSAncmVzb3VyY2VMaXN0Jykge1xuXHRcdFx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IG1zZy5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgZW50cmllczogW3sgbmFtZTogJ2FmdGVyLXJlY29ubmVjdC50eHQnLCB0eXBlOiAnZmlsZScgYXMgY29uc3QgfV0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVN5c3RlbVByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQtZnMnLCAnL3dvcmtzcGFjZScpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1snYWZ0ZXItcmVjb25uZWN0LnR4dCcsIEZpbGVUeXBlLkZpbGVdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJsYXBwaW5nIHJlY29ubmVjdCBrZWVwcyBlYXJsaWVyIHJldmVyc2UtUlBDIHJlcXVlc3RzIGFsaXZlIHVudGlsIHRoYXQgdHJhbnNwb3J0IGNsb3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LWZzLW92ZXJsYXAnKTtcblx0XHRjb25zdCByZXZlcnNlUmVxdWVzdFByb21pc2UgPSBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRyYW5zcG9ydDEub25EaWRTZW5kLCBtc2cgPT4gaXNKc29uUnBjUmVxdWVzdChtc2cpICYmIG1zZy5tZXRob2QgPT09ICdyZXNvdXJjZUxpc3QnKSk7XG5cdFx0Y29uc3QgcmVhZFByb21pc2UgPSBmaWxlU3lzdGVtUHJvdmlkZXIucmVhZGRpcihhZ2VudEhvc3RVcmkoJ2NsaWVudC1mcy1vdmVybGFwJywgJy93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmV2ZXJzZVJlcXVlc3QgPSBhd2FpdCByZXZlcnNlUmVxdWVzdFByb21pc2U7XG5cdFx0YXNzZXJ0Lm9rKGlzSnNvblJwY1JlcXVlc3QocmV2ZXJzZVJlcXVlc3QpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydDIgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQyKTtcblx0XHRjb25zdCByZWNvbm5lY3RSZXNwUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQyLCAxKTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1mcy1vdmVybGFwJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogcmV2ZXJzZVJlcXVlc3QuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgZW50cmllczogW3sgbmFtZTogJ2Zyb20tb3JpZ2luYWwtdHJhbnNwb3J0LnR4dCcsIHR5cGU6ICdmaWxlJyBhcyBjb25zdCB9XSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZFByb21pc2U7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtbJ2Zyb20tb3JpZ2luYWwtdHJhbnNwb3J0LnR4dCcsIEZpbGVUeXBlLkZpbGVdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NpbmcgYW4gb2xkZXIgb3ZlcmxhcHBpbmcgdHJhbnNwb3J0IHJlamVjdHMgaXRzIHBlbmRpbmcgcmV2ZXJzZS1SUEMgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1mcy1vdmVybGFwLWNsb3NlJyk7XG5cdFx0Y29uc3QgcmV2ZXJzZVJlcXVlc3RQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcih0cmFuc3BvcnQxLm9uRGlkU2VuZCwgbXNnID0+IGlzSnNvblJwY1JlcXVlc3QobXNnKSAmJiBtc2cubWV0aG9kID09PSAncmVzb3VyY2VMaXN0JykpO1xuXHRcdGNvbnN0IHJlYWRQcm9taXNlID0gZmlsZVN5c3RlbVByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQtZnMtb3ZlcmxhcC1jbG9zZScsICcvd29ya3NwYWNlJykpO1xuXHRcdGF3YWl0IHJldmVyc2VSZXF1ZXN0UHJvbWlzZTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydDIgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQyKTtcblx0XHRjb25zdCByZWNvbm5lY3RSZXNwUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQyLCAxKTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1mcy1vdmVybGFwLWNsb3NlJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZWFkUHJvbWlzZSwgL0NsaWVudCBjbGllbnQtZnMtb3ZlcmxhcC1jbG9zZSBkaXNjb25uZWN0ZWQvKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgY2xlYW5zIHVwJywgKCkgPT4ge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtZCcsIFtzZXNzaW9uVXJpXSk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnQWZ0ZXIgRGlzY29ubmVjdCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnQubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgcmV0YWlucyBhY3RpdmUgY2xpZW50IGR1cmluZyBncmFjZSwgdGhlbiByZW1vdmVzIGl0IGFuZCBmYWlscyBvd25lZCB0b29sIGNhbGxzIGFmdGVyIGdyYWNlIHBlcmlvZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0Ly8gVGhlIGFjdGl2ZSBjbGllbnQgaXMgcmV0YWluZWQgZHVyaW5nIHRoZSBncmFjZSB3aW5kb3cgc28gYSBxdWlja1xuXHRcdFx0Ly8gcmVjb25uZWN0IGNhbiBrZWVwIGl0cyBzbG90LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLm1hcChjID0+IGMuY2xpZW50SWQpLCBbJ2NsaWVudC10b29scyddKTtcblx0XHRcdGxldCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdC8vIEFmdGVyIHRoZSBncmFjZSB3aW5kb3cgdGhlIGFjdGl2ZSBjbGllbnQgaXMgcmVtb3ZlZCBhbmQgaXRzXG5cdFx0XHQvLyBwZW5kaW5nIHRvb2wgY2FsbCBpcyBmYWlsZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZUNsaWVudHMsIFtdKTtcblx0XHRcdHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0XHRzdWNjZXNzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5zdWNjZXNzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdDbGllbnQgY2xpZW50LXRvb2xzIGRpc2Nvbm5lY3RlZCBiZWZvcmUgY29tcGxldGluZyBSdW4gVGFzaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgZmFpbHMgb3duZWQgc3RyZWFtaW5nIHRvb2wgY2FsbHMgYWZ0ZXIgZ3JhY2UgcGVyaW9kJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0XHRsZXQgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0XHRzdWNjZXNzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5zdWNjZXNzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdDbGllbnQgY2xpZW50LXRvb2xzIGRpc2Nvbm5lY3RlZCBiZWZvcmUgY29tcGxldGluZyBSdW4gVGFzaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3duZWQgdG9vbCBjYWxsIGlzIG5vdCBmYWlsZWQgd2hlbiBjbG9zaW5nIHRoZSBsYXRlc3Qgb3ZlcmxhcHBpbmcgdHJhbnNwb3J0IGZhbGxzIGJhY2sgdG8gYW4gb2xkZXIgb25lJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGZhbGxiYWNrVHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXRvb2xzJywgW3Nlc3Npb25VcmldKTtcblx0XHRcdGNvbnN0IGxhdGVzdFRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cblx0XHRcdGxhdGVzdFRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRcdGxldCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0cGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpO1xuXG5cdFx0XHRmYWxsYmFja1RyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ293bmVkIHRvb2wgY2FsbCBpcyBmYWlsZWQgYWZ0ZXIgdGhlIGxhc3Qgb3ZlcmxhcHBpbmcgdHJhbnNwb3J0IGNsb3NlcycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBmYWxsYmFja1RyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHRjb25zdCBsYXRlc3RUcmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdFx0bGF0ZXN0VHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwXzAwMSkpO1xuXHRcdFx0bGV0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblxuXHRcdFx0ZmFsbGJhY2tUcmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwXzAwMSkpO1xuXG5cdFx0XHRwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHtcblx0XHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0c3VjY2VzczogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuc3VjY2VzcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXJyb3I6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLmVycm9yPy5tZXNzYWdlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdGVycm9yOiAnQ2xpZW50IGNsaWVudC10b29scyBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgUnVuIFRhc2snLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCByZWNvbm5lY3Qgd2l0aG91dCBzZXNzaW9uIHN1YnNjcmlwdGlvbiBkb2VzIG5vdCBjbGVhciB0b29sIGNhbGwgZGlzY29ubmVjdCB0aW1lb3V0JywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCk7XG5cdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRsYXN0U2VlblNlcnZlclNlcTogc3RhdGVNYW5hZ2VyLnNlcnZlclNlcSxcblx0XHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyB7XG5cdFx0XHRcdHN0YXR1czogcGFydC50b29sQ2FsbC5zdGF0dXMsXG5cdFx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgcmVjb25uZWN0IHdpdGggc2Vzc2lvbiBzdWJzY3JpcHRpb24gY2xlYXJzIHRvb2wgY2FsbCBkaXNjb25uZWN0IHRpbWVvdXQgZm9yIHRoYXQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbihyZWNvbm5lY3RUcmFuc3BvcnQpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IHN0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpXSxcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwXzAwMSkpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgdG9vbCB0aW1lb3V0IHRlbGxzIG1vZGVsIGl0IG1heSByZXRyeSB3aGVuIHJlcGxhY2VtZW50IGFjdGl2ZSBjbGllbnQgcHJvdmlkZXMgdGhlIHRvb2wnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC10b29scycsXG5cdFx0XHRcdFx0dG9vbHM6IFt7IG5hbWU6ICdydW5UYXNrJywgZGVzY3JpcHRpb246ICdSdW5zIGEgdGFzaycgfV1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXRvb2xzJywgW3Nlc3Npb25VcmldKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXJlcGxhY2VtZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHtcblx0XHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0c3VjY2VzczogcGFydC50b29sQ2FsbC5zdWNjZXNzLFxuXHRcdFx0XHRjb250ZW50OiBwYXJ0LnRvb2xDYWxsLmNvbnRlbnQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdUaGUgY2xpZW50IHRoYXQgd2FzIHJ1bm5pbmcgUnVuIFRhc2sgZGlzY29ubmVjdGVkLCBidXQgYW5vdGhlciBhY3RpdmUgY2xpZW50IG5vdyBwcm92aWRlcyBSdW4gVGFzay4gWW91IG1heSB0cnkgY2FsbGluZyB0aGUgdG9vbCBhZ2Fpbi4nIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCB0b29sIGNhbGwgc3RhbXBlZCBmb3IgYSBkaXNjb25uZWN0ZWQgcHJvdG9jb2wgY2xpZW50IGZhaWxzIGFmdGVyIHRoZSBncmFjZSBwZXJpb2QnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdkaXNjb25uZWN0ZWQtY2xpZW50JywgW3Nlc3Npb25VcmldKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdkaXNjb25uZWN0ZWQtY2xpZW50JyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0cGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyB7XG5cdFx0XHRcdHN0YXR1czogcGFydC50b29sQ2FsbC5zdGF0dXMsXG5cdFx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVycm9yOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5lcnJvcj8ubWVzc2FnZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0gOiB1bmRlZmluZWQsIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRlcnJvcjogJ0NsaWVudCBkaXNjb25uZWN0ZWQtY2xpZW50IGRpc2Nvbm5lY3RlZCBiZWZvcmUgY29tcGxldGluZyBSdW4gVGFzaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgY2FsbCBvd25lZCBieSBhbiBhY3RpdmUgbG9jYWwgSVBDIGNsaWVudCBpcyBub3QgdHJlYXRlZCBhcyBvcnBoYW5lZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnbG9jYWwtY2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2xvY2FsLWNsaWVudCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3JwaGFuZWQgY2xpZW50IHRvb2wgY2FsbCB0aW1lb3V0IGlzIGNsZWFyZWQgd2hlbiB0aGUgb3duaW5nIGNsaWVudCBjb25uZWN0cyB3aXRoaW4gdGhlIHdpbmRvdycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdsYXRlLWNsaWVudCcsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdsYXRlLWNsaWVudCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgb3duaW5nIGNsaWVudCByZWNvbm5lY3RzIHdpdGhpbiB0aGUgZ3JhY2Ugd2luZG93LlxuXHRcdFx0Y29ubmVjdENsaWVudCgnbGF0ZS1jbGllbnQnLCBbc2Vzc2lvblVyaV0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBsYXRlciBvcnBoYW5lZCB0b29sIGNhbGwgZG9lcyBub3QgZXh0ZW5kIGFuIGVhcmxpZXIgb25lIHBhc3QgdGhlIGdyYWNlIHdpbmRvdycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdkaXNjb25uZWN0ZWQtY2xpZW50JywgW3Nlc3Npb25VcmldKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gRmlyc3Qgb3JwaGFuZWQgdG9vbCBjYWxsIGFybXMgdGhlIGdyYWNlIHRpbWVyLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2Rpc2Nvbm5lY3RlZC1jbGllbnQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmUtYXJtaW5nIGZvciBhIGxhdGVyIGNhbGwgbXVzdCByZXRhaW4gdGhlIG9yaWdpbmFsIGRlYWRsaW5lLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDIwXzAwMCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTInLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2Rpc2Nvbm5lY3RlZC1jbGllbnQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gMzFzIGFmdGVyIHRoZSBGSVJTVCBjYWxsOiBib3RoIG11c3QgaGF2ZSBmYWlsZWQuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTFfMDAwKSk7XG5cblx0XHRcdGNvbnN0IHBhcnRzID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cyA/PyBbXTtcblx0XHRcdGNvbnN0IHN0YXR1c2VzID0gcGFydHNcblx0XHRcdFx0LmZpbHRlcihwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbClcblx0XHRcdFx0Lm1hcChwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHAudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzZXMsIFtUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsIFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnN1YnNjcmliZSByZW1vdmVzIHRoZSBhY3RpdmUgY2xpZW50IGFuZCBmYWlscyBpdHMgb3duZWQgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXRvb2xzJywgW3Nlc3Npb25VcmldKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbigndW5zdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLCBbXSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0fSA6IHVuZGVmaW5lZCwge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdGVycm9yOiAnQ2xpZW50IGNsaWVudC10b29scyBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgUnVuIFRhc2snLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IHdpdGhvdXQgcmVzdWJzY3JpcHRpb24gcmVtb3ZlcyB0aGUgYWN0aXZlIGNsaWVudCBhbmQgZmFpbHMgaXRzIG93bmVkIHRvb2wgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydDEgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdGNvbnN0IGluaXRTZXEgPSAoZmluZFJlc3BvbnNlKHRyYW5zcG9ydDEuc2VudCwgMSkgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblxuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHQvLyBSZWNvbm5lY3QsIGJ1dCBkbyBOT1QgcmVzdWJzY3JpYmUgdG8gdGhlIHNlc3Npb24uXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiBpbml0U2VxLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLCBbXSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0fSA6IHVuZGVmaW5lZCwge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdGVycm9yOiAnQ2xpZW50IGNsaWVudC10b29scyBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgUnVuIFRhc2snLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZUNsb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCB3aXRoIHJlc3Vic2NyaXB0aW9uIGtlZXBzIHRoZSBhY3RpdmUgY2xpZW50IGFuZCBpdHMgb3duZWQgdG9vbCBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0Y29uc3QgaW5pdFNlcSA9IChmaW5kUmVzcG9uc2UodHJhbnNwb3J0MS5zZW50LCAxKSBhcyB7IHJlc3VsdDogSW5pdGlhbGl6ZVJlc3VsdCB9KS5yZXN1bHQuc2VydmVyU2VxO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC10b29scycsXG5cdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IGluaXRTZXEsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbc2Vzc2lvblVyaV0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLm1hcChjID0+IGMuY2xpZW50SWQpLCBbJ2NsaWVudC10b29scyddKTtcblx0XHRjb25zdCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpO1xuXG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZUNsb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzaGFrZSBpbmNsdWRlcyBkZWZhdWx0RGlyZWN0b3J5IGZyb20gc2lkZSBlZmZlY3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1ob21lJyk7XG5cblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKTtcblx0XHRhc3NlcnQub2socmVzcCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UocmVzdWx0LmRlZmF1bHREaXJlY3RvcnkhKS5wYXRoLCAnL2hvbWUvdGVzdHVzZXInKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VMaXN0IHJvdXRlcyB0byBzaWRlIGVmZmVjdCBoYW5kbGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1icm93c2UnKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3QgZGlyVXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZUxpc3QnLCB7IHVyaTogZGlyVXJpIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50U2VydmljZS5icm93c2VkVXJpcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudFNlcnZpY2UuYnJvd3NlZFVyaXNbMF0ucGF0aCwgJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3ApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHVua25vd24gYXMgeyByZXN1bHQ6IHsgZW50cmllczogeyBuYW1lOiBzdHJpbmc7IHVyaTogdW5rbm93bjsgdHlwZTogc3RyaW5nIH1bXSB9IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXNbMF0ubmFtZSwgJ3NyYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW50cmllc1swXS50eXBlLCAnZGlyZWN0b3J5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbnRyaWVzWzFdLm5hbWUsICdSRUFETUUubWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXNbMV0udHlwZSwgJ2ZpbGUnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VMaXN0IHJldHVybnMgYSBKU09OLVJQQyBlcnJvciB3aGVuIHRoZSB0YXJnZXQgaXMgaW52YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtYnJvd3NlLWVycm9yJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IGRpclVyaSA9IFVSSS5maWxlKCcvbWlzc2luZycpLnRvU3RyaW5nKCk7XG5cdFx0YWdlbnRTZXJ2aWNlLmJyb3dzZUVycm9ycy5zZXQoVVJJLmZpbGUoJy9taXNzaW5nJykudG9TdHJpbmcoKSwgbmV3IFByb3RvY29sRXJyb3IoSlNPTl9SUENfSU5URVJOQUxfRVJST1IsIGBEaXJlY3Rvcnkgbm90IGZvdW5kOiAke2RpclVyaX1gKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZUxpc3QnLCB7IHVyaTogZGlyVXJpIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfTtcblxuXHRcdGFzc2VydC5vayhyZXNwPy5lcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3IhLmNvZGUsIEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzcC5lcnJvciEubWVzc2FnZSwgL0RpcmVjdG9yeSBub3QgZm91bmQvKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VSZWFkIGRvZXMgbm90IGxvZyBtaXNzaW5nIGZpbGUgcmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXJlYWQtbWlzc2luZy1maWxlJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL21pc3NpbmcnKS50b1N0cmluZygpO1xuXHRcdGFnZW50U2VydmljZS5yZWFkRXJyb3JzLnNldChmaWxlVXJpLCBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgQ29udGVudCBub3QgZm91bmQ6ICR7ZmlsZVVyaX1gKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZVJlYWQnLCB7IHVyaTogZmlsZVVyaSB9KSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVycm9yQ29kZTogcmVzcC5lcnJvcj8uY29kZSxcblx0XHRcdGVycm9yQ291bnQ6IGxvZ1NlcnZpY2UuZXJyb3JDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRlcnJvckNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsXG5cdFx0XHRlcnJvckNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZVJlYWQgbG9ncyBtaXNzaW5nIG5vbi1maWxlIHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1yZWFkLW1pc3Npbmctc2Vzc2lvbi1kYicpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9ICdzZXNzaW9uLWRiOi9taXNzaW5nJztcblx0XHRhZ2VudFNlcnZpY2UucmVhZEVycm9ycy5zZXQocmVzb3VyY2UsIG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBDb250ZW50IG5vdCBmb3VuZDogJHtyZXNvdXJjZX1gKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZVJlYWQnLCB7IHVyaTogcmVzb3VyY2UgfSkpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvckNvZGU6IHJlc3AuZXJyb3I/LmNvZGUsXG5cdFx0XHRlcnJvckNvdW50OiBsb2dTZXJ2aWNlLmVycm9yQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZXJyb3JDb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLFxuXHRcdFx0ZXJyb3JDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBFeHRlbnNpb24gbWV0aG9kczogYXV0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnYXV0aGVudGljYXRlIHJldHVybnMgcmVzdWx0IHZpYSB0eXBlZCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1hdXRoJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnYXV0aGVudGljYXRlJywgeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCB0b2tlbjogJ3Rlc3QtdG9rZW4nIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgcmVzdWx0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRhc3NlcnQub2soIXJlc3AuZXJyb3IsIGB1bmV4cGVjdGVkIGVycm9yOiAke3Jlc3AuZXJyb3I/Lm1lc3NhZ2V9YCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwLnJlc3VsdCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyByZXR1cm5zIHByb3ZpZGVyIFNESyBzbmFwc2hvdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRTZXJ2aWNlLm1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzID0gW3tcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRzbmFwc2hvdDoge1xuXHRcdFx0XHRzb3VyY2U6ICdkZXZpY2UnLFxuXHRcdFx0XHRzZXJ2ZXJNYW5hZ2VkOiBmYWxzZSxcblx0XHRcdFx0ZGV2aWNlTWFuYWdlZDogdHJ1ZSxcblx0XHRcdFx0ZmFpbENsb3NlZDogZmFsc2UsXG5cdFx0XHRcdGJ5cGFzc1Blcm1pc3Npb25zRGlzYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRtYW5hZ2VkS2V5czogWydwZXJtaXNzaW9ucyddLFxuXHRcdFx0XHRzZXR0aW5nczogeyBwZXJtaXNzaW9uczogeyBhbGxvdzogWydTaGVsbChlY2hvICopJ10gfSB9LFxuXHRcdFx0fSxcblx0XHR9XTtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtbWFuYWdlZC1zZXR0aW5ncycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2dldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzJykpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgcmVzdWx0PzogdW5rbm93bjsgZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRhc3NlcnQub2soIXJlc3BvbnNlLmVycm9yLCBgdW5leHBlY3RlZCBlcnJvcjogJHtyZXNwb25zZS5lcnJvcj8ubWVzc2FnZX1gKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnJlc3VsdCwgYWdlbnRTZXJ2aWNlLm1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZW5zaW9uIHJlcXVlc3QgcHJlc2VydmVzIFByb3RvY29sRXJyb3IgY29kZSBhbmQgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBPdmVycmlkZSBhdXRoZW50aWNhdGUgdG8gdGhyb3cgYSBQcm90b2NvbEVycm9yIHdpdGggZGF0YVxuXHRcdGNvbnN0IG9yaWdIYW5kbGVyID0gYWdlbnRTZXJ2aWNlLmF1dGhlbnRpY2F0ZTtcblx0XHRhZ2VudFNlcnZpY2UuYXV0aGVudGljYXRlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcigtMzIwMDcsICdBdXRoIHJlcXVpcmVkJywgeyBoaW50OiAnc2lnbiBpbicgfSk7IH07XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtYXV0aC1lcnJvcicpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2F1dGhlbnRpY2F0ZScsIHsgcmVzb3VyY2U6ICd0ZXN0JywgdG9rZW46ICdiYWQnIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nOyBkYXRhPzogdW5rbm93biB9IH07XG5cblx0XHRhc3NlcnQub2socmVzcD8uZXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwLmVycm9yIS5jb2RlLCAtMzIwMDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwLmVycm9yIS5tZXNzYWdlLCAnQXV0aCByZXF1aXJlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzcC5lcnJvciEuZGF0YSwgeyBoaW50OiAnc2lnbiBpbicgfSk7XG5cblx0XHRhZ2VudFNlcnZpY2UuYXV0aGVudGljYXRlID0gb3JpZ0hhbmRsZXI7XG5cdH0pO1xuXG5cdC8vIC0tLS0gQ29ubmVjdGlvbiBjb3VudCBldmVudCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50IGZpcmVzIG9uIGNvbm5lY3QgYW5kIGRpc2Nvbm5lY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY291bnRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChoYW5kbGVyLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50KGMgPT4gY291bnRzLnB1c2goYykpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jb3VudC0xJyk7XG5cdFx0Y29ubmVjdENsaWVudCgnY2xpZW50LWNvdW50LTInKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3VudHMsIFsxLCAyLCAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoYXJlcyBjb25uZWN0aW9uIGNvdW50IGFjcm9zcyBNZXNzYWdlUG9ydCBhbmQgZXh0ZXJuYWwgbGlzdGVuZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBtZXNzYWdlUG9ydFNlcnZlciA9IG5ldyBNZXNzYWdlUG9ydFByb3RvY29sU2VydmVyPHN0cmluZz4oKTtcblx0XHRjb25zdCBzb2NrZXRTZXJ2ZXIgPSBuZXcgTW9ja1Byb3RvY29sU2VydmVyKCk7XG5cdFx0Y29uc3QgY29tYmluZWRTZXJ2ZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQ29tcG9zaXRlUHJvdG9jb2xTZXJ2ZXIoW21lc3NhZ2VQb3J0U2VydmVyLCBzb2NrZXRTZXJ2ZXJdKSk7XG5cdFx0Y29uc3QgY29tYmluZWRIYW5kbGVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdGNvbWJpbmVkU2VydmVyLFxuXHRcdFx0eyBkZWZhdWx0RGlyZWN0b3J5OiBVUkkuZmlsZSgnL2hvbWUvdGVzdHVzZXInKS50b1N0cmluZygpIH0sXG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCBjb3VudHM6IG51bWJlcltdID0gW107XG5cdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQoY29tYmluZWRIYW5kbGVyLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50KGNvdW50ID0+IGNvdW50cy5wdXNoKGNvdW50KSkpO1xuXG5cdFx0YXdhaXQgbWVzc2FnZVBvcnRTZXJ2ZXIuY2FsbDx2b2lkPignbWVzc2FnZS1wb3J0LWNsaWVudCcsICdjb25uZWN0Jyk7XG5cdFx0YXdhaXQgbWVzc2FnZVBvcnRTZXJ2ZXIuY2FsbDx2b2lkPignbWVzc2FnZS1wb3J0LWNsaWVudCcsICdzZW5kJywgSlNPTi5zdHJpbmdpZnkocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiAnbWVzc2FnZS1wb3J0LWNsaWVudCcsXG5cdFx0fSkpKTtcblxuXHRcdGNvbnN0IHNvY2tldFRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzb2NrZXRTZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHNvY2tldFRyYW5zcG9ydCk7XG5cdFx0c29ja2V0VHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdpbml0aWFsaXplJywge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6ICdzb2NrZXQtY2xpZW50Jyxcblx0XHR9KSk7XG5cblx0XHRtZXNzYWdlUG9ydFNlcnZlci5jbG9zZUNsaWVudCgnbWVzc2FnZS1wb3J0LWNsaWVudCcpO1xuXHRcdHNvY2tldFRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50cywgWzEsIDIsIDEsIDBdKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQgaXMgbm90IGRlY3JlbWVudGVkIGJ5IHN0YWxlIHJlY29ubmVjdCBjbG9zZScsICgpID0+IHtcblx0XHRjb25zdCBjb3VudHM6IG51bWJlcltdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGhhbmRsZXIub25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQoYyA9PiBjb3VudHMucHVzaChjKSkpO1xuXG5cdFx0Ly8gQ29ubmVjdFxuXHRcdGNvbnN0IHRyYW5zcG9ydDEgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtcmMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50cywgWzFdKTtcblxuXHRcdC8vIFJlY29ubmVjdCB3aXRoIHNhbWUgY2xpZW50SWQgKG5ldyBhY3RpdmUgdHJhbnNwb3J0KVxuXHRcdGNvbnN0IHRyYW5zcG9ydDIgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQyKTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1yYycsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogMCxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtdLFxuXHRcdH0pKTtcblx0XHQvLyBDb3VudCBpcyB1bmNoYW5nZWQgYmVjYXVzZSB0aGUgbG9naWNhbCBjbGllbnRJZCBpcyBhbHJlYWR5IGNvbm5lY3RlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50cywgWzEsIDFdKTtcblxuXHRcdC8vIE9sZCB0cmFuc3BvcnQgY2xvc2VzIC0gc2hvdWxkIE5PVCBkZWNyZW1lbnQgYmVjYXVzZSB0aGUgbmV3ZXJcblx0XHQvLyB0cmFuc3BvcnQgaXMgc3RpbGwgY29ubmVjdGVkLlxuXHRcdHRyYW5zcG9ydDEuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRzLCBbMSwgMV0pO1xuXG5cdFx0Ly8gTmV3IHRyYW5zcG9ydCBjbG9zZXMgLSBzaG91bGQgZGVjcmVtZW50XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3VudHMsIFsxLCAxLCAwXSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY3JlYXRlU2Vzc2lvbiBhY3RpdmVDbGllbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjcmVhdGVTZXNzaW9uIGFjdGl2ZUNsaWVudCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIGFjdGl2ZUNsaWVudCB0byB0aGUgYWdlbnQgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1Nlc3Npb24gPSBVUkkucGFyc2UoJ2NvcGlsb3Q6Ly8vZWFnZXItc2Vzc2lvbicpLnRvU3RyaW5nKCk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdFx0c2Vzc2lvbjogbmV3U2Vzc2lvbixcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdFx0dG9vbHM6IFt7IG5hbWU6ICd0MScsIGRlc2NyaXB0aW9uOiAnZCcsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfV0sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLCBkaXNwbGF5TmFtZTogJ0EnIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IHJlc3VsdD86IHVua25vd247IGVycm9yPzogdW5rbm93biB9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5lcnJvciwgdW5kZWZpbmVkLCAnY3JlYXRlU2Vzc2lvbiBzaG91bGQgc3VjY2VlZCcpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gYWdlbnRTZXJ2aWNlLmNyZWF0ZVNlc3Npb25Db25maWdzLmF0KC0xKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjbGllbnRJZDogY29uZmlnPy5hY3RpdmVDbGllbnQ/LmNsaWVudElkLFxuXHRcdFx0XHR0b29sTmFtZTogY29uZmlnPy5hY3RpdmVDbGllbnQ/LnRvb2xzWzBdPy5uYW1lLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uVXJpOiBjb25maWc/LmFjdGl2ZUNsaWVudD8uY3VzdG9taXphdGlvbnM/LlswXS51cmksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3QxJyxcblx0XHRcdFx0Y3VzdG9taXphdGlvblVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGNyZWF0ZVNlc3Npb24gd2hlbiBhY3RpdmVDbGllbnQuY2xpZW50SWQgbWlzbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1Nlc3Npb24gPSBVUkkucGFyc2UoJ2NvcGlsb3Q6Ly8vbWlzbWF0Y2gtc2Vzc2lvbicpLnRvU3RyaW5nKCk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdFx0c2Vzc2lvbjogbmV3U2Vzc2lvbixcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdvdGhlci1jbGllbnQnLFxuXHRcdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyByZXN1bHQ/OiB1bmtub3duOyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSB9O1xuXG5cdFx0XHRhc3NlcnQub2socmVzcC5lcnJvciwgJ3Jlc3BvbnNlIHNob3VsZCBiZSBhbiBlcnJvcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AucmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50U2VydmljZS5jcmVhdGVTZXNzaW9uQ29uZmlncy5sZW5ndGgsIDAsICdhZ2VudCBzZXJ2aWNlIHNob3VsZCBub3QgaGF2ZSBiZWVuIGNhbGxlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnT1RMUCBsb2dzIGNoYW5uZWwnLCAoKSA9PiB7XG5cdFx0Ly8gV2UgbmVlZCBhIHNlcGFyYXRlIGhhbmRsZXIgaW5zdGFuY2UgdGhhdCBoYXMgYW4gT3RscExvZ0VtaXR0ZXJcblx0XHQvLyBhdHRhY2hlZCwgc28gc3BpbiBvbmUgdXAgcGVyLXRlc3QgdXNpbmcgYSBwcml2YXRlIHN0YXRlIG1hbmFnZXIuXG5cdFx0Ly8gVGhlIG91dGVyLXN1aXRlIGhhbmRsZXIgaXMgbGVmdCBhbG9uZSBhbmQgY29udGludWVzIHRvIHRlc3QgdGhlXG5cdFx0Ly8gXCJubyBPVExQXCIgY29kZSBwYXRoIGltcGxpY2l0bHkuXG5cdFx0bGV0IG90bHBFbWl0dGVyOiBPdGxwTG9nRW1pdHRlcjtcblx0XHRsZXQgb3RscFN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRcdGxldCBvdGxwU2VydmVyOiBNb2NrUHJvdG9jb2xTZXJ2ZXI7XG5cdFx0bGV0IG90bHBBZ2VudFNlcnZpY2U6IE1vY2tBZ2VudFNlcnZpY2U7XG5cdFx0bGV0IGxvY2FsRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGxvY2FsRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRvdGxwRW1pdHRlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBPdGxwTG9nRW1pdHRlcigpKTtcblx0XHRcdG90bHBTdGF0ZU1hbmFnZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRvdGxwU2VydmVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRcdG90bHBBZ2VudFNlcnZpY2UgPSBuZXcgTW9ja0FnZW50U2VydmljZSgpO1xuXHRcdFx0b3RscEFnZW50U2VydmljZS5zZXRTdGF0ZU1hbmFnZXIob3RscFN0YXRlTWFuYWdlcik7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChvdGxwQWdlbnRTZXJ2aWNlKTtcblx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0XHRcdG90bHBBZ2VudFNlcnZpY2UsXG5cdFx0XHRcdG90bHBTdGF0ZU1hbmFnZXIsXG5cdFx0XHRcdG90bHBTZXJ2ZXIsXG5cdFx0XHRcdHsgZGVmYXVsdERpcmVjdG9yeTogVVJJLmZpbGUoJy9ob21lL3Rlc3R1c2VyJykudG9TdHJpbmcoKSwgb3RscExvZ0VtaXR0ZXI6IG90bHBFbWl0dGVyIH0sXG5cdFx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSksXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNvbm5lY3RPdGxwQ2xpZW50KGNsaWVudElkOiBzdHJpbmcsIGluaXRpYWxTdWJzY3JpcHRpb25zPzogcmVhZG9ubHkgc3RyaW5nW10pOiBNb2NrUHJvdG9jb2xUcmFuc3BvcnQge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdFx0b3RscFNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnMsXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGZpbmRPdGxwTG9ncyhzZW50OiBQcm90b2NvbE1lc3NhZ2VbXSk6IHsgY2hhbm5lbDogc3RyaW5nOyBwYXlsb2FkOiB1bmtub3duIH1bXSB7XG5cdFx0XHRyZXR1cm4gc2VudFxuXHRcdFx0XHQuZmlsdGVyKGlzSnNvblJwY05vdGlmaWNhdGlvbilcblx0XHRcdFx0LmZpbHRlcigobSk6IG0gaXMgQWhwTm90aWZpY2F0aW9uICYgeyBtZXRob2Q6ICdvdGxwL2V4cG9ydExvZ3MnOyBwYXJhbXM6IHsgY2hhbm5lbDogc3RyaW5nOyBwYXlsb2FkOiB1bmtub3duIH0gfSA9PiBtLm1ldGhvZCA9PT0gJ290bHAvZXhwb3J0TG9ncycpXG5cdFx0XHRcdC5tYXAobSA9PiAoeyBjaGFubmVsOiBtLnBhcmFtcy5jaGFubmVsLCBwYXlsb2FkOiBtLnBhcmFtcy5wYXlsb2FkIH0pKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdoYW5kc2hha2UgYWR2ZXJ0aXNlcyB0aGUgbG9ncyBjaGFubmVsIHRlbXBsYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLTEnKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0LnNlbnQsIDEpIGFzIHsgcmVzdWx0OiBJbml0aWFsaXplUmVzdWx0ICYgeyB0ZWxlbWV0cnk/OiB7IGxvZ3M/OiBzdHJpbmcgfSB9IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3AucmVzdWx0LnRlbGVtZXRyeSwgeyBsb2dzOiAnYWhwLW90bHA6Ly9sb2dzL3tsZXZlbH0nIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic2NyaWJlIHRvIGxvZ3MgY2hhbm5lbCByZXR1cm5zIGFuIGVtcHR5IHN0YXRlbGVzcyByZXN1bHQgYW5kIHN0YXJ0cyBmb3J3YXJkaW5nIHJlY29yZHMgYXQtb3ItYWJvdmUgdGhlIHJlcXVlc3RlZCBsZXZlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RPdGxwQ2xpZW50KCdjbGllbnQtb3RscC0yJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogJ2FocC1vdGxwOi8vbG9ncy93YXJuJyB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZXNwIGFzIHsgcmVzdWx0OiB1bmtub3duIH0pLnJlc3VsdCwge30pO1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMTAwMCcsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2luZm8tbXNnJyB9KTtcblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcxMDAxJywgc2V2ZXJpdHlOdW1iZXI6IDEzLCBzZXZlcml0eVRleHQ6ICd3YXJuJywgYm9keTogJ3dhcm4tbXNnJyB9KTtcblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcxMDAyJywgc2V2ZXJpdHlOdW1iZXI6IDE3LCBzZXZlcml0eVRleHQ6ICdlcnJvcicsIGJvZHk6ICdlcnJvci1tc2cnIH0pO1xuXG5cdFx0XHRjb25zdCBsb2dzID0gZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KTtcblx0XHRcdGNvbnN0IGJvZGllcyA9IGxvZ3MuZmxhdE1hcCgoeyBwYXlsb2FkIH0pID0+IFsuLi5pdGVyYXRlT3RscExvZ1JlY29yZHMocGF5bG9hZCldLm1hcChyID0+IHIuYm9keSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChib2RpZXMsIFsnd2Fybi1tc2cnLCAnZXJyb3ItbXNnJ10pO1xuXHRcdFx0Zm9yIChjb25zdCB7IGNoYW5uZWwgfSBvZiBsb2dzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFubmVsLCAnYWhwLW90bHA6Ly9sb2dzL3dhcm4nKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Vuc3Vic2NyaWJlIHN0b3BzIGZvcndhcmRpbmcgd2l0aG91dCBhZmZlY3Rpbmcgb3RoZXIgc3Vic2NyaWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLWEnKTtcblx0XHRcdGNvbnN0IGIgPSBjb25uZWN0T3RscENsaWVudCgnY2xpZW50LW90bHAtYicpO1xuXG5cdFx0XHRjb25zdCBhU3Vic2NyaWJlZCA9IHdhaXRGb3JSZXNwb25zZShhLCAyKTtcblx0XHRcdGNvbnN0IGJTdWJzY3JpYmVkID0gd2FpdEZvclJlc3BvbnNlKGIsIDIpO1xuXHRcdFx0YS5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL3RyYWNlJyB9KSk7XG5cdFx0XHRiLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvdHJhY2UnIH0pKTtcblx0XHRcdGF3YWl0IGFTdWJzY3JpYmVkO1xuXHRcdFx0YXdhaXQgYlN1YnNjcmliZWQ7XG5cblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcxJywgc2V2ZXJpdHlOdW1iZXI6IDksIHNldmVyaXR5VGV4dDogJ2luZm8nLCBib2R5OiAnZmlyc3QnIH0pO1xuXG5cdFx0XHRhLnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL3RyYWNlJyB9KSk7XG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMicsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ3NlY29uZCcgfSk7XG5cblx0XHRcdGNvbnN0IGFCb2RpZXMgPSBmaW5kT3RscExvZ3MoYS5zZW50KS5mbGF0TWFwKCh7IHBheWxvYWQgfSkgPT4gWy4uLml0ZXJhdGVPdGxwTG9nUmVjb3JkcyhwYXlsb2FkKV0ubWFwKHIgPT4gci5ib2R5KSk7XG5cdFx0XHRjb25zdCBiQm9kaWVzID0gZmluZE90bHBMb2dzKGIuc2VudCkuZmxhdE1hcCgoeyBwYXlsb2FkIH0pID0+IFsuLi5pdGVyYXRlT3RscExvZ1JlY29yZHMocGF5bG9hZCldLm1hcChyID0+IHIuYm9keSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGE6IGFCb2RpZXMsIGI6IGJCb2RpZXMgfSwgeyBhOiBbJ2ZpcnN0J10sIGI6IFsnZmlyc3QnLCAnc2Vjb25kJ10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBzdWJzY3JpcHRpb25zIHRvIGRpZmZlcmVudCBsZXZlbHMgZWFjaCByZWNlaXZlIHRoZWlyIG93biBiYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLW11bHRpJyk7XG5cdFx0XHRjb25zdCBzdWJzY3JpYmVkMiA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdFx0Y29uc3Qgc3Vic2NyaWJlZDMgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAzKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL2luZm8nIH0pKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgzLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL2Vycm9yJyB9KSk7XG5cdFx0XHRhd2FpdCBzdWJzY3JpYmVkMjtcblx0XHRcdGF3YWl0IHN1YnNjcmliZWQzO1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2luZm8tb25seScgfSk7XG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMicsIHNldmVyaXR5TnVtYmVyOiAxNywgc2V2ZXJpdHlUZXh0OiAnZXJyb3InLCBib2R5OiAnYm90aCcgfSk7XG5cblx0XHRcdGNvbnN0IGJ5Q2hhbm5lbCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmdbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgeyBjaGFubmVsLCBwYXlsb2FkIH0gb2YgZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KSkge1xuXHRcdFx0XHRjb25zdCBib2RpZXMgPSBbLi4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHBheWxvYWQpXS5tYXAociA9PiByLmJvZHkpO1xuXHRcdFx0XHRieUNoYW5uZWwuc2V0KGNoYW5uZWwsIFsuLi4oYnlDaGFubmVsLmdldChjaGFubmVsKSA/PyBbXSksIC4uLmJvZGllc10pO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QuZnJvbUVudHJpZXMoYnlDaGFubmVsKSwge1xuXHRcdFx0XHQnYWhwLW90bHA6Ly9sb2dzL2luZm8nOiBbJ2luZm8tb25seScsICdib3RoJ10sXG5cdFx0XHRcdCdhaHAtb3RscDovL2xvZ3MvZXJyb3InOiBbJ2JvdGgnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgZHJvcHMgaXRzIE9UTFAgc3Vic2NyaXB0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RPdGxwQ2xpZW50KCdjbGllbnQtb3RscC1kaXNjb25uZWN0Jyk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogJ2FocC1vdGxwOi8vbG9ncy90cmFjZScgfSkpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2FmdGVyLWNsb3NlJyB9KTtcblxuXHRcdFx0Ly8gQWZ0ZXIgY2xvc2UsIG5vIGZ1cnRoZXIgbm90aWZpY2F0aW9ucyBzaG91bGQgbGFuZCBvbiB0aGVcblx0XHRcdC8vIGRpc2Nvbm5lY3RlZCB0cmFuc3BvcnQuIChTYW5pdHk6IHRoZSBvbmx5IG1lc3NhZ2Ugd2UgZXhwZWN0XG5cdFx0XHQvLyB3YXMgdGhlIHN1YnNjcmliZSByZXNwb25zZSB3ZSBhbHJlYWR5IGNvbnN1bWVkLilcblx0XHRcdGNvbnN0IGxvZ3MgPSBmaW5kT3RscExvZ3ModHJhbnNwb3J0LnNlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2dzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bnJlY29nbmlzZWQgYWhwLW90bHAgVVJJcyBkbyBub3QgY3Jhc2ggc3Vic2NyaWJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLWJhZCcpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvdmVyYm9zZScgfSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgocmVzcCBhcyB7IHJlc3VsdDogdW5rbm93biB9KS5yZXN1bHQsIHt9LCAndW5rbm93biBsZXZlbCBzaG91bGQgYmUgYWNrbm93bGVkZ2VkIGFzIHN0YXRlbGVzcycpO1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ3doYXRldmVyJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KSwgW10sICdubyByZWNvcmRzIHNob3VsZCBsZWFrIHRvIGFuIGludmFsaWQgbGV2ZWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1VSSSB2YXJpYW50cyB0aGF0IHBhcnNlIHRvIHRoZSBzYW1lIGxldmVsIGNvbGxhcHNlIHRvIG9uZSBjYW5vbmljYWwgc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLWNhbm9uaWNhbCcpO1xuXHRcdFx0Y29uc3QgcjIgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHRcdGNvbnN0IHIzID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMyk7XG5cdFx0XHRjb25zdCByNCA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDQpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvaW5mbycgfSkpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDMsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvaW5mbz9kdXA9MScgfSkpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDQsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvaW5mbyNmcmFnJyB9KSk7XG5cdFx0XHRhd2FpdCByMjsgYXdhaXQgcjM7IGF3YWl0IHI0O1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ29uY2UnIH0pO1xuXG5cdFx0XHRjb25zdCBsb2dzID0gZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2dzLmxlbmd0aCwgMSwgJ29uZSByZWNvcmQgc2hvdWxkIHByb2R1Y2UgZXhhY3RseSBvbmUgbm90aWZpY2F0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9nc1swXS5jaGFubmVsLCAnYWhwLW90bHA6Ly9sb2dzL2luZm8nLCAnY2hhbm5lbCBzaG91bGQgYmUgY2Fub25pY2FsaXNlZCcpO1xuXG5cdFx0XHQvLyBVbnN1YnNjcmliZSBzaG91bGQgcmVtb3ZlIHRoZSBjYW5vbmljYWwgZW50cnkgcmVnYXJkbGVzcyBvZlxuXHRcdFx0Ly8gd2hpY2ggVVJJIHZhcmlhbnQgdGhlIGNsaWVudCB1c2VzIHRvIHVuc3Vic2NyaWJlLlxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL2luZm8/ZHVwPTEnIH0pKTtcblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcyJywgc2V2ZXJpdHlOdW1iZXI6IDksIHNldmVyaXR5VGV4dDogJ2luZm8nLCBib2R5OiAnYWZ0ZXItdW5zdWInIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KS5sZW5ndGgsIDEsICdubyBmdXJ0aGVyIG5vdGlmaWNhdGlvbnMgYWZ0ZXIgdW5zdWJzY3JpYmUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rvd25sb2FkIHByb2dyZXNzIGNoYW5uZWwnLCAoKSA9PiB7XG5cdFx0Ly8gUHJvZ3Jlc3MgaXMgZW1pdHRlZCBvbiB0aGUgc3RhdGUgbWFuYWdlciAoc28gaXQgcmVhY2hlcyBib3RoIGxvY2FsXG5cdFx0Ly8gSVBDIGFuZCByZW1vdGUgV2ViU29ja2V0IHJlbmRlcmVycyB0aHJvdWdoIHRoZSBzYW1lIHBhdGggYXMgc2Vzc2lvblxuXHRcdC8vIG5vdGlmaWNhdGlvbnMpLiBUaGlzIHN1aXRlIHZlcmlmaWVzIHRoZSBoYW5kbGVyIGZvcndhcmRzIGVhY2ggZnJhbWUgdG9cblx0XHQvLyBjb25uZWN0ZWQgY2xpZW50cyBhcyBhIGBwcm9ncmVzc2Agbm90aWZpY2F0aW9uIG9uIHRoZSByb290IGNoYW5uZWwuXG5cdFx0Ly8gU3B1biB1cCBwZXItdGVzdCB3aXRoIGEgcHJpdmF0ZSBzdGF0ZSBtYW5hZ2VyIHNvIHRoZSBvdXRlciBzdWl0ZSBpc1xuXHRcdC8vIHVuYWZmZWN0ZWQuXG5cdFx0bGV0IGRsU3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdFx0bGV0IGRsU2VydmVyOiBNb2NrUHJvdG9jb2xTZXJ2ZXI7XG5cdFx0bGV0IGRsQWdlbnRTZXJ2aWNlOiBNb2NrQWdlbnRTZXJ2aWNlO1xuXHRcdGxldCBsb2NhbERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGxTdGF0ZU1hbmFnZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkbFNlcnZlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrUHJvdG9jb2xTZXJ2ZXIoKSk7XG5cdFx0XHRkbEFnZW50U2VydmljZSA9IG5ldyBNb2NrQWdlbnRTZXJ2aWNlKCk7XG5cdFx0XHRkbEFnZW50U2VydmljZS5zZXRTdGF0ZU1hbmFnZXIoZGxTdGF0ZU1hbmFnZXIpO1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQoZGxBZ2VudFNlcnZpY2UpO1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdFx0ZGxBZ2VudFNlcnZpY2UsXG5cdFx0XHRcdGRsU3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRkbFNlcnZlcixcblx0XHRcdFx0eyBkZWZhdWx0RGlyZWN0b3J5OiBVUkkuZmlsZSgnL2hvbWUvdGVzdHVzZXInKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSksXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNvbm5lY3REb3dubG9hZENsaWVudChjbGllbnRJZDogc3RyaW5nKTogTW9ja1Byb3RvY29sVHJhbnNwb3J0IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRcdGRsU2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdpbml0aWFsaXplJywge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmV0dXJuIHRyYW5zcG9ydDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBmaW5kUHJvZ3Jlc3Moc2VudDogUHJvdG9jb2xNZXNzYWdlW10pOiBQcm9ncmVzc1BhcmFtc1tdIHtcblx0XHRcdHJldHVybiBzZW50XG5cdFx0XHRcdC5maWx0ZXIoaXNKc29uUnBjTm90aWZpY2F0aW9uKVxuXHRcdFx0XHQuZmlsdGVyKChtKTogbSBpcyBBaHBOb3RpZmljYXRpb24gJiB7IG1ldGhvZDogJ3Jvb3QvcHJvZ3Jlc3MnOyBwYXJhbXM6IFByb2dyZXNzUGFyYW1zIH0gPT4gbS5tZXRob2QgPT09ICdyb290L3Byb2dyZXNzJylcblx0XHRcdFx0Lm1hcChtID0+IG0ucGFyYW1zKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBlYWNoIHByb2dyZXNzIGZyYW1lIHRvIGNvbm5lY3RlZCBjbGllbnRzIG9uIHRoZSByb290IGNoYW5uZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0RG93bmxvYWRDbGllbnQoJ2NsaWVudC1kbC0xJyk7XG5cblx0XHRcdGRsU3RhdGVNYW5hZ2VyLmVtaXRQcm9ncmVzcyh7IHByb2dyZXNzVG9rZW46ICd0MScsIHByb2dyZXNzOiAwLCB0b3RhbDogMTAwMCwgbWVzc2FnZTogJ0NsYXVkZScgfSk7XG5cdFx0XHRkbFN0YXRlTWFuYWdlci5lbWl0UHJvZ3Jlc3MoeyBwcm9ncmVzc1Rva2VuOiAndDEnLCBwcm9ncmVzczogNTAwLCB0b3RhbDogMTAwMCwgbWVzc2FnZTogJ0NsYXVkZScgfSk7XG5cdFx0XHRkbFN0YXRlTWFuYWdlci5lbWl0UHJvZ3Jlc3MoeyBwcm9ncmVzc1Rva2VuOiAndDEnLCBwcm9ncmVzczogMTAwMCwgdG90YWw6IDEwMDAsIG1lc3NhZ2U6ICdDbGF1ZGUnIH0pO1xuXG5cdFx0XHRjb25zdCBmcmFtZXMgPSBmaW5kUHJvZ3Jlc3ModHJhbnNwb3J0LnNlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcmFtZXMubWFwKGYgPT4gZi5wcm9ncmVzcyksIFswLCA1MDAsIDEwMDBdKTtcblx0XHRcdGFzc2VydC5vayhmcmFtZXMuZXZlcnkoZiA9PiBmLnByb2dyZXNzVG9rZW4gPT09ICd0MScgJiYgZi5tZXNzYWdlID09PSAnQ2xhdWRlJyAmJiBmLnRvdGFsID09PSAxMDAwKSk7XG5cdFx0XHRhc3NlcnQub2soZnJhbWVzLmV2ZXJ5KGYgPT4gKGYgYXMgUHJvZ3Jlc3NQYXJhbXMgJiB7IGNoYW5uZWw6IHN0cmluZyB9KS5jaGFubmVsID09PSAnYWhwLXJvb3Q6Ly8nKSwgJ2ZyYW1lcyBhcmUgYnJvYWRjYXN0IG9uIHRoZSByb290IGNoYW5uZWwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc291cmNlIHdhdGNoZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzdWJzY3JpYmUgdG8gYSByZXNvdXJjZS13YXRjaCBjaGFubmVsIHJldHVybnMgdGhlIGRlc2NyaXB0b3IgKyBidW1wcyByZWZjb3VudDsgZW52ZWxvcGVzIGFyZSByb3V0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBQcmUtcG9wdWxhdGUgdGhlIG1vY2sgc28gYG9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWRgIHJldHVybnNcblx0XHRcdC8vIGEgZGVzY3JpcHRvciBcdTIwMTQgdGhpcyBpcyB0aGUgcm9sZSB0aGUgcHJvZHVjdGlvbiBgQWdlbnRTZXJ2aWNlYFxuXHRcdFx0Ly8gcGxheXMgYWZ0ZXIgaXQgcGFyc2VzIHRoZSBjaGFubmVsIFVSSS5cblx0XHRcdGNvbnN0IHdhdGNoQ2hhbm5lbCA9ICdhaHAtcmVzb3VyY2Utd2F0Y2g6L21vY2std2F0Y2gnO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvciA9IHsgcm9vdDogJ2ZpbGU6Ly8vd29ya3NwYWNlJywgcmVjdXJzaXZlOiBmYWxzZSB9O1xuXHRcdFx0YWdlbnRTZXJ2aWNlLmxpdmVXYXRjaERlc2NyaXB0b3JzLnNldCh3YXRjaENoYW5uZWwsIGRlc2NyaXB0b3IpO1xuXG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtd2F0Y2gnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IHN1YlByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAxMDEpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEwMSwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2hDaGFubmVsIH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCBzdWJQcm9taXNlO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgeyByZXN1bHQ6IHsgc25hcHNob3Q6IElTdGF0ZVNuYXBzaG90IH0gfSkucmVzdWx0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmFwc2hvdC5yZXNvdXJjZSwgd2F0Y2hDaGFubmVsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnNuYXBzaG90LnN0YXRlLCBkZXNjcmlwdG9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRTZXJ2aWNlLndhdGNoU3Vic2NyaWJlQ2FsbHMsIFt3YXRjaENoYW5uZWxdKTtcblxuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih3YXRjaENoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5SZXNvdXJjZVdhdGNoQ2hhbmdlZCxcblx0XHRcdFx0Y2hhbmdlczogeyBpdGVtczogW3sgdXJpOiAnZmlsZTovLy93b3Jrc3BhY2UvYS50eHQnLCB0eXBlOiAndXBkYXRlZCcgYXMgbmV2ZXIgfV0gfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiBzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24+WzFdKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uTXNncyA9IGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydC5zZW50LCAnYWN0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uTXNncy5sZW5ndGgsIDEsICdzdWJzY3JpYmVyIHNob3VsZCByZWNlaXZlIHRoZSBjaGFuZ2UgZW52ZWxvcGUnKTtcblx0XHRcdGNvbnN0IGVudiA9IGFjdGlvbk1zZ3NbMF0ucGFyYW1zIGFzIHVua25vd24gYXMgeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogeyB0eXBlOiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi5jaGFubmVsLCB3YXRjaENoYW5uZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi5hY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5SZXNvdXJjZVdhdGNoQ2hhbmdlZCk7XG5cblx0XHRcdC8vIEV4cGxpY2l0IHVuc3Vic2NyaWJlIGRyb3BzIHRoZSByZWZjb3VudCB0aHJvdWdoIHRoZSBhZ2VudCBzZXJ2aWNlLlxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiB3YXRjaENoYW5uZWwgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudFNlcnZpY2Uud2F0Y2hVbnN1YnNjcmliZUNhbGxzLCBbd2F0Y2hDaGFubmVsXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJzY3JpYmUgdG8gYW4gdW5rbm93biByZXNvdXJjZS13YXRjaCBjaGFubmVsIHN1cmZhY2VzIGEgSlNPTi1SUEMgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtd2F0Y2gtYmFkJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAxMDIpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEwMiwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogJ2FocC1yZXNvdXJjZS13YXRjaDovYm9ndXMnIH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwUHJvbWlzZTtcblx0XHRcdGNvbnN0IGVycm9yID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IGVycm9yPzogeyBjb2RlOiBudW1iZXIgfSB9KS5lcnJvcjtcblx0XHRcdGFzc2VydC5vayhlcnJvciwgYGV4cGVjdGVkIGFuIGVycm9yIHJlc3BvbnNlLCBnb3QgJHtKU09OLnN0cmluZ2lmeShyZXNwKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWVudCBkaXNjb25uZWN0IHJlbGVhc2VzIHRoZSB3YXRjaCByZWZjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdhdGNoQ2hhbm5lbCA9ICdhaHAtcmVzb3VyY2Utd2F0Y2g6L21vY2std2F0Y2gtZGlzY29ubmVjdCc7XG5cdFx0XHRhZ2VudFNlcnZpY2UubGl2ZVdhdGNoRGVzY3JpcHRvcnMuc2V0KHdhdGNoQ2hhbm5lbCwgeyByb290OiAnZmlsZTovLy9yb290JywgcmVjdXJzaXZlOiBmYWxzZSB9KTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXdhdGNoLTInKTtcblx0XHRcdGNvbnN0IHN1YlByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyMDApO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIwMCwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2hDaGFubmVsIH0pKTtcblx0XHRcdGF3YWl0IHN1YlByb21pc2U7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50U2VydmljZS53YXRjaFN1YnNjcmliZUNhbGxzLCBbd2F0Y2hDaGFubmVsXSk7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50U2VydmljZS53YXRjaFVuc3Vic2NyaWJlQ2FsbHMsIFt3YXRjaENoYW5uZWxdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ292ZXJsYXBwaW5nIHRyYW5zcG9ydHMgcmVsZWFzZSBlYWNoIHJlc291cmNlLXdhdGNoIHN1YnNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdhdGNoQ2hhbm5lbCA9ICdhaHAtcmVzb3VyY2Utd2F0Y2g6L21vY2std2F0Y2gtb3ZlcmxhcCc7XG5cdFx0XHRhZ2VudFNlcnZpY2UubGl2ZVdhdGNoRGVzY3JpcHRvcnMuc2V0KHdhdGNoQ2hhbm5lbCwgeyByb290OiAnZmlsZTovLy9yb290JywgcmVjdXJzaXZlOiBmYWxzZSB9KTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC13YXRjaC1vdmVybGFwJyk7XG5cdFx0XHRjb25zdCBzdWJQcm9taXNlMSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQxLCAyMDApO1xuXHRcdFx0dHJhbnNwb3J0MS5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyMDAsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoQ2hhbm5lbCB9KSk7XG5cdFx0XHRhd2FpdCBzdWJQcm9taXNlMTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0MiA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC13YXRjaC1vdmVybGFwJyk7XG5cdFx0XHRjb25zdCBzdWJQcm9taXNlMiA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQyLCAyMDEpO1xuXHRcdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyMDEsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoQ2hhbm5lbCB9KSk7XG5cdFx0XHRhd2FpdCBzdWJQcm9taXNlMjtcblxuXHRcdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN1YnNjcmliZXM6IGFnZW50U2VydmljZS53YXRjaFN1YnNjcmliZUNhbGxzLFxuXHRcdFx0XHR1bnN1YnNjcmliZXM6IGFnZW50U2VydmljZS53YXRjaFVuc3Vic2NyaWJlQ2FsbHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN1YnNjcmliZXM6IFt3YXRjaENoYW5uZWwsIHdhdGNoQ2hhbm5lbF0sXG5cdFx0XHRcdHVuc3Vic2NyaWJlczogW3dhdGNoQ2hhbm5lbCwgd2F0Y2hDaGFubmVsXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGdCQUFzRCx1QkFBMlA7QUFDMVQsU0FBUyxrQkFBNkk7QUFDdEosU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUIsa0JBQWtCLG1CQUFtQix5QkFBeUIsbUJBQW1CLGVBQWUsZUFBZSxrQ0FBa0Ms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
