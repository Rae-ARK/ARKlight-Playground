import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ActionType, isSessionAction } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { CustomizationLoadStatus, CustomizationType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { StateComponents } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { sessionReducer } from "../../../../../../platform/agentHost/common/state/sessionReducers.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { PromptsType } from "../../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { URI } from "../../../../../../base/common/uri.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
import { RemoteAgentPluginController } from "../../browser/remoteAgentHostCustomizationHarness.js";
import { CustomizationHarnessServiceBase } from "../../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { MockPromptsService } from "../../../../../../workbench/contrib/chat/test/common/promptSyntax/service/mockPromptsService.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { AgentCustomizationItemProvider } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js";
import { ContributionEnablementState } from "../../../../../../workbench/contrib/chat/common/enablement.js";
class MockAgentConnection extends mock() {
  constructor() {
    super();
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this.onDidNotification = Event.None;
    this.clientId = "test-client";
    this._rootStateValue = { agents: [] };
    this._sessionStates = /* @__PURE__ */ new Map();
    this.dispatchedActions = [];
    const self = this;
    this.rootState = {
      get value() {
        return self._rootStateValue;
      },
      get verifiedValue() {
        return self._rootStateValue;
      },
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
  }
  setRootState(rootState) {
    this._rootStateValue = rootState;
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  getSubscriptionUnmanaged(kind, resource) {
    if (kind !== StateComponents.Session) {
      return void 0;
    }
    const self = this;
    const channel = resource.toString();
    if (!self._sessionStates.has(channel)) {
      return void 0;
    }
    const subscription = {
      get value() {
        return self._sessionStates.get(channel);
      },
      get verifiedValue() {
        return self._sessionStates.get(channel);
      },
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    return subscription;
  }
  fireAction(envelope) {
    if (isSessionAction(envelope.action)) {
      const current = this._sessionStates.get(envelope.channel) ?? {};
      this._sessionStates.set(envelope.channel, sessionReducer(current, envelope.action));
    }
    this._onDidAction.fire(envelope);
  }
  dispose() {
    this._onDidAction.dispose();
  }
}
function createNotificationService() {
  return new class extends mock() {
    error() {
      throw new Error("Unexpected notification error");
    }
  }();
}
const testSessionResource = URI.parse("agent-host-copilotcli:/session-1");
const agentHostProviderId = "copilotcli";
const agentHostSessionId = `${agentHostProviderId}:/session-1`;
function createAgentInfo(customizations) {
  return {
    provider: agentHostProviderId,
    displayName: "Copilot",
    description: "Test Agent",
    models: [],
    customizations: [...customizations]
  };
}
function createTestCustomAgentsService(connection, rootCustomizations) {
  const onDidChangeCustomizations = Event.map(
    Event.filter(
      connection.onDidAction,
      (envelope) => envelope.action.type === ActionType.SessionCustomizationsChanged || envelope.action.type === ActionType.SessionCustomizationUpdated
    ),
    () => void 0
  );
  const onDidChangeCustomAgents = Event.map(
    Event.filter(
      connection.onDidAction,
      (envelope) => envelope.action.type === ActionType.SessionCustomizationsChanged || envelope.action.type === ActionType.SessionCustomizationUpdated
    ),
    () => void 0
  );
  return {
    _serviceBrand: void 0,
    onDidChangeCustomAgents,
    onDidChangeCustomizations,
    getCustomAgents: () => [],
    getCustomizations: (sessionResource) => {
      const provider = sessionResource.scheme.replace(/^agent-host-/, "");
      const sessionChannel = `${provider}:${sessionResource.path}`;
      const sessionState = connection.getSubscriptionUnmanaged(StateComponents.Session, URI.parse(sessionChannel))?.value;
      if (!sessionState || sessionState instanceof Error) {
        return [...rootCustomizations];
      }
      return [...rootCustomizations, ...sessionState.customizations ?? []];
    },
    getWorkingDirectory(sessionResource) {
      return void 0;
    },
    getWorkingDirectories(_sessionResource) {
      return [];
    },
    getMcpServers(_sessionResource) {
      return [];
    },
    addMcpServer(_sessionResource, _name, _config) {
    },
    authenticateMcpServer(_sessionResource, _serverId) {
      return Promise.resolve(false);
    },
    getMcpServerEnablement() {
      return ContributionEnablementState.EnabledProfile;
    },
    setMcpServerEnablement() {
    },
    prepareMcpServersForTurn() {
    },
    async showMcpServerLog(_sessionResource, _serverId, beforeShow) {
      await beforeShow?.();
    }
  };
}
suite("RemoteAgentHostCustomizationHarness", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("removeConfiguredPlugin keeps sibling scopes for the same URI", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const controller = disposables.add(new RemoteAgentPluginController(
      "Test Host",
      "test-authority",
      connection,
      {},
      createNotificationService(),
      {}
    ));
    const pluginA = { type: CustomizationType.Plugin, id: "file:///plugins/shared", uri: "file:///plugins/shared", name: "Shared Plugin", enabled: true };
    connection.setRootState({
      agents: [],
      config: {
        schema: { type: "object", properties: {} },
        values: {
          customizations: [
            { uri: "file:///plugins/shared", displayName: "Shared Plugin" },
            { uri: "file:///plugins/other", displayName: "Other Plugin" }
          ]
        }
      }
    });
    await controller.removeConfiguredPlugin(pluginA);
    assert.deepStrictEqual(connection.dispatchedActions, [{
      channel: "ahp-root://",
      action: {
        type: ActionType.RootConfigChanged,
        config: {
          customizations: [{ uri: "file:///plugins/other", displayName: "Other Plugin" }]
        }
      }
    }]);
  });
  test("provider assigns distinct item keys to plugins with different URIs", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const pluginA = { type: CustomizationType.Plugin, id: "file:///plugins/a", uri: "file:///plugins/a", name: "Plugin A", enabled: true };
    const pluginB = { type: CustomizationType.Plugin, id: "file:///plugins/b", uri: "file:///plugins/b", name: "Plugin B", enabled: true };
    connection.setRootState({
      agents: [createAgentInfo([pluginA, pluginB])]
    });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [pluginA, pluginB])
    ));
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
  });
  test("provider keeps client-synced entries distinct from host-owned entries", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const hostScoped = { type: CustomizationType.Plugin, id: "file:///plugins/shared", uri: "file:///plugins/shared", name: "Shared Plugin", enabled: true };
    const synced = {
      ...hostScoped,
      clientId: "test-client"
    };
    connection.setRootState({
      agents: [createAgentInfo([hostScoped])]
    });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [hostScoped])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
  });
  test("provider assigns client group to client-synced entries and host group to host entries", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const hostPlugin = { type: CustomizationType.Plugin, id: "file:///plugins/host-plugin", uri: "file:///plugins/host-plugin", name: "Host Plugin", enabled: true };
    const clientPlugin = { type: CustomizationType.Plugin, id: "file:///plugins/client-plugin", uri: "file:///plugins/client-plugin", name: "Client Plugin", enabled: true };
    const synced = {
      ...clientPlugin,
      clientId: "test-client"
    };
    connection.setRootState({
      agents: [createAgentInfo([hostPlugin])]
    });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [hostPlugin])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    const hostItem = items.find((i) => i.name === "Host Plugin");
    const clientItem = items.find((i) => i.name === "Client Plugin");
    assert.ok(hostItem, "should have a host item");
    assert.ok(clientItem, "should have a client item");
    assert.strictEqual(hostItem.groupKey, "remote-host");
    assert.strictEqual(clientItem.groupKey, "remote-client");
  });
  test("provider hides synthetic bundle but still expands its contents", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundleRef = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
    const synced = {
      ...bundleRef,
      clientId: "test-client"
    };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const skillFileUri = URI.parse(`${bundleUri}/skills/my-skill`);
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(resources) {
        return resources.map((r) => {
          if (r.resource.path.endsWith("/skills")) {
            return {
              success: true,
              stat: {
                resource: r.resource,
                name: "skills",
                isFile: false,
                isDirectory: true,
                isSymbolicLink: false,
                readonly: false,
                mtime: 0,
                ctime: 0,
                size: 0,
                children: [{
                  name: "my-skill",
                  resource: skillFileUri,
                  isFile: false,
                  isDirectory: true,
                  isSymbolicLink: false,
                  readonly: false,
                  mtime: 0,
                  ctime: 0,
                  size: 0,
                  children: []
                }]
              }
            };
          }
          return { success: false, stat: void 0 };
        });
      }
      async readFile(resource) {
        if (resource.path.endsWith("/my-skill/SKILL.md")) {
          const content = "---\n---\n";
          return { resource, name: "SKILL.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
        }
        throw new Error("ENOENT");
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.ok(!items.some((i) => i.name === "VS Code Synced Data"), "synthetic bundle should be hidden");
    const skillItem = items.find((i) => i.name === "my-skill");
    assert.ok(skillItem, "expanded skill from bundle should be present");
    assert.strictEqual(skillItem.groupKey, "remote-client", "expanded children from bundle should be in client group");
  });
  test("toRemoteUri preserves synced-customization scheme URIs", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundleRef = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data", enabled: true };
    const synced = {
      ...bundleRef,
      clientId: "test-client"
    };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [synced]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 0);
  });
  test("provider propagates status and enabled from session customizations", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const pluginRef = { type: CustomizationType.Plugin, id: "file:///plugins/my-plugin", uri: "file:///plugins/my-plugin", name: "My Plugin", enabled: true };
    const sessionCustomization = {
      ...pluginRef,
      enabled: false,
      load: { kind: CustomizationLoadStatus.Error, message: "something went wrong" }
    };
    connection.setRootState({ agents: [createAgentInfo([pluginRef])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [pluginRef])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [sessionCustomization]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const sessionItem = items.find((i) => i.status === "error");
    assert.ok(sessionItem, "should have an item with error status");
    assert.strictEqual(sessionItem.statusMessage, "something went wrong");
  });
  test("provider fires one change event on SessionCustomizationsChanged action", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const pluginRef = { type: CustomizationType.Plugin, id: "file:///plugins/host", uri: "file:///plugins/host", name: "Host Plugin", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([pluginRef])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [pluginRef])
    ));
    let changeCount = 0;
    disposables.add(provider.onDidChange(() => changeCount++));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [pluginRef]
      }
    });
    assert.strictEqual(changeCount, 1, "should fire one change event from customization service");
  });
  test("removeConfiguredPlugin dispatches updated list without the removed plugin", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const controller = disposables.add(new RemoteAgentPluginController(
      "Test Host",
      "test-authority",
      connection,
      {},
      createNotificationService(),
      {}
    ));
    const pluginB = { type: CustomizationType.Plugin, id: "file:///plugins/b", uri: "file:///plugins/b", name: "Plugin B", enabled: true };
    connection.setRootState({
      agents: [],
      config: {
        schema: { type: "object", properties: {} },
        values: {
          customizations: [
            { uri: "file:///plugins/a", displayName: "Plugin A" },
            { uri: "file:///plugins/b", displayName: "Plugin B" },
            { uri: "file:///plugins/c", displayName: "Plugin C" }
          ]
        }
      }
    });
    await controller.removeConfiguredPlugin(pluginB);
    assert.strictEqual(connection.dispatchedActions.length, 1);
    assert.deepStrictEqual(connection.dispatchedActions[0], {
      channel: "ahp-root://",
      action: {
        type: ActionType.RootConfigChanged,
        config: {
          customizations: [
            { uri: "file:///plugins/a", displayName: "Plugin A" },
            { uri: "file:///plugins/c", displayName: "Plugin C" }
          ]
        }
      }
    });
  });
  test("multiple client-synced entries all appear with distinct keys", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const clientA = { type: CustomizationType.Plugin, id: "file:///plugins/client-a", uri: "file:///plugins/client-a", name: "Client A", enabled: true };
    const clientB = { type: CustomizationType.Plugin, id: "file:///plugins/client-b", uri: "file:///plugins/client-b", name: "Client B", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const fileService = new class extends mock() {
      async canHandleResource() {
        return false;
      }
      async resolveAll() {
        return [];
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [
          { ...clientA, clientId: "test-client" },
          { ...clientB, clientId: "test-client" }
        ]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    assert.strictEqual(items.length, 2);
    assert.ok(items.find((i) => i.name === "Client A"), "should have Client A");
    assert.ok(items.find((i) => i.name === "Client B"), "should have Client B");
    const keys = items.map((i) => i.itemKey);
    assert.strictEqual(new Set(keys).size, 2, "all item keys should be unique");
  });
  test("provider parses skill metadata, rewrites folder URIs to SKILL.md, and skips unreadable folder skills", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const plugin = { type: CustomizationType.Plugin, id: "file:///plugins/skills-bundle", uri: "file:///plugins/skills-bundle", name: "Skills Bundle", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([plugin])] });
    const skillsDirChildren = [
      { name: "valid-skill", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/valid-skill"), isFile: false, isDirectory: true, isSymbolicLink: false, children: void 0 },
      { name: "broken-skill", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/broken-skill"), isFile: false, isDirectory: true, isSymbolicLink: false, children: void 0 },
      { name: "legacy.skill.md", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/legacy.skill.md"), isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => {
          if (resource.path.endsWith("/skills")) {
            return {
              success: true,
              stat: { name: "skills", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: skillsDirChildren }
            };
          }
          return { success: false };
        });
      }
      async readFile(resource) {
        if (resource.path.endsWith("/valid-skill/SKILL.md")) {
          const content = "---\nname: Pretty Name\ndescription: A friendly skill description\n---\n\n# Body\n";
          return { resource, name: "SKILL.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
        }
        throw new Error("ENOENT");
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [plugin])
    ));
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const skillItems = items.filter((i) => i.type === PromptsType.skill);
    assert.deepStrictEqual(
      skillItems.map((i) => ({ name: i.name, description: i.description, uri: i.uri.toString() })).sort((a, b) => a.name.localeCompare(b.name)),
      [
        { name: "Pretty Name", description: "A friendly skill description", uri: "vscode-agent-host://test/plugins/skills-bundle/skills/valid-skill/SKILL.md" }
      ].sort((a, b) => a.name.localeCompare(b.name))
    );
    const expectedPluginUri = "vscode-agent-host://test-authority/plugins/skills-bundle?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0";
    for (const skillItem of skillItems) {
      assert.strictEqual(skillItem.pluginUri?.toString(), expectedPluginUri, `skill ${skillItem.name} should carry pluginUri`);
    }
  });
  test("provider recovers original provenance for synthetic-bundle children via the origin resolver", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundle = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const ruleResource = URI.parse(`${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority/rules/my-rule.md`);
    const rulesDirChildren = [
      { name: "my-rule.md", resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => resource.path.endsWith("/rules") ? { success: true, stat: { name: "rules", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: rulesDirChildren } } : { success: false });
      }
      async readFile(resource) {
        const content = "---\nname: My Rule\ndescription: A synced rule\n---\n";
        return { resource, name: "my-rule.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
      }
    }();
    const originUri = URI.parse("file:///home/user/.config/rules/my-rule.md");
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      (syncedUri) => syncedUri.toString() === ruleResource.toString() ? { uri: originUri, source: "extension", extensionId: "pub.ext", pluginUri: void 0 } : void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [{ ...bundle, clientId: "test-client" }]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const rule = items.find((i) => i.type === PromptsType.instructions);
    assert.ok(rule, "the synced rule should be expanded");
    assert.deepStrictEqual(
      { uri: rule.uri.toString(), source: rule.source, extensionId: rule.extensionId, groupKey: rule.groupKey },
      { uri: originUri.toString(), source: "extension", extensionId: "pub.ext", groupKey: void 0 }
    );
  });
  test("provider keeps client group for recovered user provenance", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundle = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const ruleResource = URI.parse(`${bundleUri}/rules/user-rule.instructions.md`);
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => resource.path.endsWith("/rules") ? { success: true, stat: { name: "rules", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: [{ name: "user-rule.instructions.md", resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }] } } : { success: false });
      }
      async readFile(resource) {
        const content = "User rule";
        return { resource, name: "user-rule.instructions.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
      }
    }();
    const originUri = URI.parse("file:///home/user/.copilot/instructions/user-rule.instructions.md");
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      (syncedUri) => syncedUri.toString() === ruleResource.toString() ? { uri: originUri, source: "user", extensionId: void 0, pluginUri: void 0 } : void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [{ ...bundle, clientId: "test-client" }]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const rule = items.find((item) => item.type === PromptsType.instructions);
    assert.ok(rule);
    assert.deepStrictEqual({
      uri: rule.uri.toString(),
      source: rule.source,
      groupKey: rule.groupKey
    }, {
      uri: originUri.toString(),
      source: "user",
      groupKey: "remote-client"
    });
  });
  test("provider leaves synthetic-bundle children unchanged when no origin is known", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
    const bundle = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: "VS Code Synced Data", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([])] });
    const ruleResource = URI.parse(`${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority/rules/my-rule.md`);
    const rulesDirChildren = [
      { name: "my-rule.md", resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => resource.path.endsWith("/rules") ? { success: true, stat: { name: "rules", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: rulesDirChildren } } : { success: false });
      }
      async readFile(resource) {
        const content = "---\nname: My Rule\n---\n";
        return { resource, name: "my-rule.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [])
    ));
    connection.fireAction({
      channel: agentHostSessionId,
      serverSeq: 1,
      origin: void 0,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: [{ ...bundle, clientId: "test-client" }]
      }
    });
    const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
    const rule = items.find((i) => i.type === PromptsType.instructions);
    assert.ok(rule, "the synced rule should be expanded");
    assert.strictEqual(rule.uri.toString(), ruleResource.toString());
  });
  test("CustomizationHarnessService.getSlashCommands prefixes discovered skill names with the plugin id", async () => {
    const connection = disposables.add(new MockAgentConnection());
    const plugin = { type: CustomizationType.Plugin, id: "file:///plugins/skills-bundle", uri: "file:///plugins/skills-bundle", name: "Skills Bundle", enabled: true };
    connection.setRootState({ agents: [createAgentInfo([plugin])] });
    const skillsDirChildren = [
      { name: "lint", resource: URI.parse("vscode-agent-host://test/plugins/skills-bundle/skills/lint"), isFile: false, isDirectory: true, isSymbolicLink: false, children: void 0 }
    ];
    const fileService = new class extends mock() {
      async canHandleResource() {
        return true;
      }
      async resolveAll(toResolve) {
        return toResolve.map(({ resource }) => {
          if (resource.path.endsWith("/skills")) {
            return {
              success: true,
              stat: { name: "skills", resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: skillsDirChildren }
            };
          }
          return { success: false };
        });
      }
      async readFile(resource) {
        if (resource.path.endsWith("/lint/SKILL.md")) {
          const content = "---\nname: Lint\ndescription: A lint skill\n---\n";
          return { resource, name: "SKILL.md", value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: "", size: content.length, readonly: false, locked: false, executable: false };
        }
        throw new Error("ENOENT");
      }
    }();
    const provider = disposables.add(new AgentCustomizationItemProvider(
      "test-authority",
      () => {
      },
      void 0,
      fileService,
      new NullLogService(),
      createTestCustomAgentsService(connection, [plugin])
    ));
    const harnessId = "remote-agent-host-test";
    const testSessionResource2 = URI.parse("remote-agent-host-test:///test-session");
    const descriptor = {
      id: harnessId,
      label: "Remote Agent Host (test)",
      icon: ThemeIcon.fromId(Codicon.remote.id),
      itemProvider: provider
    };
    const harnessService = disposables.add(new CustomizationHarnessServiceBase([descriptor], harnessId, new MockPromptsService()));
    const commands = await harnessService.getSlashCommands(testSessionResource2, CancellationToken.None);
    const skillCommand = commands.find((c) => c.type === PromptsType.skill);
    assert.ok(skillCommand, "should have a skill slash command");
    assert.strictEqual(skillCommand.name, "skills-bundle:lint", "skill command name should be plugin-prefixed");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC90ZXN0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0Q3VzdG9taXphdGlvbkhhcm5lc3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIGlzU2Vzc2lvbkFjdGlvbiwgdHlwZSBBY3Rpb25FbnZlbG9wZSwgdHlwZSBJTm90aWZpY2F0aW9uLCB0eXBlIFN0YXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIHR5cGUgQWdlbnRJbmZvLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUm9vdFN0YXRlLCB0eXBlIFNlc3Npb25TdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgU3RhdGVDb21wb25lbnRzLCB0eXBlIENvbXBvbmVudFRvU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBzZXNzaW9uUmVkdWNlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblJlZHVjZXJzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgdHlwZSBJRmlsZUNvbnRlbnQsIHR5cGUgSUZpbGVTdGF0LCB0eXBlIElGaWxlU3RhdFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudFBsdWdpbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25IYXJuZXNzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZUJhc2UsIElIYXJuZXNzRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL21vY2tQcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuXG5jbGFzcyBNb2NrQWdlbnRDb25uZWN0aW9uIGV4dGVuZHMgbW9jazxJQWdlbnRDb25uZWN0aW9uPigpIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50O1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZE5vdGlmaWNhdGlvbiA9IEV2ZW50Lk5vbmUgYXMgRXZlbnQ8SU5vdGlmaWNhdGlvbj47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3QtY2xpZW50JztcblxuXHRwcml2YXRlIF9yb290U3RhdGVWYWx1ZTogUm9vdFN0YXRlID0geyBhZ2VudHM6IFtdIH07XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJvb3RTdGF0ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25TdGF0ZT4oKTtcblxuXHRyZWFkb25seSBkaXNwYXRjaGVkQWN0aW9uczogeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogU3RhdGVBY3Rpb24gfVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHR0aGlzLnJvb3RTdGF0ZSA9IHtcblx0XHRcdGdldCB2YWx1ZSgpOiBSb290U3RhdGUgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpOiBSb290U3RhdGUgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHR9XG5cblx0c2V0Um9vdFN0YXRlKHJvb3RTdGF0ZTogUm9vdFN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdFN0YXRlVmFsdWUgPSByb290U3RhdGU7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWRBY3Rpb25zLnB1c2goeyBjaGFubmVsLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8VCBleHRlbmRzIFN0YXRlQ29tcG9uZW50cz4oa2luZDogVCwgcmVzb3VyY2U6IFVSSSk6IElBZ2VudFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGtpbmQgIT09IFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRjb25zdCBjaGFubmVsID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAoIXNlbGYuX3Nlc3Npb25TdGF0ZXMuaGFzKGNoYW5uZWwpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+ID0ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fc2Vzc2lvblN0YXRlcy5nZXQoY2hhbm5lbCk7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Nlc3Npb25TdGF0ZXMuZ2V0KGNoYW5uZWwpOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRyZXR1cm4gc3Vic2NyaXB0aW9uIGFzIElBZ2VudFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPjtcblx0fVxuXG5cdGZpcmVBY3Rpb24oZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogdm9pZCB7XG5cdFx0aWYgKGlzU2Vzc2lvbkFjdGlvbihlbnZlbG9wZS5hY3Rpb24pKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoZW52ZWxvcGUuY2hhbm5lbCkgPz8ge30gYXMgU2Vzc2lvblN0YXRlO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlcy5zZXQoZW52ZWxvcGUuY2hhbm5lbCwgc2Vzc2lvblJlZHVjZXIoY3VycmVudCwgZW52ZWxvcGUuYWN0aW9uKSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpOiBJTm90aWZpY2F0aW9uU2VydmljZSB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RpZmljYXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBlcnJvcigpOiBuZXZlciB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbm90aWZpY2F0aW9uIGVycm9yJyk7XG5cdFx0fVxuXHR9O1xufVxuY29uc3QgdGVzdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uLTEnKTtcbmNvbnN0IGFnZW50SG9zdFByb3ZpZGVySWQgPSAnY29waWxvdGNsaSc7XG5jb25zdCBhZ2VudEhvc3RTZXNzaW9uSWQgPSBgJHthZ2VudEhvc3RQcm92aWRlcklkfTovc2Vzc2lvbi0xYDtcblxuZnVuY3Rpb24gY3JlYXRlQWdlbnRJbmZvKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBBZ2VudEluZm8ge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVyOiBhZ2VudEhvc3RQcm92aWRlcklkLFxuXHRcdGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsXG5cdFx0ZGVzY3JpcHRpb246ICdUZXN0IEFnZW50Jyxcblx0XHRtb2RlbHM6IFtdLFxuXHRcdGN1c3RvbWl6YXRpb25zOiBbLi4uY3VzdG9taXphdGlvbnNdLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uOiBNb2NrQWdlbnRDb25uZWN0aW9uLCByb290Q3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSBFdmVudC5tYXAoXG5cdFx0RXZlbnQuZmlsdGVyKGNvbm5lY3Rpb24ub25EaWRBY3Rpb24sIGVudmVsb3BlID0+XG5cdFx0XHRlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkXG5cdFx0XHR8fCBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWRcblx0XHQpLFxuXHRcdCgpID0+IHVuZGVmaW5lZCxcblx0KTtcblxuXHRjb25zdCBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IEV2ZW50Lm1hcChcblx0XHRFdmVudC5maWx0ZXIoY29ubmVjdGlvbi5vbkRpZEFjdGlvbiwgZW52ZWxvcGUgPT5cblx0XHRcdGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRcblx0XHRcdHx8IGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZFxuXHRcdCksXG5cdFx0KCkgPT4gdW5kZWZpbmVkLFxuXHQpO1xuXG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzLFxuXHRcdG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMsXG5cdFx0Z2V0Q3VzdG9tQWdlbnRzOiAoKSA9PiBbXSxcblx0XHRnZXRDdXN0b21pemF0aW9uczogKHNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHNlc3Npb25SZXNvdXJjZS5zY2hlbWUucmVwbGFjZSgvXmFnZW50LWhvc3QtLywgJycpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNoYW5uZWwgPSBgJHtwcm92aWRlcn06JHtzZXNzaW9uUmVzb3VyY2UucGF0aH1gO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQoU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIFVSSS5wYXJzZShzZXNzaW9uQ2hhbm5lbCkpPy52YWx1ZTtcblx0XHRcdGlmICghc2Vzc2lvblN0YXRlIHx8IHNlc3Npb25TdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBbLi4ucm9vdEN1c3RvbWl6YXRpb25zXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbLi4ucm9vdEN1c3RvbWl6YXRpb25zLCAuLi4oc2Vzc2lvblN0YXRlLmN1c3RvbWl6YXRpb25zID8/IFtdKV07XG5cdFx0fSxcblx0XHRnZXRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0XHRnZXRXb3JraW5nRGlyZWN0b3JpZXMoX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0sXG5cdFx0Z2V0TWNwU2VydmVycyhfc2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9LFxuXHRcdGFkZE1jcFNlcnZlcihfc2Vzc2lvblJlc291cmNlOiBVUkksIF9uYW1lOiBzdHJpbmcsIF9jb25maWcpIHtcblx0XHRcdC8vIG5vLW9wXG5cdFx0fSxcblx0XHRhdXRoZW50aWNhdGVNY3BTZXJ2ZXIoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfc2VydmVySWQ6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fSxcblx0XHRnZXRNY3BTZXJ2ZXJFbmFibGVtZW50KCkge1xuXHRcdFx0cmV0dXJuIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZTtcblx0XHR9LFxuXHRcdHNldE1jcFNlcnZlckVuYWJsZW1lbnQoKSB7IH0sXG5cdFx0cHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKCkgeyB9LFxuXHRcdGFzeW5jIHNob3dNY3BTZXJ2ZXJMb2coX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfc2VydmVySWQ6IHN0cmluZywgYmVmb3JlU2hvdz86ICgpID0+IFByb21pc2U8dm9pZD4pIHtcblx0XHRcdGF3YWl0IGJlZm9yZVNob3c/LigpO1xuXHRcdH0sXG5cdH07XG59XG5cblxuXG5zdWl0ZSgnUmVtb3RlQWdlbnRIb3N0Q3VzdG9taXphdGlvbkhhcm5lc3MnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVtb3ZlQ29uZmlndXJlZFBsdWdpbiBrZWVwcyBzaWJsaW5nIHNjb3BlcyBmb3IgdGhlIHNhbWUgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVtb3RlQWdlbnRQbHVnaW5Db250cm9sbGVyKFxuXHRcdFx0J1Rlc3QgSG9zdCcsXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdHt9IGFzIElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRcdGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdHt9IGFzIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHBsdWdpbkE6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6ICdmaWxlOi8vL3BsdWdpbnMvc2hhcmVkJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL3NoYXJlZCcsIG5hbWU6ICdTaGFyZWQgUGx1Z2luJywgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHtcblx0XHRcdGFnZW50czogW10sXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHtcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2hhcmVkJywgZGlzcGxheU5hbWU6ICdTaGFyZWQgUGx1Z2luJyB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvb3RoZXInLCBkaXNwbGF5TmFtZTogJ090aGVyIFBsdWdpbicgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGNvbnRyb2xsZXIucmVtb3ZlQ29uZmlndXJlZFBsdWdpbihwbHVnaW5BKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucywgW3tcblx0XHRcdGNoYW5uZWw6ICdhaHAtcm9vdDovLycsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9vdGhlcicsIGRpc3BsYXlOYW1lOiAnT3RoZXIgUGx1Z2luJyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBhc3NpZ25zIGRpc3RpbmN0IGl0ZW0ga2V5cyB0byBwbHVnaW5zIHdpdGggZGlmZmVyZW50IFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblx0XHRjb25zdCBwbHVnaW5BOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL2EnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYScsIG5hbWU6ICdQbHVnaW4gQScsIGVuYWJsZWQ6IHRydWUgfTtcblx0XHRjb25zdCBwbHVnaW5COiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL2InLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYicsIG5hbWU6ICdQbHVnaW4gQicsIGVuYWJsZWQ6IHRydWUgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHtcblx0XHRcdGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbcGx1Z2luQSwgcGx1Z2luQl0pXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtwbHVnaW5BLCBwbHVnaW5CXSksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChpdGVtc1swXS5pdGVtS2V5LCBpdGVtc1sxXS5pdGVtS2V5KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIga2VlcHMgY2xpZW50LXN5bmNlZCBlbnRyaWVzIGRpc3RpbmN0IGZyb20gaG9zdC1vd25lZCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgaG9zdFNjb3BlZDogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9zaGFyZWQnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2hhcmVkJywgbmFtZTogJ1NoYXJlZCBQbHVnaW4nLCBlbmFibGVkOiB0cnVlIH07XG5cdFx0Y29uc3Qgc3luY2VkOiBDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4uaG9zdFNjb3BlZCxcblx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdH07XG5cblx0XHRjb25uZWN0aW9uLnNldFJvb3RTdGF0ZSh7XG5cdFx0XHRhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW2hvc3RTY29wZWRdKV0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbaG9zdFNjb3BlZF0pLFxuXHRcdCkpO1xuXG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGFnZW50SG9zdFNlc3Npb25JZCxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtzeW5jZWRdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGl0ZW1zWzBdLml0ZW1LZXksIGl0ZW1zWzFdLml0ZW1LZXkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBhc3NpZ25zIGNsaWVudCBncm91cCB0byBjbGllbnQtc3luY2VkIGVudHJpZXMgYW5kIGhvc3QgZ3JvdXAgdG8gaG9zdCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgaG9zdFBsdWdpbjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9ob3N0LXBsdWdpbicsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9ob3N0LXBsdWdpbicsIG5hbWU6ICdIb3N0IFBsdWdpbicsIGVuYWJsZWQ6IHRydWUgfTtcblx0XHRjb25zdCBjbGllbnRQbHVnaW46IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6ICdmaWxlOi8vL3BsdWdpbnMvY2xpZW50LXBsdWdpbicsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9jbGllbnQtcGx1Z2luJywgbmFtZTogJ0NsaWVudCBQbHVnaW4nLCBlbmFibGVkOiB0cnVlIH07XG5cdFx0Y29uc3Qgc3luY2VkOiBDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4uY2xpZW50UGx1Z2luLFxuXHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0fTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHtcblx0XHRcdGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbaG9zdFBsdWdpbl0pXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtob3N0UGx1Z2luXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3N5bmNlZF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IGhvc3RJdGVtID0gaXRlbXMuZmluZChpID0+IGkubmFtZSA9PT0gJ0hvc3QgUGx1Z2luJyk7XG5cdFx0Y29uc3QgY2xpZW50SXRlbSA9IGl0ZW1zLmZpbmQoaSA9PiBpLm5hbWUgPT09ICdDbGllbnQgUGx1Z2luJyk7XG5cdFx0YXNzZXJ0Lm9rKGhvc3RJdGVtLCAnc2hvdWxkIGhhdmUgYSBob3N0IGl0ZW0nKTtcblx0XHRhc3NlcnQub2soY2xpZW50SXRlbSwgJ3Nob3VsZCBoYXZlIGEgY2xpZW50IGl0ZW0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdEl0ZW0uZ3JvdXBLZXksICdyZW1vdGUtaG9zdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnRJdGVtLmdyb3VwS2V5LCAncmVtb3RlLWNsaWVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBoaWRlcyBzeW50aGV0aWMgYnVuZGxlIGJ1dCBzdGlsbCBleHBhbmRzIGl0cyBjb250ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCkpO1xuXG5cdFx0Y29uc3QgYnVuZGxlVXJpID0gYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovLy90ZXN0LWF1dGhvcml0eWA7XG5cdFx0Y29uc3QgYnVuZGxlUmVmOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBidW5kbGVVcmksIHVyaTogYnVuZGxlVXJpLCBuYW1lOiAnVlMgQ29kZSBTeW5jZWQgRGF0YScsIGVuYWJsZWQ6IHRydWUsIGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0gfTtcblx0XHRjb25zdCBzeW5jZWQ6IEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHQuLi5idW5kbGVSZWYsXG5cdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHR9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoeyBhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW10pXSB9KTtcblxuXHRcdC8vIE1vY2sgZmlsZSBzZXJ2aWNlIHRoYXQgcmV0dXJucyBhIHNraWxscyBkaXJlY3Rvcnkgd2l0aCBvbmUgY2hpbGRcblx0XHRjb25zdCBza2lsbEZpbGVVcmkgPSBVUkkucGFyc2UoYCR7YnVuZGxlVXJpfS9za2lsbHMvbXktc2tpbGxgKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbChyZXNvdXJjZXM6IHsgcmVzb3VyY2U6IFVSSSB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZXMubWFwKHIgPT4ge1xuXHRcdFx0XHRcdGlmIChyLnJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9za2lsbHMnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3RhdDoge1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiByLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdza2lsbHMnLFxuXHRcdFx0XHRcdFx0XHRcdGlzRmlsZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRtdGltZTogMCxcblx0XHRcdFx0XHRcdFx0XHRjdGltZTogMCxcblx0XHRcdFx0XHRcdFx0XHRzaXplOiAwLFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdFx0XHRcdFx0bmFtZTogJ215LXNraWxsJyxcblx0XHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBza2lsbEZpbGVVcmksXG5cdFx0XHRcdFx0XHRcdFx0XHRpc0ZpbGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRtdGltZTogMCxcblx0XHRcdFx0XHRcdFx0XHRcdGN0aW1lOiAwLFxuXHRcdFx0XHRcdFx0XHRcdFx0c2l6ZTogMCxcblx0XHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHRcdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElGaWxlU3RhdFJlc3VsdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIHN0YXQ6IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSUZpbGVTdGF0UmVzdWx0O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL215LXNraWxsL1NLSUxMLm1kJykpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gJy0tLVxcbi0tLVxcbic7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2UsIG5hbWU6ICdTS0lMTC5tZCcsIHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCBtdGltZTogMCwgY3RpbWU6IDAsIGV0YWc6ICcnLCBzaXplOiBjb250ZW50Lmxlbmd0aCwgcmVhZG9ubHk6IGZhbHNlLCBsb2NrZWQ6IGZhbHNlLCBleGVjdXRhYmxlOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRU5PRU5UJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtdKSxcblx0XHQpKTtcblxuXHRcdGNvbm5lY3Rpb24uZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBhZ2VudEhvc3RTZXNzaW9uSWQsXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbc3luY2VkXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdC8vIFRoZSBzeW50aGV0aWMgYnVuZGxlIGl0c2VsZiBzaG91bGQgTk9UIGFwcGVhciBhcyBhIHRvcC1sZXZlbCBpdGVtXG5cdFx0YXNzZXJ0Lm9rKCFpdGVtcy5zb21lKGkgPT4gaS5uYW1lID09PSAnVlMgQ29kZSBTeW5jZWQgRGF0YScpLCAnc3ludGhldGljIGJ1bmRsZSBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0Ly8gQnV0IGl0cyBleHBhbmRlZCBjaGlsZCBzaG91bGQgYXBwZWFyXG5cdFx0Y29uc3Qgc2tpbGxJdGVtID0gaXRlbXMuZmluZChpID0+IGkubmFtZSA9PT0gJ215LXNraWxsJyk7XG5cdFx0YXNzZXJ0Lm9rKHNraWxsSXRlbSwgJ2V4cGFuZGVkIHNraWxsIGZyb20gYnVuZGxlIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsSXRlbS5ncm91cEtleSwgJ3JlbW90ZS1jbGllbnQnLCAnZXhwYW5kZWQgY2hpbGRyZW4gZnJvbSBidW5kbGUgc2hvdWxkIGJlIGluIGNsaWVudCBncm91cCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1JlbW90ZVVyaSBwcmVzZXJ2ZXMgc3luY2VkLWN1c3RvbWl6YXRpb24gc2NoZW1lIFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblxuXHRcdGNvbnN0IGJ1bmRsZVVyaSA9IGAke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06Ly8vdGVzdC1hdXRob3JpdHlgO1xuXHRcdGNvbnN0IGJ1bmRsZVJlZjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogYnVuZGxlVXJpLCB1cmk6IGJ1bmRsZVVyaSwgbmFtZTogJ1ZTIENvZGUgU3luY2VkIERhdGEnLCBlbmFibGVkOiB0cnVlIH07XG5cdFx0Y29uc3Qgc3luY2VkOiBDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4uYnVuZGxlUmVmLFxuXHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0fTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtdKV0gfSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3N5bmNlZF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHQvLyBObyB0b3AtbGV2ZWwgaXRlbSAoYnVuZGxlIGlzIGhpZGRlbiksIGJ1dCBjaGVjayB0aGF0IHBsdWdpbiBleHBhbnNpb25cblx0XHQvLyBhdHRlbXB0ZWQgd2l0aCB0aGUgb3JpZ2luYWwgc2NoZW1lIFx1MjAxNCBub3QgYWdlbnQtaG9zdDovL1xuXHRcdC8vIFRoaXMgaXMgdmVyaWZpZWQgaW5kaXJlY3RseTogY2FuSGFuZGxlUmVzb3VyY2UgcmV0dXJucyBmYWxzZSBzb1xuXHRcdC8vIG5vIGNoaWxkcmVuIGFyZSBwcm9kdWNlZCwgYnV0IGltcG9ydGFudGx5IG5vIGNyYXNoIG9jY3VycmVkXG5cdFx0Ly8gKHRvQWdlbnRIb3N0VXJpIHdvdWxkIHRocm93IGZvciB0aGlzIHNjaGVtZSkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIHByb3BhZ2F0ZXMgc3RhdHVzIGFuZCBlbmFibGVkIGZyb20gc2Vzc2lvbiBjdXN0b21pemF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCkpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUmVmOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL215LXBsdWdpbicsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9teS1wbHVnaW4nLCBuYW1lOiAnTXkgUGx1Z2luJywgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdGNvbnN0IHNlc3Npb25DdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4ucGx1Z2luUmVmLFxuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkVycm9yLCBtZXNzYWdlOiAnc29tZXRoaW5nIHdlbnQgd3JvbmcnIH0sXG5cdFx0fTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtwbHVnaW5SZWZdKV0gfSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbcGx1Z2luUmVmXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3Nlc3Npb25DdXN0b21pemF0aW9uXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdC8vIEhvc3Qtc2NvcGVkIHBsdWdpbiBmcm9tIHJvb3QgKyBzZXNzaW9uIGN1c3RvbWl6YXRpb24gXHUyMTkyIG1lcmdlZCBpbnRvIG9uZSBlbnRyeVxuXHRcdC8vIFRoZSBzZXNzaW9uIGN1c3RvbWl6YXRpb24gZW50cnkgdXBkYXRlcyBzdGF0dXMvc3RhdHVzTWVzc2FnZVxuXHRcdGNvbnN0IHNlc3Npb25JdGVtID0gaXRlbXMuZmluZChpID0+IGkuc3RhdHVzID09PSAnZXJyb3InKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbkl0ZW0sICdzaG91bGQgaGF2ZSBhbiBpdGVtIHdpdGggZXJyb3Igc3RhdHVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25JdGVtLnN0YXR1c01lc3NhZ2UsICdzb21ldGhpbmcgd2VudCB3cm9uZycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBmaXJlcyBvbmUgY2hhbmdlIGV2ZW50IG9uIFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cblx0XHRjb25zdCBwbHVnaW5SZWY6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6ICdmaWxlOi8vL3BsdWdpbnMvaG9zdCcsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9ob3N0JywgbmFtZTogJ0hvc3QgUGx1Z2luJywgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtwbHVnaW5SZWZdKV0gfSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbcGx1Z2luUmVmXSksXG5cdFx0KSk7XG5cblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3BsdWdpblJlZl0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnc2hvdWxkIGZpcmUgb25lIGNoYW5nZSBldmVudCBmcm9tIGN1c3RvbWl6YXRpb24gc2VydmljZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVDb25maWd1cmVkUGx1Z2luIGRpc3BhdGNoZXMgdXBkYXRlZCBsaXN0IHdpdGhvdXQgdGhlIHJlbW92ZWQgcGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVtb3RlQWdlbnRQbHVnaW5Db250cm9sbGVyKFxuXHRcdFx0J1Rlc3QgSG9zdCcsXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdHt9IGFzIElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRcdGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdHt9IGFzIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcGx1Z2luQjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9iJywgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2InLCBuYW1lOiAnUGx1Z2luIEInLCBlbmFibGVkOiB0cnVlIH07XG5cblx0XHRjb25uZWN0aW9uLnNldFJvb3RTdGF0ZSh7XG5cdFx0XHRhZ2VudHM6IFtdLFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdFx0dmFsdWVzOiB7XG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2EnLCBkaXNwbGF5TmFtZTogJ1BsdWdpbiBBJyB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvYicsIGRpc3BsYXlOYW1lOiAnUGx1Z2luIEInIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9jJywgZGlzcGxheU5hbWU6ICdQbHVnaW4gQycgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGNvbnRyb2xsZXIucmVtb3ZlQ29uZmlndXJlZFBsdWdpbihwbHVnaW5CKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zWzBdLCB7XG5cdFx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9hJywgZGlzcGxheU5hbWU6ICdQbHVnaW4gQScgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2MnLCBkaXNwbGF5TmFtZTogJ1BsdWdpbiBDJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBjbGllbnQtc3luY2VkIGVudHJpZXMgYWxsIGFwcGVhciB3aXRoIGRpc3RpbmN0IGtleXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpKTtcblxuXHRcdGNvbnN0IGNsaWVudEE6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6ICdmaWxlOi8vL3BsdWdpbnMvY2xpZW50LWEnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvY2xpZW50LWEnLCBuYW1lOiAnQ2xpZW50IEEnLCBlbmFibGVkOiB0cnVlIH07XG5cdFx0Y29uc3QgY2xpZW50QjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ2ZpbGU6Ly8vcGx1Z2lucy9jbGllbnQtYicsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9jbGllbnQtYicsIG5hbWU6ICdDbGllbnQgQicsIGVuYWJsZWQ6IHRydWUgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtdKV0gfSk7XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVBbGwoKSB7IHJldHVybiBbXTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdHsgLi4uY2xpZW50QSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0XHR7IC4uLmNsaWVudEIsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soaXRlbXMuZmluZChpID0+IGkubmFtZSA9PT0gJ0NsaWVudCBBJyksICdzaG91bGQgaGF2ZSBDbGllbnQgQScpO1xuXHRcdGFzc2VydC5vayhpdGVtcy5maW5kKGkgPT4gaS5uYW1lID09PSAnQ2xpZW50IEInKSwgJ3Nob3VsZCBoYXZlIENsaWVudCBCJyk7XG5cdFx0Y29uc3Qga2V5cyA9IGl0ZW1zLm1hcChpID0+IGkuaXRlbUtleSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBTZXQoa2V5cykuc2l6ZSwgMiwgJ2FsbCBpdGVtIGtleXMgc2hvdWxkIGJlIHVuaXF1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBwYXJzZXMgc2tpbGwgbWV0YWRhdGEsIHJld3JpdGVzIGZvbGRlciBVUklzIHRvIFNLSUxMLm1kLCBhbmQgc2tpcHMgdW5yZWFkYWJsZSBmb2xkZXIgc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgcGx1Z2luOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnZmlsZTovLy9wbHVnaW5zL3NraWxscy1idW5kbGUnLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvc2tpbGxzLWJ1bmRsZScsIG5hbWU6ICdTa2lsbHMgQnVuZGxlJywgZW5hYmxlZDogdHJ1ZSB9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoeyBhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW3BsdWdpbl0pXSB9KTtcblxuXHRcdC8vIEJ1aWxkIGEgc3ludGhldGljIHBsdWdpbiB0aGF0IGNvbnRhaW5zIGEgYHNraWxscy9gIGRpcmVjdG9yeSB3aXRoOlxuXHRcdC8vICAtIGB2YWxpZC1za2lsbC9gIGZvbGRlciAoU0tJTEwubWQgcGFyc2VzIHdpdGggbmFtZSArIGRlc2NyaXB0aW9uKVxuXHRcdC8vICAtIGBicm9rZW4tc2tpbGwvYCBmb2xkZXIgKFNLSUxMLm1kIHJlYWQgZmFpbHMgXHUyMDE0IGVudHJ5IHNob3VsZCBiZSBza2lwcGVkKVxuXHRcdC8vICAtIGBsZWdhY3kuc2tpbGwubWRgIGZsYXQgZmlsZSAoa2VwdCBhcy1pcywgbmFtZSBmcm9tIGZpbGVuYW1lKVxuXHRcdGNvbnN0IHNraWxsc0RpckNoaWxkcmVuOiBJRmlsZVN0YXRbXSA9IFtcblx0XHRcdHsgbmFtZTogJ3ZhbGlkLXNraWxsJywgcmVzb3VyY2U6IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LWhvc3Q6Ly90ZXN0L3BsdWdpbnMvc2tpbGxzLWJ1bmRsZS9za2lsbHMvdmFsaWQtc2tpbGwnKSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBuYW1lOiAnYnJva2VuLXNraWxsJywgcmVzb3VyY2U6IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LWhvc3Q6Ly90ZXN0L3BsdWdpbnMvc2tpbGxzLWJ1bmRsZS9za2lsbHMvYnJva2VuLXNraWxsJyksIGlzRmlsZTogZmFsc2UsIGlzRGlyZWN0b3J5OiB0cnVlLCBpc1N5bWJvbGljTGluazogZmFsc2UsIGNoaWxkcmVuOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgbmFtZTogJ2xlZ2FjeS5za2lsbC5tZCcsIHJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vdGVzdC9wbHVnaW5zL3NraWxscy1idW5kbGUvc2tpbGxzL2xlZ2FjeS5za2lsbC5tZCcpLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRcdFx0cmV0dXJuIHRvUmVzb2x2ZS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4ge1xuXHRcdFx0XHRcdGlmIChyZXNvdXJjZS5wYXRoLmVuZHNXaXRoKCcvc2tpbGxzJykpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHN0YXQ6IHsgbmFtZTogJ3NraWxscycsIHJlc291cmNlLCBpc0ZpbGU6IGZhbHNlLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogc2tpbGxzRGlyQ2hpbGRyZW4gfSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS5wYXRoLmVuZHNXaXRoKCcvdmFsaWQtc2tpbGwvU0tJTEwubWQnKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAnLS0tXFxubmFtZTogUHJldHR5IE5hbWVcXG5kZXNjcmlwdGlvbjogQSBmcmllbmRseSBza2lsbCBkZXNjcmlwdGlvblxcbi0tLVxcblxcbiMgQm9keVxcbic7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2UsIG5hbWU6ICdTS0lMTC5tZCcsIHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCBtdGltZTogMCwgY3RpbWU6IDAsIGV0YWc6ICcnLCBzaXplOiBjb250ZW50Lmxlbmd0aCwgcmVhZG9ubHk6IGZhbHNlLCBsb2NrZWQ6IGZhbHNlLCBleGVjdXRhYmxlOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRU5PRU5UJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVRlc3RDdXN0b21BZ2VudHNTZXJ2aWNlKGNvbm5lY3Rpb24sIFtwbHVnaW5dKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRjb25zdCBza2lsbEl0ZW1zID0gaXRlbXMuZmlsdGVyKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNraWxsSXRlbXMubWFwKGkgPT4gKHsgbmFtZTogaS5uYW1lLCBkZXNjcmlwdGlvbjogaS5kZXNjcmlwdGlvbiwgdXJpOiBpLnVyaS50b1N0cmluZygpIH0pKS5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKSxcblx0XHRcdFtcblx0XHRcdFx0eyBuYW1lOiAnUHJldHR5IE5hbWUnLCBkZXNjcmlwdGlvbjogJ0EgZnJpZW5kbHkgc2tpbGwgZGVzY3JpcHRpb24nLCB1cmk6ICd2c2NvZGUtYWdlbnQtaG9zdDovL3Rlc3QvcGx1Z2lucy9za2lsbHMtYnVuZGxlL3NraWxscy92YWxpZC1za2lsbC9TS0lMTC5tZCcgfSxcblx0XHRcdF0uc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksXG5cdFx0KTtcblxuXHRcdC8vIEVhY2ggZXhwYW5kZWQgKG5vbi1idW5kbGUpIGl0ZW0gbXVzdCBjYXJyeSBhIGBwbHVnaW5VcmlgIHNvIHRoYXRcblx0XHQvLyBkb3duc3RyZWFtIHNsYXNoLWNvbW1hbmQgcmVzb2x1dGlvbiBjYW4gYnVpbGQgYSBgcGx1Z2luOmAtcHJlZml4ZWRcblx0XHQvLyBjb21tYW5kIGlkIHZpYSBgZ2V0Q2Fub25pY2FsUGx1Z2luQ29tbWFuZElkYC5cblx0XHRjb25zdCBleHBlY3RlZFBsdWdpblVyaSA9ICd2c2NvZGUtYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L3BsdWdpbnMvc2tpbGxzLWJ1bmRsZT9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCc7XG5cdFx0Zm9yIChjb25zdCBza2lsbEl0ZW0gb2Ygc2tpbGxJdGVtcykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsSXRlbS5wbHVnaW5Vcmk/LnRvU3RyaW5nKCksIGV4cGVjdGVkUGx1Z2luVXJpLCBgc2tpbGwgJHtza2lsbEl0ZW0ubmFtZX0gc2hvdWxkIGNhcnJ5IHBsdWdpblVyaWApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgcmVjb3ZlcnMgb3JpZ2luYWwgcHJvdmVuYW5jZSBmb3Igc3ludGhldGljLWJ1bmRsZSBjaGlsZHJlbiB2aWEgdGhlIG9yaWdpbiByZXNvbHZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCkpO1xuXG5cdFx0Ly8gVGhlIHN5bnRoZXRpYyBcIlZTIENvZGUgU3luY2VkIERhdGFcIiBidW5kbGUgbGl2ZXMgdW5kZXIgdGhlIHN5bmNlZCBzY2hlbWUuXG5cdFx0Y29uc3QgYnVuZGxlVXJpID0gYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovLy90ZXN0LWF1dGhvcml0eWA7XG5cdFx0Y29uc3QgYnVuZGxlOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBidW5kbGVVcmksIHVyaTogYnVuZGxlVXJpLCBuYW1lOiAnVlMgQ29kZSBTeW5jZWQgRGF0YScsIGVuYWJsZWQ6IHRydWUgfTtcblxuXHRcdGNvbm5lY3Rpb24uc2V0Um9vdFN0YXRlKHsgYWdlbnRzOiBbY3JlYXRlQWdlbnRJbmZvKFtdKV0gfSk7XG5cblx0XHRjb25zdCBydWxlUmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovLy90ZXN0LWF1dGhvcml0eS9ydWxlcy9teS1ydWxlLm1kYCk7XG5cdFx0Y29uc3QgcnVsZXNEaXJDaGlsZHJlbjogSUZpbGVTdGF0W10gPSBbXG5cdFx0XHR7IG5hbWU6ICdteS1ydWxlLm1kJywgcmVzb3VyY2U6IHJ1bGVSZXNvdXJjZSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSSB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0XHRcdHJldHVybiB0b1Jlc29sdmUubWFwKCh7IHJlc291cmNlIH0pID0+IHJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9ydWxlcycpXG5cdFx0XHRcdFx0PyB7IHN1Y2Nlc3M6IHRydWUsIHN0YXQ6IHsgbmFtZTogJ3J1bGVzJywgcmVzb3VyY2UsIGlzRmlsZTogZmFsc2UsIGlzRGlyZWN0b3J5OiB0cnVlLCBpc1N5bWJvbGljTGluazogZmFsc2UsIGNoaWxkcmVuOiBydWxlc0RpckNoaWxkcmVuIH0gfVxuXHRcdFx0XHRcdDogeyBzdWNjZXNzOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gJy0tLVxcbm5hbWU6IE15IFJ1bGVcXG5kZXNjcmlwdGlvbjogQSBzeW5jZWQgcnVsZVxcbi0tLVxcbic7XG5cdFx0XHRcdHJldHVybiB7IHJlc291cmNlLCBuYW1lOiAnbXktcnVsZS5tZCcsIHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCBtdGltZTogMCwgY3RpbWU6IDAsIGV0YWc6ICcnLCBzaXplOiBjb250ZW50Lmxlbmd0aCwgcmVhZG9ubHk6IGZhbHNlLCBsb2NrZWQ6IGZhbHNlLCBleGVjdXRhYmxlOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBvcmlnaW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyLy5jb25maWcvcnVsZXMvbXktcnVsZS5tZCcpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1hdXRob3JpdHknLFxuXHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0c3luY2VkVXJpID0+IHN5bmNlZFVyaS50b1N0cmluZygpID09PSBydWxlUmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHQ/IHsgdXJpOiBvcmlnaW5VcmksIHNvdXJjZTogJ2V4dGVuc2lvbicsIGV4dGVuc2lvbklkOiAncHViLmV4dCcsIHBsdWdpblVyaTogdW5kZWZpbmVkIH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlVGVzdEN1c3RvbUFnZW50c1NlcnZpY2UoY29ubmVjdGlvbiwgW10pLFxuXHRcdCkpO1xuXG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGFnZW50SG9zdFNlc3Npb25JZCxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IC4uLmJ1bmRsZSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlID0gaXRlbXMuZmluZChpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRhc3NlcnQub2socnVsZSwgJ3RoZSBzeW5jZWQgcnVsZSBzaG91bGQgYmUgZXhwYW5kZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyB1cmk6IHJ1bGUudXJpLnRvU3RyaW5nKCksIHNvdXJjZTogcnVsZS5zb3VyY2UsIGV4dGVuc2lvbklkOiBydWxlLmV4dGVuc2lvbklkLCBncm91cEtleTogcnVsZS5ncm91cEtleSB9LFxuXHRcdFx0eyB1cmk6IG9yaWdpblVyaS50b1N0cmluZygpLCBzb3VyY2U6ICdleHRlbnNpb24nLCBleHRlbnNpb25JZDogJ3B1Yi5leHQnLCBncm91cEtleTogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIga2VlcHMgY2xpZW50IGdyb3VwIGZvciByZWNvdmVyZWQgdXNlciBwcm92ZW5hbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cdFx0Y29uc3QgYnVuZGxlVXJpID0gYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovLy90ZXN0LWF1dGhvcml0eWA7XG5cdFx0Y29uc3QgYnVuZGxlOiBDdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBidW5kbGVVcmksIHVyaTogYnVuZGxlVXJpLCBuYW1lOiAnVlMgQ29kZSBTeW5jZWQgRGF0YScsIGVuYWJsZWQ6IHRydWUgfTtcblx0XHRjb25uZWN0aW9uLnNldFJvb3RTdGF0ZSh7IGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbXSldIH0pO1xuXG5cdFx0Y29uc3QgcnVsZVJlc291cmNlID0gVVJJLnBhcnNlKGAke2J1bmRsZVVyaX0vcnVsZXMvdXNlci1ydWxlLmluc3RydWN0aW9ucy5tZGApO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRcdFx0cmV0dXJuIHRvUmVzb2x2ZS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4gcmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3J1bGVzJylcblx0XHRcdFx0XHQ/IHsgc3VjY2VzczogdHJ1ZSwgc3RhdDogeyBuYW1lOiAncnVsZXMnLCByZXNvdXJjZSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IFt7IG5hbWU6ICd1c2VyLXJ1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgcmVzb3VyY2U6IHJ1bGVSZXNvdXJjZSwgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9XSB9IH1cblx0XHRcdFx0XHQ6IHsgc3VjY2VzczogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICdVc2VyIHJ1bGUnO1xuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZSwgbmFtZTogJ3VzZXItcnVsZS5pbnN0cnVjdGlvbnMubWQnLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSwgbXRpbWU6IDAsIGN0aW1lOiAwLCBldGFnOiAnJywgc2l6ZTogY29udGVudC5sZW5ndGgsIHJlYWRvbmx5OiBmYWxzZSwgbG9ja2VkOiBmYWxzZSwgZXhlY3V0YWJsZTogZmFsc2UgfTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IG9yaWdpblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL3VzZXItcnVsZS5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHN5bmNlZFVyaSA9PiBzeW5jZWRVcmkudG9TdHJpbmcoKSA9PT0gcnVsZVJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdFx0PyB7IHVyaTogb3JpZ2luVXJpLCBzb3VyY2U6ICd1c2VyJywgZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCwgcGx1Z2luVXJpOiB1bmRlZmluZWQgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cdFx0Y29ubmVjdGlvbi5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGFnZW50SG9zdFNlc3Npb25JZCxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IC4uLmJ1bmRsZSwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlID0gaXRlbXMuZmluZChpdGVtID0+IGl0ZW0udHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRhc3NlcnQub2socnVsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1cmk6IHJ1bGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IHJ1bGUuc291cmNlLFxuXHRcdFx0Z3JvdXBLZXk6IHJ1bGUuZ3JvdXBLZXksXG5cdFx0fSwge1xuXHRcdFx0dXJpOiBvcmlnaW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdHNvdXJjZTogJ3VzZXInLFxuXHRcdFx0Z3JvdXBLZXk6ICdyZW1vdGUtY2xpZW50Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgbGVhdmVzIHN5bnRoZXRpYy1idW5kbGUgY2hpbGRyZW4gdW5jaGFuZ2VkIHdoZW4gbm8gb3JpZ2luIGlzIGtub3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cblx0XHRjb25zdCBidW5kbGVVcmkgPSBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi8vL3Rlc3QtYXV0aG9yaXR5YDtcblx0XHRjb25zdCBidW5kbGU6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGJ1bmRsZVVyaSwgdXJpOiBidW5kbGVVcmksIG5hbWU6ICdWUyBDb2RlIFN5bmNlZCBEYXRhJywgZW5hYmxlZDogdHJ1ZSB9O1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRSb290U3RhdGUoeyBhZ2VudHM6IFtjcmVhdGVBZ2VudEluZm8oW10pXSB9KTtcblxuXHRcdGNvbnN0IHJ1bGVSZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi8vL3Rlc3QtYXV0aG9yaXR5L3J1bGVzL215LXJ1bGUubWRgKTtcblx0XHRjb25zdCBydWxlc0RpckNoaWxkcmVuOiBJRmlsZVN0YXRbXSA9IFtcblx0XHRcdHsgbmFtZTogJ215LXJ1bGUubWQnLCByZXNvdXJjZTogcnVsZVJlc291cmNlLCBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlLCBjaGlsZHJlbjogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyByZXNvbHZlQWxsKHRvUmVzb2x2ZTogeyByZXNvdXJjZTogVVJJIH1bXSk6IFByb21pc2U8SUZpbGVTdGF0UmVzdWx0W10+IHtcblx0XHRcdFx0cmV0dXJuIHRvUmVzb2x2ZS5tYXAoKHsgcmVzb3VyY2UgfSkgPT4gcmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3J1bGVzJylcblx0XHRcdFx0XHQ/IHsgc3VjY2VzczogdHJ1ZSwgc3RhdDogeyBuYW1lOiAncnVsZXMnLCByZXNvdXJjZSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHJ1bGVzRGlyQ2hpbGRyZW4gfSB9XG5cdFx0XHRcdFx0OiB7IHN1Y2Nlc3M6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAnLS0tXFxubmFtZTogTXkgUnVsZVxcbi0tLVxcbic7XG5cdFx0XHRcdHJldHVybiB7IHJlc291cmNlLCBuYW1lOiAnbXktcnVsZS5tZCcsIHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCBtdGltZTogMCwgY3RpbWU6IDAsIGV0YWc6ICcnLCBzaXplOiBjb250ZW50Lmxlbmd0aCwgcmVhZG9ubHk6IGZhbHNlLCBsb2NrZWQ6IGZhbHNlLCBleGVjdXRhYmxlOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBObyByZXNvbHZlciB3aXJlZDogY2hpbGRyZW4ga2VlcCB0aGVpciBzeW5jZWQgVVJJIGFuZCBkZWZhdWx0IHNvdXJjZS5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbXSksXG5cdFx0KSk7XG5cblx0XHRjb25uZWN0aW9uLmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYWdlbnRIb3N0U2Vzc2lvbklkLFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3sgLi4uYnVuZGxlLCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJ1bGUgPSBpdGVtcy5maW5kKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdGFzc2VydC5vayhydWxlLCAndGhlIHN5bmNlZCBydWxlIHNob3VsZCBiZSBleHBhbmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydWxlLnVyaS50b1N0cmluZygpLCBydWxlUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5nZXRTbGFzaENvbW1hbmRzIHByZWZpeGVzIGRpc2NvdmVyZWQgc2tpbGwgbmFtZXMgd2l0aCB0aGUgcGx1Z2luIGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKSk7XG5cblx0XHRjb25zdCBwbHVnaW46IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6ICdmaWxlOi8vL3BsdWdpbnMvc2tpbGxzLWJ1bmRsZScsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9za2lsbHMtYnVuZGxlJywgbmFtZTogJ1NraWxscyBCdW5kbGUnLCBlbmFibGVkOiB0cnVlIH07XG5cblx0XHRjb25uZWN0aW9uLnNldFJvb3RTdGF0ZSh7IGFnZW50czogW2NyZWF0ZUFnZW50SW5mbyhbcGx1Z2luXSldIH0pO1xuXG5cdFx0Y29uc3Qgc2tpbGxzRGlyQ2hpbGRyZW46IElGaWxlU3RhdFtdID0gW1xuXHRcdFx0eyBuYW1lOiAnbGludCcsIHJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vdGVzdC9wbHVnaW5zL3NraWxscy1idW5kbGUvc2tpbGxzL2xpbnQnKSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHVuZGVmaW5lZCB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSSB9W10pOiBQcm9taXNlPElGaWxlU3RhdFJlc3VsdFtdPiB7XG5cdFx0XHRcdHJldHVybiB0b1Jlc29sdmUubWFwKCh7IHJlc291cmNlIH0pID0+IHtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3NraWxscycpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRzdGF0OiB7IG5hbWU6ICdza2lsbHMnLCByZXNvdXJjZSwgaXNGaWxlOiBmYWxzZSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSwgY2hpbGRyZW46IHNraWxsc0RpckNoaWxkcmVuIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL2xpbnQvU0tJTEwubWQnKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAnLS0tXFxubmFtZTogTGludFxcbmRlc2NyaXB0aW9uOiBBIGxpbnQgc2tpbGxcXG4tLS1cXG4nO1xuXHRcdFx0XHRcdHJldHVybiB7IHJlc291cmNlLCBuYW1lOiAnU0tJTEwubWQnLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSwgbXRpbWU6IDAsIGN0aW1lOiAwLCBldGFnOiAnJywgc2l6ZTogY29udGVudC5sZW5ndGgsIHJlYWRvbmx5OiBmYWxzZSwgbG9ja2VkOiBmYWxzZSwgZXhlY3V0YWJsZTogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VOT0VOVCcpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyKFxuXHRcdFx0J3Rlc3QtYXV0aG9yaXR5Jyxcblx0XHRcdCgpID0+IHsgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVUZXN0Q3VzdG9tQWdlbnRzU2VydmljZShjb25uZWN0aW9uLCBbcGx1Z2luXSksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBoYXJuZXNzSWQgPSAncmVtb3RlLWFnZW50LWhvc3QtdGVzdCc7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgncmVtb3RlLWFnZW50LWhvc3QtdGVzdDovLy90ZXN0LXNlc3Npb24nKTtcblx0XHRjb25zdCBkZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogaGFybmVzc0lkLFxuXHRcdFx0bGFiZWw6ICdSZW1vdGUgQWdlbnQgSG9zdCAodGVzdCknLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnJlbW90ZS5pZCksXG5cdFx0XHRpdGVtUHJvdmlkZXI6IHByb3ZpZGVyLFxuXHRcdH07XG5cdFx0Y29uc3QgaGFybmVzc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZUJhc2UoW2Rlc2NyaXB0b3JdLCBoYXJuZXNzSWQsIG5ldyBNb2NrUHJvbXB0c1NlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBoYXJuZXNzU2VydmljZS5nZXRTbGFzaENvbW1hbmRzKHRlc3RTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHNraWxsQ29tbWFuZCA9IGNvbW1hbmRzLmZpbmQoYyA9PiBjLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRhc3NlcnQub2soc2tpbGxDb21tYW5kLCAnc2hvdWxkIGhhdmUgYSBza2lsbCBzbGFzaCBjb21tYW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsQ29tbWFuZC5uYW1lLCAnc2tpbGxzLWJ1bmRsZTpsaW50JywgJ3NraWxsIGNvbW1hbmQgbmFtZSBzaG91bGQgYmUgcGx1Z2luLXByZWZpeGVkJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsWUFBWSx1QkFBa0Y7QUFDdkcsU0FBUyx5QkFBeUIseUJBQWdHO0FBQ2xJLFNBQVMsdUJBQThDO0FBQ3ZELFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsV0FBVztBQUVwQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHVDQUEyRDtBQUNwRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxtQ0FBbUM7QUFFNUMsTUFBTSw0QkFBNEIsS0FBdUIsRUFBRTtBQUFBLEVBYzFELGNBQWM7QUFDYixVQUFNO0FBYlAsU0FBaUIsZUFBZSxJQUFJLFFBQXdCO0FBQzVELFNBQWtCLGNBQWMsS0FBSyxhQUFhO0FBQ2xELFNBQWtCLG9CQUFvQixNQUFNO0FBQzVDLFNBQWtCLFdBQVc7QUFFN0IsU0FBUSxrQkFBNkIsRUFBRSxRQUFRLENBQUMsRUFBRTtBQUdsRCxTQUFpQixpQkFBaUIsb0JBQUksSUFBMEI7QUFFaEUsU0FBUyxvQkFBZ0UsQ0FBQztBQUl6RSxVQUFNLE9BQU87QUFDYixTQUFLLFlBQVk7QUFBQSxNQUNoQixJQUFJLFFBQW1CO0FBQUUsZUFBTyxLQUFLO0FBQUEsTUFBaUI7QUFBQSxNQUN0RCxJQUFJLGdCQUEyQjtBQUFFLGVBQU8sS0FBSztBQUFB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
