import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { PluginFormat } from "../../../../../../platform/agentPlugins/common/pluginParsers.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { resolveCustomizationRefs, shouldSyncWorkspaceDotMcp } from "../../../browser/agentSessions/agentHost/agentHostLocalCustomizations.js";
import { BUILTIN_STORAGE } from "../../../common/aiCustomizationWorkspaceService.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { McpServerTransportType } from "../../../../mcp/common/mcpTypes.js";
import { ConfigurationResolverExpression } from "../../../../../services/configurationResolver/common/configurationResolverExpression.js";
import { SessionType } from "../../../common/chatSessionsService.js";
function makePromptPath(uri, type, storage) {
  return { uri, type, storage };
}
function makeConfigurationResolverService(resolutions = {}) {
  return {
    async resolveAsync(_folder, config) {
      const expr = ConfigurationResolverExpression.parse(config);
      for (const replacement of expr.unresolved()) {
        if (Object.prototype.hasOwnProperty.call(resolutions, replacement.id)) {
          expr.resolve(replacement, resolutions[replacement.id]);
        } else if (replacement.name === "input" || replacement.name === "command") {
          expr.resolve(replacement, replacement.id);
        }
      }
      return expr.toObject();
    }
  };
}
function makePromptsService(files) {
  return {
    async listPromptFilesForStorage(type, storage) {
      return files.get(`${type}/${storage}`) ?? [];
    }
  };
}
class FakeSyncProvider {
  constructor(_disabled = /* @__PURE__ */ new Set()) {
    this._disabled = _disabled;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  isDisabled(uri) {
    return this._disabled.has(uri.toString());
  }
  setDisabled() {
  }
}
function makeAgentPluginService(plugins = []) {
  return {
    _serviceBrand: void 0,
    plugins: observableValue("plugins", plugins),
    enablementModel: { isEnabled: () => true, setEnabled: () => {
    } }
  };
}
function makePlugin(uri, options = {}) {
  const { label = "Plugin", enabled = true, mcpServers = 0 } = options;
  return {
    uri,
    format: PluginFormat.Copilot,
    label,
    enablement: observableValue("enablement", enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile),
    mcpServerDefinitions: observableValue("mcpServers", new Array(mcpServers).fill({}))
  };
}
function makeFileService(stats = /* @__PURE__ */ new Map()) {
  return {
    async stat(uri) {
      const known = stats.get(uri.toString());
      if (known) {
        return known;
      }
      throw new Error(`no stat for ${uri.toString()}`);
    }
  };
}
function makeMcpServer(options) {
  const { id, collectionId, label = id, enabled = true, launch, configTarget = ConfigurationTarget.USER } = options;
  const collection = { id: collectionId, label: collectionId, order: 0, configTarget };
  const definitions = observableValue("definitions", { server: launch ? { launch } : void 0, collection });
  return {
    definition: { id, label },
    collection: { id: collectionId, label: collectionId, order: 0 },
    enablement: observableValue("enablement", enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile),
    readDefinitions: () => definitions
  };
}
function makeMcpService(servers = []) {
  return {
    _serviceBrand: void 0,
    servers: observableValue("servers", servers)
  };
}
const stdioLaunch = {
  type: McpServerTransportType.Stdio,
  command: "my-server",
  args: ["--flag"],
  env: {},
  envFile: void 0,
  cwd: void 0,
  sandbox: void 0
};
const stdioLaunchWithInput = {
  type: McpServerTransportType.Stdio,
  command: "my-server",
  args: ["--token", "${input:token}"],
  env: {},
  envFile: void 0,
  cwd: void 0,
  sandbox: void 0
};
const stdioLaunchWithFolder = {
  type: McpServerTransportType.Stdio,
  command: "my-server",
  args: ["--root", "${workspaceFolder}"],
  env: {},
  envFile: void 0,
  cwd: void 0,
  sandbox: void 0
};
class FakeBundler {
  constructor(_result = { uri: "open-plugin://bundle", name: "Open Plugin" }) {
    this._result = _result;
    this.received = [];
    this.receivedMcp = [];
  }
  async bundle(files, mcpServers = []) {
    this.received.push([...files]);
    this.receivedMcp.push([...mcpServers]);
    if (!this._result) {
      return void 0;
    }
    return { ref: { type: "plugin", id: this._result.uri, uri: this._result.uri, name: this._result.name, enabled: true }, paths: [] };
  }
}
suite("resolveCustomizationRefs - built-in skills", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes built-in skills to the bundler as loose files", async () => {
    const builtin = URI.file("/builtin/create-pr/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE)]]
    ]));
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.received[0].map((f) => ({ uri: f.uri.toString(), type: f.type })), [
      { uri: builtin.toString(), type: PromptsType.skill }
    ]);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].name, "Open Plugin");
  });
  test("omits disabled built-in skills from the bundle", async () => {
    const enabled = URI.file("/builtin/create-pr/SKILL.md");
    const disabled = URI.file("/builtin/merge/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
        makePromptPath(enabled, PromptsType.skill, BUILTIN_STORAGE),
        makePromptPath(disabled, PromptsType.skill, BUILTIN_STORAGE)
      ]]
    ]));
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(/* @__PURE__ */ new Set([disabled.toString()])),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.deepStrictEqual(bundler.received[0].map((f) => f.uri.toString()), [enabled.toString()]);
  });
  test("combines built-in skills with user files in a single bundle", async () => {
    const userAgent = URI.file("/user/agents/foo.agent.md");
    const builtin = URI.file("/builtin/merge/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.agent}/${PromptsStorage.extension}`, [makePromptPath(userAgent, PromptsType.agent, PromptsStorage.extension)]],
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE)]]
    ]));
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(
      bundler.received[0].map((f) => ({ uri: f.uri.toString(), type: f.type })).sort((a, b) => a.uri.localeCompare(b.uri)),
      [
        { uri: builtin.toString(), type: PromptsType.skill },
        { uri: userAgent.toString(), type: PromptsType.agent }
      ].sort((a, b) => a.uri.localeCompare(b.uri))
    );
  });
  test("includes enabled user files only when user storage is enabled", async () => {
    const enabled = URI.file("/home/user/.copilot/instructions/enabled.instructions.md");
    const disabled = URI.file("/home/user/.claude/rules/disabled.instructions.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.instructions}/${PromptsStorage.user}`, [
        makePromptPath(enabled, PromptsType.instructions, PromptsStorage.user),
        makePromptPath(disabled, PromptsType.instructions, PromptsStorage.user)
      ]]
    ]));
    const syncProvider = new FakeSyncProvider(/* @__PURE__ */ new Set([disabled.toString()]));
    const localBundler = new FakeBundler();
    const remoteBundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      syncProvider,
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      localBundler,
      SessionType.CopilotCLI
    );
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      syncProvider,
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      remoteBundler,
      SessionType.CopilotCLI,
      false,
      { includeUserStorage: true }
    );
    assert.deepStrictEqual({
      local: localBundler.received,
      remote: remoteBundler.received[0].map((file) => ({ uri: file.uri.toString(), source: file.source }))
    }, {
      local: [],
      remote: [{ uri: enabled.toString(), source: PromptsStorage.user }]
    });
  });
  test("skips bundler call entirely when only disabled built-ins exist", async () => {
    const builtin = URI.file("/builtin/create-pr/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE)]]
    ]));
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(/* @__PURE__ */ new Set([builtin.toString()])),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
    assert.deepStrictEqual(refs, []);
  });
  test("includes plugins that only contribute MCP servers", async () => {
    const pluginUri = URI.file("/plugins/mcp-only");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map());
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { label: "MCP Only", mcpServers: 1 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
    assert.deepStrictEqual(refs.map((r) => ({ uri: r.uri, name: r.name })), [
      { uri: pluginUri.toString(), name: "MCP Only" }
    ]);
  });
  test("omits MCP-only plugins that are disabled by enablement", async () => {
    const pluginUri = URI.file("/plugins/mcp-disabled");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { enabled: false, mcpServers: 1 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI
    );
    assert.deepStrictEqual(refs, []);
  });
  test("omits plugins with prompt-file contributions that are disabled by enablement", async () => {
    const pluginUri = URI.file("/plugins/prompt-disabled");
    const promptFile = URI.file("/plugins/prompt-disabled/skills/foo/SKILL.md");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map([
        [`${PromptsType.skill}/${PromptsStorage.plugin}`, [makePromptPath(promptFile, PromptsType.skill, PromptsStorage.plugin)]]
      ])),
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { enabled: false })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI
    );
    assert.deepStrictEqual(refs, []);
  });
  test("omits MCP-only plugins that the user opted out of syncing", async () => {
    const pluginUri = URI.file("/plugins/mcp-opted-out");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(/* @__PURE__ */ new Set([pluginUri.toString()])),
      makeAgentPluginService([makePlugin(pluginUri, { mcpServers: 1 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI
    );
    assert.deepStrictEqual(refs, []);
  });
  test("does not duplicate a plugin that contributes both prompt files and MCP servers", async () => {
    const pluginUri = URI.file("/plugins/combined");
    const promptFile = URI.file("/plugins/combined/skills/foo.skill.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${PromptsStorage.plugin}`, [makePromptPath(promptFile, PromptsType.skill, PromptsStorage.plugin)]]
    ]));
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { label: "Combined", mcpServers: 2 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI
    );
    assert.deepStrictEqual(refs.map((r) => r.uri), [pluginUri.toString()]);
  });
  test("we honor the cancellation token contract by passing it through to listPromptFilesForStorage", async () => {
    const promptsService = makePromptsService(/* @__PURE__ */ new Map());
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI
    );
    assert.deepStrictEqual(refs, []);
    assert.ok(CancellationToken.None.isCancellationRequested === false);
  });
  test("bundles MCP servers configured directly in VS Code", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "user.my-server", collectionId: "user", label: "my-server", launch: stdioLaunch })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "my-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 } }
    ]);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].name, "Open Plugin");
  });
  test("excludes plugin-sourced MCP servers from the bundle", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "plugin.foo.srv", collectionId: "plugin.file:///plugins/foo", label: "srv", launch: stdioLaunch })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
    assert.deepStrictEqual(refs, []);
  });
  test("excludes disabled MCP servers from the bundle", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "user.off", collectionId: "user", label: "off", enabled: false, launch: stdioLaunch })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("excludes workspace-discovered `.mcp.json` servers (the agent host discovers those itself)", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wsdot.srv", collectionId: "workspace-dot-mcp.0", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("excludes `.code-workspace` configured servers", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wscfg.srv", collectionId: "mcp.config.workspace", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("includes workspace-discovered `.mcp.json` servers when includeWorkspaceDotMcp is set (multi-root gate)", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wsdot.srv", collectionId: "workspace-dot-mcp.0", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      true
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "srv", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 } }
    ]);
    assert.strictEqual(refs.length, 1);
  });
  test("still excludes `.code-workspace` servers even when includeWorkspaceDotMcp is set", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wscfg.srv", collectionId: "mcp.config.workspace", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      true
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("syncs `.vscode/mcp.json` servers that resolve without user interaction", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.my-server", collectionId: "mcp.config.ws0", label: "my-server", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "my-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 } }
    ]);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].name, "Open Plugin");
  });
  test("excludes `.vscode/mcp.json` servers with variables that require interaction (e.g. ${input:\u2026})", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.needs-input", collectionId: "mcp.config.ws0", label: "needs-input", launch: stdioLaunchWithInput, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("syncs `.vscode/mcp.json` servers after resolving non-interactive variables (e.g. ${workspaceFolder})", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.folder", collectionId: "mcp.config.ws0", label: "folder-server", launch: stdioLaunchWithFolder, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService({ "${workspaceFolder}": "/ws" }),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "folder-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--root", "/ws"], env: void 0, envFile: void 0, cwd: void 0 } }
    ]);
    assert.strictEqual(refs.length, 1);
  });
  test("excludes `.vscode/mcp.json` servers when variable resolution throws", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.folder", collectionId: "mcp.config.ws0", label: "folder-server", launch: stdioLaunchWithFolder, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const throwingResolver = {
      async resolveAsync() {
        throw new Error("no workspace folder");
      }
    };
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      throwingResolver,
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("still syncs extension-contributed servers (workspace scope, user config target)", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "ext.foo.srv", collectionId: "ext.foo", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.USER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0].map((s) => s.name), ["srv"]);
    assert.strictEqual(refs.length, 1);
  });
});
suite("shouldSyncWorkspaceDotMcp - multi-root gate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const LOCAL_COPILOT = "agent-host-copilotcli";
  test("true only for local Copilot + multi-root workspace + setting enabled", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, 2, true), true);
  });
  test("false when the multi-root setting is disabled", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, 2, false), false);
  });
  test("false for a single-folder workspace", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, 1, true), false);
  });
  test("false for an empty workspace", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, 0, true), false);
  });
  test("false for a non-Copilot harness (e.g. Claude)", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp("agent-host-claude", 2, true), false);
  });
  test("false for the Copilot CLI (extension host) harness", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp("copilotcli", 2, true), false);
  });
  test("false for a remote Copilot Agent Host session", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp("remote-myauthority-copilotcli", 2, true), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUGx1Z2luRm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcywgc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0TG9jYWxDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgeyB0eXBlIElTeW5jYWJsZUZpbGUsIHR5cGUgSVN5bmNhYmxlTWNwU2VydmVyLCB0eXBlIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlci5qcyc7XG5pbXBvcnQgeyBCVUlMVElOX1NUT1JBR0UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudFBsdWdpbiwgdHlwZSBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyB0eXBlIElQcm9tcHRQYXRoLCB0eXBlIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJTWNwU2VydmVyLCB0eXBlIElNY3BTZXJ2aWNlLCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIG1ha2VQcm9tcHRQYXRoKHVyaTogVVJJLCB0eXBlOiBQcm9tcHRzVHlwZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UpOiBJUHJvbXB0UGF0aCB7XG5cdHJldHVybiB7IHVyaSwgdHlwZSwgc3RvcmFnZSB9IGFzIElQcm9tcHRQYXRoO1xufVxuXG4vKipcbiAqIEEgZmFrZSB7QGxpbmsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2V9IHdob3NlIGByZXNvbHZlQXN5bmNgIG1pcnJvcnMgdGhlXG4gKiByZWFsIHNlcnZpY2U6IGl0IHJlc29sdmVzIHRoZSBnaXZlbiBgJHsuLi59YCB2YXJpYWJsZXMgZnJvbSBgcmVzb2x1dGlvbnNgIGFuZFxuICogbGVhdmVzIGFueSBvdGhlcnMgKGUuZy4gYCR7aW5wdXQ6XHUyMDI2fWApIHVudG91Y2hlZCBzbyB0aGV5IHJlbWFpbiB1bnJlc29sdmVkLlxuICovXG5mdW5jdGlvbiBtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZShyZXNvbHV0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9KTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIHJlc29sdmVBc3luYyhfZm9sZGVyOiB1bmtub3duLCBjb25maWc6IHVua25vd24pIHtcblx0XHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKGNvbmZpZyBhcyBvYmplY3QpO1xuXHRcdFx0Zm9yIChjb25zdCByZXBsYWNlbWVudCBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc29sdXRpb25zLCByZXBsYWNlbWVudC5pZCkpIHtcblx0XHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIHJlc29sdXRpb25zW3JlcGxhY2VtZW50LmlkXSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVwbGFjZW1lbnQubmFtZSA9PT0gJ2lucHV0JyB8fCByZXBsYWNlbWVudC5uYW1lID09PSAnY29tbWFuZCcpIHtcblx0XHRcdFx0XHQvLyBNaXJyb3IgdGhlIHJlYWwgcmVzb2x2ZXI6IHdpdGhvdXQgYSB2YWx1ZSBtYXBwaW5nLCBpbnRlcmFjdGl2ZVxuXHRcdFx0XHRcdC8vIHZhcmlhYmxlcyBcInJlc29sdmVcIiB0byB0aGVpciBvd24gbGl0ZXJhbCB0ZXh0LCBkcm9wcGluZyBvdXQgb2Zcblx0XHRcdFx0XHQvLyBgdW5yZXNvbHZlZCgpYC5cblx0XHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIHJlcGxhY2VtZW50LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4cHIudG9PYmplY3QoKTtcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9tcHRzU2VydmljZShmaWxlczogUmVhZG9ubHlNYXA8c3RyaW5nLCByZWFkb25seSBJUHJvbXB0UGF0aFtdPik6IElQcm9tcHRzU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0YXN5bmMgbGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh0eXBlOiBQcm9tcHRzVHlwZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UpOiBQcm9taXNlPHJlYWRvbmx5IElQcm9tcHRQYXRoW10+IHtcblx0XHRcdHJldHVybiBmaWxlcy5nZXQoYCR7dHlwZX0vJHtzdG9yYWdlfWApID8/IFtdO1xuXHRcdH0sXG5cdH0gYXMgdW5rbm93biBhcyBJUHJvbXB0c1NlcnZpY2U7XG59XG5cbmNsYXNzIEZha2VTeW5jUHJvdmlkZXIgaW1wbGVtZW50cyBJQ3VzdG9taXphdGlvblN5bmNQcm92aWRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2Rpc2FibGVkOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldCgpKSB7IH1cblx0aXNEaXNhYmxlZCh1cmk6IFVSSSk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZGlzYWJsZWQuaGFzKHVyaS50b1N0cmluZygpKTsgfVxuXHRzZXREaXNhYmxlZCgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxufVxuXG5mdW5jdGlvbiBtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKHBsdWdpbnM6IHJlYWRvbmx5IElBZ2VudFBsdWdpbltdID0gW10pOiBJQWdlbnRQbHVnaW5TZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0cGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5zJywgcGx1Z2lucyksXG5cdFx0ZW5hYmxlbWVudE1vZGVsOiB7IGlzRW5hYmxlZDogKCkgPT4gdHJ1ZSwgc2V0RW5hYmxlZDogKCkgPT4geyAvKiBuby1vcCAqLyB9IH0sXG5cdH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5TZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBtYWtlUGx1Z2luKHVyaTogVVJJLCBvcHRpb25zOiB7IGxhYmVsPzogc3RyaW5nOyBlbmFibGVkPzogYm9vbGVhbjsgbWNwU2VydmVycz86IG51bWJlciB9ID0ge30pOiBJQWdlbnRQbHVnaW4ge1xuXHRjb25zdCB7IGxhYmVsID0gJ1BsdWdpbicsIGVuYWJsZWQgPSB0cnVlLCBtY3BTZXJ2ZXJzID0gMCB9ID0gb3B0aW9ucztcblx0cmV0dXJuIHtcblx0XHR1cmksXG5cdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRsYWJlbCxcblx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUoJ2VuYWJsZW1lbnQnLCBlbmFibGVkID8gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlIDogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSksXG5cdFx0bWNwU2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgnbWNwU2VydmVycycsIG5ldyBBcnJheShtY3BTZXJ2ZXJzKS5maWxsKHt9KSksXG5cdH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW47XG59XG5cbmZ1bmN0aW9uIG1ha2VGaWxlU2VydmljZShzdGF0czogUmVhZG9ubHlNYXA8c3RyaW5nLCB7IG10aW1lOiBudW1iZXIgfT4gPSBuZXcgTWFwKCkpOiBJRmlsZVNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIHN0YXQodXJpOiBVUkkpIHtcblx0XHRcdGNvbnN0IGtub3duID0gc3RhdHMuZ2V0KHVyaS50b1N0cmluZygpKTtcblx0XHRcdGlmIChrbm93bikge1xuXHRcdFx0XHRyZXR1cm4ga25vd247XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vIHN0YXQgZm9yICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZTtcbn1cblxuZnVuY3Rpb24gbWFrZU1jcFNlcnZlcihvcHRpb25zOiB7IGlkOiBzdHJpbmc7IGNvbGxlY3Rpb25JZDogc3RyaW5nOyBsYWJlbD86IHN0cmluZzsgZW5hYmxlZD86IGJvb2xlYW47IGxhdW5jaD86IE1jcFNlcnZlckxhdW5jaCB8IHVuZGVmaW5lZDsgY29uZmlnVGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCB9KTogSU1jcFNlcnZlciB7XG5cdGNvbnN0IHsgaWQsIGNvbGxlY3Rpb25JZCwgbGFiZWwgPSBpZCwgZW5hYmxlZCA9IHRydWUsIGxhdW5jaCwgY29uZmlnVGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSIH0gPSBvcHRpb25zO1xuXHRjb25zdCBjb2xsZWN0aW9uID0geyBpZDogY29sbGVjdGlvbklkLCBsYWJlbDogY29sbGVjdGlvbklkLCBvcmRlcjogMCwgY29uZmlnVGFyZ2V0IH0gYXMgdW5rbm93biBhcyBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbjtcblx0Y29uc3QgZGVmaW5pdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWUoJ2RlZmluaXRpb25zJywgeyBzZXJ2ZXI6IGxhdW5jaCA/IHsgbGF1bmNoIH0gOiB1bmRlZmluZWQsIGNvbGxlY3Rpb24gfSk7XG5cdHJldHVybiB7XG5cdFx0ZGVmaW5pdGlvbjogeyBpZCwgbGFiZWwgfSxcblx0XHRjb2xsZWN0aW9uOiB7IGlkOiBjb2xsZWN0aW9uSWQsIGxhYmVsOiBjb2xsZWN0aW9uSWQsIG9yZGVyOiAwIH0sXG5cdFx0ZW5hYmxlbWVudDogb2JzZXJ2YWJsZVZhbHVlKCdlbmFibGVtZW50JywgZW5hYmxlZCA/IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSA6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUpLFxuXHRcdHJlYWREZWZpbml0aW9uczogKCkgPT4gZGVmaW5pdGlvbnMsXG5cdH0gYXMgdW5rbm93biBhcyBJTWNwU2VydmVyO1xufVxuXG5mdW5jdGlvbiBtYWtlTWNwU2VydmljZShzZXJ2ZXJzOiByZWFkb25seSBJTWNwU2VydmVyW10gPSBbXSk6IElNY3BTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0c2VydmVyczogb2JzZXJ2YWJsZVZhbHVlKCdzZXJ2ZXJzJywgc2VydmVycyksXG5cdH0gYXMgdW5rbm93biBhcyBJTWNwU2VydmljZTtcbn1cblxuY29uc3Qgc3RkaW9MYXVuY2g6IE1jcFNlcnZlckxhdW5jaCA9IHtcblx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0Y29tbWFuZDogJ215LXNlcnZlcicsXG5cdGFyZ3M6IFsnLS1mbGFnJ10sXG5cdGVudjoge30sXG5cdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0Y3dkOiB1bmRlZmluZWQsXG5cdHNhbmRib3g6IHVuZGVmaW5lZCxcbn07XG5cbmNvbnN0IHN0ZGlvTGF1bmNoV2l0aElucHV0OiBNY3BTZXJ2ZXJMYXVuY2ggPSB7XG5cdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdGNvbW1hbmQ6ICdteS1zZXJ2ZXInLFxuXHRhcmdzOiBbJy0tdG9rZW4nLCAnJHtpbnB1dDp0b2tlbn0nXSxcblx0ZW52OiB7fSxcblx0ZW52RmlsZTogdW5kZWZpbmVkLFxuXHRjd2Q6IHVuZGVmaW5lZCxcblx0c2FuZGJveDogdW5kZWZpbmVkLFxufTtcblxuY29uc3Qgc3RkaW9MYXVuY2hXaXRoRm9sZGVyOiBNY3BTZXJ2ZXJMYXVuY2ggPSB7XG5cdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdGNvbW1hbmQ6ICdteS1zZXJ2ZXInLFxuXHRhcmdzOiBbJy0tcm9vdCcsICcke3dvcmtzcGFjZUZvbGRlcn0nXSxcblx0ZW52OiB7fSxcblx0ZW52RmlsZTogdW5kZWZpbmVkLFxuXHRjd2Q6IHVuZGVmaW5lZCxcblx0c2FuZGJveDogdW5kZWZpbmVkLFxufTtcblxuY2xhc3MgRmFrZUJ1bmRsZXIge1xuXHRyZWFkb25seSByZWNlaXZlZDogSVN5bmNhYmxlRmlsZVtdW10gPSBbXTtcblx0cmVhZG9ubHkgcmVjZWl2ZWRNY3A6IElTeW5jYWJsZU1jcFNlcnZlcltdW10gPSBbXTtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcmVzdWx0OiB7IHVyaTogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCA9IHsgdXJpOiAnb3Blbi1wbHVnaW46Ly9idW5kbGUnLCBuYW1lOiAnT3BlbiBQbHVnaW4nIH0pIHsgfVxuXHRhc3luYyBidW5kbGUoZmlsZXM6IHJlYWRvbmx5IElTeW5jYWJsZUZpbGVbXSwgbWNwU2VydmVyczogcmVhZG9ubHkgSVN5bmNhYmxlTWNwU2VydmVyW10gPSBbXSkge1xuXHRcdHRoaXMucmVjZWl2ZWQucHVzaChbLi4uZmlsZXNdKTtcblx0XHR0aGlzLnJlY2VpdmVkTWNwLnB1c2goWy4uLm1jcFNlcnZlcnNdKTtcblx0XHRpZiAoIXRoaXMuX3Jlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVmOiB7IHR5cGU6ICdwbHVnaW4nIGFzIGNvbnN0LCBpZDogdGhpcy5fcmVzdWx0LnVyaSwgdXJpOiB0aGlzLl9yZXN1bHQudXJpIGFzIG5ldmVyLCBuYW1lOiB0aGlzLl9yZXN1bHQubmFtZSwgZW5hYmxlZDogdHJ1ZSB9LCBwYXRoczogW10gfTtcblx0fVxufVxuXG5zdWl0ZSgncmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzIC0gYnVpbHQtaW4gc2tpbGxzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Bhc3NlcyBidWlsdC1pbiBza2lsbHMgdG8gdGhlIGJ1bmRsZXIgYXMgbG9vc2UgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbHRpbiA9IFVSSS5maWxlKCcvYnVpbHRpbi9jcmVhdGUtcHIvU0tJTEwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5za2lsbH0vJHtCVUlMVElOX1NUT1JBR0V9YCwgW21ha2VQcm9tcHRQYXRoKGJ1aWx0aW4sIFByb21wdHNUeXBlLnNraWxsLCBCVUlMVElOX1NUT1JBR0UgYXMgdW5rbm93biBhcyBQcm9tcHRzU3RvcmFnZSldXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZFswXS5tYXAoZiA9PiAoeyB1cmk6IGYudXJpLnRvU3RyaW5nKCksIHR5cGU6IGYudHlwZSB9KSksIFtcblx0XHRcdHsgdXJpOiBidWlsdGluLnRvU3RyaW5nKCksIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmc1swXS5uYW1lLCAnT3BlbiBQbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnb21pdHMgZGlzYWJsZWQgYnVpbHQtaW4gc2tpbGxzIGZyb20gdGhlIGJ1bmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbmFibGVkID0gVVJJLmZpbGUoJy9idWlsdGluL2NyZWF0ZS1wci9TS0lMTC5tZCcpO1xuXHRcdGNvbnN0IGRpc2FibGVkID0gVVJJLmZpbGUoJy9idWlsdGluL21lcmdlL1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbYCR7UHJvbXB0c1R5cGUuc2tpbGx9LyR7QlVJTFRJTl9TVE9SQUdFfWAsIFtcblx0XHRcdFx0bWFrZVByb21wdFBhdGgoZW5hYmxlZCwgUHJvbXB0c1R5cGUuc2tpbGwsIEJVSUxUSU5fU1RPUkFHRSBhcyB1bmtub3duIGFzIFByb21wdHNTdG9yYWdlKSxcblx0XHRcdFx0bWFrZVByb21wdFBhdGgoZGlzYWJsZWQsIFByb21wdHNUeXBlLnNraWxsLCBCVUlMVElOX1NUT1JBR0UgYXMgdW5rbm93biBhcyBQcm9tcHRzU3RvcmFnZSksXG5cdFx0XHRdXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKG5ldyBTZXQoW2Rpc2FibGVkLnRvU3RyaW5nKCldKSksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZFswXS5tYXAoZiA9PiBmLnVyaS50b1N0cmluZygpKSwgW2VuYWJsZWQudG9TdHJpbmcoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5lcyBidWlsdC1pbiBza2lsbHMgd2l0aCB1c2VyIGZpbGVzIGluIGEgc2luZ2xlIGJ1bmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1c2VyQWdlbnQgPSBVUkkuZmlsZSgnL3VzZXIvYWdlbnRzL2Zvby5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGJ1aWx0aW4gPSBVUkkuZmlsZSgnL2J1aWx0aW4vbWVyZ2UvU0tJTEwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5hZ2VudH0vJHtQcm9tcHRzU3RvcmFnZS5leHRlbnNpb259YCwgW21ha2VQcm9tcHRQYXRoKHVzZXJBZ2VudCwgUHJvbXB0c1R5cGUuYWdlbnQsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbildXSxcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5za2lsbH0vJHtCVUlMVElOX1NUT1JBR0V9YCwgW21ha2VQcm9tcHRQYXRoKGJ1aWx0aW4sIFByb21wdHNUeXBlLnNraWxsLCBCVUlMVElOX1NUT1JBR0UgYXMgdW5rbm93biBhcyBQcm9tcHRzU3RvcmFnZSldXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGJ1bmRsZXIucmVjZWl2ZWRbMF0ubWFwKGYgPT4gKHsgdXJpOiBmLnVyaS50b1N0cmluZygpLCB0eXBlOiBmLnR5cGUgfSkpLnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKSxcblx0XHRcdFtcblx0XHRcdFx0eyB1cmk6IGJ1aWx0aW4udG9TdHJpbmcoKSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRcdFx0eyB1cmk6IHVzZXJBZ2VudC50b1N0cmluZygpLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCB9LFxuXHRcdFx0XS5zb3J0KChhLCBiKSA9PiBhLnVyaS5sb2NhbGVDb21wYXJlKGIudXJpKSksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgZW5hYmxlZCB1c2VyIGZpbGVzIG9ubHkgd2hlbiB1c2VyIHN0b3JhZ2UgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbmFibGVkID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL2VuYWJsZWQuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY2xhdWRlL3J1bGVzL2Rpc2FibGVkLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoW1xuXHRcdFx0W2Ake1Byb21wdHNUeXBlLmluc3RydWN0aW9uc30vJHtQcm9tcHRzU3RvcmFnZS51c2VyfWAsIFtcblx0XHRcdFx0bWFrZVByb21wdFBhdGgoZW5hYmxlZCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS51c2VyKSxcblx0XHRcdFx0bWFrZVByb21wdFBhdGgoZGlzYWJsZWQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1N0b3JhZ2UudXNlciksXG5cdFx0XHRdXSxcblx0XHRdKSk7XG5cdFx0Y29uc3Qgc3luY1Byb3ZpZGVyID0gbmV3IEZha2VTeW5jUHJvdmlkZXIobmV3IFNldChbZGlzYWJsZWQudG9TdHJpbmcoKV0pKTtcblx0XHRjb25zdCBsb2NhbEJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCByZW1vdGVCdW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0c3luY1Byb3ZpZGVyLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRsb2NhbEJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0KTtcblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0c3luY1Byb3ZpZGVyLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRyZW1vdGVCdW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR7IGluY2x1ZGVVc2VyU3RvcmFnZTogdHJ1ZSB9LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvY2FsOiBsb2NhbEJ1bmRsZXIucmVjZWl2ZWQsXG5cdFx0XHRyZW1vdGU6IHJlbW90ZUJ1bmRsZXIucmVjZWl2ZWRbMF0ubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaS50b1N0cmluZygpLCBzb3VyY2U6IGZpbGUuc291cmNlIH0pKSxcblx0XHR9LCB7XG5cdFx0XHRsb2NhbDogW10sXG5cdFx0XHRyZW1vdGU6IFt7IHVyaTogZW5hYmxlZC50b1N0cmluZygpLCBzb3VyY2U6IFByb21wdHNTdG9yYWdlLnVzZXIgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGJ1bmRsZXIgY2FsbCBlbnRpcmVseSB3aGVuIG9ubHkgZGlzYWJsZWQgYnVpbHQtaW5zIGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWx0aW4gPSBVUkkuZmlsZSgnL2J1aWx0aW4vY3JlYXRlLXByL1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbYCR7UHJvbXB0c1R5cGUuc2tpbGx9LyR7QlVJTFRJTl9TVE9SQUdFfWAsIFttYWtlUHJvbXB0UGF0aChidWlsdGluLCBQcm9tcHRzVHlwZS5za2lsbCwgQlVJTFRJTl9TVE9SQUdFIGFzIHVua25vd24gYXMgUHJvbXB0c1N0b3JhZ2UpXV0sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIobmV3IFNldChbYnVpbHRpbi50b1N0cmluZygpXSkpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNsdWRlcyBwbHVnaW5zIHRoYXQgb25seSBjb250cmlidXRlIE1DUCBzZXJ2ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy9tY3Atb25seScpO1xuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZShbbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgbGFiZWw6ICdNQ1AgT25seScsIG1jcFNlcnZlcnM6IDEgfSldKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMubWFwKHIgPT4gKHsgdXJpOiByLnVyaSwgbmFtZTogci5uYW1lIH0pKSwgW1xuXHRcdFx0eyB1cmk6IHBsdWdpblVyaS50b1N0cmluZygpLCBuYW1lOiAnTUNQIE9ubHknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIE1DUC1vbmx5IHBsdWdpbnMgdGhhdCBhcmUgZGlzYWJsZWQgYnkgZW5hYmxlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbWNwLWRpc2FibGVkJyk7XG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZShbbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgZW5hYmxlZDogZmFsc2UsIG1jcFNlcnZlcnM6IDEgfSldKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0bmV3IEZha2VCdW5kbGVyKCkgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnb21pdHMgcGx1Z2lucyB3aXRoIHByb21wdC1maWxlIGNvbnRyaWJ1dGlvbnMgdGhhdCBhcmUgZGlzYWJsZWQgYnkgZW5hYmxlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvcHJvbXB0LWRpc2FibGVkJyk7XG5cdFx0Y29uc3QgcHJvbXB0RmlsZSA9IFVSSS5maWxlKCcvcGx1Z2lucy9wcm9tcHQtZGlzYWJsZWQvc2tpbGxzL2Zvby9TS0lMTC5tZCcpO1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFx0W2Ake1Byb21wdHNUeXBlLnNraWxsfS8ke1Byb21wdHNTdG9yYWdlLnBsdWdpbn1gLCBbbWFrZVByb21wdFBhdGgocHJvbXB0RmlsZSwgUHJvbXB0c1R5cGUuc2tpbGwsIFByb21wdHNTdG9yYWdlLnBsdWdpbildXSxcblx0XHRcdF0pKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKFttYWtlUGx1Z2luKHBsdWdpblVyaSwgeyBlbmFibGVkOiBmYWxzZSB9KV0pLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRuZXcgRmFrZUJ1bmRsZXIoKSBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBNQ1Atb25seSBwbHVnaW5zIHRoYXQgdGhlIHVzZXIgb3B0ZWQgb3V0IG9mIHN5bmNpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL21jcC1vcHRlZC1vdXQnKTtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKG5ldyBTZXQoW3BsdWdpblVyaS50b1N0cmluZygpXSkpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZShbbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgbWNwU2VydmVyczogMSB9KV0pLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRuZXcgRmFrZUJ1bmRsZXIoKSBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkdXBsaWNhdGUgYSBwbHVnaW4gdGhhdCBjb250cmlidXRlcyBib3RoIHByb21wdCBmaWxlcyBhbmQgTUNQIHNlcnZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUoJy9wbHVnaW5zL2NvbWJpbmVkJyk7XG5cdFx0Y29uc3QgcHJvbXB0RmlsZSA9IFVSSS5maWxlKCcvcGx1Z2lucy9jb21iaW5lZC9za2lsbHMvZm9vLnNraWxsLm1kJyk7XG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbYCR7UHJvbXB0c1R5cGUuc2tpbGx9LyR7UHJvbXB0c1N0b3JhZ2UucGx1Z2lufWAsIFttYWtlUHJvbXB0UGF0aChwcm9tcHRGaWxlLCBQcm9tcHRzVHlwZS5za2lsbCwgUHJvbXB0c1N0b3JhZ2UucGx1Z2luKV1dLFxuXHRcdF0pKTtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKFttYWtlUGx1Z2luKHBsdWdpblVyaSwgeyBsYWJlbDogJ0NvbWJpbmVkJywgbWNwU2VydmVyczogMiB9KV0pLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRuZXcgRmFrZUJ1bmRsZXIoKSBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcy5tYXAociA9PiByLnVyaSksIFtwbHVnaW5VcmkudG9TdHJpbmcoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3ZSBob25vciB0aGUgY2FuY2VsbGF0aW9uIHRva2VuIGNvbnRyYWN0IGJ5IHBhc3NpbmcgaXQgdGhyb3VnaCB0byBsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyB1c2VzIGBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lYCwgc28gd2UganVzdFxuXHRcdC8vIGFzc2VydCB0aGF0IGNhbGxpbmcgaXQgZG9lcyBub3QgdGhyb3cgYW5kIHRoZSBjYWxsIHN0aWxsIHJlc29sdmVzLlxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSk7XG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRuZXcgRmFrZUJ1bmRsZXIoKSBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcywgW10pO1xuXHRcdC8vIFVzZSBDYW5jZWxsYXRpb25Ub2tlbiBzbyB0aGUgaW1wb3J0IGlzbid0IGRlYWQgaW4gdGhlIGJ1bmRsZS5cblx0XHRhc3NlcnQub2soQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdidW5kbGVzIE1DUCBzZXJ2ZXJzIGNvbmZpZ3VyZWQgZGlyZWN0bHkgaW4gVlMgQ29kZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3VzZXIubXktc2VydmVyJywgY29sbGVjdGlvbklkOiAndXNlcicsIGxhYmVsOiAnbXktc2VydmVyJywgbGF1bmNoOiBzdGRpb0xhdW5jaCB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWRNY3BbMF0sIFtcblx0XHRcdHsgbmFtZTogJ215LXNlcnZlcicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1mbGFnJ10sIGVudjogdW5kZWZpbmVkLCBlbnZGaWxlOiB1bmRlZmluZWQsIGN3ZDogdW5kZWZpbmVkIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzBdLm5hbWUsICdPcGVuIFBsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBwbHVnaW4tc291cmNlZCBNQ1Agc2VydmVycyBmcm9tIHRoZSBidW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBtYWtlTWNwU2VydmljZShbXG5cdFx0XHRtYWtlTWNwU2VydmVyKHsgaWQ6ICdwbHVnaW4uZm9vLnNydicsIGNvbGxlY3Rpb25JZDogJ3BsdWdpbi5maWxlOi8vL3BsdWdpbnMvZm9vJywgbGFiZWw6ICdzcnYnLCBsYXVuY2g6IHN0ZGlvTGF1bmNoIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHQvLyBObyBsb29zZSBmaWxlcyBhbmQgbm8gbm9uLXBsdWdpbiBNQ1Agc2VydmVyczogYnVuZGxlciBpcyBuZXZlciBjYWxsZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgZGlzYWJsZWQgTUNQIHNlcnZlcnMgZnJvbSB0aGUgYnVuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAndXNlci5vZmYnLCBjb2xsZWN0aW9uSWQ6ICd1c2VyJywgbGFiZWw6ICdvZmYnLCBlbmFibGVkOiBmYWxzZSwgbGF1bmNoOiBzdGRpb0xhdW5jaCB9KSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyB3b3Jrc3BhY2UtZGlzY292ZXJlZCBgLm1jcC5qc29uYCBzZXJ2ZXJzICh0aGUgYWdlbnQgaG9zdCBkaXNjb3ZlcnMgdGhvc2UgaXRzZWxmKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3dzZG90LnNydicsIGNvbGxlY3Rpb25JZDogJ3dvcmtzcGFjZS1kb3QtbWNwLjAnLCBsYWJlbDogJ3NydicsIGxhdW5jaDogc3RkaW9MYXVuY2gsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGAuY29kZS13b3Jrc3BhY2VgIGNvbmZpZ3VyZWQgc2VydmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3dzY2ZnLnNydicsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud29ya3NwYWNlJywgbGFiZWw6ICdzcnYnLCBsYXVuY2g6IHN0ZGlvTGF1bmNoLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIHdvcmtzcGFjZS1kaXNjb3ZlcmVkIGAubWNwLmpzb25gIHNlcnZlcnMgd2hlbiBpbmNsdWRlV29ya3NwYWNlRG90TWNwIGlzIHNldCAobXVsdGktcm9vdCBnYXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3dzZG90LnNydicsIGNvbGxlY3Rpb25JZDogJ3dvcmtzcGFjZS1kb3QtbWNwLjAnLCBsYWJlbDogJ3NydicsIGxhdW5jaDogc3RkaW9MYXVuY2gsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0dHJ1ZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWRNY3BbMF0sIFtcblx0XHRcdHsgbmFtZTogJ3NydicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1mbGFnJ10sIGVudjogdW5kZWZpbmVkLCBlbnZGaWxlOiB1bmRlZmluZWQsIGN3ZDogdW5kZWZpbmVkIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGlsbCBleGNsdWRlcyBgLmNvZGUtd29ya3NwYWNlYCBzZXJ2ZXJzIGV2ZW4gd2hlbiBpbmNsdWRlV29ya3NwYWNlRG90TWNwIGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3dzY2ZnLnNydicsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud29ya3NwYWNlJywgbGFiZWw6ICdzcnYnLCBsYXVuY2g6IHN0ZGlvTGF1bmNoLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHR0cnVlLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jcyBgLnZzY29kZS9tY3AuanNvbmAgc2VydmVycyB0aGF0IHJlc29sdmUgd2l0aG91dCB1c2VyIGludGVyYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAnbWNwLmNvbmZpZy53czAubXktc2VydmVyJywgY29sbGVjdGlvbklkOiAnbWNwLmNvbmZpZy53czAnLCBsYWJlbDogJ215LXNlcnZlcicsIGxhdW5jaDogc3RkaW9MYXVuY2gsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZE1jcFswXSwgW1xuXHRcdFx0eyBuYW1lOiAnbXktc2VydmVyJywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbXktc2VydmVyJywgYXJnczogWyctLWZsYWcnXSwgZW52OiB1bmRlZmluZWQsIGVudkZpbGU6IHVuZGVmaW5lZCwgY3dkOiB1bmRlZmluZWQgfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMF0ubmFtZSwgJ09wZW4gUGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGAudnNjb2RlL21jcC5qc29uYCBzZXJ2ZXJzIHdpdGggdmFyaWFibGVzIHRoYXQgcmVxdWlyZSBpbnRlcmFjdGlvbiAoZS5nLiAke2lucHV0Olx1MjAyNn0pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAnbWNwLmNvbmZpZy53czAubmVlZHMtaW5wdXQnLCBjb2xsZWN0aW9uSWQ6ICdtY3AuY29uZmlnLndzMCcsIGxhYmVsOiAnbmVlZHMtaW5wdXQnLCBsYXVuY2g6IHN0ZGlvTGF1bmNoV2l0aElucHV0LCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiB9KSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jcyBgLnZzY29kZS9tY3AuanNvbmAgc2VydmVycyBhZnRlciByZXNvbHZpbmcgbm9uLWludGVyYWN0aXZlIHZhcmlhYmxlcyAoZS5nLiAke3dvcmtzcGFjZUZvbGRlcn0pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAnbWNwLmNvbmZpZy53czAuZm9sZGVyJywgY29sbGVjdGlvbklkOiAnbWNwLmNvbmZpZy53czAnLCBsYWJlbDogJ2ZvbGRlci1zZXJ2ZXInLCBsYXVuY2g6IHN0ZGlvTGF1bmNoV2l0aEZvbGRlciwgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIgfSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZWZzID0gYXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoeyAnJHt3b3Jrc3BhY2VGb2xkZXJ9JzogJy93cycgfSksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZE1jcFswXSwgW1xuXHRcdFx0eyBuYW1lOiAnZm9sZGVyLXNlcnZlcicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1yb290JywgJy93cyddLCBlbnY6IHVuZGVmaW5lZCwgZW52RmlsZTogdW5kZWZpbmVkLCBjd2Q6IHVuZGVmaW5lZCB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgYC52c2NvZGUvbWNwLmpzb25gIHNlcnZlcnMgd2hlbiB2YXJpYWJsZSByZXNvbHV0aW9uIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ21jcC5jb25maWcud3MwLmZvbGRlcicsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud3MwJywgbGFiZWw6ICdmb2xkZXItc2VydmVyJywgbGF1bmNoOiBzdGRpb0xhdW5jaFdpdGhGb2xkZXIsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHRocm93aW5nUmVzb2x2ZXIgPSB7XG5cdFx0XHRhc3luYyByZXNvbHZlQXN5bmMoKSB7IHRocm93IG5ldyBFcnJvcignbm8gd29ya3NwYWNlIGZvbGRlcicpOyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdHRocm93aW5nUmVzb2x2ZXIsXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGlsbCBzeW5jcyBleHRlbnNpb24tY29udHJpYnV0ZWQgc2VydmVycyAod29ya3NwYWNlIHNjb3BlLCB1c2VyIGNvbmZpZyB0YXJnZXQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAnZXh0LmZvby5zcnYnLCBjb2xsZWN0aW9uSWQ6ICdleHQuZm9vJywgbGFiZWw6ICdzcnYnLCBsYXVuY2g6IHN0ZGlvTGF1bmNoLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWRNY3BbMF0ubWFwKHMgPT4gcy5uYW1lKSwgWydzcnYnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAxKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Nob3VsZFN5bmNXb3Jrc3BhY2VEb3RNY3AgLSBtdWx0aS1yb290IGdhdGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gUGlucyB0aGUgcHJvZHVjdGlvbiBsb2NhbCBDb3BpbG90IEFnZW50IEhvc3Qgc2Vzc2lvbiB0eXBlIHNvIGEgZHJpZnQgaW4gdGhlXG5cdC8vIGdhdGUncyBzZXNzaW9uLXR5cGUgY29tcGFyaXNvbiAodGhlIGNsYXNzIG9mIGJ1ZyB0aGF0IHdvdWxkIG90aGVyd2lzZSBsZWF2ZVxuXHQvLyB0aGUgZmVhdHVyZSB0ZXN0cyBncmVlbikgZmFpbHMgaGVyZS5cblx0Y29uc3QgTE9DQUxfQ09QSUxPVCA9ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknO1xuXG5cdHRlc3QoJ3RydWUgb25seSBmb3IgbG9jYWwgQ29waWxvdCArIG11bHRpLXJvb3Qgd29ya3NwYWNlICsgc2V0dGluZyBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKExPQ0FMX0NPUElMT1QsIDIsIHRydWUpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc2Ugd2hlbiB0aGUgbXVsdGktcm9vdCBzZXR0aW5nIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKExPQ0FMX0NPUElMT1QsIDIsIGZhbHNlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxzZSBmb3IgYSBzaW5nbGUtZm9sZGVyIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcChMT0NBTF9DT1BJTE9ULCAxLCB0cnVlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxzZSBmb3IgYW4gZW1wdHkgd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKExPQ0FMX0NPUElMT1QsIDAsIHRydWUpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbHNlIGZvciBhIG5vbi1Db3BpbG90IGhhcm5lc3MgKGUuZy4gQ2xhdWRlKScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcCgnYWdlbnQtaG9zdC1jbGF1ZGUnLCAyLCB0cnVlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxzZSBmb3IgdGhlIENvcGlsb3QgQ0xJIChleHRlbnNpb24gaG9zdCkgaGFybmVzcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcCgnY29waWxvdGNsaScsIDIsIHRydWUpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbHNlIGZvciBhIHJlbW90ZSBDb3BpbG90IEFnZW50IEhvc3Qgc2Vzc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcCgncmVtb3RlLW15YXV0aG9yaXR5LWNvcGlsb3RjbGknLCAyLCB0cnVlKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCLGlDQUFpQztBQUVwRSxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLG1C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
