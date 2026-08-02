import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { McpCollectionSortOrder, McpServerTransportType } from "../../../../mcp/common/mcpTypes.js";
import {
  validatePluginName,
  getResourceLabel,
  getResourceFileName,
  serializeHookCommand,
  serializeMcpLaunch,
  writePluginToDisk,
  updateMarketplaceIfNeeded
} from "../../../browser/actions/createPluginAction.js";
function makePromptPath(overrides) {
  return overrides;
}
function makeResourceItem(overrides) {
  return { checked: false, ...overrides };
}
suite("CreatePluginAction helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("validatePluginName", () => {
    test("rejects empty name", () => {
      assert.ok(validatePluginName(""));
    });
    test("accepts valid names", () => {
      assert.deepStrictEqual(
        ["my-plugin", "plugin1", "a", "code-reviewer", "my.plugin", "a1b2c3"].map((n) => validatePluginName(n)),
        [void 0, void 0, void 0, void 0, void 0, void 0]
      );
    });
    test("rejects names with invalid characters", () => {
      assert.ok(validatePluginName("My-Plugin"));
      assert.ok(validatePluginName("my_plugin"));
      assert.ok(validatePluginName("my plugin"));
      assert.ok(validatePluginName("plugin!"));
    });
    test("rejects names not starting/ending with alphanumeric", () => {
      assert.ok(validatePluginName("-plugin"));
      assert.ok(validatePluginName("plugin-"));
      assert.ok(validatePluginName(".plugin"));
      assert.ok(validatePluginName("plugin."));
    });
    test("rejects consecutive hyphens or periods", () => {
      assert.ok(validatePluginName("my--plugin"));
      assert.ok(validatePluginName("my..plugin"));
    });
    test("rejects names longer than 64 characters", () => {
      assert.ok(validatePluginName("a".repeat(65)));
    });
    test("accepts name with exactly 64 characters", () => {
      assert.strictEqual(validatePluginName("a".repeat(64)), void 0);
    });
  });
  suite("getResourceLabel", () => {
    test("returns name if set", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/bar.instructions.md"),
        storage: PromptsStorage.local,
        type: PromptsType.instructions,
        name: "my-instructions"
      });
      assert.strictEqual(getResourceLabel(path), "my-instructions");
    });
    test("returns basename for non-skill resources without name", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/bar.instructions.md"),
        storage: PromptsStorage.local,
        type: PromptsType.instructions
      });
      assert.strictEqual(getResourceLabel(path), "bar.instructions.md");
    });
    test("returns parent directory name for skills pointing to SKILL.md", () => {
      const path = makePromptPath({
        uri: URI.file("/workspace/.github/skills/my-skill/SKILL.md"),
        storage: PromptsStorage.local,
        type: PromptsType.skill
      });
      assert.strictEqual(getResourceLabel(path), "my-skill");
    });
    test("returns basename for skill not named SKILL.md", () => {
      const path = makePromptPath({
        uri: URI.file("/workspace/.github/skills/custom.md"),
        storage: PromptsStorage.local,
        type: PromptsType.skill
      });
      assert.strictEqual(getResourceLabel(path), "custom.md");
    });
  });
  suite("getResourceFileName", () => {
    test("strips namespace prefix", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/SKILL.md"),
        storage: PromptsStorage.plugin,
        type: PromptsType.skill,
        name: "hookify:writing-rules"
      });
      assert.strictEqual(getResourceFileName(path), "writing-rules");
    });
    test("returns full name when no prefix", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/my-skill/SKILL.md"),
        storage: PromptsStorage.local,
        type: PromptsType.skill
      });
      assert.strictEqual(getResourceFileName(path), "my-skill");
    });
    test("handles names with multiple colons", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/bar.md"),
        storage: PromptsStorage.plugin,
        type: PromptsType.agent,
        name: "ns:sub:name"
      });
      assert.strictEqual(getResourceFileName(path), "sub:name");
    });
  });
  suite("serializeHookCommand", () => {
    test("serializes basic command", () => {
      assert.deepStrictEqual(serializeHookCommand({ type: "command", command: "echo hello" }), {
        type: "command",
        command: "echo hello"
      });
    });
    test("serializes platform-specific commands", () => {
      assert.deepStrictEqual(
        serializeHookCommand({
          type: "command",
          command: "echo hello",
          windows: "echo.exe hello",
          linux: "/bin/echo hello",
          osx: "/bin/echo hello"
        }),
        {
          type: "command",
          command: "echo hello",
          windows: "echo.exe hello",
          linux: "/bin/echo hello",
          osx: "/bin/echo hello"
        }
      );
    });
    test("includes env and timeout when present", () => {
      assert.deepStrictEqual(
        serializeHookCommand({
          type: "command",
          command: "test",
          env: { FOO: "bar" },
          timeout: 5e3
        }),
        {
          type: "command",
          command: "test",
          env: { FOO: "bar" },
          timeout: 5e3
        }
      );
    });
    test("omits empty env", () => {
      const result = serializeHookCommand({ type: "command", command: "test", env: {} });
      assert.strictEqual(result["env"], void 0);
    });
    test("converts URI-like cwd to string", () => {
      const cwd = URI.file("/workspace");
      const result = serializeHookCommand({ type: "command", command: "test", cwd });
      assert.strictEqual(typeof result["cwd"], "string");
    });
    test("preserves timeout of 0", () => {
      const result = serializeHookCommand({ type: "command", command: "test", timeout: 0 });
      assert.strictEqual(result["timeout"], 0);
    });
  });
  suite("serializeMcpLaunch", () => {
    test("serializes stdio launch", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.Stdio,
          command: "node",
          args: ["server.js"],
          cwd: "/workspace",
          env: { NODE_ENV: "production" },
          envFile: void 0,
          sandbox: void 0
        }),
        {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          cwd: "/workspace",
          env: { NODE_ENV: "production" }
        }
      );
    });
    test("omits empty args and env for stdio", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.Stdio,
          command: "server",
          args: [],
          cwd: void 0,
          env: {},
          envFile: void 0,
          sandbox: void 0
        }),
        {
          type: "stdio",
          command: "server"
        }
      );
    });
    test("serializes http launch", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.HTTP,
          uri: URI.parse("http://localhost:3000"),
          headers: [["Authorization", "Bearer token"]]
        }),
        {
          type: "http",
          url: "http://localhost:3000/",
          headers: { Authorization: "Bearer token" }
        }
      );
    });
    test("omits empty headers for http", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.HTTP,
          uri: URI.parse("http://localhost:3000"),
          headers: []
        }),
        {
          type: "http",
          url: "http://localhost:3000/"
        }
      );
    });
  });
});
suite("writePluginToDisk", () => {
  const disposables = new DisposableStore();
  let fileService;
  const root = URI.from({ scheme: Schemas.inMemory, path: "/test" });
  setup(() => {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(service.registerProvider(Schemas.inMemory, provider));
    fileService = service;
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function readJson(uri) {
    const content = await fileService.readFile(uri);
    return JSON.parse(content.value.toString());
  }
  test("creates manifest with correct structure", async () => {
    const pluginRoot = URI.joinPath(root, "my-plugin");
    await writePluginToDisk(fileService, pluginRoot, "my-plugin", []);
    assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, ".plugin", "plugin.json")), {
      name: "my-plugin",
      version: "1.0.0",
      description: ""
    });
  });
  test("copies instructions to rules/", async () => {
    const sourceUri = URI.joinPath(root, "source", "coding.instructions.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("# My coding rules"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "coding",
        resourceType: "instruction",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.instructions,
          name: "coding"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "rules", "coding.instructions.md"));
    assert.strictEqual(content.value.toString(), "# My coding rules");
  });
  test("preserves .mdc suffix for rule files", async () => {
    const sourceUri = URI.joinPath(root, "source", "prefer-const.mdc");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("prefer const"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "prefer-const.mdc",
        resourceType: "instruction",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.instructions,
          name: "prefer-const.mdc"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "rules", "prefer-const.mdc"));
    assert.strictEqual(content.value.toString(), "prefer const");
  });
  test("copies prompts to commands/", async () => {
    const sourceUri = URI.joinPath(root, "source", "review.prompt.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("Review this code"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "review",
        resourceType: "prompt",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.prompt,
          name: "review"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "commands", "review.md"));
    assert.strictEqual(content.value.toString(), "Review this code");
  });
  test("copies agents to agents/", async () => {
    const sourceUri = URI.joinPath(root, "source", "reviewer.agent.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("---\nname: reviewer\n---\nYou review code."));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "reviewer",
        resourceType: "agent",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.agent,
          name: "reviewer"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "agents", "reviewer.md"));
    assert.strictEqual(content.value.toString(), "---\nname: reviewer\n---\nYou review code.");
  });
  test("copies skill directories recursively", async () => {
    const skillDir = URI.joinPath(root, "source", "skills", "my-skill");
    await fileService.writeFile(URI.joinPath(skillDir, "SKILL.md"), VSBuffer.fromString("# My Skill"));
    await fileService.writeFile(URI.joinPath(skillDir, "helper.md"), VSBuffer.fromString("helper content"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "my-skill",
        resourceType: "skill",
        promptPath: makePromptPath({
          uri: URI.joinPath(skillDir, "SKILL.md"),
          storage: PromptsStorage.local,
          type: PromptsType.skill
        })
      })
    ]);
    const skillMd = await fileService.readFile(URI.joinPath(pluginRoot, "skills", "my-skill", "SKILL.md"));
    assert.strictEqual(skillMd.value.toString(), "# My Skill");
    const helperMd = await fileService.readFile(URI.joinPath(pluginRoot, "skills", "my-skill", "helper.md"));
    assert.strictEqual(helperMd.value.toString(), "helper content");
  });
  test("merges hooks into hooks/hooks.json", async () => {
    const hooksUri = URI.joinPath(root, "source", "hooks.json");
    await fileService.writeFile(hooksUri, VSBuffer.fromString(JSON.stringify({
      hooks: {
        SessionStart: [{ type: "command", command: "echo start" }],
        PreToolUse: [{ type: "command", command: "echo pre" }]
      }
    })));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "hooks",
        resourceType: "hook",
        promptPath: makePromptPath({
          uri: hooksUri,
          storage: PromptsStorage.local,
          type: PromptsType.hook
        })
      })
    ]);
    assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, "hooks", "hooks.json")), {
      hooks: {
        SessionStart: [{ type: "command", command: "echo start" }],
        PreToolUse: [{ type: "command", command: "echo pre" }]
      }
    });
  });
  test("exports MCP servers to .mcp.json", async () => {
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "my-server",
        resourceType: "mcp",
        mcpServer: {
          collection: {
            id: "col1",
            label: "Test Collection",
            order: McpCollectionSortOrder.User
          },
          definition: {
            id: "def1",
            label: "my-server",
            launch: {
              type: McpServerTransportType.Stdio,
              command: "npx",
              args: ["-y", "my-mcp-server"],
              cwd: void 0,
              env: {},
              envFile: void 0,
              sandbox: void 0
            },
            cacheNonce: "1"
          }
        }
      })
    ]);
    assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, ".mcp.json")), {
      mcpServers: {
        "my-server": {
          type: "stdio",
          command: "npx",
          args: ["-y", "my-mcp-server"]
        }
      }
    });
  });
  test("strips namespace prefix from plugin resource names", async () => {
    const sourceUri = URI.joinPath(root, "source", "rules.instructions.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("content"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "hookify:writing-rules",
        resourceType: "instruction",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.plugin,
          type: PromptsType.instructions,
          name: "hookify:writing-rules"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "rules", "writing-rules.instructions.md"));
    assert.strictEqual(content.value.toString(), "content");
  });
  test("does not create directories for empty resource types", async () => {
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", []);
    assert.ok(await fileService.exists(URI.joinPath(pluginRoot, ".plugin", "plugin.json")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "rules")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "commands")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "agents")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "skills")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "hooks")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, ".mcp.json")));
  });
});
suite("updateMarketplaceIfNeeded", () => {
  const disposables = new DisposableStore();
  let fileService;
  const root = URI.from({ scheme: Schemas.inMemory, path: "/marketplace-test" });
  setup(() => {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(service.registerProvider(Schemas.inMemory, provider));
    fileService = service;
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("adds plugin to existing marketplace.json", async () => {
    const marketplace = { name: "my-marketplace", plugins: [{ name: "existing", source: "./existing/" }] };
    await fileService.writeFile(URI.joinPath(root, "marketplace.json"), VSBuffer.fromString(JSON.stringify(marketplace)));
    await updateMarketplaceIfNeeded(fileService, root, "new-plugin");
    const content = await fileService.readFile(URI.joinPath(root, "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "existing", source: "./existing/" },
      { name: "new-plugin", source: "./new-plugin/" }
    ]);
  });
  test("creates plugins array if missing", async () => {
    await fileService.writeFile(URI.joinPath(root, "marketplace.json"), VSBuffer.fromString(JSON.stringify({ name: "test" })));
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    const content = await fileService.readFile(URI.joinPath(root, "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "my-plugin", source: "./my-plugin/" }
    ]);
  });
  test("detects .plugin/marketplace.json", async () => {
    const marketplace = { name: "test", plugins: [] };
    await fileService.writeFile(URI.joinPath(root, ".plugin", "marketplace.json"), VSBuffer.fromString(JSON.stringify(marketplace)));
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    const content = await fileService.readFile(URI.joinPath(root, ".plugin", "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "my-plugin", source: "./my-plugin/" }
    ]);
  });
  test("does nothing when no marketplace.json exists", async () => {
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    assert.ok(!await fileService.exists(URI.joinPath(root, "marketplace.json")));
  });
  test("does not duplicate existing plugin entry", async () => {
    const marketplace = { name: "test", plugins: [{ name: "my-plugin", source: "./my-plugin/" }] };
    await fileService.writeFile(URI.joinPath(root, "marketplace.json"), VSBuffer.fromString(JSON.stringify(marketplace)));
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    const content = await fileService.readFile(URI.joinPath(root, "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "my-plugin", source: "./my-plugin/" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FjdGlvbnMvY3JlYXRlUGx1Z2luQWN0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9tcHRQYXRoLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQge1xuXHR2YWxpZGF0ZVBsdWdpbk5hbWUsXG5cdGdldFJlc291cmNlTGFiZWwsXG5cdGdldFJlc291cmNlRmlsZU5hbWUsXG5cdHNlcmlhbGl6ZUhvb2tDb21tYW5kLFxuXHRzZXJpYWxpemVNY3BMYXVuY2gsXG5cdHdyaXRlUGx1Z2luVG9EaXNrLFxuXHR1cGRhdGVNYXJrZXRwbGFjZUlmTmVlZGVkLFxuXHR0eXBlIElSZXNvdXJjZVRyZWVJdGVtLFxufSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvY3JlYXRlUGx1Z2luQWN0aW9uLmpzJztcblxuZnVuY3Rpb24gbWFrZVByb21wdFBhdGgob3ZlcnJpZGVzOiBQYXJ0aWFsPElQcm9tcHRQYXRoPiAmIHsgdXJpOiBVUkk7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlOyB0eXBlOiBQcm9tcHRzVHlwZSB9KTogSVByb21wdFBhdGgge1xuXHRyZXR1cm4gb3ZlcnJpZGVzIGFzIElQcm9tcHRQYXRoO1xufVxuXG5mdW5jdGlvbiBtYWtlUmVzb3VyY2VJdGVtKG92ZXJyaWRlczogUGFydGlhbDxJUmVzb3VyY2VUcmVlSXRlbT4gJiBQaWNrPElSZXNvdXJjZVRyZWVJdGVtLCAnbGFiZWwnIHwgJ3Jlc291cmNlVHlwZSc+KTogSVJlc291cmNlVHJlZUl0ZW0ge1xuXHRyZXR1cm4geyBjaGVja2VkOiBmYWxzZSwgLi4ub3ZlcnJpZGVzIH07XG59XG5cbnN1aXRlKCdDcmVhdGVQbHVnaW5BY3Rpb24gaGVscGVycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgndmFsaWRhdGVQbHVnaW5OYW1lJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVqZWN0cyBlbXB0eSBuYW1lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyB2YWxpZCBuYW1lcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFsnbXktcGx1Z2luJywgJ3BsdWdpbjEnLCAnYScsICdjb2RlLXJldmlld2VyJywgJ215LnBsdWdpbicsICdhMWIyYzMnXS5tYXAobiA9PiB2YWxpZGF0ZVBsdWdpbk5hbWUobikpLFxuXHRcdFx0XHRbdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIG5hbWVzIHdpdGggaW52YWxpZCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnTXktUGx1Z2luJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnbXlfcGx1Z2luJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnbXkgcGx1Z2luJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgncGx1Z2luIScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgbmFtZXMgbm90IHN0YXJ0aW5nL2VuZGluZyB3aXRoIGFscGhhbnVtZXJpYycsICgpID0+IHtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJy1wbHVnaW4nKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGVQbHVnaW5OYW1lKCdwbHVnaW4tJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnLnBsdWdpbicpKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ3BsdWdpbi4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGNvbnNlY3V0aXZlIGh5cGhlbnMgb3IgcGVyaW9kcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ215LS1wbHVnaW4nKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGVQbHVnaW5OYW1lKCdteS4ucGx1Z2luJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBuYW1lcyBsb25nZXIgdGhhbiA2NCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnYScucmVwZWF0KDY1KSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBuYW1lIHdpdGggZXhhY3RseSA2NCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRlUGx1Z2luTmFtZSgnYScucmVwZWF0KDY0KSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRSZXNvdXJjZUxhYmVsJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBuYW1lIGlmIHNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9mb28vYmFyLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRuYW1lOiAnbXktaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlc291cmNlTGFiZWwocGF0aCksICdteS1pbnN0cnVjdGlvbnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYmFzZW5hbWUgZm9yIG5vbi1za2lsbCByZXNvdXJjZXMgd2l0aG91dCBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IG1ha2VQcm9tcHRQYXRoKHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2Zvby9iYXIuaW5zdHJ1Y3Rpb25zLm1kJyksXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXNvdXJjZUxhYmVsKHBhdGgpLCAnYmFyLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBwYXJlbnQgZGlyZWN0b3J5IG5hbWUgZm9yIHNraWxscyBwb2ludGluZyB0byBTS0lMTC5tZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVzb3VyY2VMYWJlbChwYXRoKSwgJ215LXNraWxsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGJhc2VuYW1lIGZvciBza2lsbCBub3QgbmFtZWQgU0tJTEwubWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2N1c3RvbS5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXNvdXJjZUxhYmVsKHBhdGgpLCAnY3VzdG9tLm1kJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRSZXNvdXJjZUZpbGVOYW1lJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RyaXBzIG5hbWVzcGFjZSBwcmVmaXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvZm9vL1NLSUxMLm1kJyksXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbixcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdG5hbWU6ICdob29raWZ5OndyaXRpbmctcnVsZXMnLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVzb3VyY2VGaWxlTmFtZShwYXRoKSwgJ3dyaXRpbmctcnVsZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZnVsbCBuYW1lIHdoZW4gbm8gcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IG1ha2VQcm9tcHRQYXRoKHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2Zvby9teS1za2lsbC9TS0lMTC5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXNvdXJjZUZpbGVOYW1lKHBhdGgpLCAnbXktc2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbmFtZXMgd2l0aCBtdWx0aXBsZSBjb2xvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvZm9vL2Jhci5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRuYW1lOiAnbnM6c3ViOm5hbWUnLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVzb3VyY2VGaWxlTmFtZShwYXRoKSwgJ3N1YjpuYW1lJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXJpYWxpemVIb29rQ29tbWFuZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NlcmlhbGl6ZXMgYmFzaWMgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VyaWFsaXplSG9va0NvbW1hbmQoeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9KSwge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VyaWFsaXplcyBwbGF0Zm9ybS1zcGVjaWZpYyBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcmlhbGl6ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdHdpbmRvd3M6ICdlY2hvLmV4ZSBoZWxsbycsXG5cdFx0XHRcdFx0bGludXg6ICcvYmluL2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdG9zeDogJy9iaW4vZWNobyBoZWxsbycsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAnZWNoby5leGUgaGVsbG8nLFxuXHRcdFx0XHRcdGxpbnV4OiAnL2Jpbi9lY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRvc3g6ICcvYmluL2VjaG8gaGVsbG8nLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgZW52IGFuZCB0aW1lb3V0IHdoZW4gcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcmlhbGl6ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3Rlc3QnLFxuXHRcdFx0XHRcdGVudjogeyBGT086ICdiYXInIH0sXG5cdFx0XHRcdFx0dGltZW91dDogNTAwMCxcblx0XHRcdFx0fSksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3Rlc3QnLFxuXHRcdFx0XHRcdGVudjogeyBGT086ICdiYXInIH0sXG5cdFx0XHRcdFx0dGltZW91dDogNTAwMCxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIGVtcHR5IGVudicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcmlhbGl6ZUhvb2tDb21tYW5kKHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAndGVzdCcsIGVudjoge30gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WydlbnYnXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIFVSSS1saWtlIGN3ZCB0byBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VyaWFsaXplSG9va0NvbW1hbmQoeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICd0ZXN0JywgY3dkIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRbJ2N3ZCddLCAnc3RyaW5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgdGltZW91dCBvZiAwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VyaWFsaXplSG9va0NvbW1hbmQoeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICd0ZXN0JywgdGltZW91dDogMCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbJ3RpbWVvdXQnXSwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXJpYWxpemVNY3BMYXVuY2gnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzZXJpYWxpemVzIHN0ZGlvIGxhdW5jaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcmlhbGl6ZU1jcExhdW5jaCh7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0XHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdFx0YXJnczogWydzZXJ2ZXIuanMnXSxcblx0XHRcdFx0XHRjd2Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdFx0XHRlbnY6IHsgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyB9LFxuXHRcdFx0XHRcdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzYW5kYm94OiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdFx0YXJnczogWydzZXJ2ZXIuanMnXSxcblx0XHRcdFx0XHRjd2Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdFx0XHRlbnY6IHsgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyB9LFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgZW1wdHkgYXJncyBhbmQgZW52IGZvciBzdGRpbycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcmlhbGl6ZU1jcExhdW5jaCh7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0XHRcdFx0XHRjb21tYW5kOiAnc2VydmVyJyxcblx0XHRcdFx0XHRhcmdzOiBbXSxcblx0XHRcdFx0XHRjd2Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlbnY6IHt9LFxuXHRcdFx0XHRcdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzYW5kYm94OiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnc2VydmVyJyxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcmlhbGl6ZXMgaHR0cCBsYXVuY2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJpYWxpemVNY3BMYXVuY2goe1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCxcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnaHR0cDovL2xvY2FsaG9zdDozMDAwJyksXG5cdFx0XHRcdFx0aGVhZGVyczogW1snQXV0aG9yaXphdGlvbicsICdCZWFyZXIgdG9rZW4nXV0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2h0dHAnLFxuXHRcdFx0XHRcdHVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHsgQXV0aG9yaXphdGlvbjogJ0JlYXJlciB0b2tlbicgfSxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIGVtcHR5IGhlYWRlcnMgZm9yIGh0dHAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJpYWxpemVNY3BMYXVuY2goe1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCxcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnaHR0cDovL2xvY2FsaG9zdDozMDAwJyksXG5cdFx0XHRcdFx0aGVhZGVyczogW10sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2h0dHAnLFxuXHRcdFx0XHRcdHVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnd3JpdGVQbHVnaW5Ub0Rpc2snLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRjb25zdCByb290ID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvdGVzdCcgfSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgcHJvdmlkZXIpKTtcblx0XHRmaWxlU2VydmljZSA9IHNlcnZpY2U7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiByZWFkSnNvbih1cmk6IFVSSSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0dGVzdCgnY3JlYXRlcyBtYW5pZmVzdCB3aXRoIGNvcnJlY3Qgc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuam9pblBhdGgocm9vdCwgJ215LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCAnbXktcGx1Z2luJywgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkSnNvbihVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJy5wbHVnaW4nLCAncGx1Z2luLmpzb24nKSksIHtcblx0XHRcdG5hbWU6ICdteS1wbHVnaW4nLFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29waWVzIGluc3RydWN0aW9ucyB0byBydWxlcy8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmpvaW5QYXRoKHJvb3QsICdzb3VyY2UnLCAnY29kaW5nLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJyMgTXkgY29kaW5nIHJ1bGVzJykpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAnY29kaW5nJyxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnaW5zdHJ1Y3Rpb24nLFxuXHRcdFx0XHRwcm9tcHRQYXRoOiBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdFx0dXJpOiBzb3VyY2VVcmksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdG5hbWU6ICdjb2RpbmcnLFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAncnVsZXMnLCAnY29kaW5nLmluc3RydWN0aW9ucy5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnIyBNeSBjb2RpbmcgcnVsZXMnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIC5tZGMgc3VmZml4IGZvciBydWxlIGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZVVyaSA9IFVSSS5qb2luUGF0aChyb290LCAnc291cmNlJywgJ3ByZWZlci1jb25zdC5tZGMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc291cmNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdwcmVmZXIgY29uc3QnKSk7XG5cblx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmpvaW5QYXRoKHJvb3QsICd0ZXN0LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCAndGVzdC1wbHVnaW4nLCBbXG5cdFx0XHRtYWtlUmVzb3VyY2VJdGVtKHtcblx0XHRcdFx0bGFiZWw6ICdwcmVmZXItY29uc3QubWRjJyxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnaW5zdHJ1Y3Rpb24nLFxuXHRcdFx0XHRwcm9tcHRQYXRoOiBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdFx0dXJpOiBzb3VyY2VVcmksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdG5hbWU6ICdwcmVmZXItY29uc3QubWRjJyxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ3J1bGVzJywgJ3ByZWZlci1jb25zdC5tZGMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ3ByZWZlciBjb25zdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3BpZXMgcHJvbXB0cyB0byBjb21tYW5kcy8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmpvaW5QYXRoKHJvb3QsICdzb3VyY2UnLCAncmV2aWV3LnByb21wdC5tZCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1JldmlldyB0aGlzIGNvZGUnKSk7XG5cblx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmpvaW5QYXRoKHJvb3QsICd0ZXN0LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCAndGVzdC1wbHVnaW4nLCBbXG5cdFx0XHRtYWtlUmVzb3VyY2VJdGVtKHtcblx0XHRcdFx0bGFiZWw6ICdyZXZpZXcnLFxuXHRcdFx0XHRyZXNvdXJjZVR5cGU6ICdwcm9tcHQnLFxuXHRcdFx0XHRwcm9tcHRQYXRoOiBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdFx0dXJpOiBzb3VyY2VVcmksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0XHRcdG5hbWU6ICdyZXZpZXcnLFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnY29tbWFuZHMnLCAncmV2aWV3Lm1kJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdSZXZpZXcgdGhpcyBjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcGllcyBhZ2VudHMgdG8gYWdlbnRzLycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkuam9pblBhdGgocm9vdCwgJ3NvdXJjZScsICdyZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IHJldmlld2VyXFxuLS0tXFxuWW91IHJldmlldyBjb2RlLicpKTtcblxuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuam9pblBhdGgocm9vdCwgJ3Rlc3QtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVQbHVnaW5Ub0Rpc2soZmlsZVNlcnZpY2UsIHBsdWdpblJvb3QsICd0ZXN0LXBsdWdpbicsIFtcblx0XHRcdG1ha2VSZXNvdXJjZUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogJ3Jldmlld2VyJyxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnYWdlbnQnLFxuXHRcdFx0XHRwcm9tcHRQYXRoOiBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdFx0dXJpOiBzb3VyY2VVcmksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHRcdFx0bmFtZTogJ3Jldmlld2VyJyxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ2FnZW50cycsICdyZXZpZXdlci5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnLS0tXFxubmFtZTogcmV2aWV3ZXJcXG4tLS1cXG5Zb3UgcmV2aWV3IGNvZGUuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcGllcyBza2lsbCBkaXJlY3RvcmllcyByZWN1cnNpdmVseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBza2lsbERpciA9IFVSSS5qb2luUGF0aChyb290LCAnc291cmNlJywgJ3NraWxscycsICdteS1za2lsbCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoc2tpbGxEaXIsICdTS0lMTC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcjIE15IFNraWxsJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoc2tpbGxEaXIsICdoZWxwZXIubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnaGVscGVyIGNvbnRlbnQnKSk7XG5cblx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmpvaW5QYXRoKHJvb3QsICd0ZXN0LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCAndGVzdC1wbHVnaW4nLCBbXG5cdFx0XHRtYWtlUmVzb3VyY2VJdGVtKHtcblx0XHRcdFx0bGFiZWw6ICdteS1za2lsbCcsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ3NraWxsJyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogVVJJLmpvaW5QYXRoKHNraWxsRGlyLCAnU0tJTEwubWQnKSxcblx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHNraWxsTWQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ3NraWxscycsICdteS1za2lsbCcsICdTS0lMTC5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGxNZC52YWx1ZS50b1N0cmluZygpLCAnIyBNeSBTa2lsbCcpO1xuXHRcdGNvbnN0IGhlbHBlck1kID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdza2lsbHMnLCAnbXktc2tpbGwnLCAnaGVscGVyLm1kJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWxwZXJNZC52YWx1ZS50b1N0cmluZygpLCAnaGVscGVyIGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2VzIGhvb2tzIGludG8gaG9va3MvaG9va3MuanNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob29rc1VyaSA9IFVSSS5qb2luUGF0aChyb290LCAnc291cmNlJywgJ2hvb2tzLmpzb24nKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoaG9va3NVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0aG9va3M6IHtcblx0XHRcdFx0U2Vzc2lvblN0YXJ0OiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIHN0YXJ0JyB9XSxcblx0XHRcdFx0UHJlVG9vbFVzZTogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBwcmUnIH1dLFxuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmpvaW5QYXRoKHJvb3QsICd0ZXN0LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCAndGVzdC1wbHVnaW4nLCBbXG5cdFx0XHRtYWtlUmVzb3VyY2VJdGVtKHtcblx0XHRcdFx0bGFiZWw6ICdob29rcycsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ2hvb2snLFxuXHRcdFx0XHRwcm9tcHRQYXRoOiBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdFx0dXJpOiBob29rc1VyaSxcblx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5ob29rLFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkSnNvbihVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ2hvb2tzJywgJ2hvb2tzLmpzb24nKSksIHtcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFNlc3Npb25TdGFydDogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBzdGFydCcgfV0sXG5cdFx0XHRcdFByZVRvb2xVc2U6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gcHJlJyB9XSxcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhwb3J0cyBNQ1Agc2VydmVycyB0byAubWNwLmpzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAnbXktc2VydmVyJyxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnbWNwJyxcblx0XHRcdFx0bWNwU2VydmVyOiB7XG5cdFx0XHRcdFx0Y29sbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0aWQ6ICdjb2wxJyxcblx0XHRcdFx0XHRcdGxhYmVsOiAnVGVzdCBDb2xsZWN0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLlVzZXIsXG5cdFx0XHRcdFx0fSBhcyBJUmVzb3VyY2VUcmVlSXRlbVsnbWNwU2VydmVyJ10gZXh0ZW5kcyB1bmRlZmluZWQgPyBuZXZlciA6IE5vbk51bGxhYmxlPElSZXNvdXJjZVRyZWVJdGVtWydtY3BTZXJ2ZXInXT5bJ2NvbGxlY3Rpb24nXSxcblx0XHRcdFx0XHRkZWZpbml0aW9uOiB7XG5cdFx0XHRcdFx0XHRpZDogJ2RlZjEnLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdteS1zZXJ2ZXInLFxuXHRcdFx0XHRcdFx0bGF1bmNoOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6ICducHgnLFxuXHRcdFx0XHRcdFx0XHRhcmdzOiBbJy15JywgJ215LW1jcC1zZXJ2ZXInXSxcblx0XHRcdFx0XHRcdFx0Y3dkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGVudjoge30sXG5cdFx0XHRcdFx0XHRcdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGNhY2hlTm9uY2U6ICcxJyxcblx0XHRcdFx0XHR9IGFzIElSZXNvdXJjZVRyZWVJdGVtWydtY3BTZXJ2ZXInXSBleHRlbmRzIHVuZGVmaW5lZCA/IG5ldmVyIDogTm9uTnVsbGFibGU8SVJlc291cmNlVHJlZUl0ZW1bJ21jcFNlcnZlciddPlsnZGVmaW5pdGlvbiddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlYWRKc29uKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnLm1jcC5qc29uJykpLCB7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdteS1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnbnB4Jyxcblx0XHRcdFx0XHRhcmdzOiBbJy15JywgJ215LW1jcC1zZXJ2ZXInXSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgbmFtZXNwYWNlIHByZWZpeCBmcm9tIHBsdWdpbiByZXNvdXJjZSBuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkuam9pblBhdGgocm9vdCwgJ3NvdXJjZScsICdydWxlcy5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc291cmNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdjb250ZW50JykpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAnaG9va2lmeTp3cml0aW5nLXJ1bGVzJyxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAnaW5zdHJ1Y3Rpb24nLFxuXHRcdFx0XHRwcm9tcHRQYXRoOiBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdFx0dXJpOiBzb3VyY2VVcmksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHRuYW1lOiAnaG9va2lmeTp3cml0aW5nLXJ1bGVzJyxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ3J1bGVzJywgJ3dyaXRpbmctcnVsZXMuaW5zdHJ1Y3Rpb25zLm1kJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNyZWF0ZSBkaXJlY3RvcmllcyBmb3IgZW1wdHkgcmVzb3VyY2UgdHlwZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW10pO1xuXG5cdFx0YXNzZXJ0Lm9rKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJy5wbHVnaW4nLCAncGx1Z2luLmpzb24nKSkpO1xuXHRcdGFzc2VydC5vayghKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ3J1bGVzJykpKSk7XG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnY29tbWFuZHMnKSkpKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdhZ2VudHMnKSkpKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdza2lsbHMnKSkpKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdob29rcycpKSkpO1xuXHRcdGFzc2VydC5vayghKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJy5tY3AuanNvbicpKSkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdGNvbnN0IHJvb3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tYXJrZXRwbGFjZS10ZXN0JyB9KTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBwcm92aWRlcikpO1xuXHRcdGZpbGVTZXJ2aWNlID0gc2VydmljZTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FkZHMgcGx1Z2luIHRvIGV4aXN0aW5nIG1hcmtldHBsYWNlLmpzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2UgPSB7IG5hbWU6ICdteS1tYXJrZXRwbGFjZScsIHBsdWdpbnM6IFt7IG5hbWU6ICdleGlzdGluZycsIHNvdXJjZTogJy4vZXhpc3RpbmcvJyB9XSB9O1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgocm9vdCwgJ21hcmtldHBsYWNlLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShtYXJrZXRwbGFjZSkpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZU1hcmtldHBsYWNlSWZOZWVkZWQoZmlsZVNlcnZpY2UsIHJvb3QsICduZXctcGx1Z2luJyk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdtYXJrZXRwbGFjZS5qc29uJykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5wbHVnaW5zLCBbXG5cdFx0XHR7IG5hbWU6ICdleGlzdGluZycsIHNvdXJjZTogJy4vZXhpc3RpbmcvJyB9LFxuXHRcdFx0eyBuYW1lOiAnbmV3LXBsdWdpbicsIHNvdXJjZTogJy4vbmV3LXBsdWdpbi8nIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgcGx1Z2lucyBhcnJheSBpZiBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgocm9vdCwgJ21hcmtldHBsYWNlLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICd0ZXN0JyB9KSkpO1xuXG5cdFx0YXdhaXQgdXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZChmaWxlU2VydmljZSwgcm9vdCwgJ215LXBsdWdpbicpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnbWFya2V0cGxhY2UuanNvbicpKTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQucGx1Z2lucywgW1xuXHRcdFx0eyBuYW1lOiAnbXktcGx1Z2luJywgc291cmNlOiAnLi9teS1wbHVnaW4vJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIC5wbHVnaW4vbWFya2V0cGxhY2UuanNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXRwbGFjZSA9IHsgbmFtZTogJ3Rlc3QnLCBwbHVnaW5zOiBbXSB9O1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgocm9vdCwgJy5wbHVnaW4nLCAnbWFya2V0cGxhY2UuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1hcmtldHBsYWNlKSkpO1xuXG5cdFx0YXdhaXQgdXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZChmaWxlU2VydmljZSwgcm9vdCwgJ215LXBsdWdpbicpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnLnBsdWdpbicsICdtYXJrZXRwbGFjZS5qc29uJykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5wbHVnaW5zLCBbXG5cdFx0XHR7IG5hbWU6ICdteS1wbHVnaW4nLCBzb3VyY2U6ICcuL215LXBsdWdpbi8nIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90aGluZyB3aGVuIG5vIG1hcmtldHBsYWNlLmpzb24gZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHVwZGF0ZU1hcmtldHBsYWNlSWZOZWVkZWQoZmlsZVNlcnZpY2UsIHJvb3QsICdteS1wbHVnaW4nKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHJvb3QsICdtYXJrZXRwbGFjZS5qc29uJykpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGR1cGxpY2F0ZSBleGlzdGluZyBwbHVnaW4gZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2UgPSB7IG5hbWU6ICd0ZXN0JywgcGx1Z2luczogW3sgbmFtZTogJ215LXBsdWdpbicsIHNvdXJjZTogJy4vbXktcGx1Z2luLycgfV0gfTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdtYXJrZXRwbGFjZS5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobWFya2V0cGxhY2UpKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVNYXJrZXRwbGFjZUlmTmVlZGVkKGZpbGVTZXJ2aWNlLCByb290LCAnbXktcGx1Z2luJyk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdtYXJrZXRwbGFjZS5qc29uJykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5wbHVnaW5zLCBbXG5cdFx0XHR7IG5hbWU6ICdteS1wbHVnaW4nLCBzb3VyY2U6ICcuL215LXBsdWdpbi8nIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFzQixzQkFBc0I7QUFDNUMsU0FBUyx3QkFBd0IsOEJBQThCO0FBQy9EO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFFUCxTQUFTLGVBQWUsV0FBeUc7QUFDaEksU0FBTztBQUNSO0FBRUEsU0FBUyxpQkFBaUIsV0FBOEc7QUFDdkksU0FBTyxFQUFFLFNBQVMsT0FBTyxHQUFHLFVBQVU7QUFDdkM7QUFFQSxNQUFNLDhCQUE4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
