import assert from "assert";
import * as os from "os";
import { DeferredPromise } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { createRemoteAgentHostState } from "../../common/remoteAgentHostMetadata.js";
import { SSHAuthMethod } from "../../common/sshRemoteAgentHost.js";
import { SSHRemoteAgentHostMainService, makeAuthHandler } from "../../node/sshRemoteAgentHostService.js";
const dataFolderName = ".vscode-insiders";
const quality = "insider";
function stateJson(pid, port, connectionToken) {
  return JSON.stringify(createRemoteAgentHostState({
    pid,
    port,
    connectionToken: connectionToken ?? void 0,
    quality
  }));
}
class MockSSHChannel {
  constructor() {
    this.stderr = { on: () => {
    } };
  }
  on(_event, _listener) {
    return this;
  }
  close() {
  }
}
class MockSSHClient {
  constructor(execResponses = []) {
    this.execCalls = [];
    this.ended = false;
    this._closeListeners = [];
    this._errorListeners = [];
    this._execResponses = execResponses;
  }
  on(event, listener) {
    if (event === "close") {
      this._closeListeners.push(listener);
    } else if (event === "error") {
      this._errorListeners.push(listener);
    }
    return this;
  }
  removeListener(event, listener) {
    const list = event === "close" ? this._closeListeners : event === "error" ? this._errorListeners : void 0;
    if (list) {
      const idx = list.indexOf(listener);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
    }
    return this;
  }
  fireClose() {
    for (const listener of this._closeListeners) {
      listener();
    }
  }
  get closeListenerCount() {
    return this._closeListeners.length;
  }
  get errorListenerCount() {
    return this._errorListeners.length;
  }
  connect() {
  }
  exec(command, callback) {
    this.execCalls.push(command);
    const response = this._execResponses.shift() ?? { stdout: "", code: 0 };
    const channel = new MockSSHChannel();
    queueMicrotask(() => {
      if (response.stdout) {
        const origOn = channel.on.bind(channel);
        let dataHandler;
        let closeHandler;
        channel.on = ((event, listener) => {
          if (event === "data") {
            dataHandler = listener;
          } else if (event === "close") {
            closeHandler = listener;
          }
          return origOn(event, listener);
        });
        callback(void 0, channel);
        if (dataHandler) {
          dataHandler(Buffer.from(response.stdout));
        }
        if (closeHandler) {
          closeHandler(response.code);
        }
      } else {
        let closeHandler;
        const origOn = channel.on.bind(channel);
        channel.on = ((event, listener) => {
          if (event === "close") {
            closeHandler = listener;
          }
          return origOn(event, listener);
        });
        callback(void 0, channel);
        if (closeHandler) {
          closeHandler(response.code);
        }
      }
    });
    return this;
  }
  forwardOut(_srcIP, _srcPort, _dstIP, _dstPort, _callback) {
    return this;
  }
  end() {
    this.ended = true;
  }
}
class KeyboardInteractiveMockSSHClient {
  constructor() {
    this.ended = false;
    this._errorListeners = [];
  }
  on(event, listener) {
    if (event === "error") {
      this._errorListeners.push(listener);
    }
    return this;
  }
  removeListener(_event, _listener) {
    return this;
  }
  connect(config) {
    const authHandler = config.authHandler;
    authHandler?.(null, false, (method) => {
      if (method && method.type === "keyboard-interactive") {
        method.prompt("Keyboard", "", "en-US", [{ prompt: "Password: ", echo: false }], (responses) => {
          this.finishResponses = responses;
          this.fireError(new Error("All configured authentication methods failed"));
        });
      }
    });
  }
  end() {
    this.ended = true;
  }
  fireError(err) {
    for (const listener of this._errorListeners) {
      listener(err);
    }
  }
}
function makeConfig(overrides) {
  return {
    host: "10.0.0.1",
    username: "testuser",
    authMethod: SSHAuthMethod.Agent,
    name: "test-host",
    ...overrides
  };
}
class TestableSSHRemoteAgentHostMainService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.mockClients = [];
    /** Responses that _connectSSH will hand to MockSSHClient for its exec queue. */
    this.execResponses = [];
    /** What _startRemoteAgentHost will resolve with. */
    this.startResult = {
      port: 9999,
      connectionToken: "tok-abc",
      pid: 42
    };
    this.startCalled = 0;
    /** What _createWebSocketRelay will resolve with. Set to an Error to reject. */
    this.relayResult = {
      send: () => {
      },
      close: () => {
      }
    };
    this.relayCalled = 0;
    /** Public override so tests can shorten the relay creation timeout. */
    this.relayCreationTimeoutMs = 3e4;
    /** Stored onMessage callbacks from relays, most recent last. */
    this._relayMessageCallbacks = [];
    /** Stored onClose callbacks from relays, most recent last. */
    this._relayCloseCallbacks = [];
    /** Stored relay result objects, most recent last (for makePreviousRelaySyncClose). */
    this._relayResults = [];
  }
  async _connectSSH(_config) {
    const client = new MockSSHClient(this.execResponses);
    this.mockClients.push(client);
    return client;
  }
  async _startRemoteAgentHost(_client, _cliBin, _cliDataDir, _commandOverride) {
    this.startCalled++;
    return { ...this.startResult, stream: new MockSSHChannel() };
  }
  async _createWebSocketRelay(_client, _dstHost, _dstPort, _connectionToken, onMessage, onClose) {
    this.relayCalled++;
    this._relayMessageCallbacks.push(onMessage);
    this._relayCloseCallbacks.push(onClose);
    if (this.hangRelayCreationOnCall === this.relayCalled) {
      return new Promise(() => {
      });
    }
    const hookResult = this.relayHook?.(this.relayCalled);
    if (hookResult !== void 0) {
      if (hookResult instanceof Error) {
        throw hookResult;
      }
      this._relayResults.push(hookResult);
      return hookResult;
    }
    const result = this.relayResult;
    if (result instanceof Error) {
      throw result;
    }
    const relayObj = { send: result.send, close: result.close };
    this._relayResults.push(relayObj);
    return relayObj;
  }
  async resolveSSHConfig(_host) {
    return {
      hostname: "10.0.0.1",
      port: 22,
      user: "testuser",
      identityFile: [],
      identityAgent: void 0,
      forwardAgent: false
    };
  }
  /**
   * Simulate the old (superseded) relay's WebSocket close event firing.
   * This calls the onClose callback of the second-to-last relay.
   */
  simulateOldRelayClose() {
    if (this._relayCloseCallbacks.length >= 2) {
      this._relayCloseCallbacks[this._relayCloseCallbacks.length - 2]();
    }
  }
  /**
   * Modify the most recently created relay so that calling close()
   * synchronously fires its onClose callback. This simulates a WebSocket
   * implementation that fires the 'close' event inline during ws.close().
   */
  makePreviousRelaySyncClose() {
    const idx = this._relayResults.length - 1;
    if (idx >= 0 && this._relayCloseCallbacks.length > idx) {
      const onClose = this._relayCloseCallbacks[idx];
      this._relayResults[idx].close = () => {
        onClose();
      };
    }
  }
  /**
   * Simulate a message arriving on a specific relay (0-indexed).
   * Defaults to the most recent relay.
   */
  simulateRelayMessage(data, relayIndex) {
    const idx = relayIndex ?? this._relayMessageCallbacks.length - 1;
    this._relayMessageCallbacks[idx]?.(data);
  }
  /**
   * Simulate the current (active) relay's WebSocket close event firing.
   */
  simulateCurrentRelayClose() {
    if (this._relayCloseCallbacks.length > 0) {
      this._relayCloseCallbacks[this._relayCloseCallbacks.length - 1]();
    }
  }
  /** Sets the relay creation timeout; exposed for tests only. */
  setRelayCreationTimeoutForTest(ms) {
    this.relayCreationTimeoutMs = ms;
  }
  startKeyboardInteractiveForTest(prompts, finish, cancelConnect) {
    return this._handleKeyboardInteractive("ssh:test-host", "test-host", "testuser", "", "", prompts, finish, cancelConnect);
  }
}
class KeyboardInteractiveConnectTestService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.client = new KeyboardInteractiveMockSSHClient();
  }
  async _createSSHClient() {
    return this.client;
  }
  async _buildAuthAttempts(config) {
    return [{ type: "keyboard-interactive", username: config.username }];
  }
  connectSSHForTest(config) {
    return this._connectSSH(config, "ssh:test-host");
  }
}
suite("SSHRemoteAgentHostMainService - connect flow", () => {
  const disposables = new DisposableStore();
  let service;
  setup(() => {
    const logService = new NullLogService();
    const productService = {
      _serviceBrand: void 0,
      quality,
      dataFolderName
    };
    service = new TestableSSHRemoteAgentHostMainService(
      logService,
      productService
    );
    disposables.add(service);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns existing connection on duplicate connect without replacing relay", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      // cat state file (not found)
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "1.0.0\n", code: 0 },
      // CLI --version (already installed)
      { stdout: "", code: 0 }
      // echo state file (write)
    ];
    const config = makeConfig({ sshConfigHost: "myalias" });
    const result1 = await service.connect(config);
    assert.strictEqual(result1.connectionId, "ssh:myalias");
    assert.strictEqual(result1.sshConfigHost, "myalias");
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(service.relayCalled, 1);
    const result2 = await service.connect(config);
    assert.strictEqual(result2.connectionId, result1.connectionId);
    assert.strictEqual(result2.connectionToken, result1.connectionToken);
    assert.strictEqual(result2.sshConfigHost, "myalias");
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(service.relayCalled, 1);
  });
  test("creates fresh relay on reconnect without restarting agent", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      // cat state file (not found)
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "1.0.0\n", code: 0 },
      // CLI --version (already installed)
      { stdout: "", code: 0 }
      // echo state file (write)
    ];
    const config = makeConfig({ sshConfigHost: "myalias" });
    const result1 = await service.connect(config);
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(service.relayCalled, 1);
    const result2 = await service.reconnect("myalias", "test-agent");
    assert.strictEqual(result2.connectionId, result1.connectionId);
    assert.strictEqual(result2.connectionToken, result1.connectionToken);
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(service.relayCalled, 2);
  });
  test("reconnect does not fire onDidRelayClose for superseded relay", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const config = makeConfig({ sshConfigHost: "myalias" });
    await service.connect(config);
    const closeEvents = [];
    disposables.add(service.onDidRelayClose((id) => closeEvents.push(id)));
    await service.reconnect("myalias", "test-agent");
    service.simulateOldRelayClose();
    assert.deepStrictEqual(closeEvents, []);
  });
  test("reconnect suppresses synchronous close from old relay during replacement", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const config = makeConfig({ sshConfigHost: "myalias" });
    await service.connect(config);
    const closeEvents = [];
    disposables.add(service.onDidRelayClose((id) => closeEvents.push(id)));
    service.makePreviousRelaySyncClose();
    await service.reconnect("myalias", "test-agent");
    assert.deepStrictEqual(closeEvents, []);
  });
  test("uses sshConfigHost as connection key when present", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.strictEqual(result.connectionId, "ssh:myhost");
    assert.strictEqual(result.sshConfigHost, "myhost");
  });
  test("skips platform detection and CLI install with remoteAgentHostCommand", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      // cat state file (not found)
      { stdout: "", code: 0 }
      // echo state file (write)
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/custom/agent --port 0"
    }));
    assert.strictEqual(result.connectionId, "testuser@10.0.0.1:22");
    assert.strictEqual(service.startCalled, 1);
    const client = service.mockClients[0];
    assert.ok(!client.execCalls.some((c) => c.includes("uname")));
  });
  test("reuses existing agent host when state file has valid PID", async () => {
    const existingState = stateJson(1234, 7777, "existing-tok");
    service.execResponses = [
      { stdout: existingState, code: 0 },
      // cat state file (found)
      { stdout: "", code: 0 }
      // kill -0 (PID alive)
    ];
    const result = await service.connect(makeConfig());
    assert.strictEqual(service.startCalled, 0);
    assert.strictEqual(service.relayCalled, 1);
    assert.strictEqual(result.connectionToken, "existing-tok");
  });
  test("agent-host reuse skips platform detection and CLI install", async () => {
    const existingState = stateJson(1234, 7777, "existing-tok");
    service.execResponses = [
      { stdout: existingState, code: 0 },
      // cat state file (found)
      { stdout: "", code: 0 }
      // kill -0 (PID alive)
    ];
    await service.connect(makeConfig());
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(!execCalls.some((c) => c.includes("uname")), `uname should not run on reuse; saw: ${JSON.stringify(execCalls)}`);
    assert.ok(!execCalls.some((c) => c.includes("--version")), `--version should not run on reuse; saw: ${JSON.stringify(execCalls)}`);
    assert.ok(!execCalls.some((c) => c.includes("test -x")), `test -x should not run on reuse; saw: ${JSON.stringify(execCalls)}`);
    assert.ok(!execCalls.some((c) => c.includes("curl")), `curl should not run on reuse; saw: ${JSON.stringify(execCalls)}`);
  });
  test("starts fresh when state file PID is dead", async () => {
    const staleState = stateJson(9999, 7777, "old-tok");
    service.execResponses = [
      { stdout: staleState, code: 0 },
      // cat state file
      { stdout: "", code: 1 },
      // kill -0 (PID dead)
      { stdout: "", code: 0 },
      // rm -f state file
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "1.0.0\n", code: 0 },
      // CLI --version
      { stdout: "", code: 0 }
      // echo state file (write new)
    ];
    const result = await service.connect(makeConfig());
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(result.connectionToken, "tok-abc");
  });
  test("falls back to fresh start when relay to reused agent fails", async () => {
    const existingState = stateJson(1234, 7777, "existing-tok");
    service.execResponses = [
      { stdout: existingState, code: 0 },
      // cat state file (found)
      { stdout: "", code: 0 },
      // kill -0 (PID alive)
      // cleanup: cat state file, kill PID, rm state file
      { stdout: existingState, code: 0 },
      { stdout: "", code: 0 },
      { stdout: "", code: 0 },
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "1.0.0\n", code: 0 },
      // CLI --version
      // write new state file after fresh start
      { stdout: "", code: 0 }
    ];
    let relayCallCount = 0;
    service.relayHook = () => {
      relayCallCount++;
      if (relayCallCount === 1) {
        return new Error("connection refused");
      }
      return { send: () => {
      }, close: () => {
      } };
    };
    const result = await service.connect(makeConfig());
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(relayCallCount, 2);
    assert.strictEqual(result.connectionToken, "tok-abc");
  });
  test("treats malformed legacy state as missing and starts fresh", async () => {
    const legacyState = JSON.stringify({ pid: 1234, port: 7777, connectionToken: "existing-tok" });
    service.execResponses = [
      { stdout: legacyState, code: 0 },
      // cat lockfile (no schemaVersion)
      { stdout: "", code: 0 },
      // rm -f corrupt lockfile
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
      // write new lockfile
    ];
    const result = await service.connect(makeConfig());
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(service.relayCalled, 1);
    assert.strictEqual(result.connectionToken, "tok-abc");
  });
  test("does not retry when relay fails on freshly started agent", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      // no state file
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
      // write state
    ];
    service.relayResult = new Error("connection refused");
    await assert.rejects(
      () => service.connect(makeConfig()),
      /connection refused/
    );
    assert.strictEqual(service.startCalled, 1);
  });
  test("cleans up SSH client on error", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    service.relayResult = new Error("boom");
    await assert.rejects(() => service.connect(makeConfig()));
    assert.strictEqual(service.mockClients[0].ended, true);
  });
  test("sanitizes config in result (strips password and privateKeyPath)", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent",
      authMethod: SSHAuthMethod.Password,
      password: "secret123",
      privateKeyPath: "/home/user/.ssh/id_rsa"
    }));
    assert.strictEqual(result.config["password"], void 0);
    assert.strictEqual(result.config["privateKeyPath"], void 0);
    assert.strictEqual(result.config.host, "10.0.0.1");
  });
  test("disconnect removes connection and allows reconnect", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    await service.disconnect(result.connectionId);
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    service.startCalled = 0;
    const result2 = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(service.startCalled, 1);
    assert.strictEqual(result2.connectionId, result.connectionId);
  });
  test("fires onDidChangeConnections on connect and disconnect", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const events = [];
    disposables.add(service.onDidChangeConnections(() => events.push("changed")));
    disposables.add(service.onDidCloseConnection((id) => events.push(`closed:${id}`)));
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0], "changed");
    await service.disconnect(result.connectionId);
    assert.deepStrictEqual(events, [
      "changed",
      `closed:${result.connectionId}`,
      "changed"
    ]);
  });
  test("relay messages fire onDidRelayMessage with correct connectionId", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    const messages = [];
    disposables.add(service.onDidRelayMessage((msg) => messages.push(msg)));
    service.simulateRelayMessage('{"jsonrpc":"2.0","id":1}');
    service.simulateRelayMessage('{"jsonrpc":"2.0","id":2}');
    assert.deepStrictEqual(messages, [
      { connectionId: result.connectionId, data: '{"jsonrpc":"2.0","id":1}' },
      { connectionId: result.connectionId, data: '{"jsonrpc":"2.0","id":2}' }
    ]);
  });
  test("relay close fires onDidRelayClose with correct connectionId", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    const closes = [];
    disposables.add(service.onDidRelayClose((id) => closes.push(id)));
    service.simulateCurrentRelayClose();
    assert.deepStrictEqual(closes, [result.connectionId]);
  });
  test("relaySend delivers data to the correct connection", async () => {
    const sentData = [];
    service.relayResult = {
      send: (data) => sentData.push(data),
      close: () => {
      }
    };
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    await service.relaySend(result.connectionId, "hello");
    await service.relaySend(result.connectionId, "world");
    assert.deepStrictEqual(sentData, ["hello", "world"]);
  });
  test("relaySend to unknown connectionId is a no-op", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    await service.connect(makeConfig({ remoteAgentHostCommand: "/agent" }));
    await service.relaySend("nonexistent", "data");
  });
  test("connects to two different hosts independently", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const r1 = await service.connect(makeConfig({
      host: "10.0.0.1",
      remoteAgentHostCommand: "/agent"
    }));
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const r2 = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    assert.notStrictEqual(r1.connectionId, r2.connectionId);
    assert.strictEqual(service.startCalled, 2);
    assert.strictEqual(service.relayCalled, 2);
  });
  test("disconnect one host does not affect the other", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const r1 = await service.connect(makeConfig({
      host: "10.0.0.1",
      remoteAgentHostCommand: "/agent"
    }));
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const r2 = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    await service.disconnect(r1.connectionId);
    const r2Again = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(r2Again.connectionId, r2.connectionId);
    assert.strictEqual(service.startCalled, 2);
    assert.strictEqual(service.relayCalled, 2);
  });
  test("relay messages from two connections are distinguished by connectionId", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const r1 = await service.connect(makeConfig({
      host: "10.0.0.1",
      remoteAgentHostCommand: "/agent"
    }));
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const r2 = await service.connect(makeConfig({
      host: "10.0.0.2",
      remoteAgentHostCommand: "/agent"
    }));
    const messages = [];
    disposables.add(service.onDidRelayMessage((msg) => messages.push(msg)));
    service.simulateRelayMessage("msg-from-host1", 0);
    service.simulateRelayMessage("msg-from-host2", 1);
    assert.deepStrictEqual(messages, [
      { connectionId: r1.connectionId, data: "msg-from-host1" },
      { connectionId: r2.connectionId, data: "msg-from-host2" }
    ]);
  });
  test("reconnect after disconnect establishes a new SSH connection", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const r1 = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.strictEqual(service.mockClients.length, 1);
    await service.disconnect(r1.connectionId);
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const r2 = await service.reconnect("myhost", "test-host");
    assert.strictEqual(service.mockClients.length, 2);
    assert.strictEqual(r2.connectionId, r1.connectionId);
  });
  test("fires progress events during connect", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const progress = [];
    disposables.add(service.onDidReportConnectProgress((p) => progress.push(p)));
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    assert.ok(progress.length >= 3, `expected at least 3 progress events, got ${progress.length}`);
    assert.ok(progress.every((p) => p.connectionKey === "ssh:myhost"));
    assert.ok(progress.every((p) => p.message.length > 0), "all progress messages should be non-empty");
  });
  test("cancelling keyboard-interactive prompt rejects connect with cancellation", async () => {
    const kbiService = disposables.add(new KeyboardInteractiveConnectTestService(
      new NullLogService(),
      {
        _serviceBrand: void 0,
        quality,
        dataFolderName
      }
    ));
    const request = new DeferredPromise();
    disposables.add(kbiService.onDidRequestKeyboardInteractive((kbiRequest2) => request.complete(kbiRequest2)));
    const connectPromise = kbiService.connectSSHForTest(makeConfig({ sshConfigHost: "test-host" }));
    const kbiRequest = await request.p;
    await kbiService.respondKeyboardInteractive(kbiRequest.requestId, void 0);
    await assert.rejects(connectPromise, (error) => isCancellationError(error));
    assert.deepStrictEqual({
      ended: kbiService.client.ended,
      finishResponses: kbiService.client.finishResponses
    }, {
      ended: true,
      finishResponses: []
    });
  });
  test("responding to keyboard-interactive prompt does not cancel connection attempt", async () => {
    let finished;
    let cancelled = false;
    const requestId = service.startKeyboardInteractiveForTest([
      { prompt: "Password: ", echo: false }
    ], (responses) => {
      finished = responses;
    }, () => {
      cancelled = true;
    });
    await service.respondKeyboardInteractive(requestId, ["secret"]);
    assert.deepStrictEqual({ finished, cancelled }, {
      finished: ["secret"],
      cancelled: false
    });
  });
  test("SSH client close event disposes the connection", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      remoteAgentHostCommand: "/agent"
    }));
    const closeEvents = [];
    disposables.add(service.onDidCloseConnection((id) => closeEvents.push(id)));
    service.mockClients[0].fireClose();
    assert.deepStrictEqual(closeEvents, [result.connectionId]);
  });
  test("skips CLI download when CLI is already installed", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      // cat state file (not found)
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "1.0.0\n", code: 0 },
      // CLI --version succeeds
      { stdout: "", code: 0 }
      // echo state file (write)
    ];
    await service.connect(makeConfig());
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(
      !execCalls.some((c) => c.includes("curl") || c.includes("tar")),
      "should not download CLI when already installed"
    );
  });
  test("downloads CLI when version check fails", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      // cat state file (not found)
      { stdout: "Linux\n", code: 0 },
      // uname -s
      { stdout: "x86_64\n", code: 0 },
      // uname -m
      { stdout: "", code: 127 },
      // CLI --version fails (not found)
      { stdout: "", code: 0 },
      // curl | tar install
      { stdout: "", code: 0 }
      // echo state file (write)
    ];
    await service.connect(makeConfig());
    const execCalls = service.mockClients[0].execCalls;
    assert.ok(
      execCalls.some((c) => c.includes("curl")),
      "should download CLI when not installed"
    );
  });
  suite("commit-pinned install", () => {
    const commit = "abcdef0123456789abcdef0123456789abcdef01";
    const cliBin = `~/.vscode-insiders/code-insiders-${commit}`;
    let pinnedService;
    setup(() => {
      const logService = new NullLogService();
      const productService = {
        _serviceBrand: void 0,
        quality,
        dataFolderName,
        serverDataFolderName: ".vscode-insiders",
        commit
      };
      pinnedService = new TestableSSHRemoteAgentHostMainService(
        logService,
        productService
      );
      disposables.add(pinnedService);
    });
    test("always invokes cleanup of old commit-keyed CLIs", async () => {
      pinnedService.execResponses = [
        { stdout: "", code: 1 },
        // cat state (none)
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 0 },
        // test -x cliBin → present
        { stdout: "", code: 0 },
        // touch cliBin (refresh mtime on reuse)
        { stdout: "", code: 0 },
        // cleanup (runs after reuse decision)
        { stdout: "", code: 0 }
        // write state
      ];
      await pinnedService.connect(makeConfig());
      const execCalls = pinnedService.mockClients[0].execCalls;
      assert.ok(
        execCalls.some((c) => /ls -1t .*code-insiders-/.test(c) && /awk\s+'NR>5'/.test(c)),
        `cleanup command should have run; saw: ${JSON.stringify(execCalls)}`
      );
    });
    test("reuses existing commit-keyed CLI without re-downloading", async () => {
      pinnedService.execResponses = [
        { stdout: "", code: 1 },
        // cat state (none)
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 0 },
        // test -x cliBin → 0 (present)
        { stdout: "", code: 0 },
        // touch cliBin
        { stdout: "", code: 0 },
        // cleanup
        { stdout: "", code: 0 }
        // write state
      ];
      await pinnedService.connect(makeConfig());
      const execCalls = pinnedService.mockClients[0].execCalls;
      assert.ok(
        execCalls.some((c) => c.includes(`test -x ${cliBin}`)),
        `should test for commit-keyed CLI; saw: ${JSON.stringify(execCalls)}`
      );
      assert.ok(
        !execCalls.some((c) => c.includes("curl")),
        `should not download when commit-keyed CLI present; saw: ${JSON.stringify(execCalls)}`
      );
    });
    test("downloads from commit-pinned URL when CLI is missing", async () => {
      pinnedService.execResponses = [
        { stdout: "", code: 1 },
        // cat state (none)
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 1 },
        // test -x → missing
        { stdout: "", code: 0 },
        // mkdir+mktemp+curl|tar+mv+chmod+rm
        { stdout: "1.0.0\n", code: 0 },
        // <cliBin> --version validation
        { stdout: "", code: 0 },
        // cleanup (after successful install)
        { stdout: "", code: 0 }
        // write state
      ];
      await pinnedService.connect(makeConfig());
      const execCalls = pinnedService.mockClients[0].execCalls;
      const installCall = execCalls.find((c) => c.includes("curl"));
      assert.ok(installCall, `should have run curl install; saw: ${JSON.stringify(execCalls)}`);
      assert.ok(
        installCall.includes(`commit:${commit}`),
        `install URL should be commit-pinned; got: ${installCall}`
      );
      assert.ok(
        installCall.includes(`mv `) && installCall.includes(cliBin),
        `install should atomic-mv into commit-keyed path; got: ${installCall}`
      );
    });
    test("falls back to any usable CLI when commit-pinned download fails", async () => {
      const fallbackBin = `~/.vscode-insiders/code-insiders-0000000000000000000000000000000000000000`;
      pinnedService.execResponses = [
        { stdout: "", code: 1 },
        // cat state (none)
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 1 },
        // test -x → missing
        { stdout: "", code: 7 },
        // install fails (curl exit 7)
        { stdout: `${fallbackBin}
`, code: 0 },
        // fallback finder lists old commit-keyed
        { stdout: "1.0.0\n", code: 0 },
        // fallback --version succeeds
        { stdout: "", code: 0 }
        // write state
      ];
      await pinnedService.connect(makeConfig());
      const execCalls = pinnedService.mockClients[0].execCalls;
      assert.ok(
        execCalls.some((c) => /ls -1t .*code-insiders-/.test(c) && c.includes(".vscode-cli-insider/code-insiders")),
        `should have run fallback finder; saw: ${JSON.stringify(execCalls)}`
      );
      assert.ok(
        execCalls.some((c) => c.includes(`${fallbackBin} --version`)),
        `should --version-validate fallback; saw: ${JSON.stringify(execCalls)}`
      );
    });
    test("propagates install error when no fallback CLI exists", async () => {
      pinnedService.execResponses = [
        { stdout: "", code: 1 },
        // cat state (none)
        { stdout: "Linux\n", code: 0 },
        { stdout: "x86_64\n", code: 0 },
        { stdout: "", code: 1 },
        // test -x → missing
        { stdout: "", code: 7 },
        // install fails
        { stdout: "", code: 0 }
        // fallback finder returns nothing
      ];
      await assert.rejects(pinnedService.connect(makeConfig()));
    });
  });
  test("uses host:port as connection key without sshConfigHost", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      host: "192.168.1.1",
      port: 2222,
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(result.connectionId, "testuser@192.168.1.1:2222");
  });
  test("defaults to port 22 in connection key", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({
      host: "192.168.1.1",
      remoteAgentHostCommand: "/agent"
    }));
    assert.strictEqual(result.connectionId, "testuser@192.168.1.1:22");
  });
  test("reconnect preserves connection token and address", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const original = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const reconnected = await service.reconnect("myhost", "new-name");
    assert.strictEqual(reconnected.connectionToken, original.connectionToken);
    assert.strictEqual(reconnected.address, original.address);
    assert.strictEqual(reconnected.connectionId, original.connectionId);
  });
  test("messages from superseded relay still arrive (only close is suppressed)", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    const result = await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const messages = [];
    disposables.add(service.onDidRelayMessage((msg) => messages.push(msg)));
    await service.reconnect("myhost", "test-host");
    service.simulateRelayMessage("stale-message", 0);
    service.simulateRelayMessage("fresh-message", 1);
    assert.deepStrictEqual(messages, [
      { connectionId: result.connectionId, data: "stale-message" },
      { connectionId: result.connectionId, data: "fresh-message" }
    ]);
  });
  test("reconnect cleans up SSH client when relay recreation fails", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const originalClient = service.mockClients[0];
    assert.strictEqual(originalClient.ended, false);
    service.relayHook = (call) => {
      if (call === 2) {
        return new Error("relay failed");
      }
      return void 0;
    };
    const closeEvents = [];
    disposables.add(service.onDidCloseConnection((id) => closeEvents.push(id)));
    await assert.rejects(
      () => service.reconnect("myhost", "test-host"),
      /relay failed/
    );
    assert.strictEqual(originalClient.ended, true);
    assert.deepStrictEqual(closeEvents, ["ssh:myhost"]);
  });
  test("reconnect rejects with timeout when relay creation hangs (silently dead SSH client)", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const originalClient = service.mockClients[0];
    assert.strictEqual(originalClient.ended, false);
    service.setRelayCreationTimeoutForTest(50);
    service.hangRelayCreationOnCall = 2;
    const closeEvents = [];
    disposables.add(service.onDidCloseConnection((id) => closeEvents.push(id)));
    await assert.rejects(
      () => service.reconnect("myhost", "test-host"),
      /timed out|timeout/i,
      "reconnect should reject (with a timeout error) instead of hanging when relay creation never settles"
    );
    assert.strictEqual(originalClient.ended, true, "dead SSH client should be ended");
    assert.deepStrictEqual(closeEvents, ["ssh:myhost"]);
  });
  test("reconnect removes old close/error listeners from shared SSH client", async () => {
    service.execResponses = [
      { stdout: "", code: 1 },
      { stdout: "Linux\n", code: 0 },
      { stdout: "x86_64\n", code: 0 },
      { stdout: "1.0.0\n", code: 0 },
      { stdout: "", code: 0 }
    ];
    await service.connect(makeConfig({ sshConfigHost: "myhost" }));
    const client = service.mockClients[0];
    const closeListenersBefore = client.closeListenerCount;
    const errorListenersBefore = client.errorListenerCount;
    assert.ok(closeListenersBefore > 0, "should have close listeners after connect");
    assert.ok(errorListenersBefore > 0, "should have error listeners after connect");
    await service.reconnect("myhost", "test-host");
    assert.strictEqual(client.closeListenerCount, closeListenersBefore);
    assert.strictEqual(client.errorListenerCount, errorListenersBefore);
  });
});
class AuthAttemptsTestService extends SSHRemoteAgentHostMainService {
  constructor() {
    super(...arguments);
    this.agentSock = void 0;
    this.keyFiles = /* @__PURE__ */ new Map();
  }
  async testBuildAuthAttempts(config) {
    return this._buildAuthAttempts(config);
  }
  _isAgentAvailable() {
    return this.agentSock;
  }
  async _readKeyFileIfExists(keyPath) {
    return this.keyFiles.get(keyPath);
  }
}
suite("SSHRemoteAgentHostMainService - _buildAuthAttempts", () => {
  const disposables = new DisposableStore();
  let service;
  setup(() => {
    const logService = new NullLogService();
    const productService = {
      _serviceBrand: void 0,
      quality,
      dataFolderName
    };
    service = new AuthAttemptsTestService(
      logService,
      productService
    );
    disposables.add(service);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const RSA = Buffer.from("rsa-key-bytes");
  const ED = Buffer.from("ed25519-key-bytes");
  const EXPLICIT = Buffer.from("explicit-key-bytes");
  function sshString(value) {
    const valueBuffer = Buffer.from(value, "utf8");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(valueBuffer.length, 0);
    return Buffer.concat([lengthBuffer, valueBuffer]);
  }
  function openSSHPrivateKeyWithCipher(cipher) {
    const data = Buffer.concat([
      Buffer.from("openssh-key-v1\0", "utf8"),
      sshString(cipher)
    ]);
    return Buffer.from([
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      data.toString("base64"),
      "-----END OPENSSH PRIVATE KEY-----"
    ].join("\n"));
  }
  test("Agent + no SSH_AUTH_SOCK + only id_rsa exists \u2192 publickey id_rsa, then keyboard-interactive", async () => {
    service.agentSock = void 0;
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + SSH_AUTH_SOCK + only id_rsa exists \u2192 agent then publickey id_rsa, then keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + SSH_AUTH_SOCK + id_ed25519 and id_rsa exist \u2192 agent then both keys in default order, then keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_ed25519", ED);
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: ED, keyPath: "~/.ssh/id_ed25519" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + SSH_AUTH_SOCK + no default keys \u2192 agent then keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + IdentityAgent uses configured agent endpoint before default keys", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      identityAgent: "//./pipe/pageant.user.1234"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "//./pipe/pageant.user.1234" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + IdentityAgent SSH_AUTH_SOCK uses the default agent endpoint", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      identityAgent: "SSH_AUTH_SOCK"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + IdentityAgent none disables the default SSH_AUTH_SOCK fallback", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      identityAgent: "none"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + explicit privateKeyPath + SSH_AUTH_SOCK + id_rsa \u2192 agent first, then explicit, id_rsa, keyboard-interactive", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("/some/explicit/key", EXPLICIT);
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: "/some/explicit/key"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: EXPLICIT, keyPath: "/some/explicit/key" },
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + explicit privateKeyPath that matches a default \u2192 explicit added once, then keyboard-interactive", async () => {
    service.agentSock = void 0;
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: "~/.ssh/id_rsa"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: RSA, keyPath: "~/.ssh/id_rsa" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("Agent + explicit privateKeyPath as absolute default path \u2192 agent first, key added once", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_ed25519", ED);
    const absoluteDefault = `${os.homedir()}/.ssh/id_ed25519`;
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: absoluteDefault
    }));
    assert.deepStrictEqual(attempts, [
      { type: "agent", username: "testuser", agent: "/tmp/ssh-agent.sock" },
      { type: "publickey", username: "testuser", key: ED, keyPath: "~/.ssh/id_ed25519" },
      { type: "keyboard-interactive", username: "testuser" }
    ]);
  });
  test("KeyFile + explicit path \u2192 publickey only", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("/some/explicit/key", EXPLICIT);
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.KeyFile,
      privateKeyPath: "/some/explicit/key"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: EXPLICIT, keyPath: "/some/explicit/key" }
    ]);
  });
  test("KeyFile + encrypted OpenSSH key marks attempt as encrypted", async () => {
    const encryptedKey = openSSHPrivateKeyWithCipher("aes256-ctr");
    service.keyFiles.set("/some/encrypted/key", encryptedKey);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.KeyFile,
      privateKeyPath: "/some/encrypted/key"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "publickey", username: "testuser", key: encryptedKey, keyPath: "/some/encrypted/key", encrypted: true }
    ]);
  });
  test("KeyFile + missing privateKeyPath throws", async () => {
    await assert.rejects(
      () => service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.KeyFile })),
      /private key path/i
    );
  });
  test("KeyFile + unreadable key throws with the path in the message", async () => {
    await assert.rejects(
      () => service.testBuildAuthAttempts(makeConfig({
        authMethod: SSHAuthMethod.KeyFile,
        privateKeyPath: "/missing/key"
      })),
      /\/missing\/key/
    );
  });
  test("Password \u2192 password only", async () => {
    service.agentSock = "/tmp/ssh-agent.sock";
    service.keyFiles.set("~/.ssh/id_rsa", RSA);
    const attempts = await service.testBuildAuthAttempts(makeConfig({
      authMethod: SSHAuthMethod.Password,
      password: "pw"
    }));
    assert.deepStrictEqual(attempts, [
      { type: "password", username: "testuser", password: "pw" }
    ]);
  });
});
suite("SSHRemoteAgentHostMainService - makeAuthHandler", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const KEY = Buffer.from("k");
  const attempts = [
    { type: "agent", username: "u", agent: "/sock" },
    { type: "publickey", username: "u", key: KEY, keyPath: "~/.ssh/id_rsa" }
  ];
  test("walks attempts in order, then signals exhaustion", () => {
    const handler = makeAuthHandler(attempts, new NullLogService());
    const calls = [];
    handler(null, false, (next) => calls.push(next));
    handler(["publickey"], false, (next) => calls.push(next));
    handler(["publickey"], false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [
      { type: "agent", username: "u", agent: "/sock" },
      { type: "publickey", username: "u", key: KEY },
      // keyPath stripped
      false
    ]);
  });
  test("skips attempts whose method the server has rejected", () => {
    const handler = makeAuthHandler(attempts, new NullLogService());
    const calls = [];
    handler(["password"], false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [false]);
  });
  test("agent attempts are kept when server allows publickey", () => {
    const handler = makeAuthHandler(
      [{ type: "agent", username: "u", agent: "/sock" }],
      new NullLogService()
    );
    const calls = [];
    handler(["publickey"], false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [{ type: "agent", username: "u", agent: "/sock" }]);
  });
  test("keyboard-interactive routes prompts to the kbi handler and is skipped without one", () => {
    const kbiAttempts = [
      { type: "keyboard-interactive", username: "u" },
      { type: "publickey", username: "u", key: KEY, keyPath: "~/.ssh/id_rsa" }
    ];
    const handlerNoKbi = makeAuthHandler(kbiAttempts, new NullLogService());
    const callsNoKbi = [];
    handlerNoKbi(null, false, (next) => callsNoKbi.push(next));
    assert.deepStrictEqual(callsNoKbi, [{ type: "publickey", username: "u", key: KEY }]);
    let promptArgs;
    const handlerWithKbi = makeAuthHandler(kbiAttempts, new NullLogService(), (name, instructions, prompts, finish) => {
      promptArgs = { name, instructions, prompts };
      finish(["secret"]);
    });
    const callsWithKbi = [];
    handlerWithKbi(null, false, (next) => callsWithKbi.push(next));
    assert.strictEqual(callsWithKbi.length, 1);
    assert.strictEqual(callsWithKbi[0].type, "keyboard-interactive");
    const finishCalls = [];
    callsWithKbi[0].prompt("n", "i", "lang", [{ prompt: "Password:", echo: false }], (responses) => finishCalls.push(responses));
    assert.deepStrictEqual(promptArgs, { name: "n", instructions: "i", prompts: [{ prompt: "Password:", echo: false }] });
    assert.deepStrictEqual(finishCalls, [["secret"]]);
  });
  test("encrypted publickey requests passphrase and passes it to ssh2", () => {
    const encryptedAttempts = [
      { type: "publickey", username: "u", key: KEY, keyPath: "~/.ssh/id_rsa", encrypted: true }
    ];
    const calls = [];
    const handler = makeAuthHandler(encryptedAttempts, new NullLogService(), void 0, (keyPath, finish) => {
      assert.strictEqual(keyPath, "~/.ssh/id_rsa");
      finish("passphrase");
    });
    handler(null, false, (next) => calls.push(next));
    assert.deepStrictEqual(calls, [
      { type: "publickey", username: "u", key: KEY, passphrase: "passphrase" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZUFnZW50SG9zdFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdE1ldGFkYXRhLmpzJztcbmltcG9ydCB7IFNTSEF1dGhNZXRob2QsIHR5cGUgSVNTSEFnZW50SG9zdENvbmZpZywgdHlwZSBJU1NIQ29ubmVjdFByb2dyZXNzLCB0eXBlIElTU0hLZXlib2FyZEludGVyYWN0aXZlUHJvbXB0LCB0eXBlIElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UsIG1ha2VBdXRoSGFuZGxlciwgdHlwZSBTU0hBdXRoQXR0ZW1wdCB9IGZyb20gJy4uLy4uL25vZGUvc3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFueUF1dGhNZXRob2QsIEF1dGhlbnRpY2F0aW9uVHlwZSwgQ29ubmVjdENvbmZpZyB9IGZyb20gJ3NzaDInO1xuXG5jb25zdCBkYXRhRm9sZGVyTmFtZSA9ICcudnNjb2RlLWluc2lkZXJzJztcbmNvbnN0IHF1YWxpdHkgPSAnaW5zaWRlcic7XG5cbmZ1bmN0aW9uIHN0YXRlSnNvbihwaWQ6IG51bWJlciwgcG9ydDogbnVtYmVyLCBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwpOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoY3JlYXRlUmVtb3RlQWdlbnRIb3N0U3RhdGUoe1xuXHRcdHBpZCxcblx0XHRwb3J0LFxuXHRcdGNvbm5lY3Rpb25Ub2tlbjogY29ubmVjdGlvblRva2VuID8/IHVuZGVmaW5lZCxcblx0XHRxdWFsaXR5LFxuXHR9KSk7XG59XG5cbi8qKiBNaW5pbWFsIG1vY2sgU1NIQ2hhbm5lbCBmb3IgdGVzdGluZy4gKi9cbmNsYXNzIE1vY2tTU0hDaGFubmVsIHtcblx0cmVhZG9ubHkgc3RkZXJyID0geyBvbjogKCkgPT4geyB9IH07XG5cdG9uKF9ldmVudDogc3RyaW5nLCBfbGlzdGVuZXI/OiAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdm9pZCk6IHRoaXMgeyByZXR1cm4gdGhpczsgfVxuXHRjbG9zZSgpOiB2b2lkIHsgfVxufVxuXG4vKipcbiAqIE1vY2sgU1NIQ2xpZW50IHRoYXQgcmVjb3JkcyBleGVjIGNhbGxzIGFuZCByZXR1cm5zIGNvbmZpZ3VyZWQgcmVzcG9uc2VzLlxuICogRWFjaCBjYWxsIHRvIGBleGVjYCBzaGlmdHMgdGhlIG5leHQgcmVzcG9uc2UgZnJvbSB0aGUgcXVldWUuXG4gKi9cbmNsYXNzIE1vY2tTU0hDbGllbnQge1xuXHRyZWFkb25seSBleGVjQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdGVuZGVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXhlY1Jlc3BvbnNlczogQXJyYXk8eyBzdGRvdXQ6IHN0cmluZzsgY29kZTogbnVtYmVyIH0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZUxpc3RlbmVyczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXJyb3JMaXN0ZW5lcnM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cblx0Y29uc3RydWN0b3IoZXhlY1Jlc3BvbnNlczogQXJyYXk8eyBzdGRvdXQ6IHN0cmluZzsgY29kZTogbnVtYmVyIH0+ID0gW10pIHtcblx0XHR0aGlzLl9leGVjUmVzcG9uc2VzID0gZXhlY1Jlc3BvbnNlcztcblx0fVxuXG5cdG9uKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdGlmIChldmVudCA9PT0gJ2Nsb3NlJykge1xuXHRcdFx0dGhpcy5fY2xvc2VMaXN0ZW5lcnMucHVzaChsaXN0ZW5lciBhcyAoKSA9PiB2b2lkKTtcblx0XHR9IGVsc2UgaWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHR0aGlzLl9lcnJvckxpc3RlbmVycy5wdXNoKGxpc3RlbmVyIGFzICgpID0+IHZvaWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHJlbW92ZUxpc3RlbmVyKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdGhpcyB7XG5cdFx0Y29uc3QgbGlzdCA9IGV2ZW50ID09PSAnY2xvc2UnID8gdGhpcy5fY2xvc2VMaXN0ZW5lcnMgOiBldmVudCA9PT0gJ2Vycm9yJyA/IHRoaXMuX2Vycm9yTGlzdGVuZXJzIDogdW5kZWZpbmVkO1xuXHRcdGlmIChsaXN0KSB7XG5cdFx0XHRjb25zdCBpZHggPSBsaXN0LmluZGV4T2YobGlzdGVuZXIgYXMgKCkgPT4gdm9pZCk7XG5cdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0bGlzdC5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRmaXJlQ2xvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiB0aGlzLl9jbG9zZUxpc3RlbmVycykge1xuXHRcdFx0bGlzdGVuZXIoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY2xvc2VMaXN0ZW5lckNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2Nsb3NlTGlzdGVuZXJzLmxlbmd0aDtcblx0fVxuXG5cdGdldCBlcnJvckxpc3RlbmVyQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZXJyb3JMaXN0ZW5lcnMubGVuZ3RoO1xuXHR9XG5cblx0Y29ubmVjdCgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXG5cdGV4ZWMoY29tbWFuZDogc3RyaW5nLCBjYWxsYmFjazogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIHN0cmVhbTogdW5rbm93bikgPT4gdm9pZCk6IHRoaXMge1xuXHRcdHRoaXMuZXhlY0NhbGxzLnB1c2goY29tbWFuZCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB0aGlzLl9leGVjUmVzcG9uc2VzLnNoaWZ0KCkgPz8geyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH07XG5cdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNb2NrU1NIQ2hhbm5lbCgpO1xuXHRcdC8vIFNpbXVsYXRlIGFzeW5jIFNTSCBleGVjOiByZXNvbHZlIGltbWVkaWF0ZWx5IHZpYSBtaWNyb3Rhc2tcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHQvLyBGaXJlIGRhdGEgZXZlbnRzXG5cdFx0XHRpZiAocmVzcG9uc2Uuc3Rkb3V0KSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdPbiA9IGNoYW5uZWwub24uYmluZChjaGFubmVsKTtcblx0XHRcdFx0Ly8gUmUtYmluZCBvbiB0byBjYXB0dXJlIGRhdGEgaGFuZGxlclxuXHRcdFx0XHRsZXQgZGF0YUhhbmRsZXI6ICgoZGF0YTogQnVmZmVyKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGNsb3NlSGFuZGxlcjogKChjb2RlOiBudW1iZXIpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjaGFubmVsLm9uID0gKChldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdFx0XHRkYXRhSGFuZGxlciA9IGxpc3RlbmVyIGFzIChkYXRhOiBCdWZmZXIpID0+IHZvaWQ7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChldmVudCA9PT0gJ2Nsb3NlJykge1xuXHRcdFx0XHRcdFx0Y2xvc2VIYW5kbGVyID0gbGlzdGVuZXIgYXMgKGNvZGU6IG51bWJlcikgPT4gdm9pZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG9yaWdPbihldmVudCwgbGlzdGVuZXIpO1xuXHRcdFx0XHR9KSBhcyB0eXBlb2YgY2hhbm5lbC5vbjtcblx0XHRcdFx0Y2FsbGJhY2sodW5kZWZpbmVkLCBjaGFubmVsKTtcblx0XHRcdFx0aWYgKGRhdGFIYW5kbGVyKSB7XG5cdFx0XHRcdFx0ZGF0YUhhbmRsZXIoQnVmZmVyLmZyb20ocmVzcG9uc2Uuc3Rkb3V0KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNsb3NlSGFuZGxlcikge1xuXHRcdFx0XHRcdGNsb3NlSGFuZGxlcihyZXNwb25zZS5jb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm8gc3Rkb3V0IFx1MjAxNCBqdXN0IGNhbGwgYmFjayBhbmQgZmlyZSBjbG9zZVxuXHRcdFx0XHRsZXQgY2xvc2VIYW5kbGVyOiAoKGNvZGU6IG51bWJlcikgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG9yaWdPbiA9IGNoYW5uZWwub24uYmluZChjaGFubmVsKTtcblx0XHRcdFx0Y2hhbm5lbC5vbiA9ICgoZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpID0+IHtcblx0XHRcdFx0XHRpZiAoZXZlbnQgPT09ICdjbG9zZScpIHtcblx0XHRcdFx0XHRcdGNsb3NlSGFuZGxlciA9IGxpc3RlbmVyIGFzIChjb2RlOiBudW1iZXIpID0+IHZvaWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBvcmlnT24oZXZlbnQsIGxpc3RlbmVyKTtcblx0XHRcdFx0fSkgYXMgdHlwZW9mIGNoYW5uZWwub247XG5cdFx0XHRcdGNhbGxiYWNrKHVuZGVmaW5lZCwgY2hhbm5lbCk7XG5cdFx0XHRcdGlmIChjbG9zZUhhbmRsZXIpIHtcblx0XHRcdFx0XHRjbG9zZUhhbmRsZXIocmVzcG9uc2UuY29kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGZvcndhcmRPdXQoXG5cdFx0X3NyY0lQOiBzdHJpbmcsIF9zcmNQb3J0OiBudW1iZXIsIF9kc3RJUDogc3RyaW5nLCBfZHN0UG9ydDogbnVtYmVyLFxuXHRcdF9jYWxsYmFjazogKGVycjogRXJyb3IgfCB1bmRlZmluZWQsIGNoYW5uZWw6IHVua25vd24pID0+IHZvaWQsXG5cdCk6IHRoaXMge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0ZW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5kZWQgPSB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIEtleWJvYXJkSW50ZXJhY3RpdmVNb2NrU1NIQ2xpZW50IHtcblx0ZW5kZWQgPSBmYWxzZTtcblx0ZmluaXNoUmVzcG9uc2VzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lcnJvckxpc3RlbmVyczogQXJyYXk8KGVycjogRXJyb3IpID0+IHZvaWQ+ID0gW107XG5cblx0b24oZXZlbnQ6ICdyZWFkeScsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdGhpcztcblx0b24oZXZlbnQ6ICdlcnJvcicsIGxpc3RlbmVyOiAoZXJyOiBFcnJvcikgPT4gdm9pZCk6IHRoaXM7XG5cdG9uKGV2ZW50OiAnY2xvc2UnLCBsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IHRoaXM7XG5cdG9uKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoKGVycjogRXJyb3IpID0+IHZvaWQpIHwgKCgpID0+IHZvaWQpKTogdGhpcyB7XG5cdFx0aWYgKGV2ZW50ID09PSAnZXJyb3InKSB7XG5cdFx0XHR0aGlzLl9lcnJvckxpc3RlbmVycy5wdXNoKGxpc3RlbmVyIGFzIChlcnI6IEVycm9yKSA9PiB2b2lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRyZW1vdmVMaXN0ZW5lcihfZXZlbnQ6IHN0cmluZywgX2xpc3RlbmVyOiAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0Y29ubmVjdChjb25maWc6IENvbm5lY3RDb25maWcpOiB2b2lkIHtcblx0XHRjb25zdCBhdXRoSGFuZGxlciA9IGNvbmZpZy5hdXRoSGFuZGxlciBhcyAoKG1ldGhvZHNMZWZ0OiBBdXRoZW50aWNhdGlvblR5cGVbXSB8IG51bGwsIHBhcnRpYWxTdWNjZXNzOiBib29sZWFuLCBjYWxsYmFjazogKG5leHQ6IEFueUF1dGhNZXRob2QgfCBmYWxzZSkgPT4gdm9pZCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0YXV0aEhhbmRsZXI/LihudWxsLCBmYWxzZSwgbWV0aG9kID0+IHtcblx0XHRcdGlmIChtZXRob2QgJiYgbWV0aG9kLnR5cGUgPT09ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScpIHtcblx0XHRcdFx0bWV0aG9kLnByb21wdCgnS2V5Ym9hcmQnLCAnJywgJ2VuLVVTJywgW3sgcHJvbXB0OiAnUGFzc3dvcmQ6ICcsIGVjaG86IGZhbHNlIH1dLCByZXNwb25zZXMgPT4ge1xuXHRcdFx0XHRcdHRoaXMuZmluaXNoUmVzcG9uc2VzID0gcmVzcG9uc2VzO1xuXHRcdFx0XHRcdHRoaXMuZmlyZUVycm9yKG5ldyBFcnJvcignQWxsIGNvbmZpZ3VyZWQgYXV0aGVudGljYXRpb24gbWV0aG9kcyBmYWlsZWQnKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5kZWQgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBmaXJlRXJyb3IoZXJyOiBFcnJvcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgdGhpcy5fZXJyb3JMaXN0ZW5lcnMpIHtcblx0XHRcdGxpc3RlbmVyKGVycik7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VDb25maWcob3ZlcnJpZGVzPzogUGFydGlhbDxJU1NIQWdlbnRIb3N0Q29uZmlnPik6IElTU0hBZ2VudEhvc3RDb25maWcge1xuXHRyZXR1cm4ge1xuXHRcdGhvc3Q6ICcxMC4wLjAuMScsXG5cdFx0dXNlcm5hbWU6ICd0ZXN0dXNlcicsXG5cdFx0YXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5BZ2VudCxcblx0XHRuYW1lOiAndGVzdC1ob3N0Jyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbi8qKlxuICogVGVzdGFibGUgc3ViY2xhc3Mgb2YgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuXG4gKiBPdmVycmlkZXMgdGhlIFNTSC9XZWJTb2NrZXQgbGF5ZXIgc28gdGhlIGVudGlyZSBjb25uZWN0IGZsb3cgcnVucyBpbi1wcm9jZXNzXG4gKiB3aXRob3V0IG5lZWRpbmcgYHNzaDJgIG9yIGB3c2AgbW9kdWxlcy5cbiAqL1xuY2xhc3MgVGVzdGFibGVTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSBleHRlbmRzIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblxuXHRyZWFkb25seSBtb2NrQ2xpZW50czogTW9ja1NTSENsaWVudFtdID0gW107XG5cblx0LyoqIFJlc3BvbnNlcyB0aGF0IF9jb25uZWN0U1NIIHdpbGwgaGFuZCB0byBNb2NrU1NIQ2xpZW50IGZvciBpdHMgZXhlYyBxdWV1ZS4gKi9cblx0ZXhlY1Jlc3BvbnNlczogQXJyYXk8eyBzdGRvdXQ6IHN0cmluZzsgY29kZTogbnVtYmVyIH0+ID0gW107XG5cblx0LyoqIFdoYXQgX3N0YXJ0UmVtb3RlQWdlbnRIb3N0IHdpbGwgcmVzb2x2ZSB3aXRoLiAqL1xuXHRzdGFydFJlc3VsdDogeyBwb3J0OiBudW1iZXI7IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkOyBwaWQ6IG51bWJlciB8IHVuZGVmaW5lZCB9ID0ge1xuXHRcdHBvcnQ6IDk5OTksIGNvbm5lY3Rpb25Ub2tlbjogJ3Rvay1hYmMnLCBwaWQ6IDQyLFxuXHR9O1xuXHRzdGFydENhbGxlZCA9IDA7XG5cblx0LyoqIFdoYXQgX2NyZWF0ZVdlYlNvY2tldFJlbGF5IHdpbGwgcmVzb2x2ZSB3aXRoLiBTZXQgdG8gYW4gRXJyb3IgdG8gcmVqZWN0LiAqL1xuXHRyZWxheVJlc3VsdDogeyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9IHwgRXJyb3IgPSB7XG5cdFx0c2VuZDogKCkgPT4geyB9LFxuXHRcdGNsb3NlOiAoKSA9PiB7IH0sXG5cdH07XG5cdHJlbGF5Q2FsbGVkID0gMDtcblxuXHQvKiogT3ZlcnJpZGUgdG8gaW50ZXJjZXB0IHJlbGF5IGNyZWF0aW9uIGluIHNwZWNpZmljIHRlc3RzLiAqL1xuXHRyZWxheUhvb2s6ICgoY2FsbDogbnVtYmVyKSA9PiB7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0gfCBFcnJvciB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIElmIHNldCB0byBhIHBvc2l0aXZlIG51bWJlciwgdGhlIE50aCBgX2NyZWF0ZVdlYlNvY2tldFJlbGF5YCBjYWxsIHdpbGxcblx0ICogcmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzIG5vciByZWplY3RzLiBUaGlzIHNpbXVsYXRlcyBhXG5cdCAqIHNpbGVudGx5IGRlYWQgU1NIIGNsaWVudCB3aGVyZSBgZm9yd2FyZE91dGAncyBjYWxsYmFjayBuZXZlciBmaXJlcy5cblx0ICovXG5cdGhhbmdSZWxheUNyZWF0aW9uT25DYWxsOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFB1YmxpYyBvdmVycmlkZSBzbyB0ZXN0cyBjYW4gc2hvcnRlbiB0aGUgcmVsYXkgY3JlYXRpb24gdGltZW91dC4gKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbGF5Q3JlYXRpb25UaW1lb3V0TXM6IG51bWJlciA9IDMwXzAwMDtcblxuXHQvKiogU3RvcmVkIG9uTWVzc2FnZSBjYWxsYmFja3MgZnJvbSByZWxheXMsIG1vc3QgcmVjZW50IGxhc3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5TWVzc2FnZUNhbGxiYWNrczogQXJyYXk8KGRhdGE6IHN0cmluZykgPT4gdm9pZD4gPSBbXTtcblx0LyoqIFN0b3JlZCBvbkNsb3NlIGNhbGxiYWNrcyBmcm9tIHJlbGF5cywgbW9zdCByZWNlbnQgbGFzdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVsYXlDbG9zZUNhbGxiYWNrczogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcblx0LyoqIFN0b3JlZCByZWxheSByZXN1bHQgb2JqZWN0cywgbW9zdCByZWNlbnQgbGFzdCAoZm9yIG1ha2VQcmV2aW91c1JlbGF5U3luY0Nsb3NlKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVsYXlSZXN1bHRzOiBBcnJheTx7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0+ID0gW107XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9jb25uZWN0U1NIKFxuXHRcdF9jb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcsXG5cdCkge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBNb2NrU1NIQ2xpZW50KHRoaXMuZXhlY1Jlc3BvbnNlcyk7XG5cdFx0dGhpcy5tb2NrQ2xpZW50cy5wdXNoKGNsaWVudCk7XG5cdFx0cmV0dXJuIGNsaWVudCBhcyBuZXZlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfc3RhcnRSZW1vdGVBZ2VudEhvc3QoXG5cdFx0X2NsaWVudDogdW5rbm93biwgX2NsaUJpbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBfY2xpRGF0YURpcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBfY29tbWFuZE92ZXJyaWRlPzogc3RyaW5nLFxuXHQpIHtcblx0XHR0aGlzLnN0YXJ0Q2FsbGVkKys7XG5cdFx0cmV0dXJuIHsgLi4udGhpcy5zdGFydFJlc3VsdCwgc3RyZWFtOiBuZXcgTW9ja1NTSENoYW5uZWwoKSBhcyBuZXZlciB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9jcmVhdGVXZWJTb2NrZXRSZWxheShcblx0XHRfY2xpZW50OiB1bmtub3duLCBfZHN0SG9zdDogc3RyaW5nLCBfZHN0UG9ydDogbnVtYmVyLCBfY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0b25NZXNzYWdlOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkLCBvbkNsb3NlOiAoKSA9PiB2b2lkLFxuXHQpIHtcblx0XHR0aGlzLnJlbGF5Q2FsbGVkKys7XG5cdFx0dGhpcy5fcmVsYXlNZXNzYWdlQ2FsbGJhY2tzLnB1c2gob25NZXNzYWdlKTtcblx0XHR0aGlzLl9yZWxheUNsb3NlQ2FsbGJhY2tzLnB1c2gob25DbG9zZSk7XG5cdFx0aWYgKHRoaXMuaGFuZ1JlbGF5Q3JlYXRpb25PbkNhbGwgPT09IHRoaXMucmVsYXlDYWxsZWQpIHtcblx0XHRcdC8vIFNpbXVsYXRlIGZvcndhcmRPdXQgaGFuZ2luZyBcdTIwMTQgbmV2ZXIgcmVzb2x2ZS4gVGhlIHdyYXBwZXIgaW5cblx0XHRcdC8vIGBjb25uZWN0KClgIHNob3VsZCBzdGlsbCBzdXJmYWNlIGEgdGltZW91dCBlcnJvciBpbnN0ZWFkIG9mXG5cdFx0XHQvLyBoYW5naW5nIHRoZSB3aG9sZSBjb25uZWN0KCkgY2FsbC5cblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0+KCgpID0+IHsgLyogbmV2ZXIgKi8gfSk7XG5cdFx0fVxuXHRcdGNvbnN0IGhvb2tSZXN1bHQgPSB0aGlzLnJlbGF5SG9vaz8uKHRoaXMucmVsYXlDYWxsZWQpO1xuXHRcdGlmIChob29rUmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChob29rUmVzdWx0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgaG9va1Jlc3VsdDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbGF5UmVzdWx0cy5wdXNoKGhvb2tSZXN1bHQpO1xuXHRcdFx0cmV0dXJuIGhvb2tSZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMucmVsYXlSZXN1bHQ7XG5cdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHR0aHJvdyByZXN1bHQ7XG5cdFx0fVxuXHRcdC8vIFJldHVybiBhIGRpc3RpbmN0IG9iamVjdCBwZXIgY2FsbCBzbyBlYWNoIFNTSENvbm5lY3Rpb24gZ2V0cyBpdHMgb3duIHJlbGF5XG5cdFx0Y29uc3QgcmVsYXlPYmogPSB7IHNlbmQ6IHJlc3VsdC5zZW5kLCBjbG9zZTogcmVzdWx0LmNsb3NlIH07XG5cdFx0dGhpcy5fcmVsYXlSZXN1bHRzLnB1c2gocmVsYXlPYmopO1xuXHRcdHJldHVybiByZWxheU9iajtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVTU0hDb25maWcoX2hvc3Q6IHN0cmluZyk6IFJldHVyblR5cGU8U1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2VbJ3Jlc29sdmVTU0hDb25maWcnXT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRob3N0bmFtZTogJzEwLjAuMC4xJyxcblx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0dXNlcjogJ3Rlc3R1c2VyJyxcblx0XHRcdGlkZW50aXR5RmlsZTogW10sXG5cdFx0XHRpZGVudGl0eUFnZW50OiB1bmRlZmluZWQsXG5cdFx0XHRmb3J3YXJkQWdlbnQ6IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogU2ltdWxhdGUgdGhlIG9sZCAoc3VwZXJzZWRlZCkgcmVsYXkncyBXZWJTb2NrZXQgY2xvc2UgZXZlbnQgZmlyaW5nLlxuXHQgKiBUaGlzIGNhbGxzIHRoZSBvbkNsb3NlIGNhbGxiYWNrIG9mIHRoZSBzZWNvbmQtdG8tbGFzdCByZWxheS5cblx0ICovXG5cdHNpbXVsYXRlT2xkUmVsYXlDbG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVsYXlDbG9zZUNhbGxiYWNrcy5sZW5ndGggPj0gMikge1xuXHRcdFx0dGhpcy5fcmVsYXlDbG9zZUNhbGxiYWNrc1t0aGlzLl9yZWxheUNsb3NlQ2FsbGJhY2tzLmxlbmd0aCAtIDJdKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1vZGlmeSB0aGUgbW9zdCByZWNlbnRseSBjcmVhdGVkIHJlbGF5IHNvIHRoYXQgY2FsbGluZyBjbG9zZSgpXG5cdCAqIHN5bmNocm9ub3VzbHkgZmlyZXMgaXRzIG9uQ2xvc2UgY2FsbGJhY2suIFRoaXMgc2ltdWxhdGVzIGEgV2ViU29ja2V0XG5cdCAqIGltcGxlbWVudGF0aW9uIHRoYXQgZmlyZXMgdGhlICdjbG9zZScgZXZlbnQgaW5saW5lIGR1cmluZyB3cy5jbG9zZSgpLlxuXHQgKi9cblx0bWFrZVByZXZpb3VzUmVsYXlTeW5jQ2xvc2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fcmVsYXlSZXN1bHRzLmxlbmd0aCAtIDE7XG5cdFx0aWYgKGlkeCA+PSAwICYmIHRoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3MubGVuZ3RoID4gaWR4KSB7XG5cdFx0XHRjb25zdCBvbkNsb3NlID0gdGhpcy5fcmVsYXlDbG9zZUNhbGxiYWNrc1tpZHhdO1xuXHRcdFx0dGhpcy5fcmVsYXlSZXN1bHRzW2lkeF0uY2xvc2UgPSAoKSA9PiB7IG9uQ2xvc2UoKTsgfTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2ltdWxhdGUgYSBtZXNzYWdlIGFycml2aW5nIG9uIGEgc3BlY2lmaWMgcmVsYXkgKDAtaW5kZXhlZCkuXG5cdCAqIERlZmF1bHRzIHRvIHRoZSBtb3N0IHJlY2VudCByZWxheS5cblx0ICovXG5cdHNpbXVsYXRlUmVsYXlNZXNzYWdlKGRhdGE6IHN0cmluZywgcmVsYXlJbmRleD86IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkeCA9IHJlbGF5SW5kZXggPz8gdGhpcy5fcmVsYXlNZXNzYWdlQ2FsbGJhY2tzLmxlbmd0aCAtIDE7XG5cdFx0dGhpcy5fcmVsYXlNZXNzYWdlQ2FsbGJhY2tzW2lkeF0/LihkYXRhKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaW11bGF0ZSB0aGUgY3VycmVudCAoYWN0aXZlKSByZWxheSdzIFdlYlNvY2tldCBjbG9zZSBldmVudCBmaXJpbmcuXG5cdCAqL1xuXHRzaW11bGF0ZUN1cnJlbnRSZWxheUNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZWxheUNsb3NlQ2FsbGJhY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3JlbGF5Q2xvc2VDYWxsYmFja3NbdGhpcy5fcmVsYXlDbG9zZUNhbGxiYWNrcy5sZW5ndGggLSAxXSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBTZXRzIHRoZSByZWxheSBjcmVhdGlvbiB0aW1lb3V0OyBleHBvc2VkIGZvciB0ZXN0cyBvbmx5LiAqL1xuXHRzZXRSZWxheUNyZWF0aW9uVGltZW91dEZvclRlc3QobXM6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMucmVsYXlDcmVhdGlvblRpbWVvdXRNcyA9IG1zO1xuXHR9XG5cblx0c3RhcnRLZXlib2FyZEludGVyYWN0aXZlRm9yVGVzdChcblx0XHRwcm9tcHRzOiByZWFkb25seSBJU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVByb21wdFtdLFxuXHRcdGZpbmlzaDogKHJlc3BvbnNlczogcmVhZG9ubHkgc3RyaW5nW10pID0+IHZvaWQsXG5cdFx0Y2FuY2VsQ29ubmVjdDogKCkgPT4gdm9pZCxcblx0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faGFuZGxlS2V5Ym9hcmRJbnRlcmFjdGl2ZSgnc3NoOnRlc3QtaG9zdCcsICd0ZXN0LWhvc3QnLCAndGVzdHVzZXInLCAnJywgJycsIHByb21wdHMsIGZpbmlzaCwgY2FuY2VsQ29ubmVjdCk7XG5cdH1cbn1cblxuY2xhc3MgS2V5Ym9hcmRJbnRlcmFjdGl2ZUNvbm5lY3RUZXN0U2VydmljZSBleHRlbmRzIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblx0cmVhZG9ubHkgY2xpZW50ID0gbmV3IEtleWJvYXJkSW50ZXJhY3RpdmVNb2NrU1NIQ2xpZW50KCk7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9jcmVhdGVTU0hDbGllbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2xpZW50IGFzIG5ldmVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9idWlsZEF1dGhBdHRlbXB0cyhjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBQcm9taXNlPFNTSEF1dGhBdHRlbXB0W10+IHtcblx0XHRyZXR1cm4gW3sgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6IGNvbmZpZy51c2VybmFtZSB9XTtcblx0fVxuXG5cdGNvbm5lY3RTU0hGb3JUZXN0KGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZykge1xuXHRcdHJldHVybiB0aGlzLl9jb25uZWN0U1NIKGNvbmZpZywgJ3NzaDp0ZXN0LWhvc3QnKTtcblx0fVxufVxuXG5zdWl0ZSgnU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UgLSBjb25uZWN0IGZsb3cnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzZXJ2aWNlOiBUZXN0YWJsZVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2U6IFBpY2s8SVByb2R1Y3RTZXJ2aWNlLCAnX3NlcnZpY2VCcmFuZCcgfCAncXVhbGl0eScgfCAnZGF0YUZvbGRlck5hbWUnPiA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHF1YWxpdHksXG5cdFx0XHRkYXRhRm9sZGVyTmFtZSxcblx0XHR9O1xuXHRcdHNlcnZpY2UgPSBuZXcgVGVzdGFibGVTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZShcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRwcm9kdWN0U2VydmljZSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgZXhpc3RpbmcgY29ubmVjdGlvbiBvbiBkdXBsaWNhdGUgY29ubmVjdCB3aXRob3V0IHJlcGxhY2luZyByZWxheScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBGaXJzdCBjb25uZWN0OiB1bmFtZSwgQ0xJIGNoZWNrLCBmaW5kUnVubmluZ0FnZW50SG9zdCAobm8gc3RhdGUpLCB3cml0ZSBzdGF0ZVxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIGNhdCBzdGF0ZSBmaWxlIChub3QgZm91bmQpXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LCAgICAgIC8vIHVuYW1lIC1zXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSwgICAgICAvLyB1bmFtZSAtbVxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSwgICAgICAgLy8gQ0xJIC0tdmVyc2lvbiAoYWxyZWFkeSBpbnN0YWxsZWQpXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBlY2hvIHN0YXRlIGZpbGUgKHdyaXRlKVxuXHRcdF07XG5cblx0XHRjb25zdCBjb25maWcgPSBtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215YWxpYXMnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY29uZmlnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5jb25uZWN0aW9uSWQsICdzc2g6bXlhbGlhcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLnNzaENvbmZpZ0hvc3QsICdteWFsaWFzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAxKTtcblxuXHRcdC8vIFNlY29uZCBjb25uZWN0IHdpdGhvdXQgcmVwbGFjZVJlbGF5IFx1MjAxNCByZXR1cm5zIGV4aXN0aW5nIGluZm9cblx0XHQvLyB3aXRob3V0IGNyZWF0aW5nIGEgbmV3IHJlbGF5IG9yIHJlc3RhcnRpbmcgdGhlIGFnZW50XG5cdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChjb25maWcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25JZCwgcmVzdWx0MS5jb25uZWN0aW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25Ub2tlbiwgcmVzdWx0MS5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLnNzaENvbmZpZ0hvc3QsICdteWFsaWFzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAxKTsgLy8gbm8gbmV3IHJlbGF5XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgZnJlc2ggcmVsYXkgb24gcmVjb25uZWN0IHdpdGhvdXQgcmVzdGFydGluZyBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBGaXJzdCBjb25uZWN0OiB1bmFtZSwgQ0xJIGNoZWNrLCBmaW5kUnVubmluZ0FnZW50SG9zdCAobm8gc3RhdGUpLCB3cml0ZSBzdGF0ZVxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIGNhdCBzdGF0ZSBmaWxlIChub3QgZm91bmQpXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LCAgICAgIC8vIHVuYW1lIC1zXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSwgICAgICAvLyB1bmFtZSAtbVxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSwgICAgICAgLy8gQ0xJIC0tdmVyc2lvbiAoYWxyZWFkeSBpbnN0YWxsZWQpXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBlY2hvIHN0YXRlIGZpbGUgKHdyaXRlKVxuXHRcdF07XG5cblx0XHRjb25zdCBjb25maWcgPSBtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215YWxpYXMnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY29uZmlnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGFydENhbGxlZCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVsYXlDYWxsZWQsIDEpO1xuXG5cdFx0Ly8gUmVjb25uZWN0IFx1MjAxNCBjcmVhdGVzIGZyZXNoIHJlbGF5IG9uIGV4aXN0aW5nIFNTSCB0dW5uZWxcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215YWxpYXMnLCAndGVzdC1hZ2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25JZCwgcmVzdWx0MS5jb25uZWN0aW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmNvbm5lY3Rpb25Ub2tlbiwgcmVzdWx0MS5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAxKTsgLy8gbm8gcmVzdGFydFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAyKTsgLy8gZnJlc2ggcmVsYXlcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IGRvZXMgbm90IGZpcmUgb25EaWRSZWxheUNsb3NlIGZvciBzdXBlcnNlZGVkIHJlbGF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBjb25maWcgPSBtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215YWxpYXMnIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjb25maWcpO1xuXG5cdFx0Y29uc3QgY2xvc2VFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheUNsb3NlKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHQvLyBSZWNvbm5lY3QgcmVwbGFjZXMgdGhlIHJlbGF5IFx1MjAxNCBvbGQgcmVsYXkgY2xvc2Ugc2hvdWxkIGJlIHN1cHByZXNzZWRcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29ubmVjdCgnbXlhbGlhcycsICd0ZXN0LWFnZW50Jyk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgb2xkIHJlbGF5J3MgY2xvc2UgZXZlbnQgZmlyaW5nIGFzeW5jaHJvbm91c2x5XG5cdFx0c2VydmljZS5zaW11bGF0ZU9sZFJlbGF5Q2xvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VFdmVudHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IHN1cHByZXNzZXMgc3luY2hyb25vdXMgY2xvc2UgZnJvbSBvbGQgcmVsYXkgZHVyaW5nIHJlcGxhY2VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBjb25maWcgPSBtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215YWxpYXMnIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjb25maWcpO1xuXG5cdFx0Y29uc3QgY2xvc2VFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheUNsb3NlKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHQvLyBNYWtlIHRoZSBmaXJzdCByZWxheSdzIGNsb3NlKCkgc3luY2hyb25vdXNseSBmaXJlIGl0cyBvbkNsb3NlIGNhbGxiYWNrLFxuXHRcdC8vIHNpbXVsYXRpbmcgYSBXZWJTb2NrZXQgdGhhdCBmaXJlcyAnY2xvc2UnIHN5bmNocm9ub3VzbHkgb24gd3MuY2xvc2UoKS5cblx0XHRzZXJ2aWNlLm1ha2VQcmV2aW91c1JlbGF5U3luY0Nsb3NlKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29ubmVjdCgnbXlhbGlhcycsICd0ZXN0LWFnZW50Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9zZUV2ZW50cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHNzaENvbmZpZ0hvc3QgYXMgY29ubmVjdGlvbiBrZXkgd2hlbiBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHNzaENvbmZpZ0hvc3Q6ICdteWhvc3QnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbm5lY3Rpb25JZCwgJ3NzaDpteWhvc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNzaENvbmZpZ0hvc3QsICdteWhvc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgcGxhdGZvcm0gZGV0ZWN0aW9uIGFuZCBDTEkgaW5zdGFsbCB3aXRoIHJlbW90ZUFnZW50SG9zdENvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gV2l0aCBhIGN1c3RvbSBjb21tYW5kLCBvbmx5IHN0YXRlIGZpbGUgY2hlY2sgKyB3cml0ZSBzaG91bGQgaGFwcGVuXG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sICAvLyBjYXQgc3RhdGUgZmlsZSAobm90IGZvdW5kKVxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAvLyBlY2hvIHN0YXRlIGZpbGUgKHdyaXRlKVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2N1c3RvbS9hZ2VudCAtLXBvcnQgMCcsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29ubmVjdGlvbklkLCAndGVzdHVzZXJAMTAuMC4wLjE6MjInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGFydENhbGxlZCwgMSk7XG5cblx0XHQvLyBWZXJpZnkgbm8gdW5hbWUgY2FsbHMgd2VyZSBtYWRlIChjdXN0b20gY29tbWFuZCBza2lwcyBwbGF0Zm9ybSBkZXRlY3Rpb24pXG5cdFx0Y29uc3QgY2xpZW50ID0gc2VydmljZS5tb2NrQ2xpZW50c1swXTtcblx0XHRhc3NlcnQub2soIWNsaWVudC5leGVjQ2FsbHMuc29tZShjID0+IGMuaW5jbHVkZXMoJ3VuYW1lJykpKTtcblx0fSk7XG5cblx0dGVzdCgncmV1c2VzIGV4aXN0aW5nIGFnZW50IGhvc3Qgd2hlbiBzdGF0ZSBmaWxlIGhhcyB2YWxpZCBQSUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdTdGF0ZSA9IHN0YXRlSnNvbigxMjM0LCA3Nzc3LCAnZXhpc3RpbmctdG9rJyk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6IGV4aXN0aW5nU3RhdGUsIGNvZGU6IDAgfSwgICAgLy8gY2F0IHN0YXRlIGZpbGUgKGZvdW5kKVxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8ga2lsbCAtMCAoUElEIGFsaXZlKVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZygpKTtcblxuXHRcdC8vIFNob3VsZCBOT1QgaGF2ZSBzdGFydGVkIGEgbmV3IGFnZW50IGhvc3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGFydENhbGxlZCwgMCk7XG5cdFx0Ly8gU2hvdWxkIGhhdmUgY29ubmVjdGVkIHRoZSBXZWJTb2NrZXQgcmVsYXlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWxheUNhbGxlZCwgMSk7XG5cdFx0Ly8gQ29ubmVjdGlvbiB0b2tlbiBzaG91bGQgY29tZSBmcm9tIHRoZSBzdGF0ZSBmaWxlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25uZWN0aW9uVG9rZW4sICdleGlzdGluZy10b2snKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQtaG9zdCByZXVzZSBza2lwcyBwbGF0Zm9ybSBkZXRlY3Rpb24gYW5kIENMSSBpbnN0YWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IG9uIHRoZSBBSC1yZXVzZSBwYXRoIHdlIG11c3Qgbm90IHBheSBmb3IgYHVuYW1lIC1zYCxcblx0XHQvLyBgdW5hbWUgLW1gLCBgLS12ZXJzaW9uYCwgaW5zdGFsbCwgb3IgY2xlYW51cCBcdTIwMTQgdGhvc2UgYXJlIG9ubHlcblx0XHQvLyBuZWVkZWQgd2hlbiB3ZSdyZSBhY3R1YWxseSBhYm91dCB0byBzcGF3biBhIGZyZXNoIGFnZW50IGhvc3QuXG5cdFx0Y29uc3QgZXhpc3RpbmdTdGF0ZSA9IHN0YXRlSnNvbigxMjM0LCA3Nzc3LCAnZXhpc3RpbmctdG9rJyk7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6IGV4aXN0aW5nU3RhdGUsIGNvZGU6IDAgfSwgICAgLy8gY2F0IHN0YXRlIGZpbGUgKGZvdW5kKVxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8ga2lsbCAtMCAoUElEIGFsaXZlKVxuXHRcdF07XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZygpKTtcblxuXHRcdGNvbnN0IGV4ZWNDYWxscyA9IHNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzO1xuXHRcdGFzc2VydC5vayghZXhlY0NhbGxzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCd1bmFtZScpKSwgYHVuYW1lIHNob3VsZCBub3QgcnVuIG9uIHJldXNlOyBzYXc6ICR7SlNPTi5zdHJpbmdpZnkoZXhlY0NhbGxzKX1gKTtcblx0XHRhc3NlcnQub2soIWV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygnLS12ZXJzaW9uJykpLCBgLS12ZXJzaW9uIHNob3VsZCBub3QgcnVuIG9uIHJldXNlOyBzYXc6ICR7SlNPTi5zdHJpbmdpZnkoZXhlY0NhbGxzKX1gKTtcblx0XHRhc3NlcnQub2soIWV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygndGVzdCAteCcpKSwgYHRlc3QgLXggc2hvdWxkIG5vdCBydW4gb24gcmV1c2U7IHNhdzogJHtKU09OLnN0cmluZ2lmeShleGVjQ2FsbHMpfWApO1xuXHRcdGFzc2VydC5vayghZXhlY0NhbGxzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCdjdXJsJykpLCBgY3VybCBzaG91bGQgbm90IHJ1biBvbiByZXVzZTsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0cyBmcmVzaCB3aGVuIHN0YXRlIGZpbGUgUElEIGlzIGRlYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhbGVTdGF0ZSA9IHN0YXRlSnNvbig5OTk5LCA3Nzc3LCAnb2xkLXRvaycpO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiBzdGFsZVN0YXRlLCBjb2RlOiAwIH0sICAgICAgIC8vIGNhdCBzdGF0ZSBmaWxlXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSwgICAgICAgICAgICAgICAvLyBraWxsIC0wIChQSUQgZGVhZClcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIHJtIC1mIHN0YXRlIGZpbGVcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sICAgICAgIC8vIHVuYW1lIC1zXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSwgICAgICAvLyB1bmFtZSAtbVxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSwgICAgICAgLy8gQ0xJIC0tdmVyc2lvblxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gZWNobyBzdGF0ZSBmaWxlICh3cml0ZSBuZXcpXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKCkpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgc3RhcnRlZCBhIG5ldyBhZ2VudCBob3N0IHNpbmNlIFBJRCB3YXMgZGVhZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAxKTtcblx0XHQvLyBUb2tlbiBzaG91bGQgY29tZSBmcm9tIG5ldyBzdGFydCwgbm90IHRoZSBzdGFsZSBzdGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29ubmVjdGlvblRva2VuLCAndG9rLWFiYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGZyZXNoIHN0YXJ0IHdoZW4gcmVsYXkgdG8gcmV1c2VkIGFnZW50IGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nU3RhdGUgPSBzdGF0ZUpzb24oMTIzNCwgNzc3NywgJ2V4aXN0aW5nLXRvaycpO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiBleGlzdGluZ1N0YXRlLCBjb2RlOiAwIH0sICAgIC8vIGNhdCBzdGF0ZSBmaWxlIChmb3VuZClcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGtpbGwgLTAgKFBJRCBhbGl2ZSlcblx0XHRcdC8vIGNsZWFudXA6IGNhdCBzdGF0ZSBmaWxlLCBraWxsIFBJRCwgcm0gc3RhdGUgZmlsZVxuXHRcdFx0eyBzdGRvdXQ6IGV4aXN0aW5nU3RhdGUsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LCAgICAgICAvLyB1bmFtZSAtc1xuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sICAgICAgLy8gdW5hbWUgLW1cblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sICAgICAgIC8vIENMSSAtLXZlcnNpb25cblx0XHRcdC8vIHdyaXRlIG5ldyBzdGF0ZSBmaWxlIGFmdGVyIGZyZXNoIHN0YXJ0XG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0Ly8gRmlyc3QgcmVsYXkgYXR0ZW1wdCBmYWlscywgc2Vjb25kIHN1Y2NlZWRzXG5cdFx0bGV0IHJlbGF5Q2FsbENvdW50ID0gMDtcblx0XHRzZXJ2aWNlLnJlbGF5SG9vayA9ICgpID0+IHtcblx0XHRcdHJlbGF5Q2FsbENvdW50Kys7XG5cdFx0XHRpZiAocmVsYXlDYWxsQ291bnQgPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBFcnJvcignY29ubmVjdGlvbiByZWZ1c2VkJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzZW5kOiAoKSA9PiB7IH0sIGNsb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoKSk7XG5cblx0XHQvLyBTaG91bGQgaGF2ZSBzdGFydGVkIGEgZnJlc2ggYWdlbnQgaG9zdCBhZnRlciByZWxheSBmYWlsdXJlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWxheUNhbGxDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25uZWN0aW9uVG9rZW4sICd0b2stYWJjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyBtYWxmb3JtZWQgbGVnYWN5IHN0YXRlIGFzIG1pc3NpbmcgYW5kIHN0YXJ0cyBmcmVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsZWdhY3lTdGF0ZSA9IEpTT04uc3RyaW5naWZ5KHsgcGlkOiAxMjM0LCBwb3J0OiA3Nzc3LCBjb25uZWN0aW9uVG9rZW46ICdleGlzdGluZy10b2snIH0pO1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiBsZWdhY3lTdGF0ZSwgY29kZTogMCB9LCAvLyBjYXQgbG9ja2ZpbGUgKG5vIHNjaGVtYVZlcnNpb24pXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgIC8vIHJtIC1mIGNvcnJ1cHQgbG9ja2ZpbGVcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgIC8vIHdyaXRlIG5ldyBsb2NrZmlsZVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZygpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWxheUNhbGxlZCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25uZWN0aW9uVG9rZW4sICd0b2stYWJjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldHJ5IHdoZW4gcmVsYXkgZmFpbHMgb24gZnJlc2hseSBzdGFydGVkIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIG5vIHN0YXRlIGZpbGVcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyB3cml0ZSBzdGF0ZVxuXHRcdF07XG5cblx0XHRzZXJ2aWNlLnJlbGF5UmVzdWx0ID0gbmV3IEVycm9yKCdjb25uZWN0aW9uIHJlZnVzZWQnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoKSksXG5cdFx0XHQvY29ubmVjdGlvbiByZWZ1c2VkLyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW5zIHVwIFNTSCBjbGllbnQgb24gZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdHNlcnZpY2UucmVsYXlSZXN1bHQgPSBuZXcgRXJyb3IoJ2Jvb20nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKCkpKTtcblxuXHRcdC8vIFNTSCBjbGllbnQgc2hvdWxkIGhhdmUgYmVlbiBlbmRlZCBpbiB0aGUgY2F0Y2ggYmxvY2tcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5tb2NrQ2xpZW50c1swXS5lbmRlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nhbml0aXplcyBjb25maWcgaW4gcmVzdWx0IChzdHJpcHMgcGFzc3dvcmQgYW5kIHByaXZhdGVLZXlQYXRoKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuUGFzc3dvcmQsXG5cdFx0XHRwYXNzd29yZDogJ3NlY3JldDEyMycsXG5cdFx0XHRwcml2YXRlS2V5UGF0aDogJy9ob21lL3VzZXIvLnNzaC9pZF9yc2EnLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LmNvbmZpZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ3Bhc3N3b3JkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQuY29uZmlnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsncHJpdmF0ZUtleVBhdGgnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpZy5ob3N0LCAnMTAuMC4wLjEnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY29ubmVjdCByZW1vdmVzIGNvbm5lY3Rpb24gYW5kIGFsbG93cyByZWNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlzY29ubmVjdFxuXHRcdGF3YWl0IHNlcnZpY2UuZGlzY29ubmVjdChyZXN1bHQuY29ubmVjdGlvbklkKTtcblxuXHRcdC8vIE5leHQgY29ubmVjdCBzaG91bGQgY3JlYXRlIGEgbmV3IGNvbm5lY3Rpb25cblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cdFx0c2VydmljZS5zdGFydENhbGxlZCA9IDA7XG5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXJ0Q2FsbGVkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5jb25uZWN0aW9uSWQsIHJlc3VsdC5jb25uZWN0aW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZUNvbm5lY3Rpb25zIG9uIGNvbm5lY3QgYW5kIGRpc2Nvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMoKCkgPT4gZXZlbnRzLnB1c2goJ2NoYW5nZWQnKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2xvc2VDb25uZWN0aW9uKGlkID0+IGV2ZW50cy5wdXNoKGBjbG9zZWQ6JHtpZH1gKSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoe1xuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzWzBdLCAnY2hhbmdlZCcpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpO1xuXHRcdC8vIGRpc2Nvbm5lY3QgZmlyZXMgY2xvc2UgYmVmb3JlIGNoYW5nZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbXG5cdFx0XHQnY2hhbmdlZCcsXG5cdFx0XHRgY2xvc2VkOiR7cmVzdWx0LmNvbm5lY3Rpb25JZH1gLFxuXHRcdFx0J2NoYW5nZWQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVsYXkgbWVzc2FnZSByb3V0aW5nIC0tLVxuXG5cdHRlc3QoJ3JlbGF5IG1lc3NhZ2VzIGZpcmUgb25EaWRSZWxheU1lc3NhZ2Ugd2l0aCBjb3JyZWN0IGNvbm5lY3Rpb25JZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtZXNzYWdlczogQXJyYXk8eyBjb25uZWN0aW9uSWQ6IHN0cmluZzsgZGF0YTogc3RyaW5nIH0+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheU1lc3NhZ2UobXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSkpO1xuXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjF9Jyk7XG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjJ9Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXG5cdFx0XHR7IGNvbm5lY3Rpb25JZDogcmVzdWx0LmNvbm5lY3Rpb25JZCwgZGF0YTogJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoxfScgfSxcblx0XHRcdHsgY29ubmVjdGlvbklkOiByZXN1bHQuY29ubmVjdGlvbklkLCBkYXRhOiAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjJ9JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxheSBjbG9zZSBmaXJlcyBvbkRpZFJlbGF5Q2xvc2Ugd2l0aCBjb3JyZWN0IGNvbm5lY3Rpb25JZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjbG9zZXM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheUNsb3NlKGlkID0+IGNsb3Nlcy5wdXNoKGlkKSkpO1xuXG5cdFx0c2VydmljZS5zaW11bGF0ZUN1cnJlbnRSZWxheUNsb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlcywgW3Jlc3VsdC5jb25uZWN0aW9uSWRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXlTZW5kIGRlbGl2ZXJzIGRhdGEgdG8gdGhlIGNvcnJlY3QgY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZW50RGF0YTogc3RyaW5nW10gPSBbXTtcblx0XHRzZXJ2aWNlLnJlbGF5UmVzdWx0ID0ge1xuXHRcdFx0c2VuZDogKGRhdGE6IHN0cmluZykgPT4gc2VudERhdGEucHVzaChkYXRhKSxcblx0XHRcdGNsb3NlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlbGF5U2VuZChyZXN1bHQuY29ubmVjdGlvbklkLCAnaGVsbG8nKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlbGF5U2VuZChyZXN1bHQuY29ubmVjdGlvbklkLCAnd29ybGQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudERhdGEsIFsnaGVsbG8nLCAnd29ybGQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF5U2VuZCB0byB1bmtub3duIGNvbm5lY3Rpb25JZCBpcyBhIG5vLW9wJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7IHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnIH0pKTtcblxuXHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRhd2FpdCBzZXJ2aWNlLnJlbGF5U2VuZCgnbm9uZXhpc3RlbnQnLCAnZGF0YScpO1xuXHR9KTtcblxuXHQvLyAtLS0gTXVsdGlwbGUgaW5kZXBlbmRlbnQgY29ubmVjdGlvbnMgLS0tXG5cblx0dGVzdCgnY29ubmVjdHMgdG8gdHdvIGRpZmZlcmVudCBob3N0cyBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEZpcnN0IGhvc3Rcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cdFx0Y29uc3QgcjEgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTAuMC4wLjEnLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHQvLyBTZWNvbmQgaG9zdFxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblx0XHRjb25zdCByMiA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxMC4wLjAuMicsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyMS5jb25uZWN0aW9uSWQsIHIyLmNvbm5lY3Rpb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY29ubmVjdCBvbmUgaG9zdCBkb2VzIG5vdCBhZmZlY3QgdGhlIG90aGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblx0XHRjb25zdCByMSA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxMC4wLjAuMScsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblx0XHRjb25zdCByMiA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdGhvc3Q6ICcxMC4wLjAuMicsIHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGlzY29ubmVjdChyMS5jb25uZWN0aW9uSWQpO1xuXG5cdFx0Ly8gcjIgc2hvdWxkIHN0aWxsIGJlIGxpdmUgXHUyMDE0IGR1cGxpY2F0ZSBjb25uZWN0IHJldHVybnMgZXhpc3RpbmcgaW5mb1xuXHRcdGNvbnN0IHIyQWdhaW4gPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTAuMC4wLjInLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIyQWdhaW4uY29ubmVjdGlvbklkLCByMi5jb25uZWN0aW9uSWQpO1xuXHRcdC8vIE5vIG5ldyBzdGFydCBvciByZWxheSB3YXMgbmVlZGVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uuc3RhcnRDYWxsZWQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlbGF5Q2FsbGVkLCAyKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlbGF5IG1lc3NhZ2VzIHJvdXRlIHRvIGNvcnJlY3QgY29ubmVjdGlvbiB3aGVuIG11bHRpcGxlIGV4aXN0IC0tLVxuXG5cdHRlc3QoJ3JlbGF5IG1lc3NhZ2VzIGZyb20gdHdvIGNvbm5lY3Rpb25zIGFyZSBkaXN0aW5ndWlzaGVkIGJ5IGNvbm5lY3Rpb25JZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cdFx0Y29uc3QgcjEgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTAuMC4wLjEnLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cdFx0Y29uc3QgcjIgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTAuMC4wLjInLCByZW1vdGVBZ2VudEhvc3RDb21tYW5kOiAnL2FnZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtZXNzYWdlczogQXJyYXk8eyBjb25uZWN0aW9uSWQ6IHN0cmluZzsgZGF0YTogc3RyaW5nIH0+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheU1lc3NhZ2UobXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSkpO1xuXG5cdFx0Ly8gTWVzc2FnZSBvbiBmaXJzdCBjb25uZWN0aW9uJ3MgcmVsYXkgKGluZGV4IDApXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgnbXNnLWZyb20taG9zdDEnLCAwKTtcblx0XHQvLyBNZXNzYWdlIG9uIHNlY29uZCBjb25uZWN0aW9uJ3MgcmVsYXkgKGluZGV4IDEpXG5cdFx0c2VydmljZS5zaW11bGF0ZVJlbGF5TWVzc2FnZSgnbXNnLWZyb20taG9zdDInLCAxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdHsgY29ubmVjdGlvbklkOiByMS5jb25uZWN0aW9uSWQsIGRhdGE6ICdtc2ctZnJvbS1ob3N0MScgfSxcblx0XHRcdHsgY29ubmVjdGlvbklkOiByMi5jb25uZWN0aW9uSWQsIGRhdGE6ICdtc2ctZnJvbS1ob3N0MicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlY29ubmVjdCBjcmVhdGVzIGZyZXNoIFNTSCBjb25uZWN0aW9uIGFmdGVyIGRpc2Nvbm5lY3QgLS0tXG5cblx0dGVzdCgncmVjb25uZWN0IGFmdGVyIGRpc2Nvbm5lY3QgZXN0YWJsaXNoZXMgYSBuZXcgU1NIIGNvbm5lY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblx0XHRjb25zdCByMSA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLm1vY2tDbGllbnRzLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRpc2Nvbm5lY3QocjEuY29ubmVjdGlvbklkKTtcblxuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByMiA9IGF3YWl0IHNlcnZpY2UucmVjb25uZWN0KCdteWhvc3QnLCAndGVzdC1ob3N0Jyk7XG5cdFx0Ly8gU2hvdWxkIGhhdmUgY3JlYXRlZCBhIGZyZXNoIFNTSCBjbGllbnQgKG5vdCByZXVzZWQgdGhlIG9sZCBvbmUpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UubW9ja0NsaWVudHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjIuY29ubmVjdGlvbklkLCByMS5jb25uZWN0aW9uSWQpO1xuXHR9KTtcblxuXHQvLyAtLS0gUHJvZ3Jlc3MgZXZlbnRzIC0tLVxuXG5cdHRlc3QoJ2ZpcmVzIHByb2dyZXNzIGV2ZW50cyBkdXJpbmcgY29ubmVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3M6IElTU0hDb25uZWN0UHJvZ3Jlc3NbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzKHAgPT4gcHJvZ3Jlc3MucHVzaChwKSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cblx0XHQvLyBFeHBlY3QgYXQgbGVhc3Q6IFNTSCBjb25uZWN0aW5nLCBwbGF0Zm9ybSBkZXRlY3Rpb24sIENMSSBjaGVjaywgc3RhcnQgYWdlbnQsIHJlbGF5XG5cdFx0YXNzZXJ0Lm9rKHByb2dyZXNzLmxlbmd0aCA+PSAzLCBgZXhwZWN0ZWQgYXQgbGVhc3QgMyBwcm9ncmVzcyBldmVudHMsIGdvdCAke3Byb2dyZXNzLmxlbmd0aH1gKTtcblx0XHRhc3NlcnQub2socHJvZ3Jlc3MuZXZlcnkocCA9PiBwLmNvbm5lY3Rpb25LZXkgPT09ICdzc2g6bXlob3N0JykpO1xuXHRcdGFzc2VydC5vayhwcm9ncmVzcy5ldmVyeShwID0+IHAubWVzc2FnZS5sZW5ndGggPiAwKSwgJ2FsbCBwcm9ncmVzcyBtZXNzYWdlcyBzaG91bGQgYmUgbm9uLWVtcHR5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcga2V5Ym9hcmQtaW50ZXJhY3RpdmUgcHJvbXB0IHJlamVjdHMgY29ubmVjdCB3aXRoIGNhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBrYmlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBLZXlib2FyZEludGVyYWN0aXZlQ29ubmVjdFRlc3RTZXJ2aWNlKFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHR7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cXVhbGl0eSxcblx0XHRcdFx0ZGF0YUZvbGRlck5hbWUsXG5cdFx0XHR9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxJU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVJlcXVlc3Q+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGtiaVNlcnZpY2Uub25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZShrYmlSZXF1ZXN0ID0+IHJlcXVlc3QuY29tcGxldGUoa2JpUmVxdWVzdCkpKTtcblxuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0ga2JpU2VydmljZS5jb25uZWN0U1NIRm9yVGVzdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ3Rlc3QtaG9zdCcgfSkpO1xuXHRcdGNvbnN0IGtiaVJlcXVlc3QgPSBhd2FpdCByZXF1ZXN0LnA7XG5cdFx0YXdhaXQga2JpU2VydmljZS5yZXNwb25kS2V5Ym9hcmRJbnRlcmFjdGl2ZShrYmlSZXF1ZXN0LnJlcXVlc3RJZCwgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbm5lY3RQcm9taXNlLCBlcnJvciA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbmRlZDoga2JpU2VydmljZS5jbGllbnQuZW5kZWQsXG5cdFx0XHRmaW5pc2hSZXNwb25zZXM6IGtiaVNlcnZpY2UuY2xpZW50LmZpbmlzaFJlc3BvbnNlcyxcblx0XHR9LCB7XG5cdFx0XHRlbmRlZDogdHJ1ZSxcblx0XHRcdGZpbmlzaFJlc3BvbnNlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BvbmRpbmcgdG8ga2V5Ym9hcmQtaW50ZXJhY3RpdmUgcHJvbXB0IGRvZXMgbm90IGNhbmNlbCBjb25uZWN0aW9uIGF0dGVtcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGZpbmlzaGVkOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCByZXF1ZXN0SWQgPSBzZXJ2aWNlLnN0YXJ0S2V5Ym9hcmRJbnRlcmFjdGl2ZUZvclRlc3QoW1xuXHRcdFx0eyBwcm9tcHQ6ICdQYXNzd29yZDogJywgZWNobzogZmFsc2UgfSxcblx0XHRdLCByZXNwb25zZXMgPT4geyBmaW5pc2hlZCA9IHJlc3BvbnNlczsgfSwgKCkgPT4geyBjYW5jZWxsZWQgPSB0cnVlOyB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdElkLCBbJ3NlY3JldCddKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaW5pc2hlZCwgY2FuY2VsbGVkIH0sIHtcblx0XHRcdGZpbmlzaGVkOiBbJ3NlY3JldCddLFxuXHRcdFx0Y2FuY2VsbGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIFNTSCBjbGllbnQgY2xvc2UgdHJpZ2dlcnMgY29ubmVjdGlvbiBkaXNwb3NhbCAtLS1cblxuXHR0ZXN0KCdTU0ggY2xpZW50IGNsb3NlIGV2ZW50IGRpc3Bvc2VzIHRoZSBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHtcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNsb3NlRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2xvc2VDb25uZWN0aW9uKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgU1NIIGNsaWVudCBjbG9zaW5nIChlLmcuIG5ldHdvcmsgZHJvcClcblx0XHRzZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmZpcmVDbG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9zZUV2ZW50cywgW3Jlc3VsdC5jb25uZWN0aW9uSWRdKTtcblx0fSk7XG5cblx0Ly8gLS0tIENMSSBpbnN0YWxsIGZsb3cgLS0tXG5cblx0dGVzdCgnc2tpcHMgQ0xJIGRvd25sb2FkIHdoZW4gQ0xJIGlzIGFscmVhZHkgaW5zdGFsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIGNhdCBzdGF0ZSBmaWxlIChub3QgZm91bmQpXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LCAgICAgICAvLyB1bmFtZSAtc1xuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sICAgICAgLy8gdW5hbWUgLW1cblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sICAgICAgIC8vIENMSSAtLXZlcnNpb24gc3VjY2VlZHNcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGVjaG8gc3RhdGUgZmlsZSAod3JpdGUpXG5cdFx0XTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKCkpO1xuXG5cdFx0Ly8gVGhlIGV4ZWMgY2FsbHMgc2hvdWxkIE5PVCBpbmNsdWRlIGFueSBjdXJsL3Rhci9pbnN0YWxsIGNvbW1hbmRzXG5cdFx0Y29uc3QgZXhlY0NhbGxzID0gc2VydmljZS5tb2NrQ2xpZW50c1swXS5leGVjQ2FsbHM7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjQ2FsbHMuc29tZShjID0+IGMuaW5jbHVkZXMoJ2N1cmwnKSB8fCBjLmluY2x1ZGVzKCd0YXInKSksXG5cdFx0XHQnc2hvdWxkIG5vdCBkb3dubG9hZCBDTEkgd2hlbiBhbHJlYWR5IGluc3RhbGxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb3dubG9hZHMgQ0xJIHdoZW4gdmVyc2lvbiBjaGVjayBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSwgICAgICAgICAgICAgICAvLyBjYXQgc3RhdGUgZmlsZSAobm90IGZvdW5kKVxuXHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSwgICAgICAgLy8gdW5hbWUgLXNcblx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LCAgICAgIC8vIHVuYW1lIC1tXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEyNyB9LCAgICAgICAgICAgICAvLyBDTEkgLS12ZXJzaW9uIGZhaWxzIChub3QgZm91bmQpXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBjdXJsIHwgdGFyIGluc3RhbGxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIGVjaG8gc3RhdGUgZmlsZSAod3JpdGUpXG5cdFx0XTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKCkpO1xuXG5cdFx0Y29uc3QgZXhlY0NhbGxzID0gc2VydmljZS5tb2NrQ2xpZW50c1swXS5leGVjQ2FsbHM7XG5cdFx0YXNzZXJ0Lm9rKGV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygnY3VybCcpKSxcblx0XHRcdCdzaG91bGQgZG93bmxvYWQgQ0xJIHdoZW4gbm90IGluc3RhbGxlZCcpO1xuXHR9KTtcblxuXHQvLyAtLS0gQ29tbWl0LXBpbm5lZCBpbnN0YWxsIGZsb3cgKHJlbGVhc2UgYnVpbGRzIHdpdGggcHJvZHVjdFNlcnZpY2UuY29tbWl0KSAtLS1cblxuXHRzdWl0ZSgnY29tbWl0LXBpbm5lZCBpbnN0YWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1pdCA9ICdhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxJztcblx0XHRjb25zdCBjbGlCaW4gPSBgfi8udnNjb2RlLWluc2lkZXJzL2NvZGUtaW5zaWRlcnMtJHtjb21taXR9YDtcblx0XHRsZXQgcGlubmVkU2VydmljZTogVGVzdGFibGVTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBQaWNrPElQcm9kdWN0U2VydmljZSwgJ19zZXJ2aWNlQnJhbmQnIHwgJ3F1YWxpdHknIHwgJ2RhdGFGb2xkZXJOYW1lJyB8ICdzZXJ2ZXJEYXRhRm9sZGVyTmFtZScgfCAnY29tbWl0Jz4gPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cXVhbGl0eSxcblx0XHRcdFx0ZGF0YUZvbGRlck5hbWUsXG5cdFx0XHRcdHNlcnZlckRhdGFGb2xkZXJOYW1lOiAnLnZzY29kZS1pbnNpZGVycycsXG5cdFx0XHRcdGNvbW1pdCxcblx0XHRcdH07XG5cdFx0XHRwaW5uZWRTZXJ2aWNlID0gbmV3IFRlc3RhYmxlU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UoXG5cdFx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRcdHByb2R1Y3RTZXJ2aWNlIGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGlubmVkU2VydmljZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbHdheXMgaW52b2tlcyBjbGVhbnVwIG9mIG9sZCBjb21taXQta2V5ZWQgQ0xJcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHBpbm5lZFNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sICAgICAgICAgICAgICAgLy8gY2F0IHN0YXRlIChub25lKVxuXHRcdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gdGVzdCAteCBjbGlCaW4gXHUyMTkyIHByZXNlbnRcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gdG91Y2ggY2xpQmluIChyZWZyZXNoIG10aW1lIG9uIHJldXNlKVxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBjbGVhbnVwIChydW5zIGFmdGVyIHJldXNlIGRlY2lzaW9uKVxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyB3cml0ZSBzdGF0ZVxuXHRcdFx0XTtcblx0XHRcdGF3YWl0IHBpbm5lZFNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKCkpO1xuXG5cdFx0XHRjb25zdCBleGVjQ2FsbHMgPSBwaW5uZWRTZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmV4ZWNDYWxscztcblx0XHRcdC8vIFJldGVudGlvbiBzbmlwcGV0OiBgbHMgLTF0IC4uLiB8IGF3ayAnTlI+NScgfCB4YXJncyBybWBcblx0XHRcdGFzc2VydC5vayhleGVjQ2FsbHMuc29tZShjID0+IC9scyAtMXQgLipjb2RlLWluc2lkZXJzLS8udGVzdChjKSAmJiAvYXdrXFxzKydOUj41Jy8udGVzdChjKSksXG5cdFx0XHRcdGBjbGVhbnVwIGNvbW1hbmQgc2hvdWxkIGhhdmUgcnVuOyBzYXc6ICR7SlNPTi5zdHJpbmdpZnkoZXhlY0NhbGxzKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldXNlcyBleGlzdGluZyBjb21taXQta2V5ZWQgQ0xJIHdpdGhvdXQgcmUtZG93bmxvYWRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwaW5uZWRTZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIGNhdCBzdGF0ZSAobm9uZSlcblx0XHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LCAgICAgICAgICAgICAgIC8vIHRlc3QgLXggY2xpQmluIFx1MjE5MiAwIChwcmVzZW50KVxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyB0b3VjaCBjbGlCaW5cblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gY2xlYW51cFxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyB3cml0ZSBzdGF0ZVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcGlubmVkU2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoKSk7XG5cblx0XHRcdGNvbnN0IGV4ZWNDYWxscyA9IHBpbm5lZFNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcyhgdGVzdCAteCAke2NsaUJpbn1gKSksXG5cdFx0XHRcdGBzaG91bGQgdGVzdCBmb3IgY29tbWl0LWtleWVkIENMSTsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdFx0XHRhc3NlcnQub2soIWV4ZWNDYWxscy5zb21lKGMgPT4gYy5pbmNsdWRlcygnY3VybCcpKSxcblx0XHRcdFx0YHNob3VsZCBub3QgZG93bmxvYWQgd2hlbiBjb21taXQta2V5ZWQgQ0xJIHByZXNlbnQ7IHNhdzogJHtKU09OLnN0cmluZ2lmeShleGVjQ2FsbHMpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG93bmxvYWRzIGZyb20gY29tbWl0LXBpbm5lZCBVUkwgd2hlbiBDTEkgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHBpbm5lZFNlcnZpY2UuZXhlY1Jlc3BvbnNlcyA9IFtcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sICAgICAgICAgICAgICAgLy8gY2F0IHN0YXRlIChub25lKVxuXHRcdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sICAgICAgICAgICAgICAgLy8gdGVzdCAteCBcdTIxOTIgbWlzc2luZ1xuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBta2Rpcitta3RlbXArY3VybHx0YXIrbXYrY2htb2Qrcm1cblx0XHRcdFx0eyBzdGRvdXQ6ICcxLjAuMFxcbicsIGNvZGU6IDAgfSwgICAgICAgLy8gPGNsaUJpbj4gLS12ZXJzaW9uIHZhbGlkYXRpb25cblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gY2xlYW51cCAoYWZ0ZXIgc3VjY2Vzc2Z1bCBpbnN0YWxsKVxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyB3cml0ZSBzdGF0ZVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcGlubmVkU2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoKSk7XG5cblx0XHRcdGNvbnN0IGV4ZWNDYWxscyA9IHBpbm5lZFNlcnZpY2UubW9ja0NsaWVudHNbMF0uZXhlY0NhbGxzO1xuXHRcdFx0Y29uc3QgaW5zdGFsbENhbGwgPSBleGVjQ2FsbHMuZmluZChjID0+IGMuaW5jbHVkZXMoJ2N1cmwnKSk7XG5cdFx0XHRhc3NlcnQub2soaW5zdGFsbENhbGwsIGBzaG91bGQgaGF2ZSBydW4gY3VybCBpbnN0YWxsOyBzYXc6ICR7SlNPTi5zdHJpbmdpZnkoZXhlY0NhbGxzKX1gKTtcblx0XHRcdGFzc2VydC5vayhpbnN0YWxsQ2FsbCEuaW5jbHVkZXMoYGNvbW1pdDoke2NvbW1pdH1gKSxcblx0XHRcdFx0YGluc3RhbGwgVVJMIHNob3VsZCBiZSBjb21taXQtcGlubmVkOyBnb3Q6ICR7aW5zdGFsbENhbGx9YCk7XG5cdFx0XHRhc3NlcnQub2soaW5zdGFsbENhbGwhLmluY2x1ZGVzKGBtdiBgKSAmJiBpbnN0YWxsQ2FsbCEuaW5jbHVkZXMoY2xpQmluKSxcblx0XHRcdFx0YGluc3RhbGwgc2hvdWxkIGF0b21pYy1tdiBpbnRvIGNvbW1pdC1rZXllZCBwYXRoOyBnb3Q6ICR7aW5zdGFsbENhbGx9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGFueSB1c2FibGUgQ0xJIHdoZW4gY29tbWl0LXBpbm5lZCBkb3dubG9hZCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZhbGxiYWNrQmluID0gYH4vLnZzY29kZS1pbnNpZGVycy9jb2RlLWluc2lkZXJzLTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBgO1xuXHRcdFx0cGlubmVkU2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSwgICAgICAgICAgICAgICAvLyBjYXQgc3RhdGUgKG5vbmUpXG5cdFx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHRcdHsgc3Rkb3V0OiAneDg2XzY0XFxuJywgY29kZTogMCB9LFxuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSwgICAgICAgICAgICAgICAvLyB0ZXN0IC14IFx1MjE5MiBtaXNzaW5nXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogNyB9LCAgICAgICAgICAgICAgIC8vIGluc3RhbGwgZmFpbHMgKGN1cmwgZXhpdCA3KVxuXHRcdFx0XHR7IHN0ZG91dDogYCR7ZmFsbGJhY2tCaW59XFxuYCwgY29kZTogMCB9LCAvLyBmYWxsYmFjayBmaW5kZXIgbGlzdHMgb2xkIGNvbW1pdC1rZXllZFxuXHRcdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LCAgICAgICAvLyBmYWxsYmFjayAtLXZlcnNpb24gc3VjY2VlZHNcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sICAgICAgICAgICAgICAgLy8gd3JpdGUgc3RhdGVcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHBpbm5lZFNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKCkpO1xuXG5cdFx0XHRjb25zdCBleGVjQ2FsbHMgPSBwaW5uZWRTZXJ2aWNlLm1vY2tDbGllbnRzWzBdLmV4ZWNDYWxscztcblx0XHRcdC8vIEZhbGxiYWNrIGZpbmRlciBzbmlwcGV0IGVudW1lcmF0ZXMgY29tbWl0LWtleWVkIGNhbmRpZGF0ZXMgYnkgbXRpbWUuXG5cdFx0XHRhc3NlcnQub2soZXhlY0NhbGxzLnNvbWUoYyA9PiAvbHMgLTF0IC4qY29kZS1pbnNpZGVycy0vLnRlc3QoYykgJiYgYy5pbmNsdWRlcygnLnZzY29kZS1jbGktaW5zaWRlci9jb2RlLWluc2lkZXJzJykpLFxuXHRcdFx0XHRgc2hvdWxkIGhhdmUgcnVuIGZhbGxiYWNrIGZpbmRlcjsgc2F3OiAke0pTT04uc3RyaW5naWZ5KGV4ZWNDYWxscyl9YCk7XG5cdFx0XHQvLyBTaG91bGQgaGF2ZSAtLXZlcnNpb24tdmFsaWRhdGVkIHRoZSBmYWxsYmFjayBjYW5kaWRhdGUuXG5cdFx0XHRhc3NlcnQub2soZXhlY0NhbGxzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKGAke2ZhbGxiYWNrQmlufSAtLXZlcnNpb25gKSksXG5cdFx0XHRcdGBzaG91bGQgLS12ZXJzaW9uLXZhbGlkYXRlIGZhbGxiYWNrOyBzYXc6ICR7SlNPTi5zdHJpbmdpZnkoZXhlY0NhbGxzKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3BhZ2F0ZXMgaW5zdGFsbCBlcnJvciB3aGVuIG5vIGZhbGxiYWNrIENMSSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwaW5uZWRTZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIGNhdCBzdGF0ZSAobm9uZSlcblx0XHRcdFx0eyBzdGRvdXQ6ICdMaW51eFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMSB9LCAgICAgICAgICAgICAgIC8vIHRlc3QgLXggXHUyMTkyIG1pc3Npbmdcblx0XHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiA3IH0sICAgICAgICAgICAgICAgLy8gaW5zdGFsbCBmYWlsc1xuXHRcdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSwgICAgICAgICAgICAgICAvLyBmYWxsYmFjayBmaW5kZXIgcmV0dXJucyBub3RoaW5nXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhwaW5uZWRTZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZygpKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBDb25uZWN0aW9uIGtleSBmb3JtYXRzIC0tLVxuXG5cdHRlc3QoJ3VzZXMgaG9zdDpwb3J0IGFzIGNvbm5lY3Rpb24ga2V5IHdpdGhvdXQgc3NoQ29uZmlnSG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTkyLjE2OC4xLjEnLFxuXHRcdFx0cG9ydDogMjIyMixcblx0XHRcdHJlbW90ZUFnZW50SG9zdENvbW1hbmQ6ICcvYWdlbnQnLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbm5lY3Rpb25JZCwgJ3Rlc3R1c2VyQDE5Mi4xNjguMS4xOjIyMjInKTtcblx0fSk7XG5cblx0dGVzdCgnZGVmYXVsdHMgdG8gcG9ydCAyMiBpbiBjb25uZWN0aW9uIGtleScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnJywgY29kZTogMCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbm5lY3QobWFrZUNvbmZpZyh7XG5cdFx0XHRob3N0OiAnMTkyLjE2OC4xLjEnLFxuXHRcdFx0cmVtb3RlQWdlbnRIb3N0Q29tbWFuZDogJy9hZ2VudCcsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29ubmVjdGlvbklkLCAndGVzdHVzZXJAMTkyLjE2OC4xLjE6MjInKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlY29ubmVjdCBwcmVzZXJ2ZXMgY29ubmVjdGlvbiB0b2tlbiBmcm9tIGluaXRpYWwgY29ubmVjdCAtLS1cblxuXHR0ZXN0KCdyZWNvbm5lY3QgcHJlc2VydmVzIGNvbm5lY3Rpb24gdG9rZW4gYW5kIGFkZHJlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IG9yaWdpbmFsID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cblx0XHRjb25zdCByZWNvbm5lY3RlZCA9IGF3YWl0IHNlcnZpY2UucmVjb25uZWN0KCdteWhvc3QnLCAnbmV3LW5hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjb25uZWN0ZWQuY29ubmVjdGlvblRva2VuLCBvcmlnaW5hbC5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvbm5lY3RlZC5hZGRyZXNzLCBvcmlnaW5hbC5hZGRyZXNzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjb25uZWN0ZWQuY29ubmVjdGlvbklkLCBvcmlnaW5hbC5jb25uZWN0aW9uSWQpO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVsYXkgbWVzc2FnZXMgZnJvbSBzdXBlcnNlZGVkIHJlbGF5IGFyZSBzdGlsbCByb3V0ZWQgKG5vdCBnYXRlZCkgLS0tXG5cblx0dGVzdCgnbWVzc2FnZXMgZnJvbSBzdXBlcnNlZGVkIHJlbGF5IHN0aWxsIGFycml2ZSAob25seSBjbG9zZSBpcyBzdXBwcmVzc2VkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cblx0XHRjb25zdCBtZXNzYWdlczogQXJyYXk8eyBjb25uZWN0aW9uSWQ6IHN0cmluZzsgZGF0YTogc3RyaW5nIH0+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZWxheU1lc3NhZ2UobXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSkpO1xuXG5cdFx0Ly8gUmVjb25uZWN0IHJlcGxhY2VzIHRoZSByZWxheVxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb25uZWN0KCdteWhvc3QnLCAndGVzdC1ob3N0Jyk7XG5cblx0XHQvLyBTaW11bGF0ZSBhIG1lc3NhZ2UgYXJyaXZpbmcgZnJvbSB0aGUgT0xEIHJlbGF5IChpbmRleCAwKVxuXHRcdHNlcnZpY2Uuc2ltdWxhdGVSZWxheU1lc3NhZ2UoJ3N0YWxlLW1lc3NhZ2UnLCAwKTtcblx0XHQvLyBBbmQgZnJvbSB0aGUgTkVXIHJlbGF5IChpbmRleCAxKVxuXHRcdHNlcnZpY2Uuc2ltdWxhdGVSZWxheU1lc3NhZ2UoJ2ZyZXNoLW1lc3NhZ2UnLCAxKTtcblxuXHRcdC8vIEJvdGggbWVzc2FnZXMgYXJyaXZlIFx1MjAxNCBtZXNzYWdlIHN1cHByZXNzaW9uIGlzIGRlbGliZXJhdGVseSBOT1QgZG9uZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdHsgY29ubmVjdGlvbklkOiByZXN1bHQuY29ubmVjdGlvbklkLCBkYXRhOiAnc3RhbGUtbWVzc2FnZScgfSxcblx0XHRcdHsgY29ubmVjdGlvbklkOiByZXN1bHQuY29ubmVjdGlvbklkLCBkYXRhOiAnZnJlc2gtbWVzc2FnZScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlY29ubmVjdCBmYWlsdXJlIGNsZWFucyB1cCBkZXRhY2hlZCBTU0ggY2xpZW50IC0tLVxuXG5cdHRlc3QoJ3JlY29ubmVjdCBjbGVhbnMgdXAgU1NIIGNsaWVudCB3aGVuIHJlbGF5IHJlY3JlYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXHRcdGNvbnN0IG9yaWdpbmFsQ2xpZW50ID0gc2VydmljZS5tb2NrQ2xpZW50c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxDbGllbnQuZW5kZWQsIGZhbHNlKTtcblxuXHRcdC8vIE1ha2UgcmVsYXkgY3JlYXRpb24gZmFpbCBvbiB0aGUgbmV4dCBjYWxsICh0aGUgcmVjb25uZWN0IGF0dGVtcHQpXG5cdFx0c2VydmljZS5yZWxheUhvb2sgPSAoY2FsbCkgPT4ge1xuXHRcdFx0aWYgKGNhbGwgPT09IDIpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBFcnJvcigncmVsYXkgZmFpbGVkJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBjbG9zZUV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENsb3NlQ29ubmVjdGlvbihpZCA9PiBjbG9zZUV2ZW50cy5wdXNoKGlkKSkpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLnJlY29ubmVjdCgnbXlob3N0JywgJ3Rlc3QtaG9zdCcpLFxuXHRcdFx0L3JlbGF5IGZhaWxlZC8sXG5cdFx0KTtcblxuXHRcdC8vIFNTSCBjbGllbnQgc2hvdWxkIGhhdmUgYmVlbiBjbGVhbmVkIHVwIGRlc3BpdGUgdGhlIGZhaWx1cmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxDbGllbnQuZW5kZWQsIHRydWUpO1xuXHRcdC8vIENsb3NlIGV2ZW50IHNob3VsZCBoYXZlIGZpcmVkIHRvIG5vdGlmeSB0aGUgcmVuZGVyZXJcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlRXZlbnRzLCBbJ3NzaDpteWhvc3QnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCByZWplY3RzIHdpdGggdGltZW91dCB3aGVuIHJlbGF5IGNyZWF0aW9uIGhhbmdzIChzaWxlbnRseSBkZWFkIFNTSCBjbGllbnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlcHJvIGZvcjogYWZ0ZXIgYSBzaWxlbnQgbmV0d29yayBkcm9wLCB0aGUgU1NIIGNsaWVudCdzIFRDUCBpc1xuXHRcdC8vIGhhbGYtb3BlbiBidXQgc3NoMiBoYXNuJ3Qgc2VlbiAnY2xvc2UnIHlldC4gUmV1c2luZyBpdCBmb3IgYSBmcmVzaFxuXHRcdC8vIHJlbGF5IGNhbGxzIGZvcndhcmRPdXQsIHdob3NlIGNhbGxiYWNrIG5ldmVyIGZpcmVzLiBXaXRob3V0IGFcblx0XHQvLyB0aW1lb3V0IHRoZSB3aG9sZSBjb25uZWN0KCkgY2FsbCBoYW5ncyBmb3JldmVyLCBzbyB0aGUgcmVuZGVyZXJcblx0XHQvLyBuZXZlciBzZWVzIGEgcmVqZWN0aW9uIGFuZCBuZXZlciByZXRyaWVzIFx1MjAxNCBldmVuIGFmdGVyIGEgd2luZG93XG5cdFx0Ly8gcmVsb2FkLCBzaW5jZSB0aGUgc2hhcmVkLXByb2Nlc3Mgc3RhdGUgc3Vydml2ZXMuXG5cdFx0c2VydmljZS5leGVjUmVzcG9uc2VzID0gW1xuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAxIH0sXG5cdFx0XHR7IHN0ZG91dDogJ0xpbnV4XFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICd4ODZfNjRcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJzEuMC4wXFxuJywgY29kZTogMCB9LFxuXHRcdFx0eyBzdGRvdXQ6ICcnLCBjb2RlOiAwIH0sXG5cdFx0XTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChtYWtlQ29uZmlnKHsgc3NoQ29uZmlnSG9zdDogJ215aG9zdCcgfSkpO1xuXHRcdGNvbnN0IG9yaWdpbmFsQ2xpZW50ID0gc2VydmljZS5tb2NrQ2xpZW50c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxDbGllbnQuZW5kZWQsIGZhbHNlKTtcblxuXHRcdC8vIFVzZSBhIHNob3J0IHRpbWVvdXQgc28gdGhlIHRlc3QgY29tcGxldGVzIHF1aWNrbHkuXG5cdFx0c2VydmljZS5zZXRSZWxheUNyZWF0aW9uVGltZW91dEZvclRlc3QoNTApO1xuXHRcdC8vIE1ha2UgdGhlICpyZWNvbm5lY3QqIGNhbGwncyByZWxheSBjcmVhdGlvbiBoYW5nICh0aGUgc2Vjb25kIHJlbGF5KS5cblx0XHRzZXJ2aWNlLmhhbmdSZWxheUNyZWF0aW9uT25DYWxsID0gMjtcblxuXHRcdGNvbnN0IGNsb3NlRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2xvc2VDb25uZWN0aW9uKGlkID0+IGNsb3NlRXZlbnRzLnB1c2goaWQpKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucmVjb25uZWN0KCdteWhvc3QnLCAndGVzdC1ob3N0JyksXG5cdFx0XHQvdGltZWQgb3V0fHRpbWVvdXQvaSxcblx0XHRcdCdyZWNvbm5lY3Qgc2hvdWxkIHJlamVjdCAod2l0aCBhIHRpbWVvdXQgZXJyb3IpIGluc3RlYWQgb2YgaGFuZ2luZyB3aGVuIHJlbGF5IGNyZWF0aW9uIG5ldmVyIHNldHRsZXMnXG5cdFx0KTtcblxuXHRcdC8vIFNTSCBjbGllbnQgc2hvdWxkIGhhdmUgYmVlbiBlbmRlZCBzbyBzdWJzZXF1ZW50IHJlY29ubmVjdCBhdHRlbXB0c1xuXHRcdC8vIGRvbid0IGtlZXAgcmV1c2luZyB0aGUgZGVhZCBjbGllbnQuIEFmdGVyIHRoaXMsIHRoZSBlbnRyeSBpcyBhbHNvXG5cdFx0Ly8gcmVtb3ZlZCBmcm9tIGBfY29ubmVjdGlvbnNgIHNvIGEgZnJlc2ggcmVjb25uZWN0IHBhdGggcnVucy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxDbGllbnQuZW5kZWQsIHRydWUsICdkZWFkIFNTSCBjbGllbnQgc2hvdWxkIGJlIGVuZGVkJyk7XG5cdFx0Ly8gQ2xvc2UgZXZlbnQgc2hvdWxkIGhhdmUgZmlyZWQgc28gdGhlIHJlbmRlcmVyJ3MgY29udHJpYnV0aW9uIHNlZXNcblx0XHQvLyB0aGUgcmVjb25uZWN0IGF0dGVtcHQgcmVzb2x2ZWQgKGV2ZW4gYXMgYSBmYWlsdXJlKSBhbmQgY2FuIHJldHJ5LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VFdmVudHMsIFsnc3NoOm15aG9zdCddKTtcblx0fSk7XG5cblx0Ly8gLS0tIFJlY29ubmVjdCBjbGVhbnMgdXAgb2xkIFNTSCBjbGllbnQgbGlzdGVuZXJzIC0tLVxuXG5cdHRlc3QoJ3JlY29ubmVjdCByZW1vdmVzIG9sZCBjbG9zZS9lcnJvciBsaXN0ZW5lcnMgZnJvbSBzaGFyZWQgU1NIIGNsaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmV4ZWNSZXNwb25zZXMgPSBbXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDEgfSxcblx0XHRcdHsgc3Rkb3V0OiAnTGludXhcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJ3g4Nl82NFxcbicsIGNvZGU6IDAgfSxcblx0XHRcdHsgc3Rkb3V0OiAnMS4wLjBcXG4nLCBjb2RlOiAwIH0sXG5cdFx0XHR7IHN0ZG91dDogJycsIGNvZGU6IDAgfSxcblx0XHRdO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KG1ha2VDb25maWcoeyBzc2hDb25maWdIb3N0OiAnbXlob3N0JyB9KSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gc2VydmljZS5tb2NrQ2xpZW50c1swXTtcblxuXHRcdC8vIEFmdGVyIGluaXRpYWwgY29ubmVjdCwgdGhlIFNTSCBjbGllbnQgaGFzIGNsb3NlL2Vycm9yIGxpc3RlbmVycyBmcm9tIFNTSENvbm5lY3Rpb25cblx0XHRjb25zdCBjbG9zZUxpc3RlbmVyc0JlZm9yZSA9IGNsaWVudC5jbG9zZUxpc3RlbmVyQ291bnQ7XG5cdFx0Y29uc3QgZXJyb3JMaXN0ZW5lcnNCZWZvcmUgPSBjbGllbnQuZXJyb3JMaXN0ZW5lckNvdW50O1xuXHRcdGFzc2VydC5vayhjbG9zZUxpc3RlbmVyc0JlZm9yZSA+IDAsICdzaG91bGQgaGF2ZSBjbG9zZSBsaXN0ZW5lcnMgYWZ0ZXIgY29ubmVjdCcpO1xuXHRcdGFzc2VydC5vayhlcnJvckxpc3RlbmVyc0JlZm9yZSA+IDAsICdzaG91bGQgaGF2ZSBlcnJvciBsaXN0ZW5lcnMgYWZ0ZXIgY29ubmVjdCcpO1xuXG5cdFx0Ly8gUmVjb25uZWN0IHJlcGxhY2VzIHRoZSBTU0hDb25uZWN0aW9uIFx1MjAxNCBvbGQgbGlzdGVuZXJzIHNob3VsZCBiZSByZW1vdmVkXG5cdFx0YXdhaXQgc2VydmljZS5yZWNvbm5lY3QoJ215aG9zdCcsICd0ZXN0LWhvc3QnKTtcblxuXHRcdC8vIExpc3RlbmVyIGNvdW50IHNob3VsZCBub3QgZ3JvdyBcdTIwMTQgb2xkIG9uZXMgcmVtb3ZlZCwgbmV3IG9uZXMgYWRkZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50LmNsb3NlTGlzdGVuZXJDb3VudCwgY2xvc2VMaXN0ZW5lcnNCZWZvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuZXJyb3JMaXN0ZW5lckNvdW50LCBlcnJvckxpc3RlbmVyc0JlZm9yZSk7XG5cdH0pO1xufSk7XG5cbi8qKlxuICogU3ViY2xhc3MgdGhhdCBleHBvc2VzIGBfYnVpbGRBdXRoQXR0ZW1wdHNgIGFuZCBzdHVicyBvdXQgdGhlIGRpc2svZW52IHNlYW1zXG4gKiBzbyB0aGUgYXV0aC1hdHRlbXB0IGJ1aWxkaW5nIGxvZ2ljIGNhbiBiZSB0ZXN0ZWQgaW4gaXNvbGF0aW9uLlxuICovXG5jbGFzcyBBdXRoQXR0ZW1wdHNUZXN0U2VydmljZSBleHRlbmRzIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblxuXHRhZ2VudFNvY2s6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0a2V5RmlsZXM6IE1hcDxzdHJpbmcsIEJ1ZmZlcj4gPSBuZXcgTWFwKCk7XG5cblx0YXN5bmMgdGVzdEJ1aWxkQXV0aEF0dGVtcHRzKGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyk6IFByb21pc2U8U1NIQXV0aEF0dGVtcHRbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9idWlsZEF1dGhBdHRlbXB0cyhjb25maWcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9pc0FnZW50QXZhaWxhYmxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYWdlbnRTb2NrO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9yZWFkS2V5RmlsZUlmRXhpc3RzKGtleVBhdGg6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMua2V5RmlsZXMuZ2V0KGtleVBhdGgpO1xuXHR9XG59XG5cbnN1aXRlKCdTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSAtIF9idWlsZEF1dGhBdHRlbXB0cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHNlcnZpY2U6IEF1dGhBdHRlbXB0c1Rlc3RTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2U6IFBpY2s8SVByb2R1Y3RTZXJ2aWNlLCAnX3NlcnZpY2VCcmFuZCcgfCAncXVhbGl0eScgfCAnZGF0YUZvbGRlck5hbWUnPiA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHF1YWxpdHksXG5cdFx0XHRkYXRhRm9sZGVyTmFtZSxcblx0XHR9O1xuXHRcdHNlcnZpY2UgPSBuZXcgQXV0aEF0dGVtcHRzVGVzdFNlcnZpY2UoXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UgYXMgSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBSU0EgPSBCdWZmZXIuZnJvbSgncnNhLWtleS1ieXRlcycpO1xuXHRjb25zdCBFRCA9IEJ1ZmZlci5mcm9tKCdlZDI1NTE5LWtleS1ieXRlcycpO1xuXHRjb25zdCBFWFBMSUNJVCA9IEJ1ZmZlci5mcm9tKCdleHBsaWNpdC1rZXktYnl0ZXMnKTtcblxuXHRmdW5jdGlvbiBzc2hTdHJpbmcodmFsdWU6IHN0cmluZyk6IEJ1ZmZlciB7XG5cdFx0Y29uc3QgdmFsdWVCdWZmZXIgPSBCdWZmZXIuZnJvbSh2YWx1ZSwgJ3V0ZjgnKTtcblx0XHRjb25zdCBsZW5ndGhCdWZmZXIgPSBCdWZmZXIuYWxsb2MoNCk7XG5cdFx0bGVuZ3RoQnVmZmVyLndyaXRlVUludDMyQkUodmFsdWVCdWZmZXIubGVuZ3RoLCAwKTtcblx0XHRyZXR1cm4gQnVmZmVyLmNvbmNhdChbbGVuZ3RoQnVmZmVyLCB2YWx1ZUJ1ZmZlcl0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gb3BlblNTSFByaXZhdGVLZXlXaXRoQ2lwaGVyKGNpcGhlcjogc3RyaW5nKTogQnVmZmVyIHtcblx0XHRjb25zdCBkYXRhID0gQnVmZmVyLmNvbmNhdChbXG5cdFx0XHRCdWZmZXIuZnJvbSgnb3BlbnNzaC1rZXktdjFcXDAnLCAndXRmOCcpLFxuXHRcdFx0c3NoU3RyaW5nKGNpcGhlciksXG5cdFx0XSk7XG5cdFx0cmV0dXJuIEJ1ZmZlci5mcm9tKFtcblx0XHRcdCctLS0tLUJFR0lOIE9QRU5TU0ggUFJJVkFURSBLRVktLS0tLScsXG5cdFx0XHRkYXRhLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdCctLS0tLUVORCBPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS0nLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHR9XG5cblx0dGVzdCgnQWdlbnQgKyBubyBTU0hfQVVUSF9TT0NLICsgb25seSBpZF9yc2EgZXhpc3RzIFx1MjE5MiBwdWJsaWNrZXkgaWRfcnNhLCB0aGVuIGtleWJvYXJkLWludGVyYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gdW5kZWZpbmVkO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7IGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogUlNBLCBrZXlQYXRoOiAnfi8uc3NoL2lkX3JzYScgfSxcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd0ZXN0dXNlcicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgKyBTU0hfQVVUSF9TT0NLICsgb25seSBpZF9yc2EgZXhpc3RzIFx1MjE5MiBhZ2VudCB0aGVuIHB1YmxpY2tleSBpZF9yc2EsIHRoZW4ga2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgcmVncmVzc2lvbi1kcml2aW5nIGNhc2U6IGFnZW50IGlzIHNldCBidXQgZG9lc24ndCBoYXZlXG5cdFx0Ly8gdGhlIGtleSwgc28gd2UgbXVzdCBzdGlsbCBmYWxsIHRocm91Z2ggdG8gdGhlIG9uLWRpc2sgZGVmYXVsdCBrZXkuXG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJ34vLnNzaC9pZF9yc2EnLCBSU0EpO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHsgYXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5BZ2VudCB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGVtcHRzLCBbXG5cdFx0XHR7IHR5cGU6ICdhZ2VudCcsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBhZ2VudDogJy90bXAvc3NoLWFnZW50LnNvY2snIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBSU0EsIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIFNTSF9BVVRIX1NPQ0sgKyBpZF9lZDI1NTE5IGFuZCBpZF9yc2EgZXhpc3QgXHUyMTkyIGFnZW50IHRoZW4gYm90aCBrZXlzIGluIGRlZmF1bHQgb3JkZXIsIHRoZW4ga2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJ34vLnNzaC9pZF9lZDI1NTE5JywgRUQpO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7IGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywgYWdlbnQ6ICcvdG1wL3NzaC1hZ2VudC5zb2NrJyB9LFxuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogRUQsIGtleVBhdGg6ICd+Ly5zc2gvaWRfZWQyNTUxOScgfSxcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IFJTQSwga2V5UGF0aDogJ34vLnNzaC9pZF9yc2EnIH0sXG5cdFx0XHR7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiAndGVzdHVzZXInIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FnZW50ICsgU1NIX0FVVEhfU09DSyArIG5vIGRlZmF1bHQga2V5cyBcdTIxOTIgYWdlbnQgdGhlbiBrZXlib2FyZC1pbnRlcmFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFnZW50U29jayA9ICcvdG1wL3NzaC1hZ2VudC5zb2NrJztcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7IGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywgYWdlbnQ6ICcvdG1wL3NzaC1hZ2VudC5zb2NrJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIElkZW50aXR5QWdlbnQgdXNlcyBjb25maWd1cmVkIGFnZW50IGVuZHBvaW50IGJlZm9yZSBkZWZhdWx0IGtleXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJ34vLnNzaC9pZF9yc2EnLCBSU0EpO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHtcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRpZGVudGl0eUFnZW50OiAnLy8uL3BpcGUvcGFnZWFudC51c2VyLjEyMzQnLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGFnZW50OiAnLy8uL3BpcGUvcGFnZWFudC51c2VyLjEyMzQnIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBSU0EsIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIElkZW50aXR5QWdlbnQgU1NIX0FVVEhfU09DSyB1c2VzIHRoZSBkZWZhdWx0IGFnZW50IGVuZHBvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHtcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRpZGVudGl0eUFnZW50OiAnU1NIX0FVVEhfU09DSycsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywgYWdlbnQ6ICcvdG1wL3NzaC1hZ2VudC5zb2NrJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIElkZW50aXR5QWdlbnQgbm9uZSBkaXNhYmxlcyB0aGUgZGVmYXVsdCBTU0hfQVVUSF9TT0NLIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHtcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRpZGVudGl0eUFnZW50OiAnbm9uZScsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIGV4cGxpY2l0IHByaXZhdGVLZXlQYXRoICsgU1NIX0FVVEhfU09DSyArIGlkX3JzYSBcdTIxOTIgYWdlbnQgZmlyc3QsIHRoZW4gZXhwbGljaXQsIGlkX3JzYSwga2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5hZ2VudFNvY2sgPSAnL3RtcC9zc2gtYWdlbnQuc29jayc7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJy9zb21lL2V4cGxpY2l0L2tleScsIEVYUExJQ0lUKTtcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX3JzYScsIFJTQSk7XG5cblx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHNlcnZpY2UudGVzdEJ1aWxkQXV0aEF0dGVtcHRzKG1ha2VDb25maWcoe1xuXHRcdFx0YXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5BZ2VudCxcblx0XHRcdHByaXZhdGVLZXlQYXRoOiAnL3NvbWUvZXhwbGljaXQva2V5Jyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGVtcHRzLCBbXG5cdFx0XHR7IHR5cGU6ICdhZ2VudCcsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBhZ2VudDogJy90bXAvc3NoLWFnZW50LnNvY2snIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBFWFBMSUNJVCwga2V5UGF0aDogJy9zb21lL2V4cGxpY2l0L2tleScgfSxcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IFJTQSwga2V5UGF0aDogJ34vLnNzaC9pZF9yc2EnIH0sXG5cdFx0XHR7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiAndGVzdHVzZXInIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FnZW50ICsgZXhwbGljaXQgcHJpdmF0ZUtleVBhdGggdGhhdCBtYXRjaGVzIGEgZGVmYXVsdCBcdTIxOTIgZXhwbGljaXQgYWRkZWQgb25jZSwgdGhlbiBrZXlib2FyZC1pbnRlcmFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBXaGVuIHRoZSB1c2VyIHBpbnMgfi8uc3NoL2lkX3JzYSBleHBsaWNpdGx5LCB3ZSBzaG91bGRuJ3QgZW5kIHVwXG5cdFx0Ly8gd2l0aCB0aGUgc2FtZSBrZXkgdHdpY2UgaW4gdGhlIHF1ZXVlLlxuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gdW5kZWZpbmVkO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0cHJpdmF0ZUtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGVtcHRzLCBbXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywga2V5OiBSU0EsIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRcdFx0eyB0eXBlOiAna2V5Ym9hcmQtaW50ZXJhY3RpdmUnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudCArIGV4cGxpY2l0IHByaXZhdGVLZXlQYXRoIGFzIGFic29sdXRlIGRlZmF1bHQgcGF0aCBcdTIxOTIgYWdlbnQgZmlyc3QsIGtleSBhZGRlZCBvbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IGBzc2ggLUdgIGFsd2F5cyByZXR1cm5zIGFic29sdXRlIGlkZW50aXR5LWZpbGUgcGF0aHMsIHNvXG5cdFx0Ly8gL1VzZXJzLzxtZT4vLnNzaC9pZF9lZDI1NTE5IG11c3QgYmUgcmVjb2duaXplZCBhcyBhIGRlZmF1bHQgYW5kIG5vdFxuXHRcdC8vIHByb21vdGVkIHRvIGFuIGV4cGxpY2l0IChlbmNyeXB0ZWQpIGF0dGVtcHQgdGhhdCB3b3VsZCBmaXJlIGFcblx0XHQvLyBwYXNzcGhyYXNlIHByb21wdCBiZWZvcmUgdGhlIGFnZW50IGV2ZXIgZ2V0cyBhIGNoYW5jZS5cblx0XHRzZXJ2aWNlLmFnZW50U29jayA9ICcvdG1wL3NzaC1hZ2VudC5zb2NrJztcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnfi8uc3NoL2lkX2VkMjU1MTknLCBFRCk7XG5cdFx0Y29uc3QgYWJzb2x1dGVEZWZhdWx0ID0gYCR7b3MuaG9tZWRpcigpfS8uc3NoL2lkX2VkMjU1MTlgO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHtcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuQWdlbnQsXG5cdFx0XHRwcml2YXRlS2V5UGF0aDogYWJzb2x1dGVEZWZhdWx0LFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0ZW1wdHMsIFtcblx0XHRcdHsgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGFnZW50OiAnL3RtcC9zc2gtYWdlbnQuc29jaycgfSxcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndGVzdHVzZXInLCBrZXk6IEVELCBrZXlQYXRoOiAnfi8uc3NoL2lkX2VkMjU1MTknIH0sXG5cdFx0XHR7IHR5cGU6ICdrZXlib2FyZC1pbnRlcmFjdGl2ZScsIHVzZXJuYW1lOiAndGVzdHVzZXInIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0tleUZpbGUgKyBleHBsaWNpdCBwYXRoIFx1MjE5MiBwdWJsaWNrZXkgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmFnZW50U29jayA9ICcvdG1wL3NzaC1hZ2VudC5zb2NrJztcblx0XHRzZXJ2aWNlLmtleUZpbGVzLnNldCgnL3NvbWUvZXhwbGljaXQva2V5JywgRVhQTElDSVQpO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLktleUZpbGUsXG5cdFx0XHRwcml2YXRlS2V5UGF0aDogJy9zb21lL2V4cGxpY2l0L2tleScsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogRVhQTElDSVQsIGtleVBhdGg6ICcvc29tZS9leHBsaWNpdC9rZXknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0tleUZpbGUgKyBlbmNyeXB0ZWQgT3BlblNTSCBrZXkgbWFya3MgYXR0ZW1wdCBhcyBlbmNyeXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW5jcnlwdGVkS2V5ID0gb3BlblNTSFByaXZhdGVLZXlXaXRoQ2lwaGVyKCdhZXMyNTYtY3RyJyk7XG5cdFx0c2VydmljZS5rZXlGaWxlcy5zZXQoJy9zb21lL2VuY3J5cHRlZC9rZXknLCBlbmNyeXB0ZWRLZXkpO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHtcblx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuS2V5RmlsZSxcblx0XHRcdHByaXZhdGVLZXlQYXRoOiAnL3NvbWUvZW5jcnlwdGVkL2tleScsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd0ZXN0dXNlcicsIGtleTogZW5jcnlwdGVkS2V5LCBrZXlQYXRoOiAnL3NvbWUvZW5jcnlwdGVkL2tleScsIGVuY3J5cHRlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdLZXlGaWxlICsgbWlzc2luZyBwcml2YXRlS2V5UGF0aCB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLnRlc3RCdWlsZEF1dGhBdHRlbXB0cyhtYWtlQ29uZmlnKHsgYXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5LZXlGaWxlIH0pKSxcblx0XHRcdC9wcml2YXRlIGtleSBwYXRoL2ksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnS2V5RmlsZSArIHVucmVhZGFibGUga2V5IHRocm93cyB3aXRoIHRoZSBwYXRoIGluIHRoZSBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRcdGF1dGhNZXRob2Q6IFNTSEF1dGhNZXRob2QuS2V5RmlsZSxcblx0XHRcdFx0cHJpdmF0ZUtleVBhdGg6ICcvbWlzc2luZy9rZXknLFxuXHRcdFx0fSkpLFxuXHRcdFx0L1xcL21pc3NpbmdcXC9rZXkvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Bhc3N3b3JkIFx1MjE5MiBwYXNzd29yZCBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2UuYWdlbnRTb2NrID0gJy90bXAvc3NoLWFnZW50LnNvY2snO1xuXHRcdHNlcnZpY2Uua2V5RmlsZXMuc2V0KCd+Ly5zc2gvaWRfcnNhJywgUlNBKTtcblxuXHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgc2VydmljZS50ZXN0QnVpbGRBdXRoQXR0ZW1wdHMobWFrZUNvbmZpZyh7XG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLlBhc3N3b3JkLFxuXHRcdFx0cGFzc3dvcmQ6ICdwdycsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdHRlbXB0cywgW1xuXHRcdFx0eyB0eXBlOiAncGFzc3dvcmQnLCB1c2VybmFtZTogJ3Rlc3R1c2VyJywgcGFzc3dvcmQ6ICdwdycgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1NTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlIC0gbWFrZUF1dGhIYW5kbGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IEtFWSA9IEJ1ZmZlci5mcm9tKCdrJyk7XG5cdGNvbnN0IGF0dGVtcHRzOiBTU0hBdXRoQXR0ZW1wdFtdID0gW1xuXHRcdHsgdHlwZTogJ2FnZW50JywgdXNlcm5hbWU6ICd1JywgYWdlbnQ6ICcvc29jaycgfSxcblx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3UnLCBrZXk6IEtFWSwga2V5UGF0aDogJ34vLnNzaC9pZF9yc2EnIH0sXG5cdF07XG5cblx0dGVzdCgnd2Fsa3MgYXR0ZW1wdHMgaW4gb3JkZXIsIHRoZW4gc2lnbmFscyBleGhhdXN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBtYWtlQXV0aEhhbmRsZXIoYXR0ZW1wdHMsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBjYWxsczogQXJyYXk8b2JqZWN0IHwgZmFsc2U+ID0gW107XG5cdFx0aGFuZGxlcihudWxsLCBmYWxzZSwgbmV4dCA9PiBjYWxscy5wdXNoKG5leHQpKTtcblx0XHRoYW5kbGVyKFsncHVibGlja2V5J10sIGZhbHNlLCBuZXh0ID0+IGNhbGxzLnB1c2gobmV4dCkpO1xuXHRcdGhhbmRsZXIoWydwdWJsaWNrZXknXSwgZmFsc2UsIG5leHQgPT4gY2FsbHMucHVzaChuZXh0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXG5cdFx0XHR7IHR5cGU6ICdhZ2VudCcsIHVzZXJuYW1lOiAndScsIGFnZW50OiAnL3NvY2snIH0sXG5cdFx0XHR7IHR5cGU6ICdwdWJsaWNrZXknLCB1c2VybmFtZTogJ3UnLCBrZXk6IEtFWSB9LCAvLyBrZXlQYXRoIHN0cmlwcGVkXG5cdFx0XHRmYWxzZSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgYXR0ZW1wdHMgd2hvc2UgbWV0aG9kIHRoZSBzZXJ2ZXIgaGFzIHJlamVjdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBtYWtlQXV0aEhhbmRsZXIoYXR0ZW1wdHMsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBjYWxsczogQXJyYXk8b2JqZWN0IHwgZmFsc2U+ID0gW107XG5cdFx0Ly8gU2VydmVyIG9ubHkgYWxsb3dzIHBhc3N3b3JkIFx1MjAxNCBib3RoIGF0dGVtcHRzIHNob3VsZCBiZSBza2lwcGVkIGFuZFxuXHRcdC8vIHRoZSBoYW5kbGVyIHNob3VsZCBzaWduYWwgZXhoYXVzdGlvbiBpbW1lZGlhdGVseS5cblx0XHRoYW5kbGVyKFsncGFzc3dvcmQnXSwgZmFsc2UsIG5leHQgPT4gY2FsbHMucHVzaChuZXh0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgYXR0ZW1wdHMgYXJlIGtlcHQgd2hlbiBzZXJ2ZXIgYWxsb3dzIHB1YmxpY2tleScsICgpID0+IHtcblx0XHQvLyBgYWdlbnRgIGlzIGEgcHVibGlja2V5LWZsYXZvcmVkIG1ldGhvZDsgc2VydmVycyBhZHZlcnRpc2UgYHB1YmxpY2tleWAsXG5cdFx0Ly8gbm90IGBhZ2VudGAsIHNvIHRoZSBhZ2VudCBhdHRlbXB0IG11c3Qgbm90IGJlIGZpbHRlcmVkIG91dCBoZXJlLlxuXHRcdGNvbnN0IGhhbmRsZXIgPSBtYWtlQXV0aEhhbmRsZXIoXG5cdFx0XHRbeyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3UnLCBhZ2VudDogJy9zb2NrJyB9XSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCk7XG5cdFx0Y29uc3QgY2FsbHM6IEFycmF5PG9iamVjdCB8IGZhbHNlPiA9IFtdO1xuXHRcdGhhbmRsZXIoWydwdWJsaWNrZXknXSwgZmFsc2UsIG5leHQgPT4gY2FsbHMucHVzaChuZXh0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyB0eXBlOiAnYWdlbnQnLCB1c2VybmFtZTogJ3UnLCBhZ2VudDogJy9zb2NrJyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleWJvYXJkLWludGVyYWN0aXZlIHJvdXRlcyBwcm9tcHRzIHRvIHRoZSBrYmkgaGFuZGxlciBhbmQgaXMgc2tpcHBlZCB3aXRob3V0IG9uZScsICgpID0+IHtcblx0XHRjb25zdCBrYmlBdHRlbXB0czogU1NIQXV0aEF0dGVtcHRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ2tleWJvYXJkLWludGVyYWN0aXZlJywgdXNlcm5hbWU6ICd1JyB9LFxuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd1Jywga2V5OiBLRVksIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJyB9LFxuXHRcdF07XG5cblx0XHQvLyBXaXRob3V0IGEga2JpIGhhbmRsZXIgdGhlIGtiaSBhdHRlbXB0IGlzIHNraXBwZWQgZW50aXJlbHkuXG5cdFx0Y29uc3QgaGFuZGxlck5vS2JpID0gbWFrZUF1dGhIYW5kbGVyKGtiaUF0dGVtcHRzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY2FsbHNOb0tiaTogQXJyYXk8b2JqZWN0IHwgZmFsc2U+ID0gW107XG5cdFx0aGFuZGxlck5vS2JpKG51bGwsIGZhbHNlLCBuZXh0ID0+IGNhbGxzTm9LYmkucHVzaChuZXh0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsc05vS2JpLCBbeyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd1Jywga2V5OiBLRVkgfV0pO1xuXG5cdFx0Ly8gV2l0aCBhIGtiaSBoYW5kbGVyIHdlIGdldCBhbiBhdXRoIG1ldGhvZCB3aG9zZSBgcHJvbXB0YCBjYWxsYmFja1xuXHRcdC8vIGZvcndhcmRzIGludG8gdGhlIGhhbmRsZXIuXG5cdFx0bGV0IHByb21wdEFyZ3M6IHsgbmFtZTogc3RyaW5nOyBpbnN0cnVjdGlvbnM6IHN0cmluZzsgcHJvbXB0czogUmVhZG9ubHlBcnJheTx7IHByb21wdDogc3RyaW5nOyBlY2hvOiBib29sZWFuIH0+IH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFuZGxlcldpdGhLYmkgPSBtYWtlQXV0aEhhbmRsZXIoa2JpQXR0ZW1wdHMsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAobmFtZSwgaW5zdHJ1Y3Rpb25zLCBwcm9tcHRzLCBmaW5pc2gpID0+IHtcblx0XHRcdHByb21wdEFyZ3MgPSB7IG5hbWUsIGluc3RydWN0aW9ucywgcHJvbXB0cyB9O1xuXHRcdFx0ZmluaXNoKFsnc2VjcmV0J10pO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNhbGxzV2l0aEtiaTogQXJyYXk8eyB0eXBlOiBzdHJpbmc7IHVzZXJuYW1lOiBzdHJpbmc7IHByb21wdD86IEZ1bmN0aW9uIH0gfCBmYWxzZT4gPSBbXTtcblx0XHRoYW5kbGVyV2l0aEtiaShudWxsLCBmYWxzZSwgbmV4dCA9PiBjYWxsc1dpdGhLYmkucHVzaChuZXh0IGFzIHsgdHlwZTogc3RyaW5nOyB1c2VybmFtZTogc3RyaW5nOyBwcm9tcHQ/OiBGdW5jdGlvbiB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzV2l0aEtiaS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoY2FsbHNXaXRoS2JpWzBdIGFzIHsgdHlwZTogc3RyaW5nIH0pLnR5cGUsICdrZXlib2FyZC1pbnRlcmFjdGl2ZScpO1xuXHRcdGNvbnN0IGZpbmlzaENhbGxzOiBSZWFkb25seUFycmF5PHN0cmluZz5bXSA9IFtdO1xuXHRcdChjYWxsc1dpdGhLYmlbMF0gYXMgeyBwcm9tcHQ6IEZ1bmN0aW9uIH0pLnByb21wdCgnbicsICdpJywgJ2xhbmcnLCBbeyBwcm9tcHQ6ICdQYXNzd29yZDonLCBlY2hvOiBmYWxzZSB9XSwgKHJlc3BvbnNlczogUmVhZG9ubHlBcnJheTxzdHJpbmc+KSA9PiBmaW5pc2hDYWxscy5wdXNoKHJlc3BvbnNlcykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvbXB0QXJncywgeyBuYW1lOiAnbicsIGluc3RydWN0aW9uczogJ2knLCBwcm9tcHRzOiBbeyBwcm9tcHQ6ICdQYXNzd29yZDonLCBlY2hvOiBmYWxzZSB9XSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmlzaENhbGxzLCBbWydzZWNyZXQnXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNyeXB0ZWQgcHVibGlja2V5IHJlcXVlc3RzIHBhc3NwaHJhc2UgYW5kIHBhc3NlcyBpdCB0byBzc2gyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVuY3J5cHRlZEF0dGVtcHRzOiBTU0hBdXRoQXR0ZW1wdFtdID0gW1xuXHRcdFx0eyB0eXBlOiAncHVibGlja2V5JywgdXNlcm5hbWU6ICd1Jywga2V5OiBLRVksIGtleVBhdGg6ICd+Ly5zc2gvaWRfcnNhJywgZW5jcnlwdGVkOiB0cnVlIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGNhbGxzOiBBcnJheTxvYmplY3QgfCBmYWxzZT4gPSBbXTtcblx0XHRjb25zdCBoYW5kbGVyID0gbWFrZUF1dGhIYW5kbGVyKGVuY3J5cHRlZEF0dGVtcHRzLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdW5kZWZpbmVkLCAoa2V5UGF0aCwgZmluaXNoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2V5UGF0aCwgJ34vLnNzaC9pZF9yc2EnKTtcblx0XHRcdGZpbmlzaCgncGFzc3BocmFzZScpO1xuXHRcdH0pO1xuXG5cdFx0aGFuZGxlcihudWxsLCBmYWxzZSwgbmV4dCA9PiBjYWxscy5wdXNoKG5leHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtcblx0XHRcdHsgdHlwZTogJ3B1YmxpY2tleScsIHVzZXJuYW1lOiAndScsIGtleTogS0VZLCBwYXNzcGhyYXNlOiAncGFzc3BocmFzZScgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxxQkFBa0o7QUFDM0osU0FBUywrQkFBK0IsdUJBQTRDO0FBR3BGLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sVUFBVTtBQUVoQixTQUFTLFVBQVUsS0FBYSxNQUFjLGlCQUFvRDtBQUNqRyxTQUFPLEtBQUssVUFBVSwyQkFBMkI7QUFBQSxJQUNoRDtBQUFBLElBQ0E7QUFBQSxJQUNBLGlCQUFpQixtQkFBbUI7QUFBQSxJQUNwQztBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBQ0g7QUFHQSxNQUFNLGVBQWU7QUFBQSxFQUFyQjtBQUNDLFNBQVMsU0FBUyxFQUFFLElBQUksTUFBTTtBQUFBLElBQUUsRUFBRTtBQUFBO0FBQUEsRUFDbEMsR0FBRyxRQUFnQixXQUE4QztBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDaEYsUUFBYztBQUFBLEVBQUU7QUFDakI7QUFNQSxNQUFNLGNBQWM7QUFBQSxFQVFuQixZQUFZLGdCQUF5RCxDQUFDLEdBQUc7QUFQekUsU0FBUyxZQUFzQixDQUFDO0FBQ2hDLGlCQUFRO0FBR1IsU0FBaUIsa0JBQXFDLENBQUM7QUFDdkQsU0FBaUIsa0JBQXFDLENBQUM7QUFHdEQsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBRUEsR0FBRyxPQUFlLFVBQTRDO0FBQzdELFFBQUksVUFBVSxTQUFTO0FBQ3RCLFdB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
