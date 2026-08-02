import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { createSchema, schemaProperty } from "../../common/agentHostSchema.js";
import { AGENT_CUSTOMIZATION_SETTINGS_META_KEY, getAgentCustomizationSettingsEntries } from "../../common/agentCustomizationSettings.js";
import { buildSubagentSessionUri, SessionStatus } from "../../common/state/sessionState.js";
import { AgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
suite("AgentConfigurationService", () => {
  const disposables = new DisposableStore();
  let manager;
  let service;
  const schema = createSchema({
    level: schemaProperty({
      type: "string",
      title: "level",
      enum: ["low", "high"]
    }),
    limit: schemaProperty({ type: "number", title: "limit" })
  });
  function seedSessionConfig(sessionUri, values) {
    assert.ok(manager.getSessionState(sessionUri), `Session not found: ${sessionUri}`);
    manager.setSessionConfig(sessionUri, {
      schema: schema.toProtocol(),
      values
    });
  }
  function seedRootConfig(values) {
    const rootMutable = manager.rootState;
    rootMutable.config = {
      schema: schema.toProtocol(),
      values
    };
  }
  function makeSummary(resource, ...workingDirectories) {
    return {
      resource,
      provider: "copilot",
      title: "t",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///project", displayName: "Project" },
      workingDirectories: workingDirectories.length > 0 ? workingDirectories : void 0
    };
  }
  setup(() => {
    manager = disposables.add(new AgentHostStateManager(new NullLogService()));
    service = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getEffectiveValue", () => {
    test("returns session value when present", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "high" });
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), "high");
    });
    test("falls back to host value when session does not provide the key", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { limit: 5 });
      seedRootConfig({ level: "low" });
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), "low");
    });
    test("inherits from parent subagent session", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent));
      seedSessionConfig(parent, { level: "high" });
      const child = buildSubagentSessionUri(parent, "toolcall-1");
      manager.createSession(makeSummary(child));
      assert.strictEqual(service.getEffectiveValue(child, schema, "level"), "high");
    });
    test("session value takes precedence over parent and host", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent));
      seedSessionConfig(parent, { level: "high" });
      const child = buildSubagentSessionUri(parent, "tc-2");
      manager.createSession(makeSummary(child));
      seedSessionConfig(child, { level: "low" });
      seedRootConfig({ level: "high" });
      assert.strictEqual(service.getEffectiveValue(child, schema, "level"), "low");
    });
    test("skips layers whose value fails schema validation and falls through", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "bogus" });
      seedRootConfig({ level: "high" });
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), "high");
    });
    test("returns undefined when no layer provides a valid value", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, {});
      assert.strictEqual(service.getEffectiveValue(uri, schema, "level"), void 0);
    });
  });
  suite("getEffectiveWorkingDirectory", () => {
    test("returns session working directory when set", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri, "file:///work"));
      assert.strictEqual(service.getEffectiveWorkingDirectory(uri), "file:///work");
    });
    test("falls back to parent session working directory for subagents", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent, "file:///work/parent"));
      const child = buildSubagentSessionUri(parent, "tc-3");
      manager.createSession(makeSummary(child));
      assert.strictEqual(service.getEffectiveWorkingDirectory(child), "file:///work/parent");
    });
    test("returns undefined when neither layer has a working directory", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      assert.strictEqual(service.getEffectiveWorkingDirectory(uri), void 0);
    });
  });
  suite("getEffectiveWorkingDirectories", () => {
    test("returns the full ordered session set when set", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri, "file:///work", "file:///work-2"));
      assert.deepStrictEqual(service.getEffectiveWorkingDirectories(uri), ["file:///work", "file:///work-2"]);
    });
    test("falls back to the parent session set for subagents", () => {
      const parent = URI.from({ scheme: "copilot", path: "/parent" }).toString();
      manager.createSession(makeSummary(parent, "file:///work/parent", "file:///work/parent-2"));
      const child = buildSubagentSessionUri(parent, "tc-3");
      manager.createSession(makeSummary(child));
      assert.deepStrictEqual(service.getEffectiveWorkingDirectories(child), ["file:///work/parent", "file:///work/parent-2"]);
    });
    test("returns undefined when neither layer has a working directory", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      assert.strictEqual(service.getEffectiveWorkingDirectories(uri), void 0);
    });
  });
  suite("updateSessionConfig", () => {
    test("merges the patch into the session config values", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "low", limit: 1 });
      service.updateSessionConfig(uri, { limit: 42 });
      const state = manager.getSessionState(uri);
      assert.deepStrictEqual(state?.config?.values, { level: "low", limit: 42 });
    });
    test("fires after the session config is updated", () => {
      const uri = URI.from({ scheme: "copilot", path: "/a" }).toString();
      manager.createSession(makeSummary(uri));
      seedSessionConfig(uri, { level: "low" });
      let change;
      disposables.add(service.onDidSessionConfigChange((event) => {
        change = { session: event.session, config: event.config };
      }));
      service.updateSessionConfig(uri, { level: "high" });
      assert.deepStrictEqual(change, {
        session: uri,
        config: { level: "high" }
      });
    });
  });
  test("does not persist provider-backed root settings in agent-host config", async () => {
    const directory = fs.mkdtempSync(join(os.tmpdir(), "agent-config-"));
    const resource = URI.file(join(directory, "agent-host-config.json"));
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));
    localService.registerProviderConfiguration({
      provider: "test",
      title: "Test",
      description: "Test settings",
      properties: { "test.personality": { type: "string", title: "Personality", default: "friendly" } },
      settings: [{ key: "test.personality", group: "Personalization" }]
    });
    localService.updateRootConfig({ "test.personality": "pragmatic" });
    await localService.whenIdle();
    const persisted = JSON.parse(fs.readFileSync(resource.fsPath, "utf8"));
    assert.strictEqual(persisted["test.personality"], void 0);
    assert.strictEqual(localManager.rootState.config?.values["test.personality"], "pragmatic");
    fs.rmSync(directory, { recursive: true, force: true });
  });
  test("seeds provider configuration into the initial root snapshot", () => {
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    disposables.add(new AgentConfigurationService(localManager, new NullLogService(), void 0, [{
      provider: "test",
      title: "Test",
      description: "Test settings",
      properties: { "test.personality": { type: "string", title: "Personality", default: "friendly" } },
      settings: [{ key: "test.personality", group: "Personalization" }]
    }]));
    assert.strictEqual(localManager.rootState.config?.schema.properties["test.personality"]?.title, "Personality");
    assert.strictEqual(localManager.rootState.config?.values["test.personality"], "friendly");
    assert.deepStrictEqual(getAgentCustomizationSettingsEntries(localManager.rootState).map((entry) => entry.provider), ["test"]);
  });
  test("ignores malformed provider customization metadata", () => {
    manager.rootState._meta = {
      [AGENT_CUSTOMIZATION_SETTINGS_META_KEY]: [
        { provider: "missing-settings" },
        { provider: "bad-setting", title: "Bad", description: "Bad", settings: [{ group: "Group" }] },
        { provider: "valid", title: "Valid", description: "Valid settings", settings: [{ key: "valid.value", group: "Group" }] }
      ]
    };
    assert.deepStrictEqual(getAgentCustomizationSettingsEntries(manager.rootState).map((entry) => entry.provider), ["valid"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2NoZW1hLCBzY2hlbWFQcm9wZXJ0eSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgQUdFTlRfQ1VTVE9NSVpBVElPTl9TRVRUSU5HU19NRVRBX0tFWSwgZ2V0QWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3NFbnRyaWVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50Q3VzdG9taXphdGlvblNldHRpbmdzLmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdENvbmZpZ1N0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCBTZXNzaW9uU3RhdHVzLCB0eXBlIFNlc3Npb25TdW1tYXJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcblxuc3VpdGUoJ0FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBtYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGxldCBzZXJ2aWNlOiBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFx0bGV2ZWw6IHNjaGVtYVByb3BlcnR5PCdsb3cnIHwgJ2hpZ2gnPih7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdHRpdGxlOiAnbGV2ZWwnLFxuXHRcdFx0ZW51bTogWydsb3cnLCAnaGlnaCddLFxuXHRcdH0pLFxuXHRcdGxpbWl0OiBzY2hlbWFQcm9wZXJ0eTxudW1iZXI+KHsgdHlwZTogJ251bWJlcicsIHRpdGxlOiAnbGltaXQnIH0pLFxuXHR9KTtcblxuXHRmdW5jdGlvbiBzZWVkU2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpOiBzdHJpbmcsIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRhc3NlcnQub2sobWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSksIGBTZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uVXJpfWApO1xuXHRcdG1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLCB7XG5cdFx0XHRzY2hlbWE6IHNjaGVtYS50b1Byb3RvY29sKCksXG5cdFx0XHR2YWx1ZXMsXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzZWVkUm9vdENvbmZpZyh2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdE11dGFibGUgPSBtYW5hZ2VyLnJvb3RTdGF0ZSBhcyB7IGNvbmZpZz86IFJvb3RDb25maWdTdGF0ZSB9O1xuXHRcdHJvb3RNdXRhYmxlLmNvbmZpZyA9IHtcblx0XHRcdHNjaGVtYTogc2NoZW1hLnRvUHJvdG9jb2woKSxcblx0XHRcdHZhbHVlcyxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVN1bW1hcnkocmVzb3VyY2U6IHN0cmluZywgLi4ud29ya2luZ0RpcmVjdG9yaWVzOiBzdHJpbmdbXSk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICd0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnUHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDAgPyB3b3JraW5nRGlyZWN0b3JpZXMgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKG1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0gZ2V0RWZmZWN0aXZlVmFsdWUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2dldEVmZmVjdGl2ZVZhbHVlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBzZXNzaW9uIHZhbHVlIHdoZW4gcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmkpKTtcblx0XHRcdHNlZWRTZXNzaW9uQ29uZmlnKHVyaSwgeyBsZXZlbDogJ2hpZ2gnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUodXJpLCBzY2hlbWEsICdsZXZlbCcpLCAnaGlnaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBob3N0IHZhbHVlIHdoZW4gc2Vzc2lvbiBkb2VzIG5vdCBwcm92aWRlIHRoZSBrZXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2EnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkodXJpKSk7XG5cdFx0XHRzZWVkU2Vzc2lvbkNvbmZpZyh1cmksIHsgbGltaXQ6IDUgfSk7XG5cdFx0XHRzZWVkUm9vdENvbmZpZyh7IGxldmVsOiAnbG93JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHVyaSwgc2NoZW1hLCAnbGV2ZWwnKSwgJ2xvdycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5oZXJpdHMgZnJvbSBwYXJlbnQgc3ViYWdlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvcGFyZW50JyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHBhcmVudCkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcocGFyZW50LCB7IGxldmVsOiAnaGlnaCcgfSk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50LCAndG9vbGNhbGwtMScpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KGNoaWxkKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKGNoaWxkLCBzY2hlbWEsICdsZXZlbCcpLCAnaGlnaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbiB2YWx1ZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgcGFyZW50IGFuZCBob3N0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9wYXJlbnQnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocGFyZW50KSk7XG5cdFx0XHRzZWVkU2Vzc2lvbkNvbmZpZyhwYXJlbnQsIHsgbGV2ZWw6ICdoaWdoJyB9KTtcblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnQsICd0Yy0yJyk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoY2hpbGQpKTtcblx0XHRcdHNlZWRTZXNzaW9uQ29uZmlnKGNoaWxkLCB7IGxldmVsOiAnbG93JyB9KTtcblx0XHRcdHNlZWRSb290Q29uZmlnKHsgbGV2ZWw6ICdoaWdoJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUoY2hpbGQsIHNjaGVtYSwgJ2xldmVsJyksICdsb3cnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGxheWVycyB3aG9zZSB2YWx1ZSBmYWlscyBzY2hlbWEgdmFsaWRhdGlvbiBhbmQgZmFsbHMgdGhyb3VnaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmkpKTtcblx0XHRcdHNlZWRTZXNzaW9uQ29uZmlnKHVyaSwgeyBsZXZlbDogJ2JvZ3VzJyB9KTtcblx0XHRcdHNlZWRSb290Q29uZmlnKHsgbGV2ZWw6ICdoaWdoJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHVyaSwgc2NoZW1hLCAnbGV2ZWwnKSwgJ2hpZ2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gbGF5ZXIgcHJvdmlkZXMgYSB2YWxpZCB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmkpKTtcblx0XHRcdHNlZWRTZXNzaW9uQ29uZmlnKHVyaSwge30pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUodXJpLCBzY2hlbWEsICdsZXZlbCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3J5JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5IHdoZW4gc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSwgJ2ZpbGU6Ly8vd29yaycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkodXJpKSwgJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBwYXJlbnQgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSBmb3Igc3ViYWdlbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9wYXJlbnQnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocGFyZW50LCAnZmlsZTovLy93b3JrL3BhcmVudCcpKTtcblxuXHRcdFx0Y29uc3QgY2hpbGQgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnQsICd0Yy0zJyk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoY2hpbGQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkoY2hpbGQpLCAnZmlsZTovLy93b3JrL3BhcmVudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBuZWl0aGVyIGxheWVyIGhhcyBhIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yeSh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBmdWxsIG9yZGVyZWQgc2Vzc2lvbiBzZXQgd2hlbiBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2EnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkodXJpLCAnZmlsZTovLy93b3JrJywgJ2ZpbGU6Ly8vd29yay0yJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3Rvcmllcyh1cmkpLCBbJ2ZpbGU6Ly8vd29yaycsICdmaWxlOi8vL3dvcmstMiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHBhcmVudCBzZXNzaW9uIHNldCBmb3Igc3ViYWdlbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9wYXJlbnQnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocGFyZW50LCAnZmlsZTovLy93b3JrL3BhcmVudCcsICdmaWxlOi8vL3dvcmsvcGFyZW50LTInKSk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50LCAndGMtMycpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KGNoaWxkKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKGNoaWxkKSwgWydmaWxlOi8vL3dvcmsvcGFyZW50JywgJ2ZpbGU6Ly8vd29yay9wYXJlbnQtMiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbmVpdGhlciBsYXllciBoYXMgYSB3b3JraW5nIGRpcmVjdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvYScgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeSh1cmkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3Rvcmllcyh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndXBkYXRlU2Vzc2lvbkNvbmZpZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ21lcmdlcyB0aGUgcGF0Y2ggaW50byB0aGUgc2Vzc2lvbiBjb25maWcgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcodXJpLCB7IGxldmVsOiAnbG93JywgbGltaXQ6IDEgfSk7XG5cblx0XHRcdHNlcnZpY2UudXBkYXRlU2Vzc2lvbkNvbmZpZyh1cmksIHsgbGltaXQ6IDQyIH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlPy5jb25maWc/LnZhbHVlcywgeyBsZXZlbDogJ2xvdycsIGxpbWl0OiA0MiB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcmVzIGFmdGVyIHRoZSBzZXNzaW9uIGNvbmZpZyBpcyB1cGRhdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9hJyB9KS50b1N0cmluZygpO1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KHVyaSkpO1xuXHRcdFx0c2VlZFNlc3Npb25Db25maWcodXJpLCB7IGxldmVsOiAnbG93JyB9KTtcblx0XHRcdGxldCBjaGFuZ2U6IHsgc2Vzc2lvbjogc3RyaW5nOyBjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFNlc3Npb25Db25maWdDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0XHRjaGFuZ2UgPSB7IHNlc3Npb246IGV2ZW50LnNlc3Npb24sIGNvbmZpZzogZXZlbnQuY29uZmlnIH07XG5cdFx0XHR9KSk7XG5cblx0XHRcdHNlcnZpY2UudXBkYXRlU2Vzc2lvbkNvbmZpZyh1cmksIHsgbGV2ZWw6ICdoaWdoJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2UsIHtcblx0XHRcdFx0c2Vzc2lvbjogdXJpLFxuXHRcdFx0XHRjb25maWc6IHsgbGV2ZWw6ICdoaWdoJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHBlcnNpc3QgcHJvdmlkZXItYmFja2VkIHJvb3Qgc2V0dGluZ3MgaW4gYWdlbnQtaG9zdCBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyZWN0b3J5ID0gZnMubWtkdGVtcFN5bmMoam9pbihvcy50bXBkaXIoKSwgJ2FnZW50LWNvbmZpZy0nKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKGRpcmVjdG9yeSwgJ2FnZW50LWhvc3QtY29uZmlnLmpzb24nKSk7XG5cdFx0Y29uc3QgbG9jYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVzb3VyY2UpKTtcblx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0cHJvdmlkZXI6ICd0ZXN0Jyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc2V0dGluZ3MnLFxuXHRcdFx0cHJvcGVydGllczogeyAndGVzdC5wZXJzb25hbGl0eSc6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnUGVyc29uYWxpdHknLCBkZWZhdWx0OiAnZnJpZW5kbHknIH0gfSxcblx0XHRcdHNldHRpbmdzOiBbeyBrZXk6ICd0ZXN0LnBlcnNvbmFsaXR5JywgZ3JvdXA6ICdQZXJzb25hbGl6YXRpb24nIH1dLFxuXHRcdH0pO1xuXG5cdFx0bG9jYWxTZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyAndGVzdC5wZXJzb25hbGl0eSc6ICdwcmFnbWF0aWMnIH0pO1xuXHRcdGF3YWl0IGxvY2FsU2VydmljZS53aGVuSWRsZSgpO1xuXG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoLCAndXRmOCcpKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVyc2lzdGVkWyd0ZXN0LnBlcnNvbmFsaXR5J10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsTWFuYWdlci5yb290U3RhdGUuY29uZmlnPy52YWx1ZXNbJ3Rlc3QucGVyc29uYWxpdHknXSwgJ3ByYWdtYXRpYycpO1xuXHRcdGZzLnJtU3luYyhkaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZHMgcHJvdmlkZXIgY29uZmlndXJhdGlvbiBpbnRvIHRoZSBpbml0aWFsIHJvb3Qgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdW5kZWZpbmVkLCBbe1xuXHRcdFx0cHJvdmlkZXI6ICd0ZXN0Jyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc2V0dGluZ3MnLFxuXHRcdFx0cHJvcGVydGllczogeyAndGVzdC5wZXJzb25hbGl0eSc6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnUGVyc29uYWxpdHknLCBkZWZhdWx0OiAnZnJpZW5kbHknIH0gfSxcblx0XHRcdHNldHRpbmdzOiBbeyBrZXk6ICd0ZXN0LnBlcnNvbmFsaXR5JywgZ3JvdXA6ICdQZXJzb25hbGl6YXRpb24nIH1dLFxuXHRcdH1dKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxNYW5hZ2VyLnJvb3RTdGF0ZS5jb25maWc/LnNjaGVtYS5wcm9wZXJ0aWVzWyd0ZXN0LnBlcnNvbmFsaXR5J10/LnRpdGxlLCAnUGVyc29uYWxpdHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxNYW5hZ2VyLnJvb3RTdGF0ZS5jb25maWc/LnZhbHVlc1sndGVzdC5wZXJzb25hbGl0eSddLCAnZnJpZW5kbHknKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEFnZW50Q3VzdG9taXphdGlvblNldHRpbmdzRW50cmllcyhsb2NhbE1hbmFnZXIucm9vdFN0YXRlKS5tYXAoZW50cnkgPT4gZW50cnkucHJvdmlkZXIpLCBbJ3Rlc3QnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbWFsZm9ybWVkIHByb3ZpZGVyIGN1c3RvbWl6YXRpb24gbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5yb290U3RhdGUuX21ldGEgPSB7XG5cdFx0XHRbQUdFTlRfQ1VTVE9NSVpBVElPTl9TRVRUSU5HU19NRVRBX0tFWV06IFtcblx0XHRcdFx0eyBwcm92aWRlcjogJ21pc3Npbmctc2V0dGluZ3MnIH0sXG5cdFx0XHRcdHsgcHJvdmlkZXI6ICdiYWQtc2V0dGluZycsIHRpdGxlOiAnQmFkJywgZGVzY3JpcHRpb246ICdCYWQnLCBzZXR0aW5nczogW3sgZ3JvdXA6ICdHcm91cCcgfV0gfSxcblx0XHRcdFx0eyBwcm92aWRlcjogJ3ZhbGlkJywgdGl0bGU6ICdWYWxpZCcsIGRlc2NyaXB0aW9uOiAnVmFsaWQgc2V0dGluZ3MnLCBzZXR0aW5nczogW3sga2V5OiAndmFsaWQudmFsdWUnLCBncm91cDogJ0dyb3VwJyB9XSB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRBZ2VudEN1c3RvbWl6YXRpb25TZXR0aW5nc0VudHJpZXMobWFuYWdlci5yb290U3RhdGUpLm1hcChlbnRyeSA9PiBlbnRyeS5wcm92aWRlciksIFsndmFsaWQnXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFlBQVksUUFBUTtBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYyxzQkFBc0I7QUFDN0MsU0FBUyx1Q0FBdUMsNENBQTRDO0FBRTVGLFNBQVMseUJBQXlCLHFCQUEwQztBQUM1RSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUV0QyxNQUFNLDZCQUE2QixNQUFNO0FBRXhDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sU0FBUyxhQUFh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
