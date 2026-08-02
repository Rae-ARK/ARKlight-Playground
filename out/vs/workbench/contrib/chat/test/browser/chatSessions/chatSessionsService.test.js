import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { ContextKeyExpr, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { applyCodexAgentHostPreference, ChatSessionsService } from "../../../browser/chatSessions/chatSessions.contribution.js";
import { ChatSessionOptionsMap, SessionType } from "../../../common/chatSessionsService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from "../../../../../../platform/agentHost/common/agentService.js";
import { IsSessionsWindowContext } from "../../../../../common/contextkeys.js";
suite("Codex Agent Host preference", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function isCodexExtensionHostAvailable(options) {
    const configurationService = new TestConfigurationService({
      [AgentHostCodexAgentEnabledSettingId]: options.codexAgentEnabled,
      [CodexPreferAgentHostEditorSettingId]: options.preferAgentHost
    });
    const contextKeyService = store.add(new ContextKeyService(configurationService));
    AGENT_HOST_ENABLED_CONTEXT_KEY.bindTo(contextKeyService).set(options.agentHostEnabled);
    IsSessionsWindowContext.bindTo(contextKeyService).set(options.isSessionsWindow);
    const contribution = applyCodexAgentHostPreference({
      type: SessionType.Codex,
      name: "codex",
      displayName: "Codex",
      description: ""
    });
    const when = ContextKeyExpr.deserialize(contribution.when);
    return !!when && contextKeyService.contextMatchesRules(when);
  }
  test("never surfaces extension-host Codex in the Agents window and replaces it when preferred in the editor", () => {
    assert.deepStrictEqual({
      agentsWindowPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: true, preferAgentHost: true }),
      agentsWindowNotPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: true, preferAgentHost: false }),
      agentsWindowAgentHostDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: false, codexAgentEnabled: false, isSessionsWindow: true, preferAgentHost: false }),
      editorWindowPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: true }),
      editorWindowNotPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: false }),
      agentHostDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: false, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: true }),
      codexAgentDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: false, isSessionsWindow: false, preferAgentHost: true })
    }, {
      agentsWindowPreferred: false,
      agentsWindowNotPreferred: false,
      agentsWindowAgentHostDisabled: false,
      editorWindowPreferred: false,
      editorWindowNotPreferred: true,
      agentHostDisabled: true,
      codexAgentDisabled: true
    });
  });
});
suite.skip("ChatSessionsService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let chatSessionsService;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    chatSessionsService = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  suite("extractFileNameFromLink", () => {
    function callExtractFileNameFromLink(filePath) {
      return chatSessionsService["extractFileNameFromLink"](filePath);
    }
    test("should extract filename from markdown link with link text", () => {
      const input = "Read [README](file:///path/to/README.md) for more info";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Read README for more info");
    });
    test("should extract filename from markdown link without link text", () => {
      const input = "Read [](file:///index.js) for instructions";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Read index.js for instructions");
    });
    test("should extract filename from markdown link with empty link text", () => {
      const input = "Check [  ](file:///config.json) settings";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Check config.json settings");
    });
    test("should handle multiple file links in same string", () => {
      const input = "See [main](file:///main.js) and [utils](file:///utils/helper.ts)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "See main and utils");
    });
    test("should handle file path without extension", () => {
      const input = "Open [](file:///src/components/Button)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Open Button");
    });
    test("should handle deep file paths", () => {
      const input = "Edit [](file:///very/deep/nested/path/to/file.tsx)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Edit file.tsx");
    });
    test("should handle file path that is just a filename", () => {
      const input = "View [script](file:///script.py)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "View script");
    });
    test("should handle link text with special characters", () => {
      const input = "See [App.js (main)](file:///App.js)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "See App.js (main)");
    });
    test("should return original string if no file links present", () => {
      const input = "This is just regular text with no links";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "This is just regular text with no links");
    });
    test("should handle mixed content with file links and regular text", () => {
      const input = "Check [config](file:///config.yml) and visit https://example.com";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Check config and visit https://example.com");
    });
    test("should handle file path with query parameters or fragments", () => {
      const input = "Open [](file:///index.html?param=value#section)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Open index.html?param=value#section");
    });
    test("should handle Windows-style paths", () => {
      const input = "Edit [](file:///C:/Users/user/Documents/file.txt)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Edit file.txt");
    });
    test("should preserve whitespace around replacements", () => {
      const input = "   Check [](file:///test.js)   ";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "   Check test.js   ");
    });
  });
});
suite("ChatSessionsService - getChatSessionItems availability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const GATED_TYPE = "gated-type";
  const UNGATED_TYPE = "ungated-type";
  const gatedKey = new RawContextKey("test.gatedTypeEnabled", false);
  let service;
  let contextKeyService;
  let gatedEnabled;
  class FakeItemController {
    constructor(_type) {
      this._type = _type;
      this._onDidChange = store.add(new Emitter());
      this.onDidChangeChatSessionItems = this._onDidChange.event;
    }
    get items() {
      return [{
        resource: URI.from({ scheme: this._type, path: `/session-1` }),
        label: `${this._type} session`,
        timing: { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 }
      }];
    }
    async refresh() {
    }
  }
  function registerType(type, when) {
    const contribution = { type, name: type, displayName: type, description: "", when };
    store.add(service.registerChatSessionContribution(contribution));
    store.add(service.registerChatSessionItemController(type, new FakeItemController(type)));
  }
  async function resolvedTypes() {
    const types = [];
    for await (const { chatSessionType, items } of service.getChatSessionItems(void 0, CancellationToken.None)) {
      if (items.length > 0) {
        types.push(chatSessionType);
      }
    }
    return types.sort();
  }
  setup(() => {
    const configurationService = new TestConfigurationService();
    contextKeyService = store.add(new ContextKeyService(configurationService));
    gatedEnabled = gatedKey.bindTo(contextKeyService);
    const instantiationService = store.add(workbenchInstantiationService({
      contextKeyService: () => contextKeyService,
      configurationService: () => configurationService
    }, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
    registerType(GATED_TYPE, `${gatedKey.key}`);
    registerType(UNGATED_TYPE, void 0);
  });
  test("excludes a type whose contribution `when` is false", async () => {
    gatedEnabled.set(false);
    assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
  });
  test("includes a type whose contribution `when` is true", async () => {
    gatedEnabled.set(true);
    assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);
  });
  test("reflects a runtime `when` flip without re-registration", async () => {
    gatedEnabled.set(true);
    assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);
    gatedEnabled.set(false);
    assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
  });
});
suite("ChatSessionsService - archive capability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class TestItemController {
    constructor(setChatSessionItemArchived) {
      this.setChatSessionItemArchived = setChatSessionItemArchived;
      this.onDidChangeChatSessionItems = Event.None;
      this.items = [];
    }
    async refresh() {
    }
  }
  let service;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  test("delegates to the registered controller", () => {
    const sessionType = "supported-type";
    const updates = [];
    const controller = new TestItemController((resource2, archived) => updates.push({ resource: resource2.toString(), archived }));
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, controller));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    service.setChatSessionItemArchived(resource, true);
    assert.deepStrictEqual({
      canSetArchived: service.canSetChatSessionItemArchived(resource),
      updates
    }, {
      canSetArchived: true,
      updates: [{ resource: resource.toString(), archived: true }]
    });
  });
  test("reports and rejects an unsupported controller", () => {
    const sessionType = "unsupported-type";
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, new TestItemController()));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    assert.strictEqual(service.canSetChatSessionItemArchived(resource), false);
    assert.throws(() => service.setChatSessionItemArchived(resource, true), /does not support archiving/);
  });
});
suite("ChatSessionsService - read capability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class TestItemController {
    constructor(setChatSessionItemRead) {
      this.setChatSessionItemRead = setChatSessionItemRead;
      this.onDidChangeChatSessionItems = Event.None;
      this.items = [];
    }
    async refresh() {
    }
  }
  let service;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  test("delegates to the registered controller", () => {
    const sessionType = "read-supported-type";
    const updates = [];
    const controller = new TestItemController((resource2, isRead) => updates.push({ resource: resource2.toString(), isRead }));
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, controller));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    service.setChatSessionItemRead(resource, true);
    service.setChatSessionItemRead(resource, false);
    assert.deepStrictEqual({
      canSetRead: service.canSetChatSessionItemRead(resource),
      updates
    }, {
      canSetRead: true,
      updates: [
        { resource: resource.toString(), isRead: true },
        { resource: resource.toString(), isRead: false }
      ]
    });
  });
  test("reports and rejects an unsupported controller", () => {
    const sessionType = "read-unsupported-type";
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, new TestItemController()));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    assert.strictEqual(service.canSetChatSessionItemRead(resource), false);
    assert.throws(() => service.setChatSessionItemRead(resource, true), /does not own read state/);
  });
});
suite("ChatSessionsService - untitled\u2194real session aliases", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  const untitled = URI.from({ scheme: "remoteProvider", path: "/untitled-abc" });
  const real = URI.from({ scheme: "remoteProvider", path: "/real-abc" });
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  test("setMaterializedSessionResource publishes the forward untitled\u2192real mapping", () => {
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0, "no mapping before publish");
    service.registerSessionResourceAlias(untitled, real);
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0, "registerSessionResourceAlias alone does not publish the forward mapping");
    service.setMaterializedSessionResource(untitled, real);
    assert.strictEqual(service.getMaterializedSessionResource(untitled)?.toString(), real.toString());
  });
  test("clearMaterializedSessionResource clears the forward mapping when called with the untitled key", () => {
    service.registerSessionResourceAlias(untitled, real);
    service.setMaterializedSessionResource(untitled, real);
    service.clearMaterializedSessionResource(untitled);
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0);
  });
  test("clearMaterializedSessionResource clears the forward mapping when called with the real value", () => {
    service.registerSessionResourceAlias(untitled, real);
    service.setMaterializedSessionResource(untitled, real);
    service.clearMaterializedSessionResource(real);
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0);
  });
  test("options selected before first send survive disposal of the untitled session", async () => {
    const type = untitled.scheme;
    store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: "" }));
    store.add(service.registerChatSessionContentProvider(type, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    await service.getOrCreateChatSession(untitled, CancellationToken.None);
    service.setSessionOption(untitled, "model", "sonnet");
    service.registerSessionResourceAlias(untitled, real);
    await service.getOrCreateChatSession(real, CancellationToken.None);
    service.setMaterializedSessionResource(untitled, real);
    assert.strictEqual(service.getSessionOption(real, "model"), "sonnet");
    service.clearMaterializedSessionResource(untitled);
    assert.strictEqual(service.getSessionOption(real, "model"), "sonnet");
  });
});
suite("ChatSessionOptionsMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("toStrValueArray", () => {
    test("should return undefined for undefined input", () => {
      assert.strictEqual(ChatSessionOptionsMap.toStrValueArray(void 0), void 0);
    });
    test("should convert a Map to an array of {optionId, value}", () => {
      const map = /* @__PURE__ */ new Map([["models", "gpt-4"], ["repo", "my-repo"]]);
      assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
        { optionId: "models", value: "gpt-4" },
        { optionId: "repo", value: "my-repo" }
      ]);
    });
    test("should extract .id from IChatSessionProviderOptionItem values", () => {
      const map = /* @__PURE__ */ new Map([
        ["agent", { id: "copilot", name: "Copilot" }]
      ]);
      assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
        { optionId: "agent", value: "copilot" }
      ]);
    });
    test("should handle a plain object as if it were a record (defensive fallback)", () => {
      const plainObject = { models: "gpt-4", repo: "my-repo" };
      assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(plainObject), [
        { optionId: "models", value: "gpt-4" },
        { optionId: "repo", value: "my-repo" }
      ]);
    });
  });
  suite("toRecord", () => {
    test("should convert a Map to a record", () => {
      const map = /* @__PURE__ */ new Map([["models", "gpt-4"]]);
      const record = ChatSessionOptionsMap.toRecord(map);
      assert.strictEqual(record["models"], "gpt-4");
    });
    test("should handle a plain object as if it were a record (defensive fallback)", () => {
      const plainObject = { models: "gpt-4" };
      const record = ChatSessionOptionsMap.toRecord(plainObject);
      assert.strictEqual(record["models"], "gpt-4");
    });
  });
  suite("fromRecord", () => {
    test("should convert a record to a Map", () => {
      const map = ChatSessionOptionsMap.fromRecord({ models: "gpt-4", repo: "my-repo" });
      assert.strictEqual(map.get("models"), "gpt-4");
      assert.strictEqual(map.get("repo"), "my-repo");
      assert.strictEqual(map.size, 2);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgYXBwbHlDb2RleEFnZW50SG9zdFByZWZlcmVuY2UsIENoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uT3B0aW9uc01hcCwgSUNoYXRTZXNzaW9uSXRlbSwgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIsIElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGEsIElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgUmVhZG9ubHlDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsIENvZGV4UHJlZmVyQWdlbnRIb3N0RWRpdG9yU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5zdWl0ZSgnQ29kZXggQWdlbnQgSG9zdCBwcmVmZXJlbmNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUob3B0aW9uczoge1xuXHRcdGFnZW50SG9zdEVuYWJsZWQ6IGJvb2xlYW47XG5cdFx0Y29kZXhBZ2VudEVuYWJsZWQ6IGJvb2xlYW47XG5cdFx0aXNTZXNzaW9uc1dpbmRvdzogYm9vbGVhbjtcblx0XHRwcmVmZXJBZ2VudEhvc3Q6IGJvb2xlYW47XG5cdH0pOiBib29sZWFuIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0FnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkU2V0dGluZ0lkXTogb3B0aW9ucy5jb2RleEFnZW50RW5hYmxlZCxcblx0XHRcdFtDb2RleFByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZF06IG9wdGlvbnMucHJlZmVyQWdlbnRIb3N0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldChvcHRpb25zLmFnZW50SG9zdEVuYWJsZWQpO1xuXHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KG9wdGlvbnMuaXNTZXNzaW9uc1dpbmRvdyk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBhcHBseUNvZGV4QWdlbnRIb3N0UHJlZmVyZW5jZSh7XG5cdFx0XHR0eXBlOiBTZXNzaW9uVHlwZS5Db2RleCxcblx0XHRcdG5hbWU6ICdjb2RleCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0NvZGV4Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHR9KTtcblx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoY29udHJpYnV0aW9uLndoZW4pO1xuXHRcdHJldHVybiAhIXdoZW4gJiYgY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3aGVuKTtcblx0fVxuXG5cdHRlc3QoJ25ldmVyIHN1cmZhY2VzIGV4dGVuc2lvbi1ob3N0IENvZGV4IGluIHRoZSBBZ2VudHMgd2luZG93IGFuZCByZXBsYWNlcyBpdCB3aGVuIHByZWZlcnJlZCBpbiB0aGUgZWRpdG9yJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRzV2luZG93UHJlZmVycmVkOiBpc0NvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZSh7IGFnZW50SG9zdEVuYWJsZWQ6IHRydWUsIGNvZGV4QWdlbnRFbmFibGVkOiB0cnVlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlLCBwcmVmZXJBZ2VudEhvc3Q6IHRydWUgfSksXG5cdFx0XHRhZ2VudHNXaW5kb3dOb3RQcmVmZXJyZWQ6IGlzQ29kZXhFeHRlbnNpb25Ib3N0QXZhaWxhYmxlKHsgYWdlbnRIb3N0RW5hYmxlZDogdHJ1ZSwgY29kZXhBZ2VudEVuYWJsZWQ6IHRydWUsIGlzU2Vzc2lvbnNXaW5kb3c6IHRydWUsIHByZWZlckFnZW50SG9zdDogZmFsc2UgfSksXG5cdFx0XHRhZ2VudHNXaW5kb3dBZ2VudEhvc3REaXNhYmxlZDogaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUoeyBhZ2VudEhvc3RFbmFibGVkOiBmYWxzZSwgY29kZXhBZ2VudEVuYWJsZWQ6IGZhbHNlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlLCBwcmVmZXJBZ2VudEhvc3Q6IGZhbHNlIH0pLFxuXHRcdFx0ZWRpdG9yV2luZG93UHJlZmVycmVkOiBpc0NvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZSh7IGFnZW50SG9zdEVuYWJsZWQ6IHRydWUsIGNvZGV4QWdlbnRFbmFibGVkOiB0cnVlLCBpc1Nlc3Npb25zV2luZG93OiBmYWxzZSwgcHJlZmVyQWdlbnRIb3N0OiB0cnVlIH0pLFxuXHRcdFx0ZWRpdG9yV2luZG93Tm90UHJlZmVycmVkOiBpc0NvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZSh7IGFnZW50SG9zdEVuYWJsZWQ6IHRydWUsIGNvZGV4QWdlbnRFbmFibGVkOiB0cnVlLCBpc1Nlc3Npb25zV2luZG93OiBmYWxzZSwgcHJlZmVyQWdlbnRIb3N0OiBmYWxzZSB9KSxcblx0XHRcdGFnZW50SG9zdERpc2FibGVkOiBpc0NvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZSh7IGFnZW50SG9zdEVuYWJsZWQ6IGZhbHNlLCBjb2RleEFnZW50RW5hYmxlZDogdHJ1ZSwgaXNTZXNzaW9uc1dpbmRvdzogZmFsc2UsIHByZWZlckFnZW50SG9zdDogdHJ1ZSB9KSxcblx0XHRcdGNvZGV4QWdlbnREaXNhYmxlZDogaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUoeyBhZ2VudEhvc3RFbmFibGVkOiB0cnVlLCBjb2RleEFnZW50RW5hYmxlZDogZmFsc2UsIGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlLCBwcmVmZXJBZ2VudEhvc3Q6IHRydWUgfSksXG5cdFx0fSwge1xuXHRcdFx0YWdlbnRzV2luZG93UHJlZmVycmVkOiBmYWxzZSxcblx0XHRcdGFnZW50c1dpbmRvd05vdFByZWZlcnJlZDogZmFsc2UsXG5cdFx0XHRhZ2VudHNXaW5kb3dBZ2VudEhvc3REaXNhYmxlZDogZmFsc2UsXG5cdFx0XHRlZGl0b3JXaW5kb3dQcmVmZXJyZWQ6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yV2luZG93Tm90UHJlZmVycmVkOiB0cnVlLFxuXHRcdFx0YWdlbnRIb3N0RGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRjb2RleEFnZW50RGlzYWJsZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlLnNraXAoJ0NoYXRTZXNzaW9uc1NlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGNoYXRTZXNzaW9uc1NlcnZpY2U6IENoYXRTZXNzaW9uc1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uc1NlcnZpY2UpKTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4dHJhY3RGaWxlTmFtZUZyb21MaW5rJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0Ly8gQWNjZXNzIHRoZSBwcml2YXRlIG1ldGhvZCB1c2luZyBicmFja2V0IG5vdGF0aW9uIHdpdGggcHJvcGVyIHR5cGluZ1xuXHRcdFx0dHlwZSBTZXJ2aWNlV2l0aFByaXZhdGVNZXRob2QgPSBSZWNvcmQ8J2V4dHJhY3RGaWxlTmFtZUZyb21MaW5rJywgKGZpbGVQYXRoOiBzdHJpbmcpID0+IHN0cmluZz47XG5cdFx0XHRyZXR1cm4gKGNoYXRTZXNzaW9uc1NlcnZpY2UgYXMgdW5rbm93biBhcyBTZXJ2aWNlV2l0aFByaXZhdGVNZXRob2QpWydleHRyYWN0RmlsZU5hbWVGcm9tTGluayddKGZpbGVQYXRoKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBmaWxlbmFtZSBmcm9tIG1hcmtkb3duIGxpbmsgd2l0aCBsaW5rIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdSZWFkIFtSRUFETUVdKGZpbGU6Ly8vcGF0aC90by9SRUFETUUubWQpIGZvciBtb3JlIGluZm8nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdSZWFkIFJFQURNRSBmb3IgbW9yZSBpbmZvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBmaWxlbmFtZSBmcm9tIG1hcmtkb3duIGxpbmsgd2l0aG91dCBsaW5rIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdSZWFkIFtdKGZpbGU6Ly8vaW5kZXguanMpIGZvciBpbnN0cnVjdGlvbnMnO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdSZWFkIGluZGV4LmpzIGZvciBpbnN0cnVjdGlvbnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGZpbGVuYW1lIGZyb20gbWFya2Rvd24gbGluayB3aXRoIGVtcHR5IGxpbmsgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ0NoZWNrIFsgIF0oZmlsZTovLy9jb25maWcuanNvbikgc2V0dGluZ3MnO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdDaGVjayBjb25maWcuanNvbiBzZXR0aW5ncycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtdWx0aXBsZSBmaWxlIGxpbmtzIGluIHNhbWUgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnU2VlIFttYWluXShmaWxlOi8vL21haW4uanMpIGFuZCBbdXRpbHNdKGZpbGU6Ly8vdXRpbHMvaGVscGVyLnRzKSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ1NlZSBtYWluIGFuZCB1dGlscycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBmaWxlIHBhdGggd2l0aG91dCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdPcGVuIFtdKGZpbGU6Ly8vc3JjL2NvbXBvbmVudHMvQnV0dG9uKSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ09wZW4gQnV0dG9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGRlZXAgZmlsZSBwYXRocycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ0VkaXQgW10oZmlsZTovLy92ZXJ5L2RlZXAvbmVzdGVkL3BhdGgvdG8vZmlsZS50c3gpJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnRWRpdCBmaWxlLnRzeCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBmaWxlIHBhdGggdGhhdCBpcyBqdXN0IGEgZmlsZW5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdWaWV3IFtzY3JpcHRdKGZpbGU6Ly8vc2NyaXB0LnB5KSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ1ZpZXcgc2NyaXB0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGxpbmsgdGV4dCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ1NlZSBbQXBwLmpzIChtYWluKV0oZmlsZTovLy9BcHAuanMpJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnU2VlIEFwcC5qcyAobWFpbiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gb3JpZ2luYWwgc3RyaW5nIGlmIG5vIGZpbGUgbGlua3MgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ1RoaXMgaXMganVzdCByZWd1bGFyIHRleHQgd2l0aCBubyBsaW5rcyc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ1RoaXMgaXMganVzdCByZWd1bGFyIHRleHQgd2l0aCBubyBsaW5rcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCBjb250ZW50IHdpdGggZmlsZSBsaW5rcyBhbmQgcmVndWxhciB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnQ2hlY2sgW2NvbmZpZ10oZmlsZTovLy9jb25maWcueW1sKSBhbmQgdmlzaXQgaHR0cHM6Ly9leGFtcGxlLmNvbSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ0NoZWNrIGNvbmZpZyBhbmQgdmlzaXQgaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBmaWxlIHBhdGggd2l0aCBxdWVyeSBwYXJhbWV0ZXJzIG9yIGZyYWdtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ09wZW4gW10oZmlsZTovLy9pbmRleC5odG1sP3BhcmFtPXZhbHVlI3NlY3Rpb24pJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnT3BlbiBpbmRleC5odG1sP3BhcmFtPXZhbHVlI3NlY3Rpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgV2luZG93cy1zdHlsZSBwYXRocycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ0VkaXQgW10oZmlsZTovLy9DOi9Vc2Vycy91c2VyL0RvY3VtZW50cy9maWxlLnR4dCknO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdFZGl0IGZpbGUudHh0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgd2hpdGVzcGFjZSBhcm91bmQgcmVwbGFjZW1lbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnICAgQ2hlY2sgW10oZmlsZTovLy90ZXN0LmpzKSAgICc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJyAgIENoZWNrIHRlc3QuanMgICAnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRTZXNzaW9uc1NlcnZpY2UgLSBnZXRDaGF0U2Vzc2lvbkl0ZW1zIGF2YWlsYWJpbGl0eScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IEdBVEVEX1RZUEUgPSAnZ2F0ZWQtdHlwZSc7XG5cdGNvbnN0IFVOR0FURURfVFlQRSA9ICd1bmdhdGVkLXR5cGUnO1xuXHRjb25zdCBnYXRlZEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0ZXN0LmdhdGVkVHlwZUVuYWJsZWQnLCBmYWxzZSk7XG5cblx0bGV0IHNlcnZpY2U6IENoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdGxldCBjb250ZXh0S2V5U2VydmljZTogQ29udGV4dEtleVNlcnZpY2U7XG5cdGxldCBnYXRlZEVuYWJsZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBBIG1pbmltYWwgaXRlbSBjb250cm9sbGVyIHRoYXQgaW1tZWRpYXRlbHkgZXhwb3NlcyBhIHNpbmdsZSBzZXNzaW9uIGl0ZW0uXG5cdCAqIFRoaXMgc3RhbmRzIGluIGZvciBhbiBleHRlbnNpb24taG9zdC1yZWdpc3RlcmVkIGNvbnRyb2xsZXIsIHdoaWNoIGlzXG5cdCAqIHJlZ2lzdGVyZWQgaW5kZXBlbmRlbnRseSBvZiB0aGUgY29udHJpYnV0aW9uJ3MgYHdoZW5gIGNsYXVzZS5cblx0ICovXG5cdGNsYXNzIEZha2VJdGVtQ29udHJvbGxlciBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25JdGVtc0RlbHRhPigpKTtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50PElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGE+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF90eXBlOiBzdHJpbmcpIHsgfVxuXG5cdFx0Z2V0IGl0ZW1zKCk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiB0aGlzLl90eXBlLCBwYXRoOiBgL3Nlc3Npb24tMWAgfSksXG5cdFx0XHRcdGxhYmVsOiBgJHt0aGlzLl90eXBlfSBzZXNzaW9uYCxcblx0XHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IDAsIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfSxcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0fVxuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyVHlwZSh0eXBlOiBzdHJpbmcsIHdoZW46IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50ID0geyB0eXBlLCBuYW1lOiB0eXBlLCBkaXNwbGF5TmFtZTogdHlwZSwgZGVzY3JpcHRpb246ICcnLCB3aGVuIH07XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihjb250cmlidXRpb24pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIodHlwZSwgbmV3IEZha2VJdGVtQ29udHJvbGxlcih0eXBlKSkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVzb2x2ZWRUeXBlcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgdHlwZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIGF3YWl0IChjb25zdCB7IGNoYXRTZXNzaW9uVHlwZSwgaXRlbXMgfSBvZiBzZXJ2aWNlLmdldENoYXRTZXNzaW9uSXRlbXModW5kZWZpbmVkLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkge1xuXHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dHlwZXMucHVzaChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZXMuc29ydCgpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGdhdGVkRW5hYmxlZCA9IGdhdGVkS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0fSwgc3RvcmUpKTtcblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uc1NlcnZpY2UpKTtcblxuXHRcdHJlZ2lzdGVyVHlwZShHQVRFRF9UWVBFLCBgJHtnYXRlZEtleS5rZXl9YCk7XG5cdFx0cmVnaXN0ZXJUeXBlKFVOR0FURURfVFlQRSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgYSB0eXBlIHdob3NlIGNvbnRyaWJ1dGlvbiBgd2hlbmAgaXMgZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Z2F0ZWRFbmFibGVkLnNldChmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlZFR5cGVzKCksIFtVTkdBVEVEX1RZUEVdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgYSB0eXBlIHdob3NlIGNvbnRyaWJ1dGlvbiBgd2hlbmAgaXMgdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRnYXRlZEVuYWJsZWQuc2V0KHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZWRUeXBlcygpLCBbR0FURURfVFlQRSwgVU5HQVRFRF9UWVBFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmxlY3RzIGEgcnVudGltZSBgd2hlbmAgZmxpcCB3aXRob3V0IHJlLXJlZ2lzdHJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRnYXRlZEVuYWJsZWQuc2V0KHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZWRUeXBlcygpLCBbR0FURURfVFlQRSwgVU5HQVRFRF9UWVBFXSk7XG5cblx0XHRnYXRlZEVuYWJsZWQuc2V0KGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVkVHlwZXMoKSwgW1VOR0FURURfVFlQRV0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25zU2VydmljZSAtIGFyY2hpdmUgY2FwYWJpbGl0eScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIFRlc3RJdGVtQ29udHJvbGxlciBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIHtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgPSBFdmVudC5Ob25lO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRyZWFkb25seSBzZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZD86IChyZXNvdXJjZTogVVJJLCBhcmNoaXZlZDogYm9vbGVhbikgPT4gdm9pZCxcblx0XHQpIHsgfVxuXG5cdFx0cmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXG5cdFx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHR9XG5cblx0bGV0IHNlcnZpY2U6IENoYXRTZXNzaW9uc1NlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uc1NlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZWdhdGVzIHRvIHRoZSByZWdpc3RlcmVkIGNvbnRyb2xsZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnc3VwcG9ydGVkLXR5cGUnO1xuXHRcdGNvbnN0IHVwZGF0ZXM6IHsgcmVzb3VyY2U6IHN0cmluZzsgYXJjaGl2ZWQ6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBUZXN0SXRlbUNvbnRyb2xsZXIoKHJlc291cmNlLCBhcmNoaXZlZCkgPT4gdXBkYXRlcy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGFyY2hpdmVkIH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHtcblx0XHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0bmFtZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRkaXNwbGF5TmFtZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uVHlwZSwgY29udHJvbGxlcikpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRzZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKHJlc291cmNlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuU2V0QXJjaGl2ZWQ6IHNlcnZpY2UuY2FuU2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQocmVzb3VyY2UpLFxuXHRcdFx0dXBkYXRlcyxcblx0XHR9LCB7XG5cdFx0XHRjYW5TZXRBcmNoaXZlZDogdHJ1ZSxcblx0XHRcdHVwZGF0ZXM6IFt7IHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLCBhcmNoaXZlZDogdHJ1ZSB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhbmQgcmVqZWN0cyBhbiB1bnN1cHBvcnRlZCBjb250cm9sbGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ3Vuc3VwcG9ydGVkLXR5cGUnO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oe1xuXHRcdFx0dHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRuYW1lOiBzZXNzaW9uVHlwZSxcblx0XHRcdGRpc3BsYXlOYW1lOiBzZXNzaW9uVHlwZSxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25UeXBlLCBuZXcgVGVzdEl0ZW1Db250cm9sbGVyKCkpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHNlc3Npb25UeXBlLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuU2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKHJlc291cmNlLCB0cnVlKSwgL2RvZXMgbm90IHN1cHBvcnQgYXJjaGl2aW5nLyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0U2Vzc2lvbnNTZXJ2aWNlIC0gcmVhZCBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdEl0ZW1Db250cm9sbGVyIGltcGxlbWVudHMgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIge1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IEV2ZW50Lk5vbmU7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHJlYWRvbmx5IHNldENoYXRTZXNzaW9uSXRlbVJlYWQ/OiAocmVzb3VyY2U6IFVSSSwgaXNSZWFkOiBib29sZWFuKSA9PiB2b2lkLFxuXHRcdCkgeyB9XG5cblx0XHRyZWFkb25seSBpdGVtczogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0XHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdH1cblxuXHRsZXQgc2VydmljZTogQ2hhdFNlc3Npb25zU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25zU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxlZ2F0ZXMgdG8gdGhlIHJlZ2lzdGVyZWQgY29udHJvbGxlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdyZWFkLXN1cHBvcnRlZC10eXBlJztcblx0XHRjb25zdCB1cGRhdGVzOiB7IHJlc291cmNlOiBzdHJpbmc7IGlzUmVhZDogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFRlc3RJdGVtQ29udHJvbGxlcigocmVzb3VyY2UsIGlzUmVhZCkgPT4gdXBkYXRlcy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGlzUmVhZCB9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7XG5cdFx0XHR0eXBlOiBzZXNzaW9uVHlwZSxcblx0XHRcdG5hbWU6IHNlc3Npb25UeXBlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHNlc3Npb25UeXBlLFxuXHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblR5cGUsIGNvbnRyb2xsZXIpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHNlc3Npb25UeXBlLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0c2VydmljZS5zZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHJlc291cmNlLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbVJlYWQocmVzb3VyY2UsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuU2V0UmVhZDogc2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHJlc291cmNlKSxcblx0XHRcdHVwZGF0ZXMsXG5cdFx0fSwge1xuXHRcdFx0Y2FuU2V0UmVhZDogdHJ1ZSxcblx0XHRcdHVwZGF0ZXM6IFtcblx0XHRcdFx0eyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgaXNSZWFkOiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGlzUmVhZDogZmFsc2UgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYW5kIHJlamVjdHMgYW4gdW5zdXBwb3J0ZWQgY29udHJvbGxlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdyZWFkLXVuc3VwcG9ydGVkLXR5cGUnO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oe1xuXHRcdFx0dHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRuYW1lOiBzZXNzaW9uVHlwZSxcblx0XHRcdGRpc3BsYXlOYW1lOiBzZXNzaW9uVHlwZSxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25UeXBlLCBuZXcgVGVzdEl0ZW1Db250cm9sbGVyKCkpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHNlc3Npb25UeXBlLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuU2V0Q2hhdFNlc3Npb25JdGVtUmVhZChyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHNlcnZpY2Uuc2V0Q2hhdFNlc3Npb25JdGVtUmVhZChyZXNvdXJjZSwgdHJ1ZSksIC9kb2VzIG5vdCBvd24gcmVhZCBzdGF0ZS8pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25zU2VydmljZSAtIHVudGl0bGVkXHUyMTk0cmVhbCBzZXNzaW9uIGFsaWFzZXMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgc2VydmljZTogQ2hhdFNlc3Npb25zU2VydmljZTtcblxuXHRjb25zdCB1bnRpdGxlZCA9IFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlUHJvdmlkZXInLCBwYXRoOiAnL3VudGl0bGVkLWFiYycgfSk7XG5cdGNvbnN0IHJlYWwgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3JlbW90ZVByb3ZpZGVyJywgcGF0aDogJy9yZWFsLWFiYycgfSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uc1NlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlIHB1Ymxpc2hlcyB0aGUgZm9yd2FyZCB1bnRpdGxlZFx1MjE5MnJlYWwgbWFwcGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQpLCB1bmRlZmluZWQsICdubyBtYXBwaW5nIGJlZm9yZSBwdWJsaXNoJyk7XG5cdFx0Ly8gVGhlIGludmVyc2UgYWxpYXMgYWxvbmUgbXVzdCBub3QgcHVibGlzaCB0aGUgZm9yd2FyZCBtYXBwaW5nIChpdCBpcyBvbmx5XG5cdFx0Ly8gcHVibGlzaGVkIG9uY2UgdGhlIHJlYWwgc2Vzc2lvbiBoYXMgbG9hZGVkKS5cblx0XHRzZXJ2aWNlLnJlZ2lzdGVyU2Vzc2lvblJlc291cmNlQWxpYXModW50aXRsZWQsIHJlYWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCksIHVuZGVmaW5lZCwgJ3JlZ2lzdGVyU2Vzc2lvblJlc291cmNlQWxpYXMgYWxvbmUgZG9lcyBub3QgcHVibGlzaCB0aGUgZm9yd2FyZCBtYXBwaW5nJyk7XG5cdFx0c2VydmljZS5zZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQsIHJlYWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCk/LnRvU3RyaW5nKCksIHJlYWwudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyTWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlIGNsZWFycyB0aGUgZm9yd2FyZCBtYXBwaW5nIHdoZW4gY2FsbGVkIHdpdGggdGhlIHVudGl0bGVkIGtleScsICgpID0+IHtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyU2Vzc2lvblJlc291cmNlQWxpYXModW50aXRsZWQsIHJlYWwpO1xuXHRcdHNlcnZpY2Uuc2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkLCByZWFsKTtcblx0XHRzZXJ2aWNlLmNsZWFyTWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhck1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSBjbGVhcnMgdGhlIGZvcndhcmQgbWFwcGluZyB3aGVuIGNhbGxlZCB3aXRoIHRoZSByZWFsIHZhbHVlJywgKCkgPT4ge1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyh1bnRpdGxlZCwgcmVhbCk7XG5cdFx0c2VydmljZS5zZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQsIHJlYWwpO1xuXHRcdHNlcnZpY2UuY2xlYXJNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UocmVhbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnb3B0aW9ucyBzZWxlY3RlZCBiZWZvcmUgZmlyc3Qgc2VuZCBzdXJ2aXZlIGRpc3Bvc2FsIG9mIHRoZSB1bnRpdGxlZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR5cGUgPSB1bnRpdGxlZC5zY2hlbWU7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7IHR5cGUsIG5hbWU6IHR5cGUsIGRpc3BsYXlOYW1lOiB0eXBlLCBkZXNjcmlwdGlvbjogJycgfSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIodHlwZSwge1xuXHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogKHJlc291cmNlOiBVUkkpID0+IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHVudGl0bGVkIHNlc3Npb24gZW50cnkgYW5kIHJlY29yZCBhIHVzZXIgb3B0aW9uIHNlbGVjdGlvbiBvbiBpdC5cblx0XHRhd2FpdCBzZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24odW50aXRsZWQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHNlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbih1bnRpdGxlZCwgJ21vZGVsJywgJ3Nvbm5ldCcpO1xuXG5cdFx0Ly8gTWF0ZXJpYWxpemU6IHJlZ2lzdGVyIHRoZSBpbnZlcnNlIGFsaWFzLCBsb2FkIHRoZSByZWFsIHNlc3Npb24sIHB1Ymxpc2hcblx0XHQvLyB0aGUgZm9yd2FyZCBtYXBwaW5nLlxuXHRcdHNlcnZpY2UucmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyh1bnRpdGxlZCwgcmVhbCk7XG5cdFx0YXdhaXQgc2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlYWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHNlcnZpY2Uuc2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkLCByZWFsKTtcblxuXHRcdC8vIFRoZSByZWFsIHNlc3Npb24gcmVzb2x2ZXMgdGhlIG9wdGlvbiB0aHJvdWdoIHRoZSBpbnZlcnNlIGFsaWFzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVhbCwgJ21vZGVsJyksICdzb25uZXQnKTtcblxuXHRcdC8vIERpc3Bvc2luZyB0aGUgdW50aXRsZWQgbW9kZWwgY2xlYXJzIG9ubHkgdGhlIGZvcndhcmQgbWFwcGluZzsgdGhlIGludmVyc2Vcblx0XHQvLyBhbGlhcyBpcyBpbnRlbnRpb25hbGx5IGtlcHQsIHNvIHRoZSByZWFsIHNlc3Npb24ga2VlcHMgcmVzb2x2aW5nIHRoZVxuXHRcdC8vIG9wdGlvbiB0byB0aGUgdW50aXRsZWQgZW50cnkuXG5cdFx0c2VydmljZS5jbGVhck1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZWFsLCAnbW9kZWwnKSwgJ3Nvbm5ldCcpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25PcHRpb25zTWFwJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCd0b1N0clZhbHVlQXJyYXknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgdW5kZWZpbmVkIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRTZXNzaW9uT3B0aW9uc01hcC50b1N0clZhbHVlQXJyYXkodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb252ZXJ0IGEgTWFwIHRvIGFuIGFycmF5IG9mIHtvcHRpb25JZCwgdmFsdWV9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFwID0gbmV3IE1hcChbWydtb2RlbHMnLCAnZ3B0LTQnXSwgWydyZXBvJywgJ215LXJlcG8nXV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9TdHJWYWx1ZUFycmF5KG1hcCksIFtcblx0XHRcdFx0eyBvcHRpb25JZDogJ21vZGVscycsIHZhbHVlOiAnZ3B0LTQnIH0sXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdyZXBvJywgdmFsdWU6ICdteS1yZXBvJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCAuaWQgZnJvbSBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFwOiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2FnZW50JywgeyBpZDogJ2NvcGlsb3QnLCBuYW1lOiAnQ29waWxvdCcgfV0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQ2hhdFNlc3Npb25PcHRpb25zTWFwLnRvU3RyVmFsdWVBcnJheShtYXApLCBbXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdhZ2VudCcsIHZhbHVlOiAnY29waWxvdCcgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBhIHBsYWluIG9iamVjdCBhcyBpZiBpdCB3ZXJlIGEgcmVjb3JkIChkZWZlbnNpdmUgZmFsbGJhY2spJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGVzIGEgTWFwIHRoYXQgbG9zdCBpdHMgcHJvdG90eXBlIGR1cmluZyBzZXJpYWxpemF0aW9uXG5cdFx0XHRjb25zdCBwbGFpbk9iamVjdCA9IHsgbW9kZWxzOiAnZ3B0LTQnLCByZXBvOiAnbXktcmVwbycgfSBhcyB1bmtub3duIGFzIFJlYWRvbmx5Q2hhdFNlc3Npb25PcHRpb25zTWFwO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9TdHJWYWx1ZUFycmF5KHBsYWluT2JqZWN0KSwgW1xuXHRcdFx0XHR7IG9wdGlvbklkOiAnbW9kZWxzJywgdmFsdWU6ICdncHQtNCcgfSxcblx0XHRcdFx0eyBvcHRpb25JZDogJ3JlcG8nLCB2YWx1ZTogJ215LXJlcG8nIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RvUmVjb3JkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvbnZlcnQgYSBNYXAgdG8gYSByZWNvcmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXAgPSBuZXcgTWFwKFtbJ21vZGVscycsICdncHQtNCddXSk7XG5cdFx0XHRjb25zdCByZWNvcmQgPSBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9SZWNvcmQobWFwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvcmRbJ21vZGVscyddLCAnZ3B0LTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYSBwbGFpbiBvYmplY3QgYXMgaWYgaXQgd2VyZSBhIHJlY29yZCAoZGVmZW5zaXZlIGZhbGxiYWNrKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluT2JqZWN0ID0geyBtb2RlbHM6ICdncHQtNCcgfSBhcyB1bmtub3duIGFzIFJlYWRvbmx5Q2hhdFNlc3Npb25PcHRpb25zTWFwO1xuXHRcdFx0Y29uc3QgcmVjb3JkID0gQ2hhdFNlc3Npb25PcHRpb25zTWFwLnRvUmVjb3JkKHBsYWluT2JqZWN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvcmRbJ21vZGVscyddLCAnZ3B0LTQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Zyb21SZWNvcmQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBhIHJlY29yZCB0byBhIE1hcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcCA9IENoYXRTZXNzaW9uT3B0aW9uc01hcC5mcm9tUmVjb3JkKHsgbW9kZWxzOiAnZ3B0LTQnLCByZXBvOiAnbXktcmVwbycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnbW9kZWxzJyksICdncHQtNCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ3JlcG8nKSwgJ215LXJlcG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMik7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQTZCLHFCQUFxQjtBQUMzRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLCtCQUErQiwyQkFBMkI7QUFD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
