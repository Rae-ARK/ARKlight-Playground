import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../platform/actions/common/actions.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ROOT_STATE_URI } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import {
  agentHostSettingsUri,
  AGENT_HOST_SETTINGS_SCHEME,
  AgentHostSettingsFileSystemProvider,
  AgentHostSettingsSchemaRegistrar
} from "../../../browser/agentSessions/agentHost/agentHostSettingsFileSystemProvider.js";
import "../../../browser/agentSessions/agentHost/agentHostSettings.contribution.js";
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.onAgentHostStart = Event.None;
    this.onAgentHostExit = Event.None;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.dispatchedActions = [];
    this._rootStateValue = void 0;
    this._rootStateOnDidChange = new Emitter();
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return self._rootStateValue;
        },
        get verifiedValue() {
          return self._rootStateValue instanceof Error ? void 0 : self._rootStateValue;
        },
        onDidChange: this._rootStateOnDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  setRootState(state) {
    this._rootStateValue = state;
    if (!(state instanceof Error)) {
      this._rootStateOnDidChange.fire(state);
    }
  }
  dispose() {
    this._rootStateOnDidChange.dispose();
  }
}
function makeRootState(properties, values = {}) {
  return {
    agents: [],
    config: {
      schema: { type: "object", properties },
      values
    }
  };
}
suite("AgentHostSettingsFileSystemProvider (ambient editor-window adapter)", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(initialState) {
    const agentHostService = new MockAgentHostService();
    store.add({ dispose: () => agentHostService.dispose() });
    if (initialState) {
      agentHostService.setRootState(initialState);
    }
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [IAgentHostService, agentHostService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));
    return { fs, agentHostService, uri: agentHostSettingsUri() };
  }
  test("URI identity: agent-host-settings://local/settings.jsonc", () => {
    const uri = agentHostSettingsUri();
    assert.strictEqual(uri.scheme, AGENT_HOST_SETTINGS_SCHEME);
    assert.strictEqual(uri.authority, "local");
    assert.strictEqual(uri.path, "/settings.jsonc");
  });
  test("readFile returns root config values as JSON", async () => {
    const { fs, uri } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const parsed = JSON.parse(text.substring(text.indexOf("{")));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("readFile before any root state has arrived returns an empty document", async () => {
    const { fs, uri } = createHarness();
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const parsed = JSON.parse(text.substring(text.indexOf("{")));
    assert.deepStrictEqual(parsed, {});
  });
  test("writeFile with invalid JSON throws", async () => {
    const { fs, uri } = createHarness(makeRootState({}, {}));
    await assert.rejects(async () => {
      await fs.writeFile(uri, VSBuffer.fromString("{ not json").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    });
  });
  test("writeFile with a JSON array throws (not an object)", async () => {
    const { fs, uri } = createHarness(makeRootState({}, {}));
    await assert.rejects(async () => {
      await fs.writeFile(uri, VSBuffer.fromString("[]").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    });
  });
  test("writeFile filters out keys with no schema entry", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    const newContent = VSBuffer.fromString('{ "autoApprove": "autoApprove", "unknownKey": 123 }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "autoApprove" });
  });
  test("writeFile dispatches RootConfigChanged with replace: true to ROOT_STATE_URI", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const { channel, action } = agentHostService.dispatchedActions[0];
    assert.strictEqual(channel, ROOT_STATE_URI);
    assert.strictEqual(action.type, ActionType.RootConfigChanged);
    assert.strictEqual(action.replace, true);
  });
  test("writeFile with structurally unchanged values does not dispatch", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("writeFile optimistically updates the local view before the dispatch round-trips", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const parsed = JSON.parse(text.substring(text.indexOf("{")));
    assert.deepStrictEqual(parsed, { autoApprove: "autoApprove" });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
  });
  test("writeFile when no root config has arrived yet is a no-op", async () => {
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
  test("onDidChangeFile fires when the host publishes a new root state", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({}, {}));
    const events = [];
    const listeners = new DisposableStore();
    store.add(listeners);
    listeners.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    listeners.add(fs.watch(uri, { recursive: false, excludes: [] }));
    agentHostService.setRootState(makeRootState({}, { autoApprove: "default" }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].toString(), uri.toString());
  });
  test("root state hydrates after construction (readFile reflects late-arriving config)", async () => {
    const { fs, uri, agentHostService } = createHarness();
    const initial = await fs.readFile(uri);
    assert.deepStrictEqual(JSON.parse(VSBuffer.wrap(initial).toString().substring(VSBuffer.wrap(initial).toString().indexOf("{"))), {});
    agentHostService.setRootState(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
    }, { autoApprove: "default" }));
    const hydrated = await fs.readFile(uri);
    const text = VSBuffer.wrap(hydrated).toString();
    assert.deepStrictEqual(JSON.parse(text.substring(text.indexOf("{"))), { autoApprove: "default" });
  });
  test("root state error leaves config unavailable (empty document, write ignored)", async () => {
    const { fs, uri, agentHostService } = createHarness(new Error("agent host disconnected"));
    const text = VSBuffer.wrap(await fs.readFile(uri)).toString();
    assert.deepStrictEqual(JSON.parse(text.substring(text.indexOf("{"))), {});
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  suite("schema registration", () => {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    const schemaId = `vscode://schemas/agent-host-settings/local.jsonc`;
    test("readFile lazily registers a schema + association", async () => {
      const { fs, uri } = createHarness(makeRootState({
        autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
      }, { autoApprove: "default" }));
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed when root state changes with a new schema identity", async () => {
      const { fs, uri, agentHostService } = createHarness(makeRootState({
        autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
      }, { autoApprove: "default" }));
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      agentHostService.setRootState(makeRootState({
        autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] },
        mode: { type: "string", title: "Mode", enum: ["a", "b"] }
      }, { autoApprove: "default", mode: "a" }));
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
  });
});
suite("workbench.action.chat.openAgentHostSettings", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const ACTION_ID = "workbench.action.chat.openAgentHostSettings";
  function evalWhen(when, values) {
    assert.ok(when, "expected a when clause");
    return when.evaluate({ getValue: (key) => values[key] });
  }
  test("is registered in the Command Palette gated on chat + agent-host enablement", () => {
    const item = MenuRegistry.getMenuItems(MenuId.CommandPalette).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.ok(item, "command palette item is registered");
    assert.strictEqual(evalWhen(item.when, {
      [ChatContextKeys.enabled.key]: true,
      [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true
    }), true);
    assert.strictEqual(evalWhen(item.when, {
      [ChatContextKeys.enabled.key]: false,
      [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true
    }), false);
    assert.strictEqual(evalWhen(item.when, {
      [ChatContextKeys.enabled.key]: true,
      [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: false
    }), false);
  });
  test("appears in the local agent-host session context menu, not for remote or non-agent-host sessions", () => {
    const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.ok(item, "agent sessions context menu item is registered");
    const base = { [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true };
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "agent-host-copilotcli" }), true);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "remote-copilotcli" }), false);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "copilotcli" }), false);
  });
  test("run() opens the ambient settings resource pinned, ignoring any session context", async () => {
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
    await instantiationService.invokeFunction((accessor) => command.handler(accessor, { providerId: "some-other-provider" }));
    assert.deepStrictEqual(opened, [{ resource: agentHostSettingsUri(), pinned: true }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHR5cGUgSU1lbnVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyB0eXBlIENvbnRleHRLZXlFeHByZXNzaW9uLCB0eXBlIENvbnRleHRLZXlWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UsIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIElOb3RpZmljYXRpb24sIFNlc3Npb25BY3Rpb24sIFRlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBST09UX1NUQVRFX1VSSSwgdHlwZSBDb25maWdQcm9wZXJ0eVNjaGVtYSwgdHlwZSBSb290U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHtcblx0YWdlbnRIb3N0U2V0dGluZ3NVcmksXG5cdEFHRU5UX0hPU1RfU0VUVElOR1NfU0NIRU1FLFxuXHRBZ2VudEhvc3RTZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlcixcblx0QWdlbnRIb3N0U2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIsXG59IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNldHRpbmdzLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmNsYXNzIE1vY2tBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdEV4aXQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uOiBFdmVudDxJTm90aWZpY2F0aW9uPiA9IEV2ZW50Lk5vbmU7XG5cblx0cmVhZG9ubHkgZGlzcGF0Y2hlZEFjdGlvbnM6IHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGRpc3BhdGNoKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hlZEFjdGlvbnMucHVzaCh7IGNoYW5uZWwsIGFjdGlvbiB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Jvb3RTdGF0ZVZhbHVlOiBSb290U3RhdGUgfCBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFN0YXRlT25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxSb290U3RhdGU+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJvb3RTdGF0ZTogSUFnZW50U3Vic2NyaXB0aW9uPFJvb3RTdGF0ZT4gPSAoKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl9yb290U3RhdGVWYWx1ZTsgfSxcblx0XHRcdGdldCB2ZXJpZmllZFZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IHVuZGVmaW5lZCA6IHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdH0pKCk7XG5cblx0c2V0Um9vdFN0YXRlKHN0YXRlOiBSb290U3RhdGUgfCBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0gc3RhdGU7XG5cdFx0aWYgKCEoc3RhdGUgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmZpcmUoc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdFN0YXRlT25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VSb290U3RhdGUocHJvcGVydGllczogUmVjb3JkPHN0cmluZywgQ29uZmlnUHJvcGVydHlTY2hlbWE+LCB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiBSb290U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGFnZW50czogW10sXG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXMgfSxcblx0XHRcdHZhbHVlcyxcblx0XHR9LFxuXHR9O1xufVxuXG5zdWl0ZSgnQWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIgKGFtYmllbnQgZWRpdG9yLXdpbmRvdyBhZGFwdGVyKScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhcm5lc3MoaW5pdGlhbFN0YXRlPzogUm9vdFN0YXRlIHwgRXJyb3IpIHtcblx0XHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlKCkgfSk7XG5cdFx0aWYgKGluaXRpYWxTdGF0ZSkge1xuXHRcdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUoaW5pdGlhbFN0YXRlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJQWdlbnRIb3N0U2VydmljZSwgYWdlbnRIb3N0U2VydmljZV0sXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHQpKSk7XG5cblx0XHRjb25zdCBzY2hlbWFSZWdpc3RyYXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIpKTtcblx0XHRjb25zdCBmcyA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciwgc2NoZW1hUmVnaXN0cmFyKSk7XG5cblx0XHRyZXR1cm4geyBmcywgYWdlbnRIb3N0U2VydmljZSwgdXJpOiBhZ2VudEhvc3RTZXR0aW5nc1VyaSgpIH07XG5cdH1cblxuXHR0ZXN0KCdVUkkgaWRlbnRpdHk6IGFnZW50LWhvc3Qtc2V0dGluZ3M6Ly9sb2NhbC9zZXR0aW5ncy5qc29uYycsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBhZ2VudEhvc3RTZXR0aW5nc1VyaSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuc2NoZW1lLCBBR0VOVF9IT1NUX1NFVFRJTkdTX1NDSEVNRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5hdXRob3JpdHksICdsb2NhbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkucGF0aCwgJy9zZXR0aW5ncy5qc29uYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSByZXR1cm5zIHJvb3QgY29uZmlnIHZhbHVlcyBhcyBKU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGNvbnN0IGJ1ZiA9IGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgdGV4dCA9IFZTQnVmZmVyLndyYXAoYnVmKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodGV4dC5zdWJzdHJpbmcodGV4dC5pbmRleE9mKCd7JykpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBiZWZvcmUgYW55IHJvb3Qgc3RhdGUgaGFzIGFycml2ZWQgcmV0dXJucyBhbiBlbXB0eSBkb2N1bWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MoKTtcblxuXHRcdGNvbnN0IGJ1ZiA9IGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgdGV4dCA9IFZTQnVmZmVyLndyYXAoYnVmKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodGV4dC5zdWJzdHJpbmcodGV4dC5pbmRleE9mKCd7JykpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBpbnZhbGlkIEpTT04gdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHt9LCB7fSkpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgbm90IGpzb24nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBhIEpTT04gYXJyYXkgdGhyb3dzIChub3QgYW4gb2JqZWN0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7fSwge30pKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdbXScpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBmaWx0ZXJzIG91dCBrZXlzIHdpdGggbm8gc2NoZW1hIGVudHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiLCBcInVua25vd25LZXlcIjogMTIzIH1cXG4nKS5idWZmZXI7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgbmV3Q29udGVudCwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF0uYWN0aW9uIGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5jb25maWcsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBkaXNwYXRjaGVzIFJvb3RDb25maWdDaGFuZ2VkIHdpdGggcmVwbGFjZTogdHJ1ZSB0byBST09UX1NUQVRFX1VSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCB7IGNoYW5uZWwsIGFjdGlvbiB9ID0gYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbm5lbCwgUk9PVF9TVEFURV9VUkkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhY3Rpb24gYXMgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKS5yZXBsYWNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIHdpdGggc3RydWN0dXJhbGx5IHVuY2hhbmdlZCB2YWx1ZXMgZG9lcyBub3QgZGlzcGF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VSb290U3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiZGVmYXVsdFwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgb3B0aW1pc3RpY2FsbHkgdXBkYXRlcyB0aGUgbG9jYWwgdmlldyBiZWZvcmUgdGhlIGRpc3BhdGNoIHJvdW5kLXRyaXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9BcHByb3ZlXCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHQvLyBSZS1yZWFkIHdpdGhvdXQgdGhlIGhvc3QgZWNob2luZyBhbnl0aGluZyBiYWNrIFx1MjAxNCB0aGUgb3B0aW1pc3RpY1xuXHRcdC8vIGxvY2FsIGNhY2hlIHNob3VsZCBhbHJlYWR5IHJlZmxlY3QgdGhlIHdyaXRlLlxuXHRcdGNvbnN0IGJ1ZiA9IGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgdGV4dCA9IFZTQnVmZmVyLndyYXAoYnVmKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodGV4dC5zdWJzdHJpbmcodGV4dC5pbmRleE9mKCd7JykpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2hlbiBubyByb290IGNvbmZpZyBoYXMgYXJyaXZlZCB5ZXQgaXMgYSBuby1vcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MoKTtcblxuXHRcdGNvbnN0IGV2ZW50czogVVJJW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZnMub25EaWRDaGFuZ2VGaWxlKGNoYW5nZXMgPT4geyBmb3IgKGNvbnN0IGMgb2YgY2hhbmdlcykgeyBldmVudHMucHVzaChjLnJlc291cmNlKTsgfSB9KSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJkZWZhdWx0XCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZUZpbGUgZmlyZXMgd2hlbiB0aGUgaG9zdCBwdWJsaXNoZXMgYSBuZXcgcm9vdCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7fSwge30pKTtcblxuXHRcdGNvbnN0IGV2ZW50czogVVJJW10gPSBbXTtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGxpc3RlbmVycyk7XG5cdFx0bGlzdGVuZXJzLmFkZChmcy5vbkRpZENoYW5nZUZpbGUoY2hhbmdlcyA9PiB7IGZvciAoY29uc3QgYyBvZiBjaGFuZ2VzKSB7IGV2ZW50cy5wdXNoKGMucmVzb3VyY2UpOyB9IH0pKTtcblx0XHRsaXN0ZW5lcnMuYWRkKGZzLndhdGNoKHVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSkpO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUobWFrZVJvb3RTdGF0ZSh7fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzWzBdLnRvU3RyaW5nKCksIHVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgncm9vdCBzdGF0ZSBoeWRyYXRlcyBhZnRlciBjb25zdHJ1Y3Rpb24gKHJlYWRGaWxlIHJlZmxlY3RzIGxhdGUtYXJyaXZpbmcgY29uZmlnKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MoKTsgLy8gbm8gaW5pdGlhbCBzdGF0ZVxuXG5cdFx0Y29uc3QgaW5pdGlhbCA9IGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKFZTQnVmZmVyLndyYXAoaW5pdGlhbCkudG9TdHJpbmcoKS5zdWJzdHJpbmcoVlNCdWZmZXIud3JhcChpbml0aWFsKS50b1N0cmluZygpLmluZGV4T2YoJ3snKSkpLCB7fSk7XG5cblx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShtYWtlUm9vdFN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGNvbnN0IGh5ZHJhdGVkID0gYXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCB0ZXh0ID0gVlNCdWZmZXIud3JhcChoeWRyYXRlZCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UodGV4dC5zdWJzdHJpbmcodGV4dC5pbmRleE9mKCd7JykpKSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyb290IHN0YXRlIGVycm9yIGxlYXZlcyBjb25maWcgdW5hdmFpbGFibGUgKGVtcHR5IGRvY3VtZW50LCB3cml0ZSBpZ25vcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobmV3IEVycm9yKCdhZ2VudCBob3N0IGRpc2Nvbm5lY3RlZCcpKTtcblxuXHRcdGNvbnN0IHRleHQgPSBWU0J1ZmZlci53cmFwKGF3YWl0IGZzLnJlYWRGaWxlKHVyaSkpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKHRleHQuaW5kZXhPZigneycpKSksIHt9KTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImRlZmF1bHRcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzY2hlbWEgcmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cdFx0Y29uc3Qgc2NoZW1hSWQgPSBgdnNjb2RlOi8vc2NoZW1hcy9hZ2VudC1ob3N0LXNldHRpbmdzL2xvY2FsLmpzb25jYDtcblxuXHRcdHRlc3QoJ3JlYWRGaWxlIGxhemlseSByZWdpc3RlcnMgYSBzY2hlbWEgKyBhc3NvY2lhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0J10gfSxcblx0XHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5oYXNTY2hlbWFDb250ZW50KHNjaGVtYUlkKSwgZmFsc2UpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFBc3NvY2lhdGlvbnMoKVtzY2hlbWFJZF0sIFt1cmkudG9TdHJpbmcoKV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NoZW1hIGlzIHJlZnJlc2hlZCB3aGVuIHJvb3Qgc3RhdGUgY2hhbmdlcyB3aXRoIGEgbmV3IHNjaGVtYSBpZGVudGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0J10gfSxcblx0XHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRjb25zdCBpbml0aWFsID0gc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQ29udHJpYnV0aW9ucygpLnNjaGVtYXNbc2NoZW1hSWRdO1xuXHRcdFx0YXNzZXJ0Lm9rKGluaXRpYWwpO1xuXG5cdFx0XHRhZ2VudEhvc3RTZXJ2aWNlLnNldFJvb3RTdGF0ZShtYWtlUm9vdFN0YXRlKHtcblx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScgfSkpO1xuXG5cdFx0XHRjb25zdCByZWZyZXNoZWQgPSBzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFDb250cmlidXRpb25zKCkuc2NoZW1hc1tzY2hlbWFJZF07XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVmcmVzaGVkLCBpbml0aWFsKTtcblx0XHRcdGFzc2VydC5vayhyZWZyZXNoZWQucHJvcGVydGllcz8uWydtb2RlJ10sICdyZWZyZXNoZWQgc2NoZW1hIHNob3VsZCBpbmNsdWRlIHRoZSBuZXdseSBhZGRlZCBwcm9wZXJ0eScpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5BZ2VudEhvc3RTZXR0aW5ncycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IEFDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbkFnZW50SG9zdFNldHRpbmdzJztcblxuXHRmdW5jdGlvbiBldmFsV2hlbih3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBDb250ZXh0S2V5VmFsdWU+KTogYm9vbGVhbiB7XG5cdFx0YXNzZXJ0Lm9rKHdoZW4sICdleHBlY3RlZCBhIHdoZW4gY2xhdXNlJyk7XG5cdFx0cmV0dXJuIHdoZW4uZXZhbHVhdGUoeyBnZXRWYWx1ZTogPFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWUgPSBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nKSA9PiB2YWx1ZXNba2V5XSBhcyBUIH0pO1xuXHR9XG5cblx0dGVzdCgnaXMgcmVnaXN0ZXJlZCBpbiB0aGUgQ29tbWFuZCBQYWxldHRlIGdhdGVkIG9uIGNoYXQgKyBhZ2VudC1ob3N0IGVuYWJsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IE1lbnVSZWdpc3RyeS5nZXRNZW51SXRlbXMoTWVudUlkLkNvbW1hbmRQYWxldHRlKVxuXHRcdFx0LmZpbmQoKGkpOiBpIGlzIElNZW51SXRlbSA9PiBpc0lNZW51SXRlbShpKSAmJiBpLmNvbW1hbmQuaWQgPT09IEFDVElPTl9JRCk7XG5cdFx0YXNzZXJ0Lm9rKGl0ZW0sICdjb21tYW5kIHBhbGV0dGUgaXRlbSBpcyByZWdpc3RlcmVkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZhbFdoZW4oaXRlbS53aGVuLCB7XG5cdFx0XHRbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogdHJ1ZSxcblx0XHRcdFtBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkua2V5XTogdHJ1ZSxcblx0XHR9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwge1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IGZhbHNlLFxuXHRcdFx0W0FHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWS5rZXldOiB0cnVlLFxuXHRcdH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwge1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IHRydWUsXG5cdFx0XHRbQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZLmtleV06IGZhbHNlLFxuXHRcdH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVhcnMgaW4gdGhlIGxvY2FsIGFnZW50LWhvc3Qgc2Vzc2lvbiBjb250ZXh0IG1lbnUsIG5vdCBmb3IgcmVtb3RlIG9yIG5vbi1hZ2VudC1ob3N0IHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW0gPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dClcblx0XHRcdC5maW5kKChpKTogaSBpcyBJTWVudUl0ZW0gPT4gaXNJTWVudUl0ZW0oaSkgJiYgaS5jb21tYW5kLmlkID09PSBBQ1RJT05fSUQpO1xuXHRcdGFzc2VydC5vayhpdGVtLCAnYWdlbnQgc2Vzc2lvbnMgY29udGV4dCBtZW51IGl0ZW0gaXMgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0Y29uc3QgYmFzZSA9IHsgW0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IHRydWUsIFtBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkua2V5XTogdHJ1ZSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmFsV2hlbihpdGVtLndoZW4sIHsgLi4uYmFzZSwgW0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleV06ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZhbFdoZW4oaXRlbS53aGVuLCB7IC4uLmJhc2UsIFtDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5rZXldOiAncmVtb3RlLWNvcGlsb3RjbGknIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwgeyAuLi5iYXNlLCBbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5XTogJ2NvcGlsb3RjbGknIH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bigpIG9wZW5zIHRoZSBhbWJpZW50IHNldHRpbmdzIHJlc291cmNlIHBpbm5lZCwgaWdub3JpbmcgYW55IHNlc3Npb24gY29udGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEFDVElPTl9JRCk7XG5cdFx0YXNzZXJ0Lm9rKGNvbW1hbmQsICdjb21tYW5kIGlzIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGNvbnN0IG9wZW5lZDogeyByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkOyBwaW5uZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3IoLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXJnc1swXSBhcyBJUmVzb3VyY2VFZGl0b3JJbnB1dDtcblx0XHRcdFx0b3BlbmVkLnB1c2goeyByZXNvdXJjZTogZWRpdG9yLnJlc291cmNlLCBwaW5uZWQ6IGVkaXRvci5vcHRpb25zPy5waW5uZWQgfSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBQYXNzIGEgYm9ndXMgc2Vzc2lvbi1pdGVtLXNoYXBlZCBhcmd1bWVudCB0byBjb25maXJtIGl0J3MgaWdub3JlZCBmb3Igcm91dGluZy5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjb21tYW5kLmhhbmRsZXIoYWNjZXNzb3IsIHsgcHJvdmlkZXJJZDogJ3NvbWUtb3RoZXItcHJvdmlkZXInIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbeyByZXNvdXJjZTogYWdlbnRIb3N0U2V0dGluZ3NVcmkoKSwgcGlubmVkOiB0cnVlIH1dKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxhQUFhLFFBQVEsb0JBQW9DO0FBRWxFLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0NBQXNDO0FBRy9DLFNBQVMsc0JBQWlFO0FBQzFFLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsdUJBQXVCO0FBQ2hDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxPQUFPO0FBRVAsTUFBTSw2QkFBNkIsS0FBd0IsRUFBRTtBQUFBLEVB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
