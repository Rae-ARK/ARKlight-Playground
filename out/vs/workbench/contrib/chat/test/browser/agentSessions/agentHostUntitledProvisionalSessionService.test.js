import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../../base/common/async.js";
import { Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { AgentHostUntitledProvisionalSessionService } from "../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from "../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from "../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js";
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.createCalls = [];
    this.disposed = [];
    this.dispatched = [];
    this.resolveCalls = [];
    /** Agents advertised by the (stubbed) root state; drives capability gating. */
    this.rootStateAgents = [];
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return { agents: self.rootStateAgents };
        },
        verifiedValue: void 0,
        onDidChange: Event.None,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
    /**
     * Each entry is consumed in order by the next `resolveSessionConfig` call.
     * Callers may push deferred promises (for race tests) or resolved values.
     */
    this.resolveQueue = [];
  }
  async createSession(config) {
    this.createCalls.push(config);
    return config.session;
  }
  async disposeSession(session) {
    this.disposed.push(session);
  }
  dispatch(channel, action) {
    this.dispatched.push({ channel, ...action });
  }
  async resolveSessionConfig(params) {
    this.resolveCalls.push(params);
    const next = this.resolveQueue.shift();
    if (!next) {
      throw new Error(`No queued resolveSessionConfig response (call #${this.resolveCalls.length})`);
    }
    return next;
  }
}
class MockChatService extends mock() {
  constructor() {
    super(...arguments);
    this.onDidDisposeSession = Event.None;
  }
}
function makeSchema(branchReadOnly) {
  return {
    type: "object",
    properties: {
      isolation: {
        type: "string",
        title: "Isolation",
        enum: ["folder", "worktree"],
        default: "folder"
      },
      branch: {
        type: "string",
        title: "Branch",
        enum: ["main"],
        default: "main",
        readOnly: branchReadOnly
      }
    }
  };
}
function untitledChatUri(id) {
  return URI.from({ scheme: "agent-host-copilot", path: `/untitled-${id}` });
}
function expectedBackendUri(id) {
  return URI.from({ scheme: "copilot", path: `/untitled-${id}` });
}
suite("AgentHostUntitledProvisionalSessionService", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let agentHost;
  let provisional;
  let folderService;
  let cleanup;
  let workspaceTrusted;
  let untrustedFolders;
  let workspaceFolders;
  setup(async () => {
    agentHost = new MockAgentHostService();
    workspaceTrusted = true;
    untrustedFolders = /* @__PURE__ */ new Set();
    workspaceFolders = [];
    const insta = ds.add(new TestInstantiationService());
    insta.stub(IAgentHostService, agentHost);
    insta.stub(ILogService, new NullLogService());
    insta.stub(IChatService, new MockChatService());
    insta.stub(IConfigurationService, new TestConfigurationService());
    insta.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
    insta.stub(IWorkspaceContextService, new class extends mock() {
      getWorkspace() {
        return { folders: workspaceFolders.map((uri) => ({ uri })) };
      }
    }());
    insta.stub(IWorkspaceTrustManagementService, new class extends mock() {
      isWorkspaceTrusted() {
        return workspaceTrusted;
      }
      async getUriTrustInfo(uri) {
        return { uri, trusted: !untrustedFolders.has(uri.toString()) };
      }
    }());
    folderService = ds.add(insta.createInstance(AgentHostNewSessionFolderService));
    insta.stub(IAgentHostNewSessionFolderService, folderService);
    insta.stub(IAgentHostImportConversationStore, new AgentHostImportConversationStore());
    provisional = ds.add(insta.createInstance(AgentHostUntitledProvisionalSessionService));
    cleanup = ds.add(new DisposableStore());
  });
  test("getOrCreate creates one backend provisional and returns the same URI on repeat calls", async () => {
    agentHost.resolveQueue = [];
    const ui = untitledChatUri("a");
    const a = await provisional.getOrCreate(ui, "copilot", void 0);
    const b = await provisional.getOrCreate(ui, "copilot", void 0);
    assert.strictEqual(a?.toString(), expectedBackendUri("a").toString());
    assert.strictEqual(b?.toString(), a.toString());
    assert.strictEqual(agentHost.createCalls.length, 1);
    assert.deepStrictEqual(agentHost.createCalls[0].config, { isolation: "folder" });
  });
  test("getOrCreate does not spawn a backend provisional in an untrusted workspace", async () => {
    workspaceTrusted = false;
    const ui = untitledChatUri("untrusted");
    const result = await provisional.getOrCreate(ui, "copilot", void 0);
    assert.strictEqual(result, void 0);
    assert.strictEqual(agentHost.createCalls.length, 0);
    assert.strictEqual(provisional.get(ui), void 0);
  });
  test("getOrCreate does not spawn a backend provisional in an untrusted working directory folder", async () => {
    const workingDirectory = URI.from({ scheme: "file", path: "/untrusted-folder" });
    untrustedFolders.add(workingDirectory.toString());
    const ui = untitledChatUri("untrusted-folder");
    const result = await provisional.getOrCreate(ui, "copilot", workingDirectory);
    assert.strictEqual(result, void 0);
    assert.strictEqual(agentHost.createCalls.length, 0);
    assert.strictEqual(provisional.get(ui), void 0);
  });
  test("getOrCreate spawns a backend provisional in a trusted working directory folder", async () => {
    const workingDirectory = URI.from({ scheme: "file", path: "/trusted-folder" });
    const ui = untitledChatUri("trusted-folder");
    const result = await provisional.getOrCreate(ui, "copilot", workingDirectory);
    assert.strictEqual(result?.toString(), expectedBackendUri("trusted-folder").toString());
    assert.strictEqual(agentHost.createCalls.length, 1);
  });
  test("applyConfigChange dispatches SessionConfigChanged synchronously after mutating entry.config", async () => {
    const ui = untitledChatUri("b");
    const blocked = new DeferredPromise();
    cleanup.add({ dispose: () => blocked.cancel() });
    agentHost.resolveQueue = [blocked.p];
    const promise = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await timeout(0);
    assert.strictEqual(agentHost.dispatched.length, 1, "dispatched before re-resolve await");
    assert.strictEqual(agentHost.dispatched[0].type, ActionType.SessionConfigChanged);
    assert.deepStrictEqual(agentHost.dispatched[0].config, { isolation: "worktree" });
    assert.strictEqual(agentHost.dispatched[0].channel, expectedBackendUri("b").toString());
    blocked.complete({ schema: makeSchema(false), values: { isolation: "worktree" } });
    await promise;
  });
  test("getResolvedConfig reflects the re-resolved schema/values after applyConfigChange", async () => {
    const ui = untitledChatUri("c");
    const resolved = {
      schema: makeSchema(false),
      values: { isolation: "worktree", branch: "main" }
    };
    agentHost.resolveQueue = [resolved];
    assert.strictEqual(provisional.getResolvedConfig(ui), void 0);
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    const overlay = provisional.getResolvedConfig(ui);
    assert.deepStrictEqual(overlay?.schema, resolved.schema);
    assert.deepStrictEqual(overlay?.values, resolved.values);
    assert.strictEqual(agentHost.resolveCalls.length, 1);
    assert.deepStrictEqual(agentHost.resolveCalls[0].config, { isolation: "worktree" });
  });
  test("refreshResolvedConfig stores a schema overlay for running sessions", async () => {
    const ui = URI.from({ scheme: "agent-host-copilot", path: "/real-j" });
    const resolved = {
      schema: makeSchema(true),
      values: { isolation: "folder", branch: "main" }
    };
    agentHost.resolveQueue = [resolved];
    let changeFires = 0;
    cleanup.add(provisional.onDidChange((uri) => {
      if (uri.toString() === ui.toString()) {
        changeFires++;
      }
    }));
    await provisional.refreshResolvedConfig(ui, "copilot", void 0, { isolation: "folder" });
    assert.deepStrictEqual({
      overlay: provisional.getResolvedConfig(ui),
      changeFires,
      resolveConfig: agentHost.resolveCalls[0].config
    }, {
      overlay: resolved,
      changeFires: 1,
      resolveConfig: { isolation: "folder" }
    });
  });
  test("refreshResolvedConfig ignores stale running-session responses", async () => {
    const ui = URI.from({ scheme: "agent-host-copilot", path: "/real-k" });
    const first = new DeferredPromise();
    const second = new DeferredPromise();
    cleanup.add({ dispose: () => {
      first.cancel();
      second.cancel();
    } });
    agentHost.resolveQueue = [first.p, second.p];
    const a = provisional.refreshResolvedConfig(ui, "copilot", void 0, { isolation: "worktree" });
    const b = provisional.refreshResolvedConfig(ui, "copilot", void 0, { isolation: "folder" });
    first.complete({ schema: makeSchema(false), values: { isolation: "worktree" } });
    second.complete({ schema: makeSchema(true), values: { isolation: "folder" } });
    await a;
    await b;
    assert.deepStrictEqual(provisional.getResolvedConfig(ui), { schema: makeSchema(true), values: { isolation: "folder" } });
  });
  test("optimistic merge: overlay.values reflects partial before re-resolve completes", async () => {
    const ui = untitledChatUri("d");
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree", branch: "main" } }];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    assert.strictEqual(provisional.getResolvedConfig(ui)?.values?.["isolation"], "worktree");
    const blocked = new DeferredPromise();
    cleanup.add({ dispose: () => blocked.cancel() });
    agentHost.resolveQueue = [blocked.p];
    const promise = provisional.applyConfigChange(ui, "copilot", void 0, { branch: "feature/x" });
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await timeout(0);
    const mid = provisional.getResolvedConfig(ui);
    assert.strictEqual(mid?.values?.["branch"], "feature/x", "overlay value updated optimistically");
    assert.strictEqual(mid?.values?.["isolation"], "worktree", "previous overlay values preserved");
    blocked.complete({ schema: makeSchema(false), values: { isolation: "worktree", branch: "feature/x" } });
    await promise;
  });
  test("racing applyConfigChange calls: the second one wins (sequencer order)", async () => {
    const ui = untitledChatUri("e");
    const first = new DeferredPromise();
    const second = new DeferredPromise();
    cleanup.add({ dispose: () => {
      first.cancel();
      second.cancel();
    } });
    agentHost.resolveQueue = [first.p, second.p];
    const a = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    const b = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "folder" });
    second.complete({ schema: makeSchema(true), values: { isolation: "folder", branch: "main" } });
    first.complete({ schema: makeSchema(false), values: { isolation: "worktree", branch: "main" } });
    await a;
    await b;
    const overlay = provisional.getResolvedConfig(ui);
    assert.strictEqual(overlay?.values?.["isolation"], "folder");
    assert.strictEqual(overlay?.schema.properties["branch"].readOnly, true);
  });
  test("equals check skips onDidChange when re-resolved config is identical", async () => {
    const ui = untitledChatUri("f");
    const result = {
      schema: makeSchema(false),
      values: { isolation: "worktree", branch: "main" }
    };
    agentHost.resolveQueue = [result, { schema: makeSchema(false), values: { isolation: "worktree", branch: "main" } }];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    let changeFires = 0;
    cleanup.add(provisional.onDidChange((uri) => {
      if (uri.toString() === ui.toString()) {
        changeFires++;
      }
    }));
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    assert.strictEqual(changeFires, 0, "no onDidChange fire when overlay is unchanged");
  });
  test("tryRebind sees latest entry.config from a synchronously-completed applyConfigChange", async () => {
    const ui = untitledChatUri("g");
    const blocked = new DeferredPromise();
    cleanup.add({ dispose: () => blocked.cancel() });
    agentHost.resolveQueue = [blocked.p];
    void provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    await Promise.resolve();
    await Promise.resolve();
    await timeout(0);
    const newUi = URI.from({ scheme: "agent-host-copilot", path: "/real-g" });
    await provisional.tryRebind(ui, newUi, "copilot", void 0);
    const reboundCreate = agentHost.createCalls.find((c) => c.session?.path === "/real-g");
    assert.ok(reboundCreate, "rebind triggered a createSession");
    assert.strictEqual(reboundCreate.config?.["isolation"], "worktree");
    blocked.complete({ schema: makeSchema(false), values: { isolation: "worktree" } });
  });
  test("disposeSession drops the entry and its overlay", async () => {
    const ui = untitledChatUri("h");
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    assert.ok(provisional.getResolvedConfig(ui));
    await provisional.disposeSession(ui);
    assert.strictEqual(provisional.get(ui), void 0);
    assert.strictEqual(provisional.getResolvedConfig(ui), void 0);
    assert.strictEqual(agentHost.disposed.length, 1);
  });
  test("failed re-resolve preserves the previous overlay", async () => {
    const ui = untitledChatUri("i");
    agentHost.resolveQueue = [
      { schema: makeSchema(false), values: { isolation: "worktree" } },
      Promise.reject(new Error("boom"))
    ];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    const before = provisional.getResolvedConfig(ui);
    assert.ok(before);
    await provisional.applyConfigChange(ui, "copilot", void 0, { branch: "feature/x" });
    const after = provisional.getResolvedConfig(ui);
    assert.deepStrictEqual(after?.schema, before.schema, "schema unchanged after failed re-resolve");
    assert.strictEqual(after?.values?.["branch"], "feature/x");
  });
  async function flush() {
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }
    await timeout(0);
  }
  test("folder change recreates the provisional at the new cwd preserving config", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const ui = untitledChatUri("cwd1");
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    await provisional.applyConfigChange(ui, "copilot", folderA, { isolation: "worktree" });
    assert.strictEqual(agentHost.createCalls.length, 1);
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    folderService.setFolder(ui, folderB);
    await flush();
    const recreate = agentHost.createCalls[agentHost.createCalls.length - 1];
    assert.deepStrictEqual({
      createCount: agentHost.createCalls.length,
      disposedOld: agentHost.disposed.some((d) => d.toString() === expectedBackendUri("cwd1").toString()),
      recreatedSession: recreate.session?.toString(),
      recreatedCwd: recreate.workingDirectories?.[0]?.toString(),
      recreatedConfig: recreate.config?.["isolation"]
    }, {
      createCount: 2,
      disposedOld: true,
      recreatedSession: expectedBackendUri("cwd1").toString(),
      recreatedCwd: folderB.toString(),
      recreatedConfig: "worktree"
    });
  });
  test("folder change to the same folder is a no-op", async () => {
    const folderA = URI.file("/repoA");
    const ui = untitledChatUri("cwd2");
    await provisional.getOrCreate(ui, "copilot", folderA);
    assert.strictEqual(agentHost.createCalls.length, 1);
    folderService.setFolder(ui, folderA);
    await flush();
    assert.strictEqual(agentHost.createCalls.length, 1, "no recreate for unchanged folder");
    assert.strictEqual(agentHost.disposed.length, 0);
  });
  test("folder change with no provisional entry is a no-op", async () => {
    const ui = untitledChatUri("cwd3");
    folderService.setFolder(ui, URI.file("/repoB"));
    await flush();
    assert.strictEqual(agentHost.createCalls.length, 0);
    assert.strictEqual(provisional.get(ui), void 0);
  });
  test("derives the ordered working-directory set from the picked primary", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const folderC = URI.file("/repoC");
    workspaceFolders = [folderA, folderB, folderC];
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const multiRoot = untitledChatUri("multi");
    await provisional.getOrCreate(multiRoot, "copilot", folderB);
    workspaceFolders = [folderA];
    const singleRoot = untitledChatUri("single");
    await provisional.getOrCreate(singleRoot, "copilot", folderA);
    assert.deepStrictEqual({
      multiRoot: agentHost.createCalls.find((c) => c.session?.toString() === expectedBackendUri("multi").toString())?.workingDirectories?.map((d) => d.toString()),
      singleRoot: agentHost.createCalls.find((c) => c.session?.toString() === expectedBackendUri("single").toString())?.workingDirectories?.map((d) => d.toString())
    }, {
      multiRoot: [folderB.toString(), folderA.toString(), folderC.toString()],
      singleRoot: [folderA.toString()]
    });
  });
  test("sends only the primary when the provider does not advertise multiple working directories", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const folderC = URI.file("/repoC");
    workspaceFolders = [folderA, folderB, folderC];
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const multi = untitledChatUri("cap-multi");
    await provisional.getOrCreate(multi, "copilot", folderB);
    agentHost.rootStateAgents = [agentInfo("copilot", false)];
    const single = untitledChatUri("cap-single");
    await provisional.getOrCreate(single, "copilot", folderB);
    assert.deepStrictEqual({
      advertising: agentHost.createCalls.find((c) => c.session?.toString() === expectedBackendUri("cap-multi").toString())?.workingDirectories?.map((d) => d.toString()),
      nonAdvertising: agentHost.createCalls.find((c) => c.session?.toString() === expectedBackendUri("cap-single").toString())?.workingDirectories?.map((d) => d.toString())
    }, {
      advertising: [folderB.toString(), folderA.toString(), folderC.toString()],
      nonAdvertising: [folderB.toString()]
    });
  });
});
function agentInfo(provider, multipleWorkingDirectories) {
  return {
    provider,
    displayName: provider,
    description: "",
    models: [],
    capabilities: multipleWorkingDirectories ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZywgSUFnZW50SG9zdFNlcnZpY2UsIElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbmZpZ1NjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SW5mbywgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsIElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSwgSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZS5qcyc7XG5cbi8vIC0tLS0gTW9ja3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElEaXNwYXRjaGVkQWN0aW9uIHtcblx0cmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG59XG5cbmNsYXNzIE1vY2tBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNyZWF0ZUNhbGxzOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnW10gPSBbXTtcblx0cmVhZG9ubHkgZGlzcG9zZWQ6IFVSSVtdID0gW107XG5cdHJlYWRvbmx5IGRpc3BhdGNoZWQ6IElEaXNwYXRjaGVkQWN0aW9uW10gPSBbXTtcblx0cmVhZG9ubHkgcmVzb2x2ZUNhbGxzOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtc1tdID0gW107XG5cblx0LyoqIEFnZW50cyBhZHZlcnRpc2VkIGJ5IHRoZSAoc3R1YmJlZCkgcm9vdCBzdGF0ZTsgZHJpdmVzIGNhcGFiaWxpdHkgZ2F0aW5nLiAqL1xuXHRyb290U3RhdGVBZ2VudHM6IEFnZW50SW5mb1tdID0gW107XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJvb3RTdGF0ZTogSUFnZW50U3Vic2NyaXB0aW9uPFJvb3RTdGF0ZT4gPSAoKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgdmFsdWUoKTogUm9vdFN0YXRlIHsgcmV0dXJuIHsgYWdlbnRzOiBzZWxmLnJvb3RTdGF0ZUFnZW50cyB9IGFzIHVua25vd24gYXMgUm9vdFN0YXRlOyB9LFxuXHRcdFx0dmVyaWZpZWRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+O1xuXHR9KSgpO1xuXG5cdC8qKlxuXHQgKiBFYWNoIGVudHJ5IGlzIGNvbnN1bWVkIGluIG9yZGVyIGJ5IHRoZSBuZXh0IGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2AgY2FsbC5cblx0ICogQ2FsbGVycyBtYXkgcHVzaCBkZWZlcnJlZCBwcm9taXNlcyAoZm9yIHJhY2UgdGVzdHMpIG9yIHJlc29sdmVkIHZhbHVlcy5cblx0ICovXG5cdHJlc29sdmVRdWV1ZTogKFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHwgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQpW10gPSBbXTtcblxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVTZXNzaW9uKGNvbmZpZz86IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpOiBQcm9taXNlPFVSST4ge1xuXHRcdHRoaXMuY3JlYXRlQ2FsbHMucHVzaChjb25maWchKTtcblx0XHRyZXR1cm4gY29uZmlnIS5zZXNzaW9uITtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZWQucHVzaChzZXNzaW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3BhdGNoKGNoYW5uZWw6IFBhcmFtZXRlcnM8SUFnZW50SG9zdFNlcnZpY2VbJ2Rpc3BhdGNoJ10+WzBdLCBhY3Rpb246IFBhcmFtZXRlcnM8SUFnZW50SG9zdFNlcnZpY2VbJ2Rpc3BhdGNoJ10+WzFdKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkLnB1c2goeyBjaGFubmVsLCAuLi5hY3Rpb24gfSBhcyBJRGlzcGF0Y2hlZEFjdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhwYXJhbXM6IElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdHRoaXMucmVzb2x2ZUNhbGxzLnB1c2gocGFyYW1zKTtcblx0XHRjb25zdCBuZXh0ID0gdGhpcy5yZXNvbHZlUXVldWUuc2hpZnQoKTtcblx0XHRpZiAoIW5leHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcXVldWVkIHJlc29sdmVTZXNzaW9uQ29uZmlnIHJlc3BvbnNlIChjYWxsICMke3RoaXMucmVzb2x2ZUNhbGxzLmxlbmd0aH0pYCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXh0O1xuXHR9XG59XG5cbmNsYXNzIE1vY2tDaGF0U2VydmljZSBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRGlzcG9zZVNlc3Npb24gPSBFdmVudC5Ob25lO1xufVxuXG4vLyAtLS0tIEhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIG1ha2VTY2hlbWEoYnJhbmNoUmVhZE9ubHk6IGJvb2xlYW4pOiBDb25maWdTY2hlbWEge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGlzb2xhdGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6ICdJc29sYXRpb24nLFxuXHRcdFx0XHRlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLFxuXHRcdFx0XHRkZWZhdWx0OiAnZm9sZGVyJyxcblx0XHRcdH0sXG5cdFx0XHRicmFuY2g6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiAnQnJhbmNoJyxcblx0XHRcdFx0ZW51bTogWydtYWluJ10sXG5cdFx0XHRcdGRlZmF1bHQ6ICdtYWluJyxcblx0XHRcdFx0cmVhZE9ubHk6IGJyYW5jaFJlYWRPbmx5LFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiB1bnRpdGxlZENoYXRVcmkoaWQ6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6IGAvdW50aXRsZWQtJHtpZH1gIH0pO1xufVxuXG5mdW5jdGlvbiBleHBlY3RlZEJhY2tlbmRVcmkoaWQ6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiBgL3VudGl0bGVkLSR7aWR9YCB9KTtcbn1cblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5zdWl0ZSgnQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlO1xuXHRsZXQgcHJvdmlzaW9uYWw6IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2U7XG5cdGxldCBmb2xkZXJTZXJ2aWNlOiBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2U7XG5cdGxldCBjbGVhbnVwOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCB3b3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuO1xuXHRsZXQgdW50cnVzdGVkRm9sZGVyczogU2V0PHN0cmluZz47XG5cdGxldCB3b3Jrc3BhY2VGb2xkZXJzOiBVUklbXTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0d29ya3NwYWNlVHJ1c3RlZCA9IHRydWU7XG5cdFx0dW50cnVzdGVkRm9sZGVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbXTtcblx0XHRjb25zdCBpbnN0YSA9IGRzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhLnN0dWIoSUFnZW50SG9zdFNlcnZpY2UsIGFnZW50SG9zdCk7XG5cdFx0aW5zdGEuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhLnN0dWIoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgeyBpc1Nlc3Npb25zV2luZG93OiBmYWxzZSB9IGFzIFBhcnRpYWw8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4pO1xuXHRcdGluc3RhLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0XHRcdHJldHVybiB7IGZvbGRlcnM6IHdvcmtzcGFjZUZvbGRlcnMubWFwKHVyaSA9PiAoeyB1cmkgfSBhcyBJV29ya3NwYWNlRm9sZGVyKSkgfSBhcyBJV29ya3NwYWNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgaXNXb3Jrc3BhY2VUcnVzdGVkKCk6IGJvb2xlYW4geyByZXR1cm4gd29ya3NwYWNlVHJ1c3RlZDsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0VXJpVHJ1c3RJbmZvKHVyaTogVVJJKSB7IHJldHVybiB7IHVyaSwgdHJ1c3RlZDogIXVudHJ1c3RlZEZvbGRlcnMuaGFzKHVyaS50b1N0cmluZygpKSB9OyB9XG5cdFx0fSk7XG5cdFx0Zm9sZGVyU2VydmljZSA9IGRzLmFkZChpbnN0YS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSkpO1xuXHRcdGluc3RhLnN0dWIoSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLCBmb2xkZXJTZXJ2aWNlKTtcblx0XHRpbnN0YS5zdHViKElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwgbmV3IEFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlKCkpO1xuXHRcdHByb3Zpc2lvbmFsID0gZHMuYWRkKGluc3RhLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSkpO1xuXHRcdGNsZWFudXAgPSBkcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0T3JDcmVhdGUgY3JlYXRlcyBvbmUgYmFja2VuZCBwcm92aXNpb25hbCBhbmQgcmV0dXJucyB0aGUgc2FtZSBVUkkgb24gcmVwZWF0IGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbXTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnYScpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhPy50b1N0cmluZygpLCBleHBlY3RlZEJhY2tlbmRVcmkoJ2EnKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYj8udG9TdHJpbmcoKSwgYS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbMF0uY29uZmlnLCB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yQ3JlYXRlIGRvZXMgbm90IHNwYXduIGEgYmFja2VuZCBwcm92aXNpb25hbCBpbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHdvcmtzcGFjZVRydXN0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgndW50cnVzdGVkJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlzaW9uYWwuZ2V0KHVpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0T3JDcmVhdGUgZG9lcyBub3Qgc3Bhd24gYSBiYWNrZW5kIHByb3Zpc2lvbmFsIGluIGFuIHVudHJ1c3RlZCB3b3JraW5nIGRpcmVjdG9yeSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gV29ya3NwYWNlIGlzIHRydXN0ZWQsIGJ1dCB0aGUgdGFyZ2V0IHdvcmtpbmcgZGlyZWN0b3J5IGlzIGFcblx0XHQvLyBzdGFuZGFsb25lIHVudHJ1c3RlZCBmb2xkZXIgKGUuZy4gYSBwZXItc2Vzc2lvbiBmb2xkZXIgb3V0c2lkZSB0aGVcblx0XHQvLyBvcGVuIHdvcmtzcGFjZSkuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdW50cnVzdGVkLWZvbGRlcicgfSk7XG5cdFx0dW50cnVzdGVkRm9sZGVycy5hZGQod29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgndW50cnVzdGVkLWZvbGRlcicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aXNpb25hbC5nZXQodWkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPckNyZWF0ZSBzcGF3bnMgYSBiYWNrZW5kIHByb3Zpc2lvbmFsIGluIGEgdHJ1c3RlZCB3b3JraW5nIGRpcmVjdG9yeSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdHJ1c3RlZC1mb2xkZXInIH0pO1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCd0cnVzdGVkLWZvbGRlcicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksIGV4cGVjdGVkQmFja2VuZFVyaSgndHJ1c3RlZC1mb2xkZXInKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5Q29uZmlnQ2hhbmdlIGRpc3BhdGNoZXMgU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgc3luY2hyb25vdXNseSBhZnRlciBtdXRhdGluZyBlbnRyeS5jb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2InKTtcblx0XHQvLyBSZXNvbHZlIG5ldmVyIHJldHVybnMgXHUyMDE0IHByb3ZlcyBtdXRhdGUrZGlzcGF0Y2ggaGFwcGVuIGJlZm9yZSB0aGVcblx0XHQvLyByZS1yZXNvbHZlIGF3YWl0LlxuXHRcdGNvbnN0IGJsb2NrZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRcdGNsZWFudXAuYWRkKHsgZGlzcG9zZTogKCkgPT4gYmxvY2tlZC5jYW5jZWwoKSB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW2Jsb2NrZWQucF07XG5cblx0XHRjb25zdCBwcm9taXNlID0gcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHQvLyBZaWVsZCBlbm91Z2ggbWljcm90YXNrcyBmb3IgZ2V0T3JDcmVhdGUncyBzZXF1ZW5jZXIgKyBjcmVhdGVTZXNzaW9uXG5cdFx0Ly8gdG8gc2V0dGxlIGFuZCBhcHBseUNvbmZpZ0NoYW5nZSdzIHN5bmNocm9ub3VzIHByZWx1ZGUgKG11dGF0ZSArXG5cdFx0Ly8gZGlzcGF0Y2gpIHRvIHJ1bi4gVGhlIHJlLXJlc29sdmUgYXdhaXQgYmxvY2tzIGluZGVmaW5pdGVseS5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gRGlzcGF0Y2ggc2hvdWxkIGhhdmUgaGFwcGVuZWQgYmVmb3JlIHRoZSBwcm9taXNlIHJlc29sdmVzIChyZS1yZXNvbHZlXG5cdFx0Ly8gaXMgc3RpbGwgYmxvY2tlZCkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwYXRjaGVkLmxlbmd0aCwgMSwgJ2Rpc3BhdGNoZWQgYmVmb3JlIHJlLXJlc29sdmUgYXdhaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRbMF0udHlwZSwgQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZFswXS5jb25maWcsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZFswXS5jaGFubmVsLCBleHBlY3RlZEJhY2tlbmRVcmkoJ2InKS50b1N0cmluZygpKTtcblxuXHRcdC8vIFVuYmxvY2sgc28gdGhlIHF1ZXVlZCByZS1yZXNvbHZlIGNvbXBsZXRlcyBhbmQgdGhlIG91dGVyIHByb21pc2Ugc2V0dGxlcy5cblx0XHRibG9ja2VkLmNvbXBsZXRlKHsgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH0pO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlc29sdmVkQ29uZmlnIHJlZmxlY3RzIHRoZSByZS1yZXNvbHZlZCBzY2hlbWEvdmFsdWVzIGFmdGVyIGFwcGx5Q29uZmlnQ2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdjJyk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQ6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSxcblx0XHRcdHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0sXG5cdFx0fTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3Jlc29sdmVkXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblxuXHRcdGNvbnN0IG92ZXJsYXkgPSBwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdmVybGF5Py5zY2hlbWEsIHJlc29sdmVkLnNjaGVtYSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvdmVybGF5Py52YWx1ZXMsIHJlc29sdmVkLnZhbHVlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlQ2FsbHNbMF0uY29uZmlnLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaFJlc29sdmVkQ29uZmlnIHN0b3JlcyBhIHNjaGVtYSBvdmVybGF5IGZvciBydW5uaW5nIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLCBwYXRoOiAnL3JlYWwtaicgfSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQ6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiBtYWtlU2NoZW1hKHRydWUpLFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicsIGJyYW5jaDogJ21haW4nIH0sXG5cdFx0fTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3Jlc29sdmVkXTtcblxuXHRcdGxldCBjaGFuZ2VGaXJlcyA9IDA7XG5cdFx0Y2xlYW51cC5hZGQocHJvdmlzaW9uYWwub25EaWRDaGFuZ2UodXJpID0+IHsgaWYgKHVyaS50b1N0cmluZygpID09PSB1aS50b1N0cmluZygpKSB7IGNoYW5nZUZpcmVzKys7IH0gfSkpO1xuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwucmVmcmVzaFJlc29sdmVkQ29uZmlnKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICdmb2xkZXInIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvdmVybGF5OiBwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSksXG5cdFx0XHRjaGFuZ2VGaXJlcyxcblx0XHRcdHJlc29sdmVDb25maWc6IGFnZW50SG9zdC5yZXNvbHZlQ2FsbHNbMF0uY29uZmlnLFxuXHRcdH0sIHtcblx0XHRcdG92ZXJsYXk6IHJlc29sdmVkLFxuXHRcdFx0Y2hhbmdlRmlyZXM6IDEsXG5cdFx0XHRyZXNvbHZlQ29uZmlnOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaFJlc29sdmVkQ29uZmlnIGlnbm9yZXMgc3RhbGUgcnVubmluZy1zZXNzaW9uIHJlc3BvbnNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90JywgcGF0aDogJy9yZWFsLWsnIH0pO1xuXHRcdGNvbnN0IGZpcnN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oKTtcblx0XHRjb25zdCBzZWNvbmQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRcdGNsZWFudXAuYWRkKHsgZGlzcG9zZTogKCkgPT4geyBmaXJzdC5jYW5jZWwoKTsgc2Vjb25kLmNhbmNlbCgpOyB9IH0pO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbZmlyc3QucCwgc2Vjb25kLnBdO1xuXG5cdFx0Y29uc3QgYSA9IHByb3Zpc2lvbmFsLnJlZnJlc2hSZXNvbHZlZENvbmZpZyh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHRcdGNvbnN0IGIgPSBwcm92aXNpb25hbC5yZWZyZXNoUmVzb2x2ZWRDb25maWcodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSk7XG5cblx0XHRmaXJzdC5jb21wbGV0ZSh7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9KTtcblx0XHRzZWNvbmQuY29tcGxldGUoeyBzY2hlbWE6IG1ha2VTY2hlbWEodHJ1ZSksIHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInIH0gfSk7XG5cblx0XHRhd2FpdCBhO1xuXHRcdGF3YWl0IGI7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3Zpc2lvbmFsLmdldFJlc29sdmVkQ29uZmlnKHVpKSwgeyBzY2hlbWE6IG1ha2VTY2hlbWEodHJ1ZSksIHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInIH0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wdGltaXN0aWMgbWVyZ2U6IG92ZXJsYXkudmFsdWVzIHJlZmxlY3RzIHBhcnRpYWwgYmVmb3JlIHJlLXJlc29sdmUgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdkJyk7XG5cdFx0Ly8gRmlyc3QgYXBwbHlDb25maWdDaGFuZ2U6IHNlZWQgYW4gb3ZlcmxheS5cblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3sgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSB9XTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSk/LnZhbHVlcz8uWydpc29sYXRpb24nXSwgJ3dvcmt0cmVlJyk7XG5cblx0XHQvLyBTZWNvbmQgYXBwbHlDb25maWdDaGFuZ2U6IGJsb2NrIHRoZSByZS1yZXNvbHZlIGFuZCBhc3NlcnQgdGhhdCB0aGVcblx0XHQvLyBvdmVybGF5J3MgYHZhbHVlc2AgcmVmbGVjdHMgdGhlIG5ldyBwYXJ0aWFsICpiZWZvcmUqIHRoZSByZS1yZXNvbHZlXG5cdFx0Ly8gcmV0dXJucy4gVGhpcyBpcyB3aGF0IGtlZXBzIHRoZSBwaWNrZXIgZnJvbSByZW5kZXJpbmcgYSBzdGFsZSB2YWx1ZVxuXHRcdC8vIGR1cmluZyB0aGUgcm91bmQtdHJpcC5cblx0XHRjb25zdCBibG9ja2VkID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oKTtcblx0XHRjbGVhbnVwLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGJsb2NrZWQuY2FuY2VsKCkgfSk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtibG9ja2VkLnBdO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBicmFuY2g6ICdmZWF0dXJlL3gnIH0pO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjA7IGkrKykge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBtaWQgPSBwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pZD8udmFsdWVzPy5bJ2JyYW5jaCddLCAnZmVhdHVyZS94JywgJ292ZXJsYXkgdmFsdWUgdXBkYXRlZCBvcHRpbWlzdGljYWxseScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWQ/LnZhbHVlcz8uWydpc29sYXRpb24nXSwgJ3dvcmt0cmVlJywgJ3ByZXZpb3VzIG92ZXJsYXkgdmFsdWVzIHByZXNlcnZlZCcpO1xuXG5cdFx0YmxvY2tlZC5jb21wbGV0ZSh7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ2ZlYXR1cmUveCcgfSB9KTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHR9KTtcblxuXHR0ZXN0KCdyYWNpbmcgYXBwbHlDb25maWdDaGFuZ2UgY2FsbHM6IHRoZSBzZWNvbmQgb25lIHdpbnMgKHNlcXVlbmNlciBvcmRlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2UnKTtcblx0XHRjb25zdCBmaXJzdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+KCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oKTtcblx0XHRjbGVhbnVwLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgZmlyc3QuY2FuY2VsKCk7IHNlY29uZC5jYW5jZWwoKTsgfSB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW2ZpcnN0LnAsIHNlY29uZC5wXTtcblxuXHRcdC8vIEZpcmUgYm90aCBiZWZvcmUgZWl0aGVyIHJlc29sdmUgY29tcGxldGVzLlxuXHRcdGNvbnN0IGEgPSBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHRcdGNvbnN0IGIgPSBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9KTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSBTRUNPTkQgb25lIGZpcnN0IHRvIHNpbXVsYXRlIG91dC1vZi1vcmRlciBSUEMgcmV0dXJucy5cblx0XHRzZWNvbmQuY29tcGxldGUoeyBzY2hlbWE6IG1ha2VTY2hlbWEodHJ1ZSksIHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdtYWluJyB9IH0pO1xuXHRcdC8vIFRoZSBzZXF1ZW5jZXIgZW5zdXJlcyB0aGUgc2Vjb25kIGNhbGwgcnVucyBhZnRlciB0aGUgZmlyc3Q7IHJlc29sdmVcblx0XHQvLyB0aGUgZmlyc3Qgc28gaXQgY2FuIHNldHRsZSBhbmQgbGV0IHRoZSBzZWNvbmQgdGFrZSBlZmZlY3QgbGFzdC5cblx0XHRmaXJzdC5jb21wbGV0ZSh7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0gfSk7XG5cblx0XHRhd2FpdCBhO1xuXHRcdGF3YWl0IGI7XG5cblx0XHRjb25zdCBvdmVybGF5ID0gcHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpO1xuXHRcdC8vIFRoZSBgZm9sZGVyYCByZXNvbHZlIHdhcyBpc3N1ZWQgc2Vjb25kIGFuZCBzaG91bGQgYmUgdGhlIGZpbmFsIG92ZXJsYXkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG92ZXJsYXk/LnZhbHVlcz8uWydpc29sYXRpb24nXSwgJ2ZvbGRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdmVybGF5Py5zY2hlbWEucHJvcGVydGllc1snYnJhbmNoJ10ucmVhZE9ubHksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdlcXVhbHMgY2hlY2sgc2tpcHMgb25EaWRDaGFuZ2Ugd2hlbiByZS1yZXNvbHZlZCBjb25maWcgaXMgaWRlbnRpY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdmJyk7XG5cdFx0Y29uc3QgcmVzdWx0OiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksXG5cdFx0XHR2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH07XG5cdFx0Ly8gUXVldWUgdHdvIGlkZW50aWNhbCByZXN1bHRzIGZvciB0d28gYXBwbHlDb25maWdDaGFuZ2UgY2FsbHMuXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtyZXN1bHQsIHsgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSB9XTtcblxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cblx0XHRsZXQgY2hhbmdlRmlyZXMgPSAwO1xuXHRcdGNsZWFudXAuYWRkKHByb3Zpc2lvbmFsLm9uRGlkQ2hhbmdlKHVyaSA9PiB7IGlmICh1cmkudG9TdHJpbmcoKSA9PT0gdWkudG9TdHJpbmcoKSkgeyBjaGFuZ2VGaXJlcysrOyB9IH0pKTtcblxuXHRcdC8vIFNlY29uZCBjYWxsIHdpdGggdGhlIHNhbWUgcGFydGlhbCBzaG91bGQgcHJvZHVjZSB0aGUgc2FtZSByZXNvbHZlZFxuXHRcdC8vIHNjaGVtYS92YWx1ZXM7IHRoZSBlcXVhbHMgY2hlY2sgc2hvdWxkIHN1cHByZXNzIHRoZSBvbkRpZENoYW5nZSBmaXJlLlxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cblx0XHQvLyBPbmUgbWljcm8tZmlyZSBpcyBhY2NlcHRhYmxlIGJ1dCB0aGUgcmVzb2x2ZWQtc2lkZSBmaXJlIHNob3VsZCBub3QuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUZpcmVzLCAwLCAnbm8gb25EaWRDaGFuZ2UgZmlyZSB3aGVuIG92ZXJsYXkgaXMgdW5jaGFuZ2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyeVJlYmluZCBzZWVzIGxhdGVzdCBlbnRyeS5jb25maWcgZnJvbSBhIHN5bmNocm9ub3VzbHktY29tcGxldGVkIGFwcGx5Q29uZmlnQ2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdnJyk7XG5cdFx0Ly8gQmxvY2sgdGhlIHJlLXJlc29sdmUgc28gaXQgZG9lcyBOT1QgcnVuIGJlZm9yZSB0cnlSZWJpbmQncyByZWFkLlxuXHRcdGNvbnN0IGJsb2NrZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRcdGNsZWFudXAuYWRkKHsgZGlzcG9zZTogKCkgPT4gYmxvY2tlZC5jYW5jZWwoKSB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW2Jsb2NrZWQucF07XG5cblx0XHQvLyBGaXJlLWFuZC1mb3JnZXQgYXBwbHlDb25maWdDaGFuZ2UgXHUyMDE0IHdlIGRlbGliZXJhdGVseSBkbyBOT1QgYXdhaXQgaXQuXG5cdFx0dm9pZCBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXG5cdFx0Ly8gWWllbGQgZW5vdWdoIG1pY3JvdGFza3MgZm9yIGdldE9yQ3JlYXRlICsgdGhlIHN5bmNocm9ub3VzIHByZWx1ZGUgdG8gcnVuLlxuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBOb3cgcGVyZm9ybSBhIHJlYmluZC4gVGhlIG5ldyBiYWNrZW5kIHNlc3Npb24gbXVzdCBiZSBjcmVhdGVkIHdpdGggdGhlXG5cdFx0Ly8gdXAtdG8tZGF0ZSBjb25maWcgdGhlIHVzZXIganVzdCBzZXQgXHUyMDE0IHByb3ZpbmcgZW50cnkuY29uZmlnIHdhcyBtdXRhdGVkXG5cdFx0Ly8gc3luY2hyb25vdXNseSwgbm90IGRlZmVycmVkIGJlaGluZCB0aGUgKHN0aWxsLWJsb2NrZWQpIHJlLXJlc29sdmUuXG5cdFx0Y29uc3QgbmV3VWkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvcmVhbC1nJyB9KTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC50cnlSZWJpbmQodWksIG5ld1VpLCAnY29waWxvdCcsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZWJvdW5kQ3JlYXRlID0gYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmZpbmQoYyA9PiBjLnNlc3Npb24/LnBhdGggPT09ICcvcmVhbC1nJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlYm91bmRDcmVhdGUsICdyZWJpbmQgdHJpZ2dlcmVkIGEgY3JlYXRlU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWJvdW5kQ3JlYXRlIS5jb25maWc/LlsnaXNvbGF0aW9uJ10sICd3b3JrdHJlZScpO1xuXG5cdFx0YmxvY2tlZC5jb21wbGV0ZSh7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZVNlc3Npb24gZHJvcHMgdGhlIGVudHJ5IGFuZCBpdHMgb3ZlcmxheScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnaCcpO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0gfV07XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHRhc3NlcnQub2socHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpKTtcblxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmRpc3Bvc2VTZXNzaW9uKHVpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlzaW9uYWwuZ2V0KHVpKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcG9zZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbGVkIHJlLXJlc29sdmUgcHJlc2VydmVzIHRoZSBwcmV2aW91cyBvdmVybGF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdpJyk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtcblx0XHRcdHsgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH0sXG5cdFx0XHRQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2Jvb20nKSksXG5cdFx0XTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHRcdGNvbnN0IGJlZm9yZSA9IHByb3Zpc2lvbmFsLmdldFJlc29sdmVkQ29uZmlnKHVpKTtcblx0XHRhc3NlcnQub2soYmVmb3JlKTtcblxuXHRcdC8vIEEgZmFpbGVkIHJlLXJlc29sdmUgc2hvdWxkIG5vdCB0aHJvdyBvdXQgb2YgYXBwbHlDb25maWdDaGFuZ2UgYW5kXG5cdFx0Ly8gbXVzdCBsZWF2ZSB0aGUgcHJldmlvdXMgb3ZlcmxheSBzY2hlbWEgaW4gcGxhY2UuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGJyYW5jaDogJ2ZlYXR1cmUveCcgfSk7XG5cblx0XHRjb25zdCBhZnRlciA9IHByb3Zpc2lvbmFsLmdldFJlc29sdmVkQ29uZmlnKHVpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFmdGVyPy5zY2hlbWEsIGJlZm9yZS5zY2hlbWEsICdzY2hlbWEgdW5jaGFuZ2VkIGFmdGVyIGZhaWxlZCByZS1yZXNvbHZlJyk7XG5cdFx0Ly8gT3B0aW1pc3RpYyBtZXJnZSBzdGlsbCBhcHBsaWVkIGZvciB2YWx1ZXMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFmdGVyPy52YWx1ZXM/LlsnYnJhbmNoJ10sICdmZWF0dXJlL3gnKTtcblx0fSk7XG5cblx0Ly8gWWllbGQgZW5vdWdoIG1pY3JvdGFza3MgKyBhIG1hY3JvdGFzayBmb3IgdGhlIGZpcmUtYW5kLWZvcmdldCBmb2xkZXItY2hhbmdlXG5cdC8vIHJlY3JlYXRpb24gKGRpc3Bvc2UgLT4gY3JlYXRlIC0+IHJlLXJlc29sdmUpIHRvIHNldHRsZSBhZ2FpbnN0IHRoZSBtb2NrLlxuXHRhc3luYyBmdW5jdGlvbiBmbHVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHR9XG5cblx0dGVzdCgnZm9sZGVyIGNoYW5nZSByZWNyZWF0ZXMgdGhlIHByb3Zpc2lvbmFsIGF0IHRoZSBuZXcgY3dkIHByZXNlcnZpbmcgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL3JlcG9BJyk7XG5cdFx0Y29uc3QgZm9sZGVyQiA9IFVSSS5maWxlKCcvcmVwb0InKTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnY3dkMScpO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0gfV07XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgZm9sZGVyQSwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gUmUtcmVzb2x2ZSByZXNwb25zZSBmb3IgdGhlIHJlY3JlYXRpb24gYXQgdGhlIG5ldyBjd2QuXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFt7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9XTtcblx0XHRmb2xkZXJTZXJ2aWNlLnNldEZvbGRlcih1aSwgZm9sZGVyQik7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGNvbnN0IHJlY3JlYXRlID0gYWdlbnRIb3N0LmNyZWF0ZUNhbGxzW2FnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGggLSAxXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZUNvdW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLFxuXHRcdFx0ZGlzcG9zZWRPbGQ6IGFnZW50SG9zdC5kaXNwb3NlZC5zb21lKGQgPT4gZC50b1N0cmluZygpID09PSBleHBlY3RlZEJhY2tlbmRVcmkoJ2N3ZDEnKS50b1N0cmluZygpKSxcblx0XHRcdHJlY3JlYXRlZFNlc3Npb246IHJlY3JlYXRlLnNlc3Npb24/LnRvU3RyaW5nKCksXG5cdFx0XHRyZWNyZWF0ZWRDd2Q6IHJlY3JlYXRlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdPy50b1N0cmluZygpLFxuXHRcdFx0cmVjcmVhdGVkQ29uZmlnOiByZWNyZWF0ZS5jb25maWc/LlsnaXNvbGF0aW9uJ10sXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlQ291bnQ6IDIsXG5cdFx0XHRkaXNwb3NlZE9sZDogdHJ1ZSxcblx0XHRcdHJlY3JlYXRlZFNlc3Npb246IGV4cGVjdGVkQmFja2VuZFVyaSgnY3dkMScpLnRvU3RyaW5nKCksXG5cdFx0XHRyZWNyZWF0ZWRDd2Q6IGZvbGRlckIudG9TdHJpbmcoKSxcblx0XHRcdHJlY3JlYXRlZENvbmZpZzogJ3dvcmt0cmVlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyIGNoYW5nZSB0byB0aGUgc2FtZSBmb2xkZXIgaXMgYSBuby1vcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJBID0gVVJJLmZpbGUoJy9yZXBvQScpO1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdjd2QyJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgZm9sZGVyQSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsIDEpO1xuXG5cdFx0Zm9sZGVyU2VydmljZS5zZXRGb2xkZXIodWksIGZvbGRlckEpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmxlbmd0aCwgMSwgJ25vIHJlY3JlYXRlIGZvciB1bmNoYW5nZWQgZm9sZGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwb3NlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXIgY2hhbmdlIHdpdGggbm8gcHJvdmlzaW9uYWwgZW50cnkgaXMgYSBuby1vcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnY3dkMycpO1xuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBVUkkuZmlsZSgnL3JlcG9CJykpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3Zpc2lvbmFsLmdldCh1aSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlcml2ZXMgdGhlIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IGZyb20gdGhlIHBpY2tlZCBwcmltYXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL3JlcG9BJyk7XG5cdFx0Y29uc3QgZm9sZGVyQiA9IFVSSS5maWxlKCcvcmVwb0InKTtcblx0XHRjb25zdCBmb2xkZXJDID0gVVJJLmZpbGUoJy9yZXBvQycpO1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbZm9sZGVyQSwgZm9sZGVyQiwgZm9sZGVyQ107XG5cdFx0Ly8gVGhlIHByb3ZpZGVyIGFkdmVydGlzZXMgbXVsdGktcm9vdCBzdXBwb3J0LCBzbyB0aGUgY2xpZW50IHNlbmRzIHRoZSBzZXQuXG5cdFx0YWdlbnRIb3N0LnJvb3RTdGF0ZUFnZW50cyA9IFthZ2VudEluZm8oJ2NvcGlsb3QnLCB0cnVlKV07XG5cblx0XHRjb25zdCBtdWx0aVJvb3QgPSB1bnRpdGxlZENoYXRVcmkoJ211bHRpJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUobXVsdGlSb290LCAnY29waWxvdCcsIGZvbGRlckIpO1xuXG5cdFx0Ly8gQSBzaW5nbGUtZm9sZGVyIHdvcmtzcGFjZSBrZWVwcyBqdXN0IHRoZSBwcmltYXJ5IChieXRlLWlkZW50aWNhbCB0byB0aGVcblx0XHQvLyBwcmV2aW91cyBzaW5nbGUtZGlyZWN0b3J5IGJlaGF2aW91cikuXG5cdFx0d29ya3NwYWNlRm9sZGVycyA9IFtmb2xkZXJBXTtcblx0XHRjb25zdCBzaW5nbGVSb290ID0gdW50aXRsZWRDaGF0VXJpKCdzaW5nbGUnKTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZShzaW5nbGVSb290LCAnY29waWxvdCcsIGZvbGRlckEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtdWx0aVJvb3Q6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5maW5kKGMgPT4gYy5zZXNzaW9uPy50b1N0cmluZygpID09PSBleHBlY3RlZEJhY2tlbmRVcmkoJ211bHRpJykudG9TdHJpbmcoKSk/LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdHNpbmdsZVJvb3Q6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5maW5kKGMgPT4gYy5zZXNzaW9uPy50b1N0cmluZygpID09PSBleHBlY3RlZEJhY2tlbmRVcmkoJ3NpbmdsZScpLnRvU3RyaW5nKCkpPy53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0bXVsdGlSb290OiBbZm9sZGVyQi50b1N0cmluZygpLCBmb2xkZXJBLnRvU3RyaW5nKCksIGZvbGRlckMudG9TdHJpbmcoKV0sXG5cdFx0XHRzaW5nbGVSb290OiBbZm9sZGVyQS50b1N0cmluZygpXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgb25seSB0aGUgcHJpbWFyeSB3aGVuIHRoZSBwcm92aWRlciBkb2VzIG5vdCBhZHZlcnRpc2UgbXVsdGlwbGUgd29ya2luZyBkaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJBID0gVVJJLmZpbGUoJy9yZXBvQScpO1xuXHRcdGNvbnN0IGZvbGRlckIgPSBVUkkuZmlsZSgnL3JlcG9CJyk7XG5cdFx0Y29uc3QgZm9sZGVyQyA9IFVSSS5maWxlKCcvcmVwb0MnKTtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW2ZvbGRlckEsIGZvbGRlckIsIGZvbGRlckNdO1xuXG5cdFx0Ly8gVGhlIHNhbWUgcHJvdmlkZXIgZ2V0cyB0aGUgZnVsbCBvcmRlcmVkIHNldCB3aGlsZSBpdCBhZHZlcnRpc2VzIHRoZVxuXHRcdC8vIGNhcGFiaWxpdHksIGFuZCBvbmx5IHRoZSBwcmltYXJ5IG9uY2UgaXQgZG9lcyBub3QgXHUyMDE0IHRoZSBjbGllbnQgbWlycm9yc1xuXHRcdC8vIHRoZSBub2RlLXNpZGUgZ3VhcmQgaW5zdGVhZCBvZiByZWx5aW5nIG9uIGl0IGFsb25lLlxuXHRcdGFnZW50SG9zdC5yb290U3RhdGVBZ2VudHMgPSBbYWdlbnRJbmZvKCdjb3BpbG90JywgdHJ1ZSldO1xuXHRcdGNvbnN0IG11bHRpID0gdW50aXRsZWRDaGF0VXJpKCdjYXAtbXVsdGknKTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZShtdWx0aSwgJ2NvcGlsb3QnLCBmb2xkZXJCKTtcblxuXHRcdGFnZW50SG9zdC5yb290U3RhdGVBZ2VudHMgPSBbYWdlbnRJbmZvKCdjb3BpbG90JywgZmFsc2UpXTtcblx0XHRjb25zdCBzaW5nbGUgPSB1bnRpdGxlZENoYXRVcmkoJ2NhcC1zaW5nbGUnKTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZShzaW5nbGUsICdjb3BpbG90JywgZm9sZGVyQik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFkdmVydGlzaW5nOiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuZmluZChjID0+IGMuc2Vzc2lvbj8udG9TdHJpbmcoKSA9PT0gZXhwZWN0ZWRCYWNrZW5kVXJpKCdjYXAtbXVsdGknKS50b1N0cmluZygpKT8ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpLFxuXHRcdFx0bm9uQWR2ZXJ0aXNpbmc6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5maW5kKGMgPT4gYy5zZXNzaW9uPy50b1N0cmluZygpID09PSBleHBlY3RlZEJhY2tlbmRVcmkoJ2NhcC1zaW5nbGUnKS50b1N0cmluZygpKT8ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpLFxuXHRcdH0sIHtcblx0XHRcdGFkdmVydGlzaW5nOiBbZm9sZGVyQi50b1N0cmluZygpLCBmb2xkZXJBLnRvU3RyaW5nKCksIGZvbGRlckMudG9TdHJpbmcoKV0sXG5cdFx0XHRub25BZHZlcnRpc2luZzogW2ZvbGRlckIudG9TdHJpbmcoKV0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8qKiBNaW5pbWFsIHtAbGluayBBZ2VudEluZm99IGZvciBjYXBhYmlsaXR5LWdhdGluZyB0ZXN0cy4gKi9cbmZ1bmN0aW9uIGFnZW50SW5mbyhwcm92aWRlcjogc3RyaW5nLCBtdWx0aXBsZVdvcmtpbmdEaXJlY3RvcmllczogYm9vbGVhbik6IEFnZW50SW5mbyB7XG5cdHJldHVybiB7XG5cdFx0cHJvdmlkZXIsXG5cdFx0ZGlzcGxheU5hbWU6IHByb3ZpZGVyLFxuXHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRtb2RlbHM6IFtdLFxuXHRcdGNhcGFiaWxpdGllczogbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXMgPyB7IG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzOiB7IGltbXV0YWJsZVByaW1hcnk6IHRydWUgfSB9IDoge30sXG5cdH0gYXMgQWdlbnRJbmZvO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFvQyx5QkFBMkQ7QUFDL0YsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxnQ0FBOEQ7QUFHdkUsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrREFBK0Y7QUFDeEcsU0FBUyxrQ0FBa0MseUNBQXlDO0FBQ3BGLFNBQVMsa0NBQWtDLHlDQUF5QztB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
