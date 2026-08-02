import assert from "assert";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentCustomizationContentExpander } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationContentExpander.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { mockFiles } from "../../../test/common/promptSyntax/testUtils/mockFilesystem.js";
import { AICustomizationSources } from "../../../common/aiCustomizationWorkspaceService.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
const REMOTE_HOST_GROUP = "remote-host";
const REMOTE_CLIENT_GROUP = "remote-client";
function expand(expander, pluginUri, groupKey, isBundleItem, source, token, pluginLabel) {
  return expander.expandPluginContents(pluginUri, groupKey, isBundleItem, source, pluginLabel, token);
}
suite("AgentCustomizationContentExpander", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileService;
  setup(() => {
    const fs = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fs.registerProvider(Schemas.file, provider));
    fileService = fs;
  });
  suite("expandPluginContents \u2013 skills", () => {
    test("emits one item per subfolder that has a SKILL.md, skips folders without one", async () => {
      const pluginRoot = URI.file("/plugins/my-plugin");
      await mockFiles(fileService, [
        // valid skill folder with frontmatter name + description
        {
          path: "/plugins/my-plugin/skills/my-lint/SKILL.md",
          contents: [
            "---",
            "name: Lint",
            "description: Runs linting",
            "---",
            "",
            "# Body"
          ]
        },
        // skill folder missing SKILL.md → should be skipped
        {
          path: "/plugins/my-plugin/skills/broken/README.md",
          contents: [
            "no frontmatter"
          ]
        },
        // dotfile folder → should be skipped
        {
          path: "/plugins/my-plugin/skills/.hidden/SKILL.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => ({ type: i.type, name: i.name, description: i.description })), [
        { type: PromptsType.skill, name: "Lint", description: "Runs linting" }
      ]);
    });
    test("uses folder name as fallback when SKILL.md has no name frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/p");
      await mockFiles(fileService, [
        // SKILL.md exists but has no name/description
        {
          path: "/plugins/p/skills/unnamed-skill/SKILL.md",
          contents: [
            "---",
            "---",
            "",
            "# Content"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, "unnamed-skill");
      assert.strictEqual(items[0].description, void 0);
    });
    test("rewrites skill folder URI to point at SKILL.md", async () => {
      const pluginRoot = URI.file("/plugins/q");
      await mockFiles(fileService, [
        {
          path: "/plugins/q/skills/my-skill/SKILL.md",
          contents: [
            "---",
            "name: My Skill",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.strictEqual(items.length, 1);
      assert.ok(items[0].uri.path.endsWith("/SKILL.md"), `expected SKILL.md URI, got ${items[0].uri}`);
    });
    test("userInvocable is surfaced from SKILL.md frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/r");
      await mockFiles(fileService, [
        {
          path: "/plugins/r/skills/invocable/SKILL.md",
          contents: [
            "---",
            "name: Invocable",
            "user-invocable: true",
            "---"
          ]
        },
        {
          path: "/plugins/r/skills/silent/SKILL.md",
          contents: [
            "---",
            "name: Silent",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const invocable = items.find((i) => i.name === "Invocable");
      const silent = items.find((i) => i.name === "Silent");
      assert.ok(invocable, "should have invocable item");
      assert.ok(silent, "should have silent item");
      assert.strictEqual(invocable.userInvocable, true);
      assert.strictEqual(silent.userInvocable, void 0);
    });
    test("flat non-directory entries in skills/ are ignored", async () => {
      const pluginRoot = URI.file("/plugins/s");
      await mockFiles(fileService, [
        // flat file alongside a proper skill folder — flat files are no longer supported
        {
          path: "/plugins/s/skills/flat.skill.md",
          contents: [
            "---",
            "name: Flat",
            "---"
          ]
        },
        {
          path: "/plugins/s/skills/folder-skill/SKILL.md",
          contents: [
            "---",
            "name: Folder Skill",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => i.name), ["Folder Skill"]);
    });
  });
  suite("expandPluginContents \u2013 agents", () => {
    test("emits one item per .md file with name/description/userInvocable from frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/agents-plugin");
      await mockFiles(fileService, [
        {
          path: "/plugins/agents-plugin/agents/my-agent.agent.md",
          contents: [
            "---",
            "name: My Agent",
            "description: Does things",
            "user-invocable: true",
            "---"
          ]
        },
        {
          path: "/plugins/agents-plugin/agents/other.agent.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const agentItems = items.filter((i) => i.type === PromptsType.agent);
      assert.deepStrictEqual(
        agentItems.map((i) => ({ name: i.name, description: i.description, userInvocable: i.userInvocable })).sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "My Agent", description: "Does things", userInvocable: true },
          { name: "other", description: void 0, userInvocable: void 0 }
        ]
      );
    });
    test("non-.md files in agents/ are ignored", async () => {
      const pluginRoot = URI.file("/plugins/agents-filter");
      await mockFiles(fileService, [
        {
          path: "/plugins/agents-filter/agents/valid.agent.md",
          contents: [
            "---",
            "name: Valid",
            "---"
          ]
        },
        {
          path: "/plugins/agents-filter/agents/ignored.json",
          contents: [
            "{}"
          ]
        },
        {
          path: "/plugins/agents-filter/agents/ignored.txt",
          contents: [
            "text"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const agentItems = items.filter((i) => i.type === PromptsType.agent);
      assert.deepStrictEqual(agentItems.map((i) => i.name), ["Valid"]);
    });
    test("directories in agents/ are ignored", async () => {
      const pluginRoot = URI.file("/plugins/agents-no-dirs");
      await mockFiles(fileService, [
        {
          path: "/plugins/agents-no-dirs/agents/nested/some.agent.md",
          contents: [
            "---",
            "name: Nested",
            "---"
          ]
        },
        {
          path: "/plugins/agents-no-dirs/agents/flat.agent.md",
          contents: [
            "---",
            "name: Flat",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const agentItems = items.filter((i) => i.type === PromptsType.agent);
      assert.deepStrictEqual(agentItems.map((i) => i.name), ["Flat"]);
    });
  });
  suite("expandPluginContents \u2013 rules", () => {
    test("emits one item per .md file with name/description from frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/rules-plugin");
      await mockFiles(fileService, [
        {
          path: "/plugins/rules-plugin/rules/style.instructions.md",
          contents: [
            "---",
            "name: Style Guide",
            "description: Enforces style",
            "---"
          ]
        },
        {
          path: "/plugins/rules-plugin/rules/noname.instructions.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const ruleItems = items.filter((i) => i.type === PromptsType.instructions);
      assert.deepStrictEqual(
        ruleItems.map((i) => ({ name: i.name, description: i.description })).sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "Style Guide", description: "Enforces style" },
          { name: "noname", description: void 0 }
        ].sort((a, b) => a.name.localeCompare(b.name))
      );
    });
    test("userInvocable is NOT surfaced for rules", async () => {
      const pluginRoot = URI.file("/plugins/rules-no-invocable");
      await mockFiles(fileService, [
        {
          path: "/plugins/rules-no-invocable/rules/rule.instructions.md",
          contents: [
            "---",
            "name: My Rule",
            "user-invocable: true",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const ruleItems = items.filter((i) => i.type === PromptsType.instructions);
      assert.strictEqual(ruleItems.length, 1);
      assert.strictEqual(ruleItems[0].userInvocable, void 0, "rules must not expose userInvocable");
    });
    test("emits one item per .mdc file per the Open Plugins spec", async () => {
      const pluginRoot = URI.file("/plugins/rules-mdc");
      await mockFiles(fileService, [
        { path: "/plugins/rules-mdc/rules/style.mdc", contents: ["Some rule content"] },
        { path: "/plugins/rules-mdc/rules/other.mdc", contents: ["Another rule"] },
        // `.txt` and similar must still be ignored
        { path: "/plugins/rules-mdc/rules/readme.txt", contents: ["not a rule"] }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const ruleItems = items.filter((i) => i.type === PromptsType.instructions);
      assert.deepStrictEqual(
        ruleItems.map((i) => i.name).sort(),
        ["other", "style"]
      );
    });
  });
  suite("expandPluginContents \u2013 commands", () => {
    test("emits one item per .md file, name from filename (no frontmatter parsing)", async () => {
      const pluginRoot = URI.file("/plugins/cmds-plugin");
      await mockFiles(fileService, [
        {
          path: "/plugins/cmds-plugin/commands/fix.prompt.md",
          contents: [
            "---",
            "name: Fix It",
            "---",
            "Fix the code"
          ]
        },
        {
          path: "/plugins/cmds-plugin/commands/review.prompt.md",
          contents: [
            "# Review"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const cmdItems = items.filter((i) => i.type === PromptsType.prompt);
      assert.deepStrictEqual(
        cmdItems.map((i) => i.name).sort(),
        ["fix", "review"]
      );
      for (const cmd of cmdItems) {
        assert.strictEqual(cmd.description, void 0);
        assert.strictEqual(cmd.userInvocable, void 0);
      }
    });
  });
  suite("expandPluginContents \u2013 mixed plugin", () => {
    test("all four folder types are discovered and returned together", async () => {
      const pluginRoot = URI.file("/plugins/mixed");
      await mockFiles(fileService, [
        {
          path: "/plugins/mixed/agents/bot.agent.md",
          contents: [
            "---",
            "name: Bot",
            "---"
          ]
        },
        {
          path: "/plugins/mixed/skills/linter/SKILL.md",
          contents: [
            "---",
            "name: Linter",
            "---"
          ]
        },
        {
          path: "/plugins/mixed/commands/fix.prompt.md",
          contents: [
            "# Fix"
          ]
        },
        {
          path: "/plugins/mixed/rules/style.instructions.md",
          contents: [
            "---",
            "name: Style",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const byType = (t) => items.filter((i) => i.type === t).map((i) => i.name);
      assert.deepStrictEqual(byType(PromptsType.agent), ["Bot"]);
      assert.deepStrictEqual(byType(PromptsType.skill), ["Linter"]);
      assert.deepStrictEqual(byType(PromptsType.prompt), ["fix"]);
      assert.deepStrictEqual(byType(PromptsType.instructions), ["Style"]);
    });
  });
  suite("expandPluginContents \u2013 groupKey and pluginUri", () => {
    test("all child items carry the groupKey passed to expand", async () => {
      const pluginRoot = URI.file("/plugins/gk");
      await mockFiles(fileService, [
        {
          path: "/plugins/gk/agents/a.agent.md",
          contents: [
            "---",
            "---"
          ]
        },
        {
          path: "/plugins/gk/skills/s/SKILL.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_CLIENT_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      for (const item of items) {
        assert.strictEqual(item.groupKey, REMOTE_CLIENT_GROUP, `item ${item.name} should carry remote-client groupKey`);
      }
    });
    test("isBundleItem=true clears pluginUri and pluginLabel on child items", async () => {
      const pluginRoot = URI.file("/plugins/bundle");
      await mockFiles(fileService, [
        {
          path: "/plugins/bundle/skills/bs/SKILL.md",
          contents: [
            "---",
            "name: Bundle Skill",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const bundleItems = await expand(expander, pluginRoot, REMOTE_CLIENT_GROUP, true, AICustomizationSources.plugin, CancellationToken.None, "bundle-plugin");
      for (const item of bundleItems) {
        assert.deepStrictEqual({ pluginUri: item.pluginUri, pluginLabel: item.pluginLabel }, { pluginUri: void 0, pluginLabel: void 0 }, `bundle item ${item.name} must have no plugin provenance`);
      }
    });
    test("isBundleItem=false sets pluginUri and pluginLabel on child items", async () => {
      const pluginRoot = URI.file("/plugins/with-uri");
      await mockFiles(fileService, [
        {
          path: "/plugins/with-uri/skills/sk/SKILL.md",
          contents: [
            "---",
            "name: Sk",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None, "Datadog");
      assert.strictEqual(items.length, 1);
      assert.deepStrictEqual({ pluginUri: items[0].pluginUri?.toString(), pluginLabel: items[0].pluginLabel }, { pluginUri: pluginRoot.toString(), pluginLabel: "Datadog" });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50SG9zdC9hZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IG1vY2tGaWxlcyB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC90ZXN0VXRpbHMvbW9ja0ZpbGVzeXN0ZW0uanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uU291cmNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbmNvbnN0IFJFTU9URV9IT1NUX0dST1VQID0gJ3JlbW90ZS1ob3N0JztcbmNvbnN0IFJFTU9URV9DTElFTlRfR1JPVVAgPSAncmVtb3RlLWNsaWVudCc7XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gSGVscGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGV4cGFuZChleHBhbmRlcjogQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyLCBwbHVnaW5Vcmk6IFVSSSwgZ3JvdXBLZXk6IHN0cmluZywgaXNCdW5kbGVJdGVtOiBib29sZWFuLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBwbHVnaW5MYWJlbD86IHN0cmluZyk6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0cmV0dXJuIGV4cGFuZGVyLmV4cGFuZFBsdWdpbkNvbnRlbnRzKHBsdWdpblVyaSwgZ3JvdXBLZXksIGlzQnVuZGxlSXRlbSwgc291cmNlLCBwbHVnaW5MYWJlbCwgdG9rZW4pO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFN1aXRlXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc3VpdGUoJ0FnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmcy5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgcHJvdmlkZXIpKTtcblx0XHRmaWxlU2VydmljZSA9IGZzO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTQgc2tpbGxzIGZvbGRlclxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTMgc2tpbGxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2VtaXRzIG9uZSBpdGVtIHBlciBzdWJmb2xkZXIgdGhhdCBoYXMgYSBTS0lMTC5tZCwgc2tpcHMgZm9sZGVycyB3aXRob3V0IG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbXktcGx1Z2luJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gdmFsaWQgc2tpbGwgZm9sZGVyIHdpdGggZnJvbnRtYXR0ZXIgbmFtZSArIGRlc2NyaXB0aW9uXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbXktcGx1Z2luL3NraWxscy9teS1saW50L1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IExpbnQnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSdW5zIGxpbnRpbmcnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdCcjIEJvZHknLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gc2tpbGwgZm9sZGVyIG1pc3NpbmcgU0tJTEwubWQgXHUyMTkyIHNob3VsZCBiZSBza2lwcGVkXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbXktcGx1Z2luL3NraWxscy9icm9rZW4vUkVBRE1FLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCdubyBmcm9udG1hdHRlcicsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBkb3RmaWxlIGZvbGRlciBcdTIxOTIgc2hvdWxkIGJlIHNraXBwZWRcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9teS1wbHVnaW4vc2tpbGxzLy5oaWRkZW4vU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gKHsgdHlwZTogaS50eXBlLCBuYW1lOiBpLm5hbWUsIGRlc2NyaXB0aW9uOiBpLmRlc2NyaXB0aW9uIH0pKSwgW1xuXHRcdFx0XHR7IHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnTGludCcsIGRlc2NyaXB0aW9uOiAnUnVucyBsaW50aW5nJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGZvbGRlciBuYW1lIGFzIGZhbGxiYWNrIHdoZW4gU0tJTEwubWQgaGFzIG5vIG5hbWUgZnJvbnRtYXR0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3AnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHQvLyBTS0lMTC5tZCBleGlzdHMgYnV0IGhhcyBubyBuYW1lL2Rlc2NyaXB0aW9uXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvcC9za2lsbHMvdW5uYW1lZC1za2lsbC9TS0lMTC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHQnIyBDb250ZW50Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5uYW1lLCAndW5uYW1lZC1za2lsbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLmRlc2NyaXB0aW9uLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV3cml0ZXMgc2tpbGwgZm9sZGVyIFVSSSB0byBwb2ludCBhdCBTS0lMTC5tZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvcScpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvcS9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogTXkgU2tpbGwnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soaXRlbXNbMF0udXJpLnBhdGguZW5kc1dpdGgoJy9TS0lMTC5tZCcpLCBgZXhwZWN0ZWQgU0tJTEwubWQgVVJJLCBnb3QgJHtpdGVtc1swXS51cml9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VySW52b2NhYmxlIGlzIHN1cmZhY2VkIGZyb20gU0tJTEwubWQgZnJvbnRtYXR0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3InKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3Ivc2tpbGxzL2ludm9jYWJsZS9TS0lMTC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBJbnZvY2FibGUnLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9yL3NraWxscy9zaWxlbnQvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogU2lsZW50Jyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGludm9jYWJsZSA9IGl0ZW1zLmZpbmQoaSA9PiBpLm5hbWUgPT09ICdJbnZvY2FibGUnKTtcblx0XHRcdGNvbnN0IHNpbGVudCA9IGl0ZW1zLmZpbmQoaSA9PiBpLm5hbWUgPT09ICdTaWxlbnQnKTtcblx0XHRcdGFzc2VydC5vayhpbnZvY2FibGUsICdzaG91bGQgaGF2ZSBpbnZvY2FibGUgaXRlbScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNpbGVudCwgJ3Nob3VsZCBoYXZlIHNpbGVudCBpdGVtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhYmxlLnVzZXJJbnZvY2FibGUsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpbGVudC51c2VySW52b2NhYmxlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxhdCBub24tZGlyZWN0b3J5IGVudHJpZXMgaW4gc2tpbGxzLyBhcmUgaWdub3JlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvcycpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIGZsYXQgZmlsZSBhbG9uZ3NpZGUgYSBwcm9wZXIgc2tpbGwgZm9sZGVyIFx1MjAxNCBmbGF0IGZpbGVzIGFyZSBubyBsb25nZXIgc3VwcG9ydGVkXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvcy9za2lsbHMvZmxhdC5za2lsbC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBGbGF0Jyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9zL3NraWxscy9mb2xkZXItc2tpbGwvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogRm9sZGVyIFNraWxsJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIE9ubHkgdGhlIGZvbGRlci1iYXNlZCBza2lsbCBzaG91bGQgYXBwZWFyOyB0aGUgZmxhdCBmaWxlIGlzIG5vdCBhIGRpcmVjdG9yeSwgc28gaXQgaXMgc2tpcHBlZFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLm5hbWUpLCBbJ0ZvbGRlciBTa2lsbCddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDE0IGFnZW50cyBmb2xkZXJcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDEzIGFnZW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdlbWl0cyBvbmUgaXRlbSBwZXIgLm1kIGZpbGUgd2l0aCBuYW1lL2Rlc2NyaXB0aW9uL3VzZXJJbnZvY2FibGUgZnJvbSBmcm9udG1hdHRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvYWdlbnRzLXBsdWdpbicpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvYWdlbnRzLXBsdWdpbi9hZ2VudHMvbXktYWdlbnQuYWdlbnQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogTXkgQWdlbnQnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBEb2VzIHRoaW5ncycsXG5cdFx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IHRydWUnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2FnZW50cy1wbHVnaW4vYWdlbnRzL290aGVyLmFnZW50Lm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgYWdlbnRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YWdlbnRJdGVtcy5tYXAoaSA9PiAoeyBuYW1lOiBpLm5hbWUsIGRlc2NyaXB0aW9uOiBpLmRlc2NyaXB0aW9uLCB1c2VySW52b2NhYmxlOiBpLnVzZXJJbnZvY2FibGUgfSkpLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBuYW1lOiAnTXkgQWdlbnQnLCBkZXNjcmlwdGlvbjogJ0RvZXMgdGhpbmdzJywgdXNlckludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ290aGVyJywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLS5tZCBmaWxlcyBpbiBhZ2VudHMvIGFyZSBpZ25vcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9hZ2VudHMtZmlsdGVyJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9hZ2VudHMtZmlsdGVyL2FnZW50cy92YWxpZC5hZ2VudC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBWYWxpZCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvYWdlbnRzLWZpbHRlci9hZ2VudHMvaWdub3JlZC5qc29uJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCd7fScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2FnZW50cy1maWx0ZXIvYWdlbnRzL2lnbm9yZWQudHh0JywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCd0ZXh0Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBhZ2VudEl0ZW1zID0gaXRlbXMuZmlsdGVyKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SXRlbXMubWFwKGkgPT4gaS5uYW1lKSwgWydWYWxpZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RpcmVjdG9yaWVzIGluIGFnZW50cy8gYXJlIGlnbm9yZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL2FnZW50cy1uby1kaXJzJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9hZ2VudHMtbm8tZGlycy9hZ2VudHMvbmVzdGVkL3NvbWUuYWdlbnQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogTmVzdGVkJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9hZ2VudHMtbm8tZGlycy9hZ2VudHMvZmxhdC5hZ2VudC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBGbGF0Jyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGFnZW50SXRlbXMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdC8vIE9ubHkgZmxhdC5hZ2VudC5tZDsgdGhlIG5lc3RlZC8gZGlyZWN0b3J5IGlzIHNraXBwZWRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRJdGVtcy5tYXAoaSA9PiBpLm5hbWUpLCBbJ0ZsYXQnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIGV4cGFuZFBsdWdpbkNvbnRlbnRzIFx1MjAxNCBydWxlcyBmb2xkZXJcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDEzIHJ1bGVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2VtaXRzIG9uZSBpdGVtIHBlciAubWQgZmlsZSB3aXRoIG5hbWUvZGVzY3JpcHRpb24gZnJvbSBmcm9udG1hdHRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvcnVsZXMtcGx1Z2luJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9ydWxlcy1wbHVnaW4vcnVsZXMvc3R5bGUuaW5zdHJ1Y3Rpb25zLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFN0eWxlIEd1aWRlJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogRW5mb3JjZXMgc3R5bGUnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3J1bGVzLXBsdWdpbi9ydWxlcy9ub25hbWUuaW5zdHJ1Y3Rpb25zLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgcnVsZUl0ZW1zID0gaXRlbXMuZmlsdGVyKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cnVsZUl0ZW1zLm1hcChpID0+ICh7IG5hbWU6IGkubmFtZSwgZGVzY3JpcHRpb246IGkuZGVzY3JpcHRpb24gfSkpLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBuYW1lOiAnU3R5bGUgR3VpZGUnLCBkZXNjcmlwdGlvbjogJ0VuZm9yY2VzIHN0eWxlJyB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ25vbmFtZScsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XS5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VySW52b2NhYmxlIGlzIE5PVCBzdXJmYWNlZCBmb3IgcnVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzLW5vLWludm9jYWJsZScpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvcnVsZXMtbm8taW52b2NhYmxlL3J1bGVzL3J1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IE15IFJ1bGUnLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHJ1bGVJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydWxlSXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChydWxlSXRlbXNbMF0udXNlckludm9jYWJsZSwgdW5kZWZpbmVkLCAncnVsZXMgbXVzdCBub3QgZXhwb3NlIHVzZXJJbnZvY2FibGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtaXRzIG9uZSBpdGVtIHBlciAubWRjIGZpbGUgcGVyIHRoZSBPcGVuIFBsdWdpbnMgc3BlYycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvcnVsZXMtbWRjJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0eyBwYXRoOiAnL3BsdWdpbnMvcnVsZXMtbWRjL3J1bGVzL3N0eWxlLm1kYycsIGNvbnRlbnRzOiBbJ1NvbWUgcnVsZSBjb250ZW50J10gfSxcblx0XHRcdFx0eyBwYXRoOiAnL3BsdWdpbnMvcnVsZXMtbWRjL3J1bGVzL290aGVyLm1kYycsIGNvbnRlbnRzOiBbJ0Fub3RoZXIgcnVsZSddIH0sXG5cdFx0XHRcdC8vIGAudHh0YCBhbmQgc2ltaWxhciBtdXN0IHN0aWxsIGJlIGlnbm9yZWRcblx0XHRcdFx0eyBwYXRoOiAnL3BsdWdpbnMvcnVsZXMtbWRjL3J1bGVzL3JlYWRtZS50eHQnLCBjb250ZW50czogWydub3QgYSBydWxlJ10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHJ1bGVJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJ1bGVJdGVtcy5tYXAoaSA9PiBpLm5hbWUpLnNvcnQoKSxcblx0XHRcdFx0WydvdGhlcicsICdzdHlsZSddLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDE0IGNvbW1hbmRzIGZvbGRlclxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTMgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZW1pdHMgb25lIGl0ZW0gcGVyIC5tZCBmaWxlLCBuYW1lIGZyb20gZmlsZW5hbWUgKG5vIGZyb250bWF0dGVyIHBhcnNpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9jbWRzLXBsdWdpbicpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvY21kcy1wbHVnaW4vY29tbWFuZHMvZml4LnByb21wdC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBGaXggSXQnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnRml4IHRoZSBjb2RlJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvY21kcy1wbHVnaW4vY29tbWFuZHMvcmV2aWV3LnByb21wdC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnIyBSZXZpZXcnLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGNtZEl0ZW1zID0gaXRlbXMuZmlsdGVyKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Y21kSXRlbXMubWFwKGkgPT4gaS5uYW1lKS5zb3J0KCksXG5cdFx0XHRcdFsnZml4JywgJ3JldmlldyddLFxuXHRcdFx0KTtcblx0XHRcdC8vIENvbW1hbmRzIGRvIG5vdCBleHBvc2UgZGVzY3JpcHRpb24gb3IgdXNlckludm9jYWJsZVxuXHRcdFx0Zm9yIChjb25zdCBjbWQgb2YgY21kSXRlbXMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZC5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZC51c2VySW52b2NhYmxlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTQgbWl4ZWQgcGx1Z2luXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2V4cGFuZFBsdWdpbkNvbnRlbnRzIFx1MjAxMyBtaXhlZCBwbHVnaW4nLCAoKSA9PiB7XG5cdFx0dGVzdCgnYWxsIGZvdXIgZm9sZGVyIHR5cGVzIGFyZSBkaXNjb3ZlcmVkIGFuZCByZXR1cm5lZCB0b2dldGhlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbWl4ZWQnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL21peGVkL2FnZW50cy9ib3QuYWdlbnQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogQm90Jyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9taXhlZC9za2lsbHMvbGludGVyL1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IExpbnRlcicsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbWl4ZWQvY29tbWFuZHMvZml4LnByb21wdC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnIyBGaXgnLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9taXhlZC9ydWxlcy9zdHlsZS5pbnN0cnVjdGlvbnMubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogU3R5bGUnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgYnlUeXBlID0gKHQ6IFByb21wdHNUeXBlKSA9PiBpdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IHQpLm1hcChpID0+IGkubmFtZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnlUeXBlKFByb21wdHNUeXBlLmFnZW50KSwgWydCb3QnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ5VHlwZShQcm9tcHRzVHlwZS5za2lsbCksIFsnTGludGVyJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChieVR5cGUoUHJvbXB0c1R5cGUucHJvbXB0KSwgWydmaXgnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ5VHlwZShQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpLCBbJ1N0eWxlJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTQgZ3JvdXBLZXkgYW5kIHBsdWdpblVyaSBwcm9wYWdhdGlvblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTMgZ3JvdXBLZXkgYW5kIHBsdWdpblVyaScsICgpID0+IHtcblx0XHR0ZXN0KCdhbGwgY2hpbGQgaXRlbXMgY2FycnkgdGhlIGdyb3VwS2V5IHBhc3NlZCB0byBleHBhbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL2drJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9nay9hZ2VudHMvYS5hZ2VudC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9nay9za2lsbHMvcy9TS0lMTC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfQ0xJRU5UX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmdyb3VwS2V5LCBSRU1PVEVfQ0xJRU5UX0dST1VQLCBgaXRlbSAke2l0ZW0ubmFtZX0gc2hvdWxkIGNhcnJ5IHJlbW90ZS1jbGllbnQgZ3JvdXBLZXlgKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQnVuZGxlSXRlbT10cnVlIGNsZWFycyBwbHVnaW5VcmkgYW5kIHBsdWdpbkxhYmVsIG9uIGNoaWxkIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9idW5kbGUnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2J1bmRsZS9za2lsbHMvYnMvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogQnVuZGxlIFNraWxsJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGJ1bmRsZUl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfQ0xJRU5UX0dST1VQLCB0cnVlIC8qIGlzQnVuZGxlSXRlbSAqLywgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdidW5kbGUtcGx1Z2luJyk7XG5cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBidW5kbGVJdGVtcykge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcGx1Z2luVXJpOiBpdGVtLnBsdWdpblVyaSwgcGx1Z2luTGFiZWw6IGl0ZW0ucGx1Z2luTGFiZWwgfSwgeyBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgcGx1Z2luTGFiZWw6IHVuZGVmaW5lZCB9LCBgYnVuZGxlIGl0ZW0gJHtpdGVtLm5hbWV9IG11c3QgaGF2ZSBubyBwbHVnaW4gcHJvdmVuYW5jZWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNCdW5kbGVJdGVtPWZhbHNlIHNldHMgcGx1Z2luVXJpIGFuZCBwbHVnaW5MYWJlbCBvbiBjaGlsZCBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvd2l0aC11cmknKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3dpdGgtdXJpL3NraWxscy9zay9TS0lMTC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBTaycsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ0RhdGFkb2cnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHBsdWdpblVyaTogaXRlbXNbMF0ucGx1Z2luVXJpPy50b1N0cmluZygpLCBwbHVnaW5MYWJlbDogaXRlbXNbMF0ucGx1Z2luTGFiZWwgfSwgeyBwbHVnaW5Vcmk6IHBsdWdpblJvb3QudG9TdHJpbmcoKSwgcGx1Z2luTGFiZWw6ICdEYXRhZG9nJyB9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQWdDLDhCQUE4QjtBQUU5RCxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLG9CQUFvQjtBQUMxQixNQUFNLHNCQUFzQjtBQU01QixTQUFTLE9BQU8sVUFBNkMsV0FBZ0IsVUFBa0IsY0FBdUIsUUFBK0IsT0FBMEIsYUFBOEQ7QUFDNU8sU0FBTyxTQUFTLHFCQUFxQixXQUFXLFVBQVUsY0FBYyxRQUFRLGFBQWEsS0FBSztBQUNuRztBQU1BLE1BQU0scUNBQXFDLE1BQU07QUFDaEQsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsVUFBTSxLQUFLLFlBQVksSUFBSSxJQUFJLFlBQVksSUFBSSxlQUFlLENBQUMsQ0FBQztBQUNoRSxVQUFNLFdBQVcsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUM7QUFDakUsZ0JBQVksSUFBSSxHQUFHLGlCQUFpQixRQUFRLE1BQU0sUUFBUSxDQUFDO0FBQzNELGtCQUFjO0FBQUEsRUFDZixDQUFDO0FBTUQsUUFBTSxzQ0FBaUMsTUFBTTtBQUM1QyxTQUFLLCtFQUErRSxZQUFZO0FBQy9GLFlBQU0sYUFBYSxJQUFJLEtBQUssb0JBQW9CO0FBQ2hELFlBQU0sVUFBVSxhQUFhO0FBQUE7QUFBQSxRQUU1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQThDLFVBQVU7QUFBQSxZQUM3RDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQTtBQUFBLFFBRUE7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUE4QyxVQUFVO0FBQUEsWUFDN0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBO0FBQUEsUUFFQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQThDLFVBQVU7QUFBQSxZQUM3RDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sV0FBVyxJQUFJLGtDQUFrQyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQ3hGLFlBQU0sUUFBUSxNQUFNLE9BQU8sVUFBVSxZQUFZLG1CQUFtQixPQUFPLHVCQUF1QixRQUFRLGtCQUFrQixJQUFJO0FBRWhJLGFBQU8sZ0JBQWdCLE1BQU0sSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sTUFBTSxFQUFFLE1BQU0sYUFBYSxFQUFFLFlBQVksRUFBRSxHQUFHO0FBQUEsUUFDcEcsRUFBRSxNQUFNLFlBQVksT0FBTyxNQUFNLFFBQVEsYUFBYSxlQUFlO0FBQUEsTUFDdEUsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxhQUFhLElBQUksS0FBSyxZQUFZO0FBQ3hDLFlBQU0sVUFBVSxhQUFhO0FBQUE7QUFBQSxRQUU1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQTRDLFVBQVU7QUFBQSxZQUMzRDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxXQUFXLElBQUksa0NBQWtDLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEYsWUFBTSxRQUFRLE1BQU0sT0FBTyxVQUFVLFlBQVksbUJBQW1CLE9BQU8sdUJBQXVCLFFBQVEsa0JBQWtCLElBQUk7QUFDaEksYUFBTyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQ2xDLGFBQU8sWUFBWSxNQUFNLENBQUMsRUFBRSxNQUFNLGVBQWU7QUFDakQsYUFBTyxZQUFZLE1BQU0sQ0FBQyxFQUFFLGFBQWEsTUFBUztBQUFBLElBQ25ELENBQUM7QUFFRCxTQUFLLGtEQUFrRCxZQUFZO0FBQ2xFLFlBQU0sYUFBYSxJQUFJLEtBQUssWUFBWTtBQUN4QyxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBdUMsVUFBVTtBQUFBLFlBQ3REO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sV0FBVyxJQUFJLGtDQUFrQyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQ3hGLFlBQU0sUUFBUSxNQUFNLE9BQU8sVUFBVSxZQUFZLG1CQUFtQixPQUFPLHVCQUF1QixRQUFRLGtCQUFrQixJQUFJO0FBQ2hJLGFBQU8sWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUNsQyxhQUFPLEdBQUcsTUFBTSxDQUFDLEVBQUUsSUFBSSxLQUFLLFNBQVMsV0FBVyxHQUFHLDhCQUE4QixNQUFNLENBQUMsRUFBRSxHQUFHLEVBQUU7QUFBQSxJQUNoRyxDQUFDO0FBRUQsU0FBSyx1REFBdUQsWUFBWTtBQUN2RSxZQUFNLGFBQWEsSUFBSSxLQUFLLFlBQVk7QUFDeEMsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQXdDLFVBQVU7QUFBQSxZQUN2RDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQXFDLFVBQVU7QUFBQSxZQUNwRDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVcsSUFBSSxrQ0FBa0MsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4RixZQUFNLFFBQVEsTUFBTSxPQUFPLFVBQVUsWUFBWSxtQkFBbUIsT0FBTyx1QkFBdUIsUUFBUSxrQkFBa0IsSUFBSTtBQUNoSSxZQUFNLFlBQVksTUFBTSxLQUFLLE9BQUssRUFBRSxTQUFTLFdBQVc7QUFDeEQsWUFBTSxTQUFTLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxRQUFRO0FBQ2xELGFBQU8sR0FBRyxXQUFXLDRCQUE0QjtBQUNqRCxhQUFPLEdBQUcsUUFBUSx5QkFBeUI7QUFDM0MsYUFBTyxZQUFZLFVBQVUsZUFBZSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxPQUFPLGVBQWUsTUFBUztBQUFBLElBQ25ELENBQUM7QUFFRCxTQUFLLHFEQUFxRCxZQUFZO0FBQ3JFLFlBQU0sYUFBYSxJQUFJLEtBQUssWUFBWTtBQUN4QyxZQUFNLFVBQVUsYUFBYTtBQUFBO0FBQUEsUUFFNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUFtQyxVQUFVO0FBQUEsWUFDbEQ7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQTJDLFVBQVU7QUFBQSxZQUMxRDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVcsSUFBSSxrQ0FBa0MsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4RixZQUFNLFFBQVEsTUFBTSxPQUFPLFVBQVUsWUFBWSxtQkFBbUIsT0FBTyx1QkFBdUIsUUFBUSxrQkFBa0IsSUFBSTtBQUVoSSxhQUFPLGdCQUFnQixNQUFNLElBQUksT0FBSyxFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztBQUFBLElBQ2hFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLHNDQUFpQyxNQUFNO0FBQzVDLFNBQUssb0ZBQW9GLFlBQVk7QUFDcEcsWUFBTSxhQUFhLElBQUksS0FBSyx3QkFBd0I7QUFDcEQsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQW1ELFVBQVU7QUFBQSxZQUNsRTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUFnRCxVQUFVO0FBQUEsWUFDL0Q7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVcsSUFBSSxrQ0FBa0MsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4RixZQUFNLFFBQVEsTUFBTSxPQUFPLFVBQVUsWUFBWSxtQkFBbUIsT0FBTyx1QkFBdUIsUUFBUSxrQkFBa0IsSUFBSTtBQUNoSSxZQUFNLGFBQWEsTUFBTSxPQUFPLE9BQUssRUFBRSxTQUFTLFlBQVksS0FBSztBQUNqRSxhQUFPO0FBQUEsUUFDTixXQUFXLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLGFBQWEsRUFBRSxhQUFhLGVBQWUsRUFBRSxjQUFjLEVBQUUsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxjQUFjLEVBQUUsSUFBSSxDQUFDO0FBQUEsUUFDL0k7QUFBQSxVQUNDLEVBQUUsTUFBTSxZQUFZLGFBQWEsZUFBZSxlQUFlLEtBQUs7QUFBQSxVQUNwRSxFQUFFLE1BQU0sU0FBUyxhQUFhLFFBQVcsZUFBZSxPQUFVO0FBQUEsUUFDbkU7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsWUFBWTtBQUN4RCxZQUFNLGFBQWEsSUFBSSxLQUFLLHdCQUF3QjtBQUNwRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBZ0QsVUFBVTtBQUFBLFlBQy9EO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUE4QyxVQUFVO0FBQUEsWUFDN0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUE2QyxVQUFVO0FBQUEsWUFDNUQ7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sV0FBVyxJQUFJLGtDQUFrQyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQ3hGLFlBQU0sUUFBUSxNQUFNLE9BQU8sVUFBVSxZQUFZLG1CQUFtQixPQUFPLHVCQUF1QixRQUFRLGtCQUFrQixJQUFJO0FBQ2hJLFlBQU0sYUFBYSxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsWUFBWSxLQUFLO0FBQ2pFLGFBQU8sZ0JBQWdCLFdBQVcsSUFBSSxPQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDO0FBQUEsSUFDOUQsQ0FBQztBQUVELFNBQUssc0NBQXNDLFlBQVk7QUFDdEQsWUFBTSxhQUFhLElBQUksS0FBSyx5QkFBeUI7QUFDckQsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQXVELFVBQVU7QUFBQSxZQUN0RTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBZ0QsVUFBVTtBQUFBLFlBQy9EO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sV0FBVyxJQUFJLGtDQUFrQyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQ3hGLFlBQU0sUUFBUSxNQUFNLE9BQU8sVUFBVSxZQUFZLG1CQUFtQixPQUFPLHVCQUF1QixRQUFRLGtCQUFrQixJQUFJO0FBQ2hJLFlBQU0sYUFBYSxNQUFNLE9BQU8sT0FBSyxFQUFFLFNBQVMsWUFBWSxLQUFLO0FBRWpFLGFBQU8sZ0JBQWdCLFdBQVcsSUFBSSxPQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDN0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQU1ELFFBQU0scUNBQWdDLE1BQU07QUFDM0MsU0FBSyxzRUFBc0UsWUFBWTtBQUN0RixZQUFNLGFBQWEsSUFBSSxLQUFLLHVCQUF1QjtBQUNuRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBcUQsVUFBVTtBQUFBLFlBQ3BFO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBc0QsVUFBVTtBQUFBLFlBQ3JFO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxXQUFXLElBQUksa0NBQWtDLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEYsWUFBTSxRQUFRLE1BQU0sT0FBTyxVQUFVLFlBQVksbUJBQW1CLE9BQU8sdUJBQXVCLFFBQVEsa0JBQWtCLElBQUk7QUFDaEksWUFBTSxZQUFZLE1BQU0sT0FBTyxPQUFLLEVBQUUsU0FBUyxZQUFZLFlBQVk7QUFDdkUsYUFBTztBQUFBLFFBQ04sVUFBVSxJQUFJLFFBQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxhQUFhLEVBQUUsWUFBWSxFQUFFLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssY0FBYyxFQUFFLElBQUksQ0FBQztBQUFBLFFBQzlHO0FBQUEsVUFDQyxFQUFFLE1BQU0sZUFBZSxhQUFhLGlCQUFpQjtBQUFBLFVBQ3JELEVBQUUsTUFBTSxVQUFVLGFBQWEsT0FBVTtBQUFBLFFBQzFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssY0FBYyxFQUFFLElBQUksQ0FBQztBQUFBLE1BQzlDO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxZQUFNLGFBQWEsSUFBSSxLQUFLLDZCQUE2QjtBQUN6RCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBMEQsVUFBVTtBQUFBLFlBQ3pFO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVcsSUFBSSxrQ0FBa0MsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4RixZQUFNLFFBQVEsTUFBTSxPQUFPLFVBQVUsWUFBWSxtQkFBbUIsT0FBTyx1QkFBdUIsUUFBUSxrQkFBa0IsSUFBSTtBQUNoSSxZQUFNLFlBQVksTUFBTSxPQUFPLE9BQUssRUFBRSxTQUFTLFlBQVksWUFBWTtBQUN2RSxhQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsQ0FBQyxFQUFFLGVBQWUsUUFBVyxxQ0FBcUM7QUFBQSxJQUNoRyxDQUFDO0FBRUQsU0FBSywwREFBMEQsWUFBWTtBQUMxRSxZQUFNLGFBQWEsSUFBSSxLQUFLLG9CQUFvQjtBQUNoRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLEVBQUUsTUFBTSxzQ0FBc0MsVUFBVSxDQUFDLG1CQUFtQixFQUFFO0FBQUEsUUFDOUUsRUFBRSxNQUFNLHNDQUFzQyxVQUFVLENBQUMsY0FBYyxFQUFFO0FBQUE7QUFBQSxRQUV6RSxFQUFFLE1BQU0sdUNBQXVDLFVBQVUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxNQUN6RSxDQUFDO0FBRUQsWUFBTSxXQUFXLElBQUksa0NBQWtDLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEYsWUFBTSxRQUFRLE1BQU0sT0FBTyxVQUFVLFlBQVksbUJBQW1CLE9BQU8sdUJBQXVCLFFBQVEsa0JBQWtCLElBQUk7QUFDaEksWUFBTSxZQUFZLE1BQU0sT0FBTyxPQUFLLEVBQUUsU0FBUyxZQUFZLFlBQVk7QUFDdkUsYUFBTztBQUFBLFFBQ04sVUFBVSxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSztBQUFBLFFBQ2hDLENBQUMsU0FBUyxPQUFPO0FBQUEsTUFDbEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLHdDQUFtQyxNQUFNO0FBQzlDLFNBQUssNEVBQTRFLFlBQVk7QUFDNUYsWUFBTSxhQUFhLElBQUksS0FBSyxzQkFBc0I7QUFDbEQsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQStDLFVBQVU7QUFBQSxZQUM5RDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQWtELFVBQVU7QUFBQSxZQUNqRTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxXQUFXLElBQUksa0NBQWtDLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEYsWUFBTSxRQUFRLE1BQU0sT0FBTyxVQUFVLFlBQVksbUJBQW1CLE9BQU8sdUJBQXVCLFFBQVEsa0JBQWtCLElBQUk7QUFDaEksWUFBTSxXQUFXLE1BQU0sT0FBTyxPQUFLLEVBQUUsU0FBUyxZQUFZLE1BQU07QUFDaEUsYUFBTztBQUFBLFFBQ04sU0FBUyxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSztBQUFBLFFBQy9CLENBQUMsT0FBTyxRQUFRO0FBQUEsTUFDakI7QUFFQSxpQkFBVyxPQUFPLFVBQVU7QUFDM0IsZUFBTyxZQUFZLElBQUksYUFBYSxNQUFTO0FBQzdDLGVBQU8sWUFBWSxJQUFJLGVBQWUsTUFBUztBQUFBLE1BQ2hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBTUQsUUFBTSw0Q0FBdUMsTUFBTTtBQUNsRCxTQUFLLDhEQUE4RCxZQUFZO0FBQzlFLFlBQU0sYUFBYSxJQUFJLEtBQUssZ0JBQWdCO0FBQzVDLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUFzQyxVQUFVO0FBQUEsWUFDckQ7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQXlDLFVBQVU7QUFBQSxZQUN4RDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBeUMsVUFBVTtBQUFBLFlBQ3hEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFBOEMsVUFBVTtBQUFBLFlBQzdEO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sV0FBVyxJQUFJLGtDQUFrQyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQ3hGLFlBQU0sUUFBUSxNQUFNLE9BQU8sVUFBVSxZQUFZLG1CQUFtQixPQUFPLHVCQUF1QixRQUFRLGtCQUFrQixJQUFJO0FBQ2hJLFlBQU0sU0FBUyxDQUFDLE1BQW1CLE1BQU0sT0FBTyxPQUFLLEVBQUUsU0FBUyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsSUFBSTtBQUVsRixhQUFPLGdCQUFnQixPQUFPLFlBQVksS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQ3pELGFBQU8sZ0JBQWdCLE9BQU8sWUFBWSxLQUFLLEdBQUcsQ0FBQyxRQUFRLENBQUM7QUFDNUQsYUFBTyxnQkFBZ0IsT0FBTyxZQUFZLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQztBQUMxRCxhQUFPLGdCQUFnQixPQUFPLFlBQVksWUFBWSxHQUFHLENBQUMsT0FBTyxDQUFDO0FBQUEsSUFDbkUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQU1ELFFBQU0sc0RBQWlELE1BQU07QUFDNUQsU0FBSyx1REFBdUQsWUFBWTtBQUN2RSxZQUFNLGFBQWEsSUFBSSxLQUFLLGFBQWE7QUFDekMsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQWlDLFVBQVU7QUFBQSxZQUNoRDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUFpQyxVQUFVO0FBQUEsWUFDaEQ7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVcsSUFBSSxrQ0FBa0MsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4RixZQUFNLFFBQVEsTUFBTSxPQUFPLFVBQVUsWUFBWSxxQkFBcUIsT0FBTyx1QkFBdUIsUUFBUSxrQkFBa0IsSUFBSTtBQUNsSSxpQkFBVyxRQUFRLE9BQU87QUFDekIsZUFBTyxZQUFZLEtBQUssVUFBVSxxQkFBcUIsUUFBUSxLQUFLLElBQUksc0NBQXNDO0FBQUEsTUFDL0c7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFlBQU0sYUFBYSxJQUFJLEtBQUssaUJBQWlCO0FBQzdDLFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUFzQyxVQUFVO0FBQUEsWUFDckQ7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxXQUFXLElBQUksa0NBQWtDLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEYsWUFBTSxjQUFjLE1BQU0sT0FBTyxVQUFVLFlBQVkscUJBQXFCLE1BQXlCLHVCQUF1QixRQUFRLGtCQUFrQixNQUFNLGVBQWU7QUFFM0ssaUJBQVcsUUFBUSxhQUFhO0FBQy9CLGVBQU8sZ0JBQWdCLEVBQUUsV0FBVyxLQUFLLFdBQVcsYUFBYSxLQUFLLFlBQVksR0FBRyxFQUFFLFdBQVcsUUFBVyxhQUFhLE9BQVUsR0FBRyxlQUFlLEtBQUssSUFBSSxpQ0FBaUM7QUFBQSxNQUNqTTtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssb0VBQW9FLFlBQVk7QUFDcEYsWUFBTSxhQUFhLElBQUksS0FBSyxtQkFBbUI7QUFDL0MsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQXdDLFVBQVU7QUFBQSxZQUN2RDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFdBQVcsSUFBSSxrQ0FBa0MsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4RixZQUFNLFFBQVEsTUFBTSxPQUFPLFVBQVUsWUFBWSxtQkFBbUIsT0FBTyx1QkFBdUIsUUFBUSxrQkFBa0IsTUFBTSxTQUFTO0FBQzNJLGFBQU8sWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUNsQyxhQUFPLGdCQUFnQixFQUFFLFdBQVcsTUFBTSxDQUFDLEVBQUUsV0FBVyxTQUFTLEdBQUcsYUFBYSxNQUFNLENBQUMsRUFBRSxZQUFZLEdBQUcsRUFBRSxXQUFXLFdBQVcsU0FBUyxHQUFHLGFBQWEsVUFBVSxDQUFDO0FBQUEsSUFDdEssQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
