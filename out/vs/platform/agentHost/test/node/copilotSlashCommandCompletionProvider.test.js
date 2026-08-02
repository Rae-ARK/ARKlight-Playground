import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../common/agentHostFileSystemService.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { CopilotSlashCommandCompletionProvider, parseLeadingSlashCommand } from "../../node/copilot/copilotSlashCommandCompletionProvider.js";
function runtimeOnly(items) {
  return items.filter((i) => i.attachment?._meta?.action === void 0);
}
suite("CopilotSlashCommandCompletionProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseLeadingSlashCommand", () => {
    test("matches lone /plan", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/plan"), { command: "plan", rest: "", rawRest: "" });
    });
    test("matches lone /compact", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/compact"), { command: "compact", rest: "", rawRest: "" });
    });
    test("matches lone /research", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/research"), { command: "research", rest: "", rawRest: "" });
    });
    test("captures trailing text after a space for /research", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/research How does React work?"), { command: "research", rest: "How does React work?", rawRest: "How does React work?" });
    });
    test("matches lone /rubber-duck", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/rubber-duck"), { command: "rubber-duck", rest: "", rawRest: "" });
    });
    test("matches lone /env", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/env"), { command: "env", rest: "", rawRest: "" });
    });
    test("matches lone /review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/review"), { command: "review", rest: "", rawRest: "" });
    });
    test("matches lone /security-review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/security-review"), { command: "security-review", rest: "", rawRest: "" });
    });
    test("captures trailing text after a space for /rubber-duck", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/rubber-duck review my approach"), { command: "rubber-duck", rest: "review my approach", rawRest: "review my approach" });
    });
    test("captures trailing text after a space for /env", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/env ignored input"), { command: "env", rest: "ignored input", rawRest: "ignored input" });
    });
    test("captures trailing text after a space for /review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/review focus on tests"), { command: "review", rest: "focus on tests", rawRest: "focus on tests" });
    });
    test("captures trailing text after a space for /security-review", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/security-review focus on auth"), { command: "security-review", rest: "focus on auth", rawRest: "focus on auth" });
    });
    test("parses arbitrary slash command tokens", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/rubber-duck-extra"), { command: "rubber-duck-extra", rest: "", rawRest: "" });
    });
    test("preserves multiline command input as rawRest", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/foo first line\nsecond line"), { command: "foo", rest: "first line\nsecond line", rawRest: "first line\nsecond line" });
    });
    test("trims rest while retaining rawRest", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/foo   padded  "), { command: "foo", rest: "padded", rawRest: "padded  " });
    });
    test("captures trailing text after a space", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/plan build a hello world"), { command: "plan", rest: "build a hello world", rawRest: "build a hello world" });
    });
    test("captures trailing text after a space for /compact", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/compact some text"), { command: "compact", rest: "some text", rawRest: "some text" });
    });
    test("rejects leading whitespace", () => {
      assert.strictEqual(parseLeadingSlashCommand(" /compact"), void 0);
    });
    test("accepts uppercase command tokens", () => {
      assert.deepStrictEqual(parseLeadingSlashCommand("/PLAN"), { command: "PLAN", rest: "", rawRest: "" });
    });
  });
  suite("provideCompletionItems", () => {
    const runtimeCommands = [
      { name: "plan", description: "Runtime plan", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "task" } },
      { name: "compact", description: "Runtime compact", kind: "builtin", allowDuringAgentExecution: true },
      { name: "research", description: "Runtime research", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "query" } },
      { name: "rubber-duck", description: "Runtime rubber-duck", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "review prompt" } },
      { name: "env", description: "Runtime env", kind: "builtin", allowDuringAgentExecution: true },
      { name: "review", description: "Runtime review", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "scope" } },
      { name: "security-review", description: "Runtime security review", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "scope" } }
    ];
    const provider = new CopilotSlashCommandCompletionProvider("copilotcli", {
      isRubberDuckEnabled: () => true,
      getRuntimeSlashCommands: async () => runtimeCommands,
      getSessionCustomizations: async () => []
    });
    const session = "copilotcli:/abc";
    async function run(text, offset = text.length) {
      return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
    }
    test("returns nothing for non-copilotcli scheme", async () => {
      const items = await provider.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: "claude:/abc",
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(items, []);
    });
    test('returns all runtime items for lone "/" (config-action items filtered)', async () => {
      const items = await run("/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/compact ", "/research ", "/rubber-duck ", "/env ", "/review ", "/security-review "].sort());
    });
    test("injects config-action items (permission/mode toggles) for a leading slash", async () => {
      const items = await run("/");
      const byLabel = new Map(items.filter((i) => i.attachment?._meta?.action !== void 0).map((i) => [i.attachment?.label, i]));
      assert.ok(byLabel.has("/yolo on"));
      assert.ok(byLabel.has("/autopilot on"));
      assert.strictEqual(byLabel.get("/autopilot")?.insertText, "/autopilot ");
    });
    test('filters to /plan when "/p" typed', async () => {
      const items = await run("/p");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/plan "]);
    });
    test('filters to /compact when "/c" typed', async () => {
      const items = await run("/c");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/compact "]);
    });
    test('fuzzy matches /compact when "/cc" typed', async () => {
      const items = await run("/cc");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/compact "]);
    });
    test('filters to /env when "/e" typed and runtime command exists', async () => {
      const items = await run("/e");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/env "]);
    });
    test('filters to /research and /rubber-duck when "/r" typed', async () => {
      const items = await run("/r");
      assert.deepStrictEqual(items.map((i) => i.insertText), [
        "/research ",
        "/review ",
        "/rubber-duck "
      ].sort());
    });
    test('filters to /security-review when "/s" typed', async () => {
      const items = await run("/s");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/security-review "]);
    });
    test("returns nothing when /word does not match any command prefix", async () => {
      const items = await run("/zz");
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when input does not start with /", async () => {
      const items = await run("hello /pl", 9);
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when cursor is past the leading word", async () => {
      const items = await run("/plan ", 6);
      assert.deepStrictEqual(items, []);
    });
    test("range covers only the leading slash word", async () => {
      const items = await run("/p extra text", 2);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].rangeStart, 0);
      assert.strictEqual(items[0].rangeEnd, 2);
    });
    test("attachment is Simple with command + description meta", async () => {
      const items = await run("/");
      assert.deepStrictEqual(runtimeOnly(items).map((item) => ({ insertText: item.insertText, type: item.attachment?.type, meta: item.attachment?._meta })), [
        {
          insertText: "/compact ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "compact",
            description: "Runtime compact"
          }
        },
        {
          insertText: "/env ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "env",
            description: "Runtime env"
          }
        },
        {
          insertText: "/research ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "research",
            description: "Runtime research",
            argumentHint: "query"
          }
        },
        {
          insertText: "/review ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "review",
            description: "Runtime review",
            argumentHint: "scope"
          }
        },
        {
          insertText: "/rubber-duck ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "rubber-duck",
            description: "Runtime rubber-duck",
            argumentHint: "review prompt"
          }
        },
        {
          insertText: "/security-review ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "security-review",
            description: "Runtime security review",
            argumentHint: "scope"
          }
        }
      ]);
    });
    test("omits /rubber-duck when not enabled", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => false,
        getRuntimeSlashCommands: async () => runtimeCommands,
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), [
        "/compact ",
        "/env ",
        "/research ",
        "/review ",
        "/security-review "
      ].sort());
    });
    test("returns no completion items when runtime command list is empty", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("filters out runtime commands omitted from the catalog", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => runtimeCommands.filter((command) => command.name !== "env"),
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), [
        "/compact ",
        "/research ",
        "/review ",
        "/rubber-duck ",
        "/security-review "
      ].sort());
    });
    test("includes runtime SDK commands in completion results", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [{
          name: "focus",
          description: "Focus on specific files",
          kind: "builtin",
          allowDuringAgentExecution: true,
          input: { hint: "scope" }
        }],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/f",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/focus "]);
    });
    test("config-action commands shadow runtime commands of the same name", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "plan", description: "runtime plan", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "task" } },
          { name: "compact", description: "runtime compact", kind: "builtin", allowDuringAgentExecution: true },
          { name: "runtime-only", description: "runtime only", kind: "client", allowDuringAgentExecution: true }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/",
        offset: 1
      }, CancellationToken.None);
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/compact ", "/runtime-only "].sort());
      const planItem = items.find((i) => i.insertText === "/plan ");
      assert.ok(planItem?.attachment?._meta?.action !== void 0);
    });
    test("uses runtime input metadata to determine trailing space insertion", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "no-input", description: "No input", kind: "builtin", allowDuringAgentExecution: true },
          { name: "needs-input", description: "Needs input", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "value" } }
        ],
        getSessionCustomizations: async () => []
      });
      const withInput = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/n",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(withInput.map((i) => i.insertText), ["/no-input ", "/needs-input "].sort());
    });
    test("expands input choices into one item per choice", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "toggle", description: "Toggle a feature on or off", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "", choices: [{ name: "on", description: "Turn the feature on" }, { name: "off", description: "Turn the feature off" }] } }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/t",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((item) => ({ insertText: item.insertText, meta: item.attachment?._meta })), [
        { insertText: "/toggle off ", meta: { command: "toggle", description: "Turn the feature off" } },
        { insertText: "/toggle on ", meta: { command: "toggle", description: "Turn the feature on" } }
      ]);
    });
    test("includes a bare command item when a choice has an empty name", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "toggle", description: "Toggle a feature on or off", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "", choices: [{ name: "", description: "Show the current state" }, { name: "on", description: "Turn on" }, { name: "off", description: "Turn off" }] } }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/t",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/toggle ", "/toggle off ", "/toggle on "]);
    });
    test("surfaces the free-text hint as an argument hint when there are no choices", async () => {
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => [
          { name: "toggle", description: "Toggle a feature on or off", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "[on|off]" } }
        ],
        getSessionCustomizations: async () => []
      });
      const items = await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: session,
        text: "/t",
        offset: 2
      }, CancellationToken.None);
      assert.deepStrictEqual(items.map((item) => ({ insertText: item.insertText, meta: item.attachment?._meta })), [
        { insertText: "/toggle ", meta: { command: "toggle", description: "Toggle a feature on or off", argumentHint: "[on|off]" } }
      ]);
    });
    test("passes raw session id to runtime command listing", async () => {
      let seen;
      const gated = new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async (id) => {
          seen = id;
          return [{ name: "focus", kind: "builtin", description: "Focus", allowDuringAgentExecution: true }];
        },
        getSessionCustomizations: async () => []
      });
      await gated.provideCompletionItems({
        kind: CompletionItemKind.UserMessage,
        channel: "copilotcli:/abc",
        text: "/f",
        offset: 2
      }, CancellationToken.None);
      assert.strictEqual(seen, "abc");
    });
  });
  suite("runtime skill completions", () => {
    const session = "copilotcli:/abc";
    function skill(name, description) {
      return {
        type: CustomizationType.Skill,
        id: `file:///skills/${name}/SKILL.md`,
        uri: `file:///skills/${name}/SKILL.md`,
        name,
        ...description !== void 0 ? { description } : {}
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
    function createProvider(runtimeCommands, customizations = []) {
      return new CopilotSlashCommandCompletionProvider("copilotcli", {
        isRubberDuckEnabled: () => true,
        getRuntimeSlashCommands: async () => runtimeCommands,
        getSessionCustomizations: async () => customizations
      });
    }
    async function run(provider, text, offset = text.length) {
      return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
    }
    test("includes runtime skills that are not known local skills", async () => {
      const provider = createProvider([
        { name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-skill "]);
    });
    test("excludes runtime skills that match a known plugin skill (with plugin prefix)", async () => {
      const provider = createProvider(
        [{ name: "my-plugin:my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("excludes runtime skills that match a known plugin skill with the same name (no prefix)", async () => {
      const provider = createProvider(
        [{ name: "monitor-pr", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("monitor-pr", [skill("monitor-pr")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("excludes runtime skills that match a known synced plugin skill (no prefix)", async () => {
      const provider = createProvider(
        [{ name: "monitor-pr", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [syncedPlugin("skills-bundle", [skill("monitor-pr")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items), []);
    });
    test("includes runtime skills whose name differs from the prefixed known skill candidate", async () => {
      const provider = createProvider(
        [{ name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-skill "]);
    });
    test("treats skills inside disabled containers as unknown", async () => {
      const provider = createProvider(
        [{ name: "my-plugin:my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [plugin("my-plugin", [skill("my-skill")], false)]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-plugin:my-skill "]);
    });
    test("ignores mcp server containers when computing known skills", async () => {
      const mcpServer = {
        type: CustomizationType.McpServer,
        id: "file:///mcp/my-skill",
        uri: "file:///mcp/my-skill",
        name: "my-skill",
        enabled: true,
        state: { kind: McpServerStatus.Ready }
      };
      const provider = createProvider(
        [{ name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }],
        [mcpServer]
      );
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/my-skill "]);
    });
    test("surfaces the skill prompt hint as an argument hint", async () => {
      const provider = createProvider([
        { name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true, input: { hint: "do stuff" } }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((item) => ({ insertText: item.insertText, type: item.attachment?.type, meta: item.attachment?._meta })), [
        {
          insertText: "/my-skill ",
          type: MessageAttachmentKind.Simple,
          meta: {
            command: "my-skill",
            description: "Runtime skill",
            argumentHint: "do stuff"
          }
        }
      ]);
    });
    test("does not expand a skill hint into option items", async () => {
      const provider = createProvider([
        { name: "toggle-skill", description: "Toggle skill", kind: "skill", allowDuringAgentExecution: true, input: { hint: "[on|off]" } }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/toggle-skill "]);
    });
    test("surfaces runtime skills alongside builtins for a leading slash", async () => {
      const provider = createProvider([
        { name: "compact", description: "Runtime compact", kind: "builtin", allowDuringAgentExecution: true },
        { name: "alpha-skill", description: "Alpha skill", kind: "skill", allowDuringAgentExecution: true }
      ]);
      const items = await run(provider, "/");
      assert.deepStrictEqual(runtimeOnly(items).map((i) => i.insertText), ["/compact ", "/alpha-skill "].sort());
    });
    test("returns only runtime skills for an in-message slash token", async () => {
      const provider = createProvider([
        { name: "plan", description: "Runtime plan", kind: "builtin", allowDuringAgentExecution: true, input: { hint: "task" } },
        { name: "runtime-only", description: "Client command", kind: "client", allowDuringAgentExecution: true },
        { name: "my-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
      ]);
      const items = await run(provider, "use /");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/my-skill "]);
    });
    test("excludes known skills even for an in-message slash token", async () => {
      const provider = createProvider(
        [
          { name: "my-plugin:my-skill", description: "Known skill", kind: "skill", allowDuringAgentExecution: true },
          { name: "other-skill", description: "Runtime skill", kind: "skill", allowDuringAgentExecution: true }
        ],
        [plugin("my-plugin", [skill("my-skill")])]
      );
      const items = await run(provider, "use /");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/other-skill "]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cywgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgU2tpbGxDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIsIElDb3BpbG90UnVudGltZVNsYXNoQ29tbWFuZEluZm8sIHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyLmpzJztcblxuLyoqXG4gKiBUaGUgcHJvdmlkZXIgbm93IGFsc28gaW5qZWN0cyB3b3JrYmVuY2gtZGVmaW5lZCBjb25maWctYWN0aW9uIGl0ZW1zXG4gKiAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZXMgbGlrZSBgL3lvbG9gLCBgL2F1dG9waWxvdGApIGludG8gZXZlcnkgbGVhZGluZy1zbGFzaFxuICogY29tcGxldGlvbiByZXN1bHQ7IHRoZXNlIGNhcnJ5IGFuIGBhY3Rpb25gIGJhZyBvbiB0aGVpciBhdHRhY2htZW50IGBfbWV0YWAuXG4gKiBUaGUgcnVudGltZS1mb2N1c2VkIGFzc2VydGlvbnMgYmVsb3cgZmlsdGVyIHRoZW0gb3V0IHdpdGggdGhpcyBoZWxwZXIgc28gdGhleVxuICoga2VlcCBhc3NlcnRpbmcgb24gdGhlIHJ1bnRpbWUgU0RLIGNvbW1hbmQgc2V0LiBSdW50aW1lIGNvbW1hbmRzIHdob3NlIG5hbWVcbiAqIGNvbGxpZGVzIHdpdGggYSBjb25maWctYWN0aW9uIGNvbW1hbmQgKGUuZy4gYHBsYW5gKSBhcmUgaW50ZW50aW9uYWxseSBkcm9wcGVkXG4gKiBieSB0aGUgcHJvdmlkZXIsIHNvIHRoZXkgbm8gbG9uZ2VyIGFwcGVhciBldmVuIGFmdGVyIGZpbHRlcmluZy5cbiAqL1xuZnVuY3Rpb24gcnVudGltZU9ubHkoaXRlbXM6IHJlYWRvbmx5IENvbXBsZXRpb25JdGVtW10pOiBDb21wbGV0aW9uSXRlbVtdIHtcblx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpID0+IGkuYXR0YWNobWVudD8uX21ldGE/LmFjdGlvbiA9PT0gdW5kZWZpbmVkKTtcbn1cblxuc3VpdGUoJ0NvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3BhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCcsICgpID0+IHtcblx0XHR0ZXN0KCdtYXRjaGVzIGxvbmUgL3BsYW4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3BsYW4nKSwgeyBjb21tYW5kOiAncGxhbicsIHJlc3Q6ICcnLCByYXdSZXN0OiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgbG9uZSAvY29tcGFjdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvY29tcGFjdCcpLCB7IGNvbW1hbmQ6ICdjb21wYWN0JywgcmVzdDogJycsIHJhd1Jlc3Q6ICcnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBsb25lIC9yZXNlYXJjaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcmVzZWFyY2gnKSwgeyBjb21tYW5kOiAncmVzZWFyY2gnLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0cmFpbGluZyB0ZXh0IGFmdGVyIGEgc3BhY2UgZm9yIC9yZXNlYXJjaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcmVzZWFyY2ggSG93IGRvZXMgUmVhY3Qgd29yaz8nKSwgeyBjb21tYW5kOiAncmVzZWFyY2gnLCByZXN0OiAnSG93IGRvZXMgUmVhY3Qgd29yaz8nLCByYXdSZXN0OiAnSG93IGRvZXMgUmVhY3Qgd29yaz8nIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBsb25lIC9ydWJiZXItZHVjaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcnViYmVyLWR1Y2snKSwgeyBjb21tYW5kOiAncnViYmVyLWR1Y2snLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGxvbmUgL2VudicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvZW52JyksIHsgY29tbWFuZDogJ2VudicsIHJlc3Q6ICcnLCByYXdSZXN0OiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgbG9uZSAvcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9yZXZpZXcnKSwgeyBjb21tYW5kOiAncmV2aWV3JywgcmVzdDogJycsIHJhd1Jlc3Q6ICcnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBsb25lIC9zZWN1cml0eS1yZXZpZXcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3NlY3VyaXR5LXJldmlldycpLCB7IGNvbW1hbmQ6ICdzZWN1cml0eS1yZXZpZXcnLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0cmFpbGluZyB0ZXh0IGFmdGVyIGEgc3BhY2UgZm9yIC9ydWJiZXItZHVjaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcnViYmVyLWR1Y2sgcmV2aWV3IG15IGFwcHJvYWNoJyksIHsgY29tbWFuZDogJ3J1YmJlci1kdWNrJywgcmVzdDogJ3JldmlldyBteSBhcHByb2FjaCcsIHJhd1Jlc3Q6ICdyZXZpZXcgbXkgYXBwcm9hY2gnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwdHVyZXMgdHJhaWxpbmcgdGV4dCBhZnRlciBhIHNwYWNlIGZvciAvZW52JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9lbnYgaWdub3JlZCBpbnB1dCcpLCB7IGNvbW1hbmQ6ICdlbnYnLCByZXN0OiAnaWdub3JlZCBpbnB1dCcsIHJhd1Jlc3Q6ICdpZ25vcmVkIGlucHV0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHR1cmVzIHRyYWlsaW5nIHRleHQgYWZ0ZXIgYSBzcGFjZSBmb3IgL3JldmlldycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcmV2aWV3IGZvY3VzIG9uIHRlc3RzJyksIHsgY29tbWFuZDogJ3JldmlldycsIHJlc3Q6ICdmb2N1cyBvbiB0ZXN0cycsIHJhd1Jlc3Q6ICdmb2N1cyBvbiB0ZXN0cycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0cmFpbGluZyB0ZXh0IGFmdGVyIGEgc3BhY2UgZm9yIC9zZWN1cml0eS1yZXZpZXcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL3NlY3VyaXR5LXJldmlldyBmb2N1cyBvbiBhdXRoJyksIHsgY29tbWFuZDogJ3NlY3VyaXR5LXJldmlldycsIHJlc3Q6ICdmb2N1cyBvbiBhdXRoJywgcmF3UmVzdDogJ2ZvY3VzIG9uIGF1dGgnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGFyYml0cmFyeSBzbGFzaCBjb21tYW5kIHRva2VucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcnViYmVyLWR1Y2stZXh0cmEnKSwgeyBjb21tYW5kOiAncnViYmVyLWR1Y2stZXh0cmEnLCByZXN0OiAnJywgcmF3UmVzdDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgbXVsdGlsaW5lIGNvbW1hbmQgaW5wdXQgYXMgcmF3UmVzdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvZm9vIGZpcnN0IGxpbmVcXG5zZWNvbmQgbGluZScpLCB7IGNvbW1hbmQ6ICdmb28nLCByZXN0OiAnZmlyc3QgbGluZVxcbnNlY29uZCBsaW5lJywgcmF3UmVzdDogJ2ZpcnN0IGxpbmVcXG5zZWNvbmQgbGluZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmltcyByZXN0IHdoaWxlIHJldGFpbmluZyByYXdSZXN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJy9mb28gICBwYWRkZWQgICcpLCB7IGNvbW1hbmQ6ICdmb28nLCByZXN0OiAncGFkZGVkJywgcmF3UmVzdDogJ3BhZGRlZCAgJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHR1cmVzIHRyYWlsaW5nIHRleHQgYWZ0ZXIgYSBzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKCcvcGxhbiBidWlsZCBhIGhlbGxvIHdvcmxkJyksIHsgY29tbWFuZDogJ3BsYW4nLCByZXN0OiAnYnVpbGQgYSBoZWxsbyB3b3JsZCcsIHJhd1Jlc3Q6ICdidWlsZCBhIGhlbGxvIHdvcmxkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcHR1cmVzIHRyYWlsaW5nIHRleHQgYWZ0ZXIgYSBzcGFjZSBmb3IgL2NvbXBhY3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL2NvbXBhY3Qgc29tZSB0ZXh0JyksIHsgY29tbWFuZDogJ2NvbXBhY3QnLCByZXN0OiAnc29tZSB0ZXh0JywgcmF3UmVzdDogJ3NvbWUgdGV4dCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGxlYWRpbmcgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQoJyAvY29tcGFjdCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyB1cHBlcmNhc2UgY29tbWFuZCB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCgnL1BMQU4nKSwgeyBjb21tYW5kOiAnUExBTicsIHJlc3Q6ICcnLCByYXdSZXN0OiAnJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Byb3ZpZGVDb21wbGV0aW9uSXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcnVudGltZUNvbW1hbmRzID0gW1xuXHRcdFx0eyBuYW1lOiAncGxhbicsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBwbGFuJywga2luZDogJ2J1aWx0aW4nIGFzIGNvbnN0LCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAndGFzaycgfSB9LFxuXHRcdFx0eyBuYW1lOiAnY29tcGFjdCcsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBjb21wYWN0Jywga2luZDogJ2J1aWx0aW4nIGFzIGNvbnN0LCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHR7IG5hbWU6ICdyZXNlYXJjaCcsIGRlc2NyaXB0aW9uOiAnUnVudGltZSByZXNlYXJjaCcsIGtpbmQ6ICdidWlsdGluJyBhcyBjb25zdCwgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ3F1ZXJ5JyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdydWJiZXItZHVjaycsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBydWJiZXItZHVjaycsIGtpbmQ6ICdidWlsdGluJyBhcyBjb25zdCwgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ3JldmlldyBwcm9tcHQnIH0gfSxcblx0XHRcdHsgbmFtZTogJ2VudicsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBlbnYnLCBraW5kOiAnYnVpbHRpbicgYXMgY29uc3QsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdHsgbmFtZTogJ3JldmlldycsIGRlc2NyaXB0aW9uOiAnUnVudGltZSByZXZpZXcnLCBraW5kOiAnYnVpbHRpbicgYXMgY29uc3QsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdzY29wZScgfSB9LFxuXHRcdFx0eyBuYW1lOiAnc2VjdXJpdHktcmV2aWV3JywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNlY3VyaXR5IHJldmlldycsIGtpbmQ6ICdidWlsdGluJyBhcyBjb25zdCwgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ3Njb3BlJyB9IH0sXG5cdFx0XTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzOiBhc3luYyAoKSA9PiBydW50aW1lQ29tbWFuZHMsXG5cdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSAnY29waWxvdGNsaTovYWJjJztcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHJ1bih0ZXh0OiBzdHJpbmcsIG9mZnNldCA9IHRleHQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dCwgb2Zmc2V0IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldHVybnMgbm90aGluZyBmb3Igbm9uLWNvcGlsb3RjbGkgc2NoZW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHtcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLFxuXHRcdFx0XHRjaGFubmVsOiAnY2xhdWRlOi9hYmMnLFxuXHRcdFx0XHR0ZXh0OiAnLycsXG5cdFx0XHRcdG9mZnNldDogMSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBhbGwgcnVudGltZSBpdGVtcyBmb3IgbG9uZSBcIi9cIiAoY29uZmlnLWFjdGlvbiBpdGVtcyBmaWx0ZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignLycpO1xuXHRcdFx0Ly8gYHBsYW5gIGNvbGxpZGVzIHdpdGggYSBjb25maWctYWN0aW9uIGNvbW1hbmQgYW5kIGlzIGRyb3BwZWQgZnJvbSB0aGUgcnVudGltZSBzZXQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKS5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9jb21wYWN0ICcsICcvcmVzZWFyY2ggJywgJy9ydWJiZXItZHVjayAnLCAnL2VudiAnLCAnL3JldmlldyAnLCAnL3NlY3VyaXR5LXJldmlldyAnXS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5qZWN0cyBjb25maWctYWN0aW9uIGl0ZW1zIChwZXJtaXNzaW9uL21vZGUgdG9nZ2xlcykgZm9yIGEgbGVhZGluZyBzbGFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvJyk7XG5cdFx0XHRjb25zdCBieUxhYmVsID0gbmV3IE1hcChpdGVtcy5maWx0ZXIoaSA9PiBpLmF0dGFjaG1lbnQ/Ll9tZXRhPy5hY3Rpb24gIT09IHVuZGVmaW5lZCkubWFwKGkgPT4gW2kuYXR0YWNobWVudD8ubGFiZWwsIGldKSk7XG5cdFx0XHRhc3NlcnQub2soYnlMYWJlbC5oYXMoJy95b2xvIG9uJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ5TGFiZWwuaGFzKCcvYXV0b3BpbG90IG9uJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ5TGFiZWwuZ2V0KCcvYXV0b3BpbG90Jyk/Lmluc2VydFRleHQsICcvYXV0b3BpbG90ICcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyB0byAvcGxhbiB3aGVuIFwiL3BcIiB0eXBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvcCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9wbGFuICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgdG8gL2NvbXBhY3Qgd2hlbiBcIi9jXCIgdHlwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL2MnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvY29tcGFjdCAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmdXp6eSBtYXRjaGVzIC9jb21wYWN0IHdoZW4gXCIvY2NcIiB0eXBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvY2MnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvY29tcGFjdCAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIHRvIC9lbnYgd2hlbiBcIi9lXCIgdHlwZWQgYW5kIHJ1bnRpbWUgY29tbWFuZCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL2UnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvZW52ICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgdG8gL3Jlc2VhcmNoIGFuZCAvcnViYmVyLWR1Y2sgd2hlbiBcIi9yXCIgdHlwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL3InKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgW1xuXHRcdFx0XHQnL3Jlc2VhcmNoICcsXG5cdFx0XHRcdCcvcmV2aWV3ICcsXG5cdFx0XHRcdCcvcnViYmVyLWR1Y2sgJ1xuXHRcdFx0XS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyB0byAvc2VjdXJpdHktcmV2aWV3IHdoZW4gXCIvc1wiIHR5cGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9zJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL3NlY3VyaXR5LXJldmlldyAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vdGhpbmcgd2hlbiAvd29yZCBkb2VzIG5vdCBtYXRjaCBhbnkgY29tbWFuZCBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL3p6Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vdGhpbmcgd2hlbiBpbnB1dCBkb2VzIG5vdCBzdGFydCB3aXRoIC8nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignaGVsbG8gL3BsJywgOSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vdGhpbmcgd2hlbiBjdXJzb3IgaXMgcGFzdCB0aGUgbGVhZGluZyB3b3JkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQ3Vyc29yIHNpdHMgYWZ0ZXIgdGhlIHRyYWlsaW5nIHNwYWNlLCBubyBsb25nZXIgaW4gdGhlIHNsYXNoIHRva2VuLlxuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9wbGFuICcsIDYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmFuZ2UgY292ZXJzIG9ubHkgdGhlIGxlYWRpbmcgc2xhc2ggd29yZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvcCBleHRyYSB0ZXh0JywgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5yYW5nZVN0YXJ0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5yYW5nZUVuZCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdHRhY2htZW50IGlzIFNpbXBsZSB3aXRoIGNvbW1hbmQgKyBkZXNjcmlwdGlvbiBtZXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpdGVtID0+ICh7IGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCwgdHlwZTogaXRlbS5hdHRhY2htZW50Py50eXBlLCBtZXRhOiBpdGVtLmF0dGFjaG1lbnQ/Ll9tZXRhIH0pKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJy9jb21wYWN0ICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnY29tcGFjdCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bnRpbWUgY29tcGFjdCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICcvZW52ICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnZW52Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVudGltZSBlbnYnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnL3Jlc2VhcmNoICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAncmVzZWFyY2gnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW50aW1lIHJlc2VhcmNoJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50SGludDogJ3F1ZXJ5Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJy9yZXZpZXcgJyxcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRcdG1ldGE6IHtcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdyZXZpZXcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW50aW1lIHJldmlldycsXG5cdFx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6ICdzY29wZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICcvcnViYmVyLWR1Y2sgJyxcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRcdG1ldGE6IHtcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdydWJiZXItZHVjaycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bnRpbWUgcnViYmVyLWR1Y2snLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRIaW50OiAncmV2aWV3IHByb21wdCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGluc2VydFRleHQ6ICcvc2VjdXJpdHktcmV2aWV3ICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnc2VjdXJpdHktcmV2aWV3Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVudGltZSBzZWN1cml0eSByZXZpZXcnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRIaW50OiAnc2NvcGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIC9ydWJiZXItZHVjayB3aGVuIG5vdCBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzOiBhc3luYyAoKSA9PiBydW50aW1lQ29tbWFuZHMsXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy8nLCBvZmZzZXQ6IDEsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFtcblx0XHRcdFx0Jy9jb21wYWN0ICcsXG5cdFx0XHRcdCcvZW52ICcsXG5cdFx0XHRcdCcvcmVzZWFyY2ggJyxcblx0XHRcdFx0Jy9yZXZpZXcgJyxcblx0XHRcdFx0Jy9zZWN1cml0eS1yZXZpZXcgJ1xuXHRcdFx0XS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBubyBjb21wbGV0aW9uIGl0ZW1zIHdoZW4gcnVudGltZSBjb21tYW5kIGxpc3QgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy8nLCBvZmZzZXQ6IDEsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIG91dCBydW50aW1lIGNvbW1hbmRzIG9taXR0ZWQgZnJvbSB0aGUgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdhdGVkID0gbmV3IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIoJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzOiBhc3luYyAoKSA9PiBydW50aW1lQ29tbWFuZHMuZmlsdGVyKGNvbW1hbmQgPT4gY29tbWFuZC5uYW1lICE9PSAnZW52JyksXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy8nLCBvZmZzZXQ6IDEsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIGBwbGFuYCBjb2xsaWRlcyB3aXRoIGEgY29uZmlnLWFjdGlvbiBjb21tYW5kIGFuZCBpcyBkcm9wcGVkIGZyb20gdGhlIHJ1bnRpbWUgc2V0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgW1xuXHRcdFx0XHQnL2NvbXBhY3QgJyxcblx0XHRcdFx0Jy9yZXNlYXJjaCAnLFxuXHRcdFx0XHQnL3JldmlldyAnLFxuXHRcdFx0XHQnL3J1YmJlci1kdWNrICcsXG5cdFx0XHRcdCcvc2VjdXJpdHktcmV2aWV3ICcsXG5cdFx0XHRdLnNvcnQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBydW50aW1lIFNESyBjb21tYW5kcyBpbiBjb21wbGV0aW9uIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW3tcblx0XHRcdFx0XHRuYW1lOiAnZm9jdXMnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRm9jdXMgb24gc3BlY2lmaWMgZmlsZXMnLFxuXHRcdFx0XHRcdGtpbmQ6ICdidWlsdGluJyxcblx0XHRcdFx0XHRhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdGlucHV0OiB7IGhpbnQ6ICdzY29wZScgfSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGdldFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvbiwgdGV4dDogJy9mJywgb2Zmc2V0OiAyLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL2ZvY3VzICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmZpZy1hY3Rpb24gY29tbWFuZHMgc2hhZG93IHJ1bnRpbWUgY29tbWFuZHMgb2YgdGhlIHNhbWUgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdhdGVkID0gbmV3IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIoJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzOiBhc3luYyAoKSA9PiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAncGxhbicsIGRlc2NyaXB0aW9uOiAncnVudGltZSBwbGFuJywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAndGFzaycgfSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ2NvbXBhY3QnLCBkZXNjcmlwdGlvbjogJ3J1bnRpbWUgY29tcGFjdCcsIGtpbmQ6ICdidWlsdGluJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ3J1bnRpbWUtb25seScsIGRlc2NyaXB0aW9uOiAncnVudGltZSBvbmx5Jywga2luZDogJ2NsaWVudCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBnYXRlZC5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHtcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uLCB0ZXh0OiAnLycsIG9mZnNldDogMSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Ly8gYHBsYW5gIGNvbGxpZGVzIHdpdGggYSBjb25maWctYWN0aW9uIGNvbW1hbmQsIHNvIHRoZSBydW50aW1lIGBwbGFuYCBpc1xuXHRcdFx0Ly8gZHJvcHBlZDsgbm9uLWNvbGxpZGluZyBydW50aW1lIGNvbW1hbmRzIGFyZSBrZXB0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvY29tcGFjdCAnLCAnL3J1bnRpbWUtb25seSAnXS5zb3J0KCkpO1xuXHRcdFx0Ly8gVGhlIGNvbmZpZy1hY3Rpb24gYC9wbGFuIGAgaXRlbSBpcyBzdGlsbCBzdXJmYWNlZCAoY2FycnlpbmcgYW4gYWN0aW9uIGJhZykuXG5cdFx0XHRjb25zdCBwbGFuSXRlbSA9IGl0ZW1zLmZpbmQoaSA9PiBpLmluc2VydFRleHQgPT09ICcvcGxhbiAnKTtcblx0XHRcdGFzc2VydC5vayhwbGFuSXRlbT8uYXR0YWNobWVudD8uX21ldGE/LmFjdGlvbiAhPT0gdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgcnVudGltZSBpbnB1dCBtZXRhZGF0YSB0byBkZXRlcm1pbmUgdHJhaWxpbmcgc3BhY2UgaW5zZXJ0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2F0ZWQgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFtcblx0XHRcdFx0XHR7IG5hbWU6ICduby1pbnB1dCcsIGRlc2NyaXB0aW9uOiAnTm8gaW5wdXQnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICduZWVkcy1pbnB1dCcsIGRlc2NyaXB0aW9uOiAnTmVlZHMgaW5wdXQnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICd2YWx1ZScgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB3aXRoSW5wdXQgPSBhd2FpdCBnYXRlZC5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHtcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uLCB0ZXh0OiAnL24nLCBvZmZzZXQ6IDIsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2l0aElucHV0Lm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL25vLWlucHV0ICcsICcvbmVlZHMtaW5wdXQgJ10uc29ydCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cGFuZHMgaW5wdXQgY2hvaWNlcyBpbnRvIG9uZSBpdGVtIHBlciBjaG9pY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3RvZ2dsZScsIGRlc2NyaXB0aW9uOiAnVG9nZ2xlIGEgZmVhdHVyZSBvbiBvciBvZmYnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICcnLCBjaG9pY2VzOiBbeyBuYW1lOiAnb24nLCBkZXNjcmlwdGlvbjogJ1R1cm4gdGhlIGZlYXR1cmUgb24nIH0sIHsgbmFtZTogJ29mZicsIGRlc2NyaXB0aW9uOiAnVHVybiB0aGUgZmVhdHVyZSBvZmYnIH1dIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBnYXRlZC5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHtcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uLCB0ZXh0OiAnL3QnLCBvZmZzZXQ6IDIsXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIFN0cnVjdHVyZWQgY2hvaWNlcyBleHBhbmQgaW50byBvbmUgaXRlbSBwZXIgY2hvaWNlLCBlYWNoIGNhcnJ5aW5nIGl0cyBvd24gZGVzY3JpcHRpb24uXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpdGVtID0+ICh7IGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCwgbWV0YTogaXRlbS5hdHRhY2htZW50Py5fbWV0YSB9KSksIFtcblx0XHRcdFx0eyBpbnNlcnRUZXh0OiAnL3RvZ2dsZSBvZmYgJywgbWV0YTogeyBjb21tYW5kOiAndG9nZ2xlJywgZGVzY3JpcHRpb246ICdUdXJuIHRoZSBmZWF0dXJlIG9mZicgfSB9LFxuXHRcdFx0XHR7IGluc2VydFRleHQ6ICcvdG9nZ2xlIG9uICcsIG1ldGE6IHsgY29tbWFuZDogJ3RvZ2dsZScsIGRlc2NyaXB0aW9uOiAnVHVybiB0aGUgZmVhdHVyZSBvbicgfSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBhIGJhcmUgY29tbWFuZCBpdGVtIHdoZW4gYSBjaG9pY2UgaGFzIGFuIGVtcHR5IG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3RvZ2dsZScsIGRlc2NyaXB0aW9uOiAnVG9nZ2xlIGEgZmVhdHVyZSBvbiBvciBvZmYnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICcnLCBjaG9pY2VzOiBbeyBuYW1lOiAnJywgZGVzY3JpcHRpb246ICdTaG93IHRoZSBjdXJyZW50IHN0YXRlJyB9LCB7IG5hbWU6ICdvbicsIGRlc2NyaXB0aW9uOiAnVHVybiBvbicgfSwgeyBuYW1lOiAnb2ZmJywgZGVzY3JpcHRpb246ICdUdXJuIG9mZicgfV0gfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQ6ICcvdCcsIG9mZnNldDogMixcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Ly8gQSBjaG9pY2Ugd2l0aCBhbiBlbXB0eSBuYW1lIHByb2R1Y2VzIHRoZSBiYXJlIGNvbW1hbmQgYWxvbmdzaWRlIHRoZSBvdGhlciBvcHRpb25zLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy90b2dnbGUgJywgJy90b2dnbGUgb2ZmICcsICcvdG9nZ2xlIG9uICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cmZhY2VzIHRoZSBmcmVlLXRleHQgaGludCBhcyBhbiBhcmd1bWVudCBoaW50IHdoZW4gdGhlcmUgYXJlIG5vIGNob2ljZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnYXRlZCA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyKCdjb3BpbG90Y2xpJywge1xuXHRcdFx0XHRpc1J1YmJlckR1Y2tFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogYXN5bmMgKCkgPT4gW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3RvZ2dsZScsIGRlc2NyaXB0aW9uOiAnVG9nZ2xlIGEgZmVhdHVyZSBvbiBvciBvZmYnLCBraW5kOiAnYnVpbHRpbicsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUsIGlucHV0OiB7IGhpbnQ6ICdbb258b2ZmXScgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGdhdGVkLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoe1xuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQ6ICcvdCcsIG9mZnNldDogMixcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Ly8gV2l0aG91dCBzdHJ1Y3R1cmVkIGNob2ljZXMsIHRoZSBmcmVlLXRleHQgaGludCBpcyBub3QgZXhwYW5kZWQgaW50byBvcHRpb25zOyBpdCBpcyBzdXJmYWNlZCBhcyBhbiBhcmd1bWVudCBoaW50IG9uIGEgc2luZ2xlIGl0ZW0uXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpdGVtID0+ICh7IGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCwgbWV0YTogaXRlbS5hdHRhY2htZW50Py5fbWV0YSB9KSksIFtcblx0XHRcdFx0eyBpbnNlcnRUZXh0OiAnL3RvZ2dsZSAnLCBtZXRhOiB7IGNvbW1hbmQ6ICd0b2dnbGUnLCBkZXNjcmlwdGlvbjogJ1RvZ2dsZSBhIGZlYXR1cmUgb24gb3Igb2ZmJywgYXJndW1lbnRIaW50OiAnW29ufG9mZl0nIH0gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHJhdyBzZXNzaW9uIGlkIHRvIHJ1bnRpbWUgY29tbWFuZCBsaXN0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHNlZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGdhdGVkID0gbmV3IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIoJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRcdGlzUnViYmVyRHVja0VuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzOiBhc3luYyAoaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdHNlZW4gPSBpZDtcblx0XHRcdFx0XHRyZXR1cm4gW3sgbmFtZTogJ2ZvY3VzJywga2luZDogJ2J1aWx0aW4nLCBkZXNjcmlwdGlvbjogJ0ZvY3VzJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9XTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZ2F0ZWQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyh7XG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogJ2NvcGlsb3RjbGk6L2FiYycsIHRleHQ6ICcvZicsIG9mZnNldDogMixcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW4sICdhYmMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3J1bnRpbWUgc2tpbGwgY29tcGxldGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9ICdjb3BpbG90Y2xpOi9hYmMnO1xuXG5cdFx0ZnVuY3Rpb24gc2tpbGwobmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IFNraWxsQ3VzdG9taXphdGlvbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCxcblx0XHRcdFx0aWQ6IGBmaWxlOi8vL3NraWxscy8ke25hbWV9L1NLSUxMLm1kYCxcblx0XHRcdFx0dXJpOiBgZmlsZTovLy9za2lsbHMvJHtuYW1lfS9TS0lMTC5tZGAsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdC4uLihkZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkID8geyBkZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBwbHVnaW4obmFtZTogc3RyaW5nLCBjaGlsZHJlbj86IHJlYWRvbmx5IFNraWxsQ3VzdG9taXphdGlvbltdLCBlbmFibGVkID0gdHJ1ZSk6IFBsdWdpbkN1c3RvbWl6YXRpb24ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRpZDogYGZpbGU6Ly8vcGx1Z2lucy8ke25hbWV9YCxcblx0XHRcdFx0dXJpOiBgZmlsZTovLy9wbHVnaW5zLyR7bmFtZX1gLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRlbmFibGVkLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHQuLi4oY2hpbGRyZW4gPyB7IGNoaWxkcmVuOiBbLi4uY2hpbGRyZW5dIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHN5bmNlZFBsdWdpbihuYW1lOiBzdHJpbmcsIGNoaWxkcmVuPzogcmVhZG9ubHkgU2tpbGxDdXN0b21pemF0aW9uW10pOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnBsdWdpbihuYW1lLCBjaGlsZHJlbiksXG5cdFx0XHRcdGlkOiBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi9wbHVnaW5zLyR7bmFtZX1gLFxuXHRcdFx0XHR1cmk6IGAke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06L3BsdWdpbnMvJHtuYW1lfWAsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyKHJ1bnRpbWVDb21tYW5kczogcmVhZG9ubHkgSUNvcGlsb3RSdW50aW1lU2xhc2hDb21tYW5kSW5mb1tdLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW10pOiBDb3BpbG90U2xhc2hDb21tYW5kQ29tcGxldGlvblByb3ZpZGVyIHtcblx0XHRcdHJldHVybiBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlcignY29waWxvdGNsaScsIHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Z2V0UnVudGltZVNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IHJ1bnRpbWVDb21tYW5kcyxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoKSA9PiBjdXN0b21pemF0aW9ucyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHJ1bihwcm92aWRlcjogQ29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlciwgdGV4dDogc3RyaW5nLCBvZmZzZXQgPSB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoeyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQsIG9mZnNldCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBydW50aW1lIHNraWxscyB0aGF0IGFyZSBub3Qga25vd24gbG9jYWwgc2tpbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihbXG5cdFx0XHRcdHsgbmFtZTogJ215LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL215LXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHJ1bnRpbWUgc2tpbGxzIHRoYXQgbWF0Y2ggYSBrbm93biBwbHVnaW4gc2tpbGwgKHdpdGggcGx1Z2luIHByZWZpeCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbXktcGx1Z2luOm15LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9XSxcblx0XHRcdFx0W3BsdWdpbignbXktcGx1Z2luJywgW3NraWxsKCdteS1za2lsbCcpXSldLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHJ1bnRpbWUgc2tpbGxzIHRoYXQgbWF0Y2ggYSBrbm93biBwbHVnaW4gc2tpbGwgd2l0aCB0aGUgc2FtZSBuYW1lIChubyBwcmVmaXgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihcblx0XHRcdFx0W3sgbmFtZTogJ21vbml0b3ItcHInLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH1dLFxuXHRcdFx0XHRbcGx1Z2luKCdtb25pdG9yLXByJywgW3NraWxsKCdtb25pdG9yLXByJyldKV0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bnRpbWVPbmx5KGl0ZW1zKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgcnVudGltZSBza2lsbHMgdGhhdCBtYXRjaCBhIGtub3duIHN5bmNlZCBwbHVnaW4gc2tpbGwgKG5vIHByZWZpeCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbW9uaXRvci1wcicsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfV0sXG5cdFx0XHRcdFtzeW5jZWRQbHVnaW4oJ3NraWxscy1idW5kbGUnLCBbc2tpbGwoJ21vbml0b3ItcHInKV0pXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBydW50aW1lIHNraWxscyB3aG9zZSBuYW1lIGRpZmZlcnMgZnJvbSB0aGUgcHJlZml4ZWQga25vd24gc2tpbGwgY2FuZGlkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQSBub24tc3luY2VkIHBsdWdpbiBza2lsbCBpcyBrbm93biBhcyBgbXktcGx1Z2luOm15LXNraWxsYCwgc28gYSBiYXJlIGBteS1za2lsbGAgcnVudGltZSBza2lsbCBpcyBzdGlsbCBzdXJmYWNlZC5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoXG5cdFx0XHRcdFt7IG5hbWU6ICdteS1za2lsbCcsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfV0sXG5cdFx0XHRcdFtwbHVnaW4oJ215LXBsdWdpbicsIFtza2lsbCgnbXktc2tpbGwnKV0pXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL215LXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyZWF0cyBza2lsbHMgaW5zaWRlIGRpc2FibGVkIGNvbnRhaW5lcnMgYXMgdW5rbm93bicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoXG5cdFx0XHRcdFt7IG5hbWU6ICdteS1wbHVnaW46bXktc2tpbGwnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH1dLFxuXHRcdFx0XHRbcGx1Z2luKCdteS1wbHVnaW4nLCBbc2tpbGwoJ215LXNraWxsJyldLCBmYWxzZSldLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvbXktcGx1Z2luOm15LXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgbWNwIHNlcnZlciBjb250YWluZXJzIHdoZW4gY29tcHV0aW5nIGtub3duIHNraWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1jcFNlcnZlcjogQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0XHRpZDogJ2ZpbGU6Ly8vbWNwL215LXNraWxsJyxcblx0XHRcdFx0dXJpOiAnZmlsZTovLy9tY3AvbXktc2tpbGwnLFxuXHRcdFx0XHRuYW1lOiAnbXktc2tpbGwnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbeyBuYW1lOiAnbXktc2tpbGwnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH1dLFxuXHRcdFx0XHRbbWNwU2VydmVyXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVudGltZU9ubHkoaXRlbXMpLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL215LXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cmZhY2VzIHRoZSBza2lsbCBwcm9tcHQgaGludCBhcyBhbiBhcmd1bWVudCBoaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihbXG5cdFx0XHRcdHsgbmFtZTogJ215LXNraWxsJywgZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ2RvIHN0dWZmJyB9IH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGl0ZW0gPT4gKHsgaW5zZXJ0VGV4dDogaXRlbS5pbnNlcnRUZXh0LCB0eXBlOiBpdGVtLmF0dGFjaG1lbnQ/LnR5cGUsIG1ldGE6IGl0ZW0uYXR0YWNobWVudD8uX21ldGEgfSkpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnL215LXNraWxsICcsXG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRtZXRhOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnbXktc2tpbGwnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW50aW1lIHNraWxsJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50SGludDogJ2RvIHN0dWZmJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBleHBhbmQgYSBza2lsbCBoaW50IGludG8gb3B0aW9uIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihbXG5cdFx0XHRcdHsgbmFtZTogJ3RvZ2dsZS1za2lsbCcsIGRlc2NyaXB0aW9uOiAnVG9nZ2xlIHNraWxsJywga2luZDogJ3NraWxsJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSwgaW5wdXQ6IHsgaGludDogJ1tvbnxvZmZdJyB9IH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvdG9nZ2xlLXNraWxsICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cmZhY2VzIHJ1bnRpbWUgc2tpbGxzIGFsb25nc2lkZSBidWlsdGlucyBmb3IgYSBsZWFkaW5nIHNsYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihbXG5cdFx0XHRcdHsgbmFtZTogJ2NvbXBhY3QnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgY29tcGFjdCcsIGtpbmQ6ICdidWlsdGluJywgYWxsb3dEdXJpbmdBZ2VudEV4ZWN1dGlvbjogdHJ1ZSB9LFxuXHRcdFx0XHR7IG5hbWU6ICdhbHBoYS1za2lsbCcsIGRlc2NyaXB0aW9uOiAnQWxwaGEgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW50aW1lT25seShpdGVtcykubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvY29tcGFjdCAnLCAnL2FscGhhLXNraWxsICddLnNvcnQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG9ubHkgcnVudGltZSBza2lsbHMgZm9yIGFuIGluLW1lc3NhZ2Ugc2xhc2ggdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFtcblx0XHRcdFx0eyBuYW1lOiAncGxhbicsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBwbGFuJywga2luZDogJ2J1aWx0aW4nLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlLCBpbnB1dDogeyBoaW50OiAndGFzaycgfSB9LFxuXHRcdFx0XHR7IG5hbWU6ICdydW50aW1lLW9ubHknLCBkZXNjcmlwdGlvbjogJ0NsaWVudCBjb21tYW5kJywga2luZDogJ2NsaWVudCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0eyBuYW1lOiAnbXktc2tpbGwnLCBkZXNjcmlwdGlvbjogJ1J1bnRpbWUgc2tpbGwnLCBraW5kOiAnc2tpbGwnLCBhbGxvd0R1cmluZ0FnZW50RXhlY3V0aW9uOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAndXNlIC8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvbXktc2tpbGwgJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMga25vd24gc2tpbGxzIGV2ZW4gZm9yIGFuIGluLW1lc3NhZ2Ugc2xhc2ggdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBuYW1lOiAnbXktcGx1Z2luOm15LXNraWxsJywgZGVzY3JpcHRpb246ICdLbm93biBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdvdGhlci1za2lsbCcsIGRlc2NyaXB0aW9uOiAnUnVudGltZSBza2lsbCcsIGtpbmQ6ICdza2lsbCcsIGFsbG93RHVyaW5nQWdlbnRFeGVjdXRpb246IHRydWUgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W3BsdWdpbignbXktcGx1Z2luJywgW3NraWxsKCdteS1za2lsbCcpXSldLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAndXNlIC8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvb3RoZXItc2tpbGwgJ10pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUNBQW1DO0FBQzVDLFNBQXlCLDBCQUEwQjtBQUNuRCxTQUF3Qix5QkFBeUIsbUJBQW1CLGlCQUFpQiw2QkFBZ0Y7QUFDckssU0FBUyx1Q0FBd0UsZ0NBQWdDO0FBV2pILFNBQVMsWUFBWSxPQUFvRDtBQUN4RSxTQUFPLE1BQU0sT0FBTyxPQUFLLEVBQUUsWUFBWSxPQUFPLFdBQVcsTUFBUztBQUNuRTtBQUVBLE1BQU0seUNBQXlDLE1BQU07QUFFcEQsMENBQXdDO0FBRXhDLFFBQU0sNEJBQTRCLE1BQU07QUFDdkMsU0FBSyxzQkFBc0IsTUFB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
