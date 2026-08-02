import assert from "assert";
import { ResourceSet } from "../../../../../../../base/common/map.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { MarkerSeverity, MarkerTag } from "../../../../../../../platform/markers/common/markers.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatMode, CustomChatMode, IChatModeService } from "../../../../common/chatModes.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../../common/languageModels.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptValidator } from "../../../../common/promptSyntax/languageProviders/promptValidator.js";
import { PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { MockChatModeService } from "../../../common/mockChatModeService.js";
import { MockPromptsService } from "../../../common/promptSyntax/service/mockPromptsService.js";
suite("PromptValidator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let testConfigService;
  const existingRef1 = URI.parse("myFs://test/reference1.md");
  const existingRef2 = URI.parse("myFs://test/reference2.md");
  setup(async () => {
    testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
    instaService = workbenchInstantiationService({
      contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, disposables);
    instaService.stub(ILabelService, { getUriLabel: (resource) => resource.path });
    const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
    const testTool1 = { id: "testTool1", displayName: "tool1", canBeReferencedInPrompt: true, modelDescription: "Test Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool1));
    const testTool2 = { id: "testTool2", displayName: "tool2", canBeReferencedInPrompt: true, toolReferenceName: "tool2", modelDescription: "Test Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool2));
    const shellTool = { id: "shell", displayName: "shell", canBeReferencedInPrompt: true, toolReferenceName: "shell", modelDescription: "Runs commands in the terminal", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(shellTool));
    const myExtSource = { type: "extension", label: "My Extension", extensionId: new ExtensionIdentifier("My.extension") };
    const testTool3 = { id: "testTool3", displayName: "tool3", canBeReferencedInPrompt: true, toolReferenceName: "tool3", modelDescription: "Test Tool 3", source: myExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool3));
    const prExtSource = { type: "extension", label: "GitHub Pull Request Extension", extensionId: new ExtensionIdentifier("github.vscode-pull-request-github") };
    const prExtTool1 = { id: "suggestFix", canBeReferencedInPrompt: true, toolReferenceName: "suggest-fix", modelDescription: "tool4", displayName: "Test Tool 4", source: prExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(prExtTool1));
    const toolWithLegacy = { id: "newTool", toolReferenceName: "newToolRef", displayName: "New Tool", canBeReferencedInPrompt: true, modelDescription: "New Tool", source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ["oldToolName", "deprecatedToolName"] };
    disposables.add(toolService.registerToolData(toolWithLegacy));
    const toolSetWithLegacy = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "newToolSet",
      "newToolSetRef",
      { description: "New Tool Set", legacyFullNames: ["oldToolSet", "deprecatedToolSet"] }
    ));
    const toolInSet = { id: "toolInSet", toolReferenceName: "toolInSetRef", displayName: "Tool In Set", canBeReferencedInPrompt: false, modelDescription: "Tool In Set", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(toolInSet));
    disposables.add(toolSetWithLegacy.addTool(toolInSet));
    const anotherToolWithLegacy = { id: "anotherTool", toolReferenceName: "anotherToolRef", displayName: "Another Tool", canBeReferencedInPrompt: true, modelDescription: "Another Tool", source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ["legacyTool"] };
    disposables.add(toolService.registerToolData(anotherToolWithLegacy));
    const anotherToolSetWithLegacy = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "anotherToolSet",
      "anotherToolSetRef",
      { description: "Another Tool Set", legacyFullNames: ["legacyToolSet"] }
    ));
    const anotherToolInSet = { id: "anotherToolInSet", toolReferenceName: "anotherToolInSetRef", displayName: "Another Tool In Set", canBeReferencedInPrompt: false, modelDescription: "Another Tool In Set", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(anotherToolInSet));
    disposables.add(anotherToolSetWithLegacy.addTool(anotherToolInSet));
    const conflictToolSet1 = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "conflictSet1",
      "conflictSet1Ref",
      { legacyFullNames: ["sharedLegacyName"] }
    ));
    const conflictTool1 = { id: "conflictTool1", toolReferenceName: "conflictTool1Ref", displayName: "Conflict Tool 1", canBeReferencedInPrompt: false, modelDescription: "Conflict Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(conflictTool1));
    disposables.add(conflictToolSet1.addTool(conflictTool1));
    const conflictToolSet2 = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "conflictSet2",
      "conflictSet2Ref",
      { legacyFullNames: ["sharedLegacyName"] }
    ));
    const conflictTool2 = { id: "conflictTool2", toolReferenceName: "conflictTool2Ref", displayName: "Conflict Tool 2", canBeReferencedInPrompt: false, modelDescription: "Conflict Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(conflictTool2));
    disposables.add(conflictToolSet2.addTool(conflictTool2));
    const toolInVscodeSet = { id: "browserTool", toolReferenceName: "openIntegratedBrowser", legacyToolReferenceFullNames: ["openSimpleBrowser"], displayName: "Open Integrated Browser", canBeReferencedInPrompt: true, modelDescription: "Open browser", source: ToolDataSource.Internal, inputSchema: {} };
    disposables.add(toolService.registerToolData(toolInVscodeSet));
    disposables.add(toolService.vscodeToolSet.addTool(toolInVscodeSet));
    instaService.set(ILanguageModelToolsService, toolService);
    const testModels = [
      { id: "mae-4", name: "MAE 4", vendor: "olama", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "mae-4.1", name: "MAE 4.1", vendor: "copilot", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "mae-3.5-turbo", name: "MAE 3.5 Turbo", vendor: "copilot", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
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
    const existingFiles = new ResourceSet([existingRef1, existingRef2]);
    instaService.stub(IFileService, {
      exists(uri) {
        return Promise.resolve(existingFiles.has(uri));
      }
    });
    const promptsService = new MockPromptsService();
    const customMode = {
      id: "custom-mode",
      uri: URI.parse("file:///test/custom-mode.md"),
      name: "Plan",
      description: "A test custom mode",
      tools: ["tool1", "tool2"],
      agentInstructions: { content: "Custom mode body", toolReferences: [] },
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true
    };
    promptsService.setCustomModes([customMode]);
    instaService.stub(IPromptsService, promptsService);
  });
  async function validate(code, promptType, uri) {
    if (!uri) {
      uri = URI.parse("myFs://test/testFile" + getPromptFileExtension(promptType));
    }
    const result = new PromptFileParser().parse(uri, code);
    const validator = instaService.createInstance(PromptValidator);
    const markers = [];
    await validator.validate(result, promptType, (m) => markers.push(m));
    return markers;
  }
  suite("agents", () => {
    test("correct agent", async () => {
      const content = [
        /* 01 */
        "---",
        /* 02 */
        `description: "Agent mode test"`,
        /* 03 */
        "model: MAE 4.1",
        /* 04 */
        `tools: ['tool1', 'tool2']`,
        /* 05 */
        "---",
        /* 06 */
        "This is a chat agent test.",
        /* 07 */
        "Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md)."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("agent with errors (empty description, unknown tool & model)", async () => {
      const content = [
        /* 01 */
        "---",
        /* 02 */
        `description: ""`,
        // empty description -> error
        /* 03 */
        "model: MAE 4.2",
        // unknown model -> warning
        /* 04 */
        `tools: ['tool1', 'tool2', 'tool4', 'my.extension/tool3']`,
        // tool4 unknown -> error
        /* 05 */
        "---",
        /* 06 */
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message, tags: m.tags })),
        [
          { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.`, tags: void 0 },
          { severity: MarkerSeverity.Hint, message: `Unknown tool 'tool4' will be ignored.`, tags: [MarkerTag.Unnecessary] },
          { severity: MarkerSeverity.Hint, message: `Unknown model 'MAE 4.2' will be ignored.`, tags: [MarkerTag.Unnecessary] }
        ]
      );
    });
    test("tools must be array or string", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: 'tool1'`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 0);
    });
    test("model as string array - valid", async () => {
      const content = [
        "---",
        'description: "Test with model array"',
        `model: ['MAE 4 (olama)', 'MAE 4.1']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("model as string array - unknown model is ignored", async () => {
      const content = [
        "---",
        'description: "Test with model array"',
        `model: ['MAE 4 (olama)', 'Unknown Model']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown model 'Unknown Model' will be ignored.`);
    });
    test("model as string array - unsuitable model", async () => {
      const content = [
        "---",
        'description: "Test with model array"',
        `model: ['MAE 4 (olama)', 'MAE 3.5 Turbo']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
    });
    test("model as string array - empty array", async () => {
      const content = [
        "---",
        'description: "Test with empty model array"',
        `model: []`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' array must not be empty.`);
    });
    test("model as string array - non-string item", async () => {
      const content = [
        "---",
        'description: "Test with invalid model array"',
        `model: ['MAE 4 (olama)', []]`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' array must contain only strings.`);
    });
    test("model as string array - empty string item", async () => {
      const content = [
        "---",
        'description: "Test with empty string in model array"',
        `model: ['MAE 4 (olama)', '']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `Model names in the array must be non-empty strings.`);
    });
    test("model as invalid type", async () => {
      const content = [
        "---",
        'description: "Test with invalid model type"',
        `model: {}`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' attribute must be a string or an array of strings.`);
    });
    test("each tool must be string", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['tool1', {}]`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Each tool name in the 'tools' attribute must be a string.` }
        ]
      );
    });
    test("old tool reference", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['tool1', 'tool3']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` }
        ]
      );
    });
    test("legacy tool reference names", async () => {
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'oldToolName']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.` }
          ]
        );
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'deprecatedToolName']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolName' has been renamed, use 'newToolRef' instead.` }
          ]
        );
      }
    });
    test("legacy toolset names", async () => {
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'oldToolSet']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolSet' has been renamed, use 'newToolSetRef' instead.` }
          ]
        );
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'deprecatedToolSet']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolSet' has been renamed, use 'newToolSetRef' instead.` }
          ]
        );
      }
    });
    test("multiple legacy names in same tools list", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['legacyTool', 'legacyToolSet', 'tool3']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyTool' has been renamed, use 'anotherToolRef' instead.` },
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyToolSet' has been renamed, use 'anotherToolSetRef' instead.` },
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` }
        ]
      );
    });
    test("deprecated tool name mapping to multiple new names", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['sharedLegacyName']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
      const expectedMessage = `Tool or toolset 'sharedLegacyName' has been renamed, use the following tools instead: conflictSet1Ref, conflictSet2Ref`;
      assert.strictEqual(markers[0].message, expectedMessage);
    });
    test("deprecated tool name in body variable reference - single mapping", async () => {
      const content = [
        "---",
        'description: "Test"',
        "---",
        "Body with #tool:oldToolName reference"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
      assert.strictEqual(markers[0].message, `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.`);
    });
    test("deprecated tool name in body variable reference - multiple mappings", async () => {
      const multiMapToolSet1 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(
        ToolDataSource.External,
        "multiMapSet1",
        "multiMapSet1Ref",
        { legacyFullNames: ["multiMapLegacy"] }
      ));
      const multiMapTool1 = { id: "multiMapTool1", toolReferenceName: "multiMapTool1Ref", displayName: "Multi Map Tool 1", canBeReferencedInPrompt: true, modelDescription: "Multi Map Tool 1", source: ToolDataSource.External, inputSchema: {} };
      disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool1));
      disposables.add(multiMapToolSet1.addTool(multiMapTool1));
      const multiMapToolSet2 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(
        ToolDataSource.External,
        "multiMapSet2",
        "multiMapSet2Ref",
        { legacyFullNames: ["multiMapLegacy"] }
      ));
      const multiMapTool2 = { id: "multiMapTool2", toolReferenceName: "multiMapTool2Ref", displayName: "Multi Map Tool 2", canBeReferencedInPrompt: true, modelDescription: "Multi Map Tool 2", source: ToolDataSource.External, inputSchema: {} };
      disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool2));
      disposables.add(multiMapToolSet2.addTool(multiMapTool2));
      const content = [
        "---",
        'description: "Test"',
        "---",
        "Body with #tool:multiMapLegacy reference"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
      const expectedMessage = `Tool or toolset 'multiMapLegacy' has been renamed, use the following tools instead: multiMapSet1Ref, multiMapSet2Ref`;
      assert.strictEqual(markers[0].message, expectedMessage);
    });
    test("namespaced deprecated tool name in tools header shows rename hint", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['vscode/openSimpleBrowser']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'vscode/openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.` }
        ]
      );
    });
    test("bare deprecated tool name in tools header also shows rename hint", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['openSimpleBrowser']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.` }
        ]
      );
    });
    test("unknown attribute in agent file", async () => {
      const content = [
        "---",
        'description: "Test"',
        `applyTo: '*.ts'`,
        // not allowed in agent file
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message, tags: m.tags })),
        [
          { severity: MarkerSeverity.Hint, message: `Attribute 'applyTo' is not supported in VS Code agent files. Supported: agents, argument-hint, description, disable-model-invocation, github, handoffs, hooks, model, name, target, tools, user-invocable.`, tags: [MarkerTag.Unnecessary] }
        ]
      );
    });
    test("tools with invalid handoffs", async () => {
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs: next`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`The 'handoffs' attribute must be an array.`]);
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs:`,
          `  - label: '123'`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`Missing required properties 'agent', 'prompt' in handoff object.`]);
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs:`,
          `  - label: '123'`,
          `    agent: ''`,
          `    prompt: ''`,
          `    send: true`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`The 'agent' property in a handoff must be a non-empty string.`]);
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs:`,
          `  - label: '123'`,
          `    agent: 'Cool'`,
          `    prompt: ''`,
          `    send: true`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`Unknown agent 'Cool'. Available agents: agent, ask, edit, BeastMode.`]);
      }
    });
    test("agent with handoffs attribute", async () => {
      const content = [
        "---",
        'description: "Test agent with handoffs"',
        `handoffs:`,
        "  - label: Test Prompt",
        "    agent: agent",
        "    prompt: Add tests for this code",
        "  - label: Optimize Performance",
        "    agent: agent",
        "    prompt: Optimize for performance",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Expected no validation issues for handoffs attribute");
    });
    test("duplicate handoff labels are reported", async () => {
      const content = [
        "---",
        'description: "Test"',
        `handoffs:`,
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Go implement",
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Go implement again",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [
        "Duplicate handoff label 'Start Implementation'. Each handoff must have a unique label."
      ]);
    });
    test("duplicate handoff labels are case-insensitive", async () => {
      const content = [
        "---",
        'description: "Test"',
        `handoffs:`,
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Go implement",
        "  - label: start implementation",
        "    agent: edit",
        "    prompt: Different prompt",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [
        "Duplicate handoff label 'start implementation'. Each handoff must have a unique label."
      ]);
    });
    test("handoff label must contain alphanumeric character", async () => {
      const content = [
        "---",
        'description: "Test"',
        `handoffs:`,
        '  - label: "!!!"',
        "    agent: agent",
        "    prompt: Go",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [
        "The 'label' property in a handoff must contain at least one alphanumeric character."
      ]);
    });
    test("github-copilot agent with supported attributes", async () => {
      const content = [
        "---",
        'name: "GitHub_Copilot_Custom_Agent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        `tools: ['shell', 'edit', 'search', 'custom-agent']`,
        "mcp-servers: []",
        "---",
        "Body with #search and #edit references"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Expected no validation issues for github-copilot target");
    });
    test("github-copilot agent warns about model and handoffs attributes", async () => {
      const content = [
        "---",
        'name: "GitHubAgent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        "model: MAE 4.1",
        `tools: ['shell', 'edit']`,
        `handoffs:`,
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      const messages = markers.map((m) => m.message);
      assert.deepStrictEqual(messages, [
        "Attribute 'model' is not supported in custom GitHub Copilot agent files. Supported: description, github, infer, mcp-servers, name, target, tools.",
        "Attribute 'handoffs' is not supported in custom GitHub Copilot agent files. Supported: description, github, infer, mcp-servers, name, target, tools."
      ], "Model and handoffs are not validated for github-copilot target");
    });
    test("github-copilot agent does not validate variable references", async () => {
      const content = [
        "---",
        'name: "GitHubAgent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        `tools: ['shell', 'edit']`,
        "---",
        "Body with #unknownTool reference"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Variable references are not validated for github-copilot target");
    });
    test("github-copilot agent rejects unsupported attributes", async () => {
      const content = [
        "---",
        'name: "GitHubAgent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        'argument-hint: "test hint"',
        `tools: ['shell']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.includes(`Attribute 'argument-hint' is not supported`), "Expected hint about unsupported attribute");
    });
    test("github-copilot agent with valid permissions", async () => {
      const content = [
        "---",
        'name: "IssueTriage"',
        'description: "Triages issues"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  permissions:",
        "    issues: write",
        "    contents: read",
        "    metadata: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("github-copilot agent with invalid permission scope", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  permissions:",
        "    unknown-scope: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.ok(markers[0].message.includes("Unknown permission scope 'unknown-scope'"));
    });
    test("github-copilot agent with invalid permission value", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  permissions:",
        "    metadata: write",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.ok(markers[0].message.includes("Invalid permission value 'write' for scope 'metadata'"));
    });
    test("github-copilot agent with non-map github attribute", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github: invalid",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, "The 'github' attribute must be an object.");
    });
    test("github-copilot agent with unknown github sub-property", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  unknown: value",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.ok(markers[0].message.includes("Unknown property 'unknown'"));
    });
    test("undefined target agent with valid github permissions", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github:",
        "  permissions:",
        "    issues: write",
        "    contents: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("undefined target agent with invalid github permission scope", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github:",
        "  permissions:",
        "    unknown-scope: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.ok(markers[0].message.includes("Unknown permission scope 'unknown-scope'"));
    });
    test("undefined target agent with invalid github permission value", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github:",
        "  permissions:",
        "    metadata: write",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.ok(markers[0].message.includes("Invalid permission value 'write' for scope 'metadata'"));
    });
    test("undefined target agent with non-map github attribute", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github: invalid",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, "The 'github' attribute must be an object.");
    });
    test("vscode target agent validates normally", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        "target: vscode",
        "model: MAE 4.1",
        `tools: ['tool1', 'tool2']`,
        "---",
        "Body with #tool1"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "VS Code target should validate normally");
    });
    test("vscode target agent marks unknown tools as unnecessary hints", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        "target: vscode",
        `tools: ['tool1', 'unknownTool']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown tool 'unknownTool' will be ignored.`);
    });
    test("vscode target agent with mcp-servers and github-tools", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        "target: vscode",
        `tools: ['tool1', 'edit']`,
        `mcp-servers: {}`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      const messages = markers.map((m) => m.message);
      assert.deepStrictEqual(messages, [
        "Attribute 'mcp-servers' is ignored when running locally in VS Code.",
        "Unknown tool 'edit' will be ignored."
      ]);
    });
    test("undefined target with mcp-servers and github-tools", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        `tools: ['tool1', 'shell']`,
        `mcp-servers: {}`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      const messages = markers.map((m) => m.message);
      assert.deepStrictEqual(messages, [
        "Attribute 'mcp-servers' is ignored when running locally in VS Code."
      ]);
    });
    test("default target (no target specified) validates as vscode", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "model: MAE 4.1",
        `tools: ['tool1']`,
        'argument-hint: "test hint"',
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Agent without target should validate as vscode");
    });
    test("name attribute validation", async () => {
      {
        const content = [
          "---",
          'name: "MyAgent"',
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid name should not produce errors");
      }
      {
        const content = [
          "---",
          'name: ""',
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
      }
      {
        const content = [
          "---",
          "name: []",
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must be a string.`);
      }
      {
        const content = [
          "---",
          'name: "My_Agent-2.0 with spaces"',
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Name with allowed characters should be valid");
      }
    });
    test("github-copilot target requires name attribute", async () => {
      {
        const content = [
          "---",
          'description: "GitHub Copilot agent"',
          "target: github-copilot",
          `tools: ['shell']`,
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 0);
      }
      {
        const content = [
          "---",
          'name: "GitHubAgent"',
          'description: "GitHub Copilot agent"',
          "target: github-copilot",
          `tools: ['shell']`,
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid github-copilot agent with name should not produce errors");
      }
      {
        const content = [
          "---",
          'description: "VS Code agent"',
          "target: vscode",
          `tools: ['tool1']`,
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Name should be optional for vscode target");
      }
    });
    test("infer attribute validation", async () => {
      const deprecationMessage = `The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'.`;
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "infer: true",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1, "infer: true should produce deprecation warning");
        assert.strictEqual(markers[0].message, deprecationMessage);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "infer: false",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1, "infer: false should produce deprecation warning");
        assert.strictEqual(markers[0].message, deprecationMessage);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          'infer: "yes"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1, 'infer: "yes" should produce deprecation warning');
        assert.strictEqual(markers[0].message, deprecationMessage);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Missing infer attribute should be allowed");
      }
    });
    test("agents attribute must be an array", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: 'myAgent'`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`The 'agents' attribute must be an array.`]);
    });
    test("each agent name in agents attribute must be a string", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', {}]`,
        `tools: ['agent']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`Each agent name in the 'agents' attribute must be a string.`]);
    });
    test("unknown agent in agents attribute shows unnecessary hint", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['UnknownAgent']`,
        `tools: ['agent']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown agent 'UnknownAgent' will be ignored. Available agents: Plan, agent.`);
    });
    test("agents attribute with non-empty value requires agent tool 1", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', 'Plan']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [], `No warnings about agents attribute when no tools are specified`);
    });
    test("agents attribute with non-empty value requires agent tool 2", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', 'Plan']`,
        `tools: ['shell']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
    });
    test("agents attribute with non-empty value requires agent tool 3", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', 'Plan']`,
        `tools: ['agent']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [], `No warnings about agents attribute when agent tool is in header`);
    });
    test("agents attribute with non-empty value requires agent tool 4", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['*']`,
        `tools: ['shell']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
    });
    test("agents attribute with empty array does not require agent tool", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: []`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Empty array should not require agent tool");
    });
    test("user-invocable attribute validation", async () => {
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "user-invocable: true",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid user-invocable: true should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "user-invocable: false",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid user-invocable: false should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          'user-invocable: "yes"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "user-invocable: 1",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
    });
    test("removed user-invokable attribute is reported as unknown", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test agent"',
        "user-invokable: true",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1, "user-invokable should produce exactly one diagnostic");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.includes("user-invokable"), "hint should mention the attribute name");
      assert.ok(markers[0].message.includes("not supported"), "hint should say attribute is not supported");
    });
    test("disable-model-invocation attribute validation", async () => {
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "disable-model-invocation: true",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid disable-model-invocation: true should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "disable-model-invocation: false",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid disable-model-invocation: false should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          'disable-model-invocation: "yes"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "disable-model-invocation: 0",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
    });
    test("hooks - valid hook commands", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "  PreToolUse:",
        "    - type: command",
        "      command: ./validate.sh",
        "      cwd: scripts",
        "      timeout: 30",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - must be a map", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'hooks' attribute must be a map of hook event types to command arrays.` }
        ]
      );
    });
    test("hooks - unknown hook event type", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  UnknownEvent:",
        "    - type: command",
        "      command: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Warning, message: `Unknown hook event type 'UnknownEvent'. Supported: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop, ErrorOccurred.` }
        ]
      );
    });
    test("hooks - hook value must be array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Hook event 'SessionStart' must have an array of command objects as its value.` }
        ]
      );
    });
    test("hooks - command item must be object", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - just a string",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Each hook command must be an object.` }
        ]
      );
    });
    test("hooks - missing type property", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Hook command is missing required property 'type'.` }
        ]
      );
    });
    test("hooks - type must be command", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: script",
        "      command: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` }
        ]
      );
    });
    test("hooks - missing command field", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'.` }
        ]
      );
    });
    test("hooks - empty command string", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        '      command: ""',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'command' property in a hook command must be a non-empty string.` }
        ]
      );
    });
    test("hooks - platform-specific commands are valid", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      windows: echo hello",
        "      linux: echo hello",
        "      osx: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - env must be a map with string values", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      env: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'env' property in a hook command must be a map of string values.` }
        ]
      );
    });
    test("hooks - valid env map", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      env:",
        "        NODE_ENV: production",
        '        DEBUG: "true"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - unknown property warns", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      unknownProp: value",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Warning, message: `Unknown property 'unknownProp' in hook command.` }
        ]
      );
    });
    test("hooks - timeout must be number", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      timeout: not-a-number",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'timeout' property in a hook command must be a number.` }
        ]
      );
    });
    test("hooks - cwd must be string", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      cwd:",
        "        - array",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'cwd' property in a hook command must be a string.` }
        ]
      );
    });
    test("hooks - multiple errors in one command", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: script",
        "      unknownProp: value",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` },
          { severity: MarkerSeverity.Warning, message: `Unknown property 'unknownProp' in hook command.` },
          { severity: MarkerSeverity.Error, message: `Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'.` }
        ]
      );
    });
    test("hooks - nested matcher format is valid", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  UserPromptSubmit:",
        "    - hooks:",
        "        - type: command",
        '          command: "echo foo"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - nested matcher validates inner commands", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  PreToolUse:",
        "    - matcher: Bash",
        "      hooks:",
        "        - type: script",
        '          command: "echo foo"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` }
        ]
      );
    });
    test("hooks - nested hooks must be array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  PreToolUse:",
        "    - hooks: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'hooks' property in a matcher must be an array of command objects.` }
        ]
      );
    });
  });
  suite("instructions", () => {
    test("instructions valid", async () => {
      const content = [
        "---",
        'description: "Instr"',
        "applyTo: *.ts,*.js",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.deepEqual(markers, []);
    });
    test("instructions invalid applyTo type", async () => {
      const content = [
        "---",
        'description: "Instr"',
        "applyTo: []",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].message, `The 'applyTo' attribute must be a string.`);
    });
    test("instructions invalid applyTo glob & unknown attribute", async () => {
      const content = [
        "---",
        'description: "Instr"',
        `applyTo: ''`,
        // empty -> invalid glob
        "model: mae-4",
        // model not allowed in instructions
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.strictEqual(markers.length, 2);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.startsWith(`Attribute 'model' is not supported in instructions files.`));
      assert.strictEqual(markers[1].message, `The 'applyTo' attribute must be a valid glob pattern.`);
    });
    test("invalid header structure (YAML array)", async () => {
      const content = [
        "---",
        "- item1",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].message, "Invalid header, expecting <key: value> pairs");
    });
    test("name attribute validation in instructions", async () => {
      {
        const content = [
          "---",
          'name: "MyInstructions"',
          'description: "Test instructions"',
          'applyTo: "**/*.ts"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.instructions);
        assert.deepStrictEqual(markers, [], "Valid name should not produce errors");
      }
      {
        const content = [
          "---",
          'name: ""',
          'description: "Test instructions"',
          'applyTo: "**/*.ts"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.instructions);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
      }
    });
  });
  suite("prompts", () => {
    test("prompt valid with agent mode (default) and tools and a BYO model", async () => {
      const content = [
        "---",
        'description: "Prompt with tools"',
        "model: MAE 4.1",
        `tools: ['tool1','tool2']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, []);
    });
    test("prompt model not suited for agent mode", async () => {
      const content = [
        "---",
        'description: "Prompt with unsuitable model"',
        "model: MAE 3.5 Turbo",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1, "Expected one warning about unsuitable model");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
    });
    test("prompt with custom agent BeastMode and tools", async () => {
      const content = [
        "---",
        'description: "Prompt custom mode"',
        "agent: BeastMode",
        `tools: ['tool1']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, []);
    });
    test("prompt with custom mode BeastMode and tools", async () => {
      const content = [
        "---",
        'description: "Prompt custom mode"',
        "mode: BeastMode",
        `tools: ['tool1']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1);
      assert.deepStrictEqual(markers.map((m) => m.message), [`The 'mode' attribute has been deprecated. Please rename it to 'agent'.`]);
    });
    test("prompt with custom mode an agent", async () => {
      const content = [
        "---",
        'description: "Prompt custom mode"',
        "mode: BeastMode",
        `agent: agent`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1);
      assert.deepStrictEqual(markers.map((m) => m.message), [`The 'mode' attribute has been deprecated. The 'agent' attribute is used instead.`]);
    });
    test("prompt with unknown agent Ask", async () => {
      const content = [
        "---",
        'description: "Prompt unknown agent Ask"',
        "agent: Ask",
        `tools: ['tool1','tool2']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1, "Expected one warning about tools in non-agent mode");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown agent 'Ask'. Available agents: agent, ask, edit, BeastMode.`);
    });
    test("prompt with agent edit", async () => {
      const content = [
        "---",
        'description: "Prompt edit mode with tool"',
        "agent: edit",
        `tools: ['tool1']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `The 'tools' attribute is only supported when using agents. Attribute will be ignored.`);
    });
    test("name attribute validation in prompts", async () => {
      {
        const content = [
          "---",
          'name: "MyPrompt"',
          'description: "Test prompt"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.prompt);
        assert.deepStrictEqual(markers, [], "Valid name should not produce errors");
      }
      {
        const content = [
          "---",
          'name: ""',
          'description: "Test prompt"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.prompt);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
      }
    });
  });
  suite("body", () => {
    test("body with existing file references and known tools has no markers", async () => {
      const content = [
        "---",
        'description: "Refs"',
        "---",
        "Here is a #file:./reference1.md and a markdown [reference](./reference2.md) plus variables #tool1 and #tool2"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, [], "Expected no validation issues");
    });
    test("body with missing file references reports warnings", async () => {
      const content = [
        "---",
        'description: "Missing Refs"',
        "---",
        "Here is a #file:./missing1.md and a markdown [missing link](./missing2.md)."
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      const messages = markers.map((m) => m.message).sort();
      assert.deepStrictEqual(messages, [
        `File './missing1.md' not found at '/missing1.md'.`,
        `File './missing2.md' not found at '/missing2.md'.`
      ]);
    });
    test("body with http link", async () => {
      const content = [
        "---",
        'description: "HTTP Link"',
        "---",
        "Here is a [http link](http://example.com)."
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, [], "Expected no validation issues");
    });
    test("body with url link", async () => {
      const nonExistingRef = existingRef1.with({ path: "/nonexisting" });
      const content = [
        "---",
        'description: "URL Links"',
        "---",
        `Here is a [url link](${existingRef1.toString()}).`,
        `Here is a [url link](${nonExistingRef.toString()}).`
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      const messages = markers.map((m) => m.message).sort();
      assert.deepStrictEqual(messages, [
        `File 'myFs://test/nonexisting' not found at '/nonexisting'.`
      ]);
    });
    test("body with unknown tool variable reference is an unnecessary hint", async () => {
      const content = [
        "---",
        'description: "Unknown tool var"',
        "---",
        "This line references known #tool:tool1 and unknown #tool:toolX"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1, "Expected one diagnostic for unknown tool variable");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown tool or toolset 'toolX'.`);
    });
    test("body with tool not present in tools list", async () => {
      const content = [
        "---",
        "tools: []",
        "---",
        "I need",
        "#tool:ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes",
        "#tool:github.vscode-pull-request-github/suggest-fix",
        "#tool:openSimpleBrowser"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      const actual = markers.sort((a, b) => a.startLineNumber - b.startLineNumber).map((m) => ({ message: m.message, startColumn: m.startColumn, endColumn: m.endColumn }));
      assert.deepEqual(actual, [
        { message: `Unknown extension tool 'ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes'. It is likely to be a missing extension, please ensure it is installed and enabled.`, startColumn: 7, endColumn: 77 },
        { message: `Tool or toolset 'github.vscode-pull-request-github/suggest-fix' also needs to be enabled in the header.`, startColumn: 7, endColumn: 52 },
        { message: `Tool or toolset 'openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.`, startColumn: 7, endColumn: 24 }
      ]);
    });
  });
  suite("skills", () => {
    test("skill name matches folder name", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "Expected no validation issues when name matches folder");
    });
    test("skill name does not match folder name", async () => {
      const content = [
        "---",
        "name: different-name",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `The skill name 'different-name' should match the folder name 'my-skill'.`);
    });
    test("skill without name attribute should warn", async () => {
      const content = [
        "---",
        "description: Test Skill",
        "---",
        "This is a skill without a name."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a name.");
    });
    test("skill without frontmatter should not warn about missing name or description", async () => {
      const content = "This is a skill without any frontmatter.";
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, []);
    });
    test("skill with empty name should error", async () => {
      const content = [
        "---",
        'name: ""',
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
    });
    test("skill without description attribute should warn", async () => {
      const content = [
        "---",
        "name: my-skill",
        "---",
        "This is a skill without a description."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a description.");
    });
    test("skill without description but with user-invocable false should error on that attribute", async () => {
      const content = [
        "---",
        "name: my-skill",
        "user-invocable: false",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 2);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a description.");
      assert.strictEqual(markers[1].severity, MarkerSeverity.Error);
      assert.ok(markers[1].message.includes("description is required when user-invocable is false"));
    });
    test("skill without description but with disable-model-invocation false should error on that attribute", async () => {
      const content = [
        "---",
        "name: my-skill",
        "disable-model-invocation: false",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 2);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a description.");
      assert.strictEqual(markers[1].severity, MarkerSeverity.Error);
      assert.ok(markers[1].message.includes("description is required when model invocation is enabled"));
    });
    test("skill with empty description should error", async () => {
      const content = [
        "---",
        "name: my-skill",
        'description: ""',
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'description' attribute should not be empty.`);
    });
    test("skill name with invalid characters should error", async () => {
      const content = [
        "---",
        "name: My Skill",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.ok(markers.some((m) => m.severity === MarkerSeverity.Error && m.message === "Skill name may only contain lowercase letters, numbers, and hyphens."));
    });
    test("skill name with whitespace trimmed matches folder name", async () => {
      const content = [
        "---",
        'name: "  my-skill  "',
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "Expected no validation issues when trimmed name matches folder");
    });
    test("skill name validation with different folder depths", async () => {
      {
        const content = [
          "---",
          "name: advanced-skill",
          "description: Test Skill",
          "---",
          "This is a skill."
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///home/user/.github/skills/advanced-skill/SKILL.md"));
        assert.deepStrictEqual(markers, [], "Expected no issues for deeper path when name matches");
      }
      {
        const content = [
          "---",
          "name: wrong-name",
          "description: Test Skill",
          "---",
          "This is a skill."
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///home/user/.github/skills/correct-folder/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].message, `The skill name 'wrong-name' should match the folder name 'correct-folder'.`);
      }
    });
    test("skill name validation with special characters in folder", async () => {
      const content = [
        "---",
        "name: my_special-skill.v2",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my_special-skill.v2/SKILL.md"));
      assert.ok(markers.some((m) => m.severity === MarkerSeverity.Error && m.message === "Skill name may only contain lowercase letters, numbers, and hyphens."), "Expected error for invalid characters in skill name");
    });
    test("skill with non-string name type does not validate folder match", async () => {
      const content = [
        "---",
        "name: []",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.ok(markers.some((m) => m.message.includes("must be a string")), "Expected error for non-string name");
      assert.ok(!markers.some((m) => m.message.includes("should match the folder name")), "Should not warn about folder mismatch for non-string name");
    });
    test("skill folder name validation only for skill type", async () => {
      const content = [
        "---",
        "name: different-name",
        "description: Test Agent",
        "---",
        "This is an agent."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, URI.parse("file:///.github/agents/my-agent/AGENT.md"));
      assert.ok(!markers.some((m) => m.message.includes("should match the folder name")), "Should not validate folder names for agents");
    });
    test("skill with unknown attributes shows unnecessary hints", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        "unknownAttr: value",
        "anotherUnknown: 123",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 2);
      assert.ok(markers.every((m) => m.severity === MarkerSeverity.Hint));
      assert.ok(markers.every((m) => JSON.stringify(m.tags) === JSON.stringify([MarkerTag.Unnecessary])));
      assert.ok(markers.some((m) => m.message.includes("unknownAttr")));
      assert.ok(markers.some((m) => m.message.includes("anotherUnknown")));
      assert.ok(markers.every((m) => m.message.includes("Supported: ")));
    });
    test("skill with user-invocable: false is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Background knowledge skill",
        "user-invocable: false",
        "---",
        "This skill provides background context."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "user-invocable: false should be valid for skills");
    });
    test("skill with user-invocable: true is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: User-accessible skill",
        "user-invocable: true",
        "---",
        "This skill can be invoked by users."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "user-invocable: true should be valid for skills");
    });
    test("skill with invalid user-invocable value shows error", async () => {
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          'user-invocable: "false"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          "user-invocable: 0",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
    });
    test("skill with disable-model-invocation: true is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Manual-only skill",
        "disable-model-invocation: true",
        "---",
        "This skill must be triggered manually with /name."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "disable-model-invocation: true should be valid for skills");
    });
    test("skill with disable-model-invocation: false is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Auto-loadable skill",
        "disable-model-invocation: false",
        "---",
        "This skill can be loaded automatically by the agent."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "disable-model-invocation: false should be valid for skills");
    });
    test("skill with invalid disable-model-invocation value shows error", async () => {
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          'disable-model-invocation: "true"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          "disable-model-invocation: 1",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
    });
    test("skill with argument-hint is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Skill with argument hint",
        'argument-hint: "[issue-number]"',
        "---",
        "This skill expects an issue number."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "argument-hint should be valid for skills");
    });
    test("skill with empty argument-hint shows warning", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        'argument-hint: ""',
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `The 'argument-hint' attribute should not be empty.`);
    });
    test("skill with non-string argument-hint shows error", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        "argument-hint: []",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'argument-hint' attribute must be a string.`);
    });
    test("skill with all visibility attributes combined is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Complex visibility skill",
        "user-invocable: false",
        "disable-model-invocation: true",
        'argument-hint: "[optional-arg]"',
        "---",
        "This skill has complex visibility settings."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "All visibility attributes combined should be valid");
    });
  });
  suite("claude rules", () => {
    const claudeRulesUri = URI.parse("myFs://test/.claude/rules/my-rule.md");
    test("valid claude rules with paths attribute", async () => {
      const content = [
        "---",
        'description: "TypeScript rules"',
        `paths: ['**/*.ts', '**/*.tsx']`,
        "---",
        "Always use strict mode."
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.deepStrictEqual(markers, []);
    });
    test("valid claude rules without paths attribute", async () => {
      const content = [
        "---",
        'description: "General rules"',
        "---",
        "Follow coding guidelines."
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.deepStrictEqual(markers, []);
    });
    test("claude rules paths must be an array", async () => {
      const content = [
        "---",
        'description: "Rules"',
        'paths: "**/*.ts"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'paths' attribute must be an array of glob patterns.`);
    });
    test("claude rules with unknown attribute shows unnecessary hint", async () => {
      const content = [
        "---",
        'description: "Rules"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.includes(`Attribute 'applyTo' is not supported in rules files by VS Code agents.`));
    });
    test("claude rules with multiple validation errors", async () => {
      const content = [
        "---",
        'description: ""',
        `paths: ['', 123]`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
          { severity: MarkerSeverity.Error, message: `Path entries must be non-empty glob patterns.` }
        ]
      );
    });
    test("claude rules in subdirectory", async () => {
      const subDirUri = URI.parse("myFs://test/.claude/rules/sub/deep-rule.md");
      const content = [
        "---",
        'description: "Nested rules"',
        `paths: ['src/**/*.ts']`,
        "---",
        "Nested rule content."
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, subDirUri);
      assert.deepStrictEqual(markers, []);
    });
  });
  suite("claude agents", () => {
    const claudeAgentUri = URI.parse("myFs://test/.claude/agents/test.agent.md");
    test("valid Claude agent with all common attributes", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
        "model: opus",
        "permissionMode: delegate",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("valid Claude agent with minimal attributes", async () => {
      const content = [
        "---",
        "name: helper",
        "description: A simple helper agent",
        "---",
        "You help with tasks."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("Claude agent with valid model values", async () => {
      for (const modelName of ["sonnet", "opus", "haiku", "inherit"]) {
        const content = [
          "---",
          "name: test-agent",
          "description: Test",
          `model: ${modelName}`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent, claudeAgentUri);
        assert.deepStrictEqual(markers, [], `Model '${modelName}' should be valid`);
      }
    });
    test("Claude agent with unknown model value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: gpt-4",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown value 'gpt-4', valid: sonnet, opus, haiku, inherit.`);
    });
    test("Claude agent with non-string model value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: []",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' attribute must be a string.`);
    });
    test("Claude agent with valid permissionMode values", async () => {
      for (const mode of ["default", "acceptEdits", "plan", "delegate", "dontAsk", "bypassPermissions"]) {
        const content = [
          "---",
          "name: test-agent",
          "description: Test",
          `permissionMode: ${mode}`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent, claudeAgentUri);
        assert.deepStrictEqual(markers, [], `permissionMode '${mode}' should be valid`);
      }
    });
    test("Claude agent with unknown permissionMode value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: sonnet",
        "permissionMode: allowAll",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown value 'allowAll', valid: default, acceptEdits, plan, delegate, dontAsk, bypassPermissions.`);
    });
    test("Claude agent with valid memory values", async () => {
      for (const mem of ["user", "project", "local"]) {
        const content = [
          "---",
          "name: test-agent",
          "description: Test",
          `memory: ${mem}`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent, claudeAgentUri);
        assert.deepStrictEqual(markers, [], `memory '${mem}' should be valid`);
      }
    });
    test("Claude agent with unknown memory value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: sonnet",
        "permissionMode: default",
        "memory: global",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown value 'global', valid: user, project, local.`);
    });
    test("Claude agent with empty name shows error", async () => {
      const content = [
        "---",
        'name: ""',
        "description: Test",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
    });
    test("Claude agent with empty description shows error", async () => {
      const content = [
        "---",
        "name: test-agent",
        'description: ""',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'description' attribute should not be empty.`);
    });
    test("Claude agent with unknown attributes does not warn", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "customAttribute: someValue",
        "anotherCustom: 123",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, [], "Unknown attributes should be silently ignored for Claude agents");
    });
    test("Claude agent tools are not validated against VS Code tool registry", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        `tools: ['Edit', 'Grep', 'UnknownClaudeTool', 'WebFetch']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, [], "Claude tools should not be validated against VS Code registry");
    });
    test("Claude agent with comma-separated tools string", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code",
        "tools: Edit, Grep, AskUserQuestion, WebFetch",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, [], "Comma-separated tools string should be valid for Claude");
    });
    test("Claude agent does not validate handoffs or agents attributes", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: opus",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("Claude agent full realistic example", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
        "model: opus",
        "permissionMode: delegate",
        "memory: project",
        "---",
        "You are a senior security engineer.",
        "Review the code for common vulnerabilities."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("Claude agent with multiple validation errors", async () => {
      const content = [
        "---",
        'name: ""',
        'description: ""',
        "model: unknown-model",
        "permissionMode: invalid-mode",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'name' attribute must not be empty.` },
          { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
          { severity: MarkerSeverity.Warning, message: `Unknown value 'unknown-model', valid: sonnet, opus, haiku, inherit.` },
          { severity: MarkerSeverity.Warning, message: `Unknown value 'invalid-mode', valid: default, acceptEdits, plan, delegate, dontAsk, bypassPermissions.` }
        ]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRWYWxpZGF0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcblxuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIE1hcmtlclNldmVyaXR5LCBNYXJrZXJUYWcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlLCBDdXN0b21DaGF0TW9kZSwgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdFZhbGlkYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0VmFsaWRhdG9yLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUFnZW50LCBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9ja0NoYXRNb2RlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvbW9ja1Byb21wdHNTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1Byb21wdFZhbGlkYXRvcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFTZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCB0ZXN0Q29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdGNvbnN0IGV4aXN0aW5nUmVmMSA9IFVSSS5wYXJzZSgnbXlGczovL3Rlc3QvcmVmZXJlbmNlMS5tZCcpO1xuXHRjb25zdCBleGlzdGluZ1JlZjIgPSBVUkkucGFyc2UoJ215RnM6Ly90ZXN0L3JlZmVyZW5jZTIubWQnKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cblx0XHR0ZXN0Q29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FeHRlbnNpb25Ub29sc0VuYWJsZWQsIHRydWUpO1xuXHRcdGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBkaXNwb3NhYmxlcy5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwgeyBnZXRVcmlMYWJlbDogKHJlc291cmNlKSA9PiByZXNvdXJjZS5wYXRoIH0pO1xuXG5cdFx0Y29uc3QgdG9vbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRlc3RUb29sMSA9IHsgaWQ6ICd0ZXN0VG9vbDEnLCBkaXNwbGF5TmFtZTogJ3Rvb2wxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wxKSk7XG5cdFx0Y29uc3QgdGVzdFRvb2wyID0geyBpZDogJ3Rlc3RUb29sMicsIGRpc3BsYXlOYW1lOiAndG9vbDInLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgdG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sMicsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMicsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wyKSk7XG5cdFx0Y29uc3Qgc2hlbGxUb29sID0geyBpZDogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdzaGVsbCcsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3NoZWxsJywgbW9kZWxEZXNjcmlwdGlvbjogJ1J1bnMgY29tbWFuZHMgaW4gdGhlIHRlcm1pbmFsJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShzaGVsbFRvb2wpKTtcblxuXHRcdGNvbnN0IG15RXh0U291cmNlID0geyB0eXBlOiAnZXh0ZW5zaW9uJywgbGFiZWw6ICdNeSBFeHRlbnNpb24nLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ015LmV4dGVuc2lvbicpIH0gc2F0aXNmaWVzIFRvb2xEYXRhU291cmNlO1xuXHRcdGNvbnN0IHRlc3RUb29sMyA9IHsgaWQ6ICd0ZXN0VG9vbDMnLCBkaXNwbGF5TmFtZTogJ3Rvb2wzJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIHRvb2xSZWZlcmVuY2VOYW1lOiAndG9vbDMnLCBtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDMnLCBzb3VyY2U6IG15RXh0U291cmNlLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRlc3RUb29sMykpO1xuXG5cdFx0Y29uc3QgcHJFeHRTb3VyY2UgPSB7IHR5cGU6ICdleHRlbnNpb24nLCBsYWJlbDogJ0dpdEh1YiBQdWxsIFJlcXVlc3QgRXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWInKSB9IHNhdGlzZmllcyBUb29sRGF0YVNvdXJjZTtcblx0XHRjb25zdCBwckV4dFRvb2wxID0geyBpZDogJ3N1Z2dlc3RGaXgnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgdG9vbFJlZmVyZW5jZU5hbWU6ICdzdWdnZXN0LWZpeCcsIG1vZGVsRGVzY3JpcHRpb246ICd0b29sNCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDQnLCBzb3VyY2U6IHByRXh0U291cmNlLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHByRXh0VG9vbDEpKTtcblxuXHRcdGNvbnN0IHRvb2xXaXRoTGVnYWN5ID0geyBpZDogJ25ld1Rvb2wnLCB0b29sUmVmZXJlbmNlTmFtZTogJ25ld1Rvb2xSZWYnLCBkaXNwbGF5TmFtZTogJ05ldyBUb29sJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdOZXcgVG9vbCcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSwgbGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydvbGRUb29sTmFtZScsICdkZXByZWNhdGVkVG9vbE5hbWUnXSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbFdpdGhMZWdhY3kpKTtcblxuXHRcdGNvbnN0IHRvb2xTZXRXaXRoTGVnYWN5ID0gZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHRcdCduZXdUb29sU2V0Jyxcblx0XHRcdCduZXdUb29sU2V0UmVmJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdOZXcgVG9vbCBTZXQnLCBsZWdhY3lGdWxsTmFtZXM6IFsnb2xkVG9vbFNldCcsICdkZXByZWNhdGVkVG9vbFNldCddIH1cblx0XHQpKTtcblx0XHRjb25zdCB0b29sSW5TZXQgPSB7IGlkOiAndG9vbEluU2V0JywgdG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sSW5TZXRSZWYnLCBkaXNwbGF5TmFtZTogJ1Rvb2wgSW4gU2V0JywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLCBtb2RlbERlc2NyaXB0aW9uOiAnVG9vbCBJbiBTZXQnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xJblNldCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2V0V2l0aExlZ2FjeS5hZGRUb29sKHRvb2xJblNldCkpO1xuXG5cdFx0Y29uc3QgYW5vdGhlclRvb2xXaXRoTGVnYWN5ID0geyBpZDogJ2Fub3RoZXJUb29sJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdhbm90aGVyVG9vbFJlZicsIGRpc3BsYXlOYW1lOiAnQW5vdGhlciBUb29sJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdBbm90aGVyIFRvb2wnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30sIGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnbGVnYWN5VG9vbCddIH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShhbm90aGVyVG9vbFdpdGhMZWdhY3kpKTtcblxuXHRcdGNvbnN0IGFub3RoZXJUb29sU2V0V2l0aExlZ2FjeSA9IGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0VG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsXG5cdFx0XHQnYW5vdGhlclRvb2xTZXQnLFxuXHRcdFx0J2Fub3RoZXJUb29sU2V0UmVmJyxcblx0XHRcdHsgZGVzY3JpcHRpb246ICdBbm90aGVyIFRvb2wgU2V0JywgbGVnYWN5RnVsbE5hbWVzOiBbJ2xlZ2FjeVRvb2xTZXQnXSB9XG5cdFx0KSk7XG5cdFx0Y29uc3QgYW5vdGhlclRvb2xJblNldCA9IHsgaWQ6ICdhbm90aGVyVG9vbEluU2V0JywgdG9vbFJlZmVyZW5jZU5hbWU6ICdhbm90aGVyVG9vbEluU2V0UmVmJywgZGlzcGxheU5hbWU6ICdBbm90aGVyIFRvb2wgSW4gU2V0JywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLCBtb2RlbERlc2NyaXB0aW9uOiAnQW5vdGhlciBUb29sIEluIFNldCcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoYW5vdGhlclRvb2xJblNldCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhbm90aGVyVG9vbFNldFdpdGhMZWdhY3kuYWRkVG9vbChhbm90aGVyVG9vbEluU2V0KSk7XG5cblx0XHRjb25zdCBjb25mbGljdFRvb2xTZXQxID0gZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHRcdCdjb25mbGljdFNldDEnLFxuXHRcdFx0J2NvbmZsaWN0U2V0MVJlZicsXG5cdFx0XHR7IGxlZ2FjeUZ1bGxOYW1lczogWydzaGFyZWRMZWdhY3lOYW1lJ10gfVxuXHRcdCkpO1xuXHRcdGNvbnN0IGNvbmZsaWN0VG9vbDEgPSB7IGlkOiAnY29uZmxpY3RUb29sMScsIHRvb2xSZWZlcmVuY2VOYW1lOiAnY29uZmxpY3RUb29sMVJlZicsIGRpc3BsYXlOYW1lOiAnQ29uZmxpY3QgVG9vbCAxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLCBtb2RlbERlc2NyaXB0aW9uOiAnQ29uZmxpY3QgVG9vbCAxJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjb25mbGljdFRvb2wxKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbmZsaWN0VG9vbFNldDEuYWRkVG9vbChjb25mbGljdFRvb2wxKSk7XG5cblx0XHRjb25zdCBjb25mbGljdFRvb2xTZXQyID0gZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHRcdCdjb25mbGljdFNldDInLFxuXHRcdFx0J2NvbmZsaWN0U2V0MlJlZicsXG5cdFx0XHR7IGxlZ2FjeUZ1bGxOYW1lczogWydzaGFyZWRMZWdhY3lOYW1lJ10gfVxuXHRcdCkpO1xuXHRcdGNvbnN0IGNvbmZsaWN0VG9vbDIgPSB7IGlkOiAnY29uZmxpY3RUb29sMicsIHRvb2xSZWZlcmVuY2VOYW1lOiAnY29uZmxpY3RUb29sMlJlZicsIGRpc3BsYXlOYW1lOiAnQ29uZmxpY3QgVG9vbCAyJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLCBtb2RlbERlc2NyaXB0aW9uOiAnQ29uZmxpY3QgVG9vbCAyJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShjb25mbGljdFRvb2wyKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbmZsaWN0VG9vbFNldDIuYWRkVG9vbChjb25mbGljdFRvb2wyKSk7XG5cblx0XHQvLyBUb29sIGluIHRoZSB2c2NvZGUgdG9vbHNldCB3aXRoIGEgbGVnYWN5IG5hbWUgXHUyMDE0IGZvciB0ZXN0aW5nIG5hbWVzcGFjZWQgZGVwcmVjYXRlZCBuYW1lIHJlc29sdXRpb25cblx0XHRjb25zdCB0b29sSW5Wc2NvZGVTZXQgPSB7IGlkOiAnYnJvd3NlclRvb2wnLCB0b29sUmVmZXJlbmNlTmFtZTogJ29wZW5JbnRlZ3JhdGVkQnJvd3NlcicsIGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnb3BlblNpbXBsZUJyb3dzZXInXSwgZGlzcGxheU5hbWU6ICdPcGVuIEludGVncmF0ZWQgQnJvd3NlcicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCBtb2RlbERlc2NyaXB0aW9uOiAnT3BlbiBicm93c2VyJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sSW5Wc2NvZGVTZXQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UudnNjb2RlVG9vbFNldC5hZGRUb29sKHRvb2xJblZzY29kZVNldCkpO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnNldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdG9vbFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGVzdE1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFbXSA9IFtcblx0XHRcdHsgaWQ6ICdtYWUtNCcsIG5hbWU6ICdNQUUgNCcsIHZlbmRvcjogJ29sYW1hJywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ21hZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdtYWUtNC4xJywgbmFtZTogJ01BRSA0LjEnLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ21hZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdtYWUtMy41LXR1cmJvJywgbmFtZTogJ01BRSAzLjUgVHVyYm8nLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ21hZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YVxuXHRcdF07XG5cblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7XG5cdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzKCkgeyByZXR1cm4gdGVzdE1vZGVscy5tYXAobSA9PiBtLmlkKTsgfSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbWV0YWRhdGEgb2YgdGVzdE1vZGVscykge1xuXHRcdFx0XHRcdGlmIChJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZShxdWFsaWZpZWROYW1lLCBtZXRhZGF0YSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IG1ldGFkYXRhLCBpZGVudGlmaWVyOiBtZXRhZGF0YS5pZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY3VzdG9tQ2hhdE1vZGUgPSBuZXcgQ3VzdG9tQ2hhdE1vZGUoe1xuXHRcdFx0aWQ6ICdiZWFzdC1tb2RlJyxcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdteUZzOi8vdGVzdC90ZXN0L2NoYXRtb2RlLm1kJyksXG5cdFx0XHRuYW1lOiAnQmVhc3RNb2RlJyxcblx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICdCZWFzdCBtb2RlIGluc3RydWN0aW9ucycsIHRvb2xSZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRlbmFibGVkOiB0cnVlXG5cdFx0fSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoeyBidWlsdGluOiBbQ2hhdE1vZGUuQWdlbnQsIENoYXRNb2RlLkFzaywgQ2hhdE1vZGUuRWRpdF0sIGN1c3RvbTogW2N1c3RvbUNoYXRNb2RlXSB9KSk7XG5cblxuXHRcdGNvbnN0IGV4aXN0aW5nRmlsZXMgPSBuZXcgUmVzb3VyY2VTZXQoW2V4aXN0aW5nUmVmMSwgZXhpc3RpbmdSZWYyXSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRleGlzdHModXJpOiBVUkkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShleGlzdGluZ0ZpbGVzLmhhcyh1cmkpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG5ldyBNb2NrUHJvbXB0c1NlcnZpY2UoKTtcblx0XHRjb25zdCBjdXN0b21Nb2RlOiBJQ3VzdG9tQWdlbnQgPSB7XG5cdFx0XHRpZDogJ2N1c3RvbS1tb2RlJyxcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvY3VzdG9tLW1vZGUubWQnKSxcblx0XHRcdG5hbWU6ICdQbGFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQSB0ZXN0IGN1c3RvbSBtb2RlJyxcblx0XHRcdHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ10sXG5cdFx0XHRhZ2VudEluc3RydWN0aW9uczogeyBjb250ZW50OiAnQ3VzdG9tIG1vZGUgYm9keScsIHRvb2xSZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRlbmFibGVkOiB0cnVlXG5cdFx0fTtcblx0XHRwcm9tcHRzU2VydmljZS5zZXRDdXN0b21Nb2RlcyhbY3VzdG9tTW9kZV0pO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0c1NlcnZpY2UpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB2YWxpZGF0ZShjb2RlOiBzdHJpbmcsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB1cmk/OiBVUkkpOiBQcm9taXNlPElNYXJrZXJEYXRhW10+IHtcblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0dXJpID0gVVJJLnBhcnNlKCdteUZzOi8vdGVzdC90ZXN0RmlsZScgKyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKHByb21wdFR5cGUpKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvZGUpO1xuXHRcdGNvbnN0IHZhbGlkYXRvciA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRWYWxpZGF0b3IpO1xuXHRcdGNvbnN0IG1hcmtlcnM6IElNYXJrZXJEYXRhW10gPSBbXTtcblx0XHRhd2FpdCB2YWxpZGF0b3IudmFsaWRhdGUocmVzdWx0LCBwcm9tcHRUeXBlLCBtID0+IG1hcmtlcnMucHVzaChtKSk7XG5cdFx0cmV0dXJuIG1hcmtlcnM7XG5cdH1cblx0c3VpdGUoJ2FnZW50cycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvcnJlY3QgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkFnZW50IG1vZGUgdGVzdFwiYCxcblx0XHRcdC8qIDAzICovJ21vZGVsOiBNQUUgNC4xJyxcblx0XHRcdC8qIDA0ICovYHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ11gLFxuXHRcdFx0LyogMDUgKi8nLS0tJyxcblx0XHRcdC8qIDA2ICovJ1RoaXMgaXMgYSBjaGF0IGFnZW50IHRlc3QuJyxcblx0XHRcdC8qIDA3ICovJ0hlcmUgaXMgYSAjdG9vbDEgdmFyaWFibGUgYW5kIGEgI2ZpbGU6Li9yZWZlcmVuY2UxLm1kIGFzIHdlbGwgYXMgYSBbcmVmZXJlbmNlXSguL3JlZmVyZW5jZTIubWQpLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnQgd2l0aCBlcnJvcnMgKGVtcHR5IGRlc2NyaXB0aW9uLCB1bmtub3duIHRvb2wgJiBtb2RlbCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIlwiYCwgLy8gZW1wdHkgZGVzY3JpcHRpb24gLT4gZXJyb3Jcblx0XHRcdC8qIDAzICovJ21vZGVsOiBNQUUgNC4yJywgLy8gdW5rbm93biBtb2RlbCAtPiB3YXJuaW5nXG5cdFx0XHQvKiAwNCAqL2B0b29sczogWyd0b29sMScsICd0b29sMicsICd0b29sNCcsICdteS5leHRlbnNpb24vdG9vbDMnXWAsIC8vIHRvb2w0IHVua25vd24gLT4gZXJyb3Jcblx0XHRcdC8qIDA1ICovJy0tLScsXG5cdFx0XHQvKiAwNiAqLydCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlLCB0YWdzOiBtLnRhZ3MgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ2Rlc2NyaXB0aW9uJyBhdHRyaWJ1dGUgc2hvdWxkIG5vdCBiZSBlbXB0eS5gLCB0YWdzOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LCBtZXNzYWdlOiBgVW5rbm93biB0b29sICd0b29sNCcgd2lsbCBiZSBpZ25vcmVkLmAsIHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldIH0sXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCwgbWVzc2FnZTogYFVua25vd24gbW9kZWwgJ01BRSA0LjInIHdpbGwgYmUgaWdub3JlZC5gLCB0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbHMgbXVzdCBiZSBhcnJheSBvciBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogJ3Rvb2wxJ2AsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgYXMgc3RyaW5nIGFycmF5IC0gdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgd2l0aCBtb2RlbCBhcnJheVwiJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCAnTUFFIDQuMSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgYXMgc3RyaW5nIGFycmF5IC0gdW5rbm93biBtb2RlbCBpcyBpZ25vcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHdpdGggbW9kZWwgYXJyYXlcIicsXG5cdFx0XHRcdGBtb2RlbDogWydNQUUgNCAob2xhbWEpJywgJ1Vua25vd24gTW9kZWwnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIG1vZGVsICdVbmtub3duIE1vZGVsJyB3aWxsIGJlIGlnbm9yZWQuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBhcyBzdHJpbmcgYXJyYXkgLSB1bnN1aXRhYmxlIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHdpdGggbW9kZWwgYXJyYXlcIicsXG5cdFx0XHRcdGBtb2RlbDogWydNQUUgNCAob2xhbWEpJywgJ01BRSAzLjUgVHVyYm8nXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYE1vZGVsICdNQUUgMy41IFR1cmJvJyBpcyBub3Qgc3VpdGVkIGZvciBhZ2VudCBtb2RlLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgYXMgc3RyaW5nIGFycmF5IC0gZW1wdHkgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgd2l0aCBlbXB0eSBtb2RlbCBhcnJheVwiJyxcblx0XHRcdFx0YG1vZGVsOiBbXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ21vZGVsJyBhcnJheSBtdXN0IG5vdCBiZSBlbXB0eS5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIGFzIHN0cmluZyBhcnJheSAtIG5vbi1zdHJpbmcgaXRlbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCB3aXRoIGludmFsaWQgbW9kZWwgYXJyYXlcIicsXG5cdFx0XHRcdGBtb2RlbDogWydNQUUgNCAob2xhbWEpJywgW11dYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbW9kZWwnIGFycmF5IG11c3QgY29udGFpbiBvbmx5IHN0cmluZ3MuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBhcyBzdHJpbmcgYXJyYXkgLSBlbXB0eSBzdHJpbmcgaXRlbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCB3aXRoIGVtcHR5IHN0cmluZyBpbiBtb2RlbCBhcnJheVwiJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCAnJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgTW9kZWwgbmFtZXMgaW4gdGhlIGFycmF5IG11c3QgYmUgbm9uLWVtcHR5IHN0cmluZ3MuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBhcyBpbnZhbGlkIHR5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgd2l0aCBpbnZhbGlkIG1vZGVsIHR5cGVcIicsXG5cdFx0XHRcdGBtb2RlbDoge31gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdtb2RlbCcgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcgb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VhY2ggdG9vbCBtdXN0IGJlIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywge31dYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYEVhY2ggdG9vbCBuYW1lIGluIHRoZSAndG9vbHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29sZCB0b29sIHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wzJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ3Rvb2wzJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ215LmV4dGVuc2lvbi90b29sMycgaW5zdGVhZC5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWdhY3kgdG9vbCByZWZlcmVuY2UgbmFtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUZXN0IHVzaW5nIGxlZ2FjeSB0b29sIHJlZmVyZW5jZSBuYW1lXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ29sZFRvb2xOYW1lJ11gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSW5mbywgbWVzc2FnZTogYFRvb2wgb3IgdG9vbHNldCAnb2xkVG9vbE5hbWUnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnbmV3VG9vbFJlZicgaW5zdGVhZC5gIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUZXN0IHVzaW5nIGFub3RoZXIgbGVnYWN5IHRvb2wgcmVmZXJlbmNlIG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAnZGVwcmVjYXRlZFRvb2xOYW1lJ11gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSW5mbywgbWVzc2FnZTogYFRvb2wgb3IgdG9vbHNldCAnZGVwcmVjYXRlZFRvb2xOYW1lJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ25ld1Rvb2xSZWYnIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlZ2FjeSB0b29sc2V0IG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCB1c2luZyBsZWdhY3kgdG9vbHNldCBuYW1lXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ29sZFRvb2xTZXQnXWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdvbGRUb29sU2V0JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ25ld1Rvb2xTZXRSZWYnIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGVzdCB1c2luZyBhbm90aGVyIGxlZ2FjeSB0b29sc2V0IG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAnZGVwcmVjYXRlZFRvb2xTZXQnXWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdkZXByZWNhdGVkVG9vbFNldCcgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICduZXdUb29sU2V0UmVmJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBsZWdhY3kgbmFtZXMgaW4gc2FtZSB0b29scyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCBtdWx0aXBsZSBsZWdhY3kgbmFtZXMgdG9nZXRoZXJcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ2xlZ2FjeVRvb2wnLCAnbGVnYWN5VG9vbFNldCcsICd0b29sMyddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdsZWdhY3lUb29sJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ2Fub3RoZXJUb29sUmVmJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdsZWdhY3lUb29sU2V0JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ2Fub3RoZXJUb29sU2V0UmVmJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICd0b29sMycgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICdteS5leHRlbnNpb24vdG9vbDMnIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVwcmVjYXRlZCB0b29sIG5hbWUgbWFwcGluZyB0byBtdWx0aXBsZSBuZXcgbmFtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgdG9vbHNldHMgYXJlIHJlZ2lzdGVyZWQgaW4gc2V0dXAgd2l0aCBhIHNoYXJlZCBsZWdhY3kgbmFtZSAnc2hhcmVkTGVnYWN5TmFtZSdcblx0XHRcdC8vIFRoaXMgc2ltdWxhdGVzIHRoZSBjYXNlIHdoZXJlIG9uZSBkZXByZWNhdGVkIG5hbWUgbWFwcyB0byBtdWx0aXBsZSBjdXJyZW50IG5hbWVzXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogWydzaGFyZWRMZWdhY3lOYW1lJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5JbmZvKTtcblx0XHRcdC8vIFdoZW4gbXVsdGlwbGUgdG9vbHNldHMgc2hhcmUgdGhlIHNhbWUgbGVnYWN5IG5hbWUsIHRoZSBtZXNzYWdlIHNob3VsZCBpbmRpY2F0ZSBtdWx0aXBsZSBvcHRpb25zXG5cdFx0XHQvLyBUaGUgbWVzc2FnZSB3aWxsIHNheSBcInVzZSB0aGUgZm9sbG93aW5nIHRvb2xzIGluc3RlYWQ6XCIgZm9yIG11bHRpcGxlIG1hcHBpbmdzXG5cdFx0XHRjb25zdCBleHBlY3RlZE1lc3NhZ2UgPSBgVG9vbCBvciB0b29sc2V0ICdzaGFyZWRMZWdhY3lOYW1lJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgdGhlIGZvbGxvd2luZyB0b29scyBpbnN0ZWFkOiBjb25mbGljdFNldDFSZWYsIGNvbmZsaWN0U2V0MlJlZmA7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBleHBlY3RlZE1lc3NhZ2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVwcmVjYXRlZCB0b29sIG5hbWUgaW4gYm9keSB2YXJpYWJsZSByZWZlcmVuY2UgLSBzaW5nbGUgbWFwcGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRlc3QgZGVwcmVjYXRlZCB0b29sIG5hbWUgdXNlZCBhcyB2YXJpYWJsZSByZWZlcmVuY2UgaW4gYm9keVxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkgd2l0aCAjdG9vbDpvbGRUb29sTmFtZSByZWZlcmVuY2UnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkluZm8pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRvb2wgb3IgdG9vbHNldCAnb2xkVG9vbE5hbWUnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnbmV3VG9vbFJlZicgaW5zdGVhZC5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlcHJlY2F0ZWQgdG9vbCBuYW1lIGluIGJvZHkgdmFyaWFibGUgcmVmZXJlbmNlIC0gbXVsdGlwbGUgbWFwcGluZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdpc3RlciB0b29scyB3aXRoIHRoZSBzYW1lIGxlZ2FjeSBuYW1lIHRvIGNyZWF0ZSBtdWx0aXBsZSBtYXBwaW5nc1xuXHRcdFx0Y29uc3QgbXVsdGlNYXBUb29sU2V0MSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0XHRUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHRcdFx0J211bHRpTWFwU2V0MScsXG5cdFx0XHRcdCdtdWx0aU1hcFNldDFSZWYnLFxuXHRcdFx0XHR7IGxlZ2FjeUZ1bGxOYW1lczogWydtdWx0aU1hcExlZ2FjeSddIH1cblx0XHRcdCkpO1xuXHRcdFx0Y29uc3QgbXVsdGlNYXBUb29sMSA9IHsgaWQ6ICdtdWx0aU1hcFRvb2wxJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdtdWx0aU1hcFRvb2wxUmVmJywgZGlzcGxheU5hbWU6ICdNdWx0aSBNYXAgVG9vbCAxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdNdWx0aSBNYXAgVG9vbCAxJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKS5yZWdpc3RlclRvb2xEYXRhKG11bHRpTWFwVG9vbDEpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtdWx0aU1hcFRvb2xTZXQxLmFkZFRvb2wobXVsdGlNYXBUb29sMSkpO1xuXG5cdFx0XHRjb25zdCBtdWx0aU1hcFRvb2xTZXQyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdFRvb2xEYXRhU291cmNlLkV4dGVybmFsLFxuXHRcdFx0XHQnbXVsdGlNYXBTZXQyJyxcblx0XHRcdFx0J211bHRpTWFwU2V0MlJlZicsXG5cdFx0XHRcdHsgbGVnYWN5RnVsbE5hbWVzOiBbJ211bHRpTWFwTGVnYWN5J10gfVxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCBtdWx0aU1hcFRvb2wyID0geyBpZDogJ211bHRpTWFwVG9vbDInLCB0b29sUmVmZXJlbmNlTmFtZTogJ211bHRpTWFwVG9vbDJSZWYnLCBkaXNwbGF5TmFtZTogJ011bHRpIE1hcCBUb29sIDInLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ011bHRpIE1hcCBUb29sIDInLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpLnJlZ2lzdGVyVG9vbERhdGEobXVsdGlNYXBUb29sMikpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG11bHRpTWFwVG9vbFNldDIuYWRkVG9vbChtdWx0aU1hcFRvb2wyKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5IHdpdGggI3Rvb2w6bXVsdGlNYXBMZWdhY3kgcmVmZXJlbmNlJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5JbmZvKTtcblx0XHRcdC8vIFdoZW4gbXVsdGlwbGUgdG9vbHNldHMgc2hhcmUgdGhlIHNhbWUgbGVnYWN5IG5hbWUsIHRoZSBtZXNzYWdlIHNob3VsZCBpbmRpY2F0ZSBtdWx0aXBsZSBvcHRpb25zXG5cdFx0XHQvLyBUaGUgbWVzc2FnZSB3aWxsIHNheSBcInVzZSB0aGUgZm9sbG93aW5nIHRvb2xzIGluc3RlYWQ6XCIgZm9yIG11bHRpcGxlIG1hcHBpbmdzIGluIGJvZHkgcmVmZXJlbmNlc1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXNzYWdlID0gYFRvb2wgb3IgdG9vbHNldCAnbXVsdGlNYXBMZWdhY3knIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSB0aGUgZm9sbG93aW5nIHRvb2xzIGluc3RlYWQ6IG11bHRpTWFwU2V0MVJlZiwgbXVsdGlNYXBTZXQyUmVmYDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGV4cGVjdGVkTWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lc3BhY2VkIGRlcHJlY2F0ZWQgdG9vbCBuYW1lIGluIHRvb2xzIGhlYWRlciBzaG93cyByZW5hbWUgaGludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFdoZW4gYSB0b29sIGlzIGluIGEgdG9vbHNldCAoZS5nLiB2c2NvZGUvb3BlbkludGVncmF0ZWRCcm93c2VyKSBhbmQgaGFzIGEgbGVnYWN5IG5hbWUsXG5cdFx0XHQvLyB1c2luZyB0aGUgbmFtZXNwYWNlZCBvbGQgbmFtZSAodnNjb2RlL29wZW5TaW1wbGVCcm93c2VyKSBzaG91bGQgc2hvdyB0aGUgcmVuYW1lIGhpbnRcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3ZzY29kZS9vcGVuU2ltcGxlQnJvd3NlciddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICd2c2NvZGUvb3BlblNpbXBsZUJyb3dzZXInIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAndnNjb2RlL29wZW5JbnRlZ3JhdGVkQnJvd3NlcicgaW5zdGVhZC5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXJlIGRlcHJlY2F0ZWQgdG9vbCBuYW1lIGluIHRvb2xzIGhlYWRlciBhbHNvIHNob3dzIHJlbmFtZSBoaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGJhcmUgKG5vbi1uYW1lc3BhY2VkKSBsZWdhY3kgbmFtZSBzaG91bGQgYWxzbyByZXNvbHZlXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogWydvcGVuU2ltcGxlQnJvd3NlciddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdvcGVuU2ltcGxlQnJvd3NlcicgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICd2c2NvZGUvb3BlbkludGVncmF0ZWRCcm93c2VyJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Vua25vd24gYXR0cmlidXRlIGluIGFnZW50IGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBhcHBseVRvOiAnKi50cydgLCAvLyBub3QgYWxsb3dlZCBpbiBhZ2VudCBmaWxlXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UsIHRhZ3M6IG0udGFncyB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LCBtZXNzYWdlOiBgQXR0cmlidXRlICdhcHBseVRvJyBpcyBub3Qgc3VwcG9ydGVkIGluIFZTIENvZGUgYWdlbnQgZmlsZXMuIFN1cHBvcnRlZDogYWdlbnRzLCBhcmd1bWVudC1oaW50LCBkZXNjcmlwdGlvbiwgZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uLCBnaXRodWIsIGhhbmRvZmZzLCBob29rcywgbW9kZWwsIG5hbWUsIHRhcmdldCwgdG9vbHMsIHVzZXItaW52b2NhYmxlLmAsIHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29scyB3aXRoIGludmFsaWQgaGFuZG9mZnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdFx0YGhhbmRvZmZzOiBuZXh0YCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgVGhlICdoYW5kb2ZmcycgYXR0cmlidXRlIG11c3QgYmUgYW4gYXJyYXkuYF0pO1xuXHRcdFx0fVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRcdGBoYW5kb2ZmczpgLFxuXHRcdFx0XHRcdGAgIC0gbGFiZWw6ICcxMjMnYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0aWVzICdhZ2VudCcsICdwcm9tcHQnIGluIGhhbmRvZmYgb2JqZWN0LmBdKTtcblx0XHRcdH1cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgaGFuZG9mZnM6YCxcblx0XHRcdFx0XHRgICAtIGxhYmVsOiAnMTIzJ2AsXG5cdFx0XHRcdFx0YCAgICBhZ2VudDogJydgLFxuXHRcdFx0XHRcdGAgICAgcHJvbXB0OiAnJ2AsXG5cdFx0XHRcdFx0YCAgICBzZW5kOiB0cnVlYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgVGhlICdhZ2VudCcgcHJvcGVydHkgaW4gYSBoYW5kb2ZmIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLmBdKTtcblx0XHRcdH1cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgaGFuZG9mZnM6YCxcblx0XHRcdFx0XHRgICAtIGxhYmVsOiAnMTIzJ2AsXG5cdFx0XHRcdFx0YCAgICBhZ2VudDogJ0Nvb2wnYCxcblx0XHRcdFx0XHRgICAgIHByb21wdDogJydgLFxuXHRcdFx0XHRcdGAgICAgc2VuZDogdHJ1ZWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpLCBbYFVua25vd24gYWdlbnQgJ0Nvb2wnLiBBdmFpbGFibGUgYWdlbnRzOiBhZ2VudCwgYXNrLCBlZGl0LCBCZWFzdE1vZGUuYF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnQgd2l0aCBoYW5kb2ZmcyBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcXFwiVGVzdCBhZ2VudCB3aXRoIGhhbmRvZmZzXFxcIicsXG5cdFx0XHRcdGBoYW5kb2ZmczpgLFxuXHRcdFx0XHQnICAtIGxhYmVsOiBUZXN0IFByb21wdCcsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IGFnZW50Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IEFkZCB0ZXN0cyBmb3IgdGhpcyBjb2RlJyxcblx0XHRcdFx0JyAgLSBsYWJlbDogT3B0aW1pemUgUGVyZm9ybWFuY2UnLFxuXHRcdFx0XHQnICAgIGFnZW50OiBhZ2VudCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBPcHRpbWl6ZSBmb3IgcGVyZm9ybWFuY2UnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gdmFsaWRhdGlvbiBpc3N1ZXMgZm9yIGhhbmRvZmZzIGF0dHJpYnV0ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlIGhhbmRvZmYgbGFiZWxzIGFyZSByZXBvcnRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGhhbmRvZmZzOmAsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFN0YXJ0IEltcGxlbWVudGF0aW9uJyxcblx0XHRcdFx0JyAgICBhZ2VudDogYWdlbnQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogR28gaW1wbGVtZW50Jyxcblx0XHRcdFx0JyAgLSBsYWJlbDogU3RhcnQgSW1wbGVtZW50YXRpb24nLFxuXHRcdFx0XHQnICAgIGFnZW50OiBhZ2VudCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBHbyBpbXBsZW1lbnQgYWdhaW4nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtcblx0XHRcdFx0J0R1cGxpY2F0ZSBoYW5kb2ZmIGxhYmVsIFxcJ1N0YXJ0IEltcGxlbWVudGF0aW9uXFwnLiBFYWNoIGhhbmRvZmYgbXVzdCBoYXZlIGEgdW5pcXVlIGxhYmVsLicsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2R1cGxpY2F0ZSBoYW5kb2ZmIGxhYmVscyBhcmUgY2FzZS1pbnNlbnNpdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGhhbmRvZmZzOmAsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFN0YXJ0IEltcGxlbWVudGF0aW9uJyxcblx0XHRcdFx0JyAgICBhZ2VudDogYWdlbnQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogR28gaW1wbGVtZW50Jyxcblx0XHRcdFx0JyAgLSBsYWJlbDogc3RhcnQgaW1wbGVtZW50YXRpb24nLFxuXHRcdFx0XHQnICAgIGFnZW50OiBlZGl0Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IERpZmZlcmVudCBwcm9tcHQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtcblx0XHRcdFx0J0R1cGxpY2F0ZSBoYW5kb2ZmIGxhYmVsIFxcJ3N0YXJ0IGltcGxlbWVudGF0aW9uXFwnLiBFYWNoIGhhbmRvZmYgbXVzdCBoYXZlIGEgdW5pcXVlIGxhYmVsLicsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRvZmYgbGFiZWwgbXVzdCBjb250YWluIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBoYW5kb2ZmczpgLFxuXHRcdFx0XHQnICAtIGxhYmVsOiBcIiEhIVwiJyxcblx0XHRcdFx0JyAgICBhZ2VudDogYWdlbnQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogR28nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtcblx0XHRcdFx0J1RoZSBcXCdsYWJlbFxcJyBwcm9wZXJ0eSBpbiBhIGhhbmRvZmYgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyLicsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IGFnZW50IHdpdGggc3VwcG9ydGVkIGF0dHJpYnV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiR2l0SHViX0NvcGlsb3RfQ3VzdG9tX0FnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiR2l0SHViIENvcGlsb3QgYWdlbnRcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NoZWxsJywgJ2VkaXQnLCAnc2VhcmNoJywgJ2N1c3RvbS1hZ2VudCddYCxcblx0XHRcdFx0J21jcC1zZXJ2ZXJzOiBbXScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSB3aXRoICNzZWFyY2ggYW5kICNlZGl0IHJlZmVyZW5jZXMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gdmFsaWRhdGlvbiBpc3N1ZXMgZm9yIGdpdGh1Yi1jb3BpbG90IHRhcmdldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgd2FybnMgYWJvdXQgbW9kZWwgYW5kIGhhbmRvZmZzIGF0dHJpYnV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiR2l0SHViQWdlbnRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJHaXRIdWIgQ29waWxvdCBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHQnbW9kZWw6IE1BRSA0LjEnLFxuXHRcdFx0XHRgdG9vbHM6IFsnc2hlbGwnLCAnZWRpdCddYCxcblx0XHRcdFx0YGhhbmRvZmZzOmAsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFRlc3QnLFxuXHRcdFx0XHQnICAgIGFnZW50OiBEZWZhdWx0Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IFRlc3QnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBtZXNzYWdlcyA9IG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdFx0J0F0dHJpYnV0ZSBcXCdtb2RlbFxcJyBpcyBub3Qgc3VwcG9ydGVkIGluIGN1c3RvbSBHaXRIdWIgQ29waWxvdCBhZ2VudCBmaWxlcy4gU3VwcG9ydGVkOiBkZXNjcmlwdGlvbiwgZ2l0aHViLCBpbmZlciwgbWNwLXNlcnZlcnMsIG5hbWUsIHRhcmdldCwgdG9vbHMuJyxcblx0XHRcdFx0J0F0dHJpYnV0ZSBcXCdoYW5kb2Zmc1xcJyBpcyBub3Qgc3VwcG9ydGVkIGluIGN1c3RvbSBHaXRIdWIgQ29waWxvdCBhZ2VudCBmaWxlcy4gU3VwcG9ydGVkOiBkZXNjcmlwdGlvbiwgZ2l0aHViLCBpbmZlciwgbWNwLXNlcnZlcnMsIG5hbWUsIHRhcmdldCwgdG9vbHMuJyxcblx0XHRcdF0sICdNb2RlbCBhbmQgaGFuZG9mZnMgYXJlIG5vdCB2YWxpZGF0ZWQgZm9yIGdpdGh1Yi1jb3BpbG90IHRhcmdldCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgZG9lcyBub3QgdmFsaWRhdGUgdmFyaWFibGUgcmVmZXJlbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJHaXRIdWJBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkdpdEh1YiBDb3BpbG90IGFnZW50XCInLFxuXHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdGB0b29sczogWydzaGVsbCcsICdlZGl0J11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkgd2l0aCAjdW5rbm93blRvb2wgcmVmZXJlbmNlJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Ly8gVmFyaWFibGUgcmVmZXJlbmNlcyBzaG91bGQgbm90IGJlIHZhbGlkYXRlZCBmb3IgZ2l0aHViLWNvcGlsb3QgdGFyZ2V0XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnVmFyaWFibGUgcmVmZXJlbmNlcyBhcmUgbm90IHZhbGlkYXRlZCBmb3IgZ2l0aHViLWNvcGlsb3QgdGFyZ2V0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXRodWItY29waWxvdCBhZ2VudCByZWplY3RzIHVuc3VwcG9ydGVkIGF0dHJpYnV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiR2l0SHViQWdlbnRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJHaXRIdWIgQ29waWxvdCBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHQnYXJndW1lbnQtaGludDogXCJ0ZXN0IGhpbnRcIicsXG5cdFx0XHRcdGB0b29sczogWydzaGVsbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKGBBdHRyaWJ1dGUgJ2FyZ3VtZW50LWhpbnQnIGlzIG5vdCBzdXBwb3J0ZWRgKSwgJ0V4cGVjdGVkIGhpbnQgYWJvdXQgdW5zdXBwb3J0ZWQgYXR0cmlidXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXRodWItY29waWxvdCBhZ2VudCB3aXRoIHZhbGlkIHBlcm1pc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIklzc3VlVHJpYWdlXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVHJpYWdlcyBpc3N1ZXNcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3JlYWQnXWAsXG5cdFx0XHRcdCdnaXRodWI6Jyxcblx0XHRcdFx0JyAgcGVybWlzc2lvbnM6Jyxcblx0XHRcdFx0JyAgICBpc3N1ZXM6IHdyaXRlJyxcblx0XHRcdFx0JyAgICBjb250ZW50czogcmVhZCcsXG5cdFx0XHRcdCcgICAgbWV0YWRhdGE6IHJlYWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IGFnZW50IHdpdGggaW52YWxpZCBwZXJtaXNzaW9uIHNjb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3JlYWQnXWAsXG5cdFx0XHRcdCdnaXRodWI6Jyxcblx0XHRcdFx0JyAgcGVybWlzc2lvbnM6Jyxcblx0XHRcdFx0JyAgICB1bmtub3duLXNjb3BlOiByZWFkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ1Vua25vd24gcGVybWlzc2lvbiBzY29wZSBcXCd1bmtub3duLXNjb3BlXFwnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgd2l0aCBpbnZhbGlkIHBlcm1pc3Npb24gdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsncmVhZCddYCxcblx0XHRcdFx0J2dpdGh1YjonLFxuXHRcdFx0XHQnICBwZXJtaXNzaW9uczonLFxuXHRcdFx0XHQnICAgIG1ldGFkYXRhOiB3cml0ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnSW52YWxpZCBwZXJtaXNzaW9uIHZhbHVlIFxcJ3dyaXRlXFwnIGZvciBzY29wZSBcXCdtZXRhZGF0YVxcJycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IGFnZW50IHdpdGggbm9uLW1hcCBnaXRodWIgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3JlYWQnXWAsXG5cdFx0XHRcdCdnaXRodWI6IGludmFsaWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsICdUaGUgXFwnZ2l0aHViXFwnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIG9iamVjdC4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IGFnZW50IHdpdGggdW5rbm93biBnaXRodWIgc3ViLXByb3BlcnR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3JlYWQnXWAsXG5cdFx0XHRcdCdnaXRodWI6Jyxcblx0XHRcdFx0JyAgdW5rbm93bjogdmFsdWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnVW5rbm93biBwcm9wZXJ0eSBcXCd1bmtub3duXFwnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIHRhcmdldCBhZ2VudCB3aXRoIHZhbGlkIGdpdGh1YiBwZXJtaXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQWdlbnQgd2l0aG91dCB0YXJnZXRcIicsXG5cdFx0XHRcdCdnaXRodWI6Jyxcblx0XHRcdFx0JyAgcGVybWlzc2lvbnM6Jyxcblx0XHRcdFx0JyAgICBpc3N1ZXM6IHdyaXRlJyxcblx0XHRcdFx0JyAgICBjb250ZW50czogcmVhZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIHRhcmdldCBhZ2VudCB3aXRoIGludmFsaWQgZ2l0aHViIHBlcm1pc3Npb24gc2NvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFnZW50IHdpdGhvdXQgdGFyZ2V0XCInLFxuXHRcdFx0XHQnZ2l0aHViOicsXG5cdFx0XHRcdCcgIHBlcm1pc3Npb25zOicsXG5cdFx0XHRcdCcgICAgdW5rbm93bi1zY29wZTogcmVhZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdVbmtub3duIHBlcm1pc3Npb24gc2NvcGUgXFwndW5rbm93bi1zY29wZVxcJycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuZGVmaW5lZCB0YXJnZXQgYWdlbnQgd2l0aCBpbnZhbGlkIGdpdGh1YiBwZXJtaXNzaW9uIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRob3V0IHRhcmdldFwiJyxcblx0XHRcdFx0J2dpdGh1YjonLFxuXHRcdFx0XHQnICBwZXJtaXNzaW9uczonLFxuXHRcdFx0XHQnICAgIG1ldGFkYXRhOiB3cml0ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnSW52YWxpZCBwZXJtaXNzaW9uIHZhbHVlIFxcJ3dyaXRlXFwnIGZvciBzY29wZSBcXCdtZXRhZGF0YVxcJycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuZGVmaW5lZCB0YXJnZXQgYWdlbnQgd2l0aCBub24tbWFwIGdpdGh1YiBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFnZW50IHdpdGhvdXQgdGFyZ2V0XCInLFxuXHRcdFx0XHQnZ2l0aHViOiBpbnZhbGlkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCAnVGhlIFxcJ2dpdGh1YlxcJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBvYmplY3QuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2c2NvZGUgdGFyZ2V0IGFnZW50IHZhbGlkYXRlcyBub3JtYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVlMgQ29kZSBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0J21vZGVsOiBNQUUgNC4xJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkgd2l0aCAjdG9vbDEnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnVlMgQ29kZSB0YXJnZXQgc2hvdWxkIHZhbGlkYXRlIG5vcm1hbGx5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2c2NvZGUgdGFyZ2V0IGFnZW50IG1hcmtzIHVua25vd24gdG9vbHMgYXMgdW5uZWNlc3NhcnkgaGludHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlZTIENvZGUgYWdlbnRcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMScsICd1bmtub3duVG9vbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biB0b29sICd1bmtub3duVG9vbCcgd2lsbCBiZSBpZ25vcmVkLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndnNjb2RlIHRhcmdldCBhZ2VudCB3aXRoIG1jcC1zZXJ2ZXJzIGFuZCBnaXRodWItdG9vbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlZTIENvZGUgYWdlbnRcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMScsICdlZGl0J11gLFxuXHRcdFx0XHRgbWNwLXNlcnZlcnM6IHt9YCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXG5cdFx0XHRcdCdBdHRyaWJ1dGUgXFwnbWNwLXNlcnZlcnNcXCcgaXMgaWdub3JlZCB3aGVuIHJ1bm5pbmcgbG9jYWxseSBpbiBWUyBDb2RlLicsXG5cdFx0XHRcdCdVbmtub3duIHRvb2wgXFwnZWRpdFxcJyB3aWxsIGJlIGlnbm9yZWQuJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIHRhcmdldCB3aXRoIG1jcC1zZXJ2ZXJzIGFuZCBnaXRodWItdG9vbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlZTIENvZGUgYWdlbnRcIicsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMScsICdzaGVsbCddYCxcblx0XHRcdFx0YG1jcC1zZXJ2ZXJzOiB7fWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzID0gbWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW1xuXHRcdFx0XHQnQXR0cmlidXRlIFxcJ21jcC1zZXJ2ZXJzXFwnIGlzIGlnbm9yZWQgd2hlbiBydW5uaW5nIGxvY2FsbHkgaW4gVlMgQ29kZS4nLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IHRhcmdldCAobm8gdGFyZ2V0IHNwZWNpZmllZCkgdmFsaWRhdGVzIGFzIHZzY29kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQWdlbnQgd2l0aG91dCB0YXJnZXRcIicsXG5cdFx0XHRcdCdtb2RlbDogTUFFIDQuMScsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMSddYCxcblx0XHRcdFx0J2FyZ3VtZW50LWhpbnQ6IFwidGVzdCBoaW50XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHQvLyBTaG91bGQgdmFsaWRhdGUgbm9ybWFsbHkgYXMgaWYgdGFyZ2V0IHdhcyB2c2NvZGVcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdBZ2VudCB3aXRob3V0IHRhcmdldCBzaG91bGQgdmFsaWRhdGUgYXMgdnNjb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lIGF0dHJpYnV0ZSB2YWxpZGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIk15QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCBuYW1lIHNob3VsZCBub3QgcHJvZHVjZSBlcnJvcnMnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1wdHkgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOb24tc3RyaW5nIG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogW10nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVmFsaWQgbmFtZSB3aXRoIGFsbG93ZWQgY2hhcmFjdGVyc1xuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIk15X0FnZW50LTIuMCB3aXRoIHNwYWNlc1wiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ05hbWUgd2l0aCBhbGxvd2VkIGNoYXJhY3RlcnMgc2hvdWxkIGJlIHZhbGlkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXRodWItY29waWxvdCB0YXJnZXQgcmVxdWlyZXMgbmFtZSBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBNaXNzaW5nIG5hbWUgd2l0aCBnaXRodWItY29waWxvdCB0YXJnZXRcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiR2l0SHViIENvcGlsb3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRcdGB0b29sczogWydzaGVsbCddYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFZhbGlkIG5hbWUgd2l0aCBnaXRodWItY29waWxvdCB0YXJnZXRcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJHaXRIdWJBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiR2l0SHViIENvcGlsb3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRcdGB0b29sczogWydzaGVsbCddYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCBnaXRodWItY29waWxvdCBhZ2VudCB3aXRoIG5hbWUgc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNaXNzaW5nIG5hbWUgd2l0aCB2c2NvZGUgdGFyZ2V0IChzaG91bGQgYmUgb3B0aW9uYWwpXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlZTIENvZGUgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnXWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnTmFtZSBzaG91bGQgYmUgb3B0aW9uYWwgZm9yIHZzY29kZSB0YXJnZXQnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luZmVyIGF0dHJpYnV0ZSB2YWxpZGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVwcmVjYXRpb25NZXNzYWdlID0gYFRoZSAnaW5mZXInIGF0dHJpYnV0ZSBpcyBkZXByZWNhdGVkIGluIGZhdm91ciBvZiAndXNlci1pbnZvY2FibGUnIGFuZCAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJy5gO1xuXG5cdFx0XHQvLyBWYWxpZCBpbmZlcjogdHJ1ZSAobWFwcyB0byAnYWxsJykgLSBzaG93cyBkZXByZWNhdGlvbiB3YXJuaW5nXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCdpbmZlcjogdHJ1ZScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEsICdpbmZlcjogdHJ1ZSBzaG91bGQgcHJvZHVjZSBkZXByZWNhdGlvbiB3YXJuaW5nJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGRlcHJlY2F0aW9uTWVzc2FnZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFZhbGlkIGluZmVyOiBmYWxzZSAobWFwcyB0byAndXNlcicpIC0gc2hvd3MgZGVwcmVjYXRpb24gd2FybmluZ1xuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQnaW5mZXI6IGZhbHNlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ2luZmVyOiBmYWxzZSBzaG91bGQgcHJvZHVjZSBkZXByZWNhdGlvbiB3YXJuaW5nJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGRlcHJlY2F0aW9uTWVzc2FnZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEludmFsaWQgaW5mZXI6IHVua25vd24gc3RyaW5nIHZhbHVlIC0gc2hvd3MgZGVwcmVjYXRpb24gd2FybmluZyAodmFsaWRhdGlvbiByZW1vdmVkIGZvciBkZXByZWNhdGVkIGF0dHJpYnV0ZSlcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J2luZmVyOiBcInllc1wiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ2luZmVyOiBcInllc1wiIHNob3VsZCBwcm9kdWNlIGRlcHJlY2F0aW9uIHdhcm5pbmcnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWlzc2luZyBpbmZlciBhdHRyaWJ1dGUgKHNob3VsZCBiZSBvcHRpb25hbClcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnTWlzc2luZyBpbmZlciBhdHRyaWJ1dGUgc2hvdWxkIGJlIGFsbG93ZWQnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnYWdlbnRzIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgYWdlbnRzOiAnbXlBZ2VudCdgLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgVGhlICdhZ2VudHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIGFycmF5LmBdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VhY2ggYWdlbnQgbmFtZSBpbiBhZ2VudHMgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBhZ2VudHM6IFsnYWdlbnQnLCB7fV1gLFxuXHRcdFx0XHRgdG9vbHM6IFsnYWdlbnQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BFYWNoIGFnZW50IG5hbWUgaW4gdGhlICdhZ2VudHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLmBdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Vua25vd24gYWdlbnQgaW4gYWdlbnRzIGF0dHJpYnV0ZSBzaG93cyB1bm5lY2Vzc2FyeSBoaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgYWdlbnRzOiBbJ1Vua25vd25BZ2VudCddYCxcblx0XHRcdFx0YHRvb2xzOiBbJ2FnZW50J11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biBhZ2VudCAnVW5rbm93bkFnZW50JyB3aWxsIGJlIGlnbm9yZWQuIEF2YWlsYWJsZSBhZ2VudHM6IFBsYW4sIGFnZW50LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnRzIGF0dHJpYnV0ZSB3aXRoIG5vbi1lbXB0eSB2YWx1ZSByZXF1aXJlcyBhZ2VudCB0b29sIDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBhZ2VudHM6IFsnYWdlbnQnLCAnUGxhbiddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpLCBbXSwgYE5vIHdhcm5pbmdzIGFib3V0IGFnZW50cyBhdHRyaWJ1dGUgd2hlbiBubyB0b29scyBhcmUgc3BlY2lmaWVkYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudHMgYXR0cmlidXRlIHdpdGggbm9uLWVtcHR5IHZhbHVlIHJlcXVpcmVzIGFnZW50IHRvb2wgMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFnZW50czogWydhZ2VudCcsICdQbGFuJ11gLFxuXHRcdFx0XHRgdG9vbHM6IFsnc2hlbGwnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BXaGVuICdhZ2VudHMnIGFuZCAndG9vbHMnIGFyZSBzcGVjaWZpZWQsIHRoZSAnYWdlbnQnIHRvb2wgbXVzdCBiZSBpbmNsdWRlZCBpbiB0aGUgJ3Rvb2xzJyBhdHRyaWJ1dGUuYF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnRzIGF0dHJpYnV0ZSB3aXRoIG5vbi1lbXB0eSB2YWx1ZSByZXF1aXJlcyBhZ2VudCB0b29sIDMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBhZ2VudHM6IFsnYWdlbnQnLCAnUGxhbiddYCxcblx0XHRcdFx0YHRvb2xzOiBbJ2FnZW50J11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtdLCBgTm8gd2FybmluZ3MgYWJvdXQgYWdlbnRzIGF0dHJpYnV0ZSB3aGVuIGFnZW50IHRvb2wgaXMgaW4gaGVhZGVyYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudHMgYXR0cmlidXRlIHdpdGggbm9uLWVtcHR5IHZhbHVlIHJlcXVpcmVzIGFnZW50IHRvb2wgNCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFnZW50czogWycqJ11gLFxuXHRcdFx0XHRgdG9vbHM6IFsnc2hlbGwnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BXaGVuICdhZ2VudHMnIGFuZCAndG9vbHMnIGFyZSBzcGVjaWZpZWQsIHRoZSAnYWdlbnQnIHRvb2wgbXVzdCBiZSBpbmNsdWRlZCBpbiB0aGUgJ3Rvb2xzJyBhdHRyaWJ1dGUuYF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnRzIGF0dHJpYnV0ZSB3aXRoIGVtcHR5IGFycmF5IGRvZXMgbm90IHJlcXVpcmUgYWdlbnQgdG9vbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFnZW50czogW11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ0VtcHR5IGFycmF5IHNob3VsZCBub3QgcmVxdWlyZSBhZ2VudCB0b29sJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VyLWludm9jYWJsZSBhdHRyaWJ1dGUgdmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIHVzZXItaW52b2NhYmxlOiB0cnVlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnVmFsaWQgdXNlci1pbnZvY2FibGU6IHRydWUgc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWYWxpZCB1c2VyLWludm9jYWJsZTogZmFsc2Vcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnVmFsaWQgdXNlci1pbnZvY2FibGU6IGZhbHNlIHNob3VsZCBub3QgcHJvZHVjZSBlcnJvcnMnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW52YWxpZCB1c2VyLWludm9jYWJsZTogc3RyaW5nIHZhbHVlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogXCJ5ZXNcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICd1c2VyLWludm9jYWJsZScgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuYCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEludmFsaWQgdXNlci1pbnZvY2FibGU6IG51bWJlciB2YWx1ZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IDEnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAndXNlci1pbnZvY2FibGUnIGF0dHJpYnV0ZSBtdXN0IGJlICd0cnVlJyBvciAnZmFsc2UnLmApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlZCB1c2VyLWludm9rYWJsZSBhdHRyaWJ1dGUgaXMgcmVwb3J0ZWQgYXMgdW5rbm93bicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHQndXNlci1pbnZva2FibGU6IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEsICd1c2VyLWludm9rYWJsZSBzaG91bGQgcHJvZHVjZSBleGFjdGx5IG9uZSBkaWFnbm9zdGljJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuSGludCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnNbMF0udGFncywgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcygndXNlci1pbnZva2FibGUnKSwgJ2hpbnQgc2hvdWxkIG1lbnRpb24gdGhlIGF0dHJpYnV0ZSBuYW1lJyk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdub3Qgc3VwcG9ydGVkJyksICdoaW50IHNob3VsZCBzYXkgYXR0cmlidXRlIGlzIG5vdCBzdXBwb3J0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbiBhdHRyaWJ1dGUgdmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB0cnVlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUgc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWYWxpZCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IGZhbHNlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IGZhbHNlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IGZhbHNlIHNob3VsZCBub3QgcHJvZHVjZSBlcnJvcnMnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW52YWxpZCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHN0cmluZyB2YWx1ZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBcInllc1wiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuYCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEludmFsaWQgZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBudW1iZXIgdmFsdWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogMCcsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb24nIGF0dHJpYnV0ZSBtdXN0IGJlICd0cnVlJyBvciAnZmFsc2UnLmApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSB2YWxpZCBob29rIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnICBQcmVUb29sVXNlOicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IC4vdmFsaWRhdGUuc2gnLFxuXHRcdFx0XHQnICAgICAgY3dkOiBzY3JpcHRzJyxcblx0XHRcdFx0JyAgICAgIHRpbWVvdXQ6IDMwJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSBtdXN0IGJlIGEgbWFwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6IGludmFsaWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICdob29rcycgYXR0cmlidXRlIG11c3QgYmUgYSBtYXAgb2YgaG9vayBldmVudCB0eXBlcyB0byBjb21tYW5kIGFycmF5cy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIHVua25vd24gaG9vayBldmVudCB0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgVW5rbm93bkV2ZW50OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2U6IGBVbmtub3duIGhvb2sgZXZlbnQgdHlwZSAnVW5rbm93bkV2ZW50Jy4gU3VwcG9ydGVkOiBTZXNzaW9uU3RhcnQsIFNlc3Npb25FbmQsIFVzZXJQcm9tcHRTdWJtaXQsIFByZVRvb2xVc2UsIFBvc3RUb29sVXNlLCBQcmVDb21wYWN0LCBTdWJhZ2VudFN0YXJ0LCBTdWJhZ2VudFN0b3AsIFN0b3AsIEVycm9yT2NjdXJyZWQuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSBob29rIHZhbHVlIG11c3QgYmUgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6IGludmFsaWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgSG9vayBldmVudCAnU2Vzc2lvblN0YXJ0JyBtdXN0IGhhdmUgYW4gYXJyYXkgb2YgY29tbWFuZCBvYmplY3RzIGFzIGl0cyB2YWx1ZS5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIGNvbW1hbmQgaXRlbSBtdXN0IGJlIG9iamVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0ganVzdCBhIHN0cmluZycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBFYWNoIGhvb2sgY29tbWFuZCBtdXN0IGJlIGFuIG9iamVjdC5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIG1pc3NpbmcgdHlwZSBwcm9wZXJ0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBIb29rIGNvbW1hbmQgaXMgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eSAndHlwZScuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSB0eXBlIG11c3QgYmUgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogc2NyaXB0Jyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICd0eXBlJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlICdjb21tYW5kJy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIG1pc3NpbmcgY29tbWFuZCBmaWVsZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBIb29rIGNvbW1hbmQgbXVzdCBzcGVjaWZ5IGF0IGxlYXN0IG9uZSBvZiAnY29tbWFuZCcsICd3aW5kb3dzJywgJ2xpbnV4Jywgb3IgJ29zeCcuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSBlbXB0eSBjb21tYW5kIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBcIlwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnY29tbWFuZCcgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSBwbGF0Zm9ybS1zcGVjaWZpYyBjb21tYW5kcyBhcmUgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgd2luZG93czogZWNobyBoZWxsbycsXG5cdFx0XHRcdCcgICAgICBsaW51eDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCcgICAgICBvc3g6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIGVudiBtdXN0IGJlIGEgbWFwIHdpdGggc3RyaW5nIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgICAgIGVudjogaW52YWxpZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ2VudicgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSBhIG1hcCBvZiBzdHJpbmcgdmFsdWVzLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gdmFsaWQgZW52IG1hcCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgICAgIGVudjonLFxuXHRcdFx0XHQnICAgICAgICBOT0RFX0VOVjogcHJvZHVjdGlvbicsXG5cdFx0XHRcdCcgICAgICAgIERFQlVHOiBcInRydWVcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gdW5rbm93biBwcm9wZXJ0eSB3YXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgICAgIHVua25vd25Qcm9wOiB2YWx1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZTogYFVua25vd24gcHJvcGVydHkgJ3Vua25vd25Qcm9wJyBpbiBob29rIGNvbW1hbmQuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSB0aW1lb3V0IG11c3QgYmUgbnVtYmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnICAgICAgdGltZW91dDogbm90LWEtbnVtYmVyJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAndGltZW91dCcgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSBhIG51bWJlci5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIGN3ZCBtdXN0IGJlIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgICAgIGN3ZDonLFxuXHRcdFx0XHQnICAgICAgICAtIGFycmF5Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnY3dkJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlIGEgc3RyaW5nLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gbXVsdGlwbGUgZXJyb3JzIGluIG9uZSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBzY3JpcHQnLFxuXHRcdFx0XHQnICAgICAgdW5rbm93blByb3A6IHZhbHVlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAndHlwZScgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSAnY29tbWFuZCcuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2U6IGBVbmtub3duIHByb3BlcnR5ICd1bmtub3duUHJvcCcgaW4gaG9vayBjb21tYW5kLmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYEhvb2sgY29tbWFuZCBtdXN0IHNwZWNpZnkgYXQgbGVhc3Qgb25lIG9mICdjb21tYW5kJywgJ3dpbmRvd3MnLCAnbGludXgnLCBvciAnb3N4Jy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIG5lc3RlZCBtYXRjaGVyIGZvcm1hdCBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFVzZXJQcm9tcHRTdWJtaXQ6Jyxcblx0XHRcdFx0JyAgICAtIGhvb2tzOicsXG5cdFx0XHRcdCcgICAgICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICAgICAgY29tbWFuZDogXCJlY2hvIGZvb1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSBuZXN0ZWQgbWF0Y2hlciB2YWxpZGF0ZXMgaW5uZXIgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBQcmVUb29sVXNlOicsXG5cdFx0XHRcdCcgICAgLSBtYXRjaGVyOiBCYXNoJyxcblx0XHRcdFx0JyAgICAgIGhvb2tzOicsXG5cdFx0XHRcdCcgICAgICAgIC0gdHlwZTogc2NyaXB0Jyxcblx0XHRcdFx0JyAgICAgICAgICBjb21tYW5kOiBcImVjaG8gZm9vXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICd0eXBlJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlICdjb21tYW5kJy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIG5lc3RlZCBob29rcyBtdXN0IGJlIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgUHJlVG9vbFVzZTonLFxuXHRcdFx0XHQnICAgIC0gaG9va3M6IGludmFsaWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICdob29rcycgcHJvcGVydHkgaW4gYSBtYXRjaGVyIG11c3QgYmUgYW4gYXJyYXkgb2YgY29tbWFuZCBvYmplY3RzLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2luc3RydWN0aW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2luc3RydWN0aW9ucyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiSW5zdHJcIicsXG5cdFx0XHRcdCdhcHBseVRvOiAqLnRzLCouanMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zdHJ1Y3Rpb25zIGludmFsaWQgYXBwbHlUbyB0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJJbnN0clwiJyxcblx0XHRcdFx0J2FwcGx5VG86IFtdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnYXBwbHlUbycgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnN0cnVjdGlvbnMgaW52YWxpZCBhcHBseVRvIGdsb2IgJiB1bmtub3duIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiSW5zdHJcIicsXG5cdFx0XHRcdGBhcHBseVRvOiAnJ2AsIC8vIGVtcHR5IC0+IGludmFsaWQgZ2xvYlxuXHRcdFx0XHQnbW9kZWw6IG1hZS00JywgLy8gbW9kZWwgbm90IGFsbG93ZWQgaW4gaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAyKTtcblx0XHRcdC8vIE9yZGVyOiB1bmtub3duIGF0dHJpYnV0ZSBoaW50cyBmaXJzdCAoYXR0cmlidXRlIGl0ZXJhdGlvbikgdGhlbiBhcHBseVRvIHZhbGlkYXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLnN0YXJ0c1dpdGgoYEF0dHJpYnV0ZSAnbW9kZWwnIGlzIG5vdCBzdXBwb3J0ZWQgaW4gaW5zdHJ1Y3Rpb25zIGZpbGVzLmApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzFdLm1lc3NhZ2UsIGBUaGUgJ2FwcGx5VG8nIGF0dHJpYnV0ZSBtdXN0IGJlIGEgdmFsaWQgZ2xvYiBwYXR0ZXJuLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52YWxpZCBoZWFkZXIgc3RydWN0dXJlIChZQU1MIGFycmF5KScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnLSBpdGVtMScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgJ0ludmFsaWQgaGVhZGVyLCBleHBlY3RpbmcgPGtleTogdmFsdWU+IHBhaXJzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lIGF0dHJpYnV0ZSB2YWxpZGF0aW9uIGluIGluc3RydWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJNeUluc3RydWN0aW9uc1wiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBpbnN0cnVjdGlvbnNcIicsXG5cdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c1wiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnVmFsaWQgbmFtZSBzaG91bGQgbm90IHByb2R1Y2UgZXJyb3JzJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVtcHR5IG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgaW5zdHJ1Y3Rpb25zXCInLFxuXHRcdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LmApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJvbXB0cycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Byb21wdCB2YWxpZCB3aXRoIGFnZW50IG1vZGUgKGRlZmF1bHQpIGFuZCB0b29scyBhbmQgYSBCWU8gbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBtb2RlIG9taXR0ZWQgLT4gZGVmYXVsdHMgdG8gQWdlbnQ7IHRvb2xzK21vZGVsIHNob3VsZCB2YWxpZGF0ZTsgbW9kZWwgTUFFIDQgaXMgYWdlbnQgY2FwYWJsZVxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJQcm9tcHQgd2l0aCB0b29sc1wiJyxcblx0XHRcdFx0J21vZGVsOiBNQUUgNC4xJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywndG9vbDInXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvbXB0IG1vZGVsIG5vdCBzdWl0ZWQgZm9yIGFnZW50IG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBNQUUgMy41IFR1cmJvIGxhY2tzIGFnZW50TW9kZSBjYXBhYmlsaXR5IC0+IHdhcm5pbmcgd2hlbiB1c2VkIGluIGFnZW50IChkZWZhdWx0KVxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJQcm9tcHQgd2l0aCB1bnN1aXRhYmxlIG1vZGVsXCInLFxuXHRcdFx0XHQnbW9kZWw6IE1BRSAzLjUgVHVyYm8nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEsICdFeHBlY3RlZCBvbmUgd2FybmluZyBhYm91dCB1bnN1aXRhYmxlIG1vZGVsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgTW9kZWwgJ01BRSAzLjUgVHVyYm8nIGlzIG5vdCBzdWl0ZWQgZm9yIGFnZW50IG1vZGUuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9tcHQgd2l0aCBjdXN0b20gYWdlbnQgQmVhc3RNb2RlIGFuZCB0b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEV4cGxpY2l0IGN1c3RvbSBhZ2VudCBzaG91bGQgYmUgcmVjb2duaXplZDsgQmVhc3RNb2RlIGtpbmQgY29tZXMgZnJvbSBzZXR1cDsgZW5zdXJlIHRvb2xzIGFjY2VwdGVkXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlByb21wdCBjdXN0b20gbW9kZVwiJyxcblx0XHRcdFx0J2FnZW50OiBCZWFzdE1vZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvbXB0IHdpdGggY3VzdG9tIG1vZGUgQmVhc3RNb2RlIGFuZCB0b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEV4cGxpY2l0IGN1c3RvbSBtb2RlIHNob3VsZCBiZSByZWNvZ25pemVkOyBCZWFzdE1vZGUga2luZCBjb21lcyBmcm9tIHNldHVwOyBlbnN1cmUgdG9vbHMgYWNjZXB0ZWRcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiUHJvbXB0IGN1c3RvbSBtb2RlXCInLFxuXHRcdFx0XHQnbW9kZTogQmVhc3RNb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgVGhlICdtb2RlJyBhdHRyaWJ1dGUgaGFzIGJlZW4gZGVwcmVjYXRlZC4gUGxlYXNlIHJlbmFtZSBpdCB0byAnYWdlbnQnLmBdKTtcblxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvbXB0IHdpdGggY3VzdG9tIG1vZGUgYW4gYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBFeHBsaWNpdCBjdXN0b20gbW9kZSBzaG91bGQgYmUgcmVjb2duaXplZDsgQmVhc3RNb2RlIGtpbmQgY29tZXMgZnJvbSBzZXR1cDsgZW5zdXJlIHRvb2xzIGFjY2VwdGVkXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlByb21wdCBjdXN0b20gbW9kZVwiJyxcblx0XHRcdFx0J21vZGU6IEJlYXN0TW9kZScsXG5cdFx0XHRcdGBhZ2VudDogYWdlbnRgLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgVGhlICdtb2RlJyBhdHRyaWJ1dGUgaGFzIGJlZW4gZGVwcmVjYXRlZC4gVGhlICdhZ2VudCcgYXR0cmlidXRlIGlzIHVzZWQgaW5zdGVhZC5gXSk7XG5cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb21wdCB3aXRoIHVua25vd24gYWdlbnQgQXNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJQcm9tcHQgdW5rbm93biBhZ2VudCBBc2tcIicsXG5cdFx0XHRcdCdhZ2VudDogQXNrJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywndG9vbDInXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ0V4cGVjdGVkIG9uZSB3YXJuaW5nIGFib3V0IHRvb2xzIGluIG5vbi1hZ2VudCBtb2RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biBhZ2VudCAnQXNrJy4gQXZhaWxhYmxlIGFnZW50czogYWdlbnQsIGFzaywgZWRpdCwgQmVhc3RNb2RlLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvbXB0IHdpdGggYWdlbnQgZWRpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiUHJvbXB0IGVkaXQgbW9kZSB3aXRoIHRvb2xcIicsXG5cdFx0XHRcdCdhZ2VudDogZWRpdCcsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ3Rvb2xzJyBhdHRyaWJ1dGUgaXMgb25seSBzdXBwb3J0ZWQgd2hlbiB1c2luZyBhZ2VudHMuIEF0dHJpYnV0ZSB3aWxsIGJlIGlnbm9yZWQuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lIGF0dHJpYnV0ZSB2YWxpZGF0aW9uIGluIHByb21wdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCBuYW1lXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiTXlQcm9tcHRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgcHJvbXB0XCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCBuYW1lIHNob3VsZCBub3QgcHJvZHVjZSBlcnJvcnMnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1wdHkgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBwcm9tcHRcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LmApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYm9keScsICgpID0+IHtcblx0XHR0ZXN0KCdib2R5IHdpdGggZXhpc3RpbmcgZmlsZSByZWZlcmVuY2VzIGFuZCBrbm93biB0b29scyBoYXMgbm8gbWFya2VycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiUmVmc1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdIZXJlIGlzIGEgI2ZpbGU6Li9yZWZlcmVuY2UxLm1kIGFuZCBhIG1hcmtkb3duIFtyZWZlcmVuY2VdKC4vcmVmZXJlbmNlMi5tZCkgcGx1cyB2YXJpYWJsZXMgI3Rvb2wxIGFuZCAjdG9vbDInXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gdmFsaWRhdGlvbiBpc3N1ZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JvZHkgd2l0aCBtaXNzaW5nIGZpbGUgcmVmZXJlbmNlcyByZXBvcnRzIHdhcm5pbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJNaXNzaW5nIFJlZnNcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnSGVyZSBpcyBhICNmaWxlOi4vbWlzc2luZzEubWQgYW5kIGEgbWFya2Rvd24gW21pc3NpbmcgbGlua10oLi9taXNzaW5nMi5tZCkuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW1xuXHRcdFx0XHRgRmlsZSAnLi9taXNzaW5nMS5tZCcgbm90IGZvdW5kIGF0ICcvbWlzc2luZzEubWQnLmAsXG5cdFx0XHRcdGBGaWxlICcuL21pc3NpbmcyLm1kJyBub3QgZm91bmQgYXQgJy9taXNzaW5nMi5tZCcuYFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib2R5IHdpdGggaHR0cCBsaW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJIVFRQIExpbmtcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnSGVyZSBpcyBhIFtodHRwIGxpbmtdKGh0dHA6Ly9leGFtcGxlLmNvbSkuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ0V4cGVjdGVkIG5vIHZhbGlkYXRpb24gaXNzdWVzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib2R5IHdpdGggdXJsIGxpbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBub25FeGlzdGluZ1JlZiA9IGV4aXN0aW5nUmVmMS53aXRoKHsgcGF0aDogJy9ub25leGlzdGluZycgfSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlVSTCBMaW5rc1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdGBIZXJlIGlzIGEgW3VybCBsaW5rXSgke2V4aXN0aW5nUmVmMS50b1N0cmluZygpfSkuYCxcblx0XHRcdFx0YEhlcmUgaXMgYSBbdXJsIGxpbmtdKCR7bm9uRXhpc3RpbmdSZWYudG9TdHJpbmcoKX0pLmBcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzID0gbWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpLnNvcnQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdFx0YEZpbGUgJ215RnM6Ly90ZXN0L25vbmV4aXN0aW5nJyBub3QgZm91bmQgYXQgJy9ub25leGlzdGluZycuYCxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYm9keSB3aXRoIHVua25vd24gdG9vbCB2YXJpYWJsZSByZWZlcmVuY2UgaXMgYW4gdW5uZWNlc3NhcnkgaGludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVW5rbm93biB0b29sIHZhclwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGxpbmUgcmVmZXJlbmNlcyBrbm93biAjdG9vbDp0b29sMSBhbmQgdW5rbm93biAjdG9vbDp0b29sWCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ0V4cGVjdGVkIG9uZSBkaWFnbm9zdGljIGZvciB1bmtub3duIHRvb2wgdmFyaWFibGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biB0b29sIG9yIHRvb2xzZXQgJ3Rvb2xYJy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JvZHkgd2l0aCB0b29sIG5vdCBwcmVzZW50IGluIHRvb2xzIGxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Rvb2xzOiBbXScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnSSBuZWVkJyxcblx0XHRcdFx0JyN0b29sOm1zLWF6dXJldG9vbHMudnNjb2RlLWF6dXJlLWdpdGh1Yi1jb3BpbG90L2F6dXJlX3JlY29tbWVuZF9jdXN0b21fbW9kZXMnLFxuXHRcdFx0XHQnI3Rvb2w6Z2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL3N1Z2dlc3QtZml4Jyxcblx0XHRcdFx0JyN0b29sOm9wZW5TaW1wbGVCcm93c2VyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IG1hcmtlcnMuc29ydCgoYSwgYikgPT4gYS5zdGFydExpbmVOdW1iZXIgLSBiLnN0YXJ0TGluZU51bWJlcikubWFwKG0gPT4gKHsgbWVzc2FnZTogbS5tZXNzYWdlLCBzdGFydENvbHVtbjogbS5zdGFydENvbHVtbiwgZW5kQ29sdW1uOiBtLmVuZENvbHVtbiB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHR7IG1lc3NhZ2U6IGBVbmtub3duIGV4dGVuc2lvbiB0b29sICdtcy1henVyZXRvb2xzLnZzY29kZS1henVyZS1naXRodWItY29waWxvdC9henVyZV9yZWNvbW1lbmRfY3VzdG9tX21vZGVzJy4gSXQgaXMgbGlrZWx5IHRvIGJlIGEgbWlzc2luZyBleHRlbnNpb24sIHBsZWFzZSBlbnN1cmUgaXQgaXMgaW5zdGFsbGVkIGFuZCBlbmFibGVkLmAsIHN0YXJ0Q29sdW1uOiA3LCBlbmRDb2x1bW46IDc3IH0sXG5cdFx0XHRcdHsgbWVzc2FnZTogYFRvb2wgb3IgdG9vbHNldCAnZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL3N1Z2dlc3QtZml4JyBhbHNvIG5lZWRzIHRvIGJlIGVuYWJsZWQgaW4gdGhlIGhlYWRlci5gLCBzdGFydENvbHVtbjogNywgZW5kQ29sdW1uOiA1MiB9LFxuXHRcdFx0XHR7IG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ29wZW5TaW1wbGVCcm93c2VyJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ3ZzY29kZS9vcGVuSW50ZWdyYXRlZEJyb3dzZXInIGluc3RlYWQuYCwgc3RhcnRDb2x1bW46IDcsIGVuZENvbHVtbjogMjQgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdza2lsbHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdza2lsbCBuYW1lIG1hdGNoZXMgZm9sZGVyIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ0V4cGVjdGVkIG5vIHZhbGlkYXRpb24gaXNzdWVzIHdoZW4gbmFtZSBtYXRjaGVzIGZvbGRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgbmFtZSBkb2VzIG5vdCBtYXRjaCBmb2xkZXIgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogZGlmZmVyZW50LW5hbWUnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSBza2lsbCBuYW1lICdkaWZmZXJlbnQtbmFtZScgc2hvdWxkIG1hdGNoIHRoZSBmb2xkZXIgbmFtZSAnbXktc2tpbGwnLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aG91dCBuYW1lIGF0dHJpYnV0ZSBzaG91bGQgd2FybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbCB3aXRob3V0IGEgbmFtZS4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgJ1NraWxsIHNob3VsZCBwcm92aWRlIGEgbmFtZS4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGhvdXQgZnJvbnRtYXR0ZXIgc2hvdWxkIG5vdCB3YXJuIGFib3V0IG1pc3NpbmcgbmFtZSBvciBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSAnVGhpcyBpcyBhIHNraWxsIHdpdGhvdXQgYW55IGZyb250bWF0dGVyLic7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCBlbXB0eSBuYW1lIHNob3VsZCBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aG91dCBkZXNjcmlwdGlvbiBhdHRyaWJ1dGUgc2hvdWxkIHdhcm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwgd2l0aG91dCBhIGRlc2NyaXB0aW9uLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCAnU2tpbGwgc2hvdWxkIHByb3ZpZGUgYSBkZXNjcmlwdGlvbi4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGhvdXQgZGVzY3JpcHRpb24gYnV0IHdpdGggdXNlci1pbnZvY2FibGUgZmFsc2Ugc2hvdWxkIGVycm9yIG9uIHRoYXQgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgJ1NraWxsIHNob3VsZCBwcm92aWRlIGEgZGVzY3JpcHRpb24uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1sxXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMV0ubWVzc2FnZS5pbmNsdWRlcygnZGVzY3JpcHRpb24gaXMgcmVxdWlyZWQgd2hlbiB1c2VyLWludm9jYWJsZSBpcyBmYWxzZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGhvdXQgZGVzY3JpcHRpb24gYnV0IHdpdGggZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uIGZhbHNlIHNob3VsZCBlcnJvciBvbiB0aGF0IGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBmYWxzZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCAnU2tpbGwgc2hvdWxkIHByb3ZpZGUgYSBkZXNjcmlwdGlvbi4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzFdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1sxXS5tZXNzYWdlLmluY2x1ZGVzKCdkZXNjcmlwdGlvbiBpcyByZXF1aXJlZCB3aGVuIG1vZGVsIGludm9jYXRpb24gaXMgZW5hYmxlZCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggZW1wdHkgZGVzY3JpcHRpb24gc2hvdWxkIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnZGVzY3JpcHRpb24nIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LmApO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdza2lsbCBuYW1lIHdpdGggaW52YWxpZCBjaGFyYWN0ZXJzIHNob3VsZCBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogTXkgU2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vycy5zb21lKG0gPT4gbS5zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuRXJyb3IgJiYgbS5tZXNzYWdlID09PSAnU2tpbGwgbmFtZSBtYXkgb25seSBjb250YWluIGxvd2VyY2FzZSBsZXR0ZXJzLCBudW1iZXJzLCBhbmQgaHlwaGVucy4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCBuYW1lIHdpdGggd2hpdGVzcGFjZSB0cmltbWVkIG1hdGNoZXMgZm9sZGVyIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiICBteS1za2lsbCAgXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gdmFsaWRhdGlvbiBpc3N1ZXMgd2hlbiB0cmltbWVkIG5hbWUgbWF0Y2hlcyBmb2xkZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIG5hbWUgdmFsaWRhdGlvbiB3aXRoIGRpZmZlcmVudCBmb2xkZXIgZGVwdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCB3aXRoIGRlZXBlciBwYXRoIHN0cnVjdHVyZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBhZHZhbmNlZC1za2lsbCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyLy5naXRodWIvc2tpbGxzL2FkdmFuY2VkLXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gaXNzdWVzIGZvciBkZWVwZXIgcGF0aCB3aGVuIG5hbWUgbWF0Y2hlcycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUZXN0IHdpdGggbWlzbWF0Y2ggaW4gZGVlcGVyIHBhdGhcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogd3JvbmctbmFtZScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyLy5naXRodWIvc2tpbGxzL2NvcnJlY3QtZm9sZGVyL1NLSUxMLm1kJykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlIHNraWxsIG5hbWUgJ3dyb25nLW5hbWUnIHNob3VsZCBtYXRjaCB0aGUgZm9sZGVyIG5hbWUgJ2NvcnJlY3QtZm9sZGVyJy5gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIG5hbWUgdmFsaWRhdGlvbiB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycyBpbiBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15X3NwZWNpYWwtc2tpbGwudjInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXlfc3BlY2lhbC1za2lsbC52Mi9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLnNvbWUobSA9PiBtLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5FcnJvciAmJiBtLm1lc3NhZ2UgPT09ICdTa2lsbCBuYW1lIG1heSBvbmx5IGNvbnRhaW4gbG93ZXJjYXNlIGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zLicpLCAnRXhwZWN0ZWQgZXJyb3IgZm9yIGludmFsaWQgY2hhcmFjdGVycyBpbiBza2lsbCBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIG5vbi1zdHJpbmcgbmFtZSB0eXBlIGRvZXMgbm90IHZhbGlkYXRlIGZvbGRlciBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogW10nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHQvLyBTaG91bGQgZ2V0IGVycm9yIGZvciBub24tc3RyaW5nIG5hbWUgdHlwZSwgYnV0IG5vIGZvbGRlciBtaXNtYXRjaCB3YXJuaW5nXG5cdFx0XHRhc3NlcnQub2sobWFya2Vycy5zb21lKG0gPT4gbS5tZXNzYWdlLmluY2x1ZGVzKCdtdXN0IGJlIGEgc3RyaW5nJykpLCAnRXhwZWN0ZWQgZXJyb3IgZm9yIG5vbi1zdHJpbmcgbmFtZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFtYXJrZXJzLnNvbWUobSA9PiBtLm1lc3NhZ2UuaW5jbHVkZXMoJ3Nob3VsZCBtYXRjaCB0aGUgZm9sZGVyIG5hbWUnKSksICdTaG91bGQgbm90IHdhcm4gYWJvdXQgZm9sZGVyIG1pc21hdGNoIGZvciBub24tc3RyaW5nIG5hbWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIGZvbGRlciBuYW1lIHZhbGlkYXRpb24gb25seSBmb3Igc2tpbGwgdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFZlcmlmeSB0aGF0IGZvbGRlciBuYW1lIHZhbGlkYXRpb24gZG9lc24ndCBydW4gZm9yIG5vbi1za2lsbCBwcm9tcHQgdHlwZXNcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogZGlmZmVyZW50LW5hbWUnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgQWdlbnQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYW4gYWdlbnQuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvYWdlbnRzL215LWFnZW50L0FHRU5ULm1kJykpO1xuXHRcdFx0Ly8gU2hvdWxkIG5vdCBnZXQgZm9sZGVyIG5hbWUgbWlzbWF0Y2ggd2FybmluZyBmb3IgYWdlbnRzXG5cdFx0XHRhc3NlcnQub2soIW1hcmtlcnMuc29tZShtID0+IG0ubWVzc2FnZS5pbmNsdWRlcygnc2hvdWxkIG1hdGNoIHRoZSBmb2xkZXIgbmFtZScpKSwgJ1Nob3VsZCBub3QgdmFsaWRhdGUgZm9sZGVyIG5hbWVzIGZvciBhZ2VudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggdW5rbm93biBhdHRyaWJ1dGVzIHNob3dzIHVubmVjZXNzYXJ5IGhpbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCd1bmtub3duQXR0cjogdmFsdWUnLFxuXHRcdFx0XHQnYW5vdGhlclVua25vd246IDEyMycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vycy5ldmVyeShtID0+IG0uc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkhpbnQpKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLmV2ZXJ5KG0gPT4gSlNPTi5zdHJpbmdpZnkobS50YWdzKSA9PT0gSlNPTi5zdHJpbmdpZnkoW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vycy5zb21lKG0gPT4gbS5tZXNzYWdlLmluY2x1ZGVzKCd1bmtub3duQXR0cicpKSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vycy5zb21lKG0gPT4gbS5tZXNzYWdlLmluY2x1ZGVzKCdhbm90aGVyVW5rbm93bicpKSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vycy5ldmVyeShtID0+IG0ubWVzc2FnZS5pbmNsdWRlcygnU3VwcG9ydGVkOiAnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCB1c2VyLWludm9jYWJsZTogZmFsc2UgaXMgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBCYWNrZ3JvdW5kIGtub3dsZWRnZSBza2lsbCcsXG5cdFx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgc2tpbGwgcHJvdmlkZXMgYmFja2dyb3VuZCBjb250ZXh0Lidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICd1c2VyLWludm9jYWJsZTogZmFsc2Ugc2hvdWxkIGJlIHZhbGlkIGZvciBza2lsbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggdXNlci1pbnZvY2FibGU6IHRydWUgaXMgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBVc2VyLWFjY2Vzc2libGUgc2tpbGwnLFxuXHRcdFx0XHQndXNlci1pbnZvY2FibGU6IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgc2tpbGwgY2FuIGJlIGludm9rZWQgYnkgdXNlcnMuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ3VzZXItaW52b2NhYmxlOiB0cnVlIHNob3VsZCBiZSB2YWxpZCBmb3Igc2tpbGxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGludmFsaWQgdXNlci1pbnZvY2FibGUgdmFsdWUgc2hvd3MgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTdHJpbmcgdmFsdWUgaW5zdGVhZCBvZiBib29sZWFuXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogXCJmYWxzZVwiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keSdcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ3VzZXItaW52b2NhYmxlJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTnVtYmVyIHZhbHVlIGluc3RlYWQgb2YgYm9vbGVhblxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IDAnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5J1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAndXNlci1pbnZvY2FibGUnIGF0dHJpYnV0ZSBtdXN0IGJlICd0cnVlJyBvciAnZmFsc2UnLmApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUgaXMgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBNYW51YWwtb25seSBza2lsbCcsXG5cdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgc2tpbGwgbXVzdCBiZSB0cmlnZ2VyZWQgbWFudWFsbHkgd2l0aCAvbmFtZS4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB0cnVlIHNob3VsZCBiZSB2YWxpZCBmb3Igc2tpbGxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2UgaXMgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBBdXRvLWxvYWRhYmxlIHNraWxsJyxcblx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2UnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgc2tpbGwgY2FuIGJlIGxvYWRlZCBhdXRvbWF0aWNhbGx5IGJ5IHRoZSBhZ2VudC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBmYWxzZSBzaG91bGQgYmUgdmFsaWQgZm9yIHNraWxscycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCBpbnZhbGlkIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbiB2YWx1ZSBzaG93cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFN0cmluZyB2YWx1ZSBpbnN0ZWFkIG9mIGJvb2xlYW5cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogXCJ0cnVlXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5J1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTnVtYmVyIHZhbHVlIGluc3RlYWQgb2YgYm9vbGVhblxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiAxJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keSdcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGFyZ3VtZW50LWhpbnQgaXMgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBTa2lsbCB3aXRoIGFyZ3VtZW50IGhpbnQnLFxuXHRcdFx0XHQnYXJndW1lbnQtaGludDogXCJbaXNzdWUtbnVtYmVyXVwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIHNraWxsIGV4cGVjdHMgYW4gaXNzdWUgbnVtYmVyLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdhcmd1bWVudC1oaW50IHNob3VsZCBiZSB2YWxpZCBmb3Igc2tpbGxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGVtcHR5IGFyZ3VtZW50LWhpbnQgc2hvd3Mgd2FybmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnYXJndW1lbnQtaGludDogXCJcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdhcmd1bWVudC1oaW50JyBhdHRyaWJ1dGUgc2hvdWxkIG5vdCBiZSBlbXB0eS5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggbm9uLXN0cmluZyBhcmd1bWVudC1oaW50IHNob3dzIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCdhcmd1bWVudC1oaW50OiBbXScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnYXJndW1lbnQtaGludCcgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGFsbCB2aXNpYmlsaXR5IGF0dHJpYnV0ZXMgY29tYmluZWQgaXMgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBDb21wbGV4IHZpc2liaWxpdHkgc2tpbGwnLFxuXHRcdFx0XHQndXNlci1pbnZvY2FibGU6IGZhbHNlJyxcblx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZScsXG5cdFx0XHRcdCdhcmd1bWVudC1oaW50OiBcIltvcHRpb25hbC1hcmddXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgc2tpbGwgaGFzIGNvbXBsZXggdmlzaWJpbGl0eSBzZXR0aW5ncy4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnQWxsIHZpc2liaWxpdHkgYXR0cmlidXRlcyBjb21iaW5lZCBzaG91bGQgYmUgdmFsaWQnKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgnY2xhdWRlIHJ1bGVzJywgKCkgPT4ge1xuXG5cdFx0Ly8gSGVscGVyIFVSSSBmb3IgQ2xhdWRlIHJ1bGVzIFx1MjAxNCBmaWxlIG11c3QgYmUgdW5kZXIgLmNsYXVkZS9ydWxlcy8gZm9yIHRhcmdldCBkZXRlY3Rpb25cblx0XHRjb25zdCBjbGF1ZGVSdWxlc1VyaSA9IFVSSS5wYXJzZSgnbXlGczovL3Rlc3QvLmNsYXVkZS9ydWxlcy9teS1ydWxlLm1kJyk7XG5cblx0XHR0ZXN0KCd2YWxpZCBjbGF1ZGUgcnVsZXMgd2l0aCBwYXRocyBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlR5cGVTY3JpcHQgcnVsZXNcIicsXG5cdFx0XHRcdGBwYXRoczogWycqKi8qLnRzJywgJyoqLyoudHN4J11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0Fsd2F5cyB1c2Ugc3RyaWN0IG1vZGUuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBjbGF1ZGVSdWxlc1VyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbGlkIGNsYXVkZSBydWxlcyB3aXRob3V0IHBhdGhzIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiR2VuZXJhbCBydWxlc1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdGb2xsb3cgY29kaW5nIGd1aWRlbGluZXMuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBjbGF1ZGVSdWxlc1VyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsYXVkZSBydWxlcyBwYXRocyBtdXN0IGJlIGFuIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJSdWxlc1wiJyxcblx0XHRcdFx0J3BhdGhzOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGNsYXVkZVJ1bGVzVXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAncGF0aHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIGFycmF5IG9mIGdsb2IgcGF0dGVybnMuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGF1ZGUgcnVsZXMgd2l0aCB1bmtub3duIGF0dHJpYnV0ZSBzaG93cyB1bm5lY2Vzc2FyeSBoaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJSdWxlc1wiJyxcblx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgY2xhdWRlUnVsZXNVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKGBBdHRyaWJ1dGUgJ2FwcGx5VG8nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gcnVsZXMgZmlsZXMgYnkgVlMgQ29kZSBhZ2VudHMuYCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xhdWRlIHJ1bGVzIHdpdGggbXVsdGlwbGUgdmFsaWRhdGlvbiBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlwiJyxcblx0XHRcdFx0YHBhdGhzOiBbJycsIDEyM11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBjbGF1ZGVSdWxlc1VyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ2Rlc2NyaXB0aW9uJyBhdHRyaWJ1dGUgc2hvdWxkIG5vdCBiZSBlbXB0eS5gIH0sXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBQYXRoIGVudHJpZXMgbXVzdCBiZSBub24tZW1wdHkgZ2xvYiBwYXR0ZXJucy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGF1ZGUgcnVsZXMgaW4gc3ViZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViRGlyVXJpID0gVVJJLnBhcnNlKCdteUZzOi8vdGVzdC8uY2xhdWRlL3J1bGVzL3N1Yi9kZWVwLXJ1bGUubWQnKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiTmVzdGVkIHJ1bGVzXCInLFxuXHRcdFx0XHRgcGF0aHM6IFsnc3JjLyoqLyoudHMnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnTmVzdGVkIHJ1bGUgY29udGVudC4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHN1YkRpclVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NsYXVkZSBhZ2VudHMnLCAoKSA9PiB7XG5cblx0XHQvLyBIZWxwZXIgVVJJIGZvciBDbGF1ZGUgYWdlbnRzIFx1MjAxNCBmaWxlIG11c3QgYmUgdW5kZXIgLmNsYXVkZS9hZ2VudHMvIGZvciB0YXJnZXQgZGV0ZWN0aW9uXG5cdFx0Y29uc3QgY2xhdWRlQWdlbnRVcmkgPSBVUkkucGFyc2UoJ215RnM6Ly90ZXN0Ly5jbGF1ZGUvYWdlbnRzL3Rlc3QuYWdlbnQubWQnKTtcblxuXHRcdHRlc3QoJ3ZhbGlkIENsYXVkZSBhZ2VudCB3aXRoIGFsbCBjb21tb24gYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0YHRvb2xzOiBbJ0VkaXQnLCAnR3JlcCcsICdBc2tVc2VyUXVlc3Rpb24nLCAnV2ViRmV0Y2gnXWAsXG5cdFx0XHRcdCdtb2RlbDogb3B1cycsXG5cdFx0XHRcdCdwZXJtaXNzaW9uTW9kZTogZGVsZWdhdGUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1lvdSBhcmUgYSBzZW5pb3Igc2VjdXJpdHkgZW5naW5lZXIuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWQgQ2xhdWRlIGFnZW50IHdpdGggbWluaW1hbCBhdHRyaWJ1dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBoZWxwZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IEEgc2ltcGxlIGhlbHBlciBhZ2VudCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnWW91IGhlbHAgd2l0aCB0YXNrcy4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgd2l0aCB2YWxpZCBtb2RlbCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBFYWNoIGtub3duIENsYXVkZSBtb2RlbCBzaG91bGQgYmUgdmFsaWRcblx0XHRcdGZvciAoY29uc3QgbW9kZWxOYW1lIG9mIFsnc29ubmV0JywgJ29wdXMnLCAnaGFpa3UnLCAnaW5oZXJpdCddKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdFx0YG1vZGVsOiAke21vZGVsTmFtZX1gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgYE1vZGVsICcke21vZGVsTmFtZX0nIHNob3VsZCBiZSB2YWxpZGApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggdW5rbm93biBtb2RlbCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogZ3B0LTQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biB2YWx1ZSAnZ3B0LTQnLCB2YWxpZDogc29ubmV0LCBvcHVzLCBoYWlrdSwgaW5oZXJpdC5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIG5vbi1zdHJpbmcgbW9kZWwgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnbW9kZWw6IFtdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ21vZGVsJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIHZhbGlkIHBlcm1pc3Npb25Nb2RlIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgbW9kZSBvZiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnLCAncGxhbicsICdkZWxlZ2F0ZScsICdkb250QXNrJywgJ2J5cGFzc1Blcm1pc3Npb25zJ10pIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0XHRgcGVybWlzc2lvbk1vZGU6ICR7bW9kZX1gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgYHBlcm1pc3Npb25Nb2RlICcke21vZGV9JyBzaG91bGQgYmUgdmFsaWRgKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIHVua25vd24gcGVybWlzc2lvbk1vZGUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnbW9kZWw6IHNvbm5ldCcsXG5cdFx0XHRcdCdwZXJtaXNzaW9uTW9kZTogYWxsb3dBbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biB2YWx1ZSAnYWxsb3dBbGwnLCB2YWxpZDogZGVmYXVsdCwgYWNjZXB0RWRpdHMsIHBsYW4sIGRlbGVnYXRlLCBkb250QXNrLCBieXBhc3NQZXJtaXNzaW9ucy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIHZhbGlkIG1lbW9yeSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lbSBvZiBbJ3VzZXInLCAncHJvamVjdCcsICdsb2NhbCddKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdFx0YG1lbW9yeTogJHttZW19YCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sIGBtZW1vcnkgJyR7bWVtfScgc2hvdWxkIGJlIHZhbGlkYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgd2l0aCB1bmtub3duIG1lbW9yeSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogc29ubmV0Jyxcblx0XHRcdFx0J3Blcm1pc3Npb25Nb2RlOiBkZWZhdWx0Jyxcblx0XHRcdFx0J21lbW9yeTogZ2xvYmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFVua25vd24gdmFsdWUgJ2dsb2JhbCcsIHZhbGlkOiB1c2VyLCBwcm9qZWN0LCBsb2NhbC5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIGVtcHR5IG5hbWUgc2hvd3MgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggZW1wdHkgZGVzY3JpcHRpb24gc2hvd3MgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnZGVzY3JpcHRpb24nIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggdW5rbm93biBhdHRyaWJ1dGVzIGRvZXMgbm90IHdhcm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDbGF1ZGUgdGFyZ2V0IGlnbm9yZXMgdW5rbm93biBhdHRyaWJ1dGVzIHNpbmNlIHdlIGRvbid0IGhhdmUgYSBmdWxsIGxpc3Rcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdjdXN0b21BdHRyaWJ1dGU6IHNvbWVWYWx1ZScsXG5cdFx0XHRcdCdhbm90aGVyQ3VzdG9tOiAxMjMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdVbmtub3duIGF0dHJpYnV0ZXMgc2hvdWxkIGJlIHNpbGVudGx5IGlnbm9yZWQgZm9yIENsYXVkZSBhZ2VudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB0b29scyBhcmUgbm90IHZhbGlkYXRlZCBhZ2FpbnN0IFZTIENvZGUgdG9vbCByZWdpc3RyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIENsYXVkZSB0b29sIG5hbWVzIChFZGl0LCBHcmVwLCBldGMuKSBkb24ndCBleGlzdCBpbiBWUyBDb2RlJ3MgdG9vbCByZWdpc3RyeVxuXHRcdFx0Ly8gYnV0IHNob3VsZCBub3QgcHJvZHVjZSB3YXJuaW5ncyBmb3IgQ2xhdWRlIHRhcmdldFxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ0VkaXQnLCAnR3JlcCcsICdVbmtub3duQ2xhdWRlVG9vbCcsICdXZWJGZXRjaCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnQ2xhdWRlIHRvb2xzIHNob3VsZCBub3QgYmUgdmFsaWRhdGVkIGFnYWluc3QgVlMgQ29kZSByZWdpc3RyeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggY29tbWEtc2VwYXJhdGVkIHRvb2xzIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZScsXG5cdFx0XHRcdCd0b29sczogRWRpdCwgR3JlcCwgQXNrVXNlclF1ZXN0aW9uLCBXZWJGZXRjaCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ0NvbW1hLXNlcGFyYXRlZCB0b29scyBzdHJpbmcgc2hvdWxkIGJlIHZhbGlkIGZvciBDbGF1ZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCBkb2VzIG5vdCB2YWxpZGF0ZSBoYW5kb2ZmcyBvciBhZ2VudHMgYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIGhhbmRvZmZzIGFuZCBhZ2VudHMgYXJlIFZTIENvZGUtc3BlY2lmaWM7IHRoZXkgc2hvdWxkbid0IGJlIHZhbGlkYXRlZCBmb3IgQ2xhdWRlXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnbW9kZWw6IG9wdXMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IGZ1bGwgcmVhbGlzdGljIGV4YW1wbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUgZm9yIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcycsXG5cdFx0XHRcdGB0b29sczogWydFZGl0JywgJ0dyZXAnLCAnQXNrVXNlclF1ZXN0aW9uJywgJ1dlYkZldGNoJ11gLFxuXHRcdFx0XHQnbW9kZWw6IG9wdXMnLFxuXHRcdFx0XHQncGVybWlzc2lvbk1vZGU6IGRlbGVnYXRlJyxcblx0XHRcdFx0J21lbW9yeTogcHJvamVjdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnWW91IGFyZSBhIHNlbmlvciBzZWN1cml0eSBlbmdpbmVlci4nLFxuXHRcdFx0XHQnUmV2aWV3IHRoZSBjb2RlIGZvciBjb21tb24gdnVsbmVyYWJpbGl0aWVzLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIG11bHRpcGxlIHZhbGlkYXRpb24gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlwiJyxcblx0XHRcdFx0J21vZGVsOiB1bmtub3duLW1vZGVsJyxcblx0XHRcdFx0J3Blcm1pc3Npb25Nb2RlOiBpbnZhbGlkLW1vZGUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnZGVzY3JpcHRpb24nIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlOiBgVW5rbm93biB2YWx1ZSAndW5rbm93bi1tb2RlbCcsIHZhbGlkOiBzb25uZXQsIG9wdXMsIGhhaWt1LCBpbmhlcml0LmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlOiBgVW5rbm93biB2YWx1ZSAnaW52YWxpZC1tb2RlJywgdmFsaWQ6IGRlZmF1bHQsIGFjY2VwdEVkaXRzLCBwbGFuLCBkZWxlZ2F0ZSwgZG9udEFzaywgYnlwYXNzUGVybWlzc2lvbnMuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQXNCLGdCQUFnQixpQkFBaUI7QUFDdkQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxVQUFVLGdCQUFnQix3QkFBd0I7QUFDM0QsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNEJBQXVDLHNCQUFzQjtBQUN0RSxTQUFTLDRCQUE0Qiw4QkFBOEI7QUFDbkUsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhLGNBQWM7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBdUIsaUJBQWlCLHNCQUFzQjtBQUM5RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLG1CQUFtQixNQUFNO0FBQzlCLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLGVBQWUsSUFBSSxNQUFNLDJCQUEyQjtBQUMxRCxRQUFNLGVBQWUsSUFBSSxNQUFNLDJCQUEyQjtBQUUxRCxRQUFNLFlBQVk7QUFFakIsd0JBQW9CLElBQUkseUJBQXlCO0FBQ2pELHNCQUFrQixxQkFBcUIsa0JBQWtCLHVCQUF1QixJQUFJO0FBQ3BGLG1CQUFlLDhCQUE4QjtBQUFBLE1BQzVDLG1CQUFtQixNQUFN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
