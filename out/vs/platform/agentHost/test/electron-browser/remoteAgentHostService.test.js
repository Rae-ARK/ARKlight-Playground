import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { URI } from "../../../../base/common/uri.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILabelService } from "../../../label/common/label.js";
import { AgentsWindowRemoteAgentHostService, RemoteAgentHostService } from "../../browser/remoteAgentHostServiceImpl.js";
import { parseRemoteAgentHostInput, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, entryToRawEntry } from "../../common/remoteAgentHostService.js";
import { AGENT_HOST_SCHEME, agentHostAuthority } from "../../common/agentHostUri.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { InMemoryStorageService, IStorageService } from "../../../storage/common/storage.js";
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from "../../common/agentHostClientInfo.js";
class MockTransport extends Disposable {
  constructor() {
    super(...arguments);
    this.onMessage = Event.None;
    this.onClose = Event.None;
    this.onOpen = Event.None;
    this.isOpen = false;
  }
  connect() {
    return Promise.resolve();
  }
  send() {
    return true;
  }
}
const _MockProtocolClient = class _MockProtocolClient extends Disposable {
  constructor(mockAddress) {
    super();
    this.mockAddress = mockAddress;
    this.clientId = `mock-client-${_MockProtocolClient._nextId++}`;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.onDidChangeConnectionState = Event.None;
    this.onDidReceiveOtlpLogs = Event.None;
    this.connectionState = "connecting";
    this.initializeResult = void 0;
    this.telemetryCapabilities = void 0;
    this.triggerVscodeUpgradeCalls = [];
    this.connectDeferred = new DeferredPromise();
  }
  async connect() {
    return this.connectDeferred.p;
  }
  async triggerVscodeUpgrade(method) {
    this.triggerVscodeUpgradeCalls.push(method);
    return { ok: true, upgradeStarted: true };
  }
  fireClose() {
    this._onDidClose.fire();
  }
};
_MockProtocolClient._nextId = 1;
let MockProtocolClient = _MockProtocolClient;
class TestConfigurationService {
  constructor() {
    this._onDidChangeConfiguration = new Emitter();
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._entries = [];
    this._enabled = true;
  }
  getValue(key) {
    if (key === RemoteAgentHostsEnabledSettingId) {
      return this._enabled;
    }
    return this._entries;
  }
  inspect(_key) {
    return {
      userValue: this._entries
    };
  }
  async updateValue(_key, value) {
    const entries = value ?? [];
    const changed = JSON.stringify(this._entries) !== JSON.stringify(entries);
    this._entries = entries;
    if (!changed) {
      return;
    }
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId
    });
  }
  get entries() {
    return this._entries;
  }
  setEntries(entries) {
    this._entries = entries.map(entryToRawEntry).filter((e) => e !== void 0);
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId
    });
  }
  setRawEntries(entries) {
    this._entries = entries;
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId
    });
  }
  setEnabled(enabled) {
    this._enabled = enabled;
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsEnabledSettingId
    });
  }
  dispose() {
    this._onDidChangeConfiguration.dispose();
  }
}
suite("RemoteAgentHostService", () => {
  const disposables = new DisposableStore();
  let configService;
  let createdClients;
  let createdClientInfos;
  let registeredFormatters;
  let instantiationService;
  let service;
  setup(() => {
    configService = new TestConfigurationService();
    disposables.add(toDisposable(() => configService.dispose()));
    createdClients = [];
    createdClientInfos = [];
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IEnvironmentService, { logsHome: URI.file("/logs") });
    instantiationService.stub(IConfigurationService, configService);
    const storageService = disposables.add(new InMemoryStorageService());
    instantiationService.stub(IStorageService, storageService);
    registeredFormatters = [];
    instantiationService.stub(ILabelService, {
      registerFormatter(formatter) {
        registeredFormatters.push(formatter);
        return toDisposable(() => {
          const idx = registeredFormatters.indexOf(formatter);
          if (idx >= 0) {
            registeredFormatters.splice(idx, 1);
          }
        });
      }
    });
    const mockInstantiationService = {
      createInstance: (ctor, ...args) => {
        const ctorName = ctor.name;
        if (ctorName === "WebSocketClientTransport") {
          return disposables.add(new MockTransport());
        }
        const client = new MockProtocolClient(args[0]);
        createdClientInfos.push(args[4]);
        disposables.add(client);
        createdClients.push(client);
        return client;
      }
    };
    instantiationService.stub(IInstantiationService, mockInstantiationService);
    service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  async function waitForConnected() {
    while (!service.connections.some((c) => RemoteAgentHostConnectionStatus.isConnected(c.status))) {
      await Event.toPromise(service.onDidChangeConnections);
    }
  }
  test("starts with no connections when setting is empty", () => {
    assert.deepStrictEqual(service.connections, []);
  });
  test("parses supported remote host inputs", () => {
    assert.deepStrictEqual([
      parseRemoteAgentHostInput("Listening on ws://127.0.0.1:8089"),
      parseRemoteAgentHostInput("Agent host proxy listening on ws://127.0.0.1:8089"),
      parseRemoteAgentHostInput("127.0.0.1:8089"),
      parseRemoteAgentHostInput("ws://127.0.0.1:8089"),
      parseRemoteAgentHostInput("ws://127.0.0.1:40147?tkn=c9d12867-da33-425e-8d39-0d071e851597"),
      parseRemoteAgentHostInput("wss://secure.example.com:443"),
      parseRemoteAgentHostInput("local"),
      parseRemoteAgentHostInput("ws://local")
    ], [
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:40147", connectionToken: "c9d12867-da33-425e-8d39-0d071e851597", suggestedName: "127.0.0.1:40147" } },
      { parsed: { address: "wss://secure.example.com", connectionToken: void 0, suggestedName: "secure.example.com" } },
      { parsed: { address: "local", connectionToken: void 0, suggestedName: "local" } },
      { parsed: { address: "local", connectionToken: void 0, suggestedName: "local" } }
    ]);
  });
  test("getConnection returns undefined for unknown address", () => {
    assert.strictEqual(service.getConnection("ws://unknown:1234"), void 0);
  });
  test("creates connection when setting is updated", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    assert.strictEqual(createdClients.length, 1);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const connected = service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status));
    assert.deepStrictEqual({
      connection: connected.map(({ address, name }) => ({ address, name })),
      clientInfo: createdClientInfos
    }, {
      connection: [{ address: "host1:8080", name: "Host 1" }],
      clientInfo: [editorWindowAgentHostClientInfo]
    });
  });
  test("agents window service identifies its protocol client", async () => {
    service.dispose();
    service = disposables.add(instantiationService.createInstance(AgentsWindowRemoteAgentHostService));
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    assert.deepStrictEqual(createdClientInfos, [agentsWindowAgentHostClientInfo]);
  });
  test("getConnection returns client after successful connect", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const connection = service.getConnection("ws://host1:8080");
    assert.ok(connection);
    assert.strictEqual(connection.clientId, createdClients[0].clientId);
  });
  test("removes connection when setting entry is removed", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const removedEvent = Event.toPromise(service.onDidChangeConnections);
    configService.setEntries([]);
    await removedEvent;
    assert.strictEqual(service.connections.length, 0);
    assert.strictEqual(service.getConnection("ws://host1:8080"), void 0);
  });
  test("fires onDidChangeConnections when connection closes", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const closedEvent = Event.toPromise(service.onDidChangeConnections);
    createdClients[0].fireClose();
    await closedEvent;
    assert.strictEqual(service.getConnection("ws://host1:8080"), void 0);
    const entry = service.connections.find((c) => c.address === "host1:8080");
    assert.ok(entry);
    assert.strictEqual(entry.status, RemoteAgentHostConnectionStatus.disconnected);
  });
  test("removes connection on connect failure", async () => {
    configService.setEntries([{ name: "Bad", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://bad:9999" } }]);
    assert.strictEqual(createdClients.length, 1);
    const connectionChanged = Event.toPromise(service.onDidChangeConnections);
    createdClients[0].connectDeferred.error(new Error("Connection refused"));
    await connectionChanged;
    assert.strictEqual(service.connections.length, 0);
    assert.strictEqual(service.getConnection("ws://bad:9999"), void 0);
  });
  test("manages multiple connections independently", async () => {
    configService.setEntries([
      { name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } },
      { name: "Host 2", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host2:8080" } }
    ]);
    assert.strictEqual(createdClients.length, 2);
    createdClients[0].connectDeferred.complete();
    createdClients[1].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);
    const conn1 = service.getConnection("ws://host1:8080");
    const conn2 = service.getConnection("ws://host2:8080");
    assert.ok(conn1);
    assert.ok(conn2);
    assert.notStrictEqual(conn1.clientId, conn2.clientId);
  });
  test("does not re-create existing connections on setting update", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const firstClientId = createdClients[0].clientId;
    configService.setEntries([{ name: "Renamed", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    assert.strictEqual(createdClients.length, 1);
    const conn = service.getConnection("ws://host1:8080");
    assert.ok(conn);
    assert.strictEqual(conn.clientId, firstClientId);
    const entry = service.connections.find((c) => c.address === "host1:8080");
    assert.strictEqual(entry?.name, "Renamed");
  });
  test("addRemoteAgentHost stores the entry and waits for connection", async () => {
    const connectionPromise = service.addRemoteAgentHost({
      name: "Host 1",
      connectionToken: "secret-token",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" }
    });
    assert.deepStrictEqual(configService.entries, [{
      address: "host1:8080",
      name: "Host 1",
      connectionToken: "secret-token"
    }]);
    assert.strictEqual(createdClients.length, 1);
    createdClients[0].connectDeferred.complete();
    const connection = await connectionPromise;
    assert.deepStrictEqual(connection, {
      address: "host1:8080",
      name: "Host 1",
      clientId: createdClients[0].clientId,
      defaultDirectory: void 0,
      status: RemoteAgentHostConnectionStatus.connected
    });
  });
  test("addRemoteAgentHost updates existing configured entries without reconnecting", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const connection = await service.addRemoteAgentHost({
      name: "Updated Host",
      connectionToken: "new-token",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" }
    });
    assert.strictEqual(createdClients.length, 1);
    assert.deepStrictEqual(configService.entries, [{
      address: "host1:8080",
      name: "Updated Host",
      connectionToken: "new-token"
    }]);
    assert.deepStrictEqual(connection, {
      address: "host1:8080",
      name: "Updated Host",
      clientId: createdClients[0].clientId,
      defaultDirectory: void 0,
      status: RemoteAgentHostConnectionStatus.connected
    });
  });
  test("addRemoteAgentHost appends when adding a second host", async () => {
    const firstPromise = service.addRemoteAgentHost({
      name: "Host 1",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" }
    });
    createdClients[0].connectDeferred.complete();
    await firstPromise;
    const secondPromise = service.addRemoteAgentHost({
      name: "Host 2",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host2:9090" }
    });
    createdClients[1].connectDeferred.complete();
    await secondPromise;
    assert.strictEqual(createdClients.length, 2);
    assert.deepStrictEqual(configService.entries, [
      { address: "host1:8080", name: "Host 1", connectionToken: void 0 },
      { address: "host2:9090", name: "Host 2", connectionToken: void 0 }
    ]);
    assert.strictEqual(service.connections.length, 2);
  });
  test("addRemoteAgentHost resolves when connection completes before wait is created", async () => {
    const originalUpdateValue = configService.updateValue.bind(configService);
    configService.updateValue = async (key, value) => {
      await originalUpdateValue(key, value);
      if (createdClients.length > 0) {
        createdClients[createdClients.length - 1].connectDeferred.complete();
      }
    };
    const connection = await service.addRemoteAgentHost({
      name: "Fast Host",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "fast-host:1234" }
    });
    assert.strictEqual(connection.address, "fast-host:1234");
    assert.strictEqual(connection.name, "Fast Host");
  });
  test("disabling the enabled setting disconnects all remotes", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
    configService.setEnabled(false);
    assert.strictEqual(service.connections.length, 0);
  });
  test("addRemoteAgentHost throws when disabled", async () => {
    configService.setEnabled(false);
    await assert.rejects(
      () => service.addRemoteAgentHost({ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }),
      /not enabled/
    );
  });
  test("re-enabling reconnects configured remotes", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
    configService.setEnabled(false);
    assert.strictEqual(service.connections.length, 0);
    configService.setEnabled(true);
    assert.strictEqual(createdClients.length, 2);
    createdClients[1].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
  });
  test("removeRemoteAgentHost removes entry and disconnects", async () => {
    configService.setEntries([
      { name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } },
      { name: "Host 2", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host2:9090" } }
    ]);
    createdClients[0].connectDeferred.complete();
    createdClients[1].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);
    await service.removeRemoteAgentHost("ws://host1:8080");
    assert.deepStrictEqual(configService.entries, [
      { address: "ws://host2:9090", name: "Host 2", connectionToken: void 0 }
    ]);
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
    assert.strictEqual(service.getConnection("ws://host1:8080"), void 0);
    assert.ok(service.getConnection("ws://host2:9090"));
  });
  test("removeRemoteAgentHost normalizes address before removing", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    await service.removeRemoteAgentHost("ws://host1:8080");
    assert.deepStrictEqual(configService.entries, []);
    assert.strictEqual(service.connections.length, 0);
  });
  suite("addManagedConnection", () => {
    function makeTransportDisposable() {
      let disposed = false;
      return {
        disposable: { dispose: () => {
          disposed = true;
        } },
        disposed: () => disposed
      };
    }
    async function addManaged(name, address, transport) {
      const mockClient = disposables.add(new MockProtocolClient(`ws://${address}`));
      return service.addManagedConnection(
        { name, connection: { type: RemoteAgentHostEntryType.WebSocket, address } },
        mockClient,
        transport
      );
    }
    test("keeps incompatible managed connection addressable for server upgrade", async () => {
      const mockClient = disposables.add(new MockProtocolClient("ssh:remote.example"));
      await service.addManagedConnection(
        {
          name: "SSH Host",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:remote.example",
            sshConfigHost: "remote",
            hostName: "remote.example"
          }
        },
        mockClient,
        void 0,
        RemoteAgentHostConnectionStatus.incompatible("Unsupported protocol version", ["0.3.0"], ["^0.2.0"], "_vscodeUpgrade")
      );
      const upgradeResult = await service.triggerServerUpgrade("ssh:remote.example", "_vscodeUpgrade");
      assert.deepStrictEqual({
        status: service.connections[0].status,
        connectedConnection: service.getConnection("ssh:remote.example"),
        upgradeCalls: mockClient.triggerVscodeUpgradeCalls,
        upgradeResult
      }, {
        status: RemoteAgentHostConnectionStatus.incompatible("Unsupported protocol version", ["0.3.0"], ["^0.2.0"], "_vscodeUpgrade"),
        connectedConnection: void 0,
        upgradeCalls: ["_vscodeUpgrade"],
        upgradeResult: { ok: true, upgradeStarted: true }
      });
    });
    test("disposes transportDisposable when entry is removed via removeRemoteAgentHost", async () => {
      const t = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t.disposable);
      assert.strictEqual(t.disposed(), false);
      await service.removeRemoteAgentHost("ws://managed:1234");
      assert.strictEqual(t.disposed(), true, "transport disposable runs when entry is removed");
      assert.strictEqual(service.getConnection("ws://managed:1234"), void 0);
    });
    test("throws when disabled", async () => {
      configService.setEnabled(false);
      await assert.rejects(
        () => addManaged("Managed", "managed:1234"),
        /not enabled/
      );
    });
    test("does NOT dispose previous transportDisposable when entry is replaced", async () => {
      const t1 = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t1.disposable);
      const t2 = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t2.disposable);
      assert.strictEqual(t1.disposed(), false, "previous transport disposable is not run on replacement");
      assert.strictEqual(t2.disposed(), false, "new transport disposable is still alive");
      await service.removeRemoteAgentHost("ws://managed:1234");
      assert.strictEqual(t2.disposed(), true, "new transport disposable runs on full removal");
    });
    test("disposes transportDisposable when service itself is disposed", async () => {
      const t = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t.disposable);
      service.dispose();
      assert.strictEqual(t.disposed(), true, "transport disposable runs when service is disposed");
    });
    test("stores SSH connection details outside the remote hosts setting", async () => {
      const mockClient = disposables.add(new MockProtocolClient("ssh:remote.example"));
      await service.addManagedConnection(
        {
          name: "SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:remote.example",
            sshConfigHost: "remote",
            hostName: "remote.example",
            user: "me",
            port: 2222
          }
        },
        mockClient
      );
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: [{
          name: "SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:remote.example",
            sshConfigHost: "remote",
            hostName: "remote.example",
            user: "me",
            port: 2222
          }
        }]
      });
    });
    test("migrates legacy SSH connection details from settings to storage", async () => {
      service.dispose();
      configService.setRawEntries([{
        address: "ssh:legacy",
        name: "Legacy SSH Host",
        connectionToken: "ssh-token",
        sshConfigHost: "legacy",
        sshHostName: "legacy.example",
        sshUser: "me",
        sshPort: 2222
      }]);
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: [{
          name: "Legacy SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:legacy",
            sshConfigHost: "legacy",
            hostName: "legacy.example",
            user: "me",
            port: 2222
          }
        }]
      });
      service.dispose();
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: [{
          name: "Legacy SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:legacy",
            sshConfigHost: "legacy",
            hostName: "legacy.example",
            user: "me",
            port: 2222
          }
        }]
      });
    });
    test("fires change when removing a storage-only SSH entry", async () => {
      service.dispose();
      configService.setRawEntries([{
        address: "ssh:legacy",
        name: "Legacy SSH Host",
        sshConfigHost: "legacy",
        sshHostName: "legacy.example"
      }]);
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      const changed = Event.toPromise(service.onDidChangeConnections);
      await service.removeRemoteAgentHost("ssh:legacy");
      await changed;
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: []
      });
    });
  });
  suite("host label formatter", () => {
    function formatterFor(address) {
      const authority = agentHostAuthority(address);
      return registeredFormatters.find((f) => f.scheme === AGENT_HOST_SCHEME && f.authority === authority);
    }
    test("registers formatter when an entry is added", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      const formatter = formatterFor("host1:8080");
      assert.ok(formatter, "formatter is registered");
      assert.strictEqual(formatter.formatting.workspaceSuffix, "Host 1");
    });
    test("refreshes formatter when an entry name changes", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      configService.setEntries([{ name: "Renamed", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      const matching = registeredFormatters.filter((f) => f.authority === agentHostAuthority("host1:8080"));
      assert.strictEqual(matching.length, 1, "old formatter is replaced, not duplicated");
      assert.strictEqual(matching[0].formatting.workspaceSuffix, "Renamed");
    });
    test("removes formatter when an entry is removed", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      assert.ok(formatterFor("host1:8080"));
      configService.setEntries([]);
      assert.strictEqual(formatterFor("host1:8080"), void 0);
    });
    test("removes formatters when the service is disabled", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      assert.ok(formatterFor("host1:8080"));
      configService.setEnabled(false);
      assert.strictEqual(formatterFor("host1:8080"), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvcmVtb3RlQWdlbnRIb3N0U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgdHlwZSBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UsIHR5cGUgUmVzb3VyY2VMYWJlbEZvcm1hdHRlciB9IGZyb20gJy4uLy4uLy4uL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBBZ2VudHNXaW5kb3dSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBwYXJzZVJlbW90ZUFnZW50SG9zdElucHV0LCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkLCBSZW1vdGVBZ2VudEhvc3RzU2V0dGluZ0lkLCBlbnRyeVRvUmF3RW50cnksIHR5cGUgSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5LCB0eXBlIElSZW1vdGVBZ2VudEhvc3RFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfU0NIRU1FLCBhZ2VudEhvc3RBdXRob3JpdHkgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbywgZWRpdG9yV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcblxuLy8gLS0tLSBNb2NrIHRyYW5zcG9ydCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja1RyYW5zcG9ydCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbk1lc3NhZ2UgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkNsb3NlID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25PcGVuID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgaXNPcGVuID0gZmFsc2U7XG5cdGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRzZW5kKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxufVxuXG4vLyAtLS0tIE1vY2sgcHJvdG9jb2wgY2xpZW50IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNb2NrUHJvdG9jb2xDbGllbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgX25leHRJZCA9IDE7XG5cdHJlYWRvbmx5IGNsaWVudElkID0gYG1vY2stY2xpZW50LSR7TW9ja1Byb3RvY29sQ2xpZW50Ll9uZXh0SWQrK31gO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZSA9IHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWROb3RpZmljYXRpb24gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZU90bHBMb2dzID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgY29ubmVjdGlvblN0YXRlID0gJ2Nvbm5lY3RpbmcnIGFzIGNvbnN0O1xuXHRyZWFkb25seSBpbml0aWFsaXplUmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlDYXBhYmlsaXRpZXMgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRyaWdnZXJWc2NvZGVVcGdyYWRlQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cblx0cHVibGljIGNvbm5lY3REZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbW9ja0FkZHJlc3M6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNvbm5lY3REZWZlcnJlZC5wO1xuXHR9XG5cblx0YXN5bmMgdHJpZ2dlclZzY29kZVVwZ3JhZGUobWV0aG9kOiBzdHJpbmcpIHtcblx0XHR0aGlzLnRyaWdnZXJWc2NvZGVVcGdyYWRlQ2FsbHMucHVzaChtZXRob2QpO1xuXHRcdHJldHVybiB7IG9rOiB0cnVlLCB1cGdyYWRlU3RhcnRlZDogdHJ1ZSB9O1xuXHR9XG5cblx0ZmlyZUNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gVGVzdCBjb25maWd1cmF0aW9uIHNlcnZpY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IG5ldyBFbWl0dGVyPFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9lbnRyaWVzOiBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIF9lbmFibGVkID0gdHJ1ZTtcblxuXHRnZXRWYWx1ZShrZXk/OiBzdHJpbmcpOiB1bmtub3duIHtcblx0XHRpZiAoa2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VuYWJsZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lbnRyaWVzO1xuXHR9XG5cblx0aW5zcGVjdChfa2V5OiBzdHJpbmcpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXNlclZhbHVlOiB0aGlzLl9lbnRyaWVzLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyB1cGRhdGVWYWx1ZShfa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cmllcyA9ICh2YWx1ZSBhcyBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXSB8IHVuZGVmaW5lZCkgPz8gW107XG5cdFx0Y29uc3QgY2hhbmdlZCA9IEpTT04uc3RyaW5naWZ5KHRoaXMuX2VudHJpZXMpICE9PSBKU09OLnN0cmluZ2lmeShlbnRyaWVzKTtcblx0XHR0aGlzLl9lbnRyaWVzID0gZW50cmllcztcblx0XHRpZiAoIWNoYW5nZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmZpcmUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzU2V0dGluZ0lkIHx8IGtleSA9PT0gUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQsXG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgZW50cmllcygpOiByZWFkb25seSBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXM7XG5cdH1cblxuXHRzZXRFbnRyaWVzKGVudHJpZXM6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fZW50cmllcyA9IGVudHJpZXMubWFwKGVudHJ5VG9SYXdFbnRyeSkuZmlsdGVyKChlKTogZSBpcyBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnkgPT4gZSAhPT0gdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQgfHwga2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCxcblx0XHR9KTtcblx0fVxuXG5cdHNldFJhd0VudHJpZXMoZW50cmllczogSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5W10pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnRyaWVzID0gZW50cmllcztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQgfHwga2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCxcblx0XHR9KTtcblx0fVxuXG5cdHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKHtcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQsXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5kaXNwb3NlKCk7XG5cdH1cbn1cblxuc3VpdGUoJ1JlbW90ZUFnZW50SG9zdFNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBjb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBjcmVhdGVkQ2xpZW50czogTW9ja1Byb3RvY29sQ2xpZW50W107XG5cdGxldCBjcmVhdGVkQ2xpZW50SW5mb3M6IChJbXBsZW1lbnRhdGlvbiB8IHVuZGVmaW5lZClbXTtcblx0bGV0IHJlZ2lzdGVyZWRGb3JtYXR0ZXJzOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyW107XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgc2VydmljZTogUmVtb3RlQWdlbnRIb3N0U2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbmZpZ1NlcnZpY2UuZGlzcG9zZSgpKSk7XG5cblx0XHRjcmVhdGVkQ2xpZW50cyA9IFtdO1xuXHRcdGNyZWF0ZWRDbGllbnRJbmZvcyA9IFtdO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGxvZ3NIb21lOiBVUkkuZmlsZSgnL2xvZ3MnKSB9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlIGFzIFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPik7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRyZWdpc3RlcmVkRm9ybWF0dGVycyA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwge1xuXHRcdFx0cmVnaXN0ZXJGb3JtYXR0ZXIoZm9ybWF0dGVyOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyKSB7XG5cdFx0XHRcdHJlZ2lzdGVyZWRGb3JtYXR0ZXJzLnB1c2goZm9ybWF0dGVyKTtcblx0XHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaWR4ID0gcmVnaXN0ZXJlZEZvcm1hdHRlcnMuaW5kZXhPZihmb3JtYXR0ZXIpO1xuXHRcdFx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRcdFx0cmVnaXN0ZXJlZEZvcm1hdHRlcnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyBQYXJ0aWFsPElMYWJlbFNlcnZpY2U+KTtcblxuXHRcdC8vIE1vY2sgdGhlIGluc3RhbnRpYXRpb24gc2VydmljZSB0byBjYXB0dXJlIGNyZWF0ZWQgcHJvdG9jb2wgY2xpZW50cy5cblx0XHQvLyBgX2Nvbm5lY3RUb2AgY2FsbHMgYGNyZWF0ZUluc3RhbmNlYCBmb3IgYFdlYlNvY2tldENsaWVudFRyYW5zcG9ydGBcblx0XHQvLyBhbmQgYFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50YC4gV2Ugb25seSBjYXJlIGFib3V0IHRyYWNraW5nXG5cdFx0Ly8gdGhlIHByb3RvY29sIGNsaWVudDsgZm9yIHRoZSB0cmFuc3BvcnQgd2UgcmV0dXJuIGEgbm8tb3Bcblx0XHQvLyBkaXNwb3NhYmxlIHNvIHRoZSB0ZXN0IGNhbiBrZWVwIGFzc2VydGluZyBvbiBgY3JlYXRlZENsaWVudHMubGVuZ3RoYC5cblx0XHRjb25zdCBtb2NrSW5zdGFudGlhdGlvblNlcnZpY2U6IFBhcnRpYWw8SUluc3RhbnRpYXRpb25TZXJ2aWNlPiA9IHtcblx0XHRcdGNyZWF0ZUluc3RhbmNlOiAoY3RvcjogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN0b3JOYW1lID0gKGN0b3IgYXMgeyBuYW1lPzogc3RyaW5nIH0pLm5hbWU7XG5cdFx0XHRcdGlmIChjdG9yTmFtZSA9PT0gJ1dlYlNvY2tldENsaWVudFRyYW5zcG9ydCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrVHJhbnNwb3J0KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBNb2NrUHJvdG9jb2xDbGllbnQoYXJnc1swXSBhcyBzdHJpbmcpO1xuXHRcdFx0XHRjcmVhdGVkQ2xpZW50SW5mb3MucHVzaChhcmdzWzRdIGFzIEltcGxlbWVudGF0aW9uIHwgdW5kZWZpbmVkKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudCk7XG5cdFx0XHRcdGNyZWF0ZWRDbGllbnRzLnB1c2goY2xpZW50KTtcblx0XHRcdFx0cmV0dXJuIGNsaWVudDtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgbW9ja0luc3RhbnRpYXRpb25TZXJ2aWNlIGFzIFBhcnRpYWw8SUluc3RhbnRpYXRpb25TZXJ2aWNlPik7XG5cblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8qKiBXYWl0IGZvciBhIGNvbm5lY3Rpb24gdG8gcmVhY2ggQ29ubmVjdGVkIHN0YXR1cy4gKi9cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbm5lY3RlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAoIXNlcnZpY2UuY29ubmVjdGlvbnMuc29tZShjID0+IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoYy5zdGF0dXMpKSkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnc3RhcnRzIHdpdGggbm8gY29ubmVjdGlvbnMgd2hlbiBzZXR0aW5nIGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgc3VwcG9ydGVkIHJlbW90ZSBob3N0IGlucHV0cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHBhcnNlUmVtb3RlQWdlbnRIb3N0SW5wdXQoJ0xpc3RlbmluZyBvbiB3czovLzEyNy4wLjAuMTo4MDg5JyksXG5cdFx0XHRwYXJzZVJlbW90ZUFnZW50SG9zdElucHV0KCdBZ2VudCBob3N0IHByb3h5IGxpc3RlbmluZyBvbiB3czovLzEyNy4wLjAuMTo4MDg5JyksXG5cdFx0XHRwYXJzZVJlbW90ZUFnZW50SG9zdElucHV0KCcxMjcuMC4wLjE6ODA4OScpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnd3M6Ly8xMjcuMC4wLjE6ODA4OScpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnd3M6Ly8xMjcuMC4wLjE6NDAxNDc/dGtuPWM5ZDEyODY3LWRhMzMtNDI1ZS04ZDM5LTBkMDcxZTg1MTU5NycpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnd3NzOi8vc2VjdXJlLmV4YW1wbGUuY29tOjQ0MycpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnbG9jYWwnKSxcblx0XHRcdHBhcnNlUmVtb3RlQWdlbnRIb3N0SW5wdXQoJ3dzOi8vbG9jYWwnKSxcblx0XHRdLCBbXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjQwMTQ3JywgY29ubmVjdGlvblRva2VuOiAnYzlkMTI4NjctZGEzMy00MjVlLThkMzktMGQwNzFlODUxNTk3Jywgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo0MDE0NycgfSB9LFxuXHRcdFx0eyBwYXJzZWQ6IHsgYWRkcmVzczogJ3dzczovL3NlY3VyZS5leGFtcGxlLmNvbScsIGNvbm5lY3Rpb25Ub2tlbjogdW5kZWZpbmVkLCBzdWdnZXN0ZWROYW1lOiAnc2VjdXJlLmV4YW1wbGUuY29tJyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnbG9jYWwnLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJ2xvY2FsJyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnbG9jYWwnLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJ2xvY2FsJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbm5lY3Rpb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gYWRkcmVzcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRDb25uZWN0aW9uKCd3czovL3Vua25vd246MTIzNCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIGNvbm5lY3Rpb24gd2hlbiBzZXR0aW5nIGlzIHVwZGF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgY29ubmVjdCBwcm9taXNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDbGllbnRzLmxlbmd0aCwgMSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0Y29uc3QgY29ubmVjdGVkID0gc2VydmljZS5jb25uZWN0aW9ucy5maWx0ZXIoYyA9PiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25uZWN0aW9uOiBjb25uZWN0ZWQubWFwKCh7IGFkZHJlc3MsIG5hbWUgfSkgPT4gKHsgYWRkcmVzcywgbmFtZSB9KSksXG5cdFx0XHRjbGllbnRJbmZvOiBjcmVhdGVkQ2xpZW50SW5mb3MsXG5cdFx0fSwge1xuXHRcdFx0Y29ubmVjdGlvbjogW3sgYWRkcmVzczogJ2hvc3QxOjgwODAnLCBuYW1lOiAnSG9zdCAxJyB9XSxcblx0XHRcdGNsaWVudEluZm86IFtlZGl0b3JXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRzIHdpbmRvdyBzZXJ2aWNlIGlkZW50aWZpZXMgaXRzIHByb3RvY29sIGNsaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50c1dpbmRvd1JlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50SW5mb3MsIFthZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbm5lY3Rpb24gcmV0dXJucyBjbGllbnQgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gc2VydmljZS5nZXRDb25uZWN0aW9uKCd3czovL2hvc3QxOjgwODAnKTtcblx0XHRhc3NlcnQub2soY29ubmVjdGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uY2xpZW50SWQsIGNyZWF0ZWRDbGllbnRzWzBdLmNsaWVudElkKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBjb25uZWN0aW9uIHdoZW4gc2V0dGluZyBlbnRyeSBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEFkZCBhIGNvbm5lY3Rpb25cblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0Ly8gUmVtb3ZlIGl0XG5cdFx0Y29uc3QgcmVtb3ZlZEV2ZW50ID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFtdKTtcblx0XHRhd2FpdCByZW1vdmVkRXZlbnQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vaG9zdDE6ODA4MCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZUNvbm5lY3Rpb25zIHdoZW4gY29ubmVjdGlvbiBjbG9zZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXHRcdGNyZWF0ZWRDbGllbnRzWzBdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25uZWN0ZWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIGNvbm5lY3Rpb24gY2xvc2UgXHUyMDE0IGVudHJ5IHRyYW5zaXRpb25zIHRvIERpc2Nvbm5lY3RlZFxuXHRcdGNvbnN0IGNsb3NlZEV2ZW50ID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0YXdhaXQgY2xvc2VkRXZlbnQ7XG5cblx0XHQvLyBDb25uZWN0aW9uIGlzIHN0aWxsIHRyYWNrZWQgKGZvciByZWNvbm5lY3QpIGJ1dCBnZXRDb25uZWN0aW9uIHJldHVybnMgdW5kZWZpbmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0MTo4MDgwJyksIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZW50cnkgPSBzZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09ICdob3N0MTo4MDgwJyk7XG5cdFx0YXNzZXJ0Lm9rKGVudHJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuc3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgY29ubmVjdGlvbiBvbiBjb25uZWN0IGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdCYWQnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2JhZDo5OTk5JyB9IH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENsaWVudHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEZhaWwgdGhlIGNvbm5lY3Rpb24gYW5kIHdhaXQgZm9yIHRoZSBzZXJ2aWNlIHRvIHJlYWN0XG5cdFx0Y29uc3QgY29ubmVjdGlvbkNoYW5nZWQgPSBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuZXJyb3IobmV3IEVycm9yKCdDb25uZWN0aW9uIHJlZnVzZWQnKSk7XG5cdFx0YXdhaXQgY29ubmVjdGlvbkNoYW5nZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vYmFkOjk5OTknKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlcyBtdWx0aXBsZSBjb25uZWN0aW9ucyBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbXG5cdFx0XHR7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfSxcblx0XHRcdHsgbmFtZTogJ0hvc3QgMicsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDI6ODA4MCcgfSB9LFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDbGllbnRzLmxlbmd0aCwgMik7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMV0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBjb25uMSA9IHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0MTo4MDgwJyk7XG5cdFx0Y29uc3QgY29ubjIgPSBzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vaG9zdDI6ODA4MCcpO1xuXHRcdGFzc2VydC5vayhjb25uMSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbm4yKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY29ubjEuY2xpZW50SWQsIGNvbm4yLmNsaWVudElkKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmUtY3JlYXRlIGV4aXN0aW5nIGNvbm5lY3Rpb25zIG9uIHNldHRpbmcgdXBkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cblx0XHRjb25zdCBmaXJzdENsaWVudElkID0gY3JlYXRlZENsaWVudHNbMF0uY2xpZW50SWQ7XG5cblx0XHQvLyBVcGRhdGUgc2V0dGluZyB3aXRoIHNhbWUgYWRkcmVzcyAoYnV0IGRpZmZlcmVudCBuYW1lKVxuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnUmVuYW1lZCcsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cblx0XHQvLyBTaG91bGQgTk9UIGhhdmUgY3JlYXRlZCBhIHNlY29uZCBjbGllbnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENsaWVudHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIENvbm5lY3Rpb24gc2hvdWxkIHN0aWxsIHdvcmsgd2l0aCBzYW1lIGNsaWVudFxuXHRcdGNvbnN0IGNvbm4gPSBzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vaG9zdDE6ODA4MCcpO1xuXHRcdGFzc2VydC5vayhjb25uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubi5jbGllbnRJZCwgZmlyc3RDbGllbnRJZCk7XG5cblx0XHQvLyBCdXQgbmFtZSBzaG91bGQgYmUgdXBkYXRlZFxuXHRcdGNvbnN0IGVudHJ5ID0gc2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSAnaG9zdDE6ODA4MCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeT8ubmFtZSwgJ1JlbmFtZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVtb3RlQWdlbnRIb3N0IHN0b3JlcyB0aGUgZW50cnkgYW5kIHdhaXRzIGZvciBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25Qcm9taXNlID0gc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0bmFtZTogJ0hvc3QgMScsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46ICdzZWNyZXQtdG9rZW4nLFxuXHRcdFx0Y29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWdTZXJ2aWNlLmVudHJpZXMsIFt7XG5cdFx0XHRhZGRyZXNzOiAnaG9zdDE6ODA4MCcsXG5cdFx0XHRuYW1lOiAnSG9zdCAxJyxcblx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogJ3NlY3JldC10b2tlbicsXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50cy5sZW5ndGgsIDEpO1xuXG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IGNvbm5lY3Rpb25Qcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLCB7XG5cdFx0XHRhZGRyZXNzOiAnaG9zdDE6ODA4MCcsXG5cdFx0XHRuYW1lOiAnSG9zdCAxJyxcblx0XHRcdGNsaWVudElkOiBjcmVhdGVkQ2xpZW50c1swXS5jbGllbnRJZCxcblx0XHRcdGRlZmF1bHREaXJlY3Rvcnk6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFJlbW90ZUFnZW50SG9zdCB1cGRhdGVzIGV4aXN0aW5nIGNvbmZpZ3VyZWQgZW50cmllcyB3aXRob3V0IHJlY29ubmVjdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHNlcnZpY2UuYWRkUmVtb3RlQWdlbnRIb3N0KHtcblx0XHRcdG5hbWU6ICdVcGRhdGVkIEhvc3QnLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiAnbmV3LXRva2VuJyxcblx0XHRcdGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnU2VydmljZS5lbnRyaWVzLCBbe1xuXHRcdFx0YWRkcmVzczogJ2hvc3QxOjgwODAnLFxuXHRcdFx0bmFtZTogJ1VwZGF0ZWQgSG9zdCcsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46ICduZXctdG9rZW4nLFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24sIHtcblx0XHRcdGFkZHJlc3M6ICdob3N0MTo4MDgwJyxcblx0XHRcdG5hbWU6ICdVcGRhdGVkIEhvc3QnLFxuXHRcdFx0Y2xpZW50SWQ6IGNyZWF0ZWRDbGllbnRzWzBdLmNsaWVudElkLFxuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVtb3RlQWdlbnRIb3N0IGFwcGVuZHMgd2hlbiBhZGRpbmcgYSBzZWNvbmQgaG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBZGQgZmlyc3QgaG9zdFxuXHRcdGNvbnN0IGZpcnN0UHJvbWlzZSA9IHNlcnZpY2UuYWRkUmVtb3RlQWdlbnRIb3N0KHtcblx0XHRcdG5hbWU6ICdIb3N0IDEnLFxuXHRcdFx0Y29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnaG9zdDE6ODA4MCcgfSxcblx0XHR9KTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCBmaXJzdFByb21pc2U7XG5cblx0XHQvLyBBZGQgc2Vjb25kIGhvc3Rcblx0XHRjb25zdCBzZWNvbmRQcm9taXNlID0gc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0bmFtZTogJ0hvc3QgMicsXG5cdFx0XHRjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdob3N0Mjo5MDkwJyB9LFxuXHRcdH0pO1xuXHRcdGNyZWF0ZWRDbGllbnRzWzFdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHNlY29uZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENsaWVudHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ1NlcnZpY2UuZW50cmllcywgW1xuXHRcdFx0eyBhZGRyZXNzOiAnaG9zdDE6ODA4MCcsIG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBhZGRyZXNzOiAnaG9zdDI6OTA5MCcsIG5hbWU6ICdIb3N0IDInLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFJlbW90ZUFnZW50SG9zdCByZXNvbHZlcyB3aGVuIGNvbm5lY3Rpb24gY29tcGxldGVzIGJlZm9yZSB3YWl0IGlzIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgYSBmYXN0IGNvbm5lY3Q6IHRoZSBtb2NrIGNsaWVudCByZXNvbHZlcyBzeW5jaHJvbm91c2x5XG5cdFx0Ly8gZHVyaW5nIHRoZSBjb25maWcgY2hhbmdlIGhhbmRsZXIsIGJlZm9yZSBhZGRSZW1vdGVBZ2VudEhvc3QgaGFzIGFcblx0XHQvLyBjaGFuY2UgdG8gY3JlYXRlIGl0cyBEZWZlcnJlZFByb21pc2Ugd2FpdC5cblx0XHRjb25zdCBvcmlnaW5hbFVwZGF0ZVZhbHVlID0gY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZS5iaW5kKGNvbmZpZ1NlcnZpY2UpO1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUgPSBhc3luYyAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRhd2FpdCBvcmlnaW5hbFVwZGF0ZVZhbHVlKGtleSwgdmFsdWUpO1xuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIGNvbm5lY3Rpb24gc3luY2hyb25vdXNseSBpbnNpZGUgdGhlIGNvbmZpZyBjaGFuZ2UgY2FsbGJhY2tcblx0XHRcdGlmIChjcmVhdGVkQ2xpZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNyZWF0ZWRDbGllbnRzW2NyZWF0ZWRDbGllbnRzLmxlbmd0aCAtIDFdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0bmFtZTogJ0Zhc3QgSG9zdCcsXG5cdFx0XHRjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdmYXN0LWhvc3Q6MTIzNCcgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmFkZHJlc3MsICdmYXN0LWhvc3Q6MTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLm5hbWUsICdGYXN0IEhvc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsaW5nIHRoZSBlbmFibGVkIHNldHRpbmcgZGlzY29ubmVjdHMgYWxsIHJlbW90ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMSk7XG5cblx0XHRjb25maWdTZXJ2aWNlLnNldEVuYWJsZWQoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVtb3RlQWdlbnRIb3N0IHRocm93cyB3aGVuIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW5hYmxlZChmYWxzZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuYWRkUmVtb3RlQWdlbnRIb3N0KHsgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ2hvc3QxOjgwODAnIH0gfSksXG5cdFx0XHQvbm90IGVuYWJsZWQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWVuYWJsaW5nIHJlY29ubmVjdHMgY29uZmlndXJlZCByZW1vdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbHRlcihjID0+IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoYy5zdGF0dXMpKS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50cy5sZW5ndGgsIDIpOyAvLyBuZXcgY2xpZW50IGNyZWF0ZWRcblx0XHRjcmVhdGVkQ2xpZW50c1sxXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVJlbW90ZUFnZW50SG9zdCByZW1vdmVzIGVudHJ5IGFuZCBkaXNjb25uZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW1xuXHRcdFx0eyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdIb3N0IDInLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QyOjkwOTAnIH0gfSxcblx0XHRdKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRjcmVhdGVkQ2xpZW50c1sxXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMik7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlbW92ZVJlbW90ZUFnZW50SG9zdCgnd3M6Ly9ob3N0MTo4MDgwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ1NlcnZpY2UuZW50cmllcywgW1xuXHRcdFx0eyBhZGRyZXNzOiAnd3M6Ly9ob3N0Mjo5MDkwJywgbmFtZTogJ0hvc3QgMicsIGNvbm5lY3Rpb25Ub2tlbjogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0MTo4MDgwJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0Mjo5MDkwJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVSZW1vdGVBZ2VudEhvc3Qgbm9ybWFsaXplcyBhZGRyZXNzIGJlZm9yZSByZW1vdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ2hvc3QxOjgwODAnIH0gfV0pO1xuXHRcdGNyZWF0ZWRDbGllbnRzWzBdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25uZWN0ZWQoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVtb3ZlUmVtb3RlQWdlbnRIb3N0KCd3czovL2hvc3QxOjgwODAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnU2VydmljZS5lbnRyaWVzLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0c3VpdGUoJ2FkZE1hbmFnZWRDb25uZWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0Ly8gQnVpbGQgYSB0cmFuc3BvcnQgZGlzcG9zYWJsZSB0aGF0IHJlY29yZHMgd2hlbiBpdCByYW4uXG5cdFx0ZnVuY3Rpb24gbWFrZVRyYW5zcG9ydERpc3Bvc2FibGUoKTogeyBkaXNwb3NhYmxlOiB7IGRpc3Bvc2UoKTogdm9pZCB9OyBkaXNwb3NlZDogKCkgPT4gYm9vbGVhbiB9IHtcblx0XHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zYWJsZTogeyBkaXNwb3NlOiAoKSA9PiB7IGRpc3Bvc2VkID0gdHJ1ZTsgfSB9LFxuXHRcdFx0XHRkaXNwb3NlZDogKCkgPT4gZGlzcG9zZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEluamVjdCBhIG1hbmFnZWQgY29ubmVjdGlvbiAobWltaWNraW5nIHRoZSBTU0gvdHVubmVsIHJlbmRlcmVyIGZsb3cpLlxuXHRcdGFzeW5jIGZ1bmN0aW9uIGFkZE1hbmFnZWQobmFtZTogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcsIHRyYW5zcG9ydD86IHsgZGlzcG9zZSgpOiB2b2lkIH0pIHtcblx0XHRcdGNvbnN0IG1vY2tDbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbENsaWVudChgd3M6Ly8ke2FkZHJlc3N9YCkpO1xuXHRcdFx0cmV0dXJuIHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24oXG5cdFx0XHRcdHsgbmFtZSwgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzIH0gfSxcblx0XHRcdFx0bW9ja0NsaWVudCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24+WzFdLFxuXHRcdFx0XHR0cmFuc3BvcnQsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2tlZXBzIGluY29tcGF0aWJsZSBtYW5hZ2VkIGNvbm5lY3Rpb24gYWRkcmVzc2FibGUgZm9yIHNlcnZlciB1cGdyYWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0NsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sQ2xpZW50KCdzc2g6cmVtb3RlLmV4YW1wbGUnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ1NTSCBIb3N0Jyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdFx0XHRzc2hDb25maWdIb3N0OiAncmVtb3RlJyxcblx0XHRcdFx0XHRcdGhvc3ROYW1lOiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vY2tDbGllbnQgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uPlsxXSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmluY29tcGF0aWJsZSgnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsIFsnMC4zLjAnXSwgWydeMC4yLjAnXSwgJ192c2NvZGVVcGdyYWRlJyksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB1cGdyYWRlUmVzdWx0ID0gYXdhaXQgc2VydmljZS50cmlnZ2VyU2VydmVyVXBncmFkZSgnc3NoOnJlbW90ZS5leGFtcGxlJywgJ192c2NvZGVVcGdyYWRlJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHNlcnZpY2UuY29ubmVjdGlvbnNbMF0uc3RhdHVzLFxuXHRcdFx0XHRjb25uZWN0ZWRDb25uZWN0aW9uOiBzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3NzaDpyZW1vdGUuZXhhbXBsZScpLFxuXHRcdFx0XHR1cGdyYWRlQ2FsbHM6IG1vY2tDbGllbnQudHJpZ2dlclZzY29kZVVwZ3JhZGVDYWxscyxcblx0XHRcdFx0dXBncmFkZVJlc3VsdCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmluY29tcGF0aWJsZSgnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsIFsnMC4zLjAnXSwgWydeMC4yLjAnXSwgJ192c2NvZGVVcGdyYWRlJyksXG5cdFx0XHRcdGNvbm5lY3RlZENvbm5lY3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0dXBncmFkZUNhbGxzOiBbJ192c2NvZGVVcGdyYWRlJ10sXG5cdFx0XHRcdHVwZ3JhZGVSZXN1bHQ6IHsgb2s6IHRydWUsIHVwZ3JhZGVTdGFydGVkOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VzIHRyYW5zcG9ydERpc3Bvc2FibGUgd2hlbiBlbnRyeSBpcyByZW1vdmVkIHZpYSByZW1vdmVSZW1vdGVBZ2VudEhvc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gbWFrZVRyYW5zcG9ydERpc3Bvc2FibGUoKTtcblx0XHRcdGF3YWl0IGFkZE1hbmFnZWQoJ01hbmFnZWQnLCAnbWFuYWdlZDoxMjM0JywgdC5kaXNwb3NhYmxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0LmRpc3Bvc2VkKCksIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoJ3dzOi8vbWFuYWdlZDoxMjM0Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0LmRpc3Bvc2VkKCksIHRydWUsICd0cmFuc3BvcnQgZGlzcG9zYWJsZSBydW5zIHdoZW4gZW50cnkgaXMgcmVtb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9tYW5hZ2VkOjEyMzQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IGFkZE1hbmFnZWQoJ01hbmFnZWQnLCAnbWFuYWdlZDoxMjM0JyksXG5cdFx0XHRcdC9ub3QgZW5hYmxlZC8sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBOT1QgZGlzcG9zZSBwcmV2aW91cyB0cmFuc3BvcnREaXNwb3NhYmxlIHdoZW4gZW50cnkgaXMgcmVwbGFjZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXaGVuIHRoZSBlbnRyeSBpcyByZXBsYWNlZCAoZS5nLiBvbiByZWNvbm5lY3QgdG8gdGhlIHNhbWUgYWRkcmVzcyksXG5cdFx0XHQvLyB0aGUgbmV3IGVudHJ5IHRha2VzIG93bmVyc2hpcCBvZiB0aGUgc2FtZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb25JZC5cblx0XHRcdC8vIFJ1bm5pbmcgdGhlIG9sZCB0cmFuc3BvcnREaXNwb3NhYmxlIHdvdWxkIGNhbGwgZGlzY29ubmVjdCgpIG9uIHRoZVxuXHRcdFx0Ly8gc2hhcmVkLXByb2Nlc3MgdHVubmVsIGtleWVkIGJ5IHRoYXQgY29ubmVjdGlvbklkIGFuZCBpbW1lZGlhdGVseVxuXHRcdFx0Ly8gdGVhciBkb3duIHRoZSBicmFuZC1uZXcgY29ubmVjdGlvbi4gVGhlIG5ldyB0cmFuc3BvcnREaXNwb3NhYmxlXG5cdFx0XHQvLyBpbmhlcml0cyByZXNwb25zaWJpbGl0eSBmb3IgdGhlIHVuZGVybHlpbmcgdHVubmVsLlxuXHRcdFx0Y29uc3QgdDEgPSBtYWtlVHJhbnNwb3J0RGlzcG9zYWJsZSgpO1xuXHRcdFx0YXdhaXQgYWRkTWFuYWdlZCgnTWFuYWdlZCcsICdtYW5hZ2VkOjEyMzQnLCB0MS5kaXNwb3NhYmxlKTtcblxuXHRcdFx0Y29uc3QgdDIgPSBtYWtlVHJhbnNwb3J0RGlzcG9zYWJsZSgpO1xuXHRcdFx0YXdhaXQgYWRkTWFuYWdlZCgnTWFuYWdlZCcsICdtYW5hZ2VkOjEyMzQnLCB0Mi5kaXNwb3NhYmxlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHQxLmRpc3Bvc2VkKCksIGZhbHNlLCAncHJldmlvdXMgdHJhbnNwb3J0IGRpc3Bvc2FibGUgaXMgbm90IHJ1biBvbiByZXBsYWNlbWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHQyLmRpc3Bvc2VkKCksIGZhbHNlLCAnbmV3IHRyYW5zcG9ydCBkaXNwb3NhYmxlIGlzIHN0aWxsIGFsaXZlJyk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVtb3ZlUmVtb3RlQWdlbnRIb3N0KCd3czovL21hbmFnZWQ6MTIzNCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodDIuZGlzcG9zZWQoKSwgdHJ1ZSwgJ25ldyB0cmFuc3BvcnQgZGlzcG9zYWJsZSBydW5zIG9uIGZ1bGwgcmVtb3ZhbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZXMgdHJhbnNwb3J0RGlzcG9zYWJsZSB3aGVuIHNlcnZpY2UgaXRzZWxmIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IG1ha2VUcmFuc3BvcnREaXNwb3NhYmxlKCk7XG5cdFx0XHRhd2FpdCBhZGRNYW5hZ2VkKCdNYW5hZ2VkJywgJ21hbmFnZWQ6MTIzNCcsIHQuZGlzcG9zYWJsZSk7XG5cblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodC5kaXNwb3NlZCgpLCB0cnVlLCAndHJhbnNwb3J0IGRpc3Bvc2FibGUgcnVucyB3aGVuIHNlcnZpY2UgaXMgZGlzcG9zZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlcyBTU0ggY29ubmVjdGlvbiBkZXRhaWxzIG91dHNpZGUgdGhlIHJlbW90ZSBob3N0cyBzZXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0NsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sQ2xpZW50KCdzc2g6cmVtb3RlLmV4YW1wbGUnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ1NTSCBIb3N0Jyxcblx0XHRcdFx0XHRjb25uZWN0aW9uVG9rZW46ICdzc2gtdG9rZW4nLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0XHRhZGRyZXNzOiAnc3NoOnJlbW90ZS5leGFtcGxlJyxcblx0XHRcdFx0XHRcdHNzaENvbmZpZ0hvc3Q6ICdyZW1vdGUnLFxuXHRcdFx0XHRcdFx0aG9zdE5hbWU6ICdyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdFx0XHR1c2VyOiAnbWUnLFxuXHRcdFx0XHRcdFx0cG9ydDogMjIyMixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtb2NrQ2xpZW50IGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2Ygc2VydmljZS5hZGRNYW5hZ2VkQ29ubmVjdGlvbj5bMV0sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2V0dGluZ3M6IGNvbmZpZ1NlcnZpY2UuZW50cmllcyxcblx0XHRcdFx0Y29uZmlndXJlZDogc2VydmljZS5jb25maWd1cmVkRW50cmllcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2V0dGluZ3M6IFtdLFxuXHRcdFx0XHRjb25maWd1cmVkOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdTU0ggSG9zdCcsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAnc3NoLXRva2VuJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdFx0XHRzc2hDb25maWdIb3N0OiAncmVtb3RlJyxcblx0XHRcdFx0XHRcdGhvc3ROYW1lOiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0XHRcdFx0dXNlcjogJ21lJyxcblx0XHRcdFx0XHRcdHBvcnQ6IDIyMjIsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGVzIGxlZ2FjeSBTU0ggY29ubmVjdGlvbiBkZXRhaWxzIGZyb20gc2V0dGluZ3MgdG8gc3RvcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRSYXdFbnRyaWVzKFt7XG5cdFx0XHRcdGFkZHJlc3M6ICdzc2g6bGVnYWN5Jyxcblx0XHRcdFx0bmFtZTogJ0xlZ2FjeSBTU0ggSG9zdCcsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogJ3NzaC10b2tlbicsXG5cdFx0XHRcdHNzaENvbmZpZ0hvc3Q6ICdsZWdhY3knLFxuXHRcdFx0XHRzc2hIb3N0TmFtZTogJ2xlZ2FjeS5leGFtcGxlJyxcblx0XHRcdFx0c3NoVXNlcjogJ21lJyxcblx0XHRcdFx0c3NoUG9ydDogMjIyMixcblx0XHRcdH1dKTtcblxuXHRcdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0XHRjb25maWd1cmVkOiBzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyZWQ6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ0xlZ2FjeSBTU0ggSG9zdCcsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAnc3NoLXRva2VuJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpsZWdhY3knLFxuXHRcdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogJ2xlZ2FjeScsXG5cdFx0XHRcdFx0XHRob3N0TmFtZTogJ2xlZ2FjeS5leGFtcGxlJyxcblx0XHRcdFx0XHRcdHVzZXI6ICdtZScsXG5cdFx0XHRcdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0XHRjb25maWd1cmVkOiBzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyZWQ6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ0xlZ2FjeSBTU0ggSG9zdCcsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAnc3NoLXRva2VuJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpsZWdhY3knLFxuXHRcdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogJ2xlZ2FjeScsXG5cdFx0XHRcdFx0XHRob3N0TmFtZTogJ2xlZ2FjeS5leGFtcGxlJyxcblx0XHRcdFx0XHRcdHVzZXI6ICdtZScsXG5cdFx0XHRcdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaXJlcyBjaGFuZ2Ugd2hlbiByZW1vdmluZyBhIHN0b3JhZ2Utb25seSBTU0ggZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0UmF3RW50cmllcyhbe1xuXHRcdFx0XHRhZGRyZXNzOiAnc3NoOmxlZ2FjeScsXG5cdFx0XHRcdG5hbWU6ICdMZWdhY3kgU1NIIEhvc3QnLFxuXHRcdFx0XHRzc2hDb25maWdIb3N0OiAnbGVnYWN5Jyxcblx0XHRcdFx0c3NoSG9zdE5hbWU6ICdsZWdhY3kuZXhhbXBsZScsXG5cdFx0XHR9XSk7XG5cdFx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IEV2ZW50LnRvUHJvbWlzZShzZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoJ3NzaDpsZWdhY3knKTtcblx0XHRcdGF3YWl0IGNoYW5nZWQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0XHRjb25maWd1cmVkOiBzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyZWQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdob3N0IGxhYmVsIGZvcm1hdHRlcicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGZvcm1hdHRlckZvcihhZGRyZXNzOiBzdHJpbmcpOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyIHwgdW5kZWZpbmVkIHtcblx0XHRcdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKTtcblx0XHRcdHJldHVybiByZWdpc3RlcmVkRm9ybWF0dGVycy5maW5kKGYgPT4gZi5zY2hlbWUgPT09IEFHRU5UX0hPU1RfU0NIRU1FICYmIGYuYXV0aG9yaXR5ID09PSBhdXRob3JpdHkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JlZ2lzdGVycyBmb3JtYXR0ZXIgd2hlbiBhbiBlbnRyeSBpcyBhZGRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblxuXHRcdFx0Y29uc3QgZm9ybWF0dGVyID0gZm9ybWF0dGVyRm9yKCdob3N0MTo4MDgwJyk7XG5cdFx0XHRhc3NlcnQub2soZm9ybWF0dGVyLCAnZm9ybWF0dGVyIGlzIHJlZ2lzdGVyZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXR0ZXIuZm9ybWF0dGluZy53b3Jrc3BhY2VTdWZmaXgsICdIb3N0IDEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZnJlc2hlcyBmb3JtYXR0ZXIgd2hlbiBhbiBlbnRyeSBuYW1lIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ1JlbmFtZWQnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXG5cdFx0XHRjb25zdCBtYXRjaGluZyA9IHJlZ2lzdGVyZWRGb3JtYXR0ZXJzLmZpbHRlcihmID0+IGYuYXV0aG9yaXR5ID09PSBhZ2VudEhvc3RBdXRob3JpdHkoJ2hvc3QxOjgwODAnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hpbmcubGVuZ3RoLCAxLCAnb2xkIGZvcm1hdHRlciBpcyByZXBsYWNlZCwgbm90IGR1cGxpY2F0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGluZ1swXS5mb3JtYXR0aW5nLndvcmtzcGFjZVN1ZmZpeCwgJ1JlbmFtZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgZm9ybWF0dGVyIHdoZW4gYW4gZW50cnkgaXMgcmVtb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRcdGFzc2VydC5vayhmb3JtYXR0ZXJGb3IoJ2hvc3QxOjgwODAnKSk7XG5cblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXR0ZXJGb3IoJ2hvc3QxOjgwODAnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgZm9ybWF0dGVycyB3aGVuIHRoZSBzZXJ2aWNlIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGZvcm1hdHRlckZvcignaG9zdDE6ODA4MCcpKTtcblxuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdHRlckZvcignaG9zdDE6ODA4MCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0Es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
