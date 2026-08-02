import assert from "assert";
import { PassThrough } from "stream";
import { Emitter } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { sep } from "../../../../../base/common/path.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { AgentSession } from "../../../common/agentService.js";
import { buildDefaultChatUri } from "../../../common/state/sessionState.js";
import { ISessionDataService } from "../../../common/sessionDataService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { IAgentHostGitHubEndpointService } from "../../../node/agentHostGitHubEndpointService.js";
import { IAgentSdkDownloader } from "../../../node/agentSdkDownloader.js";
import { CodexAgent } from "../../../node/codex/codexAgent.js";
import { CodexAppServerClient } from "../../../node/codex/codexAppServerClient.js";
import { ICodexProxyService } from "../../../node/codex/codexProxyService.js";
import { ICopilotApiService } from "../../../node/shared/copilotApiService.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
import { AgentHostCodexMultiRootEnabledConfigKey } from "../../../common/agentHostSchema.js";
import { CodexSessionConfigKey } from "../../../common/codexSessionConfigKeys.js";
import { createSessionDataService, TestSessionDatabase } from "../../common/sessionTestHelpers.js";
function createTestPeer() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const onExit = new Emitter();
  const onceExitListeners = [];
  const fireExit = () => {
    const event = { code: 0, signal: null };
    onExit.fire(event);
    for (const listener of onceExitListeners.splice(0)) {
      listener(event);
    }
  };
  const transport = {
    stdin,
    stdout,
    kill: () => true,
    onExit: onExit.event,
    onExitOnce: (listener) => onceExitListeners.push(listener)
  };
  return {
    transport,
    outbound: stdin,
    push: (message) => stdout.write(JSON.stringify(message) + "\n"),
    exit: fireExit,
    dispose: () => {
      onceExitListeners.length = 0;
      onExit.dispose();
      stdin.destroy();
      stdout.destroy();
    }
  };
}
function readNextRequest(stream) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Codex request"));
    }, 1e3);
    const onData = (chunk) => {
      cleanup();
      try {
        resolve(JSON.parse(typeof chunk === "string" ? chunk : chunk.toString("utf8")));
      } catch (err) {
        reject(err);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off("data", onData);
    };
    stream.once("data", onData);
  });
}
class TestCodexConfigurationService extends AgentConfigurationService {
  constructor(stateManager, logService, sessionConfig) {
    super(stateManager, logService);
    this.sessionConfig = sessionConfig;
  }
  setSessionConfig(sessionConfig) {
    this.sessionConfig = sessionConfig;
  }
  getSessionConfigValues() {
    return this.sessionConfig ? { ...this.sessionConfig } : void 0;
  }
}
async function createAgent(disposables, options = {}) {
  const models = [{ id: "gpt-test", name: "GPT Test", supported_endpoints: ["/responses"] }];
  const instantiationService = new TestInstantiationService();
  const logService = new NullLogService();
  const stateManager = disposables.add(new AgentHostStateManager(logService));
  const configurationService = disposables.add(new TestCodexConfigurationService(stateManager, logService, options.sessionConfig));
  configurationService.updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: options.multiRootEnabled });
  instantiationService.stub(ISessionDataService, createSessionDataService(options.database));
  instantiationService.stub(ICopilotApiService, { _serviceBrand: void 0, models: async () => models });
  instantiationService.stub(ICodexProxyService, { _serviceBrand: void 0 });
  instantiationService.stub(IAgentConfigurationService, configurationService);
  instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
  instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: void 0, isSdkResolvableWithoutDownload: async () => true });
  instantiationService.stub(IProductService, { _serviceBrand: void 0, version: "1.0.0-test" });
  instantiationService.stub(INativeEnvironmentService, { userHome: URI.file("/tmp") });
  instantiationService.stub(ILogService, logService);
  const agent = disposables.add(instantiationService.createInstance(CodexAgent));
  await agent.authenticate(agent.getProtectedResources()[0].resource, "test-token");
  await agent.refreshModels();
  return agent;
}
async function assertPrewarmEvictedOnSend(disposables, completePrewarmBeforeSend) {
  const agent = await createAgent(disposables);
  const peer = disposables.add(createTestPeer());
  const client = new CodexAppServerClient(peer.transport);
  agent["_connection"] = {
    kind: "ready",
    client,
    usageSource: "github",
    child: { kill: () => true }
  };
  agent["_refreshSkillHookCustomizations"] = async () => {
  };
  agent["_refreshSkillExtraRoots"] = async () => {
  };
  const folder = URI.file("/repo/folder");
  const worktree = URI.file("/repo/worktree");
  const { session } = await agent.createSession({ workingDirectories: [folder], model: { id: "gpt-test" } });
  const entry = agent["_sessions"].get(AgentSession.id(session));
  const folderStart = await readNextRequest(peer.outbound);
  try {
    if (completePrewarmBeforeSend) {
      peer.push({ id: folderStart.id, result: { thread: { id: "thread-folder" } } });
      await entry.materializePromise;
    }
    const send = agent.chats.sendMessage(
      URI.parse(buildDefaultChatUri(session)),
      "hello",
      [worktree],
      void 0,
      "turn-1"
    );
    if (!completePrewarmBeforeSend) {
      peer.push({ id: folderStart.id, result: { thread: { id: "thread-folder" } } });
    }
    const unsubscribe = await readNextRequest(peer.outbound);
    peer.push({ id: unsubscribe.id, result: {} });
    const worktreeStart = await readNextRequest(peer.outbound);
    peer.push({ id: worktreeStart.id, result: { thread: { id: "thread-worktree" } } });
    const turnStart = await readNextRequest(peer.outbound);
    peer.push({ id: turnStart.id, result: {} });
    await send;
    assert.deepStrictEqual({
      requests: [
        { method: folderStart.method, cwd: folderStart.params.cwd },
        { method: unsubscribe.method, threadId: unsubscribe.params.threadId },
        { method: worktreeStart.method, cwd: worktreeStart.params.cwd },
        { method: turnStart.method, threadId: turnStart.params.threadId }
      ],
      threadId: entry.threadId,
      workingDirectory: entry.workingDirectory?.fsPath,
      folderThreadRouted: agent["_sessionIdByThreadId"].has("thread-folder"),
      worktreeThreadRouted: agent["_sessionIdByThreadId"].has("thread-worktree")
    }, {
      requests: [
        { method: "thread/start", cwd: folder.fsPath },
        { method: "thread/unsubscribe", threadId: "thread-folder" },
        { method: "thread/start", cwd: worktree.fsPath },
        { method: "turn/start", threadId: "thread-worktree" }
      ],
      threadId: "thread-worktree",
      workingDirectory: worktree.fsPath,
      folderThreadRouted: false,
      worktreeThreadRouted: true
    });
  } finally {
    peer.exit();
  }
}
suite("CodexAgent prewarm eviction", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("evicts a completed folder prewarm when the first send resolves to a worktree", async () => {
    await assertPrewarmEvictedOnSend(disposables, true);
  });
  test("waits for and evicts an in-flight folder prewarm when the first send resolves to a worktree", async () => {
    await assertPrewarmEvictedOnSend(disposables, false);
  });
  test("multi-root start and turn separate workspace roots from additional writable directories", async () => {
    const additionalDirectory = URI.file("/manual-write").fsPath;
    const sessionUri = AgentSession.uri("codex", "multi-root");
    const agent = await createAgent(disposables, {
      multiRootEnabled: true,
      sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory, `${additionalDirectory}${sep}`] }
    });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const duplicateRepoA = URI.file(`${repoA.fsPath}${sep}`);
    const caseVariantRepoA = URI.file(repoA.fsPath.toUpperCase());
    try {
      const workingDirectories = [repoA, duplicateRepoA, ...isWindows ? [caseVariantRepoA] : [], repoB];
      const { session } = await agent.createSession({ session: sessionUri, workingDirectories, model: { id: "gpt-test" } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" }, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
      await entry.materializePromise;
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", workingDirectories, void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      const configurationService = agent["_configurationService"];
      assert.ok(configurationService instanceof TestCodexConfigurationService);
      configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: "full-access" });
      const fullAccess = agent["_turnStartOptions"](entry, "gpt-test");
      configurationService.setSessionConfig({ [CodexSessionConfigKey.SandboxMode]: "read-only" });
      const readOnly = agent["_turnStartOptions"](entry, "gpt-test");
      assert.deepStrictEqual({
        start: { cwd: start.params.cwd, runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots },
        turn: {
          runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
          sandboxPolicy: turn.params.sandboxPolicy
        },
        fullAccess: {
          runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
          sandboxPolicy: fullAccess.sandboxPolicy
        },
        readOnly: {
          runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
          sandboxPolicy: readOnly.sandboxPolicy
        }
      }, {
        start: { cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] },
        turn: {
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [repoA.fsPath, repoB.fsPath, additionalDirectory],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          }
        },
        fullAccess: {
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          sandboxPolicy: { type: "dangerFullAccess" }
        },
        readOnly: {
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath],
          sandboxPolicy: { type: "readOnly", networkAccess: false }
        }
      });
    } finally {
      peer.exit();
    }
  });
  test("disabled multi-root preserves the existing additional-directory payload", async () => {
    const additionalDirectory = URI.file("/manual-write").fsPath;
    const sessionUri = AgentSession.uri("codex", "single-root");
    const agent = await createAgent(disposables, {
      sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] }
    });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    try {
      const { session } = await agent.createSession({ session: sessionUri, workingDirectories: [repoA, repoB], model: { id: "gpt-test" } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repoA], void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      assert.deepStrictEqual({
        startRuntimeWorkspaceRoots: start.params.runtimeWorkspaceRoots,
        turnRuntimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
        writableRoots: turn.params.sandboxPolicy?.type === "workspaceWrite" ? turn.params.sandboxPolicy.writableRoots : void 0
      }, {
        startRuntimeWorkspaceRoots: void 0,
        turnRuntimeWorkspaceRoots: [repoA.fsPath, additionalDirectory],
        writableRoots: [repoA.fsPath, additionalDirectory]
      });
    } finally {
      peer.exit();
    }
  });
  test("enabled multi-root preserves single-folder protocol and sandbox behavior", async () => {
    const additionalDirectory = `${URI.file("/manual-write").fsPath}${sep}`;
    const sessionUri = AgentSession.uri("codex", "enabled-single-root");
    const agent = await createAgent(disposables, {
      multiRootEnabled: true,
      sessionConfig: { [CodexSessionConfigKey.AdditionalDirectories]: [additionalDirectory] }
    });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repo = URI.file("/repo");
    try {
      const { session } = await agent.createSession({ session: sessionUri, workingDirectories: [repo], model: { id: "gpt-test" } });
      const entry = agent["_sessions"].get(AgentSession.id(session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "thread" } } });
      await entry.materializePromise;
      const send = agent.chats.sendMessage(URI.parse(buildDefaultChatUri(session)), "hello", [repo], void 0, "turn-1");
      const turn = await readNextRequest(peer.outbound);
      peer.push({ id: turn.id, result: {} });
      await send;
      const configurationService = agent["_configurationService"];
      assert.ok(configurationService instanceof TestCodexConfigurationService);
      configurationService.setSessionConfig({ [CodexSessionConfigKey.PermissionsPreset]: "full-access" });
      const fullAccess = agent["_turnStartOptions"](entry, "gpt-test");
      configurationService.setSessionConfig({ [CodexSessionConfigKey.SandboxMode]: "read-only" });
      const readOnly = agent["_turnStartOptions"](entry, "gpt-test");
      assert.deepStrictEqual({
        start: {
          cwd: start.params.cwd,
          runtimeWorkspaceRoots: start.params.runtimeWorkspaceRoots
        },
        turn: {
          runtimeWorkspaceRoots: turn.params.runtimeWorkspaceRoots,
          sandboxPolicy: turn.params.sandboxPolicy
        },
        fullAccess: {
          runtimeWorkspaceRoots: fullAccess.runtimeWorkspaceRoots,
          sandboxPolicy: fullAccess.sandboxPolicy
        },
        readOnly: {
          runtimeWorkspaceRoots: readOnly.runtimeWorkspaceRoots,
          sandboxPolicy: readOnly.sandboxPolicy
        }
      }, {
        start: {
          cwd: repo.fsPath,
          runtimeWorkspaceRoots: void 0
        },
        turn: {
          runtimeWorkspaceRoots: [repo.fsPath, additionalDirectory],
          sandboxPolicy: {
            type: "workspaceWrite",
            writableRoots: [repo.fsPath, additionalDirectory],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false
          }
        },
        fullAccess: {
          runtimeWorkspaceRoots: void 0,
          sandboxPolicy: { type: "dangerFullAccess" }
        },
        readOnly: {
          runtimeWorkspaceRoots: void 0,
          sandboxPolicy: { type: "readOnly", networkAccess: false }
        }
      });
    } finally {
      peer.exit();
    }
  });
  test("fork inherits the source workspace roots instead of requested replacements", async () => {
    const agent = await createAgent(disposables, { multiRootEnabled: true });
    const peer = disposables.add(createTestPeer());
    const client = new CodexAppServerClient(peer.transport);
    agent["_connection"] = {
      kind: "ready",
      client,
      usageSource: "github",
      child: { kill: () => true }
    };
    agent["_refreshSkillHookCustomizations"] = async () => {
    };
    agent["_refreshSkillExtraRoots"] = async () => {
    };
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const requestedA = URI.file("/requested-a");
    const requestedB = URI.file("/requested-b");
    try {
      const source = await agent.createSession({ workingDirectories: [repoA, repoB], model: { id: "gpt-test" } });
      const sourceEntry = agent["_sessions"].get(AgentSession.id(source.session));
      const start = await readNextRequest(peer.outbound);
      peer.push({ id: start.id, result: { thread: { id: "source-thread" }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
      await sourceEntry.materializePromise;
      const forkPromise = agent.createSession({
        workingDirectories: [requestedA, requestedB],
        fork: { session: source.session, turnId: "turn-1", turnIndex: 0 }
      });
      const read = await readNextRequest(peer.outbound);
      peer.push({
        id: read.id,
        result: {
          thread: {
            id: "source-thread",
            cwd: repoA.fsPath,
            turns: [{ id: "turn-1" }]
          }
        }
      });
      const fork = await readNextRequest(peer.outbound);
      peer.push({
        id: fork.id,
        result: {
          thread: { id: "fork-thread", cwd: repoA.fsPath },
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
        }
      });
      const forked = await forkPromise;
      const forkedEntry = agent["_sessions"].get(AgentSession.id(forked.session));
      assert.deepStrictEqual({
        request: {
          method: fork.method,
          cwd: fork.params.cwd,
          runtimeWorkspaceRoots: fork.params.runtimeWorkspaceRoots
        },
        workingDirectories: forkedEntry.workingDirectories?.map((directory) => directory.fsPath)
      }, {
        request: {
          method: "thread/fork",
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
        },
        workingDirectories: [repoA.fsPath, repoB.fsPath]
      });
    } finally {
      peer.exit();
    }
  });
  test("cold resume restores persisted workspace roots", async () => {
    const database = new TestSessionDatabase();
    const repoA = URI.file("/repo-a");
    const repoB = URI.file("/repo-b");
    const agentA = await createAgent(disposables, { multiRootEnabled: true, database });
    const peerA = disposables.add(createTestPeer());
    agentA["_connection"] = {
      kind: "ready",
      client: new CodexAppServerClient(peerA.transport),
      usageSource: "github",
      child: { kill: () => true }
    };
    agentA["_refreshSkillHookCustomizations"] = async () => {
    };
    agentA["_refreshSkillExtraRoots"] = async () => {
    };
    let peerB;
    try {
      const created = await agentA.createSession({ workingDirectories: [repoA, repoB], model: { id: "gpt-test" } });
      const entry = agentA["_sessions"].get(AgentSession.id(created.session));
      const start = await readNextRequest(peerA.outbound);
      peerA.push({ id: start.id, result: { thread: { id: "thread" }, cwd: repoA.fsPath, runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath] } });
      await entry.materializePromise;
      const firstSend = agentA.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), "hello", [repoA, repoB], void 0, "turn-1");
      const firstTurn = await readNextRequest(peerA.outbound);
      peerA.push({ id: firstTurn.id, result: {} });
      await firstSend;
      await new Promise((resolve) => setImmediate(resolve));
      const canonicalOverlay = await agentA["_metadataStore"].read(AgentSession.uri("codex", "thread"));
      const agentB = await createAgent(disposables, { multiRootEnabled: true, database });
      peerB = disposables.add(createTestPeer());
      agentB["_connection"] = {
        kind: "ready",
        client: new CodexAppServerClient(peerB.transport),
        usageSource: "github",
        child: { kill: () => true }
      };
      agentB["_refreshSkillHookCustomizations"] = async () => {
      };
      agentB["_refreshSkillExtraRoots"] = async () => {
      };
      const metadataPromise = agentB.getSessionMetadata(created.session);
      const read = await readNextRequest(peerB.outbound);
      peerB.push({
        id: read.id,
        result: {
          thread: {
            id: "thread",
            cwd: repoA.fsPath,
            modelProvider: "vscode-proxy",
            turns: []
          }
        }
      });
      const metadata = await metadataPromise;
      const resumedSend = agentB.chats.sendMessage(URI.parse(buildDefaultChatUri(created.session)), "again", void 0, void 0, "turn-2");
      const resume = await readNextRequest(peerB.outbound);
      peerB.push({
        id: resume.id,
        result: {
          thread: { id: "thread", cwd: repoA.fsPath },
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
        }
      });
      const resumedTurn = await readNextRequest(peerB.outbound);
      peerB.push({ id: resumedTurn.id, result: {} });
      await resumedSend;
      assert.deepStrictEqual({
        canonicalOverlay: canonicalOverlay.workingDirectories?.map((directory) => directory.fsPath),
        metadata: metadata?.workingDirectories?.map((directory) => directory.fsPath),
        resume: {
          cwd: resume.params.cwd,
          runtimeWorkspaceRoots: resume.params.runtimeWorkspaceRoots
        },
        turnRuntimeWorkspaceRoots: resumedTurn.params.runtimeWorkspaceRoots
      }, {
        canonicalOverlay: [repoA.fsPath, repoB.fsPath],
        metadata: [repoA.fsPath, repoB.fsPath],
        resume: {
          cwd: repoA.fsPath,
          runtimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
        },
        turnRuntimeWorkspaceRoots: [repoA.fsPath, repoB.fsPath]
      });
    } finally {
      peerB?.exit();
      peerA.exit();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29kZXgvY29kZXhQcmV3YXJtRXZpY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFBhc3NUaHJvdWdoIH0gZnJvbSAnc3RyZWFtJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgc2VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2RrRG93bmxvYWRlciB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRTZGtEb3dubG9hZGVyLmpzJztcbmltcG9ydCB7IENvZGV4QWdlbnQgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4QWdlbnQuanMnO1xuaW1wb3J0IHsgQ29kZXhBcHBTZXJ2ZXJDbGllbnQsIHR5cGUgSUNvZGV4QXBwU2VydmVyVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEFwcFNlcnZlckNsaWVudC5qcyc7XG5pbXBvcnQgeyBJQ29kZXhQcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4UHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgQ29kZXhTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvZGV4U2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHR5cGUgeyBTYW5kYm94UG9saWN5IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvU2FuZGJveFBvbGljeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UsIFRlc3RTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcblxuaW50ZXJmYWNlIElUZXN0V2lyZVJlcXVlc3Qge1xuXHRyZWFkb25seSBpZDogbnVtYmVyO1xuXHRyZWFkb25seSBtZXRob2Q6IHN0cmluZztcblx0cmVhZG9ubHkgcGFyYW1zOiB7XG5cdFx0cmVhZG9ubHkgY3dkPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHRocmVhZElkPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHJ1bnRpbWVXb3Jrc3BhY2VSb290cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IHNhbmRib3hQb2xpY3k/OiBTYW5kYm94UG9saWN5O1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVRlc3RQZWVyIHtcblx0cmVhZG9ubHkgdHJhbnNwb3J0OiBJQ29kZXhBcHBTZXJ2ZXJUcmFuc3BvcnQ7XG5cdHJlYWRvbmx5IG91dGJvdW5kOiBQYXNzVGhyb3VnaDtcblx0cHVzaChtZXNzYWdlOiBvYmplY3QpOiB2b2lkO1xuXHRleGl0KCk6IHZvaWQ7XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdFBlZXIoKTogSVRlc3RQZWVyIHtcblx0Y29uc3Qgc3RkaW4gPSBuZXcgUGFzc1Rocm91Z2goKTtcblx0Y29uc3Qgc3Rkb3V0ID0gbmV3IFBhc3NUaHJvdWdoKCk7XG5cdGNvbnN0IG9uRXhpdCA9IG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY29kZTogbnVtYmVyIHwgbnVsbDsgcmVhZG9ubHkgc2lnbmFsOiBOb2RlSlMuU2lnbmFscyB8IG51bGwgfT4oKTtcblx0Y29uc3Qgb25jZUV4aXRMaXN0ZW5lcnM6ICgoZXZlbnQ6IHsgcmVhZG9ubHkgY29kZTogbnVtYmVyIHwgbnVsbDsgcmVhZG9ubHkgc2lnbmFsOiBOb2RlSlMuU2lnbmFscyB8IG51bGwgfSkgPT4gdm9pZClbXSA9IFtdO1xuXHRjb25zdCBmaXJlRXhpdCA9ICgpID0+IHtcblx0XHRjb25zdCBldmVudCA9IHsgY29kZTogMCwgc2lnbmFsOiBudWxsIH07XG5cdFx0b25FeGl0LmZpcmUoZXZlbnQpO1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2Ygb25jZUV4aXRMaXN0ZW5lcnMuc3BsaWNlKDApKSB7XG5cdFx0XHRsaXN0ZW5lcihldmVudCk7XG5cdFx0fVxuXHR9O1xuXHRjb25zdCB0cmFuc3BvcnQ6IElDb2RleEFwcFNlcnZlclRyYW5zcG9ydCA9IHtcblx0XHRzdGRpbixcblx0XHRzdGRvdXQsXG5cdFx0a2lsbDogKCkgPT4gdHJ1ZSxcblx0XHRvbkV4aXQ6IG9uRXhpdC5ldmVudCxcblx0XHRvbkV4aXRPbmNlOiBsaXN0ZW5lciA9PiBvbmNlRXhpdExpc3RlbmVycy5wdXNoKGxpc3RlbmVyKSxcblx0fTtcblx0cmV0dXJuIHtcblx0XHR0cmFuc3BvcnQsXG5cdFx0b3V0Ym91bmQ6IHN0ZGluLFxuXHRcdHB1c2g6IG1lc3NhZ2UgPT4gc3Rkb3V0LndyaXRlKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpICsgJ1xcbicpLFxuXHRcdGV4aXQ6IGZpcmVFeGl0LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdG9uY2VFeGl0TGlzdGVuZXJzLmxlbmd0aCA9IDA7XG5cdFx0XHRvbkV4aXQuZGlzcG9zZSgpO1xuXHRcdFx0c3RkaW4uZGVzdHJveSgpO1xuXHRcdFx0c3Rkb3V0LmRlc3Ryb3koKTtcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZWFkTmV4dFJlcXVlc3Qoc3RyZWFtOiBQYXNzVGhyb3VnaCk6IFByb21pc2U8SVRlc3RXaXJlUmVxdWVzdD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNsZWFudXAoKTtcblx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBDb2RleCByZXF1ZXN0JykpO1xuXHRcdH0sIDFfMDAwKTtcblx0XHRjb25zdCBvbkRhdGEgPSAoY2h1bms6IEJ1ZmZlciB8IHN0cmluZykgPT4ge1xuXHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzb2x2ZShKU09OLnBhcnNlKHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycgPyBjaHVuayA6IGNodW5rLnRvU3RyaW5nKCd1dGY4JykpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRzdHJlYW0ub2ZmKCdkYXRhJywgb25EYXRhKTtcblx0XHR9O1xuXHRcdHN0cmVhbS5vbmNlKCdkYXRhJywgb25EYXRhKTtcblx0fSk7XG59XG5cbmludGVyZmFjZSBJQ3JlYXRlQWdlbnRPcHRpb25zIHtcblx0cmVhZG9ubHkgbXVsdGlSb290RW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNlc3Npb25Db25maWc/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10+Pjtcblx0cmVhZG9ubHkgZGF0YWJhc2U/OiBUZXN0U2Vzc2lvbkRhdGFiYXNlO1xufVxuXG5jbGFzcyBUZXN0Q29kZXhDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRsb2dTZXJ2aWNlOiBOdWxsTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHNlc3Npb25Db25maWc6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCBzdHJpbmcgfCByZWFkb25seSBzdHJpbmdbXT4+IHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHRzdXBlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0c2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uQ29uZmlnOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10+Pik6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbkNvbmZpZyA9IHNlc3Npb25Db25maWc7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uQ29uZmlnVmFsdWVzKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uQ29uZmlnID8geyAuLi50aGlzLnNlc3Npb25Db25maWcgfSA6IHVuZGVmaW5lZDtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVBZ2VudChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgb3B0aW9uczogSUNyZWF0ZUFnZW50T3B0aW9ucyA9IHt9KTogUHJvbWlzZTxDb2RleEFnZW50PiB7XG5cdGNvbnN0IG1vZGVscyA9IFt7IGlkOiAnZ3B0LXRlc3QnLCBuYW1lOiAnR1BUIFRlc3QnLCBzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy9yZXNwb25zZXMnXSB9XSBhcyBDQ0FNb2RlbFtdO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q29kZXhDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIG9wdGlvbnMuc2Vzc2lvbkNvbmZpZykpO1xuXHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IG9wdGlvbnMubXVsdGlSb290RW5hYmxlZCB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uob3B0aW9ucy5kYXRhYmFzZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb3BpbG90QXBpU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG1vZGVsczogYXN5bmMgKCkgPT4gbW9kZWxzIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb2RleFByb3h5U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFNka0Rvd25sb2FkZXIsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBpc1Nka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQ6IGFzeW5jICgpID0+IHRydWUgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgdmVyc2lvbjogJzEuMC4wLXRlc3QnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCB7IHVzZXJIb21lOiBVUkkuZmlsZSgnL3RtcCcpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZXhBZ2VudCkpO1xuXHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoYWdlbnQuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzKClbMF0ucmVzb3VyY2UsICd0ZXN0LXRva2VuJyk7XG5cdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblx0cmV0dXJuIGFnZW50O1xufVxuXG5hc3luYyBmdW5jdGlvbiBhc3NlcnRQcmV3YXJtRXZpY3RlZE9uU2VuZChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgY29tcGxldGVQcmV3YXJtQmVmb3JlU2VuZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzKTtcblx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRjbGllbnQsXG5cdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0fSBhcyBuZXZlcjtcblx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cblx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvL2ZvbGRlcicpO1xuXHRjb25zdCB3b3JrdHJlZSA9IFVSSS5maWxlKCcvcmVwby93b3JrdHJlZScpO1xuXHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtmb2xkZXJdLCBtb2RlbDogeyBpZDogJ2dwdC10ZXN0JyB9IH0pO1xuXHRjb25zdCBlbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSE7XG5cdGNvbnN0IGZvbGRlclN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXG5cdHRyeSB7XG5cdFx0aWYgKGNvbXBsZXRlUHJld2FybUJlZm9yZVNlbmQpIHtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBmb2xkZXJTdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZC1mb2xkZXInIH0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZW5kID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoXG5cdFx0XHRVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0W3dvcmt0cmVlXSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCd0dXJuLTEnLFxuXHRcdCk7XG5cblx0XHRpZiAoIWNvbXBsZXRlUHJld2FybUJlZm9yZVNlbmQpIHtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBmb2xkZXJTdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZC1mb2xkZXInIH0gfSB9KTtcblx0XHR9XG5cdFx0Y29uc3QgdW5zdWJzY3JpYmUgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHVuc3Vic2NyaWJlLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdGNvbnN0IHdvcmt0cmVlU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHdvcmt0cmVlU3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQtd29ya3RyZWUnIH0gfSB9KTtcblx0XHRjb25zdCB0dXJuU3RhcnQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0cGVlci5wdXNoKHsgaWQ6IHR1cm5TdGFydC5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRhd2FpdCBzZW5kO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXF1ZXN0czogW1xuXHRcdFx0XHR7IG1ldGhvZDogZm9sZGVyU3RhcnQubWV0aG9kLCBjd2Q6IGZvbGRlclN0YXJ0LnBhcmFtcy5jd2QgfSxcblx0XHRcdFx0eyBtZXRob2Q6IHVuc3Vic2NyaWJlLm1ldGhvZCwgdGhyZWFkSWQ6IHVuc3Vic2NyaWJlLnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0XHR7IG1ldGhvZDogd29ya3RyZWVTdGFydC5tZXRob2QsIGN3ZDogd29ya3RyZWVTdGFydC5wYXJhbXMuY3dkIH0sXG5cdFx0XHRcdHsgbWV0aG9kOiB0dXJuU3RhcnQubWV0aG9kLCB0aHJlYWRJZDogdHVyblN0YXJ0LnBhcmFtcy50aHJlYWRJZCB9LFxuXHRcdFx0XSxcblx0XHRcdHRocmVhZElkOiBlbnRyeS50aHJlYWRJZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IGVudHJ5LndvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aCxcblx0XHRcdGZvbGRlclRocmVhZFJvdXRlZDogYWdlbnRbJ19zZXNzaW9uSWRCeVRocmVhZElkJ10uaGFzKCd0aHJlYWQtZm9sZGVyJyksXG5cdFx0XHR3b3JrdHJlZVRocmVhZFJvdXRlZDogYWdlbnRbJ19zZXNzaW9uSWRCeVRocmVhZElkJ10uaGFzKCd0aHJlYWQtd29ya3RyZWUnKSxcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0czogW1xuXHRcdFx0XHR7IG1ldGhvZDogJ3RocmVhZC9zdGFydCcsIGN3ZDogZm9sZGVyLmZzUGF0aCB9LFxuXHRcdFx0XHR7IG1ldGhvZDogJ3RocmVhZC91bnN1YnNjcmliZScsIHRocmVhZElkOiAndGhyZWFkLWZvbGRlcicgfSxcblx0XHRcdFx0eyBtZXRob2Q6ICd0aHJlYWQvc3RhcnQnLCBjd2Q6IHdvcmt0cmVlLmZzUGF0aCB9LFxuXHRcdFx0XHR7IG1ldGhvZDogJ3R1cm4vc3RhcnQnLCB0aHJlYWRJZDogJ3RocmVhZC13b3JrdHJlZScgfSxcblx0XHRcdF0sXG5cdFx0XHR0aHJlYWRJZDogJ3RocmVhZC13b3JrdHJlZScsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrdHJlZS5mc1BhdGgsXG5cdFx0XHRmb2xkZXJUaHJlYWRSb3V0ZWQ6IGZhbHNlLFxuXHRcdFx0d29ya3RyZWVUaHJlYWRSb3V0ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0gZmluYWxseSB7XG5cdFx0cGVlci5leGl0KCk7XG5cdH1cbn1cblxuc3VpdGUoJ0NvZGV4QWdlbnQgcHJld2FybSBldmljdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2V2aWN0cyBhIGNvbXBsZXRlZCBmb2xkZXIgcHJld2FybSB3aGVuIHRoZSBmaXJzdCBzZW5kIHJlc29sdmVzIHRvIGEgd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0UHJld2FybUV2aWN0ZWRPblNlbmQoZGlzcG9zYWJsZXMsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYW5kIGV2aWN0cyBhbiBpbi1mbGlnaHQgZm9sZGVyIHByZXdhcm0gd2hlbiB0aGUgZmlyc3Qgc2VuZCByZXNvbHZlcyB0byBhIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGFzc2VydFByZXdhcm1FdmljdGVkT25TZW5kKGRpc3Bvc2FibGVzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXJvb3Qgc3RhcnQgYW5kIHR1cm4gc2VwYXJhdGUgd29ya3NwYWNlIHJvb3RzIGZyb20gYWRkaXRpb25hbCB3cml0YWJsZSBkaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZGRpdGlvbmFsRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy9tYW51YWwtd3JpdGUnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ211bHRpLXJvb3QnKTtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRtdWx0aVJvb3RFbmFibGVkOiB0cnVlLFxuXHRcdFx0c2Vzc2lvbkNvbmZpZzogeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFkZGl0aW9uYWxEaXJlY3Rvcmllc106IFthZGRpdGlvbmFsRGlyZWN0b3J5LCBgJHthZGRpdGlvbmFsRGlyZWN0b3J5fSR7c2VwfWBdIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGVlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlci50cmFuc3BvcnQpO1xuXHRcdGFnZW50WydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudCxcblx0XHRcdHVzYWdlU291cmNlOiAnZ2l0aHViJyxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0Y29uc3QgcmVwb0EgPSBVUkkuZmlsZSgnL3JlcG8tYScpO1xuXHRcdGNvbnN0IHJlcG9CID0gVVJJLmZpbGUoJy9yZXBvLWInKTtcblx0XHRjb25zdCBkdXBsaWNhdGVSZXBvQSA9IFVSSS5maWxlKGAke3JlcG9BLmZzUGF0aH0ke3NlcH1gKTtcblx0XHRjb25zdCBjYXNlVmFyaWFudFJlcG9BID0gVVJJLmZpbGUocmVwb0EuZnNQYXRoLnRvVXBwZXJDYXNlKCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IFtyZXBvQSwgZHVwbGljYXRlUmVwb0EsIC4uLihpc1dpbmRvd3MgPyBbY2FzZVZhcmlhbnRSZXBvQV0gOiBbXSksIHJlcG9CXTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb246IHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcmllcywgbW9kZWw6IHsgaWQ6ICdncHQtdGVzdCcgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkJyB9LCBydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3Qgc2VuZCA9IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSwgJ2hlbGxvJywgd29ya2luZ0RpcmVjdG9yaWVzLCB1bmRlZmluZWQsICd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmQ7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFnZW50WydfY29uZmlndXJhdGlvblNlcnZpY2UnXTtcblx0XHRcdGFzc2VydC5vayhjb25maWd1cmF0aW9uU2VydmljZSBpbnN0YW5jZW9mIFRlc3RDb2RleENvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFNlc3Npb25Db25maWcoeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XTogJ2Z1bGwtYWNjZXNzJyB9KTtcblx0XHRcdGNvbnN0IGZ1bGxBY2Nlc3MgPSBhZ2VudFsnX3R1cm5TdGFydE9wdGlvbnMnXShlbnRyeSwgJ2dwdC10ZXN0Jyk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRTZXNzaW9uQ29uZmlnKHsgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5TYW5kYm94TW9kZV06ICdyZWFkLW9ubHknIH0pO1xuXHRcdFx0Y29uc3QgcmVhZE9ubHkgPSBhZ2VudFsnX3R1cm5TdGFydE9wdGlvbnMnXShlbnRyeSwgJ2dwdC10ZXN0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGFydDogeyBjd2Q6IHN0YXJ0LnBhcmFtcy5jd2QsIHJ1bnRpbWVXb3Jrc3BhY2VSb290czogc3RhcnQucGFyYW1zLnJ1bnRpbWVXb3Jrc3BhY2VSb290cyB9LFxuXHRcdFx0XHR0dXJuOiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiB0dXJuLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogdHVybi5wYXJhbXMuc2FuZGJveFBvbGljeSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZnVsbEFjY2Vzczoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogZnVsbEFjY2Vzcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogZnVsbEFjY2Vzcy5zYW5kYm94UG9saWN5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZWFkT25seToge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogcmVhZE9ubHkucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHJlYWRPbmx5LnNhbmRib3hQb2xpY3ksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXJ0OiB7IGN3ZDogcmVwb0EuZnNQYXRoLCBydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0gfSxcblx0XHRcdFx0dHVybjoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnd29ya3NwYWNlV3JpdGUnLFxuXHRcdFx0XHRcdFx0d3JpdGFibGVSb290czogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoLCBhZGRpdGlvbmFsRGlyZWN0b3J5XSxcblx0XHRcdFx0XHRcdG5ldHdvcmtBY2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVRtcGRpckVudlZhcjogZmFsc2UsXG5cdFx0XHRcdFx0XHRleGNsdWRlU2xhc2hUbXA6IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZ1bGxBY2Nlc3M6IHtcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogeyB0eXBlOiAnZGFuZ2VyRnVsbEFjY2VzcycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhZE9ubHk6IHtcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogeyB0eXBlOiAncmVhZE9ubHknLCBuZXR3b3JrQWNjZXNzOiBmYWxzZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlZXIuZXhpdCgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZWQgbXVsdGktcm9vdCBwcmVzZXJ2ZXMgdGhlIGV4aXN0aW5nIGFkZGl0aW9uYWwtZGlyZWN0b3J5IHBheWxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWRkaXRpb25hbERpcmVjdG9yeSA9IFVSSS5maWxlKCcvbWFudWFsLXdyaXRlJykuZnNQYXRoO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb2RleCcsICdzaW5nbGUtcm9vdCcpO1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdHNlc3Npb25Db25maWc6IHsgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BZGRpdGlvbmFsRGlyZWN0b3JpZXNdOiBbYWRkaXRpb25hbERpcmVjdG9yeV0gfSxcblx0XHR9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50LFxuXHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCByZXBvQSA9IFVSSS5maWxlKCcvcmVwby1hJyk7XG5cdFx0Y29uc3QgcmVwb0IgPSBVUkkuZmlsZSgnL3JlcG8tYicpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb246IHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLCByZXBvQl0sIG1vZGVsOiB7IGlkOiAnZ3B0LXRlc3QnIH0gfSk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGFnZW50Wydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSE7XG5cdFx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3RocmVhZCcgfSB9IH0pO1xuXHRcdFx0YXdhaXQgZW50cnkubWF0ZXJpYWxpemVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCBzZW5kID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpLCAnaGVsbG8nLCBbcmVwb0FdLCB1bmRlZmluZWQsICd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IHR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlci5vdXRib3VuZCk7XG5cdFx0XHRwZWVyLnB1c2goeyBpZDogdHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHNlbmQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGFydFJ1bnRpbWVXb3Jrc3BhY2VSb290czogc3RhcnQucGFyYW1zLnJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0dHVyblJ1bnRpbWVXb3Jrc3BhY2VSb290czogdHVybi5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHR3cml0YWJsZVJvb3RzOiB0dXJuLnBhcmFtcy5zYW5kYm94UG9saWN5Py50eXBlID09PSAnd29ya3NwYWNlV3JpdGUnID8gdHVybi5wYXJhbXMuc2FuZGJveFBvbGljeS53cml0YWJsZVJvb3RzIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGFydFJ1bnRpbWVXb3Jrc3BhY2VSb290czogdW5kZWZpbmVkLFxuXHRcdFx0XHR0dXJuUnVudGltZVdvcmtzcGFjZVJvb3RzOiBbcmVwb0EuZnNQYXRoLCBhZGRpdGlvbmFsRGlyZWN0b3J5XSxcblx0XHRcdFx0d3JpdGFibGVSb290czogW3JlcG9BLmZzUGF0aCwgYWRkaXRpb25hbERpcmVjdG9yeV0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlci5leGl0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdlbmFibGVkIG11bHRpLXJvb3QgcHJlc2VydmVzIHNpbmdsZS1mb2xkZXIgcHJvdG9jb2wgYW5kIHNhbmRib3ggYmVoYXZpb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWRkaXRpb25hbERpcmVjdG9yeSA9IGAke1VSSS5maWxlKCcvbWFudWFsLXdyaXRlJykuZnNQYXRofSR7c2VwfWA7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ2VuYWJsZWQtc2luZ2xlLXJvb3QnKTtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRtdWx0aVJvb3RFbmFibGVkOiB0cnVlLFxuXHRcdFx0c2Vzc2lvbkNvbmZpZzogeyBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFkZGl0aW9uYWxEaXJlY3Rvcmllc106IFthZGRpdGlvbmFsRGlyZWN0b3J5XSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBlZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXIudHJhbnNwb3J0KTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQsXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9ucyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFNraWxsRXh0cmFSb290cyddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGNvbnN0IHJlcG8gPSBVUkkuZmlsZSgnL3JlcG8nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uOiBzZXNzaW9uVXJpLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtyZXBvXSwgbW9kZWw6IHsgaWQ6ICdncHQtdGVzdCcgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHN0YXJ0LmlkLCByZXN1bHQ6IHsgdGhyZWFkOiB7IGlkOiAndGhyZWFkJyB9IH0gfSk7XG5cdFx0XHRhd2FpdCBlbnRyeS5tYXRlcmlhbGl6ZVByb21pc2U7XG5cblx0XHRcdGNvbnN0IHNlbmQgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksICdoZWxsbycsIFtyZXBvXSwgdW5kZWZpbmVkLCAndHVybi0xJyk7XG5cdFx0XHRjb25zdCB0dXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHsgaWQ6IHR1cm4uaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRhd2FpdCBzZW5kO1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhZ2VudFsnX2NvbmZpZ3VyYXRpb25TZXJ2aWNlJ107XG5cdFx0XHRhc3NlcnQub2soY29uZmlndXJhdGlvblNlcnZpY2UgaW5zdGFuY2VvZiBUZXN0Q29kZXhDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRTZXNzaW9uQ29uZmlnKHsgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldF06ICdmdWxsLWFjY2VzcycgfSk7XG5cdFx0XHRjb25zdCBmdWxsQWNjZXNzID0gYWdlbnRbJ190dXJuU3RhcnRPcHRpb25zJ10oZW50cnksICdncHQtdGVzdCcpO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0U2Vzc2lvbkNvbmZpZyh7IFtDb2RleFNlc3Npb25Db25maWdLZXkuU2FuZGJveE1vZGVdOiAncmVhZC1vbmx5JyB9KTtcblx0XHRcdGNvbnN0IHJlYWRPbmx5ID0gYWdlbnRbJ190dXJuU3RhcnRPcHRpb25zJ10oZW50cnksICdncHQtdGVzdCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhcnQ6IHtcblx0XHRcdFx0XHRjd2Q6IHN0YXJ0LnBhcmFtcy5jd2QsXG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiBzdGFydC5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0dXJuOiB7XG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzOiB0dXJuLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogdHVybi5wYXJhbXMuc2FuZGJveFBvbGljeSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZnVsbEFjY2Vzczoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogZnVsbEFjY2Vzcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdFx0c2FuZGJveFBvbGljeTogZnVsbEFjY2Vzcy5zYW5kYm94UG9saWN5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZWFkT25seToge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogcmVhZE9ubHkucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHJlYWRPbmx5LnNhbmRib3hQb2xpY3ksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXJ0OiB7XG5cdFx0XHRcdFx0Y3dkOiByZXBvLmZzUGF0aCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0dHVybjoge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG8uZnNQYXRoLCBhZGRpdGlvbmFsRGlyZWN0b3J5XSxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnd29ya3NwYWNlV3JpdGUnLFxuXHRcdFx0XHRcdFx0d3JpdGFibGVSb290czogW3JlcG8uZnNQYXRoLCBhZGRpdGlvbmFsRGlyZWN0b3J5XSxcblx0XHRcdFx0XHRcdG5ldHdvcmtBY2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVRtcGRpckVudlZhcjogZmFsc2UsXG5cdFx0XHRcdFx0XHRleGNsdWRlU2xhc2hUbXA6IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZ1bGxBY2Nlc3M6IHtcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzYW5kYm94UG9saWN5OiB7IHR5cGU6ICdkYW5nZXJGdWxsQWNjZXNzJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZWFkT25seToge1xuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNhbmRib3hQb2xpY3k6IHsgdHlwZTogJ3JlYWRPbmx5JywgbmV0d29ya0FjY2VzczogZmFsc2UgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmsgaW5oZXJpdHMgdGhlIHNvdXJjZSB3b3Jrc3BhY2Ugcm9vdHMgaW5zdGVhZCBvZiByZXF1ZXN0ZWQgcmVwbGFjZW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgbXVsdGlSb290RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBwZWVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRlc3RQZWVyKCkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBDb2RleEFwcFNlcnZlckNsaWVudChwZWVyLnRyYW5zcG9ydCk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50LFxuXHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cdFx0YWdlbnRbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudFsnX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRjb25zdCByZXBvQSA9IFVSSS5maWxlKCcvcmVwby1hJyk7XG5cdFx0Y29uc3QgcmVwb0IgPSBVUkkuZmlsZSgnL3JlcG8tYicpO1xuXHRcdGNvbnN0IHJlcXVlc3RlZEEgPSBVUkkuZmlsZSgnL3JlcXVlc3RlZC1hJyk7XG5cdFx0Y29uc3QgcmVxdWVzdGVkQiA9IFVSSS5maWxlKCcvcmVxdWVzdGVkLWInKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbcmVwb0EsIHJlcG9CXSwgbW9kZWw6IHsgaWQ6ICdncHQtdGVzdCcgfSB9KTtcblx0XHRcdGNvbnN0IHNvdXJjZUVudHJ5ID0gYWdlbnRbJ19zZXNzaW9ucyddLmdldChBZ2VudFNlc3Npb24uaWQoc291cmNlLnNlc3Npb24pKSE7XG5cdFx0XHRjb25zdCBzdGFydCA9IGF3YWl0IHJlYWROZXh0UmVxdWVzdChwZWVyLm91dGJvdW5kKTtcblx0XHRcdHBlZXIucHVzaCh7IGlkOiBzdGFydC5pZCwgcmVzdWx0OiB7IHRocmVhZDogeyBpZDogJ3NvdXJjZS10aHJlYWQnIH0sIGN3ZDogcmVwb0EuZnNQYXRoLCBydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0gfSB9KTtcblx0XHRcdGF3YWl0IHNvdXJjZUVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblxuXHRcdFx0Y29uc3QgZm9ya1Byb21pc2UgPSBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbcmVxdWVzdGVkQSwgcmVxdWVzdGVkQl0sXG5cdFx0XHRcdGZvcms6IHsgc2Vzc2lvbjogc291cmNlLnNlc3Npb24sIHR1cm5JZDogJ3R1cm4tMScsIHR1cm5JbmRleDogMCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZWFkID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHtcblx0XHRcdFx0aWQ6IHJlYWQuaWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHRocmVhZDoge1xuXHRcdFx0XHRcdFx0aWQ6ICdzb3VyY2UtdGhyZWFkJyxcblx0XHRcdFx0XHRcdGN3ZDogcmVwb0EuZnNQYXRoLFxuXHRcdFx0XHRcdFx0dHVybnM6IFt7IGlkOiAndHVybi0xJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBmb3JrID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXIub3V0Ym91bmQpO1xuXHRcdFx0cGVlci5wdXNoKHtcblx0XHRcdFx0aWQ6IGZvcmsuaWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHRocmVhZDogeyBpZDogJ2ZvcmstdGhyZWFkJywgY3dkOiByZXBvQS5mc1BhdGggfSxcblx0XHRcdFx0XHRjd2Q6IHJlcG9BLmZzUGF0aCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IGZvcmtQcm9taXNlO1xuXHRcdFx0Y29uc3QgZm9ya2VkRW50cnkgPSBhZ2VudFsnX3Nlc3Npb25zJ10uZ2V0KEFnZW50U2Vzc2lvbi5pZChmb3JrZWQuc2Vzc2lvbikpITtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRtZXRob2Q6IGZvcmsubWV0aG9kLFxuXHRcdFx0XHRcdGN3ZDogZm9yay5wYXJhbXMuY3dkLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogZm9yay5wYXJhbXMucnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGZvcmtlZEVudHJ5LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZnNQYXRoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdG1ldGhvZDogJ3RocmVhZC9mb3JrJyxcblx0XHRcdFx0XHRjd2Q6IHJlcG9BLmZzUGF0aCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwZWVyLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGQgcmVzdW1lIHJlc3RvcmVzIHBlcnNpc3RlZCB3b3Jrc3BhY2Ugcm9vdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGNvbnN0IHJlcG9BID0gVVJJLmZpbGUoJy9yZXBvLWEnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cdFx0Y29uc3QgYWdlbnRBID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgbXVsdGlSb290RW5hYmxlZDogdHJ1ZSwgZGF0YWJhc2UgfSk7XG5cdFx0Y29uc3QgcGVlckEgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGVzdFBlZXIoKSk7XG5cdFx0YWdlbnRBWydfY29ubmVjdGlvbiddID0ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDogbmV3IENvZGV4QXBwU2VydmVyQ2xpZW50KHBlZXJBLnRyYW5zcG9ydCksXG5cdFx0XHR1c2FnZVNvdXJjZTogJ2dpdGh1YicsXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblx0XHRhZ2VudEFbJ19yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMnXSA9IGFzeW5jICgpID0+IHsgfTtcblx0XHRhZ2VudEFbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0bGV0IHBlZXJCOiBJVGVzdFBlZXIgfCB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGFnZW50QS5jcmVhdGVTZXNzaW9uKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbcmVwb0EsIHJlcG9CXSwgbW9kZWw6IHsgaWQ6ICdncHQtdGVzdCcgfSB9KTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYWdlbnRBWydfc2Vzc2lvbnMnXS5nZXQoQWdlbnRTZXNzaW9uLmlkKGNyZWF0ZWQuc2Vzc2lvbikpITtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXJBLm91dGJvdW5kKTtcblx0XHRcdHBlZXJBLnB1c2goeyBpZDogc3RhcnQuaWQsIHJlc3VsdDogeyB0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQnIH0sIGN3ZDogcmVwb0EuZnNQYXRoLCBydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0gfSB9KTtcblx0XHRcdGF3YWl0IGVudHJ5Lm1hdGVyaWFsaXplUHJvbWlzZTtcblx0XHRcdGNvbnN0IGZpcnN0U2VuZCA9IGFnZW50QS5jaGF0cy5zZW5kTWVzc2FnZShVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShjcmVhdGVkLnNlc3Npb24pKSwgJ2hlbGxvJywgW3JlcG9BLCByZXBvQl0sIHVuZGVmaW5lZCwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgZmlyc3RUdXJuID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXJBLm91dGJvdW5kKTtcblx0XHRcdHBlZXJBLnB1c2goeyBpZDogZmlyc3RUdXJuLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgZmlyc3RTZW5kO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRJbW1lZGlhdGUocmVzb2x2ZSkpO1xuXHRcdFx0Y29uc3QgY2Fub25pY2FsT3ZlcmxheSA9IGF3YWl0IGFnZW50QVsnX21ldGFkYXRhU3RvcmUnXS5yZWFkKEFnZW50U2Vzc2lvbi51cmkoJ2NvZGV4JywgJ3RocmVhZCcpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRCID0gYXdhaXQgY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIHsgbXVsdGlSb290RW5hYmxlZDogdHJ1ZSwgZGF0YWJhc2UgfSk7XG5cdFx0XHRwZWVyQiA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXN0UGVlcigpKTtcblx0XHRcdGFnZW50QlsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdFx0Y2xpZW50OiBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQocGVlckIudHJhbnNwb3J0KSxcblx0XHRcdFx0dXNhZ2VTb3VyY2U6ICdnaXRodWInLFxuXHRcdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0XHR9IGFzIG5ldmVyO1xuXHRcdFx0YWdlbnRCWydfcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0XHRhZ2VudEJbJ19yZWZyZXNoU2tpbGxFeHRyYVJvb3RzJ10gPSBhc3luYyAoKSA9PiB7IH07XG5cblx0XHRcdGNvbnN0IG1ldGFkYXRhUHJvbWlzZSA9IGFnZW50Qi5nZXRTZXNzaW9uTWV0YWRhdGEoY3JlYXRlZC5zZXNzaW9uKTtcblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlckIub3V0Ym91bmQpO1xuXHRcdFx0cGVlckIucHVzaCh7XG5cdFx0XHRcdGlkOiByZWFkLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHR0aHJlYWQ6IHtcblx0XHRcdFx0XHRcdGlkOiAndGhyZWFkJyxcblx0XHRcdFx0XHRcdGN3ZDogcmVwb0EuZnNQYXRoLFxuXHRcdFx0XHRcdFx0bW9kZWxQcm92aWRlcjogJ3ZzY29kZS1wcm94eScsXG5cdFx0XHRcdFx0XHR0dXJuczogW10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCBtZXRhZGF0YVByb21pc2U7XG5cblx0XHRcdGNvbnN0IHJlc3VtZWRTZW5kID0gYWdlbnRCLmNoYXRzLnNlbmRNZXNzYWdlKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGNyZWF0ZWQuc2Vzc2lvbikpLCAnYWdhaW4nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMicpO1xuXHRcdFx0Y29uc3QgcmVzdW1lID0gYXdhaXQgcmVhZE5leHRSZXF1ZXN0KHBlZXJCLm91dGJvdW5kKTtcblx0XHRcdHBlZXJCLnB1c2goe1xuXHRcdFx0XHRpZDogcmVzdW1lLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHR0aHJlYWQ6IHsgaWQ6ICd0aHJlYWQnLCBjd2Q6IHJlcG9BLmZzUGF0aCB9LFxuXHRcdFx0XHRcdGN3ZDogcmVwb0EuZnNQYXRoLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogW3JlcG9BLmZzUGF0aCwgcmVwb0IuZnNQYXRoXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdW1lZFR1cm4gPSBhd2FpdCByZWFkTmV4dFJlcXVlc3QocGVlckIub3V0Ym91bmQpO1xuXHRcdFx0cGVlckIucHVzaCh7IGlkOiByZXN1bWVkVHVybi5pZCwgcmVzdWx0OiB7fSB9KTtcblx0XHRcdGF3YWl0IHJlc3VtZWRTZW5kO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2Fub25pY2FsT3ZlcmxheTogY2Fub25pY2FsT3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZzUGF0aCksXG5cdFx0XHRcdG1ldGFkYXRhOiBtZXRhZGF0YT8ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5mc1BhdGgpLFxuXHRcdFx0XHRyZXN1bWU6IHtcblx0XHRcdFx0XHRjd2Q6IHJlc3VtZS5wYXJhbXMuY3dkLFxuXHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290czogcmVzdW1lLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR1cm5SdW50aW1lV29ya3NwYWNlUm9vdHM6IHJlc3VtZWRUdXJuLnBhcmFtcy5ydW50aW1lV29ya3NwYWNlUm9vdHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhbm9uaWNhbE92ZXJsYXk6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdG1ldGFkYXRhOiBbcmVwb0EuZnNQYXRoLCByZXBvQi5mc1BhdGhdLFxuXHRcdFx0XHRyZXN1bWU6IHtcblx0XHRcdFx0XHRjd2Q6IHJlcG9BLmZzUGF0aCxcblx0XHRcdFx0XHRydW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR1cm5SdW50aW1lV29ya3NwYWNlUm9vdHM6IFtyZXBvQS5mc1BhdGgsIHJlcG9CLmZzUGF0aF0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGVlckI/LmV4aXQoKTtcblx0XHRcdHBlZXJBLmV4aXQoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFw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
