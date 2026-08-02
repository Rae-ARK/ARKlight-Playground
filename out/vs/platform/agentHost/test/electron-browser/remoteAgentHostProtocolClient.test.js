import assert from "assert";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientState, RemoteAgentHostProtocolClient } from "../../browser/remoteAgentHostProtocolClient.js";
import { AgentHostPermissionMode, AgentHostResourcePermissionError, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from "../../common/agentHostResourceService.js";
import { ConfigurationTarget } from "../../../configuration/common/configuration.js";
import { ContentEncoding, ReconnectResultType } from "../../common/state/protocol/commands.js";
import { ChatSourceKind } from "../../common/state/protocol/channels-chat/commands.js";
import { AhpErrorCodes } from "../../common/state/protocol/errors.js";
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "../../common/state/protocol/version/registry.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ProtocolError } from "../../common/state/sessionProtocol.js";
import { hasKey } from "../../../../base/common/types.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { CustomizationType, MessageAttachmentKind, MessageKind, PendingMessageKind, readSessionWorkspaceless, ROOT_STATE_URI, SessionStatus, StateComponents, customizationId, withSessionWorkspaceless } from "../../common/state/sessionState.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentHostCodexAgentEnabledSettingId, AgentHostCodexMultiRootEnabledSettingId, AgentHostCopilotMultiRootEnabledSettingId, AgentHostClaudeMultiRootEnabledSettingId, AgentHostSystemProxyEnabledSettingId } from "../../common/agentService.js";
import { AgentHostAutoReplyEnabledConfigKey, AgentHostCodexEnabledConfigKey, AgentHostCodexMultiRootEnabledConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostClaudeMultiRootEnabledConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostEditTelemetryEnabledConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey, AgentHostTelemetryLevelConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, AUTO_REPLY_SETTING_ID, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, EDIT_TELEMETRY_ENABLED_SETTING_ID, telemetryLevelToAgentHostConfigValue, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID } from "../../common/agentHostSchema.js";
import { agentsWindowAgentHostClientInfo } from "../../common/agentHostClientInfo.js";
function isPingRequest(msg) {
  return hasKey(msg, { method: true, id: true }) && msg.method === "ping";
}
function findRootConfigNotification(messages, configKey) {
  const match = messages.find((msg) => {
    if (!hasKey(msg, { method: true }) || msg.method !== "dispatchAction") {
      return false;
    }
    const params = msg.params;
    return params?.action?.type === ActionType.RootConfigChanged && !!params.action.config && configKey in params.action.config;
  });
  assert.ok(match, `Expected a RootConfigChanged notification carrying '${configKey}'`);
  return match;
}
function getRootConfig(notification) {
  const params = notification.params;
  assert.ok(params?.action?.config);
  return params.action.config;
}
function findLastRootConfigNotification(messages, configKey) {
  return findRootConfigNotification([...messages].reverse(), configKey);
}
class TestProtocolTransport extends Disposable {
  constructor() {
    super(...arguments);
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this.sentMessages = [];
  }
  send(message) {
    this.sentMessages.push(message);
  }
  fireMessage(message) {
    this._onMessage.fire(message);
  }
  fireClose() {
    this._onClose.fire();
  }
}
class TestClientProtocolTransport extends TestProtocolTransport {
  constructor() {
    super(...arguments);
    this.connectDeferred = new DeferredPromise();
  }
  connect() {
    return this.connectDeferred.p;
  }
}
class CloseOnDisposeProtocolTransport extends TestProtocolTransport {
  dispose() {
    this.fireClose();
    super.dispose();
  }
}
class CountingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.warnCount = 0;
  }
  warn(_message, ..._args) {
    this.warnCount++;
  }
}
class TerminalAutoApproveConfigurationService extends TestConfigurationService {
  constructor(configuration, _terminalAutoApproveInspectValue) {
    super(configuration);
    this._terminalAutoApproveInspectValue = _terminalAutoApproveInspectValue;
  }
  inspect(key) {
    if (key === TERMINAL_AUTO_APPROVE_SETTING_ID) {
      return this._terminalAutoApproveInspectValue;
    }
    return super.inspect(key);
  }
}
suite("RemoteAgentHostProtocolClient", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createPermissionService(allow = true) {
    return createResourceServiceStub({ granted: () => allow });
  }
  function createResourceServiceStub(opts = {}) {
    const grant = opts.granted ?? (() => true);
    const empty = observableValue("test", []);
    const denyRead = (uri) => new AgentHostResourcePermissionError({ channel: "ahp-root://", uri, read: true });
    const denyWrite = (uri) => new AgentHostResourcePermissionError({ channel: "ahp-root://", uri, write: true });
    const gateRead = async (identity, uri) => {
      if (!grant(identity, uri, AgentHostPermissionMode.Read)) {
        throw denyRead(uri.toString());
      }
    };
    const gateWrite = async (identity, uri) => {
      if (!grant(identity, uri, AgentHostPermissionMode.Write)) {
        throw denyWrite(uri.toString());
      }
    };
    return {
      _serviceBrand: void 0,
      check: async (addr, uri, mode) => grant(addr, uri, mode),
      async list(addr, uri) {
        await gateRead(addr, uri);
        return { entries: [] };
      },
      async read(addr, uri) {
        await gateRead(addr, uri);
        if (opts.readBytes) {
          return { bytes: opts.readBytes };
        }
        throw new Error("Not implemented in stub");
      },
      async write(addr, params) {
        await gateWrite(addr, URI.parse(params.uri));
      },
      async del(addr, params) {
        await gateWrite(addr, URI.parse(params.uri));
      },
      async move(addr, params) {
        await gateWrite(addr, URI.parse(params.source));
        await gateWrite(addr, URI.parse(params.destination));
      },
      async copy(addr, params) {
        await gateRead(addr, URI.parse(params.source));
        await gateWrite(addr, URI.parse(params.destination));
      },
      async resolve(addr, params) {
        await gateRead(addr, URI.parse(params.uri));
        throw new Error("Not implemented in stub");
      },
      async mkdir(addr, params) {
        await gateWrite(addr, URI.parse(params.uri));
      },
      request: async (addr, params) => opts.onRequest ? opts.onRequest(addr, params) : void 0,
      pendingFor: () => empty,
      allPending: empty,
      findPending: () => void 0,
      grantImplicitRead: (address, uri) => {
        opts.onGrantImplicitRead?.(address, uri);
        return opts.onRevokeImplicitRead ? toDisposable(() => opts.onRevokeImplicitRead?.(address, uri)) : Disposable.None;
      },
      connectionClosed: () => {
      }
    };
  }
  function createClientForIdentity(identity, transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator, logService = new NullLogService(), configurationService = new TestConfigurationService(), clientId, clientInfo) {
    const client = disposables.add(new RemoteAgentHostProtocolClient(identity, transport, loadEstimator, clientId, clientInfo, logService, permissionService, configurationService));
    return { client, transport, configurationService };
  }
  function createClient(transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator, logService = new NullLogService(), configurationService = new TestConfigurationService(), clientId, clientInfo) {
    return createClientForIdentity("test.example:1234", transport, permissionService, loadEstimator, logService, configurationService, clientId, clientInfo);
  }
  async function connectClient(client, transport) {
    const connectPromise = client.connect();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connectPromise;
  }
  async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }
  function fireConfigurationChange(configurationService, settingId) {
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([settingId]),
      change: { keys: [settingId], overrides: [] },
      affectsConfiguration: (configuration) => configuration === settingId
    });
  }
  async function assertRemoteProtocolError(promise, expected) {
    try {
      await promise;
      assert.fail("Expected promise to reject");
    } catch (error) {
      if (!(error instanceof ProtocolError)) {
        assert.fail(`Expected ProtocolError, got ${String(error)}`);
      }
      assert.strictEqual(error.code, expected.code);
      assert.strictEqual(error.message, expected.message);
      assert.deepStrictEqual(error.data, expected.data);
    }
  }
  test("completes matching response and removes it from pending requests", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.resourceList(URI.file("/workspace"));
    assert.deepStrictEqual(transport.sentMessages[0], {
      jsonrpc: "2.0",
      id: 1,
      method: "resourceList",
      params: { channel: "ahp-root://", uri: URI.file("/workspace").toString() }
    });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [] } });
    assert.deepStrictEqual(await resultPromise, { entries: [] });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [{ name: "late", type: "file" }] } });
    assert.strictEqual(transport.sentMessages.length, 1);
  });
  test("listSessions carries the workspace-less marker back on _meta", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.listSessions();
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: {
        items: [{
          resource: "agent-session://copilotcli/quick-1",
          provider: "copilotcli",
          title: "Quick Chat",
          status: SessionStatus.Idle,
          createdAt: (/* @__PURE__ */ new Date(1e3)).toISOString(),
          modifiedAt: (/* @__PURE__ */ new Date(2e3)).toISOString(),
          workingDirectories: [URI.file("/home/user/.copilot/chats/quick-1").toString()],
          _meta: withSessionWorkspaceless(void 0, true)
        }]
      }
    });
    const sessions = await resultPromise;
    assert.deepStrictEqual(sessions.map((s) => readSessionWorkspaceless(s._meta)), [true]);
  });
  test("queues requests and notifications until a client transport initializes", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const resource = URI.file("/workspace");
    const request = client.resourceList(resource);
    client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { preInitialize: true } });
    assert.strictEqual(transport.sentMessages.length, 0);
    disposables.add(client.onDidChangeConnectionState((state) => {
      if (state === AgentHostClientState.Connected) {
        client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { onConnected: true } });
      }
    }));
    const connect = client.connect();
    await Promise.resolve();
    assert.strictEqual(transport.sentMessages.length, 0);
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    assert.strictEqual(initialize.method, "initialize");
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connect;
    const resourceList = transport.sentMessages.find((message) => hasKey(message, { method: true }) && message.method === "resourceList");
    assert.ok(resourceList);
    const actions = transport.sentMessages.filter((message) => hasKey(message, { method: true }) && message.method === "dispatchAction");
    const preInitialize = actions.find((action) => action.params.action?.config?.preInitialize === true);
    const onConnected = actions.find((action) => action.params.action?.config?.onConnected === true);
    assert.ok(preInitialize);
    assert.ok(onConnected);
    assert.ok(transport.sentMessages.indexOf(resourceList) < transport.sentMessages.indexOf(preInitialize));
    assert.ok(transport.sentMessages.indexOf(preInitialize) < transport.sentMessages.indexOf(onConnected));
    transport.fireMessage({ jsonrpc: "2.0", id: resourceList.id, result: { entries: [] } });
    assert.deepStrictEqual(await request, { entries: [] });
  });
  test("rejects queued requests and drops queued notifications when initialization fails", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const request = client.resourceList(URI.file("/workspace"));
    client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { preInitialize: true } });
    assert.strictEqual(transport.sentMessages.length, 0);
    const connect = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    const expected = { code: -32001, message: "Initialization failed" };
    const requestError = assertRemoteProtocolError(request, expected);
    const connectError = assertRemoteProtocolError(connect, expected);
    transport.fireMessage({ jsonrpc: "2.0", id: initialize.id, error: expected });
    await Promise.all([requestError, connectError]);
    assert.deepStrictEqual(transport.sentMessages, [initialize]);
  });
  test("waits for initialization before returning completion trigger characters", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const completionTriggerCharacters = client.getCompletionTriggerCharacters();
    let settled = false;
    void completionTriggerCharacters.then(() => settled = true);
    await Promise.resolve();
    assert.strictEqual(settled, false);
    const connect = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [], completionTriggerCharacters: [".", "@"] }
    });
    await connect;
    assert.deepStrictEqual(await completionTriggerCharacters, [".", "@"]);
  });
  test("rejects completion trigger characters after an incompatible initialization", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const completionTriggerCharacters = assertRemoteProtocolError(client.getCompletionTriggerCharacters(), {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Protocol versions do not match"
    });
    const connect = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    const connectError = assertRemoteProtocolError(connect, {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Protocol versions do not match"
    });
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      error: { code: AhpErrorCodes.UnsupportedProtocolVersion, message: "Protocol versions do not match" }
    });
    await Promise.all([completionTriggerCharacters, connectError]);
  });
  test("maps protocol-supported create session fork and progress token", async () => {
    const { client, transport } = createClient();
    await connectClient(client, transport);
    const session = URI.parse("ahp-session:/new");
    const source = URI.parse("ahp-session:/source");
    const creation = client.createSession({
      provider: "copilot",
      session,
      fork: { session: source, turnIndex: 2, turnId: "turn-2" },
      progressToken: "progress-token"
    });
    const request = transport.sentMessages.find((message) => hasKey(message, { method: true }) && message.method === "createSession");
    assert.deepStrictEqual(request?.params, {
      channel: session.toString(),
      provider: "copilot",
      workingDirectories: void 0,
      fork: { session: source.toString(), turnId: "turn-2" },
      config: void 0,
      activeClient: void 0,
      progressToken: "progress-token"
    });
    assert.strictEqual(client.getInflightSessionCreate(session), creation);
    assert.ok(request);
    transport.fireMessage({ jsonrpc: "2.0", id: request.id, result: null });
    assert.strictEqual(await creation, session);
  });
  suite("createChat", () => {
    const sessionUri = URI.parse("ahp-session:/test");
    const chatUri = URI.parse("ahp-session:/test/chat-1");
    const sourceUri = URI.parse("ahp-session:/test/chat-0");
    test('forwards a fork source tagged with kind "fork"', async () => {
      const { client, transport } = createClient();
      const resultPromise = client.createChat(sessionUri, chatUri, { fork: { source: sourceUri, turnId: "turn-1" } });
      assert.deepStrictEqual(transport.sentMessages[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "createChat",
        params: {
          channel: sessionUri.toString(),
          chat: chatUri.toString(),
          source: { kind: ChatSourceKind.Fork, chat: sourceUri.toString(), turnId: "turn-1" }
        }
      });
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
      await resultPromise;
    });
    test('forwards a side chat (`/btw`) source tagged with kind "sideChat"', async () => {
      const { client, transport } = createClient();
      const selection = { text: "  selected text  ", responsePartId: "response-part-1" };
      const resultPromise = client.createChat(sessionUri, chatUri, { sideChat: { source: sourceUri, turnId: "turn-1", selection } });
      assert.deepStrictEqual(transport.sentMessages[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "createChat",
        params: {
          channel: sessionUri.toString(),
          chat: chatUri.toString(),
          source: { kind: ChatSourceKind.SideChat, chat: sourceUri.toString(), turnId: "turn-1", selection }
        }
      });
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
      await resultPromise;
    });
    test("omits source entirely when neither fork nor sideChat is requested", async () => {
      const { client, transport } = createClient();
      const resultPromise = client.createChat(sessionUri, chatUri);
      assert.deepStrictEqual(transport.sentMessages[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "createChat",
        params: { channel: sessionUri.toString(), chat: chatUri.toString() }
      });
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
      await resultPromise;
    });
  });
  test("preserves JSON-RPC error code and data", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.resourceRead(URI.file("/missing"));
    const data = { uri: URI.file("/missing").toString() };
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Missing resource", data } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Missing resource", data });
  });
  test("does not warn for missing file resource reads", async () => {
    const logService = new CountingLogService();
    const { client, transport } = createClient(void 0, void 0, void 0, logService);
    const resultPromise = client.resourceRead(URI.file("/workspace/src/missing.ts"));
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Content not found" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Content not found" });
    assert.strictEqual(logService.warnCount, 0);
  });
  test("warns for non-file resource read NotFound errors", async () => {
    const logService = new CountingLogService();
    const { client, transport } = createClient(void 0, void 0, void 0, logService);
    const resultPromise = client.resourceRead(URI.parse("session-db:/missing"));
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Missing snapshot" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Missing snapshot" });
    assert.strictEqual(logService.warnCount, 1);
  });
  test("warns for non-read NotFound errors", async () => {
    const logService = new CountingLogService();
    const { client, transport } = createClient(void 0, void 0, void 0, logService);
    const resultPromise = client.resourceResolve({ channel: ROOT_STATE_URI, uri: URI.file("/workspace/src/missing.ts").toString() });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Missing resource" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Missing resource" });
    assert.strictEqual(logService.warnCount, 1);
  });
  test("ignores response for unknown request id", () => {
    const { transport } = createClient();
    transport.fireMessage({ jsonrpc: "2.0", id: 99, result: null });
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("rejects all pending requests on transport close", async () => {
    const { client, transport } = createClient();
    const first = client.resourceList(URI.file("/one"));
    const second = client.resourceRead(URI.file("/two"));
    let closeCount = 0;
    disposables.add(client.onDidClose(() => closeCount++));
    const firstRejected = assertRemoteProtocolError(first, { code: -32e3, message: "Connection closed: test.example:1234" });
    const secondRejected = assertRemoteProtocolError(second, { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    transport.fireClose();
    await firstRejected;
    await secondRejected;
    assert.strictEqual(closeCount, 1);
  });
  test("rejects pending requests on dispose", async () => {
    const { client } = createClient();
    const resultPromise = client.resourceList(URI.file("/workspace"));
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection disposed: test.example:1234" });
    client.dispose();
    await rejected;
  });
  test("dispose rejection wins when transport emits close while disposing", async () => {
    const transport = disposables.add(new CloseOnDisposeProtocolTransport());
    const { client } = createClient(transport);
    const resultPromise = client.resourceList(URI.file("/workspace"));
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection disposed: test.example:1234" });
    client.dispose();
    await rejected;
  });
  test("late response after close does not complete rejected request", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.resourceList(URI.file("/workspace"));
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [] } });
    await rejected;
  });
  test("rejects requests started after transport close", async () => {
    const { client, transport } = createClient();
    transport.fireClose();
    await assertRemoteProtocolError(client.resourceList(URI.file("/workspace")), { code: -32e3, message: "Connection closed: test.example:1234" });
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("rejects requests started after dispose", async () => {
    const { client, transport } = createClient();
    client.dispose();
    await assertRemoteProtocolError(client.resourceList(URI.file("/workspace")), { code: -32e3, message: "Connection disposed: test.example:1234" });
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("liveness sends a ping when idle and force-closes after the ping ages out", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const lowLoad = { hasHighLoad: () => false };
      const { client, transport } = createClient(void 0, void 0, lowLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      await timeout(3e4);
      const pings = transport.sentMessages.filter(isPingRequest);
      assert.ok(pings.length >= 1, `expected at least 1 ping, got ${pings.length}`);
      assert.strictEqual(closeCount, 1);
      client.dispose();
    });
  });
  test("liveness keeps the connection open while pings are answered", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const lowLoad = { hasHighLoad: () => false };
      const { client, transport } = createClient(void 0, void 0, lowLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      let answered = 0;
      const dispose = mainWindow.setInterval(() => {
        for (const msg of transport.sentMessages) {
          if (isPingRequest(msg) && msg.id > answered) {
            answered = msg.id;
            transport.fireMessage({ jsonrpc: "2.0", id: msg.id, result: null });
          }
        }
      }, 1e3);
      await timeout(6e4);
      mainWindow.clearInterval(dispose);
      assert.strictEqual(closeCount, 0);
      assert.ok(answered >= 4, `expected several pings to have been answered, got ${answered}`);
      client.dispose();
    });
  });
  test("liveness is suppressed while local load is high", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const highLoad = { hasHighLoad: () => true };
      const { client } = createClient(void 0, void 0, highLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      await timeout(6e4);
      assert.strictEqual(closeCount, 0);
      client.dispose();
    });
  });
  test("liveness stops after the connection is closed", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const lowLoad = { hasHighLoad: () => false };
      const { client, transport } = createClient(void 0, void 0, lowLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      await timeout(3e4);
      assert.strictEqual(closeCount, 1, "should have force-closed once");
      const pingsAtClose = transport.sentMessages.filter(isPingRequest).length;
      await timeout(6e4);
      assert.strictEqual(closeCount, 1, "should not fire again after close");
      const pingsLater = transport.sentMessages.filter(isPingRequest).length;
      assert.strictEqual(pingsLater, pingsAtClose, "no further pings should be sent after close");
      client.dispose();
    });
  });
  test("inbound messages are dropped after close", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const { client, transport } = createClient();
      let actionCount = 0;
      disposables.add(client.onDidAction(() => actionCount++));
      const pending = client.resourceList(URI.file("/workspace"));
      const rejected = pending.catch((err2) => err2);
      await timeout(3e4);
      const err = await rejected;
      assert.ok(err instanceof ProtocolError);
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [] } });
      const lateAction = {
        type: ActionType.SessionActiveClientRemoved,
        clientId: "c1"
      };
      transport.fireMessage({
        jsonrpc: "2.0",
        method: "action",
        params: { channel: "ahp-session:/test", action: lateAction, serverSeq: 1, origin: void 0 }
      });
      assert.strictEqual(actionCount, 0, "late action notifications must be ignored after close");
      client.dispose();
    });
  });
  test("rejects connect when transport closes before connect completes", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const rejected = assertRemoteProtocolError(client.connect(), { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    transport.connectDeferred.complete();
    await rejected;
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("rejects connect when disposed before transport connect completes", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const rejected = assertRemoteProtocolError(client.connect(), { code: -32e3, message: "Connection disposed: test.example:1234" });
    client.dispose();
    await rejected;
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("initialize handshake includes protocol version and client info", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const clientInfo = agentsWindowAgentHostClientInfo;
    const { client } = createClient(transport, void 0, void 0, void 0, void 0, "renderer-client-id", clientInfo);
    const connectPromise = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    assert.strictEqual(sent.method, "initialize");
    const params = sent.params;
    assert.deepStrictEqual({
      protocolVersions: params.protocolVersions,
      clientId: params.clientId,
      clientInfo: params.clientInfo
    }, {
      // Every negotiable version is offered so an older host can negotiate down,
      // newest first so a current host still picks it.
      protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      clientId: "renderer-client-id",
      clientInfo
    });
    assert.strictEqual(params.protocolVersions[0], PROTOCOL_VERSION);
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connectPromise;
    const telemetryLevel = transport.sentMessages[1];
    assert.deepStrictEqual(telemetryLevel, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE) }
        }
      }
    });
    const editTelemetryEnabled = findRootConfigNotification(transport.sentMessages, AgentHostEditTelemetryEnabledConfigKey);
    assert.deepStrictEqual(editTelemetryEnabled, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostEditTelemetryEnabledConfigKey]: true }
        }
      }
    });
    const terminalAutoApproveEnabled = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveEnabledConfigKey);
    assert.deepStrictEqual(terminalAutoApproveEnabled, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostTerminalAutoApproveEnabledConfigKey]: true }
        }
      }
    });
    const globalAutoApproveEnabled = findRootConfigNotification(transport.sentMessages, AgentHostGlobalAutoApproveEnabledConfigKey);
    assert.deepStrictEqual(globalAutoApproveEnabled, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: false }
        }
      }
    });
    const terminalAutoApproveRules = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(terminalAutoApproveRules, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostTerminalAutoApproveRulesConfigKey]: {} }
        }
      }
    });
    const codexEnabled = findRootConfigNotification(transport.sentMessages, AgentHostCodexEnabledConfigKey);
    assert.deepStrictEqual(codexEnabled, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostCodexEnabledConfigKey]: false }
        }
      }
    });
  });
  test("forwards codex enablement on connect when the experiment-aware setting is on", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const configurationService = new TestConfigurationService({ [AgentHostCodexAgentEnabledSettingId]: true });
    const { client } = createClient(transport, void 0, void 0, void 0, configurationService);
    const connectPromise = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connectPromise;
    const codexEnabled = findRootConfigNotification(transport.sentMessages, AgentHostCodexEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(codexEnabled), { [AgentHostCodexEnabledConfigKey]: true });
  });
  test("forwards system proxy enablement on connect and when the setting changes", async () => {
    const configurationService = new TestConfigurationService();
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const systemProxyEnabled = findRootConfigNotification(transport.sentMessages, AgentHostSystemProxyEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(systemProxyEnabled), { [AgentHostSystemProxyEnabledConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(AgentHostSystemProxyEnabledSettingId, false);
    fireConfigurationChange(configurationService, AgentHostSystemProxyEnabledSettingId);
    const updatedSystemProxyEnabled = findLastRootConfigNotification(transport.sentMessages, AgentHostSystemProxyEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(updatedSystemProxyEnabled), { [AgentHostSystemProxyEnabledConfigKey]: false });
  });
  test("forwards Copilot multi-root enablement on connect and when the setting changes", async () => {
    const configurationService = new TestConfigurationService({ [AgentHostCopilotMultiRootEnabledSettingId]: true });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const multiRootEnabled = findRootConfigNotification(transport.sentMessages, AgentHostCopilotMultiRootEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(multiRootEnabled), { [AgentHostCopilotMultiRootEnabledConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(AgentHostCopilotMultiRootEnabledSettingId, false);
    fireConfigurationChange(configurationService, AgentHostCopilotMultiRootEnabledSettingId);
    const updatedMultiRootEnabled = findLastRootConfigNotification(transport.sentMessages, AgentHostCopilotMultiRootEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(updatedMultiRootEnabled), { [AgentHostCopilotMultiRootEnabledConfigKey]: false });
  });
  test("forwards Claude multi-root enablement on connect and when the setting changes", async () => {
    const configurationService = new TestConfigurationService({ [AgentHostClaudeMultiRootEnabledSettingId]: true });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const multiRootEnabled = findRootConfigNotification(transport.sentMessages, AgentHostClaudeMultiRootEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(multiRootEnabled), { [AgentHostClaudeMultiRootEnabledConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(AgentHostClaudeMultiRootEnabledSettingId, false);
    fireConfigurationChange(configurationService, AgentHostClaudeMultiRootEnabledSettingId);
    const updatedMultiRootEnabled = findLastRootConfigNotification(transport.sentMessages, AgentHostClaudeMultiRootEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(updatedMultiRootEnabled), { [AgentHostClaudeMultiRootEnabledConfigKey]: false });
  });
  test("forwards Codex multi-root enablement on connect and when the setting changes", async () => {
    const configurationService = new TestConfigurationService({ [AgentHostCodexMultiRootEnabledSettingId]: true });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const multiRootEnabled = findRootConfigNotification(transport.sentMessages, AgentHostCodexMultiRootEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(multiRootEnabled), { [AgentHostCodexMultiRootEnabledConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(AgentHostCodexMultiRootEnabledSettingId, false);
    fireConfigurationChange(configurationService, AgentHostCodexMultiRootEnabledSettingId);
    const updatedMultiRootEnabled = findLastRootConfigNotification(transport.sentMessages, AgentHostCodexMultiRootEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(updatedMultiRootEnabled), { [AgentHostCodexMultiRootEnabledConfigKey]: false });
  });
  test("forwards auto-reply on connect and when the setting changes", async () => {
    const configurationService = new TestConfigurationService({ [AUTO_REPLY_SETTING_ID]: true });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const autoReplyEnabled = findRootConfigNotification(transport.sentMessages, AgentHostAutoReplyEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(autoReplyEnabled), { [AgentHostAutoReplyEnabledConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(AUTO_REPLY_SETTING_ID, false);
    fireConfigurationChange(configurationService, AUTO_REPLY_SETTING_ID);
    const updatedAutoReplyEnabled = findLastRootConfigNotification(transport.sentMessages, AgentHostAutoReplyEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(updatedAutoReplyEnabled), { [AgentHostAutoReplyEnabledConfigKey]: false });
  });
  test("forwards the repo-info telemetry debug switch on connect and change", async () => {
    const configurationService = new TestConfigurationService({ [DISABLE_REPO_INFO_TELEMETRY_SETTING_ID]: true });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const disabled = findRootConfigNotification(transport.sentMessages, AgentHostDisableRepoInfoTelemetryConfigKey);
    assert.deepStrictEqual(getRootConfig(disabled), { [AgentHostDisableRepoInfoTelemetryConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, false);
    fireConfigurationChange(configurationService, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID);
    const enabled = findLastRootConfigNotification(transport.sentMessages, AgentHostDisableRepoInfoTelemetryConfigKey);
    assert.deepStrictEqual(getRootConfig(enabled), { [AgentHostDisableRepoInfoTelemetryConfigKey]: false });
  });
  test("forwards edit telemetry on connect and change", async () => {
    const configurationService = new TestConfigurationService({ [EDIT_TELEMETRY_ENABLED_SETTING_ID]: false });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const disabled = findRootConfigNotification(transport.sentMessages, AgentHostEditTelemetryEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(disabled), { [AgentHostEditTelemetryEnabledConfigKey]: false });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(EDIT_TELEMETRY_ENABLED_SETTING_ID, true);
    fireConfigurationChange(configurationService, EDIT_TELEMETRY_ENABLED_SETTING_ID);
    const enabled = findLastRootConfigNotification(transport.sentMessages, AgentHostEditTelemetryEnabledConfigKey);
    assert.deepStrictEqual(getRootConfig(enabled), { [AgentHostEditTelemetryEnabledConfigKey]: true });
  });
  test("forwards terminal auto-approve rules on connect", async () => {
    const configurationService = new TestConfigurationService({
      [TERMINAL_AUTO_APPROVE_SETTING_ID]: {
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      }
    });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const terminalAutoApproveRules = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
      [AgentHostTerminalAutoApproveRulesConfigKey]: {
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      }
    });
  });
  test("redispatches terminal auto-approve rules when the rule setting changes", async () => {
    const configurationService = new TestConfigurationService();
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID, { python: true });
    fireConfigurationChange(configurationService, TERMINAL_AUTO_APPROVE_SETTING_ID);
    const terminalAutoApproveRules = findLastRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
      [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true }
    });
  });
  test("redispatches terminal auto-approve rules when ignored defaults change", async () => {
    const configurationService = new TerminalAutoApproveConfigurationService({
      [TERMINAL_AUTO_APPROVE_SETTING_ID]: { echo: true, python: true }
    }, {
      default: { value: { echo: true } },
      user: { value: { python: true } }
    });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, true);
    fireConfigurationChange(configurationService, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID);
    const terminalAutoApproveRules = findLastRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
      [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true }
    });
  });
  test("rejects normal traffic but retains the transport for an incompatible protocol upgrade", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const connectPromise = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      error: {
        code: AhpErrorCodes.UnsupportedProtocolVersion,
        message: "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
        data: { supportedVersions: ["0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
      }
    });
    await assertRemoteProtocolError(connectPromise, {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
      data: { supportedVersions: ["0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    });
    assert.strictEqual(client.connectionState, AgentHostClientState.Incompatible);
    await assertRemoteProtocolError(client.resourceList(URI.file("/workspace")), {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
      data: { supportedVersions: ["0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    });
    client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { dropped: true } });
    assert.strictEqual(transport.sentMessages.length, 1);
    const upgrade = client.triggerVscodeUpgrade("_vscodeUpgrade");
    const request = transport.sentMessages[1];
    assert.deepStrictEqual(request, {
      jsonrpc: "2.0",
      id: 2,
      method: "_vscodeUpgrade",
      params: {}
    });
    transport.fireMessage({ jsonrpc: "2.0", id: request.id, result: { ok: true, upgradeStarted: true } });
    assert.deepStrictEqual(await upgrade, { ok: true, upgradeStarted: true });
    transport.fireClose();
    assert.strictEqual(client.connectionState, AgentHostClientState.Closed);
  });
  test("sends shutdown as a JSON-RPC request shape", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.shutdown();
    assert.deepStrictEqual(transport.sentMessages[0], {
      jsonrpc: "2.0",
      id: 1,
      method: "shutdown",
      params: void 0
    });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
    await resultPromise;
  });
  test("rejects shutdown with structured JSON-RPC error", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.shutdown();
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.TurnInProgress, message: "Turn in progress" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.TurnInProgress, message: "Turn in progress" });
  });
  test("ping sends a JSON-RPC request and resolves on response", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.ping();
    const sent = transport.sentMessages[0];
    assert.strictEqual(sent.method, "ping");
    assert.strictEqual(sent.id, 1);
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
    assert.strictEqual(await resultPromise, void 0);
  });
  test("ping rejects with ProtocolError when the connection closes", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.ping();
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    await rejected;
  });
  suite("reverse permission gating", () => {
    test("remote local address does not receive trusted local access", async () => {
      const permissionService = createResourceServiceStub({
        granted: (identity) => identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
      });
      const { client, transport } = createClientForIdentity("local", void 0, permissionService);
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 41, method: "resourceRead", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual({
        address: client.address,
        response: transport.sentMessages.pop()
      }, {
        address: "local",
        response: {
          jsonrpc: "2.0",
          id: 41,
          error: {
            code: AhpErrorCodes.PermissionDenied,
            message: `Access to ${uri} is not granted.`,
            data: { request: { channel: ROOT_STATE_URI, uri, read: true } }
          }
        }
      });
    });
    test("trusted local identity retains local resource access", async () => {
      const permissionService = createResourceServiceStub({
        granted: (identity) => identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
        readBytes: VSBuffer.fromString("trusted")
      });
      const { client, transport } = createClientForIdentity(LOCAL_AGENT_HOST_RESOURCE_IDENTITY, void 0, permissionService);
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 40, method: "resourceRead", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual({
        address: client.address,
        response: transport.sentMessages.pop()
      }, {
        address: "local",
        response: {
          jsonrpc: "2.0",
          id: 40,
          result: { data: "dHJ1c3RlZA==", encoding: ContentEncoding.Base64 }
        }
      });
    });
    test("resourceRead is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 42, method: "resourceRead", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 42,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, read: true } }
        }
      });
    });
    test("resourceWrite is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 7, method: "resourceWrite", params: { channel: "ahp-root://", uri, data: "aGVsbG8=", encoding: ContentEncoding.Base64 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 7,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, write: true } }
        }
      });
    });
    test("resourceList is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 5, method: "resourceList", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 5,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, read: true } }
        }
      });
    });
    test("resourceDelete is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 8, method: "resourceDelete", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 8,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, write: true } }
        }
      });
    });
    test("resourceMove is denied when destination lacks write access", async () => {
      const sourceUri = URI.file("/grant/foo").toString();
      const destUri = URI.file("/no-grant/bar").toString();
      const stub = createResourceServiceStub({
        granted: (_addr, uri) => uri.toString() === sourceUri
      });
      const { transport } = createClient(void 0, stub);
      transport.fireMessage({ jsonrpc: "2.0", id: 9, method: "resourceMove", params: { channel: "ahp-root://", source: sourceUri, destination: destUri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 9,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${destUri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri: destUri, write: true } }
        }
      });
    });
    test("reverse resourceRequest delegates to permission service and replies with empty result", async () => {
      let lastRequest;
      const stub = createResourceServiceStub({
        granted: () => false,
        onRequest: async (address, params) => {
          lastRequest = { address, params };
        }
      });
      const { transport } = createClient(void 0, stub);
      const uri = URI.file("/etc/foo").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 11, method: "resourceRequest", params: { channel: "ahp-root://", uri, read: true } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(lastRequest, { address: "test.example:1234", params: { channel: "ahp-root://", uri, read: true } });
      assert.deepStrictEqual(transport.sentMessages.pop(), { jsonrpc: "2.0", id: 11, result: {} });
    });
    test("reverse resourceRequest replies with PermissionDenied on cancellation", async () => {
      const stub = createResourceServiceStub({
        granted: () => false,
        onRequest: async () => {
          throw new CancellationError();
        }
      });
      const { transport } = createClient(void 0, stub);
      const uri = URI.file("/etc/foo").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 12, method: "resourceRequest", params: { channel: "ahp-root://", uri, read: true } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 12,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: "Access to the requested resource is not granted.",
          data: void 0
        }
      });
    });
  });
  suite("implicit grants for outgoing actions", () => {
    function createCapturingPermissionService() {
      const calls = [];
      const service = createResourceServiceStub({
        onGrantImplicitRead: (address, uri) => calls.push({ address, uri })
      });
      return { service, calls };
    }
    test("SessionActiveClientSet dispatches implicit reads for each customization", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      client.dispatch(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo", enabled: true },
            { type: CustomizationType.Plugin, id: customizationId("file:///other/bar"), uri: "file:///other/bar", name: "Bar", enabled: true }
          ]
        }
      });
      assert.deepStrictEqual(
        calls.map((c) => ({ address: c.address, uri: c.uri.toString() })),
        [
          { address: "test.example:1234", uri: "file:///plugins" },
          { address: "test.example:1234", uri: "file:///other" }
        ]
      );
    });
    test("ChatTurnStarted grants attachment access before reverse resourceRead", async () => {
      const granted = /* @__PURE__ */ new Set();
      const attachmentUri = URI.file("/attachments/example.txt");
      const service = createResourceServiceStub({
        granted: (_address, uri, mode) => mode === AgentHostPermissionMode.Read && granted.has(uri.toString()),
        onGrantImplicitRead: (_address, uri) => granted.add(uri.toString()),
        readBytes: VSBuffer.fromString("attachment")
      });
      const { client, transport } = createClient(void 0, service);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2026-07-23T00:00:00.000Z",
        message: {
          text: "Review this file",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Resource,
            uri: attachmentUri.toString(),
            label: "example.txt"
          }]
        }
      };
      client.dispatch("copilot-chat:/test", action);
      transport.fireMessage({
        jsonrpc: "2.0",
        id: 42,
        method: "resourceRead",
        params: { channel: ROOT_STATE_URI, uri: attachmentUri.toString() }
      });
      await flushMicrotasks();
      assert.deepStrictEqual(transport.sentMessages.at(-1), {
        jsonrpc: "2.0",
        id: 42,
        result: { data: "YXR0YWNobWVudA==", encoding: ContentEncoding.Base64 }
      });
    });
    test("ChatPendingMessageSet grants resource attachments only", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      client.dispatch("copilot-chat:/test", {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "queued-1",
        message: {
          text: "Review these attachments",
          origin: { kind: MessageKind.User },
          attachments: [
            { type: MessageAttachmentKind.Resource, uri: "file:///attachments/queued.txt", label: "queued.txt" },
            { type: MessageAttachmentKind.EmbeddedResource, data: "", contentType: "text/plain", label: "inline.txt" }
          ]
        }
      });
      assert.deepStrictEqual(calls.map((call) => call.uri.toString()), ["file:///attachments/queued.txt"]);
    });
    test("multiple customizations in the same directory dedupe to one grant", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      client.dispatch(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo", enabled: true },
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/bar"), uri: "file:///plugins/bar", name: "Bar", enabled: true }
          ]
        }
      });
      assert.deepStrictEqual(
        calls.map((c) => c.uri.toString()),
        ["file:///plugins"]
      );
    });
    test("repeat dispatch dedupes per URI", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      const action = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo", enabled: true }
          ]
        }
      };
      client.dispatch(sessionUri.toString(), action);
      client.dispatch(sessionUri.toString(), action);
      assert.strictEqual(calls.length, 1);
    });
    test("connection close disposes implicit read grants", async () => {
      const didGrant = new DeferredPromise();
      const revoked = [];
      const service = createResourceServiceStub({
        onGrantImplicitRead: () => didGrant.complete(),
        onRevokeImplicitRead: (_address, uri) => revoked.push(uri.toString())
      });
      const { client, transport } = createClient(void 0, service);
      client.dispatch("copilot-chat:/test", {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "queued-1",
        message: {
          text: "Review this attachment",
          origin: { kind: MessageKind.User },
          attachments: [
            { type: MessageAttachmentKind.Resource, uri: "file:///attachments/queued.txt", label: "queued.txt" }
          ]
        }
      });
      await didGrant.p;
      transport.fireClose();
      assert.deepStrictEqual(revoked, ["file:///attachments/queued.txt"]);
    });
    test("active client removal does not crash", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      client.dispatch(sessionUri.toString(), {
        type: ActionType.SessionActiveClientRemoved,
        clientId: "c1"
      });
      assert.strictEqual(calls.length, 0);
    });
    test("createSession with active-client customizations grants implicit reads", async () => {
      const { service, calls } = createCapturingPermissionService();
      const { client, transport } = createClient(void 0, service);
      void client.createSession({
        provider: "copilot",
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo", enabled: true }
          ]
        }
      });
      const sent = transport.sentMessages.find(
        (m) => "method" in m && m.method === "createSession"
      );
      assert.ok(sent);
      transport.fireMessage({ jsonrpc: "2.0", id: sent.id, result: null });
      assert.deepStrictEqual(
        calls.map((c) => c.uri.toString()),
        ["file:///plugins"]
      );
    });
  });
  suite("soft reconnect (transport factory)", () => {
    function findRequest(transport, method) {
      return transport.sentMessages.find(
        (m) => "method" in m && m.method === method && "id" in m
      );
    }
    function findNotification(transport, method) {
      return transport.sentMessages.find(
        (m) => "method" in m && m.method === method && !("id" in m)
      );
    }
    function findDispatchAction(transport, actionType) {
      return transport.sentMessages.find(
        (m) => "method" in m && m.method === "dispatchAction" && !("id" in m) && m.params?.action?.type === actionType
      );
    }
    async function waitForReconnecting(client) {
      if (client.connectionState === AgentHostClientState.Reconnecting) {
        return;
      }
      await Event.toPromise(Event.filter(client.onDidChangeConnectionState, (s) => s === AgentHostClientState.Reconnecting));
    }
    async function waitForRequest(transport, method) {
      while (true) {
        const req = findRequest(transport, method);
        if (req) {
          return req;
        }
        await Promise.resolve();
      }
    }
    async function waitForTransport(transports, index) {
      while (transports.length <= index) {
        await new Promise((r) => setTimeout(r, 25));
      }
      return transports[index];
    }
    function createFactoryClient(permissionService = createPermissionService(), clientInfo) {
      const transports = [];
      const factory = () => {
        const t = disposables.add(new TestClientProtocolTransport());
        transports.push(t);
        return t;
      };
      const client = disposables.add(new RemoteAgentHostProtocolClient(
        "test.example:1234",
        factory,
        void 0,
        void 0,
        clientInfo,
        new NullLogService(),
        permissionService,
        new TestConfigurationService()
      ));
      return { client, transports };
    }
    async function completeHandshake(transport, connectPromise) {
      transport.connectDeferred.complete();
      while (findRequest(transport, "initialize") === void 0) {
        await Promise.resolve();
      }
      const init = findRequest(transport, "initialize");
      transport.fireMessage({
        jsonrpc: "2.0",
        id: init.id,
        result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 5, snapshots: [] }
      });
      await connectPromise;
    }
    test("reuses clientId across transport reconnects", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const originalClientId = client.clientId;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        const params = reconnect.params;
        assert.strictEqual(params.clientId, originalClientId);
        assert.strictEqual(params.lastSeenServerSeq, 5);
        assert.ok(Array.isArray(params.subscriptions));
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        client.dispose();
      });
    });
    test("falls back to initialize with client info when the server forgot the client", async function() {
      this.timeout(1e4);
      const { client, transports } = createFactoryClient(createPermissionService(), agentsWindowAgentHostClientInfo);
      try {
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          error: { code: AhpErrorCodes.NotFound, message: "Reconnect client not found" }
        });
        const initialize = await waitForRequest(reconnectTransport, "initialize");
        assert.deepStrictEqual(initialize.params.clientInfo, agentsWindowAgentHostClientInfo);
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: initialize.id,
          result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
        });
        await flushMicrotasks();
        assert.strictEqual(client.connectionState, AgentHostClientState.Connected);
      } finally {
        client.dispose();
      }
    });
    test("replays pending optimistic actions after reconnect", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        const action = {
          type: ActionType.SessionTitleChanged,
          title: "Renamed by user"
        };
        client.dispatch(sessionUri.toString(), action);
        const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
        assert.ok(initialDispatch, "optimistic dispatch should reach the original transport");
        const initialSeq = initialDispatch.params.clientSeq;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        const replayed = findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged);
        assert.ok(replayed, "pending optimistic action should be re-sent after reconnect");
        assert.strictEqual(replayed.params.clientSeq, initialSeq, "replayed dispatch must reuse the original clientSeq");
        subRef.dispose();
        client.dispose();
      });
    });
    test("attachment grant remains available when a pending turn is replayed after reconnect", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const attachmentUri = URI.file("/attachments/replayed.txt");
        const granted = /* @__PURE__ */ new Set();
        const permissionService = createResourceServiceStub({
          granted: (_address, uri, mode) => mode === AgentHostPermissionMode.Read && granted.has(uri.toString()),
          onGrantImplicitRead: (_address, uri) => granted.add(uri.toString()),
          readBytes: VSBuffer.fromString("replayed")
        });
        const { client, transports } = createFactoryClient(permissionService);
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const chatUri = URI.parse("copilot-chat:/test-chat");
        const subRef = client.getSubscription(StateComponents.Chat, chatUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        client.dispatch(chatUri.toString(), {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-1",
          startedAt: "2026-07-23T00:00:00.000Z",
          message: {
            text: "Review this file",
            origin: { kind: MessageKind.User },
            attachments: [{
              type: MessageAttachmentKind.Resource,
              uri: attachmentUri.toString(),
              label: "replayed.txt"
            }]
          }
        });
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        assert.ok(findDispatchAction(reconnectTransport, ActionType.ChatTurnStarted));
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: 42,
          method: "resourceRead",
          params: { channel: ROOT_STATE_URI, uri: attachmentUri.toString() }
        });
        await flushMicrotasks();
        assert.deepStrictEqual(reconnectTransport.sentMessages.at(-1), {
          jsonrpc: "2.0",
          id: 42,
          result: { data: "cmVwbGF5ZWQ=", encoding: ContentEncoding.Base64 }
        });
        subRef.dispose();
        client.dispose();
      });
    });
    test("skips replay when server already echoed the action in the replay buffer", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        const action = {
          type: ActionType.SessionTitleChanged,
          title: "Echoed back"
        };
        client.dispatch(sessionUri.toString(), action);
        const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
        const initialSeq = initialDispatch.params.clientSeq;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Replay,
            actions: [{
              channel: sessionUri.toString(),
              action,
              serverSeq: 6,
              origin: { clientId: client.clientId, clientSeq: initialSeq },
              rejectionReason: void 0
            }],
            missing: []
          }
        });
        await flushMicrotasks();
        assert.strictEqual(
          findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged),
          void 0,
          "action echoed back via replay buffer must not be re-sent"
        );
        subRef.dispose();
        client.dispose();
      });
    });
    test("outgoing requests wait for reconnect to complete", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        const inFlight = client.resourceList(URI.file("/workspace")).catch((err) => err);
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        assert.strictEqual(
          findRequest(reconnectTransport, "resourceList"),
          void 0,
          "request must NOT be sent before reconnect completes"
        );
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        const resourceList = await waitForRequest(reconnectTransport, "resourceList");
        reconnectTransport.fireMessage({ jsonrpc: "2.0", id: resourceList.id, result: { entries: [] } });
        const value = await inFlight;
        assert.deepStrictEqual(value, { entries: [] });
        client.dispose();
      });
    });
    test("rejected action echoed in replay buffer is not applied to confirmed state", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { summary: { title: "Original" }, turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        const action = {
          type: ActionType.SessionTitleChanged,
          title: "Rejected change"
        };
        client.dispatch(sessionUri.toString(), action);
        const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
        const initialSeq = initialDispatch.params.clientSeq;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Replay,
            actions: [{
              channel: sessionUri.toString(),
              action,
              serverSeq: 6,
              origin: { clientId: client.clientId, clientSeq: initialSeq },
              rejectionReason: "unauthorized"
            }],
            missing: []
          }
        });
        await flushMicrotasks();
        const sessionState = subRef.object.verifiedValue;
        assert.ok(sessionState, "session state should be hydrated");
        assert.strictEqual(
          sessionState.summary.title,
          "Original",
          "rejected action must not have been applied to confirmed state"
        );
        assert.strictEqual(
          findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged),
          void 0,
          "rejected action must not be re-dispatched"
        );
        subRef.dispose();
        client.dispose();
      });
    });
    test("snapshot reconnect result reseats the root state", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Snapshot,
            snapshots: [{
              resource: ROOT_STATE_URI,
              state: { agents: [{ provider: "copilot", displayName: "Copilot", models: [], tools: [] }], activeSessions: 0, terminals: [] },
              fromSeq: 42
            }]
          }
        });
        await flushMicrotasks();
        const root = client.rootState.value;
        assert.ok(root && !(root instanceof Error), "root state should be hydrated from snapshot");
        assert.strictEqual(root.agents[0]?.provider, "copilot");
        client.dispose();
      });
    });
    test("transport drop during reconnect RPC re-schedules instead of hanging", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const attempt1 = await waitForTransport(transports, 1);
        attempt1.connectDeferred.complete();
        await waitForRequest(attempt1, "reconnect");
        attempt1.fireClose();
        const attempt2 = await waitForTransport(transports, 2);
        attempt2.connectDeferred.complete();
        const reconnect2 = await waitForRequest(attempt2, "reconnect");
        attempt2.fireMessage({
          jsonrpc: "2.0",
          id: reconnect2.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        assert.strictEqual(
          client.connectionState,
          AgentHostClientState.Connected,
          "client must recover to Connected after a mid-reconnect drop"
        );
        client.dispose();
      });
    });
    test("non-session dispatch issued during reconnect rides retries until success", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const terminalUri = URI.parse("agenthost-terminal:/term-1");
        client.dispatch(terminalUri.toString(), {
          type: ActionType.TerminalInput,
          data: "echo hello\n"
        });
        const attempt1 = await waitForTransport(transports, 1);
        attempt1.connectDeferred.error(new Error("connect failed"));
        const attempt2 = await waitForTransport(transports, 2);
        attempt2.connectDeferred.complete();
        const reconnect2 = await waitForRequest(attempt2, "reconnect");
        attempt2.fireMessage({
          jsonrpc: "2.0",
          id: reconnect2.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        const dispatched = findNotification(attempt2, "dispatchAction");
        assert.ok(dispatched, "terminal dispatch must ride the failed attempt through to the next successful one");
        client.dispose();
      });
    });
    test("request issued during reconnect rides retries until success", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const inFlight = client.resourceList(URI.file("/workspace")).catch((err) => err);
        const attempt1 = await waitForTransport(transports, 1);
        attempt1.connectDeferred.error(new Error("connect failed"));
        const attempt2 = await waitForTransport(transports, 2);
        assert.strictEqual(
          findRequest(attempt2, "resourceList"),
          void 0,
          "request must not slip through to the new transport before its handshake completes"
        );
        attempt2.connectDeferred.complete();
        const reconnect2 = await waitForRequest(attempt2, "reconnect");
        attempt2.fireMessage({
          jsonrpc: "2.0",
          id: reconnect2.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        const resourceList = await waitForRequest(attempt2, "resourceList");
        attempt2.fireMessage({ jsonrpc: "2.0", id: resourceList.id, result: { entries: [] } });
        const value = await inFlight;
        assert.deepStrictEqual(
          value,
          { entries: [] },
          "request must resolve once a later reconnect attempt succeeds"
        );
        client.dispose();
      });
    });
    test("_sendExtensionRequest waits for the reconnect gate", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const shutdown = client.shutdown().catch((err) => err);
        const reconnectTransport = await waitForTransport(transports, 1);
        assert.strictEqual(
          findRequest(reconnectTransport, "shutdown"),
          void 0,
          "shutdown extension request must NOT be sent before reconnect completes"
        );
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        const shutdownReq = await waitForRequest(reconnectTransport, "shutdown");
        reconnectTransport.fireMessage({ jsonrpc: "2.0", id: shutdownReq.id, result: null });
        await shutdown;
        client.dispose();
      });
    });
    test("watchdog dead-transport detection triggers soft reconnect", async function() {
      this.timeout(6e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const pending = client.resourceList(URI.file("/workspace")).catch((err2) => err2);
        await timeout(3e4);
        assert.strictEqual(
          client.connectionState,
          AgentHostClientState.Reconnecting,
          "watchdog must drive the client into Reconnecting via soft reconnect rather than firing onDidClose"
        );
        const err = await pending;
        assert.ok(err instanceof ProtocolError);
        assert.match(err.message, /Connection appears dead/);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFN0YXRlLCBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUsIEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIEFnZW50SG9zdFJlc291cmNlUGVybWlzc2lvbkVycm9yLCBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLCBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCB0eXBlIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRlbnRFbmNvZGluZywgUmVjb25uZWN0UmVzdWx0VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDaGF0U291cmNlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGF0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFocEVycm9yQ29kZXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvZXJyb3JzLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04sIFNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OUyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdFR1cm5TdGFydGVkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3RpdmVDbGllbnRTZXRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWRBY3Rpb24sIHR5cGUgU2Vzc2lvblRpdGxlQ2hhbmdlZEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbEVycm9yLCB0eXBlIEFocFNlcnZlck5vdGlmaWNhdGlvbiwgdHlwZSBKc29uUnBjTm90aWZpY2F0aW9uLCB0eXBlIEpzb25ScGNSZXF1ZXN0LCB0eXBlIEpzb25ScGNSZXNwb25zZSwgdHlwZSBQcm90b2NvbE1lc3NhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQsIE1lc3NhZ2VLaW5kLCBQZW5kaW5nTWVzc2FnZUtpbmQsIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcywgUk9PVF9TVEFURV9VUkksIFNlc3Npb25TdGF0dXMsIFN0YXRlQ29tcG9uZW50cywgY3VzdG9taXphdGlvbklkLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNsaWVudFRyYW5zcG9ydCwgSVByb3RvY29sVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkLCBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RDb2RleEVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleSwgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbENvbmZpZ0tleSwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleSwgQVVUT19SRVBMWV9TRVRUSU5HX0lELCBESVNBQkxFX1JFUE9fSU5GT19URUxFTUVUUllfU0VUVElOR19JRCwgRURJVF9URUxFTUVUUllfRU5BQkxFRF9TRVRUSU5HX0lELCB0ZWxlbWV0cnlMZXZlbFRvQWdlbnRIb3N0Q29uZmlnVmFsdWUsIFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lELCBURVJNSU5BTF9JR05PUkVfREVGQVVMVF9BVVRPX0FQUFJPVkVfUlVMRVNfU0VUVElOR19JRCwgdHlwZSBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgSW1wbGVtZW50YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5cbnR5cGUgUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlID0gUHJvdG9jb2xNZXNzYWdlIHwgQWhwU2VydmVyTm90aWZpY2F0aW9uIHwgSnNvblJwY05vdGlmaWNhdGlvbiB8IEpzb25ScGNSZXNwb25zZSB8IEpzb25ScGNSZXF1ZXN0O1xudHlwZSBSb290Q29uZmlnVmFsdWUgPSBib29sZWFuIHwgc3RyaW5nIHwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzIHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSVRlc3RSb290Q29uZmlnTm90aWZpY2F0aW9uUGFyYW1zIHtcblx0cmVhZG9ubHkgYWN0aW9uPzoge1xuXHRcdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgY29uZmlnPzogUmVjb3JkPHN0cmluZywgUm9vdENvbmZpZ1ZhbHVlPjtcblx0fTtcbn1cblxuZnVuY3Rpb24gaXNQaW5nUmVxdWVzdChtc2c6IFByb3RvY29sVHJhbnNwb3J0TWVzc2FnZSk6IG1zZyBpcyBKc29uUnBjUmVxdWVzdCAmIHsgbWV0aG9kOiAncGluZycgfSB7XG5cdHJldHVybiBoYXNLZXkobXNnLCB7IG1ldGhvZDogdHJ1ZSwgaWQ6IHRydWUgfSkgJiYgbXNnLm1ldGhvZCA9PT0gJ3BpbmcnO1xufVxuXG4vKipcbiAqIExvY2F0ZSB0aGUgYGRpc3BhdGNoQWN0aW9uYCBub3RpZmljYXRpb24gdGhhdCBmb3J3YXJkcyBhIHBhcnRpY3VsYXIgcm9vdFxuICogY29uZmlnIGtleS4gVGhlIGNvbm5lY3QgZmxvdyBzZW5kcyBzZXZlcmFsIGBSb290Q29uZmlnQ2hhbmdlZGAgbm90aWZpY2F0aW9uc1xuICogKHRlbGVtZXRyeSwgc2Vzc2lvbiBzeW5jLCB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUpLCBzbyBtYXRjaGluZyBvbiB0aGUgY29uZmlnXG4gKiBrZXkgaXMgbW9yZSByb2J1c3QgdGhhbiBpbmRleGluZyBpbnRvIGBzZW50TWVzc2FnZXNgIGJ5IHBvc2l0aW9uLlxuICovXG5mdW5jdGlvbiBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbihtZXNzYWdlczogcmVhZG9ubHkgUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlW10sIGNvbmZpZ0tleTogc3RyaW5nKTogSnNvblJwY05vdGlmaWNhdGlvbiB7XG5cdGNvbnN0IG1hdGNoID0gbWVzc2FnZXMuZmluZCgobXNnKTogbXNnIGlzIEpzb25ScGNOb3RpZmljYXRpb24gPT4ge1xuXHRcdGlmICghaGFzS2V5KG1zZywgeyBtZXRob2Q6IHRydWUgfSkgfHwgbXNnLm1ldGhvZCAhPT0gJ2Rpc3BhdGNoQWN0aW9uJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJhbXMgPSAobXNnIGFzIEpzb25ScGNOb3RpZmljYXRpb24pLnBhcmFtcyBhcyBJVGVzdFJvb3RDb25maWdOb3RpZmljYXRpb25QYXJhbXMgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHBhcmFtcz8uYWN0aW9uPy50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkICYmICEhcGFyYW1zLmFjdGlvbi5jb25maWcgJiYgY29uZmlnS2V5IGluIHBhcmFtcy5hY3Rpb24uY29uZmlnO1xuXHR9KTtcblx0YXNzZXJ0Lm9rKG1hdGNoLCBgRXhwZWN0ZWQgYSBSb290Q29uZmlnQ2hhbmdlZCBub3RpZmljYXRpb24gY2FycnlpbmcgJyR7Y29uZmlnS2V5fSdgKTtcblx0cmV0dXJuIG1hdGNoO1xufVxuXG5mdW5jdGlvbiBnZXRSb290Q29uZmlnKG5vdGlmaWNhdGlvbjogSnNvblJwY05vdGlmaWNhdGlvbik6IFJlY29yZDxzdHJpbmcsIFJvb3RDb25maWdWYWx1ZT4ge1xuXHRjb25zdCBwYXJhbXMgPSBub3RpZmljYXRpb24ucGFyYW1zIGFzIElUZXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvblBhcmFtcyB8IHVuZGVmaW5lZDtcblx0YXNzZXJ0Lm9rKHBhcmFtcz8uYWN0aW9uPy5jb25maWcpO1xuXHRyZXR1cm4gcGFyYW1zLmFjdGlvbi5jb25maWc7XG59XG5cbmZ1bmN0aW9uIGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbihtZXNzYWdlczogcmVhZG9ubHkgUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlW10sIGNvbmZpZ0tleTogc3RyaW5nKTogSnNvblJwY05vdGlmaWNhdGlvbiB7XG5cdHJldHVybiBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbihbLi4ubWVzc2FnZXNdLnJldmVyc2UoKSwgY29uZmlnS2V5KTtcbn1cblxuY2xhc3MgVGVzdFByb3RvY29sVHJhbnNwb3J0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcm90b2NvbFRyYW5zcG9ydCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb3RvY29sTWVzc2FnZT4oKSk7XG5cdHJlYWRvbmx5IG9uTWVzc2FnZSA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ2xvc2UgPSB0aGlzLl9vbkNsb3NlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IHNlbnRNZXNzYWdlczogUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlW10gPSBbXTtcblxuXHRzZW5kKG1lc3NhZ2U6IFByb3RvY29sVHJhbnNwb3J0TWVzc2FnZSk6IHZvaWQge1xuXHRcdHRoaXMuc2VudE1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRmaXJlTWVzc2FnZShtZXNzYWdlOiBQcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZShtZXNzYWdlKTtcblx0fVxuXG5cdGZpcmVDbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkNsb3NlLmZpcmUoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQgZXh0ZW5kcyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQgaW1wbGVtZW50cyBJQ2xpZW50VHJhbnNwb3J0IHtcblx0cmVhZG9ubHkgY29ubmVjdERlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29ubmVjdERlZmVycmVkLnA7XG5cdH1cbn1cblxuY2xhc3MgQ2xvc2VPbkRpc3Bvc2VQcm90b2NvbFRyYW5zcG9ydCBleHRlbmRzIFRlc3RQcm90b2NvbFRyYW5zcG9ydCB7XG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5maXJlQ2xvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQ291bnRpbmdMb2dTZXJ2aWNlIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXHR3YXJuQ291bnQgPSAwO1xuXG5cdG92ZXJyaWRlIHdhcm4oX21lc3NhZ2U6IHN0cmluZywgLi4uX2FyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMud2FybkNvdW50Kys7XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxBdXRvQXBwcm92ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgfCBib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEF1dG9BcHByb3ZlSW5zcGVjdFZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+LFxuXHQpIHtcblx0XHRzdXBlcihjb25maWd1cmF0aW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIGluc3BlY3Q8VD4oa2V5OiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+IHtcblx0XHRpZiAoa2V5ID09PSBURVJNSU5BTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsQXV0b0FwcHJvdmVJbnNwZWN0VmFsdWUgYXMgSUNvbmZpZ3VyYXRpb25WYWx1ZTxUPjtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmluc3BlY3Q8VD4oa2V5KTtcblx0fVxufVxuXG5zdWl0ZSgnUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoYWxsb3cgPSB0cnVlKTogSUFnZW50SG9zdFJlc291cmNlU2VydmljZSB7XG5cdFx0cmV0dXJuIGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoeyBncmFudGVkOiAoKSA9PiBhbGxvdyB9KTtcblx0fVxuXG5cdGludGVyZmFjZSBJUmVzb3VyY2VTZXJ2aWNlU3R1Yk9wdHMge1xuXHRcdGdyYW50ZWQ/OiAoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHVyaTogVVJJLCBtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZSkgPT4gYm9vbGVhbjtcblx0XHRvblJlcXVlc3Q/OiAoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHBhcmFtczogeyB1cmk6IHN0cmluZzsgcmVhZD86IGJvb2xlYW47IHdyaXRlPzogYm9vbGVhbiB9KSA9PiBQcm9taXNlPHZvaWQ+O1xuXHRcdG9uR3JhbnRJbXBsaWNpdFJlYWQ/OiAoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHVyaTogVVJJKSA9PiB2b2lkO1xuXHRcdC8qKiBUZXN0IGhvb2sgdGhhdCBvYnNlcnZlcyBkaXNwb3NhbCBvZiB0aGUgaW1wbGljaXQtcmVhZCBncmFudC4gKi9cblx0XHRvblJldm9rZUltcGxpY2l0UmVhZD86IChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdXJpOiBVUkkpID0+IHZvaWQ7XG5cdFx0cmVhZEJ5dGVzPzogVlNCdWZmZXI7XG5cdH1cblxuXHQvKipcblx0ICogU3R1YiBmb3Ige0BsaW5rIElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2V9OiBlYWNoIEZTIG1ldGhvZCBydW5zIHRoZVxuXHQgKiBgZ3JhbnRlZGAgcHJlZGljYXRlIGFuZCBlaXRoZXIgdGhyb3dzIHtAbGluayBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvcn1cblx0ICogKGNhcnJ5aW5nIHRoZSBzYW1lIGByZXNvdXJjZVJlcXVlc3RgIHBheWxvYWQgdGhlIHJlYWwgc2VydmljZSB3b3VsZFxuXHQgKiBhZHZlcnRpc2UpIG9yIHJlc29sdmVzIHdpdGggYSBtaW5pbWFsIHBsYWNlaG9sZGVyIHJlc3VsdC4gU3VmZmljaWVudCB0b1xuXHQgKiBkcml2ZSB0aGUgcHJvdG9jb2wgY2xpZW50J3MgcmV2ZXJzZS1SUEMgcGVybWlzc2lvbi1nYXRpbmcgcGF0aHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKG9wdHM6IElSZXNvdXJjZVNlcnZpY2VTdHViT3B0cyA9IHt9KTogSUFnZW50SG9zdFJlc291cmNlU2VydmljZSB7XG5cdFx0Y29uc3QgZ3JhbnQgPSBvcHRzLmdyYW50ZWQgPz8gKCgpID0+IHRydWUpO1xuXHRcdGNvbnN0IGVtcHR5ID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IG5ldmVyW10+KCd0ZXN0JywgW10pO1xuXHRcdGNvbnN0IGRlbnlSZWFkID0gKHVyaTogc3RyaW5nKSA9PiBuZXcgQWdlbnRIb3N0UmVzb3VyY2VQZXJtaXNzaW9uRXJyb3IoeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmksIHJlYWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgZGVueVdyaXRlID0gKHVyaTogc3RyaW5nKSA9PiBuZXcgQWdlbnRIb3N0UmVzb3VyY2VQZXJtaXNzaW9uRXJyb3IoeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmksIHdyaXRlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGdhdGVSZWFkID0gYXN5bmMgKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCB1cmk6IFVSSSkgPT4ge1xuXHRcdFx0aWYgKCFncmFudChpZGVudGl0eSwgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkKSkgeyB0aHJvdyBkZW55UmVhZCh1cmkudG9TdHJpbmcoKSk7IH1cblx0XHR9O1xuXHRcdGNvbnN0IGdhdGVXcml0ZSA9IGFzeW5jIChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdXJpOiBVUkkpID0+IHtcblx0XHRcdGlmICghZ3JhbnQoaWRlbnRpdHksIHVyaSwgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUpKSB7IHRocm93IGRlbnlXcml0ZSh1cmkudG9TdHJpbmcoKSk7IH1cblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRjaGVjazogYXN5bmMgKGFkZHIsIHVyaSwgbW9kZSkgPT4gZ3JhbnQoYWRkciwgdXJpLCBtb2RlKSxcblx0XHRcdGFzeW5jIGxpc3QoYWRkciwgdXJpKSB7IGF3YWl0IGdhdGVSZWFkKGFkZHIsIHVyaSk7IHJldHVybiB7IGVudHJpZXM6IFtdIH07IH0sXG5cdFx0XHRhc3luYyByZWFkKGFkZHIsIHVyaSkge1xuXHRcdFx0XHRhd2FpdCBnYXRlUmVhZChhZGRyLCB1cmkpO1xuXHRcdFx0XHRpZiAob3B0cy5yZWFkQnl0ZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBieXRlczogb3B0cy5yZWFkQnl0ZXMgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBpbiBzdHViJyk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgd3JpdGUoYWRkciwgcGFyYW1zKSB7IGF3YWl0IGdhdGVXcml0ZShhZGRyLCBVUkkucGFyc2UocGFyYW1zLnVyaSkpOyB9LFxuXHRcdFx0YXN5bmMgZGVsKGFkZHIsIHBhcmFtcykgeyBhd2FpdCBnYXRlV3JpdGUoYWRkciwgVVJJLnBhcnNlKHBhcmFtcy51cmkpKTsgfSxcblx0XHRcdGFzeW5jIG1vdmUoYWRkciwgcGFyYW1zKSB7IGF3YWl0IGdhdGVXcml0ZShhZGRyLCBVUkkucGFyc2UocGFyYW1zLnNvdXJjZSkpOyBhd2FpdCBnYXRlV3JpdGUoYWRkciwgVVJJLnBhcnNlKHBhcmFtcy5kZXN0aW5hdGlvbikpOyB9LFxuXHRcdFx0YXN5bmMgY29weShhZGRyLCBwYXJhbXMpIHsgYXdhaXQgZ2F0ZVJlYWQoYWRkciwgVVJJLnBhcnNlKHBhcmFtcy5zb3VyY2UpKTsgYXdhaXQgZ2F0ZVdyaXRlKGFkZHIsIFVSSS5wYXJzZShwYXJhbXMuZGVzdGluYXRpb24pKTsgfSxcblx0XHRcdGFzeW5jIHJlc29sdmUoYWRkciwgcGFyYW1zKSB7IGF3YWl0IGdhdGVSZWFkKGFkZHIsIFVSSS5wYXJzZShwYXJhbXMudXJpKSk7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkIGluIHN0dWInKTsgfSxcblx0XHRcdGFzeW5jIG1rZGlyKGFkZHIsIHBhcmFtcykgeyBhd2FpdCBnYXRlV3JpdGUoYWRkciwgVVJJLnBhcnNlKHBhcmFtcy51cmkpKTsgfSxcblx0XHRcdHJlcXVlc3Q6IGFzeW5jIChhZGRyLCBwYXJhbXMpID0+IG9wdHMub25SZXF1ZXN0ID8gb3B0cy5vblJlcXVlc3QoYWRkciwgcGFyYW1zKSA6IHVuZGVmaW5lZCxcblx0XHRcdHBlbmRpbmdGb3I6ICgpID0+IGVtcHR5LFxuXHRcdFx0YWxsUGVuZGluZzogZW1wdHksXG5cdFx0XHRmaW5kUGVuZGluZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0Z3JhbnRJbXBsaWNpdFJlYWQ6IChhZGRyZXNzLCB1cmkpID0+IHtcblx0XHRcdFx0b3B0cy5vbkdyYW50SW1wbGljaXRSZWFkPy4oYWRkcmVzcywgdXJpKTtcblx0XHRcdFx0cmV0dXJuIG9wdHMub25SZXZva2VJbXBsaWNpdFJlYWQgPyB0b0Rpc3Bvc2FibGUoKCkgPT4gb3B0cy5vblJldm9rZUltcGxpY2l0UmVhZD8uKGFkZHJlc3MsIHVyaSkpIDogRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0fSxcblx0XHRcdGNvbm5lY3Rpb25DbG9zZWQ6ICgpID0+IHsgfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2xpZW50Rm9ySWRlbnRpdHkoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KCkpLCBwZXJtaXNzaW9uU2VydmljZSA9IGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIGxvYWRFc3RpbWF0b3I/OiB7IGhhc0hpZ2hMb2FkKCk6IGJvb2xlYW4gfSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIGNsaWVudElkPzogc3RyaW5nLCBjbGllbnRJbmZvPzogSW1wbGVtZW50YXRpb24pOiB7IGNsaWVudDogUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQ7IHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0OyBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0ge1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQoaWRlbnRpdHksIHRyYW5zcG9ydCwgbG9hZEVzdGltYXRvciwgY2xpZW50SWQsIGNsaWVudEluZm8sIGxvZ1NlcnZpY2UsIHBlcm1pc3Npb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdHJldHVybiB7IGNsaWVudCwgdHJhbnNwb3J0LCBjb25maWd1cmF0aW9uU2VydmljZSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2xpZW50KHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KCkpLCBwZXJtaXNzaW9uU2VydmljZSA9IGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIGxvYWRFc3RpbWF0b3I/OiB7IGhhc0hpZ2hMb2FkKCk6IGJvb2xlYW4gfSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIGNsaWVudElkPzogc3RyaW5nLCBjbGllbnRJbmZvPzogSW1wbGVtZW50YXRpb24pOiB7IGNsaWVudDogUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQ7IHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0OyBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0ge1xuXHRcdHJldHVybiBjcmVhdGVDbGllbnRGb3JJZGVudGl0eSgndGVzdC5leGFtcGxlOjEyMzQnLCB0cmFuc3BvcnQsIHBlcm1pc3Npb25TZXJ2aWNlLCBsb2FkRXN0aW1hdG9yLCBsb2dTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2xpZW50SWQsIGNsaWVudEluZm8pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY29ubmVjdENsaWVudChjbGllbnQ6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCB0cmFuc3BvcnQ6IFRlc3RQcm90b2NvbFRyYW5zcG9ydCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHR3aGlsZSAodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogc2VudC5pZCxcblx0XHRcdHJlc3VsdDogeyBwcm90b2NvbFZlcnNpb246IFBST1RPQ09MX1ZFUlNJT04sIHNlcnZlclNlcTogMCwgc25hcHNob3RzOiBbXSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZmx1c2hNaWNyb3Rhc2tzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGBhd2FpdCBQcm9taXNlLnJlc29sdmUoKWAgb25seSBhZHZhbmNlcyBvbmUgbWljcm90YXNrOyBsb29wIHRvIGRyYWluIGNoYWluZWQgaGFuZGxlcnMuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzZXR0aW5nSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbc2V0dGluZ0lkXSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW3NldHRpbmdJZF0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiBjb25maWd1cmF0aW9uID0+IGNvbmZpZ3VyYXRpb24gPT09IHNldHRpbmdJZCxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiwgZXhwZWN0ZWQ6IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IGRhdGE/OiB1bmtub3duIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdGFzc2VydC5mYWlsKCdFeHBlY3RlZCBwcm9taXNlIHRvIHJlamVjdCcpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIShlcnJvciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpKSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKGBFeHBlY3RlZCBQcm90b2NvbEVycm9yLCBnb3QgJHtTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmNvZGUsIGV4cGVjdGVkLmNvZGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLm1lc3NhZ2UsIGV4cGVjdGVkLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlcnJvci5kYXRhLCBleHBlY3RlZC5kYXRhKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdjb21wbGV0ZXMgbWF0Y2hpbmcgcmVzcG9uc2UgYW5kIHJlbW92ZXMgaXQgZnJvbSBwZW5kaW5nIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQucmVzb3VyY2VMaXN0KFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdLCB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAncmVzb3VyY2VMaXN0Jyxcblx0XHRcdHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSB9LFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IHsgZW50cmllczogW10gfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlc3VsdFByb21pc2UsIHsgZW50cmllczogW10gfSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogeyBlbnRyaWVzOiBbeyBuYW1lOiAnbGF0ZScsIHR5cGU6ICdmaWxlJyB9XSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RTZXNzaW9ucyBjYXJyaWVzIHRoZSB3b3Jrc3BhY2UtbGVzcyBtYXJrZXIgYmFjayBvbiBfbWV0YScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIgcmVzb2x2ZXMgYSBzZXNzaW9uJ3Mga2luZCAocXVpY2tcblx0XHQvLyBjaGF0IHZzLiB3b3Jrc3BhY2UpIGZyb20gYF9tZXRhLndvcmtzcGFjZWxlc3NgLCBhbmQgYWZ0ZXIgYSB3aW5kb3dcblx0XHQvLyByZWxvYWQgYSBsaXN0aW5nIGlzIHdoYXQgbWF0ZXJpYWxpemVzIGl0LlxuXHRcdC8vIERyb3BwaW5nIGBfbWV0YWAgb24gdGhlIHdheSBiYWNrIG1hZGUgZXZlcnkgcmVzdG9yZWQgcXVpY2sgY2hhdCBsb29rXG5cdFx0Ly8gd29ya3NwYWNlLWJvdW5kIGFuZCBsZWFrIHRoZSBob3N0J3Mgc2NyYXRjaCBjd2QgYXMgYSB3b3Jrc3BhY2UgZm9sZGVyLlxuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQubGlzdFNlc3Npb25zKCk7XG5cblx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogc2VudC5pZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90Y2xpL3F1aWNrLTEnLFxuXHRcdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHRcdFx0dGl0bGU6ICdRdWljayBDaGF0Jyxcblx0XHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDEwMDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMjAwMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9jaGF0cy9xdWljay0xJykudG9TdHJpbmcoKV0sXG5cdFx0XHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9ucy5tYXAocyA9PiByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3Mocy5fbWV0YSkpLCBbdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWV1ZXMgcmVxdWVzdHMgYW5kIG5vdGlmaWNhdGlvbnMgdW50aWwgYSBjbGllbnQgdHJhbnNwb3J0IGluaXRpYWxpemVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNsaWVudC5yZXNvdXJjZUxpc3QocmVzb3VyY2UpO1xuXHRcdGNsaWVudC5kaXNwYXRjaChST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHsgcHJlSW5pdGlhbGl6ZTogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goUk9PVF9TVEFURV9VUkksIHsgdHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7IG9uQ29ubmVjdGVkOiB0cnVlIH0gfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29ubmVjdCA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoLCAwKTtcblxuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR3aGlsZSAodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsaXplID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbGl6ZS5tZXRob2QsICdpbml0aWFsaXplJyk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IGluaXRpYWxpemUuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb25uZWN0O1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VMaXN0ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKChtZXNzYWdlKTogbWVzc2FnZSBpcyBKc29uUnBjUmVxdWVzdCA9PlxuXHRcdFx0aGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmIG1lc3NhZ2UubWV0aG9kID09PSAncmVzb3VyY2VMaXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc291cmNlTGlzdCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmlsdGVyKChtZXNzYWdlKTogbWVzc2FnZSBpcyBKc29uUnBjTm90aWZpY2F0aW9uID0+XG5cdFx0XHRoYXNLZXkobWVzc2FnZSwgeyBtZXRob2Q6IHRydWUgfSkgJiYgbWVzc2FnZS5tZXRob2QgPT09ICdkaXNwYXRjaEFjdGlvbicpO1xuXHRcdGNvbnN0IHByZUluaXRpYWxpemUgPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IChhY3Rpb24ucGFyYW1zIGFzIElUZXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvblBhcmFtcykuYWN0aW9uPy5jb25maWc/LnByZUluaXRpYWxpemUgPT09IHRydWUpO1xuXHRcdGNvbnN0IG9uQ29ubmVjdGVkID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiAoYWN0aW9uLnBhcmFtcyBhcyBJVGVzdFJvb3RDb25maWdOb3RpZmljYXRpb25QYXJhbXMpLmFjdGlvbj8uY29uZmlnPy5vbkNvbm5lY3RlZCA9PT0gdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHByZUluaXRpYWxpemUpO1xuXHRcdGFzc2VydC5vayhvbkNvbm5lY3RlZCk7XG5cdFx0YXNzZXJ0Lm9rKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuaW5kZXhPZihyZXNvdXJjZUxpc3QpIDwgdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKHByZUluaXRpYWxpemUpKTtcblx0XHRhc3NlcnQub2sodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKHByZUluaXRpYWxpemUpIDwgdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKG9uQ29ubmVjdGVkKSk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXNvdXJjZUxpc3QuaWQsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVxdWVzdCwgeyBlbnRyaWVzOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBxdWV1ZWQgcmVxdWVzdHMgYW5kIGRyb3BzIHF1ZXVlZCBub3RpZmljYXRpb25zIHdoZW4gaW5pdGlhbGl6YXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBjbGllbnQucmVzb3VyY2VMaXN0KFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdGNsaWVudC5kaXNwYXRjaChST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHsgcHJlSW5pdGlhbGl6ZTogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBjb25uZWN0ID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0d2hpbGUgKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbGl6ZSA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7IGNvZGU6IC0zMjAwMSwgbWVzc2FnZTogJ0luaXRpYWxpemF0aW9uIGZhaWxlZCcgfTtcblx0XHRjb25zdCByZXF1ZXN0RXJyb3IgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlcXVlc3QsIGV4cGVjdGVkKTtcblx0XHRjb25zdCBjb25uZWN0RXJyb3IgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNvbm5lY3QsIGV4cGVjdGVkKTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IGluaXRpYWxpemUuaWQsIGVycm9yOiBleHBlY3RlZCB9KTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtyZXF1ZXN0RXJyb3IsIGNvbm5lY3RFcnJvcl0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgW2luaXRpYWxpemVdKTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdHMgZm9yIGluaXRpYWxpemF0aW9uIGJlZm9yZSByZXR1cm5pbmcgY29tcGxldGlvbiB0cmlnZ2VyIGNoYXJhY3RlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyA9IGNsaWVudC5nZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdHZvaWQgY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLnRoZW4oKCkgPT4gc2V0dGxlZCA9IHRydWUpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXR0bGVkLCBmYWxzZSk7XG5cblx0XHRjb25zdCBjb25uZWN0ID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0d2hpbGUgKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbGl6ZSA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IGluaXRpYWxpemUuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10sIGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyczogWycuJywgJ0AnXSB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY29ubmVjdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycywgWycuJywgJ0AnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgY29tcGxldGlvbiB0cmlnZ2VyIGNoYXJhY3RlcnMgYWZ0ZXIgYW4gaW5jb21wYXRpYmxlIGluaXRpYWxpemF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCBjb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5nZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKSwge1xuXHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5VbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbixcblx0XHRcdG1lc3NhZ2U6ICdQcm90b2NvbCB2ZXJzaW9ucyBkbyBub3QgbWF0Y2gnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbm5lY3QgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR3aGlsZSAodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsaXplID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHRjb25zdCBjb25uZWN0RXJyb3IgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNvbm5lY3QsIHtcblx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sXG5cdFx0XHRtZXNzYWdlOiAnUHJvdG9jb2wgdmVyc2lvbnMgZG8gbm90IG1hdGNoJyxcblx0XHR9KTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogaW5pdGlhbGl6ZS5pZCxcblx0XHRcdGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sIG1lc3NhZ2U6ICdQcm90b2NvbCB2ZXJzaW9ucyBkbyBub3QgbWF0Y2gnIH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLCBjb25uZWN0RXJyb3JdKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBwcm90b2NvbC1zdXBwb3J0ZWQgY3JlYXRlIHNlc3Npb24gZm9yayBhbmQgcHJvZ3Jlc3MgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L25ldycpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3NvdXJjZScpO1xuXHRcdGNvbnN0IGNyZWF0aW9uID0gY2xpZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRmb3JrOiB7IHNlc3Npb246IHNvdXJjZSwgdHVybkluZGV4OiAyLCB0dXJuSWQ6ICd0dXJuLTInIH0sXG5cdFx0XHRwcm9ncmVzc1Rva2VuOiAncHJvZ3Jlc3MtdG9rZW4nLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmluZCgobWVzc2FnZSk6IG1lc3NhZ2UgaXMgSnNvblJwY1JlcXVlc3QgPT5cblx0XHRcdGhhc0tleShtZXNzYWdlLCB7IG1ldGhvZDogdHJ1ZSB9KSAmJiBtZXNzYWdlLm1ldGhvZCA9PT0gJ2NyZWF0ZVNlc3Npb24nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3Q/LnBhcmFtcywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdW5kZWZpbmVkLFxuXHRcdFx0Zm9yazogeyBzZXNzaW9uOiBzb3VyY2UudG9TdHJpbmcoKSwgdHVybklkOiAndHVybi0yJyB9LFxuXHRcdFx0Y29uZmlnOiB1bmRlZmluZWQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHVuZGVmaW5lZCxcblx0XHRcdHByb2dyZXNzVG9rZW46ICdwcm9ncmVzcy10b2tlbicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5nZXRJbmZsaWdodFNlc3Npb25DcmVhdGUoc2Vzc2lvbiksIGNyZWF0aW9uKTtcblx0XHRhc3NlcnQub2socmVxdWVzdCk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXF1ZXN0LmlkLCByZXN1bHQ6IG51bGwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNyZWF0aW9uLCBzZXNzaW9uKTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZUNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3Rlc3QnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKCdhaHAtc2Vzc2lvbjovdGVzdC9jaGF0LTEnKTtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkucGFyc2UoJ2FocC1zZXNzaW9uOi90ZXN0L2NoYXQtMCcpO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYSBmb3JrIHNvdXJjZSB0YWdnZWQgd2l0aCBraW5kIFwiZm9ya1wiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQuY3JlYXRlQ2hhdChzZXNzaW9uVXJpLCBjaGF0VXJpLCB7IGZvcms6IHsgc291cmNlOiBzb3VyY2VVcmksIHR1cm5JZDogJ3R1cm4tMScgfSB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogMSxcblx0XHRcdFx0bWV0aG9kOiAnY3JlYXRlQ2hhdCcsXG5cdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjaGF0OiBjaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0c291cmNlOiB7IGtpbmQ6IENoYXRTb3VyY2VLaW5kLkZvcmssIGNoYXQ6IHNvdXJjZVVyaS50b1N0cmluZygpLCB0dXJuSWQ6ICd0dXJuLTEnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IG51bGwgfSk7XG5cdFx0XHRhd2FpdCByZXN1bHRQcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYSBzaWRlIGNoYXQgKGAvYnR3YCkgc291cmNlIHRhZ2dlZCB3aXRoIGtpbmQgXCJzaWRlQ2hhdFwiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHsgdGV4dDogJyAgc2VsZWN0ZWQgdGV4dCAgJywgcmVzcG9uc2VQYXJ0SWQ6ICdyZXNwb25zZS1wYXJ0LTEnIH07XG5cdFx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LmNyZWF0ZUNoYXQoc2Vzc2lvblVyaSwgY2hhdFVyaSwgeyBzaWRlQ2hhdDogeyBzb3VyY2U6IHNvdXJjZVVyaSwgdHVybklkOiAndHVybi0xJywgc2VsZWN0aW9uIH0gfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDEsXG5cdFx0XHRcdG1ldGhvZDogJ2NyZWF0ZUNoYXQnLFxuXHRcdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y2hhdDogY2hhdFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBraW5kOiBDaGF0U291cmNlS2luZC5TaWRlQ2hhdCwgY2hhdDogc291cmNlVXJpLnRvU3RyaW5nKCksIHR1cm5JZDogJ3R1cm4tMScsIHNlbGVjdGlvbiB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdFx0YXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIHNvdXJjZSBlbnRpcmVseSB3aGVuIG5laXRoZXIgZm9yayBub3Igc2lkZUNoYXQgaXMgcmVxdWVzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQuY3JlYXRlQ2hhdChzZXNzaW9uVXJpLCBjaGF0VXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogMSxcblx0XHRcdFx0bWV0aG9kOiAnY3JlYXRlQ2hhdCcsXG5cdFx0XHRcdHBhcmFtczogeyBjaGFubmVsOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXRVcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdFx0YXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ3ByZXNlcnZlcyBKU09OLVJQQyBlcnJvciBjb2RlIGFuZCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQucmVzb3VyY2VSZWFkKFVSSS5maWxlKCcvbWlzc2luZycpKTtcblx0XHRjb25zdCBkYXRhID0geyB1cmk6IFVSSS5maWxlKCcvbWlzc2luZycpLnRvU3RyaW5nKCkgfTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgZXJyb3I6IHsgY29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgbWVzc2FnZTogJ01pc3NpbmcgcmVzb3VyY2UnLCBkYXRhIH0gfSk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgbWVzc2FnZTogJ01pc3NpbmcgcmVzb3VyY2UnLCBkYXRhIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB3YXJuIGZvciBtaXNzaW5nIGZpbGUgcmVzb3VyY2UgcmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBDb3VudGluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZVJlYWQoVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL21pc3NpbmcudHMnKSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdDb250ZW50IG5vdCBmb3VuZCcgfSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnQ29udGVudCBub3QgZm91bmQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2dTZXJ2aWNlLndhcm5Db3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhcm5zIGZvciBub24tZmlsZSByZXNvdXJjZSByZWFkIE5vdEZvdW5kIGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IENvdW50aW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnJlc291cmNlUmVhZChVUkkucGFyc2UoJ3Nlc3Npb24tZGI6L21pc3NpbmcnKSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdNaXNzaW5nIHNuYXBzaG90JyB9IH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihyZXN1bHRQcm9taXNlLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdNaXNzaW5nIHNuYXBzaG90JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9nU2VydmljZS53YXJuQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXJucyBmb3Igbm9uLXJlYWQgTm90Rm91bmQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgQ291bnRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQucmVzb3VyY2VSZXNvbHZlKHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL21pc3NpbmcudHMnKS50b1N0cmluZygpIH0pO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnTWlzc2luZyByZXNvdXJjZScgfSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnTWlzc2luZyByZXNvdXJjZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvZ1NlcnZpY2Uud2FybkNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyByZXNwb25zZSBmb3IgdW5rbm93biByZXF1ZXN0IGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogOTksIHJlc3VsdDogbnVsbCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYWxsIHBlbmRpbmcgcmVxdWVzdHMgb24gdHJhbnNwb3J0IGNsb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IGZpcnN0ID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL29uZScpKTtcblx0XHRjb25zdCBzZWNvbmQgPSBjbGllbnQucmVzb3VyY2VSZWFkKFVSSS5maWxlKCcvdHdvJykpO1xuXHRcdGxldCBjbG9zZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4gY2xvc2VDb3VudCsrKSk7XG5cdFx0Y29uc3QgZmlyc3RSZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IoZmlyc3QsIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblx0XHRjb25zdCBzZWNvbmRSZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3Ioc2Vjb25kLCB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogJ0Nvbm5lY3Rpb24gY2xvc2VkOiB0ZXN0LmV4YW1wbGU6MTIzNCcgfSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZUNsb3NlKCk7XG5cdFx0dHJhbnNwb3J0LmZpcmVDbG9zZSgpO1xuXG5cdFx0YXdhaXQgZmlyc3RSZWplY3RlZDtcblx0XHRhd2FpdCBzZWNvbmRSZWplY3RlZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcGVuZGluZyByZXF1ZXN0cyBvbiBkaXNwb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblx0XHRjb25zdCByZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICdDb25uZWN0aW9uIGRpc3Bvc2VkOiB0ZXN0LmV4YW1wbGU6MTIzNCcgfSk7XG5cblx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgcmVqZWN0ZWQ7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgcmVqZWN0aW9uIHdpbnMgd2hlbiB0cmFuc3BvcnQgZW1pdHMgY2xvc2Ugd2hpbGUgZGlzcG9zaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2xvc2VPbkRpc3Bvc2VQcm90b2NvbFRyYW5zcG9ydCgpKTtcblx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHRyYW5zcG9ydCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmVqZWN0ZWQgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBkaXNwb3NlZDogdGVzdC5leGFtcGxlOjEyMzQnIH0pO1xuXG5cdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IHJlamVjdGVkO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXRlIHJlc3BvbnNlIGFmdGVyIGNsb3NlIGRvZXMgbm90IGNvbXBsZXRlIHJlamVjdGVkIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmVqZWN0ZWQgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblxuXHRcdHRyYW5zcG9ydC5maXJlQ2xvc2UoKTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXG5cdFx0YXdhaXQgcmVqZWN0ZWQ7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcmVxdWVzdHMgc3RhcnRlZCBhZnRlciB0cmFuc3BvcnQgY2xvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZUNsb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSksIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHJlcXVlc3RzIHN0YXJ0ZWQgYWZ0ZXIgZGlzcG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblxuXHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSksIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBkaXNwb3NlZDogdGVzdC5leGFtcGxlOjEyMzQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIHNlbmRzIGEgcGluZyB3aGVuIGlkbGUgYW5kIGZvcmNlLWNsb3NlcyBhZnRlciB0aGUgcGluZyBhZ2VzIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG93TG9hZCA9IHsgaGFzSGlnaExvYWQ6ICgpID0+IGZhbHNlIH07XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIGxvd0xvYWQpO1xuXHRcdFx0bGV0IGNsb3NlQ291bnQgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vbkRpZENsb3NlKCgpID0+IGNsb3NlQ291bnQrKykpO1xuXG5cdFx0XHQvLyBGaXJzdCBpZGxlIHRpY2sgKHQ9NXMpIHNlbmRzIGEgcGluZzsgdGhhdCBwaW5nIHRoZW4gYWdlcyBvdXRcblx0XHRcdC8vIG92ZXIgdGhlIG5leHQgfjIwcyBhbmQgdHJpZ2dlcnMgYSBjbG9zZSBhdCB+dD0yNXMuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwXzAwMCk7XG5cblx0XHRcdGNvbnN0IHBpbmdzID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maWx0ZXIoaXNQaW5nUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQub2socGluZ3MubGVuZ3RoID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHBpbmcsIGdvdCAke3BpbmdzLmxlbmd0aH1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZUNvdW50LCAxKTtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIGtlZXBzIHRoZSBjb25uZWN0aW9uIG9wZW4gd2hpbGUgcGluZ3MgYXJlIGFuc3dlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb3dMb2FkID0geyBoYXNIaWdoTG9hZDogKCkgPT4gZmFsc2UgfTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgbG93TG9hZCk7XG5cdFx0XHRsZXQgY2xvc2VDb3VudCA9IDA7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4gY2xvc2VDb3VudCsrKSk7XG5cblx0XHRcdC8vIEF1dG8tcmVzcG9uZCB0byBldmVyeSBvdXRnb2luZyBwaW5nLlxuXHRcdFx0bGV0IGFuc3dlcmVkID0gMDtcblx0XHRcdGNvbnN0IGRpc3Bvc2UgPSBtYWluV2luZG93LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBtc2cgb2YgdHJhbnNwb3J0LnNlbnRNZXNzYWdlcykge1xuXHRcdFx0XHRcdGlmIChpc1BpbmdSZXF1ZXN0KG1zZykgJiYgbXNnLmlkID4gYW5zd2VyZWQpIHtcblx0XHRcdFx0XHRcdGFuc3dlcmVkID0gbXNnLmlkO1xuXHRcdFx0XHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiBtc2cuaWQsIHJlc3VsdDogbnVsbCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIDFfMDAwKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXHRcdFx0bWFpbldpbmRvdy5jbGVhckludGVydmFsKGRpc3Bvc2UpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQub2soYW5zd2VyZWQgPj0gNCwgYGV4cGVjdGVkIHNldmVyYWwgcGluZ3MgdG8gaGF2ZSBiZWVuIGFuc3dlcmVkLCBnb3QgJHthbnN3ZXJlZH1gKTtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIGlzIHN1cHByZXNzZWQgd2hpbGUgbG9jYWwgbG9hZCBpcyBoaWdoJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoaWdoTG9hZCA9IHsgaGFzSGlnaExvYWQ6ICgpID0+IHRydWUgfTtcblx0XHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIGhpZ2hMb2FkKTtcblx0XHRcdGxldCBjbG9zZUNvdW50ID0gMDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjbGllbnQub25EaWRDbG9zZSgoKSA9PiBjbG9zZUNvdW50KyspKTtcblxuXHRcdFx0Ly8gNjBzIG9mIHNpbGVuY2UgXHUyMDE0IHdvdWxkIG5vcm1hbGx5IHRyaWdnZXIgdGhlIHRpbWVvdXQgXHUyMDE0IGJ1dFxuXHRcdFx0Ly8gaGlnaCBsb2NhbCBsb2FkIG1lYW5zIHdlIGF0dHJpYnV0ZSB0aGUgc2lsZW5jZSB0byBvdXJzZWx2ZXNcblx0XHRcdC8vIGFuZCBzdGF5IHF1aWV0LlxuXHRcdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMCk7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXZlbmVzcyBzdG9wcyBhZnRlciB0aGUgY29ubmVjdGlvbiBpcyBjbG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxvd0xvYWQgPSB7IGhhc0hpZ2hMb2FkOiAoKSA9PiBmYWxzZSB9O1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsb3dMb2FkKTtcblx0XHRcdGxldCBjbG9zZUNvdW50ID0gMDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjbGllbnQub25EaWRDbG9zZSgoKSA9PiBjbG9zZUNvdW50KyspKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGZpcnN0IGZvcmNlLWNsb3NlLlxuXHRcdFx0YXdhaXQgdGltZW91dCgzMF8wMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlQ291bnQsIDEsICdzaG91bGQgaGF2ZSBmb3JjZS1jbG9zZWQgb25jZScpO1xuXG5cdFx0XHRjb25zdCBwaW5nc0F0Q2xvc2UgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbHRlcihpc1BpbmdSZXF1ZXN0KS5sZW5ndGg7XG5cblx0XHRcdC8vIFdhaXQgbXVjaCBsb25nZXI7IG5vIGZ1cnRoZXIgcGluZ3MsIG5vIGZ1cnRoZXIgY2xvc2VzLlxuXHRcdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlQ291bnQsIDEsICdzaG91bGQgbm90IGZpcmUgYWdhaW4gYWZ0ZXIgY2xvc2UnKTtcblx0XHRcdGNvbnN0IHBpbmdzTGF0ZXIgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbHRlcihpc1BpbmdSZXF1ZXN0KS5sZW5ndGg7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGluZ3NMYXRlciwgcGluZ3NBdENsb3NlLCAnbm8gZnVydGhlciBwaW5ncyBzaG91bGQgYmUgc2VudCBhZnRlciBjbG9zZScpO1xuXHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5ib3VuZCBtZXNzYWdlcyBhcmUgZHJvcHBlZCBhZnRlciBjbG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0XHRsZXQgYWN0aW9uQ291bnQgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vbkRpZEFjdGlvbigoKSA9PiBhY3Rpb25Db3VudCsrKSk7XG5cblx0XHRcdC8vIElzc3VlIGEgcmVxdWVzdCwgdGhlbiBmb3JjZSBjbG9zZSB2aWEgdGhlIHdhdGNoZG9nIHRpbWVvdXQuXG5cdFx0XHRjb25zdCBwZW5kaW5nID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblx0XHRcdGNvbnN0IHJlamVjdGVkID0gcGVuZGluZy5jYXRjaChlcnIgPT4gZXJyKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMzBfMDAwKTtcblx0XHRcdGNvbnN0IGVyciA9IGF3YWl0IHJlamVjdGVkO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpO1xuXG5cdFx0XHQvLyBMYXRlIHJlc3BvbnNlIGZvciB0aGUgc2FtZSByZXF1ZXN0IGlkIFx1MjAxNCB0aGUgc2hhcmVkXG5cdFx0XHQvLyBTU0hSZWxheVRyYW5zcG9ydCBmZWVkcyBib3RoIG9sZCBhbmQgbmV3IGNsaWVudHMgZm9yIHRoZVxuXHRcdFx0Ly8gc2FtZSBjb25uZWN0aW9uSWQsIHNvIHRoaXMgY2FuIGhhcHBlbiBpbiBwcm9kdWN0aW9uLiBUaGVcblx0XHRcdC8vIHBlbmRpbmcgcmVxdWVzdCB3YXMgYWxyZWFkeSByZWplY3RlZDsgaWYgX2hhbmRsZU1lc3NhZ2Vcblx0XHRcdC8vIHByb2Nlc3NlZCB0aGUgcmVzcG9uc2UgaXQgd291bGQgbG9nIGEgXCJ1bmtub3duIHJlcXVlc3QgaWRcIlxuXHRcdFx0Ly8gd2FybmluZyBhdCBiZXN0LCBvciBzZXR0bGUgYSByZXF1ZXN0IHRoZSBjYWxsZXIgbm8gbG9uZ2VyXG5cdFx0XHQvLyBvd25zIGF0IHdvcnN0LiBFaXRoZXIgd2F5LCBhZnRlciBjbG9zZSBpdCBtdXN0IGJlIGEgbm8tb3AuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXG5cdFx0XHQvLyBMYXRlIG5vdGlmaWNhdGlvbiBcdTIwMTQgbXVzdCBub3QgZmFuIG91dCBhcyBhbiBhY3Rpb24gZXZlbnQuXG5cdFx0XHRjb25zdCBsYXRlQWN0aW9uOiBTZXNzaW9uQWN0aXZlQ2xpZW50UmVtb3ZlZEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50UmVtb3ZlZCxcblx0XHRcdFx0Y2xpZW50SWQ6ICdjMScsXG5cdFx0XHR9O1xuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdG1ldGhvZDogJ2FjdGlvbicsXG5cdFx0XHRcdHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXNlc3Npb246L3Rlc3QnLCBhY3Rpb246IGxhdGVBY3Rpb24sIHNlcnZlclNlcTogMSwgb3JpZ2luOiB1bmRlZmluZWQgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25Db3VudCwgMCwgJ2xhdGUgYWN0aW9uIG5vdGlmaWNhdGlvbnMgbXVzdCBiZSBpZ25vcmVkIGFmdGVyIGNsb3NlJyk7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGNvbm5lY3Qgd2hlbiB0cmFuc3BvcnQgY2xvc2VzIGJlZm9yZSBjb25uZWN0IGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydCgpKTtcblx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHRyYW5zcG9ydCk7XG5cdFx0Y29uc3QgcmVqZWN0ZWQgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5jb25uZWN0KCksIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblxuXHRcdHRyYW5zcG9ydC5maXJlQ2xvc2UoKTtcblx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cblx0XHRhd2FpdCByZWplY3RlZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGNvbm5lY3Qgd2hlbiBkaXNwb3NlZCBiZWZvcmUgdHJhbnNwb3J0IGNvbm5lY3QgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCByZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IoY2xpZW50LmNvbm5lY3QoKSwgeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICdDb25uZWN0aW9uIGRpc3Bvc2VkOiB0ZXN0LmV4YW1wbGU6MTIzNCcgfSk7XG5cblx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgcmVqZWN0ZWQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZSBoYW5kc2hha2UgaW5jbHVkZXMgcHJvdG9jb2wgdmVyc2lvbiBhbmQgY2xpZW50IGluZm8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgY2xpZW50SW5mbyA9IGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm87XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3JlbmRlcmVyLWNsaWVudC1pZCcsIGNsaWVudEluZm8pO1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblxuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHQvLyBgY29ubmVjdCgpYCBjaGFpbnMgdGhyb3VnaCBzZXZlcmFsIGF3YWl0cyBiZWZvcmUgcG9zdGluZyB0aGVcblx0XHQvLyBpbml0aWFsaXplIHJlcXVlc3QgXHUyMDE0IHlpZWxkIHVudGlsIGl0IHNob3dzIHVwLlxuXHRcdHdoaWxlICh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VudCA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnQubWV0aG9kLCAnaW5pdGlhbGl6ZScpO1xuXHRcdGNvbnN0IHBhcmFtcyA9IHNlbnQucGFyYW1zIGFzIHsgcHJvdG9jb2xWZXJzaW9uczogcmVhZG9ubHkgc3RyaW5nW107IGNsaWVudElkOiBzdHJpbmc7IGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbiB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogcGFyYW1zLnByb3RvY29sVmVyc2lvbnMsXG5cdFx0XHRjbGllbnRJZDogcGFyYW1zLmNsaWVudElkLFxuXHRcdFx0Y2xpZW50SW5mbzogcGFyYW1zLmNsaWVudEluZm8sXG5cdFx0fSwge1xuXHRcdFx0Ly8gRXZlcnkgbmVnb3RpYWJsZSB2ZXJzaW9uIGlzIG9mZmVyZWQgc28gYW4gb2xkZXIgaG9zdCBjYW4gbmVnb3RpYXRlIGRvd24sXG5cdFx0XHQvLyBuZXdlc3QgZmlyc3Qgc28gYSBjdXJyZW50IGhvc3Qgc3RpbGwgcGlja3MgaXQuXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbLi4uU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT05TXSxcblx0XHRcdGNsaWVudElkOiAncmVuZGVyZXItY2xpZW50LWlkJyxcblx0XHRcdGNsaWVudEluZm8sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmFtcy5wcm90b2NvbFZlcnNpb25zWzBdLCBQUk9UT0NPTF9WRVJTSU9OKTtcblxuXHRcdC8vIFJlcGx5IHdpdGggYSBzdWNjZXNzZnVsIGhhbmRzaGFrZSBzbyBgY29ubmVjdCgpYCByZXNvbHZlcyBhbmQgdGhlXG5cdFx0Ly8gdGVzdCBjYW4gZmluaXNoIGNsZWFubHkuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IHNlbnQuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb25uZWN0UHJvbWlzZTtcblx0XHRjb25zdCB0ZWxlbWV0cnlMZXZlbCA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMV0gYXMgSnNvblJwY05vdGlmaWNhdGlvbjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeUxldmVsLCB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ2Rpc3BhdGNoQWN0aW9uJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0Y2xpZW50U2VxOiAwLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXldOiB0ZWxlbWV0cnlMZXZlbFRvQWdlbnRIb3N0Q29uZmlnVmFsdWUoVGVsZW1ldHJ5TGV2ZWwuVVNBR0UpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXRUZWxlbWV0cnlFbmFibGVkID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdFRlbGVtZXRyeUVuYWJsZWQsIHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0bWV0aG9kOiAnZGlzcGF0Y2hBY3Rpb24nLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRjbGllbnRTZXE6IDAsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWQgPSBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZCwge1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRtZXRob2Q6ICdkaXNwYXRjaEFjdGlvbicsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdGNsaWVudFNlcTogMCxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBnbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQgPSBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkLCB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ2Rpc3BhdGNoQWN0aW9uJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0Y2xpZW50U2VxOiAwLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogZmFsc2UgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcywge1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRtZXRob2Q6ICdkaXNwYXRjaEFjdGlvbicsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdGNsaWVudFNlcTogMCxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHt9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvZGV4RW5hYmxlZCA9IGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleEVuYWJsZWQsIHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0bWV0aG9kOiAnZGlzcGF0Y2hBY3Rpb24nLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRjbGllbnRTZXE6IDAsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RDb2RleEVuYWJsZWRDb25maWdLZXldOiBmYWxzZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgY29kZXggZW5hYmxlbWVudCBvbiBjb25uZWN0IHdoZW4gdGhlIGV4cGVyaW1lbnQtYXdhcmUgc2V0dGluZyBpcyBvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydCgpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXG5cdFx0dHJhbnNwb3J0LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdHdoaWxlICh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VudCA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IHNlbnQuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb25uZWN0UHJvbWlzZTtcblxuXHRcdGNvbnN0IGNvZGV4RW5hYmxlZCA9IGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb290Q29uZmlnKGNvZGV4RW5hYmxlZCksIHsgW0FnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHN5c3RlbSBwcm94eSBlbmFibGVtZW50IG9uIGNvbm5lY3QgYW5kIHdoZW4gdGhlIHNldHRpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXG5cdFx0Y29uc3Qgc3lzdGVtUHJveHlFbmFibGVkID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcoc3lzdGVtUHJveHlFbmFibGVkKSwgeyBbQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9KTtcblxuXHRcdHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID0gMDtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkU2V0dGluZ0lkKTtcblxuXHRcdGNvbnN0IHVwZGF0ZWRTeXN0ZW1Qcm94eUVuYWJsZWQgPSBmaW5kTGFzdFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcodXBkYXRlZFN5c3RlbVByb3h5RW5hYmxlZCksIHsgW0FnZW50SG9zdFN5c3RlbVByb3h5RW5hYmxlZENvbmZpZ0tleV06IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBDb3BpbG90IG11bHRpLXJvb3QgZW5hYmxlbWVudCBvbiBjb25uZWN0IGFuZCB3aGVuIHRoZSBzZXR0aW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW0FnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSB9KTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXG5cdFx0Y29uc3QgbXVsdGlSb290RW5hYmxlZCA9IGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcobXVsdGlSb290RW5hYmxlZCksIHsgW0FnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9KTtcblxuXHRcdHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID0gMDtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCwgZmFsc2UpO1xuXHRcdGZpcmVDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCk7XG5cblx0XHRjb25zdCB1cGRhdGVkTXVsdGlSb290RW5hYmxlZCA9IGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb290Q29uZmlnKHVwZGF0ZWRNdWx0aVJvb3RFbmFibGVkKSwgeyBbQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXldOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgQ2xhdWRlIG11bHRpLXJvb3QgZW5hYmxlbWVudCBvbiBjb25uZWN0IGFuZCB3aGVuIHRoZSBzZXR0aW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW0FnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudChkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RQcm90b2NvbFRyYW5zcG9ydCgpKSwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cblx0XHRjb25zdCBtdWx0aVJvb3RFbmFibGVkID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb290Q29uZmlnKG11bHRpUm9vdEVuYWJsZWQpLCB7IFtBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9KTtcblxuXHRcdHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID0gMDtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkLCBmYWxzZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIEFnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQpO1xuXG5cdFx0Y29uc3QgdXBkYXRlZE11bHRpUm9vdEVuYWJsZWQgPSBmaW5kTGFzdFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb290Q29uZmlnKHVwZGF0ZWRNdWx0aVJvb3RFbmFibGVkKSwgeyBbQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBDb2RleCBtdWx0aS1yb290IGVuYWJsZW1lbnQgb24gY29ubmVjdCBhbmQgd2hlbiB0aGUgc2V0dGluZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudChkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RQcm90b2NvbFRyYW5zcG9ydCgpKSwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cblx0XHRjb25zdCBtdWx0aVJvb3RFbmFibGVkID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcobXVsdGlSb290RW5hYmxlZCksIHsgW0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSk7XG5cblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkLCBmYWxzZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCk7XG5cblx0XHRjb25zdCB1cGRhdGVkTXVsdGlSb290RW5hYmxlZCA9IGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyh1cGRhdGVkTXVsdGlSb290RW5hYmxlZCksIHsgW0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBhdXRvLXJlcGx5IG9uIGNvbm5lY3QgYW5kIHdoZW4gdGhlIHNldHRpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbQVVUT19SRVBMWV9TRVRUSU5HX0lEXTogdHJ1ZSB9KTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXG5cdFx0Y29uc3QgYXV0b1JlcGx5RW5hYmxlZCA9IGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhhdXRvUmVwbHlFbmFibGVkKSwgeyBbQWdlbnRIb3N0QXV0b1JlcGx5RW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSk7XG5cblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQVVUT19SRVBMWV9TRVRUSU5HX0lELCBmYWxzZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIEFVVE9fUkVQTFlfU0VUVElOR19JRCk7XG5cblx0XHRjb25zdCB1cGRhdGVkQXV0b1JlcGx5RW5hYmxlZCA9IGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcodXBkYXRlZEF1dG9SZXBseUVuYWJsZWQpLCB7IFtBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5XTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHRoZSByZXBvLWluZm8gdGVsZW1ldHJ5IGRlYnVnIHN3aXRjaCBvbiBjb25uZWN0IGFuZCBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW0RJU0FCTEVfUkVQT19JTkZPX1RFTEVNRVRSWV9TRVRUSU5HX0lEXTogdHJ1ZSB9KTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhkaXNhYmxlZCksIHsgW0FnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleV06IHRydWUgfSk7XG5cblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQsIGZhbHNlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhlbmFibGVkKSwgeyBbQWdlbnRIb3N0RGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5Q29uZmlnS2V5XTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGVkaXQgdGVsZW1ldHJ5IG9uIGNvbm5lY3QgYW5kIGNoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbRURJVF9URUxFTUVUUllfRU5BQkxFRF9TRVRUSU5HX0lEXTogZmFsc2UgfSk7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KCkpLCBjcmVhdGVQZXJtaXNzaW9uU2VydmljZSgpLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRhd2FpdCBjb25uZWN0Q2xpZW50KGNsaWVudCwgdHJhbnNwb3J0KTtcblxuXHRcdGNvbnN0IGRpc2FibGVkID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhkaXNhYmxlZCksIHsgW0FnZW50SG9zdEVkaXRUZWxlbWV0cnlFbmFibGVkQ29uZmlnS2V5XTogZmFsc2UgfSk7XG5cblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oRURJVF9URUxFTUVUUllfRU5BQkxFRF9TRVRUSU5HX0lELCB0cnVlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgRURJVF9URUxFTUVUUllfRU5BQkxFRF9TRVRUSU5HX0lEKTtcblxuXHRcdGNvbnN0IGVuYWJsZWQgPSBmaW5kTGFzdFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhlbmFibGVkKSwgeyBbQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXldOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgb24gY29ubmVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W1RFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEXToge1xuXHRcdFx0XHRlY2hvOiBudWxsLFxuXHRcdFx0XHRweXRob246IHRydWUsXG5cdFx0XHRcdCcvXm5wbSBydW4gYnVpbGQkLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXG5cdFx0Y29uc3QgdGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzID0gZmluZFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcodGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKSwge1xuXHRcdFx0W0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHtcblx0XHRcdFx0ZWNobzogbnVsbCxcblx0XHRcdFx0cHl0aG9uOiB0cnVlLFxuXHRcdFx0XHQnL15ucG0gcnVuIGJ1aWxkJC8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZGlzcGF0Y2hlcyB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgd2hlbiB0aGUgcnVsZSBzZXR0aW5nIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KCkpLCBjcmVhdGVQZXJtaXNzaW9uU2VydmljZSgpLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cdFx0dHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPSAwO1xuXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQsIHsgcHl0aG9uOiB0cnVlIH0pO1xuXHRcdGZpcmVDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBURVJNSU5BTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCk7XG5cblx0XHRjb25zdCB0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgPSBmaW5kTGFzdFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcodGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKSwge1xuXHRcdFx0W0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHsgcHl0aG9uOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZGlzcGF0Y2hlcyB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgd2hlbiBpZ25vcmVkIGRlZmF1bHRzIGNoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXJtaW5hbEF1dG9BcHByb3ZlQ29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W1RFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEXTogeyBlY2hvOiB0cnVlLCBweXRob246IHRydWUgfSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiB7IGVjaG86IHRydWUgfSB9LFxuXHRcdFx0dXNlcjogeyB2YWx1ZTogeyBweXRob246IHRydWUgfSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudChkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RQcm90b2NvbFRyYW5zcG9ydCgpKSwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXHRcdHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID0gMDtcblxuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRFUk1JTkFMX0lHTk9SRV9ERUZBVUxUX0FVVE9fQVBQUk9WRV9SVUxFU19TRVRUSU5HX0lELCB0cnVlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgVEVSTUlOQUxfSUdOT1JFX0RFRkFVTFRfQVVUT19BUFBST1ZFX1JVTEVTX1NFVFRJTkdfSUQpO1xuXG5cdFx0Y29uc3QgdGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzID0gZmluZExhc3RSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb290Q29uZmlnKHRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyksIHtcblx0XHRcdFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXldOiB7IHB5dGhvbjogdHJ1ZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vcm1hbCB0cmFmZmljIGJ1dCByZXRhaW5zIHRoZSB0cmFuc3BvcnQgZm9yIGFuIGluY29tcGF0aWJsZSBwcm90b2NvbCB1cGdyYWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cblx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0d2hpbGUgKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogc2VudC5pZCxcblx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sXG5cdFx0XHRcdG1lc3NhZ2U6ICdDbGllbnQgb2ZmZXJlZCBwcm90b2NvbCB2ZXJzaW9ucyBbMC4xLjBdLCBidXQgdGhpcyBzZXJ2ZXIgb25seSBzdXBwb3J0cyAwLjIuMC4nLFxuXHRcdFx0XHRkYXRhOiB7IHN1cHBvcnRlZFZlcnNpb25zOiBbJzAuMi4wJ10sIF9tZXRhOiB7IHZzY29kZVVwZ3JhZGVNZXRob2Q6ICdfdnNjb2RlVXBncmFkZScgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IoY29ubmVjdFByb21pc2UsIHtcblx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sXG5cdFx0XHRtZXNzYWdlOiAnQ2xpZW50IG9mZmVyZWQgcHJvdG9jb2wgdmVyc2lvbnMgWzAuMS4wXSwgYnV0IHRoaXMgc2VydmVyIG9ubHkgc3VwcG9ydHMgMC4yLjAuJyxcblx0XHRcdGRhdGE6IHsgc3VwcG9ydGVkVmVyc2lvbnM6IFsnMC4yLjAnXSwgX21ldGE6IHsgdnNjb2RlVXBncmFkZU1ldGhvZDogJ192c2NvZGVVcGdyYWRlJyB9IH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5jb25uZWN0aW9uU3RhdGUsIEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZSk7XG5cdFx0YXdhaXQgYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihjbGllbnQucmVzb3VyY2VMaXN0KFVSSS5maWxlKCcvd29ya3NwYWNlJykpLCB7XG5cdFx0XHRjb2RlOiBBaHBFcnJvckNvZGVzLlVuc3VwcG9ydGVkUHJvdG9jb2xWZXJzaW9uLFxuXHRcdFx0bWVzc2FnZTogJ0NsaWVudCBvZmZlcmVkIHByb3RvY29sIHZlcnNpb25zIFswLjEuMF0sIGJ1dCB0aGlzIHNlcnZlciBvbmx5IHN1cHBvcnRzIDAuMi4wLicsXG5cdFx0XHRkYXRhOiB7IHN1cHBvcnRlZFZlcnNpb25zOiBbJzAuMi4wJ10sIF9tZXRhOiB7IHZzY29kZVVwZ3JhZGVNZXRob2Q6ICdfdnNjb2RlVXBncmFkZScgfSB9LFxuXHRcdH0pO1xuXHRcdGNsaWVudC5kaXNwYXRjaChST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHsgZHJvcHBlZDogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCB1cGdyYWRlID0gY2xpZW50LnRyaWdnZXJWc2NvZGVVcGdyYWRlKCdfdnNjb2RlVXBncmFkZScpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzFdIGFzIEpzb25ScGNSZXF1ZXN0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdCwge1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMixcblx0XHRcdG1ldGhvZDogJ192c2NvZGVVcGdyYWRlJyxcblx0XHRcdHBhcmFtczoge30sXG5cdFx0fSk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXF1ZXN0LmlkLCByZXN1bHQ6IHsgb2s6IHRydWUsIHVwZ3JhZGVTdGFydGVkOiB0cnVlIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB1cGdyYWRlLCB7IG9rOiB0cnVlLCB1cGdyYWRlU3RhcnRlZDogdHJ1ZSB9KTtcblx0XHR0cmFuc3BvcnQuZmlyZUNsb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5jb25uZWN0aW9uU3RhdGUsIEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIHNodXRkb3duIGFzIGEgSlNPTi1SUEMgcmVxdWVzdCBzaGFwZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnNodXRkb3duKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0sIHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDEsXG5cdFx0XHRtZXRob2Q6ICdzaHV0ZG93bicsXG5cdFx0XHRwYXJhbXM6IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdGF3YWl0IHJlc3VsdFByb21pc2U7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgc2h1dGRvd24gd2l0aCBzdHJ1Y3R1cmVkIEpTT04tUlBDIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQuc2h1dGRvd24oKTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgZXJyb3I6IHsgY29kZTogQWhwRXJyb3JDb2Rlcy5UdXJuSW5Qcm9ncmVzcywgbWVzc2FnZTogJ1R1cm4gaW4gcHJvZ3Jlc3MnIH0gfSk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5UdXJuSW5Qcm9ncmVzcywgbWVzc2FnZTogJ1R1cm4gaW4gcHJvZ3Jlc3MnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwaW5nIHNlbmRzIGEgSlNPTi1SUEMgcmVxdWVzdCBhbmQgcmVzb2x2ZXMgb24gcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5waW5nKCk7XG5cblx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VudC5tZXRob2QsICdwaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnQuaWQsIDEpO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IG51bGwgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVzdWx0UHJvbWlzZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGluZyByZWplY3RzIHdpdGggUHJvdG9jb2xFcnJvciB3aGVuIHRoZSBjb25uZWN0aW9uIGNsb3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnBpbmcoKTtcblx0XHRjb25zdCByZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICdDb25uZWN0aW9uIGNsb3NlZDogdGVzdC5leGFtcGxlOjEyMzQnIH0pO1xuXHRcdHRyYW5zcG9ydC5maXJlQ2xvc2UoKTtcblx0XHRhd2FpdCByZWplY3RlZDtcblx0fSk7XG5cblx0c3VpdGUoJ3JldmVyc2UgcGVybWlzc2lvbiBnYXRpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZW1vdGUgbG9jYWwgYWRkcmVzcyBkb2VzIG5vdCByZWNlaXZlIHRydXN0ZWQgbG9jYWwgYWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGVybWlzc2lvblNlcnZpY2UgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0Z3JhbnRlZDogaWRlbnRpdHkgPT4gaWRlbnRpdHkgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudEZvcklkZW50aXR5KCdsb2NhbCcsIHVuZGVmaW5lZCwgcGVybWlzc2lvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMvcGFzc3dkJykudG9TdHJpbmcoKTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiA0MSwgbWV0aG9kOiAncmVzb3VyY2VSZWFkJywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSB9IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFkZHJlc3M6IGNsaWVudC5hZGRyZXNzLFxuXHRcdFx0XHRyZXNwb25zZTogdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWRkcmVzczogJ2xvY2FsJyxcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0XHRpZDogNDEsXG5cdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGBBY2Nlc3MgdG8gJHt1cml9IGlzIG5vdCBncmFudGVkLmAsXG5cdFx0XHRcdFx0XHRkYXRhOiB7IHJlcXVlc3Q6IHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaSwgcmVhZDogdHJ1ZSB9IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1c3RlZCBsb2NhbCBpZGVudGl0eSByZXRhaW5zIGxvY2FsIHJlc291cmNlIGFjY2VzcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBlcm1pc3Npb25TZXJ2aWNlID0gY3JlYXRlUmVzb3VyY2VTZXJ2aWNlU3R1Yih7XG5cdFx0XHRcdGdyYW50ZWQ6IGlkZW50aXR5ID0+IGlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZLFxuXHRcdFx0XHRyZWFkQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3RydXN0ZWQnKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50Rm9ySWRlbnRpdHkoTE9DQUxfQUdFTlRfSE9TVF9SRVNPVVJDRV9JREVOVElUWSwgdW5kZWZpbmVkLCBwZXJtaXNzaW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2V0Yy9wYXNzd2QnKS50b1N0cmluZygpO1xuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDQwLCBtZXRob2Q6ICdyZXNvdXJjZVJlYWQnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpIH0gfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWRkcmVzczogY2xpZW50LmFkZHJlc3MsXG5cdFx0XHRcdHJlc3BvbnNlOiB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLnBvcCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhZGRyZXNzOiAnbG9jYWwnLFxuXHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRcdGlkOiA0MCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgZGF0YTogJ2RISjFjM1JsWkE9PScsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuQmFzZTY0IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc291cmNlUmVhZCBpcyBkZW5pZWQgd2l0aCBQZXJtaXNzaW9uRGVuaWVkRXJyb3JEYXRhIHdoZW4gbm90IGdyYW50ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoZmFsc2UpKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjL3Bhc3N3ZCcpLnRvU3RyaW5nKCk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogNDIsIG1ldGhvZDogJ3Jlc291cmNlUmVhZCcsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmkgfSB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDQyLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBgQWNjZXNzIHRvICR7dXJpfSBpcyBub3QgZ3JhbnRlZC5gLFxuXHRcdFx0XHRcdGRhdGE6IHsgcmVxdWVzdDogeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpLCByZWFkOiB0cnVlIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb3VyY2VXcml0ZSBpcyBkZW5pZWQgd2l0aCBQZXJtaXNzaW9uRGVuaWVkRXJyb3JEYXRhIHdoZW4gbm90IGdyYW50ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoZmFsc2UpKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjL3Bhc3N3ZCcpLnRvU3RyaW5nKCk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogNywgbWV0aG9kOiAncmVzb3VyY2VXcml0ZScsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmksIGRhdGE6ICdhR1ZzYkc4PScsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuQmFzZTY0IH0gfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksIHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiA3LFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBgQWNjZXNzIHRvICR7dXJpfSBpcyBub3QgZ3JhbnRlZC5gLFxuXHRcdFx0XHRcdGRhdGE6IHsgcmVxdWVzdDogeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpLCB3cml0ZTogdHJ1ZSB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc291cmNlTGlzdCBpcyBkZW5pZWQgd2l0aCBQZXJtaXNzaW9uRGVuaWVkRXJyb3JEYXRhIHdoZW4gbm90IGdyYW50ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoZmFsc2UpKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjJykudG9TdHJpbmcoKTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiA1LCBtZXRob2Q6ICdyZXNvdXJjZUxpc3QnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpIH0gfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksIHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiA1LFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBgQWNjZXNzIHRvICR7dXJpfSBpcyBub3QgZ3JhbnRlZC5gLFxuXHRcdFx0XHRcdGRhdGE6IHsgcmVxdWVzdDogeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpLCByZWFkOiB0cnVlIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb3VyY2VEZWxldGUgaXMgZGVuaWVkIHdpdGggUGVybWlzc2lvbkRlbmllZEVycm9yRGF0YSB3aGVuIG5vdCBncmFudGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKGZhbHNlKSk7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2V0Yy9wYXNzd2QnKS50b1N0cmluZygpO1xuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDgsIG1ldGhvZDogJ3Jlc291cmNlRGVsZXRlJywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSB9IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLnBvcCgpLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogOCxcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRjb2RlOiBBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogYEFjY2VzcyB0byAke3VyaX0gaXMgbm90IGdyYW50ZWQuYCxcblx0XHRcdFx0XHRkYXRhOiB7IHJlcXVlc3Q6IHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaSwgd3JpdGU6IHRydWUgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvdXJjZU1vdmUgaXMgZGVuaWVkIHdoZW4gZGVzdGluYXRpb24gbGFja3Mgd3JpdGUgYWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmZpbGUoJy9ncmFudC9mb28nKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVzdFVyaSA9IFVSSS5maWxlKCcvbm8tZ3JhbnQvYmFyJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHN0dWIgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0Z3JhbnRlZDogKF9hZGRyLCB1cmkpID0+IHVyaS50b1N0cmluZygpID09PSBzb3VyY2VVcmksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBzdHViKTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiA5LCBtZXRob2Q6ICdyZXNvdXJjZU1vdmUnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgc291cmNlOiBzb3VyY2VVcmksIGRlc3RpbmF0aW9uOiBkZXN0VXJpIH0gfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksIHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiA5LFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBgQWNjZXNzIHRvICR7ZGVzdFVyaX0gaXMgbm90IGdyYW50ZWQuYCxcblx0XHRcdFx0XHRkYXRhOiB7IHJlcXVlc3Q6IHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZGVzdFVyaSwgd3JpdGU6IHRydWUgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXZlcnNlIHJlc291cmNlUmVxdWVzdCBkZWxlZ2F0ZXMgdG8gcGVybWlzc2lvbiBzZXJ2aWNlIGFuZCByZXBsaWVzIHdpdGggZW1wdHkgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGxhc3RSZXF1ZXN0OiB7IGFkZHJlc3M6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHk7IHBhcmFtczogeyB1cmk6IHN0cmluZzsgcmVhZD86IGJvb2xlYW47IHdyaXRlPzogYm9vbGVhbiB9IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzdHViID0gY3JlYXRlUmVzb3VyY2VTZXJ2aWNlU3R1Yih7XG5cdFx0XHRcdGdyYW50ZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRvblJlcXVlc3Q6IGFzeW5jIChhZGRyZXNzLCBwYXJhbXMpID0+IHsgbGFzdFJlcXVlc3QgPSB7IGFkZHJlc3MsIHBhcmFtcyB9OyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc3R1Yik7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCk7XG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDExLCBtZXRob2Q6ICdyZXNvdXJjZVJlcXVlc3QnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpLCByZWFkOiB0cnVlIH0gfSk7XG5cblx0XHRcdC8vIEFsbG93IHRoZSBhd2FpdGVkIHJlcXVlc3QgcHJvbWlzZSB0byByZXNvbHZlLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0UmVxdWVzdCwgeyBhZGRyZXNzOiAndGVzdC5leGFtcGxlOjEyMzQnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpLCByZWFkOiB0cnVlIH0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksIHsganNvbnJwYzogJzIuMCcsIGlkOiAxMSwgcmVzdWx0OiB7fSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldmVyc2UgcmVzb3VyY2VSZXF1ZXN0IHJlcGxpZXMgd2l0aCBQZXJtaXNzaW9uRGVuaWVkIG9uIGNhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0dWIgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0Z3JhbnRlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdG9uUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTsgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHN0dWIpO1xuXG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpO1xuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxMiwgbWV0aG9kOiAncmVzb3VyY2VSZXF1ZXN0JywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSwgcmVhZDogdHJ1ZSB9IH0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksIHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiAxMixcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRjb2RlOiBBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ0FjY2VzcyB0byB0aGUgcmVxdWVzdGVkIHJlc291cmNlIGlzIG5vdCBncmFudGVkLicsXG5cdFx0XHRcdFx0ZGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbXBsaWNpdCBncmFudHMgZm9yIG91dGdvaW5nIGFjdGlvbnMnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVDYXB0dXJpbmdQZXJtaXNzaW9uU2VydmljZSgpOiB7IHNlcnZpY2U6IElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2U7IGNhbGxzOiB7IGFkZHJlc3M6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHk7IHVyaTogVVJJIH1bXSB9IHtcblx0XHRcdGNvbnN0IGNhbGxzOiB7IGFkZHJlc3M6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHk7IHVyaTogVVJJIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoe1xuXHRcdFx0XHRvbkdyYW50SW1wbGljaXRSZWFkOiAoYWRkcmVzcywgdXJpKSA9PiBjYWxscy5wdXNoKHsgYWRkcmVzcywgdXJpIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyBzZXJ2aWNlLCBjYWxscyB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ1Nlc3Npb25BY3RpdmVDbGllbnRTZXQgZGlzcGF0Y2hlcyBpbXBsaWNpdCByZWFkcyBmb3IgZWFjaCBjdXN0b21pemF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQ2FwdHVyaW5nUGVybWlzc2lvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBzZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ2FocC1zZXNzaW9uOi90ZXN0Jyk7XG5cblx0XHRcdGNsaWVudC5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ2MxJyxcblx0XHRcdFx0XHR0b29sczogW10sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbnMvZm9vJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9mb28nLCBuYW1lOiAnRm9vJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vb3RoZXIvYmFyJyksIHVyaTogJ2ZpbGU6Ly8vb3RoZXIvYmFyJywgbmFtZTogJ0JhcicsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Y2FsbHMubWFwKGMgPT4gKHsgYWRkcmVzczogYy5hZGRyZXNzLCB1cmk6IGMudXJpLnRvU3RyaW5nKCkgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBhZGRyZXNzOiAndGVzdC5leGFtcGxlOjEyMzQnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMnIH0sXG5cdFx0XHRcdFx0eyBhZGRyZXNzOiAndGVzdC5leGFtcGxlOjEyMzQnLCB1cmk6ICdmaWxlOi8vL290aGVyJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NoYXRUdXJuU3RhcnRlZCBncmFudHMgYXR0YWNobWVudCBhY2Nlc3MgYmVmb3JlIHJldmVyc2UgcmVzb3VyY2VSZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3JhbnRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudFVyaSA9IFVSSS5maWxlKCcvYXR0YWNobWVudHMvZXhhbXBsZS50eHQnKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0Z3JhbnRlZDogKF9hZGRyZXNzLCB1cmksIG1vZGUpID0+IG1vZGUgPT09IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQgJiYgZ3JhbnRlZC5oYXModXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRvbkdyYW50SW1wbGljaXRSZWFkOiAoX2FkZHJlc3MsIHVyaSkgPT4gZ3JhbnRlZC5hZGQodXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRyZWFkQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2F0dGFjaG1lbnQnKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc2VydmljZSk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRUdXJuU3RhcnRlZEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDctMjNUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnUmV2aWV3IHRoaXMgZmlsZScsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0XHRcdHVyaTogYXR0YWNobWVudFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdleGFtcGxlLnR4dCcsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goJ2NvcGlsb3QtY2hhdDovdGVzdCcsIGFjdGlvbik7XG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDQyLFxuXHRcdFx0XHRtZXRob2Q6ICdyZXNvdXJjZVJlYWQnLFxuXHRcdFx0XHRwYXJhbXM6IHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogYXR0YWNobWVudFVyaS50b1N0cmluZygpIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuYXQoLTEpLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogNDIsXG5cdFx0XHRcdHJlc3VsdDogeyBkYXRhOiAnWVhSMFlXTm9iV1Z1ZEE9PScsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuQmFzZTY0IH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NoYXRQZW5kaW5nTWVzc2FnZVNldCBncmFudHMgcmVzb3VyY2UgYXR0YWNobWVudHMgb25seScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZUNhcHR1cmluZ1Blcm1pc3Npb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc2VydmljZSk7XG5cblx0XHRcdGNsaWVudC5kaXNwYXRjaCgnY29waWxvdC1jaGF0Oi90ZXN0Jywge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxdWV1ZWQtMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnUmV2aWV3IHRoZXNlIGF0dGFjaG1lbnRzJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiAnZmlsZTovLy9hdHRhY2htZW50cy9xdWV1ZWQudHh0JywgbGFiZWw6ICdxdWV1ZWQudHh0JyB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSwgZGF0YTogJycsIGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsIGxhYmVsOiAnaW5saW5lLnR4dCcgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMubWFwKGNhbGwgPT4gY2FsbC51cmkudG9TdHJpbmcoKSksIFsnZmlsZTovLy9hdHRhY2htZW50cy9xdWV1ZWQudHh0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgY3VzdG9taXphdGlvbnMgaW4gdGhlIHNhbWUgZGlyZWN0b3J5IGRlZHVwZSB0byBvbmUgZ3JhbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVDYXB0dXJpbmdQZXJtaXNzaW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3Rlc3QnKTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnYzEnLFxuXHRcdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2lucy9mb28nKSwgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2ZvbycsIG5hbWU6ICdGb28nLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW5zL2JhcicpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYmFyJywgbmFtZTogJ0JhcicsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Y2FsbHMubWFwKGMgPT4gYy51cmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFsnZmlsZTovLy9wbHVnaW5zJ10sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwZWF0IGRpc3BhdGNoIGRlZHVwZXMgcGVyIFVSSScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZUNhcHR1cmluZ1Blcm1pc3Npb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc2VydmljZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdhaHAtc2Vzc2lvbjovdGVzdCcpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25BY3RpdmVDbGllbnRTZXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjMScsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW5zL2ZvbycpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvZm9vJywgbmFtZTogJ0ZvbycsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25uZWN0aW9uIGNsb3NlIGRpc3Bvc2VzIGltcGxpY2l0IHJlYWQgZ3JhbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlkR3JhbnQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCByZXZva2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoe1xuXHRcdFx0XHRvbkdyYW50SW1wbGljaXRSZWFkOiAoKSA9PiBkaWRHcmFudC5jb21wbGV0ZSgpLFxuXHRcdFx0XHRvblJldm9rZUltcGxpY2l0UmVhZDogKF9hZGRyZXNzLCB1cmkpID0+IHJldm9rZWQucHVzaCh1cmkudG9TdHJpbmcoKSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goJ2NvcGlsb3QtY2hhdDovdGVzdCcsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncXVldWVkLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1JldmlldyB0aGlzIGF0dGFjaG1lbnQnLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLCB1cmk6ICdmaWxlOi8vL2F0dGFjaG1lbnRzL3F1ZXVlZC50eHQnLCBsYWJlbDogJ3F1ZXVlZC50eHQnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZGlkR3JhbnQucDtcblx0XHRcdHRyYW5zcG9ydC5maXJlQ2xvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXZva2VkLCBbJ2ZpbGU6Ly8vYXR0YWNobWVudHMvcXVldWVkLnR4dCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjdGl2ZSBjbGllbnQgcmVtb3ZhbCBkb2VzIG5vdCBjcmFzaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZUNhcHR1cmluZ1Blcm1pc3Npb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc2VydmljZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdhaHAtc2Vzc2lvbjovdGVzdCcpO1xuXG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWQsXG5cdFx0XHRcdGNsaWVudElkOiAnYzEnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiB3aXRoIGFjdGl2ZS1jbGllbnQgY3VzdG9taXphdGlvbnMgZ3JhbnRzIGltcGxpY2l0IHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQ2FwdHVyaW5nUGVybWlzc2lvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXG5cdFx0XHR2b2lkIGNsaWVudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjMScsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW5zL2ZvbycpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvZm9vJywgbmFtZTogJ0ZvbycsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFJlc29sdmUgdGhlIGluLWZsaWdodCBjcmVhdGVTZXNzaW9uIHJlcXVlc3QgZm9yIGNsZWFudXAuXG5cdFx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKFxuXHRcdFx0XHQobSk6IG0gaXMgSnNvblJwY1JlcXVlc3QgPT4gJ21ldGhvZCcgaW4gbSAmJiBtLm1ldGhvZCA9PT0gJ2NyZWF0ZVNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5vayhzZW50KTtcblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogc2VudC5pZCwgcmVzdWx0OiBudWxsIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRjYWxscy5tYXAoYyA9PiBjLnVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0WydmaWxlOi8vL3BsdWdpbnMnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzb2Z0IHJlY29ubmVjdCAodHJhbnNwb3J0IGZhY3RvcnkpJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gZmluZFJlcXVlc3QodHJhbnNwb3J0OiBUZXN0UHJvdG9jb2xUcmFuc3BvcnQsIG1ldGhvZDogc3RyaW5nKTogSnNvblJwY1JlcXVlc3QgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmluZChcblx0XHRcdFx0KG0pOiBtIGlzIEpzb25ScGNSZXF1ZXN0ID0+ICdtZXRob2QnIGluIG0gJiYgKG0gYXMgSnNvblJwY1JlcXVlc3QpLm1ldGhvZCA9PT0gbWV0aG9kICYmICdpZCcgaW4gbSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZmluZE5vdGlmaWNhdGlvbih0cmFuc3BvcnQ6IFRlc3RQcm90b2NvbFRyYW5zcG9ydCwgbWV0aG9kOiBzdHJpbmcpOiBKc29uUnBjTm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbmQoXG5cdFx0XHRcdChtKTogbSBpcyBKc29uUnBjTm90aWZpY2F0aW9uID0+ICdtZXRob2QnIGluIG0gJiYgKG0gYXMgSnNvblJwY05vdGlmaWNhdGlvbikubWV0aG9kID09PSBtZXRob2QgJiYgISgnaWQnIGluIG0pLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBmaW5kRGlzcGF0Y2hBY3Rpb24odHJhbnNwb3J0OiBUZXN0UHJvdG9jb2xUcmFuc3BvcnQsIGFjdGlvblR5cGU6IEFjdGlvblR5cGUpOiBKc29uUnBjTm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbmQoXG5cdFx0XHRcdChtKTogbSBpcyBKc29uUnBjTm90aWZpY2F0aW9uID0+ICdtZXRob2QnIGluIG1cblx0XHRcdFx0XHQmJiAobSBhcyBKc29uUnBjTm90aWZpY2F0aW9uKS5tZXRob2QgPT09ICdkaXNwYXRjaEFjdGlvbidcblx0XHRcdFx0XHQmJiAhKCdpZCcgaW4gbSlcblx0XHRcdFx0XHQmJiAoKG0gYXMgSnNvblJwY05vdGlmaWNhdGlvbikucGFyYW1zIGFzIHsgYWN0aW9uPzogeyB0eXBlPzogdW5rbm93biB9IH0gfCB1bmRlZmluZWQpPy5hY3Rpb24/LnR5cGUgPT09IGFjdGlvblR5cGUsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8qKiBXYWl0IHVudGlsIHRoZSBjbGllbnQgdHJhbnNpdGlvbnMgaW50byB0aGUge0BsaW5rIEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZ30gc3RhdGUuICovXG5cdFx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQ6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRpZiAoY2xpZW50LmNvbm5lY3Rpb25TdGF0ZSA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIoY2xpZW50Lm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLCBzID0+IHMgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykpO1xuXHRcdH1cblxuXHRcdC8qKiBXYWl0IGZvciB0aGUgbmV4dCB0aW1lIGEgbWV0aG9kLW5hbWVkIHJlcXVlc3QgYXBwZWFycyBpbiB0aGUgdHJhbnNwb3J0J3Mgb3V0Ym94LiAqL1xuXHRcdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JSZXF1ZXN0KHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0LCBtZXRob2Q6IHN0cmluZyk6IFByb21pc2U8SnNvblJwY1JlcXVlc3Q+IHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IHJlcSA9IGZpbmRSZXF1ZXN0KHRyYW5zcG9ydCwgbWV0aG9kKTtcblx0XHRcdFx0aWYgKHJlcSkge1xuXHRcdFx0XHRcdHJldHVybiByZXE7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0LyoqIFdhaXQgZm9yIHRoZSBuZXh0IHRpbWUgdGhlIG5ldyB0cmFuc3BvcnQgaXMgY3JlYXRlZCBieSB0aGUgZmFjdG9yeS4gKi9cblx0XHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHM6IFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydFtdLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQ+IHtcblx0XHRcdHdoaWxlICh0cmFuc3BvcnRzLmxlbmd0aCA8PSBpbmRleCkge1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHNldFRpbWVvdXQociwgMjUpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cmFuc3BvcnRzW2luZGV4XTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBCdWlsZCBhIGNsaWVudCB3aXJlZCB0byBhIHRyYW5zcG9ydCBmYWN0b3J5IHRoYXQgaGFuZHMgb3V0IGZyZXNoXG5cdFx0ICogYFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydGBzIG9uIGVhY2ggaW52b2NhdGlvbi4gUmV0dXJucyB0aGVcblx0XHQgKiBjbGllbnQgcGx1cyBhIGB0cmFuc3BvcnRzYCBhcnJheSByZWNvcmRpbmcgZWFjaCB0cmFuc3BvcnQgaGFuZGVkXG5cdFx0ICogb3V0LCBzbyB0ZXN0cyBjYW4gZHJpdmUgaGFuZHNoYWtlL3JlY29ubmVjdCBpbnRlcmFjdGlvbnMuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gY3JlYXRlRmFjdG9yeUNsaWVudChwZXJtaXNzaW9uU2VydmljZSA9IGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbik6IHsgY2xpZW50OiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDsgdHJhbnNwb3J0czogVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0W10gfSB7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnRzOiBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnRbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdFx0XHR0cmFuc3BvcnRzLnB1c2godCk7XG5cdFx0XHRcdHJldHVybiB0O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQoXG5cdFx0XHRcdCd0ZXN0LmV4YW1wbGU6MTIzNCcsIGZhY3RvcnksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjbGllbnRJbmZvLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcGVybWlzc2lvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIHsgY2xpZW50LCB0cmFuc3BvcnRzIH07XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY29tcGxldGVIYW5kc2hha2UodHJhbnNwb3J0OiBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQsIGNvbm5lY3RQcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHR3aGlsZSAoZmluZFJlcXVlc3QodHJhbnNwb3J0LCAnaW5pdGlhbGl6ZScpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbml0ID0gZmluZFJlcXVlc3QodHJhbnNwb3J0LCAnaW5pdGlhbGl6ZScpITtcblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogaW5pdC5pZCxcblx0XHRcdFx0cmVzdWx0OiB7IHByb3RvY29sVmVyc2lvbjogUFJPVE9DT0xfVkVSU0lPTiwgc2VydmVyU2VxOiA1LCBzbmFwc2hvdHM6IFtdIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldXNlcyBjbGllbnRJZCBhY3Jvc3MgdHJhbnNwb3J0IHJlY29ubmVjdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KCk7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdFx0YXdhaXQgY29tcGxldGVIYW5kc2hha2UodHJhbnNwb3J0c1swXSwgY29ubmVjdFByb21pc2UpO1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbENsaWVudElkID0gY2xpZW50LmNsaWVudElkO1xuXG5cdFx0XHRcdC8vIERyb3AgdGhlIHRyYW5zcG9ydDsgdGhlIGNsaWVudCBzaG91bGQgYXR0YWNoIGEgZnJlc2ggb25lIGFuZFxuXHRcdFx0XHQvLyByZWNvbm5lY3Qgd2l0aCB0aGUgc2FtZSBjbGllbnRJZCByYXRoZXIgdGhhbiByZXN0YXJ0IGZyb20gc2NyYXRjaC5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXG5cdFx0XHRcdGNvbnN0IHBhcmFtcyA9IHJlY29ubmVjdC5wYXJhbXMgYXMgeyBjbGllbnRJZDogc3RyaW5nOyBsYXN0U2VlblNlcnZlclNlcTogbnVtYmVyOyBzdWJzY3JpcHRpb25zOiB1bmtub3duW10gfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmFtcy5jbGllbnRJZCwgb3JpZ2luYWxDbGllbnRJZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJhbXMubGFzdFNlZW5TZXJ2ZXJTZXEsIDUpO1xuXHRcdFx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShwYXJhbXMuc3Vic2NyaXB0aW9ucykpO1xuXG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gaW5pdGlhbGl6ZSB3aXRoIGNsaWVudCBpbmZvIHdoZW4gdGhlIHNlcnZlciBmb3Jnb3QgdGhlIGNsaWVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IHJlY29ubmVjdC5pZCxcblx0XHRcdFx0XHRlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnUmVjb25uZWN0IGNsaWVudCBub3QgZm91bmQnIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGluaXRpYWxpemUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdpbml0aWFsaXplJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGluaXRpYWxpemUucGFyYW1zIGFzIHsgY2xpZW50SW5mbz86IEltcGxlbWVudGF0aW9uIH0pLmNsaWVudEluZm8sIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8pO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRcdGlkOiBpbml0aWFsaXplLmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBwcm90b2NvbFZlcnNpb246IFBST1RPQ09MX1ZFUlNJT04sIHNlcnZlclNlcTogMCwgc25hcHNob3RzOiBbXSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcGxheXMgcGVuZGluZyBvcHRpbWlzdGljIGFjdGlvbnMgYWZ0ZXIgcmVjb25uZWN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHQvLyBFc3RhYmxpc2ggYSBzZXNzaW9uIHN1YnNjcmlwdGlvbiBzbyBkaXNwYXRjaCgpIGNhbiBhcHBseSBvcHRpbWlzdGljYWxseS5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovdGVzdC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IHN1YlJlZiA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0XHRcdGNvbnN0IHN1YnNjcmliZVJlcSA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHRyYW5zcG9ydHNbMF0sICdzdWJzY3JpYmUnKTtcblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiBzdWJzY3JpYmVSZXEuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHNuYXBzaG90OiB7IHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHN0YXRlOiB7IHR1cm5zOiBbXSB9LCBmcm9tU2VxOiA1IH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRcdC8vIERpc3BhdGNoIGFuIG9wdGltaXN0aWMgYWN0aW9uIHJpZ2h0IGJlZm9yZSB0aGUgdHJhbnNwb3J0IGRyb3BzLlxuXHRcdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25UaXRsZUNoYW5nZWRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHRcdHRpdGxlOiAnUmVuYW1lZCBieSB1c2VyJyxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbERpc3BhdGNoID0gZmluZERpc3BhdGNoQWN0aW9uKHRyYW5zcG9ydHNbMF0sIEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCk7XG5cdFx0XHRcdGFzc2VydC5vayhpbml0aWFsRGlzcGF0Y2gsICdvcHRpbWlzdGljIGRpc3BhdGNoIHNob3VsZCByZWFjaCB0aGUgb3JpZ2luYWwgdHJhbnNwb3J0Jyk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxTZXEgPSAoaW5pdGlhbERpc3BhdGNoLnBhcmFtcyBhcyB7IGNsaWVudFNlcTogbnVtYmVyIH0pLmNsaWVudFNlcTtcblxuXHRcdFx0XHQvLyBEcm9wIHRoZSB0cmFuc3BvcnQgbWlkLWZsaWdodC4gVGhlIG5ldyB0cmFuc3BvcnQgcmVjZWl2ZXMgYVxuXHRcdFx0XHQvLyByZWNvbm5lY3QgUlBDIHBsdXMgYSByZXBsYXkgb2YgdGhlIHVuY29uZmlybWVkIGRpc3BhdGNoLlxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGNvbnN0IHJlcGxheWVkID0gZmluZERpc3BhdGNoQWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlcGxheWVkLCAncGVuZGluZyBvcHRpbWlzdGljIGFjdGlvbiBzaG91bGQgYmUgcmUtc2VudCBhZnRlciByZWNvbm5lY3QnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXBsYXllZC5wYXJhbXMgYXMgeyBjbGllbnRTZXE6IG51bWJlciB9KS5jbGllbnRTZXEsIGluaXRpYWxTZXEsICdyZXBsYXllZCBkaXNwYXRjaCBtdXN0IHJldXNlIHRoZSBvcmlnaW5hbCBjbGllbnRTZXEnKTtcblxuXHRcdFx0XHRzdWJSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdHRhY2htZW50IGdyYW50IHJlbWFpbnMgYXZhaWxhYmxlIHdoZW4gYSBwZW5kaW5nIHR1cm4gaXMgcmVwbGF5ZWQgYWZ0ZXIgcmVjb25uZWN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50VXJpID0gVVJJLmZpbGUoJy9hdHRhY2htZW50cy9yZXBsYXllZC50eHQnKTtcblx0XHRcdFx0Y29uc3QgZ3JhbnRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRjb25zdCBwZXJtaXNzaW9uU2VydmljZSA9IGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoe1xuXHRcdFx0XHRcdGdyYW50ZWQ6IChfYWRkcmVzcywgdXJpLCBtb2RlKSA9PiBtb2RlID09PSBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkICYmIGdyYW50ZWQuaGFzKHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRvbkdyYW50SW1wbGljaXRSZWFkOiAoX2FkZHJlc3MsIHVyaSkgPT4gZ3JhbnRlZC5hZGQodXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdHJlYWRCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygncmVwbGF5ZWQnKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KHBlcm1pc3Npb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdC1jaGF0Oi90ZXN0LWNoYXQnKTtcblx0XHRcdFx0Y29uc3Qgc3ViUmVmID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuQ2hhdCwgY2hhdFVyaSwgJ3Rlc3QnKTtcblx0XHRcdFx0Y29uc3Qgc3Vic2NyaWJlUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QodHJhbnNwb3J0c1swXSwgJ3N1YnNjcmliZScpO1xuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHN1YnNjcmliZVJlcS5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IGNoYXRVcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdIH0sIGZyb21TZXE6IDUgfSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKGNoYXRVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wNy0yM1QwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHR0ZXh0OiAnUmV2aWV3IHRoaXMgZmlsZScsXG5cdFx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0dXJpOiBhdHRhY2htZW50VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiAncmVwbGF5ZWQudHh0Jyxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3QgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZWNvbm5lY3QnKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdC5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgdHlwZTogUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXksIGFjdGlvbnM6IFtdLCBtaXNzaW5nOiBbXSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmREaXNwYXRjaEFjdGlvbihyZWNvbm5lY3RUcmFuc3BvcnQsIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkKSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IDQyLFxuXHRcdFx0XHRcdG1ldGhvZDogJ3Jlc291cmNlUmVhZCcsXG5cdFx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGF0dGFjaG1lbnRVcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjb25uZWN0VHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5hdCgtMSksIHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0XHRpZDogNDIsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IGRhdGE6ICdjbVZ3YkdGNVpXUT0nLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLkJhc2U2NCB9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRzdWJSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyByZXBsYXkgd2hlbiBzZXJ2ZXIgYWxyZWFkeSBlY2hvZWQgdGhlIGFjdGlvbiBpbiB0aGUgcmVwbGF5IGJ1ZmZlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovdGVzdC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IHN1YlJlZiA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0XHRcdGNvbnN0IHN1YnNjcmliZVJlcSA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHRyYW5zcG9ydHNbMF0sICdzdWJzY3JpYmUnKTtcblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiBzdWJzY3JpYmVSZXEuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHNuYXBzaG90OiB7IHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHN0YXRlOiB7IHR1cm5zOiBbXSB9LCBmcm9tU2VxOiA1IH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbjogU2Vzc2lvblRpdGxlQ2hhbmdlZEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHRcdFx0dGl0bGU6ICdFY2hvZWQgYmFjaycsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNsaWVudC5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbik7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxEaXNwYXRjaCA9IGZpbmREaXNwYXRjaEFjdGlvbih0cmFuc3BvcnRzWzBdLCBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpITtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbFNlcSA9IChpbml0aWFsRGlzcGF0Y2gucGFyYW1zIGFzIHsgY2xpZW50U2VxOiBudW1iZXIgfSkuY2xpZW50U2VxO1xuXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3QgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZWNvbm5lY3QnKTtcblx0XHRcdFx0Ly8gUmVwbHkgd2l0aCBhIHJlcGxheSBidWZmZXIgdGhhdCBhbHJlYWR5IGNvbnRhaW5zIG91ciBhY3Rpb24sXG5cdFx0XHRcdC8vIGVjaG9lZCBiYWNrIHdpdGggb3JpZ2luID0geyBjbGllbnRJZCwgY2xpZW50U2VxIH0uXG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJTZXE6IDYsXG5cdFx0XHRcdFx0XHRcdG9yaWdpbjogeyBjbGllbnRJZDogY2xpZW50LmNsaWVudElkLCBjbGllbnRTZXE6IGluaXRpYWxTZXEgfSxcblx0XHRcdFx0XHRcdFx0cmVqZWN0aW9uUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdG1pc3Npbmc6IFtdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZERpc3BhdGNoQWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdhY3Rpb24gZWNob2VkIGJhY2sgdmlhIHJlcGxheSBidWZmZXIgbXVzdCBub3QgYmUgcmUtc2VudCcpO1xuXG5cdFx0XHRcdHN1YlJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ291dGdvaW5nIHJlcXVlc3RzIHdhaXQgZm9yIHJlY29ubmVjdCB0byBjb21wbGV0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Ly8gRHJvcCB0aGUgdHJhbnNwb3J0LCB0aGVuIGlzc3VlIGEgbmV3IHJlcXVlc3Qgd2hpbGUgdGhlXG5cdFx0XHRcdC8vIHNvZnQtcmVjb25uZWN0IGlzIGluIGZsaWdodC4gVGhlIHJlcXVlc3QgbXVzdCBsYW5kIG9uIHRoZSBuZXdcblx0XHRcdFx0Ly8gdHJhbnNwb3J0IHJhdGhlciB0aGFuIHJhY2luZyB0aGUgZGVhZCBvbmUgb3IgYmVpbmcgZHJvcHBlZC5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0Y29uc3QgaW5GbGlnaHQgPSBjbGllbnQucmVzb3VyY2VMaXN0KFVSSS5maWxlKCcvd29ya3NwYWNlJykpLmNhdGNoKGVyciA9PiBlcnIpO1xuXG5cdFx0XHRcdC8vIEhvbGQgb2ZmIHRoZSBuZXcgdHJhbnNwb3J0J3MgY29ubmVjdCgpIHNvIHRoZSByZXF1ZXN0IHN0YXlzIGdhdGVkLlxuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZXNvdXJjZUxpc3QnKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdyZXF1ZXN0IG11c3QgTk9UIGJlIHNlbnQgYmVmb3JlIHJlY29ubmVjdCBjb21wbGV0ZXMnKTtcblxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc291cmNlTGlzdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3Jlc291cmNlTGlzdCcpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IHJlc291cmNlTGlzdC5pZCwgcmVzdWx0OiB7IGVudHJpZXM6IFtdIH0gfSk7XG5cblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBpbkZsaWdodDtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZSwgeyBlbnRyaWVzOiBbXSB9KTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0ZWQgYWN0aW9uIGVjaG9lZCBpbiByZXBsYXkgYnVmZmVyIGlzIG5vdCBhcHBsaWVkIHRvIGNvbmZpcm1lZCBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovdGVzdC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IHN1YlJlZiA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb248eyBzdW1tYXJ5OiB7IHRpdGxlOiBzdHJpbmcgfSB9PihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc2Vzc2lvblVyaSwgJ3Rlc3QnKTtcblx0XHRcdFx0Y29uc3Qgc3Vic2NyaWJlUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QodHJhbnNwb3J0c1swXSwgJ3N1YnNjcmliZScpO1xuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHN1YnNjcmliZVJlcS5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgc3VtbWFyeTogeyB0aXRsZTogJ09yaWdpbmFsJyB9LCB0dXJuczogW10gfSwgZnJvbVNlcTogNSB9IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25UaXRsZUNoYW5nZWRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHRcdHRpdGxlOiAnUmVqZWN0ZWQgY2hhbmdlJyxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbERpc3BhdGNoID0gZmluZERpc3BhdGNoQWN0aW9uKHRyYW5zcG9ydHNbMF0sIEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCkhO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsU2VxID0gKGluaXRpYWxEaXNwYXRjaC5wYXJhbXMgYXMgeyBjbGllbnRTZXE6IG51bWJlciB9KS5jbGllbnRTZXE7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHQvLyBTZXJ2ZXIgZWNob2VzIGJhY2sgdGhlIGFjdGlvbiB3aXRoIGEgcmVqZWN0aW9uUmVhc29uIFx1MjAxNCB0aGVcblx0XHRcdFx0Ly8gY29uZmlybWVkIHN0YXRlIG11c3QgTk9UIGFkdmFuY2UgdG8gJ1JlamVjdGVkIGNoYW5nZScuXG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJTZXE6IDYsXG5cdFx0XHRcdFx0XHRcdG9yaWdpbjogeyBjbGllbnRJZDogY2xpZW50LmNsaWVudElkLCBjbGllbnRTZXE6IGluaXRpYWxTZXEgfSxcblx0XHRcdFx0XHRcdFx0cmVqZWN0aW9uUmVhc29uOiAndW5hdXRob3JpemVkJyxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0bWlzc2luZzogW10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHN1YlJlZi5vYmplY3QudmVyaWZpZWRWYWx1ZTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25TdGF0ZSwgJ3Nlc3Npb24gc3RhdGUgc2hvdWxkIGJlIGh5ZHJhdGVkJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uU3RhdGUuc3VtbWFyeS50aXRsZSwgJ09yaWdpbmFsJyxcblx0XHRcdFx0XHQncmVqZWN0ZWQgYWN0aW9uIG11c3Qgbm90IGhhdmUgYmVlbiBhcHBsaWVkIHRvIGNvbmZpcm1lZCBzdGF0ZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZERpc3BhdGNoQWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdyZWplY3RlZCBhY3Rpb24gbXVzdCBub3QgYmUgcmUtZGlzcGF0Y2hlZCcpO1xuXG5cdFx0XHRcdHN1YlJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NuYXBzaG90IHJlY29ubmVjdCByZXN1bHQgcmVzZWF0cyB0aGUgcm9vdCBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0dHlwZTogUmVjb25uZWN0UmVzdWx0VHlwZS5TbmFwc2hvdCxcblx0XHRcdFx0XHRcdHNuYXBzaG90czogW3tcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRcdFx0XHRzdGF0ZTogeyBhZ2VudHM6IFt7IHByb3ZpZGVyOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIG1vZGVsczogW10sIHRvb2xzOiBbXSB9XSwgYWN0aXZlU2Vzc2lvbnM6IDAsIHRlcm1pbmFsczogW10gfSxcblx0XHRcdFx0XHRcdFx0ZnJvbVNlcTogNDIsXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cblx0XHRcdFx0Y29uc3Qgcm9vdCA9IGNsaWVudC5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRcdGFzc2VydC5vayhyb290ICYmICEocm9vdCBpbnN0YW5jZW9mIEVycm9yKSwgJ3Jvb3Qgc3RhdGUgc2hvdWxkIGJlIGh5ZHJhdGVkIGZyb20gc25hcHNob3QnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuYWdlbnRzWzBdPy5wcm92aWRlciwgJ2NvcGlsb3QnKTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhbnNwb3J0IGRyb3AgZHVyaW5nIHJlY29ubmVjdCBSUEMgcmUtc2NoZWR1bGVzIGluc3RlYWQgb2YgaGFuZ2luZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCBhdHRlbXB0MSA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdGF0dGVtcHQxLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVxdWVzdChhdHRlbXB0MSwgJ3JlY29ubmVjdCcpO1xuXG5cdFx0XHRcdC8vIFNlY29uZCBkcm9wIG1pZC1oYW5kc2hha2UuIFRoZSBhdHRlbXB0J3MgcGVuZGluZyBSUEMgbXVzdCBiZSByZWplY3RlZFxuXHRcdFx0XHQvLyBzbyB0aGUgcmV0cnkgcGF0aCBmaXJlczsgd2l0aG91dCB0aGF0IHRoZSBhd2FpdCBzdGF5cyBwZW5kaW5nIGFuZFxuXHRcdFx0XHQvLyBldmVyeSBzdWJzZXF1ZW50IHJlcXVlc3QgZGVhZGxvY2tzIG9uIHRoZSByZWNvbm5lY3QgZ2F0ZS5cblx0XHRcdFx0YXR0ZW1wdDEuZmlyZUNsb3NlKCk7XG5cblx0XHRcdFx0Y29uc3QgYXR0ZW1wdDIgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDIpO1xuXHRcdFx0XHRhdHRlbXB0Mi5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0MiA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KGF0dGVtcHQyLCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdGF0dGVtcHQyLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdDIuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQsXG5cdFx0XHRcdFx0J2NsaWVudCBtdXN0IHJlY292ZXIgdG8gQ29ubmVjdGVkIGFmdGVyIGEgbWlkLXJlY29ubmVjdCBkcm9wJyk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1zZXNzaW9uIGRpc3BhdGNoIGlzc3VlZCBkdXJpbmcgcmVjb25uZWN0IHJpZGVzIHJldHJpZXMgdW50aWwgc3VjY2VzcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Ly8gRHJvcCB0cmFuc3BvcnQgYmVmb3JlIGFueSBzdWNjZXNzZnVsIHJlY29ubmVjdCBzbyB0aGUgZ2F0ZSBzdGF5c1xuXHRcdFx0XHQvLyBlbmdhZ2VkIGFjcm9zcyB0aGUgZmFpbGVkIGF0dGVtcHQuXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblxuXHRcdFx0XHQvLyBBIHRlcm1pbmFsIGFjdGlvbiBkaXNwYXRjaGVkIHdoaWxlIHJlY29ubmVjdGluZy4gVGhlcmUgaXMgbm9cblx0XHRcdFx0Ly8gb3B0aW1pc3RpYyByZXBsYXkgcGF0aCBmb3IgdGVybWluYWwvcm9vdCBhY3Rpb25zOyB0aGUgb25seSB3YXlcblx0XHRcdFx0Ly8gdGhlc2UgcmVhY2ggdGhlIHNlcnZlciBpcyB2aWEgdGhlIG5vdGlmaWNhdGlvbiBnYXRlLlxuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IFVSSS5wYXJzZSgnYWdlbnRob3N0LXRlcm1pbmFsOi90ZXJtLTEnKTtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHRlcm1pbmFsVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsSW5wdXQsXG5cdFx0XHRcdFx0ZGF0YTogJ2VjaG8gaGVsbG9cXG4nLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBGaXJzdCBhdHRlbXB0IGZhaWxzLiBUaGUgbm90aWZpY2F0aW9uIG11c3QgTk9UIGJlIGRyb3BwZWQ7IHRoZVxuXHRcdFx0XHQvLyByZWplY3Rpb24gaGFuZGxlciBzaG91bGQgcmUtcXVldWUgaXQgb250byB0aGUgbmV3IGdhdGUuXG5cdFx0XHRcdGNvbnN0IGF0dGVtcHQxID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0YXR0ZW1wdDEuY29ubmVjdERlZmVycmVkLmVycm9yKG5ldyBFcnJvcignY29ubmVjdCBmYWlsZWQnKSk7XG5cblx0XHRcdFx0Y29uc3QgYXR0ZW1wdDIgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDIpO1xuXHRcdFx0XHRhdHRlbXB0Mi5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0MiA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KGF0dGVtcHQyLCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdGF0dGVtcHQyLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdDIuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGNvbnN0IGRpc3BhdGNoZWQgPSBmaW5kTm90aWZpY2F0aW9uKGF0dGVtcHQyLCAnZGlzcGF0Y2hBY3Rpb24nKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGRpc3BhdGNoZWQsICd0ZXJtaW5hbCBkaXNwYXRjaCBtdXN0IHJpZGUgdGhlIGZhaWxlZCBhdHRlbXB0IHRocm91Z2ggdG8gdGhlIG5leHQgc3VjY2Vzc2Z1bCBvbmUnKTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdCBpc3N1ZWQgZHVyaW5nIHJlY29ubmVjdCByaWRlcyByZXRyaWVzIHVudGlsIHN1Y2Nlc3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KCk7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdFx0YXdhaXQgY29tcGxldGVIYW5kc2hha2UodHJhbnNwb3J0c1swXSwgY29ubmVjdFByb21pc2UpO1xuXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblxuXHRcdFx0XHQvLyBJc3N1ZSBhIHJlcXVlc3Qgd2hpbGUgdGhlIGdhdGUgaXMgZW5nYWdlZC4gVGhlIGZpcnN0IHJlY29ubmVjdFxuXHRcdFx0XHQvLyBhdHRlbXB0IHdpbGwgZmFpbDsgdGhlIHJlcXVlc3QgbXVzdCBOT1Qgc3VyZmFjZSB0aGUgdHJhbnNpZW50XG5cdFx0XHRcdC8vIGZhaWx1cmUgdG8gaXRzIGNhbGxlciwgaXQgc2hvdWxkIHN0YXkgZ2F0ZWQgdW50aWwgdGhlIG5leHRcblx0XHRcdFx0Ly8gc3VjY2Vzc2Z1bCBoYW5kc2hha2UuXG5cdFx0XHRcdGNvbnN0IGluRmxpZ2h0ID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKS5jYXRjaChlcnIgPT4gZXJyKTtcblxuXHRcdFx0XHRjb25zdCBhdHRlbXB0MSA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdGF0dGVtcHQxLmNvbm5lY3REZWZlcnJlZC5lcnJvcihuZXcgRXJyb3IoJ2Nvbm5lY3QgZmFpbGVkJykpO1xuXG5cdFx0XHRcdGNvbnN0IGF0dGVtcHQyID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRSZXF1ZXN0KGF0dGVtcHQyLCAncmVzb3VyY2VMaXN0JyksIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQncmVxdWVzdCBtdXN0IG5vdCBzbGlwIHRocm91Z2ggdG8gdGhlIG5ldyB0cmFuc3BvcnQgYmVmb3JlIGl0cyBoYW5kc2hha2UgY29tcGxldGVzJyk7XG5cblx0XHRcdFx0YXR0ZW1wdDIuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdDIgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChhdHRlbXB0MiwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRhdHRlbXB0Mi5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QyLmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc291cmNlTGlzdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KGF0dGVtcHQyLCAncmVzb3VyY2VMaXN0Jyk7XG5cdFx0XHRcdGF0dGVtcHQyLmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXNvdXJjZUxpc3QuaWQsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgaW5GbGlnaHQ7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWUsIHsgZW50cmllczogW10gfSxcblx0XHRcdFx0XHQncmVxdWVzdCBtdXN0IHJlc29sdmUgb25jZSBhIGxhdGVyIHJlY29ubmVjdCBhdHRlbXB0IHN1Y2NlZWRzJyk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ19zZW5kRXh0ZW5zaW9uUmVxdWVzdCB3YWl0cyBmb3IgdGhlIHJlY29ubmVjdCBnYXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHNodXRkb3duID0gY2xpZW50LnNodXRkb3duKCkuY2F0Y2goZXJyID0+IGVycik7XG5cblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0Ly8gRXh0ZW5zaW9uIHJlcXVlc3RzIG11c3Qgbm90IHJhY2UgdGhlIGRlYWQgdHJhbnNwb3J0IFx1MjAxNCBub3RoaW5nXG5cdFx0XHRcdC8vIHNob3VsZCBiZSBvbiB0aGUgd2lyZSB5ZXQuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdzaHV0ZG93bicpLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0J3NodXRkb3duIGV4dGVuc2lvbiByZXF1ZXN0IG11c3QgTk9UIGJlIHNlbnQgYmVmb3JlIHJlY29ubmVjdCBjb21wbGV0ZXMnKTtcblxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHNodXRkb3duUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAnc2h1dGRvd24nKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiBzaHV0ZG93blJlcS5pZCwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdFx0XHRhd2FpdCBzaHV0ZG93bjtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2F0Y2hkb2cgZGVhZC10cmFuc3BvcnQgZGV0ZWN0aW9uIHRyaWdnZXJzIHNvZnQgcmVjb25uZWN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDYwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHQvLyBJc3N1ZSBhIHJlcXVlc3QgdGhlIHNlcnZlciBuZXZlciBhbnN3ZXJzLiBBZnRlciBXQVRDSERPR19USU1FT1VUX01TXG5cdFx0XHRcdC8vIG9mIHNpbGVuY2UgdGhlIHdhdGNoZG9nIG11c3Qgcm91dGUgdGhyb3VnaCB0aGUgc29mdC1yZWNvbm5lY3Rcblx0XHRcdFx0Ly8gcGF0aCBcdTIwMTQgKm5vdCogcmVseSBvbiB0aGUgdHJhbnNwb3J0J3Mgb25DbG9zZSBmaXJpbmcgKGl0IG5ldmVyXG5cdFx0XHRcdC8vIHdpbGwgZm9yIGEgc2lsZW50IGRlYWQgc29ja2V0LCBzZWUgV2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0LmRpc3Bvc2UpLlxuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKS5jYXRjaChlcnIgPT4gZXJyKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgzMF8wMDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcsXG5cdFx0XHRcdFx0J3dhdGNoZG9nIG11c3QgZHJpdmUgdGhlIGNsaWVudCBpbnRvIFJlY29ubmVjdGluZyB2aWEgc29mdCByZWNvbm5lY3QgcmF0aGVyIHRoYW4gZmlyaW5nIG9uRGlkQ2xvc2UnKTtcblxuXHRcdFx0XHRjb25zdCBlcnIgPSBhd2FpdCBwZW5kaW5nO1xuXHRcdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcik7XG5cdFx0XHRcdGFzc2VydC5tYXRjaCgoZXJyIGFzIFByb3RvY29sRXJyb3IpLm1lc3NhZ2UsIC9Db25uZWN0aW9uIGFwcGVhcnMgZGVhZC8pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFzQixzQkFBc0I7QUFDNUMsU0FBUyxzQkFBc0IscUNBQXFDO0FBQ3BFLFNBQVMseUJBQW9ELGtDQUE2RCwwQ0FBMEM7QUFDcEssU0FBUywyQkFBcUQ7QUFDOUQsU0FBUyxpQkFBaUIsMkJBQTJCO0FBQ3JELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCLG1DQUFtQztBQUM5RCxTQUFTLGtCQUF3SjtBQUNqSyxTQUFTLHFCQUE0STtBQUNySixTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUIsdUJBQXVCLGFBQWEsb0JBQW9CLDBCQUEwQixnQkFB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TSxpQkFBaUIsT0FBTyxRQUFRO0FBQ3RDLGNBQU0sa0JBQWtCLFdBQVcsQ0FBQyxHQUFHLGNBQWM7QUFFckQsbUJBQVcsQ0FBQyxFQUFFLFVBQVU7QUFDeEIsY0FBTSxvQkFBb0IsTUFBTTtBQUNoQyxjQUFNLFdBQVcsT0FBTyxTQUFTLEVBQUUsTUFBTSxTQUFPLEdBQUc7QUFFbkQsY0FBTSxxQkFBcUIsTUFBTSxpQkFBaUIsWUFBWSxDQUFDO0FBRy9ELGVBQU87QUFBQSxVQUFZLFlBQVksb0JBQW9CLFVBQVU7QUFBQSxVQUFHO0FBQUEsVUFDL0Q7QUFBQSxRQUF3RTtBQUV6RSwyQkFBbUIsZ0JBQWdCLFNBQVM7QUFDNUMsY0FBTSxZQUFZLE1BQU0sZUFBZSxvQkFBb0IsV0FBVztBQUN0RSwyQkFBbUIsWUFBWTtBQUFBLFVBQzlCLFNBQVM7QUFBQSxVQUFPLElBQUksVUFBVTtBQUFBLFVBQzlCLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixRQUFRLFNBQVMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFFO0FBQUEsUUFDdEUsQ0FBQztBQUVELGNBQU0sY0FBYyxNQUFNLGVBQWUsb0JBQW9CLFVBQVU7QUFDdkUsMkJBQW1CLFlBQVksRUFBRSxTQUFTLE9BQU8sSUFBSSxZQUFZLElBQUksUUFBUSxLQUFLLENBQUM7QUFDbkYsY0FBTTtBQUNOLGVBQU8sUUFBUTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDZEQUE2RCxpQkFBa0I7QUFDbkYsV0FBSyxRQUFRLEdBQU07QUFDbkIsYUFBTyxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNwRixjQUFNLEVBQUUsUUFBUSxXQUFXLElBQUksb0JBQW9CO0FBQ25ELGNBQU0saUJBQWlCLE9BQU8sUUFBUTtBQUN0QyxjQUFNLGtCQUFrQixXQUFXLENBQUMsR0FBRyxjQUFjO0FBTXJELGNBQU0sVUFBVSxPQUFPLGFBQWEsSUFBSSxLQUFLLFlBQVksQ0FBQyxFQUFFLE1BQU0sQ0FBQUEsU0FBT0EsSUFBRztBQUM1RSxjQUFNLFFBQVEsR0FBTTtBQUVwQixlQUFPO0FBQUEsVUFBWSxPQUFPO0FBQUEsVUFBaUIscUJBQXFCO0FBQUEsVUFDL0Q7QUFBQSxRQUFtRztBQUVwRyxjQUFNLE1BQU0sTUFBTTtBQUNsQixlQUFPLEdBQUcsZUFBZSxhQUFhO0FBQ3RDLGVBQU8sTUFBTyxJQUFzQixTQUFTLHlCQUF5QjtBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJlcnIiXQp9Cg==
