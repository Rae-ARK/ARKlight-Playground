import assert from "assert";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { hasKey } from "../../../../base/common/types.js";
import { NullLogService } from "../../../log/common/log.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, SubagentChatSignal } from "../../common/agentService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, CustomizationType, MessageAttachmentKind, MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, buildSubagentSessionUri, customizationId, isSubagentSession, parseChatUri, parseSubagentSessionUri, ChatOriginKind } from "../../common/state/sessionState.js";
import { AgentService } from "../../node/agentService.js";
import { AgentHostManagementService } from "../../node/agentHostManagementService.js";
import { MockAgent, ScriptedMockAgent } from "./mockAgent.js";
import { mapSessionEventsToHistoryRecords } from "./historyRecordFixtures.js";
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
import { buildSessionChangesetUri, buildUncommittedChangesetUri } from "../../common/changesetUri.js";
import { WorktreeIsolation, WORKTREE_META_REPOSITORY_ROOT } from "../../node/shared/worktreeIsolation.js";
import { AhpErrorCodes, JSON_RPC_INTERNAL_ERROR, ProtocolError } from "../../common/state/sessionProtocol.js";
async function loadFixtureMessages(fixtureName, session) {
  const thisFile = fileURLToPath(import.meta.url);
  const srcFile = thisFile.replace(/[/\\]out[/\\]/, (m) => m.replace("out", "src"));
  const lastSep = Math.max(srcFile.lastIndexOf("/"), srcFile.lastIndexOf("\\"));
  const fixtureDir = srcFile.substring(0, lastSep);
  const sep = srcFile.includes("\\") ? "\\" : "/";
  const raw = readFileSync(`${fixtureDir}${sep}test-cases${sep}${fixtureName}`, "utf-8");
  const events = raw.trim().split("\n").map((line) => JSON.parse(line));
  return mapSessionEventsToHistoryRecords(session, void 0, events);
}
class TestCopilotApiService {
  constructor() {
    this.utilityCalls = [];
    this.response = "Generated session title";
  }
  messages() {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
  }
  async responses() {
    throw new Error("not used");
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  async utilityChatCompletion(githubToken, request, options) {
    this.utilityCalls.push({ token: githubToken, request, options });
    if (this.error) {
      throw this.error;
    }
    if (this.responsePromise) {
      return this.responsePromise;
    }
    return this.response;
  }
}
suite("AgentService (node dispatcher)", () => {
  const disposables = new DisposableStore();
  let service;
  let copilotAgent;
  let fileService;
  let nullSessionDataService;
  setup(async () => {
    nullSessionDataService = {
      _serviceBrand: void 0,
      getSessionDataDir: () => URI.parse("inmemory:/session-data"),
      getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
      openDatabase: () => {
        throw new Error("not implemented");
      },
      tryOpenDatabase: async () => void 0,
      deleteSessionData: async () => {
      },
      onWillDeleteSessionData: Event.None,
      cleanupOrphanedData: async () => {
      },
      whenIdle: async () => {
      }
    };
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: "/testDir" }));
    await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: "/testDir/file.txt" }), VSBuffer.fromString("hello"));
    service = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
    copilotAgent = new MockAgent("copilot");
    disposables.add(toDisposable(() => copilotAgent.dispose()));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("registerProvider", () => {
    test("registers a provider successfully", () => {
      service.registerProvider(copilotAgent);
    });
    test("throws on duplicate provider registration", () => {
      service.registerProvider(copilotAgent);
      const duplicate = new MockAgent("copilot");
      disposables.add(toDisposable(() => duplicate.dispose()));
      assert.throws(() => service.registerProvider(duplicate), /already registered/);
    });
    test("aggregates and deduplicates network diagnostics endpoints", async () => {
      const providerA = copilotAgent;
      providerA.getNetworkDiagnosticsEndpoints = async () => [
        { name: "First", url: "https://example.com" },
        { name: "Other", url: "https://other.example.com" }
      ];
      providerA.getNetworkDiagnosticsAccount = async () => "octocat";
      const providerB = new MockAgent("other");
      disposables.add(toDisposable(() => providerB.dispose()));
      const providerBContract = providerB;
      providerBContract.getNetworkDiagnosticsEndpoints = async () => [
        { name: "Duplicate", url: "https://example.com/" }
      ];
      const failingProvider = new MockAgent("failing");
      disposables.add(toDisposable(() => failingProvider.dispose()));
      const failingProviderContract = failingProvider;
      failingProviderContract.getNetworkDiagnosticsEndpoints = async () => {
        throw new Error("unavailable");
      };
      const diagnostics = {
        _serviceBrand: void 0,
        getInfo: async (endpoints, account) => ({ version: "test", os: "test", arch: "test", account, proxySettings: {}, proxyEnv: {}, endpoints }),
        fetch: async (url) => ({ url })
      };
      service.setNetworkDiagnosticsService(diagnostics);
      service.registerProvider(providerA);
      service.registerProvider(providerB);
      service.registerProvider(failingProvider);
      const info = await service.getNetworkDiagnosticsInfo();
      assert.deepStrictEqual({ account: info.account, endpoints: info.endpoints }, {
        account: "octocat",
        endpoints: [
          { name: "First", url: "https://example.com" },
          { name: "Other", url: "https://other.example.com" }
        ]
      });
    });
    test("aggregates managed-settings diagnostics from capable providers", async () => {
      const provider = copilotAgent;
      provider.getManagedSettingsDiagnostics = async () => ({
        source: "device",
        serverManaged: false,
        deviceManaged: true,
        failClosed: false,
        bypassPermissionsDisabled: false,
        managedKeys: ["permissions"],
        settings: { permissions: { allow: ["Shell(echo *)"] } }
      });
      const unsupportedProvider = new MockAgent("other");
      disposables.add(toDisposable(() => unsupportedProvider.dispose()));
      const failingProvider = new MockAgent("failing");
      disposables.add(toDisposable(() => failingProvider.dispose()));
      const failingProviderContract = failingProvider;
      failingProviderContract.getManagedSettingsDiagnostics = async () => {
        throw new Error("unavailable");
      };
      service.registerProvider(provider);
      service.registerProvider(unsupportedProvider);
      service.registerProvider(failingProvider);
      const diagnostics = await service.getManagedSettingsDiagnostics();
      assert.deepStrictEqual(diagnostics, [
        {
          provider: "copilot",
          snapshot: {
            source: "device",
            serverManaged: false,
            deviceManaged: true,
            failClosed: false,
            bypassPermissionsDisabled: false,
            managedKeys: ["permissions"],
            settings: { permissions: { allow: ["Shell(echo *)"] } }
          }
        },
        { provider: "failing", error: "unavailable" }
      ]);
    });
    test("forwards managed-settings diagnostics through the local management service", async () => {
      const provider = copilotAgent;
      provider.getManagedSettingsDiagnostics = async () => ({
        source: "device",
        serverManaged: false,
        deviceManaged: true,
        failClosed: false,
        bypassPermissionsDisabled: false,
        managedKeys: ["permissions"]
      });
      service.registerProvider(provider);
      const managementService = new AgentHostManagementService(service, {});
      assert.deepStrictEqual(await managementService.getManagedSettingsDiagnostics(), [{
        provider: "copilot",
        snapshot: {
          source: "device",
          serverManaged: false,
          deviceManaged: true,
          failClosed: false,
          bypassPermissionsDisabled: false,
          managedKeys: ["permissions"]
        }
      }]);
    });
    test("maps progress events to protocol actions via onDidAction", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      service.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hello", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      const envelopes = [];
      disposables.add(service.onDidAction((e) => envelopes.push(e)));
      copilotAgent.fireProgress({
        kind: "action",
        resource: URI.parse(buildDefaultChatUri(session.toString())),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-1", content: "hello" } }
      });
      assert.ok(envelopes.some((e) => e.action.type === ActionType.ChatResponsePart));
    });
  });
  test("resolveSessionConfig echoes host-owned worktree values across isolation modes", async () => {
    const workingDirectory = URI.file("/workspace/repo");
    const gitService = createNoopGitService();
    gitService.getRepositoryRoot = async () => workingDirectory;
    gitService.revParse = async () => "head";
    gitService.getCurrentBranch = async () => "feature";
    gitService.getDefaultBranch = async () => ({ name: "main", startPoint: "main" });
    const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
    localService.setWorktreeIsolation(disposables.add(new WorktreeIsolation(
      { generateBranchName: async () => "agents/test" },
      gitService,
      new TestCopilotApiService(),
      nullSessionDataService,
      new NullLogService()
    )));
    const agent = new MockAgent("copilot");
    disposables.add(toDisposable(() => agent.dispose()));
    localService.registerProvider(agent);
    const includeFiles = [".env", ".env.local", "config/**"];
    const worktree = await localService.resolveSessionConfig({
      provider: "copilot",
      workingDirectory,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "feature", [SessionConfigKey.WorktreeIncludeFiles]: includeFiles }
    });
    const folder = await localService.resolveSessionConfig({
      provider: "copilot",
      workingDirectory,
      config: { [SessionConfigKey.Isolation]: "folder", [SessionConfigKey.WorktreeIncludeFiles]: includeFiles }
    });
    assert.deepStrictEqual({
      worktreeBranch: worktree.values[SessionConfigKey.Branch],
      worktreeReadOnly: worktree.schema.properties[SessionConfigKey.WorktreeIncludeFiles]?.readOnly,
      worktreeValue: worktree.values[SessionConfigKey.WorktreeIncludeFiles],
      folderReadOnly: folder.schema.properties[SessionConfigKey.WorktreeIncludeFiles]?.readOnly,
      folderValue: folder.values[SessionConfigKey.WorktreeIncludeFiles]
    }, {
      worktreeBranch: "feature",
      worktreeReadOnly: true,
      worktreeValue: includeFiles,
      folderReadOnly: true,
      folderValue: includeFiles
    });
  });
  test("session config keeps host-owned values outside provider calls", async () => {
    const workingDirectory = URI.file("/workspace/repo");
    const gitService = createNoopGitService();
    gitService.getRepositoryRoot = async () => workingDirectory;
    gitService.revParse = async () => "head";
    gitService.getCurrentBranch = async () => "feature";
    gitService.getDefaultBranch = async () => ({ name: "main", startPoint: "origin/main" });
    const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
    localService.setWorktreeIsolation(disposables.add(new WorktreeIsolation(
      { generateBranchName: async () => "agents/test" },
      gitService,
      new TestCopilotApiService(),
      nullSessionDataService,
      new NullLogService()
    )));
    const agent = new MockAgent("codex");
    const providerResolveConfigs = [];
    const providerCompletionConfigs = [];
    agent.resolveSessionConfig = async (params) => {
      providerResolveConfigs.push(params.config);
      return {
        schema: {
          type: "object",
          properties: {
            [SessionConfigKey.Isolation]: { type: "string", title: "Provider Isolation" },
            [SessionConfigKey.Branch]: { type: "string", title: "Provider Branch" },
            providerSetting: { type: "string", title: "Provider Setting" }
          }
        },
        values: {
          ...params.config,
          [SessionConfigKey.Isolation]: "folder",
          [SessionConfigKey.Branch]: "provider-branch"
        }
      };
    };
    agent.sessionConfigCompletions = async (params) => {
      providerCompletionConfigs.push(params.config);
      return { items: [] };
    };
    disposables.add(toDisposable(() => agent.dispose()));
    localService.registerProvider(agent);
    const initial = await localService.resolveSessionConfig({
      provider: "codex",
      workingDirectory,
      config: { [SessionConfigKey.Isolation]: "worktree", providerSetting: "initial" }
    });
    const selected = await localService.resolveSessionConfig({
      provider: "codex",
      workingDirectory,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "feature/config",
        [SessionConfigKey.WorktreeBranchPrefix]: "users/test/",
        [SessionConfigKey.WorktreeIncludeFiles]: [".env"],
        [SessionConfigKey.WorktreeBranchTrack]: false,
        providerSetting: "selected"
      }
    });
    const folder = await localService.resolveSessionConfig({
      provider: "codex",
      workingDirectory,
      config: { [SessionConfigKey.Isolation]: "folder", [SessionConfigKey.Branch]: "feature/config", providerSetting: "folder" }
    });
    await localService.sessionConfigCompletions({
      provider: "codex",
      workingDirectory,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "feature/config",
        [SessionConfigKey.WorktreeBranchPrefix]: "users/test/",
        [SessionConfigKey.WorktreeIncludeFiles]: [".env"],
        [SessionConfigKey.WorktreeBranchTrack]: false,
        providerSetting: "completion"
      },
      property: "providerSetting"
    });
    assert.deepStrictEqual({
      providerResolveConfigs,
      providerCompletionConfigs,
      initial: {
        isolation: initial.values[SessionConfigKey.Isolation],
        branchDefault: initial.schema.properties[SessionConfigKey.Branch]?.default,
        branch: initial.values[SessionConfigKey.Branch],
        providerSetting: initial.values.providerSetting
      },
      selected: {
        isolation: selected.values[SessionConfigKey.Isolation],
        branch: selected.values[SessionConfigKey.Branch],
        branchPrefix: selected.values[SessionConfigKey.WorktreeBranchPrefix],
        includeFiles: selected.values[SessionConfigKey.WorktreeIncludeFiles],
        branchTrack: selected.values[SessionConfigKey.WorktreeBranchTrack],
        providerSetting: selected.values.providerSetting
      },
      folder: {
        isolation: folder.values[SessionConfigKey.Isolation],
        branch: folder.values[SessionConfigKey.Branch],
        providerSetting: folder.values.providerSetting
      }
    }, {
      providerResolveConfigs: [
        { providerSetting: "initial" },
        { providerSetting: "selected" },
        { providerSetting: "folder" }
      ],
      providerCompletionConfigs: [{ providerSetting: "completion" }],
      initial: { isolation: "worktree", branchDefault: "main", branch: "main", providerSetting: "initial" },
      selected: { isolation: "worktree", branch: "feature/config", branchPrefix: "users/test/", includeFiles: [".env"], branchTrack: false, providerSetting: "selected" },
      folder: { isolation: "folder", branch: "feature", providerSetting: "folder" }
    });
  });
  test("marks worktree isolation pending before a provisional provider can prewarm", async () => {
    const session = AgentSession.uri("codex", "pending-before-create");
    const workingDirectory = URI.file("/workspace/repo");
    const gitService = createNoopGitService();
    gitService.getRepositoryRoot = async () => workingDirectory;
    gitService.revParse = async () => "head";
    gitService.getCurrentBranch = async () => "feature";
    gitService.getDefaultBranch = async () => ({ name: "main", startPoint: "main" });
    const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
    const isolation = disposables.add(new WorktreeIsolation(
      { generateBranchName: async () => "agents/test" },
      gitService,
      new TestCopilotApiService(),
      nullSessionDataService,
      new NullLogService()
    ));
    localService.setWorktreeIsolation(isolation);
    const pendingDuringCreate = [];
    const providerCreateConfigs = [];
    let failCreate = false;
    class PrewarmingAgent extends MockAgent {
      async createSession(config) {
        pendingDuringCreate.push(localService.configurationService.isWorkingDirectoryPending(config.session.toString()));
        providerCreateConfigs.push(config?.config);
        if (failCreate) {
          throw new Error("create failed");
        }
        return { ...await super.createSession(config), provisional: true };
      }
    }
    const agent = new PrewarmingAgent("codex");
    disposables.add(toDisposable(() => agent.dispose()));
    localService.registerProvider(agent);
    await localService.createSession({
      provider: "codex",
      session,
      workingDirectories: workingDirectory ? [workingDirectory] : void 0,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" }
    });
    const failedSession = AgentSession.uri("codex", "failed-before-create");
    failCreate = true;
    await assert.rejects(localService.createSession({
      provider: "codex",
      session: failedSession,
      workingDirectories: workingDirectory ? [workingDirectory] : void 0,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" }
    }), /create failed/);
    assert.deepStrictEqual({
      pendingDuringCreate,
      providerCreateConfigs,
      pendingAfterCreate: localService.configurationService.isWorkingDirectoryPending(session.toString()),
      pendingAfterFailure: localService.configurationService.isWorkingDirectoryPending(failedSession.toString())
    }, {
      pendingDuringCreate: [true, true],
      providerCreateConfigs: [{}, {}],
      pendingAfterCreate: true,
      pendingAfterFailure: false
    });
  });
  test("reconciles pending worktree isolation when creating session config changes", async () => {
    const gitService = createNoopGitService();
    const sessionDataService = createSessionDataService(new TestSessionDatabase());
    const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, gitService));
    const isolation = disposables.add(new WorktreeIsolation(
      { generateBranchName: async () => "agents/test" },
      gitService,
      new TestCopilotApiService(),
      sessionDataService,
      new NullLogService()
    ));
    localService.setWorktreeIsolation(isolation);
    class ProvisionalAgent extends MockAgent {
      async createSession(config) {
        return { ...await super.createSession(config), provisional: true };
      }
    }
    const provisionalAgent = new ProvisionalAgent("codex");
    const readyAgent = new MockAgent("copilot");
    disposables.add(toDisposable(() => provisionalAgent.dispose()));
    disposables.add(toDisposable(() => readyAgent.dispose()));
    localService.registerProvider(provisionalAgent);
    localService.registerProvider(readyAgent);
    const creatingSession = await localService.createSession({
      provider: "codex",
      workingDirectories: [URI.file("/workspace/repo")],
      config: { [SessionConfigKey.Isolation]: "folder" }
    });
    const readySession = await localService.createSession({
      provider: "copilot",
      workingDirectories: [URI.file("/workspace/repo")],
      config: { [SessionConfigKey.Isolation]: "folder" }
    });
    const creatingInitially = localService.configurationService.isWorkingDirectoryPending(creatingSession.toString());
    const readyInitially = localService.configurationService.isWorkingDirectoryPending(readySession.toString());
    const creatingLifecycle = localService.stateManager.getSessionState(creatingSession.toString())?.lifecycle;
    const readyLifecycle = localService.stateManager.getSessionState(readySession.toString())?.lifecycle;
    localService.dispatchAction(creatingSession.toString(), {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.Isolation]: "worktree" }
    }, "test-client", 1);
    const creatingAfterWorktree = localService.configurationService.isWorkingDirectoryPending(creatingSession.toString());
    localService.dispatchAction(creatingSession.toString(), {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.Isolation]: "folder" }
    }, "test-client", 2);
    const creatingAfterFolder = localService.configurationService.isWorkingDirectoryPending(creatingSession.toString());
    localService.dispatchAction(readySession.toString(), {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.Isolation]: "worktree" }
    }, "test-client", 3);
    const readyAfterWorktree = localService.configurationService.isWorkingDirectoryPending(readySession.toString());
    assert.deepStrictEqual({
      creatingInitially,
      readyInitially,
      creatingLifecycle,
      readyLifecycle,
      creatingAfterWorktree,
      creatingAfterFolder,
      readyAfterWorktree
    }, {
      creatingInitially: false,
      readyInitially: false,
      creatingLifecycle: SessionLifecycle.Creating,
      readyLifecycle: SessionLifecycle.Ready,
      creatingAfterWorktree: true,
      creatingAfterFolder: false,
      readyAfterWorktree: false
    });
  });
  suite("resourceRead", () => {
    test("maps missing files to NotFound", async () => {
      const uri = URI.from({ scheme: Schemas.inMemory, path: "/missing.txt" });
      await assert.rejects(
        () => service.resourceRead(uri),
        (error) => error instanceof ProtocolError && error.code === AhpErrorCodes.NotFound && error.message === `Content not found: ${uri.toString()}`
      );
    });
    test("does not map all read failures to NotFound", async () => {
      const uri = URI.from({ scheme: Schemas.inMemory, path: "/testDir/file.txt" });
      const originalReadFile = fileService.readFile.bind(fileService);
      fileService.readFile = async (resource) => {
        if (resource.toString() === uri.toString()) {
          return Promise.reject("Injected unknown read failure");
        }
        return originalReadFile(resource);
      };
      disposables.add(toDisposable(() => fileService.readFile = originalReadFile));
      await assert.rejects(
        () => service.resourceRead(uri),
        (error) => error instanceof ProtocolError && error.code === JSON_RPC_INTERNAL_ERROR && error.message === `Failed to read content: ${uri.toString()}: Injected unknown read failure`
      );
    });
  });
  suite("dispatchAction", () => {
    async function waitForCondition(predicate, message) {
      for (let i = 0; i < 20; i++) {
        if (await predicate()) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.ok(await predicate(), message);
    }
    async function setupTitleGeneration(copilotApiService) {
      const db = new TestSessionDatabase();
      const sessionDataService = createSessionDataService(db);
      const svc = disposables.add(new AgentService(
        new NullLogService(),
        fileService,
        sessionDataService,
        { _serviceBrand: void 0 },
        createNoopGitService(),
        void 0,
        void 0,
        void 0,
        copilotApiService
      ));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      svc.registerProvider(agent);
      await svc.authenticate({
        resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
        scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
        token: "gh-token"
      });
      const session = await svc.createSession({ provider: "copilot" });
      return { svc, agent, session, db };
    }
    test("applies and persists root config changes from clients", async () => {
      const tempDir = URI.file(mkdtempSync(`${tmpdir()}/agent-host-config-`));
      const localDisposables = new DisposableStore();
      try {
        const rootConfigResource = joinPath(tempDir, "agent-host-config.json");
        const svc = localDisposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, createNoopGitService(), rootConfigResource));
        const agent = new MockAgent("copilot");
        localDisposables.add(toDisposable(() => agent.dispose()));
        svc.registerProvider(agent);
        const customization = { uri: "file:///plugin-a", displayName: "Plugin A" };
        svc.dispatchAction(ROOT_STATE_URI, {
          type: ActionType.RootConfigChanged,
          config: { customizations: [customization] }
        }, "test-client", 1);
        let persisted = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const parsed = JSON.parse(readFileSync(rootConfigResource.fsPath, "utf8"));
            assert.deepStrictEqual(
              parsed.customizations,
              [customization]
            );
            persisted = true;
            break;
          } catch {
          }
          if (attempt === 19) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        assert.ok(persisted, "should persist the root config change");
        await svc.configurationService.whenIdle();
      } finally {
        localDisposables.dispose();
        rmSync(tempDir.fsPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    });
    test("generates and persists an AI title after first-turn fallback title", async () => {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.response = '"Fix TypeScript compile errors."';
      const { svc, session, db } = await setupTitleGeneration(copilotApiService);
      const titleActions = [];
      disposables.add(svc.onDidAction((e) => {
        if (e.action.type === ActionType.SessionTitleChanged) {
          titleActions.push(e.action.title);
        }
      }));
      svc.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "Please help me fix the TypeScript compile errors", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      await waitForCondition(() => svc.stateManager.getSessionState(session.toString())?.title === "Fix TypeScript compile errors", "generated title should be applied");
      await waitForCondition(async () => await db.getMetadata("customTitle") !== void 0, "generated title should be persisted");
      assert.deepStrictEqual({
        titles: titleActions,
        token: copilotApiService.utilityCalls[0]?.token,
        promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some((message) => message.content.includes("Please help me fix the TypeScript compile errors")),
        persistedTitle: await db.getMetadata("customTitle")
      }, {
        titles: ["Please help me fix the TypeScript compile errors", "Fix TypeScript compile errors"],
        token: "gh-token",
        promptIncludesUserText: true,
        persistedTitle: "Fix TypeScript compile errors"
      });
    });
    test("leaves fallback title when AI title generation fails", async () => {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.error = new Error("title failed");
      const { svc, session, db } = await setupTitleGeneration(copilotApiService);
      svc.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "Explain workspace search indexing", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should be attempted");
      await Promise.resolve();
      assert.deepStrictEqual({
        title: svc.stateManager.getSessionState(session.toString())?.title,
        persistedTitle: await db.getMetadata("customTitle")
      }, {
        title: "Explain workspace search indexing",
        persistedTitle: void 0
      });
    });
    test("does not overwrite a manual rename with delayed AI title", async () => {
      const copilotApiService = new TestCopilotApiService();
      let resolveTitle;
      copilotApiService.responsePromise = new Promise((resolve) => {
        resolveTitle = resolve;
      });
      const { svc, session, db } = await setupTitleGeneration(copilotApiService);
      svc.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "Create tests for terminal persistence", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should be in flight");
      svc.dispatchAction(
        session.toString(),
        { type: ActionType.SessionTitleChanged, title: "Manual title" },
        "test-client",
        2
      );
      resolveTitle("Terminal persistence tests");
      await waitForCondition(async () => await db.getMetadata("customTitle") === "Manual title", "manual title should be persisted");
      assert.deepStrictEqual({
        title: svc.stateManager.getSessionState(session.toString())?.title,
        persistedTitle: await db.getMetadata("customTitle")
      }, {
        title: "Manual title",
        persistedTitle: "Manual title"
      });
    });
    test("aborts pending AI title generation when session is disposed", async () => {
      const copilotApiService = new TestCopilotApiService();
      let resolveTitle;
      copilotApiService.responsePromise = new Promise((resolve) => {
        resolveTitle = resolve;
      });
      const { svc, session, db } = await setupTitleGeneration(copilotApiService);
      svc.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "Investigate flaky terminal tests", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      await waitForCondition(() => copilotApiService.utilityCalls.length === 1, "title generation should be in flight");
      await svc.disposeSession(session);
      resolveTitle("Flaky terminal tests");
      await Promise.resolve();
      assert.deepStrictEqual({
        aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
        state: svc.stateManager.getSessionState(session.toString()),
        persistedTitle: await db.getMetadata("customTitle")
      }, {
        aborted: true,
        state: void 0,
        persistedTitle: void 0
      });
    });
    test("generates an AI title for forked sessions from the forked chat", async () => {
      const copilotApiService = new TestCopilotApiService();
      copilotApiService.response = "Source generated title";
      const { svc, session: sourceSession } = await setupTitleGeneration(copilotApiService);
      svc.dispatchAction(
        buildDefaultChatUri(sourceSession.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "source-turn", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "Seed fork title", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      await waitForCondition(() => svc.stateManager.getSessionState(sourceSession.toString())?.title === "Source generated title", "source generated title should be applied");
      svc.dispatchAction(
        buildDefaultChatUri(sourceSession.toString()),
        { type: ActionType.ChatTurnComplete, turnId: "source-turn", duration: 1e3 },
        "test-client",
        2
      );
      await waitForCondition(() => (svc.stateManager.getSessionState(sourceSession.toString())?.turns.length ?? 0) === 1, "source turn should be complete before forking");
      copilotApiService.response = "Forked branch title";
      const forkedSession = await svc.createSession({
        provider: "copilot",
        fork: {
          session: sourceSession,
          turnIndex: 0,
          turnId: "source-turn"
        }
      });
      await waitForCondition(() => svc.stateManager.getSessionState(forkedSession.toString())?.title === "Forked branch title", "forked session should get a content-generated title");
      const forkedCall = copilotApiService.utilityCalls[copilotApiService.utilityCalls.length - 1];
      const userMessage = forkedCall.request.messages.find((message) => message.role === "user")?.content ?? "";
      assert.deepStrictEqual({
        title: svc.stateManager.getSessionState(forkedSession.toString())?.title,
        utilityCalls: copilotApiService.utilityCalls.length,
        includesForkedChat: userMessage.includes("Seed fork title")
      }, {
        title: "Forked branch title",
        utilityCalls: 2,
        includesForkedChat: true
      });
    });
  });
  suite("user-message attachment rewriting", () => {
    async function setup2() {
      const sessionDataDir = URI.from({ scheme: Schemas.inMemory, path: "/session-data" });
      const attachmentsRoot = joinPath(sessionDataDir, "attachments");
      await fileService.createFolder(attachmentsRoot);
      const sessionDataService = createSessionDataService();
      sessionDataService.getSessionDataDir = () => sessionDataDir;
      const warnings = [];
      const logService = new class extends NullLogService {
        warn(message) {
          warnings.push(message);
        }
      }();
      const svc = disposables.add(new AgentService(logService, fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      svc.registerProvider(agent);
      const session = await svc.createSession({ provider: "copilot" });
      return { svc, agent, session, attachmentsRoot, warnings };
    }
    async function dispatchTurnAndWait(svc, agent, session, attachments) {
      svc.dispatchAction(
        buildDefaultChatUri(session.toString()),
        {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          message: { text: "hello", origin: { kind: MessageKind.User }, attachments }
        },
        "test-client",
        1
      );
      for (let i = 0; i < 20 && agent.sendMessageCalls.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    test("snapshots EmbeddedResource attachments to disk and rewrites to a Resource URI under the session attachments folder", async () => {
      const { svc, agent, session, attachmentsRoot } = await setup2();
      const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.EmbeddedResource,
        label: "paste.png",
        data: encodeBase64(VSBuffer.wrap(png)),
        contentType: "image/png",
        displayKind: "image"
      }]);
      assert.strictEqual(agent.sendMessageCalls.length, 1);
      const rewritten = agent.sendMessageCalls[0].attachments;
      assert.strictEqual(rewritten?.length, 1);
      const a = rewritten[0];
      assert.strictEqual(a.type, MessageAttachmentKind.Resource);
      if (a.type !== MessageAttachmentKind.Resource) {
        return;
      }
      assert.strictEqual(a.label, "paste.png");
      assert.strictEqual(a.displayKind, "image");
      assert.ok(a.uri.startsWith(attachmentsRoot.toString() + "/"), `attachment uri ${a.uri} should be under ${attachmentsRoot.toString()}/`);
      const written = await fileService.readFile(URI.parse(a.uri));
      assert.deepStrictEqual([...written.value.buffer], [...png]);
    });
    test("preserves existing displayKind / range / selection / _meta on rewrite", async () => {
      const { svc, agent, session } = await setup2();
      const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.EmbeddedResource,
        label: "note.txt",
        data: encodeBase64(VSBuffer.fromString("alpha\nbeta\ngamma")),
        contentType: "text/plain",
        // EmbeddedResource carries optional selection too
        // (textual resources only); make sure the rewriter copies it.
        displayKind: "selection"
      }]);
      const rewritten = agent.sendMessageCalls[0].attachments[0];
      assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
      if (rewritten.type !== MessageAttachmentKind.Resource) {
        return;
      }
      assert.strictEqual(rewritten.displayKind, "selection");
      void range;
    });
    test("snapshots Resource attachments by reading the original file and rewriting to a local snapshot", async () => {
      const { svc, agent, session, attachmentsRoot, warnings } = await setup2();
      const sourceUri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/source.txt" });
      await fileService.writeFile(sourceUri, VSBuffer.fromString("hello world"));
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.Resource,
        uri: sourceUri.toString(),
        label: "source.txt",
        displayKind: "document"
      }]);
      const rewritten = agent.sendMessageCalls[0].attachments[0];
      assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
      if (rewritten.type !== MessageAttachmentKind.Resource) {
        return;
      }
      assert.notStrictEqual(rewritten.uri, sourceUri.toString(), `should be rewritten to the snapshot URI; warnings=${JSON.stringify(warnings)}; got ${rewritten.uri}`);
      assert.ok(rewritten.uri.startsWith(attachmentsRoot.toString() + "/"));
      assert.strictEqual(rewritten.label, "source.txt");
      assert.strictEqual(rewritten.displayKind, "document");
      const snapshot = await fileService.readFile(URI.parse(rewritten.uri));
      assert.strictEqual(snapshot.value.toString(), "hello world");
    });
    test("passes through existing file:// Resource attachments unchanged (#319314)", async () => {
      const { svc, agent, session } = await setup2();
      disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
      const fileUri = URI.from({ scheme: Schemas.file, path: "/host/source.txt" });
      await fileService.writeFile(fileUri, VSBuffer.fromString("on host"));
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.Resource,
        uri: fileUri.toString(),
        label: "source.txt",
        displayKind: "document"
      }]);
      assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
        type: MessageAttachmentKind.Resource,
        uri: fileUri.toString(),
        label: "source.txt",
        displayKind: "document"
      }]);
    });
    test("preserves selection range on Resource rewrite", async () => {
      const { svc, agent, session, attachmentsRoot } = await setup2();
      const sourceUri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/sel.txt" });
      await fileService.writeFile(sourceUri, VSBuffer.fromString("alpha\nbeta\ngamma"));
      const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.Resource,
        uri: sourceUri.toString(),
        label: "sel.txt",
        displayKind: "selection",
        selection: { range }
      }]);
      const rewritten = agent.sendMessageCalls[0].attachments[0];
      assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
      if (rewritten.type !== MessageAttachmentKind.Resource) {
        return;
      }
      assert.ok(rewritten.uri.startsWith(attachmentsRoot.toString() + "/"), "should be rewritten to a snapshot URI");
      assert.deepStrictEqual(rewritten.selection?.range, range);
      assert.strictEqual(rewritten.displayKind, "selection");
    });
    test("passes directory Resource attachments through unchanged", async () => {
      const { svc, agent, session } = await setup2();
      const dirUri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/dir" });
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.Resource,
        uri: dirUri.toString(),
        label: "dir",
        displayKind: "directory"
      }]);
      assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
        type: MessageAttachmentKind.Resource,
        uri: dirUri.toString(),
        label: "dir",
        displayKind: "directory"
      }]);
    });
    test("does not re-snapshot attachments that already point under the session attachments folder", async () => {
      const { svc, agent, session, attachmentsRoot } = await setup2();
      const existing = joinPath(attachmentsRoot, "previous-id", "note.txt");
      await fileService.writeFile(existing, VSBuffer.fromString("already snapshotted"));
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.Resource,
        uri: existing.toString(),
        label: "note.txt",
        displayKind: "document"
      }]);
      const a = agent.sendMessageCalls[0].attachments?.[0];
      assert.ok(a && a.type === MessageAttachmentKind.Resource);
      assert.strictEqual(a.uri, existing.toString(), "second-pass rewrite should be a no-op");
    });
    test("preserves the original attachment when the source cannot be read", async () => {
      const { svc, agent, session } = await setup2();
      const missingUri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/missing.txt" });
      await dispatchTurnAndWait(svc, agent, session, [{
        type: MessageAttachmentKind.Resource,
        uri: missingUri.toString(),
        label: "missing.txt",
        displayKind: "document"
      }]);
      assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
        type: MessageAttachmentKind.Resource,
        uri: missingUri.toString(),
        label: "missing.txt",
        displayKind: "document"
      }]);
    });
  });
  suite("createSession", () => {
    test("creates session via specified provider", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      assert.strictEqual(AgentSession.provider(session), "copilot");
    });
    test("truncates working directories for a provider without multipleWorkingDirectories", async () => {
      class CapturingAgent extends MockAgent {
        constructor(id, _caps) {
          super(id);
          this._caps = _caps;
        }
        getDescriptor() {
          return { ...super.getDescriptor(), capabilities: this._caps };
        }
        async createSession(config) {
          this.lastConfig = config;
          return super.createSession(config);
        }
      }
      const single = new CapturingAgent("single", void 0);
      const multi = new CapturingAgent("multi", { multipleWorkingDirectories: { immutablePrimary: true } });
      disposables.add(toDisposable(() => single.dispose()));
      disposables.add(toDisposable(() => multi.dispose()));
      service.registerProvider(single);
      service.registerProvider(multi);
      const dirs = [URI.file("/repoA"), URI.file("/repoB"), URI.file("/repoC")];
      await service.createSession({ provider: "single", workingDirectories: dirs });
      await service.createSession({ provider: "multi", workingDirectories: dirs });
      assert.deepStrictEqual({
        single: single.lastConfig?.workingDirectories?.map((d) => d.toString()),
        multi: multi.lastConfig?.workingDirectories?.map((d) => d.toString())
      }, {
        single: [dirs[0].toString()],
        multi: dirs.map((d) => d.toString())
      });
    });
    test("honors requested session URI", async () => {
      service.registerProvider(copilotAgent);
      const requestedSession = AgentSession.uri("copilot", "requested-session");
      const session = await service.createSession({ provider: "copilot", session: requestedSession });
      assert.strictEqual(session.toString(), requestedSession.toString());
    });
    test("scripted mock agent honors requested session URI", async () => {
      const agent = new ScriptedMockAgent();
      disposables.add(toDisposable(() => agent.dispose()));
      const requestedSession = AgentSession.uri("mock", "requested-session");
      const result = await agent.createSession({ session: requestedSession });
      const sessions = await agent.listSessions();
      assert.deepStrictEqual({
        created: result.session.toString(),
        listed: sessions.some((s) => s.session.toString() === requestedSession.toString())
      }, {
        created: requestedSession.toString(),
        listed: true
      });
    });
    test("uses default provider when none specified", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession();
      assert.deepStrictEqual({
        provider: AgentSession.provider(session),
        meta: service.stateManager.getSessionState(session.toString())?._meta
      }, {
        provider: "copilot",
        meta: { workspaceless: true }
      });
    });
    test("throws when no providers are registered at all", async () => {
      await assert.rejects(() => service.createSession(), /No agent provider/);
    });
  });
  suite("disposeSession", () => {
    test("dispatches to the correct provider and cleans up tracking", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      await service.disposeSession(session);
      assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1);
    });
    test("is a no-op for unknown sessions", async () => {
      service.registerProvider(copilotAgent);
      const unknownSession = URI.from({ scheme: "unknown", path: "/nope" });
      await service.disposeSession(unknownSession);
    });
    test("deletes session data before removing the worktree", async () => {
      const order = [];
      const sessionDataService = {
        ...nullSessionDataService,
        deleteSessionData: async () => {
          order.push("deleteSessionData");
        }
      };
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(copilotAgent);
      const session = await svc.createSession({ provider: "copilot" });
      svc.setWorktreeIsolation({
        removeCreatedWorktree: async () => {
          order.push("removeCreatedWorktree");
        }
      });
      await svc.disposeSession(session);
      assert.deepStrictEqual(order, ["deleteSessionData", "removeCreatedWorktree"]);
    });
  });
  suite("aggregation", () => {
    test("listSessions aggregates sessions from all providers", async () => {
      service.registerProvider(copilotAgent);
      await service.createSession({ provider: "copilot" });
      const sessions = await service.listSessions();
      assert.strictEqual(sessions.length, 1);
    });
    test("listSessions overlays custom title from session database", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("customTitle", "My Custom Title");
      const sessionId = "test-session-abc";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({
          object: db,
          dispose: () => {
          }
        }),
        tryOpenDatabase: async () => ({
          object: db,
          dispose: () => {
          }
        }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.sessionMetadataOverrides = { summary: "SDK Title" };
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const sessions = await svc.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].summary, "My Custom Title");
    });
    test("listSessions overlays the AH-owned workspaceless marker for any agent", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("agentHost.workspaceless", "true");
      const sessionId = "test-session-workspaceless";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({
          object: db,
          dispose: () => {
          }
        }),
        tryOpenDatabase: async () => ({
          object: db,
          dispose: () => {
          }
        }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const sessions = await svc.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.deepStrictEqual(sessions[0]._meta, { workspaceless: true });
    });
    test("listSessions normalizes a persisted linked-worktree project without probing a missing session worktree", async () => {
      const db = disposables.add(new TestSessionDatabase());
      const primaryRoot = URI.file("/workspace/vscode");
      const linkedCheckout = URI.file("/workspace/vscode.worktrees/parent");
      const sessionWorktree = URI.file("/workspace/vscode.worktrees/parent.worktrees/child");
      await db.setMetadata(WORKTREE_META_REPOSITORY_ROOT, linkedCheckout.toString());
      const sessionId = "test-session-linked-worktree";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.sessionMetadataOverrides = {
        workingDirectories: [sessionWorktree],
        project: { uri: linkedCheckout, displayName: "parent" }
      };
      agent._sessions.set(sessionId, sessionUri);
      const gitService = createNoopGitService();
      const resolvedFrom = [];
      gitService.getWorktreeRoots = async (workingDirectory) => {
        resolvedFrom.push(workingDirectory);
        return [primaryRoot, linkedCheckout, sessionWorktree];
      };
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, gitService));
      svc.registerProvider(agent);
      const sessions = await svc.listSessions();
      await svc.listSessions();
      assert.deepStrictEqual({
        resolvedFrom: resolvedFrom.map((uri) => uri.toString()),
        project: sessions[0].project && { uri: sessions[0].project.uri.toString(), displayName: sessions[0].project.displayName },
        persistedRepositoryRoot: await db.getMetadata(WORKTREE_META_REPOSITORY_ROOT)
      }, {
        resolvedFrom: [linkedCheckout.toString()],
        project: { uri: primaryRoot.toString(), displayName: "vscode" },
        persistedRepositoryRoot: primaryRoot.toString()
      });
    });
    test("listSessions uses SDK title when no custom title exists", async () => {
      service.registerProvider(copilotAgent);
      copilotAgent.sessionMetadataOverrides = { summary: "Auto-generated Title" };
      await service.createSession({ provider: "copilot" });
      const sessions = await service.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].summary, "Auto-generated Title");
    });
    test("listSessions never returns subagent sessions", async () => {
      service.registerProvider(copilotAgent);
      const parentSession = await service.createSession({ provider: "copilot" });
      const childSessionUri = buildSubagentSessionUri(parentSession.toString(), "tc-sub");
      service.stateManager.restoreSession(
        {
          resource: childSessionUri,
          provider: "subagent",
          title: "Explore",
          status: SessionStatus.Idle,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        []
      );
      assert.ok(
        service.stateManager.getOverlaySessionSummaries().some((s) => s.resource === childSessionUri),
        "subagent child session should be listed"
      );
      const listed = await service.listSessions();
      assert.deepStrictEqual(
        {
          subagentSessions: listed.filter((s) => isSubagentSession(s.session.toString())).map((s) => s.session.toString()),
          includesParent: listed.some((s) => s.session.toString() === parentSession.toString())
        },
        {
          subagentSessions: [],
          includesParent: true
        }
      );
    });
    test("listSessions overlay excludes idle provisional sessions but keeps ones with an active turn (#321269)", async () => {
      class ProvisionalMockAgent extends MockAgent {
        async createSession(config) {
          const result = await super.createSession(config);
          return { ...result, provisional: true };
        }
        async listSessions() {
          return [];
        }
      }
      const provisionalAgent = new ProvisionalMockAgent("copilot");
      disposables.add(toDisposable(() => provisionalAgent.dispose()));
      service.registerProvider(provisionalAgent);
      const session = await service.createSession({ provider: "copilot" });
      const idleListed = await service.listSessions();
      assert.ok(
        !idleListed.some((s) => s.session.toString() === session.toString()),
        "idle provisional session should not appear in listSessions"
      );
      service.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hello", origin: { kind: MessageKind.User } } },
        "test-client",
        1
      );
      const activeListed = await service.listSessions();
      assert.ok(
        activeListed.some((s) => s.session.toString() === session.toString()),
        "provisional session with an active turn should appear in listSessions"
      );
      service.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 },
        "test-client",
        2
      );
      const stateAfterTurn = service.stateManager.getSessionState(session.toString());
      assert.strictEqual(stateAfterTurn?.lifecycle, SessionLifecycle.Creating, "session should still be provisional (materialize not yet fired)");
      assert.strictEqual(stateAfterTurn?.activeTurn, void 0, "completed turn should clear the active turn");
      const completedListed = await service.listSessions();
      assert.ok(
        completedListed.some((s) => s.session.toString() === session.toString()),
        "provisional session with a completed turn should still appear in listSessions"
      );
    });
    test("listSessions overlays live workspace metadata over a stale provider snapshot", async () => {
      class DelayedListAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.listStarted = new DeferredPromise();
          this.releaseList = new DeferredPromise();
        }
        async listSessions() {
          const snapshot = await super.listSessions();
          this.listStarted.complete();
          await this.releaseList.p;
          return snapshot;
        }
      }
      const agent = new DelayedListAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.resolvedWorkingDirectory = URI.file("/original");
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      const listing = service.listSessions();
      await agent.listStarted.p;
      service.stateManager.restoreSession({
        resource: session.toString(),
        provider: "copilot",
        title: "Materialized",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date(1e3)).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date(2e3)).toISOString(),
        project: { uri: URI.file("/project").toString(), displayName: "project" },
        workingDirectories: [URI.file("/worktree").toString()]
      }, []);
      agent.releaseList.complete();
      const listed = (await listing).find((item) => item.session.toString() === session.toString());
      assert.deepStrictEqual({
        modifiedTime: listed?.modifiedTime,
        project: listed?.project && { uri: listed.project.uri.path, displayName: listed.project.displayName },
        workingDirectory: listed?.workingDirectories?.[0]?.path
      }, {
        modifiedTime: 2e3,
        project: { uri: "/project", displayName: "project" },
        workingDirectory: "/worktree"
      });
    });
    test.skip("listSessions synthesizes the session changeset catalogue from persisted diffs for unopened sessions", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      const persistedDiffs = [
        {
          after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
          diff: { added: 5, removed: 2 }
        },
        {
          after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } },
          diff: { added: 3, removed: 0 }
        }
      ];
      await db.setMetadata("diffs", JSON.stringify(persistedDiffs));
      const sessionId = "persisted-session";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({ object: db, dispose: () => {
        } }),
        tryOpenDatabase: async () => ({ object: db, dispose: () => {
        } }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const sessions = await svc.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.deepStrictEqual(sessions[0].changesets, [
        {
          label: "Branch Changes",
          uriTemplate: `${sessionUri.toString()}/changeset/session`,
          additions: 8,
          deletions: 2,
          files: 2
        },
        {
          label: "Uncommitted Changes",
          uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
          description: "Show uncommitted changes in this session"
        }
      ]);
    });
    test.skip("listSessions silently ignores malformed persisted diffs", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("diffs", "{ not valid json");
      const sessionId = "bad-diffs-session";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({ object: db, dispose: () => {
        } }),
        tryOpenDatabase: async () => ({ object: db, dispose: () => {
        } }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const sessions = await svc.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].changesets, void 0);
    });
    test.skip("listSessions advertises persisted changeset counts without seeding state; changeset subscribe restores lazily", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      const persistedDiffs = [
        {
          after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
          diff: { added: 5, removed: 2 }
        }
      ];
      await db.setMetadata("diffs", JSON.stringify(persistedDiffs));
      const sessionId = "unopened-with-diffs";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({ object: db, dispose: () => {
        } }),
        tryOpenDatabase: async () => ({ object: db, dispose: () => {
        } }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const sessions = await svc.listSessions();
      const changesetUri = buildSessionChangesetUri(sessionUri.toString());
      assert.deepStrictEqual({
        listCatalogueEntry: sessions[0].changesets?.find((c) => c.uriTemplate === changesetUri),
        listSeededSnapshot: svc.stateManager.getSnapshot(changesetUri)
      }, {
        listCatalogueEntry: {
          label: "Branch Changes",
          uriTemplate: changesetUri,
          additions: 5,
          deletions: 2,
          files: 1
        },
        listSeededSnapshot: void 0
      });
      const snapshot = await svc.subscribe(URI.parse(changesetUri), "client-changeset");
      const state = snapshot.state;
      assert.strictEqual(state.status, "ready");
      assert.deepStrictEqual(state.files.map((f) => f.id), ["file:///wd/a.ts"]);
    });
    test.skip("listSessions prefers ready live changeset state over stale persisted diffs for unopened sessions", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      const persistedDiffs = [
        { after: { uri: "file:///wd/x.ts", content: { uri: "file:///wd/x.ts" } }, diff: { added: 99, removed: 0 } },
        { after: { uri: "file:///wd/y.ts", content: { uri: "file:///wd/y.ts" } }, diff: { added: 0, removed: 0 } },
        { after: { uri: "file:///wd/z.ts", content: { uri: "file:///wd/z.ts" } }, diff: { added: 0, removed: 0 } }
      ];
      await db.setMetadata("diffs", JSON.stringify(persistedDiffs));
      const sessionId = "unopened-stale-diffs";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({ object: db, dispose: () => {
        } }),
        tryOpenDatabase: async () => ({ object: db, dispose: () => {
        } }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const changesetUri = svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
      svc.stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetFileSet,
        file: {
          id: "file:///wd/live.ts",
          edit: { after: { uri: "file:///wd/live.ts", content: { uri: "file:///wd/live.ts" } }, diff: { added: 1, removed: 0 } }
        }
      });
      svc.stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Ready
      });
      const sessions = await svc.listSessions();
      assert.deepStrictEqual(sessions[0].changesets, [
        {
          label: "Branch Changes",
          uriTemplate: changesetUri,
          additions: 1,
          deletions: 0,
          files: 1
        },
        {
          label: "Uncommitted Changes",
          uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
          description: "Show uncommitted changes in this session"
        }
      ]);
    });
    test.skip("listSessions does not request the diffs metadata key when a live source can answer", async () => {
      const requestedKeys = [];
      const db = {
        dispose: () => {
        },
        getMetadata: async () => void 0,
        getMetadataObject: async (obj) => {
          requestedKeys.push(Object.keys(obj));
          return Object.fromEntries(Object.keys(obj).map((k) => [k, void 0]));
        },
        setMetadata: async () => {
        },
        deleteMetadata: async () => {
        },
        appendEvent: async () => {
        },
        readEvents: async () => [],
        readEventCount: async () => 0
      };
      const sessionId = "unopened-live-source";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({ object: db, dispose: () => {
        } }),
        tryOpenDatabase: async () => ({ object: db, dispose: () => {
        } }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const changesetUri = svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
      svc.stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Ready
      });
      await svc.listSessions();
      assert.strictEqual(requestedKeys.length, 1);
      assert.strictEqual(requestedKeys[0].includes("diffs"), false, `expected listSessions to skip the 'diffs' key when ready live changeset state exists; requested=${requestedKeys[0].join(",")}`);
    });
    test.skip("listSessions still reads persisted diffs when only a computing (not ready) changeset state exists", async () => {
      const db = disposables.add(await SessionDatabase.open(":memory:"));
      const persistedDiffs = [
        { after: { uri: "file:///wd/p.ts", content: { uri: "file:///wd/p.ts" } }, diff: { added: 7, removed: 1 } }
      ];
      await db.setMetadata("diffs", JSON.stringify(persistedDiffs));
      const sessionId = "unopened-computing-changeset";
      const sessionUri = AgentSession.uri("copilot", sessionId);
      const sessionDataService = {
        _serviceBrand: void 0,
        getSessionDataDir: () => URI.parse("inmemory:/session-data"),
        getSessionDataDirById: () => URI.parse("inmemory:/session-data"),
        openDatabase: () => ({ object: db, dispose: () => {
        } }),
        tryOpenDatabase: async () => ({ object: db, dispose: () => {
        } }),
        deleteSessionData: async () => {
        },
        onWillDeleteSessionData: Event.None,
        cleanupOrphanedData: async () => {
        },
        whenIdle: async () => {
        }
      };
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent._sessions.set(sessionId, sessionUri);
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
      const sessions = await svc.listSessions();
      assert.deepStrictEqual(sessions[0].changesets, [
        {
          label: "Branch Changes",
          uriTemplate: `${sessionUri.toString()}/changeset/session`,
          additions: 7,
          deletions: 1,
          files: 1
        },
        {
          label: "Uncommitted Changes",
          uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
          description: "Show uncommitted changes in this session"
        }
      ]);
    });
    test.skip("listSessions overlays live state manager title over SDK title", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      service.stateManager.dispatchServerAction(session.toString(), {
        type: ActionType.SessionTitleChanged,
        title: "User first message"
      });
      const sessions = await service.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].summary, "User first message");
    });
    test("createSession attaches git state into state _meta when working directory is present", async () => {
      const workingDirectory = URI.file("/workspace/repo");
      const gitState = {
        hasGitHubRemote: true,
        branchName: "feature/x",
        baseBranchName: "main",
        upstreamBranchName: "origin/feature/x",
        incomingChanges: 1,
        outgoingChanges: 2,
        uncommittedChanges: 3
      };
      const calls = [];
      const gitService = {
        _serviceBrand: void 0,
        getCurrentBranch: async () => void 0,
        getDefaultBranch: async () => void 0,
        getBranch: async () => void 0,
        getRefs: async () => [],
        getBranches: async () => [],
        getRepositoryRoot: async () => void 0,
        getWorktreeRoots: async () => [],
        addWorktree: async () => {
        },
        copyWorktreeIncludeFiles: async () => {
        },
        addExistingWorktree: async () => {
        },
        removeWorktree: async () => {
        },
        branchExists: async () => false,
        hasUncommittedChanges: async () => false,
        commitAll: async () => {
        },
        restore: async () => {
        },
        hasUpstream: async () => false,
        pull: async () => {
        },
        push: async () => {
        },
        getSessionGitState: async (uri) => {
          calls.push(uri.fsPath);
          return gitState;
        },
        computeSessionFileDiffs: async () => void 0,
        showBlob: async () => void 0,
        captureWorkingTreeAsTree: async () => void 0,
        commitTree: async () => void 0,
        updateRef: async () => {
        },
        deleteRefs: async () => {
        },
        revParse: async () => void 0,
        resolveBranchBaselineCommit: async () => void 0,
        overlayPathIntoTree: async () => void 0,
        diffTreePaths: async () => void 0,
        computeFileDiffsBetweenRefs: async () => void 0,
        getFetchRemoteUrls: async () => void 0,
        getUntrackedPaths: async () => [],
        getBranchDiffSafetyInfo: async () => void 0,
        getDiffPatchBetweenRefs: async () => void 0
      };
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.resolvedWorkingDirectory = workingDirectory;
      agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot", workingDirectories: workingDirectory ? [workingDirectory] : void 0 });
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const sessions = await localService.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
      assert.deepStrictEqual(
        localService.stateManager.getSessionState(session.toString())?._meta,
        { git: gitState }
      );
    });
    test.skip("createSession refreshes branch and uncommitted changesets after git state attaches", async () => {
      const workingDirectory = URI.file("/workspace/repo");
      const gitState = {
        hasGitHubRemote: false,
        branchName: "feature/x",
        baseBranchName: "main",
        upstreamBranchName: void 0,
        incomingChanges: 0,
        outgoingChanges: 0,
        uncommittedChanges: 0
      };
      const computeCalls = [];
      const gitService = createNoopGitService();
      gitService.getSessionGitState = async () => gitState;
      gitService.computeSessionFileDiffs = async (_wd, opts) => {
        computeCalls.push({ sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
        return [];
      };
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, gitService));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.resolvedWorkingDirectory = workingDirectory;
      agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      for (let i = 0; i < 100 && computeCalls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      assert.deepStrictEqual(
        computeCalls.sort((a, b) => (a.baseBranch ?? "").localeCompare(b.baseBranch ?? "")),
        [
          { sessionUri: session.toString(), baseBranch: void 0 },
          { sessionUri: session.toString(), baseBranch: "main" }
        ]
      );
    });
    test("createSession infers workspace-less (and skips git overlay) when no working directory", async () => {
      const gitService = {
        _serviceBrand: void 0,
        getCurrentBranch: async () => void 0,
        getDefaultBranch: async () => void 0,
        getBranch: async () => void 0,
        getRefs: async () => [],
        getBranches: async () => [],
        getRepositoryRoot: async () => void 0,
        getWorktreeRoots: async () => [],
        addWorktree: async () => {
        },
        copyWorktreeIncludeFiles: async () => {
        },
        addExistingWorktree: async () => {
        },
        removeWorktree: async () => {
        },
        branchExists: async () => false,
        hasUncommittedChanges: async () => false,
        commitAll: async () => {
        },
        hasUpstream: async () => false,
        pull: async () => {
        },
        push: async () => {
        },
        restore: async () => {
        },
        getSessionGitState: async () => void 0,
        computeSessionFileDiffs: async () => void 0,
        showBlob: async () => void 0,
        captureWorkingTreeAsTree: async () => void 0,
        commitTree: async () => void 0,
        updateRef: async () => {
        },
        deleteRefs: async () => {
        },
        revParse: async () => void 0,
        resolveBranchBaselineCommit: async () => void 0,
        overlayPathIntoTree: async () => void 0,
        diffTreePaths: async () => void 0,
        computeFileDiffsBetweenRefs: async () => void 0,
        getFetchRemoteUrls: async () => void 0,
        getUntrackedPaths: async () => [],
        getBranchDiffSafetyInfo: async () => void 0,
        getDiffPatchBetweenRefs: async () => void 0
      };
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const sessions = await localService.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.deepStrictEqual(localService.stateManager.getSessionState(session.toString())?._meta, { workspaceless: true });
    });
    test.skip("createSession strips git-only catalogue entries for non-git working directory", async () => {
      const workingDirectory = URI.file("/workspace/not-a-repo");
      const gitService = createNoopGitService();
      gitService.getSessionGitState = async () => void 0;
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.resolvedWorkingDirectory = workingDirectory;
      agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const state = localService.stateManager.getSessionState(session.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.changesets?.length, 0);
    });
    test.skip("createSession keeps git-only catalogue entries for a git working directory", async () => {
      const workingDirectory = URI.file("/workspace/repo");
      const gitState = {
        hasGitHubRemote: false,
        branchName: "main",
        baseBranchName: "main",
        upstreamBranchName: void 0,
        incomingChanges: 0,
        outgoingChanges: 0,
        uncommittedChanges: 0
      };
      const gitService = createNoopGitService();
      gitService.getSessionGitState = async () => gitState;
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.resolvedWorkingDirectory = workingDirectory;
      agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const state = localService.stateManager.getSessionState(session.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.changesets, [
        { label: "Branch Changes", uriTemplate: `${session.toString()}/changeset/session`, description: "main", changeKind: "session" },
        { label: "Uncommitted Changes", uriTemplate: `${session.toString()}/changeset/uncommitted`, description: "Show uncommitted changes in this session", changeKind: "uncommitted" }
      ]);
    });
    test.skip("createSession sets Branch Changes description from worktree branch info", async () => {
      const workingDirectory = URI.file("/workspace/repo");
      const gitState = {
        hasGitHubRemote: false,
        branchName: "feature/x",
        baseBranchName: "main",
        upstreamBranchName: void 0,
        incomingChanges: 0,
        outgoingChanges: 0,
        uncommittedChanges: 0
      };
      const gitService = createNoopGitService();
      gitService.getSessionGitState = async () => gitState;
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
      const agent = new MockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      agent.resolvedWorkingDirectory = workingDirectory;
      agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      const state = localService.stateManager.getSessionState(session.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.changesets, [
        { label: "Branch Changes", uriTemplate: `${session.toString()}/changeset/session`, description: "feature/x \u2192 main", changeKind: "session" },
        { label: "Uncommitted Changes", uriTemplate: `${session.toString()}/changeset/uncommitted`, description: "Show uncommitted changes in this session", changeKind: "uncommitted" }
      ]);
    });
    test("subscribe lazily attaches git state when an existing session has no _meta.git", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        const workingDirectory = URI.file("/workspace/repo");
        const gitState = {
          hasGitHubRemote: false,
          branchName: "feature/lazy",
          baseBranchName: "main",
          upstreamBranchName: void 0,
          incomingChanges: 0,
          outgoingChanges: 0,
          uncommittedChanges: 0
        };
        const calls = [];
        const gitService = createNoopGitService();
        gitService.getSessionGitState = async (uri) => {
          calls.push(uri.fsPath);
          return gitState;
        };
        const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
        const agent = new MockAgent("copilot");
        disposables.add(toDisposable(() => agent.dispose()));
        agent.resolvedWorkingDirectory = workingDirectory;
        agent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
        localService.registerProvider(agent);
        const session = await localService.createSession({ provider: "copilot" });
        for (let i = 0; i < 5; i++) {
          await Promise.resolve();
        }
        localService.stateManager.setSessionMeta(session.toString(), void 0);
        calls.length = 0;
        await localService.subscribe(session, "client-1");
        await timeout(5e3);
        assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
        assert.deepStrictEqual(
          localService.stateManager.getSessionState(session.toString())?._meta,
          { git: gitState }
        );
      });
    });
    test("subscribe to a registered session changeset URI returns a changeset snapshot", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const changesetUri = buildSessionChangesetUri(session.toString());
      const snapshot = await service.subscribe(URI.parse(changesetUri), "client-cs-known");
      assert.deepStrictEqual(
        {
          resource: snapshot.resource.toString(),
          files: snapshot.state.files.length
        },
        {
          resource: changesetUri,
          files: 0
        }
      );
    });
    test("subscribe to an unknown changeset id fails without restoring the parent session", async () => {
      service.registerProvider(copilotAgent);
      const sessionUri = URI.from({ scheme: "copilot", path: "/missing-session" }).toString();
      const changesetUri = `${sessionUri}/changeset/staged`;
      await assert.rejects(
        () => service.subscribe(URI.parse(changesetUri), "client-cs-unknown"),
        /unknown changeset resource/
      );
      assert.strictEqual(
        service.stateManager.getSessionState(sessionUri),
        void 0,
        "parent session must not be materialized as a side effect of an unknown changeset subscription"
      );
    });
    test("createSession stores live session config", async () => {
      service.registerProvider(copilotAgent);
      const config = { isolation: "worktree", branch: "feature/config" };
      const session = await service.createSession({ provider: "copilot", config });
      assert.deepStrictEqual(service.stateManager.getSessionState(session.toString())?.config?.values, config);
    });
    test("seeds activeClient into the initial session state when provided", async () => {
      service.registerProvider(copilotAgent);
      const envelopes = [];
      disposables.add(service.onDidAction((env) => envelopes.push(env)));
      const activeClient = {
        clientId: "client-eager",
        tools: [{ name: "t1", description: "d", inputSchema: { type: "object" } }],
        customizations: [{ type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "A", enabled: true }]
      };
      const session = await service.createSession({ provider: "copilot", activeClient });
      assert.deepStrictEqual({
        activeClients: service.stateManager.getSessionState(session.toString())?.activeClients,
        dispatchedActiveClientSet: envelopes.some((e) => e.action.type === ActionType.SessionActiveClientSet)
      }, {
        activeClients: [activeClient],
        dispatchedActiveClientSet: false
      });
    });
    test("omits activeClient from the initial session state when not provided", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      assert.deepStrictEqual(service.stateManager.getSessionState(session.toString())?.activeClients, []);
    });
  });
  suite("authenticate", () => {
    test("routes token to provider matching the resource", async () => {
      service.registerProvider(copilotAgent);
      const result = await service.authenticate({ resource: "https://api.github.com", token: "ghp_test123" });
      assert.deepStrictEqual(result, { authenticated: true });
      assert.deepStrictEqual(copilotAgent.authenticateCalls, [{ resource: "https://api.github.com", token: "ghp_test123" }]);
    });
    test("returns not authenticated for unknown resource", async () => {
      service.registerProvider(copilotAgent);
      const result = await service.authenticate({ resource: "https://unknown.example.com", token: "tok" });
      assert.deepStrictEqual({ result, token: service.getAuthToken({ resource: "https://unknown.example.com" }), authenticateCalls: copilotAgent.authenticateCalls }, {
        result: { authenticated: false },
        token: void 0,
        authenticateCalls: []
      });
    });
    test("stores GitHub Copilot token for operation handlers", async () => {
      service.registerProvider(copilotAgent);
      const result = await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: "copilot-token" });
      assert.deepStrictEqual({ result, token: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported }), authenticateCalls: copilotAgent.authenticateCalls }, {
        result: { authenticated: true },
        token: "copilot-token",
        authenticateCalls: [{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: "copilot-token" }]
      });
    });
    test("stores tokens for the same resource by scopes", async () => {
      service.registerProvider(copilotAgent);
      await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ["read:user"], token: "read-token" });
      await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ["read:user", "user:email"], token: "profile-token" });
      assert.deepStrictEqual({
        readToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ["read:user"] }),
        profileToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ["user:email", "read:user"] }),
        supersetToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ["user:email"] })
      }, {
        readToken: "read-token",
        profileToken: "profile-token",
        supersetToken: "profile-token"
      });
    });
    test("accepts an already handled MCP token after retrying session handlers", async () => {
      const mcpAgent = new MockAgent();
      disposables.add(toDisposable(() => mcpAgent.dispose()));
      const mcpAgentContract = mcpAgent;
      let handlerCalls = 0;
      mcpAgentContract.handleAuthenticationToken = async () => ++handlerCalls === 1;
      service.registerProvider(mcpAgentContract);
      const first = await service.authenticate({ resource: "https://mcp.example.com", scopes: ["write", "read"], token: "token-1" });
      const duplicate = await service.authenticate({ resource: "https://mcp.example.com", scopes: ["read", "write"], token: "token-1" });
      const replacement = await service.authenticate({ resource: "https://mcp.example.com", scopes: ["read", "write"], token: "token-2" });
      assert.deepStrictEqual({ first, duplicate, replacement, handlerCalls }, {
        first: { authenticated: true },
        duplicate: { authenticated: true },
        replacement: { authenticated: false },
        handlerCalls: 3
      });
    });
    test("does not hide a session handler rejection with an accepted token", async () => {
      const mcpAgent = new MockAgent();
      disposables.add(toDisposable(() => mcpAgent.dispose()));
      const mcpAgentContract = mcpAgent;
      let handlerCalls = 0;
      mcpAgentContract.handleAuthenticationToken = async () => {
        handlerCalls++;
        if (handlerCalls === 1) {
          return true;
        }
        throw new Error("failed");
      };
      service.registerProvider(mcpAgentContract);
      const first = await service.authenticate({ resource: "https://mcp.example.com", token: "token-1" });
      const duplicate = await service.authenticate({ resource: "https://mcp.example.com", token: "token-1" });
      assert.deepStrictEqual({ first, duplicate, handlerCalls }, {
        first: { authenticated: true },
        duplicate: { authenticated: false },
        handlerCalls: 2
      });
    });
    test("fans out to every provider that owns the resource", async () => {
      const claudeAgent = new MockAgent("claude");
      claudeAgent.getProtectedResources = () => [{ resource: "https://api.github.com", authorization_servers: ["https://github.com/login/oauth"], required: true }];
      disposables.add(toDisposable(() => claudeAgent.dispose()));
      service.registerProvider(copilotAgent);
      service.registerProvider(claudeAgent);
      const result = await service.authenticate({ resource: "https://api.github.com", token: "tok" });
      assert.deepStrictEqual({
        result,
        copilotCalls: copilotAgent.authenticateCalls,
        claudeCalls: claudeAgent.authenticateCalls
      }, {
        result: { authenticated: true },
        copilotCalls: [{ resource: "https://api.github.com", token: "tok" }],
        claudeCalls: [{ resource: "https://api.github.com", token: "tok" }]
      });
    });
    test("isolates a provider that throws \u2014 others still authenticate", async () => {
      const flakyAgent = new MockAgent("claude");
      flakyAgent.getProtectedResources = () => [{ resource: "https://api.github.com", authorization_servers: ["https://github.com/login/oauth"], required: true }];
      flakyAgent.authenticate = async () => {
        throw new Error("proxy bind failed");
      };
      disposables.add(toDisposable(() => flakyAgent.dispose()));
      service.registerProvider(copilotAgent);
      service.registerProvider(flakyAgent);
      const result = await service.authenticate({ resource: "https://api.github.com", token: "tok" });
      assert.deepStrictEqual({
        result,
        copilotCalls: copilotAgent.authenticateCalls
      }, {
        result: { authenticated: true },
        copilotCalls: [{ resource: "https://api.github.com", token: "tok" }]
      });
    });
    test("reports not authenticated when every matching provider rejects", async () => {
      const flakyA = new MockAgent("claude");
      const flakyB = new MockAgent("mock");
      flakyA.getProtectedResources = () => [{ resource: "https://api.github.com", authorization_servers: ["https://github.com/login/oauth"], required: true }];
      flakyB.getProtectedResources = () => [{ resource: "https://api.github.com", authorization_servers: ["https://github.com/login/oauth"], required: true }];
      flakyA.authenticate = async () => {
        throw new Error("A");
      };
      flakyB.authenticate = async () => {
        throw new Error("B");
      };
      disposables.add(toDisposable(() => flakyA.dispose()));
      disposables.add(toDisposable(() => flakyB.dispose()));
      service.registerProvider(flakyA);
      service.registerProvider(flakyB);
      const result = await service.authenticate({ resource: "https://api.github.com", token: "tok" });
      assert.deepStrictEqual(result, { authenticated: false });
    });
  });
  suite("shutdown", () => {
    test("shuts down all providers", async () => {
      let copilotShutdown = false;
      copilotAgent.shutdown = async () => {
        copilotShutdown = true;
      };
      service.registerProvider(copilotAgent);
      await service.shutdown();
      assert.ok(copilotShutdown);
    });
  });
  suite("restoreSession", () => {
    async function waitForDraft(db, chat, expected) {
      for (let i = 0; i < 20; i++) {
        if (JSON.stringify(await db.getChatDraft(chat)) === JSON.stringify(expected)) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.deepStrictEqual(await db.getChatDraft(chat), expected);
    }
    test("restores the AH-owned workspaceless marker onto the summary _meta for any agent", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(copilotAgent);
      await copilotAgent.createSession();
      const sessionResource = (await copilotAgent.listSessions())[0].session;
      copilotAgent.sessionMessages = [];
      await db.setMetadata("agentHost.workspaceless", "true");
      await localService.restoreSession(sessionResource);
      assert.deepStrictEqual(localService.stateManager.getSessionState(sessionResource.toString())?._meta, { workspaceless: true });
    });
    test("restores a session with message history", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi there!", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state, "session should be in state manager");
      assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
      assert.strictEqual(state.turns.length, 1);
      assert.strictEqual(state.turns[0].message.text, "Hello");
      const mdPart = state.turns[0].responseParts.find((p) => p.kind === ResponsePartKind.Markdown);
      assert.ok(mdPart);
      assert.strictEqual(mdPart.content, "Hi there!");
      assert.strictEqual(state.turns[0].state, TurnState.Complete);
    });
    test("re-attaches persisted turn usage on restore", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessionResource = (await copilotAgent.listSessions())[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi there!", toolRequests: [] }
      ];
      await db.setTurnUsage("msg-1", JSON.stringify({ inputTokens: 100, outputTokens: 20, model: "gpt-5" }));
      await localService.restoreSession(sessionResource);
      assert.deepStrictEqual(
        localService.stateManager.getSessionState(sessionResource.toString())?.turns.map((t) => t.usage),
        [{ inputTokens: 100, outputTokens: 20, model: "gpt-5" }]
      );
    });
    test("re-attaches usage over an Auto-model stub, preserving the routing metadata", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const autoModeResolved = { chosenModel: "claude-opus-4.8", predictedLabel: "needs_reasoning", confidence: 0.93 };
      const agent = disposables.add(new MockAgent("copilot"));
      agent.turnUsageOverride = { model: "claude-opus-4.8", _meta: { autoModeResolved } };
      localService.registerProvider(agent);
      const { session } = await agent.createSession();
      const sessionResource = (await agent.listSessions())[0].session;
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi there!", toolRequests: [] }
      ];
      await db.setTurnUsage("msg-1", JSON.stringify({ inputTokens: 100, outputTokens: 20, model: "claude-opus-4.8", _meta: { copilotUsage: { totalNanoAiu: 5e9 } } }));
      await localService.restoreSession(sessionResource);
      assert.deepStrictEqual(
        localService.stateManager.getSessionState(sessionResource.toString())?.turns.map((t) => t.usage),
        [{
          inputTokens: 100,
          outputTokens: 20,
          model: "claude-opus-4.8",
          // The stub's routing metadata survives alongside the persisted usage.
          _meta: { autoModeResolved, copilotUsage: { totalNanoAiu: 5e9 } }
        }]
      );
    });
    test("interleaves persisted host-injected local turns after their anchor on restore", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessionResource = (await copilotAgent.listSessions())[0].session;
      const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-real", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-real-a", content: "Hi there!", toolRequests: [] }
      ];
      const localTurn = (id, text) => ({ id, message: { text, origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0, state: TurnState.Complete });
      await db.insertLocalTurn({ turnId: "local-head", chatUri: defaultChatUri, anchorTurnId: void 0, seq: 1, payload: JSON.stringify(localTurn("local-head", "!pwd")) });
      await db.insertLocalTurn({ turnId: "local-after", chatUri: defaultChatUri, anchorTurnId: "msg-real", seq: 2, payload: JSON.stringify(localTurn("local-after", "!ls")) });
      await db.insertLocalTurn({ turnId: "local-orphan", chatUri: defaultChatUri, anchorTurnId: "gone", seq: 3, payload: JSON.stringify(localTurn("local-orphan", "!echo")) });
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.deepStrictEqual(state.turns.map((t) => t.id), ["local-head", "msg-real", "local-after"]);
    });
    test("restores the default chat's independently-renamed title", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(copilotAgent);
      await copilotAgent.createSession();
      const sessionResource = (await copilotAgent.listSessions())[0].session;
      copilotAgent.sessionMessages = [];
      const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
      await db.setMetadata(`customChatTitle:${defaultChatUri}`, "Renamed Default Chat");
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.strictEqual(state?.chats.find((c) => c.resource === defaultChatUri)?.title, "Renamed Default Chat");
    });
    test("persists chat drafts to session metadata", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(copilotAgent);
      const session = await localService.createSession({ provider: "copilot" });
      const draft = {
        text: "draft text",
        origin: { kind: MessageKind.User },
        model: { id: "opus-4.7" },
        agent: { uri: "agent://reviewer" }
      };
      localService.dispatchAction(buildDefaultChatUri(session.toString()), {
        type: ActionType.ChatDraftChanged,
        draft
      }, "test-client", 1);
      await waitForDraft(db, URI.parse(buildDefaultChatUri(session.toString())), draft);
    });
    test("restores chat drafts from session metadata", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessionResource = (await copilotAgent.listSessions())[0].session;
      const draft = {
        text: "restored draft",
        origin: { kind: MessageKind.User },
        model: { id: "opus-4.7" },
        agent: { uri: "agent://reviewer" }
      };
      await db.setChatDraft(URI.parse(buildDefaultChatUri(sessionResource.toString())), draft);
      copilotAgent.getChatDraft = (chat) => db.getChatDraft(chat);
      copilotAgent.sessionMessages = [];
      await localService.restoreSession(sessionResource);
      assert.deepStrictEqual(localService.stateManager.getSessionState(session.toString())?.draft, draft);
    });
    test("restores a session with tool calls", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Run a command", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "I will run a command.", toolRequests: [{ toolCallId: "tc-1", name: "shell" }] },
        { type: "tool_start", session, toolCallId: "tc-1", toolName: "shell", displayName: "Shell", invocationMessage: "Running command..." },
        { type: "tool_complete", session, toolCallId: "tc-1", result: { success: true, pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "output" }] } },
        { type: "message", session, role: "assistant", messageId: "msg-3", content: "Done!", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      const turn = state.turns[0];
      const toolCallParts = turn.responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(toolCallParts.length, 1);
      const tc = toolCallParts[0].toolCall;
      assert.strictEqual(tc.status, ToolCallStatus.Completed);
      assert.strictEqual(tc.toolCallId, "tc-1");
      assert.strictEqual(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
    });
    test("interleaves reasoning, markdown, and tool calls in stream order on resume", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "u-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "a-1", content: "Reply A", reasoningText: "Thinking A", toolRequests: [{ toolCallId: "tc-1", name: "shell" }] },
        { type: "tool_start", session, toolCallId: "tc-1", toolName: "shell", displayName: "Shell", invocationMessage: "Running..." },
        { type: "tool_complete", session, toolCallId: "tc-1", result: { success: true, pastTenseMessage: "Ran", content: [{ type: ToolResultContentType.Text, text: "ok" }] } },
        { type: "message", session, role: "assistant", messageId: "a-2", content: "Reply B", reasoningText: "Thinking B", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      const turn = state.turns[0];
      const summary = turn.responseParts.map((p) => {
        if (p.kind === ResponsePartKind.Reasoning) {
          return ["reasoning", p.content];
        }
        if (p.kind === ResponsePartKind.Markdown) {
          return ["markdown", p.content];
        }
        if (p.kind === ResponsePartKind.ToolCall) {
          return ["toolCall", p.toolCall.toolCallId];
        }
        return ["other"];
      });
      assert.deepStrictEqual(summary, [
        ["reasoning", "Thinking A"],
        ["markdown", "Reply A"],
        ["toolCall", "tc-1"],
        ["reasoning", "Thinking B"],
        ["markdown", "Reply B"]
      ]);
    });
    test("flushes interrupted turns", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Interrupted", toolRequests: [] },
        { type: "message", session, role: "user", messageId: "msg-2", content: "Retried", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-3", content: "Answer", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.turns.length, 2);
      assert.strictEqual(state.turns[0].state, TurnState.Cancelled);
      assert.strictEqual(state.turns[1].state, TurnState.Complete);
    });
    test("throws when session is not found on backend", async () => {
      service.registerProvider(copilotAgent);
      await assert.rejects(
        () => service.restoreSession(AgentSession.uri("copilot", "nonexistent")),
        /Session not found on backend/
      );
    });
    test("restores known session without listing all provider sessions", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      service.stateManager.deleteSession(session.toString());
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      let listSessionsCalled = false;
      copilotAgent.listSessions = async () => {
        listSessionsCalled = true;
        throw new Error("restoreSession should not enumerate sessions");
      };
      await service.restoreSession(session);
      assert.strictEqual(listSessionsCalled, false);
      assert.ok(service.stateManager.getSessionState(session.toString()));
    });
    test("falls back to listing sessions when direct metadata restore fails", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      service.stateManager.deleteSession(session.toString());
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      copilotAgent.getSessionMetadata = async () => {
        throw new Error("direct metadata unavailable");
      };
      const originalListSessions = copilotAgent.listSessions.bind(copilotAgent);
      let listSessionsCalled = false;
      copilotAgent.listSessions = async () => {
        listSessionsCalled = true;
        return originalListSessions();
      };
      await service.restoreSession(session);
      assert.deepStrictEqual({
        listSessionsCalled,
        restored: !!service.stateManager.getSessionState(session.toString())
      }, {
        listSessionsCalled: true,
        restored: true
      });
    });
    test("coalesces concurrent restores for the same session", async () => {
      class BlockingRestoreAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.metadataReached = new DeferredPromise();
          this.metadataGate = new DeferredPromise();
          this.getSessionMetadataCalls = 0;
          this.getSessionMessagesCalls = 0;
        }
        async getSessionMetadata(session2) {
          this.getSessionMetadataCalls++;
          this.metadataReached.complete();
          await this.metadataGate.p;
          return super.getSessionMetadata(session2);
        }
        async getSessionMessages(session2) {
          this.getSessionMessagesCalls++;
          return super.getSessionMessages(session2);
        }
      }
      const agent = disposables.add(new BlockingRestoreAgent("copilot"));
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      service.stateManager.deleteSession(session.toString());
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      const firstRestore = service.restoreSession(session);
      await agent.metadataReached.p;
      const secondRestore = service.restoreSession(session);
      assert.strictEqual(agent.getSessionMetadataCalls, 1);
      agent.metadataGate.complete();
      await Promise.all([firstRestore, secondRestore]);
      assert.deepStrictEqual({
        metadataCalls: agent.getSessionMetadataCalls,
        messageCalls: agent.getSessionMessagesCalls,
        restored: !!service.stateManager.getSessionState(session.toString())
      }, {
        metadataCalls: 1,
        messageCalls: 1,
        restored: true
      });
    });
    test("hydrates session customizations when restoring an existing session", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      service.stateManager.deleteSession(session.toString());
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      let getSessionCustomizationsCalls = 0;
      copilotAgent.getSessionCustomizations = async () => {
        getSessionCustomizationsCalls++;
        return [
          { type: CustomizationType.Plugin, id: customizationId("file:///restore-skill"), uri: "file:///restore-skill", name: "Restore Skill", enabled: true }
        ];
      };
      await service.restoreSession(session);
      const customizations = service.stateManager.getSessionState(session.toString())?.customizations;
      assert.strictEqual(getSessionCustomizationsCalls, 1);
      assert.strictEqual(customizations?.length, 1);
      assert.strictEqual(customizations?.[0]?.type, CustomizationType.Plugin);
      assert.strictEqual(customizations?.[0]?.name, "Restore Skill");
      assert.strictEqual(customizations?.[0]?.id, customizationId("file:///restore-skill"));
      assert.strictEqual(customizations?.[0]?.enabled, true);
    });
    test("clears failed restore attempts so sessions can be retried", async () => {
      class FailingOnceRestoreAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.shouldFailRestore = true;
          this.getSessionMessagesCalls = 0;
        }
        async getSessionMessages(session2) {
          this.getSessionMessagesCalls++;
          if (this.shouldFailRestore) {
            throw new Error("restore failed");
          }
          return super.getSessionMessages(session2);
        }
      }
      const agent = disposables.add(new FailingOnceRestoreAgent("copilot"));
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      service.stateManager.deleteSession(session.toString());
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await assert.rejects(() => service.restoreSession(session), /restore failed/);
      agent.shouldFailRestore = false;
      await service.restoreSession(session);
      assert.deepStrictEqual({
        messageCalls: agent.getSessionMessagesCalls,
        restored: !!service.stateManager.getSessionState(session.toString())
      }, {
        messageCalls: 2,
        restored: true
      });
    });
    test("restores a session with subagent tool calls", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Review this code", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "", toolRequests: [{ toolCallId: "tc-sub", name: "task" }] },
        { type: "tool_start", session, toolCallId: "tc-sub", toolName: "task", displayName: "Task", invocationMessage: "Delegating...", toolKind: "subagent", subagentDescription: "Find related files", subagentAgentName: "explore" },
        { type: "subagent_started", session, toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores the codebase" },
        // Inner tool calls from the subagent (have parentToolCallId)
        { type: "tool_start", session, toolCallId: "tc-inner-1", toolName: "bash", displayName: "Bash", invocationMessage: "Running ls...", parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-inner-1", result: { success: true, pastTenseMessage: "Ran ls", content: [{ type: ToolResultContentType.Text, text: "file1.ts" }] }, parentToolCallId: "tc-sub" },
        { type: "tool_start", session, toolCallId: "tc-inner-2", toolName: "view", displayName: "View File", invocationMessage: "Reading file1.ts", parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-inner-2", result: { success: true, pastTenseMessage: "Read file1.ts" }, parentToolCallId: "tc-sub" },
        // Parent tool completes
        { type: "tool_complete", session, toolCallId: "tc-sub", result: { success: true, pastTenseMessage: "Delegated task", content: [{ type: ToolResultContentType.Text, text: "Found 3 issues" }] } },
        { type: "message", session, role: "assistant", messageId: "msg-3", content: "The review found 3 issues.", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.turns.length, 1, `Expected 1 turn but got ${state.turns.length}`);
      const turn = state.turns[0];
      assert.strictEqual(turn.message.text, "Review this code");
      const toolCallParts = turn.responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(toolCallParts.length, 1, `Expected 1 tool call (parent only) but got ${toolCallParts.length}`);
      const parentTc = toolCallParts[0].toolCall;
      assert.strictEqual(parentTc.toolCallId, "tc-sub");
      assert.strictEqual(parentTc.status, ToolCallStatus.Completed);
      assert.strictEqual(parentTc._meta?.toolKind, "subagent");
      assert.strictEqual(parentTc._meta?.subagentDescription, "Find related files");
      assert.strictEqual(parentTc._meta?.subagentAgentName, "explore");
      const content = parentTc.content ?? [];
      const subagentEntry = content.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
      assert.ok(subagentEntry, "Completed tool call should have subagent content entry");
      const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), "tc-sub");
      const snapshot = await service.subscribe(URI.parse(childSessionUri), "client-test");
      const childState = service.stateManager.getSessionState(childSessionUri);
      assert.ok(snapshot?.state, "Child session snapshot should exist");
      assert.ok(childState, "Child session state should exist");
      assert.strictEqual(childState.turns.length, 1, "Child session should have 1 turn");
      const childToolParts = childState.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(childToolParts.length, 2, `Child session should have 2 inner tool calls but got ${childToolParts.length}`);
      assert.ok(childToolParts.some((p) => p.toolCall.toolCallId === "tc-inner-1"), "Should have tc-inner-1");
      assert.ok(childToolParts.some((p) => p.toolCall.toolCallId === "tc-inner-2"), "Should have tc-inner-2");
      const mdParts = turn.responseParts.filter((p) => p.kind === ResponsePartKind.Markdown);
      assert.ok(mdParts.some((p) => p.content.includes("3 issues")), "Should have the final markdown response");
    });
    test("inner assistant messages from subagent do not create extra turns (fixture)", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = await loadFixtureMessages("subagent-session.jsonl", session);
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.turns.length, 1, `Expected 1 turn but got ${state.turns.length}: ${state.turns.map((t) => `"${t.message.text.substring(0, 40)}"`).join(", ")}`);
      assert.strictEqual(state.turns[0].message.text, "Run a sync subagent to do some searches, just testing subagent rendering");
      assert.strictEqual(state.turns[0].state, TurnState.Complete);
      const toolCallParts = state.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      const parentTc = toolCallParts.find((p) => p.toolCall.toolName === "task");
      assert.ok(parentTc, "Should have a task tool call");
      assert.strictEqual(parentTc.toolCall._meta?.toolKind, "subagent");
      const parentToolCallId = parentTc.toolCall.toolCallId;
      const nonParentTools = toolCallParts.filter((p) => p.toolCall.toolCallId !== parentToolCallId);
      assert.strictEqual(nonParentTools.length, 0, `Parent turn should only contain the task tool call, but found ${nonParentTools.length} extra tool calls`);
      const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), parentToolCallId);
      const snapshot = await service.subscribe(URI.parse(childSessionUri), "client-test");
      assert.ok(snapshot?.state, "Child session snapshot should exist");
      const childState = service.stateManager.getSessionState(childSessionUri);
      assert.ok(childState, "Child session state should exist");
      assert.strictEqual(childState.turns.length, 1, "Child session should have 1 turn");
      const childToolParts = childState.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);
      const mdParts = state.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.Markdown);
      assert.ok(mdParts.length > 0, "Should have markdown content");
    });
    test("eagerly registers subagent child sessions during parent restore", async () => {
      class EagerSubagentMockAgent extends MockAgent {
        async getSubagentSessions(session2) {
          if (parseSubagentSessionUri(session2)) {
            return [];
          }
          const parent = session2.toString();
          const out = [];
          const seen = /* @__PURE__ */ new Set();
          for (const rec of this.sessionMessages) {
            if (rec.type === "subagent_started" && !seen.has(rec.toolCallId)) {
              seen.add(rec.toolCallId);
              const childUri = buildSubagentSessionUri(parent, rec.toolCallId);
              const turns = await this.getSessionMessages(URI.parse(childUri));
              if (turns.length > 0) {
                out.push({ resource: URI.parse(childUri), toolCallId: rec.toolCallId, title: rec.agentDisplayName, turns });
              }
            }
          }
          return out;
        }
      }
      const agent = new EagerSubagentMockAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      const sessions = await agent.listSessions();
      const sessionResource = sessions[0].session;
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Review this code", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "", toolRequests: [{ toolCallId: "tc-sub", name: "task" }] },
        { type: "tool_start", session, toolCallId: "tc-sub", toolName: "task", displayName: "Task", invocationMessage: "Delegating...", toolKind: "subagent", subagentDescription: "Find related files", subagentAgentName: "explore" },
        { type: "subagent_started", session, toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores the codebase" },
        { type: "tool_start", session, toolCallId: "tc-inner-1", toolName: "bash", displayName: "Bash", invocationMessage: "Running ls...", parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-inner-1", result: { success: true, pastTenseMessage: "Ran ls", content: [{ type: ToolResultContentType.Text, text: "file1.ts" }] }, parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-sub", result: { success: true, pastTenseMessage: "Delegated task", content: [{ type: ToolResultContentType.Text, text: "Found 3 issues" }] } }
      ];
      await service.restoreSession(sessionResource);
      const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), "tc-sub");
      const childState = service.stateManager.getSessionState(childSessionUri);
      assert.ok(childState, "subagent child should be eagerly registered during parent restore");
      assert.strictEqual(childState.turns.length, 1, "child should have its reconstructed turn");
      const childToolParts = childState.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      assert.ok(childToolParts.some((p) => p.toolCall.toolCallId === "tc-inner-1"), "child should contain the inner tool call");
    });
    test("inner assistant messages from subagent route via envelope agentId (fixture)", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = await loadFixtureMessages("subagent-session-agentid.jsonl", session);
      await service.restoreSession(sessionResource);
      const state = service.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.turns.length, 1, `Expected 1 turn but got ${state.turns.length}: ${state.turns.map((t) => `"${t.message.text.substring(0, 40)}"`).join(", ")}`);
      assert.strictEqual(state.turns[0].message.text, "Run a sync subagent to do some searches, just testing subagent rendering");
      assert.strictEqual(state.turns[0].state, TurnState.Complete);
      const toolCallParts = state.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      const parentTc = toolCallParts.find((p) => p.toolCall.toolName === "task");
      assert.ok(parentTc, "Should have a task tool call");
      assert.strictEqual(parentTc.toolCall._meta?.toolKind, "subagent");
      const parentToolCallId = parentTc.toolCall.toolCallId;
      const nonParentTools = toolCallParts.filter((p) => p.toolCall.toolCallId !== parentToolCallId);
      assert.strictEqual(nonParentTools.length, 0, `Parent turn should only contain the task tool call, but found ${nonParentTools.length} extra tool calls`);
      const mdParts = state.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.Markdown);
      assert.ok(
        mdParts.every((p) => !p.content.startsWith("Perfect! I now have enough information")),
        "Subagent inner assistant message should not leak into the parent turn"
      );
      assert.ok(mdParts.length > 0, "Should have markdown content");
      const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), parentToolCallId);
      const snapshot = await service.subscribe(URI.parse(childSessionUri), "client-test");
      assert.ok(snapshot?.state, "Child session snapshot should exist");
      const childState = service.stateManager.getSessionState(childSessionUri);
      assert.ok(childState, "Child session state should exist");
      assert.strictEqual(childState.turns.length, 1, "Child session should have 1 turn");
      const childToolParts = childState.turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
      assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);
    });
    test("coalesces concurrent restores for the same subagent session", async () => {
      class BlockingSubagentAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.subagentReached = new DeferredPromise();
          this.subagentGate = new DeferredPromise();
          this.subagentGetSessionMessagesCalls = 0;
        }
        async getSessionMessages(session2) {
          if (parseSubagentSessionUri(session2)) {
            this.subagentGetSessionMessagesCalls++;
            this.subagentReached.complete();
            await this.subagentGate.p;
          }
          return super.getSessionMessages(session2);
        }
      }
      const agent = disposables.add(new BlockingSubagentAgent("copilot"));
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      const sessions = await agent.listSessions();
      const sessionResource = sessions[0].session;
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Review", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "", toolRequests: [{ toolCallId: "tc-sub", name: "task" }] },
        { type: "tool_start", session, toolCallId: "tc-sub", toolName: "task", displayName: "Task", invocationMessage: "Delegating...", toolKind: "subagent", subagentDescription: "Find related files", subagentAgentName: "explore" },
        { type: "subagent_started", session, toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores the codebase" },
        { type: "tool_start", session, toolCallId: "tc-inner", toolName: "bash", displayName: "Bash", invocationMessage: "Running ls...", parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-inner", result: { success: true, pastTenseMessage: "Ran ls", content: [{ type: ToolResultContentType.Text, text: "file1.ts" }] }, parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-sub", result: { success: true, pastTenseMessage: "Delegated task", content: [{ type: ToolResultContentType.Text, text: "Found files" }] } },
        { type: "message", session, role: "assistant", messageId: "msg-3", content: "Done.", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const childSessionUri = URI.parse(buildSubagentSessionUri(sessionResource.toString(), "tc-sub"));
      const firstSubscribe = service.subscribe(childSessionUri, "client-1");
      await agent.subagentReached.p;
      const secondSubscribe = service.subscribe(childSessionUri, "client-2");
      assert.strictEqual(agent.subagentGetSessionMessagesCalls, 1);
      agent.subagentGate.complete();
      await Promise.all([firstSubscribe, secondSubscribe]);
      assert.deepStrictEqual({
        messageCalls: agent.subagentGetSessionMessagesCalls,
        childTurns: service.stateManager.getSessionState(childSessionUri.toString())?.turns.length
      }, {
        messageCalls: 1,
        childTurns: 1
      });
    });
  });
  suite("createChat", () => {
    test("routes to the provider for a restored session not tracked in the provider map", async () => {
      const created = [];
      class MultiChatAgent extends MockAgent {
        async createChat(session2, chat) {
          created.push({ session: session2.toString(), chat: chat.toString() });
        }
      }
      const agent = disposables.add(new MultiChatAgent("copilot"));
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      service.stateManager.deleteSession(session.toString());
      await service.restoreSession(session);
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri);
      const state = service.stateManager.getSessionState(session.toString());
      assert.deepStrictEqual({
        created,
        inCatalog: !!state?.chats.some((c) => c.resource.toString() === chatUri.toString())
      }, {
        created: [{ session: session.toString(), chat: chatUri.toString() }],
        inCatalog: true
      });
    });
    test("routes a tracked session and registers the chat with its title in the catalog", async () => {
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat) {
        }
      }
      const agent = disposables.add(new MultiChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri, { title: "Peer Chat" });
      const state = service.stateManager.getSessionState(session.toString());
      assert.deepStrictEqual(
        state?.chats.find((c) => c.resource.toString() === chatUri.toString())?.title,
        "Peer Chat"
      );
    });
    test("creates the backing chat before registering the chat in the catalog", async () => {
      let catalogHadChatDuringCreate;
      class MultiChatAgent extends MockAgent {
        async createChat(session2, chat) {
          const state = service.stateManager.getSessionState(session2.toString());
          catalogHadChatDuringCreate = !!state?.chats.some((c) => c.resource.toString() === chat.toString());
        }
      }
      const agent = disposables.add(new MultiChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri);
      assert.strictEqual(catalogHadChatDuringCreate, false);
    });
    test("throws when the provider does not support multiple chats", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await assert.rejects(
        () => service.createChat(session, chatUri),
        /does not support multiple chats/
      );
    });
    test("disposeChat removes the chat from the catalog and tears down the chat", async () => {
      const disposed = [];
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat) {
        }
        async disposeChat(_session, chat) {
          disposed.push(chat.toString());
        }
      }
      const agent = disposables.add(new MultiChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri);
      await service.disposeChat(session, chatUri);
      const state = service.stateManager.getSessionState(session.toString());
      assert.deepStrictEqual({
        disposed,
        inCatalog: !!state?.chats.some((c) => c.resource.toString() === chatUri.toString())
      }, {
        disposed: [chatUri.toString()],
        inCatalog: false
      });
    });
    test("restoreSession preserves peer chat catalog order regardless of load timing", async () => {
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat) {
        }
        async getSessionMessages(session2) {
          const delays = { "peer-a": 30, "peer-b": 15, "peer-c": 0 };
          await timeout(delays[parseChatUri(session2)?.chatId ?? ""] ?? 0);
          return [];
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new MultiChatAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      await localService.createChat(session, URI.parse(buildChatUri(session, "peer-a")));
      await localService.createChat(session, URI.parse(buildChatUri(session, "peer-b")));
      await localService.createChat(session, URI.parse(buildChatUri(session, "peer-c")));
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const state = localService.stateManager.getSessionState(session.toString());
      const peerChatIds = (state?.chats ?? []).map((c) => parseChatUri(c.resource)?.chatId).filter((id) => !!id && id.startsWith("peer-"));
      assert.deepStrictEqual(peerChatIds, ["peer-a", "peer-b", "peer-c"]);
    });
    test("fork seeds the new chat with remapped source turns and forwards fork to the provider", async () => {
      let receivedFork;
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat, options) {
          receivedFork = options?.fork;
        }
      }
      const agent = disposables.add(new MultiChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const sourceTurns = [
        { id: "t1", state: TurnState.Complete, message: { text: "first", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 },
        { id: "t2", state: TurnState.Complete, message: { text: "second", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 }
      ];
      service.stateManager.seedDefaultChatTurns(session.toString(), sourceTurns);
      service.stateManager.updateChatTitle(session.toString(), buildDefaultChatUri(session.toString()), "My Session");
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri, { fork: { source: session, turnId: "t1" } });
      const newChatState = service.stateManager.getChatState(chatUri.toString());
      const newTurnIds = newChatState?.turns.map((t) => t.id) ?? [];
      assert.deepStrictEqual({
        forkSource: receivedFork?.source.toString(),
        forkTurnId: receivedFork?.turnId,
        mappingSize: receivedFork?.turnIdMapping?.size,
        mappedFromT1: receivedFork?.turnIdMapping?.get("t1"),
        newTurnCount: newTurnIds.length,
        newTurnIsRemapped: newTurnIds[0] !== void 0 && newTurnIds[0] !== "t1",
        title: newChatState?.title
      }, {
        forkSource: session.toString(),
        forkTurnId: "t1",
        mappingSize: 1,
        mappedFromT1: newTurnIds[0],
        newTurnCount: 1,
        newTurnIsRemapped: true,
        title: "Forked: My Session"
      });
    });
    test("fork with an unknown turn id drops the fork and seeds no turns", async () => {
      let receivedFork;
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat, options) {
          receivedFork = options?.fork;
        }
      }
      const agent = disposables.add(new MultiChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const sourceTurns = [
        { id: "t1", state: TurnState.Complete, message: { text: "first", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 }
      ];
      service.stateManager.seedDefaultChatTurns(session.toString(), sourceTurns);
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri, { fork: { source: session, turnId: "missing" } });
      const newChatState = service.stateManager.getChatState(chatUri.toString());
      assert.deepStrictEqual({
        forkForwarded: receivedFork !== void 0,
        newTurnCount: newChatState?.turns.length ?? 0
      }, {
        forkForwarded: false,
        newTurnCount: 0
      });
    });
    test("fork at a host-injected local turn redirects the SDK boundary to the concrete anchor and carries the local turn into the new chat", async () => {
      let receivedFork;
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat, options) {
          receivedFork = options?.fork;
        }
      }
      const db = new TestSessionDatabase();
      const agent = disposables.add(new MultiChatAgent("copilot"));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(agent);
      const { session } = await agent.createSession();
      const sessionResource = (await agent.listSessions())[0].session;
      const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "real-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "real-1-a", content: "Hi", toolRequests: [] }
      ];
      const localTurn = { id: "local-1", state: TurnState.Complete, message: { text: "!echo hi", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 };
      await db.insertLocalTurn({ turnId: "local-1", chatUri: defaultChatUri, anchorTurnId: "real-1", seq: 1, payload: JSON.stringify(localTurn) });
      await localService.restoreSession(sessionResource);
      assert.deepStrictEqual(localService.stateManager.getSessionState(sessionResource.toString())?.turns.map((t) => t.id), ["real-1", "local-1"]);
      const peerUri = URI.parse(buildChatUri(sessionResource, "peer-1"));
      await localService.createChat(sessionResource, peerUri, { fork: { source: URI.parse(defaultChatUri), turnId: "local-1" } });
      const peerTurns = localService.stateManager.getChatState(peerUri.toString())?.turns ?? [];
      const forkedLocals = (await db.getLocalTurns()).filter((r) => r.chatUri === peerUri.toString());
      assert.deepStrictEqual({
        // SDK fork boundary redirected from the local turn to its concrete anchor.
        sdkForkTurnId: receivedFork?.turnId,
        // New chat seeded with remapped copies of both turns.
        peerTurnCount: peerTurns.length,
        // The forked local turn is persisted under the new chat, anchored to
        // the forked copy of the real turn.
        forkedLocalCount: forkedLocals.length,
        forkedLocalAnchor: forkedLocals[0]?.anchorTurnId,
        anchorIsPeerFirstTurn: forkedLocals[0]?.anchorTurnId === peerTurns[0]?.id
      }, {
        sdkForkTurnId: "real-1",
        peerTurnCount: 2,
        forkedLocalCount: 1,
        forkedLocalAnchor: peerTurns[0]?.id,
        anchorIsPeerFirstTurn: true
      });
    });
    test("a peer chat backing session is filtered out of listSessions and stays filtered across a restart", async () => {
      const dbs = /* @__PURE__ */ new Map();
      const dbFor = (session2) => {
        const key = session2.toString();
        let db = dbs.get(key);
        if (!db) {
          db = new TestSessionDatabase();
          dbs.set(key, db);
        }
        return db;
      };
      const perSessionDataService = {
        ...createSessionDataService(),
        openDatabase: (session2) => ({ object: dbFor(session2), dispose: () => {
        } }),
        tryOpenDatabase: async (session2) => ({ object: dbFor(session2), dispose: () => {
        } })
      };
      const backingSdkId = "backing-sdk-id";
      const backingUri = AgentSession.uri("copilot", backingSdkId).toString();
      class LeakyMultiChatAgent extends MockAgent {
        async createChat(_session, _chat) {
          return { providerData: "blob", backingSession: AgentSession.uri(this.id, backingSdkId) };
        }
        async listSessions() {
          const base = await super.listSessions();
          return [...base, { session: AgentSession.uri(this.id, backingSdkId), startTime: Date.now(), modifiedTime: Date.now() }];
        }
      }
      const agent = disposables.add(new LeakyMultiChatAgent("copilot"));
      const svc = disposables.add(new AgentService(new NullLogService(), fileService, perSessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      svc.registerProvider(agent);
      const session = await svc.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await svc.createChat(session, chatUri);
      const beforeRestart = await svc.listSessions();
      const restartAgent = disposables.add(new LeakyMultiChatAgent("copilot"));
      const restarted = disposables.add(new AgentService(new NullLogService(), fileService, perSessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      restarted.registerProvider(restartAgent);
      const afterRestart = await restarted.listSessions();
      assert.deepStrictEqual({
        leakedBeforeRestart: beforeRestart.map((s) => s.session.toString()).includes(backingUri),
        markerPersisted: await dbFor(AgentSession.uri("copilot", backingSdkId)).getMetadata("peerChatBacking"),
        leakedAfterRestart: afterRestart.map((s) => s.session.toString()).includes(backingUri)
      }, {
        leakedBeforeRestart: false,
        markerPersisted: chatUri.toString(),
        leakedAfterRestart: false
      });
    });
  });
  suite("createChat side chats", () => {
    class SideChatAgent extends MockAgent {
      constructor() {
        super(...arguments);
        this.chatMessages = /* @__PURE__ */ new Map();
      }
      async createChat(_session, _chat, options) {
        this.lastCreateOptions = options;
      }
      async getSessionMessages(chat) {
        return this.chatMessages.get(chat.toString()) ?? super.getSessionMessages(chat);
      }
    }
    function completedTurn(id, userText = "user text", assistantText = "assistant text") {
      return {
        id,
        state: TurnState.Complete,
        message: { text: userText, origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: `${id}-md`, content: assistantText }],
        usage: void 0
      };
    }
    test("rejects a side chat whose source turn does not exist", async () => {
      const agent = disposables.add(new SideChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "side-1"));
      await assert.rejects(
        () => service.createChat(session, chatUri, { sideChat: { source: session, turnId: "missing" } }),
        /side chat source turn/
      );
    });
    test("rejects an empty side-chat selection snapshot", async () => {
      const agent = disposables.add(new SideChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      service.stateManager.seedDefaultChatTurns(session.toString(), [completedTurn("t1")]);
      const chatUri = URI.parse(buildChatUri(session, "side-1"));
      await assert.rejects(
        () => service.createChat(session, chatUri, { sideChat: { source: session, turnId: "t1", selection: { text: " \n " } } }),
        /selection text must be non-empty/
      );
    });
    test("rejects a side chat whose source chat is in a different session", async () => {
      const agent = disposables.add(new SideChatAgent("copilot"));
      service.registerProvider(agent);
      const sessionA = await service.createSession({ provider: "copilot" });
      const sessionB = await service.createSession({ provider: "copilot" });
      service.stateManager.seedDefaultChatTurns(sessionB.toString(), [completedTurn("t1")]);
      const chatUri = URI.parse(buildChatUri(sessionA, "side-1"));
      await assert.rejects(
        () => service.createChat(sessionA, chatUri, { sideChat: { source: sessionB, turnId: "t1" } }),
        /does not belong to session/
      );
    });
    test("creates a fresh peer with a SideChat origin and no copied source turns", async () => {
      const agent = disposables.add(new SideChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      service.stateManager.seedDefaultChatTurns(session.toString(), [completedTurn("t1"), completedTurn("t2")]);
      const chatUri = URI.parse(buildChatUri(session, "side-1"));
      const defaultChatUri = buildDefaultChatUri(session);
      const selection = { text: "  selected text  ", responsePartId: "response-part-1" };
      await service.createChat(session, chatUri, { sideChat: { source: session, turnId: "t1", selection } });
      const state = service.stateManager.getChatState(chatUri.toString());
      assert.deepStrictEqual({
        origin: state?.origin,
        copiedTurns: state?.turns.length,
        forkForwarded: agent.lastCreateOptions?.fork,
        sideChatForwarded: agent.lastCreateOptions?.sideChat
      }, {
        origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: "t1", selection },
        copiedTurns: 0,
        forkForwarded: void 0,
        sideChatForwarded: { source: URI.parse(defaultChatUri), turnId: "t1", selection }
      });
    });
    test("creates a side chat from a completed local turn without losing its stable source turn identity", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new SideChatAgent("copilot"));
      localService.registerProvider(agent);
      const { session } = await agent.createSession();
      const sessionResource = (await agent.listSessions())[0].session;
      const defaultChatUri = buildDefaultChatUri(sessionResource.toString());
      agent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "real-1", content: "first question", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "real-1-a", content: "first answer", toolRequests: [] }
      ];
      const localTurn = {
        id: "local-1",
        state: TurnState.Complete,
        message: { text: "!command", origin: { kind: MessageKind.User } },
        responseParts: [],
        usage: void 0
      };
      await db.insertLocalTurn({ turnId: "local-1", chatUri: defaultChatUri, anchorTurnId: "real-1", seq: 1, payload: JSON.stringify(localTurn) });
      await localService.restoreSession(sessionResource);
      const chatUri = URI.parse(buildChatUri(sessionResource, "side-local"));
      await localService.createChat(sessionResource, chatUri, { sideChat: { source: URI.parse(defaultChatUri), turnId: "local-1" } });
      assert.deepStrictEqual({
        origin: localService.stateManager.getChatState(chatUri.toString())?.origin,
        sideChatForwarded: agent.lastCreateOptions?.sideChat && {
          source: agent.lastCreateOptions.sideChat.source.toString(),
          turnId: agent.lastCreateOptions.sideChat.turnId,
          providerAnchorTurnId: agent.lastCreateOptions.sideChat.providerAnchorTurnId,
          sourceContext: agent.lastCreateOptions.sideChat.sourceContext
        }
      }, {
        origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: "local-1" },
        sideChatForwarded: {
          source: defaultChatUri,
          turnId: "local-1",
          providerAnchorTurnId: "real-1",
          sourceContext: "User request:\nfirst question\n\nAgent response:\nfirst answer\n\n---\n\nUser request:\n!command"
        }
      });
    });
    test("creates a side chat from the current active turn", async () => {
      const agent = disposables.add(new SideChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const sourceChat = buildDefaultChatUri(session);
      service.dispatchAction(sourceChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "active-turn",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "still running", origin: { kind: MessageKind.User } }
      }, "test-client", 1);
      service.stateManager.dispatchServerAction(sourceChat, {
        type: ActionType.ChatResponsePart,
        turnId: "active-turn",
        part: { kind: ResponsePartKind.Markdown, id: "partial", content: "partial answer" }
      });
      const chatUri = URI.parse(buildChatUri(session, "side-active"));
      await service.createChat(session, chatUri, { sideChat: { source: URI.parse(sourceChat), turnId: "active-turn" } });
      assert.deepStrictEqual({
        sourceActiveTurn: service.stateManager.getChatState(sourceChat)?.activeTurn?.id,
        origin: service.stateManager.getChatState(chatUri.toString())?.origin,
        sideChatForwarded: agent.lastCreateOptions?.sideChat ? {
          source: agent.lastCreateOptions.sideChat.source.toString(),
          turnId: agent.lastCreateOptions.sideChat.turnId,
          sourceContext: agent.lastCreateOptions.sideChat.sourceContext,
          partialResponse: agent.lastCreateOptions.sideChat.partialResponse
        } : void 0
      }, {
        sourceActiveTurn: "active-turn",
        origin: { kind: ChatOriginKind.SideChat, chat: sourceChat, turnId: "active-turn" },
        sideChatForwarded: { source: sourceChat, turnId: "active-turn", sourceContext: "User request:\nstill running", partialResponse: "partial answer" }
      });
    });
    test("creates a side chat from a later active turn without losing the current user question", async () => {
      const agent = disposables.add(new SideChatAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const sourceChat = buildDefaultChatUri(session);
      service.stateManager.seedDefaultChatTurns(session.toString(), [completedTurn("t1", "first question", "first answer")]);
      service.dispatchAction(sourceChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "active-turn",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "second question", origin: { kind: MessageKind.User } }
      }, "test-client", 1);
      service.stateManager.dispatchServerAction(sourceChat, {
        type: ActionType.ChatResponsePart,
        turnId: "active-turn",
        part: { kind: ResponsePartKind.Markdown, id: "partial", content: "partial answer" }
      });
      const chatUri = URI.parse(buildChatUri(session, "side-active-later"));
      await service.createChat(session, chatUri, { sideChat: { source: URI.parse(sourceChat), turnId: "active-turn" } });
      assert.deepStrictEqual(agent.lastCreateOptions?.sideChat && {
        source: agent.lastCreateOptions.sideChat.source.toString(),
        turnId: agent.lastCreateOptions.sideChat.turnId,
        sourceContext: agent.lastCreateOptions.sideChat.sourceContext,
        partialResponse: agent.lastCreateOptions.sideChat.partialResponse
      }, {
        source: sourceChat,
        turnId: "active-turn",
        sourceContext: "User request:\nfirst question\n\nAgent response:\nfirst answer\n\n---\n\nUser request:\nsecond question",
        partialResponse: "partial answer"
      });
    });
    test("persists and restores the SideChat origin", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new SideChatAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      localService.stateManager.seedDefaultChatTurns(session.toString(), [completedTurn("t1")]);
      const chatUri = URI.parse(buildChatUri(session, "side-1"));
      const defaultChatUri = buildDefaultChatUri(session);
      const selection = { text: "  selected text  ", responsePartId: "response-part-1" };
      await localService.createChat(session, chatUri, { sideChat: { source: session, turnId: "t1", selection } });
      let persistedOrigin;
      for (let i = 0; i < 50; i++) {
        const raw = await db.getMetadata("peerChats");
        if (raw !== void 0) {
          const parsed = JSON.parse(raw);
          persistedOrigin = parsed.find((entry) => entry.uri === chatUri.toString())?.origin;
          if (persistedOrigin) {
            break;
          }
        }
        await timeout(1);
      }
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      assert.deepStrictEqual({
        persistedOrigin,
        restoredOrigin: localService.stateManager.getChatState(chatUri.toString())?.origin
      }, {
        persistedOrigin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: "t1", selection },
        restoredOrigin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: "t1", selection }
      });
    });
    test("hydrates a missing peer chat when resolving a generic Chat attachment", async () => {
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new SideChatAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      const peerChat = URI.parse(buildChatUri(session, "peer-1"));
      await localService.createChat(session, peerChat);
      for (let i = 0; i < 50 && await db.getMetadata("peerChats") === void 0; i++) {
        await timeout(1);
      }
      agent.chatMessages.set(peerChat.toString(), [completedTurn("peer-turn", "Remember X", "Remembered")]);
      localService.stateManager.removeChat(session.toString(), peerChat.toString());
      const sent = Event.toPromise(agent.onDidSendMessage);
      localService.dispatchAction(buildDefaultChatUri(session), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: peerChat.toString(),
            endTurn: "peer-turn",
            label: "Earlier chat"
          }]
        }
      }, "client-1", 1);
      await sent;
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        peerHydrated: !!localService.stateManager.getChatState(peerChat.toString()),
        type: attachment?.type,
        hasTranscript: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("User: Remember X")
      }, {
        peerHydrated: true,
        type: MessageAttachmentKind.Simple,
        hasTranscript: true
      });
    });
  });
  suite("chat surface routing", () => {
    class ChatSurfaceAgent extends MockAgent {
      constructor() {
        super(...arguments);
        this.sessionCreateCalls = [];
        this.sessionDisposeCalls = [];
        this.legacyCreateChatCalls = [];
        this.chatCalls = [];
        this.chats = {
          createChat: async (chat, options) => {
            const session = parseChatUri(chat).session;
            this.chatCalls.push({ op: "createChat", args: [session, chat.toString(), options?.title ?? ""] });
            return { providerData: "pd" };
          },
          fork: async (chat, source) => {
            const session = parseChatUri(chat).session;
            this.chatCalls.push({ op: "fork", args: [session, chat.toString(), source.source.toString(), source.turnId] });
            return { providerData: "pd-fork" };
          },
          disposeChat: async (chat) => {
            this.chatCalls.push({ op: "disposeChat", args: [chat.toString()] });
          },
          sendMessage: async () => {
          },
          abort: async () => {
          },
          changeModel: async () => {
          },
          changeAgent: async () => {
          },
          getMessages: async (chat) => {
            this.chatCalls.push({ op: "getMessages", args: [chat.toString()] });
            return [];
          }
        };
      }
      async createSession(config) {
        const result = await super.createSession(config);
        this.sessionCreateCalls.push(result.session);
        return result;
      }
      async disposeSession(session) {
        this.sessionDisposeCalls.push(session);
        await super.disposeSession(session);
      }
      // The legacy peer-chat method is present too; it must NOT be used
      // when the chats surface exists.
      async createChat(_session, chat) {
        this.legacyCreateChatCalls.push(chat);
      }
    }
    test("createSession/createChat/disposeChat/disposeSession prefer the chat surface over legacy methods", async () => {
      const agent = disposables.add(new ChatSurfaceAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri, { title: "Peer" });
      await service.disposeChat(session, chatUri);
      await service.disposeSession(session);
      assert.deepStrictEqual({
        sessionCreate: agent.sessionCreateCalls.map((s) => s.toString()),
        sessionDispose: agent.sessionDisposeCalls.map((s) => s.toString()),
        legacyCreateChat: agent.legacyCreateChatCalls.length,
        chatOps: agent.chatCalls.map((c) => c.op),
        createChatArgs: agent.chatCalls.find((c) => c.op === "createChat")?.args,
        disposeChatArg: agent.chatCalls.find((c) => c.op === "disposeChat")?.args[0]
      }, {
        sessionCreate: [session.toString()],
        sessionDispose: [session.toString()],
        legacyCreateChat: 0,
        chatOps: ["createChat", "disposeChat"],
        createChatArgs: [session.toString(), chatUri.toString(), "Peer"],
        disposeChatArg: chatUri.toString()
      });
    });
    test("fork routes to chats.fork with the resolved source chat", async () => {
      const agent = disposables.add(new ChatSurfaceAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const sourceTurns = [
        { id: "t1", state: TurnState.Complete, message: { text: "first", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 }
      ];
      service.stateManager.seedDefaultChatTurns(session.toString(), sourceTurns);
      const chatUri = URI.parse(buildChatUri(session, "peer-1"));
      await service.createChat(session, chatUri, { fork: { source: session, turnId: "t1" } });
      const forkCall = agent.chatCalls.find((c) => c.op === "fork");
      assert.deepStrictEqual(forkCall?.args, [session.toString(), chatUri.toString(), session.toString(), "t1"]);
    });
    test("restore reads the default chat via chats.getMessages on the default chat URI", async () => {
      const agent = disposables.add(new ChatSurfaceAgent("copilot"));
      service.registerProvider(agent);
      const { session } = await agent.createSession();
      service.stateManager.deleteSession(session.toString());
      await service.restoreSession(session);
      const getMessages = agent.chatCalls.filter((c) => c.op === "getMessages").map((c) => c.args[0]);
      assert.deepStrictEqual(getMessages, [buildDefaultChatUri(session)]);
    });
  });
  suite("spawn channel routing", () => {
    class SpawnChannelAgent extends MockAgent {
      constructor() {
        super(...arguments);
        this._onDidSpawnChat = new Emitter();
        this.onDidSpawnChat = this._onDidSpawnChat.event;
      }
      fireSpawn(e) {
        this._onDidSpawnChat.fire(e);
      }
      dispose() {
        this._onDidSpawnChat.dispose();
        super.dispose();
      }
    }
    test("onDidSpawnChat adds the chat to the catalog with a Tool origin from its parent", async () => {
      const agent = disposables.add(new SpawnChannelAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = URI.parse(buildDefaultChatUri(session.toString()));
      const spawned = URI.parse(buildChatUri(session, "spawned-1"));
      agent.fireSpawn({
        session,
        chat: spawned,
        parent: { chat: parentChat, toolCallId: "tc-task-1" },
        title: "Explore"
      });
      const chatState = service.stateManager.getChatState(spawned.toString());
      const sessionChats = (service.stateManager.getSessionState(session.toString())?.chats ?? []).map((c) => c.resource);
      assert.deepStrictEqual({
        title: chatState?.title,
        origin: chatState?.origin,
        inCatalog: sessionChats.includes(spawned.toString())
      }, {
        title: "Explore",
        origin: { kind: ChatOriginKind.Tool, chat: parentChat.toString(), toolCallId: "tc-task-1" },
        inCatalog: true
      });
    });
    test("onDidSpawnChat without a parent adds the chat with no tool origin", async () => {
      const agent = disposables.add(new SpawnChannelAgent("copilot"));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const spawned = URI.parse(buildChatUri(session, "spawned-2"));
      agent.fireSpawn({ session, chat: spawned });
      const chatState = service.stateManager.getChatState(spawned.toString());
      assert.deepStrictEqual({
        origin: chatState?.origin,
        inCatalog: chatState !== void 0
      }, {
        origin: void 0,
        inCatalog: true
      });
    });
  });
  suite("subagent membership sequencing", () => {
    function startParentTurn(session, turnId) {
      service.dispatchAction(
        buildDefaultChatUri(session.toString()),
        { type: ActionType.ChatTurnStarted, turnId, startedAt: "2025-01-01T00:00:00.000Z", message: { text: "go", origin: { kind: MessageKind.User } } },
        "client-test",
        1
      );
    }
    test("a subagent_started signal yields exactly one catalog entry with the parent origin, title, and a started turn", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(parentChat),
        toolCallId: "tc-sub",
        agentName: "explore",
        agentDisplayName: "Explore",
        agentDescription: "Explores",
        taskDescription: "Review package.json structure"
      });
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      const chatState = service.stateManager.getChatState(subagentUri);
      const matching = (service.stateManager.getSessionState(session.toString())?.chats ?? []).filter((c) => c.resource === subagentUri);
      assert.deepStrictEqual({
        catalogEntries: matching.length,
        title: chatState?.title,
        origin: chatState?.origin,
        interactivity: chatState?.interactivity,
        hasStartedTurn: service.stateManager.getActiveTurnId(subagentUri) !== void 0
      }, {
        catalogEntries: 1,
        // The concise per-task description names the tab (distinct even for
        // two subagents of the same type), not the agent-type display name.
        title: "Review package.json structure",
        origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: "tc-sub" },
        interactivity: "read-only",
        hasStartedTurn: true
      });
    });
    test("the spawned catalog chat is resolvable from the inline pill resource via parseChatUri (the Open-Subagent contract)", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(parentChat),
        toolCallId: "tc-sub",
        agentName: "explore",
        agentDisplayName: "Explore",
        agentDescription: "Explores"
      });
      const pillResource = buildSubagentChatUri(session.toString(), "tc-sub");
      const pillChatId = parseChatUri(pillResource)?.chatId;
      const catalog = service.stateManager.getSessionState(session.toString())?.chats ?? [];
      const resolvedByPill = catalog.filter((c) => parseChatUri(c.resource)?.chatId === pillChatId);
      assert.deepStrictEqual({
        pillChatId,
        resolvedCatalogEntries: resolvedByPill.length
      }, {
        pillChatId: "subagent/tc-sub",
        resolvedCatalogEntries: 1
      });
    });
    test("a subagent_started signal without a taskDescription falls back to the agent display name for the tab title", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(parentChat),
        toolCallId: "tc-sub",
        agentName: "explore",
        agentDisplayName: "Explore",
        agentDescription: "Explores"
      });
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      assert.strictEqual(service.stateManager.getChatState(subagentUri)?.title, "Explore");
    });
    test("membership stays a single entry when the agent also mirrors the subagent onto onDidSpawnChat, regardless of order", async () => {
      class BridgingSubagentAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this._onDidSpawnChat = new Emitter();
          this.onDidSpawnChat = this._onDidSpawnChat.event;
          this._bridge = this.onDidSessionProgress((signal) => {
            const e = SubagentChatSignal.toSpawnEvent(signal);
            if (e) {
              this._onDidSpawnChat.fire(e);
            }
          });
        }
        dispose() {
          this._bridge.dispose();
          this._onDidSpawnChat.dispose();
          super.dispose();
        }
      }
      const agent = new BridgingSubagentAgent("copilot");
      disposables.add(toDisposable(() => agent.dispose()));
      service.registerProvider(agent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(parentChat),
        toolCallId: "tc-sub",
        agentName: "explore",
        agentDisplayName: "Explore",
        agentDescription: "Explores"
      });
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      const matching = (service.stateManager.getSessionState(session.toString())?.chats ?? []).filter((c) => c.resource === subagentUri);
      assert.deepStrictEqual({
        catalogEntries: matching.length,
        origin: service.stateManager.getChatState(subagentUri)?.origin,
        hasStartedTurn: service.stateManager.getActiveTurnId(subagentUri) !== void 0
      }, {
        catalogEntries: 1,
        origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: "tc-sub" },
        hasStartedTurn: true
      });
    });
    test("an inner tool call arriving before subagent_started is buffered and drained onto the subagent chat", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({ kind: "action", resource: URI.parse(parentChat), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-sub", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      copilotAgent.fireProgress({ kind: "action", resource: URI.parse(parentChat), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-sub", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      copilotAgent.fireProgress({ kind: "action", resource: URI.parse(parentChat), parentToolCallId: "tc-sub", action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "inner-1", toolName: "read", displayName: "Read", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      copilotAgent.fireProgress({ kind: "action", resource: URI.parse(parentChat), parentToolCallId: "tc-sub", action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "inner-1", invocationMessage: "Reading...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      copilotAgent.fireProgress({ kind: "subagent_started", chat: URI.parse(parentChat), toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" });
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      const subState = service.stateManager.getSessionState(subagentUri);
      const innerOnSubagent = subState?.activeTurn?.responseParts.some((rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-1");
      const innerOnParent = service.stateManager.getSessionState(session.toString())?.activeTurn?.responseParts.some((rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-1");
      assert.deepStrictEqual({ innerOnSubagent, innerOnParent }, { innerOnSubagent: true, innerOnParent: false });
    });
    test("a subagent chat survives subagent_completed (stays live and subscribable, its turn completed)", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({ kind: "subagent_started", chat: URI.parse(parentChat), toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" });
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      assert.ok(service.stateManager.getChatState(subagentUri), "precondition: subagent chat present after start");
      copilotAgent.fireProgress({ kind: "subagent_completed", chat: URI.parse(parentChat), toolCallId: "tc-sub" });
      const stillInCatalog = (service.stateManager.getSessionState(session.toString())?.chats ?? []).some((c) => c.resource === subagentUri);
      assert.deepStrictEqual({
        hasChatState: service.stateManager.getChatState(subagentUri) !== void 0,
        stillInCatalog,
        hasActiveTurn: service.stateManager.getActiveTurnId(subagentUri) !== void 0
      }, {
        hasChatState: true,
        stillInCatalog: true,
        hasActiveTurn: false
      });
    });
    test("a subagent tool call awaiting user confirmation does not time out before the user responds", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const session = await service.createSession({ provider: "copilot" });
        const parentChat = buildDefaultChatUri(session.toString());
        startParentTurn(session, "turn-1");
        copilotAgent.fireProgress({
          kind: "action",
          resource: URI.parse(parentChat),
          action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-sub", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } }
        });
        copilotAgent.fireProgress({
          kind: "action",
          resource: URI.parse(parentChat),
          action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-sub", invocationMessage: "Delegating...", toolInput: void 0 }
        });
        await new Promise((resolve) => setTimeout(resolve, 6e4));
        service.dispatchAction(parentChat, { type: ActionType.ChatToolCallConfirmed, turnId: "turn-1", toolCallId: "tc-sub", approved: true, confirmed: ToolCallConfirmationReason.UserAction }, "client-1", 1);
        const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
        const subscribePromise = service.subscribe(URI.parse(subagentUri), "client-race");
        let settled = false;
        void subscribePromise.then(() => {
          settled = true;
        });
        await timeout(0);
        assert.strictEqual(settled, false, "subscribe should still be pending right after approval");
        copilotAgent.fireProgress({ kind: "subagent_started", chat: URI.parse(parentChat), toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" });
        const snapshot = await subscribePromise;
        assert.strictEqual(snapshot.resource, subagentUri);
      });
    });
    test("denying a subagent tool call before confirmation does not leave a dangling wait", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({
        kind: "action",
        resource: URI.parse(parentChat),
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-sub", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } }
      });
      copilotAgent.fireProgress({
        kind: "action",
        resource: URI.parse(parentChat),
        action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-sub", invocationMessage: "Delegating...", toolInput: void 0 }
      });
      service.dispatchAction(parentChat, { type: ActionType.ChatToolCallConfirmed, turnId: "turn-1", toolCallId: "tc-sub", approved: false, reason: ToolCallCancellationReason.Denied }, "client-1", 1);
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      await assert.rejects(service.subscribe(URI.parse(subagentUri), "client-race"), /Cannot subscribe to unknown resource/);
    });
    test("subscribe to a subagent chat announced via _meta.subagentChatUri waits for the resource instead of failing immediately", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const parentChat = buildDefaultChatUri(session.toString());
      startParentTurn(session, "turn-1");
      copilotAgent.fireProgress({
        kind: "action",
        resource: URI.parse(parentChat),
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-sub", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } }
      });
      copilotAgent.fireProgress({
        kind: "action",
        resource: URI.parse(parentChat),
        action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-sub", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded }
      });
      const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
      assert.strictEqual(service.stateManager.getSnapshot(subagentUri), void 0, "precondition: resource not registered yet");
      const subscribePromise = service.subscribe(URI.parse(subagentUri), "client-race");
      let settled = false;
      void subscribePromise.then(() => {
        settled = true;
      });
      await timeout(0);
      assert.strictEqual(settled, false, "subscribe should still be pending while the resource is unregistered");
      copilotAgent.fireProgress({ kind: "subagent_started", chat: URI.parse(parentChat), toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" });
      const snapshot = await subscribePromise;
      assert.strictEqual(snapshot.resource, subagentUri);
    });
    test("subscribe to an announced subagent chat that never spawns eventually rejects instead of hanging", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const session = await service.createSession({ provider: "copilot" });
        const parentChat = buildDefaultChatUri(session.toString());
        startParentTurn(session, "turn-1");
        copilotAgent.fireProgress({
          kind: "action",
          resource: URI.parse(parentChat),
          action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-sub", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } }
        });
        copilotAgent.fireProgress({
          kind: "action",
          resource: URI.parse(parentChat),
          action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-sub", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded }
        });
        const subagentUri = buildSubagentChatUri(session.toString(), "tc-sub");
        const subscribePromise = service.subscribe(URI.parse(subagentUri), "client-race");
        await assert.rejects(subscribePromise, /Cannot subscribe to unknown resource/);
      });
    });
  });
  suite("peer chat catalog persistence", () => {
    async function readCatalog(db) {
      for (let i = 0; i < 50; i++) {
        const raw = await db.getMetadata("peerChats");
        if (raw !== void 0) {
          return JSON.parse(raw);
        }
        await timeout(0);
      }
      return [];
    }
    test("createChat persists providerData; restore re-materializes from the orchestrator catalog before reading history", async () => {
      const materializeOrder = [];
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat) {
          return { providerData: "blob-1" };
        }
        async materializeChat(chat, providerData) {
          materializeOrder.push({ call: "materialize", uri: chat.toString(), providerData });
        }
        async getSessionMessages(session2) {
          if (session2.scheme === "ahp-chat") {
            materializeOrder.push({ call: "getMessages", uri: session2.toString() });
            return [{
              id: "peer-turn-1",
              state: TurnState.Complete,
              message: { text: "hi peer", origin: { kind: MessageKind.User } },
              responseParts: [],
              usage: void 0
            }];
          }
          return [];
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new MultiChatAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      const peerUri = URI.parse(buildChatUri(session, "peer-1"));
      await localService.createChat(session, peerUri);
      await readCatalog(db);
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const state = localService.stateManager.getSessionState(session.toString());
      const peerChatState = localService.stateManager.getChatState(peerUri.toString());
      assert.deepStrictEqual({
        order: materializeOrder.map((o) => o.call),
        materializedWith: materializeOrder.find((o) => o.call === "materialize")?.providerData,
        inCatalog: !!state?.chats.some((c) => c.resource.toString() === peerUri.toString()),
        restoredProviderData: localService.stateManager.getChatProviderData(peerUri.toString()),
        peerTurnIds: peerChatState?.turns.map((t) => t.id) ?? []
      }, {
        // The default chat is read first; peer materialize must precede
        // the peer history read on restore.
        order: ["getMessages", "materialize", "getMessages"],
        materializedWith: "blob-1",
        inCatalog: true,
        restoredProviderData: "blob-1",
        peerTurnIds: ["peer-turn-1"]
      });
    });
    test("onDidChangeChatData re-persists the updated providerData blob", async () => {
      const onDidChangeChatData = disposables.add(new Emitter());
      class MultiChatAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.onDidChangeChatData = onDidChangeChatData.event;
        }
        async createChat(_session, _chat) {
          return { providerData: "v1" };
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new MultiChatAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      const peerUri = URI.parse(buildChatUri(session, "peer-1"));
      await localService.createChat(session, peerUri);
      const afterCreate = await readCatalog(db);
      onDidChangeChatData.fire({ chat: peerUri, providerData: "v2" });
      let updated = afterCreate;
      for (let i = 0; i < 50; i++) {
        updated = await readCatalog(db);
        if (updated.find((e) => e.uri === peerUri.toString())?.providerData === "v2") {
          break;
        }
        await timeout(0);
      }
      assert.deepStrictEqual({
        afterCreate: afterCreate.find((e) => e.uri === peerUri.toString())?.providerData,
        afterChange: updated.find((e) => e.uri === peerUri.toString())?.providerData
      }, {
        afterCreate: "v1",
        afterChange: "v2"
      });
    });
    test("disposeChat removes the chat from the persisted catalog", async () => {
      class MultiChatAgent extends MockAgent {
        async createChat(_session, _chat) {
          return { providerData: "blob-1" };
        }
        async disposeChat(_session, _chat) {
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new MultiChatAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      const peerUri = URI.parse(buildChatUri(session, "peer-1"));
      await localService.createChat(session, peerUri);
      const afterCreate = await readCatalog(db);
      await localService.disposeChat(session, peerUri);
      let afterDispose = afterCreate;
      for (let i = 0; i < 50; i++) {
        afterDispose = await readCatalog(db);
        if (!afterDispose.some((e) => e.uri === peerUri.toString())) {
          break;
        }
        await timeout(0);
      }
      assert.deepStrictEqual({
        afterCreate: afterCreate.map((e) => e.uri),
        afterDispose: afterDispose.map((e) => e.uri)
      }, {
        afterCreate: [peerUri.toString()],
        afterDispose: []
      });
    });
    test("legacy *.chats with no peerChats catalog migrates once into the orchestrator catalog", async () => {
      class LegacyAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.listLegacyCallCount = 0;
        }
        async createChat() {
        }
        async materializeChat() {
        }
        async listLegacyChats(session2) {
          this.listLegacyCallCount++;
          return [
            { uri: URI.parse(buildChatUri(session2, "legacy-a")), providerData: "lp-a" },
            { uri: URI.parse(buildChatUri(session2, "legacy-b")), providerData: "lp-b" }
          ];
        }
        async getSessionMessages(session2) {
          if (session2.scheme === "ahp-chat") {
            return [{
              id: `${parseChatUri(session2)?.chatId}-turn`,
              state: TurnState.Complete,
              message: { text: "legacy hi", origin: { kind: MessageKind.User } },
              responseParts: [],
              usage: void 0
            }];
          }
          return [];
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new LegacyAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      const legacyAUri = URI.parse(buildChatUri(session, "legacy-a"));
      const legacyBUri = URI.parse(buildChatUri(session, "legacy-b"));
      await db.setMetadata(`customChatTitle:${legacyAUri.toString()}`, "Legacy A Title");
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const catalogAfterFirst = await readCatalog(db);
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const stateA = localService.stateManager.getChatState(legacyAUri.toString());
      const stateB = localService.stateManager.getChatState(legacyBUri.toString());
      assert.deepStrictEqual({
        legacyCalls: agent.listLegacyCallCount,
        catalog: catalogAfterFirst.map((e) => ({ uri: e.uri, providerData: e.providerData })),
        aTitle: stateA?.title,
        aTurns: stateA?.turns.map((t) => t.id) ?? [],
        aProviderData: localService.stateManager.getChatProviderData(legacyAUri.toString()),
        bTurns: stateB?.turns.map((t) => t.id) ?? [],
        bProviderData: localService.stateManager.getChatProviderData(legacyBUri.toString())
      }, {
        legacyCalls: 1,
        catalog: [
          { uri: legacyAUri.toString(), providerData: "lp-a" },
          { uri: legacyBUri.toString(), providerData: "lp-b" }
        ],
        aTitle: "Legacy A Title",
        aTurns: ["legacy-a-turn"],
        aProviderData: "lp-a",
        bTurns: ["legacy-b-turn"],
        bProviderData: "lp-b"
      });
    });
    test("an empty ([]) peerChats catalog does not resurrect legacy chats", async () => {
      class LegacyAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.listLegacyCallCount = 0;
        }
        async listLegacyChats(session2) {
          this.listLegacyCallCount++;
          return [{ uri: URI.parse(buildChatUri(session2, "legacy-a")), providerData: "lp-a" }];
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new LegacyAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      await db.setMetadata("peerChats", "[]");
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const state = localService.stateManager.getSessionState(session.toString());
      assert.deepStrictEqual({
        legacyCalls: agent.listLegacyCallCount,
        peerChats: (state?.chats ?? []).map((c) => parseChatUri(c.resource)?.chatId).filter((id) => id !== "default")
      }, {
        legacyCalls: 0,
        peerChats: []
      });
    });
    test("a valid new-format peerChats catalog restores without consulting legacy chats", async () => {
      class LegacyAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this.listLegacyCallCount = 0;
        }
        async createChat() {
          return { providerData: "new-blob" };
        }
        async materializeChat() {
        }
        async listLegacyChats(session2) {
          this.listLegacyCallCount++;
          return [{ uri: URI.parse(buildChatUri(session2, "legacy-a")), providerData: "lp-a" }];
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new LegacyAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      const peerUri = URI.parse(buildChatUri(session, "peer-1"));
      await localService.createChat(session, peerUri);
      await readCatalog(db);
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const state = localService.stateManager.getSessionState(session.toString());
      assert.deepStrictEqual({
        legacyCalls: agent.listLegacyCallCount,
        peerInCatalog: !!state?.chats.some((c) => c.resource.toString() === peerUri.toString()),
        legacyInCatalog: state?.chats.some((c) => parseChatUri(c.resource)?.chatId === "legacy-a") ?? false
      }, {
        legacyCalls: 0,
        peerInCatalog: true,
        legacyInCatalog: false
      });
    });
    test("legacy migration persists the whole set in one write (never a subset, even across a re-restore)", async () => {
      class LegacyAgent extends MockAgent {
        async createChat() {
        }
        async materializeChat() {
        }
        async listLegacyChats(session2) {
          return [
            { uri: URI.parse(buildChatUri(session2, "legacy-a")), providerData: "lp-a" },
            { uri: URI.parse(buildChatUri(session2, "legacy-b")), providerData: "lp-b" },
            { uri: URI.parse(buildChatUri(session2, "legacy-c")), providerData: "lp-c" }
          ];
        }
      }
      const db = new TestSessionDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new LegacyAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const catalog = await readCatalog(db);
      const restoredIds = (localService.stateManager.getSessionState(session.toString())?.chats ?? []).map((c) => parseChatUri(c.resource)?.chatId).filter((id) => id !== "default");
      assert.deepStrictEqual({
        catalogIds: catalog.map((e) => parseChatUri(URI.parse(e.uri))?.chatId),
        restoredIds
      }, {
        catalogIds: ["legacy-a", "legacy-b", "legacy-c"],
        restoredIds: ["legacy-a", "legacy-b", "legacy-c"]
      });
    });
    test("a rejected migration write leaves the catalog absent (not a subset) so migration re-runs", async () => {
      class FailingCatalogDatabase extends TestSessionDatabase {
        constructor() {
          super(...arguments);
          this.failPeerChatsWrites = 1;
        }
        async setMetadata(key, value) {
          if (key === "peerChats" && this.failPeerChatsWrites > 0) {
            this.failPeerChatsWrites--;
            throw new Error("simulated catalog write failure");
          }
          return super.setMetadata(key, value);
        }
      }
      class LegacyAgent extends MockAgent {
        async createChat() {
        }
        async materializeChat() {
        }
        async listLegacyChats(session2) {
          return [
            { uri: URI.parse(buildChatUri(session2, "legacy-a")), providerData: "lp-a" },
            { uri: URI.parse(buildChatUri(session2, "legacy-b")), providerData: "lp-b" }
          ];
        }
      }
      const db = new FailingCatalogDatabase();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, createSessionDataService(db), { _serviceBrand: void 0 }, createNoopGitService()));
      const agent = disposables.add(new LegacyAgent("copilot"));
      localService.registerProvider(agent);
      const session = await localService.createSession({ provider: "copilot" });
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const catalogAfterFailedWrite = await db.getMetadata("peerChats");
      localService.stateManager.deleteSession(session.toString());
      await localService.restoreSession(session);
      const catalog = await readCatalog(db);
      assert.deepStrictEqual({
        catalogAfterFailedWrite,
        catalogIds: catalog.map((e) => parseChatUri(URI.parse(e.uri))?.chatId)
      }, {
        catalogAfterFailedWrite: void 0,
        catalogIds: ["legacy-a", "legacy-b"]
      });
    });
  });
  suite("subscriber refcount eviction", () => {
    test("an empty session created in this lifetime stays observable until GC fires", async () => {
      service.registerProvider(copilotAgent);
      const sessionResource = await service.createSession({ provider: "copilot" });
      service.addSubscriber(sessionResource, "client-1");
      service.unsubscribe(sessionResource, "client-1");
      assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "empty created session must remain observable for the GC grace window");
    });
    test("a session with an active turn is NOT evicted when its last subscriber drops", async () => {
      service.registerProvider(copilotAgent);
      const sessionResource = await service.createSession({ provider: "copilot" });
      service.addSubscriber(sessionResource, "client-1");
      service.dispatchAction(
        buildDefaultChatUri(sessionResource.toString()),
        { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hello", origin: { kind: MessageKind.User } } },
        "client-1",
        1
      );
      service.unsubscribe(sessionResource, "client-1");
      assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "active-turn session must not be evicted");
    });
    test("a restored idle session is evicted when its last subscriber drops", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const { session } = await copilotAgent.createSession();
        const sessions = await copilotAgent.listSessions();
        const sessionResource = sessions[0].session;
        copilotAgent.sessionMessages = [
          { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
          { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
        ];
        await service.restoreSession(sessionResource);
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "session stays cached during the release grace");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), void 0, "restored idle session should be evicted after the grace");
        assert.deepStrictEqual(
          copilotAgent.releaseSessionCalls.map((u) => u.toString()),
          [sessionResource.toString()],
          "provider releaseSession should be invoked for the evicted root"
        );
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, "eviction must not destructively dispose the session");
      });
    });
    test("re-subscribing within the grace cancels the release", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const { session } = await copilotAgent.createSession();
        const sessions = await copilotAgent.listSessions();
        const sessionResource = sessions[0].session;
        copilotAgent.sessionMessages = [
          { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
          { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
        ];
        await service.restoreSession(sessionResource);
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        service.addSubscriber(sessionResource, "client-2");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "session must stay cached when re-subscribed within the grace");
        assert.strictEqual(copilotAgent.releaseSessionCalls.length, 0, "releaseSession must not fire when the grace was cancelled");
      });
    });
    test("an evicted idle session restores losslessly on re-subscribe", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const { session } = await copilotAgent.createSession();
        const sessions = await copilotAgent.listSessions();
        const sessionResource = sessions[0].session;
        copilotAgent.sessionMessages = [
          { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
          { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
        ];
        await service.restoreSession(sessionResource);
        service.addSubscriber(sessionResource, "client-1");
        const before = service.stateManager.getSessionState(sessionResource.toString());
        assert.ok(before, "session state present before eviction");
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), void 0, "session evicted after last subscriber drops");
        await service.subscribe(sessionResource, "client-2");
        const after = service.stateManager.getSessionState(sessionResource.toString());
        assert.ok(after, "session restored on re-subscribe");
        const normalizeTurns = (turns) => turns.map((turn) => ({ ...turn, responseParts: turn.responseParts.map((part) => ({ ...part, id: void 0 })) }));
        assert.deepStrictEqual(normalizeTurns(after.turns), normalizeTurns(before.turns), "restored turns match the pre-eviction state");
      });
    });
    test("restored session is evicted after all subscribers drop", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const { session } = await copilotAgent.createSession();
        const sessions = await copilotAgent.listSessions();
        const sessionResource = sessions[0].session;
        copilotAgent.sessionMessages = [
          { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
          { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
        ];
        await service.restoreSession(sessionResource);
        service.addSubscriber(sessionResource, "client-1");
        service.addSubscriber(sessionResource, "client-2");
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "still subscribed by client-2");
        service.unsubscribe(sessionResource, "client-2");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), void 0, "evicted after last subscriber drops");
      });
    });
    test("subagent subscriber pins the parent session against eviction", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const { session } = await copilotAgent.createSession();
        const sessions = await copilotAgent.listSessions();
        const sessionResource = sessions[0].session;
        copilotAgent.sessionMessages = [
          { type: "message", session, role: "user", messageId: "msg-1", content: "Review", toolRequests: [] },
          { type: "message", session, role: "assistant", messageId: "msg-2", content: "", toolRequests: [{ toolCallId: "tc-sub", name: "task" }] },
          { type: "tool_start", session, toolCallId: "tc-sub", toolName: "task", displayName: "Task", invocationMessage: "Delegating", toolKind: "subagent", subagentDescription: "Find files", subagentAgentName: "explore" },
          { type: "subagent_started", session, toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" },
          { type: "tool_start", session, toolCallId: "tc-inner", toolName: "bash", displayName: "Bash", invocationMessage: "ls", parentToolCallId: "tc-sub" },
          { type: "tool_complete", session, toolCallId: "tc-inner", result: { success: true, pastTenseMessage: "ran", content: [{ type: ToolResultContentType.Text, text: "a" }] }, parentToolCallId: "tc-sub" },
          { type: "tool_complete", session, toolCallId: "tc-sub", result: { success: true, pastTenseMessage: "done", content: [{ type: ToolResultContentType.Text, text: "ok" }] } },
          { type: "message", session, role: "assistant", messageId: "msg-3", content: "Done", toolRequests: [] }
        ];
        await service.restoreSession(sessionResource);
        const childUri = URI.parse(buildSubagentSessionUri(sessionResource.toString(), "tc-sub"));
        await service.subscribe(childUri, "client-child");
        service.addSubscriber(sessionResource, "client-parent");
        service.unsubscribe(sessionResource, "client-parent");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "parent must stay while child is subscribed");
        assert.ok(service.stateManager.getSessionState(childUri.toString()), "child still present");
        service.unsubscribe(childUri, "client-child");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), void 0, "parent evicted after subagent drops");
        assert.strictEqual(service.stateManager.getSessionState(childUri.toString()), void 0, "child also evicted with parent");
      });
    });
    test("nested subagent subscriber pins ancestor session against eviction", async () => {
      service.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Review", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "", toolRequests: [{ toolCallId: "tc-sub", name: "task" }] },
        { type: "tool_start", session, toolCallId: "tc-sub", toolName: "task", displayName: "Task", invocationMessage: "Delegating", toolKind: "subagent", subagentDescription: "Find files", subagentAgentName: "explore" },
        { type: "subagent_started", session, toolCallId: "tc-sub", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" },
        { type: "tool_start", session, toolCallId: "tc-inner", toolName: "bash", displayName: "Bash", invocationMessage: "ls", parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-inner", result: { success: true, pastTenseMessage: "ran", content: [{ type: ToolResultContentType.Text, text: "a" }] }, parentToolCallId: "tc-sub" },
        { type: "tool_complete", session, toolCallId: "tc-sub", result: { success: true, pastTenseMessage: "done", content: [{ type: ToolResultContentType.Text, text: "ok" }] } },
        { type: "message", session, role: "assistant", messageId: "msg-3", content: "Done", toolRequests: [] }
      ];
      await service.restoreSession(sessionResource);
      const childUri = URI.parse(buildSubagentSessionUri(sessionResource, "tc-sub"));
      await service.subscribe(childUri, "client-child");
      const nestedChildUri = URI.parse(buildSubagentSessionUri(childUri, "tc-nested"));
      service.addSubscriber(sessionResource, "client-parent");
      service.addSubscriber(nestedChildUri, "client-nested-child");
      service.unsubscribe(sessionResource, "client-parent");
      assert.ok(service.stateManager.getSessionState(sessionResource.toString()), "ancestor parent must stay while nested child is subscribed");
      assert.ok(service.stateManager.getSessionState(childUri.toString()), "intermediate child still present");
    });
    test("depth-2 subagent unsubscribe evicts the root session state", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const { session } = await copilotAgent.createSession();
        const sessions = await copilotAgent.listSessions();
        const sessionResource = sessions[0].session;
        copilotAgent.sessionMessages = [
          { type: "message", session, role: "user", messageId: "msg-1", content: "hi", toolRequests: [] },
          { type: "message", session, role: "assistant", messageId: "msg-2", content: "done", toolRequests: [] }
        ];
        await service.restoreSession(sessionResource);
        const childUri = URI.parse(buildSubagentSessionUri(sessionResource, "tc-sub"));
        const nestedUri = URI.parse(buildSubagentSessionUri(childUri, "tc-nested"));
        service.addSubscriber(nestedUri, "client-nested");
        service.unsubscribe(nestedUri, "client-nested");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), void 0, "root state must be evicted when no subscribers remain");
      });
    });
  });
  suite("addSubscriber triggers uncommitted refresh", () => {
    test("addSubscriber for <session>/changeset/uncommitted triggers the first git diff refresh", async () => {
      const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: "/wd-refresh" });
      copilotAgent.resolvedWorkingDirectory = workingDirectory;
      copilotAgent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      const computeCalls = [];
      const gitService = createNoopGitService();
      gitService.computeSessionFileDiffs = async (wd, opts) => {
        computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
        return void 0;
      };
      const sessionDataService = createSessionDataService();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, gitService));
      localService.registerProvider(copilotAgent);
      const sessionResource = await localService.createSession({ provider: "copilot" });
      const uncommittedUri = URI.parse(buildUncommittedChangesetUri(sessionResource.toString()));
      localService.addSubscriber(uncommittedUri, "client-1");
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(
        computeCalls.some((c) => c.baseBranch === void 0 && c.wd === workingDirectory.toString()),
        `expected an uncommitted-kind git diff against the working dir, got: ${JSON.stringify(computeCalls)}`
      );
      localService.unsubscribe(uncommittedUri, "client-1");
    });
    test("addSubscriber for the session URI or session-changeset URI triggers a static refresh", async () => {
      const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: "/wd-refresh-2" });
      copilotAgent.resolvedWorkingDirectory = workingDirectory;
      copilotAgent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      const computeCalls = [];
      const gitService = createNoopGitService();
      gitService.computeSessionFileDiffs = async (wd, opts) => {
        computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
        return void 0;
      };
      const sessionDataService = createSessionDataService();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, gitService));
      localService.registerProvider(copilotAgent);
      const sessionResource = await localService.createSession({ provider: "copilot" });
      const sessionChangesetUri = URI.parse(buildSessionChangesetUri(sessionResource.toString()));
      localService.addSubscriber(sessionChangesetUri, "client-1");
      localService.addSubscriber(sessionResource, "client-2");
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(
        computeCalls.some((c) => c.wd === workingDirectory.toString()),
        `session-URI / session-changeset subscriptions must trigger a git diff against the working dir, got: ${JSON.stringify(computeCalls)}`
      );
      localService.unsubscribe(sessionChangesetUri, "client-1");
      localService.unsubscribe(sessionResource, "client-2");
    });
    test("restoreSession drains a pending uncommitted refresh deferred by an earlier addSubscriber", async () => {
      const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: "/wd-restore-drain" });
      copilotAgent.resolvedWorkingDirectory = workingDirectory;
      copilotAgent.sessionMetadataOverrides = { workingDirectories: workingDirectory ? [workingDirectory] : void 0 };
      const computeCalls = [];
      const gitService = createNoopGitService();
      gitService.computeSessionFileDiffs = async (wd, opts) => {
        computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
        return void 0;
      };
      const sessionDataService = createSessionDataService();
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, gitService));
      localService.registerProvider(copilotAgent);
      const { session } = await copilotAgent.createSession();
      const sessions = await copilotAgent.listSessions();
      const sessionResource = sessions[0].session;
      const uncommittedUri = URI.parse(buildUncommittedChangesetUri(sessionResource.toString()));
      localService.addSubscriber(uncommittedUri, "client-1");
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(
        computeCalls.length,
        0,
        `no compute should fire while the session is not restored (workingDirectory unknown), got: ${JSON.stringify(computeCalls)}`
      );
      copilotAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(
        computeCalls.some((c) => c.baseBranch === void 0 && c.wd === workingDirectory.toString()),
        `restoreSession must drain the pending refresh; got compute calls: ${JSON.stringify(computeCalls)}`
      );
      localService.unsubscribe(uncommittedUri, "client-1");
    });
  });
  suite("empty-session GC", () => {
    test("an empty unsubscribed session is disposed after the grace period", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const sessionResource = await service.createSession({ provider: "copilot" });
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, "no GC before grace expires");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.deepStrictEqual(
          copilotAgent.disposeSessionCalls.map((u) => u.toString()),
          [sessionResource.toString()],
          "GC fired after grace period"
        );
      });
    });
    test("a session with at least one turn is not GC-disposed", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const sessionResource = await service.createSession({ provider: "copilot" });
        service.addSubscriber(sessionResource, "client-1");
        service.dispatchAction(
          buildDefaultChatUri(sessionResource.toString()),
          { type: ActionType.ChatTurnStarted, turnId: "turn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hello", origin: { kind: MessageKind.User } } },
          "client-1",
          1
        );
        service.dispatchAction(
          buildDefaultChatUri(sessionResource.toString()),
          { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 },
          "client-1",
          2
        );
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, "session with turns must not be GC-disposed");
      });
    });
    test("resubscribe within the grace period cancels GC", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const sessionResource = await service.createSession({ provider: "copilot" });
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 5e3));
        service.addSubscriber(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, "GC must be cancelled after resubscribe");
      });
    });
    test("GC is rearmed after a resubscribe-then-unsubscribe cycle", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const sessionResource = await service.createSession({ provider: "copilot" });
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 5e3));
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 29e3));
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, "rearmed timer not yet fired");
        await new Promise((resolve) => setTimeout(resolve, 2e3));
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1, "rearmed timer fires after fresh 30s");
      });
    });
    test("createSession on the same URI cancels a pending GC", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        service.registerProvider(copilotAgent);
        const sessionResource = await service.createSession({ provider: "copilot", session: AgentSession.uri("copilot", "recreate-test") });
        service.addSubscriber(sessionResource, "client-1");
        service.unsubscribe(sessionResource, "client-1");
        await new Promise((resolve) => setTimeout(resolve, 5e3));
        await service.createSession({ provider: "copilot", session: AgentSession.uri("copilot", "recreate-test") });
        await new Promise((resolve) => setTimeout(resolve, 3e4));
        assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, "createSession on same URI must cancel pending GC");
      });
    });
  });
  suite("session config persistence", () => {
    test("createSession persists initial config values to the session DB", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      await localService.createSession({ provider: "copilot", config: { autoApprove: "autoApprove" } });
      await new Promise((r) => setTimeout(r, 50));
      const persisted = await sessionDb.getMetadata("configValues");
      assert.ok(persisted, "configValues should be persisted");
      assert.deepStrictEqual(JSON.parse(persisted), { autoApprove: "autoApprove" });
    });
    test("createSession does not write configValues when there are no values", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      await localService.createSession({ provider: "copilot" });
      await new Promise((r) => setTimeout(r, 50));
      const persisted = await sessionDb.getMetadata("configValues");
      assert.strictEqual(persisted, void 0);
    });
    test("restoreSession overlays persisted config values onto the resolved config", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      await sessionDb.setMetadata("configValues", JSON.stringify({ autoApprove: "autoApprove" }));
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.config?.values, { autoApprove: "autoApprove" });
    });
    test.skip("restoreSession seeds the session changeset from persisted diffs", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      const persistedDiffs = [
        {
          after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
          diff: { added: 5, removed: 2 }
        }
      ];
      await sessionDb.setMetadata("diffs", JSON.stringify(persistedDiffs));
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.changesets, [
        {
          label: "Branch Changes",
          uriTemplate: `${sessionResource.toString()}/changeset/session`,
          changeKind: "session"
        },
        {
          label: "Uncommitted Changes",
          description: "Show uncommitted changes in this session",
          uriTemplate: `${sessionResource.toString()}/changeset/uncommitted`,
          changeKind: "uncommitted"
        }
      ]);
      const changesetSnapshot = localService.stateManager.getSnapshot(`${sessionResource.toString()}/changeset/session`);
      assert.ok(changesetSnapshot);
      const changesetState = changesetSnapshot.state;
      assert.strictEqual(changesetState.status, "ready");
      assert.deepStrictEqual(changesetState.files.map((f) => f.id), ["file:///wd/a.ts"]);
    });
    test.skip("restoreSession silently ignores malformed persisted diffs", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      await sessionDb.setMetadata("diffs", "{ not valid json");
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.changesets, [
        {
          label: "Branch Changes",
          uriTemplate: `${sessionResource.toString()}/changeset/session`,
          changeKind: "session"
        },
        {
          description: "Show uncommitted changes in this session",
          label: "Uncommitted Changes",
          uriTemplate: `${sessionResource.toString()}/changeset/uncommitted`,
          changeKind: "uncommitted"
        }
      ]);
      const changesetSnapshot = localService.stateManager.getSnapshot(`${sessionResource.toString()}/changeset/session`);
      assert.ok(changesetSnapshot);
      const changesetState = changesetSnapshot.state;
      assert.strictEqual(changesetState.status, "computing");
      assert.strictEqual(changesetState.files.length, 0);
    });
    test("createSession + restoreSession round-trip restores initial config without any mid-session changes", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const session = await localService.createSession({ provider: "copilot", config: { autoApprove: "autoApprove" } });
      await new Promise((r) => setTimeout(r, 50));
      localService.stateManager.removeSession(session.toString());
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(session);
      const state = localService.stateManager.getSessionState(session.toString());
      assert.ok(state);
      assert.deepStrictEqual(state.config?.values, { autoApprove: "autoApprove" });
    });
    test("restoreSession ignores malformed persisted configValues", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      await sessionDb.setMetadata("configValues", "{not json");
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.config, void 0);
    });
  });
  suite("resourceList", () => {
    test("throws when the directory does not exist", async () => {
      await assert.rejects(
        () => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: "/nonexistent" })),
        /Directory not found/
      );
    });
    test("throws when the target is not a directory", async () => {
      await assert.rejects(
        () => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: "/testDir/file.txt" })),
        /Not a directory/
      );
    });
  });
  suite("worktree working directory", () => {
    test("createSession uses agent-resolved working directory in state", async () => {
      const worktreeDir = URI.file("/source/repo.worktrees/agents-xyz");
      copilotAgent.resolvedWorkingDirectory = worktreeDir;
      service.registerProvider(copilotAgent);
      const sourceDir = URI.file("/source/repo");
      const session = await service.createSession({ provider: "copilot", workingDirectories: [sourceDir] });
      const state = service.stateManager.getSessionState(session.toString());
      assert.strictEqual(state?.workingDirectories?.[0], worktreeDir.toString());
    });
    test("createSession falls back to config working directory when agent does not resolve", async () => {
      copilotAgent.resolvedWorkingDirectory = void 0;
      service.registerProvider(copilotAgent);
      const sourceDir = URI.file("/source/repo");
      const session = await service.createSession({ provider: "copilot", workingDirectories: [sourceDir] });
      const state = service.stateManager.getSessionState(session.toString());
      assert.strictEqual(state?.workingDirectories?.[0], sourceDir.toString());
    });
    test("restoreSession uses agent working directory in state", async () => {
      const worktreeDir = URI.file("/source/repo.worktrees/agents-xyz");
      copilotAgent.sessionMetadataOverrides = { workingDirectories: worktreeDir ? [worktreeDir] : void 0 };
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      service.stateManager.deleteSession(session.toString());
      assert.strictEqual(service.stateManager.getSessionState(session.toString()), void 0);
      await service.restoreSession(session);
      const state = service.stateManager.getSessionState(session.toString());
      assert.strictEqual(state?.workingDirectories?.[0], worktreeDir.toString());
    });
    test("_resolveWorkingDirectoryBeforeSend returns the full set (index 0 + tail), or undefined when unset", async () => {
      const resolver = service;
      const resolve = (resource) => resolver._resolveWorkingDirectoryBeforeSend({ session: resource, chat: `${resource}/chat`, turnId: "t", prompt: "hi" });
      const inject = (resource, dirs) => service.stateManager.restoreSession({
        resource,
        provider: "copilot",
        title: "t",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: void 0,
        workingDirectories: dirs?.map((d) => d.toString())
      }, []);
      const a = URI.file("/roots/a");
      const b = URI.file("/roots/b");
      const c = URI.file("/roots/c");
      const multi = URI.from({ scheme: "copilot", path: "/multi" }).toString();
      const single = URI.from({ scheme: "copilot", path: "/single" }).toString();
      const none = URI.from({ scheme: "copilot", path: "/none" }).toString();
      inject(multi, [a, b, c]);
      inject(single, [a]);
      inject(none, void 0);
      const toStrings = (r) => r?.map((d) => d.toString());
      assert.deepStrictEqual(
        [toStrings(await resolve(multi)), toStrings(await resolve(single)), toStrings(await resolve(none))],
        [[a, b, c].map((d) => d.toString()), [a.toString()], void 0]
      );
    });
  });
  test("provisional workspace session advertises Uncommitted Changes before materialization", async () => {
    class ProvisionalMockAgent extends MockAgent {
      async createSession(config) {
        const result = await super.createSession(config);
        return { ...result, provisional: true };
      }
    }
    const workingDirectory = URI.file("/workspace");
    const gitCalls = [];
    const gitService = createNoopGitService();
    gitService.getSessionGitState = async (resource) => {
      gitCalls.push(resource.toString());
      return {
        hasGitHubRemote: false,
        branchName: "main",
        baseBranchName: "main",
        upstreamBranchName: void 0,
        incomingChanges: 0,
        outgoingChanges: 0,
        uncommittedChanges: 1
      };
    };
    gitService.computeSessionFileDiffs = async () => [];
    const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: void 0 }, gitService));
    const provisionalAgent = new ProvisionalMockAgent("provisional");
    disposables.add(toDisposable(() => provisionalAgent.dispose()));
    localService.registerProvider(provisionalAgent);
    const workspaceSession = await localService.createSession({
      provider: provisionalAgent.id,
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    });
    const uncommittedUri = buildUncommittedChangesetUri(workspaceSession.toString());
    localService.addSubscriber(URI.parse(uncommittedUri), "client-1");
    for (let i = 0; i < 100; i++) {
      if (localService.stateManager.getChangesetState(uncommittedUri)?.operations?.some((operation) => operation.id === "commit")) {
        break;
      }
      await timeout(2);
    }
    const workspaceState = localService.stateManager.getSessionState(workspaceSession.toString());
    assert.deepStrictEqual({
      lifecycle: workspaceState?.lifecycle,
      changesets: workspaceState?.changesets?.map((changeset) => changeset.changeKind),
      gitCalls,
      hasCommit: localService.stateManager.getChangesetState(uncommittedUri)?.operations?.some((operation) => operation.id === "commit")
    }, {
      lifecycle: SessionLifecycle.Creating,
      changesets: ["uncommitted"],
      gitCalls: [workingDirectory.toString()],
      hasCommit: true
    });
    localService.unsubscribe(URI.parse(uncommittedUri), "client-1");
    const workspaceLessSession = await localService.createSession({ provider: provisionalAgent.id });
    assert.deepStrictEqual(
      localService.stateManager.getSessionState(workspaceLessSession.toString())?.changesets ?? [],
      []
    );
  });
  suite.skip("item-2: initial changeset seeding at create time", () => {
    function assertBackingChangesetsComputing(stateManager, sessionStr) {
      const uncommitted = stateManager.getSnapshot(buildUncommittedChangesetUri(sessionStr));
      const sessionWide = stateManager.getSnapshot(buildSessionChangesetUri(sessionStr));
      assert.ok(uncommitted, `expected ${sessionStr}/changeset/uncommitted to be subscribable`);
      assert.ok(sessionWide, `expected ${sessionStr}/changeset/session to be subscribable`);
      assert.strictEqual(uncommitted.state.status, ChangesetStatus.Computing);
      assert.strictEqual(sessionWide.state.status, ChangesetStatus.Computing);
    }
    function defaultCatalogue(sessionStr) {
      return [
        {
          label: "Branch Changes",
          uriTemplate: `${sessionStr}/changeset/session`,
          changeKind: "session"
        },
        {
          label: "Uncommitted Changes",
          description: "Show uncommitted changes in this session",
          uriTemplate: `${sessionStr}/changeset/uncommitted`,
          changeKind: "uncommitted"
        }
      ];
    }
    test("createSession seeds both halves before SessionReady", async () => {
      service.registerProvider(copilotAgent);
      const session = await service.createSession({ provider: "copilot" });
      const sessionStr = session.toString();
      const state = service.stateManager.getSessionState(sessionStr);
      assert.ok(state);
      assert.deepStrictEqual(state.changesets, defaultCatalogue(sessionStr));
      assertBackingChangesetsComputing(service.stateManager, sessionStr);
    });
    test("forked createSession seeds both halves on the forked session", async () => {
      service.registerProvider(copilotAgent);
      const sourceSession = await service.createSession({ provider: "copilot" });
      const sourceState = service.stateManager.getSessionState(sourceSession.toString());
      const sourceTurnId = "turn-src-1";
      sourceState.turns = [{
        id: sourceTurnId,
        state: TurnState.Complete,
        message: { text: "hi", origin: { kind: MessageKind.User } },
        responseParts: [],
        usage: void 0
      }];
      const forked = await service.createSession({
        provider: "copilot",
        fork: { session: sourceSession, turnIndex: 0, turnId: sourceTurnId }
      });
      assert.notStrictEqual(forked.toString(), sourceSession.toString(), "fork should produce a distinct session URI");
      const forkedStr = forked.toString();
      const forkedState = service.stateManager.getSessionState(forkedStr);
      assert.ok(forkedState);
      assert.deepStrictEqual(forkedState.changesets, defaultCatalogue(forkedStr));
      assert.ok(forkedState.turns.length > 0, "forked session should carry copied turns");
      assertBackingChangesetsComputing(service.stateManager, forkedStr);
    });
    test("provisional session materialization preserves both halves", async () => {
      class ProvisionalMockAgent extends MockAgent {
        constructor() {
          super(...arguments);
          this._onDidMaterialize = new Emitter();
          this.onDidMaterializeSession = this._onDidMaterialize.event;
        }
        async createSession(config) {
          const result = await super.createSession(config);
          return { ...result, provisional: true };
        }
        materialize(session2, workingDirectory) {
          this._onDidMaterialize.fire({ session: session2, workingDirectories: workingDirectory ? [workingDirectory] : void 0, project: void 0 });
        }
      }
      const provisionalAgent = new ProvisionalMockAgent("copilot");
      disposables.add(toDisposable(() => provisionalAgent.dispose()));
      service.registerProvider(provisionalAgent);
      const session = await service.createSession({ provider: "copilot" });
      const sessionStr = session.toString();
      const stateBefore = service.stateManager.getSessionState(sessionStr);
      assert.ok(stateBefore, "provisional session should already have state");
      assert.deepStrictEqual(stateBefore.changesets, defaultCatalogue(sessionStr));
      assertBackingChangesetsComputing(service.stateManager, sessionStr);
      provisionalAgent.materialize(session, URI.file("/wd"));
      const stateAfter = service.stateManager.getSessionState(sessionStr);
      assert.ok(stateAfter, "materialized session should still have state");
      assert.deepStrictEqual(stateAfter.changesets, defaultCatalogue(sessionStr));
      assertBackingChangesetsComputing(service.stateManager, sessionStr);
    });
    test("restoreSession with no persisted diffs seeds both halves in computing state", async () => {
      const sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent("copilot");
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      const sessionStr = sessionResource.toString();
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionStr);
      assert.ok(state);
      assert.deepStrictEqual(state.changesets, defaultCatalogue(sessionStr));
      assertBackingChangesetsComputing(localService.stateManager, sessionStr);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHsgbWtkdGVtcFN5bmMsIHJlYWRGaWxlU3luYywgcm1TeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ3VybCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UsIElDb25uZWN0aW9uVHJhY2tlclNlcnZpY2UsIElSZXN0b3JlZFN1YmFnZW50U2Vzc2lvbiwgU3ViYWdlbnRDaGF0U2lnbmFsLCB0eXBlIElBZ2VudCwgdHlwZSBJQWdlbnRDaGF0RGF0YUNoYW5nZSwgdHlwZSBJQWdlbnRDaGF0cywgdHlwZSBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgdHlwZSBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgdHlwZSBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIHR5cGUgSUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdCwgdHlwZSBJQWdlbnRMZWdhY3lDaGF0LCB0eXBlIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgdHlwZSBJQWdlbnRTcGF3bkNoYXRFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSwgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9ub2RlL3Nlc3Npb25EYXRhYmFzZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBBY3Rpb25FbnZlbG9wZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQsIE1lc3NhZ2VLaW5kLCBTZXNzaW9uQWN0aXZlQ2xpZW50LCBSZXNwb25zZVBhcnRLaW5kLCBST09UX1NUQVRFX1VSSSwgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24sIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUsIGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgYnVpbGRTdWJhZ2VudENoYXRVcmksIGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCBjdXN0b21pemF0aW9uSWQsIGlzU3ViYWdlbnRTZXNzaW9uLCBwYXJzZUNoYXRVcmksIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpLCBDaGF0T3JpZ2luS2luZCwgdHlwZSBDaGFuZ2VzZXRTdGF0ZSwgdHlwZSBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgdHlwZSBNYXJrZG93blJlc3BvbnNlUGFydCwgdHlwZSBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLCB0eXBlIFRvb2xDYWxsUmVzcG9uc2VQYXJ0LCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IHR5cGUgTWVzc2FnZVJlc291cmNlQXR0YWNobWVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0FnZW50LCBTY3JpcHRlZE1vY2tBZ2VudCB9IGZyb20gJy4vbW9ja0FnZW50LmpzJztcbmltcG9ydCB7IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzIH0gZnJvbSAnLi9oaXN0b3J5UmVjb3JkRml4dHVyZXMuanMnO1xuaW1wb3J0IHsgdHlwZSBJU2Vzc2lvbkV2ZW50IH0gZnJvbSAnLi9jb3BpbG90VGVzdEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb29wR2l0U2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmksIGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IHR5cGUgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLCB0eXBlIElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmt0cmVlSXNvbGF0aW9uLCBXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVCB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL3dvcmt0cmVlSXNvbGF0aW9uLmpzJztcbmltcG9ydCB7IEFocEVycm9yQ29kZXMsIEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SLCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElOZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9uZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBMb2FkcyBhIEpTT05MIGZpeHR1cmUgb2YgcmF3IENvcGlsb3QgU0RLIGV2ZW50cywgcnVucyB0aGVtIHRocm91Z2hcbiAqIHtAbGluayBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3Jkc30sIGFuZCByZXR1cm5zIHRoZSByZXN1bHRcbiAqIHN1aXRhYmxlIGZvciBzZXR0aW5nIG9uIHtAbGluayBNb2NrQWdlbnQuc2Vzc2lvbk1lc3NhZ2VzfS4gVGVzdHMgdGhlXG4gKiBmdWxsIHBpcGVsaW5lOiBTREsgZXZlbnRzIFx1MjE5MiBJSGlzdG9yeVJlY29yZCBcdTIxOTIgYnVpbGRUdXJuc0Zyb21IaXN0b3J5IFx1MjE5MlxuICogVHVybltdLlxuICpcbiAqIEZpeHR1cmUgZmlsZXMgbGl2ZSBpbiBgdGVzdC1jYXNlcy9gIGFuZCBhcmUgc2FuaXRpemVkIGNvcGllcyBvZiByZWFsXG4gKiBgZXZlbnRzLmpzb25sYCBmaWxlcyBmcm9tIGB+Ly5jb3BpbG90L3Nlc3Npb24tc3RhdGUvYC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbG9hZEZpeHR1cmVNZXNzYWdlcyhmaXh0dXJlTmFtZTogc3RyaW5nLCBzZXNzaW9uOiBVUkkpIHtcblx0Ly8gUmVzb2x2ZSB0aGUgZml4dHVyZSBmcm9tIHRoZSBzb3VyY2UgdHJlZSAodGVzdC1jYXNlcy8gaXMgbm90IGNvbXBpbGVkIHRvIG91dC8pXG5cdGNvbnN0IHRoaXNGaWxlID0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpO1xuXHQvLyBOYXZpZ2F0ZSBmcm9tIG91dC92cy8uLi4gdG8gc3JjL3ZzLy4uLiBieSByZXBsYWNpbmcgdGhlIG91dC8gcHJlZml4LlxuXHQvLyBVc2UgYSByZWdleCB0aGF0IGhhbmRsZXMgYm90aCAvIGFuZCBcXCBzZXBhcmF0b3JzIGZvciBXaW5kb3dzIGNvbXBhdC5cblx0Y29uc3Qgc3JjRmlsZSA9IHRoaXNGaWxlLnJlcGxhY2UoL1svXFxcXF1vdXRbL1xcXFxdLywgKG0pID0+IG0ucmVwbGFjZSgnb3V0JywgJ3NyYycpKTtcblx0Y29uc3QgbGFzdFNlcCA9IE1hdGgubWF4KHNyY0ZpbGUubGFzdEluZGV4T2YoJy8nKSwgc3JjRmlsZS5sYXN0SW5kZXhPZignXFxcXCcpKTtcblx0Y29uc3QgZml4dHVyZURpciA9IHNyY0ZpbGUuc3Vic3RyaW5nKDAsIGxhc3RTZXApO1xuXHRjb25zdCBzZXAgPSBzcmNGaWxlLmluY2x1ZGVzKCdcXFxcJykgPyAnXFxcXCcgOiAnLyc7XG5cdGNvbnN0IHJhdyA9IHJlYWRGaWxlU3luYyhgJHtmaXh0dXJlRGlyfSR7c2VwfXRlc3QtY2FzZXMke3NlcH0ke2ZpeHR1cmVOYW1lfWAsICd1dGYtOCcpO1xuXHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IHJhdy50cmltKCkuc3BsaXQoJ1xcbicpLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkpO1xuXHRyZXR1cm4gbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xufVxuXG5jbGFzcyBUZXN0Q29waWxvdEFwaVNlcnZpY2UgaW1wbGVtZW50cyBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB1dGlsaXR5Q2FsbHM6IHsgdG9rZW46IHN0cmluZzsgcmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0OyBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfVtdID0gW107XG5cdHJlc3BvbnNlID0gJ0dlbmVyYXRlZCBzZXNzaW9uIHRpdGxlJztcblx0cmVzcG9uc2VQcm9taXNlOiBQcm9taXNlPHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgX3JlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKF9naXRodWJUb2tlbjogc3RyaW5nLCBfcmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsIF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgcmVzcG9uc2VzKCk6IFByb21pc2U8UmVzcG9uc2U+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpOyB9XG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCgpIHsgcmV0dXJuIHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXRpbGl0eUNoYXRDb21wbGV0aW9uKGdpdGh1YlRva2VuOiBzdHJpbmcsIHJlcXVlc3Q6IElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCwgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLnV0aWxpdHlDYWxscy5wdXNoKHsgdG9rZW46IGdpdGh1YlRva2VuLCByZXF1ZXN0LCBvcHRpb25zIH0pO1xuXHRcdGlmICh0aGlzLmVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmVycm9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5yZXNwb25zZVByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc3BvbnNlUHJvbWlzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVzcG9uc2U7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50U2VydmljZSAobm9kZSBkaXNwYXRjaGVyKScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHNlcnZpY2U6IEFnZW50U2VydmljZTtcblx0bGV0IGNvcGlsb3RBZ2VudDogTW9ja0FnZW50O1xuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgbnVsbFNlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0bnVsbFNlc3Npb25EYXRhU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldFNlc3Npb25EYXRhRGlyOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdGdldFNlc3Npb25EYXRhRGlyQnlJZDogKCkgPT4gVVJJLnBhcnNlKCdpbm1lbW9yeTovc2Vzc2lvbi1kYXRhJyksXG5cdFx0XHRvcGVuRGF0YWJhc2U6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0ZGVsZXRlU2Vzc2lvbkRhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdG9uV2lsbERlbGV0ZVNlc3Npb25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0d2hlbklkbGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9O1xuXG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0Ly8gU2VlZCBhIGRpcmVjdG9yeSBmb3IgYnJvd3NlRGlyZWN0b3J5IHRlc3RzXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3Rlc3REaXInIH0pKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvdGVzdERpci9maWxlLnR4dCcgfSksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvJykpO1xuXG5cdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgbnVsbFNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRjb3BpbG90QWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb3BpbG90QWdlbnQuZGlzcG9zZSgpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIFByb3ZpZGVyIHJlZ2lzdHJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncmVnaXN0ZXJQcm92aWRlcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlZ2lzdGVycyBhIHByb3ZpZGVyIHN1Y2Nlc3NmdWxseScsICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Ly8gTm8gdGhyb3cgLSBzdWNjZXNzXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvd3Mgb24gZHVwbGljYXRlIHByb3ZpZGVyIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgZHVwbGljYXRlID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBkdXBsaWNhdGUuZGlzcG9zZSgpKSk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihkdXBsaWNhdGUpLCAvYWxyZWFkeSByZWdpc3RlcmVkLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2dyZWdhdGVzIGFuZCBkZWR1cGxpY2F0ZXMgbmV0d29yayBkaWFnbm9zdGljcyBlbmRwb2ludHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlckE6IElBZ2VudCA9IGNvcGlsb3RBZ2VudDtcblx0XHRcdHByb3ZpZGVyQS5nZXROZXR3b3JrRGlhZ25vc3RpY3NFbmRwb2ludHMgPSBhc3luYyAoKSA9PiBbXG5cdFx0XHRcdHsgbmFtZTogJ0ZpcnN0JywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScgfSxcblx0XHRcdFx0eyBuYW1lOiAnT3RoZXInLCB1cmw6ICdodHRwczovL290aGVyLmV4YW1wbGUuY29tJyB9LFxuXHRcdFx0XTtcblx0XHRcdHByb3ZpZGVyQS5nZXROZXR3b3JrRGlhZ25vc3RpY3NBY2NvdW50ID0gYXN5bmMgKCkgPT4gJ29jdG9jYXQnO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJCID0gbmV3IE1vY2tBZ2VudCgnb3RoZXInKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcHJvdmlkZXJCLmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJCQ29udHJhY3Q6IElBZ2VudCA9IHByb3ZpZGVyQjtcblx0XHRcdHByb3ZpZGVyQkNvbnRyYWN0LmdldE5ldHdvcmtEaWFnbm9zdGljc0VuZHBvaW50cyA9IGFzeW5jICgpID0+IFtcblx0XHRcdFx0eyBuYW1lOiAnRHVwbGljYXRlJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZmFpbGluZ1Byb3ZpZGVyID0gbmV3IE1vY2tBZ2VudCgnZmFpbGluZycpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBmYWlsaW5nUHJvdmlkZXIuZGlzcG9zZSgpKSk7XG5cdFx0XHRjb25zdCBmYWlsaW5nUHJvdmlkZXJDb250cmFjdDogSUFnZW50ID0gZmFpbGluZ1Byb3ZpZGVyO1xuXHRcdFx0ZmFpbGluZ1Byb3ZpZGVyQ29udHJhY3QuZ2V0TmV0d29ya0RpYWdub3N0aWNzRW5kcG9pbnRzID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3VuYXZhaWxhYmxlJyk7IH07XG5cdFx0XHRjb25zdCBkaWFnbm9zdGljczogSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0SW5mbzogYXN5bmMgKGVuZHBvaW50cywgYWNjb3VudCkgPT4gKHsgdmVyc2lvbjogJ3Rlc3QnLCBvczogJ3Rlc3QnLCBhcmNoOiAndGVzdCcsIGFjY291bnQsIHByb3h5U2V0dGluZ3M6IHt9LCBwcm94eUVudjoge30sIGVuZHBvaW50cyB9KSxcblx0XHRcdFx0ZmV0Y2g6IGFzeW5jIHVybCA9PiAoeyB1cmwgfSksXG5cdFx0XHR9O1xuXHRcdFx0c2VydmljZS5zZXROZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlKGRpYWdub3N0aWNzKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlckEpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyQik7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoZmFpbGluZ1Byb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHNlcnZpY2UuZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWNjb3VudDogaW5mby5hY2NvdW50LCBlbmRwb2ludHM6IGluZm8uZW5kcG9pbnRzIH0sIHtcblx0XHRcdFx0YWNjb3VudDogJ29jdG9jYXQnLFxuXHRcdFx0XHRlbmRwb2ludHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdGaXJzdCcsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20nIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnT3RoZXInLCB1cmw6ICdodHRwczovL290aGVyLmV4YW1wbGUuY29tJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2dyZWdhdGVzIG1hbmFnZWQtc2V0dGluZ3MgZGlhZ25vc3RpY3MgZnJvbSBjYXBhYmxlIHByb3ZpZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQWdlbnQgPSBjb3BpbG90QWdlbnQ7XG5cdFx0XHRwcm92aWRlci5nZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyA9IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdHNvdXJjZTogJ2RldmljZScsXG5cdFx0XHRcdHNlcnZlck1hbmFnZWQ6IGZhbHNlLFxuXHRcdFx0XHRkZXZpY2VNYW5hZ2VkOiB0cnVlLFxuXHRcdFx0XHRmYWlsQ2xvc2VkOiBmYWxzZSxcblx0XHRcdFx0YnlwYXNzUGVybWlzc2lvbnNEaXNhYmxlZDogZmFsc2UsXG5cdFx0XHRcdG1hbmFnZWRLZXlzOiBbJ3Blcm1pc3Npb25zJ10sXG5cdFx0XHRcdHNldHRpbmdzOiB7IHBlcm1pc3Npb25zOiB7IGFsbG93OiBbJ1NoZWxsKGVjaG8gKiknXSB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHVuc3VwcG9ydGVkUHJvdmlkZXIgPSBuZXcgTW9ja0FnZW50KCdvdGhlcicpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB1bnN1cHBvcnRlZFByb3ZpZGVyLmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgZmFpbGluZ1Byb3ZpZGVyID0gbmV3IE1vY2tBZ2VudCgnZmFpbGluZycpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBmYWlsaW5nUHJvdmlkZXIuZGlzcG9zZSgpKSk7XG5cdFx0XHRjb25zdCBmYWlsaW5nUHJvdmlkZXJDb250cmFjdDogSUFnZW50ID0gZmFpbGluZ1Byb3ZpZGVyO1xuXHRcdFx0ZmFpbGluZ1Byb3ZpZGVyQ29udHJhY3QuZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigndW5hdmFpbGFibGUnKTsgfTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcik7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIodW5zdXBwb3J0ZWRQcm92aWRlcik7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoZmFpbGluZ1Byb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgZGlhZ25vc3RpY3MgPSBhd2FpdCBzZXJ2aWNlLmdldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlhZ25vc3RpY3MsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdFx0c25hcHNob3Q6IHtcblx0XHRcdFx0XHRcdHNvdXJjZTogJ2RldmljZScsXG5cdFx0XHRcdFx0XHRzZXJ2ZXJNYW5hZ2VkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGRldmljZU1hbmFnZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRmYWlsQ2xvc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGJ5cGFzc1Blcm1pc3Npb25zRGlzYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0bWFuYWdlZEtleXM6IFsncGVybWlzc2lvbnMnXSxcblx0XHRcdFx0XHRcdHNldHRpbmdzOiB7IHBlcm1pc3Npb25zOiB7IGFsbG93OiBbJ1NoZWxsKGVjaG8gKiknXSB9IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBwcm92aWRlcjogJ2ZhaWxpbmcnLCBlcnJvcjogJ3VuYXZhaWxhYmxlJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBtYW5hZ2VkLXNldHRpbmdzIGRpYWdub3N0aWNzIHRocm91Z2ggdGhlIGxvY2FsIG1hbmFnZW1lbnQgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQWdlbnQgPSBjb3BpbG90QWdlbnQ7XG5cdFx0XHRwcm92aWRlci5nZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyA9IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdHNvdXJjZTogJ2RldmljZScsXG5cdFx0XHRcdHNlcnZlck1hbmFnZWQ6IGZhbHNlLFxuXHRcdFx0XHRkZXZpY2VNYW5hZ2VkOiB0cnVlLFxuXHRcdFx0XHRmYWlsQ2xvc2VkOiBmYWxzZSxcblx0XHRcdFx0YnlwYXNzUGVybWlzc2lvbnNEaXNhYmxlZDogZmFsc2UsXG5cdFx0XHRcdG1hbmFnZWRLZXlzOiBbJ3Blcm1pc3Npb25zJ10sXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcik7XG5cdFx0XHRjb25zdCBtYW5hZ2VtZW50U2VydmljZSA9IG5ldyBBZ2VudEhvc3RNYW5hZ2VtZW50U2VydmljZShzZXJ2aWNlLCB7fSBhcyBJQ29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBtYW5hZ2VtZW50U2VydmljZS5nZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcygpLCBbe1xuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRzbmFwc2hvdDoge1xuXHRcdFx0XHRcdHNvdXJjZTogJ2RldmljZScsXG5cdFx0XHRcdFx0c2VydmVyTWFuYWdlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZGV2aWNlTWFuYWdlZDogdHJ1ZSxcblx0XHRcdFx0XHRmYWlsQ2xvc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRieXBhc3NQZXJtaXNzaW9uc0Rpc2FibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRtYW5hZ2VkS2V5czogWydwZXJtaXNzaW9ucyddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwcyBwcm9ncmVzcyBldmVudHMgdG8gcHJvdG9jb2wgYWN0aW9ucyB2aWEgb25EaWRBY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHQvLyBTdGFydCBhIHR1cm4gc28gdGhlcmUncyBhbiBhY3RpdmUgdHVybiB0byBtYXAgZXZlbnRzIHRvXG5cdFx0XHRzZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDEsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQWN0aW9uKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdoZWxsbycgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVNlc3Npb25Db25maWcgZWNob2VzIGhvc3Qtb3duZWQgd29ya3RyZWUgdmFsdWVzIGFjcm9zcyBpc29sYXRpb24gbW9kZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlcG8nKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRnaXRTZXJ2aWNlLnJldlBhcnNlID0gYXN5bmMgKCkgPT4gJ2hlYWQnO1xuXHRcdGdpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCA9IGFzeW5jICgpID0+ICdmZWF0dXJlJztcblx0XHRnaXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2ggPSBhc3luYyAoKSA9PiAoeyBuYW1lOiAnbWFpbicsIHN0YXJ0UG9pbnQ6ICdtYWluJyB9KTtcblx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIG51bGxTZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlKSk7XG5cdFx0bG9jYWxTZXJ2aWNlLnNldFdvcmt0cmVlSXNvbGF0aW9uKGRpc3Bvc2FibGVzLmFkZChuZXcgV29ya3RyZWVJc29sYXRpb24oXG5cdFx0XHR7IGdlbmVyYXRlQnJhbmNoTmFtZTogYXN5bmMgKCkgPT4gJ2FnZW50cy90ZXN0JyB9LFxuXHRcdFx0Z2l0U2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKSxcblx0XHRcdG51bGxTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0Y29uc3QgaW5jbHVkZUZpbGVzID0gWycuZW52JywgJy5lbnYubG9jYWwnLCAnY29uZmlnLyoqJ107XG5cblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IGxvY2FsU2VydmljZS5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnZmVhdHVyZScsIFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXTogaW5jbHVkZUZpbGVzIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgbG9jYWxTZXJ2aWNlLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInLCBbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc106IGluY2x1ZGVGaWxlcyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3JrdHJlZUJyYW5jaDogd29ya3RyZWUudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSxcblx0XHRcdHdvcmt0cmVlUmVhZE9ubHk6IHdvcmt0cmVlLnNjaGVtYS5wcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdPy5yZWFkT25seSxcblx0XHRcdHdvcmt0cmVlVmFsdWU6IHdvcmt0cmVlLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXSxcblx0XHRcdGZvbGRlclJlYWRPbmx5OiBmb2xkZXIuc2NoZW1hLnByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10/LnJlYWRPbmx5LFxuXHRcdFx0Zm9sZGVyVmFsdWU6IGZvbGRlci52YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10sXG5cdFx0fSwge1xuXHRcdFx0d29ya3RyZWVCcmFuY2g6ICdmZWF0dXJlJyxcblx0XHRcdHdvcmt0cmVlUmVhZE9ubHk6IHRydWUsXG5cdFx0XHR3b3JrdHJlZVZhbHVlOiBpbmNsdWRlRmlsZXMsXG5cdFx0XHRmb2xkZXJSZWFkT25seTogdHJ1ZSxcblx0XHRcdGZvbGRlclZhbHVlOiBpbmNsdWRlRmlsZXMsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gY29uZmlnIGtlZXBzIGhvc3Qtb3duZWQgdmFsdWVzIG91dHNpZGUgcHJvdmlkZXIgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlcG8nKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRnaXRTZXJ2aWNlLnJldlBhcnNlID0gYXN5bmMgKCkgPT4gJ2hlYWQnO1xuXHRcdGdpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCA9IGFzeW5jICgpID0+ICdmZWF0dXJlJztcblx0XHRnaXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2ggPSBhc3luYyAoKSA9PiAoeyBuYW1lOiAnbWFpbicsIHN0YXJ0UG9pbnQ6ICdvcmlnaW4vbWFpbicgfSk7XG5cdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBudWxsU2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdGxvY2FsU2VydmljZS5zZXRXb3JrdHJlZUlzb2xhdGlvbihkaXNwb3NhYmxlcy5hZGQobmV3IFdvcmt0cmVlSXNvbGF0aW9uKFxuXHRcdFx0eyBnZW5lcmF0ZUJyYW5jaE5hbWU6IGFzeW5jICgpID0+ICdhZ2VudHMvdGVzdCcgfSxcblx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCksXG5cdFx0XHRudWxsU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSkpO1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29kZXgnKTtcblx0XHRjb25zdCBwcm92aWRlclJlc29sdmVDb25maWdzOiBBcnJheTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlckNvbXBsZXRpb25Db25maWdzOiBBcnJheTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRhZ2VudC5yZXNvbHZlU2Vzc2lvbkNvbmZpZyA9IGFzeW5jIHBhcmFtcyA9PiB7XG5cdFx0XHRwcm92aWRlclJlc29sdmVDb25maWdzLnB1c2gocGFyYW1zLmNvbmZpZyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ1Byb3ZpZGVyIElzb2xhdGlvbicgfSxcblx0XHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnUHJvdmlkZXIgQnJhbmNoJyB9LFxuXHRcdFx0XHRcdFx0cHJvdmlkZXJTZXR0aW5nOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ1Byb3ZpZGVyIFNldHRpbmcnIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7XG5cdFx0XHRcdFx0Li4ucGFyYW1zLmNvbmZpZyxcblx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnZm9sZGVyJyxcblx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAncHJvdmlkZXItYnJhbmNoJyxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fTtcblx0XHRhZ2VudC5zZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMgPSBhc3luYyBwYXJhbXMgPT4ge1xuXHRcdFx0cHJvdmlkZXJDb21wbGV0aW9uQ29uZmlncy5wdXNoKHBhcmFtcy5jb25maWcpO1xuXHRcdFx0cmV0dXJuIHsgaXRlbXM6IFtdIH07XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IGluaXRpYWwgPSBhd2FpdCBsb2NhbFNlcnZpY2UucmVzb2x2ZVNlc3Npb25Db25maWcoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb2RleCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIHByb3ZpZGVyU2V0dGluZzogJ2luaXRpYWwnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBsb2NhbFNlcnZpY2UucmVzb2x2ZVNlc3Npb25Db25maWcoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb2RleCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdmZWF0dXJlL2NvbmZpZycsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4XTogJ3VzZXJzL3Rlc3QvJyxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdOiBbJy5lbnYnXSxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja106IGZhbHNlLFxuXHRcdFx0XHRwcm92aWRlclNldHRpbmc6ICdzZWxlY3RlZCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IGxvY2FsU2VydmljZS5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvZGV4Jyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ2ZvbGRlcicsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdmZWF0dXJlL2NvbmZpZycsIHByb3ZpZGVyU2V0dGluZzogJ2ZvbGRlcicgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBsb2NhbFNlcnZpY2Uuc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHtcblx0XHRcdHByb3ZpZGVyOiAnY29kZXgnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnZmVhdHVyZS9jb25maWcnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF06ICd1c2Vycy90ZXN0LycsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXTogWycuZW52J10sXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2tdOiBmYWxzZSxcblx0XHRcdFx0cHJvdmlkZXJTZXR0aW5nOiAnY29tcGxldGlvbicsXG5cdFx0XHR9LFxuXHRcdFx0cHJvcGVydHk6ICdwcm92aWRlclNldHRpbmcnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm92aWRlclJlc29sdmVDb25maWdzLFxuXHRcdFx0cHJvdmlkZXJDb21wbGV0aW9uQ29uZmlncyxcblx0XHRcdGluaXRpYWw6IHtcblx0XHRcdFx0aXNvbGF0aW9uOiBpbml0aWFsLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0sXG5cdFx0XHRcdGJyYW5jaERlZmF1bHQ6IGluaXRpYWwuc2NoZW1hLnByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdPy5kZWZhdWx0LFxuXHRcdFx0XHRicmFuY2g6IGluaXRpYWwudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSxcblx0XHRcdFx0cHJvdmlkZXJTZXR0aW5nOiBpbml0aWFsLnZhbHVlcy5wcm92aWRlclNldHRpbmcsXG5cdFx0XHR9LFxuXHRcdFx0c2VsZWN0ZWQ6IHtcblx0XHRcdFx0aXNvbGF0aW9uOiBzZWxlY3RlZC52YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dLFxuXHRcdFx0XHRicmFuY2g6IHNlbGVjdGVkLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0sXG5cdFx0XHRcdGJyYW5jaFByZWZpeDogc2VsZWN0ZWQudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXhdLFxuXHRcdFx0XHRpbmNsdWRlRmlsZXM6IHNlbGVjdGVkLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXSxcblx0XHRcdFx0YnJhbmNoVHJhY2s6IHNlbGVjdGVkLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2tdLFxuXHRcdFx0XHRwcm92aWRlclNldHRpbmc6IHNlbGVjdGVkLnZhbHVlcy5wcm92aWRlclNldHRpbmcsXG5cdFx0XHR9LFxuXHRcdFx0Zm9sZGVyOiB7XG5cdFx0XHRcdGlzb2xhdGlvbjogZm9sZGVyLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0sXG5cdFx0XHRcdGJyYW5jaDogZm9sZGVyLnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0sXG5cdFx0XHRcdHByb3ZpZGVyU2V0dGluZzogZm9sZGVyLnZhbHVlcy5wcm92aWRlclNldHRpbmcsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyUmVzb2x2ZUNvbmZpZ3M6IFtcblx0XHRcdFx0eyBwcm92aWRlclNldHRpbmc6ICdpbml0aWFsJyB9LFxuXHRcdFx0XHR7IHByb3ZpZGVyU2V0dGluZzogJ3NlbGVjdGVkJyB9LFxuXHRcdFx0XHR7IHByb3ZpZGVyU2V0dGluZzogJ2ZvbGRlcicgfSxcblx0XHRcdF0sXG5cdFx0XHRwcm92aWRlckNvbXBsZXRpb25Db25maWdzOiBbeyBwcm92aWRlclNldHRpbmc6ICdjb21wbGV0aW9uJyB9XSxcblx0XHRcdGluaXRpYWw6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2hEZWZhdWx0OiAnbWFpbicsIGJyYW5jaDogJ21haW4nLCBwcm92aWRlclNldHRpbmc6ICdpbml0aWFsJyB9LFxuXHRcdFx0c2VsZWN0ZWQ6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL2NvbmZpZycsIGJyYW5jaFByZWZpeDogJ3VzZXJzL3Rlc3QvJywgaW5jbHVkZUZpbGVzOiBbJy5lbnYnXSwgYnJhbmNoVHJhY2s6IGZhbHNlLCBwcm92aWRlclNldHRpbmc6ICdzZWxlY3RlZCcgfSxcblx0XHRcdGZvbGRlcjogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdmZWF0dXJlJywgcHJvdmlkZXJTZXR0aW5nOiAnZm9sZGVyJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB3b3JrdHJlZSBpc29sYXRpb24gcGVuZGluZyBiZWZvcmUgYSBwcm92aXNpb25hbCBwcm92aWRlciBjYW4gcHJld2FybScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29kZXgnLCAncGVuZGluZy1iZWZvcmUtY3JlYXRlJyk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlcG8nKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRnaXRTZXJ2aWNlLnJldlBhcnNlID0gYXN5bmMgKCkgPT4gJ2hlYWQnO1xuXHRcdGdpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCA9IGFzeW5jICgpID0+ICdmZWF0dXJlJztcblx0XHRnaXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2ggPSBhc3luYyAoKSA9PiAoeyBuYW1lOiAnbWFpbicsIHN0YXJ0UG9pbnQ6ICdtYWluJyB9KTtcblx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIG51bGxTZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBXb3JrdHJlZUlzb2xhdGlvbihcblx0XHRcdHsgZ2VuZXJhdGVCcmFuY2hOYW1lOiBhc3luYyAoKSA9PiAnYWdlbnRzL3Rlc3QnIH0sXG5cdFx0XHRnaXRTZXJ2aWNlLFxuXHRcdFx0bmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpLFxuXHRcdFx0bnVsbFNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXHRcdGxvY2FsU2VydmljZS5zZXRXb3JrdHJlZUlzb2xhdGlvbihpc29sYXRpb24pO1xuXHRcdGNvbnN0IHBlbmRpbmdEdXJpbmdDcmVhdGU6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyQ3JlYXRlQ29uZmlnczogQXJyYXk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+ID0gW107XG5cdFx0bGV0IGZhaWxDcmVhdGUgPSBmYWxzZTtcblx0XHRjbGFzcyBQcmV3YXJtaW5nQWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBpbXBvcnQoJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnKS5JQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxpbXBvcnQoJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnKS5JQWdlbnRDcmVhdGVTZXNzaW9uUmVzdWx0PiB7XG5cdFx0XHRcdHBlbmRpbmdEdXJpbmdDcmVhdGUucHVzaChsb2NhbFNlcnZpY2UuY29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhjb25maWchLnNlc3Npb24hLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0cHJvdmlkZXJDcmVhdGVDb25maWdzLnB1c2goY29uZmlnPy5jb25maWcpO1xuXHRcdFx0XHRpZiAoZmFpbENyZWF0ZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignY3JlYXRlIGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IC4uLmF3YWl0IHN1cGVyLmNyZWF0ZVNlc3Npb24oY29uZmlnKSwgcHJvdmlzaW9uYWw6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgUHJld2FybWluZ0FnZW50KCdjb2RleCcpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cHJvdmlkZXI6ICdjb2RleCcsXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZhaWxlZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdmYWlsZWQtYmVmb3JlLWNyZWF0ZScpO1xuXHRcdGZhaWxDcmVhdGUgPSB0cnVlO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHByb3ZpZGVyOiAnY29kZXgnLFxuXHRcdFx0c2Vzc2lvbjogZmFpbGVkU2Vzc2lvbixcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHRcdGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSxcblx0XHR9KSwgL2NyZWF0ZSBmYWlsZWQvKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0R1cmluZ0NyZWF0ZSxcblx0XHRcdHByb3ZpZGVyQ3JlYXRlQ29uZmlncyxcblx0XHRcdHBlbmRpbmdBZnRlckNyZWF0ZTogbG9jYWxTZXJ2aWNlLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcoc2Vzc2lvbi50b1N0cmluZygpKSxcblx0XHRcdHBlbmRpbmdBZnRlckZhaWx1cmU6IGxvY2FsU2VydmljZS5jb25maWd1cmF0aW9uU2VydmljZS5pc1dvcmtpbmdEaXJlY3RvcnlQZW5kaW5nKGZhaWxlZFNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZ0R1cmluZ0NyZWF0ZTogW3RydWUsIHRydWVdLFxuXHRcdFx0cHJvdmlkZXJDcmVhdGVDb25maWdzOiBbe30sIHt9XSxcblx0XHRcdHBlbmRpbmdBZnRlckNyZWF0ZTogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckZhaWx1cmU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbmNpbGVzIHBlbmRpbmcgd29ya3RyZWUgaXNvbGF0aW9uIHdoZW4gY3JlYXRpbmcgc2Vzc2lvbiBjb25maWcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UobmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKSk7XG5cdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBXb3JrdHJlZUlzb2xhdGlvbihcblx0XHRcdHsgZ2VuZXJhdGVCcmFuY2hOYW1lOiBhc3luYyAoKSA9PiAnYWdlbnRzL3Rlc3QnIH0sXG5cdFx0XHRnaXRTZXJ2aWNlLFxuXHRcdFx0bmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpLFxuXHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cdFx0bG9jYWxTZXJ2aWNlLnNldFdvcmt0cmVlSXNvbGF0aW9uKGlzb2xhdGlvbik7XG5cblx0XHRjbGFzcyBQcm92aXNpb25hbEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnPzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8SUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdD4ge1xuXHRcdFx0XHRyZXR1cm4geyAuLi5hd2FpdCBzdXBlci5jcmVhdGVTZXNzaW9uKGNvbmZpZyksIHByb3Zpc2lvbmFsOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlzaW9uYWxBZ2VudCA9IG5ldyBQcm92aXNpb25hbEFnZW50KCdjb2RleCcpO1xuXHRcdGNvbnN0IHJlYWR5QWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm92aXNpb25hbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVhZHlBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aXNpb25hbEFnZW50KTtcblx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihyZWFkeUFnZW50KTtcblxuXHRcdGNvbnN0IGNyZWF0aW5nU2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHByb3ZpZGVyOiAnY29kZXgnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UvcmVwbycpXSxcblx0XHRcdGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnZm9sZGVyJyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlYWR5U2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS9yZXBvJyldLFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY3JlYXRpbmdJbml0aWFsbHkgPSBsb2NhbFNlcnZpY2UuY29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhjcmVhdGluZ1Nlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgcmVhZHlJbml0aWFsbHkgPSBsb2NhbFNlcnZpY2UuY29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhyZWFkeVNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgY3JlYXRpbmdMaWZlY3ljbGUgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjcmVhdGluZ1Nlc3Npb24udG9TdHJpbmcoKSk/LmxpZmVjeWNsZTtcblx0XHRjb25zdCByZWFkeUxpZmVjeWNsZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHJlYWR5U2Vzc2lvbi50b1N0cmluZygpKT8ubGlmZWN5Y2xlO1xuXG5cdFx0bG9jYWxTZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKGNyZWF0aW5nU2Vzc2lvbi50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScgfSxcblx0XHR9LCAndGVzdC1jbGllbnQnLCAxKTtcblx0XHRjb25zdCBjcmVhdGluZ0FmdGVyV29ya3RyZWUgPSBsb2NhbFNlcnZpY2UuY29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhjcmVhdGluZ1Nlc3Npb24udG9TdHJpbmcoKSk7XG5cblx0XHRsb2NhbFNlcnZpY2UuZGlzcGF0Y2hBY3Rpb24oY3JlYXRpbmdTZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ2ZvbGRlcicgfSxcblx0XHR9LCAndGVzdC1jbGllbnQnLCAyKTtcblx0XHRjb25zdCBjcmVhdGluZ0FmdGVyRm9sZGVyID0gbG9jYWxTZXJ2aWNlLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcoY3JlYXRpbmdTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXG5cdFx0bG9jYWxTZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKHJlYWR5U2Vzc2lvbi50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScgfSxcblx0XHR9LCAndGVzdC1jbGllbnQnLCAzKTtcblx0XHRjb25zdCByZWFkeUFmdGVyV29ya3RyZWUgPSBsb2NhbFNlcnZpY2UuY29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhyZWFkeVNlc3Npb24udG9TdHJpbmcoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0aW5nSW5pdGlhbGx5LFxuXHRcdFx0cmVhZHlJbml0aWFsbHksXG5cdFx0XHRjcmVhdGluZ0xpZmVjeWNsZSxcblx0XHRcdHJlYWR5TGlmZWN5Y2xlLFxuXHRcdFx0Y3JlYXRpbmdBZnRlcldvcmt0cmVlLFxuXHRcdFx0Y3JlYXRpbmdBZnRlckZvbGRlcixcblx0XHRcdHJlYWR5QWZ0ZXJXb3JrdHJlZSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGluZ0luaXRpYWxseTogZmFsc2UsXG5cdFx0XHRyZWFkeUluaXRpYWxseTogZmFsc2UsXG5cdFx0XHRjcmVhdGluZ0xpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGluZyxcblx0XHRcdHJlYWR5TGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0Y3JlYXRpbmdBZnRlcldvcmt0cmVlOiB0cnVlLFxuXHRcdFx0Y3JlYXRpbmdBZnRlckZvbGRlcjogZmFsc2UsXG5cdFx0XHRyZWFkeUFmdGVyV29ya3RyZWU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb3VyY2VSZWFkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbWFwcyBtaXNzaW5nIGZpbGVzIHRvIE5vdEZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbWlzc2luZy50eHQnIH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5yZXNvdXJjZVJlYWQodXJpKSxcblx0XHRcdFx0KGVycm9yOiB1bmtub3duKSA9PiBlcnJvciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3Jcblx0XHRcdFx0XHQmJiBlcnJvci5jb2RlID09PSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kXG5cdFx0XHRcdFx0JiYgZXJyb3IubWVzc2FnZSA9PT0gYENvbnRlbnQgbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWBcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBtYXAgYWxsIHJlYWQgZmFpbHVyZXMgdG8gTm90Rm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy90ZXN0RGlyL2ZpbGUudHh0JyB9KTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVhZEZpbGUgPSBmaWxlU2VydmljZS5yZWFkRmlsZS5iaW5kKGZpbGVTZXJ2aWNlKTtcblx0XHRcdGZpbGVTZXJ2aWNlLnJlYWRGaWxlID0gYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoJ0luamVjdGVkIHVua25vd24gcmVhZCBmYWlsdXJlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsUmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdFx0fTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZmlsZVNlcnZpY2UucmVhZEZpbGUgPSBvcmlnaW5hbFJlYWRGaWxlKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLnJlc291cmNlUmVhZCh1cmkpLFxuXHRcdFx0XHQoZXJyb3I6IHVua25vd24pID0+IGVycm9yIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvclxuXHRcdFx0XHRcdCYmIGVycm9yLmNvZGUgPT09IEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SXG5cdFx0XHRcdFx0JiYgZXJyb3IubWVzc2FnZSA9PT0gYEZhaWxlZCB0byByZWFkIGNvbnRlbnQ6ICR7dXJpLnRvU3RyaW5nKCl9OiBJbmplY3RlZCB1bmtub3duIHJlYWQgZmFpbHVyZWBcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY3JlYXRlU2Vzc2lvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdkaXNwYXRjaEFjdGlvbicsICgpID0+IHtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JDb25kaXRpb24ocHJlZGljYXRlOiAoKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPiwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdFx0aWYgKGF3YWl0IHByZWRpY2F0ZSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1KSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQub2soYXdhaXQgcHJlZGljYXRlKCksIG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHNldHVwVGl0bGVHZW5lcmF0aW9uKGNvcGlsb3RBcGlTZXJ2aWNlOiBUZXN0Q29waWxvdEFwaVNlcnZpY2UpOiBQcm9taXNlPHsgc3ZjOiBBZ2VudFNlcnZpY2U7IGFnZW50OiBNb2NrQWdlbnQ7IHNlc3Npb246IFVSSTsgZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2UgfT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKTtcblx0XHRcdGNvbnN0IHN2YyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0eyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRcdGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRhd2FpdCBzdmMuYXV0aGVudGljYXRlKHtcblx0XHRcdFx0cmVzb3VyY2U6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSxcblx0XHRcdFx0c2NvcGVzOiBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdFx0dG9rZW46ICdnaC10b2tlbicsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzdmMuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRyZXR1cm4geyBzdmMsIGFnZW50LCBzZXNzaW9uLCBkYiB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ2FwcGxpZXMgYW5kIHBlcnNpc3RzIHJvb3QgY29uZmlnIGNoYW5nZXMgZnJvbSBjbGllbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVtcERpciA9IFVSSS5maWxlKG1rZHRlbXBTeW5jKGAke3RtcGRpcigpfS9hZ2VudC1ob3N0LWNvbmZpZy1gKSk7XG5cdFx0XHQvLyBVc2UgYSBsb2NhbCBEaXNwb3NhYmxlU3RvcmUgc28gdGhhdCBzdmMgY2FuIGJlIGV4cGxpY2l0bHkgZGlzcG9zZWRcblx0XHRcdC8vIGJlZm9yZSBjbGVhbmluZyB1cCB0aGUgdGVtcCBkaXJlY3RvcnkuIE9uIFdpbmRvd3MsIHJtU3luYyBmYWlscyB3aXRoXG5cdFx0XHQvLyBFUEVSTSBpZiB0aGUgQWdlbnRTZXJ2aWNlIChhbmQgaXRzIGNoaWxkIEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UpXG5cdFx0XHQvLyBzdGlsbCBob2xkcyByZWZlcmVuY2VzIHdoaWxlIHRoZSBkaXJlY3RvcnkgaXMgYmVpbmcgZGVsZXRlZC5cblx0XHRcdGNvbnN0IGxvY2FsRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByb290Q29uZmlnUmVzb3VyY2UgPSBqb2luUGF0aCh0ZW1wRGlyLCAnYWdlbnQtaG9zdC1jb25maWcuanNvbicpO1xuXHRcdFx0XHRjb25zdCBzdmMgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgbnVsbFNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksIHJvb3RDb25maWdSZXNvdXJjZSkpO1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cblx0XHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IHsgdXJpOiAnZmlsZTovLy9wbHVnaW4tYScsIGRpc3BsYXlOYW1lOiAnUGx1Z2luIEEnIH07XG5cdFx0XHRcdHN2Yy5kaXNwYXRjaEFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB7IGN1c3RvbWl6YXRpb25zOiBbY3VzdG9taXphdGlvbl0gfSxcblx0XHRcdFx0fSwgJ3Rlc3QtY2xpZW50JywgMSk7XG5cblx0XHRcdFx0bGV0IHBlcnNpc3RlZCA9IGZhbHNlO1xuXHRcdFx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDIwOyBhdHRlbXB0KyspIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMocm9vdENvbmZpZ1Jlc291cmNlLmZzUGF0aCwgJ3V0ZjgnKSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0XHRwYXJzZWQuY3VzdG9taXphdGlvbnMsXG5cdFx0XHRcdFx0XHRcdFtjdXN0b21pemF0aW9uXSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRwZXJzaXN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgc2VyaWFsaXplZCByb290LWNvbmZpZyB3cml0ZSB0byBjb21wbGV0ZS5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGF0dGVtcHQgPT09IDE5KSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzc2VydC5vayhwZXJzaXN0ZWQsICdzaG91bGQgcGVyc2lzdCB0aGUgcm9vdCBjb25maWcgY2hhbmdlJyk7XG5cblx0XHRcdFx0Ly8gRHJhaW4gYW55IGluLWZsaWdodCByb290LWNvbmZpZyB3cml0ZSBzbyBpdHMgZmlsZSBoYW5kbGUgaXNcblx0XHRcdFx0Ly8gY2xvc2VkIGJlZm9yZSB3ZSBkZWxldGUgdGhlIHRlbXAgZGlyZWN0b3J5LlxuXHRcdFx0XHRhd2FpdCBzdmMuY29uZmlndXJhdGlvblNlcnZpY2Uud2hlbklkbGUoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRybVN5bmModGVtcERpci5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSwgbWF4UmV0cmllczogMywgcmV0cnlEZWxheTogMTAwIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJhdGVzIGFuZCBwZXJzaXN0cyBhbiBBSSB0aXRsZSBhZnRlciBmaXJzdC10dXJuIGZhbGxiYWNrIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9ICdcIkZpeCBUeXBlU2NyaXB0IGNvbXBpbGUgZXJyb3JzLlwiJztcblx0XHRcdGNvbnN0IHsgc3ZjLCBzZXNzaW9uLCBkYiB9ID0gYXdhaXQgc2V0dXBUaXRsZUdlbmVyYXRpb24oY29waWxvdEFwaVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGl0bGVBY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN2Yy5vbkRpZEFjdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHRpdGxlQWN0aW9ucy5wdXNoKGUuYWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdmMuZGlzcGF0Y2hBY3Rpb24oXG5cdFx0XHRcdGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSxcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAndHVybi0xJywgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJywgbWVzc2FnZTogeyB0ZXh0OiAnUGxlYXNlIGhlbHAgbWUgZml4IHRoZSBUeXBlU2NyaXB0IGNvbXBpbGUgZXJyb3JzJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDEsXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IHN2Yy5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlID09PSAnRml4IFR5cGVTY3JpcHQgY29tcGlsZSBlcnJvcnMnLCAnZ2VuZXJhdGVkIHRpdGxlIHNob3VsZCBiZSBhcHBsaWVkJyk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpICE9PSB1bmRlZmluZWQsICdnZW5lcmF0ZWQgdGl0bGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dGl0bGVzOiB0aXRsZUFjdGlvbnMsXG5cdFx0XHRcdHRva2VuOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnRva2VuLFxuXHRcdFx0XHRwcm9tcHRJbmNsdWRlc1VzZXJUZXh0OiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnJlcXVlc3QubWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnUGxlYXNlIGhlbHAgbWUgZml4IHRoZSBUeXBlU2NyaXB0IGNvbXBpbGUgZXJyb3JzJykpLFxuXHRcdFx0XHRwZXJzaXN0ZWRUaXRsZTogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRpdGxlczogWydQbGVhc2UgaGVscCBtZSBmaXggdGhlIFR5cGVTY3JpcHQgY29tcGlsZSBlcnJvcnMnLCAnRml4IFR5cGVTY3JpcHQgY29tcGlsZSBlcnJvcnMnXSxcblx0XHRcdFx0dG9rZW46ICdnaC10b2tlbicsXG5cdFx0XHRcdHByb21wdEluY2x1ZGVzVXNlclRleHQ6IHRydWUsXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiAnRml4IFR5cGVTY3JpcHQgY29tcGlsZSBlcnJvcnMnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgZmFsbGJhY2sgdGl0bGUgd2hlbiBBSSB0aXRsZSBnZW5lcmF0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5lcnJvciA9IG5ldyBFcnJvcigndGl0bGUgZmFpbGVkJyk7XG5cdFx0XHRjb25zdCB7IHN2Yywgc2Vzc2lvbiwgZGIgfSA9IGF3YWl0IHNldHVwVGl0bGVHZW5lcmF0aW9uKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdFx0c3ZjLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJ0V4cGxhaW4gd29ya3NwYWNlIHNlYXJjaCBpbmRleGluZycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9LFxuXHRcdFx0XHQndGVzdC1jbGllbnQnLCAxLFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoID09PSAxLCAndGl0bGUgZ2VuZXJhdGlvbiBzaG91bGQgYmUgYXR0ZW1wdGVkJyk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRpdGxlOiBzdmMuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdFx0cGVyc2lzdGVkVGl0bGU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0aXRsZTogJ0V4cGxhaW4gd29ya3NwYWNlIHNlYXJjaCBpbmRleGluZycsXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG92ZXJ3cml0ZSBhIG1hbnVhbCByZW5hbWUgd2l0aCBkZWxheWVkIEFJIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgcmVzb2x2ZVRpdGxlITogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZVByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZVRpdGxlID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRjb25zdCB7IHN2Yywgc2Vzc2lvbiwgZGIgfSA9IGF3YWl0IHNldHVwVGl0bGVHZW5lcmF0aW9uKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdFx0c3ZjLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJ0NyZWF0ZSB0ZXN0cyBmb3IgdGVybWluYWwgcGVyc2lzdGVuY2UnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfSxcblx0XHRcdFx0J3Rlc3QtY2xpZW50JywgMSxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKCgpID0+IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggPT09IDEsICd0aXRsZSBnZW5lcmF0aW9uIHNob3VsZCBiZSBpbiBmbGlnaHQnKTtcblxuXHRcdFx0c3ZjLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRzZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ01hbnVhbCB0aXRsZScgfSxcblx0XHRcdFx0J3Rlc3QtY2xpZW50JywgMixcblx0XHRcdCk7XG5cdFx0XHRyZXNvbHZlVGl0bGUoJ1Rlcm1pbmFsIHBlcnNpc3RlbmNlIHRlc3RzJyk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQ29uZGl0aW9uKGFzeW5jICgpID0+IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpID09PSAnTWFudWFsIHRpdGxlJywgJ21hbnVhbCB0aXRsZSBzaG91bGQgYmUgcGVyc2lzdGVkJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0aXRsZTogc3ZjLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUsXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGl0bGU6ICdNYW51YWwgdGl0bGUnLFxuXHRcdFx0XHRwZXJzaXN0ZWRUaXRsZTogJ01hbnVhbCB0aXRsZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fib3J0cyBwZW5kaW5nIEFJIHRpdGxlIGdlbmVyYXRpb24gd2hlbiBzZXNzaW9uIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgcmVzb2x2ZVRpdGxlITogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZVByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZVRpdGxlID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRjb25zdCB7IHN2Yywgc2Vzc2lvbiwgZGIgfSA9IGF3YWl0IHNldHVwVGl0bGVHZW5lcmF0aW9uKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdFx0c3ZjLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJ0ludmVzdGlnYXRlIGZsYWt5IHRlcm1pbmFsIHRlc3RzJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDEsXG5cdFx0XHQpO1xuXHRcdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHMubGVuZ3RoID09PSAxLCAndGl0bGUgZ2VuZXJhdGlvbiBzaG91bGQgYmUgaW4gZmxpZ2h0Jyk7XG5cblx0XHRcdGF3YWl0IHN2Yy5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdHJlc29sdmVUaXRsZSgnRmxha3kgdGVybWluYWwgdGVzdHMnKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWJvcnRlZDogY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdLm9wdGlvbnM/LnNpZ25hbD8uYWJvcnRlZCxcblx0XHRcdFx0c3RhdGU6IHN2Yy5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWJvcnRlZDogdHJ1ZSxcblx0XHRcdFx0c3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVyc2lzdGVkVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJhdGVzIGFuIEFJIHRpdGxlIGZvciBmb3JrZWQgc2Vzc2lvbnMgZnJvbSB0aGUgZm9ya2VkIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ1NvdXJjZSBnZW5lcmF0ZWQgdGl0bGUnO1xuXHRcdFx0Y29uc3QgeyBzdmMsIHNlc3Npb246IHNvdXJjZVNlc3Npb24gfSA9IGF3YWl0IHNldHVwVGl0bGVHZW5lcmF0aW9uKGNvcGlsb3RBcGlTZXJ2aWNlKTtcblxuXHRcdFx0c3ZjLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZVNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3NvdXJjZS10dXJuJywgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJywgbWVzc2FnZTogeyB0ZXh0OiAnU2VlZCBmb3JrIHRpdGxlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDEsXG5cdFx0XHQpO1xuXHRcdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiBzdmMuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzb3VyY2VTZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSA9PT0gJ1NvdXJjZSBnZW5lcmF0ZWQgdGl0bGUnLCAnc291cmNlIGdlbmVyYXRlZCB0aXRsZSBzaG91bGQgYmUgYXBwbGllZCcpO1xuXHRcdFx0c3ZjLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZVNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICdzb3VyY2UtdHVybicsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDIsXG5cdFx0XHQpO1xuXHRcdFx0YXdhaXQgd2FpdEZvckNvbmRpdGlvbigoKSA9PiAoc3ZjLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc291cmNlU2Vzc2lvbi50b1N0cmluZygpKT8udHVybnMubGVuZ3RoID8/IDApID09PSAxLCAnc291cmNlIHR1cm4gc2hvdWxkIGJlIGNvbXBsZXRlIGJlZm9yZSBmb3JraW5nJyk7XG5cblx0XHRcdC8vIFRoZSBmb3JrIGluaGVyaXRzIGEgYEZvcmtlZDogXHUyMDI2YCBwbGFjZWhvbGRlciwgdGhlbiByZWdlbmVyYXRlcyBhXG5cdFx0XHQvLyBjb250ZW50LWRlcml2ZWQgdGl0bGUgZnJvbSB0aGUgY29waWVkIGNoYXQuXG5cdFx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9ICdGb3JrZWQgYnJhbmNoIHRpdGxlJztcblx0XHRcdGNvbnN0IGZvcmtlZFNlc3Npb24gPSBhd2FpdCBzdmMuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGZvcms6IHtcblx0XHRcdFx0XHRzZXNzaW9uOiBzb3VyY2VTZXNzaW9uLFxuXHRcdFx0XHRcdHR1cm5JbmRleDogMCxcblx0XHRcdFx0XHR0dXJuSWQ6ICdzb3VyY2UtdHVybicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHdhaXRGb3JDb25kaXRpb24oKCkgPT4gc3ZjLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZm9ya2VkU2Vzc2lvbi50b1N0cmluZygpKT8udGl0bGUgPT09ICdGb3JrZWQgYnJhbmNoIHRpdGxlJywgJ2ZvcmtlZCBzZXNzaW9uIHNob3VsZCBnZXQgYSBjb250ZW50LWdlbmVyYXRlZCB0aXRsZScpO1xuXG5cdFx0XHRjb25zdCBmb3JrZWRDYWxsID0gY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzW2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGggLSAxXTtcblx0XHRcdGNvbnN0IHVzZXJNZXNzYWdlID0gZm9ya2VkQ2FsbC5yZXF1ZXN0Lm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLnJvbGUgPT09ICd1c2VyJyk/LmNvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dGl0bGU6IHN2Yy5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGZvcmtlZFNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0XHR1dGlsaXR5Q2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGluY2x1ZGVzRm9ya2VkQ2hhdDogdXNlck1lc3NhZ2UuaW5jbHVkZXMoJ1NlZWQgZm9yayB0aXRsZScpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0aXRsZTogJ0ZvcmtlZCBicmFuY2ggdGl0bGUnLFxuXHRcdFx0XHR1dGlsaXR5Q2FsbHM6IDIsXG5cdFx0XHRcdGluY2x1ZGVzRm9ya2VkQ2hhdDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGF0dGFjaG1lbnQgcmV3cml0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd1c2VyLW1lc3NhZ2UgYXR0YWNobWVudCByZXdyaXRpbmcnLCAoKSA9PiB7XG5cblx0XHQvKipcblx0XHQgKiBTZXRzIHVwIGFuIHtAbGluayBBZ2VudFNlcnZpY2V9IGJhY2tlZCBieSBhbiBpbi1tZW1vcnkgZmlsZSBzeXN0ZW1cblx0XHQgKiBhbmQgYSB7QGxpbmsgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlfSB0aGF0IHBvaW50cyBhdCBhIGZpeGVkXG5cdFx0ICogZGlyZWN0b3J5LiBSZXR1cm5zIHRoZSB3aXJlZC11cCBzZXJ2aWNlIGFuZCB0aGUgVVJJIHVuZGVyIHdoaWNoXG5cdFx0ICogc25hcHNob3R0ZWQgYXR0YWNobWVudHMgc2hvdWxkIGxhbmQuXG5cdFx0ICovXG5cdFx0YXN5bmMgZnVuY3Rpb24gc2V0dXAoKTogUHJvbWlzZTx7XG5cdFx0XHRzdmM6IEFnZW50U2VydmljZTtcblx0XHRcdGFnZW50OiBNb2NrQWdlbnQ7XG5cdFx0XHRzZXNzaW9uOiBVUkk7XG5cdFx0XHRhdHRhY2htZW50c1Jvb3Q6IFVSSTtcblx0XHRcdHdhcm5pbmdzOiBzdHJpbmdbXTtcblx0XHR9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YURpciA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3Nlc3Npb24tZGF0YScgfSk7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50c1Jvb3QgPSBqb2luUGF0aChzZXNzaW9uRGF0YURpciwgJ2F0dGFjaG1lbnRzJyk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoYXR0YWNobWVudHNSb290KTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSgpO1xuXHRcdFx0Ly8gT3ZlcnJpZGUgZ2V0U2Vzc2lvbkRhdGFEaXIgc28gdGhlIHJld3JpdGVyIHdyaXRlcyB1bmRlciBvdXJcblx0XHRcdC8vIGluLW1lbW9yeSBmaWxlIHN5c3RlbSBpbnN0ZWFkIG9mIHRoZSBoZWxwZXIncyBkZWZhdWx0IHBhdGguXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UuZ2V0U2Vzc2lvbkRhdGFEaXIgPSAoKSA9PiBzZXNzaW9uRGF0YURpcjtcblx0XHRcdGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0XHRcdFx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHsgd2FybmluZ3MucHVzaChtZXNzYWdlKTsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHN2YyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc3ZjLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0cmV0dXJuIHsgc3ZjLCBhZ2VudCwgc2Vzc2lvbiwgYXR0YWNobWVudHNSb290LCB3YXJuaW5ncyB9O1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGRpc3BhdGNoVHVybkFuZFdhaXQoc3ZjOiBBZ2VudFNlcnZpY2UsIGFnZW50OiBNb2NrQWdlbnQsIHNlc3Npb246IFVSSSwgYXR0YWNobWVudHM6IE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnRbXSB8IHsgdHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2U7IGxhYmVsOiBzdHJpbmc7IGRhdGE6IHN0cmluZzsgY29udGVudFR5cGU6IHN0cmluZzsgZGlzcGxheUtpbmQ/OiBzdHJpbmcgfVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRzdmMuZGlzcGF0Y2hBY3Rpb24oXG5cdFx0XHRcdGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGF0dGFjaG1lbnRzOiBhdHRhY2htZW50cyBhcyBuZXZlciB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQndGVzdC1jbGllbnQnLCAxLFxuXHRcdFx0KTtcblx0XHRcdC8vIGRpc3BhdGNoQWN0aW9uIHF1ZXVlcyBhbiBhc3luYyByZXdyaXRlIGFuZCB0aGUgc2lkZS1lZmZlY3Rcblx0XHRcdC8vIGhhbmRsZXIgaXMgaW52b2tlZCBmcm9tIHRoZSBzYW1lIGNvbnRpbnVhdGlvbjsgcG9sbCB1bnRpbCB0aGVcblx0XHRcdC8vIGFnZW50IGhhcyBvYnNlcnZlZCB0aGUgKHJld3JpdHRlbikgc2VuZE1lc3NhZ2UuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwICYmIGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoID09PSAwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdzbmFwc2hvdHMgRW1iZWRkZWRSZXNvdXJjZSBhdHRhY2htZW50cyB0byBkaXNrIGFuZCByZXdyaXRlcyB0byBhIFJlc291cmNlIFVSSSB1bmRlciB0aGUgc2Vzc2lvbiBhdHRhY2htZW50cyBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN2YywgYWdlbnQsIHNlc3Npb24sIGF0dGFjaG1lbnRzUm9vdCB9ID0gYXdhaXQgc2V0dXAoKTtcblx0XHRcdGNvbnN0IHBuZyA9IG5ldyBVaW50OEFycmF5KFsweDg5LCAweDUwLCAweDRlLCAweDQ3LCAweDBkLCAweDBhLCAweDFhLCAweDBhXSk7XG5cblx0XHRcdGF3YWl0IGRpc3BhdGNoVHVybkFuZFdhaXQoc3ZjLCBhZ2VudCwgc2Vzc2lvbiwgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiAncGFzdGUucG5nJyxcblx0XHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAocG5nKSksXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdpbWFnZScsXG5cdFx0XHR9IGFzIG5ldmVyXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCByZXdyaXR0ZW4gPSBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLmF0dGFjaG1lbnRzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJld3JpdHRlbj8ubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IGEgPSByZXdyaXR0ZW5bMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS50eXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGEudHlwZSAhPT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKSB7IHJldHVybjsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGFiZWwsICdwYXN0ZS5wbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLmRpc3BsYXlLaW5kLCAnaW1hZ2UnKTtcblx0XHRcdGFzc2VydC5vayhhLnVyaS5zdGFydHNXaXRoKGF0dGFjaG1lbnRzUm9vdC50b1N0cmluZygpICsgJy8nKSwgYGF0dGFjaG1lbnQgdXJpICR7YS51cml9IHNob3VsZCBiZSB1bmRlciAke2F0dGFjaG1lbnRzUm9vdC50b1N0cmluZygpfS9gKTtcblx0XHRcdC8vIEZpbGUgb24gZGlzayBob2xkcyBleGFjdGx5IHRoZSBvcmlnaW5hbCBieXRlc1xuXHRcdFx0Y29uc3Qgd3JpdHRlbiA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5wYXJzZShhLnVyaSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ud3JpdHRlbi52YWx1ZS5idWZmZXJdLCBbLi4ucG5nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgZXhpc3RpbmcgZGlzcGxheUtpbmQgLyByYW5nZSAvIHNlbGVjdGlvbiAvIF9tZXRhIG9uIHJld3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN2YywgYWdlbnQsIHNlc3Npb24gfSA9IGF3YWl0IHNldHVwKCk7XG5cdFx0XHRjb25zdCByYW5nZSA9IHsgc3RhcnQ6IHsgbGluZTogMSwgY2hhcmFjdGVyOiAwIH0sIGVuZDogeyBsaW5lOiAxLCBjaGFyYWN0ZXI6IDQgfSB9O1xuXG5cdFx0XHRhd2FpdCBkaXNwYXRjaFR1cm5BbmRXYWl0KHN2YywgYWdlbnQsIHNlc3Npb24sIFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5FbWJlZGRlZFJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogJ25vdGUudHh0Jyxcblx0XHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FscGhhXFxuYmV0YVxcbmdhbW1hJykpLFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuXHRcdFx0XHQvLyBFbWJlZGRlZFJlc291cmNlIGNhcnJpZXMgb3B0aW9uYWwgc2VsZWN0aW9uIHRvb1xuXHRcdFx0XHQvLyAodGV4dHVhbCByZXNvdXJjZXMgb25seSk7IG1ha2Ugc3VyZSB0aGUgcmV3cml0ZXIgY29waWVzIGl0LlxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ3NlbGVjdGlvbicsXG5cdFx0XHR9IGFzIG5ldmVyXSk7XG5cblx0XHRcdGNvbnN0IHJld3JpdHRlbiA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHMhWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJld3JpdHRlbi50eXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHJld3JpdHRlbi50eXBlICE9PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpIHsgcmV0dXJuOyB9XG5cdFx0XHQvLyBgZGlzcGxheUtpbmRgIGlzIHByZXNlcnZlZCBhcy1pcyBmcm9tIHRoZSBvcmlnaW5hbCBhdHRhY2htZW50LlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJld3JpdHRlbi5kaXNwbGF5S2luZCwgJ3NlbGVjdGlvbicpO1xuXG5cdFx0XHR2b2lkIHJhbmdlOyAvLyBzZWxlY3Rpb24gcm91bmQtdHJpcCBvbiBFbWJlZGRlZFJlc291cmNlIGlzIGNvdmVyZWQgYnkgdGhlIG5leHQgdGVzdFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc25hcHNob3RzIFJlc291cmNlIGF0dGFjaG1lbnRzIGJ5IHJlYWRpbmcgdGhlIG9yaWdpbmFsIGZpbGUgYW5kIHJld3JpdGluZyB0byBhIGxvY2FsIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzdmMsIGFnZW50LCBzZXNzaW9uLCBhdHRhY2htZW50c1Jvb3QsIHdhcm5pbmdzIH0gPSBhd2FpdCBzZXR1cCgpO1xuXHRcdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlL3NvdXJjZS50eHQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnaGVsbG8gd29ybGQnKSk7XG5cblx0XHRcdGF3YWl0IGRpc3BhdGNoVHVybkFuZFdhaXQoc3ZjLCBhZ2VudCwgc2Vzc2lvbiwgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHR1cmk6IHNvdXJjZVVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogJ3NvdXJjZS50eHQnLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgcmV3cml0dGVuID0gYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5hdHRhY2htZW50cyFbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV3cml0dGVuLnR5cGUsIE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSk7XG5cdFx0XHRpZiAocmV3cml0dGVuLnR5cGUgIT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSkgeyByZXR1cm47IH1cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXdyaXR0ZW4udXJpLCBzb3VyY2VVcmkudG9TdHJpbmcoKSwgYHNob3VsZCBiZSByZXdyaXR0ZW4gdG8gdGhlIHNuYXBzaG90IFVSSTsgd2FybmluZ3M9JHtKU09OLnN0cmluZ2lmeSh3YXJuaW5ncyl9OyBnb3QgJHtyZXdyaXR0ZW4udXJpfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKHJld3JpdHRlbi51cmkuc3RhcnRzV2l0aChhdHRhY2htZW50c1Jvb3QudG9TdHJpbmcoKSArICcvJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJld3JpdHRlbi5sYWJlbCwgJ3NvdXJjZS50eHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXdyaXR0ZW4uZGlzcGxheUtpbmQsICdkb2N1bWVudCcpO1xuXG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5wYXJzZShyZXdyaXR0ZW4udXJpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3QudmFsdWUudG9TdHJpbmcoKSwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBleGlzdGluZyBmaWxlOi8vIFJlc291cmNlIGF0dGFjaG1lbnRzIHVuY2hhbmdlZCAoIzMxOTMxNCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN2YywgYWdlbnQsIHNlc3Npb24gfSA9IGF3YWl0IHNldHVwKCk7XG5cdFx0XHQvLyBSZWdpc3RlciBhIGZpbGUtc2NoZW1lIHByb3ZpZGVyIHNvIHRoZSBhdHRhY2htZW50IFVSSSByZXNvbHZlcyB0b1xuXHRcdFx0Ly8gYW4gZXhpc3RpbmcgZmlsZSBvbiB0aGUgYWdlbnQgaG9zdCBzaWRlLlxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9ob3N0L3NvdXJjZS50eHQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGZpbGVVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ29uIGhvc3QnKSk7XG5cblx0XHRcdGF3YWl0IGRpc3BhdGNoVHVybkFuZFdhaXQoc3ZjLCBhZ2VudCwgc2Vzc2lvbiwgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHR1cmk6IGZpbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdzb3VyY2UudHh0Jyxcblx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcsXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5hdHRhY2htZW50cywgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHR1cmk6IGZpbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdzb3VyY2UudHh0Jyxcblx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgc2VsZWN0aW9uIHJhbmdlIG9uIFJlc291cmNlIHJld3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN2YywgYWdlbnQsIHNlc3Npb24sIGF0dGFjaG1lbnRzUm9vdCB9ID0gYXdhaXQgc2V0dXAoKTtcblx0XHRcdGNvbnN0IHNvdXJjZVVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZS9zZWwudHh0JyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FscGhhXFxuYmV0YVxcbmdhbW1hJykpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB7IHN0YXJ0OiB7IGxpbmU6IDEsIGNoYXJhY3RlcjogMCB9LCBlbmQ6IHsgbGluZTogMSwgY2hhcmFjdGVyOiA0IH0gfTtcblxuXHRcdFx0YXdhaXQgZGlzcGF0Y2hUdXJuQW5kV2FpdChzdmMsIGFnZW50LCBzZXNzaW9uLCBbe1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdHVyaTogc291cmNlVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiAnc2VsLnR4dCcsXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiAnc2VsZWN0aW9uJyxcblx0XHRcdFx0c2VsZWN0aW9uOiB7IHJhbmdlIH0sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IHJld3JpdHRlbiA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHMhWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJld3JpdHRlbi50eXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHJld3JpdHRlbi50eXBlICE9PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQub2socmV3cml0dGVuLnVyaS5zdGFydHNXaXRoKGF0dGFjaG1lbnRzUm9vdC50b1N0cmluZygpICsgJy8nKSwgJ3Nob3VsZCBiZSByZXdyaXR0ZW4gdG8gYSBzbmFwc2hvdCBVUkknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV3cml0dGVuLnNlbGVjdGlvbj8ucmFuZ2UsIHJhbmdlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXdyaXR0ZW4uZGlzcGxheUtpbmQsICdzZWxlY3Rpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyBkaXJlY3RvcnkgUmVzb3VyY2UgYXR0YWNobWVudHMgdGhyb3VnaCB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN2YywgYWdlbnQsIHNlc3Npb24gfSA9IGF3YWl0IHNldHVwKCk7XG5cdFx0XHRjb25zdCBkaXJVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UvZGlyJyB9KTtcblxuXHRcdFx0YXdhaXQgZGlzcGF0Y2hUdXJuQW5kV2FpdChzdmMsIGFnZW50LCBzZXNzaW9uLCBbe1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdHVyaTogZGlyVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiAnZGlyJyxcblx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdkaXJlY3RvcnknLFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHMsIFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0dXJpOiBkaXJVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdkaXInLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ2RpcmVjdG9yeScsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZS1zbmFwc2hvdCBhdHRhY2htZW50cyB0aGF0IGFscmVhZHkgcG9pbnQgdW5kZXIgdGhlIHNlc3Npb24gYXR0YWNobWVudHMgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzdmMsIGFnZW50LCBzZXNzaW9uLCBhdHRhY2htZW50c1Jvb3QgfSA9IGF3YWl0IHNldHVwKCk7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGpvaW5QYXRoKGF0dGFjaG1lbnRzUm9vdCwgJ3ByZXZpb3VzLWlkJywgJ25vdGUudHh0Jyk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZXhpc3RpbmcsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FscmVhZHkgc25hcHNob3R0ZWQnKSk7XG5cblx0XHRcdGF3YWl0IGRpc3BhdGNoVHVybkFuZFdhaXQoc3ZjLCBhZ2VudCwgc2Vzc2lvbiwgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHR1cmk6IGV4aXN0aW5nLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiAnbm90ZS50eHQnLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdH1dKTtcblxuXHRcdFx0Y29uc3QgYSA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHM/LlswXTtcblx0XHRcdGFzc2VydC5vayhhICYmIGEudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnVyaSwgZXhpc3RpbmcudG9TdHJpbmcoKSwgJ3NlY29uZC1wYXNzIHJld3JpdGUgc2hvdWxkIGJlIGEgbm8tb3AnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyB0aGUgb3JpZ2luYWwgYXR0YWNobWVudCB3aGVuIHRoZSBzb3VyY2UgY2Fubm90IGJlIHJlYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHN2YywgYWdlbnQsIHNlc3Npb24gfSA9IGF3YWl0IHNldHVwKCk7XG5cdFx0XHRjb25zdCBtaXNzaW5nVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlL21pc3NpbmcudHh0JyB9KTtcblxuXHRcdFx0YXdhaXQgZGlzcGF0Y2hUdXJuQW5kV2FpdChzdmMsIGFnZW50LCBzZXNzaW9uLCBbe1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdHVyaTogbWlzc2luZ1VyaS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogJ21pc3NpbmcudHh0Jyxcblx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcsXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5hdHRhY2htZW50cywgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHR1cmk6IG1pc3NpbmdVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdtaXNzaW5nLnR4dCcsXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY3JlYXRlU2Vzc2lvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NyZWF0ZXMgc2Vzc2lvbiB2aWEgc3BlY2lmaWVkIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFnZW50U2Vzc2lvbi5wcm92aWRlcihzZXNzaW9uKSwgJ2NvcGlsb3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRlcyB3b3JraW5nIGRpcmVjdG9yaWVzIGZvciBhIHByb3ZpZGVyIHdpdGhvdXQgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjbGFzcyBDYXB0dXJpbmdBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRcdGxhc3RDb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgX2NhcHM6IGltcG9ydCgnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcycpLklBZ2VudENhcGFiaWxpdGllcyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHN1cGVyKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBnZXREZXNjcmlwdG9yKCkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLnN1cGVyLmdldERlc2NyaXB0b3IoKSwgY2FwYWJpbGl0aWVzOiB0aGlzLl9jYXBzIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVTZXNzaW9uUmVzdWx0PiB7XG5cdFx0XHRcdFx0dGhpcy5sYXN0Q29uZmlnID0gY29uZmlnO1xuXHRcdFx0XHRcdHJldHVybiBzdXBlci5jcmVhdGVTZXNzaW9uKGNvbmZpZyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2luZ2xlID0gbmV3IENhcHR1cmluZ0FnZW50KCdzaW5nbGUnLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgbXVsdGkgPSBuZXcgQ2FwdHVyaW5nQWdlbnQoJ211bHRpJywgeyBtdWx0aXBsZVdvcmtpbmdEaXJlY3RvcmllczogeyBpbW11dGFibGVQcmltYXJ5OiB0cnVlIH0gfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNpbmdsZS5kaXNwb3NlKCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbXVsdGkuZGlzcG9zZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoc2luZ2xlKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihtdWx0aSk7XG5cblx0XHRcdGNvbnN0IGRpcnMgPSBbVVJJLmZpbGUoJy9yZXBvQScpLCBVUkkuZmlsZSgnL3JlcG9CJyksIFVSSS5maWxlKCcvcmVwb0MnKV07XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ3NpbmdsZScsIHdvcmtpbmdEaXJlY3RvcmllczogZGlycyB9KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnbXVsdGknLCB3b3JraW5nRGlyZWN0b3JpZXM6IGRpcnMgfSk7XG5cblx0XHRcdC8vIEEgcHJvdmlkZXIgdGhhdCBkb2VzIG5vdCBhZHZlcnRpc2UgdGhlIGNhcGFiaWxpdHkga2VlcHMgb25seSB0aGVcblx0XHRcdC8vIHByaW1hcnkgKGluZGV4IDApOyBvbmUgdGhhdCBhZHZlcnRpc2VzIGl0IHJlY2VpdmVzIHRoZSBmdWxsIHNldC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzaW5nbGU6IHNpbmdsZS5sYXN0Q29uZmlnPy53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHRcdG11bHRpOiBtdWx0aS5sYXN0Q29uZmlnPy53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNpbmdsZTogW2RpcnNbMF0udG9TdHJpbmcoKV0sXG5cdFx0XHRcdG11bHRpOiBkaXJzLm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm9ycyByZXF1ZXN0ZWQgc2Vzc2lvbiBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblxuXHRcdFx0Y29uc3QgcmVxdWVzdGVkU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAncmVxdWVzdGVkLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uOiByZXF1ZXN0ZWRTZXNzaW9uIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udG9TdHJpbmcoKSwgcmVxdWVzdGVkU2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjcmlwdGVkIG1vY2sgYWdlbnQgaG9ub3JzIHJlcXVlc3RlZCBzZXNzaW9uIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IFNjcmlwdGVkTW9ja0FnZW50KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXG5cdFx0XHRjb25zdCByZXF1ZXN0ZWRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdyZXF1ZXN0ZWQtc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb246IHJlcXVlc3RlZFNlc3Npb24gfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y3JlYXRlZDogcmVzdWx0LnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0bGlzdGVkOiBzZXNzaW9ucy5zb21lKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkgPT09IHJlcXVlc3RlZFNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNyZWF0ZWQ6IHJlcXVlc3RlZFNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0bGlzdGVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGRlZmF1bHQgcHJvdmlkZXIgd2hlbiBub25lIHNwZWNpZmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHQvLyBBIGNyZWF0ZSB3aXRoIG5vIGNvbmZpZyBhdCBhbGwgaXMgc3RpbGwgd29ya3NwYWNlLWxlc3M6IHRoZSBhZ2VudFxuXHRcdFx0Ly8gaW5mZXJzIHRoYXQgZnJvbSB0aGUgYWJzZW50IHdvcmtpbmcgZGlyZWN0b3J5IGFuZCBhc3NpZ25zIGFcblx0XHRcdC8vIHNjcmF0Y2ggY3dkLCBzbyB0aGUgc2VydmljZSBtdXN0IHRhZyBpdCB0byBtYXRjaCBcdTIwMTQgb3RoZXJ3aXNlIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbiBjb21lcyBiYWNrIGxvb2tpbmcgd29ya3NwYWNlLWJvdW5kLCByb290ZWQgYXQgdGhhdCBzY3JhdGNoXG5cdFx0XHQvLyBkaXIuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHJvdmlkZXI6IEFnZW50U2Vzc2lvbi5wcm92aWRlcihzZXNzaW9uKSxcblx0XHRcdFx0bWV0YTogc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/Ll9tZXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRtZXRhOiB7IHdvcmtzcGFjZWxlc3M6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gbm8gcHJvdmlkZXJzIGFyZSByZWdpc3RlcmVkIGF0IGFsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbigpLCAvTm8gYWdlbnQgcHJvdmlkZXIvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBkaXNwb3NlU2Vzc2lvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2Rpc3Bvc2VTZXNzaW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZGlzcGF0Y2hlcyB0byB0aGUgY29ycmVjdCBwcm92aWRlciBhbmQgY2xlYW5zIHVwIHRyYWNraW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0YXdhaXQgc2VydmljZS5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RBZ2VudC5kaXNwb3NlU2Vzc2lvbkNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpcyBhIG5vLW9wIGZvciB1bmtub3duIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCB1bmtub3duU2Vzc2lvbiA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndW5rbm93bicsIHBhdGg6ICcvbm9wZScgfSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgdGhyb3dcblx0XHRcdGF3YWl0IHNlcnZpY2UuZGlzcG9zZVNlc3Npb24odW5rbm93blNlc3Npb24pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlcyBzZXNzaW9uIGRhdGEgYmVmb3JlIHJlbW92aW5nIHRoZSB3b3JrdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFN1YnNjcmliZXJzIG9mIHRoZSB3aWxsLWRlbGV0ZSBldmVudCBkcm9wIHRoaXMgc2Vzc2lvbidzIGdpdCByZWZzLFxuXHRcdFx0Ly8gd2hpY2ggcmVxdWlyZXMgcmVzb2x2aW5nIHRoZSByZXBvc2l0b3J5IGZyb20gdGhlIHdvcmtpbmcgZGlyZWN0b3J5LlxuXHRcdFx0Ly8gRm9yIGEgd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbiB0aGF0IGRpcmVjdG9yeSAqaXMqIHRoZSB3b3JrdHJlZSwgc29cblx0XHRcdC8vIHJlbW92aW5nIGl0IGZpcnN0IHdvdWxkIHN0cmFuZCB0aGUgcmVmcyBpbiB0aGUgbWFpbiByZXBvc2l0b3J5LlxuXHRcdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UgPSB7XG5cdFx0XHRcdC4uLm51bGxTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdGRlbGV0ZVNlc3Npb25EYXRhOiBhc3luYyAoKSA9PiB7IG9yZGVyLnB1c2goJ2RlbGV0ZVNlc3Npb25EYXRhJyk7IH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHN2Yy5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdHN2Yy5zZXRXb3JrdHJlZUlzb2xhdGlvbih7XG5cdFx0XHRcdHJlbW92ZUNyZWF0ZWRXb3JrdHJlZTogYXN5bmMgKCkgPT4geyBvcmRlci5wdXNoKCdyZW1vdmVDcmVhdGVkV29ya3RyZWUnKTsgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBXb3JrdHJlZUlzb2xhdGlvbik7XG5cblx0XHRcdGF3YWl0IHN2Yy5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlciwgWydkZWxldGVTZXNzaW9uRGF0YScsICdyZW1vdmVDcmVhdGVkV29ya3RyZWUnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gbGlzdFNlc3Npb25zIC8gbGlzdE1vZGVscyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdhZ2dyZWdhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2xpc3RTZXNzaW9ucyBhZ2dyZWdhdGVzIHNlc3Npb25zIGZyb20gYWxsIHByb3ZpZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3RTZXNzaW9ucyBvdmVybGF5cyBjdXN0b20gdGl0bGUgZnJvbSBzZXNzaW9uIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUHJlLXNlZWQgYSBjdXN0b20gdGl0bGUgaW4gYW4gaW4tbWVtb3J5IGRhdGFiYXNlXG5cdFx0XHRjb25zdCBkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnLCAnTXkgQ3VzdG9tIFRpdGxlJyk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24tYWJjJztcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Jywgc2Vzc2lvbklkKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkRhdGFEaXJCeUlkOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiAoKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9PiAoe1xuXHRcdFx0XHRcdG9iamVjdDogZGIsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0dHJ5T3BlbkRhdGFiYXNlOiBhc3luYyAoKTogUHJvbWlzZTxJUmVmZXJlbmNlPElTZXNzaW9uRGF0YWJhc2U+IHwgdW5kZWZpbmVkPiA9PiAoe1xuXHRcdFx0XHRcdG9iamVjdDogZGIsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZGVsZXRlU2Vzc2lvbkRhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0b25XaWxsRGVsZXRlU2Vzc2lvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGNsZWFudXBPcnBoYW5lZERhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0d2hlbklkbGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdH07XG5cblx0XHRcdC8vIENyZWF0ZSBhIG1vY2sgdGhhdCByZXR1cm5zIGEgc2Vzc2lvbiB3aXRoIHRoYXQgSURcblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgc3VtbWFyeTogJ1NESyBUaXRsZScgfTtcblx0XHRcdC8vIE1hbnVhbGx5IGFkZCB0aGUgc2Vzc2lvbiB0byB0aGUgbW9ja1xuXHRcdFx0KGFnZW50IGFzIHVua25vd24gYXMgeyBfc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFVSST4gfSkuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdHN2Yy5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBzdmMubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5zdW1tYXJ5LCAnTXkgQ3VzdG9tIFRpdGxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXN0U2Vzc2lvbnMgb3ZlcmxheXMgdGhlIEFILW93bmVkIHdvcmtzcGFjZWxlc3MgbWFya2VyIGZvciBhbnkgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgQUggc2VydmljZSBvd25zIGBhZ2VudEhvc3Qud29ya3NwYWNlbGVzc2AgaW4gdGhlIGNlbnRyYWwgc2Vzc2lvblxuXHRcdFx0Ly8gZGF0YWJhc2UgYW5kIG92ZXJsYXlzIGl0IG9udG8gZXZlcnkgYWdlbnQncyBzdW1tYXJ5IGBfbWV0YWAgXHUyMDE0IHNvIGFuXG5cdFx0XHQvLyBhZ2VudCB0aGF0IHBlcnNpc3RzL3JlLWVtaXRzIG5vdGhpbmcgaXRzZWxmIHN0aWxsIHJlc3RvcmVzIGFzIGEgcXVpY2tcblx0XHRcdC8vIGNoYXQuIFByZS1zZWVkIHRoZSBBSCBrZXkgd2l0aCBubyBhZ2VudC1zaWRlIHJlLWVtaXQuXG5cdFx0XHRjb25zdCBkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnYWdlbnRIb3N0LndvcmtzcGFjZWxlc3MnLCAndHJ1ZScpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uLXdvcmtzcGFjZWxlc3MnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCBzZXNzaW9uSWQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0U2Vzc2lvbkRhdGFEaXI6ICgpID0+IFVSSS5wYXJzZSgnaW5tZW1vcnk6L3Nlc3Npb24tZGF0YScpLFxuXHRcdFx0XHRnZXRTZXNzaW9uRGF0YURpckJ5SWQ6ICgpID0+IFVSSS5wYXJzZSgnaW5tZW1vcnk6L3Nlc3Npb24tZGF0YScpLFxuXHRcdFx0XHRvcGVuRGF0YWJhc2U6ICgpOiBJUmVmZXJlbmNlPElTZXNzaW9uRGF0YWJhc2U+ID0+ICh7XG5cdFx0XHRcdFx0b2JqZWN0OiBkYixcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0cnlPcGVuRGF0YWJhc2U6IGFzeW5jICgpOiBQcm9taXNlPElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gfCB1bmRlZmluZWQ+ID0+ICh7XG5cdFx0XHRcdFx0b2JqZWN0OiBkYixcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkZWxldGVTZXNzaW9uRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRvbldpbGxEZWxldGVTZXNzaW9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVGhlIGFnZW50IHJldHVybnMgdGhlIHNlc3Npb24gd2l0aCBOTyBgX21ldGEud29ya3NwYWNlbGVzc2Agb2YgaXRzIG93bi5cblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdChhZ2VudCBhcyB1bmtub3duIGFzIHsgX3Nlc3Npb25zOiBNYXA8c3RyaW5nLCBVUkk+IH0pLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uVXJpKTtcblxuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgc3ZjLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25zWzBdLl9tZXRhLCB7IHdvcmtzcGFjZWxlc3M6IHRydWUgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXN0U2Vzc2lvbnMgbm9ybWFsaXplcyBhIHBlcnNpc3RlZCBsaW5rZWQtd29ya3RyZWUgcHJvamVjdCB3aXRob3V0IHByb2JpbmcgYSBtaXNzaW5nIHNlc3Npb24gd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpKTtcblx0XHRcdGNvbnN0IHByaW1hcnlSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdnNjb2RlJyk7XG5cdFx0XHRjb25zdCBsaW5rZWRDaGVja291dCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3ZzY29kZS53b3JrdHJlZXMvcGFyZW50Jyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uV29ya3RyZWUgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS92c2NvZGUud29ya3RyZWVzL3BhcmVudC53b3JrdHJlZXMvY2hpbGQnKTtcblx0XHRcdGF3YWl0IGRiLnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09ULCBsaW5rZWRDaGVja291dC50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24tbGlua2VkLXdvcmt0cmVlJztcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Jywgc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbc2Vzc2lvbldvcmt0cmVlXSxcblx0XHRcdFx0cHJvamVjdDogeyB1cmk6IGxpbmtlZENoZWNrb3V0LCBkaXNwbGF5TmFtZTogJ3BhcmVudCcgfSxcblx0XHRcdH07XG5cdFx0XHQoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9zZXNzaW9uczogTWFwPHN0cmluZywgVVJJPiB9KS5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlc29sdmVkRnJvbTogVVJJW10gPSBbXTtcblx0XHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jIHdvcmtpbmdEaXJlY3RvcnkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlZEZyb20ucHVzaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdFx0cmV0dXJuIFtwcmltYXJ5Um9vdCwgbGlua2VkQ2hlY2tvdXQsIHNlc3Npb25Xb3JrdHJlZV07XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdFx0c3ZjLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHN2Yy5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGF3YWl0IHN2Yy5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc29sdmVkRnJvbTogcmVzb2x2ZWRGcm9tLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRwcm9qZWN0OiBzZXNzaW9uc1swXS5wcm9qZWN0ICYmIHsgdXJpOiBzZXNzaW9uc1swXS5wcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogc2Vzc2lvbnNbMF0ucHJvamVjdC5kaXNwbGF5TmFtZSB9LFxuXHRcdFx0XHRwZXJzaXN0ZWRSZXBvc2l0b3J5Um9vdDogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9SRVBPU0lUT1JZX1JPT1QpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNvbHZlZEZyb206IFtsaW5rZWRDaGVja291dC50b1N0cmluZygpXSxcblx0XHRcdFx0cHJvamVjdDogeyB1cmk6IHByaW1hcnlSb290LnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiAndnNjb2RlJyB9LFxuXHRcdFx0XHRwZXJzaXN0ZWRSZXBvc2l0b3J5Um9vdDogcHJpbWFyeVJvb3QudG9TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdFNlc3Npb25zIHVzZXMgU0RLIHRpdGxlIHdoZW4gbm8gY3VzdG9tIHRpdGxlIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgc3VtbWFyeTogJ0F1dG8tZ2VuZXJhdGVkIFRpdGxlJyB9O1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5zdW1tYXJ5LCAnQXV0by1nZW5lcmF0ZWQgVGl0bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3RTZXNzaW9ucyBuZXZlciByZXR1cm5zIHN1YmFnZW50IHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCBwYXJlbnRTZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgYSBsaXZlIHN1YmFnZW50IGJlaW5nIHNwYXduZWQ6IGBfaGFuZGxlU3ViYWdlbnRTdGFydGVkYFxuXHRcdFx0Ly8gcmVnaXN0ZXJzIHRoZSBjaGlsZCBzZXNzaW9uIHZpYSBgcmVzdG9yZVNlc3Npb25gLCB3aGljaCByZWNvcmRzXG5cdFx0XHQvLyBpdCBpbiB0aGUgYW5ub3VuY2VkLXN1bW1hcnkgbWFwIHRoYXQgYGxpc3RTZXNzaW9uc2Agb3ZlcmxheXNcblx0XHRcdC8vIG9udG8gcHJvdmlkZXIgcmVzdWx0cy5cblx0XHRcdGNvbnN0IGNoaWxkU2Vzc2lvblVyaSA9IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFNlc3Npb24udG9TdHJpbmcoKSwgJ3RjLXN1YicpO1xuXHRcdFx0c2VydmljZS5zdGF0ZU1hbmFnZXIucmVzdG9yZVNlc3Npb24oXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hpbGRTZXNzaW9uVXJpLFxuXHRcdFx0XHRcdHByb3ZpZGVyOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRbXSxcblx0XHRcdCk7XG5cblx0XHRcdC8vIFNhbml0eTogdGhlIHN1YmFnZW50IGNoaWxkIHNlc3Npb24gaXMgYW5ub3VuY2VkLlxuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRPdmVybGF5U2Vzc2lvblN1bW1hcmllcygpLnNvbWUocyA9PiBzLnJlc291cmNlID09PSBjaGlsZFNlc3Npb25VcmkpLFxuXHRcdFx0XHQnc3ViYWdlbnQgY2hpbGQgc2Vzc2lvbiBzaG91bGQgYmUgbGlzdGVkJyxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGxpc3RlZCA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3ViYWdlbnRTZXNzaW9uczogbGlzdGVkLmZpbHRlcihzID0+IGlzU3ViYWdlbnRTZXNzaW9uKHMuc2Vzc2lvbi50b1N0cmluZygpKSkubWFwKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdGluY2x1ZGVzUGFyZW50OiBsaXN0ZWQuc29tZShzID0+IHMuc2Vzc2lvbi50b1N0cmluZygpID09PSBwYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3ViYWdlbnRTZXNzaW9uczogW10sXG5cdFx0XHRcdFx0aW5jbHVkZXNQYXJlbnQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdFNlc3Npb25zIG92ZXJsYXkgZXhjbHVkZXMgaWRsZSBwcm92aXNpb25hbCBzZXNzaW9ucyBidXQga2VlcHMgb25lcyB3aXRoIGFuIGFjdGl2ZSB0dXJuICgjMzIxMjY5KScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgcHJvdmlzaW9uYWwgYWdlbnQgd2hvc2UgYGxpc3RTZXNzaW9uc2AgbmV2ZXIgcmV0dXJucyB0aGVcblx0XHRcdC8vIHByb3Zpc2lvbmFsIHNlc3Npb24gKG1pcnJvcmluZyBDTEkvQ2xhdWRlLCB3aGljaCBkb24ndCBwZXJzaXN0IGFcblx0XHRcdC8vIHNlc3Npb24gdW50aWwgaXRzIGZpcnN0IG1lc3NhZ2UpLiBUaGUgYWdlbnQgc2VydmljZSdzIG92ZXJsYXkgaXNcblx0XHRcdC8vIHRoZW4gdGhlIG9ubHkgdGhpbmcgdGhhdCBjb3VsZCBzdXJmYWNlIGl0LlxuXHRcdFx0Y2xhc3MgUHJvdmlzaW9uYWxNb2NrQWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVTZXNzaW9uKGNvbmZpZz86IGltcG9ydCgnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcycpLklBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpOiBQcm9taXNlPGltcG9ydCgnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcycpLklBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5jcmVhdGVTZXNzaW9uKGNvbmZpZyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4ucmVzdWx0LCBwcm92aXNpb25hbDogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGxpc3RTZXNzaW9ucygpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlzaW9uYWxBZ2VudCA9IG5ldyBQcm92aXNpb25hbE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm92aXNpb25hbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3Zpc2lvbmFsQWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Ly8gSWRsZSBwcm92aXNpb25hbCBzZXNzaW9uICh0aGUgbmV3LXNlc3Npb24gY29tcG9zZXIncyBlYWdlcmx5XG5cdFx0XHQvLyBjcmVhdGVkIHNlc3Npb24sIGJlZm9yZSBpdHMgZmlyc3QgbWVzc2FnZSkgbXVzdCBub3QgbGVhayBpbi5cblx0XHRcdGNvbnN0IGlkbGVMaXN0ZWQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHQhaWRsZUxpc3RlZC5zb21lKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkgPT09IHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdCdpZGxlIHByb3Zpc2lvbmFsIHNlc3Npb24gc2hvdWxkIG5vdCBhcHBlYXIgaW4gbGlzdFNlc3Npb25zJyxcblx0XHRcdCk7XG5cblx0XHRcdC8vIE9uY2UgYSB0dXJuIGlzIGluIGZsaWdodCAodGhlIGZpcnN0IHR1cm4gY2FuIHN0YXJ0IGJlZm9yZVxuXHRcdFx0Ly8gbWF0ZXJpYWxpemF0aW9uIGNvbXBsZXRlcyksIHRoZSBzZXNzaW9uIG11c3Qgc3RheSB2aXNpYmxlIHNvXG5cdFx0XHQvLyByZW5kZXJlci1zaWRlIGNhY2hlcyBkb24ndCBldmljdCB0aGUgaW4tZmxpZ2h0IHNlc3Npb24uXG5cdFx0XHRzZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDEsXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgYWN0aXZlTGlzdGVkID0gYXdhaXQgc2VydmljZS5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0YWN0aXZlTGlzdGVkLnNvbWUocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi50b1N0cmluZygpKSxcblx0XHRcdFx0J3Byb3Zpc2lvbmFsIHNlc3Npb24gd2l0aCBhbiBhY3RpdmUgdHVybiBzaG91bGQgYXBwZWFyIGluIGxpc3RTZXNzaW9ucycsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBJZiB0aGUgdHVybiBjb21wbGV0ZXMgYmVmb3JlIHRoZSBtYXRlcmlhbGl6ZSBldmVudCBsYW5kcywgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIGlzIGJhY2sgdG8gbGlmZWN5Y2xlPWNyZWF0aW5nIHdpdGggbm8gYWN0aXZlIHR1cm4gXHUyMDE0IGJ1dCBpdFxuXHRcdFx0Ly8gaGFzIGEgcmVjb3JkZWQgdHVybiBub3csIHNvIGl0IG11c3QgU1RBWSB2aXNpYmxlIChvdGhlcndpc2UgYVxuXHRcdFx0Ly8gbGlzdFNlc3Npb25zIHJlZnJlc2ggaW4gdGhpcyB3aW5kb3cgd291bGQgZXZpY3QgdGhlIGp1c3QtZmluaXNoZWRcblx0XHRcdC8vIHNlc3Npb24sIHJlaW50cm9kdWNpbmcgIzMyMTI2OSdzIHNpYmxpbmcgZXZpY3Rpb24gYnVnKS5cblx0XHRcdHNlcnZpY2UuZGlzcGF0Y2hBY3Rpb24oXG5cdFx0XHRcdGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSxcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHRcdCd0ZXN0LWNsaWVudCcsIDIsXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc3RhdGVBZnRlclR1cm4gPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUFmdGVyVHVybj8ubGlmZWN5Y2xlLCBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nLCAnc2Vzc2lvbiBzaG91bGQgc3RpbGwgYmUgcHJvdmlzaW9uYWwgKG1hdGVyaWFsaXplIG5vdCB5ZXQgZmlyZWQpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVBZnRlclR1cm4/LmFjdGl2ZVR1cm4sIHVuZGVmaW5lZCwgJ2NvbXBsZXRlZCB0dXJuIHNob3VsZCBjbGVhciB0aGUgYWN0aXZlIHR1cm4nKTtcblx0XHRcdGNvbnN0IGNvbXBsZXRlZExpc3RlZCA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdGNvbXBsZXRlZExpc3RlZC5zb21lKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkgPT09IHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdCdwcm92aXNpb25hbCBzZXNzaW9uIHdpdGggYSBjb21wbGV0ZWQgdHVybiBzaG91bGQgc3RpbGwgYXBwZWFyIGluIGxpc3RTZXNzaW9ucycsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdFNlc3Npb25zIG92ZXJsYXlzIGxpdmUgd29ya3NwYWNlIG1ldGFkYXRhIG92ZXIgYSBzdGFsZSBwcm92aWRlciBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNsYXNzIERlbGF5ZWRMaXN0QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRyZWFkb25seSBsaXN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0cmVhZG9ubHkgcmVsZWFzZUxpc3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGxpc3RTZXNzaW9ucygpIHtcblx0XHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHN1cGVyLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0XHRcdHRoaXMubGlzdFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbGVhc2VMaXN0LnA7XG5cdFx0XHRcdFx0cmV0dXJuIHNuYXBzaG90O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IERlbGF5ZWRMaXN0QWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRhZ2VudC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL29yaWdpbmFsJyk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IGxpc3RpbmcgPSBzZXJ2aWNlLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXdhaXQgYWdlbnQubGlzdFN0YXJ0ZWQucDtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0dGl0bGU6ICdNYXRlcmlhbGl6ZWQnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgxMDAwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgyMDAwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLmZpbGUoJy9wcm9qZWN0JykudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6ICdwcm9qZWN0JyB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmt0cmVlJykudG9TdHJpbmcoKV0sXG5cdFx0XHR9LCBbXSk7XG5cdFx0XHRhZ2VudC5yZWxlYXNlTGlzdC5jb21wbGV0ZSgpO1xuXG5cdFx0XHRjb25zdCBsaXN0ZWQgPSAoYXdhaXQgbGlzdGluZykuZmluZChpdGVtID0+IGl0ZW0uc2Vzc2lvbi50b1N0cmluZygpID09PSBzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1vZGlmaWVkVGltZTogbGlzdGVkPy5tb2RpZmllZFRpbWUsXG5cdFx0XHRcdHByb2plY3Q6IGxpc3RlZD8ucHJvamVjdCAmJiB7IHVyaTogbGlzdGVkLnByb2plY3QudXJpLnBhdGgsIGRpc3BsYXlOYW1lOiBsaXN0ZWQucHJvamVjdC5kaXNwbGF5TmFtZSB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBsaXN0ZWQ/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdPy5wYXRoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRcdHByb2plY3Q6IHsgdXJpOiAnL3Byb2plY3QnLCBkaXNwbGF5TmFtZTogJ3Byb2plY3QnIH0sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6ICcvd29ya3RyZWUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ2xpc3RTZXNzaW9ucyBzeW50aGVzaXplcyB0aGUgc2Vzc2lvbiBjaGFuZ2VzZXQgY2F0YWxvZ3VlIGZyb20gcGVyc2lzdGVkIGRpZmZzIGZvciB1bm9wZW5lZCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFByZS1zZWVkIGEgYCdkaWZmcydgIGJsb2IgaW4gdGhlIGluLW1lbW9yeSBEQi4gVGhlIGFnZW50J3Ncblx0XHRcdC8vIGBsaXN0U2Vzc2lvbnMoKWAgcmV0dXJucyB0aGUgc2Vzc2lvbiBtZXRhZGF0YSBidXQgdGhlIHNlc3Npb25cblx0XHRcdC8vIGlzIE5PVCBsaXZlIGluIHRoZSBzdGF0ZSBtYW5hZ2VyIChubyBjcmVhdGVTZXNzaW9uIC9cblx0XHRcdC8vIHJlc3RvcmVTZXNzaW9uIGNhbGwpLCBzbyB0aGUgc3ludGhlc2lzZWQgY2F0YWxvZ3VlIHBhdGggcnVucy5cblx0XHRcdGNvbnN0IGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZERpZmZzID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiA1LCByZW1vdmVkOiAyIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2IudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnZGlmZnMnLCBKU09OLnN0cmluZ2lmeShwZXJzaXN0ZWREaWZmcykpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAncGVyc2lzdGVkLXNlc3Npb24nO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCBzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkRhdGFEaXJCeUlkOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiAoKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9PiAoeyBvYmplY3Q6IGRiLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKCk6IFByb21pc2U8SVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB8IHVuZGVmaW5lZD4gPT4gKHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHRkZWxldGVTZXNzaW9uRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRvbldpbGxEZWxldGVTZXNzaW9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0KGFnZW50IGFzIHVua25vd24gYXMgeyBfc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFVSST4gfSkuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdHN2Yy5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBzdmMubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhbmdlc2V0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdFx0dXJpVGVtcGxhdGU6IGAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3Nlc3Npb25gLFxuXHRcdFx0XHRcdGFkZGl0aW9uczogOCxcblx0XHRcdFx0XHRkZWxldGlvbnM6IDIsXG5cdFx0XHRcdFx0ZmlsZXM6IDIsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9L2NoYW5nZXNldC91bmNvbW1pdHRlZGAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCdsaXN0U2Vzc2lvbnMgc2lsZW50bHkgaWdub3JlcyBtYWxmb3JtZWQgcGVyc2lzdGVkIGRpZmZzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuc2V0TWV0YWRhdGEoJ2RpZmZzJywgJ3sgbm90IHZhbGlkIGpzb24nKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2JhZC1kaWZmcy1zZXNzaW9uJztcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Jywgc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRTZXNzaW9uRGF0YURpcjogKCkgPT4gVVJJLnBhcnNlKCdpbm1lbW9yeTovc2Vzc2lvbi1kYXRhJyksXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyQnlJZDogKCkgPT4gVVJJLnBhcnNlKCdpbm1lbW9yeTovc2Vzc2lvbi1kYXRhJyksXG5cdFx0XHRcdG9wZW5EYXRhYmFzZTogKCk6IElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gPT4gKHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHR0cnlPcGVuRGF0YWJhc2U6IGFzeW5jICgpOiBQcm9taXNlPElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gfCB1bmRlZmluZWQ+ID0+ICh7IG9iamVjdDogZGIsIGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdFx0ZGVsZXRlU2Vzc2lvbkRhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0b25XaWxsRGVsZXRlU2Vzc2lvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGNsZWFudXBPcnBoYW5lZERhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0d2hlbklkbGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdChhZ2VudCBhcyB1bmtub3duIGFzIHsgX3Nlc3Npb25zOiBNYXA8c3RyaW5nLCBVUkk+IH0pLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uVXJpKTtcblxuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgc3ZjLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhbmdlc2V0cywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgnbGlzdFNlc3Npb25zIGFkdmVydGlzZXMgcGVyc2lzdGVkIGNoYW5nZXNldCBjb3VudHMgd2l0aG91dCBzZWVkaW5nIHN0YXRlOyBjaGFuZ2VzZXQgc3Vic2NyaWJlIHJlc3RvcmVzIGxhemlseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZERpZmZzID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiA1LCByZW1vdmVkOiAyIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0YXdhaXQgZGIuc2V0TWV0YWRhdGEoJ2RpZmZzJywgSlNPTi5zdHJpbmdpZnkocGVyc2lzdGVkRGlmZnMpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Vub3BlbmVkLXdpdGgtZGlmZnMnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCBzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkRhdGFEaXJCeUlkOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiAoKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9PiAoeyBvYmplY3Q6IGRiLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKCk6IFByb21pc2U8SVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB8IHVuZGVmaW5lZD4gPT4gKHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHRkZWxldGVTZXNzaW9uRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRvbldpbGxEZWxldGVTZXNzaW9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0KGFnZW50IGFzIHVua25vd24gYXMgeyBfc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFVSST4gfSkuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdHN2Yy5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBzdmMubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxpc3RDYXRhbG9ndWVFbnRyeTogc2Vzc2lvbnNbMF0uY2hhbmdlc2V0cz8uZmluZChjID0+IGMudXJpVGVtcGxhdGUgPT09IGNoYW5nZXNldFVyaSksXG5cdFx0XHRcdGxpc3RTZWVkZWRTbmFwc2hvdDogc3ZjLnN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjaGFuZ2VzZXRVcmkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsaXN0Q2F0YWxvZ3VlRW50cnk6IHtcblx0XHRcdFx0XHRsYWJlbDogJ0JyYW5jaCBDaGFuZ2VzJyxcblx0XHRcdFx0XHR1cmlUZW1wbGF0ZTogY2hhbmdlc2V0VXJpLFxuXHRcdFx0XHRcdGFkZGl0aW9uczogNSxcblx0XHRcdFx0XHRkZWxldGlvbnM6IDIsXG5cdFx0XHRcdFx0ZmlsZXM6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxpc3RTZWVkZWRTbmFwc2hvdDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgc3ZjLnN1YnNjcmliZShVUkkucGFyc2UoY2hhbmdlc2V0VXJpKSwgJ2NsaWVudC1jaGFuZ2VzZXQnKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Quc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZyB9PiB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXR1cywgJ3JlYWR5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmZpbGVzLm1hcChmID0+IGYuaWQpLCBbJ2ZpbGU6Ly8vd2QvYS50cyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgnbGlzdFNlc3Npb25zIHByZWZlcnMgcmVhZHkgbGl2ZSBjaGFuZ2VzZXQgc3RhdGUgb3ZlciBzdGFsZSBwZXJzaXN0ZWQgZGlmZnMgZm9yIHVub3BlbmVkIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Ly8gU3RhbGUgcGVyc2lzdGVkIGRpZmZzIFx1MjAxNCBvYnZpb3VzbHkgZGlmZmVyZW50IHRvdGFscyBzbyB0aGVcblx0XHRcdC8vIHNvdXJjZS1vZi10cnV0aCBjaG9pY2UgaXMgdmlzaWJsZS5cblx0XHRcdGNvbnN0IHBlcnNpc3RlZERpZmZzID0gW1xuXHRcdFx0XHR7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QveC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC94LnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDk5LCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdFx0eyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL3kudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QveS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAwLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdFx0eyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL3oudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2Qvei50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAwLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdF07XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnZGlmZnMnLCBKU09OLnN0cmluZ2lmeShwZXJzaXN0ZWREaWZmcykpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndW5vcGVuZWQtc3RhbGUtZGlmZnMnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCBzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkRhdGFEaXJCeUlkOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiAoKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9PiAoeyBvYmplY3Q6IGRiLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKCk6IFByb21pc2U8SVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB8IHVuZGVmaW5lZD4gPT4gKHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHRkZWxldGVTZXNzaW9uRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRvbldpbGxEZWxldGVTZXNzaW9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0KGFnZW50IGFzIHVua25vd24gYXMgeyBfc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFVSST4gfSkuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdHN2Yy5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Ly8gU2VlZCBsaXZlIGNoYW5nZXNldCBzdGF0ZSBkaXJlY3RseTogYSBzaW5nbGUgZmlsZSB3aXRoXG5cdFx0XHQvLyBkaWZmZXJlbnQgY291bnRzIHRoYW4gdGhlIHN0YWxlIHBlcnNpc3RlZCBibG9iLlxuXHRcdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gc3ZjLnN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRzdmMuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRcdGZpbGU6IHtcblx0XHRcdFx0XHRpZDogJ2ZpbGU6Ly8vd2QvbGl2ZS50cycsXG5cdFx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2xpdmUudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvbGl2ZS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdmMuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgc3ZjLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uc1swXS5jaGFuZ2VzZXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ0JyYW5jaCBDaGFuZ2VzJyxcblx0XHRcdFx0XHR1cmlUZW1wbGF0ZTogY2hhbmdlc2V0VXJpLFxuXHRcdFx0XHRcdGFkZGl0aW9uczogMSxcblx0XHRcdFx0XHRkZWxldGlvbnM6IDAsXG5cdFx0XHRcdFx0ZmlsZXM6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9L2NoYW5nZXNldC91bmNvbW1pdHRlZGAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCdsaXN0U2Vzc2lvbnMgZG9lcyBub3QgcmVxdWVzdCB0aGUgZGlmZnMgbWV0YWRhdGEga2V5IHdoZW4gYSBsaXZlIHNvdXJjZSBjYW4gYW5zd2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdGVkS2V5czogc3RyaW5nW11bXSA9IFtdO1xuXHRcdFx0Y29uc3QgZGI6IElTZXNzaW9uRGF0YWJhc2UgPSB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0Z2V0TWV0YWRhdGE6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0TWV0YWRhdGFPYmplY3Q6IGFzeW5jIDxUIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4+KG9iajogVCk6IFByb21pc2U8eyBbSyBpbiBrZXlvZiBUXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+ID0+IHtcblx0XHRcdFx0XHRyZXF1ZXN0ZWRLZXlzLnB1c2goT2JqZWN0LmtleXMob2JqKSk7XG5cdFx0XHRcdFx0cmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhPYmplY3Qua2V5cyhvYmopLm1hcChrID0+IFtrLCB1bmRlZmluZWRdKSkgYXMgeyBbSyBpbiBrZXlvZiBUXTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldE1ldGFkYXRhOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlbGV0ZU1ldGFkYXRhOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGFwcGVuZEV2ZW50OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdHJlYWRFdmVudHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRyZWFkRXZlbnRDb3VudDogYXN5bmMgKCkgPT4gMCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbkRhdGFiYXNlO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndW5vcGVuZWQtbGl2ZS1zb3VyY2UnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCBzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkRhdGFEaXJCeUlkOiAoKSA9PiBVUkkucGFyc2UoJ2lubWVtb3J5Oi9zZXNzaW9uLWRhdGEnKSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiAoKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9PiAoeyBvYmplY3Q6IGRiLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKCk6IFByb21pc2U8SVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB8IHVuZGVmaW5lZD4gPT4gKHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHRkZWxldGVTZXNzaW9uRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRvbldpbGxEZWxldGVTZXNzaW9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Y2xlYW51cE9ycGhhbmVkRGF0YTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0KGFnZW50IGFzIHVua25vd24gYXMgeyBfc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIFVSST4gfSkuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdHN2Yy5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Ly8gU2VlZCBhIHJlYWR5ICh6ZXJvLWZpbGUpIGxpdmUgY2hhbmdlc2V0IHN0YXRlIFx1MjAxNCB0aGlzIGFsb25lXG5cdFx0XHQvLyBtdXN0IGJlIGF1dGhvcml0YXRpdmUgZW5vdWdoIHRvIHN1cHByZXNzIHRoZSBwZXJzaXN0ZWQtZGlmZnNcblx0XHRcdC8vIHJlYWQuXG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBzdmMuc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdHN2Yy5zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc3ZjLmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdGVkS2V5cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RlZEtleXNbMF0uaW5jbHVkZXMoJ2RpZmZzJyksIGZhbHNlLCBgZXhwZWN0ZWQgbGlzdFNlc3Npb25zIHRvIHNraXAgdGhlICdkaWZmcycga2V5IHdoZW4gcmVhZHkgbGl2ZSBjaGFuZ2VzZXQgc3RhdGUgZXhpc3RzOyByZXF1ZXN0ZWQ9JHtyZXF1ZXN0ZWRLZXlzWzBdLmpvaW4oJywnKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgnbGlzdFNlc3Npb25zIHN0aWxsIHJlYWRzIHBlcnNpc3RlZCBkaWZmcyB3aGVuIG9ubHkgYSBjb21wdXRpbmcgKG5vdCByZWFkeSkgY2hhbmdlc2V0IHN0YXRlIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZERpZmZzID0gW1xuXHRcdFx0XHR7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vd2QvcC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy93ZC9wLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDcsIHJlbW92ZWQ6IDEgfSB9LFxuXHRcdFx0XTtcblx0XHRcdGF3YWl0IGRiLnNldE1ldGFkYXRhKCdkaWZmcycsIEpTT04uc3RyaW5naWZ5KHBlcnNpc3RlZERpZmZzKSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd1bm9wZW5lZC1jb21wdXRpbmctY2hhbmdlc2V0Jztcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Jywgc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRTZXNzaW9uRGF0YURpcjogKCkgPT4gVVJJLnBhcnNlKCdpbm1lbW9yeTovc2Vzc2lvbi1kYXRhJyksXG5cdFx0XHRcdGdldFNlc3Npb25EYXRhRGlyQnlJZDogKCkgPT4gVVJJLnBhcnNlKCdpbm1lbW9yeTovc2Vzc2lvbi1kYXRhJyksXG5cdFx0XHRcdG9wZW5EYXRhYmFzZTogKCk6IElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gPT4gKHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0XHR0cnlPcGVuRGF0YWJhc2U6IGFzeW5jICgpOiBQcm9taXNlPElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gfCB1bmRlZmluZWQ+ID0+ICh7IG9iamVjdDogZGIsIGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdFx0ZGVsZXRlU2Vzc2lvbkRhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0b25XaWxsRGVsZXRlU2Vzc2lvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGNsZWFudXBPcnBoYW5lZERhdGE6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0d2hlbklkbGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdChhZ2VudCBhcyB1bmtub3duIGFzIHsgX3Nlc3Npb25zOiBNYXA8c3RyaW5nLCBVUkk+IH0pLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uVXJpKTtcblxuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRzdmMucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIGEgY2hhbmdlc2V0IGJ1dCBsZWF2ZSBpdCBpbiB0aGUgZGVmYXVsdFxuXHRcdFx0Ly8gYENvbXB1dGluZ2Agc3RhdHVzIChubyBDaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkIGRpc3BhdGNoKS5cblx0XHRcdHN2Yy5zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHN2Yy5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhbmdlc2V0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdFx0dXJpVGVtcGxhdGU6IGAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3Nlc3Npb25gLFxuXHRcdFx0XHRcdGFkZGl0aW9uczogNyxcblx0XHRcdFx0XHRkZWxldGlvbnM6IDEsXG5cdFx0XHRcdFx0ZmlsZXM6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9L2NoYW5nZXNldC91bmNvbW1pdHRlZGAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCdsaXN0U2Vzc2lvbnMgb3ZlcmxheXMgbGl2ZSBzdGF0ZSBtYW5hZ2VyIHRpdGxlIG92ZXIgU0RLIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBpbW1lZGlhdGUgdGl0bGUgY2hhbmdlIHZpYSBzdGF0ZSBtYW5hZ2VyXG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHR0aXRsZTogJ1VzZXIgZmlyc3QgbWVzc2FnZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uc3VtbWFyeSwgJ1VzZXIgZmlyc3QgbWVzc2FnZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiBhdHRhY2hlcyBnaXQgc3RhdGUgaW50byBzdGF0ZSBfbWV0YSB3aGVuIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHByZXNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvcmVwbycpO1xuXHRcdFx0Y29uc3QgZ2l0U3RhdGUgPSB7XG5cdFx0XHRcdGhhc0dpdEh1YlJlbW90ZTogdHJ1ZSxcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUveCcsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogJ29yaWdpbi9mZWF0dXJlL3gnLFxuXHRcdFx0XHRpbmNvbWluZ0NoYW5nZXM6IDEsXG5cdFx0XHRcdG91dGdvaW5nQ2hhbmdlczogMixcblx0XHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiAzLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRDdXJyZW50QnJhbmNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldERlZmF1bHRCcmFuY2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0QnJhbmNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFJlZnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXRCcmFuY2hlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFdvcmt0cmVlUm9vdHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRhZGRXb3JrdHJlZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0YWRkRXhpc3RpbmdXb3JrdHJlZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRyZW1vdmVXb3JrdHJlZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRicmFuY2hFeGlzdHM6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0XHRoYXNVbmNvbW1pdHRlZENoYW5nZXM6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0XHRjb21taXRBbGw6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0cmVzdG9yZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRoYXNVcHN0cmVhbTogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHB1bGw6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0cHVzaDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICh1cmk6IFVSSSkgPT4geyBjYWxscy5wdXNoKHVyaS5mc1BhdGgpOyByZXR1cm4gZ2l0U3RhdGU7IH0sXG5cdFx0XHRcdGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHNob3dCbG9iOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21taXRUcmVlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHVwZGF0ZVJlZjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGVSZWZzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdHJldlBhcnNlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRvdmVybGF5UGF0aEludG9UcmVlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGRpZmZUcmVlUGF0aHM6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEZldGNoUmVtb3RlVXJsczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRVbnRyYWNrZWRQYXRoczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldERpZmZQYXRjaEJldHdlZW5SZWZzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBudWxsU2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0YWdlbnQucmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5ID0gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdGFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkIH07XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cblx0XHRcdC8vIEEgbm9ybWFsIHNlc3Npb24gcGFzc2VzIGFuIGlucHV0IHdvcmtpbmdEaXJlY3RvcnksIHNvIGl0IGlzIG5vdFxuXHRcdFx0Ly8gaW5mZXJyZWQgd29ya3NwYWNlLWxlc3M7IGBfbWV0YWAgY2FycmllcyBvbmx5IHRoZSBnaXQgb3ZlcmxheS5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcsIHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0Ly8gX2F0dGFjaEdpdFN0YXRlIGlzIGZpcmUtYW5kLWZvcmdldDsgZHJhaW4gbWljcm90YXNrcyB1bnRpbCB0aGVcblx0XHRcdC8vIGdpdCBzZXJ2aWNlJ3MgcHJvbWlzZSBoYXMgcmVzb2x2ZWQgYW5kIHNldFNlc3Npb25NZXRhIGhhcyBydW4uXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBsb2NhbFNlcnZpY2UubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt3b3JraW5nRGlyZWN0b3J5LmZzUGF0aF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8uX21ldGEsXG5cdFx0XHRcdHsgZ2l0OiBnaXRTdGF0ZSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgnY3JlYXRlU2Vzc2lvbiByZWZyZXNoZXMgYnJhbmNoIGFuZCB1bmNvbW1pdHRlZCBjaGFuZ2VzZXRzIGFmdGVyIGdpdCBzdGF0ZSBhdHRhY2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9yZXBvJyk7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZSA9IHtcblx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUveCcsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbmNvbWluZ0NoYW5nZXM6IDAsXG5cdFx0XHRcdG91dGdvaW5nQ2hhbmdlczogMCxcblx0XHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiAwLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNvbXB1dGVDYWxsczogQXJyYXk8eyBzZXNzaW9uVXJpOiBzdHJpbmc7IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRnaXRTZXJ2aWNlLmdldFNlc3Npb25HaXRTdGF0ZSA9IGFzeW5jICgpID0+IGdpdFN0YXRlO1xuXHRcdFx0Z2l0U2VydmljZS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyA9IGFzeW5jIChfd2QsIG9wdHMpID0+IHtcblx0XHRcdFx0Y29tcHV0ZUNhbGxzLnB1c2goeyBzZXNzaW9uVXJpOiBvcHRzLnNlc3Npb25VcmksIGJhc2VCcmFuY2g6IG9wdHMuYmFzZUJyYW5jaCB9KTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0YWdlbnQucmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5ID0gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdGFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkIH07XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMCAmJiBjb21wdXRlQ2FsbHMubGVuZ3RoIDwgMjsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyKSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNvbXB1dGVDYWxscy5zb3J0KChhLCBiKSA9PiAoYS5iYXNlQnJhbmNoID8/ICcnKS5sb2NhbGVDb21wYXJlKGIuYmFzZUJyYW5jaCA/PyAnJykpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXNzaW9uVXJpOiBzZXNzaW9uLnRvU3RyaW5nKCksIGJhc2VCcmFuY2g6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgc2Vzc2lvblVyaTogc2Vzc2lvbi50b1N0cmluZygpLCBiYXNlQnJhbmNoOiAnbWFpbicgfSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIGluZmVycyB3b3Jrc3BhY2UtbGVzcyAoYW5kIHNraXBzIGdpdCBvdmVybGF5KSB3aGVuIG5vIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRDdXJyZW50QnJhbmNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldERlZmF1bHRCcmFuY2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0QnJhbmNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFJlZnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXRCcmFuY2hlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFdvcmt0cmVlUm9vdHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRhZGRXb3JrdHJlZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0YWRkRXhpc3RpbmdXb3JrdHJlZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRyZW1vdmVXb3JrdHJlZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRicmFuY2hFeGlzdHM6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0XHRoYXNVbmNvbW1pdHRlZENoYW5nZXM6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0XHRjb21taXRBbGw6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0aGFzVXBzdHJlYW06IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0XHRwdWxsOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdHB1c2g6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0cmVzdG9yZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29tcHV0ZVNlc3Npb25GaWxlRGlmZnM6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0c2hvd0Jsb2I6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbW1pdFRyZWU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0dXBkYXRlUmVmOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlbGV0ZVJlZnM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0cmV2UGFyc2U6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG92ZXJsYXlQYXRoSW50b1RyZWU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlmZlRyZWVQYXRoczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFVudHJhY2tlZFBhdGhzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0QnJhbmNoRGlmZlNhZmV0eUluZm86IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIG51bGxTZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHQvLyBObyByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnkgc2V0IG9uIHRoZSBtb2NrLlxuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGxvY2FsU2VydmljZS5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHQvLyBObyBpbnB1dCB3b3JraW5nRGlyZWN0b3J5IFx1MjE5MiBpbmZlcnJlZCB3b3Jrc3BhY2UtbGVzcyAodGFnZ2VkKSwgYW5kIG5vXG5cdFx0XHQvLyBnaXQgb3ZlcmxheSBiZWNhdXNlIHRoZXJlIGlzIG5vIHdvcmtpbmcgZGlyZWN0b3J5IHRvIHByb2JlLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy5fbWV0YSwgeyB3b3Jrc3BhY2VsZXNzOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCdjcmVhdGVTZXNzaW9uIHN0cmlwcyBnaXQtb25seSBjYXRhbG9ndWUgZW50cmllcyBmb3Igbm9uLWdpdCB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9ub3QtYS1yZXBvJyk7XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdC8vIFByb2JlIHJ1bnMgYnV0IHJlcG9ydHMgXCJub3QgYSBnaXQgcmVwb1wiLlxuXHRcdFx0Z2l0U2VydmljZS5nZXRTZXNzaW9uR2l0U3RhdGUgPSBhc3luYyAoKSA9PiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgbnVsbFNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGdpdFNlcnZpY2UpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGFnZW50LnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IHdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHRhZ2VudC5zZXNzaW9uTWV0YWRhdGFPdmVycmlkZXMgPSB7IHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlIS5jaGFuZ2VzZXRzPy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdC5za2lwKCdjcmVhdGVTZXNzaW9uIGtlZXBzIGdpdC1vbmx5IGNhdGFsb2d1ZSBlbnRyaWVzIGZvciBhIGdpdCB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9yZXBvJyk7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZSA9IHtcblx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0YnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5jb21pbmdDaGFuZ2VzOiAwLFxuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDAsXG5cdFx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogMCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdFNlcnZpY2UuZ2V0U2Vzc2lvbkdpdFN0YXRlID0gYXN5bmMgKCkgPT4gZ2l0U3RhdGU7XG5cblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgbnVsbFNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGdpdFNlcnZpY2UpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGFnZW50LnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IHdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHRhZ2VudC5zZXNzaW9uTWV0YWRhdGFPdmVycmlkZXMgPSB7IHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlIS5jaGFuZ2VzZXRzLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsIHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uLnRvU3RyaW5nKCl9L2NoYW5nZXNldC9zZXNzaW9uYCwgZGVzY3JpcHRpb246ICdtYWluJywgY2hhbmdlS2luZDogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdVbmNvbW1pdHRlZCBDaGFuZ2VzJywgdXJpVGVtcGxhdGU6IGAke3Nlc3Npb24udG9TdHJpbmcoKX0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCwgZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJywgY2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ2NyZWF0ZVNlc3Npb24gc2V0cyBCcmFuY2ggQ2hhbmdlcyBkZXNjcmlwdGlvbiBmcm9tIHdvcmt0cmVlIGJyYW5jaCBpbmZvJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlcG8nKTtcblx0XHRcdGNvbnN0IGdpdFN0YXRlID0ge1xuXHRcdFx0XHRoYXNHaXRIdWJSZW1vdGU6IGZhbHNlLFxuXHRcdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS94Jyxcblx0XHRcdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluY29taW5nQ2hhbmdlczogMCxcblx0XHRcdFx0b3V0Z29pbmdDaGFuZ2VzOiAwLFxuXHRcdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDAsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRnaXRTZXJ2aWNlLmdldFNlc3Npb25HaXRTdGF0ZSA9IGFzeW5jICgpID0+IGdpdFN0YXRlO1xuXG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIG51bGxTZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRhZ2VudC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0YWdlbnQuc2Vzc2lvbk1ldGFkYXRhT3ZlcnJpZGVzID0geyB3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQgfTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZSEuY2hhbmdlc2V0cywgW1xuXHRcdFx0XHR7IGxhYmVsOiAnQnJhbmNoIENoYW5nZXMnLCB1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvbi50b1N0cmluZygpfS9jaGFuZ2VzZXQvc2Vzc2lvbmAsIGRlc2NyaXB0aW9uOiAnZmVhdHVyZS94IFx1MjE5MiBtYWluJywgY2hhbmdlS2luZDogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdVbmNvbW1pdHRlZCBDaGFuZ2VzJywgdXJpVGVtcGxhdGU6IGAke3Nlc3Npb24udG9TdHJpbmcoKX0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCwgZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJywgY2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJzY3JpYmUgbGF6aWx5IGF0dGFjaGVzIGdpdCBzdGF0ZSB3aGVuIGFuIGV4aXN0aW5nIHNlc3Npb24gaGFzIG5vIF9tZXRhLmdpdCcsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb24gdGVzdDogcHJldmlvdXNseSBBZ2VudFNlcnZpY2Ugd2FzIGNvbnN0cnVjdGVkIHdpdGhvdXRcblx0XHRcdC8vIGEgZ2l0IHNlcnZpY2UsIHNvIHRoZSBnaXQgcHJvYmUgYWx3YXlzIGJhaWxlZCBhbmQgYF9tZXRhLmdpdGBcblx0XHRcdC8vIHdhcyBuZXZlciBwb3B1bGF0ZWQuIFRoaXMgdGVzdCBlbnN1cmVzIHRoZSBsYXp5LWZpcmUgcGF0aCBvblxuXHRcdFx0Ly8gc3Vic2NyaWJlKCkgYWN0dWFsbHkgaW52b2tlcyB0aGUgZ2l0IHNlcnZpY2UgYW5kIHdyaXRlcyBnaXRcblx0XHRcdC8vIHN0YXRlIGludG8gdGhlIHNlc3Npb24ncyBgX21ldGFgLlxuXHRcdFx0Ly9cblx0XHRcdC8vIHN1YnNjcmliZSgpIGtpY2tzIG9mZiB0aGUgZ2l0LXN0YXRlIHJlZnJlc2ggYXMgZmlyZS1hbmQtZm9yZ2V0XG5cdFx0XHQvLyAoaXQgZG9lcyBub3QgYXdhaXQgaXQpLCBzbyB0aGUgdGVzdCBtdXN0IHlpZWxkIHRvIGxldCB0aGF0IGFzeW5jXG5cdFx0XHQvLyB3b3JrIHJ1biBiZWZvcmUgYXNzZXJ0aW5nLiBGYWtlIHRpbWVycyBhcmUgdXNlZCBiZWNhdXNlIHRoZVxuXHRcdFx0Ly8gcmVmcmVzaCBpcyByYXRlLWxpbWl0ZWQgKGl0IG9ubHkgc2V0dGxlcyBhZnRlciBhIGRlbGF5KS5cblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlcG8nKTtcblx0XHRcdFx0Y29uc3QgZ2l0U3RhdGUgPSB7XG5cdFx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS9sYXp5Jyxcblx0XHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGluY29taW5nQ2hhbmdlczogMCxcblx0XHRcdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDAsXG5cdFx0XHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiAwLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRcdGdpdFNlcnZpY2UuZ2V0U2Vzc2lvbkdpdFN0YXRlID0gYXN5bmMgKHVyaTogVVJJKSA9PiB7IGNhbGxzLnB1c2godXJpLmZzUGF0aCk7IHJldHVybiBnaXRTdGF0ZTsgfTtcblx0XHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBudWxsU2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdFx0YWdlbnQucmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5ID0gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdFx0YWdlbnQuc2Vzc2lvbk1ldGFkYXRhT3ZlcnJpZGVzID0geyB3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0XHRcdC8vIFNlZWQgYSBzZXNzaW9uIGFuZCBjbGVhciBpdHMgX21ldGEgc28gc3Vic2NyaWJlIG11c3QgbGF6aWx5XG5cdFx0XHRcdC8vIHJlY29tcHV0ZSBnaXQgc3RhdGUuIEEgbWljcm90YXNrIGRyYWluIGxldHMgdGhlXG5cdFx0XHRcdC8vIGNyZWF0ZVNlc3Npb24tdHJpZ2dlcmVkIHJlZnJlc2ggcmVjb3JkIGl0cyBjYWxsIHNvIHdlIGNhblxuXHRcdFx0XHQvLyByZXNldCB0aGUgcHJvYmVzIHRvIGEgY2xlYW4gYmFzZWxpbmUuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uLnRvU3RyaW5nKCksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRcdFx0Ly8gc3Vic2NyaWJlIGZpcmVzIHRoZSBnaXQtc3RhdGUgcmVmcmVzaCB3aXRob3V0IGF3YWl0aW5nIGl0LCBzb1xuXHRcdFx0XHQvLyBhZHZhbmNlIHRpbWUgdG8gbGV0IHRoYXQgZmlyZS1hbmQtZm9yZ2V0IHJlZnJlc2ggcnVuIGFuZCB3cml0ZVxuXHRcdFx0XHQvLyBfbWV0YS5naXQuXG5cdFx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5zdWJzY3JpYmUoc2Vzc2lvbiwgJ2NsaWVudC0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNV8wMDApO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt3b3JraW5nRGlyZWN0b3J5LmZzUGF0aF0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/Ll9tZXRhLFxuXHRcdFx0XHRcdHsgZ2l0OiBnaXRTdGF0ZSB9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJzY3JpYmUgdG8gYSByZWdpc3RlcmVkIHNlc3Npb24gY2hhbmdlc2V0IFVSSSByZXR1cm5zIGEgY2hhbmdlc2V0IHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShjaGFuZ2VzZXRVcmkpLCAnY2xpZW50LWNzLWtub3duJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZXNvdXJjZTogc25hcHNob3QucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRmaWxlczogKHNuYXBzaG90LnN0YXRlIGFzIENoYW5nZXNldFN0YXRlKS5maWxlcy5sZW5ndGgsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hhbmdlc2V0VXJpLFxuXHRcdFx0XHRcdGZpbGVzOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YnNjcmliZSB0byBhbiB1bmtub3duIGNoYW5nZXNldCBpZCBmYWlscyB3aXRob3V0IHJlc3RvcmluZyB0aGUgcGFyZW50IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdC8vIEJ1aWxkIGEgY2hhbmdlc2V0IFVSSSB3aXRoIGEgcHJvZHVjZXItZGVmaW5lZCBpZCB3ZSBkb24ndFxuXHRcdFx0Ly8gcmVjb2duaXNlIChgc3RhZ2VkYCkuIFRoZSB1bmtub3duLWNoYW5nZXNldCBlYXJseSB0aHJvdyBtdXN0XG5cdFx0XHQvLyBmaXJlIGJlZm9yZSB0aGUgc2Vzc2lvbi1yZXN0b3JlIGZhbGxiYWNrIHNvIHRoZSBwYXJlbnQgc2Vzc2lvblxuXHRcdFx0Ly8gaXMgbm90IG1hdGVyaWFsaXplZCBhcyBhIHNpZGUgZWZmZWN0IG9mIHN1YnNjcmliaW5nIHRvIGEgY2hpbGRcblx0XHRcdC8vIGNoYW5nZXNldCBVUkkuXG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9taXNzaW5nLXNlc3Npb24nIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBgJHtzZXNzaW9uVXJpfS9jaGFuZ2VzZXQvc3RhZ2VkYDtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShjaGFuZ2VzZXRVcmkpLCAnY2xpZW50LWNzLXVua25vd24nKSxcblx0XHRcdFx0L3Vua25vd24gY2hhbmdlc2V0IHJlc291cmNlLyxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQncGFyZW50IHNlc3Npb24gbXVzdCBub3QgYmUgbWF0ZXJpYWxpemVkIGFzIGEgc2lkZSBlZmZlY3Qgb2YgYW4gdW5rbm93biBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIHN0b3JlcyBsaXZlIHNlc3Npb24gY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IGNvbmZpZyA9IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL2NvbmZpZycgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnLCBjb25maWcgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNvbmZpZz8udmFsdWVzLCBjb25maWcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VlZHMgYWN0aXZlQ2xpZW50IGludG8gdGhlIGluaXRpYWwgc2Vzc2lvbiBzdGF0ZSB3aGVuIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRBY3Rpb24oZW52ID0+IGVudmVsb3Blcy5wdXNoKGVudikpKTtcblxuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50OiBTZXNzaW9uQWN0aXZlQ2xpZW50ID0ge1xuXHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC1lYWdlcicsXG5cdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAndDEnLCBkZXNjcmlwdGlvbjogJ2QnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyB9IH1dLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbi1hJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLCBuYW1lOiAnQScsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcsIGFjdGl2ZUNsaWVudCB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFjdGl2ZUNsaWVudHM6IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy5hY3RpdmVDbGllbnRzLFxuXHRcdFx0XHRkaXNwYXRjaGVkQWN0aXZlQ2xpZW50U2V0OiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFjdGl2ZUNsaWVudHM6IFthY3RpdmVDbGllbnRdLFxuXHRcdFx0XHRkaXNwYXRjaGVkQWN0aXZlQ2xpZW50U2V0OiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgYWN0aXZlQ2xpZW50IGZyb20gdGhlIGluaXRpYWwgc2Vzc2lvbiBzdGF0ZSB3aGVuIG5vdCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8uYWN0aXZlQ2xpZW50cywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGF1dGhlbnRpY2F0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnYXV0aGVudGljYXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncm91dGVzIHRva2VuIHRvIHByb3ZpZGVyIG1hdGNoaW5nIHRoZSByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAnZ2hwX3Rlc3QxMjMnIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBhdXRoZW50aWNhdGVkOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3BpbG90QWdlbnQuYXV0aGVudGljYXRlQ2FsbHMsIFt7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAnZ2hwX3Rlc3QxMjMnIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm90IGF1dGhlbnRpY2F0ZWQgZm9yIHVua25vd24gcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogJ2h0dHBzOi8vdW5rbm93bi5leGFtcGxlLmNvbScsIHRva2VuOiAndG9rJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgdG9rZW46IHNlcnZpY2UuZ2V0QXV0aFRva2VuKHsgcmVzb3VyY2U6ICdodHRwczovL3Vua25vd24uZXhhbXBsZS5jb20nIH0pLCBhdXRoZW50aWNhdGVDYWxsczogY29waWxvdEFnZW50LmF1dGhlbnRpY2F0ZUNhbGxzIH0sIHtcblx0XHRcdFx0cmVzdWx0OiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHRva2VuOiB1bmRlZmluZWQsXG5cdFx0XHRcdGF1dGhlbnRpY2F0ZUNhbGxzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmVzIEdpdEh1YiBDb3BpbG90IHRva2VuIGZvciBvcGVyYXRpb24gaGFuZGxlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLnJlc291cmNlLCB0b2tlbjogJ2NvcGlsb3QtdG9rZW4nIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCB0b2tlbjogc2VydmljZS5nZXRBdXRoVG9rZW4oeyByZXNvdXJjZTogR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLnJlc291cmNlLCBzY29wZXM6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5zY29wZXNfc3VwcG9ydGVkIH0pLCBhdXRoZW50aWNhdGVDYWxsczogY29waWxvdEFnZW50LmF1dGhlbnRpY2F0ZUNhbGxzIH0sIHtcblx0XHRcdFx0cmVzdWx0OiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfSxcblx0XHRcdFx0dG9rZW46ICdjb3BpbG90LXRva2VuJyxcblx0XHRcdFx0YXV0aGVudGljYXRlQ2FsbHM6IFt7IHJlc291cmNlOiBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UsIHRva2VuOiAnY29waWxvdC10b2tlbicgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlcyB0b2tlbnMgZm9yIHRoZSBzYW1lIHJlc291cmNlIGJ5IHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UsIHNjb3BlczogWydyZWFkOnVzZXInXSwgdG9rZW46ICdyZWFkLXRva2VuJyB9KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuYXV0aGVudGljYXRlKHsgcmVzb3VyY2U6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQ6dXNlcicsICd1c2VyOmVtYWlsJ10sIHRva2VuOiAncHJvZmlsZS10b2tlbicgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZWFkVG9rZW46IHNlcnZpY2UuZ2V0QXV0aFRva2VuKHsgcmVzb3VyY2U6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQ6dXNlciddIH0pLFxuXHRcdFx0XHRwcm9maWxlVG9rZW46IHNlcnZpY2UuZ2V0QXV0aFRva2VuKHsgcmVzb3VyY2U6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3VzZXI6ZW1haWwnLCAncmVhZDp1c2VyJ10gfSksXG5cdFx0XHRcdHN1cGVyc2V0VG9rZW46IHNlcnZpY2UuZ2V0QXV0aFRva2VuKHsgcmVzb3VyY2U6IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3VzZXI6ZW1haWwnXSB9KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVhZFRva2VuOiAncmVhZC10b2tlbicsXG5cdFx0XHRcdHByb2ZpbGVUb2tlbjogJ3Byb2ZpbGUtdG9rZW4nLFxuXHRcdFx0XHRzdXBlcnNldFRva2VuOiAncHJvZmlsZS10b2tlbicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgYW4gYWxyZWFkeSBoYW5kbGVkIE1DUCB0b2tlbiBhZnRlciByZXRyeWluZyBzZXNzaW9uIGhhbmRsZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWNwQWdlbnQgPSBuZXcgTW9ja0FnZW50KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1jcEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbWNwQWdlbnRDb250cmFjdDogSUFnZW50ID0gbWNwQWdlbnQ7XG5cdFx0XHRsZXQgaGFuZGxlckNhbGxzID0gMDtcblx0XHRcdG1jcEFnZW50Q29udHJhY3QuaGFuZGxlQXV0aGVudGljYXRpb25Ub2tlbiA9IGFzeW5jICgpID0+ICsraGFuZGxlckNhbGxzID09PSAxO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKG1jcEFnZW50Q29udHJhY3QpO1xuXG5cdFx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHNlcnZpY2UuYXV0aGVudGljYXRlKHsgcmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsIHNjb3BlczogWyd3cml0ZScsICdyZWFkJ10sIHRva2VuOiAndG9rZW4tMScgfSk7XG5cdFx0XHRjb25zdCBkdXBsaWNhdGUgPSBhd2FpdCBzZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLCBzY29wZXM6IFsncmVhZCcsICd3cml0ZSddLCB0b2tlbjogJ3Rva2VuLTEnIH0pO1xuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBhd2FpdCBzZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLCBzY29wZXM6IFsncmVhZCcsICd3cml0ZSddLCB0b2tlbjogJ3Rva2VuLTInIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZmlyc3QsIGR1cGxpY2F0ZSwgcmVwbGFjZW1lbnQsIGhhbmRsZXJDYWxscyB9LCB7XG5cdFx0XHRcdGZpcnN0OiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfSxcblx0XHRcdFx0ZHVwbGljYXRlOiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfSxcblx0XHRcdFx0cmVwbGFjZW1lbnQ6IHsgYXV0aGVudGljYXRlZDogZmFsc2UgfSxcblx0XHRcdFx0aGFuZGxlckNhbGxzOiAzLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBoaWRlIGEgc2Vzc2lvbiBoYW5kbGVyIHJlamVjdGlvbiB3aXRoIGFuIGFjY2VwdGVkIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWNwQWdlbnQgPSBuZXcgTW9ja0FnZW50KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1jcEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbWNwQWdlbnRDb250cmFjdDogSUFnZW50ID0gbWNwQWdlbnQ7XG5cdFx0XHRsZXQgaGFuZGxlckNhbGxzID0gMDtcblx0XHRcdG1jcEFnZW50Q29udHJhY3QuaGFuZGxlQXV0aGVudGljYXRpb25Ub2tlbiA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aGFuZGxlckNhbGxzKys7XG5cdFx0XHRcdGlmIChoYW5kbGVyQ2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZhaWxlZCcpO1xuXHRcdFx0fTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihtY3BBZ2VudENvbnRyYWN0KTtcblxuXHRcdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLCB0b2tlbjogJ3Rva2VuLTEnIH0pO1xuXHRcdFx0Y29uc3QgZHVwbGljYXRlID0gYXdhaXQgc2VydmljZS5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJywgdG9rZW46ICd0b2tlbi0xJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGZpcnN0LCBkdXBsaWNhdGUsIGhhbmRsZXJDYWxscyB9LCB7XG5cdFx0XHRcdGZpcnN0OiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfSxcblx0XHRcdFx0ZHVwbGljYXRlOiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdGhhbmRsZXJDYWxsczogMixcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFucyBvdXQgdG8gZXZlcnkgcHJvdmlkZXIgdGhhdCBvd25zIHRoZSByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFR3byBwcm92aWRlcnMgc2hhcmUgdGhlIHNhbWUgcHJvdGVjdGVkIHJlc291cmNlICh0aGUgcmVhbFxuXHRcdFx0Ly8gbW90aXZhdGluZyBleGFtcGxlOiBib3RoIENvcGlsb3QgQ0xJIGFuZCBDbGF1ZGUgY29uc3VtZSB0aGVcblx0XHRcdC8vIEdpdEh1YiBDb3BpbG90IHRva2VuKS4gQm90aCBtdXN0IHNlZSB0aGUgdG9rZW4gXHUyMDE0IHRoZVxuXHRcdFx0Ly8gcHJldmlvdXMgZm9yLWxvb3Agc2hvcnQtY2lyY3VpdCBvbmx5IGRlbGl2ZXJlZCB0byB0aGUgZmlyc3QuXG5cdFx0XHRjb25zdCBjbGF1ZGVBZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NsYXVkZScpO1xuXHRcdFx0Y2xhdWRlQWdlbnQuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzID0gKCkgPT4gW3sgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aCddLCByZXF1aXJlZDogdHJ1ZSB9XTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2xhdWRlQWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjbGF1ZGVBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuYXV0aGVudGljYXRlKHsgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgdG9rZW46ICd0b2snIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRjb3BpbG90Q2FsbHM6IGNvcGlsb3RBZ2VudC5hdXRoZW50aWNhdGVDYWxscyxcblx0XHRcdFx0Y2xhdWRlQ2FsbHM6IGNsYXVkZUFnZW50LmF1dGhlbnRpY2F0ZUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IHsgYXV0aGVudGljYXRlZDogdHJ1ZSB9LFxuXHRcdFx0XHRjb3BpbG90Q2FsbHM6IFt7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAndG9rJyB9XSxcblx0XHRcdFx0Y2xhdWRlQ2FsbHM6IFt7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAndG9rJyB9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNvbGF0ZXMgYSBwcm92aWRlciB0aGF0IHRocm93cyBcdTIwMTQgb3RoZXJzIHN0aWxsIGF1dGhlbnRpY2F0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IGlmIGFueSBwcm92aWRlcidzIGF1dGhlbnRpY2F0ZSgpIHJlamVjdHMsIHRoZVxuXHRcdFx0Ly8gZmFuLW91dCBtdXN0IE5PVCBzaW5rIHRoZSBvdGhlcnMuIFByZXZpb3VzbHkgdGhlIGNhbGwgdXNlZFxuXHRcdFx0Ly8gUHJvbWlzZS5hbGwsIHdoaWNoIHByb3BhZ2F0ZWQgdGhlIGZpcnN0IHJlamVjdGlvbi5cblx0XHRcdGNvbnN0IGZsYWt5QWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjbGF1ZGUnKTtcblx0XHRcdGZsYWt5QWdlbnQuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzID0gKCkgPT4gW3sgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aCddLCByZXF1aXJlZDogdHJ1ZSB9XTtcblx0XHRcdGZsYWt5QWdlbnQuYXV0aGVudGljYXRlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Byb3h5IGJpbmQgZmFpbGVkJyk7IH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGZsYWt5QWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihmbGFreUFnZW50KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCB0b2tlbjogJ3RvaycgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdGNvcGlsb3RDYWxsczogY29waWxvdEFnZW50LmF1dGhlbnRpY2F0ZUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IHsgYXV0aGVudGljYXRlZDogdHJ1ZSB9LFxuXHRcdFx0XHRjb3BpbG90Q2FsbHM6IFt7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAndG9rJyB9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwb3J0cyBub3QgYXV0aGVudGljYXRlZCB3aGVuIGV2ZXJ5IG1hdGNoaW5nIHByb3ZpZGVyIHJlamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBbGwgbWF0Y2hpbmcgcHJvdmlkZXJzIGZhaWwgXHUyMDE0IHRoZSByZXN1bHQgbXVzdCBiZVxuXHRcdFx0Ly8geyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9IHJhdGhlciB0aGFuIGEgdGhyb3duIGVycm9yLlxuXHRcdFx0Y29uc3QgZmxha3lBID0gbmV3IE1vY2tBZ2VudCgnY2xhdWRlJyk7XG5cdFx0XHRjb25zdCBmbGFreUIgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0XHRmbGFreUEuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzID0gKCkgPT4gW3sgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aCddLCByZXF1aXJlZDogdHJ1ZSB9XTtcblx0XHRcdGZsYWt5Qi5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMgPSAoKSA9PiBbeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCBhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9naXRodWIuY29tL2xvZ2luL29hdXRoJ10sIHJlcXVpcmVkOiB0cnVlIH1dO1xuXHRcdFx0Zmxha3lBLmF1dGhlbnRpY2F0ZSA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdBJyk7IH07XG5cdFx0XHRmbGFreUIuYXV0aGVudGljYXRlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0InKTsgfTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZmxha3lBLmRpc3Bvc2UoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBmbGFreUIuZGlzcG9zZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoZmxha3lBKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihmbGFreUIpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAndG9rJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgYXV0aGVudGljYXRlZDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gc2h1dGRvd24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzaHV0ZG93bicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NodXRzIGRvd24gYWxsIHByb3ZpZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjb3BpbG90U2h1dGRvd24gPSBmYWxzZTtcblx0XHRcdGNvcGlsb3RBZ2VudC5zaHV0ZG93biA9IGFzeW5jICgpID0+IHsgY29waWxvdFNodXRkb3duID0gdHJ1ZTsgfTtcblxuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2h1dGRvd24oKTtcblx0XHRcdGFzc2VydC5vayhjb3BpbG90U2h1dGRvd24pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHJlc3RvcmVTZXNzaW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncmVzdG9yZVNlc3Npb24nLCAoKSA9PiB7XG5cblx0XHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yRHJhZnQoZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2UsIGNoYXQ6IFVSSSwgZXhwZWN0ZWQ6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjA7IGkrKykge1xuXHRcdFx0XHRpZiAoSlNPTi5zdHJpbmdpZnkoYXdhaXQgZGIuZ2V0Q2hhdERyYWZ0KGNoYXQpKSA9PT0gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1KSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGRiLmdldENoYXREcmFmdChjaGF0KSwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIHRoZSBBSC1vd25lZCB3b3Jrc3BhY2VsZXNzIG1hcmtlciBvbnRvIHRoZSBzdW1tYXJ5IF9tZXRhIGZvciBhbnkgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgd29ya3NwYWNlLWxlc3MgbWFya2VyIGlzIG93bmVkIGJ5IHRoZSBBSCBzZXJ2aWNlIGFuZCBvdmVybGFpZCBvblxuXHRcdFx0Ly8gcmVzdG9yZSBmcm9tIHRoZSBjZW50cmFsIHNlc3Npb24gREIgXHUyMDE0IHRoZSBhZ2VudCAoTW9ja0FnZW50KSByZS1lbWl0c1xuXHRcdFx0Ly8gbm90aGluZyBpdHNlbGYsIHlldCB0aGUgcmVzdG9yZWQgc2Vzc2lvbiBzdGlsbCBjYXJyaWVzIHRoZSB0YWcuXG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0YXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IChhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCkpWzBdLnNlc3Npb247XG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW107XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnYWdlbnRIb3N0LndvcmtzcGFjZWxlc3MnLCAndHJ1ZScpO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk/Ll9tZXRhLCB7IHdvcmtzcGFjZWxlc3M6IHRydWUgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBhIHNlc3Npb24gd2l0aCBtZXNzYWdlIGhpc3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGkgdGhlcmUhJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUsICdzZXNzaW9uIHNob3VsZCBiZSBpbiBzdGF0ZSBtYW5hZ2VyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLmxpZmVjeWNsZSwgU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ0hlbGxvJyk7XG5cdFx0XHRjb25zdCBtZFBhcnQgPSBzdGF0ZSEudHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKChwKTogcCBpcyBNYXJrZG93blJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kUGFydCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRQYXJ0LmNvbnRlbnQsICdIaSB0aGVyZSEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZSEudHVybnNbMF0uc3RhdGUsIFR1cm5TdGF0ZS5Db21wbGV0ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS1hdHRhY2hlcyBwZXJzaXN0ZWQgdHVybiB1c2FnZSBvbiByZXN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUHJvdmlkZXJzIGRvbid0IGR1cmFibHkgcmVjb3JkIHRva2VuL2NyZWRpdCB1c2FnZSAodGhlIENvcGlsb3Rcblx0XHRcdC8vIFNESydzIGBhc3Npc3RhbnQudXNhZ2VgIGV2ZW50IGlzIGV4cGxpY2l0bHkgZXBoZW1lcmFsKSwgc28gd2l0aG91dFxuXHRcdFx0Ly8gdGhlIGhvc3Qtc2lkZSBvdmVybGF5IGEgcmVsb2FkZWQgc2Vzc2lvbiBjb21lcyBiYWNrIHdpdGggbm9cblx0XHRcdC8vIGNvbnRleHQtdXNhZ2UgZ2F1Z2UgYW5kIGEgc2Vzc2lvbiBjb3N0IG9mIDAuXG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gKGF3YWl0IGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMoKSlbMF0uc2Vzc2lvbjtcblx0XHRcdGNvcGlsb3RBZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0hpIHRoZXJlIScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuVXNhZ2UoJ21zZy0xJywgSlNPTi5zdHJpbmdpZnkoeyBpbnB1dFRva2VuczogMTAwLCBvdXRwdXRUb2tlbnM6IDIwLCBtb2RlbDogJ2dwdC01JyB9KSk7XG5cblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk/LnR1cm5zLm1hcCh0ID0+IHQudXNhZ2UpLFxuXHRcdFx0XHRbeyBpbnB1dFRva2VuczogMTAwLCBvdXRwdXRUb2tlbnM6IDIwLCBtb2RlbDogJ2dwdC01JyB9XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS1hdHRhY2hlcyB1c2FnZSBvdmVyIGFuIEF1dG8tbW9kZWwgc3R1YiwgcHJlc2VydmluZyB0aGUgcm91dGluZyBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgdHVybiB0aGF0IHJhbiBvbiBDb3BpbG90IEF1dG8gaXMgcmVzdG9yZWQgd2l0aCBhIHRva2VuLWxlc3Mgc3R1YlxuXHRcdFx0Ly8gKGB7IG1vZGVsLCBfbWV0YTogeyBhdXRvTW9kZVJlc29sdmVkIH0gfWAsIHNlZSBtYXBTZXNzaW9uRXZlbnRzKVxuXHRcdFx0Ly8gYmVjYXVzZSB0aGUgcm91dGluZyBkZWNpc2lvbiBJUyBwZXJzaXN0ZWQgd2hpbGUgdGhlIHVzYWdlIGV2ZW50IGlzXG5cdFx0XHQvLyBub3QuIFRyZWF0aW5nIHRoYXQgc3R1YiBhcyBcImFscmVhZHkgaGFzIHVzYWdlXCIgd291bGQgc2tpcCBleGFjdGx5XG5cdFx0XHQvLyB0aGUgdHVybnMgbmVlZGluZyByZS1hdHRhY2htZW50IFx1MjAxNCBhbmQgQXV0byBpcyB0aGUgZGVmYXVsdCBtb2RlbC5cblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGF1dG9Nb2RlUmVzb2x2ZWQgPSB7IGNob3Nlbk1vZGVsOiAnY2xhdWRlLW9wdXMtNC44JywgcHJlZGljdGVkTGFiZWw6ICduZWVkc19yZWFzb25pbmcnLCBjb25maWRlbmNlOiAwLjkzIH07XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0FnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0YWdlbnQudHVyblVzYWdlT3ZlcnJpZGUgPSB7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC44JywgX21ldGE6IHsgYXV0b01vZGVSZXNvbHZlZCB9IH07XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IChhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKSlbMF0uc2Vzc2lvbjtcblx0XHRcdGFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGkgdGhlcmUhJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgnbXNnLTEnLCBKU09OLnN0cmluZ2lmeSh7IGlucHV0VG9rZW5zOiAxMDAsIG91dHB1dFRva2VuczogMjAsIG1vZGVsOiAnY2xhdWRlLW9wdXMtNC44JywgX21ldGE6IHsgY29waWxvdFVzYWdlOiB7IHRvdGFsTmFub0FpdTogNV8wMDBfMDAwXzAwMCB9IH0gfSkpO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpPy50dXJucy5tYXAodCA9PiB0LnVzYWdlKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRpbnB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRcdG91dHB1dFRva2VuczogMjAsXG5cdFx0XHRcdFx0bW9kZWw6ICdjbGF1ZGUtb3B1cy00LjgnLFxuXHRcdFx0XHRcdC8vIFRoZSBzdHViJ3Mgcm91dGluZyBtZXRhZGF0YSBzdXJ2aXZlcyBhbG9uZ3NpZGUgdGhlIHBlcnNpc3RlZCB1c2FnZS5cblx0XHRcdFx0XHRfbWV0YTogeyBhdXRvTW9kZVJlc29sdmVkLCBjb3BpbG90VXNhZ2U6IHsgdG90YWxOYW5vQWl1OiA1XzAwMF8wMDBfMDAwIH0gfSxcblx0XHRcdFx0fV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW50ZXJsZWF2ZXMgcGVyc2lzdGVkIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybnMgYWZ0ZXIgdGhlaXIgYW5jaG9yIG9uIHJlc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gKGF3YWl0IGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMoKSlbMF0uc2Vzc2lvbjtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdC8vIFNESyB0cmFuc2NyaXB0IHJlY29uc3RydWN0cyBhIHNpbmdsZSByZWFsIHR1cm4ga2V5ZWQgYnkgdGhlIHVzZXJcblx0XHRcdC8vIGVudmVsb3BlIGlkIChgbXNnLXJlYWxgLCBwZXIgbWFwU2Vzc2lvbkV2ZW50cykuXG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctcmVhbCcsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctcmVhbC1hJywgY29udGVudDogJ0hpIHRoZXJlIScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdC8vIEEgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJuIGFuY2hvcmVkIGFmdGVyIHRoZSByZWFsIHR1cm4sIHBsdXMgb25lXG5cdFx0XHQvLyB3aXRoIG5vIGFuY2hvciAocHJlY2VkZXMgYW55IHJlYWwgdHVybiksIHBsdXMgYW4gb3JwaGFuIHdob3NlXG5cdFx0XHQvLyBhbmNob3IgaXMgYWJzZW50IGZyb20gdGhlIFNESyB0cmFuc2NyaXB0IChzaG91bGQgYmUgZHJvcHBlZCkuXG5cdFx0XHRjb25zdCBsb2NhbFR1cm4gPSAoaWQ6IHN0cmluZywgdGV4dDogc3RyaW5nKSA9PiAoeyBpZCwgbWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sIHJlc3BvbnNlUGFydHM6IFtdLCB1c2FnZTogdW5kZWZpbmVkLCBzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlIH0pO1xuXHRcdFx0YXdhaXQgZGIuaW5zZXJ0TG9jYWxUdXJuKHsgdHVybklkOiAnbG9jYWwtaGVhZCcsIGNoYXRVcmk6IGRlZmF1bHRDaGF0VXJpLCBhbmNob3JUdXJuSWQ6IHVuZGVmaW5lZCwgc2VxOiAxLCBwYXlsb2FkOiBKU09OLnN0cmluZ2lmeShsb2NhbFR1cm4oJ2xvY2FsLWhlYWQnLCAnIXB3ZCcpKSB9KTtcblx0XHRcdGF3YWl0IGRiLmluc2VydExvY2FsVHVybih7IHR1cm5JZDogJ2xvY2FsLWFmdGVyJywgY2hhdFVyaTogZGVmYXVsdENoYXRVcmksIGFuY2hvclR1cm5JZDogJ21zZy1yZWFsJywgc2VxOiAyLCBwYXlsb2FkOiBKU09OLnN0cmluZ2lmeShsb2NhbFR1cm4oJ2xvY2FsLWFmdGVyJywgJyFscycpKSB9KTtcblx0XHRcdGF3YWl0IGRiLmluc2VydExvY2FsVHVybih7IHR1cm5JZDogJ2xvY2FsLW9ycGhhbicsIGNoYXRVcmk6IGRlZmF1bHRDaGF0VXJpLCBhbmNob3JUdXJuSWQ6ICdnb25lJywgc2VxOiAzLCBwYXlsb2FkOiBKU09OLnN0cmluZ2lmeShsb2NhbFR1cm4oJ2xvY2FsLW9ycGhhbicsICchZWNobycpKSB9KTtcblxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gaGVhZCAobm8gYW5jaG9yKSBmaXJzdCwgdGhlbiB0aGUgcmVhbCB0dXJuLCB0aGVuIGl0cyBhbmNob3JlZCBsb2NhbDsgb3JwaGFuIGRyb3BwZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlIS50dXJucy5tYXAodCA9PiB0LmlkKSwgWydsb2NhbC1oZWFkJywgJ21zZy1yZWFsJywgJ2xvY2FsLWFmdGVyJ10pO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdyZXN0b3JlcyB0aGUgZGVmYXVsdCBjaGF0XFwncyBpbmRlcGVuZGVudGx5LXJlbmFtZWQgdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0YXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IChhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCkpWzBdLnNlc3Npb247XG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW107XG5cblx0XHRcdC8vIFRoZSBob3N0IHBlcnNpc3RzIGFuIGluZGVwZW5kZW50IGRlZmF1bHQtY2hhdCByZW5hbWUgdW5kZXIgdGhpcyBrZXk7XG5cdFx0XHQvLyByZXN0b3JlIG11c3Qgc2VlZCBpdCBiYWNrIG9yIHRoZSBtYWluIGNoYXQgdGFiIHJldmVydHMgdG8gdGhlIHNlc3Npb24gdGl0bGUuXG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXdhaXQgZGIuc2V0TWV0YWRhdGEoYGN1c3RvbUNoYXRUaXRsZToke2RlZmF1bHRDaGF0VXJpfWAsICdSZW5hbWVkIERlZmF1bHQgQ2hhdCcpO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBkZWZhdWx0Q2hhdFVyaSk/LnRpdGxlLCAnUmVuYW1lZCBEZWZhdWx0IENoYXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlcnNpc3RzIGNoYXQgZHJhZnRzIHRvIHNlc3Npb24gbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IGRyYWZ0ID0ge1xuXHRcdFx0XHR0ZXh0OiAnZHJhZnQgdGV4dCcsXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiAnb3B1cy00LjcnIH0sXG5cdFx0XHRcdGFnZW50OiB7IHVyaTogJ2FnZW50Oi8vcmV2aWV3ZXInIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRsb2NhbFNlcnZpY2UuZGlzcGF0Y2hBY3Rpb24oYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCxcblx0XHRcdFx0ZHJhZnQsXG5cdFx0XHR9LCAndGVzdC1jbGllbnQnLCAxKTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvckRyYWZ0KGRiLCBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpKSwgZHJhZnQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgY2hhdCBkcmFmdHMgZnJvbSBzZXNzaW9uIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IChhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCkpWzBdLnNlc3Npb247XG5cdFx0XHRjb25zdCBkcmFmdCA9IHtcblx0XHRcdFx0dGV4dDogJ3Jlc3RvcmVkIGRyYWZ0Jyxcblx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0bW9kZWw6IHsgaWQ6ICdvcHVzLTQuNycgfSxcblx0XHRcdFx0YWdlbnQ6IHsgdXJpOiAnYWdlbnQ6Ly9yZXZpZXdlcicgfSxcblx0XHRcdH07XG5cdFx0XHRhd2FpdCBkYi5zZXRDaGF0RHJhZnQoVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpKSwgZHJhZnQpO1xuXHRcdFx0KGNvcGlsb3RBZ2VudCBhcyBNb2NrQWdlbnQgJiB7IGdldENoYXREcmFmdChjaGF0OiBVUkkpOiBQcm9taXNlPHR5cGVvZiBkcmFmdCB8IHVuZGVmaW5lZD4gfSkuZ2V0Q2hhdERyYWZ0ID0gY2hhdCA9PiBkYi5nZXRDaGF0RHJhZnQoY2hhdCkgYXMgUHJvbWlzZTx0eXBlb2YgZHJhZnQgfCB1bmRlZmluZWQ+O1xuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtdO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy5kcmFmdCwgZHJhZnQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgYSBzZXNzaW9uIHdpdGggdG9vbCBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdSdW4gYSBjb21tYW5kJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0kgd2lsbCBydW4gYSBjb21tYW5kLicsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAnc2hlbGwnIH1dIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfc3RhcnQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnc2hlbGwnLCBkaXNwbGF5TmFtZTogJ1NoZWxsJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGNvbW1hbmQuLi4nIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfY29tcGxldGUnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtMScsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGNvbW1hbmQnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ291dHB1dCcgfV0gfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0zJywgY29udGVudDogJ0RvbmUhJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUpO1xuXHRcdFx0Y29uc3QgdHVybiA9IHN0YXRlIS50dXJuc1swXTtcblx0XHRcdGNvbnN0IHRvb2xDYWxsUGFydHMgPSB0dXJuLnJlc3BvbnNlUGFydHMuZmlsdGVyKChwKTogcCBpcyBUb29sQ2FsbFJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsUGFydHMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IHRjID0gdG9vbENhbGxQYXJ0c1swXS50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRjLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0Yy50b29sQ2FsbElkLCAndGMtMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRjLmNvbmZpcm1lZCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ludGVybGVhdmVzIHJlYXNvbmluZywgbWFya2Rvd24sIGFuZCB0b29sIGNhbGxzIGluIHN0cmVhbSBvcmRlciBvbiByZXN1bWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAndS0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ2EtMScsIGNvbnRlbnQ6ICdSZXBseSBBJywgcmVhc29uaW5nVGV4dDogJ1RoaW5raW5nIEEnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ3NoZWxsJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3N0YXJ0Jywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZy4uLicgfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF9jb21wbGV0ZScsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy0xJywgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4nLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ29rJyB9XSB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnYS0yJywgY29udGVudDogJ1JlcGx5IEInLCByZWFzb25pbmdUZXh0OiAnVGhpbmtpbmcgQicsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlKTtcblx0XHRcdGNvbnN0IHR1cm4gPSBzdGF0ZSEudHVybnNbMF07XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gdHVybi5yZXNwb25zZVBhcnRzLm1hcChwID0+IHtcblx0XHRcdFx0aWYgKHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcpIHsgcmV0dXJuIFsncmVhc29uaW5nJywgcC5jb250ZW50XTsgfVxuXHRcdFx0XHRpZiAocC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKSB7IHJldHVybiBbJ21hcmtkb3duJywgcC5jb250ZW50XTsgfVxuXHRcdFx0XHRpZiAocC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7IHJldHVybiBbJ3Rvb2xDYWxsJywgcC50b29sQ2FsbC50b29sQ2FsbElkXTsgfVxuXHRcdFx0XHRyZXR1cm4gWydvdGhlciddO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1bW1hcnksIFtcblx0XHRcdFx0WydyZWFzb25pbmcnLCAnVGhpbmtpbmcgQSddLFxuXHRcdFx0XHRbJ21hcmtkb3duJywgJ1JlcGx5IEEnXSxcblx0XHRcdFx0Wyd0b29sQ2FsbCcsICd0Yy0xJ10sXG5cdFx0XHRcdFsncmVhc29uaW5nJywgJ1RoaW5raW5nIEInXSxcblx0XHRcdFx0WydtYXJrZG93bicsICdSZXBseSBCJ10sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZsdXNoZXMgaW50ZXJydXB0ZWQgdHVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSW50ZXJydXB0ZWQnLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ1JldHJpZWQnLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTMnLCBjb250ZW50OiAnQW5zd2VyJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlIS50dXJucy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlIS50dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNhbmNlbGxlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zWzFdLnN0YXRlLCBUdXJuU3RhdGUuQ29tcGxldGUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gc2Vzc2lvbiBpcyBub3QgZm91bmQgb24gYmFja2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdub25leGlzdGVudCcpKSxcblx0XHRcdFx0L1Nlc3Npb24gbm90IGZvdW5kIG9uIGJhY2tlbmQvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIGtub3duIHNlc3Npb24gd2l0aG91dCBsaXN0aW5nIGFsbCBwcm92aWRlciBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0c2VydmljZS5zdGF0ZU1hbmFnZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdGxldCBsaXN0U2Vzc2lvbnNDYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxpc3RTZXNzaW9uc0NhbGxlZCA9IHRydWU7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigncmVzdG9yZVNlc3Npb24gc2hvdWxkIG5vdCBlbnVtZXJhdGUgc2Vzc2lvbnMnKTtcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0U2Vzc2lvbnNDYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGxpc3Rpbmcgc2Vzc2lvbnMgd2hlbiBkaXJlY3QgbWV0YWRhdGEgcmVzdG9yZSBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0c2VydmljZS5zdGF0ZU1hbmFnZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdGNvcGlsb3RBZ2VudC5nZXRTZXNzaW9uTWV0YWRhdGEgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZGlyZWN0IG1ldGFkYXRhIHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxMaXN0U2Vzc2lvbnMgPSBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zLmJpbmQoY29waWxvdEFnZW50KTtcblx0XHRcdGxldCBsaXN0U2Vzc2lvbnNDYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxpc3RTZXNzaW9uc0NhbGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbExpc3RTZXNzaW9ucygpO1xuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxpc3RTZXNzaW9uc0NhbGxlZCxcblx0XHRcdFx0cmVzdG9yZWQ6ICEhc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxpc3RTZXNzaW9uc0NhbGxlZDogdHJ1ZSxcblx0XHRcdFx0cmVzdG9yZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvYWxlc2NlcyBjb25jdXJyZW50IHJlc3RvcmVzIGZvciB0aGUgc2FtZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgQmxvY2tpbmdSZXN0b3JlQWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRyZWFkb25seSBtZXRhZGF0YVJlYWNoZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdHJlYWRvbmx5IG1ldGFkYXRhR2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0Z2V0U2Vzc2lvbk1ldGFkYXRhQ2FsbHMgPSAwO1xuXHRcdFx0XHRnZXRTZXNzaW9uTWVzc2FnZXNDYWxscyA9IDA7XG5cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb246IFVSSSkge1xuXHRcdFx0XHRcdHRoaXMuZ2V0U2Vzc2lvbk1ldGFkYXRhQ2FsbHMrKztcblx0XHRcdFx0XHR0aGlzLm1ldGFkYXRhUmVhY2hlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMubWV0YWRhdGFHYXRlLnA7XG5cdFx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdFx0XHRcdHRoaXMuZ2V0U2Vzc2lvbk1lc3NhZ2VzQ2FsbHMrKztcblx0XHRcdFx0XHRyZXR1cm4gc3VwZXIuZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBCbG9ja2luZ1Jlc3RvcmVBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBmaXJzdFJlc3RvcmUgPSBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0YXdhaXQgYWdlbnQubWV0YWRhdGFSZWFjaGVkLnA7XG5cdFx0XHRjb25zdCBzZWNvbmRSZXN0b3JlID0gc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LmdldFNlc3Npb25NZXRhZGF0YUNhbGxzLCAxKTtcblx0XHRcdGFnZW50Lm1ldGFkYXRhR2F0ZS5jb21wbGV0ZSgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0UmVzdG9yZSwgc2Vjb25kUmVzdG9yZV0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWV0YWRhdGFDYWxsczogYWdlbnQuZ2V0U2Vzc2lvbk1ldGFkYXRhQ2FsbHMsXG5cdFx0XHRcdG1lc3NhZ2VDYWxsczogYWdlbnQuZ2V0U2Vzc2lvbk1lc3NhZ2VzQ2FsbHMsXG5cdFx0XHRcdHJlc3RvcmVkOiAhIXNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtZXRhZGF0YUNhbGxzOiAxLFxuXHRcdFx0XHRtZXNzYWdlQ2FsbHM6IDEsXG5cdFx0XHRcdHJlc3RvcmVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoeWRyYXRlcyBzZXNzaW9uIGN1c3RvbWl6YXRpb25zIHdoZW4gcmVzdG9yaW5nIGFuIGV4aXN0aW5nIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXHRcdFx0bGV0IGdldFNlc3Npb25DdXN0b21pemF0aW9uc0NhbGxzID0gMDtcblx0XHRcdGNvcGlsb3RBZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uc0NhbGxzKys7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcmVzdG9yZS1za2lsbCcpLCB1cmk6ICdmaWxlOi8vL3Jlc3RvcmUtc2tpbGwnLCBuYW1lOiAnUmVzdG9yZSBTa2lsbCcsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XTtcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmN1c3RvbWl6YXRpb25zO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlc3Npb25DdXN0b21pemF0aW9uc0NhbGxzLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21pemF0aW9ucz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21pemF0aW9ucz8uWzBdPy50eXBlLCBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbWl6YXRpb25zPy5bMF0/Lm5hbWUsICdSZXN0b3JlIFNraWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbnM/LlswXT8uaWQsIGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9yZXN0b3JlLXNraWxsJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbWl6YXRpb25zPy5bMF0/LmVuYWJsZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xlYXJzIGZhaWxlZCByZXN0b3JlIGF0dGVtcHRzIHNvIHNlc3Npb25zIGNhbiBiZSByZXRyaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgRmFpbGluZ09uY2VSZXN0b3JlQWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRzaG91bGRGYWlsUmVzdG9yZSA9IHRydWU7XG5cdFx0XHRcdGdldFNlc3Npb25NZXNzYWdlc0NhbGxzID0gMDtcblxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRTZXNzaW9uTWVzc2FnZXMoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRcdFx0XHR0aGlzLmdldFNlc3Npb25NZXNzYWdlc0NhbGxzKys7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkRmFpbFJlc3RvcmUpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigncmVzdG9yZSBmYWlsZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFpbGluZ09uY2VSZXN0b3JlQWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0hpJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKSwgL3Jlc3RvcmUgZmFpbGVkLyk7XG5cblx0XHRcdGFnZW50LnNob3VsZEZhaWxSZXN0b3JlID0gZmFsc2U7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWVzc2FnZUNhbGxzOiBhZ2VudC5nZXRTZXNzaW9uTWVzc2FnZXNDYWxscyxcblx0XHRcdFx0cmVzdG9yZWQ6ICEhc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG1lc3NhZ2VDYWxsczogMixcblx0XHRcdFx0cmVzdG9yZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIGEgc2Vzc2lvbiB3aXRoIHN1YmFnZW50IHRvb2wgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnUmV2aWV3IHRoaXMgY29kZScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBuYW1lOiAndGFzaycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF9zdGFydCcsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sS2luZDogJ3N1YmFnZW50JyBhcyBjb25zdCwgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycsIHN1YmFnZW50QWdlbnROYW1lOiAnZXhwbG9yZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc3ViYWdlbnRfc3RhcnRlZCcsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyB9LFxuXHRcdFx0XHQvLyBJbm5lciB0b29sIGNhbGxzIGZyb20gdGhlIHN1YmFnZW50IChoYXZlIHBhcmVudFRvb2xDYWxsSWQpXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfc3RhcnQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtaW5uZXItMScsIHRvb2xOYW1lOiAnYmFzaCcsIGRpc3BsYXlOYW1lOiAnQmFzaCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBscy4uLicsIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1zdWInIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfY29tcGxldGUnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtaW5uZXItMScsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGxzJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaWxlMS50cycgfV0gfSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXN1YicgfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF9zdGFydCcsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1pbm5lci0yJywgdG9vbE5hbWU6ICd2aWV3JywgZGlzcGxheU5hbWU6ICdWaWV3IEZpbGUnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZTEudHMnLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLWlubmVyLTInLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ1JlYWQgZmlsZTEudHMnIH0sIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1zdWInIH0sXG5cdFx0XHRcdC8vIFBhcmVudCB0b29sIGNvbXBsZXRlc1xuXHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLXN1YicsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnRGVsZWdhdGVkIHRhc2snLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0ZvdW5kIDMgaXNzdWVzJyB9XSB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTMnLCBjb250ZW50OiAnVGhlIHJldmlldyBmb3VuZCAzIGlzc3Vlcy4nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cblx0XHRcdC8vIFNob3VsZCBwcm9kdWNlIGV4YWN0bHkgb25lIHR1cm5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZSEudHVybnMubGVuZ3RoLCAxLCBgRXhwZWN0ZWQgMSB0dXJuIGJ1dCBnb3QgJHtzdGF0ZSEudHVybnMubGVuZ3RofWApO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gc3RhdGUhLnR1cm5zWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm4ubWVzc2FnZS50ZXh0LCAnUmV2aWV3IHRoaXMgY29kZScpO1xuXG5cdFx0XHQvLyBUaGUgcGFyZW50IHR1cm4gc2hvdWxkIG9ubHkgaGF2ZSB0aGUgcGFyZW50IHRvb2wgY2FsbCBcdTIwMTQgaW5uZXJcblx0XHRcdC8vIHRvb2wgY2FsbHMgYXJlIGV4Y2x1ZGVkIGZyb20gdGhlIHBhcmVudCBhbmQgYmVsb25nIHRvIHRoZVxuXHRcdFx0Ly8gY2hpbGQgc3ViYWdlbnQgc2Vzc2lvbiBpbnN0ZWFkLlxuXHRcdFx0Y29uc3QgdG9vbENhbGxQYXJ0cyA9IHR1cm4ucmVzcG9uc2VQYXJ0cy5maWx0ZXIoKHApOiBwIGlzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0ID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbENhbGxQYXJ0cy5sZW5ndGgsIDEsIGBFeHBlY3RlZCAxIHRvb2wgY2FsbCAocGFyZW50IG9ubHkpIGJ1dCBnb3QgJHt0b29sQ2FsbFBhcnRzLmxlbmd0aH1gKTtcblxuXHRcdFx0Ly8gUGFyZW50IHN1YmFnZW50IHRvb2wgY2FsbFxuXHRcdFx0Y29uc3QgcGFyZW50VGMgPSB0b29sQ2FsbFBhcnRzWzBdLnRvb2xDYWxsIGFzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50VGMudG9vbENhbGxJZCwgJ3RjLXN1YicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudFRjLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJlbnRUYy5fbWV0YT8udG9vbEtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudFRjLl9tZXRhPy5zdWJhZ2VudERlc2NyaXB0aW9uLCAnRmluZCByZWxhdGVkIGZpbGVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50VGMuX21ldGE/LnN1YmFnZW50QWdlbnROYW1lLCAnZXhwbG9yZScpO1xuXG5cdFx0XHQvLyBQYXJlbnQgdG9vbCBzaG91bGQgaGF2ZSBzdWJhZ2VudCBjb250ZW50IGVudHJ5XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcGFyZW50VGMuY29udGVudCA/PyBbXTtcblx0XHRcdGNvbnN0IHN1YmFnZW50RW50cnkgPSBjb250ZW50LmZpbmQoYyA9PiBoYXNLZXkoYywgeyB0eXBlOiB0cnVlIH0pICYmIGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KTtcblx0XHRcdGFzc2VydC5vayhzdWJhZ2VudEVudHJ5LCAnQ29tcGxldGVkIHRvb2wgY2FsbCBzaG91bGQgaGF2ZSBzdWJhZ2VudCBjb250ZW50IGVudHJ5Jyk7XG5cblx0XHRcdC8vIFN1YnNjcmliaW5nIHRvIHRoZSBjaGlsZCBzZXNzaW9uIHNob3VsZCByZXN0b3JlIGl0IHdpdGggaW5uZXIgdG9vbCBjYWxsc1xuXHRcdFx0Y29uc3QgY2hpbGRTZXNzaW9uVXJpID0gYnVpbGRTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksICd0Yy1zdWInKTtcblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgc2VydmljZS5zdWJzY3JpYmUoVVJJLnBhcnNlKGNoaWxkU2Vzc2lvblVyaSksICdjbGllbnQtdGVzdCcpO1xuXHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGlsZFNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNuYXBzaG90Py5zdGF0ZSwgJ0NoaWxkIHNlc3Npb24gc25hcHNob3Qgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2soY2hpbGRTdGF0ZSwgJ0NoaWxkIHNlc3Npb24gc3RhdGUgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRTdGF0ZSEudHVybnMubGVuZ3RoLCAxLCAnQ2hpbGQgc2Vzc2lvbiBzaG91bGQgaGF2ZSAxIHR1cm4nKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbFBhcnRzID0gY2hpbGRTdGF0ZSEudHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maWx0ZXIoKHApOiBwIGlzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0ID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRUb29sUGFydHMubGVuZ3RoLCAyLCBgQ2hpbGQgc2Vzc2lvbiBzaG91bGQgaGF2ZSAyIGlubmVyIHRvb2wgY2FsbHMgYnV0IGdvdCAke2NoaWxkVG9vbFBhcnRzLmxlbmd0aH1gKTtcblx0XHRcdGFzc2VydC5vayhjaGlsZFRvb2xQYXJ0cy5zb21lKHAgPT4gcC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtaW5uZXItMScpLCAnU2hvdWxkIGhhdmUgdGMtaW5uZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoaWxkVG9vbFBhcnRzLnNvbWUocCA9PiBwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1pbm5lci0yJyksICdTaG91bGQgaGF2ZSB0Yy1pbm5lci0yJyk7XG5cblx0XHRcdC8vIFRoZSB0dXJuIHNob3VsZCBhbHNvIGhhdmUgdGhlIGZpbmFsIG1hcmtkb3duXG5cdFx0XHRjb25zdCBtZFBhcnRzID0gdHVybi5yZXNwb25zZVBhcnRzLmZpbHRlcigocCk6IHAgaXMgTWFya2Rvd25SZXNwb25zZVBhcnQgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblx0XHRcdGFzc2VydC5vayhtZFBhcnRzLnNvbWUocCA9PiBwLmNvbnRlbnQuaW5jbHVkZXMoJzMgaXNzdWVzJykpLCAnU2hvdWxkIGhhdmUgdGhlIGZpbmFsIG1hcmtkb3duIHJlc3BvbnNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbm5lciBhc3Npc3RhbnQgbWVzc2FnZXMgZnJvbSBzdWJhZ2VudCBkbyBub3QgY3JlYXRlIGV4dHJhIHR1cm5zIChmaXh0dXJlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXG5cdFx0XHQvLyBMb2FkIHJlYWwgU0RLIGV2ZW50cyBmcm9tIGZpeHR1cmUgKHNhbml0aXplZCBmcm9tIH4vLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS8pXG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gYXdhaXQgbG9hZEZpeHR1cmVNZXNzYWdlcygnc3ViYWdlbnQtc2Vzc2lvbi5qc29ubCcsIHNlc3Npb24pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zLmxlbmd0aCwgMSwgYEV4cGVjdGVkIDEgdHVybiBidXQgZ290ICR7c3RhdGUhLnR1cm5zLmxlbmd0aH06ICR7c3RhdGUhLnR1cm5zLm1hcCh0ID0+IGBcIiR7dC5tZXNzYWdlLnRleHQuc3Vic3RyaW5nKDAsIDQwKX1cImApLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ1J1biBhIHN5bmMgc3ViYWdlbnQgdG8gZG8gc29tZSBzZWFyY2hlcywganVzdCB0ZXN0aW5nIHN1YmFnZW50IHJlbmRlcmluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlIS50dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdGhlIHBhcmVudCBzdWJhZ2VudCB0b29sIGNhbGwgd2l0aCBzdWJhZ2VudCBjb250ZW50XG5cdFx0XHRjb25zdCB0b29sQ2FsbFBhcnRzID0gc3RhdGUhLnR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKChwKTogcCBpcyBUb29sQ2FsbFJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0Y29uc3QgcGFyZW50VGMgPSB0b29sQ2FsbFBhcnRzLmZpbmQocCA9PiBwLnRvb2xDYWxsLnRvb2xOYW1lID09PSAndGFzaycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcmVudFRjLCAnU2hvdWxkIGhhdmUgYSB0YXNrIHRvb2wgY2FsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudFRjIS50b29sQ2FsbC5fbWV0YT8udG9vbEtpbmQsICdzdWJhZ2VudCcpO1xuXG5cdFx0XHQvLyBJbm5lciB0b29sIGNhbGxzIHNob3VsZCBOT1QgYmUgaW4gdGhlIHBhcmVudCB0dXJuIFx1MjAxNCB0aGV5IGJlbG9uZ1xuXHRcdFx0Ly8gdG8gdGhlIGNoaWxkIHN1YmFnZW50IHNlc3Npb24uXG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gcGFyZW50VGMhLnRvb2xDYWxsLnRvb2xDYWxsSWQ7XG5cdFx0XHRjb25zdCBub25QYXJlbnRUb29scyA9IHRvb2xDYWxsUGFydHMuZmlsdGVyKHAgPT4gcC50b29sQ2FsbC50b29sQ2FsbElkICE9PSBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub25QYXJlbnRUb29scy5sZW5ndGgsIDAsIGBQYXJlbnQgdHVybiBzaG91bGQgb25seSBjb250YWluIHRoZSB0YXNrIHRvb2wgY2FsbCwgYnV0IGZvdW5kICR7bm9uUGFyZW50VG9vbHMubGVuZ3RofSBleHRyYSB0b29sIGNhbGxzYCk7XG5cblx0XHRcdC8vIFN1YnNjcmliZSB0byB0aGUgY2hpbGQgc3ViYWdlbnQgc2Vzc2lvbiBhbmQgdmVyaWZ5IGlubmVyIHRvb2xzXG5cdFx0XHRjb25zdCBjaGlsZFNlc3Npb25VcmkgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShjaGlsZFNlc3Npb25VcmkpLCAnY2xpZW50LXRlc3QnKTtcblx0XHRcdGFzc2VydC5vayhzbmFwc2hvdD8uc3RhdGUsICdDaGlsZCBzZXNzaW9uIHNuYXBzaG90IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGlsZFNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoaWxkU3RhdGUsICdDaGlsZCBzZXNzaW9uIHN0YXRlIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkU3RhdGUhLnR1cm5zLmxlbmd0aCwgMSwgJ0NoaWxkIHNlc3Npb24gc2hvdWxkIGhhdmUgMSB0dXJuJyk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2xQYXJ0cyA9IGNoaWxkU3RhdGUhLnR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKChwKTogcCBpcyBUb29sQ2FsbFJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoaWxkVG9vbFBhcnRzLmxlbmd0aCA+IDAsIGBDaGlsZCBzZXNzaW9uIHNob3VsZCBoYXZlIGlubmVyIHRvb2wgY2FsbHMgYnV0IGdvdCAke2NoaWxkVG9vbFBhcnRzLmxlbmd0aH1gKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdGhlIGZpbmFsIG1hcmtkb3duXG5cdFx0XHRjb25zdCBtZFBhcnRzID0gc3RhdGUhLnR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKChwKTogcCBpcyBNYXJrZG93blJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kUGFydHMubGVuZ3RoID4gMCwgJ1Nob3VsZCBoYXZlIG1hcmtkb3duIGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VhZ2VybHkgcmVnaXN0ZXJzIHN1YmFnZW50IGNoaWxkIHNlc3Npb25zIGR1cmluZyBwYXJlbnQgcmVzdG9yZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEFuIGFnZW50IHRoYXQgc3VyZmFjZXMgaXRzIHN1YmFnZW50IGNoaWxkcmVuIGZyb20gdGhlIHBhcmVudCdzXG5cdFx0XHQvLyByZWNvbnN0cnVjdGVkIGhpc3RvcnksIGV4ZXJjaXNpbmcgdGhlIGVhZ2VyLXJlZ2lzdHJhdGlvbiBwYXRoLlxuXHRcdFx0Y2xhc3MgRWFnZXJTdWJhZ2VudE1vY2tBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRcdGFzeW5jIGdldFN1YmFnZW50U2Vzc2lvbnMoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxyZWFkb25seSBJUmVzdG9yZWRTdWJhZ2VudFNlc3Npb25bXT4ge1xuXHRcdFx0XHRcdGlmIChwYXJzZVN1YmFnZW50U2Vzc2lvblVyaShzZXNzaW9uKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3Qgb3V0OiBJUmVzdG9yZWRTdWJhZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlYyBvZiB0aGlzLnNlc3Npb25NZXNzYWdlcykge1xuXHRcdFx0XHRcdFx0aWYgKHJlYy50eXBlID09PSAnc3ViYWdlbnRfc3RhcnRlZCcgJiYgIXNlZW4uaGFzKHJlYy50b29sQ2FsbElkKSkge1xuXHRcdFx0XHRcdFx0XHRzZWVuLmFkZChyZWMudG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNoaWxkVXJpID0gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50LCByZWMudG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHR1cm5zID0gYXdhaXQgdGhpcy5nZXRTZXNzaW9uTWVzc2FnZXMoVVJJLnBhcnNlKGNoaWxkVXJpKSk7XG5cdFx0XHRcdFx0XHRcdGlmICh0dXJucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0b3V0LnB1c2goeyByZXNvdXJjZTogVVJJLnBhcnNlKGNoaWxkVXJpKSwgdG9vbENhbGxJZDogcmVjLnRvb2xDYWxsSWQsIHRpdGxlOiByZWMuYWdlbnREaXNwbGF5TmFtZSwgdHVybnMgfSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG91dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBFYWdlclN1YmFnZW50TW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25zWzBdLnNlc3Npb247XG5cblx0XHRcdGFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnUmV2aWV3IHRoaXMgY29kZScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBuYW1lOiAndGFzaycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF9zdGFydCcsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sS2luZDogJ3N1YmFnZW50JyBhcyBjb25zdCwgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycsIHN1YmFnZW50QWdlbnROYW1lOiAnZXhwbG9yZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc3ViYWdlbnRfc3RhcnRlZCcsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3N0YXJ0Jywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLWlubmVyLTEnLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ0Jhc2gnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgbHMuLi4nLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLWlubmVyLTEnLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBscycsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZmlsZTEudHMnIH1dIH0sIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1zdWInIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfY29tcGxldGUnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtc3ViJywgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdEZWxlZ2F0ZWQgdGFzaycsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnRm91bmQgMyBpc3N1ZXMnIH1dIH0gfSxcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0Ly8gVGhlIHN1YmFnZW50IGNoaWxkIHN0YXRlIG11c3QgYWxyZWFkeSBleGlzdCBXSVRIT1VUIGFueSBjbGllbnRcblx0XHRcdC8vIHN1YnNjcmliaW5nIHRvIGl0OiBwYXJlbnQgcmVzdG9yZSByZWdpc3RlcmVkIGl0IGVhZ2VybHkuXG5cdFx0XHRjb25zdCBjaGlsZFNlc3Npb25VcmkgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgJ3RjLXN1YicpO1xuXHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGlsZFNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoaWxkU3RhdGUsICdzdWJhZ2VudCBjaGlsZCBzaG91bGQgYmUgZWFnZXJseSByZWdpc3RlcmVkIGR1cmluZyBwYXJlbnQgcmVzdG9yZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkU3RhdGUhLnR1cm5zLmxlbmd0aCwgMSwgJ2NoaWxkIHNob3VsZCBoYXZlIGl0cyByZWNvbnN0cnVjdGVkIHR1cm4nKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbFBhcnRzID0gY2hpbGRTdGF0ZSEudHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maWx0ZXIoKHApOiBwIGlzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0ID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQub2soY2hpbGRUb29sUGFydHMuc29tZShwID0+IHAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLWlubmVyLTEnKSwgJ2NoaWxkIHNob3VsZCBjb250YWluIHRoZSBpbm5lciB0b29sIGNhbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lubmVyIGFzc2lzdGFudCBtZXNzYWdlcyBmcm9tIHN1YmFnZW50IHJvdXRlIHZpYSBlbnZlbG9wZSBhZ2VudElkIChmaXh0dXJlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb24gZm9yIHRoZSBTREsgbWlncmF0aW9uIGF3YXkgZnJvbSB0aGUgZGVwcmVjYXRlZFxuXHRcdFx0Ly8gYGRhdGEucGFyZW50VG9vbENhbGxJZGAgdG8gdGhlIGVudmVsb3BlLWxldmVsIGBhZ2VudElkYC4gTmV3ZXJcblx0XHRcdC8vIHNlc3Npb24gbG9ncyBvbmx5IHRhZyBzdWJhZ2VudCBldmVudHMgd2l0aCBgYWdlbnRJZGAsIHNvIHRoZVxuXHRcdFx0Ly8gcmVvcGVuL3JlcGxheSBwYXRoIG11c3QgcmVzb2x2ZSB0aG9zZSBiYWNrIHRvIHRoZSBwYXJlbnQgdG9vbFxuXHRcdFx0Ly8gY2FsbCBpZCBcdTIwMTQgb3RoZXJ3aXNlIHRoZSBzdWJhZ2VudCdzIGFzc2lzdGFudCBtZXNzYWdlcyBsZWFrIGludG9cblx0XHRcdC8vIHRoZSBtYWluIHNlc3Npb24gYXMgZXh0cmEgdHVybnMuXG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IGF3YWl0IGxvYWRGaXh0dXJlTWVzc2FnZXMoJ3N1YmFnZW50LXNlc3Npb24tYWdlbnRpZC5qc29ubCcsIHNlc3Npb24pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zLmxlbmd0aCwgMSwgYEV4cGVjdGVkIDEgdHVybiBidXQgZ290ICR7c3RhdGUhLnR1cm5zLmxlbmd0aH06ICR7c3RhdGUhLnR1cm5zLm1hcCh0ID0+IGBcIiR7dC5tZXNzYWdlLnRleHQuc3Vic3RyaW5nKDAsIDQwKX1cImApLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ1J1biBhIHN5bmMgc3ViYWdlbnQgdG8gZG8gc29tZSBzZWFyY2hlcywganVzdCB0ZXN0aW5nIHN1YmFnZW50IHJlbmRlcmluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlIS50dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdGhlIHBhcmVudCBzdWJhZ2VudCB0b29sIGNhbGwgd2l0aCBzdWJhZ2VudCBjb250ZW50LlxuXHRcdFx0Y29uc3QgdG9vbENhbGxQYXJ0cyA9IHN0YXRlIS50dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbHRlcigocCk6IHAgaXMgVG9vbENhbGxSZXNwb25zZVBhcnQgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGNvbnN0IHBhcmVudFRjID0gdG9vbENhbGxQYXJ0cy5maW5kKHAgPT4gcC50b29sQ2FsbC50b29sTmFtZSA9PT0gJ3Rhc2snKTtcblx0XHRcdGFzc2VydC5vayhwYXJlbnRUYywgJ1Nob3VsZCBoYXZlIGEgdGFzayB0b29sIGNhbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJlbnRUYyEudG9vbENhbGwuX21ldGE/LnRvb2xLaW5kLCAnc3ViYWdlbnQnKTtcblxuXHRcdFx0Ly8gSW5uZXIgdG9vbCBjYWxscyBzaG91bGQgTk9UIGJlIGluIHRoZSBwYXJlbnQgdHVybiBcdTIwMTQgdGhleSBiZWxvbmdcblx0XHRcdC8vIHRvIHRoZSBjaGlsZCBzdWJhZ2VudCBzZXNzaW9uLlxuXHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHBhcmVudFRjIS50b29sQ2FsbC50b29sQ2FsbElkO1xuXHRcdFx0Y29uc3Qgbm9uUGFyZW50VG9vbHMgPSB0b29sQ2FsbFBhcnRzLmZpbHRlcihwID0+IHAudG9vbENhbGwudG9vbENhbGxJZCAhPT0gcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9uUGFyZW50VG9vbHMubGVuZ3RoLCAwLCBgUGFyZW50IHR1cm4gc2hvdWxkIG9ubHkgY29udGFpbiB0aGUgdGFzayB0b29sIGNhbGwsIGJ1dCBmb3VuZCAke25vblBhcmVudFRvb2xzLmxlbmd0aH0gZXh0cmEgdG9vbCBjYWxsc2ApO1xuXG5cdFx0XHQvLyBUaGUgc3ViYWdlbnQncyBpbm5lciBhc3Npc3RhbnQgbWVzc2FnZSBtdXN0IG5vdCBzdXJmYWNlIGluIHRoZVxuXHRcdFx0Ly8gcGFyZW50IHRyYW5zY3JpcHQuXG5cdFx0XHRjb25zdCBtZFBhcnRzID0gc3RhdGUhLnR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKChwKTogcCBpcyBNYXJrZG93blJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRtZFBhcnRzLmV2ZXJ5KHAgPT4gIXAuY29udGVudC5zdGFydHNXaXRoKCdQZXJmZWN0ISBJIG5vdyBoYXZlIGVub3VnaCBpbmZvcm1hdGlvbicpKSxcblx0XHRcdFx0J1N1YmFnZW50IGlubmVyIGFzc2lzdGFudCBtZXNzYWdlIHNob3VsZCBub3QgbGVhayBpbnRvIHRoZSBwYXJlbnQgdHVybicsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kUGFydHMubGVuZ3RoID4gMCwgJ1Nob3VsZCBoYXZlIG1hcmtkb3duIGNvbnRlbnQnKTtcblxuXHRcdFx0Ly8gU3Vic2NyaWJlIHRvIHRoZSBjaGlsZCBzdWJhZ2VudCBzZXNzaW9uIGFuZCB2ZXJpZnkgaW5uZXIgdG9vbHNcblx0XHRcdC8vIGFuZCB0aGUgc3ViYWdlbnQncyBhc3Npc3RhbnQgbWVzc2FnZSBsYW5kZWQgdGhlcmUuXG5cdFx0XHRjb25zdCBjaGlsZFNlc3Npb25VcmkgPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShjaGlsZFNlc3Npb25VcmkpLCAnY2xpZW50LXRlc3QnKTtcblx0XHRcdGFzc2VydC5vayhzbmFwc2hvdD8uc3RhdGUsICdDaGlsZCBzZXNzaW9uIHNuYXBzaG90IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGlsZFNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoaWxkU3RhdGUsICdDaGlsZCBzZXNzaW9uIHN0YXRlIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkU3RhdGUhLnR1cm5zLmxlbmd0aCwgMSwgJ0NoaWxkIHNlc3Npb24gc2hvdWxkIGhhdmUgMSB0dXJuJyk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2xQYXJ0cyA9IGNoaWxkU3RhdGUhLnR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKChwKTogcCBpcyBUb29sQ2FsbFJlc3BvbnNlUGFydCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoaWxkVG9vbFBhcnRzLmxlbmd0aCA+IDAsIGBDaGlsZCBzZXNzaW9uIHNob3VsZCBoYXZlIGlubmVyIHRvb2wgY2FsbHMgYnV0IGdvdCAke2NoaWxkVG9vbFBhcnRzLmxlbmd0aH1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvYWxlc2NlcyBjb25jdXJyZW50IHJlc3RvcmVzIGZvciB0aGUgc2FtZSBzdWJhZ2VudCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgQmxvY2tpbmdTdWJhZ2VudEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0cmVhZG9ubHkgc3ViYWdlbnRSZWFjaGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHRyZWFkb25seSBzdWJhZ2VudEdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdHN1YmFnZW50R2V0U2Vzc2lvbk1lc3NhZ2VzQ2FsbHMgPSAwO1xuXG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdFx0XHRcdGlmIChwYXJzZVN1YmFnZW50U2Vzc2lvblVyaShzZXNzaW9uKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zdWJhZ2VudEdldFNlc3Npb25NZXNzYWdlc0NhbGxzKys7XG5cdFx0XHRcdFx0XHR0aGlzLnN1YmFnZW50UmVhY2hlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zdWJhZ2VudEdhdGUucDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQmxvY2tpbmdTdWJhZ2VudEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25zWzBdLnNlc3Npb247XG5cblx0XHRcdGFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnUmV2aWV3JywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXN1YicsIG5hbWU6ICd0YXNrJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3N0YXJ0Jywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLXN1YicsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xLaW5kOiAnc3ViYWdlbnQnIGFzIGNvbnN0LCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJywgc3ViYWdlbnRBZ2VudE5hbWU6ICdleHBsb3JlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzdWJhZ2VudF9zdGFydGVkJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLXN1YicsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfc3RhcnQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtaW5uZXInLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ0Jhc2gnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgbHMuLi4nLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gbHMnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2ZpbGUxLnRzJyB9XSB9LCBwYXJlbnRUb29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLXN1YicsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnRGVsZWdhdGVkIHRhc2snLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0ZvdW5kIGZpbGVzJyB9XSB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTMnLCBjb250ZW50OiAnRG9uZS4nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBjaGlsZFNlc3Npb25VcmkgPSBVUkkucGFyc2UoYnVpbGRTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksICd0Yy1zdWInKSk7XG5cdFx0XHRjb25zdCBmaXJzdFN1YnNjcmliZSA9IHNlcnZpY2Uuc3Vic2NyaWJlKGNoaWxkU2Vzc2lvblVyaSwgJ2NsaWVudC0xJyk7XG5cdFx0XHRhd2FpdCBhZ2VudC5zdWJhZ2VudFJlYWNoZWQucDtcblx0XHRcdGNvbnN0IHNlY29uZFN1YnNjcmliZSA9IHNlcnZpY2Uuc3Vic2NyaWJlKGNoaWxkU2Vzc2lvblVyaSwgJ2NsaWVudC0yJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zdWJhZ2VudEdldFNlc3Npb25NZXNzYWdlc0NhbGxzLCAxKTtcblx0XHRcdGFnZW50LnN1YmFnZW50R2F0ZS5jb21wbGV0ZSgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0U3Vic2NyaWJlLCBzZWNvbmRTdWJzY3JpYmVdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1lc3NhZ2VDYWxsczogYWdlbnQuc3ViYWdlbnRHZXRTZXNzaW9uTWVzc2FnZXNDYWxscyxcblx0XHRcdFx0Y2hpbGRUdXJuczogc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoaWxkU2Vzc2lvblVyaS50b1N0cmluZygpKT8udHVybnMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtZXNzYWdlQ2FsbHM6IDEsXG5cdFx0XHRcdGNoaWxkVHVybnM6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBjcmVhdGVDaGF0IChtdWx0aS1jaGF0KSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2NyZWF0ZUNoYXQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyb3V0ZXMgdG8gdGhlIHByb3ZpZGVyIGZvciBhIHJlc3RvcmVkIHNlc3Npb24gbm90IHRyYWNrZWQgaW4gdGhlIHByb3ZpZGVyIG1hcCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgc2Vzc2lvbiByZXN0b3JlZCBhZnRlciBhIGhvc3QgcmVzdGFydCBsaXZlcyBpbiB0aGUgc3RhdGUgbWFuYWdlclxuXHRcdFx0Ly8gYnV0IGlzIG5vdCByZWNvcmRlZCBpbiB0aGUgc2Vzc2lvblx1MjE5MnByb3ZpZGVyIG1hcCAob25seSBjcmVhdGVTZXNzaW9uXG5cdFx0XHQvLyByZWNvcmRzIHRoYXQpLiBjcmVhdGVDaGF0IG11c3Qgc3RpbGwgcmVzb2x2ZSB0aGUgcHJvdmlkZXIgdmlhIHRoZVxuXHRcdFx0Ly8gc2NoZW1lIGZhbGxiYWNrIGluc3RlYWQgb2YgdGhyb3dpbmcgYG5vIHByb3ZpZGVyIGZvciBzZXNzaW9uYC5cblx0XHRcdGNvbnN0IGNyZWF0ZWQ6IHsgc2Vzc2lvbjogc3RyaW5nOyBjaGF0OiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRjbGFzcyBNdWx0aUNoYXRBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjcmVhdGVkLnB1c2goeyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXQudG9TdHJpbmcoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpQ2hhdEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Ly8gRHJvcCBhbnkgdHJhY2tpbmcgc28gb25seSB0aGUgc2NoZW1lIGZhbGxiYWNrIGNhbiByZXNvbHZlIHRoZSBhZ2VudC5cblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y3JlYXRlZCxcblx0XHRcdFx0aW5DYXRhbG9nOiAhIXN0YXRlPy5jaGF0cy5zb21lKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0VXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjcmVhdGVkOiBbeyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXRVcmkudG9TdHJpbmcoKSB9XSxcblx0XHRcdFx0aW5DYXRhbG9nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3V0ZXMgYSB0cmFja2VkIHNlc3Npb24gYW5kIHJlZ2lzdGVycyB0aGUgY2hhdCB3aXRoIGl0cyB0aXRsZSBpbiB0aGUgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNsYXNzIE11bHRpQ2hhdEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdChfc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItMScpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uLCBjaGF0VXJpLCB7IHRpdGxlOiAnUGVlciBDaGF0JyB9KTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0YXRlPy5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0VXJpLnRvU3RyaW5nKCkpPy50aXRsZSxcblx0XHRcdFx0J1BlZXIgQ2hhdCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlcyB0aGUgYmFja2luZyBjaGF0IGJlZm9yZSByZWdpc3RlcmluZyB0aGUgY2hhdCBpbiB0aGUgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYXRhbG9nSGFkQ2hhdER1cmluZ0NyZWF0ZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdGNsYXNzIE11bHRpQ2hhdEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Y2F0YWxvZ0hhZENoYXREdXJpbmdDcmVhdGUgPSAhIXN0YXRlPy5jaGF0cy5zb21lKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXVsdGlDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXRhbG9nSGFkQ2hhdER1cmluZ0NyZWF0ZSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHByb3ZpZGVyIGRvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItMScpKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uLCBjaGF0VXJpKSxcblx0XHRcdFx0L2RvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHMvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VDaGF0IHJlbW92ZXMgdGhlIGNoYXQgZnJvbSB0aGUgY2F0YWxvZyBhbmQgdGVhcnMgZG93biB0aGUgY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y2xhc3MgTXVsdGlDaGF0QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KF9zZXNzaW9uOiBVUkksIF9jaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBkaXNwb3NlQ2hhdChfc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRkaXNwb3NlZC5wdXNoKGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuZGlzcG9zZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZGlzcG9zZWQsXG5cdFx0XHRcdGluQ2F0YWxvZzogISFzdGF0ZT8uY2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY2hhdFVyaS50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZGlzcG9zZWQ6IFtjaGF0VXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRpbkNhdGFsb2c6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlU2Vzc2lvbiBwcmVzZXJ2ZXMgcGVlciBjaGF0IGNhdGFsb2cgb3JkZXIgcmVnYXJkbGVzcyBvZiBsb2FkIHRpbWluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNsYXNzIE11bHRpQ2hhdEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdChfc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0XHRcdFx0Ly8gUmVzb2x2ZSBpbiB0aGUgcmV2ZXJzZSBvZiBjYXRhbG9nIG9yZGVyIHNvIGEgcmVzb2x1dGlvbi1vcmRlclxuXHRcdFx0XHRcdC8vIGFwcGVuZCB3b3VsZCBzY3JhbWJsZSB0aGUgY2F0YWxvZzsgdGhlIHJlc3RvcmUgbXVzdCBrZWVwIGEsYixjLlxuXHRcdFx0XHRcdGNvbnN0IGRlbGF5czogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHsgJ3BlZXItYSc6IDMwLCAncGVlci1iJzogMTUsICdwZWVyLWMnOiAwIH07XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dChkZWxheXNbcGFyc2VDaGF0VXJpKHNlc3Npb24pPy5jaGF0SWQgPz8gJyddID8/IDApO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpQ2hhdEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Ly8gU2VlZCB0aGUgb3JjaGVzdHJhdG9yIGNhdGFsb2cgaW4gYSxiLGMgb3JkZXIgdmlhIGNyZWF0ZUNoYXQuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uLCBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWEnKSkpO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1iJykpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYycpKSk7XG5cblx0XHRcdGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdElkcyA9IChzdGF0ZT8uY2hhdHMgPz8gW10pXG5cdFx0XHRcdC5tYXAoYyA9PiBwYXJzZUNoYXRVcmkoYy5yZXNvdXJjZSk/LmNoYXRJZClcblx0XHRcdFx0LmZpbHRlcigoaWQpOiBpZCBpcyBzdHJpbmcgPT4gISFpZCAmJiBpZC5zdGFydHNXaXRoKCdwZWVyLScpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGVlckNoYXRJZHMsIFsncGVlci1hJywgJ3BlZXItYicsICdwZWVyLWMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JrIHNlZWRzIHRoZSBuZXcgY2hhdCB3aXRoIHJlbWFwcGVkIHNvdXJjZSB0dXJucyBhbmQgZm9yd2FyZHMgZm9yayB0byB0aGUgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgcmVjZWl2ZWRGb3JrOiBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSB8IHVuZGVmaW5lZDtcblx0XHRcdGNsYXNzIE11bHRpQ2hhdEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdChfc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRyZWNlaXZlZEZvcmsgPSBvcHRpb25zPy5mb3JrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXVsdGlDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cblx0XHRcdC8vIFNlZWQgdGhlIHNvdXJjZSAoZGVmYXVsdCkgY2hhdCB3aXRoIHR3byB0dXJucyBhbmQgYSB0aXRsZS5cblx0XHRcdGNvbnN0IHNvdXJjZVR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHRcdHsgaWQ6ICd0MScsIHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsIG1lc3NhZ2U6IHsgdGV4dDogJ2ZpcnN0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LCByZXNwb25zZVBhcnRzOiBbXSwgdXNhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGlkOiAndDInLCBzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLCBtZXNzYWdlOiB7IHRleHQ6ICdzZWNvbmQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sIHJlc3BvbnNlUGFydHM6IFtdLCB1c2FnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRdO1xuXHRcdFx0c2VydmljZS5zdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBzb3VyY2VUdXJucyk7XG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvbi50b1N0cmluZygpLCBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksICdNeSBTZXNzaW9uJyk7XG5cblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSwgeyBmb3JrOiB7IHNvdXJjZTogc2Vzc2lvbiwgdHVybklkOiAndDEnIH0gfSk7XG5cblx0XHRcdGNvbnN0IG5ld0NoYXRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgbmV3VHVybklkcyA9IG5ld0NoYXRTdGF0ZT8udHVybnMubWFwKHQgPT4gdC5pZCkgPz8gW107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zm9ya1NvdXJjZTogcmVjZWl2ZWRGb3JrPy5zb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0Zm9ya1R1cm5JZDogcmVjZWl2ZWRGb3JrPy50dXJuSWQsXG5cdFx0XHRcdG1hcHBpbmdTaXplOiByZWNlaXZlZEZvcms/LnR1cm5JZE1hcHBpbmc/LnNpemUsXG5cdFx0XHRcdG1hcHBlZEZyb21UMTogcmVjZWl2ZWRGb3JrPy50dXJuSWRNYXBwaW5nPy5nZXQoJ3QxJyksXG5cdFx0XHRcdG5ld1R1cm5Db3VudDogbmV3VHVybklkcy5sZW5ndGgsXG5cdFx0XHRcdG5ld1R1cm5Jc1JlbWFwcGVkOiBuZXdUdXJuSWRzWzBdICE9PSB1bmRlZmluZWQgJiYgbmV3VHVybklkc1swXSAhPT0gJ3QxJyxcblx0XHRcdFx0dGl0bGU6IG5ld0NoYXRTdGF0ZT8udGl0bGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZvcmtTb3VyY2U6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0Zm9ya1R1cm5JZDogJ3QxJyxcblx0XHRcdFx0bWFwcGluZ1NpemU6IDEsXG5cdFx0XHRcdG1hcHBlZEZyb21UMTogbmV3VHVybklkc1swXSxcblx0XHRcdFx0bmV3VHVybkNvdW50OiAxLFxuXHRcdFx0XHRuZXdUdXJuSXNSZW1hcHBlZDogdHJ1ZSxcblx0XHRcdFx0dGl0bGU6ICdGb3JrZWQ6IE15IFNlc3Npb24nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JrIHdpdGggYW4gdW5rbm93biB0dXJuIGlkIGRyb3BzIHRoZSBmb3JrIGFuZCBzZWVkcyBubyB0dXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCByZWNlaXZlZEZvcms6IElBZ2VudENyZWF0ZUNoYXRGb3JrU291cmNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2xhc3MgTXVsdGlDaGF0QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KF9zZXNzaW9uOiBVUkksIF9jaGF0OiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHJlY2VpdmVkRm9yayA9IG9wdGlvbnM/LmZvcms7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Y29uc3Qgc291cmNlVHVybnM6IFR1cm5bXSA9IFtcblx0XHRcdFx0eyBpZDogJ3QxJywgc3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSwgbWVzc2FnZTogeyB0ZXh0OiAnZmlyc3QnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sIHJlc3BvbnNlUGFydHM6IFtdLCB1c2FnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRdO1xuXHRcdFx0c2VydmljZS5zdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvbi50b1N0cmluZygpLCBzb3VyY2VUdXJucyk7XG5cblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSwgeyBmb3JrOiB7IHNvdXJjZTogc2Vzc2lvbiwgdHVybklkOiAnbWlzc2luZycgfSB9KTtcblxuXHRcdFx0Y29uc3QgbmV3Q2hhdFN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zm9ya0ZvcndhcmRlZDogcmVjZWl2ZWRGb3JrICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdG5ld1R1cm5Db3VudDogbmV3Q2hhdFN0YXRlPy50dXJucy5sZW5ndGggPz8gMCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zm9ya0ZvcndhcmRlZDogZmFsc2UsXG5cdFx0XHRcdG5ld1R1cm5Db3VudDogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yayBhdCBhIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybiByZWRpcmVjdHMgdGhlIFNESyBib3VuZGFyeSB0byB0aGUgY29uY3JldGUgYW5jaG9yIGFuZCBjYXJyaWVzIHRoZSBsb2NhbCB0dXJuIGludG8gdGhlIG5ldyBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHJlY2VpdmVkRm9yazogSUFnZW50Q3JlYXRlQ2hhdEZvcmtTb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRjbGFzcyBNdWx0aUNoYXRBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0cmVjZWl2ZWRGb3JrID0gb3B0aW9ucz8uZm9yaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpQ2hhdEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSAoYXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCkpWzBdLnNlc3Npb247XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHQvLyBTREsgdHJhbnNjcmlwdCByZWNvbnN0cnVjdHMgYSBzaW5nbGUgcmVhbCB0dXJuIGtleWVkIGJ5IHRoZSB1c2VyXG5cdFx0XHQvLyBtZXNzYWdlIGlkOyBhIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybiBpcyBwZXJzaXN0ZWQgYWZ0ZXIgaXQuXG5cdFx0XHRhZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ3JlYWwtMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdyZWFsLTEtYScsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBsb2NhbFR1cm46IFR1cm4gPSB7IGlkOiAnbG9jYWwtMScsIHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsIG1lc3NhZ2U6IHsgdGV4dDogJyFlY2hvIGhpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LCByZXNwb25zZVBhcnRzOiBbXSwgdXNhZ2U6IHVuZGVmaW5lZCB9O1xuXHRcdFx0YXdhaXQgZGIuaW5zZXJ0TG9jYWxUdXJuKHsgdHVybklkOiAnbG9jYWwtMScsIGNoYXRVcmk6IGRlZmF1bHRDaGF0VXJpLCBhbmNob3JUdXJuSWQ6ICdyZWFsLTEnLCBzZXE6IDEsIHBheWxvYWQ6IEpTT04uc3RyaW5naWZ5KGxvY2FsVHVybikgfSk7XG5cblx0XHRcdC8vIFJlc3RvcmUgc28gdGhlIHNvdXJjZSBjaGF0IGludGVybGVhdmVzIFtyZWFsLTEsIGxvY2FsLTFdIGFuZCB0aGVcblx0XHRcdC8vIGluLW1lbW9yeSBsb2NhbCBpbmRleCBrbm93cyBsb2NhbC0xIGlzIGEgbG9jYWwgdHVybi5cblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk/LnR1cm5zLm1hcCh0ID0+IHQuaWQpLCBbJ3JlYWwtMScsICdsb2NhbC0xJ10pO1xuXG5cdFx0XHQvLyBGb3JrIHRoZSBkZWZhdWx0IGNoYXQgQVQgdGhlIGxvY2FsIHR1cm4gaW50byBhIG5ldyBwZWVyIGNoYXQuXG5cdFx0XHRjb25zdCBwZWVyVXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uUmVzb3VyY2UsICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uUmVzb3VyY2UsIHBlZXJVcmksIHsgZm9yazogeyBzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHR1cm5JZDogJ2xvY2FsLTEnIH0gfSk7XG5cblx0XHRcdGNvbnN0IHBlZXJUdXJucyA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHBlZXJVcmkudG9TdHJpbmcoKSk/LnR1cm5zID8/IFtdO1xuXHRcdFx0Y29uc3QgZm9ya2VkTG9jYWxzID0gKGF3YWl0IGRiLmdldExvY2FsVHVybnMoKSkuZmlsdGVyKHIgPT4gci5jaGF0VXJpID09PSBwZWVyVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdC8vIFNESyBmb3JrIGJvdW5kYXJ5IHJlZGlyZWN0ZWQgZnJvbSB0aGUgbG9jYWwgdHVybiB0byBpdHMgY29uY3JldGUgYW5jaG9yLlxuXHRcdFx0XHRzZGtGb3JrVHVybklkOiByZWNlaXZlZEZvcms/LnR1cm5JZCxcblx0XHRcdFx0Ly8gTmV3IGNoYXQgc2VlZGVkIHdpdGggcmVtYXBwZWQgY29waWVzIG9mIGJvdGggdHVybnMuXG5cdFx0XHRcdHBlZXJUdXJuQ291bnQ6IHBlZXJUdXJucy5sZW5ndGgsXG5cdFx0XHRcdC8vIFRoZSBmb3JrZWQgbG9jYWwgdHVybiBpcyBwZXJzaXN0ZWQgdW5kZXIgdGhlIG5ldyBjaGF0LCBhbmNob3JlZCB0b1xuXHRcdFx0XHQvLyB0aGUgZm9ya2VkIGNvcHkgb2YgdGhlIHJlYWwgdHVybi5cblx0XHRcdFx0Zm9ya2VkTG9jYWxDb3VudDogZm9ya2VkTG9jYWxzLmxlbmd0aCxcblx0XHRcdFx0Zm9ya2VkTG9jYWxBbmNob3I6IGZvcmtlZExvY2Fsc1swXT8uYW5jaG9yVHVybklkLFxuXHRcdFx0XHRhbmNob3JJc1BlZXJGaXJzdFR1cm46IGZvcmtlZExvY2Fsc1swXT8uYW5jaG9yVHVybklkID09PSBwZWVyVHVybnNbMF0/LmlkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZGtGb3JrVHVybklkOiAncmVhbC0xJyxcblx0XHRcdFx0cGVlclR1cm5Db3VudDogMixcblx0XHRcdFx0Zm9ya2VkTG9jYWxDb3VudDogMSxcblx0XHRcdFx0Zm9ya2VkTG9jYWxBbmNob3I6IHBlZXJUdXJuc1swXT8uaWQsXG5cdFx0XHRcdGFuY2hvcklzUGVlckZpcnN0VHVybjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBwZWVyIGNoYXQgYmFja2luZyBzZXNzaW9uIGlzIGZpbHRlcmVkIG91dCBvZiBsaXN0U2Vzc2lvbnMgYW5kIHN0YXlzIGZpbHRlcmVkIGFjcm9zcyBhIHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBQZXItc2Vzc2lvbiBkYXRhYmFzZXMgc28gdGhlIGJhY2tpbmcgU0RLIHNlc3Npb24ncyBtYXJrZXIgaXNcblx0XHRcdC8vIGlzb2xhdGVkIGZyb20gdGhlIHBhcmVudCBzZXNzaW9uJ3Mgb3duIGRhdGFiYXNlLlxuXHRcdFx0Y29uc3QgZGJzID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RTZXNzaW9uRGF0YWJhc2U+KCk7XG5cdFx0XHRjb25zdCBkYkZvciA9IChzZXNzaW9uOiBVUkkpOiBUZXN0U2Vzc2lvbkRhdGFiYXNlID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdFx0XHRsZXQgZGIgPSBkYnMuZ2V0KGtleSk7XG5cdFx0XHRcdGlmICghZGIpIHtcblx0XHRcdFx0XHRkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRcdFx0ZGJzLnNldChrZXksIGRiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZGI7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcGVyU2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiAoc2Vzc2lvbjogVVJJKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiA9PiAoeyBvYmplY3Q6IGRiRm9yKHNlc3Npb24pLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdHRyeU9wZW5EYXRhYmFzZTogYXN5bmMgKHNlc3Npb246IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB8IHVuZGVmaW5lZD4gPT4gKHsgb2JqZWN0OiBkYkZvcihzZXNzaW9uKSwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYmFja2luZ1Nka0lkID0gJ2JhY2tpbmctc2RrLWlkJztcblx0XHRcdGNvbnN0IGJhY2tpbmdVcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgYmFja2luZ1Nka0lkKS50b1N0cmluZygpO1xuXHRcdFx0Ly8gQSBDbGF1ZGUtbGlrZSBhZ2VudCB3aG9zZSBwZWVyLWNoYXQgYmFja2luZyBpcyBhIGZyZXNoIFNESyBzZXNzaW9uXG5cdFx0XHQvLyBpdCBhbHNvIGVudW1lcmF0ZXMgZnJvbSBsaXN0U2Vzc2lvbnMgXHUyMDE0IHRoZSBsZWFrIHRoaXMgZml4IHN1cHByZXNzZXMuXG5cdFx0XHRjbGFzcyBMZWFreU11bHRpQ2hhdEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdChfc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJEYXRhOiAnYmxvYicsIGJhY2tpbmdTZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIGJhY2tpbmdTZGtJZCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdFx0XHRcdGNvbnN0IGJhc2UgPSBhd2FpdCBzdXBlci5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdFx0XHRyZXR1cm4gWy4uLmJhc2UsIHsgc2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBiYWNraW5nU2RrSWQpLCBzdGFydFRpbWU6IERhdGUubm93KCksIG1vZGlmaWVkVGltZTogRGF0ZS5ub3coKSB9XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGVha3lNdWx0aUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdGNvbnN0IHN2YyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgcGVyU2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0c3ZjLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHN2Yy5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBzdmMuY3JlYXRlQ2hhdChzZXNzaW9uLCBjaGF0VXJpKTtcblxuXHRcdFx0Y29uc3QgYmVmb3JlUmVzdGFydCA9IGF3YWl0IHN2Yy5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgYSBob3N0IHJlc3RhcnQ6IGEgZnJlc2ggc2VydmljZSBvdmVyIHRoZSBzYW1lIHBlcnNpc3RlZFxuXHRcdFx0Ly8gZGF0YWJhc2VzLCB3aXRoIGEgZnJlc2ggYWdlbnQgc3RpbGwgbGVha2luZyB0aGUgYmFja2luZyBzZXNzaW9uLlxuXHRcdFx0Y29uc3QgcmVzdGFydEFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMZWFreU11bHRpQ2hhdEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0Y29uc3QgcmVzdGFydGVkID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBwZXJTZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRyZXN0YXJ0ZWQucmVnaXN0ZXJQcm92aWRlcihyZXN0YXJ0QWdlbnQpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJSZXN0YXJ0ID0gYXdhaXQgcmVzdGFydGVkLmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bGVha2VkQmVmb3JlUmVzdGFydDogYmVmb3JlUmVzdGFydC5tYXAocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSkuaW5jbHVkZXMoYmFja2luZ1VyaSksXG5cdFx0XHRcdG1hcmtlclBlcnNpc3RlZDogYXdhaXQgZGJGb3IoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsIGJhY2tpbmdTZGtJZCkpLmdldE1ldGFkYXRhKCdwZWVyQ2hhdEJhY2tpbmcnKSxcblx0XHRcdFx0bGVha2VkQWZ0ZXJSZXN0YXJ0OiBhZnRlclJlc3RhcnQubWFwKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkpLmluY2x1ZGVzKGJhY2tpbmdVcmkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsZWFrZWRCZWZvcmVSZXN0YXJ0OiBmYWxzZSxcblx0XHRcdFx0bWFya2VyUGVyc2lzdGVkOiBjaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxlYWtlZEFmdGVyUmVzdGFydDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZUNoYXQgc2lkZSBjaGF0cycsICgpID0+IHtcblxuXHRcdGNsYXNzIFNpZGVDaGF0QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0bGFzdENyZWF0ZU9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgY2hhdE1lc3NhZ2VzID0gbmV3IE1hcDxzdHJpbmcsIHJlYWRvbmx5IFR1cm5bXT4oKTtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdFx0XHR0aGlzLmxhc3RDcmVhdGVPcHRpb25zID0gb3B0aW9ucztcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhjaGF0OiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jaGF0TWVzc2FnZXMuZ2V0KGNoYXQudG9TdHJpbmcoKSkgPz8gc3VwZXIuZ2V0U2Vzc2lvbk1lc3NhZ2VzKGNoYXQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNvbXBsZXRlZFR1cm4oaWQ6IHN0cmluZywgdXNlclRleHQgPSAndXNlciB0ZXh0JywgYXNzaXN0YW50VGV4dCA9ICdhc3Npc3RhbnQgdGV4dCcpOiBUdXJuIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6IHVzZXJUZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiBgJHtpZH0tbWRgLCBjb250ZW50OiBhc3Npc3RhbnRUZXh0IH1dLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZWplY3RzIGEgc2lkZSBjaGF0IHdob3NlIHNvdXJjZSB0dXJuIGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpZGVDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnc2lkZS0xJykpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXRVcmksIHsgc2lkZUNoYXQ6IHsgc291cmNlOiBzZXNzaW9uLCB0dXJuSWQ6ICdtaXNzaW5nJyB9IH0pLFxuXHRcdFx0XHQvc2lkZSBjaGF0IHNvdXJjZSB0dXJuLyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGFuIGVtcHR5IHNpZGUtY2hhdCBzZWxlY3Rpb24gc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2lkZUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW2NvbXBsZXRlZFR1cm4oJ3QxJyldKTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdzaWRlLTEnKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSwgeyBzaWRlQ2hhdDogeyBzb3VyY2U6IHNlc3Npb24sIHR1cm5JZDogJ3QxJywgc2VsZWN0aW9uOiB7IHRleHQ6ICcgXFxuICcgfSB9IH0pLFxuXHRcdFx0XHQvc2VsZWN0aW9uIHRleHQgbXVzdCBiZSBub24tZW1wdHkvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSBzaWRlIGNoYXQgd2hvc2Ugc291cmNlIGNoYXQgaXMgaW4gYSBkaWZmZXJlbnQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTaWRlQ2hhdEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25CID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb25CLnRvU3RyaW5nKCksIFtjb21wbGV0ZWRUdXJuKCd0MScpXSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uQSwgJ3NpZGUtMScpKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uQSwgY2hhdFVyaSwgeyBzaWRlQ2hhdDogeyBzb3VyY2U6IHNlc3Npb25CLCB0dXJuSWQ6ICd0MScgfSB9KSxcblx0XHRcdFx0L2RvZXMgbm90IGJlbG9uZyB0byBzZXNzaW9uLyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIGEgZnJlc2ggcGVlciB3aXRoIGEgU2lkZUNoYXQgb3JpZ2luIGFuZCBubyBjb3BpZWQgc291cmNlIHR1cm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpZGVDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtjb21wbGV0ZWRUdXJuKCd0MScpLCBjb21wbGV0ZWRUdXJuKCd0MicpXSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnc2lkZS0xJykpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0geyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnLCByZXNwb25zZVBhcnRJZDogJ3Jlc3BvbnNlLXBhcnQtMScgfTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXRVcmksIHsgc2lkZUNoYXQ6IHsgc291cmNlOiBzZXNzaW9uLCB0dXJuSWQ6ICd0MScsIHNlbGVjdGlvbiB9IH0pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdFVyaS50b1N0cmluZygpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG9yaWdpbjogc3RhdGU/Lm9yaWdpbixcblx0XHRcdFx0Y29waWVkVHVybnM6IHN0YXRlPy50dXJucy5sZW5ndGgsXG5cdFx0XHRcdGZvcmtGb3J3YXJkZWQ6IGFnZW50Lmxhc3RDcmVhdGVPcHRpb25zPy5mb3JrLFxuXHRcdFx0XHRzaWRlQ2hhdEZvcndhcmRlZDogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnM/LnNpZGVDaGF0LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0dXJuSWQ6ICd0MScsIHNlbGVjdGlvbiB9LFxuXHRcdFx0XHRjb3BpZWRUdXJuczogMCxcblx0XHRcdFx0Zm9ya0ZvcndhcmRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzaWRlQ2hhdEZvcndhcmRlZDogeyBzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHR1cm5JZDogJ3QxJywgc2VsZWN0aW9uIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZXMgYSBzaWRlIGNoYXQgZnJvbSBhIGNvbXBsZXRlZCBsb2NhbCB0dXJuIHdpdGhvdXQgbG9zaW5nIGl0cyBzdGFibGUgc291cmNlIHR1cm4gaWRlbnRpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2lkZUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gKGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpKVswXS5zZXNzaW9uO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAncmVhbC0xJywgY29udGVudDogJ2ZpcnN0IHF1ZXN0aW9uJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ3JlYWwtMS1hJywgY29udGVudDogJ2ZpcnN0IGFuc3dlcicsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBsb2NhbFR1cm46IFR1cm4gPSB7XG5cdFx0XHRcdGlkOiAnbG9jYWwtMScsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJyFjb21tYW5kJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRhd2FpdCBkYi5pbnNlcnRMb2NhbFR1cm4oeyB0dXJuSWQ6ICdsb2NhbC0xJywgY2hhdFVyaTogZGVmYXVsdENoYXRVcmksIGFuY2hvclR1cm5JZDogJ3JlYWwtMScsIHNlcTogMSwgcGF5bG9hZDogSlNPTi5zdHJpbmdpZnkobG9jYWxUdXJuKSB9KTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblJlc291cmNlLCAnc2lkZS1sb2NhbCcpKTtcblxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvblJlc291cmNlLCBjaGF0VXJpLCB7IHNpZGVDaGF0OiB7IHNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdHVybklkOiAnbG9jYWwtMScgfSB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG9yaWdpbjogbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdFVyaS50b1N0cmluZygpKT8ub3JpZ2luLFxuXHRcdFx0XHRzaWRlQ2hhdEZvcndhcmRlZDogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnM/LnNpZGVDaGF0ICYmIHtcblx0XHRcdFx0XHRzb3VyY2U6IGFnZW50Lmxhc3RDcmVhdGVPcHRpb25zLnNpZGVDaGF0LnNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHR1cm5JZDogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnMuc2lkZUNoYXQudHVybklkLFxuXHRcdFx0XHRcdHByb3ZpZGVyQW5jaG9yVHVybklkOiBhZ2VudC5sYXN0Q3JlYXRlT3B0aW9ucy5zaWRlQ2hhdC5wcm92aWRlckFuY2hvclR1cm5JZCxcblx0XHRcdFx0XHRzb3VyY2VDb250ZXh0OiBhZ2VudC5sYXN0Q3JlYXRlT3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2VDb250ZXh0LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0dXJuSWQ6ICdsb2NhbC0xJyB9LFxuXHRcdFx0XHRzaWRlQ2hhdEZvcndhcmRlZDoge1xuXHRcdFx0XHRcdHNvdXJjZTogZGVmYXVsdENoYXRVcmksXG5cdFx0XHRcdFx0dHVybklkOiAnbG9jYWwtMScsXG5cdFx0XHRcdFx0cHJvdmlkZXJBbmNob3JUdXJuSWQ6ICdyZWFsLTEnLFxuXHRcdFx0XHRcdHNvdXJjZUNvbnRleHQ6ICdVc2VyIHJlcXVlc3Q6XFxuZmlyc3QgcXVlc3Rpb25cXG5cXG5BZ2VudCByZXNwb25zZTpcXG5maXJzdCBhbnN3ZXJcXG5cXG4tLS1cXG5cXG5Vc2VyIHJlcXVlc3Q6XFxuIWNvbW1hbmQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIGEgc2lkZSBjaGF0IGZyb20gdGhlIGN1cnJlbnQgYWN0aXZlIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2lkZUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHNvdXJjZUNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXHRcdFx0c2VydmljZS5kaXNwYXRjaEFjdGlvbihzb3VyY2VDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICdhY3RpdmUtdHVybicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3N0aWxsIHJ1bm5pbmcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9LCAndGVzdC1jbGllbnQnLCAxKTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNvdXJjZUNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICdhY3RpdmUtdHVybicsXG5cdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdwYXJ0aWFsJywgY29udGVudDogJ3BhcnRpYWwgYW5zd2VyJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnc2lkZS1hY3RpdmUnKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uLCBjaGF0VXJpLCB7IHNpZGVDaGF0OiB7IHNvdXJjZTogVVJJLnBhcnNlKHNvdXJjZUNoYXQpLCB0dXJuSWQ6ICdhY3RpdmUtdHVybicgfSB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNvdXJjZUFjdGl2ZVR1cm46IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzb3VyY2VDaGF0KT8uYWN0aXZlVHVybj8uaWQsXG5cdFx0XHRcdG9yaWdpbjogc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRVcmkudG9TdHJpbmcoKSk/Lm9yaWdpbixcblx0XHRcdFx0c2lkZUNoYXRGb3J3YXJkZWQ6IGFnZW50Lmxhc3RDcmVhdGVPcHRpb25zPy5zaWRlQ2hhdFxuXHRcdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFx0c291cmNlOiBhZ2VudC5sYXN0Q3JlYXRlT3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdHR1cm5JZDogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnMuc2lkZUNoYXQudHVybklkLFxuXHRcdFx0XHRcdFx0c291cmNlQ29udGV4dDogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnMuc2lkZUNoYXQuc291cmNlQ29udGV4dCxcblx0XHRcdFx0XHRcdHBhcnRpYWxSZXNwb25zZTogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnMuc2lkZUNoYXQucGFydGlhbFJlc3BvbnNlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c291cmNlQWN0aXZlVHVybjogJ2FjdGl2ZS10dXJuJyxcblx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0LCBjaGF0OiBzb3VyY2VDaGF0LCB0dXJuSWQ6ICdhY3RpdmUtdHVybicgfSxcblx0XHRcdFx0c2lkZUNoYXRGb3J3YXJkZWQ6IHsgc291cmNlOiBzb3VyY2VDaGF0LCB0dXJuSWQ6ICdhY3RpdmUtdHVybicsIHNvdXJjZUNvbnRleHQ6ICdVc2VyIHJlcXVlc3Q6XFxuc3RpbGwgcnVubmluZycsIHBhcnRpYWxSZXNwb25zZTogJ3BhcnRpYWwgYW5zd2VyJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIGEgc2lkZSBjaGF0IGZyb20gYSBsYXRlciBhY3RpdmUgdHVybiB3aXRob3V0IGxvc2luZyB0aGUgY3VycmVudCB1c2VyIHF1ZXN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpZGVDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBzb3VyY2VDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgW2NvbXBsZXRlZFR1cm4oJ3QxJywgJ2ZpcnN0IHF1ZXN0aW9uJywgJ2ZpcnN0IGFuc3dlcicpXSk7XG5cdFx0XHRzZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKHNvdXJjZUNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ2FjdGl2ZS10dXJuJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc2Vjb25kIHF1ZXN0aW9uJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSwgJ3Rlc3QtY2xpZW50JywgMSk7XG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzb3VyY2VDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0dHVybklkOiAnYWN0aXZlLXR1cm4nLFxuXHRcdFx0XHRwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncGFydGlhbCcsIGNvbnRlbnQ6ICdwYXJ0aWFsIGFuc3dlcicgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3NpZGUtYWN0aXZlLWxhdGVyJykpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSwgeyBzaWRlQ2hhdDogeyBzb3VyY2U6IFVSSS5wYXJzZShzb3VyY2VDaGF0KSwgdHVybklkOiAnYWN0aXZlLXR1cm4nIH0gfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQubGFzdENyZWF0ZU9wdGlvbnM/LnNpZGVDaGF0ICYmIHtcblx0XHRcdFx0c291cmNlOiBhZ2VudC5sYXN0Q3JlYXRlT3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0dHVybklkOiBhZ2VudC5sYXN0Q3JlYXRlT3B0aW9ucy5zaWRlQ2hhdC50dXJuSWQsXG5cdFx0XHRcdHNvdXJjZUNvbnRleHQ6IGFnZW50Lmxhc3RDcmVhdGVPcHRpb25zLnNpZGVDaGF0LnNvdXJjZUNvbnRleHQsXG5cdFx0XHRcdHBhcnRpYWxSZXNwb25zZTogYWdlbnQubGFzdENyZWF0ZU9wdGlvbnMuc2lkZUNoYXQucGFydGlhbFJlc3BvbnNlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzb3VyY2U6IHNvdXJjZUNoYXQsXG5cdFx0XHRcdHR1cm5JZDogJ2FjdGl2ZS10dXJuJyxcblx0XHRcdFx0c291cmNlQ29udGV4dDogJ1VzZXIgcmVxdWVzdDpcXG5maXJzdCBxdWVzdGlvblxcblxcbkFnZW50IHJlc3BvbnNlOlxcbmZpcnN0IGFuc3dlclxcblxcbi0tLVxcblxcblVzZXIgcmVxdWVzdDpcXG5zZWNvbmQgcXVlc3Rpb24nLFxuXHRcdFx0XHRwYXJ0aWFsUmVzcG9uc2U6ICdwYXJ0aWFsIGFuc3dlcicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlcnNpc3RzIGFuZCByZXN0b3JlcyB0aGUgU2lkZUNoYXQgb3JpZ2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpZGVDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIFtjb21wbGV0ZWRUdXJuKCd0MScpXSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnc2lkZS0xJykpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0geyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnLCByZXNwb25zZVBhcnRJZDogJ3Jlc3BvbnNlLXBhcnQtMScgfTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXRVcmksIHsgc2lkZUNoYXQ6IHsgc291cmNlOiBzZXNzaW9uLCB0dXJuSWQ6ICd0MScsIHNlbGVjdGlvbiB9IH0pO1xuXG5cdFx0XHRsZXQgcGVyc2lzdGVkT3JpZ2luOiB1bmtub3duO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdwZWVyQ2hhdHMnKTtcblx0XHRcdFx0aWYgKHJhdyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIHsgdXJpOiBzdHJpbmc7IG9yaWdpbj86IHVua25vd24gfVtdO1xuXHRcdFx0XHRcdHBlcnNpc3RlZE9yaWdpbiA9IHBhcnNlZC5maW5kKGVudHJ5ID0+IGVudHJ5LnVyaSA9PT0gY2hhdFVyaS50b1N0cmluZygpKT8ub3JpZ2luO1xuXHRcdFx0XHRcdGlmIChwZXJzaXN0ZWRPcmlnaW4pIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBlcnNpc3RlZE9yaWdpbixcblx0XHRcdFx0cmVzdG9yZWRPcmlnaW46IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRVcmkudG9TdHJpbmcoKSk/Lm9yaWdpbixcblx0XHRcdH0sIHtcblx0XHRcdFx0cGVyc2lzdGVkT3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0LCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdHVybklkOiAndDEnLCBzZWxlY3Rpb24gfSxcblx0XHRcdFx0cmVzdG9yZWRPcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0dXJuSWQ6ICd0MScsIHNlbGVjdGlvbiB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoeWRyYXRlcyBhIG1pc3NpbmcgcGVlciBjaGF0IHdoZW4gcmVzb2x2aW5nIGEgZ2VuZXJpYyBDaGF0IGF0dGFjaG1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2lkZUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItMScpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIHBlZXJDaGF0KTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTAgJiYgYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ3BlZXJDaGF0cycpID09PSB1bmRlZmluZWQ7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0fVxuXHRcdFx0YWdlbnQuY2hhdE1lc3NhZ2VzLnNldChwZWVyQ2hhdC50b1N0cmluZygpLCBbY29tcGxldGVkVHVybigncGVlci10dXJuJywgJ1JlbWVtYmVyIFgnLCAnUmVtZW1iZXJlZCcpXSk7XG5cdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLnJlbW92ZUNoYXQoc2Vzc2lvbi50b1N0cmluZygpLCBwZWVyQ2hhdC50b1N0cmluZygpKTtcblxuXHRcdFx0Y29uc3Qgc2VudCA9IEV2ZW50LnRvUHJvbWlzZShhZ2VudC5vbkRpZFNlbmRNZXNzYWdlKTtcblx0XHRcdGxvY2FsU2VydmljZS5kaXNwYXRjaEFjdGlvbihidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1doYXQgd2FzIHJlbWVtYmVyZWQ/Jyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogcGVlckNoYXQudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGVuZFR1cm46ICdwZWVyLXR1cm4nLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdFYXJsaWVyIGNoYXQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgJ2NsaWVudC0xJywgMSk7XG5cdFx0XHRhd2FpdCBzZW50O1xuXG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5hdHRhY2htZW50cz8uWzBdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBlZXJIeWRyYXRlZDogISFsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdC50b1N0cmluZygpKSxcblx0XHRcdFx0dHlwZTogYXR0YWNobWVudD8udHlwZSxcblx0XHRcdFx0aGFzVHJhbnNjcmlwdDogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdVc2VyOiBSZW1lbWJlciBYJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBlZXJIeWRyYXRlZDogdHJ1ZSxcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0aGFzVHJhbnNjcmlwdDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdC8vIC0tLS0gY2hhdCBzdXJmYWNlIHJvdXRpbmcgKEctQzEpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnY2hhdCBzdXJmYWNlIHJvdXRpbmcnLCAoKSA9PiB7XG5cblx0XHQvKipcblx0XHQgKiBBbiBhZ2VudCB0aGF0IGV4cG9zZXMgdGhlIGNoYXQgc3VyZmFjZSBBTkQgdGhlIGxlZ2FjeVxuXHRcdCAqIGAoc2Vzc2lvbiwgY2hhdD8pYCBwZWVyLWNoYXQgbWV0aG9kcywgcmVjb3JkaW5nIHdoaWNoIHBhdGggdGhlXG5cdFx0ICogb3JjaGVzdHJhdG9yIHRha2VzLlxuXHRcdCAqL1xuXHRcdGNsYXNzIENoYXRTdXJmYWNlQWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0cmVhZG9ubHkgc2Vzc2lvbkNyZWF0ZUNhbGxzOiBVUklbXSA9IFtdO1xuXHRcdFx0cmVhZG9ubHkgc2Vzc2lvbkRpc3Bvc2VDYWxsczogVVJJW10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IGxlZ2FjeUNyZWF0ZUNoYXRDYWxsczogVVJJW10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IGNoYXRDYWxsczogeyBvcDogc3RyaW5nOyBhcmdzOiBzdHJpbmdbXSB9W10gPSBbXTtcblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBpbXBvcnQoJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnKS5JQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVTZXNzaW9uUmVzdWx0PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1cGVyLmNyZWF0ZVNlc3Npb24oY29uZmlnKTtcblx0XHRcdFx0dGhpcy5zZXNzaW9uQ3JlYXRlQ2FsbHMucHVzaChyZXN1bHQuc2Vzc2lvbik7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25EaXNwb3NlQ2FsbHMucHVzaChzZXNzaW9uKTtcblx0XHRcdFx0YXdhaXQgc3VwZXIuZGlzcG9zZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBsZWdhY3kgcGVlci1jaGF0IG1ldGhvZCBpcyBwcmVzZW50IHRvbzsgaXQgbXVzdCBOT1QgYmUgdXNlZFxuXHRcdFx0Ly8gd2hlbiB0aGUgY2hhdHMgc3VyZmFjZSBleGlzdHMuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KF9zZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGlzLmxlZ2FjeUNyZWF0ZUNoYXRDYWxscy5wdXNoKGNoYXQpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBjaGF0czogSUFnZW50Q2hhdHMgPSB7XG5cdFx0XHRcdGNyZWF0ZUNoYXQ6IGFzeW5jIChjaGF0OiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBwYXJzZUNoYXRVcmkoY2hhdCkhLnNlc3Npb247XG5cdFx0XHRcdFx0dGhpcy5jaGF0Q2FsbHMucHVzaCh7IG9wOiAnY3JlYXRlQ2hhdCcsIGFyZ3M6IFtzZXNzaW9uLCBjaGF0LnRvU3RyaW5nKCksIG9wdGlvbnM/LnRpdGxlID8/ICcnXSB9KTtcblx0XHRcdFx0XHRyZXR1cm4geyBwcm92aWRlckRhdGE6ICdwZCcgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9yazogYXN5bmMgKGNoYXQ6IFVSSSwgc291cmNlOiBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBwYXJzZUNoYXRVcmkoY2hhdCkhLnNlc3Npb247XG5cdFx0XHRcdFx0dGhpcy5jaGF0Q2FsbHMucHVzaCh7IG9wOiAnZm9yaycsIGFyZ3M6IFtzZXNzaW9uLCBjaGF0LnRvU3RyaW5nKCksIHNvdXJjZS5zb3VyY2UudG9TdHJpbmcoKSwgc291cmNlLnR1cm5JZF0gfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJEYXRhOiAncGQtZm9yaycgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zZUNoYXQ6IGFzeW5jIChjaGF0OiBVUkkpID0+IHtcblx0XHRcdFx0XHR0aGlzLmNoYXRDYWxscy5wdXNoKHsgb3A6ICdkaXNwb3NlQ2hhdCcsIGFyZ3M6IFtjaGF0LnRvU3RyaW5nKCldIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZW5kTWVzc2FnZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRhYm9ydDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRjaGFuZ2VNb2RlbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRjaGFuZ2VBZ2VudDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRNZXNzYWdlczogYXN5bmMgKGNoYXQ6IFVSSSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuY2hhdENhbGxzLnB1c2goeyBvcDogJ2dldE1lc3NhZ2VzJywgYXJnczogW2NoYXQudG9TdHJpbmcoKV0gfSk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uL2NyZWF0ZUNoYXQvZGlzcG9zZUNoYXQvZGlzcG9zZVNlc3Npb24gcHJlZmVyIHRoZSBjaGF0IHN1cmZhY2Ugb3ZlciBsZWdhY3kgbWV0aG9kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0U3VyZmFjZUFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci0xJykpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXRVcmksIHsgdGl0bGU6ICdQZWVyJyB9KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuZGlzcG9zZUNoYXQoc2Vzc2lvbiwgY2hhdFVyaSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRpc3Bvc2VTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2Vzc2lvbkNyZWF0ZTogYWdlbnQuc2Vzc2lvbkNyZWF0ZUNhbGxzLm1hcChzID0+IHMudG9TdHJpbmcoKSksXG5cdFx0XHRcdHNlc3Npb25EaXNwb3NlOiBhZ2VudC5zZXNzaW9uRGlzcG9zZUNhbGxzLm1hcChzID0+IHMudG9TdHJpbmcoKSksXG5cdFx0XHRcdGxlZ2FjeUNyZWF0ZUNoYXQ6IGFnZW50LmxlZ2FjeUNyZWF0ZUNoYXRDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGNoYXRPcHM6IGFnZW50LmNoYXRDYWxscy5tYXAoYyA9PiBjLm9wKSxcblx0XHRcdFx0Y3JlYXRlQ2hhdEFyZ3M6IGFnZW50LmNoYXRDYWxscy5maW5kKGMgPT4gYy5vcCA9PT0gJ2NyZWF0ZUNoYXQnKT8uYXJncyxcblx0XHRcdFx0ZGlzcG9zZUNoYXRBcmc6IGFnZW50LmNoYXRDYWxscy5maW5kKGMgPT4gYy5vcCA9PT0gJ2Rpc3Bvc2VDaGF0Jyk/LmFyZ3NbMF0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNlc3Npb25DcmVhdGU6IFtzZXNzaW9uLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRzZXNzaW9uRGlzcG9zZTogW3Nlc3Npb24udG9TdHJpbmcoKV0sXG5cdFx0XHRcdGxlZ2FjeUNyZWF0ZUNoYXQ6IDAsXG5cdFx0XHRcdGNoYXRPcHM6IFsnY3JlYXRlQ2hhdCcsICdkaXNwb3NlQ2hhdCddLFxuXHRcdFx0XHRjcmVhdGVDaGF0QXJnczogW3Nlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVyaS50b1N0cmluZygpLCAnUGVlciddLFxuXHRcdFx0XHRkaXNwb3NlQ2hhdEFyZzogY2hhdFVyaS50b1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JrIHJvdXRlcyB0byBjaGF0cy5mb3JrIHdpdGggdGhlIHJlc29sdmVkIHNvdXJjZSBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRTdXJmYWNlQWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cblx0XHRcdGNvbnN0IHNvdXJjZVR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHRcdHsgaWQ6ICd0MScsIHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsIG1lc3NhZ2U6IHsgdGV4dDogJ2ZpcnN0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LCByZXNwb25zZVBhcnRzOiBbXSwgdXNhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XTtcblx0XHRcdHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgc291cmNlVHVybnMpO1xuXG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci0xJykpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXRVcmksIHsgZm9yazogeyBzb3VyY2U6IHNlc3Npb24sIHR1cm5JZDogJ3QxJyB9IH0pO1xuXG5cdFx0XHRjb25zdCBmb3JrQ2FsbCA9IGFnZW50LmNoYXRDYWxscy5maW5kKGMgPT4gYy5vcCA9PT0gJ2ZvcmsnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm9ya0NhbGw/LmFyZ3MsIFtzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXRVcmkudG9TdHJpbmcoKSwgc2Vzc2lvbi50b1N0cmluZygpLCAndDEnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlIHJlYWRzIHRoZSBkZWZhdWx0IGNoYXQgdmlhIGNoYXRzLmdldE1lc3NhZ2VzIG9uIHRoZSBkZWZhdWx0IGNoYXQgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRTdXJmYWNlQWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IGdldE1lc3NhZ2VzID0gYWdlbnQuY2hhdENhbGxzLmZpbHRlcihjID0+IGMub3AgPT09ICdnZXRNZXNzYWdlcycpLm1hcChjID0+IGMuYXJnc1swXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE1lc3NhZ2VzLCBbYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHNwYXduIGNoYW5uZWwgcm91dGluZyAoRy1EMSkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc3Bhd24gY2hhbm5lbCByb3V0aW5nJywgKCkgPT4ge1xuXG5cdFx0LyoqXG5cdFx0ICogQW4gYWdlbnQgdGhhdCBleHBvc2VzIHRoZSBmaXJzdC1jbGFzcyBzcGF3biBtZW1iZXJzaGlwIGNoYW5uZWwsXG5cdFx0ICogd2l0aCBhIHRlc3QgaG9vayB0byBmaXJlIHtAbGluayBJQWdlbnQub25EaWRTcGF3bkNoYXR9LlxuXHRcdCAqL1xuXHRcdGNsYXNzIFNwYXduQ2hhbm5lbEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3Bhd25DaGF0ID0gbmV3IEVtaXR0ZXI8SUFnZW50U3Bhd25DaGF0RXZlbnQ+KCk7XG5cdFx0XHRyZWFkb25seSBvbkRpZFNwYXduQ2hhdCA9IHRoaXMuX29uRGlkU3Bhd25DaGF0LmV2ZW50O1xuXG5cdFx0XHRmaXJlU3Bhd24oZTogSUFnZW50U3Bhd25DaGF0RXZlbnQpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fb25EaWRTcGF3bkNoYXQuZmlyZShlKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fb25EaWRTcGF3bkNoYXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdCgnb25EaWRTcGF3bkNoYXQgYWRkcyB0aGUgY2hhdCB0byB0aGUgY2F0YWxvZyB3aXRoIGEgVG9vbCBvcmlnaW4gZnJvbSBpdHMgcGFyZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNwYXduQ2hhbm5lbEFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSk7XG5cdFx0XHRjb25zdCBzcGF3bmVkID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnc3Bhd25lZC0xJykpO1xuXHRcdFx0YWdlbnQuZmlyZVNwYXduKHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0Y2hhdDogc3Bhd25lZCxcblx0XHRcdFx0cGFyZW50OiB7IGNoYXQ6IHBhcmVudENoYXQsIHRvb2xDYWxsSWQ6ICd0Yy10YXNrLTEnIH0sXG5cdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2hhdFN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHNwYXduZWQudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hhdHMgPSAoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzID8/IFtdKS5tYXAoYyA9PiBjLnJlc291cmNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0aXRsZTogY2hhdFN0YXRlPy50aXRsZSxcblx0XHRcdFx0b3JpZ2luOiBjaGF0U3RhdGU/Lm9yaWdpbixcblx0XHRcdFx0aW5DYXRhbG9nOiBzZXNzaW9uQ2hhdHMuaW5jbHVkZXMoc3Bhd25lZC50b1N0cmluZygpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGl0bGU6ICdFeHBsb3JlJyxcblx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIGNoYXQ6IHBhcmVudENoYXQudG9TdHJpbmcoKSwgdG9vbENhbGxJZDogJ3RjLXRhc2stMScgfSxcblx0XHRcdFx0aW5DYXRhbG9nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbkRpZFNwYXduQ2hhdCB3aXRob3V0IGEgcGFyZW50IGFkZHMgdGhlIGNoYXQgd2l0aCBubyB0b29sIG9yaWdpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTcGF3bkNoYW5uZWxBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Y29uc3Qgc3Bhd25lZCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3NwYXduZWQtMicpKTtcblx0XHRcdGFnZW50LmZpcmVTcGF3bih7IHNlc3Npb24sIGNoYXQ6IHNwYXduZWQgfSk7XG5cblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzcGF3bmVkLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG9yaWdpbjogY2hhdFN0YXRlPy5vcmlnaW4sXG5cdFx0XHRcdGluQ2F0YWxvZzogY2hhdFN0YXRlICE9PSB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbkNhdGFsb2c6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBzdWJhZ2VudCBtZW1iZXJzaGlwIHNlcXVlbmNpbmcgKERSMTogdW5pZmllZCBzcGF3biBjaGFubmVsKSAtLS0tXG5cblx0c3VpdGUoJ3N1YmFnZW50IG1lbWJlcnNoaXAgc2VxdWVuY2luZycsICgpID0+IHtcblxuXHRcdC8qKiBGaXJlcyBhIHBhcmVudCB0dXJuIG9uIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0LiAqL1xuXHRcdGZ1bmN0aW9uIHN0YXJ0UGFyZW50VHVybihzZXNzaW9uOiBVUkksIHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRzZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZCwgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJywgbWVzc2FnZTogeyB0ZXh0OiAnZ28nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfSxcblx0XHRcdFx0J2NsaWVudC10ZXN0JywgMSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnYSBzdWJhZ2VudF9zdGFydGVkIHNpZ25hbCB5aWVsZHMgZXhhY3RseSBvbmUgY2F0YWxvZyBlbnRyeSB3aXRoIHRoZSBwYXJlbnQgb3JpZ2luLCB0aXRsZSwgYW5kIGEgc3RhcnRlZCB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHBhcmVudENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFBhcmVudFR1cm4oc2Vzc2lvbiwgJ3R1cm4tMScpO1xuXG5cdFx0XHRjb3BpbG90QWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UocGFyZW50Q2hhdCksIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnLFxuXHRcdFx0XHR0YXNrRGVzY3JpcHRpb246ICdSZXZpZXcgcGFja2FnZS5qc29uIHN0cnVjdHVyZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCksICd0Yy1zdWInKTtcblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHRjb25zdCBtYXRjaGluZyA9IChzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8uY2hhdHMgPz8gW10pLmZpbHRlcihjID0+IGMucmVzb3VyY2UgPT09IHN1YmFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjYXRhbG9nRW50cmllczogbWF0Y2hpbmcubGVuZ3RoLFxuXHRcdFx0XHR0aXRsZTogY2hhdFN0YXRlPy50aXRsZSxcblx0XHRcdFx0b3JpZ2luOiBjaGF0U3RhdGU/Lm9yaWdpbixcblx0XHRcdFx0aW50ZXJhY3Rpdml0eTogY2hhdFN0YXRlPy5pbnRlcmFjdGl2aXR5LFxuXHRcdFx0XHRoYXNTdGFydGVkVHVybjogc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHN1YmFnZW50VXJpKSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjYXRhbG9nRW50cmllczogMSxcblx0XHRcdFx0Ly8gVGhlIGNvbmNpc2UgcGVyLXRhc2sgZGVzY3JpcHRpb24gbmFtZXMgdGhlIHRhYiAoZGlzdGluY3QgZXZlbiBmb3Jcblx0XHRcdFx0Ly8gdHdvIHN1YmFnZW50cyBvZiB0aGUgc2FtZSB0eXBlKSwgbm90IHRoZSBhZ2VudC10eXBlIGRpc3BsYXkgbmFtZS5cblx0XHRcdFx0dGl0bGU6ICdSZXZpZXcgcGFja2FnZS5qc29uIHN0cnVjdHVyZScsXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBwYXJlbnRDaGF0LCB0b29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHRpbnRlcmFjdGl2aXR5OiAncmVhZC1vbmx5Jyxcblx0XHRcdFx0aGFzU3RhcnRlZFR1cm46IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RoZSBzcGF3bmVkIGNhdGFsb2cgY2hhdCBpcyByZXNvbHZhYmxlIGZyb20gdGhlIGlubGluZSBwaWxsIHJlc291cmNlIHZpYSBwYXJzZUNoYXRVcmkgKHRoZSBPcGVuLVN1YmFnZW50IGNvbnRyYWN0KScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBpbmxpbmUgc3ViYWdlbnQgcGlsbCAoYFRvb2xSZXN1bHRTdWJhZ2VudENvbnRlbnQucmVzb3VyY2VgKSBhbmRcblx0XHRcdC8vIHRoZSBjYXRhbG9nIGNoYXQgYXJlIGJvdGggYnVpbHQgZnJvbSBgYnVpbGRTdWJhZ2VudENoYXRVcmlgLCBhbmQgdGhlXG5cdFx0XHQvLyBBZ2VudHMgd2luZG93IHJlc29sdmVzIHRoZSBwaWxsIHRvIGl0cyB0YWIgYnkgbWF0Y2hpbmdcblx0XHRcdC8vIGBwYXJzZUNoYXRVcmkocGlsbFJlc291cmNlKS5jaGF0SWRgIGFnYWluc3QgdGhlIGNhdGFsb2cgY2hhdCdzXG5cdFx0XHQvLyBwYXJzZWQgY2hhdElkIChzZWUgYGZpbmRTdWJhZ2VudENoYXRgL2BtYXRjaGVzUmVzb3VyY2VgIGluXG5cdFx0XHQvLyBgb3BlblN1YmFnZW50Q2hhdC50c2ApLiBJZiB0aGUgdHdvIGV2ZXIgZGVzeW5jLCB0aGUgcGlsbCBzaG93cyB0aGVcblx0XHRcdC8vIGZhbGxiYWNrIFwiT3BlbiBTdWJhZ2VudFwiIGxhYmVsIGFuZCBjbGlja2luZyBpdCBuby1vcHMuIEd1YXJkIHRoZVxuXHRcdFx0Ly8gcm91bmQtdHJpcCBzbyB0aGUgcGlsbCBzdGF5cyByZXNvbHZhYmxlLlxuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHBhcmVudENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFBhcmVudFR1cm4oc2Vzc2lvbiwgJ3R1cm4tMScpO1xuXG5cdFx0XHRjb3BpbG90QWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UocGFyZW50Q2hhdCksIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSByZXNvdXJjZSB0aGUgaW5saW5lIHBpbGwgY2FycmllcyBmb3IgdGhpcyBzdWJhZ2VudC5cblx0XHRcdGNvbnN0IHBpbGxSZXNvdXJjZSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgJ3RjLXN1YicpO1xuXHRcdFx0Y29uc3QgcGlsbENoYXRJZCA9IHBhcnNlQ2hhdFVyaShwaWxsUmVzb3VyY2UpPy5jaGF0SWQ7XG5cdFx0XHRjb25zdCBjYXRhbG9nID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzID8/IFtdO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRCeVBpbGwgPSBjYXRhbG9nLmZpbHRlcihjID0+IHBhcnNlQ2hhdFVyaShjLnJlc291cmNlKT8uY2hhdElkID09PSBwaWxsQ2hhdElkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwaWxsQ2hhdElkLFxuXHRcdFx0XHRyZXNvbHZlZENhdGFsb2dFbnRyaWVzOiByZXNvbHZlZEJ5UGlsbC5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBpbGxDaGF0SWQ6ICdzdWJhZ2VudC90Yy1zdWInLFxuXHRcdFx0XHRyZXNvbHZlZENhdGFsb2dFbnRyaWVzOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHN1YmFnZW50X3N0YXJ0ZWQgc2lnbmFsIHdpdGhvdXQgYSB0YXNrRGVzY3JpcHRpb24gZmFsbHMgYmFjayB0byB0aGUgYWdlbnQgZGlzcGxheSBuYW1lIGZvciB0aGUgdGFiIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHBhcmVudENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFBhcmVudFR1cm4oc2Vzc2lvbiwgJ3R1cm4tMScpO1xuXG5cdFx0XHRjb3BpbG90QWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UocGFyZW50Q2hhdCksIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAndGMtc3ViJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHN1YmFnZW50VXJpKT8udGl0bGUsICdFeHBsb3JlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtZW1iZXJzaGlwIHN0YXlzIGEgc2luZ2xlIGVudHJ5IHdoZW4gdGhlIGFnZW50IGFsc28gbWlycm9ycyB0aGUgc3ViYWdlbnQgb250byBvbkRpZFNwYXduQ2hhdCwgcmVnYXJkbGVzcyBvZiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIE1pcnJvciB0aGUgcmVhbCBjb3BpbG90L2NsYXVkZSBhZ2VudHMsIHdoaWNoIEFMU08gYnJpZGdlIHRoZWlyXG5cdFx0XHQvLyBzdWJhZ2VudCBzaWduYWxzIG9udG8gb25EaWRTcGF3bkNoYXQuIFRoZSBvcmNoZXN0cmF0b3Inc1xuXHRcdFx0Ly8gcHJvZ3Jlc3Mgc2VxdWVuY2VyIGFuZCB0aGUgYWdlbnQncyBzcGF3biBicmlkZ2UgYm90aCBmdW5uZWwgdG8gdGhlXG5cdFx0XHQvLyBpZGVtcG90ZW50IF9vbkNoYXRTcGF3bmVkLCBzbyB0aGUgY2F0YWxvZyBtdXN0IGdhaW4gZXhhY3RseVxuXHRcdFx0Ly8gb25lIGVudHJ5IG5vIG1hdHRlciB3aGljaCBsaXN0ZW5lciBydW5zIGZpcnN0LlxuXHRcdFx0Y2xhc3MgQnJpZGdpbmdTdWJhZ2VudEFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTcGF3bkNoYXQgPSBuZXcgRW1pdHRlcjxJQWdlbnRTcGF3bkNoYXRFdmVudD4oKTtcblx0XHRcdFx0cmVhZG9ubHkgb25EaWRTcGF3bkNoYXQgPSB0aGlzLl9vbkRpZFNwYXduQ2hhdC5ldmVudDtcblx0XHRcdFx0cHJpdmF0ZSByZWFkb25seSBfYnJpZGdlID0gdGhpcy5vbkRpZFNlc3Npb25Qcm9ncmVzcyhzaWduYWwgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGUgPSBTdWJhZ2VudENoYXRTaWduYWwudG9TcGF3bkV2ZW50KHNpZ25hbCk7XG5cdFx0XHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkU3Bhd25DaGF0LmZpcmUoZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0XHRcdHRoaXMuX2JyaWRnZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTcGF3bkNoYXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZ2VudCA9IG5ldyBCcmlkZ2luZ1N1YmFnZW50QWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRQYXJlbnRUdXJuKHNlc3Npb24sICd0dXJuLTEnKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UocGFyZW50Q2hhdCksIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAndGMtc3ViJyk7XG5cdFx0XHRjb25zdCBtYXRjaGluZyA9IChzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKT8uY2hhdHMgPz8gW10pLmZpbHRlcihjID0+IGMucmVzb3VyY2UgPT09IHN1YmFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjYXRhbG9nRW50cmllczogbWF0Y2hpbmcubGVuZ3RoLFxuXHRcdFx0XHRvcmlnaW46IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzdWJhZ2VudFVyaSk/Lm9yaWdpbixcblx0XHRcdFx0aGFzU3RhcnRlZFR1cm46IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudFVyaSkgIT09IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2F0YWxvZ0VudHJpZXM6IDEsXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBwYXJlbnRDaGF0LCB0b29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHRoYXNTdGFydGVkVHVybjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYW4gaW5uZXIgdG9vbCBjYWxsIGFycml2aW5nIGJlZm9yZSBzdWJhZ2VudF9zdGFydGVkIGlzIGJ1ZmZlcmVkIGFuZCBkcmFpbmVkIG9udG8gdGhlIHN1YmFnZW50IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Y29uc3QgcGFyZW50Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdHN0YXJ0UGFyZW50VHVybihzZXNzaW9uLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIFBhcmVudCB0YXNrIHRvb2wgc3RhcnRzLlxuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXN1YicsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXN1YicsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXG5cdFx0XHQvLyBJbm5lciB0b29sIGFycml2ZXMgQkVGT1JFIHN1YmFnZW50X3N0YXJ0ZWQgKGJ1ZmZlcmVkKS5cblx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShwYXJlbnRDaGF0KSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXN1YicsIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAnaW5uZXItMScsIHRvb2xOYW1lOiAncmVhZCcsIGRpc3BsYXlOYW1lOiAnUmVhZCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtc3ViJywgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICdpbm5lci0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cblx0XHRcdC8vIHN1YmFnZW50X3N0YXJ0ZWQgYXJyaXZlcyBhbmQgZHJhaW5zIHRoZSBidWZmZXIuXG5cdFx0XHRjb3BpbG90QWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UocGFyZW50Q2hhdCksIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0pO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgJ3RjLXN1YicpO1xuXHRcdFx0Y29uc3Qgc3ViU3RhdGUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0Y29uc3QgaW5uZXJPblN1YmFnZW50ID0gc3ViU3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuc29tZShycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci0xJyk7XG5cdFx0XHRjb25zdCBpbm5lck9uUGFyZW50ID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuc29tZShycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci0xJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaW5uZXJPblN1YmFnZW50LCBpbm5lck9uUGFyZW50IH0sIHsgaW5uZXJPblN1YmFnZW50OiB0cnVlLCBpbm5lck9uUGFyZW50OiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Egc3ViYWdlbnQgY2hhdCBzdXJ2aXZlcyBzdWJhZ2VudF9jb21wbGV0ZWQgKHN0YXlzIGxpdmUgYW5kIHN1YnNjcmliYWJsZSwgaXRzIHR1cm4gY29tcGxldGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRQYXJlbnRUdXJuKHNlc3Npb24sICd0dXJuLTEnKTtcblxuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKHBhcmVudENoYXQpLCB0b29sQ2FsbElkOiAndGMtc3ViJywgYWdlbnROYW1lOiAnZXhwbG9yZScsIGFnZW50RGlzcGxheU5hbWU6ICdFeHBsb3JlJywgYWdlbnREZXNjcmlwdGlvbjogJ0V4cGxvcmVzJyB9KTtcblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAndGMtc3ViJyk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHN1YmFnZW50VXJpKSwgJ3ByZWNvbmRpdGlvbjogc3ViYWdlbnQgY2hhdCBwcmVzZW50IGFmdGVyIHN0YXJ0Jyk7XG5cblx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfY29tcGxldGVkJywgY2hhdDogVVJJLnBhcnNlKHBhcmVudENoYXQpLCB0b29sQ2FsbElkOiAndGMtc3ViJyB9KTtcblxuXHRcdFx0Y29uc3Qgc3RpbGxJbkNhdGFsb2cgPSAoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzID8/IFtdKS5zb21lKGMgPT4gYy5yZXNvdXJjZSA9PT0gc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc0NoYXRTdGF0ZTogc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHN1YmFnZW50VXJpKSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGlsbEluQ2F0YWxvZyxcblx0XHRcdFx0aGFzQWN0aXZlVHVybjogc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHN1YmFnZW50VXJpKSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNDaGF0U3RhdGU6IHRydWUsXG5cdFx0XHRcdHN0aWxsSW5DYXRhbG9nOiB0cnVlLFxuXHRcdFx0XHRoYXNBY3RpdmVUdXJuOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBzdWJhZ2VudCB0b29sIGNhbGwgYXdhaXRpbmcgdXNlciBjb25maXJtYXRpb24gZG9lcyBub3QgdGltZSBvdXQgYmVmb3JlIHRoZSB1c2VyIHJlc3BvbmRzJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdHN0YXJ0UGFyZW50VHVybihzZXNzaW9uLCAndHVybi0xJyk7XG5cblx0XHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UocGFyZW50Q2hhdCksXG5cdFx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JywgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHQvLyBObyBgY29uZmlybWVkYCBcdTIwMTQgdGhlIHRvb2wgc2l0cyBpbiBQZW5kaW5nQ29uZmlybWF0aW9uLCBlLmcuIHdhaXRpbmcgb24gdGhlIHVzZXIuXG5cdFx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLFxuXHRcdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtc3ViJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gVGhlIHVzZXIgdGFrZXMgZmFyIGxvbmdlciB0aGFuIHRoZSBwZW5kaW5nLXJlZ2lzdHJhdGlvbiBib3VuZCB0byByZXNwb25kLlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNjBfMDAwKSk7XG5cblx0XHRcdFx0Ly8gT25seSBub3cgZG9lcyB0aGUgdXNlciBhcHByb3ZlIFx1MjAxNCB0aGlzIG11c3Qgc3RpbGwgYXJtIGEgZnJlc2ggd2FpdCwgbm90IG9uZSBhbHJlYWR5IHRpbWVkIG91dC5cblx0XHRcdFx0c2VydmljZS5kaXNwYXRjaEFjdGlvbihwYXJlbnRDaGF0LCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtc3ViJywgYXBwcm92ZWQ6IHRydWUsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbiB9LCAnY2xpZW50LTEnLCAxKTtcblxuXHRcdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgJ3RjLXN1YicpO1xuXHRcdFx0XHRjb25zdCBzdWJzY3JpYmVQcm9taXNlID0gc2VydmljZS5zdWJzY3JpYmUoVVJJLnBhcnNlKHN1YmFnZW50VXJpKSwgJ2NsaWVudC1yYWNlJyk7XG5cdFx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0XHRcdHZvaWQgc3Vic2NyaWJlUHJvbWlzZS50aGVuKCgpID0+IHsgc2V0dGxlZCA9IHRydWU7IH0pO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0dGxlZCwgZmFsc2UsICdzdWJzY3JpYmUgc2hvdWxkIHN0aWxsIGJlIHBlbmRpbmcgcmlnaHQgYWZ0ZXIgYXBwcm92YWwnKTtcblxuXHRcdFx0XHRjb3BpbG90QWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UocGFyZW50Q2hhdCksIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0pO1xuXG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgc3Vic2NyaWJlUHJvbWlzZTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnJlc291cmNlLCBzdWJhZ2VudFVyaSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbnlpbmcgYSBzdWJhZ2VudCB0b29sIGNhbGwgYmVmb3JlIGNvbmZpcm1hdGlvbiBkb2VzIG5vdCBsZWF2ZSBhIGRhbmdsaW5nIHdhaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Y29uc3QgcGFyZW50Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdHN0YXJ0UGFyZW50VHVybihzZXNzaW9uLCAndHVybi0xJyk7XG5cblx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShwYXJlbnRDaGF0KSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JywgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShwYXJlbnRDaGF0KSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHNlcnZpY2UuZGlzcGF0Y2hBY3Rpb24ocGFyZW50Q2hhdCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXN1YicsIGFwcHJvdmVkOiBmYWxzZSwgcmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5EZW5pZWQgfSwgJ2NsaWVudC0xJywgMSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAndGMtc3ViJyk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhzZXJ2aWNlLnN1YnNjcmliZShVUkkucGFyc2Uoc3ViYWdlbnRVcmkpLCAnY2xpZW50LXJhY2UnKSwgL0Nhbm5vdCBzdWJzY3JpYmUgdG8gdW5rbm93biByZXNvdXJjZS8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic2NyaWJlIHRvIGEgc3ViYWdlbnQgY2hhdCBhbm5vdW5jZWQgdmlhIF9tZXRhLnN1YmFnZW50Q2hhdFVyaSB3YWl0cyBmb3IgdGhlIHJlc291cmNlIGluc3RlYWQgb2YgZmFpbGluZyBpbW1lZGlhdGVseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRQYXJlbnRUdXJuKHNlc3Npb24sICd0dXJuLTEnKTtcblxuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXN1YicsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29waWxvdEFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXN1YicsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAndGMtc3ViJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3Qoc3ViYWdlbnRVcmkpLCB1bmRlZmluZWQsICdwcmVjb25kaXRpb246IHJlc291cmNlIG5vdCByZWdpc3RlcmVkIHlldCcpO1xuXG5cdFx0XHQvLyBTdWJzY3JpYmUgYmVmb3JlIHRoZSByZXNvdXJjZSBleGlzdHMgXHUyMDE0IHRoaXMgbXVzdCBub3QgcmVqZWN0LlxuXHRcdFx0Y29uc3Qgc3Vic2NyaWJlUHJvbWlzZSA9IHNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShzdWJhZ2VudFVyaSksICdjbGllbnQtcmFjZScpO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblx0XHRcdHZvaWQgc3Vic2NyaWJlUHJvbWlzZS50aGVuKCgpID0+IHsgc2V0dGxlZCA9IHRydWU7IH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXR0bGVkLCBmYWxzZSwgJ3N1YnNjcmliZSBzaG91bGQgc3RpbGwgYmUgcGVuZGluZyB3aGlsZSB0aGUgcmVzb3VyY2UgaXMgdW5yZWdpc3RlcmVkJyk7XG5cblx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShwYXJlbnRDaGF0KSwgdG9vbENhbGxJZDogJ3RjLXN1YicsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSk7XG5cblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgc3Vic2NyaWJlUHJvbWlzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZXNvdXJjZSwgc3ViYWdlbnRVcmkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic2NyaWJlIHRvIGFuIGFubm91bmNlZCBzdWJhZ2VudCBjaGF0IHRoYXQgbmV2ZXIgc3Bhd25zIGV2ZW50dWFsbHkgcmVqZWN0cyBpbnN0ZWFkIG9mIGhhbmdpbmcnLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdFx0Y29uc3QgcGFyZW50Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdFx0c3RhcnRQYXJlbnRUdXJuKHNlc3Npb24sICd0dXJuLTEnKTtcblxuXHRcdFx0XHRjb3BpbG90QWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShwYXJlbnRDaGF0KSxcblx0XHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXN1YicsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvcGlsb3RBZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKHBhcmVudENoYXQpLFxuXHRcdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtc3ViJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCAndGMtc3ViJyk7XG5cblx0XHRcdFx0Ly8gVGhlIHRvb2wgY2FsbCBpcyBkZW5pZWQvY2FuY2VsbGVkIGJlZm9yZSB0aGUgU0RLIGV2ZXJcblx0XHRcdFx0Ly8gY29uZmlybXMgc3ViYWdlbnRfc3RhcnRlZCBcdTIwMTQgdGhlIHJlc291cmNlIG5ldmVyIHJlZ2lzdGVycy5cblx0XHRcdFx0Y29uc3Qgc3Vic2NyaWJlUHJvbWlzZSA9IHNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShzdWJhZ2VudFVyaSksICdjbGllbnQtcmFjZScpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhzdWJzY3JpYmVQcm9taXNlLCAvQ2Fubm90IHN1YnNjcmliZSB0byB1bmtub3duIHJlc291cmNlLyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBwZWVyLWNoYXQgY2F0YWxvZyBwZXJzaXN0ZW5jZSAoQjI6IG9yY2hlc3RyYXRvci1vd25lZCkgLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3BlZXIgY2hhdCBjYXRhbG9nIHBlcnNpc3RlbmNlJywgKCkgPT4ge1xuXG5cdFx0LyoqIFBvbGxzIHRoZSBwZXJzaXN0ZWQgcGVlci1jaGF0IGNhdGFsb2cgYmxvYiB1bnRpbCBpdCBhcHBlYXJzIG9yIHRpbWVzIG91dC4gKi9cblx0XHRhc3luYyBmdW5jdGlvbiByZWFkQ2F0YWxvZyhkYjogVGVzdFNlc3Npb25EYXRhYmFzZSk6IFByb21pc2U8eyB1cmk6IHN0cmluZzsgcHJvdmlkZXJEYXRhPzogc3RyaW5nIH1bXT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdwZWVyQ2hhdHMnKTtcblx0XHRcdFx0aWYgKHJhdyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgcGVyc2lzdHMgcHJvdmlkZXJEYXRhOyByZXN0b3JlIHJlLW1hdGVyaWFsaXplcyBmcm9tIHRoZSBvcmNoZXN0cmF0b3IgY2F0YWxvZyBiZWZvcmUgcmVhZGluZyBoaXN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWF0ZXJpYWxpemVPcmRlcjogeyBjYWxsOiBzdHJpbmc7IHVyaTogc3RyaW5nOyBwcm92aWRlckRhdGE/OiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRjbGFzcyBNdWx0aUNoYXRBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSk6IFByb21pc2U8eyBwcm92aWRlckRhdGE/OiBzdHJpbmcgfT4ge1xuXHRcdFx0XHRcdHJldHVybiB7IHByb3ZpZGVyRGF0YTogJ2Jsb2ItMScgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBtYXRlcmlhbGl6ZUNoYXQoY2hhdDogVVJJLCBwcm92aWRlckRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdG1hdGVyaWFsaXplT3JkZXIucHVzaCh7IGNhbGw6ICdtYXRlcmlhbGl6ZScsIHVyaTogY2hhdC50b1N0cmluZygpLCBwcm92aWRlckRhdGEgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb24uc2NoZW1lID09PSAnYWhwLWNoYXQnKSB7XG5cdFx0XHRcdFx0XHRtYXRlcmlhbGl6ZU9yZGVyLnB1c2goeyBjYWxsOiAnZ2V0TWVzc2FnZXMnLCB1cmk6IHNlc3Npb24udG9TdHJpbmcoKSB9KTtcblx0XHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3BlZXItdHVybi0xJyxcblx0XHRcdFx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGkgcGVlcicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRcdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXVsdGlDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHRjb25zdCBwZWVyVXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci0xJykpO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgcGVlclVyaSk7XG5cdFx0XHRhd2FpdCByZWFkQ2F0YWxvZyhkYik7XG5cblx0XHRcdGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUocGVlclVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcmRlcjogbWF0ZXJpYWxpemVPcmRlci5tYXAobyA9PiBvLmNhbGwpLFxuXHRcdFx0XHRtYXRlcmlhbGl6ZWRXaXRoOiBtYXRlcmlhbGl6ZU9yZGVyLmZpbmQobyA9PiBvLmNhbGwgPT09ICdtYXRlcmlhbGl6ZScpPy5wcm92aWRlckRhdGEsXG5cdFx0XHRcdGluQ2F0YWxvZzogISFzdGF0ZT8uY2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcGVlclVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0cmVzdG9yZWRQcm92aWRlckRhdGE6IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFByb3ZpZGVyRGF0YShwZWVyVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRwZWVyVHVybklkczogcGVlckNoYXRTdGF0ZT8udHVybnMubWFwKHQgPT4gdC5pZCkgPz8gW10sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgaXMgcmVhZCBmaXJzdDsgcGVlciBtYXRlcmlhbGl6ZSBtdXN0IHByZWNlZGVcblx0XHRcdFx0Ly8gdGhlIHBlZXIgaGlzdG9yeSByZWFkIG9uIHJlc3RvcmUuXG5cdFx0XHRcdG9yZGVyOiBbJ2dldE1lc3NhZ2VzJywgJ21hdGVyaWFsaXplJywgJ2dldE1lc3NhZ2VzJ10sXG5cdFx0XHRcdG1hdGVyaWFsaXplZFdpdGg6ICdibG9iLTEnLFxuXHRcdFx0XHRpbkNhdGFsb2c6IHRydWUsXG5cdFx0XHRcdHJlc3RvcmVkUHJvdmlkZXJEYXRhOiAnYmxvYi0xJyxcblx0XHRcdFx0cGVlclR1cm5JZHM6IFsncGVlci10dXJuLTEnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25EaWRDaGFuZ2VDaGF0RGF0YSByZS1wZXJzaXN0cyB0aGUgdXBkYXRlZCBwcm92aWRlckRhdGEgYmxvYicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ2hhdERhdGEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SUFnZW50Q2hhdERhdGFDaGFuZ2U+KCkpO1xuXHRcdFx0Y2xhc3MgTXVsdGlDaGF0QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXREYXRhID0gb25EaWRDaGFuZ2VDaGF0RGF0YS5ldmVudDtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdChfc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJKTogUHJvbWlzZTx7IHByb3ZpZGVyRGF0YT86IHN0cmluZyB9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJEYXRhOiAndjEnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aUNoYXRBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cblx0XHRcdGNvbnN0IHBlZXJVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uLCBwZWVyVXJpKTtcblx0XHRcdGNvbnN0IGFmdGVyQ3JlYXRlID0gYXdhaXQgcmVhZENhdGFsb2coZGIpO1xuXG5cdFx0XHRvbkRpZENoYW5nZUNoYXREYXRhLmZpcmUoeyBjaGF0OiBwZWVyVXJpLCBwcm92aWRlckRhdGE6ICd2MicgfSk7XG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgcmUtcGVyc2lzdCB3cml0ZSB0byBmbHVzaC5cblx0XHRcdGxldCB1cGRhdGVkID0gYWZ0ZXJDcmVhdGU7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcblx0XHRcdFx0dXBkYXRlZCA9IGF3YWl0IHJlYWRDYXRhbG9nKGRiKTtcblx0XHRcdFx0aWYgKHVwZGF0ZWQuZmluZChlID0+IGUudXJpID09PSBwZWVyVXJpLnRvU3RyaW5nKCkpPy5wcm92aWRlckRhdGEgPT09ICd2MicpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWZ0ZXJDcmVhdGU6IGFmdGVyQ3JlYXRlLmZpbmQoZSA9PiBlLnVyaSA9PT0gcGVlclVyaS50b1N0cmluZygpKT8ucHJvdmlkZXJEYXRhLFxuXHRcdFx0XHRhZnRlckNoYW5nZTogdXBkYXRlZC5maW5kKGUgPT4gZS51cmkgPT09IHBlZXJVcmkudG9TdHJpbmcoKSk/LnByb3ZpZGVyRGF0YSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWZ0ZXJDcmVhdGU6ICd2MScsXG5cdFx0XHRcdGFmdGVyQ2hhbmdlOiAndjInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlQ2hhdCByZW1vdmVzIHRoZSBjaGF0IGZyb20gdGhlIHBlcnNpc3RlZCBjYXRhbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgTXVsdGlDaGF0QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KF9zZXNzaW9uOiBVUkksIF9jaGF0OiBVUkkpOiBQcm9taXNlPHsgcHJvdmlkZXJEYXRhPzogc3RyaW5nIH0+IHtcblx0XHRcdFx0XHRyZXR1cm4geyBwcm92aWRlckRhdGE6ICdibG9iLTEnIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZGlzcG9zZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXVsdGlDaGF0QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHRjb25zdCBwZWVyVXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci0xJykpO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgcGVlclVyaSk7XG5cdFx0XHRjb25zdCBhZnRlckNyZWF0ZSA9IGF3YWl0IHJlYWRDYXRhbG9nKGRiKTtcblxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLmRpc3Bvc2VDaGF0KHNlc3Npb24sIHBlZXJVcmkpO1xuXHRcdFx0bGV0IGFmdGVyRGlzcG9zZSA9IGFmdGVyQ3JlYXRlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG5cdFx0XHRcdGFmdGVyRGlzcG9zZSA9IGF3YWl0IHJlYWRDYXRhbG9nKGRiKTtcblx0XHRcdFx0aWYgKCFhZnRlckRpc3Bvc2Uuc29tZShlID0+IGUudXJpID09PSBwZWVyVXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFmdGVyQ3JlYXRlOiBhZnRlckNyZWF0ZS5tYXAoZSA9PiBlLnVyaSksXG5cdFx0XHRcdGFmdGVyRGlzcG9zZTogYWZ0ZXJEaXNwb3NlLm1hcChlID0+IGUudXJpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWZ0ZXJDcmVhdGU6IFtwZWVyVXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRhZnRlckRpc3Bvc2U6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyAtLS0tIEJDMTogb25lLXRpbWUgbGVnYWN5IGAqLmNoYXRzYCBtaWdyYXRpb24gb24gcmVzdG9yZSAtLS0tLS0tLS0tXG5cblx0XHR0ZXN0KCdsZWdhY3kgKi5jaGF0cyB3aXRoIG5vIHBlZXJDaGF0cyBjYXRhbG9nIG1pZ3JhdGVzIG9uY2UgaW50byB0aGUgb3JjaGVzdHJhdG9yIGNhdGFsb2cnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjbGFzcyBMZWdhY3lBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRcdGxpc3RMZWdhY3lDYWxsQ291bnQgPSAwO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KCk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+IHsgfVxuXHRcdFx0XHRhc3luYyBtYXRlcmlhbGl6ZUNoYXQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdFx0YXN5bmMgbGlzdExlZ2FjeUNoYXRzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50TGVnYWN5Q2hhdFtdPiB7XG5cdFx0XHRcdFx0dGhpcy5saXN0TGVnYWN5Q2FsbENvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYScpKSwgcHJvdmlkZXJEYXRhOiAnbHAtYScgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYicpKSwgcHJvdmlkZXJEYXRhOiAnbHAtYicgfSxcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uLnNjaGVtZSA9PT0gJ2FocC1jaGF0Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0XHRcdGlkOiBgJHtwYXJzZUNoYXRVcmkoc2Vzc2lvbik/LmNoYXRJZH0tdHVybmAsXG5cdFx0XHRcdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2xlZ2FjeSBoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRcdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGVnYWN5QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHQvLyBTZWVkIGEgcGVyc2lzdGVkIHRpdGxlIGZvciBvbmUgbGVnYWN5IGNoYXQgc28gd2UgY2FuIGFzc2VydFxuXHRcdFx0Ly8gaGlzdG9yeSArIHRpdGxlIGFyZSByZXN0b3JlZC5cblx0XHRcdGNvbnN0IGxlZ2FjeUFVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYScpKTtcblx0XHRcdGNvbnN0IGxlZ2FjeUJVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYicpKTtcblx0XHRcdGF3YWl0IGRiLnNldE1ldGFkYXRhKGBjdXN0b21DaGF0VGl0bGU6JHtsZWdhY3lBVXJpLnRvU3RyaW5nKCl9YCwgJ0xlZ2FjeSBBIFRpdGxlJyk7XG5cblx0XHRcdC8vIE5vIHBlZXJDaGF0cyBrZXkgZXhpc3RzICh1bmRlZmluZWQgY2F0YWxvZykgLT4gbWlncmF0aW9uIHJ1bnMuXG5cdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdGNvbnN0IGNhdGFsb2dBZnRlckZpcnN0ID0gYXdhaXQgcmVhZENhdGFsb2coZGIpO1xuXG5cdFx0XHQvLyBTZWNvbmQgcmVzdG9yZTogY2F0YWxvZyBub3cgcHJlc2VudCAtPiBsZWdhY3kgcmVhZCBub3QgY29uc3VsdGVkIGFnYWluLlxuXHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IHN0YXRlQSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGxlZ2FjeUFVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBzdGF0ZUIgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShsZWdhY3lCVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxlZ2FjeUNhbGxzOiBhZ2VudC5saXN0TGVnYWN5Q2FsbENvdW50LFxuXHRcdFx0XHRjYXRhbG9nOiBjYXRhbG9nQWZ0ZXJGaXJzdC5tYXAoZSA9PiAoeyB1cmk6IGUudXJpLCBwcm92aWRlckRhdGE6IGUucHJvdmlkZXJEYXRhIH0pKSxcblx0XHRcdFx0YVRpdGxlOiBzdGF0ZUE/LnRpdGxlLFxuXHRcdFx0XHRhVHVybnM6IHN0YXRlQT8udHVybnMubWFwKHQgPT4gdC5pZCkgPz8gW10sXG5cdFx0XHRcdGFQcm92aWRlckRhdGE6IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFByb3ZpZGVyRGF0YShsZWdhY3lBVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRiVHVybnM6IHN0YXRlQj8udHVybnMubWFwKHQgPT4gdC5pZCkgPz8gW10sXG5cdFx0XHRcdGJQcm92aWRlckRhdGE6IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFByb3ZpZGVyRGF0YShsZWdhY3lCVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsZWdhY3lDYWxsczogMSxcblx0XHRcdFx0Y2F0YWxvZzogW1xuXHRcdFx0XHRcdHsgdXJpOiBsZWdhY3lBVXJpLnRvU3RyaW5nKCksIHByb3ZpZGVyRGF0YTogJ2xwLWEnIH0sXG5cdFx0XHRcdFx0eyB1cmk6IGxlZ2FjeUJVcmkudG9TdHJpbmcoKSwgcHJvdmlkZXJEYXRhOiAnbHAtYicgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0YVRpdGxlOiAnTGVnYWN5IEEgVGl0bGUnLFxuXHRcdFx0XHRhVHVybnM6IFsnbGVnYWN5LWEtdHVybiddLFxuXHRcdFx0XHRhUHJvdmlkZXJEYXRhOiAnbHAtYScsXG5cdFx0XHRcdGJUdXJuczogWydsZWdhY3ktYi10dXJuJ10sXG5cdFx0XHRcdGJQcm92aWRlckRhdGE6ICdscC1iJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYW4gZW1wdHkgKFtdKSBwZWVyQ2hhdHMgY2F0YWxvZyBkb2VzIG5vdCByZXN1cnJlY3QgbGVnYWN5IGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgTGVnYWN5QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRsaXN0TGVnYWN5Q2FsbENvdW50ID0gMDtcblx0XHRcdFx0YXN5bmMgbGlzdExlZ2FjeUNoYXRzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50TGVnYWN5Q2hhdFtdPiB7XG5cdFx0XHRcdFx0dGhpcy5saXN0TGVnYWN5Q2FsbENvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIFt7IHVyaTogVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnbGVnYWN5LWEnKSksIHByb3ZpZGVyRGF0YTogJ2xwLWEnIH1dO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGVnYWN5QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHQvLyBLbm93bi1lbXB0eSBjYXRhbG9nIG11c3QgYmUgdHJlYXRlZCBhcyBcIm5vIHBlZXIgY2hhdHNcIiwgbmV2ZXIgbWlncmF0ZWQuXG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgncGVlckNoYXRzJywgJ1tdJyk7XG5cdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxlZ2FjeUNhbGxzOiBhZ2VudC5saXN0TGVnYWN5Q2FsbENvdW50LFxuXHRcdFx0XHRwZWVyQ2hhdHM6IChzdGF0ZT8uY2hhdHMgPz8gW10pLm1hcChjID0+IHBhcnNlQ2hhdFVyaShjLnJlc291cmNlKT8uY2hhdElkKS5maWx0ZXIoaWQgPT4gaWQgIT09ICdkZWZhdWx0JyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxlZ2FjeUNhbGxzOiAwLFxuXHRcdFx0XHRwZWVyQ2hhdHM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHZhbGlkIG5ldy1mb3JtYXQgcGVlckNoYXRzIGNhdGFsb2cgcmVzdG9yZXMgd2l0aG91dCBjb25zdWx0aW5nIGxlZ2FjeSBjaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNsYXNzIExlZ2FjeUFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0bGlzdExlZ2FjeUNhbGxDb3VudCA9IDA7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUNoYXQoKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdFx0XHRcdHJldHVybiB7IHByb3ZpZGVyRGF0YTogJ25ldy1ibG9iJyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzeW5jIG1hdGVyaWFsaXplQ2hhdCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0XHRhc3luYyBsaXN0TGVnYWN5Q2hhdHMoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRMZWdhY3lDaGF0W10+IHtcblx0XHRcdFx0XHR0aGlzLmxpc3RMZWdhY3lDYWxsQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gW3sgdXJpOiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYScpKSwgcHJvdmlkZXJEYXRhOiAnbHAtYScgfV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMZWdhY3lBZ2VudCgnY29waWxvdCcpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cblx0XHRcdGNvbnN0IHBlZXJVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLTEnKSk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlQ2hhdChzZXNzaW9uLCBwZWVyVXJpKTtcblx0XHRcdGF3YWl0IHJlYWRDYXRhbG9nKGRiKTtcblxuXHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRsZWdhY3lDYWxsczogYWdlbnQubGlzdExlZ2FjeUNhbGxDb3VudCxcblx0XHRcdFx0cGVlckluQ2F0YWxvZzogISFzdGF0ZT8uY2hhdHMuc29tZShjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcGVlclVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0bGVnYWN5SW5DYXRhbG9nOiBzdGF0ZT8uY2hhdHMuc29tZShjID0+IHBhcnNlQ2hhdFVyaShjLnJlc291cmNlKT8uY2hhdElkID09PSAnbGVnYWN5LWEnKSA/PyBmYWxzZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGVnYWN5Q2FsbHM6IDAsXG5cdFx0XHRcdHBlZXJJbkNhdGFsb2c6IHRydWUsXG5cdFx0XHRcdGxlZ2FjeUluQ2F0YWxvZzogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHQvLyAtLS0tIFJWLTE6IGxlZ2FjeSBtaWdyYXRpb24gcGVyc2lzdHMgdGhlIGNhdGFsb2cgYXRvbWljYWxseSAtLS0tLS0tLS0tXG5cblx0XHR0ZXN0KCdsZWdhY3kgbWlncmF0aW9uIHBlcnNpc3RzIHRoZSB3aG9sZSBzZXQgaW4gb25lIHdyaXRlIChuZXZlciBhIHN1YnNldCwgZXZlbiBhY3Jvc3MgYSByZS1yZXN0b3JlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNsYXNzIExlZ2FjeUFnZW50IGV4dGVuZHMgTW9ja0FnZW50IHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQ2hhdCgpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfCB2b2lkPiB7IH1cblx0XHRcdFx0YXN5bmMgbWF0ZXJpYWxpemVDaGF0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0XHRcdGFzeW5jIGxpc3RMZWdhY3lDaGF0cyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudExlZ2FjeUNoYXRbXT4ge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnbGVnYWN5LWEnKSksIHByb3ZpZGVyRGF0YTogJ2xwLWEnIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnbGVnYWN5LWInKSksIHByb3ZpZGVyRGF0YTogJ2xwLWInIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAnbGVnYWN5LWMnKSksIHByb3ZpZGVyRGF0YTogJ2xwLWMnIH0sXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IExlZ2FjeUFnZW50KCdjb3BpbG90JykpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoYWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0Ly8gQWJzZW50IHBlZXJDaGF0cyBrZXkgPT4gbWlncmF0aW9uIHJ1bnMgYW5kIG11c3Qgd3JpdGUgdGhlIGZ1bGwgc2V0IG9uY2UuXG5cdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCByZWFkQ2F0YWxvZyhkYik7XG5cblx0XHRcdGNvbnN0IHJlc3RvcmVkSWRzID0gKGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzID8/IFtdKVxuXHRcdFx0XHQubWFwKGMgPT4gcGFyc2VDaGF0VXJpKGMucmVzb3VyY2UpPy5jaGF0SWQpXG5cdFx0XHRcdC5maWx0ZXIoaWQgPT4gaWQgIT09ICdkZWZhdWx0Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2F0YWxvZ0lkczogY2F0YWxvZy5tYXAoZSA9PiBwYXJzZUNoYXRVcmkoVVJJLnBhcnNlKGUudXJpKSk/LmNoYXRJZCksXG5cdFx0XHRcdHJlc3RvcmVkSWRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjYXRhbG9nSWRzOiBbJ2xlZ2FjeS1hJywgJ2xlZ2FjeS1iJywgJ2xlZ2FjeS1jJ10sXG5cdFx0XHRcdHJlc3RvcmVkSWRzOiBbJ2xlZ2FjeS1hJywgJ2xlZ2FjeS1iJywgJ2xlZ2FjeS1jJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgcmVqZWN0ZWQgbWlncmF0aW9uIHdyaXRlIGxlYXZlcyB0aGUgY2F0YWxvZyBhYnNlbnQgKG5vdCBhIHN1YnNldCkgc28gbWlncmF0aW9uIHJlLXJ1bnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjbGFzcyBGYWlsaW5nQ2F0YWxvZ0RhdGFiYXNlIGV4dGVuZHMgVGVzdFNlc3Npb25EYXRhYmFzZSB7XG5cdFx0XHRcdGZhaWxQZWVyQ2hhdHNXcml0ZXMgPSAxO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBzZXRNZXRhZGF0YShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGlmIChrZXkgPT09ICdwZWVyQ2hhdHMnICYmIHRoaXMuZmFpbFBlZXJDaGF0c1dyaXRlcyA+IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuZmFpbFBlZXJDaGF0c1dyaXRlcy0tO1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdzaW11bGF0ZWQgY2F0YWxvZyB3cml0ZSBmYWlsdXJlJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzdXBlci5zZXRNZXRhZGF0YShrZXksIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2xhc3MgTGVnYWN5QWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KCk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+IHsgfVxuXHRcdFx0XHRhc3luYyBtYXRlcmlhbGl6ZUNoYXQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdFx0YXN5bmMgbGlzdExlZ2FjeUNoYXRzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50TGVnYWN5Q2hhdFtdPiB7XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYScpKSwgcHJvdmlkZXJEYXRhOiAnbHAtYScgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdsZWdhY3ktYicpKSwgcHJvdmlkZXJEYXRhOiAnbHAtYicgfSxcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBGYWlsaW5nQ2F0YWxvZ0RhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYiksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGVnYWN5QWdlbnQoJ2NvcGlsb3QnKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihhZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHQvLyBGaXJzdCByZXN0b3JlOiB0aGUgc2luZ2xlIGNhdGFsb2cgd3JpdGUgaXMgcmVqZWN0ZWQuIEJlY2F1c2UgdGhlIHdyaXRlXG5cdFx0XHQvLyBpcyBhbGwtb3Itbm90aGluZywgdGhlIGtleSBtdXN0IHN0YXkgYWJzZW50IChuZXZlciBhIHByb3BlciBzdWJzZXQpLlxuXHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBjYXRhbG9nQWZ0ZXJGYWlsZWRXcml0ZSA9IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdwZWVyQ2hhdHMnKTtcblxuXHRcdFx0Ly8gU2Vjb25kIHJlc3RvcmU6IGNhdGFsb2cgc3RpbGwgYWJzZW50ID0+IG1pZ3JhdGlvbiByZS1ydW5zIGFuZCBub3dcblx0XHRcdC8vIHBlcnNpc3RzIHRoZSBjb21wbGV0ZSBzZXQuXG5cdFx0XHRsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCByZWFkQ2F0YWxvZyhkYik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjYXRhbG9nQWZ0ZXJGYWlsZWRXcml0ZSxcblx0XHRcdFx0Y2F0YWxvZ0lkczogY2F0YWxvZy5tYXAoZSA9PiBwYXJzZUNoYXRVcmkoVVJJLnBhcnNlKGUudXJpKSk/LmNoYXRJZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhdGFsb2dBZnRlckZhaWxlZFdyaXRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNhdGFsb2dJZHM6IFsnbGVnYWN5LWEnLCAnbGVnYWN5LWInXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3Vic2NyaWJlciByZWZjb3VudCBldmljdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2FuIGVtcHR5IHNlc3Npb24gY3JlYXRlZCBpbiB0aGlzIGxpZmV0aW1lIHN0YXlzIG9ic2VydmFibGUgdW50aWwgR0MgZmlyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cblx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXHRcdFx0c2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXG5cdFx0XHQvLyBFbXB0eSBzZXNzaW9ucyBhcmUgcm91dGVkIHRvIHRoZSBHQyBwaXBlbGluZSByYXRoZXIgdGhhbiB0aGVcblx0XHRcdC8vIGV2aWN0aW9uIHBpcGVsaW5lLCBzbyB0aGVpciBzdGF0ZSBzdGF5cyBvYnNlcnZhYmxlIGluIHRoZVxuXHRcdFx0Ly8gZ3JhY2Ugd2luZG93IGZvciBhIHJlLXN1YnNjcmliZSB0byBmaW5kLlxuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksICdlbXB0eSBjcmVhdGVkIHNlc3Npb24gbXVzdCByZW1haW4gb2JzZXJ2YWJsZSBmb3IgdGhlIEdDIGdyYWNlIHdpbmRvdycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBzZXNzaW9uIHdpdGggYW4gYWN0aXZlIHR1cm4gaXMgTk9UIGV2aWN0ZWQgd2hlbiBpdHMgbGFzdCBzdWJzY3JpYmVyIGRyb3BzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdC8vIFNpbXVsYXRlIGFuIGluLWZsaWdodCB0dXJuIFx1MjAxNCBldmljdGlvbiBtdXN0IHNraXAgdGhpcyBzZXNzaW9uIGV2ZW5cblx0XHRcdC8vIHdoZW4gdGhlIHJlZmNvdW50IHJlYWNoZXMgemVybywgb3RoZXJ3aXNlIHdlJ2QgZHJvcCBsaXZlIHN0YXRlXG5cdFx0XHQvLyBtaWQtcmVzcG9uc2UuXG5cdFx0XHRzZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKFxuXHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAndHVybi0xJywgc3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJywgbWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfSxcblx0XHRcdFx0J2NsaWVudC0xJywgMSxcblx0XHRcdCk7XG5cblx0XHRcdHNlcnZpY2UudW5zdWJzY3JpYmUoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksICdhY3RpdmUtdHVybiBzZXNzaW9uIG11c3Qgbm90IGJlIGV2aWN0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgcmVzdG9yZWQgaWRsZSBzZXNzaW9uIGlzIGV2aWN0ZWQgd2hlbiBpdHMgbGFzdCBzdWJzY3JpYmVyIGRyb3BzJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0c2VydmljZS5hZGRTdWJzY3JpYmVyKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0xJyk7XG5cblx0XHRcdFx0c2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXHRcdFx0XHQvLyBSZWxlYXNlIGlzIGRlZmVycmVkIGJlaGluZCB0aGUgZ3JhY2Ugd2luZG93IFx1MjAxNCBzdGlsbCBjYWNoZWQgdW50aWwgaXQgZWxhcHNlcy5cblx0XHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksICdzZXNzaW9uIHN0YXlzIGNhY2hlZCBkdXJpbmcgdGhlIHJlbGVhc2UgZ3JhY2UnKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwXzAwMCkpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCB1bmRlZmluZWQsICdyZXN0b3JlZCBpZGxlIHNlc3Npb24gc2hvdWxkIGJlIGV2aWN0ZWQgYWZ0ZXIgdGhlIGdyYWNlJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Y29waWxvdEFnZW50LnJlbGVhc2VTZXNzaW9uQ2FsbHMubWFwKHUgPT4gdS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRbc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRcdCdwcm92aWRlciByZWxlYXNlU2Vzc2lvbiBzaG91bGQgYmUgaW52b2tlZCBmb3IgdGhlIGV2aWN0ZWQgcm9vdCcsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90QWdlbnQuZGlzcG9zZVNlc3Npb25DYWxscy5sZW5ndGgsIDAsICdldmljdGlvbiBtdXN0IG5vdCBkZXN0cnVjdGl2ZWx5IGRpc3Bvc2UgdGhlIHNlc3Npb24nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtc3Vic2NyaWJpbmcgd2l0aGluIHRoZSBncmFjZSBjYW5jZWxzIHRoZSByZWxlYXNlJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0c2VydmljZS5hZGRTdWJzY3JpYmVyKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0xJyk7XG5cblx0XHRcdFx0c2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXHRcdFx0XHQvLyBSZWNvbm5lY3Qgd2l0aGluIHRoZSBncmFjZSB3aW5kb3cuXG5cdFx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMicpO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzBfMDAwKSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksICdzZXNzaW9uIG11c3Qgc3RheSBjYWNoZWQgd2hlbiByZS1zdWJzY3JpYmVkIHdpdGhpbiB0aGUgZ3JhY2UnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcGlsb3RBZ2VudC5yZWxlYXNlU2Vzc2lvbkNhbGxzLmxlbmd0aCwgMCwgJ3JlbGVhc2VTZXNzaW9uIG11c3Qgbm90IGZpcmUgd2hlbiB0aGUgZ3JhY2Ugd2FzIGNhbmNlbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbiBldmljdGVkIGlkbGUgc2Vzc2lvbiByZXN0b3JlcyBsb3NzbGVzc2x5IG9uIHJlLXN1YnNjcmliZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25zWzBdLnNlc3Npb247XG5cblx0XHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0hpJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXHRcdFx0XHRjb25zdCBiZWZvcmUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQub2soYmVmb3JlLCAnc2Vzc2lvbiBzdGF0ZSBwcmVzZW50IGJlZm9yZSBldmljdGlvbicpO1xuXG5cdFx0XHRcdHNlcnZpY2UudW5zdWJzY3JpYmUoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwXzAwMCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgdW5kZWZpbmVkLCAnc2Vzc2lvbiBldmljdGVkIGFmdGVyIGxhc3Qgc3Vic2NyaWJlciBkcm9wcycpO1xuXG5cdFx0XHRcdC8vIFJlLXN1YnNjcmliZSByZWh5ZHJhdGVzIGZyb20gdGhlIHByZXNlcnZlZCBkdXJhYmxlIGRhdGEuXG5cdFx0XHRcdGF3YWl0IHNlcnZpY2Uuc3Vic2NyaWJlKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0yJyk7XG5cdFx0XHRcdGNvbnN0IGFmdGVyID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFmdGVyLCAnc2Vzc2lvbiByZXN0b3JlZCBvbiByZS1zdWJzY3JpYmUnKTtcblx0XHRcdFx0Ly8gUmVzcG9uc2UtcGFydCBpZHMgYXJlIGZyZXNobHkgZ2VuZXJhdGVkIG9uIGVhY2ggcmVjb25zdHJ1Y3Rpb24sIHNvXG5cdFx0XHRcdC8vIG5vcm1hbGl6ZSB0aGVtIG91dCBiZWZvcmUgY29tcGFyaW5nIHRoZSBkdXJhYmxlIHR1cm4gY29udGVudC5cblx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplVHVybnMgPSAodHVybnM6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0Wyd0dXJucyddKSA9PlxuXHRcdFx0XHRcdHR1cm5zLm1hcCh0dXJuID0+ICh7IC4uLnR1cm4sIHJlc3BvbnNlUGFydHM6IHR1cm4ucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PiAoeyAuLi5wYXJ0LCBpZDogdW5kZWZpbmVkIH0pKSB9KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplVHVybnMoYWZ0ZXIudHVybnMpLCBub3JtYWxpemVUdXJucyhiZWZvcmUudHVybnMpLCAncmVzdG9yZWQgdHVybnMgbWF0Y2ggdGhlIHByZS1ldmljdGlvbiBzdGF0ZScpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlZCBzZXNzaW9uIGlzIGV2aWN0ZWQgYWZ0ZXIgYWxsIHN1YnNjcmliZXJzIGRyb3AnLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGNvcGlsb3RBZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXG5cdFx0XHRcdGNvcGlsb3RBZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0XTtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdFx0c2VydmljZS5hZGRTdWJzY3JpYmVyKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0yJyk7XG5cblx0XHRcdFx0c2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzBfMDAwKSk7XG5cdFx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCAnc3RpbGwgc3Vic2NyaWJlZCBieSBjbGllbnQtMicpO1xuXG5cdFx0XHRcdHNlcnZpY2UudW5zdWJzY3JpYmUoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTInKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwXzAwMCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgdW5kZWZpbmVkLCAnZXZpY3RlZCBhZnRlciBsYXN0IHN1YnNjcmliZXIgZHJvcHMnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViYWdlbnQgc3Vic2NyaWJlciBwaW5zIHRoZSBwYXJlbnQgc2Vzc2lvbiBhZ2FpbnN0IGV2aWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBjb3BpbG90QWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGNvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ1JldmlldycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXN1YicsIG5hbWU6ICd0YXNrJyB9XSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfc3RhcnQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtc3ViJywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nJywgdG9vbEtpbmQ6ICdzdWJhZ2VudCcgYXMgY29uc3QsIHN1YmFnZW50RGVzY3JpcHRpb246ICdGaW5kIGZpbGVzJywgc3ViYWdlbnRBZ2VudE5hbWU6ICdleHBsb3JlJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtc3ViJywgYWdlbnROYW1lOiAnZXhwbG9yZScsIGFnZW50RGlzcGxheU5hbWU6ICdFeHBsb3JlJywgYWdlbnREZXNjcmlwdGlvbjogJ0V4cGxvcmVzJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfc3RhcnQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtaW5uZXInLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ0Jhc2gnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ2xzJywgcGFyZW50VG9vbENhbGxJZDogJ3RjLXN1YicgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdyYW4nLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2EnIH1dIH0sIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1zdWInIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAndG9vbF9jb21wbGV0ZScsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ2RvbmUnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ29rJyB9XSB9IH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMycsIGNvbnRlbnQ6ICdEb25lJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGNoaWxkVXJpID0gVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCAndGMtc3ViJykpO1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnN1YnNjcmliZShjaGlsZFVyaSwgJ2NsaWVudC1jaGlsZCcpO1xuXG5cdFx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtcGFyZW50Jyk7XG5cblx0XHRcdFx0Ly8gUGFyZW50IGRyb3BzIFx1MjAxNCBjaGlsZCBzdGlsbCBzdWJzY3JpYmVkLCBwYXJlbnQgbXVzdCBub3QgYmUgZXZpY3RlZFxuXHRcdFx0XHRzZXJ2aWNlLnVuc3Vic2NyaWJlKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC1wYXJlbnQnKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwXzAwMCkpO1xuXHRcdFx0XHRhc3NlcnQub2soc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgJ3BhcmVudCBtdXN0IHN0YXkgd2hpbGUgY2hpbGQgaXMgc3Vic2NyaWJlZCcpO1xuXHRcdFx0XHRhc3NlcnQub2soc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoaWxkVXJpLnRvU3RyaW5nKCkpLCAnY2hpbGQgc3RpbGwgcHJlc2VudCcpO1xuXG5cdFx0XHRcdC8vIENoaWxkIGRyb3BzIFx1MjAxNCBwYXJlbnQgYW5kIGNoaWxkIGNhbiBub3cgYmUgZXZpY3RlZC5cblx0XHRcdFx0c2VydmljZS51bnN1YnNjcmliZShjaGlsZFVyaSwgJ2NsaWVudC1jaGlsZCcpO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzBfMDAwKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCB1bmRlZmluZWQsICdwYXJlbnQgZXZpY3RlZCBhZnRlciBzdWJhZ2VudCBkcm9wcycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoaWxkVXJpLnRvU3RyaW5nKCkpLCB1bmRlZmluZWQsICdjaGlsZCBhbHNvIGV2aWN0ZWQgd2l0aCBwYXJlbnQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIHN1YmFnZW50IHN1YnNjcmliZXIgcGlucyBhbmNlc3RvciBzZXNzaW9uIGFnYWluc3QgZXZpY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnUmV2aWV3JywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXN1YicsIG5hbWU6ICd0YXNrJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3N0YXJ0Jywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLXN1YicsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZycsIHRvb2xLaW5kOiAnc3ViYWdlbnQnIGFzIGNvbnN0LCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCBmaWxlcycsIHN1YmFnZW50QWdlbnROYW1lOiAnZXhwbG9yZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc3ViYWdlbnRfc3RhcnRlZCcsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdWInLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfc3RhcnQnLCBzZXNzaW9uLCB0b29sQ2FsbElkOiAndGMtaW5uZXInLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ0Jhc2gnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ2xzJywgcGFyZW50VG9vbENhbGxJZDogJ3RjLXN1YicgfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF9jb21wbGV0ZScsIHNlc3Npb24sIHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdhJyB9XSB9LCBwYXJlbnRUb29sQ2FsbElkOiAndGMtc3ViJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbiwgdG9vbENhbGxJZDogJ3RjLXN1YicsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnZG9uZScsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnb2snIH1dIH0gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMycsIGNvbnRlbnQ6ICdEb25lJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNoaWxkVXJpID0gVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSwgJ3RjLXN1YicpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc3Vic2NyaWJlKGNoaWxkVXJpLCAnY2xpZW50LWNoaWxkJyk7XG5cdFx0XHRjb25zdCBuZXN0ZWRDaGlsZFVyaSA9IFVSSS5wYXJzZShidWlsZFN1YmFnZW50U2Vzc2lvblVyaShjaGlsZFVyaSwgJ3RjLW5lc3RlZCcpKTtcblxuXHRcdFx0c2VydmljZS5hZGRTdWJzY3JpYmVyKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC1wYXJlbnQnKTtcblx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihuZXN0ZWRDaGlsZFVyaSwgJ2NsaWVudC1uZXN0ZWQtY2hpbGQnKTtcblx0XHRcdHNlcnZpY2UudW5zdWJzY3JpYmUoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LXBhcmVudCcpO1xuXG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSwgJ2FuY2VzdG9yIHBhcmVudCBtdXN0IHN0YXkgd2hpbGUgbmVzdGVkIGNoaWxkIGlzIHN1YnNjcmliZWQnKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hpbGRVcmkudG9TdHJpbmcoKSksICdpbnRlcm1lZGlhdGUgY2hpbGQgc3RpbGwgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVwdGgtMiBzdWJhZ2VudCB1bnN1YnNjcmliZSBldmljdHMgdGhlIHJvb3Qgc2Vzc2lvbiBzdGF0ZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gUmVncmVzc2lvbjogd2hlbiBhIGRlcHRoLTIgc3ViYWdlbnQgVVJJIHVuc3Vic2NyaWJlcyB0aGUgZXZpY3Rpb25cblx0XHRcdFx0Ly8gbXVzdCByZWFjaCBhbGwgdGhlIHdheSB0byB0aGUgcm9vdCwgbm90IHN0b3AgYXQgdGhlIGludGVybWVkaWF0ZVxuXHRcdFx0XHQvLyBwYXJlbnQgYW5kIGxlYXZlIHJvb3Qgc3RhdGUgY2FjaGVkIGluZGVmaW5pdGVseS5cblx0XHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBjb3BpbG90QWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25zWzBdLnNlc3Npb247XG5cblx0XHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdoaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ2RvbmUnLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0XHQvLyBTaW11bGF0ZSBhIGNsaWVudCB0aGF0IG9ubHkgc3Vic2NyaWJlZCB0byB0aGUgZGVwdGgtMiBVUkkuXG5cdFx0XHRcdGNvbnN0IGNoaWxkVXJpID0gVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSwgJ3RjLXN1YicpKTtcblx0XHRcdFx0Y29uc3QgbmVzdGVkVXJpID0gVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKGNoaWxkVXJpLCAndGMtbmVzdGVkJykpO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIobmVzdGVkVXJpLCAnY2xpZW50LW5lc3RlZCcpO1xuXHRcdFx0XHRzZXJ2aWNlLnVuc3Vic2NyaWJlKG5lc3RlZFVyaSwgJ2NsaWVudC1uZXN0ZWQnKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwXzAwMCkpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCB1bmRlZmluZWQsICdyb290IHN0YXRlIG11c3QgYmUgZXZpY3RlZCB3aGVuIG5vIHN1YnNjcmliZXJzIHJlbWFpbicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gaGFuZHNoYWtlIGZhc3QtcGF0aDogdW5jb21taXR0ZWQgcmVmcmVzaCBvbiBhZGRTdWJzY3JpYmVyIC0tLS1cblxuXHRzdWl0ZSgnYWRkU3Vic2NyaWJlciB0cmlnZ2VycyB1bmNvbW1pdHRlZCByZWZyZXNoJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYWRkU3Vic2NyaWJlciBmb3IgPHNlc3Npb24+L2NoYW5nZXNldC91bmNvbW1pdHRlZCB0cmlnZ2VycyB0aGUgZmlyc3QgZ2l0IGRpZmYgcmVmcmVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93ZC1yZWZyZXNoJyB9KTtcblx0XHRcdGNvcGlsb3RBZ2VudC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkIH07XG5cblx0XHRcdC8vIFJlY29yZGluZyBnaXQgc2VydmljZTogYSBjYWxsIHRvIGBjb21wdXRlU2Vzc2lvbkZpbGVEaWZmc2Bcblx0XHRcdC8vIHdpdGggYGJhc2VCcmFuY2g9dW5kZWZpbmVkYCBpcyB0aGUgc2lnbmF0dXJlIG9mIHRoZSB1bmNvbW1pdHRlZFxuXHRcdFx0Ly8gcmVmcmVzaCBmaXJlZCBieSBgX3RyaWdnZXJVbmNvbW1pdHRlZFJlZnJlc2hgLlxuXHRcdFx0Y29uc3QgY29tcHV0ZUNhbGxzOiB7IHdkOiBzdHJpbmc7IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0U2VydmljZS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyA9IGFzeW5jICh3ZDogVVJJLCBvcHRzOiB7IHNlc3Npb25Vcmk6IHN0cmluZzsgYmFzZUJyYW5jaD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdGNvbXB1dGVDYWxscy5wdXNoKHsgd2Q6IHdkLnRvU3RyaW5nKCksIGJhc2VCcmFuY2g6IG9wdHMuYmFzZUJyYW5jaCB9KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRVcmkgPSBVUkkucGFyc2UoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkpO1xuXG5cdFx0XHQvLyBUaGUgaGFuZHNoYWtlIGZhc3QtcGF0aCB1c2VkIGR1cmluZyBjb25uZWN0L2luaXRpYWxpemUgd2hlblxuXHRcdFx0Ly8gYGdldFNuYXBzaG90KHVyaSlgIGlzIGFscmVhZHkgcG9wdWxhdGVkLiBUaGlzIGlzIHRoZSBwYXRoXG5cdFx0XHQvLyB0aGF0IHByZXZpb3VzbHkgc2tpcHBlZCB0aGUgcmVmcmVzaCBmb3Igc2Vzc2lvbnMgdGhhdCB3ZXJlXG5cdFx0XHQvLyBhbHJlYWR5IGFjdGl2ZSB3aGVuIHRoZSBBZ2VudHMgV2luZG93IG9wZW5lZC5cblx0XHRcdGxvY2FsU2VydmljZS5hZGRTdWJzY3JpYmVyKHVuY29tbWl0dGVkVXJpLCAnY2xpZW50LTEnKTtcblxuXHRcdFx0Ly8gUmVmcmVzaCBpcyBzY2hlZHVsZWQgdGhyb3VnaCB0aGUgcGVyLXNlc3Npb24gc2VxdWVuY2VyO1xuXHRcdFx0Ly8gYWxsb3cgaXQgdG8gZHJhaW4uXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMjApKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRjb21wdXRlQ2FsbHMuc29tZShjID0+IGMuYmFzZUJyYW5jaCA9PT0gdW5kZWZpbmVkICYmIGMud2QgPT09IHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSksXG5cdFx0XHRcdGBleHBlY3RlZCBhbiB1bmNvbW1pdHRlZC1raW5kIGdpdCBkaWZmIGFnYWluc3QgdGhlIHdvcmtpbmcgZGlyLCBnb3Q6ICR7SlNPTi5zdHJpbmdpZnkoY29tcHV0ZUNhbGxzKX1gLFxuXHRcdFx0KTtcblxuXHRcdFx0bG9jYWxTZXJ2aWNlLnVuc3Vic2NyaWJlKHVuY29tbWl0dGVkVXJpLCAnY2xpZW50LTEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZFN1YnNjcmliZXIgZm9yIHRoZSBzZXNzaW9uIFVSSSBvciBzZXNzaW9uLWNoYW5nZXNldCBVUkkgdHJpZ2dlcnMgYSBzdGF0aWMgcmVmcmVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBBZ2VudHMgV2luZG93IHN1YnNjcmliZXMgdG8gdGhlIHNlc3Npb24gVVJJIChsaXN0IC9cblx0XHRcdC8vIGRldGFpbCkgcmF0aGVyIHRoYW4gdG8gZWl0aGVyIG9mIHRoZSBzdGF0aWMgY2hhbmdlc2V0IFVSSXNcblx0XHRcdC8vIGRpcmVjdGx5LCBzbyB0aGUgY2hpcCB3b3VsZCBuZXZlciByZWZyZXNoIG9uIHNlc3Npb24gb3BlblxuXHRcdFx0Ly8gd2l0aG91dCB0aGlzIHRyaWdnZXIuIFN1YnNjcmliaW5nIHRvIHRoZSBzZXNzaW9uLWNoYW5nZXNldFxuXHRcdFx0Ly8gVVJJIGZyb20gYW55IG90aGVyIGNsaWVudCBtdXN0IGFsc28gZmlyZSBpdHMgb3duIHJlZnJlc2guXG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd2QtcmVmcmVzaC0yJyB9KTtcblx0XHRcdGNvcGlsb3RBZ2VudC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkIH07XG5cblx0XHRcdGNvbnN0IGNvbXB1dGVDYWxsczogeyB3ZDogc3RyaW5nOyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdFNlcnZpY2UuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyAod2Q6IFVSSSwgb3B0czogeyBzZXNzaW9uVXJpOiBzdHJpbmc7IGJhc2VCcmFuY2g/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRjb21wdXRlQ2FsbHMucHVzaCh7IHdkOiB3ZC50b1N0cmluZygpLCBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25DaGFuZ2VzZXRVcmkgPSBVUkkucGFyc2UoYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSk7XG5cblx0XHRcdGxvY2FsU2VydmljZS5hZGRTdWJzY3JpYmVyKHNlc3Npb25DaGFuZ2VzZXRVcmksICdjbGllbnQtMScpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTInKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAyMCkpO1xuXG5cdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdGNvbXB1dGVDYWxscy5zb21lKGMgPT4gYy53ZCA9PT0gd29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKSxcblx0XHRcdFx0YHNlc3Npb24tVVJJIC8gc2Vzc2lvbi1jaGFuZ2VzZXQgc3Vic2NyaXB0aW9ucyBtdXN0IHRyaWdnZXIgYSBnaXQgZGlmZiBhZ2FpbnN0IHRoZSB3b3JraW5nIGRpciwgZ290OiAke0pTT04uc3RyaW5naWZ5KGNvbXB1dGVDYWxscyl9YCxcblx0XHRcdCk7XG5cblx0XHRcdGxvY2FsU2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uQ2hhbmdlc2V0VXJpLCAnY2xpZW50LTEnKTtcblx0XHRcdGxvY2FsU2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZVNlc3Npb24gZHJhaW5zIGEgcGVuZGluZyB1bmNvbW1pdHRlZCByZWZyZXNoIGRlZmVycmVkIGJ5IGFuIGVhcmxpZXIgYWRkU3Vic2NyaWJlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlcHJvZHVjZXMgdGhlIGNvbGQtb3BlbiByYWNlIHRoYXQgYnJva2UgXHUwMEE3Mzpcblx0XHRcdC8vIDEuIENsaWVudCBzdWJzY3JpYmVzIHRvIGA8c2Vzc2lvbj4vY2hhbmdlc2V0L3VuY29tbWl0dGVkYFxuXHRcdFx0Ly8gICAgYmVmb3JlIHRoZSBzZXNzaW9uIGhhcyBiZWVuIHJlc3RvcmVkIG9uIHRoZSBzZXJ2ZXIuXG5cdFx0XHQvLyAyLiBhZGRTdWJzY3JpYmVyJ3MgMFx1MjE5MjEgdHJpZ2dlciBmaXJlcyBgX3RyaWdnZXJVbmNvbW1pdHRlZFJlZnJlc2hgLFxuXHRcdFx0Ly8gICAgd2hpY2ggcmVhZHMgYHN1bW1hcnkud29ya2luZ0RpcmVjdG9yeWAgZnJvbSBsaXZlIHN0YXRlXG5cdFx0XHQvLyAgICBcdTIwMTQgZmluZHMgbm90aGluZyAoc2Vzc2lvbiBub3QgcmVzdG9yZWQgeWV0KSBcdTIwMTQgYW5kIGRlZmVyc1xuXHRcdFx0Ly8gICAgdmlhIGBfcGVuZGluZ1VuY29tbWl0dGVkUmVmcmVzaGVzYC5cblx0XHRcdC8vIDMuIHJlc3RvcmVTZXNzaW9uIHRoZW4gcnVucyAoZHJpdmVuIGJ5IHRoZSBjaGF0LXZpZXcgcGF0aCBvclxuXHRcdFx0Ly8gICAgYSBzZXBhcmF0ZSBzdWJzY3JpYmUpLCBwb3B1bGF0ZXMgYHN1bW1hcnkud29ya2luZ0RpcmVjdG9yeWBcblx0XHRcdC8vICAgIGZyb20gZGlzaywgYW5kIE1VU1QgZHJhaW4gdGhlIHBlbmRpbmcgcmVmcmVzaC5cblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93ZC1yZXN0b3JlLWRyYWluJyB9KTtcblx0XHRcdGNvcGlsb3RBZ2VudC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyA9IHsgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkIH07XG5cblx0XHRcdGNvbnN0IGNvbXB1dGVDYWxsczogeyB3ZDogc3RyaW5nOyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdFNlcnZpY2UuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyAod2Q6IFVSSSwgb3B0czogeyBzZXNzaW9uVXJpOiBzdHJpbmc7IGJhc2VCcmFuY2g/OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRjb21wdXRlQ2FsbHMucHVzaCh7IHdkOiB3ZC50b1N0cmluZygpLCBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblxuXHRcdFx0Ly8gU2VlZCBhIHNlc3Npb24gb24gdGhlIGFnZW50IHdpdGhvdXQgY2FsbGluZ1xuXHRcdFx0Ly8gYGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uYCBcdTIwMTQgbWlycm9ycyBhIHJlc3RvcmVkLWZyb20tZGlza1xuXHRcdFx0Ly8gc2Vzc2lvbiBub3QgeWV0IGluIHRoZSBzZXJ2aWNlJ3Mgc3RhdGUgbWFuYWdlci5cblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgY29waWxvdEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgY29waWxvdEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblx0XHRcdGNvbnN0IHVuY29tbWl0dGVkVXJpID0gVVJJLnBhcnNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpKTtcblxuXHRcdFx0Ly8gU3RlcCAxKzI6IHN1YnNjcmliZSBiZWZvcmUgcmVzdG9yZS4gVHJpZ2dlciBkZWZlcnMuXG5cdFx0XHRsb2NhbFNlcnZpY2UuYWRkU3Vic2NyaWJlcih1bmNvbW1pdHRlZFVyaSwgJ2NsaWVudC0xJyk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMjApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Y29tcHV0ZUNhbGxzLmxlbmd0aCxcblx0XHRcdFx0MCxcblx0XHRcdFx0YG5vIGNvbXB1dGUgc2hvdWxkIGZpcmUgd2hpbGUgdGhlIHNlc3Npb24gaXMgbm90IHJlc3RvcmVkICh3b3JraW5nRGlyZWN0b3J5IHVua25vd24pLCBnb3Q6ICR7SlNPTi5zdHJpbmdpZnkoY29tcHV0ZUNhbGxzKX1gLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU3RlcCAzOiByZXN0b3JlU2Vzc2lvbiBydW5zIChjaGF0LXZpZXcgcGF0aCAvIGEgcGFyYWxsZWxcblx0XHRcdC8vIHNlc3Npb24tVVJJIHN1YnNjcmliZSkuIEFmdGVyIHRoaXMsIHRoZSBwZW5kaW5nIHJlZnJlc2hcblx0XHRcdC8vIG11c3QgZHJhaW4gYW5kIGBfdHJ5Q29tcHV0ZUdpdERpZmZzYCBtdXN0IHJ1biBmb3IgdGhlXG5cdFx0XHQvLyB1bmNvbW1pdHRlZCBzbG90LlxuXHRcdFx0Y29waWxvdEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMjApKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRjb21wdXRlQ2FsbHMuc29tZShjID0+IGMuYmFzZUJyYW5jaCA9PT0gdW5kZWZpbmVkICYmIGMud2QgPT09IHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSksXG5cdFx0XHRcdGByZXN0b3JlU2Vzc2lvbiBtdXN0IGRyYWluIHRoZSBwZW5kaW5nIHJlZnJlc2g7IGdvdCBjb21wdXRlIGNhbGxzOiAke0pTT04uc3RyaW5naWZ5KGNvbXB1dGVDYWxscyl9YCxcblx0XHRcdCk7XG5cblx0XHRcdGxvY2FsU2VydmljZS51bnN1YnNjcmliZSh1bmNvbW1pdHRlZFVyaSwgJ2NsaWVudC0xJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gZW1wdHktc2Vzc2lvbiBHQyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2VtcHR5LXNlc3Npb24gR0MnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhbiBlbXB0eSB1bnN1YnNjcmliZWQgc2Vzc2lvbiBpcyBkaXNwb3NlZCBhZnRlciB0aGUgZ3JhY2UgcGVyaW9kJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdFx0c2VydmljZS5hZGRTdWJzY3JpYmVyKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0xJyk7XG5cblx0XHRcdFx0c2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXG5cdFx0XHRcdC8vIEJlZm9yZSB0aGUgZ3JhY2UgcGVyaW9kLCBkaXNwb3NlIGhhcyBub3QgYmVlbiBjYWxsZWQuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90QWdlbnQuZGlzcG9zZVNlc3Npb25DYWxscy5sZW5ndGgsIDAsICdubyBHQyBiZWZvcmUgZ3JhY2UgZXhwaXJlcycpO1xuXG5cdFx0XHRcdC8vIEFmdGVyIHRoZSBncmFjZSBwZXJpb2QsIHRoZSBzZXNzaW9uIGlzIGRpc3Bvc2VkIGVudGlyZWx5LlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzBfMDAwKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Y29waWxvdEFnZW50LmRpc3Bvc2VTZXNzaW9uQ2FsbHMubWFwKHUgPT4gdS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRbc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRcdCdHQyBmaXJlZCBhZnRlciBncmFjZSBwZXJpb2QnLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHNlc3Npb24gd2l0aCBhdCBsZWFzdCBvbmUgdHVybiBpcyBub3QgR0MtZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdFx0c2VydmljZS5kaXNwYXRjaEFjdGlvbihcblx0XHRcdFx0XHRidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQ6ICd0dXJuLTEnLCBzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLCBtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9LFxuXHRcdFx0XHRcdCdjbGllbnQtMScsIDEsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcGF0Y2hBY3Rpb24oXG5cdFx0XHRcdFx0YnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHRcdFx0J2NsaWVudC0xJywgMixcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRzZXJ2aWNlLnVuc3Vic2NyaWJlKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0xJyk7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAzMF8wMDApKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29waWxvdEFnZW50LmRpc3Bvc2VTZXNzaW9uQ2FsbHMubGVuZ3RoLCAwLCAnc2Vzc2lvbiB3aXRoIHR1cm5zIG11c3Qgbm90IGJlIEdDLWRpc3Bvc2VkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3Vic2NyaWJlIHdpdGhpbiB0aGUgZ3JhY2UgcGVyaW9kIGNhbmNlbHMgR0MnLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblxuXHRcdFx0XHRzZXJ2aWNlLnVuc3Vic2NyaWJlKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0xJyk7XG5cdFx0XHRcdC8vIFJlc3Vic2NyaWJlIGJlZm9yZSB0aGUgdGltZXIgZmlyZXMuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1XzAwMCkpO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDMwXzAwMCkpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90QWdlbnQuZGlzcG9zZVNlc3Npb25DYWxscy5sZW5ndGgsIDAsICdHQyBtdXN0IGJlIGNhbmNlbGxlZCBhZnRlciByZXN1YnNjcmliZScpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdHQyBpcyByZWFybWVkIGFmdGVyIGEgcmVzdWJzY3JpYmUtdGhlbi11bnN1YnNjcmliZSBjeWNsZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXG5cdFx0XHRcdHNlcnZpY2UudW5zdWJzY3JpYmUoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDVfMDAwKSk7XG5cdFx0XHRcdHNlcnZpY2UuYWRkU3Vic2NyaWJlcihzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXHRcdFx0XHRzZXJ2aWNlLnVuc3Vic2NyaWJlKHNlc3Npb25SZXNvdXJjZSwgJ2NsaWVudC0xJyk7XG5cblx0XHRcdFx0Ly8gT2xkIHRpbWVyIHdhcyBjYW5jZWxsZWQ7IGEgZnJlc2ggMzBzIHRpbWVyIGlzIG5vdyBhcm1lZC5cblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDI5XzAwMCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29waWxvdEFnZW50LmRpc3Bvc2VTZXNzaW9uQ2FsbHMubGVuZ3RoLCAwLCAncmVhcm1lZCB0aW1lciBub3QgeWV0IGZpcmVkJyk7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyXzAwMCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29waWxvdEFnZW50LmRpc3Bvc2VTZXNzaW9uQ2FsbHMubGVuZ3RoLCAxLCAncmVhcm1lZCB0aW1lciBmaXJlcyBhZnRlciBmcmVzaCAzMHMnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiBvbiB0aGUgc2FtZSBVUkkgY2FuY2VscyBhIHBlbmRpbmcgR0MnLCAoKSA9PiB7XG5cdFx0XHQvLyBNb2RlbHMgdGhlIHJlY29ubmVjdCBwYXRoOiBjbGllbnQgc3Vic2NyaWJlcyB0byBhIHNlc3Npb24sXG5cdFx0XHQvLyBkcm9wcyB0aGUgc3Vic2NyaXB0aW9uIChHQyBhcm1lZCksIHRoZW4gcmUtaXNzdWVzXG5cdFx0XHQvLyBgY3JlYXRlU2Vzc2lvbmAgZm9yIHRoZSBzYW1lIFVSSSBiZWZvcmUgdGhlIGdyYWNlIGV4cGlyZXMuXG5cdFx0XHQvLyBXaXRob3V0IGV4cGxpY2l0IGNhbmNlbGxhdGlvbiwgdGhlIHRpbWVyIHdvdWxkIGZpcmUgYW5kXG5cdFx0XHQvLyBkaXNwb3NlIHRoZSBqdXN0LXJldml2ZWQgc2Vzc2lvbi5cblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcsIHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAncmVjcmVhdGUtdGVzdCcpIH0pO1xuXHRcdFx0XHRzZXJ2aWNlLmFkZFN1YnNjcmliZXIoc2Vzc2lvblJlc291cmNlLCAnY2xpZW50LTEnKTtcblx0XHRcdFx0c2VydmljZS51bnN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsICdjbGllbnQtMScpO1xuXG5cdFx0XHRcdC8vIFJlLWlzc3VlIGNyZWF0ZVNlc3Npb24gbWlkLWdyYWNlLlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNV8wMDApKTtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90Jywgc2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdyZWNyZWF0ZS10ZXN0JykgfSk7XG5cblx0XHRcdFx0Ly8gV2FpdCBwYXN0IHRoZSBvcmlnaW5hbCBncmFjZSB3aW5kb3cuIElmIEdDIHdhc24ndFxuXHRcdFx0XHQvLyBjYW5jZWxsZWQgYnkgY3JlYXRlU2Vzc2lvbiwgZGlzcG9zZSB3b3VsZCBoYXZlIGZpcmVkLlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzBfMDAwKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3BpbG90QWdlbnQuZGlzcG9zZVNlc3Npb25DYWxscy5sZW5ndGgsIDAsICdjcmVhdGVTZXNzaW9uIG9uIHNhbWUgVVJJIG11c3QgY2FuY2VsIHBlbmRpbmcgR0MnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2Vzc2lvbiBjb25maWcgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIHBlcnNpc3RzIGluaXRpYWwgY29uZmlnIHZhbHVlcyB0byB0aGUgc2Vzc2lvbiBEQicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsQWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGxvY2FsQWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGxvY2FsQWdlbnQpO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcsIGNvbmZpZzogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9IH0pO1xuXG5cdFx0XHQvLyBQZXJzaXN0ZW5jZSBpcyBmaXJlLWFuZC1mb3JnZXQ7IHdhaXQgZm9yIGl0IHRvIGZsdXNoXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcblxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgc2Vzc2lvbkRiLmdldE1ldGFkYXRhKCdjb25maWdWYWx1ZXMnKTtcblx0XHRcdGFzc2VydC5vayhwZXJzaXN0ZWQsICdjb25maWdWYWx1ZXMgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHBlcnNpc3RlZCEpLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiBkb2VzIG5vdCB3cml0ZSBjb25maWdWYWx1ZXMgd2hlbiB0aGVyZSBhcmUgbm8gdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSk7XG5cblx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHNlc3Npb25EYi5nZXRNZXRhZGF0YSgnY29uZmlnVmFsdWVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVyc2lzdGVkLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZVNlc3Npb24gb3ZlcmxheXMgcGVyc2lzdGVkIGNvbmZpZyB2YWx1ZXMgb250byB0aGUgcmVzb2x2ZWQgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHNlc3Npb24gb24gdGhlIGFnZW50IGJhY2tlbmQgKG5vIGNvbmZpZykgc28gbGlzdFNlc3Npb25zIGNhbiBmaW5kIGl0XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGxvY2FsQWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBsb2NhbEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Ly8gUHJlLXNlZWQgcGVyc2lzdGVkIGNvbmZpZyB2YWx1ZXNcblx0XHRcdGF3YWl0IHNlc3Npb25EYi5zZXRNZXRhZGF0YSgnY29uZmlnVmFsdWVzJywgSlNPTi5zdHJpbmdpZnkoeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9KSk7XG5cblx0XHRcdGxvY2FsQWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHQvLyBNb2NrQWdlbnQucmVzb2x2ZVNlc3Npb25Db25maWcgZWNob2VzIHBhcmFtcy5jb25maWcgYmFjayBhcyB2YWx1ZXMsIHNvIHRoZVxuXHRcdFx0Ly8gcGVyc2lzdGVkIHZhbHVlcyBhcmUgZm9yd2FyZGVkIHRocm91Z2ggYW5kIGVuZCB1cCBvbiBzdGF0ZS5jb25maWcudmFsdWVzLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZSEuY29uZmlnPy52YWx1ZXMsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ3Jlc3RvcmVTZXNzaW9uIHNlZWRzIHRoZSBzZXNzaW9uIGNoYW5nZXNldCBmcm9tIHBlcnNpc3RlZCBkaWZmcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsQWdlbnQgPSBuZXcgTW9ja0FnZW50KCdjb3BpbG90Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGxvY2FsQWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGxvY2FsQWdlbnQpO1xuXG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGxvY2FsQWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBsb2NhbEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkRGlmZnMgPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDUsIHJlbW92ZWQ6IDIgfSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuc2V0TWV0YWRhdGEoJ2RpZmZzJywgSlNPTi5zdHJpbmdpZnkocGVyc2lzdGVkRGlmZnMpKTtcblxuXHRcdFx0bG9jYWxBZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0hpJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlKTtcblx0XHRcdC8vIFRoZSBzZXNzaW9uIGhhcyBubyB3b3JraW5nIGRpcmVjdG9yeSwgc28gYF9hdHRhY2hHaXRTdGF0ZWBcblx0XHRcdC8vIHRyZWF0cyBpdCBhcyB0cmFuc2llbnQgYW5kIGRvZXMgTk9UIHN0cmlwIHRoZSB0d28gZ2l0LW9ubHlcblx0XHRcdC8vIGNhdGFsb2d1ZSBlbnRyaWVzLiBUaGUgQnJhbmNoIENoYW5nZXMgZW50cnkgcmVjZWl2ZXMgdGhlXG5cdFx0XHQvLyBwZXJzaXN0ZWQgZGlmZiBjb3VudHMgc2VlZGVkIGJ5IHRoZSBjaGFuZ2VzZXQgY29vcmRpbmF0b3IuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlIS5jaGFuZ2VzZXRzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ0JyYW5jaCBDaGFuZ2VzJyxcblx0XHRcdFx0XHR1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9L2NoYW5nZXNldC9zZXNzaW9uYCxcblx0XHRcdFx0XHRjaGFuZ2VLaW5kOiAnc2Vzc2lvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2hvdyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGluIHRoaXMgc2Vzc2lvbicsXG5cdFx0XHRcdFx0dXJpVGVtcGxhdGU6IGAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgLFxuXHRcdFx0XHRcdGNoYW5nZUtpbmQ6ICd1bmNvbW1pdHRlZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlc2V0U25hcHNob3QgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0YXNzZXJ0Lm9rKGNoYW5nZXNldFNuYXBzaG90KTtcblx0XHRcdGNvbnN0IGNoYW5nZXNldFN0YXRlID0gY2hhbmdlc2V0U25hcHNob3Quc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZyB9PiB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNldFN0YXRlLnN0YXR1cywgJ3JlYWR5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXNldFN0YXRlLmZpbGVzLm1hcChmID0+IGYuaWQpLCBbJ2ZpbGU6Ly8vd2QvYS50cyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgncmVzdG9yZVNlc3Npb24gc2lsZW50bHkgaWdub3JlcyBtYWxmb3JtZWQgcGVyc2lzdGVkIGRpZmZzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgbG9jYWxBZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGxvY2FsQWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuc2V0TWV0YWRhdGEoJ2RpZmZzJywgJ3sgbm90IHZhbGlkIGpzb24nKTtcblxuXHRcdFx0bG9jYWxBZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0hpJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlKTtcblx0XHRcdC8vIENhdGFsb2d1ZSBpcyBzZWVkZWQgYnkgYF9idWlsZEluaXRpYWxTdW1tYXJ5YCAvIGByZXN0b3JlU2Vzc2lvbmAuXG5cdFx0XHQvLyBUaGUgc2Vzc2lvbiBoYXMgbm8gd29ya2luZyBkaXJlY3RvcnksIHNvIGBfYXR0YWNoR2l0U3RhdGVgIGRvZXNcblx0XHRcdC8vIE5PVCBzdHJpcCB0aGUgZ2l0LW9ubHkgZW50cmllcyBcdTIwMTQgdGhleSByZW1haW4gYWR2ZXJ0aXNlZCBidXRcblx0XHRcdC8vIHdpdGhvdXQgY291bnRzIHVudGlsIGEgcmVhbCBjb21wdXRlIGxhbmRzLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZSEuY2hhbmdlc2V0cywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdFx0dXJpVGVtcGxhdGU6IGAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfS9jaGFuZ2VzZXQvc2Vzc2lvbmAsXG5cdFx0XHRcdFx0Y2hhbmdlS2luZDogJ3Nlc3Npb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJyxcblx0XHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHRcdHVyaVRlbXBsYXRlOiBgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCxcblx0XHRcdFx0XHRjaGFuZ2VLaW5kOiAndW5jb21taXR0ZWQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGNoYW5nZXNldFNuYXBzaG90ID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3Nlc3Npb25gKTtcblx0XHRcdGFzc2VydC5vayhjaGFuZ2VzZXRTbmFwc2hvdCk7XG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRTdGF0ZSA9IGNoYW5nZXNldFNuYXBzaG90LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmc7IGZpbGVzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzZXRTdGF0ZS5zdGF0dXMsICdjb21wdXRpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzZXRTdGF0ZS5maWxlcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiArIHJlc3RvcmVTZXNzaW9uIHJvdW5kLXRyaXAgcmVzdG9yZXMgaW5pdGlhbCBjb25maWcgd2l0aG91dCBhbnkgbWlkLXNlc3Npb24gY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb24gdGVzdDogd2hlbiBhIHNlc3Npb24gaXMgY3JlYXRlZCB3aXRoIGluaXRpYWwgY29uZmlnIGJ1dCBub1xuXHRcdFx0Ly8gbWlkLXNlc3Npb24gU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgYWN0aW9ucyBhcmUgZGlzcGF0Y2hlZCwgcmVzdG9yaW5nIGl0XG5cdFx0XHQvLyBtdXN0IHN0aWxsIHJlaHlkcmF0ZSB0aGUgaW5pdGlhbCB2YWx1ZXMuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihsb2NhbEFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JywgY29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0gfSk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBmaXJlLWFuZC1mb3JnZXQgcGVyc2lzdGVuY2UgdG8gZmx1c2hcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIHNlcnZlciByZXN0YXJ0OiBkcm9wIHRoZSBpbi1tZW1vcnkgc3RhdGVcblx0XHRcdGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRsb2NhbEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZSEuY29uZmlnPy52YWx1ZXMsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlU2Vzc2lvbiBpZ25vcmVzIG1hbGZvcm1lZCBwZXJzaXN0ZWQgY29uZmlnVmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgbG9jYWxBZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGxvY2FsQWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuc2V0TWV0YWRhdGEoJ2NvbmZpZ1ZhbHVlcycsICd7bm90IGpzb24nKTtcblxuXHRcdFx0bG9jYWxBZ2VudC5zZXNzaW9uTWVzc2FnZXMgPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAndXNlcicsIG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ0hpJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0Ly8gU2hvdWxkIG5vdCB0aHJvdyBkZXNwaXRlIHRoZSBtYWxmb3JtZWQgSlNPTlxuXHRcdFx0YXdhaXQgbG9jYWxTZXJ2aWNlLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlKTtcblx0XHRcdC8vIE1vY2tBZ2VudCBoYXMgYSB3b3JraW5nRGlyZWN0b3J5PyBObyBcdTIwMTQgYnV0IHRoZSBtZXRhZGF0YSBzdXBwbGllcyBpdCBhcyB1bmRlZmluZWQuXG5cdFx0XHQvLyBfcmVzb2x2ZUNyZWF0ZWRTZXNzaW9uQ29uZmlnIGJhaWxzIHdoZW4gYm90aCAuY29uZmlnIGFuZCAud29ya2luZ0RpcmVjdG9yeSBhcmVcblx0XHRcdC8vIG1pc3NpbmcsIHNvIHN0YXRlLmNvbmZpZyBpcyB1bmRlZmluZWQgaGVyZS4gVGhlIGtleSBwb2ludCBpczogbm8gdGhyb3cuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLmNvbmZpZywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSByZXNvdXJjZUxpc3QgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3Jlc291cmNlTGlzdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIHRoZSBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5yZXNvdXJjZUxpc3QoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbm9uZXhpc3RlbnQnIH0pKSxcblx0XHRcdFx0L0RpcmVjdG9yeSBub3QgZm91bmQvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIHRoZSB0YXJnZXQgaXMgbm90IGEgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UucmVzb3VyY2VMaXN0KFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3Rlc3REaXIvZmlsZS50eHQnIH0pKSxcblx0XHRcdFx0L05vdCBhIGRpcmVjdG9yeS8sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHdvcmt0cmVlIHdvcmtpbmcgZGlyZWN0b3J5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnd29ya3RyZWUgd29ya2luZyBkaXJlY3RvcnknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIHVzZXMgYWdlbnQtcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkgaW4gc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTaW11bGF0ZSBhbiBhZ2VudCB0aGF0IHJlc29sdmVzIGEgd29ya3RyZWUgcGF0aCBkaWZmZXJlbnQgZnJvbSB0aGUgaW5wdXRcblx0XHRcdGNvbnN0IHdvcmt0cmVlRGlyID0gVVJJLmZpbGUoJy9zb3VyY2UvcmVwby53b3JrdHJlZXMvYWdlbnRzLXh5eicpO1xuXHRcdFx0Y29waWxvdEFnZW50LnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IHdvcmt0cmVlRGlyO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNvdXJjZURpciA9IFVSSS5maWxlKCcvc291cmNlL3JlcG8nKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtzb3VyY2VEaXJdIH0pO1xuXG5cdFx0XHQvLyBUaGUgc3RhdGUgbWFuYWdlciBzaG91bGQgaGF2ZSB0aGUgd29ya3RyZWUgcGF0aCwgbm90IHRoZSBzb3VyY2UgcGF0aFxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0sIHdvcmt0cmVlRGlyLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiBmYWxscyBiYWNrIHRvIGNvbmZpZyB3b3JraW5nIGRpcmVjdG9yeSB3aGVuIGFnZW50IGRvZXMgbm90IHJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBZ2VudCBkb2VzIG5vdCBvdmVycmlkZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgKGUuZy4gZm9sZGVyIGlzb2xhdGlvbilcblx0XHRcdGNvcGlsb3RBZ2VudC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSB1bmRlZmluZWQ7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc291cmNlRGlyID0gVVJJLmZpbGUoJy9zb3VyY2UvcmVwbycpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcsIHdvcmtpbmdEaXJlY3RvcmllczogW3NvdXJjZURpcl0gfSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLCBzb3VyY2VEaXIudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlU2Vzc2lvbiB1c2VzIGFnZW50IHdvcmtpbmcgZGlyZWN0b3J5IGluIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQWdlbnQgcmV0dXJucyB0aGUgd29ya3RyZWUgcGF0aCB0aHJvdWdoIGxpc3RTZXNzaW9uc1xuXHRcdFx0Y29uc3Qgd29ya3RyZWVEaXIgPSBVUkkuZmlsZSgnL3NvdXJjZS9yZXBvLndvcmt0cmVlcy9hZ2VudHMteHl6Jyk7XG5cdFx0XHRjb3BpbG90QWdlbnQuc2Vzc2lvbk1ldGFkYXRhT3ZlcnJpZGVzID0geyB3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmt0cmVlRGlyID8gW3dvcmt0cmVlRGlyXSA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGNvcGlsb3RBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogJ2NvcGlsb3QnIH0pO1xuXG5cdFx0XHQvLyBEZWxldGUgZnJvbSBzdGF0ZSB0byBzaW11bGF0ZSBhIHNlcnZlciByZXN0YXJ0XG5cdFx0XHRzZXJ2aWNlLnN0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFJlc3RvcmUgdGhlIHNlc3Npb24gKHNpbXVsYXRlcyBhIGNsaWVudCBzdWJzY3JpYmluZyBhZnRlciByZXN0YXJ0KVxuXHRcdFx0YXdhaXQgc2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0sIHdvcmt0cmVlRGlyLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZCByZXR1cm5zIHRoZSBmdWxsIHNldCAoaW5kZXggMCArIHRhaWwpLCBvciB1bmRlZmluZWQgd2hlbiB1bnNldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVyID0gc2VydmljZSBhcyB1bmtub3duIGFzIHtcblx0XHRcdFx0X3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZDogKHA6IHsgc2Vzc2lvbjogc3RyaW5nOyBjaGF0OiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nOyBwcm9tcHQ6IHN0cmluZyB9KSA9PiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkPjtcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXNvbHZlID0gKHJlc291cmNlOiBzdHJpbmcpID0+IHJlc29sdmVyLl9yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQoeyBzZXNzaW9uOiByZXNvdXJjZSwgY2hhdDogYCR7cmVzb3VyY2V9L2NoYXRgLCB0dXJuSWQ6ICd0JywgcHJvbXB0OiAnaGknIH0pO1xuXHRcdFx0Y29uc3QgaW5qZWN0ID0gKHJlc291cmNlOiBzdHJpbmcsIGRpcnM/OiByZWFkb25seSBVUklbXSkgPT4gc2VydmljZS5zdGF0ZU1hbmFnZXIucmVzdG9yZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0dGl0bGU6ICd0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHByb2plY3Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBkaXJzPy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwgW10pO1xuXG5cdFx0XHRjb25zdCBhID0gVVJJLmZpbGUoJy9yb290cy9hJyk7XG5cdFx0XHRjb25zdCBiID0gVVJJLmZpbGUoJy9yb290cy9iJyk7XG5cdFx0XHRjb25zdCBjID0gVVJJLmZpbGUoJy9yb290cy9jJyk7XG5cdFx0XHRjb25zdCBtdWx0aSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvbXVsdGknIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBzaW5nbGUgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3NpbmdsZScgfSkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IG5vbmUgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL25vbmUnIH0pLnRvU3RyaW5nKCk7XG5cdFx0XHRpbmplY3QobXVsdGksIFthLCBiLCBjXSk7XG5cdFx0XHRpbmplY3Qoc2luZ2xlLCBbYV0pO1xuXHRcdFx0aW5qZWN0KG5vbmUsIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIE5vIHdvcmt0cmVlIGlzb2xhdGlvbiBpcyBjb25maWd1cmVkLCBzbyBpbmRleCAwIHJlc29sdmVzIHRvIGl0c2VsZiBhbmRcblx0XHRcdC8vIHRoZSBhZGRpdGlvbmFsIHJvb3RzIGFyZSBwcmVzZXJ2ZWQgYXMtaXM7IGEgc2Vzc2lvbiB3aXRoIG5vIHJvb3RzXG5cdFx0XHQvLyByZXNvbHZlcyB0byBgdW5kZWZpbmVkYCAodGhlIGFnZW50IHJ1bnMgaW4gaXRzIG93biBzY3JhdGNoIGRpcikuXG5cdFx0XHRjb25zdCB0b1N0cmluZ3MgPSAocjogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpID0+IHI/Lm1hcChkID0+IGQudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbdG9TdHJpbmdzKGF3YWl0IHJlc29sdmUobXVsdGkpKSwgdG9TdHJpbmdzKGF3YWl0IHJlc29sdmUoc2luZ2xlKSksIHRvU3RyaW5ncyhhd2FpdCByZXNvbHZlKG5vbmUpKV0sXG5cdFx0XHRcdFtbYSwgYiwgY10ubWFwKGQgPT4gZC50b1N0cmluZygpKSwgW2EudG9TdHJpbmcoKV0sIHVuZGVmaW5lZF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aXNpb25hbCB3b3Jrc3BhY2Ugc2Vzc2lvbiBhZHZlcnRpc2VzIFVuY29tbWl0dGVkIENoYW5nZXMgYmVmb3JlIG1hdGVyaWFsaXphdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjbGFzcyBQcm92aXNpb25hbE1vY2tBZ2VudCBleHRlbmRzIE1vY2tBZ2VudCB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVTZXNzaW9uKGNvbmZpZz86IGltcG9ydCgnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcycpLklBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpOiBQcm9taXNlPElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3VwZXIuY3JlYXRlU2Vzc2lvbihjb25maWcpO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5yZXN1bHQsIHByb3Zpc2lvbmFsOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgZ2l0Q2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0U2VydmljZS5nZXRTZXNzaW9uR2l0U3RhdGUgPSBhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRnaXRDYWxscy5wdXNoKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0YnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5jb21pbmdDaGFuZ2VzOiAwLFxuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDAsXG5cdFx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogMSxcblx0XHRcdH07XG5cdFx0fTtcblx0XHRnaXRTZXJ2aWNlLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzID0gYXN5bmMgKCkgPT4gW107XG5cdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBudWxsU2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSkpO1xuXHRcdGNvbnN0IHByb3Zpc2lvbmFsQWdlbnQgPSBuZXcgUHJvdmlzaW9uYWxNb2NrQWdlbnQoJ3Byb3Zpc2lvbmFsJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm92aXNpb25hbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3Zpc2lvbmFsQWdlbnQpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU2Vzc2lvbiA9IGF3YWl0IGxvY2FsU2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHByb3ZpZGVyOiBwcm92aXNpb25hbEFnZW50LmlkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHVuY29tbWl0dGVkVXJpID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaSh3b3Jrc3BhY2VTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGxvY2FsU2VydmljZS5hZGRTdWJzY3JpYmVyKFVSSS5wYXJzZSh1bmNvbW1pdHRlZFVyaSksICdjbGllbnQtMScpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdGlmIChsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHVuY29tbWl0dGVkVXJpKT8ub3BlcmF0aW9ucz8uc29tZShvcGVyYXRpb24gPT4gb3BlcmF0aW9uLmlkID09PSAnY29tbWl0JykpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZVN0YXRlID0gbG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUod29ya3NwYWNlU2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxpZmVjeWNsZTogd29ya3NwYWNlU3RhdGU/LmxpZmVjeWNsZSxcblx0XHRcdGNoYW5nZXNldHM6IHdvcmtzcGFjZVN0YXRlPy5jaGFuZ2VzZXRzPy5tYXAoY2hhbmdlc2V0ID0+IGNoYW5nZXNldC5jaGFuZ2VLaW5kKSxcblx0XHRcdGdpdENhbGxzLFxuXHRcdFx0aGFzQ29tbWl0OiBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHVuY29tbWl0dGVkVXJpKT8ub3BlcmF0aW9ucz8uc29tZShvcGVyYXRpb24gPT4gb3BlcmF0aW9uLmlkID09PSAnY29tbWl0JyksXG5cdFx0fSwge1xuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nLFxuXHRcdFx0Y2hhbmdlc2V0czogWyd1bmNvbW1pdHRlZCddLFxuXHRcdFx0Z2l0Q2FsbHM6IFt3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCldLFxuXHRcdFx0aGFzQ29tbWl0OiB0cnVlLFxuXHRcdH0pO1xuXHRcdGxvY2FsU2VydmljZS51bnN1YnNjcmliZShVUkkucGFyc2UodW5jb21taXR0ZWRVcmkpLCAnY2xpZW50LTEnKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUxlc3NTZXNzaW9uID0gYXdhaXQgbG9jYWxTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oeyBwcm92aWRlcjogcHJvdmlzaW9uYWxBZ2VudC5pZCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0bG9jYWxTZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUod29ya3NwYWNlTGVzc1Nlc3Npb24udG9TdHJpbmcoKSk/LmNoYW5nZXNldHMgPz8gW10sXG5cdFx0XHRbXSxcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIEl0ZW0tMiByZWdyZXNzaW9uOiBpbml0aWFsIGNoYW5nZXNldCBzZWVkaW5nIGhhcHBlbnMgYXQgY3JlYXRlIHRpbWUgLS1cblxuXHQvKipcblx0ICogVGhlc2UgdGVzdHMgcGluIHRoZSBjcmVhdGUtdGltZSBpbnZhcmlhbnQgdGhhdCBib3RoIGhhbHZlcyBvZiBpbml0aWFsXG5cdCAqIGNoYW5nZXNldCBzZWVkaW5nIFx1MjAxNCB0aGUgc3VtbWFyeSBjYXRhbG9ndWUgKGBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9ndWVgXG5cdCAqIGluc2lkZSBgX2J1aWxkSW5pdGlhbFN1bW1hcnlgKSBhbmQgdGhlIGJhY2tpbmcgcGVyLWNoYW5nZXNldCBzdGF0ZXNcblx0ICogKGBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLnJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0c2ApIFx1MjAxNCBydW4gYXMgcGFydFxuXHQgKiBvZiBzZXNzaW9uIGNyZWF0aW9uLCBuZXZlciBkZWZlcnJlZCB0byBtYXRlcmlhbGl6YXRpb24uIFRoZXkgYXNzZXJ0XG5cdCAqIGJvdGggaGFsdmVzIHRocm91Z2ggdGhlIHB1YmxpYyBzbmFwc2hvdCBzdXJmYWNlIG9ubHksIG5ldmVyIGluc3BlY3Rpbmdcblx0ICogc3RhdGUtbWFuYWdlciBpbnRlcm5hbHMuXG5cdCAqL1xuXHRzdWl0ZS5za2lwKCdpdGVtLTI6IGluaXRpYWwgY2hhbmdlc2V0IHNlZWRpbmcgYXQgY3JlYXRlIHRpbWUnLCAoKSA9PiB7XG5cblx0XHQvKiogUmV0dXJucyBgdHJ1ZWAgd2hlbiBib3RoIHN0YXRpYyBjaGFuZ2VzZXQgVVJJcyBleGlzdCB3aXRoIGBzdGF0dXM6ICdjb21wdXRpbmcnYC4gKi9cblx0XHRmdW5jdGlvbiBhc3NlcnRCYWNraW5nQ2hhbmdlc2V0c0NvbXB1dGluZyhzdGF0ZU1hbmFnZXI6IEFnZW50U2VydmljZVsnc3RhdGVNYW5hZ2VyJ10sIHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWQgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uU3RyKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uV2lkZSA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVuY29tbWl0dGVkLCBgZXhwZWN0ZWQgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWQgdG8gYmUgc3Vic2NyaWJhYmxlYCk7XG5cdFx0XHRhc3NlcnQub2soc2Vzc2lvbldpZGUsIGBleHBlY3RlZCAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uIHRvIGJlIHN1YnNjcmliYWJsZWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh1bmNvbW1pdHRlZC5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLkNvbXB1dGluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNlc3Npb25XaWRlLnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmcgfSkuc3RhdHVzLCBDaGFuZ2VzZXRTdGF0dXMuQ29tcHV0aW5nKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBkZWZhdWx0Q2F0YWxvZ3VlKHNlc3Npb25TdHI6IHN0cmluZykge1xuXHRcdFx0Ly8gVGhlc2UgdGVzdHMgaGF2ZSBubyB3b3JraW5nIGRpcmVjdG9yeSByZXNvbHZlZCwgc29cblx0XHRcdC8vIGBfYXR0YWNoR2l0U3RhdGVgIHRyZWF0cyBpdCBhcyB0cmFuc2llbnQgYW5kIGRvZXMgTk9UIHN0cmlwXG5cdFx0XHQvLyB0aGUgdHdvIGdpdC1vbmx5IGVudHJpZXMuIEFsbCB0aHJlZSBkZWZhdWx0IGVudHJpZXMgYXJlXG5cdFx0XHQvLyBhZHZlcnRpc2VkICh3aXRob3V0IGNvdW50cykgdW50aWwgYSByZWFsIGNvbXB1dGUgbGFuZHMuXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRcdFx0dXJpVGVtcGxhdGU6IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYCxcblx0XHRcdFx0XHRjaGFuZ2VLaW5kOiAnc2Vzc2lvbicsXG5cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnVW5jb21taXR0ZWQgQ2hhbmdlcycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJyxcblx0XHRcdFx0XHR1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCxcblx0XHRcdFx0XHRjaGFuZ2VLaW5kOiAndW5jb21taXR0ZWQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIHNlZWRzIGJvdGggaGFsdmVzIGJlZm9yZSBTZXNzaW9uUmVhZHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoY29waWxvdEFnZW50KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlIS5jaGFuZ2VzZXRzLCBkZWZhdWx0Q2F0YWxvZ3VlKHNlc3Npb25TdHIpKTtcblx0XHRcdGFzc2VydEJhY2tpbmdDaGFuZ2VzZXRzQ29tcHV0aW5nKHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uU3RyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcmtlZCBjcmVhdGVTZXNzaW9uIHNlZWRzIGJvdGggaGFsdmVzIG9uIHRoZSBmb3JrZWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihjb3BpbG90QWdlbnQpO1xuXG5cdFx0XHQvLyBTZXQgdXAgYSBzb3VyY2Ugc2Vzc2lvbiB3aXRoIGF0IGxlYXN0IG9uZSBjb21wbGV0ZWQgdHVybi4gVGhlXG5cdFx0XHQvLyBmb3JrIHBhdGggYXQgYWdlbnRTZXJ2aWNlLnRzOjQ5My01MDQgaW50ZW50aW9uYWxseSBkcm9wc1xuXHRcdFx0Ly8gYGNvbmZpZy5mb3JrYCB3aGVuIHRoZSBzb3VyY2UgaGFzIHplcm8gdHVybnMgYW5kIGZhbGxzIHRocm91Z2hcblx0XHRcdC8vIHRvIHRoZSBub24tZm9yayBjcmVhdGUgcGF0aDsgd2l0aG91dCB0aGlzIHByZWx1ZGUgdGhlIHRlc3Rcblx0XHRcdC8vIHdvdWxkIHNpbGVudGx5IGV4ZXJjaXNlIHRoZSBub24tZm9yayBicmFuY2ggYW5kIHBhc3MgdmFjdW91c2x5LlxuXHRcdFx0Y29uc3Qgc291cmNlU2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyOiAnY29waWxvdCcgfSk7XG5cdFx0XHRjb25zdCBzb3VyY2VTdGF0ZSA9IHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzb3VyY2VTZXNzaW9uLnRvU3RyaW5nKCkpITtcblx0XHRcdGNvbnN0IHNvdXJjZVR1cm5JZCA9ICd0dXJuLXNyYy0xJztcblx0XHRcdHNvdXJjZVN0YXRlLnR1cm5zID0gW3tcblx0XHRcdFx0aWQ6IHNvdXJjZVR1cm5JZCxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGZvcms6IHsgc2Vzc2lvbjogc291cmNlU2Vzc2lvbiwgdHVybkluZGV4OiAwLCB0dXJuSWQ6IHNvdXJjZVR1cm5JZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZm9ya2VkLnRvU3RyaW5nKCksIHNvdXJjZVNlc3Npb24udG9TdHJpbmcoKSwgJ2Zvcmsgc2hvdWxkIHByb2R1Y2UgYSBkaXN0aW5jdCBzZXNzaW9uIFVSSScpO1xuXHRcdFx0Y29uc3QgZm9ya2VkU3RyID0gZm9ya2VkLnRvU3RyaW5nKCk7XG5cblx0XHRcdGNvbnN0IGZvcmtlZFN0YXRlID0gc2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGZvcmtlZFN0cik7XG5cdFx0XHRhc3NlcnQub2soZm9ya2VkU3RhdGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmb3JrZWRTdGF0ZSEuY2hhbmdlc2V0cywgZGVmYXVsdENhdGFsb2d1ZShmb3JrZWRTdHIpKTtcblx0XHRcdC8vIE5vdGU6IHNvdXJjZS1zZXNzaW9uIHR1cm4gd2FzIHNlZWRlZCBkaXJlY3RseSBvbiBzdGF0ZSwgc28gdGhlXG5cdFx0XHQvLyByZWR1Y2VyIG5ldmVyIHNhdyBhIENoYXRUdXJuU3RhcnRlZC9Db21wbGV0ZSBwYWlyIGZvciBpdDtcblx0XHRcdC8vIHRoZSBmb3JrIGJyYW5jaCAoYWdlbnRTZXJ2aWNlLnRzOjU0OCBwYXRoKSBpcyBzdGlsbCBleGVyY2lzZWRcblx0XHRcdC8vIGJlY2F1c2UgYGNvbmZpZy5mb3JrYCBzdXJ2aXZlcyB0aGUgTDQ5My01MDQgdHVybi1jb3VudCBjaGVjay5cblx0XHRcdGFzc2VydC5vayhmb3JrZWRTdGF0ZSEudHVybnMubGVuZ3RoID4gMCwgJ2ZvcmtlZCBzZXNzaW9uIHNob3VsZCBjYXJyeSBjb3BpZWQgdHVybnMnKTtcblx0XHRcdGFzc2VydEJhY2tpbmdDaGFuZ2VzZXRzQ29tcHV0aW5nKHNlcnZpY2Uuc3RhdGVNYW5hZ2VyLCBmb3JrZWRTdHIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvdmlzaW9uYWwgc2Vzc2lvbiBtYXRlcmlhbGl6YXRpb24gcHJlc2VydmVzIGJvdGggaGFsdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQ3VzdG9tIG1vY2sgdGhhdCByZXR1cm5zIGBwcm92aXNpb25hbDogdHJ1ZWAgYW5kIGV4cG9zZXMgYSBob29rXG5cdFx0XHQvLyB0byBmaXJlIGBvbkRpZE1hdGVyaWFsaXplU2Vzc2lvbmAgbGF0ZXIsIHNpbXVsYXRpbmcgdGhlXG5cdFx0XHQvLyBcInNlc3Npb24gY3JlYXRlZCBpbi1tZW1vcnkgbm93LCBwZXJzaXN0ZWQgb24gZmlyc3Qgc2VuZE1lc3NhZ2VcIlxuXHRcdFx0Ly8gZmxvdyB0aGF0IENvcGlsb3QgQ0xJIC8gQ2xhdWRlIGFjdHVhbGx5IHVzZSBpbiBwcm9kdWN0aW9uLlxuXHRcdFx0Y2xhc3MgUHJvdmlzaW9uYWxNb2NrQWdlbnQgZXh0ZW5kcyBNb2NrQWdlbnQge1xuXHRcdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1hdGVyaWFsaXplID0gbmV3IEVtaXR0ZXI8eyBzZXNzaW9uOiBVUkk7IHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQ7IHByb2plY3Q6IHsgdXJpOiBVUkk7IGRpc3BsYXlOYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB9PigpO1xuXHRcdFx0XHRyZWFkb25seSBvbkRpZE1hdGVyaWFsaXplU2Vzc2lvbiA9IHRoaXMuX29uRGlkTWF0ZXJpYWxpemUuZXZlbnQ7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnPzogaW1wb3J0KCcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJykuSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8aW1wb3J0KCcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJykuSUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdD4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1cGVyLmNyZWF0ZVNlc3Npb24oY29uZmlnKTtcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5yZXN1bHQsIHByb3Zpc2lvbmFsOiB0cnVlIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0bWF0ZXJpYWxpemUoc2Vzc2lvbjogVVJJLCB3b3JraW5nRGlyZWN0b3J5PzogVVJJKTogdm9pZCB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRNYXRlcmlhbGl6ZS5maXJlKHsgc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLCBwcm9qZWN0OiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlzaW9uYWxBZ2VudCA9IG5ldyBQcm92aXNpb25hbE1vY2tBZ2VudCgnY29waWxvdCcpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm92aXNpb25hbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHByb3Zpc2lvbmFsQWdlbnQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXI6ICdjb3BpbG90JyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cblx0XHRcdC8vIFNuYXBzaG90IHRoZSBjcmVhdGUtdGltZSBzdGF0ZSBCRUZPUkUgbWF0ZXJpYWxpemF0aW9uLlxuXHRcdFx0Y29uc3Qgc3RhdGVCZWZvcmUgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cik7XG5cdFx0XHRhc3NlcnQub2soc3RhdGVCZWZvcmUsICdwcm92aXNpb25hbCBzZXNzaW9uIHNob3VsZCBhbHJlYWR5IGhhdmUgc3RhdGUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGVCZWZvcmUhLmNoYW5nZXNldHMsIGRlZmF1bHRDYXRhbG9ndWUoc2Vzc2lvblN0cikpO1xuXHRcdFx0YXNzZXJ0QmFja2luZ0NoYW5nZXNldHNDb21wdXRpbmcoc2VydmljZS5zdGF0ZU1hbmFnZXIsIHNlc3Npb25TdHIpO1xuXG5cdFx0XHQvLyBgbWFya1Nlc3Npb25QZXJzaXN0ZWRgIChjYWxsZWQgZnJvbSBgX29uRGlkTWF0ZXJpYWxpemVTZXNzaW9uYClcblx0XHRcdC8vIHJlLXNwcmVhZHMgZmxhdHRlbmVkIHNlc3Npb24gbWV0YWRhdGEuIEEgZnV0dXJlIGNoYW5nZSB0byB0aGF0IHNwcmVhZFxuXHRcdFx0Ly8gY291bGQgZHJvcCB0aGUgY2F0YWxvZ3VlIG9yIGludmFsaWRhdGUgdGhlIGJhY2tpbmcgc25hcHNob3RzO1xuXHRcdFx0Ly8gdGhlIHBvc3QtbWF0ZXJpYWxpemF0aW9uIHJlLWFzc2VydGlvbiBpcyB3aGF0IGNhdGNoZXMgaXQuXG5cdFx0XHRwcm92aXNpb25hbEFnZW50Lm1hdGVyaWFsaXplKHNlc3Npb24sIFVSSS5maWxlKCcvd2QnKSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlQWZ0ZXIgPSBzZXJ2aWNlLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cik7XG5cdFx0XHRhc3NlcnQub2soc3RhdGVBZnRlciwgJ21hdGVyaWFsaXplZCBzZXNzaW9uIHNob3VsZCBzdGlsbCBoYXZlIHN0YXRlJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlQWZ0ZXIhLmNoYW5nZXNldHMsIGRlZmF1bHRDYXRhbG9ndWUoc2Vzc2lvblN0cikpO1xuXHRcdFx0YXNzZXJ0QmFja2luZ0NoYW5nZXNldHNDb21wdXRpbmcoc2VydmljZS5zdGF0ZU1hbmFnZXIsIHNlc3Npb25TdHIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZVNlc3Npb24gd2l0aCBubyBwZXJzaXN0ZWQgZGlmZnMgc2VlZHMgYm90aCBoYWx2ZXMgaW4gY29tcHV0aW5nIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ2NvcGlsb3QnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgbG9jYWxBZ2VudC5jcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGxvY2FsQWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1swXS5zZXNzaW9uO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdFx0XHRsb2NhbEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnSGVsbG8nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBzZXNzaW9uLCByb2xlOiAnYXNzaXN0YW50JywgbWVzc2FnZUlkOiAnbXNnLTInLCBjb250ZW50OiAnSGknLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZpY2UucmVzdG9yZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsb2NhbFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlIS5jaGFuZ2VzZXRzLCBkZWZhdWx0Q2F0YWxvZ3VlKHNlc3Npb25TdHIpKTtcblx0XHRcdGFzc2VydEJhY2tpbmdDaGFuZ2VzZXRzQ29tcHV0aW5nKGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIsIHNlc3Npb25TdHIpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBR25CLFNBQVMsYUFBYSxjQUFjLGNBQWM7QUFDbEQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUE2QixvQkFBb0I7QUFDMUQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxjQUFjLG1DQUF3RiwwQkFBOFQ7QUFFN2EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0M7QUFDM0MsU0FBUyxpQkFBaUIsbUJBQW1CLHVCQUF1QixhQUFrQyxrQkFBa0IsZ0JBQWdCLGtCQUFrQixlQUFlLDRCQUE0Qiw0QkFBNEIsZ0JBQWdCLHVCQUF1QixXQUFXLGNBQWMscUJBQXFCLHNCQUFzQix5QkFBeUIs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QUFDbkUsWUFBTSxhQUFhLFFBQVEsU0FBUztBQUdwQyxZQUFNLGNBQWMsUUFBUSxhQUFhLGdCQUFnQixVQUFVO0FBQ25FLGFBQU8sR0FBRyxhQUFhLCtDQUErQztBQUN0RSxhQUFPLGdCQUFnQixZQUFhLFlBQVksaUJBQWlCLFVBQVUsQ0FBQztBQUM1RSx1Q0FBaUMsUUFBUSxjQUFjLFVBQVU7QUFNakUsdUJBQWlCLFlBQVksU0FBUyxJQUFJLEtBQUssS0FBSyxDQUFDO0FBRXJELFlBQU0sYUFBYSxRQUFRLGFBQWEsZ0JBQWdCLFVBQVU7QUFDbEUsYUFBTyxHQUFHLFlBQVksOENBQThDO0FBQ3BFLGFBQU8sZ0JBQWdCLFdBQVksWUFBWSxpQkFBaUIsVUFBVSxDQUFDO0FBQzNFLHVDQUFpQyxRQUFRLGNBQWMsVUFBVTtBQUFBLElBQ2xFLENBQUM7QUFFRCxTQUFLLCtFQUErRSxZQUFZO0FBQy9GLFlBQU0sWUFBWSxZQUFZLElBQUksTUFBTSxnQkFBZ0IsS0FBSyxVQUFVLENBQUM7QUFDeEUsWUFBTSxxQkFBcUIseUJBQXlCLFNBQVM7QUFDN0QsWUFBTSxhQUFhLElBQUksVUFBVSxTQUFTO0FBQzFDLGtCQUFZLElBQUksYUFBYSxNQUFNLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFDeEQsWUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJLGFBQWEsSUFBSSxlQUFlLEdBQUcsYUFBYSxvQkFBb0IsRUFBRSxlQUFlLE9BQVUsR0FBc0IscUJBQXFCLENBQUMsQ0FBQztBQUNyTCxtQkFBYSxpQkFBaUIsVUFBVTtBQUV4QyxZQUFNLEVBQUUsUUFBUSxJQUFJLE1BQU0sV0FBVyxjQUFjO0FBQ25ELFlBQU0sV0FBVyxNQUFNLFdBQVcsYUFBYTtBQUMvQyxZQUFNLGtCQUFrQixTQUFTLENBQUMsRUFBRTtBQUNwQyxZQUFNLGFBQWEsZ0JBQWdCLFNBQVM7QUFFNUMsaUJBQVcsa0JBQWtCO0FBQUEsUUFDNUIsRUFBRSxNQUFNLFdBQVcsU0FBUyxNQUFNLFFBQVEsV0FBVyxTQUFTLFNBQVMsU0FBUyxjQUFjLENBQUMsRUFBRTtBQUFBLFFBQ2pHLEVBQUUsTUFBTSxXQUFXLFNBQVMsTUFBTSxhQUFhLFdBQVcsU0FBUyxTQUFTLE1BQU0sY0FBYyxDQUFDLEVBQUU7QUFBQSxNQUNwRztBQUVBLFlBQU0sYUFBYSxlQUFlLGVBQWU7QUFFakQsWUFBTSxRQUFRLGFBQWEsYUFBYSxnQkFBZ0IsVUFBVTtBQUNsRSxhQUFPLEdBQUcsS0FBSztBQUNmLGFBQU8sZ0JBQWdCLE1BQU8sWUFBWSxpQkFBaUIsVUFBVSxDQUFDO0FBQ3RFLHVDQUFpQyxhQUFhLGNBQWMsVUFBVTtBQUFBLElBQ3ZFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJzZXR1cCIsICJzZXNzaW9uIl0KfQo=
