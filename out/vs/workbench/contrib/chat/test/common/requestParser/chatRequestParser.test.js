import { mockObject } from "../../../../../../base/test/common/mock.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IExtensionService, nullExtensionDescription } from "../../../../../services/extensions/common/extensions.js";
import { TestExtensionService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatRequestParser } from "../../../common/requestParser/chatRequestParser.js";
import { ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, getPromptText } from "../../../common/requestParser/chatParserTypes.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSlashCommandService } from "../../../common/participants/chatSlashCommands.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { IChatVariablesService } from "../../../common/attachments/chatVariables.js";
import { chatReferenceVariableEntryId, toChatReferenceDynamicVariableValue } from "../../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ToolAndToolSetEnablementMap, ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { MockChatService } from "../chatService/mockChatService.js";
import { MockChatVariablesService } from "../mockChatVariables.js";
import { MockPromptsService } from "../promptSyntax/service/mockPromptsService.js";
import assert from "assert";
const testSessionUri = LocalChatSessionUri.forSession("test-session");
suite("ChatRequestParser", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let parser;
  let variableService;
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IPromptsService, testDisposables.add(new MockPromptsService()));
    variableService = new MockChatVariablesService();
    instantiationService.stub(IChatVariablesService, variableService);
  });
  test("plain text", async () => {
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "test");
    await assertSnapshot(result);
  });
  test("plain text with newlines", async () => {
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "line 1\nline 2\r\nline 3";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("inline attachment reference only preserves reference metadata", () => {
    const text = "compare #attachment:design.png here";
    variableService.setDynamicVariables(testSessionUri, [{
      id: "image-1",
      fullName: "design.png",
      range: new Range(1, 9, 1, 31),
      isAttachmentReference: true,
      data: void 0
    }]);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, text);
    const part = result.parts.find((part2) => part2 instanceof ChatRequestDynamicVariablePart);
    const entry = part?.toVariableEntry();
    assert.deepStrictEqual({
      kind: entry?.kind,
      id: entry?.id,
      name: entry?.name,
      range: entry?.range && { start: entry.range.start, endExclusive: entry.range.endExclusive },
      value: entry?.value,
      fullName: entry?.fullName,
      hasAttachment: part ? Object.hasOwn(part, "attachment") : void 0,
      isAttachmentReference: part?.isAttachmentReference
    }, {
      kind: "generic",
      id: "image-1",
      name: "attachment:design.png",
      range: { start: 8, endExclusive: 30 },
      value: void 0,
      fullName: "design.png",
      hasAttachment: false,
      isAttachmentReference: true
    });
  });
  test("multi-word #chat reference preserves its range through toVariableEntry", () => {
    const chatResource = URI.parse("ahp-chat://chat-2/base64session");
    const text = "what did I ask about in #chat:circuit-breaker testing coverage summary ?";
    const tokenStart = text.indexOf("#chat:");
    const tokenEnd = tokenStart + "#chat:circuit-breaker testing coverage summary".length;
    variableService.setDynamicVariables(testSessionUri, [{
      id: chatReferenceVariableEntryId(chatResource, "turn-5"),
      fullName: "circuit-breaker testing coverage summary",
      range: new Range(1, tokenStart + 1, 1, tokenEnd + 1),
      data: toChatReferenceDynamicVariableValue(chatResource, "turn-5")
    }]);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, text);
    const part = result.parts.find((part2) => part2 instanceof ChatRequestDynamicVariablePart);
    const entry = part?.toVariableEntry();
    assert.deepStrictEqual({
      kind: entry?.kind,
      range: entry?.range && { start: entry.range.start, endExclusive: entry.range.endExclusive }
    }, {
      kind: "chatReference",
      range: { start: tokenStart, endExclusive: tokenEnd }
    });
  });
  test("slash in text", async () => {
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "can we add a new file for an Express router to handle the / route";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("slash command", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/fix this";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("invalid slash command", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/explain this";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("multiple slash commands", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/fix /fix";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("slash command not first", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "Hello /fix";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("slash command after whitespace", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "    /fix   keep indentation";
    const result = parser.parseChatRequest(testSessionUri, text);
    assert.deepStrictEqual({
      parts: result.parts.map((part) => ({
        kind: part.kind,
        range: part.range ? { start: part.range.start, endExclusive: part.range.endExclusive } : void 0
      })),
      promptText: getPromptText(result)
    }, {
      parts: [
        { kind: "text", range: { start: 0, endExclusive: 4 } },
        { kind: "slash", range: { start: 4, endExclusive: 8 } },
        { kind: "text", range: { start: 8, endExclusive: 27 } }
      ],
      promptText: { message: "/fix   keep indentation", diff: 4 }
    });
  });
  test("prompt slash command", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "    /prompt";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt slash command after text", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "handle the / route and the request of /search-option";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt slash command after slash", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/ route and the request of /search-option";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt slash command with numbers", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const text = "/001-sample this is a test";
    const result = parser.parseChatRequest(testSessionUri, text);
    await assertSnapshot(result);
  });
  test("prompt subcommand via space form resolves to colon-named prompt", () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.returns(true);
    promptsService.hasPromptSlashCommand.callsFake((name) => name === "chronicle:tips");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/chronicle tips show me insights");
    const slashPart = result.parts.find((part) => part.kind === "prompt");
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      kind: slashPart?.kind,
      name: slashPart?.name,
      text: slashPart?.text,
      trailing: result.parts[result.parts.length - 1]?.text
    }, {
      kinds: ["prompt", "text"],
      kind: "prompt",
      name: "chronicle:tips",
      text: "/chronicle tips",
      trailing: " show me insights"
    });
  });
  test("prompt subcommand via colon form is unchanged", () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.returns(true);
    promptsService.hasPromptSlashCommand.callsFake((name) => name === "chronicle:tips");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/chronicle:tips show me insights");
    const slashPart = result.parts.find((part) => part.kind === "prompt");
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      kind: slashPart?.kind,
      name: slashPart?.name,
      text: slashPart?.text,
      trailing: result.parts[result.parts.length - 1]?.text
    }, {
      kinds: ["prompt", "text"],
      kind: "prompt",
      name: "chronicle:tips",
      text: "/chronicle:tips",
      trailing: " show me insights"
    });
  });
  test("space form does not extend when no `<cmd>:<sub>` matches", () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.returns(true);
    promptsService.hasPromptSlashCommand.returns(false);
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/nonexistent tips");
    const slashPart = result.parts.find((part) => part.kind === "prompt");
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      name: slashPart?.name,
      text: slashPart?.text,
      trailing: result.parts[result.parts.length - 1]?.text
    }, {
      kinds: ["prompt", "text"],
      name: "nonexistent",
      text: "/nonexistent",
      trailing: " tips"
    });
  });
  const getAgentWithSlashCommands = (slashCommands) => {
    return { id: "agent", name: "agent", extensionId: nullExtensionDescription.identifier, extensionVersion: void 0, publisherDisplayName: "", extensionDisplayName: "", extensionPublisherId: "", locations: [ChatAgentLocation.Chat], modes: [ChatModeKind.Ask], metadata: {}, slashCommands, disambiguation: [] };
  };
  test("agent host: forcedAgent + supportsPromptAttachments revives /skill as prompt slash part", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const forcedAgent = { ...getAgentWithSlashCommands([]), capabilities: { supportsPromptAttachments: true } };
    const result = parser.parseChatRequestWithReferences(
      [],
      ToolAndToolSetEnablementMap.fromEntries([]),
      "/skill plan run a quick plan",
      ChatAgentLocation.Chat,
      { sessionType: "agent-host-copilot", forcedAgent, attachmentCapabilities: forcedAgent.capabilities }
    );
    await assertSnapshot(result);
  });
  test("agent host: forcedAgent does not fall back to default agent subcommand", () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getDefaultAgent.returns(getAgentWithSlashCommands([{ name: "compact", description: "" }]));
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "compact");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const forcedAgent = { ...getAgentWithSlashCommands([]), capabilities: { supportsPromptAttachments: true } };
    const result = parser.parseChatRequestWithReferences(
      [],
      ToolAndToolSetEnablementMap.fromEntries([]),
      "/compact",
      ChatAgentLocation.Chat,
      { sessionType: "agent-host-copilot", forcedAgent, attachmentCapabilities: forcedAgent.capabilities, mode: ChatModeKind.Agent }
    );
    assert.deepStrictEqual({
      hasSubcommand: result.parts.some((part) => part.kind === ChatRequestAgentSubcommandPart.Kind),
      message: getPromptText(result).message
    }, { hasSubcommand: false, message: "/compact" });
  });
  test("agent host: missing forcedAgent still revives /skill via no-agent branch", async () => {
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequestWithReferences(
      [],
      ToolAndToolSetEnablementMap.fromEntries([]),
      "/skill plan run a quick plan",
      ChatAgentLocation.Chat,
      { sessionType: "agent-host-copilot" }
    );
    await assertSnapshot(result);
  });
  test("default agent subcommand still applies when no agent is selected", () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getDefaultAgent.returns(getAgentWithSlashCommands([{ name: "compact", description: "" }]));
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "/compact", ChatAgentLocation.Chat, { mode: ChatModeKind.Agent });
    assert.deepStrictEqual({
      kinds: result.parts.map((part) => part.kind),
      message: getPromptText(result).message
    }, { kinds: [ChatRequestAgentSubcommandPart.Kind], message: "" });
  });
  test("agent with subcommand after text", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent Please do /subCommand thanks");
    await assertSnapshot(result);
  });
  test("agents, subCommand", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /subCommand Please do thanks");
    await assertSnapshot(result);
  });
  test("agent but edit mode", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent hello", void 0, { mode: ChatModeKind.Edit });
    await assertSnapshot(result);
  });
  test("agent with question mark", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent? Are you there");
    await assertSnapshot(result);
  });
  test("agent and subcommand with leading whitespace", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "    \r\n	   @agent \r\n	   /subCommand Thanks");
    await assertSnapshot(result);
  });
  test("agent and subcommand after newline", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "    \n@agent\n/subCommand Thanks");
    await assertSnapshot(result);
  });
  test("agent not first", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "Hello Mr. @agent");
    await assertSnapshot(result);
  });
  test("agents and tools and multiline", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    variableService.setSelectedToolAndToolSets(testSessionUri, ToolAndToolSetEnablementMap.fromEntries([
      [{ id: "get_selection", toolReferenceName: "selection", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true],
      [{ id: "get_debugConsole", toolReferenceName: "debugConsole", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true]
    ]));
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /subCommand \nPlease do with #selection\nand #debugConsole");
    await assertSnapshot(result);
  });
  test("agents and tools and multiline, part2", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    variableService.setSelectedToolAndToolSets(testSessionUri, ToolAndToolSetEnablementMap.fromEntries([
      [{ id: "get_selection", toolReferenceName: "selection", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true],
      [{ id: "get_debugConsole", toolReferenceName: "debugConsole", canBeReferencedInPrompt: true, displayName: "", modelDescription: "", source: ToolDataSource.Internal }, true]
    ]));
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent Please \ndo /subCommand with #selection\nand #debugConsole");
    await assertSnapshot(result);
  });
  test("prompt slash command with agent and supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /myPrompt do something", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: true }
    });
    await assertSnapshot(result);
  });
  test("prompt slash command with agent but no supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /myPrompt do something", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: false }
    });
    await assertSnapshot(result);
  });
  test("agent subcommand still takes priority with supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    const promptSlashCommandService = mockObject()({ _serviceBrand: void 0 });
    promptSlashCommandService.isValidSlashCommandName.callsFake((command) => {
      return !!command.match(/^[\w_\-\.]+$/);
    });
    instantiationService.stub(IPromptsService, promptSlashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /subCommand do something", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: true }
    });
    await assertSnapshot(result);
  });
  test("slash command with agent and supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /fix this", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: true }
    });
    await assertSnapshot(result);
  });
  test("silent slash command with agent and no supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "clear", silent: true }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /clear", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: false }
    });
    await assertSnapshot(result);
  });
  test("non-silent slash command with agent and no supportsPromptAttachments", async () => {
    const agentsService = mockObject()({ _serviceBrand: void 0, hasToolsAgent: false, onDidChangeAgents: Event.None });
    agentsService.getAgentsByName.returns([getAgentWithSlashCommands([{ name: "subCommand", description: "" }])]);
    instantiationService.stub(IChatAgentService, agentsService);
    const slashCommandService = mockObject()({ _serviceBrand: void 0 });
    slashCommandService.getCommands.returns([{ command: "fix" }]);
    instantiationService.stub(IChatSlashCommandService, slashCommandService);
    parser = instantiationService.createInstance(ChatRequestParser);
    const result = parser.parseChatRequest(testSessionUri, "@agent /fix this", void 0, {
      attachmentCapabilities: { supportsPromptAttachments: false }
    });
    await assertSnapshot(result);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UmVxdWVzdFBhcnNlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbW9ja09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEV4dGVuc2lvblNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50Q29tbWFuZCwgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFJlcXVlc3RQYXJzZXIuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQsIGdldFByb21wdFRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFNsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0VmFyaWFibGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IGNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5SWQsIHRvQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVRvb2xEYXRhLCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsIFRvb2xEYXRhU291cmNlLCBUb29sU2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi9tb2NrQ2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvc2VydmljZS9tb2NrUHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuXG5jb25zdCB0ZXN0U2Vzc2lvblVyaSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndGVzdC1zZXNzaW9uJyk7XG5cbnN1aXRlKCdDaGF0UmVxdWVzdFBhcnNlcicsICgpID0+IHtcblx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBwYXJzZXI6IENoYXRSZXF1ZXN0UGFyc2VyO1xuXG5cdGxldCB2YXJpYWJsZVNlcnZpY2U6IE1vY2tDaGF0VmFyaWFibGVzU2VydmljZTtcblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrUHJvbXB0c1NlcnZpY2UoKSkpO1xuXG5cdFx0dmFyaWFibGVTZXJ2aWNlID0gbmV3IE1vY2tDaGF0VmFyaWFibGVzU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRWYXJpYWJsZXNTZXJ2aWNlLCB2YXJpYWJsZVNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiB0ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiB0ZXh0IHdpdGggbmV3bGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnbGluZSAxXFxubGluZSAyXFxyXFxubGluZSAzJztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5saW5lIGF0dGFjaG1lbnQgcmVmZXJlbmNlIG9ubHkgcHJlc2VydmVzIHJlZmVyZW5jZSBtZXRhZGF0YScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ2NvbXBhcmUgI2F0dGFjaG1lbnQ6ZGVzaWduLnBuZyBoZXJlJztcblx0XHR2YXJpYWJsZVNlcnZpY2Uuc2V0RHluYW1pY1ZhcmlhYmxlcyh0ZXN0U2Vzc2lvblVyaSwgW3tcblx0XHRcdGlkOiAnaW1hZ2UtMScsXG5cdFx0XHRmdWxsTmFtZTogJ2Rlc2lnbi5wbmcnLFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCAxLCAzMSksXG5cdFx0XHRpc0F0dGFjaG1lbnRSZWZlcmVuY2U6IHRydWUsXG5cdFx0XHRkYXRhOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRjb25zdCBwYXJ0ID0gcmVzdWx0LnBhcnRzLmZpbmQoKHBhcnQpOiBwYXJ0IGlzIENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCA9PiBwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0KTtcblx0XHRjb25zdCBlbnRyeSA9IHBhcnQ/LnRvVmFyaWFibGVFbnRyeSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRraW5kOiBlbnRyeT8ua2luZCxcblx0XHRcdGlkOiBlbnRyeT8uaWQsXG5cdFx0XHRuYW1lOiBlbnRyeT8ubmFtZSxcblx0XHRcdHJhbmdlOiBlbnRyeT8ucmFuZ2UgJiYgeyBzdGFydDogZW50cnkucmFuZ2Uuc3RhcnQsIGVuZEV4Y2x1c2l2ZTogZW50cnkucmFuZ2UuZW5kRXhjbHVzaXZlIH0sXG5cdFx0XHR2YWx1ZTogZW50cnk/LnZhbHVlLFxuXHRcdFx0ZnVsbE5hbWU6IGVudHJ5Py5mdWxsTmFtZSxcblx0XHRcdGhhc0F0dGFjaG1lbnQ6IHBhcnQgPyBPYmplY3QuaGFzT3duKHBhcnQsICdhdHRhY2htZW50JykgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0F0dGFjaG1lbnRSZWZlcmVuY2U6IHBhcnQ/LmlzQXR0YWNobWVudFJlZmVyZW5jZSxcblx0XHR9LCB7XG5cdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRpZDogJ2ltYWdlLTEnLFxuXHRcdFx0bmFtZTogJ2F0dGFjaG1lbnQ6ZGVzaWduLnBuZycsXG5cdFx0XHRyYW5nZTogeyBzdGFydDogOCwgZW5kRXhjbHVzaXZlOiAzMCB9LFxuXHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdGZ1bGxOYW1lOiAnZGVzaWduLnBuZycsXG5cdFx0XHRoYXNBdHRhY2htZW50OiBmYWxzZSxcblx0XHRcdGlzQXR0YWNobWVudFJlZmVyZW5jZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGktd29yZCAjY2hhdCByZWZlcmVuY2UgcHJlc2VydmVzIGl0cyByYW5nZSB0aHJvdWdoIHRvVmFyaWFibGVFbnRyeScsICgpID0+IHtcblx0XHQvLyBUaGUgcmVmZXJlbmNlIGNhcnJpZXMgdGhlIG9wYXF1ZSBiYWNrZW5kIGNoYXQgVVJJIHZlcmJhdGltLlxuXHRcdGNvbnN0IGNoYXRSZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWhwLWNoYXQ6Ly9jaGF0LTIvYmFzZTY0c2Vzc2lvbicpO1xuXHRcdGNvbnN0IHRleHQgPSAnd2hhdCBkaWQgSSBhc2sgYWJvdXQgaW4gI2NoYXQ6Y2lyY3VpdC1icmVha2VyIHRlc3RpbmcgY292ZXJhZ2Ugc3VtbWFyeSA/Jztcblx0XHRjb25zdCB0b2tlblN0YXJ0ID0gdGV4dC5pbmRleE9mKCcjY2hhdDonKTtcblx0XHRjb25zdCB0b2tlbkVuZCA9IHRva2VuU3RhcnQgKyAnI2NoYXQ6Y2lyY3VpdC1icmVha2VyIHRlc3RpbmcgY292ZXJhZ2Ugc3VtbWFyeScubGVuZ3RoO1xuXHRcdHZhcmlhYmxlU2VydmljZS5zZXREeW5hbWljVmFyaWFibGVzKHRlc3RTZXNzaW9uVXJpLCBbe1xuXHRcdFx0aWQ6IGNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5SWQoY2hhdFJlc291cmNlLCAndHVybi01JyksXG5cdFx0XHRmdWxsTmFtZTogJ2NpcmN1aXQtYnJlYWtlciB0ZXN0aW5nIGNvdmVyYWdlIHN1bW1hcnknLFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCB0b2tlblN0YXJ0ICsgMSwgMSwgdG9rZW5FbmQgKyAxKSxcblx0XHRcdGRhdGE6IHRvQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlKGNoYXRSZXNvdXJjZSwgJ3R1cm4tNScpLFxuXHRcdH1dKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0Y29uc3QgcGFydCA9IHJlc3VsdC5wYXJ0cy5maW5kKChwYXJ0KTogcGFydCBpcyBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCk7XG5cdFx0Y29uc3QgZW50cnkgPSBwYXJ0Py50b1ZhcmlhYmxlRW50cnkoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZDogZW50cnk/LmtpbmQsXG5cdFx0XHRyYW5nZTogZW50cnk/LnJhbmdlICYmIHsgc3RhcnQ6IGVudHJ5LnJhbmdlLnN0YXJ0LCBlbmRFeGNsdXNpdmU6IGVudHJ5LnJhbmdlLmVuZEV4Y2x1c2l2ZSB9LFxuXHRcdH0sIHtcblx0XHRcdGtpbmQ6ICdjaGF0UmVmZXJlbmNlJyxcblx0XHRcdHJhbmdlOiB7IHN0YXJ0OiB0b2tlblN0YXJ0LCBlbmRFeGNsdXNpdmU6IHRva2VuRW5kIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NsYXNoIGluIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnY2FuIHdlIGFkZCBhIG5ldyBmaWxlIGZvciBhbiBFeHByZXNzIHJvdXRlciB0byBoYW5kbGUgdGhlIC8gcm91dGUnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzbGFzaCBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2ZpeCcgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJy9maXggdGhpcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgc2xhc2ggY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgdGV4dCA9ICcvZXhwbGFpbiB0aGlzJztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgc2xhc2ggY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnL2ZpeCAvZml4Jztcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2xhc2ggY29tbWFuZCBub3QgZmlyc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnSGVsbG8gL2ZpeCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NsYXNoIGNvbW1hbmQgYWZ0ZXIgd2hpdGVzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgdGV4dCA9ICcgICAgL2ZpeCAgIGtlZXAgaW5kZW50YXRpb24nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhcnRzOiByZXN1bHQucGFydHMubWFwKHBhcnQgPT4gKHtcblx0XHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0XHRyYW5nZTogcGFydC5yYW5nZSA/IHsgc3RhcnQ6IHBhcnQucmFuZ2Uuc3RhcnQsIGVuZEV4Y2x1c2l2ZTogcGFydC5yYW5nZS5lbmRFeGNsdXNpdmUgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pKSxcblx0XHRcdHByb21wdFRleHQ6IGdldFByb21wdFRleHQocmVzdWx0KSxcblx0XHR9LCB7XG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6ICd0ZXh0JywgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogNCB9IH0sXG5cdFx0XHRcdHsga2luZDogJ3NsYXNoJywgcmFuZ2U6IHsgc3RhcnQ6IDQsIGVuZEV4Y2x1c2l2ZTogOCB9IH0sXG5cdFx0XHRcdHsga2luZDogJ3RleHQnLCByYW5nZTogeyBzdGFydDogOCwgZW5kRXhjbHVzaXZlOiAyNyB9IH0sXG5cdFx0XHRdLFxuXHRcdFx0cHJvbXB0VGV4dDogeyBtZXNzYWdlOiAnL2ZpeCAgIGtlZXAgaW5kZW50YXRpb24nLCBkaWZmOiA0IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBzbGFzaCBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2ZpeCcgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElQcm9tcHRzU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gISFjb21tYW5kLm1hdGNoKC9eW1xcd19cXC1cXC5dKyQvKTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgdGV4dCA9ICcgICAgL3Byb21wdCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBzbGFzaCBjb21tYW5kIGFmdGVyIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnZml4JyB9XSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiAhIWNvbW1hbmQubWF0Y2goL15bXFx3X1xcLVxcLl0rJC8pO1xuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCB0ZXh0ID0gJ2hhbmRsZSB0aGUgLyByb3V0ZSBhbmQgdGhlIHJlcXVlc3Qgb2YgL3NlYXJjaC1vcHRpb24nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tcHQgc2xhc2ggY29tbWFuZCBhZnRlciBzbGFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0U2xhc2hDb21tYW5kU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvXltcXHdfXFwtXFwuXSskLyk7XG5cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgdGV4dCA9ICcvIHJvdXRlIGFuZCB0aGUgcmVxdWVzdCBvZiAvc2VhcmNoLW9wdGlvbic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21wdCBzbGFzaCBjb21tYW5kIHdpdGggbnVtYmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0U2xhc2hDb21tYW5kU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvXltcXHdfXFwtXFwuXSskLyk7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHRleHQgPSAnLzAwMS1zYW1wbGUgdGhpcyBpcyBhIHRlc3QnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCB0ZXh0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tcHQgc3ViY29tbWFuZCB2aWEgc3BhY2UgZm9ybSByZXNvbHZlcyB0byBjb2xvbi1uYW1lZCBwcm9tcHQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElQcm9tcHRzU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRwcm9tcHRzU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5yZXR1cm5zKHRydWUpO1xuXHRcdHByb21wdHNTZXJ2aWNlLmhhc1Byb21wdFNsYXNoQ29tbWFuZC5jYWxsc0Zha2UoKG5hbWU6IHN0cmluZykgPT4gbmFtZSA9PT0gJ2Nocm9uaWNsZTp0aXBzJyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJy9jaHJvbmljbGUgdGlwcyBzaG93IG1lIGluc2lnaHRzJyk7XG5cblx0XHRjb25zdCBzbGFzaFBhcnQgPSByZXN1bHQucGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Byb21wdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IHJlc3VsdC5wYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQpLFxuXHRcdFx0a2luZDogc2xhc2hQYXJ0Py5raW5kLFxuXHRcdFx0bmFtZTogKHNsYXNoUGFydCBhcyB7IG5hbWU/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk/Lm5hbWUsXG5cdFx0XHR0ZXh0OiBzbGFzaFBhcnQ/LnRleHQsXG5cdFx0XHR0cmFpbGluZzogcmVzdWx0LnBhcnRzW3Jlc3VsdC5wYXJ0cy5sZW5ndGggLSAxXT8udGV4dCxcblx0XHR9LCB7XG5cdFx0XHRraW5kczogWydwcm9tcHQnLCAndGV4dCddLFxuXHRcdFx0a2luZDogJ3Byb21wdCcsXG5cdFx0XHRuYW1lOiAnY2hyb25pY2xlOnRpcHMnLFxuXHRcdFx0dGV4dDogJy9jaHJvbmljbGUgdGlwcycsXG5cdFx0XHR0cmFpbGluZzogJyBzaG93IG1lIGluc2lnaHRzJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0IHN1YmNvbW1hbmQgdmlhIGNvbG9uIGZvcm0gaXMgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUucmV0dXJucyh0cnVlKTtcblx0XHRwcm9tcHRzU2VydmljZS5oYXNQcm9tcHRTbGFzaENvbW1hbmQuY2FsbHNGYWtlKChuYW1lOiBzdHJpbmcpID0+IG5hbWUgPT09ICdjaHJvbmljbGU6dGlwcycpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICcvY2hyb25pY2xlOnRpcHMgc2hvdyBtZSBpbnNpZ2h0cycpO1xuXG5cdFx0Y29uc3Qgc2xhc2hQYXJ0ID0gcmVzdWx0LnBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdwcm9tcHQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGtpbmRzOiByZXN1bHQucGFydHMubWFwKHBhcnQgPT4gcGFydC5raW5kKSxcblx0XHRcdGtpbmQ6IHNsYXNoUGFydD8ua2luZCxcblx0XHRcdG5hbWU6IChzbGFzaFBhcnQgYXMgeyBuYW1lPzogc3RyaW5nIH0gfCB1bmRlZmluZWQpPy5uYW1lLFxuXHRcdFx0dGV4dDogc2xhc2hQYXJ0Py50ZXh0LFxuXHRcdFx0dHJhaWxpbmc6IHJlc3VsdC5wYXJ0c1tyZXN1bHQucGFydHMubGVuZ3RoIC0gMV0/LnRleHQsXG5cdFx0fSwge1xuXHRcdFx0a2luZHM6IFsncHJvbXB0JywgJ3RleHQnXSxcblx0XHRcdGtpbmQ6ICdwcm9tcHQnLFxuXHRcdFx0bmFtZTogJ2Nocm9uaWNsZTp0aXBzJyxcblx0XHRcdHRleHQ6ICcvY2hyb25pY2xlOnRpcHMnLFxuXHRcdFx0dHJhaWxpbmc6ICcgc2hvdyBtZSBpbnNpZ2h0cycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NwYWNlIGZvcm0gZG9lcyBub3QgZXh0ZW5kIHdoZW4gbm8gYDxjbWQ+OjxzdWI+YCBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUucmV0dXJucyh0cnVlKTtcblx0XHRwcm9tcHRzU2VydmljZS5oYXNQcm9tcHRTbGFzaENvbW1hbmQucmV0dXJucyhmYWxzZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJy9ub25leGlzdGVudCB0aXBzJyk7XG5cblx0XHRjb25zdCBzbGFzaFBhcnQgPSByZXN1bHQucGFydHMuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Byb21wdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IHJlc3VsdC5wYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQpLFxuXHRcdFx0bmFtZTogKHNsYXNoUGFydCBhcyB7IG5hbWU/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk/Lm5hbWUsXG5cdFx0XHR0ZXh0OiBzbGFzaFBhcnQ/LnRleHQsXG5cdFx0XHR0cmFpbGluZzogcmVzdWx0LnBhcnRzW3Jlc3VsdC5wYXJ0cy5sZW5ndGggLSAxXT8udGV4dCxcblx0XHR9LCB7XG5cdFx0XHRraW5kczogWydwcm9tcHQnLCAndGV4dCddLFxuXHRcdFx0bmFtZTogJ25vbmV4aXN0ZW50Jyxcblx0XHRcdHRleHQ6ICcvbm9uZXhpc3RlbnQnLFxuXHRcdFx0dHJhaWxpbmc6ICcgdGlwcycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIHRlc3QoJ3ZhcmlhYmxlcycsIGFzeW5jICgpID0+IHtcblx0Ly8gXHR2YXJTZXJ2aWNlLmhhc1ZhcmlhYmxlLnJldHVybnModHJ1ZSk7XG5cdC8vIFx0dmFyU2VydmljZS5nZXRWYXJpYWJsZS5yZXR1cm5zKHsgaWQ6ICdjb3BpbG90LnNlbGVjdGlvbicgfSk7XG5cblx0Ly8gXHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdC8vIFx0Y29uc3QgdGV4dCA9ICdXaGF0IGRvZXMgI3NlbGVjdGlvbiBtZWFuPyc7XG5cdC8vIFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksIHRleHQpO1xuXHQvLyBcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdC8vIH0pO1xuXG5cdC8vIHRlc3QoJ3ZhcmlhYmxlIHdpdGggcXVlc3Rpb24gbWFyaycsIGFzeW5jICgpID0+IHtcblx0Ly8gXHR2YXJTZXJ2aWNlLmhhc1ZhcmlhYmxlLnJldHVybnModHJ1ZSk7XG5cdC8vIFx0dmFyU2VydmljZS5nZXRWYXJpYWJsZS5yZXR1cm5zKHsgaWQ6ICdjb3BpbG90LnNlbGVjdGlvbicgfSk7XG5cblx0Ly8gXHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdC8vIFx0Y29uc3QgdGV4dCA9ICdXaGF0IGlzICNzZWxlY3Rpb24/Jztcblx0Ly8gXHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdC8vIFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0Ly8gfSk7XG5cblx0Ly8gdGVzdCgnaW52YWxpZCB2YXJpYWJsZXMnLCBhc3luYyAoKSA9PiB7XG5cdC8vIFx0dmFyU2VydmljZS5oYXNWYXJpYWJsZS5yZXR1cm5zKGZhbHNlKTtcblxuXHQvLyBcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0Ly8gXHRjb25zdCB0ZXh0ID0gJ1doYXQgZG9lcyAjc2VsZWN0aW9uIG1lYW4/Jztcblx0Ly8gXHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgdGV4dCk7XG5cdC8vIFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0Ly8gfSk7XG5cblx0Y29uc3QgZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyA9IChzbGFzaENvbW1hbmRzOiBJQ2hhdEFnZW50Q29tbWFuZFtdKSA9PiB7XG5cdFx0cmV0dXJuIHsgaWQ6ICdhZ2VudCcsIG5hbWU6ICdhZ2VudCcsIGV4dGVuc2lvbklkOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uVmVyc2lvbjogdW5kZWZpbmVkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogJycsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnJywgZXh0ZW5zaW9uUHVibGlzaGVySWQ6ICcnLCBsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSwgbW9kZXM6IFtDaGF0TW9kZUtpbmQuQXNrXSwgbWV0YWRhdGE6IHt9LCBzbGFzaENvbW1hbmRzLCBkaXNhbWJpZ3VhdGlvbjogW10gfSBzYXRpc2ZpZXMgSUNoYXRBZ2VudERhdGE7XG5cdH07XG5cblx0dGVzdCgnYWdlbnQgaG9zdDogZm9yY2VkQWdlbnQgKyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzIHJldml2ZXMgL3NraWxsIGFzIHByb21wdCBzbGFzaCBwYXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1pcnJvcnMgd2hhdCBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5fcGFyc2VQcm9tcHRGb3JIaXN0b3J5IGRvZXNcblx0XHQvLyB3aGVuIHJlc3RvcmluZyBhIHNlc3Npb246IHBhc3MgZm9yY2VkQWdlbnQgKyBjYXBhYmlsaXRpZXMgKyBhblxuXHRcdC8vIGVtcHR5IHJlZmVyZW5jZXMvdG9vbHMgbWFwIGFuZCBleHBlY3QgYSBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydFxuXHRcdC8vIGZvciAvc2tpbGwgPG5hbWU+LlxuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IGNvbW1hbmQgPT09ICdza2lsbCcpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgZm9yY2VkQWdlbnQgPSB7IC4uLmdldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW10pLCBjYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogdHJ1ZSB9IH0gc2F0aXNmaWVzIElDaGF0QWdlbnREYXRhO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0V2l0aFJlZmVyZW5jZXMoXG5cdFx0XHRbXSxcblx0XHRcdFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXSksXG5cdFx0XHQnL3NraWxsIHBsYW4gcnVuIGEgcXVpY2sgcGxhbicsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0eyBzZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIGZvcmNlZEFnZW50LCBhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiBmb3JjZWRBZ2VudC5jYXBhYmlsaXRpZXMgfSxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IGhvc3Q6IGZvcmNlZEFnZW50IGRvZXMgbm90IGZhbGwgYmFjayB0byBkZWZhdWx0IGFnZW50IHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldERlZmF1bHRBZ2VudC5yZXR1cm5zKGdldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ2NvbXBhY3QnLCBkZXNjcmlwdGlvbjogJycgfV0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IGNvbW1hbmQgPT09ICdjb21wYWN0Jyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCBmb3JjZWRBZ2VudCA9IHsgLi4uZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbXSksIGNhcGFiaWxpdGllczogeyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlIH0gfSBzYXRpc2ZpZXMgSUNoYXRBZ2VudERhdGE7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3RXaXRoUmVmZXJlbmNlcyhcblx0XHRcdFtdLFxuXHRcdFx0VG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtdKSxcblx0XHRcdCcvY29tcGFjdCcsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0eyBzZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIGZvcmNlZEFnZW50LCBhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiBmb3JjZWRBZ2VudC5jYXBhYmlsaXRpZXMsIG1vZGU6IENoYXRNb2RlS2luZC5BZ2VudCB9LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc1N1YmNvbW1hbmQ6IHJlc3VsdC5wYXJ0cy5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQuS2luZCksXG5cdFx0XHRtZXNzYWdlOiBnZXRQcm9tcHRUZXh0KHJlc3VsdCkubWVzc2FnZSxcblx0XHR9LCB7IGhhc1N1YmNvbW1hbmQ6IGZhbHNlLCBtZXNzYWdlOiAnL2NvbXBhY3QnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCBob3N0OiBtaXNzaW5nIGZvcmNlZEFnZW50IHN0aWxsIHJldml2ZXMgL3NraWxsIHZpYSBuby1hZ2VudCBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElQcm9tcHRzU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRwcm9tcHRzU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4gY29tbWFuZCA9PT0gJ3NraWxsJyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdFdpdGhSZWZlcmVuY2VzKFxuXHRcdFx0W10sXG5cdFx0XHRUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW10pLFxuXHRcdFx0Jy9za2lsbCBwbGFuIHJ1biBhIHF1aWNrIHBsYW4nLFxuXHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHsgc2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnIH0sXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZhdWx0IGFnZW50IHN1YmNvbW1hbmQgc3RpbGwgYXBwbGllcyB3aGVuIG5vIGFnZW50IGlzIHNlbGVjdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXREZWZhdWx0QWdlbnQucmV0dXJucyhnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdjb21wYWN0JywgZGVzY3JpcHRpb246ICcnIH1dKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICcvY29tcGFjdCcsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgbW9kZTogQ2hhdE1vZGVLaW5kLkFnZW50IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRraW5kczogcmVzdWx0LnBhcnRzLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHRtZXNzYWdlOiBnZXRQcm9tcHRUZXh0KHJlc3VsdCkubWVzc2FnZSxcblx0XHR9LCB7IGtpbmRzOiBbQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0LktpbmRdLCBtZXNzYWdlOiAnJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aCBzdWJjb21tYW5kIGFmdGVyIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IFBsZWFzZSBkbyAvc3ViQ29tbWFuZCB0aGFua3MnKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudHMsIHN1YkNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IC9zdWJDb21tYW5kIFBsZWFzZSBkbyB0aGFua3MnKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCBidXQgZWRpdCBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbXSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCBoZWxsbycsIHVuZGVmaW5lZCwgeyBtb2RlOiBDaGF0TW9kZUtpbmQuRWRpdCB9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCB3aXRoIHF1ZXN0aW9uIG1hcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50PyBBcmUgeW91IHRoZXJlJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgYW5kIHN1YmNvbW1hbmQgd2l0aCBsZWFkaW5nIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnICAgIFxcclxcblxcdCAgIEBhZ2VudCBcXHJcXG5cXHQgICAvc3ViQ29tbWFuZCBUaGFua3MnKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCBhbmQgc3ViY29tbWFuZCBhZnRlciBuZXdsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJyAgICBcXG5AYWdlbnRcXG4vc3ViQ29tbWFuZCBUaGFua3MnKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCBub3QgZmlyc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnSGVsbG8gTXIuIEBhZ2VudCcpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50cyBhbmQgdG9vbHMgYW5kIG11bHRpbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHR2YXJpYWJsZVNlcnZpY2Uuc2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHModGVzdFNlc3Npb25VcmksIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXG5cdFx0XHRbeyBpZDogJ2dldF9zZWxlY3Rpb24nLCB0b29sUmVmZXJlbmNlTmFtZTogJ3NlbGVjdGlvbicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCBkaXNwbGF5TmFtZTogJycsIG1vZGVsRGVzY3JpcHRpb246ICcnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsIH0sIHRydWVdLFxuXHRcdFx0W3sgaWQ6ICdnZXRfZGVidWdDb25zb2xlJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdkZWJ1Z0NvbnNvbGUnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgZGlzcGxheU5hbWU6ICcnLCBtb2RlbERlc2NyaXB0aW9uOiAnJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCB9LCB0cnVlXVxuXHRcdF0gc2F0aXNmaWVzIFtJVG9vbERhdGEgfCBUb29sU2V0LCBib29sZWFuXVtdKSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgL3N1YkNvbW1hbmQgXFxuUGxlYXNlIGRvIHdpdGggI3NlbGVjdGlvblxcbmFuZCAjZGVidWdDb25zb2xlJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRzIGFuZCB0b29scyBhbmQgbXVsdGlsaW5lLCBwYXJ0MicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHR2YXJpYWJsZVNlcnZpY2Uuc2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHModGVzdFNlc3Npb25VcmksIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXG5cdFx0XHRbeyBpZDogJ2dldF9zZWxlY3Rpb24nLCB0b29sUmVmZXJlbmNlTmFtZTogJ3NlbGVjdGlvbicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCBkaXNwbGF5TmFtZTogJycsIG1vZGVsRGVzY3JpcHRpb246ICcnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsIH0sIHRydWVdLFxuXHRcdFx0W3sgaWQ6ICdnZXRfZGVidWdDb25zb2xlJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdkZWJ1Z0NvbnNvbGUnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgZGlzcGxheU5hbWU6ICcnLCBtb2RlbERlc2NyaXB0aW9uOiAnJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCB9LCB0cnVlXVxuXHRcdF0gc2F0aXNmaWVzIFtJVG9vbERhdGEgfCBUb29sU2V0LCBib29sZWFuXVtdKSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgUGxlYXNlIFxcbmRvIC9zdWJDb21tYW5kIHdpdGggI3NlbGVjdGlvblxcbmFuZCAjZGVidWdDb25zb2xlJyk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0IHNsYXNoIGNvbW1hbmQgd2l0aCBhZ2VudCBhbmQgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0U2xhc2hDb21tYW5kU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvXltcXHdfXFwtXFwuXSskLyk7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IC9teVByb21wdCBkbyBzb21ldGhpbmcnLCB1bmRlZmluZWQsIHtcblx0XHRcdGF0dGFjaG1lbnRDYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogdHJ1ZSB9XG5cdFx0fSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvbXB0IHNsYXNoIGNvbW1hbmQgd2l0aCBhZ2VudCBidXQgbm8gc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0U2xhc2hDb21tYW5kU2VydmljZS5pc1ZhbGlkU2xhc2hDb21tYW5kTmFtZS5jYWxsc0Zha2UoKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuICEhY29tbWFuZC5tYXRjaCgvXltcXHdfXFwtXFwuXSskLyk7XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0cGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0KHRlc3RTZXNzaW9uVXJpLCAnQGFnZW50IC9teVByb21wdCBkbyBzb21ldGhpbmcnLCB1bmRlZmluZWQsIHtcblx0XHRcdGF0dGFjaG1lbnRDYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogZmFsc2UgfVxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IHN1YmNvbW1hbmQgc3RpbGwgdGFrZXMgcHJpb3JpdHkgd2l0aCBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdFNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElQcm9tcHRzU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRwcm9tcHRTbGFzaENvbW1hbmRTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gISFjb21tYW5kLm1hdGNoKC9eW1xcd19cXC1cXC5dKyQvKTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0U2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgL3N1YkNvbW1hbmQgZG8gc29tZXRoaW5nJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IHRydWUgfVxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NsYXNoIGNvbW1hbmQgd2l0aCBhZ2VudCBhbmQgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudHNTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdEFnZW50U2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgaGFzVG9vbHNBZ2VudDogZmFsc2UsIG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudC5Ob25lIH0pO1xuXHRcdGFnZW50c1NlcnZpY2UuZ2V0QWdlbnRzQnlOYW1lLnJldHVybnMoW2dldEFnZW50V2l0aFNsYXNoQ29tbWFuZHMoW3sgbmFtZTogJ3N1YkNvbW1hbmQnLCBkZXNjcmlwdGlvbjogJycgfV0pXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgYWdlbnRzU2VydmljZSk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmRTZXJ2aWNlID0gbW9ja09iamVjdDxJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0c2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcy5yZXR1cm5zKFt7IGNvbW1hbmQ6ICdmaXgnIH1dKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgc2xhc2hDb21tYW5kU2VydmljZSk7XG5cblx0XHRwYXJzZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3QodGVzdFNlc3Npb25VcmksICdAYWdlbnQgL2ZpeCB0aGlzJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB7IHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IHRydWUgfVxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbGVudCBzbGFzaCBjb21tYW5kIHdpdGggYWdlbnQgYW5kIG5vIHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRzU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRBZ2VudFNlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGhhc1Rvb2xzQWdlbnQ6IGZhbHNlLCBvbkRpZENoYW5nZUFnZW50czogRXZlbnQuTm9uZSB9KTtcblx0XHRhZ2VudHNTZXJ2aWNlLmdldEFnZW50c0J5TmFtZS5yZXR1cm5zKFtnZXRBZ2VudFdpdGhTbGFzaENvbW1hbmRzKFt7IG5hbWU6ICdzdWJDb21tYW5kJywgZGVzY3JpcHRpb246ICcnIH1dKV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGFnZW50c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kU2VydmljZSA9IG1vY2tPYmplY3Q8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHNsYXNoQ29tbWFuZFNlcnZpY2UuZ2V0Q29tbWFuZHMucmV0dXJucyhbeyBjb21tYW5kOiAnY2xlYXInLCBzaWxlbnQ6IHRydWUgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCAvY2xlYXInLCB1bmRlZmluZWQsIHtcblx0XHRcdGF0dGFjaG1lbnRDYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogZmFsc2UgfVxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1zaWxlbnQgc2xhc2ggY29tbWFuZCB3aXRoIGFnZW50IGFuZCBubyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50c1NlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0QWdlbnRTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBoYXNUb29sc0FnZW50OiBmYWxzZSwgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0YWdlbnRzU2VydmljZS5nZXRBZ2VudHNCeU5hbWUucmV0dXJucyhbZ2V0QWdlbnRXaXRoU2xhc2hDb21tYW5kcyhbeyBuYW1lOiAnc3ViQ29tbWFuZCcsIGRlc2NyaXB0aW9uOiAnJyB9XSldKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBhZ2VudHNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSBtb2NrT2JqZWN0PElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSh7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9KTtcblx0XHRzbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzLnJldHVybnMoW3sgY29tbWFuZDogJ2ZpeCcgfV0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBzbGFzaENvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHBhcnNlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2VDaGF0UmVxdWVzdCh0ZXN0U2Vzc2lvblVyaSwgJ0BhZ2VudCAvZml4IHRoaXMnLCB1bmRlZmluZWQsIHtcblx0XHRcdGF0dGFjaG1lbnRDYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogZmFsc2UgfVxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLGdDQUFnQztBQUM1RCxTQUFTLHNCQUFzQiwwQkFBMEI7QUFDekQsU0FBUyxrQkFBcUQseUJBQXlCO0FBQ3ZGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDLGdDQUFnQyxxQkFBcUI7QUFDOUYsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBOEIsMkNBQTJDO0FBQ2xGLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFvQiw2QkFBNkIsc0JBQStCO0FBQ2hGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLE9BQU8sWUFBWTtBQUVuQixNQUFNLGlCQUFpQixvQkFBb0Is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
