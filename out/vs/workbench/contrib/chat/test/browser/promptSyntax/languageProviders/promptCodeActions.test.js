import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { CodeActionTriggerType } from "../../../../../../../editor/common/languages.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { IMarkerService, MarkerSeverity } from "../../../../../../../platform/markers/common/markers.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { IPromptsService } from "../../../../common/promptSyntax/service/promptsService.js";
import { getLanguageIdForPromptsType, PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { PromptCodeActionProvider } from "../../../../common/promptSyntax/languageProviders/promptCodeActions.js";
import { PromptValidatorMarkerCode } from "../../../../common/promptSyntax/languageProviders/promptValidator.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { CodeActionKind } from "../../../../../../../editor/contrib/codeAction/common/types.js";
suite("PromptCodeActionProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let codeActionProvider;
  let fileService;
  let markerData = [];
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
    const deprecatedTool = { id: "oldTool", displayName: "oldTool", canBeReferencedInPrompt: true, modelDescription: "Deprecated Tool", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(deprecatedTool));
    toolService.getDeprecatedFullReferenceNames = () => {
      const map = /* @__PURE__ */ new Map();
      map.set("oldTool", /* @__PURE__ */ new Set(["newTool1", "newTool2"]));
      map.set("singleDeprecated", /* @__PURE__ */ new Set(["singleReplacement"]));
      return map;
    };
    instaService.set(ILanguageModelToolsService, toolService);
    markerData = [];
    instaService.stub(IMarkerService, { read: () => markerData });
    fileService = {
      canMove: async (source, target) => {
        return true;
      }
    };
    instaService.set(IFileService, fileService);
    const parser = new PromptFileParser();
    instaService.stub(IPromptsService, {
      getParsedPromptFile(model) {
        return parser.parse(model.uri, model.getValue());
      },
      getAgentFileURIFromModeFile(uri) {
        if (uri.path.endsWith(".chatmode.md")) {
          return uri.with({ path: uri.path.replace(".chatmode.md", ".agent.md") });
        }
        return void 0;
      }
    });
    codeActionProvider = instaService.createInstance(PromptCodeActionProvider);
  });
  async function getCodeActions(content, line, column, promptType, fileExtension) {
    const languageId = getLanguageIdForPromptsType(promptType);
    const uri = URI.parse("test:///test" + (fileExtension ?? getPromptFileExtension(promptType)));
    const model = disposables.add(createTextModel(content, languageId, void 0, uri));
    const range = new Range(line, column, line, column);
    const context = { trigger: CodeActionTriggerType.Invoke };
    const result = await codeActionProvider.provideCodeActions(model, range, context, CancellationToken.None);
    if (!result || result.actions.length === 0) {
      return [];
    }
    for (const action of result.actions) {
      assert.equal(action.kind, CodeActionKind.QuickFix.value);
    }
    return result.actions.map((action) => ({
      title: action.title,
      textEdits: action.edit?.edits?.filter((edit) => "textEdit" in edit),
      fileEdits: action.edit?.edits?.filter((edit) => "oldResource" in edit)
    }));
  }
  suite("agent code actions", () => {
    test("no code actions for instructions files", async () => {
      const content = [
        "---",
        'description: "Test instruction"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 2, 1, PromptsType.instructions);
      assert.strictEqual(actions.length, 0);
    });
    test("migrate mode file to agent file", async () => {
      const content = [
        "---",
        'name: "Test Mode"',
        'description: "Test mode file"',
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 1, 1, PromptsType.agent, ".chatmode.md");
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Migrate to custom agent file`);
    });
    test("update deprecated tool names - single replacement", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'singleReplacement'`);
    });
    test("update deprecated tool names - multiple replacements", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['oldTool']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Expand to 2 tools`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'newTool1','newTool2'`);
    });
    test("update all deprecated tool names", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['oldTool', 'singleDeprecated', 'validTool']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 8, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update all tool names`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 2);
    });
    test("handles double quotes in tool names", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ["singleDeprecated"]`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `"singleReplacement"`);
    });
    test("handles unquoted tool names", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "tools: [singleDeprecated]",
        // No quotes
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `singleReplacement`);
    });
    test("no code actions when range not in tools array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 2, 1, PromptsType.agent);
      assert.strictEqual(actions.length, 0);
    });
    test("offers quick fix to enable built-in github mcp server", async () => {
      markerData = [{
        code: { value: PromptValidatorMarkerCode.MissingGithubMcpServer, target: URI.parse("https://marketplace.visualstudio.com/items?itemName=io.github.github/github-mcp-server") },
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Warning,
        message: "Missing github mcp server",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 19
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['github/*']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        "Enable Built-in GitHub MCP Server",
        "Install GitHub MCP Server from Marketplace"
      ]);
    });
    test("offers quick fix to install playwright mcp server from marketplace", async () => {
      markerData = [{
        code: { value: PromptValidatorMarkerCode.MissingPlaywrightMcpServer, target: URI.parse("https://marketplace.visualstudio.com/items?itemName=microsoft.playwright-mcp") },
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Warning,
        message: "Missing playwright mcp server",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 21
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['playwrite/*']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        "Install Playwright MCP Server from Marketplace"
      ]);
    });
    test("offers quick fix to search marketplace for an extension-style tool reference", async () => {
      markerData = [{
        code: PromptValidatorMarkerCode.UnknownExtensionReference,
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Hint,
        message: "Unknown extension tool",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 28
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['my.extension/tool']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        `Search Marketplace for Extension 'my.extension'`
      ]);
    });
    test("offers quick fix to search marketplace for an mcp-style tool reference", async () => {
      markerData = [{
        code: PromptValidatorMarkerCode.UnknownMcpServerReference,
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Hint,
        message: "Unknown MCP server",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 59
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['io.github.github/github-mcp-server/create_branch']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        `Search Marketplace for MCP Server 'io.github.github/github-mcp-server/create_branch'`
      ]);
    });
  });
  suite("prompt code actions", () => {
    test("rename mode to agent", async () => {
      const content = [
        "---",
        'description: "Test"',
        "mode: edit",
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 3, 1, PromptsType.prompt);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Rename to 'agent'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, "agent");
    });
    test("update deprecated tool names in prompt", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 3, 10, PromptsType.prompt);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'singleReplacement'`);
    });
    test("no code actions when range not in mode attribute", async () => {
      const content = [
        "---",
        'description: "Test"',
        "mode: edit",
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 2, 1, PromptsType.prompt);
      assert.strictEqual(actions.length, 0);
    });
    test("both mode and tools code actions available", async () => {
      const content = [
        "---",
        'description: "Test"',
        "mode: edit",
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const modeActions = await getCodeActions(content, 3, 1, PromptsType.prompt);
      assert.strictEqual(modeActions.length, 1);
      assert.strictEqual(modeActions[0].title, `Rename to 'agent'`);
      const toolActions = await getCodeActions(content, 4, 10, PromptsType.prompt);
      assert.strictEqual(toolActions.length, 1);
      assert.strictEqual(toolActions[0].title, `Update to 'singleReplacement'`);
    });
  });
  test("returns undefined when no code actions available", async () => {
    const content = [
      "---",
      'description: "Test"',
      "target: vscode",
      `tools: ['validTool']`,
      // No deprecated tools
      "---"
    ].join("\n");
    const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
    assert.strictEqual(actions.length, 0);
  });
  test("uses comma-space delimiter when separator includes comma", async () => {
    const content = [
      "---",
      'description: "Test"',
      "target: vscode",
      `tools: ['oldTool', 'validTool']`,
      "---"
    ].join("\n");
    const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].title, `Expand to 2 tools`);
    assert.ok(actions[0].textEdits);
    assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'newTool1', 'newTool2'`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRDb2RlQWN0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbkNvbnRleHQsIENvZGVBY3Rpb25UcmlnZ2VyVHlwZSwgSVdvcmtzcGFjZVRleHRFZGl0LCBJV29ya3NwYWNlRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRMYW5ndWFnZUlkRm9yUHJvbXB0c1R5cGUsIFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IFByb21wdENvZGVBY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0Q29kZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0VmFsaWRhdG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcblxuc3VpdGUoJ1Byb21wdENvZGVBY3Rpb25Qcm92aWRlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFTZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb2RlQWN0aW9uUHJvdmlkZXI6IFByb21wdENvZGVBY3Rpb25Qcm92aWRlcjtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdGxldCBtYXJrZXJEYXRhOiBJTWFya2VyW10gPSBbXTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdENvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkLCB0cnVlKTtcblx0XHRpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZSh0ZXN0Q29uZmlnU2VydmljZSkpLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IHRlc3RDb25maWdTZXJ2aWNlXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgdG9vbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRlc3QgdG9vbHMgaW5jbHVkaW5nIGRlcHJlY2F0ZWQgb25lc1xuXHRcdGNvbnN0IHRlc3RUb29sMSA9IHsgaWQ6ICd0ZXN0VG9vbDEnLCBkaXNwbGF5TmFtZTogJ3Rvb2wxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wxKSk7XG5cblx0XHRjb25zdCBkZXByZWNhdGVkVG9vbCA9IHsgaWQ6ICdvbGRUb29sJywgZGlzcGxheU5hbWU6ICdvbGRUb29sJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdEZXByZWNhdGVkIFRvb2wnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGRlcHJlY2F0ZWRUb29sKSk7XG5cblx0XHQvLyBNb2NrIGRlcHJlY2F0ZWQgdG9vbCBuYW1lc1xuXHRcdHRvb2xTZXJ2aWNlLmdldERlcHJlY2F0ZWRGdWxsUmVmZXJlbmNlTmFtZXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG5cdFx0XHRtYXAuc2V0KCdvbGRUb29sJywgbmV3IFNldChbJ25ld1Rvb2wxJywgJ25ld1Rvb2wyJ10pKTtcblx0XHRcdG1hcC5zZXQoJ3NpbmdsZURlcHJlY2F0ZWQnLCBuZXcgU2V0KFsnc2luZ2xlUmVwbGFjZW1lbnQnXSkpO1xuXHRcdFx0cmV0dXJuIG1hcDtcblx0XHR9O1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnNldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdG9vbFNlcnZpY2UpO1xuXHRcdG1hcmtlckRhdGEgPSBbXTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTWFya2VyU2VydmljZSwgeyByZWFkOiAoKSA9PiBtYXJrZXJEYXRhIH0pO1xuXG5cdFx0ZmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRjYW5Nb3ZlOiBhc3luYyAoc291cmNlOiBVUkksIHRhcmdldDogVVJJKSA9PiB7XG5cdFx0XHRcdC8vIE1vY2sgZmlsZSBzZXJ2aWNlIHRoYXQgYWxsb3dzIG1vdmVzIGZvciB0ZXN0aW5nXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gYXMgSUZpbGVTZXJ2aWNlO1xuXHRcdGluc3RhU2VydmljZS5zZXQoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0Z2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VyLnBhcnNlKG1vZGVsLnVyaSwgbW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWdlbnRGaWxlVVJJRnJvbU1vZGVGaWxlKHVyaTogVVJJKSB7XG5cdFx0XHRcdC8vIE1vY2sgY29udmVyc2lvbiBmcm9tIC5jaGF0bW9kZS5tZCB0byAuYWdlbnQubWRcblx0XHRcdFx0aWYgKHVyaS5wYXRoLmVuZHNXaXRoKCcuY2hhdG1vZGUubWQnKSkge1xuXHRcdFx0XHRcdHJldHVybiB1cmkud2l0aCh7IHBhdGg6IHVyaS5wYXRoLnJlcGxhY2UoJy5jaGF0bW9kZS5tZCcsICcuYWdlbnQubWQnKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29kZUFjdGlvblByb3ZpZGVyID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdENvZGVBY3Rpb25Qcm92aWRlcik7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGdldENvZGVBY3Rpb25zKGNvbnRlbnQ6IHN0cmluZywgbGluZTogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIGZpbGVFeHRlbnNpb24/OiBzdHJpbmcpOiBQcm9taXNlPHsgdGl0bGU6IHN0cmluZzsgdGV4dEVkaXRzPzogSVdvcmtzcGFjZVRleHRFZGl0W107IGZpbGVFZGl0cz86IElXb3Jrc3BhY2VGaWxlRWRpdFtdIH1bXT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBnZXRMYW5ndWFnZUlkRm9yUHJvbXB0c1R5cGUocHJvbXB0VHlwZSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL3Rlc3QnICsgKGZpbGVFeHRlbnNpb24gPz8gZ2V0UHJvbXB0RmlsZUV4dGVuc2lvbihwcm9tcHRUeXBlKSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50LCBsYW5ndWFnZUlkLCB1bmRlZmluZWQsIHVyaSkpO1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGxpbmUsIGNvbHVtbiwgbGluZSwgY29sdW1uKTtcblx0XHRjb25zdCBjb250ZXh0OiBDb2RlQWN0aW9uQ29udGV4dCA9IHsgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSB9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29kZUFjdGlvblByb3ZpZGVyLnByb3ZpZGVDb2RlQWN0aW9ucyhtb2RlbCwgcmFuZ2UsIGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC5hY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHJlc3VsdC5hY3Rpb25zKSB7XG5cdFx0XHRhc3NlcnQuZXF1YWwoYWN0aW9uLmtpbmQsIENvZGVBY3Rpb25LaW5kLlF1aWNrRml4LnZhbHVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LmFjdGlvbnMubWFwKGFjdGlvbiA9PiAoe1xuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdHRleHRFZGl0czogYWN0aW9uLmVkaXQ/LmVkaXRzPy5maWx0ZXIoKGVkaXQpOiBlZGl0IGlzIElXb3Jrc3BhY2VUZXh0RWRpdCA9PiAndGV4dEVkaXQnIGluIGVkaXQpLFxuXHRcdFx0ZmlsZUVkaXRzOiBhY3Rpb24uZWRpdD8uZWRpdHM/LmZpbHRlcigoZWRpdCk6IGVkaXQgaXMgSVdvcmtzcGFjZUZpbGVFZGl0ID0+ICdvbGRSZXNvdXJjZScgaW4gZWRpdClcblx0XHR9KSk7XG5cdH1cblxuXHRzdWl0ZSgnYWdlbnQgY29kZSBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ25vIGNvZGUgYWN0aW9ucyBmb3IgaW5zdHJ1Y3Rpb25zIGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGluc3RydWN0aW9uXCInLFxuXHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgMiwgMSwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRlIG1vZGUgZmlsZSB0byBhZ2VudCBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3QgTW9kZVwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgbW9kZSBmaWxlXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgMSwgMSwgUHJvbXB0c1R5cGUuYWdlbnQsICcuY2hhdG1vZGUubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYE1pZ3JhdGUgdG8gY3VzdG9tIGFnZW50IGZpbGVgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZSBkZXByZWNhdGVkIHRvb2wgbmFtZXMgLSBzaW5nbGUgcmVwbGFjZW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydzaW5nbGVEZXByZWNhdGVkJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYFVwZGF0ZSB0byAnc2luZ2xlUmVwbGFjZW1lbnQnYCk7XG5cdFx0XHRhc3NlcnQub2soYWN0aW9uc1swXS50ZXh0RWRpdHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIVswXS50ZXh0RWRpdC50ZXh0LCBgJ3NpbmdsZVJlcGxhY2VtZW50J2ApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlIGRlcHJlY2F0ZWQgdG9vbCBuYW1lcyAtIG11bHRpcGxlIHJlcGxhY2VtZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ29sZFRvb2wnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRpdGxlLCBgRXhwYW5kIHRvIDIgdG9vbHNgKTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb25zWzBdLnRleHRFZGl0cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhWzBdLnRleHRFZGl0LnRleHQsIGAnbmV3VG9vbDEnLCduZXdUb29sMidgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZSBhbGwgZGVwcmVjYXRlZCB0b29sIG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsnb2xkVG9vbCcsICdzaW5nbGVEZXByZWNhdGVkJywgJ3ZhbGlkVG9vbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDgsIFByb21wdHNUeXBlLmFnZW50KTsgLy8gUG9zaXRpb24gYXQgdGhlIGJyYWNrZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYFVwZGF0ZSBhbGwgdG9vbCBuYW1lc2ApO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbMF0udGV4dEVkaXRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyEubGVuZ3RoLCAyKTsgLy8gT25seSBkZXByZWNhdGVkIHRvb2xzIGFyZSB1cGRhdGVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGRvdWJsZSBxdW90ZXMgaW4gdG9vbCBuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbXCJzaW5nbGVEZXByZWNhdGVkXCJdYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGl0bGUsIGBVcGRhdGUgdG8gJ3NpbmdsZVJlcGxhY2VtZW50J2ApO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbMF0udGV4dEVkaXRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyFbMF0udGV4dEVkaXQudGV4dCwgYFwic2luZ2xlUmVwbGFjZW1lbnRcImApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB1bnF1b3RlZCB0b29sIG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHQndG9vbHM6IFtzaW5nbGVEZXByZWNhdGVkXScsIC8vIE5vIHF1b3Rlc1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYFVwZGF0ZSB0byAnc2luZ2xlUmVwbGFjZW1lbnQnYCk7XG5cdFx0XHRhc3NlcnQub2soYWN0aW9uc1swXS50ZXh0RWRpdHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIVswXS50ZXh0RWRpdC50ZXh0LCBgc2luZ2xlUmVwbGFjZW1lbnRgKTsgLy8gTm8gcXVvdGVzIHByZXNlcnZlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gY29kZSBhY3Rpb25zIHdoZW4gcmFuZ2Ugbm90IGluIHRvb2xzIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsnc2luZ2xlRGVwcmVjYXRlZCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDIsIDEsIFByb21wdHNUeXBlLmFnZW50KTsgLy8gUmFuZ2UgaW4gZGVzY3JpcHRpb24sIG5vdCB0b29sc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyBxdWljayBmaXggdG8gZW5hYmxlIGJ1aWx0LWluIGdpdGh1YiBtY3Agc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFya2VyRGF0YSA9IFt7XG5cdFx0XHRcdGNvZGU6IHsgdmFsdWU6IFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuTWlzc2luZ0dpdGh1Yk1jcFNlcnZlciwgdGFyZ2V0OiBVUkkucGFyc2UoJ2h0dHBzOi8vbWFya2V0cGxhY2UudmlzdWFsc3R1ZGlvLmNvbS9pdGVtcz9pdGVtTmFtZT1pby5naXRodWIuZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyJykgfSxcblx0XHRcdFx0b3duZXI6ICdwcm9tcHRzLWRpYWdub3N0aWNzLXByb3ZpZGVyJyxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy90ZXN0JyArIGdldFByb21wdEZpbGVFeHRlbnNpb24oUHJvbXB0c1R5cGUuYWdlbnQpKSxcblx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdNaXNzaW5nIGdpdGh1YiBtY3Agc2VydmVyJyxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRzdGFydENvbHVtbjogOSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxOVxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydnaXRodWIvKiddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDExLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udGl0bGUpLCBbXG5cdFx0XHRcdCdFbmFibGUgQnVpbHQtaW4gR2l0SHViIE1DUCBTZXJ2ZXInLFxuXHRcdFx0XHQnSW5zdGFsbCBHaXRIdWIgTUNQIFNlcnZlciBmcm9tIE1hcmtldHBsYWNlJ1xuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZlcnMgcXVpY2sgZml4IHRvIGluc3RhbGwgcGxheXdyaWdodCBtY3Agc2VydmVyIGZyb20gbWFya2V0cGxhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYXJrZXJEYXRhID0gW3tcblx0XHRcdFx0Y29kZTogeyB2YWx1ZTogUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5NaXNzaW5nUGxheXdyaWdodE1jcFNlcnZlciwgdGFyZ2V0OiBVUkkucGFyc2UoJ2h0dHBzOi8vbWFya2V0cGxhY2UudmlzdWFsc3R1ZGlvLmNvbS9pdGVtcz9pdGVtTmFtZT1taWNyb3NvZnQucGxheXdyaWdodC1tY3AnKSB9LFxuXHRcdFx0XHRvd25lcjogJ3Byb21wdHMtZGlhZ25vc3RpY3MtcHJvdmlkZXInLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL3Rlc3QnICsgZ2V0UHJvbXB0RmlsZUV4dGVuc2lvbihQcm9tcHRzVHlwZS5hZ2VudCkpLFxuXHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogJ01pc3NpbmcgcGxheXdyaWdodCBtY3Agc2VydmVyJyxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRzdGFydENvbHVtbjogOSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAyMVxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydwbGF5d3JpdGUvKiddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDExLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udGl0bGUpLCBbXG5cdFx0XHRcdCdJbnN0YWxsIFBsYXl3cmlnaHQgTUNQIFNlcnZlciBmcm9tIE1hcmtldHBsYWNlJ1xuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZlcnMgcXVpY2sgZml4IHRvIHNlYXJjaCBtYXJrZXRwbGFjZSBmb3IgYW4gZXh0ZW5zaW9uLXN0eWxlIHRvb2wgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFya2VyRGF0YSA9IFt7XG5cdFx0XHRcdGNvZGU6IFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuVW5rbm93bkV4dGVuc2lvblJlZmVyZW5jZSxcblx0XHRcdFx0b3duZXI6ICdwcm9tcHRzLWRpYWdub3N0aWNzLXByb3ZpZGVyJyxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy90ZXN0JyArIGdldFByb21wdEZpbGVFeHRlbnNpb24oUHJvbXB0c1R5cGUuYWdlbnQpKSxcblx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdG1lc3NhZ2U6ICdVbmtub3duIGV4dGVuc2lvbiB0b29sJyxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRzdGFydENvbHVtbjogOSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAyOFxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydteS5leHRlbnNpb24vdG9vbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDExLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udGl0bGUpLCBbXG5cdFx0XHRcdGBTZWFyY2ggTWFya2V0cGxhY2UgZm9yIEV4dGVuc2lvbiAnbXkuZXh0ZW5zaW9uJ2Bcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2ZmZXJzIHF1aWNrIGZpeCB0byBzZWFyY2ggbWFya2V0cGxhY2UgZm9yIGFuIG1jcC1zdHlsZSB0b29sIHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdG1hcmtlckRhdGEgPSBbe1xuXHRcdFx0XHRjb2RlOiBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLlVua25vd25NY3BTZXJ2ZXJSZWZlcmVuY2UsXG5cdFx0XHRcdG93bmVyOiAncHJvbXB0cy1kaWFnbm9zdGljcy1wcm92aWRlcicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vdGVzdCcgKyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKFByb21wdHNUeXBlLmFnZW50KSksXG5cdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHRtZXNzYWdlOiAnVW5rbm93biBNQ1Agc2VydmVyJyxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRzdGFydENvbHVtbjogOSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiA1OVxuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydpby5naXRodWIuZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyL2NyZWF0ZV9icmFuY2gnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCA0LCAxMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLnRpdGxlKSwgW1xuXHRcdFx0XHRgU2VhcmNoIE1hcmtldHBsYWNlIGZvciBNQ1AgU2VydmVyICdpby5naXRodWIuZ2l0aHViL2dpdGh1Yi1tY3Atc2VydmVyL2NyZWF0ZV9icmFuY2gnYFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcm9tcHQgY29kZSBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmFtZSBtb2RlIHRvIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZTogZWRpdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCAzLCAxLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRpdGxlLCBgUmVuYW1lIHRvICdhZ2VudCdgKTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb25zWzBdLnRleHRFZGl0cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhWzBdLnRleHRFZGl0LnRleHQsICdhZ2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlIGRlcHJlY2F0ZWQgdG9vbCBuYW1lcyBpbiBwcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogWydzaW5nbGVEZXByZWNhdGVkJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgMywgMTAsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGl0bGUsIGBVcGRhdGUgdG8gJ3NpbmdsZVJlcGxhY2VtZW50J2ApO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbMF0udGV4dEVkaXRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyEubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyFbMF0udGV4dEVkaXQudGV4dCwgYCdzaW5nbGVSZXBsYWNlbWVudCdgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIGNvZGUgYWN0aW9ucyB3aGVuIHJhbmdlIG5vdCBpbiBtb2RlIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J21vZGU6IGVkaXQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgMiwgMSwgUHJvbXB0c1R5cGUucHJvbXB0KTsgLy8gUmFuZ2UgaW4gZGVzY3JpcHRpb24sIG5vdCBtb2RlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYm90aCBtb2RlIGFuZCB0b29scyBjb2RlIGFjdGlvbnMgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZTogZWRpdCcsXG5cdFx0XHRcdGB0b29sczogWydzaW5nbGVEZXByZWNhdGVkJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHQvLyBUZXN0IG1vZGUgYWN0aW9uXG5cdFx0XHRjb25zdCBtb2RlQWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZUFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlQWN0aW9uc1swXS50aXRsZSwgYFJlbmFtZSB0byAnYWdlbnQnYCk7XG5cblx0XHRcdC8vIFRlc3QgdG9vbHMgYWN0aW9uXG5cdFx0XHRjb25zdCB0b29sQWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbEFjdGlvbnNbMF0udGl0bGUsIGBVcGRhdGUgdG8gJ3NpbmdsZVJlcGxhY2VtZW50J2ApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGNvZGUgYWN0aW9ucyBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0YHRvb2xzOiBbJ3ZhbGlkVG9vbCddYCwgLy8gTm8gZGVwcmVjYXRlZCB0b29sc1xuXHRcdFx0Jy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGNvbW1hLXNwYWNlIGRlbGltaXRlciB3aGVuIHNlcGFyYXRvciBpbmNsdWRlcyBjb21tYScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRgdG9vbHM6IFsnb2xkVG9vbCcsICd2YWxpZFRvb2wnXWAsXG5cdFx0XHQnLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGl0bGUsIGBFeHBhbmQgdG8gMiB0b29sc2ApO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zWzBdLnRleHRFZGl0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIVswXS50ZXh0RWRpdC50ZXh0LCBgJ25ld1Rvb2wxJywgJ25ld1Rvb2wyJ2ApO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUN0QixTQUE0Qiw2QkFBcUU7QUFDakcsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBa0IsZ0JBQWdCLHNCQUFzQjtBQUN4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUF1QyxzQkFBc0I7QUFDdEUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkIsbUJBQW1CO0FBQ3pELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sNEJBQTRCLE1BQU07QUFDdkMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJLGFBQXdCLENBQUM7QUFFN0IsUUFBTSxZQUFZO0FBQ2pCLFVBQU0sb0JBQW9CLElBQUkseUJBQXlCO0FBQ3ZELHNCQUFrQixxQkFBcUIsa0JBQWtCLHVCQUF1QixJQUFJO0FBQ3BGLG1CQUFlLDhCQUE4QjtBQUFBLE1BQzVDLG1CQUFtQixNQUFNLFlBQVksSUFBSSxJQUFJLGtCQUFrQixpQkFBaUIsQ0FBQztBQUFBLE1BQ2pGLHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsR0FBRyxXQUFXO0FBRWQsVUFBTSxjQUFjLFlBQVksSUFBSSxhQUFhLGVBQWUseUJBQXlCLENBQUM7QUFHMUYsVUFBTSxZQUFZLEVBQUUsSUFBSSxhQUFhLGFBQWEsU0FBUyx5QkFBeUIsTUFBTSxrQkFBa0IsZUFBZSxRQUFRLGVBQWUsVUFBVSxhQUFhLENBQUMsRUFBRTtBQUM1SyxnQkFBWSxJQUFJLFlBQVksaUJBQWlCLFNBQVMsQ0FBQztBQUV2RCxVQUFNLGlCQUFpQixFQUFFLElBQUksV0FBVyxhQUFhLFdBQVcseUJBQXlCLE1BQU0sa0JBQWtCLG1CQUFtQixRQUFRLGVBQWUsVUFBVSxhQUFhLENBQUMsRUFBRTtBQUNyTCxnQkFBWSxJQUFJLFlBQVksaUJBQWlCLGNBQWMsQ0FBQztBQUc1RCxnQkFBWSxrQ0FBa0MsTUFBTTtBQUNuRCxZQUFNLE1BQU0sb0JBQUksSUFBeUI7QUFDekMsVUFBSSxJQUFJLFdBQVcsb0JBQUksSUFBSSxDQUFDLFlBQVksVUFBVSxDQUFDLENBQUM7QUFDcEQsVUFBSSxJQUFJLG9CQUFvQixvQkFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUMxRCxhQUFPO0FBQUEsSUFDUjtBQUVBLGlCQUFhLElBQUksNEJBQTRCLFdBQVc7QUFDeEQsaUJBQWEsQ0FBQztBQUNkLGlCQUFhLEtBQUssZ0JBQWdCLEVBQUUsTUFBTSxNQUFNLFdBQVcsQ0FBQztBQUU1RCxrQkFBYztBQUFBLE1BQ2IsU0FBUyxPQUFPLFFBQWEsV0FBZ0I7QUFFNUMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsaUJBQWEsSUFBSSxjQUFjLFdBQVc7QUFFMUMsVUFBTSxTQUFTLElBQUksaUJBQWlCO0FBQ3BDLGlCQUFhLEtBQUssaUJBQWlCO0FBQUEsTUFDbEMsb0JBQW9CLE9BQW1CO0FBQ3RDLGVBQU8sT0FBTyxNQUFNLE1BQU0sS0FBSyxNQUFNLFNBQVMsQ0FBQztBQUFBLE1BQ2hEO0FBQUEsTUFDQSw0QkFBNEIsS0FBVTtBQUVyQyxZQUFJLElBQUksS0FBSyxTQUFTLGNBQWMsR0FBRztBQUN0QyxpQkFBTyxJQUFJLEtBQUssRUFBRSxNQUFNLElBQUksS0FBSyxRQUFRLGdCQUFnQixXQUFXLEVBQUUsQ0FBQztBQUFBLFFBQ3hFO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFFRCx5QkFBcUIsYUFBYSxlQUFlLHdCQUF3QjtBQUFBLEVBQzFFLENBQUM7QUFFRCxpQkFBZSxlQUFlLFNBQWlCLE1BQWMsUUFBZ0IsWUFBeUIsZUFBMEg7QUFDL04sVUFBTSxhQUFhLDRCQUE0QixVQUFVO0FBQ3pELFVBQU0sTUFBTSxJQUFJLE1BQU0sa0JBQWtCLGlCQUFpQix1QkFBdUIsVUFBVSxFQUFFO0FBQzVGLFVBQU0sUUFBUSxZQUFZLElBQUksZ0JBQWdCLFNBQVMsWUFBWSxRQUFXLEdBQUcsQ0FBQztBQUNsRixVQUFNLFFBQVEsSUFBSSxNQUFNLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFDbEQsVUFBTSxVQUE2QixFQUFFLFNBQVMsc0JBQXNCLE9BQU87QUFFM0UsVUFBTSxTQUFTLE1BQU0sbUJBQW1CLG1CQUFtQixPQUFPLE9BQU8sU0FBUyxrQkFBa0IsSUFBSTtBQUN4RyxRQUFJLENBQUMsVUFBVSxPQUFPLFFBQVEsV0FBVyxHQUFHO0FBQzNDLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxlQUFXLFVBQVUsT0FBTyxTQUFTO0FBQ3BDLGFBQU8sTUFBTSxPQUFPLE1BQU0sZUFBZSxTQUFTLEtBQUs7QUFBQSxJQUN4RDtBQUVBLFdBQU8sT0FBTyxRQUFRLElBQUksYUFBVztBQUFBLE1BQ3BDLE9BQU8sT0FBTztBQUFBLE1BQ2QsV0FBVyxPQUFPLE1BQU0sT0FBTyxPQUFPLENBQUMsU0FBcUMsY0FBYyxJQUFJO0FBQUEsTUFDOUYsV0FBVyxPQUFPLE1BQU0sT0FBTyxPQUFPLENBQUMsU0FBcUMsaUJBQWlCLElBQUk7QUFBQSxJQUNsRyxFQUFFO0FBQUEsRUFDSDtBQUVBLFFBQU0sc0JBQXNCLE1BQU07QUFDakMsU0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFlBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLEdBQUcsWUFBWSxZQUFZO0FBQzVFLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxZQUFZO0FBQ25ELFlBQU0sVUFBVTtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBTSxVQUFVLE1BQU0sZUFBZSxTQUFTLEdBQUcsR0FBRyxZQUFZLE9BQU8sY0FBYztBQUNyRixhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sOEJBQThCO0FBQUEsSUFDcEUsQ0FBQztBQUVELFNBQUsscURBQXFELFlBQVk7QUFDckUsWUFBTSxVQUFVO0FBQUEsUUFDZjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBTSxVQUFVLE1BQU0sZUFBZSxTQUFTLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDdEUsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLCtCQUErQjtBQUNwRSxhQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUztBQUM5QixhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsVUFBVyxRQUFRLENBQUM7QUFDbEQsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLFVBQVcsQ0FBQyxFQUFFLFNBQVMsTUFBTSxxQkFBcUI7QUFBQSxJQUNqRixDQUFDO0FBRUQsU0FBSyx3REFBd0QsWUFBWTtBQUN4RSxZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxZQUFNLFVBQVUsTUFBTSxlQUFlLFNBQVMsR0FBRyxJQUFJLFlBQVksS0FBSztBQUN0RSxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sbUJBQW1CO0FBQ3hELGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTO0FBQzlCLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxVQUFXLFFBQVEsQ0FBQztBQUNsRCxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsVUFBVyxDQUFDLEVBQUUsU0FBUyxNQUFNLHVCQUF1QjtBQUFBLElBQ25GLENBQUM7QUFFRCxTQUFLLG9DQUFvQyxZQUFZO0FBQ3BELFlBQU0sVUFBVTtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFlBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLEdBQUcsWUFBWSxLQUFLO0FBQ3JFLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsT0FBTyx1QkFBdUI7QUFDNUQsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVM7QUFDOUIsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLFVBQVcsUUFBUSxDQUFDO0FBQUEsSUFDbkQsQ0FBQztBQUVELFNBQUssdUNBQXVDLFlBQVk7QUFDdkQsWUFBTSxVQUFVO0FBQUEsUUFDZjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBTSxVQUFVLE1BQU0sZUFBZSxTQUFTLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDdEUsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLCtCQUErQjtBQUNwRSxhQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUztBQUM5QixhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsVUFBVyxDQUFDLEVBQUUsU0FBUyxNQUFNLHFCQUFxQjtBQUFBLElBQ2pGLENBQUM7QUFFRCxTQUFLLCtCQUErQixZQUFZO0FBQy9DLFlBQU0sVUFBVTtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBTSxVQUFVLE1BQU0sZUFBZSxTQUFTLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDdEUsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLCtCQUErQjtBQUNwRSxhQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUztBQUM5QixhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsVUFBVyxDQUFDLEVBQUUsU0FBUyxNQUFNLG1CQUFtQjtBQUFBLElBQy9FLENBQUM7QUFFRCxTQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLFlBQU0sVUFBVTtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFlBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLEdBQUcsWUFBWSxLQUFLO0FBQ3JFLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLG1CQUFhLENBQUM7QUFBQSxRQUNiLE1BQU0sRUFBRSxPQUFPLDBCQUEwQix3QkFBd0IsUUFBUSxJQUFJLE1BQU0sd0ZBQXdGLEVBQUU7QUFBQSxRQUM3SyxPQUFPO0FBQUEsUUFDUCxVQUFVLElBQUksTUFBTSxpQkFBaUIsdUJBQXVCLFlBQVksS0FBSyxDQUFDO0FBQUEsUUFDOUUsVUFBVSxlQUFlO0FBQUEsUUFDekIsU0FBUztBQUFBLFFBQ1QsaUJBQWlCO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsZUFBZTtBQUFBLFFBQ2YsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUNELFlBQU0sVUFBVTtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFlBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLElBQUksWUFBWSxLQUFLO0FBQ3RFLGFBQU8sZ0JBQWdCLFFBQVEsSUFBSSxZQUFVLE9BQU8sS0FBSyxHQUFHO0FBQUEsUUFDM0Q7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxzRUFBc0UsWUFBWTtBQUN0RixtQkFBYSxDQUFDO0FBQUEsUUFDYixNQUFNLEVBQUUsT0FBTywwQkFBMEIsNEJBQTRCLFFBQVEsSUFBSSxNQUFNLDhFQUE4RSxFQUFFO0FBQUEsUUFDdkssT0FBTztBQUFBLFFBQ1AsVUFBVSxJQUFJLE1BQU0saUJBQWlCLHVCQUF1QixZQUFZLEtBQUssQ0FBQztBQUFBLFFBQzlFLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLFNBQVM7QUFBQSxRQUNULGlCQUFpQjtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLGVBQWU7QUFBQSxRQUNmLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFDRCxZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxZQUFNLFVBQVUsTUFBTSxlQUFlLFNBQVMsR0FBRyxJQUFJLFlBQVksS0FBSztBQUN0RSxhQUFPLGdCQUFnQixRQUFRLElBQUksWUFBVSxPQUFPLEtBQUssR0FBRztBQUFBLFFBQzNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxtQkFBYSxDQUFDO0FBQUEsUUFDYixNQUFNLDBCQUEwQjtBQUFBLFFBQ2hDLE9BQU87QUFBQSxRQUNQLFVBQVUsSUFBSSxNQUFNLGlCQUFpQix1QkFBdUIsWUFBWSxLQUFLLENBQUM7QUFBQSxRQUM5RSxVQUFVLGVBQWU7QUFBQSxRQUN6QixTQUFTO0FBQUEsUUFDVCxpQkFBaUI7QUFBQSxRQUNqQixhQUFhO0FBQUEsUUFDYixlQUFlO0FBQUEsUUFDZixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQ0QsWUFBTSxVQUFVO0FBQUEsUUFDZjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBTSxVQUFVLE1BQU0sZUFBZSxTQUFTLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDdEUsYUFBTyxnQkFBZ0IsUUFBUSxJQUFJLFlBQVUsT0FBTyxLQUFLLEdBQUc7QUFBQSxRQUMzRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMEVBQTBFLFlBQVk7QUFDMUYsbUJBQWEsQ0FBQztBQUFBLFFBQ2IsTUFBTSwwQkFBMEI7QUFBQSxRQUNoQyxPQUFPO0FBQUEsUUFDUCxVQUFVLElBQUksTUFBTSxpQkFBaUIsdUJBQXVCLFlBQVksS0FBSyxDQUFDO0FBQUEsUUFDOUUsVUFBVSxlQUFlO0FBQUEsUUFDekIsU0FBUztBQUFBLFFBQ1QsaUJBQWlCO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsZUFBZTtBQUFBLFFBQ2YsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUNELFlBQU0sVUFBVTtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFlBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLElBQUksWUFBWSxLQUFLO0FBQ3RFLGFBQU8sZ0JBQWdCLFFBQVEsSUFBSSxZQUFVLE9BQU8sS0FBSyxHQUFHO0FBQUEsUUFDM0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFNBQUssd0JBQXdCLFlBQVk7QUFDeEMsWUFBTSxVQUFVO0FBQUEsUUFDZjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxZQUFNLFVBQVUsTUFBTSxlQUFlLFNBQVMsR0FBRyxHQUFHLFlBQVksTUFBTTtBQUN0RSxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sbUJBQW1CO0FBQ3hELGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTO0FBQzlCLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxVQUFXLFFBQVEsQ0FBQztBQUNsRCxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsVUFBVyxDQUFDLEVBQUUsU0FBUyxNQUFNLE9BQU87QUFBQSxJQUNuRSxDQUFDO0FBRUQsU0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFlBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLElBQUksWUFBWSxNQUFNO0FBQ3ZFLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsT0FBTywrQkFBK0I7QUFDcEUsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVM7QUFDOUIsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLFVBQVcsUUFBUSxDQUFDO0FBQ2xELGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxVQUFXLENBQUMsRUFBRSxTQUFTLE1BQU0scUJBQXFCO0FBQUEsSUFDakYsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxVQUFVO0FBQUEsUUFDZjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxZQUFNLFVBQVUsTUFBTSxlQUFlLFNBQVMsR0FBRyxHQUFHLFlBQVksTUFBTTtBQUN0RSxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyw4Q0FBOEMsWUFBWTtBQUM5RCxZQUFNLFVBQVU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxZQUFNLGNBQWMsTUFBTSxlQUFlLFNBQVMsR0FBRyxHQUFHLFlBQVksTUFBTTtBQUMxRSxhQUFPLFlBQVksWUFBWSxRQUFRLENBQUM7QUFDeEMsYUFBTyxZQUFZLFlBQVksQ0FBQyxFQUFFLE9BQU8sbUJBQW1CO0FBRzVELFlBQU0sY0FBYyxNQUFNLGVBQWUsU0FBUyxHQUFHLElBQUksWUFBWSxNQUFNO0FBQzNFLGFBQU8sWUFBWSxZQUFZLFFBQVEsQ0FBQztBQUN4QyxhQUFPLFlBQVksWUFBWSxDQUFDLEVBQUUsT0FBTywrQkFBK0I7QUFBQSxJQUN6RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvREFBb0QsWUFBWTtBQUNwRSxVQUFNLFVBQVU7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFVBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLElBQUksWUFBWSxLQUFLO0FBQ3RFLFdBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLFVBQU0sVUFBVTtBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFVBQU0sVUFBVSxNQUFNLGVBQWUsU0FBUyxHQUFHLElBQUksWUFBWSxLQUFLO0FBQ3RFLFdBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxXQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsT0FBTyxtQkFBbUI7QUFDeEQsV0FBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVM7QUFDOUIsV0FBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLFVBQVcsQ0FBQyxFQUFFLFNBQVMsTUFBTSx3QkFBd0I7QUFBQSxFQUNwRixDQUFDO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
