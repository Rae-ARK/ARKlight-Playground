import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { PluginFormat } from "../../../agentPlugins/common/pluginParsers.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { CustomizationType } from "../../common/state/protocol/state.js";
import { ActiveClientToolSet } from "../../node/activeClientState.js";
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
import { ByokLmProxyService, IByokLmProxyService } from "../../node/copilot/byokLmProxyService.js";
import { CopilotSessionLauncher, getCopilotReasoningEffort, resolveByokSessionConfig } from "../../node/copilot/copilotSessionLauncher.js";
const testRuntime = {
  handlePermissionRequest: async () => {
    throw new Error("Unexpected permission request");
  },
  handleExitPlanModeRequest: async () => {
    throw new Error("Unexpected exit plan mode request");
  },
  handleUserInputRequest: async () => {
    throw new Error("Unexpected user input request");
  },
  handleElicitationRequest: async () => {
    throw new Error("Unexpected elicitation request");
  },
  handleMcpAuthRequest: async () => {
    throw new Error("Unexpected MCP auth request");
  },
  requestUnsandboxedCommandConfirmation: async () => false,
  handlePreToolUse: async () => {
  },
  handlePostToolUse: async () => {
  },
  createClientSdkTools: () => [],
  createServerSdkTools: () => []
};
const testWorkingDirectory = URI.file(process.cwd());
function createTestLauncher() {
  const configurationService = {
    getRootValue: () => void 0
  };
  return new CopilotSessionLauncher(
    configurationService,
    {},
    new NullLogService(),
    {},
    { _serviceBrand: void 0, start: async () => {
      throw new Error("Unexpected proxy start");
    }, dispose: () => {
    } },
    new ByokLmBridgeRegistry()
  );
}
suite("resolveByokSessionConfig", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const sessionId = "sess-1";
  const log = new NullLogService();
  function connectionOf(models, chat = async () => ({ output: [] })) {
    const emitter = store.add(new Emitter({
      onDidAddFirstListener: () => emitter.fire(models)
    }));
    return { chat, onDidChangeModels: emitter.event };
  }
  function countingProxy() {
    let starts = 0;
    const handle = {
      baseUrl: "http://127.0.0.1:1",
      nonce: "NONCE",
      providerBaseUrl: (vendor) => `http://127.0.0.1:1/v/${vendor}`,
      dispose: () => {
      }
    };
    return {
      get starts() {
        return starts;
      },
      startProxy: async () => {
        starts++;
        return handle;
      }
    };
  }
  test("returns empty and never starts the proxy when no bridge is active", async () => {
    const registry = new ByokLmBridgeRegistry();
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    assert.deepStrictEqual(config, {});
    assert.strictEqual(proxy.starts, 0);
  });
  test("returns empty and never starts the proxy when the bridge reports no models", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", connectionOf([]));
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config, {});
    assert.strictEqual(proxy.starts, 0);
  });
  test("returns empty and never starts the proxy for a window that never pushes a snapshot", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", { chat: async () => ({ output: [] }), onDidChangeModels: Event.None });
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config, {});
    assert.strictEqual(proxy.starts, 0);
  });
  test("synthesizes deduped providers and per-model config from the active bridge", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", connectionOf([
      { vendor: "acme", id: "claude", name: "Acme Claude", maxContextWindowTokens: 2e5 },
      { vendor: "acme", id: "gpt", name: void 0, maxContextWindowTokens: void 0 },
      { vendor: "globex", id: "llama", name: "Globex Llama" }
    ]));
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.strictEqual(proxy.starts, 1);
    assert.deepStrictEqual(config, {
      providers: [
        { name: "acme", type: "openai", wireApi: "responses", baseUrl: "http://127.0.0.1:1/v/acme", bearerToken: "NONCE.sess-1" },
        { name: "globex", type: "openai", wireApi: "responses", baseUrl: "http://127.0.0.1:1/v/globex", bearerToken: "NONCE.sess-1" }
      ],
      models: [
        { id: "claude", provider: "acme", name: "Acme Claude", maxContextWindowTokens: 2e5 },
        { id: "gpt", provider: "acme" },
        { id: "llama", provider: "globex", name: "Globex Llama" }
      ]
    });
  });
  test("synthesized provider config routes through a live proxy to the bridge", async () => {
    const registry = new ByokLmBridgeRegistry();
    let captured;
    const registration = registry.register("client-1", connectionOf(
      [{ vendor: "acme", id: "claude" }],
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "hello from byok" }] }] };
      }
    ));
    const service = new ByokLmProxyService(log, registry);
    let handle;
    const config = await resolveByokSessionConfig(sessionId, registry, async () => handle = await service.start(), log);
    const provider = config.providers[0];
    const model = config.models[0];
    try {
      const response = await fetch(`${provider.baseUrl}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${provider.bearerToken}` },
        body: JSON.stringify({ model: model.id, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }] })
      });
      assert.strictEqual(response.status, 200);
      const text = await response.text();
      assert.ok(text.includes("hello from byok"), `expected content in SSE: ${text}`);
    } finally {
      handle?.dispose();
      registration.dispose();
      service.dispose();
    }
    assert.strictEqual(captured?.vendor, "acme");
    assert.strictEqual(captured?.modelId, "claude");
  });
  test("reads the latest pushed snapshot from the registry cache", async () => {
    const registry = new ByokLmBridgeRegistry();
    const emitter = store.add(new Emitter());
    const registration = registry.register("client-1", {
      chat: async () => ({ output: [] }),
      onDidChangeModels: emitter.event
    });
    const proxy = countingProxy();
    emitter.fire([]);
    emitter.fire([{ vendor: "acme", id: "claude", name: "Acme Claude" }]);
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config.models, [{ id: "claude", provider: "acme", name: "Acme Claude" }]);
  });
});
suite("CopilotSessionLauncher BYOK proxy lifecycle", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sessionId = "sess-1";
  function connectionOf(store, models) {
    const emitter = store.add(new Emitter({
      onDidAddFirstListener: () => emitter.fire(models)
    }));
    return { chat: async () => ({ output: [] }), onDidChangeModels: emitter.event };
  }
  function fakeProxyService() {
    let starts = 0;
    let disposes = 0;
    const service = {
      _serviceBrand: void 0,
      start: async () => {
        const nonce = `NONCE-${++starts}`;
        return {
          baseUrl: "http://127.0.0.1:1",
          nonce,
          providerBaseUrl: (vendor) => `http://127.0.0.1:1/v/${vendor}`,
          dispose: () => {
            disposes++;
          }
        };
      },
      dispose: () => {
      }
    };
    return { service, get starts() {
      return starts;
    }, get disposes() {
      return disposes;
    } };
  }
  function createLauncher(store, proxy, registry) {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IByokLmProxyService, proxy);
    services.set(IByokLmBridgeRegistry, registry);
    const instantiationService = store.add(new InstantiationService(services));
    return instantiationService.createInstance(CopilotSessionLauncher);
  }
  test("memoizes the handle, and disposeByokProxyHandle releases it so the next launch mints a fresh nonce", async () => {
    const store = new DisposableStore();
    const proxy = fakeProxyService();
    const registry = new ByokLmBridgeRegistry();
    store.add(registry.register("client-1", connectionOf(store, [{ vendor: "acme", id: "claude" }])));
    const launcher = createLauncher(store, proxy.service, registry);
    const resolve = () => launcher._resolveByokSessionConfig(sessionId);
    const first = await resolve();
    const second = await resolve();
    assert.strictEqual(proxy.starts, 1, "subsequent launches share the memoized bind");
    assert.strictEqual(first.providers[0].bearerToken, second.providers[0].bearerToken, "the shared bind reuses one nonce");
    await launcher.disposeByokProxyHandle();
    await launcher.disposeByokProxyHandle();
    assert.strictEqual(proxy.disposes, 1, "the handle is released exactly once and disposal is idempotent");
    const third = await resolve();
    assert.strictEqual(proxy.starts, 2, "a fresh bind is minted after disposal");
    assert.notStrictEqual(third.providers[0].bearerToken, first.providers[0].bearerToken, "the fresh bind carries a new nonce");
    store.dispose();
  });
});
suite("CopilotSessionLauncher client identity", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes the Agent Host client name to create and resume", async () => {
    const createConfigs = [];
    const resumeConfigs = [];
    const session = {
      sessionId: "session-1",
      on: () => () => {
      },
      disconnect: async () => {
      }
    };
    const client = {
      createSession: async (config) => {
        createConfigs.push(config);
        return session;
      },
      resumeSession: async (_sessionId, config) => {
        resumeConfigs.push(config);
        return session;
      }
    };
    const launcher = createTestLauncher();
    const pluginDir = URI.file("/tmp/synced-customizations");
    const skillUri = URI.joinPath(pluginDir, "skills", "user-skill", "SKILL.md");
    const instructionUri = URI.joinPath(pluginDir, "rules", "user.instructions.md");
    const plugin = {
      format: PluginFormat.Copilot,
      hooks: [],
      mcpServers: [],
      agents: [],
      skills: [{
        uri: skillUri,
        name: "user-skill",
        customization: { type: CustomizationType.Skill, id: skillUri.toString(), uri: skillUri.toString(), name: "user-skill" }
      }],
      instructions: [{
        uri: instructionUri,
        name: "user",
        customization: { type: CustomizationType.Rule, id: instructionUri.toString(), uri: instructionUri.toString(), name: "user", alwaysApply: true }
      }],
      pluginDir
    };
    const basePlan = {
      client,
      sessionId: "session-1",
      workingDirectory: testWorkingDirectory,
      resolvedAgentName: void 0,
      snapshot: { tools: [], plugins: [plugin], mcpServers: {} },
      activeClientToolSet: new ActiveClientToolSet(),
      shellManager: void 0,
      githubToken: void 0
    };
    const createPlan = {
      ...basePlan,
      kind: "create",
      model: void 0
    };
    const resumePlan = {
      ...basePlan,
      kind: "resume",
      fallback: { model: void 0 }
    };
    const sessions = new DisposableStore();
    try {
      sessions.add(await launcher.launch(createPlan, testRuntime));
      sessions.add(await launcher.launch(resumePlan, testRuntime));
      assert.deepStrictEqual({
        createClientName: createConfigs[0].clientName,
        createPluginDirectories: createConfigs[0].pluginDirectories,
        createSkillDirectories: createConfigs[0].skillDirectories,
        createInstructionDirectories: createConfigs[0].instructionDirectories,
        resumeClientName: resumeConfigs[0].clientName,
        resumePluginDirectories: resumeConfigs[0].pluginDirectories,
        resumeSkillDirectories: resumeConfigs[0].skillDirectories,
        resumeInstructionDirectories: resumeConfigs[0].instructionDirectories
      }, {
        createClientName: "vscode-agent-host",
        createPluginDirectories: [pluginDir.fsPath],
        createSkillDirectories: [],
        createInstructionDirectories: [URI.joinPath(pluginDir, "rules").fsPath],
        resumeClientName: "vscode-agent-host",
        resumePluginDirectories: [pluginDir.fsPath],
        resumeSkillDirectories: [],
        resumeInstructionDirectories: [URI.joinPath(pluginDir, "rules").fsPath]
      });
    } finally {
      sessions.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
});
suite("CopilotSessionLauncher resume fallback", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class TestSdkError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
  function createResumeFailingLaunch(message, code = -32603) {
    let createSessionCalls = 0;
    const session = {
      sessionId: "session-1",
      on: () => () => {
      },
      disconnect: async () => {
      }
    };
    const client = {
      createSession: async () => {
        createSessionCalls++;
        return session;
      },
      resumeSession: async () => {
        throw new TestSdkError(message, code);
      }
    };
    return {
      launcher: createTestLauncher(),
      plan: {
        client,
        sessionId: "session-1",
        workingDirectory: testWorkingDirectory,
        resolvedAgentName: void 0,
        snapshot: { tools: [], plugins: [], mcpServers: {} },
        activeClientToolSet: new ActiveClientToolSet(),
        shellManager: void 0,
        githubToken: void 0,
        kind: "resume",
        fallback: { model: void 0 }
      },
      getCreateSessionCalls: () => createSessionCalls
    };
  }
  test("falls back to createSession after a Start Over truncate leaves the session empty", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch(`Request session.resume failed with message: LocalRpcSession: 'session.getMessages' returned no events for session session-1`);
    const sessions = new DisposableStore();
    try {
      sessions.add(await launcher.launch(plan, testRuntime));
      assert.strictEqual(getCreateSessionCalls(), 1);
    } finally {
      sessions.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
  test("falls back to createSession for an unknown -32603 from resumeSession", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch("Request session.resume failed: something went wrong");
    const sessions = new DisposableStore();
    try {
      sessions.add(await launcher.launch(plan, testRuntime));
      assert.strictEqual(getCreateSessionCalls(), 1);
    } finally {
      sessions.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
  test("does not replace a corrupted session file with an empty session", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch("Request session.resume failed with message: Session file is corrupted (line 19567: data.compactionTokensUsed.copilotUsage.tokenDetails.0.batchSize: Number must be greater than 0)");
    try {
      await assert.rejects(() => launcher.launch(plan, testRuntime), /Session file is corrupted/);
      assert.strictEqual(getCreateSessionCalls(), 0);
    } finally {
      await launcher.disposeByokProxyHandle();
    }
  });
});
suite("getCopilotReasoningEffort", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("a valid override wins over the picker value; an invalid or absent override falls back", () => {
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    assert.deepStrictEqual(
      [
        getCopilotReasoningEffort(model),
        getCopilotReasoningEffort(model, "xhigh"),
        getCopilotReasoningEffort(model, "turbo"),
        getCopilotReasoningEffort(void 0, "high"),
        getCopilotReasoningEffort(void 0)
      ],
      ["medium", "xhigh", "medium", "high", void 0]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFNlc3Npb25MYXVuY2hlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBDb3BpbG90Q2xpZW50LCBDb3BpbG90U2Vzc2lvbiB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUGx1Z2luRm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uLCBJQnlva0xtQ2hhdFJlcXVlc3QsIElCeW9rTG1DaGF0UmVzdWx0LCBJQnlva0xtTW9kZWxJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBNb2RlbFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi8uLi9ub2RlL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5LCBJQnlva0xtQnJpZGdlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub2RlL2J5b2tMbUJyaWRnZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEJ5b2tMbVByb3h5U2VydmljZSwgSUJ5b2tMbVByb3h5U2VydmljZSwgdHlwZSBJQnlva0xtUHJveHlIYW5kbGUgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvYnlva0xtUHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvcGlsb3RTZXNzaW9uTGF1bmNoZXIsIGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQsIHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZywgdHlwZSBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIHR5cGUgSUNvcGlsb3RTZXNzaW9uUnVudGltZSB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90U2Vzc2lvbkxhdW5jaGVyLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvcGlsb3RQbHVnaW5JbmZvIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RBZ2VudC5qcyc7XG5cbmNvbnN0IHRlc3RSdW50aW1lOiBJQ29waWxvdFNlc3Npb25SdW50aW1lID0ge1xuXHRoYW5kbGVQZXJtaXNzaW9uUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcGVybWlzc2lvbiByZXF1ZXN0Jyk7IH0sXG5cdGhhbmRsZUV4aXRQbGFuTW9kZVJlcXVlc3Q6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGV4aXQgcGxhbiBtb2RlIHJlcXVlc3QnKTsgfSxcblx0aGFuZGxlVXNlcklucHV0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdXNlciBpbnB1dCByZXF1ZXN0Jyk7IH0sXG5cdGhhbmRsZUVsaWNpdGF0aW9uUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZWxpY2l0YXRpb24gcmVxdWVzdCcpOyB9LFxuXHRoYW5kbGVNY3BBdXRoUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgTUNQIGF1dGggcmVxdWVzdCcpOyB9LFxuXHRyZXF1ZXN0VW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0aGFuZGxlUHJlVG9vbFVzZTogYXN5bmMgKCkgPT4geyB9LFxuXHRoYW5kbGVQb3N0VG9vbFVzZTogYXN5bmMgKCkgPT4geyB9LFxuXHRjcmVhdGVDbGllbnRTZGtUb29sczogKCkgPT4gW10sXG5cdGNyZWF0ZVNlcnZlclNka1Rvb2xzOiAoKSA9PiBbXSxcbn07XG5cbmNvbnN0IHRlc3RXb3JraW5nRGlyZWN0b3J5ID0gVVJJLmZpbGUocHJvY2Vzcy5jd2QoKSk7XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RMYXVuY2hlcigpOiBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSB7XG5cdFx0Z2V0Um9vdFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdH0gYXMgUGFydGlhbDxJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZT4gYXMgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHJldHVybiBuZXcgQ29waWxvdFNlc3Npb25MYXVuY2hlcihcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHR7fSBhcyBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLFxuXHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdHt9IGFzIElGaWxlU2VydmljZSxcblx0XHR7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgc3RhcnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHByb3h5IHN0YXJ0Jyk7IH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9LFxuXHRcdG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpLFxuXHQpO1xufVxuXG4vKipcbiAqIENvdmVycyB0aGUgQllPSyBwcm92aWRlci9tb2RlbCBzeW50aGVzaXMgdGhlIGxhdW5jaGVyIGZlZWRzIGludG9cbiAqIGBjcmVhdGVTZXNzaW9uYCAvIGByZXN1bWVTZXNzaW9uYC4gVGhlIGZpcnN0IGZvdXIgdGVzdHMgcGluIHRoZSBnYXRpbmcgYW5kXG4gKiBncmFjZWZ1bC1kZWdyYWRhdGlvbiBicmFuY2hlcyBwbHVzIHRoZSBleGFjdCBTREsgY29uZmlnIHNoYXBlIHVzaW5nIGEgcmVhbFxuICoge0BsaW5rIEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5fSBhbmQgYSBjb3VudGluZyBwcm94eSB0aHVuayAobm8gcmVhbCBwcm94eSkuIFRoZVxuICogbGFzdCB0ZXN0IHdpcmVzIHRoZSBzeW50aGVzaXplZCBjb25maWcgc3RyYWlnaHQgaW50byBhIGxpdmVcbiAqIHtAbGluayBCeW9rTG1Qcm94eVNlcnZpY2V9IGFuZCBQT1NUcyBhdCBpdCwgcHJvdmluZyB0aGUgbGF1bmNoZXIncyBvdXRwdXQgaXNcbiAqIGNvbnN1bWFibGUgZW5kLXRvLWVuZDogcHJvdmlkZXIgYGJhc2VVcmxgICsgYEJlYXJlciA8bm9uY2U+LjxzZXNzaW9uSWQ+YCArXG4gKiBgbW9kZWwgPSBpZGAgcm91dGUgdGhyb3VnaCB0aGUgcHJveHkgdG8gdGhlIHJlbmRlcmVyIGJyaWRnZS5cbiAqL1xuc3VpdGUoJ3Jlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzLTEnO1xuXHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHQvKipcblx0ICogQSBicmlkZ2UgY29ubmVjdGlvbiB0aGF0IHB1c2hlcyBgbW9kZWxzYCBhcyBpdHMgc25hcHNob3Qgc3luY2hyb25vdXNseSB3aGVuXG5cdCAqIHRoZSByZWdpc3RyeSBzdWJzY3JpYmVzOyBgY2hhdGAgaXMgc2NyaXB0ZWQgKHVudXNlZCBieSBtb3N0IHRlc3RzKS5cblx0ICovXG5cdGZ1bmN0aW9uIGNvbm5lY3Rpb25PZihtb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXSwgY2hhdDogSUJ5b2tMbUJyaWRnZUNvbm5lY3Rpb25bJ2NoYXQnXSA9IGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSkpOiBJQnlva0xtQnJpZGdlQ29ubmVjdGlvbiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQnlva0xtTW9kZWxJbmZvW10+KHtcblx0XHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4gZW1pdHRlci5maXJlKG1vZGVscyksXG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGNoYXQsIG9uRGlkQ2hhbmdlTW9kZWxzOiBlbWl0dGVyLmV2ZW50IH07XG5cdH1cblxuXHQvKiogQSBmYWtlIHByb3h5IGhhbmRsZSBwbHVzIGEgYHN0YXJ0UHJveHlgIHRodW5rIHRoYXQgcmVjb3JkcyBpdHMgY2FsbCBjb3VudC4gKi9cblx0ZnVuY3Rpb24gY291bnRpbmdQcm94eSgpIHtcblx0XHRsZXQgc3RhcnRzID0gMDtcblx0XHRjb25zdCBoYW5kbGU6IElCeW9rTG1Qcm94eUhhbmRsZSA9IHtcblx0XHRcdGJhc2VVcmw6ICdodHRwOi8vMTI3LjAuMC4xOjEnLFxuXHRcdFx0bm9uY2U6ICdOT05DRScsXG5cdFx0XHRwcm92aWRlckJhc2VVcmw6IHZlbmRvciA9PiBgaHR0cDovLzEyNy4wLjAuMToxL3YvJHt2ZW5kb3J9YCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgc3RhcnRzKCkgeyByZXR1cm4gc3RhcnRzOyB9LFxuXHRcdFx0c3RhcnRQcm94eTogYXN5bmMgKCkgPT4geyBzdGFydHMrKzsgcmV0dXJuIGhhbmRsZTsgfSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBhbmQgbmV2ZXIgc3RhcnRzIHRoZSBwcm94eSB3aGVuIG5vIGJyaWRnZSBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCBwcm94eSA9IGNvdW50aW5nUHJveHkoKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHJlZ2lzdHJ5LCBwcm94eS5zdGFydFByb3h5LCBsb2cpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWcsIHt9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuc3RhcnRzLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBhbmQgbmV2ZXIgc3RhcnRzIHRoZSBwcm94eSB3aGVuIHRoZSBicmlkZ2UgcmVwb3J0cyBubyBtb2RlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LTEnLCBjb25uZWN0aW9uT2YoW10pKTtcblx0XHRjb25zdCBwcm94eSA9IGNvdW50aW5nUHJveHkoKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHJlZ2lzdHJ5LCBwcm94eS5zdGFydFByb3h5LCBsb2cpO1xuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZywge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS5zdGFydHMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFuZCBuZXZlciBzdGFydHMgdGhlIHByb3h5IGZvciBhIHdpbmRvdyB0aGF0IG5ldmVyIHB1c2hlcyBhIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Ly8gQSB3aW5kb3cgY29ubmVjdGVkIHdpdGhvdXQgYSBCWU9LIGhhbmRsZXIgbmV2ZXIgcHVzaGVzLCBzbyBpdCBzdGF5c1xuXHRcdC8vIG5vbi1zZXJ2aW5nIGFuZCBjb250cmlidXRlcyBubyBtb2RlbHMuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC0xJywgeyBjaGF0OiBhc3luYyAoKTogUHJvbWlzZTxJQnlva0xtQ2hhdFJlc3VsdD4gPT4gKHsgb3V0cHV0OiBbXSB9KSwgb25EaWRDaGFuZ2VNb2RlbHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0Y29uc3QgcHJveHkgPSBjb3VudGluZ1Byb3h5KCk7XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCByZXNvbHZlQnlva1Nlc3Npb25Db25maWcoc2Vzc2lvbklkLCByZWdpc3RyeSwgcHJveHkuc3RhcnRQcm94eSwgbG9nKTtcblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWcsIHt9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuc3RhcnRzLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc3ludGhlc2l6ZXMgZGVkdXBlZCBwcm92aWRlcnMgYW5kIHBlci1tb2RlbCBjb25maWcgZnJvbSB0aGUgYWN0aXZlIGJyaWRnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIGNvbm5lY3Rpb25PZihbXG5cdFx0XHR7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScsIG5hbWU6ICdBY21lIENsYXVkZScsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAwMCB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdncHQnLCBuYW1lOiB1bmRlZmluZWQsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdnbG9iZXgnLCBpZDogJ2xsYW1hJywgbmFtZTogJ0dsb2JleCBMbGFtYScgfSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgcHJveHkgPSBjb3VudGluZ1Byb3h5KCk7XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCByZXNvbHZlQnlva1Nlc3Npb25Db25maWcoc2Vzc2lvbklkLCByZWdpc3RyeSwgcHJveHkuc3RhcnRQcm94eSwgbG9nKTtcblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LnN0YXJ0cywgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWcsIHtcblx0XHRcdHByb3ZpZGVyczogW1xuXHRcdFx0XHR7IG5hbWU6ICdhY21lJywgdHlwZTogJ29wZW5haScsIHdpcmVBcGk6ICdyZXNwb25zZXMnLCBiYXNlVXJsOiAnaHR0cDovLzEyNy4wLjAuMToxL3YvYWNtZScsIGJlYXJlclRva2VuOiAnTk9OQ0Uuc2Vzcy0xJyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdnbG9iZXgnLCB0eXBlOiAnb3BlbmFpJywgd2lyZUFwaTogJ3Jlc3BvbnNlcycsIGJhc2VVcmw6ICdodHRwOi8vMTI3LjAuMC4xOjEvdi9nbG9iZXgnLCBiZWFyZXJUb2tlbjogJ05PTkNFLnNlc3MtMScgfSxcblx0XHRcdF0sXG5cdFx0XHRtb2RlbHM6IFtcblx0XHRcdFx0eyBpZDogJ2NsYXVkZScsIHByb3ZpZGVyOiAnYWNtZScsIG5hbWU6ICdBY21lIENsYXVkZScsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAwMCB9LFxuXHRcdFx0XHR7IGlkOiAnZ3B0JywgcHJvdmlkZXI6ICdhY21lJyB9LFxuXHRcdFx0XHR7IGlkOiAnbGxhbWEnLCBwcm92aWRlcjogJ2dsb2JleCcsIG5hbWU6ICdHbG9iZXggTGxhbWEnIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW50aGVzaXplZCBwcm92aWRlciBjb25maWcgcm91dGVzIHRocm91Z2ggYSBsaXZlIHByb3h5IHRvIHRoZSBicmlkZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRsZXQgY2FwdHVyZWQ6IElCeW9rTG1DaGF0UmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LTEnLCBjb25uZWN0aW9uT2YoXG5cdFx0XHRbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnIH1dLFxuXHRcdFx0YXN5bmMgKHJlcXVlc3QpID0+IHtcblx0XHRcdFx0Y2FwdHVyZWQgPSByZXF1ZXN0O1xuXHRcdFx0XHRyZXR1cm4geyBvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8gZnJvbSBieW9rJyB9XSB9XSB9O1xuXHRcdFx0fSxcblx0XHQpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEJ5b2tMbVByb3h5U2VydmljZShsb2csIHJlZ2lzdHJ5KTtcblx0XHRsZXQgaGFuZGxlOiBJQnlva0xtUHJveHlIYW5kbGUgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCByZXNvbHZlQnlva1Nlc3Npb25Db25maWcoc2Vzc2lvbklkLCByZWdpc3RyeSwgYXN5bmMgKCkgPT4gKGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoKSksIGxvZyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjb25maWcucHJvdmlkZXJzIVswXTtcblx0XHRjb25zdCBtb2RlbCA9IGNvbmZpZy5tb2RlbHMhWzBdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3Byb3ZpZGVyLmJhc2VVcmx9L3Jlc3BvbnNlc2AsIHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7cHJvdmlkZXIuYmVhcmVyVG9rZW59YCB9LFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiBtb2RlbC5pZCwgaW5wdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAnaW5wdXRfdGV4dCcsIHRleHQ6ICdoaScgfV0gfV0gfSksXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDIwMCk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ2hlbGxvIGZyb20gYnlvaycpLCBgZXhwZWN0ZWQgY29udGVudCBpbiBTU0U6ICR7dGV4dH1gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZD8udmVuZG9yLCAnYWNtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZD8ubW9kZWxJZCwgJ2NsYXVkZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkcyB0aGUgbGF0ZXN0IHB1c2hlZCBzbmFwc2hvdCBmcm9tIHRoZSByZWdpc3RyeSBjYWNoZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUJ5b2tMbU1vZGVsSW5mb1tdPigpKTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LTEnLCB7XG5cdFx0XHRjaGF0OiBhc3luYyAoKTogUHJvbWlzZTxJQnlva0xtQ2hhdFJlc3VsdD4gPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBlbWl0dGVyLmV2ZW50LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHByb3h5ID0gY291bnRpbmdQcm94eSgpO1xuXG5cdFx0Ly8gVGhlIHdpbmRvdyBzdGFydHMgc2VydmluZy1idXQtZW1wdHksIHRoZW4gcHVzaGVzIGEgbW9kZWw7IHRoZSByZXNvbHZlZFxuXHRcdC8vIGNvbmZpZyByZWZsZWN0cyB0aGUgbGF0ZXN0IGNhY2hlZCBwdXNoIHdpdGggbm8gcmVuZGVyZXIgcm91bmQtdHJpcC5cblx0XHRlbWl0dGVyLmZpcmUoW10pO1xuXHRcdGVtaXR0ZXIuZmlyZShbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnLCBuYW1lOiAnQWNtZSBDbGF1ZGUnIH1dKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHJlZ2lzdHJ5LCBwcm94eS5zdGFydFByb3h5LCBsb2cpO1xuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZy5tb2RlbHMsIFt7IGlkOiAnY2xhdWRlJywgcHJvdmlkZXI6ICdhY21lJywgbmFtZTogJ0FjbWUgQ2xhdWRlJyB9XSk7XG5cdH0pO1xufSk7XG5cbi8qKlxuICogQ292ZXJzIHRoZSBsYXVuY2hlcidzIGxhenkgbWVtb2l6YXRpb24gYW5kIGRpc3Bvc2FsIG9mIHRoZSBzaGFyZWQgQllPSyBwcm94eVxuICogaGFuZGxlOiBjb25jdXJyZW50IGxhdW5jaGVzIHNoYXJlIG9uZSBiaW5kLCBhbmRcbiAqIHtAbGluayBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyLmRpc3Bvc2VCeW9rUHJveHlIYW5kbGV9IChjYWxsZWQgYnkgdGhlIGFnZW50XG4gKiBhZnRlciB0aGUgcnVudGltZSBzdWJwcm9jZXNzIHN0b3BzKSByZWxlYXNlcyBpdCBzbyB0aGUgbmV4dCBsYXVuY2ggbWludHMgYVxuICogZnJlc2ggbm9uY2UuXG4gKi9cbnN1aXRlKCdDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIEJZT0sgcHJveHkgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzLTEnO1xuXG5cdC8qKlxuXHQgKiBBIGJyaWRnZSBjb25uZWN0aW9uIHRoYXQgcHVzaGVzIGBtb2RlbHNgIGFzIGl0cyBzbmFwc2hvdCBzeW5jaHJvbm91c2x5IHdoZW5cblx0ICogdGhlIHJlZ2lzdHJ5IHN1YnNjcmliZXM7IHRoZSBiYWNraW5nIGVtaXR0ZXIgaXMgb3duZWQgYnkgYHN0b3JlYC5cblx0ICovXG5cdGZ1bmN0aW9uIGNvbm5lY3Rpb25PZihzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBtb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXSk6IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uIHtcblx0XHRjb25zdCBlbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElCeW9rTG1Nb2RlbEluZm9bXT4oe1xuXHRcdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiBlbWl0dGVyLmZpcmUobW9kZWxzKSxcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHsgY2hhdDogYXN5bmMgKCk6IFByb21pc2U8SUJ5b2tMbUNoYXRSZXN1bHQ+ID0+ICh7IG91dHB1dDogW10gfSksIG9uRGlkQ2hhbmdlTW9kZWxzOiBlbWl0dGVyLmV2ZW50IH07XG5cdH1cblxuXHQvKiogQSBmYWtlIHByb3h5IHNlcnZpY2Ugd2hvc2UgaGFuZGxlcyBjYXJyeSBhIHVuaXF1ZSBub25jZSBwZXIgYHN0YXJ0KClgLiAqL1xuXHRmdW5jdGlvbiBmYWtlUHJveHlTZXJ2aWNlKCkge1xuXHRcdGxldCBzdGFydHMgPSAwO1xuXHRcdGxldCBkaXNwb3NlcyA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZTogSUJ5b2tMbVByb3h5U2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXJ0OiBhc3luYyAoKTogUHJvbWlzZTxJQnlva0xtUHJveHlIYW5kbGU+ID0+IHtcblx0XHRcdFx0Y29uc3Qgbm9uY2UgPSBgTk9OQ0UtJHsrK3N0YXJ0c31gO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGJhc2VVcmw6ICdodHRwOi8vMTI3LjAuMC4xOjEnLFxuXHRcdFx0XHRcdG5vbmNlLFxuXHRcdFx0XHRcdHByb3ZpZGVyQmFzZVVybDogdmVuZG9yID0+IGBodHRwOi8vMTI3LjAuMC4xOjEvdi8ke3ZlbmRvcn1gLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgZGlzcG9zZXMrKzsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBnZXQgc3RhcnRzKCkgeyByZXR1cm4gc3RhcnRzOyB9LCBnZXQgZGlzcG9zZXMoKSB7IHJldHVybiBkaXNwb3NlczsgfSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTGF1bmNoZXIoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgcHJveHk6IElCeW9rTG1Qcm94eVNlcnZpY2UsIHJlZ2lzdHJ5OiBJQnlva0xtQnJpZGdlUmVnaXN0cnkpOiBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJQnlva0xtUHJveHlTZXJ2aWNlLCBwcm94eSk7XG5cdFx0c2VydmljZXMuc2V0KElCeW9rTG1CcmlkZ2VSZWdpc3RyeSwgcmVnaXN0cnkpO1xuXHRcdC8vIFRoZSBsYXVuY2hlcidzIG90aGVyIGRlcGVuZGVuY2llcyBhcmUgdW51c2VkIGJ5IHRoZSBCWU9LIHBhdGggYW5kXG5cdFx0Ly8gcmVzb2x2ZSB0byBgdW5kZWZpbmVkYCB1bmRlciB0aGUgbm9uLXN0cmljdCBJbnN0YW50aWF0aW9uU2VydmljZS5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdFNlc3Npb25MYXVuY2hlcik7XG5cdH1cblxuXHR0ZXN0KCdtZW1vaXplcyB0aGUgaGFuZGxlLCBhbmQgZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSByZWxlYXNlcyBpdCBzbyB0aGUgbmV4dCBsYXVuY2ggbWludHMgYSBmcmVzaCBub25jZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm94eSA9IGZha2VQcm94eVNlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LTEnLCBjb25uZWN0aW9uT2Yoc3RvcmUsIFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0pKSk7XG5cdFx0Y29uc3QgbGF1bmNoZXIgPSBjcmVhdGVMYXVuY2hlcihzdG9yZSwgcHJveHkuc2VydmljZSwgcmVnaXN0cnkpO1xuXHRcdGNvbnN0IHJlc29sdmUgPSAoKSA9PiAobGF1bmNoZXIgYXMgdW5rbm93biBhcyB7IF9yZXNvbHZlQnlva1Nlc3Npb25Db25maWcoaWQ6IHN0cmluZyk6IFByb21pc2U8eyBwcm92aWRlcnM/OiB7IGJlYXJlclRva2VuOiBzdHJpbmcgfVtdIH0+IH0pLl9yZXNvbHZlQnlva1Nlc3Npb25Db25maWcoc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgcmVzb2x2ZSgpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHJlc29sdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuc3RhcnRzLCAxLCAnc3Vic2VxdWVudCBsYXVuY2hlcyBzaGFyZSB0aGUgbWVtb2l6ZWQgYmluZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wcm92aWRlcnMhWzBdLmJlYXJlclRva2VuLCBzZWNvbmQucHJvdmlkZXJzIVswXS5iZWFyZXJUb2tlbiwgJ3RoZSBzaGFyZWQgYmluZCByZXVzZXMgb25lIG5vbmNlJyk7XG5cblx0XHRhd2FpdCBsYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0YXdhaXQgbGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS5kaXNwb3NlcywgMSwgJ3RoZSBoYW5kbGUgaXMgcmVsZWFzZWQgZXhhY3RseSBvbmNlIGFuZCBkaXNwb3NhbCBpcyBpZGVtcG90ZW50Jyk7XG5cblx0XHRjb25zdCB0aGlyZCA9IGF3YWl0IHJlc29sdmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuc3RhcnRzLCAyLCAnYSBmcmVzaCBiaW5kIGlzIG1pbnRlZCBhZnRlciBkaXNwb3NhbCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0aGlyZC5wcm92aWRlcnMhWzBdLmJlYXJlclRva2VuLCBmaXJzdC5wcm92aWRlcnMhWzBdLmJlYXJlclRva2VuLCAndGhlIGZyZXNoIGJpbmQgY2FycmllcyBhIG5ldyBub25jZScpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ29waWxvdFNlc3Npb25MYXVuY2hlciBjbGllbnQgaWRlbnRpdHknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFzc2VzIHRoZSBBZ2VudCBIb3N0IGNsaWVudCBuYW1lIHRvIGNyZWF0ZSBhbmQgcmVzdW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZUNvbmZpZ3M6IFBhcmFtZXRlcnM8Q29waWxvdENsaWVudFsnY3JlYXRlU2Vzc2lvbiddPlswXVtdID0gW107XG5cdFx0Y29uc3QgcmVzdW1lQ29uZmlnczogUGFyYW1ldGVyczxDb3BpbG90Q2xpZW50WydyZXN1bWVTZXNzaW9uJ10+WzFdW10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdG9uOiAoKSA9PiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNjb25uZWN0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdGNyZWF0ZVNlc3Npb246IGFzeW5jIChjb25maWc6IFBhcmFtZXRlcnM8Q29waWxvdENsaWVudFsnY3JlYXRlU2Vzc2lvbiddPlswXSkgPT4ge1xuXHRcdFx0XHRjcmVhdGVDb25maWdzLnB1c2goY29uZmlnKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9LFxuXHRcdFx0cmVzdW1lU2Vzc2lvbjogYXN5bmMgKF9zZXNzaW9uSWQ6IHN0cmluZywgY29uZmlnOiBQYXJhbWV0ZXJzPENvcGlsb3RDbGllbnRbJ3Jlc3VtZVNlc3Npb24nXT5bMV0pID0+IHtcblx0XHRcdFx0cmVzdW1lQ29uZmlncy5wdXNoKGNvbmZpZyk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhdW5jaGVyID0gY3JlYXRlVGVzdExhdW5jaGVyKCk7XG5cdFx0Y29uc3QgcGx1Z2luRGlyID0gVVJJLmZpbGUoJy90bXAvc3luY2VkLWN1c3RvbWl6YXRpb25zJyk7XG5cdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkuam9pblBhdGgocGx1Z2luRGlyLCAnc2tpbGxzJywgJ3VzZXItc2tpbGwnLCAnU0tJTEwubWQnKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvblVyaSA9IFVSSS5qb2luUGF0aChwbHVnaW5EaXIsICdydWxlcycsICd1c2VyLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IHBsdWdpbjogSUNvcGlsb3RQbHVnaW5JbmZvID0ge1xuXHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdGhvb2tzOiBbXSxcblx0XHRcdG1jcFNlcnZlcnM6IFtdLFxuXHRcdFx0YWdlbnRzOiBbXSxcblx0XHRcdHNraWxsczogW3tcblx0XHRcdFx0dXJpOiBza2lsbFVyaSxcblx0XHRcdFx0bmFtZTogJ3VzZXItc2tpbGwnLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCBpZDogc2tpbGxVcmkudG9TdHJpbmcoKSwgdXJpOiBza2lsbFVyaS50b1N0cmluZygpLCBuYW1lOiAndXNlci1za2lsbCcgfSxcblx0XHRcdH1dLFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiBbe1xuXHRcdFx0XHR1cmk6IGluc3RydWN0aW9uVXJpLFxuXHRcdFx0XHRuYW1lOiAndXNlcicsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUnVsZSwgaWQ6IGluc3RydWN0aW9uVXJpLnRvU3RyaW5nKCksIHVyaTogaW5zdHJ1Y3Rpb25VcmkudG9TdHJpbmcoKSwgbmFtZTogJ3VzZXInLCBhbHdheXNBcHBseTogdHJ1ZSB9LFxuXHRcdFx0fV0sXG5cdFx0XHRwbHVnaW5EaXIsXG5cdFx0fTtcblx0XHRjb25zdCBiYXNlUGxhbiA9IHtcblx0XHRcdGNsaWVudCxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0ZXN0V29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRzbmFwc2hvdDogeyB0b29sczogW10sIHBsdWdpbnM6IFtwbHVnaW5dLCBtY3BTZXJ2ZXJzOiB7fSB9LFxuXHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKSxcblx0XHRcdHNoZWxsTWFuYWdlcjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0aHViVG9rZW46IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNyZWF0ZVBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiA9IHtcblx0XHRcdC4uLmJhc2VQbGFuLFxuXHRcdFx0a2luZDogJ2NyZWF0ZScsXG5cdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdW1lUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuID0ge1xuXHRcdFx0Li4uYmFzZVBsYW4sXG5cdFx0XHRraW5kOiAncmVzdW1lJyxcblx0XHRcdGZhbGxiYWNrOiB7IG1vZGVsOiB1bmRlZmluZWQgfSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHNlc3Npb25zLmFkZChhd2FpdCBsYXVuY2hlci5sYXVuY2goY3JlYXRlUGxhbiwgdGVzdFJ1bnRpbWUpKTtcblx0XHRcdHNlc3Npb25zLmFkZChhd2FpdCBsYXVuY2hlci5sYXVuY2gocmVzdW1lUGxhbiwgdGVzdFJ1bnRpbWUpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNyZWF0ZUNsaWVudE5hbWU6IGNyZWF0ZUNvbmZpZ3NbMF0uY2xpZW50TmFtZSxcblx0XHRcdFx0Y3JlYXRlUGx1Z2luRGlyZWN0b3JpZXM6IGNyZWF0ZUNvbmZpZ3NbMF0ucGx1Z2luRGlyZWN0b3JpZXMsXG5cdFx0XHRcdGNyZWF0ZVNraWxsRGlyZWN0b3JpZXM6IGNyZWF0ZUNvbmZpZ3NbMF0uc2tpbGxEaXJlY3Rvcmllcyxcblx0XHRcdFx0Y3JlYXRlSW5zdHJ1Y3Rpb25EaXJlY3RvcmllczogY3JlYXRlQ29uZmlnc1swXS5pbnN0cnVjdGlvbkRpcmVjdG9yaWVzLFxuXHRcdFx0XHRyZXN1bWVDbGllbnROYW1lOiByZXN1bWVDb25maWdzWzBdLmNsaWVudE5hbWUsXG5cdFx0XHRcdHJlc3VtZVBsdWdpbkRpcmVjdG9yaWVzOiByZXN1bWVDb25maWdzWzBdLnBsdWdpbkRpcmVjdG9yaWVzLFxuXHRcdFx0XHRyZXN1bWVTa2lsbERpcmVjdG9yaWVzOiByZXN1bWVDb25maWdzWzBdLnNraWxsRGlyZWN0b3JpZXMsXG5cdFx0XHRcdHJlc3VtZUluc3RydWN0aW9uRGlyZWN0b3JpZXM6IHJlc3VtZUNvbmZpZ3NbMF0uaW5zdHJ1Y3Rpb25EaXJlY3Rvcmllcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y3JlYXRlQ2xpZW50TmFtZTogJ3ZzY29kZS1hZ2VudC1ob3N0Jyxcblx0XHRcdFx0Y3JlYXRlUGx1Z2luRGlyZWN0b3JpZXM6IFtwbHVnaW5EaXIuZnNQYXRoXSxcblx0XHRcdFx0Y3JlYXRlU2tpbGxEaXJlY3RvcmllczogW10sXG5cdFx0XHRcdGNyZWF0ZUluc3RydWN0aW9uRGlyZWN0b3JpZXM6IFtVUkkuam9pblBhdGgocGx1Z2luRGlyLCAncnVsZXMnKS5mc1BhdGhdLFxuXHRcdFx0XHRyZXN1bWVDbGllbnROYW1lOiAndnNjb2RlLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRyZXN1bWVQbHVnaW5EaXJlY3RvcmllczogW3BsdWdpbkRpci5mc1BhdGhdLFxuXHRcdFx0XHRyZXN1bWVTa2lsbERpcmVjdG9yaWVzOiBbXSxcblx0XHRcdFx0cmVzdW1lSW5zdHJ1Y3Rpb25EaXJlY3RvcmllczogW1VSSS5qb2luUGF0aChwbHVnaW5EaXIsICdydWxlcycpLmZzUGF0aF0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2Vzc2lvbnMuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgbGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcblxuc3VpdGUoJ0NvcGlsb3RTZXNzaW9uTGF1bmNoZXIgcmVzdW1lIGZhbGxiYWNrJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIFRlc3RTZGtFcnJvciBleHRlbmRzIEVycm9yIHtcblx0XHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcsIHJlYWRvbmx5IGNvZGU6IG51bWJlcikge1xuXHRcdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlUmVzdW1lRmFpbGluZ0xhdW5jaChtZXNzYWdlOiBzdHJpbmcsIGNvZGUgPSAtMzI2MDMpOiB7IHJlYWRvbmx5IGxhdW5jaGVyOiBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyOyByZWFkb25seSBwbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW47IHJlYWRvbmx5IGdldENyZWF0ZVNlc3Npb25DYWxsczogKCkgPT4gbnVtYmVyIH0ge1xuXHRcdGxldCBjcmVhdGVTZXNzaW9uQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0b246ICgpID0+ICgpID0+IHsgfSxcblx0XHRcdGRpc2Nvbm5lY3Q6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdFNlc3Npb247XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0Y3JlYXRlU2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjcmVhdGVTZXNzaW9uQ2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9LFxuXHRcdFx0cmVzdW1lU2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgVGVzdFNka0Vycm9yKG1lc3NhZ2UsIGNvZGUpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYXVuY2hlcjogY3JlYXRlVGVzdExhdW5jaGVyKCksXG5cdFx0XHRwbGFuOiB7XG5cdFx0XHRcdGNsaWVudCxcblx0XHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGVzdFdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNuYXBzaG90OiB7IHRvb2xzOiBbXSwgcGx1Z2luczogW10sIG1jcFNlcnZlcnM6IHt9IH0sXG5cdFx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IG5ldyBBY3RpdmVDbGllbnRUb29sU2V0KCksXG5cdFx0XHRcdHNoZWxsTWFuYWdlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRodWJUb2tlbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRraW5kOiAncmVzdW1lJyxcblx0XHRcdFx0ZmFsbGJhY2s6IHsgbW9kZWw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0fSxcblx0XHRcdGdldENyZWF0ZVNlc3Npb25DYWxsczogKCkgPT4gY3JlYXRlU2Vzc2lvbkNhbGxzLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGNyZWF0ZVNlc3Npb24gYWZ0ZXIgYSBTdGFydCBPdmVyIHRydW5jYXRlIGxlYXZlcyB0aGUgc2Vzc2lvbiBlbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGxhdW5jaGVyLCBwbGFuLCBnZXRDcmVhdGVTZXNzaW9uQ2FsbHMgfSA9IGNyZWF0ZVJlc3VtZUZhaWxpbmdMYXVuY2goYFJlcXVlc3Qgc2Vzc2lvbi5yZXN1bWUgZmFpbGVkIHdpdGggbWVzc2FnZTogTG9jYWxScGNTZXNzaW9uOiAnc2Vzc2lvbi5nZXRNZXNzYWdlcycgcmV0dXJuZWQgbm8gZXZlbnRzIGZvciBzZXNzaW9uIHNlc3Npb24tMWApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHNlc3Npb25zLmFkZChhd2FpdCBsYXVuY2hlci5sYXVuY2gocGxhbiwgdGVzdFJ1bnRpbWUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDcmVhdGVTZXNzaW9uQ2FsbHMoKSwgMSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNlc3Npb25zLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IGxhdW5jaGVyLmRpc3Bvc2VCeW9rUHJveHlIYW5kbGUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gY3JlYXRlU2Vzc2lvbiBmb3IgYW4gdW5rbm93biAtMzI2MDMgZnJvbSByZXN1bWVTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbGF1bmNoZXIsIHBsYW4sIGdldENyZWF0ZVNlc3Npb25DYWxscyB9ID0gY3JlYXRlUmVzdW1lRmFpbGluZ0xhdW5jaCgnUmVxdWVzdCBzZXNzaW9uLnJlc3VtZSBmYWlsZWQ6IHNvbWV0aGluZyB3ZW50IHdyb25nJyk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvbnMuYWRkKGF3YWl0IGxhdW5jaGVyLmxhdW5jaChwbGFuLCB0ZXN0UnVudGltZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENyZWF0ZVNlc3Npb25DYWxscygpLCAxKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2Vzc2lvbnMuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgbGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVwbGFjZSBhIGNvcnJ1cHRlZCBzZXNzaW9uIGZpbGUgd2l0aCBhbiBlbXB0eSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbGF1bmNoZXIsIHBsYW4sIGdldENyZWF0ZVNlc3Npb25DYWxscyB9ID0gY3JlYXRlUmVzdW1lRmFpbGluZ0xhdW5jaCgnUmVxdWVzdCBzZXNzaW9uLnJlc3VtZSBmYWlsZWQgd2l0aCBtZXNzYWdlOiBTZXNzaW9uIGZpbGUgaXMgY29ycnVwdGVkIChsaW5lIDE5NTY3OiBkYXRhLmNvbXBhY3Rpb25Ub2tlbnNVc2VkLmNvcGlsb3RVc2FnZS50b2tlbkRldGFpbHMuMC5iYXRjaFNpemU6IE51bWJlciBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwKScpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGxhdW5jaGVyLmxhdW5jaChwbGFuLCB0ZXN0UnVudGltZSksIC9TZXNzaW9uIGZpbGUgaXMgY29ycnVwdGVkLyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q3JlYXRlU2Vzc2lvbkNhbGxzKCksIDApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBsYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG4vKipcbiAqIENvdmVycyB0aGUgcmVhc29uaW5nLWVmZm9ydCByZXNvbHV0aW9uIGZlZCBpbnRvIGBjcmVhdGVTZXNzaW9uYCBhbmRcbiAqIGBDb3BpbG90QWdlbnQuX2NoYW5nZU1vZGVsYDogdGhlIGhvc3QtbGV2ZWwgb3ZlcnJpZGUgKHNlZVxuICogYENvcGlsb3RDbGlDb25maWdLZXkuUmVhc29uaW5nRWZmb3J0T3ZlcnJpZGVgKSB3aW5zIG92ZXIgdGhlIG1vZGVsIHBpY2tlcidzXG4gKiB0aGlua2luZyBsZXZlbCB3aGVuIHZhbGlkLCBhbmQgZGVncmFkZXMgdG8gdGhlIHBpY2tlciB2YWx1ZSBvdGhlcndpc2UuXG4gKi9cbnN1aXRlKCdnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2EgdmFsaWQgb3ZlcnJpZGUgd2lucyBvdmVyIHRoZSBwaWNrZXIgdmFsdWU7IGFuIGludmFsaWQgb3IgYWJzZW50IG92ZXJyaWRlIGZhbGxzIGJhY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWw6IE1vZGVsU2VsZWN0aW9uID0geyBpZDogJ2dwdC01JywgY29uZmlnOiB7IHRoaW5raW5nTGV2ZWw6ICdtZWRpdW0nIH0gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0KG1vZGVsKSxcblx0XHRcdFx0Z2V0Q29waWxvdFJlYXNvbmluZ0VmZm9ydChtb2RlbCwgJ3hoaWdoJyksXG5cdFx0XHRcdGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsICd0dXJibycpLFxuXHRcdFx0XHRnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0KHVuZGVmaW5lZCwgJ2hpZ2gnKSxcblx0XHRcdFx0Z2V0Q29waWxvdFJlYXNvbmluZ0VmZm9ydCh1bmRlZmluZWQpLFxuXHRcdFx0XSxcblx0XHRcdFsnbWVkaXVtJywgJ3hoaWdoJywgJ21lZGl1bScsICdoaWdoJywgdW5kZWZpbmVkXVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYSxzQkFB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
