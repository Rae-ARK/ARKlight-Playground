import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../../platform/log/common/log.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { RUN_SUBAGENT_MAX_NESTING_DEPTH, RunSubagentTool } from "../../../../common/tools/builtinTools/runSubagentTool.js";
import { MockLanguageModelToolsService } from "../mockLanguageModelToolsService.js";
import { COPILOT_VENDOR_ID } from "../../../../common/languageModels.js";
import { PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { Target } from "../../../../common/promptSyntax/promptTypes.js";
import { MockPromptsService } from "../../promptSyntax/service/mockPromptsService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ChatConfiguration } from "../../../../common/constants.js";
suite("RunSubagentTool", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("resultText trimming", () => {
    test("trims leading empty codeblocks (```\\n```) from result", () => {
      const testCases = [
        { input: "```\n```\nActual content", expected: "Actual content" },
        { input: "\n```\n```\nActual content", expected: "Actual content" },
        { input: "\n\n```\n\n```\n\nActual content", expected: "Actual content" },
        { input: "```\n```\n```\n```\nActual content", expected: "```\n```\nActual content" },
        // Only trims leading
        { input: "No codeblock here", expected: "No codeblock here" },
        { input: "```\n```\n", expected: "" },
        { input: "", expected: "" }
      ];
      for (const { input, expected } of testCases) {
        const result = input.replace(/^\n*```\n+```\n*/g, "").trim();
        assert.strictEqual(result, expected, `Failed for input: ${JSON.stringify(input)}`);
      }
    });
  });
  suite("prepareToolInvocation", () => {
    test("returns correct toolSpecificData", async () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      const customMode = {
        id: "file:///test/custom-agent.md",
        uri: URI.parse("file:///test/custom-agent.md"),
        name: "CustomAgent",
        description: "A test custom agent",
        tools: ["tool1", "tool2"],
        agentInstructions: { content: "Custom agent body", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        target: Target.Undefined,
        visibility: { userInvocable: true, agentInvocable: true },
        enabled: true
      };
      promptsService.setCustomModes([customMode]);
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        {},
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      const result = await tool.prepareToolInvocation(
        {
          parameters: {
            prompt: "Test prompt",
            description: "Test task",
            agentName: "CustomAgent"
          },
          toolCallId: "test-call-1",
          chatSessionResource: URI.parse("test://session")
        },
        CancellationToken.None
      );
      assert.ok(result);
      assert.strictEqual(result.invocationMessage, "Test task");
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "Test task",
        agentName: "CustomAgent",
        prompt: "Test prompt",
        modelName: void 0
      });
    });
    function createTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      if (opts?.customAgents) {
        promptsService.setCustomModes(opts.customAgents);
      }
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        {},
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      return tool;
    }
    test("passes through unknown agentName", async () => {
      const tool = createTool();
      const result = await tool.prepareToolInvocation(
        {
          parameters: { prompt: "Test prompt", description: "Test task", agentName: "NonExistentAgent" },
          toolCallId: "test-call-unknown",
          chatSessionResource: URI.parse("test://session")
        },
        CancellationToken.None
      );
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "Test task",
        agentName: "NonExistentAgent",
        prompt: "Test prompt",
        modelName: void 0
      });
    });
  });
  suite("getToolData", () => {
    test("returns basic tool data", () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        {},
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      const toolData = tool.getToolData();
      assert.strictEqual(toolData.id, "runSubagent");
      assert.ok(toolData.inputSchema);
      assert.ok(toolData.inputSchema.properties?.prompt);
      assert.ok(toolData.inputSchema.properties?.description);
      assert.ok(toolData.inputSchema.properties?.agentName, "agentName should be in schema properties");
      assert.deepStrictEqual(toolData.inputSchema.required, ["prompt", "description"]);
    });
  });
  suite("onDidInvokeTool event", () => {
    test("mock service fires onDidInvokeTool events with correct data", () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const sessionResource = URI.parse("test://session");
      const receivedEvents = [];
      testDisposables.add(mockToolsService.onDidInvokeTool((e) => {
        receivedEvents.push(e);
      }));
      mockToolsService.fireOnDidInvokeTool({
        toolId: "test-tool",
        sessionResource,
        requestId: "request-123",
        subagentInvocationId: "subagent-456"
      });
      assert.strictEqual(receivedEvents.length, 1);
      assert.deepStrictEqual(receivedEvents[0], {
        toolId: "test-tool",
        sessionResource,
        requestId: "request-123",
        subagentInvocationId: "subagent-456"
      });
    });
    test("events with different subagentInvocationId are distinguishable", () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const targetSubagentId = "target-subagent";
      const matchingEvents = [];
      testDisposables.add(mockToolsService.onDidInvokeTool((e) => {
        if (e.subagentInvocationId === targetSubagentId) {
          matchingEvents.push(e.toolId);
        }
      }));
      mockToolsService.fireOnDidInvokeTool({
        toolId: "unrelated-tool",
        sessionResource: void 0,
        requestId: void 0,
        subagentInvocationId: "different-subagent"
      });
      mockToolsService.fireOnDidInvokeTool({
        toolId: "matching-tool",
        sessionResource: void 0,
        requestId: void 0,
        subagentInvocationId: targetSubagentId
      });
      mockToolsService.fireOnDidInvokeTool({
        toolId: "another-unrelated-tool",
        sessionResource: void 0,
        requestId: void 0,
        subagentInvocationId: void 0
      });
      assert.deepStrictEqual(matchingEvents, ["matching-tool"]);
    });
  });
  suite("model fallback behavior", () => {
    const BUILTIN_CHAT_EXTENSION_ID = "github.copilot-chat";
    const builtinProductService = { defaultChatAgent: { chatExtensionId: BUILTIN_CHAT_EXTENSION_ID } };
    function createMetadata(name, multiplierNumeric, vendor = "TestVendor") {
      return {
        extension: new ExtensionIdentifier("test.extension"),
        name,
        id: name.toLowerCase().replace(/\s+/g, "-"),
        vendor,
        version: "1.0",
        family: "test",
        maxInputTokens: 128e3,
        maxOutputTokens: 8192,
        isDefaultForLocation: {},
        multiplierNumeric,
        capabilities: { toolCalling: true },
        isBYOK: vendor !== COPILOT_VENDOR_ID
      };
    }
    function createTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      if (opts.customAgents) {
        promptsService.setCustomModes(opts.customAgents);
      }
      const mockLanguageModelsService = {
        getLanguageModelIds() {
          return Array.from(opts.models.keys());
        },
        lookupLanguageModel(modelId) {
          return opts.models.get(modelId);
        },
        lookupLanguageModelByQualifiedName(qualifiedName) {
          return opts.qualifiedNameMap?.get(qualifiedName);
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        mockLanguageModelsService,
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        builtinProductService
      ));
      return tool;
    }
    function createAgent(name, modelQualifiedNames) {
      const id = `file:///test/${name}.md`;
      return {
        uri: URI.parse(id),
        id,
        name,
        description: `Agent ${name}`,
        tools: ["tool1"],
        model: modelQualifiedNames,
        agentInstructions: { content: "test", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        target: Target.Undefined,
        visibility: { userInvocable: true, agentInvocable: true },
        enabled: true
      };
    }
    function createBuiltinAgent(name, modelQualifiedNames) {
      return {
        ...createAgent(name, modelQualifiedNames),
        source: { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(BUILTIN_CHAT_EXTENSION_ID) }
      };
    }
    test("throws error when subagent model has higher multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const expensiveMeta = createMetadata("O3 Pro", 50);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["expensive-model-id", expensiveMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["O3 Pro (TestVendor)", { metadata: expensiveMeta, identifier: "expensive-model-id" }]
      ]);
      const agent = createAgent("ExpensiveAgent", ["O3 Pro (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", agentName: "ExpensiveAgent" },
          toolCallId: "call-1",
          modelId: "main-model-id",
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("O3 Pro"));
          assert.ok(err.message.includes("exceeds"));
          assert.ok(err.message.includes("cost tier"));
          assert.ok(err.message.includes("Unavailable"));
          return true;
        }
      );
    });
    test("uses subagent model when it has equal multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const sameCostMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["same-cost-model-id", sameCostMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Claude Sonnet (TestVendor)", { metadata: sameCostMeta, identifier: "same-cost-model-id" }]
      ]);
      const agent = createAgent("SameCostAgent", ["Claude Sonnet (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "SameCostAgent" },
        toolCallId: "call-2",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "SameCostAgent",
        prompt: "test",
        modelName: "Claude Sonnet"
      });
    });
    test("uses subagent model when it has lower multiplier", async () => {
      const mainMeta = createMetadata("O3 Pro", 50);
      const cheapMeta = createMetadata("GPT-4o Mini", 0.25);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["cheap-model-id", cheapMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["GPT-4o Mini (TestVendor)", { metadata: cheapMeta, identifier: "cheap-model-id" }]
      ]);
      const agent = createAgent("CheapAgent", ["GPT-4o Mini (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "CheapAgent" },
        toolCallId: "call-3",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "CheapAgent",
        prompt: "test",
        modelName: "GPT-4o Mini"
      });
    });
    test("uses subagent model when main model has no multiplier", async () => {
      const mainMeta = createMetadata("Unknown Model", void 0);
      const subMeta = createMetadata("O3 Pro", 50);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["sub-model-id", subMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["O3 Pro (TestVendor)", { metadata: subMeta, identifier: "sub-model-id" }]
      ]);
      const agent = createAgent("SubAgent", ["O3 Pro (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "SubAgent" },
        toolCallId: "call-4",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "SubAgent",
        prompt: "test",
        modelName: "O3 Pro"
      });
    });
    test("uses subagent model when subagent model has no multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const subMeta = createMetadata("Custom Model", void 0);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["sub-model-id", subMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Custom Model (TestVendor)", { metadata: subMeta, identifier: "sub-model-id" }]
      ]);
      const agent = createAgent("CustomAgent", ["Custom Model (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "CustomAgent" },
        toolCallId: "call-5",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "CustomAgent",
        prompt: "test",
        modelName: "Custom Model"
      });
    });
    test("uses main model when no subagent is specified", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const models = /* @__PURE__ */ new Map([["main-model-id", mainMeta]]);
      const tool = createTool({ models });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task" },
        toolCallId: "call-6",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: void 0,
        prompt: "test",
        modelName: "GPT-4o"
      });
    });
    test("uses main model when subagent has no model configured", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const models = /* @__PURE__ */ new Map([["main-model-id", mainMeta]]);
      const agent = createAgent("NoModelAgent", void 0);
      const tool = createTool({ models, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "NoModelAgent" },
        toolCallId: "call-7",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "NoModelAgent",
        prompt: "test",
        modelName: "GPT-4o"
      });
    });
    test("skips Copilot fallback models when main model is BYOK and inherits the main model", async () => {
      const mainMeta = createMetadata("Claude Sonnet BYOK", void 0, "anthropic");
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["main-byok-id", mainMeta],
        ["copilot-fallback-id", copilotFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-1",
        modelId: "main-byok-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Claude Sonnet BYOK"
      });
    });
    test("skips Copilot fallback but uses a non-Copilot fallback when main model is BYOK", async () => {
      const mainMeta = createMetadata("Claude Sonnet BYOK", void 0, "anthropic");
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const byokFallback = createMetadata("Ollama Llama", void 0, "ollama");
      const models = /* @__PURE__ */ new Map([
        ["main-byok-id", mainMeta],
        ["copilot-fallback-id", copilotFallback],
        ["byok-fallback-id", byokFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }],
        ["Ollama Llama (ollama)", { metadata: byokFallback, identifier: "byok-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)", "Ollama Llama (ollama)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-2",
        modelId: "main-byok-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Ollama Llama"
      });
    });
    test("uses the Copilot fallback model when the main model is also Copilot", async () => {
      const mainMeta = createMetadata("Copilot GPT-4o", void 0, COPILOT_VENDOR_ID);
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["main-copilot-id", mainMeta],
        ["copilot-fallback-id", copilotFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-3",
        modelId: "main-copilot-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Copilot Haiku"
      });
    });
    test("uses the Copilot fallback model when no main model is set", async () => {
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["copilot-fallback-id", copilotFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-4",
        modelId: void 0,
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Copilot Haiku"
      });
    });
    test("honors a user-authored agent's explicit Copilot model even when main model is BYOK", async () => {
      const mainMeta = createMetadata("Claude Sonnet BYOK", void 0, "anthropic");
      const copilotPinned = createMetadata("Copilot Sonnet", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["main-byok-id", mainMeta],
        ["copilot-pinned-id", copilotPinned]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Sonnet (copilot)", { metadata: copilotPinned, identifier: "copilot-pinned-id" }]
      ]);
      const agent = createAgent("MyAgent", ["Copilot Sonnet (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "MyAgent" },
        toolCallId: "byok-call-5",
        modelId: "main-byok-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "MyAgent",
        prompt: "test",
        modelName: "Copilot Sonnet"
      });
    });
  });
  suite("explicit model parameter", () => {
    function createMetadata(name, multiplierNumeric) {
      return {
        extension: new ExtensionIdentifier("test.extension"),
        name,
        id: name.toLowerCase().replace(/\s+/g, "-"),
        vendor: "TestVendor",
        version: "1.0",
        family: "test",
        maxInputTokens: 128e3,
        maxOutputTokens: 8192,
        isDefaultForLocation: {},
        multiplierNumeric,
        capabilities: { toolCalling: true }
      };
    }
    function createTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      if (opts.customAgents) {
        promptsService.setCustomModes(opts.customAgents);
      }
      const mockLanguageModelsService = {
        getLanguageModelIds() {
          return Array.from(opts.models.keys());
        },
        lookupLanguageModel(modelId) {
          return opts.models.get(modelId);
        },
        lookupLanguageModelByQualifiedName(qualifiedName) {
          return opts.qualifiedNameMap?.get(qualifiedName);
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        mockLanguageModelsService,
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      return tool;
    }
    function createAgent(name, modelQualifiedNames) {
      const id = `file:///test/${name}.md`;
      return {
        id,
        uri: URI.parse(id),
        name,
        description: `Agent ${name}`,
        tools: ["tool1"],
        model: modelQualifiedNames,
        agentInstructions: { content: "test", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        target: Target.Undefined,
        visibility: { userInvocable: true, agentInvocable: true },
        enabled: true
      };
    }
    test("model property is included in tool schema without enum", () => {
      const models = /* @__PURE__ */ new Map([
        ["model-1", createMetadata("GPT-4o")],
        ["model-2", createMetadata("Claude Sonnet")]
      ]);
      const tool = createTool({ models });
      const toolData = tool.getToolData();
      assert.ok(toolData.inputSchema?.properties?.model, "model should be in schema");
      assert.strictEqual(toolData.inputSchema?.properties?.model?.type, "string");
      assert.strictEqual(toolData.inputSchema?.properties?.model?.enum, void 0, "model should not have an enum");
    });
    test("resolves explicit model parameter without agentName", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const explicitMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["explicit-model-id", explicitMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Claude Sonnet (TestVendor)", { metadata: explicitMeta, identifier: "explicit-model-id" }]
      ]);
      const tool = createTool({ models, qualifiedNameMap });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", model: "Claude Sonnet (TestVendor)" },
        toolCallId: "model-call-1",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: void 0,
        prompt: "test",
        modelName: "Claude Sonnet"
      });
    });
    test("explicit model overrides agent configured model", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const agentMeta = createMetadata("Agent Model", 1);
      const explicitMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["agent-model-id", agentMeta],
        ["explicit-model-id", explicitMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Agent Model (TestVendor)", { metadata: agentMeta, identifier: "agent-model-id" }],
        ["Claude Sonnet (TestVendor)", { metadata: explicitMeta, identifier: "explicit-model-id" }]
      ]);
      const agent = createAgent("MyAgent", ["Agent Model (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "MyAgent", model: "Claude Sonnet (TestVendor)" },
        toolCallId: "model-call-2",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "MyAgent",
        prompt: "test",
        modelName: "Claude Sonnet"
      });
    });
    test("throws error when explicit model has higher multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const expensiveMeta = createMetadata("O3 Pro", 50);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["expensive-model-id", expensiveMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["O3 Pro (TestVendor)", { metadata: expensiveMeta, identifier: "expensive-model-id" }]
      ]);
      const tool = createTool({ models, qualifiedNameMap });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", model: "O3 Pro (TestVendor)" },
          toolCallId: "model-call-3",
          modelId: "main-model-id",
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("O3 Pro"));
          assert.ok(err.message.includes("exceeds"));
          assert.ok(err.message.includes("cost tier"));
          assert.ok(err.message.includes("Unavailable"));
          return true;
        }
      );
    });
    test("throws error with available models when explicit model is not found", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const otherMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["other-model-id", otherMeta]
      ]);
      const tool = createTool({ models, qualifiedNameMap: /* @__PURE__ */ new Map() });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", model: "Nonexistent Model (Vendor)" },
          toolCallId: "model-call-4",
          modelId: "main-model-id",
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("Nonexistent Model (Vendor)"));
          assert.ok(err.message.includes("not found"));
          assert.ok(err.message.includes("Available models:"));
          assert.ok(err.message.includes("GPT-4o (TestVendor)"));
          assert.ok(err.message.includes("Claude Sonnet (TestVendor)"));
          return true;
        }
      );
    });
    test("throws error with no models message when no models are available", async () => {
      const tool = createTool({ models: /* @__PURE__ */ new Map(), qualifiedNameMap: /* @__PURE__ */ new Map() });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", model: "Nonexistent Model (Vendor)" },
          toolCallId: "model-call-5",
          modelId: void 0,
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("Nonexistent Model (Vendor)"));
          assert.ok(err.message.includes("not found"));
          assert.ok(err.message.includes("No models available"));
          return true;
        }
      );
    });
  });
  suite("nested subagent depth tracking", () => {
    let callIdCounter = 0;
    function createInvokableTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const configService = new TestConfigurationService({
        [ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: opts.allowInvocationsFromSubagents
      });
      const promptsService = new MockPromptsService();
      const mockChatAgentService = {
        getDefaultAgent() {
          return { id: "default-agent" };
        },
        async invokeAgent(_id, request, _progress, _history, _token) {
          opts.capturedRequests.push(request);
          return {};
        }
      };
      const mockChatService = {
        getSession() {
          return {
            getRequests: () => [{
              id: "req-1",
              modeInfo: opts.currentModeInstructions ? {
                kind: void 0,
                isBuiltin: false,
                modeInstructions: opts.currentModeInstructions,
                telemetryModeId: "custom",
                applyCodeBlockSuggestionId: void 0
              } : void 0
            }],
            acceptResponseProgress: () => {
            }
          };
        }
      };
      const mockInstantiationService = {
        createInstance(..._args) {
          return { collect: async () => {
          } };
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        mockChatAgentService,
        mockChatService,
        mockToolsService,
        {},
        new NullLogService(),
        configService,
        promptsService,
        mockInstantiationService,
        {}
      ));
      return { tool, mockChatAgentService };
    }
    function createInvocation(sessionUri, userSelectedTools) {
      return {
        callId: `call-${++callIdCounter}`,
        toolId: "runSubagent",
        parameters: { prompt: "do something", description: "test" },
        context: { sessionResource: sessionUri },
        userSelectedTools: userSelectedTools ?? { runSubagent: true }
      };
    }
    const countTokens = async () => 0;
    const noProgress = { report() {
    } };
    test("disables runSubagent tool when nesting is disabled", async () => {
      const capturedRequests = [];
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests });
      const sessionUri = URI.parse("test://session/depth0");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].userSelectedTools?.["runSubagent"], false);
    });
    test("enables runSubagent tool at depth 0 when nesting is enabled", async () => {
      const capturedRequests = [];
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
      const sessionUri = URI.parse("test://session/depth-enabled");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].userSelectedTools?.["runSubagent"], true);
    });
    test("disables runSubagent tool when depth reaches hard limit", async () => {
      const capturedRequests = [];
      const sessionUri = URI.parse("test://session/depth-limit");
      const { tool, mockChatAgentService } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
      capturedRequests.length = 0;
      let nestedInvocations = 0;
      mockChatAgentService.invokeAgent = async (_id, request) => {
        capturedRequests.push(request);
        if (nestedInvocations++ < RUN_SUBAGENT_MAX_NESTING_DEPTH + 1) {
          await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
        }
        return {};
      };
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.ok(capturedRequests.length >= 2);
      const enabledFlags = capturedRequests.map((r) => r.userSelectedTools?.["runSubagent"]);
      assert.strictEqual(enabledFlags[0], true);
      assert.strictEqual(enabledFlags[1], true);
      assert.strictEqual(enabledFlags[RUN_SUBAGENT_MAX_NESTING_DEPTH], false);
    });
    test("depth is decremented after invoke completes", async () => {
      const capturedRequests = [];
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
      const sessionUri = URI.parse("test://session/depth-decrement");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 2);
      assert.strictEqual(capturedRequests[0].userSelectedTools?.["runSubagent"], true);
      assert.strictEqual(capturedRequests[1].userSelectedTools?.["runSubagent"], true);
    });
    test("inherits the current agent instructions when agentName is omitted", async () => {
      const capturedRequests = [];
      const currentModeInstructions = { name: "CurrentAgent", content: "Current agent instructions", toolReferences: [] };
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests, currentModeInstructions });
      const sessionUri = URI.parse("test://session/current-agent");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].subAgentName, "CurrentAgent");
      assert.deepStrictEqual(capturedRequests[0].modeInstructions, currentModeInstructions);
    });
  });
  suite("subagent credits", () => {
    let creditsCallIdCounter = 0;
    function createCreditTool(usageParts, result = {}) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const configService = new TestConfigurationService();
      const promptsService = new MockPromptsService();
      const parentCredits = [];
      const mockChatAgentService = {
        getDefaultAgent() {
          return { id: "default-agent" };
        },
        async invokeAgent(_id, _request, progress) {
          progress(usageParts);
          return result;
        }
      };
      const mockChatService = {
        getSession() {
          return {
            getRequests: () => [{
              id: "req-1",
              response: {
                setSubagentCopilotCredits: (subagentCallId, copilotCredits) => parentCredits.push({ subagentCallId, copilotCredits })
              }
            }],
            acceptResponseProgress: () => {
            }
          };
        }
      };
      const mockInstantiationService = {
        createInstance(..._args) {
          return { collect: async () => {
          } };
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        mockChatAgentService,
        mockChatService,
        mockToolsService,
        {},
        new NullLogService(),
        configService,
        promptsService,
        mockInstantiationService,
        {}
      ));
      return { tool, parentCredits };
    }
    function createSubagentInvocation(chatStreamToolCallId) {
      return {
        callId: `credits-call-${++creditsCallIdCounter}`,
        chatStreamToolCallId,
        toolId: "runSubagent",
        parameters: { prompt: "do something", description: "test" },
        context: { sessionResource: URI.parse("test://session/credits") },
        userSelectedTools: { runSubagent: true },
        toolSpecificData: { kind: "subagent", description: "test" }
      };
    }
    const countTokens = async () => 0;
    const noProgress = { report() {
    } };
    test("writes the running credit total onto the subagent toolSpecificData", async () => {
      const { tool, parentCredits } = createCreditTool([
        { kind: "usage", promptTokens: 10, completionTokens: 5, copilotCredits: 2 },
        { kind: "usage", promptTokens: 20, completionTokens: 8, copilotCredits: 5 },
        { kind: "usage", promptTokens: 20, completionTokens: 8, copilotCredits: 3 }
      ]);
      const invocation = createSubagentInvocation("stream-tool-call");
      await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
      assert.deepStrictEqual({
        toolCredits: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0,
        parentCredits
      }, {
        toolCredits: 5,
        parentCredits: [{ subagentCallId: invocation.callId, copilotCredits: 5 }]
      });
    });
    test("records credits when the subagent fails after reporting usage", async () => {
      const { tool, parentCredits } = createCreditTool(
        [{ kind: "usage", promptTokens: 10, completionTokens: 5, copilotCredits: 3 }],
        { errorDetails: { message: "failed" } }
      );
      const invocation = createSubagentInvocation();
      await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
      assert.deepStrictEqual({
        toolCredits: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0,
        parentCredits
      }, {
        toolCredits: 3,
        parentCredits: [{ subagentCallId: invocation.callId, copilotCredits: 3 }]
      });
    });
    test("leaves credits unset when no usage is reported", async () => {
      const { tool } = createCreditTool([]);
      const invocation = createSubagentInvocation();
      await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3J1blN1YmFnZW50VG9vbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSVU5fU1VCQUdFTlRfTUFYX05FU1RJTkdfREVQVEgsIFJ1blN1YmFnZW50VG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvcnVuU3ViYWdlbnRUb29sLmpzJztcbmltcG9ydCB7IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vbW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudEhpc3RvcnlFbnRyeSwgSUNoYXRBZ2VudFJlcXVlc3QsIElDaGF0QWdlbnRSZXN1bHQsIElDaGF0QWdlbnRTZXJ2aWNlLCBVc2VyU2VsZWN0ZWRUb29scyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9WRU5ET1JfSUQsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tQWdlbnQsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgTW9ja1Byb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvbXB0U3ludGF4L3NlcnZpY2UvbW9ja1Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElUb29sSW52b2NhdGlvbiwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcblxuc3VpdGUoJ1J1blN1YmFnZW50VG9vbCcsICgpID0+IHtcblx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3Jlc3VsdFRleHQgdHJpbW1pbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgndHJpbXMgbGVhZGluZyBlbXB0eSBjb2RlYmxvY2tzIChgYGBcXFxcbmBgYCkgZnJvbSByZXN1bHQnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3RzIHRoZSByZWdleDogL15cXG4qYGBgXFxuK2BgYFxcbiovZ1xuXHRcdFx0Y29uc3QgdGVzdENhc2VzID0gW1xuXHRcdFx0XHR7IGlucHV0OiAnYGBgXFxuYGBgXFxuQWN0dWFsIGNvbnRlbnQnLCBleHBlY3RlZDogJ0FjdHVhbCBjb250ZW50JyB9LFxuXHRcdFx0XHR7IGlucHV0OiAnXFxuYGBgXFxuYGBgXFxuQWN0dWFsIGNvbnRlbnQnLCBleHBlY3RlZDogJ0FjdHVhbCBjb250ZW50JyB9LFxuXHRcdFx0XHR7IGlucHV0OiAnXFxuXFxuYGBgXFxuXFxuYGBgXFxuXFxuQWN0dWFsIGNvbnRlbnQnLCBleHBlY3RlZDogJ0FjdHVhbCBjb250ZW50JyB9LFxuXHRcdFx0XHR7IGlucHV0OiAnYGBgXFxuYGBgXFxuYGBgXFxuYGBgXFxuQWN0dWFsIGNvbnRlbnQnLCBleHBlY3RlZDogJ2BgYFxcbmBgYFxcbkFjdHVhbCBjb250ZW50JyB9LCAvLyBPbmx5IHRyaW1zIGxlYWRpbmdcblx0XHRcdFx0eyBpbnB1dDogJ05vIGNvZGVibG9jayBoZXJlJywgZXhwZWN0ZWQ6ICdObyBjb2RlYmxvY2sgaGVyZScgfSxcblx0XHRcdFx0eyBpbnB1dDogJ2BgYFxcbmBgYFxcbicsIGV4cGVjdGVkOiAnJyB9LFxuXHRcdFx0XHR7IGlucHV0OiAnJywgZXhwZWN0ZWQ6ICcnIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHsgaW5wdXQsIGV4cGVjdGVkIH0gb2YgdGVzdENhc2VzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGlucHV0LnJlcGxhY2UoL15cXG4qYGBgXFxuK2BgYFxcbiovZywgJycpLnRyaW0oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQsIGBGYWlsZWQgZm9yIGlucHV0OiAke0pTT04uc3RyaW5naWZ5KGlucHV0KX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3ByZXBhcmVUb29sSW52b2NhdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGNvcnJlY3QgdG9vbFNwZWNpZmljRGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblxuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBjdXN0b21Nb2RlOiBJQ3VzdG9tQWdlbnQgPSB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy90ZXN0L2N1c3RvbS1hZ2VudC5tZCcsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvY3VzdG9tLWFnZW50Lm1kJyksXG5cdFx0XHRcdG5hbWU6ICdDdXN0b21BZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSB0ZXN0IGN1c3RvbSBhZ2VudCcsXG5cdFx0XHRcdHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJ10sXG5cdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICdDdXN0b20gYWdlbnQgYm9keScsIHRvb2xSZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRwcm9tcHRzU2VydmljZS5zZXRDdXN0b21Nb2RlcyhbY3VzdG9tTW9kZV0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUnVuU3ViYWdlbnRUb29sKFxuXHRcdFx0XHR7fSBhcyBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRcdFx0e30gYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0XHRwcm9tcHQ6ICdUZXN0IHByb21wdCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3QgdGFzaycsXG5cdFx0XHRcdFx0XHRhZ2VudE5hbWU6ICdDdXN0b21BZ2VudCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGVzdC1jYWxsLTEnLFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmludm9jYXRpb25NZXNzYWdlLCAnVGVzdCB0YXNrJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnQ3VzdG9tQWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICdUZXN0IHByb21wdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVUb29sKG9wdHM/OiB7IGN1c3RvbUFnZW50cz86IElDdXN0b21BZ2VudFtdIH0pIHtcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXHRcdFx0aWYgKG9wdHM/LmN1c3RvbUFnZW50cykge1xuXHRcdFx0XHRwcm9tcHRzU2VydmljZS5zZXRDdXN0b21Nb2RlcyhvcHRzLmN1c3RvbUFnZW50cyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRvb2wgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TdWJhZ2VudFRvb2woXG5cdFx0XHRcdHt9IGFzIElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHRcdG1vY2tUb29sc1NlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIHRvb2w7XG5cdFx0fVxuXG5cdFx0dGVzdCgncGFzc2VzIHRocm91Z2ggdW5rbm93biBhZ2VudE5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAnVGVzdCBwcm9tcHQnLCBkZXNjcmlwdGlvbjogJ1Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ05vbkV4aXN0ZW50QWdlbnQnIH0sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3Rlc3QtY2FsbC11bmtub3duJyxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ05vbkV4aXN0ZW50QWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICdUZXN0IHByb21wdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRUb29sRGF0YScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGJhc2ljIHRvb2wgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXG5cdFx0XHRjb25zdCB0b29sID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUnVuU3ViYWdlbnRUb29sKFxuXHRcdFx0XHR7fSBhcyBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRcdFx0e30gYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEgPSB0b29sLmdldFRvb2xEYXRhKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sRGF0YS5pZCwgJ3J1blN1YmFnZW50Jyk7XG5cdFx0XHRhc3NlcnQub2sodG9vbERhdGEuaW5wdXRTY2hlbWEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xEYXRhLmlucHV0U2NoZW1hLnByb3BlcnRpZXM/LnByb21wdCk7XG5cdFx0XHRhc3NlcnQub2sodG9vbERhdGEuaW5wdXRTY2hlbWEucHJvcGVydGllcz8uZGVzY3JpcHRpb24pO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xEYXRhLmlucHV0U2NoZW1hLnByb3BlcnRpZXM/LmFnZW50TmFtZSwgJ2FnZW50TmFtZSBzaG91bGQgYmUgaW4gc2NoZW1hIHByb3BlcnRpZXMnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbERhdGEuaW5wdXRTY2hlbWEucmVxdWlyZWQsIFsncHJvbXB0JywgJ2Rlc2NyaXB0aW9uJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnb25EaWRJbnZva2VUb29sIGV2ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ21vY2sgc2VydmljZSBmaXJlcyBvbkRpZEludm9rZVRvb2wgZXZlbnRzIHdpdGggY29ycmVjdCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgcmVjZWl2ZWRFdmVudHM6IHsgdG9vbElkOiBzdHJpbmc7IHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkOyByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgc3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblxuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2NrVG9vbHNTZXJ2aWNlLm9uRGlkSW52b2tlVG9vbChlID0+IHtcblx0XHRcdFx0cmVjZWl2ZWRFdmVudHMucHVzaChlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bW9ja1Rvb2xzU2VydmljZS5maXJlT25EaWRJbnZva2VUb29sKHtcblx0XHRcdFx0dG9vbElkOiAndGVzdC10b29sJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEyMycsXG5cdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtNDU2Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWRFdmVudHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWRFdmVudHNbMF0sIHtcblx0XHRcdFx0dG9vbElkOiAndGVzdC10b29sJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEyMycsXG5cdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtNDU2Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZlbnRzIHdpdGggZGlmZmVyZW50IHN1YmFnZW50SW52b2NhdGlvbklkIGFyZSBkaXN0aW5ndWlzaGFibGUnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3RzIHRoZSBmaWx0ZXJpbmcgbG9naWMgdXNlZCBpbiBSdW5TdWJhZ2VudFRvb2wuaW52b2tlKClcblx0XHRcdC8vIFRoZSB0b29sIHN1YnNjcmliZXMgdG8gb25EaWRJbnZva2VUb29sIGFuZCBjaGVja3MgaWYgZS5zdWJhZ2VudEludm9jYXRpb25JZCBtYXRjaGVzIGl0cyBvd24gY2FsbElkXG5cdFx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0YXJnZXRTdWJhZ2VudElkID0gJ3RhcmdldC1zdWJhZ2VudCc7XG5cblx0XHRcdGNvbnN0IG1hdGNoaW5nRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2NrVG9vbHNTZXJ2aWNlLm9uRGlkSW52b2tlVG9vbChlID0+IHtcblx0XHRcdFx0aWYgKGUuc3ViYWdlbnRJbnZvY2F0aW9uSWQgPT09IHRhcmdldFN1YmFnZW50SWQpIHtcblx0XHRcdFx0XHRtYXRjaGluZ0V2ZW50cy5wdXNoKGUudG9vbElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBGaXJlIGV2ZW50cyB3aXRoIGRpZmZlcmVudCBzdWJhZ2VudEludm9jYXRpb25JZHNcblx0XHRcdG1vY2tUb29sc1NlcnZpY2UuZmlyZU9uRGlkSW52b2tlVG9vbCh7XG5cdFx0XHRcdHRvb2xJZDogJ3VucmVsYXRlZC10b29sJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogJ2RpZmZlcmVudC1zdWJhZ2VudCcsXG5cdFx0XHR9KTtcblx0XHRcdG1vY2tUb29sc1NlcnZpY2UuZmlyZU9uRGlkSW52b2tlVG9vbCh7XG5cdFx0XHRcdHRvb2xJZDogJ21hdGNoaW5nLXRvb2wnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiB0YXJnZXRTdWJhZ2VudElkLFxuXHRcdFx0fSk7XG5cdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLmZpcmVPbkRpZEludm9rZVRvb2woe1xuXHRcdFx0XHR0b29sSWQ6ICdhbm90aGVyLXVucmVsYXRlZC10b29sJyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE9ubHkgdGhlIG1hdGNoaW5nIGV2ZW50IHNob3VsZCBiZSBjYXB0dXJlZFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXRjaGluZ0V2ZW50cywgWydtYXRjaGluZy10b29sJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbW9kZWwgZmFsbGJhY2sgYmVoYXZpb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgQlVJTFRJTl9DSEFUX0VYVEVOU0lPTl9JRCA9ICdnaXRodWIuY29waWxvdC1jaGF0Jztcblx0XHRjb25zdCBidWlsdGluUHJvZHVjdFNlcnZpY2UgPSB7IGRlZmF1bHRDaGF0QWdlbnQ6IHsgY2hhdEV4dGVuc2lvbklkOiBCVUlMVElOX0NIQVRfRVhURU5TSU9OX0lEIH0gfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVNZXRhZGF0YShuYW1lOiBzdHJpbmcsIG11bHRpcGxpZXJOdW1lcmljPzogbnVtYmVyLCB2ZW5kb3I6IHN0cmluZyA9ICdUZXN0VmVuZG9yJyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0ZW5zaW9uJyksXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdGlkOiBuYW1lLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXFxzKy9nLCAnLScpLFxuXHRcdFx0XHR2ZW5kb3IsXG5cdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRmYW1pbHk6ICd0ZXN0Jyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEyODAwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA4MTkyLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdG11bHRpcGxpZXJOdW1lcmljLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUgfSxcblx0XHRcdFx0aXNCWU9LOiB2ZW5kb3IgIT09IENPUElMT1RfVkVORE9SX0lELFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVUb29sKG9wdHM6IHtcblx0XHRcdG1vZGVsczogTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+O1xuXHRcdFx0cXVhbGlmaWVkTmFtZU1hcD86IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcj47XG5cdFx0XHRjdXN0b21BZ2VudHM/OiBJQ3VzdG9tQWdlbnRbXTtcblx0XHR9KSB7XG5cdFx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG5ldyBNb2NrUHJvbXB0c1NlcnZpY2UoKTtcblx0XHRcdGlmIChvcHRzLmN1c3RvbUFnZW50cykge1xuXHRcdFx0XHRwcm9tcHRzU2VydmljZS5zZXRDdXN0b21Nb2RlcyhvcHRzLmN1c3RvbUFnZW50cyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2U6IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4gPSB7XG5cdFx0XHRcdGdldExhbmd1YWdlTW9kZWxJZHMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEFycmF5LmZyb20ob3B0cy5tb2RlbHMua2V5cygpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkOiBzdHJpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3B0cy5tb2RlbHMuZ2V0KG1vZGVsSWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKHF1YWxpZmllZE5hbWU6IHN0cmluZykge1xuXHRcdFx0XHRcdHJldHVybiBvcHRzLnF1YWxpZmllZE5hbWVNYXA/LmdldChxdWFsaWZpZWROYW1lKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2wgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TdWJhZ2VudFRvb2woXG5cdFx0XHRcdHt9IGFzIElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHRcdG1vY2tUb29sc1NlcnZpY2UsXG5cdFx0XHRcdG1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UgYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0YnVpbHRpblByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cblx0XHRcdHJldHVybiB0b29sO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUFnZW50KG5hbWU6IHN0cmluZywgbW9kZWxRdWFsaWZpZWROYW1lcz86IHN0cmluZ1tdKTogSUN1c3RvbUFnZW50IHtcblx0XHRcdGNvbnN0IGlkID0gYGZpbGU6Ly8vdGVzdC8ke25hbWV9Lm1kYDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGlkKSxcblx0XHRcdFx0aWQsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgQWdlbnQgJHtuYW1lfWAsXG5cdFx0XHRcdHRvb2xzOiBbJ3Rvb2wxJ10sXG5cdFx0XHRcdG1vZGVsOiBtb2RlbFF1YWxpZmllZE5hbWVzLFxuXHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczogeyBjb250ZW50OiAndGVzdCcsIHRvb2xSZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQSBidWlsdC1pbiAoZXh0ZW5zaW9uLXNoaXBwZWQpIGFnZW50IHN1Y2ggYXMgRXhwbG9yZSwgd2hvc2UgbW9kZWwgbGlzdCBpcyBhIGN1cmF0ZWQgZmFsbGJhY2sgbGlzdC5cblx0XHRmdW5jdGlvbiBjcmVhdGVCdWlsdGluQWdlbnQobmFtZTogc3RyaW5nLCBtb2RlbFF1YWxpZmllZE5hbWVzPzogc3RyaW5nW10pOiBJQ3VzdG9tQWdlbnQge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uY3JlYXRlQWdlbnQobmFtZSwgbW9kZWxRdWFsaWZpZWROYW1lcyksXG5cdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihCVUlMVElOX0NIQVRfRVhURU5TSU9OX0lEKSB9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCd0aHJvd3MgZXJyb3Igd2hlbiBzdWJhZ2VudCBtb2RlbCBoYXMgaGlnaGVyIG11bHRpcGxpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IGV4cGVuc2l2ZU1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnTzMgUHJvJywgNTApO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0WydleHBlbnNpdmUtbW9kZWwtaWQnLCBleHBlbnNpdmVNZXRhXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ08zIFBybyAoVGVzdFZlbmRvciknLCB7IG1ldGFkYXRhOiBleHBlbnNpdmVNZXRhLCBpZGVudGlmaWVyOiAnZXhwZW5zaXZlLW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdFeHBlbnNpdmVBZ2VudCcsIFsnTzMgUHJvIChUZXN0VmVuZG9yKSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdFeHBlbnNpdmVBZ2VudCcgfSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC0xJyxcblx0XHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0KGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ08zIFBybycpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ2V4Y2VlZHMnKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdjb3N0IHRpZXInKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdVbmF2YWlsYWJsZScpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgc3ViYWdlbnQgbW9kZWwgd2hlbiBpdCBoYXMgZXF1YWwgbXVsdGlwbGllcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3Qgc2FtZUNvc3RNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQnLCAxKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnc2FtZS1jb3N0LW1vZGVsLWlkJywgc2FtZUNvc3RNZXRhXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0NsYXVkZSBTb25uZXQgKFRlc3RWZW5kb3IpJywgeyBtZXRhZGF0YTogc2FtZUNvc3RNZXRhLCBpZGVudGlmaWVyOiAnc2FtZS1jb3N0LW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdTYW1lQ29zdEFnZW50JywgWydDbGF1ZGUgU29ubmV0IChUZXN0VmVuZG9yKSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdTYW1lQ29zdEFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC0yJyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tbW9kZWwtaWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnU2FtZUNvc3RBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDbGF1ZGUgU29ubmV0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBzdWJhZ2VudCBtb2RlbCB3aGVuIGl0IGhhcyBsb3dlciBtdWx0aXBsaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFpbk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnTzMgUHJvJywgNTApO1xuXHRcdFx0Y29uc3QgY2hlYXBNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00byBNaW5pJywgMC4yNSk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdLFxuXHRcdFx0XHRbJ2NoZWFwLW1vZGVsLWlkJywgY2hlYXBNZXRhXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0dQVC00byBNaW5pIChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IGNoZWFwTWV0YSwgaWRlbnRpZmllcjogJ2NoZWFwLW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdDaGVhcEFnZW50JywgWydHUFQtNG8gTWluaSAoVGVzdFZlbmRvciknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnQ2hlYXBBZ2VudCcgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtMycsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0NoZWFwQWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICd0ZXN0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnR1BULTRvIE1pbmknLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHN1YmFnZW50IG1vZGVsIHdoZW4gbWFpbiBtb2RlbCBoYXMgbm8gbXVsdGlwbGllcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ1Vua25vd24gTW9kZWwnLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3ViTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdPMyBQcm8nLCA1MCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdLFxuXHRcdFx0XHRbJ3N1Yi1tb2RlbC1pZCcsIHN1Yk1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnTzMgUHJvIChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IHN1Yk1ldGEsIGlkZW50aWZpZXI6ICdzdWItbW9kZWwtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoJ1N1YkFnZW50JywgWydPMyBQcm8gKFRlc3RWZW5kb3IpJ10pO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ1N1YkFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC00Jyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tbW9kZWwtaWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHQvLyBObyBmYWxsYmFjayB3aGVuIG1haW4gbW9kZWwncyBtdWx0aXBsaWVyIGlzIHVua25vd25cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdTdWJBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdPMyBQcm8nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHN1YmFnZW50IG1vZGVsIHdoZW4gc3ViYWdlbnQgbW9kZWwgaGFzIG5vIG11bHRpcGxpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IHN1Yk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnQ3VzdG9tIE1vZGVsJywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnc3ViLW1vZGVsLWlkJywgc3ViTWV0YV0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydDdXN0b20gTW9kZWwgKFRlc3RWZW5kb3IpJywgeyBtZXRhZGF0YTogc3ViTWV0YSwgaWRlbnRpZmllcjogJ3N1Yi1tb2RlbC1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudCgnQ3VzdG9tQWdlbnQnLCBbJ0N1c3RvbSBNb2RlbCAoVGVzdFZlbmRvciknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnQ3VzdG9tQWdlbnQnIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTUnLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdC8vIE5vIGZhbGxiYWNrIHdoZW4gc3ViYWdlbnQgbW9kZWwncyBtdWx0aXBsaWVyIGlzIHVua25vd25cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdDdXN0b21BZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDdXN0b20gTW9kZWwnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIG1haW4gbW9kZWwgd2hlbiBubyBzdWJhZ2VudCBpcyBzcGVjaWZpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1snbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXV0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscyB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtNicsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcm9tcHQ6ICd0ZXN0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnR1BULTRvJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBtYWluIG1vZGVsIHdoZW4gc3ViYWdlbnQgaGFzIG5vIG1vZGVsIGNvbmZpZ3VyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1snbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXV0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdOb01vZGVsQWdlbnQnLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ05vTW9kZWxBZ2VudCcgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtNycsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ05vTW9kZWxBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdHUFQtNG8nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBDb3BpbG90IGZhbGxiYWNrIG1vZGVscyB3aGVuIG1haW4gbW9kZWwgaXMgQllPSyBhbmQgaW5oZXJpdHMgdGhlIG1haW4gbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdDbGF1ZGUgU29ubmV0IEJZT0snLCB1bmRlZmluZWQsICdhbnRocm9waWMnKTtcblx0XHRcdGNvbnN0IGNvcGlsb3RGYWxsYmFjayA9IGNyZWF0ZU1ldGFkYXRhKCdDb3BpbG90IEhhaWt1JywgdW5kZWZpbmVkLCBDT1BJTE9UX1ZFTkRPUl9JRCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLWJ5b2staWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnY29waWxvdC1mYWxsYmFjay1pZCcsIGNvcGlsb3RGYWxsYmFja10sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydDb3BpbG90IEhhaWt1IChjb3BpbG90KScsIHsgbWV0YWRhdGE6IGNvcGlsb3RGYWxsYmFjaywgaWRlbnRpZmllcjogJ2NvcGlsb3QtZmFsbGJhY2staWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQnVpbHRpbkFnZW50KCdFeHBsb3JlQWdlbnQnLCBbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJ10pO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ0V4cGxvcmVBZ2VudCcgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2J5b2stY2FsbC0xJyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tYnlvay1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdC8vIFRoZSBDb3BpbG90IGZhbGxiYWNrIGlzIHNraXBwZWQsIHNvIHRoZSBzdWJhZ2VudCBpbmhlcml0cyB0aGUgQllPSyBtYWluIG1vZGVsLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0V4cGxvcmVBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDbGF1ZGUgU29ubmV0IEJZT0snLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBDb3BpbG90IGZhbGxiYWNrIGJ1dCB1c2VzIGEgbm9uLUNvcGlsb3QgZmFsbGJhY2sgd2hlbiBtYWluIG1vZGVsIGlzIEJZT0snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdDbGF1ZGUgU29ubmV0IEJZT0snLCB1bmRlZmluZWQsICdhbnRocm9waWMnKTtcblx0XHRcdGNvbnN0IGNvcGlsb3RGYWxsYmFjayA9IGNyZWF0ZU1ldGFkYXRhKCdDb3BpbG90IEhhaWt1JywgdW5kZWZpbmVkLCBDT1BJTE9UX1ZFTkRPUl9JRCk7XG5cdFx0XHRjb25zdCBieW9rRmFsbGJhY2sgPSBjcmVhdGVNZXRhZGF0YSgnT2xsYW1hIExsYW1hJywgdW5kZWZpbmVkLCAnb2xsYW1hJyk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLWJ5b2staWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnY29waWxvdC1mYWxsYmFjay1pZCcsIGNvcGlsb3RGYWxsYmFja10sXG5cdFx0XHRcdFsnYnlvay1mYWxsYmFjay1pZCcsIGJ5b2tGYWxsYmFja10sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydDb3BpbG90IEhhaWt1IChjb3BpbG90KScsIHsgbWV0YWRhdGE6IGNvcGlsb3RGYWxsYmFjaywgaWRlbnRpZmllcjogJ2NvcGlsb3QtZmFsbGJhY2staWQnIH1dLFxuXHRcdFx0XHRbJ09sbGFtYSBMbGFtYSAob2xsYW1hKScsIHsgbWV0YWRhdGE6IGJ5b2tGYWxsYmFjaywgaWRlbnRpZmllcjogJ2J5b2stZmFsbGJhY2staWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIENvcGlsb3QgZmFsbGJhY2sgaXMgbGlzdGVkIGZpcnN0LCB0aGUgQllPSyBmYWxsYmFjayBzZWNvbmQuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUJ1aWx0aW5BZ2VudCgnRXhwbG9yZUFnZW50JywgWydDb3BpbG90IEhhaWt1IChjb3BpbG90KScsICdPbGxhbWEgTGxhbWEgKG9sbGFtYSknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnRXhwbG9yZUFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnYnlvay1jYWxsLTInLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1ieW9rLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0V4cGxvcmVBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdPbGxhbWEgTGxhbWEnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHRoZSBDb3BpbG90IGZhbGxiYWNrIG1vZGVsIHdoZW4gdGhlIG1haW4gbW9kZWwgaXMgYWxzbyBDb3BpbG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFpbk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnQ29waWxvdCBHUFQtNG8nLCB1bmRlZmluZWQsIENPUElMT1RfVkVORE9SX0lEKTtcblx0XHRcdGNvbnN0IGNvcGlsb3RGYWxsYmFjayA9IGNyZWF0ZU1ldGFkYXRhKCdDb3BpbG90IEhhaWt1JywgdW5kZWZpbmVkLCBDT1BJTE9UX1ZFTkRPUl9JRCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLWNvcGlsb3QtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnY29waWxvdC1mYWxsYmFjay1pZCcsIGNvcGlsb3RGYWxsYmFja10sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydDb3BpbG90IEhhaWt1IChjb3BpbG90KScsIHsgbWV0YWRhdGE6IGNvcGlsb3RGYWxsYmFjaywgaWRlbnRpZmllcjogJ2NvcGlsb3QtZmFsbGJhY2staWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQnVpbHRpbkFnZW50KCdFeHBsb3JlQWdlbnQnLCBbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJ10pO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ0V4cGxvcmVBZ2VudCcgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2J5b2stY2FsbC0zJyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tY29waWxvdC1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdFeHBsb3JlQWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICd0ZXN0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnQ29waWxvdCBIYWlrdScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIENvcGlsb3QgZmFsbGJhY2sgbW9kZWwgd2hlbiBubyBtYWluIG1vZGVsIGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvcGlsb3RGYWxsYmFjayA9IGNyZWF0ZU1ldGFkYXRhKCdDb3BpbG90IEhhaWt1JywgdW5kZWZpbmVkLCBDT1BJTE9UX1ZFTkRPUl9JRCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0Wydjb3BpbG90LWZhbGxiYWNrLWlkJywgY29waWxvdEZhbGxiYWNrXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJywgeyBtZXRhZGF0YTogY29waWxvdEZhbGxiYWNrLCBpZGVudGlmaWVyOiAnY29waWxvdC1mYWxsYmFjay1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVCdWlsdGluQWdlbnQoJ0V4cGxvcmVBZ2VudCcsIFsnQ29waWxvdCBIYWlrdSAoY29waWxvdCknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnRXhwbG9yZUFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnYnlvay1jYWxsLTQnLFxuXHRcdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdFeHBsb3JlQWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICd0ZXN0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnQ29waWxvdCBIYWlrdScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm9ycyBhIHVzZXItYXV0aG9yZWQgYWdlbnRcXCdzIGV4cGxpY2l0IENvcGlsb3QgbW9kZWwgZXZlbiB3aGVuIG1haW4gbW9kZWwgaXMgQllPSycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQgQllPSycsIHVuZGVmaW5lZCwgJ2FudGhyb3BpYycpO1xuXHRcdFx0Y29uc3QgY29waWxvdFBpbm5lZCA9IGNyZWF0ZU1ldGFkYXRhKCdDb3BpbG90IFNvbm5ldCcsIHVuZGVmaW5lZCwgQ09QSUxPVF9WRU5ET1JfSUQpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1ieW9rLWlkJywgbWFpbk1ldGFdLFxuXHRcdFx0XHRbJ2NvcGlsb3QtcGlubmVkLWlkJywgY29waWxvdFBpbm5lZF0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydDb3BpbG90IFNvbm5ldCAoY29waWxvdCknLCB7IG1ldGFkYXRhOiBjb3BpbG90UGlubmVkLCBpZGVudGlmaWVyOiAnY29waWxvdC1waW5uZWQtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIEEgdXNlci1hdXRob3JlZCAobG9jYWwpIGFnZW50IHRoYXQgZGVsaWJlcmF0ZWx5IHBpbnMgYSBDb3BpbG90IG1vZGVsIFx1MjAxNCBtdXN0IG5vdCBiZSBza2lwcGVkLlxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudCgnTXlBZ2VudCcsIFsnQ29waWxvdCBTb25uZXQgKGNvcGlsb3QpJ10pO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ015QWdlbnQnIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdieW9rLWNhbGwtNScsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLWJ5b2staWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnTXlBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDb3BpbG90IFNvbm5ldCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4cGxpY2l0IG1vZGVsIHBhcmFtZXRlcicsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjcmVhdGVNZXRhZGF0YShuYW1lOiBzdHJpbmcsIG11bHRpcGxpZXJOdW1lcmljPzogbnVtYmVyKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0aWQ6IG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXHMrL2csICctJyksXG5cdFx0XHRcdHZlbmRvcjogJ1Rlc3RWZW5kb3InLFxuXHRcdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdFx0ZmFtaWx5OiAndGVzdCcsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogODE5Mixcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0XHRtdWx0aXBsaWVyTnVtZXJpYyxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHRvb2xDYWxsaW5nOiB0cnVlIH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVRvb2wob3B0czoge1xuXHRcdFx0bW9kZWxzOiBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT47XG5cdFx0XHRxdWFsaWZpZWROYW1lTWFwPzogTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyPjtcblx0XHRcdGN1c3RvbUFnZW50cz86IElDdXN0b21BZ2VudFtdO1xuXHRcdH0pIHtcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXHRcdFx0aWYgKG9wdHMuY3VzdG9tQWdlbnRzKSB7XG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLnNldEN1c3RvbU1vZGVzKG9wdHMuY3VzdG9tQWdlbnRzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZTogUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPiA9IHtcblx0XHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gQXJyYXkuZnJvbShvcHRzLm1vZGVscy5rZXlzKCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQ6IHN0cmluZykge1xuXHRcdFx0XHRcdHJldHVybiBvcHRzLm1vZGVscy5nZXQobW9kZWxJZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9wdHMucXVhbGlmaWVkTmFtZU1hcD8uZ2V0KHF1YWxpZmllZE5hbWUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFJ1blN1YmFnZW50VG9vbChcblx0XHRcdFx0e30gYXMgSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElDaGF0U2VydmljZSxcblx0XHRcdFx0bW9ja1Rvb2xzU2VydmljZSxcblx0XHRcdFx0bW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZSBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0cmV0dXJuIHRvb2w7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQWdlbnQobmFtZTogc3RyaW5nLCBtb2RlbFF1YWxpZmllZE5hbWVzPzogc3RyaW5nW10pOiBJQ3VzdG9tQWdlbnQge1xuXHRcdFx0Y29uc3QgaWQgPSBgZmlsZTovLy90ZXN0LyR7bmFtZX0ubWRgO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGlkKSxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBBZ2VudCAke25hbWV9YCxcblx0XHRcdFx0dG9vbHM6IFsndG9vbDEnXSxcblx0XHRcdFx0bW9kZWw6IG1vZGVsUXVhbGlmaWVkTmFtZXMsXG5cdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICd0ZXN0JywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdtb2RlbCBwcm9wZXJ0eSBpcyBpbmNsdWRlZCBpbiB0b29sIHNjaGVtYSB3aXRob3V0IGVudW0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0Wydtb2RlbC0xJywgY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycpXSxcblx0XHRcdFx0Wydtb2RlbC0yJywgY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQnKV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMgfSk7XG5cdFx0XHRjb25zdCB0b29sRGF0YSA9IHRvb2wuZ2V0VG9vbERhdGEoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzPy5tb2RlbCwgJ21vZGVsIHNob3VsZCBiZSBpbiBzY2hlbWEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sRGF0YS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcz8ubW9kZWw/LnR5cGUsICdzdHJpbmcnKTtcblx0XHRcdC8vIE5vIGVudW0gc2hvdWxkIGJlIHByZXNlbnQgLSB2YWxpZGF0aW9uIGhhcHBlbnMgYXQgcnVudGltZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzPy5tb2RlbD8uZW51bSwgdW5kZWZpbmVkLCAnbW9kZWwgc2hvdWxkIG5vdCBoYXZlIGFuIGVudW0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGV4cGxpY2l0IG1vZGVsIHBhcmFtZXRlciB3aXRob3V0IGFnZW50TmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3QgZXhwbGljaXRNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQnLCAxKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnZXhwbGljaXQtbW9kZWwtaWQnLCBleHBsaWNpdE1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnQ2xhdWRlIFNvbm5ldCAoVGVzdFZlbmRvciknLCB7IG1ldGFkYXRhOiBleHBsaWNpdE1ldGEsIGlkZW50aWZpZXI6ICdleHBsaWNpdC1tb2RlbC1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBtb2RlbDogJ0NsYXVkZSBTb25uZXQgKFRlc3RWZW5kb3IpJyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnbW9kZWwtY2FsbC0xJyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tbW9kZWwtaWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDbGF1ZGUgU29ubmV0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhwbGljaXQgbW9kZWwgb3ZlcnJpZGVzIGFnZW50IGNvbmZpZ3VyZWQgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IGFnZW50TWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdBZ2VudCBNb2RlbCcsIDEpO1xuXHRcdFx0Y29uc3QgZXhwbGljaXRNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQnLCAxKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnYWdlbnQtbW9kZWwtaWQnLCBhZ2VudE1ldGFdLFxuXHRcdFx0XHRbJ2V4cGxpY2l0LW1vZGVsLWlkJywgZXhwbGljaXRNZXRhXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0FnZW50IE1vZGVsIChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IGFnZW50TWV0YSwgaWRlbnRpZmllcjogJ2FnZW50LW1vZGVsLWlkJyB9XSxcblx0XHRcdFx0WydDbGF1ZGUgU29ubmV0IChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IGV4cGxpY2l0TWV0YSwgaWRlbnRpZmllcjogJ2V4cGxpY2l0LW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdNeUFnZW50JywgWydBZ2VudCBNb2RlbCAoVGVzdFZlbmRvciknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnTXlBZ2VudCcsIG1vZGVsOiAnQ2xhdWRlIFNvbm5ldCAoVGVzdFZlbmRvciknIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdtb2RlbC1jYWxsLTInLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdNeUFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0NsYXVkZSBTb25uZXQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvd3MgZXJyb3Igd2hlbiBleHBsaWNpdCBtb2RlbCBoYXMgaGlnaGVyIG11bHRpcGxpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IGV4cGVuc2l2ZU1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnTzMgUHJvJywgNTApO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0WydleHBlbnNpdmUtbW9kZWwtaWQnLCBleHBlbnNpdmVNZXRhXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ08zIFBybyAoVGVzdFZlbmRvciknLCB7IG1ldGFkYXRhOiBleHBlbnNpdmVNZXRhLCBpZGVudGlmaWVyOiAnZXhwZW5zaXZlLW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCB9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIG1vZGVsOiAnTzMgUHJvIChUZXN0VmVuZG9yKScgfSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnbW9kZWwtY2FsbC0zJyxcblx0XHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0KGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ08zIFBybycpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ2V4Y2VlZHMnKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdjb3N0IHRpZXInKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdVbmF2YWlsYWJsZScpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBlcnJvciB3aXRoIGF2YWlsYWJsZSBtb2RlbHMgd2hlbiBleHBsaWNpdCBtb2RlbCBpcyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdHUFQtNG8nLCAxKTtcblx0XHRcdGNvbnN0IG90aGVyTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdDbGF1ZGUgU29ubmV0JywgMSk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdLFxuXHRcdFx0XHRbJ290aGVyLW1vZGVsLWlkJywgb3RoZXJNZXRhXSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcDogbmV3IE1hcCgpIH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgbW9kZWw6ICdOb25leGlzdGVudCBNb2RlbCAoVmVuZG9yKScgfSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnbW9kZWwtY2FsbC00Jyxcblx0XHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0KGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ05vbmV4aXN0ZW50IE1vZGVsIChWZW5kb3IpJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnQXZhaWxhYmxlIG1vZGVsczonKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdHUFQtNG8gKFRlc3RWZW5kb3IpJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnQ2xhdWRlIFNvbm5ldCAoVGVzdFZlbmRvciknKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvd3MgZXJyb3Igd2l0aCBubyBtb2RlbHMgbWVzc2FnZSB3aGVuIG5vIG1vZGVscyBhcmUgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHM6IG5ldyBNYXAoKSwgcXVhbGlmaWVkTmFtZU1hcDogbmV3IE1hcCgpIH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgbW9kZWw6ICdOb25leGlzdGVudCBNb2RlbCAoVmVuZG9yKScgfSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnbW9kZWwtY2FsbC01Jyxcblx0XHRcdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0KGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ05vbmV4aXN0ZW50IE1vZGVsIChWZW5kb3IpJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnTm8gbW9kZWxzIGF2YWlsYWJsZScpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ25lc3RlZCBzdWJhZ2VudCBkZXB0aCB0cmFja2luZycsICgpID0+IHtcblx0XHQvKipcblx0XHQgKiBDcmVhdGVzIGEgUnVuU3ViYWdlbnRUb29sIHdpdGggbW9ja2VkIHNlcnZpY2VzIHN1aXRhYmxlIGZvciBpbnZva2UoKSB0ZXN0aW5nLlxuXHRcdCAqIFRoZSByZXR1cm5lZCBgY2FwdHVyZWRSZXF1ZXN0c2AgYXJyYXkgY29sbGVjdHMgZXZlcnkgSUNoYXRBZ2VudFJlcXVlc3QgcGFzc2VkIHRvIGludm9rZUFnZW50LlxuXHRcdCAqL1xuXHRcdGxldCBjYWxsSWRDb3VudGVyID0gMDtcblx0XHRmdW5jdGlvbiBjcmVhdGVJbnZva2FibGVUb29sKG9wdHM6IHtcblx0XHRcdGFsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzOiBib29sZWFuO1xuXHRcdFx0Y2FwdHVyZWRSZXF1ZXN0czogSUNoYXRBZ2VudFJlcXVlc3RbXTtcblx0XHRcdGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zPzogSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucztcblx0XHR9KSB7XG5cdFx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TdWJhZ2VudHNBbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50c106IG9wdHMuYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXG5cdFx0XHRjb25zdCBtb2NrQ2hhdEFnZW50U2VydmljZTogUGljazxJQ2hhdEFnZW50U2VydmljZSwgJ2dldERlZmF1bHRBZ2VudCcgfCAnaW52b2tlQWdlbnQnPiA9IHtcblx0XHRcdFx0Z2V0RGVmYXVsdEFnZW50KCkge1xuXHRcdFx0XHRcdHJldHVybiB7IGlkOiAnZGVmYXVsdC1hZ2VudCcgfSBhcyBJQ2hhdEFnZW50U2VydmljZSBleHRlbmRzIHsgZ2V0RGVmYXVsdEFnZW50KC4uLmFyZ3M6IGluZmVyIF9BKTogaW5mZXIgUiB9ID8gTm9uTnVsbGFibGU8Uj4gOiBuZXZlcjtcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgaW52b2tlQWdlbnQoX2lkOiBzdHJpbmcsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBfcHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkLCBfaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7XG5cdFx0XHRcdFx0b3B0cy5jYXB0dXJlZFJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbW9ja0NoYXRTZXJ2aWNlOiBQaWNrPElDaGF0U2VydmljZSwgJ2dldFNlc3Npb24nPiA9IHtcblx0XHRcdFx0Z2V0U2Vzc2lvbigpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdFx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0XHRcdFx0XHRtb2RlSW5mbzogb3B0cy5jdXJyZW50TW9kZUluc3RydWN0aW9ucyA/IHtcblx0XHRcdFx0XHRcdFx0XHRraW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiBvcHRzLmN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdFx0XHRcdHRlbGVtZXRyeU1vZGVJZDogJ2N1c3RvbScsXG5cdFx0XHRcdFx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRhY2NlcHRSZXNwb25zZVByb2dyZXNzOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBtb2NrSW5zdGFudGlhdGlvblNlcnZpY2U6IFBpY2s8SUluc3RhbnRpYXRpb25TZXJ2aWNlLCAnY3JlYXRlSW5zdGFuY2UnPiA9IHtcblx0XHRcdFx0Y3JlYXRlSW5zdGFuY2UoLi4uX2FyZ3M6IG5ldmVyW10pOiB7IGNvbGxlY3Q6ICgpID0+IFByb21pc2U8dm9pZD4gfSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29sbGVjdDogYXN5bmMgKCkgPT4geyB9IH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUnVuU3ViYWdlbnRUb29sKFxuXHRcdFx0XHRtb2NrQ2hhdEFnZW50U2VydmljZSBhcyBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlIGFzIElDaGF0U2VydmljZSxcblx0XHRcdFx0bW9ja1Rvb2xzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNvbmZpZ1NlcnZpY2UsXG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrSW5zdGFudGlhdGlvblNlcnZpY2UgYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0cmV0dXJuIHsgdG9vbCwgbW9ja0NoYXRBZ2VudFNlcnZpY2UgfTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVJbnZvY2F0aW9uKHNlc3Npb25Vcmk6IFVSSSwgdXNlclNlbGVjdGVkVG9vbHM/OiBVc2VyU2VsZWN0ZWRUb29scyk6IElUb29sSW52b2NhdGlvbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjYWxsSWQ6IGBjYWxsLSR7KytjYWxsSWRDb3VudGVyfWAsXG5cdFx0XHRcdHRvb2xJZDogJ3J1blN1YmFnZW50Jyxcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICdkbyBzb21ldGhpbmcnLCBkZXNjcmlwdGlvbjogJ3Rlc3QnIH0sXG5cdFx0XHRcdGNvbnRleHQ6IHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uVXJpIH0sXG5cdFx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzOiB1c2VyU2VsZWN0ZWRUb29scyA/PyB7IHJ1blN1YmFnZW50OiB0cnVlIH0sXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBjb3VudFRva2VucyA9IGFzeW5jICgpID0+IDA7XG5cdFx0Y29uc3Qgbm9Qcm9ncmVzczogVG9vbFByb2dyZXNzID0geyByZXBvcnQoKSB7IH0gfTtcblxuXHRcdHRlc3QoJ2Rpc2FibGVzIHJ1blN1YmFnZW50IHRvb2wgd2hlbiBuZXN0aW5nIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FwdHVyZWRSZXF1ZXN0czogSUNoYXRBZ2VudFJlcXVlc3RbXSA9IFtdO1xuXHRcdFx0Y29uc3QgeyB0b29sIH0gPSBjcmVhdGVJbnZva2FibGVUb29sKHsgYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHM6IGZhbHNlLCBjYXB0dXJlZFJlcXVlc3RzIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vZGVwdGgwJyk7XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaSksIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFJlcXVlc3RzWzBdLnVzZXJTZWxlY3RlZFRvb2xzPy5bJ3J1blN1YmFnZW50J10sIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VuYWJsZXMgcnVuU3ViYWdlbnQgdG9vbCBhdCBkZXB0aCAwIHdoZW4gbmVzdGluZyBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FwdHVyZWRSZXF1ZXN0czogSUNoYXRBZ2VudFJlcXVlc3RbXSA9IFtdO1xuXHRcdFx0Y29uc3QgeyB0b29sIH0gPSBjcmVhdGVJbnZva2FibGVUb29sKHsgYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHM6IHRydWUsIGNhcHR1cmVkUmVxdWVzdHMgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi9kZXB0aC1lbmFibGVkJyk7XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaSksIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFJlcXVlc3RzWzBdLnVzZXJTZWxlY3RlZFRvb2xzPy5bJ3J1blN1YmFnZW50J10sIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZXMgcnVuU3ViYWdlbnQgdG9vbCB3aGVuIGRlcHRoIHJlYWNoZXMgaGFyZCBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcHR1cmVkUmVxdWVzdHM6IElDaGF0QWdlbnRSZXF1ZXN0W10gPSBbXTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL2RlcHRoLWxpbWl0Jyk7XG5cblx0XHRcdC8vIFdoZW4gbmVzdGluZyBpcyBlbmFibGVkLCB0aGUgdG9vbCBlbmZvcmNlcyBhIGhhcmRjb2RlZCBtYXhpbXVtIGRlcHRoIG9mIDUuXG5cdFx0XHQvLyBTaW11bGF0ZSBuZXN0ZWQgaW52b2NhdGlvbiB1bnRpbCB3ZSBleGNlZWQgdGhlIGxpbWl0IGFuZCBlbnN1cmUgaXQgZGlzYWJsZXMgbmVzdGluZy5cblx0XHRcdGNvbnN0IHsgdG9vbCwgbW9ja0NoYXRBZ2VudFNlcnZpY2UgfSA9IGNyZWF0ZUludm9rYWJsZVRvb2woeyBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50czogdHJ1ZSwgY2FwdHVyZWRSZXF1ZXN0cyB9KTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgbmVzdGVkIGludm9jYXRpb246IHRoZSBmaXJzdCBpbnZva2UncyBpbnZva2VBZ2VudCBjYWxsYmFja1xuXHRcdFx0Ly8gdHJpZ2dlcnMgYSBzZWNvbmQgaW52b2tlIG9uIHRoZSBzYW1lIHRvb2wgKHNhbWUgc2Vzc2lvbikuXG5cdFx0XHRjYXB0dXJlZFJlcXVlc3RzLmxlbmd0aCA9IDA7XG5cdFx0XHRsZXQgbmVzdGVkSW52b2NhdGlvbnMgPSAwO1xuXHRcdFx0bW9ja0NoYXRBZ2VudFNlcnZpY2UuaW52b2tlQWdlbnQgPSBhc3luYyAoX2lkOiBzdHJpbmcsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0KSA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdFx0Ly8gS2VlcCBuZXN0aW5nIHVudGlsIHdlIGdvIGJleW9uZCB0aGUgaGFyZGNvZGVkIG1heERlcHRoXG5cdFx0XHRcdGlmIChuZXN0ZWRJbnZvY2F0aW9ucysrIDwgUlVOX1NVQkFHRU5UX01BWF9ORVNUSU5HX0RFUFRIICsgMSkge1xuXHRcdFx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaSksIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShjcmVhdGVJbnZvY2F0aW9uKHNlc3Npb25VcmkpLCBjb3VudFRva2Vucywgbm9Qcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhjYXB0dXJlZFJlcXVlc3RzLmxlbmd0aCA+PSAyKTtcblx0XHRcdC8vIEF0IGRlcHRoIDAuLihtYXhEZXB0aC0xKSwgbmVzdGluZyBpcyBhbGxvd2VkLiBPbmNlIGRlcHRoIHJlYWNoZXMgbWF4RGVwdGgsIHRoZSBuZXh0IGNhbGwgc2hvdWxkIGRpc2FibGUgbmVzdGluZy5cblx0XHRcdGNvbnN0IGVuYWJsZWRGbGFncyA9IGNhcHR1cmVkUmVxdWVzdHMubWFwKHIgPT4gci51c2VyU2VsZWN0ZWRUb29scz8uWydydW5TdWJhZ2VudCddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmxhZ3NbMF0sIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGbGFnc1sxXSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZsYWdzW1JVTl9TVUJBR0VOVF9NQVhfTkVTVElOR19ERVBUSF0sIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlcHRoIGlzIGRlY3JlbWVudGVkIGFmdGVyIGludm9rZSBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXB0dXJlZFJlcXVlc3RzOiBJQ2hhdEFnZW50UmVxdWVzdFtdID0gW107XG5cdFx0XHRjb25zdCB7IHRvb2wgfSA9IGNyZWF0ZUludm9rYWJsZVRvb2woeyBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50czogdHJ1ZSwgY2FwdHVyZWRSZXF1ZXN0cyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL2RlcHRoLWRlY3JlbWVudCcpO1xuXG5cdFx0XHQvLyBGaXJzdCBpbnZva2Vcblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaSksIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdC8vIFNlY29uZCBpbnZva2Ugb24gc2FtZSBzZXNzaW9uIHNob3VsZCBzdGFydCBhdCBkZXB0aCAwIGFnYWluXG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShjcmVhdGVJbnZvY2F0aW9uKHNlc3Npb25VcmkpLCBjb3VudFRva2Vucywgbm9Qcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFJlcXVlc3RzLmxlbmd0aCwgMik7XG5cdFx0XHQvLyBCb3RoIHNob3VsZCBoYXZlIHJ1blN1YmFnZW50IGVuYWJsZWQgc2luY2UgZGVwdGggcmVzZXRzIGFmdGVyIGVhY2ggaW52b2tlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRSZXF1ZXN0c1swXS51c2VyU2VsZWN0ZWRUb29scz8uWydydW5TdWJhZ2VudCddLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFJlcXVlc3RzWzFdLnVzZXJTZWxlY3RlZFRvb2xzPy5bJ3J1blN1YmFnZW50J10sIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5oZXJpdHMgdGhlIGN1cnJlbnQgYWdlbnQgaW5zdHJ1Y3Rpb25zIHdoZW4gYWdlbnROYW1lIGlzIG9taXR0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXB0dXJlZFJlcXVlc3RzOiBJQ2hhdEFnZW50UmVxdWVzdFtdID0gW107XG5cdFx0XHRjb25zdCBjdXJyZW50TW9kZUluc3RydWN0aW9ucyA9IHsgbmFtZTogJ0N1cnJlbnRBZ2VudCcsIGNvbnRlbnQ6ICdDdXJyZW50IGFnZW50IGluc3RydWN0aW9ucycsIHRvb2xSZWZlcmVuY2VzOiBbXSB9O1xuXHRcdFx0Y29uc3QgeyB0b29sIH0gPSBjcmVhdGVJbnZva2FibGVUb29sKHsgYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHM6IGZhbHNlLCBjYXB0dXJlZFJlcXVlc3RzLCBjdXJyZW50TW9kZUluc3RydWN0aW9ucyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL2N1cnJlbnQtYWdlbnQnKTtcblxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoY3JlYXRlSW52b2NhdGlvbihzZXNzaW9uVXJpKSwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRSZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHNbMF0uc3ViQWdlbnROYW1lLCAnQ3VycmVudEFnZW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHNbMF0ubW9kZUluc3RydWN0aW9ucywgY3VycmVudE1vZGVJbnN0cnVjdGlvbnMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3ViYWdlbnQgY3JlZGl0cycsICgpID0+IHtcblx0XHRsZXQgY3JlZGl0c0NhbGxJZENvdW50ZXIgPSAwO1xuXG5cdFx0LyoqXG5cdFx0ICogQ3JlYXRlcyBhIFJ1blN1YmFnZW50VG9vbCB3aG9zZSBzdWJhZ2VudCBpbnZvY2F0aW9uIGVtaXRzIHRoZSBzdXBwbGllZFxuXHRcdCAqIHVzYWdlIHByb2dyZXNzIHBhcnRzLCBzbyB0ZXN0cyBjYW4gYXNzZXJ0IGhvdyB0aGUgc3ViYWdlbnQncyBjcmVkaXRcblx0XHQgKiAoQUlDKSBjb3N0IGlzIHN1cmZhY2VkIG9uIGl0cyB0b29sJ3MgYHRvb2xTcGVjaWZpY0RhdGFgLlxuXHRcdCAqL1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZUNyZWRpdFRvb2wodXNhZ2VQYXJ0czogSUNoYXRQcm9ncmVzc1tdLCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQgPSB7fSkge1xuXHRcdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcGFyZW50Q3JlZGl0czogeyBzdWJhZ2VudENhbGxJZDogc3RyaW5nOyBjb3BpbG90Q3JlZGl0czogbnVtYmVyIH1bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBtb2NrQ2hhdEFnZW50U2VydmljZTogUGljazxJQ2hhdEFnZW50U2VydmljZSwgJ2dldERlZmF1bHRBZ2VudCcgfCAnaW52b2tlQWdlbnQnPiA9IHtcblx0XHRcdFx0Z2V0RGVmYXVsdEFnZW50KCkge1xuXHRcdFx0XHRcdHJldHVybiB7IGlkOiAnZGVmYXVsdC1hZ2VudCcgfSBhcyBJQ2hhdEFnZW50U2VydmljZSBleHRlbmRzIHsgZ2V0RGVmYXVsdEFnZW50KC4uLmFyZ3M6IGluZmVyIF9BKTogaW5mZXIgUiB9ID8gTm9uTnVsbGFibGU8Uj4gOiBuZXZlcjtcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgaW52b2tlQWdlbnQoX2lkOiBzdHJpbmcsIF9yZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgcHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3ModXNhZ2VQYXJ0cyk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG1vY2tDaGF0U2VydmljZTogUGljazxJQ2hhdFNlcnZpY2UsICdnZXRTZXNzaW9uJz4gPSB7XG5cdFx0XHRcdGdldFNlc3Npb24oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRcdFx0XHRzZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzOiAoc3ViYWdlbnRDYWxsSWQ6IHN0cmluZywgY29waWxvdENyZWRpdHM6IG51bWJlcikgPT4gcGFyZW50Q3JlZGl0cy5wdXNoKHsgc3ViYWdlbnRDYWxsSWQsIGNvcGlsb3RDcmVkaXRzIH0pLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRhY2NlcHRSZXNwb25zZVByb2dyZXNzOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBtb2NrSW5zdGFudGlhdGlvblNlcnZpY2U6IFBpY2s8SUluc3RhbnRpYXRpb25TZXJ2aWNlLCAnY3JlYXRlSW5zdGFuY2UnPiA9IHtcblx0XHRcdFx0Y3JlYXRlSW5zdGFuY2UoLi4uX2FyZ3M6IG5ldmVyW10pOiB7IGNvbGxlY3Q6ICgpID0+IFByb21pc2U8dm9pZD4gfSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29sbGVjdDogYXN5bmMgKCkgPT4geyB9IH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUnVuU3ViYWdlbnRUb29sKFxuXHRcdFx0XHRtb2NrQ2hhdEFnZW50U2VydmljZSBhcyBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlIGFzIElDaGF0U2VydmljZSxcblx0XHRcdFx0bW9ja1Rvb2xzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNvbmZpZ1NlcnZpY2UsXG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrSW5zdGFudGlhdGlvblNlcnZpY2UgYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiB7IHRvb2wsIHBhcmVudENyZWRpdHMgfTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVTdWJhZ2VudEludm9jYXRpb24oY2hhdFN0cmVhbVRvb2xDYWxsSWQ/OiBzdHJpbmcpOiBJVG9vbEludm9jYXRpb24ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2FsbElkOiBgY3JlZGl0cy1jYWxsLSR7KytjcmVkaXRzQ2FsbElkQ291bnRlcn1gLFxuXHRcdFx0XHRjaGF0U3RyZWFtVG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbElkOiAncnVuU3ViYWdlbnQnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ2RvIHNvbWV0aGluZycsIGRlc2NyaXB0aW9uOiAndGVzdCcgfSxcblx0XHRcdFx0Y29udGV4dDogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vY3JlZGl0cycpIH0sXG5cdFx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzOiB7IHJ1blN1YmFnZW50OiB0cnVlIH0sXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICd0ZXN0JyB9LFxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgY291bnRUb2tlbnMgPSBhc3luYyAoKSA9PiAwO1xuXHRcdGNvbnN0IG5vUHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcyA9IHsgcmVwb3J0KCkgeyB9IH07XG5cblx0XHR0ZXN0KCd3cml0ZXMgdGhlIHJ1bm5pbmcgY3JlZGl0IHRvdGFsIG9udG8gdGhlIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDcmVkaXRzIGFyZSBjdW11bGF0aXZlIHBlciB1c2FnZSBldmVudDsgdGhlIGxhdGVzdCB2YWx1ZSBpcyB0aGUgdG90YWwuXG5cdFx0XHRjb25zdCB7IHRvb2wsIHBhcmVudENyZWRpdHMgfSA9IGNyZWF0ZUNyZWRpdFRvb2woW1xuXHRcdFx0XHR7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDUsIGNvcGlsb3RDcmVkaXRzOiAyIH0sXG5cdFx0XHRcdHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAyMCwgY29tcGxldGlvblRva2VuczogOCwgY29waWxvdENyZWRpdHM6IDUgfSxcblx0XHRcdFx0eyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDIwLCBjb21wbGV0aW9uVG9rZW5zOiA4LCBjb3BpbG90Q3JlZGl0czogMyB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gY3JlYXRlU3ViYWdlbnRJbnZvY2F0aW9uKCdzdHJlYW0tdG9vbC1jYWxsJyk7XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGludm9jYXRpb24sIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRvb2xDcmVkaXRzOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFyZW50Q3JlZGl0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0dG9vbENyZWRpdHM6IDUsXG5cdFx0XHRcdHBhcmVudENyZWRpdHM6IFt7IHN1YmFnZW50Q2FsbElkOiBpbnZvY2F0aW9uLmNhbGxJZCwgY29waWxvdENyZWRpdHM6IDUgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29yZHMgY3JlZGl0cyB3aGVuIHRoZSBzdWJhZ2VudCBmYWlscyBhZnRlciByZXBvcnRpbmcgdXNhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRvb2wsIHBhcmVudENyZWRpdHMgfSA9IGNyZWF0ZUNyZWRpdFRvb2woXG5cdFx0XHRcdFt7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDUsIGNvcGlsb3RDcmVkaXRzOiAzIH1dLFxuXHRcdFx0XHR7IGVycm9yRGV0YWlsczogeyBtZXNzYWdlOiAnZmFpbGVkJyB9IH0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IGNyZWF0ZVN1YmFnZW50SW52b2NhdGlvbigpO1xuXG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShpbnZvY2F0aW9uLCBjb3VudFRva2Vucywgbm9Qcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0b29sQ3JlZGl0czogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhcmVudENyZWRpdHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRvb2xDcmVkaXRzOiAzLFxuXHRcdFx0XHRwYXJlbnRDcmVkaXRzOiBbeyBzdWJhZ2VudENhbGxJZDogaW52b2NhdGlvbi5jYWxsSWQsIGNvcGlsb3RDcmVkaXRzOiAzIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgY3JlZGl0cyB1bnNldCB3aGVuIG5vIHVzYWdlIGlzIHJlcG9ydGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyB0b29sIH0gPSBjcmVhdGVDcmVkaXRUb29sKFtdKTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSBjcmVhdGVTdWJhZ2VudEludm9jYXRpb24oKTtcblxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoaW52b2NhdGlvbiwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgOiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDLHVCQUF1QjtBQUNoRSxTQUFTLHFDQUFxQztBQUc5QyxTQUFTLHlCQUFzSDtBQUcvSCxTQUF1QixzQkFBc0I7QUFDN0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBR3BDLFNBQVMseUJBQXlCO0FBRWxDLE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsUUFBTSxrQkFBa0Isd0NBQXdDO0FBRWhFLFFBQU0sdUJBQXVCLE1BQU07QUFDbEMsU0FBSywwREFBMEQsTUFBTTtBQUVwRSxZQUFNLFlBQVk7QUFBQSxRQUNqQixFQUFFLE9BQU8sNEJBQTRCLFVBQVUsaUJBQWlCO0FBQUEsUUFDaEUsRUFBRSxPQUFPLDhCQUE4QixVQUFVLGlCQUFpQjtBQUFBLFFBQ2xFLEVBQUUsT0FBTyxvQ0FBb0MsVUFBVSxpQkFBaUI7QUFBQSxRQUN4RSxFQUFFLE9BQU8sc0NBQXNDLFVBQVUsMkJBQTJCO0FBQUE7QUFBQSxRQUNwRixFQUFFLE9BQU8scUJBQXFCLFVBQVUsb0JBQW9CO0FBQUEsUUFDNUQsRUFBRSxPQUFPLGNBQWMsVUFBVSxHQUFHO0FBQUEsUUFDcEMsRUFBRSxPQUFPLElBQUksVUFBVSxHQUFHO0FBQUEsTUFDM0I7QUFFQSxpQkFBVyxFQUFFLE9BQU8sU0FBUyxLQUFLLFdBQVc7QUFDNUMsY0FBTSxTQUFTLE1BQU0sUUFBUSxxQkFBcUIsRUFBRSxFQUFFLEtBQUs7QUFDM0QsZUFBTyxZQUFZLFFBQVEsVUFBVSxxQkFBcUIsS0FBSyxVQUFVLEtBQUssQ0FBQyxFQUFFO0FBQUEsTUFDbEY7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFNBQUssb0NBQW9DLFlBQVk7QUFDcEQsWUFBTSxtQkFBbUIsZ0JBQWdCLElBQUksSUFBSSw4QkFBOEIsQ0FBQztBQUVoRixZQUFNLGlCQUFpQixJQUFJLG1CQUFtQjtBQUM5QyxZQUFNLGFBQTJCO0FBQUEsUUFDaEMsSUFBSTtBQUFBLFFBQ0osS0FBSyxJQUFJLE1BQU0sOEJBQThCO0FBQUEsUUFDN0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsT0FBTyxDQUFDLFNBQVMsT0FBTztBQUFBLFFBQ3hCLG1CQUFtQixFQUFFLFNBQVMscUJBQXFCLGdCQUFnQixDQUFDLEVBQUU7QUFBQSxRQUN0RSxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxRQUN4QyxRQUFRLE9BQU87QUFBQSxRQUNmLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxRQUN4RCxTQUFTO0FBQUEsTUFDVjtBQUNBLHFCQUFlLGVBQWUsQ0FBQyxVQUFVLENBQUM7QUFFMUMsWUFBTSxPQUFPLGdCQUFnQixJQUFJLElBQUk7QUFBQSxRQUNwQyxDQUFDO0FBQUEsUUFDRCxDQUFDO0FBQUEsUUFDRDtBQUFBLFFBQ0EsQ0FBQztBQUFBLFFBQ0QsSUFBSSxlQUFlO0FBQUEsUUFDbkIsSUFBSSx5QkFBeUI7QUFBQSxRQUM3QjtBQUFBLFFBQ0EsQ0FBQztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLEtBQUs7QUFBQSxRQUN6QjtBQUFBLFVBQ0MsWUFBWTtBQUFBLFlBQ1gsUUFBUTtBQUFBLFlBQ1IsYUFBYTtBQUFBLFlBQ2IsV0FBVztBQUFBLFVBQ1o7QUFBQSxVQUNBLFlBQVk7QUFBQSxVQUNaLHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsUUFDaEQ7QUFBQSxRQUNBLGtCQUFrQjtBQUFBLE1BQ25CO0FBRUEsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sbUJBQW1CLFdBQVc7QUFDeEQsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsYUFBUyxXQUFXLE1BQTBDO0FBQzdELFlBQU0sbUJBQW1CLGdCQUFnQixJQUFJLElBQUksOEJBQThCLENBQUM7QUFDaEYsWUFBTSxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDOUMsVUFBSSxNQUFNLGNBQWM7QUFDdkIsdUJBQWUsZUFBZSxLQUFLLFlBQVk7QUFBQSxNQUNoRDtBQUVBLFlBQU0sT0FBTyxnQkFBZ0IsSUFBSSxJQUFJO0FBQUEsUUFDcEMsQ0FBQztBQUFBLFFBQ0QsQ0FBQztBQUFBLFFBQ0Q7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNELElBQUksZUFBZTtBQUFBLFFBQ25CLElBQUkseUJBQXlCO0FBQUEsUUFDN0I7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssb0NBQW9DLFlBQVk7QUFDcEQsWUFBTSxPQUFPLFdBQVc7QUFFeEIsWUFBTSxTQUFTLE1BQU0sS0FBSztBQUFBLFFBQ3pCO0FBQUEsVUFDQyxZQUFZLEVBQUUsUUFBUSxlQUFlLGFBQWEsYUFBYSxXQUFXLG1CQUFtQjtBQUFBLFVBQzdGLFlBQVk7QUFBQSxVQUNaLHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsUUFDaEQ7QUFBQSxRQUNBLGtCQUFrQjtBQUFBLE1BQ25CO0FBRUEsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxlQUFlLE1BQU07QUFDMUIsU0FBSywyQkFBMkIsTUFBTTtBQUNyQyxZQUFNLG1CQUFtQixnQkFBZ0IsSUFBSSxJQUFJLDhCQUE4QixDQUFDO0FBQ2hGLFlBQU0saUJBQWlCLElBQUksbUJBQW1CO0FBRTlDLFlBQU0sT0FBTyxnQkFBZ0IsSUFBSSxJQUFJO0FBQUEsUUFDcEMsQ0FBQztBQUFBLFFBQ0QsQ0FBQztBQUFBLFFBQ0Q7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNELElBQUksZUFBZTtBQUFBLFFBQ25CLElBQUkseUJBQXlCO0FBQUEsUUFDN0I7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxZQUFNLFdBQVcsS0FBSyxZQUFZO0FBRWxDLGFBQU8sWUFBWSxTQUFTLElBQUksYUFBYTtBQUM3QyxhQUFPLEdBQUcsU0FBUyxXQUFXO0FBQzlCLGFBQU8sR0FBRyxTQUFTLFlBQVksWUFBWSxNQUFNO0FBQ2pELGFBQU8sR0FBRyxTQUFTLFlBQVksWUFBWSxXQUFXO0FBQ3RELGFBQU8sR0FBRyxTQUFTLFlBQVksWUFBWSxXQUFXLDBDQUEwQztBQUNoRyxhQUFPLGdCQUFnQixTQUFTLFlBQVksVUFBVSxDQUFDLFVBQVUsYUFBYSxDQUFDO0FBQUEsSUFDaEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0seUJBQXlCLE1BQU07QUFDcEMsU0FBSywrREFBK0QsTUFBTTtBQUN6RSxZQUFNLG1CQUFtQixnQkFBZ0IsSUFBSSxJQUFJLDhCQUE4QixDQUFDO0FBQ2hGLFlBQU0sa0JBQWtCLElBQUksTUFBTSxnQkFBZ0I7QUFDbEQsWUFBTSxpQkFBa0osQ0FBQztBQUV6SixzQkFBZ0IsSUFBSSxpQkFBaUIsZ0JBQWdCLE9BQUs7QUFDekQsdUJBQWUsS0FBSyxDQUFDO0FBQUEsTUFDdEIsQ0FBQyxDQUFDO0FBRUYsdUJBQWlCLG9CQUFvQjtBQUFBLFFBQ3BDLFFBQVE7QUFBQSxRQUNSO0FBQUEsUUFDQSxXQUFXO0FBQUEsUUFDWCxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBRUQsYUFBTyxZQUFZLGVBQWUsUUFBUSxDQUFDO0FBQzNDLGFBQU8sZ0JBQWdCLGVBQWUsQ0FBQyxHQUFHO0FBQUEsUUFDekMsUUFBUTtBQUFBLFFBQ1I7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLHNCQUFzQjtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGtFQUFrRSxNQUFNO0FBRzVFLFlBQU0sbUJBQW1CLGdCQUFnQixJQUFJLElBQUksOEJBQThCLENBQUM7QUFDaEYsWUFBTSxtQkFBbUI7QUFFekIsWUFBTSxpQkFBMkIsQ0FBQztBQUNsQyxzQkFBZ0IsSUFBSSxpQkFBaUIsZ0JBQWdCLE9BQUs7QUFDekQsWUFBSSxFQUFFLHlCQUF5QixrQkFBa0I7QUFDaEQseUJBQWUsS0FBSyxFQUFFLE1BQU07QUFBQSxRQUM3QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBR0YsdUJBQWlCLG9CQUFvQjtBQUFBLFFBQ3BDLFFBQVE7QUFBQSxRQUNSLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVc7QUFBQSxRQUNYLHNCQUFzQjtBQUFBLE1BQ3ZCLENBQUM7QUFDRCx1QkFBaUIsb0JBQW9CO0FBQUEsUUFDcEMsUUFBUTtBQUFBLFFBQ1IsaUJBQWlCO0FBQUEsUUFDakIsV0FBVztBQUFBLFFBQ1gsc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQztBQUNELHVCQUFpQixvQkFBb0I7QUFBQSxRQUNwQyxRQUFRO0FBQUEsUUFDUixpQkFBaUI7QUFBQSxRQUNqQixXQUFXO0FBQUEsUUFDWCxzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBR0QsYUFBTyxnQkFBZ0IsZ0JBQWdCLENBQUMsZUFBZSxDQUFDO0FBQUEsSUFDekQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sMkJBQTJCLE1BQU07QUFDdEMsVUFBTSw0QkFBNEI7QUFDbEMsVUFBTSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxpQkFBaUIsMEJBQTBCLEVBQUU7QUFFakcsYUFBUyxlQUFlLE1BQWMsbUJBQTRCLFNBQWlCLGNBQTBDO0FBQzVILGFBQU87QUFBQSxRQUNOLFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsUUFDbkQ7QUFBQSxRQUNBLElBQUksS0FBSyxZQUFZLEVBQUUsUUFBUSxRQUFRLEdBQUc7QUFBQSxRQUMxQztBQUFBLFFBQ0EsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IsZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCO0FBQUEsUUFDakIsc0JBQXNCLENBQUM7QUFBQSxRQUN2QjtBQUFBLFFBQ0EsY0FBYyxFQUFFLGFBQWEsS0FBSztBQUFBLFFBQ2xDLFFBQVEsV0FBVztBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUVBLGFBQVMsV0FBVyxNQUlqQjtBQUNGLFlBQU0sbUJBQW1CLGdCQUFnQixJQUFJLElBQUksOEJBQThCLENBQUM7QUFDaEYsWUFBTSxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDOUMsVUFBSSxLQUFLLGNBQWM7QUFDdEIsdUJBQWUsZUFBZSxLQUFLLFlBQVk7QUFBQSxNQUNoRDtBQUVBLFlBQU0sNEJBQTZEO0FBQUEsUUFDbEUsc0JBQXNCO0FBQ3JCLGlCQUFPLE1BQU0sS0FBSyxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBQUEsUUFDckM7QUFBQSxRQUNBLG9CQUFvQixTQUFpQjtBQUNwQyxpQkFBTyxLQUFLLE9BQU8sSUFBSSxPQUFPO0FBQUEsUUFDL0I7QUFBQSxRQUNBLG1DQUFtQyxlQUF1QjtBQUN6RCxpQkFBTyxLQUFLLGtCQUFrQixJQUFJLGFBQWE7QUFBQSxRQUNoRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQU8sZ0JBQWdCLElBQUksSUFBSTtBQUFBLFFBQ3BDLENBQUM7QUFBQSxRQUNELENBQUM7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFFBQ0EsSUFBSSxlQUFlO0FBQUEsUUFDbkIsSUFBSSx5QkFBeUI7QUFBQSxRQUM3QjtBQUFBLFFBQ0EsQ0FBQztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxhQUFPO0FBQUEsSUFDUjtBQUVBLGFBQVMsWUFBWSxNQUFjLHFCQUE4QztBQUNoRixZQUFNLEtBQUssZ0JBQWdCLElBQUk7QUFDL0IsYUFBTztBQUFBLFFBQ04sS0FBSyxJQUFJLE1BQU0sRUFBRTtBQUFBLFFBQ2pCO0FBQUEsUUFDQTtBQUFBLFFBQ0EsYUFBYSxTQUFTLElBQUk7QUFBQSxRQUMxQixPQUFPLENBQUMsT0FBTztBQUFBLFFBQ2YsT0FBTztBQUFBLFFBQ1AsbUJBQW1CLEVBQUUsU0FBUyxRQUFRLGdCQUFnQixDQUFDLEVBQUU7QUFBQSxRQUN6RCxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxRQUN4QyxRQUFRLE9BQU87QUFBQSxRQUNmLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxRQUN4RCxTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFHQSxhQUFTLG1CQUFtQixNQUFjLHFCQUE4QztBQUN2RixhQUFPO0FBQUEsUUFDTixHQUFHLFlBQVksTUFBTSxtQkFBbUI7QUFBQSxRQUN4QyxRQUFRLEVBQUUsU0FBUyxlQUFlLFdBQVcsYUFBYSxJQUFJLG9CQUFvQix5QkFBeUIsRUFBRTtBQUFBLE1BQzlHO0FBQUEsSUFDRDtBQUVBLFNBQUssMERBQTBELFlBQVk7QUFDMUUsWUFBTSxXQUFXLGVBQWUsVUFBVSxDQUFDO0FBQzNDLFlBQU0sZ0JBQWdCLGVBQWUsVUFBVSxFQUFFO0FBQ2pELFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxpQkFBaUIsUUFBUTtBQUFBLFFBQzFCLENBQUMsc0JBQXNCLGFBQWE7QUFBQSxNQUNyQyxDQUFDO0FBQ0QsWUFBTSxtQkFBbUIsb0JBQUksSUFBSTtBQUFBLFFBQ2hDLENBQUMsdUJBQXVCLEVBQUUsVUFBVSxlQUFlLFlBQVkscUJBQXFCLENBQUM7QUFBQSxNQUN0RixDQUFDO0FBRUQsWUFBTSxRQUFRLFlBQVksa0JBQWtCLENBQUMscUJBQXFCLENBQUM7QUFDbkUsWUFBTSxPQUFPLFdBQVcsRUFBRSxRQUFRLGtCQUFrQixjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7QUFFM0UsWUFBTSxPQUFPO0FBQUEsUUFDWixNQUFNLEtBQUssc0JBQXNCO0FBQUEsVUFDaEMsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsV0FBVyxpQkFBaUI7QUFBQSxVQUNwRixZQUFZO0FBQUEsVUFDWixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLFFBQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFBQSxRQUN6QixDQUFDLFFBQWU7QUFDZixpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUN4QyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUN6QyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFdBQVcsQ0FBQztBQUMzQyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLGFBQWEsQ0FBQztBQUM3QyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxvREFBb0QsWUFBWTtBQUNwRSxZQUFNLFdBQVcsZUFBZSxVQUFVLENBQUM7QUFDM0MsWUFBTSxlQUFlLGVBQWUsaUJBQWlCLENBQUM7QUFDdEQsWUFBTSxTQUFTLG9CQUFJLElBQUk7QUFBQSxRQUN0QixDQUFDLGlCQUFpQixRQUFRO0FBQUEsUUFDMUIsQ0FBQyxzQkFBc0IsWUFBWTtBQUFBLE1BQ3BDLENBQUM7QUFDRCxZQUFNLG1CQUFtQixvQkFBSSxJQUFJO0FBQUEsUUFDaEMsQ0FBQyw4QkFBOEIsRUFBRSxVQUFVLGNBQWMsWUFBWSxxQkFBcUIsQ0FBQztBQUFBLE1BQzVGLENBQUM7QUFFRCxZQUFNLFFBQVEsWUFBWSxpQkFBaUIsQ0FBQyw0QkFBNEIsQ0FBQztBQUN6RSxZQUFNLE9BQU8sV0FBVyxFQUFFLFFBQVEsa0JBQWtCLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUUzRSxZQUFNLFNBQVMsTUFBTSxLQUFLLHNCQUFzQjtBQUFBLFFBQy9DLFlBQVksRUFBRSxRQUFRLFFBQVEsYUFBYSxhQUFhLFdBQVcsZ0JBQWdCO0FBQUEsUUFDbkYsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxNQUNoRCxHQUFHLGtCQUFrQixJQUFJO0FBRXpCLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sZ0JBQWdCLE9BQU8sa0JBQWtCO0FBQUEsUUFDL0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxXQUFXLGVBQWUsVUFBVSxFQUFFO0FBQzVDLFlBQU0sWUFBWSxlQUFlLGVBQWUsSUFBSTtBQUNwRCxZQUFNLFNBQVMsb0JBQUksSUFBSTtBQUFBLFFBQ3RCLENBQUMsaUJBQWlCLFFBQVE7QUFBQSxRQUMxQixDQUFDLGtCQUFrQixTQUFTO0FBQUEsTUFDN0IsQ0FBQztBQUNELFlBQU0sbUJBQW1CLG9CQUFJLElBQUk7QUFBQSxRQUNoQyxDQUFDLDRCQUE0QixFQUFFLFVBQVUsV0FBVyxZQUFZLGlCQUFpQixDQUFDO0FBQUEsTUFDbkYsQ0FBQztBQUVELFlBQU0sUUFBUSxZQUFZLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQztBQUNwRSxZQUFNLE9BQU8sV0FBVyxFQUFFLFFBQVEsa0JBQWtCLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUUzRSxZQUFNLFNBQVMsTUFBTSxLQUFLLHNCQUFzQjtBQUFBLFFBQy9DLFlBQVksRUFBRSxRQUFRLFFBQVEsYUFBYSxhQUFhLFdBQVcsYUFBYTtBQUFBLFFBQ2hGLFlBQVk7QUFBQSxRQUNaLFNBQVM7QUFBQSxRQUNULHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsTUFDaEQsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixPQUFPLGtCQUFrQjtBQUFBLFFBQy9DLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLFlBQU0sV0FBVyxlQUFlLGlCQUFpQixNQUFTO0FBQzFELFlBQU0sVUFBVSxlQUFlLFVBQVUsRUFBRTtBQUMzQyxZQUFNLFNBQVMsb0JBQUksSUFBSTtBQUFBLFFBQ3RCLENBQUMsaUJBQWlCLFFBQVE7QUFBQSxRQUMxQixDQUFDLGdCQUFnQixPQUFPO0FBQUEsTUFDekIsQ0FBQztBQUNELFlBQU0sbUJBQW1CLG9CQUFJLElBQUk7QUFBQSxRQUNoQyxDQUFDLHVCQUF1QixFQUFFLFVBQVUsU0FBUyxZQUFZLGVBQWUsQ0FBQztBQUFBLE1BQzFFLENBQUM7QUFFRCxZQUFNLFFBQVEsWUFBWSxZQUFZLENBQUMscUJBQXFCLENBQUM7QUFDN0QsWUFBTSxPQUFPLFdBQVcsRUFBRSxRQUFRLGtCQUFrQixjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7QUFFM0UsWUFBTSxTQUFTLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxRQUMvQyxZQUFZLEVBQUUsUUFBUSxRQUFRLGFBQWEsYUFBYSxXQUFXLFdBQVc7QUFBQSxRQUM5RSxZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLE1BQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFFekIsYUFBTyxHQUFHLE1BQU07QUFFaEIsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyw2REFBNkQsWUFBWTtBQUM3RSxZQUFNLFdBQVcsZUFBZSxVQUFVLENBQUM7QUFDM0MsWUFBTSxVQUFVLGVBQWUsZ0JBQWdCLE1BQVM7QUFDeEQsWUFBTSxTQUFTLG9CQUFJLElBQUk7QUFBQSxRQUN0QixDQUFDLGlCQUFpQixRQUFRO0FBQUEsUUFDMUIsQ0FBQyxnQkFBZ0IsT0FBTztBQUFBLE1BQ3pCLENBQUM7QUFDRCxZQUFNLG1CQUFtQixvQkFBSSxJQUFJO0FBQUEsUUFDaEMsQ0FBQyw2QkFBNkIsRUFBRSxVQUFVLFNBQVMsWUFBWSxlQUFlLENBQUM7QUFBQSxNQUNoRixDQUFDO0FBRUQsWUFBTSxRQUFRLFlBQVksZUFBZSxDQUFDLDJCQUEyQixDQUFDO0FBQ3RFLFlBQU0sT0FBTyxXQUFXLEVBQUUsUUFBUSxrQkFBa0IsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBRTNFLFlBQU0sU0FBUyxNQUFNLEtBQUssc0JBQXNCO0FBQUEsUUFDL0MsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsV0FBVyxjQUFjO0FBQUEsUUFDakYsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxNQUNoRCxHQUFHLGtCQUFrQixJQUFJO0FBRXpCLGFBQU8sR0FBRyxNQUFNO0FBRWhCLGFBQU8sZ0JBQWdCLE9BQU8sa0JBQWtCO0FBQUEsUUFDL0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssaURBQWlELFlBQVk7QUFDakUsWUFBTSxXQUFXLGVBQWUsVUFBVSxDQUFDO0FBQzNDLFlBQU0sU0FBUyxvQkFBSSxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsUUFBUSxDQUFDLENBQUM7QUFFcEQsWUFBTSxPQUFPLFdBQVcsRUFBRSxPQUFPLENBQUM7QUFFbEMsWUFBTSxTQUFTLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxRQUMvQyxZQUFZLEVBQUUsUUFBUSxRQUFRLGFBQWEsWUFBWTtBQUFBLFFBQ3ZELFlBQVk7QUFBQSxRQUNaLFNBQVM7QUFBQSxRQUNULHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsTUFDaEQsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixPQUFPLGtCQUFrQjtBQUFBLFFBQy9DLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLFlBQU0sV0FBVyxlQUFlLFVBQVUsQ0FBQztBQUMzQyxZQUFNLFNBQVMsb0JBQUksSUFBSSxDQUFDLENBQUMsaUJBQWlCLFFBQVEsQ0FBQyxDQUFDO0FBRXBELFlBQU0sUUFBUSxZQUFZLGdCQUFnQixNQUFTO0FBQ25ELFlBQU0sT0FBTyxXQUFXLEVBQUUsUUFBUSxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7QUFFekQsWUFBTSxTQUFTLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxRQUMvQyxZQUFZLEVBQUUsUUFBUSxRQUFRLGFBQWEsYUFBYSxXQUFXLGVBQWU7QUFBQSxRQUNsRixZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLE1BQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFFekIsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxxRkFBcUYsWUFBWTtBQUNyRyxZQUFNLFdBQVcsZUFBZSxzQkFBc0IsUUFBVyxXQUFXO0FBQzVFLFlBQU0sa0JBQWtCLGVBQWUsaUJBQWlCLFFBQVcsaUJBQWlCO0FBQ3BGLFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxnQkFBZ0IsUUFBUTtBQUFBLFFBQ3pCLENBQUMsdUJBQXVCLGVBQWU7QUFBQSxNQUN4QyxDQUFDO0FBQ0QsWUFBTSxtQkFBbUIsb0JBQUksSUFBSTtBQUFBLFFBQ2hDLENBQUMsMkJBQTJCLEVBQUUsVUFBVSxpQkFBaUIsWUFBWSxzQkFBc0IsQ0FBQztBQUFBLE1BQzdGLENBQUM7QUFFRCxZQUFNLFFBQVEsbUJBQW1CLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO0FBQzVFLFlBQU0sT0FBTyxXQUFXLEVBQUUsUUFBUSxrQkFBa0IsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBRTNFLFlBQU0sU0FBUyxNQUFNLEtBQUssc0JBQXNCO0FBQUEsUUFDL0MsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsV0FBVyxlQUFlO0FBQUEsUUFDbEYsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxNQUNoRCxHQUFHLGtCQUFrQixJQUFJO0FBRXpCLGFBQU8sR0FBRyxNQUFNO0FBRWhCLGFBQU8sZ0JBQWdCLE9BQU8sa0JBQWtCO0FBQUEsUUFDL0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssa0ZBQWtGLFlBQVk7QUFDbEcsWUFBTSxXQUFXLGVBQWUsc0JBQXNCLFFBQVcsV0FBVztBQUM1RSxZQUFNLGtCQUFrQixlQUFlLGlCQUFpQixRQUFXLGlCQUFpQjtBQUNwRixZQUFNLGVBQWUsZUFBZSxnQkFBZ0IsUUFBVyxRQUFRO0FBQ3ZFLFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxnQkFBZ0IsUUFBUTtBQUFBLFFBQ3pCLENBQUMsdUJBQXVCLGVBQWU7QUFBQSxRQUN2QyxDQUFDLG9CQUFvQixZQUFZO0FBQUEsTUFDbEMsQ0FBQztBQUNELFlBQU0sbUJBQW1CLG9CQUFJLElBQUk7QUFBQSxRQUNoQyxDQUFDLDJCQUEyQixFQUFFLFVBQVUsaUJBQWlCLFlBQVksc0JBQXNCLENBQUM7QUFBQSxRQUM1RixDQUFDLHlCQUF5QixFQUFFLFVBQVUsY0FBYyxZQUFZLG1CQUFtQixDQUFDO0FBQUEsTUFDckYsQ0FBQztBQUdELFlBQU0sUUFBUSxtQkFBbUIsZ0JBQWdCLENBQUMsMkJBQTJCLHVCQUF1QixDQUFDO0FBQ3JHLFlBQU0sT0FBTyxXQUFXLEVBQUUsUUFBUSxrQkFBa0IsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBRTNFLFlBQU0sU0FBUyxNQUFNLEtBQUssc0JBQXNCO0FBQUEsUUFDL0MsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsV0FBVyxlQUFlO0FBQUEsUUFDbEYsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxNQUNoRCxHQUFHLGtCQUFrQixJQUFJO0FBRXpCLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sZ0JBQWdCLE9BQU8sa0JBQWtCO0FBQUEsUUFDL0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssdUVBQXVFLFlBQVk7QUFDdkYsWUFBTSxXQUFXLGVBQWUsa0JBQWtCLFFBQVcsaUJBQWlCO0FBQzlFLFlBQU0sa0JBQWtCLGVBQWUsaUJBQWlCLFFBQVcsaUJBQWlCO0FBQ3BGLFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxtQkFBbUIsUUFBUTtBQUFBLFFBQzVCLENBQUMsdUJBQXVCLGVBQWU7QUFBQSxNQUN4QyxDQUFDO0FBQ0QsWUFBTSxtQkFBbUIsb0JBQUksSUFBSTtBQUFBLFFBQ2hDLENBQUMsMkJBQTJCLEVBQUUsVUFBVSxpQkFBaUIsWUFBWSxzQkFBc0IsQ0FBQztBQUFBLE1BQzdGLENBQUM7QUFFRCxZQUFNLFFBQVEsbUJBQW1CLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO0FBQzVFLFlBQU0sT0FBTyxXQUFXLEVBQUUsUUFBUSxrQkFBa0IsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBRTNFLFlBQU0sU0FBUyxNQUFNLEtBQUssc0JBQXNCO0FBQUEsUUFDL0MsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsV0FBVyxlQUFlO0FBQUEsUUFDbEYsWUFBWTtBQUFBLFFBQ1osU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxNQUNoRCxHQUFHLGtCQUFrQixJQUFJO0FBRXpCLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sZ0JBQWdCLE9BQU8sa0JBQWtCO0FBQUEsUUFDL0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNkRBQTZELFlBQVk7QUFDN0UsWUFBTSxrQkFBa0IsZUFBZSxpQkFBaUIsUUFBVyxpQkFBaUI7QUFDcEYsWUFBTSxTQUFTLG9CQUFJLElBQUk7QUFBQSxRQUN0QixDQUFDLHVCQUF1QixlQUFlO0FBQUEsTUFDeEMsQ0FBQztBQUNELFlBQU0sbUJBQW1CLG9CQUFJLElBQUk7QUFBQSxRQUNoQyxDQUFDLDJCQUEyQixFQUFFLFVBQVUsaUJBQWlCLFlBQVksc0JBQXNCLENBQUM7QUFBQSxNQUM3RixDQUFDO0FBRUQsWUFBTSxRQUFRLG1CQUFtQixnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FBQztBQUM1RSxZQUFNLE9BQU8sV0FBVyxFQUFFLFFBQVEsa0JBQWtCLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUUzRSxZQUFNLFNBQVMsTUFBTSxLQUFLLHNCQUFzQjtBQUFBLFFBQy9DLFlBQVksRUFBRSxRQUFRLFFBQVEsYUFBYSxhQUFhLFdBQVcsZUFBZTtBQUFBLFFBQ2xGLFlBQVk7QUFBQSxRQUNaLFNBQVM7QUFBQSxRQUNULHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsTUFDaEQsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLGdCQUFnQixPQUFPLGtCQUFrQjtBQUFBLFFBQy9DLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHNGQUF1RixZQUFZO0FBQ3ZHLFlBQU0sV0FBVyxlQUFlLHNCQUFzQixRQUFXLFdBQVc7QUFDNUUsWUFBTSxnQkFBZ0IsZUFBZSxrQkFBa0IsUUFBVyxpQkFBaUI7QUFDbkYsWUFBTSxTQUFTLG9CQUFJLElBQUk7QUFBQSxRQUN0QixDQUFDLGdCQUFnQixRQUFRO0FBQUEsUUFDekIsQ0FBQyxxQkFBcUIsYUFBYTtBQUFBLE1BQ3BDLENBQUM7QUFDRCxZQUFNLG1CQUFtQixvQkFBSSxJQUFJO0FBQUEsUUFDaEMsQ0FBQyw0QkFBNEIsRUFBRSxVQUFVLGVBQWUsWUFBWSxvQkFBb0IsQ0FBQztBQUFBLE1BQzFGLENBQUM7QUFHRCxZQUFNLFFBQVEsWUFBWSxXQUFXLENBQUMsMEJBQTBCLENBQUM7QUFDakUsWUFBTSxPQUFPLFdBQVcsRUFBRSxRQUFRLGtCQUFrQixjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7QUFFM0UsWUFBTSxTQUFTLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxRQUMvQyxZQUFZLEVBQUUsUUFBUSxRQUFRLGFBQWEsYUFBYSxXQUFXLFVBQVU7QUFBQSxRQUM3RSxZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLE1BQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFFekIsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSw0QkFBNEIsTUFBTTtBQUN2QyxhQUFTLGVBQWUsTUFBYyxtQkFBd0Q7QUFDN0YsYUFBTztBQUFBLFFBQ04sV0FBVyxJQUFJLG9CQUFvQixnQkFBZ0I7QUFBQSxRQUNuRDtBQUFBLFFBQ0EsSUFBSSxLQUFLLFlBQVksRUFBRSxRQUFRLFFBQVEsR0FBRztBQUFBLFFBQzFDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGdCQUFnQjtBQUFBLFFBQ2hCLGlCQUFpQjtBQUFBLFFBQ2pCLHNCQUFzQixDQUFDO0FBQUEsUUFDdkI7QUFBQSxRQUNBLGNBQWMsRUFBRSxhQUFhLEtBQUs7QUFBQSxNQUNuQztBQUFBLElBQ0Q7QUFFQSxhQUFTLFdBQVcsTUFJakI7QUFDRixZQUFNLG1CQUFtQixnQkFBZ0IsSUFBSSxJQUFJLDhCQUE4QixDQUFDO0FBQ2hGLFlBQU0saUJBQWlCLElBQUksbUJBQW1CO0FBQzlDLFVBQUksS0FBSyxjQUFjO0FBQ3RCLHVCQUFlLGVBQWUsS0FBSyxZQUFZO0FBQUEsTUFDaEQ7QUFFQSxZQUFNLDRCQUE2RDtBQUFBLFFBQ2xFLHNCQUFzQjtBQUNyQixpQkFBTyxNQUFNLEtBQUssS0FBSyxPQUFPLEtBQUssQ0FBQztBQUFBLFFBQ3JDO0FBQUEsUUFDQSxvQkFBb0IsU0FBaUI7QUFDcEMsaUJBQU8sS0FBSyxPQUFPLElBQUksT0FBTztBQUFBLFFBQy9CO0FBQUEsUUFDQSxtQ0FBbUMsZUFBdUI7QUFDekQsaUJBQU8sS0FBSyxrQkFBa0IsSUFBSSxhQUFhO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFPLGdCQUFnQixJQUFJLElBQUk7QUFBQSxRQUNwQyxDQUFDO0FBQUEsUUFDRCxDQUFDO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBLElBQUksZUFBZTtBQUFBLFFBQ25CLElBQUkseUJBQXlCO0FBQUEsUUFDN0I7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxhQUFPO0FBQUEsSUFDUjtBQUVBLGFBQVMsWUFBWSxNQUFjLHFCQUE4QztBQUNoRixZQUFNLEtBQUssZ0JBQWdCLElBQUk7QUFDL0IsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLEtBQUssSUFBSSxNQUFNLEVBQUU7QUFBQSxRQUNqQjtBQUFBLFFBQ0EsYUFBYSxTQUFTLElBQUk7QUFBQSxRQUMxQixPQUFPLENBQUMsT0FBTztBQUFBLFFBQ2YsT0FBTztBQUFBLFFBQ1AsbUJBQW1CLEVBQUUsU0FBUyxRQUFRLGdCQUFnQixDQUFDLEVBQUU7QUFBQSxRQUN6RCxRQUFRLEVBQUUsU0FBUyxlQUFlLE1BQU07QUFBQSxRQUN4QyxRQUFRLE9BQU87QUFBQSxRQUNmLFlBQVksRUFBRSxlQUFlLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxRQUN4RCxTQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFFQSxTQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxXQUFXLGVBQWUsUUFBUSxDQUFDO0FBQUEsUUFDcEMsQ0FBQyxXQUFXLGVBQWUsZUFBZSxDQUFDO0FBQUEsTUFDNUMsQ0FBQztBQUVELFlBQU0sT0FBTyxXQUFXLEVBQUUsT0FBTyxDQUFDO0FBQ2xDLFlBQU0sV0FBVyxLQUFLLFlBQVk7QUFFbEMsYUFBTyxHQUFHLFNBQVMsYUFBYSxZQUFZLE9BQU8sMkJBQTJCO0FBQzlFLGFBQU8sWUFBWSxTQUFTLGFBQWEsWUFBWSxPQUFPLE1BQU0sUUFBUTtBQUUxRSxhQUFPLFlBQVksU0FBUyxhQUFhLFlBQVksT0FBTyxNQUFNLFFBQVcsK0JBQStCO0FBQUEsSUFDN0csQ0FBQztBQUVELFNBQUssdURBQXVELFlBQVk7QUFDdkUsWUFBTSxXQUFXLGVBQWUsVUFBVSxDQUFDO0FBQzNDLFlBQU0sZUFBZSxlQUFlLGlCQUFpQixDQUFDO0FBQ3RELFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxpQkFBaUIsUUFBUTtBQUFBLFFBQzFCLENBQUMscUJBQXFCLFlBQVk7QUFBQSxNQUNuQyxDQUFDO0FBQ0QsWUFBTSxtQkFBbUIsb0JBQUksSUFBSTtBQUFBLFFBQ2hDLENBQUMsOEJBQThCLEVBQUUsVUFBVSxjQUFjLFlBQVksb0JBQW9CLENBQUM7QUFBQSxNQUMzRixDQUFDO0FBRUQsWUFBTSxPQUFPLFdBQVcsRUFBRSxRQUFRLGlCQUFpQixDQUFDO0FBRXBELFlBQU0sU0FBUyxNQUFNLEtBQUssc0JBQXNCO0FBQUEsUUFDL0MsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsT0FBTyw2QkFBNkI7QUFBQSxRQUM1RixZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLE1BQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFFekIsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxtREFBbUQsWUFBWTtBQUNuRSxZQUFNLFdBQVcsZUFBZSxVQUFVLENBQUM7QUFDM0MsWUFBTSxZQUFZLGVBQWUsZUFBZSxDQUFDO0FBQ2pELFlBQU0sZUFBZSxlQUFlLGlCQUFpQixDQUFDO0FBQ3RELFlBQU0sU0FBUyxvQkFBSSxJQUFJO0FBQUEsUUFDdEIsQ0FBQyxpQkFBaUIsUUFBUTtBQUFBLFFBQzFCLENBQUMsa0JBQWtCLFNBQVM7QUFBQSxRQUM1QixDQUFDLHFCQUFxQixZQUFZO0FBQUEsTUFDbkMsQ0FBQztBQUNELFlBQU0sbUJBQW1CLG9CQUFJLElBQUk7QUFBQSxRQUNoQyxDQUFDLDRCQUE0QixFQUFFLFVBQVUsV0FBVyxZQUFZLGlCQUFpQixDQUFDO0FBQUEsUUFDbEYsQ0FBQyw4QkFBOEIsRUFBRSxVQUFVLGNBQWMsWUFBWSxvQkFBb0IsQ0FBQztBQUFBLE1BQzNGLENBQUM7QUFFRCxZQUFNLFFBQVEsWUFBWSxXQUFXLENBQUMsMEJBQTBCLENBQUM7QUFDakUsWUFBTSxPQUFPLFdBQVcsRUFBRSxRQUFRLGtCQUFrQixjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7QUFFM0UsWUFBTSxTQUFTLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxRQUMvQyxZQUFZLEVBQUUsUUFBUSxRQUFRLGFBQWEsYUFBYSxXQUFXLFdBQVcsT0FBTyw2QkFBNkI7QUFBQSxRQUNsSCxZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLE1BQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFFekIsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxnQkFBZ0IsT0FBTyxrQkFBa0I7QUFBQSxRQUMvQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwREFBMEQsWUFBWTtBQUMxRSxZQUFNLFdBQVcsZUFBZSxVQUFVLENBQUM7QUFDM0MsWUFBTSxnQkFBZ0IsZUFBZSxVQUFVLEVBQUU7QUFDakQsWUFBTSxTQUFTLG9CQUFJLElBQUk7QUFBQSxRQUN0QixDQUFDLGlCQUFpQixRQUFRO0FBQUEsUUFDMUIsQ0FBQyxzQkFBc0IsYUFBYTtBQUFBLE1BQ3JDLENBQUM7QUFDRCxZQUFNLG1CQUFtQixvQkFBSSxJQUFJO0FBQUEsUUFDaEMsQ0FBQyx1QkFBdUIsRUFBRSxVQUFVLGVBQWUsWUFBWSxxQkFBcUIsQ0FBQztBQUFBLE1BQ3RGLENBQUM7QUFFRCxZQUFNLE9BQU8sV0FBVyxFQUFFLFFBQVEsaUJBQWlCLENBQUM7QUFFcEQsWUFBTSxPQUFPO0FBQUEsUUFDWixNQUFNLEtBQUssc0JBQXNCO0FBQUEsVUFDaEMsWUFBWSxFQUFFLFFBQVEsUUFBUSxhQUFhLGFBQWEsT0FBTyxzQkFBc0I7QUFBQSxVQUNyRixZQUFZO0FBQUEsVUFDWixTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxNQUFNLGdCQUFnQjtBQUFBLFFBQ2hELEdBQUcsa0JBQWtCLElBQUk7QUFBQSxRQUN6QixDQUFDLFFBQWU7QUFDZixpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUN4QyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUN6QyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFdBQVcsQ0FBQztBQUMzQyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLGFBQWEsQ0FBQztBQUM3QyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1RUFBdUUsWUFBWTtBQUN2RixZQUFNLFdBQVcsZUFBZSxVQUFVLENBQUM7QUFDM0MsWUFBTSxZQUFZLGVBQWUsaUJBQWlCLENBQUM7QUFDbkQsWUFBTSxTQUFTLG9CQUFJLElBQUk7QUFBQSxRQUN0QixDQUFDLGlCQUFpQixRQUFRO0FBQUEsUUFDMUIsQ0FBQyxrQkFBa0IsU0FBUztBQUFBLE1BQzdCLENBQUM7QUFFRCxZQUFNLE9BQU8sV0FBVyxFQUFFLFFBQVEsa0JBQWtCLG9CQUFJLElBQUksRUFBRSxDQUFDO0FBRS9ELFlBQU0sT0FBTztBQUFBLFFBQ1osTUFBTSxLQUFLLHNCQUFzQjtBQUFBLFVBQ2hDLFlBQVksRUFBRSxRQUFRLFFBQVEsYUFBYSxhQUFhLE9BQU8sNkJBQTZCO0FBQUEsVUFDNUYsWUFBWTtBQUFBLFVBQ1osU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxRQUNoRCxHQUFHLGtCQUFrQixJQUFJO0FBQUEsUUFDekIsQ0FBQyxRQUFlO0FBQ2YsaUJBQU8sR0FBRyxJQUFJLFFBQVEsU0FBUyw0QkFBNEIsQ0FBQztBQUM1RCxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLFdBQVcsQ0FBQztBQUMzQyxpQkFBTyxHQUFHLElBQUksUUFBUSxTQUFTLG1CQUFtQixDQUFDO0FBQ25ELGlCQUFPLEdBQUcsSUFBSSxRQUFRLFNBQVMscUJBQXFCLENBQUM7QUFDckQsaUJBQU8sR0FBRyxJQUFJLFFBQVEsU0FBUyw0QkFBNEIsQ0FBQztBQUM1RCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxvRUFBb0UsWUFBWTtBQUNwRixZQUFNLE9BQU8sV0FBVyxFQUFFLFFBQVEsb0JBQUksSUFBSSxHQUFHLGtCQUFrQixvQkFBSSxJQUFJLEVBQUUsQ0FBQztBQUUxRSxZQUFNLE9BQU87QUFBQSxRQUNaLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxVQUNoQyxZQUFZLEVBQUUsUUFBUSxRQUFRLGFBQWEsYUFBYSxPQUFPLDZCQUE2QjtBQUFBLFVBQzVGLFlBQVk7QUFBQSxVQUNaLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsUUFDaEQsR0FBRyxrQkFBa0IsSUFBSTtBQUFBLFFBQ3pCLENBQUMsUUFBZTtBQUNmLGlCQUFPLEdBQUcsSUFBSSxRQUFRLFNBQVMsNEJBQTRCLENBQUM7QUFDNUQsaUJBQU8sR0FBRyxJQUFJLFFBQVEsU0FBUyxXQUFXLENBQUM7QUFDM0MsaUJBQU8sR0FBRyxJQUFJLFFBQVEsU0FBUyxxQkFBcUIsQ0FBQztBQUNyRCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxrQ0FBa0MsTUFBTTtBQUs3QyxRQUFJLGdCQUFnQjtBQUNwQixhQUFTLG9CQUFvQixNQUkxQjtBQUNGLFlBQU0sbUJBQW1CLGdCQUFnQixJQUFJLElBQUksOEJBQThCLENBQUM7QUFDaEYsWUFBTSxnQkFBZ0IsSUFBSSx5QkFBeUI7QUFBQSxRQUNsRCxDQUFDLGtCQUFrQixzQ0FBc0MsR0FBRyxLQUFLO0FBQUEsTUFDbEUsQ0FBQztBQUNELFlBQU0saUJBQWlCLElBQUksbUJBQW1CO0FBRTlDLFlBQU0sdUJBQW1GO0FBQUEsUUFDeEYsa0JBQWtCO0FBQ2pCLGlCQUFPLEVBQUUsSUFBSSxnQkFBZ0I7QUFBQSxRQUM5QjtBQUFBLFFBQ0EsTUFBTSxZQUFZLEtBQWEsU0FBNEIsV0FBNkMsVUFBb0MsUUFBc0Q7QUFDak0sZUFBSyxpQkFBaUIsS0FBSyxPQUFPO0FBQ2xDLGlCQUFPLENBQUM7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUVBLFlBQU0sa0JBQW9EO0FBQUEsUUFDekQsYUFBYTtBQUNaLGlCQUFPO0FBQUEsWUFDTixhQUFhLE1BQU0sQ0FBQztBQUFBLGNBQ25CLElBQUk7QUFBQSxjQUNKLFVBQVUsS0FBSywwQkFBMEI7QUFBQSxnQkFDeEMsTUFBTTtBQUFBLGdCQUNOLFdBQVc7QUFBQSxnQkFDWCxrQkFBa0IsS0FBSztBQUFBLGdCQUN2QixpQkFBaUI7QUFBQSxnQkFDakIsNEJBQTRCO0FBQUEsY0FDN0IsSUFBSTtBQUFBLFlBQ0wsQ0FBQztBQUFBLFlBQ0Qsd0JBQXdCLE1BQU07QUFBQSxZQUFFO0FBQUEsVUFDakM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFlBQU0sMkJBQTBFO0FBQUEsUUFDL0Usa0JBQWtCLE9BQWtEO0FBQ25FLGlCQUFPLEVBQUUsU0FBUyxZQUFZO0FBQUEsVUFBRSxFQUFFO0FBQUEsUUFDbkM7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFPLGdCQUFnQixJQUFJLElBQUk7QUFBQSxRQUNwQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDO0FBQUEsUUFDRCxJQUFJLGVBQWU7QUFBQSxRQUNuQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDO0FBQUEsTUFDRixDQUFDO0FBRUQsYUFBTyxFQUFFLE1BQU0scUJBQXFCO0FBQUEsSUFDckM7QUFFQSxhQUFTLGlCQUFpQixZQUFpQixtQkFBd0Q7QUFDbEcsYUFBTztBQUFBLFFBQ04sUUFBUSxRQUFRLEVBQUUsYUFBYTtBQUFBLFFBQy9CLFFBQVE7QUFBQSxRQUNSLFlBQVksRUFBRSxRQUFRLGdCQUFnQixhQUFhLE9BQU87QUFBQSxRQUMxRCxTQUFTLEVBQUUsaUJBQWlCLFdBQVc7QUFBQSxRQUN2QyxtQkFBbUIscUJBQXFCLEVBQUUsYUFBYSxLQUFLO0FBQUEsTUFDN0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLFlBQVk7QUFDaEMsVUFBTSxhQUEyQixFQUFFLFNBQVM7QUFBQSxJQUFFLEVBQUU7QUFFaEQsU0FBSyxzREFBc0QsWUFBWTtBQUN0RSxZQUFNLG1CQUF3QyxDQUFDO0FBQy9DLFlBQU0sRUFBRSxLQUFLLElBQUksb0JBQW9CLEVBQUUsK0JBQStCLE9BQU8saUJBQWlCLENBQUM7QUFDL0YsWUFBTSxhQUFhLElBQUksTUFBTSx1QkFBdUI7QUFFcEQsWUFBTSxLQUFLLE9BQU8saUJBQWlCLFVBQVUsR0FBRyxhQUFhLFlBQVksa0JBQWtCLElBQUk7QUFFL0YsYUFBTyxZQUFZLGlCQUFpQixRQUFRLENBQUM7QUFDN0MsYUFBTyxZQUFZLGlCQUFpQixDQUFDLEVBQUUsb0JBQW9CLGFBQWEsR0FBRyxLQUFLO0FBQUEsSUFDakYsQ0FBQztBQUVELFNBQUssK0RBQStELFlBQVk7QUFDL0UsWUFBTSxtQkFBd0MsQ0FBQztBQUMvQyxZQUFNLEVBQUUsS0FBSyxJQUFJLG9CQUFvQixFQUFFLCtCQUErQixNQUFNLGlCQUFpQixDQUFDO0FBQzlGLFlBQU0sYUFBYSxJQUFJLE1BQU0sOEJBQThCO0FBRTNELFlBQU0sS0FBSyxPQUFPLGlCQUFpQixVQUFVLEdBQUcsYUFBYSxZQUFZLGtCQUFrQixJQUFJO0FBRS9GLGFBQU8sWUFBWSxpQkFBaUIsUUFBUSxDQUFDO0FBQzdDLGFBQU8sWUFBWSxpQkFBaUIsQ0FBQyxFQUFFLG9CQUFvQixhQUFhLEdBQUcsSUFBSTtBQUFBLElBQ2hGLENBQUM7QUFFRCxTQUFLLDJEQUEyRCxZQUFZO0FBQzNFLFlBQU0sbUJBQXdDLENBQUM7QUFDL0MsWUFBTSxhQUFhLElBQUksTUFBTSw0QkFBNEI7QUFJekQsWUFBTSxFQUFFLE1BQU0scUJBQXFCLElBQUksb0JBQW9CLEVBQUUsK0JBQStCLE1BQU0saUJBQWlCLENBQUM7QUFJcEgsdUJBQWlCLFNBQVM7QUFDMUIsVUFBSSxvQkFBb0I7QUFDeEIsMkJBQXFCLGNBQWMsT0FBTyxLQUFhLFlBQStCO0FBQ3JGLHlCQUFpQixLQUFLLE9BQU87QUFFN0IsWUFBSSxzQkFBc0IsaUNBQWlDLEdBQUc7QUFDN0QsZ0JBQU0sS0FBSyxPQUFPLGlCQUFpQixVQUFVLEdBQUcsYUFBYSxZQUFZLGtCQUFrQixJQUFJO0FBQUEsUUFDaEc7QUFDQSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBRUEsWUFBTSxLQUFLLE9BQU8saUJBQWlCLFVBQVUsR0FBRyxhQUFhLFlBQVksa0JBQWtCLElBQUk7QUFFL0YsYUFBTyxHQUFHLGlCQUFpQixVQUFVLENBQUM7QUFFdEMsWUFBTSxlQUFlLGlCQUFpQixJQUFJLE9BQUssRUFBRSxvQkFBb0IsYUFBYSxDQUFDO0FBQ25GLGFBQU8sWUFBWSxhQUFhLENBQUMsR0FBRyxJQUFJO0FBQ3hDLGFBQU8sWUFBWSxhQUFhLENBQUMsR0FBRyxJQUFJO0FBQ3hDLGFBQU8sWUFBWSxhQUFhLDhCQUE4QixHQUFHLEtBQUs7QUFBQSxJQUN2RSxDQUFDO0FBRUQsU0FBSywrQ0FBK0MsWUFBWTtBQUMvRCxZQUFNLG1CQUF3QyxDQUFDO0FBQy9DLFlBQU0sRUFBRSxLQUFLLElBQUksb0JBQW9CLEVBQUUsK0JBQStCLE1BQU0saUJBQWlCLENBQUM7QUFDOUYsWUFBTSxhQUFhLElBQUksTUFBTSxnQ0FBZ0M7QUFHN0QsWUFBTSxLQUFLLE9BQU8saUJBQWlCLFVBQVUsR0FBRyxhQUFhLFlBQVksa0JBQWtCLElBQUk7QUFFL0YsWUFBTSxLQUFLLE9BQU8saUJBQWlCLFVBQVUsR0FBRyxhQUFhLFlBQVksa0JBQWtCLElBQUk7QUFFL0YsYUFBTyxZQUFZLGlCQUFpQixRQUFRLENBQUM7QUFFN0MsYUFBTyxZQUFZLGlCQUFpQixDQUFDLEVBQUUsb0JBQW9CLGFBQWEsR0FBRyxJQUFJO0FBQy9FLGFBQU8sWUFBWSxpQkFBaUIsQ0FBQyxFQUFFLG9CQUFvQixhQUFhLEdBQUcsSUFBSTtBQUFBLElBQ2hGLENBQUM7QUFFRCxTQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFlBQU0sbUJBQXdDLENBQUM7QUFDL0MsWUFBTSwwQkFBMEIsRUFBRSxNQUFNLGdCQUFnQixTQUFTLDhCQUE4QixnQkFBZ0IsQ0FBQyxFQUFFO0FBQ2xILFlBQU0sRUFBRSxLQUFLLElBQUksb0JBQW9CLEVBQUUsK0JBQStCLE9BQU8sa0JBQWtCLHdCQUF3QixDQUFDO0FBQ3hILFlBQU0sYUFBYSxJQUFJLE1BQU0sOEJBQThCO0FBRTNELFlBQU0sS0FBSyxPQUFPLGlCQUFpQixVQUFVLEdBQUcsYUFBYSxZQUFZLGtCQUFrQixJQUFJO0FBRS9GLGFBQU8sWUFBWSxpQkFBaUIsUUFBUSxDQUFDO0FBQzdDLGFBQU8sWUFBWSxpQkFBaUIsQ0FBQyxFQUFFLGNBQWMsY0FBYztBQUNuRSxhQUFPLGdCQUFnQixpQkFBaUIsQ0FBQyxFQUFFLGtCQUFrQix1QkFBdUI7QUFBQSxJQUNyRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxvQkFBb0IsTUFBTTtBQUMvQixRQUFJLHVCQUF1QjtBQU8zQixhQUFTLGlCQUFpQixZQUE2QixTQUEyQixDQUFDLEdBQUc7QUFDckYsWUFBTSxtQkFBbUIsZ0JBQWdCLElBQUksSUFBSSw4QkFBOEIsQ0FBQztBQUNoRixZQUFNLGdCQUFnQixJQUFJLHlCQUF5QjtBQUNuRCxZQUFNLGlCQUFpQixJQUFJLG1CQUFtQjtBQUM5QyxZQUFNLGdCQUFzRSxDQUFDO0FBRTdFLFlBQU0sdUJBQW1GO0FBQUEsUUFDeEYsa0JBQWtCO0FBQ2pCLGlCQUFPLEVBQUUsSUFBSSxnQkFBZ0I7QUFBQSxRQUM5QjtBQUFBLFFBQ0EsTUFBTSxZQUFZLEtBQWEsVUFBNkIsVUFBdUU7QUFDbEksbUJBQVMsVUFBVTtBQUNuQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBRUEsWUFBTSxrQkFBb0Q7QUFBQSxRQUN6RCxhQUFhO0FBQ1osaUJBQU87QUFBQSxZQUNOLGFBQWEsTUFBTSxDQUFDO0FBQUEsY0FDbkIsSUFBSTtBQUFBLGNBQ0osVUFBVTtBQUFBLGdCQUNULDJCQUEyQixDQUFDLGdCQUF3QixtQkFBMkIsY0FBYyxLQUFLLEVBQUUsZ0JBQWdCLGVBQWUsQ0FBQztBQUFBLGNBQ3JJO0FBQUEsWUFDRCxDQUFDO0FBQUEsWUFDRCx3QkFBd0IsTUFBTTtBQUFBLFlBQUU7QUFBQSxVQUNqQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsWUFBTSwyQkFBMEU7QUFBQSxRQUMvRSxrQkFBa0IsT0FBa0Q7QUFDbkUsaUJBQU8sRUFBRSxTQUFTLFlBQVk7QUFBQSxVQUFFLEVBQUU7QUFBQSxRQUNuQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQU8sZ0JBQWdCLElBQUksSUFBSTtBQUFBLFFBQ3BDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNELElBQUksZUFBZTtBQUFBLFFBQ25CO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxhQUFPLEVBQUUsTUFBTSxjQUFjO0FBQUEsSUFDOUI7QUFFQSxhQUFTLHlCQUF5QixzQkFBZ0Q7QUFDakYsYUFBTztBQUFBLFFBQ04sUUFBUSxnQkFBZ0IsRUFBRSxvQkFBb0I7QUFBQSxRQUM5QztBQUFBLFFBQ0EsUUFBUTtBQUFBLFFBQ1IsWUFBWSxFQUFFLFFBQVEsZ0JBQWdCLGFBQWEsT0FBTztBQUFBLFFBQzFELFNBQVMsRUFBRSxpQkFBaUIsSUFBSSxNQUFNLHdCQUF3QixFQUFFO0FBQUEsUUFDaEUsbUJBQW1CLEVBQUUsYUFBYSxLQUFLO0FBQUEsUUFDdkMsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLGFBQWEsT0FBTztBQUFBLE1BQzNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyxZQUFZO0FBQ2hDLFVBQU0sYUFBMkIsRUFBRSxTQUFTO0FBQUEsSUFBRSxFQUFFO0FBRWhELFNBQUssc0VBQXNFLFlBQVk7QUFFdEYsWUFBTSxFQUFFLE1BQU0sY0FBYyxJQUFJLGlCQUFpQjtBQUFBLFFBQ2hELEVBQUUsTUFBTSxTQUFTLGNBQWMsSUFBSSxrQkFBa0IsR0FBRyxnQkFBZ0IsRUFBRTtBQUFBLFFBQzFFLEVBQUUsTUFBTSxTQUFTLGNBQWMsSUFBSSxrQkFBa0IsR0FBRyxnQkFBZ0IsRUFBRTtBQUFBLFFBQzFFLEVBQUUsTUFBTSxTQUFTLGNBQWMsSUFBSSxrQkFBa0IsR0FBRyxnQkFBZ0IsRUFBRTtBQUFBLE1BQzNFLENBQUM7QUFDRCxZQUFNLGFBQWEseUJBQXlCLGtCQUFrQjtBQUU5RCxZQUFNLEtBQUssT0FBTyxZQUFZLGFBQWEsWUFBWSxrQkFBa0IsSUFBSTtBQUU3RSxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLGFBQWEsV0FBVyxrQkFBa0IsU0FBUyxhQUFhLFdBQVcsaUJBQWlCLFVBQVU7QUFBQSxRQUN0RztBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0YsYUFBYTtBQUFBLFFBQ2IsZUFBZSxDQUFDLEVBQUUsZ0JBQWdCLFdBQVcsUUFBUSxnQkFBZ0IsRUFBRSxDQUFDO0FBQUEsTUFDekUsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssaUVBQWlFLFlBQVk7QUFDakYsWUFBTSxFQUFFLE1BQU0sY0FBYyxJQUFJO0FBQUEsUUFDL0IsQ0FBQyxFQUFFLE1BQU0sU0FBUyxjQUFjLElBQUksa0JBQWtCLEdBQUcsZ0JBQWdCLEVBQUUsQ0FBQztBQUFBLFFBQzVFLEVBQUUsY0FBYyxFQUFFLFNBQVMsU0FBUyxFQUFFO0FBQUEsTUFDdkM7QUFDQSxZQUFNLGFBQWEseUJBQXlCO0FBRTVDLFlBQU0sS0FBSyxPQUFPLFlBQVksYUFBYSxZQUFZLGtCQUFrQixJQUFJO0FBRTdFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsYUFBYSxXQUFXLGtCQUFrQixTQUFTLGFBQWEsV0FBVyxpQkFBaUIsVUFBVTtBQUFBLFFBQ3RHO0FBQUEsTUFDRCxHQUFHO0FBQUEsUUFDRixhQUFhO0FBQUEsUUFDYixlQUFlLENBQUMsRUFBRSxnQkFBZ0IsV0FBVyxRQUFRLGdCQUFnQixFQUFFLENBQUM7QUFBQSxNQUN6RSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxrREFBa0QsWUFBWTtBQUNsRSxZQUFNLEVBQUUsS0FBSyxJQUFJLGlCQUFpQixDQUFDLENBQUM7QUFDcEMsWUFBTSxhQUFhLHlCQUF5QjtBQUU1QyxZQUFNLEtBQUssT0FBTyxZQUFZLGFBQWEsWUFBWSxrQkFBa0IsSUFBSTtBQUU3RSxhQUFPLFlBQVksV0FBVyxrQkFBa0IsU0FBUyxhQUFhLFdBQVcsaUJBQWlCLFVBQVUsUUFBVyxNQUFTO0FBQUEsSUFDakksQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
