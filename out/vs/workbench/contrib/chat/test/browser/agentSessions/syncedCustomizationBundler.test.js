import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { SyncedCustomizationBundler } from "../../../browser/agentSessions/agentHost/syncedCustomizationBundler.js";
import { IAgentHostFileSystemService, SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
suite("SyncedCustomizationBundler", () => {
  const disposables = new DisposableStore();
  let fileService;
  let instantiationService;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    const syncedProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, syncedProvider));
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAgentHostFileSystemService, { ensureSyncedCustomizationProvider() {
    } });
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createBundler(authority = "test-agent") {
    return disposables.add(instantiationService.createInstance(SyncedCustomizationBundler, authority));
  }
  async function seedFile(path, content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
    return uri;
  }
  test("returns undefined for empty file list", async () => {
    const bundler = createBundler();
    const result = await bundler.bundle([]);
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when all files have unsupported types", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/hooks.json", "{}");
    const result = await bundler.bundle([{ uri, type: PromptsType.hook }]);
    assert.strictEqual(result, void 0);
  });
  test("bundles instruction files into rules directory", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/my-rules.md", "# My rules\nDo X");
    const result = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.ok(result, "should return a result");
    assert.ok(result.ref.uri, "should have a URI");
    assert.strictEqual(result.ref.name, "VS Code Synced Data");
    assert.ok(result.ref.nonce, "should have a nonce");
    const destUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/my-rules.md" });
    const content = await fileService.readFile(destUri);
    assert.strictEqual(content.value.toString(), "# My rules\nDo X");
  });
  test("bundles files into correct directories by type", async () => {
    const bundler = createBundler();
    const instrUri = await seedFile("/test/rule.md", "rule content");
    const promptUri = await seedFile("/test/cmd.prompt.md", "prompt content");
    const agentUri = await seedFile("/test/my-agent.md", "agent content");
    const skillUri = await seedFile("/test/my-skill.md", "skill content");
    const result = await bundler.bundle([
      { uri: instrUri, type: PromptsType.instructions },
      { uri: promptUri, type: PromptsType.prompt },
      { uri: agentUri, type: PromptsType.agent },
      { uri: skillUri, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const ruleContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/rule.md" }));
    assert.strictEqual(ruleContent.value.toString(), "rule content");
    const cmdContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/commands/cmd.prompt.md" }));
    assert.strictEqual(cmdContent.value.toString(), "prompt content");
    const agentContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/agents/my-agent.md" }));
    assert.strictEqual(agentContent.value.toString(), "agent content");
    const skillContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-skill.md" }));
    assert.strictEqual(skillContent.value.toString(), "skill content");
  });
  test("bundles SKILL.md files into per-skill subdirectories", async () => {
    const bundler = createBundler();
    const skillA = await seedFile("/skills/skill-a/SKILL.md", "skill A content");
    const skillB = await seedFile("/skills/skill-b/SKILL.md", "skill B content");
    const skillC = await seedFile("/skills/my-cool-skill/SKILL.md", "skill C content");
    const result = await bundler.bundle([
      { uri: skillA, type: PromptsType.skill },
      { uri: skillB, type: PromptsType.skill },
      { uri: skillC, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/skill-a/SKILL.md" }));
    assert.strictEqual(contentA.value.toString(), "skill A content");
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/skill-b/SKILL.md" }));
    assert.strictEqual(contentB.value.toString(), "skill B content");
    const contentC = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-cool-skill/SKILL.md" }));
    assert.strictEqual(contentC.value.toString(), "skill C content");
  });
  test("writes plugin manifest", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/file.md", "content");
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const manifestUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/.plugin/plugin.json" });
    const manifest = await fileService.readFile(manifestUri);
    const parsed = JSON.parse(manifest.value.toString());
    assert.strictEqual(parsed.name, "VS Code Synced Data");
  });
  test("nonce is stable for same content", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/stable.md", "same content");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("nonce changes when content changes", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/changing.md", "v1");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    await fileService.writeFile(uri, VSBuffer.fromString("v2"));
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.notStrictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("nonce is order-independent", async () => {
    const bundler = createBundler();
    const uriA = await seedFile("/test/a.md", "A");
    const uriB = await seedFile("/test/b.md", "B");
    const result1 = await bundler.bundle([
      { uri: uriA, type: PromptsType.instructions },
      { uri: uriB, type: PromptsType.instructions }
    ]);
    const result2 = await bundler.bundle([
      { uri: uriB, type: PromptsType.instructions },
      { uri: uriA, type: PromptsType.instructions }
    ]);
    assert.strictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("different authorities do not conflict", async () => {
    const bundlerA = createBundler("agent-a");
    const bundlerB = createBundler("agent-b");
    const uri = await seedFile("/test/shared.md", "shared content");
    await bundlerA.bundle([{ uri, type: PromptsType.instructions }]);
    await bundlerB.bundle([{ uri, type: PromptsType.instructions }]);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/agent-a/rules/shared.md" }));
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/agent-b/rules/shared.md" }));
    assert.strictEqual(contentA.value.toString(), "shared content");
    assert.strictEqual(contentB.value.toString(), "shared content");
  });
  test("lastNonce tracks the most recent bundle", async () => {
    const bundler = createBundler();
    assert.strictEqual(bundler.lastNonce, void 0);
    const uri = await seedFile("/test/track.md", "tracking");
    const result = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(bundler.lastNonce, result.ref.nonce);
  });
  test("SKILL.md files with same basename do not overwrite each other", async () => {
    const bundler = createBundler();
    const skillA = await seedFile("/skills/alpha/SKILL.md", "alpha skill");
    const skillB = await seedFile("/skills/beta/SKILL.md", "beta skill");
    const result = await bundler.bundle([
      { uri: skillA, type: PromptsType.skill },
      { uri: skillB, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/alpha/SKILL.md" }));
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/beta/SKILL.md" }));
    assert.strictEqual(contentA.value.toString(), "alpha skill");
    assert.strictEqual(contentB.value.toString(), "beta skill");
  });
  test("non-SKILL.md skill files are written flat", async () => {
    const bundler = createBundler();
    const skillUri = await seedFile("/test/my-helper.md", "helper skill");
    const result = await bundler.bundle([{ uri: skillUri, type: PromptsType.skill }]);
    assert.ok(result);
    const content = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-helper.md" }));
    assert.strictEqual(content.value.toString(), "helper skill");
  });
  test("mixed SKILL.md and non-SKILL.md skill files coexist", async () => {
    const bundler = createBundler();
    const skillDir = await seedFile("/skills/council-plan/SKILL.md", "council plan");
    const skillFlat = await seedFile("/test/quick-fix.md", "quick fix");
    const result = await bundler.bundle([
      { uri: skillDir, type: PromptsType.skill },
      { uri: skillFlat, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/council-plan/SKILL.md" }));
    assert.strictEqual(contentA.value.toString(), "council plan");
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/quick-fix.md" }));
    assert.strictEqual(contentB.value.toString(), "quick fix");
  });
  test("SKILL.md nonce includes subdirectory path", async () => {
    const bundler = createBundler();
    const skillA = await seedFile("/skills/skill-x/SKILL.md", "same content");
    const skillB = await seedFile("/skills/skill-y/SKILL.md", "same content");
    const resultA = await bundler.bundle([{ uri: skillA, type: PromptsType.skill }]);
    const resultB = await bundler.bundle([{ uri: skillB, type: PromptsType.skill }]);
    assert.notStrictEqual(resultA.ref.nonce, resultB.ref.nonce);
  });
  test("rebundle clears previous tree", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/first.md", "first version");
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const destUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/first.md" });
    const content = await fileService.readFile(destUri);
    assert.strictEqual(content.value.toString(), "first version");
    const uri2 = await seedFile("/test/second.md", "second version");
    await bundler.bundle([{ uri: uri2, type: PromptsType.instructions }]);
    let threw = false;
    try {
      await fileService.readFile(destUri);
    } catch {
      threw = true;
    }
    assert.ok(threw, "old file should have been deleted by rebundle");
    const newContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/second.md" }));
    assert.strictEqual(newContent.value.toString(), "second version");
  });
  test("unchanged rebundle reuses the previous result without touching the tree", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/stable.md", "unchanged content");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.ok(result1);
    const sentinel = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/sentinel.txt" });
    await fileService.writeFile(sentinel, VSBuffer.fromString("keep me"));
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(result2, result1);
    const survived = await fileService.readFile(sentinel);
    assert.strictEqual(survived.value.toString(), "keep me");
  });
  test("changed rebundle deletes the previous tree", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/changing.md", "v1");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.ok(result1);
    const sentinel = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/sentinel.txt" });
    await fileService.writeFile(sentinel, VSBuffer.fromString("remove me"));
    await fileService.writeFile(uri, VSBuffer.fromString("v2"));
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.notStrictEqual(result2, result1);
    assert.notStrictEqual(result2.ref.nonce, result1.ref.nonce);
    let threw = false;
    try {
      await fileService.readFile(sentinel);
    } catch {
      threw = true;
    }
    assert.ok(threw, "sentinel should be deleted when content changes");
  });
  test("unchanged MCP-only rebundle reuses the previous result", async () => {
    const bundler = createBundler();
    const server = { name: "srv", configuration: { type: McpServerType.LOCAL, command: "srv" } };
    const result1 = await bundler.bundle([], [server]);
    assert.ok(result1);
    const sentinel = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/sentinel.txt" });
    await fileService.writeFile(sentinel, VSBuffer.fromString("keep me"));
    const result2 = await bundler.bundle([], [server]);
    assert.strictEqual(result2, result1);
    const survived = await fileService.readFile(sentinel);
    assert.strictEqual(survived.value.toString(), "keep me");
  });
  test("reused rebundle still detects a later content change", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/evolving.md", "v1");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(result2, result1);
    await fileService.writeFile(uri, VSBuffer.fromString("v2"));
    const result3 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.notStrictEqual(result3, result1);
    assert.notStrictEqual(result3.ref.nonce, result1.ref.nonce);
    const written = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/evolving.md" }));
    assert.strictEqual(written.value.toString(), "v2");
  });
  test("lastNonce is unchanged after a reused rebundle", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/stable.md", "unchanged content");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(bundler.lastNonce, result1.ref.nonce);
  });
  test("removing a file from the set rebuilds the tree", async () => {
    const bundler = createBundler();
    const uriA = await seedFile("/test/keep.md", "A");
    const uriB = await seedFile("/test/drop.md", "B");
    await bundler.bundle([
      { uri: uriA, type: PromptsType.instructions },
      { uri: uriB, type: PromptsType.instructions }
    ]);
    await bundler.bundle([{ uri: uriA, type: PromptsType.instructions }]);
    const kept = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/keep.md" }));
    assert.strictEqual(kept.value.toString(), "A");
    let threw = false;
    try {
      await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/drop.md" }));
    } catch {
      threw = true;
    }
    assert.ok(threw, "dropped file should be removed when the file set changes");
  });
  test("changed MCP-only rebundle rewrites .mcp.json", async () => {
    const bundler = createBundler();
    const mcpUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/.mcp.json" });
    await bundler.bundle([], [{ name: "srv", configuration: { type: McpServerType.LOCAL, command: "v1" } }]);
    await bundler.bundle([], [{ name: "srv", configuration: { type: McpServerType.LOCAL, command: "v2" } }]);
    const parsed = JSON.parse((await fileService.readFile(mcpUri)).value.toString());
    assert.deepStrictEqual(parsed, {
      mcpServers: { srv: { type: McpServerType.LOCAL, command: "v2" } }
    });
  });
  test("bundle description includes file count", async () => {
    const bundler = createBundler();
    const uriA = await seedFile("/test/a.md", "A");
    const uriB = await seedFile("/test/b.md", "B");
    const uriC = await seedFile("/test/c.md", "C");
    const result = await bundler.bundle([
      { uri: uriA, type: PromptsType.instructions },
      { uri: uriB, type: PromptsType.agent },
      { uri: uriC, type: PromptsType.prompt }
    ]);
    assert.ok(result);
    assert.ok(result.ref.nonce, "should produce a nonce reflecting the bundled files");
  });
  test("writes MCP servers into .mcp.json", async () => {
    const bundler = createBundler();
    const result = await bundler.bundle([], [
      { name: "my-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"] } }
    ]);
    assert.ok(result, "a bundle with only MCP servers should still produce a result");
    const mcpUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/.mcp.json" });
    const parsed = JSON.parse((await fileService.readFile(mcpUri)).value.toString());
    assert.deepStrictEqual(parsed, {
      mcpServers: { "my-server": { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"] } }
    });
  });
  test("MCP server bundle nonce is stable and order-independent", async () => {
    const bundler = createBundler();
    const a = { name: "a", configuration: { type: McpServerType.LOCAL, command: "a" } };
    const b = { name: "b", configuration: { type: McpServerType.LOCAL, command: "b" } };
    const result1 = await bundler.bundle([], [a, b]);
    const result2 = await bundler.bundle([], [b, a]);
    assert.strictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("MCP server bundle nonce changes when a server changes", async () => {
    const bundler = createBundler();
    const result1 = await bundler.bundle([], [{ name: "srv", configuration: { type: McpServerType.LOCAL, command: "v1" } }]);
    const result2 = await bundler.bundle([], [{ name: "srv", configuration: { type: McpServerType.LOCAL, command: "v2" } }]);
    assert.notStrictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("getOrigin recovers provenance of flattened files by synced URI", async () => {
    const bundler = createBundler();
    const extUri = await seedFile("/ext/rule.md", "ext rule");
    const skillMd = await seedFile("/plugins/my-skill/SKILL.md", "# skill");
    await bundler.bundle([
      { uri: extUri, type: PromptsType.instructions, source: "extension", extensionId: "pub.ext" },
      { uri: skillMd, type: PromptsType.skill, source: "plugin", pluginUri: URI.from({ scheme: Schemas.inMemory, path: "/plugins/my-skill" }) }
    ]);
    const ruleDest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/rule.md" });
    assert.deepStrictEqual(bundler.getOrigin(ruleDest), {
      uri: extUri,
      source: "extension",
      extensionId: "pub.ext",
      pluginUri: void 0
    });
    const skillDest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-skill/SKILL.md" });
    assert.deepStrictEqual(bundler.getOrigin(skillDest), {
      uri: skillMd,
      source: "plugin",
      extensionId: void 0,
      pluginUri: URI.from({ scheme: Schemas.inMemory, path: "/plugins/my-skill" })
    });
    assert.strictEqual(bundler.getOrigin(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/unknown.md" })), void 0);
  });
  test("getOrigin has no entry for files without a source", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/rule.md", "rule");
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const dest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/rule.md" });
    assert.strictEqual(bundler.getOrigin(dest), void 0);
  });
  test("getOrigin map refreshes on each bundle", async () => {
    const bundler = createBundler();
    const first = await seedFile("/test/first.md", "first");
    await bundler.bundle([{ uri: first, type: PromptsType.instructions, source: "extension", extensionId: "pub.first" }]);
    const firstDest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/first.md" });
    assert.ok(bundler.getOrigin(firstDest));
    const second = await seedFile("/test/second.md", "second");
    await bundler.bundle([{ uri: second, type: PromptsType.instructions, source: "plugin" }]);
    assert.strictEqual(bundler.getOrigin(firstDest), void 0);
    assert.ok(bundler.getOrigin(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/second.md" })));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvc3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UsIFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuXG5zdWl0ZSgnU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBtZW1GcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgbWVtRnMpKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBzeW5jZWQtY3VzdG9taXphdGlvbiBzY2hlbWUgdmlhIGEgbW9jayBzZXJ2aWNlXG5cdFx0Y29uc3Qgc3luY2VkUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgc3luY2VkUHJvdmlkZXIpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UsIHsgZW5zdXJlU3luY2VkQ3VzdG9taXphdGlvblByb3ZpZGVyKCkgeyAvKiBhbHJlYWR5IHJlZ2lzdGVyZWQgYWJvdmUgKi8gfSB9KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVCdW5kbGVyKGF1dGhvcml0eSA9ICd0ZXN0LWFnZW50Jyk6IFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLCBhdXRob3JpdHkpKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHNlZWRGaWxlKHBhdGg6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aCB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IGZpbGUgbGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGFsbCBmaWxlcyBoYXZlIHVuc3VwcG9ydGVkIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2hvb2tzLmpzb24nLCAne30nKTtcblx0XHQvLyBIb29rcyBhcmUgbm90IHN1cHBvcnRlZCBieSB0aGUgYnVuZGxlciB5ZXRcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmhvb2sgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1bmRsZXMgaW5zdHJ1Y3Rpb24gZmlsZXMgaW50byBydWxlcyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvbXktcnVsZXMubWQnLCAnIyBNeSBydWxlc1xcbkRvIFgnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnc2hvdWxkIHJldHVybiBhIHJlc3VsdCcpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVmLnVyaSwgJ3Nob3VsZCBoYXZlIGEgVVJJJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZWYubmFtZSwgJ1ZTIENvZGUgU3luY2VkIERhdGEnKTtcblx0XHRhc3NlcnQub2socmVzdWx0LnJlZi5ub25jZSwgJ3Nob3VsZCBoYXZlIGEgbm9uY2UnKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgZmlsZSB3YXMgd3JpdHRlbiB0byB0aGUgaW4tbWVtb3J5IEZTXG5cdFx0Y29uc3QgZGVzdFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9teS1ydWxlcy5tZCcgfSk7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGRlc3RVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICcjIE15IHJ1bGVzXFxuRG8gWCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdidW5kbGVzIGZpbGVzIGludG8gY29ycmVjdCBkaXJlY3RvcmllcyBieSB0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgaW5zdHJVcmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvcnVsZS5tZCcsICdydWxlIGNvbnRlbnQnKTtcblx0XHRjb25zdCBwcm9tcHRVcmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvY21kLnByb21wdC5tZCcsICdwcm9tcHQgY29udGVudCcpO1xuXHRcdGNvbnN0IGFnZW50VXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L215LWFnZW50Lm1kJywgJ2FnZW50IGNvbnRlbnQnKTtcblx0XHRjb25zdCBza2lsbFVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9teS1za2lsbC5tZCcsICdza2lsbCBjb250ZW50Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXG5cdFx0XHR7IHVyaTogaW5zdHJVcmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdFx0eyB1cmk6IHByb21wdFVyaSwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0IH0sXG5cdFx0XHR7IHVyaTogYWdlbnRVcmksIHR5cGU6IFByb21wdHNUeXBlLmFnZW50IH0sXG5cdFx0XHR7IHVyaTogc2tpbGxVcmksIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cblx0XHQvLyBWZXJpZnkgZWFjaCBmaWxlIGxhbmRlZCBpbiB0aGUgY29ycmVjdCBkaXJlY3Rvcnlcblx0XHRjb25zdCBydWxlQ29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9ydWxlLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdydWxlIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IGNtZENvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvY29tbWFuZHMvY21kLnByb21wdC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbWRDb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdwcm9tcHQgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgYWdlbnRDb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L2FnZW50cy9teS1hZ2VudC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudENvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ2FnZW50IGNvbnRlbnQnKTtcblxuXHRcdC8vIE5vbi1TS0lMTC5tZCBza2lsbCBmaWxlcyBhcmUgd3JpdHRlbiBmbGF0XG5cdFx0Y29uc3Qgc2tpbGxDb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9teS1za2lsbC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbENvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ3NraWxsIGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnYnVuZGxlcyBTS0lMTC5tZCBmaWxlcyBpbnRvIHBlci1za2lsbCBzdWJkaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHNraWxsQSA9IGF3YWl0IHNlZWRGaWxlKCcvc2tpbGxzL3NraWxsLWEvU0tJTEwubWQnLCAnc2tpbGwgQSBjb250ZW50Jyk7XG5cdFx0Y29uc3Qgc2tpbGxCID0gYXdhaXQgc2VlZEZpbGUoJy9za2lsbHMvc2tpbGwtYi9TS0lMTC5tZCcsICdza2lsbCBCIGNvbnRlbnQnKTtcblx0XHRjb25zdCBza2lsbEMgPSBhd2FpdCBzZWVkRmlsZSgnL3NraWxscy9teS1jb29sLXNraWxsL1NLSUxMLm1kJywgJ3NraWxsIEMgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW1xuXHRcdFx0eyB1cmk6IHNraWxsQSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRcdHsgdXJpOiBza2lsbEIsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHR7IHVyaTogc2tpbGxDLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0Ly8gRWFjaCBTS0lMTC5tZCBzaG91bGQgYmUgaW4gaXRzIG93biBzdWJkaXJlY3RvcnkgKG5hbWVkIGFmdGVyIHRoZSBwYXJlbnQgZm9sZGVyKVxuXHRcdGNvbnN0IGNvbnRlbnRBID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9za2lsbC1hL1NLSUxMLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRBLnZhbHVlLnRvU3RyaW5nKCksICdza2lsbCBBIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRCID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9za2lsbC1iL1NLSUxMLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRCLnZhbHVlLnRvU3RyaW5nKCksICdza2lsbCBCIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRDID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9teS1jb29sLXNraWxsL1NLSUxMLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRDLnZhbHVlLnRvU3RyaW5nKCksICdza2lsbCBDIGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVzIHBsdWdpbiBtYW5pZmVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9maWxlLm1kJywgJ2NvbnRlbnQnKTtcblxuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblxuXHRcdGNvbnN0IG1hbmlmZXN0VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50Ly5wbHVnaW4vcGx1Z2luLmpzb24nIH0pO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobWFuaWZlc3RVcmkpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UobWFuaWZlc3QudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5uYW1lLCAnVlMgQ29kZSBTeW5jZWQgRGF0YScpO1xuXHR9KTtcblxuXHR0ZXN0KCdub25jZSBpcyBzdGFibGUgZm9yIHNhbWUgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9zdGFibGUubWQnLCAnc2FtZSBjb250ZW50Jyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEhLnJlZi5ub25jZSwgcmVzdWx0MiEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnbm9uY2UgY2hhbmdlcyB3aGVuIGNvbnRlbnQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9jaGFuZ2luZy5tZCcsICd2MScpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd2MicpKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQxIS5yZWYubm9uY2UsIHJlc3VsdDIhLnJlZi5ub25jZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbmNlIGlzIG9yZGVyLWluZGVwZW5kZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpQSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9hLm1kJywgJ0EnKTtcblx0XHRjb25zdCB1cmlCID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2IubWQnLCAnQicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtcblx0XHRcdHsgdXJpOiB1cmlBLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSxcblx0XHRcdHsgdXJpOiB1cmlCLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW1xuXHRcdFx0eyB1cmk6IHVyaUIsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdFx0eyB1cmk6IHVyaUEsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxIS5yZWYubm9uY2UsIHJlc3VsdDIhLnJlZi5ub25jZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmZlcmVudCBhdXRob3JpdGllcyBkbyBub3QgY29uZmxpY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlckEgPSBjcmVhdGVCdW5kbGVyKCdhZ2VudC1hJyk7XG5cdFx0Y29uc3QgYnVuZGxlckIgPSBjcmVhdGVCdW5kbGVyKCdhZ2VudC1iJyk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3NoYXJlZC5tZCcsICdzaGFyZWQgY29udGVudCcpO1xuXG5cdFx0YXdhaXQgYnVuZGxlckEuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRhd2FpdCBidW5kbGVyQi5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0Ly8gQm90aCBzaG91bGQgaGF2ZSB0aGVpciBvd24gY29weVxuXHRcdGNvbnN0IGNvbnRlbnRBID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy9hZ2VudC1hL3J1bGVzL3NoYXJlZC5tZCcgfSkpO1xuXHRcdGNvbnN0IGNvbnRlbnRCID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy9hZ2VudC1iL3J1bGVzL3NoYXJlZC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50QS52YWx1ZS50b1N0cmluZygpLCAnc2hhcmVkIGNvbnRlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudEIudmFsdWUudG9TdHJpbmcoKSwgJ3NoYXJlZCBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3ROb25jZSB0cmFja3MgdGhlIG1vc3QgcmVjZW50IGJ1bmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLmxhc3ROb25jZSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC90cmFjay5tZCcsICd0cmFja2luZycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5sYXN0Tm9uY2UsIHJlc3VsdCEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnU0tJTEwubWQgZmlsZXMgd2l0aCBzYW1lIGJhc2VuYW1lIGRvIG5vdCBvdmVyd3JpdGUgZWFjaCBvdGhlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdC8vIEJvdGggZmlsZXMgaGF2ZSB0aGUgc2FtZSBiYXNlbmFtZSBcIlNLSUxMLm1kXCIgXHUyMDE0IHRoZSBjb2xsaXNpb24gYnVnXG5cdFx0Ly8gY2F1c2VkIGFsbCBza2lsbHMgdG8gb3ZlcndyaXRlIGVhY2ggb3RoZXIgYXQgc2tpbGxzL1NLSUxMLm1kLlxuXHRcdGNvbnN0IHNraWxsQSA9IGF3YWl0IHNlZWRGaWxlKCcvc2tpbGxzL2FscGhhL1NLSUxMLm1kJywgJ2FscGhhIHNraWxsJyk7XG5cdFx0Y29uc3Qgc2tpbGxCID0gYXdhaXQgc2VlZEZpbGUoJy9za2lsbHMvYmV0YS9TS0lMTC5tZCcsICdiZXRhIHNraWxsJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXG5cdFx0XHR7IHVyaTogc2tpbGxBLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdFx0eyB1cmk6IHNraWxsQiwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblxuXHRcdC8vIEJvdGggc2hvdWxkIGJlIHByZXNlcnZlZCBpbiBzZXBhcmF0ZSBzdWJkaXJlY3Rvcmllc1xuXHRcdGNvbnN0IGNvbnRlbnRBID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9hbHBoYS9TS0lMTC5tZCcgfSkpO1xuXHRcdGNvbnN0IGNvbnRlbnRCID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9iZXRhL1NLSUxMLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRBLnZhbHVlLnRvU3RyaW5nKCksICdhbHBoYSBza2lsbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50Qi52YWx1ZS50b1N0cmluZygpLCAnYmV0YSBza2lsbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdub24tU0tJTEwubWQgc2tpbGwgZmlsZXMgYXJlIHdyaXR0ZW4gZmxhdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHNraWxsVXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L215LWhlbHBlci5tZCcsICdoZWxwZXIgc2tpbGwnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaTogc2tpbGxVcmksIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH1dKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblxuXHRcdC8vIE5vbi1TS0lMTC5tZCBmaWxlcyBnbyBkaXJlY3RseSB1bmRlciBza2lsbHMvIHdpdGhvdXQgc3ViZGlyZWN0b3J5XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9za2lsbHMvbXktaGVscGVyLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ2hlbHBlciBza2lsbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaXhlZCBTS0lMTC5tZCBhbmQgbm9uLVNLSUxMLm1kIHNraWxsIGZpbGVzIGNvZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBza2lsbERpciA9IGF3YWl0IHNlZWRGaWxlKCcvc2tpbGxzL2NvdW5jaWwtcGxhbi9TS0lMTC5tZCcsICdjb3VuY2lsIHBsYW4nKTtcblx0XHRjb25zdCBza2lsbEZsYXQgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvcXVpY2stZml4Lm1kJywgJ3F1aWNrIGZpeCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW1xuXHRcdFx0eyB1cmk6IHNraWxsRGlyLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdFx0eyB1cmk6IHNraWxsRmxhdCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblxuXHRcdGNvbnN0IGNvbnRlbnRBID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9jb3VuY2lsLXBsYW4vU0tJTEwubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudEEudmFsdWUudG9TdHJpbmcoKSwgJ2NvdW5jaWwgcGxhbicpO1xuXG5cdFx0Y29uc3QgY29udGVudEIgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL3F1aWNrLWZpeC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50Qi52YWx1ZS50b1N0cmluZygpLCAncXVpY2sgZml4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NLSUxMLm1kIG5vbmNlIGluY2x1ZGVzIHN1YmRpcmVjdG9yeSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Ly8gVHdvIHNraWxscyB3aXRoIHNhbWUgY29udGVudCBidXQgZGlmZmVyZW50IHBhcmVudCBkaXJzIHNob3VsZCBwcm9kdWNlXG5cdFx0Ly8gZGlmZmVyZW50IG5vbmNlcyBiZWNhdXNlIHRoZWlyIGhhc2gga2V5cyBpbmNsdWRlIHRoZSBzdWJkaXJlY3RvcnkuXG5cdFx0Y29uc3Qgc2tpbGxBID0gYXdhaXQgc2VlZEZpbGUoJy9za2lsbHMvc2tpbGwteC9TS0lMTC5tZCcsICdzYW1lIGNvbnRlbnQnKTtcblx0XHRjb25zdCBza2lsbEIgPSBhd2FpdCBzZWVkRmlsZSgnL3NraWxscy9za2lsbC15L1NLSUxMLm1kJywgJ3NhbWUgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0QSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaTogc2tpbGxBLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9XSk7XG5cdFx0Y29uc3QgcmVzdWx0QiA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaTogc2tpbGxCLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9XSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdEEhLnJlZi5ub25jZSwgcmVzdWx0QiEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVidW5kbGUgY2xlYXJzIHByZXZpb3VzIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvZmlyc3QubWQnLCAnZmlyc3QgdmVyc2lvbicpO1xuXG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBmaXJzdCBmaWxlIGV4aXN0c1xuXHRcdGNvbnN0IGRlc3RVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvZmlyc3QubWQnIH0pO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShkZXN0VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnZmlyc3QgdmVyc2lvbicpO1xuXG5cdFx0Ly8gUmUtYnVuZGxlIHdpdGggYSBkaWZmZXJlbnQgZmlsZSBcdTIwMTQgb2xkIGZpbGUgc2hvdWxkIGJlIGdvbmVcblx0XHRjb25zdCB1cmkyID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3NlY29uZC5tZCcsICdzZWNvbmQgdmVyc2lvbicpO1xuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaTogdXJpMiwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblxuXHRcdGxldCB0aHJldyA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShkZXN0VXJpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRocmV3ID0gdHJ1ZTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKHRocmV3LCAnb2xkIGZpbGUgc2hvdWxkIGhhdmUgYmVlbiBkZWxldGVkIGJ5IHJlYnVuZGxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3J1bGVzL3NlY29uZC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdDb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdzZWNvbmQgdmVyc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmNoYW5nZWQgcmVidW5kbGUgcmV1c2VzIHRoZSBwcmV2aW91cyByZXN1bHQgd2l0aG91dCB0b3VjaGluZyB0aGUgdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9zdGFibGUubWQnLCAndW5jaGFuZ2VkIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdDEpO1xuXG5cdFx0Ly8gRHJvcCBhIHNlbnRpbmVsIGZpbGUgaW50byB0aGUgdHJlZS4gQSBkZXN0cnVjdGl2ZSByZWJ1bmRsZSB3b3VsZCB3aXBlIGl0O1xuXHRcdC8vIGEgc2tpcHBlZCByZWJ1bmRsZSBsZWF2ZXMgaXQgdW50b3VjaGVkLlxuXHRcdGNvbnN0IHNlbnRpbmVsID0gVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NlbnRpbmVsLnR4dCcgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNlbnRpbmVsLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdrZWVwIG1lJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblxuXHRcdC8vIFRoZSBleGFjdCBzYW1lIHJlc3VsdCBvYmplY3QgaXMgcmV0dXJuZWQgYW5kIHRoZSBzZW50aW5lbCBzdXJ2aXZlcyxcblx0XHQvLyBwcm92aW5nIHRoZSBkZWxldGUgKyByZXdyaXRlIHdhcyBza2lwcGVkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLCByZXN1bHQxKTtcblx0XHRjb25zdCBzdXJ2aXZlZCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNlbnRpbmVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vydml2ZWQudmFsdWUudG9TdHJpbmcoKSwgJ2tlZXAgbWUnKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlZCByZWJ1bmRsZSBkZWxldGVzIHRoZSBwcmV2aW91cyB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2NoYW5naW5nLm1kJywgJ3YxJyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQxKTtcblxuXHRcdC8vIFNlbnRpbmVsIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiB0aGUgdHJlZSBpcyByZWJ1aWx0LlxuXHRcdGNvbnN0IHNlbnRpbmVsID0gVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NlbnRpbmVsLnR4dCcgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNlbnRpbmVsLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdyZW1vdmUgbWUnKSk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd2MicpKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0Ly8gQSBmcmVzaCByZXN1bHQgaXMgcHJvZHVjZWQgYW5kIHRoZSBzZW50aW5lbCBpcyBnb25lLlxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQyLCByZXN1bHQxKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0MiEucmVmLm5vbmNlLCByZXN1bHQxLnJlZi5ub25jZSk7XG5cdFx0bGV0IHRocmV3ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNlbnRpbmVsKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRocmV3ID0gdHJ1ZTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKHRocmV3LCAnc2VudGluZWwgc2hvdWxkIGJlIGRlbGV0ZWQgd2hlbiBjb250ZW50IGNoYW5nZXMnKTtcblx0fSk7XG5cblx0dGVzdCgndW5jaGFuZ2VkIE1DUC1vbmx5IHJlYnVuZGxlIHJldXNlcyB0aGUgcHJldmlvdXMgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3Qgc2VydmVyID0geyBuYW1lOiAnc3J2JywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnc3J2JyB9IH0gYXMgY29uc3Q7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtzZXJ2ZXJdKTtcblx0XHRhc3NlcnQub2socmVzdWx0MSk7XG5cblx0XHRjb25zdCBzZW50aW5lbCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9zZW50aW5lbC50eHQnIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZW50aW5lbCwgVlNCdWZmZXIuZnJvbVN0cmluZygna2VlcCBtZScpKTtcblxuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW3NlcnZlcl0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIsIHJlc3VsdDEpO1xuXHRcdGNvbnN0IHN1cnZpdmVkID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoc2VudGluZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXJ2aXZlZC52YWx1ZS50b1N0cmluZygpLCAna2VlcCBtZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZWQgcmVidW5kbGUgc3RpbGwgZGV0ZWN0cyBhIGxhdGVyIGNvbnRlbnQgY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2V2b2x2aW5nLm1kJywgJ3YxJyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdC8vIFNlY29uZCBidW5kbGUgaXMgaWRlbnRpY2FsIGFuZCBzaG91bGQgYmUgcmV1c2VkIChza2lwIHBhdGgpLlxuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIsIHJlc3VsdDEpO1xuXG5cdFx0Ly8gQSBjaGFuZ2UgYWZ0ZXIgYSByZXVzZWQgcmVidW5kbGUgbXVzdCBzdGlsbCB0cmlnZ2VyIGEgcmVidWlsZCBcdTIwMTQgdGhlXG5cdFx0Ly8gcmV1c2UgcGF0aCBtdXN0IG5vdCBwb2lzb24gdGhlIGNhY2hlZCBub25jZS9yZXN1bHQuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygndjInKSk7XG5cdFx0Y29uc3QgcmVzdWx0MyA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQzLCByZXN1bHQxKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0MyEucmVmLm5vbmNlLCByZXN1bHQxIS5yZWYubm9uY2UpO1xuXHRcdGNvbnN0IHdyaXR0ZW4gPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvZXZvbHZpbmcubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JpdHRlbi52YWx1ZS50b1N0cmluZygpLCAndjInKTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdE5vbmNlIGlzIHVuY2hhbmdlZCBhZnRlciBhIHJldXNlZCByZWJ1bmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9zdGFibGUubWQnLCAndW5jaGFuZ2VkIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIubGFzdE5vbmNlLCByZXN1bHQxIS5yZWYubm9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmluZyBhIGZpbGUgZnJvbSB0aGUgc2V0IHJlYnVpbGRzIHRoZSB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpQSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9rZWVwLm1kJywgJ0EnKTtcblx0XHRjb25zdCB1cmlCID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2Ryb3AubWQnLCAnQicpO1xuXG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW1xuXHRcdFx0eyB1cmk6IHVyaUEsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdFx0eyB1cmk6IHVyaUIsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdF0pO1xuXG5cdFx0Ly8gUmUtYnVuZGxlIHdpdGggb25seSB0aGUgZmlyc3QgZmlsZSBcdTIwMTQgdGhlIGRyb3BwZWQgZmlsZSBzaG91bGQgYmUgZ29uZS5cblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmk6IHVyaUEsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cblx0XHRjb25zdCBrZXB0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3J1bGVzL2tlZXAubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2VwdC52YWx1ZS50b1N0cmluZygpLCAnQScpO1xuXG5cdFx0bGV0IHRocmV3ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9kcm9wLm1kJyB9KSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aHJldyA9IHRydWU7XG5cdFx0fVxuXHRcdGFzc2VydC5vayh0aHJldywgJ2Ryb3BwZWQgZmlsZSBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIHRoZSBmaWxlIHNldCBjaGFuZ2VzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZWQgTUNQLW9ubHkgcmVidW5kbGUgcmV3cml0ZXMgLm1jcC5qc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50Ly5tY3AuanNvbicgfSk7XG5cblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW3sgbmFtZTogJ3NydicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ3YxJyB9IH1dKTtcblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW3sgbmFtZTogJ3NydicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ3YyJyB9IH1dKTtcblxuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFVyaSkpLnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7IHNydjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAndjInIH0gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVuZGxlIGRlc2NyaXB0aW9uIGluY2x1ZGVzIGZpbGUgY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmlBID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2EubWQnLCAnQScpO1xuXHRcdGNvbnN0IHVyaUIgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvYi5tZCcsICdCJyk7XG5cdFx0Y29uc3QgdXJpQyA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9jLm1kJywgJ0MnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtcblx0XHRcdHsgdXJpOiB1cmlBLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSxcblx0XHRcdHsgdXJpOiB1cmlCLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHVyaUMsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVmLm5vbmNlLCAnc2hvdWxkIHByb2R1Y2UgYSBub25jZSByZWZsZWN0aW5nIHRoZSBidW5kbGVkIGZpbGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlcyBNQ1Agc2VydmVycyBpbnRvIC5tY3AuanNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtcblx0XHRcdHsgbmFtZTogJ215LXNlcnZlcicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1mbGFnJ10gfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdhIGJ1bmRsZSB3aXRoIG9ubHkgTUNQIHNlcnZlcnMgc2hvdWxkIHN0aWxsIHByb2R1Y2UgYSByZXN1bHQnKTtcblxuXHRcdGNvbnN0IG1jcFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC8ubWNwLmpzb24nIH0pO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1jcFVyaSkpLnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7ICdteS1zZXJ2ZXInOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdteS1zZXJ2ZXInLCBhcmdzOiBbJy0tZmxhZyddIH0gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlciBidW5kbGUgbm9uY2UgaXMgc3RhYmxlIGFuZCBvcmRlci1pbmRlcGVuZGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IGEgPSB7IG5hbWU6ICdhJywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnYScgfSB9IGFzIGNvbnN0O1xuXHRcdGNvbnN0IGIgPSB7IG5hbWU6ICdiJywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnYicgfSB9IGFzIGNvbnN0O1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtdLCBbYSwgYl0pO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW2IsIGFdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MSEucmVmLm5vbmNlLCByZXN1bHQyIS5yZWYubm9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdNQ1Agc2VydmVyIGJ1bmRsZSBub25jZSBjaGFuZ2VzIHdoZW4gYSBzZXJ2ZXIgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW3sgbmFtZTogJ3NydicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ3YxJyB9IH1dKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFt7IG5hbWU6ICdzcnYnLCBjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICd2MicgfSB9XSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDEhLnJlZi5ub25jZSwgcmVzdWx0MiEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0T3JpZ2luIHJlY292ZXJzIHByb3ZlbmFuY2Ugb2YgZmxhdHRlbmVkIGZpbGVzIGJ5IHN5bmNlZCBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBleHRVcmkgPSBhd2FpdCBzZWVkRmlsZSgnL2V4dC9ydWxlLm1kJywgJ2V4dCBydWxlJyk7XG5cdFx0Y29uc3Qgc2tpbGxNZCA9IGF3YWl0IHNlZWRGaWxlKCcvcGx1Z2lucy9teS1za2lsbC9TS0lMTC5tZCcsICcjIHNraWxsJyk7XG5cblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbXG5cdFx0XHR7IHVyaTogZXh0VXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHNvdXJjZTogJ2V4dGVuc2lvbicsIGV4dGVuc2lvbklkOiAncHViLmV4dCcgfSxcblx0XHRcdHsgdXJpOiBza2lsbE1kLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgc291cmNlOiAncGx1Z2luJywgcGx1Z2luVXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9wbHVnaW5zL215LXNraWxsJyB9KSB9LFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcnVsZURlc3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvcnVsZS5tZCcgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLmdldE9yaWdpbihydWxlRGVzdCksIHtcblx0XHRcdHVyaTogZXh0VXJpLFxuXHRcdFx0c291cmNlOiAnZXh0ZW5zaW9uJyxcblx0XHRcdGV4dGVuc2lvbklkOiAncHViLmV4dCcsXG5cdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdC8vIFNraWxscyBwcmVzZXJ2ZSB0aGVpciBkaXJlY3Rvcnk6IHNraWxscy97c2tpbGxOYW1lfS9TS0lMTC5tZC5cblx0XHRjb25zdCBza2lsbERlc3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIuZ2V0T3JpZ2luKHNraWxsRGVzdCksIHtcblx0XHRcdHVyaTogc2tpbGxNZCxcblx0XHRcdHNvdXJjZTogJ3BsdWdpbicsXG5cdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0cGx1Z2luVXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9wbHVnaW5zL215LXNraWxsJyB9KSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLmdldE9yaWdpbihVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvdW5rbm93bi5tZCcgfSkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPcmlnaW4gaGFzIG5vIGVudHJ5IGZvciBmaWxlcyB3aXRob3V0IGEgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3J1bGUubWQnLCAncnVsZScpO1xuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRjb25zdCBkZXN0ID0gVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3J1bGVzL3J1bGUubWQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLmdldE9yaWdpbihkZXN0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0T3JpZ2luIG1hcCByZWZyZXNoZXMgb24gZWFjaCBidW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9maXJzdC5tZCcsICdmaXJzdCcpO1xuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaTogZmlyc3QsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgc291cmNlOiAnZXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6ICdwdWIuZmlyc3QnIH1dKTtcblx0XHRjb25zdCBmaXJzdERlc3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvZmlyc3QubWQnIH0pO1xuXHRcdGFzc2VydC5vayhidW5kbGVyLmdldE9yaWdpbihmaXJzdERlc3QpKTtcblxuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9zZWNvbmQubWQnLCAnc2Vjb25kJyk7XG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiBzZWNvbmQsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgc291cmNlOiAncGx1Z2luJyB9XSk7XG5cdFx0Ly8gVGhlIHByZXZpb3VzIGZpbGUgaXMgbm8gbG9uZ2VyIHBhcnQgb2YgdGhlIGJ1bmRsZSwgc28gaXRzIG9yaWdpbiBpcyBnb25lLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLmdldE9yaWdpbihmaXJzdERlc3QpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhidW5kbGVyLmdldE9yaWdpbihVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvc2Vjb25kLm1kJyB9KSkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDZCQUE2QixtQ0FBbUM7QUFDekUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFFN0IsTUFBTSw4QkFBOEIsTUFBTTtBQUV6QyxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDbkUsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDO0FBQzlELGdCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxV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
