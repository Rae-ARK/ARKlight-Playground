import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { waitForState } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { testWorkspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { AbstractAgentPluginDiscovery } from "../../../common/plugins/agentPluginServiceImpl.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from "../../../../../../platform/agentPlugins/common/agentPluginParser.js";
import { PluginFormat } from "../../../../../../platform/agentPlugins/common/pluginParsers.js";
class TestPluginDiscovery extends AbstractAgentPluginDiscovery {
  constructor(fileService, pathService, logService, workspaceContextService) {
    super(fileService, pathService, logService, workspaceContextService);
    this._sources = [];
    this._remove = () => {
    };
  }
  start(enablementModel) {
    this._enablementModel = enablementModel;
  }
  /** Set plugin sources and trigger a refresh. */
  async setSourcesAndRefresh(uris) {
    this._sources = uris;
    await this._refreshPlugins();
  }
  async setRemoveAndRefresh(uri, remove) {
    this._sources = [uri];
    this._remove = remove;
    await this._refreshPlugins();
  }
  async setRemoveAndRefreshAfter(uri, remove, barrier) {
    this._sources = [uri];
    this._remove = remove;
    this._nextDiscoveryBarrier = barrier;
    await this._refreshPlugins();
  }
  async _discoverPluginSources() {
    const sources = this._sources.map((uri) => ({
      uri,
      fromMarketplace: void 0,
      remove: this._remove
    }));
    const barrier = this._nextDiscoveryBarrier;
    this._nextDiscoveryBarrier = void 0;
    await barrier;
    return sources;
  }
}
suite("AgentPlugin format detection", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  let fileService;
  let instantiationService;
  const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
  setup(() => {
    const contextService = new TestContextService(testWorkspace(workspaceRoot));
    fileService = store.add(new FileService(logService));
    store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
    instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, logService);
    instantiationService.stub(IWorkspaceContextService, contextService);
    instantiationService.stub(IPathService, {
      userHome: async () => URI.file("/home/testuser")
    });
    instantiationService.stub(IInstantiationService, instantiationService);
  });
  const mockEnablementModel = {
    readEnabled: () => ContributionEnablementState.EnabledProfile,
    setEnabled: () => {
    },
    remove: () => {
    }
  };
  function createDiscovery() {
    return store.add(new TestPluginDiscovery(
      fileService,
      instantiationService.get(IPathService),
      logService,
      instantiationService.get(IWorkspaceContextService)
    ));
  }
  function getDiscoveredPlugins(discovery) {
    const plugins = discovery.plugins.get();
    assert.ok(plugins, "Expected plugin discovery to have completed");
    return plugins;
  }
  async function writeFile(path, content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  function pluginUri(path) {
    return URI.from({ scheme: Schemas.inMemory, path });
  }
  test("starts unresolved until first refresh completes", () => {
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    assert.strictEqual(discovery.plugins.get(), void 0);
  });
  test("refreshes removability for cached plugin entries", async () => {
    const uri = pluginUri("/plugins/removability");
    await writeFile("/plugins/removability/plugin.json", JSON.stringify({ name: "removability" }));
    const removeCounts = [0, 0];
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setRemoveAndRefresh(uri, () => removeCounts[0]++);
    const initialPlugin = getDiscoveredPlugins(discovery)[0];
    initialPlugin.remove?.();
    await discovery.setRemoveAndRefresh(uri, void 0);
    const managedPlugin = getDiscoveredPlugins(discovery)[0];
    const managedRemove = managedPlugin.remove;
    await discovery.setRemoveAndRefresh(uri, () => removeCounts[1]++);
    const removablePlugin = getDiscoveredPlugins(discovery)[0];
    removablePlugin.remove?.();
    assert.deepStrictEqual({
      reusedManagedPlugin: managedPlugin === initialPlugin,
      managedRemove,
      reusedRemovablePlugin: removablePlugin === initialPlugin,
      removeCounts
    }, {
      reusedManagedPlugin: true,
      managedRemove: void 0,
      reusedRemovablePlugin: true,
      removeCounts: [1, 1]
    });
  });
  test("stale refresh does not overwrite removability of published cached plugin", async () => {
    const uri = pluginUri("/plugins/removability-race");
    await writeFile("/plugins/removability-race/plugin.json", JSON.stringify({ name: "removability-race" }));
    let removeCount = 0;
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setRemoveAndRefresh(uri, () => {
    });
    const staleDiscoveryBarrier = new DeferredPromise();
    const staleRefresh = discovery.setRemoveAndRefreshAfter(uri, void 0, staleDiscoveryBarrier.p);
    await discovery.setRemoveAndRefresh(uri, () => removeCount++);
    staleDiscoveryBarrier.complete();
    await staleRefresh;
    const plugin = getDiscoveredPlugins(discovery)[0];
    plugin.remove?.();
    assert.deepStrictEqual({
      hasRemove: plugin.remove !== void 0,
      removeCount
    }, {
      hasRemove: true,
      removeCount: 1
    });
  });
  test("detects Open Plugin format when .plugin/plugin.json exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/my-open-plugin");
    await writeFile("/plugins/my-open-plugin/.plugin/plugin.json", JSON.stringify({ name: "my-open-plugin" }));
    await writeFile("/plugins/my-open-plugin/commands/hello.md", "# Hello");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (cmds) => cmds.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "hello");
  }));
  test("detects Claude format when .claude-plugin/plugin.json exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/my-claude-plugin");
    await writeFile("/plugins/my-claude-plugin/.claude-plugin/plugin.json", JSON.stringify({ name: "my-claude-plugin" }));
    await writeFile("/plugins/my-claude-plugin/commands/greet.md", "# Greet");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (cmds) => cmds.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "greet");
  }));
  test("falls back to Copilot format when no vendor manifest exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/my-copilot-plugin");
    await writeFile("/plugins/my-copilot-plugin/plugin.json", JSON.stringify({ name: "my-copilot-plugin" }));
    await writeFile("/plugins/my-copilot-plugin/commands/run.md", "# Run");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (cmds) => cmds.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "run");
  }));
  test("plugin label uses manifest `name` when no marketplace metadata is present", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/_direct/sukumarp2022--slide-creator-plugin");
    await writeFile("/plugins/_direct/sukumarp2022--slide-creator-plugin/plugin.json", JSON.stringify({
      name: "Slide Creator"
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.deepStrictEqual(plugins.map((p) => p.label), ["Slide Creator"]);
  }));
  test("plugin label falls back to basename when manifest `name` is missing or invalid", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const missingUri = pluginUri("/plugins/missing-name");
    await writeFile("/plugins/missing-name/plugin.json", JSON.stringify({}));
    const blankUri = pluginUri("/plugins/blank-name");
    await writeFile("/plugins/blank-name/plugin.json", JSON.stringify({ name: "   " }));
    const nonStringUri = pluginUri("/plugins/non-string-name");
    await writeFile("/plugins/non-string-name/plugin.json", JSON.stringify({ name: 42 }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([missingUri, blankUri, nonStringUri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.deepStrictEqual(
      plugins.map((p) => p.label).sort(),
      ["blank-name", "missing-name", "non-string-name"]
    );
  }));
  test("Open Plugin format takes priority over Claude format", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/dual-plugin");
    await writeFile("/plugins/dual-plugin/.plugin/plugin.json", JSON.stringify({ name: "dual-plugin" }));
    await writeFile("/plugins/dual-plugin/.claude-plugin/plugin.json", JSON.stringify({ name: "dual-plugin" }));
    await writeFile("/plugins/dual-plugin/.plugin/plugin.json", JSON.stringify({
      name: "dual-plugin",
      mcpServers: { "open-server": { command: "echo", args: ["open"] } }
    }));
    await writeFile("/plugins/dual-plugin/.claude-plugin/plugin.json", JSON.stringify({
      name: "dual-plugin",
      mcpServers: { "claude-server": { command: "echo", args: ["claude"] } }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (defs) => defs.length > 0);
    const mcpDefs = plugins[0].mcpServerDefinitions.get();
    assert.strictEqual(mcpDefs.length, 1);
    assert.strictEqual(mcpDefs[0].name, "open-server");
  }));
  test("Agent Plugin root takes priority and exposes only portable core components", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/agent-plugin");
    await writeFile("/plugins/agent-plugin/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "agent-plugin" }));
    await writeFile("/plugins/agent-plugin/.plugin/plugin.json", JSON.stringify({
      name: "legacy",
      mcpServers: { legacy: { command: "node" } }
    }));
    await writeFile("/plugins/agent-plugin/skills/portable/SKILL.md", "---\nname: portable\ndescription: Portable skill\n---");
    await writeFile("/plugins/agent-plugin/commands/ignored.md", "# Ignored");
    await writeFile("/plugins/agent-plugin/agents/ignored.md", "# Ignored");
    await writeFile("/plugins/agent-plugin/.mcp.json", JSON.stringify({ mcpServers: { ignored: { command: "node" } } }));
    await writeFile("/plugins/agent-plugin/mcp.json", JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: { portable: { type: "streamable-http", url: "https://example.com/mcp" } }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugin = getDiscoveredPlugins(discovery)[0];
    await Promise.all([
      waitForState(plugin.skills, (skills) => skills.length > 0),
      waitForState(plugin.mcpServerDefinitions, (definitions) => definitions.length > 0)
    ]);
    assert.deepStrictEqual({
      label: plugin.label,
      skills: plugin.skills.get().map((skill) => skill.name),
      mcp: plugin.mcpServerDefinitions.get().map((server) => server.name),
      commands: plugin.commands.get(),
      agents: plugin.agents.get(),
      hooks: plugin.hooks.get(),
      instructions: plugin.instructions.get()
    }, {
      label: "agent-plugin",
      skills: ["portable"],
      mcp: ["portable"],
      commands: [],
      agents: [],
      hooks: [],
      instructions: []
    });
  }));
  test("recognized Agent Plugin without a name uses the directory label without legacy fallback", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/rejected-agent-plugin");
    await writeFile("/plugins/rejected-agent-plugin/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA }));
    await writeFile("/plugins/rejected-agent-plugin/.plugin/plugin.json", JSON.stringify({ name: "legacy" }));
    await writeFile("/plugins/rejected-agent-plugin/commands/legacy.md", "# Legacy");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugin = getDiscoveredPlugins(discovery)[0];
    assert.deepStrictEqual({
      format: plugin.format,
      label: plugin.label,
      commands: plugin.commands.get()
    }, {
      format: PluginFormat.AgentPlugin,
      label: "rejected-agent-plugin",
      commands: []
    });
  }));
  test("adding an Agent Plugin manifest re-detects an existing plugin", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/updated-plugin");
    await writeFile("/plugins/updated-plugin/.plugin/plugin.json", JSON.stringify({ name: "legacy" }));
    await writeFile("/plugins/updated-plugin/commands/legacy.md", "# Legacy");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    assert.strictEqual(getDiscoveredPlugins(discovery)[0].format, PluginFormat.OpenPlugin);
    await writeFile("/plugins/updated-plugin/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "updated" }));
    const plugins = await waitForState(discovery.plugins, (value) => value?.[0]?.format === PluginFormat.AgentPlugin);
    assert.deepStrictEqual({
      format: plugins?.[0].format,
      commands: plugins?.[0].commands.get()
    }, {
      format: PluginFormat.AgentPlugin,
      commands: []
    });
  }));
  test("Open Plugin reads MCP definitions from .plugin/plugin.json inline", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-plugin");
    await writeFile("/plugins/mcp-plugin/.plugin/plugin.json", JSON.stringify({
      name: "mcp-plugin",
      mcpServers: {
        "my-server": { command: "node", args: ["server.js"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (defs) => defs.length > 0);
    const mcpDefs = plugins[0].mcpServerDefinitions.get();
    assert.deepStrictEqual(mcpDefs.map((d) => d.name), ["my-server"]);
  }));
  test("Open Plugin reads MCP definitions from standalone .mcp.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-standalone");
    await writeFile("/plugins/mcp-standalone/.plugin/plugin.json", JSON.stringify({ name: "mcp-standalone" }));
    await writeFile("/plugins/mcp-standalone/.mcp.json", JSON.stringify({
      mcpServers: {
        "standalone-server": { command: "python", args: ["serve.py"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (defs) => defs.length > 0);
    assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, "standalone-server");
  }));
  test("reads skills from skills/ subdirectories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/skills-plugin");
    await writeFile("/plugins/skills-plugin/.plugin/plugin.json", JSON.stringify({ name: "skills-plugin" }));
    await writeFile("/plugins/skills-plugin/skills/deploy/SKILL.md", "# Deploy skill");
    await writeFile("/plugins/skills-plugin/skills/lint/SKILL.md", "# Lint skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    const skillNames = plugins[0].skills.get().map((s) => s.name).sort();
    assert.deepStrictEqual(skillNames, ["deploy", "lint"]);
  }));
  test("reads root-level SKILL.md as a fallback skill", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/root-skill");
    await writeFile("/plugins/root-skill/.plugin/plugin.json", JSON.stringify({ name: "root-skill" }));
    await writeFile("/plugins/root-skill/SKILL.md", "# Visual Explainer");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["root-skill"]
    );
  }));
  test("root-level SKILL.md is ignored when skills/ has content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/root-skill-ignored");
    await writeFile("/plugins/root-skill-ignored/.plugin/plugin.json", JSON.stringify({ name: "root-skill-ignored" }));
    await writeFile("/plugins/root-skill-ignored/SKILL.md", "# Root skill");
    await writeFile("/plugins/root-skill-ignored/skills/real/SKILL.md", "# Real skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["real"]
    );
  }));
  test("reads agents from agents/ directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/agents-plugin");
    await writeFile("/plugins/agents-plugin/.plugin/plugin.json", JSON.stringify({ name: "agents-plugin" }));
    await writeFile("/plugins/agents-plugin/agents/reviewer.md", "---\nname: reviewer\n---\nYou review code.");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].agents, (a) => a.length > 0);
    assert.strictEqual(plugins[0].agents.get()[0].name, "reviewer");
  }));
  test("manifest skills field adds supplemental skill directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/custom-skills");
    await writeFile("/plugins/custom-skills/.plugin/plugin.json", JSON.stringify({
      name: "custom-skills",
      skills: "./extra-skills/"
    }));
    await writeFile("/plugins/custom-skills/skills/default-skill/SKILL.md", "# Default skill");
    await writeFile("/plugins/custom-skills/extra-skills/bonus-skill/SKILL.md", "# Bonus skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length >= 2);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name).sort(),
      ["bonus-skill", "default-skill"]
    );
  }));
  test("manifest skills field with exclusive mode skips default directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/exclusive-skills");
    await writeFile("/plugins/exclusive-skills/.plugin/plugin.json", JSON.stringify({
      name: "exclusive-skills",
      skills: { paths: ["./only-here/"], exclusive: true }
    }));
    await writeFile("/plugins/exclusive-skills/skills/ignored/SKILL.md", "# Should be ignored");
    await writeFile("/plugins/exclusive-skills/only-here/visible/SKILL.md", "# Should be visible");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["visible"]
    );
  }));
  test("manifest commands field with string array scans multiple directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/multi-commands");
    await writeFile("/plugins/multi-commands/.plugin/plugin.json", JSON.stringify({
      name: "multi-commands",
      commands: ["./cmd1/", "./cmd2/"]
    }));
    await writeFile("/plugins/multi-commands/commands/default.md", "# Default");
    await writeFile("/plugins/multi-commands/cmd1/alpha.md", "# Alpha");
    await writeFile("/plugins/multi-commands/cmd2/beta.md", "# Beta");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length >= 3);
    assert.deepStrictEqual(
      plugins[0].commands.get().map((c) => c.name).sort(),
      ["alpha", "beta", "default"]
    );
  }));
  test("manifest agents field adds supplemental agent directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/custom-agents");
    await writeFile("/plugins/custom-agents/.plugin/plugin.json", JSON.stringify({
      name: "custom-agents",
      agents: "./extra-agents/"
    }));
    await writeFile("/plugins/custom-agents/agents/default-agent.md", "# Default");
    await writeFile("/plugins/custom-agents/extra-agents/bonus-agent.md", "# Bonus");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].agents, (a) => a.length >= 2);
    assert.deepStrictEqual(
      plugins[0].agents.get().map((a) => a.name).sort(),
      ["bonus-agent", "default-agent"]
    );
  }));
  test("path traversal in manifest is rejected", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/traversal");
    await writeFile("/plugins/traversal/.plugin/plugin.json", JSON.stringify({
      name: "traversal",
      skills: "../outside/"
    }));
    await writeFile("/plugins/outside/evil/SKILL.md", "# Evil skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, () => true);
    assert.deepStrictEqual(plugins[0].skills.get(), []);
  }));
  test("duplicate names across directories deduplicate (first wins)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/dedup");
    await writeFile("/plugins/dedup/.plugin/plugin.json", JSON.stringify({
      name: "dedup",
      commands: "./extra-commands/"
    }));
    await writeFile("/plugins/dedup/commands/shared.md", "# Default version");
    await writeFile("/plugins/dedup/extra-commands/shared.md", "# Custom version");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length > 0);
    const cmds = plugins[0].commands.get();
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].name, "shared");
    assert.ok(cmds[0].uri.path.includes("/commands/shared.md"));
  }));
  test("discovers components without a manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/no-manifest");
    await writeFile("/plugins/no-manifest/commands/hello.md", "# Hello");
    await writeFile("/plugins/no-manifest/skills/my-skill/SKILL.md", "# My skill");
    await writeFile("/plugins/no-manifest/agents/helper.md", "# Helper");
    await writeFile("/plugins/no-manifest/rules/prefer-const.mdc", "---\ndescription: Prefer const\n---\nUse const.");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].label, "no-manifest");
    await waitForState(plugins[0].commands, (c) => c.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "hello");
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.strictEqual(plugins[0].skills.get()[0].name, "my-skill");
    await waitForState(plugins[0].agents, (a) => a.length > 0);
    assert.strictEqual(plugins[0].agents.get()[0].name, "helper");
    await waitForState(plugins[0].instructions, (i) => i.length > 0);
    assert.strictEqual(plugins[0].instructions.get()[0].name, "prefer-const");
  }));
  test("reads hooks from default hooks/hooks.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hooks-default");
    await writeFile("/plugins/hooks-default/.plugin/plugin.json", JSON.stringify({ name: "hooks-default" }));
    await writeFile("/plugins/hooks-default/hooks/hooks.json", JSON.stringify({
      hooks: {
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo done" }] }]
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("reads inline hooks from manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hooks-inline");
    await writeFile("/plugins/hooks-inline/.plugin/plugin.json", JSON.stringify({
      name: "hooks-inline",
      hooks: {
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }]
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("reads hooks from custom path in manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hooks-custom");
    await writeFile("/plugins/hooks-custom/.plugin/plugin.json", JSON.stringify({
      name: "hooks-custom",
      hooks: "./config/my-hooks.json"
    }));
    await writeFile("/plugins/hooks-custom/config/my-hooks.json", JSON.stringify({
      hooks: {
        PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "echo edited" }] }]
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("reads MCP from custom path in manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-custom");
    await writeFile("/plugins/mcp-custom/.plugin/plugin.json", JSON.stringify({
      name: "mcp-custom",
      mcpServers: "./config/servers.json"
    }));
    await writeFile("/plugins/mcp-custom/config/servers.json", JSON.stringify({
      mcpServers: {
        "custom-server": { command: "node", args: ["custom.js"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, "custom-server");
  }));
  test("inline MCP in manifest takes priority over standalone .mcp.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-merged");
    await writeFile("/plugins/mcp-merged/.plugin/plugin.json", JSON.stringify({
      name: "mcp-merged",
      mcpServers: {
        "inline-server": { command: "echo", args: ["inline"] }
      }
    }));
    await writeFile("/plugins/mcp-merged/.mcp.json", JSON.stringify({
      mcpServers: {
        "file-server": { command: "echo", args: ["file"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => [...d].some((s) => s.name === "inline-server"));
    assert.deepStrictEqual(
      plugins[0].mcpServerDefinitions.get().map((d) => d.name),
      ["inline-server"]
    );
  }));
  test("PLUGIN_ROOT expansion in hook commands", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/root-expansion");
    await writeFile("/plugins/root-expansion/.plugin/plugin.json", JSON.stringify({
      name: "root-expansion",
      hooks: {
        hooks: {
          PostToolUse: [{
            hooks: [{
              type: "command",
              command: "${PLUGIN_ROOT}/scripts/format.sh"
            }]
          }]
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    const hookCommands = plugins[0].hooks.get()[0].hooks;
    assert.ok(hookCommands.length > 0);
    const command = hookCommands[0].command;
    assert.ok(command && !command.includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded, got: ${command}`);
  }));
  test("manifest commands field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/cmd-file");
    await writeFile("/plugins/cmd-file/.plugin/plugin.json", JSON.stringify({
      name: "cmd-file",
      commands: "./special/deploy.md"
    }));
    await writeFile("/plugins/cmd-file/commands/default.md", "# Default");
    await writeFile("/plugins/cmd-file/special/deploy.md", "# Deploy");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length >= 2);
    assert.deepStrictEqual(
      plugins[0].commands.get().map((c) => c.name).sort(),
      ["default", "deploy"]
    );
  }));
  test("manifest commands field with array of specific files", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/cmd-files");
    await writeFile("/plugins/cmd-files/.plugin/plugin.json", JSON.stringify({
      name: "cmd-files",
      commands: ["./extras/alpha.md", "./extras/beta.md"]
    }));
    await writeFile("/plugins/cmd-files/extras/alpha.md", "# Alpha");
    await writeFile("/plugins/cmd-files/extras/beta.md", "# Beta");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length >= 2);
    assert.deepStrictEqual(
      plugins[0].commands.get().map((c) => c.name).sort(),
      ["alpha", "beta"]
    );
  }));
  test("manifest agents field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/agent-file");
    await writeFile("/plugins/agent-file/.plugin/plugin.json", JSON.stringify({
      name: "agent-file",
      agents: "./custom/specialist.md"
    }));
    await writeFile("/plugins/agent-file/agents/default.md", "# Default");
    await writeFile("/plugins/agent-file/custom/specialist.md", "# Specialist");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].agents, (a) => a.length >= 2);
    assert.deepStrictEqual(
      plugins[0].agents.get().map((a) => a.name).sort(),
      ["default", "specialist"]
    );
  }));
  test("manifest skills field pointing to a specific skill directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/skill-dir");
    await writeFile("/plugins/skill-dir/.plugin/plugin.json", JSON.stringify({
      name: "skill-dir",
      skills: "./custom/my-skill"
    }));
    await writeFile("/plugins/skill-dir/custom/my-skill/SKILL.md", "# My Skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["my-skill"]
    );
  }));
  test("manifest hooks field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hook-file");
    await writeFile("/plugins/hook-file/.plugin/plugin.json", JSON.stringify({
      name: "hook-file",
      hooks: "./config/custom-hooks.json"
    }));
    await writeFile("/plugins/hook-file/config/custom-hooks.json", JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }]
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("manifest mcpServers field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-file");
    await writeFile("/plugins/mcp-file/.plugin/plugin.json", JSON.stringify({
      name: "mcp-file",
      mcpServers: "./config/servers.json"
    }));
    await writeFile("/plugins/mcp-file/config/servers.json", JSON.stringify({
      mcpServers: {
        "custom-server": { command: "node", args: ["serve.js"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, "custom-server");
  }));
  test("reads rules from rules/ directory with .mdc extension", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/rules-plugin");
    await writeFile("/plugins/rules-plugin/.plugin/plugin.json", JSON.stringify({ name: "rules-plugin" }));
    await writeFile("/plugins/rules-plugin/rules/prefer-const.mdc", "---\ndescription: Prefer const\n---\nUse const.");
    await writeFile("/plugins/rules-plugin/rules/error-handling.mdc", "---\ndescription: Error handling\n---\nAlways handle errors.");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length >= 2);
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name).sort(),
      ["error-handling", "prefer-const"]
    );
  }));
  test("reads rules with .md and .instructions.md extensions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/rules-mixed");
    await writeFile("/plugins/rules-mixed/.plugin/plugin.json", JSON.stringify({ name: "rules-mixed" }));
    await writeFile("/plugins/rules-mixed/rules/rule-a.mdc", "Rule A");
    await writeFile("/plugins/rules-mixed/rules/rule-b.md", "Rule B");
    await writeFile("/plugins/rules-mixed/rules/rule-c.instructions.md", "Rule C");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length >= 3);
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name).sort(),
      ["rule-a", "rule-b", "rule-c"]
    );
  }));
  test("manifest rules field adds supplemental rule directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/custom-rules");
    await writeFile("/plugins/custom-rules/.plugin/plugin.json", JSON.stringify({
      name: "custom-rules",
      rules: "./extra-rules/"
    }));
    await writeFile("/plugins/custom-rules/rules/default-rule.mdc", "Default rule");
    await writeFile("/plugins/custom-rules/extra-rules/bonus-rule.mdc", "Bonus rule");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length >= 2);
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name).sort(),
      ["bonus-rule", "default-rule"]
    );
  }));
  test("manifest rules field with exclusive mode skips default directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/exclusive-rules");
    await writeFile("/plugins/exclusive-rules/.plugin/plugin.json", JSON.stringify({
      name: "exclusive-rules",
      rules: { paths: ["./only-here/"], exclusive: true }
    }));
    await writeFile("/plugins/exclusive-rules/rules/ignored.mdc", "Should be ignored");
    await writeFile("/plugins/exclusive-rules/only-here/visible.mdc", "Should be visible");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length === 1 && i[0].name === "visible");
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name),
      ["visible"]
    );
  }));
  test("rule name strips longest matching suffix first", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/suffix-rules");
    await writeFile("/plugins/suffix-rules/.plugin/plugin.json", JSON.stringify({ name: "suffix-rules" }));
    await writeFile("/plugins/suffix-rules/rules/coding-standards.instructions.md", "Standards");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length > 0);
    assert.strictEqual(plugins[0].instructions.get()[0].name, "coding-standards");
  }));
  test("deduplicates rules with the same base name", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/dup-rules");
    await writeFile("/plugins/dup-rules/.plugin/plugin.json", JSON.stringify({
      name: "dup-rules",
      rules: "./extra/"
    }));
    await writeFile("/plugins/dup-rules/rules/my-rule.mdc", "From default");
    await writeFile("/plugins/dup-rules/extra/my-rule.md", "From extra");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length > 0);
    assert.strictEqual(plugins[0].instructions.get().length, 1);
    const instruction = plugins[0].instructions.get()[0];
    assert.strictEqual(instruction.name, "my-rule");
    assert.ok(instruction.uri.path.endsWith("/rules/my-rule.mdc"));
  }));
  test("PLUGIN_ROOT expansion in inline MCP server definitions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-root");
    await writeFile("/plugins/mcp-root/.plugin/plugin.json", JSON.stringify({
      name: "mcp-root",
      mcpServers: {
        "my-server": {
          command: "${PLUGIN_ROOT}/bin/server",
          args: ["--config", "${PLUGIN_ROOT}/config.json"],
          cwd: "${PLUGIN_ROOT}",
          env: { "CONFIG_DIR": "${PLUGIN_ROOT}/etc" }
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    const server = plugins[0].mcpServerDefinitions.get()[0];
    assert.strictEqual(server.name, "my-server");
    const config = server.configuration;
    assert.ok(!config.command.includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
    assert.ok(!config.args[1].includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
    assert.ok(!config.cwd.includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in cwd, got: ${config.cwd}`);
    assert.ok(!config.env["CONFIG_DIR"].includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in env, got: ${config.env["CONFIG_DIR"]}`);
    assert.strictEqual(config.env["PLUGIN_ROOT"], uri.fsPath, "Expected PLUGIN_ROOT env var to be set");
  }));
  test("CLAUDE_PLUGIN_ROOT expansion in MCP server definitions from .mcp.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/claude-mcp-root");
    await writeFile("/plugins/claude-mcp-root/.claude-plugin/plugin.json", JSON.stringify({ name: "claude-mcp-root" }));
    await writeFile("/plugins/claude-mcp-root/.mcp.json", JSON.stringify({
      mcpServers: {
        "claude-server": {
          command: "${CLAUDE_PLUGIN_ROOT}/run.sh",
          args: ["--dir", "${CLAUDE_PLUGIN_ROOT}/data"]
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    const server = plugins[0].mcpServerDefinitions.get()[0];
    const config = server.configuration;
    assert.ok(!config.command.includes("${CLAUDE_PLUGIN_ROOT}"), `Expected CLAUDE_PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
    assert.ok(!config.args[1].includes("${CLAUDE_PLUGIN_ROOT}"), `Expected CLAUDE_PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
    assert.strictEqual(config.env["CLAUDE_PLUGIN_ROOT"], uri.fsPath, "Expected CLAUDE_PLUGIN_ROOT env var to be set");
  }));
  test("Copilot Plugin MCP servers expand root aliases and default cwd to plugin root", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/copilot-mcp-root");
    await writeFile("/plugins/copilot-mcp-root/plugin.json", JSON.stringify({ name: "copilot-mcp-root" }));
    await writeFile("/plugins/copilot-mcp-root/.mcp.json", JSON.stringify({
      mcpServers: {
        "copilot-server": {
          command: "${PLUGIN_ROOT}/bin/server",
          args: ["--data", "${CLAUDE_PLUGIN_ROOT}/data"],
          env: { CONFIG_DIR: "${PLUGIN_ROOT}/etc" }
        },
        "explicit-cwd-server": {
          command: "node",
          cwd: "/custom/cwd"
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length === 2);
    const servers = new Map(plugins[0].mcpServerDefinitions.get().map((server) => [server.name, server.configuration]));
    const defaultCwdConfig = servers.get("copilot-server");
    assert.strictEqual(defaultCwdConfig?.type, McpServerType.LOCAL);
    if (defaultCwdConfig?.type !== McpServerType.LOCAL) {
      assert.fail("Expected a local MCP server configuration");
    }
    const explicitCwdConfig = servers.get("explicit-cwd-server");
    assert.strictEqual(explicitCwdConfig?.type, McpServerType.LOCAL);
    if (explicitCwdConfig?.type !== McpServerType.LOCAL) {
      assert.fail("Expected a local MCP server configuration");
    }
    assert.deepStrictEqual({
      defaultCwd: {
        command: defaultCwdConfig.command,
        args: defaultCwdConfig.args,
        cwd: defaultCwdConfig.cwd,
        env: defaultCwdConfig.env
      },
      explicitCwd: {
        command: explicitCwdConfig.command,
        cwd: explicitCwdConfig.cwd
      }
    }, {
      defaultCwd: {
        command: `${uri.fsPath}/bin/server`,
        args: ["--data", `${uri.fsPath}/data`],
        cwd: uri.fsPath,
        env: {
          CONFIG_DIR: `${uri.fsPath}/etc`,
          PLUGIN_ROOT: uri.fsPath,
          CLAUDE_PLUGIN_ROOT: uri.fsPath
        }
      },
      explicitCwd: {
        command: "node",
        cwd: "/custom/cwd"
      }
    });
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpbkZvcm1hdERldGVjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyB0ZXN0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0QWdlbnRQbHVnaW5EaXNjb3ZlcnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgSUVuYWJsZW1lbnRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IEFHRU5UX1BMVUdJTl9NQ1BfU0NIRU1BLCBBR0VOVF9QTFVHSU5fU0NIRU1BIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRQbHVnaW5zL2NvbW1vbi9hZ2VudFBsdWdpblBhcnNlci5qcyc7XG5pbXBvcnQgeyBQbHVnaW5Gb3JtYXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuXG4vKipcbiAqIENvbmNyZXRlIGRpc2NvdmVyeSBzdWJjbGFzcyB0aGF0IHJldHVybnMgYSBmaXhlZCBsaXN0IG9mIHBsdWdpbiBVUklzLFxuICogYWxsb3dpbmcgZm9ybWF0IGRldGVjdGlvbiBhbmQgY29udGVudCByZWFkaW5nIHRvIGJlIHRlc3RlZCBpbiBpc29sYXRpb24uXG4gKi9cbmNsYXNzIFRlc3RQbHVnaW5EaXNjb3ZlcnkgZXh0ZW5kcyBBYnN0cmFjdEFnZW50UGx1Z2luRGlzY292ZXJ5IHtcblx0cHJpdmF0ZSBfc291cmNlczogVVJJW10gPSBbXTtcblx0cHJpdmF0ZSBfcmVtb3ZlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQgPSAoKSA9PiB7IH07XG5cdHByaXZhdGUgX25leHREaXNjb3ZlcnlCYXJyaWVyOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihmaWxlU2VydmljZSwgcGF0aFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0fVxuXG5cdHN0YXJ0KGVuYWJsZW1lbnRNb2RlbDogSUVuYWJsZW1lbnRNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZW1lbnRNb2RlbCA9IGVuYWJsZW1lbnRNb2RlbDtcblx0fVxuXG5cdC8qKiBTZXQgcGx1Z2luIHNvdXJjZXMgYW5kIHRyaWdnZXIgYSByZWZyZXNoLiAqL1xuXHRhc3luYyBzZXRTb3VyY2VzQW5kUmVmcmVzaCh1cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3NvdXJjZXMgPSB1cmlzO1xuXHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hQbHVnaW5zKCk7XG5cdH1cblxuXHRhc3luYyBzZXRSZW1vdmVBbmRSZWZyZXNoKHVyaTogVVJJLCByZW1vdmU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3NvdXJjZXMgPSBbdXJpXTtcblx0XHR0aGlzLl9yZW1vdmUgPSByZW1vdmU7XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFBsdWdpbnMoKTtcblx0fVxuXG5cdGFzeW5jIHNldFJlbW92ZUFuZFJlZnJlc2hBZnRlcih1cmk6IFVSSSwgcmVtb3ZlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQsIGJhcnJpZXI6IFByb21pc2U8dm9pZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zb3VyY2VzID0gW3VyaV07XG5cdFx0dGhpcy5fcmVtb3ZlID0gcmVtb3ZlO1xuXHRcdHRoaXMuX25leHREaXNjb3ZlcnlCYXJyaWVyID0gYmFycmllcjtcblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoUGx1Z2lucygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9kaXNjb3ZlclBsdWdpblNvdXJjZXMoKSB7XG5cdFx0Y29uc3Qgc291cmNlcyA9IHRoaXMuX3NvdXJjZXMubWFwKHVyaSA9PiAoe1xuXHRcdFx0dXJpLFxuXHRcdFx0ZnJvbU1hcmtldHBsYWNlOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1vdmU6IHRoaXMuX3JlbW92ZSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgYmFycmllciA9IHRoaXMuX25leHREaXNjb3ZlcnlCYXJyaWVyO1xuXHRcdHRoaXMuX25leHREaXNjb3ZlcnlCYXJyaWVyID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IGJhcnJpZXI7XG5cdFx0cmV0dXJuIHNvdXJjZXM7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50UGx1Z2luIGZvcm1hdCBkZXRlY3Rpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZScgfSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBjb250ZXh0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGF0aFNlcnZpY2UsIHtcblx0XHRcdHVzZXJIb21lOiBhc3luYyAoKSA9PiBVUkkuZmlsZSgnL2hvbWUvdGVzdHVzZXInKSxcblx0XHR9IGFzIFBhcnRpYWw8SVBhdGhTZXJ2aWNlPiBhcyBJUGF0aFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH0pO1xuXG5cdGNvbnN0IG1vY2tFbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwgPSB7XG5cdFx0cmVhZEVuYWJsZWQ6ICgpID0+IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSxcblx0XHRzZXRFbmFibGVkOiAoKSA9PiB7IH0sXG5cdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlRGlzY292ZXJ5KCk6IFRlc3RQbHVnaW5EaXNjb3Zlcnkge1xuXHRcdHJldHVybiBzdG9yZS5hZGQobmV3IFRlc3RQbHVnaW5EaXNjb3ZlcnkoXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJUGF0aFNlcnZpY2UpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpLFxuXHRcdCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5OiBUZXN0UGx1Z2luRGlzY292ZXJ5KSB7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IGRpc2NvdmVyeS5wbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5vayhwbHVnaW5zLCAnRXhwZWN0ZWQgcGx1Z2luIGRpc2NvdmVyeSB0byBoYXZlIGNvbXBsZXRlZCcpO1xuXHRcdHJldHVybiBwbHVnaW5zO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd3JpdGVGaWxlKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGggfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBwbHVnaW5VcmkocGF0aDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGggfSk7XG5cdH1cblxuXHR0ZXN0KCdzdGFydHMgdW5yZXNvbHZlZCB1bnRpbCBmaXJzdCByZWZyZXNoIGNvbXBsZXRlcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJ5LnBsdWdpbnMuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hlcyByZW1vdmFiaWxpdHkgZm9yIGNhY2hlZCBwbHVnaW4gZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3JlbW92YWJpbGl0eScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcmVtb3ZhYmlsaXR5L3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAncmVtb3ZhYmlsaXR5JyB9KSk7XG5cblx0XHRjb25zdCByZW1vdmVDb3VudHMgPSBbMCwgMF07XG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRSZW1vdmVBbmRSZWZyZXNoKHVyaSwgKCkgPT4gcmVtb3ZlQ291bnRzWzBdKyspO1xuXHRcdGNvbnN0IGluaXRpYWxQbHVnaW4gPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpWzBdO1xuXHRcdGluaXRpYWxQbHVnaW4ucmVtb3ZlPy4oKTtcblxuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRSZW1vdmVBbmRSZWZyZXNoKHVyaSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBtYW5hZ2VkUGx1Z2luID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KVswXTtcblx0XHRjb25zdCBtYW5hZ2VkUmVtb3ZlID0gbWFuYWdlZFBsdWdpbi5yZW1vdmU7XG5cblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0UmVtb3ZlQW5kUmVmcmVzaCh1cmksICgpID0+IHJlbW92ZUNvdW50c1sxXSsrKTtcblx0XHRjb25zdCByZW1vdmFibGVQbHVnaW4gPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpWzBdO1xuXHRcdHJlbW92YWJsZVBsdWdpbi5yZW1vdmU/LigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXVzZWRNYW5hZ2VkUGx1Z2luOiBtYW5hZ2VkUGx1Z2luID09PSBpbml0aWFsUGx1Z2luLFxuXHRcdFx0bWFuYWdlZFJlbW92ZSxcblx0XHRcdHJldXNlZFJlbW92YWJsZVBsdWdpbjogcmVtb3ZhYmxlUGx1Z2luID09PSBpbml0aWFsUGx1Z2luLFxuXHRcdFx0cmVtb3ZlQ291bnRzLFxuXHRcdH0sIHtcblx0XHRcdHJldXNlZE1hbmFnZWRQbHVnaW46IHRydWUsXG5cdFx0XHRtYW5hZ2VkUmVtb3ZlOiB1bmRlZmluZWQsXG5cdFx0XHRyZXVzZWRSZW1vdmFibGVQbHVnaW46IHRydWUsXG5cdFx0XHRyZW1vdmVDb3VudHM6IFsxLCAxXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhbGUgcmVmcmVzaCBkb2VzIG5vdCBvdmVyd3JpdGUgcmVtb3ZhYmlsaXR5IG9mIHB1Ymxpc2hlZCBjYWNoZWQgcGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcmVtb3ZhYmlsaXR5LXJhY2UnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3JlbW92YWJpbGl0eS1yYWNlL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAncmVtb3ZhYmlsaXR5LXJhY2UnIH0pKTtcblxuXHRcdGxldCByZW1vdmVDb3VudCA9IDA7XG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRSZW1vdmVBbmRSZWZyZXNoKHVyaSwgKCkgPT4geyB9KTtcblxuXHRcdGNvbnN0IHN0YWxlRGlzY292ZXJ5QmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzdGFsZVJlZnJlc2ggPSBkaXNjb3Zlcnkuc2V0UmVtb3ZlQW5kUmVmcmVzaEFmdGVyKHVyaSwgdW5kZWZpbmVkLCBzdGFsZURpc2NvdmVyeUJhcnJpZXIucCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFJlbW92ZUFuZFJlZnJlc2godXJpLCAoKSA9PiByZW1vdmVDb3VudCsrKTtcblx0XHRzdGFsZURpc2NvdmVyeUJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCBzdGFsZVJlZnJlc2g7XG5cblx0XHRjb25zdCBwbHVnaW4gPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpWzBdO1xuXHRcdHBsdWdpbi5yZW1vdmU/LigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNSZW1vdmU6IHBsdWdpbi5yZW1vdmUgIT09IHVuZGVmaW5lZCxcblx0XHRcdHJlbW92ZUNvdW50LFxuXHRcdH0sIHtcblx0XHRcdGhhc1JlbW92ZTogdHJ1ZSxcblx0XHRcdHJlbW92ZUNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIE9wZW4gUGx1Z2luIGZvcm1hdCB3aGVuIC5wbHVnaW4vcGx1Z2luLmpzb24gZXhpc3RzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9teS1vcGVuLXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbXktb3Blbi1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ215LW9wZW4tcGx1Z2luJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9teS1vcGVuLXBsdWdpbi9jb21tYW5kcy9oZWxsby5tZCcsICcjIEhlbGxvJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIHBsdWdpbiByZWFkIGNvbW1hbmRzIGZyb20gdGhlIHN0YW5kYXJkIGNvbW1hbmRzLyBkaXJlY3Rvcnlcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5jb21tYW5kcywgY21kcyA9PiBjbWRzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmNvbW1hbmRzLmdldCgpWzBdLm5hbWUsICdoZWxsbycpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBDbGF1ZGUgZm9ybWF0IHdoZW4gLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24gZXhpc3RzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9teS1jbGF1ZGUtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9teS1jbGF1ZGUtcGx1Z2luLy5jbGF1ZGUtcGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnbXktY2xhdWRlLXBsdWdpbicgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbXktY2xhdWRlLXBsdWdpbi9jb21tYW5kcy9ncmVldC5tZCcsICcjIEdyZWV0Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGNtZHMgPT4gY21kcy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5jb21tYW5kcy5nZXQoKVswXS5uYW1lLCAnZ3JlZXQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gQ29waWxvdCBmb3JtYXQgd2hlbiBubyB2ZW5kb3IgbWFuaWZlc3QgZXhpc3RzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9teS1jb3BpbG90LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbXktY29waWxvdC1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdteS1jb3BpbG90LXBsdWdpbicgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbXktY29waWxvdC1wbHVnaW4vY29tbWFuZHMvcnVuLm1kJywgJyMgUnVuJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGNtZHMgPT4gY21kcy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5jb21tYW5kcy5nZXQoKVswXS5uYW1lLCAncnVuJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdwbHVnaW4gbGFiZWwgdXNlcyBtYW5pZmVzdCBgbmFtZWAgd2hlbiBubyBtYXJrZXRwbGFjZSBtZXRhZGF0YSBpcyBwcmVzZW50JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRGlyZWN0LWluc3RhbGxlZCBwbHVnaW4gKG5vIG1hcmtldHBsYWNlIG1ldGFkYXRhKSB3aXRoIGEgYG5hbWVgIGluXG5cdFx0Ly8gaXRzIG1hbmlmZXN0IFx1MjAxNCB0aGUgbGFiZWwgc2hvdWxkIHVzZSB0aGUgbWFuaWZlc3QgbmFtZSwgbm90IHRoZVxuXHRcdC8vIHVnbGllciBkaXJlY3RvcnkgYmFzZW5hbWUuXG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9fZGlyZWN0L3N1a3VtYXJwMjAyMi0tc2xpZGUtY3JlYXRvci1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL19kaXJlY3Qvc3VrdW1hcnAyMDIyLS1zbGlkZS1jcmVhdG9yLXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdTbGlkZSBDcmVhdG9yJyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGx1Z2lucy5tYXAocCA9PiBwLmxhYmVsKSwgWydTbGlkZSBDcmVhdG9yJ10pO1xuXHR9KSk7XG5cblx0dGVzdCgncGx1Z2luIGxhYmVsIGZhbGxzIGJhY2sgdG8gYmFzZW5hbWUgd2hlbiBtYW5pZmVzdCBgbmFtZWAgaXMgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWlzc2luZ1VyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbWlzc2luZy1uYW1lJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9taXNzaW5nLW5hbWUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7fSkpO1xuXG5cdFx0Y29uc3QgYmxhbmtVcmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2JsYW5rLW5hbWUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2JsYW5rLW5hbWUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICcgICAnIH0pKTtcblxuXHRcdGNvbnN0IG5vblN0cmluZ1VyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbm9uLXN0cmluZy1uYW1lJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ub24tc3RyaW5nLW5hbWUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6IDQyIH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW21pc3NpbmdVcmksIGJsYW5rVXJpLCBub25TdHJpbmdVcmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zLm1hcChwID0+IHAubGFiZWwpLnNvcnQoKSxcblx0XHRcdFsnYmxhbmstbmFtZScsICdtaXNzaW5nLW5hbWUnLCAnbm9uLXN0cmluZy1uYW1lJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ09wZW4gUGx1Z2luIGZvcm1hdCB0YWtlcyBwcmlvcml0eSBvdmVyIENsYXVkZSBmb3JtYXQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBQbHVnaW4gaGFzIGJvdGggLnBsdWdpbi9wbHVnaW4uanNvbiBhbmQgLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24gXHUyMDE0XG5cdFx0Ly8gdGhlIG9wZW4gcGx1Z2luIG1hbmlmZXN0IHNob3VsZCBiZSBkZXRlY3RlZCBmaXJzdC5cblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2R1YWwtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kdWFsLXBsdWdpbi8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnZHVhbC1wbHVnaW4nIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2R1YWwtcGx1Z2luLy5jbGF1ZGUtcGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnZHVhbC1wbHVnaW4nIH0pKTtcblxuXHRcdC8vIFdyaXRlIGlubGluZSBNQ1AgaW50byB0aGUgb3Blbi1wbHVnaW4gbWFuaWZlc3QgdG8gdmVyaWZ5IGl0J3MgdXNlZC5cblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2R1YWwtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnZHVhbC1wbHVnaW4nLFxuXHRcdFx0bWNwU2VydmVyczogeyAnb3Blbi1zZXJ2ZXInOiB7IGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydvcGVuJ10gfSB9LFxuXHRcdH0pKTtcblxuXHRcdC8vIENsYXVkZSBtYW5pZmVzdCBkZWZpbmVzIGEgZGlmZmVyZW50IHNlcnZlciB0byBwcm92ZSBpdCdzIE5PVCByZWFkLlxuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZHVhbC1wbHVnaW4vLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnZHVhbC1wbHVnaW4nLFxuXHRcdFx0bWNwU2VydmVyczogeyAnY2xhdWRlLXNlcnZlcic6IHsgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2NsYXVkZSddIH0gfSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucywgZGVmcyA9PiBkZWZzLmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IG1jcERlZnMgPSBwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtY3BEZWZzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1jcERlZnNbMF0ubmFtZSwgJ29wZW4tc2VydmVyJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdBZ2VudCBQbHVnaW4gcm9vdCB0YWtlcyBwcmlvcml0eSBhbmQgZXhwb3NlcyBvbmx5IHBvcnRhYmxlIGNvcmUgY29tcG9uZW50cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudC1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7ICRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsIG5hbWU6ICdhZ2VudC1wbHVnaW4nIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LXBsdWdpbi8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2xlZ2FjeScsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7IGxlZ2FjeTogeyBjb21tYW5kOiAnbm9kZScgfSB9LFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LXBsdWdpbi9za2lsbHMvcG9ydGFibGUvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogcG9ydGFibGVcXG5kZXNjcmlwdGlvbjogUG9ydGFibGUgc2tpbGxcXG4tLS0nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LXBsdWdpbi9jb21tYW5kcy9pZ25vcmVkLm1kJywgJyMgSWdub3JlZCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luL2FnZW50cy9pZ25vcmVkLm1kJywgJyMgSWdub3JlZCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luLy5tY3AuanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbWNwU2VydmVyczogeyBpZ25vcmVkOiB7IGNvbW1hbmQ6ICdub2RlJyB9IH0gfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luL21jcC5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0JHNjaGVtYTogQUdFTlRfUExVR0lOX01DUF9TQ0hFTUEsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7IHBvcnRhYmxlOiB7IHR5cGU6ICdzdHJlYW1hYmxlLWh0dHAnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL21jcCcgfSB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2luID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KVswXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR3YWl0Rm9yU3RhdGUocGx1Z2luLnNraWxscywgc2tpbGxzID0+IHNraWxscy5sZW5ndGggPiAwKSxcblx0XHRcdHdhaXRGb3JTdGF0ZShwbHVnaW4ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGRlZmluaXRpb25zID0+IGRlZmluaXRpb25zLmxlbmd0aCA+IDApLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGFiZWw6IHBsdWdpbi5sYWJlbCxcblx0XHRcdHNraWxsczogcGx1Z2luLnNraWxscy5nZXQoKS5tYXAoc2tpbGwgPT4gc2tpbGwubmFtZSksXG5cdFx0XHRtY3A6IHBsdWdpbi5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKS5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKSxcblx0XHRcdGNvbW1hbmRzOiBwbHVnaW4uY29tbWFuZHMuZ2V0KCksXG5cdFx0XHRhZ2VudHM6IHBsdWdpbi5hZ2VudHMuZ2V0KCksXG5cdFx0XHRob29rczogcGx1Z2luLmhvb2tzLmdldCgpLFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiBwbHVnaW4uaW5zdHJ1Y3Rpb25zLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAnYWdlbnQtcGx1Z2luJyxcblx0XHRcdHNraWxsczogWydwb3J0YWJsZSddLFxuXHRcdFx0bWNwOiBbJ3BvcnRhYmxlJ10sXG5cdFx0XHRjb21tYW5kczogW10sXG5cdFx0XHRhZ2VudHM6IFtdLFxuXHRcdFx0aG9va3M6IFtdLFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiBbXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlY29nbml6ZWQgQWdlbnQgUGx1Z2luIHdpdGhvdXQgYSBuYW1lIHVzZXMgdGhlIGRpcmVjdG9yeSBsYWJlbCB3aXRob3V0IGxlZ2FjeSBmYWxsYmFjaycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcmVqZWN0ZWQtYWdlbnQtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yZWplY3RlZC1hZ2VudC1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7ICRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcmVqZWN0ZWQtYWdlbnQtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdsZWdhY3knIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3JlamVjdGVkLWFnZW50LXBsdWdpbi9jb21tYW5kcy9sZWdhY3kubWQnLCAnIyBMZWdhY3knKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2luID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZvcm1hdDogcGx1Z2luLmZvcm1hdCxcblx0XHRcdGxhYmVsOiBwbHVnaW4ubGFiZWwsXG5cdFx0XHRjb21tYW5kczogcGx1Z2luLmNvbW1hbmRzLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luLFxuXHRcdFx0bGFiZWw6ICdyZWplY3RlZC1hZ2VudC1wbHVnaW4nLFxuXHRcdFx0Y29tbWFuZHM6IFtdLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYWRkaW5nIGFuIEFnZW50IFBsdWdpbiBtYW5pZmVzdCByZS1kZXRlY3RzIGFuIGV4aXN0aW5nIHBsdWdpbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvdXBkYXRlZC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3VwZGF0ZWQtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdsZWdhY3knIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3VwZGF0ZWQtcGx1Z2luL2NvbW1hbmRzL2xlZ2FjeS5tZCcsICcjIExlZ2FjeScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSlbMF0uZm9ybWF0LCBQbHVnaW5Gb3JtYXQuT3BlblBsdWdpbik7XG5cblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3VwZGF0ZWQtcGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyAkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLCBuYW1lOiAndXBkYXRlZCcgfSkpO1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoZGlzY292ZXJ5LnBsdWdpbnMsIHZhbHVlID0+IHZhbHVlPy5bMF0/LmZvcm1hdCA9PT0gUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm9ybWF0OiBwbHVnaW5zPy5bMF0uZm9ybWF0LFxuXHRcdFx0Y29tbWFuZHM6IHBsdWdpbnM/LlswXS5jb21tYW5kcy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpbixcblx0XHRcdGNvbW1hbmRzOiBbXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ09wZW4gUGx1Z2luIHJlYWRzIE1DUCBkZWZpbml0aW9ucyBmcm9tIC5wbHVnaW4vcGx1Z2luLmpzb24gaW5saW5lJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9tY3AtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tY3AtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnbWNwLXBsdWdpbicsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdteS1zZXJ2ZXInOiB7IGNvbW1hbmQ6ICdub2RlJywgYXJnczogWydzZXJ2ZXIuanMnXSB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucywgZGVmcyA9PiBkZWZzLmxlbmd0aCA+IDApO1xuXHRcdGNvbnN0IG1jcERlZnMgPSBwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWNwRGVmcy5tYXAoZCA9PiBkLm5hbWUpLCBbJ215LXNlcnZlciddKTtcblx0fSkpO1xuXG5cdHRlc3QoJ09wZW4gUGx1Z2luIHJlYWRzIE1DUCBkZWZpbml0aW9ucyBmcm9tIHN0YW5kYWxvbmUgLm1jcC5qc29uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9tY3Atc3RhbmRhbG9uZScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbWNwLXN0YW5kYWxvbmUvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ21jcC1zdGFuZGFsb25lJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tY3Atc3RhbmRhbG9uZS8ubWNwLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdzdGFuZGFsb25lLXNlcnZlcic6IHsgY29tbWFuZDogJ3B5dGhvbicsIGFyZ3M6IFsnc2VydmUucHknXSB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucywgZGVmcyA9PiBkZWZzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpWzBdLm5hbWUsICdzdGFuZGFsb25lLXNlcnZlcicpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgc2tpbGxzIGZyb20gc2tpbGxzLyBzdWJkaXJlY3RvcmllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvc2tpbGxzLXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvc2tpbGxzLXBsdWdpbi8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnc2tpbGxzLXBsdWdpbicgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvc2tpbGxzLXBsdWdpbi9za2lsbHMvZGVwbG95L1NLSUxMLm1kJywgJyMgRGVwbG95IHNraWxsJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9za2lsbHMtcGx1Z2luL3NraWxscy9saW50L1NLSUxMLm1kJywgJyMgTGludCBza2lsbCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3Qgc2tpbGxOYW1lcyA9IHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLm1hcChzID0+IHMubmFtZSkuc29ydCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2tpbGxOYW1lcywgWydkZXBsb3knLCAnbGludCddKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlYWRzIHJvb3QtbGV2ZWwgU0tJTEwubWQgYXMgYSBmYWxsYmFjayBza2lsbCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcm9vdC1za2lsbCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcm9vdC1za2lsbC8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAncm9vdC1za2lsbCcgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcm9vdC1za2lsbC9TS0lMTC5tZCcsICcjIFZpc3VhbCBFeHBsYWluZXInKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLnNraWxscywgcyA9PiBzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLnNraWxscy5nZXQoKS5tYXAocyA9PiBzLm5hbWUpLFxuXHRcdFx0Wydyb290LXNraWxsJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Jvb3QtbGV2ZWwgU0tJTEwubWQgaXMgaWdub3JlZCB3aGVuIHNraWxscy8gaGFzIGNvbnRlbnQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3Jvb3Qtc2tpbGwtaWdub3JlZCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcm9vdC1za2lsbC1pZ25vcmVkLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdyb290LXNraWxsLWlnbm9yZWQnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3Jvb3Qtc2tpbGwtaWdub3JlZC9TS0lMTC5tZCcsICcjIFJvb3Qgc2tpbGwnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3Jvb3Qtc2tpbGwtaWdub3JlZC9za2lsbHMvcmVhbC9TS0lMTC5tZCcsICcjIFJlYWwgc2tpbGwnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLnNraWxscywgcyA9PiBzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLnNraWxscy5nZXQoKS5tYXAocyA9PiBzLm5hbWUpLFxuXHRcdFx0WydyZWFsJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlYWRzIGFnZW50cyBmcm9tIGFnZW50cy8gZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9hZ2VudHMtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudHMtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdhZ2VudHMtcGx1Z2luJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudHMtcGx1Z2luL2FnZW50cy9yZXZpZXdlci5tZCcsICctLS1cXG5uYW1lOiByZXZpZXdlclxcbi0tLVxcbllvdSByZXZpZXcgY29kZS4nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmFnZW50cywgYSA9PiBhLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmFnZW50cy5nZXQoKVswXS5uYW1lLCAncmV2aWV3ZXInKTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hbmlmZXN0IHNraWxscyBmaWVsZCBhZGRzIHN1cHBsZW1lbnRhbCBza2lsbCBkaXJlY3RvcmllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvY3VzdG9tLXNraWxscycpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY3VzdG9tLXNraWxscy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2N1c3RvbS1za2lsbHMnLFxuXHRcdFx0c2tpbGxzOiAnLi9leHRyYS1za2lsbHMvJyxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tc2tpbGxzL3NraWxscy9kZWZhdWx0LXNraWxsL1NLSUxMLm1kJywgJyMgRGVmYXVsdCBza2lsbCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY3VzdG9tLXNraWxscy9leHRyYS1za2lsbHMvYm9udXMtc2tpbGwvU0tJTEwubWQnLCAnIyBCb251cyBza2lsbCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID49IDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLnNraWxscy5nZXQoKS5tYXAocyA9PiBzLm5hbWUpLnNvcnQoKSxcblx0XHRcdFsnYm9udXMtc2tpbGwnLCAnZGVmYXVsdC1za2lsbCddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBza2lsbHMgZmllbGQgd2l0aCBleGNsdXNpdmUgbW9kZSBza2lwcyBkZWZhdWx0IGRpcmVjdG9yeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvZXhjbHVzaXZlLXNraWxscycpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZXhjbHVzaXZlLXNraWxscy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2V4Y2x1c2l2ZS1za2lsbHMnLFxuXHRcdFx0c2tpbGxzOiB7IHBhdGhzOiBbJy4vb25seS1oZXJlLyddLCBleGNsdXNpdmU6IHRydWUgfSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9leGNsdXNpdmUtc2tpbGxzL3NraWxscy9pZ25vcmVkL1NLSUxMLm1kJywgJyMgU2hvdWxkIGJlIGlnbm9yZWQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2V4Y2x1c2l2ZS1za2lsbHMvb25seS1oZXJlL3Zpc2libGUvU0tJTEwubWQnLCAnIyBTaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLm1hcChzID0+IHMubmFtZSksXG5cdFx0XHRbJ3Zpc2libGUnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgY29tbWFuZHMgZmllbGQgd2l0aCBzdHJpbmcgYXJyYXkgc2NhbnMgbXVsdGlwbGUgZGlyZWN0b3JpZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL211bHRpLWNvbW1hbmRzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tdWx0aS1jb21tYW5kcy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ211bHRpLWNvbW1hbmRzJyxcblx0XHRcdGNvbW1hbmRzOiBbJy4vY21kMS8nLCAnLi9jbWQyLyddLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL211bHRpLWNvbW1hbmRzL2NvbW1hbmRzL2RlZmF1bHQubWQnLCAnIyBEZWZhdWx0Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tdWx0aS1jb21tYW5kcy9jbWQxL2FscGhhLm1kJywgJyMgQWxwaGEnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL211bHRpLWNvbW1hbmRzL2NtZDIvYmV0YS5tZCcsICcjIEJldGEnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmNvbW1hbmRzLCBjID0+IGMubGVuZ3RoID49IDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmNvbW1hbmRzLmdldCgpLm1hcChjID0+IGMubmFtZSkuc29ydCgpLFxuXHRcdFx0WydhbHBoYScsICdiZXRhJywgJ2RlZmF1bHQnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgYWdlbnRzIGZpZWxkIGFkZHMgc3VwcGxlbWVudGFsIGFnZW50IGRpcmVjdG9yaWVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9jdXN0b20tYWdlbnRzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tYWdlbnRzLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnY3VzdG9tLWFnZW50cycsXG5cdFx0XHRhZ2VudHM6ICcuL2V4dHJhLWFnZW50cy8nLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2N1c3RvbS1hZ2VudHMvYWdlbnRzL2RlZmF1bHQtYWdlbnQubWQnLCAnIyBEZWZhdWx0Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tYWdlbnRzL2V4dHJhLWFnZW50cy9ib251cy1hZ2VudC5tZCcsICcjIEJvbnVzJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5hZ2VudHMsIGEgPT4gYS5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uYWdlbnRzLmdldCgpLm1hcChhID0+IGEubmFtZSkuc29ydCgpLFxuXHRcdFx0Wydib251cy1hZ2VudCcsICdkZWZhdWx0LWFnZW50J10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3BhdGggdHJhdmVyc2FsIGluIG1hbmlmZXN0IGlzIHJlamVjdGVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy90cmF2ZXJzYWwnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3RyYXZlcnNhbC8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ3RyYXZlcnNhbCcsXG5cdFx0XHRza2lsbHM6ICcuLi9vdXRzaWRlLycsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvb3V0c2lkZS9ldmlsL1NLSUxMLm1kJywgJyMgRXZpbCBza2lsbCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gT25seSBkZWZhdWx0IHNraWxscy8gZGlyZWN0b3J5IHNob3VsZCBiZSBzY2FubmVkOyB0aGUgdHJhdmVyc2FsIHBhdGggaXMgcmVqZWN0ZWQuXG5cdFx0Ly8gU2luY2UgdGhlcmUgYXJlIG5vIHNraWxscyBpbiBza2lsbHMvLCByZXN1bHQgc2hvdWxkIGJlIGVtcHR5LlxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLnNraWxscywgKCkgPT4gdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwbHVnaW5zWzBdLnNraWxscy5nZXQoKSwgW10pO1xuXHR9KSk7XG5cblx0dGVzdCgnZHVwbGljYXRlIG5hbWVzIGFjcm9zcyBkaXJlY3RvcmllcyBkZWR1cGxpY2F0ZSAoZmlyc3Qgd2lucyknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2RlZHVwJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kZWR1cC8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2RlZHVwJyxcblx0XHRcdGNvbW1hbmRzOiAnLi9leHRyYS1jb21tYW5kcy8nLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2RlZHVwL2NvbW1hbmRzL3NoYXJlZC5tZCcsICcjIERlZmF1bHQgdmVyc2lvbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZGVkdXAvZXh0cmEtY29tbWFuZHMvc2hhcmVkLm1kJywgJyMgQ3VzdG9tIHZlcnNpb24nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmNvbW1hbmRzLCBjID0+IGMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgY21kcyA9IHBsdWdpbnNbMF0uY29tbWFuZHMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY21kc1swXS5uYW1lLCAnc2hhcmVkJyk7XG5cdFx0Ly8gVGhlIGRlZmF1bHQgZGlyZWN0b3J5IGlzIHNjYW5uZWQgZmlyc3QsIHNvIHRoZSBVUkkgc2hvdWxkIGNvbWUgZnJvbSBjb21tYW5kcy9cblx0XHRhc3NlcnQub2soY21kc1swXS51cmkucGF0aC5pbmNsdWRlcygnL2NvbW1hbmRzL3NoYXJlZC5tZCcpKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBjb21wb25lbnRzIHdpdGhvdXQgYSBtYW5pZmVzdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbm8tbWFuaWZlc3QnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL25vLW1hbmlmZXN0L2NvbW1hbmRzL2hlbGxvLm1kJywgJyMgSGVsbG8nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL25vLW1hbmlmZXN0L3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcsICcjIE15IHNraWxsJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9uby1tYW5pZmVzdC9hZ2VudHMvaGVscGVyLm1kJywgJyMgSGVscGVyJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9uby1tYW5pZmVzdC9ydWxlcy9wcmVmZXItY29uc3QubWRjJywgJy0tLVxcbmRlc2NyaXB0aW9uOiBQcmVmZXIgY29uc3RcXG4tLS1cXG5Vc2UgY29uc3QuJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0ubGFiZWwsICduby1tYW5pZmVzdCcpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGMgPT4gYy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5jb21tYW5kcy5nZXQoKVswXS5uYW1lLCAnaGVsbG8nKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLnNraWxscywgcyA9PiBzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLnNraWxscy5nZXQoKVswXS5uYW1lLCAnbXktc2tpbGwnKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmFnZW50cywgYSA9PiBhLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmFnZW50cy5nZXQoKVswXS5uYW1lLCAnaGVscGVyJyk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMuZ2V0KClbMF0ubmFtZSwgJ3ByZWZlci1jb25zdCcpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgaG9va3MgZnJvbSBkZWZhdWx0IGhvb2tzL2hvb2tzLmpzb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2hvb2tzLWRlZmF1bHQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2hvb2tzLWRlZmF1bHQvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ2hvb2tzLWRlZmF1bHQnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2hvb2tzLWRlZmF1bHQvaG9va3MvaG9va3MuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFBvc3RUb29sVXNlOiBbeyBtYXRjaGVyOiAnV3JpdGUnLCBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBkb25lJyB9XSB9XSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmhvb2tzLCBoID0+IGgubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0uaG9va3MuZ2V0KCkubGVuZ3RoLCAxKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlYWRzIGlubGluZSBob29rcyBmcm9tIG1hbmlmZXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9ob29rcy1pbmxpbmUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2hvb2tzLWlubGluZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2hvb2tzLWlubGluZScsXG5cdFx0XHRob29rczoge1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFNlc3Npb25TdGFydDogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gc3RhcnQnIH1dIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaG9va3MsIGggPT4gaC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5ob29rcy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgaG9va3MgZnJvbSBjdXN0b20gcGF0aCBpbiBtYW5pZmVzdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvaG9va3MtY3VzdG9tJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ob29rcy1jdXN0b20vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdob29rcy1jdXN0b20nLFxuXHRcdFx0aG9va3M6ICcuL2NvbmZpZy9teS1ob29rcy5qc29uJyxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ob29rcy1jdXN0b20vY29uZmlnL215LWhvb2tzLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRob29rczoge1xuXHRcdFx0XHRQb3N0VG9vbFVzZTogW3sgbWF0Y2hlcjogJ0VkaXQnLCBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBlZGl0ZWQnIH1dIH1dLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaG9va3MsIGggPT4gaC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5ob29rcy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgTUNQIGZyb20gY3VzdG9tIHBhdGggaW4gbWFuaWZlc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL21jcC1jdXN0b20nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1jdXN0b20vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdtY3AtY3VzdG9tJyxcblx0XHRcdG1jcFNlcnZlcnM6ICcuL2NvbmZpZy9zZXJ2ZXJzLmpzb24nLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1jdXN0b20vY29uZmlnL3NlcnZlcnMuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J2N1c3RvbS1zZXJ2ZXInOiB7IGNvbW1hbmQ6ICdub2RlJywgYXJnczogWydjdXN0b20uanMnXSB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGQgPT4gZC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKVswXS5uYW1lLCAnY3VzdG9tLXNlcnZlcicpO1xuXHR9KSk7XG5cblx0dGVzdCgnaW5saW5lIE1DUCBpbiBtYW5pZmVzdCB0YWtlcyBwcmlvcml0eSBvdmVyIHN0YW5kYWxvbmUgLm1jcC5qc29uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9tY3AtbWVyZ2VkJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tY3AtbWVyZ2VkLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnbWNwLW1lcmdlZCcsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdpbmxpbmUtc2VydmVyJzogeyBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnaW5saW5lJ10gfSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbWNwLW1lcmdlZC8ubWNwLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdmaWxlLXNlcnZlcic6IHsgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2ZpbGUnXSB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBXaGVuIGlubGluZSBtY3BTZXJ2ZXJzIGlzIGFuIG9iamVjdCBpbiB0aGUgbWFuaWZlc3QsIGl0IGlzIHRyZWF0ZWQgYXNcblx0XHQvLyBlbWJlZGRlZCBjb25maWd1cmF0aW9uIGFuZCB0aGUgZGVmYXVsdCAubWNwLmpzb24gZmlsZSBpcyBub3QgcmVhZC5cblx0XHQvLyBXYWl0IGZvciB0aGUgaW5saW5lIHNlcnZlciB0byBhcHBlYXIgKG1hbmlmZXN0IGxvYWRzIGFzeW5jaHJvbm91c2x5KS5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucywgZCA9PlxuXHRcdFx0Wy4uLmRdLnNvbWUocyA9PiBzLm5hbWUgPT09ICdpbmxpbmUtc2VydmVyJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpLm1hcChkID0+IGQubmFtZSksXG5cdFx0XHRbJ2lubGluZS1zZXJ2ZXInXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnUExVR0lOX1JPT1QgZXhwYW5zaW9uIGluIGhvb2sgY29tbWFuZHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3Jvb3QtZXhwYW5zaW9uJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yb290LWV4cGFuc2lvbi8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ3Jvb3QtZXhwYW5zaW9uJyxcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0UG9zdFRvb2xVc2U6IFt7XG5cdFx0XHRcdFx0XHRob29rczogW3tcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiAnJHtQTFVHSU5fUk9PVH0vc2NyaXB0cy9mb3JtYXQuc2gnLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5ob29rcywgaCA9PiBoLmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgaG9va0NvbW1hbmRzID0gcGx1Z2luc1swXS5ob29rcy5nZXQoKVswXS5ob29rcztcblx0XHRhc3NlcnQub2soaG9va0NvbW1hbmRzLmxlbmd0aCA+IDApO1xuXHRcdC8vICR7UExVR0lOX1JPT1R9IHNob3VsZCBiZSBleHBhbmRlZCB0byB0aGUgcGx1Z2luJ3MgZnNQYXRoXG5cdFx0Y29uc3QgY29tbWFuZCA9IGhvb2tDb21tYW5kc1swXS5jb21tYW5kO1xuXHRcdGFzc2VydC5vayhjb21tYW5kICYmICFjb21tYW5kLmluY2x1ZGVzKCcke1BMVUdJTl9ST09UfScpLCBgRXhwZWN0ZWQgUExVR0lOX1JPT1QgdG8gYmUgZXhwYW5kZWQsIGdvdDogJHtjb21tYW5kfWApO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgY29tbWFuZHMgZmllbGQgcG9pbnRpbmcgdG8gYSBzcGVjaWZpYyBmaWxlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9jbWQtZmlsZScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY21kLWZpbGUvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdjbWQtZmlsZScsXG5cdFx0XHRjb21tYW5kczogJy4vc3BlY2lhbC9kZXBsb3kubWQnLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NtZC1maWxlL2NvbW1hbmRzL2RlZmF1bHQubWQnLCAnIyBEZWZhdWx0Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jbWQtZmlsZS9zcGVjaWFsL2RlcGxveS5tZCcsICcjIERlcGxveScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGMgPT4gYy5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uY29tbWFuZHMuZ2V0KCkubWFwKGMgPT4gYy5uYW1lKS5zb3J0KCksXG5cdFx0XHRbJ2RlZmF1bHQnLCAnZGVwbG95J10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hbmlmZXN0IGNvbW1hbmRzIGZpZWxkIHdpdGggYXJyYXkgb2Ygc3BlY2lmaWMgZmlsZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2NtZC1maWxlcycpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY21kLWZpbGVzLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnY21kLWZpbGVzJyxcblx0XHRcdGNvbW1hbmRzOiBbJy4vZXh0cmFzL2FscGhhLm1kJywgJy4vZXh0cmFzL2JldGEubWQnXSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jbWQtZmlsZXMvZXh0cmFzL2FscGhhLm1kJywgJyMgQWxwaGEnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NtZC1maWxlcy9leHRyYXMvYmV0YS5tZCcsICcjIEJldGEnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmNvbW1hbmRzLCBjID0+IGMubGVuZ3RoID49IDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmNvbW1hbmRzLmdldCgpLm1hcChjID0+IGMubmFtZSkuc29ydCgpLFxuXHRcdFx0WydhbHBoYScsICdiZXRhJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hbmlmZXN0IGFnZW50cyBmaWVsZCBwb2ludGluZyB0byBhIHNwZWNpZmljIGZpbGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2FnZW50LWZpbGUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LWZpbGUvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdhZ2VudC1maWxlJyxcblx0XHRcdGFnZW50czogJy4vY3VzdG9tL3NwZWNpYWxpc3QubWQnLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LWZpbGUvYWdlbnRzL2RlZmF1bHQubWQnLCAnIyBEZWZhdWx0Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudC1maWxlL2N1c3RvbS9zcGVjaWFsaXN0Lm1kJywgJyMgU3BlY2lhbGlzdCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uYWdlbnRzLCBhID0+IGEubGVuZ3RoID49IDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmFnZW50cy5nZXQoKS5tYXAoYSA9PiBhLm5hbWUpLnNvcnQoKSxcblx0XHRcdFsnZGVmYXVsdCcsICdzcGVjaWFsaXN0J10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hbmlmZXN0IHNraWxscyBmaWVsZCBwb2ludGluZyB0byBhIHNwZWNpZmljIHNraWxsIGRpcmVjdG9yeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvc2tpbGwtZGlyJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9za2lsbC1kaXIvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdza2lsbC1kaXInLFxuXHRcdFx0c2tpbGxzOiAnLi9jdXN0b20vbXktc2tpbGwnLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3NraWxsLWRpci9jdXN0b20vbXktc2tpbGwvU0tJTEwubWQnLCAnIyBNeSBTa2lsbCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLm1hcChzID0+IHMubmFtZSksXG5cdFx0XHRbJ215LXNraWxsJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hbmlmZXN0IGhvb2tzIGZpZWxkIHBvaW50aW5nIHRvIGEgc3BlY2lmaWMgZmlsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvaG9vay1maWxlJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ob29rLWZpbGUvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdob29rLWZpbGUnLFxuXHRcdFx0aG9va3M6ICcuL2NvbmZpZy9jdXN0b20taG9va3MuanNvbicsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvaG9vay1maWxlL2NvbmZpZy9jdXN0b20taG9va3MuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFNlc3Npb25TdGFydDogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gaGknIH1dIH1dLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaG9va3MsIGggPT4gaC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5ob29rcy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgbWNwU2VydmVycyBmaWVsZCBwb2ludGluZyB0byBhIHNwZWNpZmljIGZpbGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL21jcC1maWxlJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tY3AtZmlsZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ21jcC1maWxlJyxcblx0XHRcdG1jcFNlcnZlcnM6ICcuL2NvbmZpZy9zZXJ2ZXJzLmpzb24nLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1maWxlL2NvbmZpZy9zZXJ2ZXJzLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdjdXN0b20tc2VydmVyJzogeyBjb21tYW5kOiAnbm9kZScsIGFyZ3M6IFsnc2VydmUuanMnXSB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGQgPT4gZC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKVswXS5uYW1lLCAnY3VzdG9tLXNlcnZlcicpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgcnVsZXMgZnJvbSBydWxlcy8gZGlyZWN0b3J5IHdpdGggLm1kYyBleHRlbnNpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3J1bGVzLXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcnVsZXMtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdydWxlcy1wbHVnaW4nIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3J1bGVzLXBsdWdpbi9ydWxlcy9wcmVmZXItY29uc3QubWRjJywgJy0tLVxcbmRlc2NyaXB0aW9uOiBQcmVmZXIgY29uc3RcXG4tLS1cXG5Vc2UgY29uc3QuJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ydWxlcy1wbHVnaW4vcnVsZXMvZXJyb3ItaGFuZGxpbmcubWRjJywgJy0tLVxcbmRlc2NyaXB0aW9uOiBFcnJvciBoYW5kbGluZ1xcbi0tLVxcbkFsd2F5cyBoYW5kbGUgZXJyb3JzLicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLCBpID0+IGkubGVuZ3RoID49IDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKS5tYXAoaSA9PiBpLm5hbWUpLnNvcnQoKSxcblx0XHRcdFsnZXJyb3ItaGFuZGxpbmcnLCAncHJlZmVyLWNvbnN0J10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlYWRzIHJ1bGVzIHdpdGggLm1kIGFuZCAuaW5zdHJ1Y3Rpb25zLm1kIGV4dGVuc2lvbnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3J1bGVzLW1peGVkJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ydWxlcy1taXhlZC8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAncnVsZXMtbWl4ZWQnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3J1bGVzLW1peGVkL3J1bGVzL3J1bGUtYS5tZGMnLCAnUnVsZSBBJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ydWxlcy1taXhlZC9ydWxlcy9ydWxlLWIubWQnLCAnUnVsZSBCJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ydWxlcy1taXhlZC9ydWxlcy9ydWxlLWMuaW5zdHJ1Y3Rpb25zLm1kJywgJ1J1bGUgQycpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLCBpID0+IGkubGVuZ3RoID49IDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKS5tYXAoaSA9PiBpLm5hbWUpLnNvcnQoKSxcblx0XHRcdFsncnVsZS1hJywgJ3J1bGUtYicsICdydWxlLWMnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgcnVsZXMgZmllbGQgYWRkcyBzdXBwbGVtZW50YWwgcnVsZSBkaXJlY3RvcmllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvY3VzdG9tLXJ1bGVzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tcnVsZXMvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdjdXN0b20tcnVsZXMnLFxuXHRcdFx0cnVsZXM6ICcuL2V4dHJhLXJ1bGVzLycsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY3VzdG9tLXJ1bGVzL3J1bGVzL2RlZmF1bHQtcnVsZS5tZGMnLCAnRGVmYXVsdCBydWxlJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tcnVsZXMvZXh0cmEtcnVsZXMvYm9udXMtcnVsZS5tZGMnLCAnQm9udXMgcnVsZScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLCBpID0+IGkubGVuZ3RoID49IDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKS5tYXAoaSA9PiBpLm5hbWUpLnNvcnQoKSxcblx0XHRcdFsnYm9udXMtcnVsZScsICdkZWZhdWx0LXJ1bGUnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgcnVsZXMgZmllbGQgd2l0aCBleGNsdXNpdmUgbW9kZSBza2lwcyBkZWZhdWx0IGRpcmVjdG9yeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvZXhjbHVzaXZlLXJ1bGVzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9leGNsdXNpdmUtcnVsZXMvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdleGNsdXNpdmUtcnVsZXMnLFxuXHRcdFx0cnVsZXM6IHsgcGF0aHM6IFsnLi9vbmx5LWhlcmUvJ10sIGV4Y2x1c2l2ZTogdHJ1ZSB9LFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2V4Y2x1c2l2ZS1ydWxlcy9ydWxlcy9pZ25vcmVkLm1kYycsICdTaG91bGQgYmUgaWdub3JlZCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZXhjbHVzaXZlLXJ1bGVzL29ubHktaGVyZS92aXNpYmxlLm1kYycsICdTaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLCBpID0+IGkubGVuZ3RoID09PSAxICYmIGlbMF0ubmFtZSA9PT0gJ3Zpc2libGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGx1Z2luc1swXS5pbnN0cnVjdGlvbnMuZ2V0KCkubWFwKGkgPT4gaS5uYW1lKSxcblx0XHRcdFsndmlzaWJsZSddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdydWxlIG5hbWUgc3RyaXBzIGxvbmdlc3QgbWF0Y2hpbmcgc3VmZml4IGZpcnN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9zdWZmaXgtcnVsZXMnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3N1ZmZpeC1ydWxlcy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnc3VmZml4LXJ1bGVzJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9zdWZmaXgtcnVsZXMvcnVsZXMvY29kaW5nLXN0YW5kYXJkcy5pbnN0cnVjdGlvbnMubWQnLCAnU3RhbmRhcmRzJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPiAwKTtcblx0XHQvLyBTaG91bGQgc3RyaXAgJy5pbnN0cnVjdGlvbnMubWQnIChsb25nZXN0IG1hdGNoKSwgbm90IGp1c3QgJy5tZCdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMuZ2V0KClbMF0ubmFtZSwgJ2NvZGluZy1zdGFuZGFyZHMnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RlZHVwbGljYXRlcyBydWxlcyB3aXRoIHRoZSBzYW1lIGJhc2UgbmFtZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvZHVwLXJ1bGVzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kdXAtcnVsZXMvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdkdXAtcnVsZXMnLFxuXHRcdFx0cnVsZXM6ICcuL2V4dHJhLycsXG5cdFx0fSkpO1xuXHRcdC8vIERlZmF1bHQgZGlyZWN0b3J5IGhhcyAnbXktcnVsZS5tZGMnLCBzdXBwbGVtZW50YWwgaGFzICdteS1ydWxlLm1kJyBcdTIwMTQgZmlyc3Qgd2luc1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZHVwLXJ1bGVzL3J1bGVzL215LXJ1bGUubWRjJywgJ0Zyb20gZGVmYXVsdCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZHVwLXJ1bGVzL2V4dHJhL215LXJ1bGUubWQnLCAnRnJvbSBleHRyYScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLCBpID0+IGkubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb24gPSBwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb24ubmFtZSwgJ215LXJ1bGUnKTtcblx0XHRhc3NlcnQub2soaW5zdHJ1Y3Rpb24udXJpLnBhdGguZW5kc1dpdGgoJy9ydWxlcy9teS1ydWxlLm1kYycpKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1BMVUdJTl9ST09UIGV4cGFuc2lvbiBpbiBpbmxpbmUgTUNQIHNlcnZlciBkZWZpbml0aW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbWNwLXJvb3QnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1yb290Ly5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnbWNwLXJvb3QnLFxuXHRcdFx0bWNwU2VydmVyczoge1xuXHRcdFx0XHQnbXktc2VydmVyJzoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke1BMVUdJTl9ST09UfS9iaW4vc2VydmVyJyxcblx0XHRcdFx0XHRhcmdzOiBbJy0tY29uZmlnJywgJyR7UExVR0lOX1JPT1R9L2NvbmZpZy5qc29uJ10sXG5cdFx0XHRcdFx0Y3dkOiAnJHtQTFVHSU5fUk9PVH0nLFxuXHRcdFx0XHRcdGVudjogeyAnQ09ORklHX0RJUic6ICcke1BMVUdJTl9ST09UfS9ldGMnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkID0+IGQubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3Qgc2VydmVyID0gcGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLm5hbWUsICdteS1zZXJ2ZXInKTtcblx0XHRjb25zdCBjb25maWc6IGFueSA9IHNlcnZlci5jb25maWd1cmF0aW9uO1xuXHRcdGFzc2VydC5vayghY29uZmlnLmNvbW1hbmQuaW5jbHVkZXMoJyR7UExVR0lOX1JPT1R9JyksIGBFeHBlY3RlZCBQTFVHSU5fUk9PVCB0byBiZSBleHBhbmRlZCBpbiBjb21tYW5kLCBnb3Q6ICR7Y29uZmlnLmNvbW1hbmR9YCk7XG5cdFx0YXNzZXJ0Lm9rKCFjb25maWcuYXJnc1sxXS5pbmNsdWRlcygnJHtQTFVHSU5fUk9PVH0nKSwgYEV4cGVjdGVkIFBMVUdJTl9ST09UIHRvIGJlIGV4cGFuZGVkIGluIGFyZ3MsIGdvdDogJHtjb25maWcuYXJnc1sxXX1gKTtcblx0XHRhc3NlcnQub2soIWNvbmZpZy5jd2QuaW5jbHVkZXMoJyR7UExVR0lOX1JPT1R9JyksIGBFeHBlY3RlZCBQTFVHSU5fUk9PVCB0byBiZSBleHBhbmRlZCBpbiBjd2QsIGdvdDogJHtjb25maWcuY3dkfWApO1xuXHRcdGFzc2VydC5vayghY29uZmlnLmVudlsnQ09ORklHX0RJUiddLmluY2x1ZGVzKCcke1BMVUdJTl9ST09UfScpLCBgRXhwZWN0ZWQgUExVR0lOX1JPT1QgdG8gYmUgZXhwYW5kZWQgaW4gZW52LCBnb3Q6ICR7Y29uZmlnLmVudlsnQ09ORklHX0RJUiddfWApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZW52WydQTFVHSU5fUk9PVCddLCB1cmkuZnNQYXRoLCAnRXhwZWN0ZWQgUExVR0lOX1JPT1QgZW52IHZhciB0byBiZSBzZXQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0NMQVVERV9QTFVHSU5fUk9PVCBleHBhbnNpb24gaW4gTUNQIHNlcnZlciBkZWZpbml0aW9ucyBmcm9tIC5tY3AuanNvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvY2xhdWRlLW1jcC1yb290Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jbGF1ZGUtbWNwLXJvb3QvLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdjbGF1ZGUtbWNwLXJvb3QnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NsYXVkZS1tY3Atcm9vdC8ubWNwLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdjbGF1ZGUtc2VydmVyJzoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke0NMQVVERV9QTFVHSU5fUk9PVH0vcnVuLnNoJyxcblx0XHRcdFx0XHRhcmdzOiBbJy0tZGlyJywgJyR7Q0xBVURFX1BMVUdJTl9ST09UfS9kYXRhJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkID0+IGQubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3Qgc2VydmVyID0gcGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKVswXTtcblx0XHRjb25zdCBjb25maWc6IGFueSA9IHNlcnZlci5jb25maWd1cmF0aW9uO1xuXHRcdGFzc2VydC5vayghY29uZmlnLmNvbW1hbmQuaW5jbHVkZXMoJyR7Q0xBVURFX1BMVUdJTl9ST09UfScpLCBgRXhwZWN0ZWQgQ0xBVURFX1BMVUdJTl9ST09UIHRvIGJlIGV4cGFuZGVkIGluIGNvbW1hbmQsIGdvdDogJHtjb25maWcuY29tbWFuZH1gKTtcblx0XHRhc3NlcnQub2soIWNvbmZpZy5hcmdzWzFdLmluY2x1ZGVzKCcke0NMQVVERV9QTFVHSU5fUk9PVH0nKSwgYEV4cGVjdGVkIENMQVVERV9QTFVHSU5fUk9PVCB0byBiZSBleHBhbmRlZCBpbiBhcmdzLCBnb3Q6ICR7Y29uZmlnLmFyZ3NbMV19YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5lbnZbJ0NMQVVERV9QTFVHSU5fUk9PVCddLCB1cmkuZnNQYXRoLCAnRXhwZWN0ZWQgQ0xBVURFX1BMVUdJTl9ST09UIGVudiB2YXIgdG8gYmUgc2V0Jyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdDb3BpbG90IFBsdWdpbiBNQ1Agc2VydmVycyBleHBhbmQgcm9vdCBhbGlhc2VzIGFuZCBkZWZhdWx0IGN3ZCB0byBwbHVnaW4gcm9vdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvY29waWxvdC1tY3Atcm9vdCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY29waWxvdC1tY3Atcm9vdC9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ2NvcGlsb3QtbWNwLXJvb3QnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NvcGlsb3QtbWNwLXJvb3QvLm1jcC5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bWNwU2VydmVyczoge1xuXHRcdFx0XHQnY29waWxvdC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7UExVR0lOX1JPT1R9L2Jpbi9zZXJ2ZXInLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLS1kYXRhJywgJyR7Q0xBVURFX1BMVUdJTl9ST09UfS9kYXRhJ10sXG5cdFx0XHRcdFx0ZW52OiB7IENPTkZJR19ESVI6ICcke1BMVUdJTl9ST09UfS9ldGMnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdleHBsaWNpdC1jd2Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRjd2Q6ICcvY3VzdG9tL2N3ZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkID0+IGQubGVuZ3RoID09PSAyKTtcblx0XHRjb25zdCBzZXJ2ZXJzID0gbmV3IE1hcChwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpLm1hcChzZXJ2ZXIgPT4gW3NlcnZlci5uYW1lLCBzZXJ2ZXIuY29uZmlndXJhdGlvbl0pKTtcblx0XHRjb25zdCBkZWZhdWx0Q3dkQ29uZmlnID0gc2VydmVycy5nZXQoJ2NvcGlsb3Qtc2VydmVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHRDd2RDb25maWc/LnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdGlmIChkZWZhdWx0Q3dkQ29uZmlnPy50eXBlICE9PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgYSBsb2NhbCBNQ1Agc2VydmVyIGNvbmZpZ3VyYXRpb24nKTtcblx0XHR9XG5cdFx0Y29uc3QgZXhwbGljaXRDd2RDb25maWcgPSBzZXJ2ZXJzLmdldCgnZXhwbGljaXQtY3dkLXNlcnZlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBsaWNpdEN3ZENvbmZpZz8udHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0aWYgKGV4cGxpY2l0Q3dkQ29uZmlnPy50eXBlICE9PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgYSBsb2NhbCBNQ1Agc2VydmVyIGNvbmZpZ3VyYXRpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZWZhdWx0Q3dkOiB7XG5cdFx0XHRcdGNvbW1hbmQ6IGRlZmF1bHRDd2RDb25maWcuY29tbWFuZCxcblx0XHRcdFx0YXJnczogZGVmYXVsdEN3ZENvbmZpZy5hcmdzLFxuXHRcdFx0XHRjd2Q6IGRlZmF1bHRDd2RDb25maWcuY3dkLFxuXHRcdFx0XHRlbnY6IGRlZmF1bHRDd2RDb25maWcuZW52LFxuXHRcdFx0fSxcblx0XHRcdGV4cGxpY2l0Q3dkOiB7XG5cdFx0XHRcdGNvbW1hbmQ6IGV4cGxpY2l0Q3dkQ29uZmlnLmNvbW1hbmQsXG5cdFx0XHRcdGN3ZDogZXhwbGljaXRDd2RDb25maWcuY3dkLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0Q3dkOiB7XG5cdFx0XHRcdGNvbW1hbmQ6IGAke3VyaS5mc1BhdGh9L2Jpbi9zZXJ2ZXJgLFxuXHRcdFx0XHRhcmdzOiBbJy0tZGF0YScsIGAke3VyaS5mc1BhdGh9L2RhdGFgXSxcblx0XHRcdFx0Y3dkOiB1cmkuZnNQYXRoLFxuXHRcdFx0XHRlbnY6IHtcblx0XHRcdFx0XHRDT05GSUdfRElSOiBgJHt1cmkuZnNQYXRofS9ldGNgLFxuXHRcdFx0XHRcdFBMVUdJTl9ST09UOiB1cmkuZnNQYXRoLFxuXHRcdFx0XHRcdENMQVVERV9QTFVHSU5fUk9PVDogdXJpLmZzUGF0aCxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRleHBsaWNpdEN3ZDoge1xuXHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdGN3ZDogJy9jdXN0b20vY3dkJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG1DQUFxRDtBQUM5RCxTQUFTLHlCQUF5QiwyQkFBMkI7QUFDN0QsU0FBUyxvQkFBb0I7QUFNN0IsTUFBTSw0QkFBNEIsNkJBQTZCO0FBQUEsRUFLOUQsWUFDQyxhQUNBLGFBQ0EsWUFDQSx5QkFDQztBQUNELFVBQU0sYUFBYSxhQUFhLFlBQVksdUJBQXVCO0FBVnBFLFNBQVEsV0FBa0IsQ0FBQztBQUMzQixTQUFRLFVBQW9DLE1BQU07QUFBQSxJQUFFO0FBQUEsRUFV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LFVBQU0sVUFBVSxxQkFBcUIsQ0FBQyxHQUFHLENBQUM7QUFFMUMsVUFBTSxVQUFVLHFCQUFxQixTQUFTO0FBQzlDLFdBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUVwQyxVQUFNLGFBQWEsUUFBUSxDQUFDLEVBQUUsc0JBQXNCLE9BQUssRUFBRSxXQUFXLENBQUM7QUFDdkUsVUFBTSxVQUFVLElBQUksSUFBSSxRQUFRLENBQUMsRUFBRSxxQkFBcUIsSUFBSSxFQUFFLElBQUksWUFBVSxDQUFDLE9BQU8sTUFBTSxPQUFPLGFBQWEsQ0FBQyxDQUFDO0FBQ2hILFVBQU0sbUJBQW1CLFFBQVEsSUFBSSxnQkFBZ0I7QUFDckQsV0FBTyxZQUFZLGtCQUFrQixNQUFNLGNBQWMsS0FBSztBQUM5RCxRQUFJLGtCQUFrQixTQUFTLGNBQWMsT0FBTztBQUNuRCxhQUFPLEtBQUssMkNBQTJDO0FBQUEsSUFDeEQ7QUFDQSxVQUFNLG9CQUFvQixRQUFRLElBQUkscUJBQXFCO0FBQzNELFdBQU8sWUFBWSxtQkFBbUIsTUFBTSxjQUFjLEtBQUs7QUFDL0QsUUFBSSxtQkFBbUIsU0FBUyxjQUFjLE9BQU87QUFDcEQsYUFBTyxLQUFLLDJDQUEyQztBQUFBLElBQ3hEO0FBQ0EsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZO0FBQUEsUUFDWCxTQUFTLGlCQUFpQjtBQUFBLFFBQzFCLE1BQU0saUJBQWlCO0FBQUEsUUFDdkIsS0FBSyxpQkFBaUI7QUFBQSxRQUN0QixLQUFLLGlCQUFpQjtBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxhQUFhO0FBQUEsUUFDWixTQUFTLGtCQUFrQjtBQUFBLFFBQzNCLEtBQUssa0JBQWtCO0FBQUEsTUFDeEI7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLFlBQVk7QUFBQSxRQUNYLFNBQVMsR0FBRyxJQUFJLE1BQU07QUFBQSxRQUN0QixNQUFNLENBQUMsVUFBVSxHQUFHLElBQUksTUFBTSxPQUFPO0FBQUEsUUFDckMsS0FBSyxJQUFJO0FBQUEsUUFDVCxLQUFLO0FBQUEsVUFDSixZQUFZLEdBQUcsSUFBSSxNQUFNO0FBQUEsVUFDekIsYUFBYSxJQUFJO0FBQUEsVUFDakIsb0JBQW9CLElBQUk7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGFBQWE7QUFBQSxRQUNaLFNBQVM7QUFBQSxRQUNULEtBQUs7QUFBQSxNQUNOO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDLENBQUM7QUFDSCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
