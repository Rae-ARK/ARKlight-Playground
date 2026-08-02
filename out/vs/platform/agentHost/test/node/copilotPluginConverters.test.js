import assert from "assert";
import { writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpServerType } from "../../../mcp/common/mcpPlatformTypes.js";
import { toSdkInstructionDirectories, toSdkMcpServers, toSdkCustomAgents, toSdkSessionCustomAgents, toSdkSkillDirectories, parsedPluginsEqual, toSdkHooks } from "../../node/copilot/copilotPluginConverters.js";
import { PluginFormat } from "../../../agentPlugins/common/pluginParsers.js";
import { CustomizationType, McpServerStatus } from "../../common/state/protocol/state.js";
function stubMcpCustomization(name = "test") {
  return { type: CustomizationType.McpServer, id: `mcp:${name}`, uri: "file:///plugin", name, enabled: true, state: { kind: McpServerStatus.Starting } };
}
function stubHookCustomization(type) {
  return { type: CustomizationType.Hook, id: `hook:${type}`, uri: "file:///plugin/hooks.json", name: "hooks.json" };
}
function stubSkillCustomization(name) {
  return { type: CustomizationType.Skill, id: `skill:${name}`, uri: `file:///${name}/SKILL.md`, name };
}
suite("copilotPluginConverters", () => {
  const disposables = new DisposableStore();
  let fileService;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("toSdkMcpServers", () => {
    test("converts local server definitions", () => {
      const defs = [{
        name: "test-server",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "node",
          args: ["server.js", "--port", "3000"],
          env: { NODE_ENV: "production", PORT: 3e3 },
          cwd: "/workspace"
        },
        customization: stubMcpCustomization("test-server")
      }];
      const result = toSdkMcpServers(defs);
      assert.deepStrictEqual(result, {
        "test-server": {
          type: "local",
          command: "node",
          args: ["server.js", "--port", "3000"],
          tools: ["*"],
          env: { NODE_ENV: "production", PORT: "3000" },
          cwd: "/workspace"
        }
      });
    });
    test("converts remote/http server definitions", () => {
      const defs = [{
        name: "remote-server",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://example.com/mcp",
          headers: { "Authorization": "Bearer token" }
        },
        customization: stubMcpCustomization("remote-server")
      }];
      const result = toSdkMcpServers(defs);
      assert.deepStrictEqual(result, {
        "remote-server": {
          type: "http",
          url: "https://example.com/mcp",
          tools: ["*"],
          headers: { "Authorization": "Bearer token" }
        }
      });
    });
    test("handles empty definitions", () => {
      const result = toSdkMcpServers([]);
      assert.deepStrictEqual(result, {});
    });
    test("omits optional fields when undefined", () => {
      const defs = [{
        name: "minimal",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "echo"
        },
        customization: stubMcpCustomization("minimal")
      }];
      const result = toSdkMcpServers(defs);
      assert.strictEqual(result["minimal"].type, "local");
      assert.deepStrictEqual(result["minimal"].args, []);
      assert.strictEqual(Object.hasOwn(result["minimal"], "env"), false);
      assert.strictEqual(Object.hasOwn(result["minimal"], "cwd"), false);
    });
    test("filters null values from env", () => {
      const defs = [{
        name: "with-null-env",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "test",
          env: { KEEP: "value", DROP: null }
        },
        customization: stubMcpCustomization("with-null-env")
      }];
      const result = toSdkMcpServers(defs);
      const env = result["with-null-env"].env;
      assert.deepStrictEqual(env, { KEEP: "value" });
    });
  });
  suite("toSdkCustomAgents", () => {
    test("reads agent files without frontmatter and creates configs", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/helper.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("You are a helpful assistant"));
      const agents = [{ uri: agentUri, name: "helper" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "helper",
        tools: null,
        prompt: "You are a helpful assistant"
      }]);
    });
    test("skips agents whose files cannot be read", async () => {
      const agents = [
        { uri: URI.from({ scheme: Schemas.inMemory, path: "/nonexistent/agent.md" }), name: "missing" }
      ];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, []);
    });
    test("processes multiple agents, skipping failures", async () => {
      const goodUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/good.md" });
      await fileService.writeFile(goodUri, VSBuffer.fromString("Good agent"));
      const agents = [
        { uri: goodUri, name: "good" },
        { uri: URI.from({ scheme: Schemas.inMemory, path: "/agents/bad.md" }), name: "bad" }
      ];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "good");
    });
    test("parses YAML frontmatter for name, description, tools, and body", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/review.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: code-reviewer",
        "description: Reviews code for quality issues",
        "tools:",
        "  - read_file",
        "  - grep_search",
        "---",
        "You are a meticulous code reviewer.",
        ""
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "review" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "code-reviewer",
        description: "Reviews code for quality issues",
        tools: ["read_file", "grep_search"],
        prompt: "You are a meticulous code reviewer.\n"
      }]);
    });
    test("parses skills and infer from frontmatter", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/skilled.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: skilled",
        "skills:",
        "  - baking-cake",
        "  - cooking-pasta",
        "infer: true",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "skilled" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "skilled",
        tools: null,
        skills: ["baking-cake", "cooking-pasta"],
        infer: true,
        prompt: "Body."
      }]);
    });
    test("infer defaults to false when disable-model-invocation is set", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/no-invoke.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: no-invoke",
        "disable-model-invocation: true",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "no-invoke" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "no-invoke",
        tools: null,
        infer: false,
        prompt: "Body."
      }]);
    });
    test("omits skills and infer when frontmatter does not specify them", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/plain.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: plain",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "plain" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.strictEqual(Object.hasOwn(result[0], "skills"), false);
      assert.strictEqual(Object.hasOwn(result[0], "infer"), false);
    });
    test("empty tools array becomes null (all tools)", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/empty-tools.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: free-for-all",
        "tools: []",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "fallback" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "free-for-all",
        tools: null,
        prompt: "Body."
      }]);
    });
    test("falls back to resource name when frontmatter omits name", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/no-name.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "description: Helper without an explicit name",
        "---",
        "Body only."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "resource-name" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "resource-name",
        description: "Helper without an explicit name",
        tools: null,
        prompt: "Body only."
      }]);
    });
    test("trims whitespace from frontmatter name to match parsed agent name", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/padded.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        'name: "  Inbox  "',
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "padded" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.strictEqual(result[0].name, "Inbox");
    });
  });
  suite("toSdkSessionCustomAgents", () => {
    test("includes agents from plugins without a file directory", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/loose/helper.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Loose agent"));
      const plugins = [{ agents: [{ uri: agentUri, name: "helper" }] }];
      const result = await toSdkSessionCustomAgents(plugins, void 0, fileService);
      assert.deepStrictEqual(result, [{ name: "helper", tools: null, prompt: "Loose agent" }]);
    });
    test("excludes file-dir plugin agents when none is selected", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/inbox.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Inbox agent"));
      const plugins = [{
        pluginDir: URI.file("/plugins/inbox"),
        agents: [{ uri: agentUri, name: "Inbox" }]
      }];
      const result = await toSdkSessionCustomAgents(plugins, void 0, fileService);
      assert.deepStrictEqual(result, []);
    });
    test("forces the selected file-dir plugin agent into customAgents", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/inbox.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Inbox agent"));
      const plugins = [{
        pluginDir: URI.file("/plugins/inbox"),
        agents: [{ uri: agentUri, name: "Inbox" }]
      }];
      const result = await toSdkSessionCustomAgents(plugins, "Inbox", fileService);
      assert.deepStrictEqual(result, [{ name: "Inbox", tools: null, prompt: "Inbox agent" }]);
    });
    test("does not duplicate the selected agent when already present", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/loose/helper.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Loose agent"));
      const plugins = [{ agents: [{ uri: agentUri, name: "helper" }] }];
      const result = await toSdkSessionCustomAgents(plugins, "helper", fileService);
      assert.deepStrictEqual(result, [{ name: "helper", tools: null, prompt: "Loose agent" }]);
    });
  });
  suite("toSdkSkillDirectories", () => {
    test("extracts parent directories of skill URIs", () => {
      const skills = [
        { uri: URI.file("/plugins/skill-a/SKILL.md"), name: "skill-a" },
        { uri: URI.file("/plugins/skill-b/SKILL.md"), name: "skill-b" }
      ];
      const result = toSdkSkillDirectories(skills);
      assert.strictEqual(result.length, 2);
    });
    test("deduplicates directories", () => {
      const skills = [
        { uri: URI.file("/plugins/shared/SKILL.md"), name: "skill-a" },
        { uri: URI.file("/plugins/shared/SKILL.md"), name: "skill-b" }
      ];
      const result = toSdkSkillDirectories(skills);
      assert.strictEqual(result.length, 1);
    });
    test("handles empty input", () => {
      const result = toSdkSkillDirectories([]);
      assert.deepStrictEqual(result, []);
    });
  });
  suite("toSdkInstructionDirectories", () => {
    test("extracts parent directories of instruction files", () => {
      const instructions = [
        { uri: URI.file("/plugins/rules/project.mdc"), name: "project" },
        { uri: URI.file("/plugins/rules/review.instructions.md"), name: "review" }
      ];
      const result = toSdkInstructionDirectories(instructions);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].replaceAll("\\", "/"), "/plugins/rules");
    });
    test("deduplicates directories", () => {
      const instructions = [
        { uri: URI.file("/plugins/rules/a.mdc"), name: "a" },
        { uri: URI.file("/plugins/rules/b.mdc"), name: "b" }
      ];
      const result = toSdkInstructionDirectories(instructions);
      assert.strictEqual(result.length, 1);
    });
    test("handles empty input", () => {
      const result = toSdkInstructionDirectories([]);
      assert.deepStrictEqual(result, []);
    });
  });
  suite("toSdkHooks", () => {
    function makeHookGroup(type, command) {
      return {
        type,
        commands: [{ command }],
        uri: URI.file("/plugin/hooks.json"),
        originalId: type,
        customization: stubHookCustomization(type)
      };
    }
    function echoJsonCmd(value) {
      const json = JSON.stringify(value);
      const dir = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
      const filePath = `${dir}/vscode-test-hook-${Date.now()}.js`;
      writeFileSync(filePath, `process.stdout.write(${JSON.stringify(json)});
`);
      const command = `node ${filePath}`;
      return { command, cleanup: () => {
        try {
          unlinkSync(filePath);
        } catch {
        }
      } };
    }
    test("onPostToolUse returns parsed JSON output as hook result", async () => {
      const expectedOutput = { additionalContext: "Before presenting the plan, run review-plan skill" };
      const { command, cleanup } = echoJsonCmd(expectedOutput);
      try {
        const hookGroup = makeHookGroup("PostToolUse", command);
        const hooks = toSdkHooks([hookGroup]);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const result = await hooks.onPostToolUse({ toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" }, { sessionId: "test" });
        assert.deepStrictEqual(result, expectedOutput);
      } finally {
        cleanup();
      }
    });
    test("onPostToolUse returns undefined when output is non-JSON", async () => {
      const dir = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
      const filePath = `${dir}/vscode-test-hook-nonjson-${Date.now()}.js`;
      writeFileSync(filePath, `process.stdout.write('not-json');
`);
      try {
        const hookGroup = makeHookGroup("PostToolUse", `node ${filePath}`);
        const hooks = toSdkHooks([hookGroup]);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const result = await hooks.onPostToolUse({ toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" }, { sessionId: "test" });
        assert.strictEqual(result, void 0);
      } finally {
        try {
          unlinkSync(filePath);
        } catch {
        }
      }
    });
    test("onPostToolUse returns undefined when command fails", async () => {
      const dir = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
      const filePath = `${dir}/vscode-test-hook-fail-${Date.now()}.js`;
      writeFileSync(filePath, `process.exit(1);
`);
      try {
        const hookGroup = makeHookGroup("PostToolUse", `node ${filePath}`);
        const hooks = toSdkHooks([hookGroup]);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const result = await hooks.onPostToolUse({ toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" }, { sessionId: "test" });
        assert.strictEqual(result, void 0);
      } finally {
        try {
          unlinkSync(filePath);
        } catch {
        }
      }
    });
    test("onPostToolUse returns undefined when no commands", async () => {
      const hooks = toSdkHooks([]);
      assert.strictEqual(hooks.onPostToolUse, void 0);
    });
    test("onPostToolUse calls editTrackingHooks and returns command output", async () => {
      const expectedOutput = { additionalContext: "context from hook" };
      const { command, cleanup } = echoJsonCmd(expectedOutput);
      try {
        const hookGroup = makeHookGroup("PostToolUse", command);
        let trackingInput;
        const editTrackingHooks = {
          onPreToolUse: async () => {
          },
          onPostToolUse: async (input) => {
            trackingInput = input;
          }
        };
        const hooks = toSdkHooks([hookGroup], editTrackingHooks);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const callInput = { toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" };
        const result = await hooks.onPostToolUse(callInput, { sessionId: "test" });
        assert.deepStrictEqual(result, expectedOutput);
        assert.deepStrictEqual(trackingInput, callInput);
      } finally {
        cleanup();
      }
    });
  });
  suite("parsedPluginsEqual", () => {
    function makePlugin(overrides) {
      return {
        format: PluginFormat.Copilot,
        hooks: [],
        mcpServers: [],
        skills: [],
        agents: [],
        instructions: [],
        ...overrides
      };
    }
    test("returns true for identical empty plugins", () => {
      assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin()]), true);
    });
    test("returns true for same content", () => {
      const a = makePlugin({
        skills: [{ uri: URI.file("/a/SKILL.md"), name: "a", customization: stubSkillCustomization("a") }],
        mcpServers: [{
          name: "server",
          uri: URI.file("/mcp"),
          configuration: { type: McpServerType.LOCAL, command: "node" },
          customization: stubMcpCustomization("server")
        }]
      });
      const b = makePlugin({
        skills: [{ uri: URI.file("/a/SKILL.md"), name: "a", customization: stubSkillCustomization("a") }],
        mcpServers: [{
          name: "server",
          uri: URI.file("/mcp"),
          configuration: { type: McpServerType.LOCAL, command: "node" },
          customization: stubMcpCustomization("server")
        }]
      });
      assert.strictEqual(parsedPluginsEqual([a], [b]), true);
    });
    test("returns false for different content", () => {
      const a = makePlugin({ skills: [{ uri: URI.file("/a/SKILL.md"), name: "a", customization: stubSkillCustomization("a") }] });
      const b = makePlugin({ skills: [{ uri: URI.file("/b/SKILL.md"), name: "b", customization: stubSkillCustomization("b") }] });
      assert.strictEqual(parsedPluginsEqual([a], [b]), false);
    });
    test("returns false for different plugin formats", () => {
      assert.strictEqual(parsedPluginsEqual(
        [makePlugin({ format: PluginFormat.AgentPlugin })],
        [makePlugin({ format: PluginFormat.OpenPlugin })]
      ), false);
    });
    test("returns false for different lengths", () => {
      assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin(), makePlugin()]), false);
    });
    test("returns true for empty arrays", () => {
      assert.strictEqual(parsedPluginsEqual([], []), true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFBsdWdpbkNvbnZlcnRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHdyaXRlRmlsZVN5bmMsIHVubGlua1N5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclR5cGUgfSBmcm9tICcuLi8uLi8uLi9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgdG9TZGtJbnN0cnVjdGlvbkRpcmVjdG9yaWVzLCB0b1Nka01jcFNlcnZlcnMsIHRvU2RrQ3VzdG9tQWdlbnRzLCB0b1Nka1Nlc3Npb25DdXN0b21BZ2VudHMsIHRvU2RrU2tpbGxEaXJlY3RvcmllcywgcGFyc2VkUGx1Z2luc0VxdWFsLCB0b1Nka0hvb2tzLCB0eXBlIElQbHVnaW5BZ2VudHNGb3JTZGsgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdFBsdWdpbkNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgUGx1Z2luRm9ybWF0LCB0eXBlIElNY3BTZXJ2ZXJEZWZpbml0aW9uLCB0eXBlIElOYW1lZFBsdWdpblJlc291cmNlLCB0eXBlIElQYXJzZWRIb29rR3JvdXAsIHR5cGUgSVBhcnNlZFBsdWdpbiwgdHlwZSBJUGFyc2VkU2tpbGwgfSBmcm9tICcuLi8uLi8uLi9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cywgdHlwZSBIb29rQ3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIFNraWxsQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5cbmZ1bmN0aW9uIHN0dWJNY3BDdXN0b21pemF0aW9uKG5hbWUgPSAndGVzdCcpOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLCBpZDogYG1jcDoke25hbWV9YCwgdXJpOiAnZmlsZTovLy9wbHVnaW4nLCBuYW1lLCBlbmFibGVkOiB0cnVlLCBzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmcgfSB9O1xufVxuZnVuY3Rpb24gc3R1Ykhvb2tDdXN0b21pemF0aW9uKHR5cGU6IHN0cmluZyk6IEhvb2tDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuSG9vaywgaWQ6IGBob29rOiR7dHlwZX1gLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi9ob29rcy5qc29uJywgbmFtZTogJ2hvb2tzLmpzb24nIH07XG59XG5mdW5jdGlvbiBzdHViU2tpbGxDdXN0b21pemF0aW9uKG5hbWU6IHN0cmluZyk6IFNraWxsQ3VzdG9taXphdGlvbiB7XG5cdHJldHVybiB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCBpZDogYHNraWxsOiR7bmFtZX1gLCB1cmk6IGBmaWxlOi8vLyR7bmFtZX0vU0tJTEwubWRgLCBuYW1lIH07XG59XG5cbnN1aXRlKCdjb3BpbG90UGx1Z2luQ29udmVydGVycycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSB0b1Nka01jcFNlcnZlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3RvU2RrTWNwU2VydmVycycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGxvY2FsIHNlcnZlciBkZWZpbml0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZnM6IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10gPSBbe1xuXHRcdFx0XHRuYW1lOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luJyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRhcmdzOiBbJ3NlcnZlci5qcycsICctLXBvcnQnLCAnMzAwMCddLFxuXHRcdFx0XHRcdGVudjogeyBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nLCBQT1JUOiAzMDAwIGFzIHVua25vd24gYXMgc3RyaW5nIH0sXG5cdFx0XHRcdFx0Y3dkOiAnL3dvcmtzcGFjZScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCd0ZXN0LXNlcnZlcicpLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrTWNwU2VydmVycyhkZWZzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdCd0ZXN0LXNlcnZlcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnbG9jYWwnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRhcmdzOiBbJ3NlcnZlci5qcycsICctLXBvcnQnLCAnMzAwMCddLFxuXHRcdFx0XHRcdHRvb2xzOiBbJyonXSxcblx0XHRcdFx0XHRlbnY6IHsgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJywgUE9SVDogJzMwMDAnIH0sXG5cdFx0XHRcdFx0Y3dkOiAnL3dvcmtzcGFjZScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIHJlbW90ZS9odHRwIHNlcnZlciBkZWZpbml0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZnM6IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10gPSBbe1xuXHRcdFx0XHRuYW1lOiAncmVtb3RlLXNlcnZlcicsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW4nKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuUkVNT1RFLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vbWNwJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogJ0JlYXJlciB0b2tlbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oJ3JlbW90ZS1zZXJ2ZXInKSxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka01jcFNlcnZlcnMoZGVmcyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHQncmVtb3RlLXNlcnZlcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnaHR0cCcsXG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9tY3AnLFxuXHRcdFx0XHRcdHRvb2xzOiBbJyonXSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogJ0JlYXJlciB0b2tlbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IGRlZmluaXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9TZGtNY3BTZXJ2ZXJzKFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBvcHRpb25hbCBmaWVsZHMgd2hlbiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZzOiBJTWNwU2VydmVyRGVmaW5pdGlvbltdID0gW3tcblx0XHRcdFx0bmFtZTogJ21pbmltYWwnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luJyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oJ21pbmltYWwnKSxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka01jcFNlcnZlcnMoZGVmcyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WydtaW5pbWFsJ10udHlwZSwgJ2xvY2FsJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZXN1bHRbJ21pbmltYWwnXSBhcyB7IGFyZ3M/OiBzdHJpbmdbXSB9KS5hcmdzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0Lmhhc093bihyZXN1bHRbJ21pbmltYWwnXSwgJ2VudicpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0Lmhhc093bihyZXN1bHRbJ21pbmltYWwnXSwgJ2N3ZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIG51bGwgdmFsdWVzIGZyb20gZW52JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmczogSU1jcFNlcnZlckRlZmluaXRpb25bXSA9IFt7XG5cdFx0XHRcdG5hbWU6ICd3aXRoLW51bGwtZW52Jyxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbicpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAndGVzdCcsXG5cdFx0XHRcdFx0ZW52OiB7IEtFRVA6ICd2YWx1ZScsIERST1A6IG51bGwgYXMgdW5rbm93biBhcyBzdHJpbmcgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oJ3dpdGgtbnVsbC1lbnYnKSxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka01jcFNlcnZlcnMoZGVmcyk7XG5cdFx0XHRjb25zdCBlbnYgPSAocmVzdWx0Wyd3aXRoLW51bGwtZW52J10gYXMgeyBlbnY/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0pLmVudjtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW52LCB7IEtFRVA6ICd2YWx1ZScgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gdG9TZGtDdXN0b21BZ2VudHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd0b1Nka0N1c3RvbUFnZW50cycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlYWRzIGFnZW50IGZpbGVzIHdpdGhvdXQgZnJvbnRtYXR0ZXIgYW5kIGNyZWF0ZXMgY29uZmlncycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL2hlbHBlci5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1lvdSBhcmUgYSBoZWxwZnVsIGFzc2lzdGFudCcpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ2hlbHBlcicgfV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhhZ2VudHMsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRcdG5hbWU6ICdoZWxwZXInLFxuXHRcdFx0XHR0b29sczogbnVsbCxcblx0XHRcdFx0cHJvbXB0OiAnWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50Jyxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGFnZW50cyB3aG9zZSBmaWxlcyBjYW5ub3QgYmUgcmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50czogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL25vbmV4aXN0ZW50L2FnZW50Lm1kJyB9KSwgbmFtZTogJ21pc3NpbmcnIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvY2Vzc2VzIG11bHRpcGxlIGFnZW50cywgc2tpcHBpbmcgZmFpbHVyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnb29kVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL2dvb2QubWQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGdvb2RVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0dvb2QgYWdlbnQnKSk7XG5cblx0XHRcdGNvbnN0IGFnZW50czogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtcblx0XHRcdFx0eyB1cmk6IGdvb2RVcmksIG5hbWU6ICdnb29kJyB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL2JhZC5tZCcgfSksIG5hbWU6ICdiYWQnIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdnb29kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgWUFNTCBmcm9udG1hdHRlciBmb3IgbmFtZSwgZGVzY3JpcHRpb24sIHRvb2xzLCBhbmQgYm9keScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL3Jldmlldy5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IGNvZGUtcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3IgcXVhbGl0eSBpc3N1ZXMnLFxuXHRcdFx0XHQndG9vbHM6Jyxcblx0XHRcdFx0JyAgLSByZWFkX2ZpbGUnLFxuXHRcdFx0XHQnICAtIGdyZXBfc2VhcmNoJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdZb3UgYXJlIGEgbWV0aWN1bG91cyBjb2RlIHJldmlld2VyLicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAncmV2aWV3JyB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50cywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdFx0bmFtZTogJ2NvZGUtcmV2aWV3ZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Jldmlld3MgY29kZSBmb3IgcXVhbGl0eSBpc3N1ZXMnLFxuXHRcdFx0XHR0b29sczogWydyZWFkX2ZpbGUnLCAnZ3JlcF9zZWFyY2gnXSxcblx0XHRcdFx0cHJvbXB0OiAnWW91IGFyZSBhIG1ldGljdWxvdXMgY29kZSByZXZpZXdlci5cXG4nLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIHNraWxscyBhbmQgaW5mZXIgZnJvbSBmcm9udG1hdHRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL3NraWxsZWQubWQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBza2lsbGVkJyxcblx0XHRcdFx0J3NraWxsczonLFxuXHRcdFx0XHQnICAtIGJha2luZy1jYWtlJyxcblx0XHRcdFx0JyAgLSBjb29raW5nLXBhc3RhJyxcblx0XHRcdFx0J2luZmVyOiB0cnVlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5LicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRcdGNvbnN0IGFnZW50czogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdza2lsbGVkJyB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50cywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdFx0bmFtZTogJ3NraWxsZWQnLFxuXHRcdFx0XHR0b29sczogbnVsbCxcblx0XHRcdFx0c2tpbGxzOiBbJ2Jha2luZy1jYWtlJywgJ2Nvb2tpbmctcGFzdGEnXSxcblx0XHRcdFx0aW5mZXI6IHRydWUsXG5cdFx0XHRcdHByb21wdDogJ0JvZHkuJyxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luZmVyIGRlZmF1bHRzIHRvIGZhbHNlIHdoZW4gZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uIGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL25vLWludm9rZS5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG5vLWludm9rZScsXG5cdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkuJyxcblx0XHRcdF0uam9pbignXFxuJykpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ25vLWludm9rZScgfV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhhZ2VudHMsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRcdG5hbWU6ICduby1pbnZva2UnLFxuXHRcdFx0XHR0b29sczogbnVsbCxcblx0XHRcdFx0aW5mZXI6IGZhbHNlLFxuXHRcdFx0XHRwcm9tcHQ6ICdCb2R5LicsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBza2lsbHMgYW5kIGluZmVyIHdoZW4gZnJvbnRtYXR0ZXIgZG9lcyBub3Qgc3BlY2lmeSB0aGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvcGxhaW4ubWQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBwbGFpbicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAncGxhaW4nIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuaGFzT3duKHJlc3VsdFswXSwgJ3NraWxscycpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0Lmhhc093bihyZXN1bHRbMF0sICdpbmZlcicpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSB0b29scyBhcnJheSBiZWNvbWVzIG51bGwgKGFsbCB0b29scyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2FnZW50cy9lbXB0eS10b29scy5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IGZyZWUtZm9yLWFsbCcsXG5cdFx0XHRcdCd0b29sczogW10nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkuJyxcblx0XHRcdF0uam9pbignXFxuJykpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ2ZhbGxiYWNrJyB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50cywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdFx0bmFtZTogJ2ZyZWUtZm9yLWFsbCcsXG5cdFx0XHRcdHRvb2xzOiBudWxsLFxuXHRcdFx0XHRwcm9tcHQ6ICdCb2R5LicsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHJlc291cmNlIG5hbWUgd2hlbiBmcm9udG1hdHRlciBvbWl0cyBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvbm8tbmFtZS5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBIZWxwZXIgd2l0aG91dCBhbiBleHBsaWNpdCBuYW1lJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5IG9ubHkuJyxcblx0XHRcdF0uam9pbignXFxuJykpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ3Jlc291cmNlLW5hbWUnIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0XHRuYW1lOiAncmVzb3VyY2UtbmFtZScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnSGVscGVyIHdpdGhvdXQgYW4gZXhwbGljaXQgbmFtZScsXG5cdFx0XHRcdHRvb2xzOiBudWxsLFxuXHRcdFx0XHRwcm9tcHQ6ICdCb2R5IG9ubHkuJyxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyaW1zIHdoaXRlc3BhY2UgZnJvbSBmcm9udG1hdHRlciBuYW1lIHRvIG1hdGNoIHBhcnNlZCBhZ2VudCBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvcGFkZGVkLm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCIgIEluYm94ICBcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAncGFkZGVkJyB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50cywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLm5hbWUsICdJbmJveCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgYWdlbnRzIGZyb20gcGx1Z2lucyB3aXRob3V0IGEgZmlsZSBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2xvb3NlL2hlbHBlci5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xvb3NlIGFnZW50JykpO1xuXG5cdFx0XHRjb25zdCBwbHVnaW5zOiBJUGx1Z2luQWdlbnRzRm9yU2RrW10gPSBbeyBhZ2VudHM6IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdoZWxwZXInIH1dIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzKHBsdWdpbnMsIHVuZGVmaW5lZCwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3sgbmFtZTogJ2hlbHBlcicsIHRvb2xzOiBudWxsLCBwcm9tcHQ6ICdMb29zZSBhZ2VudCcgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgZmlsZS1kaXIgcGx1Z2luIGFnZW50cyB3aGVuIG5vbmUgaXMgc2VsZWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3BsdWdpbi9pbmJveC5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0luYm94IGFnZW50JykpO1xuXG5cdFx0XHRjb25zdCBwbHVnaW5zOiBJUGx1Z2luQWdlbnRzRm9yU2RrW10gPSBbe1xuXHRcdFx0XHRwbHVnaW5EaXI6IFVSSS5maWxlKCcvcGx1Z2lucy9pbmJveCcpLFxuXHRcdFx0XHRhZ2VudHM6IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdJbmJveCcgfV0sXG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cyhwbHVnaW5zLCB1bmRlZmluZWQsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcmNlcyB0aGUgc2VsZWN0ZWQgZmlsZS1kaXIgcGx1Z2luIGFnZW50IGludG8gY3VzdG9tQWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9wbHVnaW4vaW5ib3gubWQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdJbmJveCBhZ2VudCcpKTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luczogSVBsdWdpbkFnZW50c0ZvclNka1tdID0gW3tcblx0XHRcdFx0cGx1Z2luRGlyOiBVUkkuZmlsZSgnL3BsdWdpbnMvaW5ib3gnKSxcblx0XHRcdFx0YWdlbnRzOiBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnSW5ib3gnIH1dLFxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka1Nlc3Npb25DdXN0b21BZ2VudHMocGx1Z2lucywgJ0luYm94JywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3sgbmFtZTogJ0luYm94JywgdG9vbHM6IG51bGwsIHByb21wdDogJ0luYm94IGFnZW50JyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkdXBsaWNhdGUgdGhlIHNlbGVjdGVkIGFnZW50IHdoZW4gYWxyZWFkeSBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9sb29zZS9oZWxwZXIubWQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdMb29zZSBhZ2VudCcpKTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luczogSVBsdWdpbkFnZW50c0ZvclNka1tdID0gW3sgYWdlbnRzOiBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnaGVscGVyJyB9XSB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cyhwbHVnaW5zLCAnaGVscGVyJywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3sgbmFtZTogJ2hlbHBlcicsIHRvb2xzOiBudWxsLCBwcm9tcHQ6ICdMb29zZSBhZ2VudCcgfV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHRvU2RrU2tpbGxEaXJlY3RvcmllcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndG9TZGtTa2lsbERpcmVjdG9yaWVzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgcGFyZW50IGRpcmVjdG9yaWVzIG9mIHNraWxsIFVSSXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBza2lsbHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbXG5cdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvc2tpbGwtYS9TS0lMTC5tZCcpLCBuYW1lOiAnc2tpbGwtYScgfSxcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9za2lsbC1iL1NLSUxMLm1kJyksIG5hbWU6ICdza2lsbC1iJyB9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrU2tpbGxEaXJlY3Rvcmllcyhza2lsbHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVkdXBsaWNhdGVzIGRpcmVjdG9yaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2tpbGxzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW1xuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3NoYXJlZC9TS0lMTC5tZCcpLCBuYW1lOiAnc2tpbGwtYScgfSxcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9zaGFyZWQvU0tJTEwubWQnKSwgbmFtZTogJ3NraWxsLWInIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9TZGtTa2lsbERpcmVjdG9yaWVzKHNraWxscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IGlucHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9TZGtTa2lsbERpcmVjdG9yaWVzKFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gdG9TZGtIb29rcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3RvU2RrSW5zdHJ1Y3Rpb25EaXJlY3RvcmllcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIHBhcmVudCBkaXJlY3RvcmllcyBvZiBpbnN0cnVjdGlvbiBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RydWN0aW9uczogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9ydWxlcy9wcm9qZWN0Lm1kYycpLCBuYW1lOiAncHJvamVjdCcgfSxcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9ydWxlcy9yZXZpZXcuaW5zdHJ1Y3Rpb25zLm1kJyksIG5hbWU6ICdyZXZpZXcnIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9TZGtJbnN0cnVjdGlvbkRpcmVjdG9yaWVzKGluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpLCAnL3BsdWdpbnMvcnVsZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZHVwbGljYXRlcyBkaXJlY3RvcmllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RydWN0aW9uczogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9ydWxlcy9hLm1kYycpLCBuYW1lOiAnYScgfSxcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9ydWxlcy9iLm1kYycpLCBuYW1lOiAnYicgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka0luc3RydWN0aW9uRGlyZWN0b3JpZXMoaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka0luc3RydWN0aW9uRGlyZWN0b3JpZXMoW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB0b1Nka0hvb2tzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndG9TZGtIb29rcycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIG1ha2VIb29rR3JvdXAodHlwZTogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcpOiBJUGFyc2VkSG9va0dyb3VwIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGNvbW1hbmRzOiBbeyBjb21tYW5kIH1dLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luL2hvb2tzLmpzb24nKSxcblx0XHRcdFx0b3JpZ2luYWxJZDogdHlwZSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Ykhvb2tDdXN0b21pemF0aW9uKHR5cGUpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBXcml0ZXMgYSB0ZW1wIEpTIHNjcmlwdCB0aGF0IG91dHB1dHMgSlNPTiB0byBzdGRvdXQgYW5kIHJldHVybnNcblx0XHQgKiBhIGBub2RlIDxwYXRoPmAgY29tbWFuZC4gV29ya3Mgb24gYm90aCBiYXNoICgvYmluL3NoIC1jKSBhbmRcblx0XHQgKiBjbWQuZXhlIHdpdGhvdXQgYW55IHNoZWxsLXF1b3RpbmcgaXNzdWVzLlxuXHRcdCAqIFRoZSBzY3JpcHQgaXMgd3JpdHRlbiBhbG9uZ3NpZGUgdGhlIGNvbXBpbGVkIHRlc3QgZmlsZSB3aGljaCBpc1xuXHRcdCAqIGd1YXJhbnRlZWQgdG8gZXhpc3QsIGJlIHdyaXRhYmxlLCBhbmQgaGF2ZSBubyBzcGFjZXMgaW4gQ0kuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gZWNob0pzb25DbWQodmFsdWU6IG9iamVjdCk6IHsgY29tbWFuZDogc3RyaW5nOyBjbGVhbnVwOiAoKSA9PiB2b2lkIH0ge1xuXHRcdFx0Y29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcblx0XHRcdC8vIGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLicsIGltcG9ydC5tZXRhLnVybCkpIGlzIHRoZSBOb2RlIEVTTSBlcXVpdmFsZW50XG5cdFx0XHQvLyBvZiBfX2Rpcm5hbWUgYW5kIHdvcmtzIG9uIE5vZGUgMTIrLCB1bmxpa2UgaW1wb3J0Lm1ldGEuZGlybmFtZSAoTm9kZSAyMS4yKykuXG5cdFx0XHRjb25zdCBkaXIgPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4nLCBpbXBvcnQubWV0YS51cmwpKS5yZXBsYWNlKC9bXFxcXC9dJC8sICcnKTtcblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gYCR7ZGlyfS92c2NvZGUtdGVzdC1ob29rLSR7RGF0ZS5ub3coKX0uanNgO1xuXHRcdFx0d3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgYHByb2Nlc3Muc3Rkb3V0LndyaXRlKCR7SlNPTi5zdHJpbmdpZnkoanNvbil9KTtcXG5gKTtcblx0XHRcdC8vIERvIE5PVCBxdW90ZSB0aGUgcGF0aDogY21kLmV4ZSAvYyBcIm5vZGUgcGF0aFwiIHN0cmlwcyB0aGUgb3V0ZXIgcXVvdGVzLFxuXHRcdFx0Ly8gbGVhdmluZyBcIm5vZGUgcGF0aFwiIHdpdGhvdXQgaW5uZXIgcXVvdGluZyB3aGljaCBjbWQuZXhlIGhhbmRsZXMgY2xlYW5seS5cblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBgbm9kZSAke2ZpbGVQYXRofWA7XG5cdFx0XHRyZXR1cm4geyBjb21tYW5kLCBjbGVhbnVwOiAoKSA9PiB7IHRyeSB7IHVubGlua1N5bmMoZmlsZVBhdGgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH0gfSB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ29uUG9zdFRvb2xVc2UgcmV0dXJucyBwYXJzZWQgSlNPTiBvdXRwdXQgYXMgaG9vayByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZE91dHB1dCA9IHsgYWRkaXRpb25hbENvbnRleHQ6ICdCZWZvcmUgcHJlc2VudGluZyB0aGUgcGxhbiwgcnVuIHJldmlldy1wbGFuIHNraWxsJyB9O1xuXHRcdFx0Y29uc3QgeyBjb21tYW5kLCBjbGVhbnVwIH0gPSBlY2hvSnNvbkNtZChleHBlY3RlZE91dHB1dCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBob29rR3JvdXAgPSBtYWtlSG9va0dyb3VwKCdQb3N0VG9vbFVzZScsIGNvbW1hbmQpO1xuXHRcdFx0XHRjb25zdCBob29rcyA9IHRvU2RrSG9va3MoW2hvb2tHcm91cF0pO1xuXHRcdFx0XHRjb25zdCB0b29sUmVzdWx0ID0geyB0ZXh0UmVzdWx0Rm9yTGxtOiAnb2snLCByZXN1bHRUeXBlOiAnc3VjY2VzcycgYXMgY29uc3QgfTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaG9va3Mub25Qb3N0VG9vbFVzZSEoeyB0b29sTmFtZTogJ21lbW9yeScsIHRvb2xBcmdzOiB7fSwgdG9vbFJlc3VsdCwgdGltZXN0YW1wOiBuZXcgRGF0ZSgwKSwgd29ya2luZ0RpcmVjdG9yeTogJy8nLCBzZXNzaW9uSWQ6ICd0ZXN0JyB9LCB7IHNlc3Npb25JZDogJ3Rlc3QnIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWRPdXRwdXQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25Qb3N0VG9vbFVzZSByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG91dHB1dCBpcyBub24tSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFVzZSBhIHNjcmlwdCBmaWxlIHNvIHRoZXJlIGFyZSBubyBjbWQuZXhlIHF1b3RpbmcgaXNzdWVzIG9uIFdpbmRvd3MuXG5cdFx0XHRjb25zdCBkaXIgPSBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4nLCBpbXBvcnQubWV0YS51cmwpKS5yZXBsYWNlKC9bXFxcXC9dJC8sICcnKTtcblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gYCR7ZGlyfS92c2NvZGUtdGVzdC1ob29rLW5vbmpzb24tJHtEYXRlLm5vdygpfS5qc2A7XG5cdFx0XHR3cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ25vdC1qc29uJyk7XFxuYCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBob29rR3JvdXAgPSBtYWtlSG9va0dyb3VwKCdQb3N0VG9vbFVzZScsIGBub2RlICR7ZmlsZVBhdGh9YCk7XG5cdFx0XHRcdGNvbnN0IGhvb2tzID0gdG9TZGtIb29rcyhbaG9va0dyb3VwXSk7XG5cdFx0XHRcdGNvbnN0IHRvb2xSZXN1bHQgPSB7IHRleHRSZXN1bHRGb3JMbG06ICdvaycsIHJlc3VsdFR5cGU6ICdzdWNjZXNzJyBhcyBjb25zdCB9O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBob29rcy5vblBvc3RUb29sVXNlISh7IHRvb2xOYW1lOiAnbWVtb3J5JywgdG9vbEFyZ3M6IHt9LCB0b29sUmVzdWx0LCB0aW1lc3RhbXA6IG5ldyBEYXRlKDApLCB3b3JraW5nRGlyZWN0b3J5OiAnLycsIHNlc3Npb25JZDogJ3Rlc3QnIH0sIHsgc2Vzc2lvbklkOiAndGVzdCcgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cnkgeyB1bmxpbmtTeW5jKGZpbGVQYXRoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblBvc3RUb29sVXNlIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gY29tbWFuZCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRpciA9IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLicsIGltcG9ydC5tZXRhLnVybCkpLnJlcGxhY2UoL1tcXFxcL10kLywgJycpO1xuXHRcdFx0Y29uc3QgZmlsZVBhdGggPSBgJHtkaXJ9L3ZzY29kZS10ZXN0LWhvb2stZmFpbC0ke0RhdGUubm93KCl9LmpzYDtcblx0XHRcdHdyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIGBwcm9jZXNzLmV4aXQoMSk7XFxuYCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBob29rR3JvdXAgPSBtYWtlSG9va0dyb3VwKCdQb3N0VG9vbFVzZScsIGBub2RlICR7ZmlsZVBhdGh9YCk7XG5cdFx0XHRcdGNvbnN0IGhvb2tzID0gdG9TZGtIb29rcyhbaG9va0dyb3VwXSk7XG5cdFx0XHRcdGNvbnN0IHRvb2xSZXN1bHQgPSB7IHRleHRSZXN1bHRGb3JMbG06ICdvaycsIHJlc3VsdFR5cGU6ICdzdWNjZXNzJyBhcyBjb25zdCB9O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBob29rcy5vblBvc3RUb29sVXNlISh7IHRvb2xOYW1lOiAnbWVtb3J5JywgdG9vbEFyZ3M6IHt9LCB0b29sUmVzdWx0LCB0aW1lc3RhbXA6IG5ldyBEYXRlKDApLCB3b3JraW5nRGlyZWN0b3J5OiAnLycsIHNlc3Npb25JZDogJ3Rlc3QnIH0sIHsgc2Vzc2lvbklkOiAndGVzdCcgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cnkgeyB1bmxpbmtTeW5jKGZpbGVQYXRoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblBvc3RUb29sVXNlIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rcyA9IHRvU2RrSG9va3MoW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvb2tzLm9uUG9zdFRvb2xVc2UsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblBvc3RUb29sVXNlIGNhbGxzIGVkaXRUcmFja2luZ0hvb2tzIGFuZCByZXR1cm5zIGNvbW1hbmQgb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRPdXRwdXQgPSB7IGFkZGl0aW9uYWxDb250ZXh0OiAnY29udGV4dCBmcm9tIGhvb2snIH07XG5cdFx0XHRjb25zdCB7IGNvbW1hbmQsIGNsZWFudXAgfSA9IGVjaG9Kc29uQ21kKGV4cGVjdGVkT3V0cHV0KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhvb2tHcm91cCA9IG1ha2VIb29rR3JvdXAoJ1Bvc3RUb29sVXNlJywgY29tbWFuZCk7XG5cdFx0XHRcdGxldCB0cmFja2luZ0lucHV0OiB1bmtub3duO1xuXHRcdFx0XHRjb25zdCBlZGl0VHJhY2tpbmdIb29rcyA9IHtcblx0XHRcdFx0XHRvblByZVRvb2xVc2U6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRvblBvc3RUb29sVXNlOiBhc3luYyAoaW5wdXQ6IHVua25vd24pID0+IHsgdHJhY2tpbmdJbnB1dCA9IGlucHV0OyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBob29rcyA9IHRvU2RrSG9va3MoW2hvb2tHcm91cF0sIGVkaXRUcmFja2luZ0hvb2tzKTtcblx0XHRcdFx0Y29uc3QgdG9vbFJlc3VsdCA9IHsgdGV4dFJlc3VsdEZvckxsbTogJ29rJywgcmVzdWx0VHlwZTogJ3N1Y2Nlc3MnIGFzIGNvbnN0IH07XG5cdFx0XHRcdGNvbnN0IGNhbGxJbnB1dCA9IHsgdG9vbE5hbWU6ICdtZW1vcnknLCB0b29sQXJnczoge30sIHRvb2xSZXN1bHQsIHRpbWVzdGFtcDogbmV3IERhdGUoMCksIHdvcmtpbmdEaXJlY3Rvcnk6ICcvJywgc2Vzc2lvbklkOiAndGVzdCcgfTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaG9va3Mub25Qb3N0VG9vbFVzZSEoY2FsbElucHV0LCB7IHNlc3Npb25JZDogJ3Rlc3QnIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWRPdXRwdXQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNraW5nSW5wdXQsIGNhbGxJbnB1dCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gcGFyc2VkUGx1Z2luc0VxdWFsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdwYXJzZWRQbHVnaW5zRXF1YWwnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBtYWtlUGx1Z2luKG92ZXJyaWRlcz86IFBhcnRpYWw8SVBhcnNlZFBsdWdpbj4pOiBJUGFyc2VkUGx1Z2luIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGhvb2tzOiBbXSxcblx0XHRcdFx0bWNwU2VydmVyczogW10sXG5cdFx0XHRcdHNraWxsczogW10sXG5cdFx0XHRcdGFnZW50czogW10sXG5cdFx0XHRcdGluc3RydWN0aW9uczogW10sXG5cdFx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBpZGVudGljYWwgZW1wdHkgcGx1Z2lucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQbHVnaW5zRXF1YWwoW21ha2VQbHVnaW4oKV0sIFttYWtlUGx1Z2luKCldKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHNhbWUgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBtYWtlUGx1Z2luKHtcblx0XHRcdFx0c2tpbGxzOiBbeyB1cmk6IFVSSS5maWxlKCcvYS9TS0lMTC5tZCcpLCBuYW1lOiAnYScsIGN1c3RvbWl6YXRpb246IHN0dWJTa2lsbEN1c3RvbWl6YXRpb24oJ2EnKSB9IHNhdGlzZmllcyBJUGFyc2VkU2tpbGxdLFxuXHRcdFx0XHRtY3BTZXJ2ZXJzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9tY3AnKSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdub2RlJyB9LFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCdzZXJ2ZXInKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGIgPSBtYWtlUGx1Z2luKHtcblx0XHRcdFx0c2tpbGxzOiBbeyB1cmk6IFVSSS5maWxlKCcvYS9TS0lMTC5tZCcpLCBuYW1lOiAnYScsIGN1c3RvbWl6YXRpb246IHN0dWJTa2lsbEN1c3RvbWl6YXRpb24oJ2EnKSB9IHNhdGlzZmllcyBJUGFyc2VkU2tpbGxdLFxuXHRcdFx0XHRtY3BTZXJ2ZXJzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9tY3AnKSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdub2RlJyB9LFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCdzZXJ2ZXInKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQbHVnaW5zRXF1YWwoW2FdLCBbYl0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IG1ha2VQbHVnaW4oeyBza2lsbHM6IFt7IHVyaTogVVJJLmZpbGUoJy9hL1NLSUxMLm1kJyksIG5hbWU6ICdhJywgY3VzdG9taXphdGlvbjogc3R1YlNraWxsQ3VzdG9taXphdGlvbignYScpIH0gc2F0aXNmaWVzIElQYXJzZWRTa2lsbF0gfSk7XG5cdFx0XHRjb25zdCBiID0gbWFrZVBsdWdpbih7IHNraWxsczogW3sgdXJpOiBVUkkuZmlsZSgnL2IvU0tJTEwubWQnKSwgbmFtZTogJ2InLCBjdXN0b21pemF0aW9uOiBzdHViU2tpbGxDdXN0b21pemF0aW9uKCdiJykgfSBzYXRpc2ZpZXMgSVBhcnNlZFNraWxsXSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQbHVnaW5zRXF1YWwoW2FdLCBbYl0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBkaWZmZXJlbnQgcGx1Z2luIGZvcm1hdHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGx1Z2luc0VxdWFsKFxuXHRcdFx0XHRbbWFrZVBsdWdpbih7IGZvcm1hdDogUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luIH0pXSxcblx0XHRcdFx0W21ha2VQbHVnaW4oeyBmb3JtYXQ6IFBsdWdpbkZvcm1hdC5PcGVuUGx1Z2luIH0pXSxcblx0XHRcdCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBsZW5ndGhzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBsdWdpbnNFcXVhbChbbWFrZVBsdWdpbigpXSwgW21ha2VQbHVnaW4oKSwgbWFrZVBsdWdpbigpXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZW1wdHkgYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBsdWdpbnNFcXVhbChbXSwgW10pLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWUsa0JBQWtCO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkIsaUJBQWlCLG1CQUFtQiwwQkFBMEIsdUJBQXVCLG9CQUFvQixrQkFBNEM7QUFDM0wsU0FBUyxvQkFBd0k7QUFDakosU0FBUyxtQkFBbUIsdUJBQXFHO0FBRWpJLFNBQVMscUJBQXFCLE9BQU8sUUFBZ0M7QUFDcEUsU0FBTyxFQUFFLE1BQU0sa0JBQWtCLFdBQVcsSUFBSSxPQUFPLElBQUksSUFBSSxLQUFLLGtCQUFrQixNQUFNLFNBQVMsTUFBTSxPQUFPLEVBQUUsTUFBTSxnQkFBZ0IsU0FBUyxFQUFFO0FBQ3RKO0FBQ0EsU0FBUyxzQkFBc0IsTUFBaUM7QUFDL0QsU0FBTyxFQUFFLE1BQU0sa0JBQWtCLE1BQU0sSUFBSSxRQUFRLElBQUksSUFBSSxLQUFLLDZCQUE2QixNQUFNLGFBQWE7QUFDakg7QUFDQSxTQUFTLHVCQUF1QixNQUFrQztBQUNqRSxTQUFPLEVBQUUsTUFBTSxrQkFBa0IsT0FBTyxJQUFJLFNBQVMsSUFBSSxJQUFJLEtBQUssV0FBVyxJ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
