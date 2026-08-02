import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { CompletionTriggerKind } from "../../../../../../../editor/common/languages.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
import { IChatModeService } from "../../../../common/chatModes.js";
import { PromptHeaderAutocompletion } from "../../../../common/promptSyntax/languageProviders/promptHeaderAutocompletion.js";
import { IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { getLanguageIdForPromptsType, PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { MockChatModeService } from "../../../common/mockChatModeService.js";
suite("PromptHeaderAutocompletion", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let completionProvider;
  setup(async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
    instaService = workbenchInstantiationService({
      contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, disposables);
    const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
    const testTool1 = { id: "testTool1", displayName: "tool1", canBeReferencedInPrompt: true, modelDescription: "Test Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool1));
    const testTool2 = { id: "testTool2", displayName: "tool2", canBeReferencedInPrompt: true, toolReferenceName: "tool2", modelDescription: "Test Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool2));
    instaService.set(ILanguageModelToolsService, toolService);
    const testModels = [
      { id: "mae-4", name: "MAE 4", vendor: "olama", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "mae-4.1", name: "MAE 4.1", vendor: "copilot", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "gpt-4", name: "GPT 4", vendor: "openai", version: "1.0", family: "gpt", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: false, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "bg-agent-model", name: "BG Agent Model", vendor: "copilot", version: "1.0", family: "bg", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true }, targetChatSessionType: "background" }
    ];
    instaService.stub(ILanguageModelsService, {
      getLanguageModelIds() {
        return testModels.map((m) => m.id);
      },
      lookupLanguageModel(name) {
        return testModels.find((m) => m.id === name);
      }
    });
    const customAgent = {
      id: "agent1",
      name: "agent1",
      description: "Agent file 1.",
      agentInstructions: {
        content: "",
        toolReferences: [],
        metadata: void 0
      },
      uri: URI.parse("myFs://.github/agents/agent1.agent.md"),
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true
    };
    const parser = new PromptFileParser();
    instaService.stub(IPromptsService, {
      getParsedPromptFile(model) {
        return parser.parse(model.uri, model.getValue());
      },
      async getCustomAgents(token) {
        return Promise.resolve([customAgent]);
      }
    });
    instaService.stub(IChatModeService, new MockChatModeService());
    completionProvider = instaService.createInstance(PromptHeaderAutocompletion);
  });
  async function getCompletions(content, promptType, uri) {
    const languageId = getLanguageIdForPromptsType(promptType);
    uri ??= URI.parse("test:///test" + getPromptFileExtension(promptType));
    const model = disposables.add(createTextModel(content, languageId, void 0, uri));
    const lineColumnMarkerRange = model.findNextMatch("|", new Position(1, 1), false, false, "", false)?.range;
    assert.ok(lineColumnMarkerRange, "No completion marker found in test content");
    model.applyEdits([{ range: lineColumnMarkerRange, text: "" }]);
    const position = lineColumnMarkerRange.getStartPosition();
    const context = { triggerKind: CompletionTriggerKind.Invoke };
    const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
    if (!result || !result.suggestions) {
      return [];
    }
    const lineContent = model.getLineContent(position.lineNumber);
    return result.suggestions.map((s) => {
      assert(s.range instanceof Range);
      return {
        label: typeof s.label === "string" ? s.label : s.label.label,
        result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
      };
    });
  }
  const sortByLabel = (a, b) => a.label.localeCompare(b.label);
  suite("agent header completions", () => {
    test("complete model attribute name", async () => {
      const content = [
        "---",
        'description: "Test"',
        "|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agents", result: 'agents: ${0:["*"]}' },
        { label: "argument-hint", result: "argument-hint: $0" },
        { label: "disable-model-invocation", result: "disable-model-invocation: ${0:true}" },
        { label: "github", result: "github: $0" },
        { label: "handoffs", result: "handoffs: $0" },
        { label: "hooks", result: 'hooks:\n  ${1|SessionStart,SessionEnd,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop,ErrorOccurred|}:\n    - type: command\n      command: "$2"' },
        { label: "model", result: "model: ${0:MAE 4 (olama)}" },
        { label: "name", result: "name: $0" },
        { label: "target", result: "target: ${0:vscode}" },
        { label: "tools", result: "tools: ${0:[]}" },
        { label: "user-invocable", result: "user-invocable: ${0:true}" }
      ].sort(sortByLabel));
    });
    test("complete model attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4 (olama)", result: "model: MAE 4 (olama)" },
        { label: "MAE 4.1 (copilot)", result: "model: MAE 4.1 (copilot)" }
      ].sort(sortByLabel));
    });
    test("complete model attribute value with partial input", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: MA|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual, [
        { label: "MAE 4 (olama)", result: "model: MAE 4 (olama)" },
        { label: "MAE 4.1 (copilot)", result: "model: MAE 4.1 (copilot)" }
      ]);
    });
    test("complete model names inside model array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4 (olama)", result: `model: ['MAE 4 (olama)']` },
        { label: "MAE 4.1 (copilot)", result: `model: ['MAE 4.1 (copilot)']` }
      ].sort(sortByLabel));
    });
    test("complete model names inside model array with existing entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `model: ['MAE 4 (olama)', |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4.1 (copilot)", result: `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "tools: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: [agent]` },
        { label: "execute", result: `tools: [execute]` },
        { label: "read", result: `tools: [read]` },
        { label: "tool1", result: `tools: [tool1]` },
        { label: "tool2", result: `tools: [tool2]` },
        { label: "vscode", result: `tools: [vscode]` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing single quoted entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['read', |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: ['read', 'agent']` },
        { label: "execute", result: `tools: ['read', 'execute']` },
        { label: "tool1", result: `tools: ['read', 'tool1']` },
        { label: "tool2", result: `tools: ['read', 'tool2']` },
        { label: "vscode", result: `tools: ['read', 'vscode']` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing double quoted entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ["read", "tool1", |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: ["read", "tool1", "agent"]` },
        { label: "execute", result: `tools: ["read", "tool1", "execute"]` },
        { label: "tool2", result: `tools: ["read", "tool1", "tool2"]` },
        { label: "vscode", result: `tools: ["read", "tool1", "vscode"]` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing unquoted entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: [read, "tool1", |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: [read, "tool1", agent]` },
        { label: "execute", result: `tools: [read, "tool1", execute]` },
        { label: "tool2", result: `tools: [read, "tool1", tool2]` },
        { label: "vscode", result: `tools: [read, "tool1", vscode]` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing entries 2", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['read', 'exe|cute']`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: ['read', 'agent']` },
        { label: "execute", result: `tools: ['read', 'execute']` },
        { label: "tool1", result: `tools: ['read', 'tool1']` },
        { label: "tool2", result: `tools: ['read', 'tool2']` },
        { label: "vscode", result: `tools: ['read', 'vscode']` }
      ].sort(sortByLabel));
    });
    test("complete agents inside agents array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "agents: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent1", result: `agents: [agent1]` }
      ].sort(sortByLabel));
    });
    test("complete infer attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "infer: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "false", result: "infer: false" },
        { label: "true", result: "infer: true" }
      ].sort(sortByLabel));
    });
    test("complete user-invocable attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "user-invocable: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "false", result: "user-invocable: false" },
        { label: "true", result: "user-invocable: true" }
      ].sort(sortByLabel));
    });
    test("complete disable-model-invocation attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "disable-model-invocation: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "false", result: "disable-model-invocation: false" },
        { label: "true", result: "disable-model-invocation: true" }
      ].sort(sortByLabel));
    });
    test("exclude models with targetChatSessionType from agent model completions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(!labels.includes("BG Agent Model (copilot)"), "Models with targetChatSessionType should be excluded from agent model completions");
    });
    test("exclude models with targetChatSessionType from agent model array completions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(!labels.includes("BG Agent Model (copilot)"), "Models with targetChatSessionType should be excluded from agent model array completions");
    });
    test("complete hooks value with New Hook snippet", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual, [
        {
          label: "New Hook",
          result: 'hooks: \n  ${1|SessionStart,SessionEnd,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop,ErrorOccurred|}:\n    - type: command\n      command: "$2"'
        }
      ]);
    });
    test("complete hooks value with New Hook snippet for vscode target", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "hooks: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual, [
        {
          label: "New Hook",
          result: 'hooks: \n  ${1|SessionStart,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop|}:\n    - type: command\n      command: "$2"'
        }
      ]);
    });
    test("complete hook event names inside hooks map", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        '      command: "echo hi"',
        "  |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("SessionStart"), "SessionStart should not be suggested when already present");
      assert.ok(labels.includes("SessionEnd"), "SessionEnd should be suggested");
      assert.ok(labels.includes("PreToolUse"), "PreToolUse should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
    });
    test("complete hook event names for vscode target excludes existing hooks", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        '      command: "echo hi"',
        "  PreToolUse:",
        "    - type: command",
        '      command: "lint"',
        "  |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("SessionStart"), "SessionStart should not be suggested when already present");
      assert.ok(!labels.includes("PreToolUse"), "PreToolUse should not be suggested when already present");
      assert.ok(labels.includes("UserPromptSubmit"), "UserPromptSubmit should be suggested");
      assert.ok(labels.includes("PostToolUse"), "PostToolUse should be suggested");
      assert.ok(!labels.includes("SessionEnd"), "SessionEnd should not be available for vscode target");
    });
    test("complete hook event names on empty line before existing hooks", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  |",
        "  SessionStart:",
        "    - type: command",
        '      command: "echo hi"',
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("SessionStart"), "SessionStart should not be suggested when already present");
      assert.ok(labels.includes("SessionEnd"), "SessionEnd should be suggested");
      assert.ok(labels.includes("PreToolUse"), "PreToolUse should be suggested");
    });
    test("complete hook event names while editing existing key name", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  S|:",
        "    - type: command",
        '      command: "echo hi"',
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(labels.includes("SessionStart"), "SessionStart should be suggested");
      assert.ok(labels.includes("SubagentStart"), "SubagentStart should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
      const sessionStartItem = actual.find((a) => a.label === "SessionStart");
      assert.ok(sessionStartItem);
      assert.strictEqual(sessionStartItem.result, "  SessionStart:");
    });
    test("hooks: cursor right after colon triggers New Hook snippet", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("New Hook"), "New Hook snippet should be suggested");
    });
    test("hooks: typing event name on next line triggers hook events", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  S|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("SessionStart"), "SessionStart should be suggested");
      assert.ok(labels.includes("SessionEnd"), "SessionEnd should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
    });
    test("typing field name in first command entry triggers command fields", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - t|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("type"), "type should be suggested");
      assert.ok(labels.includes("command"), "command should be suggested");
      assert.ok(labels.includes("timeout"), "timeout should be suggested");
    });
    test("typing field name after existing field triggers remaining command fields", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - type: command",
        "      c|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("command"), "command should be suggested");
      assert.ok(labels.includes("cwd"), "cwd should be suggested");
      assert.ok(!labels.includes("type"), "type should not be suggested when already present");
    });
    test("typing event name after existing hook triggers hook events", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - type: command",
        '      command: echo "Session ended."',
        "  U|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("UserPromptSubmit"), "UserPromptSubmit should be suggested");
      assert.ok(!labels.includes("SessionEnd"), "SessionEnd should not be suggested when already present");
    });
    test("typing event name between existing hooks triggers hook events", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - type: command",
        '      command: echo "Session ended."',
        "  S|",
        "  UserPromptSubmit:",
        "    - type: command",
        '      command: echo "User submitted."',
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("SessionStart"), "SessionStart should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
      assert.ok(!labels.includes("SessionEnd"), "SessionEnd should not be suggested when already present");
      assert.ok(!labels.includes("UserPromptSubmit"), "UserPromptSubmit should not be suggested when already present");
    });
    test("cursor after hook event colon triggers New Command snippet", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("New Command"), "New Command snippet should be suggested");
      assert.strictEqual(actual.length, 1, "Only one suggestion should be returned");
    });
  });
  suite("claude agent header completions", () => {
    const claudeAgentUri = URI.parse("test:///.claude/agents/security-reviewer.agent.md");
    test("complete attribute names", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "|",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "disallowedTools", result: "disallowedTools: ${0:Write, Edit, Bash}" },
        { label: "hooks", result: "hooks: $0" },
        { label: "mcpServers", result: "mcpServers: $0" },
        { label: "memory", result: "memory: ${0:user}" },
        { label: "model", result: "model: ${0:sonnet}" },
        { label: "permissionMode", result: "permissionMode: ${0:default}" },
        { label: "skills", result: "skills: $0" },
        { label: "tools", result: "tools: ${0:Read, Edit, Bash}" }
      ].sort(sortByLabel));
    });
    test("complete attribute names excludes already present ones", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: Edit",
        "|",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("tools"), "tools should not be suggested when already present");
      assert.ok(!labels.includes("name"), "name should not be suggested when already present");
      assert.ok(!labels.includes("description"), "description should not be suggested when already present");
    });
    test("complete model attribute value with claude enum values", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "haiku", result: "model: haiku" },
        { label: "inherit", result: "model: inherit" },
        { label: "opus", result: "model: opus" },
        { label: "sonnet", result: "model: sonnet" }
      ].sort(sortByLabel));
    });
    test("complete tools with comma-separated values", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: Edit, |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.deepStrictEqual(labels, [
        "AskUserQuestion",
        "Bash",
        "Glob",
        "Grep",
        "LSP",
        "MCPSearch",
        "NotebookEdit",
        "Read",
        "Skill",
        "Task",
        "WebFetch",
        "WebSearch",
        "Write"
      ].sort());
    });
    test("complete tools inside array syntax", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.deepStrictEqual(labels, [
        "AskUserQuestion",
        "Bash",
        "Edit",
        "Glob",
        "Grep",
        "LSP",
        "MCPSearch",
        "NotebookEdit",
        "Read",
        "Skill",
        "Task",
        "WebFetch",
        "WebSearch",
        "Write"
      ].sort());
      assert.deepStrictEqual(actual.find((a) => a.label === "Edit")?.result, `tools: [Edit]`);
    });
    test("complete tools inside array with existing entries", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: [Edit, |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.find((a) => a.label === "Read")?.result, `tools: [Edit, Read]`);
      assert.deepStrictEqual(actual.find((a) => a.label === "Bash")?.result, `tools: [Edit, Bash]`);
    });
    test("complete disallowedTools with comma-separated values", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "disallowedTools: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.deepStrictEqual(labels, [
        "AskUserQuestion",
        "Bash",
        "Edit",
        "Glob",
        "Grep",
        "LSP",
        "MCPSearch",
        "NotebookEdit",
        "Read",
        "Skill",
        "Task",
        "WebFetch",
        "WebSearch",
        "Write"
      ].sort());
    });
    test("complete disallowedTools inside array syntax", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "disallowedTools: [Bash, |]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.find((a) => a.label === "Write")?.result, `disallowedTools: [Bash, Write]`);
      assert.deepStrictEqual(actual.find((a) => a.label === "Edit")?.result, `disallowedTools: [Bash, Edit]`);
    });
  });
  suite("prompt header completions", () => {
    test("complete model attribute name", async () => {
      const content = [
        "---",
        'description: "Test"',
        "|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.prompt);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: "agent: ${0:ask}" },
        { label: "argument-hint", result: "argument-hint: $0" },
        { label: "model", result: "model: ${0:MAE 4 (olama)}" },
        { label: "name", result: "name: $0" },
        { label: "tools", result: "tools: ${0:[]}" }
      ].sort(sortByLabel));
    });
    test("complete model attribute value in prompt", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.prompt);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4 (olama)", result: "model: MAE 4 (olama)" },
        { label: "MAE 4.1 (copilot)", result: "model: MAE 4.1 (copilot)" },
        { label: "GPT 4 (openai)", result: "model: GPT 4 (openai)" }
      ].sort(sortByLabel));
    });
    test("exclude models with targetChatSessionType from prompt model completions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.prompt);
      const labels = actual.map((a) => a.label);
      assert.ok(!labels.includes("BG Agent Model (copilot)"), "Models with targetChatSessionType should be excluded from prompt model completions");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvblRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IFByb21wdEhlYWRlckF1dG9jb21wbGV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tQWdlbnQsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TGFuZ3VhZ2VJZEZvclByb21wdHNUeXBlLCBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVBhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vY2tDaGF0TW9kZVNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnUHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29tcGxldGlvblByb3ZpZGVyOiBQcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbjtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdENvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkLCB0cnVlKTtcblx0XHRpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZSh0ZXN0Q29uZmlnU2VydmljZSkpLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IHRlc3RDb25maWdTZXJ2aWNlXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgdG9vbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRlc3RUb29sMSA9IHsgaWQ6ICd0ZXN0VG9vbDEnLCBkaXNwbGF5TmFtZTogJ3Rvb2wxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wxKSk7XG5cblx0XHRjb25zdCB0ZXN0VG9vbDIgPSB7IGlkOiAndGVzdFRvb2wyJywgZGlzcGxheU5hbWU6ICd0b29sMicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2wyJywgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDIpKTtcblxuXHRcdGluc3RhU2VydmljZS5zZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHRvb2xTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRlc3RNb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhW10gPSBbXG5cdFx0XHR7IGlkOiAnbWFlLTQnLCBuYW1lOiAnTUFFIDQnLCB2ZW5kb3I6ICdvbGFtYScsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdtYWUnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogdHJ1ZSwgdG9vbENhbGxpbmc6IHRydWUgfSwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0gfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHR7IGlkOiAnbWFlLTQuMScsIG5hbWU6ICdNQUUgNC4xJywgdmVuZG9yOiAnY29waWxvdCcsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdtYWUnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogdHJ1ZSwgdG9vbENhbGxpbmc6IHRydWUgfSwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0gfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHR7IGlkOiAnZ3B0LTQnLCBuYW1lOiAnR1BUIDQnLCB2ZW5kb3I6ICdvcGVuYWknLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnZ3B0JywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IGZhbHNlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdiZy1hZ2VudC1tb2RlbCcsIG5hbWU6ICdCRyBBZ2VudCBNb2RlbCcsIHZlbmRvcjogJ2NvcGlsb3QnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnYmcnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogdHJ1ZSwgdG9vbENhbGxpbmc6IHRydWUgfSwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0sIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2JhY2tncm91bmQnIH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdF07XG5cblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7XG5cdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzKCkgeyByZXR1cm4gdGVzdE1vZGVscy5tYXAobSA9PiBtLmlkKTsgfSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWwobmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdHJldHVybiB0ZXN0TW9kZWxzLmZpbmQobSA9PiBtLmlkID09PSBuYW1lKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGN1c3RvbUFnZW50OiBJQ3VzdG9tQWdlbnQgPSB7XG5cdFx0XHRpZDogJ2FnZW50MScsXG5cdFx0XHRuYW1lOiAnYWdlbnQxJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgZmlsZSAxLicsXG5cdFx0XHRhZ2VudEluc3RydWN0aW9uczoge1xuXHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ215RnM6Ly8uZ2l0aHViL2FnZW50cy9hZ2VudDEuYWdlbnQubWQnKSxcblx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGFyc2VyID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHtcblx0XHRcdGdldFBhcnNlZFByb21wdEZpbGUobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnNlci5wYXJzZShtb2RlbC51cmksIG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGdldEN1c3RvbUFnZW50cyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbY3VzdG9tQWdlbnRdKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElDaGF0TW9kZVNlcnZpY2UsIG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKCkpO1xuXG5cdFx0Y29tcGxldGlvblByb3ZpZGVyID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEhlYWRlckF1dG9jb21wbGV0aW9uKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gZ2V0Q29tcGxldGlvbnMoY29udGVudDogc3RyaW5nLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgdXJpPzogVVJJKSB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZShwcm9tcHRUeXBlKTtcblx0XHR1cmkgPz89IFVSSS5wYXJzZSgndGVzdDovLy90ZXN0JyArIGdldFByb21wdEZpbGVFeHRlbnNpb24ocHJvbXB0VHlwZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50LCBsYW5ndWFnZUlkLCB1bmRlZmluZWQsIHVyaSkpO1xuXHRcdC8vIGdldCB0aGUgY29tcGxldGlvbiBsb2NhdGlvbiBmcm9tICB0aGUgJ3wnIG1hcmtlclxuXHRcdGNvbnN0IGxpbmVDb2x1bW5NYXJrZXJSYW5nZSA9IG1vZGVsLmZpbmROZXh0TWF0Y2goJ3wnLCBuZXcgUG9zaXRpb24oMSwgMSksIGZhbHNlLCBmYWxzZSwgJycsIGZhbHNlKT8ucmFuZ2U7XG5cdFx0YXNzZXJ0Lm9rKGxpbmVDb2x1bW5NYXJrZXJSYW5nZSwgJ05vIGNvbXBsZXRpb24gbWFya2VyIGZvdW5kIGluIHRlc3QgY29udGVudCcpO1xuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IGxpbmVDb2x1bW5NYXJrZXJSYW5nZSwgdGV4dDogJycgfV0pO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBsaW5lQ29sdW1uTWFya2VyUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0ID0geyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXBsZXRpb25Qcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBwb3NpdGlvbiwgY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFyZXN1bHQgfHwgIXJlc3VsdC5zdWdnZXN0aW9ucykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiByZXN1bHQuc3VnZ2VzdGlvbnMubWFwKHMgPT4ge1xuXHRcdFx0YXNzZXJ0KHMucmFuZ2UgaW5zdGFuY2VvZiBSYW5nZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogdHlwZW9mIHMubGFiZWwgPT09ICdzdHJpbmcnID8gcy5sYWJlbCA6IHMubGFiZWwubGFiZWwsXG5cdFx0XHRcdHJlc3VsdDogbGluZUNvbnRlbnQuc3Vic3RyaW5nKDAsIHMucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKSArIHMuaW5zZXJ0VGV4dCArIGxpbmVDb250ZW50LnN1YnN0cmluZyhzLnJhbmdlLmVuZENvbHVtbiAtIDEpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3Qgc29ydEJ5TGFiZWwgPSAoYTogeyBsYWJlbDogc3RyaW5nIH0sIGI6IHsgbGFiZWw6IHN0cmluZyB9KSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCk7XG5cblx0c3VpdGUoJ2FnZW50IGhlYWRlciBjb21wbGV0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdjb21wbGV0ZSBtb2RlbCBhdHRyaWJ1dGUgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3wnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2FnZW50cycsIHJlc3VsdDogJ2FnZW50czogJHswOltcIipcIl19JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnYXJndW1lbnQtaGludCcsIHJlc3VsdDogJ2FyZ3VtZW50LWhpbnQ6ICQwJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJywgcmVzdWx0OiAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiAkezA6dHJ1ZX0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdnaXRodWInLCByZXN1bHQ6ICdnaXRodWI6ICQwJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnaGFuZG9mZnMnLCByZXN1bHQ6ICdoYW5kb2ZmczogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdob29rcycsIHJlc3VsdDogJ2hvb2tzOlxcbiAgJHsxfFNlc3Npb25TdGFydCxTZXNzaW9uRW5kLFVzZXJQcm9tcHRTdWJtaXQsUHJlVG9vbFVzZSxQb3N0VG9vbFVzZSxQcmVDb21wYWN0LFN1YmFnZW50U3RhcnQsU3ViYWdlbnRTdG9wLFN0b3AsRXJyb3JPY2N1cnJlZHx9OlxcbiAgICAtIHR5cGU6IGNvbW1hbmRcXG4gICAgICBjb21tYW5kOiBcIiQyXCInIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdtb2RlbCcsIHJlc3VsdDogJ21vZGVsOiAkezA6TUFFIDQgKG9sYW1hKX0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICduYW1lJywgcmVzdWx0OiAnbmFtZTogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0YXJnZXQnLCByZXN1bHQ6ICd0YXJnZXQ6ICR7MDp2c2NvZGV9JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbHMnLCByZXN1bHQ6ICd0b29sczogJHswOltdfScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3VzZXItaW52b2NhYmxlJywgcmVzdWx0OiAndXNlci1pbnZvY2FibGU6ICR7MDp0cnVlfScgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgbW9kZWwgYXR0cmlidXRlIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZWw6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdC8vIEdQVCA0IGlzIGV4Y2x1ZGVkIGJlY2F1c2UgaXQgaGFzIGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNCAob2xhbWEpJywgcmVzdWx0OiAnbW9kZWw6IE1BRSA0IChvbGFtYSknIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNC4xIChjb3BpbG90KScsIHJlc3VsdDogJ21vZGVsOiBNQUUgNC4xIChjb3BpbG90KScgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgbW9kZWwgYXR0cmlidXRlIHZhbHVlIHdpdGggcGFydGlhbCBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J21vZGVsOiBNQXwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdC8vIEdQVCA0IGlzIGV4Y2x1ZGVkIGJlY2F1c2UgaXQgaGFzIGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNCAob2xhbWEpJywgcmVzdWx0OiAnbW9kZWw6IE1BRSA0IChvbGFtYSknIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNC4xIChjb3BpbG90KScsIHJlc3VsdDogJ21vZGVsOiBNQUUgNC4xIChjb3BpbG90KScgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgbW9kZWwgbmFtZXMgaW5zaWRlIG1vZGVsIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZWw6IFt8XScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Ly8gR1BUIDQgaXMgZXhjbHVkZWQgYmVjYXVzZSBpdCBoYXMgYWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0IChvbGFtYSknLCByZXN1bHQ6IGBtb2RlbDogWydNQUUgNCAob2xhbWEpJ11gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNC4xIChjb3BpbG90KScsIHJlc3VsdDogYG1vZGVsOiBbJ01BRSA0LjEgKGNvcGlsb3QpJ11gIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIG1vZGVsIG5hbWVzIGluc2lkZSBtb2RlbCBhcnJheSB3aXRoIGV4aXN0aW5nIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBtb2RlbDogWydNQUUgNCAob2xhbWEpJywgfF1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdC8vIEdQVCA0IGlzIGV4Y2x1ZGVkIGJlY2F1c2UgaXQgaGFzIGFnZW50TW9kZTogZmFsc2Vcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNC4xIChjb3BpbG90KScsIHJlc3VsdDogYG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCAnTUFFIDQuMSAoY29waWxvdCknXWAgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgdG9vbCBuYW1lcyBpbnNpZGUgdG9vbHMgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0b29sczogW3xdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnYWdlbnQnLCByZXN1bHQ6IGB0b29sczogW2FnZW50XWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2V4ZWN1dGUnLCByZXN1bHQ6IGB0b29sczogW2V4ZWN1dGVdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAncmVhZCcsIHJlc3VsdDogYHRvb2xzOiBbcmVhZF1gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29sMScsIHJlc3VsdDogYHRvb2xzOiBbdG9vbDFdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbDInLCByZXN1bHQ6IGB0b29sczogW3Rvb2wyXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIHJlc3VsdDogYHRvb2xzOiBbdnNjb2RlXWAgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgdG9vbCBuYW1lcyBpbnNpZGUgdG9vbHMgYXJyYXkgd2l0aCBleGlzdGluZyBzaW5nbGUgcXVvdGVkIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogWydyZWFkJywgfF1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhZ2VudCcsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAnYWdlbnQnXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2V4ZWN1dGUnLCByZXN1bHQ6IGB0b29sczogWydyZWFkJywgJ2V4ZWN1dGUnXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2wxJywgcmVzdWx0OiBgdG9vbHM6IFsncmVhZCcsICd0b29sMSddYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbDInLCByZXN1bHQ6IGB0b29sczogWydyZWFkJywgJ3Rvb2wyJ11gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCByZXN1bHQ6IGB0b29sczogWydyZWFkJywgJ3ZzY29kZSddYCB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29sIG5hbWVzIGluc2lkZSB0b29scyBhcnJheSB3aXRoIGV4aXN0aW5nIGRvdWJsZSBxdW90ZWQgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbXCJyZWFkXCIsIFwidG9vbDFcIiwgfF1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhZ2VudCcsIHJlc3VsdDogYHRvb2xzOiBbXCJyZWFkXCIsIFwidG9vbDFcIiwgXCJhZ2VudFwiXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2V4ZWN1dGUnLCByZXN1bHQ6IGB0b29sczogW1wicmVhZFwiLCBcInRvb2wxXCIsIFwiZXhlY3V0ZVwiXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2wyJywgcmVzdWx0OiBgdG9vbHM6IFtcInJlYWRcIiwgXCJ0b29sMVwiLCBcInRvb2wyXCJdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgcmVzdWx0OiBgdG9vbHM6IFtcInJlYWRcIiwgXCJ0b29sMVwiLCBcInZzY29kZVwiXWAgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgdG9vbCBuYW1lcyBpbnNpZGUgdG9vbHMgYXJyYXkgd2l0aCBleGlzdGluZyB1bnF1b3RlZCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFtyZWFkLCBcInRvb2wxXCIsIHxdYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHQvL3VzZXMgdGhlIGZpcnN0IGVudHJ5IHRvIGRldGVybWluZSBxdW90ZSBwcmVmZXJlbmNlLCBzbyB0aGUgbmV3IGVudHJ5IHNob3VsZCBiZSB1bnF1b3RlZFxuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnYWdlbnQnLCByZXN1bHQ6IGB0b29sczogW3JlYWQsIFwidG9vbDFcIiwgYWdlbnRdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZXhlY3V0ZScsIHJlc3VsdDogYHRvb2xzOiBbcmVhZCwgXCJ0b29sMVwiLCBleGVjdXRlXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2wyJywgcmVzdWx0OiBgdG9vbHM6IFtyZWFkLCBcInRvb2wxXCIsIHRvb2wyXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIHJlc3VsdDogYHRvb2xzOiBbcmVhZCwgXCJ0b29sMVwiLCB2c2NvZGVdYCB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29sIG5hbWVzIGluc2lkZSB0b29scyBhcnJheSB3aXRoIGV4aXN0aW5nIGVudHJpZXMgMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3JlYWQnLCAnZXhlfGN1dGUnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2FnZW50JywgcmVzdWx0OiBgdG9vbHM6IFsncmVhZCcsICdhZ2VudCddYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZXhlY3V0ZScsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAnZXhlY3V0ZSddYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbDEnLCByZXN1bHQ6IGB0b29sczogWydyZWFkJywgJ3Rvb2wxJ11gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29sMicsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAndG9vbDInXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAndnNjb2RlJ11gIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGFnZW50cyBpbnNpZGUgYWdlbnRzIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnYWdlbnRzOiBbfF0nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhZ2VudDEnLCByZXN1bHQ6IGBhZ2VudHM6IFthZ2VudDFdYCB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBpbmZlciBhdHRyaWJ1dGUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdpbmZlcjogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2ZhbHNlJywgcmVzdWx0OiAnaW5mZXI6IGZhbHNlJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndHJ1ZScsIHJlc3VsdDogJ2luZmVyOiB0cnVlJyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB1c2VyLWludm9jYWJsZSBhdHRyaWJ1dGUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd1c2VyLWludm9jYWJsZTogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2ZhbHNlJywgcmVzdWx0OiAndXNlci1pbnZvY2FibGU6IGZhbHNlJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndHJ1ZScsIHJlc3VsdDogJ3VzZXItaW52b2NhYmxlOiB0cnVlJyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBkaXNhYmxlLW1vZGVsLWludm9jYXRpb24gYXR0cmlidXRlIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnZmFsc2UnLCByZXN1bHQ6ICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IGZhbHNlJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndHJ1ZScsIHJlc3VsdDogJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZScgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZSBtb2RlbHMgd2l0aCB0YXJnZXRDaGF0U2Vzc2lvblR5cGUgZnJvbSBhZ2VudCBtb2RlbCBjb21wbGV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J21vZGVsOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHQvLyBCRyBBZ2VudCBNb2RlbCBoYXMgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlIHNldCwgc28gaXQgc2hvdWxkIGJlIGV4Y2x1ZGVkXG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnQkcgQWdlbnQgTW9kZWwgKGNvcGlsb3QpJyksICdNb2RlbHMgd2l0aCB0YXJnZXRDaGF0U2Vzc2lvblR5cGUgc2hvdWxkIGJlIGV4Y2x1ZGVkIGZyb20gYWdlbnQgbW9kZWwgY29tcGxldGlvbnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGUgbW9kZWxzIHdpdGggdGFyZ2V0Q2hhdFNlc3Npb25UeXBlIGZyb20gYWdlbnQgbW9kZWwgYXJyYXkgY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlbDogW3xdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnQkcgQWdlbnQgTW9kZWwgKGNvcGlsb3QpJyksICdNb2RlbHMgd2l0aCB0YXJnZXRDaGF0U2Vzc2lvblR5cGUgc2hvdWxkIGJlIGV4Y2x1ZGVkIGZyb20gYWdlbnQgbW9kZWwgYXJyYXkgY29tcGxldGlvbnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGhvb2tzIHZhbHVlIHdpdGggTmV3IEhvb2sgc25pcHBldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdOZXcgSG9vaycsXG5cdFx0XHRcdFx0cmVzdWx0OiAnaG9va3M6IFxcbiAgJHsxfFNlc3Npb25TdGFydCxTZXNzaW9uRW5kLFVzZXJQcm9tcHRTdWJtaXQsUHJlVG9vbFVzZSxQb3N0VG9vbFVzZSxQcmVDb21wYWN0LFN1YmFnZW50U3RhcnQsU3ViYWdlbnRTdG9wLFN0b3AsRXJyb3JPY2N1cnJlZHx9OlxcbiAgICAtIHR5cGU6IGNvbW1hbmRcXG4gICAgICBjb21tYW5kOiBcIiQyXCInXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGhvb2tzIHZhbHVlIHdpdGggTmV3IEhvb2sgc25pcHBldCBmb3IgdnNjb2RlIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0J2hvb2tzOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdOZXcgSG9vaycsXG5cdFx0XHRcdFx0cmVzdWx0OiAnaG9va3M6IFxcbiAgJHsxfFNlc3Npb25TdGFydCxVc2VyUHJvbXB0U3VibWl0LFByZVRvb2xVc2UsUG9zdFRvb2xVc2UsUHJlQ29tcGFjdCxTdWJhZ2VudFN0YXJ0LFN1YmFnZW50U3RvcCxTdG9wfH06XFxuICAgIC0gdHlwZTogY29tbWFuZFxcbiAgICAgIGNvbW1hbmQ6IFwiJDJcIidcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgaG9vayBldmVudCBuYW1lcyBpbnNpZGUgaG9va3MgbWFwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiZWNobyBoaVwiJyxcblx0XHRcdFx0JyAgfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpLnNvcnQoKTtcblx0XHRcdC8vIFNlc3Npb25TdGFydCBzaG91bGQgYmUgZXhjbHVkZWQgc2luY2UgaXQgYWxyZWFkeSBleGlzdHNcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uU3RhcnQnKSwgJ1Nlc3Npb25TdGFydCBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU2Vzc2lvbkVuZCcpLCAnU2Vzc2lvbkVuZCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdQcmVUb29sVXNlJyksICdQcmVUb29sVXNlIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1N0b3AnKSwgJ1N0b3Agc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgaG9vayBldmVudCBuYW1lcyBmb3IgdnNjb2RlIHRhcmdldCBleGNsdWRlcyBleGlzdGluZyBob29rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBcImVjaG8gaGlcIicsXG5cdFx0XHRcdCcgIFByZVRvb2xVc2U6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogXCJsaW50XCInLFxuXHRcdFx0XHQnICB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ1Nlc3Npb25TdGFydCcpLCAnU2Vzc2lvblN0YXJ0IHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnUHJlVG9vbFVzZScpLCAnUHJlVG9vbFVzZSBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnVXNlclByb21wdFN1Ym1pdCcpLCAnVXNlclByb21wdFN1Ym1pdCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdQb3N0VG9vbFVzZScpLCAnUG9zdFRvb2xVc2Ugc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0Ly8gU2Vzc2lvbkVuZCBpcyBub3QgYXZhaWxhYmxlIGZvciB2c2NvZGUgdGFyZ2V0XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnU2Vzc2lvbkVuZCcpLCAnU2Vzc2lvbkVuZCBzaG91bGQgbm90IGJlIGF2YWlsYWJsZSBmb3IgdnNjb2RlIHRhcmdldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgaG9vayBldmVudCBuYW1lcyBvbiBlbXB0eSBsaW5lIGJlZm9yZSBleGlzdGluZyBob29rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHwnLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogXCJlY2hvIGhpXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnU2Vzc2lvblN0YXJ0JyksICdTZXNzaW9uU3RhcnQgc2hvdWxkIG5vdCBiZSBzdWdnZXN0ZWQgd2hlbiBhbHJlYWR5IHByZXNlbnQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1Nlc3Npb25FbmQnKSwgJ1Nlc3Npb25FbmQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnUHJlVG9vbFVzZScpLCAnUHJlVG9vbFVzZSBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBob29rIGV2ZW50IG5hbWVzIHdoaWxlIGVkaXRpbmcgZXhpc3Rpbmcga2V5IG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTfDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBcImVjaG8gaGlcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpLnNvcnQoKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1Nlc3Npb25TdGFydCcpLCAnU2Vzc2lvblN0YXJ0IHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1N1YmFnZW50U3RhcnQnKSwgJ1N1YmFnZW50U3RhcnQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU3RvcCcpLCAnU3RvcCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHQvLyBWZXJpZnkgaW5zZXJ0VGV4dCBvbmx5IHJlcGxhY2VzIHRoZSBrZXkgKG5vIGZ1bGwgc25pcHBldClcblx0XHRcdGNvbnN0IHNlc3Npb25TdGFydEl0ZW0gPSBhY3R1YWwuZmluZChhID0+IGEubGFiZWwgPT09ICdTZXNzaW9uU3RhcnQnKTtcblx0XHRcdGFzc2VydC5vayhzZXNzaW9uU3RhcnRJdGVtKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uU3RhcnRJdGVtLnJlc3VsdCwgJyAgU2Vzc2lvblN0YXJ0OicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3M6IGN1cnNvciByaWdodCBhZnRlciBjb2xvbiB0cmlnZ2VycyBOZXcgSG9vayBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ05ldyBIb29rJyksICdOZXcgSG9vayBzbmlwcGV0IHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzOiB0eXBpbmcgZXZlbnQgbmFtZSBvbiBuZXh0IGxpbmUgdHJpZ2dlcnMgaG9vayBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU2Vzc2lvblN0YXJ0JyksICdTZXNzaW9uU3RhcnQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU2Vzc2lvbkVuZCcpLCAnU2Vzc2lvbkVuZCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTdG9wJyksICdTdG9wIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3R5cGluZyBmaWVsZCBuYW1lIGluIGZpcnN0IGNvbW1hbmQgZW50cnkgdHJpZ2dlcnMgY29tbWFuZCBmaWVsZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uRW5kOicsXG5cdFx0XHRcdCcgICAgLSB0fCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygndHlwZScpLCAndHlwZSBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdjb21tYW5kJyksICdjb21tYW5kIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ3RpbWVvdXQnKSwgJ3RpbWVvdXQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHlwaW5nIGZpZWxkIG5hbWUgYWZ0ZXIgZXhpc3RpbmcgZmllbGQgdHJpZ2dlcnMgcmVtYWluaW5nIGNvbW1hbmQgZmllbGRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvbkVuZDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnY29tbWFuZCcpLCAnY29tbWFuZCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdjd2QnKSwgJ2N3ZCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygndHlwZScpLCAndHlwZSBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHlwaW5nIGV2ZW50IG5hbWUgYWZ0ZXIgZXhpc3RpbmcgaG9vayB0cmlnZ2VycyBob29rIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25FbmQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBcIlNlc3Npb24gZW5kZWQuXCInLFxuXHRcdFx0XHQnICBVfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnVXNlclByb21wdFN1Ym1pdCcpLCAnVXNlclByb21wdFN1Ym1pdCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnU2Vzc2lvbkVuZCcpLCAnU2Vzc2lvbkVuZCBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHlwaW5nIGV2ZW50IG5hbWUgYmV0d2VlbiBleGlzdGluZyBob29rcyB0cmlnZ2VycyBob29rIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25FbmQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBcIlNlc3Npb24gZW5kZWQuXCInLFxuXHRcdFx0XHQnICBTfCcsXG5cdFx0XHRcdCcgIFVzZXJQcm9tcHRTdWJtaXQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBcIlVzZXIgc3VibWl0dGVkLlwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uU3RhcnQnKSwgJ1Nlc3Npb25TdGFydCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTdG9wJyksICdTdG9wIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uRW5kJyksICdTZXNzaW9uRW5kIHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnVXNlclByb21wdFN1Ym1pdCcpLCAnVXNlclByb21wdFN1Ym1pdCBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3Vyc29yIGFmdGVyIGhvb2sgZXZlbnQgY29sb24gdHJpZ2dlcnMgTmV3IENvbW1hbmQgc25pcHBldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25FbmQ6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ05ldyBDb21tYW5kJyksICdOZXcgQ29tbWFuZCBzbmlwcGV0IHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubGVuZ3RoLCAxLCAnT25seSBvbmUgc3VnZ2VzdGlvbiBzaG91bGQgYmUgcmV0dXJuZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NsYXVkZSBhZ2VudCBoZWFkZXIgY29tcGxldGlvbnMnLCAoKSA9PiB7XG5cdFx0Ly8gQ2xhdWRlIGFnZW50cyBhcmUgaWRlbnRpZmllZCBieSB0aGVpciBVUkkgYmVpbmcgdW5kZXIgLmNsYXVkZS9hZ2VudHMvXG5cdFx0Y29uc3QgY2xhdWRlQWdlbnRVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vLmNsYXVkZS9hZ2VudHMvc2VjdXJpdHktcmV2aWV3ZXIuYWdlbnQubWQnKTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGF0dHJpYnV0ZSBuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0J3wnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1lvdSBhcmUgYSBzZW5pb3Igc2VjdXJpdHkgZW5naW5lZXIuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnZGlzYWxsb3dlZFRvb2xzJywgcmVzdWx0OiAnZGlzYWxsb3dlZFRvb2xzOiAkezA6V3JpdGUsIEVkaXQsIEJhc2h9JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnaG9va3MnLCByZXN1bHQ6ICdob29rczogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdtY3BTZXJ2ZXJzJywgcmVzdWx0OiAnbWNwU2VydmVyczogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdtZW1vcnknLCByZXN1bHQ6ICdtZW1vcnk6ICR7MDp1c2VyfScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ21vZGVsJywgcmVzdWx0OiAnbW9kZWw6ICR7MDpzb25uZXR9JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAncGVybWlzc2lvbk1vZGUnLCByZXN1bHQ6ICdwZXJtaXNzaW9uTW9kZTogJHswOmRlZmF1bHR9JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnc2tpbGxzJywgcmVzdWx0OiAnc2tpbGxzOiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2xzJywgcmVzdWx0OiAndG9vbHM6ICR7MDpSZWFkLCBFZGl0LCBCYXNofScgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgYXR0cmlidXRlIG5hbWVzIGV4Y2x1ZGVzIGFscmVhZHkgcHJlc2VudCBvbmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQndG9vbHM6IEVkaXQnLFxuXHRcdFx0XHQnfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnWW91IGFyZSBhIHNlbmlvciBzZWN1cml0eSBlbmdpbmVlci4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdC8vICd0b29scycgc2hvdWxkIG5vdCBhcHBlYXIgc2luY2UgaXQgaXMgYWxyZWFkeSBpbiB0aGUgaGVhZGVyXG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ3Rvb2xzJyksICd0b29scyBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ25hbWUnKSwgJ25hbWUgc2hvdWxkIG5vdCBiZSBzdWdnZXN0ZWQgd2hlbiBhbHJlYWR5IHByZXNlbnQnKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdkZXNjcmlwdGlvbicpLCAnZGVzY3JpcHRpb24gc2hvdWxkIG5vdCBiZSBzdWdnZXN0ZWQgd2hlbiBhbHJlYWR5IHByZXNlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIG1vZGVsIGF0dHJpYnV0ZSB2YWx1ZSB3aXRoIGNsYXVkZSBlbnVtIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0J21vZGVsOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2hhaWt1JywgcmVzdWx0OiAnbW9kZWw6IGhhaWt1JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnaW5oZXJpdCcsIHJlc3VsdDogJ21vZGVsOiBpbmhlcml0JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnb3B1cycsIHJlc3VsdDogJ21vZGVsOiBvcHVzJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnc29ubmV0JywgcmVzdWx0OiAnbW9kZWw6IHNvbm5ldCcgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgdG9vbHMgd2l0aCBjb21tYS1zZXBhcmF0ZWQgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQndG9vbHM6IEVkaXQsIHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYWJlbHMsIFtcblx0XHRcdFx0J0Fza1VzZXJRdWVzdGlvbicsICdCYXNoJywgJ0dsb2InLCAnR3JlcCcsXG5cdFx0XHRcdCdMU1AnLCAnTUNQU2VhcmNoJywgJ05vdGVib29rRWRpdCcsICdSZWFkJywgJ1NraWxsJyxcblx0XHRcdFx0J1Rhc2snLCAnV2ViRmV0Y2gnLCAnV2ViU2VhcmNoJywgJ1dyaXRlJ1xuXHRcdFx0XS5zb3J0KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgdG9vbHMgaW5zaWRlIGFycmF5IHN5bnRheCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0J3Rvb2xzOiBbfF0nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYWJlbHMsIFtcblx0XHRcdFx0J0Fza1VzZXJRdWVzdGlvbicsICdCYXNoJywgJ0VkaXQnLCAnR2xvYicsICdHcmVwJyxcblx0XHRcdFx0J0xTUCcsICdNQ1BTZWFyY2gnLCAnTm90ZWJvb2tFZGl0JywgJ1JlYWQnLCAnU2tpbGwnLFxuXHRcdFx0XHQnVGFzaycsICdXZWJGZXRjaCcsICdXZWJTZWFyY2gnLCAnV3JpdGUnXG5cdFx0XHRdLnNvcnQoKSk7XG5cdFx0XHQvLyBBcnJheSBpdGVtcyB3aXRob3V0IHF1b3RlcyBzaG91bGQgdXNlIHRoZSBuYW1lIGRpcmVjdGx5XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0VkaXQnKT8ucmVzdWx0LCBgdG9vbHM6IFtFZGl0XWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgdG9vbHMgaW5zaWRlIGFycmF5IHdpdGggZXhpc3RpbmcgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0YHRvb2xzOiBbRWRpdCwgfF1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ1JlYWQnKT8ucmVzdWx0LCBgdG9vbHM6IFtFZGl0LCBSZWFkXWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZmluZChhID0+IGEubGFiZWwgPT09ICdCYXNoJyk/LnJlc3VsdCwgYHRvb2xzOiBbRWRpdCwgQmFzaF1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGRpc2FsbG93ZWRUb29scyB3aXRoIGNvbW1hLXNlcGFyYXRlZCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUgZm9yIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcycsXG5cdFx0XHRcdCdkaXNhbGxvd2VkVG9vbHM6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYWJlbHMsIFtcblx0XHRcdFx0J0Fza1VzZXJRdWVzdGlvbicsICdCYXNoJywgJ0VkaXQnLCAnR2xvYicsICdHcmVwJyxcblx0XHRcdFx0J0xTUCcsICdNQ1BTZWFyY2gnLCAnTm90ZWJvb2tFZGl0JywgJ1JlYWQnLCAnU2tpbGwnLFxuXHRcdFx0XHQnVGFzaycsICdXZWJGZXRjaCcsICdXZWJTZWFyY2gnLCAnV3JpdGUnXG5cdFx0XHRdLnNvcnQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBkaXNhbGxvd2VkVG9vbHMgaW5zaWRlIGFycmF5IHN5bnRheCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0J2Rpc2FsbG93ZWRUb29sczogW0Jhc2gsIHxdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZmluZChhID0+IGEubGFiZWwgPT09ICdXcml0ZScpPy5yZXN1bHQsIGBkaXNhbGxvd2VkVG9vbHM6IFtCYXNoLCBXcml0ZV1gKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnRWRpdCcpPy5yZXN1bHQsIGBkaXNhbGxvd2VkVG9vbHM6IFtCYXNoLCBFZGl0XWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJvbXB0IGhlYWRlciBjb21wbGV0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdjb21wbGV0ZSBtb2RlbCBhdHRyaWJ1dGUgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3wnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnYWdlbnQnLCByZXN1bHQ6ICdhZ2VudDogJHswOmFza30nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdhcmd1bWVudC1oaW50JywgcmVzdWx0OiAnYXJndW1lbnQtaGludDogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdtb2RlbCcsIHJlc3VsdDogJ21vZGVsOiAkezA6TUFFIDQgKG9sYW1hKX0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICduYW1lJywgcmVzdWx0OiAnbmFtZTogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29scycsIHJlc3VsdDogJ3Rvb2xzOiAkezA6W119JyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBtb2RlbCBhdHRyaWJ1dGUgdmFsdWUgaW4gcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZWw6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnTUFFIDQgKG9sYW1hKScsIHJlc3VsdDogJ21vZGVsOiBNQUUgNCAob2xhbWEpJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnTUFFIDQuMSAoY29waWxvdCknLCByZXN1bHQ6ICdtb2RlbDogTUFFIDQuMSAoY29waWxvdCknIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdHUFQgNCAob3BlbmFpKScsIHJlc3VsdDogJ21vZGVsOiBHUFQgNCAob3BlbmFpKScgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZSBtb2RlbHMgd2l0aCB0YXJnZXRDaGF0U2Vzc2lvblR5cGUgZnJvbSBwcm9tcHQgbW9kZWwgY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlbDogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdCRyBBZ2VudCBNb2RlbCAoY29waWxvdCknKSwgJ01vZGVscyB3aXRoIHRhcmdldENoYXRTZXNzaW9uVHlwZSBzaG91bGQgYmUgZXhjbHVkZWQgZnJvbSBwcm9tcHQgbW9kZWwgY29tcGxldGlvbnMnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUE0Qiw2QkFBNkI7QUFDekQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNEJBQXVDLHNCQUFzQjtBQUN0RSxTQUFxQyw4QkFBOEI7QUFDbkUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBdUIsaUJBQWlCLHNCQUFzQjtBQUM5RCxTQUFTLDZCQUE2QixhQUFhLGNBQWM7QUFDakUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxX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
