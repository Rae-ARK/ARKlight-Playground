import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentHostSdkSandboxEnabledSettingId, IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AgentHostCustomTerminalToolEnabledSettingId } from "../../../../../../platform/agentHost/common/copilotCliConfig.js";
import { IAgentHostConnectionsService } from "../../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { AgentHostConnectionsService } from "../../../../../../platform/agentHost/browser/agentHostConnectionsService.js";
import { IRemoteAgentHostService } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from "../../../../../../platform/agentHost/common/sandboxConfigSchema.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { AgentNetworkDomainSettingId } from "../../../../../../platform/networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../../../platform/sandbox/common/settings.js";
import { AgentHostSandboxForwarder } from "../../browser/agentHostSandboxForwarder.js";
class MockAgentConnection {
  constructor() {
    this.clientId = "mock-client";
    this.dispatched = [];
    this._rootStateOnDidChange = new Emitter();
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return self._rootStateValue;
        },
        get verifiedValue() {
          return self._rootStateValue;
        },
        onDidChange: this._rootStateOnDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
  }
  dispatch(_channel, action) {
    this.dispatched.push(action);
  }
  setRootState(state) {
    this._rootStateValue = state;
    if (state) {
      this._rootStateOnDidChange.fire(state);
    }
  }
  dispose() {
    this._rootStateOnDidChange.dispose();
  }
}
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.inner = new MockAgentConnection();
    this.clientId = this.inner.clientId;
    this.onAgentHostStart = Event.None;
    this.onAgentHostExit = Event.None;
    this.onDidAction = this.inner.onDidAction;
    this.onDidNotification = this.inner.onDidNotification;
    this.rootState = this.inner.rootState;
  }
  dispatch(channel, action) {
    this.inner.dispatch(channel, action);
  }
  get dispatched() {
    return this.inner.dispatched;
  }
  setRootState(state) {
    this.inner.setRootState(state);
  }
  dispose() {
    this.inner.dispose();
  }
}
class MockRemoteAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeConnections = new Emitter();
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._connections = [];
    this._byAddress = /* @__PURE__ */ new Map();
  }
  get connections() {
    return this._connections;
  }
  getConnection(address) {
    return this._byAddress.get(address);
  }
  addConnection(address) {
    const conn = new MockAgentConnection();
    this._byAddress.set(address, conn);
    this._connections = [...this._connections, { address, name: address, clientId: conn.clientId, status: { kind: "connected" } }];
    this._onDidChangeConnections.fire();
    return conn;
  }
  removeConnection(address) {
    const conn = this._byAddress.get(address);
    conn?.dispose();
    this._byAddress.delete(address);
    this._connections = this._connections.filter((c) => c.address !== address);
    this._onDidChangeConnections.fire();
  }
  dispose() {
    for (const conn of this._byAddress.values()) {
      conn.dispose();
    }
    this._byAddress.clear();
    this._onDidChangeConnections.dispose();
  }
}
function rootStateWithSandboxSchema(sandbox = {}) {
  return {
    agents: [],
    config: {
      schema: {
        type: "object",
        properties: {
          [AgentHostSandboxConfigKey.Sandbox]: { type: "object", title: "Agent Sandbox" }
        }
      },
      values: { [AgentHostSandboxConfigKey.Sandbox]: sandbox }
    }
  };
}
function rootStateWithoutSandboxSchema() {
  return {
    agents: [],
    config: {
      schema: {
        type: "object",
        // Older / third-party host that doesn't advertise sandbox keys.
        properties: { customizations: { type: "array", title: "Customizations" } }
      },
      values: {}
    }
  };
}
function setup(disposables, configValues = {}) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const local = new MockAgentHostService();
  disposables.add({ dispose: () => local.dispose() });
  const remote = new MockRemoteAgentHostService();
  disposables.add({ dispose: () => remote.dispose() });
  const configurationService = new TestConfigurationService({
    [AgentHostCustomTerminalToolEnabledSettingId]: true,
    ...configValues
  });
  instantiationService.stub(IAgentHostService, local);
  instantiationService.stub(IRemoteAgentHostService, remote);
  instantiationService.stub(IConfigurationService, configurationService);
  instantiationService.stub(ILogService, new NullLogService());
  const connectionsService = disposables.add(instantiationService.createInstance(AgentHostConnectionsService));
  instantiationService.stub(IAgentHostConnectionsService, connectionsService);
  const forwarder = disposables.add(instantiationService.createInstance(AgentHostSandboxForwarder));
  return { forwarder, local, remote, configurationService };
}
suite("AgentHostSandboxForwarder", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not dispatch while rootState is unhydrated", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("dispatches sandbox values to the local host when rootState hydrates", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    assert.deepStrictEqual(local.dispatched, [{
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } }
    }]);
  });
  test("schema-guards keys: skips keys the host does not advertise", () => {
    const { local } = setup(disposables, {
      [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
      [AgentNetworkDomainSettingId.AllowedNetworkDomains]: ["example.com"]
    });
    local.setRootState(rootStateWithoutSandboxSchema());
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("skips no-op dispatch when rootState already matches workbench values", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("re-dispatches when the workbench sandbox setting changes", () => {
    const { local, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
    assert.deepStrictEqual(local.dispatched, []);
    configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.AllowNetwork);
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxEnabled,
      affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxEnabled]),
      change: { keys: [AgentSandboxSettingId.AgentSandboxEnabled], overrides: [] }
    });
    assert.deepStrictEqual(local.dispatched, [{
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork } }
    }]);
  });
  test("dispatches to remote connections when they appear", () => {
    const { remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    const remoteConn = remote.addConnection("remote.example:9000");
    remoteConn.setRootState(rootStateWithSandboxSchema());
    assert.deepStrictEqual(remoteConn.dispatched, [{
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } }
    }]);
  });
  test("fans out workbench setting changes to all connected agent hosts", () => {
    const { local, remote, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    const remoteConn = remote.addConnection("remote.example:9000");
    remoteConn.setRootState(rootStateWithSandboxSchema());
    configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
      affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]),
      change: { keys: [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands], overrides: [] }
    });
    const expectedPatch = {
      type: ActionType.RootConfigChanged,
      config: {
        [AgentHostSandboxConfigKey.Sandbox]: {
          [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
          [AgentHostSandboxKey.AllowUnsandboxedCommands]: true
        }
      }
    };
    assert.deepStrictEqual(local.dispatched.at(-1), expectedPatch);
    assert.deepStrictEqual(remoteConn.dispatched.at(-1), expectedPatch);
  });
  test("ignores unrelated configuration changes", () => {
    const { local, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
    assert.deepStrictEqual(local.dispatched, []);
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectsConfiguration: (key) => key === "editor.fontSize",
      affectedKeys: /* @__PURE__ */ new Set(["editor.fontSize"]),
      change: { keys: ["editor.fontSize"], overrides: [] }
    });
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("does not push back after initial push when the host updates rootState", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off }));
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.AllowUnsandboxedCommands]: true }));
    local.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
  });
  test("does not re-push to existing connections when a new remote appears", () => {
    const { local, remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
    const firstRemote = remote.addConnection("remote-a.example:9000");
    firstRemote.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(firstRemote.dispatched.length, 1);
    assert.strictEqual(local.dispatched.length, 1);
    const secondRemote = remote.addConnection("remote-b.example:9000");
    secondRemote.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
    assert.strictEqual(firstRemote.dispatched.length, 1);
    assert.strictEqual(secondRemote.dispatched.length, 1);
  });
  test("cleans up the pending listener when a remote disconnects before hydrating", () => {
    const { remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    const remoteConn = remote.addConnection("remote.example:9000");
    assert.deepStrictEqual(remoteConn.dispatched, []);
    remote.removeConnection("remote.example:9000");
    remoteConn.setRootState(rootStateWithSandboxSchema());
    assert.deepStrictEqual(remoteConn.dispatched, []);
  });
  suite("SDK-sandbox gating", () => {
    test("forwards user values verbatim when customTerminalTool is enabled, regardless of sdkSandbox", () => {
      const { local } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.AllowNetwork,
        [AgentHostCustomTerminalToolEnabledSettingId]: true,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork } }
      }]);
    });
    test("forwards an empty sandbox object when both customTerminalTool and sdkSandbox are off (default)", () => {
      const { local } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false
        // sdkSandbox unset → defaults to 'off'.
      });
      local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: {} }
      }]);
    });
    test("overrides Enabled/WindowsEnabled with the sdkSandbox value when set to `on`", () => {
      const { local } = setup(disposables, {
        // User has the engine sandbox off entirely — the SDK sandbox
        // setting should still drive the SDK path independently.
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.Off,
        [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: true,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On,
            [AgentHostSandboxKey.AllowUnsandboxedCommands]: true
          }
        }
      }]);
    });
    test("overrides Enabled/WindowsEnabled with `allowNetwork` when sdkSandbox is set to that", () => {
      const { local } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.AllowNetwork
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.AllowNetwork
          }
        }
      }]);
    });
    test("re-dispatches when sdkSandbox toggles from `on` to `off`", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema({
        [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
        [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On
      }));
      assert.deepStrictEqual(local.dispatched, []);
      configurationService.setUserConfiguration(AgentHostSdkSandboxEnabledSettingId, AgentSandboxEnabledValue.Off);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentHostSdkSandboxEnabledSettingId,
        affectedKeys: /* @__PURE__ */ new Set([AgentHostSdkSandboxEnabledSettingId]),
        change: { keys: [AgentHostSdkSandboxEnabledSettingId], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: {} }
      }]);
    });
    test("re-dispatches when sdkSandbox switches between `on` and `allowNetwork`", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema({
        [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
        [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On
      }));
      assert.deepStrictEqual(local.dispatched, []);
      configurationService.setUserConfiguration(AgentHostSdkSandboxEnabledSettingId, AgentSandboxEnabledValue.AllowNetwork);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentHostSdkSandboxEnabledSettingId,
        affectedKeys: /* @__PURE__ */ new Set([AgentHostSdkSandboxEnabledSettingId]),
        change: { keys: [AgentHostSdkSandboxEnabledSettingId], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.AllowNetwork
          }
        }
      }]);
    });
    test("re-dispatches when customTerminalTool is toggled while sdkSandbox is off", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off
      });
      local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: {} }
      }]);
      local.setRootState(rootStateWithSandboxSchema({}));
      configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, true);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentHostCustomTerminalToolEnabledSettingId,
        affectedKeys: /* @__PURE__ */ new Set([AgentHostCustomTerminalToolEnabledSettingId]),
        change: { keys: [AgentHostCustomTerminalToolEnabledSettingId], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched.at(-1), {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0U2FuZGJveEZvcndhcmRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsIElBZ2VudENvbm5lY3Rpb24sIElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleSwgQWdlbnRIb3N0U2FuZGJveEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2FuZGJveENvbmZpZ1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBBY3Rpb25FbnZlbG9wZSwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBJTm90aWZpY2F0aW9uLCBTZXNzaW9uQWN0aW9uLCBUZXJtaW5hbEFjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLCBBZ2VudFNhbmRib3hTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyLmpzJztcblxuLy8gLS0tLSBNb2NrcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja0FnZW50Q29ubmVjdGlvbiB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBjbGllbnRJZCA9ICdtb2NrLWNsaWVudCc7XG5cdHB1YmxpYyBkaXNwYXRjaGVkOiAoU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pW10gPSBbXTtcblxuXHRwcml2YXRlIF9yb290U3RhdGVWYWx1ZTogUm9vdFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290U3RhdGVPbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPFJvb3RTdGF0ZT4oKTtcblxuXHRyZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0gKCgpID0+IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdH0pKCk7XG5cblx0cmVhZG9ubHkgb25EaWRBY3Rpb246IEV2ZW50PEFjdGlvbkVudmVsb3BlPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uOiBFdmVudDxJTm90aWZpY2F0aW9uPiA9IEV2ZW50Lk5vbmU7XG5cblx0ZGlzcGF0Y2goX2NoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hlZC5wdXNoKGFjdGlvbik7XG5cdH1cblxuXHRzZXRSb290U3RhdGUoc3RhdGU6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0gc3RhdGU7XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHR0aGlzLl9yb290U3RhdGVPbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGlubmVyID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblxuXHRvdmVycmlkZSByZWFkb25seSBjbGllbnRJZCA9IHRoaXMuaW5uZXIuY2xpZW50SWQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdEV4aXQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuaW5uZXIub25EaWRBY3Rpb247XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5pbm5lci5vbkRpZE5vdGlmaWNhdGlvbjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgcm9vdFN0YXRlID0gdGhpcy5pbm5lci5yb290U3RhdGU7XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5pbm5lci5kaXNwYXRjaChjaGFubmVsLCBhY3Rpb24pO1xuXHR9XG5cblx0Z2V0IGRpc3BhdGNoZWQoKTogcmVhZG9ubHkgKFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKVtdIHtcblx0XHRyZXR1cm4gdGhpcy5pbm5lci5kaXNwYXRjaGVkO1xuXHR9XG5cblx0c2V0Um9vdFN0YXRlKHN0YXRlOiBSb290U3RhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmlubmVyLnNldFJvb3RTdGF0ZShzdGF0ZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5uZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJUmVtb3RlQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIF9jb25uZWN0aW9uczogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYnlBZGRyZXNzID0gbmV3IE1hcDxzdHJpbmcsIE1vY2tBZ2VudENvbm5lY3Rpb24+KCk7XG5cblx0b3ZlcnJpZGUgZ2V0IGNvbm5lY3Rpb25zKCk6IHJlYWRvbmx5IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdGlvbnM7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ieUFkZHJlc3MuZ2V0KGFkZHJlc3MpIGFzIHVua25vd24gYXMgSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFkZENvbm5lY3Rpb24oYWRkcmVzczogc3RyaW5nKTogTW9ja0FnZW50Q29ubmVjdGlvbiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0dGhpcy5fYnlBZGRyZXNzLnNldChhZGRyZXNzLCBjb25uKTtcblx0XHR0aGlzLl9jb25uZWN0aW9ucyA9IFsuLi50aGlzLl9jb25uZWN0aW9ucywgeyBhZGRyZXNzLCBuYW1lOiBhZGRyZXNzLCBjbGllbnRJZDogY29ubi5jbGllbnRJZCwgc3RhdHVzOiB7IGtpbmQ6ICdjb25uZWN0ZWQnIH0gfV07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0cmV0dXJuIGNvbm47XG5cdH1cblxuXHRyZW1vdmVDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9ieUFkZHJlc3MuZ2V0KGFkZHJlc3MpO1xuXHRcdGNvbm4/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ieUFkZHJlc3MuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zID0gdGhpcy5fY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gYy5hZGRyZXNzICE9PSBhZGRyZXNzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjb25uIG9mIHRoaXMuX2J5QWRkcmVzcy52YWx1ZXMoKSkge1xuXHRcdFx0Y29ubi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2J5QWRkcmVzcy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gSGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHNhbmRib3g6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiBSb290U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGFnZW50czogW10sXG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XTogeyB0eXBlOiAnb2JqZWN0JywgdGl0bGU6ICdBZ2VudCBTYW5kYm94JyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XTogc2FuZGJveCB9LFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhvdXRTYW5kYm94U2NoZW1hKCk6IFJvb3RTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0YWdlbnRzOiBbXSxcblx0XHRjb25maWc6IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0Ly8gT2xkZXIgLyB0aGlyZC1wYXJ0eSBob3N0IHRoYXQgZG9lc24ndCBhZHZlcnRpc2Ugc2FuZGJveCBrZXlzLlxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7IGN1c3RvbWl6YXRpb25zOiB7IHR5cGU6ICdhcnJheScsIHRpdGxlOiAnQ3VzdG9taXphdGlvbnMnIH0gfSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdH0sXG5cdH07XG59XG5cbmludGVyZmFjZSBJVGVzdFNldHVwIHtcblx0Zm9yd2FyZGVyOiBBZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyO1xuXHRsb2NhbDogTW9ja0FnZW50SG9zdFNlcnZpY2U7XG5cdHJlbW90ZTogTW9ja1JlbW90ZUFnZW50SG9zdFNlcnZpY2U7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIHNldHVwKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIGNvbmZpZ1ZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSk6IElUZXN0U2V0dXAge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBsb2NhbCA9IG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBsb2NhbC5kaXNwb3NlKCkgfSk7XG5cdGNvbnN0IHJlbW90ZSA9IG5ldyBNb2NrUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiByZW1vdGUuZGlzcG9zZSgpIH0pO1xuXHQvLyBEZWZhdWx0IHRoZSBob3N0LXBvbGljeSBnYXRlcyB0byBcImVuZ2luZSBwYXRoXCIgc28gZXhpc3RpbmcgdGVzdHMgdGhhdFxuXHQvLyBvbmx5IHNldCBgY2hhdC5hZ2VudC5zYW5kYm94LipgIGNvbnRpbnVlIHRvIGFzc2VydCBhZ2FpbnN0IHRoZSB1c2VyJ3Ncblx0Ly8gcmF3IGZvcndhcmRlZCB2YWx1ZXMuIFRoZSBTREstc2FuZGJveCBnYXRpbmcgc3ViLXN1aXRlIGJlbG93IG92ZXJyaWRlc1xuXHQvLyBib3RoIGdhdGVzIGV4cGxpY2l0bHkgdG8gZXhlcmNpc2UgdGhlIG90aGVyIGJyYW5jaGVzLlxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSxcblx0XHQuLi5jb25maWdWYWx1ZXMsXG5cdH0pO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlcnZpY2UsIGxvY2FsKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcmVtb3RlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRjb25zdCBjb25uZWN0aW9uc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSwgY29ubmVjdGlvbnNTZXJ2aWNlKTtcblxuXHRjb25zdCBmb3J3YXJkZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2FuZGJveEZvcndhcmRlcikpO1xuXHRyZXR1cm4geyBmb3J3YXJkZXIsIGxvY2FsLCByZW1vdGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbnN1aXRlKCdBZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc3BhdGNoIHdoaWxlIHJvb3RTdGF0ZSBpcyB1bmh5ZHJhdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbG9jYWwgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyBzYW5kYm94IHZhbHVlcyB0byB0aGUgbG9jYWwgaG9zdCB3aGVuIHJvb3RTdGF0ZSBoeWRyYXRlcycsICgpID0+IHtcblx0XHRjb25zdCB7IGxvY2FsIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgeyBbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSk7XG5cblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2NoZW1hLWd1YXJkcyBrZXlzOiBza2lwcyBrZXlzIHRoZSBob3N0IGRvZXMgbm90IGFkdmVydGlzZScsICgpID0+IHtcblx0XHRjb25zdCB7IGxvY2FsIH0gPSBzZXR1cChkaXNwb3NhYmxlcywge1xuXHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0W0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnNdOiBbJ2V4YW1wbGUuY29tJ10sXG5cdFx0fSk7XG5cblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aG91dFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgbm8tb3AgZGlzcGF0Y2ggd2hlbiByb290U3RhdGUgYWxyZWFkeSBtYXRjaGVzIHdvcmtiZW5jaCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmUtZGlzcGF0Y2hlcyB3aGVuIHRoZSB3b3JrYmVuY2ggc2FuZGJveCBzZXR0aW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KTtcblxuXHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSkpO1xuXHRcdC8vIEluaXRpYWwgc3RhdGUgYWxyZWFkeSBtYXRjaGVzIFx1MjE5MiBubyBkaXNwYXRjaC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF0pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF0sIG92ZXJyaWRlczogW10gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcmsgfSB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyB0byByZW1vdGUgY29ubmVjdGlvbnMgd2hlbiB0aGV5IGFwcGVhcicsICgpID0+IHtcblx0XHRjb25zdCB7IHJlbW90ZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0Y29uc3QgcmVtb3RlQ29ubiA9IHJlbW90ZS5hZGRDb25uZWN0aW9uKCdyZW1vdGUuZXhhbXBsZTo5MDAwJyk7XG5cdFx0cmVtb3RlQ29ubi5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW90ZUNvbm4uZGlzcGF0Y2hlZCwgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9IH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYW5zIG91dCB3b3JrYmVuY2ggc2V0dGluZyBjaGFuZ2VzIHRvIGFsbCBjb25uZWN0ZWQgYWdlbnQgaG9zdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblx0XHRjb25zdCByZW1vdGVDb25uID0gcmVtb3RlLmFkZENvbm5lY3Rpb24oJ3JlbW90ZS5leGFtcGxlOjkwMDAnKTtcblx0XHRyZW1vdGVDb25uLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIHRydWUpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyxcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kc10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRQYXRjaCA9IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5FbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkFsbG93VW5zYW5kYm94ZWRDb21tYW5kc106IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmF0KC0xKSwgZXhwZWN0ZWRQYXRjaCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdGVDb25uLmRpc3BhdGNoZWQuYXQoLTEpLCBleHBlY3RlZFBhdGNoKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB1bnJlbGF0ZWQgY29uZmlndXJhdGlvbiBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbG9jYWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgeyBbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSk7XG5cdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLCBbXSk7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09ICdlZGl0b3IuZm9udFNpemUnLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFsnZWRpdG9yLmZvbnRTaXplJ10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFsnZWRpdG9yLmZvbnRTaXplJ10sIG92ZXJyaWRlczogW10gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwdXNoIGJhY2sgYWZ0ZXIgaW5pdGlhbCBwdXNoIHdoZW4gdGhlIGhvc3QgdXBkYXRlcyByb290U3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0Ly8gSW5pdGlhbCBoeWRyYXRpb24gdHJpZ2dlcnMgZXhhY3RseSBvbmUgcHVzaC5cblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFN1YnNlcXVlbnQgcm9vdFN0YXRlIGNoYW5nZXMgZnJvbSB0aGUgaG9zdCBzaWRlIChkaWZmZXJlbnQgc2FuZGJveFxuXHRcdC8vIHZhbHVlcywgdW5yZWxhdGVkIGNvbmZpZyBrZXlzLCBhbnl0aGluZykgbXVzdCBOT1QgdHJpZ2dlciBhbm90aGVyXG5cdFx0Ly8gcHVzaCBcdTIwMTQgdGhhdCdzIHRoZSBwdXNoLWJhY2sgbG9vcCB0aGUgZm9yd2FyZGVyIGlzIGRlc2lnbmVkIHRvIGF2b2lkLlxuXHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmIH0pKTtcblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoeyBbQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHNdOiB0cnVlIH0pKTtcblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1wdXNoIHRvIGV4aXN0aW5nIGNvbm5lY3Rpb25zIHdoZW4gYSBuZXcgcmVtb3RlIGFwcGVhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgeyBbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSk7XG5cdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBmaXJzdFJlbW90ZSA9IHJlbW90ZS5hZGRDb25uZWN0aW9uKCdyZW1vdGUtYS5leGFtcGxlOjkwMDAnKTtcblx0XHRmaXJzdFJlbW90ZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0UmVtb3RlLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZC5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gQWRkaW5nIGEgc2Vjb25kIHJlbW90ZSBtdXN0IG5vdCBjYXVzZSBhIHJlZHVuZGFudCBwdXNoIHRvIHRoZSBsb2NhbFxuXHRcdC8vIGhvc3Qgb3IgdG8gdGhlIGFscmVhZHktcHVzaGVkIGZpcnN0IHJlbW90ZS5cblx0XHRjb25zdCBzZWNvbmRSZW1vdGUgPSByZW1vdGUuYWRkQ29ubmVjdGlvbigncmVtb3RlLWIuZXhhbXBsZTo5MDAwJyk7XG5cdFx0c2Vjb25kUmVtb3RlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0UmVtb3RlLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kUmVtb3RlLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW5zIHVwIHRoZSBwZW5kaW5nIGxpc3RlbmVyIHdoZW4gYSByZW1vdGUgZGlzY29ubmVjdHMgYmVmb3JlIGh5ZHJhdGluZycsICgpID0+IHtcblx0XHRjb25zdCB7IHJlbW90ZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0Y29uc3QgcmVtb3RlQ29ubiA9IHJlbW90ZS5hZGRDb25uZWN0aW9uKCdyZW1vdGUuZXhhbXBsZTo5MDAwJyk7XG5cdFx0Ly8gQ29ubmVjdGlvbiBuZXZlciBoeWRyYXRlcyBcdTIxOTIgZm9yd2FyZGVyIGlzIHN0aWxsIHN1YnNjcmliZWQgdG8gaXRzXG5cdFx0Ly8gcm9vdFN0YXRlLm9uRGlkQ2hhbmdlIHdhaXRpbmcgZm9yIHRoZSBzY2hlbWEuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdGVDb25uLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdHJlbW90ZS5yZW1vdmVDb25uZWN0aW9uKCdyZW1vdGUuZXhhbXBsZTo5MDAwJyk7XG5cdFx0Ly8gSWYgdGhlIGxpc3RlbmVyIHdhc24ndCBkaXNwb3NlZCwgdGhlIGxlYWsgY2hlY2tlciAoc2VlXG5cdFx0Ly8gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKSB3b3VsZCBmbGFnIGl0IGF0IHRlYXJkb3duLlxuXHRcdC8vIEZpcmluZyBoZXJlIHdvdWxkIGFsc28gdGhyb3cgaWYgdGhlIGNvbm5lY3Rpb24gd2FzIHN0aWxsIG9ic2VydmVkXG5cdFx0Ly8gYWZ0ZXIgcmVtb3ZhbCBcdTIwMTQgZXhwbGljaXRseSBhc3NlcnQgbm8gbGF0ZSBkaXNwYXRjaCBoYXBwZW5zLlxuXHRcdHJlbW90ZUNvbm4uc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3RlQ29ubi5kaXNwYXRjaGVkLCBbXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTREstc2FuZGJveCBnYXRpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZm9yd2FyZHMgdXNlciB2YWx1ZXMgdmVyYmF0aW0gd2hlbiBjdXN0b21UZXJtaW5hbFRvb2wgaXMgZW5hYmxlZCwgcmVnYXJkbGVzcyBvZiBzZGtTYW5kYm94JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLkFsbG93TmV0d29yayxcblx0XHRcdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiB0cnVlLFxuXHRcdFx0XHRbQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLFxuXHRcdFx0fSk7XG5cblx0XHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcmsgfSB9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYW4gZW1wdHkgc2FuZGJveCBvYmplY3Qgd2hlbiBib3RoIGN1c3RvbVRlcm1pbmFsVG9vbCBhbmQgc2RrU2FuZGJveCBhcmUgb2ZmIChkZWZhdWx0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9jYWwgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiBmYWxzZSxcblx0XHRcdFx0Ly8gc2RrU2FuZGJveCB1bnNldCBcdTIxOTIgZGVmYXVsdHMgdG8gJ29mZicuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSG9zdCBhbHJlYWR5IGNhcnJpZXMgdmFsdWVzIGZyb20gYSBwcmlvciBzZXNzaW9uLlxuXHRcdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7fSB9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb3ZlcnJpZGVzIEVuYWJsZWQvV2luZG93c0VuYWJsZWQgd2l0aCB0aGUgc2RrU2FuZGJveCB2YWx1ZSB3aGVuIHNldCB0byBgb25gJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0Ly8gVXNlciBoYXMgdGhlIGVuZ2luZSBzYW5kYm94IG9mZiBlbnRpcmVseSBcdTIwMTQgdGhlIFNESyBzYW5kYm94XG5cdFx0XHRcdC8vIHNldHRpbmcgc2hvdWxkIHN0aWxsIGRyaXZlIHRoZSBTREsgcGF0aCBpbmRlcGVuZGVudGx5LlxuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLFxuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kc106IHRydWUsXG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdH0pO1xuXG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkFsbG93VW5zYW5kYm94ZWRDb21tYW5kc106IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ292ZXJyaWRlcyBFbmFibGVkL1dpbmRvd3NFbmFibGVkIHdpdGggYGFsbG93TmV0d29ya2Agd2hlbiBzZGtTYW5kYm94IGlzIHNldCB0byB0aGF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRbQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZF06IGZhbHNlLFxuXHRcdFx0XHRbQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrLFxuXHRcdFx0fSk7XG5cblx0XHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XToge1xuXHRcdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcmssXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcmssXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLWRpc3BhdGNoZXMgd2hlbiBzZGtTYW5kYm94IHRvZ2dsZXMgZnJvbSBgb25gIHRvIGBvZmZgJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiBmYWxzZSxcblx0XHRcdFx0W0FnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoe1xuXHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5FbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdH0pKTtcblx0XHRcdC8vIEluaXRpYWwgc3RhdGUgYWxyZWFkeSBtYXRjaGVzIFx1MjE5MiBubyBkaXNwYXRjaC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW10pO1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZik7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZCxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF0pLFxuXHRcdFx0XHRjaGFuZ2U6IHsga2V5czogW0FnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7fSB9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtZGlzcGF0Y2hlcyB3aGVuIHNka1NhbmRib3ggc3dpdGNoZXMgYmV0d2VlbiBgb25gIGFuZCBgYWxsb3dOZXR3b3JrYCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9jYWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywge1xuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdH0pO1xuXHRcdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHtcblx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuV2luZG93c0VuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcmspO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdKSxcblx0XHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7XG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5FbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLkFsbG93TmV0d29yayxcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LldpbmRvd3NFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLkFsbG93TmV0d29yayxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtZGlzcGF0Y2hlcyB3aGVuIGN1c3RvbVRlcm1pbmFsVG9vbCBpcyB0b2dnbGVkIHdoaWxlIHNka1NhbmRib3ggaXMgb2ZmJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiBmYWxzZSxcblx0XHRcdFx0W0FnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHRcdH0pO1xuXHRcdFx0Ly8gQm90aCBnYXRlcyBvZmYgXHUyMTkyIGZvcndhcmRlciBwdXNoZXMgYHt9YCwgd2hpY2ggY2xlYXJzIHRoZSBob3N0J3Ncblx0XHRcdC8vIHByaW9yIHZhbHVlLlxuXHRcdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XToge30gfSxcblx0XHRcdH1dKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgdGhlIGhvc3QgYXBwbHlpbmcgdGhhdCBkaXNwYXRjaCAodGhlIG1vY2sgZG9lcyBub3QgZG8gdGhpc1xuXHRcdFx0Ly8gYXV0b21hdGljYWxseSkuIFdpdGhvdXQgdGhpcywgdGhlIGVxdWFscy1jaGVjayBpbnNpZGUgX3RyeVB1c2ggd291bGRcblx0XHRcdC8vIHNob3J0LWNpcmN1aXQgdGhlIHNlY29uZCBwdXNoIGJlY2F1c2UgdGhlIGhvc3QncyB2aWV3IG9mIHRoZSBzYW5kYm94XG5cdFx0XHQvLyB2YWx1ZXMgd291bGQgc3RpbGwgYmUgdGhlIHN0YWxlIHByZS1jbGVhciB2YWx1ZS5cblx0XHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7fSkpO1xuXG5cdFx0XHQvLyBGbGlwIGN1c3RvbVRlcm1pbmFsVG9vbCBPTiBcdTIxOTIgZm9yd2FyZGVyIHNob3VsZCBwdXNoIHRoZSByZWFsXG5cdFx0XHQvLyBzYW5kYm94IHZhbHVlcyB2ZXJiYXRpbSAoZW5naW5lIHBhdGggbmVlZHMgdGhlbSkuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkLCB0cnVlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZF0pLFxuXHRcdFx0XHRjaGFuZ2U6IHsga2V5czogW0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmF0KC0xKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9IH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxxQ0FBdUQseUJBQXlCO0FBQ3pGLFNBQVMsbURBQW1EO0FBQzVELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsK0JBQStEO0FBQ3hFLFNBQVMsMkJBQTJCLDJCQUEyQjtBQUMvRCxTQUFTLGtCQUFrQjtBQUkzQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDBCQUEwQiw2QkFBNkI7QUFDaEUsU0FBUyxpQ0FBaUM7QUFJMUMsTUFBTSxvQkFBb0I7QUFBQSxFQUExQjtBQUdDLFNBQWdCLFdBQVc7QUFDM0IsU0FBTyxhQUFzRyxDQUFDO0FBRzlHLFNBQWlCLHdCQUF3QixJQUFJLFFBQW1CO0FBRWhFLFNBQVMsYUFBNEMsTUFBTTtBQUMxRCxZQUFNLE9BQU87QUFDYixhQUFPO0FBQUEsUUFDTixJQUFJLFFBQVE7QUFBRSxpQkFBTyxL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
