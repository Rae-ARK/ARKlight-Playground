import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ICommandService, CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { NullWorkbenchAssignmentService } from "../../../../services/assignment/test/common/nullAssignmentService.js";
import { ChatTipService, CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND, CREATE_AGENT_TRACKING_COMMAND, CREATE_PROMPT_TRACKING_COMMAND, CREATE_SKILL_TRACKING_COMMAND, FORK_CONVERSATION_TRACKING_COMMAND, TipEligibilityTracker } from "../../browser/chatTipService.js";
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { URI } from "../../../../../base/common/uri.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { storeSelectedModel } from "../../common/chatSelectedModel.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { MockLanguageModelToolsService } from "../common/tools/mockLanguageModelToolsService.js";
import { ChatTipTier, TIP_CATALOG, extractCommandIds } from "../../browser/chatTipCatalog.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { TestChatEntitlementService } from "../../../../test/common/workbenchTestServices.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { MockChatService } from "../common/chatService/mockChatService.js";
import { CreateSlashCommandsUsageTracker } from "../../browser/createSlashCommandsUsageTracker.js";
import { ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart } from "../../common/requestParser/chatParserTypes.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { localChatSessionType } from "../../common/chatSessionsService.js";
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID } from "../../browser/actions/chatActions.js";
class MockContextKeyServiceWithRulesMatching extends MockContextKeyService {
  contextMatchesRules(rules) {
    return rules.evaluate({ getValue: (key) => this.getContextKeyValue(key) });
  }
}
class TrackingConfigurationService extends TestConfigurationService {
  updateValue(key, value, arg3) {
    this.lastUpdateKey = key;
    this.lastUpdateValue = value;
    this.lastUpdateTarget = arg3;
    return Promise.resolve(void 0);
  }
}
suite("ChatTipService", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let contextKeyService;
  let configurationService;
  let commandExecutedEmitter;
  let storageService;
  let mockInstructionFiles;
  let mockPromptInstructionFiles;
  let chatEntitlementService;
  let catalogCommandRegistrations;
  function registerCatalogCommands() {
    const registrations = /* @__PURE__ */ new Map();
    for (const tip of TIP_CATALOG) {
      const message = tip.buildMessage({
        keybindingService: { lookupKeybinding: () => void 0 },
        experimentalTipMessages: /* @__PURE__ */ new Map()
      }).value;
      for (const commandId of extractCommandIds(message)) {
        if (registrations.has(commandId) || CommandsRegistry.getCommand(commandId)) {
          continue;
        }
        const registration = CommandsRegistry.registerCommand(commandId, () => {
        });
        registrations.set(commandId, registration);
        testDisposables.add(registration);
      }
    }
    return registrations;
  }
  function createProductService(hasCopilot) {
    return {
      _serviceBrand: void 0,
      defaultChatAgent: hasCopilot ? { chatExtensionId: "github.copilot-chat" } : void 0
    };
  }
  function createService(hasCopilot = true, tipsEnabled = true) {
    instantiationService.stub(IProductService, createProductService(hasCopilot));
    configurationService.setUserConfiguration("chat.tips.enabled", tipsEnabled);
    return testDisposables.add(instantiationService.createInstance(ChatTipService));
  }
  function createMockTip(overrides) {
    const { message, ...rest } = overrides;
    return {
      tier: ChatTipTier.Qol,
      ...rest,
      buildMessage: () => new MarkdownString(message ?? "test")
    };
  }
  setup(() => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    contextKeyService = new MockContextKeyServiceWithRulesMatching();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
    configurationService = new TestConfigurationService();
    commandExecutedEmitter = testDisposables.add(new Emitter());
    storageService = testDisposables.add(new InMemoryStorageService());
    mockInstructionFiles = [];
    mockPromptInstructionFiles = [];
    instantiationService.stub(IContextKeyService, contextKeyService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ICommandService, {
      onDidExecuteCommand: commandExecutedEmitter.event,
      onWillExecuteCommand: testDisposables.add(new Emitter()).event
    });
    instantiationService.stub(IPromptsService, {
      listAgentInstructions: async () => mockInstructionFiles,
      listPromptFiles: async () => mockPromptInstructionFiles,
      onDidChangeCustomAgents: Event.None
    });
    instantiationService.stub(ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService()));
    chatEntitlementService = new TestChatEntitlementService();
    chatEntitlementService.entitlement = ChatEntitlement.Available;
    instantiationService.stub(IChatEntitlementService, chatEntitlementService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IKeybindingService, {
      lookupKeybinding: () => void 0
    });
    instantiationService.stub(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
    catalogCommandRegistrations = registerCatalogCommands();
  });
  test("returns a welcome tip", () => {
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip, "Should return a welcome tip");
    assert.ok(tip.id.startsWith("tip."), "Tip should have a valid ID");
    assert.ok(tip.content.value.length > 0, "Tip should have content");
  });
  test("uses descriptive titles for tip command links", () => {
    for (const tip of TIP_CATALOG) {
      const markdown = tip.buildMessage({
        keybindingService: {
          lookupKeybinding: () => void 0
        },
        experimentalTipMessages: /* @__PURE__ */ new Map()
      }).value;
      const commandLinkRegex = /\[[^\]]+\]\((command:[^)]+)\)/g;
      let match;
      while ((match = commandLinkRegex.exec(markdown)) !== null) {
        assert.ok(/\s"[^"]+"$/.test(match[1]), `Expected command link in ${tip.id} to include a descriptive title: ${match[0]}`);
      }
    }
  });
  test("records # file reference usage for attach files tip eligibility", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-attach-file"),
      message: {
        text: "what does #file:README.md say",
        parts: [new ChatRequestDynamicVariablePart(
          new OffsetRange(10, 26),
          new Range(1, 11, 1, 27),
          "#file:README.md",
          "file",
          void 0,
          URI.file("/workspace/README.md"),
          void 0,
          void 0,
          true,
          false
        )]
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes("chat.tips.attachFiles.referenceUsed"));
  });
  test("records only matching create tip usage for submitted create command", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-create-prompt"),
      message: {
        text: "/create-prompt scaffold a reusable prompt",
        parts: []
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
  });
  test("records init tip usage for submitted /init command", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-init"),
      message: {
        text: "/init",
        parts: []
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
  });
  test("hides shown slash tip after submitted slash command without clicking tip link", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    let tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    for (let i = 0; i < TIP_CATALOG.length && tip?.id !== "tip.init"; i++) {
      tip = service.navigateToNextTip();
    }
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.init", "Expected to navigate to the init tip before submitting /init");
    let didHide = false;
    testDisposables.add(service.onDidHideTip(() => didHide = true));
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-advance-init"),
      message: {
        text: "/init",
        parts: []
      }
    });
    assert.ok(didHide, "Expected slash tip to hide after submitting /init");
    assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, "tip.init", "Expected init tip to stay excluded after slash usage");
  });
  test("removes slash tip from rotation after submitted slash command via eligibility tracking", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    let tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    for (let i = 0; i < TIP_CATALOG.length && tip?.id !== "tip.init"; i++) {
      tip = service.navigateToNextTip();
    }
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.init");
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-rotate-init"),
      message: {
        text: "/init",
        parts: []
      }
    });
    for (let i = 0; i < TIP_CATALOG.length; i++) {
      tip = service.navigateToNextTip();
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, "tip.init", "Expected init tip to be removed from tip rotation");
    }
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND), "Expected slash usage to be tracked in executed command exclusions");
  });
  test("removes slash tip from rotation when slash usage is recorded before input transformation", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    let tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    for (let i = 0; i < TIP_CATALOG.length && tip?.id !== "tip.init"; i++) {
      tip = service.navigateToNextTip();
    }
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.init");
    service.recordSlashCommandUsage("init");
    for (let i = 0; i < TIP_CATALOG.length; i++) {
      tip = service.navigateToNextTip();
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, "tip.init", "Expected init tip to be removed from tip rotation");
    }
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND), "Expected slash usage to be tracked in executed command exclusions");
  });
  test("records fork tip usage for submitted /fork command", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    createService();
    submitRequestEmitter.fire({
      chatSessionResource: URI.parse("chat:session-fork"),
      message: {
        text: "/fork",
        parts: []
      }
    });
    const executedCommands = JSON.parse(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION) ?? "[]");
    assert.ok(executedCommands.includes(FORK_CONVERSATION_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_PROMPT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_AGENT_TRACKING_COMMAND));
    assert.ok(!executedCommands.includes(CREATE_SKILL_TRACKING_COMMAND));
  });
  test("returns Auto switch tip when current model is gpt-4.1", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.switchToAuto");
    assert.ok(tip.content.value.includes("GPT-4.1"));
  });
  test("does not return Auto switch tip when current model is not gpt-4.1", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.notStrictEqual(tip.id, "tip.switchToAuto");
  });
  test("does not return Auto switch tip when current model context key is empty and no fallback is available", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.notStrictEqual(tip.id, "tip.switchToAuto");
  });
  test("returns Auto switch tip when current model is persisted and context key is empty", () => {
    storeSelectedModel(storageService, ChatAgentLocation.Chat, void 0, "copilot/gpt-4.1-2025-04-14");
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.switchToAuto");
  });
  test("returns Auto switch tip when current model is versioned gpt-4.1", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1-2025-04-14");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.switchToAuto");
  });
  test("switching models advances away from gpt-4.1 tip", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.switchToAuto");
    const switchedContextKeyService = new MockContextKeyServiceWithRulesMatching();
    switchedContextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
    switchedContextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const nextTip = service.getWelcomeTip(switchedContextKeyService);
    assert.ok(nextTip);
    assert.notStrictEqual(nextTip.id, "tip.switchToAuto");
  });
  test("returns same welcome tip on rerender", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    const tip2 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip2);
    assert.strictEqual(tip1.id, tip2.id, "Should return same tip for stable rerender");
    assert.strictEqual(tip1.content.value, tip2.content.value);
  });
  test("returns undefined when Copilot is not enabled", () => {
    const service = createService(
      /* hasCopilot */
      false
    );
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when Copilot is not enabled");
  });
  test("returns undefined when user is signed out", () => {
    chatEntitlementService.entitlement = ChatEntitlement.Unknown;
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when the user is signed out");
  });
  test("returns undefined when tips setting is disabled", () => {
    const service = createService(
      /* hasCopilot */
      true,
      /* tipsEnabled */
      false
    );
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when tips setting is disabled");
  });
  test("returns undefined when location is terminal", () => {
    const service = createService();
    const terminalContextKeyService = new MockContextKeyServiceWithRulesMatching();
    terminalContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.Terminal);
    const tip = service.getWelcomeTip(terminalContextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip in terminal inline chat");
  });
  test("returns undefined when location is editor inline", () => {
    const service = createService();
    const editorContextKeyService = new MockContextKeyServiceWithRulesMatching();
    editorContextKeyService.createKey(ChatContextKeys.location.key, ChatAgentLocation.EditorInline);
    const tip = service.getWelcomeTip(editorContextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip in editor inline chat");
  });
  test("returns a tip when foreground session count is exactly one", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 1);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip, "Should return a tip when exactly one foreground chat session is visible");
  });
  test("returns undefined when foreground session count is zero", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 0);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when no foreground chat sessions are visible");
  });
  test("returns a tip for the Agents new-session composer when foreground session count is zero", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 0);
    contextKeyService.createKey(IsSessionsWindowContext.key, true);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip, "Should return a tip for the Agents new-session composer");
  });
  test("returns undefined when foreground session count is greater than one", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.foregroundSessionCount.key, 2);
    const tip = service.getWelcomeTip(contextKeyService);
    assert.strictEqual(tip, void 0, "Should not return a tip when multiple foreground chat sessions are visible");
  });
  test("dismissTip excludes the dismissed tip and allows a new one", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    service.dismissTip();
    const tip2 = service.getWelcomeTip(contextKeyService);
    if (tip2) {
      assert.notStrictEqual(tip1.id, tip2.id, "Dismissed tip should not be shown again");
    }
  });
  test("dismissTip keeps navigation context for next tip traversal", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    service.dismissTip();
    const tip2 = service.navigateToNextTip();
    if (tip2) {
      assert.notStrictEqual(tip1.id, tip2.id, "Dismissed tip should not be returned by next navigation");
    }
  });
  test("dismissTipForSession hides tips until resetSession", () => {
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    service.dismissTipForSession();
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "Tips should stay hidden for the current session after dismissing");
    service.resetSession();
    assert.ok(service.getWelcomeTip(contextKeyService), "Tips should reappear after resetting the session");
  });
  test("navigateToNextTip keeps foundational tips before QoL tips", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.planMode");
    const secondTip = service.navigateToNextTip();
    assert.ok(secondTip);
    assert.strictEqual(secondTip.id, "tip.createAgent", "Expected next tip to remain in foundational tips before QoL tips");
  });
  test("navigateToPreviousTip follows reverse of preferred order", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.planMode");
    const secondTip = service.navigateToNextTip();
    assert.ok(secondTip);
    assert.strictEqual(secondTip.id, "tip.createAgent");
    const previousTip = service.navigateToPreviousTip();
    assert.ok(previousTip);
    assert.strictEqual(previousTip.id, "tip.planMode", "Expected previous tip to reverse the preferred ordering");
  });
  test("excludes a tip whose command is not registered", () => {
    catalogCommandRegistrations.get("workbench.action.chat.openPlan").dispose();
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    assertTipNeverShown(service, "tip.planMode");
  });
  test("getNextEligibleTip returns next tip even when only one remains", async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1, "Should have an initial tip");
    const tip2 = service.navigateToNextTip();
    assert.ok(tip2, "Should have a second tip");
    assert.notStrictEqual(tip1.id, tip2.id, "Second tip should be different");
    const dismissedIds = /* @__PURE__ */ new Set();
    dismissedIds.add(tip2.id);
    service.dismissTip();
    let nextTip = service.getNextEligibleTip();
    while (nextTip && !dismissedIds.has(nextTip.id)) {
      if (nextTip.id === tip1.id) {
        break;
      }
      dismissedIds.add(nextTip.id);
      service.dismissTip();
      nextTip = service.getNextEligibleTip();
    }
    assert.ok(nextTip, "getNextEligibleTip should return the last remaining eligible tip");
  });
  test("getNextEligibleTip returns undefined when all tips are dismissed", async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      service.dismissTip();
    }
    const nextTip = service.getNextEligibleTip();
    assert.strictEqual(nextTip, void 0, "getNextEligibleTip should return undefined when all tips are dismissed");
  });
  test("getNextEligibleTip keeps preferred onboarding order after dismissing plan tip", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    assert.strictEqual(firstTip.id, "tip.planMode");
    service.dismissTip();
    const secondTip = service.getNextEligibleTip();
    assert.ok(secondTip);
    assert.strictEqual(secondTip.id, "tip.createAgent", "Expected next tip to follow preferred onboarding order before QoL tips");
  });
  test("getNextEligibleTip picks next relative to current tip after dismissing from middle of order", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const firstTip = service.getWelcomeTip(contextKeyService);
    assert.ok(firstTip);
    const secondTip = service.navigateToNextTip();
    assert.ok(secondTip);
    const expectedNextAfterSecond = service.navigateToNextTip();
    assert.ok(expectedNextAfterSecond, "Expected at least three tips to validate relative ordering");
    const backToSecond = service.navigateToPreviousTip();
    assert.ok(backToSecond);
    assert.strictEqual(backToSecond.id, secondTip.id);
    service.dismissTip();
    const actualNext = service.getNextEligibleTip();
    assert.ok(actualNext);
    assert.strictEqual(actualNext.id, expectedNextAfterSecond.id, "Expected getNextEligibleTip to advance relative to current tip rather than restart from top priority tip");
  });
  test("dismissTip fires onDidDismissTip event", () => {
    const service = createService();
    service.getWelcomeTip(contextKeyService);
    let fired = false;
    testDisposables.add(service.onDidDismissTip(() => {
      fired = true;
    }));
    service.dismissTip();
    assert.ok(fired, "onDidDismissTip should fire");
  });
  test("disableTips fires onDidDisableTips event", async () => {
    const service = createService();
    service.getWelcomeTip(contextKeyService);
    let fired = false;
    testDisposables.add(service.onDidDisableTips(() => {
      fired = true;
    }));
    await service.disableTips();
    assert.ok(fired, "onDidDisableTips should fire");
  });
  test("disableTips writes to application settings target", async () => {
    const trackingConfigurationService = new TrackingConfigurationService();
    configurationService = trackingConfigurationService;
    instantiationService.stub(IConfigurationService, configurationService);
    const service = createService();
    await service.disableTips();
    assert.strictEqual(trackingConfigurationService.lastUpdateKey, "chat.tips.enabled");
    assert.strictEqual(trackingConfigurationService.lastUpdateValue, false);
    assert.strictEqual(trackingConfigurationService.lastUpdateTarget, ConfigurationTarget.APPLICATION);
  });
  test("disableTips resets state so re-enabling works", async () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1);
    await service.disableTips();
    configurationService.setUserConfiguration("chat.tips.enabled", true);
    const tip2 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip2, "Should return a tip after disabling and re-enabling");
  });
  test("dismissed tips stay dismissed after disabling and re-enabling tips", async () => {
    const service = createService();
    await new Promise((r) => queueMicrotask(r));
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      service.dismissTip();
    }
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "No tip should remain once all tips are dismissed");
    await service.disableTips();
    configurationService.setUserConfiguration("chat.tips.enabled", true);
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "Dismissed tips should remain dismissed after re-enabling tips");
  });
  test("clearDismissedTips restores tip visibility", () => {
    const service = createService();
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      service.dismissTip();
    }
    assert.strictEqual(service.getWelcomeTip(contextKeyService), void 0, "No tip should remain once all tips are dismissed");
    service.clearDismissedTips();
    assert.ok(service.getWelcomeTip(contextKeyService), "A tip should be visible again after clearing dismissed tips");
  });
  test("migrates dismissed tips from profile to application storage", () => {
    storageService.store("chat.tip.dismissed", JSON.stringify(["tip.switchToAuto"]), StorageScope.PROFILE, StorageTarget.MACHINE);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "gpt-4.1");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.notStrictEqual(tip.id, "tip.switchToAuto", "Should honor profile-stored dismissed tip id");
    assert.ok(storageService.get("chat.tip.dismissed", StorageScope.APPLICATION), "Expected dismissed tips to migrate to application storage");
  });
  test("tip.undoChanges describes where to find restore checkpoint", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const tip = findTipById(service, "tip.undoChanges");
    assert.ok(tip);
    assert.ok(tip.content.value.includes("Hover a previous request"));
    assert.ok(tip.content.value.includes("Restore Checkpoint"));
  });
  test("tip.mermaid uses sentence punctuation in display text", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const tip = findTipById(service, "tip.mermaid");
    assert.ok(tip);
    assert.ok(tip.content.value.includes("flow chart. It can render Mermaid diagrams directly in chat."));
    assert.ok(!tip.content.value.includes("flow chart; it can render Mermaid diagrams directly in chat."));
  });
  function createMockPromptsService(agentInstructions = [], promptInstructions = [], options) {
    return {
      listAgentInstructions: async () => agentInstructions,
      listPromptFiles: options?.listPromptFiles ?? (async (_type) => promptInstructions),
      onDidChangeCustomAgents: options?.onDidChangeCustomAgents ?? Event.None
    };
  }
  function createMockToolsService() {
    return testDisposables.add(new MockLanguageModelToolsService());
  }
  test("excludes tip.undoChanges when restore checkpoint command has been executed", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before command is executed");
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.restoreCheckpoint", args: [] });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after command is executed");
  });
  test("persists executed command exclusions in application storage", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.restoreCheckpoint", args: [] });
    assert.ok(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION), "Expected executed command exclusions in application storage");
    assert.strictEqual(storageService.get("chat.tips.executedCommands", StorageScope.PROFILE), void 0, "Did not expect executed command exclusions in profile storage");
    assert.strictEqual(storageService.get("chat.tips.executedCommands", StorageScope.WORKSPACE), void 0, "Did not expect executed command exclusions in workspace storage");
  });
  test("migrates executed command exclusions from profile to application storage", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    storageService.store("chat.tips.executedCommands", JSON.stringify(["workbench.action.chat.restoreCheckpoint"]), StorageScope.PROFILE, StorageTarget.MACHINE);
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should honor profile-stored exclusions");
    assert.ok(storageService.get("chat.tips.executedCommands", StorageScope.APPLICATION), "Expected migrated exclusion data in application storage");
  });
  test("excludes tip.customInstructions when copilot-instructions.md exists in workspace", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([{ uri: { path: "/.github/copilot-instructions.md" }, realPath: void 0, type: AgentInstructionFileType.copilotInstructionsMd }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded when copilot-instructions.md exists");
  });
  test("does not exclude tip.customInstructions when only AGENTS.md exists", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([{ uri: { path: "/AGENTS.md" }, realPath: void 0, type: AgentInstructionFileType.agentsMd }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded when only AGENTS.md exists");
  });
  test("excludes tip.customInstructions when .instructions.md files exist in workspace", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [{ uri: URI.file("/.github/instructions/coding.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded when .instructions.md files exist");
  });
  test("does not exclude tip.customInstructions when no instruction files exist", async () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded when no instruction files exist");
  });
  test("excludes tip.customInstructions when generate instructions command has been executed", () => {
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenCommandsExecuted: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before command is executed");
    commandExecutedEmitter.fire({ commandId: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, args: [] });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after generate instructions command is executed");
  });
  test("excludes tip.agentMode when agent mode has been used in workspace", () => {
    const tip = createMockTip({
      id: "tip.agentMode",
      excludeWhenModesUsed: [ChatModeKind.Agent]
    });
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before mode is recorded");
    tracker.recordCurrentMode(contextKeyService);
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after agent mode has been recorded");
  });
  test("excludes tip.planMode when Plan mode has been used in workspace", () => {
    const tip = createMockTip({
      id: "tip.planMode",
      excludeWhenModesUsed: ["Plan"]
    });
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Plan");
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before mode is recorded");
    tracker.recordCurrentMode(contextKeyService);
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after Plan mode has been recorded");
  });
  test("excludes tip.planMode when open plan command has been executed", () => {
    const tip = createMockTip({
      id: "tip.planMode",
      excludeWhenCommandsExecuted: ["workbench.action.chat.openPlan"]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before command is executed");
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.openPlan", args: [] });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after open plan command is executed");
  });
  test("persists command exclusions to workspace storage across tracker instances", () => {
    const tip = createMockTip({
      id: "tip.undoChanges",
      excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint"]
    });
    const tracker1 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: commandExecutedEmitter.event, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    commandExecutedEmitter.fire({ commandId: "workbench.action.chat.restoreCheckpoint", args: [] });
    assert.strictEqual(tracker1.isExcluded(tip), true);
    const tracker2 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker2.isExcluded(tip), true, "New tracker should read persisted exclusion from workspace storage");
  });
  test("persists mode exclusions to workspace storage across tracker instances", () => {
    const tip = createMockTip({
      id: "tip.agentMode",
      excludeWhenModesUsed: [ChatModeKind.Agent]
    });
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tracker1 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    tracker1.recordCurrentMode(contextKeyService);
    assert.strictEqual(tracker1.isExcluded(tip), true);
    const tracker2 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker2.isExcluded(tip), true, "New tracker should read persisted mode exclusion from workspace storage");
  });
  test("prioritizes foundational tips over QoL tips when both are eligible", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    assert.strictEqual(tip.id, "tip.planMode", "Expected foundational tip to be prioritized before eligible QoL tips");
  });
  test("prioritizes preferred onboarding tips in requested order", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      assert.ok(tip);
      seen.push(tip.id);
      service.dismissTip();
    }
    assert.deepStrictEqual(seen, ["tip.planMode", "tip.createAgent", "tip.createSkill"]);
  });
  test("randomizes QoL tips when no foundational tips are eligible", () => {
    const service = createService();
    const modeKindKey = contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Plan");
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, "cloud");
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      const firstTip = service.getWelcomeTip(contextKeyService);
      service.resetSession();
      Math.random = () => 0.9999;
      const secondTip = service.getWelcomeTip(contextKeyService);
      assert.ok(firstTip);
      assert.ok(secondTip);
      assert.notStrictEqual(firstTip.id, secondTip.id, "Expected different QoL tips for different random values");
      assert.notStrictEqual(firstTip.id, "tip.planMode");
      assert.notStrictEqual(secondTip.id, "tip.planMode");
    } finally {
      Math.random = originalRandom;
      modeKindKey.set(ChatModeKind.Agent);
      modeNameKey.set("Plan");
    }
  });
  test("resetSession reevaluates foundational tips for the next chat session", () => {
    const service = createService();
    const modeKindKey = contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Plan");
    const sessionTypeKey = contextKeyService.createKey(ChatContextKeys.chatSessionType.key, "cloud");
    contextKeyService.createKey(ChatContextKeys.chatModelId.key, "auto");
    const originalRandom = Math.random;
    try {
      Math.random = () => 0.9999;
      const qolTip = service.getWelcomeTip(contextKeyService);
      assert.ok(qolTip);
      assert.notStrictEqual(qolTip.id, "tip.planMode");
      service.resetSession();
      modeNameKey.set("Agent");
      sessionTypeKey.set(localChatSessionType);
      const foundationalTip = service.getWelcomeTip(contextKeyService);
      assert.ok(foundationalTip);
      assert.strictEqual(foundationalTip.id, "tip.createAgent", "Expected foundational ordering to restart on new chat session");
    } finally {
      Math.random = originalRandom;
      modeKindKey.set(ChatModeKind.Agent);
    }
  });
  test("resetSession allows a new welcome tip", () => {
    const service = createService();
    const tip1 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip1, "Should get a welcome tip");
    service.resetSession();
    const tip2 = service.getWelcomeTip(contextKeyService);
    assert.ok(tip2, "Should get a welcome tip after resetSession");
  });
  test("Plan tip is excluded after switching to Plan mode during stable rerender", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    const modeNameKey = contextKeyService.createKey(ChatContextKeys.chatModeName.key, "Agent");
    assert.ok(findTipById(service, "tip.planMode"), "Plan tip should be shown when in Agent mode");
    modeNameKey.set("Plan");
    const rerenderTip = service.getWelcomeTip(contextKeyService);
    assert.ok(!rerenderTip || rerenderTip.id !== "tip.planMode", "Plan tip should not be shown after switching to Plan mode");
    service.resetSession();
    modeNameKey.set("Agent");
    assertTipNeverShown(service, "tip.planMode");
  });
  test("excludes tip when tracked tool has been invoked", () => {
    const mockToolsService = createMockToolsService();
    const tip = createMockTip({
      id: "tip.mermaid",
      excludeWhenToolsInvoked: ["renderMermaidDiagram"]
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      mockToolsService,
      new NullLogService()
    ));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded before tool is invoked");
    mockToolsService.fireOnDidInvokeTool({ toolId: "renderMermaidDiagram", sessionResource: void 0, requestId: void 0, subagentInvocationId: void 0 });
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after tool is invoked");
  });
  test("persists tool exclusions to workspace storage across tracker instances", () => {
    const mockToolsService = createMockToolsService();
    const tip = createMockTip({
      id: "tip.subagents",
      excludeWhenToolsInvoked: ["runSubagent"]
    });
    const tracker1 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      mockToolsService,
      new NullLogService()
    ));
    mockToolsService.fireOnDidInvokeTool({ toolId: "runSubagent", sessionResource: void 0, requestId: void 0, subagentInvocationId: void 0 });
    assert.strictEqual(tracker1.isExcluded(tip), true);
    const tracker2 = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    assert.strictEqual(tracker2.isExcluded(tip), true, "New tracker should read persisted tool exclusion from workspace storage");
  });
  test("excludes tip.skill when skill files exist in workspace", async () => {
    const tip = createMockTip({
      id: "tip.skill",
      excludeWhenPromptFilesExist: { promptType: PromptsType.skill }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [{ uri: URI.file("/.github/skills/my-skill.skill.md"), storage: PromptsStorage.local, type: PromptsType.skill }]),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded when skill files exist");
  });
  test("does not exclude tip.skill when no skill files exist", async () => {
    const tip = createMockTip({
      id: "tip.skill",
      excludeWhenPromptFilesExist: { promptType: PromptsType.skill }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService(),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded when no skill files exist");
  });
  test("shows all create slash command tips in local chat sessions", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    const expectedCreateTips = /* @__PURE__ */ new Set(["tip.init", "tip.createPrompt", "tip.createAgent", "tip.createSkill"]);
    const seenCreateTips = /* @__PURE__ */ new Set();
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      if (expectedCreateTips.has(tip.id)) {
        seenCreateTips.add(tip.id);
        if (seenCreateTips.size === expectedCreateTips.size) {
          break;
        }
      }
      service.dismissTip();
    }
    assert.deepStrictEqual([...seenCreateTips].sort(), [...expectedCreateTips].sort());
  });
  test("does not show create slash command tips in non-local chat sessions", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, "cloud");
    const createTipIds = /* @__PURE__ */ new Set(["tip.init", "tip.createPrompt", "tip.createAgent", "tip.createSkill"]);
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      assert.ok(!createTipIds.has(tip.id), "Should not show create slash command tips in non-local sessions");
      service.dismissTip();
    }
  });
  test("does not show create prompt tip when create prompt was already used", () => {
    storageService.store("chat.tips.executedCommands", JSON.stringify([CREATE_PROMPT_TRACKING_COMMAND]), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(contextKeyService);
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, "tip.createPrompt", "Should not show tip.createPrompt when create-prompt was used");
      service.dismissTip();
    }
  });
  function findTipById(service, tipId, ckService = contextKeyService) {
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(ckService);
      if (!tip) {
        return void 0;
      }
      if (tip.id === tipId) {
        return tip;
      }
      service.dismissTip();
    }
    return void 0;
  }
  function assertTipNeverShown(service, tipId, ckService = contextKeyService) {
    for (let i = 0; i < 100; i++) {
      const tip = service.getWelcomeTip(ckService);
      if (!tip) {
        break;
      }
      assert.notStrictEqual(tip.id, tipId, `${tipId} should not be shown`);
      service.dismissTip();
    }
  }
  for (const { tipId, settingKey } of [
    { tipId: "tip.thinkingPhrases", settingKey: "chat.agent.thinking.phrases" }
  ]) {
    test(`shows ${tipId} with correct setting link when setting is at default`, async () => {
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      await new Promise((r) => queueMicrotask(r));
      const tip = findTipById(service, tipId);
      assert.ok(tip, `Should show ${tipId} when setting is at default`);
      assert.ok(tip.content.value.includes(settingKey), `Tip should reference ${settingKey}`);
      assert.ok(tip.enabledCommands?.includes("workbench.action.openSettings"), "Tip should enable the openSettings command");
    });
    test(`excludes ${tipId} when setting has been changed from default`, async () => {
      configurationService.setUserConfiguration(settingKey, "changed");
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      await new Promise((r) => queueMicrotask(r));
      assertTipNeverShown(service, tipId);
    });
  }
  for (const tipId of [
    "tip.thinkingPhrases"
  ]) {
    test(`dismisses ${tipId} after clicking its settings link`, async () => {
      const service = createService();
      contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
      await new Promise((r) => queueMicrotask(r));
      const tip = findTipById(service, tipId);
      assert.ok(tip, `Should show ${tipId} before command click`);
      let dismissed = false;
      testDisposables.add(service.onDidDismissTip(() => {
        dismissed = true;
      }));
      commandExecutedEmitter.fire({ commandId: "workbench.action.openSettings", args: [] });
      assert.strictEqual(dismissed, true, `${tipId} should dismiss when its settings command is clicked`);
      assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, tipId, `${tipId} should not be shown again after actioning its command link`);
      const nextService = createService();
      assertTipNeverShown(nextService, tipId);
    });
  }
  test("dismisses createPrompt tip after clicking its command link", () => {
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatSessionType.key, localChatSessionType);
    const tip = findTipById(service, "tip.createPrompt");
    assert.ok(tip, "Should show tip.createPrompt before command click");
    assert.ok(tip.enabledCommands?.includes(GENERATE_PROMPT_COMMAND_ID), "Tip should enable the create prompt command");
    commandExecutedEmitter.fire({ commandId: GENERATE_PROMPT_COMMAND_ID, args: [] });
    assert.notStrictEqual(service.getWelcomeTip(contextKeyService)?.id, "tip.createPrompt", "tip.createPrompt should not be shown again after actioning its command link");
    const nextService = createService();
    assertTipNeverShown(nextService, "tip.createPrompt");
  });
  test("logs telemetry when tip is shown", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    const shownEvents = events.filter((e) => e.data.action === "shown");
    assert.strictEqual(shownEvents.length, 1, "Should log exactly one shown event");
    assert.strictEqual(shownEvents[0].eventName, "chatTip");
    assert.strictEqual(shownEvents[0].data.tipId, tip.id);
  });
  test("logs telemetry when tip is dismissed", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    service.dismissTip();
    const dismissEvents = events.filter((e) => e.data.action === "dismissed");
    assert.strictEqual(dismissEvents.length, 1, "Should log exactly one dismissed event");
    assert.strictEqual(dismissEvents[0].data.tipId, tip.id);
  });
  test("logs telemetry when navigating tips", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    const nextTip = service.navigateToNextTip();
    assert.ok(nextTip);
    const navigateEvents = events.filter((e) => e.data.action === "navigateNext");
    assert.strictEqual(navigateEvents.length, 1, "Should log one navigateNext event");
    assert.strictEqual(navigateEvents[0].data.tipId, tip.id, "navigateNext should log the tip being navigated away from");
    const shownEvents = events.filter((e) => e.data.action === "shown");
    assert.strictEqual(shownEvents.length, 2, "Should log shown for initial and navigated tip");
    assert.strictEqual(shownEvents[1].data.tipId, nextTip.id);
  });
  test("logs telemetry when tip command is clicked", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    if (tip.enabledCommands?.length) {
      commandExecutedEmitter.fire({ commandId: tip.enabledCommands[0], args: [] });
      const clickEvents = events.filter((e) => e.data.action === "commandClicked");
      assert.strictEqual(clickEvents.length, 1, "Should log one commandClicked event");
      assert.strictEqual(clickEvents[0].data.tipId, tip.id);
      assert.strictEqual(clickEvents[0].data.commandId, tip.enabledCommands[0]);
    } else {
      assert.fail("Tip has no enabled commands; cannot test command click telemetry");
    }
  });
  test("logs telemetry when tip is hidden", () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    service.hideTip();
    const hiddenEvents = events.filter((e) => e.data.action === "hidden");
    assert.strictEqual(hiddenEvents.length, 1, "Should log one hidden event");
    assert.strictEqual(hiddenEvents[0].data.tipId, tip.id);
  });
  test("logs telemetry when tips are disabled", async () => {
    const events = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    await service.disableTips();
    const disabledEvents = events.filter((e) => e.data.action === "disabled");
    assert.strictEqual(disabledEvents.length, 1, "Should log one disabled event");
    assert.strictEqual(disabledEvents[0].data.tipId, tip.id);
  });
  test("thinking phrases ever-modified seed checks workspaceValue", () => {
    const workspaceConfigService = new TestConfigurationService();
    const originalInspect = workspaceConfigService.inspect.bind(workspaceConfigService);
    workspaceConfigService.inspect = (key, overrides) => {
      if (key === "chat.agent.thinking.phrases") {
        return { ...originalInspect(key, overrides), userValue: void 0, userLocalValue: void 0, workspaceValue: "compact" };
      }
      return originalInspect(key, overrides);
    };
    configurationService = workspaceConfigService;
    instantiationService.stub(IConfigurationService, configurationService);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    assertTipNeverShown(service, "tip.thinkingPhrases");
  });
  test("does not show tip.thinkingPhrases when previous modification is persisted", () => {
    storageService.store("chat.tip.thinkingPhrasesEverModified", true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const service = createService();
    contextKeyService.createKey(ChatContextKeys.chatModeKind.key, ChatModeKind.Agent);
    assertTipNeverShown(service, "tip.thinkingPhrases");
  });
  test("re-checks agent file exclusion when onDidChangeCustomAgents fires", async () => {
    const agentChangeEmitter = testDisposables.add(new Emitter());
    let agentFiles = [];
    const tip = createMockTip({
      id: "tip.customAgent",
      excludeWhenPromptFilesExist: { promptType: PromptsType.agent, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [], {
        onDidChangeCustomAgents: agentChangeEmitter.event,
        listPromptFiles: async () => agentFiles
      }),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded after initial check finds no files");
    agentFiles = [{ uri: URI.file("/.github/agents/my-agent.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent }];
    agentChangeEmitter.fire();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after onDidChangeCustomAgents fires and agent files exist");
  });
  test("refreshPromptFileExclusions re-checks instruction files after startup", async () => {
    let instructionFiles = [];
    const tip = createMockTip({
      id: "tip.customInstructions",
      excludeWhenPromptFilesExist: { promptType: PromptsType.instructions, agentFileType: AgentInstructionFileType.copilotInstructionsMd, excludeUntilChecked: true }
    });
    const tracker = testDisposables.add(new TipEligibilityTracker(
      [tip],
      { onDidExecuteCommand: Event.None, onWillExecuteCommand: Event.None },
      storageService,
      createMockPromptsService([], [], {
        listPromptFiles: async () => instructionFiles
      }),
      createMockToolsService(),
      new NullLogService()
    ));
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), false, "Should not be excluded after initial check finds no files");
    instructionFiles = [{ uri: URI.file("/.github/instructions/coding.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions }];
    tracker.refreshPromptFileExclusions();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(tracker.isExcluded(tip), true, "Should be excluded after refresh finds instruction files");
  });
  test("does not throw when submitted while stored context key service has been disposed", () => {
    const submitRequestEmitter = testDisposables.add(new Emitter());
    instantiationService.stub(IChatService, {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: () => void 0
    });
    const service = createService();
    const tip = service.getWelcomeTip(contextKeyService);
    assert.ok(tip);
    const originalContextMatchesRules = contextKeyService.contextMatchesRules.bind(contextKeyService);
    contextKeyService.contextMatchesRules = () => {
      throw new Error("AbstractContextKeyService has been disposed");
    };
    try {
      assert.doesNotThrow(() => submitRequestEmitter.fire({
        chatSessionResource: URI.parse("chat:session-disposed"),
        message: { text: "hello", parts: [] }
      }));
    } finally {
      contextKeyService.contextMatchesRules = originalContextMatchesRules;
    }
  });
});
suite("CreateSlashCommandsUsageTracker", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let storageService;
  let contextKeyService;
  let submitRequestEmitter;
  let sessions;
  setup(() => {
    storageService = testDisposables.add(new InMemoryStorageService());
    contextKeyService = new MockContextKeyService();
    submitRequestEmitter = testDisposables.add(new Emitter());
    sessions = /* @__PURE__ */ new Map();
  });
  function createMockChatServiceForTracker() {
    return {
      onDidSubmitRequest: submitRequestEmitter.event,
      getSession: (resource) => sessions.get(resource.toString())
    };
  }
  function createTracker(chatService) {
    return testDisposables.add(new CreateSlashCommandsUsageTracker(
      chatService ?? createMockChatServiceForTracker(),
      storageService,
      () => contextKeyService
    ));
  }
  test("syncContextKey sets context key to false when storage is empty", () => {
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, false, "Context key should be false when no create commands have been used");
  });
  test("syncContextKey sets context key to true when storage has recorded usage", () => {
    storageService.store("chat.tips.usedCreateSlashCommands", true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, true, "Context key should be true when create commands have been used");
  });
  test("detects create-instructions slash command via text fallback", () => {
    const sessionResource = URI.parse("chat:session1");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/create-instructions test",
          parts: []
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, true, "Context key should be true after /create-instructions is used");
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist the create slash command usage"
    );
  });
  test("detects create-prompt slash command via text fallback", () => {
    const sessionResource = URI.parse("chat:session2");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/create-prompt my-prompt",
          parts: []
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist the create-prompt usage"
    );
  });
  test("detects create-agent slash command via parsed part", () => {
    const sessionResource = URI.parse("chat:session3");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/create-agent test",
          parts: [
            new ChatRequestSlashCommandPart(
              new OffsetRange(0, 13),
              new Range(1, 1, 1, 14),
              { command: "create-agent", detail: "", locations: [] }
            )
          ]
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist when create-agent slash command part is detected"
    );
  });
  test("detects create command from submitted message payload when session has no last request", () => {
    const sessionResource = URI.parse("chat:session-payload");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    submitRequestEmitter.fire({
      chatSessionResource: sessionResource,
      message: {
        text: "/create-prompt payload-test",
        parts: []
      }
    });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      true,
      "Storage should persist usage detected from submitted message payload"
    );
  });
  test("does not mark used for non-create slash commands", () => {
    const sessionResource = URI.parse("chat:session4");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: {
          text: "/help test",
          parts: []
        }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    const value = contextKeyService.getContextKeyValue(ChatContextKeys.hasUsedCreateSlashCommands.key);
    assert.strictEqual(value, false, "Context key should remain false for non-create slash commands");
  });
  test("does not mark used when session has no last request", () => {
    const sessionResource = URI.parse("chat:session5");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), { lastRequest: void 0 });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(
      storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false),
      false,
      "Should not mark used when there is no last request"
    );
  });
  test("only marks used once even with multiple create commands", () => {
    const sessionResource = URI.parse("chat:session6");
    const tracker = createTracker();
    tracker.syncContextKey(contextKeyService);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: { text: "/create-skill test", parts: [] }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false), true);
    sessions.set(sessionResource.toString(), {
      lastRequest: {
        message: { text: "/create-prompt test", parts: [] }
      }
    });
    submitRequestEmitter.fire({ chatSessionResource: sessionResource });
    assert.strictEqual(storageService.getBoolean("chat.tips.usedCreateSlashCommands", StorageScope.APPLICATION, false), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRUaXBTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEV2ZW50LCBJQ29tbWFuZFNlcnZpY2UsIENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L3Rlc3QvY29tbW9uL251bGxBc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0VGlwU2VydmljZSwgQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5ELCBDUkVBVEVfQUdFTlRfVFJBQ0tJTkdfQ09NTUFORCwgQ1JFQVRFX1BST01QVF9UUkFDS0lOR19DT01NQU5ELCBDUkVBVEVfU0tJTExfVFJBQ0tJTkdfQ09NTUFORCwgRk9SS19DT05WRVJTQVRJT05fVFJBQ0tJTkdfQ09NTUFORCwgSUNoYXRUaXAsIElUaXBEZWZpbml0aW9uLCBUaXBFbGlnaWJpbGl0eVRyYWNrZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZSwgSVByb21wdFBhdGgsIElQcm9tcHRzU2VydmljZSwgSUFnZW50SW5zdHJ1Y3Rpb25GaWxlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IHN0b3JlU2VsZWN0ZWRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VsZWN0ZWRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90b29scy9tb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0VGlwVGllciwgVElQX0NBVEFMT0csIGV4dHJhY3RDb21tYW5kSWRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0VGlwQ2F0YWxvZy5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCwgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0LCBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsIEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcblxuY2xhc3MgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcgZXh0ZW5kcyBNb2NrQ29udGV4dEtleVNlcnZpY2Uge1xuXHRvdmVycmlkZSBjb250ZXh0TWF0Y2hlc1J1bGVzKHJ1bGVzOiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBydWxlcy5ldmFsdWF0ZSh7IGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IHRoaXMuZ2V0Q29udGV4dEtleVZhbHVlKGtleSkgfSk7XG5cdH1cbn1cblxuY2xhc3MgVHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdHB1YmxpYyBsYXN0VXBkYXRlVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbGFzdFVwZGF0ZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbGFzdFVwZGF0ZVZhbHVlOiB1bmtub3duO1xuXG5cdG92ZXJyaWRlIHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgYXJnMz86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxhc3RVcGRhdGVLZXkgPSBrZXk7XG5cdFx0dGhpcy5sYXN0VXBkYXRlVmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmxhc3RVcGRhdGVUYXJnZXQgPSBhcmczIGFzIENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG59XG5cbnN1aXRlKCdDaGF0VGlwU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb250ZXh0S2V5U2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmc7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29tbWFuZEV4ZWN1dGVkRW1pdHRlcjogRW1pdHRlcjxJQ29tbWFuZEV2ZW50Pjtcblx0bGV0IHN0b3JhZ2VTZXJ2aWNlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlO1xuXHRsZXQgbW9ja0luc3RydWN0aW9uRmlsZXM6IElBZ2VudEluc3RydWN0aW9uRmlsZVtdO1xuXHRsZXQgbW9ja1Byb21wdEluc3RydWN0aW9uRmlsZXM6IElQcm9tcHRQYXRoW107XG5cdGxldCBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZTtcblx0bGV0IGNhdGFsb2dDb21tYW5kUmVnaXN0cmF0aW9uczogTWFwPHN0cmluZywgSURpc3Bvc2FibGU+O1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgZXZlcnkgYGNvbW1hbmQ6YCBsaW5rIHJlZmVyZW5jZWQgYnkgdGhlIHJlYWwge0BsaW5rIFRJUF9DQVRBTE9HfSBzbyB0aGF0IHRpcHMgYXJlXG5cdCAqIGNvbnNpZGVyZWQgZWxpZ2libGUsIHNpbXVsYXRpbmcgYSBydW5uaW5nIHdvcmtiZW5jaCB3aGVyZSB0aGVzZSBjb21tYW5kcyBleGlzdC4gUmV0dXJucyBhIG1hcFxuXHQgKiBrZXllZCBieSBjb21tYW5kIGlkIHNvIGluZGl2aWR1YWwgcmVnaXN0cmF0aW9ucyBjYW4gYmUgZGlzcG9zZWQgdG8gc2ltdWxhdGUgYSBtaXNzaW5nIGNvbW1hbmQuXG5cdCAqL1xuXHRmdW5jdGlvbiByZWdpc3RlckNhdGFsb2dDb21tYW5kcygpOiBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdFx0Zm9yIChjb25zdCB0aXAgb2YgVElQX0NBVEFMT0cpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aXAuYnVpbGRNZXNzYWdlKHtcblx0XHRcdFx0a2V5YmluZGluZ1NlcnZpY2U6IHsgbG9va3VwS2V5YmluZGluZzogKCkgPT4gdW5kZWZpbmVkIH0gYXMgUGFydGlhbDxJS2V5YmluZGluZ1NlcnZpY2U+IGFzIElLZXliaW5kaW5nU2VydmljZSxcblx0XHRcdFx0ZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IG5ldyBNYXAoKSxcblx0XHRcdH0pLnZhbHVlO1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kSWQgb2YgZXh0cmFjdENvbW1hbmRJZHMobWVzc2FnZSkpIHtcblx0XHRcdFx0aWYgKHJlZ2lzdHJhdGlvbnMuaGFzKGNvbW1hbmRJZCkgfHwgQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmRJZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChjb21tYW5kSWQsICgpID0+IHsgfSk7XG5cdFx0XHRcdHJlZ2lzdHJhdGlvbnMuc2V0KGNvbW1hbmRJZCwgcmVnaXN0cmF0aW9uKTtcblx0XHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWdpc3RyYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVnaXN0cmF0aW9ucztcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVByb2R1Y3RTZXJ2aWNlKGhhc0NvcGlsb3Q6IGJvb2xlYW4pOiBJUHJvZHVjdFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRkZWZhdWx0Q2hhdEFnZW50OiBoYXNDb3BpbG90ID8geyBjaGF0RXh0ZW5zaW9uSWQ6ICdnaXRodWIuY29waWxvdC1jaGF0JyB9IDogdW5kZWZpbmVkLFxuXHRcdH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShoYXNDb3BpbG90OiBib29sZWFuID0gdHJ1ZSwgdGlwc0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlKTogQ2hhdFRpcFNlcnZpY2Uge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVQcm9kdWN0U2VydmljZShoYXNDb3BpbG90KSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQudGlwcy5lbmFibGVkJywgdGlwc0VuYWJsZWQpO1xuXHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUaXBTZXJ2aWNlKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG1vY2sgSVRpcERlZmluaXRpb24gd2l0aCBhIGJ1aWxkTWVzc2FnZSBmdW5jdGlvbi5cblx0ICogVGVzdHMgY2FuIHByb3ZpZGUgYW55IElUaXBEZWZpbml0aW9uIHByb3BlcnRpZXMgZXhjZXB0IGJ1aWxkTWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUaXAob3ZlcnJpZGVzOiBPbWl0PFBhcnRpYWw8SVRpcERlZmluaXRpb24+LCAnYnVpbGRNZXNzYWdlJz4gJiBQaWNrPElUaXBEZWZpbml0aW9uLCAnaWQnPiAmIHsgbWVzc2FnZT86IHN0cmluZyB9KTogSVRpcERlZmluaXRpb24ge1xuXHRcdGNvbnN0IHsgbWVzc2FnZSwgLi4ucmVzdCB9ID0gb3ZlcnJpZGVzO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0XHQuLi5yZXN0LFxuXHRcdFx0YnVpbGRNZXNzYWdlOiAoKSA9PiBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSA/PyAndGVzdCcpLFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UgPSBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5LCAxKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQ29tbWFuZEV2ZW50PigpKTtcblx0XHRzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0bW9ja0luc3RydWN0aW9uRmlsZXMgPSBbXTtcblx0XHRtb2NrUHJvbXB0SW5zdHJ1Y3Rpb25GaWxlcyA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwge1xuXHRcdFx0b25EaWRFeGVjdXRlQ29tbWFuZDogY29tbWFuZEV4ZWN1dGVkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uV2lsbEV4ZWN1dGVDb21tYW5kOiB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElDb21tYW5kRXZlbnQ+KCkpLmV2ZW50LFxuXHRcdH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvbXB0c1NlcnZpY2UsIHtcblx0XHRcdGxpc3RBZ2VudEluc3RydWN0aW9uczogYXN5bmMgKCkgPT4gbW9ja0luc3RydWN0aW9uRmlsZXMsXG5cdFx0XHRsaXN0UHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IG1vY2tQcm9tcHRJbnN0cnVjdGlvbkZpbGVzLFxuXHRcdFx0b25EaWRDaGFuZ2VDdXN0b21BZ2VudHM6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElQcm9tcHRzU2VydmljZT4gYXMgSVByb21wdHNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKSk7XG5cdFx0Y2hhdEVudGl0bGVtZW50U2VydmljZSA9IG5ldyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSgpO1xuXHRcdGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuQXZhaWxhYmxlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIGNoYXRFbnRpdGxlbWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElLZXliaW5kaW5nU2VydmljZSwge1xuXHRcdFx0bG9va3VwS2V5YmluZGluZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgUGFydGlhbDxJS2V5YmluZGluZ1NlcnZpY2U+IGFzIElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsIG5ldyBOdWxsV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UoKSk7XG5cdFx0Y2F0YWxvZ0NvbW1hbmRSZWdpc3RyYXRpb25zID0gcmVnaXN0ZXJDYXRhbG9nQ29tbWFuZHMoKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIHdlbGNvbWUgdGlwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAsICdTaG91bGQgcmV0dXJuIGEgd2VsY29tZSB0aXAnKTtcblx0XHRhc3NlcnQub2sodGlwLmlkLnN0YXJ0c1dpdGgoJ3RpcC4nKSwgJ1RpcCBzaG91bGQgaGF2ZSBhIHZhbGlkIElEJyk7XG5cdFx0YXNzZXJ0Lm9rKHRpcC5jb250ZW50LnZhbHVlLmxlbmd0aCA+IDAsICdUaXAgc2hvdWxkIGhhdmUgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGRlc2NyaXB0aXZlIHRpdGxlcyBmb3IgdGlwIGNvbW1hbmQgbGlua3MnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCB0aXAgb2YgVElQX0NBVEFMT0cpIHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gdGlwLmJ1aWxkTWVzc2FnZSh7XG5cdFx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlOiB7XG5cdFx0XHRcdFx0bG9va3VwS2V5YmluZGluZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHR9IGFzIFBhcnRpYWw8SUtleWJpbmRpbmdTZXJ2aWNlPiBhcyBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0XHRcdGV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzOiBuZXcgTWFwKCksXG5cdFx0XHR9KS52YWx1ZTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZExpbmtSZWdleCA9IC9cXFtbXlxcXV0rXFxdXFwoKGNvbW1hbmQ6W14pXSspXFwpL2c7XG5cdFx0XHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0XHR3aGlsZSAoKG1hdGNoID0gY29tbWFuZExpbmtSZWdleC5leGVjKG1hcmtkb3duKSkgIT09IG51bGwpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKC9cXHNcIlteXCJdK1wiJC8udGVzdChtYXRjaFsxXSksIGBFeHBlY3RlZCBjb21tYW5kIGxpbmsgaW4gJHt0aXAuaWR9IHRvIGluY2x1ZGUgYSBkZXNjcmlwdGl2ZSB0aXRsZTogJHttYXRjaFswXX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZHMgIyBmaWxlIHJlZmVyZW5jZSB1c2FnZSBmb3IgYXR0YWNoIGZpbGVzIHRpcCBlbGlnaWJpbGl0eScsICgpID0+IHtcblx0XHRjb25zdCBzdWJtaXRSZXF1ZXN0RW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkU3VibWl0UmVxdWVzdDogc3VibWl0UmVxdWVzdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0U2VydmljZT4gYXMgSUNoYXRTZXJ2aWNlKTtcblxuXHRcdGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoe1xuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24tYXR0YWNoLWZpbGUnKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogJ3doYXQgZG9lcyAjZmlsZTpSRUFETUUubWQgc2F5Jyxcblx0XHRcdFx0cGFydHM6IFtuZXcgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0KFxuXHRcdFx0XHRcdG5ldyBPZmZzZXRSYW5nZSgxMCwgMjYpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxMSwgMSwgMjcpLFxuXHRcdFx0XHRcdCcjZmlsZTpSRUFETUUubWQnLFxuXHRcdFx0XHRcdCdmaWxlJyxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy93b3Jrc3BhY2UvUkVBRE1FLm1kJyksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHQpXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBleGVjdXRlZENvbW1hbmRzID0gSlNPTi5wYXJzZShzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA/PyAnW10nKSBhcyBzdHJpbmdbXTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcygnY2hhdC50aXBzLmF0dGFjaEZpbGVzLnJlZmVyZW5jZVVzZWQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZHMgb25seSBtYXRjaGluZyBjcmVhdGUgdGlwIHVzYWdlIGZvciBzdWJtaXR0ZWQgY3JlYXRlIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VibWl0UmVxdWVzdEVtaXR0ZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJOyByZWFkb25seSBtZXNzYWdlPzogSVBhcnNlZENoYXRSZXF1ZXN0IH0+KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZFN1Ym1pdFJlcXVlc3Q6IHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFNlcnZpY2U+IGFzIElDaGF0U2VydmljZSk7XG5cblx0XHRjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHtcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uLWNyZWF0ZS1wcm9tcHQnKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogJy9jcmVhdGUtcHJvbXB0IHNjYWZmb2xkIGEgcmV1c2FibGUgcHJvbXB0Jyxcblx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4ZWN1dGVkQ29tbWFuZHMgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pID8/ICdbXScpIGFzIHN0cmluZ1tdO1xuXHRcdGFzc2VydC5vayhleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9QUk9NUFRfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX0FHRU5UX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX1NLSUxMX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoRk9SS19DT05WRVJTQVRJT05fVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRzIGluaXQgdGlwIHVzYWdlIGZvciBzdWJtaXR0ZWQgL2luaXQgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBzdWJtaXRSZXF1ZXN0RW1pdHRlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IG1lc3NhZ2U/OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfT4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkU3VibWl0UmVxdWVzdDogc3VibWl0UmVxdWVzdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0U2VydmljZT4gYXMgSUNoYXRTZXJ2aWNlKTtcblxuXHRcdGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoe1xuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24taW5pdCcpLFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0ZXh0OiAnL2luaXQnLFxuXHRcdFx0XHRwYXJ0czogW10sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXhlY3V0ZWRDb21tYW5kcyA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPz8gJ1tdJykgYXMgc3RyaW5nW107XG5cdFx0YXNzZXJ0Lm9rKGV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9QUk9NUFRfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfQUdFTlRfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfU0tJTExfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhGT1JLX0NPTlZFUlNBVElPTl9UUkFDS0lOR19DT01NQU5EKSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnaGlkZXMgc2hvd24gc2xhc2ggdGlwIGFmdGVyIHN1Ym1pdHRlZCBzbGFzaCBjb21tYW5kIHdpdGhvdXQgY2xpY2tpbmcgdGlwIGxpbmsnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VibWl0UmVxdWVzdEVtaXR0ZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJOyByZWFkb25seSBtZXNzYWdlPzogSVBhcnNlZENoYXRSZXF1ZXN0IH0+KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZFN1Ym1pdFJlcXVlc3Q6IHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFNlcnZpY2U+IGFzIElDaGF0U2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0bGV0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IFRJUF9DQVRBTE9HLmxlbmd0aCAmJiB0aXA/LmlkICE9PSAndGlwLmluaXQnOyBpKyspIHtcblx0XHRcdHRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLmluaXQnLCAnRXhwZWN0ZWQgdG8gbmF2aWdhdGUgdG8gdGhlIGluaXQgdGlwIGJlZm9yZSBzdWJtaXR0aW5nIC9pbml0Jyk7XG5cblx0XHRsZXQgZGlkSGlkZSA9IGZhbHNlO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEhpZGVUaXAoKCkgPT4gZGlkSGlkZSA9IHRydWUpKTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoe1xuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24tYWR2YW5jZS1pbml0JyksXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHRleHQ6ICcvaW5pdCcsXG5cdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2soZGlkSGlkZSwgJ0V4cGVjdGVkIHNsYXNoIHRpcCB0byBoaWRlIGFmdGVyIHN1Ym1pdHRpbmcgL2luaXQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKT8uaWQsICd0aXAuaW5pdCcsICdFeHBlY3RlZCBpbml0IHRpcCB0byBzdGF5IGV4Y2x1ZGVkIGFmdGVyIHNsYXNoIHVzYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgc2xhc2ggdGlwIGZyb20gcm90YXRpb24gYWZ0ZXIgc3VibWl0dGVkIHNsYXNoIGNvbW1hbmQgdmlhIGVsaWdpYmlsaXR5IHRyYWNraW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1Ym1pdFJlcXVlc3RFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0b25EaWRTdWJtaXRSZXF1ZXN0OiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5ldmVudCxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblxuXHRcdGxldCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBUSVBfQ0FUQUxPRy5sZW5ndGggJiYgdGlwPy5pZCAhPT0gJ3RpcC5pbml0JzsgaSsrKSB7XG5cdFx0XHR0aXAgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5pbml0Jyk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHtcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uLXJvdGF0ZS1pbml0JyksXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHRleHQ6ICcvaW5pdCcsXG5cdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IFRJUF9DQVRBTE9HLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aXAgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0XHRpZiAoIXRpcCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuaW5pdCcsICdFeHBlY3RlZCBpbml0IHRpcCB0byBiZSByZW1vdmVkIGZyb20gdGlwIHJvdGF0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhlY3V0ZWRDb21tYW5kcyA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPz8gJ1tdJykgYXMgc3RyaW5nW107XG5cdFx0YXNzZXJ0Lm9rKGV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EKSwgJ0V4cGVjdGVkIHNsYXNoIHVzYWdlIHRvIGJlIHRyYWNrZWQgaW4gZXhlY3V0ZWQgY29tbWFuZCBleGNsdXNpb25zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgc2xhc2ggdGlwIGZyb20gcm90YXRpb24gd2hlbiBzbGFzaCB1c2FnZSBpcyByZWNvcmRlZCBiZWZvcmUgaW5wdXQgdHJhbnNmb3JtYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblxuXHRcdGxldCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBUSVBfQ0FUQUxPRy5sZW5ndGggJiYgdGlwPy5pZCAhPT0gJ3RpcC5pbml0JzsgaSsrKSB7XG5cdFx0XHR0aXAgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5pbml0Jyk7XG5cblx0XHRzZXJ2aWNlLnJlY29yZFNsYXNoQ29tbWFuZFVzYWdlKCdpbml0Jyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IFRJUF9DQVRBTE9HLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aXAgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0XHRpZiAoIXRpcCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuaW5pdCcsICdFeHBlY3RlZCBpbml0IHRpcCB0byBiZSByZW1vdmVkIGZyb20gdGlwIHJvdGF0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhlY3V0ZWRDb21tYW5kcyA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPz8gJ1tdJykgYXMgc3RyaW5nW107XG5cdFx0YXNzZXJ0Lm9rKGV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EKSwgJ0V4cGVjdGVkIHNsYXNoIHVzYWdlIHRvIGJlIHRyYWNrZWQgaW4gZXhlY3V0ZWQgY29tbWFuZCBleGNsdXNpb25zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZHMgZm9yayB0aXAgdXNhZ2UgZm9yIHN1Ym1pdHRlZCAvZm9yayBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1Ym1pdFJlcXVlc3RFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0b25EaWRTdWJtaXRSZXF1ZXN0OiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5ldmVudCxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0Y3JlYXRlU2VydmljZSgpO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbi1mb3JrJyksXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHRleHQ6ICcvZm9yaycsXG5cdFx0XHRcdHBhcnRzOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBleGVjdXRlZENvbW1hbmRzID0gSlNPTi5wYXJzZShzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA/PyAnW10nKSBhcyBzdHJpbmdbXTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhGT1JLX0NPTlZFUlNBVElPTl9UUkFDS0lOR19DT01NQU5EKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleGVjdXRlZENvbW1hbmRzLmluY2x1ZGVzKENSRUFURV9BR0VOVF9JTlNUUlVDVElPTlNfVFJBQ0tJTkdfQ09NTUFORCkpO1xuXHRcdGFzc2VydC5vayghZXhlY3V0ZWRDb21tYW5kcy5pbmNsdWRlcyhDUkVBVEVfUFJPTVBUX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX0FHRU5UX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0XHRhc3NlcnQub2soIWV4ZWN1dGVkQ29tbWFuZHMuaW5jbHVkZXMoQ1JFQVRFX1NLSUxMX1RSQUNLSU5HX0NPTU1BTkQpKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBBdXRvIHN3aXRjaCB0aXAgd2hlbiBjdXJyZW50IG1vZGVsIGlzIGdwdC00LjEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2dwdC00LjEnKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLnN3aXRjaFRvQXV0bycpO1xuXHRcdGFzc2VydC5vayh0aXAuY29udGVudC52YWx1ZS5pbmNsdWRlcygnR1BULTQuMScpKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0dXJuIEF1dG8gc3dpdGNoIHRpcCB3aGVuIGN1cnJlbnQgbW9kZWwgaXMgbm90IGdwdC00LjEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLnN3aXRjaFRvQXV0bycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXR1cm4gQXV0byBzd2l0Y2ggdGlwIHdoZW4gY3VycmVudCBtb2RlbCBjb250ZXh0IGtleSBpcyBlbXB0eSBhbmQgbm8gZmFsbGJhY2sgaXMgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICcnKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLnN3aXRjaFRvQXV0bycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIEF1dG8gc3dpdGNoIHRpcCB3aGVuIGN1cnJlbnQgbW9kZWwgaXMgcGVyc2lzdGVkIGFuZCBjb250ZXh0IGtleSBpcyBlbXB0eScsICgpID0+IHtcblx0XHRzdG9yZVNlbGVjdGVkTW9kZWwoc3RvcmFnZVNlcnZpY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHVuZGVmaW5lZCwgJ2NvcGlsb3QvZ3B0LTQuMS0yMDI1LTA0LTE0Jyk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJycpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAuaWQsICd0aXAuc3dpdGNoVG9BdXRvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgQXV0byBzd2l0Y2ggdGlwIHdoZW4gY3VycmVudCBtb2RlbCBpcyB2ZXJzaW9uZWQgZ3B0LTQuMScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnZ3B0LTQuMS0yMDI1LTA0LTE0Jyk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5zd2l0Y2hUb0F1dG8nKTtcblx0fSk7XG5cblx0dGVzdCgnc3dpdGNoaW5nIG1vZGVscyBhZHZhbmNlcyBhd2F5IGZyb20gZ3B0LTQuMSB0aXAnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2dwdC00LjEnKTtcblxuXHRcdGNvbnN0IGZpcnN0VGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soZmlyc3RUaXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFRpcC5pZCwgJ3RpcC5zd2l0Y2hUb0F1dG8nKTtcblxuXHRcdGNvbnN0IHN3aXRjaGVkQ29udGV4dEtleVNlcnZpY2UgPSBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcoKTtcblx0XHRzd2l0Y2hlZENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXksIDEpO1xuXHRcdHN3aXRjaGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdhdXRvJyk7XG5cdFx0Y29uc3QgbmV4dFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChzd2l0Y2hlZENvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5vayhuZXh0VGlwKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwobmV4dFRpcC5pZCwgJ3RpcC5zd2l0Y2hUb0F1dG8nKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBzYW1lIHdlbGNvbWUgdGlwIG9uIHJlcmVuZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aXAxID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMSk7XG5cblx0XHRjb25zdCB0aXAyID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcDEuaWQsIHRpcDIuaWQsICdTaG91bGQgcmV0dXJuIHNhbWUgdGlwIGZvciBzdGFibGUgcmVyZW5kZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwMS5jb250ZW50LnZhbHVlLCB0aXAyLmNvbnRlbnQudmFsdWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIENvcGlsb3QgaXMgbm90IGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoLyogaGFzQ29waWxvdCAqLyBmYWxzZSk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgcmV0dXJuIGEgdGlwIHdoZW4gQ29waWxvdCBpcyBub3QgZW5hYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHVzZXIgaXMgc2lnbmVkIG91dCcsICgpID0+IHtcblx0XHRjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID0gQ2hhdEVudGl0bGVtZW50LlVua25vd247XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcCwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCByZXR1cm4gYSB0aXAgd2hlbiB0aGUgdXNlciBpcyBzaWduZWQgb3V0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGlwcyBzZXR0aW5nIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKC8qIGhhc0NvcGlsb3QgKi8gdHJ1ZSwgLyogdGlwc0VuYWJsZWQgKi8gZmFsc2UpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGlwLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHJldHVybiBhIHRpcCB3aGVuIHRpcHMgc2V0dGluZyBpcyBkaXNhYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGxvY2F0aW9uIGlzIHRlcm1pbmFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0ZXJtaW5hbENvbnRleHRLZXlTZXJ2aWNlID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZVdpdGhSdWxlc01hdGNoaW5nKCk7XG5cdFx0dGVybWluYWxDb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmtleSwgQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKHRlcm1pbmFsQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXAsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgcmV0dXJuIGEgdGlwIGluIHRlcm1pbmFsIGlubGluZSBjaGF0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbG9jYXRpb24gaXMgZWRpdG9yIGlubGluZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgZWRpdG9yQ29udGV4dEtleVNlcnZpY2UgPSBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcoKTtcblx0XHRlZGl0b3JDb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmtleSwgQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChlZGl0b3JDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcCwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCByZXR1cm4gYSB0aXAgaW4gZWRpdG9yIGlubGluZSBjaGF0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYSB0aXAgd2hlbiBmb3JlZ3JvdW5kIHNlc3Npb24gY291bnQgaXMgZXhhY3RseSBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5LCAxKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCwgJ1Nob3VsZCByZXR1cm4gYSB0aXAgd2hlbiBleGFjdGx5IG9uZSBmb3JlZ3JvdW5kIGNoYXQgc2Vzc2lvbiBpcyB2aXNpYmxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gZm9yZWdyb3VuZCBzZXNzaW9uIGNvdW50IGlzIHplcm8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5LCAwKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcCwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCByZXR1cm4gYSB0aXAgd2hlbiBubyBmb3JlZ3JvdW5kIGNoYXQgc2Vzc2lvbnMgYXJlIHZpc2libGUnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIHRpcCBmb3IgdGhlIEFnZW50cyBuZXctc2Vzc2lvbiBjb21wb3NlciB3aGVuIGZvcmVncm91bmQgc2Vzc2lvbiBjb3VudCBpcyB6ZXJvJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5mb3JlZ3JvdW5kU2Vzc2lvbkNvdW50LmtleSwgMCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmtleSwgdHJ1ZSk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAsICdTaG91bGQgcmV0dXJuIGEgdGlwIGZvciB0aGUgQWdlbnRzIG5ldy1zZXNzaW9uIGNvbXBvc2VyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gZm9yZWdyb3VuZCBzZXNzaW9uIGNvdW50IGlzIGdyZWF0ZXIgdGhhbiBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5LCAyKTtcblxuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcCwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCByZXR1cm4gYSB0aXAgd2hlbiBtdWx0aXBsZSBmb3JlZ3JvdW5kIGNoYXQgc2Vzc2lvbnMgYXJlIHZpc2libGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzbWlzc1RpcCBleGNsdWRlcyB0aGUgZGlzbWlzc2VkIHRpcCBhbmQgYWxsb3dzIGEgbmV3IG9uZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgdGlwMSA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcDEpO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cblx0XHRjb25zdCB0aXAyID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAodGlwMikge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcDEuaWQsIHRpcDIuaWQsICdEaXNtaXNzZWQgdGlwIHNob3VsZCBub3QgYmUgc2hvd24gYWdhaW4nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NUaXAga2VlcHMgbmF2aWdhdGlvbiBjb250ZXh0IGZvciBuZXh0IHRpcCB0cmF2ZXJzYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHRpcDEgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAxKTtcblxuXHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXG5cdFx0Y29uc3QgdGlwMiA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRpZiAodGlwMikge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcDEuaWQsIHRpcDIuaWQsICdEaXNtaXNzZWQgdGlwIHNob3VsZCBub3QgYmUgcmV0dXJuZWQgYnkgbmV4dCBuYXZpZ2F0aW9uJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzVGlwRm9yU2Vzc2lvbiBoaWRlcyB0aXBzIHVudGlsIHJlc2V0U2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwKTtcblxuXHRcdHNlcnZpY2UuZGlzbWlzc1RpcEZvclNlc3Npb24oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpLCB1bmRlZmluZWQsICdUaXBzIHNob3VsZCBzdGF5IGhpZGRlbiBmb3IgdGhlIGN1cnJlbnQgc2Vzc2lvbiBhZnRlciBkaXNtaXNzaW5nJyk7XG5cblx0XHRzZXJ2aWNlLnJlc2V0U2Vzc2lvbigpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpLCAnVGlwcyBzaG91bGQgcmVhcHBlYXIgYWZ0ZXIgcmVzZXR0aW5nIHRoZSBzZXNzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRlVG9OZXh0VGlwIGtlZXBzIGZvdW5kYXRpb25hbCB0aXBzIGJlZm9yZSBRb0wgdGlwcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0Y29uc3QgZmlyc3RUaXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayhmaXJzdFRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0VGlwLmlkLCAndGlwLnBsYW5Nb2RlJyk7XG5cblx0XHRjb25zdCBzZWNvbmRUaXAgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZFRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFRpcC5pZCwgJ3RpcC5jcmVhdGVBZ2VudCcsICdFeHBlY3RlZCBuZXh0IHRpcCB0byByZW1haW4gaW4gZm91bmRhdGlvbmFsIHRpcHMgYmVmb3JlIFFvTCB0aXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRlVG9QcmV2aW91c1RpcCBmb2xsb3dzIHJldmVyc2Ugb2YgcHJlZmVycmVkIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdhdXRvJyk7XG5cblx0XHRjb25zdCBmaXJzdFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0VGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RUaXAuaWQsICd0aXAucGxhbk1vZGUnKTtcblxuXHRcdGNvbnN0IHNlY29uZFRpcCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRhc3NlcnQub2soc2Vjb25kVGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kVGlwLmlkLCAndGlwLmNyZWF0ZUFnZW50Jyk7XG5cblx0XHRjb25zdCBwcmV2aW91c1RpcCA9IHNlcnZpY2UubmF2aWdhdGVUb1ByZXZpb3VzVGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKHByZXZpb3VzVGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlvdXNUaXAuaWQsICd0aXAucGxhbk1vZGUnLCAnRXhwZWN0ZWQgcHJldmlvdXMgdGlwIHRvIHJldmVyc2UgdGhlIHByZWZlcnJlZCBvcmRlcmluZycpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBhIHRpcCB3aG9zZSBjb21tYW5kIGlzIG5vdCByZWdpc3RlcmVkJywgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlIGEgc2hpcHBlZCBidWlsZCB3aGVyZSB0aGUgdGlwIHJlZmVyZW5jZXMgYSBjb21tYW5kIHRoYXQgd2FzIG5ldmVyIHJlZ2lzdGVyZWRcblx0XHQvLyAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjgyMzEpLlxuXHRcdGNhdGFsb2dDb21tYW5kUmVnaXN0cmF0aW9ucy5nZXQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGxhbicpIS5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0YXNzZXJ0VGlwTmV2ZXJTaG93bihzZXJ2aWNlLCAndGlwLnBsYW5Nb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5leHRFbGlnaWJsZVRpcCByZXR1cm5zIG5leHQgdGlwIGV2ZW4gd2hlbiBvbmx5IG9uZSByZW1haW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHQvLyBGbHVzaCBtaWNyb3Rhc2sgcXVldWUgc28gYXN5bmMgZmlsZS1jaGVjayBleGNsdXNpb25zIHJlc29sdmVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdC8vIEdldCB0aGUgaW5pdGlhbCB0aXBcblx0XHRjb25zdCB0aXAxID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMSwgJ1Nob3VsZCBoYXZlIGFuIGluaXRpYWwgdGlwJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBuZXh0IHRpcFxuXHRcdGNvbnN0IHRpcDIgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKHRpcDIsICdTaG91bGQgaGF2ZSBhIHNlY29uZCB0aXAnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwMS5pZCwgdGlwMi5pZCwgJ1NlY29uZCB0aXAgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuXG5cdFx0Ly8gRGlzbWlzcyBhbGwgdGlwcyBleGNlcHQgdGlwMSBieSBkaXNtaXNzaW5nIGN1cnJlbnQgdGlwIGFuZCB1c2luZyBnZXROZXh0RWxpZ2libGVUaXBcblx0XHRjb25zdCBkaXNtaXNzZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRkaXNtaXNzZWRJZHMuYWRkKHRpcDIuaWQpO1xuXHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXG5cdFx0Ly8gS2VlcCBkaXNtaXNzaW5nIHVudGlsIHdlIGNhbid0IGdldCBhbnkgbW9yZSB0aXBzXG5cdFx0bGV0IG5leHRUaXAgPSBzZXJ2aWNlLmdldE5leHRFbGlnaWJsZVRpcCgpO1xuXHRcdHdoaWxlIChuZXh0VGlwICYmICFkaXNtaXNzZWRJZHMuaGFzKG5leHRUaXAuaWQpKSB7XG5cdFx0XHRpZiAobmV4dFRpcC5pZCA9PT0gdGlwMS5pZCkge1xuXHRcdFx0XHQvLyBXZSBmb3VuZCB0aXAxIGFnYWluIC0gdGhpcyBpcyB0aGUgZXhwZWN0ZWQgYmVoYXZpb3IgKGJ1ZyBmaXggdmVyaWZpY2F0aW9uKVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRpc21pc3NlZElkcy5hZGQobmV4dFRpcC5pZCk7XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHRcdG5leHRUaXAgPSBzZXJ2aWNlLmdldE5leHRFbGlnaWJsZVRpcCgpO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBrZXkgYXNzZXJ0aW9uOiBnZXROZXh0RWxpZ2libGVUaXAgc2hvdWxkIHJldHVybiB0aXAxIGV2ZW4gaWYgaXQncyB0aGUgb25seSBvbmUgbGVmdFxuXHRcdGFzc2VydC5vayhuZXh0VGlwLCAnZ2V0TmV4dEVsaWdpYmxlVGlwIHNob3VsZCByZXR1cm4gdGhlIGxhc3QgcmVtYWluaW5nIGVsaWdpYmxlIHRpcCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZXh0RWxpZ2libGVUaXAgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBhbGwgdGlwcyBhcmUgZGlzbWlzc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHQvLyBGbHVzaCBtaWNyb3Rhc2sgcXVldWUgc28gYXN5bmMgZmlsZS1jaGVjayBleGNsdXNpb25zIHJlc29sdmVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdC8vIERpc21pc3MgYWxsIHRpcHNcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cblx0XHQvLyBBZnRlciBkaXNtaXNzaW5nIGFsbCwgZ2V0TmV4dEVsaWdpYmxlVGlwIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkXG5cdFx0Y29uc3QgbmV4dFRpcCA9IHNlcnZpY2UuZ2V0TmV4dEVsaWdpYmxlVGlwKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHRUaXAsIHVuZGVmaW5lZCwgJ2dldE5leHRFbGlnaWJsZVRpcCBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGFsbCB0aXBzIGFyZSBkaXNtaXNzZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TmV4dEVsaWdpYmxlVGlwIGtlZXBzIHByZWZlcnJlZCBvbmJvYXJkaW5nIG9yZGVyIGFmdGVyIGRpc21pc3NpbmcgcGxhbiB0aXAnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlbElkLmtleSwgJ2F1dG8nKTtcblxuXHRcdGNvbnN0IGZpcnN0VGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soZmlyc3RUaXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFRpcC5pZCwgJ3RpcC5wbGFuTW9kZScpO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0Y29uc3Qgc2Vjb25kVGlwID0gc2VydmljZS5nZXROZXh0RWxpZ2libGVUaXAoKTtcblx0XHRhc3NlcnQub2soc2Vjb25kVGlwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kVGlwLmlkLCAndGlwLmNyZWF0ZUFnZW50JywgJ0V4cGVjdGVkIG5leHQgdGlwIHRvIGZvbGxvdyBwcmVmZXJyZWQgb25ib2FyZGluZyBvcmRlciBiZWZvcmUgUW9MIHRpcHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TmV4dEVsaWdpYmxlVGlwIHBpY2tzIG5leHQgcmVsYXRpdmUgdG8gY3VycmVudCB0aXAgYWZ0ZXIgZGlzbWlzc2luZyBmcm9tIG1pZGRsZSBvZiBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0Y29uc3QgZmlyc3RUaXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayhmaXJzdFRpcCk7XG5cblx0XHRjb25zdCBzZWNvbmRUaXAgPSBzZXJ2aWNlLm5hdmlnYXRlVG9OZXh0VGlwKCk7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZFRpcCk7XG5cblx0XHRjb25zdCBleHBlY3RlZE5leHRBZnRlclNlY29uZCA9IHNlcnZpY2UubmF2aWdhdGVUb05leHRUaXAoKTtcblx0XHRhc3NlcnQub2soZXhwZWN0ZWROZXh0QWZ0ZXJTZWNvbmQsICdFeHBlY3RlZCBhdCBsZWFzdCB0aHJlZSB0aXBzIHRvIHZhbGlkYXRlIHJlbGF0aXZlIG9yZGVyaW5nJyk7XG5cblx0XHRjb25zdCBiYWNrVG9TZWNvbmQgPSBzZXJ2aWNlLm5hdmlnYXRlVG9QcmV2aW91c1RpcCgpO1xuXHRcdGFzc2VydC5vayhiYWNrVG9TZWNvbmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9TZWNvbmQuaWQsIHNlY29uZFRpcC5pZCk7XG5cblx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHRjb25zdCBhY3R1YWxOZXh0ID0gc2VydmljZS5nZXROZXh0RWxpZ2libGVUaXAoKTtcblx0XHRhc3NlcnQub2soYWN0dWFsTmV4dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbE5leHQuaWQsIGV4cGVjdGVkTmV4dEFmdGVyU2Vjb25kLmlkLCAnRXhwZWN0ZWQgZ2V0TmV4dEVsaWdpYmxlVGlwIHRvIGFkdmFuY2UgcmVsYXRpdmUgdG8gY3VycmVudCB0aXAgcmF0aGVyIHRoYW4gcmVzdGFydCBmcm9tIHRvcCBwcmlvcml0eSB0aXAnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzbWlzc1RpcCBmaXJlcyBvbkRpZERpc21pc3NUaXAgZXZlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRsZXQgZmlyZWQgPSBmYWxzZTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWREaXNtaXNzVGlwKCgpID0+IHsgZmlyZWQgPSB0cnVlOyB9KSk7XG5cdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cblx0XHRhc3NlcnQub2soZmlyZWQsICdvbkRpZERpc21pc3NUaXAgc2hvdWxkIGZpcmUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZVRpcHMgZmlyZXMgb25EaWREaXNhYmxlVGlwcyBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0c2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGxldCBmaXJlZCA9IGZhbHNlO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZERpc2FibGVUaXBzKCgpID0+IHsgZmlyZWQgPSB0cnVlOyB9KSk7XG5cdFx0YXdhaXQgc2VydmljZS5kaXNhYmxlVGlwcygpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZpcmVkLCAnb25EaWREaXNhYmxlVGlwcyBzaG91bGQgZmlyZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlVGlwcyB3cml0ZXMgdG8gYXBwbGljYXRpb24gc2V0dGluZ3MgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYWNraW5nQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gdHJhY2tpbmdDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGlzYWJsZVRpcHMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2luZ0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmxhc3RVcGRhdGVLZXksICdjaGF0LnRpcHMuZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2luZ0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmxhc3RVcGRhdGVWYWx1ZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2luZ0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmxhc3RVcGRhdGVUYXJnZXQsIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlVGlwcyByZXNldHMgc3RhdGUgc28gcmUtZW5hYmxpbmcgd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHRpcDEgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAxKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGlzYWJsZVRpcHMoKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRpcHMuZW5hYmxlZCcsIHRydWUpO1xuXG5cdFx0Y29uc3QgdGlwMiA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcDIsICdTaG91bGQgcmV0dXJuIGEgdGlwIGFmdGVyIGRpc2FibGluZyBhbmQgcmUtZW5hYmxpbmcnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzbWlzc2VkIHRpcHMgc3RheSBkaXNtaXNzZWQgYWZ0ZXIgZGlzYWJsaW5nIGFuZCByZS1lbmFibGluZyB0aXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHQvLyBGbHVzaCBtaWNyb3Rhc2sgcXVldWUgc28gYXN5bmMgZmlsZS1jaGVjayBleGNsdXNpb25zIHJlc29sdmUgYmVmb3JlXG5cdFx0Ly8gd2Ugc3RhcnQgZGlzbWlzc2luZyB0aXBzIChvdGhlcndpc2UgZXhjbHVkZVVudGlsQ2hlY2tlZCB0aXBzIGFyZVxuXHRcdC8vIHRlbXBvcmFyaWx5IGV4Y2x1ZGVkIGFuZCBuZXZlciBnZXQgZGlzbWlzc2VkIGluIHRoZSBsb29wIGJlbG93KS5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRpZiAoIXRpcCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSksIHVuZGVmaW5lZCwgJ05vIHRpcCBzaG91bGQgcmVtYWluIG9uY2UgYWxsIHRpcHMgYXJlIGRpc21pc3NlZCcpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kaXNhYmxlVGlwcygpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LnRpcHMuZW5hYmxlZCcsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSksIHVuZGVmaW5lZCwgJ0Rpc21pc3NlZCB0aXBzIHNob3VsZCByZW1haW4gZGlzbWlzc2VkIGFmdGVyIHJlLWVuYWJsaW5nIHRpcHMnKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJEaXNtaXNzZWRUaXBzIHJlc3RvcmVzIHRpcCB2aXNpYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpLCB1bmRlZmluZWQsICdObyB0aXAgc2hvdWxkIHJlbWFpbiBvbmNlIGFsbCB0aXBzIGFyZSBkaXNtaXNzZWQnKTtcblxuXHRcdHNlcnZpY2UuY2xlYXJEaXNtaXNzZWRUaXBzKCk7XG5cblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKSwgJ0EgdGlwIHNob3VsZCBiZSB2aXNpYmxlIGFnYWluIGFmdGVyIGNsZWFyaW5nIGRpc21pc3NlZCB0aXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pZ3JhdGVzIGRpc21pc3NlZCB0aXBzIGZyb20gcHJvZmlsZSB0byBhcHBsaWNhdGlvbiBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LnRpcC5kaXNtaXNzZWQnLCBKU09OLnN0cmluZ2lmeShbJ3RpcC5zd2l0Y2hUb0F1dG8nXSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdncHQtNC4xJyk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5zd2l0Y2hUb0F1dG8nLCAnU2hvdWxkIGhvbm9yIHByb2ZpbGUtc3RvcmVkIGRpc21pc3NlZCB0aXAgaWQnKTtcblx0XHRhc3NlcnQub2soc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcC5kaXNtaXNzZWQnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pLCAnRXhwZWN0ZWQgZGlzbWlzc2VkIHRpcHMgdG8gbWlncmF0ZSB0byBhcHBsaWNhdGlvbiBzdG9yYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RpcC51bmRvQ2hhbmdlcyBkZXNjcmliZXMgd2hlcmUgdG8gZmluZCByZXN0b3JlIGNoZWNrcG9pbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cblx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCAndGlwLnVuZG9DaGFuZ2VzJyk7XG5cblx0XHRhc3NlcnQub2sodGlwKTtcblx0XHRhc3NlcnQub2sodGlwLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ0hvdmVyIGEgcHJldmlvdXMgcmVxdWVzdCcpKTtcblx0XHRhc3NlcnQub2sodGlwLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ1Jlc3RvcmUgQ2hlY2twb2ludCcpKTtcblx0fSk7XG5cblx0dGVzdCgndGlwLm1lcm1haWQgdXNlcyBzZW50ZW5jZSBwdW5jdHVhdGlvbiBpbiBkaXNwbGF5IHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cblx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCAndGlwLm1lcm1haWQnKTtcblxuXHRcdGFzc2VydC5vayh0aXApO1xuXHRcdGFzc2VydC5vayh0aXAuY29udGVudC52YWx1ZS5pbmNsdWRlcygnZmxvdyBjaGFydC4gSXQgY2FuIHJlbmRlciBNZXJtYWlkIGRpYWdyYW1zIGRpcmVjdGx5IGluIGNoYXQuJykpO1xuXHRcdGFzc2VydC5vayghdGlwLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ2Zsb3cgY2hhcnQ7IGl0IGNhbiByZW5kZXIgTWVybWFpZCBkaWFncmFtcyBkaXJlY3RseSBpbiBjaGF0LicpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKFxuXHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSA9IFtdLFxuXHRcdHByb21wdEluc3RydWN0aW9uczogSVByb21wdFBhdGhbXSA9IFtdLFxuXHRcdG9wdGlvbnM/OiB7IG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzPzogRXZlbnQ8dm9pZD47IGxpc3RQcm9tcHRGaWxlcz86IChfdHlwZTogUHJvbXB0c1R5cGUpID0+IFByb21pc2U8cmVhZG9ubHkgSVByb21wdFBhdGhbXT4gfSxcblx0KTogUGFydGlhbDxJUHJvbXB0c1NlcnZpY2U+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGlzdEFnZW50SW5zdHJ1Y3Rpb25zOiBhc3luYyAoKSA9PiBhZ2VudEluc3RydWN0aW9ucyxcblx0XHRcdGxpc3RQcm9tcHRGaWxlczogb3B0aW9ucz8ubGlzdFByb21wdEZpbGVzID8/IChhc3luYyAoX3R5cGU6IFByb21wdHNUeXBlKSA9PiBwcm9tcHRJbnN0cnVjdGlvbnMpLFxuXHRcdFx0b25EaWRDaGFuZ2VDdXN0b21BZ2VudHM6IG9wdGlvbnM/Lm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID8/IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKTogTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2Uge1xuXHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0fVxuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC51bmRvQ2hhbmdlcyB3aGVuIHJlc3RvcmUgY2hlY2twb2ludCBjb21tYW5kIGhhcyBiZWVuIGV4ZWN1dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAudW5kb0NoYW5nZXMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCddLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmV2ZW50LCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZXhjbHVkZWQgYmVmb3JlIGNvbW1hbmQgaXMgZXhlY3V0ZWQnKTtcblxuXHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCcsIGFyZ3M6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIGFmdGVyIGNvbW1hbmQgaXMgZXhlY3V0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgZXhlY3V0ZWQgY29tbWFuZCBleGNsdXNpb25zIGluIGFwcGxpY2F0aW9uIHN0b3JhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC51bmRvQ2hhbmdlcycsXG5cdFx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc3RvcmVDaGVja3BvaW50J10sXG5cdFx0fSk7XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogY29tbWFuZEV4ZWN1dGVkRW1pdHRlci5ldmVudCwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCcsIGFyZ3M6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pLCAnRXhwZWN0ZWQgZXhlY3V0ZWQgY29tbWFuZCBleGNsdXNpb25zIGluIGFwcGxpY2F0aW9uIHN0b3JhZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSwgdW5kZWZpbmVkLCAnRGlkIG5vdCBleHBlY3QgZXhlY3V0ZWQgY29tbWFuZCBleGNsdXNpb25zIGluIHByb2ZpbGUgc3RvcmFnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSksIHVuZGVmaW5lZCwgJ0RpZCBub3QgZXhwZWN0IGV4ZWN1dGVkIGNvbW1hbmQgZXhjbHVzaW9ucyBpbiB3b3Jrc3BhY2Ugc3RvcmFnZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaWdyYXRlcyBleGVjdXRlZCBjb21tYW5kIGV4Y2x1c2lvbnMgZnJvbSBwcm9maWxlIHRvIGFwcGxpY2F0aW9uIHN0b3JhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC51bmRvQ2hhbmdlcycsXG5cdFx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc3RvcmVDaGVja3BvaW50J10sXG5cdFx0fSk7XG5cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC50aXBzLmV4ZWN1dGVkQ29tbWFuZHMnLCBKU09OLnN0cmluZ2lmeShbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCddKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZXZlbnQsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgaG9ub3IgcHJvZmlsZS1zdG9yZWQgZXhjbHVzaW9ucycpO1xuXHRcdGFzc2VydC5vayhzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQudGlwcy5leGVjdXRlZENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSwgJ0V4cGVjdGVkIG1pZ3JhdGVkIGV4Y2x1c2lvbiBkYXRhIGluIGFwcGxpY2F0aW9uIHN0b3JhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwLmN1c3RvbUluc3RydWN0aW9ucyB3aGVuIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kIGV4aXN0cyBpbiB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5jdXN0b21JbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgYWdlbnRGaWxlVHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCwgZXhjbHVkZVVudGlsQ2hlY2tlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShbeyB1cmk6IHsgcGF0aDogJy8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJyB9LCByZWFsUGF0aDogdW5kZWZpbmVkLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY29waWxvdEluc3RydWN0aW9uc01kIH0gYXMgSUFnZW50SW5zdHJ1Y3Rpb25GaWxlXSkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgZmlsZSBjaGVjayB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgd2hlbiBjb3BpbG90LWluc3RydWN0aW9ucy5tZCBleGlzdHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZXhjbHVkZSB0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zIHdoZW4gb25seSBBR0VOVFMubWQgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4Y2x1ZGVXaGVuUHJvbXB0RmlsZXNFeGlzdDogeyBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGFnZW50RmlsZVR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jb3BpbG90SW5zdHJ1Y3Rpb25zTWQsIGV4Y2x1ZGVVbnRpbENoZWNrZWQ6IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoW3sgdXJpOiB7IHBhdGg6ICcvQUdFTlRTLm1kJyB9LCByZWFsUGF0aDogdW5kZWZpbmVkLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuYWdlbnRzTWQgfSBhcyBJQWdlbnRJbnN0cnVjdGlvbkZpbGVdKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBhc3luYyBmaWxlIGNoZWNrIHRvIGNvbXBsZXRlXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIHdoZW4gb25seSBBR0VOVFMubWQgZXhpc3RzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC5jdXN0b21JbnN0cnVjdGlvbnMgd2hlbiAuaW5zdHJ1Y3Rpb25zLm1kIGZpbGVzIGV4aXN0IGluIHdvcmtzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLmN1c3RvbUluc3RydWN0aW9ucycsXG5cdFx0XHRleGNsdWRlV2hlblByb21wdEZpbGVzRXhpc3Q6IHsgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBhZ2VudEZpbGVUeXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY29waWxvdEluc3RydWN0aW9uc01kLCBleGNsdWRlVW50aWxDaGVja2VkOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKFtdLCBbeyB1cmk6IFVSSS5maWxlKCcvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvY29kaW5nLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBhc3luYyBmaWxlIGNoZWNrIHRvIGNvbXBsZXRlXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCB3aGVuIC5pbnN0cnVjdGlvbnMubWQgZmlsZXMgZXhpc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZXhjbHVkZSB0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zIHdoZW4gbm8gaW5zdHJ1Y3Rpb24gZmlsZXMgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5jdXN0b21JbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgYWdlbnRGaWxlVHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCwgZXhjbHVkZVVudGlsQ2hlY2tlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGFzeW5jIGZpbGUgY2hlY2sgdG8gY29tcGxldGVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZXhjbHVkZWQgd2hlbiBubyBpbnN0cnVjdGlvbiBmaWxlcyBleGlzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyB0aXAuY3VzdG9tSW5zdHJ1Y3Rpb25zIHdoZW4gZ2VuZXJhdGUgaW5zdHJ1Y3Rpb25zIGNvbW1hbmQgaGFzIGJlZW4gZXhlY3V0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5jdXN0b21JbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSURdLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmV2ZW50LCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZXhjbHVkZWQgYmVmb3JlIGNvbW1hbmQgaXMgZXhlY3V0ZWQnKTtcblxuXHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsIGFyZ3M6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIGFmdGVyIGdlbmVyYXRlIGluc3RydWN0aW9ucyBjb21tYW5kIGlzIGV4ZWN1dGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRpcC5hZ2VudE1vZGUgd2hlbiBhZ2VudCBtb2RlIGhhcyBiZWVuIHVzZWQgaW4gd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuYWdlbnRNb2RlJyxcblx0XHRcdGV4Y2x1ZGVXaGVuTW9kZXNVc2VkOiBbQ2hhdE1vZGVLaW5kLkFnZW50XSxcblx0XHR9KTtcblxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZXhjbHVkZWQgYmVmb3JlIG1vZGUgaXMgcmVjb3JkZWQnKTtcblxuXHRcdHRyYWNrZXIucmVjb3JkQ3VycmVudE1vZGUoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIGFmdGVyIGFnZW50IG1vZGUgaGFzIGJlZW4gcmVjb3JkZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwLnBsYW5Nb2RlIHdoZW4gUGxhbiBtb2RlIGhhcyBiZWVuIHVzZWQgaW4gd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAucGxhbk1vZGUnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Nb2Rlc1VzZWQ6IFsnUGxhbiddLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ1BsYW4nKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIGJlZm9yZSBtb2RlIGlzIHJlY29yZGVkJyk7XG5cblx0XHR0cmFja2VyLnJlY29yZEN1cnJlbnRNb2RlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCBhZnRlciBQbGFuIG1vZGUgaGFzIGJlZW4gcmVjb3JkZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwLnBsYW5Nb2RlIHdoZW4gb3BlbiBwbGFuIGNvbW1hbmQgaGFzIGJlZW4gZXhlY3V0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5wbGFuTW9kZScsXG5cdFx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5QbGFuJ10sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZXZlbnQsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCBiZWZvcmUgY29tbWFuZCBpcyBleGVjdXRlZCcpO1xuXG5cdFx0Y29tbWFuZEV4ZWN1dGVkRW1pdHRlci5maXJlKHsgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5QbGFuJywgYXJnczogW10gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgYWZ0ZXIgb3BlbiBwbGFuIGNvbW1hbmQgaXMgZXhlY3V0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgY29tbWFuZCBleGNsdXNpb25zIHRvIHdvcmtzcGFjZSBzdG9yYWdlIGFjcm9zcyB0cmFja2VyIGluc3RhbmNlcycsICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLnVuZG9DaGFuZ2VzJyxcblx0XHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogWyd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIxID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZXZlbnQsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUoeyBjb21tYW5kSWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnLCBhcmdzOiBbXSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlcjEuaXNFeGNsdWRlZCh0aXApLCB0cnVlKTtcblxuXHRcdC8vIFNlY29uZCB0cmFja2VyIHJlYWRzIGZyb20gc3RvcmFnZSBcdTIwMTQgc2hvdWxkIGJlIGV4Y2x1ZGVkIGltbWVkaWF0ZWx5XG5cdFx0Y29uc3QgdHJhY2tlcjIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyMi5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdOZXcgdHJhY2tlciBzaG91bGQgcmVhZCBwZXJzaXN0ZWQgZXhjbHVzaW9uIGZyb20gd29ya3NwYWNlIHN0b3JhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgbW9kZSBleGNsdXNpb25zIHRvIHdvcmtzcGFjZSBzdG9yYWdlIGFjcm9zcyB0cmFja2VyIGluc3RhbmNlcycsICgpID0+IHtcblx0XHRjb25zdCB0aXAgPSBjcmVhdGVNb2NrVGlwKHtcblx0XHRcdGlkOiAndGlwLmFnZW50TW9kZScsXG5cdFx0XHRleGNsdWRlV2hlbk1vZGVzVXNlZDogW0NoYXRNb2RlS2luZC5BZ2VudF0sXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnQWdlbnQnKTtcblxuXHRcdGNvbnN0IHRyYWNrZXIxID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHR0cmFja2VyMS5yZWNvcmRDdXJyZW50TW9kZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIxLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSk7XG5cblx0XHQvLyBTZWNvbmQgdHJhY2tlciByZWFkcyBmcm9tIHN0b3JhZ2UgXHUyMDE0IHNob3VsZCBiZSBleGNsdWRlZCBpbW1lZGlhdGVseVxuXHRcdGNvbnN0IHRyYWNrZXIyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlcjIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnTmV3IHRyYWNrZXIgc2hvdWxkIHJlYWQgcGVyc2lzdGVkIG1vZGUgZXhjbHVzaW9uIGZyb20gd29ya3NwYWNlIHN0b3JhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgncHJpb3JpdGl6ZXMgZm91bmRhdGlvbmFsIHRpcHMgb3ZlciBRb0wgdGlwcyB3aGVuIGJvdGggYXJlIGVsaWdpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpcC5pZCwgJ3RpcC5wbGFuTW9kZScsICdFeHBlY3RlZCBmb3VuZGF0aW9uYWwgdGlwIHRvIGJlIHByaW9yaXRpemVkIGJlZm9yZSBlbGlnaWJsZSBRb0wgdGlwcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmlvcml0aXplcyBwcmVmZXJyZWQgb25ib2FyZGluZyB0aXBzIGluIHJlcXVlc3RlZCBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdBZ2VudCcpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQua2V5LCAnYXV0bycpO1xuXG5cdFx0Y29uc3Qgc2Vlbjogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuXHRcdFx0Y29uc3QgdGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5vayh0aXApO1xuXHRcdFx0c2Vlbi5wdXNoKHRpcC5pZCk7XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlZW4sIFsndGlwLnBsYW5Nb2RlJywgJ3RpcC5jcmVhdGVBZ2VudCcsICd0aXAuY3JlYXRlU2tpbGwnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbWl6ZXMgUW9MIHRpcHMgd2hlbiBubyBmb3VuZGF0aW9uYWwgdGlwcyBhcmUgZWxpZ2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlS2luZEtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRjb25zdCBtb2RlTmFtZUtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxzdHJpbmc+KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUua2V5LCAnUGxhbicpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgJ2Nsb3VkJyk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdhdXRvJyk7XG5cblx0XHRjb25zdCBvcmlnaW5hbFJhbmRvbSA9IE1hdGgucmFuZG9tO1xuXHRcdHRyeSB7XG5cdFx0XHRNYXRoLnJhbmRvbSA9ICgpID0+IDA7XG5cdFx0XHRjb25zdCBmaXJzdFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdHNlcnZpY2UucmVzZXRTZXNzaW9uKCk7XG5cblx0XHRcdE1hdGgucmFuZG9tID0gKCkgPT4gMC45OTk5O1xuXHRcdFx0Y29uc3Qgc2Vjb25kVGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0VGlwKTtcblx0XHRcdGFzc2VydC5vayhzZWNvbmRUaXApO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZpcnN0VGlwLmlkLCBzZWNvbmRUaXAuaWQsICdFeHBlY3RlZCBkaWZmZXJlbnQgUW9MIHRpcHMgZm9yIGRpZmZlcmVudCByYW5kb20gdmFsdWVzJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZmlyc3RUaXAuaWQsICd0aXAucGxhbk1vZGUnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzZWNvbmRUaXAuaWQsICd0aXAucGxhbk1vZGUnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0TWF0aC5yYW5kb20gPSBvcmlnaW5hbFJhbmRvbTtcblx0XHRcdG1vZGVLaW5kS2V5LnNldChDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdFx0bW9kZU5hbWVLZXkuc2V0KCdQbGFuJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXNldFNlc3Npb24gcmVldmFsdWF0ZXMgZm91bmRhdGlvbmFsIHRpcHMgZm9yIHRoZSBuZXh0IGNoYXQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVLaW5kS2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGNvbnN0IG1vZGVOYW1lS2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PHN0cmluZz4oQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5rZXksICdQbGFuJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVLZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8c3RyaW5nPihDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgJ2Nsb3VkJyk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5rZXksICdhdXRvJyk7XG5cblx0XHRjb25zdCBvcmlnaW5hbFJhbmRvbSA9IE1hdGgucmFuZG9tO1xuXHRcdHRyeSB7XG5cdFx0XHRNYXRoLnJhbmRvbSA9ICgpID0+IDAuOTk5OTtcblx0XHRcdGNvbnN0IHFvbFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQub2socW9sVGlwKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChxb2xUaXAuaWQsICd0aXAucGxhbk1vZGUnKTtcblxuXHRcdFx0c2VydmljZS5yZXNldFNlc3Npb24oKTtcblx0XHRcdG1vZGVOYW1lS2V5LnNldCgnQWdlbnQnKTtcblx0XHRcdHNlc3Npb25UeXBlS2V5LnNldChsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cblx0XHRcdGNvbnN0IGZvdW5kYXRpb25hbFRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRhc3NlcnQub2soZm91bmRhdGlvbmFsVGlwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZGF0aW9uYWxUaXAuaWQsICd0aXAuY3JlYXRlQWdlbnQnLCAnRXhwZWN0ZWQgZm91bmRhdGlvbmFsIG9yZGVyaW5nIHRvIHJlc3RhcnQgb24gbmV3IGNoYXQgc2Vzc2lvbicpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRNYXRoLnJhbmRvbSA9IG9yaWdpbmFsUmFuZG9tO1xuXHRcdFx0bW9kZUtpbmRLZXkuc2V0KENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXNldFNlc3Npb24gYWxsb3dzIGEgbmV3IHdlbGNvbWUgdGlwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCB0aXAxID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodGlwMSwgJ1Nob3VsZCBnZXQgYSB3ZWxjb21lIHRpcCcpO1xuXG5cdFx0c2VydmljZS5yZXNldFNlc3Npb24oKTtcblxuXHRcdGNvbnN0IHRpcDIgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXAyLCAnU2hvdWxkIGdldCBhIHdlbGNvbWUgdGlwIGFmdGVyIHJlc2V0U2Vzc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdQbGFuIHRpcCBpcyBleGNsdWRlZCBhZnRlciBzd2l0Y2hpbmcgdG8gUGxhbiBtb2RlIGR1cmluZyBzdGFibGUgcmVyZW5kZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHQvLyBTdGFydCBpbiBBZ2VudCBtb2RlIFx1MjAxNCBQbGFuIHRpcCBzaG91bGQgYmUgZWxpZ2libGVcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0Y29uc3QgbW9kZU5hbWVLZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8c3RyaW5nPihDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmtleSwgJ0FnZW50Jyk7XG5cblx0XHRhc3NlcnQub2soZmluZFRpcEJ5SWQoc2VydmljZSwgJ3RpcC5wbGFuTW9kZScpLCAnUGxhbiB0aXAgc2hvdWxkIGJlIHNob3duIHdoZW4gaW4gQWdlbnQgbW9kZScpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdXNlciBzd2l0Y2hpbmcgdG8gUGxhbiBtb2RlIChjb250ZXh0IGtleXMgdXBkYXRlLCB3aWRnZXQgcmVyZW5kZXJzKVxuXHRcdG1vZGVOYW1lS2V5LnNldCgnUGxhbicpO1xuXG5cdFx0Ly8gU3RhYmxlIHJlcmVuZGVyIFx1MjAxNCBnZXRXZWxjb21lVGlwIGlzIGNhbGxlZCBhZ2FpbiB3aXRob3V0IHJlc2V0U2Vzc2lvblxuXHRcdGNvbnN0IHJlcmVuZGVyVGlwID0gc2VydmljZS5nZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2soIXJlcmVuZGVyVGlwIHx8IHJlcmVuZGVyVGlwLmlkICE9PSAndGlwLnBsYW5Nb2RlJywgJ1BsYW4gdGlwIHNob3VsZCBub3QgYmUgc2hvd24gYWZ0ZXIgc3dpdGNoaW5nIHRvIFBsYW4gbW9kZScpO1xuXG5cdFx0Ly8gTmV3IHNlc3Npb24gaW4gQWdlbnQgbW9kZSBcdTIwMTQgUGxhbiB0aXAgbXVzdCBOT1QgcmVhcHBlYXJcblx0XHRzZXJ2aWNlLnJlc2V0U2Vzc2lvbigpO1xuXHRcdG1vZGVOYW1lS2V5LnNldCgnQWdlbnQnKTtcblxuXHRcdGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZSwgJ3RpcC5wbGFuTW9kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyB0aXAgd2hlbiB0cmFja2VkIHRvb2wgaGFzIGJlZW4gaW52b2tlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gY3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpO1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAubWVybWFpZCcsXG5cdFx0XHRleGNsdWRlV2hlblRvb2xzSW52b2tlZDogWydyZW5kZXJNZXJtYWlkRGlhZ3JhbSddLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZSgpIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdG1vY2tUb29sc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIGJlZm9yZSB0b29sIGlzIGludm9rZWQnKTtcblxuXHRcdG1vY2tUb29sc1NlcnZpY2UuZmlyZU9uRGlkSW52b2tlVG9vbCh7IHRvb2xJZDogJ3JlbmRlck1lcm1haWREaWFncmFtJywgc2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQsIHJlcXVlc3RJZDogdW5kZWZpbmVkLCBzdWJhZ2VudEludm9jYXRpb25JZDogdW5kZWZpbmVkIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnU2hvdWxkIGJlIGV4Y2x1ZGVkIGFmdGVyIHRvb2wgaXMgaW52b2tlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyB0b29sIGV4Y2x1c2lvbnMgdG8gd29ya3NwYWNlIHN0b3JhZ2UgYWNyb3NzIHRyYWNrZXIgaW5zdGFuY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSBjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5zdWJhZ2VudHMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Ub29sc0ludm9rZWQ6IFsncnVuU3ViYWdlbnQnXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIxID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bW9ja1Rvb2xzU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0bW9ja1Rvb2xzU2VydmljZS5maXJlT25EaWRJbnZva2VUb29sKHsgdG9vbElkOiAncnVuU3ViYWdlbnQnLCBzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCwgcmVxdWVzdElkOiB1bmRlZmluZWQsIHN1YmFnZW50SW52b2NhdGlvbklkOiB1bmRlZmluZWQgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIxLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSk7XG5cblx0XHQvLyBTZWNvbmQgdHJhY2tlciByZWFkcyBmcm9tIHN0b3JhZ2UgXHUyMDE0IHNob3VsZCBiZSBleGNsdWRlZCBpbW1lZGlhdGVseVxuXHRcdGNvbnN0IHRyYWNrZXIyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKCkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlcjIuaXNFeGNsdWRlZCh0aXApLCB0cnVlLCAnTmV3IHRyYWNrZXIgc2hvdWxkIHJlYWQgcGVyc2lzdGVkIHRvb2wgZXhjbHVzaW9uIGZyb20gd29ya3NwYWNlIHN0b3JhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGlwLnNraWxsIHdoZW4gc2tpbGwgZmlsZXMgZXhpc3QgaW4gd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRpcCA9IGNyZWF0ZU1vY2tUaXAoe1xuXHRcdFx0aWQ6ICd0aXAuc2tpbGwnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGlwRWxpZ2liaWxpdHlUcmFja2VyKFxuXHRcdFx0W3RpcF0sXG5cdFx0XHR7IG9uRGlkRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUsIG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lIH0gYXMgUGFydGlhbDxJQ29tbWFuZFNlcnZpY2U+IGFzIElDb21tYW5kU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb21wdHNTZXJ2aWNlKFtdLCBbeyB1cmk6IFVSSS5maWxlKCcvLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwuc2tpbGwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH1dKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBhc3luYyBmaWxlIGNoZWNrIHRvIGNvbXBsZXRlXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCB3aGVuIHNraWxsIGZpbGVzIGV4aXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGV4Y2x1ZGUgdGlwLnNraWxsIHdoZW4gbm8gc2tpbGwgZmlsZXMgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5za2lsbCcsXG5cdFx0XHRleGNsdWRlV2hlblByb21wdEZpbGVzRXhpc3Q6IHsgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoKSBhcyBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrVG9vbHNTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBhc3luYyBmaWxlIGNoZWNrIHRvIGNvbXBsZXRlXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIHdoZW4gbm8gc2tpbGwgZmlsZXMgZXhpc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgYWxsIGNyZWF0ZSBzbGFzaCBjb21tYW5kIHRpcHMgaW4gbG9jYWwgY2hhdCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRDcmVhdGVUaXBzID0gbmV3IFNldChbJ3RpcC5pbml0JywgJ3RpcC5jcmVhdGVQcm9tcHQnLCAndGlwLmNyZWF0ZUFnZW50JywgJ3RpcC5jcmVhdGVTa2lsbCddKTtcblx0XHRjb25zdCBzZWVuQ3JlYXRlVGlwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRpZiAoIXRpcCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChleHBlY3RlZENyZWF0ZVRpcHMuaGFzKHRpcC5pZCkpIHtcblx0XHRcdFx0c2VlbkNyZWF0ZVRpcHMuYWRkKHRpcC5pZCk7XG5cdFx0XHRcdGlmIChzZWVuQ3JlYXRlVGlwcy5zaXplID09PSBleHBlY3RlZENyZWF0ZVRpcHMuc2l6ZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zZWVuQ3JlYXRlVGlwc10uc29ydCgpLCBbLi4uZXhwZWN0ZWRDcmVhdGVUaXBzXS5zb3J0KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzaG93IGNyZWF0ZSBzbGFzaCBjb21tYW5kIHRpcHMgaW4gbm9uLWxvY2FsIGNoYXQgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5rZXksICdjbG91ZCcpO1xuXHRcdGNvbnN0IGNyZWF0ZVRpcElkcyA9IG5ldyBTZXQoWyd0aXAuaW5pdCcsICd0aXAuY3JlYXRlUHJvbXB0JywgJ3RpcC5jcmVhdGVBZ2VudCcsICd0aXAuY3JlYXRlU2tpbGwnXSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQub2soIWNyZWF0ZVRpcElkcy5oYXModGlwLmlkKSwgJ1Nob3VsZCBub3Qgc2hvdyBjcmVhdGUgc2xhc2ggY29tbWFuZCB0aXBzIGluIG5vbi1sb2NhbCBzZXNzaW9ucycpO1xuXHRcdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzaG93IGNyZWF0ZSBwcm9tcHQgdGlwIHdoZW4gY3JlYXRlIHByb21wdCB3YXMgYWxyZWFkeSB1c2VkJywgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LnRpcHMuZXhlY3V0ZWRDb21tYW5kcycsIEpTT04uc3RyaW5naWZ5KFtDUkVBVEVfUFJPTVBUX1RSQUNLSU5HX0NPTU1BTkRdKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwLmlkLCAndGlwLmNyZWF0ZVByb21wdCcsICdTaG91bGQgbm90IHNob3cgdGlwLmNyZWF0ZVByb21wdCB3aGVuIGNyZWF0ZS1wcm9tcHQgd2FzIHVzZWQnKTtcblx0XHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXHRcdH1cblx0fSk7XG5cblxuXHRmdW5jdGlvbiBmaW5kVGlwQnlJZChzZXJ2aWNlOiBDaGF0VGlwU2VydmljZSwgdGlwSWQ6IHN0cmluZywgY2tTZXJ2aWNlOiBNb2NrQ29udGV4dEtleVNlcnZpY2VXaXRoUnVsZXNNYXRjaGluZyA9IGNvbnRleHRLZXlTZXJ2aWNlKTogSUNoYXRUaXAgfCB1bmRlZmluZWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChja1NlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICh0aXAuaWQgPT09IHRpcElkKSB7XG5cdFx0XHRcdHJldHVybiB0aXA7XG5cdFx0XHR9XG5cdFx0XHRzZXJ2aWNlLmRpc21pc3NUaXAoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZTogQ2hhdFRpcFNlcnZpY2UsIHRpcElkOiBzdHJpbmcsIGNrU2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlV2l0aFJ1bGVzTWF0Y2hpbmcgPSBjb250ZXh0S2V5U2VydmljZSk6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcblx0XHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChja1NlcnZpY2UpO1xuXHRcdFx0aWYgKCF0aXApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGlwLmlkLCB0aXBJZCwgYCR7dGlwSWR9IHNob3VsZCBub3QgYmUgc2hvd25gKTtcblx0XHRcdHNlcnZpY2UuZGlzbWlzc1RpcCgpO1xuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3QgeyB0aXBJZCwgc2V0dGluZ0tleSB9IG9mIFtcblx0XHR7IHRpcElkOiAndGlwLnRoaW5raW5nUGhyYXNlcycsIHNldHRpbmdLZXk6ICdjaGF0LmFnZW50LnRoaW5raW5nLnBocmFzZXMnIH0sXG5cdF0pIHtcblx0XHR0ZXN0KGBzaG93cyAke3RpcElkfSB3aXRoIGNvcnJlY3Qgc2V0dGluZyBsaW5rIHdoZW4gc2V0dGluZyBpcyBhdCBkZWZhdWx0YCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gcXVldWVNaWNyb3Rhc2socikpO1xuXG5cdFx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCB0aXBJZCk7XG5cdFx0XHRhc3NlcnQub2sodGlwLCBgU2hvdWxkIHNob3cgJHt0aXBJZH0gd2hlbiBzZXR0aW5nIGlzIGF0IGRlZmF1bHRgKTtcblx0XHRcdGFzc2VydC5vayh0aXAuY29udGVudC52YWx1ZS5pbmNsdWRlcyhzZXR0aW5nS2V5KSwgYFRpcCBzaG91bGQgcmVmZXJlbmNlICR7c2V0dGluZ0tleX1gKTtcblx0XHRcdGFzc2VydC5vayh0aXAuZW5hYmxlZENvbW1hbmRzPy5pbmNsdWRlcygnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnKSwgJ1RpcCBzaG91bGQgZW5hYmxlIHRoZSBvcGVuU2V0dGluZ3MgY29tbWFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdChgZXhjbHVkZXMgJHt0aXBJZH0gd2hlbiBzZXR0aW5nIGhhcyBiZWVuIGNoYW5nZWQgZnJvbSBkZWZhdWx0YCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oc2V0dGluZ0tleSwgJ2NoYW5nZWQnKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5rZXksIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblxuXHRcdFx0YXNzZXJ0VGlwTmV2ZXJTaG93bihzZXJ2aWNlLCB0aXBJZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmb3IgKGNvbnN0IHRpcElkIG9mIFtcblx0XHQndGlwLnRoaW5raW5nUGhyYXNlcycsXG5cdF0pIHtcblx0XHR0ZXN0KGBkaXNtaXNzZXMgJHt0aXBJZH0gYWZ0ZXIgY2xpY2tpbmcgaXRzIHNldHRpbmdzIGxpbmtgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cblx0XHRcdGNvbnN0IHRpcCA9IGZpbmRUaXBCeUlkKHNlcnZpY2UsIHRpcElkKTtcblx0XHRcdGFzc2VydC5vayh0aXAsIGBTaG91bGQgc2hvdyAke3RpcElkfSBiZWZvcmUgY29tbWFuZCBjbGlja2ApO1xuXG5cdFx0XHRsZXQgZGlzbWlzc2VkID0gZmFsc2U7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWREaXNtaXNzVGlwKCgpID0+IHtcblx0XHRcdFx0ZGlzbWlzc2VkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29tbWFuZEV4ZWN1dGVkRW1pdHRlci5maXJlKHsgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCBhcmdzOiBbXSB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc21pc3NlZCwgdHJ1ZSwgYCR7dGlwSWR9IHNob3VsZCBkaXNtaXNzIHdoZW4gaXRzIHNldHRpbmdzIGNvbW1hbmQgaXMgY2xpY2tlZGApO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk/LmlkLCB0aXBJZCwgYCR7dGlwSWR9IHNob3VsZCBub3QgYmUgc2hvd24gYWdhaW4gYWZ0ZXIgYWN0aW9uaW5nIGl0cyBjb21tYW5kIGxpbmtgKTtcblxuXHRcdFx0Y29uc3QgbmV4dFNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRhc3NlcnRUaXBOZXZlclNob3duKG5leHRTZXJ2aWNlLCB0aXBJZCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdkaXNtaXNzZXMgY3JlYXRlUHJvbXB0IHRpcCBhZnRlciBjbGlja2luZyBpdHMgY29tbWFuZCBsaW5rJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUua2V5LCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cblx0XHRjb25zdCB0aXAgPSBmaW5kVGlwQnlJZChzZXJ2aWNlLCAndGlwLmNyZWF0ZVByb21wdCcpO1xuXHRcdGFzc2VydC5vayh0aXAsICdTaG91bGQgc2hvdyB0aXAuY3JlYXRlUHJvbXB0IGJlZm9yZSBjb21tYW5kIGNsaWNrJyk7XG5cdFx0YXNzZXJ0Lm9rKHRpcC5lbmFibGVkQ29tbWFuZHM/LmluY2x1ZGVzKEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lEKSwgJ1RpcCBzaG91bGQgZW5hYmxlIHRoZSBjcmVhdGUgcHJvbXB0IGNvbW1hbmQnKTtcblxuXHRcdGNvbW1hbmRFeGVjdXRlZEVtaXR0ZXIuZmlyZSh7IGNvbW1hbmRJZDogR0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsIGFyZ3M6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk/LmlkLCAndGlwLmNyZWF0ZVByb21wdCcsICd0aXAuY3JlYXRlUHJvbXB0IHNob3VsZCBub3QgYmUgc2hvd24gYWdhaW4gYWZ0ZXIgYWN0aW9uaW5nIGl0cyBjb21tYW5kIGxpbmsnKTtcblxuXHRcdGNvbnN0IG5leHRTZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGFzc2VydFRpcE5ldmVyU2hvd24obmV4dFNlcnZpY2UsICd0aXAuY3JlYXRlUHJvbXB0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgdGVsZW1ldHJ5IHdoZW4gdGlwIGlzIHNob3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdID0gW107XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0Li4uTnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikge1xuXHRcdFx0XHRldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyBQYXJ0aWFsPElUZWxlbWV0cnlTZXJ2aWNlPiBhcyBJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cblx0XHRjb25zdCBzaG93bkV2ZW50cyA9IGV2ZW50cy5maWx0ZXIoZSA9PiBlLmRhdGEuYWN0aW9uID09PSAnc2hvd24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvd25FdmVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGxvZyBleGFjdGx5IG9uZSBzaG93biBldmVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG93bkV2ZW50c1swXS5ldmVudE5hbWUsICdjaGF0VGlwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3duRXZlbnRzWzBdLmRhdGEudGlwSWQsIHRpcC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgdGVsZW1ldHJ5IHdoZW4gdGlwIGlzIGRpc21pc3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdC4uLk51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0c2VydmljZS5kaXNtaXNzVGlwKCk7XG5cblx0XHRjb25zdCBkaXNtaXNzRXZlbnRzID0gZXZlbnRzLmZpbHRlcihlID0+IGUuZGF0YS5hY3Rpb24gPT09ICdkaXNtaXNzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzbWlzc0V2ZW50cy5sZW5ndGgsIDEsICdTaG91bGQgbG9nIGV4YWN0bHkgb25lIGRpc21pc3NlZCBldmVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNtaXNzRXZlbnRzWzBdLmRhdGEudGlwSWQsIHRpcC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgdGVsZW1ldHJ5IHdoZW4gbmF2aWdhdGluZyB0aXBzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdID0gW107XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0Li4uTnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikge1xuXHRcdFx0XHRldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyBQYXJ0aWFsPElUZWxlbWV0cnlTZXJ2aWNlPiBhcyBJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cblx0XHRjb25zdCBuZXh0VGlwID0gc2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHRcdGFzc2VydC5vayhuZXh0VGlwKTtcblxuXHRcdGNvbnN0IG5hdmlnYXRlRXZlbnRzID0gZXZlbnRzLmZpbHRlcihlID0+IGUuZGF0YS5hY3Rpb24gPT09ICduYXZpZ2F0ZU5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdGVFdmVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGxvZyBvbmUgbmF2aWdhdGVOZXh0IGV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRlRXZlbnRzWzBdLmRhdGEudGlwSWQsIHRpcC5pZCwgJ25hdmlnYXRlTmV4dCBzaG91bGQgbG9nIHRoZSB0aXAgYmVpbmcgbmF2aWdhdGVkIGF3YXkgZnJvbScpO1xuXG5cdFx0Y29uc3Qgc2hvd25FdmVudHMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS5kYXRhLmFjdGlvbiA9PT0gJ3Nob3duJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3duRXZlbnRzLmxlbmd0aCwgMiwgJ1Nob3VsZCBsb2cgc2hvd24gZm9yIGluaXRpYWwgYW5kIG5hdmlnYXRlZCB0aXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvd25FdmVudHNbMV0uZGF0YS50aXBJZCwgbmV4dFRpcC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgdGVsZW1ldHJ5IHdoZW4gdGlwIGNvbW1hbmQgaXMgY2xpY2tlZCcsICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdC4uLk51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0aWYgKHRpcC5lbmFibGVkQ29tbWFuZHM/Lmxlbmd0aCkge1xuXHRcdFx0Y29tbWFuZEV4ZWN1dGVkRW1pdHRlci5maXJlKHsgY29tbWFuZElkOiB0aXAuZW5hYmxlZENvbW1hbmRzWzBdLCBhcmdzOiBbXSB9KTtcblxuXHRcdFx0Y29uc3QgY2xpY2tFdmVudHMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS5kYXRhLmFjdGlvbiA9PT0gJ2NvbW1hbmRDbGlja2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpY2tFdmVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGxvZyBvbmUgY29tbWFuZENsaWNrZWQgZXZlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGlja0V2ZW50c1swXS5kYXRhLnRpcElkLCB0aXAuaWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWNrRXZlbnRzWzBdLmRhdGEuY29tbWFuZElkLCB0aXAuZW5hYmxlZENvbW1hbmRzWzBdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1RpcCBoYXMgbm8gZW5hYmxlZCBjb21tYW5kczsgY2Fubm90IHRlc3QgY29tbWFuZCBjbGljayB0ZWxlbWV0cnknKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgdGVsZW1ldHJ5IHdoZW4gdGlwIGlzIGhpZGRlbicsICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdC4uLk51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJVGVsZW1ldHJ5U2VydmljZT4gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0c2VydmljZS5oaWRlVGlwKCk7XG5cblx0XHRjb25zdCBoaWRkZW5FdmVudHMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS5kYXRhLmFjdGlvbiA9PT0gJ2hpZGRlbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaWRkZW5FdmVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGxvZyBvbmUgaGlkZGVuIGV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGRlbkV2ZW50c1swXS5kYXRhLnRpcElkLCB0aXAuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIHRpcHMgYXJlIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdID0gW107XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0Li4uTnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRwdWJsaWNMb2cyKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikge1xuXHRcdFx0XHRldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyBQYXJ0aWFsPElUZWxlbWV0cnlTZXJ2aWNlPiBhcyBJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHRpcCA9IHNlcnZpY2UuZ2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHRpcCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRpc2FibGVUaXBzKCk7XG5cblx0XHRjb25zdCBkaXNhYmxlZEV2ZW50cyA9IGV2ZW50cy5maWx0ZXIoZSA9PiBlLmRhdGEuYWN0aW9uID09PSAnZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzYWJsZWRFdmVudHMubGVuZ3RoLCAxLCAnU2hvdWxkIGxvZyBvbmUgZGlzYWJsZWQgZXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzYWJsZWRFdmVudHNbMF0uZGF0YS50aXBJZCwgdGlwLmlkKTtcblx0fSk7XG5cblx0dGVzdCgndGhpbmtpbmcgcGhyYXNlcyBldmVyLW1vZGlmaWVkIHNlZWQgY2hlY2tzIHdvcmtzcGFjZVZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxJbnNwZWN0ID0gd29ya3NwYWNlQ29uZmlnU2VydmljZS5pbnNwZWN0LmJpbmQod29ya3NwYWNlQ29uZmlnU2VydmljZSk7XG5cdFx0d29ya3NwYWNlQ29uZmlnU2VydmljZS5pbnNwZWN0ID0gPFQ+KGtleTogc3RyaW5nLCBvdmVycmlkZXM/OiBhbnkpID0+IHtcblx0XHRcdGlmIChrZXkgPT09ICdjaGF0LmFnZW50LnRoaW5raW5nLnBocmFzZXMnKSB7XG5cdFx0XHRcdHJldHVybiB7IC4uLm9yaWdpbmFsSW5zcGVjdChrZXksIG92ZXJyaWRlcyksIHVzZXJWYWx1ZTogdW5kZWZpbmVkLCB1c2VyTG9jYWxWYWx1ZTogdW5kZWZpbmVkLCB3b3Jrc3BhY2VWYWx1ZTogJ2NvbXBhY3QnIH0gYXMgdW5rbm93biBhcyBUO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG9yaWdpbmFsSW5zcGVjdChrZXksIG92ZXJyaWRlcyk7XG5cdFx0fTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IHdvcmtzcGFjZUNvbmZpZ1NlcnZpY2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQua2V5LCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXG5cdFx0YXNzZXJ0VGlwTmV2ZXJTaG93bihzZXJ2aWNlLCAndGlwLnRoaW5raW5nUGhyYXNlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzaG93IHRpcC50aGlua2luZ1BocmFzZXMgd2hlbiBwcmV2aW91cyBtb2RpZmljYXRpb24gaXMgcGVyc2lzdGVkJywgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0LnRpcC50aGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQnLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmtleSwgQ2hhdE1vZGVLaW5kLkFnZW50KTtcblxuXHRcdGFzc2VydFRpcE5ldmVyU2hvd24oc2VydmljZSwgJ3RpcC50aGlua2luZ1BocmFzZXMnKTtcblx0fSk7XG5cblx0dGVzdCgncmUtY2hlY2tzIGFnZW50IGZpbGUgZXhjbHVzaW9uIHdoZW4gb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgZmlyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRDaGFuZ2VFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRsZXQgYWdlbnRGaWxlczogSVByb21wdFBhdGhbXSA9IFtdO1xuXG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5jdXN0b21BZ2VudCcsXG5cdFx0XHRleGNsdWRlV2hlblByb21wdEZpbGVzRXhpc3Q6IHsgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIGV4Y2x1ZGVVbnRpbENoZWNrZWQ6IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUaXBFbGlnaWJpbGl0eVRyYWNrZXIoXG5cdFx0XHRbdGlwXSxcblx0XHRcdHsgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSwgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50Lk5vbmUgfSBhcyBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gYXMgSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoW10sIFtdLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBhZ2VudENoYW5nZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdGxpc3RQcm9tcHRGaWxlczogYXN5bmMgKCkgPT4gYWdlbnRGaWxlcyxcblx0XHRcdH0pIGFzIElQcm9tcHRzU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tUb29sc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gSW5pdGlhbCBjaGVjazogbm8gYWdlbnQgZmlsZXMsIGJ1dCBleGNsdWRlVW50aWxDaGVja2VkIG1lYW5zIGV4Y2x1ZGVkIGZpcnN0XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBleGNsdWRlZCBhZnRlciBpbml0aWFsIGNoZWNrIGZpbmRzIG5vIGZpbGVzJyk7XG5cblx0XHQvLyBTaW11bGF0ZSBhZ2VudCBmaWxlcyBhcHBlYXJpbmdcblx0XHRhZ2VudEZpbGVzID0gW3sgdXJpOiBVUkkuZmlsZSgnLy5naXRodWIvYWdlbnRzL215LWFnZW50LmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCB9XTtcblx0XHRhZ2VudENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc0V4Y2x1ZGVkKHRpcCksIHRydWUsICdTaG91bGQgYmUgZXhjbHVkZWQgYWZ0ZXIgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgZmlyZXMgYW5kIGFnZW50IGZpbGVzIGV4aXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hQcm9tcHRGaWxlRXhjbHVzaW9ucyByZS1jaGVja3MgaW5zdHJ1Y3Rpb24gZmlsZXMgYWZ0ZXIgc3RhcnR1cCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgaW5zdHJ1Y3Rpb25GaWxlczogSVByb21wdFBhdGhbXSA9IFtdO1xuXG5cdFx0Y29uc3QgdGlwID0gY3JlYXRlTW9ja1RpcCh7XG5cdFx0XHRpZDogJ3RpcC5jdXN0b21JbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZXhjbHVkZVdoZW5Qcm9tcHRGaWxlc0V4aXN0OiB7IHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgYWdlbnRGaWxlVHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCwgZXhjbHVkZVVudGlsQ2hlY2tlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRpcEVsaWdpYmlsaXR5VHJhY2tlcihcblx0XHRcdFt0aXBdLFxuXHRcdFx0eyBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudC5Ob25lLCBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQuTm9uZSB9IGFzIFBhcnRpYWw8SUNvbW1hbmRTZXJ2aWNlPiBhcyBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShbXSwgW10sIHtcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBpbnN0cnVjdGlvbkZpbGVzLFxuXHRcdFx0fSkgYXMgSVByb21wdHNTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlTW9ja1Rvb2xzU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgZmFsc2UsICdTaG91bGQgbm90IGJlIGV4Y2x1ZGVkIGFmdGVyIGluaXRpYWwgY2hlY2sgZmluZHMgbm8gZmlsZXMnKTtcblxuXHRcdGluc3RydWN0aW9uRmlsZXMgPSBbeyB1cmk6IFVSSS5maWxlKCcvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvY29kaW5nLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dO1xuXHRcdHRyYWNrZXIucmVmcmVzaFByb21wdEZpbGVFeGNsdXNpb25zKCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzRXhjbHVkZWQodGlwKSwgdHJ1ZSwgJ1Nob3VsZCBiZSBleGNsdWRlZCBhZnRlciByZWZyZXNoIGZpbmRzIGluc3RydWN0aW9uIGZpbGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHRocm93IHdoZW4gc3VibWl0dGVkIHdoaWxlIHN0b3JlZCBjb250ZXh0IGtleSBzZXJ2aWNlIGhhcyBiZWVuIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1Ym1pdFJlcXVlc3RFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0b25EaWRTdWJtaXRSZXF1ZXN0OiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5ldmVudCxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdC8vIEFjcXVpcmUgYSB0aXAgc28gdGhlIHNlcnZpY2Ugc3Rhc2hlcyB0aGUgKHNjb3BlZCkgY29udGV4dCBrZXkgc2VydmljZS5cblx0XHRjb25zdCB0aXAgPSBzZXJ2aWNlLmdldFdlbGNvbWVUaXAoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayh0aXApO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIG93bmluZyBjaGF0IHdpZGdldCBiZWluZyB0b3JuIGRvd24sIHdoaWNoIGRpc3Bvc2VzIGl0c1xuXHRcdC8vIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlLiBTdWJzZXF1ZW50IGNvbnRleHRNYXRjaGVzUnVsZXMgY2FsbHMgdGhlblxuXHRcdC8vIHRocm93IFwiQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZFwiLlxuXHRcdGNvbnN0IG9yaWdpbmFsQ29udGV4dE1hdGNoZXNSdWxlcyA9IGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMuYmluZChjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyA9ICgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHtcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24tZGlzcG9zZWQnKSxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBwYXJ0czogW10gfSxcblx0XHRcdH0pKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyA9IG9yaWdpbmFsQ29udGV4dE1hdGNoZXNSdWxlcztcblx0XHR9XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ0NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXInLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBzdG9yYWdlU2VydmljZTogSW5NZW1vcnlTdG9yYWdlU2VydmljZTtcblx0bGV0IGNvbnRleHRLZXlTZXJ2aWNlOiBNb2NrQ29udGV4dEtleVNlcnZpY2U7XG5cdGxldCBzdWJtaXRSZXF1ZXN0RW1pdHRlcjogRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9Pjtcblx0bGV0IHNlc3Npb25zOiBNYXA8c3RyaW5nLCB7IGxhc3RSZXF1ZXN0OiB7IG1lc3NhZ2U6IHsgdGV4dDogc3RyaW5nOyBwYXJ0czogcmVhZG9ubHkgeyBraW5kOiBzdHJpbmcgfVtdIH0gfSB8IHVuZGVmaW5lZCB9PjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgbWVzc2FnZT86IElQYXJzZWRDaGF0UmVxdWVzdCB9PigpKTtcblx0XHRzZXNzaW9ucyA9IG5ldyBNYXAoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0NoYXRTZXJ2aWNlRm9yVHJhY2tlcigpOiBJQ2hhdFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRvbkRpZFN1Ym1pdFJlcXVlc3Q6IHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbjogKHJlc291cmNlOiBVUkkpID0+IHNlc3Npb25zLmdldChyZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVUcmFja2VyKGNoYXRTZXJ2aWNlPzogSUNoYXRTZXJ2aWNlKTogQ3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlciB7XG5cdFx0cmV0dXJuIHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IENyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIoXG5cdFx0XHRjaGF0U2VydmljZSA/PyBjcmVhdGVNb2NrQ2hhdFNlcnZpY2VGb3JUcmFja2VyKCksXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdCgpID0+IGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgnc3luY0NvbnRleHRLZXkgc2V0cyBjb250ZXh0IGtleSB0byBmYWxzZSB3aGVuIHN0b3JhZ2UgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKENoYXRDb250ZXh0S2V5cy5oYXNVc2VkQ3JlYXRlU2xhc2hDb21tYW5kcy5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgZmFsc2UsICdDb250ZXh0IGtleSBzaG91bGQgYmUgZmFsc2Ugd2hlbiBubyBjcmVhdGUgY29tbWFuZHMgaGF2ZSBiZWVuIHVzZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc3luY0NvbnRleHRLZXkgc2V0cyBjb250ZXh0IGtleSB0byB0cnVlIHdoZW4gc3RvcmFnZSBoYXMgcmVjb3JkZWQgdXNhZ2UnLCAoKSA9PiB7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQudGlwcy51c2VkQ3JlYXRlU2xhc2hDb21tYW5kcycsIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCB0cmFja2VyID0gY3JlYXRlVHJhY2tlcigpO1xuXHRcdHRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoQ2hhdENvbnRleHRLZXlzLmhhc1VzZWRDcmVhdGVTbGFzaENvbW1hbmRzLmtleSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCB0cnVlLCAnQ29udGV4dCBrZXkgc2hvdWxkIGJlIHRydWUgd2hlbiBjcmVhdGUgY29tbWFuZHMgaGF2ZSBiZWVuIHVzZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBjcmVhdGUtaW5zdHJ1Y3Rpb25zIHNsYXNoIGNvbW1hbmQgdmlhIHRleHQgZmFsbGJhY2snLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb24xJyk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwge1xuXHRcdFx0bGFzdFJlcXVlc3Q6IHtcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICcvY3JlYXRlLWluc3RydWN0aW9ucyB0ZXN0Jyxcblx0XHRcdFx0XHRwYXJ0czogW10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKENoYXRDb250ZXh0S2V5cy5oYXNVc2VkQ3JlYXRlU2xhc2hDb21tYW5kcy5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgdHJ1ZSwgJ0NvbnRleHQga2V5IHNob3VsZCBiZSB0cnVlIGFmdGVyIC9jcmVhdGUtaW5zdHJ1Y3Rpb25zIGlzIHVzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdjaGF0LnRpcHMudXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSxcblx0XHRcdHRydWUsXG5cdFx0XHQnU3RvcmFnZSBzaG91bGQgcGVyc2lzdCB0aGUgY3JlYXRlIHNsYXNoIGNvbW1hbmQgdXNhZ2UnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdHMgY3JlYXRlLXByb21wdCBzbGFzaCBjb21tYW5kIHZpYSB0ZXh0IGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uMicpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHtcblx0XHRcdGxhc3RSZXF1ZXN0OiB7XG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnL2NyZWF0ZS1wcm9tcHQgbXktcHJvbXB0Jyxcblx0XHRcdFx0XHRwYXJ0czogW10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2NoYXQudGlwcy51c2VkQ3JlYXRlU2xhc2hDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCdTdG9yYWdlIHNob3VsZCBwZXJzaXN0IHRoZSBjcmVhdGUtcHJvbXB0IHVzYWdlJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIGNyZWF0ZS1hZ2VudCBzbGFzaCBjb21tYW5kIHZpYSBwYXJzZWQgcGFydCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbjMnKTtcblx0XHRjb25zdCB0cmFja2VyID0gY3JlYXRlVHJhY2tlcigpO1xuXHRcdHRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB7XG5cdFx0XHRsYXN0UmVxdWVzdDoge1xuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJy9jcmVhdGUtYWdlbnQgdGVzdCcsXG5cdFx0XHRcdFx0cGFydHM6IFtcblx0XHRcdFx0XHRcdG5ldyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQoXG5cdFx0XHRcdFx0XHRcdG5ldyBPZmZzZXRSYW5nZSgwLCAxMyksXG5cdFx0XHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxNCksXG5cdFx0XHRcdFx0XHRcdHsgY29tbWFuZDogJ2NyZWF0ZS1hZ2VudCcsIGRldGFpbDogJycsIGxvY2F0aW9uczogW10gfSxcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHsgY2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignY2hhdC50aXBzLnVzZWRDcmVhdGVTbGFzaENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSksXG5cdFx0XHR0cnVlLFxuXHRcdFx0J1N0b3JhZ2Ugc2hvdWxkIHBlcnNpc3Qgd2hlbiBjcmVhdGUtYWdlbnQgc2xhc2ggY29tbWFuZCBwYXJ0IGlzIGRldGVjdGVkJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIGNyZWF0ZSBjb21tYW5kIGZyb20gc3VibWl0dGVkIG1lc3NhZ2UgcGF5bG9hZCB3aGVuIHNlc3Npb24gaGFzIG5vIGxhc3QgcmVxdWVzdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6c2Vzc2lvbi1wYXlsb2FkJyk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoe1xuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0ZXh0OiAnL2NyZWF0ZS1wcm9tcHQgcGF5bG9hZC10ZXN0Jyxcblx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2NoYXQudGlwcy51c2VkQ3JlYXRlU2xhc2hDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCdTdG9yYWdlIHNob3VsZCBwZXJzaXN0IHVzYWdlIGRldGVjdGVkIGZyb20gc3VibWl0dGVkIG1lc3NhZ2UgcGF5bG9hZCcsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbWFyayB1c2VkIGZvciBub24tY3JlYXRlIHNsYXNoIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdDpzZXNzaW9uNCcpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBjcmVhdGVUcmFja2VyKCk7XG5cdFx0dHJhY2tlci5zeW5jQ29udGV4dEtleShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHtcblx0XHRcdGxhc3RSZXF1ZXN0OiB7XG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnL2hlbHAgdGVzdCcsXG5cdFx0XHRcdFx0cGFydHM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHN1Ym1pdFJlcXVlc3RFbWl0dGVyLmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShDaGF0Q29udGV4dEtleXMuaGFzVXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIGZhbHNlLCAnQ29udGV4dCBrZXkgc2hvdWxkIHJlbWFpbiBmYWxzZSBmb3Igbm9uLWNyZWF0ZSBzbGFzaCBjb21tYW5kcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBtYXJrIHVzZWQgd2hlbiBzZXNzaW9uIGhhcyBubyBsYXN0IHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb241Jyk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgeyBsYXN0UmVxdWVzdDogdW5kZWZpbmVkIH0pO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2NoYXQudGlwcy51c2VkQ3JlYXRlU2xhc2hDb21tYW5kcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnU2hvdWxkIG5vdCBtYXJrIHVzZWQgd2hlbiB0aGVyZSBpcyBubyBsYXN0IHJlcXVlc3QnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgbWFya3MgdXNlZCBvbmNlIGV2ZW4gd2l0aCBtdWx0aXBsZSBjcmVhdGUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OnNlc3Npb242Jyk7XG5cdFx0Y29uc3QgdHJhY2tlciA9IGNyZWF0ZVRyYWNrZXIoKTtcblx0XHR0cmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwge1xuXHRcdFx0bGFzdFJlcXVlc3Q6IHtcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnL2NyZWF0ZS1za2lsbCB0ZXN0JywgcGFydHM6IFtdIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c3VibWl0UmVxdWVzdEVtaXR0ZXIuZmlyZSh7IGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignY2hhdC50aXBzLnVzZWRDcmVhdGVTbGFzaENvbW1hbmRzJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSksIHRydWUpO1xuXG5cdFx0Ly8gRmlyZSBhZ2FpbiBcdTIwMTQgc2hvdWxkIGJlIGEgbm8tb3Bcblx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHtcblx0XHRcdGxhc3RSZXF1ZXN0OiB7XG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJy9jcmVhdGUtcHJvbXB0IHRlc3QnLCBwYXJ0czogW10gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzdWJtaXRSZXF1ZXN0RW1pdHRlci5maXJlKHsgY2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdjaGF0LnRpcHMudXNlZENyZWF0ZVNsYXNoQ29tbWFuZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBd0IsaUJBQWlCLHdCQUF3QjtBQUNqRSxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBK0IsMEJBQTBCO0FBQ3pELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUIsd0JBQXdCLGNBQWMscUJBQXFCO0FBQ3JGLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsc0NB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
