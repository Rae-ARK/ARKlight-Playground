import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../platform/actions/common/actions.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { SessionLifecycle, SessionStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import {
  agentSessionSettingsUri,
  AGENT_SESSION_SETTINGS_SCHEME,
  AgentSessionSettingsFileSystemProvider,
  AgentSessionSettingsSchemaRegistrar
} from "../../../browser/agentSessions/agentHost/agentSessionSettingsFileSystemProvider.js";
import "../../../browser/agentSessions/agentHost/agentSessionSettings.contribution.js";
const CHAT_SESSION_RESOURCE = URI.from({ scheme: "agent-host-copilotcli", path: "/abc-123" });
const BACKEND_SESSION = URI.from({ scheme: "copilotcli", path: "/abc-123" });
class FakeSessionSubscription {
  constructor() {
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.onWillApplyAction = Event.None;
    this.onDidApplyAction = Event.None;
  }
  get value() {
    return this._value;
  }
  get verifiedValue() {
    return this._value instanceof Error ? void 0 : this._value;
  }
  setState(state) {
    this._value = state;
    if (!(state instanceof Error)) {
      this._onDidChange.fire(state);
    }
  }
  applyReplace(config) {
    if (!this._value || this._value instanceof Error || !this._value.config) {
      return;
    }
    this._value = { ...this._value, config: { ...this._value.config, values: { ...config } } };
    this._onDidChange.fire(this._value);
  }
  dispose() {
    this._onDidChange.dispose();
  }
}
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.onAgentHostStart = Event.None;
    this.onAgentHostExit = Event.None;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.dispatchedActions = [];
    this._subs = /* @__PURE__ */ new Map();
  }
  _entry(resource) {
    const key = resource.toString();
    let entry = this._subs.get(key);
    if (!entry) {
      entry = { sub: new FakeSessionSubscription(), acquireCount: 0, disposeCount: 0 };
      this._subs.set(key, entry);
    }
    return entry;
  }
  getSubscription(_kind, resource, _owner) {
    const entry = this._entry(resource);
    entry.acquireCount++;
    return {
      object: entry.sub,
      dispose: () => {
        entry.disposeCount++;
      }
    };
  }
  getSubscriptionUnmanaged(_kind, resource) {
    const entry = this._subs.get(resource.toString());
    return entry?.sub;
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
    const entry = this._subs.get(channel);
    if (entry && action.type === ActionType.SessionConfigChanged) {
      entry.sub.applyReplace(action.config);
    }
  }
  setSessionState(resource, state) {
    this._entry(resource).sub.setState(state);
  }
  acquireCount(resource) {
    return this._subs.get(resource.toString())?.acquireCount ?? 0;
  }
  disposeCount(resource) {
    return this._subs.get(resource.toString())?.disposeCount ?? 0;
  }
  dispose() {
    for (const entry of this._subs.values()) {
      entry.sub.dispose();
    }
  }
}
function makeSessionState(properties, values = {}) {
  return {
    provider: "copilotcli",
    title: "Test session",
    status: SessionStatus.Idle,
    lifecycle: SessionLifecycle.Ready,
    activeClients: [],
    chats: [],
    config: {
      schema: { type: "object", properties },
      values
    }
  };
}
function readJson(buf) {
  const text = VSBuffer.wrap(buf).toString();
  return JSON.parse(text.substring(text.indexOf("{")));
}
function createPolicyRestrictedConfigurationService() {
  return new class extends TestConfigurationService {
    inspect(key) {
      const base = super.inspect(key);
      if (key === "chat.tools.global.autoApprove") {
        return { ...base, policyValue: false };
      }
      return base;
    }
  }();
}
suite("AgentSessionSettingsFileSystemProvider (editor-window per-session adapter)", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(initialState, configurationService = new TestConfigurationService()) {
    const agentHostService = new MockAgentHostService();
    store.add({ dispose: () => agentHostService.dispose() });
    if (initialState) {
      agentHostService.setSessionState(BACKEND_SESSION, initialState);
    }
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [IAgentHostService, agentHostService],
      [IConfigurationService, configurationService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));
    return { fs, agentHostService, uri: agentSessionSettingsUri(BACKEND_SESSION) };
  }
  test("URI routing: encodes and round-trips the backend session URI", () => {
    const uri = agentSessionSettingsUri(BACKEND_SESSION);
    assert.strictEqual(uri.scheme, AGENT_SESSION_SETTINGS_SCHEME);
    assert.strictEqual(uri.authority, "copilotcli");
    assert.strictEqual(uri.path, "/abc-123.jsonc");
  });
  test("readFile filters to session-mutable, non-readOnly properties", async () => {
    const { fs, uri } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
      isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
      // non-mutable — omitted
      branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
      // readOnly — omitted
    }, { autoApprove: "default", isolation: "worktree", branch: "main" }));
    const parsed = readJson(await fs.readFile(uri));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("readFile before any session state has arrived returns an empty document", async () => {
    const { fs, uri } = createHarness();
    assert.deepStrictEqual(readJson(await fs.readFile(uri)), {});
  });
  test("writeFile with invalid JSON throws", async () => {
    const { fs, uri } = createHarness(makeSessionState({}, {}));
    await assert.rejects(async () => {
      await fs.writeFile(uri, VSBuffer.fromString("{ not json").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    });
  });
  test("writeFile dispatches SessionConfigChanged with replace:true to the backend session channel", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const { channel, action } = agentHostService.dispatchedActions[0];
    assert.strictEqual(channel, BACKEND_SESSION.toString());
    assert.strictEqual(action.type, ActionType.SessionConfigChanged);
    assert.strictEqual(action.replace, true);
  });
  test("writeFile preserves non-editable values and clears an omitted editable value", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
      mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] },
      isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
      // non-mutable, must be preserved
      branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
      // readOnly, must be preserved
    }, { autoApprove: "default", mode: "a", isolation: "worktree", branch: "main" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "autoApprove", isolation: "worktree", branch: "main" });
    assert.strictEqual(Object.hasOwn(action.config, "mode"), false);
  });
  test("writeFile clamps autoApprove to default when org policy disables global auto-approve", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove", "autopilot"] },
      mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] }
    }, { autoApprove: "default", mode: "a" }), createPolicyRestrictedConfigurationService());
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autopilot", "mode": "b" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "default", mode: "b" });
  });
  test("writeFile passes autoApprove through unchanged when org policy does not restrict auto-approve", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove", "autopilot"] }
    }, { autoApprove: "default" }), new TestConfigurationService());
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autopilot" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "autopilot" });
  });
  test("writeFile does not dispatch when the only requested change is clamped away by policy", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove", "autopilot"] }
    }, { autoApprove: "default" }), createPolicyRestrictedConfigurationService());
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("writeFile with structurally unchanged values does not dispatch", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("writeFile when no session state has arrived yet is a no-op", async () => {
    const { fs, uri, agentHostService } = createHarness();
    const events = [];
    store.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    assert.strictEqual(events.length, 1);
  });
  test("readFile reflects the live subscription's optimistic value after a replace dispatch", async () => {
    const { fs, uri } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(readJson(await fs.readFile(uri)), { autoApprove: "autoApprove" });
  });
  test("onDidChangeFile fires when the backend session publishes new state while watched", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
    const events = [];
    const listeners = new DisposableStore();
    store.add(listeners);
    listeners.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    listeners.add(fs.watch(uri, { recursive: false, excludes: [] }));
    agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({}, { autoApprove: "default" }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].toString(), uri.toString());
  });
  test("session state error leaves config unavailable (empty document, write ignored)", async () => {
    const { fs, uri, agentHostService } = createHarness(new Error("session disconnected"));
    assert.deepStrictEqual(readJson(await fs.readFile(uri)), {});
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  suite("subscription lifecycle", () => {
    test("readFile acquires and releases its own scoped reference", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      await fs.readFile(uri);
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, "the reference acquired for readFile is released once the call completes");
    });
    test("stat and writeFile also acquire and release their own scoped reference", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      await fs.stat(uri);
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1);
      await fs.writeFile(uri, VSBuffer.fromString("{}\n").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2);
    });
    test("watch acquires its own reference and holds it until disposed", () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      const watch1 = fs.watch(uri, { recursive: false, excludes: [] });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 0);
      watch1.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1);
    });
    test("multiple watches each acquire and release their own reference independently", () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      const watch1 = fs.watch(uri, { recursive: false, excludes: [] });
      const watch2 = fs.watch(uri, { recursive: false, excludes: [] });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
      watch1.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, "disposing one watch releases only its own reference");
      watch2.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2, "disposing the second watch releases its own reference too");
    });
    test("readFile while a watch is active releases only its own reference, leaving the watch's reference held", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      const watch = fs.watch(uri, { recursive: false, excludes: [] });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      await fs.readFile(uri);
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, "readFile released its own reference; the watch reference is still held");
      watch.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2);
    });
  });
  suite("schema registration", () => {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    const schemaId = `vscode://schemas/agent-session-settings/copilotcli/abc-123.jsonc`;
    test("readFile lazily registers a schema + association", async () => {
      const { fs, uri } = createHarness(makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
      }, { autoApprove: "default" }));
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed on the next read after session state changes with a new schema identity", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
      }, { autoApprove: "default" }));
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
        mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] }
      }, { autoApprove: "default", mode: "a" }));
      await fs.readFile(uri);
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
    test("schema is disposed when the filesystem provider is disposed", async () => {
      const agentHostService = new MockAgentHostService();
      store.add({ dispose: () => agentHostService.dispose() });
      agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
      }, { autoApprove: "default" }));
      const instantiationService = new TestInstantiationService(new ServiceCollection(
        [IAgentHostService, agentHostService],
        [IConfigurationService, new TestConfigurationService()],
        [ILogService, new NullLogService()]
      ));
      const schemaRegistrar = instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar);
      const fs = instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar);
      const uri = agentSessionSettingsUri(BACKEND_SESSION);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      fs.dispose();
      schemaRegistrar.dispose();
      instantiationService.dispose();
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
    });
  });
});
suite("workbench.action.chat.openAgentSessionSettings", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const ACTION_ID = "workbench.action.chat.openAgentSessionSettings";
  function evalWhen(when, values) {
    assert.ok(when, "expected a when clause");
    return when.evaluate({ getValue: (key) => values[key] });
  }
  test("is NOT registered in the Command Palette (context-menu-only)", () => {
    const item = MenuRegistry.getMenuItems(MenuId.CommandPalette).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.strictEqual(item, void 0);
  });
  test("appears in the local agent-host session context menu, not for remote or non-agent-host sessions", () => {
    const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.ok(item, "agent sessions context menu item is registered");
    const base = { [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true };
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "agent-host-copilotcli" }), true);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "remote-copilotcli" }), false);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "copilotcli" }), false);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.enabled.key]: false, [ChatContextKeys.agentSessionType.key]: "agent-host-copilotcli" }), false);
  });
  function makeAgentSession(resource) {
    return {
      resource,
      isArchived: () => false,
      setArchived: () => {
      },
      isPinned: () => false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  async function invokeWithContext(context) {
    const command = CommandsRegistry.getCommand(ACTION_ID);
    assert.ok(command, "command is registered");
    const opened = [];
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IEditorService, new class extends mock() {
      async openEditor(...args) {
        const editor = args[0];
        opened.push({ resource: editor.resource, pinned: editor.options?.pinned });
        return void 0;
      }
    }());
    await instantiationService.invokeFunction((accessor) => command.handler(accessor, context));
    return opened;
  }
  test("run() with a direct IAgentSession opens the routed session settings resource pinned", async () => {
    const session = makeAgentSession(CHAT_SESSION_RESOURCE);
    const opened = await invokeWithContext(session);
    assert.deepStrictEqual(opened, [{ resource: agentSessionSettingsUri(BACKEND_SESSION), pinned: true }]);
  });
  test("run() with a marshalled agent-session context routes via context.session, ignoring context.sessions", async () => {
    const session = makeAgentSession(CHAT_SESSION_RESOURCE);
    const otherSession = makeAgentSession(URI.from({ scheme: "agent-host-copilotcli", path: "/other" }));
    const marshalled = {
      $mid: MarshalledId.AgentSessionContext,
      session,
      sessions: [session, otherSession]
    };
    const opened = await invokeWithContext(marshalled);
    assert.deepStrictEqual(opened, [{ resource: agentSessionSettingsUri(BACKEND_SESSION), pinned: true }]);
  });
  test("run() with no context does not open anything (no last-focused-session inference)", async () => {
    const opened = await invokeWithContext(void 0);
    assert.deepStrictEqual(opened, []);
  });
  test("run() with a non-agent-host session resource does not open anything", async () => {
    const session = makeAgentSession(URI.from({ scheme: "somethingElse", path: "/x" }));
    const opened = await invokeWithContext(session);
    assert.deepStrictEqual(opened, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHR5cGUgSU1lbnVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyB0eXBlIENvbnRleHRLZXlFeHByZXNzaW9uLCB0eXBlIENvbnRleHRLZXlWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UsIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiwgSU5vdGlmaWNhdGlvbiwgU2Vzc2lvbkFjdGlvbiwgVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFN0YXRlQ29tcG9uZW50cywgdHlwZSBDb21wb25lbnRUb1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uTGlmZWN5Y2xlLCBTZXNzaW9uU3RhdHVzLCB0eXBlIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiwgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQge1xuXHRhZ2VudFNlc3Npb25TZXR0aW5nc1VyaSxcblx0QUdFTlRfU0VTU0lPTl9TRVRUSU5HU19TQ0hFTUUsXG5cdEFnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLFxuXHRBZ2VudFNlc3Npb25TZXR0aW5nc1NjaGVtYVJlZ2lzdHJhcixcbn0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRTZXNzaW9uU2V0dGluZ3MuY29udHJpYnV0aW9uLmpzJztcblxuY29uc3QgQ0hBVF9TRVNTSU9OX1JFU09VUkNFID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCBwYXRoOiAnL2FiYy0xMjMnIH0pO1xuY29uc3QgQkFDS0VORF9TRVNTSU9OID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90Y2xpJywgcGF0aDogJy9hYmMtMTIzJyB9KTtcblxuY2xhc3MgRmFrZVNlc3Npb25TdWJzY3JpcHRpb24gaW1wbGVtZW50cyBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxTZXNzaW9uU3RhdGU+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uV2lsbEFwcGx5QWN0aW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRBcHBseUFjdGlvbiA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSBfdmFsdWU6IFNlc3Npb25TdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdGdldCB2YWx1ZSgpOiBTZXNzaW9uU3RhdGUgfCBFcnJvciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxuXHRnZXQgdmVyaWZpZWRWYWx1ZSgpOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fdmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IHVuZGVmaW5lZCA6IHRoaXMuX3ZhbHVlOyB9XG5cblx0c2V0U3RhdGUoc3RhdGU6IFNlc3Npb25TdGF0ZSB8IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsdWUgPSBzdGF0ZTtcblx0XHRpZiAoIShzdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXBwbHlSZXBsYWNlKGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3ZhbHVlIHx8IHRoaXMuX3ZhbHVlIGluc3RhbmNlb2YgRXJyb3IgfHwgIXRoaXMuX3ZhbHVlLmNvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl92YWx1ZSA9IHsgLi4udGhpcy5fdmFsdWUsIGNvbmZpZzogeyAuLi50aGlzLl92YWx1ZS5jb25maWcsIHZhbHVlczogeyAuLi5jb25maWcgfSB9IH07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0aGlzLl92YWx1ZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVN1YnNjcmlwdGlvbkVudHJ5IHtcblx0cmVhZG9ubHkgc3ViOiBGYWtlU2Vzc2lvblN1YnNjcmlwdGlvbjtcblx0YWNxdWlyZUNvdW50OiBudW1iZXI7XG5cdGRpc3Bvc2VDb3VudDogbnVtYmVyO1xufVxuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdFN0YXJ0ID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RFeGl0ID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3Rpb24gPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZE5vdGlmaWNhdGlvbjogRXZlbnQ8SU5vdGlmaWNhdGlvbj4gPSBFdmVudC5Ob25lO1xuXG5cdHJlYWRvbmx5IGRpc3BhdGNoZWRBY3Rpb25zOiB7IGNoYW5uZWw6IHN0cmluZzsgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9W10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJzID0gbmV3IE1hcDxzdHJpbmcsIElTdWJzY3JpcHRpb25FbnRyeT4oKTtcblxuXHRwcml2YXRlIF9lbnRyeShyZXNvdXJjZTogVVJJKTogSVN1YnNjcmlwdGlvbkVudHJ5IHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGxldCBlbnRyeSA9IHRoaXMuX3N1YnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0ZW50cnkgPSB7IHN1YjogbmV3IEZha2VTZXNzaW9uU3Vic2NyaXB0aW9uKCksIGFjcXVpcmVDb3VudDogMCwgZGlzcG9zZUNvdW50OiAwIH07XG5cdFx0XHR0aGlzLl9zdWJzLnNldChrZXksIGVudHJ5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U3Vic2NyaXB0aW9uPFQgZXh0ZW5kcyBTdGF0ZUNvbXBvbmVudHM+KF9raW5kOiBULCByZXNvdXJjZTogVVJJLCBfb3duZXI6IHN0cmluZyk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPENvbXBvbmVudFRvU3RhdGVbVF0+PiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyeShyZXNvdXJjZSk7XG5cdFx0ZW50cnkuYWNxdWlyZUNvdW50Kys7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogZW50cnkuc3ViIGFzIHVua25vd24gYXMgSUFnZW50U3Vic2NyaXB0aW9uPENvbXBvbmVudFRvU3RhdGVbVF0+LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyBlbnRyeS5kaXNwb3NlQ291bnQrKzsgfSxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQgZXh0ZW5kcyBTdGF0ZUNvbXBvbmVudHM+KF9raW5kOiBULCByZXNvdXJjZTogVVJJKTogSUFnZW50U3Vic2NyaXB0aW9uPENvbXBvbmVudFRvU3RhdGVbVF0+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiBlbnRyeT8uc3ViIGFzIHVua25vd24gYXMgSUFnZW50U3Vic2NyaXB0aW9uPENvbXBvbmVudFRvU3RhdGVbVF0+IHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uIH0pO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3Vicy5nZXQoY2hhbm5lbCk7XG5cdFx0aWYgKGVudHJ5ICYmIGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkKSB7XG5cdFx0XHRlbnRyeS5zdWIuYXBwbHlSZXBsYWNlKChhY3Rpb24gYXMgeyBjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0pLmNvbmZpZyk7XG5cdFx0fVxuXHR9XG5cblx0c2V0U2Vzc2lvblN0YXRlKHJlc291cmNlOiBVUkksIHN0YXRlOiBTZXNzaW9uU3RhdGUgfCBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX2VudHJ5KHJlc291cmNlKS5zdWIuc2V0U3RhdGUoc3RhdGUpO1xuXHR9XG5cblx0YWNxdWlyZUNvdW50KHJlc291cmNlOiBVUkkpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdWJzLmdldChyZXNvdXJjZS50b1N0cmluZygpKT8uYWNxdWlyZUNvdW50ID8/IDA7XG5cdH1cblxuXHRkaXNwb3NlQ291bnQocmVzb3VyY2U6IFVSSSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpPy5kaXNwb3NlQ291bnQgPz8gMDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9zdWJzLnZhbHVlcygpKSB7XG5cdFx0XHRlbnRyeS5zdWIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlU2Vzc2lvblN0YXRlKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4sIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSk6IFNlc3Npb25TdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHR0aXRsZTogJ1Rlc3Qgc2Vzc2lvbicsXG5cdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdGNoYXRzOiBbXSxcblx0XHRjb25maWc6IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllcyB9LFxuXHRcdFx0dmFsdWVzLFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlYWRKc29uKGJ1ZjogVWludDhBcnJheSk6IHVua25vd24ge1xuXHRjb25zdCB0ZXh0ID0gVlNCdWZmZXIud3JhcChidWYpLnRvU3RyaW5nKCk7XG5cdHJldHVybiBKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKHRleHQuaW5kZXhPZigneycpKSk7XG59XG5cbi8qKlxuICogQSB7QGxpbmsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlfSB3aG9zZSBgY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmVgXG4gKiBwb2xpY3kgdmFsdWUgaXMgcGlubmVkIHRvIGBmYWxzZWAsIHNpbXVsYXRpbmcgYW4gb3JnYW5pemF0aW9uIHBvbGljeSB0aGF0XG4gKiBkaXNhYmxlcyBhdXRvLWFwcHJvdmFsLiBNaXJyb3JzIHRoZSBpZGVudGljYWwgaGVscGVyIGluXG4gKiBgdnMvc2Vzc2lvbnMvY29udHJpYi9wcm92aWRlcnMvYWdlbnRIb3N0L3Rlc3QvYnJvd3Nlci9sb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIudGVzdC50c2AuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVBvbGljeVJlc3RyaWN0ZWRDb25maWd1cmF0aW9uU2VydmljZSgpOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRvdmVycmlkZSBpbnNwZWN0PFQ+KGtleTogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBiYXNlID0gc3VwZXIuaW5zcGVjdDxUPihrZXkpO1xuXHRcdFx0aWYgKGtleSA9PT0gJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJykge1xuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBwb2xpY3lWYWx1ZTogZmFsc2UgYXMgdW5rbm93biBhcyBUIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmFzZTtcblx0XHR9XG5cdH0oKTtcbn1cblxuc3VpdGUoJ0FnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyIChlZGl0b3Itd2luZG93IHBlci1zZXNzaW9uIGFkYXB0ZXIpJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlSGFybmVzcyhpbml0aWFsU3RhdGU/OiBTZXNzaW9uU3RhdGUgfCBFcnJvciwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkge1xuXHRcdGNvbnN0IGFnZW50SG9zdFNlcnZpY2UgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiBhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0XHRpZiAoaW5pdGlhbFN0YXRlKSB7XG5cdFx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFNlc3Npb25TdGF0ZShCQUNLRU5EX1NFU1NJT04sIGluaXRpYWxTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUFnZW50SG9zdFNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2VdLFxuXHRcdFx0W0lDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2VdLFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0KSkpO1xuXG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cmFyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvblNldHRpbmdzU2NoZW1hUmVnaXN0cmFyKSk7XG5cdFx0Y29uc3QgZnMgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIsIHNjaGVtYVJlZ2lzdHJhcikpO1xuXG5cdFx0cmV0dXJuIHsgZnMsIGFnZW50SG9zdFNlcnZpY2UsIHVyaTogYWdlbnRTZXNzaW9uU2V0dGluZ3NVcmkoQkFDS0VORF9TRVNTSU9OKSB9O1xuXHR9XG5cblx0dGVzdCgnVVJJIHJvdXRpbmc6IGVuY29kZXMgYW5kIHJvdW5kLXRyaXBzIHRoZSBiYWNrZW5kIHNlc3Npb24gVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IGFnZW50U2Vzc2lvblNldHRpbmdzVXJpKEJBQ0tFTkRfU0VTU0lPTik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5zY2hlbWUsIEFHRU5UX1NFU1NJT05fU0VUVElOR1NfU0NIRU1FKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLmF1dGhvcml0eSwgJ2NvcGlsb3RjbGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvYWJjLTEyMy5qc29uYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBmaWx0ZXJzIHRvIHNlc3Npb24tbXV0YWJsZSwgbm9uLXJlYWRPbmx5IHByb3BlcnRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWyd3b3JrdHJlZSddIH0sIC8vIG5vbi1tdXRhYmxlIFx1MjAxNCBvbWl0dGVkXG5cdFx0XHRicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIHJlYWRPbmx5OiB0cnVlLCBlbnVtOiBbJ21haW4nXSB9LCAvLyByZWFkT25seSBcdTIwMTQgb21pdHRlZFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9KSk7XG5cblx0XHRjb25zdCBwYXJzZWQgPSByZWFkSnNvbihhd2FpdCBmcy5yZWFkRmlsZSh1cmkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBiZWZvcmUgYW55IHNlc3Npb24gc3RhdGUgaGFzIGFycml2ZWQgcmV0dXJucyBhbiBlbXB0eSBkb2N1bWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRKc29uKGF3YWl0IGZzLnJlYWRGaWxlKHVyaSkpLCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIGludmFsaWQgSlNPTiB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe30sIHt9KSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBub3QganNvbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBkaXNwYXRjaGVzIFNlc3Npb25Db25maWdDaGFuZ2VkIHdpdGggcmVwbGFjZTp0cnVlIHRvIHRoZSBiYWNrZW5kIHNlc3Npb24gY2hhbm5lbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiYXV0b0FwcHJvdmVcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgeyBjaGFubmVsLCBhY3Rpb24gfSA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5uZWwsIEJBQ0tFTkRfU0VTU0lPTi50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYWN0aW9uIGFzIHsgcmVwbGFjZT86IGJvb2xlYW4gfSkucmVwbGFjZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBwcmVzZXJ2ZXMgbm9uLWVkaXRhYmxlIHZhbHVlcyBhbmQgY2xlYXJzIGFuIG9taXR0ZWQgZWRpdGFibGUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRtb2RlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ01vZGUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0aXNvbGF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0lzb2xhdGlvbicsIGVudW06IFsnd29ya3RyZWUnXSB9LCAvLyBub24tbXV0YWJsZSwgbXVzdCBiZSBwcmVzZXJ2ZWRcblx0XHRcdGJyYW5jaDogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdCcmFuY2gnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgcmVhZE9ubHk6IHRydWUsIGVudW06IFsnbWFpbiddIH0sIC8vIHJlYWRPbmx5LCBtdXN0IGJlIHByZXNlcnZlZFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2EnLCBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0pKTtcblxuXHRcdC8vIE9taXQgYG1vZGVgIGVudGlyZWx5IFx1MjAxNCBpdCBzaG91bGQgYmUgY2xlYXJlZCwgbm90IGRlZmF1bHRlZC5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyB7IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5jb25maWcsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5oYXNPd24oYWN0aW9uLmNvbmZpZywgJ21vZGUnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgY2xhbXBzIGF1dG9BcHByb3ZlIHRvIGRlZmF1bHQgd2hlbiBvcmcgcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZScsICdhdXRvcGlsb3QnXSB9LFxuXHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIG1vZGU6ICdhJyB9KSwgY3JlYXRlUG9saWN5UmVzdHJpY3RlZENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gVGhlIHVzZXIgZWRpdHMgdGhlIEpTT05DIGRvY3VtZW50IGRpcmVjdGx5IHRvIHJlcXVlc3QgYW4gZWxldmF0ZWRcblx0XHQvLyBhdXRvLWFwcHJvdmUgbGV2ZWwgYW5kIGEgcGxhaW4sIHVucmVzdHJpY3RlZCBgbW9kZWAgY2hhbmdlLlxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9waWxvdFwiLCBcIm1vZGVcIjogXCJiXCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF0uYWN0aW9uIGFzIHsgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9O1xuXHRcdC8vIGF1dG9BcHByb3ZlIGlzIGNsYW1wZWQgYmFjayB0byAnZGVmYXVsdCcgZGVzcGl0ZSB0aGUgcmVxdWVzdGVkICdhdXRvcGlsb3QnIHZhbHVlO1xuXHRcdC8vIHRoZSB1bnJlc3RyaWN0ZWQgYG1vZGVgIHByb3BlcnR5IHBhc3NlcyB0aHJvdWdoIHVuY2hhbmdlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5jb25maWcsIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2InIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgcGFzc2VzIGF1dG9BcHByb3ZlIHRocm91Z2ggdW5jaGFuZ2VkIHdoZW4gb3JnIHBvbGljeSBkb2VzIG5vdCByZXN0cmljdCBhdXRvLWFwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZScsICdhdXRvcGlsb3QnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9waWxvdFwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyB7IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5jb25maWcsIHsgYXV0b0FwcHJvdmU6ICdhdXRvcGlsb3QnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZG9lcyBub3QgZGlzcGF0Y2ggd2hlbiB0aGUgb25seSByZXF1ZXN0ZWQgY2hhbmdlIGlzIGNsYW1wZWQgYXdheSBieSBwb2xpY3knLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZScsICdhdXRvcGlsb3QnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSwgY3JlYXRlUG9saWN5UmVzdHJpY3RlZENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gQWxyZWFkeSAnZGVmYXVsdCc7IHRoZSByZXF1ZXN0ZWQgJ2F1dG9BcHByb3ZlJyBjbGFtcHMgcmlnaHQgYmFjayB0b1xuXHRcdC8vIHRoZSBjdXJyZW50IHZhbHVlLCBzbyBub3RoaW5nIGhhcyBhY3R1YWxseSBjaGFuZ2VkLlxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9BcHByb3ZlXCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIHN0cnVjdHVyYWxseSB1bmNoYW5nZWQgdmFsdWVzIGRvZXMgbm90IGRpc3BhdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJkZWZhdWx0XCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aGVuIG5vIHNlc3Npb24gc3RhdGUgaGFzIGFycml2ZWQgeWV0IGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKCk7XG5cblx0XHRjb25zdCBldmVudHM6IFVSSVtdID0gW107XG5cdFx0c3RvcmUuYWRkKGZzLm9uRGlkQ2hhbmdlRmlsZShjaGFuZ2VzID0+IHsgZm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHsgZXZlbnRzLnB1c2goYy5yZXNvdXJjZSk7IH0gfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiZGVmYXVsdFwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgcmVmbGVjdHMgdGhlIGxpdmUgc3Vic2NyaXB0aW9uXFwncyBvcHRpbWlzdGljIHZhbHVlIGFmdGVyIGEgcmVwbGFjZSBkaXNwYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiYXV0b0FwcHJvdmVcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZEpzb24oYXdhaXQgZnMucmVhZEZpbGUodXJpKSksIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlRmlsZSBmaXJlcyB3aGVuIHRoZSBiYWNrZW5kIHNlc3Npb24gcHVibGlzaGVzIG5ldyBzdGF0ZSB3aGlsZSB3YXRjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHt9LCB7fSkpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IGxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQobGlzdGVuZXJzKTtcblx0XHRsaXN0ZW5lcnMuYWRkKGZzLm9uRGlkQ2hhbmdlRmlsZShjaGFuZ2VzID0+IHsgZm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHsgZXZlbnRzLnB1c2goYy5yZXNvdXJjZSk7IH0gfSkpO1xuXHRcdGxpc3RlbmVycy5hZGQoZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KSk7XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFNlc3Npb25TdGF0ZShCQUNLRU5EX1NFU1NJT04sIG1ha2VTZXNzaW9uU3RhdGUoe30sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gc3RhdGUgZXJyb3IgbGVhdmVzIGNvbmZpZyB1bmF2YWlsYWJsZSAoZW1wdHkgZG9jdW1lbnQsIHdyaXRlIGlnbm9yZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhuZXcgRXJyb3IoJ3Nlc3Npb24gZGlzY29ubmVjdGVkJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkSnNvbihhd2FpdCBmcy5yZWFkRmlsZSh1cmkpKSwge30pO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiZGVmYXVsdFwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucyBhcyByZWFkb25seSB1bmtub3duW10sIFtdKTtcblx0fSk7XG5cblx0c3VpdGUoJ3N1YnNjcmlwdGlvbiBsaWZlY3ljbGUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZWFkRmlsZSBhY3F1aXJlcyBhbmQgcmVsZWFzZXMgaXRzIG93biBzY29wZWQgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe30sIHt9KSk7XG5cblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmFjcXVpcmVDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxLCAndGhlIHJlZmVyZW5jZSBhY3F1aXJlZCBmb3IgcmVhZEZpbGUgaXMgcmVsZWFzZWQgb25jZSB0aGUgY2FsbCBjb21wbGV0ZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0YXQgYW5kIHdyaXRlRmlsZSBhbHNvIGFjcXVpcmUgYW5kIHJlbGVhc2UgdGhlaXIgb3duIHNjb3BlZCByZWZlcmVuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7fSwge30pKTtcblxuXHRcdFx0YXdhaXQgZnMuc3RhdCh1cmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuYWNxdWlyZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDEpO1xuXG5cdFx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5hY3F1aXJlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3YXRjaCBhY3F1aXJlcyBpdHMgb3duIHJlZmVyZW5jZSBhbmQgaG9sZHMgaXQgdW50aWwgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7fSwge30pKTtcblxuXHRcdFx0Y29uc3Qgd2F0Y2gxID0gZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmFjcXVpcmVDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAwKTtcblxuXHRcdFx0d2F0Y2gxLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHdhdGNoZXMgZWFjaCBhY3F1aXJlIGFuZCByZWxlYXNlIHRoZWlyIG93biByZWZlcmVuY2UgaW5kZXBlbmRlbnRseScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHt9LCB7fSkpO1xuXG5cdFx0XHRjb25zdCB3YXRjaDEgPSBmcy53YXRjaCh1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdFx0Y29uc3Qgd2F0Y2gyID0gZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblxuXHRcdFx0Ly8gRXZlcnkgcmVzb2x1dGlvbiBhY3F1aXJlcyBpdHMgb3duIHJlZmVyZW5jZSBcdTIwMTQgdGhlIHByb3ZpZGVyIGtlZXBzXG5cdFx0XHQvLyBubyBjYWNoZS9yZWZjb3VudCBtYXA7IHRoZSB1bmRlcmx5aW5nIElBZ2VudEhvc3RTZXJ2aWNlIGlzXG5cdFx0XHQvLyByZXNwb25zaWJsZSBmb3IgZGVkdXBpbmcvcmVmY291bnRpbmcgYSBzaGFyZWQgc3Vic2NyaXB0aW9uLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuYWNxdWlyZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDIpO1xuXG5cdFx0XHR3YXRjaDEuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDEsICdkaXNwb3Npbmcgb25lIHdhdGNoIHJlbGVhc2VzIG9ubHkgaXRzIG93biByZWZlcmVuY2UnKTtcblxuXHRcdFx0d2F0Y2gyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAyLCAnZGlzcG9zaW5nIHRoZSBzZWNvbmQgd2F0Y2ggcmVsZWFzZXMgaXRzIG93biByZWZlcmVuY2UgdG9vJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkRmlsZSB3aGlsZSBhIHdhdGNoIGlzIGFjdGl2ZSByZWxlYXNlcyBvbmx5IGl0cyBvd24gcmVmZXJlbmNlLCBsZWF2aW5nIHRoZSB3YXRjaFxcJ3MgcmVmZXJlbmNlIGhlbGQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7fSwge30pKTtcblxuXHRcdFx0Y29uc3Qgd2F0Y2ggPSBmcy53YXRjaCh1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuYWNxdWlyZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDEpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuYWNxdWlyZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDEsICdyZWFkRmlsZSByZWxlYXNlZCBpdHMgb3duIHJlZmVyZW5jZTsgdGhlIHdhdGNoIHJlZmVyZW5jZSBpcyBzdGlsbCBoZWxkJyk7XG5cblx0XHRcdHdhdGNoLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NjaGVtYSByZWdpc3RyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0XHRjb25zdCBzY2hlbWFJZCA9IGB2c2NvZGU6Ly9zY2hlbWFzL2FnZW50LXNlc3Npb24tc2V0dGluZ3MvY29waWxvdGNsaS9hYmMtMTIzLmpzb25jYDtcblxuXHRcdHRlc3QoJ3JlYWRGaWxlIGxhemlseSByZWdpc3RlcnMgYSBzY2hlbWEgKyBhc3NvY2lhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQXNzb2NpYXRpb25zKClbc2NoZW1hSWRdLCBbdXJpLnRvU3RyaW5nKCldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjaGVtYSBpcyByZWZyZXNoZWQgb24gdGhlIG5leHQgcmVhZCBhZnRlciBzZXNzaW9uIHN0YXRlIGNoYW5nZXMgd2l0aCBhIG5ldyBzY2hlbWEgaWRlbnRpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBVbmxpa2UgdGhlIGFtYmllbnQgaG9zdCByZWdpc3RyYXIsIHRoZSBwZXItc2Vzc2lvbiByZWdpc3RyYXJcblx0XHRcdC8vIGRvZXMgbm90IGhvbGQgaXRzIG93biBzdWJzY3JpcHRpb24vbGlzdGVuZXIgKGJ5IGRlc2lnbiBcdTIwMTQgc2VlXG5cdFx0XHQvLyBhZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlci50cyk7IGl0IHJlZnJlc2hlc1xuXHRcdFx0Ly8gbGF6aWx5IHdoZW5ldmVyIGByZWFkRmlsZWAgbmV4dCBjYWxscyBgZW5zdXJlUmVnaXN0ZXJlZGAsXG5cdFx0XHQvLyB3aGljaCBpcyBhbHNvIGhvdyBhIHJlYWwgb3BlbiBlZGl0b3IgcGlja3MgdXAgYSBjaGFuZ2UgKGl0XG5cdFx0XHQvLyByZS1yZWFkcyBhZnRlciB0aGUgZmlsZXN5c3RlbSBwcm92aWRlcidzIGBvbkRpZENoYW5nZUZpbGVgKS5cblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5vayhpbml0aWFsKTtcblxuXHRcdFx0YWdlbnRIb3N0U2VydmljZS5zZXRTZXNzaW9uU3RhdGUoQkFDS0VORF9TRVNTSU9OLCBtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2EnLCAnYiddIH0sXG5cdFx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIG1vZGU6ICdhJyB9KSk7XG5cblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cblx0XHRcdGNvbnN0IHJlZnJlc2hlZCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZWZyZXNoZWQsIGluaXRpYWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZnJlc2hlZC5wcm9wZXJ0aWVzPy5bJ21vZGUnXSwgJ3JlZnJlc2hlZCBzY2hlbWEgc2hvdWxkIGluY2x1ZGUgdGhlIG5ld2x5IGFkZGVkIHByb3BlcnR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY2hlbWEgaXMgZGlzcG9zZWQgd2hlbiB0aGUgZmlsZXN5c3RlbSBwcm92aWRlciBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50SG9zdFNlcnZpY2UgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZSgpIH0pO1xuXHRcdFx0YWdlbnRIb3N0U2VydmljZS5zZXRTZXNzaW9uU3RhdGUoQkFDS0VORF9TRVNTSU9OLCBtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0XHRbSUFnZW50SG9zdFNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2VdLFxuXHRcdFx0XHRbSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCldLFxuXHRcdFx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHRcdCkpO1xuXHRcdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cmFyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uU2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIpO1xuXHRcdFx0Y29uc3QgZnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciwgc2NoZW1hUmVnaXN0cmFyKTtcblxuXHRcdFx0Y29uc3QgdXJpID0gYWdlbnRTZXNzaW9uU2V0dGluZ3NVcmkoQkFDS0VORF9TRVNTSU9OKTtcblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIHRydWUpO1xuXG5cdFx0XHRmcy5kaXNwb3NlKCk7XG5cdFx0XHRzY2hlbWFSZWdpc3RyYXIuZGlzcG9zZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuQWdlbnRTZXNzaW9uU2V0dGluZ3MnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBBQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5BZ2VudFNlc3Npb25TZXR0aW5ncyc7XG5cblx0ZnVuY3Rpb24gZXZhbFdoZW4od2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIHZhbHVlczogUmVjb3JkPHN0cmluZywgQ29udGV4dEtleVZhbHVlPik6IGJvb2xlYW4ge1xuXHRcdGFzc2VydC5vayh3aGVuLCAnZXhwZWN0ZWQgYSB3aGVuIGNsYXVzZScpO1xuXHRcdHJldHVybiB3aGVuLmV2YWx1YXRlKHsgZ2V0VmFsdWU6IDxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZykgPT4gdmFsdWVzW2tleV0gYXMgVCB9KTtcblx0fVxuXG5cdHRlc3QoJ2lzIE5PVCByZWdpc3RlcmVkIGluIHRoZSBDb21tYW5kIFBhbGV0dGUgKGNvbnRleHQtbWVudS1vbmx5KScsICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuQ29tbWFuZFBhbGV0dGUpXG5cdFx0XHQuZmluZCgoaSk6IGkgaXMgSU1lbnVJdGVtID0+IGlzSU1lbnVJdGVtKGkpICYmIGkuY29tbWFuZC5pZCA9PT0gQUNUSU9OX0lEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZWFycyBpbiB0aGUgbG9jYWwgYWdlbnQtaG9zdCBzZXNzaW9uIGNvbnRleHQgbWVudSwgbm90IGZvciByZW1vdGUgb3Igbm9uLWFnZW50LWhvc3Qgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IE1lbnVSZWdpc3RyeS5nZXRNZW51SXRlbXMoTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0KVxuXHRcdFx0LmZpbmQoKGkpOiBpIGlzIElNZW51SXRlbSA9PiBpc0lNZW51SXRlbShpKSAmJiBpLmNvbW1hbmQuaWQgPT09IEFDVElPTl9JRCk7XG5cdFx0YXNzZXJ0Lm9rKGl0ZW0sICdhZ2VudCBzZXNzaW9ucyBjb250ZXh0IG1lbnUgaXRlbSBpcyByZWdpc3RlcmVkJyk7XG5cblx0XHRjb25zdCBiYXNlID0geyBbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogdHJ1ZSwgW0FHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWS5rZXldOiB0cnVlIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwgeyAuLi5iYXNlLCBbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5XTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmFsV2hlbihpdGVtLndoZW4sIHsgLi4uYmFzZSwgW0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleV06ICdyZW1vdGUtY29waWxvdGNsaScgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZhbFdoZW4oaXRlbS53aGVuLCB7IC4uLmJhc2UsIFtDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5rZXldOiAnY29waWxvdGNsaScgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZhbFdoZW4oaXRlbS53aGVuLCB7IC4uLmJhc2UsIFtDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXldOiBmYWxzZSwgW0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleV06ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIG1ha2VBZ2VudFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElBZ2VudFNlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2V0QXJjaGl2ZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldFBpbm5lZDogKCkgPT4geyB9LFxuXHRcdFx0aXNSZWFkOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNNYXJrZWRVbnJlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2V0UmVhZDogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRTZXNzaW9uO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gaW52b2tlV2l0aENvbnRleHQoY29udGV4dDogSUFnZW50U2Vzc2lvbiB8IElNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkOyBwaW5uZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQgfVtdPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChBQ1RJT05fSUQpO1xuXHRcdGFzc2VydC5vayhjb21tYW5kLCAnY29tbWFuZCBpcyByZWdpc3RlcmVkJyk7XG5cblx0XHRjb25zdCBvcGVuZWQ6IHsgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDsgcGlubmVkOiBib29sZWFuIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3NbMF0gYXMgSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdFx0XHRcdG9wZW5lZC5wdXNoKHsgcmVzb3VyY2U6IGVkaXRvci5yZXNvdXJjZSwgcGlubmVkOiBlZGl0b3Iub3B0aW9ucz8ucGlubmVkIH0pO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gY29tbWFuZC5oYW5kbGVyKGFjY2Vzc29yLCBjb250ZXh0KSk7XG5cdFx0cmV0dXJuIG9wZW5lZDtcblx0fVxuXG5cdHRlc3QoJ3J1bigpIHdpdGggYSBkaXJlY3QgSUFnZW50U2Vzc2lvbiBvcGVucyB0aGUgcm91dGVkIHNlc3Npb24gc2V0dGluZ3MgcmVzb3VyY2UgcGlubmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKENIQVRfU0VTU0lPTl9SRVNPVVJDRSk7XG5cdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgaW52b2tlV2l0aENvbnRleHQoc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZWQsIFt7IHJlc291cmNlOiBhZ2VudFNlc3Npb25TZXR0aW5nc1VyaShCQUNLRU5EX1NFU1NJT04pLCBwaW5uZWQ6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4oKSB3aXRoIGEgbWFyc2hhbGxlZCBhZ2VudC1zZXNzaW9uIGNvbnRleHQgcm91dGVzIHZpYSBjb250ZXh0LnNlc3Npb24sIGlnbm9yaW5nIGNvbnRleHQuc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oQ0hBVF9TRVNTSU9OX1JFU09VUkNFKTtcblx0XHRjb25zdCBvdGhlclNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgcGF0aDogJy9vdGhlcicgfSkpO1xuXHRcdGNvbnN0IG1hcnNoYWxsZWQ6IElNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCA9IHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5BZ2VudFNlc3Npb25Db250ZXh0LFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHNlc3Npb25zOiBbc2Vzc2lvbiwgb3RoZXJTZXNzaW9uXSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgaW52b2tlV2l0aENvbnRleHQobWFyc2hhbGxlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZWQsIFt7IHJlc291cmNlOiBhZ2VudFNlc3Npb25TZXR0aW5nc1VyaShCQUNLRU5EX1NFU1NJT04pLCBwaW5uZWQ6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4oKSB3aXRoIG5vIGNvbnRleHQgZG9lcyBub3Qgb3BlbiBhbnl0aGluZyAobm8gbGFzdC1mb2N1c2VkLXNlc3Npb24gaW5mZXJlbmNlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcGVuZWQgPSBhd2FpdCBpbnZva2VXaXRoQ29udGV4dCh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bigpIHdpdGggYSBub24tYWdlbnQtaG9zdCBzZXNzaW9uIHJlc291cmNlIGRvZXMgbm90IG9wZW4gYW55dGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oVVJJLmZyb20oeyBzY2hlbWU6ICdzb21ldGhpbmdFbHNlJywgcGF0aDogJy94JyB9KSk7XG5cdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgaW52b2tlV2l0aENvbnRleHQoc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZWQsIFtdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUFt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
