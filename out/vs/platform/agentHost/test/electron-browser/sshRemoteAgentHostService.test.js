import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { ISharedProcessService } from "../../../ipc/electron-browser/services.js";
import { IQuickInputService } from "../../../quickinput/common/quickInput.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../common/remoteAgentHostService.js";
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from "../../common/state/sessionProtocol.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import { ISSHRelayClientFactory, SSHRemoteAgentHostService } from "../../electron-browser/sshRemoteAgentHostServiceImpl.js";
class MockSSHMainService {
  constructor() {
    this._onDidChangeConnections = new Emitter();
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._onDidCloseConnection = new Emitter();
    this.onDidCloseConnection = this._onDidCloseConnection.event;
    this._onDidReportConnectProgress = new Emitter();
    this.onDidReportConnectProgress = this._onDidReportConnectProgress.event;
    this._onDidRelayMessage = new Emitter();
    this.onDidRelayMessage = this._onDidRelayMessage.event;
    this._onDidRelayClose = new Emitter();
    this.onDidRelayClose = this._onDidRelayClose.event;
    this._onDidRequestKeyboardInteractive = new Emitter();
    this.onDidRequestKeyboardInteractive = this._onDidRequestKeyboardInteractive.event;
    this._onDidCancelKeyboardInteractive = new Emitter();
    this.onDidCancelKeyboardInteractive = this._onDidCancelKeyboardInteractive.event;
    this.kbiResponses = [];
    this.disconnectCalls = [];
    this.connectCalls = [];
    this.reconnectCalls = [];
    this._nextConnectionId = 1;
  }
  async respondKeyboardInteractive(requestId, responses) {
    this.kbiResponses.push({ requestId, responses });
  }
  async connect(config) {
    this.connectCalls.push(config);
    const connectionId = this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`;
    return {
      connectionId,
      address: this.connectResult?.address ?? `ssh:${config.host}`,
      name: config.name,
      connectionToken: "test-token",
      config: { host: config.host, username: config.username, authMethod: config.authMethod, name: config.name, sshConfigHost: config.sshConfigHost },
      sshConfigHost: config.sshConfigHost
    };
  }
  async reconnect(sshConfigHost, name) {
    this.reconnectCalls.push({ sshConfigHost, name });
    return {
      connectionId: this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`,
      address: this.connectResult?.address ?? `ssh:${sshConfigHost}`,
      name,
      connectionToken: "test-token",
      config: { host: sshConfigHost, username: "u", authMethod: 0, name, sshConfigHost },
      sshConfigHost
    };
  }
  async relaySend(_connectionId, _message) {
  }
  async disconnect(connectionId) {
    this.disconnectCalls.push(connectionId);
  }
  async listSSHConfigHosts() {
    return [];
  }
  async ensureUserSSHConfig() {
    return URI.file("/tmp/ssh-config");
  }
  async listSSHConfigFiles() {
    return [URI.file("/tmp/ssh-config")];
  }
  async resolveSSHConfig(_host) {
    return { hostname: "", user: void 0, port: 22, identityFile: [], identityAgent: void 0, forwardAgent: false };
  }
  dispose() {
    this._onDidChangeConnections.dispose();
    this._onDidCloseConnection.dispose();
    this._onDidReportConnectProgress.dispose();
    this._onDidRelayMessage.dispose();
    this._onDidRelayClose.dispose();
    this._onDidRequestKeyboardInteractive.dispose();
    this._onDidCancelKeyboardInteractive.dispose();
  }
}
function asChannel(target) {
  return {
    call: async (method, args) => {
      const fn = target[method];
      if (typeof fn !== "function") {
        throw new Error(`MockChannel: no method ${method}`);
      }
      return fn.apply(target, args ?? []);
    },
    listen: (event) => {
      const ev = target[event];
      if (typeof ev !== "function") {
        throw new Error(`MockChannel: no event ${event}`);
      }
      return ev;
    }
  };
}
class MockRemoteAgentHostService extends Disposable {
  constructor() {
    super(...arguments);
    this.added = [];
    this._entries = /* @__PURE__ */ new Map();
    // Holds transport disposables from prior registrations that were
    // replaced by a later `addManagedConnection` for the same address.
    // Production deliberately does NOT run them at replacement time (doing
    // so would call _mainService.disconnect on the brand-new tunnel and
    // kill it). They are released when the service itself is disposed.
    this._abandonedTransports = [];
  }
  async addManagedConnection(entry, client, transportDisposable, status = RemoteAgentHostConnectionStatus.connected) {
    const address = entry.connection.address ?? `ssh:${entry.connection.sshConfigHost}`;
    const previous = this._entries.get(address);
    if (previous) {
      previous.client.dispose?.();
      if (previous.transport) {
        this._abandonedTransports.push(previous.transport);
      }
    }
    this.added.push({ address, status, transport: transportDisposable });
    this._entries.set(address, { client, transport: transportDisposable, status });
    return { address, name: entry.name, clientId: "mock", defaultDirectory: void 0, status };
  }
  /** Mirrors IRemoteAgentHostService.getConnection: returns the client only when the entry is connected. */
  getConnection(address) {
    const entry = this._entries.get(address);
    return entry && RemoteAgentHostConnectionStatus.isConnected(entry.status) ? entry.client : void 0;
  }
  notifyConnectionClosed(_address) {
  }
  /** Simulate user clicking "Remove Remote": disposes the per-entry store, which runs the transport disposable. */
  removeEntry(address) {
    const e = this._entries.get(address);
    if (!e) {
      return;
    }
    this._entries.delete(address);
    e.client.dispose?.();
    e.transport?.dispose();
  }
  dispose() {
    for (const [, e] of this._entries) {
      e.client.dispose?.();
      e.transport?.dispose();
    }
    this._entries.clear();
    for (const t of this._abandonedTransports) {
      t.dispose();
    }
    this._abandonedTransports.length = 0;
    super.dispose();
  }
}
class MockProtocolClient extends Disposable {
  constructor() {
    super(...arguments);
    this.clientId = "mock-protocol-client";
    this.onDidClose = Event.None;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.connectDeferred = new DeferredPromise();
  }
  async connect() {
    return this.connectDeferred.p;
  }
  registerOwned(d) {
    return this._register(d);
  }
}
class TestConfigurationService {
  constructor(_remoteAgentHostsEnabled = true) {
    this._remoteAgentHostsEnabled = _remoteAgentHostsEnabled;
    this.onDidChangeConfiguration = Event.None;
  }
  getValue(key) {
    return key === RemoteAgentHostsEnabledSettingId ? this._remoteAgentHostsEnabled : void 0;
  }
  setRemoteAgentHostsEnabled(enabled) {
    this._remoteAgentHostsEnabled = enabled;
  }
}
suite("SSHRemoteAgentHostService (renderer)", () => {
  const disposables = new DisposableStore();
  let mainService;
  let remoteAgentHostService;
  let configurationService;
  let createdClients;
  let waitForClient;
  let service;
  setup(() => {
    mainService = new MockSSHMainService();
    disposables.add({ dispose: () => mainService.dispose() });
    remoteAgentHostService = disposables.add(new MockRemoteAgentHostService());
    createdClients = [];
    const sharedProcessService = {
      getChannel: () => asChannel(mainService)
    };
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    configurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IQuickInputService, {});
    instantiationService.stub(ISharedProcessService, sharedProcessService);
    instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService);
    const clientWaiters = [];
    waitForClient = (index) => {
      if (createdClients[index]) {
        return Promise.resolve(createdClients[index]);
      }
      return (clientWaiters[index] ??= new DeferredPromise()).p;
    };
    instantiationService.stub(ISSHRelayClientFactory, {
      createClient: (_mainService, _connectionId, _address) => {
        const c = new MockProtocolClient();
        disposables.add(c);
        const index = createdClients.length;
        createdClients.push(c);
        clientWaiters[index]?.complete(c);
        return c;
      }
    });
    service = disposables.add(instantiationService.createInstance(SSHRemoteAgentHostService));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const sampleConfig = {
    host: "remote.example",
    username: "user",
    authMethod: 0,
    name: "My Remote",
    sshConfigHost: "remote.example"
  };
  async function awaitClientThenResolve(index) {
    const client = await waitForClient(index);
    client.connectDeferred.complete();
  }
  test("connect registers a managed connection with a transport disposable", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    const handle = await connectPromise;
    assert.strictEqual(remoteAgentHostService.added.length, 1);
    assert.strictEqual(remoteAgentHostService.added[0].address, "ssh:remote.example");
    assert.strictEqual(remoteAgentHostService.added[0].status?.kind, "connected");
    assert.ok(remoteAgentHostService.added[0].transport, "a transport disposable is passed so removal can tear down the SSH tunnel");
    assert.strictEqual(service.connections.length, 1);
    assert.strictEqual(handle.localAddress, "ssh:remote.example");
  });
  test("incompatible handshake keeps SSH tunnel registered for server upgrade", async () => {
    const connectPromise = service.connect(sampleConfig);
    const client = await waitForClient(0);
    await client.connectDeferred.error(new ProtocolError(
      AHP_UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supportedVersions: ["^0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    ));
    await assert.rejects(connectPromise, /Unsupported protocol version/);
    assert.deepStrictEqual({
      added: remoteAgentHostService.added.map(({ address, status }) => ({ address, status })),
      connections: service.connections.map((connection) => connection.localAddress),
      disconnectCalls: mainService.disconnectCalls
    }, {
      added: [{
        address: "ssh:remote.example",
        status: RemoteAgentHostConnectionStatus.incompatible("Unsupported protocol version", [PROTOCOL_VERSION], ["^0.2.0"], "_vscodeUpgrade")
      }],
      connections: ["ssh:remote.example"],
      disconnectCalls: []
    });
  });
  test("reconnect after incompatible handshake replaces the stale handle and re-handshakes", async () => {
    mainService.connectResult = { connectionId: "conn-stable", address: "ssh:remote.example" };
    const firstConnect = service.connect(sampleConfig);
    const firstClient = await waitForClient(0);
    await firstClient.connectDeferred.error(new ProtocolError(
      AHP_UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supportedVersions: ["^0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    ));
    await assert.rejects(firstConnect, /Unsupported protocol version/);
    const reconnectPromise = service.reconnect("remote.example", "My Remote");
    const secondClient = await waitForClient(1);
    await secondClient.connectDeferred.complete();
    await reconnectPromise;
    assert.deepStrictEqual({
      clientCount: createdClients.length,
      added: remoteAgentHostService.added.map(({ address, status }) => ({ address, statusKind: status?.kind })),
      // The replaceRelay path keeps the SSH tunnel alive — we must not
      // have asked the main service to disconnect it.
      disconnectCalls: mainService.disconnectCalls,
      // Exactly one renderer-side handle for the address.
      connections: service.connections.map((connection) => connection.localAddress)
    }, {
      clientCount: 2,
      added: [
        { address: "ssh:remote.example", statusKind: "incompatible" },
        { address: "ssh:remote.example", statusKind: "connected" }
      ],
      disconnectCalls: [],
      connections: ["ssh:remote.example"]
    });
  });
  test("disabled setting prevents SSH tunnel connects and reconnects", async () => {
    configurationService.setRemoteAgentHostsEnabled(false);
    await assert.rejects(() => service.connect(sampleConfig), /not enabled/);
    await assert.rejects(() => service.reconnect("remote.example", "My Remote"), /not enabled/);
    assert.deepStrictEqual({ connectCalls: mainService.connectCalls, reconnectCalls: mainService.reconnectCalls, added: remoteAgentHostService.added }, {
      connectCalls: [],
      reconnectCalls: [],
      added: []
    });
  });
  test("removing the entry tears down the SSH tunnel and the renderer-side handle", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(mainService.disconnectCalls.length, 0);
    assert.strictEqual(service.connections.length, 1);
    remoteAgentHostService.removeEntry("ssh:remote.example");
    assert.deepStrictEqual(mainService.disconnectCalls, ["conn-1"], "main-process tunnel is told to disconnect");
    assert.strictEqual(service.connections.length, 0, "renderer-side handle is dropped");
  });
  test("connect after removal does not reuse the previous handle", async () => {
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    remoteAgentHostService.removeEntry("ssh:remote.example");
    assert.strictEqual(service.connections.length, 0);
    mainService.connectResult = { connectionId: "conn-2", address: "ssh:remote.example" };
    const c2 = service.connect(sampleConfig);
    await awaitClientThenResolve(1);
    await c2;
    assert.strictEqual(service.connections.length, 1);
    assert.strictEqual(remoteAgentHostService.added.length, 2, "each connect produces a fresh managed-connection registration");
  });
  test("main-process onDidCloseConnection cleans up renderer handle without double-disconnecting", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(service.connections.length, 1);
    mainService._onDidCloseConnection.fire("conn-1");
    assert.strictEqual(service.connections.length, 0, "handle dropped on main close");
    remoteAgentHostService.removeEntry("ssh:remote.example");
    assert.ok(mainService.disconnectCalls.length <= 1, "no duplicate disconnect against a stale connectionId");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvc3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG5pbXBvcnQgeyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04sIFByb3RvY29sRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB0eXBlIHtcblx0SVNTSEFnZW50SG9zdENvbmZpZyxcblx0SVNTSENvbm5lY3RSZXN1bHQsXG5cdElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdCxcblx0SVNTSFJlc29sdmVkQ29uZmlnLFxuXHRJU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UsXG59IGZyb20gJy4uLy4uL2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmVsYXlNZXNzYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlbGF5VHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU1NIUmVsYXlDbGllbnRGYWN0b3J5LCBTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tYnJvd3Nlci9zc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuXG4vKipcbiAqIEluLXJlbmRlcmVyIG1vY2sgb2YgdGhlIHNoYXJlZC1wcm9jZXNzIFNTSCBzZXJ2aWNlLiBFeHBvc2VzIHRoZSBzYW1lXG4gKiBzdXJmYWNlIHRoYXQgdGhlIHJlbmRlcmVyIGFjY2Vzc2VzIHRocm91Z2ggUHJveHlDaGFubmVsLCBwbHVzIGEgc21hbGxcbiAqIHRlc3QgQVBJIHRvIGRyaXZlIGNsb3NlIGV2ZW50cyBhbmQgaW5zcGVjdCBjYWxscy5cbiAqL1xuY2xhc3MgTW9ja1NTSE1haW5TZXJ2aWNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9ucyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2VDb25uZWN0aW9uID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlQ29ubmVjdGlvbiA9IHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzID0gbmV3IEVtaXR0ZXI8eyBjb25uZWN0aW9uS2V5OiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9PigpO1xuXHRyZWFkb25seSBvbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcyA9IHRoaXMuX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVsYXlNZXNzYWdlID0gbmV3IEVtaXR0ZXI8SVJlbGF5TWVzc2FnZT4oKTtcblx0cmVhZG9ubHkgb25EaWRSZWxheU1lc3NhZ2UgPSB0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbGF5Q2xvc2UgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVsYXlDbG9zZSA9IHRoaXMuX29uRGlkUmVsYXlDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RLZXlib2FyZEludGVyYWN0aXZlID0gbmV3IEVtaXR0ZXI8SVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0PigpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RLZXlib2FyZEludGVyYWN0aXZlID0gdGhpcy5fb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENhbmNlbEtleWJvYXJkSW50ZXJhY3RpdmUgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZSA9IHRoaXMuX29uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZS5ldmVudDtcblxuXHRyZWFkb25seSBrYmlSZXNwb25zZXM6IEFycmF5PHsgcmVxdWVzdElkOiBzdHJpbmc7IHJlc3BvbnNlczogUmVhZG9ubHlBcnJheTxzdHJpbmc+IHwgdW5kZWZpbmVkIH0+ID0gW107XG5cblx0YXN5bmMgcmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdElkOiBzdHJpbmcsIHJlc3BvbnNlcz86IFJlYWRvbmx5QXJyYXk8c3RyaW5nPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMua2JpUmVzcG9uc2VzLnB1c2goeyByZXF1ZXN0SWQsIHJlc3BvbnNlcyB9KTtcblx0fVxuXG5cdHJlYWRvbmx5IGRpc2Nvbm5lY3RDYWxsczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgY29ubmVjdENhbGxzOiBJU1NIQWdlbnRIb3N0Q29uZmlnW10gPSBbXTtcblx0cmVhZG9ubHkgcmVjb25uZWN0Q2FsbHM6IEFycmF5PHsgc3NoQ29uZmlnSG9zdDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfT4gPSBbXTtcblx0cHJpdmF0ZSBfbmV4dENvbm5lY3Rpb25JZCA9IDE7XG5cblx0Y29ubmVjdFJlc3VsdDogUGFydGlhbDxJU1NIQ29ubmVjdFJlc3VsdD4gfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgY29ubmVjdChjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBQcm9taXNlPElTU0hDb25uZWN0UmVzdWx0PiB7XG5cdFx0dGhpcy5jb25uZWN0Q2FsbHMucHVzaChjb25maWcpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25JZCA9IHRoaXMuY29ubmVjdFJlc3VsdD8uY29ubmVjdGlvbklkID8/IGBjb25uLSR7dGhpcy5fbmV4dENvbm5lY3Rpb25JZCsrfWA7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbm5lY3Rpb25JZCxcblx0XHRcdGFkZHJlc3M6IHRoaXMuY29ubmVjdFJlc3VsdD8uYWRkcmVzcyA/PyBgc3NoOiR7Y29uZmlnLmhvc3R9YCxcblx0XHRcdG5hbWU6IGNvbmZpZy5uYW1lLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiAndGVzdC10b2tlbicsXG5cdFx0XHRjb25maWc6IHsgaG9zdDogY29uZmlnLmhvc3QsIHVzZXJuYW1lOiBjb25maWcudXNlcm5hbWUsIGF1dGhNZXRob2Q6IGNvbmZpZy5hdXRoTWV0aG9kLCBuYW1lOiBjb25maWcubmFtZSwgc3NoQ29uZmlnSG9zdDogY29uZmlnLnNzaENvbmZpZ0hvc3QgfSxcblx0XHRcdHNzaENvbmZpZ0hvc3Q6IGNvbmZpZy5zc2hDb25maWdIb3N0LFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPElTU0hDb25uZWN0UmVzdWx0PiB7XG5cdFx0dGhpcy5yZWNvbm5lY3RDYWxscy5wdXNoKHsgc3NoQ29uZmlnSG9zdCwgbmFtZSB9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29ubmVjdGlvbklkOiB0aGlzLmNvbm5lY3RSZXN1bHQ/LmNvbm5lY3Rpb25JZCA/PyBgY29ubi0ke3RoaXMuX25leHRDb25uZWN0aW9uSWQrK31gLFxuXHRcdFx0YWRkcmVzczogdGhpcy5jb25uZWN0UmVzdWx0Py5hZGRyZXNzID8/IGBzc2g6JHtzc2hDb25maWdIb3N0fWAsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiAndGVzdC10b2tlbicsXG5cdFx0XHRjb25maWc6IHsgaG9zdDogc3NoQ29uZmlnSG9zdCwgdXNlcm5hbWU6ICd1JywgYXV0aE1ldGhvZDogMCBhcyBuZXZlciwgbmFtZSwgc3NoQ29uZmlnSG9zdCB9LFxuXHRcdFx0c3NoQ29uZmlnSG9zdCxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVsYXlTZW5kKF9jb25uZWN0aW9uSWQ6IHN0cmluZywgX21lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyAvKiBuby1vcCAqLyB9XG5cblx0YXN5bmMgZGlzY29ubmVjdChjb25uZWN0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzY29ubmVjdENhbGxzLnB1c2goY29ubmVjdGlvbklkKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RTU0hDb25maWdIb3N0cygpOiBQcm9taXNlPHN0cmluZ1tdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBlbnN1cmVVc2VyU1NIQ29uZmlnKCk6IFByb21pc2U8VVJJPiB7IHJldHVybiBVUkkuZmlsZSgnL3RtcC9zc2gtY29uZmlnJyk7IH1cblx0YXN5bmMgbGlzdFNTSENvbmZpZ0ZpbGVzKCk6IFByb21pc2U8VVJJW10+IHsgcmV0dXJuIFtVUkkuZmlsZSgnL3RtcC9zc2gtY29uZmlnJyldOyB9XG5cdGFzeW5jIHJlc29sdmVTU0hDb25maWcoX2hvc3Q6IHN0cmluZyk6IFByb21pc2U8SVNTSFJlc29sdmVkQ29uZmlnPiB7XG5cdFx0cmV0dXJuIHsgaG9zdG5hbWU6ICcnLCB1c2VyOiB1bmRlZmluZWQsIHBvcnQ6IDIyLCBpZGVudGl0eUZpbGU6IFtdLCBpZGVudGl0eUFnZW50OiB1bmRlZmluZWQsIGZvcndhcmRBZ2VudDogZmFsc2UgfTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDbG9zZUNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlbGF5TWVzc2FnZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZWxheUNsb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RLZXlib2FyZEludGVyYWN0aXZlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENhbmNlbEtleWJvYXJkSW50ZXJhY3RpdmUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKiBBZGFwdCBhIG1vY2sgc2VydmljZSBvYmplY3QgdG8gdGhlIElDaGFubmVsIHN1cmZhY2UgUHJveHlDaGFubmVsIGV4cGVjdHMuICovXG5mdW5jdGlvbiBhc0NoYW5uZWwodGFyZ2V0OiBvYmplY3QpOiBJQ2hhbm5lbCB7XG5cdHJldHVybiB7XG5cdFx0Y2FsbDogYXN5bmMgPFQ+KG1ldGhvZDogc3RyaW5nLCBhcmdzPzogdW5rbm93bik6IFByb21pc2U8VD4gPT4ge1xuXHRcdFx0Y29uc3QgZm4gPSAodGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVttZXRob2RdO1xuXHRcdFx0aWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1vY2tDaGFubmVsOiBubyBtZXRob2QgJHttZXRob2R9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGZuIGFzICguLi5hOiB1bmtub3duW10pID0+IFByb21pc2U8VD4pLmFwcGx5KHRhcmdldCwgKGFyZ3MgYXMgdW5rbm93bltdKSA/PyBbXSk7XG5cdFx0fSxcblx0XHRsaXN0ZW46IDxUPihldmVudDogc3RyaW5nKTogRXZlbnQ8VD4gPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSAodGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtldmVudF07XG5cdFx0XHRpZiAodHlwZW9mIGV2ICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTW9ja0NoYW5uZWw6IG5vIGV2ZW50ICR7ZXZlbnR9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXYgYXMgRXZlbnQ8VD47XG5cdFx0fSxcblx0fTtcbn1cblxuLyoqIENhcHR1cmVzIGFkZE1hbmFnZWRDb25uZWN0aW9uIGNhbGxzIHNvIHRlc3RzIGNhbiBpbnNwZWN0IHRyYW5zcG9ydERpc3Bvc2FibGUuICovXG5jbGFzcyBNb2NrUmVtb3RlQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBhZGRlZDogQXJyYXk8eyBhZGRyZXNzOiBzdHJpbmc7IHN0YXR1cz86IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM7IHRyYW5zcG9ydD86IElEaXNwb3NhYmxlIH0+ID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyB0cmFuc3BvcnQ/OiBJRGlzcG9zYWJsZTsgY2xpZW50OiB7IGRpc3Bvc2U/OiAoKSA9PiB2b2lkIH07IHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyB9PigpO1xuXHQvLyBIb2xkcyB0cmFuc3BvcnQgZGlzcG9zYWJsZXMgZnJvbSBwcmlvciByZWdpc3RyYXRpb25zIHRoYXQgd2VyZVxuXHQvLyByZXBsYWNlZCBieSBhIGxhdGVyIGBhZGRNYW5hZ2VkQ29ubmVjdGlvbmAgZm9yIHRoZSBzYW1lIGFkZHJlc3MuXG5cdC8vIFByb2R1Y3Rpb24gZGVsaWJlcmF0ZWx5IGRvZXMgTk9UIHJ1biB0aGVtIGF0IHJlcGxhY2VtZW50IHRpbWUgKGRvaW5nXG5cdC8vIHNvIHdvdWxkIGNhbGwgX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3Qgb24gdGhlIGJyYW5kLW5ldyB0dW5uZWwgYW5kXG5cdC8vIGtpbGwgaXQpLiBUaGV5IGFyZSByZWxlYXNlZCB3aGVuIHRoZSBzZXJ2aWNlIGl0c2VsZiBpcyBkaXNwb3NlZC5cblx0cHJpdmF0ZSByZWFkb25seSBfYWJhbmRvbmVkVHJhbnNwb3J0czogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGFzeW5jIGFkZE1hbmFnZWRDb25uZWN0aW9uKGVudHJ5OiB7IG5hbWU6IHN0cmluZzsgY29ubmVjdGlvbjogeyBhZGRyZXNzPzogc3RyaW5nOyBzc2hDb25maWdIb3N0Pzogc3RyaW5nIH0gfSwgY2xpZW50OiBJQWdlbnRDb25uZWN0aW9uLCB0cmFuc3BvcnREaXNwb3NhYmxlPzogSURpc3Bvc2FibGUsIHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGVudHJ5LmNvbm5lY3Rpb24uYWRkcmVzcyA/PyBgc3NoOiR7ZW50cnkuY29ubmVjdGlvbi5zc2hDb25maWdIb3N0fWA7XG5cdFx0Ly8gTWlycm9yIFJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IHJlLXJlZ2lzdGVyaW5nIGFuIGFkZHJlc3MgcmVwbGFjZXNcblx0XHQvLyB0aGUgcHJldmlvdXMgZW50cnkgYW5kIGRpc3Bvc2VzIGl0cyBwcm90b2NvbCBjbGllbnQgKGJ1dCBOT1QgaXRzXG5cdFx0Ly8gdHJhbnNwb3J0IGRpc3Bvc2FibGUgXHUyMDE0IHRoZSBuZXcgZW50cnkgb3ducyB0aGUgdW5kZXJseWluZyB0dW5uZWwpLlxuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRwcmV2aW91cy5jbGllbnQuZGlzcG9zZT8uKCk7XG5cdFx0XHRpZiAocHJldmlvdXMudHJhbnNwb3J0KSB7XG5cdFx0XHRcdHRoaXMuX2FiYW5kb25lZFRyYW5zcG9ydHMucHVzaChwcmV2aW91cy50cmFuc3BvcnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmFkZGVkLnB1c2goeyBhZGRyZXNzLCBzdGF0dXMsIHRyYW5zcG9ydDogdHJhbnNwb3J0RGlzcG9zYWJsZSB9KTtcblx0XHR0aGlzLl9lbnRyaWVzLnNldChhZGRyZXNzLCB7IGNsaWVudDogY2xpZW50IGFzIHsgZGlzcG9zZT86ICgpID0+IHZvaWQgfSwgdHJhbnNwb3J0OiB0cmFuc3BvcnREaXNwb3NhYmxlLCBzdGF0dXMgfSk7XG5cdFx0cmV0dXJuIHsgYWRkcmVzcywgbmFtZTogZW50cnkubmFtZSwgY2xpZW50SWQ6ICdtb2NrJywgZGVmYXVsdERpcmVjdG9yeTogdW5kZWZpbmVkLCBzdGF0dXMgfTtcblx0fVxuXG5cdC8qKiBNaXJyb3JzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb246IHJldHVybnMgdGhlIGNsaWVudCBvbmx5IHdoZW4gdGhlIGVudHJ5IGlzIGNvbm5lY3RlZC4gKi9cblx0Z2V0Q29ubmVjdGlvbihhZGRyZXNzOiBzdHJpbmcpOiBJQWdlbnRDb25uZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdHJldHVybiBlbnRyeSAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGVudHJ5LnN0YXR1cykgPyBlbnRyeS5jbGllbnQgYXMgdW5rbm93biBhcyBJQWdlbnRDb25uZWN0aW9uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0bm90aWZ5Q29ubmVjdGlvbkNsb3NlZChfYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3AgaW4gdGVzdHMgXHUyMDE0IHRoZSBkZWZlbnNlLWluLWRlcHRoIG5vdGlmaWNhdGlvbiBpcyBleGVyY2lzZWQgc2VwYXJhdGVseVxuXHR9XG5cblx0LyoqIFNpbXVsYXRlIHVzZXIgY2xpY2tpbmcgXCJSZW1vdmUgUmVtb3RlXCI6IGRpc3Bvc2VzIHRoZSBwZXItZW50cnkgc3RvcmUsIHdoaWNoIHJ1bnMgdGhlIHRyYW5zcG9ydCBkaXNwb3NhYmxlLiAqL1xuXHRyZW1vdmVFbnRyeShhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBlID0gdGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKCFlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdGUuY2xpZW50LmRpc3Bvc2U/LigpO1xuXHRcdGUudHJhbnNwb3J0Py5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIERpc3Bvc2UgYW55IHN0aWxsLXJlZ2lzdGVyZWQgZW50cmllcyAobWlycm9ycyB0aGUgcGVyLWVudHJ5IHN0b3JlIGNsZWFudXBcblx0XHQvLyBkb25lIGJ5IHRoZSByZWFsIFJlbW90ZUFnZW50SG9zdFNlcnZpY2Ugd2hlbiBpdCBpdHNlbGYgaXMgZGlzcG9zZWQpLlxuXHRcdGZvciAoY29uc3QgWywgZV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0ZS5jbGllbnQuZGlzcG9zZT8uKCk7XG5cdFx0XHRlLnRyYW5zcG9ydD8uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9lbnRyaWVzLmNsZWFyKCk7XG5cdFx0Ly8gUmVsZWFzZSBhYmFuZG9uZWQgdHJhbnNwb3J0cyBmcm9tIHByaW9yIHJlZ2lzdHJhdGlvbnMgYXMgd2VsbC5cblx0XHRmb3IgKGNvbnN0IHQgb2YgdGhpcy5fYWJhbmRvbmVkVHJhbnNwb3J0cykge1xuXHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FiYW5kb25lZFRyYW5zcG9ydHMubGVuZ3RoID0gMDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja1Byb3RvY29sQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGNsaWVudElkID0gJ21vY2stcHJvdG9jb2wtY2xpZW50Jztcblx0cmVhZG9ubHkgb25EaWRDbG9zZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWROb3RpZmljYXRpb24gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBjb25uZWN0RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLmNvbm5lY3REZWZlcnJlZC5wOyB9XG5cdHJlZ2lzdGVyT3duZWQ8VCBleHRlbmRzIElEaXNwb3NhYmxlPihkOiBUKTogVCB7IHJldHVybiB0aGlzLl9yZWdpc3RlcihkKTsgfVxufVxuXG5jbGFzcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBFdmVudC5Ob25lO1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9yZW1vdGVBZ2VudEhvc3RzRW5hYmxlZCA9IHRydWUpIHsgfVxuXHRnZXRWYWx1ZShrZXk/OiBzdHJpbmcpOiB1bmtub3duIHsgcmV0dXJuIGtleSA9PT0gUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgPyB0aGlzLl9yZW1vdGVBZ2VudEhvc3RzRW5hYmxlZCA6IHVuZGVmaW5lZDsgfVxuXHRzZXRSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7IHRoaXMuX3JlbW90ZUFnZW50SG9zdHNFbmFibGVkID0gZW5hYmxlZDsgfVxufVxuXG5zdWl0ZSgnU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSAocmVuZGVyZXIpJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbWFpblNlcnZpY2U6IE1vY2tTU0hNYWluU2VydmljZTtcblx0bGV0IHJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IE1vY2tSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGNyZWF0ZWRDbGllbnRzOiBNb2NrUHJvdG9jb2xDbGllbnRbXTtcblx0bGV0IHdhaXRGb3JDbGllbnQ6IChpbmRleDogbnVtYmVyKSA9PiBQcm9taXNlPE1vY2tQcm90b2NvbENsaWVudD47XG5cdGxldCBzZXJ2aWNlOiBTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtYWluU2VydmljZSA9IG5ldyBNb2NrU1NITWFpblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBtYWluU2VydmljZS5kaXNwb3NlKCkgfSk7XG5cdFx0cmVtb3RlQWdlbnRIb3N0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1JlbW90ZUFnZW50SG9zdFNlcnZpY2UoKSk7XG5cdFx0Y3JlYXRlZENsaWVudHMgPSBbXTtcblxuXHRcdGNvbnN0IHNoYXJlZFByb2Nlc3NTZXJ2aWNlOiBQYXJ0aWFsPElTaGFyZWRQcm9jZXNzU2VydmljZT4gPSB7XG5cdFx0XHRnZXRDaGFubmVsOiAoKSA9PiBhc0NoYW5uZWwobWFpblNlcnZpY2UpLFxuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UgYXMgUGFydGlhbDxJQ29uZmlndXJhdGlvblNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwge30gYXMgUGFydGlhbDxJUXVpY2tJbnB1dFNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTaGFyZWRQcm9jZXNzU2VydmljZSwgc2hhcmVkUHJvY2Vzc1NlcnZpY2UgYXMgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIGFzIFBhcnRpYWw8SVJlbW90ZUFnZW50SG9zdFNlcnZpY2U+KTtcblxuXHRcdGNvbnN0IGNsaWVudFdhaXRlcnM6IERlZmVycmVkUHJvbWlzZTxNb2NrUHJvdG9jb2xDbGllbnQ+W10gPSBbXTtcblx0XHR3YWl0Rm9yQ2xpZW50ID0gKGluZGV4OiBudW1iZXIpOiBQcm9taXNlPE1vY2tQcm90b2NvbENsaWVudD4gPT4ge1xuXHRcdFx0aWYgKGNyZWF0ZWRDbGllbnRzW2luZGV4XSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZWRDbGllbnRzW2luZGV4XSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGNsaWVudFdhaXRlcnNbaW5kZXhdID8/PSBuZXcgRGVmZXJyZWRQcm9taXNlPE1vY2tQcm90b2NvbENsaWVudD4oKSkucDtcblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU1NIUmVsYXlDbGllbnRGYWN0b3J5LCB7XG5cdFx0XHRjcmVhdGVDbGllbnQ6IChfbWFpblNlcnZpY2U6IElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSwgX2Nvbm5lY3Rpb25JZDogc3RyaW5nLCBfYWRkcmVzczogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGMgPSBuZXcgTW9ja1Byb3RvY29sQ2xpZW50KCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjKTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBjcmVhdGVkQ2xpZW50cy5sZW5ndGg7XG5cdFx0XHRcdGNyZWF0ZWRDbGllbnRzLnB1c2goYyk7XG5cdFx0XHRcdGNsaWVudFdhaXRlcnNbaW5kZXhdPy5jb21wbGV0ZShjKTtcblx0XHRcdFx0cmV0dXJuIGMgYXMgdW5rbm93biBhcyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNhbXBsZUNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyA9IHtcblx0XHRob3N0OiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdHVzZXJuYW1lOiAndXNlcicsXG5cdFx0YXV0aE1ldGhvZDogMCBhcyBuZXZlcixcblx0XHRuYW1lOiAnTXkgUmVtb3RlJyxcblx0XHRzc2hDb25maWdIb3N0OiAncmVtb3RlLmV4YW1wbGUnLFxuXHR9O1xuXG5cdC8qKiBXYWl0IHVudGlsIHRoZSByZW5kZXJlciBoYXMgY3JlYXRlZCBpdHMgcHJvdG9jb2wgY2xpZW50LCB0aGVuIHJlc29sdmUgaXRzIGhhbmRzaGFrZS4gKi9cblx0YXN5bmMgZnVuY3Rpb24gYXdhaXRDbGllbnRUaGVuUmVzb2x2ZShpbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgd2FpdEZvckNsaWVudChpbmRleCk7XG5cdFx0Y2xpZW50LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHR9XG5cblx0dGVzdCgnY29ubmVjdCByZWdpc3RlcnMgYSBtYW5hZ2VkIGNvbm5lY3Rpb24gd2l0aCBhIHRyYW5zcG9ydCBkaXNwb3NhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBjb25uZWN0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuYWRkZWRbMF0uYWRkcmVzcywgJ3NzaDpyZW1vdGUuZXhhbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkWzBdLnN0YXR1cz8ua2luZCwgJ2Nvbm5lY3RlZCcpO1xuXHRcdGFzc2VydC5vayhyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkWzBdLnRyYW5zcG9ydCwgJ2EgdHJhbnNwb3J0IGRpc3Bvc2FibGUgaXMgcGFzc2VkIHNvIHJlbW92YWwgY2FuIHRlYXIgZG93biB0aGUgU1NIIHR1bm5lbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZS5sb2NhbEFkZHJlc3MsICdzc2g6cmVtb3RlLmV4YW1wbGUnKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jb21wYXRpYmxlIGhhbmRzaGFrZSBrZWVwcyBTU0ggdHVubmVsIHJlZ2lzdGVyZWQgZm9yIHNlcnZlciB1cGdyYWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgd2FpdEZvckNsaWVudCgwKTtcblx0XHRhd2FpdCBjbGllbnQuY29ubmVjdERlZmVycmVkLmVycm9yKG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0QUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHQnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsXG5cdFx0XHR7IHN1cHBvcnRlZFZlcnNpb25zOiBbJ14wLjIuMCddLCBfbWV0YTogeyB2c2NvZGVVcGdyYWRlTWV0aG9kOiAnX3ZzY29kZVVwZ3JhZGUnIH0gfSxcblx0XHQpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbm5lY3RQcm9taXNlLCAvVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbi8pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZGRlZDogcmVtb3RlQWdlbnRIb3N0U2VydmljZS5hZGRlZC5tYXAoKHsgYWRkcmVzcywgc3RhdHVzIH0pID0+ICh7IGFkZHJlc3MsIHN0YXR1cyB9KSksXG5cdFx0XHRjb25uZWN0aW9uczogc2VydmljZS5jb25uZWN0aW9ucy5tYXAoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmxvY2FsQWRkcmVzcyksXG5cdFx0XHRkaXNjb25uZWN0Q2FsbHM6IG1haW5TZXJ2aWNlLmRpc2Nvbm5lY3RDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRhZGRlZDogW3tcblx0XHRcdFx0YWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pbmNvbXBhdGlibGUoJ1Vuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24nLCBbUFJPVE9DT0xfVkVSU0lPTl0sIFsnXjAuMi4wJ10sICdfdnNjb2RlVXBncmFkZScpLFxuXHRcdFx0fV0sXG5cdFx0XHRjb25uZWN0aW9uczogWydzc2g6cmVtb3RlLmV4YW1wbGUnXSxcblx0XHRcdGRpc2Nvbm5lY3RDYWxsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCBhZnRlciBpbmNvbXBhdGlibGUgaGFuZHNoYWtlIHJlcGxhY2VzIHRoZSBzdGFsZSBoYW5kbGUgYW5kIHJlLWhhbmRzaGFrZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUGluIGEgc3RhYmxlIGNvbm5lY3Rpb25JZCBzbyB0aGUgc2ltdWxhdGVkIGByZXBsYWNlUmVsYXlgIHJlY29ubmVjdFxuXHRcdC8vIHJldHVybnMgdGhlIHNhbWUgaWQgYXMgdGhlIGluaXRpYWwgY29ubmVjdCBcdTIwMTQgdGhhdCBpcyB0aGUgcmVhbFxuXHRcdC8vIGJlaGF2aW9yIG9mIFNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLmNvbm5lY3QocmVwbGFjZVJlbGF5PXRydWUpLlxuXHRcdG1haW5TZXJ2aWNlLmNvbm5lY3RSZXN1bHQgPSB7IGNvbm5lY3Rpb25JZDogJ2Nvbm4tc3RhYmxlJywgYWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScgfTtcblxuXHRcdC8vIEZpcnN0IGNvbm5lY3Q6IGhhbmRzaGFrZSByZWplY3RlZCBhcyBpbmNvbXBhdGlibGUuIFBlciB0aGUgZXhpc3Rpbmdcblx0XHQvLyBmaXgsIHRoaXMgc3RpbGwgcmVnaXN0ZXJzIGEgbWFuYWdlZCBjb25uZWN0aW9uIGluIGBpbmNvbXBhdGlibGVgXG5cdFx0Ly8gc3RhdGUgc28gdGhlIHNlcnZlci11cGdyYWRlIFJQQyBjYW4gcmVhY2ggdGhlIGhvc3QuXG5cdFx0Y29uc3QgZmlyc3RDb25uZWN0ID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0Y29uc3QgZmlyc3RDbGllbnQgPSBhd2FpdCB3YWl0Rm9yQ2xpZW50KDApO1xuXHRcdGF3YWl0IGZpcnN0Q2xpZW50LmNvbm5lY3REZWZlcnJlZC5lcnJvcihuZXcgUHJvdG9jb2xFcnJvcihcblx0XHRcdEFIUF9VTlNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OLFxuXHRcdFx0J1Vuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24nLFxuXHRcdFx0eyBzdXBwb3J0ZWRWZXJzaW9uczogWydeMC4yLjAnXSwgX21ldGE6IHsgdnNjb2RlVXBncmFkZU1ldGhvZDogJ192c2NvZGVVcGdyYWRlJyB9IH0sXG5cdFx0KSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoZmlyc3RDb25uZWN0LCAvVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbi8pO1xuXG5cdFx0Ly8gVXNlciB0cmlnZ2VycyB0aGUgc2VydmVyIHVwZ3JhZGUgYW5kIHRoZW4gdGhlIGNvbnRyaWJ1dGlvbiByZWNvbm5lY3RzLlxuXHRcdC8vIFRoZSByZWNvbm5lY3QgbXVzdCBOT1Qgc2hvcnQtY2lyY3VpdCB0byB0aGUgc3RhbGUgaGFuZGxlICh3aG9zZVxuXHRcdC8vIHByb3RvY29sIGNsaWVudCBpcyBwZXJtYW5lbnRseSBzdHVjayBpbiBpbmNvbXBhdGlibGUgc3RhdGUpOyBpdCBtdXN0XG5cdFx0Ly8gYnVpbGQgYSBmcmVzaCBjbGllbnQgYW5kIGNvbXBsZXRlIGEgZnJlc2ggaGFuZHNoYWtlIGFnYWluc3QgdGhlXG5cdFx0Ly8gdXBncmFkZWQgc2VydmVyLlxuXHRcdGNvbnN0IHJlY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLnJlY29ubmVjdCgncmVtb3RlLmV4YW1wbGUnLCAnTXkgUmVtb3RlJyk7XG5cdFx0Y29uc3Qgc2Vjb25kQ2xpZW50ID0gYXdhaXQgd2FpdEZvckNsaWVudCgxKTtcblx0XHRhd2FpdCBzZWNvbmRDbGllbnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgcmVjb25uZWN0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xpZW50Q291bnQ6IGNyZWF0ZWRDbGllbnRzLmxlbmd0aCxcblx0XHRcdGFkZGVkOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkLm1hcCgoeyBhZGRyZXNzLCBzdGF0dXMgfSkgPT4gKHsgYWRkcmVzcywgc3RhdHVzS2luZDogc3RhdHVzPy5raW5kIH0pKSxcblx0XHRcdC8vIFRoZSByZXBsYWNlUmVsYXkgcGF0aCBrZWVwcyB0aGUgU1NIIHR1bm5lbCBhbGl2ZSBcdTIwMTQgd2UgbXVzdCBub3Rcblx0XHRcdC8vIGhhdmUgYXNrZWQgdGhlIG1haW4gc2VydmljZSB0byBkaXNjb25uZWN0IGl0LlxuXHRcdFx0ZGlzY29ubmVjdENhbGxzOiBtYWluU2VydmljZS5kaXNjb25uZWN0Q2FsbHMsXG5cdFx0XHQvLyBFeGFjdGx5IG9uZSByZW5kZXJlci1zaWRlIGhhbmRsZSBmb3IgdGhlIGFkZHJlc3MuXG5cdFx0XHRjb25uZWN0aW9uczogc2VydmljZS5jb25uZWN0aW9ucy5tYXAoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmxvY2FsQWRkcmVzcyksXG5cdFx0fSwge1xuXHRcdFx0Y2xpZW50Q291bnQ6IDIsXG5cdFx0XHRhZGRlZDogW1xuXHRcdFx0XHR7IGFkZHJlc3M6ICdzc2g6cmVtb3RlLmV4YW1wbGUnLCBzdGF0dXNLaW5kOiAnaW5jb21wYXRpYmxlJyB9LFxuXHRcdFx0XHR7IGFkZHJlc3M6ICdzc2g6cmVtb3RlLmV4YW1wbGUnLCBzdGF0dXNLaW5kOiAnY29ubmVjdGVkJyB9LFxuXHRcdFx0XSxcblx0XHRcdGRpc2Nvbm5lY3RDYWxsczogW10sXG5cdFx0XHRjb25uZWN0aW9uczogWydzc2g6cmVtb3RlLmV4YW1wbGUnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZWQgc2V0dGluZyBwcmV2ZW50cyBTU0ggdHVubmVsIGNvbm5lY3RzIGFuZCByZWNvbm5lY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFJlbW90ZUFnZW50SG9zdHNFbmFibGVkKGZhbHNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpLCAvbm90IGVuYWJsZWQvKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLnJlY29ubmVjdCgncmVtb3RlLmV4YW1wbGUnLCAnTXkgUmVtb3RlJyksIC9ub3QgZW5hYmxlZC8pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbm5lY3RDYWxsczogbWFpblNlcnZpY2UuY29ubmVjdENhbGxzLCByZWNvbm5lY3RDYWxsczogbWFpblNlcnZpY2UucmVjb25uZWN0Q2FsbHMsIGFkZGVkOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkIH0sIHtcblx0XHRcdGNvbm5lY3RDYWxsczogW10sXG5cdFx0XHRyZWNvbm5lY3RDYWxsczogW10sXG5cdFx0XHRhZGRlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92aW5nIHRoZSBlbnRyeSB0ZWFycyBkb3duIHRoZSBTU0ggdHVubmVsIGFuZCB0aGUgcmVuZGVyZXItc2lkZSBoYW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRhd2FpdCBhd2FpdENsaWVudFRoZW5SZXNvbHZlKDApO1xuXHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmRpc2Nvbm5lY3RDYWxscy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgdXNlciBjbGlja2luZyBcIlJlbW92ZSBSZW1vdGVcIjogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2Vcblx0XHQvLyBkaXNwb3NlcyB0aGUgcGVyLWVudHJ5IHN0b3JlLCB3aGljaCBydW5zIG91ciB0cmFuc3BvcnQgZGlzcG9zYWJsZS5cblx0XHRyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnJlbW92ZUVudHJ5KCdzc2g6cmVtb3RlLmV4YW1wbGUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZGlzY29ubmVjdENhbGxzLCBbJ2Nvbm4tMSddLCAnbWFpbi1wcm9jZXNzIHR1bm5lbCBpcyB0b2xkIHRvIGRpc2Nvbm5lY3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDAsICdyZW5kZXJlci1zaWRlIGhhbmRsZSBpcyBkcm9wcGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nvbm5lY3QgYWZ0ZXIgcmVtb3ZhbCBkb2VzIG5vdCByZXVzZSB0aGUgcHJldmlvdXMgaGFuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEZpcnN0IGNvbm5lY3QgXHUyMTkyIGVudHJ5IHJlZ2lzdGVyZWQsIHRoZW4gcmVtb3ZlZC5cblx0XHRjb25zdCBjMSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgYzE7XG5cdFx0cmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVFbnRyeSgnc3NoOnJlbW90ZS5leGFtcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAwKTtcblxuXHRcdC8vIFNlY29uZCBjb25uZWN0IFx1MjE5MiBtYWluIHJldHVybnMgYSBuZXcgY29ubmVjdGlvbklkOyByZW5kZXJlciBjcmVhdGVzXG5cdFx0Ly8gYSBmcmVzaCBoYW5kbGUgYW5kIHJlZ2lzdGVycyBhIG5ldyBtYW5hZ2VkIGVudHJ5LlxuXHRcdG1haW5TZXJ2aWNlLmNvbm5lY3RSZXN1bHQgPSB7IGNvbm5lY3Rpb25JZDogJ2Nvbm4tMicsIGFkZHJlc3M6ICdzc2g6cmVtb3RlLmV4YW1wbGUnIH07XG5cdFx0Y29uc3QgYzIgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRhd2FpdCBhd2FpdENsaWVudFRoZW5SZXNvbHZlKDEpO1xuXHRcdGF3YWl0IGMyO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3RlQWdlbnRIb3N0U2VydmljZS5hZGRlZC5sZW5ndGgsIDIsICdlYWNoIGNvbm5lY3QgcHJvZHVjZXMgYSBmcmVzaCBtYW5hZ2VkLWNvbm5lY3Rpb24gcmVnaXN0cmF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21haW4tcHJvY2VzcyBvbkRpZENsb3NlQ29ubmVjdGlvbiBjbGVhbnMgdXAgcmVuZGVyZXIgaGFuZGxlIHdpdGhvdXQgZG91YmxlLWRpc2Nvbm5lY3RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRhd2FpdCBhd2FpdENsaWVudFRoZW5SZXNvbHZlKDApO1xuXHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBTaW11bGF0ZSBtYWluIHByb2Nlc3MgY2xvc2luZyB0aGUgY29ubmVjdGlvbiBvbiBpdHMgb3duIChlLmcuIFNTSCBkcm9wcGVkKS5cblx0XHQvLyBXZSBjYW4ndCBkaXJlY3RseSBmaXJlIG9uIHRoZSB3cmFwcGVkIGVtaXR0ZXIgdGhyb3VnaCB0aGUgY2hhbm5lbCBiZWNhdXNlXG5cdFx0Ly8gUHJveHlDaGFubmVsIGlzIG9uZS1kaXJlY3Rpb25hbDsgaW5zdGVhZCB3ZSB0cmlnZ2VyIHZpYSB0aGUgbW9jayBzZXJ2aWNlXG5cdFx0Ly8gZW1pdHRlciB0aGF0IHRoZSByZW5kZXJlciBzdWJzY3JpYmVkIHRvLlxuXHRcdChtYWluU2VydmljZSBhcyB1bmtub3duIGFzIHsgX29uRGlkQ2xvc2VDb25uZWN0aW9uOiBFbWl0dGVyPHN0cmluZz4gfSkuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmZpcmUoJ2Nvbm4tMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAwLCAnaGFuZGxlIGRyb3BwZWQgb24gbWFpbiBjbG9zZScpO1xuXHRcdC8vIFJlbW92aW5nIHRoZSAoYWxyZWFkeS1nb25lKSBlbnRyeSBzaG91bGRuJ3QgdHJpZ2dlciBhbm90aGVyIGRpc2Nvbm5lY3QgY2FsbC5cblx0XHRyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnJlbW92ZUVudHJ5KCdzc2g6cmVtb3RlLmV4YW1wbGUnKTtcblx0XHQvLyBPbmUgZGlzY29ubmVjdCBmcm9tIHRoZSB0cmFuc3BvcnQgZGlzcG9zYWJsZSBpcyBmaW5lOyB3ZSBqdXN0IHdhbnQgdG8gbWFrZVxuXHRcdC8vIHN1cmUgd2UncmUgbm90IGF0IHJpc2sgb2YgaXNzdWluZyBhIHNlY29uZCBvbmUgYWdhaW5zdCBhIHN0YWxlIGlkLlxuXHRcdGFzc2VydC5vayhtYWluU2VydmljZS5kaXNjb25uZWN0Q2FsbHMubGVuZ3RoIDw9IDEsICdubyBkdXBsaWNhdGUgZGlzY29ubmVjdCBhZ2FpbnN0IGEgc3RhbGUgY29ubmVjdGlvbklkJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFdBQVc7QUFFcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QixpQ0FBaUMsd0NBQXdDO0FBRTNHLFNBQVMsa0NBQWtDLHFCQUFxQjtBQVNoRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QixpQ0FBaUM7QUFRbEUsTUFBTSxtQkFBbUI7QUFBQSxFQUF6QjtBQUNDLFNBQWlCLDBCQUEwQixJQUFJLFFBQWM7QUFDN0QsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFL0QsU0FBaUIsd0JBQXdCLElBQUksUUFBZ0I7QUFDN0QsU0FBUyx1QkFBdUIsS0FBSyxzQkFBc0I7QUFFM0QsU0FBaUIsOEJBQThCLElBQUksUUFBb0Q7QUFDdkcsU0FBUyw2QkFBNkIsS0FBSyw0QkFBNEI7QUFFdkUsU0FBaUIscUJBQXFCLElBQUksUUFBdUI7QUFDakUsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFFckQsU0FBaUIsbUJBQW1CLElBQUksUUFB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
