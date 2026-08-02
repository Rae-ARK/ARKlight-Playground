import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../common/agentHostFileSystemService.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { CustomizationLoadStatus, CustomizationType, MessageAttachmentKind } from "../../common/state/sessionState.js";
import { AgentHostCompletions, CompletionTriggerCharacter } from "../../node/agentHostCompletions.js";
import { AgentHostSkillCompletionProvider } from "../../node/agentHostSkillCompletionProvider.js";
import { MockAgent } from "./mockAgent.js";
suite("AgentHostSkillCompletionProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function skill(name, description) {
    return {
      type: CustomizationType.Skill,
      id: `file:///skills/${name}/SKILL.md`,
      uri: `file:///skills/${name}/SKILL.md`,
      name,
      ...description !== void 0 ? { description } : {}
    };
  }
  function prompt(name) {
    return {
      type: CustomizationType.Prompt,
      id: `file:///prompts/${name}.md`,
      uri: `file:///prompts/${name}.md`,
      name
    };
  }
  function plugin(name, children, enabled = true) {
    return {
      type: CustomizationType.Plugin,
      id: `file:///plugins/${name}`,
      uri: `file:///plugins/${name}`,
      name,
      enabled,
      load: { kind: CustomizationLoadStatus.Loaded },
      ...children ? { children: [...children] } : {}
    };
  }
  function syncedPlugin(name, children) {
    return {
      ...plugin(name, children),
      id: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
      uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`
    };
  }
  function createProvider(agent) {
    return disposables.add(new AgentHostSkillCompletionProvider(() => agent));
  }
  async function run(provider, text, offset = text.length) {
    return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: "mock:/session", text, offset }, CancellationToken.None);
  }
  test("announces slash as a trigger character", () => {
    const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
    const provider = disposables.add(new AgentHostSkillCompletionProvider(() => void 0));
    disposables.add(completions.registerProvider(provider));
    assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Slash]);
  });
  test("complete skills from a plugin", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("my-skill", [skill("agent-host-docs", "Use this skill when working on Agent Host code")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, [{
      insertText: "/my-skill:agent-host-docs ",
      rangeStart: 0,
      rangeEnd: 1,
      attachment: {
        type: MessageAttachmentKind.Simple,
        label: "/my-skill:agent-host-docs",
        _meta: {
          uri: "file:///skills/agent-host-docs/SKILL.md",
          name: "agent-host-docs",
          displayName: "my-skill:agent-host-docs",
          description: "Use this skill when working on Agent Host code"
        }
      }
    }]);
  });
  test("complete skills from a plugin with the same name as the skill", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("monitor-pr", [skill("monitor-pr", "Use this skill when working with PRs")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, [{
      insertText: "/monitor-pr ",
      rangeStart: 0,
      rangeEnd: 1,
      attachment: {
        type: MessageAttachmentKind.Simple,
        label: "/monitor-pr",
        _meta: {
          uri: "file:///skills/monitor-pr/SKILL.md",
          name: "monitor-pr",
          displayName: "monitor-pr",
          description: "Use this skill when working with PRs"
        }
      }
    }]);
  });
  test("complete skills from a synced plugin without plugin prefix", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      syncedPlugin("skills-bundle", [skill("monitor-pr", "Use this skill when working with PRs")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, [{
      insertText: "/monitor-pr ",
      rangeStart: 0,
      rangeEnd: 1,
      attachment: {
        type: MessageAttachmentKind.Simple,
        label: "/monitor-pr",
        _meta: {
          uri: "file:///skills/monitor-pr/SKILL.md",
          name: "monitor-pr",
          displayName: "monitor-pr",
          description: "Use this skill when working with PRs"
        }
      }
    }]);
  });
  test("flattens skill children in session-effective order and ignores non-skill children", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("first", [skill("session-skill"), prompt("ignored-prompt")]),
      plugin("second", [skill("global-skill")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/first:session-skill ", "/second:global-skill "]);
  });
  test("ignores disabled customization containers", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("disabled", [skill("hidden-skill")], false),
      plugin("enabled", [skill("visible-skill")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/enabled:visible-skill "]);
  });
  test("returns an empty list when the agent has no session customizations hook", async () => {
    const agent = new MockAgent("mock");
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, []);
  });
  test("filters skills by the typed slash prefix and replaces only that token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha"), skill("beta")])];
    const provider = createProvider(agent);
    const result = await run(provider, "/skills:b extra", "/skills:b".length);
    assert.deepStrictEqual(result.map((item) => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
      { insertText: "/skills:beta ", rangeStart: 0, rangeEnd: 9 }
    ]);
  });
  test("fuzzy matches skills by the typed slash token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("fix-ci"), skill("other")])];
    const provider = createProvider(agent);
    const result = await run(provider, "/ci");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/skills:fix-ci "]);
  });
  test("filters skills by an in-message slash prefix and replaces only that token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha"), skill("beta")])];
    const provider = createProvider(agent);
    const text = "use /skills:b extra";
    const result = await run(provider, text, text.indexOf("/skills:b") + "/skills:b".length);
    assert.deepStrictEqual(result.map((item) => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
      { insertText: "/skills:beta ", rangeStart: 4, rangeEnd: 13 }
    ]);
  });
  test("returns skills for a slash token after whitespace", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha"), skill("beta")])];
    const provider = createProvider(agent);
    const text = "use /";
    const result = await run(provider, text);
    assert.deepStrictEqual(result.map((item) => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
      { insertText: "/skills:alpha ", rangeStart: 4, rangeEnd: 5 },
      { insertText: "/skills:beta ", rangeStart: 4, rangeEnd: 5 }
    ]);
  });
  test("does not complete slash tokens embedded in non-whitespace text", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha")])];
    const provider = createProvider(agent);
    const result = await run(provider, "foo/bar", "foo/bar".length);
    assert.deepStrictEqual(result, []);
  });
  test("returns an empty list when the cursor is past an in-message slash token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("cached-skill")])];
    const provider = createProvider(agent);
    const text = "use /skills:cached-skill trailing";
    const result = await run(provider, text, text.indexOf("trailing"));
    assert.deepStrictEqual(result, []);
  });
  test("returns an empty list when the cursor is past the leading slash token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("cached-skill")])];
    const provider = createProvider(agent);
    const text = "/skills:cached-skill trailing";
    const result = await run(provider, text, text.indexOf("trailing"));
    assert.deepStrictEqual(result, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0U2tpbGxDb21wbGV0aW9uUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgUHJvbXB0Q3VzdG9taXphdGlvbiwgdHlwZSBTa2lsbEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbXBsZXRpb25zLCBDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2tpbGxDb21wbGV0aW9uUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE1vY2tBZ2VudCB9IGZyb20gJy4vbW9ja0FnZW50LmpzJztcblxuc3VpdGUoJ0FnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2tpbGwobmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IFNraWxsQ3VzdG9taXphdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLFxuXHRcdFx0aWQ6IGBmaWxlOi8vL3NraWxscy8ke25hbWV9L1NLSUxMLm1kYCxcblx0XHRcdHVyaTogYGZpbGU6Ly8vc2tpbGxzLyR7bmFtZX0vU0tJTEwubWRgLFxuXHRcdFx0bmFtZSxcblx0XHRcdC4uLihkZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkID8geyBkZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBwcm9tcHQobmFtZTogc3RyaW5nKTogUHJvbXB0Q3VzdG9taXphdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlByb21wdCxcblx0XHRcdGlkOiBgZmlsZTovLy9wcm9tcHRzLyR7bmFtZX0ubWRgLFxuXHRcdFx0dXJpOiBgZmlsZTovLy9wcm9tcHRzLyR7bmFtZX0ubWRgLFxuXHRcdFx0bmFtZSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcGx1Z2luKG5hbWU6IHN0cmluZywgY2hpbGRyZW4/OiByZWFkb25seSAoU2tpbGxDdXN0b21pemF0aW9uIHwgUHJvbXB0Q3VzdG9taXphdGlvbilbXSwgZW5hYmxlZCA9IHRydWUpOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0aWQ6IGBmaWxlOi8vL3BsdWdpbnMvJHtuYW1lfWAsXG5cdFx0XHR1cmk6IGBmaWxlOi8vL3BsdWdpbnMvJHtuYW1lfWAsXG5cdFx0XHRuYW1lLFxuXHRcdFx0ZW5hYmxlZCxcblx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHQuLi4oY2hpbGRyZW4gPyB7IGNoaWxkcmVuOiBbLi4uY2hpbGRyZW5dIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN5bmNlZFBsdWdpbihuYW1lOiBzdHJpbmcsIGNoaWxkcmVuPzogcmVhZG9ubHkgKFNraWxsQ3VzdG9taXphdGlvbiB8IFByb21wdEN1c3RvbWl6YXRpb24pW10pOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucGx1Z2luKG5hbWUsIGNoaWxkcmVuKSxcblx0XHRcdGlkOiBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi9wbHVnaW5zLyR7bmFtZX1gLFxuXHRcdFx0dXJpOiBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi9wbHVnaW5zLyR7bmFtZX1gLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVQcm92aWRlcihhZ2VudDogTW9ja0FnZW50KTogQWdlbnRIb3N0U2tpbGxDb21wbGV0aW9uUHJvdmlkZXIge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyKCgpID0+IGFnZW50KSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBydW4ocHJvdmlkZXI6IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyLCB0ZXh0OiBzdHJpbmcsIG9mZnNldCA9IHRleHQubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoeyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6ICdtb2NrOi9zZXNzaW9uJywgdGV4dCwgb2Zmc2V0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0dGVzdCgnYW5ub3VuY2VzIHNsYXNoIGFzIGEgdHJpZ2dlciBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENvbXBsZXRpb25zKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyKCgpID0+IHVuZGVmaW5lZCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb21wbGV0aW9ucy5yZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY29tcGxldGlvbnMudHJpZ2dlckNoYXJhY3RlcnNdLCBbQ29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXIuU2xhc2hdKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGxldGUgc2tpbGxzIGZyb20gYSBwbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW1xuXHRcdFx0cGx1Z2luKCdteS1za2lsbCcsIFtza2lsbCgnYWdlbnQtaG9zdC1kb2NzJywgJ1VzZSB0aGlzIHNraWxsIHdoZW4gd29ya2luZyBvbiBBZ2VudCBIb3N0IGNvZGUnKV0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdGluc2VydFRleHQ6ICcvbXktc2tpbGw6YWdlbnQtaG9zdC1kb2NzICcsXG5cdFx0XHRyYW5nZVN0YXJ0OiAwLFxuXHRcdFx0cmFuZ2VFbmQ6IDEsXG5cdFx0XHRhdHRhY2htZW50OiB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdGxhYmVsOiAnL215LXNraWxsOmFnZW50LWhvc3QtZG9jcycsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dXJpOiAnZmlsZTovLy9za2lsbHMvYWdlbnQtaG9zdC1kb2NzL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRuYW1lOiAnYWdlbnQtaG9zdC1kb2NzJyxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ215LXNraWxsOmFnZW50LWhvc3QtZG9jcycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdVc2UgdGhpcyBza2lsbCB3aGVuIHdvcmtpbmcgb24gQWdlbnQgSG9zdCBjb2RlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZSBza2lsbHMgZnJvbSBhIHBsdWdpbiB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgdGhlIHNraWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtcblx0XHRcdHBsdWdpbignbW9uaXRvci1wcicsIFtza2lsbCgnbW9uaXRvci1wcicsICdVc2UgdGhpcyBza2lsbCB3aGVuIHdvcmtpbmcgd2l0aCBQUnMnKV0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdGluc2VydFRleHQ6ICcvbW9uaXRvci1wciAnLFxuXHRcdFx0cmFuZ2VTdGFydDogMCxcblx0XHRcdHJhbmdlRW5kOiAxLFxuXHRcdFx0YXR0YWNobWVudDoge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRsYWJlbDogJy9tb25pdG9yLXByJyxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR1cmk6ICdmaWxlOi8vL3NraWxscy9tb25pdG9yLXByL1NLSUxMLm1kJyxcblx0XHRcdFx0XHRuYW1lOiAnbW9uaXRvci1wcicsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdtb25pdG9yLXByJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1VzZSB0aGlzIHNraWxsIHdoZW4gd29ya2luZyB3aXRoIFBScycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGxldGUgc2tpbGxzIGZyb20gYSBzeW5jZWQgcGx1Z2luIHdpdGhvdXQgcGx1Z2luIHByZWZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbXG5cdFx0XHRzeW5jZWRQbHVnaW4oJ3NraWxscy1idW5kbGUnLCBbc2tpbGwoJ21vbml0b3ItcHInLCAnVXNlIHRoaXMgc2tpbGwgd2hlbiB3b3JraW5nIHdpdGggUFJzJyldKSxcblx0XHRdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRpbnNlcnRUZXh0OiAnL21vbml0b3ItcHIgJyxcblx0XHRcdHJhbmdlU3RhcnQ6IDAsXG5cdFx0XHRyYW5nZUVuZDogMSxcblx0XHRcdGF0dGFjaG1lbnQ6IHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0bGFiZWw6ICcvbW9uaXRvci1wcicsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dXJpOiAnZmlsZTovLy9za2lsbHMvbW9uaXRvci1wci9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0bmFtZTogJ21vbml0b3ItcHInLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnbW9uaXRvci1wcicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdVc2UgdGhpcyBza2lsbCB3aGVuIHdvcmtpbmcgd2l0aCBQUnMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsYXR0ZW5zIHNraWxsIGNoaWxkcmVuIGluIHNlc3Npb24tZWZmZWN0aXZlIG9yZGVyIGFuZCBpZ25vcmVzIG5vbi1za2lsbCBjaGlsZHJlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbXG5cdFx0XHRwbHVnaW4oJ2ZpcnN0JywgW3NraWxsKCdzZXNzaW9uLXNraWxsJyksIHByb21wdCgnaWdub3JlZC1wcm9tcHQnKV0pLFxuXHRcdFx0cGx1Z2luKCdzZWNvbmQnLCBbc2tpbGwoJ2dsb2JhbC1za2lsbCcpXSksXG5cdFx0XTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChpdGVtID0+IGl0ZW0uaW5zZXJ0VGV4dCksIFsnL2ZpcnN0OnNlc3Npb24tc2tpbGwgJywgJy9zZWNvbmQ6Z2xvYmFsLXNraWxsICddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBkaXNhYmxlZCBjdXN0b21pemF0aW9uIGNvbnRhaW5lcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW1xuXHRcdFx0cGx1Z2luKCdkaXNhYmxlZCcsIFtza2lsbCgnaGlkZGVuLXNraWxsJyldLCBmYWxzZSksXG5cdFx0XHRwbHVnaW4oJ2VuYWJsZWQnLCBbc2tpbGwoJ3Zpc2libGUtc2tpbGwnKV0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoaXRlbSA9PiBpdGVtLmluc2VydFRleHQpLCBbJy9lbmFibGVkOnZpc2libGUtc2tpbGwgJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGVtcHR5IGxpc3Qgd2hlbiB0aGUgYWdlbnQgaGFzIG5vIHNlc3Npb24gY3VzdG9taXphdGlvbnMgaG9vaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbHRlcnMgc2tpbGxzIGJ5IHRoZSB0eXBlZCBzbGFzaCBwcmVmaXggYW5kIHJlcGxhY2VzIG9ubHkgdGhhdCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbcGx1Z2luKCdza2lsbHMnLCBbc2tpbGwoJ2FscGhhJyksIHNraWxsKCdiZXRhJyldKV07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvc2tpbGxzOmIgZXh0cmEnLCAnL3NraWxsczpiJy5sZW5ndGgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGl0ZW0gPT4gKHsgaW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LCByYW5nZVN0YXJ0OiBpdGVtLnJhbmdlU3RhcnQsIHJhbmdlRW5kOiBpdGVtLnJhbmdlRW5kIH0pKSwgW1xuXHRcdFx0eyBpbnNlcnRUZXh0OiAnL3NraWxsczpiZXRhICcsIHJhbmdlU3RhcnQ6IDAsIHJhbmdlRW5kOiA5IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5IG1hdGNoZXMgc2tpbGxzIGJ5IHRoZSB0eXBlZCBzbGFzaCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbcGx1Z2luKCdza2lsbHMnLCBbc2tpbGwoJ2ZpeC1jaScpLCBza2lsbCgnb3RoZXInKV0pXTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy9jaScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0KSwgWycvc2tpbGxzOmZpeC1jaSAnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbHRlcnMgc2tpbGxzIGJ5IGFuIGluLW1lc3NhZ2Ugc2xhc2ggcHJlZml4IGFuZCByZXBsYWNlcyBvbmx5IHRoYXQgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW3BsdWdpbignc2tpbGxzJywgW3NraWxsKCdhbHBoYScpLCBza2lsbCgnYmV0YScpXSldO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXHRcdGNvbnN0IHRleHQgPSAndXNlIC9za2lsbHM6YiBleHRyYSc7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsIHRleHQsIHRleHQuaW5kZXhPZignL3NraWxsczpiJykgKyAnL3NraWxsczpiJy5sZW5ndGgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGl0ZW0gPT4gKHsgaW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LCByYW5nZVN0YXJ0OiBpdGVtLnJhbmdlU3RhcnQsIHJhbmdlRW5kOiBpdGVtLnJhbmdlRW5kIH0pKSwgW1xuXHRcdFx0eyBpbnNlcnRUZXh0OiAnL3NraWxsczpiZXRhICcsIHJhbmdlU3RhcnQ6IDQsIHJhbmdlRW5kOiAxMyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHNraWxscyBmb3IgYSBzbGFzaCB0b2tlbiBhZnRlciB3aGl0ZXNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtwbHVnaW4oJ3NraWxscycsIFtza2lsbCgnYWxwaGEnKSwgc2tpbGwoJ2JldGEnKV0pXTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblx0XHRjb25zdCB0ZXh0ID0gJ3VzZSAvJztcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgdGV4dCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoaXRlbSA9PiAoeyBpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsIHJhbmdlU3RhcnQ6IGl0ZW0ucmFuZ2VTdGFydCwgcmFuZ2VFbmQ6IGl0ZW0ucmFuZ2VFbmQgfSkpLCBbXG5cdFx0XHR7IGluc2VydFRleHQ6ICcvc2tpbGxzOmFscGhhICcsIHJhbmdlU3RhcnQ6IDQsIHJhbmdlRW5kOiA1IH0sXG5cdFx0XHR7IGluc2VydFRleHQ6ICcvc2tpbGxzOmJldGEgJywgcmFuZ2VTdGFydDogNCwgcmFuZ2VFbmQ6IDUgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY29tcGxldGUgc2xhc2ggdG9rZW5zIGVtYmVkZGVkIGluIG5vbi13aGl0ZXNwYWNlIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW3BsdWdpbignc2tpbGxzJywgW3NraWxsKCdhbHBoYScpXSldO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnZm9vL2JhcicsICdmb28vYmFyJy5sZW5ndGgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhbiBlbXB0eSBsaXN0IHdoZW4gdGhlIGN1cnNvciBpcyBwYXN0IGFuIGluLW1lc3NhZ2Ugc2xhc2ggdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW3BsdWdpbignc2tpbGxzJywgW3NraWxsKCdjYWNoZWQtc2tpbGwnKV0pXTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblx0XHRjb25zdCB0ZXh0ID0gJ3VzZSAvc2tpbGxzOmNhY2hlZC1za2lsbCB0cmFpbGluZyc7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsIHRleHQsIHRleHQuaW5kZXhPZigndHJhaWxpbmcnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGVtcHR5IGxpc3Qgd2hlbiB0aGUgY3Vyc29yIGlzIHBhc3QgdGhlIGxlYWRpbmcgc2xhc2ggdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW3BsdWdpbignc2tpbGxzJywgW3NraWxsKCdjYWNoZWQtc2tpbGwnKV0pXTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblx0XHRjb25zdCB0ZXh0ID0gJy9za2lsbHM6Y2FjaGVkLXNraWxsIHRyYWlsaW5nJztcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgdGV4dCwgdGV4dC5pbmRleE9mKCd0cmFpbGluZycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUIsbUJBQW1CLDZCQUEwRztBQUMvSixTQUFTLHNCQUFzQixrQ0FBa0M7QUFDakUsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSxvQ0FBb0MsTUFBTTtBQUUvQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELFdBQVMsTUFBTSxNQUFjLGFBQTBDO0FBQ3RFLFdBQU87QUFBQSxNQUNOLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsSUFBSSxrQkFBa0IsSUFBSTtBQUFBLE1BQzFCLEtBQUssa0JBQWtCLElBQUk7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsR0FBSSxnQkFBZ0IsU0FBWSxFQUFFLFlBQVksSUFBSSxDQUFDO0FBQUEsSUFDcEQ7QUFBQSxFQUNEO0FBRUEsV0FBUyxPQUFPLE1BQW1DO0FBQ2xELFdBQU87QUFBQSxNQUNOLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIs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
