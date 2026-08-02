import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatMode, CustomChatMode, IChatModeService } from "../../../../common/chatModes.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../../common/languageModels.js";
import { PromptHoverProvider } from "../../../../common/promptSyntax/languageProviders/promptHovers.js";
import { IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { getLanguageIdForPromptsType, PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { MockChatModeService } from "../../../common/mockChatModeService.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
suite("PromptHoverProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let hoverProvider;
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
      // Claude model equivalents
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", vendor: "copilot", version: "1.0", family: "claude", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 2e5, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6", vendor: "copilot", version: "1.0", family: "claude", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 2e5, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vendor: "copilot", version: "1.0", family: "claude", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 2e5, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} }
    ];
    instaService.stub(ILanguageModelsService, {
      getLanguageModelIds() {
        return testModels.map((m) => m.id);
      },
      lookupLanguageModelByQualifiedName(qualifiedName) {
        for (const metadata of testModels) {
          if (ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, metadata)) {
            return { metadata, identifier: metadata.id };
          }
        }
        return void 0;
      }
    });
    const customChatMode = new CustomChatMode({
      id: "beast-mode",
      uri: URI.parse("myFs://test/test/chatmode.md"),
      name: "BeastMode",
      agentInstructions: { content: "Beast mode instructions", toolReferences: [] },
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true
    });
    instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));
    const parser = new PromptFileParser();
    instaService.stub(IPromptsService, {
      getParsedPromptFile(model) {
        return parser.parse(model.uri, model.getValue());
      }
    });
    hoverProvider = instaService.createInstance(PromptHoverProvider);
  });
  async function getHover(content, line, column, promptType, options) {
    const languageId = getLanguageIdForPromptsType(promptType);
    const ext = getPromptFileExtension(promptType);
    const path = options?.claudeAgent ? `/.claude/agents/test${ext}` : `/test${ext}`;
    const uri = URI.parse("test://" + path);
    const model = disposables.add(createTextModel(content, languageId, void 0, uri));
    const position = new Position(line, column);
    const hover = await hoverProvider.provideHover(model, position, CancellationToken.None);
    if (!hover || hover.contents.length === 0) {
      return void 0;
    }
    const firstContent = hover.contents[0];
    if (firstContent instanceof MarkdownString) {
      return firstContent.value;
    }
    return void 0;
  }
  suite("agent hovers", () => {
    test("hover on target attribute shows description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.agent);
      assert.strictEqual(hover, "The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.");
    });
    test("hover on model attribute with github-copilot target shows note", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: github-copilot",
        "model: MAE 4",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "Note: This attribute is not used when target is github-copilot."
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with vscode target shows model info", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "model: MAE 4 (olama)",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4",
        "- Family: mae",
        "- Vendor: olama"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on handoffs attribute with github-copilot target shows note", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: github-copilot",
        "handoffs:",
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      const expected = [
        "Possible handoff actions when the agent has completed its task.",
        "",
        "Note: This attribute is not used in GitHub Copilot or Claude targets."
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on handoffs attribute with vscode target shows description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "handoffs:",
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "Possible handoff actions when the agent has completed its task.");
    });
    test("hover on github-copilot tool shows simple description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: github-copilot",
        `tools: ['execute', 'read']`,
        "---"
      ].join("\n");
      const hoverShell = await getHover(content, 4, 10, PromptsType.agent);
      assert.strictEqual(hoverShell, "ToolSet: execute\n\n\nExecute code and applications on your machine");
      const hoverEdit = await getHover(content, 4, 20, PromptsType.agent);
      assert.strictEqual(hoverEdit, "ToolSet: read\n\n\nRead files in your workspace");
    });
    test("hover on github-copilot tool with target undefined", async () => {
      const content = [
        "---",
        'name: "Test"',
        'description: "Test"',
        `tools: ['shell', 'read']`,
        "---"
      ].join("\n");
      const hoverShell = await getHover(content, 4, 10, PromptsType.agent);
      assert.strictEqual(hoverShell, "ToolSet: execute\n\n\nExecute code and applications on your machine");
      const hoverEdit = await getHover(content, 4, 20, PromptsType.agent);
      assert.strictEqual(hoverEdit, "ToolSet: read\n\n\nRead files in your workspace");
    });
    test("hover on vscode tool shows detailed description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['tool1', 'tool2']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 10, PromptsType.agent);
      assert.strictEqual(hover, "Test Tool 1");
    });
    test("hover on model attribute with vscode target and model array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 10, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4",
        "- Family: mae",
        "- Vendor: olama"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on second model in model array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 30, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4.1",
        "- Family: mae",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on description attribute", async () => {
      const content = [
        "---",
        'description: "Test agent"',
        "target: vscode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.agent);
      assert.strictEqual(hover, "The description of the custom agent, what it does and when to use it.");
    });
    test("hover on argument-hint attribute", async () => {
      const content = [
        "---",
        'description: "Test"',
        'argument-hint: "test hint"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.agent);
      assert.strictEqual(hover, "The argument-hint describes what inputs the custom agent expects or supports.");
    });
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Agent"',
        'description: "Test agent"',
        "target: vscode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.agent);
      assert.strictEqual(hover, "The name of the agent as shown in the UI.");
    });
    test("hover on infer attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        "infer: true",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "Controls visibility of the agent.\n\nDeprecated: Use `user-invocable` and `disable-model-invocation` instead.");
    });
    test("hover on agents attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        'agents: ["*"]',
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "One or more agents that this agent can use as subagents. Use '*' to specify all available agents.");
    });
    test("hover on user-invocable attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        "user-invocable: true",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "Whether the agent can be selected and invoked by users in the UI.");
    });
    test("hover on disable-model-invocation attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        "disable-model-invocation: true",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "If true, prevents the agent from being invoked as a subagent.");
    });
  });
  suite("prompt hovers", () => {
    test("hover on model attribute shows model info", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: MAE 4 (olama)",
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.prompt);
      const expected = [
        "The model to use in this prompt. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4",
        "- Family: mae",
        "- Vendor: olama"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on tools attribute shows tool description", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['tool1']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 10, PromptsType.prompt);
      assert.strictEqual(hover, "Test Tool 1");
    });
    test("hover on agent attribute shows agent info", async () => {
      const content = [
        "---",
        'description: "Test"',
        "agent: BeastMode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.prompt);
      const expected = [
        "The agent to use when running this prompt.",
        "",
        "**Built-in agents:**",
        "- `agent`: Describe what to build",
        "- `ask`: Explore and understand your code",
        "- `edit`: Edit or refactor selected code",
        "",
        "**Custom agents:**",
        "- `BeastMode`: Custom agent"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Prompt"',
        'description: "Test prompt"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.prompt);
      assert.strictEqual(hover, "The name of the prompt. This is also the name of the slash command that will run this prompt.");
    });
  });
  suite("instructions hovers", () => {
    test("hover on description attribute", async () => {
      const content = [
        "---",
        'description: "Test instruction"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.instructions);
      assert.strictEqual(hover, "The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.");
    });
    test("hover on applyTo attribute", async () => {
      const content = [
        "---",
        'description: "Test"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.instructions);
      const expected = [
        "One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.",
        "Example: `**/*.ts`, `**/*.js`, `client/**`"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Instructions"',
        'description: "Test instruction"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.instructions);
      assert.strictEqual(hover, "The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.");
    });
  });
  suite("skill hovers", () => {
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Skill"',
        'description: "Test skill"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.skill);
      assert.strictEqual(hover, "The name of the skill.");
    });
    test("hover on description attribute", async () => {
      const content = [
        "---",
        'name: "Test Skill"',
        'description: "Test skill description"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.skill);
      assert.strictEqual(hover, "The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.");
    });
    test("hover on file attribute", async () => {
      const content = [
        "---",
        'name: "Test Skill"',
        'description: "Test skill"',
        'file: "SKILL.md"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.skill);
      assert.strictEqual(hover, void 0);
    });
  });
  suite("claude agent hovers", () => {
    async function getClaudeHover(content, line, column) {
      return getHover(content, line, column, PromptsType.agent, { claudeAgent: true });
    }
    test("hover on name attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 2, 1);
      assert.strictEqual(hover, "Unique identifier using lowercase letters and hyphens (required)");
    });
    test("hover on description attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 3, 1);
      assert.strictEqual(hover, "When to delegate to this subagent (required)");
    });
    test("hover on tools attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: Edit, Grep, AskUserQuestion, WebFetch",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Array of tools the subagent can use. Inherits all tools if omitted");
    });
    test("hover on individual Claude tool shows tool description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code",
        `tools: ['Edit', 'Grep', 'WebFetch']`,
        "---"
      ].join("\n");
      const hoverEdit = await getClaudeHover(content, 4, 10);
      assert.strictEqual(hoverEdit, "Make targeted file edits");
      const hoverGrep = await getClaudeHover(content, 4, 17);
      assert.strictEqual(hoverGrep, "Search file contents with regex");
      const hoverFetch = await getClaudeHover(content, 4, 27);
      assert.strictEqual(hoverFetch, "Fetch URL content");
    });
    test("hover on model attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code",
        "model: opus",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `opus` maps to the following model:",
        "",
        "- Name: Claude Opus 4.6",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with sonnet value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: sonnet",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `sonnet` maps to the following model:",
        "",
        "- Name: Claude Sonnet 4.5",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with haiku value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: haiku",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `haiku` maps to the following model:",
        "",
        "- Name: Claude Haiku 4.5",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with inherit value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: inherit",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Inherit model from parent agent or prompt"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on disallowedTools attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: read-only-agent",
        "description: Read-only analysis agent",
        `disallowedTools: ['Write', 'Edit', 'Bash']`,
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Tools to deny, removed from inherited or specified list");
    });
    test("hover on individual disallowedTools value shows tool description", async () => {
      const content = [
        "---",
        "name: read-only-agent",
        "description: Read-only",
        `disallowedTools: ['Bash', 'Write']`,
        "---"
      ].join("\n");
      const hoverBash = await getClaudeHover(content, 4, 20);
      assert.strictEqual(hoverBash, "Execute shell commands");
      const hoverWrite = await getClaudeHover(content, 4, 28);
      assert.strictEqual(hoverWrite, "Create/overwrite files");
    });
    test("hover on permissionMode attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "permissionMode: acceptEdits",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan.");
    });
    test("hover on memory attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "memory: project",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Persistent memory scope: user, project, or local. Enables cross-session learning.");
    });
    test("hover on skills attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        'skills: ["code-review"]',
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Skills to load into the subagent's context at startup.");
    });
    test("hover on hooks attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "hooks: {}",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Lifecycle hooks scoped to this subagent.");
    });
    test("hover on handoffs attribute in Claude agent shows not-used note", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "handoffs:",
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, void 0);
    });
    test("full example: hover on each attribute of a Claude agent", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
        "model: opus",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const nameHover = await getClaudeHover(content, 2, 1);
      assert.strictEqual(nameHover, "Unique identifier using lowercase letters and hyphens (required)");
      const descHover = await getClaudeHover(content, 3, 1);
      assert.strictEqual(descHover, "When to delegate to this subagent (required)");
      const toolsHover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(toolsHover, "Array of tools the subagent can use. Inherits all tools if omitted");
      const askHover = await getClaudeHover(content, 4, 28);
      assert.strictEqual(askHover, "Ask multiple-choice questions");
      const modelHover = await getClaudeHover(content, 5, 1);
      const expectedModelHover = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `opus` maps to the following model:",
        "",
        "- Name: Claude Opus 4.6",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(modelHover, expectedModelHover);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIb3ZlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIEN1c3RvbUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgUHJvbXB0SG92ZXJQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0SG92ZXJzLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TGFuZ3VhZ2VJZEZvclByb21wdHNUeXBlLCBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vY2tDaGF0TW9kZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5cbnN1aXRlKCdQcm9tcHRIb3ZlclByb3ZpZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGhvdmVyUHJvdmlkZXI6IFByb21wdEhvdmVyUHJvdmlkZXI7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RDb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dGVuc2lvblRvb2xzRW5hYmxlZCwgdHJ1ZSk7XG5cdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UodGVzdENvbmZpZ1NlcnZpY2UpKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiB0ZXN0Q29uZmlnU2VydmljZVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IHRvb2xTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCB0ZXN0VG9vbDEgPSB7IGlkOiAndGVzdFRvb2wxJywgZGlzcGxheU5hbWU6ICd0b29sMScsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCBtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDEnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRlc3RUb29sMSkpO1xuXG5cdFx0Y29uc3QgdGVzdFRvb2wyID0geyBpZDogJ3Rlc3RUb29sMicsIGRpc3BsYXlOYW1lOiAndG9vbDInLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgdG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sMicsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMicsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wyKSk7XG5cblx0XHRpbnN0YVNlcnZpY2Uuc2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB0b29sU2VydmljZSk7XG5cblx0XHRjb25zdCB0ZXN0TW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YVtdID0gW1xuXHRcdFx0eyBpZDogJ21hZS00JywgbmFtZTogJ01BRSA0JywgdmVuZG9yOiAnb2xhbWEnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnbWFlJywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0eyBpZDogJ21hZS00LjEnLCBuYW1lOiAnTUFFIDQuMScsIHZlbmRvcjogJ2NvcGlsb3QnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnbWFlJywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0Ly8gQ2xhdWRlIG1vZGVsIGVxdWl2YWxlbnRzXG5cdFx0XHR7IGlkOiAnY2xhdWRlLXNvbm5ldC00LjUnLCBuYW1lOiAnQ2xhdWRlIFNvbm5ldCA0LjUnLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ2NsYXVkZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogMjAwMDAwLCBtYXhPdXRwdXRUb2tlbnM6IDgxOTIsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdjbGF1ZGUtb3B1cy00LjYnLCBuYW1lOiAnQ2xhdWRlIE9wdXMgNC42JywgdmVuZG9yOiAnY29waWxvdCcsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdjbGF1ZGUnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDIwMDAwMCwgbWF4T3V0cHV0VG9rZW5zOiA4MTkyLCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30gfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHR7IGlkOiAnY2xhdWRlLWhhaWt1LTQuNScsIG5hbWU6ICdDbGF1ZGUgSGFpa3UgNC41JywgdmVuZG9yOiAnY29waWxvdCcsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdjbGF1ZGUnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDIwMDAwMCwgbWF4T3V0cHV0VG9rZW5zOiA4MTkyLCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30gfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHtcblx0XHRcdGdldExhbmd1YWdlTW9kZWxJZHMoKSB7IHJldHVybiB0ZXN0TW9kZWxzLm1hcChtID0+IG0uaWQpOyB9LFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShxdWFsaWZpZWROYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBtZXRhZGF0YSBvZiB0ZXN0TW9kZWxzKSB7XG5cdFx0XHRcdFx0aWYgKElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKHF1YWxpZmllZE5hbWUsIG1ldGFkYXRhKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgbWV0YWRhdGEsIGlkZW50aWZpZXI6IG1ldGFkYXRhLmlkIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjdXN0b21DaGF0TW9kZSA9IG5ldyBDdXN0b21DaGF0TW9kZSh7XG5cdFx0XHRpZDogJ2JlYXN0LW1vZGUnLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ215RnM6Ly90ZXN0L3Rlc3QvY2hhdG1vZGUubWQnKSxcblx0XHRcdG5hbWU6ICdCZWFzdE1vZGUnLFxuXHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHsgY29udGVudDogJ0JlYXN0IG1vZGUgaW5zdHJ1Y3Rpb25zJywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0fSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoeyBidWlsdGluOiBbQ2hhdE1vZGUuQWdlbnQsIENoYXRNb2RlLkFzaywgQ2hhdE1vZGUuRWRpdF0sIGN1c3RvbTogW2N1c3RvbUNoYXRNb2RlXSB9KSk7XG5cblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0Z2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VyLnBhcnNlKG1vZGVsLnVyaSwgbW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRob3ZlclByb3ZpZGVyID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEhvdmVyUHJvdmlkZXIpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBnZXRIb3Zlcihjb250ZW50OiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBvcHRpb25zPzogeyBjbGF1ZGVBZ2VudD86IGJvb2xlYW4gfSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZShwcm9tcHRUeXBlKTtcblx0XHRjb25zdCBleHQgPSBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKHByb21wdFR5cGUpO1xuXHRcdGNvbnN0IHBhdGggPSBvcHRpb25zPy5jbGF1ZGVBZ2VudCA/IGAvLmNsYXVkZS9hZ2VudHMvdGVzdCR7ZXh0fWAgOiBgL3Rlc3Qke2V4dH1gO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovLycgKyBwYXRoKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY29udGVudCwgbGFuZ3VhZ2VJZCwgdW5kZWZpbmVkLCB1cmkpKTtcblx0XHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihsaW5lLCBjb2x1bW4pO1xuXHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgaG92ZXJQcm92aWRlci5wcm92aWRlSG92ZXIobW9kZWwsIHBvc2l0aW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIWhvdmVyIHx8IGhvdmVyLmNvbnRlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gUmV0dXJuIHRoZSBtYXJrZG93biB2YWx1ZSBmcm9tIHRoZSBmaXJzdCBjb250ZW50XG5cdFx0Y29uc3QgZmlyc3RDb250ZW50ID0gaG92ZXIuY29udGVudHNbMF07XG5cdFx0aWYgKGZpcnN0Q29udGVudCBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmlyc3RDb250ZW50LnZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c3VpdGUoJ2FnZW50IGhvdmVycycsICgpID0+IHtcblx0XHR0ZXN0KCdob3ZlciBvbiB0YXJnZXQgYXR0cmlidXRlIHNob3dzIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1RoZSB0YXJnZXQgdG8gd2hpY2ggdGhlIGhlYWRlciBhdHRyaWJ1dGVzIGxpa2UgdG9vbHMgYXBwbHkgdG8uIFBvc3NpYmxlIHZhbHVlcyBhcmUgYGdpdGh1Yi1jb3BpbG90YCBhbmQgYHZzY29kZWAuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBtb2RlbCBhdHRyaWJ1dGUgd2l0aCBnaXRodWItY29waWxvdCB0YXJnZXQgc2hvd3Mgbm90ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHQnbW9kZWw6IE1BRSA0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J1NwZWNpZnkgdGhlIG1vZGVsIHRoYXQgcnVucyB0aGlzIGN1c3RvbSBhZ2VudC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdOb3RlOiBUaGlzIGF0dHJpYnV0ZSBpcyBub3QgdXNlZCB3aGVuIHRhcmdldCBpcyBnaXRodWItY29waWxvdC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBtb2RlbCBhdHRyaWJ1dGUgd2l0aCB2c2NvZGUgdGFyZ2V0IHNob3dzIG1vZGVsIGluZm8nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdCdtb2RlbDogTUFFIDQgKG9sYW1hKScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdCdTcGVjaWZ5IHRoZSBtb2RlbCB0aGF0IHJ1bnMgdGhpcyBjdXN0b20gYWdlbnQuIENhbiBhbHNvIGJlIGEgbGlzdCBvZiBtb2RlbHMuIFRoZSBmaXJzdCBhdmFpbGFibGUgbW9kZWwgd2lsbCBiZSB1c2VkLicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnLSBOYW1lOiBNQUUgNCcsXG5cdFx0XHRcdCctIEZhbWlseTogbWFlJyxcblx0XHRcdFx0Jy0gVmVuZG9yOiBvbGFtYSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGhhbmRvZmZzIGF0dHJpYnV0ZSB3aXRoIGdpdGh1Yi1jb3BpbG90IHRhcmdldCBzaG93cyBub3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdCdoYW5kb2ZmczonLFxuXHRcdFx0XHQnICAtIGxhYmVsOiBUZXN0Jyxcblx0XHRcdFx0JyAgICBhZ2VudDogRGVmYXVsdCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBUZXN0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J1Bvc3NpYmxlIGhhbmRvZmYgYWN0aW9ucyB3aGVuIHRoZSBhZ2VudCBoYXMgY29tcGxldGVkIGl0cyB0YXNrLicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnTm90ZTogVGhpcyBhdHRyaWJ1dGUgaXMgbm90IHVzZWQgaW4gR2l0SHViIENvcGlsb3Qgb3IgQ2xhdWRlIHRhcmdldHMuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaGFuZG9mZnMgYXR0cmlidXRlIHdpdGggdnNjb2RlIHRhcmdldCBzaG93cyBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0J2hhbmRvZmZzOicsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFRlc3QnLFxuXHRcdFx0XHQnICAgIGFnZW50OiBEZWZhdWx0Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IFRlc3QnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1Bvc3NpYmxlIGhhbmRvZmYgYWN0aW9ucyB3aGVuIHRoZSBhZ2VudCBoYXMgY29tcGxldGVkIGl0cyB0YXNrLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZ2l0aHViLWNvcGlsb3QgdG9vbCBzaG93cyBzaW1wbGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ2V4ZWN1dGUnLCAncmVhZCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Ly8gSG92ZXIgb24gJ3NoZWxsJyB0b29sXG5cdFx0XHRjb25zdCBob3ZlclNoZWxsID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlclNoZWxsLCAnVG9vbFNldDogZXhlY3V0ZVxcblxcblxcbkV4ZWN1dGUgY29kZSBhbmQgYXBwbGljYXRpb25zIG9uIHlvdXIgbWFjaGluZScpO1xuXG5cdFx0XHQvLyBIb3ZlciBvbiAncmVhZCcgdG9vbFxuXHRcdFx0Y29uc3QgaG92ZXJFZGl0ID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMjAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlckVkaXQsICdUb29sU2V0OiByZWFkXFxuXFxuXFxuUmVhZCBmaWxlcyBpbiB5b3VyIHdvcmtzcGFjZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZ2l0aHViLWNvcGlsb3QgdG9vbCB3aXRoIHRhcmdldCB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogWydzaGVsbCcsICdyZWFkJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHQvLyBIb3ZlciBvbiAnc2hlbGwnIHRvb2xcblx0XHRcdGNvbnN0IGhvdmVyU2hlbGwgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyU2hlbGwsICdUb29sU2V0OiBleGVjdXRlXFxuXFxuXFxuRXhlY3V0ZSBjb2RlIGFuZCBhcHBsaWNhdGlvbnMgb24geW91ciBtYWNoaW5lJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uICdyZWFkJyB0b29sXG5cdFx0XHRjb25zdCBob3ZlckVkaXQgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAyMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyRWRpdCwgJ1Rvb2xTZXQ6IHJlYWRcXG5cXG5cXG5SZWFkIGZpbGVzIGluIHlvdXIgd29ya3NwYWNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiB2c2NvZGUgdG9vbCBzaG93cyBkZXRhaWxlZCBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHQvLyBIb3ZlciBvbiAndG9vbDEnXG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUZXN0IFRvb2wgMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gbW9kZWwgYXR0cmlidXRlIHdpdGggdnNjb2RlIHRhcmdldCBhbmQgbW9kZWwgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGBtb2RlbDogWydNQUUgNCAob2xhbWEpJywgJ01BRSA0LjEgKGNvcGlsb3QpJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J1NwZWNpZnkgdGhlIG1vZGVsIHRoYXQgcnVucyB0aGlzIGN1c3RvbSBhZ2VudC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IE1BRSA0Jyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBtYWUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IG9sYW1hJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gc2Vjb25kIG1vZGVsIGluIG1vZGVsIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRgbW9kZWw6IFsnTUFFIDQgKG9sYW1hKScsICdNQUUgNC4xIChjb3BpbG90KSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAzMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdCdTcGVjaWZ5IHRoZSBtb2RlbCB0aGF0IHJ1bnMgdGhpcyBjdXN0b20gYWdlbnQuIENhbiBhbHNvIGJlIGEgbGlzdCBvZiBtb2RlbHMuIFRoZSBmaXJzdCBhdmFpbGFibGUgbW9kZWwgd2lsbCBiZSB1c2VkLicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnLSBOYW1lOiBNQUUgNC4xJyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBtYWUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IGNvcGlsb3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBkZXNjcmlwdGlvbiBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMiwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBjdXN0b20gYWdlbnQsIHdoYXQgaXQgZG9lcyBhbmQgd2hlbiB0byB1c2UgaXQuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBhcmd1bWVudC1oaW50IGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2FyZ3VtZW50LWhpbnQ6IFwidGVzdCBoaW50XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1RoZSBhcmd1bWVudC1oaW50IGRlc2NyaWJlcyB3aGF0IGlucHV0cyB0aGUgY3VzdG9tIGFnZW50IGV4cGVjdHMgb3Igc3VwcG9ydHMuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBuYW1lIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJNeSBBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMiwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIG5hbWUgb2YgdGhlIGFnZW50IGFzIHNob3duIGluIHRoZSBVSS4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGluZmVyIGF0dHJpYnV0ZSBzaG93cyBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0IEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0J2luZmVyOiB0cnVlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdDb250cm9scyB2aXNpYmlsaXR5IG9mIHRoZSBhZ2VudC5cXG5cXG5EZXByZWNhdGVkOiBVc2UgYHVzZXItaW52b2NhYmxlYCBhbmQgYGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbmAgaW5zdGVhZC4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGFnZW50cyBhdHRyaWJ1dGUgc2hvd3MgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdCBBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdCdhZ2VudHM6IFtcIipcIl0nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ09uZSBvciBtb3JlIGFnZW50cyB0aGF0IHRoaXMgYWdlbnQgY2FuIHVzZSBhcyBzdWJhZ2VudHMuIFVzZSBcXCcqXFwnIHRvIHNwZWNpZnkgYWxsIGF2YWlsYWJsZSBhZ2VudHMuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiB1c2VyLWludm9jYWJsZSBhdHRyaWJ1dGUgc2hvd3MgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdCBBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnV2hldGhlciB0aGUgYWdlbnQgY2FuIGJlIHNlbGVjdGVkIGFuZCBpbnZva2VkIGJ5IHVzZXJzIGluIHRoZSBVSS4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbiBhdHRyaWJ1dGUgc2hvd3MgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdCBBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ0lmIHRydWUsIHByZXZlbnRzIHRoZSBhZ2VudCBmcm9tIGJlaW5nIGludm9rZWQgYXMgYSBzdWJhZ2VudC4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Byb21wdCBob3ZlcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaG92ZXIgb24gbW9kZWwgYXR0cmlidXRlIHNob3dzIG1vZGVsIGluZm8nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlbDogTUFFIDQgKG9sYW1hKScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnVGhlIG1vZGVsIHRvIHVzZSBpbiB0aGlzIHByb21wdC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IE1BRSA0Jyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBtYWUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IG9sYW1hJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gdG9vbHMgYXR0cmlidXRlIHNob3dzIHRvb2wgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAzLCAxMCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1Rlc3QgVG9vbCAxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBhZ2VudCBhdHRyaWJ1dGUgc2hvd3MgYWdlbnQgaW5mbycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2FnZW50OiBCZWFzdE1vZGUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J1RoZSBhZ2VudCB0byB1c2Ugd2hlbiBydW5uaW5nIHRoaXMgcHJvbXB0LicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnKipCdWlsdC1pbiBhZ2VudHM6KionLFxuXHRcdFx0XHQnLSBgYWdlbnRgOiBEZXNjcmliZSB3aGF0IHRvIGJ1aWxkJyxcblx0XHRcdFx0Jy0gYGFza2A6IEV4cGxvcmUgYW5kIHVuZGVyc3RhbmQgeW91ciBjb2RlJyxcblx0XHRcdFx0Jy0gYGVkaXRgOiBFZGl0IG9yIHJlZmFjdG9yIHNlbGVjdGVkIGNvZGUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyoqQ3VzdG9tIGFnZW50czoqKicsXG5cdFx0XHRcdCctIGBCZWFzdE1vZGVgOiBDdXN0b20gYWdlbnQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBuYW1lIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJNeSBQcm9tcHRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHByb21wdFwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIG5hbWUgb2YgdGhlIHByb21wdC4gVGhpcyBpcyBhbHNvIHRoZSBuYW1lIG9mIHRoZSBzbGFzaCBjb21tYW5kIHRoYXQgd2lsbCBydW4gdGhpcyBwcm9tcHQuJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbnN0cnVjdGlvbnMgaG92ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2hvdmVyIG9uIGRlc2NyaXB0aW9uIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBpbnN0cnVjdGlvblwiJyxcblx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBpbnN0cnVjdGlvbiBmaWxlLiBJdCBjYW4gYmUgdXNlZCB0byBwcm92aWRlIGFkZGl0aW9uYWwgY29udGV4dCBvciBpbmZvcm1hdGlvbiBhYm91dCB0aGUgaW5zdHJ1Y3Rpb25zIGFuZCBpcyBwYXNzZWQgdG8gdGhlIGxhbmd1YWdlIG1vZGVsIGFzIHBhcnQgb2YgdGhlIHByb21wdC4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGFwcGx5VG8gYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J09uZSBvciBtb3JlIGdsb2IgcGF0dGVybiAoc2VwYXJhdGVkIGJ5IGNvbW1hKSB0aGF0IGRlc2NyaWJlIGZvciB3aGljaCBmaWxlcyB0aGUgaW5zdHJ1Y3Rpb25zIGFwcGx5IHRvLiBCYXNlZCBvbiB0aGVzZSBwYXR0ZXJucywgdGhlIGZpbGUgaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiB0aGUgcHJvbXB0LCB3aGVuIHRoZSBjb250ZXh0IGNvbnRhaW5zIGEgZmlsZSB0aGF0IG1hdGNoZXMgb25lIG9yIG1vcmUgb2YgdGhlc2UgcGF0dGVybnMuIFVzZSBgKipgIHdoZW4geW91IHdhbnQgdGhpcyBmaWxlIHRvIGFsd2F5cyBiZSBhZGRlZC4nLFxuXHRcdFx0XHQnRXhhbXBsZTogYCoqLyoudHNgLCBgKiovKi5qc2AsIGBjbGllbnQvKipgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gbmFtZSBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiTXkgSW5zdHJ1Y3Rpb25zXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBpbnN0cnVjdGlvblwiJyxcblx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIG5hbWUgb2YgdGhlIGluc3RydWN0aW9uIGZpbGUgYXMgc2hvd24gaW4gdGhlIFVJLiBJZiBub3Qgc2V0LCB0aGUgbmFtZSBpcyBkZXJpdmVkIGZyb20gdGhlIGZpbGUgbmFtZS4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NraWxsIGhvdmVycycsICgpID0+IHtcblx0XHR0ZXN0KCdob3ZlciBvbiBuYW1lIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJNeSBTa2lsbFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgc2tpbGxcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMiwgMSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIG5hbWUgb2YgdGhlIHNraWxsLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZGVzY3JpcHRpb24gYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3QgU2tpbGxcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHNraWxsIGRlc2NyaXB0aW9uXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgc2tpbGwuIFRoZSBkZXNjcmlwdGlvbiBpcyBhZGRlZCB0byBldmVyeSByZXF1ZXN0IGFuZCB3aWxsIGJlIHVzZWQgYnkgdGhlIGFnZW50IHRvIGRlY2lkZSB3aGVuIHRvIGxvYWQgdGhlIHNraWxsLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZmlsZSBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdCBTa2lsbFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgc2tpbGxcIicsXG5cdFx0XHRcdCdmaWxlOiBcIlNLSUxMLm1kXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NsYXVkZSBhZ2VudCBob3ZlcnMnLCAoKSA9PiB7XG5cdFx0Ly8gSGVscGVyIHRoYXQgY3JlYXRlcyBhIGhvdmVyIGluIGEgQ2xhdWRlIGFnZW50IGZpbGUgKFVSSSB1bmRlciAuY2xhdWRlL2FnZW50cy8pXG5cdFx0YXN5bmMgZnVuY3Rpb24gZ2V0Q2xhdWRlSG92ZXIoY29udGVudDogc3RyaW5nLCBsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRcdHJldHVybiBnZXRIb3Zlcihjb250ZW50LCBsaW5lLCBjb2x1bW4sIFByb21wdHNUeXBlLmFnZW50LCB7IGNsYXVkZUFnZW50OiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG5hbWUgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCAyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1VuaXF1ZSBpZGVudGlmaWVyIHVzaW5nIGxvd2VyY2FzZSBsZXR0ZXJzIGFuZCBoeXBoZW5zIChyZXF1aXJlZCknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGRlc2NyaXB0aW9uIGF0dHJpYnV0ZSBzaG93cyBDbGF1ZGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUgZm9yIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgMywgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdXaGVuIHRvIGRlbGVnYXRlIHRvIHRoaXMgc3ViYWdlbnQgKHJlcXVpcmVkKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gdG9vbHMgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0J3Rvb2xzOiBFZGl0LCBHcmVwLCBBc2tVc2VyUXVlc3Rpb24sIFdlYkZldGNoJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ0FycmF5IG9mIHRvb2xzIHRoZSBzdWJhZ2VudCBjYW4gdXNlLiBJbmhlcml0cyBhbGwgdG9vbHMgaWYgb21pdHRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaW5kaXZpZHVhbCBDbGF1ZGUgdG9vbCBzaG93cyB0b29sIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ0VkaXQnLCAnR3JlcCcsICdXZWJGZXRjaCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Ly8gSG92ZXIgb24gJ0VkaXQnIHRvb2xcblx0XHRcdGNvbnN0IGhvdmVyRWRpdCA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlckVkaXQsICdNYWtlIHRhcmdldGVkIGZpbGUgZWRpdHMnKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gJ0dyZXAnIHRvb2xcblx0XHRcdGNvbnN0IGhvdmVyR3JlcCA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDE3KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlckdyZXAsICdTZWFyY2ggZmlsZSBjb250ZW50cyB3aXRoIHJlZ2V4Jyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uICdXZWJGZXRjaCcgdG9vbFxuXHRcdFx0Y29uc3QgaG92ZXJGZXRjaCA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDI3KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlckZldGNoLCAnRmV0Y2ggVVJMIGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG1vZGVsIGF0dHJpYnV0ZSBzaG93cyBDbGF1ZGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUnLFxuXHRcdFx0XHQnbW9kZWw6IG9wdXMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdCdNb2RlbCB0byB1c2U6IHNvbm5ldCwgb3B1cywgaGFpa3UsIG9yIGluaGVyaXQuIERlZmF1bHRzIHRvIGluaGVyaXQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdDbGF1ZGUgbW9kZWwgYG9wdXNgIG1hcHMgdG8gdGhlIGZvbGxvd2luZyBtb2RlbDonLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy0gTmFtZTogQ2xhdWRlIE9wdXMgNC42Jyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBjbGF1ZGUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IGNvcGlsb3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBtb2RlbCBhdHRyaWJ1dGUgd2l0aCBzb25uZXQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnbW9kZWw6IHNvbm5ldCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J01vZGVsIHRvIHVzZTogc29ubmV0LCBvcHVzLCBoYWlrdSwgb3IgaW5oZXJpdC4gRGVmYXVsdHMgdG8gaW5oZXJpdC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0NsYXVkZSBtb2RlbCBgc29ubmV0YCBtYXBzIHRvIHRoZSBmb2xsb3dpbmcgbW9kZWw6Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IENsYXVkZSBTb25uZXQgNC41Jyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBjbGF1ZGUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IGNvcGlsb3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBtb2RlbCBhdHRyaWJ1dGUgd2l0aCBoYWlrdSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogaGFpa3UnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdCdNb2RlbCB0byB1c2U6IHNvbm5ldCwgb3B1cywgaGFpa3UsIG9yIGluaGVyaXQuIERlZmF1bHRzIHRvIGluaGVyaXQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdDbGF1ZGUgbW9kZWwgYGhhaWt1YCBtYXBzIHRvIHRoZSBmb2xsb3dpbmcgbW9kZWw6Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IENsYXVkZSBIYWlrdSA0LjUnLFxuXHRcdFx0XHQnLSBGYW1pbHk6IGNsYXVkZScsXG5cdFx0XHRcdCctIFZlbmRvcjogY29waWxvdCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG1vZGVsIGF0dHJpYnV0ZSB3aXRoIGluaGVyaXQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnbW9kZWw6IGluaGVyaXQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdCdNb2RlbCB0byB1c2U6IHNvbm5ldCwgb3B1cywgaGFpa3UsIG9yIGluaGVyaXQuIERlZmF1bHRzIHRvIGluaGVyaXQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdJbmhlcml0IG1vZGVsIGZyb20gcGFyZW50IGFnZW50IG9yIHByb21wdCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGRpc2FsbG93ZWRUb29scyBhdHRyaWJ1dGUgc2hvd3MgQ2xhdWRlIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiByZWFkLW9ubHktYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJlYWQtb25seSBhbmFseXNpcyBhZ2VudCcsXG5cdFx0XHRcdGBkaXNhbGxvd2VkVG9vbHM6IFsnV3JpdGUnLCAnRWRpdCcsICdCYXNoJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVG9vbHMgdG8gZGVueSwgcmVtb3ZlZCBmcm9tIGluaGVyaXRlZCBvciBzcGVjaWZpZWQgbGlzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaW5kaXZpZHVhbCBkaXNhbGxvd2VkVG9vbHMgdmFsdWUgc2hvd3MgdG9vbCBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogcmVhZC1vbmx5LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZWFkLW9ubHknLFxuXHRcdFx0XHRgZGlzYWxsb3dlZFRvb2xzOiBbJ0Jhc2gnLCAnV3JpdGUnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdC8vIEhvdmVyIG9uICdCYXNoJyB0b29sIHZhbHVlXG5cdFx0XHRjb25zdCBob3ZlckJhc2ggPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAyMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJCYXNoLCAnRXhlY3V0ZSBzaGVsbCBjb21tYW5kcycpO1xuXG5cdFx0XHQvLyBIb3ZlciBvbiAnV3JpdGUnIHRvb2wgdmFsdWVcblx0XHRcdGNvbnN0IGhvdmVyV3JpdGUgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAyOCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJXcml0ZSwgJ0NyZWF0ZS9vdmVyd3JpdGUgZmlsZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIHBlcm1pc3Npb25Nb2RlIGF0dHJpYnV0ZSBzaG93cyBDbGF1ZGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQncGVybWlzc2lvbk1vZGU6IGFjY2VwdEVkaXRzJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1Blcm1pc3Npb24gbW9kZTogZGVmYXVsdCwgYWNjZXB0RWRpdHMsIGRvbnRBc2ssIGJ5cGFzc1Blcm1pc3Npb25zLCBvciBwbGFuLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gbWVtb3J5IGF0dHJpYnV0ZSBzaG93cyBDbGF1ZGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnbWVtb3J5OiBwcm9qZWN0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1BlcnNpc3RlbnQgbWVtb3J5IHNjb3BlOiB1c2VyLCBwcm9qZWN0LCBvciBsb2NhbC4gRW5hYmxlcyBjcm9zcy1zZXNzaW9uIGxlYXJuaW5nLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gc2tpbGxzIGF0dHJpYnV0ZSBzaG93cyBDbGF1ZGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnc2tpbGxzOiBbXCJjb2RlLXJldmlld1wiXScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdTa2lsbHMgdG8gbG9hZCBpbnRvIHRoZSBzdWJhZ2VudFxcJ3MgY29udGV4dCBhdCBzdGFydHVwLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaG9va3MgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdob29rczoge30nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnTGlmZWN5Y2xlIGhvb2tzIHNjb3BlZCB0byB0aGlzIHN1YmFnZW50LicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaGFuZG9mZnMgYXR0cmlidXRlIGluIENsYXVkZSBhZ2VudCBzaG93cyBub3QtdXNlZCBub3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0J2hhbmRvZmZzOicsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFRlc3QnLFxuXHRcdFx0XHQnICAgIGFnZW50OiBEZWZhdWx0Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IFRlc3QnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0Ly8gaGFuZG9mZnMgaXMgbm90IGEgQ2xhdWRlIGF0dHJpYnV0ZSwgc28gbm8gaG92ZXIgc2hvdWxkIGFwcGVhclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnVsbCBleGFtcGxlOiBob3ZlciBvbiBlYWNoIGF0dHJpYnV0ZSBvZiBhIENsYXVkZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlYWxpc3RpYyBDbGF1ZGUgYWdlbnQgZmlsZSBhcyB1c2VyIHByb3ZpZGVkXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUgZm9yIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcycsXG5cdFx0XHRcdGB0b29sczogWydFZGl0JywgJ0dyZXAnLCAnQXNrVXNlclF1ZXN0aW9uJywgJ1dlYkZldGNoJ11gLFxuXHRcdFx0XHQnbW9kZWw6IG9wdXMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1lvdSBhcmUgYSBzZW5pb3Igc2VjdXJpdHkgZW5naW5lZXIuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uIG5hbWUgKGxpbmUgMilcblx0XHRcdGNvbnN0IG5hbWVIb3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hbWVIb3ZlciwgJ1VuaXF1ZSBpZGVudGlmaWVyIHVzaW5nIGxvd2VyY2FzZSBsZXR0ZXJzIGFuZCBoeXBoZW5zIChyZXF1aXJlZCknKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gZGVzY3JpcHRpb24gKGxpbmUgMylcblx0XHRcdGNvbnN0IGRlc2NIb3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDMsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2NIb3ZlciwgJ1doZW4gdG8gZGVsZWdhdGUgdG8gdGhpcyBzdWJhZ2VudCAocmVxdWlyZWQpJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uIHRvb2xzIGF0dHJpYnV0ZSBrZXkgKGxpbmUgNCwgY29sdW1uIDEpXG5cdFx0XHRjb25zdCB0b29sc0hvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHNIb3ZlciwgJ0FycmF5IG9mIHRvb2xzIHRoZSBzdWJhZ2VudCBjYW4gdXNlLiBJbmhlcml0cyBhbGwgdG9vbHMgaWYgb21pdHRlZCcpO1xuXG5cdFx0XHQvLyBIb3ZlciBvbiAnQXNrVXNlclF1ZXN0aW9uJyB0b29sIHZhbHVlIChsaW5lIDQpXG5cdFx0XHRjb25zdCBhc2tIb3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDI4KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhc2tIb3ZlciwgJ0FzayBtdWx0aXBsZS1jaG9pY2UgcXVlc3Rpb25zJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uIG1vZGVsIHZhbHVlICdvcHVzJyAobGluZSA1KVxuXHRcdFx0Y29uc3QgbW9kZWxIb3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDUsIDEpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNb2RlbEhvdmVyID0gW1xuXHRcdFx0XHQnTW9kZWwgdG8gdXNlOiBzb25uZXQsIG9wdXMsIGhhaWt1LCBvciBpbmhlcml0LiBEZWZhdWx0cyB0byBpbmhlcml0LicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnQ2xhdWRlIG1vZGVsIGBvcHVzYCBtYXBzIHRvIHRoZSBmb2xsb3dpbmcgbW9kZWw6Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IENsYXVkZSBPcHVzIDQuNicsXG5cdFx0XHRcdCctIEZhbWlseTogY2xhdWRlJyxcblx0XHRcdFx0Jy0gVmVuZG9yOiBjb3BpbG90J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbEhvdmVyLCBleHBlY3RlZE1vZGVsSG92ZXIpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsVUFBVSxnQkFBZ0Isd0JBQXdCO0FBQzNELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDRCQUF1QyxzQkFBc0I7QUFDdEUsU0FBUyw0QkFBNEIsOEJBQThCO0FBQ25FLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCLHNCQUFzQjtBQUNoRCxTQUFTLDZCQUE2QixhQUFhLGNBQWM7QUFDakUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sdUJBQXVCLE1BQU07QUFDbEMsUUFBTSxjQUFj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
