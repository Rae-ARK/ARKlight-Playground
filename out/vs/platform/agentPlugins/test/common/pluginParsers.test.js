import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { FileSystemProviderCapabilities } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpServerType } from "../../../mcp/common/mcpPlatformTypes.js";
import { CustomizationType, McpServerStatus } from "../../../agentHost/common/state/protocol/state.js";
import { DEFAULT_MCP_APP } from "../../../agentHost/common/state/protocol/mcpAppDefaults.js";
import { customizationId } from "../../../agentHost/common/state/sessionState.js";
function stubMcpCustomization() {
  return { type: CustomizationType.McpServer, id: "stub", uri: "file:///plugin", name: "test", enabled: true, state: { kind: McpServerStatus.Starting } };
}
import {
  IParsedHookCommand,
  makeMcpServerCustomization,
  parseComponentPathConfig,
  parseHooksJson,
  resolveComponentDirs,
  normalizeMcpServerConfiguration,
  shellQuotePluginRootInCommand,
  interpolateMcpPluginRoot,
  convertBareEnvVarsToVsCodeSyntax,
  toParsedAgent,
  toParsedSkill,
  parsePlugin,
  PluginFormat
} from "../../common/pluginParsers.js";
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from "../../common/agentPluginParser.js";
suite("pluginParsers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseComponentPathConfig", () => {
    test("returns empty config for undefined", () => {
      const result = parseComponentPathConfig(void 0);
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
    test("returns empty config for null", () => {
      const result = parseComponentPathConfig(null);
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
    test("parses a string to single-element paths", () => {
      const result = parseComponentPathConfig("custom/skills");
      assert.deepStrictEqual(result, { paths: ["custom/skills"], exclusive: false });
    });
    test("trims whitespace from string", () => {
      const result = parseComponentPathConfig("  spaced  ");
      assert.deepStrictEqual(result, { paths: ["spaced"], exclusive: false });
    });
    test("returns empty for blank string", () => {
      const result = parseComponentPathConfig("   ");
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
    test("parses a string array", () => {
      const result = parseComponentPathConfig(["a", "b", "c"]);
      assert.deepStrictEqual(result, { paths: ["a", "b", "c"], exclusive: false });
    });
    test("filters non-string entries from arrays", () => {
      const result = parseComponentPathConfig(["valid", 42, null, "ok"]);
      assert.deepStrictEqual(result, { paths: ["valid", "ok"], exclusive: false });
    });
    test("parses object with paths and exclusive", () => {
      const result = parseComponentPathConfig({ paths: ["x", "y"], exclusive: true });
      assert.deepStrictEqual(result, { paths: ["x", "y"], exclusive: true });
    });
    test("object without exclusive defaults to false", () => {
      const result = parseComponentPathConfig({ paths: ["z"] });
      assert.deepStrictEqual(result, { paths: ["z"], exclusive: false });
    });
    test("returns empty for unrecognized types", () => {
      const result = parseComponentPathConfig(42);
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
  });
  suite("resolveComponentDirs", () => {
    const pluginUri = URI.file("/workspace/.plugin-root");
    test("includes default directory when not exclusive", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: [], exclusive: false });
      assert.strictEqual(dirs.length, 1);
      assert.ok(dirs[0].path.endsWith("/skills"));
    });
    test("excludes default directory when exclusive", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["custom"], exclusive: true });
      assert.ok(!dirs.some((d) => d.path.endsWith("/skills")));
      assert.ok(dirs.some((d) => d.path.endsWith("/custom")));
    });
    test("resolves relative paths from plugin root", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["other/skills"], exclusive: false });
      assert.strictEqual(dirs.length, 2);
      assert.ok(dirs[1].path.endsWith("/other/skills"));
    });
    test("rejects paths that escape plugin root", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["../../outside"], exclusive: false });
      assert.strictEqual(dirs.length, 1);
    });
    test("allows paths that escape plugin root but stay within boundaryUri", () => {
      const boundaryUri = URI.file("/workspace");
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["../shared-skills"], exclusive: false }, boundaryUri);
      assert.strictEqual(dirs.length, 2);
      assert.ok(dirs[1].path.endsWith("/shared-skills"));
    });
    test("rejects paths that escape boundaryUri", () => {
      const boundaryUri = URI.file("/workspace");
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["../../outside"], exclusive: false }, boundaryUri);
      assert.strictEqual(dirs.length, 1);
    });
    test("falls back to pluginUri when boundaryUri is not an ancestor of pluginUri", () => {
      const boundaryUri = URI.file("/unrelated/directory");
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["custom"], exclusive: false }, boundaryUri);
      assert.strictEqual(dirs.length, 2);
      assert.ok(dirs[1].path.endsWith("/custom"));
    });
  });
  suite("normalizeMcpServerConfiguration", () => {
    test("returns undefined for non-object input", () => {
      assert.strictEqual(normalizeMcpServerConfiguration(null), void 0);
      assert.strictEqual(normalizeMcpServerConfiguration("string"), void 0);
      assert.strictEqual(normalizeMcpServerConfiguration(42), void 0);
    });
    test("parses local server with command", () => {
      const result = normalizeMcpServerConfiguration({
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { KEY: "value" },
        cwd: "/workspace"
      });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.LOCAL);
      assert.strictEqual(result.command, "node");
    });
    test("infers local type from command without explicit type", () => {
      const result = normalizeMcpServerConfiguration({ command: "python" });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.LOCAL);
    });
    test("parses remote server with url", () => {
      const result = normalizeMcpServerConfiguration({
        type: "sse",
        url: "https://example.com",
        headers: { "X-Key": "val" }
      });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.REMOTE);
    });
    test("infers remote type from url without explicit type", () => {
      const result = normalizeMcpServerConfiguration({ url: "https://example.com" });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.REMOTE);
    });
    test("rejects ws type", () => {
      const result = normalizeMcpServerConfiguration({ type: "ws", url: "ws://localhost:3000" });
      assert.strictEqual(result, void 0);
    });
    test("rejects local type without command", () => {
      const result = normalizeMcpServerConfiguration({ type: "stdio" });
      assert.strictEqual(result, void 0);
    });
    test("filters non-string args", () => {
      const result = normalizeMcpServerConfiguration({
        command: "test",
        args: ["valid", 42, null, "also-valid"]
      });
      assert.ok(result);
      const args = result.args;
      assert.deepStrictEqual(args, ["valid", "also-valid"]);
    });
  });
  suite("shellQuotePluginRootInCommand", () => {
    test("replaces token with path when no special chars", () => {
      const result = shellQuotePluginRootInCommand(
        "cd ${PLUGIN_ROOT} && run",
        "/simple/path",
        "${PLUGIN_ROOT}"
      );
      assert.strictEqual(result, "cd /simple/path && run");
    });
    test("quotes path with spaces", () => {
      const result = shellQuotePluginRootInCommand(
        "cd ${PLUGIN_ROOT} && run",
        "/path with spaces",
        "${PLUGIN_ROOT}"
      );
      assert.ok(result.includes('"'), "should add quotes for path with spaces");
      assert.ok(result.includes("/path with spaces"));
    });
    test("returns unchanged when token not present", () => {
      const result = shellQuotePluginRootInCommand("echo hello", "/path", "${PLUGIN_ROOT}");
      assert.strictEqual(result, "echo hello");
    });
    test("handles already-quoted token", () => {
      const result = shellQuotePluginRootInCommand(
        '"${PLUGIN_ROOT}/script.sh"',
        "/path with spaces",
        "${PLUGIN_ROOT}"
      );
      assert.ok(!result.includes('""'), "should not double-quote");
    });
  });
  suite("interpolateMcpPluginRoot", () => {
    test("replaces tokens and sets env vars without pairing array entries", () => {
      const result = interpolateMcpPluginRoot({
        name: "test",
        uri: URI.file("/plugin/.mcp.json"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${PLUGIN_ROOT}/bin/server",
          args: ["--data", "${CLAUDE_PLUGIN_ROOT}/data"]
        },
        customization: stubMcpCustomization()
      }, "/plugin", ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"], ["PLUGIN_ROOT"]);
      assert.deepStrictEqual(result.configuration, {
        type: McpServerType.LOCAL,
        command: "/plugin/bin/server",
        args: ["--data", "/plugin/data"],
        env: { PLUGIN_ROOT: "/plugin" }
      });
    });
  });
  suite("convertBareEnvVarsToVsCodeSyntax", () => {
    test("converts bare env vars to VS Code syntax", () => {
      const def = {
        name: "test",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_TOOL}",
          args: ["--key=${API_KEY}"]
        },
        customization: stubMcpCustomization()
      };
      const result = convertBareEnvVarsToVsCodeSyntax(def);
      assert.strictEqual(result.configuration.command, "${env:MY_TOOL}");
      assert.deepStrictEqual(result.configuration.args, ["--key=${env:API_KEY}"]);
    });
    test("does not convert already-qualified vars", () => {
      const def = {
        name: "test",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${env:ALREADY_QUALIFIED}"
        },
        customization: stubMcpCustomization()
      };
      const result = convertBareEnvVarsToVsCodeSyntax(def);
      assert.strictEqual(result.configuration.command, "${env:ALREADY_QUALIFIED}");
    });
    test("ignores lowercase vars", () => {
      const def = {
        name: "test",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${lowercase}"
        },
        customization: stubMcpCustomization()
      };
      const result = convertBareEnvVarsToVsCodeSyntax(def);
      assert.strictEqual(result.configuration.command, "${lowercase}");
    });
  });
  suite("IParsedHookCommand.isEquals", () => {
    test("returns true for structurally equivalent commands", () => {
      const left = {
        command: "echo hi",
        windows: "Write-Host hi",
        linux: "echo hi",
        osx: "echo hi",
        cwd: URI.file("/workspace"),
        env: { A: "1" },
        timeout: 10,
        sourceUri: URI.file("/workspace/.github/hooks.yml")
      };
      const right = {
        command: "echo hi",
        windows: "Write-Host hi",
        linux: "echo hi",
        osx: "echo hi",
        cwd: URI.file("/workspace"),
        env: { A: "1" },
        timeout: 10,
        sourceUri: URI.file("/workspace/.github/hooks.yml")
      };
      assert.strictEqual(IParsedHookCommand.isEquals(left, right), true);
    });
    test("returns false when any field differs", () => {
      const left = {
        command: "echo hi",
        cwd: URI.file("/workspace"),
        env: { A: "1" },
        timeout: 10,
        sourceUri: URI.file("/workspace/.github/hooks.yml")
      };
      const right = {
        command: "echo bye",
        cwd: URI.file("/workspace/other"),
        env: { A: "2" },
        timeout: 20,
        sourceUri: URI.file("/workspace/.github/other-hooks.yml")
      };
      assert.strictEqual(IParsedHookCommand.isEquals(left, right), false);
    });
  });
  suite("toParsedAgent / toParsedSkill", () => {
    test("toParsedAgent pairs the resource with an AgentCustomization", () => {
      const uri = URI.file("/home/.claude/agents/explore.md");
      const parsed = toParsedAgent({ uri, name: "explore", description: "Explore the codebase" });
      assert.deepStrictEqual(parsed, {
        uri,
        name: "explore",
        description: "Explore the codebase",
        customization: {
          type: CustomizationType.Agent,
          id: customizationId(uri.toString()),
          uri: uri.toString(),
          name: "explore",
          description: "Explore the codebase"
        }
      });
    });
    test("toParsedSkill pairs the resource with a SkillCustomization and omits an absent description", () => {
      const uri = URI.file("/home/.claude/skills/mapper/SKILL.md");
      const parsed = toParsedSkill({ uri, name: "mapper" });
      assert.deepStrictEqual(parsed, {
        uri,
        name: "mapper",
        customization: {
          type: CustomizationType.Skill,
          id: customizationId(uri.toString()),
          uri: uri.toString(),
          name: "mapper"
        }
      });
    });
  });
  suite("makeMcpServerCustomization", () => {
    test("builds a Stopped server with DEFAULT_MCP_APP and a name-disambiguated id", () => {
      const uri = URI.file("/workspace/.mcp.json");
      const customization = makeMcpServerCustomization(uri, "fs server");
      assert.deepStrictEqual(customization, {
        type: CustomizationType.McpServer,
        id: `${customizationId(uri.toString())}#mcp=${encodeURIComponent("fs server")}`,
        uri: uri.toString(),
        name: "fs server",
        enabled: true,
        state: { kind: McpServerStatus.Stopped },
        mcpApp: DEFAULT_MCP_APP
      });
    });
    suite("Agent Plugin", () => {
      const store = new DisposableStore();
      let fileService;
      setup(() => {
        fileService = store.add(new FileService(new NullLogService()));
        store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
      });
      teardown(() => store.clear());
      async function write(path, contents) {
        await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path }), VSBuffer.fromString(contents));
      }
      async function parse(path = "/plugins/example") {
        const root = URI.from({ scheme: Schemas.inMemory, path });
        return parsePlugin(root, fileService, void 0, URI.from({ scheme: Schemas.inMemory, path: "/home" }), root);
      }
      test("recognizes the Agent Plugin schema and gives it precedence over legacy metadata", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({
          $schema: AGENT_PLUGIN_SCHEMA.replace("/1.0.0/", "/1.0.1/"),
          name: "agent-plugin",
          description: 42,
          unknown: true,
          extensions: "ignored"
        }));
        await write("/plugins/example/.plugin/plugin.json", JSON.stringify({ name: "legacy-plugin", commands: "./commands" }));
        await write("/plugins/example/commands/legacy.md", "# Legacy");
        await write("/plugins/example/skills/good/SKILL.md", "---\nname: good\ndescription: A valid skill\n---\nUse it.");
        await write("/plugins/example/SKILL.md", "---\nname: example\ndescription: Root fallback\n---");
        const plugin = await parse();
        assert.deepStrictEqual({
          format: plugin.format,
          skills: plugin.skills.map((skill) => skill.name),
          agents: plugin.agents.length,
          hooks: plugin.hooks.length,
          instructions: plugin.instructions.length
        }, {
          format: PluginFormat.AgentPlugin,
          skills: ["good"],
          agents: 0,
          hooks: 0,
          instructions: 0
        });
      });
      test("reads usable immediate-child skills permissively", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "example" }));
        await write("/plugins/example/skills/SKILL.md", "---\nname: ignored\ndescription: Not an immediate child\n---");
        await write("/plugins/example/skills/valid/SKILL.md", "---\nname: valid\ndescription: Valid skill\n---");
        await write("/plugins/example/skills/mismatch/SKILL.md", "---\nname: other\ndescription: Wrong directory\n---");
        await write("/plugins/example/skills/nested/deeper/SKILL.md", "---\nname: deeper\ndescription: Too deep\n---");
        assert.deepStrictEqual((await parse()).skills.map((skill) => skill.name), ["other", "valid"]);
      });
      test("reads known MCP fields and leaves harness placeholders unresolved", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "example" }));
        await write("/plugins/example/mcp.json", JSON.stringify({
          $schema: AGENT_PLUGIN_MCP_SCHEMA.replace("/1.0.0/", "/1.0.1/"),
          mcpServers: {
            stdio: {
              type: "stdio",
              command: "server",
              args: ["${PLUGIN_ROOT}", "${PLUGIN_DATA}", "${UNKNOWN}"],
              env: { ROOT: "${PLUGIN_ROOT}" },
              cwd: "./work"
            },
            http: { type: "streamable-http", url: "https://example.com/mcp" },
            sse: { type: "sse", url: "http://127.0.0.2:3000/sse" }
          }
        }));
        const servers = new Map((await parse()).mcpServers.map((server) => [server.name, server.configuration]));
        assert.deepStrictEqual([...servers.keys()], ["http", "sse", "stdio"]);
        assert.strictEqual(servers.get("http")?.type, McpServerType.REMOTE);
        assert.strictEqual(servers.get("sse")?.type, McpServerType.REMOTE);
        const stdio = servers.get("stdio");
        assert.ok(stdio?.type === McpServerType.LOCAL);
        assert.deepStrictEqual({
          command: stdio.command,
          args: stdio.args,
          env: stdio.env,
          cwd: stdio.cwd
        }, {
          command: "server",
          args: ["${PLUGIN_ROOT}", "${PLUGIN_DATA}", "${UNKNOWN}"],
          env: { ROOT: "${PLUGIN_ROOT}" },
          cwd: "./work"
        });
      });
      test("rejects filesystem-resolved skill escapes", async () => {
        class RealpathProvider extends InMemoryFileSystemProvider {
          get capabilities() {
            return super.capabilities | FileSystemProviderCapabilities.FileRealpath;
          }
          async realpath(resource) {
            return resource.path.endsWith("/skills/escape/SKILL.md") ? "/outside/SKILL.md" : resource.path;
          }
        }
        fileService = store.add(new FileService(new NullLogService()));
        store.add(fileService.registerProvider(Schemas.inMemory, store.add(new RealpathProvider())));
        await write("/plugins/example/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "example" }));
        await write("/plugins/example/skills/escape/SKILL.md", "---\nname: escape\ndescription: Escaped\n---");
        assert.deepStrictEqual((await parse()).skills, []);
      });
    });
    test("two servers declared in the same file get distinct ids", () => {
      const uri = URI.file("/workspace/.mcp.json");
      assert.notStrictEqual(makeMcpServerCustomization(uri, "a").id, makeMcpServerCustomization(uri, "b").id);
    });
  });
  suite("parseHooksJson", () => {
    const hookUri = URI.file("/workspace/.claude/settings.json");
    const parse = (json) => parseHooksJson(hookUri, json, void 0, URI.file("/home"));
    test("returns [] for a non-object, a missing hooks block, or disableAllHooks", () => {
      assert.deepStrictEqual(parse(void 0), []);
      assert.deepStrictEqual(parse({ model: "x" }), []);
      assert.deepStrictEqual(parse({ disableAllHooks: true, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo" }] }] } }), []);
    });
    test("canonicalizes event names (camelCase \u2192 PascalCase) and ignores unrecognized events", () => {
      const groups = parse({
        hooks: {
          postToolUse: [{ hooks: [{ type: "command", command: "echo a" }] }],
          bogusEvent: [{ hooks: [{ type: "command", command: "echo b" }] }]
        }
      });
      assert.deepStrictEqual(groups.map((g) => g.type), ["PostToolUse"]);
    });
    test("extracts commands from the nested matcher form and drops empty groups", () => {
      const groups = parse({
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo run" }] }],
          Stop: [{ matcher: "X", hooks: [{ type: "not-a-command" }] }]
        }
      });
      assert.deepStrictEqual(groups.map((g) => g.type), ["PreToolUse"]);
      assert.deepStrictEqual(groups[0].commands.map((c) => c.command), ["echo run"]);
    });
    test("extracts commands from the flat (non-nested) command form", () => {
      const groups = parse({
        hooks: { PostToolUse: [{ type: "command", command: "echo flat" }] }
      });
      assert.deepStrictEqual(groups.map((g) => g.type), ["PostToolUse"]);
      assert.deepStrictEqual(groups[0].commands.map((c) => c.command), ["echo flat"]);
    });
    test("all groups from one file share a single file-level customization", () => {
      const groups = parse({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "a" }] }],
          PostToolUse: [{ hooks: [{ type: "command", command: "b" }] }]
        }
      });
      assert.strictEqual(groups.length, 2);
      assert.strictEqual(groups[0].customization, groups[1].customization);
      assert.deepStrictEqual(groups[0].customization, {
        type: CustomizationType.Hook,
        id: customizationId(hookUri.toString()),
        uri: hookUri.toString(),
        name: "settings.json"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50UGx1Z2lucy90ZXN0L2NvbW1vbi9wbHVnaW5QYXJzZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTUNQX0FQUCB9IGZyb20gJy4uLy4uLy4uL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvbWNwQXBwRGVmYXVsdHMuanMnO1xuaW1wb3J0IHsgY3VzdG9taXphdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuXG5mdW5jdGlvbiBzdHViTWNwQ3VzdG9taXphdGlvbigpOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLCBpZDogJ3N0dWInLCB1cmk6ICdmaWxlOi8vL3BsdWdpbicsIG5hbWU6ICd0ZXN0JywgZW5hYmxlZDogdHJ1ZSwgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0gfTtcbn1cbmltcG9ydCB7XG5cdElQYXJzZWRIb29rQ29tbWFuZCxcblx0bWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24sXG5cdHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyxcblx0cGFyc2VIb29rc0pzb24sXG5cdHJlc29sdmVDb21wb25lbnREaXJzLFxuXHRub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uLFxuXHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCxcblx0aW50ZXJwb2xhdGVNY3BQbHVnaW5Sb290LFxuXHRjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCxcblx0dG9QYXJzZWRBZ2VudCxcblx0dG9QYXJzZWRTa2lsbCxcblx0cGFyc2VQbHVnaW4sXG5cdFBsdWdpbkZvcm1hdCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgQUdFTlRfUExVR0lOX01DUF9TQ0hFTUEsIEFHRU5UX1BMVUdJTl9TQ0hFTUEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5QYXJzZXIuanMnO1xuXG5zdWl0ZSgncGx1Z2luUGFyc2VycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncGFyc2VDb21wb25lbnRQYXRoQ29uZmlnJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBjb25maWcgZm9yIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyh1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFtdLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBjb25maWcgZm9yIG51bGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcobnVsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBwYXRoczogW10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgYSBzdHJpbmcgdG8gc2luZ2xlLWVsZW1lbnQgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoJ2N1c3RvbS9za2lsbHMnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHBhdGhzOiBbJ2N1c3RvbS9za2lsbHMnXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyaW1zIHdoaXRlc3BhY2UgZnJvbSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoJyAgc3BhY2VkICAnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHBhdGhzOiBbJ3NwYWNlZCddLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmb3IgYmxhbmsgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnKCcgICAnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHBhdGhzOiBbXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBhIHN0cmluZyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyhbJ2EnLCAnYicsICdjJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFsnYScsICdiJywgJ2MnXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgbm9uLXN0cmluZyBlbnRyaWVzIGZyb20gYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnKFsndmFsaWQnLCA0MiwgbnVsbCwgJ29rJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFsndmFsaWQnLCAnb2snXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBvYmplY3Qgd2l0aCBwYXRocyBhbmQgZXhjbHVzaXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnKHsgcGF0aHM6IFsneCcsICd5J10sIGV4Y2x1c2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHBhdGhzOiBbJ3gnLCAneSddLCBleGNsdXNpdmU6IHRydWUgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvYmplY3Qgd2l0aG91dCBleGNsdXNpdmUgZGVmYXVsdHMgdG8gZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoeyBwYXRoczogWyd6J10gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBwYXRoczogWyd6J10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZvciB1bnJlY29nbml6ZWQgdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoNDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFtdLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHJlc29sdmVDb21wb25lbnREaXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncmVzb2x2ZUNvbXBvbmVudERpcnMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8ucGx1Z2luLXJvb3QnKTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGRlZmF1bHQgZGlyZWN0b3J5IHdoZW4gbm90IGV4Y2x1c2l2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpcnMgPSByZXNvbHZlQ29tcG9uZW50RGlycyhwbHVnaW5VcmksICdza2lsbHMnLCB7IHBhdGhzOiBbXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soZGlyc1swXS5wYXRoLmVuZHNXaXRoKCcvc2tpbGxzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgZGVmYXVsdCBkaXJlY3Rvcnkgd2hlbiBleGNsdXNpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXJzID0gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCAnc2tpbGxzJywgeyBwYXRoczogWydjdXN0b20nXSwgZXhjbHVzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKCFkaXJzLnNvbWUoZCA9PiBkLnBhdGguZW5kc1dpdGgoJy9za2lsbHMnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRpcnMuc29tZShkID0+IGQucGF0aC5lbmRzV2l0aCgnL2N1c3RvbScpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyByZWxhdGl2ZSBwYXRocyBmcm9tIHBsdWdpbiByb290JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlycyA9IHJlc29sdmVDb21wb25lbnREaXJzKHBsdWdpblVyaSwgJ3NraWxscycsIHsgcGF0aHM6IFsnb3RoZXIvc2tpbGxzJ10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlycy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRpcnNbMV0ucGF0aC5lbmRzV2l0aCgnL290aGVyL3NraWxscycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgcGF0aHMgdGhhdCBlc2NhcGUgcGx1Z2luIHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXJzID0gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCAnc2tpbGxzJywgeyBwYXRoczogWycuLi8uLi9vdXRzaWRlJ10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0XHQvLyBTaG91bGQgb25seSBoYXZlIHRoZSBkZWZhdWx0IGRpciwgdGhlIHRyYXZlcnNhbCBwYXRoIGlzIHJlamVjdGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlycy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dzIHBhdGhzIHRoYXQgZXNjYXBlIHBsdWdpbiByb290IGJ1dCBzdGF5IHdpdGhpbiBib3VuZGFyeVVyaScsICgpID0+IHtcblx0XHRcdGNvbnN0IGJvdW5kYXJ5VXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IGRpcnMgPSByZXNvbHZlQ29tcG9uZW50RGlycyhwbHVnaW5VcmksICdza2lsbHMnLCB7IHBhdGhzOiBbJy4uL3NoYXJlZC1za2lsbHMnXSwgZXhjbHVzaXZlOiBmYWxzZSB9LCBib3VuZGFyeVVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlycy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRpcnNbMV0ucGF0aC5lbmRzV2l0aCgnL3NoYXJlZC1za2lsbHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHBhdGhzIHRoYXQgZXNjYXBlIGJvdW5kYXJ5VXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm91bmRhcnlVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3QgZGlycyA9IHJlc29sdmVDb21wb25lbnREaXJzKHBsdWdpblVyaSwgJ3NraWxscycsIHsgcGF0aHM6IFsnLi4vLi4vb3V0c2lkZSddLCBleGNsdXNpdmU6IGZhbHNlIH0sIGJvdW5kYXJ5VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHBsdWdpblVyaSB3aGVuIGJvdW5kYXJ5VXJpIGlzIG5vdCBhbiBhbmNlc3RvciBvZiBwbHVnaW5VcmknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBib3VuZGFyeVVyaSA9IFVSSS5maWxlKCcvdW5yZWxhdGVkL2RpcmVjdG9yeScpO1xuXHRcdFx0Y29uc3QgZGlycyA9IHJlc29sdmVDb21wb25lbnREaXJzKHBsdWdpblVyaSwgJ3NraWxscycsIHsgcGF0aHM6IFsnY3VzdG9tJ10sIGV4Y2x1c2l2ZTogZmFsc2UgfSwgYm91bmRhcnlVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhkaXJzWzFdLnBhdGguZW5kc1dpdGgoJy9jdXN0b20nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1vYmplY3QgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbihudWxsKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKCdzdHJpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKDQyKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBsb2NhbCBzZXJ2ZXIgd2l0aCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0YXJnczogWydzZXJ2ZXIuanMnXSxcblx0XHRcdFx0ZW52OiB7IEtFWTogJ3ZhbHVlJyB9LFxuXHRcdFx0XHRjd2Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0IS50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0IGFzIHsgY29tbWFuZDogc3RyaW5nIH0pLmNvbW1hbmQsICdub2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmZlcnMgbG9jYWwgdHlwZSBmcm9tIGNvbW1hbmQgd2l0aG91dCBleHBsaWNpdCB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbih7IGNvbW1hbmQ6ICdweXRob24nIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0IS50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyByZW1vdGUgc2VydmVyIHdpdGggdXJsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHRcdHR5cGU6ICdzc2UnLFxuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0aGVhZGVyczogeyAnWC1LZXknOiAndmFsJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQhLnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luZmVycyByZW1vdGUgdHlwZSBmcm9tIHVybCB3aXRob3V0IGV4cGxpY2l0IHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHsgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScgfSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQhLnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgd3MgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24oeyB0eXBlOiAnd3MnLCB1cmw6ICd3czovL2xvY2FsaG9zdDozMDAwJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGxvY2FsIHR5cGUgd2l0aG91dCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbih7IHR5cGU6ICdzdGRpbycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBub24tc3RyaW5nIGFyZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdFx0Y29tbWFuZDogJ3Rlc3QnLFxuXHRcdFx0XHRhcmdzOiBbJ3ZhbGlkJywgNDIsIG51bGwsICdhbHNvLXZhbGlkJ10sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0Y29uc3QgYXJncyA9IChyZXN1bHQgYXMgeyBhcmdzPzogc3RyaW5nW10gfSkuYXJncztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJncywgWyd2YWxpZCcsICdhbHNvLXZhbGlkJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3NoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgdG9rZW4gd2l0aCBwYXRoIHdoZW4gbm8gc3BlY2lhbCBjaGFycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKFxuXHRcdFx0XHQnY2QgJHtQTFVHSU5fUk9PVH0gJiYgcnVuJyxcblx0XHRcdFx0Jy9zaW1wbGUvcGF0aCcsXG5cdFx0XHRcdCcke1BMVUdJTl9ST09UfSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnY2QgL3NpbXBsZS9wYXRoICYmIHJ1bicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncXVvdGVzIHBhdGggd2l0aCBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZChcblx0XHRcdFx0J2NkICR7UExVR0lOX1JPT1R9ICYmIHJ1bicsXG5cdFx0XHRcdCcvcGF0aCB3aXRoIHNwYWNlcycsXG5cdFx0XHRcdCcke1BMVUdJTl9ST09UfSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdcIicpLCAnc2hvdWxkIGFkZCBxdW90ZXMgZm9yIHBhdGggd2l0aCBzcGFjZXMnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJy9wYXRoIHdpdGggc3BhY2VzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmNoYW5nZWQgd2hlbiB0b2tlbiBub3QgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCdlY2hvIGhlbGxvJywgJy9wYXRoJywgJyR7UExVR0lOX1JPT1R9Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnZWNobyBoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBhbHJlYWR5LXF1b3RlZCB0b2tlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKFxuXHRcdFx0XHQnXCIke1BMVUdJTl9ST09UfS9zY3JpcHQuc2hcIicsXG5cdFx0XHRcdCcvcGF0aCB3aXRoIHNwYWNlcycsXG5cdFx0XHRcdCcke1BMVUdJTl9ST09UfSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcygnXCJcIicpLCAnc2hvdWxkIG5vdCBkb3VibGUtcXVvdGUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludGVycG9sYXRlTWNwUGx1Z2luUm9vdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlcGxhY2VzIHRva2VucyBhbmQgc2V0cyBlbnYgdmFycyB3aXRob3V0IHBhaXJpbmcgYXJyYXkgZW50cmllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGludGVycG9sYXRlTWNwUGx1Z2luUm9vdCh7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbi8ubWNwLmpzb24nKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7UExVR0lOX1JPT1R9L2Jpbi9zZXJ2ZXInLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLS1kYXRhJywgJyR7Q0xBVURFX1BMVUdJTl9ST09UfS9kYXRhJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCksXG5cdFx0XHR9LCAnL3BsdWdpbicsIFsnJHtQTFVHSU5fUk9PVH0nLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9J10sIFsnUExVR0lOX1JPT1QnXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpZ3VyYXRpb24sIHtcblx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0Y29tbWFuZDogJy9wbHVnaW4vYmluL3NlcnZlcicsXG5cdFx0XHRcdGFyZ3M6IFsnLS1kYXRhJywgJy9wbHVnaW4vZGF0YSddLFxuXHRcdFx0XHRlbnY6IHsgUExVR0lOX1JPT1Q6ICcvcGx1Z2luJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXggLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGJhcmUgZW52IHZhcnMgdG8gVlMgQ29kZSBzeW50YXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWYgPSB7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbicpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCBhcyBjb25zdCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtNWV9UT09MfScsXG5cdFx0XHRcdFx0YXJnczogWyctLWtleT0ke0FQSV9LRVl9J10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoZGVmKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LmNvbmZpZ3VyYXRpb24gYXMgeyBjb21tYW5kOiBzdHJpbmcgfSkuY29tbWFuZCwgJyR7ZW52Ok1ZX1RPT0x9Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZXN1bHQuY29uZmlndXJhdGlvbiBhcyB1bmtub3duIGFzIHsgYXJnczogc3RyaW5nW10gfSkuYXJncywgWyctLWtleT0ke2VudjpBUElfS0VZfSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGNvbnZlcnQgYWxyZWFkeS1xdWFsaWZpZWQgdmFycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZiA9IHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luJyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke2VudjpBTFJFQURZX1FVQUxJRklFRH0nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiBzdHViTWNwQ3VzdG9taXphdGlvbigpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KGRlZik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdC5jb25maWd1cmF0aW9uIGFzIHsgY29tbWFuZDogc3RyaW5nIH0pLmNvbW1hbmQsICcke2VudjpBTFJFQURZX1FVQUxJRklFRH0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgbG93ZXJjYXNlIHZhcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWYgPSB7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbicpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCBhcyBjb25zdCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtsb3dlcmNhc2V9Jyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheChkZWYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQuY29uZmlndXJhdGlvbiBhcyB7IGNvbW1hbmQ6IHN0cmluZyB9KS5jb21tYW5kLCAnJHtsb3dlcmNhc2V9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdJUGFyc2VkSG9va0NvbW1hbmQuaXNFcXVhbHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHN0cnVjdHVyYWxseSBlcXVpdmFsZW50IGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdDogSVBhcnNlZEhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoaScsXG5cdFx0XHRcdHdpbmRvd3M6ICdXcml0ZS1Ib3N0IGhpJyxcblx0XHRcdFx0bGludXg6ICdlY2hvIGhpJyxcblx0XHRcdFx0b3N4OiAnZWNobyBoaScsXG5cdFx0XHRcdGN3ZDogVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSxcblx0XHRcdFx0ZW52OiB7IEE6ICcxJyB9LFxuXHRcdFx0XHR0aW1lb3V0OiAxMCxcblx0XHRcdFx0c291cmNlVXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzLnltbCcpXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmlnaHQ6IElQYXJzZWRIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGknLFxuXHRcdFx0XHR3aW5kb3dzOiAnV3JpdGUtSG9zdCBoaScsXG5cdFx0XHRcdGxpbnV4OiAnZWNobyBoaScsXG5cdFx0XHRcdG9zeDogJ2VjaG8gaGknLFxuXHRcdFx0XHRjd2Q6IFVSSS5maWxlKCcvd29ya3NwYWNlJyksXG5cdFx0XHRcdGVudjogeyBBOiAnMScgfSxcblx0XHRcdFx0dGltZW91dDogMTAsXG5cdFx0XHRcdHNvdXJjZVVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy55bWwnKVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElQYXJzZWRIb29rQ29tbWFuZC5pc0VxdWFscyhsZWZ0LCByaWdodCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGFueSBmaWVsZCBkaWZmZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdDogSVBhcnNlZEhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoaScsXG5cdFx0XHRcdGN3ZDogVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSxcblx0XHRcdFx0ZW52OiB7IEE6ICcxJyB9LFxuXHRcdFx0XHR0aW1lb3V0OiAxMCxcblx0XHRcdFx0c291cmNlVXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzLnltbCcpXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmlnaHQ6IElQYXJzZWRIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gYnllJyxcblx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9vdGhlcicpLFxuXHRcdFx0XHRlbnY6IHsgQTogJzInIH0sXG5cdFx0XHRcdHRpbWVvdXQ6IDIwLFxuXHRcdFx0XHRzb3VyY2VVcmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvb3RoZXItaG9va3MueW1sJylcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJUGFyc2VkSG9va0NvbW1hbmQuaXNFcXVhbHMobGVmdCwgcmlnaHQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b1BhcnNlZEFnZW50IC8gdG9QYXJzZWRTa2lsbCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3RvUGFyc2VkQWdlbnQgcGFpcnMgdGhlIHJlc291cmNlIHdpdGggYW4gQWdlbnRDdXN0b21pemF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ob21lLy5jbGF1ZGUvYWdlbnRzL2V4cGxvcmUubWQnKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHRvUGFyc2VkQWdlbnQoeyB1cmksIG5hbWU6ICdleHBsb3JlJywgZGVzY3JpcHRpb246ICdFeHBsb3JlIHRoZSBjb2RlYmFzZScgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdG5hbWU6ICdleHBsb3JlJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeHBsb3JlIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0XHR1cmk6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdleHBsb3JlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0V4cGxvcmUgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9QYXJzZWRTa2lsbCBwYWlycyB0aGUgcmVzb3VyY2Ugd2l0aCBhIFNraWxsQ3VzdG9taXphdGlvbiBhbmQgb21pdHMgYW4gYWJzZW50IGRlc2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ob21lLy5jbGF1ZGUvc2tpbGxzL21hcHBlci9TS0lMTC5tZCcpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gdG9QYXJzZWRTa2lsbCh7IHVyaSwgbmFtZTogJ21hcHBlcicgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdG5hbWU6ICdtYXBwZXInLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsXG5cdFx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnbWFwcGVyJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdidWlsZHMgYSBTdG9wcGVkIHNlcnZlciB3aXRoIERFRkFVTFRfTUNQX0FQUCBhbmQgYSBuYW1lLWRpc2FtYmlndWF0ZWQgaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8ubWNwLmpzb24nKTtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb24gPSBtYWtlTWNwU2VydmVyQ3VzdG9taXphdGlvbih1cmksICdmcyBzZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbiwge1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiBgJHtjdXN0b21pemF0aW9uSWQodXJpLnRvU3RyaW5nKCkpfSNtY3A9JHtlbmNvZGVVUklDb21wb25lbnQoJ2ZzIHNlcnZlcicpfWAsXG5cdFx0XHRcdHVyaTogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG5hbWU6ICdmcyBzZXJ2ZXInLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9LFxuXHRcdFx0XHRtY3BBcHA6IERFRkFVTFRfTUNQX0FQUCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ0FnZW50IFBsdWdpbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblxuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiB3cml0ZShwYXRoOiBzdHJpbmcsIGNvbnRlbnRzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoIH0pLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnRzKSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHBhcnNlKHBhdGggPSAnL3BsdWdpbnMvZXhhbXBsZScpIHtcblx0XHRcdFx0Y29uc3Qgcm9vdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoIH0pO1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VQbHVnaW4ocm9vdCwgZmlsZVNlcnZpY2UsIHVuZGVmaW5lZCwgVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvaG9tZScgfSksIHJvb3QpO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXN0KCdyZWNvZ25pemVzIHRoZSBBZ2VudCBQbHVnaW4gc2NoZW1hIGFuZCBnaXZlcyBpdCBwcmVjZWRlbmNlIG92ZXIgbGVnYWN5IG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHQkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLnJlcGxhY2UoJy8xLjAuMC8nLCAnLzEuMC4xLycpLFxuXHRcdFx0XHRcdG5hbWU6ICdhZ2VudC1wbHVnaW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiA0Mixcblx0XHRcdFx0XHR1bmtub3duOiB0cnVlLFxuXHRcdFx0XHRcdGV4dGVuc2lvbnM6ICdpZ25vcmVkJyxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnbGVnYWN5LXBsdWdpbicsIGNvbW1hbmRzOiAnLi9jb21tYW5kcycgfSkpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9jb21tYW5kcy9sZWdhY3kubWQnLCAnIyBMZWdhY3knKTtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvc2tpbGxzL2dvb2QvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogZ29vZFxcbmRlc2NyaXB0aW9uOiBBIHZhbGlkIHNraWxsXFxuLS0tXFxuVXNlIGl0LicpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBleGFtcGxlXFxuZGVzY3JpcHRpb246IFJvb3QgZmFsbGJhY2tcXG4tLS0nKTtcblxuXHRcdFx0XHRjb25zdCBwbHVnaW4gPSBhd2FpdCBwYXJzZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRmb3JtYXQ6IHBsdWdpbi5mb3JtYXQsXG5cdFx0XHRcdFx0c2tpbGxzOiBwbHVnaW4uc2tpbGxzLm1hcChza2lsbCA9PiBza2lsbC5uYW1lKSxcblx0XHRcdFx0XHRhZ2VudHM6IHBsdWdpbi5hZ2VudHMubGVuZ3RoLFxuXHRcdFx0XHRcdGhvb2tzOiBwbHVnaW4uaG9va3MubGVuZ3RoLFxuXHRcdFx0XHRcdGluc3RydWN0aW9uczogcGx1Z2luLmluc3RydWN0aW9ucy5sZW5ndGgsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpbixcblx0XHRcdFx0XHRza2lsbHM6IFsnZ29vZCddLFxuXHRcdFx0XHRcdGFnZW50czogMCxcblx0XHRcdFx0XHRob29rczogMCxcblx0XHRcdFx0XHRpbnN0cnVjdGlvbnM6IDAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JlYWRzIHVzYWJsZSBpbW1lZGlhdGUtY2hpbGQgc2tpbGxzIHBlcm1pc3NpdmVseScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7ICRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsIG5hbWU6ICdleGFtcGxlJyB9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBpZ25vcmVkXFxuZGVzY3JpcHRpb246IE5vdCBhbiBpbW1lZGlhdGUgY2hpbGRcXG4tLS0nKTtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvc2tpbGxzL3ZhbGlkL1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IHZhbGlkXFxuZGVzY3JpcHRpb246IFZhbGlkIHNraWxsXFxuLS0tJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy9taXNtYXRjaC9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBvdGhlclxcbmRlc2NyaXB0aW9uOiBXcm9uZyBkaXJlY3RvcnlcXG4tLS0nKTtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvc2tpbGxzL25lc3RlZC9kZWVwZXIvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogZGVlcGVyXFxuZGVzY3JpcHRpb246IFRvbyBkZWVwXFxuLS0tJyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgcGFyc2UoKSkuc2tpbGxzLm1hcChza2lsbCA9PiBza2lsbC5uYW1lKSwgWydvdGhlcicsICd2YWxpZCddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZWFkcyBrbm93biBNQ1AgZmllbGRzIGFuZCBsZWF2ZXMgaGFybmVzcyBwbGFjZWhvbGRlcnMgdW5yZXNvbHZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7ICRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsIG5hbWU6ICdleGFtcGxlJyB9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL21jcC5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdCRzY2hlbWE6IEFHRU5UX1BMVUdJTl9NQ1BfU0NIRU1BLnJlcGxhY2UoJy8xLjAuMC8nLCAnLzEuMC4xLycpLFxuXHRcdFx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0XHRcdHN0ZGlvOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdFx0XHRhcmdzOiBbJyR7UExVR0lOX1JPT1R9JywgJyR7UExVR0lOX0RBVEF9JywgJyR7VU5LTk9XTn0nXSxcblx0XHRcdFx0XHRcdFx0ZW52OiB7IFJPT1Q6ICcke1BMVUdJTl9ST09UfScgfSxcblx0XHRcdFx0XHRcdFx0Y3dkOiAnLi93b3JrJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRodHRwOiB7IHR5cGU6ICdzdHJlYW1hYmxlLWh0dHAnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL21jcCcgfSxcblx0XHRcdFx0XHRcdHNzZTogeyB0eXBlOiAnc3NlJywgdXJsOiAnaHR0cDovLzEyNy4wLjAuMjozMDAwL3NzZScgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Y29uc3Qgc2VydmVycyA9IG5ldyBNYXAoKGF3YWl0IHBhcnNlKCkpLm1jcFNlcnZlcnMubWFwKHNlcnZlciA9PiBbc2VydmVyLm5hbWUsIHNlcnZlci5jb25maWd1cmF0aW9uXSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zZXJ2ZXJzLmtleXMoKV0sIFsnaHR0cCcsICdzc2UnLCAnc3RkaW8nXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXJzLmdldCgnaHR0cCcpPy50eXBlLCBNY3BTZXJ2ZXJUeXBlLlJFTU9URSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXJzLmdldCgnc3NlJyk/LnR5cGUsIE1jcFNlcnZlclR5cGUuUkVNT1RFKTtcblx0XHRcdFx0Y29uc3Qgc3RkaW8gPSBzZXJ2ZXJzLmdldCgnc3RkaW8nKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHN0ZGlvPy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0Y29tbWFuZDogc3RkaW8uY29tbWFuZCxcblx0XHRcdFx0XHRhcmdzOiBzdGRpby5hcmdzLFxuXHRcdFx0XHRcdGVudjogc3RkaW8uZW52LFxuXHRcdFx0XHRcdGN3ZDogc3RkaW8uY3dkLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0YXJnczogWycke1BMVUdJTl9ST09UfScsICcke1BMVUdJTl9EQVRBfScsICcke1VOS05PV059J10sXG5cdFx0XHRcdFx0ZW52OiB7IFJPT1Q6ICcke1BMVUdJTl9ST09UfScgfSxcblx0XHRcdFx0XHRjd2Q6ICcuL3dvcmsnLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZWplY3RzIGZpbGVzeXN0ZW0tcmVzb2x2ZWQgc2tpbGwgZXNjYXBlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y2xhc3MgUmVhbHBhdGhQcm92aWRlciBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0XHRcdFx0XHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc3VwZXIuY2FwYWJpbGl0aWVzIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFscGF0aDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXN5bmMgcmVhbHBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL3NraWxscy9lc2NhcGUvU0tJTEwubWQnKSA/ICcvb3V0c2lkZS9TS0lMTC5tZCcgOiByZXNvdXJjZS5wYXRoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBzdG9yZS5hZGQobmV3IFJlYWxwYXRoUHJvdmlkZXIoKSkpKTtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7ICRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsIG5hbWU6ICdleGFtcGxlJyB9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy9lc2NhcGUvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogZXNjYXBlXFxuZGVzY3JpcHRpb246IEVzY2FwZWRcXG4tLS0nKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBwYXJzZSgpKS5za2lsbHMsIFtdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHdvIHNlcnZlcnMgZGVjbGFyZWQgaW4gdGhlIHNhbWUgZmlsZSBnZXQgZGlzdGluY3QgaWRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLm1jcC5qc29uJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwobWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24odXJpLCAnYScpLmlkLCBtYWtlTWNwU2VydmVyQ3VzdG9taXphdGlvbih1cmksICdiJykuaWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHBhcnNlSG9va3NKc29uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncGFyc2VIb29rc0pzb24nLCAoKSA9PiB7XG5cblx0XHRjb25zdCBob29rVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9zZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgcGFyc2UgPSAoanNvbjogdW5rbm93bikgPT4gcGFyc2VIb29rc0pzb24oaG9va1VyaSwganNvbiwgdW5kZWZpbmVkLCBVUkkuZmlsZSgnL2hvbWUnKSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFtdIGZvciBhIG5vbi1vYmplY3QsIGEgbWlzc2luZyBob29rcyBibG9jaywgb3IgZGlzYWJsZUFsbEhvb2tzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZSh1bmRlZmluZWQpLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlKHsgbW9kZWw6ICd4JyB9KSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZSh7IGRpc2FibGVBbGxIb29rczogdHJ1ZSwgaG9va3M6IHsgUG9zdFRvb2xVc2U6IFt7IGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvJyB9XSB9XSB9IH0pLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5vbmljYWxpemVzIGV2ZW50IG5hbWVzIChjYW1lbENhc2UgXHUyMTkyIFBhc2NhbENhc2UpIGFuZCBpZ25vcmVzIHVucmVjb2duaXplZCBldmVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cHMgPSBwYXJzZSh7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0cG9zdFRvb2xVc2U6IFt7IGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGEnIH1dIH1dLFxuXHRcdFx0XHRcdGJvZ3VzRXZlbnQ6IFt7IGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGInIH1dIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3Vwcy5tYXAoZyA9PiBnLnR5cGUpLCBbJ1Bvc3RUb29sVXNlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgY29tbWFuZHMgZnJvbSB0aGUgbmVzdGVkIG1hdGNoZXIgZm9ybSBhbmQgZHJvcHMgZW1wdHkgZ3JvdXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gcGFyc2Uoe1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFByZVRvb2xVc2U6IFt7IG1hdGNoZXI6ICdCYXNoJywgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gcnVuJyB9XSB9XSxcblx0XHRcdFx0XHRTdG9wOiBbeyBtYXRjaGVyOiAnWCcsIGhvb2tzOiBbeyB0eXBlOiAnbm90LWEtY29tbWFuZCcgfV0gfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcudHlwZSksIFsnUHJlVG9vbFVzZSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzWzBdLmNvbW1hbmRzLm1hcChjID0+IGMuY29tbWFuZCksIFsnZWNobyBydW4nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBjb21tYW5kcyBmcm9tIHRoZSBmbGF0IChub24tbmVzdGVkKSBjb21tYW5kIGZvcm0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cHMgPSBwYXJzZSh7XG5cdFx0XHRcdGhvb2tzOiB7IFBvc3RUb29sVXNlOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGZsYXQnIH1dIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcudHlwZSksIFsnUG9zdFRvb2xVc2UnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3Vwc1swXS5jb21tYW5kcy5tYXAoYyA9PiBjLmNvbW1hbmQpLCBbJ2VjaG8gZmxhdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbCBncm91cHMgZnJvbSBvbmUgZmlsZSBzaGFyZSBhIHNpbmdsZSBmaWxlLWxldmVsIGN1c3RvbWl6YXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cHMgPSBwYXJzZSh7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0UHJlVG9vbFVzZTogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2EnIH1dIH1dLFxuXHRcdFx0XHRcdFBvc3RUb29sVXNlOiBbeyBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnYicgfV0gfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cHNbMF0uY3VzdG9taXphdGlvbiwgZ3JvdXBzWzFdLmN1c3RvbWl6YXRpb24pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHNbMF0uY3VzdG9taXphdGlvbiwge1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ib29rLFxuXHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKGhvb2tVcmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdHVyaTogaG9va1VyaS50b1N0cmluZygpLFxuXHRcdFx0XHRuYW1lOiAnc2V0dGluZ3MuanNvbicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FB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
